import type { ActivityHistory } from "../activity-observer.ts";
import type { ActivityMetadata } from "../types.ts";
import type { InputWorker } from "./input/worker.ts";

export type InputTransport = {
	readonly transport: "pipe-pane-socket" | "send-keys-fork";
	readonly detail: string;
};

export type AgentHost = {
	readonly start: () => Promise<void>;
	readonly stop: () => Promise<void>;
	readonly detach?: (history?: ActivityHistory) => Promise<"retained" | "gone">;
	readonly resize: (columns: number, rows: number) => Promise<void>;
	readonly sendBytes: (bytes: Uint8Array) => void;
	readonly inputTransport: () => InputTransport;
	readonly inputStats: () => ReturnType<InputWorker["stats"]> | undefined;
	readonly flushInput: () => Promise<void>;
	/** Latest fused-tick pane metadata when this host runs a VT channel. */
	readonly activity?: () => ActivityMetadata | undefined;
};
