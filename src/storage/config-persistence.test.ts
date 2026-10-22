import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgenticWorkspaceConfig } from "../model/types.ts";
import {
	type AgentConfigurationStorage,
	readRootConfiguration,
	rootConfigFilePath,
	updateStoredAgentConfiguration,
} from "./config.ts";
import { parseConfig, serializeConfig } from "./config-codec.ts";

describe("exact configuration persistence", () => {
	const directories: string[] = [];
	afterEach(async () => {
		await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
	});

	it("serializes concurrent project updates and preserves unrelated configuration", async () => {
		const root = await mkdtemp(join(tmpdir(), "configuration-persistence-"));
		directories.push(root);
		let saved: AgenticWorkspaceConfig = { ...parseConfig("", "config.yml"), projectName: "Keep" };
		let writes = 0;
		const storage: AgentConfigurationStorage = {
			configFilePath: join(root, "config.yml"),
			loadConfig: async () => structuredClone(saved),
			saveConfig: async (config) => {
				writes++;
				saved = structuredClone(config);
			},
		};
		await Promise.all([
			updateStoredAgentConfiguration(storage, "project", (current) => ({ ...current, selectedPreset: "pi" })),
			updateStoredAgentConfiguration(storage, "project", (current) => ({ ...current, sessions: { yoloMode: true } })),
		]);
		expect(saved.projectName).toBe("Keep");
		expect(saved.agentConfiguration).toEqual({ selectedPreset: "pi", sessions: { yoloMode: true } });
		await updateStoredAgentConfiguration(storage, "project", (current) => {
			if (!current) throw new Error("Expected stored configuration");
			return current;
		});
		expect(writes).toBe(2);
	});

	it("distinguishes absent, unreadable, and corrupt root configuration without rewriting", async () => {
		const root = await mkdtemp(join(tmpdir(), "configuration-persistence-"));
		directories.push(root);
		expect(await readRootConfiguration(join(root, "missing.yml"))).toBeNull();
		await expect(readRootConfiguration(root)).rejects.toThrow();
		const path = join(root, "corrupt.yml");
		await writeFile(path, "agentConfiguration: [");
		await expect(readRootConfiguration(path)).rejects.toThrow("Invalid agent configuration");
		expect(await readFile(path, "utf8")).toBe("agentConfiguration: [");
	});

	it("updates root configuration atomically while preserving other fields and permissions", async () => {
		const root = await mkdtemp(join(tmpdir(), "configuration-persistence-"));
		directories.push(root);
		const previous = process.env.XDG_CONFIG_HOME;
		process.env.XDG_CONFIG_HOME = root;
		try {
			const path = rootConfigFilePath();
			await mkdir(join(root, "agentic-workspace"));
			await writeFile(path, serializeConfig({ ...parseConfig("", path), projectName: "Keep" }), { mode: 0o640 });
			const storage: AgentConfigurationStorage = {
				configFilePath: "unused",
				loadConfig: async () => {
					throw new Error("Unexpected project read");
				},
				saveConfig: async () => {
					throw new Error("Unexpected project write");
				},
			};
			await updateStoredAgentConfiguration(storage, "root", () => ({ selectedPreset: "pi" }));
			expect(await readRootConfiguration(path)).toEqual({ selectedPreset: "pi" });
			expect(parseConfig(await readFile(path, "utf8"), path).projectName).toBe("Keep");
			expect((await stat(path)).mode & 0o777).toBe(0o640);
		} finally {
			if (previous === undefined) delete process.env.XDG_CONFIG_HOME;
			else process.env.XDG_CONFIG_HOME = previous;
		}
	});
});
