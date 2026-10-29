import type { OptionValues } from "commander";
import { parsePositiveIntegerOption } from "../../list-window.ts";

export type TaskListRequest = {
	limit?: number;
};

export function parseTaskListRequest(options: OptionValues): TaskListRequest | null {
	let limit: number | undefined;
	if (options.limit !== undefined) {
		const parsedLimit = parsePositiveIntegerOption(options.limit, "--limit", "agentic-workspace task list --help");
		if (parsedLimit === null) return null;
		limit = parsedLimit;
	}
	return { limit };
}
