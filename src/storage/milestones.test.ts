import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseConfig } from "./config-codec.ts";
import { serializeMilestone } from "./markdown/serializer.ts";
import { MilestoneStore } from "./milestones.ts";

const directories: string[] = [];

afterEach(async () => {
	await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("MilestoneStore", () => {
	it("loads milestones by exact ID only", async () => {
		const root = await mkdtemp(join(tmpdir(), "agentic-workspace-milestones-"));
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
		expect(await store.load("1")).toBeNull();
		expect((await store.load("m-2"))?.title).toBe("Release");
	});
});

describe("filesystem config parsing", () => {
	it("accepts a scalar default assignee without weakening list parsing", () => {
		const config = parseConfig('statuses: ["To Do"]\ndefault_assignee: "@alex"\n', "/tmp/agentic-workspace/config.yml");
		expect(config.defaultAssignee).toEqual(["@alex"]);
	});

	it("deduplicates default assignee identities while preserving first spelling", () => {
		const config = parseConfig('default_assignee: ["@Alice", "alice", " Bob "]\n', "/tmp/agentic-workspace/config.yml");
		expect(config.defaultAssignee).toEqual(["@Alice", "Bob"]);
	});
});
