# Software Blueprint: AgenticWorkspace

## Overview

AgenticWorkspace coordinates tasks, retained agent conversations, provider executions, durable storage, and user-facing clients. Task owns task/mode/session relationships; Session owns one conversation and its replaceable execution; Harness contains provider integration. The application coordinates operations and persistence, while UI and CLI adapters use the same application boundary. [SPEC](SPEC.md) owns product behavior and supported API scope; [PRODUCT](PRODUCT.md) owns goals and scope; [CONVENTIONS](CONVENTIONS.md) owns engineering practices; [ADRs](adr/README.md) preserve accepted technology choices and significant architectural rationale.

The detailed contracts are organized as parts of this blueprint: [Task](architecture/task.md), [Session, RunningExecution, and Harness](architecture/session-harness.md), and [Application, storage, and UI](architecture/application-boundaries.md). These parts specify properties, operations, events, completion, and failure contracts without duplicating implementation declarations.

## Component Ownership

| Component | Responsibility | Owned State | Dependencies |
|---|---|---|---|
| Task | Task properties, effective configuration, selected mode, mode-specific session relationships, and task/mode approval | Ordered session histories, membership, active-session IDs, selection, rollback relationships, approval | None of application persistence or process infrastructure |
| Mode catalogue | Configurable mode definitions and startup resolution | Mode instructions/settings in project configuration | Configuration owner |
| Session | One retained conversation and its startup, input, current execution, observation, and subscriptions | Application conversation identity/history and current RunningExecution; never provider-owned configuration, data, or state | Harness |
| RunningExecution | One runtime incarnation and its identity, interaction handles, ownership evidence, observation, and events | Ephemeral execution identity and runtime handles | Provider/terminal runtime, through Harness |
| Harness | Provider-specific creation, exact resume, identity discovery, initialization/readiness, and execution integration | Provider interaction state for an execution; no authority over provider-owned configuration, data, or state | Provider adapters and terminal runtime |
| Application controller | Shared operations, authoritative loading, admission/coordination, persistence sequencing, progress, rollback, and error reporting | In-flight operation coordination and recovery sequencing | Task, Session, stores/repositories, configuration, project paths, Git/process helpers |
| Stores and repositories | Canonical paths, locked reload, validation, serialization, and atomic durable writes; enforce task artifact path containment | Durable records owned by each repository | Filesystem and application coordination |
| UI controller and feature modules | Translate user input into application operations; coordinate focus, navigation, details, and terminal attachment | Client-local focus, navigation, and attachment | Application operations, projections, terminal attachment |
| Renderer | Display read models and projections | No domain state | Read projections |
| Terminal runtime | Shared execution backend and live screen transport | Shared runtime and live channel | Harness/execution host |

Ownership is singular: controllers coordinate rather than reimplement Task or Session behavior; stores persist rather than interpret domain commands. Models do not depend on persistence. Lower-level storage, Git, process, and provider modules do not depend on CLI or UI. All supported entry points use the same application operations. Behavioral interfaces belong at real interchangeable production implementations, notably Harness providers; Task, Session, and application behavior use concrete owners rather than mirrored interfaces or a central contract package.

Mode ids are unique names within the project catalogue, with no version scheme. The configuration owner loads the catalogue before startup proceeds; see [CONFIG-014](specs/configuration.md#config-014-catalogue-startup-failure). Artifact path containment is enforced at the task-artifact storage boundary: resolved paths must remain inside that task's `artifacts/` directory, and symlink escapes are rejected. Observable mode and artifact behavior is owned by [configuration](specs/configuration.md) and [tasks](specs/tasks.md).

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

**Invariants:** Durable workspace-owned conversation identity/history is distinct from ephemeral runtime state. Provider-owned configuration, data, and state are never managed or modified. A saved provider ID, vanished frontend, or historical record does not establish liveness or exact resumability. Turn completion and execution exit are distinct.

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
| configuration reference | PresetName / ModeId | References current configuration rather than snapshots; ModeId is a unique catalogue name without versioning |

**Relationships:** Task metadata serialization is distinct from session-history serialization. Workspace preferences and group state have separate persistence owners; read projections may combine these with observed sessions but are not writable lifecycle models.

**Invariants:** Do not persist a historical runtime lifecycle enum/log. Keep only bounded recovery bookkeeping for unfinished operations; retain unresolved cleanup evidence until settled. Do not duplicate launch paths in creation snapshots. [SPEC](SPEC.md) owns storage locations, defaults, and relocation outcomes.

## Component Contracts

### Task

**Responsibility:** Own task-local mode selection, approval, and session membership, ordering, selection, removal, and rollback.

**Dependencies:** None; application coordination supplies loaded state and collaborators.

**Interface:** Detailed operation semantics: [Task contract](architecture/task.md#task).

```text
reserveSession(mode) -> creation identity: provision one member
registerSession(mode, session) -> unit: add or update a retained member
updateSessionRecord(mode, session, change) -> unit: apply a validated record change
selectSession(mode, session) -> unit: select a retained member
removeSession(mode, session) -> unit: remove a member after required cleanup
rollbackSession(creation) -> unit: remove only the exact provisional member
removeMode(mode) -> unit: remove a mode only when its history permits
serialize() -> task record: return task metadata projection
serializeSessions() -> session relationships: return retained histories and selection
```

**Contract:**
- **Preconditions:** Mutations use fresh state and validate exact task, mode, member, and creation identity; required external cleanup precedes removal or rollback.
- **Postconditions:** Synchronous mutations preserve valid membership and selection; serialization returns projections without I/O.
- **Failures:** Invalid, missing, wrong-mode, or stale targets are rejected without changing unrelated state; application coordination reports persistence, runtime, and cleanup failures.
- **Lifecycle:** Construct from loaded data; no hidden loading, persistence, provider launch, or runtime cleanup occurs in the model.

### Mode catalogue

**Responsibility:** Own configured mode definitions and resolve the selected mode's current instructions and settings.

**Dependencies:** Project configuration owner.

**Interface:**

```text
loadCatalogue(project) -> mode catalogue: load configured mode definitions
resolveMode(modeId) -> current mode configuration: resolve current instructions and settings
```

**Contract:**
- **Preconditions:** Resolution uses the current project catalogue and a requested mode identity.
- **Postconditions:** Returns current configuration; mode IDs are unique catalogue names without versioning, and configuration is not copied into conversation snapshots.
- **Failures:** Missing or invalid catalogue/configuration is reported before dependent startup; see [CONFIG-014](specs/configuration.md#config-014-catalogue-startup-failure).
- **Lifecycle:** The catalogue is loaded before startup proceeds; it does not own task histories or provider execution.

### Session

**Responsibility:** Own one retained conversation, startup, current execution, input, observation, subscriptions, and its durable record projection.

**Dependencies:** RunningExecution and Harness; application coordination supplies targeting, current configuration, admission, and durability.

**Interface:** Detailed operation semantics: [Session contract](architecture/session-harness.md#session).

```text
start(operation) -> ready session: start the reserved conversation and complete required checkpoints
resume(context) -> running execution: resume the exact retained provider conversation
stop() -> settlement: stop the current owned execution while retaining conversation identity
inject(input) -> delivery result: deliver explicit subsequent input to the current execution
observe() -> runtime evidence: report evidence or explicit uncertainty without lifecycle mutation
applyAndPublish(change) -> unit: apply a model change and coordinate required publication
subscribe(event, handler) -> subscription: observe supported session events
```

**Contract:**
- **Preconditions:** Startup follows durable reservation; resume requires exact identity and validated context; destructive effects require verified ownership; input targets a usable current execution.
- **Postconditions:** Startup returns the same conversation after readiness; resume preserves conversation identity; stop retains history; observation is non-destructive and input does not imply an answer.
- **Failures:** Startup/instruction failure stops without rollback or automatic retry; only final durable publication failure rolls back the provisional relationship. Runtime, delivery, observation, cleanup, and publication failures remain visible.
- **Lifecycle:** Session subscriptions survive execution replacement; obsolete execution listeners are disconnected. See [Session contract](architecture/session-harness.md#session) for detailed guarantees.

### RunningExecution

**Responsibility:** Encapsulate operations and resources for exactly one runtime incarnation.

**Dependencies:** Provider transport/runtime through Harness; Session for current-incarnation association and event routing.

**Interface:** Detailed operation semantics: [RunningExecution contract](architecture/session-harness.md#runningexecution).

```text
deliver(input) -> delivery result: send input through the captured endpoint
deliverKey(key) -> delivery result: send a key through the captured endpoint
stop() -> unit: release or stop this verified execution
observe() -> runtime evidence: inspect this execution without lifecycle mutation
subscribe(event, handler) -> subscription: listen for a supported signal
```

**Contract:**
- **Preconditions:** Every operation targets this incarnation and its captured resources; destructive actions revalidate ownership.
- **Postconditions:** Delivery confirms transport/provider delivery only; observation reports evidence or uncertainty; subscription disposal does not stop execution.
- **Failures:** Delivery, cleanup, observation, and subscription errors remain distinguishable; failed probes do not prove resource absence, and foreign or replacement executions are never targeted.
- **Lifecycle:** Handles and listeners remain bound to captured resources; replacement detaches obsolete listeners. Client attachment has a separate lifecycle.

### Harness

**Responsibility:** Encapsulate provider-specific creation, exact resume, identity discovery, initialization/readiness, runtime evidence, and execution integration.

**Dependencies:** Provider implementation, validated bounded context, and terminal runtime as needed.

**Interface:** Detailed operation semantics: [Harness contract](architecture/session-harness.md#harness).

```text
create(context) -> running execution: allocate, identify, initialize, and submit initial instructions once
resume(identity, context) -> running execution: initialize the exact saved conversation
inspect(context) -> runtime evidence: obtain provider-specific identity or runtime evidence
```

**Contract:**
- **Preconditions:** Creation and resume receive current resolved inputs and validated bounded paths/context; resume also receives the exact retained identity.
- **Postconditions:** Creation establishes correlated identity, initialization, and provider-supported acknowledgment of initial submission; resume establishes the exact conversation without replaying initial instructions.
- **Failures:** Allocation/identity/readiness errors remain explicit; unreturnable allocations are cleaned up while retaining ownership evidence and cleanup failures. No resume fallback to a new conversation.
- **Lifecycle:** Provider receipts stay internal; provider-owned configuration, data, and state are never managed or modified. See [Harness contract](architecture/session-harness.md#harness).

### Application controller

**Responsibility:** Coordinate shared operations, authoritative loading, admission, publication sequencing, progress, rollback, and error reporting.

**Dependencies:** Task, Session, Harness, stores/repositories, configuration, project paths, Git/process helpers, and supported entry-point adapters.

**Interface:** Detailed operation semantics: [Application controller contract](architecture/application-boundaries.md#application-controller).

```text
load(project) -> read projection: load authoritative state for presentation
execute(intent) -> committed result: coordinate a targeted operation and its durable effects
```

**Contract:**
- **Preconditions:** Operation intent captures an explicit target and satisfies applicable owner and product preconditions.
- **Postconditions:** Success follows required effects and durability; publication uses fresh state and preserves unrelated current data and newer selection.
- **Failures:** Owner errors reach the application error surface; partial effects are reported truthfully and operations stop according to their contract without implicit retry or rollback.
- **Lifecycle:** Coordinate unfinished-task status before reservation or startup; perform external execution outside store locks and avoid nested non-reentrant admission scopes.

### Stores and repositories

**Responsibility:** Own canonical paths, authoritative reload, validation, serialization, atomic durable writes, and task-artifact path containment.

**Dependencies:** Filesystem and path/configuration owners; application supplies operation context and invokes domain behavior.

**Interface:** Detailed operation semantics: [Stores and repositories contract](architecture/application-boundaries.md#stores-and-repositories).

```text
load(target) -> authoritative records: reload validated durable state
mutate(target, synchronous change) -> mutation result: reload, apply bounded model mutation, and durably serialize
```

**Contract:**
- **Preconditions:** Target paths and records are validated; required membership/provenance accompanies mutations.
- **Postconditions:** Successful mutation durably serializes authoritative state; task metadata and session history remain distinct responsibilities.
- **Failures:** Read, validation, write, and lock-release failures remain distinguishable; uncertain commit is checked by exact identity rather than blindly repeated.
- **Lifecycle:** Reload under bounded mutation coordination; no provider work or arbitrary awaited callback occurs under the store lock. Artifact paths remain inside the task artifact directory, including symlink resolution.

### UI controller and feature modules

**Responsibility:** Translate user intent into application operations and coordinate client-local focus, navigation, details, and terminal attachment.

**Dependencies:** Shared application operations, read projections, and terminal attachment interfaces.

**Interface:** Detailed operation semantics: [UI controller contract](architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host).

```text
dispatch(intent) -> committed result: invoke the shared application boundary
attach(session) -> unit: attach to the verified selected execution
detach() -> unit: close only this client's attachment
```

**Contract:**
- **Preconditions:** Dispatch carries a captured target; attachment targets the verified selected session and execution endpoint.
- **Postconditions:** UI reflects committed results without overwriting later navigation; terminal attachment seeds a current screen and streams live updates.
- **Failures:** Operation and transport errors are reported against their captured target; obsolete output cannot update a replacement view.
- **Lifecycle:** Presentation focus and attachment do not own domain selection or agent lifetime; detaching never stops execution or shared server resources.

### Renderer

**Responsibility:** Display read models and projections without owning domain state.

**Dependencies:** Read-only projections supplied by controllers and models.

**Interface:**

```text
render(projection) -> displayed view: present the supplied read-only state
```

**Contract:**
- **Preconditions:** Receives a projection for display.
- **Postconditions:** Displays supplied state without changing its authority.
- **Failures:** Rendering failures remain presentation failures and do not mutate domain or durable state.
- **Lifecycle:** Performs no mutation, I/O, provider discovery, process control, or second terminal write.

### Terminal runtime

**Responsibility:** Provide the shared execution backend and live screen transport.

**Dependencies:** A verified execution endpoint and authorized client attachments.

**Interface:**

```text
attach(session, endpoint) -> attachment: connect a client to the selected live screen
resize(attachment, dimensions) -> unit: update shared terminal dimensions
sendInput(attachment, input) -> delivery result: route explicit input to the attached execution
detach(attachment) -> unit: close only the client's transport
```

**Contract:**
- **Preconditions:** Attachment is bound to the selected session identity and verified execution endpoint.
- **Postconditions:** Attachment seeds the current screen and streams live updates; transport is not persistence.
- **Failures:** Setup and delivery errors are surfaced against the captured session; detach or transport failure does not authorize execution cleanup.
- **Lifecycle:** Clients may share input and terminal sizing; detaching a client cannot terminate shared execution or server resources.

## Component Interactions

### New session

**Trigger:** An application operation receives an explicit request to create a conversation for a task and mode.

**Participants:** Application controller, project-path/Git boundary, Task, Session, Harness, stores/repositories.

**Flow:**

```text
capture task and mode; resolve current inputs and execution context
coordinate unfinished-task status; fail before reservation/startup if it cannot change
Task.reserveSession(mode, creationIdentity)       // exactly one provisional relationship
persist reservation and recovery evidence          // before external execution
Session.start(context) -> Harness.launch(context)  // outside store lock
establish identity, initialization, initial delivery
publish into the same reserved record using fresh state
report ready only after final publication is durable
```

**Completion:** Exactly one provisional relationship is reserved; required identity and final publication succeed. Readiness and publication do not wait for an agent answer.

**Failure:** On startup or initial-instruction failure, report the error and stop without continuing, automatic recovery, retry, or rollback; retain tracking evidence if an execution may still be running. If final durable publication fails after startup, stop the new execution and roll back only its provisional relationship; retain tracking if the execution may still run. Report completed effects truthfully. Harness cleans allocations it cannot return as part of the failed launch attempt. See the [creation settlement contract](architecture/application-boundaries.md#creation-settlement).

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

**Failure:** Apply [SPEC](SPEC.md) outcomes. On handoff failure, stop and report completed effects; do not continue, automatically recover, retry, or imply rollback. A failed successor leaves the predecessor intact; predecessor-retirement failure leaves the published successor running.

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

**Completion:** Observation is non-destructive. Cleanup affects workspace-owned resources only; provider-owned configuration, data, and state remain untouched. Required execution cleanup precedes relationship/resource removal. The application reports completed and incomplete work truthfully.

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

**Purpose:** Preserve domain ownership and durable consistency while rejecting stale callbacks.

**Pseudocode:**

```text
capture operation identity before asynchronous waits
reload authoritative state within a bounded mutation boundary
validate membership and resource provenance
invoke synchronous behavior through the owning model
validate and durably serialize the intended state
before later publication, reload and validate current state again
```

**Guarantees:** External execution stays outside store locks; stale callbacks cannot overwrite newer state or resurrect removed records; required durability precedes dependent effects and cleanup precedes relationship removal when required. Detailed contract: [authoritative mutation and publication](architecture/application-boundaries.md#authoritative-mutation-and-publication).

**Implementation Freedom:** Lock/admission mechanism, identity representation, and storage layout may vary if these guarantees hold.

### Creation settlement and cleanup ordering

**Purpose:** Ensure status coordination, one durable reservation, safe startup, and recoverable settlement.

**Pseudocode:**

```text
resolve current configuration and execution context
coordinate required unfinished-task status; on failure stop before reservation/startup
reserve exactly once and durably publish recovery identity
start execution outside the store lock
publish final identity/state against fresh authoritative state
if startup or initial-instruction delivery fails:
  report error and stop without rollback
  retain tracking evidence if execution may still run
if final durable publication fails:
  stop the new execution and roll back only its provisional relationship
  retain tracking evidence if execution may still run
```

**Guarantees:** No success before final publication; startup/instruction failure never rolls back the provisional relationship; rollback occurs only after final publication failure against fresh state, and failed cleanup never erases tracking evidence. Detailed contract: [creation settlement](architecture/application-boundaries.md#creation-settlement).

**Implementation Freedom:** Exact recovery fields and representation remain open; private in-memory state alone is insufficient rollback authority.

## Architectural Invariants

- Task owns relationships and selection; Session owns conversation execution; Harness owns provider integration; controllers coordinate and stores persist without duplicating those rules.
- Every supported entry point uses the same application coordination and domain owners. Renderer and attachment lifetimes never control agent lifetime.
- Validate current membership, durable incarnation, and execution/resource provenance before publication or destructive effects. A saved ID, PID, socket, or absent signal alone is insufficient.
- Reservation precedes startup; required durability checkpoints precede dependent effects; final publication precedes creation success. Provider readiness alone is not committed creation.
- Harness owns exactly-once initial delivery; resume never replays it. Readiness, turn completion, and execution exit have distinct meanings.
- Further session activity in a task/mode clears its approval; see [CONFIG-007](specs/configuration.md#config-007-task-and-mode-approval).
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
| Provider event names/capability and unsubscribe representation | Events must distinguish turn completion from execution exit; unsupported/missing events cannot imply idle state | Open |
