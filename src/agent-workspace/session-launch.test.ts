import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Agent } from "./agents/agent.ts";
import { agentFor, builtInAgents, registerAgent } from "./agents/agents.ts";
import { renderSessionBootstrap } from "./bootstrap.ts";
import { prepareHarnessEnvironment } from "./harness-environment.ts";
import { preflightAgentLaunch, prepareAgentAsk, prepareAgentLaunch } from "./session-launch.ts";
import { STATUS_DIR_ENV, sessionActivityDir } from "./status-hooks.ts";
import { AGENTIC_WORKSPACE_TASK_SKILL } from "./task-skill.ts";
import { usePromptInjectionAgent } from "./test-fake-agent.ts";
import type { AgentPreset, ModeProfile } from "./types.ts";

const preset: AgentPreset = { command: "opencode", bootstrap: "opencode", env: {}, prepare: "" };
const quote = (value: string) => `'${value.replaceAll("'", "'\"'\"'")}'`;

async function fakeOpenCodeV1(root: string): Promise<string> {
	const binary = join(root, "fake-opencode.ts");
	await writeFile(binary, 'if(process.argv.includes("--version")){console.log("1.19.0");process.exit(0)}');
	return `${quote(process.execPath)} ${quote(binary)}`;
}

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "agentic-workspace-launch-test-"));
	const bootstrapPath = join(root, "agent's bootstrap.md");
	await writeFile(bootstrapPath, renderSessionBootstrap({ taskId: "BACK-42" }));
	return { root, bootstrapPath };
}

describe("session-local agent launch", () => {
	it("follows adapter launch-sanitization and ask-preparation capabilities", async () => {
		const { root, bootstrapPath } = await fixture();
		const original = agentFor("claude");
		if (!original) throw new Error("Missing Claude adapter.");
		const calls: string[] = [];
		const adapter = Object.create(original) as Agent;
		adapter.sanitizeLaunchPreset = (value) => {
			calls.push("sanitize");
			return { ...value, command: "capability-sanitized" };
		};
		Object.defineProperty(adapter, "prepareBeforeAsk", { value: true });
		adapter.prepare = async () => {
			calls.push("prepare");
			return { command: "capability-prepared", env: {} };
		};
		registerAgent(adapter);
		try {
			const checked = await preflightAgentLaunch(
				{ command: "claude", bootstrap: "claude", env: {}, prepare: "" },
				bootstrapPath,
				{ cwd: root, intent: { kind: "new" } },
			);
			expect(checked.policyPreset.command).toBe("capability-sanitized");
			const ask = await prepareAgentAsk(
				{ command: "claude", bootstrap: "claude", env: {}, prepare: "" },
				"native-1",
				"question",
				undefined,
				{ repositoryRoot: root, taskRoot: root },
			);
			try {
				expect(calls).toEqual(["sanitize", "sanitize", "prepare"]);
				expect(ask.command).toContain("claude");
			} finally {
				await ask.cleanup();
			}
		} finally {
			for (const agent of builtInAgents()) registerAgent(agent);
			await rm(root, { recursive: true, force: true });
		}
	});

	it("applies current YOLO policy after profile/model preparation for registered providers", async () => {
		const { root, bootstrapPath } = await fixture();
		const openCodeCommand = await fakeOpenCodeV1(root);
		const profile = {
			name: "Plan",
			textColor: "green",
			model: { kind: "explicit" as const, id: "provider/model" },
			prompt: "snapshot prompt",
			permissions: {
				repository: "read" as const,
				task: "read-write" as const,
				artifacts: "read-write" as const,
				subagents: "allowed" as const,
			},
			artifacts: [],
			approvalArtifact: "",
		} satisfies ModeProfile;
		try {
			for (const [bootstrap, command, flag] of [
				["opencode-v1", `${openCodeCommand} --auto --model old/model`, "--auto"],
				["claude", "claude --dangerously-skip-permissions --model old/model", "--dangerously-skip-permissions"],
			] as const) {
				const preset = { command, bootstrap, env: {}, prepare: "" } as AgentPreset;
				const enabled = await prepareAgentLaunch(preset, bootstrapPath, {
					cwd: root,
					intent: { kind: "new" },
					profile,
					yolo: true,
				});
				try {
					expect(enabled.command).toContain(flag);
					expect(enabled.command).toContain("provider/model");
				} finally {
					await enabled.cleanup();
				}
				const disabled = await prepareAgentLaunch(preset, bootstrapPath, {
					cwd: root,
					intent: { kind: "new" },
					profile,
					yolo: false,
				});
				try {
					expect(disabled.command).not.toContain(flag);
					expect(disabled.command).toContain("provider/model");
				} finally {
					await disabled.cleanup();
				}
			}
			const staleClaude = await prepareAgentLaunch(
				{ command: "claude --dangerously-skip-permissions", bootstrap: "claude", env: {}, prepare: "" },
				bootstrapPath,
				{ cwd: root, intent: { kind: "new" }, yolo: false },
			);
			try {
				expect(staleClaude.command).not.toContain("--dangerously-skip-permissions");
			} finally {
				await staleClaude.cleanup();
			}
			for (const yolo of [true, false]) {
				const resumed = await prepareAgentLaunch(
					{ command: "claude --dangerously-skip-permissions", bootstrap: "claude", env: {}, prepare: "" },
					bootstrapPath,
					{ cwd: root, intent: { kind: "resume", nativeSessionId: "existing-session" }, yolo },
				);
				try {
					expect(resumed.command.includes("--dangerously-skip-permissions")).toBe(yolo);
					expect(resumed.command).toContain("existing-session");
				} finally {
					await resumed.cleanup();
				}
			}
			const pi = await prepareAgentLaunch({ command: "pi", bootstrap: "pi", env: {}, prepare: "" }, bootstrapPath, {
				cwd: root,
				intent: { kind: "new" },
				yolo: true,
			});
			try {
				expect(pi.command).not.toContain("--dangerously-skip-permissions");
				expect(pi.command).not.toContain("--auto");
			} finally {
				await pi.cleanup();
			}
			const unparsedPi = await prepareAgentLaunch(
				{ command: 'pi "unterminated', bootstrap: "pi", env: {}, prepare: "" },
				bootstrapPath,
				{ cwd: root, intent: { kind: "new" }, yolo: false },
			);
			try {
				expect(unparsedPi.command).toContain('pi "unterminated');
			} finally {
				await unparsedPi.cleanup();
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("merges process-scoped OpenCode skills without leaking task environment or changing user settings", async () => {
		const { root, bootstrapPath } = await fixture();
		const original =
			'{"model":"user/model","skills":{"paths":["/user/skills"],"urls":["https://example.test/skills"]}}';
		const configured = {
			...preset,
			bootstrap: "opencode-v1" as const,
			command: await fakeOpenCodeV1(root),
			env: {
				CUSTOM_SETTING: "keep",
				AGENTIC_WORKSPACE_CWD: "/wrong",
				AGENTIC_WORKSPACE_TASK_ID: "WRONG",
				AGENTIC_WORKSPACE_SESSION_ID: "WRONG",
				AGENTIC_WORKSPACE_PROJECT_ROOT: "/wrong",
				TASK_ID: "WRONG",
				SESSION_ID: "WRONG",
				OPENCODE_CONFIG_CONTENT: original,
			},
		};
		try {
			const launch = await prepareAgentLaunch(configured, bootstrapPath, {
				cwd: root,
				intent: { kind: "resume", nativeSessionId: "ses_existing" },
			});
			const config = JSON.parse(launch.env.OPENCODE_CONFIG_CONTENT ?? "{}");
			const skillPath = join(config.skills.paths[1], "agentic-workspace-task-management", "SKILL.md");
			try {
				expect(config.model).toBe("user/model");
				expect(config.skills.paths[0]).toBe("/user/skills");
				expect(config.skills.urls).toEqual(["https://example.test/skills"]);
				expect(skillPath.startsWith(`${root}/`)).toBe(false);
				expect(await readFile(skillPath, "utf8")).toContain(`\n${AGENTIC_WORKSPACE_TASK_SKILL}`);
				expect(launch.env.CUSTOM_SETTING).toBe("keep");
				for (const name of [
					"AGENTIC_WORKSPACE_CWD",
					"AGENTIC_WORKSPACE_TASK_ID",
					"AGENTIC_WORKSPACE_SESSION_ID",
					"AGENTIC_WORKSPACE_PROJECT_ROOT",
					"TASK_ID",
					"SESSION_ID",
				]) {
					expect(launch.env[name]).toBeUndefined();
				}
				expect(configured.env.OPENCODE_CONFIG_CONTENT).toBe(original);
				expect(launch.identity?.id).toBe("ses_existing");
			} finally {
				await launch.cleanup();
			}
			expect(existsSync(skillPath)).toBe(false);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("passes idle prompt and native Claude plugin as literal arguments, then removes the skill after process exit", async () => {
		const { root, bootstrapPath } = await fixture();
		const agentPath = join(root, "capture.ts");
		const outputPath = join(root, "capture.json");
		const marker = join(root, "shell-injection");
		const prompt = `Active task: BACK-42 $(touch ${quote(marker)}); 'quoted'.\nWait for user instructions.`;
		await writeFile(bootstrapPath, prompt);
		await writeFile(
			agentPath,
			`const args = process.argv.slice(2); const plugin = args[args.indexOf("--plugin-dir") + 1]; await Bun.write(process.env.CAPTURE!, JSON.stringify({args, cwd:process.cwd(), skill:await Bun.file(plugin + "/skills/agentic-workspace-task-management/SKILL.md").text(), env: {cwd:process.env.AGENTIC_WORKSPACE_CWD, task:process.env.AGENTIC_WORKSPACE_TASK_ID, session:process.env.AGENTIC_WORKSPACE_SESSION_ID, root:process.env.AGENTIC_WORKSPACE_PROJECT_ROOT, taskId:process.env.TASK_ID, sessionId:process.env.SESSION_ID, custom:process.env.CUSTOM_SETTING}}));`,
		);
		try {
			const launch = await prepareAgentLaunch(
				{
					...preset,
					bootstrap: "claude",
					command: `${quote(process.execPath)} ${quote(agentPath)} --existing`,
					env: { CAPTURE: outputPath, CUSTOM_SETTING: "safe ' \\$(false)" },
				},
				bootstrapPath,
				{ cwd: root, intent: { kind: "new" } },
			);
			try {
				const child = Bun.spawn(["/bin/sh", "-c", launch.command], {
					cwd: root,
					env: {
						...launch.env,
						AGENTIC_WORKSPACE_CWD: "/wrong",
						AGENTIC_WORKSPACE_TASK_ID: "inherited-wrong",
						AGENTIC_WORKSPACE_SESSION_ID: "inherited-wrong",
						AGENTIC_WORKSPACE_PROJECT_ROOT: "/wrong",
						TASK_ID: "inherited-wrong",
						SESSION_ID: "inherited-wrong",
					},
					stdout: "pipe",
					stderr: "pipe",
				});
				expect(await child.exited).toBe(0);
				const captured = JSON.parse(await readFile(outputPath, "utf8"));
				expect(captured.args[0]).toBe("--existing");
				expect(captured.args.at(-1)).toBe(prompt);
				expect(captured.args.slice(-3, -1)).toEqual(["--session-id", launch.identity?.id]);
				expect(captured.skill).toContain(AGENTIC_WORKSPACE_TASK_SKILL);
				expect(captured.env).toEqual({ custom: "safe ' $(false)" });
				expect(existsSync(marker)).toBe(false);
				expect(existsSync(captured.args[captured.args.indexOf("--plugin-dir") + 1])).toBe(false);
			} finally {
				await launch.cleanup();
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("uses resolved launch environments once and enforces the canonical path context", async () => {
		const { root, bootstrapPath } = await fixture();
		const projectDir = join(root, "project-root");
		const taskDir = join(root, "canonical-task");
		try {
			const launch = await prepareAgentLaunch(
				{ ...preset, bootstrap: "claude", command: quote(process.execPath), env: { VALUE: "$SHOULD_NOT_EXPAND" } },
				bootstrapPath,
				{
					cwd: root,
					intent: { kind: "new" },
					repositoryRoot: projectDir,
					taskRoot: taskDir,
					environment: {
						VALUE: "$SHOULD_NOT_EXPAND",
						AGENTIC_WORKSPACE_PROJECT_DIR: "/untrusted",
						AGENTIC_WORKSPACE_CWD: "/legacy",
					},
				},
			);
			try {
				expect(launch.env.VALUE).toBe("$SHOULD_NOT_EXPAND");
				expect(launch.env.AGENTIC_WORKSPACE_PROJECT_DIR).toBe(projectDir);
				expect(launch.env.AGENTIC_WORKSPACE_WORKTREE_DIR).toBe(root);
				expect(launch.env.AGENTIC_WORKSPACE_TASK_DIR).toBe(taskDir);
				expect(launch.env.AGENTIC_WORKSPACE_CWD).toBeUndefined();
			} finally {
				await launch.cleanup();
			}

			const ask = await prepareAgentAsk(
				{ ...preset, bootstrap: "claude", command: quote(process.execPath) },
				"native-ask",
				"question",
				undefined,
				{ repositoryRoot: projectDir, taskRoot: taskDir, cwd: root },
			);
			try {
				expect(ask.env.AGENTIC_WORKSPACE_PROJECT_DIR).toBe(projectDir);
				expect(ask.env.AGENTIC_WORKSPACE_WORKTREE_DIR).toBe(root);
				expect(ask.env.AGENTIC_WORKSPACE_TASK_DIR).toBe(taskDir);
				expect(ask.command).toContain("unset AGENTIC_WORKSPACE_CWD AGENTIC_WORKSPACE_TASK_ID");
			} finally {
				await ask.cleanup();
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("reuses the resolved preflight environment without expanding shell values twice", async () => {
		const { root, bootstrapPath } = await fixture();
		const counter = join(root, "expansion-count");
		const configured: AgentPreset = {
			command: "claude",
			bootstrap: "claude",
			env: { EXPANDED: `$(printf x >> ${quote(counter)}; printf once)` },
			prepare: "",
		};
		const options = { cwd: root, sessionId: "snapshot-session", intent: { kind: "new" as const } };
		try {
			const preflight = await preflightAgentLaunch(configured, bootstrapPath, options);
			const launch = await prepareAgentLaunch(
				configured,
				bootstrapPath,
				{
					...options,
					environment: {
						EXPANDED: "tampered",
						AGENTIC_WORKSPACE_PROJECT_DIR: "/untrusted",
						AGENTIC_WORKSPACE_WORKSPACE_CONTEXT: "context",
					},
				},
				preflight,
			);
			try {
				expect(launch.env.EXPANDED).toBe("once");
				expect(launch.env.AGENTIC_WORKSPACE_PROJECT_DIR).toBe(root);
				expect(launch.env.AGENTIC_WORKSPACE_WORKSPACE_CONTEXT).toBe("context");
				expect(await readFile(counter, "utf8")).toBe("x");
			} finally {
				await launch.cleanup();
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("prepares OpenCode asks with task skills and validates native sessions before running", async () => {
		const { root } = await fixture();
		const binary = join(root, "fake-opencode.ts");
		const calls = join(root, "calls.json");
		await writeFile(
			binary,
			`const args=process.argv.slice(2); const calls=process.env.CALLS!; const previous=await Bun.file(calls).json().catch(()=>[]); await Bun.write(calls, JSON.stringify([...previous,args])); if(args.includes("--version")){console.log(process.env.VERSION); process.exit(0)} if(args.includes("api")){const requested=args.at(-1)?.split("/").at(-1); console.log(JSON.stringify({data:{id:requested==="ses_v2"?"ses_v2":"ses_other"}})); process.exit(0)}`,
		);
		const profile = {
			name: "Build",
			textColor: "green",
			model: { kind: "explicit" as const, id: "provider/model" },
			prompt: "",
			permissions: {
				repository: "read" as const,
				task: "read-write" as const,
				artifacts: "read-write" as const,
				subagents: "allowed" as const,
			},
			artifacts: [],
			approvalArtifact: "",
		} satisfies ModeProfile;
		const roots = { repositoryRoot: root, taskRoot: join(root, "task"), cwd: root };
		try {
			const v1 = await prepareAgentAsk(
				{
					command: `${quote(process.execPath)} ${quote(binary)}`,
					bootstrap: "opencode-v1",
					env: { CALLS: calls, VERSION: "1.19.0" },
					prepare: "",
				},
				"v1-session",
				"question",
				profile,
				roots,
			);
			try {
				const config = JSON.parse(v1.env.OPENCODE_CONFIG_CONTENT ?? "{}");
				expect(config.skills.paths).toHaveLength(1);
				expect(
					await readFile(join(config.skills.paths[0], "agentic-workspace-task-management", "SKILL.md"), "utf8"),
				).toContain(AGENTIC_WORKSPACE_TASK_SKILL);
				expect(v1.command).toContain("provider/model");
			} finally {
				await v1.cleanup();
			}

			const v2 = await prepareAgentAsk(
				{
					command: `${quote(process.execPath)} ${quote(binary)}`,
					bootstrap: "opencode-v2",
					env: { CALLS: calls, VERSION: "2.1.0", SESSION_ID: "ses_v2" },
					prepare: "",
				},
				"ses_v2",
				"question",
				profile,
				roots,
			);
			try {
				const config = JSON.parse(v2.env.OPENCODE_CONFIG_CONTENT ?? "{}");
				expect(config.skills).toHaveLength(1);
				expect(config.model).toBe("provider/model");
				expect(
					await readFile(join(config.skills[0], "agentic-workspace-task-management", "SKILL.md"), "utf8"),
				).toContain(AGENTIC_WORKSPACE_TASK_SKILL);
			} finally {
				await v2.cleanup();
			}

			await expect(
				prepareAgentAsk(
					{
						command: `${quote(process.execPath)} ${quote(binary)}`,
						bootstrap: "opencode-v1",
						env: { CALLS: calls, VERSION: "1.19.0" },
						prepare: "",
					},
					"",
					"question",
					undefined,
					roots,
				),
			).rejects.toThrow("exact native session ID");
			await expect(
				prepareAgentAsk(
					{
						command: `${quote(process.execPath)} ${quote(binary)}`,
						bootstrap: "opencode-v2",
						env: { CALLS: calls, VERSION: "2.1.0", SESSION_ID: "ses_other" },
						prepare: "",
					},
					"ses_missing",
					"question",
					undefined,
					roots,
				),
			).rejects.toThrow("did not confirm 'ses_missing'");
			const invocations = (await Bun.file(calls).json()) as string[][];
			expect(invocations.flat()).not.toContain("run");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("warns once for reserved preset overrides and restores reserved paths after adapter preparation", async () => {
		const { root, bootstrapPath } = await fixture();
		const projectDir = join(root, "project-root");
		const taskDir = join(root, "canonical-task");
		const paths = { projectDir, worktreeDir: root, taskDir };
		const configured: AgentPreset = {
			...preset,
			bootstrap: "claude",
			command: quote(process.execPath),
			env: { AGENTIC_WORKSPACE_PROJECT_DIR: "/preset-override" },
		};
		const warnings: string[] = [];
		const stderrWrites: string[] = [];
		const stderrWrite = process.stderr.write;
		const original = agentFor("claude");
		if (!original) throw new Error("Missing Claude adapter.");
		const overridingAdapter = Object.create(original) as Agent;
		overridingAdapter.prepare = async (request) => {
			const prepared = await original.prepare(request);
			return {
				...prepared,
				env: {
					...prepared.env,
					AGENTIC_WORKSPACE_PROJECT_DIR: "/adapter-project",
					AGENTIC_WORKSPACE_WORKTREE_DIR: "/adapter-worktree",
					AGENTIC_WORKSPACE_TASK_DIR: "/adapter-task",
				},
			};
		};
		registerAgent(overridingAdapter);
		process.stderr.write = ((chunk: string | Uint8Array) => {
			stderrWrites.push(String(chunk));
			return true;
		}) as typeof process.stderr.write;
		try {
			const environment = await prepareHarnessEnvironment(configured.env, paths, {
				inherited: {},
				onWarning: (message) => {
					warnings.push(message);
					process.stderr.write(`warning: ${message}\n`);
				},
			});
			const launch = await prepareAgentLaunch(configured, bootstrapPath, {
				cwd: root,
				intent: { kind: "new" },
				repositoryRoot: projectDir,
				taskRoot: taskDir,
				environment,
			});
			try {
				expect(warnings).toHaveLength(1);
				expect(stderrWrites).toHaveLength(1);
				expect(launch.env).toMatchObject({
					AGENTIC_WORKSPACE_PROJECT_DIR: projectDir,
					AGENTIC_WORKSPACE_WORKTREE_DIR: root,
					AGENTIC_WORKSPACE_TASK_DIR: taskDir,
				});
			} finally {
				await launch.cleanup();
			}
		} finally {
			process.stderr.write = stderrWrite;
			for (const agent of builtInAgents()) registerAgent(agent);
			await rm(root, { recursive: true, force: true });
		}
	});

	it("loads a custom command's actual skill file through its explicit native loader argument", async () => {
		const { root, bootstrapPath } = await fixture();
		const output = join(root, "skill-output");
		const capture = join(root, "custom.ts");
		await writeFile(capture, "await Bun.write(process.env.OUTPUT!, await Bun.file(process.argv[2]!).text());");
		const restore = usePromptInjectionAgent("claude");
		try {
			const launch = await prepareAgentLaunch(
				{
					...preset,
					bootstrap: "claude",
					command: `${quote(process.execPath)} ${quote(capture)} {skill} {prompt}`,
					env: { OUTPUT: output },
				},
				bootstrapPath,
				{ cwd: root, intent: { kind: "new" } },
			);
			try {
				const child = Bun.spawn(["/bin/sh", "-c", launch.command], {
					cwd: root,
					env: launch.env,
					stdout: "ignore",
					stderr: "pipe",
				});
				expect(await child.exited).toBe(0);
				expect(await readFile(output, "utf8")).toContain(AGENTIC_WORKSPACE_TASK_SKILL);
			} finally {
				await launch.cleanup();
			}
		} finally {
			restore();
			await rm(root, { recursive: true, force: true });
		}
	});

	it("loads Pi's session-local skill without changing project or user configuration", async () => {
		const { root, bootstrapPath } = await fixture();
		const output = join(root, "pi-output.json");
		const capture = join(root, "pi-capture.ts");
		await writeFile(
			capture,
			`const args = process.argv.slice(2); const skill = args[args.indexOf("--skill") + 1]; await Bun.write(process.env.OUTPUT!, JSON.stringify({ args, skill: await Bun.file(skill).text() }));`,
		);
		try {
			const launch = await prepareAgentLaunch(
				{
					...preset,
					bootstrap: "pi",
					command: `${quote(process.execPath)} ${quote(capture)} --existing`,
					env: { OUTPUT: output },
				},
				bootstrapPath,
				{ cwd: root, intent: { kind: "new" }, sessionId: "sess-pi" },
			);
			try {
				const child = Bun.spawn(["/bin/sh", "-c", launch.command], {
					cwd: root,
					env: launch.env,
					stdout: "ignore",
					stderr: "pipe",
				});
				expect(await child.exited).toBe(0);
				const captured = JSON.parse(await readFile(output, "utf8"));
				expect(captured.args.slice(0, 3)).toEqual(["--existing", "--skill", expect.any(String)]);
				// The process-scoped status extension is appended beside the skill, before the session id.
				expect(captured.args[3]).toBe("--extension");
				expect(captured.args[4]).toMatch(/agentic-workspace-status-extension\.ts$/);
				expect(captured.args.slice(5)).toEqual([
					"--session-id",
					launch.identity?.id,
					"Active task: BACK-42.\nWait for user instructions.",
				]);
				expect(captured.skill).toContain(AGENTIC_WORKSPACE_TASK_SKILL);
			} finally {
				await launch.cleanup();
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("reports missing skill loaders instead of silently injecting workflow text", async () => {
		const restore = usePromptInjectionAgent("claude");
		try {
			await expect(
				prepareAgentLaunch({ ...preset, bootstrap: "claude", command: "agent {prompt}" }, "/missing", {
					cwd: tmpdir(),
					intent: { kind: "new" },
				}),
			).rejects.toThrow("{skill}");
			await expect(
				prepareAgentLaunch({ ...preset, bootstrap: "claude", command: "agent {skill}" }, "/missing", {
					cwd: tmpdir(),
					intent: { kind: "new" },
				}),
			).rejects.toThrow("{prompt} or {instructions}");
		} finally {
			restore();
		}
		await expect(
			prepareAgentLaunch({ ...preset, bootstrap: "opencode-v1" }, "/missing", {
				cwd: tmpdir(),
				intent: { kind: "resume", nativeSessionId: "" },
			}),
		).rejects.toThrow("exact native session ID");
	});

	it("installs a process-scoped Claude status hook inside the owned plugin dir", async () => {
		const { root, bootstrapPath } = await fixture();
		try {
			const launch = await prepareAgentLaunch(
				{ ...preset, bootstrap: "claude", command: `${quote(process.execPath)}` },
				bootstrapPath,
				{ cwd: root, intent: { kind: "new" }, sessionId: "sess-1" },
			);
			try {
				const statusDir = launch.env[STATUS_DIR_ENV];
				if (!statusDir) throw new Error("Claude launch is missing its owned status dir.");
				// The sidecar is the deterministic per-session path; the hook file sits in the temp
				// plugin dir that --plugin-dir exposes.
				expect(statusDir).toBe(sessionActivityDir(root, "sess-1"));
				const pluginDir = launch.command.match(/(\/\S*agentic-workspace-agent-skill-[A-Za-z0-9]+)/)?.[1] ?? "";
				expect(launch.resources?.skill.path).toBe(await realpath(pluginDir));
				expect(launch.resources?.activity?.path).toBe(await realpath(statusDir));
				expect(await readFile(join(pluginDir, ".agentic-workspace-launch-owner"), "utf8")).toBe(
					launch.resources?.skill.marker ?? "",
				);
				const hooksPath = join(pluginDir, "hooks", "hooks.json");
				expect(existsSync(hooksPath)).toBe(true);
				const config = JSON.parse(await readFile(hooksPath, "utf8")) as {
					hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
				};
				const command = config.hooks.UserPromptSubmit?.[0]?.hooks[0]?.command ?? "";
				expect(command).toContain(statusDir);
				// Running the generated command writes only the owned sidecar, then exits zero.
				const run = spawnSync("/bin/sh", ["-c", command], { encoding: "utf8" });
				expect(run.status).toBe(0);
				expect((await readFile(join(statusDir, "status"), "utf8")).trim()).toBe("running");
				// No stray hooks dir in the project root; the plugin dir is the owned temp dir.
				expect(existsSync(join(root, "hooks"))).toBe(false);
			} finally {
				await launch.cleanup();
			}
			// Cleanup removes the deterministic sidecar with the launch.
			expect(existsSync(launch.env[STATUS_DIR_ENV] ?? "")).toBe(false);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("points OpenCode at an owned config dir with a process-scoped status plugin", async () => {
		const { root, bootstrapPath } = await fixture();
		try {
			const launch = await prepareAgentLaunch(
				{ ...preset, bootstrap: "opencode-v1", command: await fakeOpenCodeV1(root) },
				bootstrapPath,
				{
					cwd: root,
					intent: { kind: "new" },
					sessionId: "sess-1",
				},
			);
			try {
				const configDir = launch.env.OPENCODE_CONFIG_DIR;
				if (!configDir) throw new Error("OpenCode launch is missing its owned config dir.");
				expect(existsSync(join(configDir, "plugins", "agentic-workspace-status.ts"))).toBe(true);
				expect(launch.env[STATUS_DIR_ENV]).toBe(sessionActivityDir(root, "sess-1"));
				// The user's original inline config (skills) is preserved, not replaced.
				expect(JSON.parse(launch.env.OPENCODE_CONFIG_CONTENT ?? "{}").skills.paths).toHaveLength(1);
			} finally {
				await launch.cleanup();
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("loads Pi's process-scoped status extension from the owned temp dir", async () => {
		const { root, bootstrapPath } = await fixture();
		try {
			const launch = await prepareAgentLaunch({ ...preset, bootstrap: "pi" }, bootstrapPath, {
				cwd: root,
				intent: { kind: "new" },
				sessionId: "sess-1",
			});
			try {
				const match = launch.command.match(/(\/\S*agentic-workspace-status-extension\.ts)/);
				expect(match?.[1]).toBeString();
				expect(existsSync(match?.[1] ?? "")).toBe(true);
				expect(launch.env[STATUS_DIR_ENV]).toBe(sessionActivityDir(root, "sess-1"));
			} finally {
				await launch.cleanup();
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("installs identical hook artefacts for every launch path through the chokepoint", async () => {
		const { root, bootstrapPath } = await fixture();
		const openCodeCommand = await fakeOpenCodeV1(root);
		try {
			// The workspace native prepare, CLI `agent-session start`, and CLI resume all funnel through
			// this one function, so each must yield the same owned status dir, hook file, and argv.
			const claudePaths = [
				{ cwd: root, intent: { kind: "new" as const }, sessionId: "s-1" },
				{ cwd: root, intent: { kind: "new" as const }, sessionId: "s-2" },
				{ cwd: root, intent: { kind: "resume" as const, nativeSessionId: "n-3" }, sessionId: "s-3" },
			];
			for (const options of claudePaths) {
				const launch = await prepareAgentLaunch(
					{ ...preset, bootstrap: "claude", command: quote(process.execPath) },
					bootstrapPath,
					options,
				);
				try {
					const statusDir = launch.env[STATUS_DIR_ENV];
					expect(statusDir).toBeString();
					expect(statusDir?.endsWith(".activity")).toBe(true);
					const pluginDir = launch.command.match(/(\/\S*agentic-workspace-agent-skill-[A-Za-z0-9]+)/)?.[1] ?? "";
					expect(existsSync(join(pluginDir, "hooks", "hooks.json"))).toBe(true);
				} finally {
					await launch.cleanup();
				}
			}
			const pi = await prepareAgentLaunch({ ...preset, bootstrap: "pi" }, bootstrapPath, {
				cwd: root,
				intent: { kind: "new" },
				sessionId: "s-1",
			});
			try {
				expect(pi.env[STATUS_DIR_ENV]).toBeString();
				expect(pi.command).toContain("--extension");
			} finally {
				await pi.cleanup();
			}
			const opencode = await prepareAgentLaunch(
				{ ...preset, bootstrap: "opencode-v1", command: openCodeCommand },
				bootstrapPath,
				{
					cwd: root,
					intent: { kind: "new" },
					sessionId: "s-1",
				},
			);
			try {
				expect(opencode.env[STATUS_DIR_ENV]).toBeString();
				expect(opencode.env.OPENCODE_CONFIG_DIR).toBeString();
			} finally {
				await opencode.cleanup();
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
