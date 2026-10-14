import type { AgenticWorkspaceConfig } from "../../../types/index.ts";
import type { McpServer } from "../../server.ts";
import type { McpToolHandler } from "../../types.ts";
import {
	generateTaskCreateSchema,
	generateTaskEditSchema,
	generateTaskListSchema,
	generateTaskSearchSchema,
} from "../../utils/schema-generators.ts";
import { createSimpleValidatedTool } from "../../validation/tool-wrapper.ts";
import { registerTaskArtifactTools } from "./artifact-tools.ts";
import type { TaskCreateArgs, TaskEditRequest, TaskListArgs, TaskSearchArgs } from "./handlers.ts";
import { TaskHandlers } from "./handlers.ts";
import { taskArchiveSchema, taskCompleteSchema, taskViewSchema } from "./schemas.ts";

export function registerTaskTools(server: McpServer, config: AgenticWorkspaceConfig): void {
	registerTaskArtifactTools(server);
	const taskCreateSchema = generateTaskCreateSchema(config);
	const taskEditSchema = generateTaskEditSchema(config);
	const taskListSchema = generateTaskListSchema(config);
	const taskSearchSchema = generateTaskSearchSchema(config);

	const createTaskTool: McpToolHandler = createSimpleValidatedTool(
		{
			name: "task_create",
			description: "Create a new task using AgenticWorkspace",
			inputSchema: taskCreateSchema,
			annotations: { title: "Create Task", destructiveHint: false },
		},
		taskCreateSchema,
		async (input) => new TaskHandlers(server.createOperationCore()).createTask(input as TaskCreateArgs),
	);

	const listTaskTool: McpToolHandler = createSimpleValidatedTool(
		{
			name: "task_list",
			description:
				"List AgenticWorkspace tasks with optional filtering by status, type, project, assignee (or unassigned: true for tasks with no assignee), milestone, labels, and search",
			inputSchema: taskListSchema,
			annotations: { title: "List Tasks", readOnlyHint: true, destructiveHint: false },
		},
		taskListSchema,
		async (input) => new TaskHandlers(server.createOperationCore()).listTasks(input as TaskListArgs),
	);

	const searchTaskTool: McpToolHandler = createSimpleValidatedTool(
		{
			name: "task_search",
			description:
				"Search AgenticWorkspace tasks by title, description, task type, project, and modified file path filters",
			inputSchema: taskSearchSchema,
			annotations: { title: "Search Tasks", readOnlyHint: true, destructiveHint: false },
		},
		taskSearchSchema,
		async (input) => new TaskHandlers(server.createOperationCore()).searchTasks(input as TaskSearchArgs),
	);

	const editTaskTool: McpToolHandler = createSimpleValidatedTool(
		{
			name: "task_edit",
			description:
				"Edit an AgenticWorkspace task, including metadata (status, priority, type, project), dependencies, references, documentation, and modified files",
			inputSchema: taskEditSchema,
			annotations: { title: "Edit Task", destructiveHint: false },
		},
		taskEditSchema,
		async (input) => new TaskHandlers(server.createOperationCore()).editTask(input as unknown as TaskEditRequest),
	);

	const viewTaskTool: McpToolHandler = createSimpleValidatedTool(
		{
			name: "task_view",
			description: "View an AgenticWorkspace task details",
			inputSchema: taskViewSchema,
			annotations: { title: "View Task", readOnlyHint: true, destructiveHint: false },
		},
		taskViewSchema,
		async (input) => new TaskHandlers(server.createOperationCore()).viewTask(input as { id: string }),
	);

	const archiveTaskTool: McpToolHandler = createSimpleValidatedTool(
		{
			name: "task_archive",
			description: "Archive canceled, duplicate, or invalid work; removes incoming dependencies and task references",
			inputSchema: taskArchiveSchema,
			annotations: { title: "Archive Task", destructiveHint: true },
		},
		taskArchiveSchema,
		async (input) => new TaskHandlers(server.createOperationCore()).archiveTask(input as { id: string }),
	);

	const completeTaskTool: McpToolHandler = createSimpleValidatedTool(
		{
			name: "task_complete",
			description:
				"Move a finished task in the configured final status off the board to completed storage during periodic cleanup; preserves its record and dependency links",
			inputSchema: taskCompleteSchema,
			annotations: { title: "Complete Task", destructiveHint: true },
		},
		taskCompleteSchema,
		async (input) => new TaskHandlers(server.createOperationCore()).completeTask(input as { id: string }),
	);

	server.addTool(createTaskTool);
	server.addTool(listTaskTool);
	server.addTool(searchTaskTool);
	server.addTool(editTaskTool);
	server.addTool(viewTaskTool);
	server.addTool(archiveTaskTool);
	server.addTool(completeTaskTool);
}

export type { TaskCreateArgs, TaskEditArgs, TaskListArgs, TaskSearchArgs } from "./handlers.ts";
export {
	taskArchiveSchema,
	taskCompleteSchema,
	taskListSchema,
	taskSearchSchema,
	taskViewSchema,
} from "./schemas.ts";
