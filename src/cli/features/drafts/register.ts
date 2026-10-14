import type { Command } from "commander";
import { runDraftTransition } from "../../../commands/draft-actions.ts";
import { addHelpSchema, projectType, taskType } from "../../../commands/help-schema.ts";
import { DRAFT_STATUS } from "../../../constants/index.ts";
import { loadTaskDetail } from "../../../core/task-detail.ts";
import { formatTaskPlainText } from "../../../formatters/task-plain-text.ts";
import { Core } from "../../../index.ts";
import { isAmbiguousIdError } from "../../../utils/entity-id.ts";
import { addListWindowOptions, type ListWindowOptions } from "../../../utils/list-window.ts";
import { parseClearableStringList, parseDelimitedStringList } from "../../../utils/task-builders.ts";
import { sortTasks } from "../../../utils/task-sorting.ts";
import { addTaskEditOptions, type EditRuntime, runDraftEdit } from "../tasks/edit.ts";
import { createAndReportTask } from "../tasks/input.ts";

type DraftRuntime = {
	requireProjectRoot: () => Promise<string>;
	resolveListOutput: (
		options: ListWindowOptions & { plain?: boolean },
		command: Command,
	) => {
		outputMode: "interactive" | "plain" | "json";
		listWindow: import("../../../utils/list-window.ts").ListWindow;
	} | null;
	isPlainRequested: (options?: { plain?: boolean }) => boolean;
	edit: EditRuntime;
	taskSortFields: readonly string[];
	taskSortFieldList: string;
};

async function viewDraftById(core: Core, taskId: string): Promise<void> {
	try {
		const draft = await core.filesystem.loadDraft(taskId);
		if (!draft) return void console.error(`Draft ${taskId} not found.`);
		console.log(formatTaskPlainText(await loadTaskDetail(core, draft)));
	} catch (error) {
		if (isAmbiguousIdError(error)) {
			console.error(error.message);
			process.exitCode = 1;
			return;
		}
		throw error;
	}
}

export function registerDraftCommands(program: Command, runtime: DraftRuntime): void {
	const draftCmd = program.command("draft");
	const draftListCommand = draftCmd
		.command("list")
		.description("list all drafts")
		.option("--sort <field>", `sort drafts by field (${runtime.taskSortFieldList})`);
	addListWindowOptions(draftListCommand)
		.option("--plain", "use plain text output")
		.action(async (options: ListWindowOptions & { plain?: boolean; sort?: string }) => {
			const listOutput = runtime.resolveListOutput(
				{ ...options, plain: runtime.isPlainRequested(options) },
				draftListCommand,
			);
			if (!listOutput) return;
			const { listWindow } = listOutput;
			const sortField = options.sort ? options.sort.toLowerCase() : "priority";
			if (!runtime.taskSortFields.includes(sortField)) {
				console.error(`Invalid sort field: ${options.sort}. Valid values are: ${runtime.taskSortFieldList}`);
				process.exitCode = 1;
				return;
			}
			const core = new Core(await runtime.requireProjectRoot());
			await core.ensureConfigLoaded();
			const drafts = await core.filesystem.listDrafts();
			const config = await core.filesystem.loadConfig();
			const sortedDrafts = sortTasks(drafts, sortField, config?.priorities);
			const { printListWindow } = await import("../../../utils/list-window.ts");
			printListWindow(sortedDrafts, listWindow, (windowDrafts) => {
				if (windowDrafts.length === 0) return void console.log("No drafts found.");
				console.log("Drafts:");
				for (const draft of windowDrafts) {
					const priorityIndicator = draft.priority ? `[${draft.priority.toUpperCase()}] ` : "";
					console.log(`  ${priorityIndicator}${draft.id} - ${draft.title}`);
				}
			});
		});

	draftCmd
		.command("create <title>")
		.option("-d, --description <text>", "task description (multi-line: include real newlines inside the quoted string)")
		.option("--desc <text>", "alias for --description")
		.option(
			"-a, --assignee <assignees>",
			'assign draft to one or more @names (comma-separated or repeatable); pass "" to leave it unassigned',
			(value, previous) => [...(Array.isArray(previous) ? previous : previous ? [previous] : []), value],
		)
		.option("-s, --status <status>")
		.option("-l, --labels <labels>", "add draft labels (comma-separated or repeatable)", (value, previous) => [
			...(Array.isArray(previous) ? previous : previous ? [previous] : []),
			value,
		])
		.action(async (title: string, options) => {
			const core = new Core(await runtime.requireProjectRoot());
			await core.ensureConfigLoaded();
			await createAndReportTask(
				core,
				{
					title,
					description: options.description || options.desc ? String(options.description || options.desc) : undefined,
					status: DRAFT_STATUS,
					assignee: parseClearableStringList(options.assignee),
					labels: parseDelimitedStringList(options.labels),
				},
				{ kind: "draft" },
			);
		});

	const draftEditCommand = addHelpSchema(draftCmd.command("edit [taskId]"), {
		required: [
			{ name: "taskId", type: "Draft ID", description: "Draft to update; prompted when omitted in interactive mode" },
		],
		optional: [
			{ name: "title", type: "String", description: "Replacement draft title" },
			{ name: "description", type: "Markdown", description: "Replacement description" },
			{
				name: "status",
				type: "String",
				description: `Only "${DRAFT_STATUS}" is valid; drafts cannot change status`,
			},
			{ name: "type", type: taskType, description: "Replacement task type; case-insensitive" },
			{
				name: "project",
				type: projectType,
				description: "Replacement task project; case-insensitive; pass an empty value to clear",
			},
			{ name: "due-date", type: "date", description: "Set the due date (YYYY-MM-DD)" },
			{ name: "clear-due-date", type: "Boolean", description: "Clear the due date" },
			{
				name: "assignee",
				type: "Comma-separated strings",
				description: 'Replace all assignees; repeat -a or use @name1,@name2; -a "" clears them',
			},
			{ name: "label", type: "Comma-separated strings", description: "Replace all labels; repeatable" },
			{ name: "add-label", type: "Comma-separated strings", description: "Add labels; repeatable" },
			{ name: "remove-label", type: "Comma-separated strings", description: "Remove labels; repeatable" },
			{ name: "clear-labels", type: "Boolean", description: "Remove all labels" },
			{ name: "priority", type: "String", description: "Set priority (configured priorities)" },
			{ name: "ordinal", type: "Number", description: "Set ordinal for custom ordering" },
			{ name: "milestone", type: "String", description: "Assign to milestone by ID or title" },
			{ name: "clear-milestone", type: "Boolean", description: "Clear the milestone assignment" },
			{ name: "depends-on", type: "Comma-separated strings", description: 'Set dependencies; pass "" to clear' },
			{ name: "dep", type: "Comma-separated strings", description: "Set dependencies (shortcut for --depends-on)" },
			{ name: "clear-deps", type: "Boolean", description: "Remove all dependencies" },
			{ name: "ref", type: "Comma-separated strings", description: 'Replace all references; pass "" to clear' },
			{ name: "add-ref", type: "Comma-separated strings", description: "Add references; repeatable" },
			{ name: "remove-ref", type: "Comma-separated strings", description: "Remove references; repeatable" },
			{ name: "clear-refs", type: "Boolean", description: "Remove all references" },
			{ name: "doc", type: "Comma-separated strings", description: 'Set documentation; pass "" to clear' },
			{ name: "modified-file", type: "Comma-separated strings", description: "Set modified file paths; repeatable" },
			{ name: "clear-docs", type: "Boolean", description: "Remove all documentation" },
			{ name: "plain", type: "Boolean", description: "Use plain text output after editing" },
		],
		writes: "Updates draft metadata and structured frontmatter fields through AgenticWorkspace",
		output: "Updated draft details; use --plain for text output",
		examples: ['agentic-workspace draft edit DRAFT-1 -t "Renamed draft"'],
	}).description("edit an existing draft");
	addTaskEditOptions(draftEditCommand).action(async (taskId: string | undefined, options) =>
		runDraftEdit(taskId ? [taskId] : [], options, runtime.edit),
	);

	for (const [name, description, label, action] of [
		["archive", "archive a draft", "Archived", (core: Core, id: string) => core.archiveDraft(id)],
		["promote", "promote draft to task", "Promoted", (core: Core, id: string) => core.promoteDraft(id)],
	] as const)
		draftCmd
			.command(`${name} <taskId>`)
			.description(description)
			.action(async (taskId: string) =>
				runDraftTransition(taskId, label, async (id) => {
					const core = new Core(await runtime.requireProjectRoot());
					await core.ensureConfigLoaded();
					return await action(core, id);
				}),
			);

	draftCmd
		.command("view <taskId>")
		.description("display draft details")
		.option("--plain", "use plain text output")
		.action(async (taskId: string) => viewDraftById(new Core(await runtime.requireProjectRoot()), taskId));
	draftCmd
		.argument("[taskId]")
		.option("--plain", "use plain text output")
		.action(async (taskId: string | undefined) => {
			if (!taskId) return void draftCmd.help();
			await viewDraftById(new Core(await runtime.requireProjectRoot()), taskId);
		});
}
