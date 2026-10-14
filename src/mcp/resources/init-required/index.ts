import { MCP_INIT_REQUIRED_GUIDE } from "../../../guidelines/mcp/index.ts";
import type { McpServer } from "../../server.ts";
import type { McpResourceHandler } from "../../types.ts";

function createInitRequiredResource(server: McpServer, projectRoot: string): McpResourceHandler {
	return {
		uri: "agentic-workspace://init-required",
		name: `AgenticWorkspace Not Initialized [${projectRoot}]`,
		description: "Instructions for initializing AgenticWorkspace in this project",
		mimeType: "text/markdown",
		handler: async () => {
			let text = MCP_INIT_REQUIRED_GUIDE;

			if (server.debugLog.length > 0) {
				text += `\n\n---\n\n## Debug\n\n- Resolved directory: \`${projectRoot}\`\n- ${server.debugLog.join("\n- ")}`;
			}

			return {
				contents: [
					{
						uri: "agentic-workspace://init-required",
						mimeType: "text/markdown",
						text,
					},
				],
			};
		},
	};
}

export function registerInitRequiredResource(server: McpServer, projectRoot: string): void {
	server.addResource(createInitRequiredResource(server, projectRoot));
}
