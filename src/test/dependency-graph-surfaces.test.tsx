import { describe, expect, it } from "bun:test";
import { parseColor, StyledText } from "@opentui/core";
import { toTaskDetail } from "../controller/task-detail.ts";
import type { Task } from "../model/types.ts";
import { generateTaskDetailSections } from "../renderer/opentui/task-detail-content.ts";

function makeTask(id: string, title: string, dependencies: string[] = [], status = "To Do", done = false): Task {
	return { id, title, status, done, createdDate: "2026-01-01", labels: [], dependencies };
}

const CORPUS = [
	makeTask("BACK-1", "Foundation", [], "Done", true),
	makeTask("BACK-2", "Selected", ["BACK-1", "BACK-404"]),
	makeTask("BACK-3", "Follow up", ["BACK-2"]),
	makeTask("BACK-4", "Later", ["BACK-3"]),
];

type DetailChunk = StyledText["chunks"][number];

// A detail read hands the viewer a task that already carries its graph; every other caller hands it
// a plain record. The viewer only renders what it was given.
function detailStyled(task: Task, asDetail: boolean): StyledText {
	const given = asDetail ? toTaskDetail(task, { tasks: CORPUS, completedTasks: [] }) : task;
	const sections = generateTaskDetailSections(given);
	return new StyledText([
		...sections.beforeDescription.chunks,
		{ __isChunk: true, text: sections.description },
		...sections.afterDescription.chunks,
	]);
}

function detailBody(task: Task, asDetail: boolean): string {
	return detailStyled(task, asDetail)
		.chunks.map((chunk) => chunk.text)
		.join("");
}

function chunkFor(styled: StyledText, text: string): DetailChunk | undefined {
	return styled.chunks.find((chunk) => chunk.text === text);
}

describe("OpenTUI dependency graph section", () => {
	const selected = CORPUS[1] as Task;

	it("shows both directions with direct and transitive counts", () => {
		const body = detailBody(selected, true);

		expect(body).toContain("Dependency Graph");
		expect(body).toContain("Depends on (2 direct, 2 total):");
		expect(body).toContain("Dependents (1 direct, 2 total):");
		expect(body).toContain("└─ BACK-3 - Follow up [To Do]");
		expect(body).toContain("   └─ BACK-4 - Later [To Do]");
	});

	it("replaces the raw dependency ID list and sits directly above the description", () => {
		const body = detailBody(selected, true);

		// Same relative position as the canonical CLI plain output.
		expect(body).not.toContain("Dependencies:");
		expect(body.indexOf("Dependency Graph")).toBeLessThan(body.indexOf("Description"));
		expect(body.indexOf("Details")).toBeLessThan(body.indexOf("Dependency Graph"));
	});

	it("colors finished and unresolved nodes without changing the shared wording", () => {
		const styled = detailStyled(selected, true);

		// The shared formatter decides the wording; the styled surface only tints the node label.
		const completed = chunkFor(styled, "BACK-1 - Foundation [completed]");
		expect(completed?.fg?.equals(parseColor("gray"))).toBe(true);

		const unresolved = chunkFor(styled, "BACK-404 - unknown task ID");
		expect(unresolved?.fg?.equals(parseColor("yellow"))).toBe(true);
	});

	it("renders a title containing tag-like brace syntax as literal characters", () => {
		const styled = makeTask("BACK-7", "Style {red-fg}accent{/} braces");
		const root = makeTask("BACK-8", "Root", ["BACK-7"]);
		const detail = toTaskDetail(root, { tasks: [root, styled], completedTasks: [] });
		const body = generateTaskDetailSections(detail)
			.beforeDescription.chunks.map((chunk) => chunk.text)
			.join("");

		expect(body).toContain("BACK-7 - Style {red-fg}accent{/} braces [To Do]");
	});

	it("leaves the board quick-look popup and other graph-less callers unchanged", () => {
		// The popup passes no graph, so it renders exactly what it rendered before.
		expect(detailBody(selected, false)).not.toContain("Dependency Graph");
		expect(detailBody(selected, false)).not.toContain("Depends on");
	});

	it("omits the section for a task with no dependencies and no dependents", () => {
		const isolated = makeTask("BACK-9", "Alone");
		const detail = toTaskDetail(isolated, { tasks: [isolated], completedTasks: [] });

		expect(
			generateTaskDetailSections(detail)
				.beforeDescription.chunks.map((chunk) => chunk.text)
				.join(""),
		).not.toContain("Dependency Graph");
	});
});
