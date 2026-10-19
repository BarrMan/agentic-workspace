/** Inherited context identifies the shared workspace pane and conversation, not its frontend. */

import { realpathSync } from "node:fs";
import { readdir, rm, rmdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { AgentConversationContext } from "../model/session/types.ts";
import { taskIdsEqual } from "../model/task/task-id.ts";
import { writeFileAtomic } from "../storage/session-store.ts";
import { createSessionTransport } from "./session-process.ts";

/** The environment variable a workspace sets in its agent panes and the CLI reads back. */
export const WORKSPACE_CONTEXT_ENV = "AGENTIC_WORKSPACE_WORKSPACE_CONTEXT";
/** Current context protocol; history remains in its existing v2 format. */
export const WORKSPACE_CONTEXT_VERSION = 2;

export interface WorkspaceContext {
	v: typeof WORKSPACE_CONTEXT_VERSION;
	/** Stable tmux pane identity; unlike a frontend PID, it survives UI exit. */
	paneId: string;
	/** Absolute project root of the owning workspace. */
	rootDir: string;
	/** Conversation identity associated with this workspace pane. */
	conversation?: AgentConversationContext;
	/** Exact provider identity from the matching durable record, when one has been established. */
	nativeSessionId?: string;
}

export interface WorkspaceContextIdentity {
	/** Exact shared pane prepared by the session service for the command being launched. */
	paneId: string;
	rootDir: string;
	conversation?: AgentConversationContext;
	nativeSessionId?: string;
}

export type InheritedWorkspaceContext = WorkspaceContext;

export function serializeWorkspaceContext(context: InheritedWorkspaceContext): string {
	return JSON.stringify(parseWorkspaceContext(JSON.stringify(context)));
}

/**
 * A copy of `env` with the ownership context added. The input is never mutated, so the caller can
 * inject the variable into the exact environment that becomes the agent pane's command without
 * leaking it into any other launch.
 */
export function workspaceContextInto(
	env: Record<string, string>,
	identity: WorkspaceContextIdentity,
): Record<string, string> {
	return {
		...env,
		[WORKSPACE_CONTEXT_ENV]: serializeWorkspaceContext({
			v: WORKSPACE_CONTEXT_VERSION,
			paneId: identity.paneId,
			rootDir: identity.rootDir,
			...(identity.conversation === undefined ? {} : { conversation: identity.conversation }),
			...(identity.nativeSessionId === undefined ? {} : { nativeSessionId: identity.nativeSessionId }),
		}),
	};
}

export interface ReadWorkspaceContextOptions {
	/** Environment to read; defaults to `process.env`. */
	env?: Record<string, string | undefined>;
	/** The project root the context must match; defaults to the current working directory. */
	rootDir?: string;
	/** Verify exact pane ID and its task/session/root tags via the configured shared transport. */
	paneMatches?: (paneId: string, context: WorkspaceContext) => Promise<boolean>;
}

const defaultPaneMatches = async (paneId: string, context: WorkspaceContext): Promise<boolean> => {
	const { exec } = createSessionTransport();
	const result = await exec.run([
		"display-message",
		"-p",
		"-t",
		paneId,
		"#{pane_id}\t#{@agentic_workspace_root}\t#{@agentic_workspace_task}\t#{@agentic_workspace_session}",
	]);
	if (result.exitCode !== 0) return false;
	const [actualPaneId, rootDir, taskId, sessionId] = result.stdout.trim().split("\t");
	return (
		actualPaneId === paneId &&
		realpathOrUndefined(rootDir ?? "") === realpathOrUndefined(context.rootDir) &&
		(context.conversation === undefined ||
			(taskIdsEqual(taskId ?? "", context.conversation.taskId) && sessionId === context.conversation.sessionId))
	);
};

/** Process liveness for lifecycle/request safety; it does not grant workspace-context authority. */
export function isProcessAlive(pid: number | undefined): boolean {
	if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

function realpathOrUndefined(path: string): string | undefined {
	try {
		return realpathSync(path);
	} catch {
		return undefined;
	}
}

function objectWithKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		Object.keys(value).every((key) => keys.includes(key))
	);
}

/** Structural discrimination only; liveness and root validation happen in the caller. */
export function parseWorkspaceContext(raw: string): InheritedWorkspaceContext {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch (cause) {
		throw new Error("Invalid inherited workspace context JSON.", { cause });
	}
	if (!objectWithKeys(value, ["v", "paneId", "rootDir", "conversation", "nativeSessionId"]))
		throw new Error("Invalid inherited workspace context.");
	const candidate = value;
	let conversation: AgentConversationContext | undefined;
	if (candidate.conversation !== undefined) {
		if (!objectWithKeys(candidate.conversation, ["taskId", "modeId", "sessionId"]))
			throw new Error("Invalid workspace conversation provenance.");
		const identity = candidate.conversation;
		if (
			typeof identity.taskId !== "string" ||
			identity.taskId.length === 0 ||
			typeof identity.modeId !== "string" ||
			!/^[a-z0-9][a-z0-9_-]*$/.test(identity.modeId) ||
			typeof identity.sessionId !== "string" ||
			!/^[A-Za-z0-9._-]+$/.test(identity.sessionId)
		)
			throw new Error("Invalid workspace conversation provenance.");
		conversation = { taskId: identity.taskId, modeId: identity.modeId, sessionId: identity.sessionId };
	}
	if (
		candidate.nativeSessionId !== undefined &&
		(typeof candidate.nativeSessionId !== "string" || !candidate.nativeSessionId)
	)
		throw new Error("Invalid workspace native session identity.");
	if (candidate.v !== WORKSPACE_CONTEXT_VERSION) throw new Error("Unsupported workspace context version.");
	if (
		!objectWithKeys(candidate, ["v", "paneId", "rootDir", "conversation", "nativeSessionId"]) ||
		typeof candidate.paneId !== "string" ||
		!/^%[0-9]+$/.test(candidate.paneId) ||
		typeof candidate.rootDir !== "string" ||
		!isAbsolute(candidate.rootDir)
	)
		throw new Error("Invalid workspace context.");
	return {
		v: WORKSPACE_CONTEXT_VERSION,
		paneId: candidate.paneId,
		rootDir: candidate.rootDir,
		...(conversation ? { conversation } : {}),
		...(candidate.nativeSessionId === undefined ? {} : { nativeSessionId: candidate.nativeSessionId as string }),
	};
}

/** Only absence returns undefined. Present context is parsed synchronously without probes or writes. */
export function readInheritedWorkspaceContext(
	env: Record<string, string | undefined> = process.env,
): InheritedWorkspaceContext | undefined {
	const raw = env[WORKSPACE_CONTEXT_ENV];
	return raw === undefined ? undefined : parseWorkspaceContext(raw);
}

/** Validate shared pane identity and canonical project root; frontend exit is irrelevant. */
export async function readWorkspaceContext(
	options: ReadWorkspaceContextOptions = {},
): Promise<WorkspaceContext | undefined> {
	const context = readInheritedWorkspaceContext(options.env ?? process.env);
	if (!context) return undefined;
	const expectedRoot = realpathOrUndefined(options.rootDir ?? process.cwd());
	const contextRoot = realpathOrUndefined(context.rootDir);
	if (!expectedRoot || !contextRoot || expectedRoot !== contextRoot) throw new Error("Workspace root does not match.");
	if (!(await (options.paneMatches ?? defaultPaneMatches)(context.paneId, context)))
		throw new Error("Workspace pane identity does not match its tags.");
	return context;
}

/* ------------------------------------------------------------------------------------------------
 * Request markers
 *
 * The durable session record is the request, but a workspace cannot wait for user input to notice
 * one: refresh is event-driven, so an idle TUI would never re-read the records. `agent-session start`
 * therefore also drops one small marker per request, and the workspace's timer dir-lists only that
 * directory — never the whole task-state tree — to learn a request exists.
 * ---------------------------------------------------------------------------------------------- */

/** One unadopted `agent-session start` request, mirrored to disk for the owning workspace to poll. */
export interface SessionHandoff {
	modeId: string;
	predecessor?: { id: string; createdAt: string; tmuxName: string };
	priorActiveSessionId?: string;
}

export interface WorkspaceRequest {
	taskId: string;
	sessionId: string;
	/** Requester PID; not runtime authority. */
	pid: number;
	handoff?: SessionHandoff;
	createdAt?: string;
}

/** The directory holding one marker per unadopted request, inside the project's own state directory. */
export function workspaceRequestDir(rootDir: string): string {
	return join(rootDir, ".agentic-workspace", "agent-requests");
}

/** Marker file names are session ids; this also stops a crafted id from escaping the directory. */
const SAFE_MARKER_ID = /^[A-Za-z0-9._-]+$/;

function markerPath(rootDir: string, sessionId: string): string | undefined {
	if (typeof rootDir !== "string" || rootDir.length === 0) return undefined;
	if (!SAFE_MARKER_ID.test(sessionId)) return undefined;
	return join(workspaceRequestDir(rootDir), `${sessionId}.json`);
}

function parseWorkspaceRequest(value: unknown): WorkspaceRequest | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const candidate = value as Record<string, unknown>;
	if (typeof candidate.taskId !== "string" || candidate.taskId.length === 0) return undefined;
	if (typeof candidate.sessionId !== "string" || !SAFE_MARKER_ID.test(candidate.sessionId)) return undefined;
	if (typeof candidate.pid !== "number" || !Number.isInteger(candidate.pid) || candidate.pid <= 0) return undefined;
	if (candidate.handoff !== undefined) {
		if (typeof candidate.createdAt !== "string" || !candidate.createdAt) return undefined;
		if (typeof candidate.handoff !== "object" || candidate.handoff === null) return undefined;
		const handoff = candidate.handoff as Record<string, unknown>;
		if (typeof handoff.modeId !== "string" || !handoff.modeId) return undefined;
		if (handoff.priorActiveSessionId !== undefined && typeof handoff.priorActiveSessionId !== "string")
			return undefined;
		if (handoff.predecessor !== undefined) {
			if (typeof handoff.predecessor !== "object" || handoff.predecessor === null) return undefined;
			const predecessor = handoff.predecessor as Record<string, unknown>;
			if (["id", "createdAt", "tmuxName"].some((key) => typeof predecessor[key] !== "string" || !predecessor[key]))
				return undefined;
			if (predecessor.id === candidate.sessionId) return undefined;
		}
	}
	return {
		taskId: candidate.taskId,
		sessionId: candidate.sessionId,
		pid: candidate.pid,
		...(candidate.handoff
			? { handoff: candidate.handoff as SessionHandoff, createdAt: candidate.createdAt as string }
			: {}),
	};
}

/** Write the marker for a registered request. Only this path ever creates the marker directory. */
export async function writeWorkspaceRequest(rootDir: string, request: WorkspaceRequest): Promise<void> {
	const path = markerPath(rootDir, request.sessionId);
	if (!path) throw new Error(`Invalid workspace request for session ${request.sessionId}.`);
	await writeFileAtomic(path, `${JSON.stringify(request)}\n`);
}

/**
 * Remove one request marker. Never throws: a marker that is already gone is the desired state, and
 * the now-empty directory is removed so an idle project keeps no marker directory behind.
 */
export async function deleteWorkspaceRequest(rootDir: string, sessionId: string): Promise<void> {
	const path = markerPath(rootDir, sessionId);
	if (!path) return;
	try {
		await rm(path, { force: true });
		await rmdir(workspaceRequestDir(rootDir));
	} catch {
		// The marker is already gone, or another request still needs the directory.
	}
}

/**
 * Read every request marker. Never creates the directory and never throws: an absent or unreadable
 * directory is simply "no requests", and a malformed marker is ignored (its record is still covered
 * by the workspace's refresh scan).
 */
export async function readWorkspaceRequests(rootDir: string): Promise<WorkspaceRequest[]> {
	if (typeof rootDir !== "string" || rootDir.length === 0) return [];
	const directory = workspaceRequestDir(rootDir);
	let entries: string[];
	try {
		entries = await readdir(directory);
	} catch {
		return [];
	}
	const requests: WorkspaceRequest[] = [];
	for (const entry of entries) {
		if (!entry.endsWith(".json")) continue;
		try {
			const parsed: unknown = JSON.parse(await Bun.file(join(directory, entry)).text());
			const request = parseWorkspaceRequest(parsed);
			if (request && request.sessionId === entry.slice(0, -".json".length)) requests.push(request);
		} catch {
			// Ignore a marker that cannot be read or parsed.
		}
	}
	return requests;
}
