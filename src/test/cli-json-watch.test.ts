import { describe, expect, it } from "bun:test";
import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import type { Task } from "../types/index.ts";
import { getTestCliCommand } from "./test-cli.ts";
import {
	createLauncherInstall,
	createUniqueTestDir,
	getPlatformTimeout,
	initializeFilesystemTestProject,
	isWindows,
	safeCleanup,
	waitUntil,
	withTimeout,
} from "./test-utils.ts";

const CLI_COMMAND = getTestCliCommand();
const WATCH = ["task", "list", "--json", "--watch"];
let inProcessTail = Promise.resolve();

type Watch = {
	process: Bun.Subprocess<"ignore", "pipe", "pipe">;
	snapshots: string[];
	stderr: Promise<string>;
	reading: Promise<void>;
};

/** Builds an isolated, initialized project for one test. */
async function makeProject(): Promise<{ dir: string; core: Core }> {
	const dir = createUniqueTestDir("json-watch");
	await mkdir(dir, { recursive: true });
	const core = new Core(dir);
	await initializeFilesystemTestProject(core, "JSON watch");
	return { dir, core };
}

function startWatch(dir: string, track: Watch[], args: string[] = []) {
	return follow(
		Bun.spawn([...CLI_COMMAND, ...WATCH, ...args], {
			cwd: dir,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		}),
		track,
	);
}

/** Start the watch from a throwaway process that hands it stdout and stderr, as a script or agent harness would. */
function startWatchFrom(dir: string, track: Watch[], command: string[]) {
	const starter = `Bun.spawn(${JSON.stringify(command)}, { stdio: ["ignore", "inherit", "inherit"] })`;
	return follow(
		Bun.spawn(["bun", "-e", starter], {
			cwd: dir,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
			// A POSIX process group lets cleanup stop anything the starter left behind.
			detached: !isWindows(),
		}),
		track,
	);
}

function follow(child: Bun.Subprocess<"ignore", "pipe", "pipe">, track: Watch[]): Watch {
	const snapshots: string[] = [];
	const stderr = new Response(child.stderr).text();
	const reading = (async () => {
		const decoder = new TextDecoder();
		let buffer = "";
		for await (const chunk of child.stdout) {
			buffer += decoder.decode(chunk, { stream: true });
			// The existing pretty-printed envelope ends with an unindented closing brace.
			let end = buffer.indexOf("\n}\n");
			while (end !== -1) {
				snapshots.push(buffer.slice(0, end + 3));
				buffer = buffer.slice(end + 3);
				end = buffer.indexOf("\n}\n");
			}
		}
	})();
	const result = { process: child, snapshots, stderr, reading };
	track.push(result);
	return result;
}

/** Stops every watch this test started and waits for its output to end. */
async function stopWatches(track: Watch[]): Promise<void> {
	for (const watch of track.splice(0)) {
		watch.process.kill();
		await watch.process.exited;
		await watch.reading;
	}
}

async function runInProcess(dir: string, args: string[]) {
	const previous = inProcessTail;
	let release!: () => void;
	inProcessTail = new Promise<void>((resolve) => {
		release = resolve;
	});
	await previous;
	try {
		const stdout: string[] = [];
		const stderr: string[] = [];
		const capture = (chunks: string[]) =>
			new Writable({
				write: (chunk, _encoding, done) => {
					chunks.push(chunk.toString());
					done();
				},
			});
		const exitCode = await runCli(args, { cwd: dir, stdout: capture(stdout), stderr: capture(stderr) });
		return { stdout: stdout.join(""), stderr: stderr.join(""), exitCode };
	} finally {
		release();
	}
}

async function once(dir: string, args: string[] = []) {
	const result = await runInProcess(dir, ["task", "list", "--json", ...args]);
	expect(result.stderr).toBe("");
	expect(result.exitCode).toBe(0);
	return result.stdout;
}

async function create(core: Core, id: string, overrides: Partial<Task> = {}) {
	await core.createTask({
		id,
		title: `Task ${id}`,
		status: "To Do",
		assignee: [],
		labels: [],
		dependencies: [],
		createdDate: "2026-09-12",
		rawContent: "",
		...overrides,
	});
}

async function expectCurrent(dir: string, watch: Watch, args: string[] = []) {
	const expected = await once(dir, args);
	await waitUntil(() => watch.snapshots.at(-1) === expected, "watch matching one-shot JSON", 5000);
	expect(watch.snapshots.at(-1)).toBe(expected);
}

// Resource-intensive watch cases are serialized to avoid overlapping large subprocess outputs.
describe("CLI JSON watch", () => {
	it("preserves exact initial bytes, follows create/atomic edit/removal, and suppresses unchanged results", async () => {
		const { dir, core } = await makeProject();
		const track: Watch[] = [];
		try {
			const watch = startWatch(dir, track);
			await expectCurrent(dir, watch);
			expect(JSON.parse(watch.snapshots[0] ?? "").tasks).toEqual([]);
			expect(watch.process.exitCode).toBeNull();

			await create(core, "TASK-1", { title: 'Quoted "title" with } and a newline\ninside', labels: ["cli"] });
			await expectCurrent(dir, watch);
			const task = await core.loadTaskById("TASK-1");
			const path = task?.filePath;
			if (!path) throw new Error("Missing task path");
			const markdown = await readFile(path, "utf8");
			await writeFile(`${path}.tmp`, markdown.replace("labels:", "priority: high\nlabels:"));
			await rename(`${path}.tmp`, path);
			await expectCurrent(dir, watch);
			expect(JSON.parse(watch.snapshots.at(-1) ?? "").tasks[0].priority).toBe("high");

			const count = watch.snapshots.length;
			await writeFile(path, await readFile(path, "utf8"));
			await core.editTask("TASK-1", { priority: "medium" });
			await waitUntil(
				() =>
					watch.snapshots.length > count && JSON.parse(watch.snapshots.at(-1) ?? "{}").tasks[0]?.priority === "medium",
				"watch remains alive after unchanged bytes",
				5000,
			);
			expect(watch.snapshots).toHaveLength(count + 1);
			await rm(path);
			await expectCurrent(dir, watch);
			expect(JSON.parse(watch.snapshots.at(-1) ?? "").tasks).toEqual([]);
			expect(await once(dir)).toBe(watch.snapshots.at(-1) ?? "");
			watch.process.kill("SIGTERM");
			await watch.process.exited;
			expect(await watch.stderr).toBe("");
		} finally {
			await stopWatches(track);
			await safeCleanup(dir);
		}
	});

	it("reapplies filters, sorting and limits as tasks enter and leave the result", async () => {
		const { dir, core } = await makeProject();
		const track: Watch[] = [];
		try {
			await create(core, "TASK-1", { priority: "low", labels: ["cli"] });
			await create(core, "TASK-2", { priority: "high", status: "Done", labels: ["cli"] });
			const args = ["--status", "To Do", "--labels", "cli", "--sort", "priority", "--limit", "1"];
			const watch = startWatch(dir, track, args);
			await expectCurrent(dir, watch, args);
			expect(JSON.parse(watch.snapshots.at(-1) ?? "").tasks[0].id).toBe("TASK-1");
			await core.editTask("TASK-2", { status: "To Do" });
			await expectCurrent(dir, watch, args);
			expect(JSON.parse(watch.snapshots.at(-1) ?? "").tasks[0].id).toBe("TASK-2");
			await core.archiveTask("TASK-2");
			await expectCurrent(dir, watch, args);
			expect(JSON.parse(watch.snapshots.at(-1) ?? "").tasks[0].id).toBe("TASK-1");
		} finally {
			await stopWatches(track);
			await safeCleanup(dir);
		}
	});

	it("refreshes readiness from completed dependencies and configuration", async () => {
		const { dir, core } = await makeProject();
		const track: Watch[] = [];
		try {
			await create(core, "TASK-1", { dependencies: ["TASK-2"] });
			await create(core, "TASK-2", { status: "Done" });
			await core.completeTask("TASK-2");
			const args = ["--parent", "TASK-9"];
			// Readiness must see completed dependencies even when only one local task remains.
			const watch = startWatch(dir, track);
			await expectCurrent(dir, watch);
			expect(JSON.parse(watch.snapshots.at(-1) ?? "").tasks[0].isReady).toBe(true);
			const completed = (await core.filesystem.listCompletedTasks())[0];
			if (!completed?.filePath) throw new Error("Missing completed task path");
			await rm(dirname(completed.filePath), { recursive: true });
			await expectCurrent(dir, watch);
			expect(JSON.parse(watch.snapshots.at(-1) ?? "").tasks[0].isReady).toBe(false);
			await create(core, "TASK-2", { status: "Done" });
			await expectCurrent(dir, watch);
			const config = await core.filesystem.loadConfig();
			if (!config) throw new Error("Missing config");
			await core.filesystem.saveConfig({ ...config, statuses: ["To Do", "Done", "Finished"] });
			await expectCurrent(dir, watch);
			expect(JSON.parse(watch.snapshots.at(-1) ?? "").tasks.find((task: Task) => task.id === "TASK-1").isReady).toBe(
				false,
			);
			// A failed initial lookup produces no JSON, exactly as in one-shot mode.
			const invalid = startWatch(dir, track, args);
			expect(await invalid.process.exited).toBe(1);
			expect(invalid.snapshots).toEqual([]);
		} finally {
			await stopWatches(track);
			await safeCleanup(dir);
		}
	});

	it("fails closed if a duplicate identity appears after the initial response", async () => {
		const { dir, core } = await makeProject();
		const track: Watch[] = [];
		try {
			await create(core, "TASK-1");
			const watch = startWatch(dir, track);
			await expectCurrent(dir, watch);
			const task = await core.loadTaskById("TASK-1");
			if (!task?.filePath) throw new Error("Missing task path");
			const duplicate = join(core.filesystem.tasksDir, "task-1-duplicate", "task.md");
			await mkdir(join(core.filesystem.tasksDir, "task-1-duplicate"), { recursive: true });
			await writeFile(duplicate, await readFile(task.filePath, "utf8"));
			expect(await watch.process.exited).toBe(1);
			expect(watch.snapshots).toHaveLength(1);
			expect(await watch.stderr).toContain("task-1-duplicate");
		} finally {
			await stopWatches(track);
			await safeCleanup(dir);
		}
	});

	it("terminates even when a subscriber stops reading a large response", async () => {
		const { dir, core } = await makeProject();
		try {
			await create(core, "TASK-1", { references: [`https://example.com/${"x".repeat(2_000_000)}`] });
			const child = spawn(CLI_COMMAND[0]!, [...CLI_COMMAND.slice(1), "task", "list", "--json", "--watch"], {
				cwd: dir,
				stdio: ["ignore", "pipe", "pipe"],
			});
			let exitObserved = false;
			const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
				child.once("exit", (code, signal) => {
					exitObserved = true;
					resolve({ code, signal });
				});
			});
			const stderr = (async () => {
				let output = "";
				for await (const chunk of child.stderr) output += chunk.toString();
				return output;
			})();
			try {
				const initialChunk = await withTimeout(
					new Promise<Buffer>((resolve) => {
						child.stdout.once("data", (chunk: Buffer) => {
							child.stdout.pause();
							resolve(chunk);
						});
					}),
					"initial watch output",
					getPlatformTimeout(5000),
				);
				expect(initialChunk.length).toBeGreaterThan(0);
				child.kill("SIGTERM");
				const { code, signal } = await withTimeout(
					exit,
					"watch termination with unread output",
					getPlatformTimeout(5000),
				);
				const exitCode = code ?? (signal === "SIGTERM" ? 143 : null);
				await withTimeout(
					(async () => {
						for await (const _chunk of child.stdout) {
						}
					})(),
					"drain watch output after termination",
					getPlatformTimeout(5000),
				);
				// Windows terminates the process directly rather than delivering a POSIX signal.
				if (process.platform !== "win32") expect(exitCode).toBe(143);
				expect(await withTimeout(stderr, "read watch stderr", getPlatformTimeout(5000))).toBe("");
			} finally {
				if (!exitObserved) child.kill("SIGKILL");
				await withTimeout(exit, "watch cleanup", getPlatformTimeout(5000));
			}
		} finally {
			await safeCleanup(dir);
		}
	});

	async function expectWatchToEndWithItsStarter(dir: string, core: Core, track: Watch[], command: string[]) {
		const watch = startWatchFrom(dir, track, command);
		const tasks = () => JSON.parse(watch.snapshots.at(-1) ?? "{}").tasks?.length;
		try {
			await waitUntil(() => tasks() === 0, "initial watch response", 5000);
			// A positive change proves the child watch remains alive before testing its starter's lifetime.
			await create(core, "TASK-1");
			await waitUntil(() => tasks() === 1, "watch response after a task change", 5000);
			watch.process.kill("SIGKILL");
			await watch.process.exited;
			// End of output means no starter, launcher or watch process holds it any longer.
			await withTimeout(watch.reading, "watch exit after its starter was killed", getPlatformTimeout(5000));
			expect(await watch.stderr).toBe("");
		} finally {
			if (!isWindows()) {
				try {
					process.kill(-watch.process.pid, "SIGKILL");
				} catch {
					// Nothing was left behind.
				}
			}
		}
	}

	it("ends when the process that started it is killed", async () => {
		const { dir, core } = await makeProject();
		const track: Watch[] = [];
		try {
			await expectWatchToEndWithItsStarter(dir, core, track, [...CLI_COMMAND, ...WATCH]);
		} finally {
			await stopWatches(track);
			await safeCleanup(dir);
		}
	});

	it("ends with the launcher when the process that started the npm launcher is killed", async () => {
		const { dir, core } = await makeProject();
		const track: Watch[] = [];
		try {
			const launcher = await createLauncherInstall(join(dir, "launcher"), (path) => copyFile(process.execPath, path));
			await expectWatchToEndWithItsStarter(dir, core, track, ["node", launcher, ...CLI_COMMAND.slice(1), ...WATCH]);
		} finally {
			await stopWatches(track);
			await safeCleanup(dir);
		}
	});

	it("requires JSON and rejects invalid options without writing a snapshot", async () => {
		const { dir } = await makeProject();
		const track: Watch[] = [];
		try {
			const missingJson = await runInProcess(dir, ["task", "list", "--watch"]);
			expect(missingJson.stdout).toBe("");
			expect(missingJson.stderr).toContain("--watch requires --json");
			expect(missingJson.exitCode).toBe(1);
			for (const args of [["--plain"], ["--limit", "0"], ["--sort", "unknown"]]) {
				const result = await runInProcess(dir, ["task", "list", "--json", "--watch", ...args]);
				expect(result.exitCode).toBe(1);
				expect(result.stdout).toBe("");
				expect(result.stderr).not.toBe("");
			}
		} finally {
			await stopWatches(track);
			await safeCleanup(dir);
		}
	});
});
