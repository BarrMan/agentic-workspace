import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let testDir: string;
const description = "First line\nSecond line\n\nThird paragraph";

async function cli(args: string[], cwd: string) {
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
	const exitCode = await runCli(args, { cwd, stdout: out, stderr: err });
	if (exitCode) throw new Error(stderr.join("") || `CLI exited with ${exitCode}`);
	return { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
}

describe("CLI description newlines", () => {
	beforeEach(async () => {
		testDir = createUniqueTestDir("description-newlines");
		await mkdir(testDir, { recursive: true });
		await initializeFilesystemTestProject(new Core(testDir), "Description newlines");
	});
	afterEach(async () => safeCleanup(testDir));

	it("stores literal newlines in description frontmatter on create and edit", async () => {
		await cli(["task", "create", "Multi-line", "--description", description], testDir);
		const core = new Core(testDir);
		expect((await core.filesystem.loadTask("task-1"))?.description).toBe(description);
		await cli(["task", "edit", "1", "--description", "Replacement\ntext"], testDir);
		expect((await core.filesystem.loadTask("task-1"))?.description).toBe("Replacement\ntext");
	});

	it("does not interpret escaped newline text", async () => {
		await cli(["task", "create", "Literal", "--description", "First line\\nSecond line"], testDir);
		expect((await new Core(testDir).filesystem.loadTask("task-1"))?.description).toBe("First line\\nSecond line");
	});
});
