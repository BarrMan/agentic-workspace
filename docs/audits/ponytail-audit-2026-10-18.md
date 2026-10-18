# Ponytail Audit — 2026-10-18

What this repo does: AgenticWorkspace is a local terminal workspace and CLI for project tasks and agent sessions. Tasks and milestones are Markdown files; sessions run through tmux (a terminal session manager) and harness adapters. Load assumed: one developer, one project, with a TUI and one or more CLI/agent processes writing the same files.

Scanned commit `52ff99d`. No code changed by this scan. I left out 10 lower-severity findings.

## Must fix

1. **Task data can run shell commands** (`src/core/task-mutation-service.ts:265`, `src/utils/status-callback.ts:42-48`, `src/markdown/task-record-schema.ts:128`)
   - **What this is:** A status change runs `task.onStatusChange` or the project hook through `sh -c`.
   - **Problem:** A cloned repo can ship a task file with `onStatusChange: "curl … | sh"`. Marking that task done runs it with no confirmation.
   - **Fix:** Remove per-task `onStatusChange`. Keep only an explicit project-level hook gated by opt-in or confirmation.
   - **If we skip it:** Opening an untrusted project and changing a task status can execute arbitrary code.

2. **Workspace path can escape the project** (`src/utils/agentic-workspace-directory.ts:171-177`, `:36-49`)
   - **What this is:** The workspace directory setting is normalized before backslashes become slashes.
   - **Problem:** On POSIX, `foo\..\..\etc` becomes `foo/../../etc`, passes the leading `../` check, and joins outside the project. `statSync` also follows symlinks.
   - **Fix:** Convert backslashes first, reject any `..` segment, and reject symlinked workspace/config paths or require realpath containment.
   - **If we skip it:** Task reads/writes and config saves can target arbitrary directories.

3. **Promote/demote can pick the wrong new task** (`src/core/task-lifecycle-service.ts:65-83`, `:112-134`, `:189-193`)
   - **What this is:** After promoting, the code snapshots IDs before the lock and picks the first new ID after.
   - **Problem:** A concurrent create while waiting on the lock makes the set difference return the other task. Session identity is then remapped to the wrong record.
   - **Fix:** Return the allocated ID from `promoteDraft`/`demoteTask` and load that exact ID; delete the set-difference lookup.
   - **If we skip it:** The wrong task is returned and agent sessions attach to another task.

4. **Board moves overwrite concurrent edits** (`src/core/agentic-workspace.ts:625-631`, `:734`, `:758`, `src/core/task-mutation-service.ts:251`)
   - **What this is:** Bulk moves lock the tasks but write the pre-lock `Task` snapshots.
   - **Problem:** A title or description edit committed while the board move waits is silently replaced.
   - **Fix:** Re-read each task under the lock and apply only status/order/milestone changes, or reject if `updatedDate` changed.
   - **If we skip it:** Normal TUI plus CLI use loses user edits.

5. **Draft and milestone writes are not atomic** (`src/file-system/operations.ts:1148`, `:1017-1019`, `:1078-1080`, `:1483`, `src/file-system/milestones.ts:152`, `:188`, `:68`)
   - **What this is:** Draft save, promote/demote, and milestone create/rename use plain `Bun.write`. `ensureDirectoryExists` swallows all `mkdir` errors.
   - **Problem:** A crash or full disk can truncate the only copy after the container was moved. The error may surface later as an unrelated failure.
   - **Fix:** Use temp file plus `rename` like `saveTask`; stop swallowing `mkdir` errors.
   - **If we skip it:** Record bodies can disappear without a useful error.

6. **Artifact lock can be stolen from a live writer** (`src/file-system/task-artifact-repository.ts:454-478`, `:502-512`)
   - **What this is:** A 60-second mtime staleness check deletes the lock; release always removes the path.
   - **Problem:** A slow prune or write can exceed 60 seconds. Another process removes the live lock, both write `.artifacts.json`, and approvals are lost.
   - **Fix:** Put an owner token in the lock, refresh mtime, and only remove your own lock.
   - **If we skip it:** Approvals disappear under slow or large stores.

7. **Resume erases the saved conversation ID before republishing** (`src/agent-workspace/sessions.ts:878-902`)
   - **What this is:** Every launch deletes `nativeSessionId` before persisting `STARTING`.
   - **Problem:** If publish fails or the process crashes, the durable ID is gone and the exact conversation cannot be resumed.
   - **Fix:** Delete the field only for `intent.kind === "new"`. Keep it for resumes.
   - **If we skip it:** A failed resume loses the conversation link.

8. **Stop kills the pane, not the process tree** (`src/agent-workspace/session-process.ts:395-430`, `src/agent-workspace/process-tree.ts`)
   - **What this is:** `killPane` calls `pane.kill()` and deletes the launch record.
   - **Problem:** Children that ignore SIGHUP or detach survive. The session is marked stopped while an old agent still writes logs or state.
   - **Fix:** After pane kill, terminate the pane process group/tree and fail if survivors remain.
   - **If we skip it:** Orphan agents keep running and a later resume starts a second one.

9. **Ask timeout can hang forever** (`src/agent-workspace/session-process.ts:63-74`, `src/process/capture.ts:14-18`)
   - **What this is:** Timeout kills only the direct shell PID; output capture waits for stdout/stderr EOF.
   - **Problem:** A child that inherits the pipes keeps them open, so the 120-second timeout never resolves.
   - **Fix:** Spawn detached, kill the process group on timeout or abort, and do not wait for pipe EOF after timeout.
   - **If we skip it:** `agent-session ask` hangs and leaves children behind.

10. **Corrupt group/view state is silently erased** (`src/agent-workspace/group-store.ts:157-170`, `src/agent-workspace/view-state-store.ts:187-196`)
   - **What this is:** Any read or parse failure returns `undefined`; `seed()` treats it like a missing file and writes empty/default state.
   - **Problem:** Truncated JSON, permission errors, or a manual edit erase all groups/memberships or view state on the next open.
   - **Fix:** Seed only on `ENOENT`. Propagate parse and permission errors and leave the file untouched.
   - **If we skip it:** Silent data loss after a crash or bad edit.

11. **Config temp file can expose secrets** (`src/agent-workspace/config.ts:208-219`)
   - **What this is:** The temp file is written with the default umask, then renamed over the config.
   - **Problem:** A config with API tokens becomes `0644`. An existing `0600` file is silently downgraded.
   - **Fix:** Create the temp with `mode: 0o600` and preserve restrictive permissions.
   - **If we skip it:** Other local users can read tokens.

12. **TUI dies on an unhandled task-action rejection** (`src/ui/opentui/workspace-controller.ts:2683`, callers `:1026-1027`, `:1137-1138`, `:2149`, `:2113`)
   - **What this is:** `#handleTaskAction` awaits `core.getTask` before its `try`, and callers use `void`.
   - **Problem:** `AmbiguousTaskIdError` or a git/read failure becomes an unhandled rejection. Bun exits the TUI.
   - **Fix:** Move `getTask` inside the `try` and add one `.catch` around every `void this.#…()`.
   - **If we skip it:** One bad task ID closes the workspace and leaves sessions unmanaged.

## Should fix

13. **CI never runs typecheck or lint** (`.github/workflows/ci.yml:43,57,59`)
   - **What this is:** All three steps require `matrix.test_profile == 'full'`.
   - **Problem:** No matrix row defines `test_profile`, so the steps are skipped on every PR. The Bun cache step is skipped too.
   - **Fix:** Add `test_profile: full` to the Ubuntu row or remove the three conditions.
   - **If we skip it:** Type and lint failures merge green.

14. **Nix package points at a file the build does not create** (`flake.nix:94`, `:127`, `:129`, `scripts/build.ts:20-34`)
   - **What this is:** The wrapper runs `.../cli.js`.
   - **Problem:** `Bun.build` with entry `src/cli/index.ts` emits `index.js`, so the Nix command fails to start.
   - **Fix:** Point the wrapper and checks at `index.js`, or set the build output name.
   - **If we skip it:** `nix run` and the Nix CI job are broken.

15. **`bun.nix` still contains removed MCP dependencies** (`bun.nix:92-99`, `:832-839`, `.github/workflows/ci.yml:51-55`)
   - **What this is:** `bun.nix` lists MCP, Express, and `zod@4.4.3`; `bun.lock` has none of that tree.
   - **Problem:** The CI step `bun run update-nix` plus `git diff --exit-code` fails, and Nix fetches dead packages.
   - **Fix:** Run `bun run update-nix` and commit the result.
   - **If we skip it:** Ubuntu CI stays red and Nix builds carry unused code.

16. **Settings save overwrites another process's config edits** (`src/ui/opentui/workspace-controller.ts:2572-2592`, snapshot `:2489-2497`)
   - **What this is:** Save writes `{ ...current, ...next }` using the configuration captured when Settings opened. The config watcher is suppressed while the modal is open.
   - **Problem:** A CLI or other-pane edit made during the dialog is silently lost on Save.
   - **Fix:** Apply only changed keys against the opened snapshot, or re-read and reject on a revision mismatch.
   - **If we skip it:** Concurrent config edits disappear.

17. **Execution exit leaves durable state `RUNNING`** (`src/agent-workspace/session.ts:320-335`, `src/core/session-application.ts:288-343`)
   - **What this is:** `Session.publish` updates only its in-memory record on `execution-exit`.
   - **Problem:** The durable state stays `RUNNING`, so a new start is refused until the TUI's 30-second liveness tick. If the TUI closes first, the stale record survives.
   - **Fix:** Publish a finish checkpoint on `execution-exit`, or persist terminal state from `SessionApplication`.
   - **If we skip it:** A dead session blocks restart.

18. **Milestone rename/archive are unlocked** (`src/file-system/milestones.ts:157-202`, `:204-217`)
   - **What this is:** `create` holds the create lock, but rename and archive do not. Restore can write back even when no move happened. Archive overwrites an existing target.
   - **Problem:** Concurrent rename/archive can create duplicate IDs, lose edits, or overwrite an archived copy.
   - **Fix:** Run both under the create lock, restore only after an actual move, and refuse an existing archive target.
   - **If we skip it:** Duplicate or lost milestones.

19. **Task list/search reads every artifact multiple times** (`src/core/persistent-task-read.ts:92`, `src/core/agentic-workspace.ts:270-273`, `src/file-system/task-artifact-repository.ts:349-352`, `:402`)
   - **What this is:** Artifact text is attached in `PersistentTaskRead.query` and again in `queryTasks`, unconditionally. Each attach lists and reads files.
   - **Problem:** Every list or search does two full artifact scans, and per-file caps are applied after the read.
   - **Fix:** Delete the second attach. Only attach when a query is present. Stat and cap before reading.
   - **If we skip it:** Large task sets get slow and memory-heavy on every list.

20. **Board redraw repeats filtering and search-index builds** (`src/ui/opentui/board.ts:213-216`, `:252`, `:285`, `src/ui/opentui/board/models/board.ts:71-88`, `src/ui/opentui/board/models/filter.ts:55-73`)
   - **What this is:** `redraw` reads `lanes` several times. `get lanes` re-filters and allocates new lanes. A search index is built even with an empty query.
   - **Problem:** Each keypress does repeated corpus filtering and index allocation. Input lags with a few hundred tasks and a filter.
   - **Fix:** Compute lanes once per redraw and pass them down. Skip index creation when the query is empty.
   - **If we skip it:** Visible board lag.

Verdict: Not healthy for untrusted projects or true concurrent TUI/CLI use. Fix 1-2 first, then the data-loss and session-lifecycle findings.

Lean: `-3` published runtime dependencies possible (the npm launcher only needs Node builtins); no safe line deletion count confirmed without more work.

Not checked: Full test suite, live tmux/Nix/macOS/Windows runs, git worktree internals, Windows case/UNC behavior, NFS/clock skew, provider adapters, and the artifact viewer. I left out 10 lower-severity findings, including config serialization escaping, config-watcher retry loop, task-watcher symlink following, artifact `--from` containment, running-limit claim, arm64 CI coverage, tmux test gating, Linux tmux cleanup, and the fixed-sleep watcher test.
