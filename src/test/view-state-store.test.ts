import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
	openViewStateStore,
	type ViewStateEnvelope,
	type ViewStateListener,
} from "../agent-workspace/view-state-store.ts";
import { safeCleanup, waitUntil } from "./test-utils.ts";

/**
 * The payload shape below is intentionally a plain serialisable record rather than
 * `SharedWorkspaceState` itself: the store is generic over `T extends object`, and the
 * test should not depend on the workspace payload's optional fields.
 */
type TestState = {
	readonly label: string;
	readonly counter: number;
	readonly fields: Readonly<Record<string, number>>;
	/** Only used by the atomic-write test to make the payload large. */
	readonly blob?: string;
};

function defaultState(): TestState {
	return { label: "initial", counter: 0, fields: {} };
}

type Store = Awaited<ReturnType<typeof openViewStateStore<TestState>>>;

/** A second store instance on the same rootDir stands in for another pane process. */
type Recorder = {
	readonly store: Store;
	readonly envelopes: ViewStateEnvelope<TestState>[];
	unsubscribe: () => void;
};

const roots: string[] = [];
const stores: Store[] = [];
let previousBacklogCwd: string | undefined;

async function makeRoot(prefix: string): Promise<string> {
	// A fresh temp dir per test: the store derives its on-disk location from rootDir, so
	// this keeps every test isolated without the test having to know the path formula.
	const root = await mkdtemp(join(tmpdir(), `backlog-view-state-${prefix}-`));
	roots.push(root);
	return root;
}

/**
 * Locates the on-disk view-state file without duplicating the state-root path formula:
 * the contract forbids a second copy of it. The file always lives under the store's own
 * `rootDir`, so a recursive listing is enough. Uses `fs.readdir` rather than a glob
 * because globstar does not descend into the dot-directories the state root actually uses.
 */
async function findViewStateFile(root: string): Promise<string> {
	const entries = await readdir(root, { recursive: true });
	const matches = entries.filter((entry) => basename(entry) === "view-state.json");
	if (matches.length !== 1) {
		throw new Error(`Expected exactly one view-state.json under ${root}, found ${matches.length}: ${matches}`);
	}
	return join(root, matches[0] as string);
}

async function open(root: string): Promise<Store> {
	const store = await openViewStateStore<TestState>(root, defaultState);
	stores.push(store);
	return store;
}

function record(store: Store): Recorder {
	const envelopes: ViewStateEnvelope<TestState>[] = [];
	const listener: ViewStateListener<TestState> = (envelope) => {
		envelopes.push(envelope);
	};
	const unsubscribe = store.subscribe(listener);
	return { store, envelopes, unsubscribe };
}

/** Drains the macrotask queue so watcher-driven work that is already queued can settle. */
async function drainEventLoop(): Promise<void> {
	for (let index = 0; index < 5; index += 1) await new Promise<void>((resolve) => setImmediate(resolve));
}

/** Waits (bounded) for a notification that the watcher is expected to deliver. */
async function expectNotification(recorder: Recorder, count: number): Promise<void> {
	await waitUntil(() => recorder.envelopes.length >= count, `view-state notification #${count}`);
}

describe("openViewStateStore", () => {
	beforeEach(() => {
		// The store resolves its state root from BACKLOG_CWD when set; pin it to the test's
		// own root so a stray value in the developer's shell cannot redirect the writes.
		previousBacklogCwd = process.env.BACKLOG_CWD;
		delete process.env.BACKLOG_CWD;
	});

	afterEach(async () => {
		if (previousBacklogCwd === undefined) delete process.env.BACKLOG_CWD;
		else process.env.BACKLOG_CWD = previousBacklogCwd;
		for (const store of stores.splice(0)) {
			try {
				store.close();
			} catch {
				// close() is documented as idempotent; a throw here is a real failure and is
				// surfaced by the individual test instead of masking it during cleanup.
			}
		}
		await Promise.all(roots.splice(0).map(async (root) => await safeCleanup(root)));
	});

	it("1. exposes the state written by this store through current", async () => {
		const root = await makeRoot("current");
		const store = await open(root);

		expect(store.current).toEqual(defaultState());
		expect(typeof store.origin).toBe("string");
		expect(store.origin.length).toBeGreaterThan(0);

		await store.update((state) => ({ ...state, label: "written", counter: 7 }));

		expect(store.current).toEqual({ label: "written", counter: 7, fields: {} });
	});

	it("2. never exposes a partially written file to a concurrent reader", async () => {
		const root = await makeRoot("atomic");
		const writer = await open(root);
		const reader = await open(root);

		// Big enough that a non-atomic write would be observable as a truncated read.
		const blob = "x".repeat(600_000);
		const knownLabels = new Set(["initial"]);
		for (let index = 0; index < 25; index += 1) knownLabels.add(`v${index}`);

		// Create the file first so the reader loop always has something to read.
		await writer.update((state) => ({ ...state, label: "v0", counter: 1, blob }));
		const statePath = await findViewStateFile(root);

		const failures: string[] = [];
		let readCount = 0;
		let stopReading = false;
		const readLoop = (async () => {
			while (!stopReading) {
				// Raw file read: an observer of the rename-based write must never see a
				// truncated or half-written payload.
				try {
					// The file holds a ViewStateEnvelope; the payload under test is `state`.
					const envelope = JSON.parse(await readFile(statePath, "utf8")) as {
						readonly rev: number;
						readonly state: TestState;
					};
					const parsed = envelope.state;
					readCount += 1;
					if (typeof parsed?.blob !== "string" || parsed.blob.length !== blob.length) {
						failures.push(`truncated read at label ${String(parsed?.label)}`);
					} else if (!knownLabels.has(parsed.label)) {
						failures.push(`unknown label observed: ${parsed.label}`);
					}
				} catch (error) {
					failures.push(`parse failure: ${error instanceof Error ? error.message : String(error)}`);
				}
				// In-process observer: the second store must also only ever see whole states.
				await reader.recheck();
				if (!knownLabels.has(reader.current.label)) {
					failures.push(`partial store state observed: ${reader.current.label}`);
				} else if (reader.current.blob !== undefined && reader.current.blob.length !== blob.length) {
					failures.push(`partial store payload observed at ${reader.current.label}`);
				}
				await new Promise<void>((resolve) => setImmediate(resolve));
			}
		})();

		try {
			for (let index = 1; index < 25; index += 1) {
				const label = `v${index}`;
				await writer.update((state) => ({ ...state, label, counter: index + 1, blob }));
			}
		} finally {
			stopReading = true;
			await readLoop;
		}

		expect(failures).toEqual([]);
		expect(readCount).toBeGreaterThan(1);
		expect(writer.current.label).toBe("v24");
		await reader.recheck();
		expect(reader.current.label).toBe("v24");
		expect(reader.current.blob?.length).toBe(blob.length);
	});

	it("3. converges two store instances opened on the same rootDir", async () => {
		const root = await makeRoot("converge");
		const paneA = await open(root);
		const paneB = await open(root);

		expect(paneA.current).toEqual(defaultState());
		expect(paneB.current).toEqual(defaultState());

		await paneA.update((state) => ({ ...state, label: "from-pane-a" }));

		// recheck() is the contract's correctness net; the watcher is only the fast path,
		// so the assertion must not depend on filesystem-watch delivery timing.
		await paneB.recheck();
		expect(paneB.current).toEqual({ label: "from-pane-a", counter: 0, fields: {} });

		await paneB.update((state) => ({ ...state, counter: 3 }));
		await paneA.recheck();
		expect(paneA.current).toEqual({ label: "from-pane-a", counter: 3, fields: {} });
	});

	it("4. does not bump rev or notify subscribers when a patch produces no change", async () => {
		const root = await makeRoot("noop");
		const store = await open(root);
		const recorder = record(store);

		await store.update((state) => ({ ...state, label: "one" }));
		await expectNotification(recorder, 1);
		const firstRev = recorder.envelopes[0]?.rev as number;
		expect(recorder.envelopes[0]?.state.label).toBe("one");

		// Structurally identical patch: nothing on disk should change.
		await store.update((state) => ({ ...state }));
		await store.recheck();
		await drainEventLoop();
		expect(recorder.envelopes.length).toBe(1);

		// rev is only observable through envelopes, so the next real change proves the
		// no-op did not consume a revision.
		await store.update((state) => ({ ...state, counter: 1 }));
		await expectNotification(recorder, 2);
		expect(recorder.envelopes[1]?.rev).toBe(firstRev + 1);
	});

	it("5. bumps rev by exactly one and notifies subscribers once for a real change", async () => {
		const root = await makeRoot("one-bump");
		const store = await open(root);
		const recorder = record(store);

		await store.update((state) => ({ ...state, label: "before" }));
		await expectNotification(recorder, 1);
		const startRev = recorder.envelopes[0]?.rev as number;

		await store.update((state) => ({ ...state, label: "after" }));
		await expectNotification(recorder, 2);
		await drainEventLoop();

		expect(recorder.envelopes.length).toBe(2);
		expect(recorder.envelopes[1]?.rev).toBe(startRev + 1);
		expect(recorder.envelopes[1]?.state.label).toBe("after");
		expect(recorder.envelopes[1]?.origin).toBe(store.origin);
	});

	it("6. keeps rev strictly monotonic across many sequential updates", async () => {
		const root = await makeRoot("monotonic");
		const store = await open(root);
		const recorder = record(store);

		const total = 25;
		for (let index = 1; index <= total; index += 1) {
			await store.update((state) => ({ ...state, counter: index }));
		}
		await expectNotification(recorder, total);
		await drainEventLoop();

		const revisions = recorder.envelopes.map((envelope) => envelope.rev);
		expect(revisions.length).toBe(total);
		for (let index = 1; index < revisions.length; index += 1) {
			expect(revisions[index] as number).toBe((revisions[index - 1] as number) + 1);
		}
		expect(new Set(revisions).size).toBe(total);
		expect(store.current.counter).toBe(total);
	});

	it("7. ignores an envelope whose rev was already applied (replay / stale writer)", async () => {
		const root = await makeRoot("stale");
		const store = await open(root);
		const recorder = record(store);

		await store.update((state) => ({ ...state, label: "real" }));
		await expectNotification(recorder, 1);
		await drainEventLoop();
		const appliedRev = recorder.envelopes[0]?.rev as number;

		// Simulate a replayed envelope from a stale writer landing on disk: same rev the
		// store already applied. It must not produce a second notification.
		const statePath = await findViewStateFile(root);
		await writeFile(
			statePath,
			`${JSON.stringify({ rev: appliedRev, origin: "some-other-pane", state: defaultState() }, null, "\t")}\n`,
			"utf8",
		);

		await store.recheck();
		await drainEventLoop();
		expect(recorder.envelopes.length).toBe(1);

		// An older rev must be ignored too.
		await writeFile(
			statePath,
			`${JSON.stringify({ rev: appliedRev - 1, origin: "some-other-pane", state: defaultState() }, null, "\t")}\n`,
			"utf8",
		);
		await store.recheck();
		await drainEventLoop();
		expect(recorder.envelopes.length).toBe(1);
	});

	it("8. subscribe() returns an unsubscribe function that stops delivery", async () => {
		const root = await makeRoot("unsubscribe");
		const store = await open(root);
		const recorder = record(store);

		expect(typeof recorder.unsubscribe).toBe("function");

		await store.update((state) => ({ ...state, label: "first" }));
		await expectNotification(recorder, 1);

		recorder.unsubscribe();

		await store.update((state) => ({ ...state, label: "second" }));
		await store.recheck();
		await drainEventLoop();

		expect(recorder.envelopes.length).toBe(1);
		// The write itself still happened: only delivery stopped.
		expect(store.current.label).toBe("second");
	});

	it("9. a late subscriber receives subsequent updates and sees an accurate current", async () => {
		const root = await makeRoot("late");
		const store = await open(root);

		await store.update((state) => ({ ...state, label: "before-subscribe", counter: 2 }));
		await store.recheck();

		const recorder = record(store);
		expect(store.current).toEqual({ label: "before-subscribe", counter: 2, fields: {} });

		await store.update((state) => ({ ...state, label: "after-subscribe" }));
		await expectNotification(recorder, 1);

		expect(recorder.envelopes[0]?.state.label).toBe("after-subscribe");
		expect(store.current.label).toBe("after-subscribe");
		// The late subscriber saw the change, not the pre-subscription state.
		expect(recorder.envelopes[0]?.state.counter).toBe(2);
	});

	it("10. does not lose updates from concurrent writers patching different fields", async () => {
		const root = await makeRoot("concurrent");
		const instances = await Promise.all([open(root), open(root), open(root), open(root), open(root), open(root)]);
		const recorders = instances.map((store) => record(store));

		const total = 12;
		await Promise.all(
			Array.from({ length: total }, (_, index) => {
				const store = instances[index % instances.length] as Store;
				const key = `field-${index}`;
				return store.update((state) => ({
					...state,
					fields: { ...state.fields, [key]: index },
				}));
			}),
		);

		const expectedFields: Record<string, number> = {};
		for (let index = 0; index < total; index += 1) expectedFields[`field-${index}`] = index;

		for (const instance of instances) {
			await instance.recheck();
			expect(instance.current.fields).toEqual(expectedFields);
			expect(instance.current.counter).toBe(0);
		}
		for (const recorder of recorders) recorder.unsubscribe();
	});

	it("11. close() stops delivery, is idempotent, and does not break later updates", async () => {
		const root = await makeRoot("close");
		const store = await open(root);
		const recorder = record(store);

		await store.update((state) => ({ ...state, label: "before-close" }));
		await expectNotification(recorder, 1);

		store.close();
		store.close();

		// Notifies nobody, does not throw, and the store still writes.
		await expect(store.update((state) => ({ ...state, label: "after-close" }))).resolves.toBeUndefined();
		await drainEventLoop();
		expect(recorder.envelopes.length).toBe(1);

		// The on-disk state advanced even though nothing is watching it any more.
		const observer = await open(root);
		await observer.recheck();
		expect(observer.current.label).toBe("after-close");
	});

	it("12. degrades to the default state when the state file is corrupt", async () => {
		const root = await makeRoot("corrupt");
		const seed = await open(root);
		await seed.update((state) => ({ ...state, label: "good" }));
		const statePath = await findViewStateFile(root);

		await writeFile(statePath, "{ this is not json", "utf8");

		// A store opened on top of unreadable state falls back to createDefault().
		const opened = await open(root);
		expect(opened.current).toEqual(defaultState());

		// An already-open store degrades rather than throwing out of recheck().
		await seed.update((state) => ({ ...state, label: "still-good" }));
		await writeFile(statePath, "\u0000 not json either", "utf8");
		await expect(seed.recheck()).resolves.toBeUndefined();
	});

	it("13. recheck() is safe to call repeatedly when nothing changed", async () => {
		const root = await makeRoot("recheck");
		const store = await open(root);
		const recorder = record(store);

		// Before the file exists at all.
		await expect(store.recheck()).resolves.toBeUndefined();
		await expect(store.recheck()).resolves.toBeUndefined();

		await store.update((state) => ({ ...state, label: "settled" }));
		await expectNotification(recorder, 1);
		await drainEventLoop();

		for (let attempt = 0; attempt < 5; attempt += 1) {
			await expect(store.recheck()).resolves.toBeUndefined();
		}
		await drainEventLoop();

		// A no-op recheck must not manufacture notifications.
		expect(recorder.envelopes.length).toBe(1);
		expect(store.current).toEqual({ label: "settled", counter: 0, fields: {} });
	});
});
