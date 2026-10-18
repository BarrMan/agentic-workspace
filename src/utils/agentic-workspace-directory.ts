import { readFileSync, statSync } from "node:fs";
import { join, normalize } from "node:path";
import { DEFAULT_DIRECTORIES, DEFAULT_FILES } from "../constants/index.ts";

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
	const parsed: unknown = Bun.YAML.parse(content);
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return { projectName: null, agenticWorkspaceDirectory: null };
	}
	const record = parsed as Record<string, unknown>;
	const projectName = typeof record.project_name === "string" ? record.project_name : null;
	const directory = typeof record.agentic_workspace_directory === "string" ? record.agentic_workspace_directory : null;
	return {
		projectName,
		agenticWorkspaceDirectory: normalizeProjectAgenticWorkspaceDirectory(directory),
	};
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
	configPath: string | null;
	source: Extract<AgenticWorkspaceDirectorySource, "agentic-workspace" | ".agentic-workspace">;
} | null {
	const candidates = [
		{ name: DEFAULT_DIRECTORIES.AGENTIC_WORKSPACE, source: AGENTIC_WORKSPACE_DIRECTORY_SOURCE.DEFAULT },
		{ name: DEFAULT_DIRECTORIES.HIDDEN_AGENTIC_WORKSPACE, source: AGENTIC_WORKSPACE_DIRECTORY_SOURCE.HIDDEN },
	].map(({ name, source }) => {
		const agenticWorkspacePath = join(projectRoot, name);
		const exists = directoryExists(agenticWorkspacePath);
		return {
			agenticWorkspaceDir: name,
			agenticWorkspacePath,
			configPath: exists ? resolveFolderConfigPath(agenticWorkspacePath) : null,
			exists,
			source,
		};
	});
	return candidates.find(({ configPath }) => configPath) ?? candidates.find(({ exists }) => exists) ?? null;
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

	return {
		projectRoot,
		agenticWorkspaceDir: builtIn.agenticWorkspaceDir,
		agenticWorkspacePath: builtIn.agenticWorkspacePath,
		source: builtIn.source,
		configPath: builtIn.configPath,
		configSource: builtIn.configPath ? AGENTIC_WORKSPACE_CONFIG_SOURCE.FOLDER : null,
		rootConfigPath,
		rootConfigExists,
	};
}
