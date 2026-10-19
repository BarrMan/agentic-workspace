import { describe, expect, it } from "bun:test";
import { formatKey, formatKeymap, keymapKeys, metaModifierLabel, uiKeymap } from "../renderer/opentui/keymap.ts";

describe("TUI keymap", () => {
	it("exposes the canonical binding lists per context", () => {
		expect(keymapKeys("shared", "quit")).toEqual(["C-c"]);
		expect(keymapKeys("board", "workspace")).toEqual(["S-b", "C-q"]);
		expect(keymapKeys("workspace", "quickPreviewExit")).toEqual(["C-q", "C-c"]);
		expect(keymapKeys("board", "first")).toContain("g");
		expect(keymapKeys("board", "last")).toContain("G");
		// The returned list is a copy, so mutating it cannot corrupt the registry.
		const keys = keymapKeys("board", "workspace");
		keys.push("x");
		expect(uiKeymap.board.workspace).not.toContain("x");
	});

	it("formats single keys with terminal notation and modifiers", () => {
		expect(formatKey("escape")).toBe("Esc");
		expect(formatKey("enter")).toBe("Enter");
		expect(formatKey("return")).toBe("Enter");
		expect(formatKey("space")).toBe("Space");
		expect(formatKey("pageup")).toBe("PgUp");
		expect(formatKey("pagedown")).toBe("PgDn");
		expect(formatKey("home")).toBe("Home");
		expect(formatKey("end")).toBe("End");
		expect(formatKey("left")).toBe("←");
		expect(formatKey("right")).toBe("→");
		expect(formatKey("up")).toBe("↑");
		expect(formatKey("down")).toBe("↓");
		expect(formatKey("tab")).toBe("Tab");
		expect(formatKey("g")).toBe("G");
		expect(formatKey("C-q")).toBe("Ctrl+Q");
		expect(formatKey("M-b")).toBe(`${metaModifierLabel()}+B`);
		expect(formatKey("S-b")).toBe("Shift+B");
		expect(formatKey("C-[")).toBe("Ctrl+[");
	});

	it("renders meta aliases with a platform-specific label", () => {
		expect(metaModifierLabel("darwin")).toBe("Option");
		expect(metaModifierLabel("linux")).toBe("Alt");

		const label = metaModifierLabel();
		expect(formatKey("M-g")).toBe(`${label}+G`);
		expect(formatKey("Alt-g")).toBe(`${label}+G`);
		expect(formatKey("Option-g")).toBe(`${label}+G`);
		expect(formatKey("A-g")).toBe(`${label}+G`);
		expect(formatKey("C-g")).toBe("Ctrl+G");
	});

	it("formats established bindings, preferring compact labels where declared", () => {
		expect(formatKeymap("workspace", "quickPreviewExit")).toBe("Ctrl+Q/Ctrl+C");
		expect(formatKeymap("board", "moveHighlight")).toBe("Shift+↑↓");
		expect(formatKeymap("board", "recruit")).toBe("Shift+M");
		expect(formatKeymap("board", "toggleHideEmpty")).toBe("H");
		expect(formatKeymap("board", "first")).toBe("Home");
		expect(formatKeymap("shared", "quit")).toBe("Ctrl+C");
	});
});
