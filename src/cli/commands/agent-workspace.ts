import type { Command } from "commander";
import type { Core } from "../../controller/agentic-workspace.ts";
import { resolveCallingMode } from "../../model/session/mode-model.ts";
import { OpenTuiWorkspaceController } from "../../renderer/opentui/workspace-controller.ts";
import { withExplicitModel } from "../../runtime/agents/core/profile.ts";
import { AgentSessionService } from "../../runtime/sessions.ts";
import { loadAgentConfiguration, requireProjectModeCatalog, updateAgentConfiguration } from "../../storage/config.ts";
import { addHelpSchema } from "./help-schema.ts";

export function registerAgentWorkspaceCommands(
	program: Command,
	getCore: { project(): Promise<Core>; root?: () => Promise<Core> },
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
			await new OpenTuiWorkspaceController(await getCore.project()).run();
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
			const record = await new AgentSessionService(core).start(taskId, {
				preset: options.preset,
				modeId: options.mode ? await resolveModeOption(core, options.mode) : undefined,
			});
			process.stdout.write(
				record.nativeWorkspace
					? `Registered session ${record.id} for the owning workspace to launch (preset: ${record.preset}).\n`
					: `Started session ${record.id} (preset: ${record.preset}).\n`,
			);
		});
	sessions
		.command("ask <taskId> <question>")
		.description("ask the previous saved session in the current mode and print its answer")
		.action(async (taskId: string, question: string) => {
			const core = await getCore.project();
			const modeId = await resolveCallingMode(core);
			const result = await new AgentSessionService(core).ask(taskId, question, { modeId });
			process.stdout.write(`${result.answer}\n`);
		});

	const agentConfig = program.command("agent-config").description("set the calling session's mode model");
	agentConfig
		.command("model set <id>")
		.description("set the calling session's mode model")
		.action(async (id: string) => {
			const core = await getCore.project();
			const targetModeId = await resolveCallingMode(core);
			await updateAgentConfiguration(core, "project", (editable) => {
				const catalog = requireProjectModeCatalog(editable);
				const profile = catalog.profiles[targetModeId];
				if (!profile) throw new Error(`Mode '${targetModeId}' is no longer configured.`);
				const preset = editable.presets[editable.selectedPreset];
				if (!preset) throw new Error("The project selected harness preset is missing.");
				withExplicitModel(preset, id);
				return {
					...editable,
					modes: {
						...catalog,
						profiles: {
							...catalog.profiles,
							[targetModeId]: { ...profile, model: { kind: "explicit", id } },
						},
					},
				};
			});
		});
}

async function resolveModeOption(core: Core, value: string): Promise<string> {
	const catalog = (await loadAgentConfiguration(core, "project"))?.modes;
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
