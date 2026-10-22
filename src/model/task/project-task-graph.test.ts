import { describe, expect, it } from "bun:test";
import { TaskCollectionParentNotFoundError } from "../errors/task-collection.ts";
import { AmbiguousTaskIdError } from "../errors/task-id.ts";
import type { Task } from "../types.ts";
import { ProjectTaskGraph } from "./project-task-graph.ts";
import { TaskIdentityIndex, workingCopyTaskIdentityRecord } from "./task-identity-index.ts";
import type { TaskCorpusSnapshot } from "./task-projection.ts";

function task(id: string, dependencies: string[] = [], overrides: Partial<Task> = {}): Task {
	return {
		id,
		title: `Title ${id}`,
		status: "To Do",
		createdDate: "2026-01-01",
		labels: [],
		dependencies,
		...overrides,
	};
}

describe("ProjectTaskGraph", () => {
	it("prepares cross-branch readiness and detail relationships", () => {
		const local = task("task-1", ["task-3"]);
		const remote = task("task-3", ["task-1"], { source: "remote" });
		const completed = task("task-2", [], { source: "completed" });
		const ready = task("task-4", ["task-2"], { source: "remote" });
		const ambiguousDependent = task("task-5", ["TASK-6"]);
		const snapshot = {
			tasks: [local, remote, ready, ambiguousDependent, task("task-6"), task("TASK-6")],
			activeTasks: [local, ambiguousDependent],
			completedTasks: [completed],
			config: null,
		};
		const graph = new ProjectTaskGraph(snapshot);

		expect(graph.tasks).toHaveLength(6);
		expect(graph.activeTasks.map((item) => item.id)).toEqual(["task-1", "task-5"]);
		expect(graph.tasks.find((item) => item.id === "task-4")?.isReady).toBe(true);
		expect(graph.tasks.find((item) => item.id === "task-5")?.isReady).toBe(false);

		const detail = graph.getTaskDetail(local);
		expect(detail.dependencyGraph.edges).toEqual([
			{ from: "task-1", to: "task-3" },
			{ from: "task-3", to: "task-1" },
		]);
		expect(detail.readiness.blockingDependencies).toEqual(["task-3"]);
		expect(graph.getTaskDetail(ambiguousDependent).readiness.missingDependencies).toEqual(["TASK-6"]);
	});

	it("keeps local readiness separate from branch-completed readiness", () => {
		const local = task("task-1", ["task-3"]);
		const localCompleted = task("task-2", [], { source: "completed" });
		const branchCompleted = task("task-3", [], { source: "completed" });
		const identityIndex = {
			getContestedIds: () => new Set<string>(),
			getTasks: (includeCompleted: boolean) => (includeCompleted ? [local, localCompleted, branchCompleted] : [local]),
		} as unknown as TaskIdentityIndex;
		const snapshot: TaskCorpusSnapshot = {
			tasks: [local],
			activeTasks: [local],
			completedTasks: [localCompleted],
			identityIndex,
			config: null,
		};
		const graph = new ProjectTaskGraph(snapshot);

		expect(graph.tasks[0]?.isReady).toBe(true);
		expect(graph.activeTasks[0]?.isReady).toBe(false);
		expect(graph.getTaskDetail(local).readiness.isReady).toBe(true);
	});

	it("resolves parents through the identity index", () => {
		const local = task("task-1");
		const completed = task("task-2", [], { source: "completed" });
		const identityIndex = new TaskIdentityIndex(
			[
				workingCopyTaskIdentityRecord(local, "task", "agentic-workspace/tasks/task-1.md"),
				{
					id: completed.id,
					type: "completed",
					branch: "feature",
					path: "agentic-workspace/completed/task-2.md",
					lastModified: new Date(),
					task: completed,
				},
			],
			{ repositoryRoot: null, projectRoot: "/project", agenticWorkspaceDirectory: "agentic-workspace" },
		);
		const graph = new ProjectTaskGraph({
			tasks: [local],
			activeTasks: [local],
			completedTasks: [completed],
			identityIndex,
			config: null,
		});

		expect(graph.resolveParentTask("TASK-1")).toMatchObject({ id: "task-1", source: "local" });
		expect(graph.resolveParentTask("task-2")).toMatchObject({ id: "task-2", source: "completed" });
		expect(() => graph.resolveParentTask("task-3")).toThrow(TaskCollectionParentNotFoundError);
	});

	it("fails closed when a parent ID is ambiguous", () => {
		const first = task("task-1");
		const second = task("TASK-1");
		const identityIndex = new TaskIdentityIndex(
			[
				workingCopyTaskIdentityRecord(first, "task", "agentic-workspace/tasks/task-1.md"),
				workingCopyTaskIdentityRecord(second, "task", "agentic-workspace/tasks/task-1-copy.md"),
			],
			{ repositoryRoot: null, projectRoot: "/project", agenticWorkspaceDirectory: "agentic-workspace" },
		);
		const graph = new ProjectTaskGraph({
			tasks: [first, second],
			activeTasks: [first, second],
			completedTasks: [],
			identityIndex,
			config: null,
		});

		let error: unknown;
		try {
			graph.resolveParentTask("task-1");
		} catch (caught) {
			error = caught;
		}

		expect(error).toBeInstanceOf(AmbiguousTaskIdError);
		expect(error).toMatchObject({
			candidates: ["agentic-workspace/tasks/task-1-copy.md", "agentic-workspace/tasks/task-1.md"],
		});
		expect((error as Error).message).toBe(
			[
				"Task ID TASK-1 is ambiguous; 2 files match:",
				"  - agentic-workspace/tasks/task-1-copy.md",
				"  - agentic-workspace/tasks/task-1.md",
				"Remove the conflicting files, then retry.",
			].join("\n"),
		);
	});
});
