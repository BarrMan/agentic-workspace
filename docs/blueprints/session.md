# Session and SessionRuntime

Part of [BLUEPRINT](../BLUEPRINT.md). [Session](../../src/model/session/session.ts) owns conversation/execution behavior, runtime state and its durable record projection. Core orchestrates operations; SessionStore persists histories. SessionRuntime is Session's execution port, implemented by [HarnessSessionRuntime](../../src/runtime/session-runtime.ts). [Harness](harness.md) owns provider-specific launch and resume.

## Types

Exact declarations live in [model/session/types.ts](../../src/model/session/types.ts) and the [Session class/runtime port](../../src/model/session/session.ts).

| Type or property | Ownership |
|---|---|
| `AgentSession` / `session.record` | Read-only retained record: local task/session identity, preset, native conversation identity and launch/resource references. Mode membership belongs to the containing task history. `record` is a property, not a serializer operation. |
| `session.modeId` | Current mode membership; moving membership does not replace an execution or rewrite its launch identity. |
| `SessionSnapshot` / `session.view` | Ephemeral lifecycle state, activity and `idleSince`. Construction alone is not evidence of liveness or absence. |
| `session.execution` | Current `RunningExecution`, when owned by this Session. |
| `session.executionOwnership` | Distinguishes a current execution, an externally observed live execution, positively absent execution and unknown ownership. |
| `RunningExecution` | Execution identity, provider conversation identity, supported event capabilities, input/stop/observe operations and listener teardown. |
| `SessionLaunchContext` | Accepted task/mode/session identity, retained record, task-derived `cwd`, resolved configuration, profile, preset and initial prompt. |

SessionStore encodes retained records and relationships. Session keeps runtime state separate and updates its record when a provider establishes identity; Core persists that projection. No Task save or Session serialization wrapper owns history persistence.

## Session States

| State | Meaning |
|---|---|
| `running` | Execution exists and is processing. |
| `parked` | Execution exists (harness, process, pane) with no active turn. Selecting it attaches its live pane; it does not resume. |
| `stopped` | No execution. Resume restarts the exact retained conversation. |
| `starting` | Startup in progress; unavailable. |
| `unknown` | Evidence is insufficient. Never infer `running` or `stopped`. |

Activity is separate from lifecycle state: `working`, `waiting` (permission wait), `idle` or `unknown`. Only positively observed `idle` is eligible for soft-limit eviction.

## Session Operations

- `start(context)` validates the relationship to the requested mode, invokes the runtime once, installs the returned execution and updates its retained identity. Provider readiness is a prerequisite to successful return.
- `resume(context)` requires a retained exact conversation identity and positive stopped observation. It resumes once without replaying the initial instruction. Failure does not imply stopped state; any recoverable execution handle remains tracked with unknown state until cleanup is proven.
- `stop()` stops the current execution and clears its ownership/listeners only after success. Without a current handle, `prepareStop()` obtains a validated retained target; its returned stop operation performs cleanup. Metadata changes cannot stand in for stopping a process or pane.
- `observeRetained()` distinguishes positive absence, live external execution and uncertainty. It may add supported activity evidence but never starts, resumes or stops execution.
- `replaceLoadedRecord(record, modeId)` refreshes accepted durable fields without replacing current execution state. `moveToMode` changes membership only. Neither is a parser or recovery path.

Current-execution observation is a runtime subscription. Session discards stale-incarnation and unsupported events, separates turn completion from execution exit, and maintains continuous idle duration. No observation is persisted as lifecycle history. Internal event-handling helpers are implementation details, not additional public model APIs.

## SessionRuntime

The [SessionRuntime interface](../../src/model/session/session.ts) is the genuine execution boundary. It accepts `SessionLaunchContext` for start/resume, supplies current-execution stop and event subscriptions, classifies retained executions, prepares retained stop targets, and exposes attachment/detachment and exact-conversation questions. The [implementation](../../src/runtime/session-runtime.ts) delegates launch/resume to Harness and current-execution stop/observe to the returned RunningExecution; retained process operations remain runtime-owned.

Session receives this port, never a provider adapter or execution-host implementation. Provider-specific readiness, receipts and event names remain behind Harness/runtime. Runtime attachment accepts the retained `AgentSession` record and returns `TerminalAttachment`; Renderer owns mounting and terminal transport. Detach never stops execution.

## Harness boundary

`SessionRuntime` depends on the [HarnessProvider](harness.md#interface) launch/resume interface. Launch returns only after provider-specific initialization and accepted initial submission. Resume returns only after the exact retained conversation is initialized, without sending the initial instruction again. RunningExecution carries normalized event capabilities; Session consumes only supported evidence.

## Lifecycle

Core owns create, resume, stop and shutdown orchestration: [Controller](controller.md#create-a-session). Task owns history membership and replacement selection. SessionStore owns durable histories and short locked state writes. Provider startup is outside that short state lock while the outer task operation lock continues to exclude deletion. A failed or uncertain cleanup must retain the last durable tracking evidence.

Task creation provisions empty session state and required resources before session operations. Missing or malformed required state fails through [Storage](storage.md#session-histories); ordinary session loading does not reset, repair or lazily provision it.

## Invariants

- Session identity survives execution replacement; provider identity is separate. A provider ID alone proves neither liveness nor resumability.
- Only events from the current execution may update Session state. Stale events are discarded; retained-execution observation has its own evidence checks.
- Stop retains the conversation and requires actual cleanup. A metadata write is not proof of stop.
- Observation is ephemeral. `unknown` never authorizes stop, resume, or a `stopped` claim.
- Activity is separate from lifecycle state. Only positively observed idle sessions are soft-limit eligible; running, permission, and unknown are protected.
- The soft limit never blocks a start. Idle eviction is longest continuously idle first.
- Start and resume occur only from an explicit Controller operation, with one attempt. No timer, signal, or cleanup path retries.
- Terminal-backend code lives only in Renderer. SessionRuntime exposes the abstract boundary.
- Turn completion is not execution exit. Initial delivery happens once.
- Workspace-context shape is validated across the process boundary; ownership is checked separately and is never inferred from shape validation.
- Child processes inherit the parent environment unchanged; no environment variables are stripped. Workspace/session identities and selected tmux socket are explicitly set and protected from preset/adapter replacement; inherited credentials are exposed as an accepted consequence.
- Process identity is PID plus process name, without start-time or UID fencing. Inspection failure or unknown identity fails closed and never authorizes termination or clean completion; same-name PID reuse is an accepted limitation.
- Tmux takeover ownership fields remain separate typed values and are compared independently, never concatenated and reparsed. Missing or ambiguous ownership fails closed. Tmux absence requires a structured nonzero tmux result followed by a successful exact session inventory check; inspection, permission, and timeout failures are not absence and never authorize cleanup.
