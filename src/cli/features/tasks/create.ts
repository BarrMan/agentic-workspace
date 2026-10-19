import type { Command, OptionValues } from "commander";
import { Core } from "../../../index.ts";
import { addHelpSchema } from "../../commands/help-schema.ts";
import type { CliRuntime } from "../../runtime.ts";
import type { CliReadOutput } from "../read-output.ts";
import { isPlainRequested } from "../read-output.ts";
import { buildTaskCreateInput, createAndReportTask } from "./input.ts";

async function createTask(
	title: string | undefined,
	options: OptionValues,
	runtime: CliRuntime,
	readOutput: CliReadOutput,
): Promise<void> {
	if (title === undefined || title.trim().length === 0) {
		console.error("error: missing required argument 'title'");
		process.exitCode = 1;
		return;
	}
	const core = new Core(await runtime.projectRoot());
	await core.ensureConfigLoaded();
	const input = await buildTaskCreateInput(title, options, async (value) => value);
	if (!input) return;
	await createAndReportTask(core, input, {
		plain: isPlainRequested(options, readOutput),
	});
}

export function registerTaskCreate(taskCmd: Command, runtime: CliRuntime, readOutput: CliReadOutput): void {
	addHelpSchema(taskCmd.command("create <title>"), {
		required: [{ name: "title", type: "String", description: "Task title" }],
		optional: [{ name: "description", type: "Markdown", description: "Task outcome and context" }],
		writes: "Creates a task markdown file through AgenticWorkspace",
		output: "Created task details; use --plain for text output",
		examples: ['agentic-workspace task create "Fix session expiry" --description "Ensure sessions expire"'],
	})
		.option("--description <text>", "task description")
		.action((title: string | undefined, options: OptionValues) => createTask(title, options, runtime, readOutput));
}
