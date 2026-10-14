import { watch } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveLaunchPreset } from "./agents/opencode-resolution.ts";
import type {
	ExecutionIdentity,
	Harness as HarnessContract,
	RecoverableExecutionFailure,
	RunningExecution,
	RunningExecutionEvent,
	SessionLaunchContext,
} from "./session-contracts.ts";
import { prepareAgentLaunch } from "./session-launch.ts";
import { BunRunner, LAUNCH_PROBE_DURATION_MS, missingPaneStderr, SessionProcess } from "./session-process.ts";
import { sessionActivityDir } from "./status-hooks.ts";
import type { AgentSession } from "./types.ts";

async function receipt(path: string, expected?: string): Promise<boolean> {
	try {
		const value = (await readFile(path, "utf8")).trim();
		return !!value && (expected === undefined || value === expected);
	} catch {
		return false;
	}
}

async function waitForReceipts(
	paths: string[],
	expected: string | undefined,
	session: AgentSession,
	process: SessionProcess,
): Promise<void> {
	const firstPath = paths[0];
	if (!firstPath) throw new Error("No provider readiness receipts were configured.");
	const directory = dirname(firstPath);
	const deadline = Date.now() + LAUNCH_PROBE_DURATION_MS;
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
	throw new Error(`Provider readiness timed out for session ${session.id}.`);
}

export class Harness implements HarnessContract {
	private readonly process: SessionProcess;
	constructor(rootDir: string, process?: SessionProcess) {
		this.process = process ?? new SessionProcess(new BunRunner(), rootDir);
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
		const env = { ...context.configuration.config.presets[record.preset]?.env, ...context.preset.env };
		const preset = await resolveLaunchPreset(context.preset, { cwd: record.cwd, env });
		const prepared = await prepareAgentLaunch(preset, record.bootstrapPath, {
			cwd: record.cwd,
			intent,
			sessionId: record.id,
			profile: context.profile,
			prompt: context.prompt,
			repositoryRoot: record.pathContext?.projectDir,
			taskRoot: record.pathContext?.taskDir,
			yolo: context.configuration.config.sessions?.yoloMode,
		});
		const taskDir = context.record.pathContext?.taskDir ?? dirname(record.bootstrapPath);
		const identityPath = join(taskDir, `${record.id}.native-session-id`);
		const promptPath = join(taskDir, `${record.id}.prompt-accepted`);
		let owned = false;
		try {
			if (intent.kind === "new")
				await Promise.all([rm(identityPath, { force: true }), rm(promptPath, { force: true })]);
			await this.process.prepare(preset.prepare, record.cwd, prepared.env);
			if (intent.kind === "resume") await this.process.assertNoPreparedResources(record);
			await this.process.create(record, prepared.env);
			owned = true;
			await this.process.preparePane(record);
			await this.process.launchPrepared(record, prepared);
			const activityDir = sessionActivityDir(
				context.record.pathContext?.taskDir ?? dirname(record.bootstrapPath),
				record.id,
			);
			if (intent.kind === "new") {
				if (!prepared.identity) await waitForReceipts([identityPath], undefined, record, this.process);
				await waitForReceipts([promptPath], undefined, record, this.process);
			} else {
				await waitForReceipts([join(activityDir, "status")], undefined, record, this.process);
			}
			const identity = prepared.identity?.id ?? (await readFile(identityPath, "utf8")).trim();
			if (!identity) throw new Error(`Provider identity missing for session ${record.id}.`);
			return this.execution(context, record, identity, prepared);
		} catch (cause) {
			let startupError = cause;
			if (!owned) {
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
				new Error(
					`Could not start session ${record.id}: ${startupError instanceof Error ? startupError.message : String(startupError)}`,
					{
						cause: startupError,
					},
				),
				{
					identity: {
						taskId: context.taskId,
						modeId: context.modeId,
						sessionId: record.id,
						executionId: record.id,
						nativeSessionId: prepared.identity?.id,
					},
					...(owned ? { execution: this.execution(context, record, prepared.identity?.id ?? "", prepared) } : {}),
				},
			) as RecoverableExecutionFailure;
			throw failure;
		}
	}

	private execution(
		context: SessionLaunchContext,
		record: AgentSession,
		nativeId: string,
		prepared: Awaited<ReturnType<typeof prepareAgentLaunch>>,
	): RunningExecution {
		const identity: ExecutionIdentity = {
			taskId: context.taskId,
			modeId: context.modeId,
			sessionId: record.id,
			executionId: record.id,
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
