import { afterEach, describe, expect, it } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import lockfile from "proper-lockfile";
import type { ProcessRunner } from "./session-process.ts";
import { SessionStore } from "./session-store.ts";
import type { AgentSession } from "./types.ts";

class FakeRunner implements ProcessRunner {
	async run(): Promise<{ exitCode: number; stdout: string; stderr: string }> {
		return { exitCode: 1, stdout: "", stderr: "not a git repository" };
	}
}

function session(id: string): AgentSession {
	return {
		id,
		taskId: "TASK-1",
		preset: "test",
		tmuxName: id,
		cwd: "/tmp",
		createdAt: "2026-01-01T00:00:00.000Z",
		status: "stopped",
		outputPath: "/tmp/output",
		bootstrapPath: "/tmp/bootstrap",
	};
}

describe("SessionStore", () => {
	const directories: string[] = [];

	afterEach(async () => {
		await Promise.all(
			directories.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })),
		);
	});

	it("serializes task mutations and rejects malformed durable state", async () => {
		const root = await mkdtemp(join(tmpdir(), "backlog-session-store-"));
		directories.push(root);
		const store = new SessionStore(root, new FakeRunner());

		await Promise.all(
			["first", "second"].map(
				async (id) =>
					await store.mutate("TASK-1", async (state) => {
						state.sessions.push(session(id));
					}),
			),
		);
		expect((await store.read("TASK-1")).sessions.map((session) => session.id).sort()).toEqual(["first", "second"]);
		const persisted = JSON.parse(await Bun.file((await store.paths("TASK-1")).statePath).text());
		expect(persisted.version).toBe(2);
		expect(persisted.modes.build.sessions.map((item: AgentSession) => item.id).sort()).toEqual(["first", "second"]);

		const { statePath } = await store.paths("TASK-1");
		await writeFile(statePath, "{}");
		await expect(store.read("TASK-1")).rejects.toThrow(/file was not changed.*Preserve a copy.*do not reset/i);

		await writeFile(
			statePath,
			JSON.stringify({
				version: 2,
				taskId: "TASK-1",
				modes: { build: { activeSessionId: "missing", sessions: [{ id: "bad" }] } },
			}),
		);
		await expect(store.read("TASK-1")).rejects.toThrow(/file was not changed.*Preserve a copy.*do not reset/i);

		const validSession = { ...session("valid-session"), nativeSessionId: "native-session" };
		await writeFile(
			statePath,
			JSON.stringify({ version: 2, taskId: "TASK-1", modes: { build: { sessions: [validSession] } } }),
		);
		expect((await store.read("TASK-1")).sessions[0]?.nativeSessionId).toBe("native-session");

		await writeFile(
			statePath,
			JSON.stringify({
				version: 2,
				taskId: "TASK-1",
				modes: { build: { sessions: [{ ...validSession, nativeSessionId: 123 }] } },
			}),
		);
		await expect(store.read("TASK-1")).rejects.toThrow(/file was not changed.*Preserve a copy.*do not reset/i);

		await writeFile(
			statePath,
			JSON.stringify({
				version: 2,
				taskId: "TASK-1",
				modes: { build: { sessions: [{ ...validSession, extra: "field" }] } },
			}),
		);
		await expect(store.read("TASK-1")).rejects.toThrow(/file was not changed.*Preserve a copy.*do not reset/i);

		await store.reset("TASK-1");
		expect(await store.read("TASK-1")).toMatchObject({
			version: 2,
			taskId: "TASK-1",
			sessions: [],
			modes: {},
			legacyModeId: "build",
		});
	});

	it("round-trips optional native providers while preserving older exact-ID histories", async () => {
		const root = await mkdtemp(join(tmpdir(), "backlog-native-provider-state-"));
		directories.push(root);
		const store = new SessionStore(root, new FakeRunner());
		const { statePath } = await store.paths("TASK-1");
		await mkdir(join(root, ".backlog", "task-1"), { recursive: true });
		const old = { ...session("old"), nativeSessionId: "Exact-ID/Keep-Bytes" };
		await writeFile(statePath, JSON.stringify({ version: 2, taskId: "TASK-1", modes: { build: { sessions: [old] } } }));
		const before = await store.read("TASK-1");
		expect(before.modes?.build?.sessions[0]?.nativeSessionId).toBe(old.nativeSessionId);
		expect(before.modes?.build?.sessions[0]?.nativeProvider).toBeUndefined();
		await store.mutateMode("TASK-1", "build", async (history) => {
			const current = history.sessions[0];
			if (!current) throw new Error("Expected legacy session fixture.");
			current.nativeProvider = "opencode";
		});
		expect((await store.read("TASK-1")).modes?.build?.sessions[0]).toMatchObject({
			nativeSessionId: old.nativeSessionId,
			nativeProvider: "opencode",
		});
		const persisted = JSON.parse(await Bun.file(statePath).text());
		expect(persisted.modes.build.sessions[0].nativeSessionId).toBe(old.nativeSessionId);
		expect(persisted.modes.build.sessions[0].nativeProvider).toBe("opencode");
		persisted.modes.build.sessions[0].nativeProvider = "unknown-provider";
		await writeFile(statePath, JSON.stringify(persisted));
		await expect(store.read("TASK-1")).rejects.toThrow("invalid session data");
	});

	it("round-trips a failed-resume marker, validates it strictly, and preserves malformed bytes", async () => {
		const root = await mkdtemp(join(tmpdir(), "backlog-resume-marker-state-"));
		directories.push(root);
		const store = new SessionStore(root, new FakeRunner());
		const { statePath } = await store.paths("TASK-1");
		const record = session("marked");
		record.resumeProbeFailed = { nativeProvider: "claude", nativeSessionId: "provider-session-1" };
		await store.mutateMode("TASK-1", "build", async (history) => history.sessions.push(record));
		const recreated = new SessionStore(root, new FakeRunner());
		expect((await recreated.read("TASK-1")).sessions[0]?.resumeProbeFailed).toEqual(record.resumeProbeFailed);
		const validBytes = await Bun.file(statePath).text();
		for (const marker of [
			{ nativeProvider: "claude", nativeSessionId: "sid", extra: true },
			{ nativeProvider: "unknown", nativeSessionId: "sid" },
			{ nativeProvider: "pi", nativeSessionId: " " },
			{ nativeProvider: "pi" },
			{ nativeSessionId: "sid" },
			null,
			[],
			"marker",
			42,
			{ nativeProvider: "pi", nativeSessionId: 7 },
		]) {
			const invalid = JSON.parse(validBytes);
			invalid.modes.build.sessions[0].resumeProbeFailed = marker;
			const raw = JSON.stringify(invalid);
			await Bun.write(statePath, raw);
			await expect(store.read("TASK-1")).rejects.toThrow(/corrupt or contains invalid session data/i);
			expect(await Bun.file(statePath).text()).toBe(raw);
		}
		await Bun.write(statePath, validBytes);
		const unusual = { nativeProvider: "pi" as const, nativeSessionId: "  old/SID: bytes  " };
		const validWithUnusualId = JSON.parse(validBytes);
		validWithUnusualId.modes.build.sessions[0].resumeProbeFailed = unusual;
		const unusualBytes = JSON.stringify(validWithUnusualId);
		await Bun.write(statePath, unusualBytes);
		expect((await store.read("TASK-1")).sessions[0]?.resumeProbeFailed).toEqual(unusual);
		expect(await Bun.file(statePath).text()).toBe(unusualBytes);
		await Bun.write(statePath, validBytes);
		await store.remove("TASK-1", "marked");
		expect((await store.read("TASK-1")).sessions).toEqual([]);
	});

	it("publishes failed resume markers idempotently", async () => {
		const root = await mkdtemp(join(tmpdir(), "backlog-resume-policy-store-"));
		directories.push(root);
		const store = new SessionStore(root, new FakeRunner(), async () => ({
			command: "unused",
			env: {},
			prepare: "",
			bootstrap: "opencode",
		}));
		const { taskDir, statePath } = await store.paths("TASK-1");
		const record = {
			...session("policy"),
			bootstrapPath: join(taskDir, "policy.md"),
			nativeProvider: "opencode" as const,
			nativeSessionId: "ses_old",
		};
		await store.mutateMode("TASK-1", "plan", async (history) => history.sessions.push(record));
		await mkdir(taskDir, { recursive: true });
		await writeFile(join(taskDir, "policy.native-session-id"), "ses_old\n", { mode: 0o600 });
		const marker = { nativeProvider: "opencode" as const, nativeSessionId: "ses_old" };
		const expected = (await store.readMode("TASK-1", "plan")).sessions[0];
		if (!expected) throw new Error("Missing expected session");
		await store.markResumeProbeFailed(expected, "plan", marker, "probe failed");
		const failedBytes = await Bun.file(statePath).text();
		const failed = (await store.readMode("TASK-1", "plan")).sessions[0];
		expect(failed).toMatchObject({
			status: "failed",
			error: "probe failed",
			resumeProbeFailed: marker,
			nativeSessionId: "ses_old",
		});
		expect(failed?.ownerPid).toBeUndefined();
		expect(failed?.endedAt).toEqual(expect.any(String));
		await store.markResumeProbeFailed(expected, "plan", marker, "probe failed");
		expect(await Bun.file(statePath).text()).toBe(failedBytes);
	});

	it("loads an older v2 record unchanged", async () => {
		const root = await mkdtemp(join(tmpdir(), "backlog-old-v2-state-"));
		directories.push(root);
		const store = new SessionStore(root, new FakeRunner());
		const { statePath } = await store.paths("TASK-1");
		const raw = JSON.stringify({ version: 2, taskId: "TASK-1", modes: { build: { sessions: [session("legacy")] } } });
		await Bun.write(statePath, raw);
		expect((await store.read("TASK-1")).sessions).toEqual([session("legacy")]);
		expect(await Bun.file(statePath).text()).toBe(raw);
	});

	it("rejects v1 session state without changing the file", async () => {
		const root = await mkdtemp(join(tmpdir(), "backlog-session-store-modes-"));
		directories.push(root);
		const store = new SessionStore(root, new FakeRunner());
		const { statePath } = await store.paths("TASK-1");
		await Bun.write(
			statePath,
			JSON.stringify({ version: 1, taskId: "TASK-1", activeSessionId: "legacy", sessions: [session("legacy")] }),
		);
		const original = await Bun.file(statePath).text();
		await expect(store.read("TASK-1")).rejects.toThrow(/unsupported format version 1/i);
		await expect(
			store.mutateMode("TASK-1", "plan", async (history) => {
				history.sessions.push(session("planner"));
				history.activeSessionId = "planner";
			}),
		).rejects.toThrow(/unsupported format version 1/i);
		expect(await Bun.file(statePath).text()).toBe(original);
	});

	it("serializes the entire mode read-modify-write with session mutations", async () => {
		const root = await mkdtemp(join(tmpdir(), "backlog-session-store-lock-"));
		directories.push(root);
		const store = new SessionStore(root, new FakeRunner());
		await store.mutateMode("TASK-1", "build", async (history) => history.sessions.push(session("existing")));
		const { statePath } = await store.paths("TASK-1");
		const checkLock = Object.getOwnPropertyDescriptor(lockfile, "check")?.value;
		if (typeof checkLock !== "function") throw new Error("proper-lockfile.check is unavailable");

		let entered!: () => void;
		let release!: () => void;
		const modeCallbackEntered = new Promise<void>((resolve) => (entered = resolve));
		const modeCallbackGate = new Promise<void>((resolve) => (release = resolve));
		let stateLockHeld = false;
		const pending: Promise<unknown>[] = [];
		try {
			pending.push(
				store.mutateMode("TASK-1", "build", async (history) => {
					entered();
					await modeCallbackGate;
					history.sessions.push(session("mode-update"));
				}),
			);
			await modeCallbackEntered;
			stateLockHeld = await checkLock(statePath, { realpath: false });
			pending.push(
				store.mutateSession("TASK-1", "existing", async (record) => {
					record.status = "running";
				}),
			);
		} finally {
			release();
			await Promise.all(pending);
		}
		expect(stateLockHeld).toBe(true);

		const history = (await store.read("TASK-1")).modes?.build;
		if (!history) throw new Error("Missing build mode history");
		expect(history.sessions.map((record) => record.id).sort()).toEqual(["existing", "mode-update"]);
		const existing = history.sessions.find((record) => record.id === "existing");
		if (!existing) throw new Error("Missing existing session");
		expect(existing.status).toBe("running");
	});

	it("rejects removed configuration snapshots without rewriting historical state", async () => {
		const root = await mkdtemp(join(tmpdir(), "backlog-session-history-"));
		directories.push(root);
		const store = new SessionStore(root, new FakeRunner());
		const { statePath } = await store.paths("TASK-1");
		for (const key of ["presetSnapshot", "configScope", "createdWith", "harness", "agent"]) {
			const bytes = JSON.stringify({
				version: 2,
				taskId: "TASK-1",
				modes: { build: { sessions: [{ ...session("old"), [key]: "removed" }] } },
			});
			await Bun.write(statePath, bytes);
			await expect(store.read("TASK-1")).rejects.toThrow(/corrupt or contains invalid session data/i);
			expect(await Bun.file(statePath).text()).toBe(bytes);
		}
	});

	it("hydrates private receipts using current preset configuration, without invoking a CLI", async () => {
		const root = await mkdtemp(join(tmpdir(), "backlog-session-receipt-"));
		directories.push(root);
		let bootstrap: "opencode" | "claude" = "opencode";
		const store = new SessionStore(root, new FakeRunner(), async (record) => ({
			command: "must-not-execute",
			env: {},
			prepare: "",
			bootstrap: record.preset === "other" ? "claude" : bootstrap,
		}));
		const artifactRoot = join(root, "task-artifacts");
		const { taskDir } = await store.paths("TASK-1");
		const versioned = {
			...session("versioned"),
			nativeSessionId: "ses_old_v1",
			pathContext: { projectDir: root, worktreeDir: root, taskDir: artifactRoot },
			bootstrapPath: join(taskDir, "versioned.md"),
		};
		const second = {
			...session("second"),
			nativeSessionId: "ses_old_v2",
			pathContext: { projectDir: root, worktreeDir: root, taskDir: artifactRoot },
			bootstrapPath: join(taskDir, "second.md"),
		};
		const legacy = {
			...session("legacy"),
			pathContext: { projectDir: root, worktreeDir: root, taskDir: artifactRoot },
			bootstrapPath: join(taskDir, "legacy.md"),
			preset: "other",
		};
		const stale = {
			...second,
			id: "stale",
			tmuxName: "stale",
			bootstrapPath: join(taskDir, "stale.md"),
			nativeSessionId: undefined,
		};
		await store.mutate("TASK-1", async (state) => state.sessions.push(versioned, second, legacy, stale));
		await mkdir(artifactRoot, { recursive: true });
		await writeFile(join(taskDir, "versioned.native-session-id"), "ses_v1\n", { mode: 0o600 });
		await writeFile(join(taskDir, "second.native-session-id"), "ses_v2", { mode: 0o600 });
		await writeFile(join(taskDir, "legacy.native-session-id"), "ses_legacy", { mode: 0o600 });
		await writeFile(join(taskDir, "stale.native-session-id"), "stale-id", { mode: 0o600 });

		expect((await store.readAll())[0]?.sessions.map((item) => item.nativeSessionId)).toEqual([
			"ses_old_v1",
			"ses_old_v2",
			undefined,
			undefined,
		]);
		expect((await store.read("TASK-1")).sessions.map((item) => item.nativeSessionId)).toEqual([
			"ses_old_v1",
			"ses_old_v2",
			undefined,
			undefined,
		]);
		await store.mutate("TASK-1", async () => undefined);
		const persisted = JSON.parse(await Bun.file((await store.paths("TASK-1")).statePath).text());
		expect(persisted.modes.build.sessions[0].nativeSessionId).toBe("ses_old_v1");
		expect(persisted.modes.build.sessions[1].nativeSessionId).toBe("ses_old_v2");
		await writeFile(join(taskDir, "versioned.native-session-id"), "ses_v1_rotated", { mode: 0o600 });
		await writeFile(join(taskDir, "second.native-session-id"), "ses_v2_rotated", { mode: 0o600 });
		expect((await store.read("TASK-1")).sessions.map((item) => item.nativeSessionId)).toEqual([
			"ses_old_v1",
			"ses_old_v2",
			undefined,
			undefined,
		]);
		await store.mutate("TASK-1", async () => undefined);
		const rotated = JSON.parse(await Bun.file((await store.paths("TASK-1")).statePath).text());
		expect(rotated.modes.build.sessions[0].nativeSessionId).toBe("ses_old_v1");
		expect(rotated.modes.build.sessions[1].nativeSessionId).toBe("ses_old_v2");
		bootstrap = "claude";
		await writeFile(join(taskDir, "second.native-session-id"), "ses_ignored", { mode: 0o600 });
		expect((await store.read("TASK-1")).sessions[1]?.nativeSessionId).toBe("ses_old_v2");
		bootstrap = "opencode";
		await chmod(join(taskDir, "second.native-session-id"), 0o644);
		expect((await store.read("TASK-1")).sessions[1]?.nativeSessionId).toBe("ses_old_v2");
		await rm(join(taskDir, "second.native-session-id"));
		await writeFile(join(artifactRoot, "private-id"), "ses_symlink", { mode: 0o600 });
		await symlink(join(artifactRoot, "private-id"), join(taskDir, "second.native-session-id"));
		expect((await store.read("TASK-1")).sessions[1]?.nativeSessionId).toBe("ses_old_v2");
		await writeFile(join(artifactRoot, "stale.native-session-id"), "ses_outside", { mode: 0o600 });
		await store.mutateSession("TASK-1", "stale", async (record) => {
			record.bootstrapPath = join(artifactRoot, "stale.md");
		});
		expect((await store.read("TASK-1")).sessions[3]?.nativeSessionId).toBeUndefined();
		await store.remove("TASK-1", "versioned");
		expect(await Bun.file(join(taskDir, "versioned.native-session-id")).exists()).toBe(false);
	});

	it("returns protected receipt candidates without binding them during unrelated mutations", async () => {
		const root = await mkdtemp(join(tmpdir(), "backlog-session-receipt-candidate-"));
		directories.push(root);
		const store = new SessionStore(root, new FakeRunner(), async () => ({
			command: "never-run",
			env: {},
			prepare: "",
			bootstrap: "opencode",
		}));
		const { taskDir, statePath } = await store.paths("TASK-1");
		const artifactRoot = join(root, "artifacts");
		const saved = {
			...session("saved"),
			nativeSessionId: "ses_established",
			bootstrapPath: join(taskDir, "saved.md"),
		};
		const candidate = {
			...session("candidate"),
			bootstrapPath: join(taskDir, "candidate.md"),
		};
		const badPath = {
			...session("bad-path"),
			bootstrapPath: join(artifactRoot, "bad-path.md"),
		};
		await store.mutate("TASK-1", async (state) => state.sessions.push(saved, candidate, badPath));
		await mkdir(artifactRoot, { recursive: true });
		await writeFile(join(taskDir, "saved.native-session-id"), "ses_changed", { mode: 0o600 });
		await writeFile(join(taskDir, "candidate.native-session-id"), "ses_candidate_exact", { mode: 0o600 });
		await writeFile(join(taskDir, "bad-path.native-session-id"), "ses_wrong_path", { mode: 0o600 });
		const before = await Bun.file(statePath).text();
		expect(await store.readNativeSessionIdCandidate("TASK-1", "candidate")).toBe("ses_candidate_exact");
		expect(await Bun.file(statePath).text()).toBe(before);
		await expect(store.readNativeSessionIdCandidate("TASK-1", "saved")).rejects.toThrow(
			"conflicts with established ID",
		);
		expect(await store.readNativeSessionIdCandidate("TASK-1", "bad-path")).toBeUndefined();
		await expect(store.readNativeSessionIdCandidate("TASK-OTHER", "candidate")).rejects.toThrow("not found");
		expect((await store.read("TASK-1")).sessions[1]?.nativeSessionId).toBe("ses_candidate_exact");
		await store.mutate("TASK-1", async (state) => {
			const item = state.sessions.find((entry) => entry.id === "bad-path");
			if (item) item.error = "unrelated update";
		});
		const persisted = JSON.parse(await Bun.file(statePath).text());
		expect(persisted.modes.build.sessions[0].nativeSessionId).toBe("ses_established");
		expect(persisted.modes.build.sessions[1].nativeSessionId).toBeUndefined();
	});
});
