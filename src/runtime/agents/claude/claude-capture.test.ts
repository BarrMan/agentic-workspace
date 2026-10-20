import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseReadinessReceipt } from "../../harness.ts";
import { ClaudeAgent, claudeHooksConfig } from "./claude.ts";

const ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER = "11111111-2222-4333-8444-555555555555";
type Hooks = { hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>> };

async function invoke(command: string, payload: string): Promise<void> {
	const child = Bun.spawn(["/bin/sh", "-c", command], { stdin: "pipe", stdout: "ignore", stderr: "ignore" });
	child.stdin.write(payload);
	child.stdin.end();
	await child.exited;
}

async function capture(root: string, cwd: string, env: Record<string, string> = {}) {
	return new ClaudeAgent().reconcileIdentity({
		intent: { kind: "new" },
		preset: { command: ["claude"] } as never,
		cwd,
		env,
		launchDirectory: root,
		preparedIdentity: { id: ID, basis: "client-established" },
		signal: new AbortController().signal,
	});
}

describe("Claude provider-owned capture", () => {
	it("parses generated SessionStart/UserPromptSubmit payloads", async () => {
		const root = await mkdtemp(join(tmpdir(), "claude-capture-hooks-"));
		try {
			const hooks = claudeHooksConfig(root, "workspace", root) as Hooks;
			await invoke(hooks.hooks.SessionStart![1]!.hooks[0]!.command, JSON.stringify({ session_id: ID }));
			await invoke(hooks.hooks.UserPromptSubmit![1]!.hooks[0]!.command, JSON.stringify({ session_id: ID }));
			expect(await capture(root, root)).toEqual({ id: ID, basis: "provider-confirmed" });
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("falls back from malformed/missing hooks to only the exact transcript under configured root", async () => {
		const root = await mkdtemp(join(tmpdir(), "claude-capture-transcript-"));
		const cwd = join(root, "project (copy)");
		const config = join(root, "alternate");
		const transcript = join(config, "projects", cwd.replace(/[^A-Za-z0-9-]/g, "-"), `${ID}.jsonl`);
		try {
			await mkdir(join(config, "projects", cwd.replace(/[^A-Za-z0-9-]/g, "-")), { recursive: true });
			await writeFile(join(root, "initialized"), '"plain-string"');
			await writeFile(transcript, "{}");
			expect(await capture(root, cwd, { CLAUDE_CONFIG_DIR: config })).toEqual({ id: ID, basis: "provider-confirmed" });
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("rejects conflicting hook IDs and never treats a transcript as readiness", async () => {
		const root = await mkdtemp(join(tmpdir(), "claude-capture-conflict-"));
		const cwd = join(root, "project");
		try {
			const hooks = claudeHooksConfig(root, "workspace", root) as Hooks;
			await invoke(hooks.hooks.SessionStart![1]!.hooks[0]!.command, JSON.stringify({ session_id: ID }));
			await invoke(hooks.hooks.UserPromptSubmit![1]!.hooks[0]!.command, JSON.stringify({ session_id: OTHER }));
			await expect(capture(root, cwd)).rejects.toThrow("conflicting");
			const readiness = new ClaudeAgent().readiness({ kind: "new" }, root, { id: ID, basis: "client-established" });
			expect(parseReadinessReceipt("{}", ID)).toBe(false);
			expect(readiness.promptAccepted?.path).toBe(join(root, "prompt-accepted"));
			expect(await Bun.file(readiness.promptAccepted!.path).exists()).toBe(true);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("rejects symlink and non-regular transcript evidence", async () => {
		const root = await mkdtemp(join(tmpdir(), "claude-capture-filetype-"));
		const cwd = join(root, "project");
		const config = join(root, "config");
		const dir = join(config, "projects", cwd.replace(/[^A-Za-z0-9-]/g, "-"));
		try {
			await mkdir(dir, { recursive: true });
			const transcript = join(dir, `${ID}.jsonl`);
			await writeFile(join(root, "decoy"), "{}");
			await symlink(join(root, "decoy"), transcript);
			await expect(capture(root, cwd, { CLAUDE_CONFIG_DIR: config })).rejects.toThrow("evidence");
			await rm(transcript);
			await mkdir(transcript);
			await expect(capture(root, cwd, { CLAUDE_CONFIG_DIR: config })).rejects.toThrow("evidence");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
