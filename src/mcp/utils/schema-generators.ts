import { DEFAULT_STATUSES, DRAFT_STATUS } from "../../constants/index.ts";
import type { AgenticWorkspaceConfig } from "../../types/index.ts";
import { getPriorityLabels } from "../../utils/priority-config.ts";
import { getProjectValues } from "../../utils/project-config.ts";
import { getTaskTypeValues } from "../../utils/task-type-config.ts";
import type { JsonSchema } from "../validation/validators.ts";

/**
 * Builds the accepted task status values used by MCP schemas and public CLI help.
 */
function getStatusFieldEnumValues(config: Pick<AgenticWorkspaceConfig, "statuses">): string[] {
	const configuredStatuses =
		config.statuses && config.statuses.length > 0 ? [...config.statuses] : [...DEFAULT_STATUSES];
	const normalizedStatuses = configuredStatuses.map((status) => status.trim());
	const hasDraft = normalizedStatuses.some((status) => status.toLowerCase() === DRAFT_STATUS.toLowerCase());
	return hasDraft ? normalizedStatuses : [DRAFT_STATUS, ...normalizedStatuses];
}

/**
 * Generates a status field schema with dynamic enum values sourced from config.
 */
function generateStatusFieldSchema(config: AgenticWorkspaceConfig): JsonSchema {
	const configuredStatuses =
		config.statuses && config.statuses.length > 0 ? [...config.statuses] : [...DEFAULT_STATUSES];
	const normalizedStatuses = configuredStatuses.map((status) => status.trim());
	const enumStatuses = getStatusFieldEnumValues(config);
	const defaultStatus = normalizedStatuses[0] ?? DEFAULT_STATUSES[0];

	return {
		type: "string",
		maxLength: 100,
		enum: enumStatuses,
		enumCaseInsensitive: true,
		enumNormalizeWhitespace: true,
		default: defaultStatus,
		description: `Status value (case-insensitive). Valid values: ${enumStatuses.join(", ")}`,
	};
}

/**
 * Generates a task type field schema with dynamic enum values sourced from config.
 * No default is set: tasks without a type stay untyped.
 */
function generateTypeFieldSchema(config: Pick<AgenticWorkspaceConfig, "types">): JsonSchema {
	const types = getTaskTypeValues(config);

	return {
		type: "string",
		maxLength: 50,
		enum: types,
		enumCaseInsensitive: true,
		description: `Optional task type (case-insensitive). Valid values: ${types.join(", ")}`,
	};
}

function generateTypeFilterSchema(config: Pick<AgenticWorkspaceConfig, "types">): JsonSchema {
	return {
		type: "array",
		items: generateTypeFieldSchema(config),
		maxItems: 50,
		description: "Filter tasks by one or more configured task types (OR semantics).",
	};
}

function generateProjectFilterSchema(config: Pick<AgenticWorkspaceConfig, "projects">): JsonSchema {
	return {
		type: "array",
		items: generateProjectFieldSchema(config),
		maxItems: 50,
		description: "Filter tasks by one or more configured projects (OR semantics).",
	};
}

export function generateTaskListSchema(config: Pick<AgenticWorkspaceConfig, "types" | "projects">): JsonSchema {
	return {
		type: "object",
		properties: {
			status: {
				type: "string",
				maxLength: 100,
			},
			type: generateTypeFilterSchema(config),
			...(getProjectValues(config).length > 0 ? { project: generateProjectFilterSchema(config) } : {}),
			assignee: {
				type: "string",
				maxLength: 100,
			},
			unassigned: {
				type: "boolean",
				description: "When true, only return tasks with no assignee. Cannot be combined with assignee.",
			},
			milestone: {
				type: "string",
				maxLength: 100,
			},
			labels: {
				type: "array",
				items: { type: "string", maxLength: 50 },
			},
			search: {
				type: "string",
				maxLength: 200,
			},
			ready: {
				type: "boolean",
				description: "When true, filter tasks that are ready for work (all dependencies satisfied/completed).",
			},
			limit: {
				type: "number",
				minimum: 1,
				maximum: 1000,
			},
		},
		required: [],
		additionalProperties: false,
	};
}

/**
 * Generates a priority field schema with dynamic enum values sourced from config.
 */
function generatePriorityFieldSchema(config: Pick<AgenticWorkspaceConfig, "priorities">): JsonSchema {
	const priorities = getPriorityLabels(config);

	return {
		type: "string",
		maxLength: 50,
		enum: priorities,
		enumCaseInsensitive: true,
		description: `Optional task priority (case-insensitive). Valid values: ${priorities.join(", ")}`,
	};
}

/**
 * Generates a project field schema with dynamic enum values sourced from config.
 * Unlike priority and type, projects has no default set, so callers must omit this
 * field from generated tool schemas entirely when no projects are configured.
 */
function generateProjectFieldSchema(config: Pick<AgenticWorkspaceConfig, "projects">): JsonSchema {
	const projects = getProjectValues(config);

	return {
		type: "string",
		maxLength: 50,
		enum: projects,
		enumCaseInsensitive: true,
		description: `Optional task project (case-insensitive). Valid values: ${projects.join(", ")}`,
	};
}

function generateDueDateFieldSchema(description: string, clearable = false): JsonSchema {
	return {
		type: clearable ? ["string", "null"] : "string",
		maxLength: 64,
		description: `${description} Use a date such as 2026-08-10. A due date names a day and carries no time.`,
	};
}

/**
 * Generates the task_create input schema with dynamic status enum
 */
export function generateTaskCreateSchema(config: AgenticWorkspaceConfig): JsonSchema {
	return {
		type: "object",
		properties: {
			title: {
				type: "string",
				minLength: 1,
				maxLength: 200,
			},
			description: {
				type: "string",
				maxLength: 10000,
			},
			status: generateStatusFieldSchema(config),
			dueDate: generateDueDateFieldSchema("Optional task due date."),
			priority: generatePriorityFieldSchema(config),
			type: generateTypeFieldSchema(config),
			...(getProjectValues(config).length > 0 ? { project: generateProjectFieldSchema(config) } : {}),
			ordinal: {
				type: "number",
				minimum: 0,
				description:
					"Optional non-negative ordering value for manual task ordering. Lower values sort earlier. Prefer spaced integers such as 1000, 2000, 3000 to leave room for inserts.",
			},
			milestone: {
				type: "string",
				minLength: 1,
				maxLength: 100,
				description: "Optional milestone label (trimmed).",
			},
			labels: {
				type: "array",
				items: {
					type: "string",
					maxLength: 50,
				},
			},
			assignee: {
				type: "array",
				items: {
					type: "string",
					maxLength: 100,
				},
				description:
					"Optional assignees. When omitted, the project's configured defaultAssignee applies; pass an empty array to leave the task unassigned.",
			},
			dependencies: {
				type: "array",
				items: {
					type: "string",
					maxLength: 50,
				},
			},
			references: {
				type: "array",
				items: {
					type: "string",
					maxLength: 500,
				},
				description: "Reference URLs or file paths related to this task",
			},
			documentation: {
				type: "array",
				items: {
					type: "string",
					maxLength: 500,
				},
				description: "Documentation URLs or file paths for understanding this task",
			},
			modifiedFiles: {
				type: "array",
				items: {
					type: "string",
					maxLength: 500,
				},
				description: "Project-root-relative file paths modified by this task",
			},
			parentTaskId: {
				type: "string",
				maxLength: 50,
				description: "Existing parent task ID for a subtask. Do not pass milestone IDs here; use milestone instead.",
			},
		},
		required: ["title"],
		additionalProperties: false,
	};
}

/**
 * Generates the task_edit input schema with dynamic status enum and MCP-specific operations.
 */
export function generateTaskEditSchema(config: AgenticWorkspaceConfig): JsonSchema {
	return {
		type: "object",
		properties: {
			id: {
				type: "string",
				minLength: 1,
				maxLength: 50,
			},
			title: {
				type: "string",
				maxLength: 200,
			},
			description: {
				type: "string",
				maxLength: 10000,
			},
			status: generateStatusFieldSchema(config),
			dueDate: generateDueDateFieldSchema("Set the task due date, or pass null to clear it.", true),
			priority: generatePriorityFieldSchema(config),
			type: generateTypeFieldSchema(config),
			...(getProjectValues(config).length > 0 ? { project: generateProjectFieldSchema(config) } : {}),
			ordinal: {
				type: "number",
				minimum: 0,
				description:
					"Set task ordinal for manual ordering. Lower values sort earlier. Prefer spaced integers such as 1000, 2000, 3000 to leave room for inserts.",
			},
			milestone: {
				type: "string",
				minLength: 1,
				maxLength: 100,
				description: "Set milestone label (string) or clear it (null).",
			},
			labels: {
				type: "array",
				items: {
					type: "string",
					maxLength: 50,
				},
			},
			assignee: {
				type: "array",
				items: {
					type: "string",
					maxLength: 100,
				},
				description: "Replace all assignees. Pass an empty array to clear them.",
			},
			dependencies: {
				type: "array",
				items: {
					type: "string",
					maxLength: 50,
				},
			},
			references: {
				type: "array",
				items: {
					type: "string",
					maxLength: 500,
				},
				description: "Set reference URLs or file paths (replaces existing)",
			},
			addReferences: {
				type: "array",
				items: {
					type: "string",
					maxLength: 500,
				},
				description: "Add reference URLs or file paths",
			},
			removeReferences: {
				type: "array",
				items: {
					type: "string",
					maxLength: 500,
				},
				description: "Remove reference URLs or file paths",
			},
			documentation: {
				type: "array",
				items: {
					type: "string",
					maxLength: 500,
				},
				description: "Set documentation URLs or file paths (replaces existing)",
			},
			addDocumentation: {
				type: "array",
				items: {
					type: "string",
					maxLength: 500,
				},
				description: "Add documentation URLs or file paths",
			},
			removeDocumentation: {
				type: "array",
				items: {
					type: "string",
					maxLength: 500,
				},
				description: "Remove documentation URLs or file paths",
			},
			modifiedFiles: {
				type: "array",
				items: {
					type: "string",
					maxLength: 500,
				},
				description: "Set project-root-relative modified file paths (replaces existing)",
			},
		},
		required: ["id"],
		additionalProperties: false,
	};
}

export function generateTaskSearchSchema(
	config: Pick<AgenticWorkspaceConfig, "priorities" | "types" | "projects">,
): JsonSchema {
	return {
		type: "object",
		properties: {
			query: {
				type: "string",
				maxLength: 200,
			},
			status: {
				type: "string",
				maxLength: 100,
			},
			type: generateTypeFilterSchema(config),
			...(getProjectValues(config).length > 0 ? { project: generateProjectFilterSchema(config) } : {}),
			priority: generatePriorityFieldSchema(config),
			modifiedFiles: {
				type: "array",
				items: { type: "string", maxLength: 500 },
				description: "Filter tasks by case-insensitive substring match against modified file paths",
			},
			limit: {
				type: "number",
				minimum: 1,
				maximum: 100,
			},
		},
		required: [],
		additionalProperties: false,
	};
}
