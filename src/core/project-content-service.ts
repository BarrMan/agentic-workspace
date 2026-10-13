import { join } from "node:path";
import { parseFrontmatter } from "../markdown/frontmatter.ts";
import { DECISION_FRONTMATTER_FIELDS } from "../markdown/schema.ts";
import type {
	Decision,
	Document,
	DocumentCreateInput,
	DocumentType,
	DocumentUpdateInput,
	Milestone,
} from "../types/index.ts";
import { formatStoredDate } from "../utils/date.ts";
import { findDocumentById, normalizeDocumentId } from "../utils/document-id.ts";
import { getDocumentSubPathFromRelativePath, normalizeDocumentSubPath } from "../utils/document-path.ts";
import { generateNextDecisionId, generateNextDocId } from "../utils/id-generators.ts";
import { normalizeStringList } from "../utils/task-builders.ts";
import type { Core } from "./backlog.ts";

function normalizeDocumentTypeInput(type: unknown): DocumentType | undefined {
	if (type === undefined) return undefined;
	if (typeof type === "string" && ["guide", "reference", "design", "other"].includes(type)) return type as DocumentType;
	throw new Error("Document type must be one of: guide, reference, design, other.");
}

export class ProjectContentService {
	constructor(private readonly core: Core) {}

	async getDocument(documentId: string): Promise<Document | null> {
		return findDocumentById(await this.core.filesystem.listDocuments(), documentId);
	}

	async getDocumentContent(documentId: string): Promise<string | null> {
		const document = await this.getDocument(documentId);
		if (!document) return null;
		try {
			return await Bun.file(
				join(
					this.core.filesystem.docsDir,
					...normalizeDocumentSubPath(document.path ?? `${document.id}.md`).split("/"),
				),
			).text();
		} catch {
			return null;
		}
	}

	async createDecision(decision: Decision, retainedFrontmatter?: Record<string, unknown>): Promise<void> {
		await this.core.filesystem.saveDecision(decision, retainedFrontmatter);
	}

	async updateDecisionFromContent(decisionId: string, content: string): Promise<void> {
		const existing = await this.core.filesystem.loadDecision(decisionId);
		if (!existing) throw new Error(`Decision ${decisionId} not found`);
		const parsed = parseFrontmatter(content);
		const frontmatter = parsed.data as Partial<
			Pick<Decision, "title" | "status" | "date" | "context" | "decision" | "consequences" | "alternatives">
		>;
		await this.createDecision(
			{
				...existing,
				title: frontmatter[DECISION_FRONTMATTER_FIELDS.TITLE] || existing.title,
				status: frontmatter[DECISION_FRONTMATTER_FIELDS.STATUS] || existing.status,
				date: frontmatter[DECISION_FRONTMATTER_FIELDS.DATE] || existing.date,
				context: frontmatter[DECISION_FRONTMATTER_FIELDS.CONTEXT] ?? existing.context,
				decision: frontmatter[DECISION_FRONTMATTER_FIELDS.DECISION] ?? existing.decision,
				consequences: frontmatter[DECISION_FRONTMATTER_FIELDS.CONSEQUENCES] ?? existing.consequences,
				alternatives: frontmatter[DECISION_FRONTMATTER_FIELDS.ALTERNATIVES] ?? existing.alternatives,
				rawContent: parsed.content,
			},
			parsed.data,
		);
	}

	async createDecisionWithTitle(title: string): Promise<Decision> {
		const decision: Decision = {
			id: await generateNextDecisionId(this.core),
			title,
			date: formatStoredDate(),
			status: "proposed",
			context: "[Describe the context and problem that needs to be addressed]",
			decision: "[Describe the decision that was made]",
			consequences: "[Describe the consequences of this decision]",
			rawContent: "",
		};
		await this.createDecision(decision);
		return decision;
	}

	async createDocument(document: Document, subPath = ""): Promise<void> {
		const { relativePath } = await this.core.filesystem.saveDocument(document, normalizeDocumentSubPath(subPath));
		document.path = relativePath;
	}

	async createDocumentFromInput(input: DocumentCreateInput): Promise<Document> {
		const title = input.title.trim();
		if (!title) throw new Error("Title is required to create a document.");
		const tags = normalizeStringList(input.tags);
		const document = await this.core.withCreateLock(async () => {
			const created: Document = {
				id: normalizeDocumentId(await generateNextDocId(this.core)),
				title,
				type: normalizeDocumentTypeInput(input.type) ?? "other",
				createdDate: formatStoredDate(),
				rawContent: input.content ?? "",
				...(tags && tags.length > 0 && { tags }),
			};
			await this.createDocument(created, normalizeDocumentSubPath(input.path));
			return created;
		});
		return (await this.getDocument(document.id)) ?? document;
	}

	async updateDocumentFromInput(input: DocumentUpdateInput): Promise<Document> {
		const existing = await this.getDocument(input.id);
		if (!existing) throw new Error(`Document not found: ${input.id}`);
		const title = input.title?.trim();
		if (input.title !== undefined && !title) throw new Error("Document title cannot be empty.");
		const tags = input.tags === undefined ? existing.tags : normalizeStringList(input.tags);
		const updated: Document = {
			...existing,
			id: normalizeDocumentId(existing.id),
			title: title ?? existing.title,
			type: normalizeDocumentTypeInput(input.type) ?? existing.type,
			rawContent: input.content,
			updatedDate: formatStoredDate(),
			tags: tags && tags.length > 0 ? tags : undefined,
		};
		await this.createDocument(
			updated,
			input.path === undefined
				? getDocumentSubPathFromRelativePath(existing.path)
				: normalizeDocumentSubPath(input.path),
		);
		return (await this.getDocument(existing.id)) ?? updated;
	}

	async archiveMilestone(
		identifier: string,
	): Promise<{ success: boolean; sourcePath?: string; targetPath?: string; milestone?: Milestone }> {
		await this.core.filesystem.loadConfig();
		const result = await this.core.filesystem.archiveMilestone(identifier);
		return result;
	}

	async renameMilestone(
		identifier: string,
		title: string,
		dueDate?: string | null,
	): Promise<{
		success: boolean;
		sourcePath?: string;
		targetPath?: string;
		milestone?: Milestone;
		previousTitle?: string;
		previousDueDate?: string;
	}> {
		await this.core.filesystem.loadConfig();
		const result = await this.core.filesystem.renameMilestone(identifier, title, dueDate);
		return result;
	}
}
