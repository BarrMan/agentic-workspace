import { mkdir, stat } from "node:fs/promises";

/** Owns filesystem layout creation while callers retain their public path accessors. */
export class ProjectLayout {
	async ensureDirectories(directories: readonly string[]): Promise<void> {
		for (const directory of directories) {
			try {
				await mkdir(directory, { recursive: true });
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
				if (!(await stat(directory)).isDirectory()) throw error;
			}
		}
	}
}
