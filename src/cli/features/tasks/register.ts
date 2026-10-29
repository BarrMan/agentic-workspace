import { type Command, Option, type OptionValues } from "commander";
import { loadTaskDetail } from "../../../controller/task-detail.ts";
import type { Core } from "../../../index.ts";
import { LOCAL_TASK_LOOKUP_HINT } from "../../../model/task/task-path.ts";
import { printJson, taskListJson, taskViewJson } from "../../../renderer/formatters/json-output.ts";
import { formatTaskPlainText } from "../../../renderer/formatters/task-plain-text.ts";
import { addHelpSchema } from "../../commands/help-schema.ts";
import { addListWindowOptions, LIST_WINDOW_OUTPUT_HELP, printListWindow, selectListWindow } from "../../list-window.ts";
import { type ReadOutputMode, type ReadOutputOptions, resolveReadOutputMode } from "../../read-output-mode.ts";
import type { CliRuntime } from "../../runtime.ts";
import { registerTaskArtifactCommands } from "../../task-artifact.ts";
import { type CliReadOutput, isPlainRequested, resolveListOutput } from "../read-output.ts";
import { registerTaskCreate } from "./create.ts";
import { runTaskEdit } from "./edit.ts";
import { parseTaskListRequest } from "./list-parse.ts";
import { queryTaskList } from "./list-query.ts";
import { groupTaskListByStatus, printTaskListGroupedByStatus } from "./list-render.ts";
import { formatTaskEditError } from "./policies.ts";

export type TaskRuntime = {
	runtime: CliRuntime;
	readOutput: CliReadOutput;
};

async function loadLocalTaskView(core: Core, taskId: string) {
	const localTasks = core.tasks.getActiveTasks();
	const task = await core.getTaskWithSubtasks(taskId, localTasks, {});
	if (!task) {
		console.error(`Task ${taskId} not found. ${LOCAL_TASK_LOOKUP_HINT}`);
		process.exitCode = 1;
		return null;
	}
	return {
		task,
		tasks: localTasks.some((candidate) => task.id === candidate.id) ? localTasks : [...localTasks, task],
		detail: await loadTaskDetail(core, task),
	};
}

function printTaskViewOutput(
	detail: Awaited<ReturnType<typeof loadTaskDetail>>,
	cwd: string,
	outputMode: ReadOutputMode,
	artifacts: Array<{ path: string; size: number; type: "text" | "binary" }>,
): boolean {
	if (outputMode === "json") {
		printJson(taskViewJson(detail, cwd, artifacts));
		return true;
	}
	console.log(formatTaskPlainText(detail, { artifacts }));
	return true;
}

export function registerTaskCommands(program: Command, { runtime, readOutput }: TaskRuntime): void {
	const taskCmd = program.command("task");
	function taskReadOptions(options: ReadOutputOptions): ReadOutputOptions {
		const taskOptions = taskCmd.opts<ReadOutputOptions>();
		return { json: Boolean(options.json || taskOptions.json), plain: Boolean(options.plain || taskOptions.plain) };
	}
	registerTaskCreate(taskCmd, runtime, readOutput);
	registerTaskArtifactCommands(taskCmd, { createCore: async () => (await runtime.application()).core });
	taskCmd
		.command("done")
		.description("mark the calling session's current task Done without completion or cleanup")
		.action(async () => {
			const taskId = process.env.AGENTIC_WORKSPACE_TASK_ID;
			if (!taskId) throw new Error("No current task is available in this session.");
			const { core } = await runtime.application();
			const { task } = await core.tasks.markDone(taskId);
			process.stdout.write(`Marked task ${task.id} Done.\n`);
		});
	addHelpSchema(taskCmd.command("approve <taskId> <modeId>"), {
		required: [
			{ name: "taskId", type: "Task ID", description: "Task to approve for the mode" },
			{ name: "modeId", type: "Mode ID", description: "Mode to approve for the task" },
		],
		writes: "Sets approval for the specified task and mode in response to user direction",
		output: "Plain confirmation naming the task and mode",
		examples: ["agentic-workspace task approve {{TASK_ID:1}} build"],
	})
		.description("approve a task for a mode")
		.action(async (taskId: string, modeId: string) => {
			const { core } = await runtime.application();
			const task = await core.setTaskModeApproval(taskId, modeId);
			process.stdout.write(`Approved task ${task.id} for mode ${modeId}.\n`);
		});

	async function runTaskList(
		options: OptionValues,
		emitJson: (value: ReturnType<typeof taskListJson>) => void = printJson,
	) {
		const listOutput = resolveListOutput({ ...options, ...taskReadOptions(options) }, taskListCommand, readOutput);
		if (!listOutput) return;
		const { outputMode, listWindow } = listOutput;
		const { core } = await runtime.application();
		try {
			const request = parseTaskListRequest(options);
			if (!request) return;
			const { config, rows, jsonRows } = await queryTaskList(core, request, outputMode === "json");
			if (outputMode === "json") {
				const page = selectListWindow(jsonRows, listWindow);
				return emitJson(taskListJson(page.items, page));
			}
			const statuses = config?.statuses || [];
			const printed = groupTaskListByStatus(rows, statuses).flatMap((group) => group.tasks);
			printListWindow(printed, listWindow, (windowTasks) => {
				if (windowTasks.length === 0) return process.stdout.write("No tasks found.\n");
				printTaskListGroupedByStatus(windowTasks, statuses);
			});
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error));
			process.exitCode = 1;
		}
	}

	const taskListCommand = addListWindowOptions(
		addHelpSchema(taskCmd.command("list"), {
			reads: "Local editable tasks from the configured AgenticWorkspace directory",
			required: [],
			optional: [
				{ name: "plain", type: "Boolean", description: "Use text output" },
				{ name: "json", type: "Boolean", description: "Use JSON output" },
			],
			output: `Plain text task list by default, or versioned JSON with --json. ${LIST_WINDOW_OUTPUT_HELP}`,
			examples: ["agentic-workspace task list --plain", "agentic-workspace task list --json"],
		}),
	)
		.description("list tasks grouped by status")
		.option("--plain", "use plain text output")
		.addOption(new Option("--json", "print versioned machine-readable JSON output").conflicts("plain"))
		.option("--limit <n>", "limit the number of matching tasks")
		.action((options) => runTaskList(options));

	const editRuntime = {
		createCore: async () => (await runtime.application()).core,
		isPlainRequested: (options: { plain?: boolean }) => isPlainRequested(options, readOutput),
		formatError: formatTaskEditError,
	};
	const taskEditCommand = addHelpSchema(taskCmd.command("edit <taskId>"), {
		required: [
			{
				name: "taskId",
				type: "Task ID",
				description: "Existing task to update",
			},
		],
		optional: [
			{ name: "title", type: "String", description: "Replacement task title" },
			{ name: "description", type: "Markdown", description: "Replacement description" },
		],
		writes: "Updates task metadata and structured frontmatter fields through AgenticWorkspace",
		output: "Updated task details; use --plain for text output",
		examples: ['agentic-workspace task edit {{TASK_ID:1}} --title "New title" --description "New description"'],
	}).description("edit an existing task");
	taskEditCommand
		.option("--title <title>", "replacement task title")
		.option("--description <description>", "replacement description")
		.action(async (taskId: string, options) => runTaskEdit(taskId, options, editRuntime));

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
		.addOption(new Option("--json", "print versioned machine-readable JSON output").conflicts("plain"))
		.action(async (taskId: string, options) => {
			const outputMode = resolveReadOutputMode(taskReadOptions(options), readOutput.hasInteractiveTTY);
			const cwd = await runtime.projectRoot();
			const { core } = await runtime.application();
			const taskView = await loadLocalTaskView(core, taskId);
			if (!taskView) return;
			const artifacts = await core.storage.taskArtifacts.list(taskView.task.id);
			printTaskViewOutput(taskView.detail, cwd, outputMode, artifacts);
		});
}
