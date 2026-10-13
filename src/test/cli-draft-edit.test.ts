import { afterAll, afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { Writable } from "node:stream";
import { $ as shell } from "bun";
import { pickTaskForEditWizard } from "../cli/features/tasks/wizard.ts";
import { runCli } from "../cli/register.ts";
import { isTaskLockError } from "../file-system/operations.ts";
import { Core } from "../index.ts";
import { serializeTask } from "../markdown/serializer.ts";
import type { Task } from "../types/index.ts";
import { findDuplicateDraftFilenameGroups } from "../utils/task-path.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

const normalizeCliOutput = (output: string) => output.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const CLI_COMMAND = ["agenticworkspace"];
const createdDirs: string[] = [];

function $(parts: TemplateStringsArray, ...values: unknown[]) {
	const source = parts.reduce(
		(text, part, index) =>
			`${text}${part}${Array.isArray(values[index]) ? values[index].map((value) => JSON.stringify(value)).join(" ") : values[index] === undefined ? "" : JSON.stringify(values[index])}`,
		"",
	);
	if (!source.includes("agenticworkspace")) return shell(parts, ...values);
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

/** Builds an isolated, initialized project for one test and remembers it for cleanup. */
async function makeProject(): Promise<string> {
	const TEST_DIR = createUniqueTestDir("test-cli-draft-edit");
	await mkdir(TEST_DIR, { recursive: true });

	const core = new Core(TEST_DIR);
	await initializeFilesystemTestProject(core, "Draft Edit Test Project");
	createdDirs.push(TEST_DIR);
	return TEST_DIR;
}

afterAll(async () => {
	await Promise.all(createdDirs.map((dir) => safeCleanup(dir)));
});

// Each test owns its project directory; CLI invocations remain serial because runCli mutates globals.
describe("CLI draft edit", () => {
	const writeContainerDraft = async (draftsDir: string, id: string, title: string): Promise<string> => {
		const directory = join(draftsDir, id.toLowerCase());
		await mkdir(directory, { recursive: true });
		const filePath = join(directory, "task.md");
		await Bun.write(
			filePath,
			serializeTask({
				id,
				title,
				status: "Draft",
				assignee: [],
				createdDate: "2026-08-24 10:00",
				labels: [],
				dependencies: [],
			}),
		);
		return filePath;
	};

	const createDraft = async (testDir: string, title: string): Promise<Task> => {
		const create = await $`${CLI_COMMAND} draft create ${title}`.cwd(testDir).quiet();
		const match = create.stdout.toString().match(/Created draft (\S+)/);
		const draftId = match?.[1];
		if (!draftId) throw new Error("draft create did not report a draft id");
		const core = new Core(testDir);
		const draft = await core.filesystem.loadDraft(draftId);
		if (!draft) throw new Error(`expected draft ${draftId} to exist`);
		return draft;
	};

	it("applies non-interactive field flags to a draft through the shared mutation path", async () => {
		const TEST_DIR = await makeProject();
		const draft = await createDraft(TEST_DIR, "Editable draft");

		const result =
			await $`${CLI_COMMAND} draft edit ${draft.id} -t "Renamed draft" -d "New body" -a @alice -l ui --priority high --plain`
				.cwd(TEST_DIR)
				.nothrow()
				.quiet();
		const output = normalizeCliOutput(result.stdout.toString());
		expect(result.exitCode).toBe(0);
		expect(output).toContain("Renamed draft");
		expect(output).not.toContain("Updated ");

		const core = new Core(TEST_DIR);
		const reloaded = await core.filesystem.loadDraft(draft.id);
		expect(reloaded?.title).toBe("Renamed draft");
		expect(reloaded?.description).toBe("New body");
		expect(reloaded?.assignee).toEqual(["@alice"]);
		expect(reloaded?.labels).toEqual(["ui"]);
		expect(reloaded?.status).toBe("Draft");
	});

	it("reports an unchanged no-flag edit without mutating the draft", async () => {
		const TEST_DIR = await makeProject();
		const draft = await createDraft(TEST_DIR, "Untouched draft");
		const draftFilePath = draft.filePath;
		if (!draftFilePath) throw new Error("expected draft file path");
		const before = await Bun.file(draftFilePath).text();

		const result = await $`${CLI_COMMAND} draft edit ${draft.id}`.cwd(TEST_DIR).nothrow().quiet();
		expect(result.exitCode).toBe(0);
		expect(normalizeCliOutput(result.stdout.toString())).toContain(`Updated draft ${draft.id}`);

		const core = new Core(TEST_DIR);
		const reloaded = await core.filesystem.loadDraft(draft.id);
		expect(reloaded?.title).toBe("Untouched draft");
		const reloadedFilePath = reloaded?.filePath;
		if (!reloadedFilePath) throw new Error("expected reloaded draft file path");
		const after = await Bun.file(reloadedFilePath).text();
		expect(after.replace(/updated_date:[^\n]*\n/g, "")).toBe(before.replace(/updated_date:[^\n]*\n/g, ""));
	});

	it("keeps drafts on Draft status and rejects other statuses like task edit validates", async () => {
		const TEST_DIR = await makeProject();
		const draft = await createDraft(TEST_DIR, "Status guarded");

		const valid = await $`${CLI_COMMAND} draft edit ${draft.id} -s draft`.cwd(TEST_DIR).nothrow().quiet();
		expect(valid.exitCode).toBe(0);

		const invalid = await $`${CLI_COMMAND} draft edit ${draft.id} -s "To Do"`.cwd(TEST_DIR).nothrow().quiet();
		const invalidOutput = normalizeCliOutput(invalid.stdout.toString() + invalid.stderr.toString());
		expect(invalid.exitCode).toBe(1);
		expect(invalidOutput).toContain("Invalid status: To Do. Valid statuses are: Draft");

		const core = new Core(TEST_DIR);
		const reloaded = await core.filesystem.loadDraft(draft.id);
		expect(reloaded?.status).toBe("Draft");
	});

	it("fails closed for unknown draft ids without the cross-branch hint", async () => {
		const TEST_DIR = await makeProject();
		const result = await $`${CLI_COMMAND} draft edit DRAFT-99 -t X`.cwd(TEST_DIR).nothrow().quiet();
		const output = normalizeCliOutput(result.stdout.toString() + result.stderr.toString());
		expect(result.exitCode).toBe(1);
		expect(output).toContain("Draft DRAFT-99 not found.");
	});

	it("fails closed when several canonical draft containers claim the same id", async () => {
		const TEST_DIR = await makeProject();
		const draftsDir = join(TEST_DIR, "backlog", "drafts");
		await writeContainerDraft(draftsDir, "DRAFT-7", "Alpha");
		await writeContainerDraft(draftsDir, "DRAFT-07", "Beta");

		const result = await $`${CLI_COMMAND} draft edit 7 -t X`.cwd(TEST_DIR).nothrow().quiet();
		const output = normalizeCliOutput(result.stdout.toString() + result.stderr.toString());
		expect(result.exitCode).toBe(1);
		expect(output).toContain("Draft ID DRAFT-7 is ambiguous; 2 files match:");
		expect(output).toContain("draft-7/task.md");
		expect(output).toContain("draft-07/task.md");
		expect(output).toContain("Rename one file to a distinct numeric id, then make its frontmatter agree.");
		expect(output).not.toContain("doctor");
	});

	it("fails closed when padded canonical draft containers claim the same numeric id", async () => {
		const TEST_DIR = await makeProject();
		const draftsDir = join(TEST_DIR, "backlog", "drafts");
		await writeContainerDraft(draftsDir, "DRAFT-1", "Alpha");
		await writeContainerDraft(draftsDir, "DRAFT-01", "Beta");

		const result = await $`${CLI_COMMAND} draft edit 1 -t X`.cwd(TEST_DIR).nothrow().quiet();
		const output = normalizeCliOutput(result.stdout.toString() + result.stderr.toString());
		expect(result.exitCode).toBe(1);
		expect(output).toContain("Draft ID DRAFT-1 is ambiguous; 2 files match:");
		expect(output).toContain("draft-1/task.md");
		expect(output).toContain("draft-01/task.md");
		expect(output).not.toContain("Updated draft");

		expect(await Bun.file(join(draftsDir, "draft-1", "task.md")).text()).toContain("Alpha");
		expect(await Bun.file(join(draftsDir, "draft-01", "task.md")).text()).toContain("Beta");
	});

	it("fails closed on draft view when padded canonical containers claim the same numeric id", async () => {
		const TEST_DIR = await makeProject();
		const draftsDir = join(TEST_DIR, "backlog", "drafts");
		await writeContainerDraft(draftsDir, "DRAFT-1", "Alpha");
		await writeContainerDraft(draftsDir, "DRAFT-01", "Beta");

		for (const args of [
			["draft", "view", "1", "--plain"],
			["draft", "1", "--plain"],
		]) {
			const result = await $`${CLI_COMMAND} ${args}`.cwd(TEST_DIR).nothrow().quiet();
			const output = normalizeCliOutput(result.stdout.toString() + result.stderr.toString());
			expect(result.exitCode).toBe(1);
			expect(output).toContain("Draft ID DRAFT-1 is ambiguous; 2 files match:");
			expect(output).toContain("draft-1/task.md");
			expect(output).toContain("draft-01/task.md");
			expect(output).not.toContain("Task DRAFT-1");
		}

		expect(await Bun.file(join(draftsDir, "draft-1", "task.md")).text()).toContain("Alpha");
		expect(await Bun.file(join(draftsDir, "draft-01", "task.md")).text()).toContain("Beta");
	});

	it("still views a unique draft by id", async () => {
		const TEST_DIR = await makeProject();
		const draft = await createDraft(TEST_DIR, "Solo view");
		const result = await $`${CLI_COMMAND} draft view ${draft.id} --plain`.cwd(TEST_DIR).nothrow().quiet();
		const output = normalizeCliOutput(result.stdout.toString());
		expect(result.exitCode).toBe(0);
		expect(output).toContain("Solo view");
	});

	it("reuses the task edit flag validation rules", async () => {
		const TEST_DIR = await makeProject();
		const draft = await createDraft(TEST_DIR, "Flag guarded");

		const result = await $`${CLI_COMMAND} draft edit ${draft.id} --clear-labels --label a`
			.cwd(TEST_DIR)
			.nothrow()
			.quiet();
		const output = normalizeCliOutput(result.stdout.toString() + result.stderr.toString());
		expect(result.exitCode).toBe(1);
		expect(output).toContain("Cannot combine --clear-labels with --label, --add-label, or --remove-label.");

		const conflict = await $`${CLI_COMMAND} draft edit ${draft.id} --due-date 2026-01-01 --clear-due-date`
			.cwd(TEST_DIR)
			.nothrow()
			.quiet();
		expect(normalizeCliOutput(conflict.stderr.toString())).toContain(
			"Cannot use --due-date and --clear-due-date together.",
		);
	});

	it("fails closed when a canonical draft container's frontmatter id drifted", async () => {
		const TEST_DIR = await makeProject();
		const draft = await createDraft(TEST_DIR, "Drifted draft");
		const draftPath = draft.filePath;
		if (!draftPath) throw new Error("expected draft file path");
		const drifted = serializeTask({
			id: "DRAFT-99",
			title: "Drifted draft",
			status: "Draft",
			assignee: [],
			createdDate: "2026-08-24 10:00",
			labels: [],
			dependencies: [],
		});
		await Bun.write(draftPath, drifted);
		const before = await Bun.file(draftPath).text();

		const result = await $`${CLI_COMMAND} draft edit 1 -t X`.cwd(TEST_DIR).nothrow().quiet();
		const output = normalizeCliOutput(result.stdout.toString() + result.stderr.toString());
		expect(result.exitCode).toBe(1);
		expect(output).toContain(basename(dirname(draftPath)));
		expect(output).toContain("DRAFT-99");
		expect(output).toContain("does not match its filename id");
		expect(output).not.toContain("doctor");

		const after = await Bun.file(draftPath).text();
		expect(after).toBe(before);
		const core = new Core(TEST_DIR);
		expect(await core.filesystem.loadDraft("DRAFT-99")).toBeNull();
	});

	it("resolves a canonical draft container through the same loose numeric rule as the TUI", async () => {
		const TEST_DIR = await makeProject();
		const draftsDir = join(TEST_DIR, "backlog", "drafts");
		await Bun.write(
			join(draftsDir, "draft-001", "task.md"),
			serializeTask({
				id: "DRAFT-001",
				title: "Padded",
				status: "Draft",
				assignee: [],
				createdDate: "2026-08-24 10:00",
				labels: [],
				dependencies: [],
			}),
		);

		const shorthand = await $`${CLI_COMMAND} draft edit 1 -t "Padded edited"`.cwd(TEST_DIR).nothrow().quiet();
		expect(shorthand.exitCode).toBe(0);

		const paddedInput = await $`${CLI_COMMAND} draft edit 01 -a @alex`.cwd(TEST_DIR).nothrow().quiet();
		expect(paddedInput.exitCode).toBe(0);

		const core = new Core(TEST_DIR);
		const reloaded = await core.filesystem.loadDraft("DRAFT-001");
		expect(reloaded?.title).toBe("Padded edited");
		expect(reloaded?.assignee).toEqual(["@alex"]);
	});

	it("keeps one damaged draft container from blocking edits of its siblings", async () => {
		const TEST_DIR = await makeProject();
		const healthy = await createDraft(TEST_DIR, "Healthy sibling");
		await createDraft(TEST_DIR, "Damaged sibling");
		const core = new Core(TEST_DIR);
		const drafts = await core.filesystem.listDrafts();
		const damaged = drafts.find((draft) => draft.title === "Damaged sibling");
		if (!damaged?.filePath) throw new Error("expected damaged draft file path");
		await Bun.write(damaged.filePath, "---\nid: [unclosed\ntitle: Damaged sibling\n---\nbroken yaml");

		const healthyEdit = await $`${CLI_COMMAND} draft edit ${healthy.id} -t "Still editable"`
			.cwd(TEST_DIR)
			.nothrow()
			.quiet();
		expect(healthyEdit.exitCode).toBe(0);
		expect((await core.filesystem.loadDraft(healthy.id))?.title).toBe("Still editable");

		const damagedEdit = await $`${CLI_COMMAND} draft edit ${damaged.filePath} -t X`.cwd(TEST_DIR).nothrow().quiet();
		const damagedOutput = normalizeCliOutput(damagedEdit.stdout.toString() + damagedEdit.stderr.toString());
		expect(damagedEdit.exitCode).toBe(1);
		expect(damagedOutput).toContain("could not be parsed");
		expect(damagedOutput).toContain(basename(damaged.filePath));
	});

	it("keeps healthy draft containers selectable when a sibling is damaged", async () => {
		const TEST_DIR = await makeProject();
		const healthy = await createDraft(TEST_DIR, "Healthy wizard target");
		await createDraft(TEST_DIR, "Damaged wizard target");
		const core = new Core(TEST_DIR);
		expect((await core.filesystem.listHealthyDrafts()).length).toBe(2);

		const damaged = (await core.filesystem.listHealthyDrafts()).find(
			(draft) => draft.title === "Damaged wizard target",
		);
		if (!damaged?.filePath) throw new Error("expected damaged draft file path");
		await Bun.write(damaged.filePath, "---\nid: [unclosed\ntitle: Damaged\n---\nbroken yaml");

		expect((await core.filesystem.listDrafts()).length).toBe(0);
		const afterDamage = await core.filesystem.listHealthyDrafts();
		expect(afterDamage.length).toBe(1);
		expect(afterDamage[0]?.id).toBe(healthy.id);
	});

	it("requires a task id outside interactive mode like task edit does", async () => {
		const TEST_DIR = await makeProject();
		const result = await $`${CLI_COMMAND} draft edit -t X`.cwd(TEST_DIR).nothrow().quiet();
		const output = normalizeCliOutput(result.stdout.toString() + result.stderr.toString());
		expect(result.exitCode).toBe(1);
		expect(output).toContain("missing required argument 'taskId'");
	});
});

describe("atomic draft editing", () => {
	let TEST_DIR: string;
	let setup: Core;
	let originalGlobalLockEnv: string | undefined;

	beforeEach(async () => {
		originalGlobalLockEnv = process.env.USE_GLOBAL_TASK_ID_LOCK;
		delete process.env.USE_GLOBAL_TASK_ID_LOCK;

		TEST_DIR = createUniqueTestDir("test-atomic-draft-edit");
		await mkdir(TEST_DIR, { recursive: true });
		setup = new Core(TEST_DIR);
		await initializeFilesystemTestProject(setup, "Atomic Draft Edit Test");
	});

	afterEach(async () => {
		if (originalGlobalLockEnv === undefined) {
			delete process.env.USE_GLOBAL_TASK_ID_LOCK;
		} else {
			process.env.USE_GLOBAL_TASK_ID_LOCK = originalGlobalLockEnv;
		}
		await safeCleanup(TEST_DIR);
	});

	it("never silently loses concurrent draft edits: winners land, losers fail loudly", async () => {
		const created = await $`${CLI_COMMAND} draft create "Contended draft"`.cwd(TEST_DIR).quiet();
		const match = created.stdout.toString().match(/Created draft (\S+)/);
		const draftId = match?.[1];
		if (!draftId) throw new Error("draft create did not report a draft id");
		const reference = await setup.filesystem.resolveDraftReference(draftId);
		if (!reference) throw new Error("expected draft reference");

		// Separate Cores race like separate processes: without serialization each one mutates
		// the same pre-write snapshot and all but one label disappear from the file.
		const writerCount = 6;
		const labels = Array.from({ length: writerCount }, (_, index) => `label-${index + 1}`);
		const writers = labels.map((label) => ({ label, core: new Core(TEST_DIR) }));
		let outcomes: PromiseSettledResult<Task>[];
		try {
			outcomes = await Promise.allSettled(
				writers.map(({ label, core }) => core.updateDraftFromInput(reference, { addLabels: [label] })),
			);
		} finally {
		}

		const succeeded = labels.filter((_, index) => outcomes[index]?.status === "fulfilled");
		expect(succeeded.length).toBeGreaterThanOrEqual(1);

		for (const outcome of outcomes) {
			if (outcome.status === "fulfilled") continue;
			expect(isTaskLockError(outcome.reason)).toBe(true);
		}

		const core = new Core(TEST_DIR);
		const reloaded = await core.filesystem.loadDraft(draftId);
		expect([...(reloaded?.labels ?? [])].sort()).toEqual([...succeeded].sort());
	});

	it.skipIf(process.platform === "win32")(
		"archive fails fast while an edit holds the draft lock, leaving the draft intact",
		async () => {
			const created = await $`${CLI_COMMAND} draft create "Archive race"`.cwd(TEST_DIR).quiet();
			const match = created.stdout.toString().match(/Created draft (\S+)/);
			const draftId = match?.[1];
			if (!draftId) throw new Error("draft create did not report a draft id");
			const reference = await setup.filesystem.resolveDraftReference(draftId);
			if (!reference) throw new Error("expected draft reference");

			let release: () => void = () => {};
			try {
				const held = new Promise<void>((resolveHeld) => {
					void setup.filesystem.withDraftLock(reference, async () => {
						resolveHeld();
						await new Promise<void>((resolveRelease) => {
							release = resolveRelease;
						});
					});
				});
				await held;

				const racingCore = new Core(TEST_DIR);
				try {
					let failure: unknown;
					try {
						await racingCore.archiveDraft(draftId);
						throw new Error("expected contended archive to fail fast");
					} catch (error) {
						if ((error as Error).message.startsWith("expected contended")) throw error;
						failure = error;
					}
					expect(isTaskLockError(failure)).toBe(true);
				} finally {
				}
			} finally {
				release();
			}

			const core = new Core(TEST_DIR);
			const reloaded = await core.filesystem.loadDraft(draftId);
			expect(reloaded?.title).toBe("Archive race");
			const archivedFiles = (await readdir(join(TEST_DIR, "backlog", "archive", "drafts")).catch(() => [])).length;
			expect(archivedFiles).toBe(0);

			// After release, archiving succeeds cleanly.
			expect(await core.archiveDraft(draftId)).toBe(true);
			expect(await core.filesystem.loadDraft(draftId)).toBeNull();
		},
	);

	it("picker lists unrelated healthy drafts beside colliding containers", async () => {
		const draftsDir = join(TEST_DIR, "backlog", "drafts");
		for (const [id, title] of [
			["DRAFT-1", "Alpha"],
			["DRAFT-01", "Alpha twin"],
		] as const) {
			const directory = join(draftsDir, id.toLowerCase());
			await mkdir(directory, { recursive: true });
			await Bun.write(
				join(directory, "task.md"),
				serializeTask({
					id,
					title,
					status: "Draft",
					assignee: [],
					createdDate: "2026-08-24 10:00",
					labels: [],
					dependencies: [],
				}),
			);
		}
		await $`${CLI_COMMAND} draft create "Unrelated gamma"`.cwd(TEST_DIR).nothrow().quiet();

		const rows = await setup.filesystem.listHealthyDrafts();
		expect(rows.length).toBe(3);

		const unrelated = await $`${CLI_COMMAND} draft edit DRAFT-2 -t "Gamma edited"`.cwd(TEST_DIR).nothrow().quiet();
		expect(unrelated.exitCode).toBe(0);

		const colliding = await $`${CLI_COMMAND} draft edit 01 -t X`.cwd(TEST_DIR).nothrow().quiet();
		const collidingOutput = normalizeCliOutput(colliding.stdout.toString() + colliding.stderr.toString());
		expect(colliding.exitCode).toBe(1);
		expect(collidingOutput).toContain("is ambiguous");
	});

	it("promotion preserves one task record while an edit lock is held", async () => {
		const created = await $`${CLI_COMMAND} draft create "Promotion race"`.cwd(TEST_DIR).quiet();
		const match = created.stdout.toString().match(/Created draft (\S+)/);
		const draftId = match?.[1];
		if (!draftId) throw new Error("draft create did not report a draft id");
		const reference = await setup.filesystem.resolveDraftReference(draftId);
		if (!reference) throw new Error("expected draft reference");

		let release: () => void = () => {};
		let lockFailure: unknown;
		let lockOperation: Promise<void> = Promise.resolve();
		const held = new Promise<void>((resolveHeld) => {
			lockOperation = setup.filesystem
				.withDraftLock(reference, async () => {
					resolveHeld();
					await new Promise<void>((resolveRelease) => {
						release = resolveRelease;
					});
				})
				.catch((error) => {
					lockFailure = error;
				});
		});
		await held;

		const racingCore = new Core(TEST_DIR);
		let promotion: Promise<boolean>;
		try {
			promotion = racingCore.promoteDraft(draftId);
			await new Promise((resolve) => setTimeout(resolve, 50));
		} finally {
			release();
		}
		await lockOperation;

		// A contender may finish under the lock or retry after release; either way the
		// transition must leave one complete task and no duplicate draft record.
		expect(await promotion!).toBe(true);
		const promotingCore = new Core(TEST_DIR);
		try {
			expect(await promotingCore.filesystem.loadDraft(draftId)).toBeNull();
			const promoted = (await promotingCore.filesystem.listTasks()).filter((task) => task.title === "Promotion race");
			expect(promoted).toHaveLength(1);
			expect(lockFailure).toBeUndefined();
		} finally {
		}
	});

	it("does not contend with a task that shares the draft's id, but still fails fast on real contention", async () => {
		await $`${CLI_COMMAND} draft create "Namespaced draft"`.cwd(TEST_DIR).quiet();
		const draftReference = await setup.filesystem.resolveDraftReference("DRAFT-1");
		if (!draftReference) throw new Error("expected draft reference");
		await setup.createTask({
			id: "draft-1",
			title: "Task twin",
			status: "To Do",
			assignee: [],
			createdDate: "2026-08-24 10:00",
			labels: [],
			dependencies: [],
		});
		const taskTwin = await setup.filesystem.loadTask("draft-1");
		if (!taskTwin?.filePath) throw new Error("expected task twin");

		let releaseTaskLock: (() => void) | undefined;
		try {
			// Holding the TASK lock on the colliding id must not block the draft edit.
			const taskLockHeld = new Promise<void>((resolveHeld) => {
				void setup.filesystem.withTaskLock(taskTwin, async () => {
					resolveHeld();
					await new Promise<void>((resolveRelease) => {
						releaseTaskLock = resolveRelease;
					});
				});
			});
			await taskLockHeld;

			const editingCore = new Core(TEST_DIR);
			try {
				const updated = await editingCore.updateDraftFromInput(draftReference, { addLabels: ["no-contention"] });
				expect(updated.labels).toContain("no-contention");
			} finally {
			}
		} finally {
			releaseTaskLock?.();
		}

		// Genuine same-file contention still fails fast with the shared error style.
		let releaseDraftLock: (() => void) | undefined;
		try {
			const holdingCore = new Core(TEST_DIR);
			const draftLockHeld = new Promise<void>((resolveHeld) => {
				void holdingCore.filesystem.withDraftLock(draftReference, async () => {
					resolveHeld();
					await new Promise<void>((resolveRelease) => {
						releaseDraftLock = resolveRelease;
					});
				});
			});
			await draftLockHeld;

			const losingCore = new Core(TEST_DIR);
			try {
				let lockFailure: unknown;
				try {
					await losingCore.updateDraftFromInput(draftReference, { addLabels: ["lost"] });
					throw new Error("expected same-file contention to fail fast");
				} catch (error) {
					if ((error as Error).message.startsWith("expected same-file")) throw error;
					lockFailure = error;
				}
				expect(isTaskLockError(lockFailure)).toBe(true);
			} finally {
			}
		} finally {
			releaseDraftLock?.();
		}
	});
});

describe("draft wizard selection binding", () => {
	it("hands the wizard selection back as the bound row handle", async () => {
		let capturedValue: string | undefined;
		const selected = await pickTaskForEditWizard({
			tasks: [{ id: "DRAFT-2", title: "Drifted row", value: "/drafts/draft-1 - Alpha.md" }],
			promptImpl: async (question) => {
				capturedValue = question.options?.at(0)?.value;
				return { taskId: question.options?.at(0)?.value };
			},
		});

		expect(capturedValue).toBe("/drafts/draft-1 - Alpha.md");
		expect(selected).toBe("/drafts/draft-1 - Alpha.md");
	});

	it("refuses a flat draft path with manual conversion guidance", async () => {
		const TEST_DIR = await makeProject();
		const draftsDir = join(TEST_DIR, "backlog", "drafts");
		const drifted = serializeTask({
			id: "DRAFT-2",
			title: "Alpha",
			status: "Draft",
			assignee: [],
			createdDate: "2026-08-24 10:00",
			labels: [],
			dependencies: [],
		});
		const alphaPath = join(draftsDir, "draft-2 - Alpha.md");
		await Bun.write(alphaPath, drifted);

		const result = await $`${CLI_COMMAND} draft edit ${alphaPath} --title Hijacked`.cwd(TEST_DIR).nothrow().quiet();
		const output = normalizeCliOutput(result.stdout.toString() + result.stderr.toString());
		expect(result.exitCode).toBe(1);
		expect(output).toContain("Unsupported flat draft record");
		expect(output).toContain("Manually convert <name>.md to <lowercase-id>/task.md");
		expect(await Bun.file(alphaPath).text()).toBe(drifted);
	});
});

describe("draft identity sweep", () => {
	const writeDraftFile = async (testDir: string, filename: string, id: string, title: string): Promise<string> => {
		const filePath = join(testDir, "backlog", "drafts", filename);
		await mkdir(dirname(filePath), { recursive: true });
		await Bun.write(
			filePath,
			serializeTask({
				id,
				title,
				status: "Draft",
				assignee: [],
				createdDate: "2026-08-24 10:00",
				labels: [],
				dependencies: [],
			}),
		);
		return filePath;
	};

	it("updates a canonical draft container without minting a duplicate", async () => {
		const TEST_DIR = await makeProject();
		await writeDraftFile(TEST_DIR, "draft-1/task.md", "DRAFT-1", "Padded");
		const draftsDir = join(TEST_DIR, "backlog", "drafts");

		const renamed = await $`${CLI_COMMAND} draft edit 1 -t "Converged"`.cwd(TEST_DIR).nothrow().quiet();
		expect(renamed.exitCode).toBe(0);

		const afterRename = (await readdir(draftsDir)).sort();
		expect(afterRename).toEqual(["draft-1"]);

		const relabeled = await $`${CLI_COMMAND} draft edit 1 -a @alex`.cwd(TEST_DIR).nothrow().quiet();
		expect(relabeled.exitCode).toBe(0);
		expect((await readdir(draftsDir)).sort()).toEqual(["draft-1"]);

		const core = new Core(TEST_DIR);
		const reloaded = await core.filesystem.loadDraft("DRAFT-001");
		expect(reloaded?.title).toBe("Converged");
		expect(reloaded?.assignee).toEqual(["@alex"]);
	});

	it("never deletes an unparsable padded canonical twin during allocation", async () => {
		const TEST_DIR = await makeProject(); // Unparsable content: the numeric id is only proclaimed by the filename.
		const notesPath = join(TEST_DIR, "backlog", "drafts", "draft-001", "task.md");
		const brokenYaml = "---\nid: [oops\ntitle: Notes\n---\nbroken yaml";
		await mkdir(dirname(notesPath), { recursive: true });
		await Bun.write(notesPath, brokenYaml);

		const created = await $`${CLI_COMMAND} draft create "Fresh work"`.cwd(TEST_DIR).nothrow().quiet();
		expect(created.exitCode).toBe(0);
		expect(created.stdout.toString()).toContain("Created draft DRAFT-2");

		expect(await Bun.file(notesPath).exists()).toBe(true);
		expect(await Bun.file(notesPath).text()).toBe(brokenYaml);

		// The unparsable file stays reported as unparsable, never silently consumed.
		const editBroken = await $`${CLI_COMMAND} draft edit 1 -t X`.cwd(TEST_DIR).nothrow().quiet();
		const brokenOutput = normalizeCliOutput(editBroken.stdout.toString() + editBroken.stderr.toString());
		expect(editBroken.exitCode).toBe(1);
		expect(brokenOutput).toContain("could not be parsed");
		expect(brokenOutput).toContain("task.md could not be parsed");
	});

	it("groups colliding draft filenames for fail-closed picker rendering", () => {
		const groups = findDuplicateDraftFilenameGroups([
			"draft-2 - Beta.md",
			"draft-1 - Alpha.md",
			"draft-01 - Alpha.md",
			"task-1 - Not a draft.md",
		]);
		expect(groups).toEqual([["draft-01 - Alpha.md", "draft-1 - Alpha.md"]]);
		expect(findDuplicateDraftFilenameGroups(["draft-1 - Solo.md", "draft-2 - Other.md"])).toEqual([]);
	});
});

describe("draft identity edge cases", () => {
	it("groups dotted-segment padding variants so direct ids fail closed", async () => {
		const TEST_DIR = await makeProject();
		const draftsDir = join(TEST_DIR, "backlog", "drafts");
		const twin = async (container: string, id: string, title: string) => {
			const path = join(draftsDir, container, "task.md");
			await mkdir(dirname(path), { recursive: true });
			await Bun.write(
				path,
				serializeTask({
					id,
					title,
					status: "Draft",
					assignee: [],
					createdDate: "2026-08-24 10:00",
					labels: [],
					dependencies: [],
				}),
			);
		};
		await twin("draft-1.1", "DRAFT-1.1", "Sub");
		await twin("draft-1.01", "DRAFT-1.01", "Twin");

		expect(findDuplicateDraftFilenameGroups(["draft-1.1 - Sub.md", "draft-1.01 - Twin.md"])).toHaveLength(1);

		const edit = await $`${CLI_COMMAND} draft edit 1.1 -t X`.cwd(TEST_DIR).nothrow().quiet();
		const output = normalizeCliOutput(edit.stdout.toString() + edit.stderr.toString());
		expect(edit.exitCode).toBe(1);
		expect(output).toContain("is ambiguous");
		expect(output).toContain("draft-1.01/task.md");

		const after = (await readdir(draftsDir)).sort();
		expect(after).toEqual(["draft-1.01", "draft-1.1"]);
	});

	it("rejects absolute paths as the public taskId argument", async () => {
		const TEST_DIR = await makeProject();
		const foreignDir = join(TEST_DIR, "outside");
		await mkdir(foreignDir, { recursive: true });
		const foreignPath = join(foreignDir, "draft-1 - Foreign.md");
		const foreignContent = serializeTask({
			id: "DRAFT-1",
			title: "Foreign",
			status: "Draft",
			assignee: [],
			createdDate: "2026-08-24 10:00",
			labels: [],
			dependencies: [],
			rawContent: "foreign body",
		});
		await Bun.write(foreignPath, foreignContent);

		const result = await $`${CLI_COMMAND} draft edit ${foreignPath} --title Hijacked`.cwd(TEST_DIR).nothrow().quiet();
		const output = normalizeCliOutput(result.stdout.toString() + result.stderr.toString());
		expect(result.exitCode).toBe(1);
		expect(output).toContain("Invalid draft path");
		expect(await Bun.file(foreignPath).text()).toBe(foreignContent);
		expect((await readdir(join(TEST_DIR, "backlog", "drafts"))).length).toBe(0);
	});

	it("fails closed when a path-form id names one duplicate canonical draft", async () => {
		const TEST_DIR = await makeProject();
		const draftsDir = join(TEST_DIR, "backlog", "drafts");
		const alphaPath = join(draftsDir, "draft-1", "task.md");
		const twinPath = join(draftsDir, "draft-01", "task.md");
		await mkdir(dirname(alphaPath), { recursive: true });
		await mkdir(dirname(twinPath), { recursive: true });
		await Bun.write(
			alphaPath,
			serializeTask({
				id: "DRAFT-1",
				title: "Alpha",
				status: "Draft",
				assignee: [],
				createdDate: "2026-08-24 10:00",
				labels: [],
				dependencies: [],
			}),
		);
		await Bun.write(
			twinPath,
			serializeTask({
				id: "DRAFT-01",
				title: "Beta",
				status: "Draft",
				assignee: [],
				createdDate: "2026-08-24 10:00",
				labels: [],
				dependencies: [],
			}),
		);

		const result = await $`${CLI_COMMAND} draft edit ${alphaPath} --title Hijacked`.cwd(TEST_DIR).nothrow().quiet();
		const output = normalizeCliOutput(result.stdout.toString() + result.stderr.toString());
		expect(result.exitCode).toBe(1);
		expect(output).toContain("is ambiguous");
		expect(output).toContain("Rename one file to a distinct numeric id, then make its frontmatter agree.");

		expect(await Bun.file(alphaPath).text()).toContain("Alpha");
		expect(await Bun.file(twinPath).text()).toContain("Beta");
		expect((await readdir(draftsDir)).sort()).toEqual(["draft-01", "draft-1"]);
	});

	it("still accepts the canonical in-drafts-dir task.md path for a unique draft", async () => {
		const TEST_DIR = await makeProject();
		await $`${CLI_COMMAND} draft create "Solo draft"`.cwd(TEST_DIR).nothrow().quiet();
		const draftsDir = join(TEST_DIR, "backlog", "drafts");
		const soloPath = join(draftsDir, "draft-1", "task.md");
		if (!soloPath) throw new Error("expected the created draft file");

		const result = await $`${CLI_COMMAND} draft edit ${soloPath} -a @alex`.cwd(TEST_DIR).nothrow().quiet();
		expect(result.exitCode).toBe(0);

		const core = new Core(TEST_DIR);
		expect((await core.filesystem.loadDraft("DRAFT-1"))?.assignee).toEqual(["@alex"]);
	});

	it("lists the real supported fields in draft edit help", async () => {
		const TEST_DIR = await makeProject();
		const help = await $`${CLI_COMMAND} draft edit --help`.cwd(TEST_DIR).nothrow().quiet();
		const output = normalizeCliOutput(help.stdout.toString());
		for (const flag of [
			"--title",
			"--description",
			"--assignee",
			"--label",
			"--add-label",
			"--remove-label",
			"--priority",
			"--ordinal",
			"--milestone",
			"--due-date",
			"--clear-due-date",
			"--depends-on",
			"--clear-deps",
			"--ref",
			"--add-ref",
			"--doc",
			"--modified-file",
			"--clear-refs",
			"--clear-labels",
			"--plain",
		]) {
			expect(output).toContain(flag);
		}
		expect(output).not.toContain("--agent-summary");
		expect(output).not.toContain("--append-agent-summary");
		expect(output).not.toContain("--clear-agent-summary");
	});
});
