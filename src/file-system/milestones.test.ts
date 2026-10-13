import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serializeMilestone } from "../markdown/serializer.ts";
import { parseConfig } from "./config.ts";
import { MilestoneStore } from "./milestones.ts";

const directories: string[] = [];

afterEach(async () => {
	await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("MilestoneStore", () => {
	it("does not guess between duplicate title matches while preserving exact ID lookup", async () => {
		const root = await mkdtemp(join(tmpdir(), "backlog-milestones-"));
		directories.push(root);
		const active = join(root, "milestones");
		const archived = join(root, "archive");
		await mkdir(active, { recursive: true });
		await Bun.write(
			join(active, "m-1 - first.md"),
			serializeMilestone({ id: "m-1", title: "Release", description: "", rawContent: "" }),
		);
		await Bun.write(
			join(active, "m-2 - second.md"),
			serializeMilestone({ id: "m-2", title: "Release", description: "", rawContent: "" }),
		);
		const store = new MilestoneStore({
			activeDirectory: async () => active,
			archiveDirectory: async () => archived,
			ensureDirectory: async () => {},
			withCreateLock: async (operation) => operation(),
		});

		expect(await store.load("Release")).toBeNull();
		expect((await store.load("m-2"))?.title).toBe("Release");
	});
});

describe("filesystem config parsing", () => {
	it("accepts the legacy scalar default assignee without weakening list parsing", () => {
		const config = parseConfig('statuses: ["To Do"]\ndefault_assignee: "@alex"\n', "/tmp/backlog/config.yml");
		expect(config.defaultAssignee).toEqual(["@alex"]);
	});
});
