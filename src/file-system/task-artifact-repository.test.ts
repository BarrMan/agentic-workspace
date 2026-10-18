import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
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
		"---\ntask_schema_version: 3\nid: BACK-23\ntitle: Artifacts\nstatus: To Do\nassignee: []\ncreated_date: 2025-01-01\nlabels: []\ndependencies: []\n---\n";
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
	it("validates relative paths and rejects reserved metadata", () => {
		for (const path of ["../x", "/tmp/x", "task.md", ".artifacts.json", "a//b", "a\\b", "C:/x"])
			expect(() => validateTaskArtifactPath(path)).toThrow();
		expect(validateTaskArtifactPath("notes/plan.md")).toBe("notes/plan.md");
	});

	it("stores lazy artifacts and content-bound approval without changing task.md", async () => {
		const { service, agenticWorkspaceDirectory, taskContent } = await repository();
		expect(await service.status("BACK-23", "plan.md")).toEqual({ path: "plan.md", state: "missing" });
		expect(
			await Bun.file(join(agenticWorkspaceDirectory, "tasks", "back-23", "artifacts", ".artifacts.json")).exists(),
		).toBe(false);
		const bytes = new TextEncoder().encode("Plan\n");
		const draft = await service.write("BACK-23", "nested/plan.md", bytes);
		expect(draft.state).toBe("draft");
		const { status } = await service.read("BACK-23", "nested/plan.md");
		const reviewedHash = status.sha256;
		if (!reviewedHash) throw new Error("Expected content hash");
		const approved = await service.approveCurrentVersion("BACK-23", "nested/plan.md", reviewedHash);
		expect(approved.state).toBe("approved");
		expect((await service.write("BACK-23", "nested/plan.md", bytes)).state).toBe("approved");
		expect((await service.write("BACK-23", "nested/plan.md", new TextEncoder().encode("Plan!\n"))).state).toBe("draft");
		expect(await readFile(join(agenticWorkspaceDirectory, "tasks", "back-23", "task.md"), "utf8")).toBe(taskContent);
	});

	it("refuses approval of changed content and detects external same-size edits", async () => {
		const { service, agenticWorkspaceDirectory } = await repository();
		await service.write("back-23", "plan.md", new TextEncoder().encode("one"));
		const reviewed = await service.status("back-23", "plan.md");
		await service.write("back-23", "plan.md", new TextEncoder().encode("two"));
		const reviewedHash = reviewed.sha256;
		if (!reviewedHash) throw new Error("Expected content hash");
		await expect(service.approveCurrentVersion("back-23", "plan.md", reviewedHash)).rejects.toThrow(/changed since/);
		const path = join(agenticWorkspaceDirectory, "tasks", "back-23", "artifacts", "plan.md");
		const before = await (await import("node:fs/promises")).stat(path);
		await writeFile(path, "six");
		await utimes(path, before.atime, before.mtime);
		expect((await service.status("back-23", "plan.md")).state).toBe("draft");
	});

	it("preserves approvals for other artifacts and excludes internal files from listing", async () => {
		const { service } = await repository();
		for (const name of ["a.md", "b.md"]) {
			await service.write("back-23", name, new TextEncoder().encode(name));
			const status = await service.status("back-23", name);
			if (!status.sha256) throw new Error("Expected content hash");
			await service.approveCurrentVersion("back-23", name, status.sha256);
		}
		await service.revokeApproval("back-23", "a.md");
		expect((await service.status("back-23", "a.md")).state).toBe("draft");
		expect((await service.status("back-23", "b.md")).state).toBe("approved");
		expect((await service.list("back-23")).map(({ path }) => path)).toEqual(["a.md", "b.md"]);
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
		expect(await service.status("back-23", "root-file.md")).toEqual({ path: "root-file.md", state: "missing" });
		expect(await service.resolve("back-23", "notes.md")).toBe(join(container, "artifacts", "notes.md"));
		expect(await readFile(join(container, "root-file.md"), "utf8")).toBe("preserved");
	});
});
