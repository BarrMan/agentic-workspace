import { stat } from "node:fs/promises";
import { type LifecycleCheckpoint, Session, type SessionRuntime } from "../model/session/session.ts";
import { type AgentSession, type ModeId, type ModeProfile, resolveSessionSettings } from "../model/session/types.ts";
import { type SessionCreationIdentity, Task } from "../model/task/task.ts";
import { taskIdKey, taskIdsEqual } from "../model/task/task-id.ts";
import { harnessRegistry } from "../runtime/agents/startup.ts";
import { buildAgentResumeCommand } from "../runtime/bootstrap.ts";
import { ExactResumeUnavailableError } from "../runtime/errors/sessions.ts";
import {
	Harness,
	type HarnessProvider,
	type RecoverableExecutionFailure,
	type RunningExecution,
	type SessionLaunchContext,
} from "../runtime/harness.ts";
import { preflightAgentLaunch } from "../runtime/session-launch.ts";
import { BunRunner, SessionProcess } from "../runtime/session-process.ts";
import {
	createSessionRecord,
	pathContextFor,
	profileFor,
	profileWithCurrentArtifacts,
	sameRoot,
	sessionCwdFor,
} from "../runtime/session-service-mechanics.ts";
import { loadProjectModeCatalog, resolveAgentConfiguration, resolveSessionPreset } from "../storage/config.ts";
import { SessionMutationError } from "../storage/errors/session.ts";
import { SessionStore } from "../storage/session-store.ts";
import type { Core } from "./agentic-workspace.ts";

type SessionApplicationOptions = {
	store?: SessionStore;
	harness?: HarnessProvider;
	stateRoot?: string;
};

type CapturedLaunch = {
	readonly preset: Awaited<ReturnType<typeof profileFor>>["preset"];
	readonly launch: SessionLaunchContext;
};

type CapturedTask = {
	readonly task: NonNullable<Awaited<ReturnType<Core["loadTaskForMutation"]>>>;
	readonly profiles: Record<ModeId, ModeProfile>;
	readonly configuration: Awaited<ReturnType<typeof resolveAgentConfiguration>>;
};

/**
 * Application boundary for the migrated new/resume/stop lifecycle. Core.sessions remains the
 * compatibility route for operations this slice has not migrated.
 */
export class SessionApplication {
	readonly store: SessionStore;
	private readonly harness: HarnessProvider;
	private readonly runtime: SessionRuntime;
	private readonly executions = new Map<string, Session>();
	private readonly executionIds = new Map<string, string>();
	private readonly capturedTasks = new Map<string, CapturedTask>();

	constructor(
		private readonly core: Core,
		options: SessionApplicationOptions = {},
	) {
		const runner = new BunRunner();
		this.store =
			options.store ??
			new SessionStore(core.projectRoot, runner, async (record) => await resolveSessionPreset(core, record), {
				stateRoot: options.stateRoot,
			});
		this.harness = options.harness ?? new Harness(core.projectRoot, new SessionProcess(runner, core.projectRoot));
		this.runtime = {
			start: (context) => this.harness.launch(context),
			resume: (providerSessionId, context) => this.harness.resume(providerSessionId, context),
			stop: async (execution) => await execution.stop(),
			observe: (execution, listener) => execution.observe(listener),
		};
	}

	private persistExecutionExit(session: Session, modeId: ModeId): void {
		const key = this.key(session.record.taskId, session.id);
		const unsubscribe = session.subscribe((event) => {
			if (event.kind !== "execution-exit") return;
			unsubscribe();
			void this.store
				.mutate(event.record.taskId, async (state) => {
					if (this.executions.get(key) !== session) return;
					const captured = this.capturedTasks.get(key);
					if (!captured) throw new Error(`Missing captured task configuration for session ${session.id}.`);
					const task = await this.hydrateFromState(
						captured.task,
						captured.profiles,
						captured.configuration,
						state,
						session,
					);
					task.updateSessionRecord(modeId, { ...event.record });
					this.writeTask(task, state);
				})
				.catch((error) => console.error(`Could not persist exited session ${session.id}:`, error));
		});
	}

	/** Compatibility entry point for operations not yet represented by this vertical slice. */
	get compatibility() {
		return this.core.sessions;
	}

	async newSession(taskId: string, modeId?: ModeId, presetName?: string): Promise<AgentSession> {
		return await this.withTaskAdmission(taskId, async (taskRecord) => {
			const resolved = await resolveAgentConfiguration(this.core, taskId);
			const catalog = await loadProjectModeCatalog(this.core);
			const selectedMode = modeId ?? catalog.defaultModeId;
			const modeProfile = catalog.profiles[selectedMode];
			if (!modeProfile) throw new Error(`Unknown mode '${selectedMode}'.`);
			const selectedPreset = presetName ?? resolved.config.selectedPreset;
			const configuredPreset = resolved.config.presets[selectedPreset];
			if (!configuredPreset) throw new Error(`Agent preset not found: ${selectedPreset}`);
			const settings = resolveSessionSettings(resolved.config);
			const pathContext = await pathContextFor(
				this.core,
				taskRecord.id,
				await sessionCwdFor(this.core, taskRecord, settings),
			);
			const { profile, preset } = await profileFor(this.core, selectedMode, configuredPreset);
			const effectiveProfile = profile ?? modeProfile;
			const launchProfile = await profileWithCurrentArtifacts(
				this.core,
				effectiveProfile,
				taskRecord.id,
				pathContext.taskDir,
			);
			if (!launchProfile) throw new Error(`Mode profile unavailable: ${selectedMode}`);
			const record = await createSessionRecord(this.store, taskRecord.id, selectedPreset, pathContext);
			record.nativeProvider = harnessRegistry.find(preset.bootstrap)?.nativeNamespace;
			record.nativeWorkspace = true;
			const provisionalSession = new Session(record, selectedMode, this.runtime);
			let creation!: SessionCreationIdentity;
			let session!: Session;
			this.capturedTasks.set(this.key(taskId, record.id), {
				task: taskRecord,
				profiles: catalog.profiles,
				configuration: resolved,
			});
			try {
				await this.store.mutate(taskId, async (state) => {
					const fresh = await this.hydrateFromState(taskRecord, catalog.profiles, resolved, state, provisionalSession);
					const history = fresh.modes[selectedMode];
					if (history?.sessions.some(({ status }) => status === "starting"))
						throw new Error(`Mode ${selectedMode} for task ${taskId} already has a pending launch.`);
					const active = history?.sessions.find(({ id }) => id === history.activeSessionId);
					if (active?.status === "running")
						throw new Error(`Mode ${selectedMode} for task ${taskId} already has a running session.`);
					const reserved = fresh.reserveSession(selectedMode);
					creation = reserved.creation;
					session = reserved.session;
					fresh.updateSessionRecord(selectedMode, session.serialize());
					this.writeTask(fresh, state);
				});
			} catch (error) {
				if (error instanceof SessionMutationError && error.writeCommitted && creation)
					await this.rollbackCreation(provisionalSession, creation, error);
				else this.capturedTasks.delete(this.key(taskId, record.id));
				throw error;
			}
			let release: (() => Promise<void>) | undefined;
			try {
				const launch = this.launchContext(session.record, selectedMode, resolved, preset, launchProfile);
				const captured: CapturedLaunch = { preset, launch };
				this.executions.set(this.key(taskId, session.id), session);
				this.persistExecutionExit(session, selectedMode);
				release = await this.store.claimSession(taskId, session.id);
				await session.start({
					context: captured.launch,
					checkpoint: async (checkpoint) => await this.publish(session, checkpoint),
				});
				return session.serialize();
			} catch (error) {
				await this.rollbackCreation(session, creation, error);
				throw error;
			} finally {
				await release?.();
			}
		});
	}

	async resumeSession(taskId: string, sessionId: string): Promise<AgentSession> {
		return await this.withTaskAdmission(taskId, async (taskRecord) => {
			const state = await this.store.read(taskId);
			const owner = Object.entries(state.modes).find(([, history]) =>
				history.sessions.some(({ id }) => id === sessionId),
			);
			if (!owner) throw new Error(`Agent session not found: ${sessionId}`);
			const [modeId, history] = owner;
			const record = history.sessions.find(({ id }) => id === sessionId);
			if (!record) throw new Error(`Agent session not found: ${sessionId}`);
			const release = await this.store.claimSession(taskId, sessionId);
			try {
				const resolved = await resolveAgentConfiguration(this.core, taskId);
				const catalog = await loadProjectModeCatalog(this.core);
				const modeProfile = catalog.profiles[modeId];
				if (!modeProfile) throw new Error(`Unknown mode '${modeId}'.`);
				const configuredPreset = resolved.config.presets[record.preset];
				if (!configuredPreset) throw new Error(`Agent preset not found for existing session: ${record.preset}`);
				const { profile, preset } = await profileFor(this.core, modeId, configuredPreset);
				const agent = harnessRegistry.find(preset.bootstrap);
				if (record.nativeProvider && agent?.nativeNamespace && record.nativeProvider !== agent.nativeNamespace)
					throw new Error(
						`Session ${record.id} belongs to provider ${record.nativeProvider}, not ${agent.nativeNamespace}.`,
					);
				const settings = resolveSessionSettings(resolved.config);
				const marker = record.resumeProbeFailed;
				if (
					marker &&
					record.nativeProvider === marker.nativeProvider &&
					record.nativeSessionId === marker.nativeSessionId
				)
					throw new ExactResumeUnavailableError(
						"previous-resume-failed",
						marker.nativeProvider,
						marker.nativeSessionId,
						record.error ? new Error(record.error) : undefined,
					);
				if (!settings.autoResumeOnRestart)
					throw new ExactResumeUnavailableError("auto-resume-disabled", record.nativeProvider, record.nativeSessionId);
				const pathContext = record.pathContext ?? (await pathContextFor(this.core, taskRecord.id, record.cwd));
				if (!sameRoot(pathContext.projectDir, this.core.projectRoot))
					throw new Error(`Session ${record.id} has a mismatched canonical project root.`);
				if (
					!(await stat(pathContext.worktreeDir)
						.then((result) => result.isDirectory())
						.catch(() => false))
				)
					throw new Error(`Session ${record.id} working directory is missing: ${pathContext.worktreeDir}`);
				const launchProfile = await profileWithCurrentArtifacts(
					this.core,
					profile ?? modeProfile,
					taskId,
					pathContext.taskDir,
				);
				if (!launchProfile) throw new Error(`Mode profile unavailable: ${modeId}`);
				const nativeId = record.nativeSessionId;
				if (!nativeId) throw new Error(`Session ${sessionId} has no exact native conversation identity to resume.`);
				buildAgentResumeCommand(preset, nativeId);
				await preflightAgentLaunch(preset, record.bootstrapPath, {
					cwd: pathContext.worktreeDir,
					intent: { kind: "resume", nativeSessionId: nativeId },
					sessionId,
					yolo: settings.yoloMode,
					profile: launchProfile,
					repositoryRoot: pathContext.projectDir,
					taskRoot: pathContext.taskDir,
				});
				const revalidatedState = await this.store.read(taskId);
				const revalidated = Object.values(revalidatedState.modes)
					.flatMap(({ sessions }) => sessions)
					.find(({ id }) => id === sessionId);
				if (
					!revalidated ||
					revalidated.createdAt !== record.createdAt ||
					revalidated.nativeSessionId !== record.nativeSessionId ||
					revalidated.ownerPid !== record.ownerPid
				)
					throw new Error(`Session ${sessionId} changed during exact-resume preflight.`);
				const launch = this.launchContext(record, modeId, resolved, preset, launchProfile);
				const session = new Session(record, modeId, this.runtime);
				this.capturedTasks.set(this.key(taskId, sessionId), {
					task: taskRecord,
					profiles: catalog.profiles,
					configuration: resolved,
				});
				this.executions.set(this.key(taskId, sessionId), session);
				this.persistExecutionExit(session, modeId);
				this.executionIds.delete(this.key(taskId, sessionId));
				await session.resume({
					context: launch,
					checkpoint: async (checkpoint) => await this.publish(session, checkpoint),
				});
				return session.serialize();
			} finally {
				await release();
			}
		});
	}

	async stopSession(taskId: string, sessionId: string): Promise<void> {
		return await this.withTaskAdmission(taskId, async () => {
			const release = await this.store.claimSession(taskId, sessionId);
			try {
				const session = this.executions.get(this.key(taskId, sessionId));
				if (!session) throw new Error(`Session execution is not owned by this application: ${sessionId}`);
				const durable = await this.store.read(taskId);
				const current = Object.values(durable.modes)
					.flatMap(({ sessions }) => sessions)
					.find(({ id }) => id === sessionId);
				if (!current || !taskIdsEqual(current.taskId, taskId) || current.createdAt !== session.record.createdAt)
					throw new Error(`Session ${sessionId} was removed or replaced before stop.`);
				if (current.ownerPid !== session.record.ownerPid)
					throw new Error(`Session ${sessionId} execution authority changed before stop.`);
				const execution = session.execution;
				if (execution && execution.identity.executionId !== this.executionIds.get(this.key(taskId, sessionId)))
					throw new Error(`Session ${sessionId} execution incarnation is no longer current.`);
				await session.stop({ checkpoint: async (checkpoint) => await this.publish(session, checkpoint) });
				this.executions.delete(this.key(taskId, sessionId));
				this.executionIds.delete(this.key(taskId, sessionId));
				this.capturedTasks.delete(this.key(taskId, sessionId));
			} finally {
				await release();
			}
		});
	}

	private async publish(session: Session, checkpoint: LifecycleCheckpoint): Promise<void> {
		const owner = this.executions.get(this.key(checkpoint.origin.taskId, checkpoint.origin.sessionId));
		const key = this.key(checkpoint.origin.taskId, checkpoint.origin.sessionId);
		const executionId = session.execution?.identity.executionId;
		const capturedExecutionId = this.executionIds.get(key);
		if (owner !== session || (executionId && capturedExecutionId && executionId !== capturedExecutionId))
			throw new Error(`Stale execution publication for session ${checkpoint.origin.sessionId}.`);
		if (executionId) this.executionIds.set(key, executionId);
		else if (!capturedExecutionId)
			throw new Error(`Session ${checkpoint.origin.sessionId} has no owned execution publication token.`);
		const expectedExecutionId = capturedExecutionId ?? executionId;
		await this.store.mutate(checkpoint.origin.taskId, async (state) => {
			const currentExecution = session.execution;
			const currentExecutionId = currentExecution?.identity.executionId;
			if (
				this.executions.get(key) !== session ||
				(this.executionIds.get(key) !== undefined && this.executionIds.get(key) !== expectedExecutionId) ||
				(expectedExecutionId !== undefined &&
					currentExecutionId !== undefined &&
					expectedExecutionId !== currentExecutionId) ||
				(executionId !== undefined && currentExecutionId !== executionId)
			)
				throw new Error(`Stale execution publication for session ${checkpoint.origin.sessionId}.`);
			const history = state.modes[checkpoint.origin.modeId];
			const current = history?.sessions.find(({ id }) => id === checkpoint.origin.sessionId);
			if (
				!history ||
				!current ||
				!taskIdsEqual(current.taskId, checkpoint.origin.taskId) ||
				current.createdAt !== checkpoint.record.createdAt ||
				current.ownerPid !== (checkpoint.phase === "update" ? checkpoint.previous.ownerPid : checkpoint.record.ownerPid)
			)
				throw new Error(`Session ${checkpoint.origin.sessionId} was removed or replaced before publication.`);
			if (
				checkpoint.phase === "identity" &&
				current.nativeSessionId !== undefined &&
				checkpoint.record.nativeSessionId !== undefined &&
				current.nativeSessionId !== checkpoint.record.nativeSessionId
			)
				throw new Error(`Session ${checkpoint.origin.sessionId} native identity changed before publication.`);
			const next = checkpoint.applyTo(current);
			const captured = this.capturedTasks.get(this.key(checkpoint.origin.taskId, checkpoint.origin.sessionId));
			if (!captured) throw new Error(`Missing captured task configuration for session ${checkpoint.origin.sessionId}.`);
			const task = await this.hydrateFromState(
				captured.task,
				captured.profiles,
				captured.configuration,
				state,
				session,
			);
			task.updateSessionRecord(checkpoint.origin.modeId, next);
			if (checkpoint.phase === "update" && checkpoint.reason === "stop")
				task.selectSurvivorAfterStop(checkpoint.origin.modeId, checkpoint.origin.sessionId);
			this.writeTask(task, state);
		});
	}

	private async rollbackCreation(
		session: Session,
		creation: SessionCreationIdentity,
		original: unknown,
	): Promise<void> {
		const errors: unknown[] = [original];
		try {
			const execution = session.execution ?? recoverableExecution(original);
			if (execution) await execution.stop();
		} catch (error) {
			errors.push(error);
			throw new AggregateError(
				errors,
				"Creation failed and execution cleanup failed; reservation retained for recovery.",
			);
		}
		try {
			await this.store.mutate(creation.taskId, async (state) => {
				const history = state.modes[creation.modeId];
				const current = history?.sessions.find(({ id }) => id === creation.provisionalSessionId);
				if (!current) return;
				if (current.createdAt !== creation.createdAt)
					throw new Error(`Creation incarnation no longer matches: ${creation.provisionalSessionId}`);
				const captured = this.capturedTasks.get(this.key(creation.taskId, creation.provisionalSessionId));
				if (!captured)
					throw new Error(`Missing captured task configuration for creation ${creation.provisionalSessionId}.`);
				const task = await this.hydrateFromState(
					captured.task,
					captured.profiles,
					captured.configuration,
					state,
					session,
				);
				task.rollbackSession(creation);
				this.writeTask(task, state);
			});
		} catch (rollbackError) {
			errors.push(rollbackError);
			throw new AggregateError(errors, "Creation failed and rollback failed; reservation retained for recovery.");
		}
		this.executions.delete(this.key(creation.taskId, creation.provisionalSessionId));
		this.executionIds.delete(this.key(creation.taskId, creation.provisionalSessionId));
		this.capturedTasks.delete(this.key(creation.taskId, creation.provisionalSessionId));
	}

	private launchContext(
		record: AgentSession,
		modeId: ModeId,
		configuration: Awaited<ReturnType<typeof resolveAgentConfiguration>>,
		preset: CapturedLaunch["preset"],
		profile: ModeProfile,
	): SessionLaunchContext {
		return {
			taskId: record.taskId,
			modeId,
			sessionId: record.id,
			record,
			configuration,
			profile,
			preset,
			prompt: profile.prompt,
		};
	}

	private async hydrateFromState(
		taskRecord: Awaited<ReturnType<Core["loadTaskForMutation"]>>,
		profiles: Record<ModeId, ModeProfile>,
		configuration: Awaited<ReturnType<typeof resolveAgentConfiguration>>,
		state: Awaited<ReturnType<SessionStore["read"]>>,
		session: Session,
	): Promise<Task> {
		if (!taskRecord) throw new Error("Task not found.");
		return new Task({
			task: taskRecord,
			modes: profiles,
			configuration,
			sessionRecords: state.modes,
			selectedModeId: Object.keys(profiles)[0] ?? "",
			createSession: () => session,
		});
	}

	private writeTask(task: Task, state: Awaited<ReturnType<SessionStore["read"]>>): void {
		state.modes = task.serializeSessions();
	}

	private async withTaskAdmission<T>(
		taskId: string,
		operation: (task: NonNullable<Awaited<ReturnType<Core["loadTaskForMutation"]>>>) => Promise<T>,
	): Promise<T> {
		const task = await this.core.loadTaskForMutation(taskId);
		if (!task) throw new Error(`Task not found: ${taskId}`);
		return await this.core.withTaskLock(task, async () => {
			const current = await this.core.loadTaskForMutation(taskId);
			if (!current || current.filePath !== task.filePath)
				throw new Error(`Task changed or no longer exists: ${taskId}`);
			return await operation(current);
		});
	}

	private key(taskId: string, sessionId: string): string {
		return `${taskIdKey(taskId)}:${sessionId}`;
	}
}

function recoverableExecution(error: unknown): RunningExecution | undefined {
	if (!isRecoverableExecutionFailure(error)) return undefined;
	return error.execution;
}

function isRecoverableExecutionFailure(error: unknown): error is RecoverableExecutionFailure {
	if (!(error instanceof Error) || !("execution" in error)) return false;
	const execution = error.execution;
	return (
		typeof execution === "object" && execution !== null && "stop" in execution && typeof execution.stop === "function"
	);
}
