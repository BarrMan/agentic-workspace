import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { AgentPreset, ModeProfile, RuntimeAgentBootstrap } from "../model/session/types.ts";
import type { Agent, NativeIdentity, SessionIntent } from "./agents/agent.ts";
import { agentFor } from "./agents/agents.ts";
import { resolveLaunchPreset } from "./agents/opencode-resolution.ts";
import { profileInstructions } from "./agents/profile.ts";
import { appendArguments } from "./bootstrap.ts";
import { type PreparedLaunchResources, preparedLaunchResources } from "./completion-supervisor-resources.ts";
import { prepareHarnessEnvironment } from "./harness-environment.ts";
import { STATUS_DIR_ENV, sessionActivityDir } from "./status-hooks.ts";
import { AGENTIC_WORKSPACE_TASK_SKILL_FILE } from "./task-skill.ts";

const FORBIDDEN_ENV = [
	"AGENTIC_WORKSPACE_CWD",
	"AGENTIC_WORKSPACE_TASK_ID",
	"AGENTIC_WORKSPACE_SESSION_ID",
	"AGENTIC_WORKSPACE_PROJECT_ROOT",
	"TASK_ID",
	"SESSION_ID",
] as const;

export interface PreparedAgentLaunch {
	/** Execution-only adapter identity for activity probes. */
	bootstrap?: RuntimeAgentBootstrap;
	command: string;
	env: Record<string, string>;
	/** The adapter-established native identity, or absent when the identity is deferred. */
	identity?: NativeIdentity;
	/** Optional transient exact-session confirmation supplied by the provider adapter. */
	confirmSession?: (expectedNativeSessionId: string) => Promise<boolean>;
	/** Non-blocking preset-environment warnings, available to native workspace presentation. */
	warnings?: string[];
	resources: PreparedLaunchResources;
	/** Release only after the agent stops, or if starting the agent fails. */
	cleanup(): Promise<void>;
}

export type ReadinessReceiptName = "initialized" | "prompt-accepted";

/** Receipt paths are scoped to the unique owned directory for this launch, never the session activity directory. */
export function readinessReceiptPath(launchDirectory: string, name: ReadinessReceiptName): string {
	return join(launchDirectory, name);
}

export function initializedReceiptPath(launchDirectory: string): string {
	return readinessReceiptPath(launchDirectory, "initialized");
}

export function promptAcceptedReceiptPath(launchDirectory: string): string {
	return readinessReceiptPath(launchDirectory, "prompt-accepted");
}

export interface PrepareAgentLaunchOptions {
	/** The effective session cwd: the project root, or the task worktree when worktree-per-task is on and it exists. */
	cwd: string;
	/** Whether this launch starts a fresh conversation or resumes one by its exact native ID. */
	intent: SessionIntent;
	title?: string;
	/** Durable session id, used to identify this launch's owned status sidecar. */
	sessionId?: string;
	/** Append the provider's verified auto-approval flag so the session does not prompt for permissions. */
	yolo?: boolean;
	/** Resolved immutable mode profile. */
	profile: ModeProfile;
	/** Already-composed prompt for the Harness path; delivered through the provider CLI argument. */
	prompt?: string;
	repositoryRoot?: string;
	taskRoot?: string;
	/** A resolved environment shared by session creation/preparation and final launch. */
	environment?: Record<string, string>;
}

export interface PreflightedAgentLaunch {
	preset: AgentPreset;
	options: PrepareAgentLaunchOptions;
	agent: Agent;
	policyPreset: AgentPreset;
	command: string;
	projectDir: string;
	taskDir: string;
	environment: Record<string, string>;
	adapterResult: unknown;
}

function quote(value: string): string {
	return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function warnEnvironment(text: string): void {
	process.stderr.write(`warning: ${text}\n`);
}

function sanitizeLaunchEnvironment(environment: Record<string, string>): Record<string, string> {
	const clean = { ...environment };
	for (const name of FORBIDDEN_ENV) delete clean[name];
	return clean;
}

async function launchEnvironment(
	preset: AgentPreset,
	paths: { projectDir: string; worktreeDir: string; taskDir: string },
	resolved?: Record<string, string>,
): Promise<Record<string, string>> {
	if (!resolved)
		return await prepareHarnessEnvironment(preset.env, paths, {
			onWarning: warnEnvironment,
		});
	return sanitizeLaunchEnvironment({
		...resolved,
		AGENTIC_WORKSPACE_PROJECT_DIR: paths.projectDir,
		AGENTIC_WORKSPACE_WORKTREE_DIR: paths.worktreeDir,
		AGENTIC_WORKSPACE_TASK_DIR: paths.taskDir,
	});
}

export async function preflightAgentLaunch(
	configuredPreset: AgentPreset,
	bootstrapPath: string,
	requestedOptions: PrepareAgentLaunchOptions,
): Promise<PreflightedAgentLaunch> {
	const projectDir = requestedOptions.repositoryRoot ?? requestedOptions.cwd;
	const taskDir = requestedOptions.taskRoot ?? dirname(bootstrapPath);
	const paths = { projectDir, worktreeDir: requestedOptions.cwd, taskDir };
	const environment = await launchEnvironment(configuredPreset, paths, requestedOptions.environment);
	let preset = configuredPreset;
	const options = { ...requestedOptions, environment };
	preset = await resolveLaunchPreset(preset, { cwd: options.cwd, env: environment });
	const agent = agentFor(preset.bootstrap);
	if (!agent) throw new Error(`No agent registered for bootstrap type ${preset.bootstrap}.`);
	const profiledPreset = agent.prepareProfile ? agent.prepareProfile(options.profile, preset) : preset;
	const policyPreset = agent.sanitizeLaunchPreset(profiledPreset);
	let command = policyPreset.command;
	if (options.yolo) {
		const yoloFlag = agent.yoloFlag();
		if (yoloFlag) command = appendArguments(command, yoloFlag);
	}
	const request = {
		preset: { ...policyPreset, command },
		cwd: options.cwd,
		bootstrapPath,
		nativeSessionId: options.intent.kind === "resume" ? options.intent.nativeSessionId : undefined,
		resume: options.intent.kind === "resume",
		env: environment,
		sessionId: options.sessionId,
		profile: options.profile,
	};
	const adapterResult = agent.preflightLaunch
		? await agent.preflightLaunch(request)
		: request.resume
			? agent.resumeCommand(request)
			: agent.launchCommand(request);
	return { preset, options, agent, policyPreset, command, projectDir, taskDir, environment, adapterResult };
}

/** Only task-manager launches receive this external, process-scoped skill directory. */
export async function prepareAgentLaunch(
	configuredPreset: AgentPreset,
	bootstrapPath: string,
	requestedOptions: PrepareAgentLaunchOptions,
	preflight?: PreflightedAgentLaunch,
): Promise<PreparedAgentLaunch> {
	const checked = preflight ?? (await preflightAgentLaunch(configuredPreset, bootstrapPath, requestedOptions));
	return await prepareAgentLaunchResources(bootstrapPath, checked, requestedOptions.environment);
}

/** Prepare resources from the exact validated request returned by preflight. */
export async function prepareAgentLaunchResources(
	bootstrapPath: string,
	checked: PreflightedAgentLaunch,
	requestedEnvironment: Record<string, string> | undefined = checked.options.environment,
): Promise<PreparedAgentLaunch> {
	const { preset, options, agent, policyPreset, command, projectDir, taskDir, environment, adapterResult } = checked;

	const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-agent-skill-"));
	// The hook file lives in the temp dir; the sidecar lives at its deterministic per-session path
	// (so another AgenticWorkspace process can read it). Both are removed together on stop.
	const statusDir =
		options.sessionId && agent.hookBacked ? sessionActivityDir(dirname(bootstrapPath), options.sessionId) : undefined;
	const cleanup = async () => {
		await rm(directory, { recursive: true, force: true });
		if (statusDir) await rm(statusDir, { recursive: true, force: true });
	};
	try {
		const skillRoot = join(directory, "skills");
		const skillDirectory = join(skillRoot, "agentic-workspace-task-management");
		await mkdir(skillDirectory, { recursive: true, mode: 0o700 });
		const skillPath = join(skillDirectory, "SKILL.md");
		await writeFile(skillPath, AGENTIC_WORKSPACE_TASK_SKILL_FILE, { mode: 0o600 });
		// The identity profile bootstrap is the launch prompt file; the mode profile is always
		// appended unless a fully composed prompt is supplied.
		const effectiveBootstrapPath = join(directory, "profile-bootstrap.md");
		if (options.prompt !== undefined) {
			await writeFile(effectiveBootstrapPath, options.prompt, { mode: 0o600 });
		} else {
			const base = (await Bun.file(bootstrapPath).exists()) ? await Bun.file(bootstrapPath).text() : "";
			await writeFile(
				effectiveBootstrapPath,
				`${base}\n\n${profileInstructions(options.profile, projectDir, taskDir)}\n`,
				{ mode: 0o600 },
			);
		}
		const env = { ...environment };
		if (requestedEnvironment) {
			if (requestedEnvironment.AGENTIC_WORKSPACE_WORKSPACE_CONTEXT === undefined)
				delete env.AGENTIC_WORKSPACE_WORKSPACE_CONTEXT;
			else env.AGENTIC_WORKSPACE_WORKSPACE_CONTEXT = requestedEnvironment.AGENTIC_WORKSPACE_WORKSPACE_CONTEXT;
		}
		// Process-scoped status sidecar: unconditional for every caller of this chokepoint, so a
		// CLI-created session is indistinguishable from a workspace-created one. Created inside the
		// owned mkdtemp root (never the parent process environment, so it cannot leak) and removed
		// with `cleanup()`.
		if (statusDir) env[STATUS_DIR_ENV] = statusDir;
		const prepared = await agent.prepare({
			preset: { ...policyPreset, command },
			cwd: options.cwd,
			bootstrapPath: effectiveBootstrapPath,
			profile: options.profile,
			repositoryRoot: projectDir,
			taskRoot: taskDir,
			directory,
			skillRoot,
			skillPath,
			statusDir,
			sessionId: options.sessionId,
			env,
			intent: options.intent,
			title: options.title,
			preflightResult: adapterResult,
		});
		const preparedEnvironment = sanitizeLaunchEnvironment({
			...prepared.env,
			AGENTIC_WORKSPACE_PROJECT_DIR: projectDir,
			AGENTIC_WORKSPACE_WORKTREE_DIR: options.cwd,
			AGENTIC_WORKSPACE_TASK_DIR: taskDir,
		});
		// A shell-owned trap also cleans durable tmux agents after this CLI has exited.
		// The trap removes only our mkdtemp directory, never any project or user-owned path.
		const ownedPaths = [directory, ...(statusDir ? [statusDir] : [])];
		const resources = await preparedLaunchResources(directory, statusDir);
		const script = `unset ${FORBIDDEN_ENV.join(" ")}; trap ${quote(`rm -rf -- ${ownedPaths.map((path) => quote(path)).join(" ")}`)} EXIT; trap 'exit 129' HUP; trap 'exit 143' TERM; (${prepared.command})`;
		return {
			bootstrap: preset.bootstrap,
			command: `/bin/sh -c ${quote(script)}`,
			env: preparedEnvironment,
			identity: prepared.identity,
			confirmSession: prepared.confirmSession,
			resources,
			cleanup,
		};
	} catch (error) {
		await cleanup();
		throw error;
	}
}

/** Shared profile-aware ask preparation. The caller owns cleanup through command completion. */
export async function prepareAgentAsk(
	configuredPreset: AgentPreset,
	nativeSessionId: string,
	question: string,
	profile: ModeProfile,
	roots: { repositoryRoot: string; taskRoot: string; cwd?: string },
): Promise<{ command: string; env: Record<string, string>; cleanup(): Promise<void> }> {
	const worktreeDir = roots.cwd ?? roots.repositoryRoot;
	const env = await launchEnvironment(configuredPreset, {
		projectDir: roots.repositoryRoot,
		worktreeDir,
		taskDir: roots.taskRoot,
	});
	const preset = await resolveLaunchPreset(configuredPreset, { cwd: worktreeDir, env });
	const preflight = await preflightAgentLaunch(preset, join(tmpdir(), "agentic-workspace-agent-ask-bootstrap.md"), {
		cwd: worktreeDir,
		intent: { kind: "resume", nativeSessionId },
		profile,
		repositoryRoot: roots.repositoryRoot,
		taskRoot: roots.taskRoot,
		environment: env,
	});
	const agent = preflight.agent;
	const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-agent-ask-"));
	const cleanup = () => rm(directory, { recursive: true, force: true });
	try {
		const effective = agent.prepareProfile ? agent.prepareProfile(profile, preflight.preset) : preflight.preset;
		const contextualQuestion = `${profileInstructions(profile, roots.repositoryRoot, roots.taskRoot)}\n\nUser request:\n${question}`;
		const prepared = agent.prepareBeforeAsk
			? await (async () => {
					const skillRoot = join(directory, "skills");
					const skillDirectory = join(skillRoot, "agentic-workspace-task-management");
					const skillPath = join(skillDirectory, "SKILL.md");
					await mkdir(skillDirectory, { recursive: true, mode: 0o700 });
					await writeFile(skillPath, AGENTIC_WORKSPACE_TASK_SKILL_FILE, { mode: 0o600 });
					return await agent.prepare({
						preset: effective,
						cwd: worktreeDir,
						bootstrapPath: join(directory, "ask-bootstrap.md"),
						directory,
						skillRoot,
						skillPath,
						env,
						intent: { kind: "resume", nativeSessionId },
						profile,
						repositoryRoot: roots.repositoryRoot,
						taskRoot: roots.taskRoot,
						preflightResult: preflight.adapterResult,
					});
				})()
			: { command: effective.command, env };
		const command = agent.askCommand({
			preset: effective,
			nativeSessionId,
			question: contextualQuestion,
		});
		return {
			command: `/bin/sh -c ${quote(`unset ${FORBIDDEN_ENV.join(" ")}; exec ${command}`)}`,
			env: sanitizeLaunchEnvironment({
				...prepared.env,
				AGENTIC_WORKSPACE_PROJECT_DIR: roots.repositoryRoot,
				AGENTIC_WORKSPACE_WORKTREE_DIR: worktreeDir,
				AGENTIC_WORKSPACE_TASK_DIR: roots.taskRoot,
			}),
			cleanup,
		};
	} catch (error) {
		await cleanup();
		throw error;
	}
}
