import { parseFrontmatter } from "../markdown/frontmatter.ts";
import { DECISION_FRONTMATTER_FIELDS } from "../markdown/schema.ts";
import type { Decision } from "../types/index.ts";
import { formatStoredDate } from "../utils/date.ts";
import type { Core } from "./agentic-workspace.ts";
import type { Storage } from "./storage.ts";

export class ProjectContentService {
	constructor(
		private readonly storage: Storage,
		private readonly core: Core,
	) {}

	async createDecision(decision: Decision, retainedFrontmatter?: Record<string, unknown>): Promise<void> {
		await this.storage.saveDecision(decision, retainedFrontmatter);
	}

	async updateDecisionFromContent(decisionId: string, content: string): Promise<void> {
		const existing = await this.storage.loadDecision(decisionId);
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
			id: await this.core.generateNextDecisionId(),
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
}
