# Ponytail audit — commit `3c607c9a`

**What this repo does:** AgenticWorkspace is a terminal workspace and CLI for project tasks, configurable agent modes, and retained tmux-backed agent sessions. Tasks live in a project directory, with optional Git worktrees; the TUI shows either a grouped workspace or a Kanban board. I assumed one local user per project, a few concurrent CLI/TUI processes, and stores of hundreds to low thousands of tasks and sessions.

## Must fix

### 1. Whole-record task and config saves bypass locks

`src/core/agentic-workspace.ts:509`, `src/core/task-mutation-service.ts:250`, `src/file-system/operations.ts:1472`, `src/ui/opentui/workspace-controller.ts:2834`

- **What this is:** `updateTask` and config saves write a full object that was loaded earlier.
- **Problem:** Another process can edit the task or config between read and write, and the last writer silently wins. Config writes are also not atomic, so a crash can truncate the file.
- **Fix:** Use `updateTaskFromInput` for status changes, and write config through temp-file-plus-rename under the same configuration lock.
- **If we skip it:** Lost task, agent, and mode edits; interrupted writes can make config unreadable.

### 2. Session deletion can unlink arbitrary files

`src/agent-workspace/sessions.ts:526`, `:398-406`

- **What this is:** Delete and purge use `session.outputPath` and `bootstrapPath` from `state.json`.
- **Problem:** Delete has no containment check, and purge checks only a lexical prefix, not symlinks. A crafted or imported state file can point a sidecar outside the task directory.
- **Fix:** Reuse the canonical path check from `forgetTaskSessions` before every sidecar unlink.
- **If we skip it:** A repository-controlled state file can delete same-user files outside the workspace.

### 3. Session identity remap is not atomic with task promotion/demotion

`src/agent-workspace/session-store.ts:668-673`, `src/agent-workspace/sessions.ts:452-456`, `src/core/task-lifecycle-service.ts:80,129,208`, `src/core/agentic-workspace.ts:170-179`

- **What this is:** Remap rewrites `taskId` but keeps old `outputPath`, `bootstrapPath`, and `pathContext.taskDir`. The task container moves before remap.
- **Problem:** Promoted/demoted tasks keep sidecars in the old directory, so delete/purge rejects them after the worktree is removed. A view-state or session write error after the move reports failure for a transition that already happened.
- **Fix:** Move and rewrite sidecar paths during remap, or validate remap before the filesystem move and treat post-commit remap errors as warnings.
- **If we skip it:** Tasks become undeletable, and retries say “not found” after a real move.

### 4. Corrupt view state blocks workspace startup and task transitions

`src/agent-workspace/view-state-store.ts:209-216`, `src/ui/opentui/workspace-controller.ts:463-467`, `src/core/agentic-workspace.ts:170`

- **What this is:** Parse and permission errors now throw from `readEnvelope` and `seed`; `run()` opens the store unguarded.
- **Problem:** A truncated `view-state.json` or EACCES exits `agentic-workspace workspace` before the host exists. Promotion/demotion can fail after the task file already moved.
- **Fix:** Quarantine a corrupt file as `.corrupt-<timestamp>`, seed defaults, and show a notice; do not treat permission errors as corruption.
- **If we skip it:** The workspace will not start, and task transitions report failure after committing.

### 5. Group actions can crash the TUI

`src/ui/opentui/workspace-controller.ts:1149-1150`, `src/agent-workspace/group-store.ts:190-192`

- **What this is:** Group toggle and delete callbacks use `void this.#toggleGroup` and `void this.#deleteGroup`; those await `store.update`, which now propagates parse and lock errors.
- **Problem:** Malformed or unreadable `groups.json`, or a lock failure, rejects with no handler and exits the TUI.
- **Fix:** Add `.catch` handlers that set `#notice` and schedule a refresh, like the task-action callbacks.
- **If we skip it:** Open modals and layout are lost while detached agents keep running.

### 6. Full Ubuntu CI is red before tests run

`scripts/cli.cjs:76`, `scripts/smoke-compiled-build.ts:20,166`, `.github/workflows/ci.yml:59`

- **What this is:** The new `test_profile: full` runs `bun run check`; Biome 2.5.3 wants two files reformatted.
- **Problem:** Reproduced on `3c607c9a`: `bun run check` exits 1 with 2 errors and 69 warnings.
- **Fix:** Run `bunx biome check --write scripts/cli.cjs scripts/smoke-compiled-build.ts`, commit, and confirm `bun run check` exits 0.
- **If we skip it:** Ubuntu tests never run, and the required check blocks merges.

### 7. npm launcher installs unused runtime dependencies

`.github/workflows/release.yml:109`

- **What this is:** The release jq removes only `.devDependencies`; the published package keeps `@opentui/core`, `libtmux`, `zod`, and a `module` path to `src/cli/index.ts`.
- **Problem:** The launcher only uses Node builtins and spawns a prebuilt binary, so every global install pulls native OpenTUI and library trees for no runtime benefit.
- **Fix:** Also set `.dependencies = {}` and delete `.module` and `.trustedDependencies` before publishing.
- **If we skip it:** Larger, more fragile installs and a broken module path in the tarball.

## Should fix

### 8. Launch-failure settlement can leave STARTING or mark a placeholder RUNNING

`src/agent-workspace/sessions.ts:823,886,916-917,959-973`, `src/agent-workspace/session-process.ts:314-336`

- **What this is:** Resume sets `settleOnFailure=false`; `dispatchAttempted` is set before `launchPrepared`; that can throw before respawn while the `exec sleep` placeholder pane is alive.
- **Problem:** A post-dispatch resume failure leaves the record STARTING with a live pane. A pre-respawn launch-new failure makes settlement see the placeholder as live and mark the session RUNNING.
- **Fix:** Settle dispatched resume failures too; set the dispatch flag only after respawn is issued, and route pre-respawn errors through `failBeforeDispatch`.
- **If we skip it:** Mode reservations stay blocked, and users attach to a sleep process.

### 9. Queued STARTING request blocks task completion/deletion

`src/agent-workspace/sessions.ts:1475-1476`

- **What this is:** `stopAllTaskSessions` throws on STARTING plus missing, unlike `settleDeadSessions`, which tolerates `hasQueuedWorkspaceRequest`.
- **Problem:** A pending start request that the workspace has not adopted makes task delete/complete fail with a misleading tmux error.
- **Fix:** If a queued request exists, delete it and settle STOPPED instead of throwing.
- **If we skip it:** Tasks with pending starts cannot be completed or deleted.

### 10. Settings merge overwrites concurrent session settings

`src/ui/opentui/workspace-controller.ts:2612,2634-2639`, `src/agent-workspace/config.ts:310`

- **What this is:** The stored config may have no `sessions` key; the modal materializes all defaults; the merge compares raw opened config to the materialized edited config.
- **Problem:** A concurrent yolo/worktree change is replaced wholesale when the first pane saves.
- **Fix:** Pass the exact normalized snapshot, including resolved sessions and presets, as the `opened` argument.
- **If we skip it:** Silent loss of concurrent settings and unexpected behavior changes.

### 11. Deleting a state file while open wipes other data

`src/agent-workspace/group-store.ts:134`, `src/agent-workspace/view-state-store.ts:154-158,197`

- **What this is:** Updates fall back to empty/default state on ENOENT; view state writes rev 1 while the in-memory rev is higher, so `apply` drops it.
- **Problem:** Removing `groups.json` or `view-state.json` and then acting erases groups/membership or filters/selected modes; cross-pane updates stay ignored.
- **Fix:** Fall back to in-memory `this.state`, preserving `rev` and `origin` for view state.
- **If we skip it:** Persistent data loss and desync with no error shown.

### 12. Corrupt groups silently disable group features

`src/ui/opentui/workspace-controller.ts:476-481,2244`

- **What this is:** Startup catches the group-store error and sets `groupStore = undefined` with no notice; the composer then returns.
- **Problem:** Invalid or unreadable `groups.json` makes new group, toggles, and membership edits silently no-op for the session.
- **Fix:** Set `#notice` with the file path, or quarantine and reopen the store.
- **If we skip it:** Users conclude their groups were deleted.

### 13. `check:fallow` is broken, unwired, and adds install weight

`package.json:28-29,45`

- **What this is:** `fallow` exists as a command and two dev dependencies, but no CI step or hook runs it.
- **Problem:** It exits 1 with dead-code, duplicate, and health failures; eight platform binaries are fetched with no gate.
- **Fix:** Delete the command, config, and dependencies and regenerate `bun.nix`, or fix the baseline and gate it.
- **If we skip it:** Wasted dev/CI/Nix surface and a command that can never pass.

### 14. Nix packaging is pinned to one Bun version and tested on one platform

`flake.nix:34-51`, `.github/workflows/ci.yml:147-149`

- **What this is:** The baseline URL uses `${bun.version}` but the hash belongs to 1.3.13; the AVX2 control hardcodes 1.3.13; `nix-package` runs only on `ubuntu-latest`.
- **Problem:** A routine `nix flake update` breaks the hash, and aarch64/darwin packaging can break while CI stays green.
- **Fix:** Derive controls from `standardBun.passthru.sources` or assert the version, and matrix the Nix job over the advertised systems.
- **If we skip it:** Nix builds break on updates, and platform regressions ship.

### 16. Bare `description:` makes a task unparseable

`src/markdown/task-record-schema.ts:133`

- **What this is:** `description` is `z.string().optional()` while other optional text fields use `optionalText`.
- **Problem:** YAML null from `description:` throws, so the task is skipped from lists and cannot be edited or completed.
- **Fix:** `description: z.preprocess(optionalText, z.string().optional())`.
- **If we skip it:** A benign empty field hides the task while its data remains.

### 17. Every task write rescans all task files

`src/file-system/operations.ts:734`, `src/file-system/task-repository.ts:67`

- **What this is:** `saveTask` calls `listTasks` and `listCompletedTasks` before every write; batch moves repeat this per task.
- **Problem:** Edit and move latency grows with total task count; 2,000 tasks and a 50-task reorder is roughly 100,000 file reads.
- **Fix:** Drop the scan; canonical record and identity checks already reject mismatches.
- **If we skip it:** Board moves get slower as the store grows.

### 18. Large approved artifacts list as draft

`src/file-system/task-artifact-repository.ts:423-427`

- **What this is:** `sha256` is computed only for files up to 128 KiB; state becomes `draft` when it is absent.
- **Problem:** An approved file over 128 KiB lists as draft while `status` and `read` report approved.
- **Fix:** Compute the full fingerprint when an approval exists, or omit `state` instead of reporting draft.
- **If we skip it:** Contradictory approval UI and redundant re-approval.

## Nice to have

### 19. Linux test tmux cleanup is a no-op

`src/test/test-preload.ts:61`, `src/test/tmux-test-server.ts:43`

- **What this is:** Cleanup checks `/private/tmp/tmux-<uid>/...`; Linux uses `/tmp/tmux-<uid>`.
- **Problem:** Leaked tmux servers and panes survive the suite on Linux.
- **Fix:** Choose the base by platform or honor `TMUX_TMPDIR`.
- **If we skip it:** Test workers leak processes on missed teardown.

### 20. Board redraw recomputes the full projection five times

`src/ui/opentui/board.ts:213-216,230,285`, `src/ui/opentui/board/models/board.ts:72-87`

- **What this is:** `redraw` fetches `lanes`, then `selectedLane` and `selectedTask` getters each recompute the filtered projection.
- **Problem:** With a search filter, each keypress or resize runs five full filter passes and index builds.
- **Fix:** Derive selected lane and task from the already-fetched `lanes`.
- **If we skip it:** Input latency on large filtered boards.

**Verdict:** Not healthy. Fix items 1–7 first; item 6 means the new commit is not CI-green.

**Lean:** `-2` dev dependencies and their 8 platform binaries; `-3` runtime dependencies from the published npm package.

**Not checked:** Nix builds and GitHub-hosted CI were not run. Multi-process contention for findings 1 and 3 was inferred from the lock paths. The full test suite was not rerun; the known controller focus test still fails.
