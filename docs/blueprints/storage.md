# Storage

Part of [BLUEPRINT](../BLUEPRINT.md). [Storage](../../src/storage/storage.ts) is the retained model-typed public boundary for workspace persistence, including configuration, session histories, locks and file watching. Its [FileSystem](../../src/storage/file-system.ts) implementation is private. Thin forwarding at this boundary preserves ownership and is legitimate; callers do not reach through to the backend. [ADR-0002](../adr/0002-storage-filesystem-paths-formats.md) retains the paths/formats strategy; [ADR-0013](../adr/0013-current-only-task-storage-and-format-handling.md) owns current-only formats and decoding-failure handling.

## Operations

| Boundary | Contract |
|---|---|
| `loadTasks`, `loadCompletedTasks`, `loadArchivedTasks` | Load records from the configured project store for TasksService initialization. Location does not determine status or `done`. |
| `loadTask(taskId, options)` | Direct exact-identity record read; strict on malformed targets. |
| `saveTask(task)` | Persist the complete supplied task record. No timestamp advancement, task event, status hook, approval override or session-history write. |
| `createTask(task)` | Create-only task persistence plus required task-resource provisioning; return a rollback receipt. |
| `withTaskLock`, `acquireTaskLock`, multi-task variants | Acquire before fresh record reads; supply complete current records and own missing-task failure. |
| `sessionStore()` | Supply the SessionStore boundary for durable histories and conversation claims. |
| Configuration and presentation stores | Read, lock and persist their own typed records; see below. |
| `watchTasks`, `watchConfig` | Own filesystem subscriptions; task collection reconciliation belongs to TasksService. |

The [Storage declaration](../../src/storage/storage.ts) owns the full API inventory. Milestone reads remain typed Storage operations (`loadMilestones`, `loadArchivedMilestones`), not caller filesystem access.

## Initialization and Required State

Explicit workspace initialization provisions required task/milestone roots, archive/completed roots, state roots, lock parents and configuration defaults, including the project mode catalogue. [Initialization](../../src/controller/init-helpers.ts) supplies the configuration; `Storage.initializeWorkspace` owns provisioning for the selected location, including custom workspace and root-user configuration lock parents.

New-task creation provisions the task container, artifacts directory, empty initial session state and required session resource/lock directories. `SessionStore.insertTask` is part of that explicit creation, not a lazy read or launch repair.

Ordinary startup, reads, writes and lock acquisition require their initialized resources. Missing required task, artifact or milestone roots, required session state, or a required mode catalogue fail with an error; they are not recreated or treated as empty collections. Missing optional files are governed by their own store contract, below. Malformed individual task records remain distinct from a missing required collection root.

Only current supported formats and configured locations are read. There are no startup conversions, migration entry points, deprecated configuration aliases or alternate legacy discovery paths. Existing records and historical migration files are not rewritten, relocated or deleted merely because migration support was removed.

## Task Records and Creation

[TaskRepository](../../src/storage/task-repository.ts) and the [task record schema](../../src/storage/markdown/task-record-schema.ts) own task persistence and decoding. Records use Markdown with YAML frontmatter; the codec owns schema/version checks and preserves the task body and supported custom frontmatter. Accepted models are not repeatedly schema-parsed in Controller, but encoding and trust-boundary validation remain required.

An existing-record save uses the supplied complete record and resolved `filePath`; it does not reconstruct a missing location, merge a patch, update timestamps or apply approval policy. Atomic replacement uses a sibling temporary file and rename. The caller owns the surrounding task lock; persistence does not acquire it again. These rules do not imply that the persistence implementation performs no reads of its own.

Creation is separate: allocate under the shared create lock, persist the current-schema counter atomically before create-only publication, and never overwrite an occupied destination or reuse a consumed identity. Configured task prefixes and subtask allocation remain supported. A malformed counter fails unchanged rather than triggering conversion or a scan fallback. [Task identity and allocation](../specs/tasks.md#task-003-task-identity) owns the allocation requirements.

Creation rollback uses the receipt to remove only resources still matching the operation's writes and to restore prior state where applicable. Concurrently changed data is retained, with incomplete cleanup reported. Task writes, session-state writes and container moves are separate effects, not a multi-record transaction.

Task identity is the exact stored string. Path encoding does not change identity. Existing-record writes must not target another task; destination and create-only collisions fail. Collection reads perform no container/frontmatter identity reconciliation, identity/path reconstruction or candidate ranking. Collection and direct-target reads propagate codec validation and security errors with filename and decoder context; neither skips corrupt records to return a partial success nor repairs them. [TASK-007](../specs/tasks.md#task-007-malformed-records) owns malformed-record behavior.

`moveTaskToArchive` and `deleteTaskContainer` perform persistence effects after TasksService coordinates required cleanup. They do not apply status/Done eligibility policy. Historical completed records remain readable in place.

## Locking and Fresh Reads

[LockOwner](../../src/filesystem/lock-owner.ts) is the shared acquisition/release mechanism for task operations, create counters, configuration, session state, conversation claims and other persisted resources under [ADR-0012](../adr/0012-explicit-operation-persistence-coordination.md). Each owner supplies the actual resource identity and contention behavior; sharing a mechanism does not combine all resources into one lock. Linked worktrees use the main project's shared task identity and store; distinct projects remain independent.

```text
Storage.withTaskLock(taskId, callback, options):
  acquire the task operation lock
  read the current complete task through Storage
  fail if missing or invalid
  await callback(currentTask)
  release the lock, preserving operation and release errors
```

The caller computes and persists its complete replacement inside that callback. `acquireTaskLock` exposes the same acquired-record guarantee with an explicit release function. Multi-task operations acquire their locks in deterministic order before loading the records. There is one acquisition owner per resource; do not nest acquisition of the same lock or add a second lifecycle-lock mechanism. `TasksService.update` and `edit` require the caller's task lock and do not enforce it themselves.

Session-state writes acquire their own resource lock, read current state, apply the accepted relationship change, write atomically and release in a short critical section. Provider startup and arbitrary external work remain outside that state lock. The outer task operation lock still spans startup/settlement to exclude deletion. Conversation claims use the same LockOwner mechanism for their separate execution-exclusion resource.

## Session Histories

[SessionStore](../../src/storage/session-store.ts) owns durable per-task mode histories, active session IDs, retained `AgentSession` records and conversation claims. Its versioned JSON is separate from task Markdown. Core supplies model-derived relationship changes; the store owns fresh locked persistence and record-incarnation/existence checks, not execution policy.

Reads decode unknown disk data, including membership and task-identity checks. Missing, malformed or unsupported required session state fails without reset or overwrite. Hydration and accepted post-mutation objects do not run a second schema-validation/repair pass. The Task model exposes its record and relationships directly, and Session exposes its `record` property; there are no model serializer wrappers to invoke.

Runtime observations are not durable lifecycle history. Stop, observation, provider cleanup and execution readiness belong to Session/Core/runtime, never to SessionStore. A saved record is not evidence that an execution stopped.

## Configuration and Presentation State

[storage/config.ts](../../src/storage/config.ts) uses the typed `AgentConfigurationStorage` interface. Project configuration mutation acquires the configuration lock, calls `loadConfigFromDisk()` for a fresh read that bypasses the instance cache, transforms accepted configuration, and calls `saveConfigUnderConfigLock()` before release. Both Storage methods are structurally required boundary operations. A normal save uses the same resource identity; it must not nest a second acquisition inside this flow.

Root configuration follows the same locked read-modify-write principle, preserving file permissions and atomic replacement. Unknown configuration is decoded at acceptance; accepted transforms are not reparsed across layers. Config snapshots are refreshed after successful persistence. Default mode seeding belongs to explicit initialization, not catalogue reads.

[GroupStore](../../src/storage/group-store.ts) and [ViewStateStore](../../src/storage/view-state-store.ts) may seed an absent optional presentation file on open under its lock. Their parent directories must already exist. Once open, mutations read current disk state under the lock; disappearance of a previously persisted file is an error, never permission to overwrite it from cached state. These optional-file semantics do not authorize repair of required workspace or task resources.

## Watching

Storage supplies watched locations and record readers through `watchTasks`. [task-layout.ts](../../src/storage/task-layout.ts) owns task layout names and globs; [task-watcher.ts](../../src/storage/watchers/task-watcher.ts) owns filesystem notifications. Controller and Renderer do not hardcode those details.

Notifications identify the affected record or artifact and its storage location. TasksService applies per-record changes to its initialized collection; its own commits update that collection immediately. The watcher is notification-driven, with errors surfaced by its owner; no polling interval, periodic full scan or missed-notification recovery is guaranteed. Subscription disposal closes watching, not execution.

Actual record absence while reconciling a received event is distinct from malformed data. It may remove the affected cached entry; it must not turn a decoder failure into a removal, a repaired record or successful partial loading. Missing required roots/state remain errors.

## Invariants

- Storage retains its typed public boundary and private FileSystem. Frontends may use its lock and presentation APIs; task-write policy remains exclusively in TasksService. Callers never construct workspace storage paths or reach into the private backend.
- Runtime-host I/O stays with SessionRuntime, Harness, or Renderer: provider receipts, terminal sockets and panes, process handles, logs, and user-selected input files are not workspace persistence.
- Source directories are storage metadata, not task status or completion. No normal read repairs identity, moves historical records or converts old formats.
- Atomic replacement, create-only allocation, destination-exists checks, rollback receipts, containment and symlink checks remain mandatory. Unknown record decoding is distinct from redundant validation of an accepted model.
- A durable write completes before its owner publishes success. Failed publication cannot undo persistence, and partial multi-effect operations must be reported accurately.
- Storage never starts, stops or manages provider-owned execution state. It persists model-selected relationships without choosing domain outcomes.
- Single-session sidecar deletion derives targets from the trusted task directory and validated session ID, canonicalizes the ancestor directory, verifies containment, checks targets with `lstat`, and unlinks only regular files. Recursive purge containment is determined with path/filesystem APIs, never regex or string-prefix comparisons.
