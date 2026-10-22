import { bold, fg, StyledText } from "@opentui/core";
import { taskDependencyGraph, taskReadiness } from "../../controller/task-detail.ts";
import { formatReadinessBlockers } from "../../model/task/readiness.ts";
import type { TaskDetail } from "../../model/task/task-projection.ts";
import type { Task } from "../../model/types.ts";
import { type DependencyGraphEntry, formatDependencyGraphEntries } from "../formatters/dependency-graph-text.ts";
import { formatStatusWithIcon, getStatusColor } from "../formatters/status-icon.ts";
import { TASK_FIELD_LABELS } from "../formatters/task-labels.ts";
import { formatUtcDateForDisplay } from "../formatters/utc-date-display.ts";

/**
 * Options for the rich detail renderer so the surface describes a task consistently.
 * The styled renderer receives them from the workspace controller (config projects, milestone
 * labels, and the configured date format) instead of reading config itself.
 */
export type TaskDetailStyledOptions = {
	resolveMilestoneLabel?: (milestone: string) => string;
	dateFormat?: string;
	configuredProjects?: string[];
};

type StyledHeadingLevel = 1 | 2 | 3;
type DetailChunk = StyledText["chunks"][number];

const literal = (text: string): DetailChunk => ({ __isChunk: true, text });
const heading = (text: string, level: StyledHeadingLevel): DetailChunk => {
	switch (level) {
		case 1:
			return bold(fg("brightWhite")(text));
		case 2:
			return fg("cyan")(text);
		default:
			return fg("white")(text);
	}
};

/** A status colour may be the terminal default, which OpenTUI expresses by leaving the colour unset. */
function statusChunk(text: string, color: string): DetailChunk {
	return color && color !== "default" ? fg(color)(text) : literal(text);
}

function priorityDot(priority?: string): DetailChunk | undefined {
	switch (priority?.toLowerCase()) {
		case "high":
			return fg("red")("●");
		case "medium":
			return fg("yellow")("●");
		case "low":
			return fg("green")("●");
		default:
			return undefined;
	}
}

function projectBadge(project: string): DetailChunk {
	return fg("blue")(`[${project}]`);
}

function taskTypeBadge(taskType: string): DetailChunk {
	return fg("magenta")(`[${taskType}]`);
}

function headerLine(task: Task | TaskDetail): DetailChunk[] {
	const status = formatStatusWithIcon(task.status);
	return [
		literal(" "),
		statusChunk(status, getStatusColor(task.status)),
		literal(" "),
		bold(fg("blue")(task.id)),
		literal(` - ${task.title}`),
	];
}

function readOnlyLine(branch: string): DetailChunk[] {
	return [
		literal(" "),
		fg("yellow")("⚠ Read-only:"),
		literal(" This task exists in branch "),
		fg("green")(branch),
		literal(". Switch to that branch to edit it."),
	];
}

function dateMetadataLine(label: string, value: string, dateFormat: string | undefined): DetailChunk[] {
	return [bold(`${label}:`), literal(` ${formatUtcDateForDisplay(value, { dateFormat })}`)];
}

function metadataLines(task: Task | TaskDetail, options: TaskDetailStyledOptions): DetailChunk[][] {
	const lines: DetailChunk[][] = [
		[bold("Created:"), literal(` ${formatUtcDateForDisplay(task.createdDate, { dateFormat: options.dateFormat })}`)],
	];
	if (task.updatedDate && task.updatedDate !== task.createdDate) {
		lines.push(dateMetadataLine("Updated", task.updatedDate, options.dateFormat));
	}
	if (task.priority) {
		const dot = priorityDot(task.priority);
		lines.push([bold("Priority:"), literal(` ${task.priority}`), ...(dot ? [literal(" "), dot] : [])]);
	}
	if (task.type) lines.push([bold("Type:"), literal(" "), taskTypeBadge(task.type)]);
	if (task.labels?.length) {
		const labelChunks: DetailChunk[] = [bold("Labels:"), literal(" ")];
		task.labels.forEach((label, index) => {
			if (index > 0) labelChunks.push(literal(" "));
			labelChunks.push(fg("yellow")(`[${label}]`));
		});
		lines.push(labelChunks);
	}
	if (task.reporter) {
		lines.push([
			bold(`${TASK_FIELD_LABELS.REPORTER}:`),
			literal(" "),
			fg("cyan")(task.reporter.startsWith("@") ? task.reporter : `@${task.reporter}`),
		]);
	}
	if (task.project && options.configuredProjects?.length) {
		lines.push([bold("Project:"), literal(" "), projectBadge(task.project)]);
	}
	if (task.milestone) {
		lines.push([
			bold("Milestone:"),
			literal(" "),
			fg("magenta")(options.resolveMilestoneLabel?.(task.milestone) ?? task.milestone),
		]);
	}
	if (task.parentTaskId) {
		lines.push([
			bold("Parent:"),
			literal(" "),
			fg("blue")(task.parentTaskTitle ? `${task.parentTaskId} - ${task.parentTaskTitle}` : task.parentTaskId),
		]);
	}
	if (task.subtasks?.length) {
		lines.push([bold("Subtasks:"), literal(` ${task.subtasks.length} task${task.subtasks.length > 1 ? "s" : ""}`)]);
	}
	const readiness = task.dependencies?.length ? taskReadiness(task) : undefined;
	if (readiness?.isReady) {
		lines.push([bold("Readiness:"), literal(" "), fg("green")("✓ Ready to start")]);
	}
	if (readiness?.isBlocked) {
		lines.push([bold("Readiness:"), literal(" "), fg("yellow")(`● ${formatReadinessBlockers(readiness)}`)]);
	}
	if (task.modifiedFiles?.length) {
		lines.push([bold("Modified files:"), literal(` ${task.modifiedFiles.join(", ")}`)]);
	}
	return lines;
}

/**
 * Style one dependency-graph line while keeping the tree glyphs the shared formatter drew.
 * Node labels colour by state: unresolved identities are called out, finished work recedes.
 */
function dependencyEntryLine(entry: DependencyGraphEntry): DetailChunk[] {
	if (!entry.node) return [literal(entry.text)];
	const node = entry.node;
	let cutoff = 0;
	for (const marker of ["├─ ", "└─ "]) {
		const index = entry.text.lastIndexOf(marker);
		if (index >= 0) cutoff = Math.max(cutoff, index + marker.length);
	}
	const head = entry.text.slice(0, cutoff);
	let label = entry.text.slice(cutoff);
	let suffix = "";
	for (const repeat of [" (cycle)", " (shown above)"]) {
		if (label.endsWith(repeat)) {
			suffix = repeat;
			label = label.slice(0, -repeat.length);
			break;
		}
	}
	const styledLabel =
		node.state !== "resolved" ? fg("yellow")(label) : node.completed ? fg("gray")(label) : literal(label);
	const chunks: DetailChunk[] = [literal(head), styledLabel];
	if (suffix) chunks.push(literal(suffix));
	return chunks;
}

function referenceSection(lines: DetailChunk[][], sectionHeading: string, values: string[] | undefined): void {
	if (!values?.length) return;
	lines.push([heading(sectionHeading, 2)]);
	for (const value of values) {
		const color = value.startsWith("http://") || value.startsWith("https://") ? "cyan" : "yellow";
		lines.push([literal("  "), fg(color)(value)]);
	}
	lines.push([]);
}

function renderLines(lines: DetailChunk[][]): DetailChunk[] {
	const chunks: DetailChunk[] = [];
	lines.forEach((line, index) => {
		if (index > 0) chunks.push(literal("\n"));
		chunks.push(...line);
	});
	return chunks;
}

/**
 * Render a task's full detail as OpenTUI styled text. This is the StyledText replacement for the
 * previous `generateDetailContent`; it emits the same sections in the same order, including id + title,
 * so a caller must not prepend its own header.
 */
export function generateTaskDetailSections(
	task: Task | TaskDetail,
	options: TaskDetailStyledOptions = {},
): { beforeDescription: StyledText; description: string; afterDescription: StyledText } {
	const lines: DetailChunk[][] = [headerLine(task)];
	if (task.branch) lines.push(readOnlyLine(task.branch));
	lines.push([heading("Details", 2)], ...metadataLines(task, options), []);
	const graph = taskDependencyGraph(task);
	const graphLines = graph ? formatDependencyGraphEntries(graph).map(dependencyEntryLine) : [];
	if (graphLines.length > 0) lines.push([heading("Dependency Graph", 2)], ...graphLines, []);
	lines.push([heading(TASK_FIELD_LABELS.DESCRIPTION, 2)]);
	const beforeDescription = new StyledText(renderLines(lines));
	const description = task.description?.trim() || "No description provided";
	const afterLines: DetailChunk[][] = [];
	referenceSection(afterLines, TASK_FIELD_LABELS.REFERENCES, task.references);
	referenceSection(afterLines, "Documentation", task.documentation);
	return { beforeDescription, description, afterDescription: new StyledText(renderLines(afterLines)) };
}
