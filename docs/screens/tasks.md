# Task details and forms

Purpose: inspect a task and create or edit its supported fields. Product rules: [SPEC](../SPEC.md). Shared rules: [design system](../DESIGN-SYSTEM.md).

## Contents and order

Task detail presents task identity and available information: description, status, type, priority, milestone, labels, and dependencies/readiness, with selected-mode session context where relevant. Priority is the configured label itself. Assignees are not task fields and must not appear in task detail or task forms. Tasks have no due date or separate project field. The project directory is the scope. Due date remains removed.

Creation and editing forms use the supported task fields; do not expose removed fields, including assignee. Option fields render as a one-line `◀ value ▶` cycler; Left/Up selects the previous value and Right/Down the next, wrapping at either end. The create form includes title, description, status, type, priority, agent preset, worktree-per-task, and YOLO. The edit form includes title, description, type, and priority. Exact field order, required-field markers, and detail-pane ordering are unresolved.

## States, focus, and terminal constraints

Empty optional values should remain distinguishable from unavailable/error values. Save errors preserve unsaved form data. Focus stays within the form while editing; keyboard actions follow SPEC and current configured bindings.

Keep forms usable in short or narrow terminals by allowing vertical navigation and fitting controls to available cells.

## Open Questions

Exact field order, required-field markers, detail-pane ordering, loading/error wording, minimum dimensions, wrapping, truncation, and scrolling rules are unspecified.
