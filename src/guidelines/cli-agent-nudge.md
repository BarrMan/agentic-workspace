## AgenticWorkspace

Use the `agenticworkspace` CLI when the user requests task operations or this session is explicitly assigned to an AgenticWorkspace task. Other work does not require an AgenticWorkspace startup command, workflow guide, or task creation.

Use `agenticworkspace task create` to create tasks, `agenticworkspace task view <id> --plain` to read them, `agenticworkspace task edit <id>` to update them, and `agenticworkspace search` or `agenticworkspace task list` to find tasks. Consult `agenticworkspace <command> --help` for options as needed.

Do not edit AgenticWorkspace task, draft, document, decision, or milestone markdown files directly. Use the `agenticworkspace` CLI so metadata, relationships, and history stay consistent.
