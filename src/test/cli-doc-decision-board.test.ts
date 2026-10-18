import { describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Writable } from "node:stream";
import type { ShellExpression } from "bun";
import { $ as shell } from "bun";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import type { Decision } from "../types/index.ts";
import { coreFileSystem, createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

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

function concurrentTest(name: string, body: () => Promise<void>): void {
	it(name, body);
}

/** Every case owns its project directory independently. */
async function setupDocProject(): Promise<{ dir: string; core: Core }> {
	const dir = createUniqueTestDir("test-cli");
	await mkdir(dir, { recursive: true });
	await $`git init -b main`.cwd(dir).quiet();

	const core = new Core(dir);
	await initializeTestProject(core, "Doc Test Project");
	return { dir, core };
}

describe("CLI Integration", () => {
	describe("doc and decision commands", () => {
		concurrentTest("should create and list decisions", async () => {
			const { dir, core } = await setupDocProject();
			try {
				const decision: Decision = {
					id: "decision-1",
					title: "Choose Stack",
					date: "2025-06-08",
					status: "accepted",
					context: "context",
					decision: "decide",
					consequences: "conseq",
					rawContent: "",
				};
				await core.createDecision(decision);
				const decisions = await coreFileSystem(core).listDecisions();
				expect(decisions).toHaveLength(1);
				expect(decisions[0]?.title).toBe("Choose Stack");
			} finally {
				await safeCleanup(dir);
			}
		});

		concurrentTest("should accept --plain when creating a decision", async () => {
			const { dir, core } = await setupDocProject();
			try {
				const result = await $`${CLI_COMMAND} decision create "Choose Stack" --plain`.cwd(dir).nothrow().quiet();
				expect(result.exitCode).toBe(0);
				expect(result.stderr.toString()).toBe("");

				const stdout = result.stdout.toString();
				expect(stdout.trim()).toBe("Created decision decision-1");
				expect(stdout.includes("[")).toBe(false);

				const decisions = await coreFileSystem(core).listDecisions();
				expect(decisions).toHaveLength(1);
				expect(decisions[0]?.title).toBe("Choose Stack");
			} finally {
				await safeCleanup(dir);
			}
		});

		concurrentTest("should list decisions with id, title, and status as plain text", async () => {
			const { dir } = await setupDocProject();
			try {
				await $`${CLI_COMMAND} decision create "Choose Stack" -s accepted`.cwd(dir).quiet();
				await $`${CLI_COMMAND} decision create "Adopt Free Form Status" -s "Under Review"`.cwd(dir).quiet();

				const result = await $`${CLI_COMMAND} decision list --plain`.cwd(dir).quiet();
				expect(result.exitCode).toBe(0);
				const lines = result.stdout.toString().trim().split("\n");
				expect(lines).toEqual([
					"decision-1 - Choose Stack (accepted)",
					"decision-2 - Adopt Free Form Status (Under Review)",
				]);
			} finally {
				await safeCleanup(dir);
			}
		});

		concurrentTest("should default to text output when stdout is not a TTY", async () => {
			const { dir } = await setupDocProject();
			try {
				await $`${CLI_COMMAND} decision create "Choose Stack"`.cwd(dir).quiet();

				const result = await $`${CLI_COMMAND} decision list`.cwd(dir).quiet();
				expect(result.exitCode).toBe(0);
				expect(result.stdout.toString().trim()).toBe("decision-1 - Choose Stack (proposed)");
			} finally {
				await safeCleanup(dir);
			}
		});

		concurrentTest("should report an empty decision log in both output modes", async () => {
			const { dir } = await setupDocProject();
			try {
				const plain = await $`${CLI_COMMAND} decision list --plain`.cwd(dir).quiet();
				const json = await $`${CLI_COMMAND} decision list --json`.cwd(dir).quiet();
				expect(plain.exitCode).toBe(0);
				expect(plain.stdout.toString().trim()).toBe("No decisions found.");

				expect(json.exitCode).toBe(0);
				expect(JSON.parse(json.stdout.toString())).toEqual({
					schemaVersion: 1,
					kind: "decision-list",
					decisions: [],
				});
			} finally {
				await safeCleanup(dir);
			}
		});
	});
});
