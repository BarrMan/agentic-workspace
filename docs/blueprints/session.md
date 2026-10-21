# Session and SessionRuntime

Part of [BLUEPRINT](../BLUEPRINT.md). Session owns runtime state and its durable projection. SessionRuntime starts, resumes, stops, observes, and attaches. Harness is the provider boundary: [Harness](harness.md).

## Types

```ts
type Session = {
  id: SessionId
  taskId: TaskId
  modeId: ModeId
  providerSessionId: string | null
  state: SessionState
  activity: SessionActivity
  idleSince: number | null
  execution: RunningExecution | null
  runtime: SessionRuntime
  onStateChanged: (sessionId: SessionId, state: SessionState, activity: SessionActivity) => void  // set by Controller
}

type SessionRecord = {
  id: SessionId
  taskId: TaskId
  modeId: ModeId
  providerSessionId: string | null
}

type RunningExecution = {
  id: ExecutionId
  providerSessionId: string
  resources: CapturedResources
  attachSession(session: Session): void
  detachSession(session: Session): void
  stop(): void
}

type RuntimeEvidence = {
  state: SessionState
  activity: SessionActivity
}
```

## Session States

| State | Meaning |
|---|---|
| `running` | Execution exists and is processing. |
| `parked` | Execution exists (harness, process, pane) with no active turn. Selecting it attaches its live pane; it does not resume. |
| `stopped` | No execution. Resume restarts the exact retained conversation. |
| `starting` | Startup in progress; unavailable. |
| `unknown` | Evidence is insufficient. Never infer `running` or `stopped`. |

Activity is separate from lifecycle state. `idle` is the only activity eligible for soft-limit eviction.

## Session Operations

```ts
Session.start(request) {
  this.execution = this.runtime.start(request)  // Session sees only SessionRuntime
  this.providerSessionId = this.execution.providerSessionId
  this.state = "running"
  this.activity = "running"
  this.idleSince = null
  this.execution.attachSession(this)
}

Session.resume(request) {
  this.state = "starting"
  this.activity = "unknown"
  this.idleSince = null

  try {
    this.execution = this.runtime.resume(this.providerSessionId, request)
  } catch (error) {
    this.state = "stopped"
    throw error
  }

  this.providerSessionId = this.execution.providerSessionId
  this.state = "parked"                             // no initial instruction is replayed
  this.activity = "unknown"
  this.idleSince = null
  this.execution.attachSession(this)
}

Session.stop() {
  if (this.execution) this.runtime.stop(this.execution)
  this.clearExecution()
}

Session.observe() {
  if (!this.execution) return { state: "stopped", activity: "unknown" }
  return this.runtime.observe(this.execution)
}

Session.applyObservation(evidence) {
  if (evidence.activity == "idle") {
    if (this.activity != "idle") this.idleSince = Date.now()
  } else {
    this.idleSince = null
  }

  this.state = evidence.state
  this.activity = evidence.activity
}

Session.clearExecution() {
  if (this.execution) this.execution.detachSession(this)
  this.execution = null
  this.state = "stopped"
  this.activity = "unknown"
  this.idleSince = null
}

Session.routeExecutionEvent(execution, evidence) {
  if (execution != this.execution) return           // stale incarnation
  this.applyObservation(evidence)
  this.onStateChanged(this.id, this.state, this.activity)
}

Session.record() {
  return {
    id: this.id,
    taskId: this.taskId,
    modeId: this.modeId,
    providerSessionId: this.providerSessionId,
  }
}

Session.fromRecord(record, runtime) {
  return new Session({
    ...record,
    runtime,
    state: "stopped",
    activity: "unknown",
    idleSince: null,
    execution: null,
    onStateChanged: null,
  })
}
```

## SessionRuntime

```ts
SessionRuntime.start(request) {
  return this.harness.launch(request)
}

SessionRuntime.resume(providerSessionId, request) {
  if (!providerSessionId) throw new Error("resume requires a retained conversation")
  return this.harness.resume(providerSessionId, request)
}

SessionRuntime.stop(execution) {
  try {
    this.harness.stop(execution)
  } finally {
    this.terminalHost.release(execution.resources)
  }
}

SessionRuntime.observe(execution) {
  return this.harness.observe(execution)
}

SessionRuntime.attach(session) {
	return this.terminalAttachment(session) // pane target, transport, output path, bootstrap text
}

SessionRuntime.detach(attachment) {
  this.terminalHost.detach(attachment)               // detach never stops execution
}
```

`Session` knows only the `SessionRuntime` operations above. It never receives a Harness, provider adapter, or execution-host handle. `SessionRuntime` owns the Harness boundary; the provider-specific sequence is not part of the Session contract or SessionRuntime's public operations.

## Harness boundary

`SessionRuntime` depends on the [Harness](harness.md) interface. `Harness.launch` returns only after its provider-specific execution is initialized and the initial instruction is accepted. `Harness.resume` returns only after the exact retained conversation is initialized. Provider receipts, readiness checks, prompt-delivery mechanics, and adapter event names are private to Harness. Session and SessionRuntime never call them. Resume never sends the initial instruction again.

## Lifecycle

Create, resume, and stop are Controller operations: [Controller](controller.md#create-a-session).

## Invariants

- Session identity survives execution replacement; provider identity is separate. A provider ID alone proves neither liveness nor resumability.
- Only the current execution may update Session state. Stale events are discarded.
- Stop retains the conversation and requires actual cleanup. A metadata write is not proof of stop.
- Observation is ephemeral. `unknown` never authorizes stop, resume, or a `stopped` claim.
- Activity is separate from lifecycle state. Only positively observed idle sessions are soft-limit eligible; running, permission, and unknown are protected.
- A start is never blocked. Idle eviction is longest continuously idle first.
- Start and resume occur only from an explicit Controller operation, with one attempt. No timer, signal, or cleanup path retries.
- Terminal-backend code lives only in Renderer. SessionRuntime exposes the abstract boundary.
- Turn completion is not execution exit. Initial delivery happens once.
- Workspace-context shape is validated across the process boundary; ownership is checked separately and is never inferred from shape validation.
- Child processes inherit the parent environment unchanged; no environment variables are stripped. Workspace/session identities and selected tmux socket are explicitly set and protected from preset/adapter replacement; inherited credentials are exposed as an accepted consequence.
- Process identity is PID plus process name, without start-time or UID fencing. Inspection failure or unknown identity fails closed and never authorizes termination or clean completion; same-name PID reuse is an accepted limitation.
- Tmux takeover ownership fields remain separate typed values and are compared independently, never concatenated and reparsed. Missing or ambiguous ownership fails closed. Tmux absence requires a structured nonzero tmux result followed by a successful exact session inventory check; inspection, permission, and timeout failures are not absence and never authorize cleanup.
