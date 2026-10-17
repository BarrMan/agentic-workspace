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

## States and Transitions

### Workspace, board, groups, and shortcuts

**States:**

| State | Meaning |
|---|---|
| Grouped-list view | Project tasks displayed in one grouped list. |
| Board view | Project tasks displayed in status columns. |
| Board move preview | Proposed task destination is shown without committing it. |
| Workspace state | Filters, task/mode selection, details visibility, shortcut overrides, group membership, and collapsed groups. |
| Shortcut bindings | Current working key bindings, including user overrides. |

**Transitions:**

| From | Trigger | To | Required Behavior |
|---|---|---|---|
| Either workspace view | User switches view | Other view | Display tasks in selected view without losing organization. |
| Board | User initiates move | Move preview | Preview proposed move. |
| Move preview | Cancel / commit | Original / destination position | Cancel leaves task unchanged; commit moves it. |
| Saved workspace | User reopens workspace | Restored workspace | Restore each required state value. |
| Working shortcut | User assigns conflicting shortcut | Prior binding retained | Reject conflict. |

**Invariants:**
- Deleting a populated group preserves its tasks and child groups.
- A canceled board move leaves the task in its original position.
- A rejected shortcut conflict leaves the working binding intact.

## External Behavior

### Workspace interaction

**Purpose:** Expose task browsing and organization actions to the user.

**Inputs:** View selection, task/group actions, board move choices, workspace preferences, and shortcut assignments.

**Outputs:** Selected workspace view, task/group changes, previews, restored workspace state, and visible action/help listings.

**Failures:** Reject a conflicting shortcut while retaining its working binding. A canceled move leaves the task unchanged. No other failure behavior is specified here.

## User Interactions

### Browse and organize workspace tasks

**Context:** The user is viewing a project's workspace in grouped-list or board view.

**Action:** Switch views; organize tasks into nested groups; invoke task, group, board-move, help, or shortcut actions.

**Response:** Display the selected view and perform requested actions; show a board-move preview before commit and preserve the task when canceled.

**Feedback:** Display visible action/help listings; reject conflicting shortcut assignments while retaining the working binding.

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

## Functional Requirements

### IF-WB-001: Workspace views

**Description:** The workspace shows project tasks in one grouped list and provides a separate status-column board; users can switch views.
**Trigger:** User opens workspace or switches view.
**Preconditions:** Project tasks are available.
**Behavior:** Display tasks in the selected grouped-list or board view and allow switching between them.
**Outcome:** The selected view displays project tasks.
**Failures:** None specified.
**Acceptance Criteria:**
- [ ] IF-WB-001-AC-01: Open workspace and confirm project tasks are shown in grouped-list view.
- [ ] IF-WB-001-AC-02: Switch to board and confirm project tasks are shown in status columns; switch back successfully.

### IF-WB-002: Nested groups

**Description:** Groups can contain tasks and nested groups.
**Trigger:** User organizes tasks into groups.
**Preconditions:** Workspace is open.
**Behavior:** Permit groups to contain tasks and child groups.
**Outcome:** Nested group structure is represented in the workspace.
**Failures:** None specified.
**Acceptance Criteria:**
- [ ] IF-WB-002-AC-01: Place tasks and child groups within a group and confirm the nested structure is shown.

### IF-WB-003: Delete populated group

**Description:** Deleting a populated group preserves its tasks and child groups and lets the user choose their destination, including ungrouped/root placement.
**Trigger:** User requests deletion of a populated group.
**Preconditions:** Group contains tasks or child groups.
**Behavior:** Let the user choose a destination for all contents, then delete the group and place contents at that destination.
**Outcome:** Group is removed and no contents are discarded.
**Failures:** None specified.
**Acceptance Criteria:**
- [ ] IF-WB-003-AC-01: Delete a group with tasks and child groups, choose root/ungrouped placement, and confirm all contents remain at root.
- [ ] IF-WB-003-AC-02: Choose a destination group and confirm the tasks and child groups are preserved there.

### IF-WB-004: Restore workspace state

**Description:** Reopening restores filters, task and mode selection, details visibility, shortcut overrides, group membership, and collapsed groups. Mode selection is remembered separately for each task as defined by [configuration](configuration.md#configuration-and-modes).
**Trigger:** User reopens workspace.
**Preconditions:** Workspace state was previously saved.
**Behavior:** Restore all listed state, including independent per-task mode selection.
**Outcome:** Reopened workspace reflects its saved state.
**Failures:** None specified.
**Acceptance Criteria:**
- [ ] IF-WB-004-AC-01: Reopen a workspace and confirm filters, task/mode selection, details visibility, shortcut overrides, group membership, and collapsed groups are restored.
- [ ] IF-WB-004-AC-02: Confirm each task's remembered mode is independent of other tasks.

### IF-WB-005: Screen specifications

**Description:** Grouped list follows the [workspace screen's task-list width and composition](../screens/workspace.md#ordered-regions); board follows its [screen specification](../screens/board.md).
**Trigger:** User displays either workspace view.
**Preconditions:** Workspace is open.
**Behavior:** Conform to the corresponding screen specification.
**Outcome:** Each view follows its owning screen contract.
**Failures:** Screen composition rules are owned by the linked screen specifications.
**Acceptance Criteria:**
- [ ] IF-WB-005-AC-01: Confirm grouped-list task-list width and composition follow the linked workspace screen specification.
- [ ] IF-WB-005-AC-02: Confirm board behavior follows its linked screen specification.

### IF-WB-006: Workspace actions

**Description:** Users can preview, cancel, and commit board moves; assign/unassign groups; expand/collapse groups; copy a task ID; choose retained sessions; and show an agent terminal fullscreen. Interactive task surfaces expose task creation, editing, and archival actions.
**Trigger:** User invokes an action on a board, group, task, or agent terminal.
**Preconditions:** Corresponding interactive surface and target are available.
**Behavior:** Expose and perform each listed action, including task create/edit/archive on interactive task surfaces.
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
**Behavior:** Search help entries; allow shortcut customization; reject a binding that conflicts with a working binding.
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
**Behavior:** Keep footer actions complete for current focus and help actions complete for the workspace.
**Outcome:** Available actions are discoverable in the appropriate listing.
**Failures:** None specified.
**Acceptance Criteria:**
- [ ] IF-WB-008-AC-01: For each focus state, confirm the footer lists every action available for that focus and no available action is omitted.
- [ ] IF-WB-008-AC-02: Confirm help lists all available actions, including actions not shown in the current-focus footer.

## Flows

### Switch workspace views

**Trigger:** User selects grouped-list or board view.
**Preconditions:** Workspace is open.
**Flow:** Display tasks in selected view; allow switching without losing task organization.
**Outcome:** Selected view is displayed with organization preserved.

### Move a board task

**Trigger:** User initiates a board move.
**Preconditions:** Board is open and task can be moved.
**Flow:** Preview proposed move; user cancels or commits; cancellation leaves task in place and commit places it at destination.
**Outcome:** Task is unchanged after cancellation or in chosen destination after commit.

### Delete a populated group

**Trigger:** User requests deletion of a populated group.
**Preconditions:** Group contains tasks or child groups.
**Flow:** User selects destination, including root/ungrouped placement; application removes group and places contents there.
**Outcome:** Group is deleted and contents remain at chosen destination.

### Restore workspace state

**Trigger:** User reopens workspace.
**Preconditions:** Workspace state was saved.
**Flow:** Restore filters, task/mode selection, details visibility, shortcut overrides, group membership, collapsed groups, and independent per-task mode selection.
**Outcome:** Workspace reflects saved state.

## Failure/Recovery

| Condition | Required Behavior |
|---|---|
| User cancels a previewed board move | Leave task in its original position. |
| Deleted group contains tasks or nested groups | Preserve all contents and let user select destination, including root/ungrouped. |
| Shortcut assignment conflicts with a working binding | Reject assignment and retain working binding. |

## Acceptance Criteria

Acceptance criteria are listed under every requirement above: IF-WB-001 (2), IF-WB-002 (1), IF-WB-003 (2), IF-WB-004 (2), IF-WB-005 (2), IF-WB-006 (7), IF-WB-007 (3), IF-WB-008 (2). Total: 21 criteria.

## Open Questions

None recorded.
