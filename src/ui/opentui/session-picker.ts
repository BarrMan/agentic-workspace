import { BoxRenderable, type CliRenderer, type KeyEvent, type PasteEvent, TextRenderable } from "@opentui/core";
import type { AgentSession } from "../../agent-workspace/types.ts";

export type OpenTuiSessionPickerOptions = {
	readonly taskId: string;
	readonly sessions: readonly AgentSession[];
	readonly activeSessionId?: string;
	readonly localSessionIds?: ReadonlySet<string>;
	readonly onFocusLocal: (sessionId: string) => void;
	readonly onResume: (sessionId: string) => Promise<void>;
	readonly onDelete: (sessionId: string) => Promise<void>;
	readonly onClose: () => void;
};

/** Newest conversations first; browsing history itself never opens infrastructure. */
export function mountOpenTuiSessionPicker(
	renderer: CliRenderer,
	parent: BoxRenderable,
	options: OpenTuiSessionPickerOptions,
): { dispose(): void } {
	const sessions = [...options.sessions].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
	let selected = Math.max(
		0,
		sessions.findIndex((session) => session.id === options.activeSessionId),
	);
	let disposed = false;
	let busy = false;
	let confirming: string | undefined;
	let error: string | undefined;
	const previousFocus = renderer.currentFocusedRenderable;
	const surface = new BoxRenderable(renderer, {
		position: "absolute",
		top: "12%",
		left: "8%",
		width: "84%",
		height: "76%",
		zIndex: 30,
		backgroundColor: "#161616",
		border: true,
		borderColor: "cyan",
		title: `${options.taskId} sessions`,
		focusable: true,
		flexDirection: "column",
		padding: 1,
	});
	const list = new TextRenderable(renderer, { width: "100%", flexGrow: 1, fg: "#f3f4f6" });
	const footer = new TextRenderable(renderer, { width: "100%", height: 2, fg: "#cbd5e1" });
	surface.add(list);
	surface.add(footer);
	parent.add(surface);
	const render = (): void => {
		const capacity = Math.max(1, Math.floor((renderer.height * 0.76 - 6) / 2));
		const offset = Math.max(0, selected - capacity + 1);
		list.content = sessions.length
			? sessions
					.slice(offset, offset + capacity)
					.map(
						(session, index) =>
							`${offset + index === selected ? ">" : " "} ${options.localSessionIds?.has(session.id) ? "[open] " : session.id === options.activeSessionId ? "[active] " : ""}${session.createdAt} ${session.preset} ${session.status}\n  ${session.id}`,
					)
					.join("\n")
			: "No sessions for this task. Press Escape to return.";
		footer.content =
			error ??
			(confirming !== undefined
				? `Delete session ${confirming}? y confirm · n cancel`
				: busy
					? "Opening exact conversation…"
					: "↑/↓ select · Enter focus open · r resume stopped · d delete · Esc cancel");
	};
	const dispose = (): void => {
		if (disposed) return;
		disposed = true;
		renderer.keyInput.off("keypress", onKey);
		renderer.keyInput.off("paste", onPaste);
		surface.destroyRecursively();
		if (previousFocus && !previousFocus.isDestroyed) previousFocus.focus();
		options.onClose();
	};
	const select = async (resume: boolean): Promise<void> => {
		const session = sessions[selected];
		if (!session || busy) return;
		if (!resume) {
			if (options.localSessionIds?.has(session.id)) {
				dispose();
				options.onFocusLocal(session.id);
			}
			return;
		}
		if (session.status !== "stopped" && session.status !== "parked") return;
		busy = true;
		error = undefined;
		render();
		try {
			await options.onResume(session.id);
			dispose();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		} finally {
			busy = false;
			if (!disposed) render();
		}
	};
	const confirmDelete = async (): Promise<void> => {
		const id = confirming;
		const index = id === undefined ? -1 : sessions.findIndex((session) => session.id === id);
		if (id === undefined || index < 0 || busy) return;
		busy = true;
		error = undefined;
		render();
		try {
			await options.onDelete(id);
			sessions.splice(index, 1);
			selected = Math.max(0, Math.min(selected, sessions.length - 1));
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		} finally {
			confirming = undefined;
			busy = false;
			if (!disposed) render();
		}
	};
	const onKey = (event: KeyEvent): void => {
		if (disposed || event.eventType === "release") return;
		event.preventDefault();
		event.stopPropagation();
		if (busy) return;
		if (confirming !== undefined) {
			if (event.name === "y") void confirmDelete();
			else if (event.name === "n" || event.name === "escape") {
				confirming = undefined;
				render();
			}
			return;
		}
		if (event.name === "escape") dispose();
		else if (event.name === "return") void select(false);
		else if (event.name === "r") void select(true);
		else if (event.name === "d" || event.name === "delete") {
			const session = sessions[selected];
			if (session) {
				confirming = session.id;
				error = undefined;
				render();
			}
		} else if (event.name === "up" || event.name === "k") {
			selected = Math.max(0, selected - 1);
			render();
		} else if ((event.name === "down" || event.name === "j") && sessions.length > 0) {
			selected = Math.min(sessions.length - 1, selected + 1);
			render();
		}
	};
	const onPaste = (event: PasteEvent): void => {
		event.preventDefault();
		event.stopPropagation();
	};
	renderer.keyInput.on("keypress", onKey);
	renderer.keyInput.on("paste", onPaste);
	surface.focus();
	render();
	return { dispose };
}
