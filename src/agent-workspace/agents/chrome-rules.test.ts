import { describe, expect, it } from "bun:test";
import { detectChromeActivity } from "../agent-status.ts";
import { agentFor } from "./agents.ts";

function rulesFor(bootstrap: string) {
	const agent = agentFor(bootstrap);
	if (!agent) throw new Error(`Missing adapter: ${bootstrap}`);
	return agent.chromeRules;
}

describe("adapter chrome rules", () => {
	it("keeps Claude's error, permission, interrupt, idle precedence", () => {
		const rules = rulesFor("claude");
		expect(detectChromeActivity(rules, "Error: failed\nDo you want to proceed?\nesc to interrupt")).toBe("error");
		expect(detectChromeActivity(rules, "Do you want to proceed?\nesc to interrupt")).toBe("waiting");
		expect(detectChromeActivity(rules, "esc to interrupt\n> ")).toBe("running");
		expect(detectChromeActivity(rules, "> ")).toBe("idle");
	});

	it("shares OpenCode rules across versions and omits permission recognition for Pi", () => {
		const opencodeRules = rulesFor("opencode-v1");
		expect(rulesFor("opencode-v2")).toBe(opencodeRules);
		expect(detectChromeActivity(opencodeRules, "Error: failed\nPermission required\nesc to interrupt")).toBe("error");
		expect(detectChromeActivity(opencodeRules, "Permission required\nesc to interrupt")).toBe("waiting");
		expect(detectChromeActivity(rulesFor("pi"), "Permission required")).toBeUndefined();
		expect(detectChromeActivity(rulesFor("pi"), "esc to interrupt")).toBe("running");
	});
});
