import type { AgentHost } from "../../agent-workspace/live/agent-host.ts";

/** Owns the lifetime of this local observer without taking ownership of its shared session. */
export function createWorkspaceAgentHostOwner(
	host: AgentHost,
	stopSession: () => Promise<void>,
	onDetached: () => void,
) {
	let stopped = false;
	let startupPending = false;
	let detachRequested = false;
	let detachPromise: Promise<"retained" | "gone"> | undefined;
	const detach = host.detach;
	const cleanupHost = async (history?: Parameters<NonNullable<typeof detach>>[0]): Promise<"retained" | "gone"> => {
		if (detachPromise) return await detachPromise;
		const pending = (async (): Promise<"retained" | "gone"> => {
			let state: "retained" | "gone" = "retained";
			if (detach) state = await detach(history);
			else await host.stop();
			if (!startupPending) stopped = true;
			onDetached();
			return state;
		})();
		detachPromise = pending;
		try {
			return await pending;
		} finally {
			if (detachPromise === pending) detachPromise = undefined;
		}
	};
	const ownedHost: AgentHost = {
		...host,
		start: async () => {
			startupPending = true;
			try {
				await host.start();
			} finally {
				startupPending = false;
				if (detachRequested) {
					try {
						await detachPromise;
					} finally {
						await cleanupHost();
					}
				}
			}
		},
		stop: async () => {
			if (stopped) return;
			await host.stop();
			await stopSession();
			stopped = true;
			onDetached();
		},
		detach: async (history) => {
			if (stopped) return "retained";
			detachRequested = true;
			return await cleanupHost(history);
		},
	};
	return {
		host: ownedHost,
		async detachAndDestroy(terminal?: { destroy(): void }, history?: Parameters<NonNullable<typeof detach>>[0]) {
			const result = await ownedHost.detach?.(history);
			terminal?.destroy();
			return result;
		},
	};
}
