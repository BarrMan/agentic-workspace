import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentConfiguration, ModeCatalog } from "./types.ts";

export interface ModeLifecycleHistory {
	sessions: Array<{ id: string }>;
	activeSessionId?: string;
}

export interface ModeLifecycleSessions {
	readMode(taskId: string, modeId: string): Promise<ModeLifecycleHistory>;
	mutate<T>(
		taskId: string,
		fn: (state: { modes?: Record<string, ModeLifecycleHistory>; [key: string]: unknown }) => Promise<T>,
	): Promise<T>;
}

export interface ModeLifecycleViewState {
	update(patch: (state: Record<string, unknown>) => Record<string, unknown>): Promise<void>;
}

export interface ModeLifecycleOptions {
	journalDirectory: string;
	configuration: {
		read(): Promise<AgentConfiguration>;
		update(updater: (configuration: AgentConfiguration) => AgentConfiguration): Promise<AgentConfiguration>;
	};
	sessions: ModeLifecycleSessions;
	viewState: ModeLifecycleViewState;
	listTaskIds(): Promise<string[]>;
}

interface DeleteJournal {
	version: 2;
	operationId: string;
	source: string;
	destination?: string;
	phase: "prepared" | "histories" | "view" | "configuration";
	tasks: string[];
}

const gates = new Map<string, Promise<void>>();

/** Serialize mode launch/configuration writers against deletion and its recovery. */
export async function withModeLifecycleGate<T>(key: string, operation: () => Promise<T>): Promise<T> {
	const previous = gates.get(key) ?? Promise.resolve();
	let release!: () => void;
	const current = new Promise<void>((resolve) => (release = resolve));
	const tail = previous.then(() => current);
	gates.set(key, tail);
	await previous;
	try {
		return await operation();
	} finally {
		release();
		if (gates.get(key) === tail) gates.delete(key);
	}
}

function assertCatalog(catalog: ModeCatalog, source: string, destination?: string): void {
	if (!catalog.profiles[source]) throw new Error(`Mode not found: ${source}`);
	if (catalog.order.length < 2 || Object.keys(catalog.profiles).length < 2)
		throw new Error("Cannot delete the last mode");
	if (destination !== undefined && (!catalog.profiles[destination] || destination === source))
		throw new Error(`Invalid mode deletion destination: ${destination}`);
}

function validateJournal(value: unknown): DeleteJournal {
	if (typeof value === "object" && value !== null && "version" in value && value.version === 1)
		throw new Error(
			"Pending moving mode-deletion journal requires an explicit recovery decision; preserve it unchanged.",
		);
	if (
		typeof value !== "object" ||
		value === null ||
		(value as DeleteJournal).version !== 2 ||
		typeof (value as DeleteJournal).operationId !== "string" ||
		typeof (value as DeleteJournal).source !== "string" ||
		((value as DeleteJournal).destination !== undefined && typeof (value as DeleteJournal).destination !== "string") ||
		!Array.isArray((value as DeleteJournal).tasks) ||
		!(value as DeleteJournal).tasks.every((taskId) => typeof taskId === "string") ||
		!["prepared", "histories", "view", "configuration"].includes((value as DeleteJournal).phase)
	)
		throw new Error("Invalid mode-deletion journal; preserve it and inspect runtime state before recovery");
	return value as DeleteJournal;
}

async function readJournal(path: string): Promise<DeleteJournal | undefined> {
	try {
		return validateJournal(JSON.parse(await readFile(path, "utf8")));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
}

async function writeJournal(path: string, journal: DeleteJournal): Promise<void> {
	const temporary = `${path}.${process.pid}.tmp`;
	try {
		await writeFile(temporary, `${JSON.stringify(journal, null, 2)}\n`, "utf8");
		await rename(temporary, path);
	} finally {
		await rm(temporary, { force: true });
	}
}

/**
 * Journaled project mode deletion. Call recover() on startup before admitting launches or
 * configuration edits. The injected configuration update must use the repository's normal
 * configuration lock; session mutations use SessionStore's task lock.
 */
export class ModeLifecycleService {
	constructor(private readonly options: ModeLifecycleOptions) {}

	async withGate<T>(operation: () => Promise<T>): Promise<T> {
		return await withModeLifecycleGate(this.options.journalDirectory, operation);
	}

	async deleteMode(source: string, destination?: string): Promise<void> {
		await this.withGate(async () => {
			const journalPath = this.journalPath();
			const pending = await readJournal(journalPath);
			if (pending) throw new Error("A mode deletion is pending; run recovery before starting another");
			const catalog = (await this.options.configuration.read()).modes;
			if (!catalog) throw new Error("Mode catalog is not initialized");
			assertCatalog(catalog, source, destination);
			const tasks = [...new Set(await this.options.listTaskIds())].sort();
			let hasSourceSessions = false;
			// Validate every snapshot before creating the journal or mutating any durable state.
			for (const taskId of tasks) {
				const state = await this.options.sessions.readMode(taskId, source);
				const target = destination ? await this.options.sessions.readMode(taskId, destination) : undefined;
				if (
					!Array.isArray(state.sessions) ||
					state.sessions.some((session) => !session || typeof session.id !== "string")
				)
					throw new Error(`Invalid ${source} session history for task ${taskId}`);
				if (
					state.activeSessionId !== undefined &&
					!state.sessions.some((session) => session.id === state.activeSessionId)
				)
					throw new Error(`Invalid active session pointer for ${source} on task ${taskId}`);
				if (
					target &&
					(!Array.isArray(target.sessions) ||
						target.sessions.some((session) => !session || typeof session.id !== "string") ||
						(target.activeSessionId !== undefined &&
							!target.sessions.some((session) => session.id === target.activeSessionId)))
				)
					throw new Error(`Invalid ${destination} session history for task ${taskId}`);
				hasSourceSessions ||= state.sessions.length > 0;
			}
			if (hasSourceSessions)
				throw new Error(
					`Mode ${source} has sessions; sessions cannot change modes. Delete its sessions before deleting the mode.`,
				);
			const journal: DeleteJournal = {
				version: 2,
				operationId: `${Date.now()}-${process.pid}`,
				source,
				...(destination ? { destination } : {}),
				phase: "prepared",
				tasks,
			};
			await mkdir(this.options.journalDirectory, { recursive: true });
			await writeJournal(journalPath, journal);
			await this.finish(journalPath, journal);
		});
	}

	async recover(): Promise<void> {
		await this.withGate(async () => {
			const journalPath = this.journalPath();
			const journal = await readJournal(journalPath);
			if (journal) await this.finish(journalPath, journal);
		});
	}

	private journalPath(): string {
		return join(this.options.journalDirectory, "mode-deletion.json");
	}

	private async finish(path: string, journal: DeleteJournal): Promise<void> {
		if (journal.phase === "prepared") {
			for (const taskId of journal.tasks) {
				await this.options.sessions.mutate(taskId, async (state) => {
					const modes = state.modes ?? {};
					const sourceHistory = modes[journal.source];
					if (!sourceHistory) return;
					if (sourceHistory.sessions.length)
						throw new Error(`Mode ${journal.source} has sessions; deletion stopped without moving them.`);
					delete modes[journal.source];
					state.modes = modes;
				});
			}
			journal.phase = "histories";
			await writeJournal(path, journal);
		}
		if (journal.phase === "histories") {
			await this.options.viewState.update((state) => {
				const selected = { ...((state.selectedModeByTask as Record<string, unknown> | undefined) ?? {}) };
				for (const taskId of journal.tasks)
					if (selected[taskId] === journal.source) {
						if (journal.destination) selected[taskId] = journal.destination;
						else delete selected[taskId];
					}
				return { ...state, selectedModeByTask: selected };
			});
			journal.phase = "view";
			await writeJournal(path, journal);
		}
		if (journal.phase === "view") {
			await this.options.configuration.update((configuration) => {
				const catalog = configuration.modes;
				if (!catalog) throw new Error("Mode catalog disappeared during deletion recovery");
				if (!catalog.profiles[journal.source]) return configuration;
				assertCatalog(catalog, journal.source, journal.destination);
				const profiles = { ...catalog.profiles };
				delete profiles[journal.source];
				const order = catalog.order.filter((id) => id !== journal.source);
				const fallback = journal.destination ?? order[0];
				if (!fallback) throw new Error("Mode deletion left no fallback mode");
				return {
					...configuration,
					modes: {
						...catalog,
						profiles,
						order,
						defaultModeId: catalog.defaultModeId === journal.source ? fallback : catalog.defaultModeId,
					},
				};
			});
			journal.phase = "configuration";
			await writeJournal(path, journal);
		}
		await rm(path, { force: true });
	}
}
