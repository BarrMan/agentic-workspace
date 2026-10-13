import type { Task, TaskListFilter } from "../types/index.ts";

export const taskTypeScenarioTasks: readonly Task[] = [
	{
		id: "TASK-1",
		title: "Shared API failure",
		status: "To Do",
		priority: "high",
		type: "Bug",
		labels: ["api", "urgent"],
		assignee: [],
		createdDate: "2026-01-05 09:00",
		dependencies: [],
	},
	{
		id: "TASK-2",
		title: "Shared API capability",
		status: "In Progress",
		priority: "medium",
		type: "Feature",
		labels: ["api"],
		assignee: [],
		createdDate: "2026-01-05 09:00",
		dependencies: [],
	},
	{
		id: "TASK-3",
		title: "Shared API exploration",
		status: "To Do",
		priority: "low",
		type: "Spike",
		labels: ["research"],
		assignee: [],
		createdDate: "2026-01-05 09:00",
		dependencies: [],
	},
	{
		id: "TASK-4",
		title: "Shared legacy task",
		status: "To Do",
		labels: [],
		assignee: [],
		createdDate: "2026-01-05 09:00",
		dependencies: [],
	},
];

export const taskTypeScenarios: readonly {
	readonly name: string;
	readonly query?: string;
	readonly filters: TaskListFilter;
	readonly expectedIds: readonly string[];
}[] = [
	{ name: "one type", filters: { type: "bug" }, expectedIds: ["TASK-1"] },
	{
		name: "OR, case-insensitive, with search",
		query: "Shared API",
		filters: { type: ["BUG", "spike"] },
		expectedIds: ["TASK-1", "TASK-3"],
	},
	{
		name: "composed filters",
		filters: { type: ["Bug", "Feature"], status: "To Do", excludeStatus: "Done", priority: "high", labels: ["urgent"] },
		expectedIds: ["TASK-1"],
	},
	{ name: "case-insensitive type OR", filters: { type: ["feature", "SPIKE"] }, expectedIds: ["TASK-2", "TASK-3"] },
];
