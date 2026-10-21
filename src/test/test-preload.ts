import { afterAll } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const testTmpDir = mkdtempSync(join(tmpdir(), "agentic-workspace-test-worker-"));
process.env.TMPDIR = testTmpDir;
process.env.TMP = testTmpDir;
process.env.TEMP = testTmpDir;
afterAll(() => rmSync(testTmpDir, { recursive: true, force: true }));

// Git identity is runner configuration, not part of individual test behavior.
// Keeping it here avoids two subprocesses for every temporary repository.
process.env.GIT_AUTHOR_NAME = "Test User";
process.env.GIT_AUTHOR_EMAIL = "test@example.com";
process.env.GIT_COMMITTER_NAME = "Test User";
process.env.GIT_COMMITTER_EMAIL = "test@example.com";

/**
 * A test process must never resolve the developer's *live* workspace state.
 *
 * `resolveProjectStateRoot` honours `AGENTIC_WORKSPACE_CWD`, so a value exported by a running
 * `agentic-workspace workspace` would redirect every session/view-state lock onto the live project's
 * `.agentic-workspace/<task>/state.json`. The workspace holds those locks (stale 30s, 20 retries), so
 * tests would block behind it and the suite would stall. Clearing every workspace-pinning
 * variable makes each test derive its state from its own temp project root instead; a test
 * that pins one deliberately sets it again after this preload runs.
 *
 * The provider-config variables are here for the same reason: a live workspace launches
 * opencode agents and exports `OPENCODE_CONFIG_CONTENT`/`OPENCODE_CONFIG_DIR`, which would leak
 * the host's skills and plugins into a test's launch environment (`session-launch` merges, not
 * replaces, the inline config).
 */
for (const name of [
	"AGENTIC_WORKSPACE_CWD",
	"AGENTIC_WORKSPACE_WORKSPACE_CONTEXT",
	"AGENTIC_WORKSPACE_PROJECT_ROOT",
	"AGENTIC_WORKSPACE_TASK_ID",
	"AGENTIC_WORKSPACE_SESSION_ID",
	"TASK_ID",
	"SESSION_ID",
	"OPENCODE_CONFIG_CONTENT",
	"OPENCODE_CONFIG_DIR",
] as const) {
	delete process.env[name];
}

/**
 * `createSessionServer()` addresses the developer's default tmux socket unless told otherwise.
 * A unique per-process label keeps every test — and every CLI it spawns, which builds its own
 * server from this same environment — on an isolated tmux server, so a live workspace's
 * sessions can never be inspected, replaced, or torn down by a test.
 */
const socket = `agentic-workspace-test-suite-${process.pid.toString(36)}-${randomUUID().slice(0, 8)}`;
process.env.AGENTIC_WORKSPACE_TMUX_SOCKET = socket;
