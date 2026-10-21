import { describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareHarnessEnvironment } from "./harness-environment.ts";

const paths = (directory: string) => ({
	projectDir: join(directory, "project"),
	worktreeDir: directory,
	taskDir: join(directory, "task"),
});

describe("prepareHarnessEnvironment", () => {
	it("substitutes only workspace paths and preserves other literal values", async () => {
		const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-harness-env-"));
		const marker = join(directory, "must-not-exist");
		const inherited = { BASE: "inherited value", PATH: "/parent/bin" };
		const originalInherited = { ...inherited };
		try {
			const result = await prepareHarnessEnvironment(
				{
					PATH: "/configured/bin",
					PATHS: "$AGENTIC_WORKSPACE_PROJECT_DIR|${AGENTIC_WORKSPACE_WORKTREE_DIR}|$AGENTIC_WORKSPACE_TASK_DIR",
					EMPTY: "",
					LITERAL: " spaces 'single' \"double\"\nsecond line\n",
					DOLLAR: "\\$BASE",
					COMMAND_TEXT: `; touch ${marker}`,
				},
				paths(directory),
				{ inherited },
			);
			expect(result).toMatchObject({
				PATH: "/configured/bin",
				PATHS: `${join(directory, "project")}|${directory}|${join(directory, "task")}`,
				EMPTY: "",
				LITERAL: " spaces 'single' \"double\"\nsecond line\n",
				DOLLAR: "$BASE",
				COMMAND_TEXT: `; touch ${marker}`,
				AGENTIC_WORKSPACE_PROJECT_DIR: join(directory, "project"),
				AGENTIC_WORKSPACE_WORKTREE_DIR: directory,
				AGENTIC_WORKSPACE_TASK_DIR: join(directory, "task"),
			});
			expect(await Bun.file(marker).exists()).toBe(false);
			expect(inherited).toEqual(originalInherited);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("rejects arbitrary environment references and shell substitutions without executing them", async () => {
		const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-harness-env-ref-"));
		const marker = join(directory, "must-not-exist");
		try {
			for (const value of ["$PATH", "${HOME}", `$(touch ${marker})`]) {
				await expect(prepareHarnessEnvironment({ VALUE: value }, paths(directory), { inherited: {} })).rejects.toThrow(
					"may reference only workspace paths",
				);
			}
			expect(await Bun.file(marker).exists()).toBe(false);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("rejects preset attempts to override each reserved workspace path", async () => {
		const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-harness-env-reserved-"));
		try {
			for (const name of [
				"AGENTIC_WORKSPACE_PROJECT_DIR",
				"AGENTIC_WORKSPACE_WORKTREE_DIR",
				"AGENTIC_WORKSPACE_TASK_DIR",
			]) {
				await expect(
					prepareHarnessEnvironment({ [name]: "/preset-override" }, paths(directory), { inherited: {} }),
				).rejects.toThrow(`cannot override reserved workspace path ${name}`);
			}
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("merges the selected preparation environment and applies canonical paths last", async () => {
		const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-harness-env-child-"));
		try {
			const result = await prepareHarnessEnvironment(
				{ AGENTIC_WORKSPACE_TASK_ID: "preset-task", VALUE: "$AGENTIC_WORKSPACE_TASK_DIR" },
				paths(directory),
				{
					inherited: { KEEP: "inherited" },
					childEnv: {
						AGENTIC_WORKSPACE_TASK_ID: "selected-task",
						AGENTIC_WORKSPACE_PROJECT_DIR: "/child-override",
					},
				},
			);
			expect(result).toMatchObject({
				KEEP: "inherited",
				AGENTIC_WORKSPACE_TASK_ID: "selected-task",
				AGENTIC_WORKSPACE_PROJECT_DIR: join(directory, "project"),
				VALUE: join(directory, "task"),
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
