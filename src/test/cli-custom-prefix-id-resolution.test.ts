import { afterAll, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Core } from "../index.ts";
import { Storage } from "../storage/storage.ts";
import { runInProcessCli } from "./in-process-cli.ts";
import { coreFileSystem, createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

const createdDirs: string[] = [];

/** Creates an empty isolated project directory for one test and remembers it for cleanup. */
async function makeDir(): Promise<string> {
	const dir = createUniqueTestDir("test-custom-prefix-id-resolution");
	await mkdir(dir, { recursive: true });
	createdDirs.push(dir);
	return dir;
}

/** Initializes a project using a custom canonical task prefix. */
async function initCustomPrefixProject(dir: string): Promise<Core> {
	const core = new Core(dir);
	await initializeFilesystemTestProject(core, "Custom Prefix ID Resolution");
	const config = await core.storage.loadConfig();
	if (!config) throw new Error("Expected config to be loaded");
	await core.storage.saveConfig({ ...config, prefixes: { ...config.prefixes, task: "BACK" } });
	return core;
}

async function createTask(
	core: Core,
	id: string,
	title: string,
	extra: { status?: string; parentTaskId?: string } = {},
): Promise<void> {
	await new Storage(coreFileSystem(core)).createTask({
		id,
		title,
		status: extra.status ?? "To Do",
		done: false,
		labels: [],
		dependencies: [],
		createdDate: "2026-08-08",
		rawContent: "",
		...(extra.parentTaskId ? { parentTaskId: extra.parentTaskId } : {}),
	});
}

/** One case per ID-accepting command. */
interface IdCommandCase {
	name: string;
	/** Receives the ID form under test and returns the CLI arguments to run. */
	args: (id: string) => string[];
	/** Fresh fixtures, because most of these commands move or rewrite the task they target. */
	setup: (core: Core) => Promise<void>;
	/** Expected on stdout for both ID forms. */
	expected: string;
}

const idCommandCases: IdCommandCase[] = [
	{
		name: "task view",
		args: (id) => ["task", "view", id, "--plain"],
		setup: async (core) => createTask(core, "BACK-1", "Target task"),
		expected: "BACK-1 - Target task",
	},
];

// Every test owns its project directory, so the suite runs its tests concurrently.
describe("CLI task ID resolution with a custom ID prefix", () => {
	afterAll(async () => {
		await Promise.all(createdDirs.map((dir) => safeCleanup(dir)));
	});

	for (const testCase of idCommandCases) {
		for (const [form, id] of [["prefixed", "BACK-1"]] as const) {
			it(`resolves a ${form} ID for ${testCase.name}`, async () => {
				const TEST_DIR = await makeDir();
				const core = await initCustomPrefixProject(TEST_DIR);
				await testCase.setup(core);

				const result = await runInProcessCli(testCase.args(id), { cwd: TEST_DIR });

				expect(result.stderr).not.toContain("not found");
				expect(result.exitCode).toBe(0);
				expect(result.stdout).toContain(testCase.expected);
			});
		}
	}
});
