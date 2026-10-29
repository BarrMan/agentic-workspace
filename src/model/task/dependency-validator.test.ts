import { describe, expect, it } from "bun:test";
import type { Task } from "../types.ts";
import { DependencyValidator } from "./dependency-validator.ts";

function task(id: string, dependencies: string[] = []): Task {
	return { id, title: id, status: "To Do", done: false, createdDate: "2026-10-10", labels: [], dependencies };
}

describe("DependencyValidator loaded-corpus boundary", () => {
	it("validates dependencies synchronously from all supplied records", () => {
		const validator = new DependencyValidator([task("TASK-1"), { ...task("TASK-2"), source: "completed" }]);
		expect(validator.validate(["TASK-2", "missing"], task("TASK-1"))).toEqual({
			valid: ["TASK-2"],
			invalid: ["missing"],
		});
	});

	it("rejects self-dependencies and cycles and permits repairing existing cycles", () => {
		const first = task("TASK-1", ["TASK-2"]);
		const second = task("TASK-2", ["TASK-1"]);
		const validator = new DependencyValidator([first, second]);
		expect(() => validator.validate(["TASK-1"], first)).toThrow("cannot depend on itself");
		expect(() => validator.validate(["TASK-2"], first)).toThrow("would create a cycle");
		expect(validator.validate([], first)).toEqual({ valid: [], invalid: [] });
	});
});
