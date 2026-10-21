import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import type { Task } from "../model/types.ts";
import { serializeTask } from "../storage/markdown/serializer.ts";
import { TaskArtifactRepository, validateTaskArtifactPath } from "../storage/task-artifact-repository.ts";

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
		expect(await repository.containerPath(" back-23 ")).toBe(container);
		expect(await repository.containerPath(" BaCk-23 ")).toBe(container);
		await writeFile(record, serializeTask(task("BACK-23", "After rename")));
		expect(await repository.containerPath("BACK-23")).toBe(container);
	});

	it("keeps zero-padded task numbers distinct", async () => {
		const agenticWorkspaceDirectory = join(await fixture("mode-container-zero-identity"), ".agentic-workspace");
		const padded = join(agenticWorkspaceDirectory, "tasks", "task-01");
		await mkdir(padded, { recursive: true });
		await writeFile(join(padded, "task.md"), serializeTask(task("TASK-01", "Padded")));
		const repository = new TaskArtifactRepository({ agenticWorkspaceDirectory });
		expect(await repository.containerPath(" task-01 ")).toBe(padded);
		expect(await repository.containerPath("TASK-1")).toBe(join(agenticWorkspaceDirectory, "tasks", "task-1"));
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
		expect(artifact).toBe(join(canonicalContainer, "artifacts", "notes", "plan.md"));
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
		const artifacts = join(container, "artifacts");
		await mkdir(artifacts);
		await symlink(outside, join(artifacts, "escape"));
		const repository = new TaskArtifactRepository({ agenticWorkspaceDirectory });
		await expect(repository.write("BACK-23", "escape/file.md", new Uint8Array([1]))).rejects.toThrow(/outside/);
		expect(await Bun.file(join(outside, "file.md")).exists()).toBe(false);

		const outsideFile = join(outside, "existing.md");
		await writeFile(outsideFile, "outside");
		await symlink(outsideFile, join(artifacts, "linked.md"));
		await expect(repository.resolve("BACK-23", "linked.md")).rejects.toThrow(/outside/);
	});

	it("does not create files or directories when reading a missing artifact", async () => {
		const agenticWorkspaceDirectory = join(await fixture("mode-container-read"), ".agentic-workspace");
		const container = join(agenticWorkspaceDirectory, "tasks", "back-23");
		await mkdir(container, { recursive: true });
		await writeFile(join(container, "task.md"), serializeTask(task("BACK-23", "Existing task")));
		const repository = new TaskArtifactRepository({ agenticWorkspaceDirectory });
		await expect(repository.read("BACK-23", "optional/spec.md")).rejects.toThrow();
		expect(await Bun.file(join(container, "task.md")).exists()).toBe(true);
		expect(await Bun.file(join(container, ".artifacts.json")).exists()).toBe(false);
		expect(await Bun.file(join(container, "optional")).exists()).toBe(false);
	});
});
