# CLI

Part of [BLUEPRINT](../BLUEPRINT.md). CLI accepts supported command input and maps it to the same [operation owners](controller.md#state) as Renderer. Task writes belong to TasksService, session orchestration to Core, and persistence/locking to Storage. [Supported integration operations](../specs/supported-integration-operations.md) owns the public command surface.

## Run

1. Parse and validate unknown command input at its accepting boundary. A TypeScript options type is not validation. Preserve the distinction between an absent option and an explicitly supplied empty value; do not reparse accepted values across layers.
2. Obtain an application whose TasksService initialization has completed. Use `core.tasks` and the existing read/workflow owners directly, without duplicate Core forwarding methods.
3. For an edit, use `core.storage.withTaskLock(taskId, callback, options)` to receive the fresh complete task, derive the full replacement, and await `core.tasks.edit(task)` under the same lock. The handler supplies no previous-status or approval override arguments. [runTaskEdit](../../src/cli/features/tasks/edit.ts) is the task-edit entry point.
4. For session operations, invoke Core's `newSession`, `resumeSession` or `stopSession` with exact task/session identities. Resume resolves retained histories, not just Core's live executions.
5. Format committed results or failures truthfully. A post-commit error is not a rolled-back save. The [CLI runtime](../../src/cli/runtime.ts) owns application cleanup, including TasksService subscription disposal.

## Invariants

- CLI and Renderer use the same task/session operation owners and concurrency rules.
- Exact task identity is preserved through lookup and mutation; no normalized lookup key or source-ranking fallback is introduced by command parsing.
- Model transforms may be applied to the locked current record; task persistence still goes through TasksService. Storage remains the typed lock boundary with a private FileSystem.
- CLI never constructs workspace storage paths or holds the private workspace filesystem. Provider/process cleanup remains runtime-owned.
