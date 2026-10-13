import * as clack from "@clack/prompts";
import type { Command, OptionValues } from "commander";
import {
	addHelpSchema,
	getCliTaskTypeValues,
	priorityType,
	projectType,
	statusType,
	taskType,
} from "../../../commands/help-schema.ts";
import { Core } from "../../../index.ts";
import { resolveMilestoneInputForStorage } from "../../../utils/milestone-storage.ts";
import { getValidStatuses } from "../../../utils/status.ts";
import type { CliRuntime } from "../../runtime.ts";
import type { CliReadOutput } from "../read-output.ts";
import { isPlainRequested } from "../read-output.ts";
import { createMultiValueAccumulator, hasCreateFieldFlags } from "../task/edit-fields.ts";
import { buildTaskCreateInput, createAndReportTask } from "./input.ts";
import { runTaskCreateWizard } from "./wizard.ts";

async function resolveMilestone(core: Core, milestone: string): Promise<string> {
	const [activeMilestones, archivedMilestones] = await Promise.all([
		core.filesystem.listMilestones(),
		core.filesystem.listArchivedMilestones(),
	]);
	return resolveMilestoneInputForStorage(milestone, activeMilestones, archivedMilestones);
}

async function createTask(
	title: string | undefined,
	options: OptionValues,
	runtime: CliRuntime,
	readOutput: CliReadOutput,
): Promise<void> {
	const useWizard = runtime.hasInteractiveTTY && title === undefined && !hasCreateFieldFlags(options);
	if (!useWizard && (title === undefined || title.trim().length === 0)) {
		console.error("error: missing required argument 'title'");
		process.exitCode = 1;
		return;
	}
	const core = new Core(await runtime.projectRoot());
	await core.ensureConfigLoaded();
	if (useWizard) {
		const statuses = await getValidStatuses(core);
		const config = await core.filesystem.loadConfig();
		const input = await runTaskCreateWizard({
			statuses,
			priorities: config?.priorities,
			types: config?.types,
			projects: config?.projects,
		});
		if (!input) return void clack.cancel("Task create cancelled.");
		try {
			const { task, filePath } = await core.createTaskFromInput(input);
			console.log(`Created task ${task.id}`);
			if (filePath) console.log(`File: ${filePath}`);
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error));
			process.exitCode = 1;
		}
		return;
	}
	const input = await buildTaskCreateInput(title ?? "", options, (milestone) => resolveMilestone(core, milestone));
	if (!input) return;
	await createAndReportTask(core, input, {
		kind: options.draft ? "draft" : "task",
		plain: isPlainRequested(options, readOutput),
	});
}

export function registerTaskCreate(taskCmd: Command, runtime: CliRuntime, readOutput: CliReadOutput): void {
	const taskTypeExample = JSON.stringify(getCliTaskTypeValues()[0] ?? "<configured-type>");
	addHelpSchema(taskCmd.command("create [title]"), {
		required: [{ name: "title", type: "String", description: "Task title; prompted when omitted in interactive mode" }],
		optional: [
			{ name: "description", type: "Markdown", description: "Task outcome and context" },
			{
				name: "status",
				type: () => statusType({ includeDraft: true }),
				description: "Project task status; case-insensitive",
			},
			{
				name: "assignee",
				type: "Comma-separated strings",
				description:
					'Assign one or more @names; repeat -a or use @name1,@name2; omitting it applies the configured defaultAssignee, while -a "" leaves the task unassigned',
			},
			{ name: "labels", type: "Comma-separated strings", description: "Task labels; repeat -l or use label1,label2" },
			{ name: "priority", type: priorityType, description: "Task priority" },
			{ name: "type", type: taskType, description: "Task type; case-insensitive" },
			{ name: "project", type: projectType, description: "Task project; case-insensitive" },
			{ name: "due-date", type: "date", description: "Optional due date (YYYY-MM-DD)" },
			{ name: "ordinal", type: "Integer", description: "Non-negative manual ordering value" },
			{ name: "parent", type: "Task ID", description: "Existing parent task for subtasks; not a milestone ID" },
		],
		writes: "Creates a task or draft markdown file through AgenticWorkspace",
		output: "Created task details; use --plain for text output",
		examples: [
			`agenticworkspace task create "Fix session expiry" --type ${taskTypeExample}`,
			'agenticworkspace task create -p {{TASK_ID:1}} "Add tests"',
		],
	})
		.option("-d, --description <text>", "task description")
		.option("--desc <text>", "alias for --description")
		.option(
			"-a, --assignee <assignees>",
			'assign task to one or more @names (comma-separated or repeatable); pass "" to leave it unassigned',
			createMultiValueAccumulator(),
		)
		.option("-s, --status <status>")
		.option("-l, --labels <labels>", "add task labels (comma-separated or repeatable)", createMultiValueAccumulator())
		.option("--priority <priority>", "set task priority (configured priorities)")
		.option("--type <type>", "set task type (configured task types)")
		.option("--project <project>", "set task project (configured projects)")
		.option("--due-date <date>", "set due date (YYYY-MM-DD)")
		.option("--plain", "use plain text output after creating")
		.option("--ordinal <number>", "set task ordinal for custom ordering")
		.option("-m, --milestone <milestone>", "assign task to milestone by ID or title")
		.option("--draft")
		.option("-p, --parent <taskId>", "specify existing parent task ID, not a milestone ID")
		.option(
			"--depends-on <taskIds>",
			"specify task dependencies (comma-separated or use multiple times)",
			(value, previous) => [...(Array.isArray(previous) ? previous : previous ? [previous] : []), value],
		)
		.option("--dep <taskIds>", "specify task dependencies (shortcut for --depends-on)", (value, previous) => [
			...(Array.isArray(previous) ? previous : previous ? [previous] : []),
			value,
		])
		.option("--ref <reference>", "add reference URL or file path (can be used multiple times)", (value, previous) => [
			...(Array.isArray(previous) ? previous : previous ? [previous] : []),
			value,
		])
		.option(
			"--modified-file <path>",
			"add modified file path from project root (can be used multiple times)",
			(value, previous) => [...(Array.isArray(previous) ? previous : previous ? [previous] : []), value],
		)
		.option(
			"--doc <documentation>",
			"add documentation URL or file path (can be used multiple times)",
			(value, previous) => [...(Array.isArray(previous) ? previous : previous ? [previous] : []), value],
		)
		.action((title: string | undefined, options: OptionValues) => createTask(title, options, runtime, readOutput));
}
