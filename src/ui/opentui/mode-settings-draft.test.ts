import { describe, expect, test } from "bun:test";
import type { AgentConfiguration, ModeId } from "../../agent-workspace/types.ts";
import {
	addMode,
	createModeSettingsDraft,
	deleteMode,
	discardModeSettingsDraft,
	moveMode,
	renameMode,
	restoreDeletedMode,
	saveModeSettingsDraft,
	setModeDefault,
	validateModeSettingsDraft,
} from "./mode-settings-draft.ts";

const configuration = (): AgentConfiguration => ({
	selectedPreset: "custom",
	presets: { custom: { command: "run", env: { KEEP: "yes" }, prepare: "", bootstrap: "opencode" } },
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

function profile(draft: ReturnType<typeof createModeSettingsDraft>, id: ModeId) {
	const value = draft.configuration.modes?.profiles[id];
	if (!value) throw new Error(`Missing test profile ${id}`);
	return value;
}

function catalog(draft: ReturnType<typeof createModeSettingsDraft>) {
	const value = draft.configuration.modes;
	if (!value) throw new Error("Missing test mode catalog");
	return value;
}

describe("mode settings draft", () => {
	test("label, order, and default edits preserve stable mode IDs and do not mutate source configuration", () => {
		const source = configuration();
		const draft = createModeSettingsDraft(source);
		renameMode(draft, "plan", "DESIGN");
		moveMode(draft, "research", 0);
		setModeDefault(draft, "build");
		validateModeSettingsDraft(draft);
		expect(draft.configuration.modes?.order).toEqual(["research", "plan", "build"]);
		expect(draft.configuration.modes?.profiles.plan?.name).toBe("DESIGN");
		expect(draft.configuration.modes?.defaultModeId).toBe("build");
		expect(draft.configuration.modes?.profiles.plan?.approvalArtifact).toBe("plan.md");
		expect(source.modes?.order).toEqual(["plan", "build", "research"]);
		expect(source.modes?.profiles.plan?.name).toBe("PLAN");
	});

	test("supports adding complete editable profiles and validating their fields", () => {
		const draft = createModeSettingsDraft(configuration());
		addMode(draft, "design", "DESIGN");
		const design = profile(draft, "design");
		design.model = { kind: "explicit", id: "vendor/model" };
		design.prompt = "Use the design brief.";
		design.permissions = { repository: "read", task: "read", artifacts: "read-write", subagents: "disabled" };
		design.artifacts = [{ path: "design/brief.md", purpose: "Design brief" }];
		design.approvalArtifact = "custom/review.md";
		expect(() => validateModeSettingsDraft(draft)).not.toThrow();
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
			const draft = createModeSettingsDraft(configuration());
			profile(draft, "plan").artifacts = [{ path, purpose: "invalid" }];
			expect(() => validateModeSettingsDraft(draft), path).toThrow();
		}
		for (const path of ["../outside.md", ".artifacts.json", "/absolute.md"]) {
			const draft = createModeSettingsDraft(configuration());
			profile(draft, "plan").approvalArtifact = path;
			expect(() => validateModeSettingsDraft(draft), path).toThrow();
		}
	});

	test("allows None and a valid custom approval path without a matching artifact declaration", () => {
		const draft = createModeSettingsDraft(configuration());
		profile(draft, "plan").approvalArtifact = undefined;
		expect(() => validateModeSettingsDraft(draft)).not.toThrow();
		profile(draft, "plan").approvalArtifact = "reviews/decision.md";
		expect(() => validateModeSettingsDraft(draft)).not.toThrow();
	});

	test("requires at least one remaining mode", () => {
		const draft = createModeSettingsDraft(configuration());
		deleteMode(draft, "plan", "build");
		deleteMode(draft, "research", "build");
		delete catalog(draft).profiles.build;
		catalog(draft).order = [];
		expect(() => validateModeSettingsDraft(draft)).toThrow(/at least one mode/i);
	});

	test("deletion requires a valid different destination and stages migration until Save", async () => {
		const draft = createModeSettingsDraft(configuration());
		expect(() => deleteMode(draft, "research", "missing" as ModeId)).toThrow();
		expect(() => deleteMode(draft, "research", "research")).toThrow();
		const before = structuredClone(draft.baseline);
		deleteMode(draft, "research", "build");
		expect(draft.moves).toEqual([{ fromModeId: "research", toModeId: "build" }]);
		expect(draft.baseline).toEqual(before);
		const discarded = discardModeSettingsDraft(draft);
		expect(discarded).toEqual(before);
		expect(draft.moves).toHaveLength(1);
	});

	test("restore and save preserve unrelated settings and only Save invokes the side-effect boundary", async () => {
		const source = configuration();
		const draft = createModeSettingsDraft(source);
		deleteMode(draft, "research", "build");
		restoreDeletedMode(draft, "research");
		expect(draft.moves).toEqual([]);
		expect(draft.configuration.modes?.order).toEqual(source.modes?.order);
		setModeDefault(draft, "build");
		let calls = 0;
		let saved: AgentConfiguration | undefined;
		await saveModeSettingsDraft(draft, async (plan) => {
			calls++;
			saved = plan.configuration;
			expect(plan.moves).toEqual([]);
		});
		expect(calls).toBe(1);
		expect(saved?.sessions).toEqual(source.sessions);
		expect(saved?.presets).toEqual(source.presets);
		expect(saved?.modes?.defaultModeId).toBe("build");
		expect(source.modes?.defaultModeId).toBe("plan");
	});
});
