import { describe, expect, test } from "bun:test";
import { Command } from "commander";
import { getCompletions, parseCompletionContext } from "./helper.ts";

describe("parseCompletionContext", () => {
	test("parses empty command line", () => {
		const context = parseCompletionContext("agentic-workspace ", 8);
		expect(context.command).toBeNull();
		expect(context.subcommand).toBeNull();
		expect(context.partial).toBe("");
		expect(context.lastFlag).toBeNull();
	});

	test("parses partial command", () => {
		const context = parseCompletionContext("agentic-workspace tas", "agentic-workspace tas".length);
		expect(context.command).toBeNull();
		expect(context.partial).toBe("tas");
	});

	test("parses complete command", () => {
		const context = parseCompletionContext("agentic-workspace task ", "agentic-workspace task ".length);
		expect(context.command).toBe("task");
		expect(context.subcommand).toBeNull();
		expect(context.partial).toBe("");
	});

	test("parses partial subcommand", () => {
		const context = parseCompletionContext("agentic-workspace task ed", "agentic-workspace task ed".length);
		expect(context.command).toBe("task");
		expect(context.subcommand).toBeNull();
		expect(context.partial).toBe("ed");
	});

	test("parses complete subcommand", () => {
		const context = parseCompletionContext("agentic-workspace task edit ", "agentic-workspace task edit ".length);
		expect(context.command).toBe("task");
		expect(context.subcommand).toBe("edit");
		expect(context.partial).toBe("");
	});

	test("parses partial argument", () => {
		const context = parseCompletionContext(
			"agentic-workspace task edit task-",
			"agentic-workspace task edit task-".length,
		);
		expect(context.command).toBe("task");
		expect(context.subcommand).toBe("edit");
		expect(context.partial).toBe("task-");
	});

	test("parses flag", () => {
		const context = parseCompletionContext(
			"agentic-workspace task create --status ",
			"agentic-workspace task create --status ".length,
		);
		expect(context.command).toBe("task");
		expect(context.subcommand).toBe("create");
		expect(context.lastFlag).toBe("--status");
		expect(context.partial).toBe("");
	});

	test("parses partial flag value", () => {
		const context = parseCompletionContext(
			"agentic-workspace task create --status In",
			"agentic-workspace task create --status In".length,
		);
		expect(context.command).toBe("task");
		expect(context.subcommand).toBe("create");
		expect(context.lastFlag).toBe("--status");
		expect(context.partial).toBe("In");
	});

	test("handles quoted strings", () => {
		const context = parseCompletionContext(
			'agentic-workspace task create "test task" --status ',
			'agentic-workspace task create "test task" --status '.length,
		);
		expect(context.command).toBe("task");
		expect(context.subcommand).toBe("create");
		expect(context.lastFlag).toBe("--status");
		expect(context.partial).toBe("");
	});

	test("handles multiple flags", () => {
		const context = parseCompletionContext("agentic-workspace task create --priority high --status ", 55);
		expect(context.command).toBe("task");
		expect(context.subcommand).toBe("create");
		expect(context.lastFlag).toBe("--status");
		expect(context.partial).toBe("");
	});

	test("parses completion subcommand", () => {
		const context = parseCompletionContext(
			"agentic-workspace completion install ",
			"agentic-workspace completion install ".length,
		);
		expect(context.command).toBe("completion");
		expect(context.subcommand).toBe("install");
		expect(context.partial).toBe("");
	});

	test("handles cursor in middle of line", () => {
		// Cursor after "agentic-workspace task " starts the edit command context.
		const context = parseCompletionContext("agentic-workspace task edit", "agentic-workspace task ".length);
		expect(context.command).toBe("task");
		expect(context.subcommand).toBeNull();
		expect(context.partial).toBe("");
	});

	test("counts argument position correctly", () => {
		const context = parseCompletionContext(
			"agentic-workspace task edit task-1 ",
			"agentic-workspace task edit task-1 ".length,
		);
		expect(context.command).toBe("task");
		expect(context.subcommand).toBe("edit");
		expect(context.argPosition).toBe(1);
	});

	test("does not count flag values as arguments", () => {
		const context = parseCompletionContext("agentic-workspace task create --status Done ", 43);
		expect(context.command).toBe("task");
		expect(context.subcommand).toBe("create");
		expect(context.argPosition).toBe(0);
	});

	test("includes pwsh in --shell value completions", async () => {
		const line = "agentic-workspace completion install --shell ";
		const completions = await getCompletions(new Command(), line, line.length);

		expect(completions).toContain("pwsh");
		expect(completions).not.toContain("powershell");
	});

	test("filters pwsh shell completion by partial value", async () => {
		const line = "agentic-workspace completion install --shell pws";
		const completions = await getCompletions(new Command(), line, line.length);

		expect(completions).toEqual(["pwsh"]);
	});
});
