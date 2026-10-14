# AOE-Style Lifecycle & Efficiency — Implementation Plan

**Status:** plan only. No repo file is modified by this document. Every integration point cites a `file:line` read in the working tree on **2026-10-07**.

**Upstream pin:** `agent-of-empires/agent-of-empires@0a17c859173a8794abfb55ae7e8038c4c4b17e7d`.

**Inputs:** `docs/aoe-lifecycle-comparison.md` (the §2 gap list this plan implements), `docs/aoe-status-tracking-plan.md` (the already-approved status axis this plan must not duplicate), `docs/opentui-workspace-spec.md`, `docs/opentui-workspace-session-contract.md`, `docs/opentui-workspace-implementation-plan.md` (phase format), `src/**`.

**Scope:** the comparison's §2 gaps only — the lifecycle/efficiency axis. The activity/status axis belongs to `docs/aoe-status-tracking-plan.md` and is **not** re-planned here.

**Tagging:** `[INFERENCE]` marks a claim that was derived rather than measured. Every other claim carries a repo `file:line` verified in this pass. Upstream AOE anchors are carried from the comparison and are **not** re-verified here (no upstream checkout in this workspace); they are marked `carried`.

**Review command for every phase:** `agentic-workspace workspace` (equivalently `bun run cli workspace`). No phase ends with documentation, tests, or internal components as its only deliverable.

---

## 0. Working-tree facts this plan depends on

### 0.1 The tree changed under the comparison

Three things are true on 2026-10-07 that were not true when the comparison was written:

1. **Most comparison anchors moved.** The web interface and its HTTP server were removed (`src/web/**`, `src/server/**`), and the OpenTUI controller/workspace grew substantially. Every §2 anchor was re-read; §1 records the corrected line numbers.
2. **Gap #2 no longer exists.** The comparison claims a structural refresh "disposes + re-mounts the whole workspace mount on ANY snapshot change". The current tree does not: `#refresh` reuses a live mount through `workspaceMount.update(workspaceOptions)` (`src/ui/opentui/workspace-controller.ts:797-803`), the mount exposes `update()` explicitly "keeping the mounted nodes and their geometry" (`src/ui/opentui/workspace.ts:117`, comment `:196-198`, body `:720-726`), and the status tab row is mounted once (`src/ui/opentui/workspace.ts:383`) — `update()` calls only `apply(next)`, `statusTabs.update(...)` and `redraw()` (`:720-726`). Gap #2 is dropped; see §1.2.
3. **The status plan's phases 0-4 have landed in the working tree.** `src/agent-workspace/agent-status.ts` (240 lines), `agent-status-probe.ts` (109 lines) and `status-hooks.ts` (324 lines) are untracked new files; `types.ts` (`AGENT_ACTIVITY_STATUS`/`AgentActivity`, `:26-40`), `workspace.ts` (`activityByTask` `:99`, `setActivity` `:727`) and `session-launch.ts` (`installStatusHooks`, `:205-236`) are modified; and the controller now runs the poller: `#activity` `:359`, `#activityTargets` `:360`, `#activityProbe` `:362`, `#activityTimer` `:363`, `#activityPolling` `:364`, probe created and first tick scheduled in `run()` `:405-407`, teardown `:423-428`, `#scheduleActivityPoll` `:496-503`, `#activityInterval` `:505-515` (500 ms / 1 s / 5 s), `#pollActivity` `:517-547` (modal and in-flight gating `:523`; no targets ⇒ **no tmux call** `:536-537`), `#commitActivity` `:550-573`, `#applyActivity` `:618-621` (calls `setActivity`, never `#scheduleRefresh`).

   A peer (`AoeStatusPort`) is still writing that axis. This plan consequently treats those files as **owned by the status work** and does not edit them.

### 0.2 Files this plan edits, and the one file it shares

| Phase | Files |
|---|---|
| L1 | `src/agent-workspace/session-store.ts`, `src/agent-workspace/sessions.ts`, `src/agent-workspace/workspace-state.ts`, `src/ui/opentui/workspace-controller.ts` |
| L2 | `src/agent-workspace/session-process.ts`, `src/agent-workspace/sessions.ts` |
| L3 | `src/agent-workspace/sessions.ts`, `src/agent-workspace/workspace-state.ts`, `src/ui/opentui/workspace-controller.ts`, `docs/opentui-workspace-spec.md`, `docs/opentui-workspace-session-contract.md` |
| L4 | `src/agent-workspace/live/tmux/socket.ts`, `src/ui/opentui/workspace-controller.ts` |
| L5 | `src/agent-workspace/live/tmux/vt-channel.ts` |
| L6 | `src/agent-workspace/live/agent-host.ts`, `src/agent-workspace/live/existing-agent-host.ts` |

`src/ui/opentui/workspace-controller.ts` is the only shared file: the status plan's poller lives there (`:359-364`, `:405-407`, `:496-573`, `:618-621`). The regions differ — this plan touches the boot sequence (`run()`, `:375-411`), `#loadSnapshot`'s readers (`:808-813`, `:861-869`) and the socket-name call site (`:1033`) — but the two changes must be sequenced, not merged blind. **Coordinate the hunk order with the status work before editing this file.**

Two more files already carry small uncommitted status-plan edits, so phases L2/L3 must branch from a tree that includes them rather than from `HEAD`: `sessions.ts` threads the launch `sessionId` (`sessions.ts:174`, `:293`) and `session-process.ts` does the same on resume (`session-process.ts:210`) — three one-line additions with no overlap with this plan's slices.

**Never edited by this plan:** `src/agent-workspace/agent-status.ts`, `agent-status-probe.ts`, `status-hooks.ts`, `types.ts`, `src/ui/opentui/workspace.ts`, `src/ui/status-icon.ts`, `src/agent-workspace/session-launch.ts`, `src/ui/opentui/status-tabs.ts`, and anything under `agentic-workspace/**`.

### 0.3 Anchor pin, and why controller anchors are stated by symbol

`src/ui/opentui/workspace-controller.ts` was 1416 lines when the comparison was written, 1668 lines when this plan was first drafted, and it is still being edited by the status work. Its anchors below are pinned to `md5 87b03663438c2709d531d495d7a334a6` (1668 lines). **Before editing, re-resolve every controller anchor by symbol name** (`run()`, `#loadSnapshot`, `#taskSessions`, `#scheduleActivityPoll`, `#pollActivity`, `resolveWorkspaceSocketName(...)`); do not trust the numbers across a rebase. The other files this plan touches were stable during the pass (`session-store.ts` 286 lines, `sessions.ts` 705, `session-process.ts` 483, `vt-channel.ts` 833, `socket.ts` 61, `agent-host.ts` 430, `existing-agent-host.ts` 106, `workspace.ts` 758).

---

## 1. Gap-by-gap re-verification

Eight gaps, in the comparison's ranked order. "Verified" = the anchor was read in this pass.

| # | Comparison's claim | Comparison anchor | Verified anchor today | Premise holds? | Disposition |
|---|---|---|---|---|---|
| 1 | `readAll()` reads every task's `state.json` sequentially per refresh | `session-store.ts:234-259`; caller `workspace-controller.ts:622-631` | `session-store.ts:234-257` (readdir at `:236-243`, comment `:246-247`, serial loop `:249-255`, return `:257`); caller `#taskSessions` `workspace-controller.ts:861-869` (`listAllSessions` `:867`) via `#loadSnapshot` `:834` | **Yes** | **Planned — Phase L1** |
| 2 | Structural refresh disposes + re-mounts the mount on any snapshot change | `workspace-controller.ts:441,503`; `workspace.ts:343` | Refuted: `workspace-controller.ts:797-803`; `workspace.ts:117`, `:196-198`, `:383`, `:720-726` | **No — refuted** | **Dropped** (§1.2) |
| 3 | VT heartbeat is an unconditional 1 fork/s per armed pane | `vt-channel.ts:87-100` | `vt-channel.ts:98-100` (`VT_HEARTBEAT_MS = 1_000`, stale `3_500`), body `:611-617`, stale compare `:387`, takeover `:379-406` | **Yes**, with a correction to the fix (§3.5) | **Planned — Phase L5** |
| 4 | Durable `RUNNING` sessions are reconciled only by an explicit command | `sessions.ts:465-501`; CLI `commands/agent-workspace.ts:157-160`; `workspace-controller.ts:326` | `sessions.ts:463-472` ("deliberately NOT a read … never called from a getter" `:463`, method `:466`), `settleDeadSessions` `:481-513`; CLI `commands/agent-workspace.ts:169-172`; no controller caller (grep) | **Yes** | **Planned — Phase L3**, narrowed (§1.4) |
| 5 | No boot-time orphan sweep for PID-named servers/sockets | `socket.ts:17-32`, `:35-67`, `:44-47`; `agent-host.ts:63-145`; `vt-channel.ts:98-100` | `socket.ts:24-32` (name), `:45-61` (kill + prove, guard `:46`); grammar `exec.ts:15`; exit-only cleanup `agent-host.ts:117-143`, installed `:358-360`, called `:313`; refusal `agent-host.ts:350-353`; lease takeover `vt-channel.ts:379-406` | **Yes**, and stronger than stated | **Planned — Phase L4** |
| 6 | `settleDeadSessions` probes STARTING/RUNNING sessions sequentially, one tmux exec each | `sessions.ts:492-513` | `sessions.ts:481-513` (SUSPECT `:486-487`, loop `:488`, probe call `:494`, `probePane` `:515-522`), **plus a second site** `enforceRunningLimit` `:594-617` (SUSPECT `:599-601`) | **Yes**, with a second same-class site | **Planned — Phase L2** |
| 7 | `#loadSnapshot` re-reads config + milestones + archived milestones every refresh | `workspace-controller.ts:551-562` | `workspace-controller.ts:808-813` (`Promise.all` of 4 readers) | **Yes** | **Dropped** (§1.7) |
| 8 | Fallback/existing capture polls the file every 250 ms even with no new bytes | `agent-host.ts:197-216,240-242`; `existing-agent-host.ts:82-85` | `agent-host.ts:195-216` (statSync `:197`), interval `:241-242`; `existing-agent-host.ts:37-54` (fstatSync `:41`), watch `:82`, interval `:84` | **Yes** | **Planned — Phase L6** |

### 1.1 Gap #1 — verified, and the caller moved

`readAll` still enumerates every task directory and reads every `state.json` in a serial `await` loop (`session-store.ts:249-255`); the comment states the cost model verbatim (`:246-247`). The single caller chain is:

`workspace-controller.ts:834` `#taskSessions(visibleTasks, selectedTask)` → `:867` `this.#workspaceState.listAllSessions()` → `workspace-state.ts:29-31` → `sessions.ts:71-72` → `session-store.ts:234` `readAll()`.

Two corrections to the comparison's framing:

- The comparison says the cost is "O(all tasks) per refresh"; it is, but the reader set is `visibleTasks`, i.e. the tasks that pass the **filter dialog** (`applyTaskFilters`, `workspace-controller.ts:818`). With no filters applied — the default — that is every task. This repository's own workspace has **123 task directories** (`agentic-workspace/tasks`), so a default refresh opens and parses 123 files before any render decision.
- `#taskSessions` builds its map over `visibleTasks`, but the mount renders only the **active status tab's** rows (`workspace.ts:448` slices `taskOrder`, built in `apply` from the active group, `:199-215`), and the marker is computed per rendered row (`workspace.ts:454-462`). Nothing outside that tab consumes the map: the footer and session picker use `#sessionTaskIds`, which `#loadSnapshot` maintains incrementally for the selected task only (`workspace-controller.ts:838-839`). So the set that must be read is the active tab's task set.

### 1.2 Gap #2 — dropped, refuted by the tree

The comparison's evidence (`#mount?.dispose()` per refresh, measured 36-41 ms navigation remount) does not hold today:

- `#refresh` keeps the mount and calls `workspaceMount.update(workspaceOptions)` when the previous view was `workspace` (`workspace-controller.ts:797-803`). `#mount?.dispose()` is reached only when leaving the board view (`:669`) or on the first workspace mount (`:801`).
- `update()` is documented as "Re-deriving them here instead of remounting keeps every node and its measured geometry, so a selection change cannot repaint the status tab row from a zero-width, pre-layout state" (`workspace.ts:196-198`); its body is `apply(next)` + `statusTabs.update(...)` + `redraw()` (`:720-726`), and both the base nodes and `mountWorkspaceStatusTabs` are created once inside `mountOpenTuiWorkspace` (`:383`).

**Decision:** no work. The residual per-selection cost is not rendering — it is the snapshot reload a selection change triggers (`#viewState.subscribe` → `#scheduleRefresh`, `workspace-controller.ts:401-403`, `:459-483`), and that cost is gap #1's and gap #7's subject. If gap #1 lands and selection changes still feel heavy, the next lever is diffing selection against the mount API, not re-introducing a remount.

### 1.3 Gap #3 — verified

`VT_HEARTBEAT_MS = 1_000` with `VT_HEARTBEAT_STALE_MS = 3_500` (`vt-channel.ts:98-100`); the body is one `set-option` fork per interval (`:611-615`), unref'd so it cannot hold the process open (`:617`). The constant's own comment calls it "the ONLY tmux traffic this transport generates while idle". The comparison's *fix* is wrong in one respect — see §3.5.

### 1.4 Gap #4 — verified, but "just call `reconcileTaskSessions`" is not safe

`reconcileTaskSessions` (`sessions.ts:466-472`) is public and idempotent, but it runs three steps: `settleDeadSessions` (`:470`), `settleDeadOwnerHandoff` (`:471`), `continueReadyHandoff` (`:472`). The last one **starts an agent** (`:564-568`), and `settleDeadSessions` itself **resumes** a dead *active* pane (`:499-510` → `resumeDeadActiveSession` `:525-532` → `resumeActiveSession` `:570-592`, which calls `process.create`/`prepare`/`resume`). A boot sweep that ran the whole method over every task would therefore start or resume agents in tasks the user never selected — forbidden by the session contract ("Do not silently start an absent session") and by the status plan's §8 non-goal ("No activity-driven lifecycle mutation").

The only current caller is the explicit CLI verb (`commands/agent-workspace.ts:169-172`), and the controller never calls it (grep over `src/ui`). The selected task *is* settled today, but only passively and only for the selected task: `#syncSelectedSession` (`workspace-controller.ts:912-939`) probes via `liveSession(..., { passive: true })` (`:920`), and `liveSession` writes `STOPPED` only on a conclusive dead/missing pane (`sessions.ts:89-116`; the conclusive classification is `:101-106`, and `:102` compares the exact `missingPaneStderr` string). Non-selected tasks keep a stale `RUNNING` dot until selected. Gap #4 is real.

### 1.5 Gap #5 — verified, and stronger than the comparison stated

`socket.ts` names servers `ink-proto-<pid>[-<instance>]` (`:24-32`) and `killWorkspaceServer` refuses anything not matching that grammar before proving absence (`:45-61`, guard `:46`; grammar `live/tmux/exec.ts:15`). Cleanup runs only in-process on exit (`agent-host.ts:117-143`, installed `:358-360`) and in the exit path (`:313`). There is no sweep, no reaper, and no orphan search anywhere (grep for `sweep|reclaim|orphan` over `src/agent-workspace` and `src/ui/opentui`).

What the comparison did not state: a leaked server on a **reused PID** is not a silent problem, it is a hard failure. `createAgentHost(...).start()` lists sessions on its socket first and throws `refusing to reuse the tmux server already on socket <name>; this host did not create it` (`agent-host.ts:350-353`). So a `SIGKILL`ed workspace can make a later workspace's first agent launch fail until that PID name is reused again. The socket directory is real and inspectable on this machine (`/tmp/tmux-501`; `TMUX_TMPDIR` unset).

### 1.6 Gap #6 — verified, with a second site the comparison missed

`settleDeadSessions` probes each STARTING/RUNNING record in a serial loop, with the comment "one tmux exec per session, serialized, no `Promise.all`" (`sessions.ts:486-488`). Each probe is not one fork: `probePane` (`:515-522`) → `process.alive` (`session-process.ts:404-417`) → `findPane` (`:455-478`) = one `list-panes -a` **plus** one `display-message` (`:408`), and a missing pane adds a second `findPane(includeDead: true)` (`:405`). So a reconcile pass costs 1-3 forks **per session**.

A second, same-class site exists in `enforceRunningLimit` (`sessions.ts:594-617`): it calls `store.readAll()` (`:597`), then a nested loop over **every task state × every session** with a serialized `await this.process.alive(session)` per RUNNING session — "O(total sessions) tmux execs on every session start, with no bound on the iteration" (`:599-601`, loop `:604-610`). Same defect, different trigger, so it is folded into Phase L2.

Batching is available because every durable session's pane lives on **one** server: `createSessionServer()` pins `socketName: "default"` and clears `TMUX` (`session-process.ts:131-132`), and `create()` tags every pane with the shared role (`PANE_OPTION_ROLE`, `:168`). The existing primitive `findTmuxPanesByTaskAndRole` (`tmux-pane-lookup.ts:36-65`) already issues **one** `list-panes -a -f <filter> -F <format>` for a whole role — `paneFilter` (`:86-96`) adds the task condition only when `taskId` is provided, and it logs one `debug("tmux","listPanes")` line per call (`:50`).

### 1.7 Gap #7 — dropped, no invalidation surface

The four readers are real (`workspace-controller.ts:808-813`). The gap is dropped for two verified reasons:

1. **Measured cost is trivial next to gap #1.** This workspace has 4 milestone files (`agentic-workspace/milestones`) and one `agentic-workspace/config.yml`, against the 123 session files gap #1 reads on the same refresh.
2. **There is no config/milestone subscription in the OpenTUI path, so a cache would freeze external edits.** The controller subscribes only to view state (`workspace-controller.ts:401-403`); config and milestone changes currently become visible only because a later refresh re-reads them (any selection, filter, or task mutation triggers `#scheduleRefresh`, `:459-483`). A cache would silently pin statuses, types and milestones until process exit. A watcher does exist (`src/utils/config-watcher.ts:236` `watchConfig`, used by the since-removed legacy `src/ui/unified/controller.ts:8`) but wiring it into the OpenTUI controller is new work whose payoff is ~5 small file reads per refresh.

If the user later wants it, the safe form is: reuse `watchConfig` for invalidation, never an ad-hoc cache keyed on nothing.

---

## 2. Ownership: status plan vs this plan

The comparison claims none of the 8 gaps contradicts the status plan. **Verified: true.** None of the 8 is *owned* by it either — 4 are adjacent and need an explicit boundary so nobody implements a slice twice.

| # | Status-plan section that touches it | Verdict | Consequence |
|---|---|---|---|
| 1 | §4.1 (refresh shape), §6.3 (anti-flicker) | **Adjacent** | The status plan changes *when the mount repaints* (`#applyActivity` → `setActivity`, `workspace-controller.ts:618-621`), not *what a refresh reads*. Phase L1 must keep the property §4.1 depends on: one refresh per snapshot change, one directory scan per refresh, no new session-state cache. |
| 2 | §6.3 | **Already satisfied** | The no-remount property §6.3 guarantees for activity updates holds for structural updates too (`workspace.ts:720-726`). Nothing to do. |
| 3 | — | **Unowned** | The status plan's cadences (§4.2; landed as `#activityInterval`, `workspace-controller.ts:505-515`) are poller ticks, not the VT lease heartbeat. Different mechanism, different file. |
| 4 | §3.4 (resolver must not call `reconcileTaskSessions`), §8 non-goal (no implicit reconcile) | **Adjacent, with a shared constraint** | Phase L3 must be a controller *boot policy*, not resolver work, and must not be reachable from a getter. §3.4 keeps the resolver pure; L3 keeps the sweep out of it. |
| 5 | — | **Unowned** | No section of the status plan touches private tmux servers or sockets. |
| 6 | §3.1 (`alive` observation source), §4.2 (probe cost) | **Adjacent — shared primitive** | The status plan's landed probe is per-session with a 2 s half-life cache (`agent-status-probe.ts:71-96`), executed per target (`workspace-controller.ts:1078-1110`). Phase L2 must be **additive** (a new batch method) and must not change `alive()`. If the status work later wants the batch snapshot for its probe, that is its slice, not this one — see §3.2. |
| 7 | §4.1 | **Unowned** (dropped) | The poller does not re-read config or milestones. |
| 8 | §3.1 (`output` liveness source) | **Adjacent** | The resolver consumes output liveness; the fallback capture poll feeds those bytes. Phase L6 must never delay *live* bytes (§3.6). |

**Owned by `docs/aoe-status-tracking-plan.md` (do not implement here):** the activity enum and its `[D2]` no-persistence rule (§1), hook emitters and install (§2), the resolver + probe + `skip_capture` (§3), the poller, cadences, modal-gated polling and poller lifetime (§4 — landed), `setActivity` and the UI mapping (§6), and every phase in its §7. Its §0.3 constants (500 ms / 1 s / 5 s, 2 s TTL, 3 s / 30 s / 900 s / 4 s / 30 s) are its own and must not be duplicated here.

**Not owned by it, and therefore planned here:** gaps #1, #3, #4, #5, #6, #8.

---

## 3. Phases

Format mirrors `docs/opentui-workspace-implementation-plan.md` and `docs/aoe-status-tracking-plan.md` §7: **Deliverable → Slices → Review evidence → Stop condition**, plus the runtime cost and risk this axis is about. Each phase adds one gated `debug()` line at its changed path so a reviewer can read the number from the file sink: `AGENTIC_WORKSPACE_DEBUG=<subsystem> AGENTIC_WORKSPACE_DEBUG_FILE=/tmp/agentic-workspace-debug.log agentic-workspace workspace` (`src/utils/debug-log.ts:17-20`, `:137`). Do **not** review with debug on stderr: OpenTUI owns the screen.

**Ordering rule.** Dependencies first (`L2` is `L3`'s prerequisite), then evidence strength × payoff: measured per-refresh cost (`L1`), bounded per-pass cost (`L2`), correctness of the dot after a restart (`L3`), a leak that turns into a launch failure (`L4`), the dominant idle cost (`L5`), then the last syscalls (`L6`).

### Phase L1 — Refresh reads only the tasks it can render

**Deliverable.** One refresh still performs exactly one directory scan, but opens and parses `state.json` only for the tasks the active status tab can render, and does so with a bounded worker pool instead of a serial `await` loop. On this repo the default drops from 123 file reads per refresh to the active tab's count.

**Slices.**

| Slice | Landing point | Change |
|---|---|---|
| Store filter | `src/agent-workspace/session-store.ts:234-257` | `readAll(taskIds?: readonly string[])`: build the accepted slug set (`slug`, `src/agent-workspace/session-utils.ts:23`) and skip non-matching directory entries. Unspecified ⇒ every entry, exactly as today. Keep one `readdir` (`:236-243`), ENOENT-as-empty (`:240-241`), skip-on-ENOENT (`:250-252`), and the `validate` throw for a malformed file (`:253`). |
| Parallel read | same, `:249-255` | Replace the serial loop with the repo's existing bounded worker-pool shape: `await Promise.all(Array.from({ length: Math.min(CONCURRENCY, entries.length) }, worker))` over a shared index, mirroring `src/file-system/task-repository.ts:7,102` (`TASK_FILE_READ_CONCURRENCY = 32`). `Promise.all` keeps "first failure wins"; read order must not affect results. |
| Service + facade | `src/agent-workspace/sessions.ts:71-72`, `src/agent-workspace/workspace-state.ts:29-31` | Thread the optional argument; no other behaviour change. `enforceRunningLimit`'s own `store.readAll()` (`sessions.ts:597`) stays unfiltered. |
| Caller | `src/ui/opentui/workspace-controller.ts:818,829,834,861-869` | Compute the active tab's task set with the predicate already at `:829-830` (`matchesStatus`, whose definition sits directly beside it), falling back to all `visibleTasks` when `activeStatus` is undefined, and pass it into `#taskSessions`. A tab switch re-reads because `onStatusChange` (`:759-766`) persists `activeStatus` into view state, which notifies the controller (`:401-403`, `:459-483`). |
| Observability | `src/agent-workspace/session-store.ts:248` | Extend the existing `debug("store","readAll.begin")` site with `reads` (files opened), `skipped`, and `ms`. |

**Review evidence.** In this repo (123 tasks): run `AGENTIC_WORKSPACE_DEBUG=store AGENTIC_WORKSPACE_DEBUG_FILE=/tmp/agentic-workspace-debug.log agentic-workspace workspace` and open the log — `readAll.begin` must report `entries=123` with `reads` equal to the To Do tab's task count, not 123. Then, in the real app: switch status tabs and confirm every tab still shows its green dots (no missing dot on first view of a tab), move the selection, and confirm no visible delay before the list paints. `agentic-workspace agent-session list <task>` is unaffected.

**Runtime cost.** Wall time per refresh: one readdir (unchanged) + one read per in-tab task, issued 32 at a time. File reads and `JSON.parse` calls fall by (all tasks − active-tab tasks).

**Risk.** The only correctness hazard is reading *too little*. Guarded because the mount renders only the active tab's rows (`workspace.ts:448`) and every other consumer uses the selected task's own read (`#sessionTaskIds` `:838-839`; `#activeSession` `:899`). The fallback when `activeStatus` is undefined is "read everything", so the first paint can never be under-read.

**Stop condition.** `readAll.begin` reports only the active tab, every tab still renders its dots, and `src/agent-workspace/session-store.test.ts` proves the unfiltered path is behaviourally unchanged.

### Phase L2 — One pane snapshot per reconcile pass

**Deliverable.** A reconcile pass and a running-limit scan issue **one** `list-panes` fork for all durable panes instead of 1-3 forks per session, and every consumer still sees the exact `{exitCode, stdout, stderr}` contract `SessionProcess.alive` produces today.

**Slices.**

| Slice | Landing point | Change |
|---|---|---|
| Batch probe | `src/agent-workspace/session-process.ts:404-417,455-478` | **Add** `probePanes(sessions)` (final name settled in review): one `findTmuxPanesByTaskAndRole` call with `role: LIVE_PREVIEW_ROLE`, `includeDead: true`, and **no** `taskId` — the seam already exists at `:468` and the primitive at `tmux-pane-lookup.ts:36-65`. Match rows to records locally by `taskId`. Leave `alive()` untouched (the status work consumes it — §2). |
| Contract parity | same | A record with no row ⇒ `{ exitCode: 1, stdout: "", stderr: missingPaneStderr(session.id) }` — the **exact** string (`session-process.ts:120`), because `liveSession`'s passive branch compares it whole (`sessions.ts:102`). Two rows for one task ⇒ the existing `Multiple tmux panes match agent session <id>.` error (`:480`). A malformed `pane_dead` value ⇒ fall back to that session's single-session `alive()`. `isMissingTmux` ("no server running", `session-process.ts:105-107`, `process-tree.ts:78`) ⇒ every record missing. Any other failure ⇒ every record **inconclusive** (non-missing stderr), so nothing settles. |
| Reconcile rewire | `src/agent-workspace/sessions.ts:481-513` | `settleDeadSessions` builds the record list, calls `probePanes` once, then keeps its existing per-session settle/resume logic unchanged (`:488-513`) with the probe result passed in. Keeps the `debug("session","settle.probe")` site (`:495`). |
| Limit-scan rewire | `src/agent-workspace/sessions.ts:594-617` | `enforceRunningLimit` replaces the nested serial `alive` loop (`:604-610`) with one `probePanes` call over the candidate records (live ⇔ row present **and** not dead), keeping the `readAll()` (`:597`) and the sort/stop logic (`:613-617`). |
| Observability | `src/agent-workspace/sessions.ts:488-513`, `:597` | Add `debug("session","probe.panes",{ sessions, forks: 1, ms })` at both sites. |

**Review evidence.** Start three agents in three tasks, then in the app press Enter on a fourth and confirm the start is not stalled by the limit scan; run with `AGENTIC_WORKSPACE_DEBUG=tmux AGENTIC_WORKSPACE_DEBUG_FILE=/tmp/agentic-workspace-debug.log agentic-workspace workspace` and count `[tmux] listPanes` lines around one reconcile — **one** line with `rows=N`, not N lines (the primitive logs per call, `tmux-pane-lookup.ts:50`). Kill one pane externally and select that task: the app must still report the session stopped — the same observable outcome as today.

**Runtime cost.** Fork count per reconcile/start drops from 1-3×N to 1. Idle cost unchanged (no timer added; this is a call-site change only).

**Risk.** The contract parity in the second slice is the whole risk. A wrong `stderr` makes the passive probe inconclusive (a permanent "could not inspect" notice) or, worse, conclusive when it should not be — which would demote a live session. The boundary tests in §6.2 exist for that. Coordination: the status work's landed probe (`agent-status-probe.ts:71-96`) probes per target via the controller's per-session `exec` (`workspace-controller.ts:1078-1110`); if it later wants this snapshot, it should call `probePanes` rather than add a second convention — but that is its slice.

**Stop condition.** One `listPanes` line per pass, all existing settle behaviour reproduced by tests, and `alive()`'s signature and output unchanged.

### Phase L3 — Honest dots at startup (demote-only sweep)

**Deliverable.** When `agentic-workspace workspace` starts, every durable `starting`/`running` record whose pane is **conclusively** gone is demoted to `stopped`/`failed` before the first paint. Nothing is resumed, created, killed without a conclusive probe, or handed off. Non-selected tasks stop showing a green dot for a session that died while the app was closed.

**Slices.**

| Slice | Landing point | Change |
|---|---|---|
| Sweep method | `src/agent-workspace/sessions.ts` (new, beside `reconcileTaskSessions` `:466-472`) | `settleDeadPanesAtStartup()`: one `store.readAll()`, collect `starting`/`running` records; `nativeWorkspace` records use `ownerIsAlive` (`:689-697`) and `finishNativeSession` (`:489-492`); everything else goes through **one** `probePanes` call (Phase L2). Demote with the existing `stopDeadSession` rules (`:534-552`) minus `resumeDeadActiveSession`. Skip entirely: `continueReadyHandoff` (`:564-568`) and `resumeActiveSession` (`:570-592`). May include `settleDeadOwnerHandoff` (`:554-562`) — a pure state repair with no process start. |
| Facade | `src/agent-workspace/workspace-state.ts:15-35` | Add a delegating method so the controller never re-implements session logic (session contract: the controller uses `WorkspaceStateService`). |
| Boot call | `src/ui/opentui/workspace-controller.ts:375-411` (`run()`) | `await` the sweep **before** `await this.#refresh()` (`:399`) and before the activity poller starts (`:405-407`), inside the existing `try` so a failure follows the current error path. The first paint must already be honest, and the poller's first tick must not race the sweep. |
| Spec/contract amendment | `docs/opentui-workspace-spec.md` (current native behaviour), `docs/opentui-workspace-session-contract.md` (lifecycle table, "Reconcile" row) | Record that a **startup demotion sweep** exists, is demote-only, and is the one place that probes tasks the user did not select. |
| Observability | new sweep site | `debug("session","startup.sweep",{ records, demoted, inconclusive, ms })`. |

**Review evidence.** With two tasks holding live agents: `tmux kill-session -t <name>` for the **non-selected** task's pane, exit `agentic-workspace workspace`, reopen it, and observe the dot is gone without ever selecting that task — today it stays green until selected. Then reopen with nothing dead and observe zero writes (the `state.json` mtimes are unchanged) and no `startup.sweep` demotions in the log sink. Also reopen with a **dead active** pane: this phase must print an honest `stopped`, and the resume path must remain reachable only through `Enter` or `agentic-workspace agent-session reconcile`.

**Runtime cost.** One boot-time snapshot pass (Phase L2: one fork) plus one `readAll` and O(dead) locked writes. Zero idle cost, zero per-refresh cost.

**Risk — the highest in this plan.** This is the only phase that changes product semantics: the spec currently says "Only the selected task is probed, so green dots on other tasks stay durable until selected" (`docs/opentui-workspace-spec.md`, current native behaviour). That sentence must be amended, or this phase dropped. It is also the phase closest to the status plan's non-goal against "implicit … reconcile"; the difference is that this is a **boot policy**, not an activity-driven mutation, and it never starts anything. Residual risks: (a) a demotion on an inconclusive probe — prevented by the L2 contract, and the `inconclusive` counter makes any occurrence visible; (b) duplicate work with the selected task's passive probe (`workspace-controller.ts:912-939`) — harmless and idempotent, and the sweep runs first so the notice path is unaffected; (c) a `starting` record whose owner PID is alive is skipped (mirrors `sessions.ts:493`).

**Stop condition.** A pane killed out-of-band for an unselected task is demoted on the next workspace start; a clean start performs zero writes; no agent is started, resumed, or handed off by the sweep (asserted in §6.2).

### Phase L4 — Reclaim leaked workspace servers at startup

**Deliverable.** `agentic-workspace workspace` reclaims `ink-proto-<pid>[-<instance>]` tmux servers whose owning PID is provably dead before it launches any agent, so a reused PID can no longer make the next launch fail with "refusing to reuse the tmux server already on socket …".

**Slices.**

| Slice | Landing point | Change |
|---|---|---|
| Enumerate | `src/agent-workspace/live/tmux/socket.ts` (new, beside `resolveWorkspaceSocketName` `:24-32`) | `socketDirectory()` = `join(process.env.TMUX_TMPDIR ?? "/tmp", \`tmux-${uid}\`)` (`/tmp/tmux-501` here; skip the whole sweep on `win32`). `listWorkspaceSocketNames()` = readdir of that directory filtered by the existing grammar `isWorkspaceSocketName` (`exec.ts:15`). Foreign names (`backlog-nav-…`, `default`) are ignored by construction. |
| Sweep | same | `sweepOrphanWorkspaceServers({ run, isAlive })` per name: parse the PID, skip when it is alive, otherwise `killWorkspaceServer(name, makeRun(name))` (`:45-61`) — which re-checks the grammar (`:46`) and proves absence after `kill-server` before returning. Liveness must mirror `process-tree.ts:32-40`: **ESRCH ⇒ dead**, anything else (including EPERM) ⇒ alive. Do **not** copy `ownerIsAlive` (`sessions.ts:689-697`), which treats every error as dead. |
| Boot call | `src/ui/opentui/workspace-controller.ts:375-411` | Call it in `run()` before the first agent can be launched (the socket name is minted later, `:1033`), alongside the L3 sweep. A sweep failure is logged and never blocks startup. |
| Observability | new sweep site | `debug("tmux","orphan.sweep",{ scanned, reclaimed, skippedAlive })`. |

**Review evidence.** With no workspace running: `ls /tmp/tmux-$(id -u)`. `kill -9` a running `agentic-workspace workspace` (its socket directory entry survives), then start a **new** workspace and confirm it (a) logs `orphan.sweep reclaimed=1`, (b) removes the stale `ink-proto-*` file from the socket directory, and (c) starts normally. Then run two workspaces at once and confirm the second reclaims nothing (`skippedAlive=1`). Also confirm the refusal path (`agent-host.ts:350-353`) is still present for anything the sweep cannot prove.

**Runtime cost.** One readdir plus zero-to-N `tmux -L <name> kill-server` + `list-sessions` pairs per process start. Nothing at idle.

**Risk.** Killing a foreign server must remain impossible: the name grammar, a provably dead PID, and `killWorkspaceServer`'s own absence proof are three independent gates. PID reuse with a *live* process is skipped; another user's servers live in a different `tmux-<uid>` directory; `default` and the test servers' names fail the grammar. The residual risk is a `kill-server` on a socket another process re-created between the liveness check and the kill — narrow, and the worst case is a refused launch (today's behaviour), not a killed live agent. This sweep cannot help a leaked server on a PID that is *alive but unrelated*; that case still ends in the documented refusal, which is the correct outcome.

**Stop condition.** An orphaned socket is reclaimed at the next start; a concurrently running workspace's socket is untouched; the foreign-name guard still throws.

### Phase L5 — Halve the idle VT heartbeat, with the coupled stale window

**Deliverable.** An armed VT pane costs ~0.5 forks/s at idle instead of 1/s, and a live owner can no longer be declared stale by a racing process.

**Slices.**

| Slice | Landing point | Change |
|---|---|---|
| Constants | `src/agent-workspace/live/tmux/vt-channel.ts:98-100` | `VT_HEARTBEAT_MS` 1 s → 2 s **and** `VT_HEARTBEAT_STALE_MS` 3.5 s → 5 s. Update the constant's comment: the window must be ≥ 2 × cadence + margin to tolerate one missed beat. |
| Consumers | `:611-617` (interval), `:379-406` (`claimPipeLease`, stale compare `:387`) | No code change beyond the constants; the stale branch and its takeover log stay as they are. |
| Observability | `:611-615` | First beat logs `debug("tmux","vt.heartbeat",{ cadence: VT_HEARTBEAT_MS, stale: VT_HEARTBEAT_STALE_MS })`. |

**Review evidence.** Arm one agent and leave the workspace idle for 60 s with `AGENTIC_WORKSPACE_DEBUG=tmux AGENTIC_WORKSPACE_DEBUG_FILE=/tmp/agentic-workspace-debug.log`: the heartbeat's `set-option` forks halve (60 → ~30 over 60 s at the 1 s cadence). The human check is the absence of regression: the preview keeps rendering, no `vt: previous pipe owner … is stale` line appears while this process is alive, and normal exit still releases the lease (`releaseLease`, `:408-415`). Then `SIGKILL` an owner and start a second workspace: the takeover must still happen, no later than ~7 s after the last beat.

**Runtime cost.** −0.5 fork/s per armed pane at idle — the transport's dominant idle cost. No other change.

**Risk.** The comparison's stated fix (~2 s cadence with the existing 3.5 s stale window) is **wrong**: 2 s cadence tolerating one missed beat means a 4 s gap, so a *live* owner would be declared stale between 3.5 s and 4.0 s and two contenders would fight (bounded — both re-read and agree, `:370-378` — but pointless traffic). Coupling cadence and window fixes that. The price is slower takeover after a hard death: worst case rises from ~4.5 s to ~7 s. That trade must be stated in the constant's comment.

**Stop condition.** Idle forks halve, no spurious takeover appears in a 60 s idle log, and a killed owner's lease is still reclaimed.

### Phase L6 — Back off the capture poll

**Deliverable.** The two 250 ms capture timers stop issuing an empty `stat`/`fstat` + `read` on every tick when nothing is arriving, while first-byte latency stays bounded.

**Slices.**

| Slice | Landing point | Change |
|---|---|---|
| Fallback host | `src/agent-workspace/live/agent-host.ts:195-216`, `:241-242` | Keep the 250 ms tick but skip the `statSync` branch on consecutive empty reads and schedule the next read later, resetting on the first byte (the early return at `:198-199` already distinguishes "no new bytes" from a read error). Cap the backoff at **500 ms** — this transport has no watcher, so the cap is the only bound on first-byte latency. Always perform a final read in the teardown path. |
| Attached host | `src/agent-workspace/live/existing-agent-host.ts:37-54`, `:82-85` | Same policy over `fstatSync`/`readSync` (`:41`), capped at 500 ms. Here the directory watcher (`:82`) is the primary trigger, so the interval is a safety net; a watcher-driven read must reset the backoff. |
| Observability | both | `debug("worker","capture.idle",{ emptyTicks, cadenceMs })` on each cadence change. |

**Review evidence.** Attach to a CLI-owned session, leave it idle for 60 s, and read `capture.idle` in the log sink: `emptyTicks` grows while `cadenceMs` caps at 500. Then type into the attached pane and confirm the echo appears in the preview within ~1 s, and that exit flushes the last bytes.

**Runtime cost.** ~4 `stat`+`read` calls per second per attached/fallback agent drop to ~2 or fewer when quiet.

**Risk — coordinate with the status work.** The bytes this timer produces are the fallback transport's output stream, which the status resolver reads as its output-liveness source (§3.1 `output`). A backoff that delayed *live* bytes would delay both the preview and that signal, so the reset-on-first-byte and the 500 ms cap are not optional. The VT transport is unaffected (bytes arrive over the socket). Payoff here is the smallest in the plan; if the user wants the shortest list, this is the phase to cut.

**Stop condition.** Idle ticks back off and cap; typed input still echoes within ~1 s; teardown still flushes.

---

## 4. Deliberately not doing

### 4.1 AOE mechanisms we will not copy (comparison §3, same reasons)

| AOE mechanism | Ref (`carried`) | Why not |
|---|---|---|
| Per-instance OS threads for session-ID polling (50-thread budget) | `src/session/poller.rs#L12-L40` | No daemon/step-2 session-ID protocol; thread-per-instance does not scale and Bun async + event push covers it. |
| Fork-per-tick `capture-pane` per hot instance each 500 ms cycle | `status_update.rs#L279-L330`, `status_poller.rs#L130-L205` | The VT path already pushes bytes over a Unix socket with zero tmux calls. Phase L2 reduces our *durable-record* forks; it adds no capture forks. |
| flock-heavy storage: lifecycle/title locks, reservation, CAS, fsync-per-write | `storage.rs#L1-L45`, `start.rs#L100-L155` | Single-user local tool; the per-task lockfile + rename is enough (`session-store.ts:198-223`, `:78-82`). More locks are contention, not safety. |
| Durable `Starting` reservation + sidecar reconciliation state machine | `start.rs#L80-L190` | Our start is manual and synchronous (`session-store.ts:104-125` has no `Creating`/`Deleting`); the machine adds states we do not model. |
| ACP daemon + structured session feed + tracing session tee | `src/main.rs#L100-L165`, `src/acp/session_tee.rs#L1-L115` | Different product surface; adds a supervised process and transport for no local-UX benefit. |
| Telemetry + startup update check (5 s network cap) | `src/tui/mod.rs#L285-L297`, `app.rs#L15-L25` | No network at startup, no persistent counters. |
| tmux as hidden per-agent backend + separate native TUI | `tui/mod.rs#L245-L255`, `tmux/session.rs#L180-L250` | The embedded terminal already owns UI + runtime; a second attach model duplicates ownership. |
| Manifest TOML rules engine + user `status_rules` | `manifest.rs#L371-L451,L507+` | Status-plan non-goal; a parser and config surface for cases pane/title + hooks already cover. |
| Docker/container credential refresh + container health batch | `status_poller.rs#L85-L100,L125-L165` | No sandbox containers in scope. |
| Always-on 33 ms event loop with a 500 ms status schedule in one process | `app.rs#L535-L625` | Our render loop is change-driven. The only periodic timer is the status plan's activity poller — a `setTimeout` chain, not a 33 ms loop (`workspace-controller.ts:496-503`), whose cadence is 500 ms only while a live agent exists and which makes **no tmux call** with no targets (`:536-537`). This plan adds no timer of its own. |

### 4.2 Gaps this plan drops, with reasons

| Gap | Reason |
|---|---|
| #2 (remount per snapshot change) | **Refuted by the tree**: `update()` replaces remount (`workspace-controller.ts:797-803`, `workspace.ts:117`, `:720-726`), and tabs mount once (`workspace.ts:383`). No work. |
| #7 (config/milestone re-read) | No config/milestone subscription exists in the OpenTUI path, so a cache would freeze external edits; payoff is ~5 small reads per refresh against gap #1's 123. The safe form, if ever wanted, is `watchConfig` (`src/utils/config-watcher.ts:236`) for invalidation. |

### 4.3 Also not done here

- No new timer, poller, or TTL anywhere: the status plan owns every periodic tick (§4 of that plan; landed at `workspace-controller.ts:405-407`, `:496-573`).
- No change to `SessionProcess.alive`, `liveSession`, `reconcileTaskSessions`'s public behaviour, or any durable schema (`SessionState.version` stays 1).
- No new `state.json` field and no activity persistence of any kind (`[D2]` is the status plan's rule; this plan does not breach it).
- No container/credential/update-check machinery, no daemon, no second attach model.

---

## 5. Already cheaper — do not regress

From comparison §4, re-anchored today. Each row is a property a phase must not trade away.

| Stage | Verified evidence today | Which phase could regress it |
|---|---|---|
| S0 entry | argv branch only (`src/cli/index.ts:3-9`) vs Clap + plugin graft + 5 s update probe | none |
| S1 config load | one `Promise.all` read (`workspace-controller.ts:808-813`) vs profile merge + migrations | L1 (must not split the eager read into more round-trips) |
| S2 session creation | one synchronous write path (`sessions.ts:119-190`) vs lock + reserve + reconcile | L3 (the sweep must not add a lock or a reservation) |
| S6 refresh | no lifecycle/reconcile timer; event-driven refresh coalesced to ≤1 follow-up cycle (`workspace-controller.ts:459-483`), 10 ms watcher coalescing (`view-state-store.ts:10`, `:207-215`) | L3/L4 (boot-time and one-shot: must not become periodic) |
| S7 write path | `writeFileAtomic` = temp + rename, **no fsync** (`session-store.ts:78-82`) | L1 (keep the same write helper) |
| S10 idle | no reaper timer | L5/L6 (cadence changes must not add a timer) |
| S11 isolation | one cross-process lock (view state, `view-state-store.ts:62`, `:104-113`) + PID-scoped sockets (`workspace-controller.ts:1033`) | L4 (the sweep must not introduce a global lock) |
| Refresh read (prior work, keep) | one batched session read per refresh, `#taskSessions` (`workspace-controller.ts:861-869`) — was 85,547 reads / 3130 ms over 121 visible tasks | L1 must keep it at **one** scan and **one** service call per refresh |

**Correction to comparison §4.** Its S4 row ("arg/env build only, no hook install") **no longer holds**: `prepareAgentLaunch` now resolves a status dir and calls `installStatusHooks` for supported providers (`session-launch.ts:205-236`). S4 is therefore the status plan's territory, not an "already cheaper" row. Do not cite it as a reason to avoid hook work, and do not edit that path here.

---

## 6. Verification

### 6.1 Existing suites affected

| Suite | Why it is affected |
|---|---|
| `src/agent-workspace/session-store.test.ts` | L1's optional filter and bounded-parallel read; the unfiltered path must stay identical. |
| `src/test/agent-sessions.test.ts` | L2 rewire of `settleDeadSessions`/`enforceRunningLimit`; L3's new sweep. |
| `src/test/tmux-pane-lookup.test.ts` | L2's batched primitive (filter/format/parse) — must stay green unmodified. |
| `src/test/opentui-workspace-controller.test.ts` | L1 tab scoping; L3/L4 boot ordering in `run()`; L3/L4 must not add a timer. |
| `src/test/opentui-agent-host-cleanup.test.ts` | L6 capture timers; teardown must still clear them. |
| `src/test/opentui-existing-agent-host.test.ts` | L6 attached-host backoff and watcher reset. |
| `src/test/tmux-test-server.test.ts` (+ `tmux-test-server.ts`) | L4's real server lifecycle; the reuse point for a real-`tmux` sweep test. |
| `src/test/view-state-store.test.ts` | Untouched; run to prove the refresh-coalescing semantics L1 depends on did not regress. |
| `src/test/opentui-workspace-layout.test.ts`, `src/test/opentui-status-tabs.test.ts` | Must stay green **unmodified** (status-work surfaces). |

### 6.2 New tests genuinely needed

Behaviour, boundaries, and invariants only — each asserts an observable surface (fork count, file bytes, durable status, mount identity).

**L1 — `session-store.test.ts` (extend).** A filter of `[a, c]` reads exactly those two files: build a directory where the skipped files' contents would throw `invalid state` if read (a stronger signal than a counter). Unspecified ⇒ all. ENOENT stays "skip"; a malformed file still throws `invalid state`. With N=64 files written without session mutations, `readAll()` returns 64 states, proving the worker pool drops nothing.

**L2 — `src/test/agent-sessions.test.ts` and `tmux-pane-lookup.test.ts` (extend).** With a recording `listPanes`, K=5 live records produce **one** call; a record with no row yields exactly `missingPaneStderr(id)`; `pane_dead=1` ⇒ dead; two rows for one task ⇒ the existing "Multiple tmux panes match agent session" error; a server-level failure ⇒ every record reports the missing-pane string; a transport failure ⇒ **no** record reports it. Then, through `liveSession(passive)`, a transport failure must produce a notice and leave durable state unchanged, while a dead pane still settles.

**L3 — `src/test/agent-sessions.test.ts` (extend).** With a fake `SessionProcess` that records every call: (a) dead pane ⇒ `stopped` + `endedAt`; (b) dead **active** pane ⇒ demoted and **no** `create`/`resume`/`prepare` call; (c) inconclusive probe ⇒ record untouched, counted inconclusive; (d) a `ready` handoff is **not** continued (no `continueHandoff`); (e) a second run over already-demoted records performs zero `store.mutate`; (f) a `nativeWorkspace` record with a dead owner PID is finished without any tmux call; (g) a `starting` record with a live owner PID is skipped.

**L4 — new `src/test/workspace-orphan-sweep.test.ts`.** Grammar: `ink-proto-123` and `ink-proto-123-2` accepted; `default`, `backlog-nav-1`, `ink-proto-abc` rejected. Liveness: ESRCH ⇒ reclaimed; EPERM and a live PID ⇒ skipped. Exactly one `kill-server` per reclaimed name; `killWorkspaceServer` still throws on a foreign name.

**L5 — new VT lease test (no suite covers `vt-channel.ts` today).** With an injected clock: beats are stamped at a 2 s cadence; a lease 4.1 s old is **not** stolen while the owner is beating; a lease 5.1 s old **is** taken over; `releaseLease` clears all three options.

**L6 — `opentui-existing-agent-host.test.ts` / `opentui-agent-host-cleanup.test.ts` (extend).** N empty ticks raise the cadence and cap it; one new byte resets it; `stop()` still performs a final read and clears the timer.

### 6.3 Explicitly excluded

- No mock-echo tests: nothing asserts that a stub returns what it was configured to return, and no test pins incidental wording (the exact `missingPaneStderr` string is a contract, not wording).
- No test of private internals without an observable surface: forks counted through the injected runner, state observed through `state.json` bytes or the returned durable status, render churn through mount identity.
- No live-provider suite is a gate. Provider/tmux behaviour is verified in the app; automated tests use a fake `TmuxExec` and the real tmux test server (`src/test/tmux-test-server.ts`).
- No new test for gaps #2 and #7 (nothing is implemented for them).

### 6.4 How tests are run in this repo

Run a single test file directly with Bun:

```sh
bun test src/path/to/file.test.ts --timeout=20000
```

The test preload configures worker scratch directories and tmux sockets. A full run is not required for these phases; the affected set above is. The tree currently holds 254 `*.test.ts` files plus one `*.test.tsx` (255 discovered files; `docs/test-suite-runtime-report.md` recorded 253 files / 2247 tests before the in-flight status-works additions).

**Per-phase gate (all phases):** affected suites green, `bun run check:types`, scoped Biome on changed files, and one real `agentic-workspace workspace` run with the phase's described observation. No phase is approved on tests alone.

---

## 7. Citation index

### 7.1 Repo anchors verified in this pass (2026-10-07)

**Session state / store:** `src/agent-workspace/session-store.ts:78-82` (atomic write, no fsync), `:104-125` (`SESSION_KEYS`), `:126`, `:198-223` (lock + RMW), `:234`, `:236-243`, `:246-247`, `:248`, `:249-255`, `:257`; `src/agent-workspace/session-utils.ts:23` (`slug`).

**Session service:** `src/agent-workspace/sessions.ts:71-72`, `:89-116` (`liveSession`; passive classification `:101-106`, `missingPaneStderr` compare `:102`), `:119-190` (start path), `:463-472`, `:470-472`, `:481-513` (SUSPECT `:486-487`, loop `:488`), `:489-493`, `:494`, `:499-510`, `:515-522`, `:525-532`, `:534-552`, `:554-562`, `:564-568`, `:570-592`, `:594-617` (SUSPECT `:599-601`, loop `:604-610`, `readAll` `:597`, sort `:613-617`), `:689-697`.

**tmux access:** `src/agent-workspace/session-process.ts:28`, `:105-107`, `:120`, `:131-132`, `:168`, `:404-417`, `:418-433`, `:443-452`, `:455-478` (`listPanes` seam `:468`, duplicate-pane guard `:480`); `src/agent-workspace/tmux-pane-lookup.ts:36-65` (debug `:50`), `:86-96`; `src/agent-workspace/live/tmux/exec.ts:15`, `:81-93`; `src/agent-workspace/live/tmux/socket.ts:24-32`, `:45-61` (guard `:46`); `src/agent-workspace/process-tree.ts:32-40`, `:78`; `src/file-system/task-repository.ts:7`, `:102`.

**Host / transport:** `src/agent-workspace/live/agent-host.ts:117-143`, `:159-172`, `:195-216` (statSync `:197`, early return `:198-199`), `:241-242`, `:313`, `:350-353`, `:358-360`; `src/agent-workspace/live/existing-agent-host.ts:37-54`, `:82-85`; `src/agent-workspace/live/tmux/vt-channel.ts:98-100`, `:370-378`, `:379-406` (stale compare `:387`), `:408-415`, `:611-617`.

**Controller / mount (pinned to `md5 87b03663438c2709d531d495d7a334a6`, 1668 lines — re-resolve by symbol after a rebase):** `src/ui/opentui/workspace-controller.ts:359-364` (activity state), `:375-411` (`run()`; `#refresh` `:399`, subscribe `:401-403`, probe + first tick `:405-407`), `:423-428` (teardown), `:443` (mount dispose), `:459-483` (`#scheduleRefresh`/`#ensureRefreshLoop`), `:485` (`#hasModal`), `:496-503` (`#scheduleActivityPoll`), `:505-515` (`#activityInterval`), `:517-547` (`#pollActivity`; gating `:523`, no-target early return `:536-537`), `:550-573` (`#commitActivity`), `:618-621` (`#applyActivity`), `:642` (`#refresh`), `:669` (board dispose), `:759-766` (`onStatusChange`), `:797-803` (mount reuse vs remount), `:807-813` (`#loadSnapshot` + `Promise.all`), `:818` (`applyTaskFilters`), `:829-830` (`matchesStatus`), `:834` (`#taskSessions` call), `:838-839` (`#sessionTaskIds`), `:861-869` (`#taskSessions`, `listAllSessions` `:867`), `:899` (`#activeSession`), `:912-939` (`#syncSelectedSession`, passive probe `:920`), `:1033` (`resolveWorkspaceSocketName`), `:1078-1110` (activity probe targets), `:1638` (`#persistState`).

**Mount surface:** `src/ui/opentui/workspace.ts:99` (`activityByTask`), `:117`/`:120` (`update`/`dispose` types), `:147` (`agentSessionDetails`), `:179`, `:196-199` (apply comment), `:383` (status tabs mounted once), `:421` (`redraw`), `:448` (`taskOrder` slice), `:454` (`marker`), `:720-726` (`update` body), `:727-741` (`setActivity`); `src/ui/opentui/status-tabs.ts:26`.

**Facade / view state / CLI / tooling:** `src/agent-workspace/workspace-state.ts:15-35`; `src/agent-workspace/view-state-store.ts:10`, `:62`, `:104-113`, `:191-215`; `src/commands/agent-workspace.ts:169-172`; `src/cli/index.ts:5-9`; `src/utils/debug-log.ts:17-20`, `:137`, `:167`, `:172`, `:188`; `src/utils/config-watcher.ts:236`; `src/test/test-preload.ts`; `docs/test-suite-runtime-report.md`.

**Status-plan work already in the tree (owned, not edited here):** `src/agent-workspace/types.ts:26-40`; `src/agent-workspace/agent-status.ts` (240 lines); `src/agent-workspace/agent-status-probe.ts:71-96`; `src/agent-workspace/status-hooks.ts` (324 lines); `src/agent-workspace/session-launch.ts:205-236`; `src/ui/status-icon.ts:44-58`.

### 7.2 Upstream AOE anchors (carried from `docs/aoe-lifecycle-comparison.md`, not re-verified here)

All paths are relative to the pinned commit `agent-of-empires/agent-of-empires@0a17c859173a8794abfb55ae7e8038c4c4b17e7d`: `src/session/poller.rs`, `src/session/instance/status_update.rs`, `src/session/instance/start.rs`, `src/session/instance/status.rs`, `src/session/instance/hooks.rs`, `src/session/storage.rs`, `src/tmux/session.rs`, `src/tmux/detect/**`, `src/tmux/status_detection.rs`, `src/hooks/**`, `src/tui/app.rs`, `src/tui/status_poller.rs`, `src/tui/mod.rs`, `src/main.rs`, `src/agents.rs`, `manifest.rs`, `src/acp/session_tee.rs`, `ready.rs`. They appear in §4.1 only as "what we are not copying", so no disposition depends on their exact line numbers.

### 7.3 Docs

`docs/aoe-lifecycle-comparison.md` (§2 gaps, §3 do-not-copy, §4 already-cheaper, §5 cost bounds); `docs/aoe-status-tracking-plan.md` (§3.1-§3.4, §4.1-§4.3, §6.3, §7, §8, §9, §10); `docs/opentui-workspace-spec.md` (current native behaviour, status tabs, refresh rule); `docs/opentui-workspace-session-contract.md` (ownership boundary, lifecycle table, reconcile rule, "do not silently start an absent session"); `docs/opentui-workspace-implementation-plan.md` (§1 delivery model, §8 verification standard); `docs/test-suite-runtime-report.md`.

---

## 8. Disposition summary

| # | Gap | Disposition |
|---|---|---|
| 1 | `readAll()` cost | **Planned — Phase L1** (unowned; adjacent to status-plan §4.1) |
| 2 | Remount per refresh | **Dropped** — refuted by `workspace.ts:117,720-726` and `workspace-controller.ts:797-803` |
| 3 | VT heartbeat 1 fork/s | **Planned — Phase L5** (unowned; the comparison's fix needed the coupled stale window) |
| 4 | No startup reconcile | **Planned — Phase L3**, narrowed to a demote-only boot sweep (unowned; constrained by status-plan §3.4/§8) |
| 5 | No boot orphan sweep | **Planned — Phase L4** (unowned) |
| 6 | Serial per-session probes | **Planned — Phase L2**, extended to the `enforceRunningLimit` site (unowned; shares a primitive with status-plan §3.1/§4.2) |
| 7 | Config/milestone re-read | **Dropped** — no invalidation surface in the OpenTUI path; payoff ~5 reads vs gap #1's 123 |
| 8 | 250 ms capture poll | **Planned — Phase L6** (unowned; adjacent to status-plan §3.1 output liveness) |

No gap is owned outright by `docs/aoe-status-tracking-plan.md`; six are planned here, two are dropped with reasons, and the four adjacencies (1, 4, 6, 8) are bounded explicitly in §2 so no slice is implemented twice.
