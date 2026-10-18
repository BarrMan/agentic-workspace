import { rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { FrontmatterSchemaError, parseDecision, parseDocument, parseMarkdown } from "../markdown/parser.ts";
import { serializeDecision, serializeDocument } from "../markdown/serializer.ts";
import type { Decision, Document } from "../types/index.ts";
import { decisionIdKey, findDecisionById } from "../utils/decision-id.ts";
import { documentIdKey, findDocumentById, normalizeDocumentId } from "../utils/document-id.ts";
import { normalizeDocumentRelativePath, normalizeDocumentSubPath } from "../utils/document-path.ts";
import { AmbiguousIdError, normalizeEntityId } from "../utils/entity-id.ts";
import { sortByTaskId } from "../utils/task-sorting.ts";

export interface ContentRepositoryContext {
	decisionsDirectory(): Promise<string>;
	documentsDirectory(): Promise<string>;
	ensureDirectory(directory: string): Promise<void>;
	withCreateLock?<T>(operation: () => Promise<T>): Promise<T>;
}

export class ContentRepository {
	constructor(private readonly context: ContentRepositoryContext) {}

	async saveDecision(
		decision: Decision,
		retainedFrontmatter?: Record<string, unknown>,
	): Promise<{ filepath: string; removedFilepaths: string[] }> {
		const save = async () => {
			const id = normalizeEntityId("decision", decision.id);
			validateIdToken(id, "decision");
			decision.id = id;
			const normalizedId = id.slice("decision-".length);
			const filename = `decision-${normalizedId} - ${sanitizeFilename(decision.title)}.md`;
			const directory = await this.context.decisionsDirectory();
			const filepath = join(directory, filename);
			await this.context.ensureDirectory(dirname(filepath));
			const removedFilepaths: string[] = [];
			let storedFrontmatter: Record<string, unknown> = {};
			const matches = (
				await Array.fromAsync(new Bun.Glob("decision-*.md").scan({ cwd: directory, followSymlinks: true }))
			).filter((match) => decisionIdKey(match.split(" - ")[0] ?? "") === decisionIdKey(id));
			if (matches.length > 1)
				throw new AmbiguousIdError("Decision", id, matches, "Remove the conflicting files, then retry.");
			for (const match of matches) {
				try {
					const path = join(directory, match);
					storedFrontmatter = parseMarkdown(await Bun.file(path).text()).frontmatter;
					if (match === filename) continue;
					await unlink(path);
					removedFilepaths.push(path);
				} catch {}
			}
			await Bun.write(filepath, serializeDecision(decision, retainedFrontmatter ?? storedFrontmatter));
			return { filepath, removedFilepaths };
		};
		return await (this.context.withCreateLock?.(save) ?? save());
	}

	async listDecisions(unreadable?: string[]): Promise<Decision[]> {
		try {
			const directory = await this.context.decisionsDirectory();
			const decisions: Decision[] = [];
			for (const file of await Array.fromAsync(
				new Bun.Glob("decision-*.md").scan({ cwd: directory, followSymlinks: true }),
			)) {
				if (file.toLowerCase() === "readme.md") continue;
				try {
					decisions.push({ ...parseDecision(await Bun.file(join(directory, file)).text()), path: file });
				} catch (error) {
					if (error instanceof FrontmatterSchemaError) throw error;
					unreadable?.push(file);
				}
			}
			return sortByTaskId(decisions);
		} catch (error) {
			if (error instanceof FrontmatterSchemaError) throw error;
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") unreadable?.push("");
			return [];
		}
	}

	async loadDecision(id: string): Promise<Decision | null> {
		return findDecisionById(await this.listDecisions(), id);
	}

	async saveDocument(document: Document, subPath = ""): Promise<{ relativePath: string; removedFilepaths: string[] }> {
		const directory = await this.context.documentsDirectory();
		const id = normalizeDocumentId(document.id);
		validateIdToken(id, "doc");
		document.id = id;
		const filename = `${id} - ${sanitizeFilename(document.title)}.md`;
		const subdirectory = normalizeDocumentSubPath(subPath);
		const relativePath = subdirectory ? `${subdirectory}/${filename}` : filename;
		const filepath = join(directory, ...relativePath.split("/"));
		await this.context.ensureDirectory(dirname(filepath));
		const matches = (await Array.fromAsync(new Bun.Glob("**/doc-*.md").scan({ cwd: directory, followSymlinks: true })))
			.map(normalizeDocumentRelativePath)
			.filter((path) => documentIdKey(path.split("/").pop()?.split(" - ")[0] ?? "") === documentIdKey(id));
		if (matches.length > 1)
			throw new AmbiguousIdError("Document", id, matches, "Remove the conflicting files, then retry.");
		const source = document.path ? normalizeDocumentRelativePath(document.path) : matches[0];
		const removedFilepaths: string[] = [];
		if (source && source !== relativePath) {
			const sourcePath = join(directory, ...source.split("/"));
			try {
				await rename(sourcePath, filepath);
				removedFilepaths.push(sourcePath);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
		}
		for (const match of matches) {
			const matchPath = join(directory, ...match.split("/"));
			if (matchPath === filepath) continue;
			try {
				await unlink(matchPath);
				removedFilepaths.push(matchPath);
			} catch {}
		}
		await Bun.write(filepath, serializeDocument(document));
		document.path = relativePath;
		return { relativePath, removedFilepaths };
	}

	async listDocuments(unreadable?: string[]): Promise<Document[]> {
		try {
			const directory = await this.context.documentsDirectory();
			const documents: Document[] = [];
			for (const file of await Array.fromAsync(
				new Bun.Glob("**/*.md").scan({ cwd: directory, followSymlinks: true }),
			)) {
				const path = normalizeDocumentRelativePath(file);
				if (path.split("/").pop()?.toLowerCase() === "readme.md") continue;
				try {
					documents.push({ ...parseDocument(await Bun.file(join(directory, ...path.split("/"))).text()), path });
				} catch {
					unreadable?.push(path);
				}
			}
			return documents.sort((a, b) => a.title.localeCompare(b.title) || (a.path ?? "").localeCompare(b.path ?? ""));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") unreadable?.push("");
			return [];
		}
	}

	async loadDocument(id: string): Promise<Document> {
		const document = findDocumentById(await this.listDocuments(), id);
		if (!document) throw new Error(`Document not found: ${id}`);
		return document;
	}
}

function validateIdToken(id: string, prefix: "decision" | "doc"): void {
	const body = id.slice(prefix.length + 1);
	if (!body.trim() || /[\\/]/.test(body)) throw new Error(`Invalid ${prefix} ID: ${id}`);
}

function sanitizeFilename(title: string): string {
	return (
		title
			.replace(/[<>:"/\\|?*]/g, "-")
			.replace(/['(),!@#$%^&+=[\]{};]/g, "")
			.replace(/\s+/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "") || "untitled"
	);
}
