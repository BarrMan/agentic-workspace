## Task Finalization Guide

Use this guide when implementation is complete and ready for review.

1. Read the task with `task_view`. Identify evidence for every requirement in the task description and durable working state.
2. Run relevant tests and checks. For UI or interactive work, exercise the behavior through a browser, DOM script, test runner, or documented manual interaction. Code presence, grep output, and implementation intent are not verification evidence.
3. Confirm durable working state reflects the final solution and that required documentation/configuration updates are complete. Preserve useful decisions, progress, blockers, and validation results in the task's canonical durable working-state artifacts. Resolve failures before reporting the work finished.
4. Hand off in the same mode as the previous ask, when continuing an existing conversation. Do not impose plan approval or other workflow gates unless the user requests them.
5. Complete any user-requested review before declaring the work ready.
6. Report the verified result to the user. Only the user moves a task to `Done`. When the user confirms completion, mark it with `task_edit` and the terminal status.

### Task Lifecycle

Leave finished tasks on the board until periodic cleanup. `task_complete` moves them to completed storage while preserving their record and dependency links.

Use `task_archive` only for canceled, duplicate, or invalid work. Archiving removes incoming dependencies and task references.

### Follow-up Work

Do not create or start follow-up tasks without user approval. For subtasks, verify each separately and finish the parent only when all are complete, unless instructed otherwise. Continue to the next subtask only when the user already assigned the full series; otherwise ask first.
