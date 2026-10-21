import type { AgentSession } from "./types.ts";

/** Resolve ownership from controller-supplied durable records without reading runtime or storage. */
export function resolveCallingMode(
	conversation: { readonly sessionId: string } | undefined,
	modes: Readonly<Record<string, { readonly sessions: readonly AgentSession[] }>>,
): string {
	if (!conversation) throw new Error("A valid calling workspace conversation context is required.");
	const owners = Object.entries(modes).flatMap(([modeId, history]) =>
		history.sessions.filter((candidate) => candidate.id === conversation.sessionId).map(() => modeId),
	);
	const modeId = owners[0];
	if (owners.length !== 1 || !modeId)
		throw new Error("Could not uniquely identify the calling session in its task history.");
	return modeId;
}
