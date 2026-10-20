import { describe, expect, it } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDefaultModeCatalog } from "../../../storage/config.ts";
import type { OpenCodeSessionCapture } from "./opencode-session-capture.ts";
import { OpencodeV1Agent } from "./opencode-v1.ts";

const profile = getDefaultModeCatalog().profiles.build;
if (!profile) throw new Error("Missing default build mode profile.");

describe("OpenCode 1.19 TUI adapter", () => {
	it("sends the initial prompt once even when using a supplied session ID", () => {
		const agent = new OpencodeV1Agent();
		const prompt = "bootstrap file.md";
		const command = agent.launchCommand({
			preset: { command: ["opencode"], env: {}, prepare: "", bootstrap: "opencode" },
			bootstrapPath: prompt,
			nativeSessionId: "ses_existing",
		});
		expect(command).toBe(`'opencode' --session 'ses_existing' --prompt "$(cat -- 'bootstrap file.md')"`);
		expect(command.match(/--prompt/g)).toHaveLength(1);
	});

	it("emits readiness receipts and ignores status events from child sessions", async () => {
		const root = await mkdtemp(join(tmpdir(), "agentic-workspace-opencode-v1-"));
		try {
			const taskRoot = join(root, "task");
			const statusDir = join(taskRoot, "agentic-workspace-1.activity");
			const agent = new OpencodeV1Agent();
			const installed = await agent.installStatusHooks(
				{
					pluginDir: join(root, "config"),
					statusDir,
					sessionId: "agentic-workspace-1",
				},
				"ses_parent",
			);
			await writeFile(join(statusDir, ".agentic-workspace-launch-owner"), "test-owned-launch");
			expect(installed.provider).toBe("opencode-v1");
			const plugin = await readFile(installed.paths[0] ?? "", "utf8");
			expect(plugin).toContain("event: async ({ event })");
			expect(plugin).not.toContain("client.session.get");
			expect(plugin).toContain("initialized");
			expect(plugin).toContain("prompt-accepted");
			const launchDirectory = join(root, "config");
			const readiness = agent.readiness({ kind: "new" }, launchDirectory, {
				id: "ses_parent",
				basis: "client-established",
			});
			expect(readiness.initialized.expected).toBe("ses_parent");
			expect(readiness.promptAccepted?.expected).toBe("ses_parent");
			const resumeReadiness = agent.readiness({ kind: "resume", nativeSessionId: "ses_parent" }, launchDirectory, {
				id: "ses_parent",
				basis: "client-established",
			});
			expect(resumeReadiness.promptAccepted).toBeUndefined();
			const { pathToFileURL } = await import("node:url");
			const module = (await import(`${pathToFileURL(installed.paths[0] ?? "").href}?${Date.now()}`)) as {
				AgenticWorkspaceStatus(): Promise<{ event(input: unknown): Promise<void> }>;
			};
			const hooks = await module.AgenticWorkspaceStatus();
			await hooks.event({
				event: { type: "session.status", properties: { sessionID: "ses_parent", status: { type: "busy" } } },
			});
			expect(await readFile(resumeReadiness.initialized.path, "utf8")).toBe("ses_parent");
			expect(resumeReadiness.initialized.expected).toBe("ses_parent");
			await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_child" } } });
			expect(await readFile(join(statusDir, "status"), "utf8")).toBe("running");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("preassigns fresh sessions and launches with the session ID and one prompt", async () => {
		const root = await mkdtemp(join(tmpdir(), "agentic-workspace-opencode-v1-fresh-"));
		try {
			const calls: unknown[][] = [];
			const capture = {
				preassignSession: async (...args: Parameters<OpenCodeSessionCapture["preassignSession"]>) => {
					calls.push(args);
					return "ses_01234567-89ab-cdef-0123-456789abcdef";
				},
			};
			const agent = new OpencodeV1Agent(capture as OpenCodeSessionCapture);
			const prepared = await agent.prepare({
				preset: { command: ["opencode"], env: {}, prepare: "", bootstrap: "opencode" },
				cwd: root,
				bootstrapPath: join(root, "bootstrap file.md"),
				directory: join(root, "config"),
				skillRoot: join(root, "skills"),
				skillPath: join(root, "skills", "SKILL.md"),
				env: {},
				intent: { kind: "new" },
				profile,
			});
			expect(calls).toHaveLength(1);
			expect(prepared.identity?.id).toBe("ses_01234567-89ab-cdef-0123-456789abcdef");
			expect(prepared.command).toBe(
				`'opencode' --session 'ses_01234567-89ab-cdef-0123-456789abcdef' --prompt "$(cat -- '${join(root, "bootstrap file.md")}')"`,
			);
			expect(prepared.command.match(/--prompt/g)).toHaveLength(1);
			await expect(
				agent.reconcileIdentity({
					intent: { kind: "new" },
					preset: { command: ["opencode"], env: {}, prepare: "", bootstrap: "opencode" },
					cwd: root,
					env: prepared.env,
					launchDirectory: root,
					preparedIdentity: prepared.identity!,
					signal: new AbortController().signal,
				}),
			).resolves.toEqual(prepared.identity!);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("does not preassign a session when resuming", async () => {
		let posts = 0;
		const agent = new OpencodeV1Agent({
			preassignSession: async () => {
				posts++;
				return "ses_unused";
			},
		} as unknown as OpenCodeSessionCapture);
		const root = await mkdtemp(join(tmpdir(), "agentic-workspace-opencode-v1-resume-"));
		try {
			const prepared = await agent.prepare({
				preset: { command: ["opencode"], env: {}, prepare: "", bootstrap: "opencode" },
				cwd: root,
				bootstrapPath: join(root, "bootstrap"),
				directory: join(root, "config"),
				skillRoot: join(root, "skills"),
				skillPath: join(root, "skills", "SKILL.md"),
				env: {},
				intent: { kind: "resume", nativeSessionId: "ses_existing" },
				profile,
			});
			expect(posts).toBe(0);
			expect(prepared.command).toBe("'opencode' '--session' 'ses_existing'");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("accepts only the supported executable version before preparing a launch", async () => {
		const root = await mkdtemp(join(tmpdir(), "agentic-workspace-opencode-v1-version-"));
		try {
			const executable = join(root, "opencode");
			await writeFile(executable, "#!/bin/sh\necho 1.19.3\n");
			await chmod(executable, 0o700);
			const agent = new OpencodeV1Agent();
			const request = {
				preset: { command: [executable], env: {}, prepare: "", bootstrap: "opencode" as const },
				cwd: root,
				bootstrapPath: join(root, "bootstrap.md"),
				env: {},
				resume: false,
				profile,
			};
			await expect(agent.preflightLaunch(request)).resolves.toBeDefined();
			await writeFile(executable, "#!/bin/sh\necho 2.0.0\n");
			await expect(agent.preflightLaunch(request)).rejects.toThrow("requires an OpenCode v1 binary");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
