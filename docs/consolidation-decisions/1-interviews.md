# Decision sheet — Interview, decision-sheet and research leftovers

> **Non-authoritative working sheet.** Not a contract. Answers here are applied to the owning contracts and to each document's disposition markers.

Each group below is one document. Decide the group as a whole, select statements individually, or write a narrowing instruction.

- Group box: `[ ] Discard all` · `[ ] Approve all (integrate)` · `[ ] Select individually` · `[ ] Narrow further: ______`
- Per statement (only if selecting individually): `d` discard · `i` integrate · `?` still open.
- Class tag: `P` = proposal / unanswered claim (a policy answer can retire it) · `G` = evidence or safety gate (needs evidence, not a decision).

Family total: **241** statements — 87 P · 154 G.

## G1 · Decision answer sheet 2 — Backlog.md

**Document:** `docs/decision-answers-2.md` · **6 statements** — 1 P · 5 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/BLUEPRINT.md#durable-conversation-and-operation-records`** — 1 statement(s)

1. `G` **Provider-version-specific receipt necessity or redundancy is historical recovery evidence requiring verification before retirement.** — - **Q2** — Slice I. Durable receipts kept for v1, deleted for v2 (verified: v1's receipt is the only recovery path when the launcher dies between provider creation and Backlog persistence; v2 names … — `docs/decision-answers-2.md:30`

**→ `docs/BLUEPRINT.md#authoritative-mutation-and-publication`** — 1 statement(s)

1. `G` **One store does not imply a single writer process and core instead requires coordinated fresh-state mutations.** — - **A (recommended)** — **One store.** Tasks live in the main worktree's `backlog/`, and every path resolves through the same worktree-to-main mapping. A scratch worktree cannot strand tasks, and one … — `docs/decision-answers-2.md:53`

**→ `docs/specs/tasks.md#tasks-and-storage`** — 1 statement(s)

1. `G` **Exact cross-state duplicate resolution evidence is historical and must not imply numeric equivalence rejected by literal-ID policy.** — **Context.** Its duplicate scan covers active and completed only, so a duplicate whose other side is archived is not reported there. Resolving such an id already fails closed and names both … — `docs/decision-answers-2.md:105`

**→ `docs/specs/sessions.md#observe-and-detach-from-a-live-session`** — 1 statement(s)

1. `G` **Current applicability of the historical uncertainty assertion after sheet 8's bounded drain requires verification.** — **Context.** In `src/agent-workspace/live/tmux/transport-detach.integration.test.ts`, the input transport stops while a delivery is in flight, and the system reports "Input transport stopped while … — `docs/decision-answers-2.md:144`

**→ `docs/architecture/session-harness.md#runningexecution`** — 1 statement(s)

1. `P` **Exact uncertainty reporting on this path was not approved by this unanswered question.** — - **A (recommended)** — That is the correct, honest outcome for this path; update the test to expect it. — `docs/decision-answers-2.md:147`

**→ `docs/CONVENTIONS.md#testing`** — 1 statement(s)

1. `G` **No approval to remove this coverage.** — - **C** — Drop the test until a design call is made. — `docs/decision-answers-2.md:151`

## G2 · Decision answer sheet 3 — the two I explained badly

**Document:** `docs/decision-answers-3.md` · **7 statements** — 3 P · 4 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/architecture/session-harness.md#runningexecution`** — 3 statement(s)

1. `P` **Exact uncertainty text and applicability after bounded draining are not approved by this example.** — ``` — `docs/decision-answers-3.md:65`
2. `G` **Half-delivery cannot be inferred for the pre-dispatch cancellation path later described in sheet 4.** — Which means: *"I stopped sending your input half-way through, so I don't know whether the agent got all of it."* This path has a test that asserts that this is what gets reported. — `docs/decision-answers-3.md:68`
3. `P` **Exact uncertainty-message and resend guidance was not accepted here.** — - **A (recommended)** — Yes. Input that was half-delivered is genuinely unknown, and saying so is what lets you re-send it. Keep the message and keep the test asserting it. — `docs/decision-answers-3.md:74`

**→ `docs/specs/sessions.md#observe-and-detach-from-a-live-session`** — 2 statement(s)

1. `G` **Exact post-drain delivery reporting remains unresolved by the clarification response.** — **The question.** Is that the right thing to tell you on this path? — `docs/decision-answers-3.md:71`
2. `P` **Unbounded completion alternative is not approved and sheet 8 instead accepts a two-second bound for already in-flight input.** — - **B** — No: Backlog should finish delivering the input, or report it as delivered. Then the test should expect that instead. — `docs/decision-answers-3.md:76`

**→ `docs/specs/tasks.md#tasks-and-storage`** — 1 statement(s)

1. `G` **Archive-specific dependency removal is not settled by the core rule that dependencies survive completion.** — **The product behaviour.** Say TASK-2 depends on TASK-1 — TASK-1 is listed in TASK-2's dependencies. Now TASK-1 leaves your active set: you archive it, or you `backlog task demote TASK-1` (moving an … — `docs/decision-answers-3.md:28`

**→ `docs/CONVENTIONS.md#testing`** — 1 statement(s)

1. `G` **No approval to remove transport failure coverage.** — - **C** — Drop the test until the behaviour is decided. — `docs/decision-answers-3.md:79`

## G3 · Decision answer sheet 4

**Document:** `docs/decision-answers-4.md` · **7 statements** — 1 P · 6 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/architecture/session-harness.md#runningexecution`** — 6 statement(s)

1. `G` **Exact error text for queued versus dispatched input is not settled in core.** — ``` — `docs/decision-answers-4.md:43`
2. `G` **Later paragraph says none was written on this path so the hedged explanation requires verification.** — Meaning: *"I stopped before I finished writing your input to the agent's terminal, so I can't tell you how much of it the agent actually received."* — `docs/decision-answers-4.md:46`
3. `G` **Exact uncertainty outcome on application exit after the accepted drain still requires verification.** — **What it is not.** Not deleting the task. Not the agent crashing. Not the agent's session ending — detaching **keeps the session running** (the test asserts the session is retained). What stops is … — `docs/decision-answers-4.md:51`
4. `G` **Historical pre-dispatch evidence conflicts with the half-delivery explanation and does not settle approved reporting.** — **One detail worth knowing.** On this particular path nothing had actually been written yet — the pending write was cancelled before it ran, so the agent received none of it. The message still says … — `docs/decision-answers-4.md:54`
5. `P` **User did not approve hedging or resend semantics and none-sent versus uncertain remains distinct.** — - **A (current behavior, smallest change)** — Keep the one hedged message: "I stopped mid-send, delivery uncertain." It is never wrong, and it tells you to re-send. The existing test keeps asserting … — `docs/decision-answers-4.md:60`
6. `G` **No answer approves this message split and later option B refers to bounded draining instead.** — - **B (more precise)** — Say what actually happened: if nothing had been written yet, tell you "your input was not sent"; reserve "uncertain" only for input that had already started out. Costs a … — `docs/decision-answers-4.md:62`

**→ `docs/CONVENTIONS.md#testing`** — 1 statement(s)

1. `G` **Removing this coverage was never approved.** — - **C** — Leave the behavior alone but stop testing it. — `docs/decision-answers-4.md:64`

## G4 · Decision answer sheet 5 — the input-during-close question, with the code facts

**Document:** `docs/decision-answers-5.md` · **7 statements** — 3 P · 4 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/architecture/session-harness.md#runningexecution`** — 5 statement(s)

1. `P` **Historical queued-input loss is not approved by the later decision concerning already in-flight writes.** — - Input **not yet handed to the terminal** (still queued): dropped immediately. — `docs/decision-answers-5.md:46`
2. `G` **Exact uncertainty reporting after the drain times out remains unspecified.** — - Input **already handed over** (a `send-keys` in progress): **killed mid-flight too**. The app then waits up to 2 seconds for that kill to settle, and reports `delivery is uncertain` because it … — `docs/decision-answers-5.md:49`
3. `G` **Claimed closing-action slot dependency and inevitable loss require verification rather than becoming an approved limitation.** — 2. **When the terminal link is saturated, waiting doesn't help.** The test's 32 occupied slots are an extreme case, but under real load waiting for the write to finish means waiting for slots that … — `docs/decision-answers-5.md:63`
4. `G` **Categorical success and failure predictions exceed the approved best-effort bounded delivery contract.** — So: waiting for the in-flight write to finish makes the message actually land in the ordinary case, and cannot save it in the pathological ones. — `docs/decision-answers-5.md:67`
5. `P` **Post-drain detach rejection and AggregateError contract remain unapproved despite the historical implementation.** — The one remaining red in the suite was this same area, in the test rather than the code: when this cancellation happens `detach()` *rejects* (wrapped as `AggregateError("Could not fully stop existing … — `docs/decision-answers-5.md:92`

**→ `docs/specs/sessions.md#creation-failure-and-recovery`** — 1 statement(s)

1. `P` **Critical failure cleanup is settled but selection change alone as an abort trigger is not approved.** — - **a launch that gets aborted** (task deleted or selection changed while the agent is starting) — `docs/decision-answers-5.md:35`

**→ `docs/specs/session-interaction-and-feedback.md#session-interaction-and-feedback`** — 1 statement(s)

1. `G` **Historical visibility defect needs verification and exact post-close failure presentation is not settled.** — The app barely tells you this happened — it surfaces as an error notice / a stderr line, not something you would reliably see. Losing a message you typed while being told almost nothing about it is … — `docs/decision-answers-5.md:72`

## G5 · Decision answer sheet 6 — why the disk filled, and the three things that still need your word

**Document:** `docs/decision-answers-6.md` · **8 statements** — 5 P · 3 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ _no owning contract — retire, or escalate as a new decision_** — 3 statement(s)

1. `G` **Idle-database prerequisite is an operational safety gate whose future applicability and retirement are not verified here.** — Compacting it needs the file to be idle, and the program holding it open is the one we are talking through. So it has to happen with opencode closed — the command is at the bottom. You get roughly 6 … — `docs/decision-answers-6.md:59`
2. `G` **External-database maintenance command includes an idle-process safety prerequisite and future reuse is not verified.** — ``` — `docs/decision-answers-6.md:157`
3. `G` **Sufficient-free-space prerequisite is a safety gate whose numerical applicability must be rechecked before reuse.** — Returns roughly 6 GB. Needs ~12.5 GB free while it runs (you have 30 GiB). — `docs/decision-answers-6.md:161`

**→ `docs/CONVENTIONS.md#tooling-and-validation`** — 2 statement(s)

1. `P` **Option A's CI-only assurance wording was deferred and requires evidence of exact packaging coverage.** — **The question.** Add one clarifying line about packaged behaviour being checked in CI, or leave the file alone? **A** add it · **B** leave it · **C** you will handle this file. — `docs/decision-answers-6.md:142`
2. `P` **Owner withheld a decision on the proposed documentation sentence and later explicitly deferred it.** — **Answer:** I don't know, you keep referencing item 2 but I need follow-up — `docs/decision-answers-6.md:147`

**→ `docs/CONVENTIONS.md#documentation-maintenance`** — 2 statement(s)

1. `P` **Option B's leave-alone disposition was not selected.** — **The question.** Add one clarifying line about packaged behaviour being checked in CI, or leave the file alone? **A** add it · **B** leave it · **C** you will handle this file. — `docs/decision-answers-6.md:143`
2. `P` **Option C's ownership handoff was not selected.** — **The question.** Add one clarifying line about packaged behaviour being checked in CI, or leave the file alone? **A** add it · **B** leave it · **C** you will handle this file. — `docs/decision-answers-6.md:144`

**→ `docs/specs/tasks.md#using-task-artifacts`** — 1 statement(s)

1. `P` **Missed-notification recovery guarantee remains unapproved and sheet 8 explicitly selects no periodic recheck.** — **How it notices today.** It does not compare contents. It asks the operating system to tell it "this file changed" and reloads when it is told. That works, with a known hole: the system is allowed … — `docs/decision-answers-6.md:79`

## G6 · Decision answer sheet 7 — your follow-ups, answered with the code open

**Document:** `docs/decision-answers-7.md` · **7 statements** — 4 P · 3 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/CONVENTIONS.md#tooling-and-validation`** — 3 statement(s)

1. `P` **Exact CI coverage statement remains deferred by the owner.** — - **A** — add one line stating that packaged behaviour is checked in CI (keeps the claim precise about where the guarantee lives). — `docs/decision-answers-7.md:162`
2. `P` **Explicit deferral leaves the proposed packaged-coverage sentence undecided.** — After we settle on everything else, remind me about this again and we'll decide on the correct approach. — `docs/decision-answers-7.md:174`
3. `P` **Documentation sentence remains explicitly deferred.** — 3. Item 3: **A**, **B**, **C**. — `docs/decision-answers-7.md:184`

**→ `docs/CONVENTIONS.md#testing`** — 2 statement(s)

1. `P` **Owner chose this local binary-check proposal but sheet 8 later asserted CI-only suffices without a clear owner answer to that change.** — - **A** — convert the app-logic CLI suites to the in-process entry, keep the process-boundary suites spawning, and keep one or two compiled-binary e2e checks (either surface CI's existing smoke test … — `docs/decision-answers-7.md:139`
2. `G` **This A choice includes a small local binary check whose later CI-only disposition lacks an explicit resolution.** — I choose A of course. This is what should happen. Also, please send oracle to examine the "process-boundary suites" and see whether they must stay in the spawned process mechanism or we could have … — `docs/decision-answers-7.md:149`

**→ `docs/CONVENTIONS.md#documentation-maintenance`** — 2 statement(s)

1. `G` **No permanent leave-alone decision was selected.** — - **B** — leave the file alone. — `docs/decision-answers-7.md:164`
2. `G` **No ownership handoff was selected.** — - **C** — you will handle this file. — `docs/decision-answers-7.md:166`

## G7 · Decision answer sheet 8

**Document:** `docs/decision-answers-8.md` · **13 statements** — 5 P · 8 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/CONVENTIONS.md#testing`** — 6 statement(s)

1. `P` **Predicted elimination of flakiness without coverage loss requires verification and is not proved by the recommendation.** — This removes the flakiness without weakening real coverage, and stops an integration test from asserting an OS side-effect. — `docs/decision-answers-8.md:71`
2. `G` **Small binary check approval conflicts with the later assistant-only assertion that no local binary suite is needed.** — You chose **A**: convert the app-logic CLI suites to the in-process entry, keep the process-boundary suites spawning, keep a small compiled-binary e2e check. — `docs/decision-answers-8.md:91`
3. `G` **Repeated A does not resolve the later local binary-check versus CI-only conflict.** — **Your answer:** _A (given)_ — `docs/decision-answers-8.md:105`
4. `P` **CI-only packaging recommendation is not explicitly reconciled with the owner's earlier choice of a small local binary check.** — Oracle's answer: **not mandatory** in the ordinary local suite, given CI builds and smoke-tests the release. Real pipes, signals, PTYs, tmux and event-loop exit are all testable with source … — `docs/decision-answers-8.md:164`
5. `G` **Owner asks for the binary-test action disposition rather than explicitly approving removal of the earlier local-check requirement.** — **Answer**: I approve the conversion plan (oracle's recommendation) + regarding "Local compiled-binary e2e tests" is there any action item for this? Or this stays like that? — `docs/decision-answers-8.md:172`
6. `G` **Assistant reconciliation does not demonstrate owner approval to replace the earlier local binary-check choice with CI-only coverage.** — Oracle's answer was "not mandatory", and your item-2 choice of A said "keep a small compiled-binary e2e check". Reconciling the two: **no new local binary suite is needed.** CI already builds the … — `docs/decision-answers-8.md:218`

**→ _no owning contract — retire, or escalate as a new decision_** — 2 statement(s)

1. `G` **Commands may preserve timestamps but this statement does not establish unchanged size and the archive flag claim needs verification.** — - Copying over an existing file with `cp -p`, `rsync -a`, or extracting a `tar -p` archive — all of these preserve size and mtime. — `docs/decision-answers-8.md:36`
2. `G` **Equal byte length alone does not imply preserved modification time so this example does not establish the combined scenario.** — - Overwriting a file with content of the exact same byte length (e.g. changing one character in a fixed-width line). — `docs/decision-answers-8.md:40`

**→ `docs/CONVENTIONS.md#tooling-and-validation`** — 2 statement(s)

1. `P` **Exact packaged-coverage wording in AGENTS remains deferred.** — Deferred at your request. I will raise it again once everything else is settled. — `docs/decision-answers-8.md:179`
2. `P` **Proposed AGENTS packaging-coverage sentence remains undecided.** — - **Item 3** — deferred; raised again once the rest has landed. — `docs/decision-answers-8.md:213`

**→ `docs/SPEC.md#feature-contracts`** — 1 statement(s)

1. `G` **Continued applicability of the no-editor assertion depends on the approved setup behavior and is not fully specified here.** — | `cli-init-cursor-pty` | **could-be-in-process** | It sends no interactive input at all. Keep its "no editor opened" assertion. | — `docs/decision-answers-8.md:119`

**→ `docs/screens/board.md#states-and-focus`** — 1 statement(s)

1. `P` **Board contract explicitly treats source-observed keybindings as candidates and does not approve this exact E interaction.** — - `tui-interactive-editor-handoff.test.ts` still expects `E` to launch an **external** editor, but today's board opens an **internal** task form (`workspace-controller.ts:2599`). That one case and … — `docs/decision-answers-8.md:144`

**→ `docs/architecture/session-harness.md#runningexecution`** — 1 statement(s)

1. `G` **Remaining queued-input disposition and failure-visibility details are not settled by approval to finish already in-flight writes.** — The scenario: you type into an agent (or a queued message is on its way), then **close the workspace** or **delete the task** while that input has not yet landed. Today the app does not drain … — `docs/decision-answers-8.md:187`

## G8 · Decision answer sheet 9

**Document:** `docs/decision-answers-9.md` · **1 statements** — 0 P · 1 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/CONVENTIONS.md#testing`** — 1 statement(s)

1. `G` **Close-first teardown coverage at the named call sites is a safety gate whose satisfaction is not demonstrated by this unanswered sheet.** — - **A (recommended)** — tests own their teardown; keep a thin wrapper (one process per file, run-scoped `TMPDIR`, cleared env, unique test tmux socket, deadline, bounded lanes) + narrow emergency … — `docs/decision-answers-9.md:29`

## G9 · Decision answer sheet — Backlog.md

**Document:** `docs/decision-answers.md` · **17 statements** — 3 P · 14 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/specs/tasks.md#tasks-and-storage`** — 5 statement(s)

1. `G` **Current support and configuration of zeroPaddedIds are not settled by approval of literal identity alone.** — **What's going on.** `zeroPaddedIds` is a supported, documented feature, so `TASK-01` is a legitimate id form. But logical equality strips padding, so `task-1/` and `task-01/` are both valid … — `docs/decision-answers.md:146`
2. `G` **Conditional retirement of padded IDs is not an approved decision to remove them.** — **Recommended: A.** An alias rule is the same category as the flat-record compatibility already removed — permanent code carrying an old format. If padded ids should be retired, that is a one-time … — `docs/decision-answers.md:160`
3. `G` **Dependency ambiguity under genuine duplicate whole-string identities remains an unverified coverage finding.** — **Three gaps that lost coverage.** While the cross-branch scenarios were being resolved they were **deleted** (canonical layout could not express their intent), so nothing now asserts them, and the … — `docs/decision-answers.md:244`
4. `G` **Duplicate-ID task_view rejection finding needs current-contract verification rather than promotion from historical fixtures.** — **Three gaps that lost coverage.** While the cross-branch scenarios were being resolved they were **deleted** (canonical layout could not express their intent), so nothing now asserts them, and the … — `docs/decision-answers.md:245`
5. `G` **NUL-suffixed path finding has no established cause or disposition.** — **Three gaps that lost coverage.** While the cross-branch scenarios were being resolved they were **deleted** (canonical layout could not express their intent), so nothing now asserts them, and the … — `docs/decision-answers.md:246`

**→ _no owning contract — retire, or escalate as a new decision_** — 3 statement(s)

1. `G` **Current-only behavior disallows permanent legacy compatibility without approval.** — **Answer:** Delete the repair feature entirely. Also, please tell me what the doctor actually does. It might not be necessary anymore. As per our rule - no migration or legacy code should be written. … — `docs/decision-answers.md:57`
2. `P` **Current-only policy excludes unapproved compatibility alias behavior.** — **Recommended: A.** An alias rule is the same category as the flat-record compatibility already removed — permanent code carrying an old format. If padded ids should be retired, that is a one-time … — `docs/decision-answers.md:159`
3. `G` **Tests are implementation evidence and cannot override approved intent.** — **Answer:** I'll say that once and hopefully it sticks - tests do not dictate behavior, spec does. If tests do not align with the spec it's a test misalignment issue and needs to be fixed. In regards … — `docs/decision-answers.md:190`

**→ `docs/BLUEPRINT.md#durable-conversation-and-operation-records`** — 3 statement(s)

1. `G` **Exact durable receipt representation still requires recovery evidence and is not prescribed by the current contract.** — - **I — Bounded first slice** (oracle's recommendation): adapters take `{kind:"new"} | {kind:"resume", nativeSessionId}` and return confirmed-or-client-established identity; adapters own proposed ids … — `docs/decision-answers.md:82`
2. `G` **Removing recovery transport requires proof that required interrupted-startup evidence survives.** — - **II — Full end state**, also deleting durable receipt transport. Not honest yet: nothing verified replaces its recovery function. — `docs/decision-answers.md:85`
3. `G` **User requests verification of receipt necessity rather than approving its unconditional deletion.** — **Answer:** Yes, I is the correct approach. But in addition, let's verify that we actually need the durable receipt transport. I imagined it like — `docs/decision-answers.md:97`

**→ `docs/architecture/session-harness.md#runningexecution`** — 3 statement(s)

1. `G` **Exact queued-versus-in-flight cancellation and detach error-channel behavior are not fixed by core.** — Scenario: the test saturates the executor slots, queues input, then detaches before that queued input dispatches. Detach reports "Input transport stopped while input delivery was in flight; delivery … — `docs/decision-answers.md:229`
2. `G` **No answer approves this particular error-channel split.** — - **A — Resolve detach; report the uncertainty on the input error channel.** Matches the test's two-channel intent and the existing cancellation semantics. **Recommended.** — `docs/decision-answers.md:232`
3. `G` **Source behavior and later bounded drain do not settle detach rejection after failed delivery.** — - **B — Reject detach with the uncertainty**, so a detach with pending input cannot be mistaken for a clean one; update the test to assert the rejection and drop its success expectation. — `docs/decision-answers.md:234`

**→ `docs/CONVENTIONS.md#testing`** — 2 statement(s)

1. `P` **Unanswered recommendation would change coverage and cannot be inferred approved.** — - **C — Make the fixture avoid pending input at detach** (wait for the input to finish first). Only correct if the test is about detach mechanics rather than the in-flight-input contract. — `docs/decision-answers.md:236`
2. `P` **Raising deadlines instead of investigating hangs was not approved and requires a coverage justification.** — **A wider pattern worth knowing before you answer.** Five files now fail on **time**, not behaviour: the two above, plus `src/test/opentui-workspace-controller.test.ts` (a 5s `waitUntil` deadline … — `docs/decision-answers.md:264`

**→ `docs/specs/sessions.md#observe-and-detach-from-a-live-session`** — 1 statement(s)

1. `G` **Sheet 8 approves a bounded drain but does not settle detach promise resolution versus the input-error channel.** — **B4 — when input is in flight, should `detach()` resolve or reject?** — `docs/decision-answers.md:226`

## G10 · Follow-up questionnaire — round 2

**Document:** `docs/questionnaire-02.md` · **98 statements** — 34 P · 64 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/specs/supported-integration-operations.md#supported-integration-operations`** — 35 statement(s)

1. `G` **Removal of a distinct public park action has no answer even though parked lifecycle storage is superseded.** — **Question:** Is “park” a distinct user action we need to keep? — `docs/questionnaire-02.md:72`
2. `P` **Proposed removal of the park action/name is unanswered.** — **Recommendation:** No. Stop the execution while retaining the conversation; offer resume when that conversation can be resumed. Avoid a second name for the same behavior. — `docs/questionnaire-02.md:73`
3. `G` **Core has a selective baseline and explicitly leaves the remaining inventory undecided.** — **Question:** Which command families belong in the product? — `docs/questionnaire-02.md:188`
4. `G` **Exact setup command removal is unanswered in questionnaire 6.** — | `init` | Initialize a project. | | — `docs/questionnaire-02.md:194`
5. `G` **Remaining task-family command entry points are not blanket-approved by retained TUI features.** — | `task create/list/edit/view/archive/complete/demote` | Manage tasks, including demotion to drafts. | | — `docs/questionnaire-02.md:195`
6. `G` **Exact milestone command entry points remain in the unsettled API inventory.** — | `milestone list/add/rename/remove/archive` | Manage milestones. | | — `docs/questionnaire-02.md:199`
7. `P` **Exact board CLI entry points are not accepted by TUI view retention.** — | `board`, `board view`, `board export` | View a board and export Markdown. | | — `docs/questionnaire-02.md:200`
8. `G` **Broad configuration API retention is unanswered in questionnaire 6.** — | `config`, `config get/set/list` | Edit or inspect general settings. | | — `docs/questionnaire-02.md:203`
9. `G` **Broad agent-config API retention remains unanswered.** — | `agent-config show/init/set`, `agent-config model set` | Edit or inspect agent settings. | | — `docs/questionnaire-02.md:204`
10. `G` **This blank inventory row does not settle the exact command name.** — | `workspace` | Open the interactive workspace. | | — `docs/questionnaire-02.md:205`
11. `G` **Additional exact session command entry points remain inventory rather than blanket approval.** — | `agent-session list/start/stop/attach/delete` | Manage and attach to task sessions. | | — `docs/questionnaire-02.md:206`
12. `G` **This blank row does not approve exact handoff CLI syntax.** — | `agent-session handoff` | Start a successor before retiring its predecessor. | | — `docs/questionnaire-02.md:208`
13. `P` **A distinct cleanup CLI surface and eligibility are not accepted by the completion contract.** — | `cleanup` | Move eligible completed tasks into completed storage. | | — `docs/questionnaire-02.md:210`
14. `G` **Guidance editing command retention remains unanswered.** — | `agents`, `agents --update-instructions` | Inspect or update workspace guidance in agent instruction files. | | — `docs/questionnaire-02.md:211`
15. `G` **Printable guidance entry points remain undecided.** — | `skill`, `instructions`, `instructions --list` | Print agent-facing skills and workflow guides. | | — `docs/questionnaire-02.md:212`
16. `G` **Shell-completion retention remains unanswered.** — | `completion install`, `completion __complete` | Install shell completion and supply completion suggestions. | | — `docs/questionnaire-02.md:213`
17. `G` **MCP retention is conditional and unanswered.** — | `mcp start` | Expose workspace operations to tools through an MCP server. | | — `docs/questionnaire-02.md:214`
18. `G` **Blank command-help inventory row has no explicit core API acceptance.** — | `help` | Show general or command-specific help. | | — `docs/questionnaire-02.md:215`
19. `G` **Alias retention or removal is unanswered in questionnaire 6.** — | `tasks`, `milestones` aliases | Allow plural alternatives to `task` and `milestone`. | | — `docs/questionnaire-02.md:216`
20. `G` **Bare task command semantics are unanswered.** — **Question:** What should `task`, `task <id>`, `draft`, and `draft <id>` do? — `docs/questionnaire-02.md:220`
21. `G` **Implicit task list/view and no implicit mutation policy are unanswered.** — **Recommendation:** With no ID, list records; with an ID, display that record. Never create or edit implicitly. Make bare `board` display the board. — `docs/questionnaire-02.md:221`
22. `G` **Bare board command behavior is unanswered.** — **Recommendation:** With no ID, list records; with an ID, display that record. Never create or edit implicitly. Make bare `board` display the board. — `docs/questionnaire-02.md:221`
23. `P` **CLI target disambiguation UX has no accepted answer.** — **Question:** What should a session command do when its target is ambiguous? — `docs/questionnaire-02.md:226`
24. `P` **Specific required CLI target syntax is unanswered despite settled internal identity validation.** — **Recommendation:** Require an explicit mode or session when multiple targets fit. Do not guess which agent to stop, delete, attach to, or question. — `docs/questionnaire-02.md:227`
25. `G` **Showing attach guidance after ask is unanswered.** — **Recommendation:** Require explicit agreement to resume a stopped conversation. If resumed, send the question to that exact conversation and show how to attach; do not invent a stored-output … — `docs/questionnaire-02.md:233`
26. `G` **Distinct cleanup command scope is unanswered and must not redefine the accepted completion operation.** — **Question:** Should `cleanup` only move completed task records, or also delete branches, worktrees, and session history? — `docs/questionnaire-02.md:249`
27. `G` **Record-only cleanup and running-agent exclusion are unanswered for any distinct cleanup API.** — **Recommendation:** Move completed records only, skipping tasks with running agents. Keep destructive removal as a separate explicit action. — `docs/questionnaire-02.md:250`
28. `G` **Retention and public managed-file mutation policy remain unanswered.** — **Question:** What modification boundary should these commands follow? — `docs/questionnaire-02.md:255`
29. `P` **Preview, confirmation and managed-section product behavior is unapproved and must not be inferred from contributor preservation rules.** — **Recommendation:** Show the target files and proposed edits first. Change only an explicitly managed section after confirmation; preserve all unrelated content. — `docs/questionnaire-02.md:256`
30. `G` **Noninteractive API behavior remains unanswered.** — **Question:** How should commands behave when no interactive terminal is available? — `docs/questionnaire-02.md:261`
31. `P` **Noninteractive success/failure and no-prompt behavior is unapproved.** — **Recommendation:** Accept complete explicit inputs, otherwise fail with a clear message. Never wait for a prompt, infer destructive consent, or launch an interactive screen. — `docs/questionnaire-02.md:262`
32. `G` **General CLI output contract remains unanswered.** — **Question:** What common output contract should commands follow? — `docs/questionnaire-02.md:272`
33. `P` **Common stdout/stderr separation proposal is unanswered.** — **Recommendation:** Put results on standard output and diagnostics on standard error. Return zero only for complete success and nonzero for errors, cancellation, or partial failure. Offer documented … — `docs/questionnaire-02.md:273`
34. `G` **Exit status for errors, cancellation and partial failure has no answer.** — **Recommendation:** Put results on standard output and diagnostics on standard error. Return zero only for complete success and nonzero for errors, cancellation, or partial failure. Offer documented … — `docs/questionnaire-02.md:273`
35. `P` **Blanket data-command JSON and screen exclusion are unapproved despite search-specific JSON acceptance.** — **Recommendation:** Put results on standard output and diagnostics on standard error. Return zero only for complete success and nonzero for errors, cancellation, or partial failure. Offer documented … — `docs/questionnaire-02.md:273`

**→ `docs/specs/configuration.md#configuration-and-modes`** — 10 statement(s)

1. `G` **Core does not specify nested-object or list merge semantics.** — **Context:** Root and project settings already merge field by field; collections need a precise rule. — `docs/questionnaire-02.md:33`
2. `G` **Answer establishes precedence but does not choose deep merge, preset-name merge or list policy.** — **Question:** How should nested settings, named presets, and lists combine? — `docs/questionnaire-02.md:34`
3. `P` **Nested-object and named-preset merging were not specifically accepted.** — **Recommendation:** Merge objects and presets by name, keeping unspecified inherited fields. Replace lists as a whole rather than combining their items. — `docs/questionnaire-02.md:35`
4. `P` **Whole-list replacement was not specifically accepted.** — **Recommendation:** Merge objects and presets by name, keeping unspecified inherited fields. Replace lists as a whole rather than combining their items. — `docs/questionnaire-02.md:35`
5. `P` **User questions nullable fields and no concrete clearable field or clearing policy is approved.** — **Question:** How should a project explicitly remove an inherited optional setting? — `docs/questionnaire-02.md:50`
6. `G` **Null-clearing and required-field clearing policy have no accepted answer.** — **Recommendation:** Use `null` to clear it; an omitted field continues to inherit. Reject clearing a setting that is required to run. — `docs/questionnaire-02.md:51`
7. `G` **Nullable-field applicability is a factual clarification request rather than approval of null clearing.** — Why are you asking this? Is there a field that is nullable in our config? I don't think so. — `docs/questionnaire-02.md:53`
8. `G` **Tentative field-type question is not an approved exhaustive configuration schema.** — All fields are either booleans or text. no? — `docs/questionnaire-02.md:54`
9. `P` **User challenges this premise and does not decide private task-mode policy.** — **Question:** May tasks add their own modes, or must all tasks use the project's effective catalogue? — `docs/questionnaire-02.md:65`
10. `P` **Root catalogue inheritance and the specific private-mode prohibition were not approved by this answer.** — **Recommendation:** Use one project catalogue, which may inherit root definitions. Task overrides may change agent settings, not introduce private modes. — `docs/questionnaire-02.md:66`

**→ `docs/specs/filtering-and-search.md#filtering-and-search`** — 8 statement(s)

1. `G` **Exact multi-value filter support and matching details are not settled by general filtering approval.** — **Context:** A search can include several statuses, priorities, or record types. — `docs/questionnaire-02.md:147`
2. `G` **Core explicitly leaves filter combinations undecided.** — **Question:** How should multiple filter values combine? — `docs/questionnaire-02.md:148`
3. `P` **OR-within and AND-across recommendation is unanswered.** — **Recommendation:** Match any selected value within one filter, and require a match across different filters. For example, status A or B, together with priority High. — `docs/questionnaire-02.md:149`
4. `G` **Record families are approved but exact searchable fields and matching details are not.** — **Question:** Which content should text search cover? — `docs/questionnaire-02.md:153`
5. `P` **Proposed field/body coverage has no answer.** — **Recommendation:** Record IDs, titles, descriptions, and document/decision bodies. Do not search terminal output or provider conversation storage. — `docs/questionnaire-02.md:154`
6. `P` **Specific provider-conversation search exclusion is not answered.** — **Recommendation:** Record IDs, titles, descriptions, and document/decision bodies. Do not search terminal output or provider conversation storage. — `docs/questionnaire-02.md:154`
7. `P` **Search default inclusion policy is not approved.** — **Question:** Should completed and archived records appear in search by default? — `docs/questionnaire-02.md:158`
8. `P` **Default completed inclusion and archived opt-in are unanswered proposals.** — **Recommendation:** Include completed records, but require an explicit option to include archived records. — `docs/questionnaire-02.md:159`

**→ `docs/specs/tasks.md#managing-milestones`** — 6 statement(s)

1. `G` **Archive assignment policy is not specified by milestone operation retention.** — **Context:** Tasks may still refer to a milestone after it is no longer active. — `docs/questionnaire-02.md:163`
2. `G` **Archive assignment behavior remains unanswered.** — **Question:** What should happen to those task assignments? — `docs/questionnaire-02.md:164`
3. `P` **Archive preservation recommendation has no explicit accepted answer.** — **Recommendation:** Archiving keeps the assignments for history. Removing clears the assignments without deleting tasks. Renaming preserves the assignments. — `docs/questionnaire-02.md:165`
4. `G` **Retained completion percentages do not specify their calculation.** — **Question:** How should milestone progress be calculated? — `docs/questionnaire-02.md:169`
5. `G` **Exact numerator/denominator and equal weighting are unanswered.** — **Recommendation:** Completed assigned tasks divided by all assigned tasks, with every task weighted equally. A milestone with no tasks shows “No tasks,” not a completion percentage. — `docs/questionnaire-02.md:170`
6. `G` **Empty milestone display is unanswered.** — **Recommendation:** Completed assigned tasks divided by all assigned tasks, with every task weighted equally. A milestone with no tasks shows “No tasks,” not a completion percentage. — `docs/questionnaire-02.md:170`

**→ `docs/specs/tasks.md#launching-work-and-completing-a-task`** — 5 statement(s)

1. `G` **Collision scenario lacks an approved user-visible outcome.** — **Context:** The desired name might already belong to other work. — `docs/questionnaire-02.md:115`
2. `G` **Existing-name reuse/failure policy has no answer.** — **Question:** What should happen when a task's branch or worktree name is already taken? — `docs/questionnaire-02.md:116`
3. `P` **Specific collision reuse and failure policy remains an unanswered recommendation.** — **Recommendation:** Reuse it only when it is verifiably owned by that task. Otherwise stop with an explanation; never overwrite or adopt unrelated work. — `docs/questionnaire-02.md:117`
4. `P` **Core expressly leaves completion branch-removal policy unapproved.** — **Question:** Should marking a task complete remove its branch or worktree? — `docs/questionnaire-02.md:122`
5. `G` **Completion branch retention and unmerged-commit policy are not settled.** — **Recommendation:** No. Keep both until an explicit cleanup or deletion operation, including uncommitted work and unmerged commits. — `docs/questionnaire-02.md:123`

**→ `docs/specs/configuration.md#delete-a-mode`** — 5 statement(s)

1. `G` **Cross-task extent remains explicitly open.** — **Question:** Should that deletion apply across every task using the project's mode catalogue? — `docs/questionnaire-02.md:134`
2. `P` **Cross-task deletion recommendation has no answer.** — **Recommendation:** Yes. Before proceeding, require a replacement if it is the default mode; refuse to remove the last mode. Affected views switch to the remaining default. — `docs/questionnaire-02.md:135`
3. `G` **Default-mode replacement requirement remains open.** — **Recommendation:** Yes. Before proceeding, require a replacement if it is the default mode; refuse to remove the last mode. Affected views switch to the remaining default. — `docs/questionnaire-02.md:135`
4. `G` **Last-mode refusal policy remains open.** — **Recommendation:** Yes. Before proceeding, require a replacement if it is the default mode; refuse to remove the last mode. Affected views switch to the remaining default. — `docs/questionnaire-02.md:135`
5. `P` **Remaining-default view switching is unapproved.** — **Recommendation:** Yes. Before proceeding, require a replacement if it is the default mode; refuse to remove the last mode. Affected views switch to the remaining default. — `docs/questionnaire-02.md:135`

**→ `docs/specs/sessions.md#deleting-a-session`** — 4 statement(s)

1. `G` **Provider-owned file scope is explicitly unresolved.** — **Context:** Deleting a session can mean removing workspace records or also deleting the provider's conversation data. — `docs/questionnaire-02.md:139`
2. `G` **Provider conversation deletion has no accepted policy.** — **Question:** Should session deletion erase the provider's saved conversation too? — `docs/questionnaire-02.md:140`
3. `P` **Provider-storage preservation is an unanswered proposal rather than approved deletion scope.** — **Recommendation:** No. Remove workspace-owned session records and resources only; leave provider-owned conversation storage untouched. — `docs/questionnaire-02.md:141`
4. `G` **Cross-operation force scope is unanswered beyond the settled kill-before-session-removal behavior.** — **Recommendation:** Confirm actions that kill agents or discard files, branches, or history, with the affected items stated. Scripts must provide deliberate consent. A force option may authorize … — `docs/questionnaire-02.md:267`

**→ `docs/specs/tasks.md#requirements`** — 4 statement(s)

1. `G` **Noninteractive destructive consent remains explicitly open.** — **Recommendation:** Accept complete explicit inputs, otherwise fail with a clear message. Never wait for a prompt, infer destructive consent, or launch an interactive screen. — `docs/questionnaire-02.md:262`
2. `G` **Cross-operation confirmation policy is unanswered beyond already approved specific behavior.** — **Question:** Which actions require explicit confirmation? — `docs/questionnaire-02.md:266`
3. `P` **Blanket destructive confirmation rule is not approved.** — **Recommendation:** Confirm actions that kill agents or discard files, branches, or history, with the affected items stated. Scripts must provide deliberate consent. A force option may authorize … — `docs/questionnaire-02.md:267`
4. `G` **Script consent rule remains open.** — **Recommendation:** Confirm actions that kill agents or discard files, branches, or history, with the affected items stated. Scripts must provide deliberate consent. A force option may authorize … — `docs/questionnaire-02.md:267`

**→ `docs/PRODUCT.md#open-product-decisions`** — 4 statement(s)

1. `G` **No approved environment or provider-support matrix is supplied.** — **Question:** Which operating systems, shells, and agent providers must we support? — `docs/questionnaire-02.md:279`
2. `G` **Support-set selection is unanswered and advertised integrations are not guarantees.** — **Recommendation:** State a small explicit supported set. I will verify installation and runtime-version requirements against that set rather than treating every advertised integration as guaranteed. — `docs/questionnaire-02.md:280`
3. `P` **Scale and response-time targets have no answer.** — **Question:** What task/session counts and responsiveness must the product handle acceptably? — `docs/questionnaire-02.md:284`
4. `P` **No approved scale/performance acceptance targets are provided.** — **Recommendation:** Give your expected largest project and any delays you consider unacceptable. Use those as test targets rather than inventing performance guarantees. — `docs/questionnaire-02.md:285`

**→ _no owning contract — retire, or escalate as a new decision_** — 3 statement(s)

1. `G` **Accepted decisions remain authoritative while unresolved inventory does not approve behavior.** — These are the remaining decisions identified so far, not a claim that every requirement is settled. Previous answers remain in effect. — `docs/questionnaire-02.md:19`
2. `P` **Unanswered recommendations are not approval.** — Answer **Yes** to accept a recommendation, or write your preferred behavior. **Unsure** is useful too. Blank answers approve nothing. Each question is self-contained; no other document needs to be … — `docs/questionnaire-02.md:21`
3. `G` **Approval and implementation verification remain distinct.** — Answers establish desired behavior, not proof that it is implemented. Exact command options and technical details still require agent verification; any remaining product choices will go into a new … — `docs/questionnaire-02.md:300`

**→ `docs/specs/configuration.md#edit-agent-settings`** — 3 statement(s)

1. `G` **Provider capability applicability requires evidence and core does not enumerate restriction support.** — **Context:** Some agents may not support a requested tool or permission restriction. — `docs/questionnaire-02.md:89`
2. `G` **Launch failure for unsupported requested enforcement is unanswered.** — **Question:** Should launch fail when the selected provider cannot enforce a requested restriction? — `docs/questionnaire-02.md:90`
3. `P` **Failure policy is unapproved and later retention of truthful instruction-only settings does not settle it.** — **Recommendation:** Yes, with an explanation. Do not silently replace enforcement with instructions asking the agent to comply. — `docs/questionnaire-02.md:91`

**→ `docs/screens/workspace.md#focus-and-constrained-terminals`** — 3 statement(s)

1. `G` **Exact minimum dimensions and broader accessibility guarantees remain undecided.** — **Question:** What terminal-size and accessibility guarantees are essential? — `docs/questionnaire-02.md:289`
2. `G` **General reflow and too-small notice policy is unanswered beyond task-region shrinking.** — **Recommendation:** Require keyboard access and readable status text so color is never the only signal. Reflow where possible and show a clear notice when the terminal is too small. Please name any … — `docs/questionnaire-02.md:290`
3. `P` **Screen-reader support and minimum size are not approved.** — **Recommendation:** Require keyboard access and readable status text so color is never the only signal. Reflow where possible and show a clear notice when the terminal is too small. Please name any … — `docs/questionnaire-02.md:290`

**→ `docs/BLUEPRINT.md#open-design-decisions`** — 2 statement(s)

1. `G` **Automatic ask-resume consent is explicitly unsettled.** — **Question:** Should `agent-session ask` resume that conversation automatically? — `docs/questionnaire-02.md:232`
2. `G` **Resume consent policy is unanswered.** — **Recommendation:** Require explicit agreement to resume a stopped conversation. If resumed, send the question to that exact conversation and show how to attach; do not invent a stored-output … — `docs/questionnaire-02.md:233`

**→ `docs/specs/tasks.md#using-task-artifacts`** — 2 statement(s)

1. `G` **Generic replacement writes are accepted later but exact overwrite-consent UX is not specified.** — **Question:** Should these commands overwrite existing files automatically? — `docs/questionnaire-02.md:244`
2. `G` **Extra artifact overwrite confirmation has no answer.** — **Recommendation:** No. Require an explicit overwrite choice. A board export without a filename prints Markdown instead of choosing a file to replace. — `docs/questionnaire-02.md:245`

**→ `docs/specs/sessions.md#observe-and-detach-from-a-live-session`** — 1 statement(s)

1. `P` **Reopening auto-resume policy is not answered and client survival alone does not decide it.** — **Question:** Should reopening the workspace also restart stopped agents automatically? — `docs/questionnaire-02.md:78`

**→ `docs/specs/sessions.md#stop-and-resume-a-session`** — 1 statement(s)

1. `P` **Blanket no-auto-resume-on-reopen recommendation is unanswered.** — **Recommendation:** No. Reconnect to existing executions, but require an explicit resume action for stopped ones. — `docs/questionnaire-02.md:79`

**→ `docs/specs/workspace-and-board.md#workspace-and-board`** — 1 statement(s)

1. `P` **Cross-window view independence is not answered or specified by preference persistence.** — **Recommendation:** Remember the selected task and mode, filters, and collapsed groups per project. Keep open windows independent; saving a preference must not change another window's view. — `docs/questionnaire-02.md:85`

**→ `docs/SPEC.md#open-product-decisions`** — 1 statement(s)

1. `G` **Blank completeness check supplies no new approval or guarantee of complete coverage.** — **Question:** Is there a behavior above that should not exist, or an essential requirement we have missed? — `docs/questionnaire-02.md:295`

## G11 · Existing behavior — questionnaire 3

**Document:** `docs/questionnaire-03.md` · **2 statements** — 1 P · 1 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ _no owning contract — retire, or escalate as a new decision_** — 2 statement(s)

1. `G` **Source and installed help establish evidence rather than approval.** — These questions come from the corrected implementation audit. **Context** describes what source inspection found, or explicitly identifies a CLI-help claim. It does not mean that behavior is correct. — `docs/questionnaire-03.md:19`
2. `P` **Approved decisions remain authoritative and unanswered recommendations are not requirements.** — Answer **Yes** to accept a recommendation, or describe the behavior you want. You do not need to review another document. Earlier answers remain settled; unanswered questions from the previous … — `docs/questionnaire-03.md:21`

## G12 · Remaining existing features — questionnaire 5

**Document:** `docs/questionnaire-05.md` · **14 statements** — 3 P · 11 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/specs/supported-integration-operations.md#supported-integration-operations`** — 10 statement(s)

1. `G` **Answer addresses completion only and questionnaire 6 archive question remains blank.** — **Question:** Is archive intended specifically for abandoning unfinished work, with completed work going through completion instead? — `docs/questionnaire-05.md:41`
2. `P` **Archive retention and eligibility were not accepted by the answer.** — **Recommendation:** Retain that distinction. Archive canceled/duplicate/invalid tasks; use completion for finished work. — `docs/questionnaire-05.md:42`
3. `G` **Conditional answer does not establish benefit and questionnaire 6 remains unanswered.** — **Question:** Should MCP remain a supported way for agents to access the workspace? — `docs/questionnaire-05.md:87`
4. `G` **Optional MCP retention remains conditional rather than approved.** — **Recommendation:** Retain it as optional; ordinary task management must not require starting an MCP server. — `docs/questionnaire-05.md:88`
5. `G` **User requested explanation rather than approving either utility.** — **Question:** Do you want to keep both the printable guides and the optional instruction-file setup? — `docs/questionnaire-05.md:94`
6. `P` **Printable-guide retention is unapproved.** — **Recommendation:** Retain them as opt-in assistance, not mandatory workflows or permission to overwrite unrelated instructions. List either utility you want removed. — `docs/questionnaire-05.md:95`
7. `G` **Instruction-file editing retention and managed-write policy remain undecided.** — **Recommendation:** Retain them as opt-in assistance, not mandatory workflows or permission to overwrite unrelated instructions. List either utility you want removed. — `docs/questionnaire-05.md:95`
8. `G` **Clarification request is not acceptance and questionnaire 6 explanations have no retention answers.** — Not really sure what they do still. Is it just printable for the user to see? What does it print? On which use-case would a user want to use this? — `docs/questionnaire-05.md:97`
9. `G` **Answer settles selective API principles but not each command retention decision.** — **Question:** Which of these command conveniences should remain? — `docs/questionnaire-05.md:101`
10. `P` **Blanket retention is not approved and questionnaire 6 asks specific removals without answers.** — **Recommendation:** Retain the existing conveniences; list exceptions. This does not change the configuration precedence, storage behavior, or provider-independent model-setting behavior already … — `docs/questionnaire-05.md:102`

**→ _no owning contract — retire, or escalate as a new decision_** — 2 statement(s)

1. `G` **Approved contracts remain authoritative rather than being reopened by an inventory.** — The earlier decisions are settled. This batch groups the remaining existing capabilities instead of asking about each small behavior separately. — `docs/questionnaire-05.md:19`
2. `G` **Feature approval is distinct from implementation verification.** — Implementation details such as file locks, request ordering, and serialization are not product questions for you. I will place them in the appropriate architecture or conventions documentation, … — `docs/questionnaire-05.md:113`

**→ `docs/specs/tasks.md#tasks-and-storage`** — 1 statement(s)

1. `G` **Core lists editable fields but does not specify which are optional or required.** — **Recommendation:** Retain the existing fields and configurable statuses; list any fields you want removed. This does not make optional fields mandatory. — `docs/questionnaire-05.md:28`

**→ `docs/PRODUCT.md#open-product-decisions`** — 1 statement(s)

1. `G` **Conditional retention needs demonstrated benefit or an integration decision and no token saving is established.** — If the MCP helps us in some way, then yes, retain. If it just adds overhead, then let's remove it. If it helps with token usage when agent need to use the task management tools instead of using the … — `docs/questionnaire-05.md:90`

## G13 · Integration surface — questionnaire 6

**Document:** `docs/questionnaire-06.md` · **16 statements** — 10 P · 6 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/specs/supported-integration-operations.md#supported-integration-operations`** — 15 statement(s)

1. `G` **No answer supplies a concrete integration or approves MCP removal.** — **Question:** Do you have an integration that needs MCP, or should we remove it and use the CLI API? — `docs/questionnaire-06.md:33`
2. `P` **MCP removal recommendation has no answer and retention is explicitly undecided.** — **Recommendation:** Remove MCP unless you name a concrete client or workflow that benefits from it. Do not keep it on an unproven promise of token savings. — `docs/questionnaire-06.md:34`
3. `G` **Guidance retention remains unanswered.** — **Question:** Should the API retain an on-demand guidance command for agents? — `docs/questionnaire-06.md:39`
4. `P` **Retaining instructions is an unanswered API proposal.** — **Recommendation:** Retain `instructions` as concise API-use guidance, without prescribed plan/build/document workflows. Remove the separate `skill` entry point rather than maintain overlapping … — `docs/questionnaire-06.md:40`
5. `P` **Removing skill is an unanswered API proposal.** — **Recommendation:** Retain `instructions` as concise API-use guidance, without prescribed plan/build/document workflows. Remove the separate `skill` entry point rather than maintain overlapping … — `docs/questionnaire-06.md:40`
6. `G` **Instruction-file editing retention has no answer.** — **Question:** Should this instruction-file editing command remain? — `docs/questionnaire-06.md:45`
7. `P` **Specific removal and future-wizard disposition are unapproved.** — **Recommendation:** Remove it from the public CLI. It is an interactive setup convenience rather than a needed task API; any future setup assistance belongs in the TUI wizard. — `docs/questionnaire-06.md:46`
8. `G` **Exact setup and convenience removals await this unanswered question.** — **Question:** Should these setup/convenience entry points be removed? — `docs/questionnaire-06.md:51`
9. `P` **Removal of init and interactive config is not approved by this blank answer.** — **Recommendation:** Yes. Keep setup/settings in the TUI and one canonical command name per API operation. This does not remove task, milestone, or session operations themselves. — `docs/questionnaire-06.md:52`
10. `P` **Removal of shell completion is not approved.** — **Recommendation:** Yes. Keep setup/settings in the TUI and one canonical command name per API operation. This does not remove task, milestone, or session operations themselves. — `docs/questionnaire-06.md:52`
11. `P` **Removing plural aliases and requiring one canonical name remain unapproved.** — **Recommendation:** Yes. Keep setup/settings in the TUI and one canonical command name per API operation. This does not remove task, milestone, or session operations themselves. — `docs/questionnaire-06.md:52`
12. `G` **Broad configuration API retention remains unanswered.** — **Question:** Should external callers have these broad configuration APIs, or only the specific configuration operations with an identified integration need? — `docs/questionnaire-06.md:57`
13. `G` **Removing broad config and agent-config families has no approval.** — **Recommendation:** Keep the specific operations, including capturing the calling session's model. Remove the broad configuration command families unless you have a concrete external use for one; all … — `docs/questionnaire-06.md:58`
14. `P` **Archive retention was not answered in questionnaire 5 and remains blank here.** — **Question:** Should this separate archive operation remain for abandoned work? — `docs/questionnaire-06.md:63`
15. `P` **Separate archive retention and eligibility remain unapproved.** — **Recommendation:** Yes. Retain archive for unfinished work that will not be completed, and completion for finished work. — `docs/questionnaire-06.md:64`

**→ _no owning contract — retire, or escalate as a new decision_** — 1 statement(s)

1. `P` **Unanswered recommendations do not approve API features and implementation remains distinct from accepted requirements.** — These are decisions about existing entry points. No new API names, workflow restrictions, or features are implied. Accepted removals will be recorded as requirements; code changes remain a separate … — `docs/questionnaire-06.md:69`

## G14 · Questionnaire 7 — asking retained sessions

**Document:** `docs/questionnaire-07.md` · **7 statements** — 5 P · 2 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ _no owning contract — retire, or escalate as a new decision_** — 7 statement(s)

1. `P` **Eligibility option was not answered.** — - **A — Stopped only:** running sessions cannot be consulted through `ask`, even when idle. — `docs/questionnaire-07.md:24`
2. `P` **Eligibility option was not answered.** — - **B — Stopped or positively idle:** allow a running session known to be idle, but not one working or awaiting permission. — `docs/questionnaire-07.md:25`
3. `P` **Eligibility option was not answered.** — - **C — Also working sessions:** support asking during ongoing work; interruption versus queuing would need a separate decision. — `docs/questionnaire-07.md:26`
4. `G` **No selected eligibility rule was approved.** — Unknown activity is not evidence of idleness. This choice does not authorize interrupting work or bypassing a permission request. You may specify a different rule. — `docs/questionnaire-07.md:28`
5. `P` **Resume-consent option was not answered.** — - **A — Yes:** the explicit `ask` request authorizes starting the retained conversation to answer, using current effective configuration. — `docs/questionnaire-07.md:34`
6. `P` **Resume-consent option was not answered.** — - **B — Separate opt-in:** require explicit permission to resume before starting execution. Without it, explain what is needed rather than resuming automatically. — `docs/questionnaire-07.md:35`
7. `G` **Post-answer execution lifetime remains undecided.** — Either choice preserves the exact conversation identity and does not replay its initial prompt. Whether an execution started for `ask` stops after answering is a separate, unresolved lifetime … — `docs/questionnaire-07.md:37`

## G15 · Documentation consolidation questionnaire

**Document:** `docs/questionnaire.md` · **10 statements** — 3 P · 7 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ _no owning contract — retire, or escalate as a new decision_** — 7 statement(s)

1. `P` **Unanswered recommendations do not establish approval.** — - Use **Confirm**, **Change**, or **Reject**, with remarks. For a DEC question, **Confirm** accepts its recommendation. Leave `Answer:` blank until decided; unanswered items are **not approved**. — `docs/questionnaire.md:26`
2. `G` **Accepted behavior belongs in SPEC and its owning feature contracts while the ledger tracks unresolved decisions.** — - Promote accepted chat decisions about behavior into canonical `docs/SPEC.md` and remove their resolved questions from pending review. — `docs/questionnaire.md:28`
3. `G` **SPEC owns approved behavior.** — - Keep destinations distinct: **SPEC** defines required behavior; **ARCHITECTURE** describes verified current implementation; **ADRs** record significant architectural decisions and rationale. … — `docs/questionnaire.md:29`
4. `G` **Older design material is not a competing authority.** — **Recommendation:** Record significant accepted decisions and their rationale in ADRs, with links to affected SPEC requirements; put execution steps in task records. Add claims to ARCHITECTURE only … — `docs/questionnaire.md:38`
5. `G` **Approved owning contracts are authoritative and source drift does not redefine intent.** — Mostly yes but I'll clarify - We're consolidating all docs into those core docs so no other docs should be relevant anymore. The main reason we're doing so is that agents tended to "forget" prior … — `docs/questionnaire.md:56`
6. `G` **Illustrative names do not require exact TypeScript signatures.** — **Recommendation:** Yes, through provider-specific adapters behind that boundary. The session retains the durable conversation association, and persistence stores it; harness observation does not … — `docs/questionnaire.md:96`
7. `G` **Unanswered inventory does not approve behavior.** — *Risk: Unresolved rows or unmapped document content must not be treated as approved requirements or deletion authorization.* — `docs/questionnaire.md:153`

**→ `docs/CONVENTIONS.md#documentation-maintenance`** — 3 statement(s)

1. `P` **No-separate-archive and Git-only retention detail was not specifically confirmed by the qualified answer or core.** — **Recommendation:** Yes. Fold still-needed material into its proper core destination, then remove superseded standalone documents after DEC-004’s checks. Do not create a separate archive category; … — `docs/questionnaire.md:54`
2. `G` **Answer addresses AGENTS ownership but does not approve a CLAUDE exception or its necessity.** — **Question:** May a tool-required CLAUDE entry point remain as an exception to the core-only document set? — `docs/questionnaire.md:67`
3. `P` **Conditional CLAUDE pointer recommendation has no direct answer.** — **Recommendation:** Allow only a minimal pointer to AGENTS when agents verify that the tool needs it; keep substantive workflow instructions solely in AGENTS. Update all retained entry-point … — `docs/questionnaire.md:68`

## G16 · Research: durable architecture documentation for agent-assisted projects

**Document:** `docs/research-architecture-documentation.md` · **7 statements** — 3 P · 4 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ _no owning contract — retire, or escalate as a new decision_** — 5 statement(s)

1. `G` **Linked structural contracts own boundaries and meaningful operations rather than declaration mirrors.** — Treat architecture documentation as a small set of purpose-separated, linked sources of truth—not a prose mirror of the source tree. Record durable ownership boundaries, responsibilities, permitted … — `docs/research-architecture-documentation.md:22`
2. `G` **Product authority and evidence hierarchy are explicit.** — - **SPEC.md**: normative product/behavior contract: what must remain true for users. Do not let observed implementation override it. — `docs/research-architecture-documentation.md:28`
3. `G` **Status vocabulary and descriptive source navigation distinguish intent from implementation.** — - **ARCHITECTURE.md**: normative structural contract: approved boundaries, ownership, dependency direction, major responsibilities, and communication/interface rules. Distinguish explicitly between … — `docs/research-architecture-documentation.md:29`
4. `P` **Accepted targets and descriptive source pointers have distinct evidence status.** — An accidental code change, generated diagram, or agent inference never redefines approved architecture or product behavior. If code and normative contract disagree, flag the mismatch; do not silently … — `docs/research-architecture-documentation.md:37`
5. `P` **Specific diagram view selection is a recommendation rather than an approved required format.** — arc42 recommends hierarchical building blocks with purpose/responsibility and interfaces, but refinement by relevance: explain important, surprising, risky, complex, or volatile parts rather than … — `docs/research-architecture-documentation.md:41`

**→ `docs/BLUEPRINT.md#component-contracts`** — 1 statement(s)

1. `G` **Core has logical detail contracts but does not approve a separate machine-consumed schema documentation mandate.** — arc42 recommends hierarchical building blocks with purpose/responsibility and interfaces, but refinement by relevance: explain important, surprising, risky, complex, or volatile parts rather than … — `docs/research-architecture-documentation.md:41`

**→ `docs/CONVENTIONS.md#documentation-maintenance`** — 1 statement(s)

1. `P` **Exact diagram-maintenance practice is recommended but not explicitly adopted.** — Document a class/method only when it carries a non-obvious architectural invariant or stable responsibility that cannot be inferred from signature, types, tests, or a focused interface spec. State … — `docs/research-architecture-documentation.md:43`

## G17 · Research: durable product requirements for agent-assisted development

**Document:** `docs/research-requirements-documentation.md` · **10 statements** — 2 P · 8 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ _no owning contract — retire, or escalate as a new decision_** — 8 statement(s)

1. `G` **Local SPEC authority and linked ownership are explicit.** — `PRD`, `SRS`, and `SPEC` are labels, not one universal document taxonomy. ISO/IEC/IEEE 29148 defines requirements-engineering processes and information items; NASA uses names such as Software … — `docs/research-requirements-documentation.md:22`
2. `G` **SPEC and its linked features are the single product authority.** — Use one authoritative **product contract** (keep `docs/SPEC.md` unless there is a compelling local reason to rename it). Make it a positive, exhaustive-enough statement of supported externally … — `docs/research-requirements-documentation.md:33`
3. `G` **Evidence cannot change approved intent.** — Use one authoritative **product contract** (keep `docs/SPEC.md` unless there is a compelling local reason to rename it). Make it a positive, exhaustive-enough statement of supported externally … — `docs/research-requirements-documentation.md:33`
4. `G` **Alignment ledger owns implementation actions and links their contracts.** — Track desired changes separately in the existing issue/task/roadmap mechanism (or a single scoped `docs/` backlog only if no tracker exists): removal/deprecation of an existing command, … — `docs/research-requirements-documentation.md:35`
5. `G` **Approved intent is distinguished from implementation completion.** — Track desired changes separately in the existing issue/task/roadmap mechanism (or a single scoped `docs/` backlog only if no tracker exists): removal/deprecation of an existing command, … — `docs/research-requirements-documentation.md:35`
6. `G` **Safety constraints remain approved and the session contract retains both named invariants.** — Negative requirements are legitimate when they constrain an unsafe or unwanted outcome: e.g. “uncertain liveness evidence does not authorize stopping an agent” or “deleting a running session is … — `docs/research-requirements-documentation.md:37`
7. `G` **Contract approval and ledger work are distinct.** — Negative requirements are legitimate when they constrain an unsafe or unwanted outcome: e.g. “uncertain liveness evidence does not authorize stopping an agent” or “deleting a running session is … — `docs/research-requirements-documentation.md:37`
8. `G` **Core explicitly distinguishes evidence from intent.** — - Implementation/test trace links live beside contract claims (or in a compact evidence table if inline links become noisy); code/tests remain evidence, never competing product intent. — `docs/research-requirements-documentation.md:43`

**→ `docs/CONVENTIONS.md#documentation-maintenance`** — 2 statement(s)

1. `P` **Universal per-claim source and test linkage is not established as an accepted maintenance requirement.** — Use one authoritative **product contract** (keep `docs/SPEC.md` unless there is a compelling local reason to rename it). Make it a positive, exhaustive-enough statement of supported externally … — `docs/research-requirements-documentation.md:33`
2. `P` **Exact evidence-link placement remains a recommendation without accepted mandate.** — - Implementation/test trace links live beside contract claims (or in a compact evidence table if inline links become noisy); code/tests remain evidence, never competing product intent. — `docs/research-requirements-documentation.md:43`

## G18 · UI documentation split: screen baselines and reusable design rules

**Document:** `docs/research-ui-documentation.md` · **4 statements** — 1 P · 3 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ _no owning contract — retire, or escalate as a new decision_** — 2 statement(s)

1. `G` **The tree item SPEC identifies the adopted behavioral owner.** — ``` — `docs/research-ui-documentation.md:34`
2. `G` **Verification cannot amend intent and accepted changes update their owners.** — - Tests, terminal recordings, and screenshots can detect drift against a documented baseline; they are evidence/verification, never the authority for intended product behavior. Update the owning … — `docs/research-ui-documentation.md:43`

**→ `docs/screens/README.md#screen-specifications`** — 1 statement(s)

1. `G` **Adopted pages cover these concerns but a universal exact template is not mandated.** — - Screen templates should include purpose, ordered regions, states (including empty/loading/error), key/focus map, narrow/short-terminal behavior, and links to governing SPEC/design-system rules. … — `docs/research-ui-documentation.md:42`

**→ `docs/DESIGN-SYSTEM.md#type-cells-and-spacing`** — 1 statement(s)

1. `P` **Template and global token values remain recommendations with incomplete approved values.** — - Screen templates should include purpose, ordered regions, states (including empty/loading/error), key/focus map, narrow/short-terminal behavior, and links to governing SPEC/design-system rules. … — `docs/research-ui-documentation.md:42`
