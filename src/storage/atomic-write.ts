import { randomUUID } from "node:crypto";
import { chmod, rename, unlink, writeFile } from "node:fs/promises";

export async function writeAtomically(filepath: string, content: string, label: string, mode?: number): Promise<void> {
	const temporaryPath = `${filepath}.${randomUUID()}.tmp`;
	try {
		await writeFile(temporaryPath, content, { flag: "wx" });
		if (mode !== undefined) await chmod(temporaryPath, mode);
		await rename(temporaryPath, filepath);
	} catch (error) {
		try {
			await unlink(temporaryPath);
		} catch (cleanupError) {
			if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT")
				throw new Error(`${label} write failed and temporary-file cleanup failed for ${temporaryPath}.`, {
					cause: new AggregateError([error, cleanupError]),
				});
		}
		throw error;
	}
}
