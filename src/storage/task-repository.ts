import type { Dirent } from "node:fs";
import { access, readdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { isValidTaskId, taskIdsEqual } from "../model/task/task-id.ts";
import type { Task } from "../model/types.ts";
import { parseTask } from "./markdown/parser.ts";

export const TASK_FILE_READ_CONCURRENCY = 32;

type ParsedTaskFile = { content: string; task: Task };
type FailedTaskFileParse = { content: string; error: TaskFileParseError };

class TaskFileParseError extends Error {
	constructor(error: unknown) {
		super(error instanceof Error ? error.message : String(error), { cause: error });
	}
}

export function warnUnparseableTaskFile(filepath: string, error: unknown): void {
	const problem = (error instanceof Error ? error.message : String(error)).replace(/[\r\n]+/g, " ");
	console.warn(`Warning: Skipping unparseable task file ${filepath}: ${problem}`);
}

/**
 * Reads task files with a bounded, content-addressed parse cache. It deliberately owns only
 * task discovery and parsing; task mutations remain coordinated by FileSystem locks.
 */
export class TaskRepository {
	readonly parsedFiles = new Map<string, ParsedTaskFile>();
	readonly fileReadGenerations = new Map<string, number>();
	private readonly failedParses = new Map<string, FailedTaskFileParse>();
	private cacheEpoch = 0;
	private fileReadGeneration = 0;
	private readonly warnedParseFiles = new Set<string>();
	private activeReads = 0;
	private readonly pendingReads: Array<() => void> = [];

	get epoch(): number {
		return this.cacheEpoch;
	}

	invalidate(): void {
		this.cacheEpoch++;
		this.parsedFiles.clear();
		this.fileReadGenerations.clear();
		this.failedParses.clear();
		this.warnedParseFiles.clear();
	}

	private async withReadSlot<T>(read: () => Promise<T>): Promise<T> {
		if (this.activeReads < TASK_FILE_READ_CONCURRENCY) this.activeReads++;
		else await new Promise<void>((resume) => this.pendingReads.push(resume));
		try {
			return await read();
		} finally {
			const next = this.pendingReads.shift();
			if (next) next();
			else this.activeReads--;
		}
	}

	/** Re-read for freshness, but only parse again when the exact file content changed. */
	async readParsedFile(filepath: string, epoch = this.cacheEpoch): Promise<Task> {
		const cacheKey = resolve(filepath);
		const generation = ++this.fileReadGeneration;
		if (epoch === this.cacheEpoch) this.fileReadGenerations.set(cacheKey, generation);
		const content = await this.withReadSlot(async () => await Bun.file(filepath).text());
		const cached = this.parsedFiles.get(cacheKey);
		if (cached?.content === content) return structuredClone(cached.task);
		const failed = this.failedParses.get(cacheKey);
		if (failed?.content === content) throw failed.error;

		let task: Task;
		try {
			task = parseTask(content);
		} catch (error) {
			const parseError = new TaskFileParseError(error);
			if (epoch === this.cacheEpoch && this.fileReadGenerations.get(cacheKey) === generation) {
				this.failedParses.set(cacheKey, { content, error: parseError });
			}
			throw parseError;
		}
		this.failedParses.delete(cacheKey);
		this.warnedParseFiles.delete(cacheKey);
		if (epoch === this.cacheEpoch && this.fileReadGenerations.get(cacheKey) === generation) {
			this.parsedFiles.set(cacheKey, { content, task });
		}
		return structuredClone(task);
	}

	async readFiles(directory: string, files: string[], epoch = this.cacheEpoch): Promise<Task[]> {
		const directoryPath = resolve(directory);
		const livePaths = new Set(files.map((file) => resolve(directory, file)));
		if (epoch === this.cacheEpoch) {
			for (const path of new Set([...this.parsedFiles.keys(), ...this.fileReadGenerations.keys()])) {
				const parent = dirname(path);
				const belongsToDirectory =
					parent === directoryPath || (dirname(parent) === directoryPath && basename(path) === "task.md");
				if (belongsToDirectory && !livePaths.has(path)) {
					this.parsedFiles.delete(path);
					this.fileReadGenerations.delete(path);
				}
			}
		}

		const tasks = new Array<Task | undefined>(files.length);
		let nextIndex = 0;
		const worker = async () => {
			while (nextIndex < files.length) {
				const index = nextIndex++;
				const file = files[index];
				if (!file) continue;
				const filepath = join(directory, file);
				let parsed: Task;
				try {
					parsed = await this.readParsedFile(filepath, epoch);
				} catch (error) {
					if (!(error instanceof TaskFileParseError)) throw error;
					const warningPath = resolve(filepath);
					if (!this.warnedParseFiles.has(warningPath)) {
						this.warnedParseFiles.add(warningPath);
						warnUnparseableTaskFile(filepath, error);
					}
					continue;
				}
				const containerName = basename(file) === "task.md" ? dirname(file) : null;
				if (containerName !== null) {
					if (!isValidTaskId(containerName.toUpperCase()) || !taskIdsEqual(parsed.id, containerName)) continue;
				}
				tasks[index] = { ...parsed, filePath: filepath };
			}
		};
		await Promise.all(Array.from({ length: Math.min(TASK_FILE_READ_CONCURRENCY, files.length) }, worker));
		return tasks.filter((task): task is Task => task !== undefined);
	}

	async listFiles(directory: string): Promise<string[]> {
		let entries: Dirent[];
		try {
			entries = await readdir(directory, { withFileTypes: true });
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
			throw error;
		}

		const candidates = await Promise.all(
			entries.map(async (entry) => {
				if (!entry.isDirectory()) return null;
				if (!isValidTaskId(entry.name.toUpperCase())) return null;
				try {
					await access(join(directory, entry.name, "task.md"));
					return join(entry.name, "task.md");
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
					throw error;
				}
			}),
		);
		return candidates.filter((candidate): candidate is string => candidate !== null).sort();
	}
}
