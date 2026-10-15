# Footer search / broken workspace recovery handover

## Start here

The user's intended work was a single text input: Board/Workspace footer search. The work expanded excessively and the actual application is now **not verified usable**. The user is angry about scope creep, repeated long investigations, poor tests, damaged task data, and false readiness claims. Their latest request was only to write this handover. Do not treat this document as permission for another broad rewrite or rollback.

The previous agent stopped implementation after acknowledging those failures. No repairs were made while writing this document. Current operational mode permits changes, but agree on the narrow recovery scope with the user when continuing. Do not repeat apologies instead of presenting evidence and bounded work.

## Repository and checkpoint

- Root: `/Users/imribarr/Projects/Backlog.md`
- Branch: `tasks/back-723-native-tmux-windows`
- HEAD: `b3b4a050` — `BACK-723 - Checkpoint native tmux workspace and shared search footer`
- Earlier checkpoints: `f389bd34` (structured frontmatter migration), `2f2682ad` (task graph/TUI ownership refactoring).
- Latest fixes are uncommitted. No new commit was requested.
- Preserve unrelated untracked `.serena/` and `backlog/tasks/back-722 - Smooth-tmux-preview-handoff.md`.
- Read root `MANIFESTO.md`, repository instructions, and applicable tool instructions first.

## Exact latest failure evidence

The user reported `/Users/imribarr/Projects/Backlog.md/dist/backlog workspace` hanging. The investigation found abandoned `tmux wait-for -L backlog-workspace-88f5d4c122ec-bootstrap` processes. A rebuilt binary replacing bootstrap locking got past that wait, but then exited with:

```text
Could not remove obsolete Workspace window: can't find window: @81
```

Another change made missing-window recovery conditional on actual session membership. A subsequent real PTY launch of the exact compiled command produced a `Tasks` heading and detached successfully. **That was not a successful usability test.** Follow-up pane inspection revealed:

```text
Task BACK-723 uses unsupported task frontmatter schema
```

The Tasks pane was empty. Navigation pane `%97` was dead (exit status 1). Its visible contents showed only `Bun v1.3.14 (macOS arm64)` and the dead-pane notice. The actual navigation exception has not been retrieved; don't assume its cause.

### Damaged task record

Path: `backlog/tasks/back-723 - Replace-captured-agent-previews-with-native-tmux-Board-and-Workspace-windows.md`.

Last inspected contents were only 29 lines. Frontmatter retained id/title/status/assignee/dates/labels/dependencies/type/ordinal but **omitted `task_schema_version: 2`**. Original description and acceptance criteria were absent. Body contained a replacement four-step topology-recovery plan and two implementation-note paragraphs about locks and missing-window recovery.

The record had already been repaired earlier and subsequently became damaged again during agent task updates. The exact invocation responsible is **not established**. Earlier claims that a particular CLI caused it were unsupported. Do not trust a report saying source CLI was used without checking the actual command and output.

`b3b4a050` is a recovery reference for original task content; inspect it before deciding what to restore. Repository policy forbids manually editing task Markdown: use the documented product mutation/recovery workflow. A strict migration command (`task migrate-legacy`) exists in this branch, but inspect its help and implementation contract before using it. Migration alone cannot recreate missing description/criteria.

Intended task status before damage: In Progress, assignee `@OpenCode`, AC6 unchecked. Do not mark complete.

## Recommended bounded recovery sequence

1. Inspect targeted diffs against the checkpoint and the damaged task record. Identify which changes are regressions and which are pre-existing work; do not blindly reset the tree.
2. Establish a safe, schema-preserving way to recover BACK-723's original content before any further task notes/status updates. Verify persisted fields after mutation.
3. Inspect the navigation process's actual error. Fix or revert the specific regression based on evidence.
4. Run the exact compiled command in this repository with a real PTY. Confirm task rows loaded, all UI workers alive, input works, and close/reopen works. A rendered heading or alive parent process is insufficient.
5. Only then return to the requested text-input behavior. Keep verification narrow and representative rather than adding broad fixtures to evade the actual failing scenario.

Any rollback affecting substantial work needs a clear scope and user agreement. Previously the user permitted fresh parallel subagents, but was subsequently frustrated by repeated handoffs; don't resume that strategy automatically. Main-agent source review and firsthand verification were missing safeguards.

## Search behavior the user approved

- Immediate local typing and cursor insertion; Backspace, forward Delete, Left/Right/Home/End.
- Local editing must not wait for async acknowledgment.
- No polling for search/shared-state/focus synchronization, and no debounce.
- tmux-native events; no sockets or new transport infrastructure.
- `/` opens a ` / ` footer; Enter commits; Escape restores the previous query; empty submit clears and returns task focus.
- Do not capture native agent `/`, Enter, or Tab. Ctrl+Q returns navigation.
- Layout: full-width filters, Tasks beside Details/native agent, full-width shortcuts or temporary search.
- Shortcut wrapping is width/content-driven (100 vs 140 columns), not fixed height assumptions.
- Preserve agent pane IDs/PIDs, Board/Workspace windows, zoom/detach/recovery, parked agents, and configured branch-aware Board loading.

## Relevant implementation changes already present

These describe the current work, not an endorsement of its architecture or correctness:

- `src/ui/components/footer-search.ts`: local authoritative `editorQuery`, synchronous changes including empty string; per-instance dependency `_listener` for normal editing/paste; disjoint prompt/textbox geometry; `restoreInput()` re-focuses and re-enters textbox input after resize.
- `src/ui/workspace/controller.ts`: cached task filtering; bound state subscriptions; `createLatestWorkspaceSearchPublisher` publishes immediately, coalesces only in-flight writes, orders focus after queries, and protects against stale snapshots; footer resize calls `restoreInput()`.
- `src/ui/list-removal-adapter.ts`: per-instance workaround for neo List passing an object to numeric-only `remove`; no dependency/global patch.
- `src/agent-workspace/tmux-workspace.ts`: state writes under tmux lock, `wait-for` listener registry/events, geometry handling; no search/focus polling. Independent background task/session refresh remains.
- Latest bootstrap change uses shared `LockOwner` from `src/file-system/lock-owner.ts` / proper-lockfile rather than tmux bootstrap lock. Stale threshold 2 seconds, retry delay 25 ms, 200 retries. State lock remains tmux-based. Review lock path/server isolation, ownership and stale behavior; the previous main agent did not complete that review.
- Latest missing-window change: `ready()` validates Workspace window membership; rebuild skips killing a recorded window only when absent; actual removal failures remain errors.
- Native tmux architecture and strict migration tooling are already in the checkpoint. Don't casually remove branch-aware loading or historical identity handling while recovering the input task.

## Verification: reported passes vs actual failures

Earlier focused footer/tmux/controller/list-adapter tests: 27/27. Earlier compiled search rendering test: 1/1; measured edits ~279 ms, clear ~258 ms. A short resize/Escape regression passed. These do **not** establish that the real repository starts.

Latest delegates reported targeted `tmux-workspace.test.ts`, type-check, Biome and build passing, with real-tmux regressions for killed bootstrap-lock owner and a removed Workspace window. The main agent did not independently rerun every reported check.

Broad compiled integration remained failing, typically:

```text
Timed out after 15s waiting for wide Workspace footer shortcut rows after cancellation
```

Sequence: previous `First native` search, edit at width 100, clear/type `S`, resize to 140, Escape. Footer remained editing `S`, selected and alive. Some runs failed fake-agent fullscreen zoom earlier instead. Adding nonblocking Expect output drains and `restoreInput()` did not establish a green broad test.

Previous aggregate command (not a recommendation to run before repairing real startup):

```sh
BACKLOG_TEST_CLI_BINARY=/Users/imribarr/Projects/Backlog.md/dist/backlog RUN_INTERACTIVE_TUI_TESTS=1 bun test --timeout=60000 src/test/tmux-workspace-integration.test.ts src/test/agent-workspace-pty.test.ts src/test/workspace-search-rendering.test.ts
```

Previous result: 2 pass, 1 fail. Do not weaken Escape/resize assertions or extend timeouts to hide failures.

## Live tmux state at last observation

Identifiers below are historical observations; revalidate before acting. Never broadly kill sessions or respawn agent processes.

- This repo: `backlog-workspace-88f5d4c122ec`.
  - Board `%81`, PID 46814, alive, running an older UI build.
  - Recreated Workspace nav `%97`, PID 4179, **dead**.
  - Tasks `%99`, PID 4183, alive but task-schema error.
  - Details `%100`, PID 4192, alive.
  - Display placeholder `%101`, PID 4147, sleep.
  - Footer `%98`, PID 4194, alive.
- Other project `/Users/imribarr/Projects/gemini`: `backlog-workspace-2e166c0806fa`; UI panes `%73`, `%92`, `%94`, `%95`, `%93`; display `%96` PID 16006. Leave alone.
- Agent session `backlog-sin-001-8249ce04`: `%69`, PID **83166**, `opencode.exe`; preserve.
- Agent session `backlog-task-1-185c4823`: `%0`, PID **42459**, bash; preserve.

Rebuild does not update already-running UI workers. Earlier selective UI respawns were performed, but current live processes are a mix of builds. Do not inject test keys into user-attached clients. The previous PTY smoke test spawned its own client and detached using Ctrl+B, d.

Avoid full process-command/environment dumps: earlier `ps` output exposed secrets from tmux test environment arguments. Inspect safe fields only.

## Working tree when this handover was written

Modified:

- BACK-723 task file above
- `src/agent-workspace/tmux-workspace.ts`
- `src/guidelines/cli-instructions/agent-workspace.md`
- `src/test/footer-search.test.ts`
- `src/test/tmux-workspace-integration.test.ts`
- `src/test/tmux-workspace.test.ts`
- `src/ui/components/footer-search.ts`
- `src/ui/workspace/controller.ts`

Untracked implementation/test files:

- `src/ui/list-removal-adapter.ts`
- `src/test/list-removal-adapter.test.ts`
- `src/test/workspace-controller.test.ts`
- `src/test/workspace-search-rendering.test.ts`

Also untracked and unrelated: `.serena/` and BACK-722 noted above.

The latest user-opened file was `src/ui/components/footer-search.ts`. The handover request caused no application changes, task mutations, builds, live-session changes, or commits.
