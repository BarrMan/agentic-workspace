import { describe, expect, it } from "bun:test";
import { charFromBaseCode, optionBaseKey } from "../ui/opentui/option-compose.ts";

describe("macOS Option-composed glyphs", () => {
	it("reverse-maps the standard letters, digits, and punctuation", () => {
		expect(optionBaseKey("©")).toBe("g");
		expect(optionBaseKey("µ")).toBe("m");
		expect(optionBaseKey("ø")).toBe("o");
		expect(optionBaseKey("ß")).toBe("s");
		expect(optionBaseKey("Ω")).toBe("z");
		expect(optionBaseKey("Å")).toBe("A");
		expect(optionBaseKey("Í")).toBe("S");
		expect(optionBaseKey("º")).toBe("0");
		expect(optionBaseKey("¡")).toBe("1");
		expect(optionBaseKey("•")).toBe("8");
		expect(optionBaseKey("–")).toBe("-");
		expect(optionBaseKey("≠")).toBe("=");
		expect(optionBaseKey("“")).toBe("[");
		expect(optionBaseKey("”")).toBe("]");
		expect(optionBaseKey("…")).toBe(";");
		expect(optionBaseKey("÷")).toBe("/");
	});

	it("omits ambiguous dead-key glyphs and ASCII", () => {
		expect(optionBaseKey("´")).toBeUndefined();
		expect(optionBaseKey("ˆ")).toBeUndefined();
		expect(optionBaseKey("˜")).toBeUndefined();
		expect(optionBaseKey("g")).toBeUndefined();
		expect(optionBaseKey("A")).toBeUndefined();
		expect(optionBaseKey("0")).toBeUndefined();
		expect(optionBaseKey("")).toBeUndefined();
	});

	it("converts printable ASCII base codes only", () => {
		expect(charFromBaseCode(103)).toBe("g");
		expect(charFromBaseCode(65)).toBe("A");
		expect(charFromBaseCode(32)).toBe(" ");
		expect(charFromBaseCode(126)).toBe("~");
		expect(charFromBaseCode(31)).toBeUndefined();
		expect(charFromBaseCode(127)).toBeUndefined();
		expect(charFromBaseCode(199)).toBeUndefined();
		expect(charFromBaseCode(103.5)).toBeUndefined();
	});
});
