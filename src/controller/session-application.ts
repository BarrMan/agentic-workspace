import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { DEFAULT_STATUSES } from "../model/constants.ts";
import type { Session } from "../model/session/session.ts";
import { nativeSessionName } from "../model/session/session-utils.ts";
import type {
	AgentSession,
	ModeId,
	ModeProfile,
	SessionAskContext,
	SessionFactory,
	SessionLaunchContext,
	SessionSnapshot,
} from "../model/session/types.ts";
import { resolveInProgressStatus } from "../model/task/status.ts";
import { type SessionCreationIdentity, Task } from "../model/task/task.ts";
import { taskIdKey, taskIdsEqual } from "../model/task/task-id.ts";
import { getTerminalStatus, isTerminalStatus } from "../model/task/terminal-status.ts";
import { loadProjectModeCatalog, resolveAgentConfiguration } from "../storage/config.ts";
import type { SessionStore } from "../storage/session-store.ts";
import type { Storage } from "../storage/storage.ts";
import type { Core } from "./agentic-workspace.ts";

export interface ObservedSession {
	readonly record: AgentSession;
	readonly snapshot: SessionSnapshot;
}

export interface PreparedSessionStop {
	readonly record: AgentSession;
	stop(): Promise<void>;
	release(): Promise<void>;
}

export interface SessionAttachmentContext {
	readonly record: AgentSession;
	readonly snapshot: SessionSnapshot;
	readonly ownedByThisApplication: boolean;
}

export interface ProjectSessionInventory {
	readonly taskId: string;
	readonly sessions: readonly ObservedSession[];
}

export type SessionApplicationOptions = {
	readonly storage: Storage;
	readonly sessionFactory?: SessionFactory;
	readonly maxSessions?: number;
};

/** Controller-owned durable lifecycle operations and ephemeral runtime observations. */
export class SessionApplication {
	readonly store: SessionStore;
	private readonly storage: Storage;
	private readonly sessionFactory?: SessionFactory;
	private readonly maxSessions: number;
	private readonly sessions = new Map<string, Session>();

	constructor(
		private readonly core: Core,
		options: SessionApplicationOptions,
	) {
		this.storage = options.storage;
		this.store = options.storage.sessionStore();
		this.sessionFactory = options.sessionFactory;
		this.maxSessions = options.maxSessions ?? 10;
	}

	async newSession(taskId: string, modeId?: ModeId, presetName?: string): Promise<ObservedSession> {
		this.requireSessionFactory();
		const requestedMode = modeId ?? (await loadProjectModeCatalog(this.core)).defaultModeId;
		return await this.withAdmissions(requestedMode, taskId, async () => {
			await this.coordinateTaskStatus(taskId);
			return await this.withTaskAdmission(taskId, async (taskRecord) => {
				const resolved = await resolveAgentConfiguration(this.core, taskId);
				const catalog = await loadProjectModeCatalog(this.core);
				const selectedMode = modeId ?? catalog.defaultModeId;
				const configuredMode = catalog.profiles[selectedMode];
				if (!configuredMode) throw new Error(`Unknown mode '${selectedMode}'.`);
				const presetNameResolved = presetName ?? resolved.config.selectedPreset;
				const configuredPreset = resolved.config.presets[presetNameResolved];
				if (!configuredPreset) throw new Error(`Agent preset not found: ${presetNameResolved}`);
				const record = await this.newRecord(taskId, presetNameResolved);
				const session = this.newModelSession(record, selectedMode);
				let creation: SessionCreationIdentity | undefined;
				let release: (() => Promise<void>) | undefined;
				let startEntered = false;
				let primary: unknown;
				try {
					await this.store.mutate(taskId, async (state) => {
						const task = this.hydrate(taskRecord, catalog.profiles, resolved, state, session);
						const reserved = task.reserveSession(selectedMode);
						creation = reserved.creation;
						state.modes = task.serializeSessions();
					});
					release = await this.store.claimSession(taskId, session.id);
					this.sessions.set(this.key(taskId, session.id), session);
					startEntered = true;
					await session.start(this.launchContext(record, selectedMode, resolved, configuredPreset, configuredMode));
					await this.publish(session, selectedMode, taskRecord, catalog.profiles, resolved);
					const created = this.view(session);
					await this.enforceSessionLimit(record);
					return created;
				} catch (error) {
					primary = error;
					if (creation) {
						try {
							await this.settleFailedCreation(
								session,
								creation,
								taskRecord,
								catalog.profiles,
								resolved,
								error,
								startEntered,
							);
						} catch (settlementError) {
							primary = settlementError;
							throw settlementError;
						}
					}
					throw error;
				} finally {
					if (release) await this.releaseWithPrimary(release, primary);
				}
			});
		});
	}

	async resumeSession(taskId: string, sessionId: string): Promise<ObservedSession> {
		this.requireSessionFactory();
		const initial = await this.requireRecord(taskId, sessionId);
		return await this.withAdmissions(
			initial.modeId,
			taskId,
			async () =>
				await this.withTaskAdmission(taskId, async (taskRecord) => {
					const release = await this.store.claimSession(taskId, sessionId);
					let primary: unknown;
					let session: Session | undefined;
					try {
						const { record, modeId } = await this.requireRecord(taskId, sessionId);
						if (!record.nativeSessionId)
							throw new Error(`Session ${sessionId} has no exact native conversation identity to resume.`);
						const resolved = await resolveAgentConfiguration(this.core, taskId);
						const catalog = await loadProjectModeCatalog(this.core);
						const presetConfig = resolved.config.presets[record.preset];
						if (!presetConfig) throw new Error(`Agent preset not found for existing session: ${record.preset}`);
						const profile = catalog.profiles[modeId];
						if (!profile) throw new Error(`Unknown mode '${modeId}'.`);
						const resumedSession = this.newModelSession(record, modeId);
						session = resumedSession;
						await resumedSession.resume(this.launchContext(record, modeId, resolved, presetConfig, profile));
						await this.publish(resumedSession, modeId, taskRecord, catalog.profiles, resolved);
						this.sessions.set(this.key(taskId, sessionId), resumedSession);
						const resumed = this.view(resumedSession);
						await this.enforceSessionLimit(record);
						return resumed;
					} catch (error) {
						primary = error;
						try {
							if (session) await this.settleFailedResume(session, error);
						} catch (settlementError) {
							primary = settlementError;
							throw settlementError;
						}
						throw error;
					} finally {
						await this.releaseWithPrimary(release, primary);
					}
				}),
		);
	}

	async handoff(taskId: string, predecessorSessionId: string, modeId?: ModeId): Promise<ObservedSession> {
		const successor = await this.newSession(taskId, modeId);
		try {
			const predecessor = this.sessions.get(this.key(taskId, predecessorSessionId));
			if (predecessor) await this.stopSession(taskId, predecessorSessionId);
		} catch (error) {
			throw new AggregateError([error], "Successor was published but predecessor retirement failed.", { cause: error });
		}
		return successor;
	}

	async prepareStop(taskId: string, sessionId: string): Promise<PreparedSessionStop> {
		this.requireSessionFactory();
		const releaseClaim = await this.store.claimSession(taskId, sessionId);
		let released = false;
		const release = async () => {
			if (released) return;
			released = true;
			await releaseClaim();
		};
		try {
			const { record } = await this.requireRecord(taskId, sessionId);
			const session =
				this.sessions.get(this.key(taskId, sessionId)) ??
				this.newModelSession(record, (await this.requireRecord(taskId, sessionId)).modeId);
			const prepared = await session.prepareStop();
			return { record, stop: async () => await prepared.stop(), release };
		} catch (error) {
			await this.releaseWithPrimary(release, error);
			throw error;
		}
	}

	/** Preflight every retained task session before a destructive caller performs any stop effect. */
	async prepareTaskStop(taskId: string, modeId?: ModeId): Promise<PreparedSessionStop[]> {
		const state = await this.store.read(taskId);
		const records = modeId
			? (state.modes[modeId]?.sessions ?? [])
			: Object.values(state.modes).flatMap((history) => history.sessions);
		const prepared: PreparedSessionStop[] = [];
		try {
			for (const record of records) prepared.push(await this.prepareStop(taskId, record.id));
			return prepared;
		} catch (error) {
			const releaseFailures: unknown[] = [];
			for (const entry of prepared) {
				try {
					await entry.release();
				} catch (releaseError) {
					releaseFailures.push(releaseError);
				}
			}
			if (releaseFailures.length)
				throw new AggregateError(
					[error, ...releaseFailures],
					"Task stop preflight failed and claims could not be released.",
					{
						cause: error,
					},
				);
			throw error;
		}
	}

	/** Remove one mode's workspace-owned relationships only after positive absence is established. */
	async discardModeSessions(taskId: string, modeId: ModeId): Promise<void> {
		const state = await this.store.read(taskId);
		const records = state.modes[modeId]?.sessions ?? [];
		if (records.length) this.requireSessionFactory();
		for (const record of records) {
			const session = this.sessions.get(this.key(taskId, record.id)) ?? this.newModelSession(record, modeId);
			await session.observeRetained();
			if (session.executionOwnership !== "none")
				throw new Error(`Session ${record.id} is not positively absent; mode ${modeId} cannot be discarded.`);
		}
		await this.withTaskAdmission(taskId, async (taskRecord) => {
			const [configuration, catalog] = await Promise.all([
				resolveAgentConfiguration(this.core, taskId),
				loadProjectModeCatalog(this.core),
			]);
			await this.store.mutate(taskId, async (current) => {
				const task = this.hydrate(taskRecord, catalog.profiles, configuration, current);
				for (const record of records) task.removeSession(modeId, record.id);
				task.removeMode(modeId);
				current.modes = task.serializeSessions();
			});
		});
	}

	/** Forget only this application instance's model references after the caller completed cleanup. */
	forgetTaskSessions(taskId: string): Promise<void> {
		for (const [key, session] of this.sessions)
			if (taskIdsEqual(session.record.taskId, taskId)) this.sessions.delete(key);
		return Promise.resolve();
	}

	async stopSession(taskId: string, sessionId: string): Promise<void> {
		const prepared = await this.prepareStop(taskId, sessionId);
		let primary: unknown;
		try {
			await prepared.stop();
			this.sessions.delete(this.key(taskId, sessionId));
		} catch (error) {
			primary = error;
			throw error;
		} finally {
			await this.releaseWithPrimary(prepared.release, primary);
		}
	}

	async deleteSession(taskId: string, sessionId: string, options: { force?: boolean } = {}): Promise<void> {
		const prepared = await this.prepareStop(taskId, sessionId);
		let primary: unknown;
		try {
			const observed = await this.readObserved(taskId, sessionId);
			if (observed.snapshot.state === "running" && !options.force)
				throw new Error(`Session ${sessionId} is running; use force to delete it.`);
			if (options.force) await prepared.stop();
			await this.withTaskAdmission(taskId, async (taskRecord) => {
				const [resolved, catalog] = await Promise.all([
					resolveAgentConfiguration(this.core, taskId),
					loadProjectModeCatalog(this.core),
				]);
				await this.store.mutate(taskId, async (state) => {
					const owner = Object.entries(state.modes).find(([, history]) =>
						history.sessions.some((entry) => entry.id === sessionId),
					);
					if (!owner) throw new Error(`Agent session not found: ${sessionId}`);
					const [modeId] = owner;
					const task = this.hydrate(
						taskRecord,
						catalog.profiles,
						resolved,
						state,
						this.sessions.get(this.key(taskId, sessionId)) ?? this.newModelSession(prepared.record, modeId),
					);
					task.removeSession(modeId, sessionId);
					state.modes = task.serializeSessions();
				});
			});
			this.sessions.delete(this.key(taskId, sessionId));
		} catch (error) {
			primary = error;
			throw error;
		} finally {
			await this.releaseWithPrimary(prepared.release, primary);
		}
	}

	async readObserved(taskId: string, sessionId: string): Promise<ObservedSession> {
		this.requireSessionFactory();
		const { record } = await this.requireRecord(taskId, sessionId);
		const local = this.sessions.get(this.key(taskId, sessionId));
		if (local) return this.view(local);
		const session = this.newModelSession(record, (await this.requireRecord(taskId, sessionId)).modeId);
		return { record, snapshot: await session.observeRetained() };
	}

	async projectInventory(): Promise<ProjectSessionInventory[]> {
		const taskIds = await this.storage.loadProjectTaskIds();
		return await Promise.all(
			taskIds.map(async (taskId) => {
				const state = await this.store.read(taskId);
				const sessions = await Promise.all(
					Object.values(state.modes)
						.flatMap((history) => history.sessions)
						.map(async (record) => await this.readObserved(taskId, record.id)),
				);
				return { taskId, sessions };
			}),
		);
	}

	async attachmentContext(taskId: string, sessionId: string): Promise<SessionAttachmentContext> {
		const observed = await this.readObserved(taskId, sessionId);
		return {
			record: observed.record,
			snapshot: observed.snapshot,
			ownedByThisApplication: this.sessions.has(this.key(taskId, sessionId)),
		};
	}

	async adoptRequest(taskId: string, sessionId: string): Promise<ObservedSession> {
		const request = (await this.storage.workspaceRequests.read()).find(
			(entry) => taskIdsEqual(entry.taskId, taskId) && entry.sessionId === sessionId,
		);
		if (!request) throw new Error(`No pending workspace request exists for session ${sessionId}.`);
		const resumed = await this.resumeSession(taskId, sessionId);
		await this.storage.workspaceRequests.delete(sessionId);
		return resumed;
	}

	async shutdown(): Promise<void> {
		const failures: unknown[] = [];
		for (const [key, session] of this.sessions) {
			try {
				await this.stopSession(session.record.taskId, session.id);
			} catch (error) {
				failures.push(error);
			}
			if (!this.sessions.has(key)) continue;
		}
		if (failures.length) throw new AggregateError(failures, "Some session shutdown operations failed.");
	}

	async ask(taskId: string, sessionId: string, question: string): Promise<{ answer: string }> {
		this.requireSessionFactory();
		const { record, modeId } = await this.requireRecord(taskId, sessionId);
		const resolved = await resolveAgentConfiguration(this.core, taskId);
		const configuredPreset = resolved.config.presets[record.preset];
		if (!configuredPreset) throw new Error(`Agent preset not found for existing session: ${record.preset}`);
		const profile = (await loadProjectModeCatalog(this.core)).profiles[modeId];
		if (!profile) throw new Error(`Unknown mode '${modeId}'.`);
		const roots = record.pathContext;
		if (!roots) throw new Error(`Session ${sessionId} has no retained execution roots.`);
		const release = await this.store.claimSession(taskId, sessionId);
		let primary: unknown;
		try {
			const session = this.sessions.get(this.key(taskId, sessionId)) ?? this.newModelSession(record, modeId);
			return await session.ask({
				preset: configuredPreset,
				question,
				profile,
				roots: {
					repositoryRoot: roots.projectDir,
					taskRoot: roots.taskDir,
					cwd: roots.worktreeDir,
					taskId,
					modeId,
					sessionId,
				},
			} satisfies SessionAskContext);
		} catch (error) {
			primary = error;
			throw error;
		} finally {
			await this.releaseWithPrimary(release, primary);
		}
	}

	async askPrevious(taskId: string, modeId: ModeId, question: string): Promise<{ answer: string }> {
		const [state, taskRecord, configuration, catalog] = await Promise.all([
			this.store.read(taskId),
			this.core.loadTaskForMutation(taskId),
			resolveAgentConfiguration(this.core, taskId),
			loadProjectModeCatalog(this.core),
		]);
		if (!catalog.profiles[modeId]) throw new Error(`Unknown mode '${modeId}'.`);
		const task = this.hydrate(taskRecord, catalog.profiles, configuration, state, undefined, modeId);
		const session = task.activeSession;
		if (!session) throw new Error(`Mode ${modeId} for task ${taskId} has no saved conversation.`);
		return await this.ask(taskId, session.id, question);
	}

	private async coordinateTaskStatus(taskId: string): Promise<void> {
		const task = await this.core.loadTaskForMutation(taskId);
		if (!task) throw new Error(`Task not found: ${taskId}`);
		const config = await this.core.getStoredConfig();
		const statuses = config?.statuses?.length ? config.statuses : [...DEFAULT_STATUSES];
		if (isTerminalStatus(task.status, statuses)) return;
		const target = resolveInProgressStatus(statuses);
		if (!target || target === getTerminalStatus(statuses) || task.status === target) return;
		await this.core.updateTaskFromInput(task.id, { status: target });
	}

	private async publish(
		session: Session,
		modeId: ModeId,
		taskRecord: Awaited<ReturnType<Core["loadTaskForMutation"]>>,
		profiles: Record<ModeId, ModeProfile>,
		configuration: Awaited<ReturnType<typeof resolveAgentConfiguration>>,
	): Promise<void> {
		await this.store.mutate(session.record.taskId, async (state) => {
			const task = this.hydrate(taskRecord, profiles, configuration, state, session);
			task.updateSessionRecord(modeId, await session.serialize());
			state.modes = task.serializeSessions();
		});
	}

	private async settleFailedCreation(
		session: Session,
		creation: SessionCreationIdentity,
		taskRecord: Awaited<ReturnType<Core["loadTaskForMutation"]>>,
		profiles: Record<ModeId, ModeProfile>,
		configuration: Awaited<ReturnType<typeof resolveAgentConfiguration>>,
		original: unknown,
		startEntered: boolean,
	): Promise<void> {
		const failures: unknown[] = [original];
		if (startEntered && session.execution) {
			try {
				await session.stop();
			} catch (error) {
				failures.push(error);
				throw new AggregateError(failures, "Creation failed and execution cleanup failed; reservation retained.", {
					cause: original,
				});
			}
		}
		try {
			await this.store.mutate(creation.taskId, async (state) => {
				const task = this.hydrate(taskRecord, profiles, configuration, state, session);
				task.rollbackSession(creation);
				state.modes = task.serializeSessions();
			});
			this.sessions.delete(this.key(creation.taskId, creation.provisionalSessionId));
		} catch (error) {
			failures.push(error);
			throw new AggregateError(failures, "Creation failed and rollback failed; reservation retained.", {
				cause: original,
			});
		}
	}

	private async settleFailedResume(session: Session, original: unknown): Promise<void> {
		if (!session.execution) return;
		try {
			await session.stop();
		} catch (cleanupError) {
			throw new AggregateError(
				[original, cleanupError],
				"Resume failed and execution cleanup failed; tracking retained.",
				{
					cause: original,
				},
			);
		}
	}

	private async enforceSessionLimit(started: AgentSession): Promise<void> {
		try {
			const observed = (await this.projectInventory()).flatMap(({ taskId, sessions }) =>
				sessions.map((session) => ({ taskId, ...session })),
			);
			const live = observed.filter(({ snapshot }) => snapshot.state !== "stopped");
			let remaining = live.length - this.maxSessions;
			if (remaining <= 0) return;
			const candidates = live
				.filter(
					({ taskId, record, snapshot }) =>
						!(taskIdsEqual(taskId, started.taskId) && record.id === started.id) &&
						snapshot.state === "running" &&
						snapshot.activity === "idle" &&
						snapshot.idleSince !== null,
				)
				.sort((left, right) => left.snapshot.idleSince! - right.snapshot.idleSince!);
			for (const candidate of candidates) {
				if (remaining === 0) return;
				try {
					await this.stopSession(candidate.taskId, candidate.record.id);
					remaining--;
				} catch (error) {
					console.warn(`Failed to evict idle session ${candidate.record.id}:`, error);
				}
			}
		} catch (error) {
			console.warn("Failed to enforce session limit:", error);
		}
	}

	private async requireRecord(taskId: string, sessionId: string): Promise<{ record: AgentSession; modeId: ModeId }> {
		const state = await this.store.read(taskId);
		const owner = Object.entries(state.modes).find(([, history]) =>
			history.sessions.some((record) => record.id === sessionId),
		);
		if (!owner) throw new Error(`Agent session not found: ${sessionId}`);
		const [modeId, history] = owner;
		const record = history.sessions.find((entry) => entry.id === sessionId);
		if (!record || !taskIdsEqual(record.taskId, taskId)) throw new Error(`Agent session not found: ${sessionId}`);
		return { record, modeId };
	}

	private async newRecord(taskId: string, preset: string): Promise<AgentSession> {
		const { taskDir } = await this.store.paths(taskId);
		const id = randomUUID();
		return {
			id,
			taskId,
			preset,
			tmuxName: nativeSessionName(taskId, id),
			cwd: this.core.projectRoot,
			pathContext: {
				projectDir: this.core.projectRoot,
				worktreeDir: this.core.projectRoot,
				taskDir: await this.storage.taskArtifacts.containerPath(taskId),
			},
			createdAt: new Date().toISOString(),
			ownerPid: process.pid,
			outputPath: join(taskDir, `${id}.log`),
			bootstrapPath: join(taskDir, `${id}.md`),
		};
	}

	private hydrate(
		task: Awaited<ReturnType<Core["loadTaskForMutation"]>>,
		profiles: Record<ModeId, ModeProfile>,
		configuration: Awaited<ReturnType<typeof resolveAgentConfiguration>>,
		state: Awaited<ReturnType<SessionStore["read"]>>,
		session?: Session,
		selectedModeId?: ModeId,
	): Task {
		if (!task) throw new Error("Task not found.");
		return new Task({
			task,
			modes: profiles,
			configuration,
			sessionRecords: state.modes,
			selectedModeId: selectedModeId ?? Object.keys(profiles)[0] ?? "",
			createSession: ({ taskId }) => {
				if (!session) throw new Error("Session creation is unavailable during this task mutation.");
				if (!taskIdsEqual(taskId, session.record.taskId))
					throw new Error("Task reservation does not match the allocated session.");
				return session;
			},
		});
	}

	private launchContext(
		record: AgentSession,
		modeId: ModeId,
		configuration: Awaited<ReturnType<typeof resolveAgentConfiguration>>,
		preset: Awaited<ReturnType<typeof resolveAgentConfiguration>>["config"]["presets"][string],
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

	private newModelSession(record: AgentSession, modeId: ModeId): Session {
		return this.requireSessionFactory()(record.taskId, modeId, record);
	}

	private requireSessionFactory(): SessionFactory {
		if (!this.sessionFactory)
			throw new Error("Session lifecycle requires a SessionFactory from the application composition.");
		return this.sessionFactory;
	}

	private view(session: Session): ObservedSession {
		return { record: session.serialize(), snapshot: session.view };
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

	private async withAdmissions<T>(modeId: ModeId, taskId: string, operation: () => Promise<T>): Promise<T> {
		const releaseMode = await this.storage.claimModeAdmission(modeId);
		let releaseTask: (() => Promise<void>) | undefined;
		let primary: unknown;
		try {
			releaseTask = await this.storage.claimTaskAdmission(taskId);
			return await operation();
		} catch (error) {
			primary = error;
			throw error;
		} finally {
			await this.releaseAll(primary, releaseTask, releaseMode);
		}
	}

	private async releaseAll(primary: unknown, ...releases: Array<(() => Promise<void>) | undefined>): Promise<void> {
		const failures: unknown[] = [];
		for (const release of releases) {
			if (!release) continue;
			try {
				await release();
			} catch (error) {
				failures.push(error);
			}
		}
		if (failures.length === 0) return;
		if (primary !== undefined)
			throw new AggregateError([primary, ...failures], "Session operation failed and admission release failed.", {
				cause: primary,
			});
		if (failures.length === 1) throw failures[0];
		throw new AggregateError(failures, "Session admission releases failed.");
	}

	private async releaseWithPrimary(release: () => Promise<void>, primary: unknown): Promise<void> {
		try {
			await release();
		} catch (releaseError) {
			if (primary !== undefined)
				throw new AggregateError([primary, releaseError], "Session operation failed and claim release failed.", {
					cause: primary,
				});
			throw releaseError;
		}
	}

	private key(taskId: string, sessionId: string): string {
		return `${taskIdKey(taskId)}:${sessionId}`;
	}
}
