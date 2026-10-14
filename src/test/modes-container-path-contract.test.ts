import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { TaskArtifactRepository, validateTaskArtifactPath } from "../file-system/task-artifact-repository.ts";
import { serializeTask } from "../markdown/serializer.ts";
import type { Task } from "../types/index.ts";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture(prefix: string) {
	const root = await mkdtemp(join(tmpdir(), `${prefix}-`));
	roots.push(root);
	return root;
}

function task(id: string, title: string): Task {
	return {
		id,
		title,
		status: "To Do",
		assignee: [],
		createdDate: "2026-10-10",
		labels: [],
		dependencies: [],
	};
}

describe("BACK-23 canonical task container and artifact path contract", () => {
	it("uses lowercase task identity for the container and keeps it stable across title edits", async () => {
		const agenticWorkspaceDirectory = join(await fixture("mode-container-identity"), ".agentic-workspace");
		const container = join(agenticWorkspaceDirectory, "tasks", "back-23");
		await mkdir(container, { recursive: true });
		const record = join(container, "task.md");
		await writeFile(record, serializeTask(task("BACK-23", "Before rename")));
		const repository = new TaskArtifactRepository({ agenticWorkspaceDirectory });
		expect(await repository.containerPath("bAcK-23")).toBe(container);
		await writeFile(record, serializeTask(task("BACK-23", "After rename")));
		expect(await repository.containerPath("BACK-23")).toBe(container);
	});

	it("resolves artifact paths from a linked worktree to canonical main storage", async () => {
		const root = await fixture("mode-container-linked");
		const main = join(root, "main");
		const linked = join(root, "linked");
		await mkdir(main);
		await $`git init -b trunk`.cwd(main).quiet();
		await $`git -c user.name=Test -c user.email=test@example.com commit --allow-empty -m initial`.cwd(main).quiet();
		await $`git worktree add -b feature ${linked}`.cwd(main).quiet();
		const canonicalContainer = join(await realpath(main), ".agentic-workspace", "tasks", "back-23");
		await mkdir(canonicalContainer, { recursive: true });
		await writeFile(join(canonicalContainer, "task.md"), serializeTask(task("BACK-23", "Canonical")));
		const repository = new TaskArtifactRepository({
			projectRoot: linked,
			agenticWorkspaceDirectory: join(linked, ".agentic-workspace"),
		});
		const artifact = await repository.resolve("BACK-23", "notes/plan.md");
		expect(artifact).toBe(join(canonicalContainer, "notes", "plan.md"));
		await repository.write("BACK-23", "notes/plan.md", new TextEncoder().encode("canonical"));
		expect(await readFile(artifact, "utf8")).toBe("canonical");
		expect(await Bun.file(join(linked, ".agentic-workspace", "tasks", "back-23", "notes", "plan.md")).exists()).toBe(
			false,
		);
	});

	it("rejects unsafe paths and refuses symlink escapes", async () => {
		for (const path of ["../outside", "/outside", "a//b", "a\\b", "task.md", ".artifacts.json"])
			expect(() => validateTaskArtifactPath(path)).toThrow();
		const root = await fixture("mode-container-symlink");
		const agenticWorkspaceDirectory = join(root, ".agentic-workspace");
		const container = join(agenticWorkspaceDirectory, "tasks", "back-23");
		const outside = join(root, "outside");
		await mkdir(container, { recursive: true });
		await mkdir(outside);
		await writeFile(join(container, "task.md"), serializeTask(task("BACK-23", "Contained")));
		await symlink(outside, join(container, "escape"));
		const repository = new TaskArtifactRepository({ agenticWorkspaceDirectory });
		await expect(repository.write("BACK-23", "escape/file.md", new Uint8Array([1]))).rejects.toThrow(/outside/);
		expect(await Bun.file(join(outside, "file.md")).exists()).toBe(false);
	});

	it("does not create files or directories when reading a missing artifact", async () => {
		const agenticWorkspaceDirectory = join(await fixture("mode-container-read"), ".agentic-workspace");
		const container = join(agenticWorkspaceDirectory, "tasks", "back-23");
		await mkdir(container, { recursive: true });
		await writeFile(join(container, "task.md"), serializeTask(task("BACK-23", "Existing task")));
		const repository = new TaskArtifactRepository({ agenticWorkspaceDirectory });
		await expect(repository.status("BACK-23", "optional/spec.md")).resolves.toEqual({
			path: "optional/spec.md",
			state: "missing",
		});
		expect(await Bun.file(join(container, "task.md")).exists()).toBe(true);
		expect(await Bun.file(join(container, ".artifacts.json")).exists()).toBe(false);
		expect(await Bun.file(join(container, "optional")).exists()).toBe(false);
	});
});
