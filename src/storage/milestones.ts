import { rename, stat } from "node:fs/promises";
import { join } from "node:path";
import { normalizeDueDate } from "../model/task/due-date.ts";
import type { Milestone } from "../model/types.ts";
import { writeAtomically } from "./atomic-write.ts";
import { FrontmatterSchemaError } from "./errors/frontmatter.ts";
import { parseMarkdown, parseMilestone } from "./markdown/parser.ts";
import { serializeMilestone } from "./markdown/serializer.ts";

type Scope = "active" | "archived";
type MilestoneFile = { file: string; filepath: string; content: string; milestone: Milestone };

function parseMilestoneId(value: string): string | null {
	return /^m-(\d+)$/i.test(value.trim()) ? value.trim().slice(2) : null;
}

export interface MilestoneStoreContext {
	activeDirectory(): Promise<string>;
	archiveDirectory(): Promise<string>;
	ensureDirectory(directory: string): Promise<void>;
	withCreateLock<T>(operation: () => Promise<T>): Promise<T>;
}

function filename(id: string, title: string): string {
	return `${id} - ${title
		.replace(/[<>:"/\\|?*]/g, "")
		.replace(/\s+/g, "-")
		.toLowerCase()
		.slice(0, 50)}.md`;
}

async function assertAbsent(filepath: string): Promise<void> {
	try {
		await stat(filepath);
		throw new Error(`Milestone destination already exists: ${filepath}`);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
}

export class MilestoneStore {
	constructor(private readonly context: MilestoneStoreContext) {}

	private async directory(scope: Scope): Promise<string> {
		return scope === "active" ? this.context.activeDirectory() : this.context.archiveDirectory();
	}

	private async find(identifier: string, scope: Scope = "active"): Promise<MilestoneFile | null> {
		if (!identifier.trim()) return null;
		const milestonesDir = await this.directory(scope);
		await stat(milestonesDir);
		const files = await Array.fromAsync(new Bun.Glob("m-*.md").scan({ cwd: milestonesDir, followSymlinks: true }));
		const entries: MilestoneFile[] = [];
		for (const file of files) {
			if (file.toLowerCase() === "readme.md") continue;
			const filepath = join(milestonesDir, file);
			const content = await Bun.file(filepath).text();
			let milestone: Milestone;
			try {
				milestone = parseMilestone(content);
			} catch (error) {
				if (error instanceof FrontmatterSchemaError) throw error;
				continue;
			}
			entries.push({ file, filepath, content, milestone });
		}
		return entries.find((entry) => entry.milestone.id === identifier) ?? null;
	}

	private async restoreRename(
		sourcePath: string | undefined,
		targetPath: string | undefined,
		moved: boolean,
	): Promise<void> {
		try {
			if (moved && sourcePath && targetPath && sourcePath !== targetPath) {
				await rename(targetPath, sourcePath);
			}
		} catch {
			/* Preserve the original failure. */
		}
	}

	private async list(directory: string): Promise<Milestone[]> {
		await stat(directory);
		const files = await Array.fromAsync(new Bun.Glob("m-*.md").scan({ cwd: directory, followSymlinks: true }));
		const milestones: Milestone[] = [];
		for (const file of files) {
			if (file.toLowerCase() === "readme.md") continue;
			const content = await Bun.file(join(directory, file)).text();
			try {
				milestones.push(parseMilestone(content));
			} catch (error) {
				if (error instanceof FrontmatterSchemaError) throw error;
				/* Ignore malformed files. */
			}
		}
		return milestones.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
	}

	async listActive(): Promise<Milestone[]> {
		return await this.list(await this.directory("active"));
	}
	async listArchived(): Promise<Milestone[]> {
		return await this.list(await this.directory("archived"));
	}
	async filePath(identifier: string): Promise<string | null> {
		return (await this.find(identifier))?.filepath ?? null;
	}
	async load(identifier: string): Promise<Milestone | null> {
		try {
			return (await this.find(identifier))?.milestone ?? null;
		} catch (error) {
			if (error instanceof FrontmatterSchemaError || (error as NodeJS.ErrnoException).code) throw error;
			return null;
		}
	}

	async create(title: string, description?: string, dueDate?: string): Promise<Milestone> {
		const normalizedDueDate = normalizeDueDate(dueDate, "Due date");
		return this.context.withCreateLock(async () => {
			const [active, archived] = await Promise.all([this.directory("active"), this.directory("archived")]);
			await Promise.all([stat(active), stat(archived)]);
			const allFiles = await Promise.all([
				Array.fromAsync(new Bun.Glob("m-*.md").scan({ cwd: active, followSymlinks: true })),
				Array.fromAsync(new Bun.Glob("m-*.md").scan({ cwd: archived, followSymlinks: true })),
			]);
			const ids = await Promise.all(
				allFiles.flatMap((files, index) =>
					files.map(async (file) => {
						const match = parseMilestoneId(file.split(" - ", 1)[0] ?? "");
						try {
							const id = parseMilestoneId(
								parseMilestone(await Bun.file(join(index === 0 ? active : archived, file)).text()).id,
							);
							return id ? Number.parseInt(id, 10) : match ? Number.parseInt(match, 10) : null;
						} catch (error) {
							if (error instanceof FrontmatterSchemaError) throw error;
							return match ? Number.parseInt(match, 10) : null;
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
			await writeAtomically(join(active, filename(id, title)), content, "Atomic milestone");
			return parseMilestone(content);
		});
	}

	async rename(identifier: string, title: string, dueDate?: string | null) {
		const normalizedTitle = title.trim();
		if (!normalizedTitle) return { success: false };
		const normalizedDueDate = dueDate === null ? undefined : normalizeDueDate(dueDate, "Due date");
		return await this.context.withCreateLock(async () => {
			let sourcePath: string | undefined;
			let targetPath: string | undefined;
			let moved = false;
			try {
				const found = await this.find(identifier);
				if (!found) return { success: false };
				sourcePath = found.filepath;
				targetPath = join(await this.directory("active"), filename(found.milestone.id, normalizedTitle));
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
					try {
						await stat(targetPath);
						return { success: false };
					} catch (error) {
						if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
					}
					await rename(sourcePath, targetPath);
					moved = true;
				}
				await writeAtomically(targetPath, content, "Atomic milestone");
				return {
					success: true,
					sourcePath,
					targetPath,
					milestone: parseMilestone(content),
					previousTitle: found.milestone.title,
					previousDueDate: found.milestone.dueDate,
				};
			} catch (error) {
				await this.restoreRename(sourcePath, targetPath, moved);
				if (error instanceof FrontmatterSchemaError) throw error;
				return { success: false };
			}
		});
	}

	async archive(identifier: string) {
		if (!identifier.trim()) return { success: false };
		return await this.context.withCreateLock(async () => {
			try {
				const found = await this.find(identifier);
				if (!found) return { success: false };
				const targetPath = join(await this.directory("archived"), found.file);
				await assertAbsent(targetPath);
				await rename(found.filepath, targetPath);
				return { success: true, sourcePath: found.filepath, targetPath, milestone: found.milestone };
			} catch (error) {
				if (error instanceof FrontmatterSchemaError) throw error;
				return { success: false };
			}
		});
	}
}
