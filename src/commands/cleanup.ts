import { basename, join } from "node:path";
import * as clack from "@clack/prompts";
import type { Command } from "commander";
import { DEFAULT_STATUSES } from "../constants/index.ts";
import { Core } from "../core/backlog.ts";
import type { BacklogConfig, Task } from "../types/index.ts";
import { getTerminalStatus, isTerminalStatus } from "../utils/terminal-status.ts";
import { formatUtcDateForDisplay } from "../utils/utc-date-display.ts";
import { addHelpSchema } from "./help-schema.ts";

const CLEANUP_AGE_OPTIONS = [
	{ title: "1 day", value: 1 },
	{ title: "1 week", value: 7 },
	{ title: "2 weeks", value: 14 },
	{ title: "3 weeks", value: 21 },
	{ title: "1 month", value: 30 },
	{ title: "3 months", value: 90 },
	{ title: "1 year", value: 365 },
];

function cleanupAgeTitle(age: number): string | undefined {
	return CLEANUP_AGE_OPTIONS.find((option) => option.value === age)?.title;
}

async function selectCleanupAge(): Promise<number | null> {
	const selectedAge = await clack.select({
		message: "Move tasks to completed folder if they are older than:",
		options: CLEANUP_AGE_OPTIONS.map((option) => ({ label: option.title, value: option.value })),
	});
	if (clack.isCancel(selectedAge)) {
		console.log("Cleanup cancelled.");
		return null;
	}
	return selectedAge;
}

function printCleanupPreview(tasks: Task[], ageTitle: string | undefined, config: BacklogConfig): boolean {
	if (tasks.length === 0) {
		console.log(`No tasks found that are older than ${ageTitle}.`);
		return false;
	}

	console.log(`\nFound ${tasks.length} tasks older than ${ageTitle}:`);
	for (const task of tasks.slice(0, 5)) {
		const date = formatUtcDateForDisplay(task.updatedDate || task.createdDate, { dateFormat: config.dateFormat });
		console.log(`  - ${task.id}: ${task.title} (${date})`);
	}
	if (tasks.length > 5) {
		console.log(`  ... and ${tasks.length - 5} more`);
	}
	return true;
}

async function confirmCleanupMove(taskCount: number): Promise<boolean> {
	const confirmed = await clack.confirm({
		message: `Move ${taskCount} tasks to completed folder?`,
		initialValue: false,
	});
	if (clack.isCancel(confirmed) || !confirmed) {
		console.log("Cleanup cancelled.");
		return false;
	}
	return true;
}

async function selectCleanupTasks(core: Core, config: BacklogConfig): Promise<Task[] | null> {
	const selectedAge = await selectCleanupAge();
	if (selectedAge === null) {
		return null;
	}

	const tasksToMove = await core.getTerminalStatusTasksByAge(selectedAge);
	if (!printCleanupPreview(tasksToMove, cleanupAgeTitle(selectedAge), config)) {
		return null;
	}
	if (!(await confirmCleanupMove(tasksToMove.length))) {
		return null;
	}
	return tasksToMove;
}

async function moveCleanupTask(core: Core, task: Task): Promise<{ fromPath: string; toPath: string } | null> {
	const fromPath = task.filePath ?? (await core.getTask(task.id))?.filePath ?? null;
	if (!fromPath) {
		console.error(`Failed to locate file for task ${task.id}`);
		return null;
	}

	const toPath = join(core.filesystem.completedDir, basename(fromPath));
	if (await core.completeTask(task.id)) return { fromPath, toPath };
	console.error(`Failed to move task ${task.id}`);
	return null;
}

async function stageCleanupMoves(core: Core, moves: Array<{ fromPath: string; toPath: string }>) {
	if (moves.length === 0 || !(await core.git.isRepository())) return false;

	console.log("Staging file moves for Git...");
	for (const { fromPath, toPath } of moves) {
		try {
			await core.git.stageFileMove(fromPath, toPath);
		} catch (error) {
			console.warn(`Warning: Could not stage move for Git: ${error}`);
		}
	}
	return true;
}

async function moveCleanupTasks(core: Core, tasks: Task[]): Promise<{ successCount: number; stagedForGit: boolean }> {
	console.log("Moving tasks...");
	const movedTasks: Array<{ fromPath: string; toPath: string }> = [];

	for (const task of tasks) {
		const movedTask = await moveCleanupTask(core, task);
		if (movedTask) movedTasks.push(movedTask);
	}

	return { successCount: movedTasks.length, stagedForGit: await stageCleanupMoves(core, movedTasks) };
}

async function runSelectedCleanup(core: Core, config: BacklogConfig): Promise<void> {
	const tasksToMove = await selectCleanupTasks(core, config);
	if (!tasksToMove) return;

	const { successCount, stagedForGit } = await moveCleanupTasks(core, tasksToMove);
	console.log(`Successfully moved ${successCount} of ${tasksToMove.length} tasks to completed folder.`);
	if (stagedForGit) console.log("Files have been staged. To commit: git commit -m 'cleanup: Move completed tasks'");
}

async function runCleanupCommand(cwd: string): Promise<void> {
	const core = new Core(cwd);
	const config = await core.filesystem.loadConfig();
	if (!config) {
		console.error("No AgenticWorkspace project found. Initialize one first with: agenticworkspace init");
		throw Object.assign(new Error("CLI requested exit"), { exitCode: 1 });
	}
	core.git.setConfig(config);

	const statuses = config.statuses ?? [...DEFAULT_STATUSES];
	const terminalStatus = getTerminalStatus(statuses);
	if (!terminalStatus) {
		console.log("No terminal status configured for cleanup.");
		return;
	}

	const terminalStatusTasks = (await core.queryTasks()).filter((task) => isTerminalStatus(task.status, statuses));
	if (terminalStatusTasks.length === 0) {
		console.log(`No ${terminalStatus} tasks found to clean up.`);
		return;
	}

	console.log(`Found ${terminalStatusTasks.length} tasks marked as ${terminalStatus}.`);
	await runSelectedCleanup(core, config);
}

export function registerCleanupCommand(
	program: Command,
	runtime: { requireProjectRoot(): Promise<string>; reportFailure(summary: string, error: unknown): void },
): void {
	addHelpSchema(program.command("cleanup"), {
		reads: "Tasks in terminal status from the configured backlog directory",
		required: [],
		optional: [],
		writes: "Moves selected terminal-status tasks to the completed folder",
		output: "Interactive cleanup summary",
		examples: ["agenticworkspace cleanup"],
	})
		.description("move completed tasks to completed folder based on age")
		.action(async () => {
			try {
				await runCleanupCommand(await runtime.requireProjectRoot());
			} catch (error) {
				runtime.reportFailure("Failed to run cleanup", error);
			}
		});
}
