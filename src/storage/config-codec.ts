import type { AgenticWorkspaceConfig } from "../model/types.ts";
import { AgenticWorkspaceConfigSchema } from "./config-schema.ts";

const CONFIG_VALUE_ERROR_NAME = "ConfigValueError";

function configValueError(configPath: string, key: string, problem: string, remedy: string): Error {
	const detail = problem.replace(/\.$/, "");
	const error = new Error(
		`AgenticWorkspace could not start because ${configPath} has an invalid value for "${key}"${detail ? `: ${detail}` : ""}. ${remedy}`,
	);
	error.name = CONFIG_VALUE_ERROR_NAME;
	return error;
}

function configSyntaxError(configPath: string, reason: unknown): Error {
	const detail = (reason instanceof Error ? reason.message : String(reason)).split("\n")[0]?.trim();
	return configValueError(
		configPath,
		"config",
		detail ?? "",
		"Edit the file so it is valid YAML, then run the command again.",
	);
}

export function isConfigValueError(error: unknown): error is Error {
	return error instanceof Error && error.name === CONFIG_VALUE_ERROR_NAME;
}

export function parseConfig(content: string, configPath: string): AgenticWorkspaceConfig {
	let document: unknown;
	try {
		document = Bun.YAML.parse(content);
	} catch (error) {
		throw configSyntaxError(configPath, error);
	}
	if (document === null || document === undefined) document = {};

	const parsed = AgenticWorkspaceConfigSchema.safeParse(document);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		const key = issue?.path.length ? issue.path.map(String).join(".") : "config";
		throw configValueError(
			configPath,
			key,
			issue?.message ?? "unrecognized configuration",
			`Edit "${key}" so its value is valid, then run the command again.`,
		);
	}
	return parsed.data;
}

function serializeList(key: string, values: string[] | undefined, required = false): string[] {
	return values?.length || required
		? [`${key}: [${(values ?? []).map((value) => JSON.stringify(value)).join(", ")}]`]
		: [];
}

function serializeOptional(key: string, value: string | number | boolean | undefined, quote = false): string[] {
	return value === undefined || value === "" ? [] : [`${key}: ${quote ? JSON.stringify(value) : value}`];
}

export function serializeConfig(config: AgenticWorkspaceConfig): string {
	// shortcut: JSON flow values are valid YAML; move to block YAML if human diffing matters.
	const lines = [
		...(config.agentConfiguration ? [`agent_configuration: ${JSON.stringify(config.agentConfiguration)}`] : []),
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
		...(config.onStatusChange ? [`on_status_change: '${config.onStatusChange}'`] : []),
		...(config.prefixes?.task ? [`task_prefix: "${config.prefixes.task}"`] : []),
		...(config.agenticWorkspaceDirectory ? [`agentic_workspace_directory: "${config.agenticWorkspaceDirectory}"`] : []),
	];
	return `${lines.join("\n")}\n`;
}
