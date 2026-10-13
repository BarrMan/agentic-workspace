import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { $ } from "bun";
import { runCli } from "../cli/register.ts";
import { safeCleanup } from "./test-utils.ts";

let testDir: string;

async function initWithClosedInput(args: string[]) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const output = (chunks: string[]) =>
		new Writable({
			write: (chunk, _encoding, done) => {
				chunks.push(chunk.toString());
				done();
			},
		});
	const originalBacklogCwd = process.env.BACKLOG_CWD;
	delete process.env.BACKLOG_CWD;
	try {
		const exitCode = await runCli(["init", ...args], {
			cwd: testDir,
			stdout: output(stdout),
			stderr: output(stderr),
		});
		return { exitCode, output: stdout.join("") + stderr.join("") };
	} finally {
		if (originalBacklogCwd === undefined) delete process.env.BACKLOG_CWD;
		else process.env.BACKLOG_CWD = originalBacklogCwd;
	}
}

describe("CLI init with closed stdin", () => {
	beforeEach(async () => {
		// Stay outside this checkout so no-Git cases cannot inherit its repository.
		testDir = await mkdtemp(join(tmpdir(), "cli-init-input-"));
	});

	afterEach(async () => {
		await safeCleanup(testDir);
	});

	for (const git of [false, true]) {
		test(`requires a project name with ${git ? "Git" : "--no-git"} and --defaults`, async () => {
			if (git) await $`git init -b main`.cwd(testDir).quiet();
			const before = await readdir(testDir);

			const result = await initWithClosedInput(git ? ["--defaults"] : ["--no-git", "--defaults"]);

			expect(result.exitCode).toBe(1);
			expect(result.output).toContain("Project name is required");
			expect(result.output).toContain('agenticworkspace init "My Project"');
			expect(result.output).not.toContain("Initialized backlog project");
			expect(await readdir(testDir)).toEqual(before);
		});

		test(`accepts a fully specified ${git ? "Git" : "filesystem-only"} initialization`, async () => {
			if (git) await $`git init -b main`.cwd(testDir).quiet();
			const args = ["Input Test", "--defaults", "--integration-mode", "none"];
			if (!git) args.push("--no-git");

			const result = await initWithClosedInput(args);

			expect(result.exitCode).toBe(0);
			expect(result.output).toContain("Initialized backlog project: Input Test");
			expect(await Bun.file(join(testDir, "backlog", "config.yml")).text()).toContain('project_name: "Input Test"');
			expect((await readdir(testDir)).includes(".git")).toBe(git);
		});
	}

	for (const flags of [[], ["--defaults"]]) {
		test(`requires an explicit Git choice ${flags.length ? "with --defaults" : "without flags"}`, async () => {
			const result = await initWithClosedInput(["Input Test", ...flags]);

			expect(result.exitCode).toBe(1);
			expect(result.output).toContain("No Git repository found");
			expect(result.output).toContain("git init");
			expect(result.output).toContain("--no-git");
			expect(await readdir(testDir)).toEqual([]);
		});
	}

	test("requires --defaults when setup choices still need a terminal", async () => {
		await $`git init -b main`.cwd(testDir).quiet();
		const before = await readdir(testDir);

		const result = await initWithClosedInput(["Input Test"]);

		expect(result.exitCode).toBe(1);
		expect(result.output).toContain("interactive terminal");
		expect(result.output).toContain("--defaults");
		expect(await readdir(testDir)).toEqual(before);
	});
});
