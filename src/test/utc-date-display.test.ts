import { describe, expect, it } from "bun:test";
import { toTaskDetail } from "../controller/task-detail.ts";
import type { Task } from "../model/types.ts";
import { formatTaskPlainText } from "../renderer/formatters/task-plain-text.ts";
import { formatUtcDateForDisplay } from "../renderer/formatters/utc-date-display.ts";

describe("UTC date display", () => {
	it("formats stored UTC task dates without applying the local timezone", () => {
		expect(formatUtcDateForDisplay("2026-06-07 21:54")).toBe("2026-06-07 21:54");
		expect(formatUtcDateForDisplay("2026-06-07T21:54")).toBe("2026-06-07 21:54");
		expect(formatUtcDateForDisplay("2026-06-07")).toBe("2026-06-07");
	});

	it("normalizes explicit timezone datetimes to UTC display text", () => {
		expect(formatUtcDateForDisplay("2026-06-07T23:54+02:00")).toBe("2026-06-07 21:54");
		expect(formatUtcDateForDisplay("2026-06-07 16:24-0530")).toBe("2026-06-07 21:54");
	});

	it("keeps timezone-less values in UTC under a non-UTC process timezone", () => {
		const previousTimezone = process.env.TZ;
		process.env.TZ = "America/Los_Angeles";
		try {
			expect(formatUtcDateForDisplay("2026-06-07 21:54", { dateFormat: "dd/MM/yyyy" })).toBe("07/06/2026 21:54");
			expect(formatUtcDateForDisplay("2026-06-07T23:54+02:00", { dateFormat: "dd/MM/yyyy" })).toBe("07/06/2026 21:54");
		} finally {
			if (previousTimezone === undefined) delete process.env.TZ;
			else process.env.TZ = previousTimezone;
		}
	});

	it("appends a UTC label for plain text surfaces", () => {
		expect(formatUtcDateForDisplay("2026-06-07", { appendUtcLabel: true })).toBe("2026-06-07 (UTC)");
		expect(formatUtcDateForDisplay("2026-06-07 21:54", { appendUtcLabel: true })).toBe("2026-06-07 21:54 (UTC)");
	});

	it("rearranges dates using a custom display format", () => {
		expect(formatUtcDateForDisplay("2026-07-04 21:54", { dateFormat: "dd/MM/yyyy" })).toBe("04/07/2026 21:54");
		expect(formatUtcDateForDisplay("2026-07-04", { dateFormat: "dd/MM/yyyy" })).toBe("04/07/2026");
		expect(formatUtcDateForDisplay("2026-07-04", { dateFormat: "dd.MM.yyyy" })).toBe("04.07.2026");
	});

	it("uses date-only Luxon tokens and appends times only for timestamps", () => {
		expect(formatUtcDateForDisplay("2026-07-04 21:54", { dateFormat: "yyyy-MM-dd" })).toBe("2026-07-04 21:54");
		expect(formatUtcDateForDisplay("2026-07-04", { dateFormat: "yyyy-MM-dd" })).toBe("2026-07-04");
		expect(formatUtcDateForDisplay("2026-07-04", { dateFormat: undefined })).toBe("2026-07-04");
		expect(formatUtcDateForDisplay("2026-07-04", { dateFormat: "dd MMM yyyy" })).toBe("04 Jul 2026");
		expect(formatUtcDateForDisplay("2026-07-04T00:00:00Z", { dateFormat: "dd MMM yyyy" })).toBe("04 Jul 2026 00:00");
	});

	it("never invents a time for date-only values but always shows stored times", () => {
		expect(formatUtcDateForDisplay("2026-07-04", { dateFormat: "dd/MM/yyyy" })).toBe("04/07/2026");
		expect(formatUtcDateForDisplay("2026-07-04 21:54", { dateFormat: "dd/MM/yyyy" })).toBe("04/07/2026 21:54");
	});

	it("returns unparseable stored values as-is even with a format", () => {
		expect(formatUtcDateForDisplay("not a date", { dateFormat: "dd/MM/yyyy" })).toBe("not a date");
		expect(formatUtcDateForDisplay("2026-07-04 (UTC)")).toBe("2026-07-04 (UTC)");
	});

	it("normalizes explicit-offset values to UTC before applying the format", () => {
		expect(formatUtcDateForDisplay("2026-07-04T23:54+02:00", { dateFormat: "dd/MM/yyyy" })).toBe("04/07/2026 21:54");
	});

	it("combines the UTC label with a custom format", () => {
		expect(formatUtcDateForDisplay("2026-07-04 21:54", { dateFormat: "dd/MM/yyyy", appendUtcLabel: true })).toBe(
			"04/07/2026 21:54 (UTC)",
		);
	});

	it("adds UTC labels to plain task date fields", () => {
		const task: Task = {
			id: "TASK-1",
			title: "UTC plain output",
			status: "To Do",
			done: false,
			createdDate: "2026-06-07",
			updatedDate: "2026-06-07 21:54",
			labels: [],
			dependencies: [],
			description: "Task description",
		};

		const output = formatTaskPlainText(toTaskDetail(task, { tasks: [task], completedTasks: [] }));

		expect(output).toContain("Created: 2026-06-07 (UTC)");
		expect(output).toContain("Updated: 2026-06-07 21:54 (UTC)");
	});
});
