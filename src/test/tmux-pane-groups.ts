/**
 * Pane-group reaping and socket guarding for test-owned tmux servers.
 *
 * Deliberately free of `libtmux` so `test-preload` can import it without pulling the client into
 * every test process.
 */

import { terminateTree } from "@3leaps/sysprims";
import { isMissingTmuxTarget } from "../lib/process-tree.ts";

/** Prefix every test-owned socket label carries. `default` and `main` can never match. */
export const TEST_TMUX_SOCKET_PREFIX = "agentic-workspace-test";

const TEST_TMUX_SOCKET_PATTERN = new RegExp(`^${TEST_TMUX_SOCKET_PREFIX}-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}$`);

/** Reject any socket label that is not provably test-owned. */
export function assertIsolatedSocket(socket: string): void {
	if (TEST_TMUX_SOCKET_PATTERN.test(socket)) return;
	throw new Error(
		`Refusing to address tmux socket ${JSON.stringify(socket)}: test sockets must look like ` +
			`${TEST_TMUX_SOCKET_PREFIX}-<label>-<8 hex chars>. A bare "tmux kill-server" hits the ` +
			`developer's default socket and destroys unrelated live sessions.`,
	);
}

/** SIGKILL the process group of every pane on a test-owned server before retiring it. */
export function killTmuxSocketPaneGroups(
	socket: string,
	tmuxBinary: string | undefined = Bun.which("tmux") ?? undefined,
): void {
	assertIsolatedSocket(socket);
	if (!tmuxBinary) return;
	const listed = Bun.spawnSync([tmuxBinary, "-f", "/dev/null", "-L", socket, "list-panes", "-a", "-F", "#{pane_pid}"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	if (listed.exitCode !== 0) {
		const output = `${listed.stdout.toString()}${listed.stderr.toString()}`;
		if (isMissingTmuxTarget(output)) return;
		throw new Error(`Could not list panes on isolated tmux socket ${socket} (exit ${listed.exitCode}): ${output}`);
	}
	const errors: unknown[] = [];
	for (const line of listed.stdout.toString().split("\n")) {
		const pid = Number.parseInt(line.trim(), 10);
		if (Number.isFinite(pid)) {
			try {
				const result = terminateTree(pid, { grace_timeout_ms: 1_000, kill_timeout_ms: 1_000 });
				if (!result.exited) errors.push(new Error(`Pane process group ${pid} survived termination`));
			} catch (error) {
				errors.push(error);
			}
		}
	}
	if (errors.length) throw new AggregateError(errors, "Failed to terminate every pane process group");
}
