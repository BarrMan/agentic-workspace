import { describe, expect, test } from "bun:test";
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
	setModeTextColor,
	validateModeSettingsDraft,
} from "../ui/opentui/mode-settings-draft.ts";
import { getBuiltInAgentConfiguration, getDefaultModeCatalog } from "./config.ts";
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
		const draft = createModeSettingsDraft(source);
		addMode(draft, "review", "REVIEW");
		expect(Object.hasOwn(requireProfile(draft.configuration, "review"), "textColor")).toBe(false);
		setModeTextColor(draft, "review", "brightcyan");
		renameMode(draft, "review", "CHECK");
		moveMode(draft, "review", 0);
		setModeDefault(draft, "review");
		setModeTextColor(draft, "plan", "brightgreen");
		renameMode(draft, "plan", "DESIGN");
		expect(requireProfile(draft.configuration, "plan").textColor).toBe("brightgreen");
		deleteMode(draft, "build", "review");
		restoreDeletedMode(draft, "build");
		expect(requireProfile(draft.configuration, "build").textColor).toBe("blue");
		setModeTextColor(draft, "build", undefined);
		expect(Object.hasOwn(requireProfile(draft.configuration, "build"), "textColor")).toBe(false);
		await saveModeSettingsDraft(draft, async ({ configuration }) => {
			expect(requireProfile(configuration, "review").textColor).toBe("brightcyan");
			expect(Object.hasOwn(requireProfile(configuration, "build"), "textColor")).toBe(false);
		});
		expect(discardModeSettingsDraft(draft)).toEqual(source);
		expect(source.modes.profiles.plan?.textColor).toBe("green");
	});

	test("draft setters and Save reject unsupported colors without silently replacing them", async () => {
		const draft = createModeSettingsDraft({ ...getBuiltInAgentConfiguration(), modes: getDefaultModeCatalog() });
		expect(() => setModeTextColor(draft, "plan", "lightgreen" as ModeTextColor)).toThrow(/text color/);
		expect(requireProfile(draft.configuration, "plan").textColor).toBe("green");
		requireProfile(draft.configuration, "plan").textColor = "lightgreen" as ModeTextColor;
		expect(() => validateModeSettingsDraft(draft)).toThrow(/text color/);
		let saved = false;
		await expect(
			saveModeSettingsDraft(draft, async () => {
				saved = true;
			}),
		).rejects.toThrow(/text color/);
		expect(saved).toBe(false);
	});
});
