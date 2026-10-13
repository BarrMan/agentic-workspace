import { DRAFT_PREFIX, normalizeId } from "../utils/prefix-config.ts";

export async function runDraftTransition(
	taskId: string,
	verb: "Archived" | "Promoted",
	action: (id: string) => Promise<boolean>,
): Promise<void> {
	try {
		// The argument selects the draft filename, so never resolve it through frontmatter first.
		if (await action(taskId)) {
			console.log(`${verb} draft ${normalizeId(taskId, DRAFT_PREFIX)}`);
			return;
		}
		console.error(`Draft ${taskId} not found.`);
		process.exitCode = 1;
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
