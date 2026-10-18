import { afterEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionStore } from "../agent-workspace/session-store.ts";
import type { AgentSession } from "../agent-workspace/types.ts";
import { Core } from "../core/agentic-workspace.ts";
import { initializeTestProject } from "./test-utils.ts";

const roots: string[] = [];
afterEach(async () => await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

class NoProcess {
	async run() {
		return { exitCode: 0, stdout: "", stderr: "" };
	}
}

function session(taskId: string, _modeId: string, id: string, outputPath: string, cwd: string): AgentSession {
	const now = "2026-10-10T00:00:00.000Z";
	return {
		id,
		taskId,
		preset: "contract",
		tmuxName: `contract-${id}`,
		cwd,
		createdAt: now,
		lastUsedAt: now,
		status: "stopped",
		nativeSessionId: randomUUID(),
		outputPath,
		bootstrapPath: join(cwd, `${id}.md`),
		pathContext: { projectDir: process.cwd(), worktreeDir: cwd, taskDir: cwd },
	};
}

describe("MAIN task runtime identity remap contract", () => {
	it("treats key-equal remaps as no-ops and preserves the requested target spelling", async () => {
		const root = await mkdtemp(join(tmpdir(), "task-runtime-identity-key-remap-"));
		roots.push(root);
		const store = new SessionStore(root, new NoProcess());
		const sourceId = "draft-lowercase";
		await store.mutateMode(sourceId, "plan", async (history) => {
			const record = session(sourceId, "plan", "draft-session", join(root, "draft.log"), root);
			history.sessions.push(record);
			history.activeSessionId = record.id;
		});
		const sourcePaths = await store.paths(sourceId);
		const before = await readFile(sourcePaths.statePath, "utf8");

		await store.remapTaskIdentity(sourceId, " DRAFT-LOWERCASE ");
		expect(await readFile(sourcePaths.statePath, "utf8")).toBe(before);
		expect((await store.read("DRAFT-LOWERCASE")).taskId).toBe(sourceId);

		await store.remapTaskIdentity(sourceId, "TASK-UPPERCASE");
		const remapped = await store.read("TASK-UPPERCASE");
		expect(remapped.taskId).toBe("TASK-UPPERCASE");
		expect(remapped.modes.plan?.sessions[0]?.taskId).toBe("TASK-UPPERCASE");
		expect(await Bun.file(sourcePaths.statePath).exists()).toBe(false);
	});

	it("preserves mode histories and their runtime references through draft promotion and demotion", async () => {
		const root = await mkdtemp(join(tmpdir(), "task-runtime-identity-remap-"));
		roots.push(root);
		const core = new Core(root);
		await initializeTestProject(core, "Runtime remap contract");
		const { task: draft } = await core.createTaskFromInput({ title: "Remap me", status: "Draft", rawContent: "draft" });
		const store = new SessionStore(root, new NoProcess());
		const runtimeDir = (await store.paths(draft.id)).taskDir;
		const outputPath = join(runtimeDir, "session.log");
		const bootstrapPath = join(runtimeDir, "session.md");
		await Bun.write(outputPath, "actual session output\n");
		await Bun.write(bootstrapPath, "actual bootstrap\n");
		const plan = session(draft.id, "plan", randomUUID(), outputPath, runtimeDir);
		plan.bootstrapPath = bootstrapPath;
		const build = session(draft.id, "build", randomUUID(), outputPath, runtimeDir);
		build.bootstrapPath = bootstrapPath;
		await store.mutateMode(draft.id, "plan", async (history) => {
			history.sessions.push(plan);
			history.activeSessionId = plan.id;
		});
		await store.mutateMode(draft.id, "build", async (history) => {
			history.sessions.push(build);
			history.activeSessionId = build.id;
		});
		const originalPlan = structuredClone(plan);
		const originalBuild = structuredClone(build);
		await core.promoteDraft(draft.id);
		const promoted = (await core.filesystem.listTasks()).find(({ title }) => title === "Remap me");
		expect(promoted).toBeDefined();
		if (!promoted) return;
		expect(promoted.id).not.toBe(draft.id);
		let migrated = await store.read(promoted.id);
		const promotedModes = migrated.modes;
		if (!promotedModes) throw new Error("Promoted mode histories are missing");
		const promotedPlan = promotedModes.plan;
		const promotedBuild = promotedModes.build;
		if (!promotedPlan?.sessions[0] || !promotedBuild?.sessions[0])
			throw new Error("Promoted mode histories are incomplete");
		expect(promotedPlan.sessions).toEqual([{ ...originalPlan, taskId: promoted.id }]);
		expect(promotedBuild.sessions).toEqual([{ ...originalBuild, taskId: promoted.id }]);
		expect(promotedPlan.activeSessionId).toBe(plan.id);
		expect(promotedBuild.activeSessionId).toBe(build.id);
		expect(promotedPlan.sessions[0]).toMatchObject({ cwd: runtimeDir, outputPath, bootstrapPath });
		expect(promotedBuild.sessions[0]).toMatchObject({ cwd: runtimeDir, outputPath, bootstrapPath });
		expect(await readFile(outputPath, "utf8")).toBe("actual session output\n");
		expect(await readFile(bootstrapPath, "utf8")).toBe("actual bootstrap\n");
		expect(Object.values((await store.read(draft.id)).modes).flatMap(({ sessions }) => sessions)).toEqual([]);

		await core.demoteTask(promoted.id);
		const demoted = (await core.filesystem.listDrafts()).find(({ title }) => title === "Remap me");
		expect(demoted).toBeDefined();
		if (!demoted) return;
		migrated = await store.read(demoted.id);
		const demotedModes = migrated.modes;
		if (!demotedModes) throw new Error("Demoted mode histories are missing");
		const demotedPlan = demotedModes.plan;
		const demotedBuild = demotedModes.build;
		if (!demotedPlan?.sessions[0] || !demotedBuild?.sessions[0])
			throw new Error("Demoted mode histories are incomplete");
		expect(demotedPlan.sessions).toEqual([{ ...originalPlan, taskId: migrated.taskId }]);
		expect(demotedBuild.sessions).toEqual([{ ...originalBuild, taskId: migrated.taskId }]);
		expect(demotedPlan.activeSessionId).toBe(plan.id);
		expect(demotedBuild.activeSessionId).toBe(build.id);
		expect(demotedPlan.sessions[0]).toMatchObject({ cwd: runtimeDir, outputPath, bootstrapPath });
		expect(demotedBuild.sessions[0]).toMatchObject({ cwd: runtimeDir, outputPath, bootstrapPath });
		expect(await readFile(outputPath, "utf8")).toBe("actual session output\n");
		expect(await readFile(bootstrapPath, "utf8")).toBe("actual bootstrap\n");
	});

	it("does not create absent runtime state and refuses collisions or v1 state without changing either", async () => {
		const root = await mkdtemp(join(tmpdir(), "task-runtime-identity-remap-"));
		roots.push(root);
		const store = new SessionStore(root, new NoProcess());
		await store.remapTaskIdentity("TASK-ABSENT", "DRAFT-ABSENT");
		await expect(store.paths("DRAFT-ABSENT").then(({ taskDir }) => Bun.file(taskDir).exists())).resolves.toBe(false);

		await store.mutateMode("TASK-SOURCE", "plan", async (history) => {
			history.sessions.push(session("TASK-SOURCE", "plan", randomUUID(), join(root, "source.log"), root));
			history.activeSessionId = history.sessions.at(-1)?.id;
		});
		await store.mutateMode("TASK-TARGET", "build", async (history) => {
			history.sessions.push(session("TASK-TARGET", "build", randomUUID(), join(root, "target.log"), root));
			history.activeSessionId = history.sessions.at(-1)?.id;
		});
		const sourceBefore = await store.read("TASK-SOURCE");
		const targetBefore = await store.read("TASK-TARGET");
		await expect(store.remapTaskIdentity("TASK-SOURCE", "TASK-TARGET")).rejects.toThrow(/refusing to merge/i);
		expect(await store.read("TASK-SOURCE")).toEqual(sourceBefore);
		expect(await store.read("TASK-TARGET")).toEqual(targetBefore);

		const sourcePaths = await store.paths("TASK-V1");
		await Bun.write(sourcePaths.statePath, JSON.stringify({ version: 1, taskId: "TASK-V1", sessions: [] }));
		const beforeV1 = await readFile(sourcePaths.statePath, "utf8");
		await expect(store.remapTaskIdentity("TASK-V1", "DRAFT-V1")).rejects.toThrow(/valid version 2 state/i);
		expect(await readFile(sourcePaths.statePath, "utf8")).toBe(beforeV1);
	});

	it("retries an exact installed destination after remap-phase failures without losing source or sidecars", async () => {
		for (const phase of ["after-link", "verification", "source-unlink"] as const) {
			const root = await mkdtemp(join(tmpdir(), `task-runtime-remap-${phase}-`));
			roots.push(root);
			const store = new SessionStore(root, new NoProcess());
			const source = session("TASK-SOURCE", "plan", randomUUID(), join(root, "runtime.log"), root);
			await store.mutateMode("TASK-SOURCE", "plan", async (history) => {
				history.sessions.push(source);
				history.activeSessionId = source.id;
			});
			await Bun.write(source.outputPath, "sidecar bytes\n");
			const oldPaths = await store.paths("TASK-SOURCE");
			const newPaths = await store.paths("TASK-TARGET");
			type Internals = {
				installAndVerifyRemappedState(path: string, content: string, taskId: string): Promise<void>;
				verifyRemappedState(path: string, content: string, taskId: string): Promise<void>;
				unlinkRemappedSource(path: string): Promise<void>;
			};
			const internals = store as unknown as Internals;
			let injected = false;
			if (phase === "after-link") {
				const original = internals.installAndVerifyRemappedState.bind(store);
				internals.installAndVerifyRemappedState = async (...args) => {
					await original(...args);
					if (!injected) {
						injected = true;
						throw new Error("injected post-install failure");
					}
				};
			} else if (phase === "verification") {
				const original = internals.verifyRemappedState.bind(store);
				internals.verifyRemappedState = async (...args) => {
					if (!injected) {
						injected = true;
						throw new Error("injected verification failure");
					}
					await original(...args);
				};
			} else {
				const original = internals.unlinkRemappedSource.bind(store);
				internals.unlinkRemappedSource = async (path) => {
					if (!injected) {
						injected = true;
						throw new Error("injected source unlink failure");
					}
					await original(path);
				};
			}
			await expect(store.remapTaskIdentity("TASK-SOURCE", "TASK-TARGET")).rejects.toThrow(/injected/);
			expect(await Bun.file(oldPaths.statePath).exists()).toBe(true);
			expect(await Bun.file(newPaths.statePath).exists()).toBe(true);
			await expect(store.remapTaskIdentity("TASK-SOURCE", "TASK-TARGET")).resolves.toBeUndefined();
			expect(await Bun.file(oldPaths.statePath).exists()).toBe(false);
			expect((await store.read("TASK-TARGET")).modes?.plan?.sessions[0]?.taskId).toBe("TASK-TARGET");
			expect(await readFile(source.outputPath, "utf8")).toBe("sidecar bytes\n");
		}
	});

	it("attempts every acquired remap lock release when one release rejects", async () => {
		const root = await mkdtemp(join(tmpdir(), "task-runtime-remap-release-"));
		roots.push(root);
		const store = new SessionStore(root, new NoProcess());
		await store.mutateMode("TASK-SOURCE", "plan", async (history) => {
			const source = session("TASK-SOURCE", "plan", randomUUID(), join(root, "runtime.log"), root);
			history.sessions.push(source);
			history.activeSessionId = source.id;
		});
		type Internals = { acquireRemapLock(path: string): Promise<() => Promise<void>> };
		const internals = store as unknown as Internals;
		const original = internals.acquireRemapLock.bind(store);
		let releaseCount = 0;
		let rejectOnce = true;
		internals.acquireRemapLock = async (path) => {
			const release = await original(path);
			return async () => {
				releaseCount += 1;
				await release();
				if (rejectOnce) {
					rejectOnce = false;
					throw new Error("injected release rejection");
				}
			};
		};
		await expect(store.remapTaskIdentity("TASK-SOURCE", "TASK-TARGET")).rejects.toThrow(/releasing locks/);
		expect(releaseCount).toBe(2);
		await expect(store.remapTaskIdentity("TASK-SOURCE", "TASK-TARGET")).resolves.toBeUndefined();
	});
});
