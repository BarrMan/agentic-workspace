import { basename } from "node:path";
import type { Core } from "../index.ts";

function numericIdBody(value: string, prefix: string): string | null {
	const prefixWithSeparator = `${prefix}-`;
	if (!value.toLowerCase().startsWith(prefixWithSeparator.toLowerCase())) return null;
	const body = value.substring(prefixWithSeparator.length);
	return /^\d+$/.test(body) ? body : null;
}

function numericIdFromFilename(file: string, prefix: string): string | null {
	const filename = basename(file);
	if (!filename.endsWith(".md")) return null;
	const stem = filename.substring(0, filename.length - ".md".length);
	const separator = stem.indexOf(" - ");
	return numericIdBody(separator === -1 ? stem : stem.substring(0, separator), prefix);
}

async function collectBranchIds(
	core: Core,
	directory: string,
	prefix: string,
	resourceName: string,
	remoteOperations: boolean | undefined,
): Promise<string[]> {
	try {
		if (remoteOperations === false) {
			if (process.env.DEBUG) {
				console.log(`Remote operations disabled - generating ID from local ${directory} only`);
			}
		} else {
			await core.git.fetch();
		}

		const backlogDir = core.filesystem.backlogDirName;
		const branches = await core.git.listAllBranches();
		const results = await Promise.all(
			branches.map(async (branch) => {
				const files = await core.git.listFilesInTree(branch, `${backlogDir}/${directory}`);
				return files
					.map((file) => numericIdFromFilename(file, prefix))
					.filter((id): id is string => id !== null)
					.map((id) => `${prefix}-${id}`);
			}),
		);
		return results.flat();
	} catch (error) {
		if (process.env.DEBUG) {
			console.error(`Could not fetch remote ${resourceName} IDs:`, error);
		}
		return [];
	}
}

function nextId(ids: readonly string[], prefix: string, padding: unknown): string {
	let max = 0;
	for (const id of ids) {
		const body = numericIdBody(id, prefix);
		if (body !== null) max = Math.max(max, Number.parseInt(body, 10));
	}
	const next = max + 1;
	return `${prefix}-${typeof padding === "number" && padding > 0 ? String(next).padStart(padding, "0") : next}`;
}

/**
 * Generate the next available document ID by checking all branches and local documents
 * @param core Core instance for filesystem and git operations
 * @returns Promise<string> Next available document ID (e.g., "doc-001")
 */
export async function generateNextDocId(core: Core): Promise<string> {
	const config = await core.filesystem.loadConfig();
	const docs = await core.filesystem.listDocuments();
	return nextId(
		[
			...(await collectBranchIds(core, "docs", "doc", "document", config?.remoteOperations)),
			...docs.map((doc) => doc.id),
		],
		"doc",
		config?.zeroPaddedIds,
	);
}

/**
 * Generate the next available decision ID by checking all branches and local decisions
 * @param core Core instance for filesystem and git operations
 * @returns Promise<string> Next available decision ID (e.g., "decision-001")
 */
export async function generateNextDecisionId(core: Core): Promise<string> {
	const config = await core.filesystem.loadConfig();
	const decisions = await core.filesystem.listDecisions();
	return nextId(
		[
			...(await collectBranchIds(core, "decisions", "decision", "decision", config?.remoteOperations)),
			...decisions.map((decision) => decision.id),
		],
		"decision",
		config?.zeroPaddedIds,
	);
}
