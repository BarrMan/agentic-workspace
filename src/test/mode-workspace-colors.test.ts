import { describe, expect, it } from "bun:test";
import { BoxRenderable, TextAttributes } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import type { AgentHost } from "../agent-workspace/live/agent-host.ts";
import { renderModeRowLabel } from "../ui/opentui/mode-row-label.ts";
import { mountOpenTuiWorkspace, type OpenTuiWorkspaceModeProjection } from "../ui/opentui/workspace.ts";
import { createWorkspaceAgent } from "../ui/opentui/workspace-agent.ts";

function spanAt(setup: TestRendererSetup, x: number, y: number) {
	let column = 0;
	for (const span of setup.captureSpans().lines[y]?.spans ?? []) {
		if (x < column + span.width) return span;
		column += span.width;
	}
	throw new Error(`No span at ${x},${y}`);
}

function contrast(first: readonly number[], second: readonly number[]): number {
	const luminance = (rgb: readonly number[]) =>
		rgb.slice(0, 3).reduce((sum, channel, index) => {
			const value = channel / 255;
			return (
				sum +
				(value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) * ([0.2126, 0.7152, 0.0722][index] ?? 0)
			);
		}, 0);
	const a = luminance(first);
	const b = luminance(second);
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("mode name color projection", () => {
	it("keeps selected-row background cells inside the task-list content at narrow and wide widths", async () => {
		for (const width of [120, 160]) {
			const setup = await createTestRenderer({ width, height: 28 });
			const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
			setup.renderer.root.add(parent);
			const tasks = [
				{ id: "TASK-1", title: "Plan title", status: "To Do" },
				{ id: "TASK-2", title: "Completed title", status: "Done" },
			];
			const mount = mountOpenTuiWorkspace(setup.renderer, parent, {
				tasks,
				statuses: ["To Do", "Done"],
				selectedTaskIndex: 0,
				modeProjectionByTask: (id) =>
					id === "TASK-1" ? { modeLabel: "Build", approved: true, modeColor: "green" } : undefined,
				indicationByTask: new Map([["TASK-1", "working"]]),
			});
			try {
				await setup.flush();
				const frame = setup.captureCharFrame().split("\n");
				const spans = setup.captureSpans().lines;
				const selectedY = frame.findIndex((line) => line.includes("Plan title"));
				expect(selectedY).toBeGreaterThanOrEqual(0);
				const titleX = (frame[selectedY] ?? "").indexOf("Plan title");
				const titleSpan = spanAt(setup, titleX, selectedY);
				expect(titleSpan.bg.toInts()).toEqual([203, 213, 225, 255]);
				const listTitleY = frame.findIndex((line) => line.includes("Tasks (2)"));
				const leftBorder = frame[listTitleY + 1]?.indexOf("│") ?? -1;
				const rightBorder = frame[listTitleY + 1]?.indexOf("│", leftBorder + 1) ?? -1;
				expect(leftBorder).toBeGreaterThanOrEqual(0);
				expect(rightBorder).toBeGreaterThan(leftBorder);
				expect(titleX).toBeGreaterThan(leftBorder);
				expect(titleX).toBeLessThan(rightBorder);
				let cellX = 0;
				const selectedCells: number[] = [];
				for (const span of spans[selectedY]?.spans ?? []) {
					if (span.bg.toInts().slice(0, 3).join(",") === "203,213,225") {
						for (let cell = cellX; cell < cellX + span.width; cell += 1) selectedCells.push(cell);
					}
					cellX += span.width;
				}
				expect(Math.min(...selectedCells)).toBe(leftBorder + 1);
				expect(Math.max(...selectedCells)).toBe(rightBorder - 1);
				expect(selectedCells).toHaveLength(rightBorder - leftBorder - 1);
				expect(frame.some((line) => line.includes("Build"))).toBe(true);
				expect(frame.some((line) => line.includes("Agent session"))).toBe(true);
			} finally {
				mount.dispose();
				setup.renderer.destroy();
			}
		}
	});

	it("tracks cell and character ranges independently of repeated titles and clipping", () => {
		for (const width of [0, 1, 3, 8, 12, 20, 35]) {
			for (const modeLabel of ["Plan", "界😀Review", "", "A very long configured mode"]) {
				const row = renderModeRowLabel({
					title: `${modeLabel} 界😀`,
					modeLabel,
					approved: true,
					selected: true,
					width,
					depth: 1,
				});
				expect(Bun.stringWidth(row.text)).toBeLessThanOrEqual(width);
				expect(row.mode.start).toBeLessThanOrEqual(row.mode.end);
				expect(row.mode.end).toBeLessThanOrEqual(Bun.stringWidth(row.text));
				expect(Bun.stringWidth(row.text.slice(0, row.mode.characterStart))).toBe(row.mode.start);
				expect(Bun.stringWidth(row.text.slice(0, row.mode.characterEnd))).toBe(row.mode.end);
				expect(row.text.slice(row.mode.characterStart, row.mode.characterEnd)).not.toContain("✓");
			}
		}
		const row = renderModeRowLabel({ title: "Plan", modeLabel: "Plan", approved: true, selected: true, width: 30 });
		expect(row.text.slice(row.mode.characterStart, row.mode.characterEnd)).toBe("Plan");
		expect(row.mode.start).toBeGreaterThan(row.title.end);
	});

	it("colors only mode names, preserves selection/activity/approval, and updates empty preview identity", async () => {
		const setup = await createTestRenderer({ width: 120, height: 36 });
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const tasks = [
			{ id: "TASK-1", title: "Plan title", status: "To Do" },
			{ id: "TASK-2", title: "Other title", status: "To Do" },
			{ id: "TASK-3", title: "Colorless title", status: "To Do" },
		];
		const modes = new Map<string, OpenTuiWorkspaceModeProjection>([
			["TASK-1", { modeLabel: "Plan", approved: true, modeColor: "green" }],
			["TASK-2", { modeLabel: "Build", approved: true, modeColor: "blue" }],
			["TASK-3", { modeLabel: "Review", approved: false }],
		]);
		const options = {
			tasks,
			statuses: ["To Do"],
			modeProjectionByTask: (id: string) => modes.get(id),
			indicationByTask: new Map([["TASK-1", "working" as const]]),
		};
		const mount = mountOpenTuiWorkspace(setup.renderer, parent, options);
		try {
			await setup.flush();
			let lines = setup.captureCharFrame().split("\n");
			const y = lines.findIndex((line) => line.includes("Plan title"));
			const line = lines[y] ?? "";
			const title = spanAt(setup, line.indexOf("Plan title"), y);
			const mode = spanAt(setup, line.indexOf("Plan ✓"), y);
			const approval = spanAt(setup, line.indexOf("✓"), y);
			const marker = spanAt(setup, line.indexOf("●"), y);
			expect(title.fg.toInts()).toEqual([17, 17, 17, 255]);
			expect(title.bg.toInts()).toEqual([203, 213, 225, 255]);
			expect(mode.fg.toInts()).not.toEqual(title.fg.toInts());
			expect(mode.bg.toInts()).toEqual(title.bg.toInts());
			expect(mode.attributes & TextAttributes.BOLD).toBe(TextAttributes.BOLD);
			expect(contrast(mode.fg.toInts(), mode.bg.toInts())).toBeGreaterThanOrEqual(4.5);
			expect(approval.fg.toInts()).toEqual(title.fg.toInts());
			expect(marker.fg.toInts()).toEqual([22, 101, 52, 255]);
			const otherY = lines.findIndex((row) => row.includes("Other title"));
			expect(lines[otherY]).not.toContain("Build");
			expect(lines[otherY]).not.toContain("✓");
			const colorlessY = lines.findIndex((row) => row.includes("Colorless title"));
			expect(lines[colorlessY]).not.toContain("Review");
			setup.mockInput.pressArrow("down");
			await setup.flush();
			lines = setup.captureCharFrame().split("\n");
			const build = spanAt(setup, (lines[otherY] ?? "").indexOf("Build"), otherY);
			expect(build.bg.toInts()).toEqual(title.bg.toInts());
			expect(contrast(build.fg.toInts(), build.bg.toInts())).toBeGreaterThanOrEqual(4.5);
			expect(lines[y]).not.toContain("Plan ✓");
			expect(spanAt(setup, (lines[y] ?? "").indexOf("●"), y).fg.toInts()).toEqual([102, 255, 102, 255]);
			setup.mockInput.pressArrow("down");
			await setup.flush();
			lines = setup.captureCharFrame().split("\n");
			const review = spanAt(setup, (lines[colorlessY] ?? "").indexOf("Review"), colorlessY);
			expect(review.fg.toInts()).toEqual(title.fg.toInts());
			expect(contrast(review.fg.toInts(), review.bg.toInts())).toBeGreaterThanOrEqual(4.5);
			setup.mockInput.pressArrow("up");
			setup.mockInput.pressArrow("up");
			await setup.flush();
			lines = setup.captureCharFrame().split("\n");
			expect(lines.some((row) => row.includes("Agent session · Plan"))).toBe(true);
			modes.set("TASK-1", { modeLabel: "Custom theme", approved: false, modeColor: "brightmagenta" });
			mount.update(options);
			await setup.flush();
			lines = setup.captureCharFrame().split("\n");
			const headerY = lines.findIndex((row) => row.includes("Agent session · Custom theme"));
			expect(headerY).toBeGreaterThanOrEqual(0);
			const headerMode = spanAt(
				setup,
				(lines[headerY] ?? "").indexOf("Agent session · ") + "Agent session · ".length,
				headerY,
			);
			expect(contrast(headerMode.fg.toInts(), [17, 17, 17])).toBeGreaterThanOrEqual(4.5);
			expect(setup.captureCharFrame()).not.toContain("[object Object]");
		} finally {
			mount.dispose();
			setup.renderer.destroy();
		}
	});

	it("overlays the padded badge on a long title and restores every title cell on navigation", async () => {
		const setup = await createTestRenderer({ width: 120, height: 28 });
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const longTitle = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
		const mount = mountOpenTuiWorkspace(setup.renderer, parent, {
			tasks: [
				{ id: "TASK-1", title: longTitle, status: "Done" },
				{ id: "TASK-2", title: "Next task", status: "Done" },
			],
			statuses: ["To Do", "Done"],
			modeProjectionByTask: (id) => ({
				modeLabel: id === "TASK-1" ? "PLAN" : "BUILD",
				approved: true,
				modeColor: "green",
			}),
		});
		try {
			await setup.flush();
			let lines = setup.captureCharFrame().split("\n");
			const y = lines.findIndex((line) => line.includes("abcdefgh") && line.includes("PLAN ✓"));
			expect(y).toBeGreaterThanOrEqual(0);
			const left = (lines[y] ?? "").indexOf("│");
			const right = (lines[y] ?? "").indexOf("│", left + 1);
			const contentWidth = right - left - 1;
			const selectedContent = (lines[y] ?? "").slice(left + 1, right);
			expect(selectedContent).toBe(`  ${longTitle.slice(0, contentWidth - 10)} PLAN ✓ `);
			expect(selectedContent).not.toContain("…");
			expect(selectedContent).not.toContain("...");
			const modeX = (lines[y] ?? "").indexOf("PLAN ✓");
			const title = spanAt(setup, left + 3, y);
			expect(title.attributes & TextAttributes.STRIKETHROUGH).toBe(TextAttributes.STRIKETHROUGH);
			for (const x of [modeX - 1, modeX, modeX + 5, right - 1]) {
				const span = spanAt(setup, x, y);
				expect(span.bg.toInts()).toEqual(title.bg.toInts());
				expect(span.attributes & TextAttributes.STRIKETHROUGH).toBe(0);
			}
			setup.mockInput.pressArrow("down");
			await setup.flush();
			lines = setup.captureCharFrame().split("\n");
			expect((lines[y] ?? "").slice(left + 1, right)).toBe(`  ${longTitle.slice(0, contentWidth - 2)}`);
			expect(lines[y]).not.toContain("PLAN");
			const nextY = lines.findIndex((line) => line.includes("Next task") && line.includes("BUILD ✓"));
			expect(nextY).toBeGreaterThanOrEqual(0);
			expect((lines[nextY] ?? "").slice(left + 1, right)).toEndWith(" BUILD ✓ ");
			setup.mockInput.pressArrow("up");
			await setup.flush();
			lines = setup.captureCharFrame().split("\n");
			expect((lines[y] ?? "").slice(left + 1, right)).toBe(selectedContent);
			expect(lines[nextY]).not.toContain("BUILD");
		} finally {
			mount.dispose();
			setup.renderer.destroy();
		}
	});

	it("keeps wide and combining title graphemes intact through styled row ranges", async () => {
		const setup = await createTestRenderer({ width: 120, height: 28 });
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const title = "Cafe\u0301 界e\u0301";
		const mount = mountOpenTuiWorkspace(setup.renderer, parent, {
			tasks: [{ id: "TASK-1", title, status: "Done" }],
			statuses: ["To Do", "Done"],
			modeProjectionByTask: () => ({ modeLabel: "PLAN", approved: true, modeColor: "green" }),
		});
		try {
			await setup.flush();
			const lines = setup.captureCharFrame().split("\n");
			const y = lines.findIndex((line) => line.includes("PLAN ✓"));
			const line = lines[y] ?? "";
			expect(line).toContain(`  ${title}`);
			const modeX = Bun.stringWidth(line.slice(0, line.indexOf("PLAN ✓")));
			const mode = spanAt(setup, modeX, y);
			expect(mode.attributes & TextAttributes.STRIKETHROUGH).toBe(0);
			expect(mode.bg.toInts()).toEqual([203, 213, 225, 255]);
		} finally {
			mount.dispose();
			setup.renderer.destroy();
		}
	});

	it("updates header identity and keeps mode color independent of focus with a retained terminal", async () => {
		const setup = await createTestRenderer({ width: 120, height: 36 });
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const host = { sendBytes() {}, async resize() {} } as unknown as AgentHost;
		const terminal = createWorkspaceAgent(setup.renderer, host, 80, 24, (error) => {
			throw error;
		});
		let projection: OpenTuiWorkspaceModeProjection = { modeLabel: "Plan", approved: false, modeColor: "green" };
		const options = {
			tasks: [{ id: "TASK-1", title: "Retained task", status: "To Do" }],
			modeProjectionByTask: () => projection,
			liveAgent: { taskId: "TASK-1", label: "Retained", status: "running" as const, host, terminal },
		};
		const mount = mountOpenTuiWorkspace(setup.renderer, parent, options);
		try {
			await setup.flush();
			const terminalParent = terminal.parent;
			const headerColor = () => {
				const lines = setup.captureCharFrame().split("\n");
				const y = lines.findIndex((line) => line.includes("Agent session · Retained") && line.includes("Plan"));
				return spanAt(setup, (lines[y] ?? "").lastIndexOf("Plan"), y).fg.toInts();
			};
			const originalColor = headerColor();
			mount.update({ ...options, agentFocused: true });
			await setup.flush();
			expect(headerColor()).toEqual(originalColor);
			projection = { modeLabel: "Build", approved: false, modeColor: "blue" };
			mount.update({ ...options, agentFocused: true });
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Agent session · Retained · parked · Build");
			expect(terminal.parent).toBe(terminalParent);
			expect(terminal.isDestroyed).toBe(false);
		} finally {
			mount.dispose();
			setup.renderer.destroy();
		}
	});
});
