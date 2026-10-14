import { existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLI_AGENT_NUDGE, MCP_AGENT_NUDGE, README_GUIDELINES } from "./constants/index.ts";
import { getVersion } from "./utils/version.ts";

export type AgentInstructionFile =
	| "AGENTS.md"
	| "CLAUDE.md"
	| "GEMINI.md"
	| ".github/copilot-instructions.md"
	| "README.md";

export type AgentInstructionWriteAction = "created" | "updated" | "unchanged";

export interface AgentInstructionWriteResult {
	action: AgentInstructionWriteAction;
	fileName: AgentInstructionFile;
	filePath: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadContent(textOrPath: string): Promise<string> {
	if (textOrPath.includes("\n")) return textOrPath;
	try {
		const path = isAbsolute(textOrPath) ? textOrPath : join(__dirname, textOrPath);
		return await Bun.file(path).text();
	} catch {
		return textOrPath;
	}
}

type GuidelineMarkerKind = "default" | "mcp";

/**
 * Gets the markers for an installed guideline block
 */
function getMarkers(kind: GuidelineMarkerKind = "default"): { start: string; end: string } {
	const label = kind === "mcp" ? "AGENTIC_WORKSPACE MCP GUIDELINES" : "AGENTIC_WORKSPACE GUIDELINES";
	return {
		start: `<!-- ${label} START -->`,
		end: `<!-- ${label} END -->`,
	};
}

/**
 * Checks if the AgenticWorkspace guidelines are already present in the content
 */
function hasAgenticWorkspaceGuidelines(content: string): boolean {
	const { start } = getMarkers();
	return content.includes(start);
}

/**
 * Builds the machine-readable version marker line embedded in every installed
 * instruction block. Written at install/update time from the running binary's
 * version so local instructions can later be compared against the bundled ones.
 */
function versionMarkerLine(version: string): string {
	const marker = `agentic-workspace-instructions-version: ${version}`;
	return `<!-- ${marker} -->`;
}

/**
 * Wraps the AgenticWorkspace guidelines with appropriate markers
 */
function wrapWithMarkers(content: string, version: string, kind: GuidelineMarkerKind = "default"): string {
	const { start, end } = getMarkers(kind);
	return `\n${start}\n${versionMarkerLine(version)}\n${content}\n${end}\n`;
}

function stripGuidelineSection(
	content: string,
	kind: GuidelineMarkerKind,
): { content: string; removed: boolean; firstIndex?: number } {
	const { start, end } = getMarkers(kind);
	let removed = false;
	let result = content;
	let firstIndex: number | undefined;

	for (let block = findGuidelineBlock(result, start, end); block; block = findGuidelineBlock(result, start, end)) {
		if (firstIndex === undefined) firstIndex = block.start;
		result = result.slice(0, block.start) + result.slice(block.end);
		removed = true;
	}

	return { content: result, removed, firstIndex };
}

function findGuidelineBlock(content: string, start: string, end: string): { start: number; end: number } | undefined {
	const startIndex = content.indexOf(start);
	if (startIndex === -1) return undefined;
	const endIndex = content.indexOf(end, startIndex);
	if (endIndex === -1) return undefined;
	return {
		start: trimGuidelineStart(content, startIndex),
		end: consumeGuidelineEnd(content, endIndex + end.length),
	};
}

function trimGuidelineStart(content: string, index: number): number {
	let start = index;
	while (start > 0 && (content[start - 1] === " " || content[start - 1] === "\t")) start -= 1;
	if (content[start - 1] === "\n") start -= 1;
	if (content[start - 1] === "\r") start -= 1;
	return start;
}

function consumeGuidelineEnd(content: string, index: number): number {
	let end = index;
	if (content[end] === "\r") end += 1;
	if (content[end] === "\n") end += 1;
	return end;
}

export async function addAgentInstructions(
	projectRoot: string,
	files: AgentInstructionFile[] = ["AGENTS.md", "CLAUDE.md", "GEMINI.md", ".github/copilot-instructions.md"],
): Promise<AgentInstructionWriteResult[]> {
	const mapping: Record<AgentInstructionFile, string> = {
		"AGENTS.md": CLI_AGENT_NUDGE,
		"CLAUDE.md": CLI_AGENT_NUDGE,
		"GEMINI.md": CLI_AGENT_NUDGE,
		".github/copilot-instructions.md": CLI_AGENT_NUDGE,
		"README.md": README_GUIDELINES,
	};

	const version = await getVersion();
	const results: AgentInstructionWriteResult[] = [];
	for (const fileName of files) {
		results.push(await updateAgentInstructionFile(projectRoot, fileName, mapping[fileName], version));
	}

	return results;
}

async function updateAgentInstructionFile(
	projectRoot: string,
	fileName: AgentInstructionFile,
	guidelines: string,
	version: string,
): Promise<AgentInstructionWriteResult> {
	const filePath = join(projectRoot, fileName);
	const fileExists = existsSync(filePath);
	const action: AgentInstructionWriteAction = fileExists ? "updated" : "created";
	const content = await loadContent(guidelines);
	let existing = "";
	try {
		if (fileExists) existing = await readExistingFile(filePath);
	} catch (error) {
		console.error(`Error reading existing file ${filePath}:`, error);
	}
	const nextContent = replaceCliGuidelines(existing, content, version);
	if (nextContent === undefined || nextContent === existing) return { action: "unchanged", fileName, filePath };
	await mkdir(dirname(filePath), { recursive: true });
	await Bun.write(filePath, nextContent);
	return { action, fileName, filePath };
}

function replaceCliGuidelines(existing: string, content: string, version: string): string | undefined {
	const withoutMcp = stripGuidelineSection(existing, "mcp").content;
	const stripped = stripGuidelineSection(withoutMcp, "default");
	if (!stripped.removed && hasAgenticWorkspaceGuidelines(withoutMcp)) return undefined;
	if (stripped.removed) {
		const index = stripped.firstIndex ?? stripped.content.length;
		return stripped.content.slice(0, index) + wrapWithMarkers(content, version) + stripped.content.slice(index);
	}
	return `${withoutMcp}${withoutMcp && !withoutMcp.endsWith("\n") ? "\n" : ""}${wrapWithMarkers(content, version)}`;
}

export { loadContent as _loadAgentGuideline };

async function readExistingFile(filePath: string): Promise<string> {
	if (process.platform === "win32") {
		return readFileSync(filePath, "utf-8");
	}
	return await Bun.file(filePath).text();
}

export interface EnsureMcpGuidelinesResult {
	changed: boolean;
	created: boolean;
	fileName: AgentInstructionFile;
	filePath: string;
}

export async function ensureMcpGuidelines(
	projectRoot: string,
	fileName: AgentInstructionFile,
): Promise<EnsureMcpGuidelinesResult> {
	const filePath = join(projectRoot, fileName);
	const fileExists = existsSync(filePath);
	const original = fileExists ? await readMcpInstructionFile(filePath) : "";
	const finalContent = replaceMcpGuidelines(original, wrapWithMarkers(MCP_AGENT_NUDGE, await getVersion(), "mcp"));
	const changed = !fileExists || finalContent !== original;

	await mkdir(dirname(filePath), { recursive: true });
	if (changed) {
		await Bun.write(filePath, finalContent);
	}

	return { changed, created: !fileExists, fileName, filePath };
}

async function readMcpInstructionFile(filePath: string): Promise<string> {
	try {
		return await readExistingFile(filePath);
	} catch (error) {
		console.error(`Error reading existing file ${filePath}:`, error);
		return "";
	}
}

function replaceMcpGuidelines(original: string, nudgeBlock: string): string {
	const cliStripped = stripGuidelineSection(original, "default");
	const mcpStripped = stripGuidelineSection(cliStripped.content, "mcp");
	const insertIndex = mcpStripped.firstIndex ?? cliStripped.firstIndex;
	const existing = mcpStripped.content;
	if (insertIndex === undefined) return `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}${nudgeBlock}`;
	const index = Math.max(0, Math.min(insertIndex, existing.length));
	return existing.slice(0, index) + nudgeBlock + existing.slice(index);
}
