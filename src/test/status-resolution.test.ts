import { afterEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Core } from "../controller/agentic-workspace.ts";
import { findCanonicalStatus, resolveInProgressStatus, statusComparisonKey } from "../model/task/status.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

describe("exact status matching", () => {
	const roots: string[] = [];
	afterEach(async () => await Promise.all(roots.splice(0).map((root) => safeCleanup(root))));

	it("passes the original status spelling from creation to canonical validation", async () => {
		const root = createUniqueTestDir("status-resolution");
		roots.push(root);
		await mkdir(root, { recursive: true });
		const core = new Core(root);
		await initializeFilesystemTestProject(core, "Status resolution");

		await expect(core.tasks.create({ title: "Task", status: " In Progress " })).rejects.toThrow(
			"Invalid status:  In Progress ",
		);
	});

	it("preserves labels exactly", () => {
		expect(statusComparisonKey("  In Progress ")).toBe("  In Progress ");
		expect(statusComparisonKey("InProgress")).toBe("InProgress");
		expect(statusComparisonKey(undefined)).toBe("");
	});

	it("only resolves an exact configured label", () => {
		expect(findCanonicalStatus("In Progress", ["In Progress", "InProgress"])).toBe("In Progress");
		expect(findCanonicalStatus("in progress", ["In Progress"])).toBe(null);
		expect(findCanonicalStatus(" In Progress ", ["In Progress"])).toBe(null);
	});
});

describe("resolveInProgressStatus", () => {
	it("returns the canonical In Progress status by name, preserving configured casing", () => {
		expect(resolveInProgressStatus(["Todo", "In Progress", "Done"])).toBe("In Progress");
	});

	it("falls back to the second configured status when In Progress is renamed", () => {
		expect(resolveInProgressStatus(["AgenticWorkspace", "Doing", "Shipped"])).toBe("Doing");
	});

	it("uses the default statuses when none are configured", () => {
		expect(resolveInProgressStatus(undefined)).toBe("In Progress");
		expect(resolveInProgressStatus([])).toBe("In Progress");
	});

	it("returns undefined when there is no active-work slot", () => {
		expect(resolveInProgressStatus(["To Do"])).toBe(undefined);
	});
});
