import type { Command, OptionValues } from "commander";
import { formatValidPriorityValues, resolvePriorityLabel } from "../../../model/task/priority-config.ts";
import { addHelpSchema } from "../../commands/help-schema.ts";
import type { CliRuntime } from "../../runtime.ts";
import type { CliReadOutput } from "../read-output.ts";
import { isPlainRequested } from "../read-output.ts";
import { buildTaskCreateInput, createAndReportTask } from "./input.ts";

async function createTask(
	title: string,
	options: OptionValues,
	runtime: CliRuntime,
	readOutput: CliReadOutput,
): Promise<void> {
	if (title.trim().length === 0) {
		console.error("error: missing required argument 'title'");
		process.exitCode = 1;
		return;
	}
	const { core } = await runtime.application();
	await core.ensureConfigLoaded();
	if (options.priority) {
		const config = await core.storage.loadConfig();
		const priority = resolvePriorityLabel(String(options.priority), config);
		if (!priority) {
			console.error(`Invalid priority: ${options.priority}. Valid values are: ${formatValidPriorityValues(config)}`);
			process.exitCode = 1;
			return;
		}
		options.priority = priority;
	}
	const input = buildTaskCreateInput(title, options);
	if (!input) return;
	await createAndReportTask(core, input, {
		plain: isPlainRequested(options, readOutput),
	});
}

export function registerTaskCreate(taskCmd: Command, runtime: CliRuntime, readOutput: CliReadOutput): void {
	addHelpSchema(taskCmd.command("create <title>"), {
		required: [{ name: "title", type: "String", description: "Task title" }],
		optional: [
			{ name: "description", type: "Markdown", description: "Task outcome and context" },
			{ name: "priority", type: "String", description: "Configured priority label" },
			{ name: "label", type: "String[]", description: "Labels (repeat --label)" },
			{ name: "depends-on / dep", type: "Task ID[]", description: "Dependencies (repeat either option)" },
			{ name: "ref", type: "String[]", description: "References (repeat --ref)" },
			{ name: "doc", type: "Path[]", description: "Documentation paths (repeat --doc)" },
			{ name: "modified-file", type: "Path[]", description: "Modified files (repeat --modified-file)" },
		],
		writes: "Creates a task markdown file through AgenticWorkspace",
		output: "Created task details; use --plain for text output",
		examples: ['agentic-workspace task create "Fix session expiry" --description "Ensure sessions expire"'],
	})
		.option("--description <text>", "task description")
		.option("--priority <priority>", "configured priority label")
		.option(
			"--label <label>",
			"add task label (repeatable)",
			(value, previous: string[] = []) => [...previous, value],
			[],
		)
		.option(
			"--depends-on <taskId>",
			"add dependency (repeatable)",
			(value, previous: string[] = []) => [...previous, value],
			[],
		)
		.option(
			"--dep <taskId>",
			"add dependency (repeatable)",
			(value, previous: string[] = []) => [...previous, value],
			[],
		)
		.option(
			"--ref <reference>",
			"add reference (repeatable)",
			(value, previous: string[] = []) => [...previous, value],
			[],
		)
		.option(
			"--doc <path>",
			"add documentation path (repeatable)",
			(value, previous: string[] = []) => [...previous, value],
			[],
		)
		.option(
			"--modified-file <path>",
			"add modified file (repeatable)",
			(value, previous: string[] = []) => [...previous, value],
			[],
		)
		.action((title: string, options: OptionValues) => createTask(title, options, runtime, readOutput));
}
