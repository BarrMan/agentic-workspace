import { randomUUID } from "node:crypto";
import { watch } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { RecoverableExecutionFailure } from "../model/session/session.ts";
import type {
	AgentSession,
	ExecutionIdentity,
	HarnessProvider,
	RunningExecution,
	RunningExecutionEvent,
	SessionLaunchContext,
} from "../model/session/types.ts";
import type {
	HarnessInterface,
	IdentityCaptureRequest,
	NativeIdentity,
	ReadinessExpectation,
	SessionIntent,
} from "./agents/core/agent.ts";
import { resolveLaunchPreset } from "./agents/opencode/opencode-resolution.ts";
import { harnessRegistry } from "./agents/startup.ts";
import { preflightAgentLaunch, prepareAgentLaunchResources } from "./session-launch.ts";
import type { SessionProcess } from "./session-process.ts";
import { sessionActivityDir } from "./status-hooks.ts";
import { workspaceContextInto } from "./workspace-context.ts";

export const PROVIDER_READINESS_DEADLINE_MS = 10_000;

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
	path: string,
	expected: ReadinessReceiptExpectation | undefined,
	session: AgentSession,
	process: SessionProcess,
	timeoutMs = PROVIDER_READINESS_DEADLINE_MS,
): Promise<void> {
	const directory = dirname(path);
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const pane = await process.alive(session);
		if (pane.exitCode !== 0 || pane.stdout.trim() !== "0")
			throw new Error(`Agent startup failed for session ${session.id}: owned pane exited.`);
		if (await receipt(path, expected)) return;
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
			void receipt(path, expected).then((found) => {
				if (found) {
					clearTimeout(timer);
					watcher.close();
					resolve();
				}
			});
		});
	}
	const mismatched = await receiptExists(path);
	throw new Error(
		`Provider readiness timed out for session ${session.id}; ${mismatched ? "mismatched" : "missing"} ${basename(path)} receipt.`,
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

export class Harness implements HarnessProvider {
	private readonly process: SessionProcess;
	private readonly rootDir: string;
	private readonly readinessDeadlineMs: number;
	constructor(rootDir: string, process: SessionProcess, readinessDeadlineMs = PROVIDER_READINESS_DEADLINE_MS) {
		this.rootDir = rootDir;
		this.process = process;
		this.readinessDeadlineMs = readinessDeadlineMs;
	}

	launch(context: SessionLaunchContext): Promise<RunningExecution> {
		return this.start(context, { kind: "new" });
	}

	resume(nativeId: string, context: SessionLaunchContext): Promise<RunningExecution> {
		if (!nativeId.trim()) return Promise.reject(new Error("Resume requires a non-empty retained provider session ID."));
		return this.start(context, { kind: "resume", nativeSessionId: nativeId });
	}

	private async start(context: SessionLaunchContext, intent: SessionIntent): Promise<RunningExecution> {
		const record = context.record as AgentSession;
		try {
			if (!(await stat(record.cwd)).isDirectory()) throw new Error("Not a directory.");
		} catch (cause) {
			throw new Error(`Session working directory is unavailable: ${record.cwd}`, { cause });
		}
		const executionId = randomUUID();
		const env = { ...context.configuration.config.presets[record.preset]?.env, ...context.preset.env };
		const preset = await resolveLaunchPreset(context.preset, { cwd: record.cwd, env });
		const agent = harnessRegistry.forPreset(preset.bootstrap);
		if (!agent.readiness) throw new Error(`Agent ${agent.name} does not provide Harness readiness evidence.`);
		const options = {
			cwd: record.cwd,
			intent,
			sessionId: record.id,
			taskId: context.taskId,
			modeId: context.modeId,
			profile: context.profile,
			prompt: context.prompt,
			repositoryRoot: record.pathContext?.projectDir,
			taskRoot: record.pathContext?.taskDir,
			yolo: context.configuration.config.sessions?.yoloMode,
		};
		const preflight = await preflightAgentLaunch(preset, record.bootstrapPath, options);
		let owned = false;
		let paneId: string | undefined;
		let prepared: Awaited<ReturnType<typeof prepareAgentLaunchResources>> | undefined;
		try {
			if (intent.kind === "resume") await this.process.assertNoPreparedResources(record);
			prepared = await prepareAgentLaunchResources(record.bootstrapPath, preflight);
			await this.process.prepare(preset.prepare, record.cwd, prepared.env);
			await this.process.create(record, prepared.env, (captured) => {
				owned = true;
				paneId = captured;
			});
			owned = true;
			await this.process.preparePane(record);
			paneId ??= await this.process.paneId(record);
			prepared.env = workspaceContextInto(prepared.env, {
				paneId,
				rootDir: record.pathContext?.projectDir ?? this.rootDir,
				conversation: { taskId: context.taskId, modeId: context.modeId, sessionId: record.id },
				...(intent.kind === "resume" ? { nativeSessionId: intent.nativeSessionId } : {}),
			});
			await this.process.launchPrepared(record, prepared);
			const readiness = agent.readiness(intent, prepared.resources.skill.path, prepared.identity);
			await waitForReceipts(
				readiness.initialized.path,
				readiness.initialized.expected,
				record,
				this.process,
				this.readinessDeadlineMs,
			);
			if (intent.kind === "new") {
				if (!readiness.promptAccepted)
					throw new Error(`Provider prompt acceptance evidence is unavailable for session ${record.id}.`);
				await waitForReceipts(
					readiness.promptAccepted.path,
					readiness.promptAccepted.expected,
					record,
					this.process,
					this.readinessDeadlineMs,
				);
			}
			const identity = await this.captureIdentity(agent, {
				intent,
				preset,
				cwd: record.cwd,
				env: prepared.env,
				launchDirectory: prepared.resources.skill.path,
				...(prepared.identity ? { preparedIdentity: prepared.identity } : {}),
			});
			if (!identity || typeof identity.id !== "string" || !identity.id.trim())
				throw new Error(`Provider returned an invalid native identity for session ${record.id}.`);
			if (intent.kind === "resume" && identity.id !== intent.nativeSessionId)
				throw new Error(
					`Provider returned native identity '${identity.id}' instead of resumed session '${intent.nativeSessionId}'.`,
				);
			return this.execution(agent, context, record, identity.id, prepared, executionId, paneId);
		} catch (cause) {
			let startupError = cause;
			let execution: RunningExecution | undefined;
			if (owned && prepared) {
				execution = this.execution(agent, context, record, prepared.identity?.id ?? "", prepared, executionId, paneId);
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
					execution = {
						...this.execution(agent, context, record, prepared.identity?.id ?? "", prepared, executionId),
						stop: prepared.cleanup,
					};
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

	private async captureIdentity(
		agent: HarnessInterface,
		request: Omit<IdentityCaptureRequest, "signal">,
	): Promise<NativeIdentity> {
		const controller = new AbortController();
		let timer: ReturnType<typeof setTimeout> | undefined;
		const deadline = new Promise<never>((_resolve, reject) => {
			timer = setTimeout(() => {
				const error = new Error("Provider identity capture timed out.");
				controller.abort(error);
				reject(error);
			}, this.readinessDeadlineMs);
		});
		try {
			return await Promise.race([agent.reconcileIdentity({ ...request, signal: controller.signal }), deadline]);
		} finally {
			if (timer) clearTimeout(timer);
		}
	}

	private execution(
		agent: HarnessInterface,
		context: SessionLaunchContext,
		record: AgentSession,
		nativeId: string,
		prepared: Awaited<ReturnType<typeof prepareAgentLaunchResources>>,
		executionId: string,
		paneId?: string,
	): RunningExecution {
		const identity: ExecutionIdentity = {
			taskId: context.taskId,
			modeId: context.modeId,
			sessionId: record.id,
			executionId,
			nativeSessionId: nativeId,
		};
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
				if (paneId) await this.process.killCaptured(record, paneId);
				else await this.process.kill(record);
				await prepared.cleanup();
			},
			observe: (listener) => {
				const statusPath = join(sessionActivityDir(dirname(record.bootstrapPath), record.id), "status");
				let active = true;
				const emit = async () => {
					if (!active) return;
					const value = (
						await Bun.file(statusPath)
							.text()
							.catch(() => "")
					).trim();
					const observedAt = Date.now();
					const map: Record<string, RunningExecutionEvent> = {
						running: { kind: "activity", activity: "running", observedAt },
						idle: { kind: "turn-completed", activity: "idle", observedAt },
						waiting: { kind: "permission-wait", activity: "waiting", observedAt },
						error: { kind: "activity", activity: "error", observedAt },
					};
					listener(map[value] ?? { kind: "activity", activity: "unknown", observedAt });
				};
				const watcher = watch(dirname(statusPath), emit);
				watcher.on("error", () => {});
				const exitProbe = setInterval(() => {
					void this.process.nativeRuntimeClassification(record).then((runtime) => {
						const exited = runtime.status === "dead" || runtime.status === "missing";
						if (active && exited) {
							listener({
								kind: "execution-exit",
								exitCode: runtime.status === "missing" ? 1 : 0,
								observedAt: Date.now(),
							});
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
