import { describe, expect, it } from "bun:test";
import type { ProcessInfo } from "@3leaps/sysprims";
import { type OwnedProcess, ProcessTree, terminateProcessTree } from "./process-tree.ts";

const row = (
	pid: number,
	ppid: number,
	name = "bun",
	start = pid,
	state: ProcessInfo["state"] = "running",
): ProcessInfo => ({
	pid,
	ppid,
	name,
	state,
	start_time_unix_ms: start,
	cpu_percent: 0,
	memory_kb: 0,
	elapsed_seconds: 0,
	cmdline: [],
});
const root: OwnedProcess = { pid: 10, comm: "bun", started: "10" };

describe("process tree inspection", () => {
	it("captures live descendants by pid, name, and start identity", () => {
		const rows = [row(10, 1), row(11, 10), row(12, 11), row(13, 10, "other"), row(14, 10, "bun", 14, "zombie")];
		expect(ProcessTree.captureOwnedDescendants(root, [], () => rows)?.map((p) => p.pid)).toEqual([11, 12, 13]);
		expect(ProcessTree.captureOwnedDescendants({ ...root, started: "99" }, [], () => rows)).toBeUndefined();
		expect(
			ProcessTree.captureOwnedDescendants(root, [{ pid: 11, comm: "bun", started: "11" }], () => [
				row(11, 1, "bun", 12),
			]),
		).toEqual([]);
	});

	it("maps terminateTree result states", async () => {
		expect(await terminateProcessTree(undefined)).toBe("absent");
	});

	it("escalates an owned child that ignores HUP/TERM", async () => {
		let childAlive = true;
		const signals: string[] = [];
		const child: OwnedProcess = { pid: 11, comm: "bun", started: "11" };
		const outcome = await ProcessTree.terminateOwnedDescendants({
			root,
			captured: [child],
			checkpoint: () => {},
			graceMs: 0,
			deadlineMs: 500,
			observe: () => [row(10, 1), ...(childAlive ? [row(11, 10)] : [])],
			signal: (_pid, signal) => {
				signals.push(signal);
				if (signal === "SIGKILL") childAlive = false;
			},
		});
		expect(outcome).toBe("terminated");
		expect(signals).toContain("SIGTERM");
		expect(signals).toContain("SIGKILL");
	});
});
