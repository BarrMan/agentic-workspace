import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Core } from "../core/agentic-workspace.ts";
import { initializeTestProject } from "../test/test-utils.ts";
import type { ProcessRunner, TmuxServer } from "./session-process.ts";
import { SessionProcess } from "./session-process.ts";
import { pathContextForSession, prepareSessionLaunch, tagNativeSessionPane } from "./session-service-mechanics.ts";
import { SessionStore } from "./session-store.ts";
import { AGENT_SESSION_STATUS, type AgentPreset, type AgentSession } from "./types.ts";
import { WORKSPACE_CONTEXT_ENV } from "./workspace-context.ts";

describe("session preparation mechanics", () => {
	const roots: string[] = [];
	afterEach(async () => {
		await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
	});

	it("refuses a project-root mismatch and preserves preparation inputs, order, and launch hooks", async () => {
		const root = await mkdtemp(join(tmpdir(), "session-preparation-mechanics-"));
		roots.push(root);
		const core = new Core(root);
		await initializeTestProject(core, "Preparation mechanics");
		await core.createTaskFromInput({ title: "Preparation task", status: "To Do" });
		const task = { id: "TASK-1", title: "Preparation task" };
		const record: AgentSession = {
			id: "session-preparation-test",
			taskId: task.id,
			preset: "test-pi",
			tmuxName: "agentic-preparation-test",
			cwd: root,
			pathContext: {
				projectDir: root,
				worktreeDir: root,
				taskDir: await core.filesystem.taskArtifacts.containerPath(task.id),
			},
			createdAt: new Date().toISOString(),
			status: AGENT_SESSION_STATUS.STARTING,
			outputPath: join(root, "output.log"),
			bootstrapPath: join(root, "bootstrap.md"),
		};
		const server = new PreparationServer(root, task.id, record.id);
		const pathContext = record.pathContext;
		if (!pathContext) throw new Error("Missing test session path context");
		const mismatch = { ...record, pathContext: { ...pathContext, projectDir: tmpdir() } };
		await expect(tagNativeSessionPane(core, server, mismatch, "%1")).rejects.toThrow(
			"mismatched canonical project root",
		);

		const events: string[] = [];
		let launchEnvironment: Record<string, string> | undefined;
		const runner: ProcessRunner = {
			run: async (_args, options) => {
				events.push("prepare-command");
				launchEnvironment = options?.env;
				return { exitCode: 0, stdout: "", stderr: "" };
			},
		};
		const process = new PreparationProcess(
			runner,
			root,
			server,
			async () => root,
			events,
			(env) => {
				launchEnvironment = env;
			},
		);
		const store = new SessionStore(root, runner);
		const preset: AgentPreset = { command: "pi", env: {}, prepare: "setup", bootstrap: "pi" };
		const result = await prepareSessionLaunch(
			core,
			store,
			process,
			server,
			task,
			record,
			"build",
			preset,
			{ yoloMode: false, worktreePerTask: false },
			{
				intent: { kind: "new" },
				prepare: "setup",
				bootstrapBeforeCreate: true,
				environment: { PREPARATION_MARKER: "resolved" },
			},
		);

		expect(events).toEqual(["assert-resources", "bootstrap-ready", "create", "prepare-command", "prepare-pane"]);
		expect(launchEnvironment?.PREPARATION_MARKER).toBe("resolved");
		expect(launchEnvironment?.[WORKSPACE_CONTEXT_ENV]).toBeDefined();
		expect(await pathContextForSession(core, task, record)).toEqual(pathContext);
		expect(result.paneId).toBe("%1");
		expect(result.agent).toBeDefined();
		expect(result.prepared.command).toContain("pi");
		expect(result.prepared.env.PREPARATION_MARKER).toBe("resolved");
		expect(result.prepared.env[WORKSPACE_CONTEXT_ENV]).toBeDefined();
		expect(result.prepared.resources).toBeDefined();
		expect(typeof result.prepared.cleanup).toBe("function");
		expect(Object.keys(result.prepared)).toEqual(expect.arrayContaining(["command", "env", "resources", "cleanup"]));
		await result.prepared.cleanup();
	});
});

class PreparationProcess extends SessionProcess {
	constructor(
		runner: ProcessRunner,
		root: string,
		server: TmuxServer,
		stateRoot: () => Promise<string>,
		private readonly events: string[],
		private readonly onCreateEnvironment: (environment: Record<string, string>) => void,
	) {
		super(runner, root, server, stateRoot);
	}

	override async assertNoPreparedResources(): Promise<void> {
		this.events.push("assert-resources");
	}

	override async create(_session: AgentSession, environment: Record<string, string>): Promise<void> {
		if (await Bun.file(_session.bootstrapPath).exists()) this.events.push("bootstrap-ready");
		this.events.push("create");
		this.onCreateEnvironment(environment);
	}

	override async paneId(): Promise<string> {
		return "%1";
	}

	override async prepare(_command: string, _cwd: string, environment: Record<string, string>): Promise<void> {
		this.events.push("prepare-command");
		this.onCreateEnvironment(environment);
	}

	override async preparePane(): Promise<void> {
		this.events.push("prepare-pane");
	}
}

class PreparationServer implements TmuxServer {
	constructor(
		private readonly root: string,
		private readonly taskId: string,
		private readonly sessionId: string,
	) {}

	async newSession() {
		return { activePane: undefined };
	}

	async panes() {
		return [];
	}

	async cmd(command: string, args: readonly string[] = []) {
		if (command === "list-panes") return [`${this.root}\t${this.taskId}\t${this.sessionId}\t%1\t\t`];
		if (command === "set-option") return [];
		throw new Error(`Unexpected tmux command: ${command} ${args.join(" ")}`);
	}
}
