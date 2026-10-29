# Product Requirements: Filtering and search

## Overview

Let users narrow the workspace task list and find project tasks.

## Goals

- Filter workspace tasks within the project directory.
- Search project tasks using predictable literal matching.

## Scope

### In Scope

- Task filtering by supported dimensions, filter summaries and reset actions, and task search across supported formats.

### Out of Scope

- Regex, fuzzy ranking, pagination, archived records by default, and output formats other than plain-text and JSON.

## Actors

| Actor | Description |
|---|---|
| User | Applies, reviews, and clears task filters; submits task searches. |
| Integration caller | Submits task searches and requests supported output formats. |
| Application | Filters and searches project tasks. |

## Functional Requirements

### IF-FS-001: Task filters

**Description:** Task filters support text, status, type, priority, milestone, and label; separate filter dimensions combine with AND. The interface shows a filter summary and provides clear/reset actions. Filter scope is the project directory. Assignee and unassigned filters are not supported.

**Trigger:** User enters or changes a task filter, or clears/resets filters.

**Preconditions:** Workspace is open within a project directory.

**Behavior:**
1. Apply selected supported filters to project tasks.
2. Show an active filter summary.
3. Clear/reset removes active constraints.

**Outcome:** Workspace shows matching project tasks or the unconstrained project task set.

**Failures:** None specified.

**Acceptance Criteria:**
- [ ] IF-FS-001-AC-01: Apply each supported filter dimension (text, status, type, priority, milestone, label) and confirm matching tasks are project-scoped.
- [ ] IF-FS-001-AC-02: Confirm the interface shows a summary of active filters.
- [ ] IF-FS-001-AC-03: Clear/reset filters and confirm active constraints are removed and project tasks are shown.

### IF-FS-002: Task search scope and matching

**Description:** Search spans project tasks within the project directory. It uses case-insensitive literal matching over task IDs, titles, and descriptions; assignees are not searchable fields. Text matching does not change identity: returned IDs and direct task addressing follow [TASK-003's exact-string contract](tasks.md#task-003-task-identity).

**Trigger:** User or integration submits a task search.

**Preconditions:** A project directory is available.

**Behavior:**
1. Search project tasks within the project directory.
2. Match case-insensitively and literally over task IDs, titles, and descriptions.

**Outcome:** Matching project tasks are returned.

**Failures:** Records outside the project scope are excluded.

**Acceptance Criteria:**
- [ ] IF-FS-002-AC-01: Search a project and confirm project tasks are covered.
- [ ] IF-FS-002-AC-02: Confirm matching checks task IDs, titles, and descriptions.
- [ ] IF-FS-002-AC-03: Confirm matching is case-insensitive and literal.
- [ ] IF-FS-002-AC-04: Confirm records outside the project directory are excluded.
- [ ] IF-FS-002-AC-05: Case-insensitive search preserves each returned ID's exact casing and numeric spelling and provides no alias for direct task lookup.

### IF-FS-003: Filter combination, archive scope, and output limits

**Description:** Values within one filter combine with OR; separate filters combine with AND. Active and existing completed records are searched by default; archived records only when explicitly requested. These are storage locations, independent of `done` and configured status; searching does not relocate or migrate records. Plain-text and JSON are the only output formats; regex, fuzzy ranking, and pagination are not supported.

**Trigger:** Search request includes filters, archive option, or output format.

**Preconditions:** Project directory is available.

**Behavior:**
1. Apply OR within a filter and AND between filters.
2. Include active and completed records by default and include archived records only when explicitly requested.
3. Return plain-text or JSON only; do not apply regex, fuzzy ranking, or pagination.

**Outcome:** Results match the requested supported filter and archive scope and are returned in a supported format.

**Failures:** Unsupported output formats, regex, fuzzy ranking, and pagination are not supported.

**Acceptance Criteria:**
- [ ] IF-FS-003-AC-01: Confirm values within one filter combine with OR and separate filters combine with AND.
- [ ] IF-FS-003-AC-02: Confirm active and completed records are included by default and archived records only when explicitly requested.
- [ ] IF-FS-003-AC-03: Confirm plain-text and JSON output are available and other formats are unavailable.
- [ ] IF-FS-003-AC-04: Confirm regex, fuzzy ranking, and pagination are unavailable.

## States and Transitions

### Task filters

**States:**

| State | Meaning |
|---|---|
| Unfiltered task set | All project-scoped tasks are shown without active filter constraints. |
| Filtered task set | Tasks matching active filter constraints, with a visible filter summary. |

**Transitions:**

| From | Trigger | To | Required Behavior |
|---|---|---|---|
| Unfiltered or filtered task set | User adds/changes filter | Filtered task set | Apply supported dimensions and show summary. |
| Filtered task set | User clears/resets | Unfiltered task set | Remove active constraints. |

**Invariants:**
- Task-filter scope is the project directory.

### Search request

**States:**

| State | Meaning |
|---|---|
| Search request | Query and options for a project-scoped task search. |
| Search results | Matching tasks in plain-text or JSON format. |

**Transitions:**

| From | Trigger | To | Required Behavior |
|---|---|---|---|
| Search request | User/integration submits | Search results | Search project tasks using literal case-insensitive matching and requested archive scope/format. |

**Invariants:**
- Search scope is the project directory.
- Values within one filter combine with OR; separate filters combine with AND.
- Archived records are excluded unless explicitly requested.
- Search matching is literal and case-insensitive; no pagination is supported.
- Text matching preserves exact task IDs; it is not a read-time identity alias or duplicate resolver. Search scope follows storage location, not an inferred `done` value.

## User Interactions

### Filter tasks and search project tasks

**Context:** The user is working in a project-scoped workspace or submitting a project task search.

**Action:** Apply, change, or clear task filters; submit a search query and supported archive/format options.

**Response:** Show matching project tasks with an active-filter summary, or return matching tasks.

**Feedback:** The interface provides filter clear/reset actions; searches use literal case-insensitive matching and return plain-text or JSON results.

## External Behavior

### Search interface

**Purpose:** Let users and integrations search project tasks.

**Inputs:** Search query, project directory, optional archived-record inclusion, and output format.

**Outputs:** Matching tasks as plain-text or JSON.

**Failures:** No additional failure behavior is specified in this contract. Unsupported formats, regex, fuzzy ranking, and pagination are not supported.

## Non-Functional Requirements

### Performance

- None.

### Reliability

- None.

### Security

- None.

### Compatibility

- None.

## Edge Cases

| Condition | Required Behavior |
|---|---|
| User clears/resets task filters | Remove active constraints and show project-scoped task set. |
| Search request omits archived-record inclusion | Search active and completed records; exclude archived. |
| Search explicitly requests archived records | Include archived records. |
| Records are outside selected project directory | Exclude them from search and task-filter scope. |
| Request asks for regex, fuzzy ranking, pagination, or unsupported format | These capabilities are not supported; only plain-text and JSON output formats are available. |

## Open Questions

None.
