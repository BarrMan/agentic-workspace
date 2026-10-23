import {
	BoxRenderable,
	bold,
	type CliRenderer,
	type EmbeddedTerminalRenderable,
	fg,
	TextRenderable,
	t,
} from "@opentui/core";
import type { AgentHost } from "../../runtime/live/agent-host.ts";
import type { OpenTuiWorkspaceAgentSession, OpenTuiWorkspaceLiveAgent } from "./workspace.ts";

export type WorkspacePreviewState = {
	readonly session?: OpenTuiWorkspaceAgentSession;
	readonly liveAgent?: OpenTuiWorkspaceLiveAgent;
	readonly modeLabel: string;
	readonly modeColor?: string;
	readonly resumeShortcut: string;
	readonly actionShortcut: string;
	readonly focused: boolean;
	readonly mayFocus: boolean;
	readonly fullscreen: boolean;
};

export type WorkspacePreview = {
	readonly root: BoxRenderable;
	readonly region: BoxRenderable;
	readonly terminal: EmbeddedTerminalRenderable | undefined;
	readonly outputSize: { readonly width: number; readonly height: number };
	update(state: WorkspacePreviewState): void;
	dispose(): void;
};

export function mountWorkspacePreview(
	renderer: CliRenderer,
	parent: BoxRenderable,
	onFocusChange: () => void,
): WorkspacePreview {
	const root = new BoxRenderable(renderer, {
		width: "100%",
		flexGrow: 1,
		flexBasis: 0,
		flexDirection: "column",
		minHeight: 0,
	});
	const header = new TextRenderable(renderer, { width: "100%", height: 1, wrapMode: "none" });
	const region = new BoxRenderable(renderer, {
		width: "100%",
		flexGrow: 1,
		flexBasis: 0,
		minHeight: 5,
		border: true,
		title: " Live preview ",
		borderColor: "gray",
		flexDirection: "column",
		overflow: "hidden",
	});
	const output = new BoxRenderable(renderer, {
		width: "100%",
		flexGrow: 1,
		flexBasis: 0,
		overflow: "hidden",
	});
	const placeholder = new BoxRenderable(renderer, {
		position: "absolute",
		top: 0,
		left: 0,
		width: "100%",
		height: "100%",
		justifyContent: "center",
		backgroundColor: "#111111",
		zIndex: 1,
	});
	const placeholderText = new TextRenderable(renderer, {
		width: "100%",
		height: "auto",
		wrapMode: "word",
		fg: "#e5e5e5",
		bg: "#111111",
	});
	placeholder.add(placeholderText);
	output.add(placeholder);
	region.add(output);
	root.add(header);
	root.add(region);
	parent.add(root);
	let terminal: EmbeddedTerminalRenderable | undefined;
	let host: AgentHost | undefined;
	let disposed = false;
	const onFocus = (): void => onFocusChange();
	const detach = (): void => {
		if (!terminal) return;
		terminal.off("focused", onFocus);
		terminal.blur();
		if (terminal.hasSelection()) renderer.clearSelection();
		output.remove(terminal);
		terminal = undefined;
	};
	return {
		root,
		region,
		get terminal() {
			return terminal;
		},
		get outputSize() {
			return { width: output.width, height: output.height };
		},
		update(state): void {
			if (disposed) return;
			const session = state.session;
			const liveAgent = state.liveAgent;
			const activeHost = liveAgent?.status !== "error" ? liveAgent?.host : undefined;
			const activeTerminal = activeHost ? liveAgent?.terminal : undefined;
			if (host !== activeHost || terminal !== activeTerminal) {
				detach();
				host = activeHost;
				terminal = activeTerminal;
				if (terminal) {
					output.add(terminal);
					terminal.on("focused", onFocus);
					terminal.invalidate();
				}
			}
			header.visible = !state.fullscreen && Boolean(session);
			const status = session?.status ?? "stopped";
			header.content = state.modeColor
				? t`Agent session · ${status} · ${fg(state.modeColor)(bold(state.modeLabel))} · ${session?.cwd ?? ""}`
				: `Agent session · ${status} · ${state.modeLabel} · ${session?.cwd ?? ""}`;
			placeholder.visible = !terminal && (!session || session.status === "stopped");
			placeholderText.content =
				session?.status === "stopped"
					? `Session ended · ${state.actionShortcut} resume · ${state.resumeShortcut} choose session`
					: session
						? ""
						: `No session in ${state.modeLabel} · ${state.actionShortcut} start · ${state.resumeShortcut} choose session`;
			region.borderColor = state.focused ? "yellow" : "gray";
			region.border = !state.fullscreen;
			region.title = state.focused ? " Live preview (active) " : " Live preview ";
			if (state.focused && state.mayFocus) terminal?.focus();
			else if (!state.focused) terminal?.blur();
		},
		dispose(): void {
			if (disposed) return;
			disposed = true;
			detach();
			root.destroyRecursively();
		},
	};
}
