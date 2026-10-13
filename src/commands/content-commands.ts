import type { Command } from "commander";
import type { Core } from "../core/backlog.ts";
import { decisionListJson, printJson } from "../formatters/json-output.ts";
import {
	type Decision,
	DOCUMENT_TYPE_VALUES,
	type Document as DocType,
	type DocumentSearchResult,
	type SearchResult,
} from "../types/index.ts";
import { isAmbiguousIdError } from "../utils/entity-id.ts";
import { generateNextDecisionId } from "../utils/id-generators.ts";
import {
	addListWindowOptions,
	LIST_WINDOW_HELP_FIELDS,
	LIST_WINDOW_OUTPUT_HELP,
	type ListWindow,
	type ListWindowOptions,
	printListWindow,
	selectListWindow,
} from "../utils/list-window.ts";
import { parseDelimitedStringList } from "../utils/task-builders.ts";
import { addHelpSchema, choiceType } from "./help-schema.ts";

const DOCUMENT_SEARCH_QUERY_MAX_LENGTH = 200;
const DOCUMENT_SEARCH_LIMIT_MAX = 100;
type ContentCommandRuntime = {
	createCore(): Promise<Core>;
	isPlainRequested(options?: { plain?: boolean }): boolean;
	resolveListOutput(
		options: ListWindowOptions & { json?: boolean; plain?: boolean },
		command: Command,
	): { outputMode: "interactive" | "plain" | "json"; listWindow: ListWindow } | null;
};

function createMultiValueAccumulator() {
	return (value: string, previous: string | string[]) => {
		const soFar = Array.isArray(previous) ? previous : previous ? [previous] : [];
		return [...soFar, value];
	};
}

function parseDocumentSearchLimit(value: unknown): number | undefined | null {
	if (value === undefined) return undefined;
	const rawValue = String(value).trim();
	const limit = Number(rawValue);
	if (rawValue.length === 0 || !Number.isInteger(limit) || limit < 1 || limit > DOCUMENT_SEARCH_LIMIT_MAX) {
		console.error(
			`Invalid limit: ${rawValue || "(empty)"}. Limit must be an integer between 1 and ${DOCUMENT_SEARCH_LIMIT_MAX}.`,
		);
		process.exitCode = 1;
		return null;
	}
	return limit;
}

function isDocumentSearchResult(result: SearchResult): result is DocumentSearchResult {
	return result.type === "document";
}

function printDocumentSearchResults(results: DocumentSearchResult[], query: string): void {
	if (results.length === 0) {
		console.log(`No documents found for "${query}".`);
		return;
	}
	console.log("Documents:");
	for (const result of results) {
		const { document } = result;
		const scoreText = result.score === null ? "" : ` [score ${(1 - result.score).toFixed(3)}]`;
		console.log(
			`  ${document.id} - ${document.title} (path: ${document.path ?? "(unknown)"}, type: ${document.type}, tags: ${document.tags?.join(", ") || "(none)"})${scoreText}`,
		);
		console.log(`    View: agenticworkspace doc view ${document.id}`);
	}
}

export function registerContentCommands(program: Command, runtime: ContentCommandRuntime): void {
	const docCmd = program.command("doc");
	addHelpSchema(docCmd.command("create <title>"), {
		required: [{ name: "title", type: "String", description: "Document title" }],
		optional: [
			{
				name: "path",
				type: "Docs-relative path",
				description: "Subdirectory under backlog/docs; absolute paths and .. are rejected",
			},
			{ name: "type", type: choiceType(DOCUMENT_TYPE_VALUES), description: "Document type" },
			{ name: "plain", type: "Boolean", description: "Use plain text output" },
		],
		writes: "Creates a document markdown file under the configured docs directory",
		output: "Created document ID and path",
		examples: ['agenticworkspace doc create "API Guidelines" -p guides/api'],
	})
		.option("-p, --path <path>")
		.option("-t, --type <type>", `document type (${DOCUMENT_TYPE_VALUES.join(", ")})`)
		.option("--plain", "use plain text output")
		.action(async (title: string, options) => {
			const core = await runtime.createCore();
			const document = await core.createDocumentFromInput({
				title,
				type: (options.type || "other") as DocType["type"],
				path: options.path,
				content: "",
			});
			console.log(`Created document ${document.id}`);
			if (document.path) console.log(`Path: ${core.filesystem.backlogDirName}/docs/${document.path}`);
		});
	addHelpSchema(docCmd.command("update <docId>"), {
		required: [{ name: "docId", type: "Document ID", description: "Document to update" }],
		optional: [
			{ name: "title", type: "String", description: "Replacement title" },
			{ name: "content", type: "Markdown", description: "Replacement document body" },
			{ name: "path", type: "Docs-relative path", description: "Move document under backlog/docs" },
			{ name: "type", type: choiceType(DOCUMENT_TYPE_VALUES), description: "Document type" },
			{ name: "tags", type: "Comma-separated strings", description: "Replacement tags" },
		],
		writes: "Updates document content, metadata, or docs-relative path",
		output: "Updated document ID and path",
		examples: [
			'agenticworkspace doc update doc-1 --content "Updated markdown"',
			"agenticworkspace doc update doc-1 -p guides",
		],
	})
		.description("update a document")
		.option("--title <title>", "update document title")
		.option("--content <content>", "replace document markdown content")
		.option("-p, --path <path>", "move document under a docs-relative path (absolute paths and .. are rejected)")
		.option("-t, --type <type>", `document type (${DOCUMENT_TYPE_VALUES.join(", ")})`)
		.option("--tags <tags>", "set tags (comma-separated or use multiple times)", createMultiValueAccumulator())
		.action(async (docId: string, options) => {
			const core = await runtime.createCore();
			const existingDocument = await core.getDocument(docId);
			if (!existingDocument) throw new Error(`Document not found: ${docId}`);
			const document = await core.updateDocumentFromInput({
				id: docId,
				title: options.title,
				content: options.content ?? existingDocument.rawContent,
				type: options.type,
				path: options.path,
				...(options.tags !== undefined && { tags: parseDelimitedStringList(options.tags) ?? [] }),
			});
			console.log(`Updated document ${document.id}`);
			if (document.path) console.log(`Path: ${core.filesystem.backlogDirName}/docs/${document.path}`);
		});
	const docListCommand = addHelpSchema(docCmd.command("list"), {
		reads: "Documents under the configured docs directory",
		required: [],
		optional: [...LIST_WINDOW_HELP_FIELDS, { name: "plain", type: "Boolean", description: "Use plain text output" }],
		output: `Document list with IDs, titles, types, paths, and tags, ordered by title. ${LIST_WINDOW_OUTPUT_HELP}`,
		examples: ["agenticworkspace doc list --plain", "agenticworkspace doc list --max-count 20 --plain"],
	});
	addListWindowOptions(docListCommand)
		.option("--plain", "use plain text output")
		.action(async (options) => {
			const listOutput = runtime.resolveListOutput(
				{ ...options, plain: runtime.isPlainRequested(options) },
				docListCommand,
			);
			if (!listOutput) return;
			const docs = await (await runtime.createCore()).filesystem.listDocuments();
			printListWindow(docs, listOutput.listWindow, (items) => {
				if (items.length === 0) console.log("No docs found.");
				for (const document of items) console.log(`${document.id} - ${document.title}`);
			});
		});
	const docSearchCommand = addHelpSchema(docCmd.command("search <query>"), {
		reads: "Documents under the configured docs directory using the shared fuzzy search index",
		writes: "None; this is a read-only command",
		required: [{ name: "query", type: "String", description: "Search text, 1-200 characters" }],
		optional: [
			{
				name: "limit",
				type: "Integer",
				description: `Maximum matching documents to return, 1-${DOCUMENT_SEARCH_LIMIT_MAX}`,
			},
			...LIST_WINDOW_HELP_FIELDS,
		],
		output: `Plain text Documents list with id, title, path, type, tags, score, and a follow-up doc view command. ${LIST_WINDOW_OUTPUT_HELP}`,
		examples: [
			'agenticworkspace doc search "architecture"',
			'agenticworkspace doc search "runbook" --limit 5',
			'agenticworkspace doc search "runbook" --max-count 5 --skip 5',
		],
	}).option("-l, --limit <number>", `limit results returned (1-${DOCUMENT_SEARCH_LIMIT_MAX})`);
	addListWindowOptions(docSearchCommand)
		.description("search documents using the shared fuzzy index")
		.action(async (query: string, options) => {
			const normalizedQuery = query.trim();
			if (!normalizedQuery) {
				console.error(
					'Query is required. Provide non-empty text, for example: agenticworkspace doc search "architecture"',
				);
				process.exitCode = 1;
				return;
			}
			if (normalizedQuery.length > DOCUMENT_SEARCH_QUERY_MAX_LENGTH) {
				console.error(`Query must be ${DOCUMENT_SEARCH_QUERY_MAX_LENGTH} characters or fewer.`);
				process.exitCode = 1;
				return;
			}
			const limit = parseDocumentSearchLimit(options.limit);
			if (limit === null) return;
			const listOutput = runtime.resolveListOutput(options, docSearchCommand);
			if (!listOutput) return;
			const core = await runtime.createCore();
			const results = (await core.searchPersistently({ query: normalizedQuery, limit, types: ["document"] })).filter(
				isDocumentSearchResult,
			);
			printListWindow(results, listOutput.listWindow, (items) => printDocumentSearchResults(items, normalizedQuery));
		});
	addHelpSchema(docCmd.command("view <docId>"), {
		reads: "Document metadata and markdown body",
		required: [{ name: "docId", type: "Document ID", description: "Document to display" }],
		optional: [{ name: "plain", type: "Boolean", description: "Use plain text output" }],
		output: "Document metadata and markdown content",
		examples: ["agenticworkspace doc view doc-1", "agenticworkspace doc view doc-1 --plain"],
	})
		.description("view a document")
		.option("--plain", "use plain text output")
		.action(async (docId: string) => {
			try {
				const content = await (await runtime.createCore()).getDocumentContent(docId);
				if (content === null) {
					console.error(`Document ${docId} not found.`);
					return;
				}
				console.log(content);
			} catch (error) {
				if (isAmbiguousIdError(error)) {
					console.error(error.message);
					process.exitCode = 1;
					return;
				}
				console.error(`Document ${docId} not found.`);
			}
		});
	const decisionCmd = program.command("decision");
	addHelpSchema(decisionCmd.command("create <title>"), {
		required: [{ name: "title", type: "String", description: "Decision title" }],
		optional: [
			{ name: "status", type: "String", description: "Decision status; free-form, defaults to proposed" },
			{ name: "plain", type: "Boolean", description: "Use plain text output" },
		],
		writes: "Creates a decision markdown file under the configured decisions directory",
		output: "Created decision ID",
		examples: ['agenticworkspace decision create "Adopt Bun test runner" -s accepted --plain'],
	})
		.description("create a decision")
		.option("-s, --status <status>", "set decision status (free-form, defaults to proposed)")
		.option("--plain", "use plain text output")
		.action(async (title: string, options) => {
			const core = await runtime.createCore();
			const id = await generateNextDecisionId(core);
			const decision: Decision = {
				id,
				title,
				date: new Date().toISOString().slice(0, 16).replace("T", " "),
				status: (options.status || "proposed") as Decision["status"],
				context: "",
				decision: "",
				consequences: "",
				rawContent: "",
			};
			await core.createDecision(decision);
			console.log(`Created decision ${id}`);
		});
	const decisionListCommand = addHelpSchema(decisionCmd.command("list"), {
		reads: "Decisions under the configured decisions directory",
		writes: "None; this is a read-only command",
		required: [],
		optional: [
			...LIST_WINDOW_HELP_FIELDS,
			{ name: "plain", type: "Boolean", description: "Use plain text output, which is the default for this command" },
			{ name: "json", type: "Boolean", description: "Use versioned machine-readable JSON output" },
		],
		output: `Decision list with IDs, titles, and statuses, ordered by ID; versioned JSON with --json. ${LIST_WINDOW_OUTPUT_HELP}; JSON adds total and nextSkip`,
		examples: [
			"agenticworkspace decision list --plain",
			"agenticworkspace decision list --json",
			"agenticworkspace decision list --max-count 20",
		],
	}).description("list decisions");
	addListWindowOptions(decisionListCommand)
		.option("--plain", "use plain text output")
		.option("--json", "print versioned machine-readable JSON output")
		.action(async (options) => {
			const listOutput = runtime.resolveListOutput(options, decisionListCommand);
			if (!listOutput) return;
			const decisions = await (await runtime.createCore()).filesystem.listDecisions();
			if (listOutput.outputMode === "json") {
				const page = selectListWindow(decisions, listOutput.listWindow);
				printJson(decisionListJson(page.items, page));
				return;
			}
			printListWindow(decisions, listOutput.listWindow, (items) => {
				if (items.length === 0) console.log("No decisions found.");
				for (const decision of items)
					console.log(`${decision.id} - ${decision.title}${decision.status ? ` (${decision.status})` : ""}`);
			});
		});
}
