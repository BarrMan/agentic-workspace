# Product Specification: Supported Integration Operations

## Overview

Provide agents inside sessions and external applications with a selective public CLI API for supported integration operations, without automatically duplicating every internal setting or TUI action.

## Features

| Feature | Description | Contract |
|---|---|---|
| Supported Integration Operations | Use the explicitly supported selective CLI operations. | [Supported Integration Operations](#supported-integration-operations) |

## Feature Contracts

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
| IF-API-006 | The CLI must provide cross-record search with filters and plain-text or JSON output as defined in [Filtering and search](filtering-and-search.md#filtering-and-search). |
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
- The product is TUI-first, and the CLI is a selective integration API rather than an automatic duplicate of all UI actions or internal settings.

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

## Open Product Decisions

| Decision | Affected Features | Status |
|---|---|---|
| MCP retention; `agent-session ask` eligibility; and further CLI entry points, options, aliases, conveniences, and exact convenience API removals. | Supported Integration Operations | Open |
