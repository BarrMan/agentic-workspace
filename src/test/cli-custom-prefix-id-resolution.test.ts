import { afterAll, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Writable } from "node:stream";
import type { ShellExpression } from "bun";
import { $ as shell } from "bun";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

const CLI_COMMAND = ["agentic-workspace"];
function $(parts: TemplateStringsArray, ...values: ShellExpression[]) {
	const source = parts.reduce(
		(text, part, index) =>
			`${text}${part}${Array.isArray(values[index]) ? values[index].map((value) => JSON.stringify(value)).join(" ") : values[index] === undefined ? "" : JSON.stringify(values[index])}`,
		"",
	);
	if (!source.includes("agentic-workspace")) return shell(parts, ...values);
	const args =
		source
			.match(/"(?:\\.|[^"\\])*"|'[^']*'|[^\s]+/g)
			?.map((arg) =>
				arg.startsWith('"') ? (JSON.parse(arg) as string) : arg.startsWith("'") ? arg.slice(1, -1) : arg,
			) ?? [];
	const config: { cwd?: string; nothrow?: boolean } = {};
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
		const exitCode = await runCli(args.slice(CLI_COMMAND.length), { cwd: config.cwd, stdout: out, stderr: err });
		const value = { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
		if (value.exitCode && !config.nothrow) throw new Error(value.stderr || `CLI exited with ${value.exitCode}`);
		return value;
	};
	const chain = {
		cwd(value: string) {
			config.cwd = value;
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
	const config = await core.filesystem.loadConfig();
	if (!config) throw new Error("Expected config to be loaded");
	await core.filesystem.saveConfig({ ...config, prefixes: { ...config.prefixes, task: "BACK" } });
	return core;
}

async function createTask(
	core: Core,
	id: string,
	title: string,
	extra: { status?: string; parentTaskId?: string } = {},
): Promise<void> {
	await core.filesystem.saveTask({
		id,
		title,
		status: extra.status ?? "To Do",
		assignee: [],
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

				const result = await $`${CLI_COMMAND} ${testCase.args(id)}`.cwd(TEST_DIR).nothrow().quiet();

				expect(result.stderr.toString()).not.toContain("not found");
				expect(result.exitCode).toBe(0);
				expect(result.stdout.toString()).toContain(testCase.expected);
			});
		}
	}
});
