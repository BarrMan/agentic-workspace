import type { Command } from "commander";
import { withExplicitModel } from "../agent-workspace/agents/profile.ts";
import {
	initializeAgentConfiguration,
	loadAgentConfiguration,
	requireProjectModeCatalog,
	resolveAgentConfiguration,
	updateAgentConfiguration,
} from "../agent-workspace/config.ts";
import { resolveCallingMode, resolveCurrentModel } from "../agent-workspace/mode-model.ts";
import { AgentSessionService } from "../agent-workspace/sessions.ts";
import {
	AGENT_BOOTSTRAP_TYPES,
	type AgentConfigScope,
	type AgentConfiguration,
	type AgentPreset,
	resolveSessionSettings,
	type SessionSettings,
} from "../agent-workspace/types.ts";
import type { Core } from "../core/backlog.ts";
import { OpenTuiWorkspaceController } from "../ui/opentui/workspace-controller.ts";
import { addHelpSchema, choiceType } from "./help-schema.ts";

const SCOPES = ["root", "project", "card"] as const;
const BOOTSTRAPS = AGENT_BOOTSTRAP_TYPES;

function parseScope(value: string): AgentConfigScope {
	if ((SCOPES as readonly string[]).includes(value)) return value as AgentConfigScope;
	throw new Error(`Invalid configuration scope: ${value}. Valid scopes: ${SCOPES.join(", ")}`);
}

function parseEnv(values: string[] = []): Record<string, string> {
	const entries = values.map((value) => {
		const separator = value.indexOf("=");
		if (separator <= 0) throw new Error(`Invalid environment value: ${value}. Use NAME=value.`);
		return [value.slice(0, separator), value.slice(separator + 1)] as const;
	});
	return Object.fromEntries(entries);
}

function parseBoolean(value: string, flag = "--flag"): boolean {
	if (value === "true") return true;
	if (value === "false") return false;
	throw new Error(`${flag} must be true or false.`);
}

function print(value: unknown): void {
	process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function taskIdForScope(scope: AgentConfigScope, taskId: string | undefined): string | undefined {
	if (scope === "card" && !taskId) throw new Error("--task is required for card configuration.");
	return taskId;
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

type PresetOptions = {
	preset?: string;
	command?: string;
	env?: string[];
	clearEnv?: boolean;
	prepare?: string;
	bootstrap?: string;
	resumeFlag?: string;
	worktreePerTask?: string;
	yolo?: string;
	autoResumeOnRestart?: string;
};

function applyPresetOptions(
	configuration: AgentConfiguration,
	presetName: string,
	options: PresetOptions,
): AgentConfiguration {
	if (options.clearEnv && options.env?.length) throw new Error("Cannot combine --env with --clear-env.");
	const current = configuration.presets[presetName];
	if (!current) throw new Error(`Agent preset not found: ${presetName}.`);
	if (options.bootstrap && !(BOOTSTRAPS as readonly string[]).includes(options.bootstrap)) {
		throw new Error(`Invalid bootstrap: ${options.bootstrap}. Valid values: ${BOOTSTRAPS.join(", ")}`);
	}
	const preset: AgentPreset = {
		...current,
		...(options.command !== undefined && { command: options.command }),
		...(options.env && { env: parseEnv(options.env) }),
		...(options.clearEnv && { env: {} }),
		...(options.prepare !== undefined && { prepare: options.prepare }),
		...(options.bootstrap && { bootstrap: options.bootstrap as AgentPreset["bootstrap"] }),
		...(options.resumeFlag !== undefined && { resumeFlag: options.resumeFlag }),
	};
	return {
		...configuration,
		selectedPreset: presetName,
		presets: { ...configuration.presets, [presetName]: preset },
		...applySessionOptions(configuration, options),
	};
}

/** Session-wide settings, written only when at least one session flag is provided. */
function applySessionOptions(
	configuration: AgentConfiguration,
	options: PresetOptions,
): { sessions: SessionSettings } | Record<string, never> {
	const worktreePerTask =
		options.worktreePerTask !== undefined ? parseBoolean(options.worktreePerTask, "--worktree-per-task") : undefined;
	const yoloMode = options.yolo !== undefined ? parseBoolean(options.yolo, "--yolo") : undefined;
	const autoResumeOnRestart =
		options.autoResumeOnRestart !== undefined
			? parseBoolean(options.autoResumeOnRestart, "--auto-resume-on-restart")
			: undefined;
	if (worktreePerTask === undefined && yoloMode === undefined && autoResumeOnRestart === undefined) return {};
	return {
		sessions: {
			...resolveSessionSettings(configuration),
			...(worktreePerTask !== undefined && { worktreePerTask }),
			...(yoloMode !== undefined && { yoloMode }),
			...(autoResumeOnRestart !== undefined && { autoResumeOnRestart }),
		},
	};
}

type CoreFactory = {
	project(): Promise<Core>;
	root(): Promise<Core>;
};

export function registerAgentWorkspaceCommands(program: Command, getCore: CoreFactory): void {
	const coreForScope = (scope: AgentConfigScope) => (scope === "root" ? getCore.root() : getCore.project());
	addHelpSchema(program.command("workspace"), {
		reads: "Agent session state and configuration",
		output: "OpenTUI task workspace",
		examples: ["agenticworkspace workspace"],
	})
		.description("open the OpenTUI task-centered agent workspace")
		.action(async () => {
			if (!process.stdin.isTTY || !process.stdout.isTTY)
				throw new Error("workspace requires both stdin and stdout to be TTYs.");
			await new OpenTuiWorkspaceController(await getCore.project()).run();
		});

	const sessions = addHelpSchema(program.command("agent-session"), {
		reads: "Task session state and saved output",
		optional: [{ name: "--help", type: "Boolean", description: "Show lifecycle command help" }],
		output: "Session records as JSON; output prints persisted session output; attach connects to the session terminal",
		examples: [
			"agenticworkspace agent-session list BACK-123 --mode plan",
			"agenticworkspace agent-session start BACK-123 --preset opencode",
		],
	})
		.description("manage task agent sessions")
		.showHelpAfterError();

	sessions
		.command("list <taskId>")
		.description("list current and prior sessions for a task")
		.option("--mode <id-or-name>", "mode ID or configured name (defaults to selected/default mode)")
		.action(async (taskId, options) => {
			const core = await getCore.project();
			const requestedModeId = options.mode ? await resolveModeOption(core, options.mode) : undefined;
			print(await new AgentSessionService(core).list(taskId, requestedModeId));
		});
	sessions
		.command("start <taskId>")
		.description("start a persistent task session")
		.option("--mode <id-or-name>", "mode ID or configured name (defaults to calling or selected/default mode)")
		.option("--preset <name>", "configured preset name")
		.option("--json", "print the session record as JSON")
		.action(async (taskId, options) => {
			const core = await getCore.project();
			const modeId = options.mode ? await resolveModeOption(core, options.mode) : undefined;
			const record = await new AgentSessionService(core).start(taskId, {
				preset: options.preset,
				modeId,
			});
			if (options.json) {
				print(record);
				return;
			}
			if (record.nativeWorkspace) {
				process.stdout.write(
					`Registered session ${record.id} for the owning workspace to launch (preset: ${record.preset}).\n`,
				);
				return;
			}
			process.stdout.write(`Started session ${record.id} (preset: ${record.preset}).\n`);
		});
	sessions
		.command("stop <taskId>")
		.description("stop the active or selected session")
		.option("--session <sessionId>", "session ID")
		.action(async (taskId, options) => {
			await new AgentSessionService(await getCore.project()).stop(taskId, options.session);
		});
	sessions
		.command("attach <taskId>")
		.description("attach this terminal to a session")
		.option("--session <sessionId>", "session ID")
		.action(async (taskId, options) => {
			await new AgentSessionService(await getCore.project()).attach(taskId, options.session);
		});
	sessions
		.command("output <taskId>")
		.description("print persisted session output")
		.option("--session <sessionId>", "session ID")
		.action(async (taskId, options) => {
			console.log(await new AgentSessionService(await getCore.project()).output(taskId, options.session));
		});
	sessions
		.command("ask <taskId> <question>")
		.description("ask the previous handed-off session a question and print its answer")
		.option("--session <sessionId>", "ask a specific session instead of the previous one")
		.option("--mode <id-or-name>", "mode ID or configured name (defaults to calling or selected/default mode)")
		.action(async (taskId, question, options) => {
			const core = await getCore.project();
			const modeId = options.mode ? await resolveModeOption(core, options.mode) : undefined;
			const result = await new AgentSessionService(core).ask(taskId, question, {
				sessionId: options.session,
				modeId,
			});
			process.stdout.write(`${result.answer}\n`);
			if (result.timedOut)
				process.stderr.write(
					"warning: the session did not finish within the ask timeout; the answer above may be incomplete.\n",
				);
		});
	sessions
		.command("handoff <taskId>")
		.description("stop the active session and start a new one; the new session becomes active")
		.option("--mode <id-or-name>", "mode ID or configured name (defaults to calling or selected/default mode)")
		.action(async (taskId, options) => {
			const core = await getCore.project();
			const modeId = options.mode ? await resolveModeOption(core, options.mode) : undefined;
			const record = await new AgentSessionService(core).start(taskId, {
				replace: true,
				modeId,
			});
			process.stdout.write(`Replaced the active session with ${record.id} (preset: ${record.preset}).\n`);
		});
	sessions
		.command("reconcile <taskId>")
		.description("probe tmux panes and settle dead sessions and stalled handoffs for a task")
		.action(async (taskId) => {
			await new AgentSessionService(await getCore.project()).reconcileTaskSessions(taskId);
		});
	sessions
		.command("reset <taskId>")
		.description("reset persisted task session state")
		.action(async (taskId) => {
			await new AgentSessionService(await getCore.project()).reset(taskId);
		});
	sessions
		.command("delete <taskId>")
		.description("delete a session record and its saved files")
		.requiredOption("--session <sessionId>", "session ID")
		.option("--force", "stop a running session before deleting it")
		.action(async (taskId, options) => {
			await new AgentSessionService(await getCore.project()).delete(taskId, options.session, { force: options.force });
		});

	const config = addHelpSchema(program.command("agent-config"), {
		reads: "Scoped agent workspace configuration",
		writes: "Scoped agent configuration, including project mode models",
		optional: [
			{ name: "--task", type: "Task ID", description: "Required for card scope" },
			{ name: "--preset", type: "String", description: "Selected preset name" },
			{ name: "--command", type: "String", description: "Agent command" },
			{ name: "--env", type: "NAME=value", description: "Replace selected preset environment; repeatable" },
			{ name: "--clear-env", type: "Boolean", description: "Clear selected preset environment" },
			{ name: "--prepare", type: "String", description: "Preparation command" },
			{ name: "--bootstrap", type: choiceType(BOOTSTRAPS), description: "How the initial prompt is delivered" },
			{ name: "--resume-flag", type: "String", description: "Exact native resume flag" },
			{ name: "--worktree-per-task", type: "true|false", description: "Session-wide worktree per task" },
			{ name: "--yolo", type: "true|false", description: "Session-wide agent auto-approval" },
			{ name: "--auto-resume-on-restart", type: "true|false", description: "Resume eligible sessions after restart" },
		],
		output: "Resolved or scoped configuration as JSON",
		examples: [
			"agenticworkspace agent-config show",
			"agenticworkspace agent-config init project",
			"agenticworkspace agent-config set card --task BACK-123 --preset opencode --worktree-per-task true",
			"agenticworkspace agent-config model set --current --mode plan",
		],
	})
		.description("inspect and selectively edit scoped agent configuration")
		.showHelpAfterError();
	config
		.command("show [scope]")
		.description("show resolved or exact scoped configuration")
		.option("--task <taskId>", "task ID for card scope")
		.action(async (scope, options) => {
			if (!scope)
				return print(
					await resolveAgentConfiguration(await (options.task ? getCore.project() : getCore.root()), options.task),
				);
			const parsed = parseScope(scope);
			print(await loadAgentConfiguration(await coreForScope(parsed), parsed, taskIdForScope(parsed, options.task)));
		});
	config
		.command("init <scope>")
		.description("initialize an empty scope; also seed missing modes in an existing project scope")
		.option("--task <taskId>", "task ID for card scope")
		.action(async (scope, options) => {
			const parsed = parseScope(scope);
			print(
				await initializeAgentConfiguration(await coreForScope(parsed), parsed, taskIdForScope(parsed, options.task)),
			);
		});
	const presetOptions = (command: Command) =>
		command
			.option("--preset <name>", "preset to select or edit")
			.option("--command <command>", "agent command")
			.option("--env <NAME=value>", "replace environment; repeatable", (value, previous: string[] = []) => [
				...previous,
				value,
			])
			.option("--clear-env", "clear environment")
			.option("--prepare <command>", "preparation command")
			.option("--bootstrap <kind>", `one of: ${BOOTSTRAPS.join(", ")}`)
			.option("--resume-flag <flag>", "exact native resume flag")
			.option("--worktree-per-task <true|false>", "create a worktree per task for this scope")
			.option("--yolo <true|false>", "launch agents with their auto-approval flag for this scope")
			.option(
				"--auto-resume-on-restart <true|false>",
				"resume eligible sessions after workspace restart for this scope",
			)
			.option("--task <taskId>", "task ID for card scope");
	presetOptions(config.command("set <scope>").description("select or selectively update one preset")).action(
		async (scope, options: PresetOptions & { task?: string }) => {
			const parsed = parseScope(scope);
			const taskId = taskIdForScope(parsed, options.task);
			const core = await coreForScope(parsed);
			const next = await updateAgentConfiguration(
				core,
				parsed,
				(editable) => applyPresetOptions(editable, options.preset ?? editable.selectedPreset, options),
				taskId,
			);
			print(next);
		},
	);
	const model = config.command("model").description("configure a project's mode model");
	model
		.command("set [modelId]")
		.description("set a mode model explicitly or use the calling OpenCode session's last-used model")
		.option("--current", "use the last model used by the calling OpenCode session")
		.option("--mode <id-or-name>", "target mode ID or configured name")
		.action(async (modelId: string | undefined, options: { current?: boolean; mode?: string }) => {
			if (Boolean(modelId) === Boolean(options.current))
				throw new Error("Provide exactly one of modelId or --current.");
			const core = await getCore.project();
			const caller = options.current ? await resolveCurrentModel(core) : undefined;
			const callingMode = !options.mode && !options.current ? await resolveCallingMode(core) : undefined;
			const targetModeId = options.mode ? await resolveModeOption(core, options.mode) : (caller?.modeId ?? callingMode);
			if (!targetModeId) throw new Error("Could not determine the target mode.");
			const chosenModel = options.current ? caller?.modelId : modelId;
			if (!chosenModel) throw new Error("Could not determine the model ID.");
			let receipt:
				| { mode: string; oldModel: string | null; newModel: string; source: string; appliesTo: string }
				| undefined;
			await updateAgentConfiguration(core, "project", (editable) => {
				const catalog = requireProjectModeCatalog(editable);
				const profile = catalog.profiles[targetModeId];
				if (!profile) throw new Error(`Mode '${targetModeId}' is no longer configured.`);
				const preset = editable.presets[editable.selectedPreset];
				if (!preset) throw new Error("The project selected harness preset is missing.");
				withExplicitModel(preset, chosenModel);
				const prior = profile.model.kind === "explicit" ? profile.model.id : null;
				receipt = {
					mode: targetModeId,
					oldModel: prior,
					newModel: chosenModel,
					source: options.current ? "current-session-last-used" : "explicit",
					appliesTo: "new sessions only",
				};
				return {
					...editable,
					modes: {
						...catalog,
						profiles: {
							...catalog.profiles,
							[targetModeId]: { ...profile, model: { kind: "explicit", id: chosenModel } },
						},
					},
				};
			});
			if (options.current)
				process.stderr.write(
					"Note: OpenCode export reports the last-used model, which may differ from the session's selected UI model.\n",
				);
			print(receipt);
		});
}
