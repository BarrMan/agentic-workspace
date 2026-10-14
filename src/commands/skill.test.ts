import { expect, it } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AGENTIC_WORKSPACE_TASK_SKILL } from "../agent-workspace/task-skill.ts";
import { getTestCliCommand } from "../test/test-cli.ts";

it("prints only the AgenticWorkspace skill from an uninitialized directory without installing anything", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "agentic-workspace-skill-cli-"));
	try {
		const child = Bun.spawn([...getTestCliCommand(), "skill"], {
			cwd,
			stdout: "pipe",
			stderr: "pipe",
		});
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		expect(exitCode).toBe(0);
		expect(stderr).toBe("");
		expect(stdout).toBe(AGENTIC_WORKSPACE_TASK_SKILL);
		expect(stdout).toContain("Keep task work grounded in its canonical artifacts:");
		expect(stdout).toContain("Use canonical task artifact paths; do not invent alternate locations.");
		expect(stdout).toContain("Maintain task status as `In Progress`");
		expect(await readdir(cwd)).toEqual([]);
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
});
