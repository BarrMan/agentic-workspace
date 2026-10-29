import { realpathSync } from "node:fs";
import {
	type CmdOptions,
	type NewSessionOptions,
	type RespawnOptions,
	Server,
	TmuxCommandError,
	TmuxTransportError,
} from "libtmux";
import { processIdentity, terminateProcessTree } from "../lib/process-tree.ts";
import { fail, type SessionCommandResult } from "../model/session/session-utils.ts";
import type { AgentSession } from "../model/session/types.ts";
import { cleanupPreparedLaunchResources, type PreparedLaunchResources } from "./completion-supervisor-resources.ts";
import { ConclusiveStartupFailureError } from "./errors/sessions.ts";
import { createTmuxExec } from "./live/tmux/exec.ts";
import type { TmuxExec } from "./live/tmux/types.ts";
import type { PreparedAgentLaunch } from "./session-launch.ts";
import { paneTitle } from "./tmux-pane-lookup.ts";

const LAUNCH_PROBE_INTERVAL_MS = 25;
const LAUNCH_PROBE_DURATION_MS = 250;
const TMUX_PLACEHOLDER_COMMAND = "exec sleep 2147483647";
const PANE_OPTION_ROOT = "@agentic_workspace_root";
const PANE_OPTION_TASK = "@agentic_workspace_task";
const PANE_OPTION_SESSION = "@agentic_workspace_session";
const PANE_OPTION_ROLE = "@agentic_workspace_role";
const PANE_OPTION_LAUNCH_RESOURCES = "@agentic_workspace_launch_resources";
const LIVE_PREVIEW_ROLE = "live-preview";
const RETIRED_SESSION_ROLE = "retired-session";

type ProcessOptions = {
	cwd?: string;
	env?: Record<string, string>;
	stdin?: string;
	inherit?: boolean;
	timeoutMs?: number;
	signal?: AbortSignal;
};

export interface ProcessRunner {
	run(args: string[], options?: ProcessOptions): Promise<SessionCommandResult>;
}

/** Runtime-owned resource roots used to validate captured launch-resource cleanup. */
export interface SessionProcessResourceContext {
	readonly projectRoot: string;
	readonly stateRoot: () => Promise<string>;
}

export interface PreparedProcessStop {
	stop(): Promise<void>;
}

export class BunRunner implements ProcessRunner {
	async run(args: string[], options: ProcessOptions = {}): Promise<SessionCommandResult> {
		const child = Bun.spawn(args, {
			cwd: options.cwd,
			env: options.env,
			stdin: options.inherit
				? "inherit"
				: options.stdin === undefined
					? "ignore"
					: new TextEncoder().encode(options.stdin),
			stdout: options.inherit ? "inherit" : "pipe",
			stderr: options.inherit ? "inherit" : "pipe",
			detached: !options.inherit,
		});
		if (options.inherit) return { exitCode: await child.exited, stdout: "", stderr: "" };
		let timer: ReturnType<typeof setTimeout> | undefined;
		let timedOut = false;
		let stdout = "";
		let stderr = "";
		const drain = async (stream: ReadableStream<Uint8Array> | null | undefined, append: (value: string) => void) => {
			if (!stream) return;
			const reader = stream.getReader();
			const decoder = new TextDecoder();
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					append(decoder.decode(value, { stream: true }));
				}
				append(decoder.decode());
			} catch {
				// The process group may close the pipe during timeout cleanup.
			}
		};
		const output = Promise.all([
			drain(child.stdout, (chunk) => (stdout += chunk)),
			drain(child.stderr, (chunk) => (stderr += chunk)),
			child.exited,
		] as const);
		const terminate = () => {
			try {
				process.kill(-child.pid, "SIGKILL");
			} catch {
				/* The process group may already be gone. */
			}
		};
		let onAbort: (() => void) | undefined;
		try {
			const interrupted = new Promise<"timeout" | "abort">((resolve) => {
				if (options.timeoutMs !== undefined)
					timer = setTimeout(() => {
						timedOut = true;
						terminate();
						resolve("timeout");
					}, options.timeoutMs);
				if (options.signal?.aborted) {
					terminate();
					resolve("abort");
				} else if (options.signal) {
					onAbort = () => {
						terminate();
						resolve("abort");
					};
					options.signal.addEventListener("abort", onAbort, { once: true });
				}
			});
			const result = await Promise.race([
				output.then(([, , exitCode]) => ({ kind: "exit" as const, exitCode })),
				interrupted.then((kind) => ({ kind })),
			]);
			if (result.kind !== "exit")
				return {
					exitCode: result.kind === "timeout" ? 124 : 130,
					stdout,
					stderr,
					...(timedOut ? { timedOut: true } : {}),
				};
			return { exitCode: result.exitCode, stdout, stderr };
		} finally {
			if (timer !== undefined) clearTimeout(timer);
			if (onAbort) options.signal?.removeEventListener("abort", onAbort);
		}
	}
}

interface TmuxWindowHandle {
	setOption(name: string, value: string): Promise<void>;
}

interface TmuxPaneHandle {
	readonly id: string;
	readonly window?: TmuxWindowHandle;
	setOption(name: string, value: string): Promise<void>;
	setTitle(title: string): Promise<void>;
	pipeTo(command?: string, options?: { readonly toggle?: boolean }): Promise<void>;
	respawn(command?: string, options?: RespawnOptions): Promise<void>;
	displayMessage(message: string): Promise<readonly string[]>;
	kill(): Promise<void>;
}

interface TmuxSessionHandle {
	readonly activePane?: TmuxPaneHandle;
}

export interface TmuxServer {
	newSession(options?: NewSessionOptions): Promise<TmuxSessionHandle>;
	panes(): Promise<Iterable<TmuxPaneHandle>>;
	cmd(command: string, args?: readonly string[], options?: CmdOptions): Promise<readonly string[]>;
}

export type SessionTransport = {
	readonly server: TmuxServer;
	readonly exec: TmuxExec;
};

function quote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function errorResult(error: unknown): SessionCommandResult {
	if (error instanceof TmuxCommandError)
		return { exitCode: error.exitCode, stdout: error.stdout.join("\n"), stderr: error.stderr.join("\n") };
	if (error instanceof TmuxTransportError)
		return {
			exitCode: 1,
			stdout: new TextDecoder().decode(error.stdout),
			stderr: new TextDecoder().decode(error.stderr) || error.message,
		};
	return { exitCode: 1, stdout: "", stderr: error instanceof Error ? error.message : String(error) };
}

async function tmux<T>(prefix: string, fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (error) {
		throw fail(prefix, errorResult(error));
	}
}

function firstLine(lines: readonly string[]): string {
	return lines[0] ?? "";
}

/**
 * The exact `stderr` {@link SessionProcess.alive} reports when a session has no pane at all on the
 * backend server. Exported so a caller that must tell "the pane is gone" apart from an inconclusive
 * tmux failure compares whole strings — the same wording embedded in a transport error must not
 * read as a missing pane.
 */
const missingPaneStderr = (sessionId: string): string => `tmux pane for session ${sessionId} not found`;

/** Resolve socket identity and routing environment once for both libtmux and bounded execution. */
const sessionSocket = (requestedSocketName?: string) => {
	const environment: NodeJS.ProcessEnv = { ...process.env };
	return {
		socketName: requestedSocketName ?? (environment.AGENTIC_WORKSPACE_TMUX_SOCKET?.trim() || "default"),
		environment,
	};
};

/** A paired, pinned libtmux server and cancellable command executor for one CLI session runtime. */
export const createSessionTransport = (socketName?: string): SessionTransport => {
	const routing = sessionSocket(socketName);
	return {
		server: new Server({ socketName: routing.socketName, environment: { ...routing.environment } }),
		exec: createTmuxExec({ socketName: routing.socketName, environment: { ...routing.environment } }),
	};
};

/** Server factory for server-only observation callers. */
export const createSessionServer = (): Server => createSessionTransport().server as Server;

export class SessionProcess {
	private readonly rootDir: string;
	private readonly launches = new Map<string, PreparedAgentLaunch>();

	constructor(
		private readonly runner: ProcessRunner,
		resources: SessionProcessResourceContext,
		private readonly server: TmuxServer = createSessionServer(),
		private readonly stateRoot: () => Promise<string> = resources.stateRoot,
		private readonly exec: TmuxExec = createTmuxExec({
			socketName: process.env.AGENTIC_WORKSPACE_TMUX_SOCKET?.trim() || "default",
		}),
	) {
		this.rootDir = realpathSync(resources.projectRoot);
	}

	async prepare(command: string, cwd: string, env: Record<string, string>): Promise<void> {
		const result = await this.runner.run(["/bin/sh", "-lc", command], { cwd, env });
		if (result.exitCode !== 0) throw fail("Agent preparation failed", result);
	}

	async create(
		session: AgentSession,
		cwd: string,
		env: Record<string, string>,
		acquired?: (paneId?: string) => void,
	): Promise<void> {
		const created = await tmux(`Could not start tmux session ${session.id}`, () =>
			this.server.newSession({
				name: session.tmuxName,
				startDirectory: cwd,
				environment: env,
				shellCommand: `/bin/sh -lc ${quote(TMUX_PLACEHOLDER_COMMAND)}`,
			}),
		);
		const pane = created.activePane;
		acquired?.(pane?.id);
		if (!pane?.id || !/^%\d+$/.test(pane.id))
			throw new Error(`Could not determine tmux pane for session ${session.id}.`);
		for (const [option, value] of [
			[PANE_OPTION_ROOT, this.rootDir],
			[PANE_OPTION_TASK, session.taskId],
			[PANE_OPTION_SESSION, session.id],
			[PANE_OPTION_ROLE, LIVE_PREVIEW_ROLE],
		] as const) {
			await tmux(`Could not tag tmux session ${session.id}`, () => pane.setOption(option, value));
		}
		await tmux(`Could not title tmux session ${session.id}`, () =>
			pane.setTitle(paneTitle(session.taskId, LIVE_PREVIEW_ROLE)),
		);
	}

	async preparePane(session: AgentSession, options: { includeDead?: boolean } = {}): Promise<void> {
		const pane = await this.pane(session, options);
		if (!pane.window) throw new Error(`Agent pane for session ${session.id} has no window`);
		await tmux(
			`Could not prepare tmux session ${session.id}`,
			() => pane.window?.setOption("remain-on-exit", "on") ?? Promise.resolve(),
		);
		await tmux(`Could not prepare tmux session ${session.id}`, () =>
			pane.pipeTo(`cat >> ${quote(session.outputPath)}`, { toggle: true }),
		);
	}

	async launchPrepared(
		session: AgentSession,
		launch: PreparedAgentLaunch,
		options: { includeDead?: boolean; onDispatch?: () => void } = {},
	): Promise<void> {
		const pane = await this.pane(session, options);
		if (!launch.resources) throw new Error(`Prepared launch ${session.id} has no resource inventory.`);
		if (this.launches.has(session.id))
			throw new Error(`Prepared resources for session ${session.id} must be cleaned before relaunch.`);
		if (await this.launchResources(pane.id))
			throw new Error(`Prepared resources for session ${session.id} must be cleaned before relaunch.`);
		await this.validateLaunchResources(session, launch.resources, true);
		try {
			await tmux(`Could not record prepared resources for session ${session.id}`, () =>
				pane.setOption(PANE_OPTION_LAUNCH_RESOURCES, JSON.stringify(launch.resources)),
			);
		} catch (error) {
			try {
				await this.validateLaunchResources(session, launch.resources, false);
			} catch (cleanupError) {
				this.launches.set(session.id, launch);
				throw new AggregateError([error, cleanupError], `Could not clean prepared launch ${session.id}`);
			}
			throw error;
		}
		this.launches.set(session.id, launch);
		const environment = Object.entries(launch.env).map(([name, value]) => quote(`${name}=${value}`));
		await this.launchCommand(session, `exec env ${environment.join(" ")} ${launch.command}`, options);
	}

	/** Only a positively dead or absent instance may be replaced. */
	async assertNoPreparedResources(session: AgentSession): Promise<void> {
		const pane = await this.exactPane(session, [LIVE_PREVIEW_ROLE]);
		if (pane && !pane.dead) throw new Error(`Session ${session.id} is live; refusing replacement.`);
		if (pane || this.launches.has(session.id)) await this.kill(session);
	}

	private async launchCommand(
		session: AgentSession,
		command: string,
		options: { includeDead?: boolean; onDispatch?: () => void } = {},
	): Promise<void> {
		const pane = await this.pane(session, options);
		// Once respawn is invoked the placeholder is no longer safe to settle as a pre-dispatch failure.
		options.onDispatch?.();
		await tmux(`Could not launch agent session ${session.id}`, () =>
			pane.respawn(`/bin/sh -lc ${quote(command)}`, { kill: true }),
		);
		const deadline = Date.now() + LAUNCH_PROBE_DURATION_MS;
		while (true) {
			const remaining = deadline - Date.now();
			if (remaining <= 0) return;
			const observed = await this.exactPane(session, [LIVE_PREVIEW_ROLE], remaining);
			if (!observed)
				throw new ConclusiveStartupFailureError(
					`Agent command failed to launch for session ${session.id}: owned pane disappeared.`,
				);
			if (observed.paneId !== pane.id)
				throw new Error(`Could not confirm startup for session ${session.id}: owned pane changed during probe.`);
			if (observed.dead)
				throw new ConclusiveStartupFailureError(
					`Agent command failed to launch for session ${session.id}: owned pane exited.`,
				);
			const sleepFor = deadline - Date.now();
			if (sleepFor <= 0) return;
			await Bun.sleep(Math.min(LAUNCH_PROBE_INTERVAL_MS, sleepFor));
		}
	}

	async demote(session: AgentSession): Promise<void> {
		const pane = await this.findPaneHandle(session, { roles: [LIVE_PREVIEW_ROLE, RETIRED_SESSION_ROLE] });
		if (!pane) return;
		await tmux(`Could not retag tmux session ${session.id}`, async () => {
			await pane.setOption(PANE_OPTION_ROLE, RETIRED_SESSION_ROLE);
			await pane.setTitle(paneTitle(session.taskId, RETIRED_SESSION_ROLE));
		});
	}

	async kill(session: AgentSession): Promise<void> {
		await this.killPane(session, [LIVE_PREVIEW_ROLE]);
	}

	async killCaptured(session: AgentSession, paneId: string): Promise<void> {
		await this.killPane(session, [LIVE_PREVIEW_ROLE], paneId);
	}

	async prepareStop(session: AgentSession): Promise<PreparedProcessStop> {
		const pane = await this.exactPane(session, [LIVE_PREVIEW_ROLE]);
		if (!pane) return { stop: async () => {} };
		const resources = await this.launchResources(pane.paneId);
		if (resources) await this.validateLaunchResources(session, resources, true);
		if (!pane.dead) {
			const rawPid = firstLine(
				await this.server.cmd("display-message", ["-p", "-t", pane.paneId, "#{pane_pid}"]),
			).trim();
			const pid = /^\d+$/.test(rawPid) ? Number(rawPid) : undefined;
			if (!pid || !Number.isSafeInteger(pid) || pid <= 1)
				throw new Error(`Could not safely identify pane process for session ${session.id}; refusing stop.`);
			processIdentity(pid);
		}
		return { stop: async () => await this.killCaptured(session, pane.paneId) };
	}

	async killRetired(session: AgentSession): Promise<void> {
		await this.killPane(session, [RETIRED_SESSION_ROLE]);
	}

	private async killPane(session: AgentSession, roles: string[], expectedPaneId?: string): Promise<void> {
		const paneId = await this.ownedInstancePane(session, roles);
		if (paneId !== undefined && expectedPaneId !== undefined && paneId !== expectedPaneId)
			throw new Error(`Session ${session.id} pane incarnation changed; refusing to stop a replacement.`);
		const pane = paneId ? await this.paneById(paneId) : undefined;
		if (paneId && !pane) throw new Error(`Owned pane ${paneId} disappeared during stop for session ${session.id}.`);
		const resources = (pane && (await this.launchResources(pane.id))) ?? this.launches.get(session.id)?.resources;
		const rawPanePid = pane
			? firstLine(await this.server.cmd("display-message", ["-p", "-t", pane.id, "#{pane_pid}"])).trim()
			: undefined;
		const panePid = rawPanePid !== undefined && /^\d+$/.test(rawPanePid) ? Number(rawPanePid) : undefined;
		if (pane && (!panePid || !Number.isSafeInteger(panePid) || panePid <= 1))
			throw new Error(`Could not safely identify pane process for session ${session.id}; refusing pane teardown.`);
		const dead = paneId ? (await this.exactPane(session, roles))?.dead : false;
		// A successful lookup returning no identity proves exit; inspection/name failures throw.
		const paneIdentity = pane && !dead ? processIdentity(panePid) : undefined;
		if (resources) await this.validateLaunchResources(session, resources, true);
		if (resources) await this.validateLaunchResources(session, resources, false);
		if (panePid && paneIdentity) {
			const outcome = await terminateProcessTree(panePid, 1_000, paneIdentity);
			if (outcome === "survivor")
				throw new Error(`Could not prove agent process tree stopped for session ${session.id} (${outcome}).`);
		}
		if (pane) {
			try {
				await pane.kill();
			} catch (error) {
				if (!(await this.sessionAbsent(session, error)))
					throw fail(
						resources
							? `Could not stop session ${session.id}: launch resources were cleaned, but tmux pane teardown failed`
							: `Could not stop session ${session.id}`,
						errorResult(error),
					);
			}
		}
		this.launches.delete(session.id);
	}

	private async ownedInstancePane(session: AgentSession, roles: string[]): Promise<string | undefined> {
		return (await this.exactPane(session, roles))?.paneId;
	}

	async exactPane(
		session: AgentSession,
		roles: readonly string[],
		timeoutMs?: number,
	): Promise<{ paneId: string; dead: boolean } | undefined> {
		let rows: readonly string[];
		try {
			rows = await this.server.cmd(
				"list-panes",
				["-t", `=${session.tmuxName}:`, "-F", "#{pane_id}"],
				timeoutMs === undefined ? undefined : { timeoutMs },
			);
		} catch (error) {
			try {
				if (await this.sessionAbsent(session, error)) return undefined;
			} catch {
				// Keep the failed pane inspection as the diagnostic; a failed absence check is not proof.
			}
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Could not inspect tmux instance for session ${session.id}: ${message}`, { cause: error });
		}
		if (rows.length !== 1 || !/^%\d+$/.test(firstLine(rows)))
			throw new Error(`Could not inspect tmux instance for session ${session.id}: expected exactly one pane.`);
		const paneId = firstLine(rows);
		const readValue = async (format: string): Promise<string> => {
			const values = await this.server.cmd("list-panes", ["-t", paneId, "-F", `#{${format}}`]);
			if (values.length !== 1)
				throw new Error(`Could not inspect tmux ownership value ${format} for session ${session.id}.`);
			return firstLine(values);
		};
		let values: string[];
		try {
			values = await Promise.all([
				readValue("session_name"),
				readValue(PANE_OPTION_ROOT),
				readValue(PANE_OPTION_TASK),
				readValue(PANE_OPTION_SESSION),
				readValue(PANE_OPTION_ROLE),
				readValue("pane_id"),
				readValue("pane_dead"),
			]);
		} catch (error) {
			if (await this.sessionAbsent(session, error)) return undefined;
			throw error;
		}
		const [name, root, taskId, sessionId, role, actualPaneId, dead] = values;
		if (
			name !== session.tmuxName ||
			root !== this.rootDir ||
			taskId !== session.taskId ||
			sessionId !== session.id ||
			!roles.includes(role ?? "") ||
			actualPaneId !== paneId ||
			(dead !== "0" && dead !== "1")
		)
			throw new Error(`Tmux instance ownership does not match session ${session.id}; refusing takeover.`);
		return { paneId, dead: dead === "1" };
	}

	private async sessionAbsent(session: AgentSession, inspectionError: unknown): Promise<boolean> {
		if (!(inspectionError instanceof TmuxCommandError) || inspectionError.exitCode === 0) return false;
		const sessions = await this.server.cmd("list-sessions", ["-F", "#{session_name}"]);
		return !sessions.some((name) => name === session.tmuxName);
	}

	/** Read the prepared resource inventory recorded on one owned pane, if any. */
	async launchResources(paneId: string): Promise<PreparedLaunchResources | undefined> {
		const values = await this.server.cmd("display-message", ["-p", "-t", paneId, `#{${PANE_OPTION_LAUNCH_RESOURCES}}`]);
		if (values.length !== 1)
			throw new Error(`Could not read prepared resource inventory for pane ${paneId}: expected exactly one row.`);
		const raw = firstLine(values).trim();
		if (!raw) return undefined;
		let value: unknown;
		try {
			value = JSON.parse(raw);
		} catch (cause) {
			throw new Error("Prepared resource inventory is invalid JSON.", { cause });
		}
		const directory = (entry: unknown): entry is PreparedLaunchResources["skill"] => {
			if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return false;
			const resource = entry as Record<string, unknown>;
			return (
				typeof resource.path === "string" &&
				typeof resource.dev === "number" &&
				typeof resource.ino === "number" &&
				typeof resource.uid === "number" &&
				typeof resource.marker === "string"
			);
		};
		if (typeof value !== "object" || value === null || Array.isArray(value))
			throw new Error("Prepared resource inventory is malformed.");
		const resources = value as Record<string, unknown>;
		if (!directory(resources.skill) || (resources.activity !== undefined && !directory(resources.activity)))
			throw new Error("Prepared resource inventory is malformed.");
		return resources as unknown as PreparedLaunchResources;
	}

	async validateLaunchResources(
		session: AgentSession,
		resources: PreparedLaunchResources,
		verifyOnly: boolean,
	): Promise<void> {
		await cleanupPreparedLaunchResources(
			resources,
			{
				rootPath: this.rootDir,
				stateRoot: await this.stateRoot(),
				outputPath: session.outputPath,
				sessionId: session.id,
			},
			verifyOnly,
		);
	}

	async attach(session: AgentSession): Promise<void> {
		const paneId = await this.paneId(session);
		// The backend is always the default server, and `switch-client` can only move a client that
		// is attached to that same server. A caller inside another tmux server gets a nested attach
		// instead (the spawn environment clears `TMUX`, so tmux permits it).
		let command = "attach-session";
		const clientPid = process.env.TMUX?.split(",")[1]?.trim();
		if (clientPid) {
			const serverPid = await this.server.cmd("display-message", ["-p", "#{pid}"]).catch(() => []);
			if (firstLine(serverPid).trim() === clientPid) command = "switch-client";
		}
		await tmux(`Could not attach to session ${session.id}`, () =>
			this.server.cmd(command, ["-t", paneId], { timeoutMs: null }),
		);
	}

	/** Resolve the existing pane for a renderer attachment; this never attaches a TTY client. */
	async terminalTarget(
		session: Readonly<AgentSession>,
	): Promise<{ readonly paneId: string; readonly server: TmuxServer; readonly exec: TmuxExec }> {
		return { paneId: await this.paneId(session), server: this.server, exec: this.exec };
	}
	async sendKey(session: AgentSession, key: string): Promise<void> {
		const paneId = await this.paneId(session);
		try {
			await this.server.cmd("send-keys", ["-t", paneId, key]);
		} catch (error) {
			throw fail(`Could not send input to session ${session.id}`, errorResult(error));
		}
	}

	async input(session: AgentSession, text: string): Promise<void> {
		const paneId = await this.paneId(session);
		try {
			await this.server.cmd("send-keys", ["-t", paneId, "-l", text]);
			await this.server.cmd("send-keys", ["-t", paneId, "Enter"]);
		} catch (error) {
			throw fail(`Could not send input to session ${session.id}`, errorResult(error));
		}
	}

	async alive(session: AgentSession) {
		try {
			const pane = await this.exactPane(session, [LIVE_PREVIEW_ROLE]);
			if (!pane) return { exitCode: 1, stdout: "", stderr: missingPaneStderr(session.id) };
			return { exitCode: 0, stdout: `${pane.dead ? "1" : "0"}\n`, stderr: "" };
		} catch (error) {
			return errorResult(error);
		}
	}

	/** Classify only this exact owned tmux instance; process-tree settlement is not part of the contract. */
	async nativeRuntimeClassification(
		session: AgentSession,
	): Promise<
		| { status: "live"; paneId: string }
		| { status: "dead"; paneId: string }
		| { status: "missing" }
		| { status: "uncertain"; reason: string }
	> {
		const pane = await this.exactPane(session, [LIVE_PREVIEW_ROLE]);
		return pane ? { status: pane.dead ? "dead" : "live", paneId: pane.paneId } : { status: "missing" };
	}

	private async pane(
		session: AgentSession,
		options: { includeDead?: boolean; roles?: string[] } = {},
	): Promise<TmuxPaneHandle> {
		const paneId = await this.paneId(session, options);
		const pane = await this.paneById(paneId);
		if (!pane) throw new Error(`Agent pane for session ${session.id} no longer exists`);
		return pane;
	}

	/** Public: callers that already know a session needs its pane id without a second lookup path. */
	async paneId(session: AgentSession, options: { includeDead?: boolean; roles?: string[] } = {}): Promise<string> {
		const paneId = await this.findPane(session, options);
		if (!paneId) throw new Error(`Agent pane for session ${session.id} no longer exists`);
		return paneId;
	}

	private async findPaneHandle(
		session: AgentSession,
		options: { includeDead?: boolean; roles?: string[] } = {},
	): Promise<TmuxPaneHandle | undefined> {
		const paneId = await this.findPane(session, options);
		return paneId ? await this.paneById(paneId) : undefined;
	}

	private async paneById(paneId: string): Promise<TmuxPaneHandle | undefined> {
		for (const pane of await this.server.panes()) if (pane.id === paneId) return pane;
		return undefined;
	}

	private async findPane(
		session: AgentSession,
		options: { includeDead?: boolean; roles?: string[] } = {},
	): Promise<string | undefined> {
		const pane = await this.exactPane(session, options.roles ?? [LIVE_PREVIEW_ROLE]);
		return pane && (options.includeDead || !pane.dead) ? pane.paneId : undefined;
	}
}
