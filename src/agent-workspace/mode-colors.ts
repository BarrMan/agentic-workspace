import type { ModeId, ModeProfile } from "./types.ts";

/** OpenTUI's ANSI named colors, shared by configuration and presentation without runtime UI imports. */
export const MODE_TEXT_COLORS = [
	"black",
	"red",
	"green",
	"yellow",
	"blue",
	"magenta",
	"cyan",
	"white",
	"brightblack",
	"brightred",
	"brightgreen",
	"brightyellow",
	"brightblue",
	"brightmagenta",
	"brightcyan",
	"brightwhite",
] as const;

export type ModeTextColor = (typeof MODE_TEXT_COLORS)[number];

export function isModeTextColor(value: unknown): value is ModeTextColor {
	return typeof value === "string" && MODE_TEXT_COLORS.some((color) => color === value);
}

/** Presentation-only legacy defaults; never mutate or fill the persisted catalog. */
export function effectiveModeTextColor(
	profile: Pick<ModeProfile, "name" | "textColor"> | undefined,
	modeId?: ModeId,
): ModeTextColor | undefined {
	if (!profile) return undefined;
	if (profile.textColor !== undefined) return profile.textColor;
	const identity = modeId ?? profile.name.toLowerCase();
	if (identity === "plan") return "green";
	if (identity === "build") return "blue";
	return undefined;
}
