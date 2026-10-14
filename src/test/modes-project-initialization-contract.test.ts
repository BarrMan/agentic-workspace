import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import {
	getDefaultModeCatalog,
	initializeAgentConfiguration,
	loadAgentConfiguration,
	upsertAgentConfiguration,
} from "../agent-workspace/config.ts";
import type { AgentPreset } from "../agent-workspace/types.ts";
import { runCli } from "../cli/register.ts";
import { Core } from "../core/agentic-workspace.ts";

const roots: string[] = [];
const originalHome = process.env.HOME;
const originalXdg = process.env.XDG_CONFIG_HOME;

async function cli(args: string[], cwd: string) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const out = new Writable({
		write: (chunk, _encoding, done) => {
			stdout.push(chunk.toString());
			done();
		},
	});
	const err = new Writable({
		write: (chunk, _encoding, done) => {
			stderr.push(chunk.toString());
			done();
		},
	});
	const exitCode = await runCli(args, { cwd, stdout: out, stderr: err });
	if (exitCode) throw new Error(stderr.join("") || `CLI exited with ${exitCode}`);
	return { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
}

afterEach(async () => {
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
	if (originalHome === undefined) delete process.env.HOME;
	else process.env.HOME = originalHome;
	if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
	else process.env.XDG_CONFIG_HOME = originalXdg;
});

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "modes-project-init-"));
	roots.push(root);
	return root;
}

describe("project mode initialization contract", () => {
	it("initializes modes with AI integration skipped and preserves resolved root harness configuration", async () => {
		const sandbox = await fixture();
		const home = join(sandbox, "home");
		const project = join(sandbox, "project");
		const configHome = join(home, ".config");
		process.env.HOME = home;
		delete process.env.XDG_CONFIG_HOME;
		await mkdir(join(configHome, "agentic-workspace"), { recursive: true });
		await mkdir(project, { recursive: true });
		const rootConfig = {
			selectedPreset: "team-agent",
			presets: {
				"team-agent": {
					command: "team-agent --resume",
					env: { TEAM: "platform" },
					prepare: "",
					bootstrap: "opencode",
				} satisfies AgentPreset,
			},
			sessions: { worktreePerTask: true, yoloMode: false },
		};
		await writeFile(join(configHome, "agentic-workspace", "agents.json"), `${JSON.stringify(rootConfig, null, 2)}\n`);

		await cli(["init", "Modes contract", "--defaults", "--integration-mode", "none", "--no-git"], project);
		const projectAgentConfigPath = join(project, "agentic-workspace", "agents.json");
		const projectAgentConfig = JSON.parse(await readFile(projectAgentConfigPath, "utf8"));
		expect(projectAgentConfig.modes.defaultModeId).toBe("plan");
		expect(projectAgentConfig.modes.profiles.plan.name).toBe("PLAN");
		expect(projectAgentConfig.modes.profiles.build.name).toBe("BUILD");
		const core = new Core(project);
		const initialized = await initializeAgentConfiguration(core, "project");
		expect(initialized.modes).toEqual(getDefaultModeCatalog());
		expect(initialized.selectedPreset).toBe("team-agent");
		expect(initialized.presets["team-agent"]).toEqual(rootConfig.presets["team-agent"]);
		expect(initialized.sessions).toEqual(rootConfig.sessions);
		expect(await Bun.file(join(project, "AGENTS.md")).exists()).toBe(false);
		expect(await Bun.file(projectAgentConfigPath).exists()).toBe(true);
		expect(JSON.parse(await readFile(join(configHome, "agentic-workspace", "agents.json"), "utf8"))).toEqual(
			rootConfig,
		);
	});

	it("does not regenerate deleted default modes during ordinary read/save or repeated initialization", async () => {
		const root = await fixture();
		const core = new Core(root);
		const configuration = await initializeAgentConfiguration(core, "project");
		delete configuration.modes?.profiles.plan;
		if (configuration.modes) {
			configuration.modes.order = ["build"];
			configuration.modes.defaultModeId = "build";
		}
		await upsertAgentConfiguration(core, "project", configuration);
		const path = join(core.filesystem.agenticWorkspaceDir, "agents.json");
		const before = await readFile(path, "utf8");

		expect((await loadAgentConfiguration(core, "project"))?.modes?.profiles.plan).toBeUndefined();
		expect((await initializeAgentConfiguration(core, "project")).modes?.profiles.plan).toBeUndefined();
		expect(await readFile(path, "utf8")).toBe(before);
	});
});
