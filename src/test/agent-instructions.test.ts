import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
	_loadAgentGuideline,
	addAgentInstructions,
	CLI_AGENT_NUDGE,
	ensureMcpGuidelines,
	README_GUIDELINES,
} from "../index.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

describe("addAgentInstructions", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-agent-instructions");
		await mkdir(TEST_DIR, { recursive: true });
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	it("creates guideline files when none exist", async () => {
		await addAgentInstructions(TEST_DIR);
		const agents = await Bun.file(join(TEST_DIR, "AGENTS.md")).text();
		const claude = await Bun.file(join(TEST_DIR, "CLAUDE.md")).text();
		const gemini = await Bun.file(join(TEST_DIR, "GEMINI.md")).text();
		const copilot = await Bun.file(join(TEST_DIR, ".github/copilot-instructions.md")).text();

		// Check that files contain the markers and content
		expect(agents).toContain("<!-- BACKLOG.MD GUIDELINES START -->");
		expect(agents).toContain("<!-- BACKLOG.MD GUIDELINES END -->");
		expect(agents).toContain(CLI_AGENT_NUDGE);
		expect(agents).not.toContain("# Instructions for the usage of Backlog.md CLI Tool");

		expect(claude).toContain("<!-- BACKLOG.MD GUIDELINES START -->");
		expect(claude).toContain("<!-- BACKLOG.MD GUIDELINES END -->");
		expect(claude).toContain(CLI_AGENT_NUDGE);

		expect(gemini).toContain("<!-- BACKLOG.MD GUIDELINES START -->");
		expect(gemini).toContain("<!-- BACKLOG.MD GUIDELINES END -->");
		expect(gemini).toContain(CLI_AGENT_NUDGE);

		expect(copilot).toContain("<!-- BACKLOG.MD GUIDELINES START -->");
		expect(copilot).toContain("<!-- BACKLOG.MD GUIDELINES END -->");
		expect(copilot).toContain(CLI_AGENT_NUDGE);
	});

	it("generated CLI nudge limits task management to requested operations and assigned sessions", async () => {
		await addAgentInstructions(TEST_DIR, ["AGENTS.md"]);
		const agents = await Bun.file(join(TEST_DIR, "AGENTS.md")).text();

		expect(agents).toContain("when the user requests task operations or this session is explicitly assigned");
		expect(agents).toContain("agenticworkspace task create");
		expect(agents).toContain("agenticworkspace task view <id> --plain");
		expect(agents).toContain("agenticworkspace task edit <id>");
		expect(agents).not.toContain("agenticworkspace instructions");
	});

	it("appends guideline files when they already exist", async () => {
		await Bun.write(join(TEST_DIR, "AGENTS.md"), "Existing\n");
		const results = await addAgentInstructions(TEST_DIR);
		const agents = await Bun.file(join(TEST_DIR, "AGENTS.md")).text();
		expect(agents.startsWith("Existing\n")).toBe(true);
		expect(agents).toContain("<!-- BACKLOG.MD GUIDELINES START -->");
		expect(agents).toContain("<!-- BACKLOG.MD GUIDELINES END -->");
		expect(agents).toContain(CLI_AGENT_NUDGE);
		expect(results.find((result) => result.fileName === "AGENTS.md")?.action).toBe("updated");
		expect(results.find((result) => result.fileName === "CLAUDE.md")?.action).toBe("created");
	});

	it("reports unchanged guideline files when the selected block already exists", async () => {
		await addAgentInstructions(TEST_DIR, ["AGENTS.md"]);
		const results = await addAgentInstructions(TEST_DIR, ["AGENTS.md"]);

		expect(results).toEqual([
			{
				action: "unchanged",
				fileName: "AGENTS.md",
				filePath: join(TEST_DIR, "AGENTS.md"),
			},
		]);
	});

	it("replaces stale generated CLI guideline blocks", async () => {
		const agentsPath = join(TEST_DIR, "AGENTS.md");
		await Bun.write(
			agentsPath,
			[
				"Existing header",
				"<!-- BACKLOG.MD GUIDELINES START -->",
				"Old generated Backlog guidance",
				"<!-- BACKLOG.MD GUIDELINES END -->",
				"Existing footer",
				"",
			].join("\n"),
		);

		const results = await addAgentInstructions(TEST_DIR, ["AGENTS.md"]);
		const agents = await Bun.file(agentsPath).text();

		expect(results).toEqual([
			{
				action: "updated",
				fileName: "AGENTS.md",
				filePath: agentsPath,
			},
		]);
		expect(agents).toContain("Existing header");
		expect(agents).toContain("Existing footer");
		expect(agents).toContain(CLI_AGENT_NUDGE);
		expect(agents).not.toContain("Old generated Backlog guidance");
		expect((agents.match(/<!-- BACKLOG\.MD GUIDELINES START -->/g) || []).length).toBe(1);
	});

	it("creates only selected files", async () => {
		await addAgentInstructions(TEST_DIR, ["AGENTS.md", "README.md"]);

		const agentsExists = await Bun.file(join(TEST_DIR, "AGENTS.md")).exists();
		const claudeExists = await Bun.file(join(TEST_DIR, "CLAUDE.md")).exists();
		const geminiExists = await Bun.file(join(TEST_DIR, "GEMINI.md")).exists();
		const copilotExists = await Bun.file(join(TEST_DIR, ".github/copilot-instructions.md")).exists();
		const readme = await Bun.file(join(TEST_DIR, "README.md")).text();

		expect(agentsExists).toBe(true);
		expect(claudeExists).toBe(false);
		expect(geminiExists).toBe(false);
		expect(copilotExists).toBe(false);
		expect(readme).toContain("<!-- BACKLOG.MD GUIDELINES START -->");
		expect(readme).toContain("<!-- BACKLOG.MD GUIDELINES END -->");
		expect(readme).toContain(await _loadAgentGuideline(README_GUIDELINES));
	});

	it("preserves existing content and adds Backlog.md content only once", async () => {
		const existingContent = "# My Existing Claude Instructions\n\nThis is my custom content.\n";
		await Bun.write(join(TEST_DIR, "CLAUDE.md"), existingContent);

		// First run
		await addAgentInstructions(TEST_DIR, ["CLAUDE.md"]);
		const firstRun = await Bun.file(join(TEST_DIR, "CLAUDE.md")).text();

		// Second run - should not duplicate Backlog.md content
		await addAgentInstructions(TEST_DIR, ["CLAUDE.md"]);
		const secondRun = await Bun.file(join(TEST_DIR, "CLAUDE.md")).text();

		expect(firstRun).toBe(secondRun);
		expect(firstRun).toContain(existingContent);
		expect(firstRun).toContain("<!-- BACKLOG.MD GUIDELINES START -->");
		expect(firstRun).toContain("<!-- BACKLOG.MD GUIDELINES END -->");

		// Count occurrences of the marker to ensure it's only there once
		const startMarkerCount = (firstRun.match(/<!-- BACKLOG\.MD GUIDELINES START -->/g) || []).length;
		const endMarkerCount = (firstRun.match(/<!-- BACKLOG\.MD GUIDELINES END -->/g) || []).length;
		expect(startMarkerCount).toBe(1);
		expect(endMarkerCount).toBe(1);
	});

	it("replaces CLI guidelines with MCP nudge when switching modes", async () => {
		const agentsPath = join(TEST_DIR, "AGENTS.md");
		const cliBlock = [
			"Preface content",
			"<!-- BACKLOG.MD GUIDELINES START -->",
			"CLI instructions here",
			"<!-- BACKLOG.MD GUIDELINES END -->",
			"Footer line",
			"",
		].join("\n");
		await Bun.write(agentsPath, cliBlock);

		await ensureMcpGuidelines(TEST_DIR, "AGENTS.md");
		const updated = await Bun.file(agentsPath).text();

		expect(updated).not.toContain("<!-- BACKLOG.MD GUIDELINES START -->");
		expect(updated).not.toContain("<!-- BACKLOG.MD GUIDELINES END -->");
		expect(updated).toContain("<!-- BACKLOG.MD MCP GUIDELINES START -->");
		expect(updated).toContain("<!-- BACKLOG.MD MCP GUIDELINES END -->");
		expect(updated).toContain("Preface content");
		expect(updated).toContain("Footer line");
	});

	// BACK-267: every installed instruction block carries a machine-readable version
	// marker derived from the running binary/package version, so tooling can compare
	// a project's local instructions against the bundled ones.
	it("writes a version marker matching package.json inside the guidelines block (BACK-267)", async () => {
		const { version } = await Bun.file(join(__dirname, "../../package.json")).json();
		const versionMarker = `<!-- backlog.md-instructions-version: ${version} -->`;

		await addAgentInstructions(TEST_DIR);
		for (const fileName of ["AGENTS.md", "CLAUDE.md", "GEMINI.md", ".github/copilot-instructions.md"]) {
			const content = await Bun.file(join(TEST_DIR, fileName)).text();
			expect(content).toContain(versionMarker);
			// Marker lives inside the managed block, right after the start marker
			expect(content.indexOf(versionMarker)).toBeGreaterThan(content.indexOf("<!-- BACKLOG.MD GUIDELINES START -->"));
			expect(content.indexOf(versionMarker)).toBeLessThan(content.indexOf("<!-- BACKLOG.MD GUIDELINES END -->"));
			expect((content.match(/<!-- backlog\.md-instructions-version: /g) || []).length).toBe(1);
		}
	});

	it("refreshes a stale version marker when updating an existing block (BACK-267)", async () => {
		const { version } = await Bun.file(join(__dirname, "../../package.json")).json();
		const agentsPath = join(TEST_DIR, "AGENTS.md");
		await Bun.write(
			agentsPath,
			[
				"Existing header",
				"<!-- BACKLOG.MD GUIDELINES START -->",
				"<!-- backlog.md-instructions-version: 0.0.1 -->",
				"Old generated Backlog guidance",
				"<!-- BACKLOG.MD GUIDELINES END -->",
				"",
			].join("\n"),
		);

		await addAgentInstructions(TEST_DIR, ["AGENTS.md"]);
		const agents = await Bun.file(agentsPath).text();

		expect(agents).not.toContain("backlog.md-instructions-version: 0.0.1");
		expect(agents).toContain(`<!-- backlog.md-instructions-version: ${version} -->`);
		expect(agents).toContain("Existing header");
	});

	it("writes the version marker in MCP guideline blocks (BACK-267)", async () => {
		const { version } = await Bun.file(join(__dirname, "../../package.json")).json();

		await ensureMcpGuidelines(TEST_DIR, "AGENTS.md");
		const content = await Bun.file(join(TEST_DIR, "AGENTS.md")).text();
		const versionMarker = `<!-- backlog.md-instructions-version: ${version} -->`;

		expect(content).toContain(versionMarker);
		expect(content.indexOf(versionMarker)).toBeGreaterThan(content.indexOf("<!-- BACKLOG.MD MCP GUIDELINES START -->"));
		expect(content.indexOf(versionMarker)).toBeLessThan(content.indexOf("<!-- BACKLOG.MD MCP GUIDELINES END -->"));
	});

	it("replaces MCP nudge with CLI guidelines when switching modes", async () => {
		const agentsPath = join(TEST_DIR, "AGENTS.md");
		const mcpBlock = [
			"Header",
			"<!-- BACKLOG.MD MCP GUIDELINES START -->",
			"MCP reminder here",
			"<!-- BACKLOG.MD MCP GUIDELINES END -->",
			"",
		].join("\n");
		await Bun.write(agentsPath, mcpBlock);

		await addAgentInstructions(TEST_DIR, ["AGENTS.md"]);
		const updated = await Bun.file(agentsPath).text();

		expect(updated).toContain("<!-- BACKLOG.MD GUIDELINES START -->");
		expect(updated).toContain("<!-- BACKLOG.MD GUIDELINES END -->");
		expect(updated).not.toContain("<!-- BACKLOG.MD MCP GUIDELINES START -->");
		expect(updated).not.toContain("<!-- BACKLOG.MD MCP GUIDELINES END -->");
		expect(updated).toContain("Header");
	});
});
