# Software Blueprint: AgenticWorkspace

## Overview

AgenticWorkspace coordinates tasks, retained agent conversations, provider executions, durable storage, and user-facing clients. Task owns task/mode/session relationships; Session owns one conversation and its replaceable execution; Harness contains provider integration. The application coordinates operations and persistence, while UI and CLI adapters use the same application boundary. [SPEC](SPEC.md) owns product behavior and supported API scope; [PRODUCT](PRODUCT.md) owns goals and scope; [CONVENTIONS](CONVENTIONS.md) owns engineering practices; [ADRs](adr/README.md) preserve accepted technology choices and significant architectural rationale.

The detailed contracts are organized as parts of this blueprint: [Task](architecture/task.md), [Session, RunningExecution, and Harness](architecture/session-harness.md), and [Application, storage, and UI](architecture/application-boundaries.md). These parts specify properties, operations, events, completion, and failure contracts without duplicating implementation declarations.

## Component Ownership

| Component | Responsibility | Owned State | Dependencies |
|---|---|---|---|
| Task | Task properties, effective configuration, selected mode, mode-specific session relationships, and task/mode approval | Ordered session histories, membership, active-session IDs, selection, rollback relationships, approval | None of application persistence or process infrastructure |
| Mode catalogue | Configurable mode definitions | Mode instructions/settings in project configuration | Configuration owner |
| Session | One retained conversation and its startup, input, current execution, observation, and subscriptions | Application/provider conversation identities, current RunningExecution, listeners | Harness |
| RunningExecution | One runtime incarnation and its identity, interaction handles, ownership evidence, observation, and events | Ephemeral execution identity and runtime handles | Provider/terminal runtime, through Harness |
| Harness | Provider-specific creation, exact resume, identity discovery, initialization/readiness, and execution integration | Provider interaction state for an execution | Provider adapters and terminal runtime |
| Application controller | Shared operations, authoritative loading, admission/coordination, persistence sequencing, progress, rollback, and error reporting | In-flight operation coordination and recovery sequencing | Task, Session, stores/repositories, configuration, project paths, Git/process helpers |
| Stores and repositories | Canonical paths, locked reload, validation, serialization, and atomic durable writes | Durable records owned by each repository | Filesystem and application coordination |
| UI controller and feature modules | Translate user input into application operations; coordinate focus, navigation, details, and terminal attachment | Client-local focus, navigation, and attachment | Application operations, projections, terminal attachment |
| Renderer | Display read models and projections | No domain state | Read projections |
| Terminal runtime | Shared execution backend and live screen transport | Shared runtime and live channel | Harness/execution host |

Ownership is singular: controllers coordinate rather than reimplement Task or Session behavior; stores persist rather than interpret domain commands. Models do not depend on persistence. Lower-level storage, Git, process, and provider modules do not depend on CLI or UI. All supported entry points use the same application operations. Behavioral interfaces belong at real interchangeable production implementations, notably Harness providers; Task, Session, and application behavior use concrete owners rather than mirrored interfaces or a central contract package.

## Models and Relationships

### Task

**Purpose:** Owns task state and the relationships between configured modes and retained conversations.

**Properties:**

| Property | Type | Description |
|---|---|---|
| selectedModeId | ModeId | Task's selected configured mode |
| sessionHistories | Map<ModeId, SessionRecord[]> | Ordered retained conversations, each fixed to one mode |
| activeSessionId | Map<ModeId, SessionId?> | Stored selection for each mode; absent for empty history |
| approval | Map<ModeId, Approval> | Approval belongs to the task/mode pair |

**Relationships:** A project directory scopes tasks. Each session belongs to exactly one mode and is not moved or merged between modes. The live active Session is derived from the selected mode's active ID; the stored pointer is an ID, not another mutable object pointer. Worktrees and branches are execution contexts, not task stores or conversation identities.

**Invariants:** A nonempty history's active ID refers to a retained record; an empty history has no active ID. Task alone owns insertion, ordering, selection, survivor selection, removal, and rollback. Configuration visibility alone cannot discard histories; mode removal cannot silently drop nonempty history. Selection is distinct from presentation focus.

### Mode

**Purpose:** Represents a configurable category of instructions and settings in the project catalogue.

**Properties:**

| Property | Type | Description |
|---|---|---|
| modeId | ModeId | Fixed identity used by a task's history |
| configuration | ModeConfiguration | Current mode instructions/settings |

**Relationships:** Each Task has mode-keyed history and approval. Mode contents and artifacts are not interpreted by the domain. A Mode need not be a separate class.

**Invariants:** A session's mode is fixed. Configuration and mode definitions are not copied into conversation snapshots.

### Session

**Purpose:** Represents one retained conversation, independently of any particular runtime incarnation.

**Properties:**

| Property | Type | Description |
|---|---|---|
| sessionId | SessionId | Application conversation identity |
| harnessSessionId | ProviderSessionId | Established provider conversation identity, distinct from application identity |
| modeId | ModeId | Fixed owning mode |
| execution | RunningExecution? | Current replaceable runtime incarnation |
| subscriptions | Listener[] | Session listeners retained across execution replacement |

**Relationships:** Belongs to one Task and one Mode. Task stores its membership and selection; Session does not own those relationships or persist itself. Harness supplies provider identity and runtime evidence.

**Invariants:** Durable conversation identity/history is distinct from ephemeral runtime state. A saved provider ID, vanished frontend, or historical record does not establish liveness or exact resumability. Turn completion and execution exit are distinct.

### RunningExecution

**Purpose:** Represents one runtime incarnation of a Session.

**Properties:**

| Property | Type | Description |
|---|---|---|
| incarnationId | ExecutionIncarnation | Process-local identity used to reject obsolete callbacks |
| ownership | ExecutionOwnership | Validated resource references and provenance |
| interaction | ExecutionInteraction | Input, stop, observation, and event capabilities |

**Relationships:** A Session may replace its current execution without changing its retained conversation identity. Multiple clients may attach to one verified execution; attachment does not own the execution.

**Invariants:** Incarnation identity is not durable conversation identity. Missing or failed observation is uncertainty, not authorization for destructive action.

### Durable conversation and operation records

**Purpose:** Preserve retained conversation identity/relationships and enough unfinished-operation evidence to recover interrupted creation or cleanup.

**Properties:**

| Property | Type | Description |
|---|---|---|
| conversation records | SessionRecord[] | Identity, task/mode membership, ordered history, and selection |
| unfinished-operation evidence | RecoveryEvidence | Creation identity, prior selection, and recoverable resource ownership |
| configuration reference | PresetName / ModeId | References current configuration rather than snapshots |

**Relationships:** Task metadata serialization is distinct from session-history serialization. Workspace preferences and group state have separate persistence owners; read projections may combine these with observed sessions but are not writable lifecycle models.

**Invariants:** Do not persist a historical runtime lifecycle enum/log. Keep only bounded recovery bookkeeping for unfinished operations; retain unresolved cleanup evidence until settled. Do not duplicate launch paths in creation snapshots. [SPEC](SPEC.md) owns storage locations, defaults, and relocation outcomes.

## Component Contracts

### Task and Mode catalogue

**Responsibility:** Task owns synchronous relationship/property behavior. The configuration owner resolves the mode catalogue and effective inputs; callers do not implement precedence independently.

**Dependencies:** Task has no I/O or application-lock dependency. Configuration is supplied by the configuration owner.

**Interface:**

```ts
class Task {
  reserveSession(modeId: ModeId, identity: CreationIdentity): Reservation
  registerSession(modeId: ModeId, session: SessionRecord): void
  applySessionRecord(modeId: ModeId, record: SessionRecord): void
  selectSession(modeId: ModeId, sessionId: SessionId | undefined): void
  removeSession(modeId: ModeId, sessionId: SessionId): RollbackResult
}
```

**Contract:**
- **Preconditions:** Mutations operate on an authoritative hydrated Task and validate mode, membership, and creation identity.
- **Postconditions:** Relationship and selection changes are synchronous and model-owned; rollback can be applied to a freshly hydrated Task.
- **Failures:** Invalid preconditions do not authorize mutation. Exact return/error representations are implementation details.
- **Lifecycle:** No I/O, persistence, application locks, or process cleanup inside Task. The complete relationship contract is in [architecture/task.md](architecture/task.md).

### Session and RunningExecution

**Responsibility:** Session owns conversation startup, input, runtime observation, current execution, and subscriptions. RunningExecution represents a single replaceable runtime incarnation.

**Dependencies:** Harness for provider behavior; application coordination for persistence and Task relationships.

**Interface:**

```ts
class Session {
  start(context: LaunchContext): Promise<RunningExecution>
  resume(providerSessionId: ProviderSessionId, context: LaunchContext): Promise<RunningExecution>
  sendInput(input: Input): Promise<void>
  observe(): Promise<RuntimeObservation>
  stop(): Promise<void>
}
```

**Contract:**
- **Preconditions:** Resume validates current configuration, exact conversation identity, provider, and working paths before replacement activity.
- **Postconditions:** Launch readiness establishes identity, provider initialization, and supported acknowledgment of initial-instruction submission, but does not wait for an answer. Resume establishes the exact saved conversation and initialization without replaying the initial prompt or a synthetic probe.
- **Failures:** Provider and observation failures remain visible; unsupported events and missing signals do not imply idle activity. Turn completion is not execution exit.
- **Lifecycle:** Session reattaches current listeners and removes obsolete ones when execution is replaced. Full properties, operations, events, and promise contracts are in [architecture/session-harness.md](architecture/session-harness.md).

### Harness and provider adapters

**Responsibility:** Encapsulates provider construction, new conversation, exact resume, identity discovery, readiness, and execution integration.

**Dependencies:** Provider-specific adapters and execution/terminal runtime.

**Interface:**

```ts
interface HarnessProvider {
  launch(context: LaunchContext): Promise<RunningExecution>
  resume(providerSessionId: ProviderSessionId, context: LaunchContext): Promise<RunningExecution>
}
```

**Contract:**
- **Preconditions:** Provider identity and ownership targets are validated before effects.
- **Postconditions:** Harness owns exactly-once initial submission and reports what each provider signal establishes. Acknowledgment does not mean turn completion; spawning alone does not mean readiness.
- **Failures:** Harness cleans allocations it cannot return; failures and incomplete cleanup remain visible with recovery evidence.
- **Lifecycle:** Provider mechanics stay behind Harness. Persist provider identity (`opencode` for OpenCode) rather than executable-version adapter choice; select the adapter from the currently configured executable. Provider construction names remain illustrative. See [architecture/session-harness.md](architecture/session-harness.md).

### Application controller and stores

**Responsibility:** Application operations capture intent and target identity, coordinate admission/claims, call model behavior, sequence durability and external effects, and report progress/results/errors. Repositories own durable record operations.

**Dependencies:** Task, Session, Harness through Session, configuration, project paths, storage, and relevant Git/process helpers.

**Interface:**

```ts
class ApplicationController {
  createSession(taskId: TaskId, modeId: ModeId): Promise<SessionId>
  resumeSession(taskId: TaskId, modeId: ModeId, sessionId: SessionId): Promise<void>
  stopSession(taskId: TaskId, modeId: ModeId, sessionId: SessionId): Promise<void>
}
```

**Contract:**
- **Preconditions:** Capture explicit target identity before asynchronous waits; revalidate current membership and provenance before publication/effects.
- **Postconditions:** Report success only after required effects and durability complete. Progress, provisional selection, or a resolved Harness promise alone is not creation success.
- **Failures:** Errors reach the application error surface. Preserve original and secondary cleanup/publication/release failures; partial effects are not transactional rollback. Retry/crash-recovery outcomes remain bounded by [SPEC](SPEC.md).
- **Lifecycle:** Store mutation performs locked authoritative reload, validation, hydration, synchronous model behavior, validation, and atomic serialization. Provider work and arbitrary awaited callbacks run outside store-file locks. See [architecture/application-boundaries.md](architecture/application-boundaries.md).

### UI, renderer, and terminal attachment

**Responsibility:** UI modules translate interactions into application operations and own client-local presentation/focus/attachment. Renderer displays projections. Terminal runtime provides shared execution transport.

**Dependencies:** Shared application operations, read projections, and terminal attachment interfaces.

**Interface:**

```ts
interface TerminalAttachment {
  attach(sessionId: SessionId): Promise<void>
  detach(): Promise<void>
}
```

**Contract:**
- **Preconditions:** Bind output and input to the selected session identity and verified execution.
- **Postconditions:** Seed the live channel from a current-screen capture, then stream updates. Multiple clients share execution input and terminal sizing.
- **Failures:** Transport/probe failures remain errors, not evidence of absence.
- **Lifecycle:** Detach disposes only the client's transport and never stops the agent or shared server. Renderer does not mutate domain state, persist, discover providers, or control processes. Full boundaries are in [architecture/application-boundaries.md](architecture/application-boundaries.md).

## Component Interactions

### New session

**Trigger:** An application operation receives an explicit request to create a conversation for a task and mode.

**Participants:** Application controller, project-path/Git boundary, Task, Session, Harness, stores/repositories.

**Flow:**

```text
capture task and mode; resolve current inputs and execution context
Task.reserveSession(mode, creationIdentity)       // one synchronous reservation
persist reservation and recovery evidence          // before external execution
perform required task-status coordination
Session.start(context) -> Harness.launch(context)  // outside store lock
establish identity, initialization, initial delivery
publish into the same reserved record using fresh state
report success only after final publication is durable
```

**Completion:** Exactly one provisional relationship is reserved; required identity and final publication succeed. Readiness and publication do not wait for an agent answer.

**Failure:** On critical failure, clean up the new execution before Task-owned conditional rollback and durable rollback. Restore prior selection only if the provisional session remains selected; preserve newer selection and a valid survivor pointer. Harness cleans allocations it cannot return. Never erase the last tracking evidence for an execution that could not be stopped. Report the original error and cleanup/publication failures, attempting safe settlement.

### Resume, attachment, and hand-off

**Trigger:** Explicit resume, client attachment, or a hand-off request.

**Participants:** Application controller, Task, Session, Harness, terminal runtime, stores.

**Flow:**

```text
resume: validate current configuration, provider, exact identity, and paths
       preflight ownership before destructive effects
       Harness resumes the exact conversation; publish identity-correlated result
attach: attach a client to verified execution; do not start, resume, or deliver input
hand-off: create and publish successor using the creation protocol
           retire predecessor only after successor publication succeeds
```

**Completion:** Resume retains the exact conversation; attachment remains separate from startup/input; successful successor publication is distinct from predecessor retirement.

**Failure:** Apply [SPEC](SPEC.md) resume and hand-off outcomes. Creation rollback and predecessor-retirement failure are separate paths; a retirement failure does not roll back successful creation. No further cleanup-versus-preparation ordering is prescribed beyond required ownership preflight.

### Observation, stop, and deletion

**Trigger:** Runtime observation or an explicit lifecycle/storage operation.

**Participants:** Application controller, Session/Harness, Task, repositories/Git, observers.

**Flow:**

```text
observe through Session/Harness without lifecycle mutation or durable publication
for an authorized cleanup: preflight exact ownership/provenance targets
await required owned-resource cleanup
apply Task relationship/selection changes and required storage effects
publish against fresh state; preserve unrelated current state
```

**Completion:** Observation is non-destructive. Where cleanup is authorized, required execution cleanup precedes relationship/resource removal. The application reports completed and incomplete batch work truthfully.

**Failure:** Explicit stop, forget-only deletion, purge, task completion, and mode/session deletion remain distinct; [SPEC](SPEC.md) owns their policy. Validate exact project/task/session/provider/resource provenance before signaling or deleting. PID or shared-socket access alone is insufficient. Probe/transport failures are errors, not proof of absence. Do not swallow cleanup failures, claim stop from metadata alone, or let late publication resurrect removed relationships.

### Launch context and shared terminal transport

**Trigger:** Harness launches a new execution or a client attaches to a live execution.

**Participants:** Application controller, Harness, launch boundary, terminal runtime, UI clients.

**Flow:**

```text
construct validated child environment with trusted workspace identity
preserve provider startup/bootstrap artifact context
Harness submits initial instructions exactly once and establishes readiness
select shared terminal backend explicitly, including configured socket override
seed current screen and stream live updates to attached clients
```

**Completion:** Reserved workspace identity cannot be replaced by ambient launcher or preset values. The live channel is transport, not persistence. Subsequent explicit input uses Session's input path.

**Failure:** Existing bootstrap data's precise mechanism/disposition remains open pending an approved replacement. Stale output cannot update a replacement view. Do not introduce a second terminal writer. Existing launch exclusivity/admission for a task and mode is preserved, but its exact coordination mechanism is not specified. This is distinct from same-conversation execution coordination and frontend attachment; do not add per-frontend servers, last-client garbage collection, or global provider-native-ID exclusion. Distinct conversations in one task/mode are not thereby authorized to execute simultaneously. [SPEC](SPEC.md) owns instruction contents and terminal retention behavior.

## Essential Algorithms

### Authoritative mutation and publication

**Purpose:** Prevent stale state, obsolete callbacks, or concurrent operations from overwriting newer relationships or authorizing effects against the wrong execution.

**Pseudocode:**

```text
capture intended task/mode/session before asynchronous waits
obtain required admission and execution coordination
under a short store lock:
  reload authoritative state
  validate membership and provenance
  hydrate owner model; invoke synchronous model behavior
  validate and atomically serialize
outside the store lock:
  await external execution and other asynchronous effects
before dependent effects:
  await required durability checkpoints
for publication:
  reload authoritative state
  reject removed/replaced records and obsolete execution incarnations
  apply only intended owner-model changes
  preserve unrelated fields, histories, and newer selection
```

**Guarantees:** Stale UI/pre-launch snapshots never replace current storage. Rollback identity survives rehydration; an in-memory map is insufficient. Process-local execution identity rejects stale callbacks but is not conversation identity or durable resource provenance. Do not nest non-reentrant locks or add a generic unit-of-work, command-bus, phase-interpreter, or change-tracking framework. Distinguish a failed write from a committed write whose lock release failed; inspect the exact reservation before recovery rather than blindly repeating creation.

**Implementation freedom:** Private helpers, callback signatures, and storage representation are flexible if they preserve these ordering, identity, and completion guarantees.

### Creation settlement and cleanup ordering

**Purpose:** Preserve recoverability and avoid forgetting executions or relationships before required cleanup and publication settle.

**Pseudocode:**

```text
reserve once and durably record creation identity and prior selection
start externally after the reservation checkpoint
on critical failure:
  clean the new execution
  conditionally roll back Task relationship on fresh state
  retain tracking evidence if cleanup is incomplete
for batch cleanup:
  preflight every relevant ownership target before any stop/delete effect
  perform cleanup; remove each relationship/resource only after required cleanup
```

**Guarantees:** Batch preflight is not atomic rollback; later cleanup may fail after earlier effects. Preserve evidence and report partial completion. A successful successor publication separates creation success from later predecessor-retirement failure.

**Implementation freedom:** Exact recovery-record fields and private settlement helpers remain flexible within the required durable identity and ownership evidence.

## Architectural Invariants

- Task owns relationships and selection; Session owns conversation execution; Harness owns provider integration; controllers coordinate and stores persist without duplicating those rules.
- Every supported entry point uses the same application coordination and domain owners. Renderer and attachment lifetimes never control agent lifetime.
- Validate current membership, durable incarnation, and execution/resource provenance before publication or destructive effects. A saved ID, PID, socket, or absent signal alone is insufficient.
- Reservation precedes startup; required durability checkpoints precede dependent effects; final publication precedes creation success. Provider readiness alone is not committed creation.
- Harness owns exactly-once initial delivery; resume never replays it. Readiness, turn completion, and execution exit have distinct meanings.
- Required owned-resource cleanup precedes relationship removal. Failed cleanup remains recoverable and visible; newer selection and unrelated current state survive publication and rollback.
- Runtime state is observed, not maintained as a durable historical lifecycle enum/log. Unknown evidence cannot justify stop, resume, or deletion.
- Models do not depend on persistence; persistence and provider/runtime work do not occur inside short store-file locks.
- UI clients may share input and terminal sizing, but detaching a client cannot terminate shared execution or server resources.

## Open Design Decisions

| Decision | Constraints | Status |
|---|---|---|
| Minimal durable representation of startup/recovery identity and resource paths | Must survive rehydration and interrupted startup/cleanup; must not duplicate launch paths or preserve superseded lifecycle fields | Open |
| Provider startup/bootstrap artifact mechanism and disposition | Preserve current context and exactly-once initial delivery until an approved replacement; Harness owns submission/readiness | Open |
| Exact admission/coordination mechanism for task/mode launch exclusivity | Preserve existing exclusivity; distinguish it from same-conversation execution coordination and client attachment | Open |
| Task deletion, storage-move failure/concurrency, session/mode deletion, repeated-operation recovery, and other unresolved outcomes | Follow the current product contracts and unresolved items in [SPEC](SPEC.md), including [task contracts](specs/tasks.md) and [session contracts](specs/sessions.md); safety and cleanup invariants above continue to apply | Open |
| Exact activity triggers that clear task/mode approval | Approval remains owned by Task and follows [SPEC](SPEC.md); do not equate passive observation/attachment with activity | Open |
| Provider event names/capability and unsubscribe representation | Events must distinguish turn completion from execution exit; unsupported/missing events cannot imply idle state | Open |
| Exact ask eligibility and any stopped-only restriction | Use [SPEC](specs/interfaces.md); do not infer permission for a running session | Open |
| Automatic resume consent, interruption recovery, and retry policy | Exact resume identity and safety invariants remain required; policy follows [SPEC](specs/sessions.md) | Open |
