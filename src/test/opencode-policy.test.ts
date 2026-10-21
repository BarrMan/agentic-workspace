import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import matter from "gray-matter";

type Permission = string | Record<string, string>;

const config = JSON.parse(readFileSync(new URL("../../opencode.json", import.meta.url), "utf8")) as {
	$schema: string;
};

const readRules = { "*": "allow", "*.env": "ask", "*.env.*": "ask", "*.env.example": "allow" };
const mcpDenials = {
	"context7_*": "deny",
	"gh_grep_*": "deny",
	"serena_*": "deny",
	"aliexpress_*": "deny",
};
const reviewerPermission = {
	"*": "deny",
	bash: "deny",
	edit: "deny",
	task: "deny",
	read: readRules,
	glob: "allow",
	grep: "allow",
	list: "allow",
	lsp: "allow",
	webfetch: "allow",
	websearch: "allow",
	skill: "allow",
	...mcpDenials,
};

function readAgent(path: string) {
	const parsed = matter(readFileSync(new URL(path, import.meta.url), "utf8"));
	return {
		...(parsed.data as {
			description: string;
			mode: string;
			permission: Record<string, Permission>;
			model?: string;
			prompt?: string;
		}),
		body: parsed.content,
	};
}

function expectFrontmatterPermission(actual: Record<string, Permission>, expected: Record<string, Permission>) {
	expect(Object.entries(actual)).toEqual(Object.entries(expected));
	for (const [tool, action] of Object.entries(expected)) {
		if (typeof action === "object")
			expect(Object.entries(actual[tool] as Record<string, string>)).toEqual(Object.entries(action));
	}
}

describe("project OpenCode permission policy", () => {
	it("uses the current schema-only OpenCode project config", () => {
		expect(config).toEqual({ $schema: "https://opencode.ai/config.json" });
	});

	it("defines a read-only reviewer lane without inherited prompt or model replacement", () => {
		const reviewer = readAgent("../../.opencode/agents/reviewer.md");
		expect(reviewer.mode).toBe("subagent");
		expect(reviewer.model).toBeUndefined();
		expect(reviewer.prompt).toBeUndefined();
		expect(reviewer.description.trim()).not.toBe("");
		expect(reviewer.body.trim()).not.toBe("");
		expect(reviewer.body).toContain("Do not edit");
		expect(reviewer.body).toContain("prioritized findings");
		expectFrontmatterPermission(reviewer.permission, reviewerPermission);
		expect(reviewer.permission.edit).toBe("deny");
		expect(reviewer.permission.task).toBe("deny");
	});
});
