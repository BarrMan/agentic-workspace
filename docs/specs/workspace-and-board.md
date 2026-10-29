# Product Requirements: Workspace and board

## Overview

Let users inspect and organize project tasks in a grouped workspace list or a status-column board.

## Goals

- Provide grouped-list and status-column views for browsing and organizing project tasks.
- Preserve task organization and workspace state while users act on tasks and groups.

## Scope

### In Scope

- Workspace views, nested groups, safe populated-group deletion, persisted workspace state, task/group actions, board moves, searchable help, customizable shortcuts, and complete footer/help action lists.

### Out of Scope

- Screen composition and shared visual rules, owned by the [screen specifications](../screens/README.md) and [design system](../DESIGN-SYSTEM.md).

## Actors

| Actor | Description |
|---|---|
| User | Views and organizes tasks, configures shortcuts, and invokes workspace actions. |
| Application | Displays workspace views, persists/restores workspace state, and performs requested actions. |

## Functional Requirements

### IF-WB-001: Workspace views

**Description:** The workspace shows project tasks in one grouped list and provides a separate status-column board; users can switch views.

**Trigger:** User opens workspace or switches view.

**Preconditions:** Project tasks are available.

**Behavior:**
1. Display tasks in the selected grouped-list or board view.
2. Allow switching between views without losing task organization or selected task identity; switching views does not change session lifecycle.
3. Selecting a task changes only its selected-task presentation and never starts or resumes a session.
4. Filtering, searching, and changing visible groups change the visible task set and reconcile selection; they never start, resume, or stop sessions.
5. Consume the [loaded task collection](tasks.md#task-005-project-task-store) and its per-record changes; view reads do not trigger a full collection rebuild or identity-resolution scan.

**Outcome:** The selected view displays project tasks.

**Failures:** None specified.

**Acceptance Criteria:**
- [ ] IF-WB-001-AC-01: Open workspace and confirm project tasks are shown in grouped-list view.
- [ ] IF-WB-001-AC-02: Switch to board and confirm project tasks are shown in status columns; switch back successfully.
- [ ] IF-WB-001-AC-03: Select a task and confirm selection changes its presentation only, without starting or resuming a session.
- [ ] IF-WB-001-AC-04: Switch views and confirm selected task identity is preserved and session lifecycle is unchanged.
- [ ] IF-WB-001-AC-05: Filter, search, or change visible groups and confirm the visible task set and selection are reconciled without changing any session lifecycle.
- [ ] IF-WB-001-AC-06: Per-record task changes update the visible collection without rebuilding it on ordinary view reads.

### IF-WB-002: Nested groups

**Description:** Groups can contain tasks and nested groups.

**Trigger:** User organizes tasks into groups.

**Preconditions:** Workspace is open.

**Behavior:**
1. Permit groups to contain tasks and child groups.

**Outcome:** Nested group structure is represented in the workspace.

**Failures:** None specified.

**Acceptance Criteria:**
- [ ] IF-WB-002-AC-01: Place tasks and child groups within a group and confirm the nested structure is shown.

### IF-WB-003: Delete populated group

**Description:** Deleting a populated group preserves its tasks and child groups and lets the user choose their destination, including ungrouped/root placement.

**Trigger:** User requests deletion of a populated group.

**Preconditions:** Group contains tasks or child groups.

**Behavior:**
1. Let the user choose a destination for all contents, including root/ungrouped placement.
2. Delete the group and place its contents at the chosen destination.

**Outcome:** Group is removed and no contents are discarded.

**Failures:** None specified.

**Acceptance Criteria:**
- [ ] IF-WB-003-AC-01: Delete a group with tasks and child groups, choose root/ungrouped placement, and confirm all contents remain at root.
- [ ] IF-WB-003-AC-02: Choose a destination group and confirm the tasks and child groups are preserved there.

### IF-WB-004: Restore workspace state

**Description:** Reopening restores filters, task and mode selection, details visibility, shortcut overrides, group membership, and collapsed groups. Mode selection is remembered separately for each task as defined by [configuration](configuration.md#functional-requirements).

**Trigger:** User reopens workspace.

**Preconditions:** The required workspace/state directories exist; optional group/view files may not yet have been saved.

**Behavior:**
1. Restore filters, task and mode selection, details visibility, shortcut overrides, group membership, and collapsed groups.
2. Restore each task's remembered mode independently of other tasks.
3. An initially absent optional group/view file permits empty groups or default presentation state. It does not permit creating missing required directories or reconstructing task/session state; [TASK-006](tasks.md#task-006-task-storage-format) owns those resources.
4. Read current persisted group/view state inside its mutation lock and write atomically. If previously persisted state disappears before mutation, fail rather than overwrite it from a cached/default value. Malformed files are errors, not absent optional files.

**Outcome:** Reopened workspace reflects its saved state.

**Failures:** Missing required directories, malformed group/view files, or disappearance of previously persisted state during mutation fail without repair or cached-state overwrite.

**Acceptance Criteria:**
- [ ] IF-WB-004-AC-01: Reopen a workspace and confirm filters, task/mode selection, details visibility, shortcut overrides, group membership, and collapsed groups are restored.
- [ ] IF-WB-004-AC-02: Confirm each task's remembered mode is independent of other tasks.
- [ ] IF-WB-004-AC-03: Initially absent optional group/view files use their empty/default semantics; missing required directories and malformed files fail without reconstruction.
- [ ] IF-WB-004-AC-04: Mutations use current persisted state under the lock; disappearance after persistence fails without replacing it from cache.

### IF-WB-005: Screen specifications

**Description:** Grouped list follows the [workspace screen's task-list width and composition](../screens/workspace.md#ordered-regions); board follows its [screen specification](../screens/board.md).

**Trigger:** User displays either workspace view.

**Preconditions:** Workspace is open.

**Behavior:**
1. Conform the grouped list to its linked screen specification.
2. Conform the board to its linked screen specification.

**Outcome:** Each view follows its owning screen contract.

**Failures:** Screen composition rules are owned by the linked screen specifications.

**Acceptance Criteria:**
- [ ] IF-WB-005-AC-01: Confirm grouped-list task-list width and composition follow the linked workspace screen specification.
- [ ] IF-WB-005-AC-02: Confirm board behavior follows its linked screen specification.

### IF-WB-006: Workspace actions

**Description:** Users can preview, cancel, and commit board moves; assign/unassign groups; expand/collapse groups; copy a task ID; choose retained sessions; and show an agent terminal fullscreen. Choosing a retained session follows the [session interaction contract](session-interaction-and-feedback.md). Interactive task surfaces expose task creation, editing, and archival actions.

**Trigger:** User invokes an action on a board, group, task, or agent terminal.

**Preconditions:** Corresponding interactive surface and target are available.

**Behavior:**
1. Expose and perform board-move preview, cancellation, and commit; cancellation preserves the original position.
2. Assign and unassign groups, expand and collapse groups, copy a task ID, choose a retained session, and show an agent terminal fullscreen.
3. Expose task creation, editing, and archival actions on interactive task surfaces.
4. Commit board/status changes through the [complete-record task edit contract](tasks.md#task-025-complete-record-updates-and-edits), preserving the independent `done` indication and storage location. Archive follows [TASK-022](tasks.md#task-022-archive-and-cleanup) regardless of status or `done`.

**Outcome:** Requested action is performed; board move remains previewable and cancellable before commit.

**Failures:** Canceling a previewed move preserves the original position.

**Acceptance Criteria:**
- [ ] IF-WB-006-AC-01: Preview a board move; cancel it and confirm original position, then commit a move and confirm the destination.
- [ ] IF-WB-006-AC-02: Assign a task to a group and unassign it; confirm membership changes accordingly.
- [ ] IF-WB-006-AC-03: Expand and collapse a group and confirm its contents visibility changes.
- [ ] IF-WB-006-AC-04: Copy a task ID and confirm the copied value is that task's ID.
- [ ] IF-WB-006-AC-05: Choose a retained session and confirm the chosen session is retained.
- [ ] IF-WB-006-AC-06: Show an agent terminal fullscreen and confirm the terminal is displayed fullscreen.
- [ ] IF-WB-006-AC-07: Confirm interactive task surfaces expose task creation, editing, and archival actions.
- [ ] IF-WB-006-AC-08: Committed board/status edits preserve `done` and location and use the task edit failure/hook contract; archive availability has no status/done gate.

### IF-WB-007: Searchable help and shortcuts

**Description:** Help is searchable and keyboard shortcuts are customizable. Each action has exactly one configured binding, not a collection of alternative bindings or aliases. A binding may be an ordered multi-stroke sequence as described in the [help screen](../screens/help-dialogs.md); its strokes are not alternative bindings. A conflicting assignment is rejected while the working binding is retained.

**Trigger:** User searches help or customizes a shortcut.

**Preconditions:** Help or shortcut settings are available.

**Behavior:**
1. Search help entries.
2. Allow shortcut customization.
3. Reject a binding that conflicts with a working binding.
4. Replace the action's single binding when customizing it; do not retain its previous/default binding as an alias or expose alternative bindings under duplicate names for the same action.
5. In task-list navigation, bind First to `g` and Last to `Shift+G` by default. `Home` and `End` are not task-list navigation aliases. The workspace New group default is `Option+G` on macOS (`Alt+G` elsewhere).
6. Program Exit has one configurable binding (`Ctrl+C` by default) and context-dependent handling, not an alternative Leave-preview binding. While live-preview input is focused, the controller routes Program Exit to leave preview input (and fullscreen, if active), consumes it, and stops propagation without forwarding terminal input or closing the app. Outside live-preview input, Program Exit requests graceful application close under [SESSION-018](sessions.md#session-018-close-the-app-with-or-without-stopping-sessions). The separate Leave-preview action retains its own single binding (`Ctrl+Q` by default). Rebinding Program Exit changes both contextual uses of that action.

**Outcome:** Help search is usable and valid shortcut overrides take effect.

**Failures:** Reject conflict and retain the working binding.

**Acceptance Criteria:**
- [ ] IF-WB-007-AC-01: Search help for an available action and confirm matching help entries can be found.
- [ ] IF-WB-007-AC-02: Customize a non-conflicting shortcut and confirm the new binding works.
- [ ] IF-WB-007-AC-03: Assign a shortcut already bound to a working action; confirm rejection and retention of the previous binding.
- [ ] IF-WB-007-AC-04: Confirm every action exposes one binding, customization replaces it, and no alternate defaults or duplicate-action aliases remain active.
- [ ] IF-WB-007-AC-05: With default task-list bindings, confirm `g` selects First and `Shift+G` selects Last, while `Home`/`End` do not navigate to task-list boundaries. Confirm the workspace New group binding is `Option+G`/`Alt+G`.
- [ ] IF-WB-007-AC-06: Invoke Program Exit in navigation and confirm the graceful-close flow; invoke it in focused preview/fullscreen and confirm return to navigation without close or terminal input. Rebind Program Exit and repeat both contexts; confirm the separate Leave-preview binding still works and the old Exit binding is no longer an Exit action.

### IF-WB-008: Complete action listings

**Description:** Footer shows every action available for the current focus; help shows all available actions.

**Trigger:** User changes focus or opens help.

**Preconditions:** Workspace has actions available for the current focus.

**Behavior:**
1. Keep footer actions complete for current focus.
2. Keep help actions complete for the workspace.
3. Derive footer and help shortcut hints from the same effective binding used for dispatch, including a saved override. Preserve modifiers and all strokes of a sequence; do not select a separate display-only alias or show a default after it is overridden.
4. Display readable key combinations, such as `Option+G` on macOS or `Alt+G` elsewhere for New group, rather than Option-composed text such as `©`. Distinguish unmodified `g` from `Shift+G` in hints.

**Outcome:** Available actions are discoverable in the appropriate listing.

**Failures:** None specified.

**Acceptance Criteria:**
- [ ] IF-WB-008-AC-01: For each focus state, confirm the footer lists every action available for that focus and no available action is omitted.
- [ ] IF-WB-008-AC-02: Confirm help lists all available actions, including actions not shown in the current-focus footer.
- [ ] IF-WB-008-AC-03: Compare footer/help hints with actual dispatch for default bindings and customized single-/multi-stroke bindings; confirm the hints show the effective binding and every modifier/stroke, never a superseded default.
- [ ] IF-WB-008-AC-04: Confirm default First/Last hints show `g`/`Shift+G` and New group shows `Option+G` on macOS (`Alt+G` elsewhere), not `©`.

## States and Transitions

### Workspace views

**States:**

| State | Meaning |
|---|---|
| Grouped-list view | Project tasks displayed in one grouped list. |
| Board view | Project tasks displayed in status columns. |

**Transitions:**

| From | Trigger | To | Required Behavior |
|---|---|---|---|
| Either workspace view | User switches view | Other view | Display tasks in selected view without losing organization. |
| Either workspace view | User selects a task | Same view with selected task presentation | Update the selected-task presentation only; do not start or resume a session. |
| Either workspace view | User filters, searches, or changes visible groups | Updated visible task set | Reconcile selection with the visible task set without changing session lifecycle. |

**Invariants:**
- Switching views preserves task organization.
- Switching views preserves selected task identity and does not change session lifecycle.
- Task selection changes selected-task presentation only and never starts or resumes a session.
- Filtering, searching, and changing visible groups reconcile selection with the visible task set and never start, resume, or stop a session.

### Board move

**States:**

| State | Meaning |
|---|---|
| Board move preview | Proposed task destination is shown without committing it. |

**Transitions:**

| From | Trigger | To | Required Behavior |
|---|---|---|---|
| Board | User initiates move | Move preview | Preview proposed move. |
| Move preview | Cancel | Original position | Leave task unchanged. |
| Move preview | Commit | Destination position | Move task to the chosen destination. |

**Invariants:**
- A canceled board move leaves the task in its original position.
- A committed status move preserves `done` and storage location and follows TASK-025's durable-edit and actual-status-change behavior.

### Workspace state

**States:**

| State | Meaning |
|---|---|
| Workspace state | Filters, task/mode selection, details visibility, shortcut overrides, group membership, and collapsed groups. |

**Transitions:**

| From | Trigger | To | Required Behavior |
|---|---|---|---|
| Saved workspace | User reopens workspace | Restored workspace | Restore each required state value, including independent per-task mode selection. |

**Invariants:**
- Each task's remembered mode is independent of other tasks.
- Deleting a populated group preserves its tasks and child groups.
- Optional group/view-file absence is distinct from loss of required directories or task/session resources; previously persisted state is not overwritten from stale cache after disappearance.

### Shortcut bindings

**States:**

| State | Meaning |
|---|---|
| Shortcut bindings | Current working key bindings, including user overrides. |

**Transitions:**

| From | Trigger | To | Required Behavior |
|---|---|---|---|
| Working shortcut | User assigns conflicting shortcut | Prior binding retained | Reject conflict. |

**Invariants:**
- A rejected shortcut conflict leaves the working binding intact.

## User Interactions

### Browse and organize workspace tasks

**Context:** The user is viewing a project's workspace in grouped-list or board view.

**Action:** Switch views; organize tasks into nested groups; invoke task, group, board-move, help, or shortcut actions.

**Response:** Display the selected view and perform requested actions; show a board-move preview before commit and preserve the task when canceled.

**Feedback:** Display visible action/help listings; reject conflicting shortcut assignments while retaining the working binding.

## External Behavior

### Workspace interaction

**Purpose:** Expose task browsing and organization actions to the user.

**Inputs:** View selection, task/group actions, board move choices, workspace preferences, and shortcut assignments.

**Outputs:** Selected workspace view, task/group changes, previews, restored workspace state, and visible action/help listings.

**Failures:** Reject a conflicting shortcut while retaining its working binding. A canceled move leaves the task unchanged. State-load/mutation failures follow IF-WB-004; committed task edits and archive follow their task contracts, including truthful partial-effect reporting.

## Non-Functional Requirements

### Performance

- None.

### Reliability

- Restore saved workspace state when the user reopens the workspace.
- Deleting a populated group preserves its tasks and child groups; canceling a board move preserves the task's original position.
- Rejecting a shortcut conflict preserves the working binding.

### Security

- None.

### Compatibility

- None.

## Edge Cases

| Condition | Required Behavior |
|---|---|
| User cancels a previewed board move | Leave task in its original position. |
| Deleted group contains tasks or nested groups | Preserve all contents and let user select destination, including root/ungrouped. |
| Shortcut assignment conflicts with a working binding | Reject assignment and retain working binding. |
| An optional group/view file has never been saved | Use its empty/default state with required directories already provisioned. |
| Required directories are missing or a group/view file is malformed | Fail without recreating directories or substituting default state. |
| Previously persisted group/view state disappears before mutation | Fail without overwriting from cache; preserve concurrent data through locked current-state mutation. |
| A task edit notification fails after a committed board move | Preserve durable effects and report the error under TASK-025; do not imply rollback. |

## Open Questions

None.
