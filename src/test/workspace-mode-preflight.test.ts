import { expect, it } from "bun:test";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Core } from "../controller/agentic-workspace.ts";
import { selectedModeForTask, validateSelectedModeByTask } from "../renderer/opentui/workspace/state.ts";
import { OpenTuiWorkspaceController } from "../renderer/opentui/workspace-controller.ts";
import { getBuiltInAgentConfiguration, getDefaultModeCatalog, requireProjectModeCatalog } from "../storage/config.ts";

it("rejects a mode-less project before acquiring stores or a terminal, without changing configuration", async () => {
	const root = await mkdtemp(join(tmpdir(), "workspace-mode-preflight-"));
	const configuration = `agent_configuration: ${JSON.stringify(getBuiltInAgentConfiguration())}\n`;
	const path = join(root, "agentic-workspace.config.yml");
	await writeFile(path, configuration);
	let hosts = 0;
	const core = {
		projectRoot: root,
		getStoredConfig: async () => ({ agentConfiguration: getBuiltInAgentConfiguration() }),
		filesystem: {
			rootDir: root,
			agenticWorkspaceDir: root,
			loadConfig: async () => ({ agentConfiguration: getBuiltInAgentConfiguration() }),
		},
	} as unknown as Core;
	const controller = new OpenTuiWorkspaceController(core, {
		runtime: {
			createHost: async () => {
				hosts++;
				throw new Error("Host must not be acquired");
			},
		},
	});
	try {
		await expect(controller.run()).rejects.toThrow(
			"Project modes are not initialized. Run `agentic-workspace workspace` and configure project modes in the TUI.",
		);
		// A rejected preflight must remain retryable rather than leaving a pending completion.
		await expect(controller.run()).rejects.toThrow(
			"Project modes are not initialized. Run `agentic-workspace workspace` and configure project modes in the TUI.",
		);
		expect(hosts).toBe(0);
		expect(await readdir(root)).toEqual(["agentic-workspace.config.yml"]);
		expect(await readFile(path, "utf8")).toBe(configuration);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it("requires an explicit valid project catalog and resolves selections against its custom default", () => {
	expect(() => requireProjectModeCatalog(null)).toThrow("Project modes are not initialized");
	const catalog = getDefaultModeCatalog();
	const plan = catalog.profiles.plan;
	if (!plan) throw new Error("Missing fixture profile");
	catalog.profiles.review = plan;
	delete catalog.profiles.plan;
	catalog.order = ["review", "build"];
	catalog.defaultModeId = "review";
	const validated = requireProjectModeCatalog({ ...getBuiltInAgentConfiguration(), modes: catalog });
	expect(selectedModeForTask({}, "BACK-1", validated)).toBe("review");
	expect(selectedModeForTask({ selectedModeByTask: { "BACK-1": "plan" } }, "BACK-1", validated)).toBe("review");
	expect(selectedModeForTask({ selectedModeByTask: { "BACK-1": "build" } }, "BACK-1", validated)).toBe("build");
	expect(validateSelectedModeByTask({ "BACK-1": "build", " ": "plan", invalid: 3 })).toEqual({
		"BACK-1": "build",
	});
	expect(validateSelectedModeByTask(["build"])).toEqual({});
	catalog.defaultModeId = "plan";
	expect(() => requireProjectModeCatalog({ ...getBuiltInAgentConfiguration(), modes: catalog })).toThrow(
		"valid defaultModeId",
	);
});
