import { closeSync, type FSWatcher, fstatSync, openSync, readSync, watch } from "node:fs";
import { dirname } from "node:path";
import type { TmuxServer } from "../session-process.ts";
import type { AgentHost } from "./agent-host.ts";
import { createInputWorker, type InputWorker } from "./input/worker.ts";
import type { TmuxExec } from "./tmux/types.ts";

// The fs.watch event drives prompt reads; the interval is a low-frequency backstop for
// platforms where fs.watch is lossy (macOS/Linux/Windows), not the primary trigger.
const BACKSTOP_POLL_MS = 2_000;

/** Observe an existing pane without replacing its capture pipe or taking host ownership. */
export function createExistingAgentHost(options: {
	server?: TmuxServer;
	exec?: TmuxExec;
	paneId: string;
	outputPath: string;
	readOnly?: boolean;
	onOutput(bytes: Uint8Array): void;
	onError(error: Error): void;
}): AgentHost & { alive(): Promise<boolean> } {
	let descriptor: number | undefined;
	let watcher: FSWatcher | undefined;
	let timer: ReturnType<typeof setInterval> | undefined;
	let captureContinuation: ReturnType<typeof setImmediate> | undefined;
	let worker: InputWorker | undefined;
	let offset = 0;
	let started = false;
	let resizeRequest: readonly [number, number] | undefined;
	let resizeRunning = false;
	let resizeOperation = Promise.resolve();
	let resizeCanceled: Error | undefined;
	let resizeController: AbortController | undefined;
	const buffer = Buffer.allocUnsafe(64 * 1024);
	const exec: TmuxExec = {
		run: async (argv, runOptions) => {
			const args = [...argv.slice(1)];
			const target = args.indexOf("-t");
			if (target >= 0) args[target + 1] = options.paneId;
			const at = performance.now();
			try {
				if (options.exec) return await options.exec.run([argv[0] ?? "", ...args], runOptions);
				if (!options.server) throw new Error("Existing agent host needs a tmux executor");
				const output = await options.server.cmd(argv[0] ?? "", args);
				return { exitCode: 0, stdout: output.join("\n"), stderr: "", durationMs: performance.now() - at };
			} catch (error) {
				return { exitCode: 1, stdout: "", stderr: String(error), durationMs: performance.now() - at };
			}
		},
	};
	const capture = (): void => {
		if (!started) return;
		try {
			descriptor ??= openSync(options.outputPath, "r");
			if (fstatSync(descriptor).size < offset) offset = 0;
			const count = readSync(descriptor, buffer, 0, buffer.length, offset);
			if (count > 0) {
				offset += count;
				options.onOutput(buffer.subarray(0, count));
				if (started && fstatSync(descriptor).size > offset && captureContinuation === undefined) {
					captureContinuation = setImmediate(() => {
						captureContinuation = undefined;
						capture();
					});
				}
			}
		} catch (error) {
			if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
			options.onError(error instanceof Error ? error : new Error(String(error)));
		}
	};
	const stop = async (): Promise<void> => {
		started = false;
		resizeController?.abort(new Error("Existing agent host stopped before resize dispatch"));
		if (resizeRequest) {
			resizeRequest = undefined;
			resizeCanceled = new Error("Pending resize was canceled by host stop");
		}
		watcher?.close();
		watcher = undefined;
		clearInterval(timer);
		timer = undefined;
		if (captureContinuation !== undefined) clearImmediate(captureContinuation);
		captureContinuation = undefined;
		const failures: unknown[] = [];
		try {
			if (descriptor !== undefined) closeSync(descriptor);
		} catch (error) {
			failures.push(error);
		}
		descriptor = undefined;
		const input = worker;
		worker = undefined;
		try {
			await input?.dispose();
		} catch (error) {
			failures.push(error);
		}
		if (failures.length > 0) throw new AggregateError(failures, "Could not fully stop existing agent transport");
	};
	const alive = async (): Promise<boolean> => {
		const result = await exec.run(["display-message", "-p", "-t", options.paneId, "#{pane_dead}"]);
		return result.exitCode === 0 && result.stdout.trim() === "0";
	};
	return {
		alive,
		start: async () => {
			if (!options.readOnly && !options.exec)
				throw new Error("Writable session attachment requires a cancellable tmux executor");
			if (started) return;
			if (!(await alive())) throw new Error("Selected session is no longer running.");
			resizeCanceled = undefined;
			started = true;
			try {
				// Start every observer at the real current screen, not an entire historical transcript.
				// Save the log EOF first, then read only subsequent appends; those bytes can overlap the snapshot.
				try {
					descriptor = openSync(options.outputPath, "r");
					offset = fstatSync(descriptor).size;
				} catch (error) {
					if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
				}
				const snapshot = await exec.run(["capture-pane", "-p", "-e", "-t", options.paneId]);
				if (snapshot.exitCode !== 0) throw new Error(snapshot.stderr);
				options.onOutput(new TextEncoder().encode(`\x1b[2J\x1b[H${snapshot.stdout.replaceAll("\n", "\r\n")}`));
				if (!options.readOnly) {
					worker = createInputWorker(exec, { sessionName: "external" });
					worker.onDispatch((_report, error) => {
						if (error) options.onError(error);
					});
				}
				watcher = watch(dirname(options.outputPath), capture);
				watcher.on("error", (error) => options.onError(error));
				timer = setInterval(capture, BACKSTOP_POLL_MS);
				capture();
			} catch (error) {
				const failures: unknown[] = [error];
				try {
					await stop();
				} catch (stopError) {
					failures.push(stopError);
				}
				if (failures.length === 1) throw error;
				throw new AggregateError(failures, "Existing host startup and cleanup failed");
			}
		},
		stop,
		detach: async () => {
			await stop();
			return "retained";
		},
		resize: (columns, rows) => {
			if (!options.exec) throw new Error("Resizing an existing session requires a cancellable tmux executor");
			if (!started) return Promise.resolve();
			resizeRequest = [columns, rows];
			if (resizeRunning) return resizeOperation;
			resizeRunning = true;
			resizeController = new AbortController();
			const operation = (async () => {
				let failure: unknown;
				while (resizeRequest && started) {
					const [requestedColumns, requestedRows] = resizeRequest;
					resizeRequest = undefined;
					const dimensions = ["-x", String(requestedColumns), "-y", String(requestedRows)];
					try {
						const window = await exec.run(["resize-window", "-t", options.paneId, ...dimensions], {
							signal: resizeController?.signal,
						});
						if (window.exitCode !== 0) throw new Error(window.stderr);
						if (!started) throw new Error("Resize stopped before pane dimensions were applied");
						const pane = await exec.run(["resize-pane", "-t", options.paneId, ...dimensions], {
							signal: resizeController?.signal,
						});
						if (pane.exitCode !== 0) throw new Error(pane.stderr);
					} catch (error) {
						failure ??= error;
					}
				}
				resizeRunning = false;
				if (failure ?? resizeCanceled) throw failure ?? resizeCanceled;
			})();
			resizeOperation = operation;
			return operation;
		},
		sendBytes: (bytes) => worker?.send(bytes),
		flushInput: async () => {
			await worker?.flush();
		},
		inputStats: () => worker?.stats(),
		inputTransport: () => ({
			transport: "send-keys-fork",
			detail: options.readOnly ? "read-only existing host preview" : "attached CLI session; existing capture log",
		}),
	};
}
