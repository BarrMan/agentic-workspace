import { resolve } from "node:path";
import { FileSystem } from "../src/storage/file-system.ts";
import { Storage } from "../src/storage/storage.ts";

const [target, ...extra] = process.argv.slice(2);
if (!target || extra.length || target.startsWith("-")) {
	console.error("Usage: bun scripts/migrate-task-config.ts <project target>");
	process.exitCode = 1;
} else {
	try {
		const storage = new Storage(new FileSystem(resolve(target)));
		try {
			const report = await storage.migrateTaskAndConfig();
			console.log(JSON.stringify({ ...report, unresolvedValues: report.issues, partialFailures: [] }, null, 2));
		} catch (error) {
			const report = (
				error as Error & {
					report?: { migratedFiles: string[]; skippedFiles: string[]; issues: unknown[]; partialCompletion?: unknown };
				}
			).report;
			if (report)
				console.error(
					JSON.stringify(
						{
							...report,
							unresolvedValues: report.issues,
							partialFailures: report.partialCompletion
								? [report.partialCompletion]
								: [error instanceof Error ? error.message : String(error)],
						},
						null,
						2,
					),
				);
			else console.error(error instanceof Error ? error.message : String(error));
			process.exitCode = 1;
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
