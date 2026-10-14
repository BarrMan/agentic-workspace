/** Bounded tmux execution against a named server label ("default" is the shared default server). */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TmuxExec, TmuxResult } from "./types.ts";
import { TMUX_COMMAND_TIMEOUT_MS } from "./types.ts";

const TMUX_BIN = "tmux";

/** Per-construction overrides. */
export type TmuxExecOptions = {
	/**
	 * tmux `-L` server label. `"default"` targets the developer's default server, which is the one
	 * server every workspace agent session lives on. Pinning `-L` outranks `$TMUX`, so a workspace
	 * launched from inside another tmux client still reaches the same server.
	 */
	readonly socketName: string;
	/** Optional environment snapshot; omitted executors continue to observe process.env at dispatch. */
	readonly environment?: NodeJS.ProcessEnv;
	/** Override the 10 s budget. Spec §4.8 — one wall-clock budget per operation. */
	readonly timeoutMs?: number;
	/** Observability hook; fires with the subcommand argv before each spawn. */
	readonly onCommand?: (argv: readonly string[]) => void;
};

/**
 * A reusable pair of capture files. One slot owns exactly one `out`/`err` file pair in the pool's
 * base directory; a slot is checked out for the duration of one `run` and returned afterwards.
 */
type CaptureSlot = {
	readonly outPath: string;
	readonly errPath: string;
};

type CaptureWaiter = {
	readonly resolve: (slot: CaptureSlot) => void;
	readonly reject: (error: Error) => void;
	readonly signal?: AbortSignal;
	onAbort?: () => void;
};

const abortError = (signal: AbortSignal): Error =>
	signal.reason instanceof Error ? signal.reason : new DOMException("The operation was aborted", "AbortError");

/** Base slots pre-created on first use — matches the few callers that overlap (heartbeat + probe). */
const POOL_BASE_SLOTS = 4;

/**
 * Hard ceiling; past it callers queue instead of allocating more files. Steady state never grows
 * beyond the base because a slot is returned to the idle list as soon as its spawn completes.
 */
const POOL_MAX_SLOTS = 32;

/** Read a capture file; a missing/unreadable capture is empty output, never a throw. */
const readCapture = (path: string): string => {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return "";
	}
};

/**
 * Process-wide pool of capture slots.
 *
 * A previous design created and deleted a `mkdtemp` directory on every call, so each tmux fork paid
 * a temp-dir create+delete. That is pure overhead: the files only need to be *distinct* per active
 * call and *empty* at the start of that call, not fresh. So one base directory is created lazily
 * for the whole process and its slots are recycled.
 *
 * The pool is shared, not per-`TmuxExec`: several call sites build a throwaway `createTmuxExec`
 * per probe (e.g. a liveness check), and a per-instance pool would leak one base directory and one
 * `exit` listener each time. Sharing keeps the directory count and listener count at exactly one.
 *
 * Distinctness under concurrency is the whole point: overlapping `run` calls must never target the
 * same `out`/`err` files. {@link acquire} hands out an idle slot or a newly grown one, and only
 * queues once the cap is reached; {@link release} hands the slot straight to a waiter or parks it.
 */
class CaptureSlotPool {
	/** Created on first {@link acquire}, never per call, and removed once at process exit. */
	private baseDir: string | undefined;
	private readonly idle: CaptureSlot[] = [];
	private readonly waiters: CaptureWaiter[] = [];
	private created = 0;

	/**
	 * Create the one base directory, pre-fill the base slots, and register a best-effort exit
	 * cleanup. Registered with `process.on`, not a timer, so it can never hold the process open;
	 * the handler swallows its own failure so an exit-time rm cannot turn into a crash.
	 */
	private ensureBaseDir(): string {
		if (this.baseDir !== undefined) return this.baseDir;
		const dir = mkdtempSync(join(tmpdir(), "agentic-workspace-tmux-"));
		this.baseDir = dir;
		process.on("exit", () => {
			try {
				rmSync(dir, { recursive: true, force: true });
			} catch {
				// Best-effort only: the OS reaps tmpdir content eventually.
			}
		});
		for (let i = 0; i < POOL_BASE_SLOTS; i += 1) {
			this.idle.push(this.allocateSlot(dir));
		}
		return dir;
	}

	/**
	 * Mint one slot's paths and truncate them. `run` truncates again before every spawn, but doing
	 * it here too means a queued waiter receives an already-empty slot with no extra syscall later.
	 */
	private allocateSlot(dir: string): CaptureSlot {
		const index = this.created;
		this.created += 1;
		const slot: CaptureSlot = {
			outPath: join(dir, `out-${index}`),
			errPath: join(dir, `err-${index}`),
		};
		writeFileSync(slot.outPath, "");
		writeFileSync(slot.errPath, "");
		return slot;
	}

	/** Idle slot, else grow lazily, else wait for a {@link release}. */
	async acquire(signal?: AbortSignal): Promise<CaptureSlot> {
		if (signal?.aborted) throw abortError(signal);
		const dir = this.ensureBaseDir();
		const existing = this.idle.pop();
		if (existing !== undefined) return existing;
		if (this.created < POOL_MAX_SLOTS) return this.allocateSlot(dir);
		return new Promise<CaptureSlot>((resolve, reject) => {
			const waiter: CaptureWaiter = { resolve, reject, signal };
			if (signal) {
				waiter.onAbort = () => {
					const index = this.waiters.indexOf(waiter);
					if (index < 0) return;
					this.waiters.splice(index, 1);
					const onAbort = waiter.onAbort;
					if (onAbort) signal.removeEventListener("abort", onAbort);
					reject(abortError(signal));
				};
				signal.addEventListener("abort", waiter.onAbort, { once: true });
			}
			this.waiters.push(waiter);
		});
	}

	/** Hand the slot to the oldest waiter, or park it. A released slot is never read again. */
	release(slot: CaptureSlot): void {
		let waiter = this.waiters.shift();
		while (waiter !== undefined) {
			if (waiter.onAbort) waiter.signal?.removeEventListener("abort", waiter.onAbort);
			if (waiter.signal?.aborted) {
				waiter.reject(abortError(waiter.signal));
				waiter = this.waiters.shift();
				continue;
			}
			waiter.resolve(slot);
			return;
		}
		this.idle.push(slot);
	}
}

/** One base directory and one exit handler for the whole process, however many execs are built. */
const captureSlots = new CaptureSlotPool();

/**
 * Capture to separate files so descendants retaining stdout/stderr cannot delay completion. The
 * caller owns the slot for the duration; this function reads then returns it. One timeout budget.
 */
const spawnTmux = async (
	slot: CaptureSlot,
	socketName: string,
	args: readonly string[],
	timeoutMs: number,
	signal?: AbortSignal,
	environment?: NodeJS.ProcessEnv,
): Promise<TmuxResult> => {
	const { outPath, errPath } = slot;
	const started = performance.now();
	let killTimer: ReturnType<typeof setTimeout> | undefined;
	let abortListener: (() => void) | undefined;
	try {
		if (signal?.aborted) throw abortError(signal);
		// Truncate before every spawn. `Bun.file`'s stdout sink opens the path for writing, but an
		// explicit truncate guarantees a short result can never be padded by a longer previous one.
		writeFileSync(outPath, "");
		writeFileSync(errPath, "");
		const child = Bun.spawn([TMUX_BIN, "-L", socketName, ...args], {
			// Never let a transport command consume workspace input.
			stdin: "ignore",
			stdout: Bun.file(outPath),
			stderr: Bun.file(errPath),
			// `-L` already outranks `$TMUX`, but clearing it means an inherited client can never
			// misroute a transport command at another server.
			env: { ...(environment ?? process.env), TMUX: "" },
		});
		let timedOut = false;
		let aborted = false;
		abortListener = () => {
			aborted = true;
			child.kill("SIGKILL");
		};
		signal?.addEventListener("abort", abortListener, { once: true });
		if (signal?.aborted) abortListener();
		killTimer = setTimeout(() => {
			timedOut = true;
			child.kill("SIGKILL");
		}, timeoutMs);
		const exitCode = await child.exited;
		return {
			exitCode: timedOut ? exitCode || 124 : exitCode,
			stdout: readCapture(outPath),
			stderr: aborted
				? `tmux command cancelled after dispatch; outcome is uncertain (argv: ${TMUX_BIN} -L ${socketName} ${args.join(" ")})`
				: timedOut
					? `tmux timed out after ${timeoutMs}ms and was killed (argv: ${TMUX_BIN} -L ${socketName} ${args.join(" ")})`
					: readCapture(errPath),
			durationMs: performance.now() - started,
		};
	} catch (error) {
		return {
			exitCode: 127,
			stdout: readCapture(outPath),
			stderr: `tmux spawn failed: ${error instanceof Error ? error.message : String(error)}`,
			durationMs: performance.now() - started,
		};
	} finally {
		clearTimeout(killTimer);
		if (signal && abortListener) signal.removeEventListener("abort", abortListener);
	}
};

/** Expose only awaited execution against the pinned server label. */
export const createTmuxExec = (opts: TmuxExecOptions): TmuxExec => {
	const { socketName } = opts;
	const timeoutMs = opts.timeoutMs ?? TMUX_COMMAND_TIMEOUT_MS;
	return {
		run: async (args, runOptions) => {
			const signal = runOptions?.signal;
			const admissionSignal = runOptions?.admissionSignal ?? signal;
			if (admissionSignal?.aborted) throw abortError(admissionSignal);
			const slot = await captureSlots.acquire(admissionSignal);
			try {
				if (admissionSignal?.aborted) throw abortError(admissionSignal);
				opts.onCommand?.(args);
				if (admissionSignal?.aborted) throw abortError(admissionSignal);
				return await spawnTmux(slot, socketName, args, timeoutMs, signal, opts.environment);
			} finally {
				captureSlots.release(slot);
			}
		},
	};
};
