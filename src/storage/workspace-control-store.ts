import { mkdir, readdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { WorkspaceRequestMarker } from "../model/session/workspace-request.ts";

export interface ModeDeletionJournal {
	version: 2;
	operationId: string;
	source: string;
	destination?: string;
	phase: "prepared" | "histories" | "view" | "configuration";
	tasks: string[];
}

const SAFE_MARKER_ID = /^[A-Za-z0-9._-]+$/;
const JOURNAL_PHASES = ["prepared", "histories", "view", "configuration"] as const;
const journalLocks = new Map<string, Promise<void>>();

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function validateJournal(value: unknown): ModeDeletionJournal {
	if (
		!isRecord(value) ||
		value.version !== 2 ||
		typeof value.operationId !== "string" ||
		!value.operationId.trim() ||
		typeof value.source !== "string" ||
		!value.source.trim() ||
		(value.destination !== undefined &&
			(typeof value.destination !== "string" || !value.destination.trim() || value.destination === value.source)) ||
		!Array.isArray(value.tasks) ||
		!value.tasks.every((taskId) => typeof taskId === "string" && taskId.trim()) ||
		!JOURNAL_PHASES.includes(value.phase as (typeof JOURNAL_PHASES)[number])
	)
		throw new Error("Invalid mode-deletion journal; preserve it and inspect runtime state before recovery");
	return {
		version: 2,
		operationId: value.operationId,
		source: value.source,
		...(typeof value.destination === "string" ? { destination: value.destination } : {}),
		phase: value.phase as ModeDeletionJournal["phase"],
		tasks: value.tasks as string[],
	};
}

function parseWorkspaceRequest(value: unknown): WorkspaceRequestMarker | undefined {
	if (!isRecord(value) || typeof value.taskId !== "string" || value.taskId.length === 0) return undefined;
	if (typeof value.sessionId !== "string" || !SAFE_MARKER_ID.test(value.sessionId)) return undefined;
	if (typeof value.pid !== "number" || !Number.isInteger(value.pid) || value.pid <= 0) return undefined;
	const handoff = value.handoff;
	if (handoff !== undefined) {
		if (typeof value.createdAt !== "string" || !value.createdAt || !isRecord(handoff)) return undefined;
		if (typeof handoff.modeId !== "string" || !handoff.modeId) return undefined;
		if (handoff.priorActiveSessionId !== undefined && typeof handoff.priorActiveSessionId !== "string")
			return undefined;
		const predecessor = handoff.predecessor;
		if (predecessor !== undefined) {
			if (!isRecord(predecessor)) return undefined;
			if (
				["id", "createdAt", "tmuxName"].some((key) => typeof predecessor[key] !== "string" || !predecessor[key]) ||
				predecessor.id === value.sessionId
			)
				return undefined;
		}
	}
	return {
		taskId: value.taskId,
		sessionId: value.sessionId,
		pid: value.pid,
		...(handoff
			? {
					handoff: {
						modeId: handoff.modeId as string,
						...(handoff.priorActiveSessionId !== undefined
							? { priorActiveSessionId: handoff.priorActiveSessionId as string }
							: {}),
						...(isRecord(handoff.predecessor)
							? {
									predecessor: {
										id: handoff.predecessor.id as string,
										createdAt: handoff.predecessor.createdAt as string,
										tmuxName: handoff.predecessor.tmuxName as string,
									},
								}
							: {}),
					},
					createdAt: value.createdAt as string,
				}
			: {}),
	};
}

async function writeAtomic(path: string, content: string, temporary: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	try {
		await writeFile(temporary, content, "utf8");
		await rename(temporary, path);
	} finally {
		await rm(temporary, { force: true });
	}
}

/** Storage ownership of the established project-local mode deletion control file. */
export class ModeDeletionJournalStore {
	readonly directory: string;
	readonly path: string;

	constructor(projectRoot: string) {
		this.directory = join(projectRoot, ".agentic-workspace", "agent-workspace");
		this.path = join(this.directory, "mode-deletion.json");
	}

	async withLock<T>(operation: () => Promise<T>): Promise<T> {
		const previous = journalLocks.get(this.path) ?? Promise.resolve();
		let release!: () => void;
		const current = new Promise<void>((resolve) => (release = resolve));
		const tail = previous.then(() => current);
		journalLocks.set(this.path, tail);
		await previous;
		try {
			return await operation();
		} finally {
			release();
			if (journalLocks.get(this.path) === tail) journalLocks.delete(this.path);
		}
	}

	async read(): Promise<ModeDeletionJournal | undefined> {
		try {
			return validateJournal(JSON.parse(await readFile(this.path, "utf8")));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
			throw error;
		}
	}

	async write(journal: ModeDeletionJournal): Promise<void> {
		const validated = validateJournal(journal);
		await writeAtomic(this.path, `${JSON.stringify(validated, null, 2)}\n`, `${this.path}.${process.pid}.tmp`);
	}

	async remove(): Promise<void> {
		await rm(this.path, { force: true });
	}
}

/** Recovery of existing request markers. No current production operation produces markers. */
export class WorkspaceRequestStore {
	readonly directory: string;

	constructor(projectRoot: string) {
		this.directory = join(projectRoot, ".agentic-workspace", "agent-requests");
	}

	async delete(sessionId: string): Promise<void> {
		const path = this.path(sessionId);
		if (!path) throw new Error(`Invalid workspace request for session ${sessionId}.`);
		try {
			await unlink(path);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT")
				throw new Error(`Could not remove workspace request at ${path}.`, { cause: error });
		}
	}

	async read(): Promise<WorkspaceRequestMarker[]> {
		let entries: string[];
		try {
			entries = await readdir(this.directory);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
			throw new Error(`Could not list workspace requests at ${this.directory}.`, { cause: error });
		}
		const requests: WorkspaceRequestMarker[] = [];
		for (const entry of entries) {
			if (!entry.endsWith(".json")) continue;
			const path = join(this.directory, entry);
			try {
				const request = parseWorkspaceRequest(JSON.parse(await readFile(path, "utf8")));
				if (!request || request.sessionId !== entry.slice(0, -".json".length))
					throw new Error("Invalid workspace request marker; preserve it for explicit recovery.");
				requests.push(request);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
				throw new Error(`Could not read workspace request at ${path}.`, { cause: error });
			}
		}
		return requests;
	}

	private path(sessionId: string): string | undefined {
		return SAFE_MARKER_ID.test(sessionId) ? join(this.directory, `${sessionId}.json`) : undefined;
	}
}
