import { describe, expect, test } from "bun:test";
import type { ModeProfile } from "../../model/session/types.ts";
import { profileInstructions, profilePermissionSupport } from "./profile.ts";

const plan: ModeProfile = {
	name: "PLAN",
	model: { kind: "default" },
	prompt: "Plan before implementation.",
	permissions: { repository: "read", task: "read-write", artifacts: "read-write", subagents: "allowed" },
	artifacts: [{ path: "plan.md", purpose: "Implementation approach" }],
};

describe("permission profile and model preparation contract", () => {
	test("PLAN and BUILD permission scope is advisory guidance for OpenCode", () => {
		const build: ModeProfile = {
			...plan,
			name: "BUILD",
			permissions: { ...plan.permissions, repository: "read-write" },
		};
		for (const profile of [plan, build]) {
			const support = profilePermissionSupport("opencode", profile);
			expect(support.native).toEqual([]);
			expect(support.instructionBased.join(" ")).toContain(
				"read/edit scope, subagent policy and shell access are prompt-only",
			);
		}

		const planInstructions = profileInstructions(plan, "/repo", "/repo/tasks/BACK-23");
		expect(planInstructions).toContain("Do not edit repository source files");
		expect(planInstructions).toContain("Never approve artifacts or modify .artifacts.json");
		expect(planInstructions).toContain("instructions, not an OS sandbox");
		const buildInstructions = profileInstructions(build, "/repo", "/repo/tasks/BACK-23");
		expect(buildInstructions).toContain("Repository access: read-write");
		expect(buildInstructions).not.toContain("Do not edit repository source files");
	});

	test("Repository None and artifact rules remain advisory prompt guidance", () => {
		const restrictive: ModeProfile = {
			...plan,
			permissions: { repository: "none", task: "read", artifacts: "read", subagents: "disabled" },
		};
		const instructions = profileInstructions(restrictive, "/repo", "/repo/tasks/BACK-23");
		expect(instructions).toContain("Do not inspect repository");
		expect(instructions).toContain("Do not edit repository source files");
		expect(instructions).toContain("Never approve artifacts or modify .artifacts.json");
		expect(instructions).toContain("approval is user-only");
		const support = profilePermissionSupport("opencode", restrictive);
		expect(support.native).toEqual([]);
		expect(support.instructionBased.join(" ")).toContain("prompt-only");
		expect(support.instructionBased.join(" ")).toContain("extension capabilities");
	});

	test("resume retains the captured profile prompt and policies after the catalog profile changes", () => {
		const oldPrompt = profileInstructions(plan, "/repo", "/repo/tasks/BACK-23");
		const oldPolicy = { ...plan.permissions };
		const changedCatalog: ModeProfile = {
			...plan,
			prompt: "A replacement catalog prompt.",
			permissions: { ...plan.permissions, repository: "none", subagents: "disabled" },
		};
		const resumedBootstrap = oldPrompt;
		const resumedPolicy = oldPolicy;
		expect(resumedBootstrap).toContain("Plan before implementation.");
		expect(resumedBootstrap).not.toContain(changedCatalog.prompt);
		expect(resumedPolicy).toEqual(plan.permissions);
		expect(resumedPolicy).not.toEqual(changedCatalog.permissions);
	});
});
