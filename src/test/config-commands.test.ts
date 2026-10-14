import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Writable } from "node:stream";
import { $ as shell } from "bun";
import type { PromptRunner } from "../cli/features/config/advanced-wizard.ts";
import { configureAdvancedSettings } from "../cli/features/config/configure-advanced-settings.ts";
import { runCli } from "../cli/register.ts";
import { DEFAULT_STATUSES } from "../constants/index.ts";
import { Core } from "../core/agentic-workspace.ts";
import { createUniqueTestDir, initGitRepo, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
const CLI_COMMAND = ["agentic-workspace"];

function $(parts: TemplateStringsArray, ...values: unknown[]) {
	const source = parts.reduce(
		(text, part, index) =>
			`${text}${part}${Array.isArray(values[index]) ? values[index].map((value) => JSON.stringify(value)).join(" ") : values[index] === undefined ? "" : JSON.stringify(values[index])}`,
		"",
	);
	if (!source.startsWith('"agentic-workspace"')) return shell(parts, ...values);
	const args =
		source
			.match(/"(?:\\.|[^"\\])*"|'[^']*'|[^\s]+/g)
			?.map((arg) =>
				arg.startsWith('"') ? (JSON.parse(arg) as string) : arg.startsWith("'") ? arg.slice(1, -1) : arg,
			) ?? [];
	const config: { cwd?: string; env?: Record<string, string | undefined>; nothrow?: boolean } = {};
	const result = async () => {
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
		const originalEnv = config.env
			? Object.fromEntries(Object.keys(config.env).map((key) => [key, process.env[key]]))
			: undefined;
		if (config.env)
			for (const [key, value] of Object.entries(config.env)) {
				if (value === undefined) delete process.env[key];
				else process.env[key] = value;
			}
		let exitCode: number;
		try {
			exitCode = await runCli(args.slice(CLI_COMMAND.length), { cwd: config.cwd, stdout: out, stderr: err });
		} finally {
			if (originalEnv)
				for (const [key, value] of Object.entries(originalEnv)) {
					if (value === undefined) delete process.env[key];
					else process.env[key] = value;
				}
		}
		const value = { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
		if (value.exitCode && !config.nothrow) throw new Error(value.stderr || `CLI exited with ${value.exitCode}`);
		return value;
	};
	const chain = {
		cwd(value: string) {
			config.cwd = value;
			return chain;
		},
		env(value: Record<string, string | undefined>) {
			config.env = value;
			return chain;
		},
		nothrow() {
			config.nothrow = true;
			return chain;
		},
		quiet() {
			return result();
		},
		async text() {
			return (await result()).stdout;
		},
	};
	return chain;
}

describe("Config commands", () => {
	let core: Core;
	let projectInitialized = false;

	// The suite mixes in-process parseConfig cases with config-file and CLI cases. Only the latter
	// need a project on disk, so initialization is on demand instead of once per test.
	async function ensureProject(): Promise<void> {
		if (projectInitialized) return;
		await initializeFilesystemTestProject(core, "Test Config Project");
		projectInitialized = true;
	}

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-config-commands");
		await mkdir(TEST_DIR, { recursive: true });

		core = new Core(TEST_DIR);
		projectInitialized = false;
	});

	function createPromptStub(sequence: Array<Record<string, unknown>>): PromptRunner {
		const stub: PromptRunner = async () => {
			const response = sequence.shift();
			if (!response) {
				throw new Error("Advanced config wizard requested an unexpected prompt.");
			}
			return response;
		};
		return stub;
	}

	it("configureAdvancedSettings keeps defaults when no changes requested", async () => {
		await ensureProject();
		const promptStub = createPromptStub([
			{ installCompletions: false },
			{ checkActiveBranches: true },
			{ remoteOperations: true },
			{ activeBranchDays: 30 },
			{ bypassGitHooks: false },
			{ enableZeroPadding: false },
			{ editor: "" },
			{ configureWebUI: false },
		]);

		const { mergedConfig, installShellCompletions } = await configureAdvancedSettings(core, {
			promptImpl: promptStub,
		});

		expect(installShellCompletions).toBe(false);
		expect(mergedConfig.checkActiveBranches).toBe(true);
		expect(mergedConfig.remoteOperations).toBe(true);
		expect(mergedConfig.activeBranchDays).toBe(30);
		expect(mergedConfig.bypassGitHooks).toBe(false);
		expect(mergedConfig.zeroPaddedIds).toBeUndefined();
		expect(mergedConfig.defaultEditor).toBeUndefined();
		expect(mergedConfig.defaultPort).toBe(6420);
		expect(mergedConfig.autoOpenBrowser).toBe(true);

		const reloadedConfig = await core.filesystem.loadConfig();
		expect(reloadedConfig?.defaultPort).toBe(6420);
		expect(reloadedConfig?.autoOpenBrowser).toBe(true);
	});

	it("configureAdvancedSettings applies wizard selections", async () => {
		await ensureProject();
		const promptStub = createPromptStub([
			{ installCompletions: true },
			{ checkActiveBranches: true },
			{ remoteOperations: false },
			{ activeBranchDays: 14 },
			{ bypassGitHooks: true },
			{ enableZeroPadding: true },
			{ paddingWidth: 4 },
			{ editor: "agentic-workspace-test-editor" },
			{ configureWebUI: true },
			{ defaultPort: 7007, autoOpenBrowser: false },
		]);

		const { mergedConfig, installShellCompletions } = await configureAdvancedSettings(core, {
			promptImpl: promptStub,
			isEditorAvailable: async (editor) => editor === "agentic-workspace-test-editor",
		});

		expect(installShellCompletions).toBe(true);
		expect(mergedConfig.checkActiveBranches).toBe(true);
		expect(mergedConfig.remoteOperations).toBe(false);
		expect(mergedConfig.activeBranchDays).toBe(14);
		expect(mergedConfig.bypassGitHooks).toBe(true);
		expect(mergedConfig.zeroPaddedIds).toBe(4);
		expect(mergedConfig.defaultEditor).toBe("agentic-workspace-test-editor");
		expect(mergedConfig.defaultPort).toBe(7007);
		expect(mergedConfig.autoOpenBrowser).toBe(false);

		const reloadedConfig = await core.filesystem.loadConfig();
		expect(reloadedConfig?.zeroPaddedIds).toBe(4);
		expect(reloadedConfig?.defaultEditor).toBe("agentic-workspace-test-editor");
		expect(reloadedConfig?.defaultPort).toBe(7007);
		expect(reloadedConfig?.autoOpenBrowser).toBe(false);
		expect(reloadedConfig?.bypassGitHooks).toBe(true);
	});

	it("exposes config list/get/set subcommands", async () => {
		await ensureProject();
		const listOutput = await $`${CLI_COMMAND} config list`.cwd(TEST_DIR).text();
		expect(listOutput).toContain("Configuration:");

		await $`${CLI_COMMAND} config set defaultPort 7001`.cwd(TEST_DIR).quiet();

		const portOutput = await $`${CLI_COMMAND} config get defaultPort`.cwd(TEST_DIR).text();
		expect(portOutput.trim()).toBe("7001");
	});

	it("round-trips hideEmptyColumns through config get/set/list", async () => {
		await ensureProject();
		const defaultGet = await $`${CLI_COMMAND} config get hideEmptyColumns`.cwd(TEST_DIR).text();
		expect(defaultGet.trim()).toBe("false");

		await $`${CLI_COMMAND} config set hideEmptyColumns true`.cwd(TEST_DIR).quiet();

		const afterSet = await $`${CLI_COMMAND} config get hideEmptyColumns`.cwd(TEST_DIR).text();
		expect(afterSet.trim()).toBe("true");

		const listOutput = await $`${CLI_COMMAND} config list`.cwd(TEST_DIR).text();
		expect(listOutput).toContain("hideEmptyColumns: true");
	});

	it("parses block-style YAML sequences identically to inline arrays for list keys", () => {
		const inline = core.filesystem.parseConfig(
			'project_name: "P"\nstatuses: ["To Do", "Done"]\nlabels: ["a", "b"]\ntypes: ["bug", "epic"]\npriorities: ["Critical", "Low"]\n',
		);
		const block = core.filesystem.parseConfig(
			'project_name: "P"\nstatuses:\n  - To Do\n  - Done\nlabels:\n  - a\n  - b\ntypes:\n  - bug\n  - epic\npriorities:\n  - Critical\n  - Low\n',
		);

		expect(block.statuses).toEqual(inline.statuses);
		expect(block.labels).toEqual(inline.labels);
		expect(block.types).toEqual(inline.types);
		expect(block.priorities).toEqual(inline.priorities);
		expect(block.priorities).toEqual(["Critical", "Low"]);
	});

	it("preserves commas inside quoted list values", () => {
		const config = core.filesystem.parseConfig('project_name: "P"\npriorities: ["Very High, Almost", "Low"]\n');
		expect(config.priorities).toEqual(["Very High, Almost", "Low"]);
	});

	it("honors block-style priorities end-to-end through config get and task create", async () => {
		await ensureProject();
		const configPath = core.filesystem.configFilePath;
		const existing = await Bun.file(configPath).text();
		await Bun.write(configPath, `${existing.trimEnd()}\npriorities:\n  - Critical\n  - Normal\n`);

		const priorities = await $`${CLI_COMMAND} config get priorities`.cwd(TEST_DIR).text();
		expect(priorities.trim()).toBe("Critical, Normal");

		const created = await $`${CLI_COMMAND} task create "Block priority task" --priority Critical --plain`
			.cwd(TEST_DIR)
			.text();
		expect(created).toContain("Priority: Critical");
	});

	it("gives accurate guidance when setting list keys and consistent unknown-key lists", async () => {
		await ensureProject();
		const priorities = await $`${CLI_COMMAND} config set priorities High`.cwd(TEST_DIR).nothrow().quiet();
		const prioritiesError = priorities.stderr.toString();
		expect(priorities.exitCode).not.toBe(0);
		expect(prioritiesError).toContain("priorities cannot be set directly");
		expect(prioritiesError).toContain("agentic-workspace config get priorities");
		expect(prioritiesError).not.toContain("list-priorities");

		const types = await $`${CLI_COMMAND} config set types bug`.cwd(TEST_DIR).nothrow().quiet();
		const typesError = types.stderr.toString();
		expect(types.exitCode).not.toBe(0);
		expect(typesError).toContain("types cannot be set directly");
		expect(typesError).not.toContain("Unknown config key");

		const unknownGet = await $`${CLI_COMMAND} config get nosuchkey`.cwd(TEST_DIR).nothrow().quiet();
		const unknownSet = await $`${CLI_COMMAND} config set nosuchkey value`.cwd(TEST_DIR).nothrow().quiet();
		const getKeys = unknownGet.stderr.toString().match(/Available keys: .*/)?.[0];
		const setKeys = unknownSet.stderr.toString().match(/Available keys: .*/)?.[0];
		expect(getKeys).toBeDefined();
		expect(setKeys).toEqual(getKeys);
	});

	it("surfaces milestones in config get/list from milestone files", async () => {
		await ensureProject();
		await core.filesystem.createMilestone("Release 1");

		const milestonesOutput = await $`${CLI_COMMAND} config get milestones`.cwd(TEST_DIR).text();
		expect(milestonesOutput.trim()).toBe("m-0");

		const listOutput = await $`${CLI_COMMAND} config list`.cwd(TEST_DIR).text();
		expect(listOutput).toContain("milestones: [m-0]");
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	it("should preserve other config values when setting defaultEditor", async () => {
		await ensureProject();
		let config = await core.filesystem.loadConfig();
		const originalProjectName = config?.projectName;
		const originalStatuses = config ? [...config.statuses] : [];

		// Set defaultEditor
		if (config) {
			config.defaultEditor = "code";
			await core.filesystem.saveConfig(config);
		}

		// Reload and verify other values are preserved
		config = await core.filesystem.loadConfig();
		expect(config?.defaultEditor).toBe("code");
		expect(config?.projectName).toBe(originalProjectName ?? "");
		expect(config?.statuses).toEqual(originalStatuses);
	});

	it("round-trips defaultAssignee through config set, get, and list", async () => {
		await ensureProject();
		const unset = await $`${CLI_COMMAND} config get defaultAssignee`.cwd(TEST_DIR).nothrow().quiet();
		expect(unset.exitCode).toBe(0);
		expect(unset.stdout.toString().trim()).toBe("");

		const set = await $`${CLI_COMMAND} config set defaultAssignee ${"@alice, @bob"}`.cwd(TEST_DIR).nothrow().quiet();
		expect(set.exitCode).toBe(0);

		core.filesystem.invalidateConfigCache();
		expect((await core.filesystem.loadConfig())?.defaultAssignee).toEqual(["@alice", "@bob"]);

		const get = await $`${CLI_COMMAND} config get defaultAssignee`.cwd(TEST_DIR).nothrow().quiet();
		expect(get.stdout.toString().trim()).toBe("@alice, @bob");

		const list = await $`${CLI_COMMAND} config list`.cwd(TEST_DIR).nothrow().quiet();
		expect(list.stdout.toString()).toContain("defaultAssignee: [@alice, @bob]");

		const cleared = await $`${CLI_COMMAND} config set defaultAssignee ""`.cwd(TEST_DIR).quiet();
		expect(cleared.exitCode).toBe(0);

		core.filesystem.invalidateConfigCache();
		expect((await core.filesystem.loadConfig())?.defaultAssignee).toBeUndefined();
	});

	it("reads defaultAssignee written as a scalar, a block sequence, or with a trailing comment", async () => {
		await ensureProject();
		const configPath = core.filesystem.configFilePath;
		const baseConfig = await Bun.file(configPath).text();
		const loadAssignee = async (line: string) => {
			await Bun.write(configPath, `${baseConfig}${line}\n`);
			core.filesystem.invalidateConfigCache();
			return (await core.filesystem.loadConfig())?.defaultAssignee;
		};

		expect(await loadAssignee('default_assignee: "@legacy"')).toEqual(["@legacy"]);
		expect(await loadAssignee('default_assignee:\n  - "@alice"\n  - "@bob"')).toEqual(["@alice", "@bob"]);
		// YAML comments belong to the file, not to the assignee.
		expect(await loadAssignee('default_assignee: "@alice" # owner')).toEqual(["@alice"]);
		expect(await loadAssignee('default_assignee: ["@alice", "@bob"] # owners')).toEqual(["@alice", "@bob"]);
	});

	it("round-trips a defaultAssignee containing characters that need YAML escaping", async () => {
		await ensureProject();
		const quoted = '@a"b\\c';
		const set = await $`${CLI_COMMAND} config set defaultAssignee ${quoted}`.cwd(TEST_DIR).nothrow().quiet();
		expect(set.exitCode).toBe(0);

		expect(await Bun.file(core.filesystem.configFilePath).text()).toContain('default_assignee: ["@a\\"b\\\\c"]');

		core.filesystem.invalidateConfigCache();
		expect((await core.filesystem.loadConfig())?.defaultAssignee).toEqual([quoted]);

		const created = await core.createTaskFromInput({ title: "Escaped default assignee" });
		expect(created.task.assignee).toEqual([quoted]);
	});

	it("refuses to load a list config value that is not valid YAML, naming the file and the key", async () => {
		await ensureProject();
		const configPath = core.filesystem.configFilePath;
		const baseConfig = await Bun.file(configPath).text();

		for (const key of ["statuses", "labels", "types", "priorities", "default_assignee"]) {
			// Truncated array, and an unbalanced quote that still opens and closes with brackets.
			for (const line of [`${key}: ["a`, `${key}: ["a]`]) {
				await Bun.write(configPath, `${baseConfig}${line}\n`);
				core.filesystem.invalidateConfigCache();

				const failure = await core.filesystem.loadConfig().then(
					() => undefined,
					(error: unknown) => (error instanceof Error ? error.message : String(error)),
				);
				expect(failure).toBeDefined();
				expect(failure).toStartWith("AgenticWorkspace could not start because");
				expect(failure).toContain(configPath);
				expect(failure).toContain(`invalid value for "${key}"`);
			}
		}
	});

	it("refuses to load a list config value YAML reads but the key cannot hold, naming the type problem", async () => {
		await ensureProject();
		const configPath = core.filesystem.configFilePath;
		const baseConfig = await Bun.file(configPath).text();

		for (const key of ["statuses", "labels", "types", "priorities", "default_assignee"]) {
			// A single name is the legacy spelling of default_assignee, so only that key accepts a scalar.
			const wrongTyped = [
				[`${key}: {name: "@alice"}`, "a mapping"],
				[`${key}: 42`, "a number"],
				[`${key}: true`, "a boolean"],
				...(key === "default_assignee" ? [] : [[`${key}: To Do`, "a scalar"]]),
			];
			const expected = key === "default_assignee" ? "a list or a single name" : "a list";

			for (const [line, shape] of wrongTyped) {
				await Bun.write(configPath, `${baseConfig}${line}\n`);
				core.filesystem.invalidateConfigCache();

				const failure = await core.filesystem.loadConfig().then(
					() => undefined,
					(error: unknown) => (error instanceof Error ? error.message : String(error)),
				);
				expect(failure).toBeDefined();
				expect(failure).toStartWith("AgenticWorkspace could not start because");
				expect(failure).toContain(configPath);
				expect(failure).toContain(`invalid value for "${key}"`);
				expect(failure).toContain(`expected ${expected}, got ${shape}`);
			}
		}
	});

	it("still accepts the value shapes a list key legitimately has", () => {
		// Strictness must not reach an explicitly empty value, a legacy single assignee name, or a list.
		expect(core.filesystem.parseConfig('project_name: "P"\nstatuses:\n').statuses).toEqual([...DEFAULT_STATUSES]);
		expect(core.filesystem.parseConfig('project_name: "P"\nstatuses: []\n').statuses).toEqual([]);
		expect(core.filesystem.parseConfig('project_name: "P"\nlabels:\n').labels).toEqual([]);
		expect(core.filesystem.parseConfig('project_name: "P"\ndefault_assignee: "@alex"\n').defaultAssignee).toEqual([
			"@alex",
		]);
		expect(core.filesystem.parseConfig('project_name: "P"\ndefault_assignee:\n').defaultAssignee).toEqual([]);
		expect(core.filesystem.parseConfig('project_name: "P"\ndefault_assignee:\n  - "@a"\n').defaultAssignee).toEqual([
			"@a",
		]);
		// Numbers inside a list are still coerced to their written form rather than rejected.
		expect(core.filesystem.parseConfig('project_name: "P"\nstatuses: [1, 2]\n').statuses).toEqual(["1", "2"]);
	});

	it("keeps a malformed list value from changing how another list key reads", () => {
		// The commas inside the quoted labels are only safe when labels is parsed as YAML; the
		// malformed statuses value must be reported instead of downgrading labels to a text split.
		expect(() => core.filesystem.parseConfig('project_name: "P"\nstatuses: ["To Do]\nlabels: ["a, b", "c"]\n')).toThrow(
			'invalid value for "statuses"',
		);
		expect(core.filesystem.parseConfig('project_name: "P"\nlabels: ["a, b", "c"]\n').labels).toEqual(["a, b", "c"]);
	});

	it("reads the config key at column 0, not an indented look-alike inside another key's value", () => {
		// A nested mapping and a block scalar can both contain a line that looks like a config key.
		const nested = core.filesystem.parseConfig(
			'project_name: "P"\nstatuses: [top]\nmeta_thing:\n  statuses: [nested1, nested2]\n',
		);
		expect(nested.statuses).toEqual(["top"]);

		const blockScalar = core.filesystem.parseConfig(
			'project_name: "P"\nstatuses: [real]\nnotes_thing: |\n  statuses: [fake]\n',
		);
		expect(blockScalar.statuses).toEqual(["real"]);

		// A block-sequence top-level key must win over the look-alike too, and a malformed
		// look-alike must not make the real key unreadable.
		const blockSequence = core.filesystem.parseConfig(
			'project_name: "P"\nstatuses:\n  - Top\nmeta_thing:\n  statuses: [nested]\n',
		);
		expect(blockSequence.statuses).toEqual(["Top"]);
		expect(
			core.filesystem.parseConfig('project_name: "P"\nstatuses: [top]\nmeta_thing:\n  statuses: ["broken\n').statuses,
		).toEqual(["top"]);

		// YAML forbids tabs as indentation; do not depend on Bun YAML parser versions disagreeing here.
		expect(() => core.filesystem.parseConfig('project_name: "P"\n\tstatuses: ["tabbed"]\n')).toThrow(
			'invalid value for "statuses"',
		);
		expect(
			core.filesystem.parseConfig('project_name: "P"\nstatuses:\n  - |2-\n    first line\n    \ttabbed scalar\n')
				.statuses,
		).toEqual(["first line\n\ttabbed scalar"]);
		expect(core.filesystem.parseConfig('project_name: "P"\n  statuses: ["spaced"]\n').statuses).toEqual(["spaced"]);
	});

	it("does not blame a valid list key for a malformed value under a key AgenticWorkspace does not read", () => {
		// Any mapping key ends the previous key's block, whatever characters its name uses. Without that,
		// the malformed custom-setting line folds into the statuses block and startup blames statuses —
		// an error the user cannot fix by editing the key it names.
		for (const unreadKey of ["custom-setting", "my.setting", '"quoted-key"', "2fa"]) {
			const config = core.filesystem.parseConfig(`project_name: "P"\nstatuses: [Queued, Done]\n${unreadKey}: ["bad]\n`);
			expect(config.statuses).toEqual(["Queued", "Done"]);
		}

		// A block-sequence value survives the same shape, and each key is still reported on its own.
		expect(
			core.filesystem.parseConfig('project_name: "P"\nstatuses:\n  - Queued\ncustom-setting: ["bad]\n').statuses,
		).toEqual(["Queued"]);
		expect(() =>
			core.filesystem.parseConfig('project_name: "P"\nstatuses: ["Queued]\ncustom-setting: ["bad]\n'),
		).toThrow('invalid value for "statuses"');

		// A sequence item is not a key even when its text contains a colon, so it must not cut the block.
		expect(core.filesystem.parseConfig('project_name: "P"\nstatuses:\n- "a: b"\n- Done\n').statuses).toEqual([
			"a: b",
			"Done",
		]);
	});

	it("reports a rejected config value without half-applying a draft or milestone mutation", async () => {
		await ensureProject();
		await $`${CLI_COMMAND} draft create "Draftling"`.cwd(TEST_DIR).quiet();
		expect(await core.filesystem.loadDraft("draft-1")).toMatchObject({ id: "DRAFT-1", title: "Draftling" });
		await core.filesystem.createMilestone("Mile");
		const configPath = core.filesystem.configFilePath;
		const baseConfig = await Bun.file(configPath).text();
		const listFiles = async () =>
			(await $`find agentic-workspace -type f`.cwd(TEST_DIR).nothrow().quiet().text()).split("\n").sort();

		await Bun.write(configPath, `${baseConfig}statuses: ["To Do]\n`);
		const before = await listFiles();

		// A swallowed error used to report a draft that still exists as missing, and a mutation ordered
		// before the first config read used to leave the draft or milestone half-moved.
		for (const args of [
			["draft", "promote", "draft-1"],
			["draft", "archive", "draft-1"],
			["milestone", "add", "Second"],
			["milestone", "archive", "Mile"],
		]) {
			const result = await $`${CLI_COMMAND} ${args}`.cwd(TEST_DIR).nothrow().quiet();
			const stderr = result.stderr.toString();
			expect(result.exitCode).not.toBe(0);
			expect(stderr).toContain("AgenticWorkspace could not start because");
			expect(stderr).toContain('invalid value for "statuses"');
			expect(stderr).not.toContain("not found");
			expect(await listFiles()).toEqual(before);
		}
	});

	it("resolves a YAML alias against the anchor defined under another key", () => {
		// An alias only has meaning in document context, so a list value that uses one must still
		// resolve even though each key's own block is what gets parsed.
		const shared = core.filesystem.parseConfig(
			'project_name: "P"\nstatuses: &workflow [To Do, Done]\nlabels: *workflow\n',
		);
		expect(shared.statuses).toEqual(["To Do", "Done"]);
		expect(shared.labels).toEqual(["To Do", "Done"]);

		const scalarAnchor = core.filesystem.parseConfig('project_name: "P"\ndefault_status: &s "To Do"\nstatuses: [*s]\n');
		expect(scalarAnchor.statuses).toEqual(["To Do"]);

		// Document context must not rescue a value that is genuinely malformed.
		expect(() => core.filesystem.parseConfig('project_name: "P"\nstatuses: ["To Do]\n')).toThrow(
			'invalid value for "statuses"',
		);
	});

	it("exits non-zero with the config error at every entry point that reads config", async () => {
		await ensureProject();
		const configPath = core.filesystem.configFilePath;
		const baseConfig = await Bun.file(configPath).text();
		await Bun.write(configPath, `${baseConfig}statuses: ["To Do]\n`);

		// Bare invocation must not report an initialized project as uninitialized, the empty-list fast
		// path must not hide the failure, and MCP startup must not bury the message behind a summary.
		for (const args of [["task", "list", "--plain"], ["--plain"], ["draft", "list", "--plain"], ["mcp", "start"]]) {
			const result = await $`${CLI_COMMAND} ${args}`.cwd(TEST_DIR).nothrow().quiet();
			const stderr = result.stderr.toString();
			expect(result.exitCode).not.toBe(0);
			expect(stderr).toStartWith("AgenticWorkspace could not start because");
			expect(stderr).toContain('invalid value for "statuses"');
			expect(stderr).not.toContain("at parseConfig");
			expect(result.stdout.toString()).not.toContain("not initialized");
			expect(result.stdout.toString()).not.toContain("No drafts found");
		}
	});

	it("clears defaultEditor via config set with an explicitly empty value", async () => {
		await ensureProject();
		// An empty value means "no editor": it must be stored, not rejected as an invalid executable
		const config = await core.filesystem.loadConfig();
		if (!config) throw new Error("Config not loaded");
		config.defaultEditor = "code --wait";
		await core.filesystem.saveConfig(config);
		expect((await core.filesystem.loadConfig())?.defaultEditor).toBe("code --wait");

		const cleared = await $`${CLI_COMMAND} config set defaultEditor ""`.cwd(TEST_DIR).quiet();
		expect(cleared.exitCode).toBe(0);

		core.filesystem.invalidateConfigCache();
		const reloaded = await core.filesystem.loadConfig();
		expect(reloaded?.defaultEditor).toBeUndefined();
	});

	it("honors an explicitly empty --default-editor flag during init instead of discarding it", async () => {
		// With EDITOR set as a sentinel, a discarded empty flag would fall back to the environment value
		const initDir = createUniqueTestDir("test-config-commands-init");
		await mkdir(initDir, { recursive: true });
		initGitRepo(initDir);

		const env = {
			...process.env,
			EDITOR: "agentic-workspace-sentinel-editor",
			VISUAL: "agentic-workspace-sentinel-editor",
		};
		const result =
			await $`${CLI_COMMAND} init "Editorless Project" --defaults --default-editor "" --integration-mode none`
				.cwd(initDir)
				.env(env)
				.nothrow()
				.quiet();
		expect(result.exitCode).toBe(0);

		const initCore = new Core(initDir);
		const config = await initCore.filesystem.loadConfig();
		expect(config?.defaultEditor).toBeUndefined();

		await safeCleanup(initDir);
	});

	it("clears a configured editor when re-initializing with an explicitly empty --default-editor", async () => {
		const initDir = createUniqueTestDir("test-config-commands-reinit");
		await mkdir(initDir, { recursive: true });
		initGitRepo(initDir);

		// First init without the flag: the EDITOR env fallback must still apply
		const env = {
			...process.env,
			EDITOR: "agentic-workspace-sentinel-editor",
			VISUAL: "agentic-workspace-sentinel-editor",
		};
		const initial = await $`${CLI_COMMAND} init "Editor Project" --defaults --integration-mode none`
			.cwd(initDir)
			.env(env)
			.nothrow()
			.quiet();
		expect(initial.exitCode).toBe(0);

		const initCore = new Core(initDir);
		expect((await initCore.filesystem.loadConfig())?.defaultEditor).toBe("agentic-workspace-sentinel-editor");

		// Re-init with an explicitly empty flag: clears the editor instead of keeping the existing value
		const reinit = await $`${CLI_COMMAND} init "Editor Project" --defaults --default-editor "" --integration-mode none`
			.cwd(initDir)
			.env(env)
			.nothrow()
			.quiet();
		expect(reinit.exitCode).toBe(0);
		initCore.filesystem.invalidateConfigCache();
		expect((await initCore.filesystem.loadConfig())?.defaultEditor).toBeUndefined();

		await safeCleanup(initDir);
	});
});
