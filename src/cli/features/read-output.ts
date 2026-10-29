import type { Command } from "commander";
import { type ListWindow, type ListWindowOptions, parseListWindow } from "../list-window.ts";
import { type ReadOutputMode, type ReadOutputOptions, resolveReadOutputMode } from "../read-output-mode.ts";

export type CliReadOutput = {
	hasInteractiveTTY: boolean;
	plainFlagInArgv: boolean;
};

export function isPlainRequested(options: { plain?: boolean } | undefined, runtime: CliReadOutput): boolean {
	return Boolean(options?.plain || runtime.plainFlagInArgv);
}

export function resolveListOutput(
	options: ListWindowOptions & ReadOutputOptions,
	command: Command,
	runtime: CliReadOutput,
): { outputMode: ReadOutputMode; listWindow: ListWindow } | null {
	const readOutputMode = resolveReadOutputMode(options, runtime.hasInteractiveTTY);
	const listWindow = parseListWindow(options, command, process.argv.slice(2));
	if (!listWindow) return null;
	const outputMode = readOutputMode === "interactive" && listWindow.forcesText ? "plain" : readOutputMode;
	return { outputMode, listWindow };
}
