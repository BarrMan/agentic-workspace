import { randomBytes } from "node:crypto";
import type { Stats } from "node:fs";
import { lstat, readdir, readFile, realpath, rm, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { sessionActivityDir } from "./status-hooks.ts";

const MARKER = ".agentic-workspace-launch-owner";
type OwnedDirectory = {
	readonly path: string;
	readonly dev: number;
	readonly ino: number;
	readonly uid: number;
	readonly marker: string;
};
export type PreparedLaunchResources = { readonly skill: OwnedDirectory; readonly activity?: OwnedDirectory };

/** Captured by preparation, never inferred from a caller-supplied deletion path. */
export async function preparedLaunchResources(skill: string, activity?: string): Promise<PreparedLaunchResources> {
	async function capture(path: string): Promise<OwnedDirectory> {
		if (!(await lstat(path)).isDirectory()) throw new Error("Prepared resource is not an owned directory.");
		const canonical = await realpath(path);
		const info = await lstat(canonical);
		if (!info.isDirectory()) throw new Error("Prepared resource is not a directory.");
		const marker = randomBytes(32).toString("hex");
		await writeFile(join(canonical, MARKER), marker, { mode: 0o600 });
		return { path: canonical, dev: info.dev, ino: info.ino, uid: info.uid, marker };
	}
	return { skill: await capture(skill), ...(activity ? { activity: await capture(activity) } : {}) };
}

/** Validate every resource before deleting any; an absent shell-trap-cleaned directory is safe. */
export async function cleanupPreparedLaunchResources(
	resources: PreparedLaunchResources,
	context: { rootPath: string; stateRoot?: string; outputPath: string; sessionId: string },
	verifyOnly = false,
): Promise<void> {
	const tempRoot = await realpath(tmpdir());
	const taskRoot = await realpath(dirname(context.outputPath));
	const projectRoot = await realpath(context.stateRoot ?? context.rootPath);
	if (basename(context.sessionId) !== context.sessionId || context.sessionId === "." || context.sessionId === "..")
		throw new Error("Invalid resource session identity.");
	const taskRelative = relative(projectRoot, taskRoot);
	if (taskRelative === ".." || taskRelative.startsWith("../"))
		throw new Error("Resource task container escapes project.");
	const expectedActivity = sessionActivityDir(taskRoot, context.sessionId);
	const validated: OwnedDirectory[] = [];
	for (const [kind, resource] of [
		["skill", resources.skill],
		["activity", resources.activity],
	] as const) {
		if (!resource) {
			if (kind === "skill") throw new Error("Missing prepared skill resource.");
			continue;
		}
		if (
			typeof resource.path !== "string" ||
			!Number.isSafeInteger(resource.dev) ||
			!Number.isSafeInteger(resource.ino) ||
			!Number.isSafeInteger(resource.uid) ||
			typeof resource.marker !== "string"
		)
			throw new Error("Invalid prepared resource manifest.");
		if (
			kind === "skill"
				? dirname(resource.path) !== tempRoot || !basename(resource.path).startsWith("agentic-workspace-agent-skill-")
				: resource.path !== expectedActivity
		)
			throw new Error("Prepared resource containment does not match.");
		if (!/^[a-f0-9]{64}$/.test(resource.marker)) throw new Error("Invalid prepared resource marker.");
		let info: Stats;
		try {
			info = await lstat(resource.path);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
			throw error;
		}
		if (
			!info.isDirectory() ||
			info.dev !== resource.dev ||
			info.ino !== resource.ino ||
			info.uid !== resource.uid ||
			(process.getuid && info.uid !== process.getuid()) ||
			(await realpath(resource.path)) !== resource.path
		)
			throw new Error("Prepared resource identity changed.");
		const markerPath = join(resource.path, MARKER);
		const markerInfo = await lstat(markerPath);
		if (
			!markerInfo.isFile() ||
			(process.getuid && markerInfo.uid !== process.getuid()) ||
			(await readFile(markerPath, "utf8")) !== resource.marker
		)
			throw new Error("Prepared resource ownership marker changed.");
		validated.push(resource);
	}
	if (!verifyOnly) {
		for (const resource of validated) {
			const markerPath = join(resource.path, MARKER);
			for (const name of await readdir(resource.path)) {
				if (name !== MARKER) await rm(join(resource.path, name), { recursive: true });
			}
			await unlink(markerPath);
			try {
				await rmdir(resource.path);
			} catch (error) {
				try {
					const info = await lstat(resource.path);
					if (
						info.isDirectory() &&
						info.dev === resource.dev &&
						info.ino === resource.ino &&
						info.uid === resource.uid &&
						(await realpath(resource.path)) === resource.path
					)
						await writeFile(markerPath, resource.marker, { mode: 0o600, flag: "wx" });
				} catch {
					// Preserve the original removal error; never mark a replacement directory as ours.
				}
				throw error;
			}
		}
	}
}
