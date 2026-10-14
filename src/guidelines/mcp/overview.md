## AgenticWorkspace Overview (MCP)

AgenticWorkspace tracks committed work: what will be built, fixed, or changed.

### When to Use AgenticWorkspace

Create a task when work needs durable tracking. Skip task creation for questions, exploration, and obvious mechanical edits.

Search first with `task_search` or `task_list`, then read matching work with `task_view`. Use the existing task, or follow the creation guide if none fits. Keep the task description concise and maintain detailed context in canonical durable working-state artifacts so a fresh session can continue.

### Required Guides

Read the matching resource before taking these actions; this overview does not replace it:

- `agentic-workspace://workflow/task-creation` — before creating or splitting tasks
- `agentic-workspace://workflow/task-execution` — before changing status or assignee, updating durable working state, or implementing
- `agentic-workspace://workflow/task-finalization` — before verifying work or marking it finished

### Task Lifecycle

Only the user moves a task to Done (or the configured final status). Leave finished work on the board until periodic cleanup with `task_complete`. Use `task_archive` only for canceled, duplicate, or invalid work. Continue in the same mode as the previous ask when handing off within an ongoing conversation; do not impose mandatory plan approval or other workflow gates.

### MCP Tools Quick Reference

- `task_list` — list tasks with optional filtering by status, configured task type, configured project, assignee (or `unassigned: true`), milestone, labels, search, `ready: true` for unblocked tasks, or limit
- `task_search` — search tasks by title and description, or filter by configured task type, configured project, and project-root-relative `modifiedFiles` path substrings
- `task_view` — read full task context (title, description, durable working state, status, dependencies, references, and documentation)
- `document_list` — list documents, including type, path, timestamps, and tags
- `document_view` — view document metadata and markdown content
- `document_create` — create a document with title, content, optional type/tags, and optional docs-directory-relative path
- `document_update` — update document content, optional title/type/tags, and optional docs-directory-relative path
- `document_search` — search documents using the shared fuzzy index
- `task_create` — create new tasks with a concise description; keep detailed durable working state in canonical artifacts
- `task_edit` — update task metadata, status, description, durable working state, and dependencies
- Durable working state records requirements, findings, decisions, progress, verification, and blockers. Bodies may contain Markdown and are stored as YAML text values.
- `task_complete` — move finished work off the board to completed storage during periodic cleanup; preserves its record and dependency links
- `task_archive` — archive canceled, duplicate, or invalid work; removes incoming dependencies and task references. Archived task IDs can be reused.

**Document path rules:** document paths are relative to the docs directory. Use `path` values like `guides/setup`; absolute paths and `..` traversal are rejected.

**Always operate through MCP tools. Never edit markdown files directly so relationships, metadata, and history stay consistent.**
