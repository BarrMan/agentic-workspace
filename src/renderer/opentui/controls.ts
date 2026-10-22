import {
	BoxRenderable,
	type CliRenderer,
	InputRenderable,
	type KeyEvent,
	type PasteEvent,
	ScrollBoxRenderable,
	TextAttributes,
	TextareaRenderable,
	TextRenderable,
} from "@opentui/core";
import { createKeybindings, formatShortcut, keybindingPropagation, shortcutsConfig } from "./keybindings.ts";
export type OpenTuiControlMount = {
	dispose(): void;
};

export type TaskFormInputField<Name extends string = string> = {
	readonly kind: "input";
	readonly name: Name;
	readonly label: string;
	readonly value?: string;
	readonly placeholder?: string;
	required?: boolean;
};

export type TaskFormTextareaField<Name extends string = string> = {
	readonly kind: "textarea";
	readonly name: Name;
	readonly label: string;
	readonly value?: string;
	readonly placeholder?: string;
	readonly height?: number;
	required?: boolean;
};

export type TaskFormSelectOption = {
	readonly label: string;
	readonly value: string;
	readonly description?: string;
};

export type TaskFormSelectField<Name extends string = string> = {
	readonly kind: "select";
	readonly name: Name;
	readonly label: string;
	readonly options: readonly TaskFormSelectOption[];
	readonly value?: string;
	required?: boolean;
};

export type TaskFormToggleField<Name extends string = string> = {
	readonly kind: "toggle";
	readonly name: Name;
	readonly label: string;
	readonly value?: boolean;
	readonly description?: string;
};

export type TaskFormField<Name extends string = string> =
	| TaskFormInputField<Name>
	| TaskFormTextareaField<Name>
	| TaskFormSelectField<Name>
	| TaskFormToggleField<Name>;

type FieldName<Fields extends readonly TaskFormField[]> = Fields[number]["name"];

/**
 * Names backed by at least one non-toggle field. A name only maps to `boolean` when every field
 * carrying it is a toggle, so wide field unions (names shared by input/select variants) stay
 * `string` while a concrete toggle field yields `boolean`.
 */
type NonToggleFieldNames<Fields extends readonly TaskFormField[]> = Exclude<Fields[number], { kind: "toggle" }>["name"];

export type TaskFormValues<Fields extends readonly TaskFormField[]> = {
	[Name in FieldName<Fields>]: Name extends NonToggleFieldNames<Fields> ? string : boolean;
};

export type TaskFormOptions<Fields extends readonly TaskFormField[]> = {
	readonly title: string;
	readonly zIndex?: number;
	readonly fields: Fields;
	readonly submitLabel?: string;
	readonly cancelLabel?: string;
	readonly onSubmit: (values: TaskFormValues<Fields>) => void | Promise<void>;
	readonly onCancel?: () => void;
};

export type TaskFormMount<Fields extends readonly TaskFormField[]> = OpenTuiControlMount & {
	values(): TaskFormValues<Fields>;
	focus(name: FieldName<Fields>): void;
};

/** Focusable checkbox-like control: a focusable box that renders `[x] label` in a child text node. */
class TaskFormToggleControl extends BoxRenderable {
	readonly #text: TextRenderable;
	readonly #label: string;
	#value: boolean;
	#focused = false;

	constructor(renderer: CliRenderer, label: string, value: boolean) {
		super(renderer, {
			width: "100%",
			height: 1,
			focusable: true,
			backgroundColor: "#161616",
			flexDirection: "row",
		});
		this.#label = label;
		this.#value = value;
		this.#text = new TextRenderable(renderer, {
			width: "100%",
			height: 1,
			wrapMode: "none",
			fg: "#f3f4f6",
			content: "",
		});
		this.add(this.#text);
		this.#sync();
	}

	get value(): boolean {
		return this.#value;
	}

	#sync(): void {
		if (this.isDestroyed || this.#text.isDestroyed) return;
		this.#text.content = `[${this.#value ? "x" : " "}] ${this.#label}`;
		this.#text.fg = this.#focused ? "#7dd3fc" : "#f3f4f6";
		this.backgroundColor = this.#focused ? "#303030" : "#161616";
	}

	override focus(): void {
		super.focus();
		this.#focused = true;
		this.#sync();
	}

	override blur(): void {
		super.blur();
		this.#focused = false;
		this.#sync();
	}

	override handleKeyPress(key: KeyEvent): boolean {
		if (key.name !== "space" && key.name !== "enter" && key.name !== "return") return false;
		this.#value = !this.#value;
		this.#sync();
		this.requestRender();
		return true;
	}
}

/** Focusable one-row cycler: renders `◀ label ▶` and advances options with arrow keys. */
class TaskFormCycleControl extends BoxRenderable {
	readonly #options: readonly TaskFormSelectOption[];
	readonly #text: TextRenderable;
	#index = 0;
	#focused = false;

	constructor(renderer: CliRenderer, options: readonly TaskFormSelectOption[], value?: string) {
		super(renderer, {
			width: "100%",
			height: 1,
			focusable: true,
			backgroundColor: "#161616",
			flexDirection: "row",
		});
		this.#options = options;
		const found = options.findIndex((option) => option.value === value);
		this.#index = found >= 0 ? found : 0;
		this.#text = new TextRenderable(renderer, {
			width: "100%",
			height: 1,
			wrapMode: "none",
			fg: "#f3f4f6",
			content: "",
		});
		this.add(this.#text);
		this.#sync();
	}

	get value(): string {
		return this.#options[this.#index]?.value ?? "";
	}

	#sync(): void {
		if (this.isDestroyed || this.#text.isDestroyed) return;
		const label = this.#options[this.#index]?.label ?? "";
		this.#text.content = `◀ ${label} ▶`;
		this.#text.fg = this.#focused ? "#7dd3fc" : "#f3f4f6";
		this.backgroundColor = this.#focused ? "#303030" : "#161616";
	}

	override focus(): void {
		super.focus();
		this.#focused = true;
		this.#sync();
	}

	override blur(): void {
		super.blur();
		this.#focused = false;
		this.#sync();
	}

	override handleKeyPress(key: KeyEvent): boolean {
		if (this.#options.length === 0) return false;
		const direction =
			key.name === "left" || key.name === "up" ? -1 : key.name === "right" || key.name === "down" ? 1 : 0;
		if (direction === 0) return false;
		const count = this.#options.length;
		this.#index = (this.#index + direction + count) % count;
		this.#sync();
		this.requestRender();
		return true;
	}
}

type FormControl = InputRenderable | TextareaRenderable | TaskFormCycleControl | TaskFormToggleControl;

type ModalSurface = {
	readonly backdrop: BoxRenderable;
	readonly surface: BoxRenderable;
};

function addModalSurface(renderer: CliRenderer, parent: BoxRenderable, title: string, zIndex = 10): ModalSurface {
	const backdrop = new BoxRenderable(renderer, {
		position: "absolute",
		top: 0,
		left: 0,
		width: "100%",
		height: "100%",
		backgroundColor: "black",
		opacity: 0.55,
		zIndex,
	});
	const surface = new BoxRenderable(renderer, {
		position: "absolute",
		top: "15%",
		left: "14%",
		width: "72%",
		height: "70%",
		zIndex: zIndex + 1,
		backgroundColor: "#161616",
		shouldFill: true,
		focusable: true,
		border: true,
		borderColor: "cyan",
		focusedBorderColor: "cyan",
		title,
		flexDirection: "column",
		padding: 1,
		rowGap: 1,
	});
	parent.add(backdrop);
	parent.add(surface);
	return { backdrop, surface };
}

/** Mount reusable task form. Tab changes fields, Enter advances inputs, Ctrl+S confirms, Escape cancels. */
export function mountTaskForm<Fields extends readonly TaskFormField[]>(
	renderer: CliRenderer,
	parent: BoxRenderable,
	options: TaskFormOptions<Fields>,
): TaskFormMount<Fields> {
	let disposed = false;
	let submitting = false;
	let activeIndex = 0;
	const previousFocus = renderer.currentFocusedRenderable;
	const { backdrop, surface } = addModalSurface(renderer, parent, options.title, options.zIndex);
	const controls: FormControl[] = [];
	const groups: BoxRenderable[] = [];
	const fieldsViewport = new ScrollBoxRenderable(renderer, {
		width: "100%",
		flexGrow: 1,
		flexBasis: 0,
		scrollX: false,
		contentOptions: { flexDirection: "column", rowGap: 1 },
	});
	surface.add(fieldsViewport);
	const controlByName = new Map<string, FormControl>();
	const fields = options.fields;
	const keybindings = createKeybindings();

	for (const field of fields) {
		const group = new BoxRenderable(renderer, { width: "100%", flexDirection: "column", flexShrink: 0 });
		// A toggle renders its own `[x] label` line, so it must not also get a separate field label.
		if (field.kind !== "toggle") {
			const label = new TextRenderable(renderer, {
				width: "100%",
				height: 1,
				wrapMode: "none",
				content: field.required ? `${field.label} *` : field.label,
				fg: "#f3f4f6",
			});
			group.add(label);
		}
		let control: FormControl;
		if (field.kind === "select") {
			control = new TaskFormCycleControl(renderer, field.options, field.value);
		} else if (field.kind === "textarea") {
			control = new TextareaRenderable(renderer, {
				width: "100%",
				height: field.height ?? 4,
				initialValue: field.value ?? "",
				placeholder: field.placeholder,
				wrapMode: "word",
				backgroundColor: "#161616",
				textColor: "#f3f4f6",
				focusedTextColor: "#f3f4f6",
				focusedBackgroundColor: "#303030",
			});
		} else if (field.kind === "toggle") {
			control = new TaskFormToggleControl(renderer, field.label, field.value ?? false);
		} else {
			control = new InputRenderable(renderer, {
				width: "100%",
				value: field.value ?? "",
				placeholder: field.placeholder,
				backgroundColor: "#161616",
				textColor: "#f3f4f6",
				focusedTextColor: "#f3f4f6",
				focusedBackgroundColor: "#303030",
			});
		}
		group.add(control);
		fieldsViewport.add(group);
		groups.push(group);
		controls.push(control);
		controlByName.set(field.name, control);
	}

	const helpText = `${formatShortcut(shortcutsConfig.taskForm.nextField)}: next field · ${formatShortcut(shortcutsConfig.taskForm.submit)}: ${options.submitLabel ?? "save"} · ${formatShortcut(shortcutsConfig.taskForm.cancel)}: ${options.cancelLabel ?? "cancel"}`;
	const footer = new TextRenderable(renderer, {
		width: "100%",
		height: "auto",
		flexShrink: 0,
		wrapMode: "word",
		attributes: TextAttributes.DIM,
		fg: "#cbd5e1",
		content: helpText,
	});
	surface.add(footer);

	const setFocus = (index: number): void => {
		if (!controls.length) return;
		controls[activeIndex]?.blur();
		activeIndex = (index + controls.length) % controls.length;
		controls[activeIndex]?.focus();
		const group = groups[activeIndex];
		if (group) fieldsViewport.scrollChildIntoView(group.id);
		renderer.requestRender();
	};
	const values = (): TaskFormValues<Fields> => {
		const entries = fields.map((field, index) => {
			const control = controls[index];
			if (field.kind === "toggle") {
				const value = control instanceof TaskFormToggleControl ? control.value : Boolean(field.value);
				return [field.name, value] as const;
			}
			const value =
				control instanceof TaskFormCycleControl
					? control.value
					: control instanceof InputRenderable || control instanceof TextareaRenderable
						? control.plainText
						: "";
			return [field.name, value] as const;
		});
		return Object.fromEntries(entries) as TaskFormValues<Fields>;
	};
	const dispose = (): void => {
		if (disposed) return;
		disposed = true;
		renderer.keyInput.off("keypress", onKeyPress);
		renderer.keyInput.off("paste", onPaste);
		keybindings.clear();
		backdrop.destroy();
		surface.destroyRecursively();
		if (previousFocus && !previousFocus.isDestroyed) previousFocus.focus();
	};
	const submit = async (): Promise<void> => {
		if (submitting || disposed) return;
		const currentValues = values();
		const requiredIndex = fields.findIndex((field) => {
			if (field.kind === "toggle" || !field.required) return false;
			const value = currentValues[field.name as FieldName<Fields>];
			return typeof value === "string" && !value.trim();
		});
		if (requiredIndex >= 0) {
			setFocus(requiredIndex);
			return;
		}
		submitting = true;
		footer.content = helpText;
		try {
			await options.onSubmit(currentValues);
			dispose();
		} catch (error) {
			if (!disposed) {
				const message = error instanceof Error && error.message ? error.message : "Could not save form.";
				footer.content = `Error: ${message}`;
				setFocus(activeIndex);
			}
		} finally {
			submitting = false;
		}
	};
	const handleCancel = (key: KeyEvent): void => {
		key.stopPropagation();
		dispose();
		options.onCancel?.();
	};
	const handleNextField = (key: KeyEvent): void => {
		key.stopPropagation();
		setFocus(activeIndex + 1);
	};
	const handlePreviousField = (key: KeyEvent): void => {
		key.stopPropagation();
		setFocus(activeIndex - 1);
	};
	const handleSubmit = (key: KeyEvent): void => {
		key.stopPropagation();
		void submit();
	};
	const handleAdvance = (key: KeyEvent) => {
		if (!(controls[activeIndex] instanceof InputRenderable)) return keybindingPropagation.ignore;
		key.stopPropagation();
		if (activeIndex === controls.length - 1) void submit();
		else setFocus(activeIndex + 1);
	};
	const onKeyPress = (key: KeyEvent): void => {
		if (disposed || key.eventType === "release") return;
		if (!keybindings.dispatch(key)) controls[activeIndex]?.handleKeyPress(key);
		key.preventDefault();
		key.stopPropagation();
	};
	const onPaste = (event: PasteEvent): void => {
		if (disposed) return;
		controls[activeIndex]?.handlePaste?.(event);
		event.preventDefault();
		event.stopPropagation();
	};
	keybindings.on(shortcutsConfig.taskForm.cancel, handleCancel);
	keybindings.on(shortcutsConfig.taskForm.previousField, handlePreviousField);
	keybindings.on(shortcutsConfig.taskForm.nextField, handleNextField);
	keybindings.on(shortcutsConfig.taskForm.submit, handleSubmit);
	keybindings.on(shortcutsConfig.taskForm.advance, handleAdvance);
	if (options.zIndex === undefined) renderer.keyInput.on("keypress", onKeyPress);
	else renderer.keyInput.prependListener("keypress", onKeyPress);
	renderer.keyInput.on("paste", onPaste);
	if (controls.length) setFocus(0);
	else surface.focus();

	return {
		dispose,
		values,
		focus(name: FieldName<Fields>): void {
			const control = controlByName.get(name);
			if (!control) return;
			setFocus(controls.indexOf(control));
		},
	};
}
