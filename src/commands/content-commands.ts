import type { Command } from "commander";
import type { Core } from "../core/agentic-workspace.ts";
import { decisionListJson, printJson } from "../formatters/json-output.ts";
import type { Decision } from "../types/index.ts";
import {
	addListWindowOptions,
	LIST_WINDOW_HELP_FIELDS,
	LIST_WINDOW_OUTPUT_HELP,
	type ListWindow,
	type ListWindowOptions,
	printListWindow,
	selectListWindow,
} from "../utils/list-window.ts";
import { addHelpSchema } from "./help-schema.ts";

type ContentCommandRuntime = {
	createCore(): Promise<Core>;
	isPlainRequested(options?: { plain?: boolean }): boolean;
	resolveListOutput(
		options: ListWindowOptions & { json?: boolean; plain?: boolean },
		command: Command,
	): { outputMode: "interactive" | "plain" | "json"; listWindow: ListWindow } | null;
};

export function registerContentCommands(program: Command, runtime: ContentCommandRuntime): void {
	const decisionCmd = program.command("decision");
	addHelpSchema(decisionCmd.command("create <title>"), {
		required: [{ name: "title", type: "String", description: "Decision title" }],
		optional: [
			{ name: "status", type: "String", description: "Decision status; free-form, defaults to proposed" },
			{ name: "plain", type: "Boolean", description: "Use plain text output" },
		],
		writes: "Creates a decision markdown file under the configured decisions directory",
		output: "Created decision ID",
		examples: ['agentic-workspace decision create "Adopt Bun test runner" -s accepted --plain'],
	})
		.description("create a decision")
		.option("-s, --status <status>", "set decision status (free-form, defaults to proposed)")
		.option("--plain", "use plain text output")
		.action(async (title: string, options) => {
			const core = await runtime.createCore();
			const id = await core.generateNextDecisionId();
			const decision: Decision = {
				id,
				title,
				date: new Date().toISOString().slice(0, 16).replace("T", " "),
				status: (options.status || "proposed") as Decision["status"],
				context: "",
				decision: "",
				consequences: "",
				rawContent: "",
			};
			await core.createDecision(decision);
			console.log(`Created decision ${id}`);
		});
	const decisionListCommand = addHelpSchema(decisionCmd.command("list"), {
		reads: "Decisions under the configured decisions directory",
		writes: "None; this is a read-only command",
		required: [],
		optional: [
			...LIST_WINDOW_HELP_FIELDS,
			{ name: "plain", type: "Boolean", description: "Use plain text output, which is the default for this command" },
			{ name: "json", type: "Boolean", description: "Use versioned machine-readable JSON output" },
		],
		output: `Decision list with IDs, titles, and statuses, ordered by ID; versioned JSON with --json. ${LIST_WINDOW_OUTPUT_HELP}; JSON adds total and nextSkip`,
		examples: [
			"agentic-workspace decision list --plain",
			"agentic-workspace decision list --json",
			"agentic-workspace decision list --max-count 20",
		],
	}).description("list decisions");
	addListWindowOptions(decisionListCommand)
		.option("--plain", "use plain text output")
		.option("--json", "print versioned machine-readable JSON output")
		.action(async (options) => {
			const listOutput = runtime.resolveListOutput(options, decisionListCommand);
			if (!listOutput) return;
			const decisions = await (await runtime.createCore()).listDecisions();
			if (listOutput.outputMode === "json") {
				const page = selectListWindow(decisions, listOutput.listWindow);
				printJson(decisionListJson(page.items, page));
				return;
			}
			printListWindow(decisions, listOutput.listWindow, (items) => {
				if (items.length === 0) console.log("No decisions found.");
				for (const decision of items)
					console.log(`${decision.id} - ${decision.title}${decision.status ? ` (${decision.status})` : ""}`);
			});
		});
}
