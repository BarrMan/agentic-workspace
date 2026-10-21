import { BoxRenderable, type CliRenderer, type KeyEvent, TextAttributes, TextRenderable } from "@opentui/core";
import { createKeybindings, formatShortcut, shortcutsConfig } from "./keybindings.ts";

export type OpenTuiConfirmOptions = {
	readonly title?: string;
	readonly message: string;
	/** Raise the overlay above another modal surface (for example Settings). */
	readonly zIndex?: number;
};

export type OpenTuiConfirmMount = {
	readonly result: Promise<boolean>;
	dispose(): void;
};

/** Mount a yes/no overlay. Accept resolves true; decline, escape, or dispose resolves false. */
export function mountOpenTuiConfirm(
	renderer: CliRenderer,
	parent: BoxRenderable,
	options: OpenTuiConfirmOptions,
): OpenTuiConfirmMount {
	let disposed = false;
	let settled = false;
	let resolveResult: (value: boolean) => void = () => undefined;
	const result = new Promise<boolean>((resolve) => {
		resolveResult = resolve;
	});
	const baseZIndex = options.zIndex ?? 10;
	const backdrop = new BoxRenderable(renderer, {
		position: "absolute",
		top: 0,
		left: 0,
		width: "100%",
		height: "100%",
		backgroundColor: "black",
		opacity: 0.55,
		zIndex: baseZIndex,
	});
	const surface = new BoxRenderable(renderer, {
		position: "absolute",
		top: "40%",
		left: "25%",
		width: "50%",
		zIndex: baseZIndex + 1,
		backgroundColor: "#161616",
		border: true,
		borderColor: "cyan",
		focusedBorderColor: "cyan",
		title: options.title ?? "Confirm",
		padding: 1,
		flexDirection: "column",
		rowGap: 1,
		focusable: true,
	});
	const message = new TextRenderable(renderer, {
		width: "100%",
		wrapMode: "word",
		content: options.message,
	});
	const help = new TextRenderable(renderer, {
		width: "100%",
		height: 1,
		wrapMode: "none",
		attributes: TextAttributes.DIM,
		content: `${formatShortcut(shortcutsConfig.confirmOverlay.accept)}: Yes · ${formatShortcut(shortcutsConfig.confirmOverlay.decline)}: No`,
	});
	parent.add(backdrop);
	parent.add(surface);
	surface.add(message);
	surface.add(help);
	surface.focus();

	const destroy = (): void => {
		if (disposed) return;
		disposed = true;
		renderer.keyInput.off("keypress", onKeyPress);
		keybindings.clear();
		backdrop.destroy();
		surface.destroyRecursively();
	};
	const settle = (value: boolean): void => {
		if (settled) return;
		settled = true;
		destroy();
		resolveResult(value);
	};
	const keybindings = createKeybindings();
	const handleAccept = (key: KeyEvent): void => {
		key.stopPropagation();
		settle(true);
	};
	const handleDecline = (key: KeyEvent): void => {
		key.stopPropagation();
		settle(false);
	};
	const onKeyPress = (key: KeyEvent): void => {
		if (disposed || key.eventType === "release") return;
		keybindings.dispatch(key);
	};
	keybindings.on(shortcutsConfig.confirmOverlay.accept, handleAccept);
	keybindings.on(shortcutsConfig.confirmOverlay.decline, handleDecline);
	renderer.keyInput.prependListener("keypress", onKeyPress);

	return {
		result,
		dispose(): void {
			settle(false);
		},
	};
}
