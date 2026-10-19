import { describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import { coreFileSystem, createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

const cliCommand = ["agentic-workspace"];

function $(parts: TemplateStringsArray, ...values: unknown[]) {
	const source = parts.reduce(
		(text, part, index) =>
			`${text}${part}${Array.isArray(values[index]) ? values[index].map((value) => JSON.stringify(value)).join(" ") : values[index] === undefined ? "" : JSON.stringify(values[index])}`,
		"",
	);
	const args =
		source
			.match(/"(?:\\.|[^"\\])*"|'[^']*'|[^\s]+/g)
			?.map((arg) =>
				arg.startsWith('"') ? (JSON.parse(arg) as string) : arg.startsWith("'") ? arg.slice(1, -1) : arg,
			) ?? [];
	const config: { cwd?: string; nothrow?: boolean } = {};
	const result = async () => {
		const stdout: string[] = [];
		const stderr: string[] = [];
		const out = new Writable({
			write: (chunk, _encoding, done) => {
				stdout.push(chunk.toString());
				done();
			},
		});
		const err = new Writable({
			write: (chunk, _encoding, done) => {
				stderr.push(chunk.toString());
				done();
			},
		});
		const exitCode = await runCli(args.slice(cliCommand.length), { cwd: config.cwd, stdout: out, stderr: err });
		const value = { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
		if (value.exitCode && !config.nothrow) throw new Error(value.stderr || `CLI exited with ${value.exitCode}`);
		return value;
	};
	const chain = {
		cwd(value: string) {
			config.cwd = value;
			return chain;
		},
		nothrow() {
			config.nothrow = true;
			return chain;
		},
		quiet() {
			return result();
		},
		async text() {
			return (await result()).stdout;
		},
	};
	return chain;
}

/** Every case owns its project directory. */
async function setupPreservation(): Promise<{ dir: string; core: Core }> {
	const dir = createUniqueTestDir("test-task-edit-preservation");
	await mkdir(dir, { recursive: true });

	// Initialize agentic-workspace project using Core
	const core = new Core(dir);
	await initializeFilesystemTestProject(core, "Task Edit Preservation Test");
	return { dir, core };
}

describe("Task edit section preservation", () => {
	it("treats assignee casing and surrounding whitespace as a no-op", async () => {
		const { dir, core } = await setupPreservation();
		try {
			await core.createTaskFromInput({ title: "Assignee identity", assignee: ["Alice"] });
			const updated = await core.updateTaskFromInput("TASK-1", { assignee: ["alice"] });
			expect(updated.assignee).toEqual(["Alice"]);
			expect((await coreFileSystem(core).loadTask("TASK-1"))?.assignee).toEqual(["Alice"]);
		} finally {
			await safeCleanup(dir);
		}
	});

	it("preserves a generic working artifact and description during edits", async () => {
		const { dir, core } = await setupPreservation();
		try {
			// Create a task with both content fields
			await core.createTask({
				id: "task-1",
				title: "Full task test",
				status: "To Do",
				assignee: [],
				createdDate: "2025-07-04",
				labels: [],
				dependencies: [],
				description: "Original description",
			});

			const artifactPath = join(dir, "agentic-workspace", "tasks", "task-1", "working-state.md");
			await Bun.write(artifactPath, "Opaque working state.\n");

			// Update just the description
			await $`${cliCommand} task edit TASK-1 --description "UPDATED description"`.cwd(dir).quiet();

			const result = await $`${cliCommand} task view TASK-1 --plain`.cwd(dir).text();

			expect(result).toContain("UPDATED description");
			expect(await Bun.file(artifactPath).text()).toBe("Opaque working state.\n");
			expect(await Bun.file(join(dir, "agentic-workspace", "tasks", "task-1", "task.md")).text()).not.toContain(
				"agent_summary",
			);
		} finally {
			await safeCleanup(dir);
		}
	});

	it("preserves description and working artifact across repeated edits", async () => {
		const { dir, core } = await setupPreservation();
		try {
			// Create a task with a description
			await core.createTask({
				id: "task-2",
				title: "Agent summary update test",
				status: "To Do",
				assignee: [],
				createdDate: "2025-07-04",
				labels: [],
				dependencies: [],
				description: "Test description",
			});

			const artifactPath = join(dir, "agentic-workspace", "tasks", "task-2", "working-state.md");
			await Bun.write(artifactPath, "Working notes remain opaque.\n");
			await $`${cliCommand} task edit TASK-2 --description "Updated description"`.cwd(dir).quiet();

			// Verify the task description and independent artifact survive canonical saves.
			const result = await $`${cliCommand} task view TASK-2 --plain`.cwd(dir).text();

			expect(result).toContain("Updated description");
			expect(await Bun.file(artifactPath).text()).toBe("Working notes remain opaque.\n");
		} finally {
			await safeCleanup(dir);
		}
	});

	it("does not create summary metadata when editing task fields", async () => {
		const { dir, core } = await setupPreservation();
		try {
			// Create a task with a description
			await core.createTask({
				id: "task-3",
				title: "Agent summary replace test",
				status: "To Do",
				assignee: [],
				createdDate: "2025-07-04",
				labels: [],
				dependencies: [],
				description: "Test description",
			});

			await $`${cliCommand} task edit TASK-3 --description "Updated description"`.cwd(dir).quiet();

			const result = await $`${cliCommand} task view TASK-3 --plain`.cwd(dir).text();
			const taskContent = await Bun.file(join(dir, "agentic-workspace", "tasks", "task-3", "task.md")).text();

			expect(result).toContain("Updated description");
			expect(taskContent).not.toContain("agent_summary");
		} finally {
			await safeCleanup(dir);
		}
	});

	it("keeps a generic artifact independent from the task description", async () => {
		const { dir, core } = await setupPreservation();
		try {
			// Create a task with a description
			await core.createTask({
				id: "task-4",
				title: "Agent summary clear test",
				status: "To Do",
				assignee: [],
				createdDate: "2025-07-04",
				labels: [],
				dependencies: [],
				description: "Test description",
			});

			const artifactPath = join(dir, "agentic-workspace", "tasks", "task-4", "working-state.md");
			await Bun.write(artifactPath, "Pending work.\n");
			await $`${cliCommand} task edit TASK-4 --description "Updated description"`.cwd(dir).quiet();

			const result = await $`${cliCommand} task view TASK-4 --plain`.cwd(dir).text();

			expect(result).toContain("Updated description");
			expect(await Bun.file(artifactPath).text()).toBe("Pending work.\n");
		} finally {
			await safeCleanup(dir);
		}
	});

	it("should handle tasks with minimal content", async () => {
		const { dir, core } = await setupPreservation();
		try {
			// Create a task with just description
			await core.createTask({
				id: "task-5",
				title: "Minimal task test",
				status: "To Do",
				assignee: [],
				createdDate: "2025-07-04",
				labels: [],
				dependencies: [],
				description: "Minimal description",
			});

			// Update description
			await $`${cliCommand} task edit TASK-5 --description "Updated minimal description"`.cwd(dir).quiet();

			const result = await $`${cliCommand} task view TASK-5 --plain`.cwd(dir).text();
			const taskContent = await Bun.file(join(dir, "agentic-workspace", "tasks", "task-5", "task.md")).text();

			expect(result).toContain("Updated minimal description");
			expect(result).toContain("Artifacts: None");
			expect(taskContent).not.toContain("agent_summary");
		} finally {
			await safeCleanup(dir);
		}
	});
});
