import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createMilestoneIdentityResolver, milestoneKey } from "./core/milestone-identity.ts";
import { getMilestoneLabel } from "./core/milestones.ts";
import type { Milestone, Task } from "./types/index.ts";
import { formatAssignee } from "./utils/assignee-filter.ts";
import { statusComparisonKey } from "./utils/status.ts";
import { compareTaskIds } from "./utils/task-sorting.ts";

function normalizeConfiguredStatuses(statuses: string[]): { ordered: string[]; canonicalByKey: Map<string, string> } {
	const canonicalByKey = new Map<string, string>();
	const ordered: string[] = [];
	const seen = new Set<string>();

	for (const status of statuses ?? []) {
		if (typeof status !== "string") continue;
		const trimmed = status.trim();
		if (!trimmed) continue;
		const key = statusComparisonKey(trimmed);
		if (!canonicalByKey.has(key)) canonicalByKey.set(key, trimmed);
		if (seen.has(key)) continue;
		ordered.push(trimmed);
		seen.add(key);
	}

	return { ordered, canonicalByKey };
}

export function buildKanbanStatusGroups(
	tasks: Task[],
	statuses: string[],
): { orderedStatuses: string[]; groupedTasks: Map<string, Task[]> } {
	const { ordered: orderedConfiguredStatuses, canonicalByKey } = normalizeConfiguredStatuses(statuses);

	const groupedTasks = new Map<string, Task[]>();
	for (const status of orderedConfiguredStatuses) {
		groupedTasks.set(status, []);
	}

	for (const task of tasks) {
		const raw = (task.status ?? "").trim();
		if (!raw) continue;
		const key = statusComparisonKey(raw);
		const canonical = canonicalByKey.get(key) ?? raw;
		if (!canonicalByKey.has(key)) canonicalByKey.set(key, canonical);
		if (!groupedTasks.has(canonical)) {
			groupedTasks.set(canonical, []);
		}
		groupedTasks.get(canonical)?.push(task);
	}

	const orderedStatuses = [...orderedConfiguredStatuses];
	const seen = new Set(orderedStatuses.map(statusComparisonKey));

	for (const status of groupedTasks.keys()) {
		const key = statusComparisonKey(status);
		if (seen.has(key)) continue;
		orderedStatuses.push(status);
		seen.add(key);
	}

	return { orderedStatuses, groupedTasks };
}

export function generateKanbanBoardWithMetadata(tasks: Task[], statuses: string[], projectName: string): string {
	// Generate timestamp
	const now = new Date();
	const timestamp = now.toISOString().replace("T", " ").substring(0, 19);

	const { orderedStatuses, groupedTasks } = buildKanbanStatusGroups(tasks, statuses);

	// Create header
	const header = `# Kanban Board Export (powered by AgenticWorkspace)
Generated on: ${timestamp}
Project: ${projectName}

`;

	// Return early if there are no configured statuses and no tasks
	if (orderedStatuses.length === 0) {
		return `${header}No tasks found.`;
	}

	// Create table header
	const headerRow = `| ${orderedStatuses.map((status) => status || "No Status").join(" | ")} |`;
	const separatorRow = `| ${orderedStatuses.map(() => "---").join(" | ")} |`;

	// Map for quick lookup by id
	const byId = new Map<string, Task>(tasks.map((t) => [t.id, t]));

	// Group tasks by status and handle parent-child relationships
	const columns: Task[][] = orderedStatuses.map((status) => {
		const items = groupedTasks.get(status) || [];
		const top: Task[] = [];
		const children = new Map<string, Task[]>();

		// Sort items: All columns by updatedDate descending (fallback to createdDate), then by ID as secondary
		const sortedItems = items.sort((a, b) => {
			// Primary sort: updatedDate (newest first), fallback to createdDate if updatedDate is missing
			const dateA = a.updatedDate ? new Date(a.updatedDate).getTime() : new Date(a.createdDate).getTime();
			const dateB = b.updatedDate ? new Date(b.updatedDate).getTime() : new Date(b.createdDate).getTime();
			if (dateB !== dateA) {
				return dateB - dateA; // Newest first
			}
			// Secondary sort: ID descending when dates are equal, using the shared numeric comparator
			return compareTaskIds(b.id, a.id); // Highest ID first (newest)
		});

		// Separate top-level tasks from subtasks
		for (const t of sortedItems) {
			const parent = t.parentTaskId ? byId.get(t.parentTaskId) : undefined;
			if (parent && parent.status === t.status) {
				// Subtask with same status as parent - group under parent
				const list = children.get(parent.id) || [];
				list.push(t);
				children.set(parent.id, list);
			} else {
				// Top-level task or subtask with different status
				top.push(t);
			}
		}

		// Build final list depth-first so subtasks of subtasks stay under their parent
		const result: Task[] = [];
		const pushWithChildren = (t: Task) => {
			result.push(t);
			const subs = children.get(t.id) || [];
			subs.sort((a, b) => compareTaskIds(a.id, b.id));
			for (const sub of subs) {
				pushWithChildren(sub);
			}
		};
		for (const t of top) {
			pushWithChildren(t);
		}

		return result;
	});

	const maxTasks = Math.max(...columns.map((c) => c.length), 0);
	const rows = [headerRow, separatorRow];

	for (let taskIdx = 0; taskIdx < maxTasks; taskIdx++) {
		const row = orderedStatuses.map((_, cIdx) => {
			const task = columns[cIdx]?.[taskIdx];
			if (!task?.id || !task.title) return "";

			// Check if this is a subtask
			const isSubtask = task.parentTaskId;
			const taskIdPrefix = isSubtask ? "└─ " : "";
			const taskIdUpper = task.id.toUpperCase();

			const assignees = task.assignee?.map(formatAssignee).filter((assignee) => assignee !== null) ?? [];
			const assigneesText = assignees.length ? ` [${assignees.join(", ")}]` : "";

			// Format labels with # prefix and italic or empty string if none
			const labelsText =
				task.labels && task.labels.length > 0 ? `<br>*${task.labels.map((label) => `#${label}`).join(" ")}*` : "";

			return `${taskIdPrefix}**${taskIdUpper}** - ${task.title}${assigneesText}${labelsText}`;
		});
		rows.push(`| ${row.join(" | ")} |`);
	}

	const table = `${rows.join("\n")}`;
	if (maxTasks === 0) {
		return `${header}${table}\n\nNo tasks found.\n`;
	}

	return `${header}${table}\n`;
}

export function generateMilestoneGroupedBoard(
	tasks: Task[],
	statuses: string[],
	milestoneEntities: Milestone[],
	projectName: string,
): string {
	const now = new Date();
	const timestamp = now.toISOString().replace("T", " ").substring(0, 19);

	// Collect canonical milestone identifiers from milestone files and tasks.
	// Task values can be either IDs or titles, so normalize aliases to one key.
	const milestoneSeen = new Set<string>();
	const allMilestones: string[] = [];
	const identity = createMilestoneIdentityResolver(milestoneEntities);

	for (const milestone of milestoneEntities) {
		const normalizedId = milestone.id.trim();
		const idKey = milestoneKey(normalizedId);
		if (normalizedId && !milestoneSeen.has(idKey)) {
			milestoneSeen.add(idKey);
			allMilestones.push(normalizedId);
		}
	}

	for (const task of tasks) {
		const canonicalMilestone = identity.canonicalize(task.milestone);
		if (canonicalMilestone && !milestoneSeen.has(milestoneKey(canonicalMilestone))) {
			milestoneSeen.add(milestoneKey(canonicalMilestone));
			allMilestones.push(canonicalMilestone);
		}
	}

	const header = `# Kanban Board by Milestone (powered by AgenticWorkspace)
Generated on: ${timestamp}
Project: ${projectName}

`;

	const sections: string[] = [];

	// No milestone section
	const noMilestoneTasks = tasks.filter((t) => !t.milestone?.trim());
	if (noMilestoneTasks.length > 0) {
		sections.push(generateMilestoneSection("No Milestone", noMilestoneTasks, statuses));
	}

	// Each milestone section
	for (const milestone of allMilestones) {
		const milestoneTasks = tasks.filter(
			(task) => milestoneKey(identity.canonicalize(task.milestone)) === milestoneKey(milestone),
		);
		if (milestoneTasks.length > 0) {
			const milestoneLabel = getMilestoneLabel(milestone, milestoneEntities);
			sections.push(generateMilestoneSection(milestoneLabel, milestoneTasks, statuses));
		}
	}

	if (sections.length === 0) {
		return `${header}No tasks found.\n`;
	}

	return `${header}${sections.join("\n\n")}\n`;
}

function generateMilestoneSection(milestone: string, tasks: Task[], statuses: string[]): string {
	const { orderedStatuses, groupedTasks } = buildKanbanStatusGroups(tasks, statuses);

	const sectionHeader = `## ${milestone} (${tasks.length} tasks)\n`;

	if (orderedStatuses.length === 0) {
		return `${sectionHeader}\nNo tasks.\n`;
	}

	const statusLines = orderedStatuses.map((status) => {
		const statusTasks = groupedTasks.get(status) || [];
		const taskLines = statusTasks.map((t) => {
			const id = t.id.toUpperCase();
			const assigneeNames = t.assignee?.map(formatAssignee).filter((assignee) => assignee !== null) ?? [];
			const assignees = assigneeNames.length ? ` [${assigneeNames.join(", ")}]` : "";
			return `  - **${id}** - ${t.title}${assignees}`;
		});
		return `### ${status} (${statusTasks.length})\n${taskLines.length > 0 ? taskLines.join("\n") : "  (empty)"}`;
	});

	return `${sectionHeader}\n${statusLines.join("\n\n")}`;
}

export async function exportKanbanBoardToFile(
	tasks: Task[],
	statuses: string[],
	filePath: string,
	projectName: string,
	_overwrite = false,
): Promise<void> {
	const board = generateKanbanBoardWithMetadata(tasks, statuses, projectName);

	// Ensure directory exists
	try {
		await mkdir(dirname(filePath), { recursive: true });
	} catch {
		// Directory might already exist
	}

	// Write the content (overwrite mode)
	await Bun.write(filePath, board);
}
