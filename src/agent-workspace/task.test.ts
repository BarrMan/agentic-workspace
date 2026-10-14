import { describe, expect, it } from "bun:test";
import type { Task as TaskRecord } from "../types/index.ts";
import type { Session, SessionCreationFactory, TaskHydrationInput } from "./session-contracts.ts";
import { Task } from "./task.ts";
import type { AgentSession, ModeProfile, ResolvedAgentConfiguration } from "./types.ts";

const profile: ModeProfile = {
	name: "Mode",
	model: { kind: "default" },
	prompt: "",
	permissions: { repository: "read", task: "read", artifacts: "read", subagents: "disabled" },
	artifacts: [],
};
const configuration: ResolvedAgentConfiguration = { scope: "project", config: { selectedPreset: "x", presets: {} } };

function fixture(overrides: Partial<TaskHydrationInput> = {}) {
	let provisions = 0;
	const factory: SessionCreationFactory = {
		provision: ({ taskId }) => {
			provisions++;
			const record: AgentSession = {
				id: `s${provisions}`,
				taskId,
				preset: "x",
				tmuxName: "",
				cwd: "/",
				createdAt: "now",
				status: "starting",
				outputPath: "",
				bootstrapPath: "",
			};
			return {
				id: record.id,
				record,
				start: async () => {},
				resume: async () => {},
				stop: async () => {},
				inject: async () => {},
				subscribe: () => () => {},
				serialize: () => record,
			} satisfies Session;
		},
	};
	const dto: TaskRecord = {
		id: "T-1",
		title: "title",
		status: "To Do",
		assignee: [],
		createdDate: "today",
		labels: [],
		dependencies: [],
		source: "remote",
		rawContent: "body",
	};
	const task = new Task({
		task: dto,
		modes: { a: profile, b: profile },
		configuration,
		sessionRecords: {},
		selectedModeId: "a",
		createSession: factory,
		...overrides,
	});
	return {
		task,
		get provisions() {
			return provisions;
		},
		dto,
	};
}

describe("Task", () => {
	it("retains each selected mode across A→B→A", () => {
		const { task } = fixture();
		expect(task.cycleMode()).toBe("b");
		expect(task.cycleMode()).toBe("a");
		expect(task.selectedModeId).toBe("a");
	});

	it("rejects an invalid mode before provisioning", () => {
		const f = fixture();
		expect(() => f.task.reserveSession("missing")).toThrow("Unknown mode");
		expect(f.provisions).toBe(0);
	});

	it("reserves synchronously exactly once in the requested mode", () => {
		const { task } = fixture();
		const { session, creation } = task.reserveSession("b");
		expect(task.modes.a?.sessions).toHaveLength(0);
		expect(task.modes.b?.sessions.map(({ id }) => id)).toEqual([session.id]);
		expect(task.modes.b?.activeSessionId).toBe(session.id);
		expect(creation).toEqual({ taskId: "T-1", modeId: "b", provisionalSessionId: session.id });
		for (const history of Object.values(task.modes)) {
			expect(
				history.activeSessionId === undefined || history.sessions.some(({ id }) => id === history.activeSessionId),
			).toBe(true);
		}
	});

	it("rolls back the failed entry without replacing a newer active selection", () => {
		const { task } = fixture();
		const { creation } = task.reserveSession("a");
		task.reserveSession("a");
		task.rollbackSession(creation);
		expect(task.modes.a?.sessions.map(({ id }) => id)).toEqual(["s2"]);
		expect(task.modes.a?.activeSessionId).toBe("s2");
	});

	it("updates only an existing same-incarnation record without changing relationships", () => {
		const sessions = ["one", "two"].map((id) => ({
			id,
			taskId: "T-1",
			preset: "x",
			tmuxName: "",
			cwd: "/",
			createdAt: id,
			status: "stopped" as const,
			outputPath: "",
			bootstrapPath: "",
		}));
		const { task } = fixture({ sessionRecords: { a: { sessions, activeSessionId: "two" } } });
		const first = sessions[0];
		if (!first) throw new Error("missing fixture session");
		expect(() => task.updateSessionRecord("a", { ...first, id: "missing" })).toThrow("membership");
		expect(() => task.updateSessionRecord("a", { ...first, taskId: "foreign" })).toThrow("another task");
		task.updateSessionRecord("a", { ...first, status: "running" });
		expect(task.modes.a?.sessions.map(({ id }) => id)).toEqual(["one", "two"]);
		expect(task.modes.a?.activeSessionId).toBe("two");
		expect(task.modes.a?.sessions[0]?.status).toBe("running");
	});

	it("registers durable records without launching and repairs removal selection", () => {
		const { task, provisions } = fixture();
		const record: AgentSession = {
			id: "adopted",
			taskId: "T-1",
			preset: "x",
			tmuxName: "",
			cwd: "/",
			createdAt: "then",
			status: "stopped",
			outputPath: "",
			bootstrapPath: "",
		};
		task.registerSession("a", record);
		expect(task.modes.a?.activeSessionId).toBe("adopted");
		expect(provisions).toBe(0);
		task.registerSession("a", { ...record, id: "other", createdAt: "later" });
		task.selectSession("a", "adopted");
		task.removeSession("a", "adopted");
		expect(task.modes.a?.activeSessionId).toBe("other");
	});

	it("removes a mode history without merging its sessions", () => {
		const { task } = fixture();
		task.registerSession("a", {
			id: "only-a",
			taskId: "T-1",
			preset: "x",
			tmuxName: "",
			cwd: "/",
			createdAt: "then",
			status: "stopped",
			outputPath: "",
			bootstrapPath: "",
		});
		task.removeMode("a");
		expect(task.modes.a).toBeUndefined();
		expect(task.modes.b?.sessions).toEqual([]);
	});

	it("preserves hydrated identity/source and serializes only task DTO fields", () => {
		const { task, dto } = fixture();
		expect(task.id).toBe(dto.id);
		expect(task.task.source).toBe("remote");
		expect(task.editable).toBe(false);
		expect(task.serialize()).toEqual(dto);
		expect(JSON.stringify(task.serialize())).not.toContain("createSession");
	});

	it("preserves a valid persisted active session and repairs a stale pointer", () => {
		const sessions = [
			{
				id: "first",
				taskId: "T-1",
				preset: "x",
				tmuxName: "",
				cwd: "/",
				createdAt: "now",
				status: "stopped" as const,
				outputPath: "",
				bootstrapPath: "",
			},
			{
				id: "second",
				taskId: "T-1",
				preset: "x",
				tmuxName: "",
				cwd: "/",
				createdAt: "now",
				status: "stopped" as const,
				outputPath: "",
				bootstrapPath: "",
			},
		];
		const valid = fixture({ sessionRecords: { a: { sessions, activeSessionId: "second" } } }).task;
		expect(valid.modes.a?.activeSessionId).toBe("second");
		expect(valid.activeSession?.id).toBe("second");
		const stale = fixture({ sessionRecords: { a: { sessions, activeSessionId: "missing" } } }).task;
		expect(stale.modes.a?.activeSessionId).toBe("first");
	});
});
