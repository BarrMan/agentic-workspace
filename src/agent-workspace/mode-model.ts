import type { Core } from "../core/backlog.ts";
import { resolveLaunchPreset } from "./agents/opencode-resolution.ts";
import { commandArguments } from "./agents/profile.ts";
import { resolveSessionPreset } from "./config.ts";
import { prepareHarnessEnvironment } from "./harness-environment.ts";
import { BunRunner } from "./session-process.ts";
import { SessionStore } from "./session-store.ts";
import type { AgentPreset, AgentSession, RuntimeAgentBootstrap } from "./types.ts";
import { readWorkspaceContext } from "./workspace-context.ts";

const EXPORT_TIMEOUT_MS = 8_000;
const EXPORT_OUTPUT_LIMIT = 4 * 1024 * 1024;

export interface CurrentModelDependencies {
	context?: typeof readWorkspaceContext;
	readSessions?: (taskId: string) => Promise<Awaited<ReturnType<SessionStore["read"]>>>;
	exportSession?: (session: AgentSession, preset: AgentPreset, harness: RuntimeAgentBootstrap) => Promise<string>;
}

function parseExport(stdout: string, nativeSessionId: string): { provider: string; model: string } {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch {
		throw new Error("OpenCode export did not return valid session JSON.");
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
		throw new Error("OpenCode export returned an invalid session document.");
	const document = parsed as Record<string, unknown>;
	const info = document.info && typeof document.info === "object" ? (document.info as Record<string, unknown>) : {};
	if (info.id !== nativeSessionId)
		throw new Error("OpenCode export session identity did not match the calling session.");
	if (!Array.isArray(document.messages)) throw new Error("OpenCode export has no messages.");
	const assistants = document.messages.filter((message): message is Record<string, unknown> => {
		if (!message || typeof message !== "object" || Array.isArray(message)) return false;
		const messageRecord = message as Record<string, unknown>;
		const messageInfo = messageRecord.info;
		return (
			messageRecord.type === "assistant" ||
			Boolean(
				messageInfo && typeof messageInfo === "object" && (messageInfo as Record<string, unknown>).role === "assistant",
			)
		);
	});
	const latest = assistants.at(-1);
	const legacyModel = latest?.info as Record<string, unknown> | undefined;
	const v2Model = latest?.model as Record<string, unknown> | undefined;
	const provider = legacyModel?.providerID ?? v2Model?.providerID;
	const model = legacyModel?.modelID ?? v2Model?.id;
	if (typeof provider !== "string" || !provider || typeof model !== "string" || !model)
		throw new Error("Could not determine the last-used model from the latest assistant message.");
	return { provider, model };
}

export function openCodeExportArguments(harness: RuntimeAgentBootstrap, nativeSessionId: string): string[] {
	switch (harness) {
		case "opencode-v1":
			return ["export", nativeSessionId];
		case "opencode-v2":
			return ["session", "export", "--standalone", nativeSessionId];
		default:
			throw new Error("--current requires a calling session launched by an OpenCode v1 or v2 harness.");
	}
}

async function exportOpenCodeSession(
	session: AgentSession,
	preset: AgentPreset,
	harness: RuntimeAgentBootstrap,
): Promise<string> {
	if (!session.nativeSessionId) throw new Error("The calling session has no OpenCode native session ID.");
	const args = commandArguments(preset.command);
	const executable = args.shift();
	if (!executable) throw new Error("The configured OpenCode command is empty.");
	const child = Bun.spawn([executable, ...args, ...openCodeExportArguments(harness, session.nativeSessionId)], {
		cwd: session.pathContext?.worktreeDir ?? session.cwd,
		env: preset.env,
		stdin: "ignore",
		stdout: "pipe",
		stderr: "ignore",
	});
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		const read = async () => {
			const reader = child.stdout.getReader();
			const chunks: Uint8Array[] = [];
			let size = 0;
			try {
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					size += value.byteLength;
					if (size > EXPORT_OUTPUT_LIMIT) {
						child.kill("SIGKILL");
						throw new Error("OpenCode export exceeded the output size limit.");
					}
					chunks.push(value);
				}
			} finally {
				reader.releaseLock();
			}
			return new TextDecoder().decode(Buffer.concat(chunks));
		};
		const outputPromise = read();
		const timeoutPromise = new Promise<never>((_, reject) => {
			timeout = setTimeout(() => {
				child.kill("SIGKILL");
				reject(new Error("OpenCode export timed out."));
			}, EXPORT_TIMEOUT_MS);
		});
		const output = await Promise.race([outputPromise, timeoutPromise]);
		if ((await child.exited) !== 0) throw new Error("OpenCode export failed.");
		return output;
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

export async function resolveCallingSession(
	core: Core,
	dependencies: CurrentModelDependencies = {},
): Promise<{ modeId: string; session: AgentSession }> {
	const context = await (dependencies.context ?? readWorkspaceContext)({ rootDir: core.filesystem.rootDir });
	const conversation = context?.conversation;
	if (!conversation) throw new Error("A valid calling workspace conversation context is required.");
	const state = dependencies.readSessions
		? await dependencies.readSessions(conversation.taskId)
		: await new SessionStore(core.filesystem.rootDir, new BunRunner(), (session) =>
				resolveSessionPreset(core, session),
			).read(conversation.taskId);
	const owners = Object.entries(state.modes ?? {}).flatMap(([modeId, history]) =>
		history.sessions
			.filter((candidate) => candidate.id === conversation.sessionId)
			.map((session) => ({ modeId, session })),
	);
	const owner = owners[0];
	if (owners.length !== 1 || !owner)
		throw new Error("Could not uniquely identify the calling session in its task history.");
	return owner;
}

export async function resolveCallingMode(core: Core, dependencies: CurrentModelDependencies = {}): Promise<string> {
	return (await resolveCallingSession(core, dependencies)).modeId;
}

export async function resolveCurrentModel(
	core: Core,
	dependencies: CurrentModelDependencies = {},
): Promise<{ modeId: string; modelId: string }> {
	const { modeId, session } = await resolveCallingSession(core, dependencies);
	const configured = await resolveSessionPreset(core, session);
	if (configured.bootstrap !== "opencode")
		throw new Error("--current requires a calling session configured with OpenCode.");
	if (!session.nativeSessionId) throw new Error("The calling session has no OpenCode native session ID.");
	const paths = session.pathContext ?? {
		projectDir: core.filesystem.rootDir,
		worktreeDir: session.cwd,
		taskDir: await core.filesystem.taskArtifacts.containerPath(session.taskId),
	};
	const environment = await prepareHarnessEnvironment(configured.env, paths);
	const preset = await resolveLaunchPreset(configured, { cwd: paths.worktreeDir, env: environment });
	const exported = await (dependencies.exportSession ?? exportOpenCodeSession)(
		session,
		{ ...preset, env: environment },
		preset.bootstrap,
	);
	const model = parseExport(exported, session.nativeSessionId);
	return { modeId, modelId: `${model.provider}/${model.model}` };
}

export { parseExport as parseOpenCodeSessionExport };
