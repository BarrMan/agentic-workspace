import { dirname } from "node:path";
import type { Command, OptionValues } from "commander";
import {
	addHelpSchema,
	choiceType,
	getCliTaskTypeValues,
	priorityType,
	projectType,
	statusType,
	taskType,
} from "../../../commands/help-schema.ts";
import { watchJson } from "../../../commands/watch-json.ts";
import { DEFAULT_DONE_STATUS, DEFAULT_STATUSES } from "../../../constants/index.ts";
import { findLocalDuplicateTaskIds } from "../../../core/duplicate-task-detection.ts";
import { loadTaskDetail } from "../../../core/task-detail.ts";
import {
	formatJson,
	printJson,
	type TaskArtifactProjection,
	taskListJson,
	taskViewJson,
} from "../../../formatters/json-output.ts";
import { TASK_FIELD_LABELS } from "../../../formatters/task-labels.ts";
import { formatTaskPlainText } from "../../../formatters/task-plain-text.ts";
import { Core } from "../../../index.ts";
import { isLocalEditableTask, type Task } from "../../../types/index.ts";
import { formatDependencyCleanupMessage } from "../../../utils/dependency-graph.ts";
import { formatDuplicateTaskIdWarning } from "../../../utils/duplicate-detection.ts";
import {
	addListWindowOptions,
	LIST_WINDOW_HELP_FIELDS,
	LIST_WINDOW_OUTPUT_HELP,
	printListWindow,
	selectListWindow,
} from "../../../utils/list-window.ts";
import type { ReadOutputMode, ReadOutputOptions } from "../../../utils/read-output-mode.ts";
import { LOCAL_TASK_LOOKUP_HINT, taskIdsEqual } from "../../../utils/task-path.ts";
import { getTerminalStatus, isTerminalStatus } from "../../../utils/terminal-status.ts";
import type { CliRuntime } from "../../runtime.ts";
import { registerTaskArtifactCommands } from "../../task-artifact.ts";
import { type CliReadOutput, getReadOutputMode, isPlainRequested, resolveListOutput } from "../read-output.ts";
import { createMultiValueAccumulator } from "../task/edit-fields.ts";
import { registerTaskCreate } from "./create.ts";
import { addTaskEditOptions, runTaskEdit } from "./edit.ts";
import {
	normalizeCliPriority,
	normalizeCliProjects,
	normalizeCliStatusList,
	normalizeCliTaskTypes,
} from "./filter-normalizers.ts";
import { parseTaskListRequest } from "./list-parse.ts";
import { queryTaskList } from "./list-query.ts";
import { formatTaskListRow, groupTaskListByStatus, printTaskListGroupedByStatus } from "./list-render.ts";
import {
	formatTaskEditError,
	printMissingRequiredArgument,
	resolveCliMilestoneInput,
	TASK_SORT_FIELD_LIST,
	TASK_SORT_FIELDS,
} from "./policies.ts";

export type TaskRuntime = {
	runtime: CliRuntime;
	readOutput: CliReadOutput;
};

async function printDuplicateIntegrityWarning(core: Core): Promise<boolean> {
	const groups = await findLocalDuplicateTaskIds(core);
	if (groups.length === 0) return false;
	console.error(formatDuplicateTaskIdWarning(groups));
	process.exitCode = 1;
	return true;
}

async function loadLocalTaskView(core: Core, taskId: string) {
	const localTasks = await core.filesystem.listTasks();
	const task = await core.getTaskWithSubtasks(taskId, localTasks, { includeCrossBranch: false });
	if (!task) {
		console.error(`Task ${taskId} not found. ${LOCAL_TASK_LOOKUP_HINT}`);
		process.exitCode = 1;
		return null;
	}
	return {
		task,
		tasks: localTasks.some((candidate) => taskIdsEqual(task.id, candidate.id)) ? localTasks : [...localTasks, task],
		detail: await loadTaskDetail(core, task),
	};
}

async function loadLocalEditableTask(core: Core, taskId: string, action: "archive" | "complete"): Promise<Task | null> {
	const task = await core.loadTaskById(taskId, { includeCrossBranch: false });
	if (!task) {
		console.error(`Task ${taskId} not found. ${LOCAL_TASK_LOOKUP_HINT}`);
		process.exitCode = 1;
		return null;
	}
	if (!isLocalEditableTask(task)) {
		console.error(`Cannot ${action} task from another branch: ${task.id}`);
		process.exitCode = 1;
		return null;
	}
	return task;
}

function printTaskViewOutput(
	detail: Awaited<ReturnType<typeof loadTaskDetail>>,
	cwd: string,
	outputMode: ReadOutputMode,
	artifacts: TaskArtifactProjection,
): boolean {
	if (outputMode === "json") {
		printJson(taskViewJson(detail, cwd, artifacts));
		return true;
	}
	console.log(formatTaskPlainText(detail, { artifacts }));
	return true;
}

export function registerTaskCommands(program: Command, { runtime, readOutput }: TaskRuntime): void {
	const taskTypeExample = JSON.stringify(getCliTaskTypeValues()[0] ?? "<configured-type>");
	const requireProjectRoot = () => runtime.projectRoot();
	const taskCmd = program.command("task").aliases(["tasks"]);
	function taskReadOptions(options: ReadOutputOptions): ReadOutputOptions {
		const taskOptions = taskCmd.opts<ReadOutputOptions>();
		return { json: Boolean(options.json || taskOptions.json), plain: Boolean(options.plain || taskOptions.plain) };
	}
	function getTaskReadOutputMode(options: ReadOutputOptions): ReadOutputMode | null {
		return getReadOutputMode(taskReadOptions(options), readOutput);
	}
	taskCmd.hook("preSubcommand", (command, subcommand) => {
		if (command.opts().json && !["list", "view", "artifact"].includes(subcommand.name()))
			command.error("error: unknown option '--json'", { code: "commander.unknownOption", exitCode: 1 });
	});
	registerTaskCreate(taskCmd, runtime, readOutput);
	registerTaskArtifactCommands(taskCmd, { createCore: async () => new Core(await requireProjectRoot()) });

	async function runTaskList(
		options: OptionValues,
		emitJson: (value: ReturnType<typeof taskListJson>) => void = printJson,
	) {
		const listOutput = resolveListOutput({ ...options, ...taskReadOptions(options) }, taskListCommand, readOutput);
		if (!listOutput) return;
		const { outputMode, listWindow } = listOutput;
		const core = new Core(await requireProjectRoot());
		try {
			const hasDuplicateIds = await printDuplicateIntegrityWarning(core);
			if (hasDuplicateIds && outputMode === "json") return;
			const request = await parseTaskListRequest(core, options, TASK_SORT_FIELDS, {
				statusList: normalizeCliStatusList,
				priority: normalizeCliPriority,
				types: normalizeCliTaskTypes,
				projects: normalizeCliProjects,
			});
			if (!request) return;
			const { config, parentId, rows, jsonRows } = await queryTaskList(
				core,
				request,
				outputMode === "json" || request.ready,
			);
			if (outputMode === "json") {
				const page = selectListWindow(jsonRows, listWindow);
				return emitJson(taskListJson(page.items, page));
			}
			const statuses = config?.statuses || [];
			const priority = options.sort?.toLowerCase() === "priority";
			const printed = priority ? rows : groupTaskListByStatus(rows, statuses).flatMap((group) => group.tasks);
			printListWindow(printed, listWindow, (windowTasks) => {
				if (windowTasks.length === 0)
					return process.stdout.write(
						parentId ? `No child tasks found for parent task ${request.parentDisplayId}.\n` : "No tasks found.\n",
					);
				if (priority) {
					process.stdout.write("Tasks (sorted by priority):\n");
					for (const task of windowTasks) process.stdout.write(`${formatTaskListRow(task, true)}\n`);
					return;
				}
				printTaskListGroupedByStatus(windowTasks, statuses);
			});
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error));
			process.exitCode = 1;
		}
	}

	const taskListCommand = addHelpSchema(taskCmd.command("list"), {
		reads: "Local editable tasks from the configured AgenticWorkspace directory",
		required: [],
		optional: [
			{ name: "status", type: () => statusType({ multiple: true }), description: "Filter by one or more statuses" },
			{ name: "exclude-status", type: statusType, description: "Exclude statuses" },
			{ name: "assignee", type: TASK_FIELD_LABELS.ASSIGNEE, description: "Filter by @name" },
			{ name: "unassigned", type: "Boolean", description: "Only tasks without an assignee" },
			{ name: "milestone", type: "Milestone ID or title", description: "Filter by milestone" },
			{ name: "parent", type: "Task ID", description: "Show subtasks of a parent task" },
			{ name: "priority", type: priorityType, description: "Filter by priority" },
			{ name: "type", type: () => taskType({ multiple: true }), description: "Filter by configured types" },
			{ name: "project", type: () => projectType({ multiple: true }), description: "Filter by configured projects" },
			{ name: "labels", type: "Comma-separated strings", description: "Require every listed label" },
			{ name: "search", type: "String", description: "Search task content and metadata" },
			{ name: "ready", type: "Boolean", description: "Only show unblocked tasks" },
			{ name: "limit", type: "Positive integer", description: "Maximum tasks after sorting" },
			{ name: "sort", type: choiceType(TASK_SORT_FIELDS), description: "Task ordering" },
			...LIST_WINDOW_HELP_FIELDS,
			{ name: "plain", type: "Boolean", description: "Use text output" },
			{ name: "json", type: "Boolean", description: "Use versioned JSON output" },
			{ name: "watch", type: "Boolean", description: "Requires --json; emit changed full lists" },
		],
		output: `Plain text task list by default, or versioned JSON with --json. ${LIST_WINDOW_OUTPUT_HELP}`,
		examples: ["agentic-workspace task list --plain", "agentic-workspace task list --json --watch"],
	})
		.description("list tasks grouped by status")
		.option("-s, --status <status>", "filter tasks by status", createMultiValueAccumulator())
		.option("--exclude-status <status>", "exclude tasks by status", createMultiValueAccumulator())
		.option("-a, --assignee <assignee>", "filter tasks by assignee")
		.option("--unassigned", "filter tasks without an assignee")
		.option("-m, --milestone <milestone>", "filter tasks by milestone")
		.option("-p, --parent <taskId>", "filter tasks by parent task ID")
		.option("--priority <priority>", "filter tasks by priority")
		.option("--type <type>", "filter by task type", createMultiValueAccumulator())
		.option("--project <project>", "filter by project", createMultiValueAccumulator())
		.option("-l, --labels <labels>", "filter tasks by labels", createMultiValueAccumulator())
		.option("--search <query>", "search task content")
		.option("--ready", "only show ready tasks")
		.option("--limit <number>", "limit tasks displayed")
		.option("--sort <field>", `sort tasks by field (${TASK_SORT_FIELD_LIST})`);
	addListWindowOptions(taskListCommand)
		.option("--plain", "use plain text output")
		.option("--json", "print versioned machine-readable JSON output")
		.option("--watch", "keep emitting changed full JSON lists (requires --json)")
		.action(async (options) => {
			if (!options.watch) return runTaskList(options);
			if (getTaskReadOutputMode(options) !== "json") {
				console.error("--watch requires --json and cannot be combined with --plain.");
				process.exitCode = 1;
				return;
			}
			const filesystem = new Core(await requireProjectRoot()).filesystem;
			await watchJson(
				[filesystem.agenticWorkspaceDir, dirname(filesystem.configFilePath)],
				[
					filesystem.tasksDir,
					filesystem.completedDir,
					filesystem.milestonesDir,
					filesystem.archiveMilestonesDir,
					filesystem.configFilePath,
				],
				async () => {
					let result: string | undefined;
					await runTaskList(options, (value) => {
						result = formatJson(value);
					});
					return result;
				},
			);
			if (process.exitCode === 130 || process.exitCode === 143)
				throw Object.assign(new Error("CLI requested exit"), { exitCode: process.exitCode });
		});

	const editRuntime = {
		createCore: async () => new Core(await requireProjectRoot()),
		hasInteractiveTTY: runtime.hasInteractiveTTY,
		isPlainRequested: (options: { plain?: boolean }) => isPlainRequested(options, readOutput),
		printMissingRequiredArgument,
		formatError: formatTaskEditError,
		resolveMilestone: resolveCliMilestoneInput,
	};
	const taskEditCommand = addHelpSchema(taskCmd.command("edit [taskIds...]"), {
		required: [
			{
				name: "taskIds",
				type: "Task IDs",
				description:
					"Tasks to update; prompted when omitted in interactive mode. Several IDs apply the same shared-field change to every task",
			},
		],
		optional: [
			{ name: "title", type: "String", description: "Replacement task title" },
			{ name: "description", type: "Markdown", description: "Replacement description" },
			{ name: "status", type: statusType, description: "Project task status; case-insensitive" },
			{ name: "type", type: taskType, description: "Replacement task type; case-insensitive" },
			{
				name: "project",
				type: projectType,
				description: "Replacement task project; case-insensitive; pass an empty value to clear",
			},
			{ name: "due-date", type: "date", description: "Set the task due date (YYYY-MM-DD)" },
			{ name: "clear-due-date", type: "Boolean", description: "Clear the task due date" },
			{
				name: "assignee",
				type: "Comma-separated strings",
				description: 'Replace all assignees; repeat -a or use @name1,@name2; -a "" clears them',
			},
			{
				name: "label",
				type: "Comma-separated strings",
				description: "Replace all labels; repeat --label or use label1,label2",
			},
			{
				name: "add-label",
				type: "Comma-separated strings",
				description: "Add labels; repeat --add-label or use label1,label2",
			},
			{
				name: "remove-label",
				type: "Comma-separated strings",
				description: "Remove labels; repeat --remove-label or use label1,label2",
			},
			{
				name: "clear-labels",
				type: "Boolean",
				description: "Remove all labels; cannot combine with other label flags",
			},
			{
				name: "clear-deps",
				type: "Boolean",
				description: "Remove all task dependencies; cannot combine with dependency flags",
			},
			{
				name: "add-ref",
				type: "Comma-separated strings",
				description: "Add references; repeat --add-ref or use ref1,ref2",
			},
			{
				name: "remove-ref",
				type: "Comma-separated strings",
				description: "Remove references; repeat --remove-ref or use ref1,ref2",
			},
			{
				name: "clear-refs",
				type: "Boolean",
				description: "Remove all references; cannot combine with --ref, --add-ref, or --remove-ref",
			},
			{ name: "clear-docs", type: "Boolean", description: "Remove all documentation; cannot combine with --doc" },
		],
		writes: "Updates task metadata and structured frontmatter fields through AgenticWorkspace",
		output: "Updated task details; use --plain for text output",
		examples: [
			'agentic-workspace task edit {{TASK_ID:1}} --status "<active status>" -a @sara',
			`agentic-workspace task edit {{TASK_ID:1}} --type ${taskTypeExample}`,
			'agentic-workspace task edit {{TASK_ID:1}} {{TASK_ID:2}} --status "<active status>"',
		],
	}).description("edit an existing task");
	addTaskEditOptions(taskEditCommand).action(async (taskIds: string[] | undefined, options) =>
		runTaskEdit(taskIds, options, editRuntime),
	);

	addHelpSchema(taskCmd.command("view <taskId>"), {
		reads: "Task metadata, description, references, documentation, and canonical task artifacts",
		required: [{ name: "taskId", type: "Task ID", description: "Task to display" }],
		optional: [
			{ name: "plain", type: "Boolean", description: "Use plain text output" },
			{ name: "json", type: "Boolean", description: "Use versioned machine-readable JSON output" },
		],
		output: "Plain text task detail view by default, or versioned JSON with --json",
		examples: ["agentic-workspace task view {{TASK_ID:1}} --plain", "agentic-workspace task view {{TASK_ID:1}} --json"],
	})
		.description("display task details")
		.option("--plain", "use plain text output")
		.option("--json", "print versioned machine-readable JSON output")
		.action(async (taskId: string, options) => {
			const outputMode = getTaskReadOutputMode(options);
			if (!outputMode) return;
			const cwd = await requireProjectRoot();
			const core = new Core(cwd);
			const taskView = await loadLocalTaskView(core, taskId);
			if (!taskView) return;
			const repository = core.filesystem.taskArtifacts;
			const [directory, entries] = await Promise.all([
				repository.containerPath(taskView.task.id),
				repository.list(taskView.task.id),
			]);
			printTaskViewOutput(taskView.detail, cwd, outputMode, {
				directory,
				artifacts: entries.map(({ path, state, sha256, approvedAt, size, type }) => ({
					path,
					state,
					...(sha256 ? { sha256 } : {}),
					...(approvedAt ? { approvedAt } : {}),
					size,
					type,
				})),
			});
		});

	for (const [name, description, action] of [
		["archive", "archive canceled, duplicate, or invalid work", "archive"] as const,
		["complete", "move a finished task to completed storage during cleanup", "complete"] as const,
	])
		addHelpSchema(taskCmd.command(`${name} <taskId>`), {
			required: [
				{
					name: "taskId",
					type: "Task ID",
					description:
						action === "archive" ? "Task to archive" : "Task in the configured terminal status to move to completed",
				},
			],
			optional: [],
			writes:
				action === "archive"
					? "Archives canceled, duplicate, or invalid work and removes incoming dependencies and task references"
					: "During periodic cleanup, moves a finished task in the configured final status off the board to completed storage, preserving its record and dependency links.",
			output:
				action === "archive" ? "Archive confirmation text" : "Completion cleanup confirmation and completed file path",
			examples: [`agentic-workspace task ${action} {{TASK_ID:1}}`],
		})
			.description(description)
			.action(async (taskId: string) => {
				const core = new Core(await requireProjectRoot());
				const task = await loadLocalEditableTask(core, taskId, action);
				if (!task) return;
				if (action === "archive") {
					const { success, cleanedTaskIds } = await core.archiveTask(task.id, { includeCrossBranch: false });
					if (!success) {
						console.error(`Failed to archive task: ${task.id}`);
						process.exitCode = 1;
						return;
					}
					console.log(`Archived task ${task.id}`);
					const cleanupMessage = formatDependencyCleanupMessage(task.id, cleanedTaskIds);
					if (cleanupMessage) console.log(cleanupMessage);
					return;
				}
				const statuses = (await core.filesystem.loadConfig())?.statuses ?? [...DEFAULT_STATUSES];
				const terminalStatus = getTerminalStatus(statuses) ?? DEFAULT_DONE_STATUS;
				if (!isTerminalStatus(task.status, statuses)) {
					console.error(
						`Task ${task.id} is not ${terminalStatus}. Set status to "${terminalStatus}" with: agentic-workspace task edit ${task.id} -s "${terminalStatus}" before cleanup.`,
					);
					process.exitCode = 1;
					return;
				}
				if (!(await core.completeTask(task.id, { includeCrossBranch: false }))) {
					console.error(`Failed to complete task: ${task.id}`);
					process.exitCode = 1;
					return;
				}
				const completedFilePath = (await core.getTask(task.id))?.filePath;
				console.log(`Completed task ${task.id}.`);
				if (completedFilePath) console.log(`File: ${completedFilePath}`);
			});

	taskCmd
		.command("demote <taskId>")
		.description("move task back to drafts")
		.action(async (taskId: string) => {
			const core = new Core(await requireProjectRoot());
			try {
				const task = await core.loadTaskById(taskId, { includeCrossBranch: false });
				const demotion = task ? await core.demoteTask(task.id, { includeCrossBranch: false }) : null;
				if (!task || !demotion?.success) {
					console.error(`Task ${taskId} not found. ${LOCAL_TASK_LOOKUP_HINT}`);
					process.exitCode = 1;
					return;
				}
				console.log(`Demoted task ${task.id}`);
				const cleanupMessage = formatDependencyCleanupMessage(task.id, demotion.cleanedTaskIds);
				if (cleanupMessage) console.log(cleanupMessage);
			} catch (error) {
				console.error(error instanceof Error ? error.message : String(error));
				process.exitCode = 1;
			}
		});

	taskCmd
		.argument("[taskId]")
		.option("--plain", "use plain text output")
		.option("--json", "print versioned machine-readable JSON output")
		.action(async (taskId: string | undefined, options: ReadOutputOptions) => {
			const outputMode = getReadOutputMode(options, readOutput);
			if (!outputMode) return;
			if (taskId && ["create", "list", "edit", "view", "archive", "complete", "demote"].includes(taskId)) {
				console.error(`Unknown command: ${taskId}`);
				taskCmd.help();
				return;
			}
			if (!taskId) return void taskCmd.help();
			const cwd = await requireProjectRoot();
			const core = new Core(cwd);
			const taskView = await loadLocalTaskView(core, taskId);
			if (!taskView) return;
			const repository = core.filesystem.taskArtifacts;
			const [directory, entries] = await Promise.all([
				repository.containerPath(taskView.task.id),
				repository.list(taskView.task.id),
			]);
			printTaskViewOutput(taskView.detail, cwd, outputMode, {
				directory,
				artifacts: entries.map(({ path, state, sha256, approvedAt, size, type }) => ({
					path,
					state,
					...(sha256 ? { sha256 } : {}),
					...(approvedAt ? { approvedAt } : {}),
					size,
					type,
				})),
			});
		});
}
