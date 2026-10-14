import * as clack from "@clack/prompts";
import { ensureMcpGuidelines } from "../../../agent-instructions.ts";
import { launchBrowser } from "../../../utils/browser-launch.ts";
import {
	formatMcpClientSetupCommand,
	getMcpClientInstructionFile,
	getMcpClientSetupCommand,
	isMcpClientSetupKey,
	listMcpClientSetups,
	type McpClientSetupKey,
	runMcpClientSetupCommand,
} from "../../../utils/mcp-client-setup.ts";

export const INIT_MCP_SERVER_NAME = "agentic-workspace";

async function openInitMcpGuide(url: string): Promise<void> {
	try {
		await launchBrowser(url);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(`  ⚠️  Unable to open browser automatically (${message}). Please visit ${url}`);
	}
}

async function configureInitMcpClient(client: McpClientSetupKey, serverName = INIT_MCP_SERVER_NAME): Promise<string> {
	const { label, command, args } = getMcpClientSetupCommand(client, serverName);
	console.log(`    Configuring ${label}...`);
	try {
		await runMcpClientSetupCommand(command, args, { stdout: "inherit", stderr: "inherit" });
		console.log(`    ✓ Added AgenticWorkspace MCP server to ${label}`);
		return label;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(`    ⚠️ Unable to configure ${label} automatically (${message}).`);
		console.warn(`       Run manually: ${formatMcpClientSetupCommand(command, args)}`);
		return `${label} (manual setup required)`;
	}
}

async function configureSelectedMcpClients(cwd: string, guideUrl: string, clients: string[]): Promise<string> {
	const results: string[] = [];
	const guidelineUpdates = [];
	for (const client of clients) {
		if (isMcpClientSetupKey(client)) {
			results.push(await configureInitMcpClient(client));
		} else if (client === "guide") {
			console.log("    Opening MCP setup guide in your browser...");
			await openInitMcpGuide(guideUrl);
			results.push("Setup guide opened");
		}
		const instructionFile = isMcpClientSetupKey(client)
			? getMcpClientInstructionFile(client)
			: client === "guide"
				? "AGENTS.md"
				: undefined;
		if (instructionFile) guidelineUpdates.push(await ensureMcpGuidelines(cwd, instructionFile));
	}
	logMcpGuidelineUpdates(guidelineUpdates);
	return results.join(", ");
}

export async function configureInitMcpClients(cwd: string, guideUrl: string): Promise<string | null> {
	console.log(`  MCP server name: ${INIT_MCP_SERVER_NAME}`);
	while (true) {
		const response = await clack.multiselect({
			message: "Which AI tools should we configure right now? (space toggles items; enter confirms)",
			options: [
				...listMcpClientSetups().map(({ key, label }) => ({ label, value: key })),
				{ label: "Other (open setup guide)", value: "guide" },
			],
			required: true,
		});
		if (clack.isCancel(response)) return null;
		const clients = Array.isArray(response) ? response : [];
		if (clients.length === 0) {
			console.log("Please select at least one AI tool before continuing.");
			continue;
		}
		return configureSelectedMcpClients(cwd, guideUrl, clients);
	}
}

function logMcpGuidelineUpdates(updates: Awaited<ReturnType<typeof ensureMcpGuidelines>>[]): void {
	const changed = updates.filter((update) => update.changed);
	const created = [...new Set(changed.filter((update) => update.created).map((update) => update.fileName))];
	const updated = [...new Set(changed.filter((update) => !update.created).map((update) => update.fileName))];
	if (created.length > 0) console.log(`    Created MCP reminder file(s): ${created.join(", ")}`);
	if (updated.length > 0) console.log(`    Added MCP reminder to ${updated.join(", ")}`);
}
