#!/usr/bin/env node

import { Console } from "node:console";
import type { Writable } from "node:stream";
import * as clack from "@clack/prompts";
import { Command } from "commander";
import { loadProjectModeCatalog } from "../agent-workspace/config.ts";
import { registerAgentWorkspaceCommands } from "../commands/agent-workspace.ts";
import { registerCleanupCommand } from "../commands/cleanup.ts";
import { registerCompletionCommand } from "../commands/completion.ts";
import { registerContentCommands } from "../commands/content-commands.ts";
import { addHelpSchema } from "../commands/help-schema.ts";
import { registerInstructionsCommand } from "../commands/instructions.ts";
import { registerMcpCommand } from "../commands/mcp.ts";
import { loadInitializedProject } from "../commands/project-command.ts";
import { registerBoardCommands } from "../commands/project-view-commands.ts";
import { registerSearchCommand } from "../commands/search.ts";
import { registerSkillCommand } from "../commands/skill.ts";
import { findLocalDuplicateTaskIds } from "../core/duplicate-task-detection.ts";
import { isConfigValueError } from "../file-system/operations.ts";
import { type AgentInstructionFile, addAgentInstructions, Core } from "../index.ts";
import { formatDuplicateTaskIdWarning } from "../utils/duplicate-detection.ts";
import type { ReadOutputOptions } from "../utils/read-output-mode.ts";
import { getVersion } from "../utils/version.ts";
import { registerConfigCommand } from "./features/config/register.ts";
import { registerDraftCommands } from "./features/drafts/register.ts";
import { registerInitCommand } from "./features/init/register.ts";
import { registerMilestoneCommands } from "./features/milestones/register.ts";
import {
	type CliReadOutput,
	isPlainRequested as isRuntimePlainRequested,
	resolveListOutput as resolveRuntimeListOutput,
} from "./features/read-output.ts";
import {
	normalizeCliPriority,
	normalizeCliProjects,
	normalizeCliStatusList,
	normalizeCliTaskTypes,
} from "./features/tasks/filter-normalizers.ts";
import {
	formatTaskEditError,
	printMissingRequiredArgument,
	resolveCliMilestoneInput,
	TASK_SORT_FIELD_LIST,
	TASK_SORT_FIELDS,
} from "./features/tasks/policies.ts";
import { registerTaskCommands } from "./features/tasks/register.ts";
import { CliRuntime } from "./runtime.ts";

export async function runCli(
	argv: string[] = process.argv.slice(2),
	options: { cwd?: string; stdout?: Writable; stderr?: Writable } = {},
): Promise<number> {
	// Bun ignores assigning undefined to process.exitCode; restore an unset status as success.
	const previousExitCode = process.exitCode ?? 0;
	process.exitCode = 0;
	const previousCwd = process.cwd();
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;
	const previousConsole = globalThis.console;
	const stdoutWrite = process.stdout.write;
	const stderrWrite = process.stderr.write;
	globalThis.console = new Console({ stdout, stderr }) as typeof globalThis.console;
	if (stdout !== process.stdout)
		process.stdout.write = ((chunk: string | Uint8Array, ...args: unknown[]) =>
			stdout.write(chunk, ...(args as []))) as typeof process.stdout.write;
	if (stderr !== process.stderr)
		process.stderr.write = ((chunk: string | Uint8Array, ...args: unknown[]) =>
			stderr.write(chunk, ...(args as []))) as typeof process.stderr.write;
	if (options.cwd) process.chdir(options.cwd);
	const restoreProcessState = () => {
		process.chdir(previousCwd);
		process.exitCode = previousExitCode;
		globalThis.console = previousConsole;
		process.stdout.write = stdoutWrite;
		process.stderr.write = stderrWrite;
	};
	function reportCommandFailure(summary: string, error: unknown): void {
		if (isConfigValueError(error)) console.error(error.message);
		else console.error(summary, error);
		process.exitCode = 1;
	}

	const runtime = new CliRuntime(options.cwd, stdout);
	const hasInteractiveTTY = runtime.hasInteractiveTTY;
	const readOutput: CliReadOutput = { hasInteractiveTTY, plainFlagInArgv: argv.includes("--plain") };
	const originalBunOptions = process.env.BUN_OPTIONS;
	if (originalBunOptions) delete process.env.BUN_OPTIONS;
	const version = await getVersion();

	async function requireRuntimeCwd(): Promise<string> {
		return runtime.cwd();
	}

	async function requireProjectRoot(): Promise<string> {
		return runtime.projectRoot();
	}

	function isPlainRequested(options?: { plain?: boolean }): boolean {
		return isRuntimePlainRequested(options, readOutput);
	}

	function resolveListOutput(options: ReadOutputOptions, command: Command) {
		return resolveRuntimeListOutput(options, command, readOutput);
	}

	if (process.platform === "win32") {
		const term = process.env.TERM;
		if (!term || /^(xterm|dumb|ansi|vt100)$/i.test(term)) process.env.TERM = "xterm-256color";
	}

	try {
		let rawArgs = [...argv];
		if (rawArgs.length > 0) {
			const first = rawArgs[0];
			if (
				typeof first === "string" &&
				/node_modules[\\/]+agenticworkspace-(darwin|linux|windows)-[^\\/]+[\\/]+agenticworkspace(\.exe)?$/.test(first)
			)
				rawArgs = rawArgs.slice(1);
		}
		const wantsHelp = rawArgs.includes("-h") || rawArgs.includes("--help");
		const wantsVersion = rawArgs.includes("-v") || rawArgs.includes("--version");
		if ((rawArgs.length === 0 || (rawArgs.length === 1 && rawArgs[0] === "--plain")) && !wantsHelp && !wantsVersion) {
			let initialized = false;
			try {
				const root = await runtime.findProjectRoot();
				initialized = Boolean(root && (await new Core(root).filesystem.loadConfig()));
			} catch (error) {
				if (isConfigValueError(error)) {
					console.error(error.message);
					if (originalBunOptions) process.env.BUN_OPTIONS = originalBunOptions;
					restoreProcessState();
					return 1;
				}
			}
			const { printRootEntry } = await import("./root-entry.ts");
			await printRootEntry({ version, initialized, ...(rawArgs.includes("--plain") ? { color: false } : {}) });
			if (originalBunOptions) process.env.BUN_OPTIONS = originalBunOptions;
			restoreProcessState();
			return 0;
		}
	} catch {
		// Fall through to Commander parsing when root entry inspection fails.
	}

	const program = new Command();
	program
		.name("agenticworkspace")
		.description("AgenticWorkspace - Project management CLI")
		.version(version, "-v, --version", "display version number")
		.showSuggestionAfterError()
		.showHelpAfterError("Run with --help to see accepted fields and examples.");
	program.exitOverride();
	program.hook("preAction", async (_program, command) => {
		const opensWorkspace =
			command.name() === "workspace" ||
			(hasInteractiveTTY &&
				(command.name() === "board" || (command.name() === "view" && command.parent?.name() === "board")));
		if (opensWorkspace) await loadProjectModeCatalog(new Core(await requireProjectRoot()));
	});
	registerInitCommand(program, { requireRuntimeCwd, hasInteractiveTTY, reportCommandFailure });
	registerSkillCommand(program);
	registerTaskCommands(program, { runtime, readOutput });
	registerSearchCommand(program, {
		requireProjectRoot,
		resolveListOutput,
		printDuplicateIntegrityWarning: async (core) => {
			const groups = await findLocalDuplicateTaskIds(core);
			if (groups.length === 0) return false;
			console.error(formatDuplicateTaskIdWarning(groups));
			process.exitCode = 1;
			return true;
		},
		normalizeStatusList: normalizeCliStatusList,
		normalizePriority: normalizeCliPriority,
		normalizeTaskTypes: normalizeCliTaskTypes,
		normalizeProjects: normalizeCliProjects,
	});
	const milestoneRuntime = { createCore: async () => new Core(await requireProjectRoot()), resolveListOutput };
	registerDraftCommands(program, {
		requireProjectRoot,
		resolveListOutput,
		isPlainRequested,
		edit: {
			createCore: async () => new Core(await requireProjectRoot()),
			hasInteractiveTTY,
			isPlainRequested,
			printMissingRequiredArgument,
			formatError: formatTaskEditError,
			resolveMilestone: resolveCliMilestoneInput,
		},
		taskSortFields: TASK_SORT_FIELDS,
		taskSortFieldList: TASK_SORT_FIELD_LIST,
	});
	registerMilestoneCommands(program, milestoneRuntime);
	registerBoardCommands(program, {
		createCore: async () => new Core(await requireProjectRoot()),
		requireProjectRoot,
		hasInteractiveTTY,
		version,
		reportFailure: reportCommandFailure,
	});
	registerContentCommands(program, {
		createCore: async () => new Core(await requireProjectRoot()),
		isPlainRequested,
		resolveListOutput,
	});

	const agentsCmd = addHelpSchema(program.command("agents"), {
		reads: "Project config and existing agent instruction files when updating",
		required: [],
		optional: [
			{
				name: "--update-instructions",
				type: "Boolean",
				description: "Interactively select instruction files and refresh the short AgenticWorkspace CLI nudge",
			},
		],
		writes:
			"Creates or updates the managed AgenticWorkspace CLI nudge in selected instruction files; preserves existing content outside the managed block",
		output: "Interactive file selection followed by created, updated, or unchanged file summary",
		examples: ["agenticworkspace agents --update-instructions"],
	});
	agentsCmd
		.description("manage the short AgenticWorkspace CLI nudge in agent instruction files")
		.option(
			"--update-instructions",
			"update the AgenticWorkspace CLI nudge in agent instruction files while preserving existing content",
		)
		.action(async (options) => {
			if (!options.updateInstructions) return void agentsCmd.help();
			try {
				const cwd = await requireProjectRoot();
				const project = await loadInitializedProject(async () => new Core(cwd));
				if (!project) return;
				const selected = await clack.multiselect({
					message: "Select agent instruction files to update (space toggles selections; enter confirms)",
					required: false,
					options: [
						{ label: "CLAUDE.md (Claude Code)", value: "CLAUDE.md" },
						{ label: "AGENTS.md (Codex, Jules, Amp, Cursor, Zed, Warp, Aider, GitHub, RooCode)", value: "AGENTS.md" },
						{ label: "GEMINI.md (Google CLI)", value: "GEMINI.md" },
						{ label: "Copilot (GitHub Copilot)", value: ".github/copilot-instructions.md" },
					],
				});
				if (clack.isCancel(selected)) return void clack.log.info("Agent instruction update cancelled.");
				const files: AgentInstructionFile[] = Array.isArray(selected) ? (selected as AgentInstructionFile[]) : [];
				if (files.length > 0) {
					await addAgentInstructions(cwd, files);
					console.log(`Updated ${files.length} agent instruction file(s): ${files.join(", ")}`);
				} else console.log("No files selected for update.");
			} catch (error) {
				reportCommandFailure("Failed to update agent instructions", error);
			}
		});
	registerConfigCommand(program, { requireProjectRoot, reportFailure: reportCommandFailure });
	registerCleanupCommand(program, { requireProjectRoot, reportFailure: reportCommandFailure });
	registerCompletionCommand(program);
	registerInstructionsCommand(program);
	registerAgentWorkspaceCommands(program, {
		project: async () => new Core(await requireProjectRoot()),
		root: async () => new Core(await requireRuntimeCwd()),
	});
	registerMcpCommand(program);
	try {
		await program.parseAsync([process.execPath, "agenticworkspace", ...argv]);
		const exitCode = typeof process.exitCode === "number" ? process.exitCode : 0;
		process.exitCode = previousExitCode;
		return exitCode;
	} catch (error) {
		if (error && typeof error === "object" && "exitCode" in error && typeof error.exitCode === "number")
			return error.exitCode;
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = previousExitCode;
		return 1;
	} finally {
		if (originalBunOptions) process.env.BUN_OPTIONS = originalBunOptions;
		restoreProcessState();
	}
}
