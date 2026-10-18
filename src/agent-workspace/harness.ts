import { randomUUID } from "node:crypto";
import { watch } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { ReadinessExpectation } from "./agents/agent.ts";
import { agentFor } from "./agents/agents.ts";
import { resolveLaunchPreset } from "./agents/opencode-resolution.ts";
import { preflightAgentLaunch, prepareAgentLaunchResources } from "./session-launch.ts";
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

export type ReadinessReceiptExpectation = ReadinessExpectation;

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
		if (!nativeId.trim()) return Promise.reject(new Error("Resume requires a non-empty retained provider session ID."));
		return this.start(context, { kind: "resume", nativeSessionId: nativeId });
	}

	private async start(
		context: SessionLaunchContext,
		intent: { kind: "new" } | { kind: "resume"; nativeSessionId: string },
	): Promise<RunningExecution> {
		const record = context.record as AgentSession;
		const agent = agentFor(context.preset.bootstrap);
		if (!agent) throw new Error(`No agent registered for bootstrap type ${context.preset.bootstrap}.`);
		if (!agent.readiness) throw new Error(`Agent ${agent.name} does not provide Harness readiness evidence.`);
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
			const readiness = agent.readiness(intent, prepared.resources.skill.path, prepared.identity);
			await waitForReceipts(
				[readiness.initialized.path],
				readiness.initialized.expected,
				record,
				this.process,
				this.readinessDeadlineMs,
			);
			const observedId = await observedNativeId(readiness.initialized.path);
			if (!observedId || !observedId.trim())
				throw new Error(`Provider initialized receipt has no native identity for session ${record.id}.`);
			if (intent.kind === "new") {
				if (!readiness.promptAccepted)
					throw new Error(`Provider prompt acceptance evidence is unavailable for session ${record.id}.`);
				await waitForReceipts(
					[readiness.promptAccepted.path],
					readiness.promptAccepted.expected,
					record,
					this.process,
					this.readinessDeadlineMs,
				);
				if (readiness.confirmationRequired && !prepared.confirmSession)
					throw new Error(`Provider session confirmation is unavailable for session ${record.id}.`);
				if (prepared.confirmSession && !(await prepared.confirmSession(observedId)))
					throw new Error(`Provider could not confirm session ${observedId} after prompt acceptance.`);
			}
			const identity = intent.kind === "resume" ? intent.nativeSessionId : observedId;
			if (!identity?.trim()) throw new Error(`Provider identity missing for session ${record.id}.`);
			return await this.execution(context, record, identity, prepared, executionId);
		} catch (cause) {
			let startupError = cause;
			let execution: RunningExecution | undefined;
			if (owned && prepared) {
				execution = await this.execution(context, record, prepared.identity?.id ?? "", prepared, executionId);
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

	private async execution(
		context: SessionLaunchContext,
		record: AgentSession,
		nativeId: string,
		prepared: Awaited<ReturnType<typeof prepareAgentLaunchResources>>,
		executionId: string,
	): Promise<RunningExecution> {
		const paneId = await this.process.paneId(record, { roles: ["live-preview"] });
		const identity: ExecutionIdentity = {
			taskId: context.taskId,
			modeId: context.modeId,
			sessionId: record.id,
			executionId,
			nativeSessionId: nativeId,
		};
		const agent = agentFor(context.preset.bootstrap);
		if (!agent) throw new Error(`No agent registered for bootstrap type ${context.preset.bootstrap}.`);
		const subscriptions = new Set<() => void>();
		return {
			identity,
			providerConversationId: nativeId,
			events: agent.events ?? {
				turnCompleted: "unsupported",
				permissionWait: "unsupported",
				executionExit: "unsupported",
				activity: "unsupported",
			},
			input: (text) => this.process.input(record, text),
			sendKey: (key) => this.process.sendKey(record, key),
			stop: async () => {
				if (typeof this.process.killCaptured === "function") await this.process.killCaptured(record, paneId);
				else await this.process.kill(record);
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
