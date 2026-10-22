# Controller

Part of [BLUEPRINT](../BLUEPRINT.md). Controller is the sole operation boundary. It owns models, persists through [Storage](storage.md), calls [Session](session.md) operations, and publishes post-commit [signals](signals.md). It does not know SessionRuntime.

## State

```ts
Controller {
  tasks: Map<TaskId, Task>
  modes: Map<ModeId, Mode>
  sessions: Session[]          // owned live sessions, including rediscovered surviving executions
  maxSessions: number          // project-wide soft limit; supplied at startup
  selectedTask: Task
  selectedMode: Mode
  selectedSession: Session | null
  newSession: SessionFactory
  signals: Signals
  storage: Storage
  configuration: Config
}
```

## Load

```ts
// application.ts
configuration = await Config.load(storage)
controller.load(project)
renderer.init(controller)

Controller.load(project) {
  data = this.storage.loadProject(project)
  tasks = data.taskRecords.map(record => Task.fromRecord(record, this.newSession))

  this.tasks = new Map(tasks.map(task => [task.id, task]))
  this.modes = this.configuration.modes  // loaded snapshot; Controller does not re-read files
  this.sessions = []
  this.selectedTask = tasks[0]
  this.selectedMode = this.modes.get(this.selectedTask.selectedModeId)
  this.selectedSession = this.selectedTask.activeSession
}
```

Loading only transfers persisted data into Controller state. It starts nothing and publishes nothing. Renderer initializes after Controller. Loading does not establish liveness; current observation discovers surviving executions and registers their Session models before attachment or lifecycle operations, without triggering soft-limit eviction. `selectedSession` may reference a retained Session whose liveness is not yet established.

## Live Sessions

```ts
Controller.addSession(session, enforceLimit = true) {
  if (this.sessions.includes(session)) return

  this.sessions.push(session)

  if (enforceLimit) {
    while (this.sessions.length > this.maxSessions) {
      if (!this.removeLongestIdleSession()) break
    }
  }
}

Controller.removeSession(session) {
  this.sessions = this.sessions.filter(item => item !== session)
}

Controller.removeLongestIdleSession() {
  idle = this.sessions
    .filter(session => session.activity == "idle" && session.idleSince != null)
    .sort((left, right) => left.idleSince - right.idleSince)

  session = idle[0]
  if (!session) return null

  try {
    session.stop()
  } catch (error) {
    this.signals.publish("NoticeChanged", error)
    return null
  }

  this.removeSession(session)
  this.signals.publish("IndicationsChanged", session.id, session.state, session.activity)
  return session
}
```

`addSession` enforces the soft limit for start/resume; rediscovery calls it with `enforceLimit = false` to restore ownership without effects. A start is never blocked. Only positively idle sessions are stopped, longest continuously idle first; running, permission, and unknown sessions are protected. A failed eviction stop is reported and the limit may remain exceeded.

## Create a Session

```ts
Renderer.onKey("session.create", () => {
  controller.createSession(controller.selectedTask, controller.selectedMode)
})

Controller.createSession(task, mode) {
  session = task.createSession(mode.id)            // model creation and selection
  this.storage.saveTask(task)                      // reservation durable before start

  try {
    session.start({
      taskId: task.id,
      modeId: mode.id,
      sessionId: session.id,
      path: task.worktree,
      instructions: mode.config.prompt,
      configuration: mode.config,
    })
    this.storage.saveTask(task)                    // provider identity durable
  } catch (error) {
    session.stop()                                 // idempotent; may have no execution
    task.removeSession(session)
    this.removeSession(session)
    this.storage.saveTask(task)                    // rollback the reservation
    this.signals.publish("NoticeChanged", error)
    return null
  }

  this.addSession(session)
  this.selectedMode = mode
  this.selectedSession = session
  this.signals.publish("SelectionChanged", task.id, session.id)
  return session
}
```

`Task.createSession` owns the session record, history membership, and active selection. Controller owns durable reservation, start ordering, soft-limit admission, and publication.

## Resume a Session

```ts
Renderer.onKey("session.resume", () => {
  controller.resumeSession(controller.selectedSession)
})

Controller.resumeSession(session) {
  task = this.tasks.get(session.taskId)
  mode = this.modes.get(session.modeId)

  try {
    session.resume({
      taskId: task.id,
      modeId: mode.id,
      sessionId: session.id,
      path: task.worktree,
      configuration: mode.config,
    })
  } catch (error) {
    this.signals.publish("NoticeChanged", error)
    return null
  }

  this.addSession(session)
  this.storage.saveTask(task)
  this.selectedMode = mode
  this.selectedSession = session
  this.signals.publish("IndicationsChanged", session.id, session.state, session.activity)
  return session.execution
}
```

## Stop a Session

```ts
Renderer.onKey("session.stop", () => {
  controller.stopSession(controller.selectedSession)
})

Controller.stopSession(session) {
  task = this.tasks.get(session.taskId)

  session.stop()
  this.removeSession(session)
  this.storage.saveTask(task)
  this.signals.publish("IndicationsChanged", session.id, session.state, session.activity)
}
```

## Select

```ts
Controller.selectTask(task) {
  this.selectedTask = task
  this.selectedMode = this.modes.get(task.selectedModeId)
  this.selectedSession = task.activeSession
  this.signals.publish("SelectionChanged", task.id, this.selectedSession?.id ?? null)
}

Controller.selectSession(session) {
  task = this.tasks.get(session.taskId)

  task.selectSession(session.modeId, session.id)
  this.storage.saveTask(task)

  this.selectedSession = session
  this.selectedMode = this.modes.get(session.modeId)
  this.signals.publish("SelectionChanged", task.id, session.id)
}

Controller.findSession(sessionId) {
  for (task of this.tasks.values()) {
    session = task.findSession(sessionId)
    if (session) return session
  }

  return null
}

Controller.selectView(view) {
  this.signals.publish("ViewChanged", view)
}
```

Selection is Controller and Task state. It is not stored in preferences. `findSession` includes retained stopped sessions, so CLI resume does not depend on the live list.

## Update Task

```ts
Renderer.onKey("task.update", (change) => {
  controller.updateTask(controller.selectedTask.id, change)
})

Controller.updateTask(taskId, change) {
  task = this.tasks.get(taskId)
  previousDetails = { ...task.details }
  task.apply(change)                              // Task enforces its model rules

  try {
    this.storage.saveTask(task)                   // durable before publish
  } catch (error) {
    task.details = previousDetails                // in-memory model unchanged
    this.signals.publish("NoticeChanged", error)
    return
  }

  this.signals.publish("TasksChanged", task)
}
```

A failed save restores the previous details. No signal is published for the failed change.

## Observe Sessions

```ts
Controller.observeSessions() {
  for (session of this.sessions) {
    evidence = session.observe()
    changed = evidence.state != session.state || evidence.activity != session.activity
    session.applyObservation(evidence)

    if (changed) {
      this.signals.publish("IndicationsChanged", session.id, session.state, session.activity)
    }
  }
}
```

Observation updates state and activity only. Session tracks continuous idle duration. Observation never persists, starts, stops, retries, or evicts.

## Shutdown

```ts
async Controller.shutdown() {
  failures = []
  for (session of [...this.sessions]) {
    try {
      await session.stop()
      this.removeSession(session)
    } catch (error) {
      failures.push({ sessionId: session.id, error })
    }
  }

  if (failures.length) throw aggregateFailure(failures)
}
```

Renderer presents the close choice required by [SESSION-018](../specs/sessions.md#session-018-close-the-app-with-or-without-stopping-sessions). Ordinary close releases presentation without stopping execution. Force close awaits Controller-owned shutdown before reporting completion. Settle pending launches before taking the shutdown snapshot; input settlement follows [SESSION-019](../specs/sessions.md#session-019-settle-terminal-input-on-close-or-deletion). These are sequencing requirements, not a requirement for an additional close API.

Shutdown attempts every owned execution exactly once, even after a stop failure. Only successful stops leave the live list; failed or uncertain cleanup retains ownership and durable tracking. Propagate aggregate failures with session identities and completed effects after all attempts. Do not publish successful `Closed` on failed shutdown.

## Invariants

- Callers supply valid data. Controller does not re-validate parameters.
- Controller holds a Storage, never a workspace filesystem, workspace path, or workspace record format. Every workspace read and write, including milestone and task corpus reads, goes through Storage. Controller does not expose Storage to Renderer or CLI.
- Controller knows Task and Session; it does not know SessionRuntime.
- Loading transfers persisted data into state. Renderer initializes after `controller.load`.
- `sessions` includes owned live executions rediscovered after ordinary close; attachment never starts or resumes them.
- `addSession` and `removeSession` are the only live-list mutations.
- A start is never blocked. The soft limit stops only positively idle sessions, longest continuously idle first; running, permission, and unknown sessions are protected.
- Activity is observed separately from lifecycle state.
- Durable writes complete before signals. Signal handlers never call Controller operations.
- Only an explicit Controller operation starts or resumes a session; one attempt, no retry.
