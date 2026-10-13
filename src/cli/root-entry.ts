import { renderConfiguredTaskIds } from "../commands/help-schema.ts";
import { INSTRUCTION_GUIDES } from "../mcp/workflow-guides.ts";

type RootEntryOptions = {
	version: string;
	initialized: boolean;
	color?: boolean;
};

const ANSI = {
	reset: "\u001B[0m",
	logo: "\u001B[1;36m",
	title: "\u001B[1m",
	section: "\u001B[1;33m",
} as const;

const LOGO_LINES = [
	"██████╗  █████╗  █████╗ ██╗  ██╗██╗      █████╗  ██████╗    ███╗   ███╗██████╗ ",
	"██╔══██╗██╔══██╗██╔══██╗██║ ██╔╝██║     ██╔══██╗██╔════╝    ████╗ ████║██╔══██╗",
	"██████╦╝███████║██║  ╚═╝█████═╝ ██║     ██║  ██║██║  ██╗    ██╔████╔██║██║  ██║",
	"██╔══██╗██╔══██║██║  ██╗██╔═██╗ ██║     ██║  ██║██║  ╚██╗   ██║╚██╔╝██║██║  ██║",
	"██████╦╝██║  ██║╚█████╔╝██║ ╚██╗███████╗╚█████╔╝╚██████╔╝██╗██║ ╚═╝ ██║██████╔╝",
	"╚═════╝ ╚═╝  ╚═╝ ╚════╝ ╚═╝  ╚═╝╚══════╝ ╚════╝  ╚═════╝ ╚═╝╚═╝     ╚═╝╚═════╝ ",
];

function commandLine(command: string, description: string): string {
	return `  ${command.padEnd(46)} ${description}`;
}

function colorize(value: string, code: string, enabled: boolean): string {
	return enabled ? `${code}${value}${ANSI.reset}` : value;
}

function sectionTitle(value: string, color: boolean): string {
	return colorize(value, ANSI.section, color);
}

export function formatRootEntry({ version, initialized, color = false }: RootEntryOptions): string {
	const logoLines = LOGO_LINES.map((line) => colorize(line, ANSI.logo, color));
	const lines: string[] = [...logoLines, "", `${colorize("AgenticWorkspace", ANSI.title, color)} v${version}`, ""];

	if (!initialized) {
		lines.push("This directory is not initialized for AgenticWorkspace.", "");
		lines.push(sectionTitle("Project setup:", color));
		lines.push(commandLine("agenticworkspace init", "Initialize AgenticWorkspace interactively"));
		lines.push(commandLine("agenticworkspace init --defaults", "Initialize with default settings"));
		lines.push(commandLine("agenticworkspace init --no-git", "Initialize without Git integration"));
		lines.push("");
	} else {
		lines.push(sectionTitle("Common workflow:", color));
		lines.push(commandLine('agenticworkspace search "query" --plain', "Search tasks, docs, and decisions"));
		lines.push(commandLine("agenticworkspace task list --plain", "List tasks"));
		lines.push(
			commandLine(renderConfiguredTaskIds("agenticworkspace task view {{TASK_ID:123}} --plain"), "Read task context"),
		);
		lines.push(commandLine('agenticworkspace task create "Title" -d "Description"', "Create a task"));
		lines.push(commandLine("agenticworkspace board", "Open the TUI Kanban board"));
		lines.push("");
	}

	lines.push(sectionTitle("Local instructions:", color));
	lines.push(commandLine("agenticworkspace instructions", "List workflow guides"));
	for (const guide of INSTRUCTION_GUIDES) {
		lines.push(commandLine(`agenticworkspace instructions ${guide.key}`, guide.description));
	}
	lines.push("");

	lines.push(sectionTitle("Command help:", color));
	lines.push(commandLine("agenticworkspace <command> --help", "Show options, fields, and examples"));
	lines.push("");
	lines.push("Docs: https://github.com/BarrMan/agentic-workspace");
	lines.push("");

	return `${lines.join("\n")}\n`;
}

export async function printRootEntry(options: RootEntryOptions): Promise<void> {
	const color = options.color ?? (Boolean(process.stdout.isTTY) && !process.env.NO_COLOR);
	process.stdout.write(formatRootEntry({ ...options, color }));
}
