import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import matter from "gray-matter";

type Permission = string | Record<string, string>;
type AgentConfig = {
	permission: Record<string, Permission>;
	model?: string;
	prompt?: string;
	mode?: string;
};

const config = JSON.parse(readFileSync(new URL("../../opencode.json", import.meta.url), "utf8")) as {
	agent: Record<string, AgentConfig>;
};

const readRules = { "*": "allow", "*.env": "ask", "*.env.*": "ask", "*.env.example": "allow" };
const mcpDenials = {
	"context7_*": "deny",
	"gh_grep_*": "deny",
	"serena_*": "deny",
	"aliexpress_*": "deny",
};
const primaryPermission = {
	"*": "deny",
	task: "allow",
	task_status: "allow",
	task_message: "allow",
	task_revive: "allow",
	task_cancel: "allow",
	wait_for_user: "allow",
	question: "allow",
	skill: "allow",
	todowrite: "allow",
	...mcpDenials,
};
const readOnlyPermission = {
	"*": "deny",
	bash: "deny",
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
const allowedChecks = {
	"*": "deny",
	"bun run check": "allow",
	"bun run check:types": "allow",
	"bun run check:fallow": "allow",
	"bun run test": "allow",
	"bun run build": "allow",
	"find src -type f -newer dist/agentic-workspace": "allow",
};
const workerPermission = {
	"*": "deny",
	read: readRules,
	edit: "allow",
	glob: "allow",
	grep: "allow",
	list: "allow",
	lsp: "allow",
	bash: allowedChecks,
	skill: "allow",
	...mcpDenials,
};
const verifierPermission = {
	"*": "deny",
	edit: "deny",
	task: "deny",
	read: readRules,
	glob: "allow",
	grep: "allow",
	list: "allow",
	lsp: "allow",
	bash: allowedChecks,
	...mcpDenials,
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

function expectPermission(name: string, expected: Record<string, Permission>) {
	const entry = config.agent[name];
	expect(entry).toBeDefined();
	expect(Object.keys(entry ?? {})).toEqual(["permission"]);
	expect(Object.entries(entry?.permission ?? {})).toEqual(Object.entries(expected));
	for (const [tool, action] of Object.entries(expected)) {
		if (typeof action === "object") {
			expect(Object.entries(entry?.permission[tool] as Record<string, string>)).toEqual(Object.entries(action));
		}
	}
}

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
	it("keeps every selectable primary orchestration-only with required task controls", () => {
		expect(Object.keys(config.agent).sort()).toEqual(
			[
				"astra-explore",
				"astra-general",
				"build",
				"compaction",
				"deepseek-explore",
				"deepseek-general",
				"designer",
				"explorer",
				"fixer",
				"librarian",
				"luna6-explore",
				"luna6-general",
				"oracle",
				"orchestrator",
				"plan",
				"sol6.1-explore",
				"sol6.1-general",
				"terra-explore",
				"terra-general",
				"summary",
				"title",
			].sort(),
		);
		for (const name of ["build", "plan", "compaction", "summary", "title", "orchestrator"])
			expectPermission(name, primaryPermission);
		expect(Object.hasOwn(primaryPermission, "task_reply")).toBe(false);
	});

	it("keeps discovery roles read-only, explicitly denies MCP namespaces, and asks for sensitive reads", () => {
		for (const name of [
			"oracle",
			"explorer",
			"designer",
			"librarian",
			"sol6.1-explore",
			"luna6-explore",
			"deepseek-explore",
			"astra-explore",
			"terra-explore",
		]) {
			expectPermission(name, readOnlyPermission);
		}
	});

	it("bounds implementation shell access and preserves sensitive-read rules", () => {
		for (const name of [
			"fixer",
			"sol6.1-general",
			"luna6-general",
			"deepseek-general",
			"astra-general",
			"terra-general",
		]) {
			expectPermission(name, workerPermission);
		}
		expect(Object.entries(allowedChecks)).toEqual([
			["*", "deny"],
			["bun run check", "allow"],
			["bun run check:types", "allow"],
			["bun run check:fallow", "allow"],
			["bun run test", "allow"],
			["bun run build", "allow"],
			["find src -type f -newer dist/agentic-workspace", "allow"],
		]);
	});

	it("defines read-only reviewer and verifier lanes without inherited prompt or model replacement", () => {
		const reviewer = readAgent("../../.opencode/agents/reviewer.md");
		const verifier = readAgent("../../.opencode/agents/verifier.md");
		expect(reviewer.mode).toBe("subagent");
		expect(verifier.mode).toBe("subagent");
		expect(reviewer.model).toBeUndefined();
		expect(reviewer.prompt).toBeUndefined();
		expect(verifier.model).toBeUndefined();
		expect(verifier.prompt).toBeUndefined();
		expect(reviewer.description.trim()).not.toBe("");
		expect(reviewer.body.trim()).not.toBe("");
		expect(reviewer.body).toContain("Do not edit");
		expect(reviewer.body).toContain("prioritized findings");
		expect(verifier.description.trim()).not.toBe("");
		expect(verifier.body.trim()).not.toBe("");
		expect(verifier.body).toContain("Run only these repository verification commands");
		expect(verifier.body).toContain("Do not edit");
		expectFrontmatterPermission(reviewer.permission, reviewerPermission);
		expectFrontmatterPermission(verifier.permission, verifierPermission);
		expect(reviewer.permission.edit).toBe("deny");
		expect(reviewer.permission.task).toBe("deny");
		expect(verifier.permission.edit).toBe("deny");
		expect(verifier.permission.task).toBe("deny");
		expect(verifier.permission.task_reply).toBeUndefined();
	});
});
