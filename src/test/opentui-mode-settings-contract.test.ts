import { afterEach, describe, expect, it } from "bun:test";
import { BoxRenderable } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import type { AgentConfiguration } from "../model/session/types.ts";
import { mountOpenTuiAgentSettings } from "../renderer/opentui/agent-settings.ts";
import { parseModeArtifactDefinitions } from "../renderer/opentui/modes-editor.ts";

function configuration(): AgentConfiguration {
	return {
		selectedPreset: "work",
		presets: {
			work: { command: ["agent", "{prompt}"], env: { TOKEN: "kept" }, prepare: "prepare", bootstrap: "claude" },
		},
		sessions: { worktreePerTask: true, yoloMode: false, autoResumeOnRestart: true },
		modes: {
			version: 1,
			defaultModeId: "plan",
			order: ["plan", "build"],
			profiles: {
				plan: {
					name: "PLAN",
					model: { kind: "default" },
					prompt: "plan prompt",
					permissions: { repository: "read", task: "read", artifacts: "read", subagents: "allowed" },
					artifacts: [{ path: "notes/plan.md", purpose: "planning notes" }],
					approvalArtifact: "notes/plan.md",
				},
				build: {
					name: "BUILD",
					model: { kind: "explicit", id: "claude-sonnet" },
					prompt: "build prompt",
					permissions: { repository: "read-write", task: "read-write", artifacts: "read-write", subagents: "disabled" },
					artifacts: [{ path: "result.md", purpose: "final result" }],
				},
			},
		},
	};
}

function parent(setup: TestRendererSetup): BoxRenderable {
	const root = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
	setup.renderer.root.add(root);
	return root;
}

describe("native Modes settings contract", () => {
	const renderers: TestRendererSetup[] = [];
	afterEach(() => {
		for (const setup of renderers.splice(0)) setup.renderer.destroy();
	});

	it("parses and validates relative artifact definitions without touching files", () => {
		expect(parseModeArtifactDefinitions("notes/plan.md — planning notes\nresult.md — final result")).toEqual([
			{ path: "notes/plan.md", purpose: "planning notes" },
			{ path: "result.md", purpose: "final result" },
		]);
		expect(() => parseModeArtifactDefinitions("../outside.md — unsafe")).toThrow("invalid relative path");
		expect(() => parseModeArtifactDefinitions("result.md — first\nresult.md — duplicate")).toThrow("repeats");
		expect(() => parseModeArtifactDefinitions("result.md —   ")).toThrow("needs a purpose");
	});

	it("renders Modes as a third category with a left profile list and editable right-hand controls", async () => {
		const setup = await createTestRenderer({ width: 120, height: 32, kittyKeyboard: true });
		renderers.push(setup);
		const mount = mountOpenTuiAgentSettings(setup.renderer, parent(setup), {
			configuration: configuration(),
			onSave: async () => {},
			onClose: () => {},
		});
		try {
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressArrow("down");
			await setup.flush();
			const frame = setup.captureCharFrame();
			expect(frame).toContain("> Modes");
			expect(frame).toContain("PLAN ● default");
			expect(frame).toContain("BUILD");
			expect(frame).toContain("Model:");
			expect(frame).toContain("Repository:");
			expect(frame).toContain("Task:");
			expect(frame).toContain("Artifacts:");
			expect(frame).toContain("Subagents:");
			expect(frame).toContain("Prompt:");
			expect(frame).toContain("Artifact definitions:");
			expect(frame).toContain("Approval indicator:");
			const rows = frame.split("\n");
			const listRow = rows.findIndex((row) => row.includes("PLAN ● default"));
			const detailsRow = rows.findIndex((row) => row.includes("Repository:"));
			expect(rows[listRow]?.indexOf("PLAN ● default")).toBeGreaterThanOrEqual(0);
			expect(detailsRow).toBeGreaterThan(listRow);
		} finally {
			mount.dispose();
		}
	});

	it("renames selected PLAN while retaining its stable plan ID", async () => {
		const setup = await createTestRenderer({ width: 120, height: 36, kittyKeyboard: true });
		renderers.push(setup);
		const config = configuration();
		const original = structuredClone(config);
		let saved: AgentConfiguration | undefined;
		const mount = mountOpenTuiAgentSettings(setup.renderer, parent(setup), {
			configuration: config,
			onSave: async () => {},
			onSaveModeSettings: async (plan) => {
				saved = structuredClone(plan.configuration);
			},
			onClose: () => {},
		});
		try {
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressArrow("right");
			await setup.flush();
			setup.mockInput.pressKey("n");
			setup.mockInput.pressKey("a", { ctrl: true });
			setup.mockInput.pressKey("k", { ctrl: true });
			await setup.mockInput.typeText("DESIGN");
			setup.mockInput.pressEnter();
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(saved?.modes?.profiles.plan?.name).toBe("DESIGN");
			expect(saved?.modes?.profiles.plan?.approvalArtifact).toBe("notes/plan.md");
			expect(saved?.modes?.profiles.build?.name).toBe("BUILD");
			expect(saved?.modes?.order).toEqual(["plan", "build"]);
			expect(config).toEqual(original);
		} finally {
			mount.dispose();
		}
	});

	it("stages mode deletion until save, without transferring session history", async () => {
		const setup = await createTestRenderer({ width: 120, height: 32, kittyKeyboard: true });
		renderers.push(setup);
		const config = configuration();
		const original = structuredClone(config);
		const callbacks: Array<{ configuration: AgentConfiguration; deletedModeIds: readonly string[] }> = [];
		const mount = mountOpenTuiAgentSettings(setup.renderer, parent(setup), {
			configuration: config,
			modeSessionCounts: { plan: 2 },
			onSave: async () => {
				throw new Error("Mode edit must use its atomic save boundary.");
			},
			onSaveModeSettings: async (plan) => {
				callbacks.push(structuredClone(plan));
			},
			onClose: () => {},
		});
		try {
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressArrow("right");
			setup.mockInput.pressKey("d");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("2 workspace-owned sessions");
			setup.mockInput.pressEnter();
			await setup.flush();
			expect(callbacks).toHaveLength(0);
			expect(config).toEqual(original);
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(callbacks).toHaveLength(1);
			expect(callbacks[0]?.configuration.modes?.order).toEqual(["plan", "build"]);
			expect(callbacks[0]?.deletedModeIds).toEqual(["plan"]);
			expect(config).toEqual(original);
		} finally {
			mount.dispose();
		}
	});

	it("stages reorder, default selection, and add while preserving unrelated configuration", async () => {
		const setup = await createTestRenderer({ width: 120, height: 32, kittyKeyboard: true });
		renderers.push(setup);
		const config = configuration();
		const original = structuredClone(config);
		let saved: AgentConfiguration | undefined;
		const mount = mountOpenTuiAgentSettings(setup.renderer, parent(setup), {
			configuration: config,
			onSave: async () => {},
			onSaveModeSettings: async (plan) => {
				saved = structuredClone(plan.configuration);
			},
			onClose: () => {},
		});
		try {
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressArrow("right");
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressKey("s");
			setup.mockInput.pressKey("]");
			setup.mockInput.pressKey("a");
			setup.mockInput.pressKey("e", { ctrl: true });
			await setup.mockInput.typeText("review");
			setup.mockInput.pressEnter();
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(saved?.modes?.order).toEqual(["build", "plan", "review"]);
			expect(saved?.modes?.defaultModeId).toBe("build");
			expect(saved?.modes?.profiles.review?.name).toBe("review");
			expect(saved?.presets).toEqual(original.presets);
			expect(saved?.sessions).toEqual(original.sessions);
			expect(config).toEqual(original);
		} finally {
			mount.dispose();
		}
	});

	for (const field of [
		{
			name: "prompt",
			index: 5,
			editor: "settings-mode-prompt-editor",
			buffer: "Pending prompt\ns d j [ ]",
			change: { prompt: "Pending prompt\ns d j [ ]" },
		},
		{
			name: "artifacts",
			index: 6,
			editor: "settings-mode-artifacts-editor",
			buffer: "draft.md — pending purpose",
			change: { artifacts: [{ path: "draft.md", purpose: "pending purpose" }] },
		},
		{
			name: "approval",
			index: 7,
			editor: "settings-mode-approval-editor",
			buffer: "pending.md",
			change: { approvalArtifact: "pending.md" },
		},
	]) {
		it(`saves only committed ${field.name} and persists its buffer only after explicit field commit`, async () => {
			const setup = await createTestRenderer({ width: 100, height: 28, kittyKeyboard: true });
			renderers.push(setup);
			const root = parent(setup);
			const original = configuration();
			const originalProfile = original.modes?.profiles.plan;
			if (!originalProfile) throw new Error("Fixture requires PLAN.");
			let persisted = structuredClone(original);
			let saves = 0;
			let closed = 0;
			const open = async (buffer = field.buffer) => {
				const mount = mountOpenTuiAgentSettings(setup.renderer, root, {
					configuration: persisted,
					onSave: async () => {
						throw new Error("Expected the mode settings save boundary.");
					},
					onSaveModeSettings: async (plan) => {
						saves++;
						if (saves === 2) throw new Error("Save rejected; buffer retained.");
						persisted = structuredClone(plan.configuration);
					},
					onClose: () => closed++,
				});
				setup.mockInput.pressArrow("down");
				setup.mockInput.pressArrow("down");
				setup.mockInput.pressArrow("right");
				setup.mockInput.pressArrow("right");
				for (let index = 0; index < field.index; index++) setup.mockInput.pressArrow("down");
				setup.mockInput.pressEnter();
				if (field.name === "approval") {
					setup.mockInput.pressArrow("down");
					setup.mockInput.pressEnter();
				}
				await setup.flush();
				expect(setup.renderer.currentFocusedRenderable?.id).toBe(field.editor);
				setup.mockInput.pressKey("a", { ctrl: true });
				setup.mockInput.pressKey("k", { ctrl: true });
				await setup.mockInput.pasteBracketedText(buffer);
				return mount;
			};
			let mount = await open(field.name === "prompt" ? field.buffer : "../uncommitted.md");
			try {
				setup.mockInput.pressKey("s", { ctrl: true });
				await setup.flush();
				expect(saves).toBe(1);
				expect(closed).toBe(1);
				expect(persisted).toEqual(original);
				mount = await open();
				setup.mockInput.pressKey("s", { ctrl: true });
				await setup.flush();
				expect(saves).toBe(2);
				expect(closed).toBe(1);
				expect(persisted).toEqual(original);
				expect(setup.renderer.currentFocusedRenderable?.id).toBe(field.editor);
				expect(setup.captureCharFrame()).toContain("Save rejected; buffer retained.");
				setup.mockInput.pressEnter(field.name === "approval" ? {} : { ctrl: true });
				await setup.flush();
				expect(setup.renderer.currentFocusedRenderable?.id).toBe("settings-mode-profile");
				setup.mockInput.pressKey("s", { ctrl: true });
				await setup.flush();
				expect(saves).toBe(3);
				expect(closed).toBe(2);
				expect(persisted.modes?.profiles.plan).toEqual({ ...originalProfile, ...field.change });
			} finally {
				mount.dispose();
			}
		});
	}

	it("retains the committed draft and uncommitted prompt on save failure; Escape cancels only the editor", async () => {
		const setup = await createTestRenderer({ width: 100, height: 28, kittyKeyboard: true });
		renderers.push(setup);
		const config = configuration();
		const attempts: AgentConfiguration[] = [];
		let closed = 0;
		const mount = mountOpenTuiAgentSettings(setup.renderer, parent(setup), {
			configuration: config,
			onSave: async () => {
				throw new Error("Expected the mode settings save boundary.");
			},
			onSaveModeSettings: async (plan) => {
				attempts.push(structuredClone(plan.configuration));
				if (attempts.length === 1) throw new Error("Save rejected; retry available.");
			},
			onClose: () => closed++,
		});
		try {
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressArrow("right");
			setup.mockInput.pressArrow("right");
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressEnter();
			setup.mockInput.pressArrow("up");
			for (let index = 0; index < 5; index++) setup.mockInput.pressArrow("down");
			setup.mockInput.pressEnter();
			await setup.flush();
			expect(setup.renderer.currentFocusedRenderable?.id).toBe("settings-mode-prompt-editor");
			setup.mockInput.pressKey("a", { ctrl: true });
			setup.mockInput.pressKey("k", { ctrl: true });
			await setup.mockInput.pasteBracketedText("Staged prompt\ns d j [ ]");
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(attempts).toHaveLength(1);
			expect(attempts[0]?.modes?.profiles.plan?.prompt).toBe("plan prompt");
			expect(attempts[0]?.modes?.profiles.plan?.permissions.repository).toBe("read-write");
			expect(setup.captureCharFrame()).toContain("Save rejected; retry available.");
			expect(closed).toBe(0);
			expect(setup.renderer.currentFocusedRenderable?.id).toBe("settings-mode-prompt-editor");
			expect(setup.captureCharFrame()).toContain("Staged prompt");
			setup.mockInput.pressKey("a", { ctrl: true });
			setup.mockInput.pressKey("k", { ctrl: true });
			await setup.mockInput.pasteBracketedText("Canceled replacement");
			await setup.flush();
			const rows = setup.captureCharFrame().split("\n");
			const categoryRow = rows.findIndex((row) => row.includes("Categories"));
			expect(categoryRow).toBeGreaterThanOrEqual(0);
			await setup.mockMouse.click(2, categoryRow + 1);
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("> Modes");
			setup.mockInput.pressEscape();
			await setup.flush();
			expect(closed).toBe(0);
			expect(setup.captureCharFrame()).not.toContain("Canceled replacement");
			setup.mockInput.pressArrow("left");
			setup.mockInput.pressArrow("left");
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(attempts).toHaveLength(2);
			expect(attempts[1]).toEqual(attempts[0]);
			expect(closed).toBe(1);
			expect(config.modes?.profiles.plan?.prompt).toBe("plan prompt");
		} finally {
			mount.dispose();
		}
	});

	it("discards staged mode changes without invoking either save callback", async () => {
		const setup = await createTestRenderer({ width: 100, height: 28, kittyKeyboard: true });
		renderers.push(setup);
		const config = configuration();
		const original = structuredClone(config);
		let saves = 0;
		let closed = 0;
		const mount = mountOpenTuiAgentSettings(setup.renderer, parent(setup), {
			configuration: config,
			onSave: async () => {
				saves++;
			},
			onSaveModeSettings: async () => {
				saves++;
			},
			onClose: () => closed++,
		});
		try {
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressArrow("right");
			setup.mockInput.pressKey("s");
			setup.mockInput.pressEscape();
			await setup.flush();
			expect(saves).toBe(0);
			expect(closed).toBe(1);
			expect(config).toEqual(original);
		} finally {
			mount.dispose();
		}
	});
});
