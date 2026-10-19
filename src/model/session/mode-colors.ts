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

/** Presentation color from the persisted profile; it never fills a missing value. */
export function effectiveModeTextColor(
	profile: Pick<ModeProfile, "name" | "textColor"> | undefined,
	_modeId?: ModeId,
): ModeTextColor | undefined {
	return profile?.textColor;
}
