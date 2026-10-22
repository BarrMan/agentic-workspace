import { describe, expect, it } from "bun:test";
import { AmbiguousTaskIdError } from "../errors/task-id.ts";
import type { Task } from "../types.ts";
import { DependencyValidator } from "./dependency-validator.ts";

function task(id: string, dependencies: string[] = []): Task {
	return { id, title: id, status: "To Do", createdDate: "2026-10-10", labels: [], dependencies };
}

describe("DependencyValidator loaded-corpus boundary", () => {
	it("validates replacements and additions synchronously from all supplied records", () => {
		const validator = new DependencyValidator([
			task("TASK-1"),
			{ ...task("TASK-2"), source: "completed" },
			task("TASK-3"),
		]);
		expect(
			validator.validateUpdates(
				{ replacement: ["TASK-2", "task-2", "missing"], additions: ["TASK-3"] },
				task("TASK-1"),
			),
		).toEqual({
			replacement: { valid: ["TASK-2"], invalid: ["missing"] },
			additions: { valid: ["TASK-3"], invalid: [] },
		});
	});

	it("rejects duplicate records instead of using a de-duplicated projection", () => {
		const validator = new DependencyValidator([
			{ ...task("TASK-2"), filePath: "/active/task.md" },
			{ ...task("TASK-2"), filePath: "/completed/task.md" },
		]);
		expect(() => validator.validate(["task-2"], task("TASK-1"))).toThrow(AmbiguousTaskIdError);
	});

	it("rejects self-dependencies and cycles and permits repairing existing cycles", () => {
		const first = task("TASK-1", ["TASK-2"]);
		const second = task("TASK-2", ["TASK-1"]);
		const validator = new DependencyValidator([first, second]);
		expect(() => validator.validate(["task-1"], first)).toThrow("cannot depend on itself");
		expect(() => validator.validate(["TASK-2"], first)).toThrow("would create a cycle");
		expect(validator.validate([], first)).toEqual({ valid: [], invalid: [] });
	});

	it("fails closed when a cycle path traverses an ambiguous identity", () => {
		const validator = new DependencyValidator([
			task("TASK-2", ["TASK-3"]),
			{ ...task("TASK-3", ["TASK-1"]), filePath: "/active/task.md" },
			{ ...task("TASK-3"), filePath: "/completed/task.md" },
		]);
		expect(() => validator.validate(["TASK-2"], task("TASK-1"))).toThrow("more than one record claims");
	});
});
