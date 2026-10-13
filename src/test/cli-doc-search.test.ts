import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Writable } from "node:stream";
import { $ as shell } from "bun";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

const cliCommand = ["agenticworkspace"];
function $(parts: TemplateStringsArray, ...values: unknown[]) {
	const source = parts.reduce(
		(text, part, index) =>
			`${text}${part}${Array.isArray(values[index]) ? values[index].map((value) => JSON.stringify(value)).join(" ") : values[index] === undefined ? "" : JSON.stringify(values[index])}`,
		"",
	);
	if (!source.includes("agenticworkspace")) return shell(parts, ...values);
	const args =
		source
			.match(/"(?:\\.|[^"\\])*"|'[^']*'|[^\s]+/g)
			?.map((arg) =>
				arg.startsWith('"') ? (JSON.parse(arg) as string) : arg.startsWith("'") ? arg.slice(1, -1) : arg,
			) ?? [];
	const config: { cwd?: string; nothrow?: boolean } = {};
	const result = async () => {
		const stdout: string[] = [];
		const stderr: string[] = [];
		const out = new Writable({
			write: (chunk, _encoding, done) => {
				stdout.push(chunk.toString());
				done();
			},
		});
		const err = new Writable({
			write: (chunk, _encoding, done) => {
				stderr.push(chunk.toString());
				done();
			},
		});
		const exitCode = await runCli(args.slice(cliCommand.length), { cwd: config.cwd, stdout: out, stderr: err });
		const value = { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
		if (value.exitCode && !config.nothrow) throw new Error(value.stderr || `CLI exited with ${value.exitCode}`);
		return value;
	};
	const chain = {
		cwd(value: string) {
			config.cwd = value;
			return chain;
		},
		nothrow() {
			config.nothrow = true;
			return chain;
		},
		quiet() {
			return result();
		},
		async text() {
			return (await result()).stdout;
		},
	};
	return chain;
}

describe("CLI doc search command", () => {
	// Every test only searches or prints help, so the group runs concurrently and the independent
	// launches inside a test overlap. The document fixture is built once.
	beforeAll(async () => {
		TEST_DIR = createUniqueTestDir("test-cli-doc-search");
		await mkdir(TEST_DIR, { recursive: true });

		const core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "Doc Search Project");

		await core.createDocument(
			{
				id: "doc-1",
				title: "Architecture Overview",
				type: "guide",
				createdDate: "2026-06-13",
				rawContent: "Service topology and indexing architecture details.",
				tags: ["architecture", "search"],
			},
			"guides",
		);

		await core.createDocument(
			{
				id: "doc-2",
				title: "Architecture Runbook",
				type: "specification",
				createdDate: "2026-06-13",
				rawContent: "Operational architecture procedures.",
			},
			"runbooks",
		);

		await core.createDocument({
			id: "doc-3",
			title: "Support Playbook",
			type: "other",
			createdDate: "2026-06-13",
			rawContent: "Customer support response steps.",
		});
	});

	afterAll(async () => {
		await safeCleanup(TEST_DIR);
	});

	it("searches documents with plain agent-readable identity and follow-up context", async () => {
		const result = await $`${cliCommand} doc search architecture`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		const stdout = result.stdout.toString();
		expect(stdout).toContain("Documents:");
		expect(stdout).toContain(
			"doc-1 - Architecture Overview (path: guides/doc-1 - Architecture-Overview.md, type: guide, tags: architecture, search)",
		);
		expect(stdout).toContain("View: agenticworkspace doc view doc-1");
		expect(stdout).toMatch(/\[score [0-1]\.\d{3}]/);
		expect(stdout).not.toContain("Support Playbook");
	});

	it("prints a query-specific no-result message", async () => {
		const result = await $`${cliCommand} doc search zzzzzzzz`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString().trim()).toBe('No documents found for "zzzzzzzz".');
	});

	it("limits document search results", async () => {
		const result = await $`${cliCommand} doc search architecture --limit 1`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		const stdout = result.stdout.toString();
		const documentLines = stdout.match(/^ {2}doc-/gm) ?? [];
		expect(documentLines).toHaveLength(1);
		expect(stdout).toContain("View: agenticworkspace doc view");
	});

	it("rejects missing or invalid query and limit inputs", async () => {
		// Each rejected launch is independent and read-only, so run them together.
		const missingQuery = await $`${cliCommand} doc search`.cwd(TEST_DIR).nothrow().quiet();
		const emptyQuery = await $`${cliCommand} doc search ""`.cwd(TEST_DIR).nothrow().quiet();
		const longQuery = await $`${cliCommand} doc search ${"a".repeat(201)}`.cwd(TEST_DIR).nothrow().quiet();
		const zeroLimit = await $`${cliCommand} doc search architecture --limit 0`.cwd(TEST_DIR).nothrow().quiet();
		const highLimit = await $`${cliCommand} doc search architecture --limit 101`.cwd(TEST_DIR).nothrow().quiet();
		const textLimit = await $`${cliCommand} doc search architecture --limit many`.cwd(TEST_DIR).nothrow().quiet();

		const missingQueryOutput = missingQuery.stdout.toString() + missingQuery.stderr.toString();
		const emptyQueryOutput = emptyQuery.stdout.toString() + emptyQuery.stderr.toString();
		const longQueryOutput = longQuery.stdout.toString() + longQuery.stderr.toString();
		const zeroLimitOutput = zeroLimit.stdout.toString() + zeroLimit.stderr.toString();
		const highLimitOutput = highLimit.stdout.toString() + highLimit.stderr.toString();
		const textLimitOutput = textLimit.stdout.toString() + textLimit.stderr.toString();

		expect(missingQuery.exitCode).not.toBe(0);
		expect(missingQueryOutput).toContain("missing required argument 'query'");
		expect(missingQueryOutput).toContain("Run with --help");
		expect(emptyQuery.exitCode).not.toBe(0);
		expect(emptyQueryOutput).toContain("Query is required");
		expect(longQuery.exitCode).not.toBe(0);
		expect(longQueryOutput).toContain("Query must be 200 characters or fewer.");
		expect(zeroLimit.exitCode).not.toBe(0);
		expect(zeroLimitOutput).toContain("Limit must be an integer between 1 and 100.");
		expect(highLimit.exitCode).not.toBe(0);
		expect(highLimitOutput).toContain("Limit must be an integer between 1 and 100.");
		expect(textLimit.exitCode).not.toBe(0);
		expect(textLimitOutput).toContain("Invalid limit: many.");
	});

	it("documents the input schema and output shape in help", async () => {
		const help = await $`${cliCommand} doc search --help`.cwd(TEST_DIR).text();

		expect(help).toContain("Input schema:");
		expect(help).toContain("Required fields:");
		expect(help).toContain("query: String");
		expect(help).toContain("Optional fields:");
		expect(help).toContain("limit: Integer");
		expect(help).toContain("Reads:");
		expect(help).toContain("Writes:");
		expect(help).toContain("None; this is a read-only command");
		expect(help).toContain("Output:");
		expect(help).toContain("Plain text Documents list");
		expect(help).toContain('agenticworkspace doc search "architecture"');
		expect(help).toContain('agenticworkspace doc search "runbook" --limit 5');
	});
});
