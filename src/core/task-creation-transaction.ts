import { readdir, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface CreatedTaskWrite {
	filePath: string;
	createdContent: Buffer;
	previousPath: string | null;
	previousContent: Buffer | null;
}

export interface CreatedTaskRollbackResult {
	workingPathRestored: boolean;
}

export async function readFileIfPresent(filePath: string | null): Promise<Buffer | null> {
	if (!filePath) return null;
	try {
		return await readFile(filePath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}

async function restoreCreatedPath(write: CreatedTaskWrite): Promise<boolean> {
	const currentContent = await readFileIfPresent(write.filePath);
	if (currentContent === null) {
		if (write.previousPath !== write.filePath || !write.previousContent) return true;
		try {
			await writeFile(write.filePath, write.previousContent, { flag: "wx" });
			return true;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
			throw error;
		}
	}
	if (!currentContent.equals(write.createdContent)) return false;
	await unlink(write.filePath);
	// A newly-created task container belongs to the transaction only when it is still empty.
	// Sidecars and other user artifacts make it non-empty, so preserve it in that case.
	const containerPath = dirname(write.filePath);
	try {
		if ((await readdir(containerPath)).length === 0) await rmdir(containerPath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT" && (error as NodeJS.ErrnoException).code !== "ENOTEMPTY")
			throw error;
	}
	return true;
}

export async function rollbackCreatedTask(write: CreatedTaskWrite): Promise<CreatedTaskRollbackResult> {
	const workingPathRestored = await restoreCreatedPath(write);
	return { workingPathRestored };
}
