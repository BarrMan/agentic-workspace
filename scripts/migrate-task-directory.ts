import { lstat, rename } from "node:fs/promises";
import { resolve } from "node:path";

const [target, ...extra] = process.argv.slice(2);
if (!target || extra.length || target.startsWith("-")) {
	console.error("Usage: bun scripts/migrate-task-directory.ts <project directory>");
	console.error("Stop the application first; do not run while another process can change the project directory.");
	process.exitCode = 1;
} else {
	try {
		const root = resolve(target);
		const source = resolve(root, "agentic-workspace");
		const destination = resolve(root, ".agentic-workspace");
		const rootInfo = await lstat(root);
		if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink())
			throw new Error(`Project target is not a directory: ${root}`);
		const sourceInfo = await lstat(source);
		if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink()) {
			throw new Error(`Migration source is not a real directory: ${source}`);
		}
		try {
			await lstat(destination);
			throw new Error(`Migration destination already exists; refusing to overwrite or merge: ${destination}`);
		} catch (error) {
			if (error instanceof Error && "code" in error && error.code === "ENOENT") {
				// Only an absent destination is eligible for the move.
			} else {
				throw error;
			}
		}
		// shortcut: rename has no no-replace flag; run offline with no concurrent directory changes.
		await rename(source, destination);
		console.log(`Moved ${source} to ${destination}`);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
