import { afterEach, describe, expect, it } from "bun:test";
import {
	MCP_TASK_CREATION_GUIDE,
	MCP_TASK_EXECUTION_GUIDE,
	MCP_TASK_FINALIZATION_GUIDE,
	MCP_WORKFLOW_OVERVIEW,
	MCP_WORKFLOW_OVERVIEW_TOOLS,
} from "../guidelines/mcp/index.ts";
import { registerWorkflowResources } from "../mcp/resources/workflow/index.ts";
import { createMcpServer, McpServer } from "../mcp/server.ts";
import { taskListSchema } from "../mcp/tools/tasks/index.ts";
import { registerWorkflowTools } from "../mcp/tools/workflow/index.ts";
import { createUniqueTestDir, initGitRepo, initializeTestProject, safeCleanup } from "./test-utils.ts";

// Helpers to extract text from MCP responses (handles union types)
const getText = (content: unknown[] | undefined, index = 0): string => {
	const item = content?.[index] as { text?: string } | undefined;
	return item?.text ?? "";
};
const getContentsText = (contents: unknown[] | undefined, index = 0): string => {
	const item = contents?.[index] as { text?: string } | undefined;
	return item?.text ?? "";
};

let TEST_DIR: string;

async function bootstrapServer(): Promise<McpServer> {
	TEST_DIR = createUniqueTestDir("mcp-server");
	// Use normal mode instructions for bootstrapped test server
	const server = new McpServer(TEST_DIR, "Test instructions");

	await server.application.filesystem.ensureBacklogStructure();
	initGitRepo(TEST_DIR, "main");

	await initializeTestProject(server.application, "Test Project");

	// Register workflow resources and tools manually (normally done in createMcpServer)
	registerWorkflowResources(server);
	registerWorkflowTools(server);

	return server;
}

describe("McpServer bootstrap", () => {
	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	it("exposes core capabilities before registration", async () => {
		const server = await bootstrapServer();

		const tools = await server.testInterface.listTools();
		expect(tools.tools.map((tool) => tool.name)).toEqual(["get_backlog_instructions"]);
		expect(tools.tools[0]?.inputSchema).toEqual({
			type: "object",
			properties: {
				instruction: {
					type: "string",
					enum: ["overview", "task-creation", "task-execution", "task-finalization"],
				},
			},
			required: [],
			additionalProperties: false,
		});

		const resources = await server.testInterface.listResources();
		expect(resources.resources.map((r) => r.uri)).toEqual([
			"backlog://workflow/overview",
			"backlog://workflow/task-creation",
			"backlog://workflow/task-execution",
			"backlog://workflow/task-finalization",
		]);

		const prompts = await server.testInterface.listPrompts();
		expect(prompts.prompts).toEqual([]);

		const resourceTemplates = await server.testInterface.listResourceTemplates();
		expect(resourceTemplates.resourceTemplates).toEqual([]);

		await server.stop();
	});

	it("workflow overview resource returns correct content", async () => {
		const server = await bootstrapServer();

		const result = await server.testInterface.readResource({
			params: { uri: "backlog://workflow/overview" },
		});

		expect(result.contents).toHaveLength(1);
		expect(getContentsText(result.contents)).toBe(MCP_WORKFLOW_OVERVIEW);
		expect(result.contents[0]?.mimeType).toBe("text/markdown");

		await server.stop();
	});

	it("workflow overview documents task_list schema filters", () => {
		const taskListLine = MCP_WORKFLOW_OVERVIEW.split("\n").find((line) => line.startsWith("- `task_list`"));
		expect(taskListLine).toBeDefined();

		for (const filter of Object.keys(taskListSchema.properties ?? {})) {
			expect(taskListLine).toContain(filter);
		}
	});

	it("task creation guide resource returns correct content", async () => {
		const server = await bootstrapServer();

		const result = await server.testInterface.readResource({
			params: { uri: "backlog://workflow/task-creation" },
		});

		expect(result.contents).toHaveLength(1);
		expect(getContentsText(result.contents)).toBe(MCP_TASK_CREATION_GUIDE);
		expect(getContentsText(result.contents)).toContain("### 1. Search for existing work");

		await server.stop();
	});

	it("task execution guide resource returns correct content", async () => {
		const server = await bootstrapServer();

		const result = await server.testInterface.readResource({
			params: { uri: "backlog://workflow/task-execution" },
		});

		expect(result.contents).toHaveLength(1);
		expect(getContentsText(result.contents)).toBe(MCP_TASK_EXECUTION_GUIDE);

		await server.stop();
	});

	it("task finalization guide resource returns correct content", async () => {
		const server = await bootstrapServer();

		const result = await server.testInterface.readResource({
			params: { uri: "backlog://workflow/task-finalization" },
		});

		expect(result.contents).toHaveLength(1);
		expect(getContentsText(result.contents)).toBe(MCP_TASK_FINALIZATION_GUIDE);

		await server.stop();
	});

	it("workflow guides require objective evidence before finalizing", () => {
		TEST_DIR = createUniqueTestDir("mcp-server-guides");

		expect(MCP_TASK_EXECUTION_GUIDE).toContain("Implement and verify work in proportion to its scope");
		expect(MCP_TASK_EXECUTION_GUIDE).toContain("update task status to reflect reality");
		expect(MCP_TASK_FINALIZATION_GUIDE).toContain(
			"Identify evidence for every requirement in the task description and durable working state.",
		);
		expect(MCP_TASK_FINALIZATION_GUIDE).toContain(
			"For UI or interactive work, exercise the behavior through a browser, DOM script, test runner, or documented manual interaction.",
		);
		expect(MCP_TASK_FINALIZATION_GUIDE).toContain(
			"Code presence, grep output, and implementation intent are not verification evidence.",
		);
	});

	it("task creation guide keeps parent task IDs distinct from milestone IDs", () => {
		TEST_DIR = createUniqueTestDir("mcp-server-guides");

		expect(MCP_TASK_CREATION_GUIDE).toContain(
			"Parent and dependency links: use valid task IDs and state the relationship clearly.",
		);
		expect(MCP_TASK_CREATION_GUIDE).toContain("Use subtasks for tightly coupled phases of one outcome");
	});

	it("task creation guide demonstrates a description that carries the why", () => {
		TEST_DIR = createUniqueTestDir("mcp-server-guides");

		expect(MCP_TASK_CREATION_GUIDE).toContain(
			"Description: concise, user-facing explanation of why the task exists and its key context.",
		);
		expect(MCP_TASK_CREATION_GUIDE).toContain("Title: one-line intended outcome, without implementation detail.");
	});

	it("legacy MCP guides preserve just-in-time planning parity with the canonical CLI lifecycle", () => {
		TEST_DIR = createUniqueTestDir("mcp-server-guides");

		expect(MCP_TASK_CREATION_GUIDE).toContain("Search with `task_search` or a filtered `task_list`");
		expect(MCP_TASK_CREATION_GUIDE).toContain(
			"Keep implementation notes and other durable working context in task artifacts",
		);
		expect(MCP_TASK_CREATION_GUIDE).toContain("Artifact approval is explicitly user-owned.");
		expect(MCP_TASK_EXECUTION_GUIDE).toContain("### Select a mode");
		expect(MCP_TASK_EXECUTION_GUIDE).toContain("### Working with tasks and artifacts");
		expect(MCP_TASK_EXECUTION_GUIDE).toContain(
			"Read the task, its status, dependencies, related tasks, and relevant artifacts",
		);
		expect(MCP_TASK_EXECUTION_GUIDE).toContain(
			"Use supported artifact interfaces to list, read, write, and inspect status.",
		);
		expect(MCP_TASK_EXECUTION_GUIDE).toContain("Follow the task finalization guide when wrapping up.");
	});

	it("workflow tool returns overview by default and selected guide content when requested", async () => {
		const server = await bootstrapServer();

		const overview = await server.testInterface.callTool({
			params: { name: "get_backlog_instructions", arguments: {} },
		});
		expect(getText(overview.content)).toBe(MCP_WORKFLOW_OVERVIEW_TOOLS);

		const creation = await server.testInterface.callTool({
			params: { name: "get_backlog_instructions", arguments: { instruction: "task-creation" } },
		});
		expect(getText(creation.content)).toBe(MCP_TASK_CREATION_GUIDE);

		await server.stop();
	});

	it("createMcpServer wires stdio-ready instance", async () => {
		TEST_DIR = createUniqueTestDir("mcp-server-factory");

		const bootstrap = new McpServer(TEST_DIR, "Bootstrap instructions");
		await bootstrap.application.filesystem.ensureBacklogStructure();
		initGitRepo(TEST_DIR, "main");
		await initializeTestProject(bootstrap.application, "Factory Project");
		await bootstrap.stop();

		const server = await createMcpServer(TEST_DIR);

		const tools = await server.testInterface.listTools();
		expect(tools.tools.map((tool) => tool.name)).toEqual([
			"get_backlog_instructions",
			"task_artifact_list",
			"task_artifact_read",
			"task_artifact_write",
			"task_artifact_status",
			"task_create",
			"task_list",
			"task_search",
			"task_edit",
			"task_view",
			"task_archive",
			"task_complete",
			"milestone_list",
			"milestone_add",
			"milestone_rename",
			"milestone_remove",
			"milestone_archive",
			"document_list",
			"document_view",
			"document_create",
			"document_update",
			"document_search",
		]);

		const resources = await server.testInterface.listResources();
		expect(resources.resources.map((r) => r.uri)).toEqual([
			"backlog://workflow/overview",
			"backlog://workflow/task-creation",
			"backlog://workflow/task-execution",
			"backlog://workflow/task-finalization",
		]);
		expect(MCP_WORKFLOW_OVERVIEW).toContain("## Backlog.md Overview (MCP)");

		const resourceTemplates = await server.testInterface.listResourceTemplates();
		expect(resourceTemplates.resourceTemplates).toEqual([]);

		await server.connect();
		await server.start();
		await server.stop();
		await safeCleanup(TEST_DIR);
	});
});
