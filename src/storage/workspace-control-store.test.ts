import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

	it("reads destination-based recovery evidence without rewriting it", async () => {
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

		expect(await store.read()).toEqual(JSON.parse(bytes));
		expect(await readFile(store.path, "utf8")).toBe(bytes);
	});

	it("round-trips a move journal and rejects malformed reads and writes without changing stored bytes", async () => {
		const root = await mkdtemp(join(tmpdir(), "agentic-workspace-control-"));
		directories.push(root);
		const store = new ModeDeletionJournalStore(root);
		const journal = {
			version: 2 as const,
			operationId: "move-1",
			source: "research",
			destination: "build",
			phase: "prepared" as const,
			tasks: ["TASK-1"],
		};
		await store.write(journal);
		expect(await store.read()).toEqual(journal);
		const original = await readFile(store.path, "utf8");
		for (const patch of [
			{ destination: 3 },
			{ destination: " " },
			{ destination: "research" },
			{ operationId: "" },
			{ source: " " },
			{ tasks: [1] },
			{ tasks: [""] },
			{ phase: "unknown" },
			{ version: 1 },
		]) {
			const invalid = { ...journal, ...patch };
			await expect(store.write(invalid as never)).rejects.toThrow("Invalid mode-deletion journal");
			expect(await readFile(store.path, "utf8")).toBe(original);
			const bytes = JSON.stringify(invalid);
			await writeFile(store.path, bytes);
			await expect(store.read()).rejects.toThrow("Invalid mode-deletion journal");
			expect(await readFile(store.path, "utf8")).toBe(bytes);
			await writeFile(store.path, original);
		}
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

		await mkdir(store.directory, { recursive: true });
		await writeFile(join(store.directory, `${request.sessionId}.json`), `${JSON.stringify(request)}\n`);

		const path = join(store.directory, "pending-1.json");
		expect(store.directory).toBe(join(root, ".agentic-workspace", "agent-requests"));
		expect(await readFile(path, "utf8")).toBe(`${JSON.stringify(request)}\n`);
		expect(await store.read()).toEqual([request]);
		await store.delete(request.sessionId);
		expect(await Bun.file(path).exists()).toBe(false);
	});

	it("reports malformed marker bytes without rewriting them", async () => {
		const root = await mkdtemp(join(tmpdir(), "agentic-workspace-control-"));
		directories.push(root);
		const store = new WorkspaceRequestStore(root);
		await mkdir(store.directory, { recursive: true });
		const path = join(store.directory, "valid.json");
		await writeFile(path, "{ not JSON");

		await expect(store.read()).rejects.toThrow("Could not read workspace request");
		expect(await readFile(path, "utf8")).toBe("{ not JSON");
	});

	it("treats only missing directories and markers as absence", async () => {
		const root = await mkdtemp(join(tmpdir(), "agentic-workspace-control-"));
		directories.push(root);
		const store = new WorkspaceRequestStore(root);
		expect(await store.read()).toEqual([]);
		await store.delete("absent");
		await mkdir(join(root, ".agentic-workspace"), { recursive: true });
		await writeFile(store.directory, "not a directory");
		await expect(store.read()).rejects.toThrow("Could not list workspace requests");
		await expect(store.delete("marker")).rejects.toThrow("Could not remove workspace request");
	});

	it("reports unreadable markers and incomplete unlink without removing data", async () => {
		const root = await mkdtemp(join(tmpdir(), "agentic-workspace-control-"));
		directories.push(root);
		const store = new WorkspaceRequestStore(root);
		const path = join(store.directory, "pending.json");
		await mkdir(path, { recursive: true });
		await expect(store.read()).rejects.toThrow("Could not read workspace request");
		await expect(store.delete("pending")).rejects.toThrow("Could not remove workspace request");
		await expect(store.delete("../escape")).rejects.toThrow("Invalid workspace request");
	});
});
