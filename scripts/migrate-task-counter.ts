import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { FileSystem } from "../src/storage/file-system.ts";

const [target, ...extra] = process.argv.slice(2);
if (!target || extra.length || target.startsWith("-")) {
	console.error("Usage: bun scripts/migrate-task-counter.ts <project target>");
	process.exitCode = 1;
} else {
	try {
		const root = resolve(target);
		if (!(await stat(root)).isDirectory()) throw new Error(`Project target is not a directory: ${root}`);
		const filesystem = new FileSystem(root);
		filesystem.freezeResolution();
		console.log(JSON.stringify(await filesystem.convertTaskCounterToLastAllocated(), null, 2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
