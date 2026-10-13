import { describe, expect, it } from "bun:test";
import { findShortcutConflict, formatShortcut, shortcutsConfig } from "../ui/opentui/keybindings.ts";

describe("mode keybinding contract", () => {
	it("has one workspace Tab descriptor and labels it Cycle mode", () => {
		const workspace = shortcutsConfig.workspace;
		const tabBindings = Object.values(workspace).filter((shortcut) =>
			shortcut.keys.some((key) => key.key === "tab" && !key.shift && !key.ctrl && !key.meta),
		);

		expect(tabBindings.map((shortcut) => shortcut.id)).toEqual(["workspace.cycleMode"]);
		expect(workspace.cycleMode.label).toBe("Tab");
		expect(formatShortcut(workspace.cycleMode)).toBe("Tab");
	});

	it("keeps artifact approvals explicit and task-viewer scoped without Enter/Tab hijacks", () => {
		const { approveArtifact, revokeArtifact } = shortcutsConfig.taskViewer;

		expect(approveArtifact.keys).not.toContainEqual({ key: "enter" });
		expect(approveArtifact.keys).not.toContainEqual({ key: "tab" });
		expect(revokeArtifact.keys).not.toContainEqual({ key: "enter" });
		expect(revokeArtifact.keys).not.toContainEqual({ key: "tab" });
		expect(findShortcutConflict(approveArtifact, approveArtifact.keys[0] ?? [])).toBeUndefined();
		expect(findShortcutConflict(revokeArtifact, revokeArtifact.keys[0] ?? [])).toBeUndefined();
		expect(approveArtifact.id.startsWith("taskViewer.")).toBe(true);
		expect(revokeArtifact.id.startsWith("taskViewer.")).toBe(true);
	});
});
