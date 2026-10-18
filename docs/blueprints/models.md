# Models

Part of [BLUEPRINT](../BLUEPRINT.md). Task and Session are defined in [Task](task.md) and [Session](session.md).

## Shared Types

```ts
type TaskId = string
type SessionId = string
type ModeId = string
type ExecutionId = string

type View = "workspace" | "board"
type SessionState = "running" | "parked" | "stopped" | "starting" | "unknown"
type SessionActivity = "running" | "idle" | "permission" | "unknown"

type Mode = {
  id: ModeId
  config: ResolvedConfig
}

type Preferences = {
  presentation: PresentationConfig
}

type SessionFactory = (taskId: TaskId, modeId: ModeId, record?: SessionRecord) => Session
```

Selection is Controller and Task state, not a preference. `Preferences` holds presentation only.

TaskDetails, ConfigInputs, Approval, ResolvedConfig, PresentationConfig, Worktree, and Project are SPEC-owned shapes.

## Configuration

`Config.load(storage)` reads user and project agent configuration at startup through [Storage](storage.md). Config knows nothing about Task or Session. `getConfig(...overrides)` returns a fresh field-wise merge: built-in < user < project < overrides. Explicit `false` survives. `reload()` replaces the snapshot after a successful configuration save.

```ts
Config.load(storage) {
  config = new Config(storage)
  await config.reload()
  return config
}

Config.reload() {
  user = await this.storage.loadUserAgentConfiguration()
  project = await this.storage.loadProjectAgentConfiguration()
  this.userConfiguration = clone(user)
  this.projectConfiguration = clone(project)
}

Config.getConfig(...overrides) {
  config = merge(builtIn, this.userConfiguration, this.projectConfiguration, ...overrides)
  return clone(config)  // never mutate the snapshot
}

Config.sessionSettings  // resolveSessionSettings(getConfig())
Config.modes             // getConfig().modes
```

Task-scoped overrides are passed to `getConfig` by the caller; Config never loads a Task.
