import { afterEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../../controller/agentic-workspace.ts";
import { getBuiltInAgentConfiguration, getDefaultModeCatalog, loadAgentConfiguration } from "../../storage/config.ts";
import { TaskArtifactRepository } from "../../storage/task-artifact-repository.ts";
import { coreFileSystem, createUniqueTestDir, initializeTestProject, safeCleanup } from "../test-utils.ts";

const roots: string[] = [];
const encoder = new TextEncoder();

afterEach(async () => {
	for (const root of roots.splice(0)) await safeCleanup(root);
});

describe("artifact approval key contract", () => {
	it("persists generic prototype-named artifacts as own records across restart, list, status, and revoke", async () => {
		const root = await createUniqueTestDir("artifact-approval-key-contract");
		roots.push(root);
		const agenticWorkspaceDirectory = join(root, ".agentic-workspace");
		const container = join(agenticWorkspaceDirectory, "tasks", "back-23");
		await mkdir(container, { recursive: true });
		await writeFile(
			join(container, "task.md"),
			"---\ntask_schema_version: 3\nid: BACK-23\ntitle: Artifact key contract\nstatus: To Do\nassignee: []\ncreated_date: 2026-10-10\nlabels: []\ndependencies: []\n---\n",
		);

		const paths = ["__proto__", "constructor", "toString"];
		const bytes = new Map(paths.map((path) => [path, encoder.encode(`exact bytes for ${path}\n`)]));
		const first = new TaskArtifactRepository({ agenticWorkspaceDirectory });
		for (const path of paths) await first.write("BACK-23", path, bytes.get(path)!);
		for (const path of paths) {
			const reviewed = await first.status("BACK-23", path);
			await first.approveCurrentVersion("BACK-23", path, reviewed.sha256!);
		}

		const second = new TaskArtifactRepository({ agenticWorkspaceDirectory });
		const listed = await second.list("BACK-23");
		expect(listed.map(({ path }) => path).sort()).toEqual([...paths].sort());
		for (const path of paths) {
			const status = await second.status("BACK-23", path);
			expect(status).toMatchObject({
				path,
				state: "approved",
				sha256: createHash("sha256").update(bytes.get(path)!).digest("hex"),
			});
			expect((await second.read("BACK-23", path)).bytes).toEqual(bytes.get(path)!);
		}

		const sidecarPath = join(container, "artifacts", ".artifacts.json");
		const sidecar = JSON.parse(await readFile(sidecarPath, "utf8"));
		for (const path of paths) expect(Object.hasOwn(sidecar.approvals, path)).toBe(true);
		expect(Object.getPrototypeOf(sidecar.approvals)).toBe(Object.prototype);
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();

		await second.revokeApproval("BACK-23", "__proto__");
		expect((await second.status("BACK-23", "__proto__")).state).toBe("draft");
		for (const path of paths.slice(1)) expect((await second.status("BACK-23", path)).state).toBe("approved");
		const afterRevoke = JSON.parse(await readFile(sidecarPath, "utf8"));
		expect(Object.hasOwn(afterRevoke.approvals, "__proto__")).toBe(false);
		for (const path of paths.slice(1)) expect(Object.hasOwn(afterRevoke.approvals, path)).toBe(true);
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});

	it("loads a profile with no artifact declarations and reads and writes undeclared artifacts", async () => {
		const root = await createUniqueTestDir("artifact-approval-key-contract-config");
		roots.push(root);
		const core = new Core(root);
		await coreFileSystem(core).ensureAgenticWorkspaceStructure();
		await initializeTestProject(core, "Optional artifact declarations");
		const configuration = getBuiltInAgentConfiguration();
		configuration.modes = getDefaultModeCatalog();
		const plan = configuration.modes.profiles.plan;
		if (!plan) throw new Error("Missing PLAN profile");
		plan.artifacts = [];
		await coreFileSystem(core).saveConfig({
			...(await coreFileSystem(core).loadConfig())!,
			agentConfiguration: configuration,
		});

		const loaded = await loadAgentConfiguration(core, "project");
		expect(loaded?.modes?.profiles.plan?.artifacts).toEqual([]);
		const { task } = await core.createTaskFromInput({ title: "Undeclared artifact", status: "To Do" });
		const repository = new TaskArtifactRepository({
			agenticWorkspaceDirectory: coreFileSystem(core).agenticWorkspaceDir,
		});
		const bytes = encoder.encode("artifact without a profile declaration\n");
		expect((await repository.write(task.id, "notes/result.md", bytes)).path).toBe("notes/result.md");
		expect((await repository.read(task.id, "notes/result.md")).bytes).toEqual(bytes);
		await expect(repository.write(task.id, "../outside.md", bytes)).rejects.toThrow("Invalid task artifact path");
	});
});
