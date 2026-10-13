import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Command } from "commander";
import { DEFAULT_STATUSES, DRAFT_STATUS } from "../constants/index.ts";
import { decodeConfigYaml } from "../file-system/config.ts";
import { resolveBacklogDirectory } from "../utils/backlog-directory.ts";
import { getPriorityLabels } from "../utils/priority-config.ts";
import { getProjectValues } from "../utils/project-config.ts";
import { BACKLOG_CWD_ENV } from "../utils/runtime-cwd.ts";
import { getTaskTypeValues } from "../utils/task-type-config.ts";

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

function parseArrayFromConfig(content: string, keyName: string): string[] | null {
	const decoded = decodeConfigYaml(content, keyName);
	return "value" in decoded && Array.isArray(decoded.value)
		? decoded.value.filter((value): value is string => typeof value === "string")
		: null;
}

function parseStatusesFromConfig(content: string): string[] | null {
	return parseArrayFromConfig(content, "statuses");
}

function parsePrioritiesFromConfig(content: string): string[] | null {
	return parseArrayFromConfig(content, "priorities");
}

function parseTaskTypesFromConfig(content: string): string[] | null {
	return parseArrayFromConfig(content, "types");
}

function parseProjectsFromConfig(content: string): string[] | null {
	return parseArrayFromConfig(content, "projects");
}

function parseStringValueFromConfig(content: string, keys: string[]): string | null {
	for (const key of keys) {
		const decoded = decodeConfigYaml(content, key);
		if ("value" in decoded && typeof decoded.value === "string") return decoded.value.trim() || null;
	}
	return null;
}

function findBacklogConfigPathSync(startDir: string): string | null {
	let current = startDir;
	while (current !== dirname(current)) {
		const resolution = resolveBacklogDirectory(current);
		if (resolution.configPath) {
			return resolution.configPath;
		}
		current = dirname(current);
	}
	return null;
}

function getRuntimeConfigStartDir(): string {
	const override = process.env[BACKLOG_CWD_ENV]?.trim();
	return override ? resolve(override) : process.cwd();
}

function includeDraftStatus(statuses: string[]): string[] {
	const normalizedStatuses = normalizeStatusValues(statuses);
	const hasDraft = normalizedStatuses.some((status) => status.toLowerCase() === DRAFT_STATUS.toLowerCase());
	return hasDraft ? normalizedStatuses : [DRAFT_STATUS, ...normalizedStatuses];
}

function normalizeStatusValues(statuses: string[]): string[] {
	return statuses.map((status) => status.trim()).filter(Boolean);
}

function getCliStatusValues(options?: { includeDraft?: boolean }): string[] {
	let configuredStatuses: string[] = [...DEFAULT_STATUSES];
	const configPath = findBacklogConfigPathSync(getRuntimeConfigStartDir());
	if (configPath) {
		try {
			const parsed = parseStatusesFromConfig(readFileSync(configPath, "utf8"));
			if (parsed && parsed.length > 0) {
				configuredStatuses = parsed;
			}
		} catch {
			configuredStatuses = [...DEFAULT_STATUSES];
		}
	}

	const normalizedStatuses = normalizeStatusValues(configuredStatuses);
	return options?.includeDraft ? includeDraftStatus(normalizedStatuses) : normalizedStatuses;
}

function getCliPriorityValues(): string[] {
	const configPath = findBacklogConfigPathSync(getRuntimeConfigStartDir());
	if (configPath) {
		try {
			const parsed = parsePrioritiesFromConfig(readFileSync(configPath, "utf8"));
			if (parsed && parsed.length > 0) {
				return getPriorityLabels(parsed);
			}
		} catch {
			return getPriorityLabels();
		}
	}
	return getPriorityLabels();
}

export function getCliTaskTypeValues(): string[] {
	const configPath = findBacklogConfigPathSync(getRuntimeConfigStartDir());
	if (configPath) {
		try {
			const parsed = parseTaskTypesFromConfig(readFileSync(configPath, "utf8"));
			return getTaskTypeValues(parsed);
		} catch {
			return getTaskTypeValues();
		}
	}
	return getTaskTypeValues();
}

function getCliProjectValues(): string[] {
	const configPath = findBacklogConfigPathSync(getRuntimeConfigStartDir());
	if (configPath) {
		try {
			const parsed = parseProjectsFromConfig(readFileSync(configPath, "utf8"));
			return getProjectValues(parsed ?? []);
		} catch {
			return [];
		}
	}
	return [];
}

function getCliTaskPrefix(): string {
	const configPath = findBacklogConfigPathSync(getRuntimeConfigStartDir());
	if (configPath) {
		try {
			return parseStringValueFromConfig(readFileSync(configPath, "utf8"), ["task_prefix", "taskPrefix"]) ?? "task";
		} catch {
			return "task";
		}
	}
	return "task";
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
