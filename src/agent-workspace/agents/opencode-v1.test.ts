import { describe, expect, it } from "bun:test";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { OpencodeV1Agent } from "./opencode-v1.ts";

describe("OpenCode 1.19 TUI adapter", () => {
	it("launches with --prompt and records its created native session in the task root", async () => {
		const root = await mkdtemp(join(tmpdir(), "backlog-opencode-v1-"));
		try {
			const bootstrapPath = join(root, "bootstrap.md");
			await writeFile(bootstrapPath, "Wait for instructions.");
			const agent = new OpencodeV1Agent();
			expect(agent.name).toBe("opencode-v1");
			expect(
				agent.launchCommand({
					preset: { command: "opencode", env: {}, prepare: "", bootstrap: "opencode" },
					bootstrapPath,
				}),
			).toContain("--prompt");

			const taskRoot = join(root, "task");
			const statusDir = join(taskRoot, "backlog-1.activity");
			const installed = await agent.installStatusHooks({
				pluginDir: join(root, "config"),
				statusDir,
				sessionId: "backlog-1",
			});
			await writeFile(join(statusDir, ".backlog-launch-owner"), "test-owned-launch");
			expect(installed.provider).toBe("opencode-v1");
			expect(installed.env.OPENCODE_CONFIG_DIR).toBe(join(root, "config"));
			const pluginPath = installed.paths[0] ?? "";
			const lookups: string[] = [];
			const plugin = (await import(`${pathToFileURL(pluginPath).href}?test=${Date.now()}`)) as {
				BacklogStatus: (input: unknown) => Promise<{
					event(input: unknown): Promise<void>;
					"chat.message"(input: unknown): Promise<void>;
				}>;
			};
			const hooks = await plugin.BacklogStatus({
				client: {
					session: {
						get: async ({ sessionID }: { sessionID: string }) => {
							lookups.push(sessionID);
							if (sessionID === "ses_lookup_failure") throw new Error("unavailable");
							return {
								data: sessionID === "ses_unknown_child" ? { id: sessionID, parentID: "ses_native" } : { id: sessionID },
							};
						},
					},
				},
			});
			await hooks.event({ event: { type: "session.created", properties: { sessionID: "ses_native", info: {} } } });
			await hooks.event({
				event: { type: "session.created", properties: { sessionID: "ses_child", info: { parentID: "ses_native" } } },
			});
			await hooks["chat.message"]({ sessionID: "ses_child" });

			const nativePath = join(taskRoot, "backlog-1.native-session-id");
			expect(await readFile(nativePath, "utf8")).toBe("ses_native\n");
			await hooks.event({ event: { type: "session.created", properties: { sessionID: "ses_rotated", info: {} } } });
			expect(await readFile(nativePath, "utf8")).toBe("ses_rotated\n");
			await hooks["chat.message"]({ sessionID: "ses_unknown_root" });
			expect(await readFile(nativePath, "utf8")).toBe("ses_unknown_root\n");
			await hooks["chat.message"]({ sessionID: "ses_unknown_child" });
			expect(await readFile(nativePath, "utf8")).toBe("ses_unknown_root\n");
			await hooks["chat.message"]({ sessionID: "ses_lookup_failure" });
			expect(await readFile(nativePath, "utf8")).toBe("ses_unknown_root\n");
			await hooks["chat.message"]({ sessionID: "ses_native" });
			expect(await readFile(nativePath, "utf8")).toBe("ses_native\n");
			expect(lookups).toEqual(["ses_unknown_root", "ses_unknown_child", "ses_lookup_failure"]);
			expect(await readFile(join(statusDir, "status"), "utf8")).toBe("running");
			await hooks.event({
				event: { type: "session.status", properties: { sessionID: "ses_child", status: { type: "idle" } } },
			});
			expect(await readFile(join(statusDir, "status"), "utf8")).toBe("running");
			expect((await stat(nativePath)).mode & 0o777).toBe(0o600);

			const concurrent = await agent.installStatusHooks({
				pluginDir: join(root, "concurrent-config"),
				statusDir: join(taskRoot, "backlog-2.activity"),
				sessionId: "backlog-2",
			});
			const concurrentPlugin = (await import(
				`${pathToFileURL(concurrent.paths[0] ?? "").href}?test=${Date.now()}-concurrent`
			)) as { BacklogStatus: (input: unknown) => Promise<{ event(input: unknown): Promise<void> }> };
			await (await concurrentPlugin.BacklogStatus({ client: {} })).event({
				event: { type: "session.created", properties: { sessionID: "ses_concurrent", info: {} } },
			});
			expect(await readFile(join(taskRoot, "backlog-2.native-session-id"), "utf8")).toBe("ses_concurrent\n");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("accepts only the supported executable version before preparing a launch", async () => {
		const root = await mkdtemp(join(tmpdir(), "backlog-opencode-v1-version-"));
		try {
			const executable = join(root, "opencode");
			await writeFile(executable, "#!/bin/sh\necho 1.19.0\n");
			await chmod(executable, 0o700);
			const agent = new OpencodeV1Agent();
			const request = {
				preset: { command: executable, env: {}, prepare: "", bootstrap: "opencode" as const },
				cwd: root,
				bootstrapPath: join(root, "bootstrap.md"),
				directory: join(root, "config"),
				skillRoot: join(root, "skills"),
				skillPath: join(root, "skills", "SKILL.md"),
				statusDir: join(root, "task", "backlog-1.activity"),
				sessionId: "backlog-1",
				env: {},
				intent: { kind: "new" as const },
			};
			await agent.preflightLaunch({
				preset: request.preset,
				cwd: request.cwd,
				bootstrapPath: request.bootstrapPath,
				env: request.env,
				resume: false,
			});
			await expect(
				agent.preflightLaunch({
					preset: request.preset,
					cwd: request.cwd,
					bootstrapPath: request.bootstrapPath,
					env: { OPENCODE_CONFIG_CONTENT: "[]" },
					resume: false,
				}),
			).rejects.toThrow("must contain a configuration object");
			await expect(agent.prepare(request)).resolves.toMatchObject({
				command: expect.stringContaining(executable),
			});

			await writeFile(executable, "#!/bin/sh\necho 2.0.0\n");
			await expect(
				agent.preflightLaunch({
					preset: request.preset,
					cwd: request.cwd,
					bootstrapPath: request.bootstrapPath,
					env: request.env,
					resume: false,
				}),
			).rejects.toThrow("requires OpenCode 1.19.0");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
