import type { McpServer } from "../../server.ts";
import type { McpToolHandler } from "../../types.ts";
import { createSimpleValidatedTool } from "../../validation/tool-wrapper.ts";

const taskId = { type: "string", minLength: 1, description: "Canonical task ID" };
const path = { type: "string", minLength: 1, description: "Task-relative artifact path" };
const listSchema = { type: "object", properties: { taskId }, required: ["taskId"], additionalProperties: false };
const pathSchema = {
	type: "object",
	properties: { taskId, path },
	required: ["taskId", "path"],
	additionalProperties: false,
};
const writeSchema = {
	type: "object",
	properties: {
		taskId,
		path,
		content: { type: "string", description: "Artifact content (UTF-8 text or base64 according to encoding)" },
		encoding: { type: "string", enum: ["utf8", "base64"], default: "utf8" },
	},
	required: ["taskId", "path", "content"],
	additionalProperties: false,
};

function result(value: unknown) {
	return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

export function registerTaskArtifactTools(server: McpServer): void {
	const list: McpToolHandler = createSimpleValidatedTool(
		{
			name: "task_artifact_list",
			description: "List a task's generic artifacts with canonical paths and effective Draft/Approved/Missing status.",
			inputSchema: listSchema,
			annotations: { title: "List Task Artifacts", readOnlyHint: true, destructiveHint: false },
		},
		listSchema,
		async ({ taskId: id }) => {
			const core = server.createOperationCore();
			const artifacts = await core.filesystem.taskArtifacts.list(String(id));
			const entries = await Promise.all(
				artifacts.map(async (artifact) => ({
					...artifact,
					canonicalPath: await core.filesystem.taskArtifacts.resolve(String(id), artifact.path),
				})),
			);
			return result(entries);
		},
	);
	const read: McpToolHandler = createSimpleValidatedTool(
		{
			name: "task_artifact_read",
			description: "Read an artifact's current bytes and effective approval state; content is UTF-8 or base64.",
			inputSchema: pathSchema,
			annotations: { title: "Read Task Artifact", readOnlyHint: true, destructiveHint: false },
		},
		pathSchema,
		async ({ taskId: id, path: artifactPath }) => {
			const core = server.createOperationCore();
			const entry = await core.filesystem.taskArtifacts.read(String(id), String(artifactPath));
			const text = (() => {
				try {
					return { encoding: "utf8", content: new TextDecoder("utf-8", { fatal: true }).decode(entry.bytes) };
				} catch {
					return { encoding: "base64", content: Buffer.from(entry.bytes).toString("base64") };
				}
			})();
			return result({
				...entry.status,
				canonicalPath: await core.filesystem.taskArtifacts.resolve(String(id), String(artifactPath)),
				...text,
			});
		},
	);
	const write: McpToolHandler = createSimpleValidatedTool(
		{
			name: "task_artifact_write",
			description:
				"Write a generic task artifact. Changed bytes invalidate prior approval; agents cannot approve or revoke artifacts.",
			inputSchema: writeSchema,
			annotations: { title: "Write Task Artifact", destructiveHint: false },
		},
		writeSchema,
		async ({ taskId: id, path: artifactPath, content, encoding }) => {
			const core = server.createOperationCore();
			const bytes =
				encoding === "base64" ? Buffer.from(String(content), "base64") : Buffer.from(String(content), "utf8");
			const status = await core.filesystem.taskArtifacts.write(String(id), String(artifactPath), bytes);
			return result({
				...status,
				canonicalPath: await core.filesystem.taskArtifacts.resolve(String(id), String(artifactPath)),
			});
		},
	);
	const status: McpToolHandler = createSimpleValidatedTool(
		{
			name: "task_artifact_status",
			description: "Return the effective Missing/Draft/Approved state for a task artifact without changing files.",
			inputSchema: pathSchema,
			annotations: { title: "Task Artifact Status", readOnlyHint: true, destructiveHint: false },
		},
		pathSchema,
		async ({ taskId: id, path: artifactPath }) => {
			const core = server.createOperationCore();
			const artifactStatus = await core.filesystem.taskArtifacts.status(String(id), String(artifactPath));
			return result({
				...artifactStatus,
				canonicalPath: await core.filesystem.taskArtifacts.resolve(String(id), String(artifactPath)),
			});
		},
	);
	server.addTool(list);
	server.addTool(read);
	server.addTool(write);
	server.addTool(status);
}
