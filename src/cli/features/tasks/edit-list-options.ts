import { normalizeStringList, toStringArray } from "../../../lib/string-list.ts";

function validateClearableListInput(input: {
	rawValues: string[];
	isBlank: (value: string) => boolean;
	setterFlags: string;
	subject: string;
}): string | undefined {
	if (input.rawValues.some(input.isBlank)) {
		return `Cannot use an empty value with ${input.setterFlags}. Omit the flag to leave ${input.subject} unset.`;
	}
	return undefined;
}

/** Validates dependency, reference, and documentation list flags for create. */
export function validateTaskListFlags(options: Record<string, unknown>): string | undefined {
	const isBlankListValue = (value: string) => normalizeStringList([value]) === undefined;
	return (
		validateClearableListInput({
			rawValues: [...toStringArray(options.dependsOn), ...toStringArray(options.dep)],
			isBlank: isBlankListValue,
			setterFlags: "--depends-on or --dep",
			subject: "task dependencies",
		}) ??
		validateClearableListInput({
			rawValues: toStringArray(options.ref),
			isBlank: isBlankListValue,
			setterFlags: "--ref",
			subject: "references",
		}) ??
		validateClearableListInput({
			rawValues: toStringArray(options.doc),
			isBlank: isBlankListValue,
			setterFlags: "--doc",
			subject: "documentation",
		})
	);
}
