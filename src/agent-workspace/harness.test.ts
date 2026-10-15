import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Agent } from "./agents/agent.ts";
import { agentFor, registerAgent } from "./agents/agents.ts";
import type { SessionLaunchContext } from "./harness.ts";
import { Harness } from "./harness.ts";
import type { AgentSession } from "./types.ts";

describe("provider prompt-acceptance receipts", () => {
	it("launch resolves only after the provider prompt receipt and delivers the composed CLI prompt", async () => {
		const root = await mkdtemp(join(tmpdir(), "harness-readiness-test-"));
		const original = agentFor("claude");
		if (!original) throw new Error("Claude adapter is not registered.");
		const adapter = Object.create(original) as Agent;
		adapter.preflightLaunch = async () => undefined;
		registerAgent(adapter);
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
				permissions: {
					repository: "read-write",
					task: "read-write",
					artifacts: "read",
					subagents: "disabled",
				},
				artifacts: [],
			},
			preset: { command: "claude", bootstrap: "claude", env: {}, prepare: "" },
			prompt: "composed startup prompt",
		};
		const sentKeys: string[] = [];
		const typed: string[] = [];
		const fakeProcess = {
			prepare: async () => {},
			create: async () => {},
			preparePane: async () => {},
			assertNoPreparedResources: async () => {},
			launchPrepared: async () => writeFile(join(root, "session-1.prompt-accepted"), "native-session"),
			alive: async () => ({ exitCode: 0, stdout: "0", stderr: "" }),
			kill: async () => {},
			input: async (_record: AgentSession, text: string) => typed.push(text),
			sendKey: async (_record: AgentSession, key: string) => sentKeys.push(key),
		} as unknown as ConstructorParameters<typeof Harness>[1];
		try {
			await writeFile(record.bootstrapPath, "old prompt");
			const execution = await new Harness(root, fakeProcess).launch(context);
			expect(execution.providerConversationId).toBeString();
			expect(await readFile(join(root, "session-1.prompt-accepted"), "utf8")).toBe("native-session");
			await execution.sendKey("C-c");
			await execution.input("literal prompt");
			expect(sentKeys).toEqual(["C-c"]);
			expect(typed).toEqual(["literal prompt"]);
			const executionId = execution.identity.executionId;
			const next = await new Harness(root, fakeProcess).launch(context);
			expect(next.identity.executionId).not.toBe(executionId);
			expect(next.identity.executionId).toBe(next.identity.executionId);
			const unsubscribe = next.observe(() => {});
			unsubscribe();
			next.teardownListeners();
			next.teardownListeners();
			await next.stop();
			await execution.stop();
		} finally {
			registerAgent(original);
			await rm(root, { recursive: true, force: true });
		}
	});

	it("registers the existing OpenCode v1 message hook as a prompt receipt source", async () => {
		const source = await readFile(new URL("./agents/opencode-v1.ts", import.meta.url), "utf8");
		expect(source).toContain('"chat.message": async (input)');
		expect(source).toContain("recordPromptAccepted(sessionID)");
		expect(source).toContain("sessionID !== activeTopLevelSessionID");
	});

	it("keeps OpenCode v2 CLI prompt delivery and observes its user-message event", async () => {
		const source = await readFile(new URL("./agents/opencode-v2-cli-plugin.ts", import.meta.url), "utf8");
		expect(source).toContain('ctx.data.on("message.updated"');
		expect(source).toContain('info.role === "user"');
		expect(source).toContain('"session.execution.started"');
	});

	it("writes Claude and Pi receipts from their provider prompt hooks", async () => {
		const claude = await readFile(new URL("./agents/claude.ts", import.meta.url), "utf8");
		expect(claude).toContain("buildPromptReceiptCommand");
		const pi = await readFile(new URL("./agents/pi.ts", import.meta.url), "utf8");
		expect(pi).toContain('pi.on("before_agent_start"');
		expect(pi).toContain("PROMPT_ACCEPTED_PATH");
	});
});
