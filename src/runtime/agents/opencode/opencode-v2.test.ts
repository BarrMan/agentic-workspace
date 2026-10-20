import { describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { AgentPreset, ModeProfile } from "../../../model/session/types.ts";
import { getDefaultModeCatalog } from "../../../storage/config.ts";
import { OpencodeV2Agent } from "./opencode-v2.ts";

const preset: AgentPreset = { bootstrap: "opencode", command: ["opencode"], prepare: "", env: {} };
const profile = getDefaultModeCatalog().profiles.build;
if (!profile) throw new Error("Missing default build mode profile.");

describe("OpenCode v2 adapter", () => {
	test("quotes bootstrap paths and keeps the built-in command shell-syntax guard", () => {
		const agent = new OpencodeV2Agent();
		const nativeSessionId = "ses_0123456789abcdef0123456789abcdef";
		const quotedPath = `folder with 'quote/bootstrap.md`;
		expect(agent.launchCommand({ preset, bootstrapPath: quotedPath, nativeSessionId })).toBe(
			`'opencode' --standalone --session '${nativeSessionId}' --prompt "$(cat -- 'folder with '"'"'quote/bootstrap.md')"`,
		);
		expect(agent.resumeCommand({ preset, nativeSessionId })).toBe(
			`'opencode' --standalone --session '${nativeSessionId}'`,
		);
		expect(agent.askCommand({ preset, nativeSessionId, question: "What next?" })).toContain(
			"run --standalone --session",
		);
		for (const suffix of [";", "|", "&&", "\n"]) {
			const literalPreset = { ...preset, command: ["opencode", suffix, "false"] };
			expect(agent.launchCommand({ preset: literalPreset, bootstrapPath: quotedPath, nativeSessionId })).toContain(
				`'${suffix}'`,
			);
			expect(agent.resumeCommand({ preset: literalPreset, nativeSessionId })).toContain(`'${suffix}'`);
			expect(agent.askCommand({ preset: literalPreset, nativeSessionId, question: "What next?" })).toContain(
				`'${suffix}'`,
			);
		}
	});

	test("uses an exact native session for interactive launch, resume, and ask", async () => {
		const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-opencode-v2-identity-"));
		try {
			const agent = new OpencodeV2Agent({ preassignSession: async () => "ses_01234567-89ab-cdef-0123-456789abcdef" });
			const prepared = await agent.prepare({
				preset,
				cwd: directory,
				bootstrapPath: join(directory, "bootstrap file"),
				directory,
				skillRoot: join(directory, "skills"),
				skillPath: join(directory, "skills", "SKILL.md"),
				env: { PATH: process.env.PATH ?? "" },
				intent: { kind: "new" },
				profile,
			});
			const nativeSessionId = prepared.identity?.id ?? "";
			expect(nativeSessionId).toMatch(/^ses_[0-9a-f-]{36}$/);
			expect(prepared.command).toContain(`--standalone --session '${nativeSessionId}' --prompt`);
			expect(agent.resumeCommand({ preset, nativeSessionId })).toBe(
				`'opencode' --standalone --session '${nativeSessionId}'`,
			);
			const ask = agent.askCommand({ preset, nativeSessionId, question: "What next?" });
			expect(ask).toContain("api --standalone get");
			expect(ask).toContain("run --standalone --session");
			expect(ask).toContain("What next?");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("preserves user CLI plugins and installs a process-local terminal-aware plugin", async () => {
		const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-opencode-v2-"));
		try {
			const agent = new OpencodeV2Agent({ preassignSession: async () => "ses_0123456789abcdef0123456789abcdef" });
			const launchDirectory = join(directory, "launch-temp");
			const metadataRoot = join(directory, "durable-metadata");
			await mkdir(launchDirectory, { recursive: true });
			await mkdir(metadataRoot, { recursive: true });
			const taskRoot = join(directory, "task");
			const statusDir = join(metadataRoot, "BACK-1.activity");
			const lookupCli = join(directory, "opencode-lookup");
			await writeFile(
				lookupCli,
				`#!/bin/sh
[ "$1" = api ] && [ "$2" = --standalone ] && [ "$3" = get ] || exit 2
[ "${"$LOOKUP_FAIL"}" != 1 ] || exit 1
printf '%s\\n' "$LOOKUP_RESULT"
`,
			);
			await chmod(lookupCli, 0o700);
			const env = {
				PATH: process.env.PATH ?? "",
				LOOKUP_RESULT: '{"data":{"id":"ses_wrong"}}',
				LOOKUP_FAIL: "0",
				OPENCODE_CONFIG_CONTENT: '{ /* preserve existing skill paths */ "skills": ["/user/skills"] }',
				OPENCODE_CLI_CONFIG_CONTENT: '{ // existing CLI plugin\n "plugins": ["user-plugin"] }',
			};
			await expect(
				agent.prepare({
					preset,
					cwd: launchDirectory,
					bootstrapPath: join(launchDirectory, "profile-bootstrap.md"),
					directory: launchDirectory,
					skillRoot: join(launchDirectory, "skills"),
					skillPath: join(launchDirectory, "skills", "SKILL.md"),
					sessionId: "BACK-NO-STATUS",
					taskRoot,
					env: { PATH: process.env.PATH ?? "" },
					intent: { kind: "resume", nativeSessionId: "ses_seed" },
					profile,
				}),
			).rejects.toThrow("requires its durable status directory");
			const prepared = await agent.prepare({
				preset: { ...preset, command: [lookupCli] },
				cwd: launchDirectory,
				bootstrapPath: join(launchDirectory, "profile-bootstrap.md"),
				directory: launchDirectory,
				skillRoot: join(launchDirectory, "skills"),
				skillPath: join(launchDirectory, "skills", "SKILL.md"),
				statusDir,
				sessionId: "BACK-1",
				taskRoot,
				env,
				intent: { kind: "new" },
				profile,
			});
			const cliConfig = Bun.JSONC.parse(prepared.env.OPENCODE_CLI_CONFIG_CONTENT ?? "{}") as { plugins: string[] };
			expect(cliConfig.plugins).toEqual([
				"user-plugin",
				join(launchDirectory, "agentic-workspace-opencode-cli-plugin"),
			]);
			const skillConfig = JSON.parse(prepared.env.OPENCODE_CONFIG_CONTENT ?? "{}") as { skills: string[] };
			expect(skillConfig.skills).toEqual(["/user/skills", join(launchDirectory, "skills")]);
			const pluginDirectory = cliConfig.plugins[1];
			if (!pluginDirectory) throw new Error("Expected the local OpenCode CLI plugin path.");
			const pluginPath = join(pluginDirectory, "tui.js");
			const plugin = await readFile(pluginPath, "utf8");
			expect(plugin).toContain('import { Plugin } from "@opencode/plugin/tui"');
			expect(plugin).toContain("ctx.data.on(name,");
			expect(plugin).not.toContain('ctx.data.on("session.created"');
			expect(plugin).toContain('ctx.ui.slot({ append: "app"');
			expect(plugin).toContain(join(launchDirectory, "initialized"));
			expect(plugin).toContain(join(launchDirectory, "prompt-accepted"));
			expect(plugin).toContain("return null");
			expect(plugin).not.toContain("OPENCODE_CONFIG_DIR");

			const pluginPackage = join(directory, "node_modules", "@opencode", "plugin");
			await mkdir(pluginPackage, { recursive: true });
			await writeFile(
				join(pluginPackage, "package.json"),
				JSON.stringify({
					name: "@opencode/plugin",
					exports: { "./tui": "./tui.js" },
				}),
			);
			await writeFile(join(pluginPackage, "tui.js"), "export const Plugin = { define: (plugin) => plugin };\n");
			const { default: definition } = await import(`${pathToFileURL(pluginPath).href}?test=${Date.now()}`);
			const listeners = new Map<string, (event: unknown) => void>();
			let route: { type: string; sessionID: string } = { type: "session", sessionID: "ses_other" };
			let render!: () => unknown;
			let slotDisposed = false;
			const cleanup = definition.setup({
				ui: {
					router: { current: () => route },
					slot: (slot: { render: () => unknown }) => {
						render = slot.render;
						return () => {
							slotDisposed = true;
						};
					},
				},
				data: {
					on: (name: string, handler: (event: unknown) => void) => {
						listeners.set(name, handler);
						return () => {
							listeners.delete(name);
						};
					},
				},
			});
			expect(render()).toBeNull();
			expect(await Bun.file(join(launchDirectory, "initialized")).exists()).toBe(false);
			listeners.get("session.execution.started")?.({ data: { sessionID: prepared.identity?.id } });
			expect(await Bun.file(join(statusDir, "status")).exists()).toBe(false);
			route = { type: "session", sessionID: "ses_second" };
			expect(render()).toBeNull();
			listeners.get("message.updated")?.({ data: { info: { sessionID: "ses_second", role: "user" } } });
			expect(await Bun.file(join(launchDirectory, "prompt-accepted")).exists()).toBe(false);
			listeners.get("session.execution.started")?.({ data: { sessionID: prepared.identity?.id } });
			expect(await Bun.file(join(statusDir, "status")).exists()).toBe(false);
			listeners.get("session.execution.started")?.({ data: { sessionID: "ses_second" } });
			const expectedId = prepared.identity?.id ?? "";
			route = { type: "session", sessionID: expectedId };
			expect(render()).toBeNull();
			expect(await Bun.file(join(launchDirectory, "initialized")).exists()).toBe(true);
			expect(await Bun.file(join(launchDirectory, "prompt-accepted")).exists()).toBe(false);
			listeners.get("message.updated")?.({ data: { info: { sessionID: "ses_wrong", role: "user" } } });
			expect(await Bun.file(join(launchDirectory, "prompt-accepted")).exists()).toBe(false);
			listeners.get("message.updated")?.({ data: { info: { sessionID: expectedId, role: "assistant" } } });
			expect(await Bun.file(join(launchDirectory, "prompt-accepted")).exists()).toBe(false);
			listeners.get("message.updated")?.({ data: { info: { sessionID: expectedId, role: "user" } } });
			for (let attempt = 0; attempt < 20; attempt++) {
				if (
					(await Bun.file(join(launchDirectory, "initialized")).exists()) &&
					(await Bun.file(join(launchDirectory, "prompt-accepted")).exists()) &&
					(await Bun.file(join(statusDir, "status")).exists())
				)
					break;
				await new Promise((resolve) => setTimeout(resolve, 5));
			}
			expect(await readFile(join(launchDirectory, "initialized"), "utf8")).toBe(expectedId);
			expect(await readFile(join(launchDirectory, "prompt-accepted"), "utf8")).toBe(expectedId);
			const captureRequest = {
				intent: { kind: "new" as const },
				preset: { ...preset, command: [lookupCli] },
				cwd: launchDirectory,
				env,
				launchDirectory,
				preparedIdentity: prepared.identity,
				signal: new AbortController().signal,
			};
			await expect(agent.reconcileIdentity(captureRequest)).rejects.toThrow("did not confirm accepted session");
			env.LOOKUP_RESULT = JSON.stringify({ data: { id: expectedId } });
			expect(await agent.reconcileIdentity(captureRequest)).toEqual(prepared.identity!);
			env.LOOKUP_FAIL = "1";
			await expect(agent.reconcileIdentity(captureRequest)).rejects.toThrow("did not confirm accepted session");
			expect(await readFile(join(statusDir, "status"), "utf8")).toBe("running");
			for (const [event, value] of [
				["session.execution.succeeded", "idle"],
				["permission.asked", "waiting"],
				["session.execution.failed", "error"],
			] as const) {
				listeners.get(event)?.({ data: { sessionID: expectedId } });
				for (let attempt = 0; attempt < 20; attempt++) {
					if ((await readFile(join(statusDir, "status"), "utf8")) === value) break;
					await new Promise((resolve) => setTimeout(resolve, 5));
				}
				expect(await readFile(join(statusDir, "status"), "utf8")).toBe(value);
			}
			const resumeDirectory = join(directory, "resume-launch");
			await mkdir(resumeDirectory, { recursive: true });
			const resumeEnv = { ...env, LOOKUP_RESULT: '{"data":{"id":"ses_saved"}}', LOOKUP_FAIL: "0" };
			let preassignCalls = 0;
			const resumePrepared = await new OpencodeV2Agent({
				preassignSession: async () => {
					preassignCalls++;
					return "ses_unused";
				},
			}).prepare({
				preset: { ...preset, command: [lookupCli] },
				cwd: resumeDirectory,
				bootstrapPath: join(resumeDirectory, "bootstrap"),
				directory: resumeDirectory,
				skillRoot: join(resumeDirectory, "skills"),
				skillPath: join(resumeDirectory, "skills", "SKILL.md"),
				statusDir: join(metadataRoot, "BACK-RESUME.activity"),
				sessionId: "BACK-RESUME",
				env: resumeEnv,
				intent: { kind: "resume", nativeSessionId: "ses_saved" },
				profile,
			});
			const resumeConfig = Bun.JSONC.parse(resumePrepared.env.OPENCODE_CLI_CONFIG_CONTENT ?? "{}") as {
				plugins: string[];
			};
			const resumePlugin = resumeConfig.plugins.at(-1);
			if (!resumePlugin) throw new Error("Expected resume plugin path.");
			const { default: resumeDefinition } = await import(
				`${pathToFileURL(join(resumePlugin, "tui.js")).href}?resume=${Date.now()}`
			);
			let resumeRender!: () => unknown;
			const resumeListeners = new Map<string, (event: unknown) => void>();
			const resumeCleanup = resumeDefinition.setup({
				ui: {
					router: { current: () => ({ type: "session", sessionID: "ses_saved" }) },
					slot: (slot: { render: () => unknown }) => {
						resumeRender = slot.render;
						return () => {};
					},
				},
				data: {
					on: (name: string, handler: (event: unknown) => void) => {
						resumeListeners.set(name, handler);
						return () => resumeListeners.delete(name);
					},
				},
			});
			expect(resumeRender()).toBeNull();
			expect(await readFile(join(resumeDirectory, "initialized"), "utf8")).toBe("ses_saved");
			expect(await Bun.file(join(resumeDirectory, "prompt-accepted")).exists()).toBe(false);
			expect(resumePrepared.identity?.id).toBe("ses_saved");
			expect(preassignCalls).toBe(0);
			resumeCleanup();
			expect(await readFile(join(launchDirectory, "initialized"), "utf8")).toBe(expectedId);
			cleanup();
			expect(slotDisposed).toBe(true);
			expect(listeners.size).toBe(0);
			await rm(launchDirectory, { recursive: true, force: true });
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("validates v2 skill arrays and configures explicit models without CLI flags", async () => {
		const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-opencode-v2-config-"));
		try {
			const agent = new OpencodeV2Agent();
			await expect(
				agent.prepare({
					preset,
					cwd: directory,
					bootstrapPath: join(directory, "bootstrap"),
					directory,
					skillRoot: join(directory, "skills"),
					skillPath: join(directory, "skills", "SKILL.md"),
					env: { PATH: process.env.PATH ?? "", OPENCODE_CONFIG_CONTENT: '{ "skills": { "paths": [] } }' },
					intent: { kind: "resume", nativeSessionId: "ses_seed" },
					profile,
				}),
			).rejects.toThrow("skills must be an array of directory paths");
			const explicit: ModeProfile = {
				name: "BUILD",
				model: { kind: "explicit", id: "provider/model" },
				prompt: "",
				permissions: { repository: "read-write", task: "read-write", artifacts: "read-write", subagents: "allowed" },
				artifacts: [],
			};
			const profilePreset = agent.prepareProfile(explicit, preset);
			expect(profilePreset.command).toEqual(["opencode"]);
			const prepared = await agent.prepare({
				preset: profilePreset,
				cwd: directory,
				bootstrapPath: join(directory, "bootstrap"),
				directory,
				skillRoot: join(directory, "skills"),
				skillPath: join(directory, "skills", "SKILL.md"),
				env: {
					PATH: process.env.PATH ?? "",
					OPENCODE_CONFIG_CONTENT: '{ "theme": "dark", "model": "user/model", "skills": [] }',
				},
				intent: { kind: "resume", nativeSessionId: "ses_seed" },
				profile: explicit,
			});
			const config = JSON.parse(prepared.env.OPENCODE_CONFIG_CONTENT ?? "{}") as Record<string, unknown>;
			expect(config.model).toBe("provider/model");
			expect(config.theme).toBe("dark");
			expect(config.skills).toEqual([join(directory, "skills")]);
			await expect(
				agent.prepare({
					preset,
					cwd: directory,
					bootstrapPath: join(directory, "bootstrap"),
					directory,
					skillRoot: join(directory, "skills"),
					skillPath: join(directory, "skills", "SKILL.md"),
					env: { PATH: process.env.PATH ?? "" },
					intent: { kind: "resume", nativeSessionId: "ses_seed" },
					profile: { ...explicit, model: { kind: "explicit", id: "invalid model" } },
				}),
			).rejects.toThrow("Model ID contains unsupported characters");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("checks exact resume IDs without creating missing sessions", async () => {
		const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-opencode-v2-resume-"));
		try {
			const binary = join(directory, "opencode-probe");
			await writeFile(
				binary,
				`#!/bin/sh
if [ "$1" = --version ]; then printf 'opencode %s\\n' "\${V2_TEST_VERSION:-v2.0.26}"; exit 0; fi
if [ "$1" = run ]; then touch "$V2_ASK_MARKER"; exit 0; fi
[ "$1" = api ] && [ "$2" = --standalone ] && [ "$3" = get ] || exit 2
case "$4" in
  */ses_existing) printf '{"data":{"id":"ses_existing"}}\\n' ;;
  */ses_wrong) printf '{"data":{"id":"ses_else"}}\\n' ;;
  *) exit 1 ;;
esac
`,
			);
			await chmod(binary, 0o700);
			const agent = new OpencodeV2Agent();
			const prepareResume = (nativeSessionId: string, version = "v2.0.26") =>
				agent.prepare({
					preset: { ...preset, command: [binary] },
					cwd: directory,
					bootstrapPath: join(directory, "bootstrap"),
					directory,
					skillRoot: join(directory, "skills"),
					skillPath: join(directory, "skills", "SKILL.md"),
					env: { V2_TEST_VERSION: version },
					intent: { kind: "resume", nativeSessionId },
					profile,
				});
			const preflightResume = (nativeSessionId: string) =>
				agent.preflightLaunch({
					preset: { ...preset, command: [binary] },
					cwd: directory,
					bootstrapPath: join(directory, "bootstrap"),
					env: {},
					nativeSessionId,
					resume: true,
					profile,
				});
			expect((await prepareResume("ses_existing")).identity?.id).toBe("ses_existing");
			await expect(preflightResume("ses_missing")).rejects.toThrow("was not found or is unavailable");
			await expect(preflightResume("ses_wrong")).rejects.toThrow("session lookup did not confirm 'ses_wrong'");
			await expect(
				agent.preflightLaunch({
					preset: { ...preset, command: [binary] },
					cwd: directory,
					bootstrapPath: join(directory, "bootstrap"),
					env: { OPENCODE_CONFIG_CONTENT: "[]" },
					sessionId: "agentic-workspace-session",
					resume: false,
					nativeSessionId: "ses_new",
					profile,
				}),
			).rejects.toThrow("Unsupported OpenCode v2 config schema");
			await expect(
				agent.preflightLaunch({
					preset: { ...preset, command: [binary] },
					cwd: directory,
					bootstrapPath: join(directory, "bootstrap"),
					env: { OPENCODE_CLI_CONFIG_CONTENT: '{"plugins":"invalid"}' },
					sessionId: "agentic-workspace-session",
					resume: false,
					nativeSessionId: "ses_new",
					profile,
				}),
			).rejects.toThrow("plugins must be an array");
			await expect(
				agent.preflightLaunch({
					preset: { ...preset, command: [binary] },
					cwd: directory,
					bootstrapPath: join(directory, "bootstrap"),
					env: { V2_TEST_VERSION: "v1.19.0" },
					resume: true,
					nativeSessionId: "ses_existing",
					profile,
				}),
			).rejects.toThrow("requires an OpenCode v2 CLI binary");
			await expect(
				agent.preflightLaunch({
					preset: { ...preset, command: [binary] },
					cwd: directory,
					bootstrapPath: join(directory, "bootstrap"),
					env: { V2_TEST_VERSION: "v1.19.0" },
					resume: false,
					nativeSessionId: "ses_new",
					profile,
				}),
			).rejects.toThrow("requires an OpenCode v2 CLI binary");
			const askMissing = agent.askCommand({
				preset: { ...preset, command: [binary] },
				nativeSessionId: "ses_missing",
				question: "q",
			});
			const child = Bun.spawn(["/bin/sh", "-c", askMissing], {
				cwd: directory,
				env: { V2_ASK_MARKER: join(directory, "ask-ran") },
				stdin: "ignore",
				stdout: "ignore",
				stderr: "ignore",
			});
			await child.exited;
			expect(child.exitCode).not.toBe(0);
			expect(await Bun.file(join(directory, "ask-ran")).exists()).toBe(false);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
