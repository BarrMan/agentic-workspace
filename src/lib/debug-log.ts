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
 * Enable with `AGENTIC_WORKSPACE_DEBUG=1` for everything, or narrow it:
 *   AGENTIC_WORKSPACE_DEBUG=tmux,session
 * Add a file sink with `AGENTIC_WORKSPACE_DEBUG_FILE=/tmp/agentic-workspace-debug.log`.
 * Verbose payload level (command output sizes, not bodies) with `AGENTIC_WORKSPACE_DEBUG_VERBOSE=1`.
 */

import { appendFileSync } from "node:fs";

/** A key/value tail. Values must be cheap to stringify: primitives, small numbers, short strings. */
export type DebugFields = Record<string, string | number | boolean | undefined | null>;

interface DebugConfig {
	/** True when every subsystem logs (`AGENTIC_WORKSPACE_DEBUG=1`). */
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
 * Parse `AGENTIC_WORKSPACE_DEBUG`. "1"/"all"/"*" enables every subsystem; anything else is a
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
 * `AGENTIC_WORKSPACE_DEBUG_FILE` erased the traces of the panes already writing to it. `appendFileSync` opens
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
	const raw = (typeof process === "undefined" ? undefined : process.env?.AGENTIC_WORKSPACE_DEBUG)?.trim();
	if (!raw) {
		config = DISABLED;
		return config;
	}
	const all = raw === "1" || raw === "all" || raw === "*";
	const env = process.env as Record<string, string | undefined>;
	const sinkPath = env.AGENTIC_WORKSPACE_DEBUG_FILE?.trim();
	config = {
		all,
		subsystems: all ? new Set() : parseSubsystems(raw),
		sink: sinkPath ? openSink(sinkPath) : null,
		verbose: env.AGENTIC_WORKSPACE_DEBUG_VERBOSE === "1",
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
