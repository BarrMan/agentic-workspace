import type { LifecycleCheckpoint, LifecycleCheckpointSink } from "./session-contracts.ts";
import type { SessionState, SessionStore } from "./session-store.ts";
import type { AgentSession, ModeSessionHistory } from "./types.ts";

function locate(state: SessionState, modeId: string, sessionId: string) {
	const matches = Object.entries(state.modes ?? {}).flatMap(([owner, history]) =>
		history.sessions.filter((session) => session.id === sessionId).map((session) => ({ owner, history, session })),
	);
	if (matches.length > 1) throw new Error(`Session ${sessionId} has duplicate membership.`);
	const match = matches[0];
	if (match && match.owner !== modeId)
		throw new Error(`Session ${sessionId} changed mode before checkpoint publication.`);
	return match;
}

function assertCheckpoint(checkpoint: LifecycleCheckpoint): void {
	const { origin, expectedMembership, record } = checkpoint;
	if (
		record.taskId !== expectedMembership.taskId ||
		record.id !== expectedMembership.sessionId ||
		(origin.kind === "creation" &&
			(origin.creation.taskId !== record.taskId ||
				origin.creation.modeId !== expectedMembership.modeId ||
				origin.creation.provisionalSessionId !== record.id)) ||
		(origin.kind === "session" &&
			(origin.taskId !== record.taskId ||
				origin.modeId !== expectedMembership.modeId ||
				origin.sessionId !== record.id))
	)
		throw new Error("Checkpoint identity does not match its expected membership and origin.");
	if ((checkpoint.phase === "reservation") !== (expectedMembership.kind === "absent"))
		throw new Error("Checkpoint phase does not match expected session membership.");
	if (checkpoint.phase === "rollback" && origin.kind !== "creation")
		throw new Error("Rollback checkpoints require a creation origin.");
}

/** Short locked persistence only; callers retain admission and session-claim ownership. */
export function createSessionPersistence(store: SessionStore): { checkpoint: LifecycleCheckpointSink } {
	return {
		checkpoint: async (checkpoint) => {
			assertCheckpoint(checkpoint);
			const { taskId, modeId, sessionId } = checkpoint.expectedMembership;
			await store.mutate(taskId, async (state) => {
				const current = locate(state, modeId, sessionId);
				if (checkpoint.expectedMembership.kind === "absent" ? current !== undefined : current === undefined)
					throw new Error(`Session ${sessionId} membership changed before ${checkpoint.phase} publication.`);
				if (
					current &&
					(current.session.createdAt !== checkpoint.record.createdAt ||
						current.session.tmuxName !== checkpoint.record.tmuxName ||
						current.session.cwd !== checkpoint.record.cwd ||
						JSON.stringify(current.session.pathContext) !== JSON.stringify(checkpoint.record.pathContext))
				)
					throw new Error(`Session ${sessionId} was replaced before checkpoint publication.`);
				if (
					current?.session.nativeSessionId !== undefined &&
					checkpoint.record.nativeSessionId !== undefined &&
					current.session.nativeSessionId !== checkpoint.record.nativeSessionId
				)
					throw new Error(`Session ${sessionId} native identity conflicts with the existing launch incarnation.`);

				state.modes ??= {};
				const history: ModeSessionHistory = state.modes[modeId] ?? { sessions: [] };
				state.modes[modeId] = history;
				if (checkpoint.phase === "rollback") {
					if (current) {
						history.sessions.splice(history.sessions.indexOf(current.session), 1);
						if (history.activeSessionId === sessionId) {
							const previous =
								checkpoint.origin.kind === "creation" ? checkpoint.origin.creation.previousActiveSessionId : undefined;
							if (previous && history.sessions.some((session) => session.id === previous))
								history.activeSessionId = previous;
							else history.activeSessionId = history.sessions[0]?.id;
						}
					}
				} else if (current) {
					const index = history.sessions.indexOf(current.session);
					history.sessions[index] = {
						...current.session,
						...structuredClone(checkpoint.record),
						...(current.session.useCount !== undefined ? { useCount: current.session.useCount } : {}),
						...(current.session.lastUsedAt !== undefined ? { lastUsedAt: current.session.lastUsedAt } : {}),
					} as AgentSession;
				} else {
					history.sessions.unshift(structuredClone(checkpoint.record) as AgentSession);
					history.activeSessionId = sessionId;
				}
				if (modeId === state.legacyModeId) {
					state.sessions = history.sessions;
					state.activeSessionId = history.activeSessionId;
				}
			});
		},
	};
}
