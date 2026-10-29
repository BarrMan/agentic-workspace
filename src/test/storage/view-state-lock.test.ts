import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import lockfile from "proper-lockfile";
import { openViewStateStore, type ViewStateStore } from "../../storage/view-state-store.ts";

describe("view-state locking", () => {
	let sandbox: string;
	let root: string;
	let saved: string;
	let externalLock: string;
	let canonicalLock: string;
	let previousHome: string | undefined;
	let previousAgenticWorkspaceCwd: string | undefined;
	const stores: ViewStateStore<{ count: number }>[] = [];

	beforeEach(async () => {
		sandbox = await realpath(await mkdtemp(join(tmpdir(), "agentic-workspace-view-lock-")));
		root = join(sandbox, "project");
		await mkdir(root);
		await mkdir(join(root, ".agentic-workspace", ".locks"), { recursive: true });
		previousHome = process.env.HOME;
		previousAgenticWorkspaceCwd = process.env.AGENTIC_WORKSPACE_CWD;
		process.env.HOME = join(sandbox, "home");
		delete process.env.AGENTIC_WORKSPACE_CWD;
		saved = join(process.env.HOME, ".agentic-workspace", createHash("sha256").update(root).digest("hex").slice(0, 16));
		await mkdir(saved, { recursive: true });
		externalLock = join(saved, "workspace-view-state.lock");
		canonicalLock = join(root, ".agentic-workspace", ".locks", "workspace-view-state");
	});

	afterEach(async () => {
		for (const store of stores.splice(0)) store.close();
		if (previousHome === undefined) delete process.env.HOME;
		else process.env.HOME = previousHome;
		if (previousAgenticWorkspaceCwd === undefined) delete process.env.AGENTIC_WORKSPACE_CWD;
		else process.env.AGENTIC_WORKSPACE_CWD = previousAgenticWorkspaceCwd;
		await chmod(root, 0o700);
		await chmod(dirname(canonicalLock), 0o700).catch(() => undefined);
		await rm(sandbox, { recursive: true, force: true });
	});

	async function open(): Promise<ViewStateStore<{ count: number }>> {
		const store = await openViewStateStore(root, () => ({ count: 0 }), { stateRoot: saved });
		stores.push(store);
		return store;
	}

	async function openCanonical(): Promise<ViewStateStore<{ count: number }>> {
		const store = await openViewStateStore(root, () => ({ count: 0 }));
		stores.push(store);
		return store;
	}

	async function count(): Promise<number> {
		return JSON.parse(await readFile(join(saved, "view-state.json"), "utf8")).state.count;
	}

	async function canonicalCount(): Promise<number> {
		return JSON.parse(await readFile(join(root, ".agentic-workspace", "view-state.json"), "utf8")).state.count;
	}

	function unlocked(): void {
		expect(existsSync(externalLock)).toBe(false);
		expect(existsSync(canonicalLock)).toBe(false);
	}

	it("serializes both open clients through the external lock while the project root is read-only", async () => {
		await chmod(root, 0o500);
		const first = await open();
		await first.update((state) => {
			expect(existsSync(externalLock)).toBe(true);
			expect(existsSync(canonicalLock)).toBe(false);
			return { count: state.count + 1 };
		});
		await chmod(root, 0o700);
		const second = await open();
		await Promise.all(
			Array.from({ length: 20 }, (_, index) =>
				(index % 2 ? first : second).update((state) => {
					expect(existsSync(externalLock)).toBe(true);
					expect(existsSync(canonicalLock)).toBe(false);
					return { count: state.count + 1 };
				}),
			),
		);
		expect(await count()).toBe(21);
		unlocked();
	});

	it("serializes physical aliases while the first writer is paused after reading", async () => {
		const primary = join(root, ".agentic-workspace");
		await rm(primary, { recursive: true });
		await symlink(saved, primary, "dir");
		const second = await openViewStateStore(root, () => ({ count: 0 }), { stateRoot: primary });
		stores.push(second);
		const first = await open();
		const prototype = Object.getPrototypeOf(first);
		const originalRead = prototype.readEnvelope;
		let entered!: () => void;
		let release!: () => void;
		const afterRead = new Promise<void>((resolve) => (entered = resolve));
		const gate = new Promise<void>((resolve) => (release = resolve));
		let pause = true;
		const readSpy = spyOn(prototype, "readEnvelope").mockImplementation(async function (
			this: ViewStateStore<{ count: number }>,
		) {
			const envelope = await originalRead.call(this);
			if (this === first && pause) {
				pause = false;
				entered();
				await gate;
			}
			return envelope;
		});
		const originalLock = lockfile.lock;
		let attempted!: () => void;
		const secondLockAttempt = new Promise<void>((resolve) => (attempted = resolve));
		let secondStarted = false;
		const lockSpy = spyOn(lockfile, "lock").mockImplementation((path, options) => {
			if (secondStarted && options?.lockfilePath === externalLock) attempted();
			return originalLock(path, options);
		});
		const firstUpdate = first.update((state) => ({ count: state.count + 1 }));
		let secondUpdate: Promise<void> | undefined;
		let secondPatches = 0;
		try {
			await afterRead;
			expect(existsSync(externalLock)).toBe(true);
			expect(existsSync(canonicalLock)).toBe(false);
			secondStarted = true;
			secondUpdate = second.update((state) => {
				secondPatches += 1;
				return { count: state.count + 10 };
			});
			await Promise.race([
				secondLockAttempt,
				secondUpdate.then(() => {
					throw new Error("Primary alias bypassed the physical external lock.");
				}),
			]);
			expect(secondPatches).toBe(0);
			expect(await count()).toBe(0);
		} finally {
			release();
			try {
				await Promise.all([firstUpdate, ...(secondUpdate ? [secondUpdate] : [])]);
			} finally {
				readSpy.mockRestore();
				lockSpy.mockRestore();
			}
		}
		expect(secondPatches).toBe(1);
		expect(await count()).toBe(11);
		expect(JSON.parse(await readFile(join(primary, "view-state.json"), "utf8")).state.count).toBe(11);
		unlocked();
	});

	it("keeps genuine project-local storage canonical-only through a project-root alias", async () => {
		const alias = join(sandbox, "project-alias");
		await symlink(root, alias, "dir");
		const store = await openViewStateStore(alias, () => ({ count: 0 }));
		stores.push(store);
		await store.update(() => {
			expect(existsSync(canonicalLock)).toBe(true);
			expect(existsSync(join(root, ".agentic-workspace", "workspace-view-state.lock"))).toBe(false);
			return { count: 1 };
		});
		expect(JSON.parse(await readFile(join(alias, ".agentic-workspace", "view-state.json"), "utf8")).state.count).toBe(
			1,
		);
	});

	it("keeps external-spelling aliases of local physical storage canonical-only", async () => {
		const primary = join(root, ".agentic-workspace");
		await rm(saved, { recursive: true });
		await symlink(primary, saved, "dir");
		const store = await open();
		await store.update(() => {
			expect(existsSync(canonicalLock)).toBe(true);
			expect(existsSync(externalLock)).toBe(false);
			return { count: 1 };
		});
		expect(await count()).toBe(1);
		expect(JSON.parse(await readFile(join(primary, "view-state.json"), "utf8")).state.count).toBe(1);
	});

	it("serializes both open clients after writable -> read-only without changing the external lock", async () => {
		const first = await open();
		const second = await open();
		await chmod(root, 0o500);
		await Promise.all(
			Array.from({ length: 20 }, (_, index) =>
				(index % 2 ? first : second).update((state) => {
					expect(existsSync(externalLock)).toBe(true);
					expect(existsSync(canonicalLock)).toBe(false);
					return { count: state.count + 1 };
				}),
			),
		);
		expect(await count()).toBe(20);
		unlocked();
	});

	it("acquires only the external lock and ignores the canonical lock", async () => {
		const store = await open();
		await mkdir(dirname(canonicalLock), { recursive: true });
		const release = await lockfile.lock(root, { lockfilePath: canonicalLock, realpath: true, retries: 0 });
		const original = lockfile.lock;
		const attempts: string[] = [];
		const spy = spyOn(lockfile, "lock").mockImplementation((path, options) => {
			attempts.push(options?.lockfilePath ?? "");
			return original(path, options);
		});
		let patches = 0;
		try {
			await store.update((state) => {
				patches += 1;
				expect(existsSync(externalLock)).toBe(true);
				expect(existsSync(canonicalLock)).toBe(true);
				return { count: state.count + 1 };
			});
		} finally {
			spy.mockRestore();
			await release();
		}
		expect(attempts).toEqual([externalLock]);
		expect(patches).toBe(1);
		expect(await count()).toBe(1);
		unlocked();
	});

	it("releases the external lock on acquisition failure and on operation failure", async () => {
		const store = await open();
		const original = lockfile.lock;
		const failure = Object.assign(new Error("injected acquisition failure"), { code: "EACCES" });
		const spy = spyOn(lockfile, "lock").mockImplementation((path, options) => {
			if (options?.lockfilePath === externalLock) return Promise.reject(failure);
			return original(path, options);
		});
		let patches = 0;
		try {
			await expect(
				store.update(() => {
					patches += 1;
					return { count: 1 };
				}),
			).rejects.toThrow("injected acquisition failure");
		} finally {
			spy.mockRestore();
		}
		expect(patches).toBe(0);
		expect(await count()).toBe(0);
		unlocked();
		const operationFailure = new Error("injected operation failure");
		await expect(
			store.update(() => {
				throw operationFailure;
			}),
		).rejects.toBe(operationFailure);
		unlocked();
		await store.update(() => ({ count: 1 }));
		expect(await count()).toBe(1);
	});

	it("seeds under the external lock only", async () => {
		const original = lockfile.lock;
		const events: string[] = [];
		const spy = spyOn(lockfile, "lock").mockImplementation(async (path, options) => {
			const release = await original(path, options);
			const name = options?.lockfilePath === externalLock ? "external" : "canonical";
			events.push(`acquire ${name}`);
			return async () => {
				await release();
				events.push(`release ${name}`);
			};
		});
		try {
			await open();
		} finally {
			spy.mockRestore();
		}
		expect(events).toEqual(["acquire external", "release external"]);
		expect(await count()).toBe(0);
		unlocked();
	});

	it("refuses to bypass a visible canonical lock when the canonical parent cannot be resolved", async () => {
		const store = await openCanonical();
		const release = await lockfile.lock(root, { lockfilePath: canonicalLock, realpath: true, retries: 0 });
		await chmod(dirname(canonicalLock), 0o500);
		await chmod(root, 0o500);
		try {
			await expect(store.update(() => ({ count: 1 }))).rejects.toThrow("Cannot bypass an existing canonical");
			expect(await canonicalCount()).toBe(0);
			expect(existsSync(canonicalLock)).toBe(true);
		} finally {
			await chmod(root, 0o700);
			await chmod(dirname(canonicalLock), 0o700);
			await release();
		}
	});

	it.each(["file", "dangling", "loop"])("refuses a malformed canonical lock parent (%s)", async (kind) => {
		const store = await openCanonical();
		const parent = dirname(canonicalLock);
		await rm(parent, { recursive: true });
		if (kind === "file") await writeFile(parent, "not a directory");
		else await symlink(kind === "loop" ? parent : join(sandbox, "missing"), parent, "dir");
		await expect(store.update(() => ({ count: 1 }))).rejects.toThrow();
		expect(await canonicalCount()).toBe(0);
		unlocked();
	});

	it.each([
		"canonical",
		"external",
	])("reports %s release failure without replaying a committed patch", async (which) => {
		const store = which === "canonical" ? await openCanonical() : await open();
		const lockPath = which === "canonical" ? canonicalLock : externalLock;
		const original = lockfile.lock;
		const spy = spyOn(lockfile, "lock").mockImplementation(async (path, options) => {
			const release = await original(path, options);
			if (options?.lockfilePath !== lockPath) return release;
			return async () => {
				await release();
				throw new Error("injected release failure");
			};
		});
		let patches = 0;
		try {
			await expect(
				store.update((state) => {
					patches += 1;
					return { count: state.count + 1 };
				}),
			).rejects.toThrow("injected release failure");
		} finally {
			spy.mockRestore();
		}
		expect(patches).toBe(1);
		expect(await (which === "canonical" ? canonicalCount() : count())).toBe(1);
		unlocked();
	});
});
