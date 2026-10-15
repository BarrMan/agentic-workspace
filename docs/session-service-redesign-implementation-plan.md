# Session redesign — parallel implementation plan

> **Superseded execution instructions:** follow [the corrective plan](session-service-redesign-correction-plan.md) before continuing this migration. In particular, do not implement this document's central behavioral contract package, Task/Session/controller mirror interfaces, or P1 phase-driven persistence adapter. Those instructions contradicted model ownership. The source map, retained behavior scenarios, and remaining UI/CLI migration inventory below are reference material only; the integrator must rebase unfinished tickets onto the corrected concrete-model and model-owned mutation design. Startup, rollback, and R-A readiness decisions remain approved.

## Authority, scope, and execution status

Implement [the target architecture](session-service-redesign.md), using [the debate brief](session-service-redesign-brief.md) as background. This document plans implementation; it does not authorize starting workers that edit code or claim that tests have passed.

Source evidence was gathered through three bounded @explorer audits of runtime, models/storage, and UI/CLI, followed by checks of the actual symbol inventory, test paths, package scripts, and `docs/SPEC.md`. Recheck Git status and relevant source at execution time. The brief's line counts and uncommitted-work claims are not a baseline.

Read repository `AGENTS.md`, the [runtime handoff](shared-agent-runtime-handoff.md), and its safeguard pointers before runtime work. `docs/SPEC.md` takes precedence over old resume-fallback plans. This target replaces the old structural instruction to retain `AgentSessionService`, not its safety or behavior requirements. Read the remediation plan before modifying tests to remediate failures. Read the enabled automation configuration before implementation.

**The startup, rollback, and readiness product decisions are settled. No further product decision is required to begin implementation.** Complete Gate 0's technical contract work before dispatching parallel implementation waves; workers must implement the decisions below rather than reopen them. Commit authorization is a separate execution permission; see Parallel execution rules.

## Gate 0 — freeze the implementation contracts

Owner: main integrator, with one fresh @fixer contract worker. Deliver a small compiled contract module and focused contract tests before parallel implementation. No other worker edits the contract module afterward; requested interface changes return to the integrator.

### G0.1: approved startup membership and rollback contract

Task immediately inserts the provisional session and makes it active. Controller persists the STARTING reservation before execution begins. `newSession()` awaits readiness and returns that same session without duplicate insertion. No separate pending-operation storage representation is required.

Any critical creation failure, including final persistence failure after the process starts, triggers controller-coordinated rollback: stop/release the newly created execution, remove the provisional session through `Task.rollbackSession(creation)`, conditionally restore the previous selection, persist rollback, and report the original error. If another session is now selected, preserve that selection. Successful rollback removes the failed creation rather than retaining a failed history entry.

Errors originate in the failing layer and bubble to the controller. Session does not interpret Harness startup errors or add catch-and-rethrow boilerplate. Harness cleans up resources allocated before it can return an execution handle; Session owns cleanup of its execution. Cleanup catches preserve the original failure and expose secondary failures.

If rollback fails, report both failures and retain startup/ownership evidence for recovery. Do not remove the last tracking information for an execution that could not be stopped or claim that an unsuccessful durable rollback completed. This approved policy supersedes the old recommendation to preserve a confirmed-live execution on critical creation failure. Predecessor-retirement failure after successful successor creation remains a separate hand-off outcome and retains the successor.

### G0.2: decisions for this structural refactor

- Keep the existing nested-mode session format. Domain-object ownership does not require moving session histories into task Markdown or introducing a transaction across unrelated files.
- `Task.selectedModeId` is authoritative in memory. Controller hydrates and persists it through the existing view-state representation. Preserve existing reload/other-client behavior; do not add a field to task Markdown or reinterpret project default mode as saved selection.
- Freeze selection serialization before Wave 3: retain the existing `selectedModeByTask` wire shape; hydrate each Task from its entry with the existing validated default fallback; controller writes only the changed task entry through the existing locked view-state update; mode/task removal prunes only affected entries. U1 owns UI/model synchronization, K1 owns mode-lifecycle pruning. Both use this contract independently; neither changes `view-state-store.ts` or the wire format. Integrator owns any shared serialization helper needed by both and lands it before their dispatch.
- Preserve current mode-prompt bootstrap delivery and artifact-context composition exactly once. Do not add automatic post-start `inject(prompt)` or fix the separate prompt discrepancy in SPEC §12 in this refactor. Session still exposes injection for explicit input.
- Initial delivery belongs to creation; await readiness and delivery, not the agent's answer. Critical initial-delivery failure triggers the approved rollback.
- Resolve current configuration for launch/resume/ask. Hydrating a Session must not freeze a creation-time preset/configuration snapshot.
- Preserve forget-only task deletion, separate task completion, running-limit policy, per-session forced-delete policy, and app-owned predecessor retirement. No field retirement that changes these policies.
- No new packages, daemon, provider-global uniqueness rule, schema migration, or generic event/state-machine framework.

### G0.3: shared interface package

Proposed files, all integrator-owned: `src/agent-workspace/session-contracts.ts` and `src/agent-workspace/session-contracts.test.ts`. Reuse record types from `types.ts`; alias the existing task DTO as `TaskRecord` locally rather than renaming the repository-wide `Task` type.

Freeze these contracts in real TypeScript, with concrete existing types rather than `any` or opaque context bags:

| Interface | Required contract |
| --- | --- |
| Task hydration input | Existing task DTO, current resolved modes/configuration, session records, selected mode, injected session-creation factory; no Core/store/lock object |
| Session factory | Controller binds an operation-scoped lifecycle checkpoint sink and current harness; Task calls it without knowing storage or locking |
| Creation rollback identity | Available before startup can reject: exact task/mode/provisional session identity and previous active ID; never infer the failed creation from the current selection |
| Lifecycle checkpoint | Awaitable immutable record snapshot plus exact expected membership/execution origin and phase; no arbitrary persistence closure supplied by the model |
| RunningExecution | Exact owned execution identity, provider conversation ID, input/stop/observation capability, listener teardown; no persistence or task membership behavior |
| Harness | `new(context)` resolves after identity, provider initialization, and supported initial-prompt submission acknowledgment; `resume(nativeId, context)` resolves after exact identity and provider initialization; reject with recoverable owned execution information |
| Session | New/resume/stop/inject, stable subscription surface, current execution, serialization to existing record shape |
| Application controller | Existing public session operations mapped one-for-one, plus Task hydration and coordinated task behavior; UI-independent construction |

Define an unsubscribe function for every event subscription. Distinguish turn completion, permission wait, and execution exit. Represent unsupported activity events explicitly; no synthetic idle inference. Reuse `activity-observer.ts`, `agent-status-probe.ts`, and `status-hooks.ts` behavior rather than creating parallel status inference.

### G0.4: checkpoint and error ordering

Implement this concrete protocol; the contract worker must verify exact field availability against the current service before freezing types:

1. Controller acquires task admission, reloads current state, validates mode/task eligibility, and acquires the needed session claim using existing lock ordering.
2. Task creates/reserves its model-owned relationship under the G0.1 choice. Controller writes the STARTING reservation through a short locked store mutation before runtime dispatch.
3. Session owns preparation state. Each checkpoint awaits the controller sink; the sink checks expected membership and publishes only the corresponding change under a short store lock. It must not overwrite unrelated timestamps or another session's history.
4. Runtime allocation uses existing names/tags/resource inventory so an interruption between allocation and checkpoint remains discoverable. No claim that a file write and process spawn are atomic.
5. Harness resolves according to G0.5's new/resume criteria; receipt handling remains in provider/runtime implementation. Controller durably publishes required identity/state before command success is reported. A Harness promise resolving does not end the controller's creation transaction or exempt final-persistence failures from rollback.
6. Controller publishes completion and any existing task-status transition. Task-status changes are a separate existing operation, not a fictitious atomic transaction with session JSON.
7. Every critical creation failure attempts rollback, before or after dispatch. Use exact owned provenance to stop/release any newly created execution, including a confirmed-live execution when final persistence fails. Only after execution cleanup succeeds remove its provisional association via Task rollback and persist the restored state. If there was no execution, roll back the association directly. Replace the old `settleDispatchedLaunchFailure` preserve-live policy for this creation path; do not weaken ownership validation or mislabel a failed stop as success.
8. Preserve the primary error and report secondary persistence/cleanup/release errors. Attempt remaining safe settlement steps. If stopping or persistence fails, retain recovery evidence and report incomplete rollback; never erase the last record of an execution that could not be stopped. Do not treat failure to retire a predecessor after successful creation as creation failure.

No store-file lock spans provider startup, input, or arbitrary callbacks. The checkpoint sink may perform short writes under already-held admission/claim ownership; it must not reacquire those locks. Do not use ambient/global “current operation” state. Close operation-scoped sinks on completion and reject late startup callbacks; later observation uses a fresh coordinated operation with provenance checks.

### G0.5: approved readiness — R-A without synthetic probes

The readiness policy is decided:

- New: established conversation identity, confirmed provider initialization, and the provider-supported acknowledgment of initial-prompt submission.
- Resume: established exact conversation identity and confirmed provider initialization. No bootstrap replay and no synthetic probe message.
- Neither path waits for an agent response or requires a standalone universal input-ready signal. Do not implement R-B's probe round-trip or block on R-C's stronger guarantee.
- Startup failures propagate to creation rollback. Failures after successful creation are ordinary session lifecycle events. Final persistence is still part of creation and remains rollback-triggering.

Replace any placeholder `HARNESS_READINESS_MATRIX` with concrete evidence for OpenCode v1, OpenCode v2, Claude, and Pi: native identity source, initialization evidence, new-session submission acknowledgment, exact-resume initialization evidence, failure/deadline behavior, and supported events. Keep readiness implementation inside Harness.

The implementation agent reported candidate signals: the owned v1 plugin, v2 API acknowledgment, Claude `UserPromptSubmit`, and Pi `before_agent_start`. These are investigation leads, not independently verified guarantees in this plan. Verify their actual semantics and lifecycle placement in source/documentation. In particular, a hook before processing does not prove processing succeeded. Document each signal's limitations and test the production adapter path. A live pane alone is insufficient; an artificial prompt or arbitrary sleep is not an acceptable substitute.

Remove unused contract filler such as `TaskAdmissionContext`; do not introduce a probe-capability field. Freeze the concrete evidence and interfaces, then dispatch the ready waves. Lack of a universal input-ready signal is not an owner-decision blocker under this approved contract. If a specific provider cannot satisfy even these criteria, report the concrete implementation limitation rather than reopening the R-A/R-B/R-C choice speculatively.

**Gate success:** approved startup/rollback semantics encoded in concrete shared types; provider matrix feasible; types compile; checkpoint and rollback ordering have deterministic fake tests; public-method migration inventory includes every `AgentSessionService` method with a destination or justified removal. Record no unimplemented placeholder as a completed feature. This is technical implementation work, not a pending product approval.

## Source map and intended destinations

All paths below are relative to the repository unless stated otherwise.

| Current source/symbols | Destination/owner |
| --- | --- |
| `types/index.ts` task DTO; `agent-workspace/types.ts` session/mode records | Keep serialization shapes; new behavioral `agent-workspace/task.ts` and `session.ts` |
| `sessions.ts`: `createSessionRecord`, `reserveModeRecord`, mode/active relationships | Task behavior, invoked by application controller; Session owns lifecycle fields |
| `sessions.ts`: preparation, launch, identity reconciliation, execution failure settlement | Session lifecycle + Harness/runtime implementation; controller checkpoint publication |
| `sessions.ts`: admission, claims, current-record publication, running limits, cross-session hand-off/cleanup | Application controller; bounded controller operations for cross-session policy |
| `session-launch.ts`, `session-process.ts`, `agents/*` | Reuse mechanics behind Harness/RunningExecution; remove duplicate orchestration after cutover |
| `session-store.ts` | Existing serialization, validation, locked reload/mutation, receipt persistence where still needed; no domain lifecycle policy |
| `workspace-state.ts` | Replace forwarding orchestration with shared application-controller usage; remove redundant facade after callers migrate |
| `core/agentic-workspace.ts`: `sessions` getter | Compose the shared application controller; preserve required Core lifecycle entry points |
| `commands/agent-workspace.ts` | CLI invokes shared application-controller operations |
| `ui/opentui/workspace-controller.ts` | UI wiring and coordinated view transitions only; delegate application lifecycle operations |
| `ui/opentui/workspace.ts`, `workspace/state.ts` | Renderer traversal and serialization of task-owned selection; no independent mutable selected-mode authority |

## Parallel execution rules

Use fresh @fixer workers, one ticket per context, no worker subdelegation. Give each only the target doc, frozen contract, its ticket, and directly relevant source/tests. Results contain changed paths, tests with counts, unresolved concerns, and contract deviations—not file dumps.

All workers in a wave start from the same integrated base in isolated worktrees. One writer per file, including tests. If a worker needs an unowned file, it sends the integrator a bounded change request and continues independent work. No interface edits, shared test-helper edits, or opportunistic cleanups by leaf workers.

The integrator owns shared types, `sessions.ts`, `workspace-state.ts`, Core integration, and final cutover. UI controller and renderer are deliberately separate waves because both otherwise need `workspace.ts`. Providers and Session are likewise separated by the frozen execution contract.

Superseded: temporary adapters and retaining the old application path are not authorized. Follow the current-contract-only policy and [target ownership design](session-service-redesign.md).

The runtime plan requires a verified checkpoint commit before the next implementation slice. Workers do not commit independently. Obtain explicit commit authorization at execution kickoff; without it, stop at the first verified checkpoint rather than bypassing that rule. Parallel tickets in one wave form one integrated slice. No push is implied.

### Dependency graph

```text
G0 technical contract gate (product decisions settled)
  └─ Wave 1: M1 Task model || M2 Session model || R1 Harness/runtime || P1 storage
       └─ Wave 2: I1 shared application controller + vertical cutover
            └─ Wave 3: C1 CLI || U1 UI controller/navigation || K1 Core/task CRUD
                 └─ Wave 4: U2 renderer/details/preview
                      └─ Wave 5: I2 retire old paths + V1 independent verification
                           └─ main build, freshness, disposable CLI acceptance
```

V1 starts as a read-only audit of the integrated Wave 4 result while I2 makes only agreed retirement changes; final V1 verification uses the final assembled tree. It never writes tests concurrently with I2.

## Worker tickets

### M1 — behavioral Task model

Depends on G0. Exclusive writes: new `src/agent-workspace/task.ts`, `task.test.ts`.

1. Implement hydration from existing DTO/configuration/records, retaining source/editability distinctions. Do not replace the global Task DTO.
2. Own selected-mode cycling, mode histories, active ID/getter, and new-session relationship updates. Implement the approved provisional reservation behavior without double insertion.
   Implement `rollbackSession(creation)` to remove only the failed provisional session and restore the previous pointer only while the failed session remains selected; keep a valid pointer if the former selection was deleted. Controller calls this after execution cleanup succeeds. Test failed creation removal and a newer selection surviving rollback.
3. Use the injected creation factory; no Core, filesystem, store, or lock imports. Resolve mode input before awaiting; update the requested mode, not whichever mode is selected later.
4. Provide domain edit/create/removal behavior needed by K1 without assuming deletion means stop. Keep validation consistent with existing task rules; do not duplicate infrastructure validation.
5. Serialize only existing persistence fields; methods, listeners, runtime handles, and harness objects never enter JSON.

Validate: `bun test src/agent-workspace/task.test.ts --timeout=10000`.

Success: A→B→A preserves mode selection; invalid modes fail without launch; one creation adds one session to the intended mode; active pointer stays valid; failure follows G0.1; DTO hydration preserves identity/source; model tests need no filesystem or real process.

### M2 — Session lifecycle and execution ownership

Depends on G0. Exclusive writes: new `src/agent-workspace/session.ts`, `session.test.ts`.

1. Implement new/resume/stop/inject around the frozen Harness and RunningExecution interfaces, with session-owned lifecycle state and awaited checkpoint emissions.
2. Keep native/application identity separate. Resume preserves conversation identity; missing/failed exact resume rejects, never invokes Harness.new.
3. Own current execution and stable event subscriptions. Discard obsolete execution events, unsubscribe on replacement/disposal, distinguish detach from stop.
4. Ensure success waits for required checkpoints. Keep execution/provenance available for controller-coordinated rollback. Let Harness failures bubble without interpretation; use catches only when resource cleanup requires them. Test stop/release during rollback and propagation of cleanup failures.
5. Use injected fakes for deterministic readiness, failure, and stale callback tests. Do not import `SessionStore` or acquire locks.

Validate: `bun test src/agent-workspace/session.test.ts --timeout=10000`.

Success: promise remains pending before readiness; checkpoint rejection prevents dependent effects; stop retains conversation; resume replaces execution without leaking listeners; obsolete events cannot alter new execution; supported/unsupported events remain distinguishable.

### R1 — Harness and RunningExecution implementation

Depends on G0 provider matrix. Exclusive writes: new `src/agent-workspace/harness.ts`, `harness.test.ts`; existing `session-launch.ts`, `session-process.ts`, `agents/agent.ts`, `agents/agents.ts`, concrete provider files; their directly corresponding tests. Own `session-launch.test.ts`, `session-process.test.ts`, `session-process-resources.test.ts`, `opencode-detected-session.test.ts`, provider tests. Do not edit shared record types or `sessions.ts`.

1. Implement preset factory using current effective-version/configuration resolution. Reuse provider adapters and `SessionProcess`; avoid two provider registries.
2. Implement new/exact-resume with the approved readiness contract. Carry one resolved adapter through startup; keep receipt discovery behind Harness.
3. Implement execution input/stop/observation and provenance using existing transport/resource helpers. Preserve capture across attachment and detach.
4. Preserve prompt bootstrap exactly once and exact resume prerequisites before outgoing-resource cleanup.
5. Map existing activity/permission hooks without claiming unsupported events. Maintain dependency direction: Harness must not import Session/Task/controller/store.

Validate individually: `src/agent-workspace/session-launch.test.ts`, `src/agent-workspace/session-process.test.ts`, `src/agent-workspace/session-process-resources.test.ts`, `src/agent-workspace/opencode-detected-session.test.ts`, plus changed provider tests such as `src/agent-workspace/agents/opencode-v1.test.ts`, `src/agent-workspace/agents/opencode-v2.test.ts`, and `src/agent-workspace/agents/model-profile-contract.test.ts`; use `bun test <file> --timeout=10000` once per file. Add Claude/Pi readiness coverage to the new `src/agent-workspace/harness.test.ts` and run it as well.

Success: all four harness variants satisfy provider matrix tests; no spawn-only readiness; receipts and exact IDs survive interruption; no duplicate prompt; failed startup is recoverable; no new global native-ID exclusion or automatic stop on UI detach.

### P1 — persistence adapter/checkpoints

Depends on G0. Exclusive writes: new `src/agent-workspace/session-persistence.ts`, `session-persistence.test.ts`; existing `session-store.ts`, `session-store.test.ts`, `session-store-mode-contract.test.ts`. Keep changes to store minimal.

1. Implement the controller's checkpoint persistence adapter, using existing short locked mutations and claims rather than a new locking system.
2. Reload under lock, validate expected membership/provenance, apply the intended record/mode delta, validate, atomically write. Never save a stale whole Task snapshot over concurrent records.
3. Preserve receipt validation, sidecar paths, versioned mode envelope, valid pointers, and unrelated usage updates.
4. Expose callable operations for I1; do not put launch/stop policy into the adapter. Controller owns lock lifetime; adapter must not reacquire caller-held admission/session claims.
5. Test failure at reservation, identity, final publication, and rollback publication, including stale membership and deleted/replaced task/session. Verify successful durable rollback removes the provisional record, while failed rollback retains recovery evidence and does not overwrite a newer active selection.

Validate individually with `bun test <file> --timeout=10000`: `src/agent-workspace/session-persistence.test.ts`, `session-store.test.ts`, `session-store-mode-contract.test.ts`.

Success: no schema migration; durable reservation precedes dispatch in contract tests; stale callbacks cannot resurrect records; independent session/usage changes survive; lock release failure is surfaced; no lock held over provider waits.

### Wave 1b — contract completion (added after independent review of the Wave 1/2 boundary)

An independent review of the frozen contract against the Wave 1 modules concluded that Wave 1 is not a sufficient base for I1. Fix these before re-dispatching I1; do not dispatch I1 against the pre-Wave-1b contract.

1. **Task relationship surface is incomplete.** Task exposes only creation and creation-rollback, yet I1 must select an existing conversation, register/adopt a pending record without relaunching it, remove a membership and repair the active pointer, remove a mode history, and reconcile durable histories while retaining the selected mode. Task also has no supported way to apply a session's accepted lifecycle record into its history, so `Task.modes`/`activeSession` go stale after the identity/ready checkpoints. Resolution: records are a projection, not a second lifecycle authority — add one update-only seam plus the missing relationship operations.
2. **Lifecycle authority is bound at construction instead of per operation.** Session captures a readonly checkpoint sink (and Task the creation factory) and reuses it for later start/resume/stop, whereas G0.4 requires closing startup sinks and using fresh coordinated authority per operation. Session identity and subscriptions stay long-lived; authority must be operation-local, passed by the controller for each command.
3. **Session's transition surface is incomplete.** Observed lifecycle changes (execution exit) never become record changes or publications; `stop()` retains the stopped execution and listeners; resume does not clear prior `endedAt`/`error`; park/finish/adopt of an already-live execution are absent.
4. **The controller interface dropped required inputs:** per-session delete `force`, hand-off successor/predecessor identity and prior selection, verified runtime origin for activate/finish/park, mode destination on mode deletion, and task-wide purge.

Also to correct in implementation (not architecture): publication must be a field-owned delta against current locked state so a usage update made after the snapshot survives; the legacy flat-mode alias pointer must stay synchronized; persisted history order must match Task's newest-first order; rollback checkpoints must be creation-origin only; and cleanup outcome must be tracked separately from publication outcome.

The reported green suite does not establish end-to-end checkpoint, rollback or stale-callback correctness.

### I1 — shared application controller and vertical integration

**The construction contract is frozen.** `src/agent-workspace/session-contracts.ts` declares `SessionControllerDependencies` (narrow capability ports: task repository, admission/lock, configuration, task paths, store, files, requests, mode selection, mode-lifecycle storage, runtime) plus `SessionControllerConstructor`. Implement against that boundary and against injected fakes.

The controller owns admission ORDERING, current-state loading, policy, model invocation, publication, rollback, and verified runtime-absence evidence. Ports perform storage, configuration, locking, and runtime mechanics — never whole session operations. Do NOT inject `Core`, `AgentSessionService`, or a `Pick` of its orchestration methods, and do NOT re-create `prepareSession` / `launchAndPersist` / `stopAndSave` callbacks: that reintroduces the orchestration being retired.

**Absence is verified evidence, not a missing handle.** `Session` settles only an execution it has installed; `SessionRuntime.inspect` returning `uncertain` is never absence. The controller inspects, then settles a session it holds no handle for through `park`/`finish`.

Lane order — each owns disjoint files; the contract is the interface:
1. Freeze construction and corrected surfaces — `session-contracts.ts`, `session-contracts.test.ts` (done).
2. Complete Session/publication behavior (`session.ts`, `session.test.ts`, `session-persistence.ts`, `session-persistence.test.ts`) and the contract-driven runtime corrections (`harness.ts`: execution incarnation + `sendKey`). Do NOT implement the production `SessionRuntime` or the production adapters here — nothing on the critical path consumes them, and their mechanisms are private to `AgentSessionService` in `sessions.ts`; reimplementing them early manufactures a second ownership authority for pane/provenance checks.
3. Implement the controller against fakes — new `src/agent-workspace/session-controller.ts`, `session-controller.test.ts`. Never edits contract, model, or runtime files; requests a bounded change instead.
4. Wire production — new `core/session-application.ts`; the production `SessionRuntime` implementation; the store/file/request/selection/mode-lifecycle adapters; `core/agentic-workspace.ts`, `task-mutation-service.ts`, `task-lifecycle-service.ts`. This is the first stage authorized to coordinate `sessions.ts` changes with I2, because the tag/clear provenance checks (`tagNativeSessionPane`, `clearNativeSessionPaneTag`) and the canonical-root validation live there and must be MOVED, not duplicated.
5. Migrate consumers — C1/U1/U2. 6. Retire paths — I2.

Validate each owned test file in its own Bun process with `--timeout=10000`, plus Wave 1 new tests after integration. Run `bun run check:types` and scoped Biome checks.
2. Move coordination out of the old service, not lifecycle into a newly named monolith. Controller owns admission/claims, reload, current configuration, running-limit decisions, hand-off, batch preflight, persistence, and command error reporting. Session owns individual execution lifecycle.
3. Migrate queued request admission and finalization, verified live attachment, reconciliation, park/finish, active selection, previous session, output, ask, input, deletion, forget, and task-wide cleanup per the G0 method inventory. Preserve stopped-only ask, timeouts/partial output, and non-launching reads.
4. Implement full creation rollback on every critical failure, including final persistence failure with a live execution. Stop/release that execution before removing its tracking; preserve evidence and report both errors if rollback fails. Preserve successor-first hand-off and captured predecessor identity, restore selection only while the failed successor is still selected, and retain a successfully created successor if only predecessor retirement fails.
5. Superseded: temporary compatibility exports are not authorized. Follow the current-contract-only policy and [target ownership design](session-service-redesign.md).
6. Add deterministic races: same-session two-controller admission, different sessions preserved, delete during startup, same-ID replacement, navigation during launch, and store failure after dispatch. Assert final-persistence failure attempts execution teardown and Task rollback; failed teardown retains tracking; failed rollback persistence reports original plus rollback errors; successful rollback removes the provisional entry; a newer selection survives.

Validate each owned test file in its own Bun process with `--timeout=10000`, plus Wave 1 new tests after integration. Run `bun run check:types` and scoped Biome checks.

Superseded: success does not permit a source vertical slice to remain runnable through temporary old entry points; see the complete supported ownership boundary in the target design.

### C1 — CLI migration

Depends on I1. Exclusive writes: `src/commands/agent-workspace.ts`, `src/test/agent-workspace-cli.test.ts`, `agent-workspace-cli-routing.test.ts`.

Replace direct service construction for list, both start paths, stop, attach, output, ask, reconcile, reset, delete with shared application-controller composition. Preserve flags, output formats, exit behavior, mode resolution, explicit new-vs-resume intent, and current force policy. Do not acquire a second set of locks in command handlers.

Validate both owned test files separately: `bun test src/test/agent-workspace-cli.test.ts --timeout=10000` and `bun test src/test/agent-workspace-cli-routing.test.ts --timeout=10000`.

Success: every command uses shared operations; read commands launch no runtime; failure exits/output remain compatible; no CLI-only creation/selection logic.

### U1 — UI controller and TasksList

Depends on I1. Exclusive writes: `src/ui/opentui/workspace-controller.ts`, `workspace/state.ts`; new `workspace/tasks-list.ts`, `workspace/tasks-list.test.ts`; `src/test/opentui-workspace-controller.test.ts`, `opentui-workspace-controller-shared-attachment.test.ts`, `opentui-mode-navigation-contract.test.ts`, `opentui-session-picker.test.ts`. Do not edit `workspace.ts`; retain its current render input adapter until U2.

1. Hydrate Task models through application operations. Move focus/navigation/task collection selection to TasksList. Task cycling invokes model behavior; persistence is controller-owned through the existing view-state adapter.
2. Migrate `#loadSnapshot`, `#syncSelectedSession`, `#startTaskSession`, `#handoffLocalSession`, `#openSessionPicker`, `#cycleMode`, and the additional direct service-construction path to shared application operations.
3. Capture task/mode/predecessor before awaiting. A late completion must not select another task or replace the current preview. Coordinate detach/details/preview changes in one selection transition.
4. Retain stable selected mode on refresh/re-hydration; apply authoritative external state changes via model methods, not a second independently mutable selection map.
5. Keep UI quit transport-only; preserve preview input/resize, picker behavior, and activity-driven dots.

Validate every owned test individually with `bun test <file> --timeout=10000`.

Success: navigation focus works; A→B→A retains mode; Tab never launches; late launches cannot steal selection; attach is passive; two-client attachment survives detach; UI contains no session-file mutation or provider startup protocol.

### K1 — Core/task lifecycle integration

Depends on I1 and M1. Exclusive writes: `src/core/agentic-workspace.ts`, `task-mutation-service.ts`, `task-lifecycle-service.ts`; `src/agent-workspace/mode-lifecycle.ts`, `mode-lifecycle-contract.test.ts`; `src/test/all-mode-task-cleanup-contract.test.ts`. Own directly affected task CRUD tests after integrator checks exact paths; no shared helper edits without assignment.

1. Compose the shared controller through Core's existing `sessions` entry and migrate all callers of that entry, including indirect command/MCP paths. Inventory references before edits; report additional files for explicit assignment.
2. Use Task behavior for task edits and relationship changes while retaining existing task repository and canonical storage layout. Do not rewrite generic task persistence to store class instances.
3. Keep creation and forget/delete/completion coordination at the application layer. Task.delete must not signal a process; completion retains explicit cleanup/worktree behavior.
4. Mode deletion removes that mode's history and selection references without merging sessions into another mode. Coordinate view-state serialization with U1 through the frozen interface, not concurrent edits.
5. Ensure Core task-status callbacks do not reenter held task/session admission locks.

Validate `mode-lifecycle-contract.test.ts` and `src/test/all-mode-task-cleanup-contract.test.ts` separately, plus exactly the CRUD/deletion suites identified by changed callers. Use `bun test <file> --timeout=10000`.

Success: local/remote edit eligibility preserved; canonical task storage preserved; deletion sends zero runtime signals/probes/provider calls; completion still cleans up; delayed startup cannot resurrect deleted associations; Core/MCP paths cannot bypass coordination.

### U2 — renderer, details, and live preview

Depends on U1. Exclusive writes: `src/ui/opentui/workspace.ts`, `task-detail-content.ts`; new presentation modules under `workspace/` only when they remove actual responsibilities from the large renderer. Own `src/test/opentui-workspace-detail.test.ts`, `opentui-workspace-layout.test.ts`, `opentui-workspace-agent.test.ts`, `mode-workspace-render-contract.test.ts`, `mode-workspace-input-contract.test.ts`, `mode-session-dot-projection.test.ts`.

Render controller → TasksList → Task → selected mode/active session directly through a read-only interface. Remove the temporary duplicated projection from U1 via a bounded integrator change to `workspace-controller.ts`. Extract details and preview responsibilities using existing UI primitives, not a React migration. Preserve layout, grouped task list, focus/help/keybinding configuration, placeholders, status colors, terminal input, and resize behavior.

Validate each owned test individually with `bun test <file> --timeout=10000`.

Success: renderer does not mutate domain/lifecycle state; no second selection source; empty/starting/running/stopped/error states follow SPEC; list/details/preview each have an identifiable owner; input and resize still reach the selected execution only.

### I2 — retire transitional paths

Depends on C1/U1/K1/U2. Owner: integrator, exclusive control of all deletion/integration changes.

Search production consumers separately from tests for `AgentSessionService`, `WorkspaceStateService`, direct session-store writes, and selected-mode writes. Remove compatibility exports and redundant facade methods after last consumers migrate. Update remaining tests to real new entry points, preserving behavioral assertions. Remove superseded orchestration from `sessions.ts`; do not leave a renamed copy or a forest of pass-through wrappers. Keep useful low-level validators/transport/persistence helpers where they still own real behavior.

Update `docs/SPEC.md` and architecture pointers for the approved semantics, especially the post-dispatch preserve-live clause in §7: critical creation failure now attempts full rollback, while predecessor-retirement failure after successful creation still retains the successor. Update tests asserting the superseded creation behavior. No unrelated known-gap fixes. Shared helper/test changes are integrator-owned and validated with their callers.

Success: no production path invokes retired orchestration; public-method inventory has no unexplained omissions; no provider-specific launch logic in Task/UI; no locks/storage in models; no task relationship writes in renderer/controller bypassing model behavior; no unused transition adapter.

### V1 — independent architecture and behavior verification

Depends on integrated Wave 4 for initial read-only review, final I2 tree for acceptance. Fresh @oracle reviewer; no edits.

Trace one new session, one exact resume, one hand-off, one deletion, and one UI task/mode switch through actual callers. Check ownership against target, startup gate, and G0 method inventory. Verify tests exercise production flow rather than mock away the new owners. Report only actionable findings with symbols, failing behavior, and required validation. Integrator assigns fixes to fresh bounded workers; V1 does not become an unbounded repair lane.

Success: no unresolved ownership/behavior regression; evidence distinguishes fake/source tests from runtime acceptance. Review line counts as a signal only, never as a passing criterion.

## Validation protocol and final acceptance

Before implementation, record Bun version (repository requires ≥1.4), `bun run check:types` baseline, and results for the focused tests about to change. Do not treat the brief's historical test counts or TypeScript baseline as current proof.

For each ticket:

1. Audit fake/process isolation before running affected tests. Use existing preload isolation and test-owned teardown; never use live user tasks or agent processes.
2. Run each named suite in its own process: `bun test <exact-file> --timeout=10000`. For a combined selection use Bun's parallel runner, not many files sharing one process. Bound concurrent test processes to avoid machine-starvation timeouts.
3. Run `bunx biome check <explicit-changed-files>` and `git diff --check -- <explicit-changed-files>`. Integrator runs `bun run check:types` on the assembled slice. Report new diagnostics separately from the captured baseline; do not hide failures as “pre-existing” without evidence.
4. Return changed files, source-test counts, relevant behavior evidence, remaining blockers, and any contract change request. No commit/build/runtime claims without performing them.

Final acceptance matrix:

| Scenario | Required evidence |
| --- | --- |
| New session, all harnesses | One reservation, one execution, provider readiness, correct mode membership/active pointer, prompt delivered once |
| Exact resume | Same native ID; prerequisites before cleanup; failure reported; no implicit fresh launch |
| Concurrent operations | Same target serialized; unrelated updates retained; deleted/replaced record rejects stale publication |
| Interrupted startup | Recovery at reservation, allocation, identity, readiness, final-write checkpoints; truthful partial failure |
| Critical creation failure | Execution cleanup followed by provisional removal and conditional selection restoration, including final-persistence failure; no failed history entry after successful rollback |
| Rollback failure | Original and secondary errors reported; failed stop retains execution tracking; failed persistence retains recovery evidence; no false success or newer-selection overwrite |
| Hand-off | Successor verified first; captured eligible predecessor stopped; failed retirement leaves successor running |
| Observation/detach | Reads do not launch; uncertain runtime is not absence; detach leaves execution and capture intact |
| Delete/completion | Forget sends no signals; completion retains its separate cleanup; mode deletion never merges history |
| UI | Per-task mode retention; passive attach; no late navigation theft; correct empty/status/permission/input/resize behavior |
| CLI/Core parity | Same intent reaches same controller policy; output/flags/errors and indirect Core consumers preserved |

After final integration, the main agent runs `bun run build`, then the repository-prescribed freshness check `find src -name '*.ts' -newer dist/agentic-workspace` (must print nothing). Inspect installed command help before selecting smoke-test commands. Verify the rebuilt binary using disposable isolated fixtures and explicit owned runtime targets; at minimum exercise a non-mutating command and the changed command routing. Source tests do not prove real provider readiness: if credentials/runtime availability prevent provider or two-client acceptance, record exactly which cases remain unverified rather than declaring full runtime acceptance.

Do not run the entire suite merely to compensate for missing ownership-focused tests. Broaden testing only for changed shared helpers, integration failures, or an explicit final acceptance requirement. A verified checkpoint is not a runnable handoff until the main rebuild/freshness checks pass.

## Worker dispatch template

```text
Use @fixer. Implement ticket <ID> only, from integrated base <revision>.
Read: repository AGENTS.md, target architecture, frozen G0 contracts, ticket <ID>.
Allowed writes: <ticket paths>. Other files are read-only; request scope changes.
Dependencies accepted: <IDs and evidence>. No subdelegation or autonomous commits.
Implement the ticket's steps and success criteria. Preserve unrelated work.
Run its exact tests and scoped checks; report failures honestly.
Return: changed paths, concise design result, test commands/counts, blockers,
and any required integrator changes. Do not return whole files or raw logs.
```

The integrator maintains the dependency board and file ownership ledger outside the repository alongside this plan. Dispatch only ready tickets; never ask two workers to “coordinate” edits to the same file informally.
