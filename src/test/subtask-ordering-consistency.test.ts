import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import { TaskOrdering } from "../model/task/task-ordering.ts";
import type { Task } from "../model/types.ts";
import { prepareBoardColumns } from "../renderer/opentui/board/policies/column-policy.ts";
import { coreFileSystem, createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

async function runCliCommand(args: string[], cwd: string) {
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
	return { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
}

// One parent with more than nine subtasks, plus two-digit top-level ids, so any surface that
// compares ids as plain strings puts TASK-1.10 in front of TASK-1.2.
const SUBTASK_IDS = Array.from({ length: 11 }, (_, index) => `TASK-1.${index + 1}`);
const EXPECTED_ORDER = ["TASK-1", ...SUBTASK_IDS.slice().sort(TaskOrdering.compareIds), "TASK-2", "TASK-11"];
// The CLI list and the board columns render newest-first: top-level ids descending, then the
// parent's subtasks. The CLI tie-break keeps parents before children, so subtasks descend; the
// board keeps sibling subtasks ascending under their parent.
const EXPECTED_DESCENDING_ORDER = [
	"TASK-11",
	"TASK-2",
	"TASK-1",
	...SUBTASK_IDS.slice().sort(TaskOrdering.compareIds).reverse(),
];
const EXPECTED_COLUMN_ORDER = ["TASK-11", "TASK-2", "TASK-1", ...SUBTASK_IDS.slice().sort(TaskOrdering.compareIds)];

let TEST_DIR: string;
let core: Core;

const createTask = (id: string, overrides: Partial<Task> = {}): Task => ({
	id,
	title: `Task ${id}`,
	status: "To Do",
	assignee: [],
	labels: [],
	dependencies: [],
	createdDate: "2026-01-01",
	...overrides,
});

function idsFromPlainOutput(output: string): string[] {
	return [...output.matchAll(/^\s*(TASK-[\d.]+)\s+-/gm)].map(([, id]) => id ?? "");
}

describe("subtask ordering consistency", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-subtask-ordering");
		await mkdir(TEST_DIR, { recursive: true });

		core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "Subtask Ordering Test");

		await core.createTask(createTask("TASK-1", { title: "Parent" }));
		// Created out of numeric order so no surface can pass by echoing creation order.
		for (const id of [...SUBTASK_IDS].reverse()) {
			await core.createTask(createTask(id, { parentTaskId: "TASK-1" }));
		}
		await core.createTask(createTask("TASK-11"));
		await core.createTask(createTask("TASK-2"));
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	it("orders the board's task corpus numerically, so TASK-1.9 precedes TASK-1.10", async () => {
		// The corpus `agentic-workspace board` hands to the unified view. Its task list renders this array
		// as-is, so this order is what the TUI list shows after Tab.
		const ids = (await core.loadTasks()).map((task) => task.id);

		expect(ids).toEqual(EXPECTED_ORDER);
		expect(ids.indexOf("TASK-1.9")).toBeLessThan(ids.indexOf("TASK-1.10"));
		expect(ids.indexOf("TASK-1.2")).toBeLessThan(ids.indexOf("TASK-1.11"));
	});

	it("agrees across every corpus reader", async () => {
		expect((await core.loadTasks()).map((task) => task.id)).toEqual(EXPECTED_ORDER);
		expect((await core.queryTasks()).map((task) => task.id)).toEqual(EXPECTED_ORDER);
		expect((await core.queryTasks({ includeCrossBranch: false })).map((task) => task.id)).toEqual(EXPECTED_ORDER);
		expect((await coreFileSystem(core).listTasks()).map((task) => task.id)).toEqual(EXPECTED_ORDER);
	});

	it("agrees with the board columns and with the comparator the web list sorts by", async () => {
		const tasks = await core.loadTasks();
		const [column] = prepareBoardColumns(tasks, ["To Do"]);

		expect(column?.tasks.map((task) => task.id)).toEqual(EXPECTED_COLUMN_ORDER);
		// The web task list sorts with this same comparator, so a corpus already in its order
		// cannot disagree with it.
		expect(tasks.map((task) => task.id)).toEqual(
			[...tasks].sort((left, right) => TaskOrdering.compareIds(left.id, right.id)).map((task) => task.id),
		);
	});

	it("agrees with the supported CLI plain task list", async () => {
		const plain = await runCliCommand(["task", "list", "--plain"], TEST_DIR);
		expect(plain.exitCode).toBe(0);
		expect(idsFromPlainOutput(plain.stdout)).toEqual(EXPECTED_DESCENDING_ORDER);
	});
});
