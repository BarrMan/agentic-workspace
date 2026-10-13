import {
	BoxRenderable,
	type CliRenderer,
	InputRenderable,
	type KeyEvent,
	type PasteEvent,
	ScrollBoxRenderable,
	TextRenderable,
} from "@opentui/core";

export type ModeModelOption = {
	readonly id: string;
	readonly label?: string;
	readonly support?: string;
};

export type ModeModelDiscovery = (scope: {
	readonly harness: string;
	readonly preset: string;
}) => Promise<readonly ModeModelOption[]>;

export type OpenTuiModeModelPickerOptions = {
	readonly harness: string;
	readonly preset: string;
	/** undefined is Default. An explicit ID is retained if it is missing from discovery. */
	readonly selectedModel?: string;
	readonly discover: ModeModelDiscovery;
	readonly onSelect: (modelId: string | undefined) => Promise<void>;
	readonly onClose: () => void;
	readonly title?: string;
	readonly allowManualModel?: boolean;
};

/** Model-settings leaf; the caller supplies preset/environment-scoped model discovery. */
export function mountOpenTuiModeModelPicker(
	renderer: CliRenderer,
	parent: BoxRenderable,
	options: OpenTuiModeModelPickerOptions,
): { dispose(): void; refresh(): Promise<void> } {
	let models: ModeModelOption[] = [];
	const selectedId = options.selectedModel;
	let selectedIndex = 0;
	let loading = true;
	let loadError: string | undefined;
	let busy = false;
	let disposed = false;
	let version = 0;
	let error: string | undefined;
	const previousFocus = renderer.currentFocusedRenderable;
	const surface = new BoxRenderable(renderer, {
		id: "settings-model-picker",
		position: "absolute",
		top: "12%",
		left: "10%",
		width: "80%",
		height: "76%",
		zIndex: 50,
		backgroundColor: "#18181b",
		border: true,
		borderStyle: "rounded",
		borderColor: "#22d3ee",
		focusedBorderColor: "#22d3ee",
		title: options.title ?? "Choose model",
		focusable: true,
		flexDirection: "column",
		padding: 1,
	});
	const search = new InputRenderable(renderer, {
		id: "settings-model-search",
		width: "100%",
		placeholder: "Search model IDs…",
		backgroundColor: "#18181b",
		focusedBackgroundColor: "#18181b",
		textColor: "#d4d4d8",
		focusedTextColor: "#22d3ee",
	});
	const viewport = new ScrollBoxRenderable(renderer, { width: "100%", flexGrow: 1, flexBasis: 0, scrollX: false });
	const list = new TextRenderable(renderer, { width: "100%", fg: "#d4d4d8", wrapMode: "none" });
	viewport.add(list);
	const footer = new TextRenderable(renderer, { width: "100%", height: 2, fg: "#a1a1aa", wrapMode: "word" });
	surface.add(search);
	surface.add(viewport);
	surface.add(footer);
	parent.add(surface);
	const matches = (): ModeModelOption[] => {
		const query = search.value.trim().toLocaleLowerCase();
		return models.filter((model) => `${model.id} ${model.label ?? ""}`.toLocaleLowerCase().includes(query));
	};
	const render = (): void => {
		if (disposed) return;
		const filtered = matches();
		const explicitMissing = selectedId !== undefined && !models.some((model) => model.id === selectedId);
		const rows = [`${selectedIndex === 0 ? ">" : " "} Default${selectedId === undefined ? "  ● selected" : ""}`];
		if (explicitMissing)
			rows.push(
				`${selectedIndex === 1 ? ">" : " "} ${selectedId}  ⚠ unavailable for ${options.harness}; retained (new launch may fail)`,
			);
		for (const [index, model] of filtered.entries()) {
			const rowIndex = index + 1 + (explicitMissing ? 1 : 0);
			rows.push(
				`${rowIndex === selectedIndex ? ">" : " "} ${model.id}${model.label ? ` · ${model.label}` : ""}${selectedId === model.id ? "  ● selected" : ""}${model.support ? `  [${model.support}]` : ""}`,
			);
		}
		list.content = rows.join("\n");
		viewport.scrollTo(Math.max(0, selectedIndex - Math.max(1, viewport.viewport.height) + 1));
		footer.content = error
			? `Error: ${error}`
			: loading
				? "Discovering models… Default remains selectable."
				: loadError
					? `Discovery failed: ${loadError} · Default remains selectable${options.allowManualModel ? " · type a model ID and press Ctrl+Enter for manual entry" : ""}`
					: filtered.length === 0 && models.length === 0
						? `No discovered models. Default remains selectable.${options.allowManualModel ? " Type ID · Ctrl+Enter manual" : ""}`
						: busy
							? "Applying model…"
							: "Type to filter · ↑/↓ select · Enter choose · Esc cancel";
		renderer.requestRender();
	};
	const dispose = (): void => {
		if (disposed) return;
		disposed = true;
		version++;
		renderer.keyInput.off("keypress", onKey);
		renderer.keyInput.off("paste", onPaste);
		surface.destroyRecursively();
		if (previousFocus && !previousFocus.isDestroyed) previousFocus.focus();
		options.onClose();
	};
	const refresh = async (): Promise<void> => {
		const request = ++version;
		loading = true;
		loadError = undefined;
		render();
		try {
			const found = await options.discover({ harness: options.harness, preset: options.preset });
			if (disposed || request !== version) return;
			models = [...new Map(found.filter((model) => model.id.trim()).map((model) => [model.id, model])).values()].sort(
				(left, right) => left.id.localeCompare(right.id),
			);
			selectedIndex = 0;
		} catch (cause) {
			if (disposed || request !== version) return;
			loadError = cause instanceof Error ? cause.message : String(cause);
			models = [];
		} finally {
			if (!disposed && request === version) {
				loading = false;
				render();
			}
		}
	};
	const choose = async (id: string | undefined): Promise<void> => {
		if (busy || disposed) return;
		busy = true;
		error = undefined;
		render();
		try {
			await options.onSelect(id);
			if (!disposed) dispose();
		} catch (cause) {
			if (!disposed) error = cause instanceof Error ? cause.message : String(cause);
		} finally {
			busy = false;
			render();
		}
	};
	const onKey = (event: KeyEvent): void => {
		if (disposed || event.eventType === "release") return;
		event.preventDefault();
		event.stopPropagation();
		if (busy) return;
		if (event.name === "escape") {
			dispose();
			return;
		}
		if (event.name === "return") {
			if (event.ctrl && options.allowManualModel && search.value.trim()) void choose(search.value.trim());
			else if (!event.ctrl && !event.shift && !event.meta && !event.option && !event.super && !event.hyper) {
				if (selectedIndex === 0) void choose(undefined);
				else {
					const missing = selectedId !== undefined && !models.some((model) => model.id === selectedId);
					if (missing && selectedIndex === 1) {
						void choose(selectedId);
						return;
					}
					const index = selectedIndex - 1 - (missing ? 1 : 0);
					const model = matches()[index];
					if (model) void choose(model.id);
				}
			}
			return;
		}
		if (event.name === "up") selectedIndex = Math.max(0, selectedIndex - 1);
		else if (event.name === "down") {
			const missing = selectedId !== undefined && !models.some((model) => model.id === selectedId);
			selectedIndex = Math.min(matches().length + (missing ? 1 : 0), selectedIndex + 1);
		} else {
			search.handleKeyPress(event);
			selectedIndex = 0;
		}
		error = undefined;
		render();
	};
	const onPaste = (event: PasteEvent): void => {
		if (disposed || busy) return;
		event.preventDefault();
		event.stopPropagation();
		search.handlePaste(event);
		selectedIndex = 0;
		render();
	};
	renderer.keyInput.on("keypress", onKey);
	renderer.keyInput.on("paste", onPaste);
	surface.focus();
	search.focus();
	render();
	void refresh();
	return { dispose, refresh };
}
