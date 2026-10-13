import { describe, expect, it } from "bun:test";
import type { Task } from "../types/index.ts";
import {
	changedTaskFields,
	createWorkspaceDraft,
	taskWithWorkspaceDraft,
} from "../ui/opentui/workspace/model/drafts.ts";

const task = (id: string, status: string): Task => ({
	id,
	title: id,
	status,
	assignee: [],
	createdDate: "2026-01-01",
	labels: [],
	dependencies: [],
});

describe("agent workspace model", () => {
	it("keeps task editing state independent across drafts", () => {
		const first = createWorkspaceDraft({ ...task("BACK-1", "To Do"), description: "one" });
		const second = createWorkspaceDraft({ ...task("BACK-2", "To Do"), description: "two" });
		first.values.description = "draft one";
		first.values.type = "bug";
		first.values.priority = "high";
		expect(second.values.description).toBe("two");
		expect(second.values.type).toBe("");
		expect(second.values.priority).toBe("");
	});

	it("only saves fields changed against their original task revision", () => {
		const original = { ...task("BACK-1", "To Do"), description: "old" };
		const draft = createWorkspaceDraft(original);
		draft.values.description = "mine";
		expect(changedTaskFields(draft, original)).toEqual({ description: "mine" });
		expect(() => changedTaskFields(draft, { ...original, description: "theirs" })).toThrow("description changed");
	});

	it("renders workspace drafts without mutating the selected task", () => {
		const original = {
			...task("BACK-1", "To Do"),
			title: "Saved",
			description: "saved",
			type: "bug",
			priority: "low",
		};
		const draft = createWorkspaceDraft(original);
		draft.values.title = "Draft";
		draft.values.description = "draft";
		draft.values.type = "feature";
		draft.values.priority = "high";
		const rendered = taskWithWorkspaceDraft(original, draft);
		expect(rendered).toMatchObject({ title: "Draft", description: "draft", type: "feature", priority: "high" });
		expect(original.title).toBe("Saved");
	});
});
