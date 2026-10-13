import { describe, expect, test } from "bun:test";
import { renderModeRowLabel } from "./mode-row-label.ts";

describe("mode row label public render output", () => {
	test("measures combining and wide Unicode text in terminal cells", () => {
		const rendered = renderModeRowLabel({
			title: "Cafe\u0301 界面",
			modeLabel: "PLAN",
			approved: false,
			selected: true,
			width: 18,
		});

		expect(Bun.stringWidth(rendered.text)).toBeLessThanOrEqual(18);
		expect(rendered.text).toContain("Cafe\u0301");
		expect(rendered.text).toContain("界");
	});

	test("keeps configured mode and approval suffix right-aligned, showing the check only when approved", () => {
		const approved = renderModeRowLabel({
			title: "Task",
			modeLabel: "PLAN",
			approved: true,
			selected: true,
			width: 24,
		});
		const draft = renderModeRowLabel({
			title: "Task",
			modeLabel: "PLAN",
			approved: false,
			selected: true,
			width: 24,
		});

		expect(approved.text.endsWith(" PLAN ✓ ")).toBe(true);
		expect(draft.text.endsWith(" PLAN ")).toBe(true);
		expect(draft.text).not.toContain("✓");
		expect(approved.modeHelp).toBe("PLAN ✓");
		expect(draft.modeHelp).toBe("PLAN");
		expect(Bun.stringWidth(approved.text)).toBe(24);
		expect(Bun.stringWidth(draft.text)).toBe(24);
	});

	test("selection preserves the original row prefix and the mode suffix at narrow widths", () => {
		const rendered = renderModeRowLabel({
			title: "A very long title",
			modeLabel: "BUILD",
			approved: true,
			selected: true,
			width: 10,
		});

		expect(rendered.text).toBe("  BUILD ✓ ");
		const unselected = renderModeRowLabel({
			title: "A very long title",
			modeLabel: "BUILD",
			approved: true,
			selected: false,
			width: 10,
		});
		expect(unselected.text).toBe("  A very l");
		expect(unselected.mode.start).toBe(unselected.mode.end);
		expect(Bun.stringWidth(rendered.text)).toBeLessThanOrEqual(10);
		expect(rendered.text).toContain("BUILD ✓");
		expect(rendered.modeHelp).toBe("BUILD ✓");
	});

	test("preserves original group indentation even at narrow widths", () => {
		const regular = renderModeRowLabel({
			title: "Child",
			modeLabel: "PLAN",
			approved: false,
			selected: true,
			depth: 2,
			width: 24,
		});
		const narrow = renderModeRowLabel({
			title: "Child",
			modeLabel: "PLAN",
			approved: false,
			selected: true,
			depth: 2,
			narrow: true,
			width: 24,
		});

		expect(regular.text.startsWith("      Child")).toBe(true);
		expect(narrow.text.startsWith("      Child")).toBe(true);
		expect(Bun.stringWidth(regular.text)).toBe(24);
		expect(Bun.stringWidth(narrow.text)).toBe(24);
	});

	test("keeps the activity marker in the original first column when selected", () => {
		const rendered = renderModeRowLabel({
			title: "Child",
			modeLabel: "BUILD",
			approved: false,
			selected: true,
			activityMarker: "●",
			depth: 1,
			width: 24,
		});

		expect(rendered.text.startsWith("●   Child")).toBe(true);
		expect(rendered.title.start).toBe(4);
		expect(rendered.text).toEndWith(" BUILD ");
	});

	test("clips long labels on cell boundaries while preserving metadata when it fits", () => {
		const rendered = renderModeRowLabel({
			title: "A title that is much longer than this row界",
			modeLabel: "BUILD",
			approved: true,
			selected: true,
			width: 20,
		});

		expect(Bun.stringWidth(rendered.text)).toBe(20);
		expect(rendered.text).toBe("  A title t BUILD ✓ ");
		expect(rendered.text).not.toContain("…");
		expect(rendered.text).not.toContain("...");
	});

	test("reports a done strike range for title cells only and exposes approval meaning as text", () => {
		const rendered = renderModeRowLabel({
			title: "Finished",
			modeLabel: "PLAN",
			approved: true,
			selected: true,
			done: true,
			width: 24,
		});

		expect(rendered.title.done).toBe(true);
		expect(rendered.title.start).toBe(2);
		expect(rendered.text.slice(rendered.title.start, rendered.title.end).trim()).toBe("Finished");
		expect(rendered.title.end).toBeLessThan(Bun.stringWidth(rendered.text));
		expect(rendered.modeHelp).toBe("PLAN ✓");
		expect(rendered.text.slice(rendered.title.end)).toContain("PLAN ✓");
	});

	test("unselected rows use all title cells without mode or approval space", () => {
		const row = renderModeRowLabel({
			title: "abcdefghijklmnopqrstuv",
			modeLabel: "PLAN",
			approved: true,
			width: 24,
		});
		expect(row.text).toBe("  abcdefghijklmnopqrstuv");
		expect(row.text.slice(row.mode.characterStart, row.mode.characterEnd)).toBe("");
	});

	test("clips whole graphemes and hides only badges that cannot fit beside activity", () => {
		for (const title of ["e\u0301界Z", "👩‍💻界Z"]) {
			const row = renderModeRowLabel({ title, modeLabel: "X", approved: false, selected: true, width: 7 });
			expect(row.text).toBe(`  ${title.startsWith("e") ? "e\u0301 " : "👩‍💻"} X `);
		}
		const options = { title: "界", modeLabel: "PLAN", approved: false, selected: true, activityMarker: "●", depth: 3 };
		expect(renderModeRowLabel({ ...options, width: 7 }).text).toBe("● PLAN ");
		const small = renderModeRowLabel({ ...options, width: 6 });
		expect(small.text).toBe("●     ");
		expect(small.mode.start).toBe(small.mode.end);
	});
});
