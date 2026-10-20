import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DEFAULT_PRIORITIES } from "../model/constants.ts";
import { writeAtomically } from "./atomic-write.ts";

export interface TaskConfigMigrationOptions {
	rootConfigPath: string;
	projectConfigPath: string;
	tasksDirectories: readonly [string, string, string];
	manifestPath: string;
	priorityLabelsByProject?: Readonly<Record<string, readonly string[]>>;
}

export interface TaskConfigMigrationReport {
	migratedFiles: string[];
	skippedFiles: string[];
	issues: Array<{ path: string; field: string; value: string; reason: string }>;
	partialCompletion?: { completedFiles: string[]; failedPath: string };
}

class TaskConfigMigrationError extends Error {
	constructor(
		message: string,
		readonly report: TaskConfigMigrationReport,
		options?: ErrorOptions,
	) {
		super(message, options);
		this.name = "TaskConfigMigrationError";
	}
}

interface Manifest {
	version: 1;
	files: Record<string, { source: string; target: string }>;
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const LEGACY_DATE_FORMATS = new Map([
	["yyyy-mm-dd", "yyyy-MM-dd"],
	["yyyy/mm/dd", "yyyy/MM/dd"],
	["dd-mm-yyyy", "dd-MM-yyyy"],
	["dd/mm/yyyy", "dd/MM/yyyy"],
	["mm-dd-yyyy", "MM-dd-yyyy"],
	["mm/dd/yyyy", "MM/dd/yyyy"],
]);

function frontmatter(content: string): { start: number; end: number; text: string } | null {
	const match = /^(\uFEFF?---[^\r\n]*\r?\n)([\s\S]*?)(^---\s*(?:\r?\n|$))/m.exec(content);
	return match?.[2] === undefined
		? null
		: { start: match.index + match[1]!.length, end: match.index + match[0].length - match[3]!.length, text: match[2] };
}

function parseYamlValue(content: string, key: string): unknown {
	try {
		return (Bun.YAML.parse(content) as Record<string, unknown> | null)?.[key];
	} catch {
		return undefined;
	}
}

function editYamlText(
	content: string,
	keys: Set<string>,
	priorityLabels?: readonly string[],
	path = "",
	issues: TaskConfigMigrationReport["issues"] = [],
): string {
	const fm = frontmatter(content);
	const regionStart = fm?.start ?? 0;
	const regionEnd = fm?.end ?? content.length;
	const block = content.slice(regionStart, regionEnd);
	const lines = block.split(/(?<=\n)/);
	const kept: string[] = [];
	for (const line of lines) {
		const keyMatch = /^([\w-]+):\s*(.*?)(\r?\n)?$/.exec(line);
		if (!keyMatch) {
			kept.push(line);
			continue;
		}
		const [, key, raw, ending = ""] = keyMatch;
		if (keys.has(key!)) continue;
		if (key === "priority" && priorityLabels) {
			let value: unknown;
			value = parseYamlValue(`priority: ${raw}`, "priority");
			if (typeof value === "string") {
				const found = priorityLabels.filter(
					(label) =>
						label.trim().replace(/\s+/g, " ").toLowerCase() === value.trim().replace(/\s+/g, " ").toLowerCase(),
				);
				if (found.length === 1) kept.push(`priority: ${JSON.stringify(found[0])}${ending}`);
				else {
					if (found.length > 1 || !priorityLabels.some((label) => label === value))
						issues.push({
							path,
							field: "priority",
							value,
							reason: found.length > 1 ? "ambiguous configured label" : "unmatched label",
						});
					kept.push(line);
				}
			} else kept.push(line);
			continue;
		}
		kept.push(line);
	}
	const rewritten = kept.join("");
	return content.slice(0, regionStart) + rewritten + content.slice(regionEnd);
}

function migrateDateFormat(value: string): { value?: string; reason?: string } {
	const migrated = LEGACY_DATE_FORMATS.get(value);
	return migrated === undefined ? { reason: "unsupported or ambiguous legacy date format" } : { value: migrated };
}

async function taskFiles(directory: string): Promise<string[]> {
	try {
		const entries = await readdir(directory, { withFileTypes: true });
		const paths: string[] = [];
		for (const entry of entries)
			if (entry.isDirectory()) {
				const path = join(directory, entry.name, "task.md");
				try {
					if ((await stat(path)).isFile()) paths.push(path);
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
				}
			}
		return paths;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
}

export async function migrateTaskAndConfigFiles(
	options: TaskConfigMigrationOptions,
): Promise<TaskConfigMigrationReport> {
	const report: TaskConfigMigrationReport = { migratedFiles: [], skippedFiles: [], issues: [] };
	const configPaths = [options.rootConfigPath, options.projectConfigPath];
	const paths = [...new Set([...configPaths, ...(await Promise.all(options.tasksDirectories.map(taskFiles))).flat()])];
	let manifest: Manifest = { version: 1, files: {} };
	try {
		manifest = JSON.parse(await readFile(options.manifestPath, "utf8")) as Manifest;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT")
			throw new Error(`Invalid migration manifest: ${options.manifestPath}`, { cause: error });
	}
	if (manifest.version !== 1 || !manifest.files)
		throw new Error(`Unsupported migration manifest: ${options.manifestPath}`);
	let projectLabels: readonly string[] = DEFAULT_PRIORITIES;
	try {
		const config = Bun.YAML.parse(await readFile(options.projectConfigPath, "utf8")) as Record<string, unknown> | null;
		if (
			Array.isArray(config?.priorities) &&
			config.priorities.length &&
			config.priorities.every((value) => typeof value === "string")
		)
			projectLabels = config.priorities;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT")
			throw new Error(`Cannot preflight ${options.projectConfigPath}`, { cause: error });
	}
	const plans: Array<{ path: string; source: string; target: string }> = [];
	for (const path of paths) {
		let source: string;
		try {
			source = await readFile(path, "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
			throw error;
		}
		const recorded = manifest.files[path];
		if (recorded) {
			if (hash(source) === recorded.target) {
				report.skippedFiles.push(path);
				continue;
			}
			if (hash(source) !== recorded.source) throw new Error(`Migration source changed after preflight: ${path}`);
		}
		let target: string;
		if (configPaths.includes(path)) {
			let parsed: any;
			try {
				parsed = Bun.YAML.parse(source);
			} catch (error) {
				throw new Error(`Cannot preflight ${path}`, { cause: error });
			}
			const labels =
				Array.isArray(parsed?.priorities) && parsed.priorities.length ? parsed.priorities : DEFAULT_PRIORITIES;
			target = editYamlText(source, new Set(["default_assignee"]), undefined, path, report.issues);
			// Config format token conversion uses the same raw-preserving editor; priority labels are project-owned.
			if (path === options.projectConfigPath) {
				for (const [project, values] of Object.entries(options.priorityLabelsByProject ?? {}))
					if (!Array.isArray(values) || !project) throw new Error("Invalid priority label mapping");
				void labels;
			}
			target = editDateConfig(target, path, report.issues);
		} else {
			const parsed = frontmatter(source);
			if (!parsed) {
				report.issues.push({ path, field: "frontmatter", value: "", reason: "missing task frontmatter" });
				continue;
			}
			let data: any;
			try {
				data = Bun.YAML.parse(parsed.text);
			} catch (error) {
				throw new Error(`Cannot preflight ${path}`, { cause: error });
			}
			const labels = options.priorityLabelsByProject?.[String(data?.project ?? "")] ?? projectLabels;
			target = editYamlText(source, new Set(["assignee"]), labels, path, report.issues);
		}
		if (target !== source) plans.push({ path, source, target });
		else report.skippedFiles.push(path);
	}
	// Persist intent first so a crash between file replacements can be resumed by exact hashes.
	if (plans.length === 0) return report;
	await mkdir(dirname(options.manifestPath), { recursive: true });
	for (const plan of plans) manifest.files[plan.path] = { source: hash(plan.source), target: hash(plan.target) };
	await writeAtomically(options.manifestPath, JSON.stringify(manifest, null, 2), "Migration manifest", 0o600);
	for (const plan of plans) {
		try {
			if (hash(await readFile(plan.path, "utf8")) !== hash(plan.source))
				throw new Error("source changed after preflight");
			await writeAtomically(plan.path, plan.target, "Task/config migration", (await stat(plan.path)).mode & 0o777);
			report.migratedFiles.push(plan.path);
		} catch (error) {
			report.partialCompletion = { completedFiles: [...report.migratedFiles], failedPath: plan.path };
			throw new TaskConfigMigrationError(
				`Task/config migration partially completed (${report.migratedFiles.length} files); failed at ${plan.path}`,
				report,
				{ cause: error },
			);
		}
	}
	return report;
}

function editDateConfig(content: string, path: string, issues: TaskConfigMigrationReport["issues"]): string {
	const lines = content.split(/(?<=\n)/);
	return lines
		.map((line) => {
			const match = /^(\s*date_format:\s*)(.*?)(\r?\n)?$/.exec(line);
			if (!match) return line;
			const value = parseYamlValue(`date_format: ${match[2]}`, "date_format");
			if (typeof value !== "string") return line;
			const migrated = migrateDateFormat(value);
			if (migrated.value === undefined) {
				issues.push({ path, field: "date_format", value, reason: migrated.reason! });
				return line;
			}
			return `${match[1]}${JSON.stringify(migrated.value)}${match[3] ?? ""}`;
		})
		.join("");
}
