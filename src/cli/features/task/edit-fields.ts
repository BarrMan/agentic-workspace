import type { Command } from "commander";

const CREATE_FIELD_OPTIONS = [
	"description",
	"desc",
	"assignee",
	"status",
	"labels",
	"priority",
	"type",
	"project",
	"ordinal",
	"milestone",
	"dueDate",
	"parent",
	"dependsOn",
	"dep",
	"ref",
	"doc",
	"modifiedFile",
] as const;
const CREATE_TRUE_OPTIONS = ["plain", "draft"] as const;
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

export function hasCreateFieldFlags(options: Record<string, unknown>): boolean {
	return hasConfiguredOptions(options, CREATE_FIELD_OPTIONS, CREATE_TRUE_OPTIONS);
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

export function addEditFieldOptions(cmd: Command) {
	return cmd
		.option("-t, --title <title>")
		.option("-d, --description <text>", "task description")
		.option("--desc <text>", "alias for --description")
		.option(
			"-a, --assignee <assignees>",
			'replace all task assignees with one or more names (optional @; comma-separated or repeatable); pass "" to clear them',
			createMultiValueAccumulator(),
		)
		.option("-s, --status <status>")
		.option(
			"-l, --label <labels>",
			"replace all task labels (comma-separated or repeatable; cannot combine with --add-label/--remove-label)",
			createMultiValueAccumulator(),
		)
		.option("--priority <priority>", "set task priority (configured priorities)")
		.option("--type <type>", "set task type (configured task types; pass an empty value to clear)")
		.option("--project <project>", "set task project (configured projects; pass an empty value to clear)")
		.option("--due-date <date>", "set due date (YYYY-MM-DD)")
		.option("--clear-due-date", "clear task due date")
		.option("--ordinal <number>", "set task ordinal for custom ordering")
		.option("-m, --milestone <milestone>", "assign task to milestone by ID or title")
		.option("--clear-milestone", "clear task milestone assignment")
		.option("--plain", "use plain text output after editing")
		.option(
			"--add-label <labels>",
			"add task labels without replacing existing labels (comma-separated or repeatable)",
			createMultiValueAccumulator(),
		)
		.option(
			"--remove-label <labels>",
			"remove task labels without replacing others (comma-separated or repeatable)",
			createMultiValueAccumulator(),
		)
		.option("--clear-labels", "remove all task labels (cannot combine with --label/--add-label/--remove-label)")
		.option("--clear-deps", "remove all task dependencies (cannot combine with --depends-on or --dep)")
		.option(
			"--depends-on <taskIds>",
			'set task dependencies (comma-separated or use multiple times); pass "" to clear them',
			createMultiValueAccumulator(),
		)
		.option("--dep <taskIds>", "set task dependencies (shortcut for --depends-on)", createMultiValueAccumulator())
		.option(
			"--ref <reference>",
			'replace all references (comma-separated or repeatable; cannot combine with --add-ref/--remove-ref); pass "" to clear them',
			createMultiValueAccumulator(),
		)
		.option(
			"--add-ref <reference>",
			"add references without replacing existing references (comma-separated or repeatable)",
			createMultiValueAccumulator(),
		)
		.option(
			"--remove-ref <reference>",
			"remove references without replacing others (comma-separated or repeatable)",
			createMultiValueAccumulator(),
		)
		.option("--clear-refs", "remove all references (cannot combine with --ref, --add-ref, or --remove-ref)")
		.option(
			"--modified-file <path>",
			"set modified file paths from project root (can be used multiple times)",
			createMultiValueAccumulator(),
		)
		.option(
			"--doc <documentation>",
			'set documentation (can be used multiple times); pass "" to clear it',
			createMultiValueAccumulator(),
		)
		.option("--clear-docs", "remove all documentation; cannot combine with --doc");
}
