import { describe, expect, it } from "bun:test";
import { NATIVE_AGENT_NAMESPACES } from "../../model/session/types.ts";

describe("native agent namespace identity", () => {
	it("shares namespaces across OpenCode versions and keeps provider-specific namespaces distinct", () => {
		expect(NATIVE_AGENT_NAMESPACES).toEqual(["opencode", "claude", "pi"]);
	});
});
