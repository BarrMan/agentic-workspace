## AgenticWorkspace Overview (Tools)

AgenticWorkspace tracks committed work. Create a task when work benefits from planning, decisions, or handoff context. Search existing tasks first; questions, exploration, and obvious mechanical edits may not need a task.

### Modes and artifacts

PLAN and BUILD are workflow presets using the project's Default model selection. PLAN is intended for repository research and optional requirements/plan artifacts; BUILD is intended for implementation and verification. Permission settings are native harness controls only when supported; in other integrations they are instructions. They do not by themselves enforce workflow steps or sandbox access.

Task artifacts are generic task-relative files for durable context. Suggested PLAN files (`spec.md` and `plan.md`) are optional conventions. The `.artifacts.json` sidecar records user-owned approval hashes and timestamps: agents cannot write or approve it, and approval applies only while exact artifact bytes match the reviewed hash.

### MCP tools quick reference

- `get_agentic-workspace_instructions`
- `task_list`, `task_search`, `task_view`, `task_create`, `task_edit`
- `task_complete` — move finished work to completed storage during cleanup
- `task_archive` — archive canceled, duplicate, or invalid work
- `document_list`, `document_view`, `document_create`, `document_update`, `document_search`
- Task artifact tools for listing, reading, writing, and checking artifact approval status

Use the supported MCP or CLI operations so task relationships and structured metadata remain consistent. Task artifact paths are relative to the task container; reserved internal files and unsafe paths are not user artifacts.
