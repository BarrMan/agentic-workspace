import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

const buildTask = (partial: Partial<Task> & Pick<Task, "id" | "title">): Task => ({
	status: "To Do",
	assignee: [],
	createdDate: "2026-09-01",
	labels: [],
	dependencies: [],
	...partial,
});

async function runCommand(args: string[], env: Record<string, string | undefined> = {}) {
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
	const originalEnv = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
	const originalArgv = process.argv;
	for (const [key, value] of Object.entries(env)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	process.argv = [process.execPath, "agentic-workspace", ...args];
	let exitCode: number;
	try {
		exitCode = await runCli(args, { cwd: TEST_DIR, stdout: out, stderr: err });
	} finally {
		for (const [key, value] of Object.entries(originalEnv)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
		process.argv = originalArgv;
	}
	return { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
}

async function runJson(args: string[]) {
	const result = await runCommand([...args, "--json"]);
	expect(result.exitCode).toBe(0);
	return JSON.parse(result.stdout);
}

/** Runs a list command, then every `Next:` command its footer names, and returns each output in order. */
async function followWindows(args: string[]): Promise<string[]> {
	const outputs: string[] = [];
	let stdout = (await runCommand(args)).stdout;
	while (true) {
		outputs.push(stdout);
		const next = stdout.match(/Next: agentic-workspace (.+)$/m)?.[1];
		if (!next) return outputs;
		const nextArgs =
			next
				.match(/'(?:\\.|[^'])*'|"(?:\\.|[^"\\])*"|\S+/g)
				?.map((arg) => (arg.startsWith("'") || arg.startsWith('"') ? arg.slice(1, -1) : arg)) ?? [];
		stdout = (await runCommand(nextArgs[0] === "agentic-workspace" ? nextArgs.slice(1) : nextArgs)).stdout;
	}
}

function idsIn(output: string, pattern: RegExp): string[] {
	return output.match(pattern) ?? [];
}

function printedLines(output: string): string[] {
	return output.split("\n").filter((line) => line.trim() !== "");
}

/** Joins grouped window outputs, dropping footers and a group heading its previous window already printed. */
function joinGroupedWindows(outputs: string[]): string[] {
	const lines: string[] = [];
	let heading: string | undefined;
	for (const line of outputs.flatMap(printedLines)) {
		if (line.startsWith("Showing ")) continue;
		if (!line.startsWith(" ")) {
			if (line === heading) continue;
			heading = line;
		}
		lines.push(line);
	}
	return lines;
}

// runCli temporarily mutates process globals, so invocations in this suite stay serial.
describe("CLI list windows", () => {
	const itc = (name: string, fn: () => Promise<void>) => it(name, fn, 30_000);

	beforeAll(async () => {
		TEST_DIR = createUniqueTestDir("test-cli-list-window");
		await mkdir(TEST_DIR, { recursive: true });
		const core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "List Window Test");

		for (const index of [1, 2, 3, 4]) {
			await core.createTask(
				buildTask({
					id: `task-${index}`,
					title: `Window task ${index}`,
					// Searching for `--skip` finds tasks with an option value that reads like the skip option.
					description: "Read in windows with --skip.",
					status: index === 2 ? "In Progress" : "To Do",
				}),
			);
		}
		await core.createTask(buildTask({ id: "task-5", title: "Window task 5", status: "Done", milestone: "m-2" }));

		for (const title of ["Release A", "Release B", "Release C"]) {
			await core.filesystem.createMilestone(title);
		}
		for (const index of [1, 2, 3]) {
			await core.filesystem.saveDraft(buildTask({ id: `DRAFT-${index}`, title: `Draft ${index}`, status: "Draft" }));
			await core.filesystem.saveDecision({
				id: `decision-${index}`,
				// A decision titled exactly like the search query outranks the tasks, so relevance order mixes types.
				title: index === 1 ? "Window" : `Decision ${index}`,
				date: "2026-09-01",
				status: "accepted",
				context: "",
				decision: "",
				consequences: "",
				rawContent: "",
			});
		}
		// Two documents share a title, so only their path keeps their order stable.
		await core.createDocument({
			id: "doc-1",
			title: "Guide",
			type: "guide",
			createdDate: "2026-09-01",
			rawContent: "",
		});
		await core.createDocument(
			{ id: "doc-2", title: "Guide", type: "guide", createdDate: "2026-09-01", rawContent: "" },
			"a",
		);
		await core.createDocument({
			id: "doc-3",
			title: "Handbook",
			type: "guide",
			createdDate: "2026-09-01",
			rawContent: "",
		});
	});

	afterAll(async () => {
		await safeCleanup(TEST_DIR);
	});

	itc("pages grouped task list output through the commands its footers name", async () => {
		const complete = await runCommand(["task", "list", "--search", "Window task", "--plain"]);
		expect(complete.stdout).not.toContain("Showing");
		expect(printedLines(complete.stdout).filter((line) => !line.startsWith(" "))).toEqual([
			"To Do:",
			"In Progress:",
			"Done:",
		]);

		const windows = await followWindows(["task", "list", "--search", "Window task", "--max-count", "2", "--plain"]);

		expect(windows).toHaveLength(3);
		expect(windows[0]).toContain("Showing 1-2 of 5 items. Next: agentic-workspace task list --search 'Window task'");
		expect(windows[2]?.trimEnd().endsWith("Showing 5-5 of 5 items.")).toBe(true);
		expect(joinGroupedWindows(windows)).toEqual(printedLines(complete.stdout));
	});

	itc("pages plain search output in the order it groups results", async () => {
		const relevance = await runJson(["search", "window"]);
		expect(relevance.results[0].type).toBe("decision");
		const complete = await runCommand(["search", "window", "--plain"]);

		const windows = await followWindows(["search", "window", "--max-count", "2", "--plain"]);

		expect(windows.length).toBeGreaterThan(1);
		expect(joinGroupedWindows(windows)).toEqual(printedLines(complete.stdout));
	});

	itc("reports total and nextSkip in JSON only for cut output and keeps --limit silent", async () => {
		const middle = await runJson(["task", "list", "--max-count", "2", "--skip", "2"]);
		expect(middle.tasks).toHaveLength(2);
		expect(middle).toMatchObject({ total: 5, nextSkip: 4 });

		const last = await runJson(["task", "list", "--skip", "4"]);
		expect(last.tasks).toHaveLength(1);
		expect(last).toMatchObject({ total: 5, nextSkip: null });

		const complete = await runJson(["task", "list"]);
		expect(complete.tasks).toHaveLength(5);
		expect(Object.keys(complete).sort()).toEqual(["kind", "schemaVersion", "tasks"]);

		const limited = await runJson(["task", "list", "--limit", "2"]);
		expect(limited.tasks).toHaveLength(2);
		expect(limited).not.toHaveProperty("total");
		expect((await runCommand(["task", "list", "--limit", "2", "--plain"])).stdout).not.toContain("Showing");

		const limitedWindow = await runCommand(["task", "list", "--limit", "4", "--max-count", "3", "--plain"]);
		expect(limitedWindow.stdout).toContain("Showing 1-3 of 4 items.");
	});

	itc("windows the flat JSON task array, not the plain status groups", async () => {
		const complete = (await runJson(["task", "list"])).tasks.map((task: { id: string }) => task.id);
		const window = (await runJson(["task", "list", "--max-count", "2", "--skip", "1"])).tasks;

		expect(window.map((task: { id: string }) => task.id)).toEqual(complete.slice(1, 3));
	});

	itc("keeps option values and a -- separator in the next command", async () => {
		const searched = ["task", "list", "--search", "--skip", "--plain"];
		const complete = await runCommand(searched);
		expect(idsIn(complete.stdout, /TASK-\d+/g).length).toBeGreaterThan(2);
		expect(joinGroupedWindows(await followWindows([...searched, "--max-count", "2"]))).toEqual(
			printedLines(complete.stdout),
		);

		const separated = await followWindows(["doc", "list", "--max-count", "1", "--"]);
		expect(separated[0]).toContain("Next: agentic-workspace doc list --max-count 1 --skip 1 --");
		expect(joinGroupedWindows(separated)).toEqual(printedLines((await runCommand(["doc", "list", "--plain"])).stdout));
	});

	itc("prints only the number of listed items with --count", async () => {
		expect((await runCommand(["task", "list", "--count"])).stdout).toBe("5\n");
		expect((await runCommand(["task", "list", "--status", "To Do", "--count"])).stdout).toBe("3\n");
		expect((await runCommand(["task", "list", "--count", "--skip", "4"])).stdout).toBe("1\n");
		// Bun colors a logged number when color is forced, which would break `$(agentic-workspace ... --count)`.
		expect((await runCommand(["task", "list", "--count"], { FORCE_COLOR: "1" })).stdout).toBe("5\n");

		const withJson = await runCommand(["task", "list", "--count", "--json"]);
		expect(withJson.exitCode).toBe(1);
		expect(withJson.stdout).toBe("");
		expect(withJson.stderr).toContain("--count cannot be combined with --json.");
	});

	itc("rejects invalid window values before printing", async () => {
		const zero = await runCommand(["task", "list", "--max-count", "0"]);
		expect(zero.exitCode).toBe(1);
		expect(zero.stdout).toBe("");
		expect(zero.stderr).toContain("--max-count must be a positive integer");

		const text = await runCommand(["doc", "list", "--skip", "abc"]);
		expect(text.exitCode).toBe(1);
		expect(text.stdout).toBe("");
		expect(text.stderr).toContain("--skip must be a non-negative integer");
	});

	itc("prints only the footer for a skip past the end", async () => {
		const result = await runCommand(["decision", "list", "--skip", "5"]);
		expect(result.stdout).toBe("Showing 0 of 3 items.\n");
	});

	itc("pages search, document search, and decision results", async () => {
		const search = await runCommand(["search", "--type", "decision", "--max-count", "2", "--plain"]);
		expect(idsIn(search.stdout, /decision-\d+/g)).toEqual(["decision-1", "decision-2"]);
		expect(search.stdout).toContain(
			"Showing 1-2 of 3 items. Next: agentic-workspace search --type decision --max-count 2 --plain --skip 2",
		);
		expect(await runJson(["search", "--type", "decision", "--max-count", "1", "--skip", "1"])).toMatchObject({
			results: [{ type: "decision", data: { id: "decision-2" } }],
			total: 3,
			nextSkip: 2,
		});
		expect((await runCommand(["search", "--type", "decision", "--count"])).stdout).toBe("3\n");

		const decisions = await runCommand(["decision", "list", "--max-count", "2", "--skip", "2"]);
		expect(idsIn(decisions.stdout, /decision-\d+/g)).toEqual(["decision-3"]);
		expect(decisions.stdout).toContain("Showing 3-3 of 3 items.");
		expect(await runJson(["decision", "list", "--max-count", "1"])).toMatchObject({ total: 3, nextSkip: 1 });

		const documentViews = idsIn(
			(await runCommand(["doc", "search", "Guide"])).stdout,
			/View: agentic-workspace doc view doc-\d+/g,
		);
		const firstDocument = await runCommand(["doc", "search", "Guide", "--max-count", "1"]);
		expect(idsIn(firstDocument.stdout, /View: agentic-workspace doc view doc-\d+/g)).toEqual(documentViews.slice(0, 1));
		expect(firstDocument.stdout).toContain(
			`Showing 1-1 of ${documentViews.length} items. Next: agentic-workspace doc search Guide --max-count 1 --skip 1`,
		);
		expect((await runCommand(["doc", "search", "Guide", "--count"])).stdout).toBe(`${documentViews.length}\n`);
	});

	itc("keeps document windows in a stable order when titles are equal", async () => {
		const complete = idsIn((await runCommand(["doc", "list", "--plain"])).stdout, /doc-\d+/g);
		const windows = await followWindows(["doc", "list", "--max-count", "1"]);

		expect(complete).toEqual(["doc-2", "doc-1", "doc-3"]);
		expect(windows.flatMap((output) => idsIn(output, /^doc-\d+/gm))).toEqual(complete);
	});

	itc("pages draft and milestone lists", async () => {
		const drafts = await runCommand(["draft", "list", "--max-count", "2", "--skip", "1"]);
		expect(idsIn(drafts.stdout, /DRAFT-\d+/g)).toEqual(["DRAFT-2", "DRAFT-3"]);
		expect(drafts.stdout).toContain("Showing 2-3 of 3 items.");
		expect(drafts.stdout).not.toContain("Next:");
		expect((await runCommand(["draft", "list", "--count"])).stdout).toBe("3\n");

		const completedWindow = await runCommand([
			"milestone",
			"list",
			"--show-completed",
			"--max-count",
			"1",
			"--skip",
			"2",
		]);
		expect(idsIn(completedWindow.stdout, /m-\d+:/g)).toEqual(["m-2:"]);
		expect(completedWindow.stdout).toContain("Showing 3-3 of 3 items.");
		// Windows print each section once, where it falls, so they join into the complete output.
		for (const args of [
			["milestone", "list", "--show-completed"],
			["milestone", "list"],
		]) {
			const milestones = await runCommand(args);
			const milestoneWindows = await followWindows([...args, "--max-count", "1"]);
			expect(joinGroupedWindows(milestoneWindows)).toEqual(printedLines(milestones.stdout));
		}
		expect((await runCommand(["milestone", "list", "--count"])).stdout).toBe("2\n");
		expect((await runCommand(["milestone", "list", "--show-completed", "--count"])).stdout).toBe("3\n");
	});

	itc("documents the options in help and agent instructions", async () => {
		const help = (await runCommand(["task", "list", "--help"])).stdout;
		expect(help).toContain("--max-count <n>");
		expect(help).toContain("--skip <n>");
		expect(help).toContain("--count");
		expect(help).toContain("max-count: Positive integer");

		const overview = (await runCommand(["instructions", "overview"])).stdout;
		for (const option of ["--max-count", "--skip", "--count"]) {
			expect(overview).toContain(option);
		}
	});
});
