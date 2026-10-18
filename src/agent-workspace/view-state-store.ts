import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, mkdir, realpath, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { LockOwner } from "../file-system/lock-owner.ts";
import { type ProjectStateRootOptions, resolveProjectStateRoot, writeFileAtomic } from "./session-store.ts";
import { type StateStoreWatcher, startStateStoreWatcher } from "./state-store-watcher.ts";

const VIEW_STATE_FILE = "view-state.json";
/** Reclaim abandoned view-state locks without holding a lock during rendering. */
const LOCK_STALE_MS = 2_000;
const LOCK_RETRIES = 200;
const LOCK_RETRY_DELAY_MS = 25;

export type ViewStateEnvelope<T> = {
	readonly rev: number;
	readonly origin: string;
	readonly state: T;
};

export type ViewStateListener<T> = (envelope: ViewStateEnvelope<T>) => void;

export interface ViewStateStore<T extends object> {
	/** Last known state. Always current; never blocks, never spawns. */
	readonly current: T;
	/** Stable id of this process, stamped into every envelope it writes. */
	readonly origin: string;

	/** Locked read-modify-write. No-ops when the patch produces no change. */
	update(patch: (state: T) => T): Promise<void>;

	/** In-process subscribers. Returns an unsubscribe function. */
	subscribe(listener: ViewStateListener<T>): () => void;

	/** Force a re-read from disk. This is the 2s-tick safety net. */
	recheck(): Promise<void>;

	/** Stop the watcher and drop subscribers. Idempotent. */
	close(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/** Returns undefined for anything unreadable or malformed — the caller degrades, never throws. */
function parseEnvelope<T extends object>(raw: string): ViewStateEnvelope<T> | undefined {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isRecord(parsed) || !isRecord(parsed.state)) return undefined;
		if (typeof parsed.rev !== "number" || !Number.isFinite(parsed.rev)) return undefined;
		if (typeof parsed.origin !== "string") return undefined;
		return { rev: parsed.rev, origin: parsed.origin, state: parsed.state as T };
	} catch {
		return undefined;
	}
}

async function writableDirectory(path: string): Promise<boolean> {
	// An unreadable/unsearchable directory is inconclusive, not a read-only fallback.
	await access(path, constants.R_OK | constants.X_OK);
	try {
		await access(path, constants.W_OK);
		return true;
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === "EACCES" || code === "EROFS") return false;
		throw error;
	}
}

async function canonicalViewLock(projectRoot: string): Promise<string | undefined> {
	const canonical = join(projectRoot, "agentic-workspace", ".locks", "workspace-view-state");
	let parent = dirname(canonical);
	for (;;) {
		let exists = false;
		try {
			const metadata = await lstat(parent);
			exists = true;
			const entry = metadata.isSymbolicLink() ? await stat(parent) : metadata;
			if (!entry.isDirectory()) throw new Error(`View-state lock parent is not a directory: ${parent}`);
		} catch (error) {
			if (exists || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
		if (exists) {
			if (await writableDirectory(parent)) return canonical;
			break;
		}
		parent = dirname(parent);
	}
	if (await writableDirectory(projectRoot))
		throw new Error(
			`Cannot use canonical workspace view-state lock at ${canonical}; refusing a different lock namespace.`,
		);
	try {
		await lstat(canonical);
		throw new Error(`Cannot bypass an existing canonical workspace view-state lock at ${canonical}.`);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	return undefined;
}

class ViewStateStoreImpl<T extends object> implements ViewStateStore<T> {
	readonly origin: string = randomUUID();
	private readonly lock = new LockOwner();
	private readonly listeners = new Set<ViewStateListener<T>>();
	private state: T;
	private rev = 0;
	private path = "";
	private externalStateRoot?: string;
	private stateWatcher?: StateStoreWatcher;
	private closed = false;

	constructor(
		private readonly rootDir: string,
		private readonly createDefault: () => T,
		private readonly options: ProjectStateRootOptions,
	) {
		this.state = createDefault();
	}

	get current(): T {
		return this.state;
	}

	async open(): Promise<void> {
		const stateRoot = await resolveProjectStateRoot(this.rootDir, this.options);
		this.path = join(stateRoot, VIEW_STATE_FILE);
		// The directory has to exist before fs.watch can attach to it.
		await mkdir(stateRoot, { recursive: true });
		const physicalStateRoot = await realpath(stateRoot);
		const physicalProjectRoot = await realpath(this.rootDir);
		this.externalStateRoot =
			physicalStateRoot === join(physicalProjectRoot, ".agentic-workspace") ? undefined : physicalStateRoot;
		await this.seed();
		this.stateWatcher = startStateStoreWatcher(
			this.path,
			() => void this.recheck(),
			() => this.closed,
		);
	}

	subscribe(listener: ViewStateListener<T>): () => void {
		if (this.closed) return () => undefined;
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	/**
	 * The whole read-modify-write runs inside the lock so two panes cannot both read rev N and
	 * both write rev N+1. The critical section is one small file write, so it is microseconds.
	 */
	async update(patch: (state: T) => T): Promise<void> {
		await this.withLock(async () => {
			const base = (await this.readEnvelope()) ?? {
				rev: 0,
				origin: this.origin,
				state: this.createDefault(),
			};
			const next = patch(base.state);
			if (JSON.stringify(next) === JSON.stringify(base.state)) return;
			const envelope: ViewStateEnvelope<T> = { rev: base.rev + 1, origin: this.origin, state: next };
			await this.writeEnvelope(envelope);
			// Our own write still reaches our own subscribers: filtering self-echo is the caller's job.
			this.apply(envelope);
		});
	}

	async recheck(): Promise<void> {
		if (this.closed) return;
		const envelope = await this.readEnvelope();
		if (envelope) this.apply(envelope);
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.stateWatcher?.close();
		this.stateWatcher = undefined;
		this.listeners.clear();
	}

	/** Creates the file with the default state if no one else has written it yet. */
	private async seed(): Promise<void> {
		await this.withLock(async () => {
			const disk = await this.readEnvelope();
			if (disk) {
				this.state = disk.state;
				this.rev = disk.rev;
				return;
			}
			await this.writeEnvelope({ rev: 0, origin: this.origin, state: this.createDefault() });
		});
	}

	/** Monotonic guard: an envelope we have already applied is dropped, whoever wrote it. */
	private apply(envelope: ViewStateEnvelope<T>): void {
		if (envelope.rev <= this.rev) return;
		this.rev = envelope.rev;
		this.state = envelope.state;
		for (const listener of [...this.listeners]) {
			try {
				listener(envelope);
			} catch {
				// One bad subscriber must not stop the others, nor the watcher.
			}
		}
	}

	private async readEnvelope(): Promise<ViewStateEnvelope<T> | undefined> {
		try {
			return parseEnvelope<T>(await Bun.file(this.path).text());
		} catch {
			// Missing, unreadable, or torn: the caller falls back to what it already knows.
			return undefined;
		}
	}

	private async writeEnvelope(envelope: ViewStateEnvelope<T>): Promise<void> {
		await writeFileAtomic(this.path, `${JSON.stringify(envelope, null, "\t")}\n`);
	}

	private async withLock<R>(operation: () => Promise<R>): Promise<R> {
		const settings = { staleMs: LOCK_STALE_MS, retries: LOCK_RETRIES, retryDelayMs: LOCK_RETRY_DELAY_MS };
		const toError = (error: unknown) =>
			new Error(`Could not lock workspace view state: ${error instanceof Error ? error.message : String(error)}`);
		if (this.externalStateRoot) {
			return await this.lock.withTarget(
				this.externalStateRoot,
				join(this.externalStateRoot, "workspace-view-state.lock"),
				settings,
				toError,
				operation,
			);
		}
		const canonical = await canonicalViewLock(this.rootDir);
		if (!canonical) return await operation();
		return await this.lock.withTarget(this.rootDir, canonical, settings, toError, operation);
	}
}

export async function openViewStateStore<T extends object>(
	rootDir: string,
	createDefault: () => T,
	options: ProjectStateRootOptions = {},
): Promise<ViewStateStore<T>> {
	const store = new ViewStateStoreImpl(resolve(rootDir), createDefault, options);
	await store.open();
	return store;
}
