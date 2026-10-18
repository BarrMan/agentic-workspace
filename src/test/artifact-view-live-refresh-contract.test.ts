import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BoxRenderable } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import type { Core } from "../core/agentic-workspace.ts";
import { TaskArtifactRepository } from "../file-system/task-artifact-repository.ts";
import { TaskArtifactView, type TaskArtifactViewApi } from "../ui/opentui/task-artifact-view.ts";
import { watchTasks } from "../utils/task-watcher.ts";
import { createUniqueTestDir, getPlatformTimeout, safeCleanup } from "./test-utils.ts";

const taskId = "BACK-23";
const roots: string[] = [];
const renderers: TestRendererSetup[] = [];

afterEach(async () => {
	for (const setup of renderers.splice(0)) setup.renderer.destroy();
	for (const root of roots.splice(0)) await safeCleanup(root);
});

describe("artifact viewer live-refresh contract", () => {
	it("reloads external same-size/same-mtime bytes and sidecar changes, then unsubscribes on close/dispose", async () => {
		const root = await createUniqueTestDir("artifact-view-live-refresh");
		roots.push(root);
		const agenticWorkspaceDir = join(root, ".agentic-workspace");
		const tasksDir = join(agenticWorkspaceDir, "tasks");
		const container = join(tasksDir, "back-23");
		await mkdir(container, { recursive: true });
		await writeFile(
			join(container, "task.md"),
			"---\ntask_schema_version: 3\nid: BACK-23\ntitle: Live refresh\nstatus: To Do\nassignee: []\ncreated_date: 2026-10-10\nlabels: []\ndependencies: []\n---\n\nTask body\n",
		);
		const artifactsDir = join(container, "artifacts");
		await mkdir(artifactsDir, { recursive: true });
		const artifactPath = join(artifactsDir, "plan.md");
		await writeFile(artifactPath, "draft v1\n");
		const repository = new TaskArtifactRepository({ agenticWorkspaceDirectory: agenticWorkspaceDir });
		const initial = await repository.status(taskId, "plan.md");
		await repository.approveCurrentVersion(taskId, "plan.md", initial.sha256!);

		const listeners = new Set<() => void>();
		const api: TaskArtifactViewApi = {
			list: (id) => repository.list(id),
			read: (id, path) => repository.read(id, path),
			approveCurrentVersion: (id, path, hash) => repository.approveCurrentVersion(id, path, hash),
			revokeApproval: (id, path) => repository.revokeApproval(id, path),
			subscribeArtifactChanges: (id, callback) => {
				expect(id).toBe(taskId);
				listeners.add(callback);
				return () => listeners.delete(callback);
			},
		};
		const watcher = watchTasks(
			{
				filesystem: { tasksDir, rootDir: root },
			} as Core,
			{
				onArtifactChanged: ({ taskId: changedTask }) => {
					if (changedTask.toLowerCase() === taskId.toLowerCase()) {
						for (const listener of [...listeners]) listener();
					}
				},
			},
		);
		const setup = await createTestRenderer({ width: 100, height: 32, kittyKeyboard: true });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const view = new TaskArtifactView({ renderer: setup.renderer, parent, api, taskId });
		const settle = async (predicate: () => boolean) => {
			// The watcher is a real fs.watch event driven by the OS; under 5-lane load its delivery
			// can lag well past the old 2s poll. Keep the poll, give it the suite's standard 15s.
			const attempts = Math.ceil(getPlatformTimeout(15_000) / 20);
			for (let attempt = 0; attempt < attempts; attempt++) {
				await Bun.sleep(20);
				await setup.flush();
				if (predicate()) return;
			}
			throw new Error("Timed out waiting for the filesystem watcher to refresh the artifact view");
		};
		try {
			await settle(() => setup.captureCharFrame().includes("draft v1"));
			expect(setup.captureCharFrame()).toContain("Approved");
			const before = await Bun.file(artifactPath).stat();
			await writeFile(artifactPath, "draft v2\n");
			await utimes(artifactPath, before.atime, before.mtime);
			await settle(() => setup.captureCharFrame().includes("draft v2") && setup.captureCharFrame().includes("Draft"));
			expect(setup.captureCharFrame()).not.toContain("Approved");

			const current = await repository.status(taskId, "plan.md");
			await repository.approveCurrentVersion(taskId, "plan.md", current.sha256!);
			for (const listener of [...listeners]) listener();
			await settle(() => setup.captureCharFrame().includes("Approved"));
			const sidecar = join(container, "artifacts", ".artifacts.json");
			const sidecarStat = await Bun.file(sidecar).stat();
			await repository.revokeApproval(taskId, "plan.md");
			await utimes(sidecar, sidecarStat.atime, sidecarStat.mtime);
			await settle(() => setup.captureCharFrame().includes("Draft"));

			view.setOpen(false);
			expect(listeners.size).toBe(0);
			await writeFile(artifactPath, "draft v3\n");
			await Bun.sleep(500);
			await setup.flush();
			expect(setup.captureCharFrame()).not.toContain("draft v3");
			view.setOpen(true);
			await settle(() => setup.captureCharFrame().includes("draft v3"));
			view.dispose();
			expect(listeners.size).toBe(0);
		} finally {
			view.dispose();
			watcher.stop();
		}
	});
});
