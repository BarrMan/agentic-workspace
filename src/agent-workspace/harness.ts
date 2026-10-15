import { randomUUID } from "node:crypto";
import { watch } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { resolveLaunchPreset } from "./agents/opencode-resolution.ts";
import {
	initializedReceiptPath,
	preflightAgentLaunch,
	prepareAgentLaunchResources,
	promptAcceptedReceiptPath,
} from "./session-launch.ts";
import { BunRunner, missingPaneStderr, SessionProcess } from "./session-process.ts";
import { sessionActivityDir } from "./status-hooks.ts";
import type {
	AgentActivity,
	AgentPreset,
	AgentSession,
	ModeId,
	ModeProfile,
	ResolvedAgentConfiguration,
} from "./types.ts";
import { workspaceContextInto } from "./workspace-context.ts";

export type Unsubscribe = () => void;

export interface SessionLaunchContext {
	readonly taskId: string;
	readonly modeId: ModeId;
	readonly sessionId: string;
	readonly record: Readonly<AgentSession>;
	readonly configuration: ResolvedAgentConfiguration;
	readonly profile: Readonly<ModeProfile>;
	readonly preset: Readonly<AgentPreset>;
	readonly prompt: string;
}

export interface ExecutionIdentity {
	readonly taskId: string;
	readonly modeId: ModeId;
	readonly sessionId: string;
	readonly executionId: string;
	readonly nativeSessionId?: string;
}

export interface RunningExecutionEvents {
	readonly turnCompleted: "supported" | "unsupported";
	readonly permissionWait: "supported" | "unsupported";
	readonly executionExit: "supported" | "unsupported";
	readonly activity: "supported" | "unsupported";
}

export interface RunningExecutionEvent {
	readonly kind: "turn-completed" | "permission-wait" | "execution-exit" | "activity";
	readonly activity?: AgentActivity;
	readonly exitCode?: number;
}

export interface RunningExecution {
	readonly identity: ExecutionIdentity;
	readonly providerConversationId?: string;
	readonly events: Readonly<RunningExecutionEvents>;
	input(text: string): Promise<void>;
	sendKey(key: string): Promise<void>;
	stop(): Promise<void>;
	observe(listener: (event: RunningExecutionEvent) => void): Unsubscribe;
	teardownListeners(): void;
}

export interface RecoverableExecutionFailure extends Error {
	readonly execution?: RunningExecution;
	readonly identity?: ExecutionIdentity;
}

export interface HarnessProvider {
	launch(context: SessionLaunchContext): Promise<RunningExecution>;
	resume(nativeId: string, context: SessionLaunchContext): Promise<RunningExecution>;
}

export interface HarnessReadinessEvidence {
	readonly identity: string;
	readonly initialization: string;
	readonly promptAcknowledgment: string;
	readonly resume: string;
	readonly failure: string;
	readonly events: RunningExecutionEvents;
}

export const PROVIDER_READINESS_DEADLINE_MS = 10_000;

export interface ProviderReadinessFailureDiagnostic {
	readonly provider: string;
	readonly intent: "new" | "resume";
	readonly workspaceTaskId: string;
	readonly expectedNativeId: string | undefined;
	readonly stage: {
		readonly name: "initialized" | "prompt-accepted" | "resume-initialized";
		readonly outcome: "missing" | "mismatched";
	};
	readonly elapsedMs: number;
	readonly receiptPath: string;
}

export const HARNESS_READINESS_MATRIX = {
	"opencode-v1": {
		identity: "Plugin `session.created` event, written as the `<sessionId>.native-session-id` receipt.",
		initialization: "Owned pane live and the plugin has flushed the identity receipt.",
		promptAcknowledgment: "Project-authored plugin emits prompt-accepted after bootstrap submission.",
		resume: "Identity receipt plus a live initialized pane; no bootstrap replay.",
		failure:
			"Owned pane disappears or exits within `LAUNCH_PROBE_DURATION_MS`; the v1 CLI preflight has its own bounded timeout.",
		events: {
			turnCompleted: "supported",
			permissionWait: "supported",
			executionExit: "supported",
			activity: "supported",
		},
	},
	"opencode-v2": {
		identity: "Client-allocated `ses_<uuid>` confirmed by the server session response.",
		initialization: "Server session lookup succeeds for the launched session.",
		promptAcknowledgment: "Server accepts the bootstrap message (API ack / SSE event).",
		resume: "Server session lookup for the exact native id; no bootstrap replay.",
		failure:
			"Version probe (5s) and resume-session probe (8s) preflight; pane disappearance or exit within the shared launch-probe deadline is conclusive.",
		events: {
			turnCompleted: "supported",
			permissionWait: "unsupported",
			executionExit: "supported",
			activity: "supported",
		},
	},
	claude: {
		identity: "Client `--session-id`, correlated with the `SessionStart` hook `session_id`.",
		initialization: "`SessionStart` hook observed for the launched session.",
		promptAcknowledgment: "`UserPromptSubmit` hook fires for the bootstrap prompt.",
		resume: "`SessionStart` hook with `source: resume`; no bootstrap replay.",
		failure: "Pane disappearance or exit within the shared launch-probe deadline.",
		events: {
			turnCompleted: "supported",
			permissionWait: "supported",
			executionExit: "supported",
			activity: "supported",
		},
	},
	pi: {
		identity: "Client `--session-id`, correlated with `session_start` session metadata.",
		initialization: "`session_start` extension event observed.",
		promptAcknowledgment: "`before_agent_start` carries the accepted bootstrap prompt.",
		resume: "`session_start` event; no bootstrap replay.",
		failure: "Pane disappearance or exit within the shared launch-probe deadline.",
		events: {
			turnCompleted: "supported",
			permissionWait: "unsupported",
			executionExit: "supported",
			activity: "supported",
		},
	},
} as const satisfies Record<"opencode-v1" | "opencode-v2" | "claude" | "pi", HarnessReadinessEvidence>;

export type ReadinessReceiptExpectation = string | Readonly<Record<string, string>>;

export function parseReadinessReceipt(contents: string, expected?: ReadinessReceiptExpectation): boolean {
	const value = contents.trim();
	if (!value) return false;
	if (expected === undefined) return true;
	if (typeof expected === "string") return value === expected;
	try {
		const parsed: unknown = JSON.parse(value);
		return (
			typeof parsed === "object" &&
			parsed !== null &&
			Object.entries(expected).every(([field, required]) => (parsed as Record<string, unknown>)[field] === required)
		);
	} catch {
		return false;
	}
}

async function receipt(path: string, expected?: ReadinessReceiptExpectation): Promise<boolean> {
	try {
		return parseReadinessReceipt(await readFile(path, "utf8"), expected);
	} catch {
		return false;
	}
}

export async function waitForReceipts(
	paths: string[],
	expected: ReadinessReceiptExpectation | undefined,
	session: AgentSession,
	process: SessionProcess,
	timeoutMs = PROVIDER_READINESS_DEADLINE_MS,
): Promise<void> {
	const firstPath = paths[0];
	if (!firstPath) throw new Error("No provider readiness receipts were configured.");
	const directory = dirname(firstPath);
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const pane = await process.alive(session);
		if (pane.exitCode !== 0 || pane.stdout.trim() !== "0")
			throw new Error(`Agent startup failed for session ${session.id}: owned pane exited.`);
		if ((await Promise.all(paths.map((path) => receipt(path, expected)))).every(Boolean)) return;
		await new Promise<void>((resolve, reject) => {
			const remaining = deadline - Date.now();
			const watcher = watch(directory, () => {
				clearTimeout(timer);
				watcher.close();
				resolve();
			});
			const timer = setTimeout(() => {
				watcher.close();
				resolve();
			}, remaining);
			watcher.on("error", (error) => {
				clearTimeout(timer);
				watcher.close();
				reject(error);
			});
			void Promise.all(paths.map((path) => receipt(path, expected))).then((found) => {
				if (found.every(Boolean)) {
					clearTimeout(timer);
					watcher.close();
					resolve();
				}
			});
		});
	}
	const mismatched = await receiptExists(firstPath);
	throw new Error(
		`Provider readiness timed out for session ${session.id}; ${mismatched ? "mismatched" : "missing"} ${basename(firstPath)} receipt.`,
	);
}

async function receiptExists(path: string): Promise<boolean> {
	try {
		await readFile(path, "utf8");
		return true;
	} catch {
		return false;
	}
}

async function observedNativeId(path: string): Promise<string> {
	const value = (await readFile(path, "utf8")).trim();
	try {
		const parsed: unknown = JSON.parse(value);
		if (parsed && typeof parsed === "object" && typeof (parsed as { session_id?: unknown }).session_id === "string")
			return (parsed as { session_id: string }).session_id;
	} catch {
		// Other providers emit their native ID as a plain string.
	}
	return value;
}

export class Harness implements HarnessProvider {
	private readonly process: SessionProcess;
	private readonly rootDir: string;
	private readonly readinessDeadlineMs: number;
	constructor(rootDir: string, process?: SessionProcess, readinessDeadlineMs = PROVIDER_READINESS_DEADLINE_MS) {
		this.rootDir = rootDir;
		this.process = process ?? new SessionProcess(new BunRunner(), rootDir);
		this.readinessDeadlineMs = readinessDeadlineMs;
	}

	launch(context: SessionLaunchContext): Promise<RunningExecution> {
		return this.start(context, { kind: "new" });
	}

	resume(nativeId: string, context: SessionLaunchContext): Promise<RunningExecution> {
		return this.start(context, { kind: "resume", nativeSessionId: nativeId });
	}

	private async start(
		context: SessionLaunchContext,
		intent: { kind: "new" } | { kind: "resume"; nativeSessionId: string },
	): Promise<RunningExecution> {
		const record = context.record as AgentSession;
		const executionId = randomUUID();
		const env = { ...context.configuration.config.presets[record.preset]?.env, ...context.preset.env };
		const preset = await resolveLaunchPreset(context.preset, { cwd: record.cwd, env });
		const options = {
			cwd: record.cwd,
			intent,
			sessionId: record.id,
			profile: context.profile,
			prompt: context.prompt,
			repositoryRoot: record.pathContext?.projectDir,
			taskRoot: record.pathContext?.taskDir,
			yolo: context.configuration.config.sessions?.yoloMode,
		};
		const preflight = await preflightAgentLaunch(preset, record.bootstrapPath, options);
		const taskDir = context.record.pathContext?.taskDir ?? dirname(record.bootstrapPath);
		const identityPath = join(taskDir, `${record.id}.native-session-id`);
		let owned = false;
		let prepared: Awaited<ReturnType<typeof prepareAgentLaunchResources>> | undefined;
		try {
			if (intent.kind === "resume") await this.process.assertNoPreparedResources(record);
			prepared = await prepareAgentLaunchResources(record.bootstrapPath, preflight);
			if (intent.kind === "new") await rm(identityPath, { force: true });
			await this.process.prepare(preset.prepare, record.cwd, prepared.env);
			await this.process.create(record, prepared.env);
			owned = true;
			await this.process.preparePane(record);
			prepared.env = workspaceContextInto(prepared.env, {
				// Test process doubles may omit pane lookup; SessionProcess resolves the created pane.
				paneId: (await this.process.paneId?.(record)) ?? "%0",
				rootDir: record.pathContext?.projectDir ?? this.rootDir,
				conversation: { taskId: context.taskId, modeId: context.modeId, sessionId: record.id },
				...(intent.kind === "resume" ? { nativeSessionId: intent.nativeSessionId } : {}),
			});
			await this.process.launchPrepared(record, prepared);
			const launchDirectory = prepared.resources.skill.path;
			const initializedPath = initializedReceiptPath(launchDirectory);
			if (intent.kind === "new") {
				const initializedExpected: ReadinessReceiptExpectation | undefined =
					context.preset.bootstrap === "claude" && prepared.identity
						? { session_id: prepared.identity.id }
						: prepared.identity?.id;
				await waitForReceipts([initializedPath], initializedExpected, record, this.process, this.readinessDeadlineMs);
				const nativeId = await observedNativeId(initializedPath);
				if (!nativeId) throw new Error(`Provider initialized receipt has no native identity for session ${record.id}.`);
				await waitForReceipts(
					[promptAcceptedReceiptPath(launchDirectory)],
					context.preset.bootstrap === "claude" ? { session_id: nativeId } : nativeId,
					record,
					this.process,
					this.readinessDeadlineMs,
				);
				if (context.preset.bootstrap === "opencode-v2") {
					if (!prepared.confirmSession)
						throw new Error(`OpenCode v2 confirmation is unavailable for session ${record.id}.`);
					if (!(await prepared.confirmSession(nativeId)))
						throw new Error(`OpenCode v2 could not confirm session ${nativeId} after prompt acceptance.`);
				}
			} else {
				const expected: ReadinessReceiptExpectation =
					context.preset.bootstrap === "claude"
						? { session_id: intent.nativeSessionId, source: "resume" }
						: intent.nativeSessionId;
				await waitForReceipts([initializedPath], expected, record, this.process, this.readinessDeadlineMs);
			}
			const identity = intent.kind === "resume" ? intent.nativeSessionId : await observedNativeId(initializedPath);
			if (!identity) throw new Error(`Provider identity missing for session ${record.id}.`);
			return this.execution(context, record, identity, prepared, executionId);
		} catch (cause) {
			let startupError = cause;
			let execution: RunningExecution | undefined;
			if (owned && prepared) {
				execution = this.execution(context, record, prepared.identity?.id ?? "", prepared, executionId);
				try {
					await execution.stop();
					execution = undefined;
				} catch (cleanupError) {
					startupError = new AggregateError(
						[cause, cleanupError],
						`Could not clean failed startup for session ${record.id}`,
					);
				}
			} else if (prepared) {
				try {
					await prepared.cleanup();
				} catch (cleanupError) {
					startupError = new AggregateError(
						[cause, cleanupError],
						`Could not clean failed startup for session ${record.id}`,
					);
				}
			}
			const failure = Object.assign(
				new Error(`Could not start session ${record.id}: ${cause instanceof Error ? cause.message : String(cause)}`, {
					cause: startupError,
				}),
				{
					identity: {
						taskId: context.taskId,
						modeId: context.modeId,
						sessionId: record.id,
						executionId,
						nativeSessionId: prepared?.identity?.id,
					},
					...(execution ? { execution } : {}),
				},
			) as RecoverableExecutionFailure;
			throw failure;
		}
	}

	private execution(
		context: SessionLaunchContext,
		record: AgentSession,
		nativeId: string,
		prepared: Awaited<ReturnType<typeof prepareAgentLaunchResources>>,
		executionId: string,
	): RunningExecution {
		const identity: ExecutionIdentity = {
			taskId: context.taskId,
			modeId: context.modeId,
			sessionId: record.id,
			executionId,
			nativeSessionId: nativeId,
		};
		const permissionWait: RunningExecution["events"]["permissionWait"] =
			context.preset.bootstrap === "opencode-v2" || context.preset.bootstrap === "pi" ? "unsupported" : "supported";
		const subscriptions = new Set<() => void>();
		return {
			identity,
			providerConversationId: nativeId,
			events: {
				turnCompleted: "supported",
				permissionWait,
				executionExit: "supported",
				activity: "supported",
			},
			input: (text) => this.process.input(record, text),
			sendKey: (key) => this.process.sendKey(record, key),
			stop: async () => {
				await this.process.kill(record);
				await prepared.cleanup();
			},
			observe: (listener) => {
				const statusPath = join(
					sessionActivityDir(context.record.pathContext?.taskDir ?? dirname(record.bootstrapPath), record.id),
					"status",
				);
				let active = true;
				const emit = async () => {
					if (!active) return;
					const value = (
						await Bun.file(statusPath)
							.text()
							.catch(() => "")
					).trim();
					const map: Record<string, RunningExecutionEvent> = {
						running: { kind: "activity", activity: "running" },
						idle: { kind: "turn-completed", activity: "idle" },
						waiting: { kind: "permission-wait", activity: "waiting" },
						error: { kind: "activity", activity: "error" },
					};
					const event = map[value];
					if (event) listener(event);
				};
				const watcher = watch(dirname(statusPath), emit);
				watcher.on("error", () => {});
				const exitProbe = setInterval(() => {
					void this.process.alive(record).then((pane) => {
						const exited = pane.stdout.trim() === "1" || pane.stderr === missingPaneStderr(record.id);
						if (active && exited) {
							listener({ kind: "execution-exit", exitCode: pane.exitCode });
							active = false;
							watcher.close();
							clearInterval(exitProbe);
						}
					});
				}, 250);
				const unsubscribe = () => {
					active = false;
					watcher.close();
					clearInterval(exitProbe);
					subscriptions.delete(unsubscribe);
				};
				subscriptions.add(unsubscribe);
				void emit();
				return unsubscribe;
			},
			teardownListeners() {
				for (const unsubscribe of subscriptions) unsubscribe();
			},
		};
	}
}
