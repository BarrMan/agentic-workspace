# Decision answer sheet 9

## Test runner + cleanup supervisor — direction

Only the new decision; the analysis is already in the conversation.

**Options**
- **A (recommended)** — tests own their teardown; keep a thin wrapper (one process per file, run-scoped `TMPDIR`, cleared env, unique test tmux socket, deadline, bounded lanes) + narrow emergency cleanup; delete the generic settlement supervisor and the `owned-test-processes.ts` ledger machinery, keeping `process-tree.ts` (production uses it). Close first: `process-tree.test.ts:349-403`, `git.test.ts:182-217`, `tui-interactive-editor-handoff.test.ts:181-211,275-288`, `cli-init-cursor-pty.test.ts:62-80`.
- **B** — A with a different scheduler (`bun test <file>` per file). Effectively A; isolation can't be dropped first.
- **C** — keep as is.

**Your answer:** ____ (A / B / C)

## Landed — no answer needed

`runCli` exit-code restore: `src/cli/register.ts:54` (`process.exitCode ?? 0`). `cli-init-input` now exits 0.
