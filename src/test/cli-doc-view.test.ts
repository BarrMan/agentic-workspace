import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

async function runCommand(args: string[]) {
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
	const exitCode = await runCli(args, { cwd: TEST_DIR, stdout: out, stderr: err });
	return { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
}

describe("CLI doc view command", () => {
	// Both tests only read the document, so the fixture is built once.
	beforeAll(async () => {
		TEST_DIR = createUniqueTestDir("test-cli-doc-view");
		await mkdir(TEST_DIR, { recursive: true });

		const core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "Doc View Project");

		await core.createDocument({
			id: "doc-1",
			title: "Architecture Overview",
			type: "guide",
			createdDate: "2026-07-04",
			rawContent: "Service topology and indexing architecture details.",
		});
	});

	afterAll(async () => {
		await safeCleanup(TEST_DIR);
	});

	it("prints document content with --plain", async () => {
		const result = await runCommand(["doc", "view", "doc-1", "--plain"]);

		expect(result.exitCode).toBe(0);
		const stdout = result.stdout.toString();
		expect(stdout).toContain("Architecture Overview");
		expect(stdout).toContain("Service topology and indexing architecture details.");
	});

	it("falls back to plain output without --plain when not attached to a TTY", async () => {
		const result = await runCommand(["doc", "view", "doc-1"]);

		expect(result.exitCode).toBe(0);
		const stdout = result.stdout.toString();
		expect(stdout).toContain("Service topology and indexing architecture details.");
		expect(stdout).not.toContain("[");
	});
});
