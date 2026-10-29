import type { Command } from "commander";
import type { Core } from "../../controller/agentic-workspace.ts";
import type { SessionRuntime } from "../../model/session/session.ts";
import { OpenTuiWorkspaceController } from "../../renderer/opentui/workspace-controller.ts";
import { addHelpSchema } from "./help-schema.ts";

export function registerAgentWorkspaceCommands(
	program: Command,
	getCore: {
		project(): Promise<Core>;
		workspace(): Promise<{ core: Core; sessionRuntime: SessionRuntime }>;
		root?: () => Promise<Core>;
	},
): void {
	addHelpSchema(program.command("workspace"), {
		reads: "Agent session state and configuration",
		output: "OpenTUI task workspace",
		examples: ["agentic-workspace workspace"],
	})
		.description("open the OpenTUI task-centered agent workspace")
		.action(async () => {
			if (!process.stdin.isTTY || !process.stdout.isTTY)
				throw new Error("workspace requires both stdin and stdout to be TTYs.");
			const application = await getCore.workspace();
			await new OpenTuiWorkspaceController(application.core, { sessionRuntime: application.sessionRuntime }).run();
		});

	const sessions = addHelpSchema(program.command("agent-session"), {
		reads: "Task session state and saved conversation",
		output: "Session launch confirmation or question/answer result",
		examples: [
			"agentic-workspace agent-session start BACK-123",
			'agentic-workspace agent-session ask BACK-123 "What remains?"',
		],
	}).description("start or ask a task agent session");
	sessions
		.command("start <taskId>")
		.description("start a persistent task session using workspace launch semantics")
		.option("--mode <id-or-name>", "mode ID or configured name")
		.option("--preset <name>", "configured preset name")
		.action(async (taskId: string, options: { preset?: string; mode?: string }) => {
			const core = await getCore.project();
			const task = await core.tasks.getTask(taskId);
			if (!task) throw new Error(`Task not found: ${taskId}`);
			const session = await core.newSession(
				task,
				options.mode ? await resolveModeOption(core, options.mode) : undefined,
				options.preset,
			);
			const record = session.record;
			process.stdout.write(`Started session ${record.id} (preset: ${record.preset}).\n`);
		});
	sessions
		.command("ask <taskId> <question>")
		.description("ask the previous saved session in the current mode and print its answer")
		.action(async (taskId: string, question: string) => {
			const core = await getCore.project();
			const result = await core.callingSession.ask(taskId, question, {
				taskId: process.env.AGENTIC_WORKSPACE_TASK_ID,
				sessionId: process.env.AGENTIC_WORKSPACE_SESSION_ID,
			});
			process.stdout.write(`${result.answer}\n`);
		});

	const agentConfig = program.command("agent-config").description("set the calling session's mode model");
	agentConfig
		.command("model")
		.command("set <id>")
		.description("set the calling session's mode model")
		.action(async (id: string) => {
			const core = await getCore.project();
			await core.callingSession.setModel(id, {
				taskId: process.env.AGENTIC_WORKSPACE_TASK_ID,
				sessionId: process.env.AGENTIC_WORKSPACE_SESSION_ID,
			});
		});
}

async function resolveModeOption(core: Core, value: string): Promise<string> {
	const catalog = await core.getProjectModeCatalog();
	if (!catalog) {
		if (value.toLowerCase() === "build") return "build";
		throw new Error(`Mode '${value}' is not configured for this project.`);
	}
	const exactId = catalog.profiles[value];
	if (exactId) return value;
	const matches = Object.entries(catalog.profiles).filter(
		([, profile]) => profile?.name.toLowerCase() === value.toLowerCase(),
	);
	const match = matches[0];
	if (matches.length === 1 && match) return match[0];
	if (matches.length > 1) throw new Error(`Mode name '${value}' is ambiguous; use a mode ID.`);
	throw new Error(`Unknown mode '${value}'.`);
}
