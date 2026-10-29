# Product Requirements: Tasks and Storage

## Overview

This contract defines task identity and data, project storage, artifacts, work context and completion, milestones, and task deletion behavior.

## Goals

- Specify observable task identity, storage, artifact, work-context, milestone, completion, archive, and deletion behavior.

## Scope

### In Scope

- Task records and identity, project task storage, artifacts, task worktrees, completion, milestones, archive, and deletion.

### Out of Scope

- Provider-owned configuration, data, or state management; duplicate-record repair; and automatic gating of launch or completion by dependencies.

## Actors

| Actor | Description |
|---|---|
| User | Creates, views, edits, launches, marks Done, archives, deletes, and manages tasks and artifacts. |
| Workspace | Stores and presents tasks, performs task lifecycle operations, and reports their outcomes. |
| Provider | Supplies provider-owned configuration, data, and state, which the workspace does not manage. |

## Functional Requirements

### TASK-001: Task scope and fields

**Description:** A task is a unit of work scoped to a project directory, whether or not that directory uses Git. Its editable business fields are title, description, type, priority, milestone, and labels; each may be optional, and none is made mandatory by this list. Priority stores and displays one configured label. Completion is an independent boolean `done`, defaulting to false for new tasks and when absent from a stored record; neither status nor storage location implies its value.

**Trigger:** A task is created or edited.

**Preconditions:** A project directory is selected.

**Behavior:**
1. Scope each task to its project directory, whether or not it uses Git.
2. Allow each listed editable business field to be optional.
3. Accept unknown task inputs and stored records through the current input/record schemas, including applicable title, date, configured-value, milestone, and card-scope rules. Accepted models are not repeatedly parsed at each internal layer; persistence encoding and security checks remain required.
4. Read an absent `done` as false without rewriting the record. Preserve the distinction between `done`, configured status, and storage location.

**Outcome:** No listed field is made mandatory.

**Failures:** Reject invalid supplied input at its accepting boundary; malformed stored records follow TASK-007.

**Acceptance Criteria:**
- A task is scoped to a project directory with or without Git; each listed field may be absent. Priority is the exact configured label, with no separate comparison value.
- New tasks have `done: false`; an absent stored field reads as false without a write, regardless of status or directory. A present `done` must be boolean.
- Unknown inputs are validated before acceptance; full-record persistence follows TASK-025 without reconstructing omitted fields.

### TASK-002: Creation and status configuration

**Description:** Task statuses come from project configuration and use the exact configured labels; status matching does not ignore whitespace or otherwise resolve spelling variants. Existing stored statuses are not rewritten by status matching. The CLI directs users to edit the configured status list in the configuration file. Creation produces a task directly, allocates its ID under a creation lock using the persisted task counter, and saves the new record without overwriting an existing target. Subsequent task actions operate on that task identity. The application does not provide draft promotion or demotion.

**Trigger:** A task is created or its status is used.

**Preconditions:** Project status configuration is available.

**Behavior:**
1. Use exact configured status labels and direct CLI users to edit the configured list in the configuration file; do not match whitespace-insensitive spelling variants or rewrite stored status values.
2. Create and save a task directly, allocating its ID under the creation lock and persisted-counter procedure in TASK-003.
3. Use that task identity for subsequent actions; do not provide draft promotion or demotion.

**Outcome:** The task is saved directly with an allocated identity.

**Failures:** Invalid status input fails at acceptance; allocation and required-resource failures follow TASK-003 and TASK-006 without overwriting existing data.

**Acceptance Criteria:**
- Status values match exact configured labels without whitespace-insensitive lookup or rewriting stored values; direct creation under a creation lock and no draft promotion or demotion are observed.

### TASK-003: Task identity

**Description:** Task IDs use `PREFIX-NUMBER` with optional dotted numeric subtask segments (for example, `TASK-1.2`). IDs are exact strings: lookup, equality, and references preserve casing and numeric spelling. `TASK-01` and `TASK-1` are distinct. Allocation uses the configured prefix and persisted counter, with create-only collision protection; archived IDs remain reserved. The application has no read-time identity alias, duplicate-resolution, or corruption-ranking policy.

**Trigger:** A task is created or addressed by ID.

**Preconditions:** An ID is being allocated or resolved.

**Behavior:**
1. Validate externally supplied IDs against the current task-ID grammar. Match accepted IDs exactly, including all dotted numeric segments and leading zeroes; do not uppercase or case-fold IDs during lookup.
2. Reject alphanumeric numeric segments and bare-number lookup. Do not infer prefixes, normalize numeric spelling, or add aliases.
3. Allocate under the shared create lock using the persisted per-prefix `lastAllocated` counter. Persist the advanced counter atomically before create-only save; a target conflict consumes the number without overwriting the existing container. Never decrement or reuse allocated numbers. [Storage](../blueprints/storage.md) owns persistence and lock mechanics.
4. A new prefix starts from zero under the create lock. Do not bootstrap or recover counters by scanning task records, branches, or other working copies. Missing required counter state, malformed counters, and obsolete counter formats fail unchanged.
5. Preserve create-only collision and destination-exists checks across the configured store, including archived IDs. Do not build a read-time duplicate/corruption resolver, select a ranked winner, merge records, or repair them.

**Outcome:** Task operations address the exact supplied identity; allocation preserves existing records and reserved IDs.

**Failures:** Malformed external IDs fail validation; an exact ID that does not exist reports not found. Invalid or missing required counter state is an error, not a recovery trigger. Create-only conflicts never overwrite existing data.

**Acceptance Criteria:**
- Lookup preserves casing and numeric spelling; `TASK-01` and `TASK-1` remain distinct, with no bare-number lookup or prefix inference.
- Allocation uses the shared lock and current counter, persists it atomically before create-only save, and consumes conflicts without overwriting records or reusing archived IDs.
- New prefixes require no corpus scan. Missing required, malformed, or obsolete counters fail without conversion, reconstruction, or deletion.
- Malformed-input errors and create-only collision protection remain; collection reads introduce no duplicate-resolution or ranking policy.

### TASK-004: Dependencies

**Description:** Tasks can depend on other tasks and display dependency blockers and readiness. Dependency links survive completion. Dependencies are informational: they do not automatically gate user-directed launch or completion.

**Trigger:** A task with dependencies is viewed, launched, or completed.

**Preconditions:** The task may have dependency links.

**Behavior:**
1. Display dependency blockers and readiness.
2. Preserve dependency links through completion.
3. Do not automatically gate user-directed launch or completion on dependencies.

**Outcome:** Dependencies remain informational and survive completion.

**Failures:** None.

**Acceptance Criteria:**
- Dependencies persist through completion and do not automatically gate launch or completion.

### TASK-005: Project task store

**Description:** Each project has one deterministic configured task-data location. A linked worktree uses the main project's task store. Initial loading reads that store; TasksService maintains the loaded collection through per-record events. Ordinary reads use that collection without a full rebuild or discovery across branches or other working copies. [Controller](../blueprints/controller.md) owns collection coordination; [Storage](../blueprints/storage.md) remains the persistence boundary.

**Trigger:** The application loads a project's task collection.

**Preconditions:** A project task-data location is configured.

**Behavior:**
1. Read the project's one deterministic store; linked worktrees use the main project's store.
2. Apply per-record additions, updates, and removals to the loaded collection without rebuilding it on each read.
3. Do not discover task records across branches or other working copies, or add a read-time identity resolver.

**Outcome:** The task collection is loaded from the configured store.

**Failures:** A missing required store or collection directory is an error, not an empty collection or an instruction to recreate it. Malformed individual records follow TASK-007.

**Acceptance Criteria:**
- Project loading uses its deterministic store, including from linked worktrees, without branch or working-copy discovery. Per-record events update the loaded collection; ordinary reads do not trigger a full rebuild.
- Missing required roots fail without repair; malformed individual records retain TASK-007's separate behavior.

### TASK-006: Task storage format

**Description:** Project configuration selects one task-data location: the project's `.agentic-workspace` directory (default), the application's user-level data location, or a user-selected path. The task data folder is outside `.git`; each task has an `artifacts/` directory within its task folder. Task records are stored in each task container as `task.md`, serialized as Markdown with frontmatter. Explicit workspace initialization provisions required workspace roots, state, counters, and lock parents. New-task creation provisions that task's required resources; later operations do not repair missing resources.

**Trigger:** Task data is stored or loaded.

**Preconditions:** A task-data location is selected in project configuration.

**Behavior:**
1. The project setting `agentic_workspace_directory` accepts a project-relative path, an absolute path, `~/…` relative to the user's home, or `user:` for the application user location `~/.agentic-workspace/<project-hash>` keyed by the canonical project root. Fresh projects default to `.agentic-workspace`.
2. Keep the task data folder outside `.git`. New-task creation provisions the task record, `artifacts/`, empty initial session state, and required session resource directories. Worktree allocation remains governed by TASK-012.
3. Store each task as `task.md` in its container, serialized as Markdown with frontmatter.
4. Normal startup resolves only the configured location or `.agentic-workspace` default; it does not discover or migrate a superseded directory format. Generic custom locations remain supported without special handling for old names. If an existing literal project folder is named `user:` or lies under literal `~/…`, select it by absolute path rather than reinterpreting it as a selector.
5. Reads, writes, and lock acquisition require their provisioned directories and state; do not lazily recreate them or substitute empty data. An empty required directory is valid; an absent one is not. Optional files follow their own contracts, including [workspace group/view state](workspace-and-board.md#if-wb-004-restore-workspace-state).
6. Support current formats only. Do not automatically or explicitly convert old task/configuration, command, counter, or directory formats through compatibility paths; leave existing user data and migration manifests untouched. User-directed storage relocation remains TASK-008.

**Outcome:** Task data follows the configured storage structure.

**Failures:** Reject invalid locations or locations resolving inside Git metadata. A selector conflicting with an existing literal path requires explicit configuration; leave existing data in place. Missing required resources fail with the affected path; unsupported formats fail without rewriting data.

**Acceptance Criteria:**
- Supported locations, outside-`.git` storage, task `artifacts/` directories, and Markdown-frontmatter `task.md` records are present.
- Startup uses the configured store or `.agentic-workspace` default without old-folder discovery, automatic relocation, or deletion.
- Explicit initialization and new-task creation provide required resources. Later reads, writes, and locks fail on missing required resources without creating parents, empty session state, or replacement directories.
- Current-only format handling does not convert, rename, delete, or reinterpret existing user data; optional-file absence is distinct from required-resource loss.

### TASK-007: Malformed records

**Description:** Malformed task data fails the affected collection load or direct-target operation. Report the affected filename and decoder error; do not skip the record and return a successful partial collection. Decoding and security validation remain required, without automatic repair or corruption-recovery policy.

**Trigger:** A task collection is read or a task record is targeted directly.

**Preconditions:** The collection or target may contain malformed data.

**Behavior:**
1. Decode unknown stored records through the current schema and retain security containment checks.
2. On decoder failure, fail the collection load or direct-target operation with the affected filename and decoder error. CLI reads exit nonzero rather than reporting success with a readable subset.
3. Do not skip malformed records, repair data, scan for recovery, rank duplicate candidates, or select a replacement record.
4. Distinguish a malformed existing record from a missing required root/state resource under TASK-006. Both fail; neither authorizes reconstruction or an empty-success result.

**Outcome:** Invalid stored data is reported as a failed operation and remains unchanged.

**Failures:** Collection loads and direct-target operations fail with filename and decoder error; do not return a successful partial collection or rewrite the data.

**Acceptance Criteria:**
- A collection containing malformed and readable records fails with the malformed filename and decoder error; it does not succeed by omitting that record.
- A direct malformed-target operation fails with the same diagnostic context. CLI failures exit nonzero; no skip-and-warning success, repair, or recovery resolver is used.

### TASK-008: Relocating task storage

**Description:** When the user changes the configured task-data location, the application moves the entire workspace-owned data folder, including existing task data, rather than requiring manual relocation. Provider-owned configuration, data, and state are never moved or otherwise managed. On success, the full workspace-owned folder is at the selected location, which becomes the project's deterministic store, including for linked worktrees.

**Trigger:** The user changes the configured task-data location.

**Preconditions:** An existing task-data folder and a selected new location are available.

**Behavior:**
1. Move the entire workspace-owned data folder, including existing task data; never move or manage provider-owned configuration, data, or state.
2. On success, use the selected location as the deterministic store, including for linked worktrees.

**Outcome:** The full workspace-owned folder is at the selected location on success; provider-owned state remains untouched.

**Failures:** Report completed effects truthfully if a step fails or is interrupted; do not imply rollback.

**Acceptance Criteria:**
- Relocation moves all workspace-owned data; success selects the new store and provider-owned state is untouched.

### TASK-009: Artifact file operations

**Description:** The list-artifacts command lists files in the task's `artifacts/` directory. Generic task-file tools display text/Markdown or binary metadata, read file contents, and write contents supplied from another file or standard input. A write replaces the selected file inside that directory.

**Trigger:** The user lists, displays, reads, or writes an artifact.

**Preconditions:** The task has an `artifacts/` directory; writes receive content from another file or standard input.

**Behavior:**
1. List files in the task's `artifacts/` directory.
2. Display text/Markdown or binary metadata and read file contents.
3. Write supplied contents by replacing the selected file in that directory.

**Outcome:** Artifact operations apply to files within the task's artifacts directory.

**Failures:** A missing required artifact directory fails with its path; do not recreate it or report an empty listing. Path containment follows TASK-021.

**Acceptance Criteria:**
- Artifact listing, display, reading, and writing work as specified; writes replace the selected file. An empty artifact directory lists no files; an absent required directory fails without repair.

### TASK-010: Artifact viewer updates

**Description:** An open artifact viewer reflects externally edited content through change notifications. It does not periodically recheck content and does not guarantee recovery of a missed notification.

**Trigger:** Artifact content is edited externally while its viewer is open.

**Preconditions:** An artifact viewer is open.

**Behavior:**
1. Reflect external edits through change notifications.
2. Do not periodically recheck content.

**Outcome:** Recovery of a missed notification is not guaranteed.

**Failures:** A missed notification is not guaranteed to be recovered.

**Acceptance Criteria:**
- External edits update an open viewer through notifications only; missed notifications are not guaranteed to be recovered.

### TASK-011: Artifact ownership and modes

**Description:** Artifacts are user-managed files with arbitrary names and contents. Modes and approval follow the [mode contract](configuration.md#functional-requirements); artifact file tools operate independently of mode configuration and approval checks.

**Trigger:** The user operates on an artifact.

**Preconditions:** An artifact exists or is supplied by the user.

**Behavior:**
1. Treat artifacts as user-managed arbitrary-name/content files.
2. Follow the mode contract independently of artifact approval checks.

**Outcome:** Artifact tools operate independently of those schemas and checks.

**Failures:** None.

**Acceptance Criteria:**
- Arbitrary artifact names and contents are user-managed; mode behavior is independent of artifact approvals.

### TASK-012: Task worktrees

**Description:** A worktree-per-task setting controls task worktree use. The effective policy is captured on the task at creation and does not change for that task when configuration later changes. When enabled, a worktree is created on the first session launch. Task creation creates the task record without allocating the worktree. If worktree creation fails, retain the task and fail session launch with a path-specific error; a requested worktree failure must not silently redirect execution into the project checkout. Resume preparation with a missing task effective directory fails with a path-specific error.

**Trigger:** A task is created, a session is launched, or a session is resumed.

**Preconditions:** A task has a worktree policy captured at creation. Tasks without a captured policy use the current worktree-per-task setting.

**Behavior:**
1. Capture the effective worktree policy on the task record without allocating a worktree.
2. On first session launch, create or adopt the worktree when the captured policy is enabled; use the project root when it is disabled.
3. On worktree creation failure, retain the task and fail session launch with an error naming the expected path; do not redirect execution to the project checkout.
4. Derive execution directory from the task's captured worktree policy and deterministic worktree location (or project root); fail resume preparation with a path-specific error if that directory is missing. Current global configuration does not override a captured task policy.

**Outcome:** Task creation, launch, and resume use the task's captured worktree policy.

**Failures:** Worktree failure retains the task and fails launch with a path-specific error without redirecting execution; a missing resume directory produces a path-specific error.

**Acceptance Criteria:**
- The task captures its worktree policy at creation; creation does not allocate a worktree; first launch allocates when enabled; failure retains the task and reports the path without redirecting; missing resume paths fail specifically.

### TASK-013: Done and completion

**Description:** Marking a task **Done** sets its independent `done` boolean to true. It preserves configured status, storage location, worktree, and branch and invokes no status-change hook. Cleanup and movement belong to the separate, consolidated archive action in TASK-022.

**Trigger:** The user or calling session marks a task Done.

**Preconditions:** The task exists; a worktree or branch does not prevent marking it Done.

**Behavior:**
1. Set `done` to true through the task edit contract in TASK-025; repeated marking keeps it true.
2. Preserve status, location, sessions, worktree, and branch; do not invoke a status-change hook or perform cleanup.
3. Keep marking Done distinct from explicit archive and destructive deletion. Dependencies do not gate it.

**Outcome:** The task is indicated as done without a status transition or resource cleanup.

**Failures:** Apply TASK-025's persistence and notification failure outcomes without claiming rollback of a durable write.

**Acceptance Criteria:**
- Marking Done sets `done: true` while preserving status, location, sessions, worktree, and branch, with no status-change hook.
- The action is allowed with a branch/worktree and unmet dependencies; it does not archive or delete the task.

### TASK-014: Milestones

**Description:** Milestones support adding, renaming, listing, and archiving, with task-status counts and completion percentages. Tasks store the exact milestone ID; milestone titles are display-only. Renaming preserves task assignments. Removing a milestone clears or reassigns all matching task references, so retained tasks refer only to existing milestones or have no assignment.

**Trigger:** The user adds, renames, lists, archives, or removes a milestone.

**Preconditions:** The project may have tasks assigned to milestones.

**Behavior:**
1. Support adding, renaming, listing, and archiving milestones, with task-status counts and completion percentages.
2. Preserve assignments on rename; clear or reassign all matching references on removal.
3. Require milestone roots provisioned by explicit workspace initialization. Empty roots list no milestones; missing required roots fail without recreation.

**Outcome:** Retained tasks refer only to an existing milestone or have no assignment.

**Failures:** A missing required milestone root is an error, not an empty list; do not recreate it during listing or mutation.

**Acceptance Criteria:**
- Milestone operations and counts/percentages are available; tasks store exact milestone IDs, titles are display-only, rename preserves assignments, and removal clears or reassigns references.
- Empty milestone roots are valid; missing roots fail without repair.

### TASK-015: Destructive task deletion

**Description:** Explicit destructive task deletion requires confirmation naming the task ID and title and stating that deletion cannot be undone. The confirmation does not mention uncommitted work. Deletion kills the task's agent and removes its worktree and branch. It is distinct from Done and task archive; it does not add a force-discard or uncommitted-work option. Provider-owned configuration, data, and state are never modified.

**Trigger:** The user explicitly requests task deletion.

**Preconditions:** The target task is identified and the user confirms destructive deletion.

**Behavior:**
1. Confirm using task ID, title, and irreversible-deletion wording; do not mention uncommitted work.
2. Kill the task agent and remove its worktree and branch.
3. Keep deletion distinct from Done and archive; add no force-discard or uncommitted-work option.
4. Remove workspace-owned task records and resources; leave provider-owned state untouched.

**Outcome:** Confirmed deletion removes the task's agent, worktree, branch, and workspace-owned task records/resources.

**Failures:** Report completed effects truthfully after failed or interrupted deletion.

**Acceptance Criteria:**
- Confirmed deletion names ID/title and irreversibility, kills the task agent, removes worktree and branch, adds no force-discard option, and leaves provider state untouched.

### TASK-016: Agent liveness uncertainty

**Description:** Uncertainty about agent liveness authorizes neither killing an agent nor declaring it stopped. If liveness cannot be established, report unknown/unavailable and leave the agent untouched.

**Trigger:** Agent liveness is checked during archive or deletion.

**Preconditions:** Liveness cannot be established.

**Behavior:**
1. Do not kill the agent or declare it stopped.
2. Report unknown/unavailable and leave the agent untouched.

**Outcome:** The agent remains untouched and its liveness is reported unknown/unavailable.

**Failures:** Report unknown/unavailable and leave the agent untouched.

**Acceptance Criteria:**
- Unknown liveness is reported and never authorizes killing or declaring the agent stopped.

### TASK-017: Cleanup before resource removal

**Description:** When a confirmed destructive operation includes execution cleanup, cleanup precedes removal of its tracking relationships and resources. If cleanup fails, preserve the ownership/tracking evidence needed to locate the execution; direct record deletion or UI teardown cannot substitute for successful cleanup.

**Trigger:** A confirmed destructive operation requires execution cleanup.

**Preconditions:** Execution tracking relationships and resources exist.

**Behavior:**
1. Perform cleanup before removing tracking relationships and resources.
2. On cleanup failure, preserve ownership/tracking evidence; direct record deletion or UI teardown is not a substitute for cleanup.

**Outcome:** Tracking relationships/resources are removed only after successful cleanup.

**Failures:** Preserve ownership/tracking evidence needed to locate the execution.

**Acceptance Criteria:**
- Cleanup precedes tracking/resource removal; failure preserves ownership/tracking evidence and cannot be substituted by record deletion or UI teardown.

### TASK-018: Failed or interrupted operations

**Description:** Task writes and multi-effect lifecycle operations are not transactions. If an edit, archive, deletion, relocation, or notification step fails or is interrupted, report durable effects and incomplete work truthfully. Notification failure does not undo persistence or skip required cleanup. If workspace or group cleanup fails after task removal or archival, display an incomplete-cleanup message.

**Trigger:** A task write, lifecycle effect, or notification fails or is interrupted.

**Preconditions:** A task operation may have durable effects and remaining cleanup.

**Behavior:**
1. Report completed effects truthfully; do not imply rollback.
2. Failed writes publish no success. Post-save notification failures leave durable effects intact; continue required cleanup and report the notification and cleanup failures.
3. Display an incomplete-cleanup message if workspace/group cleanup fails after deletion or archival. Preserve TASK-017's tracking evidence when execution cleanup fails.

**Outcome:** The user sees truthful completed effects and any incomplete-cleanup message.

**Failures:** Report completed effects, the primary error, and any notification/cleanup errors; do not imply rollback or complete cleanup when effects are partial.

**Acceptance Criteria:**
- Failed/interrupted operations report completed effects truthfully; failed writes publish no success, and notification failure neither undoes persistence nor prevents required cleanup.
- Cleanup failure after deletion or archive is shown as incomplete cleanup; execution tracking survives failed execution cleanup.

### TASK-019: Deletion teardown

**Description:** Task-deletion teardown follows the [session input lifetime](sessions.md#session-019-settle-terminal-input-on-close-or-deletion) rule for already in-flight input. For multiple native cleanup targets, apply [native cleanup preflight](sessions.md#session-015-validate-batch-cleanup) before any stop effects.

**Trigger:** Task-deletion teardown begins.

**Preconditions:** In-flight session input or multiple native cleanup targets may exist.

**Behavior:**
1. Follow the session input lifetime rule; preflight multiple native cleanup targets before any stop effects.

**Outcome:** Teardown respects in-flight input and native cleanup preflight.

**Failures:** None.

**Acceptance Criteria:**
- Deletion teardown respects in-flight input lifetime and preflights all native cleanup targets before stop effects.

### TASK-020: CLI task operations

**Description:** Tasks can be listed and viewed through the CLI. `--max-count` and `--skip` accept zero and negative values, with negative values clamped to zero; `--limit` behavior is unchanged. The CLI supports editing an existing task by replacing its title and description.

**Trigger:** The user lists, views, or edits a task through the CLI.

**Preconditions:** Tasks are available to the CLI.

**Behavior:**
1. List and view tasks.
2. For list paging, allow zero and negative `--max-count` and `--skip` values and clamp negative values to zero; leave `--limit` behavior unchanged.
3. Edit an existing task by replacing its title and description.

**Outcome:** The CLI presents task listings and views and supports title/description replacement.

**Failures:** None.

**Acceptance Criteria:**
- CLI users can list and view tasks, with negative `--max-count` and `--skip` values clamped to zero and unchanged `--limit` behavior, and replace an existing task's title and description.

### TASK-021: Artifact path containment

**Description:** Artifact paths resolve inside the task's `artifacts/` directory; paths that escape it, including through symlinks, are rejected.

**Trigger:** An artifact file operation resolves a path.

**Preconditions:** The task has an `artifacts/` directory.

**Behavior:**
1. Resolve paths inside the task's `artifacts/` directory and reject paths that escape it, including through symlinks.

**Outcome:** Artifact operations remain within that directory.

**Failures:** Reject escaping paths, including through symlinks.

**Acceptance Criteria:**
- Artifact paths outside the task's `artifacts/` directory, including through symlinks, are rejected.

### TASK-022: Archive and cleanup

**Description:** Archive is the single explicit cleanup-and-retention operation. It performs session cleanup, removes the task worktree and branch, moves the task container to archive storage, and cleans vacated-task references. It has no status or `done` eligibility gate and does not change either value. Existing completed records remain readable in place and are not automatically relocated.

**Trigger:** The user archives a task.

**Preconditions:** The task exists and the required execution identity and cleanup safety checks can be satisfied. Marking Done or separately stopping sessions is not a prerequisite.

**Behavior:**
1. Accept the archive action regardless of status or `done`; preserve both values.
2. Perform session cleanup under TASK-016/017 and [native cleanup preflight](sessions.md#session-015-validate-batch-cleanup), then remove the worktree and branch. Preserve tracking evidence on failed or uncertain execution cleanup.
3. Move the task container to archive storage and clean vacated-task references. Retain the archived record, artifacts, session history, and its dependency links; leave provider-owned state untouched.
4. Report the move and cleanup effects independently under TASK-018; notification failures cannot skip required reference cleanup.
5. Provide no separate completion/cleanup operation. Loading existing completed records neither moves them nor infers `done` from their location.

**Outcome:** The task is archived with retained content/history, its executions cleaned up, worktree and branch removed, and vacated-task references cleaned up.

**Failures:** Do not report successful movement unless the container moved. Report partial cleanup or notification failure without undoing durable effects; preserve execution tracking on cleanup failure. Do not overwrite an existing destination.

**Acceptance Criteria:**
- Tasks with either `done` value and any configured status can be archived; neither value changes and no separate stop action is required.
- Archive performs safe session cleanup, removes worktree and branch, moves the container without overwriting a destination, and cleans vacated-task references while retaining archived content/history and dependency links.
- Cleanup uncertainty preserves tracking; failures report completed effects and incomplete work. Notification failure does not skip required cleanup.
- Existing completed records remain readable in place; ordinary loading performs no relocation or completion inference.

### TASK-023: Explicit task and configuration migration

**Retired:** No task/configuration migration operation is supported. [TASK-006](#task-006-task-storage-format) owns current-only formats and preservation of existing data; [CONFIG-008](configuration.md#config-008-agent-settings), [CONFIG-015](configuration.md#config-015-priority-labels), and [CONFIG-016](configuration.md#config-016-date-format-tokens) own current configuration formats. This reserved requirement ID creates no compatibility or data-rewrite obligation.

### TASK-024: Due-date interpretation

**Description:** Due dates are strictly validated using native Temporal parsing. A timestamp's due day is the calendar day written in the input; an explicit offset does not move that day. Standard offsets accepted by Temporal, including offsets beyond ±14 hours, are accepted. Date parsing and timestamp display follow [ADR-0010](../adr/0010-temporal-due-dates-luxon-display.md).

**Trigger:** A due date is supplied or displayed.

**Preconditions:** The due-date input is available.

**Behavior:**
1. Strictly validate date-only values and timestamps using native Temporal parsing; accept only forms supported by Temporal, without adding a parallel shape or offset-range grammar.
2. Preserve the timestamp's written calendar day as its due date; do not convert the due day by applying its offset.
3. Reject malformed or invalid calendar dates through Temporal parsing; do not add a separate date-shape or offset-range grammar.
4. Preserve existing UTC timestamp display semantics. A date-only configured display pattern uses Luxon; timestamp time is appended separately as fixed `HH:mm`.

**Outcome:** Due dates retain the written calendar day and invalid date/time input is rejected.

**Failures:** Invalid Temporal date/time input is rejected without changing the stored value.

**Acceptance Criteria:**
- Date-only and timestamp inputs are strictly validated by native Temporal parsing, without a parallel shape or offset-range grammar.
- Standard Temporal-supported offsets, including `+15:00`, are accepted; offset magnitude is not restricted by an app-specific ±14-hour cutoff.
- An explicit offset never changes the due day derived from the timestamp's written date.
- Timestamp display retains the approved UTC semantics; configured date formatting is date-only Luxon formatting with separately appended fixed `HH:mm`.

### TASK-025: Complete-record updates and edits

**Description:** Internal task writes distinguish persistence-only `update(task)` from an intentional `edit(task)`. Both accept the complete supplied task and derive its ID from that record. [Controller](../blueprints/controller.md#update-task) owns task-write coordination through TasksService; [Storage](../blueprints/storage.md) remains the persistence boundary, and the [Task model](../blueprints/task.md) owns domain transformations.

**Trigger:** An operation persists a task record or intentionally edits it.

**Preconditions:** The caller holds the task operation lock, uses the fresh full task supplied by that lock, applies the accepted change, and persists before releasing the same lock. The lock boundary owns missing-task failure. The persistence call does not acquire that operation lock again.

**Behavior:**
1. `update(task)` persists the complete supplied record without advancing its timestamp, invoking hooks, or publishing an event. It does not merge a partial patch, reconstruct missing fields, or accept separate ID, previous-status, or approval-control arguments.
2. `edit(task)` calls `update(task)`, then advances `updatedDate`/`updated_date` to the current UTC minute and calls `update(task)` again. These two saves are intentional. After the second save succeeds, invoke the status hook only if status actually changed from the locked current record, then publish the task update event. JSON exposes the timestamp as `updatedAt`.
3. Keep task-write policy, hooks, lifecycle outcomes, and publication with TasksService, including board/status and reference-cleanup task writes. Session-only changes use the session persistence contract, not a task edit.
4. Approval changes transform the locked current task through the Task domain model and pass the resulting full record to `edit`; no persistence override flag or special approval-save path is used.
5. Report failures under TASK-018. A failed first save produces no success hook/event. A failed second save leaves the first durable record in place, without a status hook or edit event. A post-save hook or notification failure does not undo durable effects or skip required cleanup.

**Outcome:** Persistence-only updates retain the supplied timestamp. Successful edits durably save the supplied record and its UTC-minute edit timestamp before hooks and event publication.

**Failures:** Neither the two saves nor later notifications/cleanup form a transaction. Report which save and effects completed; callers must not infer rollback or automatic conflict safety from the full-record signature alone.

**Acceptance Criteria:**
- `update` preserves the supplied full record and timestamp with no hook/event; it accepts no partial-merge, previous-status, or approval-control input.
- `edit` orders two saves, timestamp advancement between them, an actual-change-only status hook, and then the update event. Unchanged status invokes no status hook.
- First-save failure publishes no success; second-save failure retains the first record and publishes no edit event. Notification failure retains durable effects and cannot suppress required cleanup.
- Callers derive the full replacement from fresh state under the same task lock and persist before release; approval uses the domain transform and ordinary full-record edit.

## States and Transitions

### Task lifecycle

**States:**

| State | Meaning |
|---|---|
| Configured status | Exact configured status label, independent of completion and storage location. |
| Done indication | Independent boolean `done`; absent reads as false without a write. |
| Active location | Task container is in active storage, regardless of status or `done`. |
| Completed location | Existing retained records remain readable here; no operation automatically moves or migrates them. |
| Archived location | Explicit archive retains the task container/content after session cleanup and worktree/branch removal. |
| Deleted | Confirmed destructive deletion removes the task's agent, worktree, and branch. |

**Transitions:**

| From | Trigger | To | Required Behavior |
|---|---|---|---|
| Existing task | Mark Done | `done: true` | Preserve status, location, sessions, worktree, and branch; invoke no status hook. |
| Existing task | Edit configured status | New status | Preserve `done` and location; follow TASK-025's actual-change hook and event ordering. |
| Existing task, any status or `done` | Archive | Archived location | Perform safe session cleanup, remove worktree and branch, move container, and clean vacated-task references; preserve status and `done`. |
| Completed location | Load | Same location | Read without moving the record or inferring completion from its directory. |
| Existing task | Confirmed destructive deletion | Deleted | Kill the task's agent and remove its worktree and branch after required cleanup. |

**Invariants:**
- `done`, status, and storage location are distinct. Done preserves worktree and branch; archive performs cleanup without a status/done eligibility gate.
- Dependencies remain informational and survive completion; they do not automatically gate launch or completion.
- Archived task IDs remain reserved and are not reused.
- Assignees are not supported task fields or create/update inputs; existing data is not rewritten to remove them.
- Priority is stored and displayed as one configured label.
- Provider-owned configuration, data, and state are never managed or modified.
- When confirmed destructive execution cleanup is required, cleanup precedes tracking/resource removal; failure evidence and truthful reporting are preserved.

### Task data

**States:**

| State | Meaning |
|---|---|
| Configured store | Task data resides at the project's single deterministic configured location. |
| Relocating | The complete workspace-owned data folder is being moved to a selected location. |

**Transitions:**

| From | Trigger | To | Required Behavior |
|---|---|---|---|
| Existing configured store | Successful relocation | Selected configured store | The selected location becomes the project's deterministic store. |

**Invariants:**
- A project's loaded task collection comes from one deterministic store, shared by linked worktrees, and changes through per-record events, not read-time full rebuilds or branch/working-copy scans.
- IDs and references use exact strings with numeric spelling preserved; there is no read-time alias or duplicate/corruption resolver.
- Decoder failures fail the affected load or operation with filename/error context; collection success never depends on skipping malformed records.
- Explicit initialization and task creation provision required resources. Missing required state fails without repair; optional-file absence follows its owning contract.
- Complete-record updates and edits follow TASK-025; timestamps, hooks, and publication are not implicit Storage behavior.
- Task data is outside `.git`; provider-owned configuration, data, and state remain untouched.

### Milestone

**States:**

| State | Meaning |
|---|---|
| Existing | A milestone may be added, renamed, listed, archived, or removed. |
| Removed | All matching task references have been cleared or reassigned. |

**Transitions:**

| From | Trigger | To | Required Behavior |
|---|---|---|---|
| Existing | Removal | Removed | Clear or reassign all matching task references. |

**Invariants:**
- Retained tasks refer only to existing milestones or have no assignment.
- Tasks store exact milestone IDs; titles are display-only and are not accepted as assignment aliases.

## User Interactions

### Manage tasks, work context, and artifacts

**Context:** The user is working in a project and managing its tasks or artifacts.

**Action:** Create, view, edit, launch, mark Done, archive, or delete tasks; manage milestones; or list, read, display, and write task artifacts.

**Response:** Apply the requested operation using configured task status and storage; show task listings, views, operation results, warnings, and actionable errors.

**Feedback:** Fail session launch with a path-specific error when worktree creation fails, require confirmation naming the task ID and title and stating that deletion cannot be undone for destructive deletion, and distinguish the Done indication from explicit archive/cleanup.

## External Behavior

### CLI and workspace operations

**Purpose:** Let users manage tasks, work context, and task artifacts.

**Inputs:** User task actions and artifact paths/content; task status values from project configuration.

**Outputs:** Task listings and views, operation results, warnings, and actionable errors as specified in this contract.

**Failures:** Generic error handling follows [the error-handling contract](../CONVENTIONS.md#error-handling); each requirement states only its feature-specific failure consequence.

## Non-Functional Requirements

### Performance

- None.

### Reliability

- Report decoder failures for collection and direct-target reads without skipping malformed records, rewriting data, or reporting partial collections as successful.
- Preserve the task when worktree creation fails; preserve execution ownership/tracking evidence when required cleanup fails.
- Report durable effects and incomplete work truthfully after failed edits, archive, deletion, relocation, or notification; do not imply rollback or skip required cleanup after notification failure.
- Keep atomic persistence and locking under Storage; do not treat multiple writes or cleanup effects as a transaction.

### Security

- Keep artifact operations within the task's `artifacts/` directory, rejecting paths that escape it, including through symlinks.
- Do not manage or modify provider-owned configuration, data, or state.

### Compatibility

- Current formats only; no automatic or compatibility migration. Existing user data remains untouched, and existing completed records remain readable in place.

## Edge Cases

| Condition | Required Behavior |
|---|---|
| A task identity is already in use, or an archived identity is requested again | Do not allocate or reuse that identity. Do not merge or repair duplicate records. |
| A lookup uses different casing or numeric spelling | Match only the exact stored ID; no case-folding, numeric normalization, or alias lookup. |
| A create target already exists | Preserve it; consume the allocated number and continue create-only allocation under the lock. |
| Required counter state is missing, malformed, or obsolete | Fail without scanning branches/working copies, conversion, or reconstruction. |
| A collection contains malformed records | Fail the load with the affected filename and decoder error; do not skip records or report a successful partial collection. |
| A direct action targets a malformed record | Fail with the affected filename and decoder error; CLI failure exits nonzero without rewriting data. |
| A required workspace root, artifact/milestone root, or task session resource is missing | Fail with the affected path; do not recreate it or return an empty collection/state. |
| A task record omits `done` | Read false without inferring from status/location or rewriting the record. |
| The first save of `edit` fails | Do not advance the durable timestamp or publish a success hook/event. |
| The second save of `edit` fails | Retain the first saved record; publish no status hook or edit event and report the partial effect. |
| A post-save notification fails | Keep durable effects, continue required cleanup, and report failures truthfully. |
| A requested worktree cannot be created | Retain the task, fail session launch with a path-specific error, and do not redirect execution into the project checkout. |
| The task effective resume directory is missing | Fail resume preparation with a path-specific error; do not recreate or fall back to another directory. |
| An artifact path escapes the task's `artifacts/` directory, including through a symlink | Reject the path. |
| An artifact change notification is missed | No periodic recheck or recovery of the missed notification is guaranteed. |
| A task is marked Done | Set `done: true`; preserve status, location, worktree, and branch; invoke no status-change hook. |
| Agent liveness cannot be established during archive or deletion | Report unknown/unavailable and leave the agent untouched; uncertainty does not authorize a kill or stopped status. |
| Required execution cleanup fails before tracking/resource removal | Preserve ownership/tracking evidence; direct record deletion or UI teardown cannot substitute for successful cleanup. |
| Multiple native cleanup targets are involved | Apply native cleanup preflight before any stop effects. |
| A task archive, deletion, or relocation step fails or is interrupted | Report completed effects truthfully; do not imply rollback. |
| Workspace/group cleanup fails after task deletion or archive succeeds | Display an incomplete-cleanup message. |
| A task is archived with either `done` value or any configured status | Perform safe session/worktree/branch cleanup, move to archive, and clean vacated references; retain archived content/history and preserve status and `done`. |
| An existing completed record is loaded | Read it in place without migration or deriving `done` from its location. |
| Archiving fails or is cancelled | Do not report successful archival unless the task container was moved. |

## Open Questions

None.
