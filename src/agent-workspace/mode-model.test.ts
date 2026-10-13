import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Core } from "../core/backlog.ts";
import {
	openCodeExportArguments,
	parseOpenCodeSessionExport,
	resolveCallingMode,
	resolveCurrentModel,
} from "./mode-model.ts";
import type { AgentSession } from "./types.ts";

let command: string;
let directory: string;
beforeAll(async () => {
	directory = await mkdtemp(join(tmpdir(), "mode-model-current-config-"));
	command = join(directory, "opencode");
	await writeFile(command, '#!/bin/sh\nprintf "opencode v2.1.0\\n"\n');
	await chmod(command, 0o700);
});
afterAll(async () => await rm(directory, { recursive: true, force: true }));
const core = {
	filesystem: {
		rootDir: "/project",
		loadTask: async () => ({
			id: "TASK-1",
			agentConfiguration: {
				selectedPreset: "opencode",
				presets: {
					opencode: { command, env: { CURRENT: "yes" }, prepare: "", bootstrap: "opencode" },
					claude: { command: "claude", env: {}, prepare: "", bootstrap: "claude" },
				},
			},
		}),
	},
} as unknown as Core;

function currentSession(overrides: Partial<AgentSession> = {}): AgentSession {
	return {
		id: "backlog-session",
		taskId: "TASK-1",
		preset: "opencode",
		pathContext: { projectDir: "/project", worktreeDir: process.cwd(), taskDir: "/task" },
		tmuxName: "backlog-task-1-session",
		nativeSessionId: "native-opencode-id",
		cwd: "/project",
		createdAt: "2026-01-01T00:00:00Z",
		status: "stopped",
		outputPath: "/task/output",
		bootstrapPath: "/task/bootstrap",
		...overrides,
	};
}

function callingContext(sessionId = "backlog-session", nativeSessionId = "native-opencode-id") {
	return {
		v: 2 as const,
		paneId: "%42",
		rootDir: "/project",
		conversation: { taskId: "TASK-1", modeId: "plan", sessionId },
		nativeSessionId,
	};
}

const exportJson = JSON.stringify({
	info: { id: "native-opencode-id" },
	messages: [
		{ info: { role: "assistant", providerID: "provider", modelID: "old" } },
		{ info: { role: "user" } },
		{ info: { role: "assistant", providerID: "provider", modelID: "latest" } },
	],
});

const v2ExportJson = JSON.stringify({
	info: { id: "native-opencode-id" },
	messages: [
		{ type: "assistant", model: { providerID: "provider", id: "old" } },
		{ type: "user" },
		{ type: "assistant", model: { providerID: "provider", id: "latest" } },
	],
});

describe("mode model helper", () => {
	it("infers actual mode for non-OpenCode sessions without exporting", async () => {
		let exportCalled = false;
		let suppliedRoot: string | undefined;
		const session = currentSession({
			preset: "claude",
		});
		const modeId = await resolveCallingMode(core, {
			context: async (options) => {
				suppliedRoot = options?.rootDir;
				return {
					v: 2,
					paneId: "%42",
					rootDir: "/project",
					conversation: { taskId: "TASK-1", modeId: "plan", sessionId: "backlog-session" },
					nativeSessionId: "native-opencode-id",
				};
			},
			readSessions: async () => ({
				version: 2,
				taskId: "TASK-1",
				sessions: [],
				legacyModeId: "build",
				modes: { build: { sessions: [session] } },
			}),
			exportSession: async () => {
				exportCalled = true;
				return exportJson;
			},
		});
		expect(modeId).toBe("build");
		expect(suppliedRoot).toBe("/project");
		expect(exportCalled).toBe(false);
	});

	it("rejects mode inference without valid conversation context", async () => {
		await expect(resolveCallingMode(core, { context: async () => undefined })).rejects.toThrow(/conversation context/i);
	});

	it("uses the actual session-owning mode and latest OpenCode assistant model", async () => {
		let exportedSession: AgentSession | undefined;
		let exportedHarness: string | undefined;
		const result = await resolveCurrentModel(core, {
			context: async () => ({
				...callingContext(),
			}),
			readSessions: async () => ({
				version: 2,
				taskId: "TASK-1",
				sessions: [],
				legacyModeId: "build",
				modes: { build: { sessions: [currentSession()] } },
			}),
			exportSession: async (session, preset, harness) => {
				expect(preset.command).toBe(command);
				expect(preset.env.CURRENT).toBe("yes");
				expect(preset.env.BACKLOG_WORKTREE_DIR).toBe(process.cwd());
				exportedSession = session;
				exportedHarness = harness;
				return exportJson;
			},
		});
		expect(result).toEqual({ modeId: "build", modelId: "provider/latest" });
		expect(exportedSession?.nativeSessionId).toBe("native-opencode-id");
		expect(exportedHarness).toBe("opencode-v2");
	});

	it("uses the versioned OpenCode export command and v2 export schema", () => {
		expect(openCodeExportArguments("opencode-v1", "native-opencode-id")).toEqual(["export", "native-opencode-id"]);
		expect(openCodeExportArguments("opencode-v2", "native-opencode-id")).toEqual([
			"session",
			"export",
			"--standalone",
			"native-opencode-id",
		]);
		expect(parseOpenCodeSessionExport(v2ExportJson, "native-opencode-id")).toEqual({
			provider: "provider",
			model: "latest",
		});
	});

	it("requires context, a unique recorded session, current OpenCode configuration and native ID", async () => {
		await expect(resolveCurrentModel(core, { context: async () => undefined })).rejects.toThrow(
			/valid calling workspace/i,
		);
		const context = async () => callingContext("missing");
		await expect(
			resolveCurrentModel(core, {
				context,
				readSessions: async () => ({ version: 2, taskId: "TASK-1", sessions: [], legacyModeId: "build", modes: {} }),
			}),
		).rejects.toThrow(/uniquely identify/i);
		const withSession = (session: AgentSession) => async () => ({
			version: 2 as const,
			taskId: "TASK-1",
			sessions: [],
			legacyModeId: "build",
			modes: { build: { sessions: [session] } },
		});
		await expect(
			resolveCurrentModel(core, {
				context: async () => ({
					...callingContext(),
				}),
				readSessions: withSession(
					currentSession({
						preset: "claude",
					}),
				),
			}),
		).rejects.toThrow(/configured with OpenCode/i);
		await expect(
			resolveCurrentModel(core, {
				context: async () => {
					const context = callingContext();
					return {
						v: context.v,
						paneId: context.paneId,
						rootDir: context.rootDir,
						conversation: context.conversation,
					};
				},
				readSessions: withSession(currentSession({ nativeSessionId: undefined })),
			}),
		).rejects.toThrow(/native session ID/i);
	});

	it("rejects missing or wrong export identity and missing latest assistant model", () => {
		expect(() =>
			parseOpenCodeSessionExport(JSON.stringify({ info: { id: "other" }, messages: [] }), "native-opencode-id"),
		).toThrow(/identity/i);
		expect(() =>
			parseOpenCodeSessionExport(JSON.stringify({ messages: [{ info: { role: "assistant" } }] }), "native-opencode-id"),
		).toThrow(/identity/i);
		expect(() =>
			parseOpenCodeSessionExport(
				JSON.stringify({ info: { id: "native-opencode-id" }, messages: [{ info: { role: "assistant" } }] }),
				"native-opencode-id",
			),
		).toThrow(/last-used model/i);
	});
});
