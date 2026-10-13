import { mkdir, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { collectMilestoneAliasKeys } from "../core/milestones.ts";
import { FrontmatterSchemaError, parseMarkdown, parseMilestone } from "../markdown/parser.ts";
import { serializeMilestone } from "../markdown/serializer.ts";
import type { Milestone } from "../types/index.ts";
import { normalizeDueDate } from "../utils/due-date.ts";

type Scope = "active" | "archived";
type MilestoneFile = { file: string; filepath: string; content: string; milestone: Milestone };
type MilestoneMatches = Record<
	"rawId" | "canonicalId" | "aliasId" | "title" | "variantId" | "variantTitle",
	MilestoneFile[]
>;

export interface MilestoneStoreContext {
	activeDirectory(): Promise<string>;
	archiveDirectory(): Promise<string>;
	ensureDirectory(directory: string): Promise<void>;
	withCreateLock<T>(operation: () => Promise<T>): Promise<T>;
}

function identifierKeys(identifier: string): Set<string> {
	return collectMilestoneAliasKeys(identifier);
}

function filename(id: string, title: string): string {
	return `${id} - ${title
		.replace(/[<>:"/\\|?*]/g, "")
		.replace(/\s+/g, "-")
		.toLowerCase()
		.slice(0, 50)}.md`;
}

function canonicalIdentifier(input: string): string | null {
	return /^\d+$/.test(input) || /^m-\d+$/.test(input)
		? `m-${String(Number.parseInt(input.replace(/^m-/, ""), 10))}`
		: null;
}

function emptyMatches(): MilestoneMatches {
	return { rawId: [], canonicalId: [], aliasId: [], title: [], variantId: [], variantTitle: [] };
}

function chooseMatch(input: string, matches: MilestoneMatches): MilestoneFile | null {
	const one = (items: MilestoneFile[]) => (items.length === 1 ? items[0] : null);
	const numeric = /^\d+$/.test(input) || /^m-\d+$/.test(input);
	return numeric
		? (matches.rawId[0] ??
				matches.canonicalId[0] ??
				one(matches.aliasId) ??
				one(matches.variantId) ??
				one(matches.title) ??
				one(matches.variantTitle) ??
				null)
		: (matches.rawId[0] ??
				one(matches.title) ??
				matches.canonicalId[0] ??
				one(matches.variantId) ??
				one(matches.variantTitle) ??
				null);
}

export class MilestoneStore {
	constructor(private readonly context: MilestoneStoreContext) {}

	private async directory(scope: Scope): Promise<string> {
		return scope === "active" ? this.context.activeDirectory() : this.context.archiveDirectory();
	}

	private async find(identifier: string, scope: Scope = "active"): Promise<MilestoneFile | null> {
		const input = identifier.trim().toLowerCase();
		const keys = identifierKeys(identifier);
		if (!keys.size) return null;
		const variants = new Set(keys);
		variants.delete(input);
		const canonical = canonicalIdentifier(input);
		const matches = emptyMatches();
		const milestonesDir = await this.directory(scope);
		const files = await Array.fromAsync(new Bun.Glob("m-*.md").scan({ cwd: milestonesDir, followSymlinks: true }));
		for (const file of files) {
			if (file.toLowerCase() === "readme.md") continue;
			const filepath = join(milestonesDir, file);
			let milestone: Milestone;
			let content: string;
			try {
				content = await Bun.file(filepath).text();
				milestone = parseMilestone(content);
			} catch (error) {
				if (error instanceof FrontmatterSchemaError) throw error;
				continue;
			}
			const match = { file, filepath, content, milestone };
			const id = milestone.id.trim().toLowerCase();
			const title = milestone.title.trim().toLowerCase();
			if (id === input) matches.rawId.push(match);
			else if (canonical && id === canonical) matches.canonicalId.push(match);
			else if (identifierKeys(milestone.id).has(input)) matches.aliasId.push(match);
			else if (title === input) matches.title.push(match);
			else if ([...identifierKeys(milestone.id)].some((key) => variants.has(key))) matches.variantId.push(match);
			else if (variants.has(title)) matches.variantTitle.push(match);
		}
		return chooseMatch(input, matches);
	}

	private async restoreRename(
		sourcePath: string | undefined,
		targetPath: string | undefined,
		original: string | undefined,
		moved: boolean,
	): Promise<void> {
		try {
			if (moved && sourcePath && targetPath && sourcePath !== targetPath) {
				await rename(targetPath, sourcePath);
				if (original) await Bun.write(sourcePath, original);
			} else if (original) await Bun.write(sourcePath ?? targetPath ?? "", original);
		} catch {
			/* Preserve the original failure. */
		}
	}

	private async list(directory: string): Promise<Milestone[]> {
		const files = await Array.fromAsync(new Bun.Glob("m-*.md").scan({ cwd: directory, followSymlinks: true }));
		const milestones: Milestone[] = [];
		for (const file of files) {
			if (file.toLowerCase() === "readme.md") continue;
			try {
				milestones.push(parseMilestone(await Bun.file(join(directory, file)).text()));
			} catch (error) {
				if (error instanceof FrontmatterSchemaError) throw error;
				/* Ignore malformed files. */
			}
		}
		return milestones.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
	}

	async listActive(): Promise<Milestone[]> {
		try {
			return await this.list(await this.directory("active"));
		} catch (error) {
			if (error instanceof FrontmatterSchemaError) throw error;
			return [];
		}
	}
	async listArchived(): Promise<Milestone[]> {
		try {
			return await this.list(await this.directory("archived"));
		} catch (error) {
			if (error instanceof FrontmatterSchemaError) throw error;
			return [];
		}
	}
	async filePath(identifier: string): Promise<string | null> {
		return (await this.find(identifier))?.filepath ?? null;
	}
	async load(identifier: string): Promise<Milestone | null> {
		try {
			return (await this.find(identifier))?.milestone ?? null;
		} catch (error) {
			if (error instanceof FrontmatterSchemaError) throw error;
			return null;
		}
	}

	async create(title: string, description?: string, dueDate?: string): Promise<Milestone> {
		const normalizedDueDate = normalizeDueDate(dueDate, "Due date");
		return this.context.withCreateLock(async () => {
			const [active, archived] = await Promise.all([this.directory("active"), this.directory("archived")]);
			await Promise.all([mkdir(active, { recursive: true }), mkdir(archived, { recursive: true })]);
			const allFiles = await Promise.all([
				Array.fromAsync(new Bun.Glob("m-*.md").scan({ cwd: active, followSymlinks: true })),
				Array.fromAsync(new Bun.Glob("m-*.md").scan({ cwd: archived, followSymlinks: true })),
			]);
			const ids = await Promise.all(
				allFiles.flatMap((files, index) =>
					files.map(async (file) => {
						const match = file.match(/^m-(\d+)/i);
						try {
							const id = parseMilestone(await Bun.file(join(index === 0 ? active : archived, file)).text()).id.match(
								/^m-(\d+)$/i,
							)?.[1];
							return id ? Number.parseInt(id, 10) : match?.[1] ? Number.parseInt(match[1], 10) : null;
						} catch (error) {
							if (error instanceof FrontmatterSchemaError) throw error;
							return match?.[1] ? Number.parseInt(match[1], 10) : null;
						}
					}),
				),
			);
			const next = ids.filter((id): id is number => typeof id === "number" && id >= 0);
			const id = `m-${next.length ? Math.max(...next) + 1 : 0}`;
			const content = serializeMilestone({
				id,
				title,
				dueDate: normalizedDueDate,
				description: description || `Milestone: ${title}`,
				rawContent: "",
			});
			await Bun.write(join(active, filename(id, title)), content);
			return parseMilestone(content);
		});
	}

	async rename(identifier: string, title: string, dueDate?: string | null) {
		const normalizedTitle = title.trim();
		if (!normalizedTitle) return { success: false };
		const normalizedDueDate = dueDate === null ? undefined : normalizeDueDate(dueDate, "Due date");
		let sourcePath: string | undefined;
		let targetPath: string | undefined;
		let original: string | undefined;
		let moved = false;
		try {
			const found = await this.find(identifier);
			if (!found) return { success: false };
			sourcePath = found.filepath;
			targetPath = join(await this.directory("active"), filename(found.milestone.id, normalizedTitle));
			original = found.content;
			const content = serializeMilestone(
				{
					...found.milestone,
					title: normalizedTitle,
					dueDate: dueDate === undefined ? found.milestone.dueDate : normalizedDueDate,
					description:
						found.milestone.description === `Milestone: ${found.milestone.title}`
							? `Milestone: ${normalizedTitle}`
							: found.milestone.description,
				},
				parseMarkdown(found.content).frontmatter,
			);
			if (sourcePath !== targetPath) {
				if (await Bun.file(targetPath).exists()) return { success: false };
				await rename(sourcePath, targetPath);
				moved = true;
			}
			await Bun.write(targetPath, content);
			return {
				success: true,
				sourcePath,
				targetPath,
				milestone: parseMilestone(content),
				previousTitle: found.milestone.title,
				previousDueDate: found.milestone.dueDate,
			};
		} catch (error) {
			await this.restoreRename(sourcePath, targetPath, original, moved);
			if (error instanceof FrontmatterSchemaError) throw error;
			return { success: false };
		}
	}

	async archive(identifier: string) {
		if (!identifier.trim()) return { success: false };
		try {
			const found = await this.find(identifier);
			if (!found) return { success: false };
			const targetPath = join(await this.directory("archived"), found.file);
			await this.context.ensureDirectory(dirname(targetPath));
			await rename(found.filepath, targetPath);
			return { success: true, sourcePath: found.filepath, targetPath, milestone: found.milestone };
		} catch (error) {
			if (error instanceof FrontmatterSchemaError) throw error;
			return { success: false };
		}
	}
}
