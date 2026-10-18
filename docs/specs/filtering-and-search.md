# Product Requirements: Filtering and search

## Overview

Let users narrow the workspace task list and find records across project tasks, documents, and decision records.

## Goals

- Filter workspace tasks within the project directory.
- Search project tasks and other project records using predictable literal matching.

## Scope

### In Scope

- Task filtering by supported dimensions, filter summaries and reset actions, and cross-record search across supported project records and formats.

### Out of Scope

- Regex, fuzzy ranking, pagination, archived records by default, and output formats other than plain-text and JSON.

## Actors

| Actor | Description |
|---|---|
| User | Applies, reviews, and clears task filters; submits record searches. |
| Integration caller | Submits cross-record searches and requests supported output formats. |
| Application | Filters project tasks and searches project records. |

## Functional Requirements

### IF-FS-001: Task filters

**Description:** Task filters support text, status, type, priority, milestone, label, assignee, and unassigned. Multiple assignee values match tasks assigned to any selected assignee (OR); separate filter dimensions combine with AND. The interface shows a filter summary and provides clear/reset actions. Filter scope is the project directory.

**Trigger:** User enters or changes a task filter, or clears/resets filters.

**Preconditions:** Workspace is open within a project directory.

**Behavior:**
1. Apply selected supported filters to project tasks.
2. Show an active filter summary.
3. Clear/reset removes active constraints.

**Outcome:** Workspace shows matching project tasks or the unconstrained project task set.

**Failures:** None specified.

**Acceptance Criteria:**
- [ ] IF-FS-001-AC-01: Apply each supported filter dimension (text, status, type, priority, milestone, label, assignee, unassigned) and confirm matching tasks are project-scoped; multiple assignees combine with OR.
- [ ] IF-FS-001-AC-02: Confirm the interface shows a summary of active filters.
- [ ] IF-FS-001-AC-03: Clear/reset filters and confirm active constraints are removed and project tasks are shown.

### IF-FS-002: Cross-record search scope and matching

**Description:** Search spans tasks, documents, and decision records within the project directory. It uses case-insensitive literal matching over task ids, titles, descriptions, and assignees, and document and decision-record bodies.

**Trigger:** User or integration submits cross-record search.

**Preconditions:** A project directory is available.

**Behavior:**
1. Search tasks, documents, and decision records within the project directory.
2. Match case-insensitively and literally over task ids, titles, descriptions, and assignees, and document and decision-record bodies.

**Outcome:** Matching project records are returned.

**Failures:** Records outside the project scope are excluded.

**Acceptance Criteria:**
- [ ] IF-FS-002-AC-01: Search a project containing tasks, documents, and decision records and confirm all three record types are covered.
- [ ] IF-FS-002-AC-02: Confirm matching checks task ids, titles, descriptions, assignees, and document/decision-record bodies.
- [ ] IF-FS-002-AC-03: Confirm matching is case-insensitive and literal.
- [ ] IF-FS-002-AC-04: Confirm records outside the project directory are excluded.

### IF-FS-003: Filter combination, archive scope, and output limits

**Description:** Values within one filter combine with OR; separate filters combine with AND. Active and completed records are searched by default; archived records only when explicitly requested. Plain-text and JSON are the only output formats; regex, fuzzy ranking, and pagination are not supported.

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
| Search request | Query and options for a project-scoped record search. |
| Search results | Matching records in plain-text or JSON format. |

**Transitions:**

| From | Trigger | To | Required Behavior |
|---|---|---|---|
| Search request | User/integration submits | Search results | Search project records using literal case-insensitive matching and requested archive scope/format. |

**Invariants:**
- Search scope is the project directory.
- Values within one filter, including multiple assignees, combine with OR; separate filters combine with AND.
- Archived records are excluded unless explicitly requested.
- Search matching is literal and case-insensitive; no pagination is supported.

## User Interactions

### Filter tasks and search project records

**Context:** The user is working in a project-scoped workspace or submitting a project-record search.

**Action:** Apply, change, or clear task filters; submit a search query and supported archive/format options.

**Response:** Show matching project tasks with an active-filter summary, or return matching tasks, documents, and decision records.

**Feedback:** The interface provides filter clear/reset actions; searches use literal case-insensitive matching and return plain-text or JSON results.

## External Behavior

### Search interface

**Purpose:** Let users and integrations search project records.

**Inputs:** Search query, project directory, optional archived-record inclusion, and output format.

**Outputs:** Matching tasks, documents, and decision records as plain-text or JSON.

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
