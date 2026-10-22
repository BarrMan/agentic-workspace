import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { DEFAULT_PRIORITIES } from "../model/constants.ts";
import { writeAtomically } from "./atomic-write.ts";
import { parseFrontmatter } from "./markdown/frontmatter.ts";

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
const manifestSchema = z.strictObject({
	version: z.literal(1),
	files: z.record(
		z.string(),
		z.strictObject({
			source: z.string().regex(/^[a-f0-9]{64}$/),
			target: z.string().regex(/^[a-f0-9]{64}$/),
		}),
	),
});
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
	const opening = /^\uFEFF?---[\t ]*\r?\n/.exec(content);
	if (!opening) return null;
	const body = parseFrontmatter(content).content;
	const prefix = content.slice(0, content.length - body.length);
	if (!/\n---[\t ]*(?:\r?\n)?$/.test(prefix)) return null;
	const start = opening[0].length;
	const end = prefix.lastIndexOf("---");
	if (end < start) return null;
	return { start, end, text: content.slice(start, end) };
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
	const lines = content.split(/(?<=\n)/);
	const kept: string[] = [];
	for (const line of lines) {
		const keyMatch = /^([\w-]+):\s*(.*?)(\r?\n)?$/.exec(line);
		if (!keyMatch) {
			kept.push(line);
			continue;
		}
		const [, key = "", raw, ending = ""] = keyMatch;
		if (keys.has(key)) continue;
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
	return rewritten;
}

/** Raw line edits are safe only for explicit, single-line top-level scalar nodes. */
function editableMapping(
	content: string,
	keys: readonly string[],
	path: string,
	issues: TaskConfigMigrationReport["issues"],
): Record<string, unknown> | null {
	let parsed: unknown;
	try {
		parsed = Bun.YAML.parse(content);
	} catch (error) {
		issues.push({ path, field: "yaml", value: "", reason: String(error) });
		return null;
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		issues.push({ path, field: "yaml", value: "", reason: "expected a top-level mapping" });
		return null;
	}
	for (const key of keys) {
		if (!Object.hasOwn(parsed, key)) continue;
		const matches = [...content.matchAll(new RegExp(`^${key}:[\\t ]*(.*?)(?:\\r?\\n|$)`, "gm"))];
		if (
			matches.length !== 1 ||
			!matches[0]?.[1] ||
			/^[|>&*!{[]/.test(matches[0][1]) ||
			JSON.stringify(parseYamlValue(matches[0][0], key)) !== JSON.stringify((parsed as Record<string, unknown>)[key])
		) {
			issues.push({
				path,
				field: key,
				value: "",
				reason: "ambiguous or non-single-line top-level field; file preserved",
			});
			return null;
		}
	}
	return parsed as Record<string, unknown>;
}

function migrateDateFormat(value: string): { value: string } | { reason: string } {
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
		manifest = manifestSchema.parse(JSON.parse(await readFile(options.manifestPath, "utf8")));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT")
			throw new Error(`Invalid migration manifest: ${options.manifestPath}`, { cause: error });
	}
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
			if (!editableMapping(source, ["default_assignee", "date_format"], path, report.issues)) continue;
			target = editYamlText(source, new Set(["default_assignee"]), undefined, path, report.issues);
			target = editDateConfig(target, path, report.issues);
		} else {
			let parsed: ReturnType<typeof frontmatter>;
			try {
				parsed = frontmatter(source);
			} catch (error) {
				report.issues.push({ path, field: "frontmatter", value: "", reason: String(error) });
				continue;
			}
			if (!parsed) {
				report.issues.push({ path, field: "frontmatter", value: "", reason: "missing task frontmatter" });
				continue;
			}
			const data = editableMapping(parsed.text, ["assignee", "priority"], path, report.issues);
			if (!data) continue;
			const labels = options.priorityLabelsByProject?.[String(data?.project ?? "")] ?? projectLabels;
			target =
				source.slice(0, parsed.start) +
				editYamlText(parsed.text, new Set(["assignee"]), labels, path, report.issues) +
				source.slice(parsed.end);
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
			const match = /^(date_format:[\t ]*)(.*?)(\r?\n)?$/.exec(line);
			if (!match) return line;
			const value = parseYamlValue(`date_format: ${match[2]}`, "date_format");
			if (typeof value !== "string") return line;
			const migrated = migrateDateFormat(value);
			if ("reason" in migrated) {
				issues.push({ path, field: "date_format", value, reason: migrated.reason });
				return line;
			}
			return `${match[1]}${JSON.stringify(migrated.value)}${match[3] ?? ""}`;
		})
		.join("");
}
