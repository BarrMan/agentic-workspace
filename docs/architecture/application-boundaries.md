# Software Blueprint: Application Boundaries

This document is a part of [BLUEPRINT.md](../BLUEPRINT.md).

## Overview

The application boundary coordinates supported entry points with Task, Session, Harness, persistence, configuration, project-path, and UI owners. It owns cross-component sequencing and committed-result/error reporting; it does not duplicate domain behavior. Storage owners persist authoritative state, while UI modules present state and attach clients to executions without owning agent lifetime. [SPEC](../SPEC.md) and its linked specifications define user-visible behavior.

## Component Ownership

| Component | Responsibility | Owned State | Dependencies |
|---|---|---|---|
| Application controller | Shared operation coordination, authoritative loading, admission, persistence sequencing, progress, rollback, and error reporting | In-flight coordination and operation context | Task, Session, Harness, stores/repositories, configuration, project paths, Git/process helpers |
| Task | Task properties and task/mode/session relationships, selection, approval, and relationship mutations | Task model and its retained-session relationships | Application invokes it; no persistence, application locks, or process cleanup |
| Session and RunningExecution | Retained conversation behavior and its current replaceable execution | Conversation identity, execution incarnation, interaction handles, observation, subscriptions | Harness; application coordinates persistence and membership |
| Harness | Provider-specific creation, exact resume, identity/readiness, runtime observation, and execution integration | Provider execution resources | Provider and terminal runtime; no task relationships, persistence, or UI policy |
| Stores and repositories | Canonical paths, reload, validation, serialization, and durable writes | Persisted records and storage resources | Domain projections, filesystem and configuration/path owners; no independent Task/Session rules |
| UI controller and feature modules | Connect user intent to application operations; coordinate focus, navigation, details, and terminal attachment | Presentation, focus, and client attachment state | Application operations, models/read projections, terminal-host interfaces |
| Renderer | Display model/read projections and observations | None | Controller/model hierarchy and read-only projections |
| Terminal runtime | Shared execution backend and live screen transport | Shared backend resources and live transport | Verified execution endpoint; clients own attachment, not execution lifetime |

Dependencies flow from supported entry points through the application controller to domain owners and persistence; Session uses Harness, which integrates with provider/terminal runtime. UI presentation consumes read projections and terminal attachment interfaces. Lower-level storage, Git, process, and provider modules do not depend on CLI/UI; models do not depend on persistence. Composition connects concrete Task, Session, and application classes. Behavioral interfaces belong only at actual interchangeable production implementations, such as Harness providers; tests alone do not require parallel interfaces.

## Models and Relationships

### Application operation context

**Purpose:** Identifies the intended operation and its target across asynchronous coordination and persistence.

**Properties:**

| Property | Type | Description |
|---|---|---|
| Target identity | Project/task/mode/session identity as applicable | Captured before asynchronous waits; must identify the intended current record/incarnation when used |
| Execution/resource provenance | Durable ownership and resource references, plus process-local incarnation identity where needed | Authorizes only the matching execution; process-local identity is not durable conversation identity |

**Relationships:** The application creates and uses operation context while coordinating Task, Session, Harness, and persistence. Its concrete representation is implementation-owned.

**Invariants:** Identity and provenance must be revalidated against fresh authoritative state before publication or destructive effects. A saved ID, PID, socket, or absent signal alone does not establish authority.

### Persisted conversation and runtime observation

**Purpose:** Separates retained conversation relationships and recoverable unfinished work from observed runtime state.

**Properties:**

| Property | Type | Description |
|---|---|---|
| Conversation record | Durable identity, task/mode membership, retained history and selection | Persistent relationship state; task metadata serialization is separate |
| Unfinished-operation evidence | Bounded durable recovery data | Retains creation identity, prior selection, and recoverable resource ownership needed to settle interrupted work |
| Runtime observation | Session/Harness observation | Current runtime evidence, not durable lifecycle history |

**Relationships:** Task owns membership and selection; Session owns conversation execution; stores serialize their projections. Preferences and read projections have separate owners and do not become writable copies of domain state.

**Invariants:** Runtime state is observed rather than maintained as a durable lifecycle enum/log. Missing evidence cannot authorize destructive effects. Recovery evidence must survive interruption until safely settled; its concrete representation remains implementation work.

## Component Contracts

### Application controller

**Responsibility:** Coordinates shared operations across supported entry points, resolves current configuration and paths, invokes domain owners, sequences durable effects, and reports committed results or failures.

**Dependencies:** Task, Session, Harness, stores/repositories, configuration, project-path, Git/process helpers, and supported entry-point adapters.

**Interface:**

```ts
class ApplicationController {
  load(project: ProjectIdentity): Promise<ReadProjection>
  execute(operation: OperationIntent): Promise<CommittedResult>
}
```

**Contract:**
- **Preconditions:** Operation intent identifies an explicit target and meets the relevant SPEC policy and owner preconditions.
- **Postconditions:** Success is reported only after required effects and durability complete. Publication applies intended changes to fresh state and preserves unrelated current fields, histories, and newer selection.
- **Failures:** Owner errors reach the application error surface. Partial effects are reported truthfully; cleanup/publication failures and recoverable evidence are retained. Partial effects do not imply rollback or safe retry.
- **Lifecycle:** Capture target identity before asynchronous waits. Coordinate admission and claims; perform external execution outside store locks. Do not nest non-reentrant admission scopes.

### Task

**Responsibility:** Owns task properties and task/mode/session relationships, including insertion, ordering, selection, removal, rollback, and task-and-mode approval.

**Dependencies:** Application invocation; no persistence, application locks, or process cleanup.

**Interface:**

```ts
class Task {
  reserveSession(modeId: ModeId): CreationIdentity
  applySessionRecord(change: SessionRecordChange): void
  rollbackSession(identity: CreationIdentity): void
}
```

**Contract:**
- **Preconditions:** Referenced task, mode, membership, and creation identity are valid for the requested domain mutation.
- **Postconditions:** Relationship changes are made once by Task and preserve valid selection and membership.
- **Failures:** Invalid or stale identity does not authorize mutation; errors propagate to application coordination.
- **Lifecycle:** Task behavior is synchronous and operates on the hydrated model. The application persists its resulting projection.

### Session and RunningExecution

**Responsibility:** Session owns one retained conversation, startup, current execution, input, runtime observation, and subscriptions. RunningExecution represents one replaceable runtime incarnation.

**Dependencies:** Harness for provider execution; application for membership coordination and persistence.

**Interface:**

```ts
class Session {
  start(context: LaunchContext): Promise<RunningExecution>
  resume(identity: ConversationIdentity, context: LaunchContext): Promise<RunningExecution>
  stop(): Promise<void>
  send(input: Input): Promise<void>
  observe(): Promise<RuntimeObservation>
}
```

**Contract:**
- **Preconditions:** Startup has a valid launch context; resume targets the exact retained conversation and verified ownership; execution effects target the current incarnation.
- **Postconditions:** Startup establishes identity/readiness and delivers initial instructions exactly once. Resume does not replay initial instructions. Input delivery does not imply an answer; turn completion does not imply execution exit.
- **Failures:** Provider, delivery, observation, and cleanup failures remain visible. A failed or missing observation is not proof that execution vanished.
- **Lifecycle:** Session does not decide task membership, acquire application locks, or persist itself. It preserves subscriptions across execution replacement and detaches obsolete listeners.

### Harness

**Responsibility:** Encapsulates provider-specific construction, new conversation, exact resume, identity discovery, initialization/readiness, observation, and execution integration.

**Dependencies:** Provider implementation and terminal runtime.

**Interface:**

```ts
interface HarnessProvider {
  launch(context: LaunchContext): Promise<RunningExecution>
  resume(identity: ConversationIdentity, context: LaunchContext): Promise<RunningExecution>
}
```

**Contract:**
- **Preconditions:** Context contains validated project/task/session targeting and the configured provider inputs.
- **Postconditions:** Launch establishes conversation identity and initialization, plus provider-supported acknowledgment of initial-instruction submission; resume establishes the exact saved conversation and initialization.
- **Failures:** Provider allocation, identity, readiness, and execution errors propagate to Session/application; resources that cannot be returned are cleaned up by Harness.
- **Lifecycle:** Harness owns provider-specific submission and readiness. Spawning alone is insufficient; readiness does not wait for an answer. Provider details remain behind this boundary.

### Stores and repositories

**Responsibility:** Own canonical paths and durable file operations for task metadata, session history, preferences, configuration, and task artifacts.

**Dependencies:** Filesystem and path/configuration owners; application supplies operation context and invokes domain behavior.

**Interface:**

```ts
interface SessionStore {
  load(taskId: TaskId): Promise<SessionRecords>
  mutate(taskId: TaskId, mutation: SynchronousMutation): Promise<MutationResult>
}
```

**Contract:**
- **Preconditions:** Target paths and records are validated; expected membership/provenance is supplied where mutation requires it.
- **Postconditions:** Successful mutation durably serializes validated authoritative state. Task metadata and session history remain distinct persistence responsibilities.
- **Failures:** Read, validation, write, and lock-release failures remain distinguishable; a committed write followed by release failure is not treated as an uncommitted write. Errors reach application coordination.
- **Lifecycle:** Mutations reload authoritative state and hold the store lock only for bounded synchronous model mutation, validation, and atomic serialization. No provider work or arbitrary awaited callback runs under the state lock. Recovery checks exact identity before any retry.

### UI controller, feature modules, renderer, and terminal host

**Responsibility:** UI controller dispatches intent and coordinates view state; feature modules own their interaction/presentation; renderer displays projections; terminal host manages client transport.

**Dependencies:** Shared application operations, models/read projections, and explicit terminal backend.

**Interface:**

```ts
class UIController {
  dispatch(intent: OperationIntent): Promise<CommittedResult>
  attach(session: SessionIdentity): Promise<void>
  detach(): Promise<void>
}
```

**Contract:**
- **Preconditions:** Dispatch carries a captured target; attachment targets a verified execution endpoint and selected session.
- **Postconditions:** UI reflects committed results without overwriting later local navigation. Terminal output is bound to session identity; attachment seeds a current screen and then streams live updates.
- **Failures:** Operation and transport errors are reported against their target. Obsolete output cannot update a replacement view.
- **Lifecycle:** Presentation selection/attachment is distinct from domain selection and agent lifetime. Detach/disposal never stops execution or the shared server. Renderer performs no mutation, I/O, provider discovery, process control, or second terminal write.

## Component Interactions

### New session creation

**Trigger:** A supported entry point requests creation for an explicit task and mode.

**Participants:** Application controller, Task, Session, Harness, SessionStore, project-path/Git owners, and UI/entry-point adapter.

**Flow:**

```text
capture target and resolve current configuration/paths
prepare execution context while preserving target identity
Task reserves and selects one provisional session
persist reservation and required recovery evidence
Session starts through Harness outside the store lock
publish identity and intended changes against fresh authoritative state
report success after required final publication
```

**Completion:** Reservation, required checkpoints, startup, and final publication are complete. Provider readiness and final publication do not wait for an agent answer.

**Failure:** On critical failure, clean up the new execution, then invoke Task-owned conditional rollback against current membership and persist safe settlement. Preserve newer selection. Retain tracking evidence if cleanup or rollback publication fails, and report the original and secondary failures.

### Publication and rollback

**Trigger:** A Session-owned change or creation failure requires durable publication or conditional settlement.

**Participants:** Application controller, Task, Session, and stores/repositories.

**Flow:**

```text
reload current authoritative record
validate membership, durable incarnation, and execution origin
apply only intended change through Task behavior
preserve unrelated current fields, history, and selection
validate and durably serialize
```

**Completion:** The intended change is durably committed for the current record/incarnation.

**Failure:** Stale/deleted/replaced records are not resurrected. Preserve evidence and report partial publication; do not blindly repeat a reservation after an uncertain commit.

### Execution attachment and input

**Trigger:** UI selects a retained session, attaches a terminal client, resizes, sends input, or detaches.

**Participants:** UI controller, terminal host/runtime, Session, and selected execution.

**Flow:** Resolve the explicit backend and verified execution endpoint; bind the client to the selected session; seed current screen and stream updates; route input and sizing through the shared terminal host; detach only the client transport.

**Completion:** Requested transport setup or delivery completes for the captured session identity.

**Failure:** Report setup/delivery errors against that identity. Do not switch targets silently or interpret detach/transport failure as authority to stop or clean up execution.

## Essential Algorithms

### Authoritative mutation and publication

**Purpose:** Preserve domain ownership and durable consistency while allowing concurrent operations and stale callbacks to be rejected.

**Pseudocode:**

```text
capture operation identity before waits
reload authoritative state within a bounded mutation boundary
validate expected membership and provenance
invoke synchronous owner behavior
validate and atomically serialize
for later publication, reload and validate again before applying intended change
```

**Guarantees:** External execution is outside store locks; stale callbacks cannot overwrite newer state or resurrect removed records; required durability precedes dependent effects; cleanup precedes removal of relationships/resources when cleanup is required.

**Implementation freedom:** Lock/admission mechanisms, exact callback and result signatures, identity representation, and storage layout are not prescribed beyond these guarantees. Avoid nested non-reentrant scopes and do not introduce a second domain model or generic phase interpreter.

### Creation settlement

**Purpose:** Ensure one durable reservation, safe execution startup, and recoverable conditional rollback.

**Pseudocode:**

```text
reserve once and durably publish recovery identity
start execution outside store lock
publish final identity/state against fresh record
if a critical step fails:
  clean up the new execution
  conditionally roll back the reservation through Task
  durably settle what is safe; retain evidence for unresolved cleanup
```

**Guarantees:** No success before final publication; rollback on a freshly hydrated Task is authorized by durable identity; newer selection/status and unrelated current data are preserved; failed cleanup never erases the last tracking evidence.

**Implementation freedom:** Exact checkpoint fields and recovery representation are not fixed. Private in-memory state alone is insufficient rollback authority.

## Architectural Invariants

- Task owns task/mode/session relationships and selection; Session owns conversation execution; Harness owns provider integration; controllers coordinate and stores persist without duplicating those rules.
- Every supported entry point uses the same application coordination and domain owners; renderer and attachment lifetimes never control agent lifetime.
- Identity, membership, durable incarnation, and resource provenance are validated before publication or destructive effects.
- Reservation and required checkpoints are durable before dependent execution effects; final publication precedes creation success.
- Harness owns exactly-once initial delivery; exact resume does not replay it. Readiness, turn completion, and execution exit remain distinct.
- Required owned-resource cleanup precedes relationship removal; failed cleanup remains visible and recoverable.
- Runtime is observed, not represented as durable historical lifecycle state; unknown evidence cannot justify stop, resume, or deletion.
- Mutations preserve unrelated current state and newer selection; UI attachment does not grant execution ownership.

## Open Design Decisions

| Decision | Constraints | Status |
|---|---|---|
| Minimal durable startup/recovery representation | Must preserve creation identity, prior selection, and recoverable resource ownership without historical lifecycle fields | Open |
| Precise Task construction/deletion signatures and collection integration | Preserve Task ownership; exact signatures are not fixed | Open |
| Final event/capability and unsubscribe representation; execution-handle fields | Keep provider/runtime details owned by Harness/Session; introduce interfaces only for actual production variation | Open |
| Deletion, relocation, and session recovery outcomes | Follow [SPEC task contracts](../specs/tasks.md#task-deletion) and [session contracts](../specs/sessions.md#deleting-a-session); this document does not decide product policy | Open |
| Approval invalidation trigger mapping and retained-conversation ask eligibility/retry policy | Follow the approved behavior in [SPEC](../SPEC.md); do not infer unconfirmed eligibility or retry behavior | Open |
