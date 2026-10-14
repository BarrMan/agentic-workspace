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

	it("rejects an invalid mode before provisioning", async () => {
		const f = fixture();
		await expect(f.task.newSession("missing", () => {})).rejects.toThrow("Unknown mode");
		expect(f.provisions).toBe(0);
	});

	it("inserts exactly once into the requested mode and keeps pointers valid", async () => {
		const { task } = fixture();
		const session = await task.newSession("b", () => {});
		expect(task.modes.a?.sessions).toHaveLength(0);
		expect(task.modes.b?.sessions.map(({ id }) => id)).toEqual([session.id]);
		expect(task.modes.b?.activeSessionId).toBe(session.id);
		for (const history of Object.values(task.modes)) {
			expect(
				history.activeSessionId === undefined || history.sessions.some(({ id }) => id === history.activeSessionId),
			).toBe(true);
		}
	});

	it("rolls back the failed entry without replacing a newer active selection", async () => {
		const { task } = fixture();
		let creation: Parameters<typeof task.rollbackSession>[0] | undefined;
		await task.newSession("a", ({ creation: captured }) => {
			creation = captured;
		});
		await task.newSession("a", () => {});
		if (!creation) throw new Error("creation capture was not called");
		task.rollbackSession(creation);
		expect(task.modes.a?.sessions.map(({ id }) => id)).toEqual(["s2"]);
		expect(task.modes.a?.activeSessionId).toBe("s2");
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
