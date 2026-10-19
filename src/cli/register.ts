#!/usr/bin/env node

import { Console } from "node:console";
import type { Writable } from "node:stream";
import { Command } from "commander";
import { findLocalDuplicateTaskIds } from "../controller/duplicate-task-detection.ts";
import { Core } from "../index.ts";
import { getVersion } from "../lib/version.ts";
import { formatDuplicateTaskIdWarning } from "../model/task/duplicate-detection.ts";
import { loadProjectModeCatalog } from "../storage/config.ts";
import { isConfigValueError } from "../storage/file-system.ts";
import { registerAgentWorkspaceCommands } from "./commands/agent-workspace.ts";
import { configureHelpValues } from "./commands/help-schema.ts";
import { registerSearchCommand } from "./commands/search.ts";
import { type CliReadOutput, resolveListOutput as resolveRuntimeListOutput } from "./features/read-output.ts";
import {
	normalizeCliPriority,
	normalizeCliProjects,
	normalizeCliStatusList,
	normalizeCliTaskTypes,
} from "./features/tasks/filter-normalizers.ts";
import { registerTaskCommands } from "./features/tasks/register.ts";
import type { ReadOutputOptions } from "./read-output-mode.ts";
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
	const runtime = new CliRuntime(options.cwd, stdout);
	const hasInteractiveTTY = runtime.hasInteractiveTTY;
	const readOutput: CliReadOutput = { hasInteractiveTTY, plainFlagInArgv: argv.includes("--plain") };
	const originalBunOptions = process.env.BUN_OPTIONS;
	if (originalBunOptions) delete process.env.BUN_OPTIONS;
	const version = await getVersion();
	try {
		const helpRoot = await runtime.findProjectRoot();
		configureHelpValues(helpRoot ? await new Core(helpRoot).getStoredConfig() : null);
	} catch {
		configureHelpValues(null);
	}

	async function requireProjectRoot(): Promise<string> {
		return runtime.projectRoot();
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
				/node_modules[\\/]+agentic-workspace-(darwin|linux|windows)-[^\\/]+[\\/]+agentic-workspace(\.exe)?$/.test(first)
			)
				rawArgs = rawArgs.slice(1);
		}
		const wantsHelp = rawArgs.includes("-h") || rawArgs.includes("--help");
		const wantsVersion = rawArgs.includes("-v") || rawArgs.includes("--version");
		if ((rawArgs.length === 0 || (rawArgs.length === 1 && rawArgs[0] === "--plain")) && !wantsHelp && !wantsVersion) {
			let initialized = false;
			try {
				const root = await runtime.findProjectRoot();
				initialized = Boolean(root && (await new Core(root).getStoredConfig()));
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
		.name("agentic-workspace")
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

	registerAgentWorkspaceCommands(program, {
		project: async () => new Core(await requireProjectRoot()),
	});
	try {
		await program.parseAsync([process.execPath, "agentic-workspace", ...argv]);
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
