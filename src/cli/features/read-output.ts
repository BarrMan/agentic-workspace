import type { Command } from "commander";
import { type ListWindow, type ListWindowOptions, parseListWindow } from "../../utils/list-window.ts";
import { type ReadOutputMode, type ReadOutputOptions, resolveReadOutputMode } from "../../utils/read-output-mode.ts";

export type CliReadOutput = {
	hasInteractiveTTY: boolean;
	plainFlagInArgv: boolean;
};

export function isPlainRequested(options: { plain?: boolean } | undefined, runtime: CliReadOutput): boolean {
	return Boolean(options?.plain || runtime.plainFlagInArgv);
}

export function getReadOutputMode(options: ReadOutputOptions, runtime: CliReadOutput): ReadOutputMode | null {
	try {
		return resolveReadOutputMode(options, runtime.hasInteractiveTTY);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
		return null;
	}
}

export function resolveListOutput(
	options: ListWindowOptions & ReadOutputOptions,
	command: Command,
	runtime: CliReadOutput,
): { outputMode: ReadOutputMode; listWindow: ListWindow } | null {
	const readOutputMode = getReadOutputMode(options, runtime);
	if (!readOutputMode) return null;
	const listWindow = parseListWindow(options, command, process.argv.slice(2));
	if (!listWindow) return null;
	const outputMode = readOutputMode === "interactive" && listWindow.forcesText ? "plain" : readOutputMode;
	return { outputMode, listWindow };
}
