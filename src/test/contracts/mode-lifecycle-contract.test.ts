import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Core } from "../../controller/agentic-workspace.ts";
import { ModeLifecycleService } from "../../model/session/mode-lifecycle.ts";
import type { AgentConfiguration, AgentSession, ModeCatalog } from "../../model/session/types.ts";
import type { Task } from "../../model/types.ts";
import { BunRunner } from "../../runtime/session-process.ts";
import { AgentSessionService } from "../../runtime/sessions.ts";
import {
	getBuiltInAgentConfiguration,
	getDefaultModeCatalog,
	loadAgentConfiguration,
	upsertAgentConfiguration,
} from "../../storage/config.ts";
import { serializeTask } from "../../storage/markdown/serializer.ts";
import { SessionStore } from "../../storage/session-store.ts";
import { openViewStateStore } from "../../storage/view-state-store.ts";
import { coreFileSystem } from "../test-utils.ts";

type History = { sessions: Array<{ id: string; [key: string]: unknown }>; activeSessionId?: string };
const profile = { name: "mode" } as ModeCatalog["profiles"][string];

function catalog(ids = ["plan", "build", "research"]): ModeCatalog {
	return {
		version: 1,
		order: ids,
		defaultModeId: "research",
		profiles: Object.fromEntries(ids.map((id) => [id, { ...profile, name: id }])),
	};
}

function record(id: string, changes: Record<string, unknown> = {}) {
	return {
		id,
		nativeSessionId: `native-${id}`,
		outputPath: `/logs/${id}.log`,
		status: "running",
		...changes,
	};
}

describe("mode lifecycle deletion contract", () => {
	const roots: string[] = [];
	afterEach(async () => {
		await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
	});

	it("public mode deletion enumerates active, draft, completed, and archived tasks through the production service", async () => {
		const root = await mkdtemp(join(tmpdir(), "agentic-workspace-mode-container-deletion-"));
		roots.push(root);
		const core = new Core(root);
		const filesystem = coreFileSystem(core);
		await filesystem.ensureAgenticWorkspaceStructure();
		const modes = getDefaultModeCatalog();
		const plan = modes.profiles.plan;
		const build = modes.profiles.build;
		if (!plan || !build) throw new Error("Expected the seeded PLAN and BUILD profiles");
		modes.profiles.research = { ...plan, name: "RESEARCH" };
		modes.order.push("research");
		modes.defaultModeId = "research";
		await upsertAgentConfiguration(core, "project", { ...getBuiltInAgentConfiguration(), modes });
		const store = new SessionStore(root, new BunRunner());
		const containers = [
			{ id: "ACTIVE-1", directory: filesystem.tasksDir, kind: "container" },
			{ id: "DRAFT-1", directory: await filesystem.getDraftsDir(), kind: "container" },
			{ id: "DONE-1", directory: filesystem.completedDir, kind: "container" },
			{ id: "ARCHIVE-1", directory: filesystem.archiveTasksDir, kind: "container" },
		];
		for (const [index, container] of containers.entries()) {
			const taskDir =
				container.kind === "container" ? join(container.directory, container.id.toLowerCase()) : container.directory;
			const task: Task = {
				id: container.id,
				title: container.id,
				status: "To Do",
				assignee: [],
				createdDate: "2026-10-10",
				labels: [],
				dependencies: [],
			};
			await Bun.write(join(taskDir, "task.md"), serializeTask(task));
			const session = (id: string): AgentSession => ({
				id,
				taskId: container.id,
				preset: "agent",
				tmuxName: `pane-${id}`,
				cwd: root,
				createdAt: "2026-10-10T12:00:00.000Z",
				status: "running",
				nativeSessionId: `native-${id}`,
				outputPath: `/logs/${id}.log`,
				bootstrapPath: `/logs/${id}.prompt`,
			});
			await store.mutateMode(container.id, "research", async (history) => {
				history.sessions.push(session(`session-${index}`));
				history.activeSessionId = `session-${index}`;
			});
			await store.mutateMode(container.id, "plan", async (history) => {
				history.sessions.push(session(`target-${index}`));
				history.activeSessionId = `target-${index}`;
			});
		}
		const view = await openViewStateStore(root, () => ({
			selectedModeByTask: Object.fromEntries(containers.map(({ id }) => [id, "research"])),
			preserved: true,
		}));
		view.close();
		const before = await Promise.all(containers.map(({ id }) => store.read(id)));
		const service = new AgentSessionService(core);
		await expect(service.deleteMode("research", "plan")).rejects.toThrow("sessions cannot change modes");

		const persistedStore = new SessionStore(root, new BunRunner());
		for (const [index, { id, directory }] of containers.entries()) {
			const original = before[index];
			if (!original?.modes) throw new Error(`Expected seeded histories for ${id}`);
			const originalPlan = original.modes.plan;
			if (!originalPlan) throw new Error(`Expected PLAN history for ${id}`);
			const history = await persistedStore.readMode(id, "plan");
			expect(history).toEqual(originalPlan);
			expect((await persistedStore.read(id)).modes?.research).toEqual(original.modes.research);
			expect(await Bun.file(join(directory, id.toLowerCase(), "task.md")).exists()).toBe(true);
		}
		const savedView = await openViewStateStore(root, () => ({ selectedModeByTask: {}, preserved: false }));
		try {
			expect(savedView.current).toEqual({
				selectedModeByTask: Object.fromEntries(containers.map(({ id }) => [id, "research"])),
				preserved: true,
			});
		} finally {
			savedView.close();
		}
		expect((await loadAgentConfiguration(core, "project"))?.modes).toEqual(modes);
	});

	async function fixture(options: { onViewUpdate?: () => void; onConfigUpdate?: () => void } = {}) {
		const root = await mkdtemp(join(tmpdir(), "agentic-workspace-mode-lifecycle-contract-"));
		roots.push(root);
		let configuration: AgentConfiguration = { modes: catalog() } as AgentConfiguration;
		let view: Record<string, unknown> = { selectedModeByTask: { A: "research", B: "plan" }, preserved: true };
		const histories = new Map<string, Record<string, History>>();
		let taskIds = ["A", "B"];
		const service = new ModeLifecycleService({
			journalDirectory: root,
			configuration: {
				read: async () => configuration,
				update: async (updater) => {
					options.onConfigUpdate?.();
					configuration = updater(configuration);
					return configuration;
				},
			},
			sessions: {
				readMode: async (taskId, modeId) => histories.get(taskId)?.[modeId] ?? { sessions: [] },
				mutate: async (taskId, mutate) => {
					const state = { modes: histories.get(taskId) ?? {} };
					const result = await mutate(state);
					histories.set(taskId, state.modes ?? {});
					return result;
				},
			},
			viewState: {
				update: async (updater) => {
					options.onViewUpdate?.();
					view = updater(view);
				},
			},
			listTaskIds: async () => taskIds,
		});
		return {
			root,
			service,
			histories,
			setTasks(ids: string[]) {
				taskIds = ids;
			},
			setHistory(taskId: string, modeId: string, history: History) {
				const modes = histories.get(taskId) ?? {};
				modes[modeId] = structuredClone(history);
				histories.set(taskId, modes);
			},
			getView: () => view,
			getConfig: () => configuration,
			modeForSession(id: string) {
				return Object.entries(histories.get("A") ?? {}).find(([, history]) =>
					history.sessions.some((item) => item.id === id),
				)?.[0];
			},
		};
	}

	it("rejects deleting a mode that owns sessions even with a valid destination", async () => {
		const f = await fixture();
		f.setHistory("A", "research", { sessions: [record("r1")], activeSessionId: "r1" });
		await expect(f.service.deleteMode("research")).rejects.toThrow(/sessions cannot change modes/i);
		await expect(f.service.deleteMode("research", "plan")).rejects.toThrow(/sessions cannot change modes/i);
		await expect(f.service.deleteMode("research", "missing")).rejects.toThrow(/invalid.*destination/i);
		expect(await readdir(f.root)).toEqual([]);
		const history = f.histories.get("A")?.research;
		if (!history) throw new Error("Expected the source history to remain after rejected deletion");
		expect(history.sessions).toHaveLength(1);
	});

	it("keeps source and destination histories and pointers unchanged on rejected deletion", async () => {
		const f = await fixture();
		f.setHistory("A", "research", {
			sessions: [record("shared"), record("source-only")],
			activeSessionId: "source-only",
		});
		f.setHistory("A", "plan", { sessions: [record("shared"), record("plan-only")], activeSessionId: "plan-only" });
		f.setHistory("B", "research", { sessions: [] });
		await expect(f.service.deleteMode("research", "plan")).rejects.toThrow("sessions cannot change modes");
		expect(f.histories.get("A")?.plan).toEqual({
			sessions: [record("shared"), record("plan-only")],
			activeSessionId: "plan-only",
		});
		expect(f.histories.get("B")?.plan).toBeUndefined();
		const sourceHistory = f.histories.get("A");
		if (!sourceHistory) throw new Error("Expected task A history after mode deletion");
		expect(sourceHistory.research?.activeSessionId).toBe("source-only");
		expect(f.modeForSession("source-only")).toBe("research");
	});

	it("preserves running source session records and all identity/output fields", async () => {
		const f = await fixture();
		const running = record("live", { status: "running", nativeSessionId: "native-live", outputPath: "/tmp/live.log" });
		f.setHistory("A", "research", { sessions: [running], activeSessionId: "live" });
		await expect(f.service.deleteMode("research", "build")).rejects.toThrow("sessions cannot change modes");
		const sourceHistory = f.histories.get("A")?.research;
		if (!sourceHistory) throw new Error("Expected the source history after rejected mode deletion");
		expect(sourceHistory.sessions).toEqual([running]);
		expect(sourceHistory.sessions[0]).toMatchObject({
			status: "running",
			nativeSessionId: "native-live",
			outputPath: "/tmp/live.log",
		});
	});

	it("reassigns selected modes and deleted defaults while retaining unrelated selections/configuration", async () => {
		const f = await fixture();
		await f.service.deleteMode("research", "build");
		expect(f.getView()).toEqual({ selectedModeByTask: { A: "build", B: "plan" }, preserved: true });
		expect(f.getConfig().modes).toMatchObject({
			defaultModeId: "build",
			order: ["plan", "build"],
			profiles: { plan: {}, build: {} },
		});
		const g = await fixture();
		g.setHistory("A", "research", { sessions: [] });
		await g.service.deleteMode("research");
		expect(g.getView().selectedModeByTask).toEqual({ B: "plan" });
		expect(g.getConfig().modes?.defaultModeId).toBe("plan");
	});

	it("resumes an interrupted deletion idempotently and gates launches until recovery", async () => {
		let fail = true;
		const f = await fixture({
			onViewUpdate: () => {
				if (fail) throw new Error("simulated interruption");
			},
		});
		f.setHistory("A", "research", { sessions: [] });
		await expect(f.service.deleteMode("research", "build")).rejects.toThrow("simulated interruption");
		let launched = false;
		await expect(f.service.deleteMode("research", "build")).rejects.toThrow(/pending/i);
		expect(launched).toBe(false);
		fail = false;
		await f.service.recover();
		await f.service.recover();
		await f.service.withGate(async () => {
			launched = true;
		});
		expect(launched).toBe(true);
		expect(f.histories.get("A")?.research).toBeUndefined();
		expect(await readdir(f.root)).toEqual([]);
	});

	it("refuses malformed saved journals without changing configuration or session state", async () => {
		const f = await fixture();
		const beforeConfig = structuredClone(f.getConfig());
		const beforeHistories = structuredClone(f.histories);
		const bytes = '{"version":2,"phase":"not-a-phase","tasks":[]}';
		await writeFile(join(f.root, "mode-deletion.json"), bytes);
		await expect(f.service.recover()).rejects.toThrow(/invalid mode-deletion journal/i);
		expect(await readFile(join(f.root, "mode-deletion.json"), "utf8")).toBe(bytes);
		expect(f.getConfig()).toEqual(beforeConfig);
		expect(f.histories).toEqual(beforeHistories);
	});

	it("blocks existing moving journals without changing their bytes or any state", async () => {
		const f = await fixture();
		f.setHistory("A", "research", { sessions: [record("historical")], activeSessionId: "historical" });
		const configuration = structuredClone(f.getConfig());
		const histories = structuredClone(f.histories);
		const view = structuredClone(f.getView());
		for (const phase of ["prepared", "histories", "view", "configuration"]) {
			const bytes = JSON.stringify({ version: 1, source: "research", destination: "build", phase, tasks: ["A"] });
			await writeFile(join(f.root, "mode-deletion.json"), bytes);
			await expect(f.service.recover()).rejects.toThrow("explicit recovery decision");
			expect(await readFile(join(f.root, "mode-deletion.json"), "utf8")).toBe(bytes);
			expect(f.getConfig()).toEqual(configuration);
			expect(f.histories).toEqual(histories);
			expect(f.getView()).toEqual(view);
		}
	});
});
