/** Existing durable handoff data, retained unchanged for explicit recovery. */
export interface SessionHandoffMarker {
	modeId: string;
	predecessor?: { id: string; createdAt: string; tmuxName: string };
	priorActiveSessionId?: string;
}

export interface WorkspaceRequestMarker {
	taskId: string;
	sessionId: string;
	pid: number;
	handoff?: SessionHandoffMarker;
	createdAt?: string;
}
