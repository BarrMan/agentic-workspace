import type { BoxRenderable, CliRenderer } from "@opentui/core";
import { mountTaskForm, type TaskFormField } from "./controls.ts";

export type OpenTuiGroupModalOptions = {
	/** True when the new group should default to root (no parent). */
	readonly defaultRoot: boolean;
	/** Group id the new group nests into when the Root toggle is off; null = none available. */
	readonly parentGroupId: string | null;
	/** Name of the parent group, shown in the Root toggle label when nesting is possible. */
	readonly parentGroupName?: string;
	readonly onCreate: (input: { name: string; parentGroupId: string | null }) => void | Promise<void>;
	readonly onCancel?: () => void;
};

export type OpenTuiGroupModalMount = { dispose(): void };

export function mountOpenTuiGroupModal(
	renderer: CliRenderer,
	parent: BoxRenderable,
	options: OpenTuiGroupModalOptions,
): OpenTuiGroupModalMount {
	const label =
		options.parentGroupId === null ? "Root" : `Root (uncheck to nest inside "${options.parentGroupName ?? "group"}")`;
	const fields = [
		{ kind: "toggle", name: "root", label, value: options.defaultRoot },
		{ kind: "input", name: "name", label: "Name", required: true, placeholder: "Group name" },
	] as const satisfies readonly TaskFormField[];
	let settled = false;
	const form = mountTaskForm(renderer, parent, {
		title: "Create Group",
		submitLabel: "create",
		cancelLabel: "cancel",
		fields,
		onSubmit: async (values) => {
			const root = values.root;
			await options.onCreate({
				name: values.name.trim(),
				parentGroupId: root ? null : options.parentGroupId,
			});
		},
		onCancel: () => {
			options.onCancel?.();
		},
	});
	return {
		dispose(): void {
			if (settled) return;
			settled = true;
			form.dispose();
		},
	};
}
