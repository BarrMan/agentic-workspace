import { afterEach, describe, expect, test } from "bun:test";
import { BoxRenderable } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import { toTaskDetail } from "../controller/task-detail.ts";
import type { Task } from "../model/types.ts";
import type { OpenTuiWorkspaceTaskEntry } from "../renderer/opentui/workspace.ts";
import { mountOpenTuiWorkspace } from "../renderer/opentui/workspace.ts";

function attachParent(setup: TestRendererSetup): BoxRenderable {
	const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
	setup.renderer.root.add(parent);
	return parent;
}

const dependencyTask: Task = {
	id: "BACK-2",
	title: "Dependency task",
	status: "Todo",
	createdDate: "2026-01-01",
	labels: [],
	dependencies: [],
};

const richTask: Task = {
	id: "BACK-1",
	title: "Rich task",
	status: "In Progress",
	reporter: "bob",
	createdDate: "2026-01-01",
	updatedDate: "2026-02-02",
	dueDate: "2026-03-03",
	labels: ["ui", "refactor"],
	milestone: "m1",
	dependencies: ["BACK-2"],
	references: ["https://example.com/spec", "docs/design.md"],
	documentation: ["https://example.com/docs"],
	modifiedFiles: ["src/a.ts"],
	description: "A **rich** description mentioning `src/cli.ts`.",
	priority: "high",
	type: "feature",
	project: "alpha",
};

const entries: OpenTuiWorkspaceTaskEntry[] = [
	{ id: richTask.id, title: richTask.title, status: richTask.status, description: richTask.description },
	{
		id: dependencyTask.id,
		title: dependencyTask.title,
		status: dependencyTask.status,
		description: "Fallback description",
	},
];

describe("native workspace rich detail", () => {
	const renderers: TestRendererSetup[] = [];
	afterEach(() => {
		for (const setup of renderers.splice(0)) setup.renderer.destroy();
	});

	test("renders the rich TaskDetail sections in the detail pane", async () => {
		const setup = await createTestRenderer({ width: 120, height: 200, exitOnCtrlC: false });
		renderers.push(setup);
		const detail = toTaskDetail(richTask, {
			tasks: [richTask, dependencyTask],
			completedTasks: [],
			statuses: ["Todo", "In Progress", "Done"],
		});
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks: entries,
			taskDetails: new Map([[richTask.id, detail]]),
			taskDetailOptions: {
				configuredProjects: ["alpha"],
				dateFormat: "yyyy-MM-dd",
				resolveMilestoneLabel: (milestone) => `Milestone ${milestone}`,
			},
		});
		try {
			await setup.flush();
			const frame = setup.captureCharFrame();
			// Header (id + title) is owned by the styled renderer and rendered exactly once.
			expect(frame).toContain("Rich task");
			expect(frame).toContain("BACK-1");
			// Metadata block.
			expect(frame).toContain("Created:");
			expect(frame).toContain("Priority:");
			expect(frame).not.toContain("Assignee:");
			expect(frame).not.toContain("Due:");
			expect(frame).toContain("Milestone:");
			expect(frame).toContain("Milestone m1");
			expect(frame).toContain("Readiness:");
			// Dependency graph line.
			expect(frame).toContain("Dependency Graph");
			expect(frame).toContain("Depends on");
			expect(frame).toContain("BACK-2");
			// Description with a code path.
			expect(frame).toContain("A rich description");
			// References and documentation.
			expect(frame).toContain("https://example.com/spec");
		} finally {
			mount.dispose();
		}
	});

	test("renders fenced code text in a complete Markdown description", async () => {
		const setup = await createTestRenderer({ width: 120, height: 80, exitOnCtrlC: false });
		renderers.push(setup);
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks: [{ id: "BACK-1", title: "Code task", status: "Todo", description: "```ts\nconst visible = true;\n```" }],
		});
		try {
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("const visible = true;");
		} finally {
			mount.dispose();
		}
	});

	test("keeps the selected task's detail in sync when selection changes", async () => {
		const setup = await createTestRenderer({ width: 120, height: 120, exitOnCtrlC: false });
		renderers.push(setup);
		const detail = toTaskDetail(richTask, {
			tasks: [richTask, dependencyTask],
			completedTasks: [],
			statuses: ["Todo", "In Progress", "Done"],
		});
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks: entries,
			taskDetails: new Map([[richTask.id, detail]]),
		});
		try {
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Rich task");
			expect(setup.captureCharFrame()).toContain("rich description mentioning");
			setup.mockInput.pressArrow("down");
			await setup.flush();
			const frame = setup.captureCharFrame();
			expect(frame).toContain("Dependency task");
			expect(frame).toContain("Fallback description");
			expect(frame).not.toContain("rich description mentioning");
			expect(frame).not.toContain("Acceptance Criteria");
		} finally {
			mount.dispose();
		}
	});

	test("clips long Markdown and safely shows an empty description after switching tasks", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
		renderers.push(setup);
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks: [
				{ id: "BACK-1", title: "Long task", status: "Todo", description: "long description ".repeat(20_000) },
				{ id: "BACK-2", title: "Empty task", status: "Todo", description: "" },
			],
		});
		try {
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Long task");
			expect(setup.captureCharFrame()).toContain("long description");
			setup.mockInput.pressArrow("down");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Empty task");
			expect(setup.captureCharFrame()).toContain("No description.");
		} finally {
			mount.dispose();
		}
	});
});
