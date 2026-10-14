import { type KeyEvent, TextAttributes, TextRenderable } from "@opentui/core";
import { createOpenTuiHost } from "./host.ts";
import { createKeybindings, shortcutsConfig } from "./keybindings.ts";

const FOOTER_ROWS = 1;

/** Render long read-only text with AgenticWorkspace's shared viewer controls. */
export async function openScrollableViewer(content: string): Promise<void> {
	const host = await createOpenTuiHost();
	const { renderer, root } = host;
	const text = new TextRenderable(renderer, {
		width: "100%",
		flexGrow: 1,
		flexBasis: 0,
		content,
		wrapMode: "word",
		selectable: true,
	});
	const footer = new TextRenderable(renderer, {
		width: "100%",
		height: FOOTER_ROWS,
		content: " q/esc: close · ↑↓/j/k: scroll · pgup/pgdn/home/end: navigate",
		wrapMode: "none",
		attributes: TextAttributes.DIM,
	});
	root.add(text);
	root.add(footer);

	return new Promise<void>((resolve) => {
		const keybindings = createKeybindings();
		let closed = false;
		const close = (): void => {
			if (closed) return;
			closed = true;
			renderer.keyInput.off("keypress", onKeyPress);
			host.destroy();
			resolve();
		};
		const scroll = (delta: number): void => {
			text.scrollY = Math.max(0, Math.min(text.maxScrollY, text.scrollY + delta));
		};
		const previousLine = (): void => scroll(-1);
		const nextLine = (): void => scroll(1);
		const pageSize = (): number => Math.max(1, renderer.height - FOOTER_ROWS - 2);
		const previousPage = (): void => scroll(-pageSize());
		const nextPage = (): void => scroll(pageSize());
		const firstLine = (): void => {
			text.scrollY = 0;
		};
		const lastLine = (): void => {
			text.scrollY = text.maxScrollY;
		};
		const onKeyPress = (key: KeyEvent): void => {
			if (key.eventType === "release") return;
			keybindings.dispatch(key);
		};

		keybindings.on(shortcutsConfig.scrollableViewer.quit, close);
		keybindings.on(shortcutsConfig.scrollableViewer.previousLine, previousLine);
		keybindings.on(shortcutsConfig.scrollableViewer.nextLine, nextLine);
		keybindings.on(shortcutsConfig.scrollableViewer.pageUp, previousPage);
		keybindings.on(shortcutsConfig.scrollableViewer.pageDown, nextPage);
		keybindings.on(shortcutsConfig.scrollableViewer.first, firstLine);
		keybindings.on(shortcutsConfig.scrollableViewer.last, lastLine);

		renderer.keyInput.on("keypress", onKeyPress);
		renderer.once("destroy", close);
	});
}
