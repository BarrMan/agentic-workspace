/**
 * Raw terminal transport — spec §6 "Preview transport".
 *
 * Implements AoE's `src/tmux/vt.rs`:
 *   - the hidden re-exec forwarder subcommand (§6, `vt.rs:364-399` `run_pipe`)
 *   - arming via `pipe-pane` (§6, `vt.rs:2099-2108`)
 *   - the cross-process exclusive lease (§6, `session.rs:51-55`)
 *   - "every arming failure path logs and returns `None` -> capture fallback"
 *     (`vt.rs:2110-2115`, `:2130-2136`, `:2168-2179`, `:2181-2192`)
 *
 * ---------------------------------------------------------------------------
 * WHAT WAS VERIFIED ON THIS MACHINE (tmux 3.7c, macOS arm64), versus what the
 * reference doc assumes. Read this before trusting any of it elsewhere.
 *
 * 1. `pipe-pane -IO` IS BIDIRECTIONAL ON 3.7c. The spec says flags are "-IO on
 *    tmux 3.8+ else -O" (`vt.rs:2106-2107`), implying older tmux cannot carry
 *    input back. That is WRONG for 3.7c: `-I` and `-O` have been independent
 *    since well before 3.8 (tmux 1.x). Proved end-to-end — a marker written to
 *    the forwarder's stdout appeared on the pane screen via `capture-pane`.
 *    Consequence: AoE is being conservative, or gating on a tmux build that
 *    genuinely lacked it. Either way, this prototype feature-DETECTS instead of
 *    version-gating, so it uses input on 3.7c where it works.
 *
 * 2. THE FD DIRECTIONS ARE THE OPPOSITE OF THE OBVIOUS READING, and getting them
 *    backwards yields a channel that looks alive but silently eats keystrokes.
 *    From `man tmux` and confirmed by lsof on the live forwarder:
 *        `-O` = pane output -> the command's STDIN  (fd 0)  => READ fd 0
 *        `-I` = the command's STDOUT -> pane input         => WRITE fd 1
 *    Both fds are the SAME duplex unix socket. Verified: `os.write(1, marker)`
 *    reached the pane; `os.write(0, marker)` did not.
 *
 * 3. `pipe-pane` CAN attach to an existing pane. It forwards subsequent bytes;
 *    bytes emitted before attachment cannot be recovered (seed with capture-pane).

 * 4. tmux RUNS `%` FORMAT SUBSTITUTION ON THE PIPE COMMAND STRING. The man
 *    page: the string "may contain the special character sequences supported
 *    by the status-left option". So any bare `%` in a pipe-pane command is
 *    silently rewritten before the shell sees it. Verified: `echo PCT_%s_TEST`
 *    renders as `PCT_1791111022_TEST`, and `%S` renders as `23`. A command
 *    containing `printf '%s'` therefore never reaches `printf` intact, and the
 *    pane shows a number instead. CONSEQUENCE: no pipe-pane command in this
 *    module may contain `%`. See `probeInputPath`.

 * 5. THE WORKSPACE IS THE SOCKET SERVER, THE FORWARDER IS THE CLIENT. The forwarder is
 *    spawned BY `pipe-pane`, so it cannot dial a listener that does not exist
 *    yet. Startup order is therefore strictly bind -> arm -> await dial-in.
 *    Both halves of that mistake are silent: awaiting the dial-in first
 *    deadlocks until timeout, and binding after arming loses the connection to
 *    the race. See `bindForwarderSocket`.

 * ---------------------------------------------------------------------------
 *
 * AgenticWorkspace's CLI routes `__vt-pipe` before loading normal CLI registration.
 * The same command works through Bun source execution and a compiled binary.
 */

import { existsSync, mkdtempSync, rmSync, writeSync } from "node:fs";
import { connect, createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ActivityMetadata } from "../../../model/session/types.ts";
import { isMissingTmuxTarget } from "./missing-target.ts";
import type { TmuxExec, VtInputPort } from "./types.ts";
import { TMUX_COMMAND_TIMEOUT_MS } from "./types.ts";

// ---------------------------------------------------------------------------
// tmux option names — spec §2.4: "tmux options are leases, never status storage".
// `session.rs:51-55`.
// ---------------------------------------------------------------------------

/** `@aoe_vt_owner` — identity of the process that armed the pipe. */
const VT_OWNER_OPT = "@aoe_vt_owner";
/** `@aoe_vt_owner_hb` — heartbeat stamp; a stale one means the owner died. */
const VT_OWNER_HB_OPT = "@aoe_vt_owner_hb";
/** `@aoe_vt_pipe_owner` — "pipe-pane is exclusive per pane" (`session.rs:52`). */
const VT_PIPE_OWNER_OPT = "@aoe_vt_pipe_owner";

/**
 * Lease tick cadence and staleness window.
 *
 * These two constants are THE idle cost of the VT transport, so they are
 * measured, not guessed. The tick is no longer a bare lease write: it is ONE
 * tmux invocation that both reads the pane's liveness (`#{pane_dead}` and
 * `#{window_activity}`) and stamps the lease, chained with a literal `;` argv
 * separator. Fusing them means the periodic activity read the workspace needs
 * costs no additional fork, and the lease write no longer exists on its own.
 *
 * The window is 3.5x the cadence, so two consecutive missed beats are still
 * tolerated before another process may take the lease over. AoE's exact
 * constants were not in the reference doc, so these are prototype-local.
 */
const VT_HEARTBEAT_MS = 1_000;
/** A heartbeat older than this means the owner is gone. */
const VT_HEARTBEAT_STALE_MS = 3_500;
const __KEEP_MAX___KEEP_VT_INPUT_AGENTIC_WORKSPACE___BYTES__ = 64 * 1024;
const VT_SHUTDOWN_TIMEOUT_MS = 2_000;

/** Tmux 3.8 is where AoE starts using `-IO`; we detect rather than gate. */
const IO_SUPPORTED_SINCE = [3, 8] as const;

// ---------------------------------------------------------------------------
// Argv builders shared by arming, lease maintenance, and teardown.
// ---------------------------------------------------------------------------

type PipeFlags = {
	readonly o: boolean;
	readonly i: boolean;
	readonly oPipe: boolean;
};

const buildPipePaneArgv = (target: string, command: string, flags: PipeFlags): readonly string[] => [
	"pipe-pane",
	...(flags.oPipe ? ["-o"] : []),
	...(flags.o ? ["-O"] : []),
	...(flags.i ? ["-I"] : []),
	"-t",
	target,
	command,
];

const buildSetOptionArgv = (target: string, name: string, value: string): readonly string[] => [
	"set-option",
	"-t",
	target,
	name,
	value,
];

const buildShowOptionArgv = (target: string, name: string): readonly string[] => [
	"show-options",
	"-v",
	"-t",
	target,
	name,
];

const buildUnsetOptionArgv = (target: string, name: string): readonly string[] => [
	"set-option",
	"-u",
	"-t",
	target,
	name,
];

/** Single-quote for `/bin/sh -c`, which is what tmux runs the pipe command with. */
const shQuote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

/** Re-exec the public CLI without importing a source-only module from a bundle. */
const buildForwarderCommand = (exePath: string, socketPath: string): string => {
	const source = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "cli", "index.ts");
	const args = [
		exePath,
		...(existsSync(source) && !source.includes("$bunfs") ? [source] : []),
		"__vt-pipe",
		socketPath,
	];
	return args.map(shQuote).join(" ");
};

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

type VtLog = (message: string) => void;

type VtChannelOptions = {
	/**
	 * tmux `-L` server label. `"default"` for the shared default server every workspace agent
	 * session lives on; never a private per-launch server.
	 */
	readonly socketName: string;
	readonly exec: TmuxExec;
	/** Exact tmux pane id (for example `%12`), not a session/window selector. */
	readonly paneId: string;
	/** Receive original pane bytes; the embedded terminal owns parsing and rendering. */
	readonly onOutput: (bytes: Uint8Array) => void;
	/** Grid size to emulate; should track the pane's real size. */
	readonly cols?: number;
	readonly rows?: number;
	/** Path to this module's re-exec entry; injected so tests need no real exe. */
	readonly forwarderExe?: string;
	/** Master process identity stamped into the lease. */
	readonly ownerId?: string;
	/** Absolute path for the forwarder's unix socket; injected per test. */
	readonly socketPath?: string;
	readonly now?: () => number;
	readonly log?: VtLog;
	readonly onError?: (error: Error) => void;
	readonly onDisconnect?: (error?: Error) => void;
};

export type VtChannel = VtInputPort & {
	readonly dispose: () => Promise<void>;
	/**
	 * Latest liveness/activity metadata read by the fused lease tick, or undefined before the first
	 * tick (or after a failed one). The workspace probe reads this instead of forking its own
	 * `display-message` against an owned pane.
	 */
	readonly activity: () => ActivityMetadata | undefined;
};

// ---------------------------------------------------------------------------
// tmux version / capability detection — spec §6 (`vt.rs:2106-2107`)
// ---------------------------------------------------------------------------

type TmuxVersion = {
	readonly major: number;
	readonly minor: number;
	readonly patch: number;
	readonly raw: string;
};

type VtCapabilities = {
	readonly version: TmuxVersion;
	/** tmux >= 3.8, i.e. what AoE assumes before using `-IO`. */
	readonly aoeWouldUseIO: boolean;
	/**
	 * Whether pane input over the socket ACTUALLY works here. Determined
	 * functionally, not by version — see the module header, finding (1).
	 */
	readonly inputAvailable: boolean;
	/** Flags to pass to `pipe-pane` on this tmux. */
	readonly pipeFlags: PipeFlags;
	readonly probeDetail: string;
};

const parseTmuxVersion = (raw: string): TmuxVersion => {
	const m = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(raw);
	return {
		major: m?.[1] === undefined ? 0 : Number(m[1]),
		minor: m?.[2] === undefined ? 0 : Number(m[2]),
		patch: m?.[3] === undefined ? 0 : Number(m[3]),
		raw: raw.trim(),
	};
};

const atLeast = (v: TmuxVersion, major: number, minor: number): boolean =>
	v.major > major || (v.major === major && v.minor >= minor);

/** Bounded retry budget for the functional `-I` probe. See `probeInputPath`. */
const PROBE_ATTEMPTS = 6;
const PROBE_INTERVAL_MS = 100;

/**
 * Functional `-I` probe: arm `pipe-pane -I` on a throwaway pane with a command
 * that drains stdin (so `sh` does not consume it) and prints a marker to stdout,
 * then read the pane back. If the marker is on screen, cmd-stdout reaches the
 * pane and the zero-fork input path exists.
 *
 * The drain matters: an earlier revision used `sleep 1; printf ...`, and `sleep`
 * never read fd 0, so tmux's socket buffer filled and nothing reached the pane —
 * a false negative that would have silently disabled the fast path.
 */
const probeInputPath = async (
	opts: Pick<VtChannelOptions, "socketName" | "exec" | "now">,
	log: VtLog,
): Promise<boolean> => {
	const stamp = opts.now?.() ?? 0;
	const session = `vtprobe_${process.pid}_${stamp}`;
	const target = session;
	const marker = `__VTPROBE_${process.pid}_${stamp}__`;
	// THREE traps here. Each one made an earlier revision report a false
	// negative on a machine where `-I` works perfectly.
	//
	//  1. tmux runs `%` FORMAT SUBSTITUTION on the pipe-pane command string.
	//     The man page says so: the string "may contain the special character
	//     sequences supported by the status-left option". So `printf '%s\n' M`
	//     never reaches the shell as written — the `%s` is replaced with an
	//     epoch number and the pane shows a number instead of the marker.
	//     Verified directly: `echo PCT_%s_TEST` renders as `PCT_1791111022_TEST`,
	//     and `%S` renders as `23`. Any bare `%` in the command is corrupted.
	//  2. `cat > /dev/null &` is load-bearing — without something draining fd 0
	//     the socket buffer fills and nothing reaches the pane. The separator
	//     after `&` must be a NEWLINE; `cmd &; cmd` is a shell syntax error.
	//  3. `echo` is used, not `printf`, because it needs no format string and so
	//     sidesteps trap 1 completely.
	// The marker is word-only, so it can never itself contain a `%`.
	const script = `cat > /dev/null &
echo ${shQuote(marker)}`;
	try {
		const created = await opts.exec.run(["new-session", "-d", "-s", session, "-x", "80", "-y", "24"]);
		if (created.exitCode !== 0) return false;
		const armed = await opts.exec.run(
			buildPipePaneArgv(target, script, {
				o: false,
				i: true,
				oPipe: false,
			}),
		);
		if (armed.exitCode !== 0) return false;

		// POLL, do not sleep once. The pane shell redraws its prompt over the
		// echoed marker, so a single late read misses it; and a single early
		// read races the shell's own first paint. The marker is only reliably
		// observable in the window right after tmux spawns the pipe command.
		// Retrying is bounded, so this cannot hang arming.
		for (let attempt = 0; attempt < PROBE_ATTEMPTS; attempt++) {
			const pane = await opts.exec.run(["capture-pane", "-p", "-t", target]);
			if (pane.stdout.includes(marker)) {
				log("vt: input probe: pane input available");
				return true;
			}
			await Bun.sleep(PROBE_INTERVAL_MS);
		}
		log("vt: input probe: pane input unavailable");
		return false;
	} catch (error) {
		log(`vt: input probe threw: ${errorText(error)}`);
		return false;
	} finally {
		await opts.exec.run(["kill-session", "-t", session]);
	}
};

/**
 * Resolve version and capabilities once per process. The probe costs two
 * sessions and ~300 ms, which is exactly why it is memoised: arming happens
 * off-cycle (`pending_vt_arm`, `live_send.rs:1443-1449`) but must stay cheap.
 */
const capabilityCache = new Map<string, Promise<VtCapabilities>>();

const detectVtCapabilities = (
	opts: Pick<VtChannelOptions, "socketName" | "exec" | "now">,
	log: VtLog = () => {},
): Promise<VtCapabilities> => {
	const cached = capabilityCache.get(opts.socketName);
	if (cached !== undefined) return cached;
	const pending = (async (): Promise<VtCapabilities> => {
		const raw = await opts.exec.run(["-V"]);
		const version = parseTmuxVersion(raw.stdout.length > 0 ? raw.stdout : raw.stderr);
		const aoeWouldUseIO = atLeast(version, IO_SUPPORTED_SINCE[0], IO_SUPPORTED_SINCE[1]);
		const inputAvailable = await probeInputPath(opts, log);
		const detail =
			`tmux ${version.raw}; aoe-IO-gate=${aoeWouldUseIO ? "3.8+" : "below"}; ` +
			`inputAvailable=${inputAvailable ? "yes" : "no"}`;
		log(`vt: ${detail}`);
		return {
			version,
			aoeWouldUseIO,
			inputAvailable,
			// `-O` always: without it we get no output stream and no channel at all.
			pipeFlags: { o: true, i: inputAvailable, oPipe: false },
			probeDetail: detail,
		};
	})();
	capabilityCache.set(opts.socketName, pending);
	return pending;
};

// ---------------------------------------------------------------------------
// The lease — spec §6, `session.rs:51-55`.
// "pipe-pane is exclusive per pane, so only the holder pipes and everyone else
//  stays on capture-pane".
// ---------------------------------------------------------------------------

type LeaseVerdict =
	| { readonly kind: "Claimed" }
	| { readonly kind: "Held"; readonly owner: string; readonly heartbeat: number }
	/** Holder exists but its heartbeat went stale; safe to take over. */
	| { readonly kind: "Stale"; readonly owner: string; readonly heartbeat: number };

const readOption = async (opts: Pick<VtChannelOptions, "exec" | "paneId">, name: string): Promise<string | null> => {
	const res = await opts.exec.run(buildShowOptionArgv(opts.paneId, name));
	if (res.exitCode !== 0) return null;
	const v = res.stdout.replace(/\n$/, "");
	return v.length === 0 ? null : v;
};

/**
 * Attempt to become the exclusive pipe owner. Returns `Claimed` only if we
 * hold it afterwards; a racing second armer sees `Held` and must defer.
 *
 * This is a check-then-set, not an atomic CAS — tmux exposes no compare-and-set
 * for options. The window is one round-trip wide, and the loser re-verifies via
 * the heartbeat we stamp: whoever wrote last owns it, and both processes then
 * see the SAME winner, so they agree without arbitration. Both run the same
 * re-read, so the "fight" is bounded to one extra call per contender.
 */
const claimPipeLease = async (opts: VtChannelOptions, target: string): Promise<LeaseVerdict> => {
	const lock = `awvt-lease-${target.replaceAll(/[^a-zA-Z0-9_-]/g, "_")}`;
	await opts.exec.run(["wait-for", "-L", lock]);
	try {
		const owner = opts.ownerId ?? `pid:${process.pid}`;
		const now = opts.now?.() ?? Date.now();

		const existingOwner = await readOption(opts, VT_PIPE_OWNER_OPT);
		if (existingOwner !== null && existingOwner !== owner) {
			const hbRaw = await readOption(opts, VT_OWNER_HB_OPT);
			const hb = hbRaw === null ? 0 : Number(hbRaw);
			if (Number.isFinite(hb) && now - hb < VT_HEARTBEAT_STALE_MS) {
				return { kind: "Held", owner: existingOwner, heartbeat: hb };
			}
			// Stale: the owner died. Log and take over, exactly as AoE's stale path.
			(opts.log ?? (() => {}))(`vt: previous pipe owner ${existingOwner} is stale (hb ${hb}); taking over`);
		}

		await opts.exec.run(buildSetOptionArgv(target, VT_PIPE_OWNER_OPT, owner));
		await opts.exec.run(buildSetOptionArgv(target, VT_OWNER_OPT, owner));
		await opts.exec.run(buildSetOptionArgv(target, VT_OWNER_HB_OPT, String(now)));

		// Re-read: whoever's value survived is the winner both contenders agree on.
		const settled = await readOption(opts, VT_PIPE_OWNER_OPT);
		if (settled === owner) return { kind: "Claimed" };
		return {
			kind: "Held",
			owner: settled ?? "unknown",
			heartbeat: now,
		};
	} finally {
		await opts.exec.run(["wait-for", "-U", lock]);
	}
};

const releaseLease = async (opts: Pick<VtChannelOptions, "exec" | "paneId">, owner: string): Promise<void> => {
	const lock = `awvt-lease-${opts.paneId.replaceAll(/[^a-zA-Z0-9_-]/g, "_")}`;
	await opts.exec.run(["wait-for", "-L", lock]);
	try {
		const current = await readOption(opts, VT_PIPE_OWNER_OPT);
		if (current !== owner) return; // Someone else took over; leave their lease alone.
		for (const name of [VT_PIPE_OWNER_OPT, VT_OWNER_OPT, VT_OWNER_HB_OPT]) {
			await opts.exec.run(buildUnsetOptionArgv(opts.paneId, name));
		}
	} finally {
		await opts.exec.run(["wait-for", "-U", lock]);
	}
};

// ---------------------------------------------------------------------------
// The forwarder — spec §6, `vt.rs:364-399` `run_pipe`.
// ---------------------------------------------------------------------------

/**
 * "stdin (pane output) to the socket, and the socket to stdout (pane input,
 *  when armed `-IO`). Unbuffered so a keystroke is never stalled behind a
 *  stdio buffer." — `vt.rs:364-399`.
 *
 * FD DIRECTIONS (verified empirically on tmux 3.7c, see module header):
 *   fd 0 (stdin)  = pane OUTPUT   -> write to socket
 *   fd 1 (stdout) = pane INPUT    -> read from socket, write straight out
 * Both fds are the SAME duplex unix socket tmux hands the pipe command.
 *
 * "Unbuffered" is taken literally here, and it is the whole point of the
 * function:
 *   - pane input goes out via `writeSync(1, ...)` — no `net.Socket`, no
 *     `process.stdout` stream buffer. A buffered writer would hold the final
 *     keystroke of a burst until its next flush, which is exactly the "stalled
 *     keystroke" the spec comment forbids.
 *   - pane output uses Bun's stdin stream, which waits for a non-blocking fd to
 *     become readable instead of treating EAGAIN as a fatal file-read error.
 * `EAGAIN` is retried because tmux gives the command a non-blocking socket;
 * a dropped keystroke is unrecoverable and must never happen.
 */
export const runVtPipe = (socketPath?: string): void => {
	const path = socketPath ?? process.argv[1];
	if (path === undefined || path.length === 0) {
		process.stderr.write("vt-pipe: missing socket path\n");
		process.exit(2);
	}

	let socket: Socket;
	try {
		socket = connect(path);
	} catch (error) {
		process.stderr.write(`vt-pipe: connect failed: ${errorText(error)}\n`);
		process.exit(2);
	}

	let stopped = false;
	const stop = (code: number): void => {
		if (stopped) return;
		stopped = true;
		if (code !== 0) socket.destroy();
		socket.end(() => process.exit(code));
	};

	// tmux supplies a non-blocking socket, not a file. Bun's fs.ReadStream
	// can fail with EAGAIN before the first pane output reaches a fast forwarder.
	const paneOutput = process.stdin;
	paneOutput.on("data", (chunk: Buffer | string) => {
		const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
		if (!socket.writable) return;
		if (!socket.write(buf)) paneOutput.pause();
	});
	socket.on("drain", () => paneOutput.resume());
	paneOutput.on("error", () => {
		stop(0);
	});
	paneOutput.on("end", () => {
		// tmux closed the pipe; flush what we have, then stop.
		stop(0);
	});

	// Pane input: socket -> fd 1, synchronously.
	socket.on("data", (chunk: Buffer) => {
		if (!writeAllSync(1, chunk)) stop(1);
	});
	socket.on("error", () => {
		stop(0);
	});
	socket.on("close", () => {
		stop(0);
	});
};

/**
 * Write every byte to `fd`, allowing a small bounded number of transient
 * EAGAIN/zero-write results before giving up so the caller can tear down.
 */
export const writeAllSync = (
	fd: number,
	data: Buffer,
	write: (fd: number, data: Uint8Array, offset: number, length: number) => number = writeSync,
): boolean => {
	let offset = 0;
	let consecutiveRetries = 0;
	while (offset < data.length) {
		try {
			const written = write(fd, data, offset, data.length - offset);
			if (written === 0) {
				if (++consecutiveRetries >= 8) return false;
				continue;
			}
			offset += written;
			consecutiveRetries = 0;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "EAGAIN") {
				if (++consecutiveRetries >= 8) return false;
				continue;
			}
			return false;
		}
	}
	return true;
};

// ---------------------------------------------------------------------------
// Channel
// ---------------------------------------------------------------------------

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const bounded = <T>(promise: Promise<T>, label: string): Promise<T> =>
	new Promise<T>((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error(`${label} exceeded ${VT_SHUTDOWN_TIMEOUT_MS}ms; outcome is uncertain`)),
			VT_SHUTDOWN_TIMEOUT_MS,
		);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			},
		);
	});

export function createHeartbeatCoalescer(dispatch: (signal: AbortSignal) => Promise<void>) {
	let stopped = false;
	let running = false;
	let queued = false;
	let pending: Promise<void> = Promise.resolve();
	const controller = new AbortController();
	const drain = async (): Promise<void> => {
		while (!stopped) {
			queued = false;
			await dispatch(controller.signal);
			if (!queued) break;
		}
		running = false;
	};
	return {
		signal: controller.signal,
		tick: () => {
			if (stopped) return;
			if (running) {
				queued = true;
				return;
			}
			running = true;
			pending = drain();
		},
		stop: () => {
			stopped = true;
			queued = false;
			controller.abort(new Error("Heartbeat transport stopped"));
		},
		pending: () => pending,
	};
}

/** A false write return still means accepted; only an admission-limit result must not fall back. */
export const tryWriteVtInput = (
	socket: Pick<Socket, "writable" | "writableLength" | "write">,
	bytes: Uint8Array,
	onAccepted: () => void = () => {},
	onSettled: (error?: Error) => void = () => {},
	onRejected: () => void = () => {},
): boolean | "overloaded" => {
	if (!socket.writable) return false;
	if (socket.writableLength + bytes.length > __KEEP_MAX___KEEP_VT_INPUT_AGENTIC_WORKSPACE___BYTES__)
		return "overloaded";
	try {
		onAccepted();
		socket.write(bytes, (error) => onSettled(error ?? undefined));
		return true;
	} catch {
		onRejected();
		return false;
	}
};

/**
 * Arm a VT channel on an existing session. Returns `null` on ANY failure so the
 * caller falls back to `capture-pane` — `vt.rs:2110-2115`.
 *
 * NEVER THROWS. That is the contract that makes the fallback safe.
 */
export const createVtChannel = async (opts: VtChannelOptions): Promise<VtChannel | null> => {
	const log = opts.log ?? (() => {});
	const target = opts.paneId;
	const owner = opts.ownerId ?? `pid:${process.pid}`;

	let capabilities: VtCapabilities;
	try {
		capabilities = await detectVtCapabilities(opts, log);
	} catch (error) {
		log(`vt: capability detection failed: ${errorText(error)}`);
		return null;
	}

	// --- lease first: never take a pipe another process already owns -------
	let lease: LeaseVerdict;
	try {
		lease = await claimPipeLease(opts, target);
	} catch (error) {
		log(`vt: lease check failed: ${errorText(error)}`);
		return null;
	}
	if (lease.kind === "Held") {
		// `vt.rs:2024-2030`, verbatim intent.
		log(`vt: pipe owned by another process (${lease.owner}); using capture fallback`);
		return null;
	}

	// --- socket ------------------------------------------------------------
	const runtimeDir = opts.socketPath === undefined ? mkdtempSync(join(tmpdir(), "awvt-")) : undefined;
	const socketPath = opts.socketPath ?? join(runtimeDir as string, "p.sock");
	const forwarderExe = opts.forwarderExe ?? process.execPath;
	const command = buildForwarderCommand(forwarderExe, socketPath);

	// --- bind -> arm -> await dial-in --------------------------------------
	// Order matters twice over. The forwarder process does not exist until
	// `pipe-pane` has spawned it, so the bind must precede arming; and the
	// dial-in must be awaited only AFTER arming, or the process that would dial
	// in has not been created yet. Awaiting it first deadlocks until timeout.
	let server: Server;
	try {
		server = await bindForwarderSocket(socketPath, log);
	} catch (error) {
		await releaseLease(opts, owner).catch(() => {});
		log(`vt: cannot listen on ${socketPath}: ${errorText(error)}`);
		return null;
	}

	// A compiled forwarder can connect before the pipe-pane subprocess exits.
	// Retain that first socket before arming, without changing startup ordering.
	let acceptedSocket: Socket | null = null;
	const retainConnection = (connection: Socket): void => {
		if (acceptedSocket === null) acceptedSocket = connection;
		else connection.destroy();
	};
	server.on("connection", retainConnection);

	const abandon = async (reason: string): Promise<null> => {
		log(`vt: ${reason}`);
		acceptedSocket?.destroy();
		server.removeListener("connection", retainConnection);
		server.close();
		const failures: unknown[] = [];
		try {
			const clearOwnedPipe = buildPipePaneArgv(target, "", capabilities.pipeFlags).map(shQuote).join(" ");
			const result = await opts.exec.run([
				"if-shell",
				"-F",
				"-t",
				target,
				`#{==:#{${VT_PIPE_OWNER_OPT}},${owner}}`,
				clearOwnedPipe,
			]);
			if (result.exitCode !== 0) throw new Error(result.stderr);
		} catch (error) {
			failures.push(error);
		}
		try {
			await releaseLease(opts, owner);
		} catch (error) {
			failures.push(error);
		}
		if (runtimeDir) rmSync(runtimeDir, { recursive: true, force: true });
		if (failures.length) throw new AggregateError(failures, "VT arm cleanup failed");
		return null;
	};

	let socket: Socket;
	try {
		const armed = await opts.exec.run(buildPipePaneArgv(target, command, capabilities.pipeFlags));
		if (armed.exitCode !== 0) {
			return await abandon(`pipe-pane arming failed (exit ${armed.exitCode}): ${armed.stderr.trim()}`);
		}
		socket = acceptedSocket ?? (await awaitForwarderConnection(server, socketPath, TMUX_COMMAND_TIMEOUT_MS, log));
	} catch (error) {
		return await abandon(errorText(error));
	}

	// Deliver original bytes without an intermediate parser, grid, or text conversion.
	let disposed = false;
	let pendingSocketInputBytes = 0;
	let socketDeliveryErrorReported = false;
	const reportSocketDeliveryFailure = (error: Error): void => {
		if (socketDeliveryErrorReported) return;
		socketDeliveryErrorReported = true;
		log(`vt: accepted input may not have reached pane: ${errorText(error)}`);
		opts.onError?.(error);
	};
	socket.on("data", (chunk: Buffer) => {
		if (!disposed) opts.onOutput(chunk);
	});
	socket.on("error", (error) => {
		log(`vt: forwarder socket error: ${errorText(error)}`);
		if (pendingSocketInputBytes > 0) reportSocketDeliveryFailure(error);
	});
	socket.on("close", () => {
		if (pendingSocketInputBytes > 0)
			reportSocketDeliveryFailure(
				new Error(`${pendingSocketInputBytes} accepted input bytes remained buffered when the VT socket closed`),
			);
		if (!disposed) opts.onDisconnect?.();
	});

	// --- fused lease tick: spec §6, `session.rs:53-54` --------------------
	//
	// ONE tmux invocation per tick. The read and the lease write are chained with a literal `;`
	// argv element, which tmux parses as a command separator, so the periodic activity read the
	// workspace needs shares the fork the lease already paid for. The lease cadence stays under
	// this transport's control: it is never derived from the UI's activity-poll cadence, because a
	// paused or busy UI must not let the lease go stale and be stolen.
	const activityFormat = "#{pane_dead} #{window_activity}";
	let lastActivity: ActivityMetadata | undefined;
	const heartbeats = createHeartbeatCoalescer(async (signal) => {
		const stamp = opts.now?.() ?? Date.now();
		try {
			const result = await opts.exec.run(
				[
					"display-message",
					"-p",
					"-t",
					target,
					activityFormat,
					";",
					"if-shell",
					"-F",
					"-t",
					target,
					`#{==:#{${VT_PIPE_OWNER_OPT}},${owner}}`,
					buildSetOptionArgv(target, VT_OWNER_HB_OPT, String(stamp)).map(shQuote).join(" "),
				],
				{ signal },
			);
			if (result.exitCode === 0) {
				const [dead, activity] = result.stdout.trim().split(/\s+/);
				lastActivity = { paneDead: dead === "1", windowActivity: Number(activity) || 0 };
			}
		} catch {
			// A later beat retries; one failed observation must not break the channel.
		}
	});
	const heartbeat = setInterval(heartbeats.tick, VT_HEARTBEAT_MS);
	// Never let the heartbeat keep the process alive.
	heartbeat.unref?.();

	const inputArmed = capabilities.inputAvailable;

	const sendBytes = (bytes: Uint8Array): boolean | "overloaded" => {
		if (disposed || socket === null || !inputArmed) return false;
		return tryWriteVtInput(
			socket,
			bytes,
			() => (pendingSocketInputBytes += bytes.length),
			(error) => {
				pendingSocketInputBytes -= bytes.length;
				if (error) reportSocketDeliveryFailure(error);
			},
			() => (pendingSocketInputBytes -= bytes.length),
		);
	};

	const trySendInput = (bytes: Uint8Array): boolean => {
		const result = sendBytes(bytes);
		if (result === "overloaded") throw new Error("VT input transport overloaded; input was not sent");
		return result;
	};

	let disposing: Promise<void> | undefined;
	const dispose = (): Promise<void> => {
		if (disposing) return disposing;
		disposed = true;
		clearInterval(heartbeat);
		heartbeats.stop();
		if (pendingSocketInputBytes > 0)
			reportSocketDeliveryFailure(
				new Error(`${pendingSocketInputBytes} accepted input bytes remained buffered during VT shutdown`),
			);
		socket.destroy();
		server.removeListener("connection", retainConnection);
		server.close();
		// Unlink explicitly: a stale socket path makes the NEXT arm fail to bind.
		if (runtimeDir) rmSync(runtimeDir, { recursive: true, force: true });
		disposing = (async () => {
			const failures: Error[] = [];
			try {
				await bounded(heartbeats.pending(), "VT heartbeat drain");
			} catch (error) {
				failures.push(error instanceof Error ? error : new Error(String(error)));
			}
			// Check and remove in one tmux command queue; stale owners cannot remove a successor pipe.
			const cleanup = [
				buildPipePaneArgv(target, "", capabilities.pipeFlags),
				...[VT_PIPE_OWNER_OPT, VT_OWNER_OPT, VT_OWNER_HB_OPT].map((name) => buildUnsetOptionArgv(opts.paneId, name)),
			]
				.map((argv) => argv.map(shQuote).join(" "))
				.join(" ; ");
			try {
				const result = await bounded(
					opts.exec.run(["if-shell", "-F", "-t", target, `#{==:#{${VT_PIPE_OWNER_OPT}},${owner}}`, cleanup]),
					"VT cleanup",
				);
				if (result.exitCode !== 0 && !isMissingTmuxTarget(`${result.stderr}${result.stdout}`))
					throw new Error(`Could not dispose VT pipe: ${result.stderr}`);
			} catch (error) {
				failures.push(error instanceof Error ? error : new Error(String(error)));
			}
			if (failures.length > 0) throw new AggregateError(failures, "Could not fully dispose VT transport");
		})();
		return disposing;
	};

	return {
		inputMode: () => !disposed && inputArmed && socket.writable,
		trySendInput,
		activity: () => lastActivity,
		dispose,
	};
};

/**
 * Bind `socketPath` and return the listening server.
 *
 * DIRECTION OF THE CONNECTION (easy to get backwards, and silently fatal):
 * the forwarder is the CLIENT. `runVtPipe` runs as a tmux pipe-pane command,
 * so it starts only AFTER `pipe-pane` has been issued — it cannot connect to a
 * listener that does not exist yet. Ink therefore owns the unix socket as a
 * SERVER, and the startup order is strictly: bind -> arm -> await dial-in.
 * Awaiting the dial-in BEFORE arming deadlocks, because the process that would
 * dial in has not been spawned yet.
 *
 * The socket is unlinked first. A unix socket file outlives the process that
 * bound it, so any crash between bind and dispose leaves a path that makes
 * every later `listen` fail with EADDRINUSE — arming would be permanently
 * broken after one hard kill. The path is session- and PID-derived, so a leftover
 * file can only be our own dead socket.
 */
const bindForwarderSocket = (socketPath: string, log: VtLog): Promise<Server> =>
	new Promise<Server>((resolve, reject) => {
		const server = createServer();
		server.once("error", (error) => {
			reject(error);
		});
		server.listen(socketPath, () => {
			log(`vt: listening for forwarder at ${socketPath}`);
			resolve(server);
		});
	});

/**
 * Resolve with the forwarder's connection, or reject once `timeoutMs` passes.
 * The timer is `unref`'d so a failed arm never holds the process open — the
 * BACK-728 "process stays alive holding the terminal" failure.
 */
const awaitForwarderConnection = (server: Server, socketPath: string, timeoutMs: number, log: VtLog): Promise<Socket> =>
	new Promise<Socket>((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error(`no forwarder connected to ${socketPath} after ${timeoutMs}ms`));
		}, timeoutMs);
		timer.unref?.();
		server.on("connection", (socket: Socket) => {
			clearTimeout(timer);
			log(`vt: forwarder connected at ${socketPath}`);
			resolve(socket);
		});
	});
