# Software Blueprint: Session and Harness

This document is part of [BLUEPRINT.md](../BLUEPRINT.md).

## Overview

Session is the concrete conversation owner; RunningExecution is its replaceable runtime incarnation; Harness is the provider-variation boundary. Task owns membership and relationship projections, while application coordination supplies explicit targeting, current configuration, admission/claims, and durability under the [application operation contract](../BLUEPRINT.md#application-controller-and-stores). Provider receipts remain inside Harness. Exact event types, constructors, and return signatures are owned by their implementation modules unless specified here.

## Component Ownership

| Component | Responsibility | Owned State | Dependencies |
|---|---|---|---|
| Session | Own a conversation across runtime replacement; route current-execution events and expose runtime observation | Application conversation identity, established provider identity, current execution association, ephemeral observed state, startup progress and required publication data, Session-level subscriptions | RunningExecution, Harness, application coordination for targeting and durable checkpoints |
| RunningExecution | Represent one execution incarnation and its provider/runtime operations | Provider/runtime handles, captured launch resources and incarnation provenance | Provider transport/runtime; Session for association and event routing |
| Harness | Encapsulate provider selection, launch, identity discovery, exact resume, initialization/readiness, runtime evidence, and execution integration | Provider-specific receipts and integration state for an operation | Provider implementation, validated launch/resume context, required identity/publication coordination |
| Task | Own Session membership and relationship projections, including selected-mode active identity | Task membership and selected-mode active Session ID | Session identity; application coordination |
| Application coordination | Orchestrate explicit targeting, configuration, admission/claims, publication, and durability | Operation claims and durable application records/evidence | Task, Session, Harness-facing operations, store |

Dependencies point from orchestration toward owned capabilities: Task and storage do not implement Session runtime transitions, and neither UI nor storage handles provider receipts. Task's `activeSession` is the derived live Session object for its selected mode's active ID; durable record serialization is separate. Identity alone does not establish liveness.

## Models and Relationships

### Session

**Purpose:** The stable application conversation owner, independent of any one runtime incarnation.

**Properties:**

| Property | Type | Description |
|---|---|---|
| `id` | Application identity | Stable across execution replacement and distinct from provider identity. Membership in one fixed task/mode is Task-owned. |
| `harnessSessionId` | Provider identity or absent | Established provider conversation identity, available after discovery and durably associated through application publication. A saved ID alone proves neither liveness nor exact resumability. Exact field spelling is illustrative. |
| `status` | Ephemeral observation | Distinguishes running, idle, stopped, unavailable/unknown, and permission-required evidence as supported. It is not a persisted historical enum; exact representation remains an implementation choice. |
| `execution` | RunningExecution or absent | Current incarnation. Absence in this process does not prove no live execution exists elsewhere. |
| Startup/unfinished-operation state | Progress and publication data | Session owns progress and required publication data; application makes necessary creation/resource evidence durable. Resolved progress and past stop-versus-failure reasons need not become history. |

**Relationships:** One Session retains one conversation identity and may successively associate with RunningExecution incarnations. It can have Session-level subscribers across replacement. Task membership is separate from the Session object.

**Invariants:** Stop retains conversation identity/history. Exact resume may install a replacement execution but does not create a new conversation. A provider ID alone does not establish liveness or resumability.

### RunningExecution

**Purpose:** One provider/runtime incarnation supplied by Harness and associated as the Session's current execution.

**Properties:**

| Property | Type | Description |
|---|---|---|
| Established identity and provenance | Provider identity and captured resources | Correlates this execution with the conversation and identifies resources needed to interact with exactly this incarnation. |
| Incarnation token | Process-local token, optional | May protect callbacks from stale incarnations; its representation is not prescribed and it is not durable conversation identity. |
| Runtime handle | Provider-specific | Owned by the execution implementation; no approved mandatory list of handle fields exists. |

**Relationships:** Session owns the current association; Harness supplies the execution; execution implementations own provider/runtime handles and operations.

**Invariants:** Durable ownership/resource evidence is necessary; PID or shared-socket access alone is insufficient. Handles stay bound to resources captured for that launch, not whichever pane/session later occupies a lookup.

### Harness

**Purpose:** Provider variation boundary for creation, exact resume, readiness, identity, runtime evidence, and execution integration.

**Properties:**

| Property | Type | Description |
|---|---|---|
| Provider implementation | Provider-specific | Defines supported identity, initialization, submission, observation, and event evidence. |
| Operation receipts | Provider-specific | Consumed internally; not exposed to UI or storage. |

**Relationships:** Receives resolved provider configuration and validated bounded context from application coordination; creates or resumes RunningExecution for Session.

**Invariants:** Possession of a provider ID or evidence of liveness alone does not prove resumability. Unsupported evidence remains explicit rather than inferred from silence.

## Component Contracts

### Session

**Responsibility:** Own conversation-level state and operations, associate the current execution, and route its events. All operations below are Session-owned; application coordination supplies explicit targeting, configuration, admission/claims, and durability. Session does not own Task membership or a store lock.

**Dependencies:** RunningExecution, Harness, application coordination for required checkpoints and publication.

**Interface:**

```ts
class Session {
  id: ApplicationIdentity
  harnessSessionId: ProviderIdentity | absent
  status: EphemeralRuntimeObservation
  execution: RunningExecution | absent

  start(operation: StartupOperation): Promise<Session>
  resume(context: ValidatedResumeContext): Promise<RunningExecution>
  stop(): Promise<Settlement>
  inject(prompt: Prompt): Promise<DeliveryResult>
  observe(): Promise<RuntimeEvidence>
  applyAndPublish(change: SessionChange): Promise<void>
  onPermissionsRequired(handler: Handler): Subscription
  onAgentRunning(handler: Handler): Subscription
  onAgentStop(handler: Handler): Subscription
}
```

**Contract:**
- **Preconditions:** Startup requires a provisionally constructed Session, prior durable reservation, launch inputs, and awaited publication checkpoints. Resume requires exact retained provider identity, current effective configuration, validated provider/project/working paths, and required ownership preflight before destructive effects. Stop targets the exact current execution with validated ownership/incarnation, or sufficient evidence to settle an already-ended execution. Injection requires explicit subsequent input and a usable current execution.
- **Postconditions:** Startup returns the same conversation after Harness readiness and required checkpoints; it neither reserves membership again nor constructs a second Session. Resume continues the same conversation with a current execution, attaches its subscriptions, and disconnects obsolete listeners. Stop releases/stops the owned execution but retains conversation identity/history; Task separately chooses any survivor. Injection delivers through the execution path but claims neither answer nor turn completion. Observation reports evidence or explicit unknown/unavailable/error and does not command lifecycle changes. Model application is synchronous; required durable writes are awaited by application coordination.
- **Failures:** On startup or initial-instruction failure, report the error and stop without continuing, automatic recovery, retry, or rollback; preserve tracking for any execution that may still be running and report completed effects. Only final durable publication failure after startup stops the new execution and rolls back its provisional relationship; retain tracking if execution may still be running. Resume failure follows SPEC's exact-resume policy; do not silently create a new conversation, replay initial instructions, or use synthetic input. Stop awaits actual cleanup outside the store lock; cleanup or later publication failure surfaces the error and completed effects. Injection reports delivery failure and never silently retargets or invents a resume/fresh-session policy. Harness never manages provider-owned configuration, data, or state.
- **Lifecycle:** Construct the provisional Session once. Construction and `start(operation)` may be separate to satisfy Task's synchronous reservation; construction/start describe one creation, not two factories invoked in sequence. Startup runs outside the store lock. Session-level subscribers survive execution replacement; obsolete execution listeners are disconnected. After final creation publication succeeds, later execution failures are ordinary runtime failures, not retroactive creation failures.

### RunningExecution

**Responsibility:** Encapsulate operations and resources for exactly one runtime incarnation.

**Dependencies:** Provider transport/runtime; Session for current-incarnation association and event routing.

**Interface:**

```ts
class RunningExecution {
  identity: ProviderIdentity
  provenance: CapturedExecutionResources

  deliver(input: Input): Promise<DeliveryResult>
  deliverKey(key: Key): Promise<DeliveryResult>
  stop(): Promise<void>
  observe(): Promise<RuntimeEvidence>
  subscribe(event: SupportedEvent, handler: Handler): Subscription
}
```

**Contract:**
- **Preconditions:** Operations target the intended current execution; stop requires verified owned launch resources revalidated against replacement. Input/key delivery requires a usable captured transport. Observation requires relevant execution/conversation evidence.
- **Postconditions:** Delivery awaits transport/provider delivery, sends through the captured endpoint, and does not imply processing or answering. Stop releases that execution's resources. Observation is non-destructive and returns liveness/activity/permission/idle-duration evidence or explicit uncertainty. Subscriptions deliver supported signals and can be detached; subscription setup/disposal does not stop the agent.
- **Failures:** Delivery, cleanup, observation, and subscription errors remain surfaced/distinguishable; failed probes do not prove resource absence. No authority to kill a foreign or replacement execution.
- **Lifecycle:** Bind handles and listeners to the resources/incarnation captured at launch. Replacement detaches obsolete listeners. A live-terminal attachment is a separate client operation; detach closes only that client's transport, not the execution/shared server, and implies no stored transcript.

### Harness

**Responsibility:** Create provider executions, establish identity, initialize/readiness, resume exactly, and supply provider-specific runtime evidence.

**Dependencies:** Provider implementation, resolved launch configuration, validated bounded launch/resume context, and required identity/publication coordination.

**Interface:**

```ts
class Harness {
  static from(preset: ResolvedPreset): Harness

  new(context: ValidatedLaunchContext): Promise<RunningExecution>
  resume(id: ProviderIdentity, context: ValidatedResumeContext): Promise<RunningExecution>
  inspect(context: RuntimeContext): Promise<RuntimeEvidence>
}
```

**Contract:**
- **Preconditions:** `from` receives resolved preset/provider launch configuration. `new` receives validated bounded launch context: execution directory/configuration, trusted identity/environment, preserved startup/bootstrap context, and required identity/publication coordination. `resume` receives exact saved conversation ID, current resolved inputs, validated provider/paths, and replacement preflight.
- **Postconditions:** `from` selects/configures the concrete Harness without allocating a conversation. `new` allocates execution, establishes identity, initializes, and delivers initial instructions exactly once; its promise resolves only after established conversation identity, provider initialization, and provider-supported acknowledgment of initial submission—not an answer. `resume` initializes an execution for the same conversation and resolves after exact identity and initialization evidence, without replaying initial instructions or sending a synthetic probe. Identity/runtime inspection encapsulates provider-specific discovery and exact-resume evidence. Current `HarnessProvider.launch` naming is source navigation only; `Harness.from`, `new`, and `resume` are illustrative design names.
- Established identity may be client-established at launch or confirmed later by the provider; adapters own proposed IDs and their launch command assembly.
- **Failures:** Configuration/construction errors reject. If resources were allocated without a returnable execution, Harness attempts cleanup and retains ownership evidence plus cleanup failure before rejecting. Impossible/mismatched resume rejects and never silently launches a fresh conversation. Partial startup cleanup obligations also apply to resume. Errors remain explicit; provider receipt handling stays internal.
- **Lifecycle:** Start with a factory, not a builder or retained object carrying mutable operation authority. Preserve existing provider startup/bootstrap artifact context and exactly-once delivery. The launch context carries necessary inputs, not unrestricted application state. Agent inputs use explicit trusted workspace identities and allowed preset values; validate reserved references and exclude ambient launcher state as specified by the [session input contract](../specs/sessions.md#starting-a-session). Required identity/resource evidence is made durable through application publication.

## Component Interactions

### Create a Session

**Trigger:** An admitted application creation operation with a durable reservation.

**Participants:** Application coordination, Session, Harness, RunningExecution, Task, store.

**Flow:**

```ts
Application.create(operation) {
  reservation = store.reserve(operation)
  session = Session.construct(reservation.identity, operation)
  await session.start(operation.withRequiredCheckpoints(application.publish))
  await application.publishFinalCreation(session)
  task.updateMembershipProjection(session)
}
```

**Completion:** The same provisionally constructed Session has established provider identity, readiness evidence, required checkpoints, and successful final durable creation publication.

**Failure:** Startup or required instruction/checkpoint failure is reported and stops without relationship rollback; retain tracking for any execution that may still run. Only final durable publication failure triggers stopping the new execution and rolling back its provisional relationship through Task, preserving tracking if execution may still run. A resolved Harness promise is not final durable creation success. After final publication, later execution failure is handled as Session runtime observation/event, not creation rollback.

### Resume a Session

**Trigger:** Explicit resume of a retained conversation with a saved provider identity.

**Participants:** Application coordination, Session, Harness, RunningExecution, store.

**Flow:**

```ts
Application.resume(session, context) {
  validateOwnershipAndPaths(context)
  execution = await session.resume(context)
  await application.publishResumeEvidence(session, execution)
}
```

**Completion:** Exact provider identity is correlated, initialization evidence is established, the replacement is current, and required publication completes.

**Failure:** Validate before destructive effects. Relative order of outgoing cleanup and replacement preparation is not fixed. Exact-resume failure is explicit; no fresh conversation fallback, initial-instruction replay, synthetic probe, or general rollback guarantee is implied.

### Stop or settle an execution

**Trigger:** Explicit stop or evidence that the particular runtime incarnation ended.

**Participants:** Application coordination, Session, RunningExecution, Task, store.

**Flow:**

```ts
Application.stop(session) {
  settlement = await session.stop()
  await application.publishSettlement(session, settlement)
  task.chooseAnySurvivor()
}
```

**Completion:** Actual resource cleanup and required settlement publication complete; conversation identity/history remain retained.

**Failure:** Cleanup/publication failure is surfaced with completed effects reported truthfully. Metadata writes do not prove stop, and Task's survivor choice is separate from Session runtime transition.

### Route runtime events and observe

**Trigger:** Provider-supported event, runtime query, or client terminal attachment request.

**Participants:** Provider implementation, RunningExecution, Session, application coordination, UI terminal host where applicable.

**Flow:**

```ts
Session.route(event, origin) {
  if (!isCurrentExecution(origin)) return
  observation = updateEphemeralObservation(event)
  application.validateBeforeDurableEffect(event, observation)
}
```

**Completion:** Current-execution evidence updates ephemeral observation; any durable application effect follows publication validation. Terminal attachment is separately authorized for the client's selected session identity.

**Failure:** Stale-origin notifications cannot update the current execution or a removed/replaced record. Unsupported events are explicit; silence, polling gaps, and absent events do not prove idle or permission absence. Observation alone causes no lifecycle reconciliation write. Client detach does not stop the execution/shared server.

## Essential Algorithms

### Readiness and identity correlation

**Purpose:** Ensure launch/resume does not report a usable conversation before provider-supported identity, initialization, and required initial-submission evidence are established.

**Pseudocode:**

```text
launch(context):
  resources = allocate(context)
  try:
    identity = discoverAndCorrelateConversation(resources)
    initialization = await providerSupportedInitialization(identity)
    submission = await providerSupportedInitialSubmission(identity)
    require(identity is established and correlated)
    require(initialization proves provider initialization)
    require(submission acknowledges initial instruction submission)
    return execution(identity, resources)
  catch error:
    attempt cleanup(resources)
    retain ownership evidence and cleanup failure if cleanup is incomplete
    reject error
```

**Guarantees:** Spawning alone is insufficient; no universal standalone “input-ready” event is required. A pre-processing hook does not prove processing succeeded; submission acknowledgment is not a completed answer. No arbitrary sleeps, invented probe-capability flags, synthetic prompts, or replayed startup instructions establish readiness. Each provider identifies what its actual signals prove and correlates them with the expected conversation. Provider readiness precedes, but does not replace, required application publication.

**Implementation freedom:** Exact provider signals/parsing, readiness matrix, method names, and internal receipt representation are provider/Harness design. Deterministic adapter tests and live-provider acceptance are distinct evidence; this contract does not certify either.

## Architectural Invariants

- Session identity is stable across execution replacement; provider identity is distinct, and neither identity alone proves liveness or resumability.
- Only the current execution incarnation may mutate current Session observation; stale callbacks cannot mutate its replacement or a removed/replaced record.
- Task owns membership and relationship projections; Session owns runtime transitions; application coordination owns targeting, admission/claims, and durable publication; Harness owns provider receipts and integration.
- Startup reservation precedes asynchronous startup; the provisional Session is constructed once, and successful Harness readiness is not final durable creation success.
- Stop retains the conversation and requires actual cleanup evidence; a metadata write or failed probe is not proof of cleanup.
- Observation is non-destructive and ephemeral; unsupported evidence, unknown state, errors, and stopped/idle are not conflated.
- Provider-supported turn completion is distinct from readiness/submission acknowledgment and execution exit. An ambiguous stop signal cannot mean both turn completion and process exit; completed answers do not authorize cleanup or conversation removal.
- Session subscriptions survive execution replacement, execution listeners are detached/replaced, and provider-specific unsupported events are not implied to exist universally.
- Inputs to the agent are bounded by the [SPEC session input contract](../specs/sessions.md#starting-a-session); ambient launcher state is excluded.

## Open Design Decisions

| Decision | Constraints | Status |
|---|---|---|
| Exact Session/RunningExecution event names, payloads, capability representation, unsubscribe API, handler-error delivery, and ordering beyond current-execution routing | Must distinguish turn completion from execution exit; provider support and signal meaning must be explicit; listener replacement/teardown is required | Open |
| Exact observation/result representation and Session subscription return shape | Must preserve explicit unknown/unavailable/error and avoid implying unsupported universal events | Open |
| Exact execution-incarnation token representation | May protect callbacks, is process-local, and is not durable conversation identity | Open |
| Relative ordering of outgoing cleanup and replacement preparation during resume | Validate ownership and paths before destructive effects; exact resume must not fall back to a new conversation | Open |
| Harness factory placement/signature and concrete operation signatures | Illustrative names only; factory selection must not allocate a conversation or carry mutable operation authority | Open |
| Provider-specific readiness evidence and parsing | Must establish correlated identity, initialization, and initial-submission acknowledgment without claiming answer completion; each provider documents actual signal meaning | Open |
| Bootstrap/artifact context representation and disposition | Preserve existing startup/bootstrap artifact context and exactly-once delivery; replacement or data disposition requires approval | Open |
