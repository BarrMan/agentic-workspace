# Product Specification: Filtering and search

## Overview

Let users narrow the workspace task list and find records across project tasks, documents, and decision records.

## Features

| Feature | Description | Contract |
|---|---|---|
| Filtering and search | Filter workspace tasks and search across project records. | [Filtering and search](#filtering-and-search) |

## Feature Contracts

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

## Global Behavioral Invariants

- Task-filter and cross-record search scope is the project directory.
- Cross-record search covers tasks, documents, and decision records.
- Task search fields follow the task model rather than an independent field definition.

## Open Product Decisions

| Decision | Affected Features | Status |
|---|---|---|
| Search filter combinations, matching details, and additional output formats. | Filtering and search | Open |
