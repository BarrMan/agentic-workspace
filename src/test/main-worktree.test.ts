import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { findGitWorktreeRoot, resolveMainWorktreeRoot } from "../filesystem/git/main-worktree.ts";
import { initGitRepo } from "./test-utils.ts";

describe("main worktree discovery", () => {
	let testDir: string;
	beforeEach(async () => {
		testDir = await realpath(await mkdtemp(join(tmpdir(), "main-worktree-")));
	});
	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	it("does not redirect a main checkout with a .git directory", async () => {
		initGitRepo(testDir);
		const nested = join(testDir, "nested");
		await mkdir(nested);
		expect(await findGitWorktreeRoot(nested)).toBe(testDir);
		expect(await resolveMainWorktreeRoot(testDir)).toBeNull();
	});

	it("handles linked worktrees and symlinked paths with spaces", async () => {
		const main = join(testDir, "main repo");
		const linked = join(testDir, "linked tree");
		await mkdir(main);
		initGitRepo(main, "trunk");
		await $`git -c user.name=Test -c user.email=test@example.com commit --allow-empty -m initial`.cwd(main).quiet();
		await $`git worktree add -b feature ${linked}`.cwd(main).quiet();
		expect(await findGitWorktreeRoot(linked)).toBe(linked);
		expect(await resolveMainWorktreeRoot(linked)).toBe(main);
		expect(await resolveMainWorktreeRoot(join(linked, "."))).toBe(main);
		const alias = join(testDir, "linked alias");
		await symlink(linked, alias, "dir");
		expect(await resolveMainWorktreeRoot(alias)).toBe(main);
	});

	it("does not redirect separate-git-dir or submodule checkouts", async () => {
		const separate = join(testDir, "separate");
		await mkdir(separate);
		await $`git init --separate-git-dir ${join(testDir, "git-storage")} ${separate}`.quiet();
		expect(await resolveMainWorktreeRoot(separate)).toBeNull();
		const parent = join(testDir, "parent");
		const source = join(testDir, "source");
		await mkdir(parent);
		await mkdir(source);
		initGitRepo(parent);
		initGitRepo(source);
		await $`git -c user.name=Test -c user.email=test@example.com commit --allow-empty -m initial`.cwd(source).quiet();
		await $`git -c protocol.file.allow=always submodule add ${source} child`.cwd(parent).quiet();
		expect(await resolveMainWorktreeRoot(join(parent, "child"))).toBeNull();
	});

	it("fails soft for missing and malformed git entries", async () => {
		expect(await findGitWorktreeRoot(testDir)).toBeNull();
		expect(await resolveMainWorktreeRoot(join(testDir, "missing"))).toBeNull();
		await writeFile(join(testDir, ".git"), "not a git file\n");
		expect(await resolveMainWorktreeRoot(testDir)).toBeNull();
		await writeFile(join(testDir, ".git"), `gitdir: ${join(testDir, "missing")}\n`);
		expect(await resolveMainWorktreeRoot(testDir)).toBeNull();
	});

	it("does not redirect linked worktrees whose main repository is bare", async () => {
		const source = join(testDir, "source");
		const bare = join(testDir, "bare");
		const linked = join(testDir, "linked");
		await mkdir(source);
		initGitRepo(source);
		await $`git -c user.name=Test -c user.email=test@example.com commit --allow-empty -m initial`.cwd(source).quiet();
		await $`git clone --bare ${source} ${bare}`.quiet();
		await $`git worktree add --detach ${linked} HEAD`.cwd(bare).quiet();
		expect(await resolveMainWorktreeRoot(linked)).toBeNull();
	});
});
