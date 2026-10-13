import { parseDelimitedStringList, toStringArray } from "../../../utils/task-builders.ts";

function validateClearableListInput(input: {
	rawValues: string[];
	cleared?: boolean;
	isBlank: (value: string) => boolean;
	setterFlags: string;
	clearFlag?: string;
	subject: string;
	emptyClears?: boolean;
}): string | undefined {
	const settingValues = input.emptyClears ? input.rawValues.filter((value) => !input.isBlank(value)) : input.rawValues;
	if (input.clearFlag && input.cleared && settingValues.length > 0) {
		return `Cannot combine ${input.clearFlag} with ${input.setterFlags}. Use ${input.clearFlag} by itself.`;
	}
	if (!input.emptyClears && input.rawValues.some(input.isBlank)) {
		const guidance = input.clearFlag
			? `Use ${input.clearFlag} to remove all ${input.subject}.`
			: `Omit the flag to leave ${input.subject} unset.`;
		return `Cannot use an empty value with ${input.setterFlags}. ${guidance}`;
	}
	return undefined;
}

/** Validates dependency, reference, and documentation list flags for create and edit. */
export function validateTaskListFlags(
	options: Record<string, unknown>,
	{ supportsClearFlags }: { supportsClearFlags: boolean },
): string | undefined {
	const isBlankListValue = (value: string) => parseDelimitedStringList(value) === undefined;
	const clearFlag = (flag: string) => (supportsClearFlags ? flag : undefined);
	return (
		validateClearableListInput({
			rawValues: [...toStringArray(options.dependsOn), ...toStringArray(options.dep)],
			cleared: Boolean(options.clearDeps),
			isBlank: isBlankListValue,
			setterFlags: "--depends-on or --dep",
			clearFlag: clearFlag("--clear-deps"),
			subject: "task dependencies",
			emptyClears: supportsClearFlags,
		}) ??
		validateClearableListInput({
			rawValues: toStringArray(options.ref),
			cleared: Boolean(options.clearRefs),
			isBlank: isBlankListValue,
			setterFlags: "--ref",
			clearFlag: clearFlag("--clear-refs"),
			subject: "references",
			emptyClears: supportsClearFlags,
		}) ??
		validateClearableListInput({
			rawValues: toStringArray(options.addRef),
			cleared: Boolean(options.clearRefs),
			isBlank: isBlankListValue,
			setterFlags: "--add-ref",
			clearFlag: clearFlag("--clear-refs"),
			subject: "references",
		}) ??
		validateClearableListInput({
			rawValues: toStringArray(options.removeRef),
			cleared: Boolean(options.clearRefs),
			isBlank: isBlankListValue,
			setterFlags: "--remove-ref",
			clearFlag: clearFlag("--clear-refs"),
			subject: "references",
		}) ??
		validateClearableListInput({
			rawValues: toStringArray(options.doc),
			cleared: Boolean(options.clearDocs),
			isBlank: isBlankListValue,
			setterFlags: "--doc",
			clearFlag: clearFlag("--clear-docs"),
			subject: "documentation",
			emptyClears: supportsClearFlags,
		})
	);
}
