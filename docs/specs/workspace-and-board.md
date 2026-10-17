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
2. Allow switching between views without losing task organization.

**Outcome:** The selected view displays project tasks.

**Failures:** None specified.

**Acceptance Criteria:**
- [ ] IF-WB-001-AC-01: Open workspace and confirm project tasks are shown in grouped-list view.
- [ ] IF-WB-001-AC-02: Switch to board and confirm project tasks are shown in status columns; switch back successfully.

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

**Preconditions:** Workspace state was previously saved.

**Behavior:**
1. Restore filters, task and mode selection, details visibility, shortcut overrides, group membership, and collapsed groups.
2. Restore each task's remembered mode independently of other tasks.

**Outcome:** Reopened workspace reflects its saved state.

**Failures:** None specified.

**Acceptance Criteria:**
- [ ] IF-WB-004-AC-01: Reopen a workspace and confirm filters, task/mode selection, details visibility, shortcut overrides, group membership, and collapsed groups are restored.
- [ ] IF-WB-004-AC-02: Confirm each task's remembered mode is independent of other tasks.

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

**Description:** Users can preview, cancel, and commit board moves; assign/unassign groups; expand/collapse groups; copy a task ID; choose retained sessions; and show an agent terminal fullscreen. Interactive task surfaces expose task creation, editing, and archival actions.

**Trigger:** User invokes an action on a board, group, task, or agent terminal.

**Preconditions:** Corresponding interactive surface and target are available.

**Behavior:**
1. Expose and perform board-move preview, cancellation, and commit; cancellation preserves the original position.
2. Assign and unassign groups, expand and collapse groups, copy a task ID, choose a retained session, and show an agent terminal fullscreen.
3. Expose task creation, editing, and archival actions on interactive task surfaces.

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

### IF-WB-007: Searchable help and shortcuts

**Description:** Help is searchable and keyboard shortcuts are customizable. A conflicting assignment is rejected while the working binding is retained.

**Trigger:** User searches help or customizes a shortcut.

**Preconditions:** Help or shortcut settings are available.

**Behavior:**
1. Search help entries.
2. Allow shortcut customization.
3. Reject a binding that conflicts with a working binding.

**Outcome:** Help search is usable and valid shortcut overrides take effect.

**Failures:** Reject conflict and retain the working binding.

**Acceptance Criteria:**
- [ ] IF-WB-007-AC-01: Search help for an available action and confirm matching help entries can be found.
- [ ] IF-WB-007-AC-02: Customize a non-conflicting shortcut and confirm the new binding works.
- [ ] IF-WB-007-AC-03: Assign a shortcut already bound to a working action; confirm rejection and retention of the previous binding.

### IF-WB-008: Complete action listings

**Description:** Footer shows every action available for the current focus; help shows all available actions.

**Trigger:** User changes focus or opens help.

**Preconditions:** Workspace has actions available for the current focus.

**Behavior:**
1. Keep footer actions complete for current focus.
2. Keep help actions complete for the workspace.

**Outcome:** Available actions are discoverable in the appropriate listing.

**Failures:** None specified.

**Acceptance Criteria:**
- [ ] IF-WB-008-AC-01: For each focus state, confirm the footer lists every action available for that focus and no available action is omitted.
- [ ] IF-WB-008-AC-02: Confirm help lists all available actions, including actions not shown in the current-focus footer.

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

**Invariants:**
- Switching views preserves task organization.

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

**Failures:** Reject a conflicting shortcut while retaining its working binding. A canceled move leaves the task unchanged. No other failure behavior is specified here.

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

## Open Questions

None.
