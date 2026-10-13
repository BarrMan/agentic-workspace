import { appendFileSync } from "node:fs";
import process from "node:process";

export type LatencyStage = "screen-input" | "worker-dispatch" | "socket-write" | "vt-parsed" | "screen-publish";

const path = process.env.PROTO_LATENCY_TRACE_PATH;
const startedAt = path === undefined ? 0n : process.hrtime.bigint();

export const traceLatency = (stage: LatencyStage): void => {
	if (path !== undefined) appendFileSync(path, `PROTO_LATENCY ${stage} ${process.hrtime.bigint() - startedAt}\n`);
};
