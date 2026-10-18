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

`Configuration.loadModes` resolves each mode once at startup. No Controller operation resolves configuration.

```ts
Configuration.loadModes(project) {
  modes = new Map()

  for (record of project.modes) {
    modes.set(record.id, {
      id: record.id,
      config: this.resolve(record, project),
    })
  }

  return modes
}

Configuration.resolve(record, project) {
  return { ...record.config, ...project.settings }  // precedence is owned by SPEC configuration
}
```
