import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Core } from "../core/agentic-workspace.ts";
import { findGitWorktreeRoot } from "../git/main-worktree.ts";
import { GitOperations } from "../git/operations.ts";
import type { ProcessRunner } from "./session-process.ts";
import { resolveProjectStateRoot, SessionStore } from "./session-store.ts";
import { AgentSessionService } from "./sessions.ts";
import { openViewStateStore } from "./view-state-store.ts";
import { WorkspaceStateService } from "./workspace-state.ts";

const runner: ProcessRunner = {
	run: async () => ({ exitCode: 1, stdout: "", stderr: "not used" }),
};

function external(root: string, home: string): string {
	return join(home, ".agentic-workspace", createHash("sha256").update(root).digest("hex").slice(0, 16));
}

async function git(root: string, ...args: string[]): Promise<void> {
	const child = Bun.spawn(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
	const [, stderr, code] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	if (code !== 0) throw new Error(stderr);
}

describe("pinned project state root", () => {
	let sandbox: string;
	let root: string;
	let home: string;
	let cwd: string;
	let previousHome: string | undefined;
	let previousAgenticWorkspaceCwd: string | undefined;

	beforeEach(async () => {
		cwd = process.cwd();
		previousHome = process.env.HOME;
		previousAgenticWorkspaceCwd = process.env.AGENTIC_WORKSPACE_CWD;
		sandbox = await realpath(await mkdtemp(join(tmpdir(), "agentic-workspace-root-pin-")));
		root = join(sandbox, "project");
		home = join(sandbox, "home");
		await Promise.all([mkdir(root), mkdir(home)]);
		process.env.HOME = home;
		delete process.env.AGENTIC_WORKSPACE_CWD;
		process.chdir(root);
	});

	afterEach(async () => {
		process.chdir(cwd);
		if (previousHome === undefined) delete process.env.HOME;
		else process.env.HOME = previousHome;
		if (previousAgenticWorkspaceCwd === undefined) delete process.env.AGENTIC_WORKSPACE_CWD;
		else process.env.AGENTIC_WORKSPACE_CWD = previousAgenticWorkspaceCwd;
		await chmod(join(root, ".agentic-workspace"), 0o700).catch(() => undefined);
		await chmod(root, 0o700);
		await rm(sandbox, { recursive: true, force: true });
	});

	async function worktree(name = "worktree"): Promise<string> {
		await git(root, "init", "-b", "main");
		await git(
			root,
			"-c",
			"user.name=Fixture",
			"-c",
			"user.email=fixture@example.test",
			"commit",
			"--allow-empty",
			"-m",
			"fixture",
		);
		const path = join(sandbox, name);
		await git(root, "worktree", "add", "-b", "fixture", path);
		return path;
	}

	it("uses the canonical root despite a registered execution worktree", async () => {
		const execution = await worktree();
		process.env.AGENTIC_WORKSPACE_CWD = execution;
		process.chdir(execution);
		const store = new SessionStore(root, runner);
		expect(await store.stateRoot).toBe(join(root, ".agentic-workspace"));
		expect((await store.paths("TASK-1")).taskDir).toBe(join(root, ".agentic-workspace", "task-1"));
		expect(await readdir(execution)).not.toContain(".agentic-workspace");
	});

	it("captures HOME and cwd at construction, pins once, and caches rejection", async () => {
		await writeFile(join(root, ".agentic-workspace"), "primary blocked");
		const store = new SessionStore(".", runner);
		process.env.HOME = join(sandbox, "different-home");
		process.env.AGENTIC_WORKSPACE_CWD = home;
		process.chdir(home);
		const resolution = store.stateRoot;
		expect(await resolution).toBe(external(root, home));
		await rm(join(root, ".agentic-workspace"));
		expect(store.stateRoot).toBe(resolution);
		expect(await store.stateRoot).toBe(external(root, home));
		const bad = new SessionStore(root, runner, undefined, { stateRoot: "relative" });
		const rejected = bad.stateRoot;
		await expect(rejected).rejects.toThrow("Invalid agent state root");
		expect(bad.stateRoot).toBe(rejected);
	});

	it("preserves a single existing external store when primary is writable", async () => {
		const saved = external(root, home);
		await mkdir(saved, { recursive: true });
		await writeFile(join(saved, "view-state.json"), "historical bytes");
		expect(await resolveProjectStateRoot(root)).toBe(saved);
		expect(await readFile(join(saved, "view-state.json"), "utf8")).toBe("historical bytes");
		expect(await readdir(root)).not.toContain(".agentic-workspace");
	});

	it("shares explicit root across session history, claims, services, and view state", async () => {
		const saved = external(root, home);
		const options = { stateRoot: saved };
		const store = new SessionStore(root, runner, undefined, options);
		options.stateRoot = join(root, ".agentic-workspace");
		const service = new AgentSessionService(new Core(root), { runner, stateRoot: saved });
		const workspace = new WorkspaceStateService(new Core(root), { sessions: service });
		expect(await workspace.stateRoot).toBe(saved);
		await store.mutateMode("TASK-1", "build", async () => undefined);
		expect((await new SessionStore(root, runner).read("TASK-1")).modes?.build).toBeDefined();
		const release = await store.claimSession("TASK-1", "session-1");
		try {
			await expect(new SessionStore(root, runner).claimSession("TASK-1", "session-1")).rejects.toThrow("already being");
		} finally {
			await release();
		}
		process.env.HOME = join(sandbox, "different-home");
		const view = await openViewStateStore(root, () => ({ count: 0 }), { stateRoot: await workspace.stateRoot });
		try {
			await view.update(() => ({ count: 1 }));
			expect(JSON.parse(await readFile(join(saved, "view-state.json"), "utf8")).state.count).toBe(1);
		} finally {
			view.close();
		}
		expect(await readdir(root)).not.toContain(".agentic-workspace");
	});

	it("pins a relative view-store project path including its existing lock namespace", async () => {
		const view = await openViewStateStore(".", () => ({ count: 0 }));
		try {
			process.chdir(home);
			await view.update(() => ({ count: 1 }));
			expect(JSON.parse(await readFile(join(root, ".agentic-workspace", "view-state.json"), "utf8")).state.count).toBe(
				1,
			);
			expect(await readdir(home)).toEqual([]);
		} finally {
			view.close();
		}
	});

	it("rejects primary/external conflicts before writes, even with an explicit root", async () => {
		for (const candidate of [join(root, ".agentic-workspace"), external(root, home)]) {
			await mkdir(candidate, { recursive: true });
			await writeFile(join(candidate, "view-state.json"), "preserve");
		}
		const store = new SessionStore(root, runner, undefined, { stateRoot: join(root, ".agentic-workspace") });
		await expect(store.claimSession("TASK-1", "session-1")).rejects.toThrow("Ambiguous agent state");
		await expect(openViewStateStore(root, () => ({}))).rejects.toThrow("Ambiguous agent state");
		for (const candidate of [join(root, ".agentic-workspace"), external(root, home)]) {
			expect(await readdir(candidate)).toEqual(["view-state.json"]);
			expect(await readFile(join(candidate, "view-state.json"), "utf8")).toBe("preserve");
		}
	});

	it("rejects a registered legacy worktree store without needing ambient cwd", async () => {
		const execution = await worktree();
		const legacy = join(execution, ".agentic-workspace", "task-1");
		await mkdir(legacy, { recursive: true });
		await writeFile(join(legacy, "state.json"), "historical bytes");
		const store = new SessionStore(root, runner);
		await expect(store.mutateMode("TASK-1", "build", async () => undefined)).rejects.toThrow("Ambiguous agent state");
		expect(await readFile(join(legacy, "state.json"), "utf8")).toBe("historical bytes");
		expect(await readdir(root)).not.toContain(".agentic-workspace");
	});

	it("rejects legacy external claims and a conflicting explicit root", async () => {
		const execution = await worktree();
		const legacy = join(external(execution, home), "task-1");
		await mkdir(legacy, { recursive: true });
		await writeFile(join(legacy, "owner.claim"), "");
		await expect(resolveProjectStateRoot(root)).rejects.toThrow("Ambiguous agent state");
		await expect(resolveProjectStateRoot(root, { stateRoot: join(sandbox, "unrelated") })).rejects.toThrow(
			"Invalid agent state root",
		);
	});

	it("refuses unavailable registered-worktree discovery", async () => {
		await mkdir(join(root, ".git"));
		await expect(resolveProjectStateRoot(root)).rejects.toThrow("Cannot inspect registered worktrees");
		expect(await readdir(root)).toEqual([".git"]);
	});

	it("fails closed on unreadable storage rather than selecting another root", async () => {
		const primary = join(root, ".agentic-workspace");
		await mkdir(primary);
		await chmod(primary, 0o000);
		await expect(resolveProjectStateRoot(root)).rejects.toThrow("Cannot inspect agent state");
		expect(await readdir(home)).toEqual([]);
	});

	it("recognizes external state inside a linked task container", async () => {
		const target = join(sandbox, "task-container");
		const saved = external(root, home);
		await mkdir(target);
		await writeFile(join(target, "state.json"), "preserve");
		await mkdir(saved, { recursive: true });
		await symlink(target, join(saved, "task-1"), "dir");
		expect(await resolveProjectStateRoot(root)).toBe(saved);
		expect(await readFile(join(target, "state.json"), "utf8")).toBe("preserve");
		expect(await readdir(root)).toEqual([]);
	});

	it("rejects linked legacy task containers and dangling container links without writes", async () => {
		const execution = await worktree();
		const target = join(sandbox, "task-container");
		const legacy = join(execution, ".agentic-workspace");
		await mkdir(target);
		await writeFile(join(target, "state.json"), "preserve");
		await mkdir(legacy);
		await symlink(target, join(legacy, "task-1"), "dir");
		await expect(new SessionStore(root, runner).claimSession("TASK-1", "session-1")).rejects.toThrow(
			"Ambiguous agent state",
		);
		expect(await readFile(join(target, "state.json"), "utf8")).toBe("preserve");
		await rm(join(legacy, "task-1"));
		await symlink(join(sandbox, "missing"), join(legacy, "task-1"), "dir");
		await expect(resolveProjectStateRoot(root)).rejects.toThrow("Cannot inspect agent state");
		expect(await readdir(root)).not.toContain(".agentic-workspace");
	});

	it.each(["missing", ".git"])("refuses a broken or looping .git symlink (%s)", async (target) => {
		await symlink(target, join(root, ".git"));
		await expect(findGitWorktreeRoot(root)).resolves.toBeNull();
		await expect(resolveProjectStateRoot(root)).rejects.toThrow("Cannot inspect Git worktree marker");
		expect(await readdir(root)).toEqual([".git"]);
		expect(await readdir(home)).toEqual([]);
	});

	it("strict discovery refuses a non-ENOENT traversal failure", async () => {
		const hidden = join(root, "hidden");
		await mkdir(hidden);
		await chmod(hidden, 0o000);
		try {
			await expect(findGitWorktreeRoot(join(hidden, "project"), { strict: true })).rejects.toThrow(
				"Cannot inspect Git worktree marker",
			);
			await expect(
				new SessionStore(join(hidden, "project"), runner).claimSession("TASK-1", "session-1"),
			).rejects.toThrow("Cannot inspect Git worktree marker");
			expect(await readdir(home)).toEqual([]);
		} finally {
			await chmod(hidden, 0o700);
		}
	});

	it.each([
		"worktree trailing ",
		'worktree "quoted"\nline',
	])("preserves registered worktree path bytes and refuses its old store (%s)", async (name) => {
		const execution = await worktree(name);
		expect(await new GitOperations(root).listWorktreePaths()).toContain(execution);
		const legacy = join(execution, ".agentic-workspace", "task-1");
		await mkdir(legacy, { recursive: true });
		await writeFile(join(legacy, "state.json"), "preserve");
		await expect(resolveProjectStateRoot(root)).rejects.toThrow("Ambiguous agent state");
		expect(await readFile(join(legacy, "state.json"), "utf8")).toBe("preserve");
		expect(await readdir(root)).not.toContain(".agentic-workspace");
	});

	it("allows ..cache as a descendant name when checking old execution stores", async () => {
		await worktree();
		const execution = join(root, "..cache");
		const legacy = join(execution, ".agentic-workspace", "task-1");
		await mkdir(legacy, { recursive: true });
		await writeFile(join(legacy, "state.json"), "preserve");
		process.env.AGENTIC_WORKSPACE_CWD = execution;
		await expect(resolveProjectStateRoot(root)).rejects.toThrow("Ambiguous agent state");
		expect(await readFile(join(legacy, "state.json"), "utf8")).toBe("preserve");
		expect(await readdir(root)).not.toContain(".agentic-workspace");
	});

	it("deduplicates physical stores and preserves explicit root spelling", async () => {
		const saved = external(root, home);
		const primary = join(root, ".agentic-workspace");
		await mkdir(saved, { recursive: true });
		await writeFile(join(saved, "view-state.json"), "preserve");
		await symlink(saved, primary, "dir");
		expect(await resolveProjectStateRoot(root)).toBe(primary);
		expect(await resolveProjectStateRoot(root, { stateRoot: saved })).toBe(saved);
		expect(await resolveProjectStateRoot(root, { stateRoot: primary })).toBe(primary);
		expect(await readFile(join(saved, "view-state.json"), "utf8")).toBe("preserve");
	});

	it("checks inherited storage base for legacy claims after HOME changes", async () => {
		const execution = await worktree();
		const saved = external(root, home);
		const legacy = join(external(execution, home), "task-1");
		await mkdir(saved, { recursive: true });
		await writeFile(join(saved, "view-state.json"), "preserve");
		await mkdir(legacy, { recursive: true });
		await writeFile(join(legacy, "owner.claim"), "preserve claim");
		process.env.HOME = join(sandbox, "new-home");
		const store = new SessionStore(root, runner, undefined, { stateRoot: saved });
		await expect(store.claimSession("TASK-1", "session-1")).rejects.toThrow("Ambiguous agent state");
		expect(await readFile(join(legacy, "owner.claim"), "utf8")).toBe("preserve claim");
		expect(await readFile(join(saved, "view-state.json"), "utf8")).toBe("preserve");
		expect(existsSync(process.env.HOME)).toBe(false);
		expect(await readdir(root)).not.toContain(".agentic-workspace");
	});

	it("shares external state and lock across read-only project clients, pinned despite environment changes", async () => {
		await chmod(root, 0o500);
		const saved = external(root, home);
		expect(await resolveProjectStateRoot(root)).toBe(saved);
		const store = new SessionStore(root, runner);
		await store.mutateMode("TASK-1", "build", async () => undefined);
		expect(await store.stateRoot).toBe(saved);
		const first = await openViewStateStore(root, () => ({ count: 0 }));
		const second = await openViewStateStore(root, () => ({ count: 0 }), { stateRoot: await store.stateRoot });
		try {
			process.env.HOME = join(sandbox, "different-home");
			process.env.AGENTIC_WORKSPACE_CWD = home;
			process.chdir(home);
			await Promise.all(
				Array.from({ length: 20 }, (_, index) =>
					(index % 2 ? first : second).update((state) => {
						expect(statSync(join(saved, "workspace-view-state.lock")).isDirectory()).toBe(true);
						return { count: state.count + 1 };
					}),
				),
			);
			expect(JSON.parse(await readFile(join(saved, "view-state.json"), "utf8")).state.count).toBe(20);
			expect((await store.paths("TASK-1")).statePath).toBe(join(saved, "task-1", "state.json"));
			expect(existsSync(join(sandbox, "different-home"))).toBe(false);
		} finally {
			first.close();
			second.close();
		}
		expect(await readdir(root)).toEqual([]);
	});

	it("retains canonical locking for writable-project external state clients", async () => {
		const saved = external(root, home);
		const view = await openViewStateStore(root, () => ({ count: 0 }), { stateRoot: saved });
		try {
			await view.update(() => {
				expect(statSync(join(root, "agentic-workspace", ".locks", "workspace-view-state")).isDirectory()).toBe(true);
				expect(statSync(join(saved, "workspace-view-state.lock")).isDirectory()).toBe(true);
				return { count: 1 };
			});
		} finally {
			view.close();
		}
	});

	it("retains an existing usable canonical namespace even with a read-only project root", async () => {
		await mkdir(join(root, "agentic-workspace", ".locks"), { recursive: true });
		await chmod(root, 0o500);
		const saved = external(root, home);
		const view = await openViewStateStore(root, () => ({ count: 0 }));
		try {
			await view.update(() => {
				expect(statSync(join(root, "agentic-workspace", ".locks", "workspace-view-state")).isDirectory()).toBe(true);
				expect(statSync(join(saved, "workspace-view-state.lock")).isDirectory()).toBe(true);
				return { count: 1 };
			});
		} finally {
			view.close();
		}
	});

	it("does not switch namespaces for an unusable canonical lock directory in a writable project", async () => {
		const locks = join(root, "agentic-workspace", ".locks");
		await mkdir(locks, { recursive: true });
		await chmod(locks, 0o500);
		try {
			await expect(openViewStateStore(root, () => ({}), { stateRoot: external(root, home) })).rejects.toThrow(
				"refusing a different lock namespace",
			);
			expect(existsSync(join(external(root, home), "view-state.json"))).toBe(false);
			expect(existsSync(join(external(root, home), "workspace-view-state.lock"))).toBe(false);
		} finally {
			await chmod(locks, 0o700);
		}
	});

	it("does not interpret an unreadable canonical lock directory as read-only", async () => {
		const locks = join(root, "agentic-workspace", ".locks");
		await mkdir(locks, { recursive: true });
		await chmod(locks, 0o000);
		await chmod(root, 0o500);
		try {
			await expect(openViewStateStore(root, () => ({}))).rejects.toThrow();
			expect(existsSync(join(external(root, home), "view-state.json"))).toBe(false);
			expect(existsSync(join(external(root, home), "workspace-view-state.lock"))).toBe(false);
		} finally {
			await chmod(locks, 0o700);
		}
	});
});
