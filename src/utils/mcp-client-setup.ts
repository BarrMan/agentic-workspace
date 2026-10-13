import { spawn } from "bun";
import type { AgentInstructionFile } from "../agent-instructions.ts";

export type McpClientSetupKey = "claude" | "codex" | "gemini" | "kiro";

export type McpClientSetupCommand = {
	label: string;
	command: string;
	args: string[];
};

type McpClientSetup = Omit<McpClientSetupCommand, "args"> & {
	args: (serverName: string) => string[];
	instructionFile: AgentInstructionFile;
};

const MCP_CLIENT_SETUP: Record<McpClientSetupKey, McpClientSetup> = {
	claude: {
		label: "Claude Code",
		command: "claude",
		args: (serverName) => ["mcp", "add", "-s", "user", serverName, "--", "agenticworkspace", "mcp", "start"],
		instructionFile: "CLAUDE.md",
	},
	codex: {
		label: "OpenAI Codex",
		command: "codex",
		args: (serverName) => ["mcp", "add", serverName, "--", "agenticworkspace", "mcp", "start"],
		instructionFile: "AGENTS.md",
	},
	gemini: {
		label: "Gemini CLI",
		command: "gemini",
		args: (serverName) => ["mcp", "add", "-s", "user", serverName, "agenticworkspace", "mcp", "start"],
		instructionFile: "GEMINI.md",
	},
	kiro: {
		label: "Kiro",
		command: "kiro-cli",
		args: (serverName) => [
			"mcp",
			"add",
			"--scope",
			"global",
			"--name",
			serverName,
			"--command",
			"agenticworkspace",
			"--args",
			"mcp,start",
		],
		instructionFile: "AGENTS.md",
	},
};

export type McpClientSetupStdio = "inherit" | "pipe";

export function isMcpClientSetupKey(client: string): client is McpClientSetupKey {
	return Object.hasOwn(MCP_CLIENT_SETUP, client);
}

export function listMcpClientSetups(): { key: McpClientSetupKey; label: string }[] {
	return (Object.keys(MCP_CLIENT_SETUP) as McpClientSetupKey[]).map((key) => ({
		key,
		label: MCP_CLIENT_SETUP[key].label,
	}));
}

export function getMcpClientInstructionFile(client: McpClientSetupKey): AgentInstructionFile {
	return MCP_CLIENT_SETUP[client].instructionFile;
}

export function getMcpClientSetupCommand(client: McpClientSetupKey, serverName: string): McpClientSetupCommand {
	const { label, command, args } = MCP_CLIENT_SETUP[client];
	return {
		label,
		command,
		args: args(serverName),
	};
}

export function formatMcpClientSetupCommand(command: string, args: string[]): string {
	return [command, ...args].join(" ");
}

export async function runMcpClientSetupCommand(
	command: string,
	args: string[],
	options: { stdout?: McpClientSetupStdio; stderr?: McpClientSetupStdio } = {},
): Promise<void> {
	const stdout = options.stdout ?? "pipe";
	const stderr = options.stderr ?? "pipe";
	const child = spawn({
		cmd: [command, ...args],
		stdout,
		stderr,
	});

	const stdoutText = stdout === "pipe" && child.stdout ? new Response(child.stdout).text() : Promise.resolve("");
	const stderrText = stderr === "pipe" && child.stderr ? new Response(child.stderr).text() : Promise.resolve("");
	const [exitCode, capturedStdout, capturedStderr] = await Promise.all([child.exited, stdoutText, stderrText]);

	if (exitCode !== 0) {
		const details = [capturedStderr.trim(), capturedStdout.trim()].filter(Boolean).join("\n");
		throw new Error(`Command exited with code ${exitCode}${details ? `: ${details}` : ""}`);
	}
}
