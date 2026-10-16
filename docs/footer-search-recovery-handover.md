---
consolidation:
  total: 108
  counts:
    exists: 16
    discard: 62
    integrate: 18
    unconfirmed: 12
  percentages:
    exists: 14.81%
    discard: 57.41%
    integrate: 16.67%
    unconfirmed: 11.11%
---
# Footer search / broken workspace recovery handover

> **Non-authoritative supporting material.** This file is not a contract. Authoritative owner(s): [interfaces](specs/interfaces.md), [workspace screen](screens/workspace.md), [DESIGN-SYSTEM](DESIGN-SYSTEM.md), [application boundaries](architecture/application-boundaries.md), [CONVENTIONS](CONVENTIONS.md), [tasks](specs/tasks.md).
> Disposition: Mixed — see markers.

## Start here

The user's intended work was a single text input: Board/Workspace footer search. The work expanded excessively and the actual application is now **not verified usable**. The user is angry about scope creep, repeated long investigations, poor tests, damaged task data, and false readiness claims. Their latest request was only to write this handover. Do not treat this document as permission for another broad rewrite or rollback. <!-- consolidation: discard; ref: none; reason: Historical task scope and incident narrative. --> <!-- consolidation: unconfirmed; ref: none; reason: Current usability cannot be established from this failed handoff. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#general-principles; reason: Unrelated rewrites and destructive changes to user work are not authorized. -->

The previous agent stopped implementation after acknowledging those failures. No repairs were made while writing this document. Current operational mode permits changes, but agree on the narrow recovery scope with the user when continuing. Do not repeat apologies instead of presenting evidence and bounded work. <!-- consolidation: discard; ref: none; reason: Historical implementation stop and communication instruction. --> <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#general-principles; reason: Recovery authorization remains bounded and needs agreement before destructive continuation. -->

## Repository and checkpoint

- Root: `/Users/imribarr/Projects/Backlog.md` <!-- consolidation: discard; ref: none; reason: Historical checkout location. -->
- Branch: `tasks/back-723-native-tmux-windows` <!-- consolidation: discard; ref: none; reason: Historical branch. -->
- HEAD: `b3b4a050` — `BACK-723 - Checkpoint native tmux workspace and shared search footer` <!-- consolidation: discard; ref: none; reason: Historical checkpoint. -->
- Earlier checkpoints: `f389bd34` (structured frontmatter migration), `2f2682ad` (task graph/TUI ownership refactoring). <!-- consolidation: discard; ref: none; reason: Historical checkpoint inventory. -->
- Latest fixes are uncommitted. No new commit was requested. <!-- consolidation: discard; ref: none; reason: Historical commit status. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Commit authorization must be explicit. -->
- Preserve unrelated untracked `.serena/` and `backlog/tasks/back-722 - Smooth-tmux-preview-handoff.md`. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#general-principles; reason: Preserve unrelated user work. -->
- Read root `MANIFESTO.md`, repository instructions, and applicable tool instructions first. <!-- consolidation: discard; ref: none; reason: Historical contributor reading procedure. -->

## Exact latest failure evidence

The user reported `/Users/imribarr/Projects/Backlog.md/dist/backlog workspace` hanging. The investigation found abandoned `tmux wait-for -L backlog-workspace-88f5d4c122ec-bootstrap` processes. A rebuilt binary replacing bootstrap locking got past that wait, but then exited with: <!-- consolidation: discard; ref: none; reason: Historical bootstrap-lock diagnosis and failed rebuilt launch. -->

```text
Could not remove obsolete Workspace window: can't find window: @81
```
<!-- consolidation: discard; ref: none; reason: Historical failure output. -->

Another change made missing-window recovery conditional on actual session membership. A subsequent real PTY launch of the exact compiled command produced a `Tasks` heading and detached successfully. **That was not a successful usability test.** Follow-up pane inspection revealed: <!-- consolidation: discard; ref: none; reason: Historical recovery patch and insufficient smoke result. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#testing; reason: Evidence proves only the behavior actually exercised. -->

```text
Task BACK-723 uses unsupported task frontmatter schema
```
<!-- consolidation: discard; ref: none; reason: Historical schema error output. -->

The Tasks pane was empty. Navigation pane `%97` was dead (exit status 1). Its visible contents showed only `Bun v1.3.14 (macOS arm64)` and the dead-pane notice. The actual navigation exception has not been retrieved; don't assume its cause. <!-- consolidation: discard; ref: none; reason: Historical pane failure evidence. --> <!-- consolidation: unconfirmed; ref: none; reason: Navigation exception cause was never established. -->

### Damaged task record

Path: `backlog/tasks/back-723 - Replace-captured-agent-previews-with-native-tmux-Board-and-Workspace-windows.md`. <!-- consolidation: discard; ref: none; reason: Historical damaged-record locator. -->

Last inspected contents were only 29 lines. Frontmatter retained id/title/status/assignee/dates/labels/dependencies/type/ordinal but **omitted `task_schema_version: 2`**. Original description and acceptance criteria were absent. Body contained a replacement four-step topology-recovery plan and two implementation-note paragraphs about locks and missing-window recovery. <!-- consolidation: discard; ref: none; reason: Dated damaged-record observation rather than current schema requirement. -->

The record had already been repaired earlier and subsequently became damaged again during agent task updates. The exact invocation responsible is **not established**. Earlier claims that a particular CLI caused it were unsupported. Do not trust a report saying source CLI was used without checking the actual command and output. <!-- consolidation: discard; ref: none; reason: Historical repeated corruption narrative. --> <!-- consolidation: unconfirmed; ref: none; reason: Responsible mutation invocation remains unknown and must not be inferred. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#testing; reason: Source and runtime evidence must be distinguished and verified. -->

`b3b4a050` is a recovery reference for original task content; inspect it before deciding what to restore. Repository policy forbids manually editing task Markdown: use the documented product mutation/recovery workflow. A strict migration command (`task migrate-legacy`) exists in this branch, but inspect its help and implementation contract before using it. Migration alone cannot recreate missing description/criteria. <!-- consolidation: discard; ref: none; reason: Historical recovery checkpoint pointer remains useful in this source. --> <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Agent-only mutation/recovery safeguard needs explicit disposition and is not repealed by user-editable files. --> <!-- consolidation: discard; ref: none; reason: Legacy migration command is not current supported behavior. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Schema conversion cannot substitute for recovering and verifying lost record content. -->

Intended task status before damage: In Progress, assignee `@OpenCode`, AC6 unchecked. Do not mark complete. <!-- consolidation: discard; ref: none; reason: Historical intended task metadata. --> <!-- consolidation: unconfirmed; ref: none; reason: Current recovery and acceptance completion must be established before closing this task. -->

## Recommended bounded recovery sequence

1. Inspect targeted diffs against the checkpoint and the damaged task record. Identify which changes are regressions and which are pre-existing work; do not blindly reset the tree. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#general-principles; reason: Preserve unrelated work and avoid indiscriminate cleanup. -->
2. Establish a safe, schema-preserving way to recover BACK-723's original content before any further task notes/status updates. Verify persisted fields after mutation. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Recover damaged records and verify persisted fields before further mutations can obscure loss. -->
3. Inspect the navigation process's actual error. Fix or revert the specific regression based on evidence. <!-- consolidation: unconfirmed; ref: none; reason: Verification must establish the mismatch instead of inferring success. -->
4. Run the exact compiled command in this repository with a real PTY. Confirm task rows loaded, all UI workers alive, input works, and close/reopen works. A rendered heading or alive parent process is insufficient. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: TUI usability acceptance must exercise actual public entrypoint loading input and close/reopen through a PTY. -->
5. Only then return to the requested text-input behavior. Keep verification narrow and representative rather than adding broad fixtures to evade the actual failing scenario. <!-- consolidation: discard; ref: none; reason: Historical recovery sequencing. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#testing; reason: Focused representative checks must exercise the claimed behavior. -->

Any rollback affecting substantial work needs a clear scope and user agreement. Previously the user permitted fresh parallel subagents, but was subsequently frustrated by repeated handoffs; don't resume that strategy automatically. Main-agent source review and firsthand verification were missing safeguards. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Substantial rollback requires explicit scope and user agreement. --> <!-- consolidation: discard; ref: none; reason: Historical delegation authorization and incident assessment. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Integrator must review and independently verify delegated readiness claims. -->

## Search behavior the user approved

- Immediate local typing and cursor insertion; Backspace, forward Delete, Left/Right/Home/End. <!-- consolidation: integrate; ref: docs/specs/interfaces.md#filtering-and-search; reason: Approved footer editor key and insertion behavior is missing. -->
- Local editing must not wait for async acknowledgment. <!-- consolidation: integrate; ref: docs/specs/interfaces.md#filtering-and-search; reason: Immediate local editing independent of asynchronous publication is missing. -->
- No polling for search/shared-state/focus synchronization, and no debounce. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Approved event-driven search/focus synchronization and no-debounce rule are absent. -->
- tmux-native events; no sockets or new transport infrastructure. <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport; reason: Search-specific tmux event restriction needs reconciliation with the current socket-based terminal boundary. -->
- `/` opens a ` / ` footer; Enter commits; Escape restores the previous query; empty submit clears and returns task focus. <!-- consolidation: integrate; ref: docs/specs/interfaces.md#filtering-and-search; reason: Slash search activation and prompt are missing. --> <!-- consolidation: integrate; ref: docs/specs/interfaces.md#filtering-and-search; reason: Enter commit behavior is missing. --> <!-- consolidation: integrate; ref: docs/specs/interfaces.md#filtering-and-search; reason: Escape restores the previous query. --> <!-- consolidation: integrate; ref: docs/specs/interfaces.md#filtering-and-search; reason: Empty submit clears search and returns task focus. -->
- Do not capture native agent `/`, Enter, or Tab. Ctrl+Q returns navigation. <!-- consolidation: exists; ref: docs/screens/workspace.md#states; reason: Focused agent terminals keep their input. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Ctrl+Q returns to navigation. -->
- Layout: full-width filters, Tasks beside Details/native agent, full-width shortcuts or temporary search. <!-- consolidation: unconfirmed; ref: docs/screens/workspace.md#ordered-regions; reason: Historical full-width filter/search composition needs reconciliation with current ordered regions. -->
- Shortcut wrapping is width/content-driven (100 vs 140 columns), not fixed height assumptions. <!-- consolidation: integrate; ref: docs/DESIGN-SYSTEM.md#shared-footer-and-focus; reason: Approved content-driven footer wrapping is missing while exact wrapping policy remains open. -->
- Preserve agent pane IDs/PIDs, Board/Workspace windows, zoom/detach/recovery, parked agents, and configured branch-aware Board loading. <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Presentation changes preserve selected execution and detach only client transport. --> <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#workspace-and-board; reason: Exact native tmux window and recovery topology retention needs reconciliation with the board route in the shared host. --> <!-- consolidation: exists; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Parked agent executions remain alive independently of attachment without requiring a durable parked label. --> <!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Branch-aware task discovery conflicts with the single project store. -->

## Relevant implementation changes already present

These describe the current work, not an endorsement of its architecture or correctness:

- `src/ui/components/footer-search.ts`: local authoritative `editorQuery`, synchronous changes including empty string; per-instance dependency `_listener` for normal editing/paste; disjoint prompt/textbox geometry; `restoreInput()` re-focuses and re-enters textbox input after resize. <!-- consolidation: discard; ref: none; reason: Historical implementation inventory not architectural endorsement. -->
- `src/ui/workspace/controller.ts`: cached task filtering; bound state subscriptions; `createLatestWorkspaceSearchPublisher` publishes immediately, coalesces only in-flight writes, orders focus after queries, and protects against stale snapshots; footer resize calls `restoreInput()`. <!-- consolidation: discard; ref: none; reason: Historical controller implementation inventory. -->
- `src/ui/list-removal-adapter.ts`: per-instance workaround for neo List passing an object to numeric-only `remove`; no dependency/global patch. <!-- consolidation: discard; ref: none; reason: Historical dependency workaround. -->
- `src/agent-workspace/tmux-workspace.ts`: state writes under tmux lock, `wait-for` listener registry/events, geometry handling; no search/focus polling. Independent background task/session refresh remains. <!-- consolidation: discard; ref: none; reason: Historical transport and refresh inventory. -->
- Latest bootstrap change uses shared `LockOwner` from `src/file-system/lock-owner.ts` / proper-lockfile rather than tmux bootstrap lock. Stale threshold 2 seconds, retry delay 25 ms, 200 retries. State lock remains tmux-based. Review lock path/server isolation, ownership and stale behavior; the previous main agent did not complete that review. <!-- consolidation: discard; ref: none; reason: Historical lock implementation and tuning. --> <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#testing; reason: Lock path isolation ownership and stale-owner safety review remains unverified. -->
- Latest missing-window change: `ready()` validates Workspace window membership; rebuild skips killing a recorded window only when absent; actual removal failures remain errors. <!-- consolidation: discard; ref: none; reason: Historical missing-window implementation result. -->
- Native tmux architecture and strict migration tooling are already in the checkpoint. Don't casually remove branch-aware loading or historical identity handling while recovering the input task. <!-- consolidation: discard; ref: none; reason: Historical checkpoint content. --> <!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Branch-discovery preservation is superseded by one authoritative store. --> <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Historical identity data preservation needs explicit ownership disposition rather than accidental deletion. -->

## Verification: reported passes vs actual failures

Earlier focused footer/tmux/controller/list-adapter tests: 27/27. Earlier compiled search rendering test: 1/1; measured edits ~279 ms, clear ~258 ms. A short resize/Escape regression passed. These do **not** establish that the real repository starts. <!-- consolidation: discard; ref: none; reason: Dated focused verification and timing evidence. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#testing; reason: Narrow tests do not establish unexercised real startup. -->

Latest delegates reported targeted `tmux-workspace.test.ts`, type-check, Biome and build passing, with real-tmux regressions for killed bootstrap-lock owner and a removed Workspace window. The main agent did not independently rerun every reported check. <!-- consolidation: discard; ref: none; reason: Historical delegated verification report and its evidence limitation. -->

Broad compiled integration remained failing, typically:

```text
Timed out after 15s waiting for wide Workspace footer shortcut rows after cancellation
```
<!-- consolidation: discard; ref: none; reason: Historical broad integration failure and signature. -->

Sequence: previous `First native` search, edit at width 100, clear/type `S`, resize to 140, Escape. Footer remained editing `S`, selected and alive. Some runs failed fake-agent fullscreen zoom earlier instead. Adding nonblocking Expect output drains and `restoreInput()` did not establish a green broad test. <!-- consolidation: discard; ref: none; reason: Historical reproduction sequence and failed mitigation evidence. -->

Previous aggregate command (not a recommendation to run before repairing real startup):

```sh
BACKLOG_TEST_CLI_BINARY=/Users/imribarr/Projects/Backlog.md/dist/backlog RUN_INTERACTIVE_TUI_TESTS=1 bun test --timeout=60000 src/test/tmux-workspace-integration.test.ts src/test/agent-workspace-pty.test.ts src/test/workspace-search-rendering.test.ts
```
<!-- consolidation: discard; ref: none; reason: Historical aggregate invocation explicitly not a current recommendation. -->

Previous result: 2 pass, 1 fail. Do not weaken Escape/resize assertions or extend timeouts to hide failures. <!-- consolidation: discard; ref: none; reason: Historical aggregate result. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#testing; reason: Do not weaken assertions or inflate timeouts to hide behavioral failures. -->

## Live tmux state at last observation

Identifiers below are historical observations; revalidate before acting. Never broadly kill sessions or respawn agent processes. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#observation-stop-and-deletion; reason: Validate current ownership before process effects. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#testing; reason: Operate only on isolated owned resources. -->

- This repo: `backlog-workspace-88f5d4c122ec`. <!-- consolidation: discard; ref: none; reason: Historical session identity. -->
  - Board `%81`, PID 46814, alive, running an older UI build. <!-- consolidation: discard; ref: none; reason: Historical process observation. -->
  - Recreated Workspace nav `%97`, PID 4179, **dead**. <!-- consolidation: discard; ref: none; reason: Historical process observation. -->
  - Tasks `%99`, PID 4183, alive but task-schema error. <!-- consolidation: discard; ref: none; reason: Historical process observation. -->
  - Details `%100`, PID 4192, alive. <!-- consolidation: discard; ref: none; reason: Historical process observation. -->
  - Display placeholder `%101`, PID 4147, sleep. <!-- consolidation: discard; ref: none; reason: Historical process observation. -->
  - Footer `%98`, PID 4194, alive. <!-- consolidation: discard; ref: none; reason: Historical process observation. -->
- Other project `/Users/imribarr/Projects/gemini`: `backlog-workspace-2e166c0806fa`; UI panes `%73`, `%92`, `%94`, `%95`, `%93`; display `%96` PID 16006. Leave alone. <!-- consolidation: discard; ref: none; reason: Historical unrelated process inventory. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#testing; reason: Unowned sessions must remain untouched. -->
- Agent session `backlog-sin-001-8249ce04`: `%69`, PID **83166**, `opencode.exe`; preserve. <!-- consolidation: discard; ref: none; reason: Historical process identity. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#testing; reason: Preserve user agent processes. -->
- Agent session `backlog-task-1-185c4823`: `%0`, PID **42459**, bash; preserve. <!-- consolidation: discard; ref: none; reason: Historical process identity. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#testing; reason: Preserve user agent processes. -->

Rebuild does not update already-running UI workers. Earlier selective UI respawns were performed, but current live processes are a mix of builds. Do not inject test keys into user-attached clients. The previous PTY smoke test spawned its own client and detached using Ctrl+B, d. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Rebuild freshness does not refresh already-running workers. --> <!-- consolidation: discard; ref: none; reason: Historical mixed-build and PTY smoke observations. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#testing; reason: Never inject verification input into user-attached terminal clients. -->

Avoid full process-command/environment dumps: earlier `ps` output exposed secrets from tmux test environment arguments. Inspect safe fields only. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#testing; reason: Process diagnostics must select safe fields and avoid exposing command or environment secrets. --> <!-- consolidation: discard; ref: none; reason: Historical secret-exposure incident. -->

## Working tree when this handover was written

Modified:

- BACK-723 task file above <!-- consolidation: discard; ref: none; reason: Historical modified-file inventory. -->
- `src/agent-workspace/tmux-workspace.ts` <!-- consolidation: discard; ref: none; reason: Historical modified-file inventory. -->
- `src/guidelines/cli-instructions/agent-workspace.md` <!-- consolidation: discard; ref: none; reason: Historical modified-file inventory. -->
- `src/test/footer-search.test.ts` <!-- consolidation: discard; ref: none; reason: Historical modified-file inventory. -->
- `src/test/tmux-workspace-integration.test.ts` <!-- consolidation: discard; ref: none; reason: Historical modified-file inventory. -->
- `src/test/tmux-workspace.test.ts` <!-- consolidation: discard; ref: none; reason: Historical modified-file inventory. -->
- `src/ui/components/footer-search.ts` <!-- consolidation: discard; ref: none; reason: Historical modified-file inventory. -->
- `src/ui/workspace/controller.ts` <!-- consolidation: discard; ref: none; reason: Historical modified-file inventory. -->

Untracked implementation/test files:

- `src/ui/list-removal-adapter.ts` <!-- consolidation: discard; ref: none; reason: Historical untracked-file inventory. -->
- `src/test/list-removal-adapter.test.ts` <!-- consolidation: discard; ref: none; reason: Historical untracked-file inventory. -->
- `src/test/workspace-controller.test.ts` <!-- consolidation: discard; ref: none; reason: Historical untracked-file inventory. -->
- `src/test/workspace-search-rendering.test.ts` <!-- consolidation: discard; ref: none; reason: Historical untracked-file inventory. -->

Also untracked and unrelated: `.serena/` and BACK-722 noted above. <!-- consolidation: discard; ref: none; reason: Historical untracked-file inventory. -->

The latest user-opened file was `src/ui/components/footer-search.ts`. The handover request caused no application changes, task mutations, builds, live-session changes, or commits. <!-- consolidation: discard; ref: none; reason: Historical handover activity record. -->
