import type { Command } from "commander";
import { addHelpSchema, choiceType } from "../../../commands/help-schema.ts";
import { DEFAULT_STATUSES } from "../../../constants/index.ts";
import { buildMilestoneBuckets, collectArchivedMilestoneKeys, milestoneKey } from "../../../core/milestones.ts";
import type { Core } from "../../../index.ts";
import { MilestoneHandlers, type MilestoneRemoveArgs } from "../../../mcp/tools/milestones/handlers.ts";
import type { CallToolResult } from "../../../mcp/types.ts";
import type { ListWindow, ListWindowOptions } from "../../../utils/list-window.ts";
import {
	addListWindowOptions,
	LIST_WINDOW_HELP_FIELDS,
	LIST_WINDOW_OUTPUT_HELP,
	milestoneSectionsInWindow,
	printListWindow,
} from "../../../utils/list-window.ts";
import { formatUtcDateForDisplay } from "../../../utils/utc-date-display.ts";

export type MilestoneRuntime = {
	createCore: () => Promise<Core>;
	resolveListOutput: (
		options: ListWindowOptions & { plain?: boolean },
		command: Command,
	) => { listWindow: ListWindow } | null;
};

function printToolResult(result: CallToolResult): void {
	const text = result.content
		.map((item) => (item.type === "text" ? item.text : ""))
		.filter(Boolean)
		.join("\n");
	if (text) console.log(text);
	if (result.isError) process.exitCode = 1;
}

async function runMutation(
	runtime: MilestoneRuntime,
	action: (handlers: MilestoneHandlers) => Promise<CallToolResult>,
): Promise<void> {
	try {
		printToolResult(await action(new MilestoneHandlers(await runtime.createCore())));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}

async function runMilestoneList(
	options: ListWindowOptions & { showCompleted?: boolean; plain?: boolean },
	command: Command,
	runtime: MilestoneRuntime,
): Promise<void> {
	const listOutput = runtime.resolveListOutput(options, command);
	if (!listOutput) return;
	const core = await runtime.createCore();
	await core.ensureConfigLoaded();
	const [tasks, milestones, archivedMilestones, config] = await Promise.all([
		core.queryTasks({ includeCrossBranch: false }),
		core.filesystem.listMilestones(),
		core.filesystem.listArchivedMilestones(),
		core.filesystem.loadConfig(),
	]);
	const buckets = buildMilestoneBuckets(tasks, milestones, config?.statuses ?? [...DEFAULT_STATUSES], {
		archivedMilestoneIds: collectArchivedMilestoneKeys(archivedMilestones, milestones),
		archivedMilestones,
	});
	const active = buckets.filter((bucket) => !bucket.isNoMilestone && !bucket.isCompleted);
	const completed = buckets.filter((bucket) => !bucket.isNoMilestone && bucket.isCompleted);
	const formatBucket = (bucket: (typeof buckets)[number]) => {
		const id = bucket.milestone ?? bucket.label;
		const milestone = [...milestones, ...archivedMilestones].find(
			(candidate) => milestoneKey(candidate.id) === milestoneKey(id),
		);
		return `  ${id}: ${bucket.label} (${bucket.doneCount}/${bucket.total} done${milestone?.dueDate ? `, due ${formatUtcDateForDisplay(milestone.dueDate)}` : ""})`;
	};
	const showCompleted = Boolean(options.showCompleted || process.argv.includes("--show-completed"));
	const listedMilestones = showCompleted ? [...active, ...completed] : active;
	printListWindow(listedMilestones, listOutput.listWindow, (listed, page) => {
		const prints = milestoneSectionsInWindow(page, active.length, showCompleted && completed.length > 0);
		const sections: string[] = [];
		if (prints.active)
			sections.push(
				[
					`Active milestones (${active.length}):`,
					...(active.length === 0 ? ["  (none)"] : listed.filter((bucket) => !bucket.isCompleted).map(formatBucket)),
				].join("\n"),
			);
		if (prints.completed)
			sections.push(
				[
					`Completed milestones (${completed.length}):`,
					...(completed.length === 0
						? ["  (none)"]
						: showCompleted
							? listed.filter((bucket) => bucket.isCompleted).map(formatBucket)
							: ["  (collapsed, use --show-completed to list)"]),
				].join("\n"),
			);
		console.log(sections.join("\n\n"));
	});
}

function runMilestoneAdd(
	name: string,
	options: { description?: string; dueDate?: string },
	runtime: MilestoneRuntime,
): Promise<void> {
	return runMutation(runtime, (handlers) =>
		handlers.addMilestone({ name, description: options.description, dueDate: options.dueDate }),
	);
}
async function runMilestoneRename(
	from: string,
	to: string,
	options: { updateTasks?: boolean; dueDate?: string; clearDueDate?: boolean },
	runtime: MilestoneRuntime,
): Promise<void> {
	if (options.dueDate !== undefined && options.clearDueDate) {
		console.error("Cannot use --due-date and --clear-due-date together.");
		process.exitCode = 1;
		return;
	}
	await runMutation(runtime, (handlers) =>
		handlers.renameMilestone({
			from,
			to,
			updateTasks: options.updateTasks !== false,
			dueDate: options.clearDueDate ? null : options.dueDate,
		}),
	);
}
async function runMilestoneRemove(
	name: string,
	options: { taskHandling?: string; reassignTo?: string },
	runtime: MilestoneRuntime,
): Promise<void> {
	const value = options.taskHandling;
	const taskHandling = value === undefined ? "clear" : value.trim().toLowerCase();
	if (taskHandling !== "clear" && taskHandling !== "keep" && taskHandling !== "reassign") {
		console.error(`Invalid task handling: ${options.taskHandling}. Valid values are: clear, keep, reassign`);
		process.exitCode = 1;
		return;
	}
	await runMutation(runtime, (handlers) =>
		handlers.removeMilestone({
			name,
			taskHandling: taskHandling as MilestoneRemoveArgs["taskHandling"],
			reassignTo: options.reassignTo,
		}),
	);
}
function runMilestoneArchive(name: string, runtime: MilestoneRuntime): Promise<void> {
	return runMutation(runtime, (handlers) => handlers.archiveMilestone({ name }));
}

export function registerMilestoneCommands(program: Command, runtime: MilestoneRuntime): void {
	const milestoneCmd = program.command("milestone").aliases(["milestones"]);
	const list = addHelpSchema(milestoneCmd.command("list"), {
		reads: "Milestone files and local task milestone values",
		required: [],
		optional: [
			{ name: "show-completed", type: "Boolean", description: "Include completed milestones" },
			...LIST_WINDOW_HELP_FIELDS,
			{ name: "plain", type: "Boolean", description: "Use text output instead of interactive UI" },
		],
		output: `Milestone list with completion status; active milestones come first, then completed ones with --show-completed. ${LIST_WINDOW_OUTPUT_HELP}`,
		examples: ["backlog milestone list --plain", "backlog milestone list --show-completed --max-count 10 --plain"],
	})
		.description("list milestones with completion status")
		.option("--show-completed", "show completed milestones");
	addListWindowOptions(list)
		.option("--plain", "use plain text output")
		.action((options: ListWindowOptions & { showCompleted?: boolean; plain?: boolean }) =>
			runMilestoneList(options, list, runtime),
		);
	addHelpSchema(milestoneCmd.command("add <name>"), {
		reads: "Active milestone files for duplicate and alias validation",
		required: [{ name: "name", type: "String", description: "Milestone name/title, trimmed before storage" }],
		optional: [
			{ name: "description", type: "Markdown", description: "Optional milestone description" },
			{ name: "due-date", type: "date", description: "Optional milestone due date (YYYY-MM-DD)" },
		],
		writes: "Creates a milestone markdown file in the active milestones directory",
		output: "Created milestone title and ID",
		examples: ['backlog milestone add "Release 1.0"', 'backlog milestone add "Beta" --description "Beta scope"'],
	})
		.description("add a milestone file")
		.option("-d, --description <text>", "milestone description")
		.option("--due-date <date>", "set due date (YYYY-MM-DD)")
		.action((name: string, options: { description?: string; dueDate?: string }) =>
			runMilestoneAdd(name, options, runtime),
		);
	addHelpSchema(milestoneCmd.command("rename <from> <to>"), {
		reads: "Active and archived milestone files, plus local tasks when task updates are enabled",
		required: [
			{ name: "from", type: "Milestone ID or title", description: "Existing active milestone to rename" },
			{ name: "to", type: "String", description: "New milestone title; checked for alias conflicts" },
		],
		optional: [
			{
				name: "update-tasks",
				type: "Boolean",
				description: "Update local task milestone references; default true, disable with --no-update-tasks",
			},
			{ name: "due-date", type: "date", description: "Set the milestone due date (YYYY-MM-DD)" },
			{ name: "clear-due-date", type: "Boolean", description: "Clear the milestone due date" },
		],
		writes: "Renames the milestone file and, by default, updates matching local task milestone values",
		output: "Rename summary, task update count, and file move path when changed",
		examples: [
			'backlog milestone rename "Release 1.0" "Release 2.0"',
			'backlog milestone rename m-1 "Release 2.0" --no-update-tasks',
		],
	})
		.description("rename a milestone file and update local tasks by default")
		.option("--no-update-tasks", "do not update local tasks that reference the milestone")
		.option("--due-date <date>", "set due date (YYYY-MM-DD)")
		.option("--clear-due-date", "clear milestone due date")
		.action((from: string, to: string, options: { updateTasks?: boolean; dueDate?: string; clearDueDate?: boolean }) =>
			runMilestoneRename(from, to, options, runtime),
		);
	addHelpSchema(milestoneCmd.command("remove <name>"), {
		reads: "Active and archived milestone files, plus local tasks unless task handling is keep",
		required: [{ name: "name", type: "Milestone ID or title", description: "Active milestone to remove" }],
		optional: [
			{
				name: "task-handling",
				type: choiceType(["clear", "keep", "reassign"]),
				description: "How to handle matching local task milestone values; default clear",
			},
			{
				name: "reassign-to",
				type: "Milestone ID or title",
				description: "Required when task-handling is reassign; target must be an active milestone",
			},
		],
		writes: "Moves the milestone file to the archived milestones directory and may clear or reassign local tasks",
		output: "Removal summary and task handling count",
		examples: [
			'backlog milestone remove "Release 1.0"',
			'backlog milestone remove "Release 1.0" --task-handling keep',
			'backlog milestone remove "Release 1.0" --task-handling reassign --reassign-to "Release 2.0"',
		],
	})
		.description("remove a milestone file and clear, keep, or reassign matching tasks")
		.option("--task-handling <mode>", "how to handle matching tasks (clear|keep|reassign)", "clear")
		.option("--reassign-to <milestone>", "target milestone when --task-handling reassign")
		.action((name: string, options: { taskHandling?: string; reassignTo?: string }) =>
			runMilestoneRemove(name, options, runtime),
		);
	addHelpSchema(milestoneCmd.command("archive <name>"), {
		reads: "Active milestone files",
		required: [{ name: "name", type: "Milestone ID or title", description: "Milestone to archive" }],
		optional: [],
		writes: "Moves a milestone file into the archived milestones directory",
		output: "Archive confirmation text",
		examples: ["backlog milestone archive m-1"],
	})
		.description("archive a milestone by id or title")
		.action((name: string) => runMilestoneArchive(name, runtime));
}
