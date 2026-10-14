import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Core } from "../core/agentic-workspace.ts";
import { initializeTestProject } from "../test/test-utils.ts";
import { shellQuote } from "./agents/agent.ts";
import { getDefaultModeCatalog } from "./config.ts";
import { prepareAgentAsk, prepareAgentLaunch } from "./session-launch.ts";
import type { ModeProfile } from "./types.ts";

describe("session artifact context contract", () => {
	const roots: string[] = [];
	afterEach(async () => await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

	it("prepares canonical, current artifact context without creating declarations or exposing sidecar metadata", async () => {
		const root = await mkdtemp(join(tmpdir(), "session-artifact-context-"));
		roots.push(root);
		const core = new Core(root);
		await initializeTestProject(core, "Artifact context");
		await core.createTaskFromInput({ title: "Context task", status: "To Do" });
		const taskId = "task-1";
		const taskRoot = await core.filesystem.taskArtifacts.containerPath(taskId);
		const actualPath = "notes/actual.md";
		await core.filesystem.taskArtifacts.write(
			taskId,
			actualPath,
			new TextEncoder().encode("Current user-authored notes"),
		);
		const entries = await core.filesystem.taskArtifacts.list(taskId);
		const existingPaths = entries.map(({ path }) => resolve(taskRoot, path));
		expect(existingPaths).toContain(resolve(taskRoot, actualPath));
		const declared = getDefaultModeCatalog().profiles.plan;
		if (!declared) throw new Error("Default PLAN profile is missing.");
		const savedProfile: ModeProfile = {
			...declared,
			prompt: "Saved policy: declarations are optional suggestions.",
			artifacts: [
				{ path: "spec.md", purpose: "product specification" },
				{ path: "plan.md", purpose: "implementation plan" },
			],
		};
		const profile: ModeProfile = {
			...savedProfile,
			prompt: `${savedProfile.prompt}\n\nCurrent existing task artifact paths (informational, not an allowlist):\n- ${resolve(taskRoot, actualPath)}`,
		};
		const bootstrapPath = join(root, "bootstrap.md");
		await Bun.write(bootstrapPath, "Base task bootstrap");
		const prepared = await prepareAgentLaunch({ command: "pi", env: {}, prepare: "", bootstrap: "pi" }, bootstrapPath, {
			cwd: root,
			intent: { kind: "new" },
			profile,
			repositoryRoot: core.filesystem.rootDir,
			taskRoot,
		});
		try {
			const generated = prepared.command;
			const bootstrapMatch = generated.match(/profile-bootstrap\.md/);
			expect(bootstrapMatch).toBeTruthy();
			const bootstrapPathInCommand = generated.match(/'([^']*profile-bootstrap\.md)'/)?.[1];
			if (!bootstrapPathInCommand) throw new Error("Prepared command does not expose its profile bootstrap path.");
			const instructions = await readFile(bootstrapPathInCommand, "utf8");
			expect(instructions).toContain(`- ${resolve(taskRoot, actualPath)}`);
			expect(instructions).toContain("declarations are not an allowlist");
			expect(instructions).toContain("files are optional and never pre-created");
			expect(instructions).toContain("Saved policy: declarations are optional suggestions.");
			expect(instructions).toContain("Never approve artifacts or modify .artifacts.json; approval is user-only.");
			expect(existingPaths.some((path) => path.endsWith(".artifacts.json"))).toBe(false);
		} finally {
			await prepared.cleanup();
		}

		const binary = join(root, "opencode-v2.ts");
		await Bun.write(
			binary,
			`const args = process.argv.slice(2); if (args.includes("--version")) { console.log("2.1.0"); process.exit(0); } if (args.includes("api") && args.includes("/api/session/ses_context")) console.log(JSON.stringify({ data: { id: "ses_context" } }));`,
		);
		const ask = await prepareAgentAsk(
			{
				command: `${shellQuote(process.execPath)} ${shellQuote(binary)}`,
				env: { SESSION_ID: "ses_context" },
				prepare: "",
				bootstrap: "opencode-v2",
			},
			"ses_context",
			"Review the current notes",
			profile,
			{ repositoryRoot: core.filesystem.rootDir, taskRoot },
		);
		try {
			expect(ask.command).toContain(resolve(taskRoot, "spec.md"));
			expect(ask.command).toContain("Saved policy: declarations are optional suggestions.");
		} finally {
			await ask.cleanup();
		}
	});
});
