import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModeDeletionJournalStore, WorkspaceRequestStore } from "./workspace-control-store.ts";

describe("workspace control stores", () => {
	const directories: string[] = [];

	afterEach(async () => {
		await Promise.all(
			directories.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })),
		);
	});

	it("keeps the established mode-deletion path and v2 bytes", async () => {
		const root = await mkdtemp(join(tmpdir(), "agentic-workspace-control-"));
		directories.push(root);
		const store = new ModeDeletionJournalStore(root);
		const journal = {
			version: 2 as const,
			operationId: "operation-1",
			source: "research",
			phase: "prepared" as const,
			tasks: ["TASK-1"],
		};

		await store.write(journal);

		expect(store.path).toBe(join(root, ".agentic-workspace", "agent-workspace", "mode-deletion.json"));
		expect(await readFile(store.path, "utf8")).toBe(`${JSON.stringify(journal, null, 2)}\n`);
		expect(await store.read()).toEqual(journal);
	});

	it("preserves and rejects an existing destination-based journal", async () => {
		const root = await mkdtemp(join(tmpdir(), "agentic-workspace-control-"));
		directories.push(root);
		const store = new ModeDeletionJournalStore(root);
		const bytes = JSON.stringify({
			version: 2,
			operationId: "operation-1",
			source: "research",
			destination: "build",
			phase: "prepared",
			tasks: ["TASK-1"],
		});
		await store.write({ version: 2, operationId: "placeholder", source: "research", phase: "prepared", tasks: [] });
		await writeFile(store.path, bytes);

		await expect(store.read()).rejects.toThrow(/destination-based.*cannot be replayed/i);
		expect(await readFile(store.path, "utf8")).toBe(bytes);
	});

	it("preserves request marker format and adoption identity", async () => {
		const root = await mkdtemp(join(tmpdir(), "agentic-workspace-control-"));
		directories.push(root);
		const store = new WorkspaceRequestStore(root);
		const request = {
			taskId: "TASK-1",
			sessionId: "pending-1",
			pid: process.pid,
			createdAt: "2026-10-20T00:00:00.000Z",
			handoff: {
				modeId: "build",
				predecessor: { id: "previous-1", createdAt: "2026-10-19T00:00:00.000Z", tmuxName: "previous-1" },
				priorActiveSessionId: "previous-1",
			},
		};

		await store.write(request);

		const path = join(store.directory, "pending-1.json");
		expect(store.directory).toBe(join(root, ".agentic-workspace", "agent-requests"));
		expect(await readFile(path, "utf8")).toBe(`${JSON.stringify(request)}\n`);
		expect(await store.read()).toEqual([request]);
		await store.delete(request.sessionId);
		expect(await Bun.file(path).exists()).toBe(false);
	});

	it("ignores malformed marker bytes without rewriting them", async () => {
		const root = await mkdtemp(join(tmpdir(), "agentic-workspace-control-"));
		directories.push(root);
		const store = new WorkspaceRequestStore(root);
		await store.write({ taskId: "TASK-1", sessionId: "valid", pid: process.pid });
		const path = join(store.directory, "valid.json");
		await writeFile(path, "{ not JSON");

		expect(await store.read()).toEqual([]);
		expect(await readFile(path, "utf8")).toBe("{ not JSON");
	});
});
