/**
 * Gated structured debug logging.
 *
 * Purpose: answer "what work actually happened?" at runtime — how many HTTP requests, tmux
 * commands, worker spawns, and view rebuilds, and how long each took — without changing behavior
 * and without a chatty logger becoming the lag it is measuring.
 *
 * Two properties matter more than features:
 *
 * 1. **Disabled is free.** `isEnabled(subsystem)` is a single boolean/array lookup. Instrumentation
 *    call sites are guarded by it *before* building any argument, so a disabled log site allocates
 *    nothing and calls no `JSON.stringify`. A logger that allocates when off is a logger that can
 *    itself cause the hang it is instrumenting.
 * 2. **stderr, never stdout.** The CLI has JSON output modes; a debug line on stdout corrupts
 *    them. Everything here goes to stderr (and optionally a file).
 *
 * Enable with `BACKLOG_DEBUG=1` for everything, or narrow it:
 *   BACKLOG_DEBUG=tmux,session
 * Add a file sink with `BACKLOG_DEBUG_FILE=/tmp/backlog-debug.log`.
 * Verbose payload level (command output sizes, not bodies) with `BACKLOG_DEBUG_VERBOSE=1`.
 */

import { appendFileSync } from "node:fs";

/** Subsystem tags used at call sites. Kept open — a bare string is a valid subsystem. */
export type DebugSubsystem = "http" | "tmux" | "session" | "store" | "worker" | "view" | "render" | "server";

/** A key/value tail. Values must be cheap to stringify: primitives, small numbers, short strings. */
export type DebugFields = Record<string, string | number | boolean | undefined | null>;

interface DebugConfig {
	/** True when every subsystem logs (`BACKLOG_DEBUG=1`). */
	readonly all: boolean;
	/** Subsystem allowlist, consulted only when `all` is false. */
	readonly subsystems: ReadonlySet<string>;
	/** Writes formatted lines here in addition to stderr, or null when no file sink is configured. */
	readonly sink: ((line: string) => void) | null;
	readonly verbose: boolean;
}

const DISABLED: DebugConfig = { all: false, subsystems: new Set(), sink: null, verbose: false };

let config: DebugConfig | null = null;

/**
 * Parse `BACKLOG_DEBUG`. "1"/"all"/"*" enables every subsystem; anything else is a
 * comma-separated subsystem allowlist. Unset/empty disables logging.
 */
function parseSubsystems(raw: string): ReadonlySet<string> {
	return new Set(
		raw
			.split(",")
			.map((entry) => entry.trim())
			.filter(Boolean),
	);
}

/**
 * Open the file sink once, lazily, so a debug run never pays for a file it did not ask for.
 *
 * `Bun.file().writer()` truncates, so every workspace pane process sharing one
 * `BACKLOG_DEBUG_FILE` erased the traces of the panes already writing to it. `appendFileSync` opens
 * `O_APPEND` per line, and one `O_APPEND` write is atomic, so concurrent processes interleave whole
 * lines instead of destroying each other's.
 */
function openSink(path: string): ((line: string) => void) | null {
	try {
		return (line: string) => {
			try {
				appendFileSync(path, line);
			} catch {
				// A broken sink must never break the code being observed.
			}
		};
	} catch {
		return null;
	}
}

/**
 * Resolve the configuration once per process. Reading `process.env` and splitting a string on the
 * hot path would itself be measurable overhead.
 */
function resolve(): DebugConfig {
	if (config) return config;
	const raw = (typeof process === "undefined" ? undefined : process.env?.BACKLOG_DEBUG)?.trim();
	if (!raw) {
		config = DISABLED;
		return config;
	}
	const all = raw === "1" || raw === "all" || raw === "*";
	const env = process.env as Record<string, string | undefined>;
	const sinkPath = env.BACKLOG_DEBUG_FILE?.trim();
	config = {
		all,
		subsystems: all ? new Set() : parseSubsystems(raw),
		sink: sinkPath ? openSink(sinkPath) : null,
		verbose: env.BACKLOG_DEBUG_VERBOSE === "1",
	};
	return config;
}

/**
 * The gate every call site checks first.
 *
 * `isEnabled("tmux")` is the whole cost of a disabled log site. Call sites must not build their
 * arguments before calling this — the arguments are the expensive part.
 */
export function isEnabled(subsystem: string): boolean {
	const resolved = config ?? resolve();
	return resolved.all || resolved.subsystems.has(subsystem);
}

/** True when the extra payload level is on. Check this before doing expensive payload building. */
export function isVerbose(): boolean {
	return (config ?? resolve()).verbose;
}

/** Format a key/value tail. Only ever called after `isEnabled` has passed. */
function formatFields(fields: DebugFields | undefined): string {
	if (!fields) return "";
	let out = "";
	for (const key in fields) {
		const value = fields[key];
		if (value === undefined) continue;
		out += ` ${key}=${typeof value === "string" && /[\s"]/.test(value) ? JSON.stringify(value) : String(value)}`;
	}
	return out;
}

/**
 * Emit one line. Requires a preceding `isEnabled` check at the call site; the `site` argument is a
 * literal so it costs nothing extra.
 *
 * Writes `HH:MM:SS.mmm [subsystem] site key=value...` to stderr and, when configured, the file sink.
 */
export function debug(subsystem: string, site: string, fields?: DebugFields): void {
	const resolved = config ?? resolve();
	if (!resolved.all && !resolved.subsystems.has(subsystem)) return;
	const now = new Date();
	const line = `${now.toISOString().slice(11, 23)} [${subsystem}] ${site}${formatFields(fields)}\n`;
	try {
		process.stderr.write(line);
	} catch {
		// Never let logging break the observed code path.
	}
	resolved.sink?.(line);
}

/**
 * Always-on counters that exist whether or not debug logging is on.
 *
 * These exist so the claim "one session switch issued N tmux calls" can be checked without
 * correlating log lines — read them from the status endpoint. They must stay cheap: an integer
 * increment and nothing else.
 */
const counters = {
	http: 0,
	tmux: 0,
	tmuxMs: 0,
	worker: 0,
	render: 0,
	store: 0,
};

/** Increment a counter. Called on paths that are hot even when logging is off. */
export function count(kind: keyof typeof counters, by = 1): void {
	counters[kind] += by;
}

/** A point-in-time snapshot. Cheap; safe to call from a request handler. */
export function snapshot(): Readonly<Record<keyof typeof counters, number>> {
	return { ...counters };
}

/** The cumulative tmux invocation count — the single number that proves per-switch tmux work. */
export function tmuxCount(): number {
	return counters.tmux;
}

/**
 * Time a tmux invocation and log it. Used at the single tmux choke point.
 *
 * Reads the clock unconditionally (two `Date.now()` calls is far below the cost of the tmux
 * subprocess it is measuring) so the always-on counter is always accurate; formatting and logging
 * stay behind the gate.
 */
export function timeTmux(
	site: string,
	argv: readonly string[],
	startedAt: number,
	exitCode: number,
	bytes: number,
): void {
	count("tmux");
	const ms = Date.now() - startedAt;
	count("tmuxMs", ms);
	if (!isEnabled("tmux")) return;
	debug("tmux", site, { cmd: argv[0] ?? "?", argc: argv.length - 1, exit: exitCode, bytes, ms });
}

/** Reset all counters. Test-only helper. */
export function resetCounters(): void {
	for (const key of Object.keys(counters) as (keyof typeof counters)[]) counters[key] = 0;
}
