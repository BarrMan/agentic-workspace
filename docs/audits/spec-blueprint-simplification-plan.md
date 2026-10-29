# SPEC/BLUEPRINT simplification plan

## Purpose and authority

Remove unnecessary mechanisms while aligning implementation with the intentionally simple product and architecture contracts.

SPEC, BLUEPRINT and accepted ADRs own requirements and decisions. Tests and implementation provide evidence, not authority. This plan does not authorize contract changes, data migration/deletion, weaker execution safeguards or compatibility shims.

**Oracle owns the technical recommendations in this document.** The orchestrator may save the document, dispatch its bounded assignments, collect evidence and report results. Technical amendments require Oracle review.

## Current status

- **Navigation remains unchanged and unfixed.**
- Main verified that the scoped diff for all four attempted navigation files is empty.
- Main reports that the only remaining Git status entry is the pre-existing `.opencode/agents/verifier.md` deletion; preserve it.
- The fixer reports **21 baseline lifecycle tests passing**. This is reported source-test evidence, not independent runtime verification or evidence that navigation latency is resolved.
- The rejected patch must not be described as a landed fix.

This bounded audit establishes three architectural mismatches and one repeated-work opportunity. Supporting lanes found no additional verified deviations within their limited scopes.

## Mandatory deletion budget

For each coherent implementation item, including its relevant tests:

```text
added lines / (added lines + deleted lines) ≤ 15%
```

Prefer 10%. These limits require approximately 5.67–9 deleted lines per added line.

Rules:

- Net code removal is required.
- Do not subsidize an item with unrelated deletions.
- Do not remove meaningful regression assertions merely to satisfy the ratio.
- Do not weaken validation, lifecycle admission, liveness checks, cleanup, identity or data-preservation safeguards.
- A proven violation can remain blocked because its safe correction does not fit this budget.
- Budgets below are feasibility assessments, not measured proposed diffs.

---

## W1 — Resolve navigation without another additive fast path

**Classification:** Known user-visible problem; rejected approach with independently reported correctness defects.  
**Priority:** Highest user-facing priority.  
**Implementation status:** Blocked. Oracle rejected the completed isolated candidate because it fails the mandatory deletion budget. Main remains unchanged; no integration or further implementation passes are authorized.

### Contract and evidence

`docs/screens/workspace.md:28–29` requires selection to update highlight, details and preview together while preserving the appropriate viewport.

Running and parked sessions must attach without automatic resume: `docs/screens/workspace.md:20–23` and IF-SI-001 in `docs/specs/session-interaction-and-feedback.md`.

The independent reviewer rejected the attempted patch because:

1. Async completion could overwrite a newer selection.
2. Suppressing all view-state notifications during local writes lost filter updates.
3. A separate fast-path options assembler could restore stale viewport state.
4. Automatic attachment excluded parked sessions.

These findings concern the rejected snapshot. Its temporary line numbers are not references to current source.

Main measured the rejected attempt:

| Scope | Added | Deleted |
|---|---:|---:|
| Production | 125 | 76 |
| Tests | 84 | 5 |
| Total | 209 | 81 |

That is **72.1% additions**, with **128 net added lines**.

### Oracle’s permitted design direction

- Use **one synchronous presentation composition/update path**.
- Async loaders produce loaded inputs; they must not commit task selection.
- When loaded inputs become available, compose against the current selection.
- Reuse loaded corpus, session histories, current monitor observations and retained terminals.
- Do not add a parallel options assembler or a presentation-cache framework.
- Distinguish selection persistence from external filter/data changes; never suppress notifications indiscriminately.
- Switch an already retained terminal immediately. First-time attachment may remain asynchronous, but must never display another task’s terminal.
- Running and parked attachment must both preserve execution and input state.

This direction is not proof that a ≤15% implementation exists.

### Required acceptance checks

Use explicit deferred promises rather than timing thresholds:

- Block persistence and refresh, then select B and C; each published presentation is internally consistent.
- Release older work; C remains selected.
- Deliver an external filter update during local persistence; it is applied.
- Selection refresh preserves the current viewport.
- Empty task/mode selection clears unrelated session and preview fields.
- Running/parked sessions attach only; stopped/unknown sessions never automatically resume.
- A previously unselected known task receives complete details, not merely a fallback description.
- There is only one presentation assembler.

### Budget and owner decision

The independent reviewer could not establish a correct ≤15% fix. **Do not begin another additive attempt.**

The owner must choose one of these outcomes if a proposed deletion-first diff cannot satisfy the limit:

1. Keep the limit and leave this issue explicitly unresolved.
2. Authorize a narrowly bounded exception for this item after Oracle reviews the proposed diff.

Neither the orchestrator nor the fixer may infer an exception.

---

## W2 — Delete parallel SessionStore mutation APIs used only by tests

**Classification:** Proven ownership violation in `remove`; redundant implementation in `mutateMode` and `mutateSession`.  
**Priority:** First independently actionable deletion-first item.

### Contract and evidence

- `docs/adr/0001-model-owned-domain-behavior.md:21–25,48–55`: Task owns relationships; Storage owns persistence; tests use actual owners.
- `docs/blueprints/storage.md:3,123`: Storage does not apply model rules or select sessions.
- `src/storage/session-store.ts:386–485`: `mutateMode` and `mutateSession` duplicate locked reload, mutation, validation, write and release-error handling.
- The production mutation implementation already exists at `:352–384`.
- `SessionStore.remove`, `:537–549`, removes membership and selects a survivor.
- The same rule belongs to `Task.removeSession`, `src/model/task/task.ts:224–229`.
- Production deletion invokes Task: `src/controller/session-application.ts:371–386`.

Scoped call-site searches found consumers of the extra APIs in tests, not production source.

**Consequence:** Tests sustain additional persistence interfaces, lock paths and a second relationship implementation that application workflows do not use.

### Smallest complete correction

Delete `mutateMode`, `mutateSession` and `remove`.

Reuse:

- Existing `mutate` for fixture setup and persistence checks.
- Task/SessionApplication for relationship behavior.

Do not introduce replacement wrappers or aliases. Leave lifecycle admission and session claims intact.

### Affected tests

- `src/storage/session-store.test.ts`
- `src/test/contracts/session-store-mode-contract.test.ts`
- `src/test/contracts/mode-session-reservation-contract.test.ts`
- `src/test/mode-session-dot-projection.test.ts`
- `src/test/opentui-settings-persistence.integration.test.ts`
- `src/test/storage/project-state-root.test.ts`

Preserve concurrency, mode isolation, corrupt-record preservation, survivor selection and committed-write/release-error assertions.

### Acceptance and budget

**Stop criterion:** One persistence mutation implementation and one model-owned relationship implementation remain.

Approximately 110 production lines are deletion candidates. **Budget feasibility is plausible but unproven** until relevant test changes are included. Redundant API-specific tests may be deleted only after their meaningful assertions are covered through retained interfaces.

No persisted-format change or existing marker-file deletion is required.

---

## W3 — Release the task-record lock before provider startup/resume

**Classification:** Proven ADR mismatch.  
**Priority:** High architectural concern; budget approval required if necessary.

### Contract and evidence

- `docs/adr/0001-model-owned-domain-behavior.md:25`: external startup remains outside the store lock; locked model mutations stay short.
- `src/controller/session-application.ts:83–140` awaits session startup inside `withTaskAdmission`.
- Resume does likewise at `:151–195`.
- The helper holds the task-record lock across its entire callback: `:786–797`.
- Delegation reaches Storage through `src/controller/agentic-workspace.ts:900–901` and `src/storage/storage.ts:505–506`.
- Ordinary task mutations use the same lock: `src/controller/task-mutation-service.ts:169,184,213`.
- Entity locking is fail-fast: `src/storage/file-system.ts:543–555`.

**Consequence:** Provider startup duration occupies the task-edit lock and can reject otherwise independent metadata edits. This is a source-level consequence, not a measured latency result.

**Reason for the mechanism:** The helper reloads the task and protects against disappearance/path changes. Preserve that protection at appropriate checkpoints.

### Smallest complete correction

Retain lifecycle task/mode admissions and session claims. Narrow only the task-record lock:

1. Reload, validate and reserve under the required short locked checkpoint.
2. Release the record lock before external start/resume.
3. Reload current data under the required publication checkpoint.
4. Preserve reservation-before-start, incarnation checks, cleanup ordering and uncertain-execution tracking.

Do not create a transaction framework or delete lifecycle exclusion.

### Acceptance and budget

Using the controlled runtime in `session-application.test.ts`:

- Pause startup after durable reservation.
- A harmless metadata edit completes while startup remains suspended.
- Conflicting lifecycle operations remain excluded.
- Publication preserves the intervening edit.
- Repeat for resume.
- Existing failed-start/publication/cleanup tracking tests remain valid.

**Stop criterion:** External start/resume does not execute under the task-record lock, without weaker lifecycle safety.

**Budget:** Likely not independently feasible at ≤15%; safe checkpoint restructuring adds or moves code. Require a compliant proposed diff or explicit owner exception.

---

## W4 — Use the configured root for all workspace persistence

**Classification:** Proven storage-location mismatch.  
**Priority:** Decision and data-policy work before implementation.

### Contract and evidence

- `docs/adr/0002-storage-filesystem-paths-formats.md:23–38`: session and presentation state live beneath the configured workspace root.
- `docs/specs/tasks.md:140–160`: configured task-data location.
- `docs/specs/tasks.md:188–205`: relocation includes the whole workspace-owned folder.
- Task resolution honors the selected location: `src/filesystem/paths/agentic-workspace-directory.ts:199–218`.
- `Storage.sessionStore()` instead passes the project root: `src/storage/storage.ts:104–109`.
- `src/storage/session-store.ts:139–227` independently selects project-local or home-hash storage.
- Arbitrary custom supplied state roots are rejected at `:143–152`.
- `src/storage/view-state-store.ts:129` uses that independent resolver.
- Control records hardcode project-local paths: `src/storage/workspace-control-store.ts:109–112,152–154`.

**Consequence:** Custom task storage is not authoritative for all workspace persistence. This proves split resolution, not the result of an unexecuted relocation test.

**Reason for the mechanism:** Tests protect read-only fallback, environment changes, physical-store deduplication and ambiguity refusal: `src/test/storage/project-state-root.test.ts:283–329`.

### Correction direction

Reuse Storage’s configured root. Do not create a third resolver.

Before changing resolution, obtain explicit handling instructions for:

- Session histories and side files.
- View state.
- Admission and claim files.
- Mode-deletion journals.
- Pending request markers.
- Retained absolute paths.

Preserve ambiguity refusal and active-execution safety. No automatic merging, dual reads or unapproved migration.

### Acceptance and blockers

Cover default/custom/`user:` locations, linked-worktree agreement, unwritable configured locations, conflicting existing stores and approved complete relocation without touching provider-owned data.

Affected owners: Storage, SessionStore, ViewStateStore, workspace control stores and callers supplying `stateRoot`. Complete relocation-caller inspection remains required.

**Stop criterion:** One configured root governs persistence without silently losing protection or data.

**Budget:** Unproven. Do not count ambiguity safeguards as removable until equivalent protection remains.

**Owner decision required:** Existing-data disposition and any relocation authorization. This is not an ordinary cleanup.

---

## W5 — Remove repeated state reads within session inventory

**Classification:** Demonstrated repeated work; simplification opportunity, not a hard timing-contract violation.

### Evidence and correction

`src/controller/session-application.ts:409–421` reads each task state, then calls `readObserved` per session. That method (`:397–406`) calls `requireRecord`, which reads the state again (`:677–686`).

A task with N retained sessions incurs **1 + N state reads**. Consumers include soft-limit enforcement (`:646–650`) and shutdown (`:479–483`), independently of navigation.

Reuse the validated `(modeId, record)` already loaded for inventory. Share observation logic; add no cache. Preserve current runtime evidence and fresh destructive-operation validation.

### Acceptance and budget

Count one state read per task; cover multiple modes, owned/retained observations and membership changes between inventory and subsequent actions.

Affected tests: `session-application.test.ts` and `src/test/agent-sessions.test.ts`; monitor/navigation integration remains separately owned.

**Stop criterion:** Repeated state reads disappear without making inventory authority for resume/stop.

**Budget:** A small helper extraction likely fails the ratio. Defer unless a genuinely deletion-heavy local rewrite satisfies it.

---

## Unresolved candidates

### Persisted metadata

`SessionStore` preserves `worktreePath` and `hasSuccessfulSession` at `session-store.ts:52–58,630–674`. The scoped `hasSuccessfulSession` search found codec/test references, not production behavior.

Complete the `worktreePath` consumer audit and establish recovery purpose. Stripping fields during the next write affects existing data and is not authorized.

### Historical request recovery

`workspace-control-store.ts:148` states that existing request markers have no current production producer. `session-application.ts:433–444` still reads/adopts them.

Resolve recovery obligations before proposing removal. Do not fold it into navigation or silently discard pending requests.

---

## Sequence and approval gates

1. **W1:** Review a new deletion-first proposal; no implementation without demonstrated feasibility or an explicit exception.
2. **W2:** Prepare and independently review the narrowly scoped deletion diff; this is the strongest immediate candidate.
3. **W3:** Resolve budget feasibility/exception while retaining all execution safeguards.
4. **W4:** Obtain existing-data decisions and finish relocation-caller inspection before designing implementation.
5. **W5:** Defer unless its own coherent diff meets the budget.
6. Audit unresolved candidates separately.

W2 does not fix navigation and must not be presented as doing so.

For implemented items, main owns targeted tests, non-writing checks, type checks, build and installed-runtime verification. Oracle reviews technical changes to this plan. Stop any item that would require unauthorized data changes or weaker safety to satisfy the deletion ratio.

## Coverage and evidence limitations

**Direct inspection:** Storage/session persistence, session application coordination, Task/Session ownership, mode-deletion coordination, workspace queries, root resolution and relevant contracts/tests.

**Supporting lanes:**

- **Task/API:** No verified findings in its narrow persistent-task-read/task-detail/completions scope; not full task/CLI coverage.
- **Session/runtime:** No verified deviations in reservation, provider identity, cleanup tracking, admissions, exact resume, liveness or aggregate shutdown. Those mechanisms remain contract-backed. W3 concerns the additional task-record lock surrounding startup, not the legitimacy of lifecycle admissions.

**Gaps:** Complete CLI routing, provider adapters, full relocation implementation, broader cleanup callers, all configuration/presentation codecs, signals and all frontend persistence access.

Oracle made no edits and ran no tests or runtime checks. Cleanup verification and the 21 passing baseline lifecycle tests are attributed to main/fixer reports. The audit provides bounded source evidence, not assurance that uninspected areas conform.
