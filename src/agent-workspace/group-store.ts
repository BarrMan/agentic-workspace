import { type FSWatcher, watch } from "node:fs";
import { mkdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { LockOwner } from "../file-system/lock-owner.ts";
import { writeFileAtomic } from "./session-store.ts";

const GROUPS_FILE = "groups.json";
/** Bursts of renames land within one tick; collapse them into a single read + notify. */
const WATCH_COALESCE_MS = 10;
/** Reclaim abandoned group locks without holding a lock during rendering. */
const LOCK_STALE_MS = 2_000;
const LOCK_RETRIES = 200;
const LOCK_RETRY_DELAY_MS = 25;

export type TaskGroup = {
	readonly id: string;
	readonly name: string;
	readonly parentId: string | null; // null = root-level group
	readonly order: number; // sibling ordering
	readonly collapsed: boolean; // persisted expand/collapse state
};

export type GroupMembership = Readonly<Record<string, string>>; // taskId -> groupId

export type GroupState = {
	readonly groups: readonly TaskGroup[];
	readonly membership: GroupMembership;
};

export function emptyGroupState(): GroupState {
	return { groups: [], membership: {} };
}

export type GroupStore = {
	readonly current: GroupState;
	/** Locked read-modify-write, atomic write, no-op when unchanged. */
	update(patch: (state: GroupState) => GroupState): Promise<void>;
	subscribe(listener: (state: GroupState) => void): () => void;
	close(): void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function parseGroup(value: unknown): TaskGroup | undefined {
	if (!isRecord(value)) return undefined;
	const { id, name, parentId, order, collapsed } = value;
	if (typeof id !== "string" || typeof name !== "string") return undefined;
	if (parentId !== null && typeof parentId !== "string") return undefined;
	if (typeof order !== "number" || !Number.isFinite(order)) return undefined;
	if (typeof collapsed !== "boolean") return undefined;
	return { id, name, parentId, order, collapsed };
}

function parseGroups(value: unknown): readonly TaskGroup[] {
	if (!Array.isArray(value)) return [];
	const groups: TaskGroup[] = [];
	for (const entry of value) {
		const group = parseGroup(entry);
		if (group) groups.push(group);
	}
	return groups;
}

function parseMembership(value: unknown): GroupMembership {
	if (!isRecord(value)) return {};
	const membership: Record<string, string> = {};
	for (const [taskId, groupId] of Object.entries(value)) {
		if (typeof groupId === "string") membership[taskId] = groupId;
	}
	return membership;
}

/** Returns undefined for anything unreadable or malformed — the caller degrades, never throws. */
function parseState(raw: string): GroupState | undefined {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isRecord(parsed)) return undefined;
		return { groups: parseGroups(parsed.groups), membership: parseMembership(parsed.membership) };
	} catch {
		return undefined;
	}
}

class GroupStoreImpl implements GroupStore {
	private readonly lock = new LockOwner();
	private readonly listeners = new Set<(state: GroupState) => void>();
	private state: GroupState = emptyGroupState();
	private path = "";
	private watcher: FSWatcher | undefined;
	private coalesce: ReturnType<typeof setTimeout> | undefined;
	private closed = false;
	/** Serialises recheck against update so a stale watcher read cannot regress `current`. */
	private tail: Promise<void> = Promise.resolve();

	constructor(
		private readonly rootDir: string,
		private readonly backlogDir: string,
	) {}

	get current(): GroupState {
		return this.state;
	}

	async open(): Promise<void> {
		this.path = join(this.backlogDir, GROUPS_FILE);
		// The directory has to exist before fs.watch can attach to it.
		await mkdir(this.backlogDir, { recursive: true });
		await this.seed();
		this.startWatching();
	}

	subscribe(listener: (state: GroupState) => void): () => void {
		if (this.closed) return () => undefined;
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	/**
	 * The whole read-modify-write runs inside the lock so two panes cannot both read the same
	 * state and lose each other's patch. The critical section is one small file write.
	 */
	async update(patch: (state: GroupState) => GroupState): Promise<void> {
		await this.serialize(async () => {
			await this.withLock(async () => {
				const base = (await this.readState()) ?? emptyGroupState();
				const next = patch(base);
				if (JSON.stringify(next) === JSON.stringify(base)) return;
				await this.writeState(next);
				// Our own write still reaches our own subscribers: filtering self-echo is the caller's job.
				this.apply(next);
			});
		});
	}

	async recheck(): Promise<void> {
		if (this.closed) return;
		await this.serialize(async () => {
			const next = await this.readState();
			if (next) this.apply(next);
		});
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		if (this.coalesce) {
			clearTimeout(this.coalesce);
			this.coalesce = undefined;
		}
		try {
			this.watcher?.close();
		} catch {
			// A watcher that refuses to close must not break teardown.
		}
		this.watcher = undefined;
		this.listeners.clear();
	}

	/** Creates the file with the default state if no one else has written it yet. */
	private async seed(): Promise<void> {
		const existing = await this.readState();
		if (existing) {
			this.state = existing;
			return;
		}
		await this.withLock(async () => {
			const disk = await this.readState();
			if (disk) {
				this.state = disk;
				return;
			}
			await this.writeState(emptyGroupState());
		});
	}

	/** Applies a state only when it differs from what we already know, then notifies. */
	private apply(next: GroupState): void {
		if (JSON.stringify(next) === JSON.stringify(this.state)) return;
		this.state = next;
		for (const listener of [...this.listeners]) {
			try {
				listener(next);
			} catch {
				// One bad subscriber must not stop the others, nor the watcher.
			}
		}
	}

	private async readState(): Promise<GroupState | undefined> {
		try {
			return parseState(await Bun.file(this.path).text());
		} catch {
			// Missing, unreadable, or torn: the caller falls back to what it already knows.
			return undefined;
		}
	}

	private async writeState(state: GroupState): Promise<void> {
		const payload = { groups: state.groups, membership: state.membership };
		await writeFileAtomic(this.path, `${JSON.stringify(payload, null, "\t")}\n`);
	}

	/**
	 * Watch the DIRECTORY, not the file: writes are rename-based, so a file watcher would be
	 * replaced out from under itself and go deaf after the first write.
	 */
	private startWatching(): void {
		const name = basename(this.path);
		try {
			const watcher = watch(dirname(this.path), (_event, filename) => {
				if (filename && filename.toString() !== name) return;
				this.scheduleRefresh();
			});
			// A watcher error is a degradation, not a failure: recheck() still recovers.
			watcher.on("error", () => undefined);
			watcher.unref?.();
			this.watcher = watcher;
		} catch {
			this.watcher = undefined;
		}
	}

	private scheduleRefresh(): void {
		if (this.closed || this.coalesce) return;
		this.coalesce = setTimeout(() => {
			this.coalesce = undefined;
			void this.recheck();
		}, WATCH_COALESCE_MS);
	}

	private serialize<R>(operation: () => Promise<R>): Promise<R> {
		const run = this.tail.then(operation, operation);
		this.tail = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	}

	private async withLock<R>(operation: () => Promise<R>): Promise<R> {
		return await this.lock.withTarget(
			this.rootDir,
			join(this.backlogDir, ".locks", "workspace-groups"),
			{ staleMs: LOCK_STALE_MS, retries: LOCK_RETRIES, retryDelayMs: LOCK_RETRY_DELAY_MS },
			(error) =>
				new Error(`Could not lock workspace groups: ${error instanceof Error ? error.message : String(error)}`),
			operation,
		);
	}
}

export async function openGroupStore(rootDir: string, backlogDir: string): Promise<GroupStore> {
	const store = new GroupStoreImpl(rootDir, backlogDir);
	await store.open();
	return store;
}
