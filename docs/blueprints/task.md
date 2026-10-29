# Task

Part of [BLUEPRINT](../BLUEPRINT.md). Task owns task-domain transformations, task-local mode selection and session relationships. It does not perform persistence I/O or start execution. [TasksService](controller.md) owns task operations; [Session](session.md) owns conversation/execution behavior.

## Type

The complete record is `Task` in [model/types.ts](../../src/model/types.ts). The behavioral [Task class](../../src/model/task/task.ts) holds that record as `task`, its exact `id`, mode profiles, per-mode histories containing Session objects, and `selectedModeId`. Record fields are not hidden behind a second details/serialization shape.

| Record field | Meaning |
|---|---|
| `id` | Exact task identity string. Lookup and equality do not trim, case-fold, infer prefixes or normalize numeric segments. |
| `title`, `description`, `rawContent` | Task content; the Storage codec owns Markdown encoding. |
| `status` | Exact configured status label, independent of completion indication and storage location. |
| `done` | Independent boolean. New tasks and records without this field read as false, without inference from status or directory and without rewriting the record on read. |
| `createdDate`, `updatedDate`, `dueDate` | Domain dates; `updatedDate` maps to persisted `updated_date` and integration JSON `updatedAt`. Timestamp advancement belongs to [TasksService.edit](controller.md#update-task). |
| `dependencies`, `parentTaskId`, `milestone` | Exact references; milestone titles are display-only. |
| `branch`, `worktreePolicy` | Task work context and captured worktree policy. Session execution paths derive from that context. |
| `agentConfiguration`, `modeApprovals` | Task-scoped configuration and independent per-mode approval. |
| `filePath`, `source` | Storage metadata, not status or `done`. Existing-record persistence requires the supplied complete record, including its resolved location. |

See the source declaration for the remaining content, label and ordering fields, and [task requirements](../specs/tasks.md) for input rules. Session histories are separate SessionStore records; saving task content does not serialize or overwrite those histories.

## Derived State

`activeSession` resolves the selected mode's `activeSessionId` against its retained Session objects, or is absent. `findSession(sessionId)` searches all retained histories, including stopped conversations. Neither establishes runtime liveness; Session owns observed state.

`equals(other)` compares `id` exactly. `equalsDeep(record)` compares the complete `task` record, including non-identity fields. `ready(graph)` evaluates dependency readiness against the supplied exact-ID corpus graph. Readiness is informational and does not automatically gate launch, Done or archive.

## Operations

Task writes supply a complete record through [update or edit](controller.md#update-task). The accepting boundary validates unknown input once; Task applies actual relationship/domain transformations without a generic partial-change dispatcher or repeated accepted-object parsing. Storage owns record encoding.

- Dependency changes use `replaceDependencies` or `addDependencies` with the loaded corpus. `applyBoardPlacement` applies already-resolved placement while preserving unrelated record fields.
- `setModeApproval` and `clearModeApproval` transform the task record. The caller persists through `TasksService.edit` under the task lock; approval does not require a separate save path or control argument.
- `replaceLoadedState` receives the accepted task record, profiles, session records and selected mode from the owner. It preserves existing Session object identity while refreshing durable fields. Hydration does not repair malformed histories or invent fallback active IDs.
- `createSession(modeId, inputs, sessionFactory, activate?)` creates a Session and a `SessionCreationIdentity`, inserts the session at the front of its mode history, and selects it when requested. The identity retains the provisional record incarnation and prior selection for rollback against fresh history.
- `rollbackSession` verifies that creation identity before removing the provisional relationship. Core must settle execution cleanup first; uncertain execution retains durable tracking.
- `selectSession` requires a retained member. `selectSurvivorAfterStop` chooses the first other retained session when the stopped session was active, or retains it if no alternative exists. `removeSession(modeId, sessionId)` chooses the first remaining member when replacement is needed.
- `moveModeSessions` moves membership only during explicit mode deletion; `removeMode` requires an empty history. Ordinary mode selection does not move conversations.

The [model declaration](../../src/model/task/task.ts) owns exact method signatures. Core sequences model transformations and SessionStore persistence; Task itself owns neither locks nor serialization wrappers.

## Corpus Operations

`Task` owns one record. Cross-record rules belong to the model classes that operate on a loaded corpus:

- [TaskOrdering](../../src/model/task/task-ordering.ts) owns ordering, independently of identity equality.
- [TaskCollection](../../src/model/task/task-collection.ts) owns parent/subtask relationships and progress.
- [TaskSearchIndex](../../src/model/task/task-search.ts) owns search and filtering.
- [DependencyValidator](../../src/model/task/dependency-validator.ts) owns dependency existence and cycle rules.

Searchable-field extraction, text-search matching, status-set matching and modified-file matching are private to TaskSearchIndex. Search behavior does not define an alternative task identity. There is no separate identity-ranking or corruption resolver in a corpus projection.

TasksService supplies its initialized corpus, loaded through Storage. DependencyValidator receives neither a store nor a persistence callback and performs no I/O. Cross-record transformations use locked current records when persisted; a read projection is not a concurrency guarantee.

## Invariants

- Task model mutations are synchronous and free of I/O.
- Identity is exact string equality throughout lookup, relationships and mutation. Source location never ranks competing identities or infers completion.
- `done`, status and location are independent. Marking Done retains status and work context; archive has no status/Done gate and owns explicit cleanup through TasksService.
- Status is the stored display string and must match an exact configured label; no whitespace-insensitive status lookup is used. Status ordering does not infer `done` or task lifecycle. A single status is not a class.
- Priority is one exact label from the ordered configured `priorities` string array (default `High`, `Medium`, `Low`); no separate comparison value exists. Assignee is not a task field.
- Task never starts or stops execution; Core invokes the Session behavior after Task establishes the relationship.
- Selection is Task and Controller state, not a preference.
- A nonempty history's active ID names a retained member; an empty history has no active ID. Persisted invalid relationships fail decoding rather than being repaired during hydration.
- Session mode membership changes only through the explicit move choice during [mode deletion](../specs/configuration.md#config-012-confirmed-mode-deletion-cleanup); ordinary mode selection never moves sessions.
- Removing a mode requires an empty history.
- Task content and session histories have separate persistence owners. Models expose their accepted records directly; persistence codecs define serialization.
