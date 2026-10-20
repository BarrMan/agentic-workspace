# Product Requirements: Supported Integration Operations

## Overview

Provide agents inside sessions and external applications with a selective public CLI API for supported integration operations, without automatically duplicating every internal setting or TUI action. The CLI is an integration convenience; configuration and data files remain openly accessible and editable.

## Goals

- Provide the approved operations while preserving the behavior defined by their feature contracts.
- Keep the CLI selective rather than duplicating every TUI action or internal setting.

## Scope

### In Scope

- The supported integration API operations enumerated under [Supported Integration Operations](#supported-integration-operations).
- Launching the TUI with `agentic-workspace workspace` as the user entry point. This is not an integration operation and does not expand the integration API.

### Out of Scope

- `agent-config init` and CLI setup.
- Named guides and instruction-file editing.
- Board export, including Markdown export and README editing.
- `agent-session reset`.
- Plural aliases, removed commands, age-based batch cleanup, and interactive screen-launch commands other than the user entry point `workspace`.
- `--no-git`.
- Any operation or option not listed in the exhaustive inventory under [Supported Integration Operations](#supported-integration-operations). TUI capabilities not specified there do not thereby become CLI operations.

## Actors

| Actor | Description |
|---|---|
| Agent in a session | Uses supported integration operations in the context of its current session. |
| External application | Calls supported CLI operations for project integration. |
| User | Directs approval changes and determines workflow. |

## Functional Requirements

### IF-API-001: Create a project-scoped task

**Description:** The CLI must support creating a task scoped to the project directory and conforming to the [task model](tasks.md#functional-requirements).

**Trigger:** A caller requests task creation.

**Preconditions:** The project scope is available.

**Behavior:**
1. Create a task directly under the task model.
2. Do not require an agent-session argument for task creation.

**Outcome:** A project-scoped task is created.

**Failures:** Follow the task-model contract; do not create a task outside the project scope.

**Acceptance Criteria:**
- A task created through the CLI is project-scoped and conforms to the task model.

### IF-API-002: Mark the current task Done

**Description:** The CLI must let the calling session mark its current task Done using the [status-only Done action](tasks.md#task-013-done-and-completion).

**Trigger:** The calling session marks its current task Done.

**Preconditions:** The operation is invoked by a session for its current task.

**Behavior:**
1. Change only the current task's status to Done.
2. Do not perform completion or cleanup effects as part of this action.

**Outcome:** The task status is Done and other completion/cleanup effects are not performed by this action.

**Failures:** Follow the task completion contract.

**Acceptance Criteria:**
- Marking the calling session's current task Done changes only its status.

### IF-API-003: Start a session

**Description:** The CLI must start a session using the same launch semantics as the workspace; see [session startup](sessions.md#session-004-start-consistently-across-surfaces).

**Trigger:** A caller requests session start.

**Preconditions:** The task and mode are available for session launch.

**Behavior:**
1. Start the session with workspace launch semantics.

**Outcome:** The session launch follows the workspace launch contract.

**Failures:** Follow the session startup contract.

**Acceptance Criteria:**
- Starting through the CLI and workspace uses the same launch semantics.

### IF-API-004: Set task/mode approval

**Description:** An agent may set task/mode approval in response to user direction, following [mode approval](configuration.md#functional-requirements).

**Trigger:** An agent acts on user direction to set approval.

**Preconditions:** The relevant task and mode are available, and the change is in response to user direction.

**Behavior:**
1. Set approval for the specified task and mode under the mode-approval contract.

**Outcome:** The specified task/mode approval reflects the requested change.

**Failures:** Follow the mode-approval contract; finishing work alone does not grant approval.

**Acceptance Criteria:**
- An agent can set approval in response to user direction, scoped to the specified task and mode.

### IF-API-005: Operate on task artifacts

**Description:** The CLI must list, read, and write generic files in a task's [artifacts directory](tasks.md#task-009-artifact-file-operations). A write replaces selected contents supplied from a file or standard input.

**Trigger:** A caller lists, reads, or writes task artifacts.

**Preconditions:** The target task's artifacts directory is available; a write has contents from a file or standard input.

**Behavior:**
1. List and read generic files within the target task's artifacts directory.
2. For writes, replace the selected contents with contents supplied from a file or standard input.

**Outcome:** The requested artifact operation applies within the task's artifacts directory.

**Failures:** Follow the task-artifact contract, including its path constraints.

**Acceptance Criteria:**
- List and read operate on the target task's artifacts directory.
- Writing from a file and from standard input replaces the selected contents in that directory.

### IF-API-006: Search project tasks

**Description:** The CLI must provide task search with filters and plain-text or JSON output as defined by [Filtering and search](filtering-and-search.md#product-requirements-filtering-and-search).

**Trigger:** A caller submits a task search.

**Preconditions:** A project directory is available.

**Behavior:**
1. Search project tasks within the project scope.
2. Follow the search contract for matching, filters, archived records, and output formats.
3. Do not support pagination, regex, or fuzzy ranking.

**Outcome:** Matching tasks are returned in plain text or JSON.

**Failures:** Follow the filtering-and-search contract.

**Acceptance Criteria:**
- Search covers project tasks and supports plain-text and JSON output.
- Search behavior follows the linked contract, including its exclusion of pagination, regex, and fuzzy ranking.

### IF-API-007: Ask a retained session

**Description:** `agent-session ask` sends one message to the previous session in the current mode and waits for its response, returned as a question/answer result. Sending a message to a saved session starts the execution bound to that conversation; there is no separate resume step or session-state eligibility policy.

**Trigger:** A caller asks the previous saved session in the current mode.

**Preconditions:** A previous saved session in the current mode and effective configuration are available.

**Behavior:**
1. Send one message to the previous saved session in the current mode.
2. Start the execution bound to that conversation as needed.
3. Wait for the response and return it as a question/answer result, not a terminal transcript.

**Outcome:** The caller receives the response as a question/answer result.

**Failures:** If no previous saved session exists in the current mode, fail and report that; do not start an execution or modify a session, and exit nonzero. If the answer fails or is interrupted, fail and report that no answer was returned; exit nonzero. The sent message and any execution effects already completed are not rolled back.

**Acceptance Criteria:**
- Asking a retained session sends one message and returns its response as a question/answer result.
- Sending to a saved session starts execution bound to that conversation when needed.
- With no previous saved session in the current mode, the call reports failure, starts no execution, makes no session changes, and exits nonzero.
- If answering fails or is interrupted, the call reports failure without returning an answer and exits nonzero; already completed message/execution effects are not rolled back.

### IF-API-010: Set the calling session's model

**Description:** The CLI must set the calling session's mode model in project configuration to the opaque model ID that session currently uses, independently of provider. The workspace does not impose a model-ID character grammar; provider availability and errors remain governed by [CONFIG-010](configuration.md#config-010-model-discovery-and-availability).

**Trigger:** The calling session requests that its current model be recorded for its mode.

**Preconditions:** The calling session's mode and project configuration are available.

**Behavior:**
1. Record the opaque model ID currently used by the calling session for its mode in project configuration without local character-grammar validation.

**Outcome:** The mode model in project configuration matches the calling session's current model, independent of provider.

**Failures:** The operation fails if the project configuration cannot be updated; it must not record a different model.

**Acceptance Criteria:**
- The recorded mode model equals the calling session's current opaque model ID, independently of provider, without local character-grammar validation; provider availability and errors remain reported under CONFIG-010.

### IF-API-011: Exclude unsupported operations

**Description:** The CLI must not support `agent-session reset`, board export (including Markdown export and README editing), or `--no-git`.

**Trigger:** A caller requests one of these unsupported surfaces.

**Preconditions:** None.

**Behavior:**
1. Do not expose the requested operation or option as supported.

**Outcome:** Reset, board export, and `--no-git` remain unsupported.

**Failures:** None.

**Acceptance Criteria:**
- Each explicitly excluded operation and option is unavailable as a supported CLI surface.

### IF-API-012: Handle malformed records in collection reads

**Description:** List/search collection reads must skip malformed records, warn on CLI stderr with the filename and parse error, and return readable results successfully with exit code 0. An operation directly targeting malformed data must fail. This requirement does not define a non-CLI warning representation.

**Trigger:** A list/search collection read or direct operation encounters malformed data.

**Preconditions:** The collection or directly targeted record is read by a CLI operation.

**Behavior:**
1. For collection reads, skip each malformed record.
2. Write the malformed filename and parse error to CLI stderr.
3. Return readable results successfully with exit code 0.
4. Fail a direct operation targeting malformed data.

**Outcome:** Collection reads with readable results exit successfully with code 0; direct operations on malformed data fail.

**Failures:** Direct operations targeting malformed data fail.

**Acceptance Criteria:**
- A collection containing malformed and readable records returns readable results with exit code 0 and reports each malformed filename and parse error on CLI stderr.
- A direct operation targeting malformed data fails.

### IF-API-013: Exclude additional CLI surfaces

**Description:** CLI setup, removed commands, plural aliases, age-based batch cleanup, and interactive screen launching are unsupported. TUI capabilities not specified as CLI operations here do not thereby become CLI operations.

**Trigger:** A caller requests an excluded CLI surface or an operation not in the approved inventory.

**Preconditions:** None.

**Behavior:**
1. Do not expose unsupported surfaces.
2. Do not infer CLI operations from TUI capabilities.

**Outcome:** The CLI remains limited to the approved inventory.

**Failures:** None.

**Acceptance Criteria:**
- CLI setup, removed commands, plural aliases, age-based batch cleanup, interactive screen launching, and unspecified TUI capabilities are not supported CLI operations.

## States and Transitions

### Integration operation lifecycle

**States:** None.

**Transitions:** None.

**Invariants:** None.

## User Interactions

### Integration operation request

**Context:** An agent in a session or external application uses the CLI.

**Action:** The caller requests an operation from the approved inventory.

**Response:** The CLI performs the requested operation according to this contract and its linked feature contract.

**Feedback:** Collection reads encountering malformed records report the filename and parse error on CLI stderr while returning readable results successfully; other outcomes follow the linked contract.

## External Behavior

### Supported Integration Operations

**Purpose:** Allow agents and external applications to perform the approved selective integration operations. The inventory below governs the integration API; launching the TUI with `agentic-workspace workspace` is the user entry point, not an integration operation.

**Inputs:** Requests for exactly these supported operations, scoped to the relevant project, task, session, or configuration:
- Create a project-scoped task (IF-API-001; [task model](tasks.md#functional-requirements)).
- List and view tasks through the CLI, and edit an existing task by replacing its title and description ([task operations](tasks.md#functional-requirements)).
- Mark the calling session's current task Done using the status-only action (IF-API-002; [task completion](tasks.md#task-013-done-and-completion)).
- Start a session using workspace launch semantics (IF-API-003; [session startup](sessions.md#session-004-start-consistently-across-surfaces)).
- Set task/mode approval in response to user direction (IF-API-004; [mode approval](configuration.md#functional-requirements)).
- List, read, and write generic files in a task's artifacts directory; writes replace selected contents from a file or standard input (IF-API-005; [task artifacts](tasks.md#task-009-artifact-file-operations)).
- Search project tasks with filters and plain-text or JSON output, subject to [filtering and search](filtering-and-search.md#product-requirements-filtering-and-search) (IF-API-006).
- Ask the previous saved session in the current mode one message and wait for its response as a question/answer result (IF-API-007; [ask operation](sessions.md#session-004-start-consistently-across-surfaces)). Sending to a saved session starts the execution bound to that conversation; there is no separate resume step or session-state eligibility policy.
- Set the calling session's current model for its mode in project configuration, independently of provider (IF-API-010).

The inventory is exhaustive. Unsupported inputs include `agent-config init` and CLI setup; named guides and instruction-file editing; board export, including Markdown export and README editing; `agent-session reset`; plural aliases; removed commands; age-based batch cleanup; interactive screen-launch commands other than the user entry point `workspace`; and `--no-git`. Any operation or option not listed as supported is unsupported. TUI capabilities not specified here do not thereby become CLI operations.

**Outputs:** Operation results as defined here and in linked feature contracts. Search output is plain text or JSON only.

**Failures:** Follow [Error Handling](../CONVENTIONS.md#error-handling) and the applicable requirement and linked feature contract. Malformed collection records are skipped and reported on CLI stderr; direct operations targeting malformed data fail. Unsupported requests remain unsupported.

## Non-Functional Requirements

### Performance

- None.

### Reliability

- Collection reads that encounter malformed records still return readable results successfully, as specified in IF-API-012.

### Security

- None.

### Compatibility

- Configuration and data files remain openly accessible and editable; the public API is an integration convenience, not an exclusive access boundary.

## Edge Cases

| Condition | Required Behavior |
|---|---|
| A list/search collection read encounters malformed data. | Skip the malformed record, warn on CLI stderr with filename and parse error, and return readable results with exit code 0. |
| An operation directly targets malformed data. | The operation fails. |
| `agent-session ask` has no previous saved session in the current mode. | Fail and report that no previous session exists; start no execution, modify no session, and exit nonzero. |
| The answer to `agent-session ask` fails or is interrupted. | Fail and report that no answer was returned; exit nonzero. Do not roll back the sent message or execution effects already completed. |
| `agent-session ask` targets the previous saved session in the current mode. | Send one message, start the execution bound to that conversation if needed, wait, and return the response as a question/answer result. |
| A caller requests `agent-session reset`, board export, or `--no-git`. | The operation is unsupported. |
| A caller requests `agent-config init`, named guides, instruction-file editing, CLI setup, a removed command, a plural alias, age-based batch cleanup, an interactive screen-launch command other than the user entry point `workspace`, or an operation not in the approved integration inventory. | The integration surface is unsupported. |

## Open Questions

None.
