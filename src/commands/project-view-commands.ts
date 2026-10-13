import { stdin as input } from "node:process";
import { createInterface } from "node:readline/promises";
import type { Command } from "commander";
import { generateKanbanBoardWithMetadata, generateMilestoneGroupedBoard } from "../board.ts";
import { createLoadingScreen } from "../cli/loading.ts";
import { findLocalDuplicateTaskIds } from "../core/duplicate-task-detection.ts";
import { collectArchivedMilestoneKeys, milestoneKey } from "../core/milestones.ts";
import { type Core, exportKanbanBoardToFile, updateReadmeWithBoard } from "../index.ts";
import { OpenTuiWorkspaceController } from "../ui/opentui/workspace-controller.ts";
import { resolveMilestoneInputForStorage } from "../utils/milestone-storage.ts";

type ProjectViewCommandRuntime = {
	createCore(): Promise<Core>;
	requireProjectRoot(): Promise<string>;
	hasInteractiveTTY: boolean;
	version: string;
	reportFailure(summary: string, error: unknown): void;
};
async function assertBoardExportIdentities(
	core: Core,
	snapshot: Awaited<ReturnType<Core["loadTaskSnapshot"]>>,
): Promise<void> {
	const [duplicate] = await findLocalDuplicateTaskIds(core, snapshot);
	if (!duplicate) return;
	const records = duplicate.tasks.map((task) => `  - ${task.filePath ?? task.id}`).join("\n");
	throw new Error(`Task ID ${duplicate.id} is ambiguous; review the duplicate records manually:\n${records}`);
}

export function registerBoardCommands(program: Command, runtime: ProjectViewCommandRuntime): void {
	const boardCmd = program.command("board");
	const addBoardOptions = (cmd: Command) =>
		cmd
			.option("-l, --layout <layout>", "board layout (horizontal|vertical)", "horizontal")
			.option("--vertical", "use vertical layout (shortcut for --layout vertical)")
			.option("-m, --milestones", "group tasks by milestone");
	const view = async (_options: unknown, command: Command) => {
		const options = command.optsWithGlobals<{ milestones?: boolean }>();
		const core = await runtime.createCore();
		if (runtime.hasInteractiveTTY) {
			await new OpenTuiWorkspaceController(core, {
				initialView: "board",
				boardMilestoneMode: options.milestones,
			}).run();
			return;
		}
		const [config, tasks, milestones, archived] = await Promise.all([
			core.filesystem.loadConfig(),
			core.loadTasks(),
			core.filesystem.listMilestones(),
			core.filesystem.listArchivedMilestones(),
		]);
		const archivedKeys = new Set(collectArchivedMilestoneKeys(archived, milestones));
		const boardTasks = tasks.map((task) => {
			const key = milestoneKey(resolveMilestoneInputForStorage(task.milestone ?? "", milestones, archived));
			return key && archivedKeys.has(key)
				? { ...task, milestone: undefined, status: task.status || "" }
				: { ...task, status: task.status || "" };
		});
		const statuses = config?.hideEmptyColumns
			? (config.statuses ?? []).filter((status) => boardTasks.some((task) => task.status === status))
			: (config?.statuses ?? []);
		const projectName = config?.projectName?.trim() || "Project";
		console.log(
			options.milestones
				? generateMilestoneGroupedBoard(boardTasks, statuses, milestones, projectName)
				: generateKanbanBoardWithMetadata(boardTasks, statuses, projectName),
		);
	};
	addBoardOptions(boardCmd).description("display tasks in a Kanban board").action(view);
	addBoardOptions(boardCmd.command("view").description("display tasks in a Kanban board")).action(view);
	boardCmd
		.command("export [filename]")
		.description("export kanban board to markdown file")
		.option("--force", "overwrite existing file without confirmation")
		.option("--readme", "export to README.md with markers")
		.option("--export-version <version>", "version to include in the export")
		.action(async (filename, options) => {
			const core = await runtime.createCore();
			const loadingScreen = await createLoadingScreen("Loading tasks for export");
			try {
				const snapshot = await core.loadTaskSnapshot();
				await assertBoardExportIdentities(core, snapshot);
				const tasks = snapshot.tasks;
				const config = snapshot.config;
				loadingScreen?.update(`Total tasks: ${tasks.length}`);
				loadingScreen?.close();
				const cwd = await runtime.requireProjectRoot();
				const projectName = config?.projectName || (await import("node:path")).basename(cwd);
				if (options.readme) {
					await updateReadmeWithBoard(
						tasks,
						config?.statuses || [],
						projectName,
						options.exportVersion || runtime.version,
					);
					console.log("Updated README.md with Kanban board.");
					return;
				}
				const outputPath = (await import("node:path")).join(cwd, filename || "AgenticWorkspace.md");
				const exists = await Bun.file(outputPath).exists();
				if (exists && !options.force) {
					const rl = createInterface({ input });
					try {
						if (
							!(await rl.question(`File "${outputPath}" already exists. Overwrite? (y/N): `))
								.toLowerCase()
								.startsWith("y")
						) {
							console.log("Export cancelled.");
							return;
						}
					} finally {
						rl.close();
					}
				}
				await exportKanbanBoardToFile(tasks, config?.statuses || [], outputPath, projectName, options.force || !exists);
				console.log(`Exported board to ${outputPath}`);
			} catch (error) {
				loadingScreen?.close();
				throw error;
			}
		});
}
