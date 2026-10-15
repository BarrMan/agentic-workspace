# Session redesign — ownership and abstraction correction

## Objective and authority

Implement the corrected [target design](session-service-redesign.md). This is a correction to in-progress work, not a restart of the entire migration. It supersedes the earlier plan's central behavioral contracts, phase-driven persistence adapter, and associated ticket boundaries. Retain the approved immediate reservation, critical-failure rollback, initial-prompt delivery, and R-A readiness behavior.

Two required outcomes:

1. Task owns membership/order/selection/rollback exactly once; Session owns lifecycle exactly once. Storage does not reinterpret those operations.
2. Use concrete Task, Session, controller, and existing infrastructure implementations. Keep behavioral interfaces at actual variation points such as provider Harness adapters, not as mirrors of single classes.

This plan does not authorize source edits or commits by its existence. When implementation is requested, follow repository instructions and existing commit authorization. No new product decision gate is introduced.

## Source evidence and immediate implications

Inspected source may continue changing in another worktree/session. Before editing, inspect status and relevant diffs, reconcile active workers, and recheck symbols rather than assuming this snapshot is fixed.

- `session-contracts.ts` contains Task and Session interfaces mirrored by `Task implements TaskContract` and `Session implements SessionContract`, plus controller/dependency/factory interfaces. It is a broad contract hub, not just provider adapter contracts.
- `task.ts` currently implements `reserveSession`, `rollbackSession`, `updateSessionRecord`, `selectSession`, `registerSession`, `removeSession`, and `removeMode`.
- `Task.rollbackSession` depends on a private `#reservations` map. Rehydrating a new Task inside a store mutation loses that map: the earlier “hydrate then rollback” pseudocode is insufficient until this is corrected.
- Task hydration currently builds histories from configured mode IDs. Serializing only that projection could discard stored histories for other modes. Correct the durable hydration/serialization path before using it to replace an envelope.
- `session-persistence.ts` independently inserts/selects/removes/restores pointers based on checkpoint phase. It now prepends, but the ownership defect remains. It also merges snapshot records while manually preserving usage fields, which does not establish safe field ownership for every update.
- `session.ts` emits publication checkpoints; both its callback interface and consumers must be adapted, not merely the persistence helper deleted.
- `sessions.ts` still contains `AgentSessionService`. `session-controller.ts` did not exist in the inspected worktree. Do not assume a controller from the previous plan has already landed or invent a second controller alongside another worker's unintegrated implementation.

## Execution order and file ownership

The persistence/model correction is coupled. One coherent integrator owns the mutation path; do not repeat the old split where Task and persistence workers each implement rollback independently.

| Slice | Owner and writes | Dependency |
| --- | --- | --- |
| C0: current-state reconciliation | Integrator; planning/file ledger only | None |
| C1: remove mirrored contracts | One fresh @fixer worker; contract hub, model imports/declarations, exact referencing consumers/tests | C0 |
| C2: model-owned durable mutations | One fresh @fixer worker; Task, Session publication, persistence/store integration, focused tests | C1 integrated |
| C3: application wiring | Integrator or fresh @fixer worker; actual controller/service composition and callers | C2 integrated |
| C4: independent review | Fresh @oracle reviewer; read-only | C3 integrated |

These corrective slices are sequential because their files and contracts overlap. Parallelism resumes for disjoint CLI/UI consumer work only after C3 freezes the implemented seam. A read-only reference inventory can run alongside C1, but no parallel writer may edit the same contracts, models, or test helpers. Use fresh bounded agents and provide only the assigned slice, target design, and relevant file pointers.

## C0 — reconcile actual implementation before dispatch

1. Inspect Git status and targeted diffs. Identify active writers and completed-but-unintegrated controller changes. Do not overwrite or cherry-pick partial work blindly.
2. Enumerate production and test references separately for `session-contracts.ts`, `createSessionPersistence`, `LifecycleCheckpoint`, `SessionPublication`, and Task/Session aliases. Record exact files in the worker ledger; use references, not a broad repository dump.
3. Record the active composition as fact, not assumption: `Core.sessions` is a lazy singleton returning `AgentSessionService` (`src/core/agentic-workspace.ts:144`), and `WorkspaceStateService` constructs its own `AgentSessionService` unless one is pinned (`workspace-state.ts:13-20`). Neither `src/agent-workspace/session-controller.ts` nor `src/core/session-application.ts` exists. The composition owner is `src/core/session-application.ts`: one new module owning the vertical slice, and what `Core.sessions` repoints to. Do not create a second service or controller beside it. Retain the old service only as a temporary, explicitly scheduled compatibility route.
4. Record targeted test/typecheck baseline. Verify Bun version and enabled automations according to repository instructions. Do not reuse historical pass counts or “15 pre-existing errors” without checking the current base.

Success: no overlapping writer, actual caller inventory, single composition owner, baseline evidence. No source design is accepted merely because an old contract compiles.

### C0 binding evidence (required before any worker edits)

This table is the executable ownership contract that earlier revisions lacked; do not substitute another interface package for it. Ownership, lock, and incarnation columns below are binding now. Confirm the field column against the frozen contract as you implement, but a worker must not change an owner or a lock without returning here first.

| Operation | Owner | Concrete dependency | Locks held | Model call | Fields changed | Expected incarnation |
| --- | --- | --- | --- | --- | --- | --- |
| Reserve creation | Task | `SessionStore.mutate` (`session-store.ts:430`) | state lock | `Task.reserveSession(modeId)` (`task.ts:65-78`) | `modes[mode].sessions` prepend + selection; flat mirror kept consistent | absent |
| Publish reservation | Controller | `SessionStore.mutate` | state lock | `Task.updateSessionRecord(modeId, record)` (`task.ts:110`) | the provisional record's `starting` fields; both projections consistent | present (`id`+`taskId`+`createdAt`) |
| Start execution | Controller → Session | Harness / SessionRuntime, outside the lock | none | `Session.start(operation)` | none — no store write | present |
| Activate readiness | Controller | `SessionStore.mutate` | state lock | `Session.activate(publication)` then `Task.updateSessionRecord` | status `running`, native identity fields, `ownerPid` | present |
| Stop (explicit) | Task | `SessionStopPort`, then `SessionStore.mutate` for the record application only | task admission + a session claim (`sessions.ts:1858-1869`); store lock in phase 2 only | phase 1: `execution.stop()` outside the store lock (`session.ts:57-68`); phase 2: `Task.updateSessionRecord` + survivor selection inside `SessionStore.mutate` | status `stopped`, `endedAt` set, `ownerPid` cleared, selection moved | present |
| Park | Controller | `SessionStore.mutate` | state lock | `Session.park(publication)` | status `parked` | present |
| Finish (terminal) | Controller | `SessionStore.mutate` | state lock | `Session.finish(publication, error?)` | status `stopped`/`failed`; `error`/`endedAt` as applicable | present |
| Rollback creation | Task | `SessionStore.mutate` | state lock | `Task.rollbackSession(creation)` (`task.ts:81-91`) | removes the provisional record; restores the previous pointer only while still selected | present — exactly one provisional, its incarnation validated before removal; absent only afterwards |
| Hand-off successor | Controller | `SessionStore.mutate` | state lock | successor insert, then predecessor retirement | `modes[mode].sessions`; selection | present for the predecessor |
| Usage touch | SessionStore-persistence | `SessionStore.mutate` | state lock | none — usage only | `useCount`, `lastUsedAt` | n/a |

Locks are layered, not per-row: the outer operation holds task admission — plus the session claim where a row names one — for the whole sequence, and the Locks-held column names only the layer that row adds. Each `SessionStore.mutate` takes and releases the store's state lock only around the durable record application, never across execution work (§C2's rule that execution calls stay outside it). The Expected-incarnation column is the record's incarnation at the publication precondition, never its postcondition, and the safe-call boundary while holding task admission is the list above.

Evidence already established — verify, do not re-derive:

- **Store mutation.** `SessionStore.mutate<T>(taskId, fn)` (`session-store.ts:430`) takes the exclusive state lock (`:438`), validates (`:452`), then writes (`:453`). A **release failure after a successful write is currently swallowed**: `return result` (`:456`) leaves the `try` before the `releaseError` throw (`:466`) can run. Fix and test this before any post-write publication depends on it.
- **Flat/nested projection.** `projectBuildCompatibility` (`:958`) makes flat `state.sessions` win over nested `modes.build`, and **drops the active pointer** when flat `activeSessionId` is not a string (`:965`). Replacing `state.modes` alone can be overwritten by stale flat state; every mutation must leave both projections consistent.
- **Unknown fields.** `isSession` (`:314`) hard-rejects any key outside `SESSION_KEYS` (`:292`, 19 keys). "Preserve unknown fields" can only mean fields this schema already supports.
- **Task admission.** `withTaskSessionAdmission` (`sessions.ts:340`) holds a non-reentrant per-task file lock (`retries: 0`). Do not call `start`, `stop`, `ask`, `delete`, `purge`, `reset`, `liveSession`, `prepare*`, `adoptPendingSession`, `finalizeHandoff`, `activateNativeSession`, `finishNativeSession`, `parkNativeSession`, or `reconcileTaskSessions` from inside it. Established safe inside it: `rollbackHandoff` (`:1777`), `forgetTaskSessions` (`:735`), `publishNativeIdentity` (`:409`), `stopAllTaskSessions` (`:1875`), `output`, `sendKey`, `attach`, `touchUsage`, `list*`, `deleteMode`, and the privates `finalizeHandoffLocked` (`:1806`), `failReservation` (`:1739`), `stopClaimedSession` (`:1830`).
- **Mechanics that must move, not be duplicated.** `withTaskSessionAdmission` (`:340`), `withLifecycleAdmission` (`:1609`), `withVerifiedNativeOrigin` (`:1470`), `tagNativeSessionPane` (`:474`), `clearNativeSessionPaneTag` (`:538`), `reconcileDeferredIdentity` (`:468`), `ownedLaunchPaneState` (`:456`), the membership/incarnation guards (`:510,527,533`), `failReservation` (`:1739`), `settleDispatchedLaunchFailure` (`:1382`), `failBeforeDispatch` (`:1420`). Moving them is I2 work; a worker may not infer permission from C3.

### Retained as-is (this correction does not reopen these)

- Selected-mode persistence: `selectedModeByTask` serialization and its existing reload behavior stay exactly as implemented.
- Mode deletion refuses while any task still holds sessions in that mode, including the recovery path (`mode-lifecycle.ts:155-158,185-196`). Keep that precondition; do not reduce it to a bare history removal.
- `sessions.ts` stays runnable and otherwise unchanged, with exactly one authorized exception: C3 may **move** — never duplicate — the specific private mechanics its vertical slice depends on out of `AgentSessionService`: the task-admission wrapper (`withTaskSessionAdmission`, `sessions.ts:340`), the origin/provenance verification (`withVerifiedNativeOrigin`, `:1470`), and the stop-survivor selection (`stopClaimedSession`, `:1830`). Extract-by-move, keep every existing caller working, and land the extraction in its own step *before* the slice depends on it. Nothing else in `sessions.ts` changes; I2 retires the remainder. Without this, C3 cannot satisfy §C3 at all.

## C1 — concrete classes and locally owned types

### Changes

1. Remove Task and Session behavioral interfaces and their `implements` aliases. Replace consumer imports with concrete class imports (`import type` where only typing is needed).
2. Remove mirror interfaces for the single application controller and its constructor. Use the implementation directly. Do not replace the mirrors with structural type aliases, `Pick` lists, or another contract file.
3. Inventory `SessionTaskRepository`, `SessionAdmission`, `SessionConfiguration`, `SessionTaskPaths`, `SessionControllerStore`, `SessionFiles`, request/mode-storage contracts, and similar dependency interfaces. For each, list actual alternative production implementations. Where there is only an existing implementation, inject/use it directly or call the existing function. Do not require a wrapper solely to satisfy an interface invented for tests.
4. Keep Harness's real provider contract. Inspect RunningExecution's implementations: keep a behavioral interface only if actual interchangeable executions require it; otherwise use the concrete execution implementation. Do not force multiple provider implementations into one class simply to reduce interface count.
5. Move launch data/provider events to their owning module; Task hydration and creation identity near Task; Session-specific event/operation data near Session. Reuse existing persisted record types. Preserve useful data shapes without a cosmetic interface-to-type mass rewrite.
6. Replace one-method factory interfaces with a local function dependency when that is all the behavior needed. Do not put mutable operation authority in a retained factory.
7. Reduce or delete `session-contracts.ts` once callers are moved. A residual file must contain genuinely shared data/provider contracts only, not a renamed model/controller hierarchy. Remove speculative unused types and duplicated error contracts.

### Validation and success

- Run `bun test src/agent-workspace/task.test.ts --timeout=10000`, `bun test src/agent-workspace/session.test.ts --timeout=10000`, and `bun test src/agent-workspace/session-contracts.test.ts --timeout=10000` while the last file exists. Move substantive tests to their owner when removing it; do not preserve tests that only check a retired declaration shape.
- Run changed Harness tests and `bun run check:types`; run scoped Biome and diff checks.
- No Task/Session/controller behavioral mirror remains in production or test scaffolding. Tests exercise real models and replace genuinely external/provider behavior. No new import cycle or unchecked cast is introduced to bypass concrete types.

## C2 — one model implementation per durable rule

### Task behavior and hydration

1. Keep synchronous domain operations for reservation, registration, selection, removal, and rollback. The public creation intent may compose these with asynchronous startup, but no provider work occurs inside a short store mutation.

   **One exact creation sequence governs, with no variant:**

   1. `Task.reserveSession(modeId)` inserts the provisional record and selects it, synchronously inside the store mutation.
   2. The controller persists that reservation against expected membership `absent`.
   3. Execution starts outside the lock. Membership is Task-owned, so `Session.start()` does **not** emit a membership reservation — the controller publishes the reservation it captured from step 1. Remove the duplicate absent-membership emission from `Session.start()` rather than instructing callers to ignore it.
   4. Readiness resolves, or on critical failure the controller stops execution first, then rolls back with the captured creation identity.

   Add one integration test through the real Task, Session, and store asserting exactly one reservation is published.
2. Capture creation identity and previous selection before startup can fail. Make that data sufficient for a freshly hydrated Task to perform rollback after the controller verifies the current durable incarnation. Remove the requirement that a previous Task instance's private `#reservations` map exists. Preserve exact replacement protection; do not reduce identity to UUID alone.

   **Identity evidence must be named, not merely required.** `SessionCreationIdentity` (`session-contracts.ts:32`) carries `taskId`, `modeId`, `provisionalSessionId`, `previousActiveSessionId` — it lacks the `createdAt` that `Task.sameIncarnation` (`task.ts:165`) compares, so a rehydrated rollback cannot currently prove incarnation. Add the missing creation field. For later execution publication the provenance evidence is the per-launch `executionId` minted in `harness.ts`, not the session id. Test same-id replacement and a delayed event from a previous resume incarnation.

   **Where the current execution incarnation actually lives.** The launch token is in-process only: `executionId` is minted per launch/resume (`harness.ts:90`), neither the checkpoint origin nor membership carries a token (`session-contracts.ts:41-46`), and session validation admits none (`session-store.ts:292-316`) — so publication cannot compare it against durable state. The binding is therefore: the owning process holds the current `executionId` in memory and rejects any publication whose token is not the current one, and cross-process authority is the already-schema-supported durable `ownerPid` on the record. Do NOT add `executionId` to the persisted record; that would be a schema change this plan does not authorize.
3. A newly reserved Session is created once. Reapplying its durable relationship must not call the factory again, allocate a second ID, or start another execution. Choose one actual synchronous model method for this insertion and reuse it rather than duplicating array/pointer mutations.
4. Durable hydration must retain all existing histories, current active pointers, and every field the schema supports that this operation does not touch (`SESSION_KEYS`, `session-store.ts:292`). Visibility in the current mode catalog must not silently delete persisted history. Keep UI projection distinct from serialization completeness. Read "unknown fields" in this sense only: `isSession` (`:314`) hard-rejects keys outside the schema, so literal unknown-field preservation would require a schema and validation change this plan does not authorize.
5. `Task.serialize()` currently returns task metadata, not session state. Add/use a narrowly named session-state serialization operation or serialize the model's owned mode histories explicitly at composition. Do not pretend saving task Markdown saves the session envelope.
6. Lifecycle record application must preserve unrelated current fields. Define the actual lifecycle fields changed by each Session operation, including explicit deletion of `error`/`endedAt` where appropriate. Avoid stale full-record replacement and growing exception lists for usage fields. Keep this local to Session state/application; do not invent a generic patch engine. Explicit clearing must apply to resume's `identity`/`ready` publications too, not only to `update`: `createSessionPersistence` spreads a snapshot over the current record, so a property the model deleted currently retains its old durable value (`session.ts:45-54`, `session-persistence.ts:88-100`).

7. Task owns the survivor rule for an explicit stop: select another surviving record, retaining the stopped record only when no other exists (`stopClaimedSession`, `sessions.ts:1830-1850`). The controller must not implement that selection.

8. `Task.activeSession` returns the durable `AgentSession` record (`task.ts:48-50`) and that projection is intentional: it is the Task-owned durable view, not the live object. Execution, subscriptions, and publication belong to `Session` (`session.ts:15-19,32-33,118-121`), which is resolved by session identity, while records are cloned on insert and update (`task.ts:75,111`). A publication therefore updates the durable projection without reaching into the object that owns the execution, and must not overwrite a newer UI selection. Add one reload/publication test covering that relationship.

9. Keep the mode-deletion precondition inside the model path. `Task.removeMode` currently deletes history unconditionally (`task.ts:138-141`), while the refusal lives only in the legacy orchestration (`mode-lifecycle.ts:155-158,188-196`). Make the model operation itself refuse while the mode still holds sessions, and add a rejection test that calls that model operation directly — retaining the old orchestration check does not prove the new owner enforces it.

### Controller-owned durable mutation sequence

Use the existing `SessionStore.mutate` machinery. Check its real signature before editing; returned-value pseudocode is not an implementation requirement.

1. Under existing task admission/session coordination, capture intended operation identity and current configuration.
2. In a short store mutation, reload authoritative state, verify the operation's expected membership/incarnation, hydrate the concrete model, invoke the synchronous Task/Session-owned state behavior, and serialize the resulting state back through the store's existing validation/atomic write.
3. Start/resume/stop external execution outside the store lock. An awaited controller-composed callback can publish state at required points, but the store never interprets a lifecycle phase to choose a domain mutation.
4. For later publication, reload again and apply only the intended model change. Validate provenance while holding the state lock. Do not replace the current envelope from a pre-launch Task object or restore a selection from an obsolete snapshot.
5. On a critical creation failure, stop/release execution first. Then reload, invoke Task rollback with captured identity, persist, and report the original error. Preserve any newer active selection. If stop or persistence fails, retain recovery evidence and report secondary failures.
6. Update the frontend model from committed state without replacing a later local selection. A failed final publication must not leave the UI claiming committed success.

### Delete the duplicate persistence model

- Remove insertion, selection, rollback, and lifecycle interpretation from `createSessionPersistence`.
- Remove the factory/file if the existing store and controller composition cover the remaining work. Do not replace it with `SessionPersistence` having the same switch over phases.
- Delete the rollback publication command and associated duplicate behavior contracts. Useful lifecycle snapshot/event data can remain, but no storage consumer decides what domain action a phase means.
- Keep storage integrity validation, path checks, atomic writes, membership/provenance checks, and required compatibility serialization. Mechanical legacy mirror maintenance belongs to serialization, not another selection policy.
- Avoid introducing a generic repository transaction interface, unit-of-work abstraction, event bus, or change tracker. One existing mutation callback is enough unless a concrete source constraint proves otherwise.
- Fix the store's post-write release path (`session-store.ts:453-468`): a successful write must not swallow an unlock/release failure. Distinguish a committed-write failure from a no-write failure, and test both.

### Required tests

Adapt `task.test.ts`, `session.test.ts`, `session-persistence.test.ts`, `session-store.test.ts`, and `session-store-mode-contract.test.ts` to the new owners. Move behavioral persistence tests to actual controller/store integration tests before deleting the helper; do not keep a fake adapter just for them.

Prove:

1. Reservation prepends exactly once and selects the same session in memory and after reload.
2. A freshly hydrated Task can roll back an authorized creation; a replaced incarnation rejects.
3. Rollback restores the previous pointer only while the failed creation is selected; a newer selection survives. A missing previous session leaves a valid surviving pointer.
4. Unrelated modes, histories absent from the current catalog, usage counters, and selection updates survive publication.
5. Lifecycle updates clear obsolete fields intentionally without overwriting unrelated current data.
6. Startup does not occur before durable reservation; no provider call occurs while a store mutation is active.
7. Final-write failure attempts full rollback; failed execution cleanup retains tracking; rollback-write failure retains recovery evidence and reports both errors.
8. An explicit stop selects the surviving active record by Task's rule: another survivor when one exists, the stopped record otherwise; also cover a single record and stopping a non-active record.
9. Resume clears durable `error`/`endedAt`, asserted from reloaded state rather than the in-memory record.
10. A flush that published no change and a flush whose write committed but whose release failed are distinguished and reported differently.

Success includes source inspection: there is only one implementation of each insertion/selection/rollback rule, in Task. Passing equivalent tests against two implementations is not acceptance.

## C3 — integrate actual application callers

1. Wire C2's flow into the actual shared application controller identified by C0. If it has not been built, implement the smallest vertical new/resume/stop/rollback path there before converting every caller. Do not create both a new service and a new controller that own the same policy.
2. Remove old checkpoint adapter construction and imports in all inventoried consumers. Remove Session publication methods that exist solely to encode Task relationship changes; activation of a mode's active pointer belongs to Task, not Session.
3. Keep Session's start/resume/stop behavior concrete; Harness errors bubble, with catches only for needed cleanup. Controller handles command failure, persistence, locks, and rollback coordination.
4. Preserve exact resume, current configuration, R-A readiness, one initial prompt, successor-first hand-off, separate predecessor-retirement failure, stopped-only ask, forget-only deletion, and capture/provenance semantics.
5. Scope: C3 converts the callers the vertical slice needs, plus the ones that construct the old checkpoint adapter. Full CLI/TUI/Core/MCP convergence beyond that is reissued after C4, per the final section — do not read this item as requiring every consumer in this pass. Use the earlier migration inventory as reference, not its superseded dependency interfaces.
6. Remove transitional wrappers after their last consumer moves. Correct SPEC source pointers and approved rollback behavior when the implementation changes those claims. Correction happens in the same change that alters the behavior, not deferred to a later ticket.
7. Acceptance boundary: C4 approves the corrected vertical slice — new, resume, stop, and rollback through the real application path with model-owned mutations — not the finished CLI/UI/Core migration. Unfinished CLI/UI/Core tickets are reissued afterwards, per the final section.

Validate the affected controller/service tests, at minimum `src/agent-workspace/shared-runtime-service.test.ts`, `src/agent-workspace/mode-session-reservation-contract.test.ts`, `src/agent-workspace/failed-mode-handoff-contract.test.ts`, and `src/test/agent-sessions.test.ts`. Add `src/test/agent-workspace-cli.test.ts` and `src/test/opentui-workspace-controller.test.ts` when their wiring changes. Run each with `bun test <file> --timeout=10000`; run any new controller integration file as well.

Success: the production call path uses model-owned mutations. A controller cannot pass tests by leaving the corrected models unused behind the old service. No foreign runtime is signalled, and no stale callback resurrects a deleted association.

## C4 — independent ownership review and handoff

A fresh @oracle reviewer traces reservation, successful publication, rollback, activation, stop, and external observation from entry point through model to durable write. Read-only findings must identify exact source symbols and the duplicated rule or unjustified interface. Do not judge by line count or interface-keyword count.

Acceptance checklist:

- Concrete Task/Session/controller types are used directly; no method-list mirrors or speculative dependency graph.
- Harness and any retained execution interface have named real alternative implementations.
- Task owns membership/order/selection/rollback once; Session owns individual lifecycle once.
- Storage never switches on a domain phase to insert/remove/select/restore.
- Fresh-state publication preserves concurrent and unknown data, with provenance checks under lock.
- Rehydrated rollback works without a private map surviving from an earlier object.
- New/resume/rollback behavior remains as approved; no product decision is reopened.
- No obsolete persistence adapter or unreachable transitional path remains.
- A stale event from a previous resume incarnation cannot mutate the current record, and a concurrent deletion cannot be revived by a relayed publication.
- A successful write whose release fails is reported to the caller, and no mutation leaves the flat and nested projections disagreeing.
- Readiness correlation must be established deterministically, not only live. `HARNESS_READINESS_MATRIX` (`session-contracts.ts:671-717`) claims a specific receipt per provider, but `Harness.start()` resumes on any nonempty activity-status receipt (`harness.ts:123-124`), which does not establish that correlation. Add a production-adapter test per provider proving the matrix's claimed signal is the one actually awaited, and keep live-provider acceptance as a separate, still-unverified gate.

Run scoped Biome checks and `git diff --check -- <explicit-files>` after each slice. Integrator runs `bun run check:types` on the assembled result and compares against the captured baseline. Run only affected suites, in isolated Bun processes or Bun's supported parallel runner; don't paper over failures with changed assertions.

Before runnable handoff, the main agent runs `bun run build` and the repository-prescribed source freshness check. Use disposable owned fixtures for any installed-CLI validation and distinguish source/fake evidence from actual provider acceptance. Documentation-only changes do not require a build; implementing this correction does.

## Resume the remaining migration

After C4 passes, reissue unfinished CLI/UI/Core tickets from the earlier plan with concrete class imports and the implemented model-owned mutation seam. Preserve disjoint file ownership. Do not restart completed features just to match proposed filenames, and do not dispatch a separate persistence worker to reconstruct domain rules again.

Worker handoff: exact allowed paths, integrated base revision, this ticket, current target design, relevant tests, and expected result. Return changed paths, validation evidence, and blockers only. Commits require the user's actual authorization; this document grants none.
