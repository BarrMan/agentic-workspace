import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ListRootsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { $ } from "bun";
import { createMcpServer, McpServer } from "../mcp/server.ts";
import { createUniqueTestDir, initGitRepo, initializeTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

async function createProject(projectRoot: string, projectName: string): Promise<void> {
	await mkdir(projectRoot, { recursive: true });

	const bootstrap = new McpServer(projectRoot, "Bootstrap");
	initGitRepo(projectRoot, "main");
	await initializeTestProject(bootstrap.application, projectName);
	await bootstrap.stop();
}

async function connectRootsClient(
	server: McpServer,
	rootsRef: { current: string[] },
): Promise<{ client: Client; getRootsRequestCount: () => number }> {
	let rootsRequestCount = 0;

	const client = new Client(
		{ name: "Workspace Test Client", version: "1.0.0" },
		{ capabilities: { roots: { listChanged: true } } },
	);

	client.setRequestHandler(ListRootsRequestSchema, async () => {
		rootsRequestCount += 1;
		return { roots: rootsRef.current.map((uri) => ({ uri })) };
	});

	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.getServer().connect(serverTransport);
	await client.connect(clientTransport);

	return { client, getRootsRequestCount: () => rootsRequestCount };
}

async function listTaskFiles(projectRoot: string): Promise<string[]> {
	try {
		return await readdir(join(projectRoot, "backlog", "tasks"));
	} catch {
		return [];
	}
}

afterEach(async () => {
	if (TEST_DIR) {
		await safeCleanup(TEST_DIR);
	}
});

describe("MCP workspace root resolution", () => {
	it("follows the client workspace when started in an unrelated project (shared/global server)", async () => {
		TEST_DIR = createUniqueTestDir("mcp-workspace");
		const startupProject = join(TEST_DIR, "startup-project");
		const workspaceProject = join(TEST_DIR, "workspace-project");
		await createProject(startupProject, "Startup Project");
		await createProject(workspaceProject, "Workspace Project");

		// Server process starts in startupProject (think: a user-scope server whose
		// cwd is ~ holding ~/.backlog), but the client's workspace is workspaceProject.
		const server = await createMcpServer(startupProject);
		const rootsRef = { current: [pathToFileURL(workspaceProject).toString()] };
		const { client } = await connectRootsClient(server, rootsRef);

		try {
			await client.callTool({
				name: "task_create",
				arguments: { title: "Lands in workspace" },
			});

			expect(server.application.filesystem.rootDir).toBe(workspaceProject);
			expect(await listTaskFiles(workspaceProject)).toHaveLength(1);
			expect(await listTaskFiles(startupProject)).toHaveLength(0);
		} finally {
			await client.close();
			await server.stop();
		}
	});

	it("keeps the launch-directory project when the client reports an empty roots list", async () => {
		TEST_DIR = createUniqueTestDir("mcp-workspace");
		const startupProject = join(TEST_DIR, "startup-project");
		await createProject(startupProject, "Startup Project");

		// Roots-capable client that advertises no workspace folders. An empty list
		// means "no workspace opinion right now", not "drop the launch project".
		const server = await createMcpServer(startupProject);
		const rootsRef = { current: [] as string[] };
		const { client, getRootsRequestCount } = await connectRootsClient(server, rootsRef);

		try {
			await client.callTool({
				name: "task_create",
				arguments: { title: "Lands in startup" },
			});

			expect(server.application.filesystem.rootDir).toBe(startupProject);
			expect(getRootsRequestCount()).toBe(1);
			expect(await listTaskFiles(startupProject)).toHaveLength(1);
		} finally {
			await client.close();
			await server.stop();
		}
	});

	it("stays pinned and never queries roots when --cwd/BACKLOG_CWD is set", async () => {
		TEST_DIR = createUniqueTestDir("mcp-workspace");
		const pinnedProject = join(TEST_DIR, "pinned-project");
		const workspaceProject = join(TEST_DIR, "workspace-project");
		await createProject(pinnedProject, "Pinned Project");
		await createProject(workspaceProject, "Workspace Project");

		const server = await createMcpServer(pinnedProject, { pinned: true });
		const rootsRef = { current: [pathToFileURL(workspaceProject).toString()] };
		const { client, getRootsRequestCount } = await connectRootsClient(server, rootsRef);

		try {
			await client.callTool({
				name: "task_create",
				arguments: { title: "Lands in pinned" },
			});

			expect(server.application.filesystem.rootDir).toBe(pinnedProject);
			expect(getRootsRequestCount()).toBe(0);
			expect(await listTaskFiles(pinnedProject)).toHaveLength(1);
			expect(await listTaskFiles(workspaceProject)).toHaveLength(0);
		} finally {
			await client.close();
			await server.stop();
		}
	});

	it("keeps a startup project nested inside an advertised workspace root (monorepo package)", async () => {
		TEST_DIR = createUniqueTestDir("mcp-workspace");
		const repoRoot = join(TEST_DIR, "monorepo");
		const packageProject = join(repoRoot, "packages", "app");
		await mkdir(repoRoot, { recursive: true });
		await createProject(packageProject, "Package Project");

		// Started in the package (cwd resolved to the nested project), but the client
		// advertises the repo root, which itself has no backlog config.
		const server = await createMcpServer(packageProject);
		const rootsRef = { current: [pathToFileURL(repoRoot).toString()] };
		const { client } = await connectRootsClient(server, rootsRef);

		try {
			await client.callTool({
				name: "task_create",
				arguments: { title: "Lands in package" },
			});

			expect(server.application.filesystem.rootDir).toBe(packageProject);
			expect(await listTaskFiles(packageProject)).toHaveLength(1);
		} finally {
			await client.close();
			await server.stop();
		}
	});

	it("keeps the launch project when the client workspace has no backlog project", async () => {
		TEST_DIR = createUniqueTestDir("mcp-workspace");
		const startupProject = join(TEST_DIR, "startup-project");
		const emptyWorkspace = join(TEST_DIR, "empty-workspace");
		await createProject(startupProject, "Startup Project");
		await mkdir(emptyWorkspace, { recursive: true });

		// Client opens a folder with no backlog project. The minimal fix keeps the
		// launch-directory project rather than dropping it to init-required.
		const server = await createMcpServer(startupProject);
		const rootsRef = { current: [pathToFileURL(emptyWorkspace).toString()] };
		const { client } = await connectRootsClient(server, rootsRef);

		try {
			await client.callTool({
				name: "task_create",
				arguments: { title: "Lands in startup" },
			});

			expect(server.application.filesystem.rootDir).toBe(startupProject);
			expect(await listTaskFiles(startupProject)).toHaveLength(1);
			expect(await listTaskFiles(emptyWorkspace)).toHaveLength(0);
		} finally {
			await client.close();
			await server.stop();
		}
	});

	it("returns to the launch project after the advertised workspace loses its backlog", async () => {
		TEST_DIR = createUniqueTestDir("mcp-workspace");
		const startupProject = join(TEST_DIR, "startup-project");
		const workspaceProject = join(TEST_DIR, "workspace-project");
		const plainFolder = join(TEST_DIR, "plain");
		await createProject(startupProject, "Startup Project");
		await createProject(workspaceProject, "Workspace Project");
		await mkdir(plainFolder, { recursive: true });

		const server = await createMcpServer(startupProject);
		const rootsRef = { current: [pathToFileURL(workspaceProject).toString()] };
		const { client } = await connectRootsClient(server, rootsRef);

		try {
			// Client is in workspaceProject -> server follows it there.
			await client.callTool({
				name: "task_create",
				arguments: { title: "In workspace" },
			});
			expect(server.application.filesystem.rootDir).toBe(workspaceProject);

			// Workspace switches to a folder with no backlog (e.g. the worktree was
			// removed). A launch-directory project must return to the launch project,
			// not keep writing to the now-stale previous one.
			rootsRef.current = [pathToFileURL(plainFolder).toString()];
			await client.sendRootsListChanged();
			await client.callTool({
				name: "task_create",
				arguments: { title: "Back home" },
			});

			expect(server.application.filesystem.rootDir).toBe(startupProject);
			expect(await listTaskFiles(startupProject)).toHaveLength(1);
			expect(await listTaskFiles(workspaceProject)).toHaveLength(1);
		} finally {
			await client.close();
			await server.stop();
		}
	});

	it("activates main-worktree tasks when the client advertises a linked worktree", async () => {
		TEST_DIR = createUniqueTestDir("mcp-workspace");
		const mainRepo = join(TEST_DIR, "main-repo");
		await createProject(mainRepo, "Main Repo");
		await $`git add -A`.cwd(mainRepo).nothrow().quiet();
		await $`git -c user.name=Test -c user.email=test@example.com commit -m "init backlog"`.cwd(mainRepo).quiet();

		const worktree = join(TEST_DIR, "worktrees", "feature");
		await $`git worktree add ${worktree} -b feature`.cwd(mainRepo).quiet();
		const mainServer = new McpServer(mainRepo, "Main");
		await mainServer.application.createTaskFromInput({ title: "Main-only task" });
		await mainServer.stop();

		// Server cwd is the main checkout; the client opened the worktree.
		const server = await createMcpServer(mainRepo);
		const rootsRef = { current: [pathToFileURL(worktree).toString()] };
		const { client } = await connectRootsClient(server, rootsRef);

		try {
			await client.callTool({
				name: "task_create",
				arguments: { title: "Worktree task" },
			});

			expect(server.application.filesystem.rootDir).toBe(mainRepo);
			expect(await listTaskFiles(worktree)).toHaveLength(0);
			expect(await listTaskFiles(mainRepo)).toHaveLength(2);
		} finally {
			await client.close();
			await server.stop();
		}
	});
});
