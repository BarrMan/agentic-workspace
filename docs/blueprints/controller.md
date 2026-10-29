# Controller

Part of [BLUEPRINT](../BLUEPRINT.md). Controller is the application-operation layer. [TasksService](../../src/controller/tasks-service.ts) owns task operations and the task collection; [Core](../../src/controller/agentic-workspace.ts) owns session orchestration and composes the existing workflow owners. Domain transformations belong to [Task](task.md) and [Session](session.md); persistence belongs to [Storage](storage.md), including SessionStore. Controller is UI-agnostic. [ADR-0012](../adr/0012-explicit-operation-persistence-coordination.md) records the coordination decision.

## State

| Owner | State and responsibility |
|---|---|
| `core.tasks` / TasksService | Exact-`task.id` record Map, source-location metadata, hydrated Task models, collection subscription, task writes, hooks and task lifecycle. |
| Core | Owned Session models, pending launches, shutdown settlement, configuration snapshot and session orchestration. |
| `core.store` / SessionStore | Durable mode histories, active-session relationships and retained conversation records; a Storage owner, not a task-write service. |
| `core.workspaceState`, `core.modeDeletion`, `core.callingSession` | Their existing workspace, mode-deletion and calling-session workflows. |
| `core.storage` | Typed persistence and locking boundary; its FileSystem is private. |

Callers invoke these existing owners directly. Core does not mirror their APIs, and task creation, mutation, reads and lifecycle do not require intermediary facades. Exact declarations live in the linked source files.

## Load

Explicit [workspace initialization](../../src/controller/init.ts) provisions defaults, the project mode catalogue and required resources through Storage. Ordinary application loading never supplies missing required state. [Application composition](../../src/index.ts) creates Core with a Session factory and awaits `core.tasks.init()` before exposing it to a frontend.

`TasksService.init()`:

1. Subscribes through `Storage.watchTasks`, queuing record notifications until the initial collection is installed.
2. Loads active, historical completed and archived records once through `loadTasks`, `loadCompletedTasks` and `loadArchivedTasks`.
3. Installs records in a Map keyed by the exact stored `task.id`, with their source location, then applies queued notifications. Codec/read failures propagate rather than yielding a skipped-record partial collection; initialization failure releases the subscription.

Collection queries use this initialized collection. A filesystem notification reloads only its affected record through the read operation supplied by Storage; removal removes that entry. Successful owned writes update the collection and hydrated model fields immediately, without waiting for a filesystem echo. Source-location metadata chooses read scope; it neither sets `status` nor infers `done`. There is no normalized identity index, source ranking or corruption-based identity resolver.

Storage owns paths, globs and watcher mechanics: see [watching](storage.md#watching). This notification-based design does not promise periodic rescans or recovery from a missed notification. Collection initialization does not prove session liveness or start execution. Session histories are hydrated from SessionStore when needed, preserving existing Session objects and their runtime state.

Consumers own the unsubscribe function returned by `TasksService.subscribe`. `TasksService.dispose()` stops its storage subscription and clears its observers only; it neither stops sessions nor deletes persisted data. The application owner calls it when the shared service is no longer needed.

## Live Sessions

Core tracks owned executions separately from retained histories. `readObserved` and `projectInventory` inspect retained sessions, including surviving executions from another application lifetime, without starting, resuming or evicting them. Attachment does not transfer execution ownership merely because a pane is visible.

Explicit start/resume enforces the project-wide soft limit after admission. The limit never blocks a start. Only positively idle sessions are eligible, longest continuously idle first; working, permission-waiting and unknown sessions are protected. A failed eviction is reported and the limit may remain exceeded. [SESSION-012](../specs/sessions.md#session-012-enforce-the-project-wide-soft-limit) owns this behavior.

## Create a Session

`Core.newSession(task, modeId?, presetName?)` owns the operation:

1. Acquire the task operation lock before loading the current complete record. Keep it through startup and settlement so task deletion cannot overlap.
2. Ask TasksService to coordinate the task's status; a task with `done: true` retains its status. Resolve current effective configuration and the task-derived work context. Required status/context failures precede reservation or launch.
3. Hydrate the Task with SessionStore history. `Task.createSession` creates the relationship, selection and creation identity, including prior selection needed for rollback.
4. Persist exactly one provisional reservation through SessionStore, then acquire the conversation claim. Each session-state mutation has a short critical section.
5. Start through Session outside the session-state lock, while retaining the outer task lock. Require provider identity, positive initialization and accepted initial submission, delivered once without waiting for an answer.
6. Persist the resulting conversation identity into the reserved history before reporting readiness. Then perform soft-limit admission work.

On startup or durable-publication failure, attempt actual execution cleanup before rolling back the provisional relationship. Rollback uses the creation identity against current history; it must survive rehydration. Failed or uncertain cleanup retains durable tracking and resource ownership. Report the primary error and cleanup/publication errors with completed effects. See [SESSION-009–011](../specs/sessions.md#session-009-settle-session-creation-failures). A notification error after a successful commit does not undo that commit.

## Resume a Session

`Core.resumeSession(taskId, sessionId)` acquires the task operation lock and conversation claim, resolves the retained record and current configuration, and requires positive stopped evidence plus its exact native conversation identity. Session performs one resume attempt, outside the short session-state lock. Core persists the resulting record through SessionStore and settles failures without losing uncertain-execution tracking. Resume never replays the initial prompt, probes by sending synthetic input, or silently creates a new conversation.

## Stop a Session

`Core.stopSession(taskId, sessionId)` holds the task operation lock, prepares a validated stop target and performs actual cleanup. Only after successful stop does it remove live ownership and use `Task.selectSurvivorAfterStop` to choose a replacement active session in retained-history order. SessionStore persists that selection without deleting the stopped conversation. A failed selection write must be reported as a stopped execution with incomplete selection persistence.

Batch cleanup validates every relevant target before any stop effects. Relationships and tracking are removed only after required cleanup. Unknown ownership or liveness never authorizes termination or a successful stopped claim. See [session cleanup](../specs/sessions.md#session-015-validate-batch-cleanup).

## Select

Task owns mode/session relationship selection; the workspace owner owns the current presentation selection. Active-session history is persisted through SessionStore, not by saving the task Markdown record or preferences. Task session lookup includes retained stopped sessions, so resume does not depend on Core's live-execution Map. Ordinary selection never moves a session to another mode or starts execution.

## Update Task

`TasksService.update(task)` and `TasksService.edit(task)` accept the complete supplied task and derive identity from `task.id`. Unknown input is validated at its accepting boundary. These methods do not dispatch partial changes, reconstruct omitted fields, reparse accepted models, or accept previous-status/approval-control arguments.

**Lock precondition:** The caller holds the task operation lock, derives the replacement from the fresh complete record supplied by `Storage.withTaskLock(taskId, callback, options)`, and persists before releasing it. Neither task write reacquires that lock. A standalone full-record replacement is not automatically concurrency-safe: the API does not acquire or enforce the caller's lock, merge concurrent fields or repair a stale record. Relationship and board operations compute their transforms against locked current state; multi-task writes use Storage's ordered task-lock boundary.

| Operation | Required sequence |
|---|---|
| `update(task)` | Save the complete supplied record through `Storage.saveTask`, then update the collection and hydrated model fields. No timestamp change, status hook or event. |
| `edit(task)` | Load the previous task before the first save; await `update(task)`; set `updatedDate` to the current UTC minute (`yyyy-MM-dd HH:mm`); await `update(task)` again; attempt the configured status-change callback only for an actual status change; attempt `TasksChanged` publication. |

The two saves in `edit` are intentional. If the first save fails, no update is committed or published. If the second fails, the first remains committed and cached; no edit event is published. Once both succeed, hook and publication failures are collected as post-commit errors, with both attempted. Notification failure never rolls back persistence.

Approval uses the Task model's approval transform under the current-task lock, followed by `edit`. Storage has no approval override or approval-specific save API. Session-only changes use SessionStore.

Internal task updates remain distinct from explicit edits. When a pre-launch status change is required, `TasksService.coordinateTaskStatus` calls `update` once, then attempts its operation-specific status hook and publication; it does not advance `updatedDate` or perform the two-save `edit` sequence. Hook/publication failure can prevent session startup after that status write has committed and must be reported accordingly. TasksService also owns board-write policy and vacated-reference task writes; each workflow chooses its required `update` or `edit` semantics and post-commit effects. Not every task change is an explicit edit.

## Task Creation and Lifecycle

TasksService owns `create`, `markDone`, `archive` and `delete`. [Task requirements](../specs/tasks.md) own the user-visible outcomes; [Storage](storage.md#task-records-and-creation) owns allocation, create-only persistence and rollback receipts.

- New-task creation provisions its task container, artifacts, empty initial session state and required session resource directories before reporting success. Rollback preserves data changed since creation and reports incomplete cleanup.
- `markDone` sets the independent boolean to true through `edit` under the task lock, preserving status, branch and worktree and invoking no status-change hook. An already-done task is unchanged. Dependencies remain informational.
- `archive` is the consolidated cleanup/move operation. It has no status or `done` eligibility gate and does not implicitly change either field. Under the affected task locks, it performs required session and worktree/branch cleanup, removes workspace session tracking, moves the task container to archive, updates the collection and cleans vacated references.
- Historical completed records remain readable in their existing location. Normal loading and lifecycle refactoring do not relocate them.
- `delete` performs required execution/worktree cleanup before removing workspace-owned records and references. Provider-owned state is never deleted or moved.

Multi-effect operations are not transactions. Required cleanup, configuration/journal work and remaining observer delivery must still be attempted when an earlier notification fails. Owners collect notification failures locally and report them after required work, preserving any primary cleanup failure and accurately identifying committed moves, deletions and writes. [Signals](signals.md) defines delivery semantics.

## Observe Sessions

Session owns current-execution event handling and retained-execution observation through its runtime port. Core exposes observed records through `readObserved`, `projectInventory` and `attachmentContext`. Observation updates ephemeral state/activity and continuous idle duration only; it never persists lifecycle history, starts, stops, retries or evicts. Stale execution events are ignored.

## Shutdown

Renderer presents the close choice required by [SESSION-018](../specs/sessions.md#session-018-close-the-app-with-or-without-stopping-sessions). Ordinary TUI close releases its own subscriptions, monitoring and terminal presentation; it does not dispose a shared TasksService or stop execution. The application owner separately calls `core.tasks.dispose()` when its service lifetime ends.

Force close awaits `Core.shutdown()`. Core settles pending launches, inventories owned and rediscovered retained targets, and attempts each target once even after another failure. Only successful stops relinquish execution ownership; failed or uncertain cleanup retains tracking. Aggregate failures include target identities and completed effects. Failed shutdown does not publish successful `Closed`. Terminal-input settlement follows [SESSION-019](../specs/sessions.md#session-019-settle-terminal-input-on-close-or-deletion).

## Invariants

- TasksService is the single task-operation owner; Core sequences Session operations and SessionStore durability.
- Storage supplies workspace locations and typed record operations. Its private FileSystem, codecs and watcher paths do not leak into Controller or frontend policy.
- Locks are acquired before fresh reads; task operations consume the complete callback record. Session startup stays outside the short state lock while the outer task lock excludes deletion.
- Accepted inputs are not repeatedly parsed. Codec, relationship, containment, symlink, collision and execution-safety checks remain at their owning boundaries.
- Durable writes precede their notifications; subscribers do not initiate mutations. Failures report actual partial effects, not an invented transaction rollback.
- Only explicit operations start or resume sessions, with one attempt and no automatic retry. Observation and attachment never start execution; `unknown` grants no destructive authority.
