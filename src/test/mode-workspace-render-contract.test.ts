import { afterEach, describe, expect, it } from "bun:test";
import { BoxRenderable, TextAttributes } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import type { OpenTuiWorkspaceOptions } from "../renderer/opentui/workspace.ts";
import { mountOpenTuiWorkspace } from "../renderer/opentui/workspace.ts";

function plainContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) return content.map(plainContent).join("");
	if (content && typeof content === "object") {
		if ("chunks" in content && Array.isArray(content.chunks)) {
			return content.chunks.map((chunk: unknown) => plainContent(chunk)).join("");
		}
		if ("text" in content && typeof content.text === "string") return content.text;
		if ("_string" in content && typeof content._string === "string") return content._string;
	}
	return typeof content === "number" || typeof content === "boolean" ? String(content) : "";
}

describe("workspace mode row render contract", () => {
	const renderers: TestRendererSetup[] = [];
	afterEach(() => {
		for (const setup of renderers.splice(0)) setup.renderer.destroy();
	});

	it("renders configured mode metadata independently of activity and keeps narrow rows title-only", async () => {
		const setup = await createTestRenderer({ width: 120, height: 36 });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const tasks = [
			{ id: "TASK-1", title: "A sufficiently long title for the normal row", status: "To Do", done: false },
			{ id: "TASK-2", title: "Approved title", status: "To Do", done: false },
			{ id: "TASK-3", title: "界", status: "Done", done: true },
		];
		const projections = new Map([
			["TASK-1", { modeLabel: "Build", approved: false }],
			["TASK-2", { modeLabel: "Review", approved: true }],
			["TASK-3", { modeLabel: "Review", approved: true }],
		]);
		const options: OpenTuiWorkspaceOptions = {
			tasks,
			statuses: ["To Do", "Done"],
			selectedTaskIndex: 0,
			modeProjectionByTask: (id) => projections.get(id),
			indicationByTask: new Map([["TASK-1", "working"]]),
		};
		const mount = mountOpenTuiWorkspace(setup.renderer, parent, options);
		try {
			await setup.flush();
			let frame = setup.captureCharFrame();
			const buildTitle = plainContent(tasks.find((task) => task.id === "TASK-1")?.title);
			const approvedTitle = plainContent(tasks.find((task) => task.id === "TASK-2")?.title);
			const buildRow = frame.split("\n").find((line) => line.includes(buildTitle)) ?? "";
			expect(buildRow).toContain("Build");
			expect(frame).not.toContain("working");
			setup.resize(20, 36);
			await setup.flush();
			frame = setup.captureCharFrame();
			const narrowRows = frame.split("\n");
			expect(narrowRows.every((line) => Bun.stringWidth(line) <= 20)).toBe(true);
			expect(frame).not.toContain("Review");
			const spans = setup.captureSpans().lines.flatMap((line) => line.spans);
			expect(spans.some((span) => (span.attributes & TextAttributes.STRIKETHROUGH) !== 0)).toBe(true);
			const approvedSetup = await createTestRenderer({ width: 120, height: 36 });
			renderers.push(approvedSetup);
			const approvedParent = new BoxRenderable(approvedSetup.renderer, { width: "100%", height: "100%" });
			approvedSetup.renderer.root.add(approvedParent);
			const approvedTasks = [tasks[1]!, tasks[0]!, tasks[2]!];
			const approvedMount = mountOpenTuiWorkspace(approvedSetup.renderer, approvedParent, {
				...options,
				tasks: approvedTasks,
				selectedTaskIndex: 0,
			});
			await approvedSetup.flush();
			frame = approvedSetup.captureCharFrame();
			const selectedReviewRow = frame.split("\n").find((line) => line.includes(approvedTitle)) ?? "";
			expect(selectedReviewRow).toContain("Review ✓");
			expect(buildRow.indexOf("Build") + "Build".length).toBe(
				selectedReviewRow.indexOf("Review ✓") + "Review ✓".length,
			);
			approvedMount.dispose();
		} finally {
			mount.dispose();
		}
	});
});
