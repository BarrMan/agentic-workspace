# Navigation and session fix list

## Scope

This document records closed review decisions and pending work. **Recording an item does not authorize implementation or SPEC edits.** SPEC alignment below is a future task, not work performed. The bounded Phase 1 removal of workspace request polling/adoption is approved; it leaves request storage/data and any producer unchanged. Other application changes, SPEC edits, architecture-contract changes, existing session data, and live processes remain unchanged until separately approved.

Discussion and rejected-experiment accounting: [navigation change review](navigation-change-review.md).

## Closed decisions — pending implementation and SPEC review

**Next item: F14 — restore the renderer/controller operation boundary.** Address F13's session-creation ownership within that flow. Existing IDs remain unchanged.

| ID | Required fix | Future SPEC alignment | Status |
|---|---|---|---|
| F1 | Remove `nativeWorkspace` entirely. Preserve the distinct provider namespace and provider conversation ID. | Aligned SESSION-001 and SESSION-018 in [Sessions](../specs/sessions.md). | Complete: 64 focused tests passed; typecheck and build passed; manually removed 60 flags from 26 state files, preserving other values. Full suite: 1701 passed, 2 skipped, 1 timeout; failing profile suite passed alone (4 tests). |
| F2 | Derive execution cwd from the task's captured worktree policy and deterministic task worktree location or project root; remove independently persisted per-session cwd authority. | Remove per-session stored cwd requirements and align cwd ownership with task configuration. | Implementation approved; owner handles existing-record cleanup |
| F3 | Derive the tmux session name from session/task identity instead of storing a redundant name. Execution-verification removal is tracked separately in F11. | Remove any requirement to persist the derived name. | Pending; not authorized to implement |
| F4 | Start replacement B while current active A remains running. B must start successfully before stopping A or changing the active pointer to B. Retire A's process, tmux execution, and attachment as part of the successful replacement; historical conversations must not retain executions after replacement completes. If B fails to start, do not displace A. Do not add the previously proposed separate preflight-validation phase or unnecessary guards. Ordinary task navigation is not conversation replacement. | Align replacement with successor-first startup, rather than the previously proposed stop-first ordering. Preserve the distinction between a starting replacement and a retained historical conversation. Review create/resume/handoff and mode-merge consistency. | Owner selected successor-first ordering; implementation pending |
| F5 | Load relevant workspace information initially; selecting another loaded task must derive its presentation without a whole-project reload or a reload caused by selection persistence. Navigation needs active session information, not all retained session histories. | Remove any requirement for broad reload on ordinary selection; align initial loading and subsequent change-driven updates. | Pending; not authorized to implement |
| F6 | Consume updated task data supplied by filesystem watcher events instead of discarding it and rereading the whole project. | Align event-driven visible updates; remove any contradictory mandatory broad-reload behavior. | Confirmed controller behavior; not authorized to implement |
| F7 | Keep one `lastUsedAt` timestamp for actual agent working activity; remove `idleSince`. Update from genuine working evidence and the transition ending that working interval, using event time. Selection, attachment, rendering, or rereading unchanged evidence must not refresh it. Use existing activity state plus elapsed time since `lastUsedAt`; unknown is not idle. Restrict recency fallback to active sessions. Remove stale-running-evidence-to-idle inference. | Define the single last-working timestamp and its update semantics; remove the separate idle timestamp requirement if present. Preserve positively known idle eligibility for idle eviction. | Accepted review item 2; implementation pending |
| F8 | Connect the existing `createVtChannel` socket output to the existing OpenTUI terminal output callback. Retain initial screen capture, input, and resizing. Remove append-log/tail/watch transport for live terminal output. For viewing the same session in multiple windows, follow the existing OpenCode same-session usage model; do not introduce a separate user-facing policy or speculative fallback requirement. | Align live-pane terminal transport; remove any requirement for duplicated conversation-output files as transport. | Accepted review item 3; implementation pending; no existing-log deletion authorized |
| F9 | Pass initial prompt text through one shared `prompt: string` launch interface, compose it in memory, and use existing safe command quoting. Adapters use their provider's supported argument form: positional for Claude/Pi, `--prompt` for OpenCode. Remove temporary/permanent prompt-file creation and shell file-reading substitution. Do not substitute the existing-conversation `askCommand` path for fresh launch. | Remove prompt-file injection requirements; specify file-free initial prompt delivery. | Accepted review item 4; implementation pending |
| F10 | Derive runtime resource locations directly from task/session identity, then remove obsolete `bootstrapPath` storage and readers. Keep legitimate hook/readiness resources distinct from forbidden prompt-injection files. | Remove requirements for a persisted bootstrap prompt path; align resource ownership without a prompt-file dependency. | Accepted review item 5; implementation pending; existing-data handling unresolved |
| F11 | Remove the execution ownership/identity verification discussed at attach/input/stop boundaries: repeated matching of expected project/task/session/pane identity, including stale captured-pane comparison. Scope this item to that verification, not an unrequested removal of all validation, process cleanup, or error handling. | Identify and align requirements prescribing the rejected verification. Record any affected execution-safety contracts before implementation; this tracking entry does not itself change them. | Owner explicitly requested removal in review item 6; implementation pending |
| F12 | Use session hooks for activity. Do not observe historical executions. Remove redundant overlapping runtime polling once the process-exit research below establishes the appropriate exit mechanism. Do not infer idle from missing events or infer process exit from terminal transport disconnection alone. Ownership verification is governed by F11, not retained implicitly by this item. | Align hook-driven activity and active-execution monitoring; remove requirements for historical-session scans or redundant polling where superseded. | Accepted action items from review item 7; implementation pending |

### F13 — Restore session creation ownership

Align creation with [Controller — Create a Session](../blueprints/controller.md#create-a-session): `Task.createSession` owns the session record, history membership, and active selection; Controller owns durable reservation, start ordering, soft-limit admission, and publication.

Remove the controller-owned `newRecord` → `newModelSession` → `hydrate` callback that returns an already-created session → `reserveSession` round trip. Restore actual Task-owned creation rather than merely renaming these helpers. Preserve required persistence, startup, and failure-cleanup behavior. Treat F4's replacement-order change separately; do not infer authorization to remove locks or safety gates from this ownership correction.

**Status:** Next item to address; implementation not yet authorized. Implement first, then stop for owner review; test changes and execution require explicit approval after that review.

### F14 — Restore the renderer/controller operation boundary

Align `WorkspaceSessions.#performLaunch` and its callers with [Renderer](../blueprints/renderer.md) and [Controller](../blueprints/controller.md): renderer actions request explicit create/resume operations using controller-owned selection; the renderer does not infer whether to create, resume, adopt, or hand off. Keep terminal attachment, output, sizing, focus, and attachment cancellation in the renderer. Remove renderer-owned domain selection authority and workspace storage-path construction, including the activity path built from `record.outputPath`. Preserve required lifecycle and cleanup behavior; moving or splitting the multipurpose function alone does not resolve the ownership violation.

**Status:** Next fix, authorized to implement after committing the approved current changes. Coordinate with F13 rather than retaining controller-owned session construction behind the new operation boundary. Stop after implementation for owner review; test changes and execution require explicit approval after that review.

## Research action

**R1 — Efficient unexpected-process-exit tracking.** Determine how to detect exit or forced termination of an active execution when its final activity hook does not run. Inspect existing process/tmux event capabilities and the existing live transport before introducing another mechanism. Compare them with the current 250 ms owned-execution polling and workspace liveness loop. Establish whether existing events can replace overlapping polls, what exit latency they provide, and how crash, detach, reconnect, and missing-hook cases are distinguished. Follow the existing same-session viewer model rather than inventing a new one. Return evidence and a concrete recommendation; this is not approval to add polling, start processes, or implement the recommendation.

## Execution boundaries

- All fixes and SPEC changes remain pending separate execution approval. Recording the owner's verification-removal decision does not remove running safety gates during review.
- Handle existing records only after explicit agreement on data a future schema change would invalidate or reinterpret. Do not sweep historical processes or delete logs as part of review.
- Do not resurrect the rejected navigation candidate or treat acceptance of these individual decisions as acceptance of its implementation.

## Review procedure

Discuss only unresolved questions, using fresh flat reference numbers in replies. Add accepted decisions here. Perform neither their implementation nor their SPEC alignment until explicitly approved.
