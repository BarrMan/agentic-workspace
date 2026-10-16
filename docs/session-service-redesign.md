---
consolidation:
  total: 148
  counts:
    exists: 139
    discard: 8
    integrate: 0
    unconfirmed: 1
  percentages:
    exists: 93.92%
    discard: 5.41%
    integrate: 0.00%
    unconfirmed: 0.68%
---
# Session service target architecture

> **Non-authoritative supporting material.** This file is not a contract. Authoritative owner(s): [SPEC sessions](specs/sessions.md#sessions), [BLUEPRINT](BLUEPRINT.md), [Task architecture](architecture/task.md), [Session/Harness architecture](architecture/session-harness.md), [Application boundaries](architecture/application-boundaries.md), [ADR 0001](adr/0001-model-owned-domain-behavior.md).
> Disposition: Mixed — see markers.

## Purpose and status

Define the ownership and interfaces that replace the large session-service orchestration model. This is the agreed target design, not a claim about the current implementation or a completed migration plan. <!-- consolidation: exists; ref: docs/adr/0001-model-owned-domain-behavior.md#context; reason: Accepted target and distinction from implementation evidence recorded. -->

The [redesign brief](session-service-redesign-brief.md) records the original proposal, prior review, and reported implementation state. Its objections are design inputs, not requirements to preserve the current structure. `docs/SPEC.md` remains the current behavior contract except for the explicitly approved creation rollback changes below; update those claims when implementing the new behavior. Use the [corrective implementation plan](session-service-redesign-correction-plan.md) before resuming the remaining migration. It supersedes the earlier plan's contract-package and phase-driven persistence design. <!-- consolidation: exists; ref: docs/adr/0001-model-owned-domain-behavior.md#alternatives-considered; reason: Earlier review and contract-package rejection recorded. --> <!-- consolidation: discard; ref: docs/specs/sessions.md#creation-failure-and-recovery; reason: Rollback exception to SPEC is historical because approved rollback is now folded. --> <!-- consolidation: discard; ref: none; reason: Corrective-plan execution routing belongs to the retained work ledger. -->

The goal is meaningful ownership: each model manages its own properties and behavior; controllers coordinate operations. Moving the existing service behind forwarding methods does not satisfy this goal. <!-- consolidation: exists; ref: docs/adr/0001-model-owned-domain-behavior.md#context; reason: Meaningful ownership rather than forwarding is the accepted rationale. -->

## Ownership

| Owner | Responsibilities |
| --- | --- |
| Task | Task properties, configuration, selected mode, mode session histories, active-session pointers, and behavior that changes those relationships <!-- consolidation: exists; ref: docs/BLUEPRINT.md#component-ownership; reason: Task ownership row covers these responsibilities. --> |
| Session | Conversation lifecycle, startup state, current running execution, input injection, and lifecycle subscriptions <!-- consolidation: exists; ref: docs/BLUEPRINT.md#component-ownership; reason: Session ownership row covers these responsibilities. --> |
| Harness | Provider-specific creation, exact resume, readiness, identity discovery, and execution integration <!-- consolidation: exists; ref: docs/BLUEPRINT.md#component-ownership; reason: Harness ownership row covers these responsibilities. --> |
| Application controller | Coordination, locking, persistence, operation progress, and error handling shared by CLI and TUI <!-- consolidation: exists; ref: docs/BLUEPRINT.md#component-ownership; reason: Application coordination ownership is explicit. --> |
| UI controller | Connect UI events and keybindings to application operations; coordinate focus, selection, details, and preview <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: UI dispatch and selection-transition contracts cover this row. --> |
| UI modules | Their own interaction and presentation responsibilities: task navigation, details, and live preview <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: TasksList details and preview each have an owning row. --> |
| Renderer | Read and render the controller's model hierarchy <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Read-only render operation is specified. --> |

Models do not acquire application locks or know about lock files, UI infrastructure, or persistence infrastructure. Controllers do not directly maintain model-owned relationships in place of model methods. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#component-ownership; reason: Model infrastructure independence and single-owner composition are explicit. -->

These ownership rules apply to every supported entry point, not only a migrated vertical slice. Task is the sole owner of task/session relationships; Session is the sole owner of individual lifecycle; Harness owns provider execution; application controllers coordinate operations and durability. CLI, TUI, Core, and MCP use these same owners. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#component-ownership; reason: All supported entry points share these owners without approving additional MCP surfaces. -->

Build order follows these ownership dependencies: establish the owning behavior, connect every supported caller of that behavior, then verify the complete ownership boundary. Bounded assignments divide work; they do not authorize an alternative legacy owner or compatibility route. A checkpoint may be reported as incomplete, but cannot be accepted as satisfying an ownership rule while another supported path implements that rule independently. <!-- consolidation: discard; ref: none; reason: Build sequencing is a retained execution instruction rather than a new core requirement. --> <!-- consolidation: exists; ref: docs/adr/0001-model-owned-domain-behavior.md#consequences; reason: Complete caller integration and rejection of duplicate implementations are acceptance obligations. -->

## Concrete models and necessary interfaces

`Task`, `Session`, and the application controller are concrete classes. Callers use those classes directly, including type-only imports where appropriate. Do not mirror their public methods in `TaskContract`, `SessionContract`, controller-constructor interfaces, or equivalent behavioral type aliases. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#component-ownership; reason: Concrete classes and all forms of behavioral mirrors are covered. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#code-structure; reason: Type-only imports are required when appropriate. -->

Harness has genuinely interchangeable provider implementations and therefore has an interface. Retain another behavioral interface only when actual alternative implementations need it; document those implementations at the owning seam. A test double alone does not justify a repository-wide dependency interface or a parallel model hierarchy. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#component-ownership; reason: Production variation rather than tests justifies behavioral interfaces. -->

Data types for persisted records, launch inputs, events, and rollback identity remain useful. Put them with their owning module and reuse existing record types. A small injected function can have a local function type; it does not require a factory interface and factory class. Do not mechanically replace every `interface` with `type`: remove redundant abstraction, not a keyword. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#component-ownership; reason: Local record and function types are retained without factory frameworks. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#general-principles; reason: Avoid unrelated cosmetic changes and speculative abstractions. -->

There is no central behavioral contract package that duplicates the models. Keep genuinely shared provider contracts with Harness and narrowly shared data with their owner. No layer may redeclare another owner's behavior merely to make parallel workers independent. <!-- consolidation: exists; ref: docs/adr/0001-model-owned-domain-behavior.md#decision; reason: Central behavioral mirrors are rejected and data ownership retained. -->

## Persistence executes model behavior, not a second domain model

Task is the sole implementation of session insertion/order, active selection, removal, and rollback pointer restoration. Session is the sole implementation of individual lifecycle transitions. Controller chooses and coordinates the operation; SessionStore owns locked reload, serialization, integrity validation, and atomic writes. <!-- consolidation: exists; ref: docs/adr/0001-model-owned-domain-behavior.md#decision; reason: Domain and storage ownership separation is recorded. -->

Persistence must not receive `phase: "rollback"` and implement removal/selection itself. The same applies to interpreting a reservation phase as insertion/activation. Remove `createSessionPersistence`'s domain behavior, rather than wrapping or renaming it. <!-- consolidation: exists; ref: docs/adr/0001-model-owned-domain-behavior.md#alternatives-considered; reason: Reservation and rollback phase interpretation is explicitly rejected. -->

For a durable relationship change, the controller uses the existing short store mutation to load current state, hydrate a concrete Task, invoke its synchronous domain behavior, and serialize the resulting session state. A whole-envelope write is safe only when derived from the current state inside that mutation; never publish a stale UI Task snapshot over concurrent records. Preserve modes and fields outside the operation, including stored histories not present in the current mode catalog. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#authoritative-mutation-and-publication; reason: Fresh-state model mutation and preservation of concurrent fields and invisible histories are explicit. -->

For a lifecycle checkpoint, publish the intended Session-owned change against the current record. Explicitly distinguish changed fields from unrelated fields and support deliberate field removal. Preserve concurrent usage/selection updates; do not merge a stale whole record and then add an expanding list of fields to rescue. Membership and execution-origin validation still occurs at the publication boundary under the store lock. <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#authoritative-mutation-and-publication; reason: Publication validates origin under lock and applies explicit changes to fresh state. -->

An awaited callback remains appropriate to sequence durable publication before dependent startup effects. It is not permission to create a persistence interpreter for domain commands. Controller composes the callback; models know neither the store nor locks. <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#authoritative-mutation-and-publication; reason: Awaited application-composed checkpoints retain model independence. -->

The controller may hold existing admission/session coordination across startup, but store-file locks cover only short state mutations. Never launch a provider or await arbitrary callbacks inside a store mutation. Separate the Task's synchronous reservation behavior from asynchronous Session startup internally while preserving the public task-creation intent. Do not grow a generic unit-of-work, command bus, or change-tracking framework for this flow. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#authoritative-mutation-and-publication; reason: Short locks and avoidance of generic transaction frameworks are explicit. --> <!-- consolidation: exists; ref: docs/architecture/task.md#session; reason: Composite newSession intent separates synchronous reservation and asynchronous startup. -->

Rollback identity must be usable after rehydration: capture the failed creation's exact identity and prior selection as data before startup, and validate it against current membership. A private map in an older Task instance cannot be the only proof authorizing rollback on a freshly loaded Task. Models still own rollback rules; the controller validates durable provenance and coordinates cleanup before invoking them. <!-- consolidation: exists; ref: docs/architecture/task.md#session; reason: rollbackSession requires rehydratable identity and cleanup before conditional removal. -->

## Task

A task contains its details, configuration, modes, and selected mode. Each mode contains its session history and active-session ID. A mode entry does not require a separate class merely because it has a name. <!-- consolidation: exists; ref: docs/architecture/task.md#task; reason: Task and mode properties are individually specified. -->

Conceptual interface:

```ts
Task.create(...)
task.edit(changes)
task.delete()
task.getHarness()
task.getConfig()
task.newSession(modeId)
task.rollbackSession(creation)
task.cycleMode()

task.selectedModeId
task.modes[modeId].sessions
task.modes[modeId].activeSessionId
task.activeSession // derived from the selected mode
```

<!-- consolidation: exists; ref: docs/architecture/task.md#task; reason: Task.create construction and collection effects are specified. -->
<!-- consolidation: exists; ref: docs/architecture/task.md#task; reason: edit changes Task properties under coordinated persistence. -->
<!-- consolidation: exists; ref: docs/architecture/task.md#task; reason: delete intent delegates execution and storage effects. -->
<!-- consolidation: exists; ref: docs/architecture/task.md#task; reason: getHarness resolves a configured provider without launch. -->
<!-- consolidation: exists; ref: docs/architecture/task.md#task; reason: getConfig exposes current effective configuration. -->
<!-- consolidation: exists; ref: docs/architecture/task.md#session; reason: newSession composite intent is specified. -->
<!-- consolidation: exists; ref: docs/architecture/task.md#session; reason: rollbackSession conditional removal is specified. -->
<!-- consolidation: exists; ref: docs/architecture/task.md#task; reason: cycleMode changes Task selection without execution effects. -->
<!-- consolidation: exists; ref: docs/architecture/task.md#task; reason: selectedModeId property is specified. -->
<!-- consolidation: exists; ref: docs/architecture/task.md#task; reason: modes session histories are specified. -->
<!-- consolidation: exists; ref: docs/architecture/task.md#task; reason: activeSessionId membership pointer is specified. -->
<!-- consolidation: exists; ref: docs/architecture/task.md#task; reason: activeSession is the derived durable projection. -->
Construction and deletion signatures remain to be mapped to collection ownership and existing deletion behavior. These names do not authorize a task to perform storage or runtime cleanup outside controller coordination. <!-- consolidation: exists; ref: docs/architecture/task.md#task; reason: Construction and deletion rows explicitly retain unsettled signatures and prohibit model I/O. -->

`Task.newSession(modeId)`:

1. Resolve the task's configured harness and mode. <!-- consolidation: exists; ref: docs/architecture/task.md#session; reason: newSession preconditions resolve Harness and fixed mode. -->
2. Create the provisional Session, capture its identity and the previous active-session ID, prepend it to that mode's history, and make it active immediately. <!-- consolidation: exists; ref: docs/architecture/task.md#session; reason: reserveSession owns immediate insertion selection and identity capture. -->
3. Expose the provisional state through an awaited checkpoint so the controller persists it before execution begins. <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#authoritative-mutation-and-publication; reason: Reservation publication precedes execution. -->
4. Await Session/Harness startup, including readiness and initial prompt delivery. <!-- consolidation: exists; ref: docs/architecture/session-harness.md#session; reason: Startup awaits readiness and delivery. -->
5. Return the same session without inserting it again. <!-- consolidation: exists; ref: docs/architecture/task.md#session; reason: newSession returns the same session without reinsertion. -->

The controller surrounds this operation with the required coordination and persistence. The task does not know which controller called it or what locking mechanism was used. <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#authoritative-mutation-and-publication; reason: Coordination and durability remain outside Task. -->

`Task.rollbackSession(creation)` targets the specific failed creation. After execution cleanup succeeds, it removes that provisional session and restores the previous active session only if the failed session is still selected. It must not overwrite a newer selection. If the previous session no longer exists, retain a valid surviving pointer or no pointer for an empty history. The controller persists the rollback. The operation's identity and rollback information must remain available even when startup rejects. <!-- consolidation: exists; ref: docs/architecture/task.md#session; reason: rollbackSession row covers exact target conditional restoration surviving pointer and durable completion. -->

Use an ID as the stored active pointer; expose the session object through a derived getter. Do not maintain an independently mutable pointer and ID. <!-- consolidation: exists; ref: docs/architecture/task.md#task; reason: Active ID and derived durable record avoid a second writable pointer. -->

### Selected mode

Selected mode belongs to the task. Switching to another task and returning restores the previous task's selection. The controller invokes task behavior to cycle modes; the renderer reads the resulting task state. <!-- consolidation: exists; ref: docs/architecture/task.md#task; reason: cycleMode and preference ownership preserve per-task selection. -->

Selected mode's persistence policy is settled and this redesign does not reopen it: selection persists through the existing `selectedModeByTask` map and its current reload behavior, exactly as implemented today. Retention while switching tasks is required regardless. <!-- consolidation: exists; ref: docs/architecture/task.md#task; reason: selectedModeId explicitly retains selectedModeByTask and reload behavior. -->

### Initial prompt

Initial prompt delivery is part of creation. Preserve the existing provider startup/bootstrap delivery and artifact-context composition exactly once; Harness owns the provider-specific mechanism. Creation awaits readiness and initial delivery, not the agent's answer. A critical delivery failure triggers creation rollback. `session.inject(prompt)` handles subsequent explicit input; do not also inject the initial prompt after startup. <!-- consolidation: exists; ref: docs/architecture/session-harness.md#harness; reason: Harness owns exactly-once in-memory startup submission and readiness without an answer. --> <!-- consolidation: discard; ref: docs/specs/sessions.md#starting-a-session; reason: Preserving historical bootstrap artifacts exactly is superseded by direct in-memory instruction composition. --> <!-- consolidation: exists; ref: docs/specs/sessions.md#creation-failure-and-recovery; reason: Critical delivery failure triggers creation rollback. --> <!-- consolidation: exists; ref: docs/architecture/session-harness.md#session; reason: inject is subsequent explicit input rather than duplicate startup delivery. -->

## Session and RunningExecution

A session is a persistent conversation. A running execution is the process/terminal currently hosting that conversation. Stopping an execution does not erase the session; resuming can attach a new execution to the same conversation. <!-- consolidation: exists; ref: docs/architecture/session-harness.md#session; reason: Stable conversation and replaceable execution are distinguished. -->

Conceptual interface:

```ts
Session.newSession(harness)

session.id
session.harnessSessionId
session.status
session.execution // RunningExecution | undefined

session.resume()
session.stop()
session.inject(prompt)

session.onPermissionsRequired(handler)
session.onAgentRunning(handler)
session.onAgentStop(handler)
```

<!-- consolidation: exists; ref: docs/architecture/session-harness.md#session; reason: Session.newSession startup construction is specified. -->
<!-- consolidation: exists; ref: docs/architecture/session-harness.md#session; reason: id is stable application conversation identity. -->
<!-- consolidation: exists; ref: docs/architecture/session-harness.md#session; reason: harnessSessionId is established provider identity. -->
<!-- consolidation: exists; ref: docs/architecture/session-harness.md#session; reason: status is an observed ephemeral property rather than a historical schema mandate. -->
<!-- consolidation: exists; ref: docs/architecture/session-harness.md#session; reason: execution is the replaceable RunningExecution property. -->
<!-- consolidation: exists; ref: docs/architecture/session-harness.md#session; reason: resume preserves exact conversation identity. -->
<!-- consolidation: exists; ref: docs/architecture/session-harness.md#session; reason: stop ends execution while retaining conversation. -->
<!-- consolidation: exists; ref: docs/architecture/session-harness.md#session; reason: inject delivers explicit subsequent input. -->
<!-- consolidation: exists; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: onPermissionsRequired has a dedicated event contract. -->
<!-- consolidation: exists; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: onAgentRunning has a dedicated event contract. -->
<!-- consolidation: exists; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: onAgentStop is illustrative and distinguishes turn completion from exit. -->
Names are illustrative. Application identity and provider conversation identity remain distinct. <!-- consolidation: exists; ref: docs/architecture/session-harness.md#session; reason: Property names are illustrative and identities distinct. -->

The session owns its startup state and lifecycle transitions. The controller is responsible for making the necessary state durable. Persistence is not a hidden responsibility of the session model. <!-- consolidation: exists; ref: docs/architecture/session-harness.md#session; reason: Session behavior and application durability are separate responsibilities. -->

`RunningExecution` is a property of the session, not a substitute for the session. It carries the execution-specific handles and provenance needed to interact with the actual runtime. Exact fields must follow verified runtime needs rather than speculative abstractions. <!-- consolidation: exists; ref: docs/architecture/session-harness.md#runningexecution; reason: Execution capabilities and evidence are required without speculative handle fields. -->

### Events

Expose lifecycle subscriptions through the session so callers do not have to resubscribe whenever its execution is replaced. The session connects events from its current execution and disconnects obsolete execution listeners. <!-- consolidation: exists; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Stable Session subscriptions route current execution and tear down obsolete listeners. -->

Distinguish an agent completing a turn from the execution terminating. Unsupported provider events must be represented explicitly; absence of an event does not prove that an agent is idle. Event capability representation, unsubscribe behavior, and final event names are implementation-level interface decisions. <!-- consolidation: exists; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Distinct event meanings unsupported signals and unsettled API representation are explicit. -->

## Harness

A harness encapsulates provider-specific execution. A preset selects and configures the concrete harness through a factory: <!-- consolidation: exists; ref: docs/architecture/session-harness.md#harness; reason: Provider construction belongs to Harness. -->

```ts
Harness.from(preset)

interface Harness {
  new(context): Promise<RunningExecution>
  resume(harnessSessionId, context): Promise<RunningExecution>
}
```

<!-- consolidation: exists; ref: docs/architecture/session-harness.md#harness; reason: Harness.from configures a provider without allocating a conversation. -->
<!-- consolidation: exists; ref: docs/architecture/session-harness.md#harness; reason: Harness.new returns a ready RunningExecution. -->
<!-- consolidation: exists; ref: docs/architecture/session-harness.md#harness; reason: Harness.resume takes exact provider identity and launch context. -->
Start with a factory. A builder is warranted only if real staged construction requirements emerge. Launch context carries required inputs such as working directory and configuration, not unrestricted application state. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#harness-and-provider-adapters; reason: Factory before builder is the approved construction constraint. --> <!-- consolidation: exists; ref: docs/architecture/session-harness.md#harness; reason: Launch context is bounded to necessary inputs. -->

### Promise contract

Readiness uses provider-supported initialization/submission evidence (the approved R-A approach), not a synthetic prompt or proof of a completed agent turn: <!-- consolidation: exists; ref: docs/architecture/session-harness.md#readiness-and-identity-correlation; reason: R-A completion evidence is explicit. -->

- **New session:** conversation identity is established, provider initialization is confirmed, and the provider's supported acknowledgment of initial-prompt submission has been observed. <!-- consolidation: exists; ref: docs/architecture/session-harness.md#harness; reason: New promise has all three completion conditions. -->
- **Resume:** the exact conversation identity is established and provider initialization is confirmed. Do not replay the initial prompt or send a probe message. <!-- consolidation: exists; ref: docs/architecture/session-harness.md#harness; reason: Resume promise requires exact identity and initialization without replay or probe. -->
- Neither path waits for an agent response. Spawning a process alone is insufficient, but no standalone universal “input-ready” signal is required. <!-- consolidation: exists; ref: docs/architecture/session-harness.md#readiness-and-identity-correlation; reason: Signal evidence is neither spawn nor answer nor a universal event. -->

Document and test what each provider signal actually proves. A pre-processing hook is not evidence that processing succeeded; an acknowledgment is not a completed response. These are the intended completion criteria, not a guarantee against later runtime failure. Do not add synthetic probe prompts, probe-capability fields, or arbitrary readiness sleeps. <!-- consolidation: exists; ref: docs/architecture/session-harness.md#readiness-and-identity-correlation; reason: Signal semantics adapter verification and later-failure boundary are all explicit. -->

Startup failures propagate and trigger the agreed rollback. Creation remains in progress through the controller's required final persistence; its failure still triggers rollback even if Harness already resolved. After successful creation, subsequent execution failures are ordinary Session lifecycle events, not retroactive creation failures. <!-- consolidation: exists; ref: docs/architecture/session-harness.md#readiness-and-identity-correlation; reason: Final publication separates creation failure from later runtime failure. -->

Provider-specific readiness and identity discovery belong behind this interface. A provider that publishes identity through a receipt handles that internally rather than teaching Task or the UI about receipts. The execution result makes the established provider identity available to Session. <!-- consolidation: exists; ref: docs/architecture/session-harness.md#harness; reason: Harness encapsulates receipts and returns established identity. -->

Failures originate at the failing layer and bubble to the controller. Harness throws for startup failures; Session does not add catch-and-rethrow boilerplate or reinterpret provider failures. Intermediate catches are warranted for resource cleanup. If Harness allocated resources but cannot return an execution handle, it attempts its own resource cleanup before propagating failure, retaining ownership evidence and any cleanup failure when cleanup is incomplete. Exact resume must never silently create a fresh conversation. <!-- consolidation: exists; ref: docs/architecture/session-harness.md#readiness-and-identity-correlation; reason: Harness errors bubble through Session. --> <!-- consolidation: exists; ref: docs/architecture/session-harness.md#harness; reason: Partial allocations are cleaned with evidence retained. --> <!-- consolidation: exists; ref: docs/specs/sessions.md#stop-and-resume-a-session; reason: Failed exact resume never silently becomes a new conversation. -->

## Controllers and rendering

CLI and TUI use the same application coordination operations. A lock implemented only in a TUI key handler does not protect CLI operations. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#component-ownership; reason: Shared entry-point coordination excludes UI-only policy locks. -->

The UI controller connects navigation and commands to those operations. Capture the target task and mode before an asynchronous wait so later navigation cannot redirect an already requested operation. <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Dispatch captures intended identity and preserves later navigation. -->

Conceptual happy-path sketch, omitting the startup persistence protocol described below:

```ts
async newSession() {
  const task = this.tasksList.activeTask
  const modeId = task.selectedModeId

  await this.application.newSession(task, modeId)
}

```

<!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Happy-path sketch captures task and mode then delegates to the application. -->
Shared application coordination performs short locked reload → Task behavior → serialization mutations, with asynchronous Session startup between them and full rollback on critical failure. The UI call above is intent only; it is not authorization to save a stale Task after awaiting startup. The corrective plan specifies the integration sequence. <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#authoritative-mutation-and-publication; reason: Short authoritative writes surround external startup and conditional rollback. -->

UI responsibilities:

- `TasksList` owns list focus, navigation, task collection access, and task-selection events. <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: TasksList row covers focus navigation collection and events. -->
- The UI controller coordinates a task-selection transition: detach/update preview, update details, and establish the active task. <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Task-selection transition has this coordination contract. -->
- Details and preview modules own their respective display behavior. <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Details and preview have separate owner rows. -->
- The controller handles asynchronous command progress and errors consistently. <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Command dispatch owns progress and errors. -->
- The renderer reads the controller and its models directly; a duplicate view-state model is not required. <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Read-only traversal excludes a second writable hierarchy. -->

```text
Controller
└── TasksList
    ├── activeTask
    └── tasks[]
        └── Task
            ├── selectedModeId
            └── modes
                ├── sessions[]
                └── activeSessionId
```

<!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Tree illustrates controller and TasksList traversal of Task-owned modes rather than additional interfaces. -->
Rendering is read-only. Derived getters such as `task.activeSession` simplify traversal without introducing a second source of truth. <!-- consolidation: exists; ref: docs/architecture/task.md#task; reason: activeSession is derived and reads have no mutation effects. -->

## Creation, durability, and failure

### Successful creation

1. Controller captures the intended task and mode, acquires the necessary coordination, and establishes current authoritative state. <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#authoritative-mutation-and-publication; reason: Capture admission and authoritative reload are the first steps. -->
2. Controller invokes `task.newSession(modeId)`. <!-- consolidation: exists; ref: docs/architecture/task.md#session; reason: Public creation intent is preserved with split synchronous reservation. -->
3. Task inserts/selects the provisional Session immediately and captures rollback information for this creation. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#new-session; reason: Task reserves once and captures rollback identity. -->
4. Controller persists the STARTING reservation before execution begins; Session manages startup with awaited controller-owned durability checkpoints. <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#authoritative-mutation-and-publication; reason: Reservation and awaited checkpoints remain required. --> <!-- consolidation: discard; ref: docs/BLUEPRINT.md#open-design-decisions; reason: STARTING is not a mandated permanent lifecycle field. -->
5. Harness establishes identity and provider initialization, observes the supported acknowledgment of initial-prompt submission, and returns the running execution; Session completes startup without waiting for an agent response. <!-- consolidation: exists; ref: docs/architecture/session-harness.md#harness; reason: Harness new promise has these readiness conditions. -->
6. Task returns the already-inserted session. <!-- consolidation: exists; ref: docs/architecture/task.md#session; reason: newSession returns the same reserved session. -->
7. Controller persists the completed task/session state and publishes operation completion. <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#authoritative-mutation-and-publication; reason: Final publication precedes operation success. -->

### Interrupted or failed creation

Startup can create external resources before the awaited operation returns. Durable tracking must exist early enough to recover or clean up those resources after interruption. <!-- consolidation: exists; ref: docs/specs/sessions.md#creation-failure-and-recovery; reason: Resources must remain durably trackable throughout startup. -->

The agreed ownership is **session-owned startup state, controller-owned durability and rollback coordination**. Every critical failure during creation, including final persistence failure after successful startup, triggers rollback: <!-- consolidation: exists; ref: docs/BLUEPRINT.md#new-session; reason: Startup ownership and critical-failure rollback are specified. -->

1. Controller asks Session to stop/release the newly created execution. Harness cleans up allocations that never became a returned execution. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#new-session; reason: Session and Harness clean their respective allocations first. -->
2. Once execution cleanup succeeds, controller invokes Task rollback to remove the provisional session and conditionally restore selection. <!-- consolidation: exists; ref: docs/architecture/task.md#session; reason: rollbackSession preconditions and effects require cleanup and conditional restoration. -->
3. Controller persists the rollback and reports the original error through the UI/CLI error surface. <!-- consolidation: exists; ref: docs/specs/sessions.md#creation-failure-and-recovery; reason: Durable rollback and original error reporting are required. -->

Rollback failures are reported alongside the original creation failure. Attempt the remaining safe cleanup/settlement steps, but never erase the last tracking information for an execution that could not be stopped. Retain durable startup/ownership evidence for incomplete cleanup or persistence so recovery remains possible; do not claim rollback succeeded. A confirmed live execution after a critical creation failure is a rollback target, not a successful session to preserve by policy. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#new-session; reason: Critical failure cleans even live new executions and retains evidence with primary and secondary errors. -->

This differs from a predecessor-retirement failure after a successor was successfully created: the existing hand-off rule still retains that successful successor. <!-- consolidation: exists; ref: docs/specs/sessions.md#handoff; reason: Failed retirement preserves successfully published successor. -->

The internal checkpoint interface must satisfy:

- The controller needs access to startup state before `Session.newSession()` resolves. <!-- consolidation: exists; ref: docs/architecture/session-harness.md#session; reason: Startup construction exposes provisional state before completion. -->
- Required persistence must be awaitable before dependent external effects proceed. A fire-and-forget notification is insufficient. <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#authoritative-mutation-and-publication; reason: Awaited checkpoints precede dependent effects. -->
- The provisional session is selected immediately but remains STARTING until ready; selection is not a claim of successful creation. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#application-controller-and-stores; reason: Provisional selection is progress rather than success. --> <!-- consolidation: discard; ref: docs/BLUEPRINT.md#open-design-decisions; reason: Historical STARTING label is not a required durable schema. -->
- Startup and final persistence failures trigger the rollback sequence above; the original failure remains primary when cleanup also fails. <!-- consolidation: exists; ref: docs/specs/sessions.md#creation-failure-and-recovery; reason: Failure stages and primary plus secondary reporting are explicit. -->
- Coordination must reconcile current durable state rather than assume an in-memory Task is authoritative merely because a lock was acquired. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#authoritative-mutation-and-publication; reason: Mutation reloads authoritative state under lock. -->

Choose a minimal mechanism for these requirements during implementation design. Do not hide the problem behind a final `save(task)` or move persistence into the model to avoid specifying it. <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#authoritative-mutation-and-publication; reason: Explicit checkpoint collaboration replaces stale final saves and hidden model persistence. -->

## Behavioral requirements retained

The ownership redesign does not change these established requirements from the brief and repository specification:

- Failed exact resume does not become a fresh conversation. <!-- consolidation: exists; ref: docs/specs/sessions.md#stop-and-resume-a-session; reason: Explicit agreement is required for a distinct new conversation. -->
- Provider identity receipts and execution/resource provenance remain supported where required. <!-- consolidation: exists; ref: docs/architecture/session-harness.md#harness; reason: Provider evidence and receipt discovery remain behind Harness. -->
- Validate all relevant native cleanup targets before starting batch stop effects. This preflight is not a promise of transactional rollback if a later stop fails. <!-- consolidation: exists; ref: docs/specs/sessions.md#stop-and-resume-a-session; reason: All-target preflight and truthful partial failure are specified. -->
- Forget-only deletion remains distinct from stopping or purging runtime resources. <!-- consolidation: discard; ref: docs/specs/tasks.md#task-deletion; reason: Forget-only task deletion no longer satisfies approved deletion. -->
- Hand-off launches and verifies the successor before retiring an app-owned predecessor. Retirement failure preserves the running successor and reports the cleanup failure. <!-- consolidation: exists; ref: docs/specs/sessions.md#handoff; reason: Successor-first ordering and retirement failure are explicit. -->
- App-owned/native distinctions and ownership attribution retain their existing policy significance. <!-- consolidation: exists; ref: docs/specs/sessions.md#handoff; reason: App-owned predecessor eligibility remains significant. --> <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#open-design-decisions; reason: Blanket preservation of every historical native-field policy needs reconciliation with changed lifetime and deletion contracts. -->
- Stale callbacks must not mutate a replaced session or execution. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#authoritative-mutation-and-publication; reason: Current incarnation and provenance protect publication. -->
- Existing launch exclusivity and valid history/active-pointer requirements must be preserved. <!-- consolidation: discard; ref: docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport; reason: Historical per-mode exclusivity is superseded by independent conversations in the same mode. --> <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#authoritative-mutation-and-publication; reason: Same-target admission and execution-incarnation coordination remain required. --> <!-- consolidation: exists; ref: docs/architecture/task.md#task; reason: Nonempty histories retain valid active IDs. -->

These are required behaviors, not mandates to retain existing helper functions, guards, or lock layering. Map each requirement to its actual owner and verify which synchronization mechanisms remain necessary. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#creation-settlement-and-cleanup-ordering; reason: Ordering and identity invariants remain mandatory while private helpers and representation remain flexible. -->

## Implementation questions and acceptance criteria

Resolve these against source before implementing:

1. The concrete startup checkpoint and rollback-identity interfaces implementing the settled failure behavior above. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#open-design-decisions; reason: Exact checkpoint shape remains implementation work while identity contract is settled. -->
2. Shared CLI/TUI controller entry points and the minimum necessary cross-process synchronization. <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#authoritative-mutation-and-publication; reason: Shared coordinated boundary is specified without freezing private lock APIs. -->
3. Task loading/reconciliation and atomic publication of model-owned changes. <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#stores-and-repositories; reason: Load and mutate operations have explicit contracts. -->
4. Exactly-once initial prompt delivery through provider startup, without waiting for the agent's answer. <!-- consolidation: exists; ref: docs/specs/sessions.md#starting-a-session; reason: Exactly-once submission without answer wait is settled. -->
5. Concrete provider evidence for the approved readiness criteria, event capabilities, and subscription teardown. Readiness policy is settled; signal implementation and verification belong to the implementer. <!-- consolidation: exists; ref: docs/architecture/session-harness.md#readiness-and-identity-correlation; reason: Provider signal verification remains required. --> <!-- consolidation: exists; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Capability representation and teardown obligations are explicit. -->
6. Task creation/deletion interfaces. Selected-mode persistence is settled (see §Selected mode), not an open question. <!-- consolidation: exists; ref: docs/architecture/task.md#task; reason: Exact construction and deletion signatures remain unsettled. --> <!-- consolidation: exists; ref: docs/architecture/task.md#task; reason: Selected-mode persistence is settled. -->

The architecture is successful when callers can perform a task operation without assembling its internal state mutations; provider details stay in Harness; lifecycle behavior stays in Session; coordination stays in controllers; and rendering traverses the task-owned state directly. Each membership/selection/rollback rule has one implementation in Task. Concrete models have no duplicate behavioral interfaces, and persistence contains no independent interpretation of those rules. Matching outputs from two duplicate implementations do not satisfy acceptance. <!-- consolidation: exists; ref: docs/adr/0001-model-owned-domain-behavior.md#consequences; reason: Acceptance requires actual single owners rather than equivalent duplicate outputs. -->

Before claiming a migration is complete, map existing callers and behavior tests to these owners, verify the affected paths, update any repository specification claims made false by the change, and follow the repository's build requirements for a runnable CLI handoff. File splitting alone is not evidence of completion. <!-- consolidation: exists; ref: docs/adr/0001-model-owned-domain-behavior.md#consequences; reason: Caller integration and real owner tests determine completion. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#documentation-maintenance; reason: Changed approved claims update their owning contracts. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Main rebuild and freshness precede runnable handoff. -->
