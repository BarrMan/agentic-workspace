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
| IF-FS-002 | Cross-record search must span tasks, documents, and decision records within the project directory. It uses case-insensitive literal matching over task ids, titles, and descriptions, and document and decision-record bodies. |
| IF-FS-003 | Values within one filter combine with OR; separate filters combine with AND. Active and completed records are searched by default; archived records are included only when explicitly requested. Plain-text and JSON are the only output formats; regex, fuzzy ranking, and pagination are not supported. |

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

1. The search evaluates tasks, documents, and decision records within the project scope, matching task ids, titles, and descriptions, plus document and decision-record bodies, case-insensitively and literally.
2. Search active and completed records by default; include archived records only when explicitly requested.
3. Combine values within one filter with OR and separate filters with AND.
4. Return plain-text or JSON output only; do not apply regex, fuzzy ranking, or pagination.

**Postconditions:** The result contains matching records in the requested supported output format.

#### Edge Cases and Failures

| Condition | Expected Behavior |
|---|---|
| The user clears or resets task filters. | Active constraints are removed and the project-scoped task set is shown. |
| A search request asks for archived records. | Include them only when explicitly requested; otherwise search active and completed records. |
| Records exist outside the selected project directory. | They are outside the search and task-filter scope. |

#### Behavioral Invariants

- Task-filter and cross-record search scope is the project directory.
- Cross-record search covers tasks, documents, and decision records.
- Matching is case-insensitive and literal over task ids, titles, and descriptions, and document and decision-record bodies.
- Values in one filter combine with OR; separate filters combine with AND.
- Archived records are excluded unless explicitly requested; plain-text and JSON are the only formats, with no regex, fuzzy ranking, or pagination.

#### Acceptance Criteria

- [ ] Apply each supported task-filter dimension and confirm the visible task set and filter summary are project-scoped.
- [ ] Clear/reset active task filters and confirm the project task set is no longer constrained by them.
- [ ] Search across a project containing tasks, documents, and decision records and confirm both plain-text and JSON output are available.
- [ ] Confirm matching is case-insensitive and literal across the specified fields; confirm OR within a filter, AND between filters, and archived records only when requested.
- [ ] Confirm regex, fuzzy ranking, pagination, and output formats other than plain-text and JSON are unavailable.
- [ ] Confirm records outside the project directory are excluded.

## Global Behavioral Invariants

- Task-filter and cross-record search scope is the project directory.
- Cross-record search covers tasks, documents, and decision records.
- Matching is case-insensitive and literal over task ids, titles, and descriptions, and document and decision-record bodies.
- Values within one filter combine with OR; separate filters combine with AND.
- Active and completed records are searched by default; archived records are included only when explicitly requested. Plain-text and JSON are the only formats; regex, fuzzy ranking, and pagination are not supported.
