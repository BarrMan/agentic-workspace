import { describe, expect, it } from "bun:test";
import { Session, type SessionRuntime } from "../session/session.ts";
import type { AgentSession, ModeProfile, SessionFactory } from "../session/types.ts";
import type { Task as TaskRecord } from "../types.ts";
import { createReadinessGraph } from "./readiness.ts";
import type { TaskInput } from "./task.ts";
import { Task } from "./task.ts";

const profile: ModeProfile = {
	name: "Mode",
	model: { kind: "default" },
	prompt: "",
	permissions: { repository: "read", task: "read", artifacts: "read", subagents: "disabled" },
	artifacts: [],
};
const sessionFactory: SessionFactory = (_taskId, modeId, record) => new Session(record!, modeId, {} as SessionRuntime);

function fixture(overrides: Partial<TaskInput> = {}) {
	const dto: TaskRecord = {
		id: "T-1",
		title: "title",
		status: "To Do",
		done: false,
		createdDate: "today",
		labels: [],
		dependencies: [],
		source: "remote",
		rawContent: "body",
	};
	const task = new Task({
		...dto,
		profiles: { a: profile, b: profile },
		modes: { a: { sessions: [] }, b: { sessions: [] } },
		selectedModeId: "a",
		...overrides,
	});
	return { task, dto };
}

describe("Task identity and readiness", () => {
	it("compares the full record for value equality", () => {
		const { task, dto } = fixture();
		expect(task.equalsDeep(dto)).toBe(true);
		expect(task.equalsDeep({ ...dto, title: "changed" })).toBe(false);
	});

	it("derives readiness from the supplied graph", () => {
		const { task, dto } = fixture();
		const graph = createReadinessGraph({ tasks: [dto] });
		expect(task.ready(graph)).toEqual({
			isReady: true,
			isBlocked: false,
			blockingDependencies: [],
			missingDependencies: [],
		});
	});
});

describe("Task", () => {
	it("sets and clears approval on its held task record", () => {
		const { task } = fixture();
		task.setModeApproval("a");
		task.setModeApproval("b");
		expect(task.task.modeApprovals).toEqual({ a: true, b: true });
		task.clearModeApproval("a");
		expect(task.task.modeApprovals).toEqual({ b: true });
		task.clearModeApproval("b");
		expect(task.task.modeApprovals).toBeUndefined();
		expect(() => task.setModeApproval(" ")).toThrow("Mode ID must not be empty");
	});

	it("retains each selected mode across A→B→A", () => {
		const { task } = fixture();
		expect(task.cycleMode()).toBe("b");
		expect(task.cycleMode()).toBe("a");
		expect(task.selectedModeId).toBe("a");
	});

	it("registers durable records without launching and repairs removal selection", () => {
		const { task } = fixture();
		const record: AgentSession = {
			id: "adopted",
			taskId: "T-1",
			preset: "x",
			tmuxName: "",
			createdAt: "then",
			outputPath: "",
			bootstrapPath: "",
		};
		task.registerSession("a", record, sessionFactory);
		expect(task.modes.a?.activeSessionId).toBe("adopted");
		task.registerSession("a", { ...record, id: "other", createdAt: "later" }, sessionFactory);
		task.selectSession("a", "adopted");
		task.removeSession("a", "adopted");
		expect(task.modes.a?.activeSessionId).toBe("other");
	});

	it("refuses deleting a mode with session history and removes an empty mode", () => {
		const { task } = fixture();
		task.registerSession(
			"a",
			{
				id: "only-a",
				taskId: "T-1",
				preset: "x",
				tmuxName: "",
				createdAt: "then",
				outputPath: "",
				bootstrapPath: "",
			},
			sessionFactory,
		);
		expect(() => task.removeMode("a")).toThrow(/with sessions/);
		task.removeSession("a", "only-a");
		task.removeMode("a");
		expect(task.modes.a).toBeUndefined();
		expect(task.modes.b?.sessions).toEqual([]);
	});

	it("preserves task identity and source", () => {
		const { task, dto } = fixture();
		expect(task.id).toBe(dto.id);
		expect(task.task.source).toBe("remote");
	});

	it("preserves a valid persisted active session", () => {
		const sessions = [
			{
				id: "first",
				taskId: "T-1",
				preset: "x",
				tmuxName: "",
				cwd: "/",
				createdAt: "now",
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
				outputPath: "",
				bootstrapPath: "",
			},
		];
		const valid = fixture({
			modes: {
				a: {
					sessions: sessions.map((record) => new Session(record, "a", {} as SessionRuntime)),
					activeSessionId: "second",
				},
			},
		}).task;
		expect(valid.modes.a?.activeSessionId).toBe("second");
		expect(valid.activeSession?.id).toBe("second");
	});
});
