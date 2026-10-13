import type { Command } from "commander";
import { type CompletionInstallResult, installCompletion } from "../../../commands/completion.ts";
import { addHelpSchema, choiceType } from "../../../commands/help-schema.ts";
import { loadInitializedProject } from "../../../commands/project-command.ts";
import { Core } from "../../../core/backlog.ts";
import { getPriorityOptions } from "../../../utils/priority-config.ts";
import { getProjectValues } from "../../../utils/project-config.ts";
import { getTaskTypeValues } from "../../../utils/task-type-config.ts";
import { configureAdvancedSettings } from "./configure-advanced-settings.ts";
import { printConfigValue, setConfigValue } from "./values.ts";

type ProjectLoader = () => Promise<{
	core: Core;
	config: NonNullable<Awaited<ReturnType<Core["filesystem"]["loadConfig"]>>>;
} | null>;
type FailureReporter = (summary: string, error: unknown) => void;

const CONFIG_GET_KEYS = [
	"defaultEditor",
	"projectName",
	"defaultAssignee",
	"defaultStatus",
	"statuses",
	"labels",
	"priorities",
	"types",
	"projects",
	"milestones",
	"dateFormat",
	"maxColumnWidth",
	"defaultPort",
	"autoOpenBrowser",
	"remoteOperations",
	"filesystemOnly",
	"bypassGitHooks",
	"zeroPaddedIds",
	"checkActiveBranches",
	"activeBranchDays",
] as const;
const CONFIG_SET_KEYS = [
	"defaultEditor",
	"projectName",
	"defaultAssignee",
	"defaultStatus",
	"dateFormat",
	"maxColumnWidth",
	"autoOpenBrowser",
	"defaultPort",
	"remoteOperations",
	"filesystemOnly",
	"bypassGitHooks",
	"zeroPaddedIds",
	"checkActiveBranches",
	"activeBranchDays",
] as const;

function configListFields(
	config: NonNullable<Awaited<ReturnType<Core["filesystem"]["loadConfig"]>>>,
	milestones: Array<{ id: string }>,
): string[] {
	return [...configProjectFields(config, milestones), ...configBehaviorFields(config)];
}

function configProjectFields(
	config: NonNullable<Awaited<ReturnType<Core["filesystem"]["loadConfig"]>>>,
	milestones: Array<{ id: string }>,
): string[] {
	return [
		`  projectName: ${config.projectName}`,
		`  defaultEditor: ${config.defaultEditor || "(not set)"}`,
		`  defaultAssignee: [${(config.defaultAssignee ?? []).join(", ")}]`,
		`  defaultStatus: ${config.defaultStatus || "(not set)"}`,
		`  statuses: [${config.statuses.join(", ")}]`,
		`  labels: [${config.labels.join(", ")}]`,
		`  priorities: [${getPriorityOptions(config)
			.map((priority) => priority.label)
			.join(", ")}]`,
		`  types: [${getTaskTypeValues(config).join(", ")}]`,
		`  projects: [${getProjectValues(config).join(", ")}]`,
		`  milestones: [${milestones.map((milestone) => milestone.id).join(", ")}]`,
		`  dateFormat: ${config.dateFormat}`,
		`  maxColumnWidth: ${config.maxColumnWidth || "(not set)"}`,
	];
}

function configBehaviorFields(config: NonNullable<Awaited<ReturnType<Core["filesystem"]["loadConfig"]>>>): string[] {
	return [
		`  autoOpenBrowser: ${config.autoOpenBrowser ?? "(not set)"}`,
		`  hideEmptyColumns: ${config.hideEmptyColumns ?? "(not set)"}`,
		`  defaultPort: ${config.defaultPort ?? "(not set)"}`,
		`  remoteOperations: ${config.remoteOperations ?? "(not set)"}`,
		`  filesystemOnly: ${config.filesystemOnly ?? "false"}`,
		`  bypassGitHooks: ${config.bypassGitHooks ?? "(not set)"}`,
		`  zeroPaddedIds: ${config.zeroPaddedIds ?? "(disabled)"}`,
		`  taskPrefix: ${config.prefixes?.task || "task"} (read-only)`,
		`  checkActiveBranches: ${config.checkActiveBranches ?? "true"}`,
		`  activeBranchDays: ${config.activeBranchDays ?? "30"}`,
	];
}

function printAdvancedConfigSummary(
	mergedConfig: Awaited<ReturnType<typeof configureAdvancedSettings>>["mergedConfig"],
	completionResult: CompletionInstallResult | null,
	completionError: string | null,
): void {
	console.log("\nAdvanced configuration updated.");
	console.log(`  Check active branches: ${mergedConfig.checkActiveBranches ?? true}`);
	console.log(`  Remote operations: ${mergedConfig.remoteOperations ?? true}`);
	console.log(
		`  Zero-padded IDs: ${typeof mergedConfig.zeroPaddedIds === "number" ? `${mergedConfig.zeroPaddedIds} digits` : "disabled"}`,
	);
	console.log(`  Web UI port: ${mergedConfig.defaultPort ?? 6420}`);
	console.log(`  Auto open browser: ${mergedConfig.autoOpenBrowser ?? true}`);
	console.log(`  Bypass git hooks: ${mergedConfig.bypassGitHooks ?? false}`);
	console.log(
		completionResult
			? `  Shell completions: installed to ${completionResult.installPath}`
			: completionError
				? "  Shell completions: installation failed (see warning below)"
				: "  Shell completions: skipped",
	);
	if (mergedConfig.defaultEditor) console.log(`  Default editor: ${mergedConfig.defaultEditor}`);
}

function printCompletionResult(completionResult: CompletionInstallResult | null, completionError: string | null): void {
	if (completionResult) {
		console.log(
			[
				"",
				`Shell completion script installed for ${completionResult.shell}.`,
				`  Path: ${completionResult.installPath}`,
				completionResult.instructions.trim(),
				"",
			].join("\n"),
		);
	} else if (completionError) {
		console.warn(
			`⚠️  Shell completion installation failed:\n${completionError
				.split("\n")
				.map((line) => `  ${line}`)
				.join("\n")}\n  Run \`backlog completion install\` later to retry.\n`,
		);
	}
}

async function runAdvancedConfigCommand(loadCore: () => Promise<Core>, reportFailure: FailureReporter): Promise<void> {
	try {
		const core = await loadCore();
		const existingConfig = await core.filesystem.loadConfig();
		if (!existingConfig) {
			console.error("No AgenticWorkspace project found. Initialize one first with: agenticworkspace init");
			throw Object.assign(new Error("CLI requested exit"), { exitCode: 1 });
		}
		const result = await configureAdvancedSettings(core);
		let completionResult: CompletionInstallResult | null = null;
		let completionError: string | null = null;
		if (result.installShellCompletions) {
			try {
				completionResult = await installCompletion();
			} catch (error) {
				completionError = error instanceof Error ? error.message : String(error);
			}
		}
		printAdvancedConfigSummary(result.mergedConfig, completionResult, completionError);
		printCompletionResult(completionResult, completionError);
		console.log("\nUse `agenticworkspace config list` to review all configuration values.");
	} catch (error) {
		reportFailure("Failed to update configuration", error);
	}
}

async function runConfigListCommand(loadProject: ProjectLoader, reportFailure: FailureReporter): Promise<void> {
	try {
		const project = await loadProject();
		if (!project) return;
		const { core, config } = project;
		const milestones = await core.filesystem.listMilestones();
		console.log(["Configuration:", ...configListFields(config, milestones)].join("\n"));
	} catch (error) {
		reportFailure("Failed to list config values", error);
	}
}

export function registerConfigCommand(
	program: Command,
	runtime: { requireProjectRoot(): Promise<string>; reportFailure: FailureReporter },
): void {
	const project = () => loadInitializedProject(async () => new Core(await runtime.requireProjectRoot()));
	const configCmd = addHelpSchema(program.command("config"), {
		reads: "Project AgenticWorkspace configuration",
		required: [],
		optional: [],
		writes: "Interactive configuration updates when run without a subcommand",
		output: "Interactive wizard results or subcommand output",
		examples: ["agenticworkspace config", "agenticworkspace config list", "agenticworkspace config get defaultEditor"],
	})
		.description("manage AgenticWorkspace configuration")
		.action(async () => {
			const cwd = await runtime.requireProjectRoot();
			await runAdvancedConfigCommand(() => Promise.resolve(new Core(cwd)), runtime.reportFailure);
		});
	addHelpSchema(configCmd.command("get <key>"), {
		reads: "Project AgenticWorkspace configuration",
		required: [{ name: "key", type: choiceType(CONFIG_GET_KEYS), description: "Configuration value to print" }],
		optional: [],
		output: "The selected configuration value",
		examples: ["agenticworkspace config get defaultEditor", "agenticworkspace config get types"],
	})
		.description("get a configuration value")
		.action(async (key: string) => {
			try {
				const loaded = await project();
				if (loaded && !(await printConfigValue(loaded.core, loaded.config, key))) process.exitCode = 1;
			} catch (error) {
				runtime.reportFailure("Failed to get config value", error);
			}
		});
	addHelpSchema(configCmd.command("set <key> <value>"), {
		required: [
			{ name: "key", type: choiceType(CONFIG_SET_KEYS), description: "Configuration value to update" },
			{ name: "value", type: "String", description: "New value; parsed based on key type" },
		],
		optional: [],
		writes: "Updates the project AgenticWorkspace configuration file",
		output: "Confirmation of the updated config value",
		examples: [
			'agenticworkspace config set defaultEditor "code --wait"',
			'agenticworkspace config set defaultAssignee "@alice,@bob"',
		],
	})
		.description("set a configuration value")
		.action(async (key: string, value: string) => {
			try {
				const loaded = await project();
				if (!loaded) return;
				if (!(await setConfigValue(loaded.config, key, value))) {
					process.exitCode = 1;
					return;
				}
				await loaded.core.filesystem.saveConfig(loaded.config);
				console.log(`Set ${key} = ${value}`);
			} catch (error) {
				runtime.reportFailure("Failed to set config value", error);
			}
		});
	addHelpSchema(configCmd.command("list"), {
		reads: "Project AgenticWorkspace configuration",
		required: [],
		optional: [],
		output: "All public configuration values",
		examples: ["agenticworkspace config list"],
	})
		.description("list all configuration values")
		.action(async () => {
			await runConfigListCommand(project, runtime.reportFailure);
		});
}
