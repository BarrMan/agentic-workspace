# Session service target architecture

## Purpose and status

Define the ownership and interfaces that replace the large session-service orchestration model. This is the agreed target design, not a claim about the current implementation or a completed migration plan.

The [redesign brief](session-service-redesign-brief.md) records the original proposal, prior review, and reported implementation state. Its objections are design inputs, not requirements to preserve the current structure. `docs/SPEC.md` remains the current behavior contract except for the explicitly approved creation rollback changes below; update those claims when implementing the new behavior. Use the [corrective implementation plan](session-service-redesign-correction-plan.md) before resuming the remaining migration. It supersedes the earlier plan's contract-package and phase-driven persistence design.

The goal is meaningful ownership: each model manages its own properties and behavior; controllers coordinate operations. Moving the existing service behind forwarding methods does not satisfy this goal.

## Ownership

| Owner | Responsibilities |
| --- | --- |
| Task | Task properties, configuration, selected mode, mode session histories, active-session pointers, and behavior that changes those relationships |
| Session | Conversation lifecycle, startup state, current running execution, input injection, and lifecycle subscriptions |
| Harness | Provider-specific creation, exact resume, readiness, identity discovery, and execution integration |
| Application controller | Coordination, locking, persistence, operation progress, and error handling shared by CLI and TUI |
| UI controller | Connect UI events and keybindings to application operations; coordinate focus, selection, details, and preview |
| UI modules | Their own interaction and presentation responsibilities: task navigation, details, and live preview |
| Renderer | Read and render the controller's model hierarchy |

Models do not acquire application locks or know about lock files, UI infrastructure, or persistence infrastructure. Controllers do not directly maintain model-owned relationships in place of model methods.

These ownership rules apply to every supported entry point, not only a migrated vertical slice. Task is the sole owner of task/session relationships; Session is the sole owner of individual lifecycle; Harness owns provider execution; application controllers coordinate operations and durability. CLI, TUI, Core, and MCP use these same owners.

Build order follows these ownership dependencies: establish the owning behavior, connect every supported caller of that behavior, then verify the complete ownership boundary. Bounded assignments divide work; they do not authorize an alternative legacy owner or compatibility route. A checkpoint may be reported as incomplete, but cannot be accepted as satisfying an ownership rule while another supported path implements that rule independently.

## Concrete models and necessary interfaces

`Task`, `Session`, and the application controller are concrete classes. Callers use those classes directly, including type-only imports where appropriate. Do not mirror their public methods in `TaskContract`, `SessionContract`, controller-constructor interfaces, or equivalent behavioral type aliases.

Harness has genuinely interchangeable provider implementations and therefore has an interface. Retain another behavioral interface only when actual alternative implementations need it; document those implementations at the owning seam. A test double alone does not justify a repository-wide dependency interface or a parallel model hierarchy.

Data types for persisted records, launch inputs, events, and rollback identity remain useful. Put them with their owning module and reuse existing record types. A small injected function can have a local function type; it does not require a factory interface and factory class. Do not mechanically replace every `interface` with `type`: remove redundant abstraction, not a keyword.

There is no central behavioral contract package that duplicates the models. Keep genuinely shared provider contracts with Harness and narrowly shared data with their owner. No layer may redeclare another owner's behavior merely to make parallel workers independent.

## Persistence executes model behavior, not a second domain model

Task is the sole implementation of session insertion/order, active selection, removal, and rollback pointer restoration. Session is the sole implementation of individual lifecycle transitions. Controller chooses and coordinates the operation; SessionStore owns locked reload, serialization, integrity validation, and atomic writes.

Persistence must not receive `phase: "rollback"` and implement removal/selection itself. The same applies to interpreting a reservation phase as insertion/activation. Remove `createSessionPersistence`'s domain behavior, rather than wrapping or renaming it.

For a durable relationship change, the controller uses the existing short store mutation to load current state, hydrate a concrete Task, invoke its synchronous domain behavior, and serialize the resulting session state. A whole-envelope write is safe only when derived from the current state inside that mutation; never publish a stale UI Task snapshot over concurrent records. Preserve modes and fields outside the operation, including stored histories not present in the current mode catalog.

For a lifecycle checkpoint, publish the intended Session-owned change against the current record. Explicitly distinguish changed fields from unrelated fields and support deliberate field removal. Preserve concurrent usage/selection updates; do not merge a stale whole record and then add an expanding list of fields to rescue. Membership and execution-origin validation still occurs at the publication boundary under the store lock.

An awaited callback remains appropriate to sequence durable publication before dependent startup effects. It is not permission to create a persistence interpreter for domain commands. Controller composes the callback; models know neither the store nor locks.

The controller may hold existing admission/session coordination across startup, but store-file locks cover only short state mutations. Never launch a provider or await arbitrary callbacks inside a store mutation. Separate the Task's synchronous reservation behavior from asynchronous Session startup internally while preserving the public task-creation intent. Do not grow a generic unit-of-work, command bus, or change-tracking framework for this flow.

Rollback identity must be usable after rehydration: capture the failed creation's exact identity and prior selection as data before startup, and validate it against current membership. A private map in an older Task instance cannot be the only proof authorizing rollback on a freshly loaded Task. Models still own rollback rules; the controller validates durable provenance and coordinates cleanup before invoking them.

## Task

A task contains its details, configuration, modes, and selected mode. Each mode contains its session history and active-session ID. A mode entry does not require a separate class merely because it has a name.

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

Construction and deletion signatures remain to be mapped to collection ownership and existing deletion behavior. These names do not authorize a task to perform storage or runtime cleanup outside controller coordination.

`Task.newSession(modeId)`:

1. Resolve the task's configured harness and mode.
2. Create the provisional Session, capture its identity and the previous active-session ID, prepend it to that mode's history, and make it active immediately.
3. Expose the provisional state through an awaited checkpoint so the controller persists it before execution begins.
4. Await Session/Harness startup, including readiness and initial prompt delivery.
5. Return the same session without inserting it again.

The controller surrounds this operation with the required coordination and persistence. The task does not know which controller called it or what locking mechanism was used.

`Task.rollbackSession(creation)` targets the specific failed creation. After execution cleanup succeeds, it removes that provisional session and restores the previous active session only if the failed session is still selected. It must not overwrite a newer selection. If the previous session no longer exists, retain a valid surviving pointer or no pointer for an empty history. The controller persists the rollback. The operation's identity and rollback information must remain available even when startup rejects.

Use an ID as the stored active pointer; expose the session object through a derived getter. Do not maintain an independently mutable pointer and ID.

### Selected mode

Selected mode belongs to the task. Switching to another task and returning restores the previous task's selection. The controller invokes task behavior to cycle modes; the renderer reads the resulting task state.

Selected mode's persistence policy is settled and this redesign does not reopen it: selection persists through the existing `selectedModeByTask` map and its current reload behavior, exactly as implemented today. Retention while switching tasks is required regardless.

### Initial prompt

Initial prompt delivery is part of creation. Preserve the existing provider startup/bootstrap delivery and artifact-context composition exactly once; Harness owns the provider-specific mechanism. Creation awaits readiness and initial delivery, not the agent's answer. A critical delivery failure triggers creation rollback. `session.inject(prompt)` handles subsequent explicit input; do not also inject the initial prompt after startup.

## Session and RunningExecution

A session is a persistent conversation. A running execution is the process/terminal currently hosting that conversation. Stopping an execution does not erase the session; resuming can attach a new execution to the same conversation.

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

Names are illustrative. Application identity and provider conversation identity remain distinct.

The session owns its startup state and lifecycle transitions. The controller is responsible for making the necessary state durable. Persistence is not a hidden responsibility of the session model.

`RunningExecution` is a property of the session, not a substitute for the session. It carries the execution-specific handles and provenance needed to interact with the actual runtime. Exact fields must follow verified runtime needs rather than speculative abstractions.

### Events

Expose lifecycle subscriptions through the session so callers do not have to resubscribe whenever its execution is replaced. The session connects events from its current execution and disconnects obsolete execution listeners.

Distinguish an agent completing a turn from the execution terminating. Unsupported provider events must be represented explicitly; absence of an event does not prove that an agent is idle. Event capability representation, unsubscribe behavior, and final event names are implementation-level interface decisions.

## Harness

A harness encapsulates provider-specific execution. A preset selects and configures the concrete harness through a factory:

```ts
Harness.from(preset)

interface Harness {
  new(context): Promise<RunningExecution>
  resume(harnessSessionId, context): Promise<RunningExecution>
}
```

Start with a factory. A builder is warranted only if real staged construction requirements emerge. Launch context carries required inputs such as working directory and configuration, not unrestricted application state.

### Promise contract

Readiness uses provider-supported initialization/submission evidence (the approved R-A approach), not a synthetic prompt or proof of a completed agent turn:

- **New session:** conversation identity is established, provider initialization is confirmed, and the provider's supported acknowledgment of initial-prompt submission has been observed.
- **Resume:** the exact conversation identity is established and provider initialization is confirmed. Do not replay the initial prompt or send a probe message.
- Neither path waits for an agent response. Spawning a process alone is insufficient, but no standalone universal “input-ready” signal is required.

Document and test what each provider signal actually proves. A pre-processing hook is not evidence that processing succeeded; an acknowledgment is not a completed response. These are the intended completion criteria, not a guarantee against later runtime failure. Do not add synthetic probe prompts, probe-capability fields, or arbitrary readiness sleeps.

Startup failures propagate and trigger the agreed rollback. Creation remains in progress through the controller's required final persistence; its failure still triggers rollback even if Harness already resolved. After successful creation, subsequent execution failures are ordinary Session lifecycle events, not retroactive creation failures.

Provider-specific readiness and identity discovery belong behind this interface. A provider that publishes identity through a receipt handles that internally rather than teaching Task or the UI about receipts. The execution result makes the established provider identity available to Session.

Failures originate at the failing layer and bubble to the controller. Harness throws for startup failures; Session does not add catch-and-rethrow boilerplate or reinterpret provider failures. Intermediate catches are warranted for resource cleanup. If Harness allocated resources but cannot return an execution handle, it attempts its own resource cleanup before propagating failure, retaining ownership evidence and any cleanup failure when cleanup is incomplete. Exact resume must never silently create a fresh conversation.

## Controllers and rendering

CLI and TUI use the same application coordination operations. A lock implemented only in a TUI key handler does not protect CLI operations.

The UI controller connects navigation and commands to those operations. Capture the target task and mode before an asynchronous wait so later navigation cannot redirect an already requested operation.

Conceptual happy-path sketch, omitting the startup persistence protocol described below:

```ts
async newSession() {
  const task = this.tasksList.activeTask
  const modeId = task.selectedModeId

  await this.application.newSession(task, modeId)
}

```

Shared application coordination performs short locked reload → Task behavior → serialization mutations, with asynchronous Session startup between them and full rollback on critical failure. The UI call above is intent only; it is not authorization to save a stale Task after awaiting startup. The corrective plan specifies the integration sequence.

UI responsibilities:

- `TasksList` owns list focus, navigation, task collection access, and task-selection events.
- The UI controller coordinates a task-selection transition: detach/update preview, update details, and establish the active task.
- Details and preview modules own their respective display behavior.
- The controller handles asynchronous command progress and errors consistently.
- The renderer reads the controller and its models directly; a duplicate view-state model is not required.

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

Rendering is read-only. Derived getters such as `task.activeSession` simplify traversal without introducing a second source of truth.

## Creation, durability, and failure

### Successful creation

1. Controller captures the intended task and mode, acquires the necessary coordination, and establishes current authoritative state.
2. Controller invokes `task.newSession(modeId)`.
3. Task inserts/selects the provisional Session immediately and captures rollback information for this creation.
4. Controller persists the STARTING reservation before execution begins; Session manages startup with awaited controller-owned durability checkpoints.
5. Harness establishes identity and provider initialization, observes the supported acknowledgment of initial-prompt submission, and returns the running execution; Session completes startup without waiting for an agent response.
6. Task returns the already-inserted session.
7. Controller persists the completed task/session state and publishes operation completion.

### Interrupted or failed creation

Startup can create external resources before the awaited operation returns. Durable tracking must exist early enough to recover or clean up those resources after interruption.

The agreed ownership is **session-owned startup state, controller-owned durability and rollback coordination**. Every critical failure during creation, including final persistence failure after successful startup, triggers rollback:

1. Controller asks Session to stop/release the newly created execution. Harness cleans up allocations that never became a returned execution.
2. Once execution cleanup succeeds, controller invokes Task rollback to remove the provisional session and conditionally restore selection.
3. Controller persists the rollback and reports the original error through the UI/CLI error surface.

Rollback failures are reported alongside the original creation failure. Attempt the remaining safe cleanup/settlement steps, but never erase the last tracking information for an execution that could not be stopped. Retain durable startup/ownership evidence for incomplete cleanup or persistence so recovery remains possible; do not claim rollback succeeded. A confirmed live execution after a critical creation failure is a rollback target, not a successful session to preserve by policy.

This differs from a predecessor-retirement failure after a successor was successfully created: the existing hand-off rule still retains that successful successor.

The internal checkpoint interface must satisfy:

- The controller needs access to startup state before `Session.newSession()` resolves.
- Required persistence must be awaitable before dependent external effects proceed. A fire-and-forget notification is insufficient.
- The provisional session is selected immediately but remains STARTING until ready; selection is not a claim of successful creation.
- Startup and final persistence failures trigger the rollback sequence above; the original failure remains primary when cleanup also fails.
- Coordination must reconcile current durable state rather than assume an in-memory Task is authoritative merely because a lock was acquired.

Choose a minimal mechanism for these requirements during implementation design. Do not hide the problem behind a final `save(task)` or move persistence into the model to avoid specifying it.

## Behavioral requirements retained

The ownership redesign does not change these established requirements from the brief and repository specification:

- Failed exact resume does not become a fresh conversation.
- Provider identity receipts and execution/resource provenance remain supported where required.
- Validate all relevant native cleanup targets before starting batch stop effects. This preflight is not a promise of transactional rollback if a later stop fails.
- Forget-only deletion remains distinct from stopping or purging runtime resources.
- Hand-off launches and verifies the successor before retiring an app-owned predecessor. Retirement failure preserves the running successor and reports the cleanup failure.
- App-owned/native distinctions and ownership attribution retain their existing policy significance.
- Stale callbacks must not mutate a replaced session or execution.
- Existing launch exclusivity and valid history/active-pointer requirements must be preserved.

These are required behaviors, not mandates to retain existing helper functions, guards, or lock layering. Map each requirement to its actual owner and verify which synchronization mechanisms remain necessary.

## Implementation questions and acceptance criteria

Resolve these against source before implementing:

1. The concrete startup checkpoint and rollback-identity interfaces implementing the settled failure behavior above.
2. Shared CLI/TUI controller entry points and the minimum necessary cross-process synchronization.
3. Task loading/reconciliation and atomic publication of model-owned changes.
4. Exactly-once initial prompt delivery through provider startup, without waiting for the agent's answer.
5. Concrete provider evidence for the approved readiness criteria, event capabilities, and subscription teardown. Readiness policy is settled; signal implementation and verification belong to the implementer.
6. Task creation/deletion interfaces. Selected-mode persistence is settled (see §Selected mode), not an open question.

The architecture is successful when callers can perform a task operation without assembling its internal state mutations; provider details stay in Harness; lifecycle behavior stays in Session; coordination stays in controllers; and rendering traverses the task-owned state directly. Each membership/selection/rollback rule has one implementation in Task. Concrete models have no duplicate behavioral interfaces, and persistence contains no independent interpretation of those rules. Matching outputs from two duplicate implementations do not satisfy acceptance.

Before claiming a migration is complete, map existing callers and behavior tests to these owners, verify the affected paths, update any repository specification claims made false by the change, and follow the repository's build requirements for a runnable CLI handoff. File splitting alone is not evidence of completion.
