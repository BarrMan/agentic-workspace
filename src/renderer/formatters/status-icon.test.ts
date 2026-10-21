import { describe, expect, test } from "bun:test";
import {
	formatStatusWithIcon,
	getActivityColor,
	getIndicationColor,
	getSelectedActivityColor,
	getSelectedIndicationColor,
	getStatusStyle,
} from "./status-icon.ts";

describe("Status Icon Component", () => {
	describe("getStatusStyle", () => {
		test("returns correct style for Done status", () => {
			const style = getStatusStyle("Done");
			expect(style.icon).toBe("✔");
			expect(style.color).toBe("green");
		});

		test("returns correct style for In Progress status", () => {
			const style = getStatusStyle("In Progress");
			expect(style.icon).toBe("◒");
			expect(style.color).toBe("yellow");
		});

		test("returns correct style for Blocked status", () => {
			const style = getStatusStyle("Blocked");
			expect(style.icon).toBe("●");
			expect(style.color).toBe("red");
		});

		test("returns correct style for To Do status", () => {
			const style = getStatusStyle("To Do");
			expect(style.icon).toBe("○");
			expect(style.color).toBe("default");
		});

		test("returns correct style for Review status", () => {
			const style = getStatusStyle("Review");
			expect(style.icon).toBe("◆");
			expect(style.color).toBe("blue");
		});

		test("returns correct style for Testing status", () => {
			const style = getStatusStyle("Testing");
			expect(style.icon).toBe("▣");
			expect(style.color).toBe("cyan");
		});

		test("returns default style for unknown status", () => {
			const style = getStatusStyle("Unknown Status");
			expect(style.icon).toBe("○");
			expect(style.color).toBe("default");
		});

		test("matches built-in status labels exactly", () => {
			expect(getStatusStyle("in progress").icon).toBe("○");
			expect(getStatusStyle(" in progress ").icon).toBe("○");
			expect(getStatusStyle("InProgress").icon).toBe("○");
		});
	});

	describe("getSelectedActivityColor", () => {
		test("maps each activity to a contrast-safe selected-row colour", () => {
			expect(getActivityColor("running")).toBe("brightgreen");
			expect(getActivityColor("waiting")).toBe("#f59e0b");
			expect(getActivityColor("idle")).toBe("#60a5fa");
			// `starting` is parked: it must read blue, never cyan.
			expect(getActivityColor("starting")).toBe("#60a5fa");
			expect(getSelectedActivityColor("running")).toBe("#166534");
			expect(getSelectedActivityColor("starting")).toBe("#1e40af");
			expect(getSelectedActivityColor("waiting")).toBe("#92400e");
			expect(getSelectedActivityColor("idle")).toBe("#1e40af");
			expect(getSelectedActivityColor("error")).toBe("#991b1b");
		});

		test("falls back to parked blue with no activity", () => {
			expect(getActivityColor(undefined)).toBe("#60a5fa");
			expect(getSelectedActivityColor(undefined)).toBe("#1e40af");
		});

		test("every selected colour keeps at least a 4.5 contrast ratio on the selection fill", () => {
			const background = [203, 213, 225];
			const contrast = (foreground: readonly number[], back: readonly number[]): number => {
				const luminance = (color: readonly number[]): number => {
					const channels = color.slice(0, 3).map((value) => {
						const channel = value / 255;
						return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
					});
					return (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722;
				};
				const first = luminance(foreground);
				const second = luminance(back);
				return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
			};
			const parse = (hex: string): number[] => [
				Number.parseInt(hex.slice(1, 3), 16),
				Number.parseInt(hex.slice(3, 5), 16),
				Number.parseInt(hex.slice(5, 7), 16),
			];
			for (const activity of ["starting", "running", "waiting", "idle", "error", undefined] as const) {
				expect(contrast(parse(getSelectedActivityColor(activity)), background)).toBeGreaterThan(4.5);
			}
		});
	});

	describe("getIndicationColor", () => {
		test("maps the settled four-state indication contract", () => {
			expect(getIndicationColor("working")).toBe("brightgreen");
			expect(getIndicationColor("waiting")).toBe("#f59e0b");
			expect(getIndicationColor("error")).toBe("red");
			expect(getIndicationColor("parked")).toBe("#60a5fa");
			expect(getSelectedIndicationColor("working")).toBe("#166534");
			expect(getSelectedIndicationColor("waiting")).toBe("#92400e");
			expect(getSelectedIndicationColor("error")).toBe("#991b1b");
			expect(getSelectedIndicationColor("parked")).toBe("#1e40af");
		});
	});

	describe("formatStatusWithIcon", () => {
		test("formats status with correct icon", () => {
			expect(formatStatusWithIcon("Done")).toBe("✔ Done");
			expect(formatStatusWithIcon("In Progress")).toBe("◒ In Progress");
			expect(formatStatusWithIcon("Blocked")).toBe("● Blocked");
			expect(formatStatusWithIcon("To Do")).toBe("○ To Do");
			expect(formatStatusWithIcon("Review")).toBe("◆ Review");
			expect(formatStatusWithIcon("Testing")).toBe("▣ Testing");
		});

		test("formats unknown status with default icon", () => {
			expect(formatStatusWithIcon("Custom Status")).toBe("○ Custom Status");
		});
	});
});
