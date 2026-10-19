import { debug, isEnabled } from "../lib/debug-log.ts";
import { taskIdsEqual } from "../model/task/task-id.ts";

export type PaneLookupRow = {
	paneId: string;
	dead: boolean;
	windowId?: string;
	taskId: string;
	sessionId?: string;
	role: string;
	rootPath: string;
	title: string;
};

/**
 * The one tmux interaction this module has. Pane-specific on purpose: the caller owns the argv
 * (`-a` included), so there is no `command` parameter to validate and nothing to re-parse. `filter`
 * and `format` are both required — a lookup without either would not be a lookup, and an optional
 * one would silently list every pane on the server.
 */
type ListPanes = (options: { filter: string; format: string }) => Promise<readonly string[]>;

type FindPaneOptions = {
	listPanes: ListPanes;
	rootPath: string;
	role: string;
	taskId?: string;
	sessionId?: string;
	includeDead?: boolean;
	includeWindow?: boolean;
};

const PANE_LOOKUP_FORMAT = [
	"#{pane_id}",
	"#{pane_dead}",
	"#{window_id}",
	"#{@agentic_workspace_root}",
	"#{@agentic_workspace_task}",
	"#{@agentic_workspace_session}",
	"#{@agentic_workspace_role}",
	"#{pane_title}",
].join("\t");

export function paneTitle(taskId: string, role: string): string {
	return `${taskId} ${role}`;
}

export async function findTmuxPanesByTaskAndRole(options: FindPaneOptions): Promise<PaneLookupRow[]> {
	const startedAt = Date.now();
	const listed = await options.listPanes({ filter: paneFilter(options), format: PANE_LOOKUP_FORMAT });
	// One `list-panes -a` per call, then a full parse of every pane on the server. Called several
	// times per switch, so the row count here is the multiplier behind tmux `capture` cost.
	if (isEnabled("tmux")) {
		debug("tmux", "listPanes", {
			role: options.role,
			taskId: options.taskId,
			rows: listed.length,
			ms: Date.now() - startedAt,
		});
	}
	return listed
		.flatMap((line) => line.split("\n"))
		.map(parsePaneLookupRow)
		.filter((pane): pane is PaneLookupRow => pane !== undefined)
		.filter(
			(pane) =>
				(options.includeDead || !pane.dead) &&
				pane.rootPath === options.rootPath &&
				pane.taskId &&
				pane.role === options.role &&
				(options.taskId === undefined || taskIdsEqual(pane.taskId, options.taskId)) &&
				(options.sessionId === undefined || pane.sessionId === options.sessionId) &&
				(options.includeWindow || pane.windowId !== undefined),
		);
}

function parsePaneLookupRow(line: string): PaneLookupRow | undefined {
	const [paneId, dead, windowId, root, taskId, sessionId, role, title] = line.split("\t");
	if (!paneId?.startsWith("%") || root === undefined || taskId === undefined || role === undefined) return undefined;
	return {
		paneId,
		dead: dead === "1",
		windowId: windowId || undefined,
		rootPath: root,
		taskId,
		sessionId,
		role,
		title: title ?? "",
	};
}

function paneFilter(options: FindPaneOptions): string {
	const conditions = [
		equals("#{@agentic_workspace_root}", options.rootPath),
		equals("#{@agentic_workspace_role}", options.role),
		...(options.sessionId ? [equals("#{@agentic_workspace_session}", options.sessionId)] : []),
		...(options.includeDead ? [] : [equals("#{pane_dead}", "0")]),
	];
	return and(conditions);
}

function equals(left: string, right: string): string {
	return `#{==:${left},${formatLiteral(right)}}`;
}

function and(conditions: readonly string[]): string {
	return conditions.reduce((combined, condition) => (combined ? `#{&&:${combined},${condition}}` : condition), "");
}

function formatLiteral(value: string): string {
	return value.replaceAll("#", "##").replaceAll(",", "#,").replaceAll("}", "#}");
}
