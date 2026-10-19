import { afterEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionStore } from "../agent-workspace/session-store.ts";
import type { AgentSession } from "../agent-workspace/types.ts";
import { Core } from "../core/agentic-workspace.ts";
import { coreFileSystem, initializeTestProject } from "./test-utils.ts";

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

function remappedSession(original: AgentSession, taskId: string, taskDir: string): AgentSession {
	return {
		...original,
		taskId,
		outputPath: join(taskDir, `${original.id}.log`),
		bootstrapPath: join(taskDir, `${original.id}.md`),
		pathContext: original.pathContext ? { ...original.pathContext, taskDir } : undefined,
	};
}

describe("MAIN task runtime identity remap contract", () => {
	it("treats key-equal remaps as no-ops and preserves the requested target spelling", async () => {
		const root = await mkdtemp(join(tmpdir(), "task-runtime-identity-key-remap-"));
		roots.push(root);
		const store = new SessionStore(root, new NoProcess());
		const sourceId = "draft-lowercase";
		const sourcePaths = await store.paths(sourceId);
		const outputPath = join(sourcePaths.taskDir, "draft-session.log");
		const bootstrapPath = join(sourcePaths.taskDir, "draft-session.md");
		await Bun.write(outputPath, "source output\n");
		await Bun.write(bootstrapPath, "source bootstrap\n");
		const original = session(sourceId, "plan", "draft-session", outputPath, sourcePaths.taskDir);
		original.bootstrapPath = bootstrapPath;
		await store.mutateMode(sourceId, "plan", async (history) => {
			history.sessions.push(original);
			history.activeSessionId = original.id;
		});
		const before = await readFile(sourcePaths.statePath, "utf8");

		await store.remapTaskIdentity(sourceId, " DRAFT-LOWERCASE ");
		expect(await readFile(sourcePaths.statePath, "utf8")).toBe(before);
		expect((await store.read("DRAFT-LOWERCASE")).taskId).toBe(sourceId);

		await store.remapTaskIdentity(sourceId, "TASK-UPPERCASE");
		const remapped = await store.read("TASK-UPPERCASE");
		const destinationPaths = await store.paths("TASK-UPPERCASE");
		const record = remapped.modes.plan?.sessions[0];
		expect(remapped.taskId).toBe("TASK-UPPERCASE");
		expect(record).toEqual(remappedSession(original, "TASK-UPPERCASE", destinationPaths.taskDir));
		expect(await Bun.file(outputPath).exists()).toBe(false);
		expect(await Bun.file(bootstrapPath).exists()).toBe(false);
		expect(await readFile(record!.outputPath, "utf8")).toBe("source output\n");
		expect(await readFile(record!.bootstrapPath, "utf8")).toBe("source bootstrap\n");
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
		const planId = randomUUID();
		const buildId = randomUUID();
		const plan = session(draft.id, "plan", planId, join(runtimeDir, `${planId}.log`), runtimeDir);
		const build = session(draft.id, "build", buildId, join(runtimeDir, `${buildId}.log`), runtimeDir);
		await Bun.write(plan.outputPath, "plan output\n");
		await Bun.write(plan.bootstrapPath, "plan bootstrap\n");
		await Bun.write(build.outputPath, "build output\n");
		await Bun.write(build.bootstrapPath, "build bootstrap\n");
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
		const promoted = (await coreFileSystem(core).listTasks()).find(({ title }) => title === "Remap me");
		expect(promoted).toBeDefined();
		if (!promoted) return;
		const promotedDir = (await store.paths(promoted.id)).taskDir;
		expect(promoted.id).not.toBe(draft.id);
		let migrated = await store.read(promoted.id);
		const promotedModes = migrated.modes;
		if (!promotedModes) throw new Error("Promoted mode histories are missing");
		const promotedPlan = promotedModes.plan;
		const promotedBuild = promotedModes.build;
		if (!promotedPlan?.sessions[0] || !promotedBuild?.sessions[0])
			throw new Error("Promoted mode histories are incomplete");
		expect(promotedPlan.sessions).toEqual([remappedSession(originalPlan, promoted.id, promotedDir)]);
		expect(promotedBuild.sessions).toEqual([remappedSession(originalBuild, promoted.id, promotedDir)]);
		expect(promotedPlan.activeSessionId).toBe(plan.id);
		expect(promotedBuild.activeSessionId).toBe(build.id);
		expect(promotedPlan.sessions[0]).toMatchObject({
			cwd: runtimeDir,
			outputPath: join(promotedDir, `${planId}.log`),
			bootstrapPath: join(promotedDir, `${planId}.md`),
			pathContext: { taskDir: promotedDir },
		});
		expect(promotedBuild.sessions[0]).toMatchObject({
			cwd: runtimeDir,
			outputPath: join(promotedDir, `${buildId}.log`),
			bootstrapPath: join(promotedDir, `${buildId}.md`),
			pathContext: { taskDir: promotedDir },
		});
		expect(await readFile(promotedPlan.sessions[0]!.outputPath, "utf8")).toBe("plan output\n");
		expect(await readFile(promotedPlan.sessions[0]!.bootstrapPath, "utf8")).toBe("plan bootstrap\n");
		expect(await readFile(promotedBuild.sessions[0]!.outputPath, "utf8")).toBe("build output\n");
		expect(await readFile(promotedBuild.sessions[0]!.bootstrapPath, "utf8")).toBe("build bootstrap\n");
		expect(Object.values((await store.read(draft.id)).modes).flatMap(({ sessions }) => sessions)).toEqual([]);

		await core.demoteTask(promoted.id);
		const demoted = (await coreFileSystem(core).listDrafts()).find(({ title }) => title === "Remap me");
		expect(demoted).toBeDefined();
		if (!demoted) return;
		const demotedDir = (await store.paths(demoted.id)).taskDir;
		migrated = await store.read(demoted.id);
		const demotedModes = migrated.modes;
		if (!demotedModes) throw new Error("Demoted mode histories are missing");
		const demotedPlan = demotedModes.plan;
		const demotedBuild = demotedModes.build;
		if (!demotedPlan?.sessions[0] || !demotedBuild?.sessions[0])
			throw new Error("Demoted mode histories are incomplete");
		expect(demotedPlan.sessions).toEqual([remappedSession(originalPlan, migrated.taskId, demotedDir)]);
		expect(demotedBuild.sessions).toEqual([remappedSession(originalBuild, migrated.taskId, demotedDir)]);
		expect(demotedPlan.activeSessionId).toBe(plan.id);
		expect(demotedBuild.activeSessionId).toBe(build.id);
		expect(demotedPlan.sessions[0]).toMatchObject({
			cwd: runtimeDir,
			outputPath: join(demotedDir, `${planId}.log`),
			bootstrapPath: join(demotedDir, `${planId}.md`),
			pathContext: { taskDir: demotedDir },
		});
		expect(demotedBuild.sessions[0]).toMatchObject({
			cwd: runtimeDir,
			outputPath: join(demotedDir, `${buildId}.log`),
			bootstrapPath: join(demotedDir, `${buildId}.md`),
			pathContext: { taskDir: demotedDir },
		});
		expect(await readFile(demotedPlan.sessions[0]!.outputPath, "utf8")).toBe("plan output\n");
		expect(await readFile(demotedPlan.sessions[0]!.bootstrapPath, "utf8")).toBe("plan bootstrap\n");
		expect(await readFile(demotedBuild.sessions[0]!.outputPath, "utf8")).toBe("build output\n");
		expect(await readFile(demotedBuild.sessions[0]!.bootstrapPath, "utf8")).toBe("build bootstrap\n");
	});

	it("does not create absent runtime state and refuses collisions or v1 state without changing either", async () => {
		const root = await mkdtemp(join(tmpdir(), "task-runtime-identity-remap-"));
		roots.push(root);
		const store = new SessionStore(root, new NoProcess());
		await store.remapTaskIdentity("TASK-ABSENT", "DRAFT-ABSENT");
		await expect(store.paths("DRAFT-ABSENT").then(({ taskDir }) => Bun.file(taskDir).exists())).resolves.toBe(false);

		const sourcePaths = await store.paths("TASK-SOURCE");
		const sourceId = randomUUID();
		const sourceSession = session(
			"TASK-SOURCE",
			"plan",
			sourceId,
			join(sourcePaths.taskDir, `${sourceId}.log`),
			sourcePaths.taskDir,
		);
		await Bun.write(sourceSession.outputPath, "source collision output\n");
		await Bun.write(sourceSession.bootstrapPath, "source collision bootstrap\n");
		await store.mutateMode("TASK-SOURCE", "plan", async (history) => {
			history.sessions.push(sourceSession);
			history.activeSessionId = history.sessions.at(-1)?.id;
		});
		const targetPaths = await store.paths("TASK-TARGET");
		const targetId = randomUUID();
		const targetSession = session(
			"TASK-TARGET",
			"build",
			targetId,
			join(targetPaths.taskDir, `${targetId}.log`),
			targetPaths.taskDir,
		);
		await Bun.write(targetSession.outputPath, "target output\n");
		await Bun.write(targetSession.bootstrapPath, "target bootstrap\n");
		await store.mutateMode("TASK-TARGET", "build", async (history) => {
			history.sessions.push(targetSession);
			history.activeSessionId = history.sessions.at(-1)?.id;
		});
		const sourceBefore = await store.read("TASK-SOURCE");
		const targetBefore = await store.read("TASK-TARGET");
		await expect(store.remapTaskIdentity("TASK-SOURCE", "TASK-TARGET")).rejects.toThrow(/refusing to merge/i);
		expect(await store.read("TASK-SOURCE")).toEqual(sourceBefore);
		expect(await store.read("TASK-TARGET")).toEqual(targetBefore);
		expect(await readFile(sourceSession.outputPath, "utf8")).toBe("source collision output\n");
		expect(await readFile(sourceSession.bootstrapPath, "utf8")).toBe("source collision bootstrap\n");
		expect(await readFile(targetSession.outputPath, "utf8")).toBe("target output\n");
		expect(await readFile(targetSession.bootstrapPath, "utf8")).toBe("target bootstrap\n");

		const v1Paths = await store.paths("TASK-V1");
		await Bun.write(v1Paths.statePath, JSON.stringify({ version: 1, taskId: "TASK-V1", sessions: [] }));
		const beforeV1 = await readFile(v1Paths.statePath, "utf8");
		await expect(store.remapTaskIdentity("TASK-V1", "DRAFT-V1")).rejects.toThrow(/valid version 2 state/i);
		expect(await readFile(v1Paths.statePath, "utf8")).toBe(beforeV1);
	});

	it("retries an exact installed destination after remap-phase failures without losing source or sidecars", async () => {
		for (const phase of ["after-link", "verification", "source-unlink"] as const) {
			const root = await mkdtemp(join(tmpdir(), `task-runtime-remap-${phase}-`));
			roots.push(root);
			const store = new SessionStore(root, new NoProcess());
			const sourcePaths = await store.paths("TASK-SOURCE");
			const sourceId = randomUUID();
			const source = session(
				"TASK-SOURCE",
				"plan",
				sourceId,
				join(sourcePaths.taskDir, `${sourceId}.log`),
				sourcePaths.taskDir,
			);
			await store.mutateMode("TASK-SOURCE", "plan", async (history) => {
				history.sessions.push(source);
				history.activeSessionId = source.id;
			});
			await Bun.write(source.outputPath, "sidecar bytes\n");
			await Bun.write(source.bootstrapPath, "bootstrap bytes\n");
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
			const remapped = (await store.read("TASK-TARGET")).modes?.plan?.sessions[0];
			expect(remapped).toEqual(remappedSession(source, "TASK-TARGET", newPaths.taskDir));
			expect(await Bun.file(source.outputPath).exists()).toBe(false);
			expect(await readFile(remapped!.outputPath, "utf8")).toBe("sidecar bytes\n");
			expect(await readFile(remapped!.bootstrapPath, "utf8")).toBe("bootstrap bytes\n");
		}
	});

	it("attempts every acquired remap lock release when one release rejects", async () => {
		const root = await mkdtemp(join(tmpdir(), "task-runtime-remap-release-"));
		roots.push(root);
		const store = new SessionStore(root, new NoProcess());
		const sourcePaths = await store.paths("TASK-SOURCE");
		const sourceId = randomUUID();
		const owned = session(
			"TASK-SOURCE",
			"plan",
			sourceId,
			join(sourcePaths.taskDir, `${sourceId}.log`),
			sourcePaths.taskDir,
		);
		await Bun.write(owned.outputPath, "owned output\n");
		await Bun.write(owned.bootstrapPath, "owned bootstrap\n");
		await store.mutateMode("TASK-SOURCE", "plan", async (history) => {
			history.sessions.push(owned);
			history.activeSessionId = owned.id;
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
