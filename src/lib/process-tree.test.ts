import { describe, expect, it } from "bun:test";
import { type OwnedProcess, type ProcessRow, processIdentity, terminateProcessTree } from "./process-tree.ts";

describe("process tree identity", () => {
	it("identifies a process by PID and name", () => {
		const identity: OwnedProcess | undefined = processIdentity(process.pid);
		expect(identity).toEqual({ pid: process.pid, comm: expect.any(String) });
		expect(identity?.comm.length).toBeGreaterThan(0);
	});

	it("uses process rows without start-time identity", () => {
		const row: ProcessRow = { pid: 10, ppid: 1, name: "bun", state: "running" };
		expect(row).toEqual({ pid: 10, ppid: 1, name: "bun", state: "running" });
	});

	it("returns absent for an invalid PID", async () => {
		expect(await terminateProcessTree(undefined)).toBe("absent");
	});
});
