/** Inputs are supplied by the caller so row rendering stays independent of workspace state. */
export type ModeRowLabelOptions = {
	readonly title: string;
	readonly modeLabel: string;
	readonly approved: boolean;
	readonly selected?: boolean;
	/** Existing session/activity indicator; always precedes the title and mode suffix. */
	readonly activityMarker?: string;
	readonly done?: boolean;
	readonly depth?: number;
	readonly width: number;
	readonly narrow?: boolean;
};

export type ModeRowLabel = {
	/** Cell-bounded printable row, with the mode metadata right-aligned when space allows. */
	readonly text: string;
	/** Title portion only; callers may apply strike-through to this range. */
	readonly title: { readonly start: number; readonly end: number; readonly done: boolean };
	/** Visible mode name only, in terminal cells and UTF-16 offsets; excludes approval metadata. */
	readonly mode: {
		readonly start: number;
		readonly end: number;
		readonly characterStart: number;
		readonly characterEnd: number;
	};
	/** Plain-text help/status label, independent of session activity. */
	readonly modeHelp: string;
};

function clipCells(value: string, width: number): string {
	if (width <= 0) return "";
	if (Bun.stringWidth(value) <= width) return value;
	let result = "";
	let cells = 0;
	for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)) {
		const size = Bun.stringWidth(segment);
		if (cells + size > width) break;
		result += segment;
		cells += size;
	}
	return result;
}

/** Build a terminal-cell-bounded task row with optional right-aligned configured mode metadata. */
export function renderModeRowLabel(options: ModeRowLabelOptions): ModeRowLabel {
	const width = Math.max(0, Math.floor(options.width));
	const depth = Math.max(0, Math.floor(options.depth ?? 0));
	const indent = "  ".repeat(depth);
	const marker = options.activityMarker || " ";
	const modeHelp = `${options.modeLabel}${options.approved ? " ✓" : ""}`;
	const badge = options.selected && options.modeLabel ? ` ${modeHelp} ` : "";
	// Keep the activity cell before the badge, even when indentation/title cannot fit.
	const suffix = badge && Bun.stringWidth(marker + badge) <= width ? badge : "";
	const prefix = clipCells(`${marker}${indent} `, width - Bun.stringWidth(suffix));
	const titleWidth = Math.max(0, width - Bun.stringWidth(prefix + suffix));
	const titleText = clipCells(options.title, titleWidth);
	const titleStart = Bun.stringWidth(prefix);
	const titleEnd = titleStart + Bun.stringWidth(titleText);
	const content = `${prefix}${titleText}${" ".repeat(Math.max(0, titleWidth - Bun.stringWidth(titleText)))}`;
	const text = `${content}${suffix}`;
	const modePrefix = suffix ? `${content} ` : text;
	const modeStart = Bun.stringWidth(modePrefix);
	const characterStart = modePrefix.length;
	const characterEnd = characterStart + (suffix ? options.modeLabel.length : 0);
	return {
		text,
		title: { start: titleStart, end: Math.min(titleEnd, Bun.stringWidth(text)), done: options.done ?? false },
		mode: {
			start: modeStart,
			end: modeStart + Bun.stringWidth(text.slice(characterStart, characterEnd)),
			characterStart,
			characterEnd,
		},
		modeHelp,
	};
}
