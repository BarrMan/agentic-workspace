import { describe, expect, it } from "bun:test";
import { entityIdKey, entityIdsEqual, normalizeEntityId } from "../utils/entity-id.ts";

describe("entity ID prefixes", () => {
	it("treats regex metacharacters in a prefix as literal text", () => {
		expect(entityIdKey("task+", "TASK+-001")).toBe("task+-1");
		expect(normalizeEntityId("task+", "task+-1")).toBe("task+-1");
		expect(entityIdsEqual("task+", "task+-01", "TASK+-1")).toBe(true);
		expect(entityIdKey("task+", "taskx-1")).toBe("task+-taskx-1");
	});
});
