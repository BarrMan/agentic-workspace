# Product Specification: Tasks and Storage

## Overview

This contract defines task identity and data, project storage, artifacts, work context and completion, milestones, and task deletion behavior.

## Goals

- Specify observable task identity, storage, artifact, work-context, milestone, completion, archive, and deletion behavior.

## Scope

### In Scope

- Task records and identity, project task storage, artifacts, task worktrees, completion, milestones, archive, and deletion.

### Out of Scope

- Provider-owned configuration, data, or state management; duplicate-record repair; draft promotion; and automatic gating of launch or completion by dependencies.

## Actors

| Actor | Description |
|---|---|
| User | Creates, views, edits, launches, completes, archives, deletes, and manages tasks and artifacts. |
| Workspace | Stores and presents tasks, performs task lifecycle operations, and reports their outcomes. |
| Provider | Supplies provider-owned configuration, data, and state, which the workspace does not manage. |

## States and Transitions

| Entity | State or transition |
|---|---|
| Task | Configured project status; marking Done changes only status. Explicit completion/cleanup moves the task to completed storage and removes its worktree and branch. |
| Task | An unfinished task may be archived; terminal-status tasks cannot be archived. |
| Task data | Resides at the project's single deterministic configured location; relocation makes the selected location the store on success. |
| Milestone | May be added, renamed, listed, archived, or removed; removal clears or reassigns task references. |

## External Behavior

### CLI and workspace operations

**Purpose:** Let users manage tasks, work context, and task artifacts.

**Inputs:** User task actions and artifact paths/content; task status values from project configuration.

**Outputs:** Task listings and views, operation results, warnings, and actionable errors as specified below.

**Failures:** Follow [error handling and edge cases](../CONVENTIONS.md#error-handling), with task-specific consequences defined in the requirements and flows below.

## Features

| Feature | Description | Contract |
|---|---|---|
| Tasks and storage | Define task identity, storage, artifacts, work context, completion, milestones, and deletion. | Tasks and storage feature contract below |

## Feature Contracts

### Tasks and storage

[Product contract](../SPEC.md) · Related: [sessions](sessions.md), [configuration](configuration.md), [supported integration operations](supported-integration-operations.md)

#### Purpose

Define task identity and data, project storage, artifacts, work context and completion, milestones, and task deletion behavior.

## Requirements

<a id="task-model"></a>

| ID | Requirement |
|---|---|
| TASK-001 | A task is a unit of work scoped to a project directory, whether or not that directory uses Git. Its editable business fields are title, description, type, priority, milestone, and labels; each may be optional, and none is made mandatory by this list. |
| TASK-002 | Task statuses come from project configuration, and the CLI directs users to edit the configured status list in the configuration file. Creation produces a task directly, allocates its ID under a creation lock, and saves the new record. Subsequent task actions operate on that task identity. The application does not provide draft promotion or demotion. |
| TASK-003 | A task ID is its complete prefixed string: `TASK-01` and `TASK-1` are distinct identities, and numeric suffixes are not compared. Creation must not allocate an identity already in use. Duplicate records are not merged or repaired. Archived task IDs remain reserved and are not reused. Identity collisions are reported with both record paths and fail closed rather than guessing; ambiguous task IDs are rejected. |
| TASK-004 | Tasks can depend on other tasks and display dependency blockers and readiness. Dependency links survive completion. Dependencies are informational: they do not automatically gate user-directed launch or completion. |
| TASK-005 | Each project has one deterministic configured task-data location. A linked worktree uses the main project's task store. Loading reads that store as the project's task collection; the application does not discover task records across branches. |
| TASK-006 | Project configuration selects one task-data location: the project's `.agentic-workspace` directory (default), the application's user-level data location, or a user-selected path. The task data folder is outside `.git`; each task has an `artifacts/` directory within its task folder. Task records are stored in each task container as `task.md`, serialized as Markdown with frontmatter. |
| TASK-007 | The application does not automatically repair corrupted records. Collection reads skip malformed records and warn with the affected filename and parse error while preserving readable results. A direct action on a malformed target fails with a helpful error. The application does not provide duplicate repair or a `doctor` command. Bulk collection reads that skip malformed records allow the command to exit 0; explicit single-record loads remain strict. |
| TASK-008 | When the user changes the configured task-data location, the application moves the entire workspace-owned data folder, including existing task data, rather than requiring manual relocation. Provider-owned configuration, data, and state are never moved or otherwise managed. On success, the full workspace-owned folder is at the selected location, which becomes the project's deterministic store, including for linked worktrees. If relocation fails or is interrupted, report the error and stop; do not continue, roll back automatically, recover automatically, or retry automatically. |
| TASK-009 | The list-artifacts command lists files in the task's `artifacts/` directory. Generic task-file tools display text/Markdown or binary metadata, read file contents, and write contents supplied from another file or standard input. A write replaces the selected file inside that directory. |
| TASK-010 | An open artifact viewer reflects externally edited content through change notifications. It does not periodically recheck content and does not guarantee recovery of a missed notification. |
| TASK-011 | Artifacts are user-managed files with arbitrary names and contents. Modes and approval follow the [mode contract](configuration.md#configuration-and-modes); artifact file tools operate independently of mode-specific document schemas and approval checks. |
| TASK-012 | A worktree-per-task setting controls task worktree use. When enabled, a worktree is created on the first session launch. Task creation creates the task record without allocating the worktree. If worktree creation fails, retain the task and show a visible warning; a requested worktree failure must not silently redirect execution into the project checkout. Resume preparation with a missing recorded working directory fails with a path-specific error; see [error handling and edge cases](../CONVENTIONS.md#error-handling). |
| TASK-013 | Marking a task **Done** changes only its status and retains its worktree. Completion/cleanup is a separate explicit operation that moves the task to completed storage, performs session cleanup, and removes the worktree and task branch, without touching provider-owned configuration, data, or state. The TUI exposes completion/cleanup through a keybinding distinct from status-only Done. |
| TASK-014 | Milestones support adding, renaming, listing, and archiving, with task-status counts and completion percentages. Renaming preserves task assignments. Removing a milestone clears or reassigns all matching task references, so retained tasks refer only to existing milestones or have no assignment. |
| TASK-015 | Explicit destructive task deletion requires confirmation naming the task ID and title and stating that deletion cannot be undone. The confirmation does not mention uncommitted work. Deletion kills the task's agent and removes its worktree and branch. It is distinct from Done, completion/cleanup, and task archive; it does not add a force-discard or uncommitted-work option. Provider-owned configuration, data, and state are never modified. |
| TASK-016 | Uncertainty about agent liveness authorizes neither killing an agent nor declaring it stopped. If liveness cannot be established, report unknown/unavailable and leave the agent untouched. |
| TASK-017 | When a confirmed destructive operation includes execution cleanup, cleanup precedes removal of its tracking relationships and resources. If cleanup fails, preserve the ownership/tracking evidence needed to locate the execution; direct record deletion or UI teardown cannot substitute for successful cleanup. |
| TASK-018 | If any task deletion or relocation step fails or is interrupted, report the error. Report completed effects truthfully; do not imply rollback. If workspace or group cleanup fails after task deletion succeeds, display an incomplete-cleanup message. Generic failure handling follows [error handling and edge cases](../CONVENTIONS.md#error-handling). |
| TASK-019 | Task-deletion teardown follows the [session input lifetime](sessions.md#observe-and-detach-from-a-live-session) rule for already in-flight input. For multiple native cleanup targets, apply [native cleanup preflight](sessions.md#stop-and-resume-a-session) before any stop effects. |
| TASK-020 | Tasks can be listed and viewed through the CLI. The CLI supports editing an existing task by replacing its title and description. |
| TASK-021 | Artifact paths resolve inside the task's `artifacts/` directory; paths that escape it, including through symlinks, are rejected. |

## Flows

##### Creating and using a task

**Trigger:** The user creates a task and later acts on it.

**Preconditions:** A project directory is selected.

**Flow:**

1. Create a task record directly, using an identity not already in use.
2. Apply subsequent task actions to that task identity; do not create or promote a draft.
3. Resolve status from project configuration and treat any dependency blockers/readiness as informational.

**Postconditions:** The task exists as a task, and task identity and dependency links remain distinct from status or readiness.

##### Loading project tasks

<a id="project-data-store"></a>

**Trigger:** The application loads a project's task collection.

**Preconditions:** The project has a configured task-data location.

**Flow:**

1. Read the one deterministic store for the project; a linked worktree reads the main project's store.
2. Skip malformed records, warn with each affected filename and parse error, and retain readable results.
3. Do not discover records across branches or repair duplicates/corrupted records.

**Postconditions:** The collection reflects readable records from the configured store.

##### Changing the storage location

**Trigger:** The user changes the configured task-data location.

**Preconditions:** A project has an existing task-data folder and a selected new location.

**Flow:**

1. Move the entire workspace-owned data folder, including existing task data, to the selected location; do not move provider-owned state.
2. On success, use that location as the project's deterministic store, including from linked worktrees. If a step fails or is interrupted, report the error and stop without automatic rollback, recovery, or retry.

**Postconditions:** On success, the full workspace-owned data folder is at the selected location. Provider-owned state remains untouched.

##### Using task artifacts

<a id="task-artifacts"></a>

**Trigger:** The user lists, reads, displays, writes, or views an artifact.

**Preconditions:** The task has an `artifacts/` directory; writes receive content from another file or standard input.

**Flow:**

1. List files in the task's `artifacts/` directory.
2. Display text/Markdown or binary metadata, read contents, or replace a selected file with supplied contents.
3. Reflect external edits in an open viewer through change notifications only.

**Postconditions:** Artifact operations apply to user-managed files in that task's artifacts directory and are independent of mode-specific schemas and approval checks.

##### Launching work and completing a task

<a id="work-context-and-completion"></a>

**Trigger:** The user creates a task, launches a session, marks the task Done, or explicitly invokes completion/cleanup.

**Preconditions:** For worktree behavior, task worktrees are enabled.

**Flow:**

1. Create the task record without allocating its worktree.
2. Create the worktree on first session launch.
3. If worktree creation fails, retain the task, show a visible warning, and do not silently redirect execution to the project checkout.
4. Marking Done changes only status and retains the worktree. Explicit completion/cleanup instead moves the task to completed storage, performs session cleanup, and removes the worktree and branch.

**Postconditions:** Status-only Done and explicit completion/cleanup remain separate operations.

##### Managing milestones

<a id="milestones"></a>

**Trigger:** The user adds, renames, lists, archives, or removes a milestone.

**Preconditions:** The project may have tasks assigned to milestones.

**Flow:**

1. Support adding, renaming, listing, and archiving milestones, and report task-status counts and completion percentages.
2. Preserve task assignments on rename.
3. On removal, clear or reassign all matching task references.

**Postconditions:** Retained tasks refer only to an existing milestone or have no milestone assignment.

##### Task deletion

<a id="triggers-and-preconditions"></a><a id="scope"></a><a id="success-and-failure"></a>

**Trigger:** The user explicitly requests deletion of a task.

**Preconditions:** The target task is identified and the user confirms destructive deletion. Native cleanup targets pass preflight before effects.

**Flow:**

1. Kill the task's agent, then remove its worktree and branch; do not remove tracking relationships/resources before required cleanup succeeds.
2. Leave provider-owned configuration, data, and state untouched. Do not add a force-discard or uncommitted-work option.
3. On any failed or interrupted step, report the error and stop; report completed effects truthfully without implying rollback.

**Postconditions:** Destructive deletion removes the task's agent, worktree, and branch after confirmation and preflight. Workspace-owned records/resources are deleted; provider-owned state is untouched.

##### Archiving an unfinished task

Archiving a terminal-status task is rejected. Archiving an unfinished task moves its task container to archive storage and invokes vacated-task reference cleanup; it preserves artifacts, session history, dependencies, worktree, and branch. Running sessions must be stopped explicitly before archive. Completed work uses completion/cleanup instead of archive.

## Failure/Recovery

Task-specific failure outcomes and recovery obligations are defined in the requirements and flows below. Generic stop, retry, recovery, and rollback handling follows [error handling and edge cases](../CONVENTIONS.md#error-handling).

| Condition | Expected Behavior |
|---|---|
| A task identity is already in use, or an archived identity is requested again | Do not allocate or reuse that identity. Do not merge or repair duplicate records. |
| A collection contains malformed records | Skip each malformed record, warn with its filename and parse error, and preserve readable results. |
| A direct action targets a malformed record | Fail with a helpful error. |
| A requested worktree cannot be created | Retain the task, show a visible warning, and do not redirect execution into the project checkout. |
| An artifact change notification is missed | No periodic recheck or recovery of the missed notification is guaranteed. |
| A task is marked Done rather than completed/cleaned up | Change only its status; retain its worktree. |
| Agent liveness cannot be established during deletion | Report unknown/unavailable and leave the agent untouched; uncertainty does not authorize a kill or stopped status. |
| Multiple native cleanup targets are involved | Apply native cleanup preflight before any stop effects. |
| A task deletion or relocation step fails or is interrupted | Report the error and stop; do not continue with remaining steps, automatically recover, retry, or roll back. Report completed effects truthfully. |
| An unfinished task is archived | Preserve its artifacts, session history, dependencies, worktree, and branch; require running sessions to be stopped explicitly first. |

### Behavioral Invariants

- Task IDs are complete literal identities; numeric suffixes are not compared, duplicate records are not repaired, and archived IDs remain reserved.
- Dependencies remain informational and survive completion; they do not automatically gate launch or completion.
- A project's task collection comes from one deterministic store, shared by its linked worktrees, not from branch discovery.
- Forgetting does not signal an agent. Uncertain liveness never authorizes killing an agent or reporting it stopped.
- Status-only Done retains the worktree; explicit completion/cleanup removes the worktree and branch.
- Provider-owned configuration, data, and state are never managed or modified.
- When confirmed destructive execution cleanup is required, cleanup precedes tracking/resource removal; failure evidence and truthful reporting are preserved.

## Acceptance Criteria

<a id="acceptance-scenarios"></a>

- [ ] Creating a task produces a task directly; a used or archived task ID is not allocated again, and `TASK-01` and `TASK-1` remain distinct.
- [ ] Loading from a project or linked worktree reads the same deterministic store; malformed entries are skipped with filename and parse-error warnings while readable records remain available.
- [ ] Changing a project's task-data location moves the full workspace-owned data folder; on failure or interruption, the operation reports the error and stops without automatic rollback, recovery, or retry.
- [ ] Artifact listing, display, reading, and writing are limited to the task's `artifacts/` directory; writing replaces the selected file, and missed viewer notifications are not guaranteed to be recovered.
- [ ] With worktrees enabled, task creation does not allocate a worktree, first launch does, and a failed allocation retains the task and visibly warns without redirecting execution into the project checkout.
- [ ] Marking Done retains the worktree and changes only status; explicit completion/cleanup removes the worktree and branch.
- [ ] Renaming a milestone preserves assignments; removing one clears or reassigns every matching reference so retained tasks have no stale milestone assignment.
- [ ] Forget-only deletion does not signal or purge the agent; if liveness is unknown, report unknown/unavailable and leave it untouched.
- [ ] When destructive execution cleanup is confirmed and required, cleanup failure preserves actionable ownership/tracking evidence and does not remove tracking relationships/resources as if cleanup succeeded.
- [ ] Partial deletion reports completed and incomplete effects and relevant errors truthfully, preserves actionable recovery evidence, and claims neither complete success nor transactional rollback.
- [ ] **TASK-001:** A task is scoped to a project directory with or without Git; each listed editable business field may be absent.
- [ ] **TASK-002:** Configured statuses are used and users are directed to the configuration file; creation directly creates and saves an identity under a creation lock, with no draft promotion or demotion.
- [ ] **TASK-003:** Literal prefixed IDs remain distinct, collisions fail closed with both record paths, ambiguous IDs fail, and archived IDs cannot be reused or repaired/merged.
- [ ] **TASK-004:** Dependencies and blocker/readiness displays persist through completion and never automatically gate user-directed launch or completion.
- [ ] **TASK-005:** Project task loading uses its one deterministic store, including from linked worktrees, and does not discover records across branches.
- [ ] **TASK-006:** Each supported configuration choice selects the store; task data remains outside `.git`, task containers contain `task.md` and `artifacts/`, and records use Markdown frontmatter.
- [ ] **TASK-007:** Collection reads skip malformed records with filename and parse error while retaining readable records; direct malformed-target actions fail helpfully, with bulk reads exiting 0 and explicit single-record loads strict.
- [ ] **TASK-008:** Relocation moves the complete workspace-owned data folder and never manages provider-owned state; success selects the new deterministic store and failure is reported without continuing.
- [ ] **TASK-009:** Artifact listing, display, read, and write behave as specified, with writes replacing the selected artifact in the task's artifacts directory.
- [ ] **TASK-010:** External artifact edits update an open viewer only through notifications; no periodic recheck or missed-notification recovery is promised.
- [ ] **TASK-011:** Arbitrary artifact names and contents are user-managed; mode rules apply as specified, independently of mode-specific document schemas and approvals.
- [ ] **TASK-012:** With task worktrees enabled, creation does not allocate one, first launch does; allocation failure retains the task, warns, and does not redirect execution, while a missing recorded resume directory fails with a path-specific error.
- [ ] **TASK-013:** Done changes status only and retains the worktree; explicit completion/cleanup moves to completed storage, performs session cleanup, and removes worktree and branch through a distinct TUI keybinding.
- [ ] **TASK-014:** Milestone operations and counts/percentages are available; rename preserves assignments and removal clears or reassigns every matching reference.
- [ ] **TASK-015:** Confirmed destructive deletion names ID/title and irreversibility, kills the task agent, removes worktree and branch, has no force-discard option, and leaves provider state untouched.
- [ ] **TASK-016:** Unknown agent liveness is reported unknown/unavailable and never authorizes killing or declaring stopped.
- [ ] **TASK-017:** Required execution cleanup precedes tracking/resource removal; cleanup failure preserves ownership/tracking evidence and direct record deletion or UI teardown cannot substitute for cleanup.
- [ ] **TASK-018:** Failed or interrupted deletion/relocation reports completed effects truthfully and stops; cleanup failure after successful deletion is shown as incomplete cleanup.
- [ ] **TASK-019:** Deletion teardown respects in-flight input lifetime and validates all native cleanup targets before stop effects.
- [ ] **TASK-020:** CLI users can list and view tasks and replace an existing task's title and description.
- [ ] **TASK-021:** Artifact paths resolving outside the task's `artifacts/` directory, including through symlinks, are rejected.

## Requirement Fields

Each TASK requirement's table entry is its **Description** and required **Behavior**. The corresponding flow supplies its trigger, preconditions, and observable outcome where applicable; the Failure/Recovery section and linked error-handling contract define failures. Criteria above are keyed to every requirement ID. A field is `None` only when that requirement has no applicable trigger, precondition, outcome, or failure behavior.

#### Open Decisions

None recorded in this contract.
