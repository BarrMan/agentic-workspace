import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { DEFAULT_DIRECTORIES, DEFAULT_FILES } from "../../model/constants.ts";

export const AGENTIC_WORKSPACE_DIRECTORY_SOURCE = {
	DEFAULT: ".agentic-workspace",
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

function containedByProject(projectRoot: string, path: string): boolean {
	try {
		const root = canonicalPath(resolve(projectRoot));
		let ancestor = resolve(path);
		const missing: string[] = [];
		while (true) {
			try {
				ancestor = realpathSync(ancestor);
				break;
			} catch {
				const parent = dirname(ancestor);
				if (parent === ancestor) return false;
				missing.unshift(ancestor.slice(parent.length + (parent.endsWith(sep) ? 0 : 1)));
				ancestor = parent;
			}
		}
		const resolved = join(ancestor, ...missing);
		const fromRoot = relative(root, resolved);
		return fromRoot === "" || (!isAbsolute(fromRoot) && fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`));
	} catch {
		return false;
	}
}

function canonicalPath(path: string): string {
	try {
		return realpathSync(path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		return join(canonicalPath(dirname(path)), basename(path));
	}
}

function taskDataPath(projectRoot: string, directory: string): string {
	const root = canonicalPath(resolve(projectRoot));
	// The application user-data base selects a project-specific store, as fixed by ADR-0002.
	if ((directory === "user:" || directory.startsWith("~/")) && directoryExists(resolve(root, directory)))
		throw new Error(
			`Existing literal task-data path ${resolve(root, directory)} requires an explicit absolute location; no data was moved.`,
		);
	const selected =
		directory === "user:"
			? join(homedir(), ".agentic-workspace", createHash("sha256").update(root).digest("hex").slice(0, 16))
			: directory.startsWith("~/")
				? join(homedir(), directory.slice(2))
				: resolve(root, directory);
	const target = canonicalPath(selected);
	const metadata = [join(root, ".git")];
	try {
		metadata.push(
			...execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"], {
				cwd: root,
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			})
				.trim()
				.split("\n"),
		);
	} catch (error) {
		if (fileExists(join(root, ".git")) || directoryExists(join(root, ".git")))
			throw new Error(`Cannot resolve Git metadata at ${root}; refusing to select task storage.`, { cause: error });
		// Non-Git projects still exclude a prospective .git directory.
	}
	if (
		metadata.some((path) => {
			const rel = relative(canonicalPath(path), target);
			return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
		}) ||
		target.split(sep).includes(".git")
	)
		throw new Error(`Task-data location ${selected} resolves inside Git metadata; no data was moved.`);
	return target;
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
		agenticWorkspaceDirectory: directory,
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
	if (fileExists(primary) && containedByProject(dirname(agenticWorkspacePath), primary)) {
		return primary;
	}
	const alternate = join(agenticWorkspacePath, DEFAULT_FILES.CONFIG_YAML);
	return fileExists(alternate) && containedByProject(dirname(agenticWorkspacePath), alternate) ? alternate : null;
}

function resolveBuiltInAgenticWorkspaceDirectory(projectRoot: string): {
	agenticWorkspaceDir: string;
	agenticWorkspacePath: string;
	configPath: string | null;
	source: Extract<AgenticWorkspaceDirectorySource, "agentic-workspace" | ".agentic-workspace">;
} | null {
	const oldPath = join(projectRoot, "agentic-workspace");
	if (directoryExists(oldPath))
		throw new Error(
			`Existing task-data directory at ${oldPath} requires an explicit location decision; no data was moved. Select it explicitly or authorize relocation to .agentic-workspace.`,
		);
	const name = DEFAULT_DIRECTORIES.AGENTIC_WORKSPACE;
	const agenticWorkspacePath = taskDataPath(projectRoot, name);
	return directoryExists(agenticWorkspacePath)
		? {
				agenticWorkspaceDir: name,
				agenticWorkspacePath,
				configPath: resolveFolderConfigPath(agenticWorkspacePath),
				source: AGENTIC_WORKSPACE_DIRECTORY_SOURCE.DEFAULT,
			}
		: null;
}

export function resolveAgenticWorkspaceDirectoryFromRootConfig(
	projectRoot: string,
	agenticWorkspaceDirectory: string | null | undefined,
): AgenticWorkspaceDirectoryResolution {
	const rootConfigPath = join(projectRoot, DEFAULT_FILES.ROOT_CONFIG);
	if (!containedByProject(projectRoot, rootConfigPath)) {
		return {
			projectRoot,
			agenticWorkspaceDir: null,
			agenticWorkspacePath: null,
			source: null,
			configPath: null,
			configSource: null,
			rootConfigPath,
			rootConfigExists: false,
		};
	}
	const configuredAgenticWorkspaceDir = normalizeProjectAgenticWorkspaceDirectory(agenticWorkspaceDirectory);
	if (agenticWorkspaceDirectory != null && !configuredAgenticWorkspaceDir)
		throw new Error(`Invalid task-data location ${JSON.stringify(agenticWorkspaceDirectory)}; no data was moved.`);
	if (configuredAgenticWorkspaceDir) {
		const configuredAgenticWorkspacePath = taskDataPath(projectRoot, configuredAgenticWorkspaceDir);
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
		agenticWorkspaceDir: DEFAULT_DIRECTORIES.AGENTIC_WORKSPACE,
		agenticWorkspacePath: taskDataPath(projectRoot, DEFAULT_DIRECTORIES.AGENTIC_WORKSPACE),
		source: AGENTIC_WORKSPACE_DIRECTORY_SOURCE.DEFAULT,
		configPath: rootConfigPath,
		configSource: AGENTIC_WORKSPACE_CONFIG_SOURCE.ROOT,
		rootConfigPath,
		rootConfigExists: true,
	};
}

export function normalizeProjectAgenticWorkspaceDirectory(value: string | null | undefined): string | null {
	const trimmed = value?.trim();
	if (!trimmed) {
		return null;
	}
	const slashNormalized = trimmed.replaceAll("\\", "/");
	const normalized = slashNormalized.replace(/\/+$/g, "");
	if (!normalized || normalized === "." || normalized.includes("\0") || normalized.split("/").includes(".git")) {
		return null;
	}
	return normalized;
}

export function resolveAgenticWorkspaceDirectory(projectRoot: string): AgenticWorkspaceDirectoryResolution {
	const rootConfigPath = join(projectRoot, DEFAULT_FILES.ROOT_CONFIG);
	if (!containedByProject(projectRoot, rootConfigPath)) {
		return {
			projectRoot,
			agenticWorkspaceDir: null,
			agenticWorkspacePath: null,
			source: null,
			configPath: null,
			configSource: null,
			rootConfigPath,
			rootConfigExists: false,
		};
	}
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
