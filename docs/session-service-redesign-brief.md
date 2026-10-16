---
consolidation:
  total: 84
  counts:
    exists: 31
    discard: 49
    integrate: 0
    unconfirmed: 4
  percentages:
    exists: 36.90%
    discard: 58.33%
    integrate: 0.00%
    unconfirmed: 4.76%
---
# Session service (`sessions.ts`) — owner proposal vs. oracle review

**Purpose.** This is a planning brief. It records, verbatim, the *owner's* proposed
simplification of `src/agent-workspace/sessions.ts` and the *oracle's* review of each
proposal item, with the oracle's reasons for rejecting or amending them. It exists so a
**new oracle agent can plan the architecture** from the real debate rather than re-deriving it. <!-- consolidation: discard; ref: docs/adr/0001-model-owned-domain-behavior.md#context; reason: Historical planning purpose is superseded by accepted model ownership. -->

**How to use this.** Part A is the owner's intent (the design they want). Part B is the
counter-argument that was actually made, with anchors. Part D is what was *already
implemented* after this review (a prior oracle's staged plan), so planning starts from the
present state, not the original. Part E is the open architectural surface that remains. <!-- consolidation: discard; ref: none; reason: Historical reading guide and current-state claim. -->

---

## Context

- File: `src/agent-workspace/sessions.ts`, the central agent-session service
  (`AgentSessionService`). At the time of this review it was **2,308 lines**; after the
  implemented stages it is **2,191 lines** (it began the session at 2,368). <!-- consolidation: discard; ref: none; reason: Dated line-count inventory. -->
- The owner considers the file enormously bloated and wants aggressive, `ponytail`-style
  simplification: less code, simpler logic, **remove guards for states that can never occur**,
  and no clever inner-function machinery. <!-- consolidation: discard; ref: none; reason: Historical simplification request is design input rather than authorization to remove safety checks. -->
- `docs/SPEC.md` is the authoritative behaviour contract (sections 7–9 cover modes,
  selection/lifecycle, deletion). It takes precedence over older plans. In particular it
  forbids silently replacing a failed exact resume with a fresh conversation. <!-- consolidation: exists; ref: docs/SPEC.md#authority; reason: Approved product contract takes precedence. --> <!-- consolidation: exists; ref: docs/specs/sessions.md#stopping-and-exact-resume; reason: Exact resume cannot silently become a new conversation. -->
- **Anchor caveat:** all `file:line` references in this brief are **as-reviewed** (pre-refactor,
  2,308-line file). Re-locate by symbol — the recent stages shifted lines. <!-- consolidation: discard; ref: none; reason: Historical source-anchor caveat remains navigation guidance. -->

---

## Part A — The owner's proposal (verbatim)

### A0. Overarching goal

> "2.3k lines of code is enormous. Let's ... try and simplify this file as much as possible -
> reduce code, simplify it, remove edge cases guards that will never exist." <!-- consolidation: discard; ref: none; reason: Original request is historical design input with safety constraints resolved separately. -->

### A1. Combine the two cleanup loops

```ts
for (const { session } of entries) {
    if (session.status === AGENT_SESSION_STATUS.STOPPED || session.status === AGENT_SESSION_STATUS.FAILED) continue;
    if (!session.nativeWorkspace) continue;
    const runtime = await this.process.nativeRuntimeClassification(session);
    if (runtime.status === "uncertain")
        throw new Error(`Cannot safely inspect native session ${session.id}: ${runtime.reason}`);
}
for (const { session } of entries) {
    if (session.status === AGENT_SESSION_STATUS.STOPPED || session.status === AGENT_SESSION_STATUS.FAILED) continue;
    await this.stopClaimedSession(taskId, session, session.nativeWorkspace);
}
```

<!-- consolidation: exists; ref: docs/BLUEPRINT.md#creation-settlement-and-cleanup-ordering; reason: Two-loop example illustrates all-target preflight before effects. -->
> "does that look like good code?" <!-- consolidation: discard; ref: docs/BLUEPRINT.md#creation-settlement-and-cleanup-ordering; reason: Historical merge-loops question is resolved by mandatory preflight-before-effects. -->

### A2. The inline `identity` function

```ts
const identity = ({ session, modeId }: (typeof entries)[number]) =>
    JSON.stringify([
        modeId,
        session.taskId,
        session.id,
        session.createdAt,
        session.status,
        session.nativeWorkspace,
        session.nativeProvider,
        session.tmuxName,
        session.nativeSessionId,
        session.ownerPid,
    ]);
```

<!-- consolidation: discard; ref: none; reason: Fingerprint code is historical implementation evidence not a mandated helper or schema. -->
> "wtf is this? what identity? What is it used for? Why is this an inner function inside of a
> function? is this a session? so this is a session.getId() basically?" <!-- consolidation: discard; ref: docs/BLUEPRINT.md#architectural-invariants; reason: Historical identity question is resolved by membership incarnation and execution provenance requirements. -->

### A3. `assertSameSessionMembership`

```ts
this.assertSameSessionMembership(current, expected);
```

<!-- consolidation: exists; ref: docs/BLUEPRINT.md#mutation-and-concurrency-boundary; reason: Assertion example illustrates required membership revalidation. -->
> "what is this for? It's for protecting against what exactly? The expected session is not the
> current session anymore? **Use locks / mutex for this if needed and not this.** if you really
> cared about protecting it so much, then what happens if current changes right after you
> assert? do better!" <!-- consolidation: discard; ref: docs/BLUEPRINT.md#mutation-and-concurrency-boundary; reason: Replacing provenance validation with locks alone is rejected by current boundary. -->

### A4. `launchReserved` and the proposed target shape

Owner's critique:

> "in launchReserved function - you first prepareSessionLaunch, then for some reason hide the
> fact that you're using the agent adapter to create the session and while doing all of that
> you're checking agentFor, but then after each time, you check agentFor, and error when it
> does not exist. **Why check every freaking time? check it once.**" <!-- consolidation: discard; ref: none; reason: Historical adapter-lookup critique is a local implementation optimization. -->

Owner's proposed target shape:

```ts
// caller
task.newSession(mode)

// task.ts
class Task {
func newSession(mode) {
lock(() => {
session = await Session().create(task.harness)
session_instance
this.modes[mode].sessions.prepend(session)
})
}
}

// sessions.ts
class Session {
static func Create(harness) {
harnessSession = await harness.new()

return harnessSession
}
}
```

---

<!-- consolidation: exists; ref: docs/architecture/task.md#session-relationship-operations; reason: Sketch caller task.newSession intent is retained. -->
<!-- consolidation: discard; ref: docs/BLUEPRINT.md#new-session; reason: Sketch Task lock around asynchronous startup and post-start insertion is superseded by synchronous reservation then external startup. -->
<!-- consolidation: exists; ref: docs/architecture/session-harness.md#session-operations; reason: Sketch Session creation delegates provider execution to Harness. -->
## Part B — The oracle's review, item by item

**Headline recommendation:** *"Simplify the duplicated workflows, not the safety boundaries.
The largest win is replacing three reservation paths and two launch bodies with one of each.
Do not replace the service with `Task.newSession()` / `Session.create()` classes: that moves
orchestration around without removing its responsibilities."* <!-- consolidation: exists; ref: docs/adr/0001-model-owned-domain-behavior.md#context; reason: Moving orchestration without meaningful ownership is insufficient. --> <!-- consolidation: discard; ref: none; reason: Three reservation and two launch path consolidation is historical implementation sequencing. --> <!-- consolidation: discard; ref: docs/adr/0001-model-owned-domain-behavior.md#alternatives-considered; reason: Rejection of Task and Session classes was superseded by accepted concrete model ownership. -->

### B1. HINT 1 — merge the two cleanup loops → **REJECTED**

Anchor: `sessions.ts:1915–1990`, especially `1969–1979`.

> "These are intentionally separate phases: (1) verify **every** native target before stopping
> anything; (2) perform the stops. Combining them would stop session A before discovering that
> session B has uncertain/foreign ownership. Existing tests explicitly protect against this." <!-- consolidation: exists; ref: docs/specs/sessions.md#native-cleanup-preflight; reason: Every relevant native target is validated before any stop. --> <!-- consolidation: discard; ref: none; reason: Historical test-presence claim is evidence only. -->

**Minimal remedy:** compute the non-terminal targets once, then retain two straightforward
loops. Preserve claims, batch revalidation, and release-error handling. <!-- consolidation: discard; ref: none; reason: Computing targets once and exact loop shape are implementation recommendations. --> <!-- consolidation: exists; ref: docs/BLUEPRINT.md#mutation-and-concurrency-boundary; reason: Claims revalidation and release-failure distinctions remain required. -->

> "This is preflight-before-effects, **not** an atomic transaction: a later kill can still fail
> after earlier kills succeeded." <!-- consolidation: exists; ref: docs/specs/sessions.md#native-cleanup-preflight; reason: Preflight is not transactional rollback. -->

### B2. HINT 2 — `identity()` is just `session.getId()` → **RENAMED, NOT DELETED**

Anchor: `sessions.ts:1920–1958`.

> "It is a **cleanup snapshot fingerprint**, comparing the history before and after acquiring
> all claims. It includes mode, status and owner because an unchanged UUID does not imply
> unchanged shutdown eligibility. An inner function is not intrinsically wrong, but this
> implementation obscures its purpose and duplicates the expensive 'flatten sessions,
> rediscover their mode, sort' construction." <!-- consolidation: exists; ref: docs/BLUEPRINT.md#architectural-invariants; reason: Unchanged UUID does not establish current shutdown authority. --> <!-- consolidation: discard; ref: none; reason: Historical helper placement and repeated-flattening critique is implementation evidence. -->

**Minimal remedy:**
- Flatten `Object.entries(state.modes)` directly into mode/session entries. <!-- consolidation: discard; ref: none; reason: Historical local refactoring recommendation. -->
- Use one plainly named, **module-level** cleanup-snapshot helper for both reads. <!-- consolidation: discard; ref: none; reason: Private helper placement is not a required architecture seam. -->
- **Retain the relevant-field comparison**; do not replace it with UUID equality or
  whole-record JSON equality (e.g. usage timestamps must not invalidate cleanup). <!-- consolidation: exists; ref: docs/BLUEPRINT.md#mutation-and-concurrency-boundary; reason: Validate relevant incarnation and provenance while preserving unrelated usage updates. -->
- The validated store guarantees unique session IDs across modes, so there is no need to
  rediscover the owning mode for every flattened session. <!-- consolidation: discard; ref: none; reason: Historical validator evidence and lookup optimization. -->

### B3. HINT 3 — replace the assert with a lock/mutex → **NEITHER DELETE NOR LOCK**

Anchors: `sessions.ts:506–532`; `session-store.ts:415–515, 523–543`.

Real locks already exist:

| Boundary | Protection |
|---|---|
| Task admission, `sessions.ts:342–359` | Cross-process task-file lock; same-task lifecycle ops contend here <!-- consolidation: discard; ref: none; reason: Historical source lock inventory is not a frozen implementation mandate. --> |
| Session claim, `session-store.ts:524` | Cross-process exclusion for operations on one conversation <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#durability-checkpoint-collaboration; reason: Operation admission and session coordination remain required. --> |
| Store mutation | Locked reload → callback → validation → atomic write <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#storage-and-configuration-interfaces; reason: SessionStore.mutate has this exact durable boundary. --> |
| Mode lifecycle gate | In-process serialization only; **not** a universal cross-process mutex <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#mutation-and-concurrency-boundary; reason: Historical gate scope must be verified before relying on it for cross-process safety. --> |

> "Concurrency still exists: multiple CLI/TUI processes, delayed host callbacks, store-only
> updates such as usage tracking, running-limit operations targeting other tasks, and
> provider-written receipts/tmux changes." <!-- consolidation: exists; ref: docs/BLUEPRINT.md#mutation-and-concurrency-boundary; reason: Fresh-state publication and execution provenance address concurrent writers and stale callbacks. -->

> "The assert inside `mutateSession()` is useful: comparison and durable publication happen
> under the same state lock. It prevents stale work from updating a removed/replaced record. A
> callback can also already be stale *before* acquiring its lock; locking alone does not
> establish its provenance. Outside a mutation, the assert is only a revalidation checkpoint —
> not protection against every future change." <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#durability-checkpoint-collaboration; reason: Membership and execution origin are checked at each locked publication rather than assumed from lock acquisition. -->

> "Runtime ownership checks remain necessary because tmux and providers do not participate in
> the JSON lock." <!-- consolidation: exists; ref: docs/BLUEPRINT.md#shared-operation-protocol; reason: Execution effects require validated runtime ownership independently of storage coordination. -->

**Minimal remedy:** retain commit-time membership checks and exact pane/resource provenance;
remove redundant reads only where the existing lock and intervening writers have been
accounted for. **Do not add another mutex, and do not hold the state-file lock across launch or
terminal operations.** <!-- consolidation: exists; ref: docs/BLUEPRINT.md#mutation-and-concurrency-boundary; reason: Provenance validation and short non-nested state locks are explicit. --> <!-- consolidation: discard; ref: none; reason: Removing particular redundant reads requires local source proof rather than a new core method. -->

Additional point:

> "`assertSameSessionMembership()` does **not** identify a launch generation by itself: resuming
> the same record preserves its UUID and creation time. Pane ID/resource provenance supplies
> that distinction." <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#durability-checkpoint-collaboration; reason: Record incarnation and per-launch execution identity protect different boundaries. -->

### B4. HINT 4 — resolve the adapter once / class split → **SUBSTANCE ADOPTED, SHAPE REJECTED**

Anchors: `sessions.ts:579–645, 1223–1378, 1764–1867`; `session-launch.ts:99–136, 151–233`.

Call chain:

> "`prepareSessionLaunch` → `preflightAgentLaunch` → `prepareAgentLaunchResources` →
> **`agent.prepare()`**. `PreflightedAgentLaunch` already carries a required `agent`. Repeating
> `agentFor()` after successful preflight is unnecessary. Resolve the effective OpenCode
> version/preset and adapter at the launch boundary, then carry that adapter through
> preparation, publication and reconciliation." <!-- consolidation: discard; ref: none; reason: Historical call-chain evidence and repeated adapter lookup optimization. -->

Rejection of the class shape:

> "However, the proposed `harness.new()` model is too small: <!-- consolidation: discard; ref: docs/architecture/session-harness.md#harness-construction-and-promises; reason: Accepted Harness boundary includes deferred identity and readiness. -->
> - OpenCode v1 supplies identity **later**, through a receipt. <!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#readiness-evidence-and-failure-stages; reason: Provider-specific signal timing is historical evidence requiring adapter verification. -->
> - Claude, Pi and OpenCode v2 establish identity during preparation. <!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#readiness-evidence-and-failure-stages; reason: Provider-specific preparation timing requires verification rather than becoming a universal guarantee. -->
> - Exact resume has prerequisites that must pass **before** outgoing-runtime cleanup. <!-- consolidation: exists; ref: docs/architecture/session-harness.md#session-operations; reason: Resume validates provider identity and paths before retiring outgoing resources. -->
> - Durable reservation, active-pointer publication, resource ownership and failure settlement
>   belong to the application, not the adapter. <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#durability-checkpoint-collaboration; reason: Application coordinates reservation publication ownership and settlement. -->
>
> Keep plain records and the existing service/store/process/adapter boundaries. Make their
> sequencing visible." <!-- consolidation: discard; ref: docs/adr/0001-model-owned-domain-behavior.md#alternatives-considered; reason: Plain-record service-boundary recommendation was superseded by meaningful model ownership. -->

---

## Part C — Oracle's broader findings

### C1. Endorsed simplifications (the real wins)

| Source | Recommendation |
|---|---|
| Three record/reservation implementations: `createNewTarget:1037`, `registerPendingSessionGated:1605`, `reserveSession:1680` | **Consolidate.** One record constructor and one mode reservation mutation. Retain the durable reservation itself. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#new-session; reason: One Task-owned reservation precedes startup. --> <!-- consolidation: discard; ref: none; reason: Exact predecessor helpers are historical inventory. --> |
| Two launch bodies: `launchNativeRecord:1223`, `launchReserved:1764` | **Consolidate.** They repeat preparation, identity publication, environment binding, dispatch, running publication and failure handling. <!-- consolidation: discard; ref: none; reason: Historical duplication finding and refactoring step. --> |
| `ResolvedTarget` / admission helper chain: `914–1201` | **Flatten.** One readable select/attach/resume/new decision sequence; keep helpers only for substantive operations. <!-- consolidation: discard; ref: none; reason: Historical private helper simplification. --> |
| Release callback passed through launch, `940–943, 1352` | **Remove the ownership inversion.** The caller already owns the claim; make resume-failure publication use that claim instead of releasing it so the store re-acquires it (`session-store.ts:552`). <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#durability-checkpoint-collaboration; reason: Application owns coordination across the operation without reentering held admission. --> |
| Generic cleanup action-array callbacks, `1467–1485` | Replace with explicit cleanup steps and explicit error precedence. Still clean resources, kill the prepared pane and publish failure even if an earlier step failed. <!-- consolidation: discard; ref: none; reason: Exact action-array replacement is a historical implementation choice. --> <!-- consolidation: exists; ref: docs/BLUEPRINT.md#new-session; reason: Attempt remaining safe settlement and retain primary plus secondary errors. --> |
| Flat-mode compatibility searches | Remove locally redundant fallbacks using the validated `modes` envelope. Do **not** undertake a repository-wide compatibility migration. <!-- consolidation: discard; ref: docs/SPEC.md#current-contract-only-policy; reason: Historical local scope does not authorize current compatibility paths or automatic conversion. --> |

### C2. What must be KEPT (contract-protected)

- Native identity **receipts** and pane/resource provenance checks (deferred identity is real). <!-- consolidation: exists; ref: docs/architecture/session-harness.md#harness-construction-and-promises; reason: Harness retains identity discovery and exact resource provenance. -->
- `nativeWorkspace`, owner attribution, and direct/native distinctions — hand-off, deletion,
  input/attach and running-limit policies still consume them. *Sharing launch mechanics does
  not authorize changing those policies.* <!-- consolidation: exists; ref: docs/specs/sessions.md#handoff; reason: App-owned predecessor eligibility remains required. --> <!-- consolidation: discard; ref: docs/BLUEPRINT.md#decision-reconciliation; reason: Historical native fields and every policy consuming them are not permanent schema requirements. -->
- Forget-only deletion (`728–807`): keep separate from stop/purge; its path validation and
  no-signalling behaviour are contract-protected. <!-- consolidation: discard; ref: docs/specs/tasks.md#success-and-failure; reason: Forget-only task deletion is superseded by required cleanup. --> <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#storage-and-configuration-interfaces; reason: Path validation survives the changed deletion policy. -->
- At least one launch per mode, and concurrent-callback guards that JSON validation cannot prove. <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#launch-context-and-terminal-transport; reason: At least one launch wording is ambiguous and cannot justify per-mode exclusion or mandatory launch. --> <!-- consolidation: exists; ref: docs/BLUEPRINT.md#mutation-and-concurrency-boundary; reason: Stale callback and execution-origin validation are required beyond schema checks. -->

### C3. The envelope constraint (why guards can't be declared "impossible")

> "`SessionStore` validates unique IDs, task ownership, allowed record fields and valid active
> pointers on writes (`871–945`). It does **not** prove runtime ownership, immutable record
> identity, one launch per mode, or absence of concurrent callbacks. Those guards cannot be
> declared impossible merely because JSON is validated." <!-- consolidation: exists; ref: docs/BLUEPRINT.md#architectural-invariants; reason: Schema validation alone does not establish runtime ownership or current incarnation. --> <!-- consolidation: discard; ref: docs/BLUEPRINT.md#launch-context-and-terminal-transport; reason: Historical one-launch-per-mode constraint is superseded by independent conversations. --> <!-- consolidation: discard; ref: none; reason: Validator line-number inventory is historical evidence. -->

---

## Part D — What was already implemented (current state)

Driven by the review above, three stages were implemented in the working tree (**uncommitted**): <!-- consolidation: discard; ref: none; reason: Historical uncommitted-work status. -->

- **Stage 1** (local redundancy, no lifecycle change): flattened mode histories; extracted
  `cleanupSnapshotFingerprint`; computed cleanup targets once while **keeping the two separate
  loops**; removed the unreachable falsy-mode guard and a flat-mirror lookup fallback. <!-- consolidation: discard; ref: none; reason: Stage-one implementation report is historical evidence not acceptance today. -->
- **Stage 2** (one reservation path, one launch): consolidated the three reservation
  implementations into one record constructor + one mode reservation mutation; consolidated the
  two launch bodies into one; carried the preflight adapter into launch (removed the repeated
  `agentFor()` lookups); flattened the `ResolvedTarget` admission chain; replaced cleanup
  action-arrays with explicit steps; removed the claim release/re-acquire during resume-failure
  publication; made validated mode histories and prepared resources **required** in return types. <!-- consolidation: discard; ref: none; reason: Reservation consolidation status is historical. --> <!-- consolidation: discard; ref: none; reason: Launch consolidation and adapter lookup status is historical. --> <!-- consolidation: discard; ref: none; reason: Admission cleanup and claim refactoring status is historical. --> <!-- consolidation: discard; ref: none; reason: Return-type strengthening is historical implementation evidence. -->
- **Stage 3** (hand-off unification): unified CLI and TUI hand-off on the **TUI policy** —
  successor launches and verifies first; only an app-owned (`nativeWorkspace === true`)
  predecessor is retired via the ordinary verified stop. Removed CLI predecessor pre-parking and
  the demote/kill-retired replacement path; moved durable finalization into the service; queued
  requests now carry validated hand-off metadata + rollback pointer; retirement failure reports
  "successor running; predecessor cleanup failed" without killing the successor. <!-- consolidation: exists; ref: docs/specs/sessions.md#handoff; reason: Successor-first and app-owned retirement failure outcomes are retained. --> <!-- consolidation: discard; ref: none; reason: Removed helpers and queued-request metadata are historical implementation report. -->

Net: `sessions.ts` 2,368 → 2,191 lines (≈ −177 this session). Full suite green
(2,526 pass / 3 skip / 0 fail); `tsc` at its pre-existing baseline. Touched:
`src/agent-workspace/{sessions,session-store,session-launch,workspace-state,workspace-context}.ts`,
`src/ui/opentui/workspace-controller.ts`, and the named tests + `docs/SPEC.md`. <!-- consolidation: discard; ref: none; reason: Historical line counts. --> <!-- consolidation: discard; ref: none; reason: Historical suite and typecheck baseline do not prove current behavior. --> <!-- consolidation: discard; ref: none; reason: Touched-file inventory is ephemeral. -->

### What was explicitly NOT applied

The owner's hints **1, 3, and the class-split half of 4 were rejected and remain unimplemented**;
hint 2's naming/structure was applied, and hint 4's "resolve the adapter once" was applied. <!-- consolidation: discard; ref: docs/adr/0001-model-owned-domain-behavior.md#alternatives-considered; reason: Historical review dispositions preserve debate but do not override accepted class ownership. -->

---

## Part E — Open architectural questions for the planning oracle

1. **Is a further line-count cut actually available**, or is the remaining ~2,191 lines
   genuinely contract-protected (receipts, provenance, envelope validation, owner/native
   distinctions, deletion policy)? If available, where? <!-- consolidation: discard; ref: none; reason: Historical line-count optimization question is not a pending product decision. -->
2. **Should the file be split into submodules** (e.g. launch / reservation / cleanup / hand-off
   / recovery)? The prior oracle flagged this as "a bigger architectural cut" and did not scope
   it. What are the seams, and do they reduce real complexity or just redistribute it? <!-- consolidation: discard; ref: docs/adr/0001-model-owned-domain-behavior.md#decision; reason: Accepted Task Session Harness and application ownership resolves the structural direction. -->
3. **Is the owner's `Task.newSession()` / `Session.create()` model viable** if the adapter
   boundary were redesigned so that deferred identity (OpenCode v1 receipts) and
   reservation/publication/failure-settlement were cleanly separated from adapter `prepare()`?
   Or is that a rewrite masquerading as a simplification? <!-- consolidation: discard; ref: docs/adr/0001-model-owned-domain-behavior.md#decision; reason: Concrete model design is accepted rather than an unanswered viability proposal. -->
4. **Is the concurrency model** (JSON store lock + task-file lock + claim + runtime provenance)
   the minimal correct one, or can it be reduced without reintroducing TOCTOU? The owner wants a
   mutex; the prior oracle argued the existing locks already cover the real boundaries and the
   commit-time assert is a necessary revalidation, not a substitute for locking. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#mutation-and-concurrency-boundary; reason: Required fresh-state validation and short coordination are settled while private synchronization remains implementation work. -->
5. **"Guards for states that can never occur"** — which of the file's guards genuinely cannot
   occur (and can be deleted), versus which merely *look* impossible under JSON validation but
   are reachable through runtime/provenance/concurrency (and must stay)? <!-- consolidation: discard; ref: none; reason: Guard-by-guard source investigation is historical refactoring work rather than a new core requirement. -->
