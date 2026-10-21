/**
 * The only sanctioned way for a test to name, create, or destroy a tmux server.
 *
 * Every tmux socket is created on an explicit unique label and destroyed through
 * {@link killTmuxServer}, which refuses any label that is not clearly test-owned. A bare
 * `tmux kill-server` with no `-L` resolves to the developer's *default* socket and destroys
 * every unrelated session on the machine, so the refusal is a hard failure rather than a
 * convention: a test that loses its socket label must break, not fall back to `default`.
 */

import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Server } from "libtmux";
import { isMissingTmuxTarget } from "../lib/process-tree.ts";
import { assertIsolatedSocket, killTmuxSocketPaneGroups, TEST_TMUX_SOCKET_PREFIX } from "./tmux-pane-groups.ts";

/** Resolve the socket path using tmux's platform default or configured temporary directory. */
export function tmuxSocketPath(socket: string): string | undefined {
	const uid = process.getuid?.();
	if (uid === undefined) return undefined;
	const base = process.env.TMUX_TMPDIR || (process.platform === "darwin" ? "/private/tmp" : "/tmp");
	return join(base, `tmux-${uid}`, socket);
}

/** Reserve a unique socket label for one test. */
export function uniqueTmuxSocket(label: string): string {
	const suffix = crypto.randomUUID().slice(0, 8);
	const safeLabel = label.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "suite";
	const socket = `${TEST_TMUX_SOCKET_PREFIX}-${safeLabel}-${suffix}`;
	assertIsolatedSocket(socket);
	return socket;
}

/** A libtmux server pinned to an isolated test socket, with `TMUX` cleared so it cannot inherit one. */
export function isolatedTmuxServer(socket: string): Server {
	assertIsolatedSocket(socket);
	return new Server({ socketName: socket, configFile: "/dev/null", environment: { ...process.env, TMUX: "" } });
}

/** The argv a test teardown uses. Exposed so the guard test can assert the `-L` is always present. */
function killTmuxServerArgv(socket: string, tmuxBinary: string): string[] {
	assertIsolatedSocket(socket);
	return [tmuxBinary, "-f", "/dev/null", "-L", socket, "kill-server"];
}

function assertTmuxServerAbsent(socket: string, tmuxBinary: string): void {
	const result = Bun.spawnSync([tmuxBinary, "-f", "/dev/null", "-L", socket, "list-sessions"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	if (result.exitCode !== 0) {
		const output = `${result.stdout.toString()}${result.stderr.toString()}`;
		if (isMissingTmuxTarget(output)) return;
		throw new Error(`Could not verify isolated tmux server ${socket} is absent (exit ${result.exitCode}): ${output}`);
	}
	throw new Error(`Isolated tmux server ${socket} is still running: ${result.stdout.toString()}`);
}

/** Remove the socket file tmux leaves behind after `kill-server`. */
async function removeTmuxSocket(socket: string): Promise<void> {
	assertIsolatedSocket(socket);
	const socketPath = tmuxSocketPath(socket);
	if (!socketPath) return;
	await rm(socketPath, { force: true });
}

/**
 * Destroy one test-owned tmux server and its socket file.
 *
 * The pane groups are SIGKILLed first: tmux only ever SIGHUPs a pane, so a command that ignores
 * HUP would otherwise outlive `kill-server` and reparent to launchd (see killTmuxSocketPaneGroups).
 * An already-absent server is success; other command failures are reported with their diagnostics.
 * The socket-label assertion is not best effort — it throws before anything is spawned.
 */
export async function killTmuxServer(socket: string): Promise<void> {
	assertIsolatedSocket(socket);
	const tmuxBinary = Bun.which("tmux");
	if (!tmuxBinary) throw new Error("tmux is not installed; cannot manage a test tmux server.");
	const errors: unknown[] = [];
	try {
		killTmuxSocketPaneGroups(socket, tmuxBinary);
	} catch (error) {
		errors.push(error);
	}
	try {
		const child = Bun.spawn(killTmuxServerArgv(socket, tmuxBinary), { stdout: "pipe", stderr: "pipe" });
		const [exitCode, stdout, stderr] = await Promise.all([
			child.exited,
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
		]);
		const output = `${stdout}${stderr}`;
		if (exitCode !== 0 && !isMissingTmuxTarget(output))
			throw new Error(`Could not stop isolated tmux server ${socket} (exit ${exitCode}): ${output}`);
	} catch (error) {
		errors.push(error);
	}
	let absent = false;
	try {
		assertTmuxServerAbsent(socket, tmuxBinary);
		absent = true;
	} catch (error) {
		errors.push(error);
	}
	if (absent) {
		try {
			await removeTmuxSocket(socket);
		} catch (error) {
			errors.push(error);
		}
	}
	if (errors.length) throw new AggregateError(errors, `Failed to clean up isolated tmux server ${socket}`);
}
