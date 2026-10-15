import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "./agents/agents.ts";
import { claudeHooksConfig } from "./agents/claude.ts";
import type { SessionLaunchContext } from "./harness.ts";
import { Harness, PROVIDER_READINESS_DEADLINE_MS } from "./harness.ts";
import type { AgentSession } from "./types.ts";

type Omitted = "initialized" | "prompt-accepted";

async function invoke(command: string, input: string): Promise<void> {
	const child = Bun.spawn(["/bin/sh", "-c", command], { stdin: "pipe", stdout: "ignore", stderr: "ignore" });
	child.stdin.write(input);
	child.stdin.end();
	await child.exited;
}

async function fixture(omit?: Omitted, resume = false) {
	const root = await mkdtemp(join(tmpdir(), "harness-readiness-test-"));
	const emitted = { launchDirectory: "" };
	const record: AgentSession = {
		id: "session-1",
		taskId: "TASK-1",
		preset: "default",
		tmuxName: "harness-test",
		cwd: root,
		createdAt: new Date().toISOString(),
		status: "starting",
		outputPath: join(root, "output.log"),
		bootstrapPath: join(root, "bootstrap.md"),
	};
	const context: SessionLaunchContext = {
		taskId: record.taskId,
		modeId: "build",
		sessionId: record.id,
		record,
		configuration: {
			scope: "root",
			config: {
				selectedPreset: "default",
				presets: { default: { command: "claude", bootstrap: "claude", env: {}, prepare: "" } },
			},
		},
		profile: {
			name: "Build",
			model: { kind: "default" },
			prompt: "",
			permissions: { repository: "read-write", task: "read-write", artifacts: "read", subagents: "disabled" },
			artifacts: [],
		},
		preset: { command: "claude", bootstrap: "claude", env: {}, prepare: "" },
		prompt: "composed startup prompt",
	};
	const fakeProcess = {
		prepare: async () => {},
		create: async () => {},
		preparePane: async () => {},
		assertNoPreparedResources: async () => {},
		launchPrepared: async (
			_record: AgentSession,
			prepared: { identity?: { id: string }; resources: { skill: { path: string } } },
		) => {
			const nativeId = resume ? "saved-native-id" : (prepared.identity?.id ?? "");
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
		},
		alive: async () => ({ exitCode: 0, stdout: "0", stderr: "" }),
		kill: async () => {},
		input: async () => {},
		sendKey: async () => {},
	};
	await writeFile(record.bootstrapPath, "old prompt");
	return {
		root,
		record,
		context,
		emitted,
		process: fakeProcess as unknown as ConstructorParameters<typeof Harness>[1],
		cleanup: () => rm(root, { recursive: true, force: true }),
	};
}

describe("provider prompt-acceptance receipts", () => {
	it("launch resolves only after generated Claude hooks acknowledge the composed prompt", async () => {
		const test = await fixture();
		try {
			const execution = await new Harness(test.root, test.process).launch(test.context);
			expect(execution.providerConversationId).toBeString();
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
			const execution = await new Harness(test.root, test.process).resume("saved-native-id", test.context);
			expect(execution.providerConversationId).toBe("saved-native-id");
			await execution.stop();
		} finally {
			await test.cleanup();
		}
	});

	it("does not resume when the generated emitter omits resume initialization", async () => {
		const test = await fixture("initialized", true);
		try {
			await expect(new Harness(test.root, test.process, 25).resume("saved-native-id", test.context)).rejects.toThrow(
				"missing initialized receipt",
			);
		} finally {
			await test.cleanup();
		}
	});
});
