/**
 * macOS US/ABC Option-composed glyphs mapped back to their base ASCII key.
 *
 * When a terminal sends Option as a composed glyph (for example iTerm2 with
 * "Option Key Sends = Normal"), the event name is the glyph itself and carries
 * no modifier flags. This table lets shortcut matching recover the base key so
 * `M-g` still fires from a bare `©`.
 *
 * Dead-key glyphs that never emit standalone (`´`, `ˆ`, `˜`) are intentionally
 * omitted because they are ambiguous.
 */
const optionComposedGlyphs: ReadonlyMap<string, string> = new Map([
	["å", "a"],
	["∫", "b"],
	["ç", "c"],
	["∂", "d"],
	["ƒ", "f"],
	["©", "g"],
	["˙", "h"],
	["∆", "j"],
	["˚", "k"],
	["¬", "l"],
	["µ", "m"],
	["ø", "o"],
	["π", "p"],
	["œ", "q"],
	["®", "r"],
	["ß", "s"],
	["†", "t"],
	["¨", "u"],
	["√", "v"],
	["∑", "w"],
	["≈", "x"],
	["¥", "y"],
	["Ω", "z"],
	["Å", "A"],
	["Ç", "C"],
	["Ø", "O"],
	["Œ", "Q"],
	["Í", "S"],
	["„", "W"],
	["¸", "Z"],
	["º", "0"],
	["¡", "1"],
	["™", "2"],
	["£", "3"],
	["¢", "4"],
	["∞", "5"],
	["§", "6"],
	["¶", "7"],
	["•", "8"],
	["ª", "9"],
	["–", "-"],
	["≠", "="],
	["“", "["],
	["”", "]"],
	["…", ";"],
	["÷", "/"],
]);

/** Reverse-map a macOS Option-composed glyph to its base ASCII key. */
export function optionBaseKey(name: string): string | undefined {
	return optionComposedGlyphs.get(name);
}

/** Convert a kitty base-layout codepoint to a single printable ASCII character. */
export function charFromBaseCode(code: number): string | undefined {
	if (!Number.isInteger(code) || code < 32 || code > 126) return undefined;
	return String.fromCodePoint(code);
}
