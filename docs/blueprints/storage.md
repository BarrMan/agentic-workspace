# Storage

Part of [BLUEPRINT](../BLUEPRINT.md). Storage owns model-typed persistence and presentation configuration. It validates encoding and never applies model rules. Paths and formats are fixed by [ADR-0002](../adr/0002-storage-filesystem-paths-formats.md).

## Operations

```ts
Storage.loadProject(project) {
  taskRecords = []

  for (record of project.taskRecords) {
    record.sessions = this.loadSessionHistories(record.id)
    taskRecords.push(record)
  }

  return { taskRecords }
}

Storage.loadSessionHistories(taskId) {
  state = this.readJson(this.sessionsPath(taskId))

  return Object.entries(state.modes).map(([modeId, history]) => ({
    modeId,
    sessions: history.sessions,
    activeSessionId: history.activeSessionId ?? null,
  }))
}

Storage.saveTask(task) {
  this.writeAtomic(this.taskPath(task.id), this.serializeTaskRecord(task.serialize()))
  this.writeAtomic(this.sessionsPath(task.id), JSON.stringify(this.sessionState(task)))
}

Storage.sessionState(task) {
  return {
    version: 2,
    taskId: task.id,
    modes: Object.fromEntries(
      task.serializeSessions().map(history => [
        history.modeId,
        { sessions: history.sessions, activeSessionId: history.activeSessionId ?? undefined },
      ]),
    ),
  }
}

Storage.loadPresentationConfig() {
  return this.readJson(this.presentationPath())
}

Storage.savePresentationConfig(config) {
  this.writeAtomic(this.presentationPath(), JSON.stringify(config))
}

Storage.serializeTaskRecord(record) {
  return this.markdown.serialize(record)  // task.md: YAML frontmatter + Markdown body
}

Storage.readJson(path) {
  return JSON.parse(this.fs.read(path))
}

Storage.writeAtomic(path, content) {
  temporary = `${path}.${randomUUID()}.tmp`
  this.fs.write(temporary, content)
  this.fs.rename(temporary, path)
}
```

## Invariants

- Task records are `task.md` Markdown with YAML frontmatter, schema version 3.
- Session state is `state.json` JSON version 2; presentation state is `view-state.json` JSON.
- Storage returns records; Controller constructs Task models with the Session factory.
- Task metadata and session relationships are separate records; `loadProject` rejoins them.
- Selection is part of the task record, not a preference.
- A durable write completes before Controller publishes a signal.
- Storage never starts, stops, selects, or manages provider-owned Session state.
