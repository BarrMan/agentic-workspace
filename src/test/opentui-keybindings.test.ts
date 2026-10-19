import { describe, expect, it } from "bun:test";
import type { KeyEvent } from "@opentui/core";
import {
	createKeybindings,
	findShortcutConflict,
	formatShortcut,
	matchesShortcut,
	type ShortcutOverrides,
	shortcutHelpItems,
	shortcutKeyFromEvent,
	shortcutsConfig,
} from "../renderer/opentui/keybindings.ts";
import { metaModifierLabel, uiKeymap } from "../renderer/opentui/keymap.ts";

function keyEvent(
	name: string,
	modifiers: Partial<Pick<KeyEvent, "ctrl" | "shift" | "meta" | "super" | "hyper" | "option" | "baseCode">> = {},
): KeyEvent {
	return { name, eventType: "press", stopPropagation: () => undefined, ...modifiers } as KeyEvent;
}

describe("OpenTUI keybinding adapter", () => {
	it("dispatches canonical remaps without retaining replaced shortcuts", () => {
		const keymap = uiKeymap as unknown as { board: { workspace: string[] } };
		const original = keymap.board.workspace;
		const keybindings = createKeybindings();
		let invocations = 0;
		try {
			keymap.board.workspace = ["x"];
			keybindings.on(shortcutsConfig.board.workspace, () => {
				invocations += 1;
			});

			expect(keybindings.dispatch(keyEvent("S-b", { shift: true }))).toBe(false);
			expect(keybindings.dispatch(keyEvent("x"))).toBe(true);
			expect(invocations).toBe(1);
		} finally {
			keymap.board.workspace = original;
		}
	});

	it("converts Ctrl, Shift, and Meta canonical modifiers", () => {
		const keymap = uiKeymap as unknown as { board: { workspace: string[] } };
		const original = keymap.board.workspace;
		try {
			expect(matchesShortcut(shortcutsConfig.shared.quit, keyEvent("c", { ctrl: true }))).toBe(true);
			expect(matchesShortcut(shortcutsConfig.board.workspace, keyEvent("b", { shift: true }))).toBe(true);

			keymap.board.workspace = ["M-b"];
			expect(matchesShortcut(shortcutsConfig.board.workspace, keyEvent("b", { meta: true }))).toBe(true);
			expect(matchesShortcut(shortcutsConfig.board.workspace, keyEvent("b"))).toBe(false);
		} finally {
			keymap.board.workspace = original;
		}
	});
	for (const surface of ["board", "taskViewer", "workspace"] as const) {
		it(`${surface} distinguishes g/G and retains Home/End boundary shortcuts`, () => {
			const shortcuts = shortcutsConfig[surface];
			expect(matchesShortcut(shortcuts.first, keyEvent("g"))).toBe(true);
			expect(matchesShortcut(shortcuts.last, keyEvent("g"))).toBe(false);
			expect(matchesShortcut(shortcuts.last, keyEvent("G"))).toBe(true);
			expect(matchesShortcut(shortcuts.first, keyEvent("G"))).toBe(false);
			expect(matchesShortcut(shortcuts.last, keyEvent("g", { shift: true }))).toBe(true);
			expect(matchesShortcut(shortcuts.first, keyEvent("g", { shift: true }))).toBe(false);
			expect(matchesShortcut(shortcuts.first, keyEvent("home"))).toBe(true);
			expect(matchesShortcut(shortcuts.last, keyEvent("end"))).toBe(true);
			expect(matchesShortcut(shortcuts.first, keyEvent("g", { ctrl: true }))).toBe(false);
			expect(matchesShortcut(shortcuts.last, keyEvent("G", { meta: true }))).toBe(false);
		});
	}

	it("exposes workspace group descriptors for newGroup, expand, and collapse", () => {
		const workspace = shortcutsConfig.workspace;
		expect(workspace.newGroup.keys).toEqual([{ key: "g", meta: true }]);
		expect(workspace.expand.keys).toEqual([{ key: "right" }]);
		expect(workspace.collapse.keys).toEqual([{ key: "left" }]);

		expect(matchesShortcut(workspace.newGroup, keyEvent("g", { meta: true }))).toBe(true);
		expect(matchesShortcut(workspace.newGroup, keyEvent("g"))).toBe(false);
		expect(matchesShortcut(workspace.expand, keyEvent("right"))).toBe(true);
		expect(matchesShortcut(workspace.collapse, keyEvent("left"))).toBe(true);

		expect(
			shortcutKeyFromEvent({
				name: "g",
				eventType: "press",
				stopPropagation: () => undefined,
				option: true,
			} as KeyEvent),
		).toEqual({ key: "g", meta: true });

		expect(findShortcutConflict(workspace.newGroup, { key: "g", meta: true })).toBeUndefined();
		expect(shortcutHelpItems("workspace").find((item) => item.shortcut.id === "workspace.expand")?.description).toBe(
			"Expand group",
		);
	});

	it("keeps task boundary keys out of generic viewers and replaces every alias with overrides", () => {
		expect(matchesShortcut(shortcutsConfig.shared.first, keyEvent("g"))).toBe(false);
		expect(matchesShortcut(shortcutsConfig.scrollableViewer.last, keyEvent("G"))).toBe(false);
		for (const surface of ["board", "taskViewer", "workspace"] as const) {
			const first = shortcutsConfig[surface].first;
			const overrides = { [first.id]: { sequence: [{ key: "x", ctrl: true as const }] } };
			expect(matchesShortcut(first, keyEvent("home"), overrides)).toBe(false);
			expect(matchesShortcut(first, keyEvent("g"), overrides)).toBe(false);
			expect(matchesShortcut(first, keyEvent("x", { ctrl: true }), overrides)).toBe(true);
			expect(findShortcutConflict(shortcutsConfig[surface].help, { key: "g" })?.id).toBe(first.id);
		}
	});

	it("keeps history, task-pane, and preview chords distinct", () => {
		const workspace = shortcutsConfig.workspace;
		expect(matchesShortcut(workspace.toggleTaskPane, keyEvent("[", { shift: true }))).toBe(true);
		expect(matchesShortcut(workspace.toggleTaskPane, keyEvent("{"))).toBe(true);
		expect(matchesShortcut(workspace.toggleTaskPane, keyEvent("[", { ctrl: true }))).toBe(false);
		expect(matchesShortcut(workspace.toggleTaskPane, keyEvent("escape"))).toBe(false);
		expect(matchesShortcut(workspace.historyBack, keyEvent("[", { ctrl: true }))).toBe(true);
		expect(matchesShortcut(workspace.historyBack, keyEvent("escape"))).toBe(true);
		expect(matchesShortcut(workspace.historyBack, keyEvent("[", { ctrl: true, shift: true }))).toBe(false);
		expect(matchesShortcut(workspace.historyForward, keyEvent("]", { ctrl: true }))).toBe(true);
		expect(matchesShortcut(workspace.quickPreviewExit, keyEvent("c", { ctrl: true }))).toBe(true);
		expect(matchesShortcut(workspace.quickPreviewExit, keyEvent("q", { ctrl: true }))).toBe(true);
		expect(matchesShortcut(workspace.fullscreen, keyEvent("f", { ctrl: true }))).toBe(false);
		expect(matchesShortcut(workspace.fullscreen, keyEvent("f", { super: true }))).toBe(false);
		expect(shortcutKeyFromEvent(keyEvent("x", { ctrl: true, super: true, hyper: true }))).toEqual({
			key: "x",
			ctrl: true,
			super: true,
			hyper: true,
		});
		expect(shortcutKeyFromEvent(keyEvent("shift", { shift: true }))).toBeUndefined();
		expect(shortcutKeyFromEvent({ ...keyEvent("x"), eventType: "release" } as KeyEvent)).toBeUndefined();
		expect(matchesShortcut(shortcutsConfig.board.workspace, keyEvent("q", { ctrl: true }))).toBe(true);
		expect(matchesShortcut(workspace.help, keyEvent("?"))).toBe(true);
		expect(matchesShortcut(workspace.help, keyEvent("?", { shift: true }))).toBe(true);
		expect(matchesShortcut(workspace.help, keyEvent("?", { ctrl: true }))).toBe(false);
		expect(formatShortcut(workspace.quickPreviewExit)).toBe("Ctrl+Q/Ctrl+C");
	});

	it("applies serialized project overrides without changing another registry", () => {
		let overrides: ShortcutOverrides = {};
		const project = createKeybindings(() => overrides);
		const otherProject = createKeybindings();
		let calls = 0;
		project.on(shortcutsConfig.workspace.fullscreen, () => {
			calls += 1;
		});
		otherProject.on(shortcutsConfig.workspace.fullscreen, () => {
			calls += 1;
		});
		overrides = JSON.parse(JSON.stringify({ "workspace.fullscreen": { sequence: [{ key: "x", ctrl: true }] } }));
		expect(project.dispatch(keyEvent("f"))).toBe(false);
		expect(project.dispatch(keyEvent("x", { ctrl: true }))).toBe(true);
		expect(project.dispatch(keyEvent("x", { ctrl: true, shift: true }))).toBe(false);
		expect(otherProject.dispatch(keyEvent("x", { ctrl: true }))).toBe(false);
		expect(otherProject.dispatch(keyEvent("f"))).toBe(true);
		expect(formatShortcut(shortcutsConfig.workspace.fullscreen, overrides)).toBe("Ctrl+X");
		expect(calls).toBe(2);
	});

	it("dispatches persisted ordered sequences", () => {
		let overrides: ShortcutOverrides = {
			"workspace.createTask": {
				sequence: [{ key: "b", ctrl: true }, { key: "d" }],
			},
			"workspace.fullscreen": { sequence: [{ key: "x" }] },
		};
		const keybindings = createKeybindings(() => overrides);
		let creates = 0;
		let fullscreen = 0;
		keybindings.on(shortcutsConfig.workspace.createTask, () => {
			creates += 1;
		});
		keybindings.on(shortcutsConfig.workspace.fullscreen, () => {
			fullscreen += 1;
		});

		expect(formatShortcut(shortcutsConfig.workspace.createTask, overrides)).toBe("Ctrl+B, D");
		expect(matchesShortcut(shortcutsConfig.workspace.createTask, keyEvent("b", { ctrl: true }), overrides)).toBe(false);
		expect(keybindings.dispatch(keyEvent("b", { ctrl: true }))).toBe(true);
		expect(creates).toBe(0);
		expect(keybindings.dispatch(keyEvent("d", { ctrl: true }))).toBe(true);
		expect(creates).toBe(0);
		expect(keybindings.dispatch(keyEvent("b", { ctrl: true }))).toBe(true);
		expect(keybindings.dispatch(keyEvent("d"))).toBe(true);
		expect(creates).toBe(1);
		expect(keybindings.dispatch(keyEvent("x"))).toBe(true);
		expect(fullscreen).toBe(1);
		overrides = {};
	});

	it("finds same-surface conflicts including active overrides", () => {
		expect(findShortcutConflict(shortcutsConfig.workspace.fullscreen, { key: "s" })?.id).toBe("workspace.sessions");
		expect(findShortcutConflict(shortcutsConfig.workspace.fullscreen, { key: "{" })?.id).toBe(
			"workspace.toggleTaskPane",
		);
		expect(
			findShortcutConflict(
				shortcutsConfig.workspace.fullscreen,
				{ key: "x", ctrl: true },
				{
					"workspace.sessions": { sequence: [{ key: "x", ctrl: true }] },
				},
			)?.id,
		).toBe("workspace.sessions");
		expect(findShortcutConflict(shortcutsConfig.workspace.fullscreen, { key: "f", ctrl: true })).toBeUndefined();
		expect(findShortcutConflict(shortcutsConfig.board.historyBack, { key: "s" })).toBeUndefined();
		expect(
			shortcutHelpItems("workspace").find((item) => item.shortcut.id === "workspace.sessions")?.description,
		).toContain("session");
	});

	it("recovers meta shortcuts from Option-composed glyphs", () => {
		expect(shortcutKeyFromEvent(keyEvent("©"))).toEqual({ key: "g", meta: true });
		expect(shortcutKeyFromEvent(keyEvent("g", { option: true }))).toEqual({ key: "g", meta: true });
		expect(shortcutKeyFromEvent(keyEvent("©", { option: true }))).toEqual({ key: "g", meta: true });
		expect(shortcutKeyFromEvent(keyEvent("©", { option: true, baseCode: 103 }))).toEqual({ key: "g", meta: true });
		expect(shortcutKeyFromEvent(keyEvent("@", { shift: true, baseCode: 50 }))).toEqual({ key: "@", shift: true });

		expect(matchesShortcut(shortcutsConfig.workspace.newGroup, keyEvent("©"))).toBe(true);
		expect(matchesShortcut(shortcutsConfig.workspace.newGroup, keyEvent("g"))).toBe(false);
		expect(formatShortcut(shortcutsConfig.workspace.newGroup)).toContain(`${metaModifierLabel()}+G`);
	});

	it("normalizes recorded keys for matching and display", () => {
		const cases = [
			{ event: keyEvent("G"), recorded: { key: "g", shift: true }, label: "Shift+G" },
			{ event: keyEvent(" "), recorded: { key: "space" }, label: "Space" },
			{ event: keyEvent("return"), recorded: { key: "return" }, label: "Enter" },
			{ event: keyEvent("{"), recorded: { key: "[", shift: true }, label: "Shift+[" },
		] as const;
		for (const [index, testCase] of cases.entries()) {
			const shortcut = { id: `test.recording.${index}`, keys: [] };
			const recorded = shortcutKeyFromEvent(testCase.event);
			expect(recorded).toEqual(testCase.recorded);
			expect(
				formatShortcut(shortcut, { [shortcut.id]: { sequence: [recorded as NonNullable<typeof recorded>] } }),
			).toBe(testCase.label);
			expect(matchesShortcut(shortcut, testCase.event, { [shortcut.id]: { sequence: [testCase.recorded] } })).toBe(
				true,
			);
		}
	});

	it("matches literal override key names without parsing binding syntax", () => {
		const shortcut = { id: "test.literal", keys: [] };
		for (const name of ["😀", "unknown", "ctrl+x"] as const) {
			const overrides = { [shortcut.id]: { sequence: [{ key: name }] } };
			expect(matchesShortcut(shortcut, keyEvent(name), overrides)).toBe(true);
			expect(matchesShortcut(shortcut, keyEvent(name, { ctrl: true }), overrides)).toBe(false);
		}
	});
});
