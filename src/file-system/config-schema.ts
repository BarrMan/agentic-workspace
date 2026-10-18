import { z } from "zod";
import { AgentConfigurationSchema } from "../agent-workspace/agent-config-schema.ts";
import { DEFAULT_FRESH_INIT_POLICY, DEFAULT_STATUSES } from "../constants/index.ts";
import type { AgenticWorkspaceConfig } from "../types/index.ts";
import { normalizeAssignees } from "../utils/assignee-filter.ts";

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

function configList() {
	return z.array(z.string()).transform((values) => values.map((value) => value.trim()).filter(Boolean));
}

const optionalConfigList = z.preprocess((value) => (value === null ? undefined : value), configList().optional());

const statuses = z.preprocess(
	(value) => (value === null ? undefined : value),
	configList().default(() => [...DEFAULT_STATUSES]),
);

const labels = z.preprocess(
	(value) => (value === null ? undefined : value),
	configList().default(() => []),
);

const dateFormat = z.preprocess(
	(value) => (value === null ? undefined : value),
	z
		.string({ error: "must be a non-empty date format string." })
		.min(1, "must be a non-empty date format string.")
		.default(DEFAULT_FRESH_INIT_POLICY.dateFormat),
);

const boolean = z.boolean({ error: "must be a boolean." });
const positiveInteger = z
	.number({ error: "must be a positive integer." })
	.int("must be a positive integer.")
	.min(1, "must be a positive integer.")
	.max(MAX_SAFE_INTEGER, "must be a safe integer.");
const nonNegativeInteger = z
	.number({ error: "must be a non-negative integer." })
	.int("must be a non-negative integer.")
	.min(0, "must be a non-negative integer.")
	.max(MAX_SAFE_INTEGER, "must be a safe integer.");
const port = z
	.number({ error: "must be an integer between 1 and 65535." })
	.int("must be an integer between 1 and 65535.")
	.min(1, "must be an integer between 1 and 65535.")
	.max(65_535, "must be an integer between 1 and 65535.");
const taskPrefix = z.string({ error: "must contain only letters." }).regex(/^[a-zA-Z]+$/, "must contain only letters.");

const rawConfigSchema = z.object({
	agent_configuration: AgentConfigurationSchema.optional(),
	project_name: z.string().default(""),
	default_assignee: z
		.union([configList(), z.string(), z.null()], { error: "must be a list or a single name." })
		.optional(),
	default_reporter: z.string().optional(),
	statuses,
	labels,
	types: optionalConfigList,
	priorities: optionalConfigList,
	projects: optionalConfigList,
	milestones: z.array(z.string()).optional(),
	default_status: z.string().optional(),
	date_format: dateFormat,
	max_column_width: positiveInteger.optional(),
	task_resolution_strategy: z.enum(["most_recent", "most_progressed"]).optional(),
	default_editor: z.string().optional(),
	auto_open_browser: boolean.optional(),
	default_port: port.optional(),
	hide_empty_columns: boolean.optional(),
	remote_operations: boolean.optional(),
	filesystem_only: boolean.optional(),
	zero_padded_ids: nonNegativeInteger.optional(),
	bypass_git_hooks: boolean.optional(),
	check_active_branches: boolean.optional(),
	active_branch_days: nonNegativeInteger.optional(),
	agentic_workspace_directory: z.string().optional(),
	on_status_change: z.string().optional(),
	task_prefix: taskPrefix.optional(),
});

const ALIASES: ReadonlyArray<readonly [alias: string, key: string]> = [
	["filesystemOnly", "filesystem_only"],
	["agenticWorkspaceDirectory", "agentic_workspace_directory"],
	["onStatusChange", "on_status_change"],
];

function normalizeAliases(value: unknown): unknown {
	if (!value || typeof value !== "object" || Array.isArray(value)) return value;
	const input = value as Record<string, unknown>;
	const normalized = { ...input };
	for (const [alias, key] of ALIASES) {
		if (!Object.hasOwn(normalized, key) && Object.hasOwn(input, alias)) normalized[key] = input[alias];
	}
	return normalized;
}

function defaultAssignees(value: string[] | string | null | undefined): string[] | undefined {
	if (value === null) return [];
	if (typeof value === "string") {
		return normalizeAssignees([value]);
	}
	return normalizeAssignees(value);
}

export const AgenticWorkspaceConfigSchema = z.preprocess(normalizeAliases, rawConfigSchema).transform(
	(raw): AgenticWorkspaceConfig => ({
		projectName: raw.project_name,
		agentConfiguration: raw.agent_configuration as AgenticWorkspaceConfig["agentConfiguration"],
		defaultAssignee: defaultAssignees(raw.default_assignee),
		defaultReporter: raw.default_reporter,
		statuses: raw.statuses,
		labels: raw.labels,
		types: raw.types,
		priorities: raw.priorities,
		projects: raw.projects,
		milestones: raw.milestones,
		defaultStatus: raw.default_status,
		dateFormat: raw.date_format,
		maxColumnWidth: raw.max_column_width,
		taskResolutionStrategy: raw.task_resolution_strategy,
		defaultEditor: raw.default_editor,
		autoOpenBrowser: raw.auto_open_browser,
		defaultPort: raw.default_port,
		hideEmptyColumns: raw.hide_empty_columns,
		remoteOperations: raw.remote_operations,
		filesystemOnly: raw.filesystem_only,
		zeroPaddedIds: raw.zero_padded_ids,
		bypassGitHooks: raw.bypass_git_hooks,
		checkActiveBranches: raw.check_active_branches,
		activeBranchDays: raw.active_branch_days,
		onStatusChange: raw.on_status_change,
		prefixes: raw.task_prefix ? { task: raw.task_prefix } : undefined,
		agenticWorkspaceDirectory: raw.agentic_workspace_directory,
	}),
);
