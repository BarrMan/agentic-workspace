import { describe, expect, it } from "bun:test";
import { formatKey, formatKeymap, keymapKey, metaModifierLabel, uiKeymap } from "./keymap.ts";

describe("TUI keymap", () => {
	it("exposes one canonical binding per context and action", () => {
		for (const context of Object.values(uiKeymap)) {
			for (const binding of Object.values(context)) expect(typeof binding).toBe("string");
		}
		expect(keymapKey("shared", "quit")).toBe("C-c");
		expect(keymapKey("board", "workspace")).toBe("S-b");
		expect(keymapKey("workspace", "quickPreviewExit")).toBe("C-q");
		expect(keymapKey("board", "first")).toBe("g");
		expect(keymapKey("board", "last")).toBe("S-g");
		expect(uiKeymap.board.first).toBe("g");
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
		expect(formatKey("g")).toBe("g");
		expect(formatKey("C-q")).toBe("Ctrl+Q");
		expect(formatKey("M-b")).toBe(`${metaModifierLabel()}+B`);
		expect(formatKey("S-b")).toBe("Shift+B");
		expect(formatKey("C-[")).toBe("Ctrl+[");
		expect(formatKey("S-up")).toBe("Shift+↑");
		expect(formatKey("C-S-up")).toBe("Ctrl+Shift+↑");
		expect(formatKey("M-S-g")).toBe(`${metaModifierLabel()}+Shift+G`);
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

	it("formats canonical bindings from their actual modifiers", () => {
		expect(formatKeymap("workspace", "quickPreviewExit")).toBe("Ctrl+Q");
		expect(formatKeymap("board", "moveHighlight")).toBe("Shift+↑");
		expect(formatKeymap("board", "recruit")).toBe("Shift+M");
		expect(formatKeymap("board", "toggleHideEmpty")).toBe("Shift+H");
		expect(formatKeymap("board", "first")).toBe("g");
		expect(formatKeymap("board", "last")).toBe("Shift+G");
		expect(formatKeymap("shared", "quit")).toBe("Ctrl+C");
	});
});
