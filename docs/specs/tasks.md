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
| User | Creates, views, edits, launches, completes, archives, deletes, and manages tasks and artifacts. |
| Workspace | Stores and presents tasks, performs task lifecycle operations, and reports their outcomes. |
| Provider | Supplies provider-owned configuration, data, and state, which the workspace does not manage. |

## Functional Requirements

### TASK-001: Task scope and fields

**Description:** A task is a unit of work scoped to a project directory, whether or not that directory uses Git. Its editable business fields are title, description, type, priority, milestone, and labels; each may be optional, and none is made mandatory by this list. Priority stores and displays one configured label.

**Trigger:** A task is created or edited.

**Preconditions:** A project directory is selected.

**Behavior:**
1. Scope each task to its project directory, whether or not it uses Git.
2. Allow each listed editable business field to be optional.

**Outcome:** No listed field is made mandatory.

**Failures:** None.

**Acceptance Criteria:**
- A task is scoped to a project directory with or without Git; each listed field may be absent. Priority is the exact configured label, with no separate comparison value.

### TASK-002: Creation and status configuration

**Description:** Task statuses come from project configuration and use the exact configured labels; status matching does not ignore whitespace or otherwise resolve spelling variants. Existing stored statuses are not rewritten by status matching. The CLI directs users to edit the configured status list in the configuration file. Creation produces a task directly, allocates its ID under a creation lock using the persisted task counter, and saves the new record without overwriting an existing target. Subsequent task actions operate on that task identity. The application does not provide draft promotion or demotion.

**Trigger:** A task is created or its status is used.

**Preconditions:** Project status configuration is available.

**Behavior:**
1. Use exact configured status labels and direct CLI users to edit the configured list in the configuration file; do not match whitespace-insensitive spelling variants or rewrite stored status values.
2. Create and save a task directly, allocating its ID under the creation lock and persisted-counter procedure in TASK-003.
3. Use that task identity for subsequent actions; do not provide draft promotion or demotion.

**Outcome:** The task is saved directly with an allocated identity.

**Failures:** None.

**Acceptance Criteria:**
- Status values match exact configured labels without whitespace-insensitive lookup or rewriting stored values; direct creation under a creation lock and no draft promotion or demotion are observed.

### TASK-003: Task identity

**Description:** Task IDs use `PREFIX-NUMBER` with optional dotted numeric subtask segments (for example, `TASK-1.2`). Input may use lowercase; the outer API boundary uppercases the complete ID for lookup and new IDs are written in uppercase, while existing records may retain their stored casing. Identity comparison is case-insensitive; this is a comparison rule, not an alias, numeric-normalization, or prefix-inference layer. Numeric segments are preserved exactly, so `TASK-01` and `TASK-1` are distinct. Alphanumeric IDs are invalid. Lookup does not accept a bare number or infer a prefix. Allocation uses a persisted counter, not a scan for the next available ID except to bootstrap a missing prefix entry. Creation must not allocate an identity already in use. Duplicate records are not merged or repaired. Archived task IDs remain reserved and are not reused.

**Trigger:** A task is created or addressed by ID.

**Preconditions:** An ID is being allocated or resolved.

**Behavior:**
1. Accept `PREFIX-NUMBER` with optional dotted numeric subtask segments. Uppercase the complete input ID at the outer API boundary for lookup, write new IDs in uppercase, and compare IDs case-insensitively. Preserve every numeric segment exactly, including leading zeroes; stored casing does not change identity.
2. Reject alphanumeric IDs. Do not normalize numeric segments, look up bare numbers, infer prefixes, or scan task records for allocation after bootstrap.
3. Persist `task-counter.json` in the directory that owns the create lock (shared across linked worktrees; otherwise the AgenticWorkspace directory). Its per-prefix shape is `{ "TASK": { "next": 2 }, "OPS": { "next": 2 } }`; each `next` is the next unused top-level number for that prefix. Under the create lock, allocate that number, increment `next`, and atomically persist the counter using a temporary file and rename before attempting a create-only save for the resulting ID. If the target container already exists, consume another number and retry. Existing counter values retain their meaning and are not reinterpreted. Never decrement or reuse a number.
4. If a prefix entry is missing, bootstrap it once from the maximum existing top-level task number for that prefix across active, completed, and archived task containers, including sibling worktrees as needed (use zero if none exist), and persist it. There is no per-create scan. A corrupt counter is an error; do not scan as a fallback. Never bypass the create lock.
5. Do not reuse allocated or archived IDs, and do not merge or repair duplicate records.
6. Report record identity collisions with both record paths and fail closed rather than guessing; reject ambiguous task IDs.

**Outcome:** Task IDs remain distinct and unambiguous.

**Failures:** Collisions fail closed with both record paths; ambiguous IDs are rejected.

**Acceptance Criteria:**
- New IDs are uppercase and existing stored casing is preserved; comparisons ignore case. `TASK-01` and `TASK-1` remain distinct; numeric segments are never stripped or padded.
- Allocation uses the per-prefix next-unused number in `task-counter.json` under the create lock, atomically persists increments before create-only save, and consumes another number on target-container conflict. Existing counter values are not reinterpreted. A missing prefix entry is bootstrapped once from the maximum existing top-level number across active, completed, and archived tasks (including sibling worktrees as needed); allocation does not scan per create. Corrupt counters fail without scanning.
- Lookup does not normalize numeric segments, accept bare numbers, or infer prefixes; archived IDs are not reused and identity collisions fail closed.

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

**Description:** Each project has one deterministic configured task-data location. A linked worktree uses the main project's task store. Loading reads that store as the project's task collection; the application does not discover task records across branches.

**Trigger:** The application loads a project's task collection.

**Preconditions:** A project task-data location is configured.

**Behavior:**
1. Read the project's one deterministic store; linked worktrees use the main project's store.
2. Do not discover task records across branches.

**Outcome:** The task collection is loaded from the configured store.

**Failures:** None.

**Acceptance Criteria:**
- Project loading uses its deterministic store, including from linked worktrees, without branch discovery.

### TASK-006: Task storage format

**Description:** Project configuration selects one task-data location: the project's `.agentic-workspace` directory (default), the application's user-level data location, or a user-selected path. The task data folder is outside `.git`; each task has an `artifacts/` directory within its task folder. Task records are stored in each task container as `task.md`, serialized as Markdown with frontmatter.

**Trigger:** Task data is stored or loaded.

**Preconditions:** A task-data location is selected in project configuration.

**Behavior:**
1. Support the default project `.agentic-workspace`, application user-level location, or a user-selected path.
2. Keep the task data folder outside `.git`; give each task an `artifacts/` directory.
3. Store each task as `task.md` in its container, serialized as Markdown with frontmatter.

**Outcome:** Task data follows the configured storage structure.

**Failures:** None.

**Acceptance Criteria:**
- Supported locations, outside-`.git` storage, task `artifacts/` directories, and Markdown-frontmatter `task.md` records are present.

### TASK-007: Malformed records

**Description:** The application does not automatically repair corrupted records. Collection reads skip malformed records and warn with the affected filename and parse error while preserving readable results. A direct action on a malformed target fails with a helpful error. Bulk collection reads that skip malformed records allow the command to exit 0; explicit single-record loads remain strict.

**Trigger:** A task collection is read or a task record is targeted directly.

**Preconditions:** The collection or target may contain malformed data.

**Behavior:**
1. Skip malformed records in collection reads and warn with filename and parse error while retaining readable results.
2. Do not automatically repair corrupted or duplicate records.
3. Let bulk collection reads exit 0 when skipping malformed records; keep explicit single-record loads strict.

**Outcome:** Direct actions on malformed targets fail with a helpful error.

**Failures:** Direct actions on malformed targets fail with a helpful error.

**Acceptance Criteria:**
- Collection reads preserve readable results with warnings; direct malformed-target actions fail helpfully, bulk reads exit 0, and single-record loads remain strict.

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

**Failures:** None.

**Acceptance Criteria:**
- Artifact listing, display, reading, and writing work as specified; writes replace the selected file.

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

**Description:** A worktree-per-task setting controls task worktree use. The effective policy is captured on the task at creation and does not change for that task when configuration later changes. When enabled, a worktree is created on the first session launch. Task creation creates the task record without allocating the worktree. If worktree creation fails, retain the task and fail session launch with a path-specific error; a requested worktree failure must not silently redirect execution into the project checkout. Resume preparation with a missing recorded working directory fails with a path-specific error.

**Trigger:** A task is created, a session is launched, or a session is resumed.

**Preconditions:** A task has a worktree policy captured at creation. Tasks without a captured policy use the current worktree-per-task setting.

**Behavior:**
1. Capture the effective worktree policy on the task record without allocating a worktree.
2. On first session launch, create or adopt the worktree when the captured policy is enabled; use the project root when it is disabled.
3. On worktree creation failure, retain the task and fail session launch with an error naming the expected path; do not redirect execution to the project checkout.
4. Fail resume preparation with a path-specific error if the recorded working directory is missing.

**Outcome:** Task creation, launch, and resume use the task's captured worktree policy.

**Failures:** Worktree failure retains the task and fails launch with a path-specific error without redirecting execution; a missing resume directory produces a path-specific error.

**Acceptance Criteria:**
- The task captures its worktree policy at creation; creation does not allocate a worktree; first launch allocates when enabled; failure retains the task and reports the path without redirecting; missing resume paths fail specifically.

### TASK-013: Done and completion

**Description:** Marking a task **Done** changes only its status and retains its worktree. Completion/cleanup is a separate explicit operation that moves the task to completed storage, performs session cleanup, and removes the worktree and task branch, without touching provider-owned configuration, data, or state. The TUI exposes completion/cleanup through a keybinding distinct from status-only Done.

**Trigger:** The user marks a task Done or explicitly invokes completion/cleanup.

**Preconditions:** The task exists; cleanup behavior requires an explicit completion/cleanup operation.

**Behavior:**
1. Marking Done changes only status and retains the worktree.
2. Explicit completion/cleanup moves the task to completed storage, performs session cleanup, and removes its worktree and branch.
3. Leave provider-owned state untouched; expose cleanup through a TUI keybinding distinct from Done.

**Outcome:** Status-only Done and explicit completion/cleanup are separate operations.

**Failures:** None.

**Acceptance Criteria:**
- Done retains the worktree and changes only status; explicit cleanup moves to completed storage, cleans sessions, and removes worktree and branch via a distinct keybinding.

### TASK-014: Milestones

**Description:** Milestones support adding, renaming, listing, and archiving, with task-status counts and completion percentages. Tasks store the exact milestone ID; milestone titles are display-only. Renaming preserves task assignments. Removing a milestone clears or reassigns all matching task references, so retained tasks refer only to existing milestones or have no assignment.

**Trigger:** The user adds, renames, lists, archives, or removes a milestone.

**Preconditions:** The project may have tasks assigned to milestones.

**Behavior:**
1. Support adding, renaming, listing, and archiving milestones, with task-status counts and completion percentages.
2. Preserve assignments on rename; clear or reassign all matching references on removal.

**Outcome:** Retained tasks refer only to an existing milestone or have no assignment.

**Failures:** None.

**Acceptance Criteria:**
- Milestone operations and counts/percentages are available; tasks store exact milestone IDs, titles are display-only, rename preserves assignments, and removal clears or reassigns references.

### TASK-015: Destructive task deletion

**Description:** Explicit destructive task deletion requires confirmation naming the task ID and title and stating that deletion cannot be undone. The confirmation does not mention uncommitted work. Deletion kills the task's agent and removes its worktree and branch. It is distinct from Done, completion/cleanup, and task archive; it does not add a force-discard or uncommitted-work option. Provider-owned configuration, data, and state are never modified.

**Trigger:** The user explicitly requests task deletion.

**Preconditions:** The target task is identified and the user confirms destructive deletion.

**Behavior:**
1. Confirm using task ID, title, and irreversible-deletion wording; do not mention uncommitted work.
2. Kill the task agent and remove its worktree and branch.
3. Keep deletion distinct from Done, completion/cleanup, and archive; add no force-discard or uncommitted-work option.
4. Remove workspace-owned task records and resources; leave provider-owned state untouched.

**Outcome:** Confirmed deletion removes the task's agent, worktree, branch, and workspace-owned task records/resources.

**Failures:** Report completed effects truthfully after failed or interrupted deletion.

**Acceptance Criteria:**
- Confirmed deletion names ID/title and irreversibility, kills the task agent, removes worktree and branch, adds no force-discard option, and leaves provider state untouched.

### TASK-016: Agent liveness uncertainty

**Description:** Uncertainty about agent liveness authorizes neither killing an agent nor declaring it stopped. If liveness cannot be established, report unknown/unavailable and leave the agent untouched.

**Trigger:** Agent liveness is checked during deletion.

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

**Description:** If any task deletion or relocation step fails or is interrupted, report completed effects truthfully; do not imply rollback. If workspace or group cleanup fails after task deletion succeeds, display an incomplete-cleanup message.

**Trigger:** A deletion or relocation step fails/is interrupted, or workspace/group cleanup fails after successful task deletion.

**Preconditions:** A deletion, relocation, or related cleanup operation is underway.

**Behavior:**
1. Report completed effects truthfully; do not imply rollback.
2. Display an incomplete-cleanup message if workspace/group cleanup fails after task deletion.

**Outcome:** The user sees truthful completed effects and any incomplete-cleanup message.

**Failures:** Report completed effects truthfully; display an incomplete-cleanup message if workspace/group cleanup fails after task deletion succeeds.

**Acceptance Criteria:**
- Failed/interrupted operations report completed effects truthfully; cleanup failure after deletion is shown as incomplete cleanup.

### TASK-019: Deletion teardown

**Description:** Task-deletion teardown follows the [session input lifetime](sessions.md#session-017-display-the-live-terminal) rule for already in-flight input. For multiple native cleanup targets, apply [native cleanup preflight](sessions.md#session-013-stop-while-retaining-identity) before any stop effects.

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

### TASK-022: Archiving an unfinished task

**Description:** Archiving an unfinished task moves its task container to archive storage and invokes vacated-task reference cleanup while preserving artifacts, session history, dependencies, worktree, and branch. Terminal-status tasks cannot be archived. Running sessions must be stopped explicitly before archive; completed work uses completion/cleanup instead.

**Trigger:** The user archives a task.

**Preconditions:** The task is unfinished, and any running sessions have been stopped explicitly.

**Behavior:**
1. Reject archive for a terminal-status task.
2. For an unfinished task, move its task container to archive storage and invoke vacated-task reference cleanup.
3. Preserve artifacts, session history, dependencies, worktree, and branch.
4. Use explicit completion/cleanup rather than archive for completed work.

**Outcome:** An eligible unfinished task is archived with its retained resources intact and vacated-task references cleaned up.

**Failures:** Do not report successful archival unless the task container was moved; report failed or cancelled archival using the generic error-handling contract in External Behavior.

**Acceptance Criteria:**
- An unfinished task with its running sessions stopped is moved to archive storage, vacated-task reference cleanup is invoked, and its artifacts, session history, dependencies, worktree, and branch are retained.
- A terminal-status task is refused archive; running sessions must be stopped explicitly, and completed work uses completion/cleanup instead.
- If archive fails or is cancelled, the operation does not report successful archival unless the task container was moved.

### TASK-023: Explicit task and configuration migration

**Description:** Assignees are not a task field or supported feature. The explicit task/config migration removes task-record assignee and migrates task-record priority values; in root and resolved project configuration it migrates only `default_assignee` and `date_format` as specified by [CONFIG-015](configuration.md#config-015-priority-labels) and [CONFIG-016](configuration.md#config-016-date-format-tokens). Custom task frontmatter named `date_format` or `default_assignee` is preserved unchanged, as are task bodies, other unknown/custom frontmatter, approvals, artifacts, and timestamps. Ordinary loading never rewrites records.

**Trigger:** The explicit task/config migration is run with `bun scripts/migrate-task-config.ts <project target>`.

**Preconditions:** The migration is invoked for a project target. Its bounded scope is the `default_assignee` and `date_format` keys in root and resolved project configuration, plus assignee and priority fields in task records in active, completed, and archived task directories. It does not migrate custom task frontmatter with matching configuration-key names.

**Behavior:**
1. Remove assignee frontmatter and migrate priority values in each migrated task record.
2. Preserve task bodies and custom task frontmatter, including `date_format` and `default_assignee`, as well as approvals, artifacts, and timestamps.
3. Migrate only root/project `default_assignee` and `date_format` values under CONFIG-015 and CONFIG-016; report values that cannot be migrated and leave them unchanged.
4. An invocation with no migration work writes no manifest and creates no state root or manifest directory. For a nonempty invocation, write the manifest before record rewrites, report partial completion truthfully, and use source/target hashes for exactly-once handling.
5. Report files or values that cannot be matched or migrated; do not rewrite them speculatively.
6. Do not perform task/config migration or rewriting during ordinary load.

**Outcome:** The bounded task/config migration completes or reports partial completion; matched records no longer contain assignee data, and unrelated and unrecognized content is preserved.

**Failures:** Report unmatched files/values and partial completion; leave unresolved content untouched.

**Acceptance Criteria:**
- `bun scripts/migrate-task-config.ts <project target>` migrates only `default_assignee` and `date_format` in root/resolved project configuration, and assignee/priority fields in active/completed/archived task records; custom task frontmatter with matching key names is preserved. Its no-op, manifest, exactly-once, and partial-completion behavior is as specified above; ordinary load does not rewrite records.

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

## States and Transitions

### Task lifecycle

**States:**

| State | Meaning |
|---|---|
| Configured status | Statuses come from project configuration; marking Done changes only status. |
| Unfinished | A task has not undergone explicit completion/cleanup; eligible tasks may be archived. |
| Completed | Explicit completion/cleanup moves the task to completed storage, performs session cleanup, and removes its worktree and branch. |
| Archived | An unfinished task's container is in archive storage; artifacts, session history, dependencies, worktree, and branch are retained. |
| Deleted | Confirmed destructive deletion removes the task's agent, worktree, and branch. |

**Transitions:**

| From | Trigger | To | Required Behavior |
|---|---|---|---|
| Configured status | Mark Done | Configured status | Change only status; retain the worktree. |
| Unfinished | Explicit completion/cleanup | Completed | Move to completed storage, perform session cleanup, and remove worktree and branch. |
| Unfinished | Archive after running sessions are explicitly stopped | Archived | Move the task container to archive storage and clean up vacated-task references; preserve artifacts, session history, dependencies, worktree, and branch. |
| Terminal status | Archive | Unchanged | Reject the archive. |
| Existing task | Confirmed destructive deletion | Deleted | Kill the task's agent and remove its worktree and branch after required cleanup. |

**Invariants:**
- Status-only Done retains the worktree; explicit completion/cleanup removes the worktree and branch.
- Dependencies remain informational and survive completion; they do not automatically gate launch or completion.
- Archived task IDs remain reserved and are not reused.
- Assignees are absent from task records and all create/update interfaces; removal uses TASK-023 and is never an ordinary-load side effect.
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
- A project's task collection comes from one deterministic store, shared by its linked worktrees, not from branch discovery.
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

**Action:** Create, view, edit, launch, complete, archive, or delete tasks; manage milestones; or list, read, display, and write task artifacts.

**Response:** Apply the requested operation using configured task status and storage; show task listings, views, operation results, warnings, and actionable errors.

**Feedback:** Fail session launch with a path-specific error when worktree creation fails, require confirmation naming the task ID and title and stating that deletion cannot be undone for destructive deletion, and distinguish status-only Done from explicit completion/cleanup.

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

- Preserve readable task records when collection reads encounter malformed records.
- Preserve the task when worktree creation fails; preserve execution ownership/tracking evidence when required cleanup fails.
- Report completed effects truthfully after failed or interrupted deletion and relocation; do not imply rollback.

### Security

- Keep artifact operations within the task's `artifacts/` directory, rejecting paths that escape it, including through symlinks.
- Do not manage or modify provider-owned configuration, data, or state.

### Compatibility

- None.

## Edge Cases

| Condition | Required Behavior |
|---|---|
| A task identity is already in use, or an archived identity is requested again | Do not allocate or reuse that identity. Do not merge or repair duplicate records. |
| A task ID collision or ambiguous ID is encountered | Fail closed, report both record paths for a collision, and reject ambiguity rather than guessing. |
| A collection contains malformed records | Skip each malformed record, warn with its filename and parse error, and preserve readable results. |
| A direct action targets a malformed record | Fail with a helpful error; bulk collection reads that skip malformed records may exit 0, while explicit single-record loads remain strict. |
| A requested worktree cannot be created | Retain the task, fail session launch with a path-specific error, and do not redirect execution into the project checkout. |
| A recorded resume working directory is missing | Fail resume preparation with a path-specific error. |
| An artifact path escapes the task's `artifacts/` directory, including through a symlink | Reject the path. |
| An artifact change notification is missed | No periodic recheck or recovery of the missed notification is guaranteed. |
| A task is marked Done rather than completed/cleaned up | Change only its status; retain its worktree. |
| Agent liveness cannot be established during deletion | Report unknown/unavailable and leave the agent untouched; uncertainty does not authorize a kill or stopped status. |
| Required execution cleanup fails before tracking/resource removal | Preserve ownership/tracking evidence; direct record deletion or UI teardown cannot substitute for successful cleanup. |
| Multiple native cleanup targets are involved | Apply native cleanup preflight before any stop effects. |
| A task deletion or relocation step fails or is interrupted | Report completed effects truthfully; do not imply rollback. |
| Workspace/group cleanup fails after task deletion succeeds | Display an incomplete-cleanup message. |
| An unfinished task is archived | Preserve its artifacts, session history, dependencies, worktree, and branch; require running sessions to be stopped explicitly first. |
| A terminal-status task is archived | Reject archive. |
| Archiving fails or is cancelled | Do not report successful archival unless the task container was moved. |

## Open Questions

None.
