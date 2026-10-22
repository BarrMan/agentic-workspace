# Product Specification: AgenticWorkspace

## Overview

AgenticWorkspace organizes project tasks, configurable agent work, retained conversations, and live terminal interaction through a TUI-first workspace and selective integration API. [PRODUCT](PRODUCT.md) owns product purpose, vision, users, goals, and scope. This specification and its indexed feature contracts are the authoritative source of intended product behavior. [BLUEPRINT](BLUEPRINT.md) owns technical design; [DESIGN-SYSTEM](DESIGN-SYSTEM.md) and [screen specifications](screens/README.md) own visual rules and screen composition.

## Features

| Feature | Description | Contract |
|---|---|---|
| Tasks and storage | Task model, dependencies, deterministic storage and relocation, artifacts, worktrees, completion, milestones, and task deletion. | [Tasks and storage](specs/tasks.md) |
| Sessions | Session identity and observation; running, parked, and stopped states; explicit start/resume, app-close lifecycle, handoff, running-session limit, terminal lifetime, and session deletion. | [Sessions](specs/sessions.md) |
| Configuration and modes | TUI settings, precedence, dynamic modes, task/mode approval, presets, permissions, models, and mode deletion. | [Configuration and modes](specs/configuration.md) |
| Workspace and board | Browse and organize project tasks through grouped-list and status-column views. | [Workspace and board](specs/workspace-and-board.md) |
| Filtering and search | Filter and search workspace tasks. | [Filtering and search](specs/filtering-and-search.md) |
| Session interaction and feedback | Select and observe sessions; attach to running or parked sessions without changing them, and explicitly start or resume stopped sessions. | [Session interaction and feedback](specs/session-interaction-and-feedback.md) |
| Supported Integration Operations | Use the explicitly supported selective CLI operations. | [Supported Integration Operations](specs/supported-integration-operations.md) |

## Feature Contracts

### Tasks and storage

#### Purpose

Define task organization, persistence, work context, artifacts, completion, milestones, and deletion behavior.

#### Requirements

| ID | Requirement |
|---|---|
| TASK-001–TASK-022 | The complete requirements, flows, edge cases, invariants, and acceptance criteria are in the [Tasks and storage contract](specs/tasks.md). |

#### States and Behavior

See the flows in the [Tasks and storage contract](specs/tasks.md).

#### Edge Cases

See the conditions and required outcomes in the [Tasks and storage contract](specs/tasks.md).

#### Behavioral Invariants

See the invariants in the [Tasks and storage contract](specs/tasks.md).

#### Acceptance Criteria

See the verifiable criteria in the [Tasks and storage contract](specs/tasks.md).

#### Open Decisions

See [Tasks and storage: Open Questions](specs/tasks.md#open-questions).

### Sessions

#### Purpose

Define session states, creation, observation, explicit exact-conversation resume, app-close lifecycle, handoff, live terminal interaction, and deletion of retained agent conversations.

#### Requirements

| ID | Requirement |
|---|---|
| SESSION-001–SESSION-020 | The complete requirements, flows, edge cases, invariants, acceptance criteria, and open decisions are in the [Sessions contract](specs/sessions.md). |

#### States and Behavior

See the flows in the [Sessions contract](specs/sessions.md).

#### Edge Cases

See the conditions and required outcomes in the [Sessions contract](specs/sessions.md).

#### Behavioral Invariants

See the invariants in the [Sessions contract](specs/sessions.md).

#### Acceptance Criteria

See the verifiable criteria in the [Sessions contract](specs/sessions.md).

#### Open Decisions

None recorded in the [Sessions contract](specs/sessions.md).

### Configuration and modes

#### Purpose

Define workspace settings and the configuration, approval, and lifecycle of agent modes.

#### Requirements

| ID | Requirement |
|---|---|
| CONFIG-001–CONFIG-014 | The complete requirements, flows, edge cases, invariants, and acceptance criteria are in the [Configuration and modes contract](specs/configuration.md). |

#### States and Behavior

See the flows in the [Configuration and modes contract](specs/configuration.md).

#### Edge Cases

See the conditions and required outcomes in the [Configuration and modes contract](specs/configuration.md).

#### Behavioral Invariants

See the invariants in the [Configuration and modes contract](specs/configuration.md).

#### Acceptance Criteria

See the verifiable criteria in the [Configuration and modes contract](specs/configuration.md).

#### Open Decisions

None recorded in the [Configuration and modes contract](specs/configuration.md).

### Workspace and board

#### Purpose

Let users inspect and organize project tasks in a grouped workspace list or a status-column board.

#### Requirements

| ID | Requirement |
|---|---|
| IF-WB-001–IF-WB-008 | The complete requirements, flows, edge cases, invariants, and acceptance criteria are in the [Workspace and board contract](specs/workspace-and-board.md). |

#### States and Behavior

See the flows in the [Workspace and board contract](specs/workspace-and-board.md).

#### Edge Cases

See the conditions and required outcomes in the [Workspace and board contract](specs/workspace-and-board.md).

#### Behavioral Invariants

See the invariants in the [Workspace and board contract](specs/workspace-and-board.md).

#### Acceptance Criteria

See the verifiable criteria in the [Workspace and board contract](specs/workspace-and-board.md).

#### Open Decisions

None recorded in the [Workspace and board contract](specs/workspace-and-board.md).

### Filtering and search

#### Purpose

Let users narrow the workspace task list and find project tasks.

#### Requirements

| ID | Requirement |
|---|---|
| IF-FS-001–IF-FS-003 | The complete requirements, flows, edge cases, invariants, acceptance criteria, and open decisions are in the [Filtering and search contract](specs/filtering-and-search.md). |

#### States and Behavior

See the flows in the [Filtering and search contract](specs/filtering-and-search.md).

#### Edge Cases

See the conditions and required outcomes in the [Filtering and search contract](specs/filtering-and-search.md).

#### Behavioral Invariants

See the invariants in the [Filtering and search contract](specs/filtering-and-search.md).

#### Acceptance Criteria

See the verifiable criteria in the [Filtering and search contract](specs/filtering-and-search.md).

#### Open Decisions

None recorded in the [Filtering and search contract](specs/filtering-and-search.md).

### Session interaction and feedback

#### Purpose

Let users inspect a task's session, attach to its live pane when running or parked without changing it, explicitly resume stopped sessions, and understand session identity, execution context, and state.

#### Requirements

| ID | Requirement |
|---|---|
| IF-SI-001–IF-SI-007 | The complete requirements, flows, edge cases, invariants, and acceptance criteria are in the [Session interaction and feedback contract](specs/session-interaction-and-feedback.md). |

#### States and Behavior

See the flows in the [Session interaction and feedback contract](specs/session-interaction-and-feedback.md).

#### Edge Cases

See the conditions and required outcomes in the [Session interaction and feedback contract](specs/session-interaction-and-feedback.md).

#### Behavioral Invariants

See the invariants in the [Session interaction and feedback contract](specs/session-interaction-and-feedback.md).

#### Acceptance Criteria

See the verifiable criteria in the [Session interaction and feedback contract](specs/session-interaction-and-feedback.md).

#### Open Decisions

None recorded in the [Session interaction and feedback contract](specs/session-interaction-and-feedback.md).

### Supported Integration Operations

#### Purpose

Provide agents inside sessions and external applications with a selective public CLI API for supported integration operations, without automatically duplicating every internal setting or TUI action.

#### Requirements

| ID | Requirement |
|---|---|
| IF-API-001–IF-API-013 | The complete requirements, flows, edge cases, invariants, acceptance criteria, and open decisions are in the [Supported Integration Operations contract](specs/supported-integration-operations.md). |

#### States and Behavior

See the flows in the [Supported Integration Operations contract](specs/supported-integration-operations.md).

#### Edge Cases

See the conditions and required outcomes in the [Supported Integration Operations contract](specs/supported-integration-operations.md).

#### Behavioral Invariants

See the invariants in the [Supported Integration Operations contract](specs/supported-integration-operations.md).

#### Acceptance Criteria

See the verifiable criteria in the [Supported Integration Operations contract](specs/supported-integration-operations.md).

#### Open Decisions

None recorded in the [Supported Integration Operations contract](specs/supported-integration-operations.md).

## Global Behavioral Invariants

- Intended behavior in this specification and its indexed feature contracts applies across supported product surfaces. Compatibility requires an explicit approved exception.
- Approved safety and identity constraints remain in force across features. An unresolved policy does not weaken an established guarantee.
- Failure handling follows [CONVENTIONS](CONVENTIONS.md#error-handling); a failure of one record or action affects only that operation.
- Product behavior is distinct from visual composition: screen-specific composition belongs in the [screen specifications](screens/README.md), and colors belong to the [design system](DESIGN-SYSTEM.md). Session-header composition and task-list width are specified by the [workspace screen](screens/workspace.md#ordered-regions).
- Implementation changes must align supported callers, fixtures, and persisted representations with the current contract. [CONVENTIONS](CONVENTIONS.md#changes-and-refactoring) owns implementation alignment and escalation of unresolved ownership or data policy.

## Open Product Decisions

Each feature contract owns its open questions and resolved behavior; see the [feature index](#features).
