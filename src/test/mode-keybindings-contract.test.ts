import { describe, expect, it } from "bun:test";
import { findShortcutConflict, formatShortcut, shortcutsConfig } from "../renderer/opentui/keybindings.ts";

describe("mode keybinding contract", () => {
	it("has one workspace Tab descriptor and labels it Cycle mode", () => {
		const workspace = shortcutsConfig.workspace;
		const tabBindings = Object.values(workspace).filter(
			(shortcut) =>
				shortcut.binding.key === "tab" && !shortcut.binding.shift && !shortcut.binding.ctrl && !shortcut.binding.meta,
		);

		expect(tabBindings.map((shortcut) => shortcut.id)).toEqual(["workspace.cycleMode"]);
		expect(formatShortcut(workspace.cycleMode)).toBe("Tab");
	});

	it("keeps artifact approvals explicit and task-viewer scoped without Enter/Tab hijacks", () => {
		const { approveArtifact, revokeArtifact } = shortcutsConfig.taskViewer;

		expect(approveArtifact.binding).not.toEqual({ key: "enter" });
		expect(approveArtifact.binding).not.toEqual({ key: "tab" });
		expect(revokeArtifact.binding).not.toEqual({ key: "enter" });
		expect(revokeArtifact.binding).not.toEqual({ key: "tab" });
		expect(findShortcutConflict(approveArtifact, approveArtifact.binding)).toBeUndefined();
		expect(findShortcutConflict(revokeArtifact, revokeArtifact.binding)).toBeUndefined();
		expect(approveArtifact.id.startsWith("taskViewer.")).toBe(true);
		expect(revokeArtifact.id.startsWith("taskViewer.")).toBe(true);
	});
});
