import { readFileSync, statSync } from "node:fs";
import { join, normalize } from "node:path";
import { DEFAULT_DIRECTORIES, DEFAULT_FILES } from "../constants/index.ts";
import { parseColonConfigLine } from "./config-line.ts";

export const BACKLOG_DIRECTORY_SOURCE = {
	DEFAULT: "backlog",
	HIDDEN: ".backlog",
	CUSTOM: "custom",
} as const;
export type BacklogDirectorySource = (typeof BACKLOG_DIRECTORY_SOURCE)[keyof typeof BACKLOG_DIRECTORY_SOURCE];

export const BACKLOG_CONFIG_SOURCE = {
	FOLDER: "folder",
	ROOT: "root",
} as const;
export type BacklogConfigSource = (typeof BACKLOG_CONFIG_SOURCE)[keyof typeof BACKLOG_CONFIG_SOURCE];

export interface BacklogDirectoryResolution {
	projectRoot: string;
	backlogDir: string | null;
	backlogPath: string | null;
	source: BacklogDirectorySource | null;
	configPath: string | null;
	configSource: BacklogConfigSource | null;
	rootConfigPath: string;
	rootConfigExists: boolean;
}

interface BacklogConfigMetadata {
	projectName: string | null;
	backlogDirectory: string | null;
}

function directoryExists(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

function fileExists(path: string): boolean {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}

function parseBacklogConfigMetadata(content: string): BacklogConfigMetadata {
	let projectName: string | null = null;
	let backlogDirectory: string | null = null;

	for (const rawLine of content.split(/\r?\n/)) {
		const parsed = parseColonConfigLine(rawLine);
		if (!parsed) continue;
		const { key } = parsed;
		const value = parsed.value.replace(/^['"]|['"]$/g, "");
		if ((key === "project_name" || key === "projectName") && value) {
			projectName = value;
			continue;
		}
		if (key === "backlog_directory" || key === "backlogDirectory") {
			backlogDirectory = normalizeProjectBacklogDirectory(value);
		}
	}
	return { projectName, backlogDirectory };
}

function readRootBacklogConfigMetadata(rootConfigPath: string): BacklogConfigMetadata | null {
	if (!fileExists(rootConfigPath)) {
		return null;
	}
	try {
		const metadata = parseBacklogConfigMetadata(readFileSync(rootConfigPath, "utf8"));
		return metadata.projectName ? metadata : null;
	} catch {
		return null;
	}
}

function resolveFolderConfigPath(backlogPath: string): string | null {
	const primary = join(backlogPath, DEFAULT_FILES.CONFIG);
	if (fileExists(primary)) {
		return primary;
	}
	const alternate = join(backlogPath, DEFAULT_FILES.CONFIG_YAML);
	return fileExists(alternate) ? alternate : null;
}

function resolveBuiltInBacklogDirectory(projectRoot: string): {
	backlogDir: string;
	backlogPath: string;
	source: Extract<BacklogDirectorySource, "backlog" | ".backlog">;
} | null {
	const defaultBacklogPath = join(projectRoot, DEFAULT_DIRECTORIES.BACKLOG);
	const hiddenBacklogPath = join(projectRoot, DEFAULT_DIRECTORIES.HIDDEN_BACKLOG);
	const defaultBacklogExists = directoryExists(defaultBacklogPath);
	const hiddenBacklogExists = directoryExists(hiddenBacklogPath);
	const defaultConfigPath = defaultBacklogExists ? resolveFolderConfigPath(defaultBacklogPath) : null;
	const hiddenConfigPath = hiddenBacklogExists ? resolveFolderConfigPath(hiddenBacklogPath) : null;

	if (defaultConfigPath) {
		return {
			backlogDir: DEFAULT_DIRECTORIES.BACKLOG,
			backlogPath: defaultBacklogPath,
			source: BACKLOG_DIRECTORY_SOURCE.DEFAULT,
		};
	}

	if (hiddenConfigPath) {
		return {
			backlogDir: DEFAULT_DIRECTORIES.HIDDEN_BACKLOG,
			backlogPath: hiddenBacklogPath,
			source: BACKLOG_DIRECTORY_SOURCE.HIDDEN,
		};
	}

	if (defaultBacklogExists) {
		return {
			backlogDir: DEFAULT_DIRECTORIES.BACKLOG,
			backlogPath: defaultBacklogPath,
			source: BACKLOG_DIRECTORY_SOURCE.DEFAULT,
		};
	}

	if (hiddenBacklogExists) {
		return {
			backlogDir: DEFAULT_DIRECTORIES.HIDDEN_BACKLOG,
			backlogPath: hiddenBacklogPath,
			source: BACKLOG_DIRECTORY_SOURCE.HIDDEN,
		};
	}

	return null;
}

export function resolveBacklogDirectoryFromRootConfig(
	projectRoot: string,
	backlogDirectory: string | null | undefined,
): BacklogDirectoryResolution {
	const rootConfigPath = join(projectRoot, DEFAULT_FILES.ROOT_CONFIG);
	const configuredBacklogDir = normalizeProjectBacklogDirectory(backlogDirectory);
	if (configuredBacklogDir) {
		const configuredBacklogPath = join(projectRoot, configuredBacklogDir);
		const configuredSource: BacklogDirectorySource =
			configuredBacklogDir === DEFAULT_DIRECTORIES.BACKLOG
				? BACKLOG_DIRECTORY_SOURCE.DEFAULT
				: configuredBacklogDir === DEFAULT_DIRECTORIES.HIDDEN_BACKLOG
					? BACKLOG_DIRECTORY_SOURCE.HIDDEN
					: BACKLOG_DIRECTORY_SOURCE.CUSTOM;
		return {
			projectRoot,
			backlogDir: configuredBacklogDir,
			backlogPath: configuredBacklogPath,
			source: configuredSource,
			configPath: rootConfigPath,
			configSource: BACKLOG_CONFIG_SOURCE.ROOT,
			rootConfigPath,
			rootConfigExists: true,
		};
	}

	const builtIn = resolveBuiltInBacklogDirectory(projectRoot);
	if (builtIn) {
		return {
			projectRoot,
			backlogDir: builtIn.backlogDir,
			backlogPath: builtIn.backlogPath,
			source: builtIn.source,
			configPath: rootConfigPath,
			configSource: BACKLOG_CONFIG_SOURCE.ROOT,
			rootConfigPath,
			rootConfigExists: true,
		};
	}

	return {
		projectRoot,
		backlogDir: null,
		backlogPath: null,
		source: null,
		configPath: null,
		configSource: null,
		rootConfigPath,
		rootConfigExists: true,
	};
}

export function normalizeProjectBacklogDirectory(value: string | null | undefined): string | null {
	const trimmed = String(value ?? "").trim();
	if (!trimmed) {
		return null;
	}
	if (/^(?:[a-zA-Z]:)?[\\/]/.test(trimmed)) {
		return null;
	}

	const normalized = normalize(trimmed).replace(/\\/g, "/").replace(/\/+$/g, "");
	if (!normalized || normalized === ".") {
		return null;
	}
	if (normalized === ".." || normalized.startsWith("../")) {
		return null;
	}
	return normalized;
}

export function resolveBacklogDirectory(projectRoot: string): BacklogDirectoryResolution {
	const rootConfigPath = join(projectRoot, DEFAULT_FILES.ROOT_CONFIG);
	const rootConfigExists = fileExists(rootConfigPath);

	if (rootConfigExists) {
		const metadata = readRootBacklogConfigMetadata(rootConfigPath);
		if (metadata) {
			return resolveBacklogDirectoryFromRootConfig(projectRoot, metadata.backlogDirectory);
		}
	}

	const builtIn = resolveBuiltInBacklogDirectory(projectRoot);
	if (!builtIn) {
		return {
			projectRoot,
			backlogDir: null,
			backlogPath: null,
			source: null,
			configPath: null,
			configSource: null,
			rootConfigPath,
			rootConfigExists,
		};
	}

	const folderConfigPath = resolveFolderConfigPath(builtIn.backlogPath);
	return {
		projectRoot,
		backlogDir: builtIn.backlogDir,
		backlogPath: builtIn.backlogPath,
		source: builtIn.source,
		configPath: folderConfigPath,
		configSource: folderConfigPath ? BACKLOG_CONFIG_SOURCE.FOLDER : null,
		rootConfigPath,
		rootConfigExists,
	};
}
