import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { chmod, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../core/agentic-workspace.ts";
import { serializeDecision } from "../markdown/serializer.ts";
import type { Decision } from "../types/index.ts";
import { hasContentIdentityIssues } from "../utils/duplicate-detection.ts";
import { AmbiguousIdError, decisionIdKey } from "../utils/entity-id.ts";
import {
	coreFileSystem,
	createUniqueTestDir,
	initializeFilesystemTestProject,
	isWindows,
	safeCleanup,
} from "./test-utils.ts";

let TEST_DIR: string;
let core: Core;

function makeDecision(id: string, title: string): Decision {
	return {
		id,
		title,
		date: "2026-08-01 00:00",
		status: "proposed",
		context: "",
		decision: "",
		consequences: "",
		rawContent: "",
	};
}

async function writeDecision(filename: string, decision: Decision): Promise<string> {
	const filePath = join(coreFileSystem(core).decisionsDir, filename);
	await mkdir(coreFileSystem(core).decisionsDir, { recursive: true });
	await Bun.write(filePath, serializeDecision(decision));
	return filePath;
}

// gray-matter rejects an unterminated flow collection, so these files cannot be parsed at all.
function malformedFrontmatter(id: string): string {
	return `---\nid: ${id}\ntitle: [unterminated\n---\n\n${id} body\n`;
}

async function writeRaw(directory: string, relativePath: string, content: string): Promise<void> {
	const filePath = join(directory, ...relativePath.split("/"));
	await mkdir(join(filePath, ".."), { recursive: true });
	await Bun.write(filePath, content);
}

beforeEach(async () => {
	TEST_DIR = createUniqueTestDir("content-identity");
	await mkdir(TEST_DIR, { recursive: true });
	core = new Core(TEST_DIR);
	await initializeFilesystemTestProject(core, "Content identity");
});

afterEach(async () => {
	await safeCleanup(TEST_DIR);
});

describe("blank decision IDs", () => {
	it("have no canonical lookup key", () => {
		expect(decisionIdKey("")).toBeNull();
		expect(decisionIdKey("2")).toBe("decision-2");
	});

	it("keeps a decision without an id in frontmatter unaddressable", async () => {
		await writeDecision("decision-blank.md", { ...makeDecision("", "Unidentified decision"), id: "" });

		expect((await coreFileSystem(core).listDecisions()).map((decision) => decision.title)).toContain(
			"Unidentified decision",
		);

		expect(await coreFileSystem(core).loadDecision("")).toBeNull();
		expect(await coreFileSystem(core).loadDecision("decision-")).toBeNull();
	});
});

describe("ambiguous content identity", () => {
	it("does not delete ambiguous files when saving normalized identities", async () => {
		await writeDecision("decision-1 - Alpha.md", makeDecision("decision-1", "Alpha"));
		await writeDecision("decision-01 - Beta.md", makeDecision("decision-01", "Beta"));

		await expect(
			coreFileSystem(core).saveDecision(makeDecision(" DECISION-001 ", "Replacement")),
		).rejects.toBeInstanceOf(AmbiguousIdError);
		expect(await Bun.file(join(coreFileSystem(core).decisionsDir, "decision-1 - Alpha.md")).exists()).toBe(true);
	});

	it("normalizes decision IDs while preserving zero spelling in saved filenames", async () => {
		const decision = makeDecision(" DECISION-01 ", "Padded");
		await coreFileSystem(core).saveDecision(decision);
		expect(decision.id).toBe("decision-01");
		expect(await Bun.file(join(coreFileSystem(core).decisionsDir, "decision-01 - Padded.md")).exists()).toBe(true);
	});

	it("rejects path separators and empty ID bodies before writing", async () => {
		for (const id of ["decision-", "decision-a/b", "decision-a\\b"])
			await expect(coreFileSystem(core).saveDecision(makeDecision(id, "Invalid"))).rejects.toThrow(
				/Invalid decision ID/,
			);
	});

	it("fails closed when a decision ID matches several files", async () => {
		await writeDecision("decision-1 - Alpha.md", makeDecision("decision-1", "Alpha"));
		await writeDecision("decision-01 - Beta.md", makeDecision("decision-01", "Beta"));

		const error = await coreFileSystem(core)
			.loadDecision("decision-1")
			.catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(AmbiguousIdError);
		expect((error as AmbiguousIdError).message).toContain("Decision ID decision-1 is ambiguous; 2 files match:");
		expect((error as AmbiguousIdError).candidates).toEqual(["decision-01 - Beta.md", "decision-1 - Alpha.md"]);
	});

	it("still resolves unambiguous IDs", async () => {
		await writeDecision("decision-2 - Beta.md", makeDecision("decision-2", "Beta"));

		expect((await coreFileSystem(core).loadDecision("2"))?.title).toBe("Beta");
		expect(await coreFileSystem(core).loadDecision("decision-9")).toBeNull();
	});
});

describe("diagnoseContentIdentity", () => {
	it("reports nothing for a healthy project", async () => {
		await writeDecision("decision-1 - Alpha.md", makeDecision("decision-1", "Alpha"));

		expect((await core.diagnoseContentIdentity()).decisions).toEqual({
			duplicates: [],
			missingIds: [],
			unreadable: [],
		});
	});

	it("groups duplicate decision IDs by canonical ID", async () => {
		await writeDecision("decision-3 - Gamma.md", makeDecision("decision-3", "Gamma"));
		await writeDecision("decision-003 - Delta.md", makeDecision("decision-003", "Delta"));

		const report = await core.diagnoseContentIdentity();
		expect(report.decisions.duplicates).toEqual([
			{
				id: "decision-3",
				paths: [
					"agentic-workspace/decisions/decision-003 - Delta.md",
					"agentic-workspace/decisions/decision-3 - Gamma.md",
				],
			},
		]);
	});

	it("reports decisions with no id as malformed", async () => {
		await writeDecision("decision-blank.md", { ...makeDecision("", "Unidentified decision"), id: "" });

		const report = await core.diagnoseContentIdentity();
		expect(report.decisions.missingIds).toEqual(["agentic-workspace/decisions/decision-blank.md"]);
		expect(report.decisions.duplicates).toEqual([]);
	});
});

describe("unreadable content files", () => {
	it("keeps every other decision resolvable", async () => {
		await writeDecision("decision-1 - Alpha.md", makeDecision("decision-1", "Alpha"));
		await writeRaw(coreFileSystem(core).decisionsDir, "decision-2 - Broken.md", malformedFrontmatter("decision-2"));

		const unreadableDecisions: string[] = [];
		const decisions = await coreFileSystem(core).listDecisions(unreadableDecisions);
		expect(decisions.map((decision) => decision.id)).toEqual(["decision-1"]);
		expect(unreadableDecisions).toEqual(["decision-2 - Broken.md"]);

		expect((await coreFileSystem(core).loadDecision("decision-1"))?.title).toBe("Alpha");
	});

	it("are reported as findings so identity is never called healthy on an unread file", async () => {
		await writeRaw(coreFileSystem(core).decisionsDir, "decision-2 - Broken.md", malformedFrontmatter("decision-9"));

		const report = await core.diagnoseContentIdentity();
		expect(report.decisions.unreadable).toEqual(["agentic-workspace/decisions/decision-2 - Broken.md"]);
		expect(hasContentIdentityIssues(report)).toBe(true);
	});
});

describe("unreadable content directories", () => {
	// chmod has no effect for root, and Windows ignores these mode bits, so confirm the directory
	// really became unreadable before asserting on the finding.
	async function lockDirectory(directory: string): Promise<boolean> {
		if (isWindows()) return false;
		await chmod(directory, 0o000);
		try {
			await Array.fromAsync(new Bun.Glob("*.md").scan({ cwd: directory, followSymlinks: true }));
			await chmod(directory, 0o755);
			return false;
		} catch {
			return true;
		}
	}

	it("reports a directory that cannot be scanned instead of calling identity healthy", async () => {
		const locked = await lockDirectory(coreFileSystem(core).decisionsDir);
		if (!locked) return;

		try {
			const unreadable: string[] = [];
			expect(await coreFileSystem(core).listDecisions(unreadable)).toEqual([]);
			expect(unreadable).toEqual([""]);

			const report = await core.diagnoseContentIdentity();
			expect(report.decisions.unreadable).toEqual(["agentic-workspace/decisions"]);
			expect(hasContentIdentityIssues(report)).toBe(true);
		} finally {
			await chmod(coreFileSystem(core).decisionsDir, 0o755);
		}
	});

	it("still treats a directory that does not exist as empty", async () => {
		// A project that has never created decisions is healthy, not broken.
		const bareDir = createUniqueTestDir("content-identity-bare");
		await mkdir(bareDir, { recursive: true });
		const bare = new Core(bareDir);
		await initializeFilesystemTestProject(bare, "Bare project");
		await safeCleanup(coreFileSystem(bare).decisionsDir);

		try {
			const unreadable: string[] = [];
			expect(await coreFileSystem(bare).listDecisions(unreadable)).toEqual([]);
			expect(unreadable).toEqual([]);
			expect(hasContentIdentityIssues(await bare.diagnoseContentIdentity())).toBe(false);
		} finally {
			await safeCleanup(bareDir);
		}
	});
});
