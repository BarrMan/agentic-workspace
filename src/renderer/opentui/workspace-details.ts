import {
	BoxRenderable,
	bold,
	type CliRenderer,
	CodeRenderable,
	fg,
	MarkdownRenderable,
	SyntaxStyle,
	TextRenderable,
	t,
} from "@opentui/core";
import type { TaskDetail } from "../../model/task/task-projection.ts";
import { TaskArtifactView, type TaskArtifactViewApi } from "./task-artifact-view.ts";
import type { TaskDetailStyledOptions } from "./task-detail-content.ts";
import { generateTaskDetailSections } from "./task-detail-content.ts";
import type { OpenTuiWorkspaceTaskEntry } from "./workspace.ts";

const TASK_DESCRIPTION_STYLE = SyntaxStyle.fromStyles({
	default: { fg: "#e5e5e5" },
	"markup.heading": { fg: "cyan", bold: true },
	"markup.strong": { fg: "brightWhite", bold: true },
	"markup.italic": { fg: "cyan", italic: true },
	"markup.raw": { fg: "yellow" },
	"markup.raw.block": { fg: "#e5e5e5" },
	"markup.link.label": { fg: "cyan", underline: true },
	"markup.link.url": { fg: "blue", underline: true },
	"markup.list": { fg: "blue" },
});

function taskDetails(task: OpenTuiWorkspaceTaskEntry | undefined): string {
	if (!task) return "No task selected.";
	return [
		`Status: ${task.status}`,
		task.priority ? `Priority: ${task.priority}` : undefined,
		task.labels?.length ? `Labels: ${task.labels.join(", ")}` : undefined,
		"",
	]
		.filter((field): field is string => field !== undefined)
		.join("\n");
}

export type WorkspaceDetailsState = {
	readonly task?: OpenTuiWorkspaceTaskEntry;
	readonly detail?: TaskDetail;
	readonly options?: TaskDetailStyledOptions;
	readonly visible: boolean;
	readonly collapseShortcut: string;
};

export type WorkspaceDetails = {
	update(state: WorkspaceDetailsState): void;
	updateArtifactApi(api: TaskArtifactViewApi | undefined): void;
	openArtifacts(): void;
	closeArtifacts(): void;
	navigateArtifacts(delta: -1 | 1): void;
	readonly artifactsOpen: boolean;
	dispose(): void;
};

export function mountWorkspaceDetails(
	renderer: CliRenderer,
	parent: BoxRenderable,
	initialApi: TaskArtifactViewApi | undefined,
	onError: (message: string) => void,
	onRender: () => void,
): WorkspaceDetails {
	const root = new BoxRenderable(renderer, {
		backgroundColor: "#111111",
		width: "100%",
		height: "30%",
		flexShrink: 0,
		flexDirection: "column",
		border: true,
		title: " Details ",
		borderColor: "gray",
		bottomTitleAlignment: "right",
		overflow: "hidden",
	});
	const before = new TextRenderable(renderer, {
		width: "100%",
		height: "auto",
		wrapMode: "word",
		overflow: "hidden",
		fg: "#e5e5e5",
		bg: "#111111",
	});
	const markdown = new MarkdownRenderable(renderer, {
		width: "100%",
		height: "100%",
		overflow: "hidden",
		content: "",
		syntaxStyle: TASK_DESCRIPTION_STYLE,
		streaming: true,
		renderNode: (token, context) => {
			if (token.type !== "code") return undefined;
			const renderable = context.defaultRender();
			if (renderable instanceof CodeRenderable) {
				renderable.drawUnstyledText = true;
				renderable.streaming = false;
			}
			return renderable;
		},
		fg: "#e5e5e5",
		bg: "#111111",
	});
	const viewport = new BoxRenderable(renderer, {
		width: "100%",
		flexGrow: 1,
		flexBasis: 0,
		minHeight: 0,
		overflow: "hidden",
	});
	const after = new TextRenderable(renderer, {
		width: "100%",
		height: "auto",
		wrapMode: "word",
		overflow: "hidden",
		fg: "#e5e5e5",
		bg: "#111111",
	});
	root.add(before);
	root.add(viewport);
	root.add(after);
	viewport.add(markdown);
	parent.add(root);
	let api = initialApi;
	let artifactView: TaskArtifactView | undefined;
	let artifactTaskId: string | undefined;
	let task: OpenTuiWorkspaceTaskEntry | undefined;
	let currentDetail: TaskDetail | undefined;
	let currentOptions: TaskDetailStyledOptions | undefined;
	let artifactsOpen = false;
	let disposed = false;
	const showTask = (
		value: OpenTuiWorkspaceTaskEntry | undefined,
		detail?: TaskDetail,
		options?: TaskDetailStyledOptions,
	): void => {
		task = value;
		currentDetail = detail;
		currentOptions = options;
		if (!value) {
			before.content = "No task selected.";
			markdown.content = "";
			after.content = "";
		} else if (detail) {
			const sections = generateTaskDetailSections(detail, options ?? {});
			before.content = sections.beforeDescription;
			markdown.content = sections.description;
			after.content = sections.afterDescription;
		} else {
			before.content = t`${bold(fg("blue")(value.id))} - ${value.title}\n${taskDetails(value)}\nDescription:`;
			markdown.content = value.description?.trim() || "No description.";
			after.content = "";
		}
		if (artifactView) {
			artifactView.root.visible = artifactsOpen && Boolean(task && api);
			if (task && task.id !== artifactTaskId) {
				artifactTaskId = task.id;
				void artifactView.setTask(task.id);
			}
		}
		before.visible = !artifactsOpen;
		markdown.visible = !artifactsOpen;
		after.visible = !artifactsOpen;
	};
	const ensureArtifactView = (notify = true): void => {
		if (!task || !api) return;
		if (!artifactView) {
			artifactView = new TaskArtifactView({
				renderer,
				parent: root,
				taskId: task.id,
				api,
				onError,
			});
			artifactView.root.visible = false;
			artifactView.setOpen(false);
		} else if (artifactTaskId !== task.id) {
			void artifactView.setTask(task.id);
		}
		artifactTaskId = task.id;
		artifactsOpen = true;
		artifactView.setOpen(true);
		artifactView.root.visible = true;
		before.visible = false;
		markdown.visible = false;
		after.visible = false;
		if (notify) onRender();
	};
	return {
		update(state): void {
			if (disposed) return;
			root.visible = state.visible;
			root.height = state.visible ? "30%" : 0;
			root.bottomTitle = state.visible ? ` Press ${state.collapseShortcut} to collapse ` : undefined;
			showTask(state.task, state.detail, state.options);
			if (artifactsOpen && api && !artifactView) ensureArtifactView(false);
		},
		openArtifacts: ensureArtifactView,
		closeArtifacts(): void {
			if (!artifactsOpen) return;
			artifactsOpen = false;
			artifactView?.setOpen(false);
			showTask(task, currentDetail, currentOptions);
			onRender();
		},
		navigateArtifacts(delta): void {
			if (artifactsOpen) void artifactView?.navigate(delta);
		},
		get artifactsOpen() {
			return artifactsOpen;
		},
		dispose(): void {
			if (disposed) return;
			disposed = true;
			artifactView?.dispose();
			root.destroyRecursively();
		},
		updateArtifactApi(nextApi): void {
			if (disposed || nextApi === api) return;
			artifactView?.dispose();
			artifactView?.root.destroyRecursively();
			artifactView = undefined;
			artifactTaskId = undefined;
			api = nextApi;
			if (!api) {
				artifactsOpen = false;
				showTask(task, currentDetail, currentOptions);
			}
		},
	};
}
