import type { Command } from "commander";
import { DEFAULT_STATUSES, DRAFT_STATUS } from "../../model/constants.ts";
import { getPriorityLabels } from "../../model/task/priority-config.ts";
import { getProjectValues } from "../../model/task/project-config.ts";
import { statusComparisonKey } from "../../model/task/status.ts";
import { getTaskTypeValues } from "../../model/task/task-type-config.ts";
import type { AgenticWorkspaceConfig } from "../../model/types.ts";

let helpConfig: AgenticWorkspaceConfig | null = null;

/** Install the config snapshot CLI help reads; help rendering stays synchronous. */
export function configureHelpValues(config: AgenticWorkspaceConfig | null): void {
	helpConfig = config;
}

export interface HelpField {
	name: string;
	type: string | (() => string);
	description?: string | (() => string);
}

export interface HelpSchema {
	reads?: string;
	writes?: string;
	required?: HelpField[];
	optional?: HelpField[];
	output?: string;
	examples?: string[];
}

function resolveText(value: string | (() => string) | undefined): string | undefined {
	return typeof value === "function" ? value() : value;
}

function formatField(field: HelpField): string {
	const type = resolveText(field.type) ?? "";
	const description = resolveText(field.description);
	const suffix = description ? ` - ${description}` : "";
	return `  - ${field.name}: ${type}${suffix}`;
}

function formatFields(title: string, fields: HelpField[] | undefined): string[] {
	if (!fields || fields.length === 0) {
		return [title, "  - None"];
	}
	return [title, ...fields.map(formatField)];
}

function firstMarkdownField(schema: HelpSchema): string | undefined {
	const fields = [...(schema.required ?? []), ...(schema.optional ?? [])];
	return fields.find((field) => resolveText(field.type) === "Markdown")?.name;
}

function renderHelpSchema(schema: HelpSchema): string {
	const lines = ["", "Input schema:", ...formatFields("Required fields:", schema.required)];

	if (schema.optional) {
		lines.push(...formatFields("Optional fields:", schema.optional));
	}
	const markdownField = firstMarkdownField(schema);
	if (markdownField) {
		lines.push(
			"Markdown fields:",
			"  - Multi-line values need real newlines; a literal \\n is stored as text",
			`  - Example (bash/zsh): --${markdownField} $'First line\\nSecond line'`,
		);
	}
	if (schema.reads) {
		lines.push("Reads:", `  - ${schema.reads}`);
	}
	if (schema.writes) {
		lines.push("Writes:", `  - ${schema.writes}`);
	}
	if (schema.output) {
		lines.push("Output:", `  - ${schema.output}`);
	}
	if (schema.examples && schema.examples.length > 0) {
		lines.push("Examples:", ...schema.examples.map((example) => `  ${renderConfiguredTaskIds(example)}`));
	}

	return `\n${lines.join("\n")}\n`;
}

export function addHelpSchema(command: Command, schema: HelpSchema): Command {
	return command.addHelpText("after", () => renderHelpSchema(schema));
}

function includeDraftStatus(statuses: string[]): string[] {
	const normalizedStatuses = normalizeStatusValues(statuses);
	const hasDraft = normalizedStatuses.some(
		(status) => statusComparisonKey(status) === statusComparisonKey(DRAFT_STATUS),
	);
	return hasDraft ? normalizedStatuses : [DRAFT_STATUS, ...normalizedStatuses];
}

function normalizeStatusValues(statuses: string[]): string[] {
	return statuses.map((status) => status.trim()).filter(Boolean);
}

function getCliStatusValues(options?: { includeDraft?: boolean }): string[] {
	let configuredStatuses: string[] = [...DEFAULT_STATUSES];
	const config = helpConfig;
	if (config && config.statuses.length > 0) configuredStatuses = config.statuses;

	const normalizedStatuses = normalizeStatusValues(configuredStatuses);
	return options?.includeDraft ? includeDraftStatus(normalizedStatuses) : normalizedStatuses;
}

function getCliPriorityValues(): string[] {
	return getPriorityLabels(helpConfig?.priorities);
}

export function getCliTaskTypeValues(): string[] {
	return getTaskTypeValues(helpConfig?.types);
}

function getCliProjectValues(): string[] {
	return getProjectValues(helpConfig?.projects ?? []);
}

function getCliTaskPrefix(): string {
	return helpConfig?.prefixes?.task ?? "task";
}

function taskIdExample(body: string): string {
	return `${getCliTaskPrefix().toUpperCase()}-${body}`;
}

export function renderConfiguredTaskIds(text: string): string {
	const taskTypes = getCliTaskTypeValues();
	return text
		.replace(/\{\{TASK_TYPE:(\d+)\}\}/g, (_match, index: string) => {
			return JSON.stringify(taskTypes[Number(index) - 1] ?? "<configured task type>");
		})
		.replace(/\{\{TASK_ID:(\d+(?:\.\d+)*)\}\}/g, (_match, body: string) => taskIdExample(body))
		.replace(/\b(?:BACK|TASK)-(\d+(?:\.\d+)*)\b/g, (_match, body: string) => taskIdExample(body));
}

export function choiceType(values: readonly string[], options?: { multiple?: boolean }): string {
	return `${options?.multiple ? "one or more of" : "one of"}: ${values.join(", ")}`;
}

export function statusType(options?: { includeDraft?: boolean; multiple?: boolean }): string {
	const cardinality = options?.multiple ? "one or more of" : "one of";
	return `${cardinality} configured statuses: ${getCliStatusValues(options).join(", ")}`;
}

export function priorityType(): string {
	return `one of configured priorities: ${getCliPriorityValues().join(", ")}`;
}

export function taskType(options?: { multiple?: boolean }): string {
	const cardinality = options?.multiple ? "one or more of" : "one of";
	return `${cardinality} configured task types: ${getCliTaskTypeValues().join(", ")}`;
}

export function projectType(options?: { multiple?: boolean }): string {
	const values = getCliProjectValues();
	if (values.length === 0) {
		return "no projects configured; add a 'projects:' list to the project config file";
	}
	const cardinality = options?.multiple ? "one or more of" : "one of";
	return `${cardinality} configured projects: ${values.join(", ")}`;
}
