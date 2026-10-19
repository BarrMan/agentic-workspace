import type { BoxRenderable, CliRenderer } from "@opentui/core";
import { mountTaskForm, type TaskFormField } from "./controls.ts";

export type OpenTuiGroupDeleteModalOptions = {
	readonly groupId: string;
	readonly groupName: string;
	/** How many direct tasks will be reparented to the chosen destination. */
	readonly taskCount: number;
	/** How many direct child groups will be reparented to the chosen destination. */
	readonly childGroupCount: number;
	/** Destination groups the moved items may land in; empty means only Root is available. */
	readonly destinationOptions: readonly { readonly label: string; readonly value: string }[];
	/** Parent group to preselect, or null to default to Root. */
	readonly defaultDestinationId: string | null;
	readonly onConfirm: (destinationGroupId: string | null) => void | Promise<void>;
	readonly onCancel?: () => void;
};

export type OpenTuiGroupDeleteModalMount = { dispose(): void };

function moveSummary(taskCount: number, childGroupCount: number): string {
	const tasks = `${taskCount} task${taskCount === 1 ? "" : "s"}`;
	const groups = `${childGroupCount} group${childGroupCount === 1 ? "" : "s"}`;
	return `${tasks}, ${groups}`;
}

export function mountOpenTuiGroupDeleteModal(
	renderer: CliRenderer,
	parent: BoxRenderable,
	options: OpenTuiGroupDeleteModalOptions,
): OpenTuiGroupDeleteModalMount {
	const hasDestinations = options.destinationOptions.length > 0;
	const label = hasDestinations ? "Root (uncheck to move into a group)" : "Root";
	const fields = (
		hasDestinations
			? ([
					{
						kind: "toggle",
						name: "root",
						label,
						value: options.defaultDestinationId === null,
					},
					{
						kind: "select",
						name: "group",
						label: `Move into (${moveSummary(options.taskCount, options.childGroupCount)})`,
						options: options.destinationOptions,
						value: options.defaultDestinationId ?? "",
					},
				] as const)
			: ([{ kind: "toggle", name: "root", label, value: true }] as const)
	) satisfies readonly TaskFormField[];
	let settled = false;
	const form = mountTaskForm(renderer, parent, {
		title: "Delete group",
		submitLabel: "delete",
		cancelLabel: "cancel",
		fields,
		onSubmit: async (values) => {
			const destination = values.root ? null : values.group || null;
			await options.onConfirm(destination);
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
