# Product Specification: AgenticWorkspace

## Overview

AgenticWorkspace organizes project tasks, configurable agent work, retained conversations, and live terminal interaction through a TUI-first workspace and selective integration API. [PRODUCT](PRODUCT.md) owns product purpose, vision, users, goals, and scope. This specification and its indexed feature contracts are the authoritative source of intended product behavior. [BLUEPRINT](BLUEPRINT.md) owns technical design; [DESIGN-SYSTEM](DESIGN-SYSTEM.md) and [screen specifications](screens/README.md) own visual rules and screen composition.

## Features

| Feature | Description | Contract |
|---|---|---|
| Tasks and storage | Task model, dependencies, deterministic storage and relocation, artifacts, worktrees, completion, milestones, and task deletion. | [Tasks and storage](specs/tasks.md) |
| Sessions | Session identity, observation, launch, exact resume, handoff, running-session limit, terminal lifetime, and session deletion. | [Sessions](specs/sessions.md) |
| Configuration and modes | TUI settings, precedence, dynamic modes, task/mode approval, presets, permissions, models, and mode deletion. | [Configuration and modes](specs/configuration.md) |
| Interfaces | TUI and selective external API, workspace and board behavior, search, feedback, and supported integration operations. | [Interfaces](specs/interfaces.md) |

## Feature Contracts

### Tasks and storage

#### Purpose

Define task organization, persistence, work context, artifacts, completion, milestones, and deletion behavior.

#### Requirements

| ID | Requirement |
|---|---|
| TASK-001–TASK-019 | The complete requirements, flows, edge cases, invariants, acceptance criteria, and open decisions are in the [Tasks and storage contract](specs/tasks.md). |

#### Behavioral Flows

See the flows in the [Tasks and storage contract](specs/tasks.md).

#### Edge Cases and Failures

See the conditions and required outcomes in the [Tasks and storage contract](specs/tasks.md).

#### Behavioral Invariants

See the invariants in the [Tasks and storage contract](specs/tasks.md).

#### Acceptance Criteria

See the verifiable criteria in the [Tasks and storage contract](specs/tasks.md).

#### Open Decisions

See the unresolved task and storage decisions in the [Tasks and storage contract](specs/tasks.md).

### Sessions

#### Purpose

Define creation, observation, continuation, handoff, live terminal interaction, and deletion of retained agent conversations.

#### Requirements

| ID | Requirement |
|---|---|
| SESSION-001–SESSION-020 | The complete requirements, flows, edge cases, invariants, acceptance criteria, and open decisions are in the [Sessions contract](specs/sessions.md). |

#### Behavioral Flows

See the flows in the [Sessions contract](specs/sessions.md).

#### Edge Cases and Failures

See the conditions and required outcomes in the [Sessions contract](specs/sessions.md).

#### Behavioral Invariants

See the invariants in the [Sessions contract](specs/sessions.md).

#### Acceptance Criteria

See the verifiable criteria in the [Sessions contract](specs/sessions.md).

#### Open Decisions

See the unresolved session creation, recovery, handoff, and deletion decisions in the [Sessions contract](specs/sessions.md).

### Configuration and modes

#### Purpose

Define workspace settings and the configuration, approval, and lifecycle of agent modes.

#### Requirements

| ID | Requirement |
|---|---|
| CONFIG-001–CONFIG-012 | The complete requirements, flows, edge cases, invariants, acceptance criteria, and open decisions are in the [Configuration and modes contract](specs/configuration.md). |

#### Behavioral Flows

See the flows in the [Configuration and modes contract](specs/configuration.md).

#### Edge Cases and Failures

See the conditions and required outcomes in the [Configuration and modes contract](specs/configuration.md).

#### Behavioral Invariants

See the invariants in the [Configuration and modes contract](specs/configuration.md).

#### Acceptance Criteria

See the verifiable criteria in the [Configuration and modes contract](specs/configuration.md).

#### Open Decisions

See the unresolved mode-deletion decisions in the [Configuration and modes contract](specs/configuration.md).

### Interfaces

#### Purpose

Define user-facing workspace interactions and the selective external integration API.

#### Requirements

| ID | Requirement |
|---|---|
| IF-WB-001–IF-WB-008; IF-FS-001–IF-FS-003; IF-SI-001–IF-SI-007; IF-API-001–IF-API-013 | The complete requirements, flows, edge cases, invariants, acceptance criteria, and open decisions are in the [Interfaces contract](specs/interfaces.md). |

#### Behavioral Flows

See the flows in the [Interfaces contract](specs/interfaces.md).

#### Edge Cases and Failures

See the conditions and required outcomes in the [Interfaces contract](specs/interfaces.md).

#### Behavioral Invariants

See the invariants in the [Interfaces contract](specs/interfaces.md).

#### Acceptance Criteria

See the verifiable criteria in the [Interfaces contract](specs/interfaces.md).

#### Open Decisions

See the unsettled integration scope and syntax decisions in the [Interfaces contract](specs/interfaces.md).

## Global Behavioral Invariants

- Intended behavior in this specification and its indexed feature contracts applies across supported product surfaces. Legacy compatibility requires an explicit approved exception.
- Approved safety and identity constraints remain in force across features. An unresolved policy does not weaken an established guarantee.
- Product behavior is distinct from visual composition: screen-specific composition belongs in the [screen specifications](screens/README.md), and colors belong to the [design system](DESIGN-SYSTEM.md). Session-header composition and task-list width are specified by the [workspace screen](screens/workspace.md#ordered-regions).
- Implementation changes must align supported callers, fixtures, and persisted representations with the current contract. [CONVENTIONS](CONVENTIONS.md#changes-and-refactoring) owns implementation alignment and escalation of unresolved ownership or data policy.

## Open Product Decisions

The affected feature contracts retain the detailed constraints and decision context. The following product policies remain unresolved:

| Decision | Affected Features | Status |
|---|---|---|
| Task-deletion confirmation and consent; provider-owned file and multi-session scope; partial-failure continuation; interruption recovery; retry; and concurrency. | [Tasks and storage](specs/tasks.md#task-deletion) | Open |
| Storage-relocation collisions, failure or interruption, configuration-switch timing, recovery, and concurrent access. | [Tasks and storage](specs/tasks.md#changing-the-storage-location) | Open |
| Provider-owned file scope, default/last-mode handling, cross-task extent, and remaining recovery policy for session and mode deletion. | [Sessions](specs/sessions.md#deleting-a-session); [Configuration and modes](specs/configuration.md#delete-a-mode) | Open |
| Automatic crash/interruption recovery, retry UX, and repeated or concurrent operations for session creation and handoff. | [Sessions](specs/sessions.md#creation-failure-and-recovery); [Sessions](specs/sessions.md#handoff) | Open |
| Unsettled command surfaces and syntax, MCP retention, and broad setup/guidance APIs. | [Interfaces](specs/interfaces.md#supported-integration-operations) | Open |
