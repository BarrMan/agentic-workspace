import { afterEach, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanupPreparedLaunchResources, preparedLaunchResources } from "./completion-supervisor-resources.ts";

describe("serializable prepared resource ownership", () => {
	const roots: string[] = [];
	afterEach(async () => {
		await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
	});
	async function fixture() {
		const root = await mkdtemp(join(tmpdir(), "completion-resource-project-"));
		const skill = await mkdtemp(join(tmpdir(), "backlog-agent-skill-"));
		roots.push(root, skill);
		const activity = join(root, "one.activity");
		await mkdir(activity);
		const outputPath = join(root, "one.log");
		await writeFile(outputPath, "user output");
		await writeFile(join(root, "one.md"), "user bootstrap");
		const resources = await preparedLaunchResources(skill, activity);
		return { root, skill, activity, resources, context: { rootPath: root, outputPath, sessionId: "one" } };
	}
	it("removes only verified preparation resources and tolerates shell-trap-cleaned paths", async () => {
		const f = await fixture();
		await cleanupPreparedLaunchResources(f.resources, f.context, true);
		expect(existsSync(f.skill)).toBe(true);
		await cleanupPreparedLaunchResources(f.resources, f.context);
		expect(existsSync(f.skill)).toBe(false);
		expect(existsSync(f.activity)).toBe(false);
		expect(await readFile(f.context.outputPath, "utf8")).toBe("user output");
		expect(await readFile(join(f.root, "one.md"), "utf8")).toBe("user bootstrap");
		await cleanupPreparedLaunchResources(f.resources, f.context);
	});
	it("refuses replacement or symlink resources before deleting any directory", async () => {
		const f = await fixture();
		const original = join(f.root, "original-activity");
		await rename(f.activity, original);
		await mkdir(f.activity);
		await writeFile(join(f.activity, "user-data"), "keep");
		await expect(cleanupPreparedLaunchResources(f.resources, f.context)).rejects.toThrow("identity changed");
		expect(existsSync(f.skill)).toBe(true);
		expect(await readFile(join(f.activity, "user-data"), "utf8")).toBe("keep");
		await rm(f.activity, { recursive: true });
		await symlink(original, f.activity);
		await expect(cleanupPreparedLaunchResources(f.resources, f.context)).rejects.toThrow("identity changed");
		expect(existsSync(f.skill)).toBe(true);
		expect(existsSync(original)).toBe(true);
	});
	it("rejects marker replacement, UID mismatch and escaping containment", async () => {
		const f = await fixture();
		await expect(
			cleanupPreparedLaunchResources(
				{ ...f.resources, skill: { ...f.resources.skill, uid: f.resources.skill.uid + 1 } },
				f.context,
			),
		).rejects.toThrow("identity changed");
		await expect(cleanupPreparedLaunchResources(f.resources, { ...f.context, sessionId: "../one" })).rejects.toThrow(
			"session identity",
		);
		await expect(
			cleanupPreparedLaunchResources({ ...f.resources, skill: { ...f.resources.skill, path: f.root } }, f.context),
		).rejects.toThrow("containment");
		await writeFile(join(f.activity, ".backlog-launch-owner"), "replacement");
		await expect(cleanupPreparedLaunchResources(f.resources, f.context)).rejects.toThrow("marker changed");
		expect(existsSync(f.skill)).toBe(true);
	});
	it("validates external state resources against the pinned state root instead of execution/project cwd", async () => {
		const f = await fixture();
		const project = await mkdtemp(join(tmpdir(), "completion-resource-canonical-"));
		roots.push(project);
		await expect(
			cleanupPreparedLaunchResources(f.resources, { ...f.context, rootPath: project }, true),
		).rejects.toThrow("escapes project");
		await cleanupPreparedLaunchResources(f.resources, { ...f.context, rootPath: project, stateRoot: f.root });
		expect(existsSync(f.skill)).toBe(false);
		expect(existsSync(f.activity)).toBe(false);
		expect(await readFile(f.context.outputPath, "utf8")).toBe("user output");
	});

	it("retains ownership marker across partial content deletion and retries from a fresh caller", async () => {
		const f = await fixture();
		const marker = await readFile(join(f.skill, ".backlog-launch-owner"), "utf8");
		const identity = await lstat(f.skill);
		const blocked = join(f.skill, "blocked");
		await writeFile(join(f.skill, "first"), "remove first");
		await mkdir(blocked);
		await writeFile(join(blocked, "file"), "blocked until retry");
		await chmod(blocked, 0o500);
		try {
			await expect(cleanupPreparedLaunchResources(f.resources, f.context)).rejects.toThrow();
			expect(await readFile(join(f.skill, ".backlog-launch-owner"), "utf8")).toBe(marker);
			expect(await lstat(f.skill)).toMatchObject({ dev: identity.dev, ino: identity.ino });
			expect(existsSync(join(f.skill, "first"))).toBe(false);
			await chmod(blocked, 0o700);
			await cleanupPreparedLaunchResources(f.resources, f.context);
			expect(existsSync(f.skill)).toBe(false);
		} finally {
			await chmod(blocked, 0o700).catch(() => {});
		}
	});
});
