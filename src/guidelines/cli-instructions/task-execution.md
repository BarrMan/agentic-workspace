## Task Execution Guide

Use this guide when you are working on an existing Backlog task.

### Planning Workflow

Before writing code for non-trivial work:

1. Read the task before mutating it:
   - `agenticworkspace task view {{TASK_ID:123}} --plain`
2. Review its current status, description, dependencies, references, and documentation. Confirm the
   task is eligible to start and remains within the requested scope.
   - The `Dependency Graph` section reads the whole context: `Depends on` is what this task transitively waits on,
     `Dependents` is what transitively waits on it. Outermost entries are direct, indented entries are transitive.
   - `unknown task ID` and `ambiguous task ID` are unresolved identities, never satisfied dependencies. The graph stops
      at one instead of guessing, so treat that branch as unknown and review the conflicting task records before relying on it.
3. Mark it in progress and assign yourself when the user has asked you to take on the task:
   - Inspect accepted statuses if needed: `agenticworkspace task edit {{TASK_ID:123}} --help`
   - `agenticworkspace task edit {{TASK_ID:123}} -s "<active status>" -a @your-name`
4. Research the current system, including relevant code, tests, conventions, and recent changes. Do not rely on an
   approach proposed when the task was created.
5. Put durable project artifacts in their canonical paths (for example, documentation in the relevant docs file).
   Keep task metadata concise and focused on durable intent and status; do not use a task field as a working log.

If the user explicitly requests review or approval of a material product, architecture, or workflow decision, present
it and wait for that approval before proceeding. Otherwise, proceed within the confirmed scope.

### Execution Workflow

Work in short loops:

1. Implement a focused slice.
2. Run relevant tests or checks.
3. Update task metadata only when its concise status or durable description needs to change. Keep implementation
details, decisions, and verification in their canonical project artifacts when they need to be retained.

Use `agenticworkspace task edit {{TASK_ID:123}} --help` before changing unfamiliar fields.

Do not move the task to the terminal status from this guide alone. When implementation appears complete, read the
finalization guide and verify the work with objective evidence before finishing.

### Scope Changes

If you discover work that is outside the task's scope, stop and ask the user whether to add scope to the current task or create follow-up work. Do not silently expand the task.

### Working With Subtasks

If the user assigns a parent task and all subtasks, complete subtasks one at a time and verify each before moving on.

If the user assigns only one subtask, finish that subtask and ask before moving to the next one.

### Reading and Writing Backlog Data

Use CLI commands for Backlog changes:

- Read: `agenticworkspace task view {{TASK_ID:123}} --plain`
- Search: `agenticworkspace search "query" --plain`
- List with task filters: `agenticworkspace task list --status "<active status>" --assignee @your-name --labels backend --search "auth" --limit 20 --plain`
- Update: `agenticworkspace task edit {{TASK_ID:123}} ...`
- Repair a task rejected for a missing schema version: `agenticworkspace task migrate-legacy {{TASK_ID:123}}` (review the task first; this only converts the retired section-backed format)
- Create docs: `agenticworkspace doc create "Title"`
- Update docs: `agenticworkspace doc update doc-1 --content "Markdown"`

For programmatic reads, `task list`, `task view`, `task <id>`, and `search` accept `--json`. JSON mode is noninteractive, versioned, and cannot be combined with `--plain`.

Do not edit Backlog markdown files directly. The CLI preserves metadata, IDs, filenames, relationships, and YAML frontmatter fields; task bodies are free-form Markdown.

### Finishing

When implementation is complete, continue with:

```bash
agenticworkspace instructions task-finalization
```
