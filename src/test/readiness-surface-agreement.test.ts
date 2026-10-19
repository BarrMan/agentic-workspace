import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../controller/agentic-workspace.ts";
import { type TaskCorpus, toTaskDetail, withReadiness } from "../controller/task-detail.ts";
import { searchJson } from "../renderer/formatters/json-output.ts";
import { generateTaskDetailStyled } from "../renderer/opentui/task-detail-content.ts";
import { coreFileSystem, createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

/**
 * Readiness is derived once in core, and every surface renders that one verdict. These tests pin
 * the agreement on a single project covering each way the question can be answered: a dependency
 * completed and filed away, an unfinished chain, a dependency nothing claims, a dependency more
 * than one record claims, and a task that is already finished.
 */
describe("readiness agreement across surfaces", () => {
	let testDir: string;
	let core: Core;

	/** The verdict every surface has to reach for this project, by task ID. */
	const expectedReadiness: Record<string, boolean> = {
		// Its only dependency was completed and moved into agentic-workspace/completed.
		"TASK-2": true,
		// Unfinished with no dependencies at all.
		"TASK-3": true,
		// Waits on unfinished TASK-3.
		"TASK-4": false,
		// Names a dependency nothing claims.
		"TASK-5": false,
		// Already finished, so it is neither ready to start nor blocked.
		"TASK-6": false,
	};

	beforeEach(async () => {
		testDir = createUniqueTestDir("readiness-surface-agreement");
		await mkdir(testDir, { recursive: true });
		core = new Core(testDir);
		await initializeFilesystemTestProject(core, "Readiness Agreement");

		// Dates come from the run clock so the fixture never ages into a different meaning.
		const createdDate = new Date().toISOString().slice(0, 10);
		const addTask = async (id: string, title: string, status: string, dependencies: string[] = []) => {
			await core.createTask({ id, title, status, assignee: [], labels: [], dependencies, createdDate, rawContent: "" });
		};

		await addTask("task-1", "Completed dependency", "Done");
		await addTask("task-2", "Waits on the completed dependency", "To Do", ["task-1"]);
		await addTask("task-3", "Unfinished blocker", "In Progress");
		await addTask("task-4", "Waits on the unfinished blocker", "To Do", ["task-3"]);
		await addTask("task-5", "Waits on nothing known", "To Do", ["task-404"]);
		await addTask("task-6", "Already finished", "Done");

		// The dependency leaves the active corpus: only its location in agentic-workspace/completed still says
		// the work is finished.
		expect(await core.completeTask("task-1")).toBe(true);
	});

	afterEach(async () => {
		await safeCleanup(testDir);
	});

	const runCliCommand = async (args: string[]) => {
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
		const exitCode = await runCli(args, { cwd: testDir, stdout: out, stderr: err });
		return { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
	};

	const tuiCorpus = async (): Promise<TaskCorpus> => ({
		// The corpus the interactive task list resolves against: the working copy it displays plus
		// the completed records it loads alongside the milestone metadata.
		tasks: await core.queryTasks({ includeCrossBranch: false }),
		completedTasks: await coreFileSystem(core).listCompletedTasks(),
		statuses: (await coreFileSystem(core).loadConfig())?.statuses,
	});

	it("derives readiness for the interactive task corpus", async () => {
		const corpus = await tuiCorpus();
		const verdicts = Object.fromEntries(withReadiness(corpus.tasks, corpus).map((row) => [row.id, row.isReady]));
		expect(verdicts).toMatchObject(expectedReadiness);
	});

	it("explains the same verdict in task view JSON, with unresolved dependencies failing closed", async () => {
		const detailFor = async (id: string) => {
			const result = await runCliCommand(["task", "view", id, "--json"]);
			expect(result.exitCode).toBe(0);
			return JSON.parse(result.stdout).task;
		};

		const readyDetail = await detailFor("TASK-2");
		expect(readyDetail.isReady).toBe(true);
		expect(readyDetail.readiness).toEqual({
			isReady: true,
			isBlocked: false,
			blockingDependencies: [],
			missingDependencies: [],
		});

		const blockedDetail = await detailFor("TASK-4");
		expect(blockedDetail.isReady).toBe(false);
		expect(blockedDetail.readiness).toEqual({
			isReady: false,
			isBlocked: true,
			blockingDependencies: ["TASK-3"],
			missingDependencies: [],
		});

		const unknownDetail = await detailFor("TASK-5");
		expect(unknownDetail.readiness).toEqual({
			isReady: false,
			isBlocked: true,
			blockingDependencies: [],
			missingDependencies: ["task-404"],
		});

		// A finished task is neither ready to start nor blocked.
		const finishedDetail = await detailFor("TASK-6");
		expect(finishedDetail.isReady).toBe(false);
		expect(finishedDetail.readiness.isBlocked).toBe(false);
	});

	it("returns the same verdicts through the interactive corpus", async () => {
		const corpus = await tuiCorpus();
		const interactiveVerdicts = Object.fromEntries(
			withReadiness(corpus.tasks, corpus).map((row) => [row.id, row.isReady]),
		);
		expect(interactiveVerdicts).toMatchObject(expectedReadiness);

		// And the line the interactive detail pane renders comes from that same derived field.
		const blocked = corpus.tasks.find((task) => task.id === "TASK-4");
		if (!blocked) throw new Error("Expected TASK-4 in the interactive corpus");
		const styledBlockedDetail = generateTaskDetailStyled(toTaskDetail(blocked, corpus));
		expect(styledBlockedDetail.chunks.map((chunk) => chunk.text).join("")).toContain("● Blocked by TASK-3");
	});

	it("does not treat a padded claimant as the dependency identity", async () => {
		const createdDate = new Date().toISOString().slice(0, 10);
		await core.createTask({
			id: "task-7",
			title: "Unfinished unpadded identity",
			status: "In Progress",
			assignee: [],
			labels: [],
			dependencies: [],
			createdDate,
			rawContent: "",
		});
		await core.createTask({
			id: "TASK-07",
			title: "Finished padded identity",
			status: "Done",
			assignee: [],
			labels: [],
			dependencies: [],
			createdDate,
			rawContent: "",
		});
		await core.createTask({
			id: "task-8",
			title: "Waits on the contested identity",
			status: "To Do",
			assignee: [],
			labels: [],
			dependencies: ["task-7"],
			createdDate,
			rawContent: "",
		});
		const unresolved = {
			isReady: false,
			isBlocked: true,
			blockingDependencies: ["TASK-7"],
			missingDependencies: [],
		};

		const viewResult = await runCliCommand(["task", "view", "TASK-8", "--json"]);
		expect(viewResult.exitCode).toBe(0);
		const viewed = JSON.parse(viewResult.stdout).task;
		expect(viewed.isReady).toBe(false);
		expect(viewed.readiness).toEqual(unresolved);

		const corpus = await tuiCorpus();
		const contestedDependent = withReadiness(corpus.tasks, corpus).find((row) => row.id === "TASK-8");
		expect(contestedDependent?.isReady).toBe(false);
	});
});

/**
 * Two files can claim one task ID, which is a reportable state the product supports rather than an
 * impossible one. The readiness a result publishes therefore has to be the verdict derived for that
 * result's own record: joining verdicts back by ID lets one claimant's answer stand in for the
 * other's, and the fail-open direction of that is a task reported ready because its namesake is.
 */
describe("search JSON readiness for a contested identity", () => {
	it("keeps each claimant's own verdict", () => {
		const createdDate = new Date().toISOString().slice(0, 10);
		const makeRecord = (id: string, title: string, dependencies: string[] = []) => ({
			id,
			title,
			status: "To Do",
			assignee: [],
			labels: [],
			dependencies,
			createdDate,
			rawContent: "",
		});

		const blocker = makeRecord("TASK-1", "Unfinished blocker");
		const blockedClaimant = makeRecord("TASK-2", "Contested claimant", ["TASK-1"]);
		const readyClaimant = makeRecord("TASK-2", "Contested copy");
		const rows = withReadiness([blockedClaimant, readyClaimant], {
			tasks: [blocker, blockedClaimant, readyClaimant],
			completedTasks: [],
			statuses: ["To Do", "In Progress", "Done"],
		});
		// The two claimants genuinely differ: one waits on unfinished work, the other on nothing.
		expect(rows.map((row) => row.isReady)).toEqual([false, true]);

		const payload = searchJson(rows.map((task) => ({ type: "task" as const, score: null, task })));
		expect(payload.results.map((result) => (result.type === "task" ? result.data.isReady : null))).toEqual([
			false,
			true,
		]);
	});
});
