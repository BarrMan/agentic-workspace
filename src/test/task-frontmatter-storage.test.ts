import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDefaultModeCatalog, updateAgentConfiguration } from "../agent-workspace/config.ts";
import { Core } from "../core/agentic-workspace.ts";
import { ContentRepository } from "../file-system/content-repository.ts";
import {
	FrontmatterSchemaError,
	parseDecision,
	parseMilestone,
	parseTask,
	UnsupportedRecordFrontmatterSchemaError,
	UnsupportedTaskFrontmatterSchemaError,
} from "../markdown/parser.ts";
import { serializeDecision, serializeMilestone, serializeTask } from "../markdown/serializer.ts";
import type { Decision, Milestone, Task } from "../types/index.ts";

const task: Task = {
	id: "TASK-1",
	title: "Structured frontmatter",
	status: "In Progress",
	assignee: ["@alex"],
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
			await core.filesystem.ensureAgenticWorkspaceStructure();
			await updateAgentConfiguration(core, "project", (configuration) => ({
				...configuration,
				modes: getDefaultModeCatalog(),
			}));
			await core.filesystem.saveTask(task);
			await Promise.all([core.setTaskModeApproval(task.id, "build"), core.setTaskModeApproval(task.id, "plan")]);
			expect((await core.filesystem.loadTask(task.id))?.modeApprovals).toEqual({ build: true, plan: true });
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("rejects unsupported schema versions without treating records as legacy", () => {
		expect(() => parseTask(serializeTask(task).replace("task_schema_version: 3", "task_schema_version: 9"))).toThrow(
			UnsupportedTaskFrontmatterSchemaError,
		);
		const decision = serializeDecision({
			id: "decision-1",
			title: "Choose",
			date: "2026-09-30",
			status: "proposed",
			context: "",
			decision: "",
			consequences: "",
			rawContent: "",
		});

		expect(() => parseDecision(decision.replace("decision_schema_version: 1", "decision_schema_version: 9"))).toThrow(
			UnsupportedRecordFrontmatterSchemaError,
		);
	});

	it("round-trips opaque record bodies and readable multiline frontmatter", () => {
		const decision: Decision = {
			id: "decision-1",
			title: "Choose storage",
			date: "2026-09-30 12:00",
			status: "accepted",
			context: "First line\nSecond line",
			decision: "Use YAML.",
			consequences: "No body parsing.",
			rawContent: "## Context\n\nThis heading is opaque.",
		};
		const milestone: Milestone = {
			id: "m-1",
			title: "Release",
			description: "First line\nSecond line",
			rawContent: "## Description\n\nOpaque.",
		};
		expect(parseDecision(serializeDecision(decision))).toMatchObject(decision);
		expect(parseMilestone(serializeMilestone(milestone))).toMatchObject(milestone);
	});

	it("rejects invalid YAML field types rather than repairing them", () => {
		expect(() => parseDecision("---\ndecision_schema_version: 1\nid: decision-1\ncontext: [invalid]\n---\n")).toThrow(
			FrontmatterSchemaError,
		);
		expect(() =>
			parseMilestone("---\nmilestone_schema_version: 1\nid: m-1\ndescription: {invalid: value}\n---\n"),
		).toThrow(FrontmatterSchemaError);
	});

	it("preserves unknown decision metadata on an ordinary save", async () => {
		const root = await mkdtemp(join(tmpdir(), "agentic-workspace-decision-frontmatter-"));
		const decisionsDir = join(root, "decisions");
		const repository = new ContentRepository({
			decisionsDirectory: async () => decisionsDir,
			documentsDirectory: async () => join(root, "documents"),
			ensureDirectory: async (directory) => {
				await mkdir(directory, { recursive: true });
			},
		});
		const decision: Decision = {
			id: "decision-1",
			title: "Choose",
			date: "2026-09-30",
			status: "proposed",
			context: "Context",
			decision: "Decision",
			consequences: "Consequences",
			rawContent: "",
		};
		try {
			await mkdir(decisionsDir);
			const path = join(decisionsDir, "decision-1 - Choose.md");
			await writeFile(path, serializeDecision(decision, { custom_owner: "platform" }));
			await repository.saveDecision({ ...decision, status: "accepted" });
			expect(await readFile(path, "utf8")).toContain("custom_owner: platform");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("replaces decision custom metadata with submitted frontmatter", async () => {
		const root = await mkdtemp(join(tmpdir(), "agentic-workspace-decision-content-"));
		const core = new Core(root);
		const decision: Decision = {
			id: "decision-1",
			title: "Choose",
			date: "2026-09-30",
			status: "proposed",
			context: "Context",
			decision: "Decision",
			consequences: "Consequences",
			rawContent: "",
		};
		try {
			await core.filesystem.ensureAgenticWorkspaceStructure();
			await core.createDecision(decision);
			await core.filesystem.saveDecision(decision, { stale_metadata: "discarded" });
			await core.updateDecisionFromContent(
				"decision-1",
				serializeDecision(
					{ ...decision, status: "accepted", rawContent: "## Notes\n\nOpaque body." },
					{ submitted_metadata: "kept" },
				),
			);
			const saved = await readFile(join(core.filesystem.decisionsDir, "decision-1 - Choose.md"), "utf8");
			expect(saved).toContain("submitted_metadata: kept");
			expect(saved).not.toContain("stale_metadata:");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
