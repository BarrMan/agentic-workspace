import { readFileSync, statSync } from "node:fs";
import { join, normalize } from "node:path";
import { DEFAULT_DIRECTORIES, DEFAULT_FILES } from "../constants/index.ts";
import { parseColonConfigLine } from "./config-line.ts";

export const AGENTIC_WORKSPACE_DIRECTORY_SOURCE = {
	DEFAULT: "agentic-workspace",
	HIDDEN: ".agentic-workspace",
	CUSTOM: "custom",
} as const;
export type AgenticWorkspaceDirectorySource =
	(typeof AGENTIC_WORKSPACE_DIRECTORY_SOURCE)[keyof typeof AGENTIC_WORKSPACE_DIRECTORY_SOURCE];

export const AGENTIC_WORKSPACE_CONFIG_SOURCE = {
	FOLDER: "folder",
	ROOT: "root",
} as const;
export type AgenticWorkspaceConfigSource =
	(typeof AGENTIC_WORKSPACE_CONFIG_SOURCE)[keyof typeof AGENTIC_WORKSPACE_CONFIG_SOURCE];

export interface AgenticWorkspaceDirectoryResolution {
	projectRoot: string;
	agenticWorkspaceDir: string | null;
	agenticWorkspacePath: string | null;
	source: AgenticWorkspaceDirectorySource | null;
	configPath: string | null;
	configSource: AgenticWorkspaceConfigSource | null;
	rootConfigPath: string;
	rootConfigExists: boolean;
}

interface AgenticWorkspaceConfigMetadata {
	projectName: string | null;
	agenticWorkspaceDirectory: string | null;
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

function parseAgenticWorkspaceConfigMetadata(content: string): AgenticWorkspaceConfigMetadata {
	let projectName: string | null = null;
	let agenticWorkspaceDirectory: string | null = null;

	for (const rawLine of content.split(/\r?\n/)) {
		const parsed = parseColonConfigLine(rawLine);
		if (!parsed) continue;
		const { key } = parsed;
		const value = parsed.value.replace(/^['"]|['"]$/g, "");
		if ((key === "project_name" || key === "projectName") && value) {
			projectName = value;
			continue;
		}
		if (key === "agentic_workspace_directory" || key === "agenticWorkspaceDirectory") {
			agenticWorkspaceDirectory = normalizeProjectAgenticWorkspaceDirectory(value);
		}
	}
	return { projectName, agenticWorkspaceDirectory };
}

function readRootAgenticWorkspaceConfigMetadata(rootConfigPath: string): AgenticWorkspaceConfigMetadata | null {
	if (!fileExists(rootConfigPath)) {
		return null;
	}
	try {
		const metadata = parseAgenticWorkspaceConfigMetadata(readFileSync(rootConfigPath, "utf8"));
		return metadata.projectName ? metadata : null;
	} catch {
		return null;
	}
}

function resolveFolderConfigPath(agenticWorkspacePath: string): string | null {
	const primary = join(agenticWorkspacePath, DEFAULT_FILES.CONFIG);
	if (fileExists(primary)) {
		return primary;
	}
	const alternate = join(agenticWorkspacePath, DEFAULT_FILES.CONFIG_YAML);
	return fileExists(alternate) ? alternate : null;
}

function resolveBuiltInAgenticWorkspaceDirectory(projectRoot: string): {
	agenticWorkspaceDir: string;
	agenticWorkspacePath: string;
	source: Extract<AgenticWorkspaceDirectorySource, "agentic-workspace" | ".agentic-workspace">;
} | null {
	const defaultAgenticWorkspacePath = join(projectRoot, DEFAULT_DIRECTORIES.AGENTIC_WORKSPACE);
	const hiddenAgenticWorkspacePath = join(projectRoot, DEFAULT_DIRECTORIES.HIDDEN_AGENTIC_WORKSPACE);
	const defaultAgenticWorkspaceExists = directoryExists(defaultAgenticWorkspacePath);
	const hiddenAgenticWorkspaceExists = directoryExists(hiddenAgenticWorkspacePath);
	const defaultConfigPath = defaultAgenticWorkspaceExists ? resolveFolderConfigPath(defaultAgenticWorkspacePath) : null;
	const hiddenConfigPath = hiddenAgenticWorkspaceExists ? resolveFolderConfigPath(hiddenAgenticWorkspacePath) : null;

	if (defaultConfigPath) {
		return {
			agenticWorkspaceDir: DEFAULT_DIRECTORIES.AGENTIC_WORKSPACE,
			agenticWorkspacePath: defaultAgenticWorkspacePath,
			source: AGENTIC_WORKSPACE_DIRECTORY_SOURCE.DEFAULT,
		};
	}

	if (hiddenConfigPath) {
		return {
			agenticWorkspaceDir: DEFAULT_DIRECTORIES.HIDDEN_AGENTIC_WORKSPACE,
			agenticWorkspacePath: hiddenAgenticWorkspacePath,
			source: AGENTIC_WORKSPACE_DIRECTORY_SOURCE.HIDDEN,
		};
	}

	if (defaultAgenticWorkspaceExists) {
		return {
			agenticWorkspaceDir: DEFAULT_DIRECTORIES.AGENTIC_WORKSPACE,
			agenticWorkspacePath: defaultAgenticWorkspacePath,
			source: AGENTIC_WORKSPACE_DIRECTORY_SOURCE.DEFAULT,
		};
	}

	if (hiddenAgenticWorkspaceExists) {
		return {
			agenticWorkspaceDir: DEFAULT_DIRECTORIES.HIDDEN_AGENTIC_WORKSPACE,
			agenticWorkspacePath: hiddenAgenticWorkspacePath,
			source: AGENTIC_WORKSPACE_DIRECTORY_SOURCE.HIDDEN,
		};
	}

	return null;
}

export function resolveAgenticWorkspaceDirectoryFromRootConfig(
	projectRoot: string,
	agenticWorkspaceDirectory: string | null | undefined,
): AgenticWorkspaceDirectoryResolution {
	const rootConfigPath = join(projectRoot, DEFAULT_FILES.ROOT_CONFIG);
	const configuredAgenticWorkspaceDir = normalizeProjectAgenticWorkspaceDirectory(agenticWorkspaceDirectory);
	if (configuredAgenticWorkspaceDir) {
		const configuredAgenticWorkspacePath = join(projectRoot, configuredAgenticWorkspaceDir);
		const configuredSource: AgenticWorkspaceDirectorySource =
			configuredAgenticWorkspaceDir === DEFAULT_DIRECTORIES.AGENTIC_WORKSPACE
				? AGENTIC_WORKSPACE_DIRECTORY_SOURCE.DEFAULT
				: configuredAgenticWorkspaceDir === DEFAULT_DIRECTORIES.HIDDEN_AGENTIC_WORKSPACE
					? AGENTIC_WORKSPACE_DIRECTORY_SOURCE.HIDDEN
					: AGENTIC_WORKSPACE_DIRECTORY_SOURCE.CUSTOM;
		return {
			projectRoot,
			agenticWorkspaceDir: configuredAgenticWorkspaceDir,
			agenticWorkspacePath: configuredAgenticWorkspacePath,
			source: configuredSource,
			configPath: rootConfigPath,
			configSource: AGENTIC_WORKSPACE_CONFIG_SOURCE.ROOT,
			rootConfigPath,
			rootConfigExists: true,
		};
	}

	const builtIn = resolveBuiltInAgenticWorkspaceDirectory(projectRoot);
	if (builtIn) {
		return {
			projectRoot,
			agenticWorkspaceDir: builtIn.agenticWorkspaceDir,
			agenticWorkspacePath: builtIn.agenticWorkspacePath,
			source: builtIn.source,
			configPath: rootConfigPath,
			configSource: AGENTIC_WORKSPACE_CONFIG_SOURCE.ROOT,
			rootConfigPath,
			rootConfigExists: true,
		};
	}

	return {
		projectRoot,
		agenticWorkspaceDir: null,
		agenticWorkspacePath: null,
		source: null,
		configPath: null,
		configSource: null,
		rootConfigPath,
		rootConfigExists: true,
	};
}

export function normalizeProjectAgenticWorkspaceDirectory(value: string | null | undefined): string | null {
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

export function resolveAgenticWorkspaceDirectory(projectRoot: string): AgenticWorkspaceDirectoryResolution {
	const rootConfigPath = join(projectRoot, DEFAULT_FILES.ROOT_CONFIG);
	const rootConfigExists = fileExists(rootConfigPath);

	if (rootConfigExists) {
		const metadata = readRootAgenticWorkspaceConfigMetadata(rootConfigPath);
		if (metadata) {
			return resolveAgenticWorkspaceDirectoryFromRootConfig(projectRoot, metadata.agenticWorkspaceDirectory);
		}
	}

	const builtIn = resolveBuiltInAgenticWorkspaceDirectory(projectRoot);
	if (!builtIn) {
		return {
			projectRoot,
			agenticWorkspaceDir: null,
			agenticWorkspacePath: null,
			source: null,
			configPath: null,
			configSource: null,
			rootConfigPath,
			rootConfigExists,
		};
	}

	const folderConfigPath = resolveFolderConfigPath(builtIn.agenticWorkspacePath);
	return {
		projectRoot,
		agenticWorkspaceDir: builtIn.agenticWorkspaceDir,
		agenticWorkspacePath: builtIn.agenticWorkspacePath,
		source: builtIn.source,
		configPath: folderConfigPath,
		configSource: folderConfigPath ? AGENTIC_WORKSPACE_CONFIG_SOURCE.FOLDER : null,
		rootConfigPath,
		rootConfigExists,
	};
}
