---
consolidation:
  total: 95
  counts:
    exists: 10
    discard: 55
    integrate: 13
    unconfirmed: 17
  percentages:
    exists: 10.53%
    discard: 57.89%
    integrate: 13.68%
    unconfirmed: 17.89%
---
# Decision answer sheet — Backlog.md
> **Non-authoritative supporting material.** This file is not a contract. Authoritative owner(s): [SPEC](SPEC.md), [task behavior](specs/tasks.md), [sessions](specs/sessions.md), [supported integration operations](specs/supported-integration-operations.md), [BLUEPRINT](BLUEPRINT.md), [architecture](architecture/session-harness.md), [CONVENTIONS](CONVENTIONS.md).
> Disposition: Mixed — see markers.

Answer inline (put your choice after each `Answer:`), then tell me "answers are in the file" or paste them back.
<!-- consolidation: discard; ref: none; reason: Historical response instructions. -->

Nothing here needs a tool call to answer — each item is one letter.
<!-- consolidation: discard; ref: none; reason: Historical interview logistics. -->

Four further failures (Group B at the end) are **not ready for you yet**: I need one diagnostic pass first, then I'll bring you a specific call instead of a vague one. <!-- consolidation: discard; ref: none; reason: Historical diagnostic scheduling rather than a durable requirement. -->

---

## Q1 — Should the product auto-repair duplicate tasks?

Blocking 27 failing tests: `duplicate-task-repair` (20), `cli-doctor` (6), `container-duplicate-repair-contract` (1).
<!-- consolidation: discard; ref: docs/CONVENTIONS.md#testing; reason: Historical failure counts must be remeasured rather than promoted to core. -->

**What's going on.** `duplicate-task-repair.ts:430-438` detects duplicates but refuses to repair any that live in canonical containers: "whole-container repair required and are currently refused to preserve sibling artifacts and sidecars." Seven assertions expect repair to actually work; a further twenty use legacy flat duplicate fixtures.
<!-- consolidation: discard; ref: none; reason: Canonical-container repair refusal is superseded by the explicit repair-removal answer below. -->
<!-- consolidation: discard; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Repair expectations and legacy flat-fixture counts are historical test-alignment inventory. -->

**Scenario.** A project ends up with `backlog/tasks/task-1/task.md` (TASK-1) and `backlog/tasks/task-01/task.md` (TASK-01) — same logical task, two containers — either from the old id-reuse bug or hand editing. You run `backlog doctor`. Today it reports the duplicate and refuses to touch it. Question: should it merge them for you?
<!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Merge proposal rejected below and numeric equivalence rejected by Q4's literal-string answer. -->

**Options.**
- **A — Build whole-container repair.** It picks a winner, moves the loser's content, preserves artifacts/sidecars. New destructive code, needs a preservation design, and we cannot reproduce the case in normal use any more.
<!-- consolidation: discard; ref: none; reason: The answer explicitly deletes repair instead of approving this merge proposal. -->
- **B — Keep the refusal; fix the 7 assertions** to expect a blocked preview and no mutation. Duplicates are reported, never merged.
<!-- consolidation: discard; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Rejected by repair deletion here and doctor deletion in sheet 2 item 3. -->
- **C — Delete the repair feature entirely** (doctor reports duplicates only).
<!-- consolidation: integrate; ref: docs/specs/tasks.md#tasks-and-storage; reason: Accepted removal of automatic duplicate repair is not explicit in core. -->
<!-- consolidation: discard; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Report-only doctor portion was superseded by sheet 2 item 3 deleting doctor entirely. -->

**Recommended: B.** Allocation can no longer mint a collision (`backlog.ts:557-571`), so the only remaining duplicates are damaged or hand-made data — precisely where a human should look before anything merges. A ships destructive merge semantics for a case we can't reproduce; C throws away the detection that makes duplicates findable.
<!-- consolidation: discard; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Recommendation was rejected by this answer and subsequent explicit doctor removal. -->

**Answer:** Delete the repair feature entirely. Also, please tell me what the doctor actually does. It might not be necessary anymore. As per our rule - no migration or legacy code should be written. We're currently the only users for this app and in development so any breaking change we introduce, we manually repair any broken data, schema, files without introducing permanent migration code. So regarding this question, make sure we do not get to the situation where we have duplicated tasks in the first place. If the code already uses our new structure and nothing in the code uses the legacy old structure then we're fine. If there are leftovers, please clean them up and fix them to use the new structure altogether. we do not need migration for that or special code.
<!-- consolidation: integrate; ref: docs/specs/tasks.md#tasks-and-storage; reason: Explicit duplicate-repair removal is missing from core. -->
<!-- consolidation: integrate; ref: docs/specs/tasks.md#tasks-and-storage; reason: Preventing app-created duplicate task identities is an accepted missing task rule. -->
<!-- consolidation: discard; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Doctor explanation request was answered in sheet 2 item 3 and followed by explicit removal. -->
<!-- consolidation: unconfirmed; ref: none; reason: Current-only behavior disallows permanent legacy compatibility without approval. -->
<!-- consolidation: exists; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Superseded behavior and callers or fixtures must be removed together. -->
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Owner's development policy uses manual broken-data correction rather than permanent schema migration code. -->

---

## Q2 — How far should the session-identity refactor go?

Blocks no test today; it is design debt that taxes every future adapter.
<!-- consolidation: discard; ref: none; reason: Historical prioritization assessment. -->

**What's going on.** Adapters expose `nativeSessionIdForLaunch()`; shared orchestration allocates an id during *reservation*, writes it into the durable record **before launch**, and later takes `prepared.nativeSessionId ?? options.nativeSessionId` (`session-launch.ts:215-218`). One adapter sets `waitsForNativeSessionReceipt`. Oracle's verdict: a real agent-agnosticism violation — shared code interprets provider mechanics and decides which adapter's id to trust. The flag also does not implement a wait (`bindNativeReceipt` samples and returns, `sessions.ts:389-400`), so a workspace launch stays `STARTING` while the identical direct launch goes `RUNNING`. Three sibling leaks exist: storage parsing `ses_`/`"opencode"` identity (`session-store.ts:37,839-863`), provider-name id generation in orchestration (`sessions.ts:1169-1187`), and OpenCode-only export handling in `mode-model.ts`.
<!-- consolidation: discard; ref: docs/architecture/session-harness.md#harness; reason: Shared prelaunch native-ID allocation and fallback precedence are historical provider-ownership defects rather than target behavior. -->
<!-- consolidation: discard; ref: docs/specs/sessions.md#purpose; reason: Nonwaiting receipt flag and divergent CLI versus workspace states are historical evidence conflicting with identical launch semantics. -->
<!-- consolidation: discard; ref: docs/architecture/session-harness.md#harness; reason: Storage parsing provider identity is a historical leak superseded by Harness-owned discovery. -->
<!-- consolidation: discard; ref: docs/architecture/session-harness.md#harness; reason: Provider-named ID generation in shared orchestration is superseded by Harness ownership. -->
<!-- consolidation: discard; ref: docs/BLUEPRINT.md#component-ownership; reason: OpenCode-only export handling in a shared mode model is historical provider-leak inventory. -->

**Scenario.** You add a fifth harness. Today you must discover for yourself whether it needs a receipt, whether the client may name the session, and where ids come from — and then teach *shared* code about it. The correct design is that the adapter reports established identity and shared code only validates, persists, and publishes it.
<!-- consolidation: exists; ref: docs/architecture/session-harness.md#harness; reason: Harness owns identity discovery and receipt mechanics while application owns publication. -->

**Options.**
- **I — Bounded first slice** (oracle's recommendation): adapters take `{kind:"new"} | {kind:"resume", nativeSessionId}` and return confirmed-or-client-established identity; adapters own proposed ids and command assembly; one ownership-checked publisher handles immediate and deferred identity; receipts stay durable but move behind adapters; delete the flag and the requested-id plumbing together. Medium refactor, no schema migration.
<!-- consolidation: exists; ref: docs/architecture/session-harness.md#harness; reason: Accepted provider-owned creation identity and exact resume responsibilities are represented without freezing the old signature. -->
<!-- consolidation: exists; ref: docs/BLUEPRINT.md#application-controller-and-stores; reason: Identity publication revalidates ownership and awaits required durability. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#durable-conversation-and-operation-records; reason: Exact durable receipt representation still requires recovery evidence and is not prescribed by the current contract. -->
<!-- consolidation: discard; ref: docs/BLUEPRINT.md#harness-and-provider-adapters; reason: Old flag-removal and requested-ID plumbing instructions are historical implementation tasks. -->
- **II — Full end state**, also deleting durable receipt transport. Not honest yet: nothing verified replaces its recovery function.
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#durable-conversation-and-operation-records; reason: Removing recovery transport requires proof that required interrupted-startup evidence survives. -->
- **III — Narrow**: fix only the live hazard, leave the interface. Now optional — the suspected "v2 stores a fictional identity" turned out to be false (a local experiment showed a fabricated id genuinely creates the session on v2.0.26).
<!-- consolidation: discard; ref: docs/architecture/session-harness.md#harness; reason: Rejected alternative and version-specific experiment do not replace the accepted provider ownership contract. -->
- **IV — Defer**: capture as a spec, keep the current guard.
<!-- consolidation: discard; ref: docs/BLUEPRINT.md#harness-and-provider-adapters; reason: Owner chose slice I rather than deferral. -->

**Recommended: I, at low urgency.** Nothing a user can hit today is broken, so this is not a fire — but it is real design debt, and it is cheapest while the domain is fresh. Do not pick II. Contract must treat **client-established identity as a first-class case** (Claude/Pi/v2 legitimately name their own sessions).
<!-- consolidation: discard; ref: none; reason: Urgency and current-provider assertions are historical assessments. -->
<!-- consolidation: integrate; ref: docs/architecture/session-harness.md#harness; reason: Accepted adapter-established identity is valid without requiring provider issuance but core does not explicitly distinguish that basis. -->

**Answer:** Yes, I is the correct approach. But in addition, let's verify that we actually need the durable receipt transport. I imagined it like
<!-- consolidation: exists; ref: docs/architecture/session-harness.md#harness; reason: Harness owns creation and exact resume behind a provider-neutral caller. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#durable-conversation-and-operation-records; reason: User requests verification of receipt necessity rather than approving its unconditional deletion. -->
```ts
harness = HarnessBuilder.from(task.resolveConfig().harness)
sessionId = harness.startSession()
// Or for resume
harness.resumeSession(task.getActiveSessionId(currentMode))
```
<!-- consolidation: exists; ref: docs/architecture/session-harness.md#harness; reason: Sketch's preset-to-provider construction responsibility is represented by Harness.from. -->
<!-- consolidation: exists; ref: docs/architecture/session-harness.md#harness; reason: Sketch's startSession responsibility is represented by new conversation startup with established identity. -->
<!-- consolidation: exists; ref: docs/architecture/session-harness.md#harness; reason: Sketch's resumeSession responsibility is represented by exact saved-conversation resume. -->
<!-- consolidation: discard; ref: docs/BLUEPRINT.md#harness-and-provider-adapters; reason: Literal HarnessBuilder shape is superseded by simple factory construction unless staged construction is justified. -->

---

## Q3 — What should `list`/`search` do when one task file is unparseable?

Blocking 2 failing tests in `cli-task-list`.
<!-- consolidation: discard; ref: none; reason: Historical test count. -->

**What's going on.** With a canonical but malformed record (`backlog/completed/task-99/task.md`, `title: [unclosed`), `backlog task list` warns on stderr, prints nothing, and exits 1. `backlog search` behaves the same. The exit 1 comes from the corpus loader (`persistent-task-read.ts:49-69` → `task-repository.ts:82-101` propagates the parse error), **not** from the tolerant duplicate scan (`duplicate-task-repair.ts:116-124`), which skips and warns. `6cb96c42 fix(tasks): enforce current-only local and Git reads` deliberately **removed** a catch that used to swallow non-fatal parse errors.
<!-- consolidation: discard; ref: docs/specs/filtering-and-search.md#filtering-and-search; reason: Historical strict-loader implementation is replaced by the explicit tolerant-read answers here and in sheet 2 item 5. -->

**Scenario.** You (or a teammate) hand-edit a task and break its YAML. Next morning every `backlog list` and `backlog search` fails until you find and fix the file. Alternative reading: that is exactly what you want — silent skipping hides corruption.
<!-- consolidation: discard; ref: docs/specs/filtering-and-search.md#filtering-and-search; reason: Owner rejects whole-process failure and chooses visible localized corruption reporting. -->

**Options.**
- **A — Keep strict; update the two tests** to expect the failure and name the offending record.
<!-- consolidation: discard; ref: docs/specs/filtering-and-search.md#filtering-and-search; reason: Rejected by the tolerant-read answer. -->
- **B — Restore tolerant skip-and-warn in the corpus loader**, matching the duplicate scan. Reverses `6cb96c42`.
<!-- consolidation: integrate; ref: docs/specs/filtering-and-search.md#filtering-and-search; reason: Accepted collection-read warning and skip behavior is absent from core. -->
- **C — Keep strict but improve the error** to name the file and the manual fix instead of a bare repeated `YAML Parse error: Unexpected token`.
<!-- consolidation: discard; ref: docs/specs/filtering-and-search.md#filtering-and-search; reason: Strict whole-command failure was rejected although helpful error reporting was accepted separately. -->

**Recommended: A.** Failing loudly on corrupt data is defensible and it is the recent deliberate decision; tolerance already exists where it matters (the duplicate scan); the tests in question only expect success because their filters never load the corpus. C is a worthwhile refinement on top of A if the current error text feels unhelpful.
<!-- consolidation: discard; ref: docs/specs/filtering-and-search.md#filtering-and-search; reason: Explicit owner answer rejects this strict-failure recommendation. -->

**Answer:** The behavior should be, if data is corrupted, we provide a user friendly error but do not fail the process itself. We do not try to fix any broken thing that might happen. This is wrong and it just adds a lot of complexity to the code. If a user or "something" corrupts our data, we error and continue (if possible) but we do not account for all cases where things might go wrong and try to fix those ahead of time.
<!-- consolidation: integrate; ref: docs/specs/filtering-and-search.md#filtering-and-search; reason: Approved localized helpful errors and continuation where possible are absent from core and clarified by sheet 2 items 3 and 5. -->
<!-- consolidation: integrate; ref: docs/specs/tasks.md#tasks-and-storage; reason: Approved no-automatic-corruption-repair policy is absent from core. -->

---

## Q4 — Are zero-padded ids distinct identities or legacy aliases?

Blocking 3 failing tests: `local-task-command-performance` (2), `readiness-surface-agreement` (1).
<!-- consolidation: discard; ref: none; reason: Historical failure inventory. -->

**What's going on.** `zeroPaddedIds` is a supported, documented feature, so `TASK-01` is a legitimate id form. But logical equality strips padding, so `task-1/` and `task-01/` are both valid container names while being logically equal. Allocation now refuses to mint such a pair, and a project that already has both gets a fail-closed ambiguity error rather than a guess.
<!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Numeric-equivalence implementation is explicitly rejected by Q4's whole-string identity answer. -->
<!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#tasks-and-storage; reason: Current support and configuration of zeroPaddedIds are not settled by approval of literal identity alone. -->

**Scenario.** You enabled zero-padded ids a while ago, so you have `TASK-01`. A colleague created `TASK-1` before that. Now `backlog task view task-1` is ambiguous. Should the tool treat `TASK-01` as the same thing as `TASK-1` and pick one for you?
<!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Owner explicitly resolves the question by treating the two complete strings as distinct IDs. -->

**Options.**
- **A — Keep them distinct, fail closed.** Collisions are reported, never guessed; the tests assert the rejection.
<!-- consolidation: integrate; ref: docs/specs/tasks.md#tasks-and-storage; reason: Accepted whole-string task identity is absent from core. -->
<!-- consolidation: integrate; ref: docs/specs/tasks.md#tasks-and-storage; reason: Accepted reporting rather than guessing for genuine duplicate whole-string identity is absent from core. -->
- **B — Normalize padded ids to unpadded**, treating `TASK-01` as `TASK-1`. Friendlier for legacy data, but it is compatibility behavior you keep permanently, and it reintroduces ambiguity unless padding is dropped as a feature altogether.
<!-- consolidation: discard; ref: none; reason: Owner rejects numeric normalization and permanent compatibility aliases. -->

**Recommended: A.** An alias rule is the same category as the flat-record compatibility already removed — permanent code carrying an old format. If padded ids should be retired, that is a one-time manual conversion of the padded records, not a rule baked into every lookup.
<!-- consolidation: unconfirmed; ref: none; reason: Current-only policy excludes unapproved compatibility alias behavior. -->
<!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#tasks-and-storage; reason: Conditional retirement of padded IDs is not an approved decision to remove them. -->

**Answer:** That's a good recommendation and exactly the approach we need. I'll also add that task id is `TASK-01` and not `1` or `01` - it's the whole string. We do not compare ints here. If task id was only a number then yes, we compare numbers but we chose a prefix + `-` + a number - so that's the id.
<!-- consolidation: integrate; ref: docs/specs/tasks.md#tasks-and-storage; reason: Core lacks the explicit accepted full-string identity rule distinguishing TASK-01 from TASK-1. -->

---

## Q5 — Task creation from a linked git worktree is broken (pre-existing)

Blocking 5 failing tests: `worktree-task-id-allocation` (4), `worktree-refresh` (1). **User-facing, and NOT our regression** — verified by running the tests against HEAD itself.
<!-- consolidation: discard; ref: none; reason: Historical failure count and regression attribution. -->

**What's going on.** `saveTask` throws `Task <id> resolves outside active task storage` when called from a linked worktree. Two root notions disagree: `TaskArtifactRepository.root()` (`task-artifact-repository.ts:113-120`) deliberately maps a worktree's backlog path to the **main** worktree, so the container lives under main; the guard compares that against the **active** root, derived from the worktree's own backlog directory (`operations.ts:197-204,363-365,733-736`). They can never match.
<!-- consolidation: discard; ref: docs/BLUEPRINT.md#application-controller-and-stores; reason: Historical mismatched-root source finding is alignment evidence for the now-settled authoritative store. -->

**Scenario.** You check out the repo in a `git worktree add` sibling to run an experiment, cd into it, and run `backlog task create "try X"`. It fails with a path-containment error. You cannot create tasks from any worktree at all.
<!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Historical bug scenario contradicts the now-approved shared project store. -->

**Options.**
- **A — Tasks live in the main worktree's store.** Make the active-root resolution use the same worktree→main mapping as `root()`, so guard and container agree. Small, coherent; contradicts what the sibling-scanning tests expect.
<!-- consolidation: exists; ref: docs/specs/tasks.md#tasks-and-storage; reason: Linked worktrees share the main project's configured store. -->
- **B — Tasks live per worktree.** Drop the remap from `root()`; each worktree uses its own `backlog/`, and allocation scans sibling worktrees. Larger; changes storage semantics and how worktree tasks are found and committed.
<!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Core explicitly rejects alternative worktree or branch task collections. -->
- **C — Leave it; record it as a known pre-existing bug.** Out of the original scope.
<!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Deferral recommendation superseded by sheet 2 item 1's accepted shared-store decision. -->

**Recommended: C for now, then A or B as its own piece of work.** It is a question about *where tasks live*, not compatibility, so folding it into the legacy cleanup would be wrong. The failing tests hint at B (they scan siblings), but that needs confirming with whoever wrote them — my reading is not evidence.
<!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Historical deferral and ambiguity are settled by the shared-store contract. -->

**Answer:** I'll say that once and hopefully it sticks - tests do not dictate behavior, spec does. If tests do not align with the spec it's a test misalignment issue and needs to be fixed. In regards to this issue - Of course it should resolve to the agreed upon root. All code must agree on the same behavior - otherwise, we have bugs.
<!-- consolidation: unconfirmed; ref: none; reason: Tests are implementation evidence and cannot override approved intent. -->
<!-- consolidation: exists; ref: docs/BLUEPRINT.md#application-controller-and-stores; reason: All callers resolve one authoritative project task store. -->

---

## R1 — Demotion feedback (yes/no)

The MCP task demotion response no longer emits the old "dependency cleanup" summary line; the test now checks the cleanup *state* instead. Was dropping that text deliberate? If not, it is a small user-visible regression and I'll file it.
<!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Source claim was corrected in sheet 2 item 6 and draft demotion is now explicitly unsupported. -->

**Answer:** You failed to explain this properly so I do not understand your question.
<!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Clarification request was resolved in sheet 3 item 1 for a now-removed demotion surface. -->

## R2 — Archived ids are not reusable (confirm)

Deliberate change from the id-allocation fix: archiving a task no longer frees its id for reuse, which is what made duplicate `TASK-1`s possible. No doc claimed otherwise. Confirm you are fine with ids advancing rather than compacting after archive.
<!-- consolidation: integrate; ref: docs/specs/tasks.md#tasks-and-storage; reason: Confirmed archive-safe nonreuse of task identities is absent from core. -->

**Answer:** confirmed.
<!-- consolidation: integrate; ref: docs/specs/tasks.md#tasks-and-storage; reason: Owner explicitly confirms archived task IDs remain reserved rather than reused. -->

---

## Group B — one answer needed (three are already resolved)

The diagnostic pass landed three of these as **stale expectations / unfaithful fakes**, so they are fixed test-side with no input from you:
<!-- consolidation: discard; ref: none; reason: Historical completion status for the following test fixes. -->

- `session-snapshot-adoption-contract.test.ts` — the override warning is never produced on this adoption path (it reuses the queued request's saved environment rather than re-preparing), so the assertion is removed. Nothing was dropped in production.
<!-- consolidation: discard; ref: docs/specs/configuration.md#configuration-and-modes; reason: Historical fake correction does not establish retained snapshot semantics over current effective configuration. -->
- `mode-workspace-render-contract.test.ts` — the badge renders only on a **selected** row (`mode-row-label.ts:46-54`); the fixture never selected the row, so the fixture now selects it and the badge intent is preserved.
<!-- consolidation: discard; ref: docs/specs/session-interaction-and-feedback.md#session-interaction-and-feedback; reason: Historical fixture fix is not approval of a selected-row-only badge contract. -->
- `opentui-mode-passive-preview.test.ts` — the fake was unfaithful: the controller reads the selected mode's session from its **local selection map** (`workspace-controller.ts:1223-1231`), not the history's `activeSessionId`. The fake now drives a local selection instead.
<!-- consolidation: discard; ref: docs/BLUEPRINT.md#models-and-relationships; reason: Old controller-local selection ownership is superseded by Task-owned active-session selection. -->

**B4 — when input is in flight, should `detach()` resolve or reject?**
<!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Sheet 8 approves a bounded drain but does not settle detach promise resolution versus the input-error channel. -->

Scenario: the test saturates the executor slots, queues input, then detaches before that queued input dispatches. Detach reports "Input transport stopped while input delivery was in flight; delivery is uncertain". The test expects detach itself to **succeed** while the input worker separately reports the uncertainty (`:172-176`), and `exec.ts:217` already treats cancellation-after-dispatch as uncertain.
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#runningexecution; reason: Exact queued-versus-in-flight cancellation and detach error-channel behavior are not fixed by core. -->

- **A — Resolve detach; report the uncertainty on the input error channel.** Matches the test's two-channel intent and the existing cancellation semantics. **Recommended.**
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#runningexecution; reason: No answer approves this particular error-channel split. -->
- **B — Reject detach with the uncertainty**, so a detach with pending input cannot be mistaken for a clean one; update the test to assert the rejection and drop its success expectation.
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#runningexecution; reason: Source behavior and later bounded drain do not settle detach rejection after failed delivery. -->
- **C — Make the fixture avoid pending input at detach** (wait for the input to finish first). Only correct if the test is about detach mechanics rather than the in-flight-input contract.
<!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#testing; reason: Unanswered recommendation would change coverage and cannot be inferred approved. -->

**Answer B4:** ____

---

**Three gaps that lost coverage.** While the cross-branch scenarios were being resolved they were **deleted** (canonical layout could not express their intent), so nothing now asserts them, and the substitutions revealed behaviour worth a look: with genuinely distinct active/completed paths the product **did** emit a duplicate-identity diagnostic, yet (i) the dependent task's dependency stayed `resolved` rather than `ambiguous`, and (ii) `task_view` on the duplicated id still did not return an error. A third variant failed with an `ENOENT` naming a **NUL-suffixed** state-directory path — a construction smell, not an ordinary missing file. I have not established whether (i)/(ii) are pre-existing gaps, consequences of the canonical migration, or artifacts of the fixtures I asked for, so I am recording them rather than filing them as bugs.
<!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Cross-branch task discovery scenarios are superseded by one configured store. -->
<!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#tasks-and-storage; reason: Dependency ambiguity under genuine duplicate whole-string identities remains an unverified coverage finding. -->
<!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#tasks-and-storage; reason: Duplicate-ID task_view rejection finding needs current-contract verification rather than promotion from historical fixtures. -->
<!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#tasks-and-storage; reason: NUL-suffixed path finding has no established cause or disposition. -->

---

## Group C — the two hang files (needs a call)

**Question:** how much more should we invest in `atomic-task-create.test.ts` (2 failures) and `mode-session-reservation-contract.test.ts` (3 failures plus errors)?
<!-- consolidation: discard; ref: docs/CONVENTIONS.md#testing; reason: Diagnostic prioritization was answered by sheet 2 item 8 choosing minimization. -->

**What we know.** Both reproduce with plain `bun test`, so our test runner is not involved — and they reproduce on a freshly downloaded **Bun 1.4.3** as well, so this is not a 1.3.10-only bug. During a hang the process sits at **100% CPU** with only unsymbolized Bun frames: `bun --cpu-prof` produced **no profile file at all**, and SIGQUIT yielded no native backtrace. I read the lock path directly: `LockOwner` delegates to `proper-lockfile` with timer-based retries, default delay 100ms, and the two zero-delay call sites pair it with `retries: 0` (a single attempt), so there is no tight retry loop to blame. The `ECOMPROMISED`/`ENOENT` lock errors are a *consequence* of the fixture's `afterEach` deleting the root while lock handling still runs — not the cause.
<!-- consolidation: discard; ref: docs/CONVENTIONS.md#testing; reason: Runtime versions and sampled profiles are historical diagnostic evidence requiring remeasurement. -->
<!-- consolidation: discard; ref: docs/CONVENTIONS.md#testing; reason: Historical fixture and lock-handling diagnosis remains supporting evidence rather than a core requirement or proof that the failure is resolved. -->

**Impact.** Test-host only: it blocks CI and local runs of those two files. No end-user path is known to hang. The earlier incidental observation of ~49 orphaned spinning test processes shares this signature, so the cost is real but confined to test runs.
<!-- consolidation: discard; ref: none; reason: Historical impact and process count do not establish a durable product limitation. -->

**A wider pattern worth knowing before you answer.** Five files now fail on **time**, not behaviour: the two above, plus `src/test/opentui-workspace-controller.test.ts` (a 5s `waitUntil` deadline that intermittently expires — it passes at HEAD *and* passes three isolated runs in the working tree, but failed once in a full-suite run and once in isolation), and `src/test/cli-list-window.test.ts` and `src/test/artifact-view-live-refresh-contract.test.ts` (both pass alone). So the suite has a load-sensitivity problem that is separate from any product defect. That is relevant to H: raising these deadlines is likely a cheaper and more honest mitigation than chasing the root cause of the hangs.
<!-- consolidation: discard; ref: docs/CONVENTIONS.md#testing; reason: File-specific timing observations are historical diagnostic evidence. -->
<!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#testing; reason: Raising deadlines instead of investigating hangs was not approved and requires a coverage justification. -->

**Options.**
- **H1 — Accept as known red.** Record the two files as known-hanging; everything else proceeds. **Recommended.**
<!-- consolidation: discard; ref: docs/CONVENTIONS.md#testing; reason: Explicitly rejected by sheet 2 item 8. -->
- **H2 — Instrument to name it.** Temporarily add bounded logging or a watchdog around lock acquisition and the branch-refresh path so the next hang identifies its own phase. Removes the guesswork but touches product code.
<!-- consolidation: discard; ref: none; reason: Historical unselected diagnostic option rather than a durable contract. -->
- **H3 — Minimize the trigger.** Reduce each concurrency case step by step (single worker, concurrency 2 → 1, pre-created lock file) until the hang stops, which usually localizes a trigger without touching product code.
<!-- consolidation: discard; ref: none; reason: Accepted in sheet 2 as a bounded diagnostic action whose work status belongs in the execution ledger. -->

**Recommended: H1 now, H3 if it starts costing CI time, H2 only with a time box.** Three diagnostic passes plus a runtime A/B already failed to attribute it, so further sampling is unlikely to pay off without new instrumentation.
<!-- consolidation: discard; ref: none; reason: Owner explicitly rejected deferral in sheet 2 item 8. -->

**Answer:** ____
