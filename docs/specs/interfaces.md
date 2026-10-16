# Product Specification: AgenticWorkspace Interfaces

## Overview

This contract defines the TUI workspace and board, filtering and search, session interaction and feedback, and the selective CLI integration API. The product is TUI-first; files remain openly accessible and editable under the [configuration contract](configuration.md#configuration-and-modes).

## Features

| Feature | Description | Contract |
|---|---|---|
| Workspace and board | Browse and organize project tasks through grouped-list and status-column views. | [Workspace and board](#workspace-and-board) |
| Filtering and search | Filter workspace tasks and search across project records. | [Filtering and search](#filtering-and-search) |
| Session interaction and feedback | Select, observe, start, resume, and identify task sessions in the workspace. | [Session interaction and feedback](#session-interaction-and-feedback) |
| Supported integration operations | Use the explicitly supported selective CLI operations. | [Supported integration operations](#supported-integration-operations) |

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
| IF-WB-006 | Users must be able to preview, cancel, and commit board moves; assign and unassign groups; expand and collapse groups; copy a task ID; choose retained sessions; and show an agent terminal fullscreen. |
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

#### Acceptance Criteria

- [ ] Open the workspace, switch between grouped-list and board views, and confirm both display project tasks.
- [ ] Preview then cancel a board move and confirm the task remains in its original position; commit another move and confirm it appears in the destination.
- [ ] Delete a group containing tasks and child groups, choose root placement, and confirm all contents remain at root.
- [ ] Reopen a workspace with saved state and confirm each listed state value, including per-task mode selection, is restored.
- [ ] Assign a shortcut already bound to a working action and confirm the conflict is rejected and the prior binding remains active.

#### Open Decisions

| Question | Constraints | Status |
|---|---|---|

### Filtering and search

#### Purpose

Let users narrow the workspace task list and find records across project tasks, documents, and decision records.

#### Requirements

| ID | Requirement |
|---|---|
| IF-FS-001 | Task filters must support text, status, type, priority, milestone, and label. The interface must show a filter summary and provide clear/reset actions. Filter scope is defined by the project directory. |
| IF-FS-002 | Cross-record search must span tasks, documents, and decision records and support filters and plain-text or JSON output. Task fields must follow the [task model](tasks.md#tasks-and-storage), with scope defined by the project directory. |
| IF-FS-003 | Cross-record search must not imply support for filter combinations, matching details, or output formats beyond those explicitly supported by the implementation contract; these unresolved dimensions are listed under Open Decisions. |

#### Behavioral Flows

##### Filter workspace tasks

**Trigger:** The user enters or changes a task filter.

**Preconditions:** The workspace is open in a project directory.

**Flow:**

1. The user specifies one or more supported filter dimensions: text, status, type, priority, milestone, or label.
2. The application limits the filtered task set to the project directory and displays a summary of the active filters.
3. The user clears or resets filters, and the application removes the active filter constraints.

**Postconditions:** The workspace displays tasks matching active filters, or the unfiltered project task set after clear/reset.

##### Search project records

**Trigger:** The user or integration submits a cross-record search.

**Preconditions:** A project directory is available.

**Flow:**

1. The search evaluates tasks, documents, and decision records within the project scope.
2. The caller may request filters and plain-text or JSON output.
3. Results use task fields defined by the task model.

**Postconditions:** The result contains matching records in the requested supported output format.

#### Edge Cases and Failures

| Condition | Expected Behavior |
|---|---|
| The user clears or resets task filters. | Active constraints are removed and the project-scoped task set is shown. |
| A search request asks for filter combinations, matching details, or output formats whose support is not settled. | No support beyond the approved filter and plain/JSON output contract is implied; see Open Decisions. |
| Records exist outside the selected project directory. | They are outside the search and task-filter scope. |

#### Behavioral Invariants

- Task-filter and cross-record search scope is the project directory.
- Cross-record search covers tasks, documents, and decision records.
- Task search fields follow the task model rather than an independent field definition.

#### Acceptance Criteria

- [ ] Apply each supported task-filter dimension and confirm the visible task set and filter summary are project-scoped.
- [ ] Clear/reset active task filters and confirm the project task set is no longer constrained by them.
- [ ] Search across a project containing tasks, documents, and decision records and confirm both plain-text and JSON output are available.
- [ ] Confirm records outside the project directory are excluded.

#### Open Decisions

| Question | Constraints | Status |
|---|---|---|
| Which filter combinations, matching details, and additional output formats should cross-record search support? | Current contract guarantees filters and plain-text or JSON output only; task fields follow the task model and scope is project-local. | Open |

### Session interaction and feedback

#### Purpose

Let users inspect the selected task's session, safely attach to or resume it, and understand the selected session's identity, execution context, and state.

#### Requirements

| ID | Requirement |
|---|---|
| IF-SI-001 | Selecting a task must show the active session for its selected mode. Selecting a running session must only attach: it must send no input and change no control state. |
| IF-SI-002 | Resuming a stopped session must follow the [exact-conversation contract](sessions.md#stop-and-resume-a-session). A starting session must remain unavailable until [startup completion](sessions.md#starting-a-session): provider initialization and identity establishment, plus supported acknowledgment of initial instruction submission (not an answer). |
| IF-SI-003 | The selected-session presentation must identify the session and its actual execution context according to the [session-header contract](../screens/workspace.md#ordered-regions). The workspace screen owns its composition and visibility; the [session/artifact screen](../screens/sessions-artifacts.md) owns picker and file-view composition. |
| IF-SI-004 | If the selected mode has no session, the body must say so and the footer must offer the start shortcut. |
| IF-SI-005 | If a session has ended, the body must prompt resume and identify the session-picker shortcut. |
| IF-SI-006 | The no-session and ended-session initial displays must be available immediately on application startup without requiring a keypress. |
| IF-SI-007 | A task row must show one dot for an active session in the selected mode only when activity evidence exists. It must show no dot when there is no activity evidence or no active session in that mode. The indicator must reflect observed state, not a saved historical lifecycle label, and use the [design-system status/activity colors](../DESIGN-SYSTEM.md#status-and-activity). |

#### Behavioral Flows

##### Select and attach to a running session

**Trigger:** The user selects a task with a running session in the selected mode.

**Preconditions:** The task has a running session.

**Flow:**

1. The application shows that active session and identifies its session and actual execution context.
2. Selecting the running session attaches the user without sending input or changing control.

**Postconditions:** The user is attached to the running session, with its input and control state unchanged by selection.

##### Start or resume a session

**Trigger:** The user invokes start for a mode with no session, or resume for an ended/stopped session.

**Preconditions:** The selected task and mode are available.

**Flow:**

1. With no session, the body identifies the absence and the footer offers the start shortcut; with an ended session, the body prompts resume and identifies the picker shortcut.
2. Starting follows the session startup contract; the session remains unavailable until its provider is initialized, identity is established, and supported initial-instruction submission acknowledgment is received (not an answer).
3. Resuming a stopped session follows the exact-conversation contract.

**Postconditions:** A starting session is unavailable until startup completion; a resumed session follows the exact-conversation contract.

##### Display session activity

**Trigger:** The application displays a task row.

**Preconditions:** The task has a selected mode.

**Flow:**

1. The application checks observed activity evidence for an active session in that mode.
2. It displays one dot when such evidence exists and no dot otherwise; it does not derive the indicator from a saved historical lifecycle label.

**Postconditions:** The row's dot represents observed activity for the selected mode.

#### Edge Cases and Failures

| Condition | Expected Behavior |
|---|---|
| The selected mode has no session at startup. | Immediately show the no-session body and start shortcut without requiring a keypress. |
| The selected session has ended. | Immediately show the resume prompt and session-picker shortcut without requiring a keypress. |
| A session is starting but startup completion conditions are not all met. | Keep the session unavailable. |
| A running session is selected. | Attach only; send no input and do not change control. |
| There is no activity evidence or no active session for the selected mode. | Show no activity dot. |
| A saved historical lifecycle label conflicts with observed activity. | Use observed activity, not the saved label, for the dot. |

#### Behavioral Invariants

- Selecting a running session is observational and does not submit input or change control.
- A starting session is unavailable until startup completion.
- The activity dot describes observed activity in the selected mode, never merely a saved historical lifecycle label.

#### Acceptance Criteria

- [ ] Select a running session and confirm it attaches without sending input or changing control.
- [ ] Start a session and confirm it remains unavailable until all startup-completion conditions are met.
- [ ] Select a stopped session and confirm resume follows the exact-conversation contract.
- [ ] Launch with no session and with an ended session in turn; confirm each correct body/footer state appears without a keypress.
- [ ] Compare active-session activity evidence against absent evidence and historical labels; confirm exactly one dot is shown only for observed active activity in the selected mode.

#### Open Decisions

| Question | Constraints | Status |

### Supported Integration Operations

#### Purpose

Provide agents inside sessions and external applications with a selective public CLI API for supported integration operations, without automatically duplicating every internal setting or TUI action.

#### Requirements

| ID | Requirement |
|---|---|
| IF-API-001 | The CLI must support creating a project-scoped task under the [task model](tasks.md#tasks-and-storage). |
| IF-API-002 | The CLI must let the calling session mark its current task Done using the [status-only Done action](tasks.md#launching-work-and-completing-a-task). |
| IF-API-003 | The CLI must start a session using the same [launch semantics](sessions.md#starting-a-session) as the workspace. |
| IF-API-004 | An agent may set task/mode approval in response to user direction, following [mode approval](configuration.md#configuration-and-modes). |
| IF-API-005 | The CLI must list, read, and write generic files in a task's [artifacts directory](tasks.md#using-task-artifacts). A write replaces selected contents from a file or standard input. |
| IF-API-006 | The CLI must provide cross-record search with filters and plain-text or JSON output as defined in [Filtering and search](#filtering-and-search). |
| IF-API-007 | `agent-session ask` must ask a retained session a question and return its answer using current effective configuration. This is a question/answer interaction, not retrieval of a terminal transcript. |
| IF-API-008 | `doc create/update/list/search/view` must create, update, list, search, and view project documents. |
| IF-API-009 | `decision create/list` must create and list decision records. |
| IF-API-010 | `agent-config model set` must set the calling session's mode model in project configuration to the model that session currently uses, independently of provider. |
| IF-API-011 | The CLI must not support `agent-session reset`, board export (including Markdown export and README editing), or `--no-git`. The `doctor` command, including report-only variants, is not supported. |
| IF-API-012 | List/search collection reads must skip malformed records, warn on CLI stderr with the filename and parse error, and return readable results successfully with exit code 0. An operation directly targeting malformed data must fail. This requirement does not define a non-CLI warning representation. |
| IF-API-013 | TUI capabilities not specified as CLI operations in this contract do not thereby become CLI operations. Session actions, milestone management, and other TUI capabilities remain governed by their feature contracts. |

#### Behavioral Flows

##### Create and complete a task through the CLI

**Trigger:** A caller requests task creation or marks its current task Done.

**Preconditions:** The project scope is available; marking Done is invoked by the calling session for its current task.

**Flow:**

1. Task creation produces a project-scoped task conforming to the task model.
2. Marking the calling session's current task Done performs the status-only Done action.

**Postconditions:** The created task is project-scoped; the Done operation changes the task status without exceeding the status-only contract.

##### Start a session through the CLI

**Trigger:** A caller requests session start through the CLI.

**Preconditions:** The task and mode are available for session launch.

**Flow:**

1. The CLI starts the session using the same launch semantics as the workspace.

**Postconditions:** The session launch follows the workspace launch contract.

##### Read and write task artifacts

**Trigger:** A caller lists, reads, or writes task artifacts.

**Preconditions:** The target task's artifacts directory is available.

**Flow:**

1. List and read operate on generic files within that directory.
2. A write takes contents from a file or standard input and replaces the selected contents.

**Postconditions:** The requested artifact operation is completed within the task's artifacts directory.

##### Set task/mode approval and model

**Trigger:** An agent acts on user direction to set approval, or the calling session requests its model be recorded.

**Preconditions:** The relevant task/mode and project configuration are available; approval changes are made in response to user direction.

**Flow:**

1. The agent sets task/mode approval according to the [mode approval contract](configuration.md#configuration-and-modes).
2. `agent-config model set` records the calling session's current model for its mode in project configuration, independently of provider.

**Postconditions:** Approval follows the mode-approval contract, and the mode model matches the calling session's current model.

##### Manage project documents and decisions

**Trigger:** A caller requests a document or decision-record operation.

**Preconditions:** The project directory is available.

**Flow:**

1. `doc create/update/list/search/view` creates, updates, lists, searches, or views project documents as requested.
2. `decision create/list` creates or lists decision records as requested.

**Postconditions:** The requested project document or decision-record operation is completed.

##### Ask a retained session

**Trigger:** A caller invokes `agent-session ask` for a retained session.

**Preconditions:** A retained session and effective configuration are available; eligibility conditions remain unresolved.

**Flow:**

1. The operation sends a question/answer interaction using current effective configuration.
2. It returns the answer and does not represent terminal transcript retrieval.

**Postconditions:** The caller receives the session's answer, subject to the unresolved eligibility decision.

##### Tolerate malformed records in collection reads

**Trigger:** A list/search collection read encounters a malformed record.

**Preconditions:** The operation is a list/search collection read, not a direct operation targeting the malformed record.

**Flow:**

1. The CLI skips the malformed record and writes its filename and parse error to stderr.
2. It returns readable results with exit code 0.

**Postconditions:** Readable collection results are returned successfully and the malformed record is reported on CLI stderr.

#### Edge Cases and Failures

| Condition | Expected Behavior |
|---|---|
| A list/search collection read encounters malformed data. | Skip the malformed record, warn on CLI stderr with filename and parse error, and return readable results with exit code 0. |
| An operation directly targets malformed data. | The operation fails. |
| `agent-session ask` is requested for a session whose eligibility is unsettled. | No stopped-only restriction or permission to ask a running session is established; behavior remains an open decision. |
| A caller requests reset, board export, `--no-git`, or `doctor` (including report-only variants). | The operation is unsupported. |
| A caller requests an additional command surface, option, alias, or integration convenience not listed here. | Its support is not established by this contract; see Open Decisions. |

#### Behavioral Invariants

- CLI operations are selective and do not automatically duplicate every TUI action or internal setting.
- Marking the calling session's current task Done is status-only.
- Session start through CLI follows workspace launch semantics.
- A question asked of a retained session is not terminal transcript retrieval.
- Malformed collection records do not prevent successful return of other readable results; direct operations targeting malformed data fail.
- Rejected command surfaces remain unsupported.

#### Acceptance Criteria

- [ ] Invoke every operation listed in the requirements and confirm it produces the result defined by its linked feature contract and operation description.
- [ ] Create a task through the CLI and confirm it is project-scoped and conforms to the task model.
- [ ] Mark the calling session's current task Done and confirm the operation is status-only.
- [ ] Start a session through CLI and workspace and confirm both use the same launch semantics.
- [ ] Write an artifact from a file and from standard input and confirm each replaces the selected contents in the task artifacts directory.
- [ ] Ask a retained session a question and confirm an answer is returned as a question/answer interaction, not a terminal transcript.
- [ ] Include malformed and readable records in a collection read and confirm malformed records are skipped, stderr includes filename and parse error, readable results return with exit code 0, and a direct operation on malformed data fails.
- [ ] Request each explicitly unsupported command surface and confirm it is not available.

#### Open Decisions

| Question | Constraints | Status |
|---|---|---|
| Should MCP integration be retained, given its integration benefit and maintenance overhead? | No named-client prerequisite is established; MCP is not added to the supported operation list until retention is decided. | Open |
| Under what session states and consent conditions may `agent-session ask` operate? | It asks a question and returns an answer using current effective configuration; it is not transcript retrieval. Neither a stopped-only restriction nor permission to ask a running session is established. | Open |
| Which additional command entry points, options, aliases, and integration conveniences belong in the public API, and which exact convenience API removals are required? | The listed operations are the approved baseline; additional surfaces and syntax are not implied. Setup/guidance, instruction-file editing, shell conveniences, broad configuration APIs, and archive alongside completion are not approved by this contract. | Open |

## Global Behavioral Invariants

- The product is TUI-first, and the CLI is a selective integration API rather than an automatic duplicate of all UI actions or internal settings.
- [Screen specifications](../screens/README.md) own screen composition; the [design system](../DESIGN-SYSTEM.md) owns shared visual rules. Interface behavior remains defined by this contract and its linked feature contracts.

## Open Product Decisions

| Decision | Affected Features | Status |
|---|---|---|
| Search filter combinations, matching details, and additional output formats. | Filtering and search | Open |
| MCP retention; `agent-session ask` eligibility; and further CLI entry points, options, aliases, conveniences, and exact convenience API removals. | Supported Integration Operations | Open |
