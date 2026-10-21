import { describe, expect, test } from "bun:test";
import { ModeSettingsDraft } from "../../renderer/opentui/mode-settings-draft.ts";
import { getBuiltInAgentConfiguration, getDefaultModeCatalog } from "../../storage/config.ts";
import { effectiveModeTextColor, isModeTextColor, MODE_TEXT_COLORS, type ModeTextColor } from "./mode-colors.ts";
import type { AgentConfiguration } from "./types.ts";

function requireProfile(configuration: AgentConfiguration, id: string) {
	const profile = configuration.modes?.profiles[id];
	if (!profile) throw new Error(`Missing test profile ${id}`);
	return profile;
}

describe("mode text colors", () => {
	test("configuration initializes without a runtime UI dependency and seeds explicit default colors", () => {
		const catalog = getDefaultModeCatalog();
		expect(catalog.profiles.plan?.textColor).toBe("green");
		expect(catalog.profiles.build?.textColor).toBe("blue");
		expect(getBuiltInAgentConfiguration().modes).toBeUndefined();
	});

	test("presentation colors come only from the profile", () => {
		const profile = { name: "RENAMED" };
		expect(effectiveModeTextColor(profile, "plan")).toBeUndefined();
		expect(effectiveModeTextColor({ name: "PLAN" }, "build")).toBeUndefined();
		expect(effectiveModeTextColor(undefined, "plan")).toBeUndefined();
		expect(effectiveModeTextColor({ name: "PLAN", textColor: "brightgreen" }, "plan")).toBe("brightgreen");
		expect(profile).toEqual({ name: "RENAMED" });
	});

	test("the shared palette accepts only exact lowercase ANSI names", () => {
		for (const color of MODE_TEXT_COLORS) expect(isModeTextColor(color)).toBe(true);
		for (const color of ["lightgreen", "Green", " green", "#00ff00", "default", "Default", "", null, 1])
			expect(isModeTextColor(color)).toBe(false);
	});

	test("draft CRUD retains colors, Default omits the field, and discard restores the original", async () => {
		const source = { ...getBuiltInAgentConfiguration(), modes: getDefaultModeCatalog() };
		const draft = new ModeSettingsDraft(source);
		draft.addMode("review", "REVIEW");
		expect(Object.hasOwn(requireProfile(draft.configuration, "review"), "textColor")).toBe(false);
		draft.setModeTextColor("review", "brightcyan");
		draft.renameMode("review", "CHECK");
		draft.moveMode("review", 0);
		draft.setModeDefault("review");
		draft.setModeTextColor("plan", "brightgreen");
		draft.renameMode("plan", "DESIGN");
		expect(requireProfile(draft.configuration, "plan").textColor).toBe("brightgreen");
		draft.deleteMode("build");
		expect(draft.deletedModeIds).toContain("build");
		draft.restoreDeletedMode("build");
		expect(requireProfile(draft.configuration, "build").textColor).toBe("blue");
		draft.setModeTextColor("build", undefined);
		expect(Object.hasOwn(requireProfile(draft.configuration, "build"), "textColor")).toBe(false);
		await draft.save(async ({ configuration }) => {
			expect(requireProfile(configuration, "review").textColor).toBe("brightcyan");
			expect(Object.hasOwn(requireProfile(configuration, "build"), "textColor")).toBe(false);
		});
		expect(draft.discard()).toEqual(source);
		expect(source.modes.profiles.plan?.textColor).toBe("green");
	});

	test("draft setters and Save reject unsupported colors without silently replacing them", async () => {
		const draft = new ModeSettingsDraft({ ...getBuiltInAgentConfiguration(), modes: getDefaultModeCatalog() });
		expect(() => draft.setModeTextColor("plan", "lightgreen" as ModeTextColor)).toThrow(/text color/);
		expect(requireProfile(draft.configuration, "plan").textColor).toBe("green");
		requireProfile(draft.configuration, "plan").textColor = "lightgreen" as ModeTextColor;
		expect(() => draft.validate()).toThrow(/text.?color/i);
		let saved = false;
		await expect(
			draft.save(async () => {
				saved = true;
			}),
		).rejects.toThrow(/text.?color/i);
		expect(saved).toBe(false);
	});
});
