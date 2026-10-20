# Storage

Part of [BLUEPRINT](../BLUEPRINT.md). Storage owns model-typed workspace persistence and presentation configuration. It is the only component that knows workspace paths, record formats, storage codecs, locks, and file watching. It validates encoding and never applies model rules. Runtime execution resources belong to SessionRuntime, Harness, or Renderer. Paths and formats are fixed by [ADR-0002](../adr/0002-storage-filesystem-paths-formats.md).

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

Storage.loadTasks() {
  return this.readTaskRecords(this.tasksPath())
}

Storage.loadMilestones() {
  return this.readMilestones(this.milestonesPath())
}

Storage.loadArchivedMilestones() {
  return this.readMilestones(this.archivedMilestonesPath())
}

Storage.loadUserAgentConfiguration() {
  return this.readUserAgentConfiguration()
}

Storage.loadProjectAgentConfiguration() {
  return this.loadProjectConfig()?.agentConfiguration ?? null
}

Storage.saveTask(task) {
  this.writeAtomic(this.taskPath(task.id), this.serializeTaskRecord(task.serialize()))
  this.writeAtomic(this.sessionsPath(task.id), JSON.stringify(this.sessionState(task)))
}

Storage.allocateTaskId(prefix) {
  // Called under the create lock.
  counter = this.readTaskCounter() ?? {}
  if (counter[prefix] is missing) {
    counter[prefix] = { next: this.maximumExistingTopLevelTaskNumber(prefix, [active, completed, archived, siblingWorktrees]) ?? 0 }
    this.writeAtomic(this.taskCounterPathInCreateLockDirectory(), JSON.stringify(counter))
  }
  while (true) {
    counter[prefix].next++
    this.writeAtomic(this.taskCounterPathInCreateLockDirectory(), JSON.stringify(counter))
    try {
      id = `${prefix}-${counter[prefix].next}`
      this.saveTaskCreateOnly(id)
      return id
    } catch (error) {
      if (!isTaskTargetConflict(error)) throw error
    }
  }
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

- Only Storage holds a workspace filesystem handle. Controller, Renderer, and CLI never read or write workspace records, construct workspace storage paths, or hold a workspace filesystem handle. Renderer may use Storage only for presentation configuration; CLI calls Controller only.
- Runtime-host I/O stays with SessionRuntime, Harness, or Renderer: provider receipts, terminal sockets and panes, process handles, logs, and user-selected input files are not workspace persistence.
- `loadTasks`, `loadMilestones`, and `loadArchivedMilestones` are the read operations for Controller workflows; no caller reaches through Storage to its filesystem.
- Task records are `task.md` Markdown with YAML frontmatter, schema version 3. The Markdown record codec extracts frontmatter with `gray-matter` and validates it against the record schema.
- Task IDs are `PREFIX-NUMBER` strings with optional dotted numeric subtask segments. New IDs are written uppercase; existing stored casing is preserved, and identity comparison is case-insensitive. Numeric segments are preserved exactly (`TASK-01` differs from `TASK-1`). Alphanumeric IDs are invalid. Lookup does not normalize numeric segments, accept bare numbers, or infer prefixes. The ID contract is defined in [TASK-003](../specs/tasks.md#task-003-task-identity).
- `task-counter.json` lives in the directory that owns the create lock (shared across linked worktrees; otherwise the AgenticWorkspace directory). Its shape is per-prefix, for example `{ "TASK": { "next": 2 }, "OPS": { "next": 2 } }`, where `next` is the last allocated top-level number. Under the create lock, allocation increments the selected prefix entry and atomically persists it (temporary file plus rename) before create-only save. A target-container conflict consumes another number and retries; numbers are never decremented or reused. A missing prefix entry is bootstrapped once from that prefix's maximum existing top-level task number across active, completed, and archived containers, including sibling worktrees as needed (zero when none exist); there is no per-create scan. A corrupt counter is an error and does not trigger a scan. The create lock cannot be bypassed.
- Session state is `state.json` JSON version 2; presentation state is `view-state.json` JSON.
- Storage returns records; Controller constructs Task models with the Session factory.
- Task metadata and session relationships are separate records; `loadProject` rejoins them.
- Selection is part of the task record, not a preference.
- A durable write completes before Controller publishes a signal.
- Storage never starts, stops, selects, or manages provider-owned Session state.
- Single-session sidecar deletion derives targets from the trusted task directory and validated session ID, canonicalizes the ancestor directory, verifies containment, checks targets with `lstat`, and unlinks only regular files. Recursive purge containment is determined with path/filesystem APIs, never regex or string-prefix comparisons.
- Ordinary Core startup/load performs no task/config migration and creates no migration state or manifest directory. The maintenance invocation `bun scripts/migrate-task-config.ts <project target>` is the only trigger for this migration; it covers root configuration, resolved project configuration, and records in active, completed, and archived task directories. Its no-op behavior, manifest ordering and placement, partial-completion reporting, and exactly-once source/target hash handling are specified by [TASK-023](../specs/tasks.md#task-023-explicit-task-and-configuration-migration), [CONFIG-015](../specs/configuration.md#config-015-priority-labels), and [CONFIG-016](../specs/configuration.md#config-016-date-format-tokens). For nonempty work the manifest is `task-config-migration.json` in the resolved project state root and is written before record rewrites; a no-op creates neither that manifest nor the state root/manifest directory. The distinct legacy agent-preset command conversion remains a selected-workspace startup migration under [CONFIG-008](../specs/configuration.md#config-008-agent-settings).
