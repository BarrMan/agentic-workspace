import type { Core } from "../../../core/backlog.ts";
import type { BacklogConfig } from "../../../types/index.ts";
import { getPriorityOptions } from "../../../utils/priority-config.ts";
import { getProjectValues } from "../../../utils/project-config.ts";
import { parseDelimitedStringList } from "../../../utils/task-builders.ts";
import { getTaskTypeValues } from "../../../utils/task-type-config.ts";

const CONFIG_AVAILABLE_KEYS =
	"Available keys: defaultEditor, projectName, defaultAssignee, defaultStatus, statuses, labels, priorities, types, projects, milestones, dateFormat, maxColumnWidth, defaultPort, autoOpenBrowser, hideEmptyColumns, remoteOperations, filesystemOnly, bypassGitHooks, zeroPaddedIds, checkActiveBranches, activeBranchDays";

type Reader = (core: Core, config: BacklogConfig) => string | Promise<string>;
type Setter = (config: BacklogConfig, value: string) => boolean | Promise<boolean>;

const readers: Record<string, Reader> = {
	projectName: (_, config) => config.projectName,
	defaultAssignee: (_, config) => config.defaultAssignee?.join(", ") || "",
	defaultStatus: (_, config) => config.defaultStatus || "",
	statuses: (_, config) => config.statuses.join(", "),
	labels: (_, config) => config.labels.join(", "),
	priorities: (_, config) =>
		getPriorityOptions(config)
			.map((priority) => priority.label)
			.join(", "),
	types: (_, config) => getTaskTypeValues(config).join(", "),
	projects: (_, config) => getProjectValues(config).join(", "),
	milestones: async (core) => (await core.filesystem.listMilestones()).map((milestone) => milestone.id).join(", "),
	dateFormat: (_, config) => config.dateFormat,
	maxColumnWidth: (_, config) => config.maxColumnWidth?.toString() || "",
	defaultPort: (_, config) => config.defaultPort?.toString() || "",
	autoOpenBrowser: (_, config) => config.autoOpenBrowser?.toString() || "",
	hideEmptyColumns: (_, config) => config.hideEmptyColumns?.toString() || "false",
	remoteOperations: (_, config) => config.remoteOperations?.toString() || "",
	filesystemOnly: (_, config) => config.filesystemOnly?.toString() || "false",
	bypassGitHooks: (_, config) => config.bypassGitHooks?.toString() || "",
	zeroPaddedIds: (_, config) => config.zeroPaddedIds?.toString() || "(disabled)",
	checkActiveBranches: (_, config) => config.checkActiveBranches?.toString() || "true",
	activeBranchDays: (_, config) => config.activeBranchDays?.toString() || "30",
};

function parseBoolean(key: string, value: string): boolean | null {
	const normalized = value.toLowerCase();
	if (["true", "1", "yes"].includes(normalized)) return true;
	if (["false", "0", "no"].includes(normalized)) return false;
	console.error(`${key} must be true or false`);
	return null;
}

function numericSetter(key: string, minimum: number, assign: (config: BacklogConfig, value: number) => void): Setter {
	return (config, value) => {
		const parsed = Number.parseInt(value, 10);
		if (Number.isNaN(parsed) || parsed < minimum) {
			console.error(
				`${key} must be a ${minimum === 0 ? "non-negative" : "positive"} number${key === "zeroPaddedIds" || key === "activeBranchDays" ? "." : ""}`,
			);
			return false;
		}
		assign(config, parsed);
		return true;
	};
}

function directSetter(assign: (config: BacklogConfig, value: string) => void): Setter {
	return (config, value) => {
		assign(config, value);
		return true;
	};
}

const setters: Record<string, Setter> = {
	projectName: directSetter((config, value) => {
		config.projectName = value;
	}),
	defaultAssignee: directSetter((config, value) => {
		config.defaultAssignee = parseDelimitedStringList(value);
	}),
	defaultStatus: directSetter((config, value) => {
		config.defaultStatus = value;
	}),
	dateFormat: directSetter((config, value) => {
		config.dateFormat = value;
	}),
	maxColumnWidth: numericSetter("maxColumnWidth", 1, (config, value) => (config.maxColumnWidth = value)),
	zeroPaddedIds: numericSetter("zeroPaddedIds", 0, (config, value) => (config.zeroPaddedIds = value || undefined)),
	activeBranchDays: numericSetter("activeBranchDays", 0, (config, value) => (config.activeBranchDays = value)),
	defaultPort: (config, value) => {
		const port = Number.parseInt(value, 10);
		if (Number.isNaN(port) || port < 1 || port > 65535) {
			console.error("defaultPort must be a valid port number (1-65535)");
			return false;
		}
		config.defaultPort = port;
		return true;
	},
};

const booleanKeys = [
	"autoOpenBrowser",
	"hideEmptyColumns",
	"remoteOperations",
	"bypassGitHooks",
	"checkActiveBranches",
] as const;

export async function printConfigValue(core: Core, config: BacklogConfig, key: string): Promise<boolean> {
	if (key === "defaultEditor") {
		console.log(config.defaultEditor || "defaultEditor is not set");
		return Boolean(config.defaultEditor);
	}
	const reader = readers[key];
	if (!reader) return unknownKey(key);
	console.log(await reader(core, config));
	return true;
}

export async function setConfigValue(config: BacklogConfig, key: string, value: string): Promise<boolean> {
	if (key === "defaultEditor") return setEditor(config, value);
	if (key === "filesystemOnly") return setFilesystemOnly(config, value);
	if (booleanKeys.includes(key as (typeof booleanKeys)[number])) {
		const parsed = parseBoolean(key, value);
		if (parsed === null) return false;
		Object.assign(config, { [key]: parsed });
		return true;
	}
	const setter = setters[key];
	if (setter) return setter(config, value);
	return rejectedKey(key);
}

async function setEditor(config: BacklogConfig, value: string): Promise<boolean> {
	if (value) {
		const { isEditorAvailable } = await import("../../../utils/editor.ts");
		if (!(await isEditorAvailable(value))) {
			console.error(`Editor command not found: ${value}`);
			console.error("Please ensure the editor is installed and available in your PATH");
			return false;
		}
	}
	config.defaultEditor = value;
	return true;
}

function setFilesystemOnly(config: BacklogConfig, value: string): boolean {
	const enabled = parseBoolean("filesystemOnly", value);
	if (enabled === null) return false;
	config.filesystemOnly = enabled;
	if (enabled)
		Object.assign(config, {
			checkActiveBranches: false,
			remoteOperations: false,
			bypassGitHooks: false,
		});
	return true;
}

function rejectedKey(key: string): boolean {
	if (key === "milestones") {
		console.error("milestones cannot be set directly.");
		console.error(
			"Use milestone files via milestone commands (e.g. `backlog milestone list`, `backlog milestone add`).",
		);
	} else if (["statuses", "labels", "types", "priorities", "projects"].includes(key)) {
		console.error(`${key} cannot be set directly. View current values with 'agenticworkspace config get ${key}'.`);
		console.error(
			"Edit the list in the project config file (`backlog/config.yml`, `.backlog/config.yml`, or `backlog.config.yml`) directly.",
		);
	} else if (["taskPrefix", "prefixes"].includes(key)) {
		console.error("Task prefix cannot be changed after initialization.");
		console.error(
			"The prefix is set during 'agenticworkspace init' and is permanent to avoid breaking existing task IDs.",
		);
	} else return unknownKey(key);
	return false;
}

function unknownKey(key: string): false {
	console.error(`Unknown config key: ${key}`);
	console.error(CONFIG_AVAILABLE_KEYS);
	return false;
}
