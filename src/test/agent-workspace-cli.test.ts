import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { BunRunner } from "../agent-workspace/session-process.ts";
import { SessionStore } from "../agent-workspace/session-store.ts";
import { getTestCliCommand } from "./test-cli.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";
import { killTmuxServer, uniqueTmuxSocket } from "./tmux-test-server.ts";

let testDir: string;
let configHome: string;
const cli = getTestCliCommand();

async function fakeOpenCode(): Promise<string> {
	const command = join(testDir, "opencode");
	await writeFile(
		command,
		`#!/bin/sh
case "$1" in
  --version) printf '%s\\n' 'opencode v2.0.26' ;;
  models) printf '%s\\n' 'provider/test-model' 'provider/current-model' ;;
  session) printf '%s\\n' '{"info":{"id":"native-opencode-id"},"messages":[{"type":"assistant","model":{"providerID":"provider","id":"current-model"}}]}' ;;
esac
`,
	);
	await chmod(command, 0o700);
	return command;
}

describe("agent workspace CLI", () => {
	beforeEach(async () => {
		testDir = createUniqueTestDir("agent-workspace-cli");
		configHome = join(testDir, "config");
		await mkdir(testDir, { recursive: true });
	});

	afterEach(async () => {
		await safeCleanup(testDir);
	});

	it("copies the effective parent into a scope and edits only the selected built-in preset", async () => {
		const env = { ...process.env, XDG_CONFIG_HOME: configHome };
		await $`${cli} agent-config set root --preset opencode --env ${"TOKEN=secret"} --resume-flag ${"--resume"}`
			.cwd(testDir)
			.env(env)
			.quiet();
		await $`${cli} init Workspace --defaults --integration-mode none --no-git`.cwd(testDir).env(env).quiet();
		await $`${cli} agent-config set project --preset claude`.cwd(testDir).env(env).quiet();
		const config = JSON.parse(await $`${cli} agent-config show project`.cwd(testDir).env(env).text());

		expect(config.selectedPreset).toBe("claude");
		expect(config.presets.opencode).toMatchObject({
			command: "opencode",
			env: { TOKEN: "secret" },
			resumeFlag: "--resume",
		});
		expect(config.presets.claude).toBeDefined();
		expect(config.presets.pi).toBeDefined();
	});

	it("no longer registers agent-config create for custom presets", async () => {
		await $`${cli} init Workspace --defaults --integration-mode none --no-git`.cwd(testDir).quiet();
		const env = { ...process.env, XDG_CONFIG_HOME: configHome };
		const result = await $`${cli} agent-config create root --preset custom --command ${"custom-agent {prompt}"}`
			.cwd(testDir)
			.env(env)
			.nothrow()
			.quiet();
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr.toString()).toMatch(/unknown command/i);
		// The rejected command persisted nothing at root scope.
		expect(await $`${cli} agent-config show root`.cwd(testDir).env(env).text()).toBe("null\n");
	});

	it("stores session settings at card scope so a task can override the project", async () => {
		await $`${cli} init Workspace --defaults --integration-mode none --no-git`.cwd(testDir).quiet();
		const env = { ...process.env, XDG_CONFIG_HOME: configHome };
		const created = await $`${cli} task create "Card session task"`.cwd(testDir).quiet();
		const taskId = (await created.text()).match(/\b([A-Z][A-Z0-9]*-\d+)\b/)?.[1] as string;

		await $`${cli} agent-config set card --task ${taskId} --worktree-per-task true --yolo true --auto-resume-on-restart false`
			.cwd(testDir)
			.env(env)
			.quiet();

		const config = JSON.parse(await $`${cli} agent-config show card --task ${taskId}`.cwd(testDir).env(env).text());
		expect(config.sessions).toEqual({ worktreePerTask: true, yoloMode: true, autoResumeOnRestart: false });
	});

	it("allows root configuration outside an initialized project", async () => {
		const outside = join(testDir, "outside");
		await mkdir(outside);
		const result = await $`${cli} agent-config show root`
			.cwd(outside)
			.env({ ...process.env, XDG_CONFIG_HOME: configHome })
			.text();

		expect(result).toBe("null\n");
	});

	it("sets an explicitly targeted mode without workspace context and rejects invalid inputs without writes", async () => {
		await $`${cli} init Workspace --defaults --integration-mode none --no-git`.cwd(testDir).quiet();
		const env = { ...process.env, XDG_CONFIG_HOME: configHome };
		await $`${cli} agent-config set project --preset claude`.cwd(testDir).env(env).quiet();
		const initialConfig = JSON.parse(await $`${cli} agent-config show project`.cwd(testDir).env(env).text());
		const set = await $`${cli} agent-config model set ${"provider/test-model"} --mode PLAN`
			.cwd(testDir)
			.env(env)
			.text();
		expect(JSON.parse(set)).toMatchObject({
			mode: "plan",
			newModel: "provider/test-model",
			appliesTo: "new sessions only",
		});
		const updatedConfig = JSON.parse(await $`${cli} agent-config show project`.cwd(testDir).env(env).text());
		expect(updatedConfig).toEqual({
			...initialConfig,
			modes: {
				...initialConfig.modes,
				profiles: {
					...initialConfig.modes.profiles,
					plan: { ...initialConfig.modes.profiles.plan, model: { kind: "explicit", id: "provider/test-model" } },
				},
			},
		});
		const before = await $`${cli} agent-config show project`.cwd(testDir).env(env).text();

		const invalidModel = await $`${cli} agent-config model set ${"bad model"} --mode PLAN`
			.cwd(testDir)
			.env(env)
			.nothrow()
			.quiet();
		expect(invalidModel.exitCode).not.toBe(0);
		const invalidMode = await $`${cli} agent-config model set ${"provider/other"} --mode MISSING`
			.cwd(testDir)
			.env(env)
			.nothrow()
			.quiet();
		expect(invalidMode.exitCode).not.toBe(0);
		const noContext = await $`${cli} agent-config model set ${"provider/other"}`
			.cwd(testDir)
			.env(env)
			.nothrow()
			.quiet();
		expect(noContext.exitCode).not.toBe(0);
		expect(await $`${cli} agent-config show project`.cwd(testDir).env(env).text()).toBe(before);
		expect(
			JSON.parse(await $`${cli} agent-config show project`.cwd(testDir).env(env).text()).modes.profiles.plan.model,
		).toEqual({ kind: "explicit", id: "provider/test-model" });
		await $`${cli} agent-config set project --command ${"claude; invalid"}`.cwd(testDir).env(env).quiet();
		const beforeInvalidCommand = await $`${cli} agent-config show project`.cwd(testDir).env(env).text();
		const invalidCommand = await $`${cli} agent-config model set ${"provider/other"} --mode PLAN`
			.cwd(testDir)
			.env(env)
			.nothrow()
			.quiet();
		expect(invalidCommand.exitCode).not.toBe(0);
		expect(await $`${cli} agent-config show project`.cwd(testDir).env(env).text()).toBe(beforeInvalidCommand);
	});

	it("saves an explicit OpenCode model without invoking discovery", async () => {
		await $`${cli} init Workspace --defaults --integration-mode none --no-git`.cwd(testDir).quiet();
		const env = { ...process.env, XDG_CONFIG_HOME: configHome };
		const command = join(testDir, "opencode-no-discovery");
		await writeFile(command, '#!/bin/sh\nprintf "unexpected model discovery: %s\\n" "$*" >&2\nexit 37\n');
		await chmod(command, 0o700);
		await $`${cli} agent-config set project --preset opencode --command ${command}`.cwd(testDir).env(env).quiet();

		const set = await $`${cli} agent-config model set ${"provider/test-model"} --mode PLAN`
			.cwd(testDir)
			.env(env)
			.text();
		expect(JSON.parse(set)).toMatchObject({ mode: "plan", newModel: "provider/test-model" });
		const config = JSON.parse(await $`${cli} agent-config show project`.cwd(testDir).env(env).text());
		expect(config.selectedPreset).toBe("opencode");
		expect(config.presets.opencode).toMatchObject({ command, bootstrap: "opencode" });
		expect(config.presets).not.toHaveProperty("opencode-v2");
	});

	it("uses a saved v2 session export for --current while retaining the public OpenCode preset", async () => {
		await $`${cli} init Workspace --defaults --integration-mode none --no-git`.cwd(testDir).quiet();
		const env = { ...process.env, XDG_CONFIG_HOME: configHome };
		const command = await fakeOpenCode();
		await $`${cli} agent-config set project --preset opencode --command ${command}`.cwd(testDir).env(env).quiet();
		const created = await $`${cli} task create "Current model task"`.cwd(testDir).env(env).quiet();
		const taskId = (await created.text()).match(/\b([A-Z][A-Z0-9]*-\d+)\b/)?.[1] as string;
		const sessionId = randomUUID();
		const store = new SessionStore(testDir, new BunRunner());
		const { taskDir } = await store.paths(taskId);
		await store.mutateMode(taskId, "plan", async (state) => {
			state.sessions.push({
				id: sessionId,
				taskId,
				preset: "opencode",
				tmuxName: `backlog-current-${sessionId.slice(0, 8)}`,
				nativeSessionId: "native-opencode-id",
				cwd: testDir,
				createdAt: new Date().toISOString(),
				status: "stopped",
				outputPath: join(taskDir, `${sessionId}.log`),
				bootstrapPath: join(taskDir, `${sessionId}.md`),
			});
		});
		const tmuxName = `backlog-current-${sessionId.slice(0, 8)}`;
		const tmuxSocket = uniqueTmuxSocket("agent-workspace-cli");
		await $`tmux -f /dev/null -L ${tmuxSocket} new-session -d -s ${tmuxName} sleep 30`.quiet();
		try {
			const paneId = (
				await $`tmux -f /dev/null -L ${tmuxSocket} display-message -p -t ${tmuxName} ${"#{pane_id}"}`.text()
			).trim();
			await $`tmux -f /dev/null -L ${tmuxSocket} set-option -p -t ${paneId} @backlog_root ${testDir}`.quiet();
			await $`tmux -f /dev/null -L ${tmuxSocket} set-option -p -t ${paneId} @backlog_task ${taskId}`.quiet();
			await $`tmux -f /dev/null -L ${tmuxSocket} set-option -p -t ${paneId} @backlog_session ${sessionId}`.quiet();
			const savedSession = (await store.read(taskId)).modes?.plan?.sessions.find((session) => session.id === sessionId);
			if (!savedSession) throw new Error("Expected seeded session in durable history.");
			const context = JSON.stringify({
				v: 2,
				paneId,
				rootDir: testDir,
				conversation: { taskId: savedSession.taskId, modeId: "plan", sessionId: savedSession.id },
				nativeSessionId: savedSession.nativeSessionId,
			});
			const result = await $`${cli} agent-config model set --current`
				.cwd(testDir)
				.env({ ...env, BACKLOG_TMUX_SOCKET: tmuxSocket, BACKLOG_WORKSPACE_CONTEXT: context })
				.text();
			expect(JSON.parse(result)).toMatchObject({ newModel: "provider/current-model" });
			const config = JSON.parse(await $`${cli} agent-config show project`.cwd(testDir).env(env).text());
			expect(config.presets.opencode).toMatchObject({ command, bootstrap: "opencode" });
		} finally {
			await killTmuxServer(tmuxSocket);
		}
	});

	it("accepts slashless native model IDs and preserves them exactly", async () => {
		await $`${cli} init Workspace --defaults --integration-mode none --no-git`.cwd(testDir).quiet();
		const env = { ...process.env, XDG_CONFIG_HOME: configHome };
		await $`${cli} agent-config set project --preset claude`.cwd(testDir).env(env).quiet();
		const set = await $`${cli} agent-config model set ${"native-model_id"} --mode PLAN`.cwd(testDir).env(env).text();
		expect(JSON.parse(set)).toMatchObject({ newModel: "native-model_id" });
		expect(
			JSON.parse(await $`${cli} agent-config show project`.cwd(testDir).env(env).text()).modes.profiles.plan.model,
		).toEqual({ kind: "explicit", id: "native-model_id" });
	});

	it("shows focused model command help", async () => {
		const help = await $`${cli} agent-config model --help`.cwd(testDir).text();
		expect(help).toContain("set");
		const setHelp = await $`${cli} agent-config model set --help`.cwd(testDir).text();
		expect(setHelp).toContain("--current");
		expect(setHelp).toContain("--mode");
	});

	it("deletes a stopped session record and its saved files end-to-end", async () => {
		await $`${cli} init Workspace --defaults --integration-mode none --no-git`.cwd(testDir).quiet();
		const created = await $`${cli} task create "Seeded task"`.cwd(testDir).quiet();
		const match = (await created.text()).match(/\b([A-Z][A-Z0-9]*-\d+)\b/);
		expect(match).not.toBeNull();
		const taskId = match?.[1] as string;

		const store = new SessionStore(testDir, new BunRunner());
		const { taskDir } = await store.paths(taskId);
		const sessionId = randomUUID();
		const outputPath = join(taskDir, `${sessionId}.log`);
		const bootstrapPath = join(taskDir, `${sessionId}.md`);
		await Bun.write(outputPath, "saved session output\n");
		await Bun.write(bootstrapPath, "# session bootstrap\n");
		await store.mutateMode(taskId, "plan", async (state) => {
			state.sessions.push({
				id: sessionId,
				taskId,
				preset: "opencode",
				tmuxName: `backlog-${taskId.toLowerCase()}-${sessionId.slice(0, 8)}`,
				cwd: testDir,
				createdAt: new Date().toISOString(),
				status: "stopped",
				outputPath,
				bootstrapPath,
			});
		});

		const before = await $`${cli} agent-session list ${taskId}`.cwd(testDir).text();
		expect(before).toContain(sessionId);

		const result = await $`${cli} agent-session delete ${taskId} --session ${sessionId}`.cwd(testDir).nothrow().quiet();
		expect(result.exitCode).toBe(0);
		expect(await $`${cli} agent-session list ${taskId}`.cwd(testDir).text()).not.toContain(sessionId);
		expect(await Bun.file(outputPath).exists()).toBe(false);
		expect(await Bun.file(bootstrapPath).exists()).toBe(false);

		const help = await $`${cli} agent-session --help`.cwd(testDir).text();
		expect(help).toContain("delete");
	});

	it("asks the previous session and prints its answer end-to-end", async () => {
		await $`${cli} init Workspace --defaults --integration-mode none --no-git`.cwd(testDir).quiet();
		await $`${cli} agent-config set project --preset claude --command echo --bootstrap claude`.cwd(testDir).quiet();
		const created = await $`${cli} task create "Seeded task"`.cwd(testDir).quiet();
		const taskId = (await created.text()).match(/\b([A-Z][A-Z0-9]*-\d+)\b/)?.[1] as string;

		const store = new SessionStore(testDir, new BunRunner());
		const { taskDir } = await store.paths(taskId);
		const sessionId = randomUUID();
		await store.mutateMode(taskId, "plan", async (state) => {
			state.sessions.push({
				id: sessionId,
				taskId,
				preset: "claude",
				tmuxName: `backlog-${taskId.toLowerCase()}-${sessionId.slice(0, 8)}`,
				nativeSessionId: "native-1",
				cwd: testDir,
				createdAt: new Date().toISOString(),
				status: "stopped",
				outputPath: join(taskDir, `${sessionId}.log`),
				bootstrapPath: join(taskDir, `${sessionId}.md`),
			});
		});

		const question = "what is the status?";
		const result = await $`${cli} agent-session ask ${taskId} ${question}`.cwd(testDir).nothrow().quiet();
		expect(result.exitCode).toBe(0);
		const stdout = result.stdout.toString();
		expect(stdout).toContain("-p --resume native-1");
		expect(stdout).not.toContain("--dangerously-skip-permissions");
		expect(stdout).toContain("Repository access: read;");
		expect(stdout).toContain("Profile instructions:");
		expect(stdout).toContain("User request:");
		expect(stdout).toContain(question);

		const help = await $`${cli} agent-session --help`.cwd(testDir).text();
		expect(help).toContain("ask");
	});
});
