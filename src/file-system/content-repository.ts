import { unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { FrontmatterSchemaError, parseDecision, parseMarkdown } from "../markdown/parser.ts";
import { serializeDecision } from "../markdown/serializer.ts";
import type { Decision } from "../types/index.ts";
import { AmbiguousIdError, decisionIdKey, findDecisionById, normalizeDecisionId } from "../utils/entity-id.ts";
import { sortByTaskId } from "../utils/task-sorting.ts";

export interface ContentRepositoryContext {
	decisionsDirectory(): Promise<string>;
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
			const id = normalizeDecisionId(decision.id);
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
}

function validateIdToken(id: string, prefix: "decision"): void {
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
