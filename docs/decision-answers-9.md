---
consolidation:
  total: 9
  counts:
    exists: 3
    discard: 5
    integrate: 0
    unconfirmed: 1
  percentages:
    exists: 33.33%
    discard: 55.56%
    integrate: 0.00%
    unconfirmed: 11.11%
---
# Decision answer sheet 9

## Test runner + cleanup supervisor — direction

Only the new decision; the analysis is already in the conversation.

**Options**
- **A (recommended)** — tests own their teardown; keep a thin wrapper (one process per file, run-scoped `TMPDIR`, cleared env, unique test tmux socket, deadline, bounded lanes) + narrow emergency cleanup; delete the generic settlement supervisor and the `owned-test-processes.ts` ledger machinery, keeping `process-tree.ts` (production uses it). Close first: `process-tree.test.ts:349-403`, `git.test.ts:182-217`, `tui-interactive-editor-handoff.test.ts:181-211,275-288`, `cli-init-cursor-pty.test.ts:62-80`.
<!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Current core requires tests to stop and await their children with run-scoped TMPDIR cleared workspace environment and isolated tmux socket. -->
<!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Custom wrapper scheduling and global emergency cleanup are superseded by the delegated Bun-native runner and preload isolation. -->
<!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Core explicitly excludes another global process supervisor or cleanup layer. -->
<!-- consolidation: discard; ref: none; reason: Exact ledger deletion and production process-tree file retention are historical implementation inventory rather than permanent file placement rules. -->
<!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Close-first teardown coverage at the named call sites is a safety gate whose satisfaction is not demonstrated by this unanswered sheet. -->
- **B** — A with a different scheduler (`bun test <file>` per file). Effectively A; isolation can't be dropped first.
<!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Alternative custom scheduler is superseded by the current delegated Bun-native test procedure. -->
<!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Required preload environment and tmux isolation must remain intact. -->
- **C** — keep as is.
<!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Retaining generic settlement supervision conflicts with current test-owned cleanup and no-global-supervisor rules. -->

**Your answer:** ____ (A / B / C)

## Landed — no answer needed

`runCli` exit-code restore: `src/cli/register.ts:54` (`process.exitCode ?? 0`). `cli-init-input` now exits 0.
<!-- consolidation: discard; ref: none; reason: Historical implementation completion note is not current verification or an independent approved contract. -->
