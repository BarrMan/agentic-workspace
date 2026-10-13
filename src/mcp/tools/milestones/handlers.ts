import type { Core } from "../../../core/backlog.ts";
import { MilestoneWorkflow, MilestoneWorkflowError } from "../../../core/milestone-workflow.ts";
import { collectArchivedMilestoneKeys } from "../../../core/milestones.ts";
import type { Milestone, Task } from "../../../types/index.ts";
import { normalizeDueDate } from "../../../utils/due-date.ts";
import { formatUtcDateForDisplay } from "../../../utils/utc-date-display.ts";
import { BacklogToolError } from "../../errors/mcp-errors.ts";
import type { CallToolResult } from "../../types.ts";
import {
	buildMilestoneMatchKeys,
	keySetsIntersect,
	milestoneKey,
	normalizeMilestoneName,
} from "../../utils/milestone-resolution.ts";

export type MilestoneAddArgs = {
	name: string;
	description?: string;
	dueDate?: string;
};

export type MilestoneRenameArgs = {
	from: string;
	to: string;
	updateTasks?: boolean;
	dueDate?: string | null;
};

export type MilestoneRemoveArgs = {
	name: string;
	taskHandling?: "clear" | "keep" | "reassign";
	reassignTo?: string;
};

export type MilestoneArchiveArgs = {
	name: string;
};

function formatListBlock(title: string, items: string[]): string {
	if (items.length === 0) {
		return `${title}\n  (none)`;
	}
	return `${title}\n${items.map((item) => `  - ${item}`).join("\n")}`;
}

function formatTaskIdList(taskIds: string[], limit = 20): string {
	if (taskIds.length === 0) return "";
	const shown = taskIds.slice(0, limit);
	const suffix = taskIds.length > limit ? ` (and ${taskIds.length - limit} more)` : "";
	return `${shown.join(", ")}${suffix}`;
}

function buildMilestoneRecordMatchKeys(milestone: Milestone): Set<string> {
	const keys = buildMilestoneMatchKeys(milestone.id, [milestone]);
	const titleKey = milestoneKey(milestone.title);
	if (titleKey) {
		keys.add(titleKey);
	}
	return keys;
}

function resolveMilestoneValueForReporting(value: string, active: Milestone[], archived: Milestone[]): string {
	const normalized = normalizeMilestoneName(value);
	if (!normalized) return "";
	const inputKey = milestoneKey(normalized);
	const titles = active.filter((milestone) => milestoneKey(milestone.title) === inputKey);
	return isMilestoneId(normalized)
		? resolveIdLikeMilestoneValue(normalized, inputKey, titles, active, archived)
		: resolveTitleLikeMilestoneValue(normalized, inputKey, titles, active, archived);
}

function isMilestoneId(value: string): boolean {
	return /^\d+$/.test(value) || /^m-\d+$/i.test(value);
}

function resolveIdLikeMilestoneValue(
	value: string,
	key: string,
	titles: Milestone[],
	active: Milestone[],
	archived: Milestone[],
): string {
	const id = firstMilestoneId("", findReportingId(active, key, value), findReportingId(archived, key, value));
	if (id) return id;
	const title = uniqueMilestone(titles);
	if (title) return title.id;
	if (titles.length > 1) return value;
	return uniqueTitle(archived, key)?.id ?? value;
}

function resolveTitleLikeMilestoneValue(
	value: string,
	key: string,
	titles: Milestone[],
	active: Milestone[],
	archived: Milestone[],
): string {
	const title = uniqueMilestone(titles);
	if (title) return title.id;
	if (titles.length > 1) return value;
	return firstMilestoneId(
		value,
		findReportingId(active, key, value),
		uniqueTitle(archived, key),
		findReportingId(archived, key, value),
	);
}

function firstMilestoneId(fallback: string, ...milestones: Array<Milestone | undefined>): string {
	for (const milestone of milestones) {
		if (milestone) return milestone.id;
	}
	return fallback;
}

function textResult(text: string): CallToolResult {
	return { content: [{ type: "text", text }] };
}

function collectConfiguredMilestoneKeys(active: Milestone[], archived: Milestone[]) {
	const reservedIds = new Set<string>();
	for (const milestone of [...active, ...archived]) {
		for (const key of buildMilestoneMatchKeys(milestone.id, [])) reservedIds.add(key);
	}
	const titleCounts = new Map<string, number>();
	for (const milestone of active) {
		const key = milestoneKey(milestone.title);
		if (key) titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
	}
	const keys = new Set<string>();
	for (const milestone of active) {
		for (const key of buildMilestoneMatchKeys(milestone.id, [])) keys.add(key);
		const titleKey = milestoneKey(milestone.title);
		if (titleKey && !reservedIds.has(titleKey) && titleCounts.get(titleKey) === 1) keys.add(titleKey);
	}
	return keys;
}

function collectTaskMilestoneValues(tasks: Task[], active: Milestone[], archived: Milestone[]): Map<string, string> {
	const values = new Map<string, string>();
	for (const task of tasks) {
		const value = normalizeMilestoneName(task.milestone ?? "");
		if (!value) continue;
		const resolved = resolveMilestoneValueForReporting(value, active, archived);
		const key = milestoneKey(resolved);
		if (!values.has(key)) values.set(key, resolved);
	}
	return values;
}

function milestoneListText(active: Milestone[], archived: Milestone[], tasks: Task[]): string {
	const configuredKeys = collectConfiguredMilestoneKeys(active, archived);
	const archivedKeys = new Set(collectArchivedMilestoneKeys(archived, active));
	const values = collectTaskMilestoneValues(tasks, active, archived);
	const valuesFor = (predicate: (key: string) => boolean) =>
		Array.from(values.entries())
			.filter(([key]) => predicate(key))
			.map(([, value]) => value)
			.sort((left, right) => left.localeCompare(right));
	const milestones = active.map((milestone) =>
		milestone.dueDate
			? `${milestone.id}: ${milestone.title} (due ${formatUtcDateForDisplay(milestone.dueDate)})`
			: `${milestone.id}: ${milestone.title}`,
	);
	return [
		formatListBlock(`Milestones (${active.length}):`, milestones),
		formatListBlock(
			`Milestones found on tasks without files (${valuesFor((key) => !configuredKeys.has(key) && !archivedKeys.has(key)).length}):`,
			valuesFor((key) => !configuredKeys.has(key) && !archivedKeys.has(key)),
		),
		formatListBlock(
			`Archived milestone values still on tasks (${valuesFor((key) => !configuredKeys.has(key) && archivedKeys.has(key)).length}):`,
			valuesFor((key) => !configuredKeys.has(key) && archivedKeys.has(key)),
		),
		"Hint: use milestone_add to create milestone files, milestone_rename / milestone_remove to manage, milestone_archive to archive.",
	].join("\n\n");
}

function uniqueMilestone(milestones: Milestone[]): Milestone | undefined {
	return milestones.length === 1 ? milestones[0] : undefined;
}

function uniqueTitle(milestones: Milestone[], key: string): Milestone | undefined {
	return uniqueMilestone(milestones.filter((milestone) => milestoneKey(milestone.title) === key));
}

function findReportingId(milestones: Milestone[], inputKey: string, value: string): Milestone | undefined {
	const canonical =
		/^\d+$/.test(value) || /^m-\d+$/i.test(value) ? `m-${Number.parseInt(value.replace(/^m-/i, ""), 10)}` : null;
	const exact = milestones.find((milestone) => milestoneKey(milestone.id) === inputKey);
	if (exact) return exact;
	const canonicalMatch = canonical
		? milestones.find((milestone) => milestoneKey(milestone.id) === canonical)
		: undefined;
	if (canonicalMatch) return canonicalMatch;
	const aliases = new Set([inputKey, ...(canonical ? [canonical, canonical.replace(/^m-/, "")] : [])]);
	return milestones.find((milestone) => reportingIdMatches(milestone.id, aliases));
}

function reportingIdMatches(id: string, aliases: Set<string>): boolean {
	if (aliases.has(milestoneKey(id))) return true;
	const match = id.trim().match(/^m-(\d+)$/i);
	return Boolean(match?.[1] && aliases.has(`m-${Number.parseInt(match[1], 10)}`));
}

export class MilestoneHandlers {
	constructor(private readonly core: Core) {}

	private async listLocalTasks(): Promise<Task[]> {
		return await this.core.filesystem.listTasks();
	}

	private async listFileMilestones(): Promise<Milestone[]> {
		return await this.core.filesystem.listMilestones();
	}

	private async listArchivedMilestones(): Promise<Milestone[]> {
		return await this.core.filesystem.listArchivedMilestones();
	}

	async listMilestones(): Promise<CallToolResult> {
		const [active, archived, tasks] = await Promise.all([
			this.listFileMilestones(),
			this.listArchivedMilestones(),
			this.listLocalTasks(),
		]);
		return textResult(milestoneListText(active, archived, tasks));
	}

	async addMilestone(args: MilestoneAddArgs): Promise<CallToolResult> {
		const name = normalizeMilestoneName(args.name);
		if (!name) {
			throw new BacklogToolError("Milestone name cannot be empty.", "VALIDATION_ERROR");
		}
		let dueDate: string | undefined;
		try {
			dueDate = normalizeDueDate(args.dueDate, "Due date");
		} catch (error) {
			throw new BacklogToolError(error instanceof Error ? error.message : String(error), "VALIDATION_ERROR");
		}

		// Check for duplicates in existing milestone files
		const existing = await this.listFileMilestones();
		const requestedKeys = buildMilestoneMatchKeys(name, existing);
		const duplicate = existing.find((milestone) => {
			const milestoneKeys = buildMilestoneRecordMatchKeys(milestone);
			return keySetsIntersect(requestedKeys, milestoneKeys);
		});
		if (duplicate) {
			throw new BacklogToolError(
				`Milestone alias conflict: "${name}" matches existing milestone "${duplicate.title}" (${duplicate.id}).`,
				"VALIDATION_ERROR",
			);
		}

		// Read the config before writing: a config Backlog refuses to read must abort the command
		// before the milestone file exists, not after.
		await this.core.ensureConfigLoaded();

		// Create milestone file
		await this.core.filesystem.loadConfig();
		const milestone = await this.core.filesystem.createMilestone(name, args.description, dueDate);

		return textResult(
			`Created milestone "${milestone.title}" (${milestone.id}).${milestone.dueDate ? `\nDue: ${formatUtcDateForDisplay(milestone.dueDate)}` : ""}`,
		);
	}

	async renameMilestone(args: MilestoneRenameArgs): Promise<CallToolResult> {
		try {
			const result = await new MilestoneWorkflow(this.core).rename(args);
			if (!result.titleChanged && !result.dueDateChanged)
				return textResult(
					`Milestone "${result.source.title}" (${result.source.id}) is already named "${result.source.title}". No changes made.`,
				);
			const lines: string[] = [];
			if (result.titleChanged)
				lines.push(
					`Renamed milestone "${result.source.title}" (${result.source.id}) → "${result.milestone.title}" (${result.milestone.id}).`,
				);
			if (result.dueDateChanged)
				lines.push(
					result.milestone.dueDate
						? `Due: ${formatUtcDateForDisplay(result.milestone.dueDate)}`
						: "Cleared milestone due date.",
				);
			if (result.skippedTaskUpdate) lines.push("Skipped updating tasks (updateTasks=false).");
			else if (result.titleChanged)
				lines.push(
					`Updated ${result.updatedTaskIds.length} local task${result.updatedTaskIds.length === 1 ? "" : "s"}: ${formatTaskIdList(result.updatedTaskIds)}`,
				);
			if (result.sourcePath && result.targetPath && result.sourcePath !== result.targetPath)
				lines.push(`Renamed milestone file: ${result.sourcePath} -> ${result.targetPath}`);
			return textResult(lines.join("\n"));
		} catch (error) {
			if (error instanceof MilestoneWorkflowError) throw new BacklogToolError(error.message, error.code);
			throw error;
		}
	}

	async removeMilestone(args: MilestoneRemoveArgs): Promise<CallToolResult> {
		try {
			const result = await new MilestoneWorkflow(this.core).remove(args);
			const lines = [`Removed milestone "${result.milestone.title}" (${result.milestone.id}).`];
			if (result.taskHandling === "keep") lines.push("Kept task milestone values unchanged (taskHandling=keep).");
			else if (result.taskHandling === "reassign")
				lines.push(
					`Reassigned ${result.updatedTaskIds.length} local task${result.updatedTaskIds.length === 1 ? "" : "s"} to "${result.reassignedMilestone?.title}" (${result.reassignedMilestone?.id}): ${formatTaskIdList(result.updatedTaskIds)}`,
				);
			else
				lines.push(
					`Cleared milestone for ${result.updatedTaskIds.length} local task${result.updatedTaskIds.length === 1 ? "" : "s"}: ${formatTaskIdList(result.updatedTaskIds)}`,
				);
			return textResult(lines.join("\n"));
		} catch (error) {
			if (error instanceof MilestoneWorkflowError) throw new BacklogToolError(error.message, error.code);
			throw error;
		}
	}
	async archiveMilestone(args: MilestoneArchiveArgs): Promise<CallToolResult> {
		const name = normalizeMilestoneName(args.name);
		if (!name) {
			throw new BacklogToolError("Milestone name cannot be empty.", "VALIDATION_ERROR");
		}

		const result = await this.core.archiveMilestone(name);
		if (!result.success) {
			throw new BacklogToolError(`Milestone not found: "${name}"`, "NOT_FOUND");
		}

		const label = result.milestone?.title ?? name;
		const id = result.milestone?.id;

		return textResult(`Archived milestone "${label}"${id ? ` (${id})` : ""}.`);
	}
}
