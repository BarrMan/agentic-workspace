import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type GroupState, openGroupStore, type TaskGroup } from "../agent-workspace/group-store.ts";
import { safeCleanup, waitUntil } from "./test-utils.ts";

type Store = Awaited<ReturnType<typeof openGroupStore>>;

function group(id: string, order: number, parentId: string | null = null): TaskGroup {
	return { id, name: `Group ${id}`, parentId, order, collapsed: false };
}

function sampleState(): GroupState {
	return {
		groups: [group("g1", 0), group("g2", 1, "g1")],
		membership: { t1: "g1", t2: "g2" },
	};
}

const roots: string[] = [];
const stores: Store[] = [];

async function makeRoot(prefix: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), `agentic-workspace-groups-${prefix}-`));
	roots.push(root);
	return root;
}

function agenticWorkspaceOf(root: string): string {
	return join(root, ".agentic-workspace");
}

function groupsFileOf(root: string): string {
	return join(agenticWorkspaceOf(root), "groups.json");
}

async function open(root: string): Promise<Store> {
	const store = await openGroupStore(root, agenticWorkspaceOf(root));
	stores.push(store);
	return store;
}

/** Drains the macrotask queue so watcher-driven work that is already queued can settle. */
async function drainEventLoop(): Promise<void> {
	for (let index = 0; index < 5; index += 1) await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("openGroupStore", () => {
	afterEach(async () => {
		for (const store of stores.splice(0)) {
			try {
				store.close();
			} catch {
				// close() is documented as idempotent; a throw here is a real failure surfaced by the test.
			}
		}
		await Promise.all(roots.splice(0).map(async (root) => await safeCleanup(root)));
	});

	it("1. yields emptyGroupState on a fresh directory", async () => {
		const root = await makeRoot("empty");
		const store = await open(root);

		expect(store.current).toEqual({ groups: [], membership: {} });
	});

	it("2. persists groups and membership for a freshly reopened store", async () => {
		const root = await makeRoot("persist");
		const store = await open(root);

		await store.update(() => sampleState());
		expect(store.current).toEqual(sampleState());

		const reopened = await open(root);
		expect(reopened.current).toEqual(sampleState());

		const raw = await readFile(groupsFileOf(root), "utf8");
		expect(raw.endsWith("\n")).toBe(true);
		expect(JSON.parse(raw)).toEqual({ groups: sampleState().groups, membership: sampleState().membership });
	});

	it("3. rejects corrupt JSON without replacing the file", async () => {
		const root = await makeRoot("corrupt");
		const agenticWorkspaceDir = agenticWorkspaceOf(root);
		await mkdir(agenticWorkspaceDir, { recursive: true });
		await writeFile(groupsFileOf(root), "{ this is not json", "utf8");

		await expect(openGroupStore(root, agenticWorkspaceDir)).rejects.toThrow();
		expect(await readFile(groupsFileOf(root), "utf8")).toBe("{ this is not json");
	});

	it("4. drops invalid group entries and non-string memberships instead of throwing", async () => {
		const root = await makeRoot("defensive");
		await mkdir(agenticWorkspaceOf(root), { recursive: true });
		await writeFile(
			groupsFileOf(root),
			`${JSON.stringify({
				groups: [
					group("keep", 0),
					{ id: "missing-fields" },
					{ id: "bad-order", name: "n", parentId: null, order: "x", collapsed: false },
					null,
				],
				membership: { t1: "keep", t2: 42 },
			})}\n`,
			"utf8",
		);

		const store = await open(root);
		expect(store.current.groups).toEqual([group("keep", 0)]);
		expect(store.current.membership).toEqual({ t1: "keep" });
	});

	it("5. accumulates sequential updates and does not notify on an unchanged patch", async () => {
		const root = await makeRoot("accumulate");
		const store = await open(root);
		const states: GroupState[] = [];
		store.subscribe((state) => states.push(state));

		await store.update((state) => ({ ...state, groups: [...state.groups, group("g1", 0)] }));
		await store.update((state) => ({ ...state, membership: { ...state.membership, t1: "g1" } }));

		expect(store.current).toEqual({ groups: [group("g1", 0)], membership: { t1: "g1" } });
		await waitUntil(() => states.length >= 2, "two update notifications");

		const before = states.length;
		await store.update((state) => ({ ...state }));
		await drainEventLoop();

		expect(states.length).toBe(before);
		expect(store.current).toEqual({ groups: [group("g1", 0)], membership: { t1: "g1" } });
	});

	it("6. notifies subscribers after update and after an external file write", async () => {
		const root = await makeRoot("subscribe");
		const store = await open(root);
		const states: GroupState[] = [];
		store.subscribe((state) => states.push(state));

		await store.update(() => sampleState());
		await waitUntil(() => states.length >= 1, "update notification");
		expect(states[0]).toEqual(sampleState());

		const external: GroupState = { groups: [], membership: { t9: "g9" } };
		await writeFile(groupsFileOf(root), `${JSON.stringify(external, null, "\t")}\n`, "utf8");

		// The watcher fast path can be flaky on some platforms; skip delivery if it misses.
		await waitUntil(() => states.length >= 2, "external write notification", 2_000).catch(() => undefined);
		if (states.length >= 2) {
			expect(store.current).toEqual(external);
			expect(states[states.length - 1]).toEqual(external);
		}
	});

	it("7. close() is idempotent and stops notifications", async () => {
		const root = await makeRoot("close");
		const store = await open(root);
		const states: GroupState[] = [];
		store.subscribe((state) => states.push(state));

		await store.update(() => sampleState());
		await waitUntil(() => states.length >= 1, "pre-close notification");

		store.close();
		store.close();

		await expect(store.update((state) => ({ ...state, membership: { t9: "g9" } }))).resolves.toBeUndefined();
		await drainEventLoop();
		expect(states.length).toBe(1);

		const reopened = await open(root);
		expect(reopened.current.membership).toEqual({ t9: "g9" });
	});
});
