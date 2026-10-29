import type { Dirent } from "node:fs";
import { access, readdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import type { Task } from "../model/types.ts";
import { parseTask } from "./markdown/parser.ts";
import { TASK_RECORD_FILENAME } from "./task-layout.ts";

export const TASK_FILE_READ_CONCURRENCY = 32;

type ParsedTaskFile = { content: string; task: Task };
/**
 * Reads task files with a bounded, content-addressed parse cache. It deliberately owns only
 * task discovery and parsing; task mutations remain coordinated by FileSystem locks.
 */
export class TaskRepository {
	readonly parsedFiles = new Map<string, ParsedTaskFile>();
	readonly fileReadGenerations = new Map<string, number>();
	private cacheEpoch = 0;
	private fileReadGeneration = 0;
	private activeReads = 0;
	private readonly pendingReads: Array<() => void> = [];

	get epoch(): number {
		return this.cacheEpoch;
	}

	invalidate(): void {
		this.cacheEpoch++;
		this.parsedFiles.clear();
		this.fileReadGenerations.clear();
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
		const task = parseTask(content);
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
					parent === directoryPath || (dirname(parent) === directoryPath && basename(path) === TASK_RECORD_FILENAME);
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
				try {
					const parsed = await this.readParsedFile(filepath, epoch);
					tasks[index] = { ...parsed, filePath: filepath };
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
				}
			}
		};
		await Promise.all(Array.from({ length: Math.min(TASK_FILE_READ_CONCURRENCY, files.length) }, worker));
		return tasks.filter((task): task is Task => task !== undefined);
	}

	async listFiles(directory: string): Promise<string[]> {
		const entries: Dirent[] = await readdir(directory, { withFileTypes: true });

		const candidates = await Promise.all(
			entries.map(async (entry) => {
				if (!entry.isDirectory()) return null;
				try {
					await access(join(directory, entry.name, TASK_RECORD_FILENAME));
					return join(entry.name, TASK_RECORD_FILENAME);
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
					throw error;
				}
			}),
		);
		return candidates.filter((candidate): candidate is string => candidate !== null).sort();
	}
}
