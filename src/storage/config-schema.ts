import { z } from "zod";
import { DEFAULT_FRESH_INIT_POLICY, DEFAULT_PRIORITIES, DEFAULT_STATUSES } from "../model/constants.ts";
import { AgentConfigurationSchema, NonProjectAgentConfigurationSchema } from "../model/session/agent-config-schema.ts";
import type { AgenticWorkspaceConfig } from "../model/types.ts";

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
const taskPrefix = z.string({ error: "must contain only letters." }).regex(/^[a-zA-Z]+$/, "must contain only letters.");

function rawConfigSchema<T extends z.ZodType>(agentConfigurationSchema: T) {
	return z.object({
		agent_configuration: agentConfigurationSchema.optional(),
		project_name: z.string().default(""),
		default_reporter: z.string().optional(),
		statuses,
		labels,
		types: optionalConfigList,
		priorities: z.preprocess(
			(value) => (value === null ? undefined : value),
			configList().default(() => [...DEFAULT_PRIORITIES]),
		),
		projects: optionalConfigList,
		default_status: z.string().optional(),
		date_format: dateFormat,
		max_column_width: positiveInteger.optional(),
		default_editor: z.string().optional(),
		hide_empty_columns: boolean.optional(),
		remote_operations: boolean.optional(),
		filesystem_only: boolean.optional(),
		zero_padded_ids: nonNegativeInteger.optional(),
		bypass_git_hooks: boolean.optional(),
		agentic_workspace_directory: z.string().optional(),
		on_status_change: z.string().optional(),
		task_prefix: taskPrefix.optional(),
	});
}

function configSchema<T extends z.ZodType>(agentConfigurationSchema: T) {
	return rawConfigSchema(agentConfigurationSchema).transform(
		(raw): AgenticWorkspaceConfig => ({
			projectName: raw.project_name,
			agentConfiguration: raw.agent_configuration as AgenticWorkspaceConfig["agentConfiguration"],
			defaultReporter: raw.default_reporter,
			statuses: raw.statuses,
			labels: raw.labels,
			types: raw.types,
			priorities: raw.priorities,
			projects: raw.projects,
			defaultStatus: raw.default_status,
			dateFormat: raw.date_format,
			maxColumnWidth: raw.max_column_width,
			defaultEditor: raw.default_editor,
			hideEmptyColumns: raw.hide_empty_columns,
			remoteOperations: raw.remote_operations,
			filesystemOnly: raw.filesystem_only,
			zeroPaddedIds: raw.zero_padded_ids,
			bypassGitHooks: raw.bypass_git_hooks,
			onStatusChange: raw.on_status_change,
			prefixes: raw.task_prefix ? { task: raw.task_prefix } : undefined,
			agenticWorkspaceDirectory: raw.agentic_workspace_directory,
		}),
	);
}

export const AgenticWorkspaceConfigSchema = configSchema(AgentConfigurationSchema);
export const RootAgenticWorkspaceConfigSchema = configSchema(NonProjectAgentConfigurationSchema);
