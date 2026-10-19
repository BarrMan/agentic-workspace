const EDIT_FIELD_OPTIONS = [
	"title",
	"description",
	"desc",
	"assignee",
	"status",
	"label",
	"priority",
	"type",
	"project",
	"ordinal",
	"milestone",
	"dueDate",
	"addLabel",
	"removeLabel",
	"dependsOn",
	"dep",
	"ref",
	"addRef",
	"removeRef",
	"doc",
	"modifiedFile",
] as const;
const EDIT_TRUE_OPTIONS = [
	"clearMilestone",
	"clearDueDate",
	"clearLabels",
	"plain",
	"clearDeps",
	"clearRefs",
	"clearDocs",
] as const;

export function createMultiValueAccumulator() {
	return (value: string, previous: string | string[]) => {
		const soFar = Array.isArray(previous) ? previous : previous ? [previous] : [];
		return [...soFar, value];
	};
}

export function hasEditFieldFlags(options: Record<string, unknown>): boolean {
	return hasConfiguredOptions(options, EDIT_FIELD_OPTIONS, EDIT_TRUE_OPTIONS);
}

function hasConfiguredOptions(
	options: Record<string, unknown>,
	fieldOptions: readonly string[],
	trueOptions: readonly string[],
): boolean {
	return (
		fieldOptions.some((option) => options[option] !== undefined) ||
		trueOptions.some((option) => options[option] === true)
	);
}
