import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Core } from "../../controller/agentic-workspace.ts";
import { AGENT_SESSION_STATUS, type AgentSession } from "../../model/session/types.ts";
import type { ProcessRunner, TmuxServer } from "../../runtime/session-process.ts";
import { SessionProcess } from "../../runtime/session-process.ts";
import {
	assertSameSession,
	executionPresetWithEnvironment,
	pathContextForSession,
	prepareSessionLaunch,
	profileFor,
	resolveModeId,
	resumeExistingTarget,
	tagNativeSessionPane,
} from "../../runtime/session-service-mechanics.ts";
import { WORKSPACE_CONTEXT_ENV } from "../../runtime/workspace-context.ts";
import { resolveSessionPreset, upsertAgentConfiguration } from "../../storage/config.ts";
import { SessionStore } from "../../storage/session-store.ts";
import { registerPromptAgent } from "../agent-test-helpers.ts";
import { coreFileSystem, initializeTestProject } from "../test-utils.ts";

let restorePromptAgent: (() => void) | undefined;
beforeAll(() => {
	restorePromptAgent = registerPromptAgent("pi");
});
afterAll(() => restorePromptAgent?.());

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
		const opencode = join(root, "test-bin", "opencode");
		await mkdir(join(root, "test-bin"));
		await writeFile(opencode, "#!/bin/sh\nprintf '1.19.3\\n'\n");
		await chmod(opencode, 0o700);
		await upsertAgentConfiguration(core, "project", {
			selectedPreset: "opencode",
			presets: { opencode: { command: [opencode, "{prompt}"], env: {}, prepare: "", bootstrap: "pi" } },
		});
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
				taskDir: await coreFileSystem(core).taskArtifacts.containerPath(task.id),
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
		const resolved = await resolveSessionPreset(core, { taskId: task.id, preset: "opencode" });
		expect(resolved.command).toEqual([opencode, "{prompt}"]);
		const preset = await executionPresetWithEnvironment(core, task.id, "opencode", pathContext);
		const modeId = await resolveModeId(core, store, task.id, "build");
		const resolvedProfile = await profileFor(core, modeId, preset.preset);
		const result = await prepareSessionLaunch(
			core,
			store,
			process,
			server,
			task,
			record,
			modeId,
			resolvedProfile.preset,
			{ yoloMode: false, worktreePerTask: false },
			{
				intent: { kind: "new" },
				profile: resolvedProfile.profile,
				prepare: "setup",
				bootstrapBeforeCreate: true,
				environment: { ...preset.environment, PREPARATION_MARKER: "resolved" },
			},
		);

		expect(events).toEqual(["assert-resources", "bootstrap-ready", "create", "prepare-command", "prepare-pane"]);
		expect(launchEnvironment?.PREPARATION_MARKER).toBe("resolved");
		expect(launchEnvironment?.[WORKSPACE_CONTEXT_ENV]).toBeDefined();
		expect(await pathContextForSession(core, task, record)).toEqual(pathContext);
		expect(result.paneId).toBe("%1");
		expect(result.agent).toBeDefined();
		expect(result.prepared.command).toContain("opencode");
		expect(result.prepared.env.PREPARATION_MARKER).toBe("resolved");
		expect(result.prepared.env[WORKSPACE_CONTEXT_ENV]).toBeDefined();
		expect(result.prepared.resources).toBeDefined();
		expect(typeof result.prepared.cleanup).toBe("function");
		expect(Object.keys(result.prepared)).toEqual(expect.arrayContaining(["command", "env", "resources", "cleanup"]));
		await result.prepared.cleanup();
	});

	it("keeps exact-resume identity validation and delegates settlement after cleanup", async () => {
		const root = await mkdtemp(join(tmpdir(), "session-resume-mechanics-"));
		roots.push(root);
		const core = new Core(root);
		await initializeTestProject(core, "Resume mechanics");
		await core.createTaskFromInput({ title: "Resume task", status: "To Do" });
		const taskId = "TASK-1";
		const task = await core.loadTaskById(taskId, { includeArchived: true });
		if (!task) throw new Error("Test task could not be loaded");
		const store = new SessionStore(root, { run: async () => ({ exitCode: 0, stdout: "", stderr: "" }) });
		const record: AgentSession = {
			id: "exact-resume-session",
			taskId,
			preset: "test-pi",
			tmuxName: "agentic-exact-resume-test",
			cwd: root,
			pathContext: {
				projectDir: root,
				worktreeDir: root,
				taskDir: await coreFileSystem(core).taskArtifacts.containerPath(taskId),
			},
			createdAt: new Date().toISOString(),
			status: AGENT_SESSION_STATUS.STOPPED,
			nativeSessionId: "native-exact-resume",
			outputPath: join(root, "resume.log"),
			bootstrapPath: join(root, "resume.md"),
		};
		await store.mutateMode(taskId, "build", async (history) => {
			history.sessions.push(record);
			history.activeSessionId = record.id;
		});
		expect(() => assertSameSession(record, { ...record, nativeSessionId: undefined })).toThrow(
			"native identity changed",
		);

		const events: string[] = [];
		const process = new PreparationProcess(
			{ run: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
			root,
			new PreparationServer(root, taskId, record.id),
			async () => root,
			events,
			() => undefined,
		);
		process.kill = async () => {
			events.push("cleanup");
		};
		let settled = false;
		const resumePreset = { command: ["pi"], env: {}, prepare: "", bootstrap: "pi" as const };
		const { profile: resumeProfile } = await profileFor(core, "build", resumePreset);
		const result = await resumeExistingTarget(
			core,
			store,
			process,
			task,
			{
				record,
				preset: resumePreset,
				profile: resumeProfile,
				environment: {},
				settings: { yoloMode: false, worktreePerTask: false },
			},
			async (_taskId, observed, preserveQueuedRequest) => {
				expect(observed.id).toBe(record.id);
				expect(preserveQueuedRequest).toBe(false);
				expect(events).toEqual(["cleanup"]);
				settled = true;
			},
		);
		expect(settled).toBe(true);
		expect(result.record.id).toBe(record.id);
		expect(result.preflight.options.intent).toEqual({ kind: "resume", nativeSessionId: "native-exact-resume" });
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
