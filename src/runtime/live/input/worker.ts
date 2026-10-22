import { traceLatency } from "../latency-trace.ts";
import type { TmuxExec, VtInputPort } from "../tmux/types.ts";

// Hex arguments must fit tmux's command message, not only the OS argv limit.
const MAX_RAW_BYTES_PER_SEND = 512;
// A single tmux invocation may chain several send-keys commands with a literal ";"
// argv separator; cap the raw bytes it carries so the whole command message stays bounded.
const MAX_RAW_BYTES_PER_INVOCATION = 8 * 1024;
/** Bound queued plus in-flight input so a stalled tmux/socket cannot grow memory without limit. */
const MAX_PENDING_INPUT_BYTES = 64 * 1024;
const DISPOSE_DRAIN_TIMEOUT_MS = 2_000;

export type InputWorkerOptions = {
	readonly target: string;
	readonly vt?: VtInputPort | null;
};

export type WorkerTotals = {
	dispatches: number;
	forks: number;
	socketWrites: number;
	socketFallbacks: number;
	failed: number;
};

export type InputWorker = {
	readonly send: (bytes: Uint8Array) => void;
	readonly flush: () => Promise<void>;
	readonly dispose: () => Promise<void>;
	readonly stats: () => Readonly<WorkerTotals>;
	readonly onDispatch: (listener: (report: Readonly<WorkerTotals>, error?: Error) => void) => () => void;
};

/** One ordered writer for native-terminal bytes, with no key or paste re-encoding. */
export function createInputWorker(exec: TmuxExec, opts: InputWorkerOptions): InputWorker {
	const target = opts.target;
	const queue: Uint8Array[] = [];
	const listeners = new Set<(report: Readonly<WorkerTotals>, error?: Error) => void>();
	const totals: WorkerTotals = { dispatches: 0, forks: 0, socketWrites: 0, socketFallbacks: 0, failed: 0 };
	let draining: Promise<void> | undefined;
	let closed = false;
	let pendingBytes = 0;
	let disposing: Promise<void> | undefined;
	let shutdownFailure: Error | undefined;
	const dispatchController = new AbortController();

	const reportFailure = (error: Error, canceledBytes = 0): void => {
		const report: WorkerTotals = { dispatches: 0, forks: 0, socketWrites: 0, socketFallbacks: 0, failed: 1 };
		totals.failed++;
		for (const listener of listeners) listener(report, error);
		if (canceledBytes > 0) pendingBytes -= canceledBytes;
	};
	const cancelQueued = (reason: string): void => {
		if (queue.length === 0) return;
		const canceledBytes = queue.reduce((sum, bytes) => sum + bytes.length, 0);
		queue.length = 0;
		shutdownFailure = new Error(`Input transport canceled ${canceledBytes} queued bytes: ${reason}`);
		reportFailure(shutdownFailure, canceledBytes);
	};

	const dispatch = async (bytes: Uint8Array): Promise<void> => {
		const report: WorkerTotals = { dispatches: 1, forks: 0, socketWrites: 0, socketFallbacks: 0, failed: 0 };
		let failure: Error | undefined;
		traceLatency("worker-dispatch");
		try {
			if (opts.vt?.inputMode()) {
				if (opts.vt.trySendInput(bytes)) report.socketWrites++;
				else report.socketFallbacks++;
			}
			if (report.socketWrites === 0) {
				// Chunk argv, not logical input. Chain chunks into one tmux invocation with
				// a literal ";" argv separator so a paste costs one fork, not one per chunk.
				// Await every invocation before sending the next, including a paste's
				// closing bracket.
				let argv: string[] = [];
				let invocationBytes = 0;
				const flushInvocation = async (): Promise<void> => {
					if (argv.length === 0) return;
					if (closed) throw new Error("Input transport stopped before queued input was sent");
					report.forks++;
					const result = await exec.run(argv, { admissionSignal: dispatchController.signal });
					if (result.exitCode !== 0) throw new Error(result.stderr || `send-keys exited ${result.exitCode}`);
					argv = [];
					invocationBytes = 0;
				};
				for (let offset = 0; offset < bytes.length; offset += MAX_RAW_BYTES_PER_SEND) {
					const chunk = bytes.subarray(offset, offset + MAX_RAW_BYTES_PER_SEND);
					if (argv.length > 0 && invocationBytes + chunk.length > MAX_RAW_BYTES_PER_INVOCATION) {
						await flushInvocation();
					}
					if (argv.length > 0) argv.push(";");
					const hex = Array.from(chunk, (byte) => byte.toString(16).padStart(2, "0"));
					argv.push("send-keys", "-t", target, "-H", ...hex);
					invocationBytes += chunk.length;
				}
				await flushInvocation();
			}
		} catch (error) {
			// Host surfaces failed delivery; do not retry a possibly partially sent paste.
			failure = error instanceof Error ? error : new Error(String(error));
			if (!(closed && dispatchController.signal.aborted)) {
				if (closed) shutdownFailure ??= failure;
				report.failed++;
			} else failure = undefined;
		}
		pendingBytes -= bytes.length;
		totals.dispatches += report.dispatches;
		totals.forks += report.forks;
		totals.socketWrites += report.socketWrites;
		totals.socketFallbacks += report.socketFallbacks;
		totals.failed += report.failed;
		for (const listener of listeners) listener(report, failure);
	};
	const schedule = (): void => {
		if (draining || queue.length === 0) return;
		draining = Promise.resolve()
			.then(async () => {
				while (queue.length > 0) {
					const batch = queue.splice(0);
					await dispatch(batch.length === 1 && batch[0] ? batch[0] : Buffer.concat(batch));
				}
			})
			.finally(() => {
				draining = undefined;
				if (!closed) schedule();
			});
	};
	const flush = async (): Promise<void> => {
		while (draining) await draining;
	};
	return {
		send: (bytes) => {
			if (closed || bytes.length === 0) return;
			if (pendingBytes + bytes.length > MAX_PENDING_INPUT_BYTES) {
				const error = new Error(`Input transport overloaded: pending input exceeds ${MAX_PENDING_INPUT_BYTES} bytes`);
				const report: WorkerTotals = { dispatches: 0, forks: 0, socketWrites: 0, socketFallbacks: 0, failed: 1 };
				totals.failed++;
				for (const listener of listeners) listener(report, error);
				return;
			}
			// Native encoders may reuse their output memory on the next event.
			const copy = Uint8Array.from(bytes);
			pendingBytes += copy.length;
			queue.push(copy);
			schedule();
		},
		flush,
		dispose: () => {
			if (disposing) return disposing;
			closed = true;
			dispatchController.abort(new Error("Input transport disposed before delivery settled"));
			cancelQueued("worker disposed");
			disposing = (async () => {
				let timer: ReturnType<typeof setTimeout> | undefined;
				try {
					await Promise.race([
						flush(),
						new Promise<never>((_, reject) => {
							timer = setTimeout(
								() =>
									reject(
										new Error(
											`Input transport shutdown exceeded ${DISPOSE_DRAIN_TIMEOUT_MS}ms; in-flight delivery is uncertain`,
										),
									),
								DISPOSE_DRAIN_TIMEOUT_MS,
							);
						}),
					]);
					if (shutdownFailure) throw shutdownFailure;
				} catch (error) {
					reportFailure(error instanceof Error ? error : new Error(String(error)));
					throw error;
				} finally {
					clearTimeout(timer);
					listeners.clear();
				}
			})();
			return disposing;
		},
		stats: () => ({ ...totals }),
		onDispatch: (listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}
