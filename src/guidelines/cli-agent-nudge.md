## AgenticWorkspace

Use the `agentic-workspace` CLI when the user requests task operations or this session is explicitly assigned to an AgenticWorkspace task. Other work does not require an AgenticWorkspace startup command, workflow guide, or task creation.

Use `agentic-workspace task create` to create tasks, `agentic-workspace task view <id> --plain` to read them, `agentic-workspace task edit <id>` to update them, and `agentic-workspace search` or `agentic-workspace task list` to find tasks. Consult `agentic-workspace <command> --help` for options as needed.

Do not edit AgenticWorkspace task, draft, document, decision, or milestone markdown files directly. Use the `agentic-workspace` CLI so metadata, relationships, and history stay consistent.
