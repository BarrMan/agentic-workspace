import type { Core } from "../core/agentic-workspace.ts";
import { resolveSessionPreset } from "./config.ts";
import { BunRunner } from "./session-process.ts";
import { SessionStore } from "./session-store.ts";
import type { AgentSession } from "./types.ts";
import { readWorkspaceContext } from "./workspace-context.ts";

export interface CurrentModelDependencies {
	context?: typeof readWorkspaceContext;
	readSessions?: (taskId: string) => Promise<Awaited<ReturnType<SessionStore["read"]>>>;
}

export async function resolveCallingSession(
	core: Core,
	dependencies: CurrentModelDependencies = {},
): Promise<{ modeId: string; session: AgentSession }> {
	const context = await (dependencies.context ?? readWorkspaceContext)({ rootDir: core.projectRoot });
	const conversation = context?.conversation;
	if (!conversation) throw new Error("A valid calling workspace conversation context is required.");
	const state = dependencies.readSessions
		? await dependencies.readSessions(conversation.taskId)
		: await new SessionStore(core.projectRoot, new BunRunner(), (session) => resolveSessionPreset(core, session)).read(
				conversation.taskId,
			);
	const owners = Object.entries(state.modes ?? {}).flatMap(([modeId, history]) =>
		history.sessions
			.filter((candidate) => candidate.id === conversation.sessionId)
			.map((session) => ({ modeId, session })),
	);
	const owner = owners[0];
	if (owners.length !== 1 || !owner)
		throw new Error("Could not uniquely identify the calling session in its task history.");
	return owner;
}

export async function resolveCallingMode(core: Core, dependencies: CurrentModelDependencies = {}): Promise<string> {
	return (await resolveCallingSession(core, dependencies)).modeId;
}
