import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "./agents/startup.ts";
import { claudeHooksConfig } from "./agents/claude/claude.ts";
import { openCodeV1PluginSource } from "./agents/opencode/opencode-v1.ts";
import { piExtensionSource } from "./agents/pi/pi.ts";
import { buildHookCommand, installStatusHooks, sessionActivityDir } from "./status-hooks.ts";

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "agentic-workspace-hooks-test-"));
	return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}

describe("generated hook command", () => {
	it("pins the exact command bytes used by Claude hooks", () => {
		expect(buildHookCommand("/tmp/owned/activity", "running")).toBe(
			`sh -c 'set -f; umask 077; D='"'"'/tmp/owned/activity'"'"'; [ -n "$D" ] && [ -d "$D" ] || exit 0; if [ running = idle ] && [ "$(cat "$D/status" 2>/dev/null)" = idle ]; then :; else printf %s running > "$D/status" 2>/dev/null; fi; exit 0'`,
		);
	});

	it("targets only the owned status dir", () => {
		const statusDir = "/tmp/owned-launch-1234/activity";
		const command = buildHookCommand(statusDir, "running");
		expect(command.startsWith("sh -c ")).toBe(true);
		expect(command).toContain(statusDir);
		expect(command).toContain("umask 077");
		expect(command).toContain("set -f");
		expect(command).toContain("exit 0");
		// No home, project, or global path is ever referenced.
		expect(command.includes("~")).toBe(false);
		expect(command.includes("$HOME")).toBe(false);
	});

	it("writes the status sidecar and touches nothing else when executed", async () => {
		const { root, cleanup } = await fixture();
		const project = join(root, "project");
		await mkdir(project, { recursive: true });
		const statePath = join(project, "state.json");
		await writeFile(statePath, '{"version":1}\n');
		const statusDir = join(root, "activity");
		await mkdir(statusDir, { recursive: true, mode: 0o700 });
		try {
			const command = buildHookCommand(statusDir, "waiting");
			const result = spawnSync("/bin/sh", ["-c", command], { encoding: "utf8" });
			expect(result.status).toBe(0);
			expect((await readFile(join(statusDir, "status"), "utf8")).trim()).toBe("waiting");
			// Only our sidecar exists under the owned dir; the project's state.json is byte-identical.
			expect(await readFile(statePath, "utf8")).toBe('{"version":1}\n');
			expect((await readdir(project)).sort()).toEqual(["state.json"]);
		} finally {
			await cleanup();
		}
	});

	it("always exits zero even for a hook whose directory is gone", async () => {
		const { root, cleanup } = await fixture();
		try {
			const command = buildHookCommand(join(root, "missing"), "idle");
			const result = spawnSync("/bin/sh", ["-c", command], { encoding: "utf8" });
			expect(result.status).toBe(0);
		} finally {
			await cleanup();
		}
	});

	it("preserves mtime for repeated idle but updates it when entering idle", async () => {
		const { root, cleanup } = await fixture();
		const statusDir = join(root, "activity");
		const statusPath = join(statusDir, "status");
		const old = new Date(1_000);
		await mkdir(statusDir);
		try {
			await writeFile(statusPath, "idle");
			await utimes(statusPath, old, old);
			const idleMtime = (await stat(statusPath)).mtimeMs;
			spawnSync("/bin/sh", ["-c", buildHookCommand(statusDir, "idle")]);
			expect((await stat(statusPath)).mtimeMs).toBe(idleMtime);

			await writeFile(statusPath, "running");
			await utimes(statusPath, old, old);
			spawnSync("/bin/sh", ["-c", buildHookCommand(statusDir, "idle")]);
			expect((await stat(statusPath)).mtimeMs).not.toBe(old.getTime());
			expect(await readFile(statusPath, "utf8")).toBe("idle");
		} finally {
			await cleanup();
		}
	});
});

describe("provider idle status emitters", () => {
	it("preserves Pi idle mtime until a running-to-idle transition", async () => {
		const { root, cleanup } = await fixture();
		const statusDir = join(root, "activity");
		const statusPath = join(statusDir, "status");
		const old = new Date(1_000);
		await mkdir(statusDir);
		await writeFile(join(statusDir, ".agentic-workspace-launch-owner"), "owned");
		const modulePath = join(root, "pi.mjs");
		await writeFile(modulePath, piExtensionSource(statusDir));
		try {
			const module = (await import(`${new URL(`file://${modulePath}`).href}?${Date.now()}`)) as {
				default(pi: { on(name: string, handler: () => void): void }): void;
			};
			const handlers = new Map<string, () => void>();
			module.default({ on: (name, handler) => handlers.set(name, handler) });
			await writeFile(statusPath, "idle");
			await utimes(statusPath, old, old);
			const idleMtime = (await stat(statusPath)).mtimeMs;
			handlers.get("turn_end")?.();
			expect((await stat(statusPath)).mtimeMs).toBe(idleMtime);

			await writeFile(statusPath, "running");
			await utimes(statusPath, old, old);
			handlers.get("turn_end")?.();
			expect((await stat(statusPath)).mtimeMs).not.toBe(old.getTime());
			expect(await readFile(statusPath, "utf8")).toBe("idle");
		} finally {
			await cleanup();
		}
	});

	it("preserves OpenCode idle mtime until a busy-to-idle transition", async () => {
		const { root, cleanup } = await fixture();
		const statusDir = join(root, "activity");
		const statusPath = join(statusDir, "status");
		const old = new Date(1_000);
		await mkdir(statusDir);
		await writeFile(join(statusDir, ".agentic-workspace-launch-owner"), "owned");
		const modulePath = join(root, "opencode.mjs");
		await writeFile(modulePath, openCodeV1PluginSource(statusDir, "workspace-session", "ses_parent"));
		try {
			const module = (await import(`${new URL(`file://${modulePath}`).href}?${Date.now()}`)) as {
				AgenticWorkspaceStatus(): Promise<{ event(input: unknown): Promise<void> }>;
			};
			const plugin = await module.AgenticWorkspaceStatus();
			const event = (status: "busy" | "idle") =>
				plugin.event({
					event: { type: "session.status", properties: { sessionID: "ses_parent", status: { type: status } } },
				});
			await writeFile(statusPath, "idle");
			await utimes(statusPath, old, old);
			const idleMtime = (await stat(statusPath)).mtimeMs;
			await event("idle");
			expect((await stat(statusPath)).mtimeMs).toBe(idleMtime);

			await writeFile(statusPath, "running");
			await utimes(statusPath, old, old);
			await event("idle");
			expect((await stat(statusPath)).mtimeMs).not.toBe(old.getTime());
			expect(await readFile(statusPath, "utf8")).toBe("idle");
		} finally {
			await cleanup();
		}
	});
});

describe("process-scoped provider install", () => {
	it("does not recreate a removed activity directory from Pi or OpenCode events", async () => {
		const { root, cleanup } = await fixture();
		const statusDir = join(root, "session.activity");
		await mkdir(statusDir);
		const piPath = join(root, "pi.mjs");
		const opencodePath = join(root, "opencode.mjs");
		await writeFile(piPath, piExtensionSource(statusDir));
		await writeFile(opencodePath, openCodeV1PluginSource(statusDir, "session"));
		try {
			await rm(statusDir, { recursive: true });
			const pi = await import(`${new URL(`file://${piPath}`).href}?${Date.now()}`);
			const handlers = new Map<string, () => void>();
			pi.default({ on: (name: string, handler: () => void) => handlers.set(name, handler) });
			handlers.get("session_start")?.();
			const opencode = await import(`${new URL(`file://${opencodePath}`).href}?${Date.now()}`);
			const plugin = await opencode.AgenticWorkspaceStatus({
				client: { session: { get: async () => ({ data: { id: "ses_test" } }) } },
			});
			await plugin["chat.message"]({ sessionID: "ses_test" });
			expect(existsSync(statusDir)).toBe(false);
			await mkdir(statusDir);
			handlers.get("session_start")?.();
			await plugin["chat.message"]({ sessionID: "ses_test" });
			expect(existsSync(join(statusDir, "status"))).toBe(false);
		} finally {
			await cleanup();
		}
	});

	it("installs claude, opencode-v1, and pi artifacts only inside the owned temp dir", async () => {
		const { root, cleanup } = await fixture();
		try {
			const statusDir = sessionActivityDir(root, "sess-1");
			const claude = await installStatusHooks(
				{ bootstrap: "claude", command: ["claude"] },
				{ pluginDir: root, statusDir, sessionId: "sess-1" },
			);
			const opencode = await installStatusHooks(
				{ bootstrap: "opencode-v1", command: ["opencode"] },
				{ pluginDir: root, statusDir, sessionId: "sess-1" },
			);
			const pi = await installStatusHooks(
				{ bootstrap: "pi", command: ["pi"] },
				{ pluginDir: root, statusDir, sessionId: "sess-1" },
			);
			for (const install of [claude, opencode, pi]) {
				for (const path of install.paths) expect(path.startsWith(root)).toBe(true);
			}
			expect(claude.paths).toEqual([join(root, "hooks", "hooks.json")]);
			expect(opencode.paths).toEqual([join(root, "plugins", "agentic-workspace-status.ts")]);
			expect(opencode.env.OPENCODE_CONFIG_DIR).toBe(root);
			expect(pi.args[0]).toBe("--extension");
			expect(pi.args[1]?.startsWith(root)).toBe(true);
			// The generated plugin/extension never reference a home or global path.
			const plugin = await readFile(opencode.paths[0] ?? "", "utf8");
			expect(plugin.includes("~")).toBe(false);
			expect(plugin).toContain(statusDir);
		} finally {
			await cleanup();
		}
	});

	it("rejects an unregistered provider instead of installing globally", async () => {
		const { root, cleanup } = await fixture();
		try {
			await expect(
				installStatusHooks(
					{ bootstrap: "unregistered" as "opencode", command: ["unregistered"] },
					{ pluginDir: root, statusDir: sessionActivityDir(root, "sess-1"), sessionId: "sess-1" },
				),
			).rejects.toThrow();
		} finally {
			await cleanup();
		}
	});

	it("installs Claude settings hook commands", () => {
		const config = claudeHooksConfig("/tmp/owned/activity") as {
			hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
		};
		const commands = Object.values(config.hooks).flatMap((groups) =>
			groups.flatMap((group) => group.hooks.map((hook) => hook.command)),
		);
		expect(commands.length).toBeGreaterThan(0);
		for (const command of commands) expect(command).toContain("exit 0");
	});
});
