import type { TaskDetail } from "../../controller/task-detail.ts";
import { formatUtcDateForDisplay, type UtcDateDisplayOptions } from "../../lib/utc-date-display.ts";
import { formatAssignee } from "../../model/task/assignee-filter.ts";
import { formatPriorityLabel } from "../../model/task/priority-config.ts";
import { TaskOrdering } from "../../model/task/task-ordering.ts";
import { formatDependencyGraphLines } from "./dependency-graph-text.ts";
import type { TaskArtifactProjection } from "./json-output.ts";
import { formatStatusWithIcon } from "./status-icon.ts";

export type TaskPlainTextOptions = {
	filePathOverride?: string;
	artifacts?: TaskArtifactProjection;
};

const plainDateDisplayOptions: UtcDateDisplayOptions = { appendUtcLabel: true };

export function formatDateForDisplay(dateStr: string, options: UtcDateDisplayOptions = {}): string {
	return formatUtcDateForDisplay(dateStr, options);
}

function formatPriority(priority?: string): string | null {
	if (!priority) return null;
	return formatPriorityLabel(priority);
}

function formatAssignees(assignee?: string[]): string | null {
	const names = assignee?.map(formatAssignee).filter((name) => name !== null) ?? [];
	return names.length ? names.join(", ") : null;
}

function formatSubtaskLines(subtasks: Array<{ id: string; title: string }>): string[] {
	if (subtasks.length === 0) return [];
	const sorted = TaskOrdering.byId(subtasks);
	return sorted.map((subtask) => `- ${subtask.id} - ${subtask.title}`);
}

/** The graph block task detail renders, with its heading, or no lines at all for an isolated task. */
function formatDependencyGraphBlock(task: TaskDetail): string[] {
	const graphLines = formatDependencyGraphLines(task.dependencyGraph);
	if (graphLines.length === 0) return [];
	return ["", "Dependency Graph:", "-".repeat(50), ...graphLines];
}

function taskMetadataLines(task: TaskDetail): Array<string | null> {
	const priorityLabel = formatPriority(task.priority);
	const assigneeText = formatAssignees(task.assignee);
	return [
		priorityLabel && `Priority: ${priorityLabel}`,
		task.type ? `Type: ${task.type}` : null,
		task.project ? `Project: ${task.project}` : null,
		task.ordinal !== undefined ? `Ordinal: ${task.ordinal}` : null,
		assigneeText && `Assignee: ${assigneeText}`,
		task.reporter ? `Reporter: ${task.reporter.startsWith("@") ? task.reporter : `@${task.reporter}`}` : null,
		`Created: ${formatDateForDisplay(task.createdDate, plainDateDisplayOptions)}`,
		task.updatedDate ? `Updated: ${formatDateForDisplay(task.updatedDate, plainDateDisplayOptions)}` : null,
		task.dueDate ? `Due: ${formatDateForDisplay(task.dueDate)}` : null,
		task.labels?.length ? `Labels: ${task.labels.join(", ")}` : null,
		task.milestone ? `Milestone: ${task.milestone}` : null,
	];
}

function taskRelationshipLines(task: TaskDetail): string[] {
	const lines: string[] = [];
	if (task.parentTaskId)
		lines.push(
			`Parent: ${task.parentTaskTitle ? `${task.parentTaskId} - ${task.parentTaskTitle}` : task.parentTaskId}`,
		);
	const summaries = task.subtaskSummaries ?? [];
	const subtaskCount = summaries.length > 0 ? summaries.length : (task.subtasks?.length ?? 0);
	if (subtaskCount > 0) {
		const subtaskLines = formatSubtaskLines(summaries);
		if (subtaskLines.length > 0) lines.push(`Subtasks (${subtaskCount}):`, ...subtaskLines);
		else lines.push(`Subtasks: ${subtaskCount}`);
	}
	if (task.references?.length) lines.push(`References: ${task.references.join(", ")}`);
	if (task.documentation?.length) lines.push(`Documentation: ${task.documentation.join(", ")}`);
	return lines;
}

function pushTaskMetadata(lines: string[], task: TaskDetail): void {
	lines.push(
		...taskMetadataLines(task).filter((line): line is string => line !== null),
		...taskRelationshipLines(task),
	);
}

function pushSection(lines: string[], title: string, content: string, trailingBlank = true): void {
	lines.push(title, "-".repeat(50), content);
	if (trailingBlank) lines.push("");
}

export function formatTaskPlainText(task: TaskDetail, options: TaskPlainTextOptions = {}): string {
	const lines: string[] = [];
	const filePath = options.filePathOverride ?? task.filePath;

	if (filePath) {
		lines.push(`File: ${filePath}`);
		lines.push("");
	}

	lines.push(`Task ${task.id} - ${task.title}`);
	lines.push("=".repeat(50));
	lines.push("");
	lines.push(`Status: ${formatStatusWithIcon(task.status)}`);

	pushTaskMetadata(lines, task);

	// Every plain task output is a detail read, so this replaces the raw dependency ID list entirely.
	lines.push(...formatDependencyGraphBlock(task));

	lines.push("");
	const description = task.description?.trim();
	pushSection(lines, "Description:", description && description.length > 0 ? description : "No description provided");
	if (options.artifacts) {
		lines.push(`Artifact directory: ${options.artifacts.directory}`);
		if (options.artifacts.artifacts.length === 0) {
			lines.push("Artifacts: None");
		} else {
			lines.push("Artifacts:");
			for (const artifact of options.artifacts.artifacts) {
				lines.push(`- ${artifact.state}\t${artifact.type}\t${artifact.size}\t${artifact.path}`);
			}
		}
		lines.push("");
	}

	// Records what the work touched, so it belongs with the plan and the notes rather than with the
	// metadata you read before starting.
	if (task.modifiedFiles?.length) {
		lines.push(`Modified files: ${task.modifiedFiles.join(", ")}`);
		lines.push("");
	}

	return lines.join("\n");
}
