import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareHarnessEnvironment } from "../../runtime/harness-environment.ts";
import { prepareAgentLaunch } from "../../runtime/session-launch.ts";
import { getDefaultModeCatalog } from "../../storage/config.ts";

describe("runtime launch environment and permission flags", () => {
	it("preserves inherited variables and injects child identity after preset values", async () => {
		const root = await mkdtemp(join(tmpdir(), "agentic-workspace-env-policy-"));
		try {
			const paths = { projectDir: join(root, "project"), worktreeDir: root, taskDir: join(root, "task") };
			const inherited = {
				PATH: "/parent/bin",
				CUSTOM_SECRET: "preserve-me",
				AGENTIC_WORKSPACE_CWD: "/parent/cwd",
				AGENTIC_WORKSPACE_TASK_ID: "parent-task",
				AGENTIC_WORKSPACE_TMUX_SOCKET: "parent-socket",
			};
			const env = await prepareHarnessEnvironment(
				{
					CUSTOM_PRESET: "preset-value",
					AGENTIC_WORKSPACE_CWD: "/preset/cwd",
					AGENTIC_WORKSPACE_TASK_ID: "/preset/task",
					AGENTIC_WORKSPACE_TMUX_SOCKET: "preset-socket",
				},
				paths,
				{
					inherited,
					childEnv: {
						AGENTIC_WORKSPACE_CWD: root,
						AGENTIC_WORKSPACE_TASK_ID: "child-task",
						AGENTIC_WORKSPACE_SESSION_ID: "child-session",
						AGENTIC_WORKSPACE_TMUX_SOCKET: "selected-socket",
					},
				},
			);
			expect(env).toMatchObject({
				PATH: "/parent/bin",
				CUSTOM_SECRET: "preserve-me",
				CUSTOM_PRESET: "preset-value",
				AGENTIC_WORKSPACE_PROJECT_DIR: paths.projectDir,
				AGENTIC_WORKSPACE_WORKTREE_DIR: paths.worktreeDir,
				AGENTIC_WORKSPACE_TASK_DIR: paths.taskDir,
				AGENTIC_WORKSPACE_CWD: root,
				AGENTIC_WORKSPACE_TASK_ID: "child-task",
				AGENTIC_WORKSPACE_SESSION_ID: "child-session",
				AGENTIC_WORKSPACE_TMUX_SOCKET: "selected-socket",
			});
			expect(inherited).toEqual({
				PATH: "/parent/bin",
				CUSTOM_SECRET: "preserve-me",
				AGENTIC_WORKSPACE_CWD: "/parent/cwd",
				AGENTIC_WORKSPACE_TASK_ID: "parent-task",
				AGENTIC_WORKSPACE_TMUX_SOCKET: "parent-socket",
			});
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("keeps explicit preset permission bypass separate from YOLO", async () => {
		const root = await mkdtemp(join(tmpdir(), "agentic-workspace-permission-flags-"));
		const bootstrap = join(root, "bootstrap.md");
		await writeFile(bootstrap, "prompt");
		const profile = getDefaultModeCatalog().profiles.build;
		if (!profile) throw new Error("Missing default build mode profile.");
		try {
			const preset = {
				command: ["claude", "--dangerously-skip-permissions"],
				bootstrap: "claude" as const,
				env: {},
				prepare: "",
			};
			for (const [yolo, count] of [
				[false, 1],
				[true, 2],
			] as const) {
				const launch = await prepareAgentLaunch(preset, bootstrap, {
					cwd: root,
					intent: { kind: "new" },
					profile,
					yolo,
				});
				try {
					expect(launch.command.match(/--dangerously-skip-permissions/g) ?? []).toHaveLength(count);
				} finally {
					await launch.cleanup();
				}
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
