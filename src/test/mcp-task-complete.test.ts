import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { McpServer } from "../mcp/server.ts";
import { registerTaskTools } from "../mcp/tools/tasks/index.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

const getText = (content: unknown[] | undefined, index = 0): string => {
	const item = content?.[index] as { text?: string } | undefined;
	return item?.text ?? "";
};

let TEST_DIR: string;
let server: McpServer;

async function loadConfigOrThrow(mcpServer: McpServer) {
	const config = await mcpServer.application.filesystem.loadConfig();
	if (!config) {
		throw new Error("Failed to load config");
	}
	return config;
}

describe("MCP task_complete", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("mcp-task-complete");
		server = new McpServer(TEST_DIR, "Test instructions");
		await initializeFilesystemTestProject(server.application, "Test Project");

		const config = await loadConfigOrThrow(server);
		registerTaskTools(server, config);
	});

	afterEach(async () => {
		const stopResult = await Promise.allSettled([server.stop()]);
		const cleanupResult = await Promise.allSettled([safeCleanup(TEST_DIR)]);
		const errors = [...stopResult, ...cleanupResult]
			.filter((result): result is PromiseRejectedResult => result.status === "rejected")
			.map((result) => result.reason);
		if (errors.length === 1) throw errors[0];
		if (errors.length > 1) throw new AggregateError(errors, "MCP server and fixture cleanup both failed");
	});

	it("moves Done tasks to the completed folder", async () => {
		const created = await server.testInterface.callTool({
			params: {
				name: "task_create",
				arguments: {
					title: "Done task",
					status: "Done",
				},
			},
		});
		const task = await server.application.getTask("task-1");
		if (!task) throw new Error(`Task creation failed: ${getText(created.content)}`);
		const taskId = task.id;
		const dependent = await server.testInterface.callTool({
			params: {
				name: "task_create",
				arguments: { title: "Dependent", dependencies: [taskId], references: [taskId] },
			},
		});
		expect(dependent.isError).toBeUndefined();

		const archiveAttempt = await server.testInterface.callTool({
			params: {
				name: "task_archive",
				arguments: { id: taskId },
			},
		});
		expect(archiveAttempt.isError).toBe(true);
		expect(archiveAttempt.structuredContent?.code).toBe("VALIDATION_ERROR");
		expect(getText(archiveAttempt.content)).toContain("task_complete");
		expect((await server.application.filesystem.loadTask(taskId))?.status).toBe("Done");
		expect((await server.application.filesystem.loadTask("TASK-2"))?.dependencies).toEqual([taskId]);
		expect((await server.application.filesystem.loadTask("TASK-2"))?.references).toEqual([taskId]);
		expect(await server.application.filesystem.listArchivedTasks()).toEqual([]);
		const artifactContent = Buffer.from("approved review\n");
		const artifactStatus = await server.application.filesystem.taskArtifacts.write(
			taskId,
			"notes/review.txt",
			artifactContent,
		);
		if (!artifactStatus.sha256) throw new Error("Expected artifact content hash");
		await server.application.filesystem.taskArtifacts.approveCurrentVersion(
			taskId,
			"notes/review.txt",
			artifactStatus.sha256,
		);

		const complete = await server.testInterface.callTool({
			params: {
				name: "task_complete",
				arguments: { id: taskId },
			},
		});
		expect(complete.isError).toBeUndefined();
		expect(getText(complete.content)).toContain(`Completed task ${taskId}`);

		const activeTask = await server.application.filesystem.loadTask(taskId);
		expect(activeTask).toBeNull();

		const completedTaskPath = (await server.application.getTask(taskId))?.filePath;
		expect(completedTaskPath).toBeDefined();
		if (!completedTaskPath) throw new Error("Completed task file was not found");
		const reportedFileLine = getText(complete.content)
			.split("\n")
			.find((line) => line.startsWith("File: "));
		expect(reportedFileLine).toBe(`File: ${completedTaskPath}`);
		expect(await Bun.file(completedTaskPath).exists()).toBe(true);
		const artifactPath = await server.application.filesystem.taskArtifacts.resolve(taskId, "notes/review.txt");
		expect(await readFile(artifactPath, "utf8")).toBe("approved review\n");
		const completedArtifactStatus = await server.application.filesystem.taskArtifacts.status(
			taskId,
			"notes/review.txt",
		);
		expect(completedArtifactStatus.state).toBe("approved");
		expect(completedArtifactStatus.sha256).toBe(artifactStatus.sha256);
		expect((await server.application.filesystem.loadTask("TASK-2"))?.dependencies).toEqual([taskId]);
	});

	it("refuses to complete tasks that are not Done", async () => {
		await server.application.createTask({
			id: "task-1",
			title: "Not done task",
			status: "Not Done",
			assignee: [],
			createdDate: "2025-06-08",
			labels: [],
			dependencies: [],
			rawContent: "Task is not ready for completion cleanup",
		});

		const complete = await server.testInterface.callTool({
			params: {
				name: "task_complete",
				arguments: { id: "task-1" },
			},
		});
		expect(complete.isError).toBe(true);
		expect(getText(complete.content)).toContain("not Done");

		const activeTask = await server.application.filesystem.loadTask("task-1");
		expect(activeTask?.status).toBe("Not Done");

		const archive = await server.testInterface.callTool({
			params: {
				name: "task_archive",
				arguments: { id: "task-1" },
			},
		});
		expect(archive.isError).toBeUndefined();
		expect(await server.application.filesystem.loadTask("task-1")).toBeNull();
	});
});
