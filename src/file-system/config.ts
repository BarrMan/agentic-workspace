import { DEFAULT_FRESH_INIT_POLICY, DEFAULT_STATUSES } from "../constants/index.ts";
import type { BacklogConfig } from "../types/index.ts";

type ConfigListKey = "statuses" | "labels" | "types" | "priorities" | "projects" | "default_assignee";

const CONFIG_LIST_KEYS: ConfigListKey[] = ["statuses", "labels", "types", "priorities", "projects", "default_assignee"];

const CONFIG_VALUE_ERROR_NAME = "ConfigValueError";

function configKeyIndent(line: string, key: string): number | undefined {
	const indent = line.length - line.trimStart().length;
	const trimmed = line.trimStart();
	if (!trimmed.startsWith(key)) return undefined;
	const separator = trimmed.substring(key.length);
	const colon = separator.indexOf(":");
	return colon !== -1 && separator.substring(0, colon).trim() === "" ? indent : undefined;
}

function isYamlMappingLine(line: string): boolean {
	const trimmed = line.trimStart();
	if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("- ")) return false;
	const colon = trimmed.indexOf(":");
	return colon > 0 && !/\s/.test(trimmed.substring(0, colon));
}

function configKeyYaml(content: string, key: string): string | undefined {
	const lines = content.split(/\r?\n/);
	const startIndex = lines.some((line) => configKeyIndent(line, key) === 0)
		? lines.findLastIndex((line) => configKeyIndent(line, key) === 0)
		: lines.findLastIndex((line) => configKeyIndent(line, key) !== undefined);
	if (startIndex === -1) return undefined;

	const startIndent = configKeyIndent(lines[startIndex] ?? "", key) ?? 0;
	const collected: string[] = [];
	for (let index = startIndex; index < lines.length; index++) {
		const line = lines[index] ?? "";
		const trimmed = line.trim();
		const indent = line.length - line.trimStart().length;
		if (index > startIndex && trimmed.length > 0 && indent <= startIndent && isYamlMappingLine(line)) break;
		collected.push(line);
	}
	return collected.join("\n");
}

type YamlDecodeResult<Value> = { value: Value | undefined } | { error: unknown };

function isYamlMapping(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function yamlValue(document: string, key: string): YamlDecodeResult<unknown> {
	try {
		const parsed: unknown = Bun.YAML.parse(document);
		if (!isYamlMapping(parsed)) return { value: undefined };
		return { value: Object.hasOwn(parsed, key) ? parsed[key] : undefined };
	} catch (error) {
		return { error };
	}
}

/**
 * Synchronously decodes one config key without letting malformed unrelated YAML hide it.
 * A full-document retry preserves aliases that refer to values under another key.
 */
export function decodeConfigYaml(content: string, key: string): YamlDecodeResult<unknown> {
	const block = configKeyYaml(content, key);
	if (block === undefined) return { value: undefined };
	const decodedBlock = yamlValue(block, key);
	if ("value" in decodedBlock) return decodedBlock;
	const decodedDocument = yamlValue(content, key);
	return "value" in decodedDocument ? decodedDocument : decodedBlock;
}

function configValueError(configPath: string, key: string, problem: string, remedy: string): Error {
	const error = new Error(
		`Backlog could not start because ${configPath} has an invalid value for "${key}"${problem ? `: ${problem}` : ""}. ${remedy}`,
	);
	error.name = CONFIG_VALUE_ERROR_NAME;
	return error;
}

function configSyntaxError(configPath: string, key: string, reason: unknown): Error {
	const detail = (reason instanceof Error ? reason.message : String(reason)).split("\n")[0]?.trim();
	return configValueError(
		configPath,
		key,
		detail ?? "",
		"Edit that key so its value is valid YAML, then run the command again.",
	);
}

function describeConfigValue(value: unknown): string {
	if (value === undefined) return "no value Backlog could read";
	switch (typeof value) {
		case "string":
			return "a scalar";
		case "number":
			return "a number";
		case "boolean":
			return "a boolean";
		default:
			return "a mapping";
	}
}

function configTypeError(configPath: string, key: ConfigListKey, value: unknown): Error {
	const expected = key === "default_assignee" ? "a list or a single name" : "a list";
	return configValueError(
		configPath,
		key,
		`expected ${expected}, got ${describeConfigValue(value)}`,
		`Edit that key so its value is ${expected}, then run the command again.`,
	);
}

export function isConfigValueError(error: unknown): error is Error {
	return error instanceof Error && error.name === CONFIG_VALUE_ERROR_NAME;
}

function parseConfigListValue(content: string, key: ConfigListKey, configPath: string): string[] | undefined {
	const decoded = decodeConfigYaml(content, key);
	if (!("value" in decoded)) throw configSyntaxError(configPath, key, decoded.error);
	const parsed = decoded.value;
	if (parsed === undefined) return undefined;
	if (parsed === null) return key === "default_assignee" ? [] : undefined;
	if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
	if (typeof parsed === "string" && key === "default_assignee") {
		const value = parsed.trim();
		return value ? [value] : [];
	}
	throw configTypeError(configPath, key, parsed);
}

type ConfigScalarPolicy = (config: Partial<BacklogConfig>, value: string) => void;

function scalarValue(value: string): string {
	return value.replace(/['"]/g, "");
}
function booleanValue(value: string): boolean {
	return value.toLowerCase() === "true";
}
function numberValue(value: string): number {
	return Number.parseInt(value, 10);
}
function assignScalar<Key extends keyof BacklogConfig>(
	key: Key,
	read: (value: string) => BacklogConfig[Key],
): ConfigScalarPolicy {
	return (config, value) => {
		config[key] = read(value);
	};
}

const CONFIG_SCALAR_POLICIES: Record<string, ConfigScalarPolicy> = {
	project_name: assignScalar("projectName", scalarValue),
	default_reporter: assignScalar("defaultReporter", scalarValue),
	default_status: assignScalar("defaultStatus", scalarValue),
	date_format: assignScalar("dateFormat", scalarValue),
	max_column_width: assignScalar("maxColumnWidth", numberValue),
	default_editor: assignScalar("defaultEditor", scalarValue),
	auto_open_browser: assignScalar("autoOpenBrowser", booleanValue),
	hide_empty_columns: assignScalar("hideEmptyColumns", booleanValue),
	default_port: assignScalar("defaultPort", numberValue),
	remote_operations: assignScalar("remoteOperations", booleanValue),
	filesystem_only: assignScalar("filesystemOnly", booleanValue),
	filesystemOnly: assignScalar("filesystemOnly", booleanValue),
	zero_padded_ids: assignScalar("zeroPaddedIds", numberValue),
	bypass_git_hooks: assignScalar("bypassGitHooks", booleanValue),
	check_active_branches: assignScalar("checkActiveBranches", booleanValue),
	active_branch_days: assignScalar("activeBranchDays", numberValue),
	task_prefix: (config, value) => {
		config.prefixes = { task: scalarValue(value) };
	},
	backlog_directory: assignScalar("backlogDirectory", scalarValue),
	backlogDirectory: assignScalar("backlogDirectory", scalarValue),
	onStatusChange: (config, value) => {
		config.onStatusChange = value.replace(/^['"]|['"]$/g, "");
	},
	on_status_change: (config, value) => {
		config.onStatusChange = value.replace(/^['"]|['"]$/g, "");
	},
};

function configScalars(content: string): Partial<BacklogConfig> {
	const config: Partial<BacklogConfig> = {};
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const colonIndex = trimmed.indexOf(":");
		if (colonIndex === -1) continue;
		const policy = CONFIG_SCALAR_POLICIES[trimmed.substring(0, colonIndex).trim()];
		policy?.(config, trimmed.substring(colonIndex + 1).trim());
	}
	return config;
}

function completeConfig(config: Partial<BacklogConfig>): BacklogConfig {
	return {
		projectName: config.projectName || "",
		defaultAssignee: config.defaultAssignee,
		defaultReporter: config.defaultReporter,
		statuses: config.statuses || [...DEFAULT_STATUSES],
		labels: config.labels || [],
		types: config.types,
		priorities: config.priorities,
		projects: config.projects,
		defaultStatus: config.defaultStatus,
		dateFormat: config.dateFormat || DEFAULT_FRESH_INIT_POLICY.dateFormat,
		maxColumnWidth: config.maxColumnWidth,
		defaultEditor: config.defaultEditor,
		autoOpenBrowser: config.autoOpenBrowser,
		hideEmptyColumns: config.hideEmptyColumns,
		defaultPort: config.defaultPort,
		remoteOperations: config.remoteOperations,
		filesystemOnly: config.filesystemOnly,
		zeroPaddedIds: config.zeroPaddedIds,
		bypassGitHooks: config.bypassGitHooks,
		checkActiveBranches: config.checkActiveBranches,
		activeBranchDays: config.activeBranchDays,
		onStatusChange: config.onStatusChange,
		prefixes: config.prefixes,
		backlogDirectory: config.backlogDirectory,
	};
}

export function parseConfig(content: string, configPath: string): BacklogConfig {
	const config = configScalars(content);
	for (const key of CONFIG_LIST_KEYS) {
		const value = parseConfigListValue(content, key, configPath);
		if (key === "default_assignee") config.defaultAssignee = value;
		else if (key === "statuses") config.statuses = value;
		else
			config[
				{ labels: "labels", types: "types", priorities: "priorities", projects: "projects" }[key] as
					| "labels"
					| "types"
					| "priorities"
					| "projects"
			] = value;
	}
	return completeConfig(config);
}

function serializeList(key: string, values: string[] | undefined, required = false): string[] {
	return values?.length || required
		? [`${key}: [${(values ?? []).map((value) => JSON.stringify(value)).join(", ")}]`]
		: [];
}

function serializeOptional(key: string, value: string | number | boolean | undefined, quote = false): string[] {
	return value === undefined || value === "" ? [] : [`${key}: ${quote ? JSON.stringify(value) : value}`];
}

export function serializeConfig(config: BacklogConfig): string {
	const lines = [
		...serializeOptional("project_name", config.projectName, true),
		...serializeList("default_assignee", config.defaultAssignee),
		...serializeOptional("default_reporter", config.defaultReporter, true),
		...serializeOptional("default_status", config.defaultStatus, true),
		...serializeList("statuses", config.statuses, true),
		...serializeList("labels", config.labels, true),
		...serializeList("types", config.types),
		...serializeList("priorities", config.priorities),
		...serializeList("projects", config.projects),
		`date_format: ${config.dateFormat}`,
		...serializeOptional("max_column_width", config.maxColumnWidth || undefined),
		...serializeOptional("default_editor", config.defaultEditor, true),
		...(typeof config.autoOpenBrowser === "boolean" ? [`auto_open_browser: ${config.autoOpenBrowser}`] : []),
		...(typeof config.hideEmptyColumns === "boolean" ? [`hide_empty_columns: ${config.hideEmptyColumns}`] : []),
		...(config.defaultPort ? [`default_port: ${config.defaultPort}`] : []),
		...(typeof config.remoteOperations === "boolean" ? [`remote_operations: ${config.remoteOperations}`] : []),
		...(typeof config.filesystemOnly === "boolean" ? [`filesystem_only: ${config.filesystemOnly}`] : []),
		...(typeof config.zeroPaddedIds === "number" ? [`zero_padded_ids: ${config.zeroPaddedIds}`] : []),
		...(typeof config.bypassGitHooks === "boolean" ? [`bypass_git_hooks: ${config.bypassGitHooks}`] : []),
		...(typeof config.checkActiveBranches === "boolean"
			? [`check_active_branches: ${config.checkActiveBranches}`]
			: []),
		...(typeof config.activeBranchDays === "number" ? [`active_branch_days: ${config.activeBranchDays}`] : []),
		...(config.onStatusChange ? [`onStatusChange: '${config.onStatusChange}'`] : []),
		...(config.prefixes?.task ? [`task_prefix: "${config.prefixes.task}"`] : []),
		...(config.backlogDirectory ? [`backlog_directory: "${config.backlogDirectory}"`] : []),
	];
	return `${lines.join("\n")}\n`;
}
