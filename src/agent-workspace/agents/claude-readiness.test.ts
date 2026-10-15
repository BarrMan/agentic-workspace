import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "./agents.ts";
import { parseReadinessReceipt } from "../harness.ts";
import { claudeHooksConfig } from "./claude.ts";

type ConfiguredHook = { hooks: Array<{ type: "command"; command: string }> };
type ClaudeHooks = { hooks: Record<string, ConfiguredHook[]> };

async function invoke(command: string, input: string): Promise<void> {
	const child = Bun.spawn(["/bin/sh", "-c", command], { stdin: "pipe", stdout: "ignore", stderr: "ignore" });
	child.stdin.write(input);
	child.stdin.end();
	await child.exited;
}

function commandFor(config: ClaudeHooks, event: string, index: number): string {
	const command = config.hooks[event]?.[index]?.hooks[0]?.command;
	if (!command) throw new Error(`Missing generated ${event} hook command ${index}`);
	return command;
}

function identity(contents: string): { session_id: string; source?: string } | undefined {
	try {
		const value: unknown = JSON.parse(contents);
		if (typeof value !== "object" || value === null) return;
		const parsed = value as { session_id?: unknown; source?: unknown };
		if (typeof parsed.session_id !== "string") return;
		return { session_id: parsed.session_id, source: typeof parsed.source === "string" ? parsed.source : undefined };
	} catch {
		return;
	}
}

describe("Claude launch readiness emitters", () => {
	it("captures provider-observed hook input atomically for startup and prompt acknowledgment", async () => {
		const directory = await mkdtemp(join(tmpdir(), "claude-readiness-"));
		const statusDir = join(directory, "status");
		const launchDirectory = join(directory, "launch");
		await Bun.$`mkdir -p ${statusDir} ${launchDirectory}`;
		try {
			const config = claudeHooksConfig(statusDir, "workspace-id", launchDirectory) as ClaudeHooks;
			const startup = '{"session_id":"provider-observed-id","source":"startup"}\n';
			const prompt = '{"session_id":"provider-observed-id","prompt":"initial"}\n';
			await invoke(commandFor(config, "SessionStart", 1), startup);
			await invoke(commandFor(config, "UserPromptSubmit", 1), prompt);
			const initialized = await readFile(join(launchDirectory, "initialized"), "utf8");
			const accepted = await readFile(join(launchDirectory, "prompt-accepted"), "utf8");
			expect(initialized).toBe(startup);
			expect(accepted).toBe(prompt);
			expect(identity(initialized)?.session_id).toBe("provider-observed-id");
			expect(identity(accepted)?.session_id).toBe("provider-observed-id");
			expect(parseReadinessReceipt(initialized, "workspace-id")).toBe(false);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("does not let prompt-only, idle/Stop, wrong identity, or startup source establish resume", async () => {
		const directory = await mkdtemp(join(tmpdir(), "claude-readiness-negative-"));
		const config = claudeHooksConfig(directory, "workspace-id", directory) as ClaudeHooks;
		try {
			await invoke(commandFor(config, "UserPromptSubmit", 1), '{"session_id":"expected"}');
			expect(identity(await readFile(join(directory, "prompt-accepted"), "utf8"))?.session_id).toBe("expected");
			expect(await Bun.file(join(directory, "initialized")).exists()).toBe(false);
			await invoke(commandFor(config, "Stop", 0), "{}");
			expect(await Bun.file(join(directory, "initialized")).exists()).toBe(false);

			const wrong = '{"session_id":"other","source":"resume"}';
			const startup = '{"session_id":"expected","source":"startup"}';
			for (const receipt of [wrong, startup]) {
				await invoke(commandFor(config, "SessionStart", 1), receipt);
				const observed = identity(await readFile(join(directory, "initialized"), "utf8"));
				expect(observed?.session_id === "expected" && observed.source === "resume").toBe(false);
			}
			expect(identity(wrong)?.session_id === "expected").toBe(false);
			expect(identity(startup)?.source === "resume").toBe(false);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("preserves malformed or missing stdin as diagnosable invalid receipts and tolerates deleted launch dirs", async () => {
		const directory = await mkdtemp(join(tmpdir(), "claude-readiness-invalid-"));
		const config = claudeHooksConfig(directory, "workspace-id", directory) as ClaudeHooks;
		const command = commandFor(config, "SessionStart", 1);
		try {
			await invoke(command, "not-json");
			const malformed = await readFile(join(directory, "initialized"), "utf8");
			expect(identity(malformed)).toBeUndefined();
			await invoke(command, "");
			const missing = await readFile(join(directory, "initialized"), "utf8");
			expect(parseReadinessReceipt(missing)).toBe(false);
			await rm(directory, { recursive: true, force: true });
			await expect(invoke(command, '{"session_id":"late"}')).resolves.toBeUndefined();
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
