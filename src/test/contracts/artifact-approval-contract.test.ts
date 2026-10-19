import { afterEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { TaskArtifactRepository } from "../../storage/task-artifact-repository.ts";
import { createUniqueTestDir, safeCleanup } from "../test-utils.ts";

const roots: string[] = [];
const encoder = new TextEncoder();

afterEach(async () => {
	for (const root of roots.splice(0)) await safeCleanup(root);
});

async function fixture() {
	const root = await createUniqueTestDir("artifact-approval-contract");
	roots.push(root);
	const agenticWorkspaceDirectory = join(root, ".agentic-workspace");
	const container = join(agenticWorkspaceDirectory, "tasks", "back-23");
	await mkdir(container, { recursive: true });
	const taskRecord = join(container, "task.md");
	await writeFile(
		taskRecord,
		"---\ntask_schema_version: 3\nid: BACK-23\ntitle: Artifact contract\nstatus: To Do\nassignee: []\ncreated_date: 2026-10-10\nlabels: []\ndependencies: []\n---\n\ntask record bytes\n",
	);
	return {
		container,
		taskRecord,
		sidecar: join(container, "artifacts", ".artifacts.json"),
		service: new TaskArtifactRepository({ agenticWorkspaceDirectory }),
	};
}

async function approve(service: TaskArtifactRepository, path: string) {
	const reviewed = await service.status("BACK-23", path);
	if (!reviewed.sha256) throw new Error("Expected an existing artifact fingerprint");
	return await service.approveCurrentVersion("BACK-23", path, reviewed.sha256);
}

describe("artifact approval behavior contract", () => {
	it("reports Draft and Missing while keeping sidecar and artifact storage lazy", async () => {
		const { container, sidecar, service } = await fixture();
		await mkdir(join(container, "artifacts"));
		await writeFile(join(container, "artifacts", "existing.md"), "existing bytes");
		expect(await service.status("BACK-23", "existing.md")).toMatchObject({ path: "existing.md", state: "draft" });
		expect(await service.status("BACK-23", "not-created.md")).toEqual({ path: "not-created.md", state: "missing" });
		expect(await service.read("BACK-23", "existing.md")).toMatchObject({ status: { state: "draft" } });
		expect(await service.list("BACK-23")).toHaveLength(1);
		expect(await Bun.file(sidecar).exists()).toBe(false);
		expect(await Bun.file(join(container, "artifacts", "not-created.md")).exists()).toBe(false);
	});

	it("approves only the reviewed exact-byte hash and refuses a changed unseen version", async () => {
		const { sidecar, service } = await fixture();
		const reviewedBytes = encoder.encode("reviewed\n");
		await service.write("BACK-23", "plan.md", reviewedBytes);
		const review = await service.read("BACK-23", "plan.md");
		const reviewedHash = createHash("sha256").update(reviewedBytes).digest("hex");
		expect(review.status.sha256).toBe(reviewedHash);
		await service.write("BACK-23", "plan.md", encoder.encode("new unseen\n"));
		await expect(service.approveCurrentVersion("BACK-23", "plan.md", reviewedHash)).rejects.toThrow(/changed since/);
		expect(await Bun.file(sidecar).exists()).toBe(false);
		await service.write("BACK-23", "plan.md", reviewedBytes);
		const approval = await service.approveCurrentVersion("BACK-23", "plan.md", reviewedHash);
		expect(approval).toMatchObject({ path: "plan.md", state: "approved", sha256: reviewedHash });
		const metadata = JSON.parse(await readFile(sidecar, "utf8"));
		expect(metadata).toMatchObject({ version: 1, approvals: { "plan.md": { sha256: reviewedHash } } });
		expect(Number.isFinite(Date.parse(metadata.approvals["plan.md"].approvedAt))).toBe(true);
	});

	it("invalidates an external same-size edit even when its modification time is restored", async () => {
		const { container, service } = await fixture();
		await service.write("BACK-23", "plan.md", encoder.encode("draft A"));
		await approve(service, "plan.md");
		const path = join(container, "artifacts", "plan.md");
		const previous = await stat(path);
		await writeFile(path, "draft B");
		await utimes(path, previous.atime, previous.mtime);
		expect((await service.status("BACK-23", "plan.md")).state).toBe("draft");
	});

	it("preserves approval on byte-identical writes and invalidates it on changed writes", async () => {
		const { service } = await fixture();
		const original = encoder.encode("approved content");
		await service.write("BACK-23", "plan.md", original);
		await approve(service, "plan.md");
		expect((await service.write("BACK-23", "plan.md", original)).state).toBe("approved");
		expect((await service.write("BACK-23", "plan.md", encoder.encode("changed content"))).state).toBe("draft");
	});

	it("merges concurrent approvals and revokes only the selected artifact", async () => {
		const { service, container } = await fixture();
		await Promise.all([
			service.write("BACK-23", "one.md", encoder.encode("one")),
			service.write("BACK-23", "two.md", encoder.encode("two")),
		]);
		await Promise.all([approve(service, "one.md"), approve(service, "two.md")]);
		expect((await service.status("BACK-23", "one.md")).state).toBe("approved");
		expect((await service.status("BACK-23", "two.md")).state).toBe("approved");
		const before = await Promise.all([
			readFile(join(container, "artifacts", "one.md")),
			readFile(join(container, "artifacts", "two.md")),
		]);
		expect((await service.revokeApproval("BACK-23", "one.md")).state).toBe("draft");
		expect((await service.status("BACK-23", "two.md")).state).toBe("approved");
		expect(await readFile(join(container, "artifacts", "one.md"))).toEqual(before[0]);
		expect(await readFile(join(container, "artifacts", "two.md"))).toEqual(before[1]);
	});

	it("surfaces malformed metadata without replacing or erasing it", async () => {
		const { sidecar, service } = await fixture();
		const plan = encoder.encode("plan");
		await service.write("BACK-23", "plan.md", plan);
		const reviewedHash = createHash("sha256").update(plan).digest("hex");
		const malformed = "{not valid approval metadata\n";
		await writeFile(sidecar, malformed);
		await expect(service.status("BACK-23", "plan.md")).rejects.toThrow(/approval metadata/);
		await expect(service.approveCurrentVersion("BACK-23", "plan.md", reviewedHash)).rejects.toThrow(
			/approval metadata/,
		);
		expect(await readFile(sidecar, "utf8")).toBe(malformed);
	});

	it("does not transfer approval after deletion or rename", async () => {
		const { container, service } = await fixture();
		await service.write("BACK-23", "original.md", encoder.encode("content"));
		await approve(service, "original.md");
		await rename(join(container, "artifacts", "original.md"), join(container, "artifacts", "renamed.md"));
		expect((await service.status("BACK-23", "original.md")).state).toBe("missing");
		expect((await service.status("BACK-23", "renamed.md")).state).toBe("draft");
		await service.write("BACK-23", "original.md", encoder.encode("content"));
		expect((await service.status("BACK-23", "original.md")).state).toBe("draft");
	});

	it("round-trips binary data without decoding and excludes its sidecar from artifact listings", async () => {
		const { service, container } = await fixture();
		const binary = new Uint8Array([0, 255, 195, 40, 1]);
		await service.write("BACK-23", "image.bin", binary);
		await approve(service, "image.bin");
		const read = await service.read("BACK-23", "image.bin");
		expect(read.bytes).toEqual(binary);
		expect(read.status.state).toBe("approved");
		const entries = await service.list("BACK-23");
		expect(entries).toEqual([expect.objectContaining({ path: "image.bin", type: "binary", state: "approved" })]);
		expect(entries.some(({ path }) => path === ".artifacts.json")).toBe(false);
		expect(await Bun.file(join(container, "artifacts", ".artifacts.json")).exists()).toBe(true);
	});

	it("leaves task record bytes and timestamp unchanged during artifact operations", async () => {
		const { taskRecord, service } = await fixture();
		const beforeBytes = await readFile(taskRecord);
		const before = await stat(taskRecord);
		await service.write("BACK-23", "plan.md", encoder.encode("plan"));
		await approve(service, "plan.md");
		await service.revokeApproval("BACK-23", "plan.md");
		const after = await stat(taskRecord);
		expect(await readFile(taskRecord)).toEqual(beforeBytes);
		expect(after.mtimeMs).toBe(before.mtimeMs);
	});
});
