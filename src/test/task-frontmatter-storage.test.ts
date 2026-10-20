import { describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Core } from "../controller/agentic-workspace.ts";
import type { Milestone, Task } from "../model/types.ts";
import { getDefaultModeCatalog, updateAgentConfiguration } from "../storage/config.ts";
import { FrontmatterSchemaError, UnsupportedTaskFrontmatterSchemaError } from "../storage/errors/frontmatter.ts";
import { parseMilestone, parseTask } from "../storage/markdown/parser.ts";
import { serializeMilestone, serializeTask } from "../storage/markdown/serializer.ts";
import { coreFileSystem } from "./test-utils.ts";

const task: Task = {
	id: "TASK-1",
	title: "Structured frontmatter",
	status: "In Progress",
	createdDate: "2026-09-30 12:00",
	labels: ["storage"],
	dependencies: [],
	description: "A readable\nmultiline description.",
	rawContent:
		"## Research\n\n- [ ] This checkbox is free-form body text.\n\n<!-- SECTION:PLAN:BEGIN -->\nLiteral marker.",
};

describe("task frontmatter storage", () => {
	it("round-trips supported structured task fields without interpreting the body", () => {
		const content = serializeTask(task);
		expect(content).toContain("task_schema_version: 3");
		expect(content).toContain("description: |-");
		for (const removed of [
			"acceptance_criteria",
			"definition_of_done",
			"implementation_plan",
			"implementation_notes",
			"comments",
		]) {
			expect(content).not.toContain(removed);
		}
		expect(parseTask(content)).toMatchObject(task);
	});

	it("retains opaque body whitespace and frontmatter-looking body text", () => {
		const rawContent = "\n---\ncustom: body text\n---\n  Free-form body.  \n\n";
		expect(parseTask(serializeTask({ ...task, rawContent })).rawContent).toBe(rawContent);
	});

	it("round-trips approvals, preserves unrelated metadata, and removes cleared entries", () => {
		const serialized = serializeTask({ ...task, modeApprovals: { build: true, unknown: true } }, { custom: "kept" });
		expect(parseTask(serialized).modeApprovals).toEqual({ build: true, unknown: true });
		const cleared = serializeTask(
			{ ...task, modeApprovals: { unknown: true } },
			{ mode_approvals: { build: true, unknown: true }, custom: "kept" },
		);
		expect(parseTask(cleared).modeApprovals).toEqual({ unknown: true });
		expect(cleared).toContain("custom: kept");
		expect(cleared).toContain("This checkbox is free-form body text.");
		expect(parseTask(serializeTask(task)).modeApprovals).toBeUndefined();
	});

	it("rejects malformed approval maps but accepts unknown durable mode IDs", () => {
		const base = serializeTask(task);
		expect(() =>
			parseTask(base.replace("task_schema_version: 3", "task_schema_version: 3\nmode_approvals: []")),
		).toThrow(FrontmatterSchemaError);
		expect(() =>
			parseTask(base.replace("task_schema_version: 3", "task_schema_version: 3\nmode_approvals:\n  build: false")),
		).toThrow(FrontmatterSchemaError);
	});

	it("preserves task ID and dependency casing from frontmatter", () => {
		const content = serializeTask({ ...task, id: "task-01", dependencies: ["back-02"] });
		expect(parseTask(content)).toMatchObject({ id: "task-01", dependencies: ["back-02"] });
	});

	it("publishes concurrent different-mode approvals from fresh locked task state", async () => {
		const root = await mkdtemp(join(tmpdir(), "agentic-workspace-task-approval-"));
		const core = new Core(root);
		try {
			await coreFileSystem(core).ensureAgenticWorkspaceStructure();
			await updateAgentConfiguration(core, "project", (configuration) => ({
				...configuration,
				modes: getDefaultModeCatalog(),
			}));
			await coreFileSystem(core).saveTask(task);
			await Promise.all([core.setTaskModeApproval(task.id, "build"), core.setTaskModeApproval(task.id, "plan")]);
			expect((await coreFileSystem(core).loadTask(task.id))?.modeApprovals).toEqual({ build: true, plan: true });
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("rejects unsupported schema versions without treating records as an older format", () => {
		expect(() => parseTask(serializeTask(task).replace("task_schema_version: 3", "task_schema_version: 9"))).toThrow(
			UnsupportedTaskFrontmatterSchemaError,
		);
	});

	it("round-trips opaque record bodies and readable multiline frontmatter", () => {
		const milestone: Milestone = {
			id: "m-1",
			title: "Release",
			description: "First line\nSecond line",
			rawContent: "## Description\n\nOpaque.",
		};
		expect(parseMilestone(serializeMilestone(milestone))).toMatchObject(milestone);
	});

	it("rejects invalid YAML field types rather than repairing them", () => {
		expect(() =>
			parseMilestone("---\nmilestone_schema_version: 1\nid: m-1\ndescription: {invalid: value}\n---\n"),
		).toThrow(FrontmatterSchemaError);
	});
});
