## Task Execution Guide

### Select a mode

AgenticWorkspace provides two workflow presets:

- **PLAN** uses the project's Default model, is intended for read-oriented repository research, and can maintain task metadata and artifacts. Its suggested artifacts are `spec.md` (what: requirements, behavior, constraints, acceptance criteria, durable decisions) and `plan.md` (how: approach, affected areas, steps, validation). They are optional; task creation and session start do not create them automatically.
- **BUILD** uses the same Default model and supports implementation and verification, with task metadata and artifacts available for durable context.

Mode permissions describe intent and are passed to the agent harness where the native integration supports them. Otherwise, the mode's prompt communicates the intended behavior. Native enforcement varies by agent; instructions alone are not technical access control, and modes do not sandbox repository or task access. Both modes may use subagents when the harness supports them.

### Working with tasks and artifacts

1. Read the task, its status, dependencies, related tasks, and relevant artifacts before changing anything.
2. Confirm scope and prerequisites. Treat unknown or ambiguous dependency identities as unresolved rather than satisfied.
3. Keep the task record for task identity, status, assignment, and concise user-facing description. Use artifacts for optional durable working documents; choose names and formats appropriate to the work rather than treating the suggested PLAN files as a required template.
4. Use supported artifact interfaces to list, read, write, and inspect status. The CLI provides `agentic-workspace task artifact list <taskId>`, `read <taskId> <path>`, `write <taskId> <path>`, and `status <taskId> <path>`; write accepts `--from <file>` or stdin. MCP provides corresponding task artifact operations.
5. Treat approval as a user action. `.artifacts.json` is a system-owned sidecar recording approval SHA-256 and timestamp for artifact paths. It is excluded from artifact listings and is not agent-writable or agent-approvable. Approval is valid only while the artifact's exact bytes match the approved hash; edits invalidate that approval. Approval is a review signal, not a gate to use or edit an artifact.
6. Implement and verify work in proportion to its scope, and update task status to reflect reality. Follow the task finalization guide when wrapping up.

Artifacts are ordinary durable project data, not permission boundaries. Do not claim that the PLAN/BUILD workflow itself enforces review, blocks implementation, or isolates access.

### Explicit project upgrade

Existing projects are not migrated automatically by ordinary reads. Use the project-level command explicitly:

```sh
Manually convert each flat task or draft `<name>.md` to `<lowercase-id>/task.md` under its existing root, and set frontmatter `id` to match the directory name.
```

Preview reports planned task/session changes, blockers, and a source fingerprint without writing project data. Review it, then apply using the exact fingerprint shown; if the source changed, preview again and use the new fingerprint. Recovery handles an interrupted transaction; run preview again afterward before continuing. Existing legacy agent-summary text is preserved as the `legacy-agent-summary.md` artifact rather than discarded.
