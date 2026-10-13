import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import lockfile from "proper-lockfile";
import { openViewStateStore, type ViewStateStore } from "./view-state-store.ts";

describe("external view-state dual locking", () => {
	let sandbox: string;
	let root: string;
	let saved: string;
	let externalLock: string;
	let canonicalLock: string;
	let previousHome: string | undefined;
	let previousBacklogCwd: string | undefined;
	const stores: ViewStateStore<{ count: number }>[] = [];

	beforeEach(async () => {
		sandbox = await realpath(await mkdtemp(join(tmpdir(), "backlog-view-lock-")));
		root = join(sandbox, "project");
		await mkdir(root);
		previousHome = process.env.HOME;
		previousBacklogCwd = process.env.BACKLOG_CWD;
		process.env.HOME = join(sandbox, "home");
		delete process.env.BACKLOG_CWD;
		saved = join(process.env.HOME, ".backlog", createHash("sha256").update(root).digest("hex").slice(0, 16));
		externalLock = join(saved, "workspace-view-state.lock");
		canonicalLock = join(root, "backlog", ".locks", "workspace-view-state");
	});

	afterEach(async () => {
		for (const store of stores.splice(0)) store.close();
		if (previousHome === undefined) delete process.env.HOME;
		else process.env.HOME = previousHome;
		if (previousBacklogCwd === undefined) delete process.env.BACKLOG_CWD;
		else process.env.BACKLOG_CWD = previousBacklogCwd;
		await chmod(root, 0o700);
		await chmod(dirname(canonicalLock), 0o700).catch(() => undefined);
		await rm(sandbox, { recursive: true, force: true });
	});

	async function open(): Promise<ViewStateStore<{ count: number }>> {
		const store = await openViewStateStore(root, () => ({ count: 0 }), { stateRoot: saved });
		stores.push(store);
		return store;
	}

	async function count(): Promise<number> {
		return JSON.parse(await readFile(join(saved, "view-state.json"), "utf8")).state.count;
	}

	function unlocked(): void {
		expect(existsSync(externalLock)).toBe(false);
		expect(existsSync(canonicalLock)).toBe(false);
	}

	it("rechecks canonical availability after read-only -> writable and serializes both open clients", async () => {
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
					expect(existsSync(canonicalLock)).toBe(true);
					return { count: state.count + 1 };
				}),
			),
		);
		expect(await count()).toBe(21);
		unlocked();
	});

	it("serializes physical aliases across read-only -> writable while the first writer is paused after reading", async () => {
		await mkdir(saved, { recursive: true });
		const primary = join(root, ".backlog");
		await symlink(saved, primary, "dir");
		const second = await openViewStateStore(root, () => ({ count: 0 }), { stateRoot: primary });
		stores.push(second);
		await chmod(dirname(canonicalLock), 0o500);
		await chmod(root, 0o500);
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
			await chmod(root, 0o700);
			await chmod(dirname(canonicalLock), 0o700);
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
			expect(existsSync(join(root, ".backlog", "workspace-view-state.lock"))).toBe(false);
			return { count: 1 };
		});
		expect(JSON.parse(await readFile(join(alias, ".backlog", "view-state.json"), "utf8")).state.count).toBe(1);
	});

	it("keeps external-spelling aliases of local physical storage canonical-only", async () => {
		const primary = join(root, ".backlog");
		await mkdir(primary);
		await mkdir(dirname(saved), { recursive: true });
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
		await chmod(dirname(canonicalLock), 0o500);
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

	it("waits for a legacy canonical writer while retaining the outer external lock", async () => {
		const store = await open();
		const release = await lockfile.lock(root, { lockfilePath: canonicalLock, realpath: true, retries: 0 });
		const original = lockfile.lock;
		let entered!: () => void;
		const canonicalAttempted = new Promise<void>((resolve) => (entered = resolve));
		const spy = spyOn(lockfile, "lock").mockImplementation((path, options) => {
			if (options?.lockfilePath === canonicalLock) entered();
			return original(path, options);
		});
		let patches = 0;
		const update = store.update((state) => {
			patches += 1;
			return { count: state.count + 1 };
		});
		try {
			await canonicalAttempted;
			expect(existsSync(externalLock)).toBe(true);
			expect(patches).toBe(0);
			expect(await count()).toBe(0);
		} finally {
			await release();
			try {
				await update;
			} finally {
				spy.mockRestore();
			}
		}
		expect(patches).toBe(1);
		expect(await count()).toBe(1);
		unlocked();
	});

	it("does not downgrade on inner acquisition failure and releases the outer lock on operation failure", async () => {
		const store = await open();
		const original = lockfile.lock;
		const failure = Object.assign(new Error("injected acquisition failure"), { code: "EACCES" });
		const spy = spyOn(lockfile, "lock").mockImplementation((path, options) => {
			if (options?.lockfilePath === canonicalLock) return Promise.reject(failure);
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

	it("seeds under external -> canonical acquisition and releases in reverse order", async () => {
		const original = lockfile.lock;
		const events: string[] = [];
		const spy = spyOn(lockfile, "lock").mockImplementation(async (path, options) => {
			const release = await original(path, options);
			const name = options?.lockfilePath === externalLock ? "external" : "canonical";
			events.push(`acquire ${name}`);
			if (name === "canonical") expect(existsSync(externalLock)).toBe(true);
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
		expect(events).toEqual(["acquire external", "acquire canonical", "release canonical", "release external"]);
		expect(await count()).toBe(0);
		unlocked();
	});

	it("refuses to bypass a visible old canonical lock during read-only fallback", async () => {
		const store = await open();
		const release = await lockfile.lock(root, { lockfilePath: canonicalLock, realpath: true, retries: 0 });
		await chmod(dirname(canonicalLock), 0o500);
		await chmod(root, 0o500);
		try {
			await expect(store.update(() => ({ count: 1 }))).rejects.toThrow("Cannot bypass an existing canonical");
			expect(await count()).toBe(0);
			expect(existsSync(externalLock)).toBe(false);
			expect(existsSync(canonicalLock)).toBe(true);
		} finally {
			await chmod(root, 0o700);
			await chmod(dirname(canonicalLock), 0o700);
			await release();
		}
	});

	it.each(["file", "dangling", "loop"])("refuses a malformed canonical lock parent (%s)", async (kind) => {
		const store = await open();
		const parent = dirname(canonicalLock);
		await rm(parent, { recursive: true });
		if (kind === "file") await writeFile(parent, "not a directory");
		else await symlink(kind === "loop" ? parent : join(sandbox, "missing"), parent, "dir");
		await chmod(root, 0o500);
		await expect(store.update(() => ({ count: 1 }))).rejects.toThrow();
		expect(await count()).toBe(0);
		unlocked();
	});

	it.each([
		"canonical",
		"external",
	])("reports %s release failure without replaying a committed patch", async (which) => {
		const store = await open();
		const original = lockfile.lock;
		const spy = spyOn(lockfile, "lock").mockImplementation(async (path, options) => {
			const release = await original(path, options);
			if (options?.lockfilePath !== (which === "canonical" ? canonicalLock : externalLock)) return release;
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
		expect(await count()).toBe(1);
		unlocked();
	});
});
