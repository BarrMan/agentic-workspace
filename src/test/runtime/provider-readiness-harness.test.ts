import { describe, expect, it } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import "../../runtime/agents/core/agents.ts";
import type { AgentSession, SessionLaunchContext } from "../../model/session/types.ts";
import { Harness } from "../../runtime/harness.ts";

type Provider = "opencode-v1" | "opencode-v2" | "pi";
type OmittedStage = "initialized" | "prompt-accepted";

async function harnessFixture(provider: Provider, omitted?: OmittedStage) {
	const root = await mkdtemp(join(tmpdir(), `provider-readiness-${provider}-`));
	const binary = join(root, "provider");
	const fakeServer = join(root, "opencode.ts");
	if (provider === "opencode-v1" || provider === "opencode-v2") {
		await writeFile(
			fakeServer,
			`const args=process.argv.slice(2); if(args[0]==="serve"){Bun.serve({hostname:"127.0.0.1",port:Number(args[args.indexOf("--port")+1]),async fetch(request){if(request.method==="POST"){const body=await request.json();return Response.json({data:{id:body.id}})}return Response.json({data:[]})}}); await new Promise(()=>{});} if(args[0]==="api"){console.log(JSON.stringify({data:{id:args.at(-1)?.split("/").at(-1)}}));process.exit(0)}`,
		);
	}
	await writeFile(
		binary,
		provider === "opencode-v1"
			? `#!/bin/sh\nif [ "$1" = "--version" ]; then printf "1.19.3\\n"; else exec ${process.execPath} ${fakeServer} "$@"; fi\n`
			: provider === "opencode-v2"
				? `#!/bin/sh\nif [ "$1" = "--version" ]; then printf "2.0.0\\n"; else exec ${process.execPath} ${fakeServer} "$@"; fi\n`
				: "#!/bin/sh\nexit 0\n",
	);
	await chmod(binary, 0o700);
	const record: AgentSession = {
		id: "session-readiness",
		taskId: "TASK-1",
		preset: "default",
		tmuxName: "readiness-test",
		cwd: root,
		createdAt: new Date().toISOString(),
		outputPath: join(root, "output.log"),
		bootstrapPath: join(root, "bootstrap.md"),
	};
	await writeFile(record.bootstrapPath, "old prompt");
	const preset = { command: [binary], bootstrap: provider, env: { PATH: process.env.PATH ?? "" }, prepare: "" };
	const context: SessionLaunchContext = {
		taskId: record.taskId,
		modeId: "build",
		sessionId: record.id,
		record,
		configuration: {
			scope: "root",
			config: {
				selectedPreset: "default",
				sessions: { worktreePerTask: false, yoloMode: false, autoResumeOnRestart: true },
				presets: { default: preset },
			},
		},
		profile: {
			name: "Build",
			model: { kind: "default" },
			prompt: "",
			permissions: { repository: "read-write", task: "read-write", artifacts: "read", subagents: "disabled" },
			artifacts: [],
		},
		preset,
		prompt: "composed startup prompt",
	};
	const emitted = { launchDirectory: "" };
	const fakeProcess = {
		prepare: async () => {},
		create: async () => {},
		preparePane: async () => {},
		paneId: async (_record: AgentSession, options: { roles?: string[] } = {}) => {
			if (!(options.roles ?? ["live-preview"]).includes("live-preview"))
				throw new Error(`Agent pane for session ${_record.id} no longer exists`);
			return "%42";
		},
		assertNoPreparedResources: async () => {},
		launchPrepared: async (
			_record: AgentSession,
			prepared: { identity?: { id: string }; resources: { skill: { path: string } }; env: Record<string, string> },
		) => {
			const directory = prepared.resources.skill.path;
			emitted.launchDirectory = directory;
			await writeFile(join(directory, ".agentic-workspace-launch-owner"), "test-owned-launch");
			const nativeId = prepared.identity?.id;
			if (!nativeId) throw new Error(`${provider} did not prepare its native identity`);
			if (provider === "pi") {
				const target = prepared.env.AOE_SESSION_ID_FILE;
				const source = prepared.env.AOE_SESSION_SOURCE;
				if (!target || !source) throw new Error("Pi did not prepare its launch-scoped session ID capture path");
				await writeFile(`${target}.${source}`, nativeId);
				await writeFile(join(directory, `session_path.${source}`), `${nativeId}.jsonl`);
			}
			if (provider === "opencode-v1") {
				const pluginPath = join(directory, "plugins", "agentic-workspace-status.ts");
				const plugin = (await import(`${pathToFileURL(pluginPath).href}?${Date.now()}`)) as {
					AgenticWorkspaceStatus(
						input: unknown,
					): Promise<{ event(input: unknown): Promise<void>; "chat.message"(input: unknown): Promise<void> }>;
				};
				const hooks = await plugin.AgenticWorkspaceStatus({
					client: { session: { get: async () => ({ data: { id: nativeId } }) } },
				});
				if (omitted !== "initialized")
					await hooks.event({ event: { type: "session.created", properties: { sessionID: nativeId, info: {} } } });
				if (omitted !== "prompt-accepted") await hooks["chat.message"]({ sessionID: nativeId });
			} else if (provider === "opencode-v2") {
				const moduleRoot = join(directory, "node_modules", "@opencode", "plugin");
				await Bun.$`mkdir -p ${moduleRoot}`;
				await writeFile(
					join(moduleRoot, "package.json"),
					'{"name":"@opencode/plugin","exports":{"./tui":"./tui.js"},"type":"module"}',
				);
				await writeFile(join(moduleRoot, "tui.js"), "export const Plugin = { define: (value) => value };");
				const pluginPath = join(directory, "agentic-workspace-opencode-cli-plugin", "tui.js");
				const plugin = (await import(`${pathToFileURL(pluginPath).href}?${Date.now()}`)) as {
					default: { setup(ctx: unknown): () => void };
				};
				let render!: () => unknown;
				const handlers = new Map<string, (event: unknown) => void>();
				plugin.default.setup({
					ui: {
						router: { current: () => ({ type: "session", sessionID: nativeId }) },
						slot: ({ render: callback }: { render: () => unknown }) => (render = callback),
					},
					data: { on: (name: string, callback: (event: unknown) => void) => (handlers.set(name, callback), () => {}) },
				});
				if (omitted !== "initialized") render();
				if (omitted !== "prompt-accepted")
					handlers.get("message.updated")?.({ data: { info: { sessionID: nativeId, role: "user" } } });
			} else {
				const extensionPath = join(directory, "agentic-workspace-status-extension.ts");
				const extension = (await import(`${pathToFileURL(extensionPath).href}?${Date.now()}`)) as {
					default(pi: { on(name: string, callback: (event: unknown, context: unknown) => void): void }): void;
				};
				const handlers = new Map<string, (event: unknown, context: unknown) => void>();
				extension.default({ on: (name, callback) => handlers.set(name, callback) });
				const providerContext = { sessionManager: { getSessionId: () => nativeId } };
				if (omitted !== "initialized") handlers.get("session_start")?.({}, providerContext);
				if (omitted !== "prompt-accepted")
					handlers.get("before_agent_start")?.({ prompt: "composed startup prompt" }, providerContext);
			}
		},
		alive: async () => ({ exitCode: 0, stdout: "0", stderr: "" }),
		kill: async () => {},
		killCaptured: async (_record: AgentSession, expectedPaneId: string) => {
			if (expectedPaneId !== "%42")
				throw new Error("Session session-readiness pane incarnation changed; refusing to stop a replacement.");
		},
		input: async () => {},
		sendKey: async () => {},
	};
	return {
		root,
		record,
		context,
		emitted,
		process: fakeProcess as unknown as ConstructorParameters<typeof Harness>[1],
		cleanup: () => rm(root, { recursive: true, force: true }),
	};
}

describe("provider-emitted receipts complete harness readiness", () => {
	for (const provider of ["opencode-v1", "opencode-v2", "pi"] as const) {
		it(`${provider}: awaits the generated emitter's receipts and correlates identity`, async () => {
			const test = await harnessFixture(provider);
			try {
				const execution = await new Harness(test.root, test.process, 1_000).launch(test.context);
				// Receipt bytes come from executing the generated adapter emitter during launchPrepared.
				const expected = execution.providerConversationId;
				expect(expected).toBeString();
				expect(execution.identity.nativeSessionId).toBe(expected);
				expect(execution.events).toEqual({
					turnCompleted: "supported",
					permissionWait: provider === "opencode-v1" ? "supported" : "unsupported",
					executionExit: "supported",
					activity: "supported",
				});
				for (const stage of ["initialized", "prompt-accepted"] as const) {
					const receiptPath = join(test.emitted.launchDirectory, stage);
					expect((await readFile(receiptPath, "utf8")).trim()).not.toBe("");
				}
				await execution.stop();
			} finally {
				await test.cleanup();
			}
		});

		it(`${provider}: reports an omitted receipt as missing rather than mismatched`, async () => {
			const test = await harnessFixture(provider, "prompt-accepted");
			try {
				const failure = new Harness(test.root, test.process, 25).launch(test.context);
				await expect(failure).rejects.toThrow("missing prompt-accepted receipt");
				await expect(failure).rejects.not.toThrow("mismatched");
			} finally {
				await test.cleanup();
			}
		});
	}
});
