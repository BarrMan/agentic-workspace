import type { TaskDetail } from "../../core/task-detail.ts";
import { formatTaskPlainText } from "../../formatters/task-plain-text.ts";
import type { CallToolResult } from "../types.ts";

/** Every MCP task result renders through the one plain serializer, so they all read the same. */
export async function formatTaskCallResult(
	task: TaskDetail,
	_summaryLines: string[] = [],
	options: Parameters<typeof formatTaskPlainText>[1] = {},
): Promise<CallToolResult> {
	const text = formatTaskPlainText(task, options);

	return {
		content: [
			{
				type: "text",
				text,
			},
		],
	};
}
