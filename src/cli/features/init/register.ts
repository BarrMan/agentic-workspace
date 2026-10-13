import * as clack from "@clack/prompts";
import type { Command } from "commander";
import { initializeAgentConfiguration } from "../../../agent-workspace/config.ts";
import { type CompletionInstallResult, installCompletion } from "../../../commands/completion.ts";
import { addHelpSchema, choiceType } from "../../../commands/help-schema.ts";
import { DEFAULT_DIRECTORIES, DEFAULT_FILES } from "../../../constants/index.ts";
import { type IntegrationMode, initializeProject } from "../../../core/init.ts";
import { type AgentInstructionFile, Core, initializeGitRepository, isGitRepository } from "../../../index.ts";
import type { BacklogConfig } from "../../../types/index.ts";
import { type AgentSelectionValue, processAgentSelection } from "../../../utils/agent-selection.ts";
import { normalizeProjectBacklogDirectory } from "../../../utils/backlog-directory.ts";
import { getTaskPrefixError } from "../../../utils/prefix-config.ts";
import { runAdvancedConfigWizard } from "../config/advanced-wizard.ts";
import {
	applyInitAdvancedOptionOverrides,
	getInitAdvancedConfigDefaults,
	type InitCommandOptions,
	isNonInteractiveInit,
	normalizeInitIntegrationOption,
} from "./options.ts";
import { configureInitMcpClients, INIT_MCP_SERVER_NAME } from "./provider.ts";

const MCP_GUIDE_URL = "https://github.com/BarrMan/agentic-workspace#-mcp-integration-model-context-protocol";

export interface InitCommandDependencies {
	requireRuntimeCwd: () => Promise<string>;
	hasInteractiveTTY: boolean;
	reportCommandFailure: (summary: string, error: unknown) => void;
}

interface StorageSelection {
	backlogDirectory?: string;
	backlogDirectorySource?: "backlog" | ".backlog" | "custom";
	configLocation?: "folder" | "root";
}

interface IntegrationSelection {
	mode: IntegrationMode;
	agentFiles: AgentInstructionFile[];
	agentInstructionsSkipped: boolean;
	mcpClientSetupSummary?: string;
}

interface AdvancedSelection {
	config: Partial<BacklogConfig>;
	configured: boolean;
	installShellCompletions: boolean;
	completionResult: CompletionInstallResult | null;
	completionError: string | null;
}

export function registerInitCommand(program: Command, dependencies: InitCommandDependencies): void {
	addHelpSchema(program.command("init [projectName]"), initHelp)
		.description("initialize backlog project in the current directory (or BACKLOG_CWD when set)")
		.option(
			"--agent-instructions <instructions>",
			"comma-separated agent instructions to create. Valid: claude, agents, gemini, copilot, cursor (writes AGENTS.md), none. Use 'none' to skip; when combined with others, 'none' is ignored.",
		)
		.option("--check-branches <boolean>", "check task states across active branches (default: true)")
		.option("--include-remote <boolean>", "include remote branches when checking (default: true)")
		.option("--branch-days <number>", "days to consider branch active (default: 30)")
		.option("--bypass-git-hooks <boolean>", "bypass git hooks when committing (default: false)")
		.option("--zero-padded-ids <number>", "number of digits for zero-padding IDs (0 to disable)")
		.option("--default-editor <editor>", "default editor command")
		.option("--web-port <number>", "default web UI port (default: 6420)")
		.option("--auto-open-browser <boolean>", "auto-open browser for web UI (default: true)")
		.option(
			"--integration-mode <mode>",
			"choose AI integration mode: cli, mcp, or none (default: cli; cli instructions are recommended)",
		)
		.option("--backlog-dir <path>", "backlog folder for init: backlog, .backlog, or a custom project-relative path")
		.option("--config-location <location>", "config location for init: folder or root")
		.option(
			"--task-prefix <prefix>",
			"custom task prefix, letters only (default: task); draft, doc, and decision are reserved",
		)
		.option("--no-git", "initialize without Git integration")
		.option("--defaults", "use default values for all prompts")
		.action((projectName: string | undefined, options: InitCommandOptions) =>
			runInit(projectName, options, dependencies),
		);
}

async function runInit(
	projectName: string | undefined,
	options: InitCommandOptions,
	dependencies: InitCommandDependencies,
): Promise<void> {
	try {
		const cwd = await dependencies.requireRuntimeCwd();
		const filesystemOnly = await selectGitMode(cwd, options, dependencies.hasInteractiveTTY);
		if (filesystemOnly === null) return;
		const core = new Core(cwd);
		const existingConfig = await core.filesystem.loadConfig();
		validateReinitialization(options, existingConfig);
		const nonInteractive = isNonInteractiveInit(options);
		const name = await selectProjectName(projectName, existingConfig, dependencies.hasInteractiveTTY);
		if (!name) return;
		if (!nonInteractive && !dependencies.hasInteractiveTTY) {
			abortInitialization(
				"Initialization needs an interactive terminal for setup choices. Pass --defaults to use default settings.",
			);
			return;
		}
		const storage = await selectStorage(core, options, Boolean(existingConfig), nonInteractive);
		if (!storage) return;
		const taskPrefix = await selectTaskPrefix(options, Boolean(existingConfig), nonInteractive);
		if (taskPrefix === null) return;
		const integration = await selectIntegration(cwd, options, nonInteractive);
		if (!integration) return;
		const advanced = await selectAdvancedConfig(options, existingConfig, nonInteractive, filesystemOnly);
		if (!advanced) return;
		const result = await initializeProject(core, {
			projectName: name,
			...storage,
			integrationMode: integration.mode,
			mcpClients: [],
			agentInstructions: integration.agentFiles,
			advancedConfig: { ...advanced.config, taskPrefix: taskPrefix || undefined },
			existingConfig,
			filesystemOnly,
		});
		await initializeAgentConfiguration(core, "project");
		showInitializationSummary(result.config, core, storage, integration, advanced);
		showInitializationResults(result, name, integration, advanced);
		await warnWhenRemoteIsMissing(core, result.config);
	} catch (error) {
		dependencies.reportCommandFailure("Failed to initialize project", error);
	}
}

async function selectGitMode(cwd: string, options: InitCommandOptions, interactive: boolean): Promise<boolean | null> {
	let filesystemOnly = options.git === false;
	if ((await isGitRepository(cwd)) || filesystemOnly) return filesystemOnly;
	if (!interactive)
		return abortInitialization(
			"No Git repository found and no interactive terminal is available. Run `git init` first, pass --no-git, or rerun in an interactive terminal to choose.",
		);
	const mode = await clack.select({
		message: "No git repository found. How should AgenticWorkspace initialize this project?",
		initialValue: "git",
		options: [
			{ label: "Initialize a Git repository", value: "git", hint: "Use the standard Git-backed workflow" },
			{ label: "Continue without Git", value: "filesystem", hint: "Use local Markdown files only" },
		],
	});
	if (clack.isCancel(mode)) return abortInitialization();
	if (mode === "git") await initializeGitRepository(cwd);
	else filesystemOnly = true;
	return filesystemOnly;
}

function validateReinitialization(options: InitCommandOptions, existingConfig: BacklogConfig | null): void {
	if (!existingConfig) return;
	console.log("Existing backlog project detected. Current configuration will be preserved where not specified.");
	if (options.backlogDir)
		failInitialization(
			"The backlog directory is fixed after initialization. Re-run init without --backlog-dir for this project.",
		);
	if (options.configLocation)
		failInitialization(
			"The config location is fixed after initialization. Re-run init without --config-location for this project.",
		);
}

async function selectProjectName(
	projectName: string | undefined,
	config: BacklogConfig | null,
	interactive: boolean,
): Promise<string | null> {
	if (projectName) return projectName;
	if (!interactive)
		return abortInitialization(
			'Project name is required when no interactive terminal is available. Supply it with `agenticworkspace init "My Project" --defaults`.',
		);
	const defaultName = config?.projectName || "";
	const name = await clack.text({
		message: config && defaultName ? `Project name (${defaultName}):` : "Project name:",
		defaultValue: config && defaultName ? defaultName : undefined,
		validate: (value) => (!config && !String(value ?? "").trim() ? "Project name is required." : undefined),
	});
	if (clack.isCancel(name)) return abortInitialization();
	return String(name ?? "").trim() || defaultName || abortInitialization();
}

async function selectStorage(
	core: Core,
	options: InitCommandOptions,
	reinitializing: boolean,
	nonInteractive: boolean,
): Promise<StorageSelection | null> {
	if (reinitializing) return {};
	const resolved = core.filesystem.resolveBacklogDirectoryInfo();
	const defaultDirectory = resolved.backlogDir ?? DEFAULT_DIRECTORIES.BACKLOG;
	const defaultSource = resolved.source ?? "backlog";
	const defaultConfigLocation = resolved.configSource ?? "folder";
	const configuredDirectory = options.backlogDir ? normalizeProjectBacklogDirectory(options.backlogDir) : undefined;
	const configuredLocation = options.configLocation?.trim().toLowerCase();
	if (options.backlogDir && !configuredDirectory)
		failInitialization(
			"Invalid --backlog-dir value. Use 'backlog', '.backlog', or a project-relative path inside the project.",
		);
	if (configuredLocation && configuredLocation !== "folder" && configuredLocation !== "root")
		failInitialization("Invalid --config-location value. Use 'folder' or 'root'.");
	if (nonInteractive)
		return selectNonInteractiveStorage(
			configuredDirectory ?? undefined,
			configuredLocation,
			defaultDirectory,
			defaultSource,
			defaultConfigLocation,
		);
	return promptForStorage(defaultDirectory, defaultSource, defaultConfigLocation, resolved.rootConfigPath);
}

function selectNonInteractiveStorage(
	directory: string | undefined,
	location: string | undefined,
	defaultDirectory: string,
	defaultSource: "backlog" | ".backlog" | "custom",
	defaultLocation: "folder" | "root",
): StorageSelection {
	const source = directory
		? directory === DEFAULT_DIRECTORIES.BACKLOG || directory === DEFAULT_DIRECTORIES.HIDDEN_BACKLOG
			? (directory as "backlog" | ".backlog")
			: "custom"
		: defaultSource;
	const configLocation =
		(location as "folder" | "root" | undefined) ?? (source === "custom" ? "root" : defaultLocation);
	if (source === "custom" && configLocation !== "root")
		failInitialization("Custom backlog directories require --config-location root.");
	return { backlogDirectory: directory ?? defaultDirectory, backlogDirectorySource: source, configLocation };
}

async function promptForStorage(
	defaultDirectory: string,
	defaultSource: "backlog" | ".backlog" | "custom",
	defaultLocation: "folder" | "root",
	rootConfigPath: string,
): Promise<StorageSelection | null> {
	const source = await clack.select({
		message: "Where should AgenticWorkspace store project files?",
		initialValue: defaultSource,
		options: [
			{ label: "backlog/ (default)", value: "backlog", hint: "Store tasks and config in backlog/" },
			{ label: ".backlog/", value: ".backlog", hint: "Store tasks and config in .backlog/" },
			{
				label: "Custom project-relative path",
				value: "custom",
				hint: `AgenticWorkspace will store project config in ${rootConfigPath}`,
			},
		],
	});
	if (clack.isCancel(source)) return abortInitialization();
	if (source !== "custom") {
		const configLocation = await clack.select({
			message: "Where should AgenticWorkspace store project configuration?",
			initialValue: defaultLocation,
			options: [
				{ label: `${source}/config.yml`, value: "folder", hint: "Keep config inside the backlog folder" },
				{
					label: "backlog.config.yml in project root",
					value: "root",
					hint: "Keep config at project root and point to the backlog folder there",
				},
			],
		});
		return clack.isCancel(configLocation)
			? abortInitialization()
			: {
					backlogDirectory: source,
					backlogDirectorySource: source,
					configLocation: configLocation as "folder" | "root",
				};
	}
	const directory = await clack.text({
		message: "Project-relative backlog directory:",
		defaultValue: defaultSource === "custom" ? defaultDirectory : "",
		validate: (value) =>
			normalizeProjectBacklogDirectory(String(value ?? ""))
				? undefined
				: "Enter a project-relative path inside the current project.",
	});
	if (clack.isCancel(directory)) return abortInitialization();
	return {
		backlogDirectory: normalizeProjectBacklogDirectory(String(directory ?? "")) ?? undefined,
		backlogDirectorySource: "custom",
		configLocation: "root",
	};
}

async function selectTaskPrefix(
	options: InitCommandOptions,
	reinitializing: boolean,
	nonInteractive: boolean,
): Promise<string | null> {
	let prefix = options.taskPrefix;
	if (!prefix && !nonInteractive && !reinitializing) {
		const response = await clack.text({
			message: "Task prefix (default: task):",
			validate: (value) => getTaskPrefixError(String(value ?? "").trim()),
		});
		if (clack.isCancel(response)) return abortInitialization();
		prefix = String(response ?? "").trim();
	}
	const error = getTaskPrefixError(prefix ?? "");
	if (error) failInitialization(error);
	return prefix ?? "";
}

async function selectIntegration(
	cwd: string,
	options: InitCommandOptions,
	nonInteractive: boolean,
): Promise<IntegrationSelection | null> {
	let mode = resolveInitialIntegrationMode(options, nonInteractive);
	let tipShown = false;
	while (true) {
		const selectedMode = mode ?? (await promptForIntegrationMode(tipShown));
		if (!selectedMode) return cancelInitialization();
		tipShown ||= mode === null;
		if (mode === null) console.log("");
		const selection = await selectIntegrationMode(cwd, options, nonInteractive, selectedMode);
		if (selection) return selection;
		mode = null;
		console.log("");
	}
}

async function promptForIntegrationMode(tipShown: boolean): Promise<IntegrationMode | null> {
	if (!tipShown) clack.note("CLI instructions are recommended for AI tool integration.", "AI setup tip");
	const response = await clack.select({
		message: "How would you like your AI tools to connect to AgenticWorkspace?",
		initialValue: "cli",
		options: [
			{ label: "via CLI instructions (recommended)", value: "cli" },
			{ label: "via MCP connector (optional for Claude Code, Codex, Gemini CLI, Kiro, Cursor, etc.)", value: "mcp" },
			{ label: "Skip for now (I am not using AgenticWorkspace with AI tools)", value: "none" },
		],
	});
	return clack.isCancel(response) ? null : (normalizeInitIntegrationOption(String(response)) ?? "mcp");
}

async function selectIntegrationMode(
	cwd: string,
	options: InitCommandOptions,
	nonInteractive: boolean,
	mode: IntegrationMode,
): Promise<IntegrationSelection | null> {
	if (mode === "none") return { mode, agentFiles: [], agentInstructionsSkipped: false };
	if (mode === "cli") {
		const selection = await selectCliInstructions(options.agentInstructions, nonInteractive);
		return selection ? { mode, ...selection } : null;
	}
	if (nonInteractive)
		return {
			mode,
			agentFiles: [],
			agentInstructionsSkipped: false,
			mcpClientSetupSummary: "skipped (non-interactive)",
		};
	const summary = await configureInitMcpClients(cwd, MCP_GUIDE_URL);
	return summary === null
		? null
		: { mode, agentFiles: [], agentInstructionsSkipped: false, mcpClientSetupSummary: summary };
}

function resolveInitialIntegrationMode(options: InitCommandOptions, nonInteractive: boolean): IntegrationMode | null {
	const specified = options.integrationMode ? normalizeInitIntegrationOption(options.integrationMode) : undefined;
	if (options.integrationMode && !specified)
		failInitialization(`Invalid integration mode: ${options.integrationMode}. Valid options are: mcp, cli, none`);
	const mode = specified ?? (nonInteractive ? "cli" : null);
	if (mode === "mcp" && options.agentInstructions)
		failInitialization("The MCP connector option cannot be combined with --agent-instructions.");
	if (mode === "none" && options.agentInstructions)
		failInitialization("Skipping AI integration cannot be combined with --agent-instructions.");
	return mode;
}

async function selectCliInstructions(
	requested: string | undefined,
	nonInteractive: boolean,
): Promise<Pick<IntegrationSelection, "agentFiles" | "agentInstructionsSkipped"> | null> {
	if (requested) return parseAgentInstructions(requested);
	if (nonInteractive) return { agentFiles: ["AGENTS.md"], agentInstructionsSkipped: false };
	while (true) {
		const response = await clack.multiselect({
			message: "Select instruction files for CLI-based AI tools (space toggles selections; enter accepts)",
			options: [
				{ label: "CLAUDE.md — Claude Code", value: "CLAUDE.md" },
				{ label: "AGENTS.md — Codex, Cursor, Zed, Warp, Aider, RooCode, etc.", value: "AGENTS.md" },
				{ label: "GEMINI.md — Google Gemini Code Assist CLI", value: "GEMINI.md" },
				{ label: "Copilot instructions — GitHub Copilot", value: ".github/copilot-instructions.md" },
			],
			required: false,
		});
		if (clack.isCancel(response)) return null;
		const result = processAgentSelection({
			selected: Array.isArray(response) ? (response as AgentSelectionValue[]) : [],
		});
		if (!result.needsRetry) return { agentFiles: result.files, agentInstructionsSkipped: result.skipped };
		console.log("Please select at least one agent instruction file before continuing.");
	}
}

function parseAgentInstructions(
	requested: string,
): Pick<IntegrationSelection, "agentFiles" | "agentInstructionsSkipped"> {
	const names: Record<string, AgentSelectionValue> = {
		cursor: "AGENTS.md",
		claude: "CLAUDE.md",
		agents: "AGENTS.md",
		gemini: "GEMINI.md",
		copilot: ".github/copilot-instructions.md",
		none: "none",
		"claude.md": "CLAUDE.md",
		"agents.md": "AGENTS.md",
		"gemini.md": "GEMINI.md",
		".github/copilot-instructions.md": ".github/copilot-instructions.md",
	};
	const selected = requested.split(",").map((value) => {
		const file = names[value.trim().toLowerCase()];
		if (!file)
			failInitialization(
				`Invalid agent instruction: ${value.trim()}\nValid options are: cursor, claude, agents, gemini, copilot, none`,
			);
		return file;
	});
	const result = processAgentSelection({ selected });
	if (result.needsRetry) failInitialization("Please select at least one agent instruction file before continuing.");
	return { agentFiles: result.files, agentInstructionsSkipped: result.skipped };
}

async function selectAdvancedConfig(
	options: InitCommandOptions,
	existingConfig: BacklogConfig | null,
	nonInteractive: boolean,
	filesystemOnly: boolean,
): Promise<AdvancedSelection | null> {
	const defaults = getInitAdvancedConfigDefaults(existingConfig);
	let selection: AdvancedSelection = {
		config: defaults,
		configured: false,
		installShellCompletions: false,
		completionResult: null,
		completionError: null,
	};
	if (nonInteractive)
		selection = {
			...selection,
			config: applyInitAdvancedOptionOverrides(
				options,
				defaults,
				existingConfig?.defaultEditor || process.env.EDITOR || process.env.VISUAL,
			),
		};
	else {
		const prompted = await promptForAdvancedConfig(existingConfig, defaults);
		if (!prompted) return null;
		selection = prompted;
	}
	if (!filesystemOnly) return selection;
	return {
		...selection,
		config: {
			...selection.config,
			checkActiveBranches: false,
			remoteOperations: false,
			bypassGitHooks: false,
		},
	};
}

async function promptForAdvancedConfig(
	existingConfig: BacklogConfig | null,
	defaults: Partial<BacklogConfig>,
): Promise<AdvancedSelection | null> {
	const response = await clack.confirm({
		message: "Configure advanced settings now? (Runs the advanced AgenticWorkspace config wizard)",
		initialValue: false,
	});
	if (clack.isCancel(response)) return abortInitialization();
	if (!response)
		return {
			config: defaults,
			configured: false,
			installShellCompletions: false,
			completionResult: null,
			completionError: null,
		};
	const wizard = await runAdvancedConfigWizard({
		existingConfig,
		cancelMessage: "Aborting initialization.",
	});
	let completionResult: CompletionInstallResult | null = null;
	let completionError: string | null = null;
	if (wizard.installShellCompletions)
		try {
			completionResult = await installCompletion();
		} catch (error) {
			completionError = error instanceof Error ? error.message : String(error);
		}
	return {
		config: { ...defaults, ...wizard.config },
		configured: true,
		installShellCompletions: wizard.installShellCompletions,
		completionResult,
		completionError,
	};
}

function showInitializationSummary(
	config: BacklogConfig,
	core: Core,
	storage: StorageSelection,
	integration: IntegrationSelection,
	advanced: AdvancedSelection,
): void {
	const color = createColorizer();
	const lines = [
		`${color.label("Project Name:")} ${color.bold(config.projectName)}`,
		`${color.label("Backlog directory:")} ${storage.backlogDirectory ?? core.filesystem.backlogDirName}`,
		`${color.label("Config location:")} ${storage.configLocation === "root" ? DEFAULT_FILES.ROOT_CONFIG : "folder config.yml"}`,
		`${color.label("Git integration:")} ${config.filesystemOnly ? color.muted("disabled (filesystem-only)") : color.good("enabled")}`,
	];
	addIntegrationSummary(lines, color, integration);
	lines.push(
		`${color.label("Shell completions:")} ${advanced.completionResult ? `${color.good("installed")} to ${advanced.completionResult.installPath}` : advanced.installShellCompletions ? `${color.bad("installation failed")} (${color.muted("see warning below")})` : advanced.configured ? color.muted("skipped") : color.muted("not configured")}`,
	);
	if (advanced.configured || config.filesystemOnly) addAdvancedSummary(lines, color, config);
	else
		lines.push(
			`${color.label("Advanced settings:")} ${color.muted("unchanged (run `agenticworkspace config` to customize)")}`,
		);
	clack.note(lines.join("\n"), "Initialization Summary");
}

function addIntegrationSummary(
	lines: string[],
	color: ReturnType<typeof createColorizer>,
	integration: IntegrationSelection,
): void {
	if (integration.mode === "cli") {
		lines.push(`${color.label("AI Integration:")} ${color.good("CLI instructions")}`);
		lines.push(
			`${color.label("Agent instructions:")} ${integration.agentFiles.length ? integration.agentFiles.join(", ") : integration.agentInstructionsSkipped ? color.muted("skipped") : color.muted("none")}`,
		);
	} else if (integration.mode === "mcp") {
		lines.push(
			`${color.label("AI Integration:")} ${color.good("MCP connector")}`,
			`${color.label("Agent instruction files:")} ${color.muted("guidance is provided through the MCP connector.")}`,
			`${color.label("MCP server name:")} ${INIT_MCP_SERVER_NAME}`,
			`${color.label("MCP client setup:")} ${integration.mcpClientSetupSummary ?? color.muted("skipped")}`,
		);
	} else
		lines.push(
			`${color.label("AI integration:")} ${color.muted("skipped (configure later via `agenticworkspace init`)")}`,
		);
}

function addAdvancedSummary(lines: string[], color: ReturnType<typeof createColorizer>, config: BacklogConfig): void {
	const bool = (value: boolean) => (value ? color.good("true") : color.bad("false"));
	lines.push(
		color.label("Advanced settings:"),
		`  ${color.label("Check active branches:")} ${bool(Boolean(config.checkActiveBranches))}`,
		`  ${color.label("Remote operations:")} ${bool(Boolean(config.remoteOperations))}`,
		`  ${color.label("Active branch days:")} ${String(config.activeBranchDays)}`,
		`  ${color.label("Bypass git hooks:")} ${bool(Boolean(config.bypassGitHooks))}`,
		`  ${color.label("Zero-padded IDs:")} ${config.zeroPaddedIds ? `${String(config.zeroPaddedIds)} digits` : color.muted("disabled")}`,
		`  ${color.label("Web UI port:")} ${String(config.defaultPort)}`,
		`  ${color.label("Auto open browser:")} ${bool(Boolean(config.autoOpenBrowser))}`,
	);
	if (config.defaultEditor) lines.push(`  ${color.label("Default editor:")} ${config.defaultEditor}`);
}

function showInitializationResults(
	result: Awaited<ReturnType<typeof initializeProject>>,
	name: string,
	integration: IntegrationSelection,
	advanced: AdvancedSelection,
): void {
	if (advanced.completionResult)
		clack.note(
			`${advanced.completionResult.instructions.trim()}`,
			`Shell completions installed (${advanced.completionResult.shell})`,
		);
	else if (advanced.completionError)
		console.warn(
			`⚠️  Shell completion installation failed:\n${advanced.completionError
				.split("\n")
				.map((line) => `  ${line}`)
				.join("\n")}\n  Run \`backlog completion install\` later to retry.\n`,
		);
	clack.outro(
		`${result.isReInitialization ? "Updated" : "Initialized"} backlog project${result.isReInitialization ? " configuration" : ""}: ${name}`,
	);
	if (integration.mode !== "cli") return;
	if (result.mcpResults?.agentFiles) clack.log.info(result.mcpResults.agentFiles);
	else if (integration.agentInstructionsSkipped) clack.log.info("Skipping agent instruction files per selection.");
}

async function warnWhenRemoteIsMissing(core: Core, config: BacklogConfig): Promise<void> {
	try {
		if (config.remoteOperations && !(await core.git.hasAnyRemote()))
			console.warn(
				"Warning: remoteOperations is enabled but no git remotes are configured. Remote features will be skipped until a remote is added (e.g., 'git remote add origin <url>') or disable remoteOperations via 'agenticworkspace config set remoteOperations false'.",
			);
	} catch {
		/* Advisory only. */
	}
}

function createColorizer() {
	const enabled = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
	const color = (code: string, value: string) => (enabled ? `\u001B[${code}m${value}\u001B[0m` : value);
	return {
		label: (value: string) => color("1;36", value),
		good: (value: string) => color("32", value),
		bad: (value: string) => color("31", value),
		muted: (value: string) => color("2", value),
		bold: (value: string) => color("1", value),
	};
}

function abortInitialization(message = "Aborting initialization."): null {
	clack.cancel(message);
	process.exitCode = 1;
	return null;
}
function cancelInitialization(): null {
	clack.cancel("Initialization cancelled.");
	return null;
}
function failInitialization(message: string): never {
	console.error(message);
	throw Object.assign(new Error("CLI requested exit"), { exitCode: 1 });
}

const initHelp = {
	required: [],
	optional: [
		{ name: "projectName", type: "String", description: "Project name; prompted when omitted" },
		{
			name: "--integration-mode",
			type: `${choiceType(["cli", "mcp", "none"])} (default: cli)`,
			description: "AI integration mode; CLI instructions are recommended",
		},
		{
			name: "--agent-instructions",
			type: choiceType(["claude", "agents", "gemini", "copilot", "cursor", "none"], { multiple: true }),
			description: "Instruction files to create; cursor writes AGENTS.md; comma-separated",
		},
		{ name: "--backlog-dir", type: "Project-relative path", description: "backlog, .backlog, or custom path" },
		{
			name: "--task-prefix",
			type: "String (letters only; default: task)",
			description: "Task ID prefix; draft, doc, and decision are reserved",
		},
		{ name: "--no-git", type: "Boolean", description: "Initialize without Git integration" },
	],
	writes: "Backlog directory, config file, and optional agent instruction files",
	output: "Initialization summary with selected integration and config; defaults to CLI instructions",
	examples: [
		'agenticworkspace init "My Project" --defaults',
		'agenticworkspace init "My Project" --defaults --integration-mode cli',
		'agenticworkspace init "My Project" --defaults --agent-instructions agents,claude',
	],
};
