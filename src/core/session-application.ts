import { agentFor } from "../agent-workspace/agents/agents.ts";
import { loadProjectModeCatalog, resolveAgentConfiguration, resolveSessionPreset } from "../agent-workspace/config.ts";
import {
	Harness,
	type HarnessProvider,
	type RecoverableExecutionFailure,
	type RunningExecution,
	type SessionLaunchContext,
} from "../agent-workspace/harness.ts";
import { type LifecycleCheckpoint, Session } from "../agent-workspace/session.ts";
import { BunRunner, SessionProcess } from "../agent-workspace/session-process.ts";
import {
	createSessionRecord,
	pathContextFor,
	profileFor,
	profileWithCurrentArtifacts,
	sessionCwdFor,
} from "../agent-workspace/session-service-mechanics.ts";
import { SessionMutationError, SessionStore } from "../agent-workspace/session-store.ts";
import { type SessionCreationIdentity, Task } from "../agent-workspace/task.ts";
import { type AgentSession, type ModeId, type ModeProfile, resolveSessionSettings } from "../agent-workspace/types.ts";
import type { Core } from "./agentic-workspace.ts";

type SessionApplicationOptions = {
	store?: SessionStore;
	harness?: HarnessProvider;
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
			new SessionStore(core.filesystem.rootDir, runner, async (record) => await resolveSessionPreset(core, record));
		this.harness =
			options.harness ?? new Harness(core.filesystem.rootDir, new SessionProcess(runner, core.filesystem.rootDir));
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
			record.nativeProvider = agentFor(preset.bootstrap)?.nativeNamespace;
			const provisionalSession = new Session(record, selectedMode);
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
			const launch = this.launchContext(session.record, selectedMode, resolved, preset, launchProfile);
			const captured: CapturedLaunch = { preset, launch };
			this.executions.set(this.key(taskId, session.id), session);
			let release: (() => Promise<void>) | undefined;
			try {
				release = await this.store.claimSession(taskId, session.id);
				await session.start({
					harness: this.harness,
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
				const pathContext = record.pathContext ?? (await pathContextFor(this.core, taskRecord.id, record.cwd));
				const launchProfile = await profileWithCurrentArtifacts(
					this.core,
					profile ?? modeProfile,
					taskId,
					pathContext.taskDir,
				);
				if (!launchProfile) throw new Error(`Mode profile unavailable: ${modeId}`);
				const launch = this.launchContext(record, modeId, resolved, preset, launchProfile);
				const session = new Session(record, modeId);
				this.capturedTasks.set(this.key(taskId, sessionId), {
					task: taskRecord,
					profiles: catalog.profiles,
					configuration: resolved,
				});
				this.executions.set(this.key(taskId, sessionId), session);
				this.executionIds.delete(this.key(taskId, sessionId));
				const nativeId = record.nativeSessionId ?? (await this.store.readNativeSessionIdCandidate(taskId, sessionId));
				if (!nativeId) throw new Error(`Session ${sessionId} has no exact native conversation identity to resume.`);
				await session.resume(nativeId, {
					harness: this.harness,
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
		await this.store.mutate(checkpoint.origin.taskId, async (state) => {
			const history = state.modes[checkpoint.origin.modeId];
			const current = history?.sessions.find(({ id }) => id === checkpoint.origin.sessionId);
			if (
				!history ||
				!current ||
				current.taskId !== checkpoint.origin.taskId ||
				current.createdAt !== checkpoint.record.createdAt
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
				if (!current || current.createdAt !== creation.createdAt)
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
		const legacy = state.modes[state.legacyModeId] ?? { sessions: [] };
		state.sessions = legacy.sessions;
		state.activeSessionId = legacy.activeSessionId;
	}

	private async withTaskAdmission<T>(
		taskId: string,
		operation: (task: NonNullable<Awaited<ReturnType<Core["loadTaskForMutation"]>>>) => Promise<T>,
	): Promise<T> {
		const task = await this.core.loadTaskForMutation(taskId, { includeCrossBranch: false });
		if (!task) throw new Error(`Task not found: ${taskId}`);
		return await this.core.filesystem.withTaskLock(task, async () => {
			const current = await this.core.loadTaskForMutation(taskId, { includeCrossBranch: false });
			if (!current || current.filePath !== task.filePath)
				throw new Error(`Task changed or no longer exists: ${taskId}`);
			return await operation(current);
		});
	}

	private key(taskId: string, sessionId: string): string {
		return `${taskId}:${sessionId}`;
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
