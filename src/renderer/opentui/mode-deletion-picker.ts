import type { BoxRenderable, CliRenderer } from "@opentui/core";
import { mountTaskForm, type TaskFormMount, type TaskFormSelectField } from "./controls.ts";

export type ModeDeletionChoice = string | "__discard__" | null;

export type ModeDeletionPickerMount = {
	readonly result: Promise<ModeDeletionChoice>;
	dispose(): void;
};

export function mountModeDeletionPicker(
	renderer: CliRenderer,
	parent: BoxRenderable,
	options: { modeId: string; remainingModeIds: readonly string[] },
): ModeDeletionPickerMount {
	const fields = [
		{
			kind: "select",
			name: "destination",
			label: "Sessions in this mode",
			options: [
				{ label: "Choose an action", value: "" },
				{ label: "Discard sessions", value: "__discard__" },
				...options.remainingModeIds.map((id) => ({ label: `Move to ${id}`, value: id })),
			],
			value: "",
			required: true,
		},
	] as const satisfies readonly [TaskFormSelectField<"destination">];
	let form: TaskFormMount<typeof fields> | undefined;
	let settled = false;
	let resolveResult: (value: ModeDeletionChoice) => void = () => undefined;
	const result = new Promise<ModeDeletionChoice>((resolve) => {
		resolveResult = resolve;
	});
	const settle = (value: ModeDeletionChoice): void => {
		if (settled) return;
		settled = true;
		resolveResult(value);
	};
	form = mountTaskForm(renderer, parent, {
		title: `Delete mode ${options.modeId}`,
		zIndex: 60,
		fields,
		submitLabel: "continue",
		onSubmit: async ({ destination }) => settle(destination),
		onCancel: () => settle(null),
	});
	return {
		result,
		dispose(): void {
			settle(null);
			form?.dispose();
		},
	};
}

export async function deleteModeFromChoice(
	modeId: string,
	choose: () => Promise<ModeDeletionChoice>,
	deleteMode: (modeId: string, options: { confirmed: true; moveToModeId?: string }) => Promise<unknown>,
): Promise<boolean> {
	const destination = await choose();
	if (destination === null) return false;
	await deleteMode(modeId, {
		confirmed: true,
		...(destination !== "__discard__" && { moveToModeId: destination }),
	});
	return true;
}
