import { describe, expect, it } from "bun:test";
import { access, chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "./agents/core/agents.ts";
import type { AgentSession, SessionLaunchContext } from "../model/session/types.ts";
import { claudeHooksConfig } from "./agents/claude/claude.ts";
import { OpencodeV1Agent } from "./agents/opencode/opencode-v1.ts";
import { harnessRegistry } from "./agents/startup.ts";
import { Harness, PROVIDER_READINESS_DEADLINE_MS } from "./harness.ts";
import { sessionActivityDir } from "./status-hooks.ts";
import { WORKSPACE_CONTEXT_ENV } from "./workspace-context.ts";

type Omitted = "initialized" | "prompt-accepted";

async function invoke(command: string, input: string): Promise<void> {
	const child = Bun.spawn(["/bin/sh", "-c", command], { stdin: "pipe", stdout: "ignore", stderr: "ignore" });
	child.stdin.write(input);
	child.stdin.end();
	await child.exited;
}

async function fixture(omit?: Omitted, resume = false) {
	const root = await mkdtemp(join(tmpdir(), "harness-readiness-test-"));
	const emitted = {
		launchDirectory: "",
		promptSubmissions: 0,
		launchEnvironment: {} as Record<string, string>,
		order: [] as string[],
	};
	const state = { killCalls: 0, capturedPaneIds: [] as string[], failKill: false };
	const record: AgentSession = {
		id: "session-1",
		taskId: "TASK-1",
		preset: "default",
		tmuxName: "harness-test",
		createdAt: new Date().toISOString(),
		outputPath: join(root, "output.log"),
		bootstrapPath: join(root, "bootstrap.md"),
	};
	const context: SessionLaunchContext = {
		taskId: record.taskId,
		modeId: "build",
		sessionId: record.id,
		record,
		cwd: root,
		configuration: {
			scope: "root",
			config: {
				selectedPreset: "default",
				sessions: { worktreePerTask: false, yoloMode: false, autoResumeOnRestart: true },
				presets: { default: { command: ["claude"], bootstrap: "claude", env: {}, prepare: "" } },
			},
		},
		profile: {
			name: "Build",
			model: { kind: "default" },
			prompt: "",
			permissions: { repository: "read-write", task: "read-write", artifacts: "read", subagents: "disabled" },
			artifacts: [],
		},
		preset: { command: ["claude"], bootstrap: "claude", env: {}, prepare: "" },
		prompt: "composed startup prompt",
	};
	const fakeProcess = {
		prepare: async () => {},
		create: async (
			_record: AgentSession,
			_cwd: string,
			_env: Record<string, string>,
			acquired?: (paneId?: string) => void,
		) => {
			acquired?.("%42");
		},
		preparePane: async () => {},
		paneId: async () => "%42",
		assertNoPreparedResources: async () => {
			emitted.order.push("outgoing-cleanup");
			await rm(sessionActivityDir(root, record.id), { recursive: true, force: true });
		},
		launchPrepared: async (
			_record: AgentSession,
			prepared: { identity?: { id: string }; env: Record<string, string>; resources: { skill: { path: string } } },
		) => {
			emitted.order.push("dispatch");
			emitted.launchEnvironment = prepared.env;
			const nativeId = resume ? "123e4567-e89b-42d3-a456-426614174000" : (prepared.identity?.id ?? "");
			emitted.launchDirectory = prepared.resources.skill.path;
			const config = claudeHooksConfig(join(root, "activity"), record.id, prepared.resources.skill.path) as {
				hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
			};
			if (omit !== "initialized")
				await invoke(
					config.hooks.SessionStart?.[1]?.hooks[0]?.command ?? "",
					JSON.stringify({ session_id: nativeId, source: resume ? "resume" : "startup" }),
				);
			if (!resume && omit !== "prompt-accepted")
				await invoke(
					config.hooks.UserPromptSubmit?.[1]?.hooks[0]?.command ?? "",
					JSON.stringify({ session_id: nativeId, prompt: "initial" }),
				);
			if (!resume && omit !== "prompt-accepted") emitted.promptSubmissions += 1;
			if (nativeId.startsWith("ses_")) {
				await writeFile(join(prepared.resources.skill.path, "initialized"), nativeId);
				await writeFile(join(prepared.resources.skill.path, "prompt-accepted"), nativeId);
			}
		},
		alive: async () => ({ exitCode: 0, stdout: "0", stderr: "" }),
		killCaptured: async (_record: AgentSession, paneId: string) => {
			state.killCalls += 1;
			state.capturedPaneIds.push(paneId);
			if (state.failKill) throw new Error("execution cleanup failed");
		},
		input: async () => {},
		sendKey: async () => {},
	};
	await writeFile(record.bootstrapPath, "old prompt");
	return {
		root,
		record,
		context,
		emitted,
		state,
		process: fakeProcess as unknown as ConstructorParameters<typeof Harness>[1],
		cleanup: () => rm(root, { recursive: true, force: true }),
	};
}

describe("provider prompt-acceptance receipts", () => {
	it("fails resume with the unavailable task execution directory named before preparing resources", async () => {
		const test = await fixture();
		const missing = join(test.root, "missing-worktree");
		try {
			await expect(
				new Harness(test.root, test.process).resume("native", {
					...test.context,
					cwd: missing,
				}),
			).rejects.toThrow(missing);
			expect(test.emitted.order).toEqual([]);
		} finally {
			await test.cleanup();
		}
	});
	it("cleans an acquired pane after preparation failure without another pane lookup", async () => {
		const test = await fixture();
		test.process.preparePane = async () => {
			throw new Error("pane preparation failed");
		};
		test.process.paneId = async () => {
			throw new Error("lookup unavailable");
		};
		try {
			await expect(new Harness(test.root, test.process).launch(test.context)).rejects.toThrow(
				"pane preparation failed",
			);
			expect(test.state.capturedPaneIds).toEqual(["%42"]);
		} finally {
			await test.cleanup();
		}
	});

	it("protects child task and mode identities against inherited and preset values", async () => {
		const test = await fixture();
		const previousTask = process.env.AGENTIC_WORKSPACE_TASK_ID;
		const previousMode = process.env.AGENTIC_WORKSPACE_MODE_ID;
		process.env.AGENTIC_WORKSPACE_TASK_ID = "parent-task";
		process.env.AGENTIC_WORKSPACE_MODE_ID = "parent-mode";
		test.context = {
			...test.context,
			preset: {
				...test.context.preset,
				env: { AGENTIC_WORKSPACE_TASK_ID: "preset-task", AGENTIC_WORKSPACE_MODE_ID: "preset-mode" },
			},
		};
		try {
			const execution = await new Harness(test.root, test.process).launch(test.context);
			expect(test.emitted.launchEnvironment.AGENTIC_WORKSPACE_TASK_ID).toBe("TASK-1");
			expect(test.emitted.launchEnvironment.AGENTIC_WORKSPACE_MODE_ID).toBe("build");
			await execution.stop();
		} finally {
			if (previousTask === undefined) delete process.env.AGENTIC_WORKSPACE_TASK_ID;
			else process.env.AGENTIC_WORKSPACE_TASK_ID = previousTask;
			if (previousMode === undefined) delete process.env.AGENTIC_WORKSPACE_MODE_ID;
			else process.env.AGENTIC_WORKSPACE_MODE_ID = previousMode;
			await test.cleanup();
		}
	});
	it("launch resolves only after generated Claude hooks acknowledge the composed prompt", async () => {
		const test = await fixture();
		try {
			const execution = await new Harness(test.root, test.process).launch(test.context);
			expect(execution.providerConversationId).toBeString();
			expect(execution.events).toEqual({
				turnCompleted: "supported",
				permissionWait: "supported",
				executionExit: "supported",
				activity: "supported",
			});
			const nativeId = execution.providerConversationId;
			if (!nativeId) throw new Error("Claude launch did not return its native identity.");
			expect(JSON.parse(await Bun.file(join(test.emitted.launchDirectory, "initialized")).text())).toMatchObject({
				session_id: nativeId,
				source: "startup",
			});
			expect(JSON.parse(await Bun.file(join(test.emitted.launchDirectory, "prompt-accepted")).text())).toMatchObject({
				session_id: nativeId,
			});
			await execution.stop();
		} finally {
			await test.cleanup();
		}
	});

	it("uses the adapter resolved from a public OpenCode preset for the execution handle", async () => {
		const test = await fixture();
		const original = harnessRegistry.forPreset("opencode-v1");
		harnessRegistry.replace(new OpencodeV1Agent({ preassignSession: async () => "ses_test" }));
		const command = join(test.root, "opencode");
		await writeFile(command, "#!/bin/sh\nprintf '1.19.3\\n'\n");
		await chmod(command, 0o700);
		const preset = { command: [command], bootstrap: "opencode" as const, env: {}, prepare: "" };
		test.context = {
			...test.context,
			preset,
			configuration: {
				...test.context.configuration,
				config: { ...test.context.configuration.config, presets: { default: preset } },
			},
		};
		try {
			const execution = await new Harness(test.root, test.process, 25).launch(test.context);
			expect(execution.providerConversationId).toBeString();
			expect(execution.events).toEqual({
				turnCompleted: "supported",
				permissionWait: "supported",
				executionExit: "supported",
				activity: "supported",
			});
			await execution.stop();
		} finally {
			harnessRegistry.replace(original);
			await test.cleanup();
		}
	});

	it("rejects a blank retained provider identity before preparing a resume", async () => {
		const test = await fixture();
		try {
			await expect(new Harness(test.root, test.process).resume("  ", test.context)).rejects.toThrow(
				"Resume requires a non-empty retained provider session ID",
			);
			expect(test.emitted.order).toEqual([]);
		} finally {
			await test.cleanup();
		}
	});

	for (const missing of ["initialized", "prompt-accepted"] as const) {
		it(`does not launch when the generated emitter omits ${missing}`, async () => {
			const test = await fixture(missing);
			try {
				const started = Date.now();
				await expect(new Harness(test.root, test.process, 25).launch(test.context)).rejects.toThrow(
					`missing ${missing} receipt`,
				);
				expect(Date.now() - started).toBeLessThan(PROVIDER_READINESS_DEADLINE_MS);
			} finally {
				await test.cleanup();
			}
		});
	}

	it("resumes only after the generated Claude hook confirms the exact saved identity, without prompt replay", async () => {
		const test = await fixture(undefined, true);
		try {
			const execution = await new Harness(test.root, test.process).resume(
				"123e4567-e89b-42d3-a456-426614174000",
				test.context,
			);
			expect(execution.providerConversationId).toBe("123e4567-e89b-42d3-a456-426614174000");
			expect(test.emitted.promptSubmissions).toBe(0);
			expect(test.emitted.order).toEqual(["outgoing-cleanup", "dispatch"]);
			await access(sessionActivityDir(test.root, test.record.id));
			await execution.stop();
		} finally {
			await test.cleanup();
		}
	});

	it("does not resume when the generated emitter omits resume initialization", async () => {
		const test = await fixture("initialized", true);
		try {
			await expect(
				new Harness(test.root, test.process, 25).resume("123e4567-e89b-42d3-a456-426614174000", test.context),
			).rejects.toThrow("missing initialized receipt");
		} finally {
			await test.cleanup();
		}
	});

	it("replaces a foreign inherited workspace context with the new pane and conversation", async () => {
		const test = await fixture();
		const previous = process.env[WORKSPACE_CONTEXT_ENV];
		process.env[WORKSPACE_CONTEXT_ENV] = JSON.stringify({
			v: 2,
			paneId: "%foreign",
			rootDir: "/foreign",
			conversation: { sessionId: "other" },
		});
		try {
			const execution = await new Harness(test.root, test.process).launch(test.context);
			const launchContext = test.emitted.launchEnvironment[WORKSPACE_CONTEXT_ENV];
			if (!launchContext) throw new Error("Harness launch omitted workspace context.");
			expect(JSON.parse(launchContext)).toEqual({
				v: 2,
				paneId: "%42",
				rootDir: test.root,
				conversation: { taskId: "TASK-1", modeId: "build", sessionId: "session-1" },
			});
			await execution.stop();
		} finally {
			if (previous === undefined) delete process.env[WORKSPACE_CONTEXT_ENV];
			else process.env[WORKSPACE_CONTEXT_ENV] = previous;
			await test.cleanup();
		}
	});

	it("attempts cleanup after owned startup failure and rejects without recoverable execution when cleanup succeeds", async () => {
		const test = await fixture("prompt-accepted");
		try {
			const failure = await new Harness(test.root, test.process, 25).launch(test.context).then(
				() => undefined,
				(error: unknown) => error as Error & { execution?: unknown },
			);
			expect(failure).toBeDefined();
			expect(failure?.message).toContain("missing prompt-accepted receipt");
			expect(failure?.execution).toBeUndefined();
			expect(test.state.killCalls).toBe(1);
			expect(test.state.capturedPaneIds).toEqual(["%42"]);
		} finally {
			await test.cleanup();
		}
	});

	it("retains recoverable execution and original failure evidence when owned cleanup fails", async () => {
		const test = await fixture("prompt-accepted");
		test.state.failKill = true;
		try {
			const failure = await new Harness(test.root, test.process, 25).launch(test.context).then(
				() => undefined,
				(error: unknown) => error as Error & { execution?: unknown; cause?: unknown },
			);
			expect(failure).toBeDefined();
			expect(failure?.message).toContain("missing prompt-accepted receipt");
			expect(failure?.execution).toBeDefined();
			expect(failure?.cause).toBeInstanceOf(AggregateError);
			if (!(failure?.cause instanceof AggregateError))
				throw new Error("Expected startup and cleanup failure evidence.");
			expect(failure.cause.errors[0]).toMatchObject({
				message: expect.stringContaining("missing prompt-accepted receipt"),
			});
			expect(test.state.killCalls).toBe(1);
		} finally {
			await test.cleanup();
		}
	});

	it("preflights a resume before touching the outgoing owned pane", async () => {
		const test = await fixture();
		const original = harnessRegistry.forPreset("claude");
		const fake = Object.create(original) as typeof original;
		fake.preflightLaunch = async () => {
			throw new Error("preflight denied");
		};
		harnessRegistry.replace(fake);
		try {
			const context = {
				...test.context,
				record: { ...test.context.record, nativeSessionId: "native-1" },
			};
			await expect(new Harness(test.root, test.process).resume("native-1", context)).rejects.toThrow(
				"preflight denied",
			);
			expect(test.emitted.order).not.toContain("outgoing-cleanup");
			expect(test.state.killCalls).toBe(0);
		} finally {
			harnessRegistry.replace(original);
			await test.cleanup();
		}
	});

	it("cleans prepared launch resources when creating the replacement fails", async () => {
		const test = await fixture();
		const original = harnessRegistry.forPreset("claude");
		let directory = "";
		const fake = Object.create(original) as typeof original;
		fake.prepare = async (request) => {
			directory = request.directory;
			return await original.prepare(request);
		};
		harnessRegistry.replace(fake);
		const process = test.process as unknown as {
			create: (record: AgentSession, env: Record<string, string>) => Promise<void>;
		};
		const originalCreate = process.create;
		process.create = async () => {
			throw new Error("create denied");
		};
		try {
			await expect(new Harness(test.root, test.process).launch(test.context)).rejects.toThrow("create denied");
			expect(directory).not.toBe("");
			await expect(access(directory)).rejects.toMatchObject({ code: "ENOENT" });
			expect(test.emitted.order).not.toContain("dispatch");
		} finally {
			process.create = originalCreate;
			harnessRegistry.replace(original);
			await test.cleanup();
		}
	});
});
