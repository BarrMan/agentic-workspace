import { describe, expect, test } from "bun:test";
import type { AgentConfiguration, ModeId } from "../../model/session/types.ts";
import { ModeSettingsDraft } from "./mode-settings-draft.ts";

const configuration = (): AgentConfiguration => ({
	selectedPreset: "custom",
	presets: { custom: { command: ["run"], env: { KEEP: "yes" }, prepare: "", bootstrap: "opencode" } },
	sessions: { worktreePerTask: true, yoloMode: false },
	modes: {
		version: 1,
		defaultModeId: "plan",
		order: ["plan", "build", "research"],
		profiles: {
			plan: {
				name: "PLAN",
				model: { kind: "default" },
				prompt: "plan prompt",
				permissions: { repository: "read", task: "read-write", artifacts: "read-write", subagents: "allowed" },
				artifacts: [{ path: "plan.md", purpose: "Plan" }],
				approvalArtifact: "plan.md",
			},
			build: {
				name: "BUILD",
				model: { kind: "explicit", id: "provider/model" },
				prompt: "build prompt",
				permissions: { repository: "read-write", task: "read-write", artifacts: "read-write", subagents: "allowed" },
				artifacts: [],
			},
			research: {
				name: "RESEARCH",
				model: { kind: "default" },
				prompt: "research prompt",
				permissions: { repository: "read", task: "read", artifacts: "read", subagents: "disabled" },
				artifacts: [],
			},
		},
	},
});

function profile(draft: ModeSettingsDraft, id: ModeId) {
	const value = draft.configuration.modes?.profiles[id];
	if (!value) throw new Error(`Missing test profile ${id}`);
	return value;
}

function catalog(draft: ModeSettingsDraft) {
	const value = draft.configuration.modes;
	if (!value) throw new Error("Missing test mode catalog");
	return value;
}

describe("mode settings draft", () => {
	test("label, order, and default edits preserve stable mode IDs and do not mutate source configuration", () => {
		const source = configuration();
		const draft = new ModeSettingsDraft(source);
		draft.renameMode("plan", "DESIGN");
		draft.moveMode("research", 0);
		draft.setModeDefault("build");
		draft.validate();
		expect(draft.configuration.modes?.order).toEqual(["research", "plan", "build"]);
		expect(draft.configuration.modes?.profiles.plan?.name).toBe("DESIGN");
		expect(draft.configuration.modes?.defaultModeId).toBe("build");
		expect(draft.configuration.modes?.profiles.plan?.approvalArtifact).toBe("plan.md");
		expect(source.modes?.order).toEqual(["plan", "build", "research"]);
		expect(source.modes?.profiles.plan?.name).toBe("PLAN");
	});

	test("supports adding complete editable profiles and validating their fields", () => {
		const draft = new ModeSettingsDraft(configuration());
		draft.addMode("design", "DESIGN");
		const design = profile(draft, "design");
		design.model = { kind: "explicit", id: "vendor/model" };
		design.prompt = "Use the design brief.";
		design.permissions = { repository: "read", task: "read", artifacts: "read-write", subagents: "disabled" };
		design.artifacts = [{ path: "design/brief.md", purpose: "Design brief" }];
		design.approvalArtifact = "custom/review.md";
		expect(() => draft.validate()).not.toThrow();
	});

	test("does not validate opaque explicit model IDs in settings", () => {
		const draft = new ModeSettingsDraft(configuration());
		profile(draft, "build").model = { kind: "explicit", id: "model\nwith spaces;anything" };
		expect(() => draft.validate()).not.toThrow();
	});

	test("rejects an inherited object property as the default mode ID", () => {
		const draft = new ModeSettingsDraft(configuration());
		catalog(draft).defaultModeId = "constructor";
		expect(() => draft.validate()).toThrow(/defaultModeId/);
	});

	test("rejects reserved, absolute, and traversing artifact paths for declarations and approval indicators", () => {
		for (const path of [
			"task.md",
			".artifacts.json",
			"../outside.md",
			"nested/../../outside",
			"/absolute.md",
			"C:/absolute.md",
			"a\\b.md",
		]) {
			const draft = new ModeSettingsDraft(configuration());
			profile(draft, "plan").artifacts = [{ path, purpose: "invalid" }];
			expect(() => draft.validate(), path).toThrow();
		}
		for (const path of ["../outside.md", ".artifacts.json", "/absolute.md"]) {
			const draft = new ModeSettingsDraft(configuration());
			profile(draft, "plan").approvalArtifact = path;
			expect(() => draft.validate(), path).toThrow();
		}
		const duplicate = new ModeSettingsDraft(configuration());
		profile(duplicate, "plan").artifacts = [
			{ path: "plan.md", purpose: "Plan" },
			{ path: "plan.md", purpose: "Another plan" },
		];
		expect(() => duplicate.validate()).toThrow(/more than once/);
		profile(duplicate, "plan").artifacts = [{ path: "plan.md", purpose: " " }];
		expect(() => duplicate.validate()).toThrow();
	});

	test("allows None and a valid custom approval path without a matching artifact declaration", () => {
		const draft = new ModeSettingsDraft(configuration());
		profile(draft, "plan").approvalArtifact = undefined;
		expect(() => draft.validate()).not.toThrow();
		profile(draft, "plan").approvalArtifact = "reviews/decision.md";
		expect(() => draft.validate()).not.toThrow();
	});

	test("deletion stages only its source mode until Save", async () => {
		const draft = new ModeSettingsDraft(configuration());
		expect(() => draft.deleteMode("missing" as ModeId)).toThrow();
		const before = structuredClone(draft.baseline);
		draft.deleteMode("research");
		expect(draft.deletedModeIds).toEqual(["research"]);
		expect(catalog(draft).profiles.research).toBeDefined();
		expect(draft.baseline).toEqual(before);
		const discarded = draft.discard();
		expect(discarded).toEqual(before);
		expect(draft.deletedModeIds).toEqual(["research"]);
	});

	test("restore and save preserve unrelated settings and only Save invokes the side-effect boundary", async () => {
		const source = configuration();
		const draft = new ModeSettingsDraft(source);
		draft.deleteMode("research");
		draft.restoreDeletedMode("research");
		expect(draft.deletedModeIds).toEqual([]);
		expect(draft.configuration.modes?.order).toEqual(source.modes?.order);
		draft.setModeDefault("build");
		let calls = 0;
		let saved: AgentConfiguration | undefined;
		await draft.save(async (plan) => {
			calls++;
			saved = plan.configuration;
			expect(plan.deletedModeIds).toEqual([]);
		});
		expect(calls).toBe(1);
		expect(saved?.sessions).toEqual(source.sessions);
		expect(saved?.presets).toEqual(source.presets);
		expect(saved?.modes?.defaultModeId).toBe("build");
		expect(source.modes?.defaultModeId).toBe("plan");
	});
});
