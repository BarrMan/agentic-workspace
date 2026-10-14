import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import {
	CallToolRequestSchema,
	ErrorCode,
	GetPromptRequestSchema,
	ListPromptsRequestSchema,
	ListResourcesRequestSchema,
	ListResourceTemplatesRequestSchema,
	ListToolsRequestSchema,
	McpError,
	ReadResourceRequestSchema,
	RootsListChangedNotificationSchema,
	type ServerNotification,
	type ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { Core } from "../core/agentic-workspace.ts";
import type { AgenticWorkspaceConfig } from "../types/index.ts";
import { getPackageName } from "../utils/app-info.ts";
import { getVersion } from "../utils/version.ts";
import { registerInitRequiredResource } from "./resources/init-required/index.ts";
import { registerWorkflowResources } from "./resources/workflow/index.ts";
import { McpRootActivation } from "./root-activation.ts";
import { registerDocumentTools } from "./tools/documents/index.ts";
import { registerMilestoneTools } from "./tools/milestones/index.ts";
import { registerTaskTools } from "./tools/tasks/index.ts";
import { registerWorkflowTools } from "./tools/workflow/index.ts";
import type {
	CallToolResult,
	GetPromptResult,
	ListPromptsResult,
	ListResourcesResult,
	ListResourceTemplatesResult,
	ListToolsResult,
	McpResourceHandler,
	McpToolHandler,
	ReadResourceResult,
} from "./types.ts";

/**
 * Minimal MCP server implementation for stdio transport.
 *
 * The AgenticWorkspace MCP server is intentionally local-only and exposes tools,
 * resources, and prompts through the stdio transport so that desktop editors
 * (e.g. Claude Code) can interact with a project without network exposure.
 */
const APP_NAME = getPackageName();
const INSTRUCTIONS =
	"At the beginning of each session, list the available resources and read the first one to understand how to use AgenticWorkspace for task management. Additional detailed guides are available as resources when needed.";

type ServerInitOptions = {
	debug?: boolean;
	/** When true (from --cwd/AGENTIC_WORKSPACE_CWD), the root is fixed and client roots are never consulted. */
	pinned?: boolean;
};

type ServerRequestExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

export class McpServer {
	public application: Core;
	private readonly server: Server;
	private transport?: StdioServerTransport;
	private stopping = false;

	/** Debug log lines collected during roots discovery (exposed to init-required resource). */
	public readonly debugLog: string[] = [];

	private readonly rootActivation: McpRootActivation;

	private readonly tools = new Map<string, McpToolHandler>();
	private readonly resources = new Map<string, McpResourceHandler>();
	private readonly prompts = new Map<
		string,
		{
			name: string;
			description?: string;
			arguments?: Array<{ name: string; description?: string; required?: boolean }>;
			handler: (args: Record<string, unknown>) => Promise<GetPromptResult>;
		}
	>();

	constructor(projectRoot: string, instructions: string, version = "0.0.0") {
		this.application = new Core(projectRoot);

		this.server = new Server(
			{
				name: APP_NAME,
				version,
			},
			{
				capabilities: {
					tools: { listChanged: true },
					resources: { listChanged: true },
					prompts: { listChanged: true },
					logging: {},
				},
				instructions,
			},
		);

		this.rootActivation = new McpRootActivation(
			() => this.application,
			(projectRoot) => new Core(projectRoot),
			(application) => {
				this.application = application;
			},
			projectRoot,
			(config, root) => this.setCapabilities(config, root),
			(message, options) => this.log(message, options),
		);
		this.setupHandlers();
	}

	/**
	 * Enable roots-based project discovery so the server follows the client
	 * workspace. Used from both fallback mode and a normal (initialized) startup;
	 * pass `startupHasProject` for the latter so an unusable client workspace
	 * returns to the launch-directory project instead of init-required.
	 *
	 * The first request-scoped handler invocation can query MCP roots to look
	 * for a valid agentic-workspace project. If found, the activation owner replaces the immutable Core,
	 * registers the full toolset, and notifies the client. A roots change resolves a fresh
	 * binding even when its project root is unchanged.
	 */
	enableRootsDiscovery(options: { debug?: boolean; startupConfig: AgenticWorkspaceConfig | null }): void {
		this.rootActivation.enable(options);
	}

	private log(message: string, options?: { debug?: boolean }): void {
		this.debugLog.push(message);
		if (options?.debug) {
			console.error(message);
		}
		// Also send via MCP logging protocol when transport is connected
		this.server.sendLoggingMessage({ level: "info", logger: "agentic-workspace", data: message }).catch(() => {});
	}

	private async ensureRootsResolved(extra?: ServerRequestExtra): Promise<void> {
		await this.rootActivation.ensure(extra, Boolean(this.server.getClientCapabilities()?.roots));
	}

	/**
	 * Register the full toolset for the currently selected immutable Core instance.
	 */
	private async setCapabilities(config: AgenticWorkspaceConfig | null, projectRoot: string): Promise<void> {
		if (config) this.registerProjectCapabilities(config);
		else this.registerFallbackCapabilities(projectRoot);
		await this.notifyRegistrationChanged();
	}

	public registerFallbackCapabilities(projectRoot: string): void {
		this.replaceRegistries(() => registerInitRequiredResource(this, projectRoot));
	}

	public registerProjectCapabilities(config: AgenticWorkspaceConfig): void {
		this.replaceRegistries(() => this.addProjectCapabilities(config));
	}

	private addProjectCapabilities(config: AgenticWorkspaceConfig): void {
		registerWorkflowResources(this);
		registerWorkflowTools(this);
		registerTaskTools(this, config);
		registerMilestoneTools(this);
		registerDocumentTools(this, config);
	}

	private replaceRegistries(register: () => void): void {
		this.tools.clear();
		this.resources.clear();
		this.prompts.clear();
		register();
	}

	private async notifyRegistrationChanged(): Promise<void> {
		await this.server.sendToolListChanged();
		await this.server.sendResourceListChanged();
		await this.server.sendPromptListChanged();
	}

	private setupHandlers(): void {
		this.server.setRequestHandler(ListToolsRequestSchema, async (_request, extra) => this.listTools(extra));
		this.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => this.callTool(request, extra));
		this.server.setRequestHandler(ListResourcesRequestSchema, async (_request, extra) => this.listResources(extra));
		this.server.setRequestHandler(ListResourceTemplatesRequestSchema, async (_request, extra) =>
			this.listResourceTemplates(extra),
		);
		this.server.setRequestHandler(ReadResourceRequestSchema, async (request, extra) =>
			this.readResource(request, extra),
		);
		this.server.setRequestHandler(ListPromptsRequestSchema, async (_request, extra) => this.listPrompts(extra));
		this.server.setRequestHandler(GetPromptRequestSchema, async (request, extra) => this.getPrompt(request, extra));

		// Mark cached roots resolution dirty when client workspace changes.
		this.server.setNotificationHandler(RootsListChangedNotificationSchema, () => {
			this.rootActivation.markDirty();
		});
	}

	/**
	 * Register a tool implementation with the server.
	 */
	public addTool(tool: McpToolHandler): void {
		this.tools.set(tool.name, tool);
	}

	/**
	 * Register a resource implementation with the server.
	 */
	public addResource(resource: McpResourceHandler): void {
		this.resources.set(resource.uri, resource);
	}

	/**
	 * Connect the server to the stdio transport.
	 */
	public async connect(): Promise<void> {
		if (this.transport) {
			return;
		}

		this.transport = new StdioServerTransport();
		await this.server.connect(this.transport);
	}

	/**
	 * Start the server. The stdio transport begins handling requests as soon as
	 * it is connected, so this method exists primarily for symmetry with
	 * callers that expect an explicit start step.
	 */
	public async start(): Promise<void> {
		if (!this.transport) {
			throw new Error("MCP server not connected. Call connect() before start().");
		}
	}

	/**
	 * Stop the server and release transport resources.
	 */
	public async stop(): Promise<void> {
		if (this.stopping) {
			return;
		}
		this.stopping = true;
		try {
			await this.server.close();
		} finally {
			this.transport = undefined;
		}
	}

	public getServer(): Server {
		return this.server;
	}

	/** Each MCP operation reads through a fresh immutable Core for the selected project root. */
	public createOperationCore(): Core {
		return new Core(this.application.filesystem.rootDir);
	}

	// -- Internal handlers --------------------------------------------------

	protected async listTools(extra?: ServerRequestExtra): Promise<ListToolsResult> {
		await this.ensureRootsResolved(extra);
		return {
			tools: Array.from(this.tools.values()).map((tool) => ({
				name: tool.name,
				description: tool.description,
				inputSchema: {
					type: "object",
					...tool.inputSchema,
				},
				...(tool.annotations ? { annotations: tool.annotations } : {}),
			})),
		};
	}

	protected async callTool(
		request: {
			params: { name: string; arguments?: Record<string, unknown> };
		},
		extra?: ServerRequestExtra,
	): Promise<CallToolResult> {
		await this.ensureRootsResolved(extra);
		const { name, arguments: args = {} } = request.params;
		const tool = this.tools.get(name);

		if (!tool) {
			throw new McpError(ErrorCode.InvalidParams, `Tool not found: ${name}`);
		}

		return await tool.handler(args);
	}

	protected async listResources(extra?: ServerRequestExtra): Promise<ListResourcesResult> {
		await this.ensureRootsResolved(extra);
		return {
			resources: Array.from(this.resources.values()).map((resource) => ({
				uri: resource.uri,
				name: resource.name || "Unnamed Resource",
				description: resource.description,
				mimeType: resource.mimeType,
			})),
		};
	}

	protected async listResourceTemplates(extra?: ServerRequestExtra): Promise<ListResourceTemplatesResult> {
		await this.ensureRootsResolved(extra);
		return {
			resourceTemplates: [],
		};
	}

	protected async readResource(
		request: { params: { uri: string } },
		extra?: ServerRequestExtra,
	): Promise<ReadResourceResult> {
		await this.ensureRootsResolved(extra);
		const { uri } = request.params;

		// Exact match first
		let resource = this.resources.get(uri);

		// Fallback to base URI for parameterised resources
		if (!resource) {
			const baseUri = uri.split("?")[0] || uri;
			resource = this.resources.get(baseUri);
		}

		if (!resource) {
			throw new McpError(ErrorCode.InvalidParams, `Resource not found: ${uri}`);
		}

		return await resource.handler(uri);
	}

	protected async listPrompts(extra?: ServerRequestExtra): Promise<ListPromptsResult> {
		await this.ensureRootsResolved(extra);
		return {
			prompts: Array.from(this.prompts.values()).map((prompt) => ({
				name: prompt.name,
				description: prompt.description,
				arguments: prompt.arguments,
			})),
		};
	}

	protected async getPrompt(
		request: {
			params: { name: string; arguments?: Record<string, unknown> };
		},
		extra?: ServerRequestExtra,
	): Promise<GetPromptResult> {
		await this.ensureRootsResolved(extra);
		const { name, arguments: args = {} } = request.params;
		const prompt = this.prompts.get(name);

		if (!prompt) {
			throw new McpError(ErrorCode.InvalidParams, `Prompt not found: ${name}`);
		}

		return await prompt.handler(args);
	}

	/**
	 * Helper exposed for tests so they can call handlers directly.
	 */
	public get testInterface() {
		return {
			listTools: () => this.listTools(),
			callTool: (request: { params: { name: string; arguments?: Record<string, unknown> } }) => this.callTool(request),
			listResources: () => this.listResources(),
			listResourceTemplates: () => this.listResourceTemplates(),
			readResource: (request: { params: { uri: string } }) => this.readResource(request),
			listPrompts: () => this.listPrompts(),
			getPrompt: (request: { params: { name: string; arguments?: Record<string, unknown> } }) =>
				this.getPrompt(request),
		};
	}
}

/**
 * Factory that bootstraps a fully configured MCP server instance.
 *
 * If agentic-workspace is not initialized in the project directory, the server will start
 * in fallback mode with roots discovery enabled — the first request-scoped MCP
 * handler can then query client roots to find the correct project.
 */
export async function createMcpServer(projectRoot: string, options: ServerInitOptions = {}): Promise<McpServer> {
	const version = await getVersion();
	const server = new McpServer(projectRoot, INSTRUCTIONS, version);
	await server.application.ensureConfigLoaded();
	const config = await server.application.filesystem.loadConfig();

	// Graceful fallback: if config doesn't exist, provide init-required resource
	// and enable roots discovery so the server can find the project via MCP roots
	if (!config) {
		server.registerFallbackCapabilities(projectRoot);
		if (!options.pinned) {
			server.enableRootsDiscovery({
				debug: options.debug,
				startupConfig: null,
			});
		}

		if (options.debug) {
			console.error("MCP server initialised in fallback mode (roots discovery enabled).");
		}

		return server;
	}

	// Normal mode: full tools and resources
	server.registerProjectCapabilities(config);

	// Follow the client workspace roots so a server launched in the main checkout
	// (or a shared/user-scope server) targets the active project, not a frozen one.
	if (!options.pinned) {
		server.enableRootsDiscovery({
			debug: options.debug,
			startupConfig: config,
		});
	}

	if (options.debug) {
		console.error("MCP server initialised (stdio transport only).");
	}

	return server;
}
