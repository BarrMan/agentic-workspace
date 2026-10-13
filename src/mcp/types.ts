import type {
	CallToolResult,
	GetPromptResult,
	ListPromptsResult,
	ListResourcesResult,
	ListResourceTemplatesResult,
	ListToolsResult,
	ReadResourceResult,
	ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js";

export interface McpToolHandler {
	name: string;
	description: string;
	inputSchema: object;
	annotations?: ToolAnnotations;
	handler: (args: Record<string, unknown>) => Promise<CallToolResult>;
}

export interface McpResourceHandler {
	uri: string;
	name?: string;
	description?: string;
	mimeType?: string;
	handler: (uri: string) => Promise<ReadResourceResult>;
}

export type {
	CallToolResult,
	GetPromptResult,
	ListPromptsResult,
	ListResourcesResult,
	ListResourceTemplatesResult,
	ListToolsResult,
	ReadResourceResult,
};
