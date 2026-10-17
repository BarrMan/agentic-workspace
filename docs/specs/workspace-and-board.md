# Product Specification: Workspace and board

## Overview

Let users inspect and organize project tasks in a grouped workspace list or a status-column board.

## Features

| Feature | Description | Contract |
|---|---|---|
| Workspace and board | Browse and organize project tasks through grouped-list and status-column views. | [Workspace and board](#workspace-and-board) |

## Feature Contracts

### Workspace and board

#### Purpose

Let users inspect and organize project tasks in a grouped workspace list or a status-column board.

#### Requirements

| ID | Requirement |
|---|---|
| IF-WB-001 | The workspace must show project tasks in one grouped list and provide a separate status-column board. Users must be able to switch between these views. |
| IF-WB-002 | Groups must be able to contain tasks and nested groups. |
| IF-WB-003 | When a populated group is deleted, its tasks and child groups must be preserved, and the user must be able to choose their destination, including ungrouped/root placement. |
| IF-WB-004 | Reopening the workspace must restore filters, task and mode selection, details visibility, shortcut overrides, group membership, and collapsed groups. Mode selection must be remembered separately for each task, as defined by [configuration](configuration.md#configuration-and-modes). |
| IF-WB-005 | The grouped list must follow the [workspace screen's task-list width and composition](../screens/workspace.md#ordered-regions). The board must follow its [screen specification](../screens/board.md). |
| IF-WB-006 | Users must be able to preview, cancel, and commit board moves; assign and unassign groups; expand and collapse groups; copy a task ID; choose retained sessions; and show an agent terminal fullscreen. Interactive task surfaces expose task creation, editing, and archival actions. |
| IF-WB-007 | Help must be searchable and keyboard shortcuts customizable. A conflicting shortcut assignment must be rejected while the working binding is retained. |
| IF-WB-008 | The footer must show every action available for the current focus. Help must show all available actions. |

#### Behavioral Flows

##### Switch workspace views

**Trigger:** The user selects the grouped-list or board view.

**Preconditions:** The workspace is open.

**Flow:**

1. The application displays project tasks in the selected view.
2. The user can switch to the other view without losing the task organization represented by the workspace.

**Postconditions:** The selected view is displayed.

##### Move a board task

**Trigger:** The user initiates a board move.

**Preconditions:** The board is open and a task can be moved.

**Flow:**

1. The application previews the proposed move.
2. The user either cancels or commits the move.
3. On cancellation, the task remains in its original position; on commit, the task appears in the destination position.

**Postconditions:** The task is unchanged after cancellation or is in the chosen destination after commit.

##### Delete a populated group

**Trigger:** The user requests deletion of a populated group.

**Preconditions:** The group contains tasks or child groups.

**Flow:**

1. The application lets the user select a destination for the group's tasks and child groups, including ungrouped/root placement.
2. The application removes the group and places its contents at the selected destination.

**Postconditions:** The group is deleted and its tasks and child groups remain available at the chosen destination.

##### Restore workspace state

**Trigger:** The user reopens the workspace.

**Preconditions:** Workspace state was previously saved.

**Flow:**

1. The application restores the saved filters, task and mode selection, details visibility, shortcut overrides, group membership, and collapsed groups.
2. The application restores the selected mode for the selected task independently of other tasks.

**Postconditions:** The reopened workspace reflects its saved state.

#### Edge Cases and Failures

| Condition | Expected Behavior |
|---|---|
| The user cancels a previewed board move. | The task remains in its original position. |
| A group being deleted contains tasks or nested groups. | No contents are discarded; the user selects their destination, including root/ungrouped placement. |
| A shortcut assignment conflicts with a working binding. | Reject the conflicting assignment and retain the working binding. |

#### Behavioral Invariants

- Switching views does not turn deletion of a populated group into deletion of its contents.
- A canceled board move does not change the task's position.
- A rejected shortcut conflict does not replace the working binding.
- [Screen specifications](../screens/README.md) own screen composition; the [design system](../DESIGN-SYSTEM.md) owns shared visual rules. Interface behavior remains defined by this contract and its linked feature contracts.

#### Acceptance Criteria

- [ ] Open the workspace, switch between grouped-list and board views, and confirm both display project tasks.
- [ ] Preview then cancel a board move and confirm the task remains in its original position; commit another move and confirm it appears in the destination.
- [ ] Delete a group containing tasks and child groups, choose root placement, and confirm all contents remain at root.
- [ ] Reopen a workspace with saved state and confirm each listed state value, including per-task mode selection, is restored.
- [ ] Assign a shortcut already bound to a working action and confirm the conflict is rejected and the prior binding remains active.

#### Open Decisions

| Question | Constraints | Status |
|---|---|---|

## Global Behavioral Invariants

- [Screen specifications](../screens/README.md) own screen composition; the [design system](../DESIGN-SYSTEM.md) owns shared visual rules. Interface behavior remains defined by this contract and its linked feature contracts.

## Open Product Decisions

| Decision | Affected Features | Status |
|---|---|---|
