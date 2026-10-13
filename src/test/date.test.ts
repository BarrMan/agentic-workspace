import { describe, expect, it } from "bun:test";
import { formatStoredDate } from "../utils/date.ts";

describe("formatStoredDate", () => {
	it("uses the byte-exact UTC minute format stored in markdown", () => {
		expect(formatStoredDate(new Date("2026-09-29T04:11:59.999Z"))).toBe("2026-09-29 04:11");
	});
});
