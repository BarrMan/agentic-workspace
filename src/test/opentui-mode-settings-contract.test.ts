import { afterEach, describe, expect, it } from "bun:test";
import { BoxRenderable } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import type { AgentConfiguration } from "../model/session/types.ts";
import { mountOpenTuiAgentSettings, parseModeArtifactDefinitions } from "../renderer/opentui/agent-settings.ts";

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

	it("queues PLAN session merge to BUILD on save, without applying it before save", async () => {
		const setup = await createTestRenderer({ width: 120, height: 32, kittyKeyboard: true });
		renderers.push(setup);
		const config = configuration();
		const original = structuredClone(config);
		const callbacks: Array<{
			configuration: AgentConfiguration;
			moves: Array<{ fromModeId: string; toModeId: string }>;
		}> = [];
		const mount = mountOpenTuiAgentSettings(setup.renderer, parent(setup), {
			configuration: config,
			modeSessionCounts: { plan: 2 },
			onSave: async () => {
				throw new Error("Mode edit must use its atomic save boundary.");
			},
			onSaveModeSettings: async (plan) => {
				callbacks.push({ ...structuredClone(plan), moves: [...plan.moves] });
			},
			onClose: () => {},
		});
		try {
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressArrow("right");
			setup.mockInput.pressKey("d");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("2 owned sessions");
			expect(setup.captureCharFrame()).toContain("Destination:");
			setup.mockInput.pressArrow("right");
			setup.mockInput.pressEnter();
			await setup.flush();
			expect(callbacks).toHaveLength(0);
			expect(config).toEqual(original);
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(callbacks).toHaveLength(1);
			expect(callbacks[0]?.moves).toEqual([{ fromModeId: "plan", toModeId: "build" }]);
			expect(callbacks[0]?.configuration.modes?.order).toEqual(["build"]);
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
