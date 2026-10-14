import { describe, expect, it } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { runCli as appRunCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

/** Every case owns its project directory, so the cases can run concurrently in one process. */
async function setupGraph(): Promise<{ dir: string; core: Core }> {
	const dir = createUniqueTestDir("test-cli-dependency-graph");
	await mkdir(dir, { recursive: true });
	const core = new Core(dir);
	await initializeFilesystemTestProject(core, "Dependency Graph Test");
	return { dir, core };
}

async function runCli(cwd: string, args: string[]) {
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
	const exitCode = await appRunCli(args, { cwd, stdout: out, stderr: err });
	return { exitCode, stdout: { toString: () => stdout.join("") }, stderr: { toString: () => stderr.join("") } };
}

async function addTask(core: Core, id: string, title: string, dependencies: string[] = []) {
	await core.createTask({
		id,
		title,
		status: "To Do",
		assignee: [],
		createdDate: "2026-07-14 09:30",
		labels: [],
		dependencies,
	});
}

// The real CLI is expensive to start and gets slower when many copies run at once (the runner
// already fans out files), so in-file parallelism stays capped. Each case still owns its directory.
const CONCURRENCY = 1;
let activeCases = 0;
const waitingCases: Array<() => void> = [];

function concurrentTest(name: string, body: () => Promise<void>): void {
	it.concurrent(name, async () => {
		if (activeCases >= CONCURRENCY) await new Promise<void>((resolve) => waitingCases.push(resolve));
		activeCases += 1;
		try {
			await body();
		} finally {
			activeCases -= 1;
			waitingCases.shift()?.();
		}
	});
}

/** The dependency-graph block of `task view --plain`, without the surrounding detail sections. */
function graphSection(stdout: string): string[] {
	const lines = stdout.split("\n");
	const start = lines.indexOf("Dependency Graph:");
	if (start === -1) return [];
	// Everything after the heading and its rule, up to whatever section comes next. The direction
	// headings carry counts in parentheses, so they never look like a top-level section heading.
	const body = lines.slice(start + 2);
	const next = body.findIndex((line) => /^[A-Z][A-Za-z ]+:$/.test(line));
	const section = next === -1 ? body : body.slice(0, next);
	while (section.length > 0 && section[section.length - 1] === "") section.pop();
	return section;
}

describe("CLI dependency graph", () => {
	concurrentTest("shows complete forward and reverse chains with direct and transitive relationships", async () => {
		const { dir, core } = await setupGraph();
		try {
			await addTask(core, "task-1", "Foundation");
			await addTask(core, "task-2", "Middle", ["task-1"]);
			await addTask(core, "task-3", "Selected", ["task-2"]);
			await addTask(core, "task-4", "Follow up", ["task-3"]);
			await addTask(core, "task-5", "Last", ["task-4"]);

			const result = await runCli(dir, ["task", "view", "3", "--plain"]);
			expect(result.exitCode).toBe(0);
			expect(graphSection(result.stdout.toString())).toEqual([
				"Depends on (1 direct, 2 total):",
				"└─ TASK-2 - Middle [To Do]",
				"   └─ TASK-1 - Foundation [To Do]",
				"",
				"Dependents (1 direct, 2 total):",
				"└─ TASK-4 - Follow up [To Do]",
				"   └─ TASK-5 - Last [To Do]",
			]);
		} finally {
			await safeCleanup(dir);
		}
	});

	concurrentTest("renders view, create, and edit through the one plain serializer", async () => {
		const { dir, core } = await setupGraph();
		try {
			await addTask(core, "task-1", "Foundation");
			await addTask(core, "task-2", "Selected", ["task-1"]);

			// The create runs against a different file than the view reads, so only the view/edit pair
			// stays ordered.
			const viewedResult = await runCli(dir, ["task", "view", "2", "--plain"]);
			const createdResult = await runCli(dir, ["task", "create", "Third", "--dep", "task-1", "--plain"]);
			const viewed = viewedResult.stdout.toString();
			// The graph says everything the raw ID list would, so no plain output repeats it.
			expect(viewed).not.toContain("Dependencies: ");
			expect(viewed).toContain("Dependency Graph:");
			expect(viewed.indexOf("Dependency Graph:")).toBeLessThan(viewed.indexOf("Description:"));

			// A write confirmation is the same serializer, so it renders the identical layout.
			const edited = (await runCli(dir, ["task", "edit", "2", "--plain", "-l", "graph"])).stdout.toString();
			expect(edited).not.toContain("Dependencies: ");
			expect(edited).toContain("Dependency Graph:");
			expect(edited).toContain("└─ TASK-1 - Foundation [To Do]");
			expect(edited.indexOf("Dependency Graph:")).toBeLessThan(edited.indexOf("Description:"));

			const created = createdResult.stdout.toString();
			expect(created).toContain("Dependency Graph:");
			expect(created).toContain("└─ TASK-1 - Foundation [To Do]");
		} finally {
			await safeCleanup(dir);
		}
	});

	concurrentTest("renders modified files without an agent summary section", async () => {
		const { dir, core } = await setupGraph();
		try {
			await addTask(core, "task-1", "Selected");
			await runCli(dir, ["task", "edit", "1", "--modified-file", "src/api.ts"]);

			const stdout = (await runCli(dir, ["task", "view", "1", "--plain"])).stdout.toString();
			expect(stdout).toContain("Modified files: src/api.ts");
			expect(stdout).not.toContain("Agent Summary:");
			expect(stdout.indexOf("Description:")).toBeLessThan(stdout.indexOf("Modified files:"));
		} finally {
			await safeCleanup(dir);
		}
	});

	concurrentTest("renders a diamond once and marks the repeated branch", async () => {
		const { dir, core } = await setupGraph();
		try {
			await addTask(core, "task-1", "Shared");
			await addTask(core, "task-2", "Left", ["task-1"]);
			await addTask(core, "task-3", "Right", ["task-1"]);
			await addTask(core, "task-4", "Selected", ["task-2", "task-3"]);

			expect(graphSection((await runCli(dir, ["task", "view", "4", "--plain"])).stdout.toString())).toEqual([
				"Depends on (2 direct, 3 total):",
				"├─ TASK-2 - Left [To Do]",
				"│  └─ TASK-1 - Shared [To Do]",
				"└─ TASK-3 - Right [To Do]",
				"   └─ TASK-1 - Shared [To Do] (shown above)",
			]);
		} finally {
			await safeCleanup(dir);
		}
	});

	concurrentTest("terminates a cycle instead of repeating it", async () => {
		const { dir, core } = await setupGraph();
		try {
			// Validation refuses to create a cycle, so store one directly as the legacy defect
			// `agentic-workspace doctor` reports; the graph must still render it honestly.
			await addTask(core, "task-1", "Selected", ["task-2"]);
			await addTask(core, "task-2", "Second", ["task-1"]);

			const lines = graphSection((await runCli(dir, ["task", "view", "1", "--plain"])).stdout.toString());
			expect(lines).toEqual([
				"Depends on (1 direct, 1 total):",
				"└─ TASK-2 - Second [To Do]",
				"   └─ TASK-1 - Selected [To Do] (cycle)",
				"",
				"Dependents (1 direct, 1 total):",
				"└─ TASK-2 - Second [To Do]",
				"   └─ TASK-1 - Selected [To Do] (cycle)",
			]);
		} finally {
			await safeCleanup(dir);
		}
	});

	concurrentTest("names a completed dependency and keeps it resolved", async () => {
		const { dir, core } = await setupGraph();
		try {
			await addTask(core, "task-1", "Finished");
			await addTask(core, "task-2", "Selected", ["task-1"]);
			expect((await runCli(dir, ["task", "edit", "1", "-s", "Done"])).exitCode).toBe(0);
			expect((await runCli(dir, ["task", "complete", "1"])).exitCode).toBe(0);

			expect(graphSection((await runCli(dir, ["task", "view", "2", "--plain"])).stdout.toString())).toEqual([
				"Depends on (1 direct, 1 total):",
				"└─ TASK-1 - Finished [completed]",
			]);
		} finally {
			await safeCleanup(dir);
		}
	});

	concurrentTest("reports an unknown dependency reference explicitly", async () => {
		const { dir, core } = await setupGraph();
		try {
			await addTask(core, "task-1", "Selected", ["task-404"]);

			const plainResult = await runCli(dir, ["task", "view", "1", "--plain"]);
			const jsonResult = await runCli(dir, ["task", "view", "1", "--json"]);
			expect(graphSection(plainResult.stdout.toString())).toEqual([
				"Depends on (1 direct, 1 total):",
				"└─ task-404 - unknown task ID",
			]);

			const json = JSON.parse(jsonResult.stdout.toString());
			expect(json.task.dependencyGraph.nodes.at(-1)).toMatchObject({ state: "missing", title: null, completed: false });
		} finally {
			await safeCleanup(dir);
		}
	});

	concurrentTest("resolves the exact dependency while keeping its padded sibling distinct", async () => {
		const { dir, core } = await setupGraph();
		try {
			await addTask(core, "task-1", "Contested");
			await addTask(core, "task-2", "Selected", ["task-1"]);
			const original = join(dir, "agentic-workspace", "tasks", "task-1", "task.md");
			const duplicate = (await readFile(original, "utf8")).replace("id: TASK-1", "id: TASK-01");
			await mkdir(join(dir, "agentic-workspace", "tasks", "task-01"), { recursive: true });
			await writeFile(join(dir, "agentic-workspace", "tasks", "task-01", "task.md"), duplicate);

			const plainResult = await runCli(dir, ["task", "view", "2", "--plain"]);
			const jsonResult = await runCli(dir, ["task", "view", "2", "--json"]);
			expect(graphSection(plainResult.stdout.toString())).toEqual([
				"Depends on (1 direct, 1 total):",
				"└─ TASK-1 - Contested [To Do]",
			]);

			const json = JSON.parse(jsonResult.stdout.toString());
			expect(json.task.dependencyGraph.nodes.at(-1)).toMatchObject({
				state: "resolved",
				title: "Contested",
				completed: false,
			});
		} finally {
			await safeCleanup(dir);
		}
	});

	concurrentTest("omits the section for a task with no dependencies and no dependents", async () => {
		const { dir, core } = await setupGraph();
		try {
			await addTask(core, "task-1", "Alone");
			expect((await runCli(dir, ["task", "view", "1", "--plain"])).stdout.toString()).not.toContain(
				"Dependency Graph:",
			);
		} finally {
			await safeCleanup(dir);
		}
	});

	concurrentTest(
		"adds root, nodes, and directed edges to the JSON task view without changing dependencies",
		async () => {
			const { dir, core } = await setupGraph();
			try {
				await addTask(core, "task-1", "Foundation");
				await addTask(core, "task-2", "Selected", ["task-1"]);
				await addTask(core, "task-3", "Follow up", ["task-2"]);

				const results = [
					await runCli(dir, ["task", "view", "2", "--json"]),
					await runCli(dir, ["task", "2", "--json"]),
				];
				for (const result of results) {
					const output = JSON.parse(result.stdout.toString());
					expect(output.schemaVersion).toBe(1);
					expect(output.kind).toBe("task-view");
					expect(output.task.dependencies).toEqual(["task-1"]);
					expect(output.task.dependencyGraph.root).toBe("TASK-2");
					expect(output.task.dependencyGraph.nodes).toEqual([
						{
							id: "TASK-2",
							title: "Selected",
							status: "To Do",
							state: "resolved",
							completed: false,
							dependencyDepth: 0,
							dependentDepth: 0,
						},
						{
							id: "TASK-1",
							title: "Foundation",
							status: "To Do",
							state: "resolved",
							completed: false,
							dependencyDepth: 1,
							dependentDepth: null,
						},
						{
							id: "TASK-3",
							title: "Follow up",
							status: "To Do",
							state: "resolved",
							completed: false,
							dependencyDepth: null,
							dependentDepth: 1,
						},
					]);
					expect(output.task.dependencyGraph.edges).toEqual([
						{ from: "TASK-2", to: "TASK-1" },
						{ from: "TASK-3", to: "TASK-2" },
					]);
				}
			} finally {
				await safeCleanup(dir);
			}
		},
	);

	concurrentTest("leaves compact list, search, and edit payloads unchanged", async () => {
		const { dir, core } = await setupGraph();
		try {
			await addTask(core, "task-1", "Foundation");
			await addTask(core, "task-2", "Selected", ["task-1"]);

			const listResult = await runCli(dir, ["task", "list", "--json"]);
			const searchResult = await runCli(dir, ["search", "Selected", "--json"]);
			const list = JSON.parse(listResult.stdout.toString());
			expect(list.dependencyGraph).toBeUndefined();
			for (const summary of list.tasks) {
				expect(Object.keys(summary)).not.toContain("dependencyGraph");
				expect(Object.keys(summary)).not.toContain("dependencies");
			}

			const search = JSON.parse(searchResult.stdout.toString());
			expect(search.dependencyGraph).toBeUndefined();
			for (const entry of search.results) {
				expect(Object.keys(entry.data)).not.toContain("dependencyGraph");
				expect(Object.keys(entry.data)).not.toContain("dependencies");
			}

			// Only the compact machine-readable payloads must stay unchanged; the plain confirmation is
			// deliberately the same detail layout as task view.
			const edited = await runCli(dir, ["task", "edit", "2", "--plain", "-l", "graph"]);
			expect(edited.exitCode).toBe(0);
			expect(edited.stdout.toString()).toContain("Dependency Graph:");
		} finally {
			await safeCleanup(dir);
		}
	});

	concurrentTest("keeps a wide and deep graph linear in the rendered output", async () => {
		const { dir, core } = await setupGraph();
		try {
			for (let position = 1; position <= 60; position++) {
				await addTask(core, `task-${position}`, `Chain ${position}`, position === 1 ? [] : [`task-${position - 1}`]);
			}
			for (let position = 1; position <= 20; position++) {
				await addTask(core, `task-${100 + position}`, `Fan ${position}`, ["task-60"]);
			}

			const lines = graphSection((await runCli(dir, ["task", "view", "60", "--plain"])).stdout.toString());
			// 59 dependencies, 20 dependents, two headings, one blank separator: every node exactly once.
			expect(lines).toHaveLength(59 + 20 + 3);
			expect(lines[0]).toBe("Depends on (1 direct, 59 total):");
			expect(lines.find((line) => line.startsWith("Dependents"))).toBe("Dependents (20 direct, 20 total):");
		} finally {
			await safeCleanup(dir);
		}
	});
});
