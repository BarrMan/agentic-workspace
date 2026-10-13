import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import { MilestoneHandlers } from "../mcp/tools/milestones/handlers.ts";
import type { CallToolResult } from "../mcp/types.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

const cliCommand = ["agenticworkspace"];

function $(parts: TemplateStringsArray, ...values: unknown[]) {
	const source = parts.reduce(
		(text, part, index) =>
			`${text}${part}${Array.isArray(values[index]) ? values[index].map((value) => JSON.stringify(value)).join(" ") : values[index] === undefined ? "" : JSON.stringify(values[index])}`,
		"",
	);
	const args =
		source
			.match(/"(?:\\.|[^"\\])*"|'[^']*'|[^\s]+/g)
			?.map((arg) =>
				arg.startsWith('"') ? (JSON.parse(arg) as string) : arg.startsWith("'") ? arg.slice(1, -1) : arg,
			) ?? [];
	const config: { cwd?: string; nothrow?: boolean } = {};
	const result = async () => {
		const stdout: string[] = [];
		const stderr: string[] = [];
		const out = new Writable({
			write: (chunk, _encoding, done) => {
				stdout.push(chunk.toString());
				done();
			},
		});
		const err = new Writable({
			write: (chunk, _encoding, done) => {
				stderr.push(chunk.toString());
				done();
			},
		});
		const exitCode = await runCli(args.slice(cliCommand.length), { cwd: config.cwd, stdout: out, stderr: err });
		const value = { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
		if (value.exitCode && !config.nothrow) throw new Error(value.stderr || `CLI exited with ${value.exitCode}`);
		return value;
	};
	const chain = {
		cwd(value: string) {
			config.cwd = value;
			return chain;
		},
		nothrow() {
			config.nothrow = true;
			return chain;
		},
		quiet() {
			return result();
		},
		async text() {
			return (await result()).stdout;
		},
	};
	return chain;
}

let TEST_DIR: string;
let cleanupDirs: string[];

function toolText(result: CallToolResult): string {
	return result.content
		.map((item) => (item.type === "text" ? item.text : ""))
		.filter(Boolean)
		.join("\n");
}

function normalizeRenamePaths(text: string): string {
	return text
		.trim()
		.replace(/Renamed milestone file: [^\n]+ -> [^\n]+/g, "Renamed milestone file: <source> -> <target>");
}

async function setupProject(dir: string, projectName: string): Promise<Core> {
	await rm(dir, { recursive: true, force: true });
	await mkdir(dir, { recursive: true });

	const core = new Core(dir);
	await initializeTestProject(core, projectName);
	return core;
}

// Builds the same task record the CLI create path writes, so milestone setup can use the real Core
// API in-process instead of paying for an extra CLI process whose output is never asserted.
function milestoneTask(id: string, title: string) {
	return {
		id,
		title,
		status: "To Do",
		assignee: [],
		createdDate: "2026-01-01",
		labels: [],
		dependencies: [],
		rawContent: "",
	};
}

describe("CLI milestone management", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-cli-milestone-management");
		cleanupDirs = [TEST_DIR];
		await setupProject(TEST_DIR, "CLI Milestone Management Project");
	});

	afterEach(async () => {
		for (const dir of cleanupDirs) {
			await safeCleanup(dir);
		}
	});

	it("adds milestone files with descriptions and rejects duplicate aliases", async () => {
		const core = new Core(TEST_DIR);

		const add = await $`${cliCommand} milestone add "Release CLI" --description "Custom release scope"`
			.cwd(TEST_DIR)
			.quiet();

		expect(add.exitCode).toBe(0);
		expect(add.stdout.toString()).toContain('Created milestone "Release CLI" (m-0).');

		const milestones = await core.filesystem.listMilestones();
		expect(milestones).toHaveLength(1);
		expect(milestones[0]?.title).toBe("Release CLI");
		expect(milestones[0]?.description).toBe("Custom release scope");

		const duplicate = await $`${cliCommand} milestone add " release cli "`.cwd(TEST_DIR).nothrow().quiet();
		const duplicateOutput = duplicate.stdout.toString() + duplicate.stderr.toString();

		expect(duplicate.exitCode).toBe(1);
		expect(duplicateOutput).toContain(
			'Milestone alias conflict: "release cli" matches existing milestone "Release CLI" (m-0).',
		);
	});

	it("renames milestones and updates local task references by default", async () => {
		const core = new Core(TEST_DIR);

		await core.filesystem.createMilestone("Release A");
		await core.createTask(milestoneTask("task-1", "Task A"));
		await core.editTask("task-1", { milestone: "Release A" });

		const rename = await $`${cliCommand} milestone rename "Release A" "Release Prime"`.cwd(TEST_DIR).quiet();

		expect(rename.exitCode).toBe(0);
		expect(rename.stdout.toString()).toContain('Renamed milestone "Release A" (m-0) → "Release Prime" (m-0).');
		expect(rename.stdout.toString()).toContain("Updated 1 local task: TASK-1");

		const task = await core.filesystem.loadTask("task-1");
		expect(task?.milestone).toBe("m-0");

		const milestones = await core.filesystem.listMilestones();
		expect(milestones[0]?.title).toBe("Release Prime");
	});

	it("supports disabling task updates during milestone rename", async () => {
		const core = new Core(TEST_DIR);

		await core.filesystem.createMilestone("Legacy Release");
		await core.createTask(milestoneTask("task-1", "Legacy task"));
		await core.editTask("task-1", { milestone: "Legacy Release" });

		const rename = await $`${cliCommand} milestone rename "Legacy Release" "Renamed Release" --no-update-tasks`
			.cwd(TEST_DIR)
			.quiet();

		expect(rename.exitCode).toBe(0);
		expect(rename.stdout.toString()).toContain("Skipped updating tasks (updateTasks=false).");

		const task = await core.filesystem.loadTask("task-1");
		expect(task?.milestone).toBe("Legacy Release");
	});

	it("removes milestones and clears matching task values by default", async () => {
		const core = new Core(TEST_DIR);

		await core.filesystem.createMilestone("Release A");
		await core.createTask({ ...milestoneTask("task-1", "Task A"), milestone: "m-0" });

		const clear = await $`${cliCommand} milestone remove "Release A"`.cwd(TEST_DIR).quiet();

		expect(clear.exitCode).toBe(0);
		expect(clear.stdout.toString()).toContain("Cleared milestone for 1 local task: TASK-1");
		expect((await core.filesystem.loadTask("task-1"))?.milestone).toBeUndefined();
	});

	it("removes milestones and keeps task values when requested", async () => {
		const core = new Core(TEST_DIR);

		await core.filesystem.createMilestone("Keep Value");
		await core.createTask({ ...milestoneTask("task-1", "Task A"), milestone: "m-0" });

		const keep = await $`${cliCommand} milestone remove "Keep Value" --task-handling keep`.cwd(TEST_DIR).quiet();

		expect(keep.exitCode).toBe(0);
		expect(keep.stdout.toString()).toContain("Kept task milestone values unchanged (taskHandling=keep).");
		expect((await core.filesystem.loadTask("task-1"))?.milestone).toBe("m-0");
	});

	it("removes milestones and reassigns matching task values when requested", async () => {
		const core = new Core(TEST_DIR);

		await core.filesystem.createMilestone("Release A");
		await core.filesystem.createMilestone("Release B");
		await core.createTask({ ...milestoneTask("task-1", "Task A"), milestone: "m-0" });

		const reassign =
			await $`${cliCommand} milestone remove "Release A" --task-handling reassign --reassign-to "Release B"`
				.cwd(TEST_DIR)
				.quiet();

		expect(reassign.exitCode).toBe(0);
		expect(reassign.stdout.toString()).toContain('Removed milestone "Release A" (m-0).');
		expect(reassign.stdout.toString()).toContain('Reassigned 1 local task to "Release B" (m-1): TASK-1');
		expect((await core.filesystem.loadTask("task-1"))?.milestone).toBe("m-1");
	});

	it("validates remove task-handling flags and required reassign targets", async () => {
		const core = new Core(TEST_DIR);
		await core.filesystem.createMilestone("Release A");

		const invalid = await $`${cliCommand} milestone remove "Release A" --task-handling punt`
			.cwd(TEST_DIR)
			.nothrow()
			.quiet();
		const missingTarget = await $`${cliCommand} milestone remove "Release A" --task-handling reassign`
			.cwd(TEST_DIR)
			.nothrow()
			.quiet();

		expect(invalid.exitCode).toBe(1);
		expect(invalid.stderr.toString()).toContain("Invalid task handling: punt. Valid values are: clear, keep, reassign");
		expect(missingTarget.exitCode).toBe(1);
		expect(missingTarget.stderr.toString()).toContain("reassignTo is required when taskHandling is reassign.");
	});

	it("documents milestone command schemas in help output", async () => {
		const helpByCommand = new Map([
			["list", await $`${cliCommand} milestone list --help`.cwd(TEST_DIR).text()],
			["add", await $`${cliCommand} milestone add --help`.cwd(TEST_DIR).text()],
			["rename", await $`${cliCommand} milestone rename --help`.cwd(TEST_DIR).text()],
			["remove", await $`${cliCommand} milestone remove --help`.cwd(TEST_DIR).text()],
			["archive", await $`${cliCommand} milestone archive --help`.cwd(TEST_DIR).text()],
		]);

		for (const [command, help] of helpByCommand) {
			expect(help).toContain("Input schema:");
			expect(help).toContain("Reads:");
			expect(help).toContain("Output:");
			expect(help).toContain("Examples:");
			if (command !== "list") {
				expect(help).toContain("Writes:");
			}
		}

		expect(helpByCommand.get("rename")).toContain("disable with --no-update-tasks");
		expect(helpByCommand.get("remove")).toContain("task-handling: one of: clear, keep, reassign");
		expect(helpByCommand.get("remove")).toContain("reassign-to: Milestone ID or title");
	});

	it("matches MCP milestone handler output for shared mutation operations", async () => {
		const mcpDir = createUniqueTestDir("test-cli-milestone-mcp-parity");
		cleanupDirs.push(mcpDir);
		const mcpCore = await setupProject(mcpDir, "MCP Milestone Parity Project");
		const mcpHandlers = new MilestoneHandlers(mcpCore);

		const cliAdd = await $`${cliCommand} milestone add "Parity A"`.cwd(TEST_DIR).quiet();
		const mcpAdd = await mcpHandlers.addMilestone({ name: "Parity A" });
		expect(cliAdd.stdout.toString().trim()).toBe(toolText(mcpAdd).trim());

		const cliRename = await $`${cliCommand} milestone rename "Parity A" "Parity B"`.cwd(TEST_DIR).quiet();
		const mcpRename = await mcpHandlers.renameMilestone({ from: "Parity A", to: "Parity B" });
		expect(normalizeRenamePaths(cliRename.stdout.toString())).toBe(normalizeRenamePaths(toolText(mcpRename)));

		const cliRemove = await $`${cliCommand} milestone remove "Parity B" --task-handling keep`.cwd(TEST_DIR).quiet();
		const mcpRemove = await mcpHandlers.removeMilestone({ name: "Parity B", taskHandling: "keep" });
		expect(cliRemove.stdout.toString().trim()).toBe(toolText(mcpRemove).trim());
	});
});
