import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { cp, mkdtemp, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import { initializeFilesystemTestProject } from "./test-utils.ts";

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

/**
 * Every case needs the same initialized (git-free) project, so one template is laid
 * out once and cloned per case.
 */
describe("Draft creation consistency", () => {
	let templateDir: string;
	let projectNumber = 0;
	const dirs: string[] = [];

	beforeAll(async () => {
		templateDir = await mkdtemp(join(tmpdir(), "test-draft-create-template-"));
		await initializeFilesystemTestProject(new Core(templateDir), "Draft Consistency Test Project");
	});

	afterAll(async () => {
		await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
		await rm(templateDir, { recursive: true, force: true });
	});

	async function createProject(): Promise<string> {
		const target = join(tmpdir(), `test-draft-create-consistency-${process.pid}-${projectNumber++}`);
		await cp(templateDir, target, { recursive: true });
		const testDir = await realpath(target);
		dirs.push(testDir);
		return testDir;
	}

	it("keeps IDs and filenames consistent between draft create and task create --draft", async () => {
		const testDir = await createProject();
		try {
			const first = await cli(["draft", "create", "Hallo"], testDir);
			const second = await cli(["task", "create", "--draft", "Goodbye"], testDir);

			expect(first.stdout.toString()).toContain("Created draft DRAFT-1");
			expect(second.stdout.toString()).toContain("Created draft DRAFT-2");
			expect(second.stdout.toString()).toContain(join("draft-2", "task.md"));
			expect(second.stdout.toString()).not.toContain("draft-task-");

			const draftFiles = await readdir(join(testDir, "agentic-workspace", "drafts"));
			expect(draftFiles).toContain("draft-1");
			expect(draftFiles).toContain("draft-2");
			for (const id of ["draft-1", "draft-2"]) {
				expect(await readdir(join(testDir, "agentic-workspace", "drafts", id))).toEqual(["task.md"]);
			}
			expect(draftFiles.some((file) => file.startsWith("draft-task-"))).toBe(false);

			const core = new Core(testDir);
			const firstDraft = await core.filesystem.loadDraft("draft-1");
			const secondDraft = await core.filesystem.loadDraft("draft-2");
			expect(firstDraft).toMatchObject({ id: "DRAFT-1", title: "Hallo" });
			expect(secondDraft).not.toBeNull();
			expect(secondDraft?.id).toBe("DRAFT-2");
			expect(secondDraft?.title).toBe("Goodbye");
		} finally {
			await rm(testDir, { recursive: true, force: true });
		}
	});

	it("splits comma-separated and repeated assignees on draft create", async () => {
		const testDir = await createProject();
		try {
			await cli(["draft", "create", "Comma assignees", "-a", "@alice,@bob"], testDir);
			await cli(["draft", "create", "Repeated assignees", "-a", "@alice", "-a", "@bob,@carol"], testDir);

			const core = new Core(testDir);
			expect((await core.filesystem.loadDraft("draft-1"))?.assignee).toEqual(["@alice", "@bob"]);
			expect((await core.filesystem.loadDraft("draft-2"))?.assignee).toEqual(["@alice", "@bob", "@carol"]);
		} finally {
			await rm(testDir, { recursive: true, force: true });
		}
	});

	it("splits comma-separated and repeated labels on draft create", async () => {
		const testDir = await createProject();
		try {
			await cli(["draft", "create", "Comma labels", "-l", "ui,bug"], testDir);
			await cli(["draft", "create", "Repeated labels", "-l", "ui", "-l", "bug,api"], testDir);

			const core = new Core(testDir);
			expect((await core.filesystem.loadDraft("draft-1"))?.labels).toEqual(["ui", "bug"]);
			expect((await core.filesystem.loadDraft("draft-2"))?.labels).toEqual(["ui", "bug", "api"]);
		} finally {
			await rm(testDir, { recursive: true, force: true });
		}
	});

	it("applies the configured defaultAssignee to drafts created without -a", async () => {
		const testDir = await createProject();
		try {
			await cli(["config", "set", "defaultAssignee", "@alice,@bob"], testDir);
			await cli(["draft", "create", "Default assignees"], testDir);
			await cli(["draft", "create", "Explicit assignee", "-a", "@carol"], testDir);
			await cli(["draft", "create", "Explicitly unassigned", "-a", ""], testDir);

			const core = new Core(testDir);
			expect((await core.filesystem.loadDraft("draft-1"))?.assignee).toEqual(["@alice", "@bob"]);
			expect((await core.filesystem.loadDraft("draft-2"))?.assignee).toEqual(["@carol"]);
			expect((await core.filesystem.loadDraft("draft-3"))?.assignee).toEqual([]);
		} finally {
			await rm(testDir, { recursive: true, force: true });
		}
	});

	it("uses DRAFT IDs in plain output for task create --draft", async () => {
		const testDir = await createProject();
		try {
			const result = await cli(["task", "create", "--draft", "Plain sample", "--plain"], testDir);
			const output = result.stdout.toString();

			expect(output).toContain(join("draft-1", "task.md"));
			expect(output).toContain("Task DRAFT-1 - Plain sample");
			expect(output).not.toContain("Task TASK-1");
		} finally {
			await rm(testDir, { recursive: true, force: true });
		}
	});
});
