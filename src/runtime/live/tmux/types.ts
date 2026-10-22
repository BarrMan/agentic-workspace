/** Shared contracts for live-agent tmux transport. */

/** Result of one tmux invocation. Spec §4.8 — one wall-clock budget per logical operation. */
export type TmuxResult = {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
	/** Wall-clock ms actually spent in this call. Spec §0 baseline measures this. */
	readonly durationMs: number;
};

/** Spec §4.8: TMUX_COMMAND_TIMEOUT = 10s (`src/tmux/mod.rs:287`). */
export const TMUX_COMMAND_TIMEOUT_MS = 10_000;

/** Every transport invocation is awaited and bounded by one timeout. */
export type TmuxExec = {
	/** Awaited form, bounded by TMUX_COMMAND_TIMEOUT_MS. Never called on a paint path. */
	readonly run: (
		argv: readonly string[],
		options?: { readonly signal?: AbortSignal; readonly admissionSignal?: AbortSignal },
	) => Promise<TmuxResult>;
};

/**
 * Spec §4.4: the zero-fork input fast path, as an injectable port so the worker never
 * imports the VT transport module directly and the fast path stays testable without one.
 *
 * Mirrors `crate::tmux::vt::input_mode` (`vt.rs:666`) and `try_send_input` (`vt.rs:674`).
 *
 * SINGLE-WRITER INVARIANT (`live_send.rs:6-11`): "a live input channel is a single-writer
 * signal: two writers would interleave on one pty input stream, so nothing goes through
 * send-keys while it exists." One armed channel per SESSION, enforced by the worker.
 */
export type VtInputPort = {
	/**
	 * True ONLY while the forwarder is connected and pane input is wired, which is what
	 * makes the channel armed. False means unavailable or disconnected input, so
	 * callers use the ordered send-keys fallback.
	 */
	readonly inputMode: () => boolean;
	/** False means not armed, or the forwarder died between the check and the write. */
	readonly trySendInput: (bytes: Uint8Array) => boolean;
};
