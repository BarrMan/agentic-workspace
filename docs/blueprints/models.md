# Models

Part of [BLUEPRINT](../BLUEPRINT.md). Task and Session are defined in [Task](task.md) and [Session](session.md).

## Shared Types

Concrete record declarations live in [model/types.ts](../../src/model/types.ts); session, mode, configuration and execution-port declarations live in [model/session/types.ts](../../src/model/session/types.ts). These declarations supply names and shapes; [SPEC](../SPEC.md) owns their behavioral requirements.

- Task and session IDs are strings; task lookup and equality use the exact stored string, without normalized keys or aliases.
- `ModeId` identifies a project-catalogue profile. Task-scoped configuration cannot define a mode catalogue.
- `SessionSnapshot` separates lifecycle state from activity (`working`, `waiting`, `idle`, `unknown`) and continuous idle duration. Permission wait is `waiting` activity, not a lifecycle state.
- `AgentSession` is the retained record; `RunningExecution` is the current runtime handle. Neither is a replacement for the behavioral Session model.
- `SessionFactory` binds a durable record and its mode to a Session and runtime port. Application composition supplies it; Task does not construct provider adapters.

Selection belongs to Task relationships and workspace presentation state, not preference configuration. Model transformations own relationship checks; unknown inputs are validated once where accepted, and Storage codecs still validate persisted representations. A typed interface is not runtime validation.

## Configuration

[Config](../../src/model/session/config.ts) uses `Config.load(storage, builtIn)` to read user and project configuration through Storage's configuration-reader boundary. It is task-independent: callers pass accepted task overrides to `getConfig(...overrides)`. Config never loads a Task.

For overridable fields, precedence is built-in < user < project < caller overrides, preserving explicit `false`. Mode profiles come only from project configuration. `getConfig` returns resolved data without mutating the stored snapshots; `sessionSettings` and `modes` expose the corresponding resolved settings. `reload()` refreshes the snapshots after successful configuration persistence.

Explicit workspace initialization owns default catalogue creation. `Core.getProjectModeCatalog()` reads the required catalogue and fails when it is missing or invalid; ordinary load does not seed defaults or repair it. [Configuration requirements](../specs/configuration.md) own precedence and scope rules; [Storage configuration](storage.md#configuration-and-presentation-state) owns fresh locked configuration mutations.
