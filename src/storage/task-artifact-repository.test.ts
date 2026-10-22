import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createUniqueTestDir, safeCleanup } from "../test/test-utils.ts";
import { TaskArtifactRepository, validateTaskArtifactPath } from "./task-artifact-repository.ts";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await safeCleanup(root);
});

async function repository() {
	const root = await createUniqueTestDir("task-artifacts");
	roots.push(root);
	const agenticWorkspaceDirectory = join(root, ".agentic-workspace");
	const taskContent =
		"---\ntask_schema_version: 3\nid: BACK-23\ntitle: Artifacts\nstatus: To Do\ncreated_date: 2025-01-01\nlabels: []\ndependencies: []\n---\n";
	await mkdir(join(agenticWorkspaceDirectory, "tasks", "back-23"), { recursive: true });
	await writeFile(join(agenticWorkspaceDirectory, "tasks", "back-23", "task.md"), taskContent);
	await mkdir(join(agenticWorkspaceDirectory, "tasks", "back-23", "artifacts"));
	return {
		root,
		agenticWorkspaceDirectory,
		taskContent,
		service: new TaskArtifactRepository({ agenticWorkspaceDirectory }),
	};
}

describe("TaskArtifactRepository", () => {
	it("validates relative paths and protects internal temporary files", () => {
		for (const path of [
			"../x",
			"/tmp/x",
			".agentic-workspace-artifact-temp",
			"nested/.agentic-workspace-artifact-temp",
			"a//b",
			"a\\b",
			"C:/x",
		])
			expect(() => validateTaskArtifactPath(path)).toThrow();
		expect(validateTaskArtifactPath("notes/plan.md")).toBe("notes/plan.md");
	});

	it("round-trips arbitrary user filenames in the isolated artifact namespace", async () => {
		const { service, agenticWorkspaceDirectory, taskContent } = await repository();
		const paths = [
			"task.md",
			".artifacts.json",
			".artifacts.json.lock",
			".task-notes",
			"nested/task.md",
			"nested/.artifacts.json",
			".agentic-workspace-artifacts-notes",
		];
		for (const path of paths) {
			const bytes = new TextEncoder().encode(path);
			await service.write("BACK-23", path, bytes);
			expect(await service.read("BACK-23", path)).toEqual(bytes);
		}
		expect((await service.list("BACK-23")).map(({ path }) => path).sort()).toEqual(paths.sort());
		expect(await readFile(join(agenticWorkspaceDirectory, "tasks", "back-23", "task.md"), "utf8")).toBe(taskContent);
	});

	it("stores and reads generic artifacts without changing task.md", async () => {
		const { service, agenticWorkspaceDirectory, taskContent } = await repository();
		const bytes = new TextEncoder().encode("Plan\n");
		await service.write("BACK-23", "nested/plan.md", bytes);
		expect(await service.read("BACK-23", "nested/plan.md")).toEqual(bytes);
		expect(await service.list("BACK-23")).toEqual([{ path: "nested/plan.md", size: bytes.byteLength, type: "text" }]);
		const artifacts = join(agenticWorkspaceDirectory, "tasks", "back-23", "artifacts");
		expect(await Bun.file(join(artifacts, ".artifacts.json")).exists()).toBe(false);
		expect(await Bun.file(join(artifacts, ".artifacts.json.lock")).exists()).toBe(false);
		expect(await readFile(join(agenticWorkspaceDirectory, "tasks", "back-23", "task.md"), "utf8")).toBe(taskContent);
	});

	it("contains artifacts in the artifacts directory and rejects symlink escapes", async () => {
		const { service, agenticWorkspaceDirectory } = await repository();
		const container = join(agenticWorkspaceDirectory, "tasks", "back-23");
		const outside = join(container, "outside.md");
		await writeFile(outside, "preserved outside artifact");
		expect(await service.list("back-23")).toEqual([]);
		await symlink(outside, join(container, "artifacts", "escape.md"));
		await expect(service.read("back-23", "escape.md")).rejects.toThrow();
		await expect(service.write("back-23", "escape.md", new TextEncoder().encode("bad"))).rejects.toThrow();
		expect(await readFile(outside, "utf8")).toBe("preserved outside artifact");
	});

	it("rejects a symlinked artifacts directory", async () => {
		const { service, agenticWorkspaceDirectory } = await repository();
		const container = join(agenticWorkspaceDirectory, "tasks", "back-23");
		const outside = join(agenticWorkspaceDirectory, "outside");
		await mkdir(outside);
		await rm(join(container, "artifacts"), { recursive: true });
		await symlink(outside, join(container, "artifacts"));
		await expect(service.resolve("back-23", "notes.md")).rejects.toThrow(/real directory/);
		await expect(service.list("back-23")).rejects.toThrow(/real directory/);
	});

	it("handles a missing artifacts directory without reading container-root files", async () => {
		const { service, agenticWorkspaceDirectory } = await repository();
		const container = join(agenticWorkspaceDirectory, "tasks", "back-23");
		await writeFile(join(container, "root-file.md"), "preserved");
		await rm(join(container, "artifacts"), { recursive: true });
		expect(await service.list("back-23")).toEqual([]);
		await expect(service.read("back-23", "root-file.md")).rejects.toThrow();
		expect(await service.resolve("back-23", "notes.md")).toBe(join(container, "artifacts", "notes.md"));
		expect(await readFile(join(container, "root-file.md"), "utf8")).toBe("preserved");
	});
});
