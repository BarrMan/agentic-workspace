# Task

Part of [BLUEPRINT](../BLUEPRINT.md). Task owns task-local mode selection and session relationships. It does not perform I/O or start execution. Session is defined in [Session](session.md).

## Type

```ts
type Task = {
  id: TaskId
  details: TaskDetails
  configInputs: ConfigInputs
  selectedModeId: ModeId
  modes: Map<ModeId, ModeSessions>
  worktree: Worktree | null
  worktreePolicy: "enabled" | "disabled" | null
  approval: Approval
  newSession: SessionFactory
}

type ModeSessions = {
  sessions: Session[]
  activeSessionId: SessionId | null
}
```

## Derived State

```ts
get Task.activeSession() {
  history = this.modes.get(this.selectedModeId)
  if (!history) return null
  return history.sessions.find(session => session.id === history.activeSessionId) ?? null
}
```

## Operations

```ts
Task.apply(change) {
  Object.assign(this.details, change)             // schema validation happened before the Controller call
}

Task.createSession(modeId) {
  history = this.modes.get(modeId) ?? { sessions: [], activeSessionId: null }
  this.modes.set(modeId, history)

  session = this.newSession(this.id, modeId)      // factory binds the Session runtime
  history.sessions.push(session)
  history.activeSessionId = session.id
  this.selectedModeId = modeId
  return session
}

Task.removeSession(session) {
  history = this.modes.get(session.modeId)
  index = history.sessions.findIndex(item => item === session)

  if (index < 0) return

  history.sessions.splice(index, 1)

  if (history.activeSessionId == session.id) {
    history.activeSessionId = history.sessions[0]?.id ?? null
  }
}

Task.selectSession(modeId, sessionId) {
  history = this.modes.get(modeId)
  history.activeSessionId = sessionId
  this.selectedModeId = modeId
}

Task.findSession(sessionId) {
  for (history of this.modes.values()) {
    session = history.sessions.find(item => item.id === sessionId)
    if (session) return session
  }

  return null
}

Task.equals(other) {
  return taskIdsEqual(this.id, typeof other === "string" ? other : other.id)
}

Task.equalsDeep(record) {
  return isDeepStrictEqual(this.serialize(), record)
}

Task.ready(graph) {
  return getTaskReadiness(this.serialize(), graph)
}

Task.fromRecord(record, newSession) {
  task = new Task(record)
  task.newSession = newSession
  task.modes = new Map()

  for (modeRecord of record.sessions) {
    task.modes.set(modeRecord.modeId, {
      sessions: modeRecord.sessions.map(sessionRecord => newSession(task.id, modeRecord.modeId, sessionRecord)),
      activeSessionId: modeRecord.activeSessionId,
    })
  }

  return task
}

Task.serialize() {
  return {
    id: this.id,
    details: this.details,
    configInputs: this.configInputs,
    selectedModeId: this.selectedModeId,
    worktree: this.worktree,
    approval: this.approval,
  }
}

Task.serializeSessions() {
  return [...this.modes.entries()].map(([modeId, history]) => ({
    modeId,
    sessions: history.sessions.map(session => session.record()),
    activeSessionId: history.activeSessionId,
  }))
}
```

## Corpus Operations

`Task` owns one record. Cross-record rules belong to the model classes that operate on a loaded corpus:

```ts
TaskOrdering.compareIds(a, b)                 // ID, ordinal, and priority ordering
collection = new TaskCollection(tasks)
collection.directSubtasks(task)               // parent and direct-subtask relationships
collection.subtaskProgress(task, statuses)
TaskSearchIndex.apply(tasks, filter)          // shared search and filter predicates
validator = new DependencyValidator(tasks)
validator.validate(dependencies, target)       // dependency existence and cycle rules
```

Searchable-field extraction, task-ID variants, status-set matching, and modified-file matching are private to `TaskSearchIndex`; they are not separate model surfaces. There is no separate statistics or status-ordering module.

Controller loads the required corpus through Storage before invoking DependencyValidator. The validator owns existence and cycle rules over that corpus; it receives neither a store nor a persistence callback and performs no persistence I/O.

## Invariants

- Task model mutations are synchronous and free of I/O.
- Status is the stored display string and must match an exact configured label; no whitespace-insensitive status lookup is used. Terminal status is derived from the configured list. A single status is not a class.
- Priority is one exact label from the ordered configured `priorities` string array (default `High`, `Medium`, `Low`); no separate comparison value exists. Assignee is not part of Task or TaskDetails.
- Task never starts or stops execution; it creates Session records and receives Session operations from Controller.
- Selection is Task and Controller state, not a preference.
- A nonempty history's active ID names a retained member; an empty history has no active ID.
- Session mode membership changes only through the explicit move choice during [mode deletion](../specs/configuration.md#config-012-confirmed-mode-deletion-cleanup); ordinary mode selection never moves sessions.
- Removing a mode requires an empty history.
- Identity comparison, value equality, and readiness are Task operations. Readiness takes the corpus graph because it is derived from more than one record.
