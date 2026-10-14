import { afterEach, describe, expect, it } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../core/agentic-workspace.ts";
import { McpServer } from "../mcp/server.ts";
import { registerTaskTools } from "../mcp/tools/tasks/index.ts";
import { getTestCliCommand } from "./test-cli.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

const roots: string[] = [];
const CLI_COMMAND = getTestCliCommand();

function mcpText(result: { content?: Array<{ type: string; text?: string }> }): string {
	return (
		result.content
			?.filter((item): item is { type: "text"; text: string } => item.type === "text")
			.map(({ text }) => text)
			.join("") ?? ""
	);
}

afterEach(async () => {
	for (const root of roots.splice(0)) await safeCleanup(root);
});

async function project(prefix: string) {
	const root = createUniqueTestDir(prefix);
	roots.push(root);
	const core = new Core(root);
	await initializeFilesystemTestProject(core, "Task Artifact Contract");
	const created = await Bun.$`${CLI_COMMAND} task create "Artifact contract task" --plain`.cwd(root).nothrow().quiet();
	expect(created.exitCode).toBe(0);
	const tasks = await core.loadTasks();
	expect(tasks).toHaveLength(1);
	return { root, core, taskId: tasks[0]?.id ?? "" };
}

describe("generic task artifact CLI/MCP contract", () => {
	it("creates, lists, reads, writes and reports artifacts from a linked worktree with canonical paths", async () => {
		const { root, core, taskId } = await project("task-artifact-cli-worktree");
		const worktree = join(root, "linked-worktree");
		await Bun.$`git init -b main`.cwd(root).quiet();
		await Bun.$`git add .`.cwd(root).quiet();
		await Bun.$`git -c user.name=Test -c user.email=test@example.invalid commit -m initial`.cwd(root).quiet();
		await Bun.$`git worktree add ${worktree} -b linked`.cwd(root).quiet();
		const initialTaskList = await Bun.$`${CLI_COMMAND} task artifact list ${taskId} --json`
			.cwd(worktree)
			.nothrow()
			.quiet();
		expect(initialTaskList.exitCode).toBe(0);
		const initial = JSON.parse(initialTaskList.stdout.toString());
		const expectedDirectory = await core.filesystem.taskArtifacts.containerPath(taskId);
		expect(initial.directory).toBe(expectedDirectory);
		expect(initial.artifacts).toEqual([]);

		const write =
			await Bun.$`printf 'generic bytes without frontmatter\n' | ${CLI_COMMAND} task artifact write ${taskId} custom/brief.txt`
				.cwd(worktree)
				.nothrow()
				.quiet();
		expect(write.exitCode).toBe(0);
		expect(write.stdout.toString()).toContain("Draft\tcustom/brief.txt");
		const canonicalPath = join(expectedDirectory, "custom", "brief.txt");
		expect(await readFile(canonicalPath, "utf8")).toBe("generic bytes without frontmatter\n");

		const listing = await Bun.$`${CLI_COMMAND} task artifact list ${taskId} --json`.cwd(worktree).nothrow().quiet();
		const listed = JSON.parse(listing.stdout.toString());
		expect(listed.artifacts).toEqual([expect.objectContaining({ path: "custom/brief.txt", state: "Draft" })]);
		const read = await Bun.$`${CLI_COMMAND} task artifact read ${taskId} custom/brief.txt --json`
			.cwd(worktree)
			.nothrow()
			.quiet();
		expect(JSON.parse(read.stdout.toString())).toMatchObject({
			status: { path: "custom/brief.txt", state: "Draft" },
			contentBase64: Buffer.from("generic bytes without frontmatter\n").toString("base64"),
		});
		const status = await Bun.$`${CLI_COMMAND} task artifact status ${taskId} custom/brief.txt --json`
			.cwd(worktree)
			.nothrow()
			.quiet();
		expect(JSON.parse(status.stdout.toString())).toMatchObject({ path: "custom/brief.txt", state: "Draft" });
		const plain = await Bun.$`${CLI_COMMAND} task artifact list ${taskId} --plain`.cwd(worktree).nothrow().quiet();
		expect(plain.stdout.toString()).toContain(expectedDirectory);
		expect(plain.stdout.toString()).toContain("Draft\ttext\t");

		for (const invalid of ["../escape", ".artifacts.json", "task.md"]) {
			const rejected = await Bun.$`printf x | ${CLI_COMMAND} task artifact write ${taskId} ${invalid}`
				.cwd(worktree)
				.nothrow()
				.quiet();
			expect(rejected.exitCode).not.toBe(0);
		}
	});

	it("exposes only list/read/write/status MCP tools and their schemas; handlers preserve user approval state", async () => {
		const { root, core, taskId } = await project("task-artifact-mcp");
		const server = new McpServer(root, "test");
		try {
			const config = await server.application.filesystem.loadConfig();
			expect(config).not.toBeNull();
			if (!config) throw new Error("Expected initialized project configuration");
			registerTaskTools(server, config);
			const tools = await server.testInterface.listTools();
			const artifactTools = tools.tools.filter(({ name }) => name.startsWith("task_artifact_"));
			expect(artifactTools.map(({ name }) => name).sort()).toEqual([
				"task_artifact_list",
				"task_artifact_read",
				"task_artifact_status",
				"task_artifact_write",
			]);
			for (const tool of artifactTools) {
				expect(tool.inputSchema.type).toBe("object");
				expect(tool.inputSchema.additionalProperties).toBe(false);
			}
			const invoke = (name: string, args: Record<string, unknown> = {}) =>
				server.testInterface.callTool({ params: { name, arguments: args } });
			const write = await invoke("task_artifact_write", { taskId, path: "agent-note.txt", content: "from MCP" });
			expect(mcpText(write)).toContain('"state": "draft"');
			const resolved = await core.filesystem.taskArtifacts.resolve(taskId, "agent-note.txt");
			expect(mcpText(write)).toContain(resolved);
			const read = await invoke("task_artifact_read", { taskId, path: "agent-note.txt" });
			expect(mcpText(read)).toContain("from MCP");
			const list = await invoke("task_artifact_list", { taskId });
			expect(mcpText(list)).toContain(resolved);
			const status = await invoke("task_artifact_status", { taskId, path: "agent-note.txt" });
			expect(mcpText(status)).toContain('"state": "draft"');

			const reviewed = await core.filesystem.taskArtifacts.status(taskId, "agent-note.txt");
			expect(reviewed.sha256).toBeDefined();
			if (!reviewed.sha256) throw new Error("Expected artifact content hash");
			await core.filesystem.taskArtifacts.approveCurrentVersion(taskId, "agent-note.txt", reviewed.sha256);
			for (const name of ["task_artifact_list", "task_artifact_read", "task_artifact_status"]) {
				const args = name === "task_artifact_list" ? { taskId } : { taskId, path: "agent-note.txt" };
				expect(mcpText(await invoke(name, args))).toContain("approved");
			}
			await writeFile(resolved, "external edit");
			expect(mcpText(await invoke("task_artifact_status", { taskId, path: "agent-note.txt" }))).toContain("draft");
			const approvalActions = artifactTools.filter(({ name }) => /approve|revoke/i.test(name));
			expect(approvalActions).toEqual([]);
			const container = await core.filesystem.taskArtifacts.containerPath(taskId);
			expect(await Bun.file(join(container, ".artifacts.json")).exists()).toBe(true);
		} finally {
			await server.stop();
		}
	});
});
