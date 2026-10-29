import { describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Core } from "../index.ts";
import { runInProcessCli } from "./in-process-cli.ts";
import { initializeFilesystemTestProject } from "./test-utils.ts";

describe("runInProcessCli", () => {
	it("preserves quotes and newlines in a single public CLI argument", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "in-process-cli-"));
		try {
			const core = new Core(cwd);
			await initializeFilesystemTestProject(core, "In-process CLI");
			const title = "A 'quoted' title";
			const description = "line one\nline two";
			const created = await runInProcessCli(["task", "create", title, "--description", description], { cwd });
			expect(created.exitCode).toBe(0);
			expect(created.stdout).toContain("Created task TASK-1");
			const viewed = await runInProcessCli(["task", "view", "TASK-1", "--plain"], { cwd });
			expect(viewed.exitCode).toBe(0);
			expect(viewed.stdout).toContain(title);
			expect(viewed.stdout).toContain(description);
			const cleared = await runInProcessCli(["task", "edit", "TASK-1", "--description", ""], { cwd });
			expect(cleared.exitCode).toBe(0);
			expect((await core.tasks.getTask("TASK-1"))?.description).toBeUndefined();
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});

	it("keeps concurrent outputs separate and continues after an invalid command", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "in-process-cli-"));
		try {
			const core = new Core(cwd);
			await initializeFilesystemTestProject(core, "In-process CLI queue");
			for (const title of ["Alpha queued search", "Beta queued search"]) {
				await core.tasks.create({ title, status: "To Do" });
			}

			const invalid = await runInProcessCli(["definitely-not-a-command"], { cwd });
			expect(invalid.exitCode).toBe(1);
			expect(invalid.stderr).toContain("definitely-not-a-command");
			const help = await runInProcessCli(["--help"], { cwd });
			expect(help.exitCode).toBe(0);
			expect(help.stdout).toContain("Usage:");
			expect(help.stdout).not.toContain("definitely-not-a-command");

			const [alpha, beta] = await Promise.all([
				runInProcessCli(["search", "Alpha", "--plain"], { cwd }),
				runInProcessCli(["search", "Beta", "--plain"], { cwd }),
			]);
			expect(alpha.exitCode).toBe(0);
			expect(alpha.stdout).toContain("Alpha queued search");
			expect(alpha.stdout).not.toContain("Beta queued search");
			expect(beta.exitCode).toBe(0);
			expect(beta.stdout).toContain("Beta queued search");
			expect(beta.stdout).not.toContain("Alpha queued search");
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});
});
