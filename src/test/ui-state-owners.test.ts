import { describe, expect, test } from "bun:test";
import { moveTargetToAdjacentColumn } from "../ui/opentui/board/interaction.ts";

describe("UI state owners", () => {
	test("clamps adjacent board move targets without mutating the source state", () => {
		const target = moveTargetToAdjacentColumn(["To Do", "In Progress", "Done"], "In Progress", 4, "next", (status) =>
			status === "Done" ? 2 : 0,
		);
		expect(target).toEqual({ status: "Done", index: 2 });
		expect(moveTargetToAdjacentColumn(["To Do"], "To Do", 0, "previous", () => 0)).toBeUndefined();
	});
});
