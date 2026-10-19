import { afterEach, describe, expect, it } from "bun:test";
import { BoxRenderable } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import type { AgentBootstrap, AgentConfiguration, ModeProfile } from "../model/session/types.ts";
import { mountOpenTuiAgentSettings } from "../renderer/opentui/agent-settings.ts";
import { profilePermissionSupport } from "../runtime/agents/profile.ts";

function configuration(bootstrap: AgentBootstrap, model: string): AgentConfiguration {
	const profile: ModeProfile = {
		name: "PLAN",
		model: { kind: "explicit", id: model },
		prompt: "Plan first.",
		permissions: { repository: "read", task: "read-write", artifacts: "read", subagents: "disabled" },
		artifacts: [],
	};
	return {
		selectedPreset: "work",
		presets: { work: { bootstrap, command: `${bootstrap} agent`, prepare: "", env: {} } },
		modes: { version: 1, defaultModeId: "plan", order: ["plan"], profiles: { plan: profile } },
	};
}

function parent(setup: TestRendererSetup): BoxRenderable {
	const root = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
	setup.renderer.root.add(root);
	return root;
}

describe("rendered mode permission support", () => {
	const renderers: TestRendererSetup[] = [];
	afterEach(() => {
		for (const setup of renderers.splice(0)) setup.renderer.destroy();
	});

	it("shows harness-specific native controls and honestly labels instruction fallback", async () => {
		for (const harness of ["opencode", "pi", "claude"] as const) {
			const setup = await createTestRenderer({ width: 150, height: 34, kittyKeyboard: true });
			renderers.push(setup);
			const mount = mountOpenTuiAgentSettings(setup.renderer, parent(setup), {
				configuration: configuration(harness, "provider/model-a"),
				profilePermissionSupport: (profile) => profilePermissionSupport(harness, profile),
				onSave: async () => {},
				onClose: () => {},
			});
			try {
				setup.mockInput.pressArrow("down");
				setup.mockInput.pressArrow("down");
				await setup.flush();
				const frame = setup.captureCharFrame();
				expect(frame).toContain("Repository:");
				expect(frame).toContain("read ·");
				expect(frame).toContain("Task:");
				expect(frame).toContain("read-write ·");
				expect(frame).toContain("Artifacts:");
				expect(frame).toContain("Subagents:");
				expect(frame).toContain(harness === "claude" ? "disabled · Native" : "disabled · Instructions");
				expect(frame).toContain("Instructions are guidance, not filesystem");
				expect(frame).toContain("isolation.");
				expect(frame).not.toContain("sandbox");
				expect(frame).not.toContain("isolated filesystem");
				if (harness === "opencode") {
					expect(frame).toContain("Native: none");
					expect(frame).toContain("read/edit scope, subagent policy and shell access are prompt-only");
					expect(frame).toContain("MCP, plugins, startup context");
				} else if (harness === "claude") {
					expect(frame).toContain("Native: session-only Read/Edit path permission rules");
					expect(frame).toContain("path-scope differences when repository and task roots overlap");
				} else {
					expect(frame).toContain("Native: none");
					expect(frame).toContain("Instructions: repository/task/artifact path scope, subagent policy");
				}
			} finally {
				mount.dispose();
			}
		}
	});

	it("refreshes permission labels for the selected model and uses the project harness without a per-mode harness selector", async () => {
		const setup = await createTestRenderer({ width: 150, height: 34, kittyKeyboard: true });
		renderers.push(setup);
		const config = configuration("claude", "provider/model-a");
		let harness: "claude" | "opencode" = "claude";
		const mount = mountOpenTuiAgentSettings(setup.renderer, parent(setup), {
			configuration: config,
			profilePermissionSupport: (profile) => profilePermissionSupport(harness, profile),
			onSave: async () => {},
			discoverModeModels: async () => [{ id: "provider/model-a" }, { id: "provider/model-b" }],
			onClose: () => {},
		});
		try {
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressArrow("down");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Native: session-only Read/Edit path permission rules");
			const initial = setup.captureCharFrame();
			expect(initial).toContain("provider/model-a");
			expect(initial).toContain("Native: session-only Read/Edit path permission rules");
			// The resolver is called from rendering, so a changed project harness refreshes support labels.
			harness = "opencode";
			setup.mockInput.pressArrow("down");
			await setup.flush();
			setup.mockInput.pressArrow("up");
			await setup.flush();
			const refreshed = setup.captureCharFrame();
			expect(refreshed).toContain("provider/model-a");
			expect(refreshed).toContain("Native: none");
			expect(refreshed).toContain("read/edit scope, subagent policy and shell access are prompt-only");
			expect(refreshed).toContain("Permission support:");
			expect(refreshed).not.toContain("Harness:");
			expect(refreshed).not.toContain("Per-mode harness");
		} finally {
			mount.dispose();
		}
	});
});
