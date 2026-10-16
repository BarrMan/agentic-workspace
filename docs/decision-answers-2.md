---
consolidation:
  total: 65
  counts:
    exists: 5
    discard: 37
    integrate: 17
    unconfirmed: 6
  percentages:
    exists: 7.69%
    discard: 56.92%
    integrate: 26.15%
    unconfirmed: 9.23%
---
# Decision answer sheet 2 — Backlog.md

Answer inline, right after each `Answer:`, then tell me "answers are in the file".
Keep the file afterwards — it is the record. Nothing here needs a tool call; every item is one letter (or yes/no).

## Already settled — for context only, do not re-answer

- **Q1** — Delete the duplicate *repair* feature entirely; doctor keeps *detecting*. Implemented, in flight.
<!-- consolidation: integrate; ref: docs/specs/tasks.md#task-model; reason: Accepted removal of automatic duplicate repair is missing from core. -->
<!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Doctor retention is superseded by item 3 below and implementation status is historical. -->
- **Q2** — Slice I. Durable receipts kept for v1, deleted for v2 (verified: v1's receipt is the only recovery path when the launcher dies between provider creation and Backlog persistence; v2 names its own session, so its receipt is redundant). No `HarnessBuilder` — the existing adapter registry is the ownership boundary.
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#conversation-records-versus-runtime; reason: Provider-version-specific receipt necessity or redundancy is historical recovery evidence requiring verification before retirement. -->
<!-- consolidation: exists; ref: docs/architecture/session-harness.md#harness-construction-and-promises; reason: Provider-owned identity and simple factory construction replace a speculative builder. -->
- **Q3** — Corrupted data: warn, skip the record, never fail the process. No repair code. Implemented.
<!-- consolidation: integrate; ref: docs/specs/interfaces.md#filtering-and-search; reason: Tolerant collection reads with visible warnings and no repair are missing from core and clarified in items 3 and 5. -->
<!-- consolidation: discard; ref: none; reason: Implemented status is historical rather than verification of today's source. -->
- **Q4** — Task ids are literal whole strings: `TASK-01` is not `TASK-1`, and we do not compare numbers. Queued behind Q1.
<!-- consolidation: integrate; ref: docs/specs/tasks.md#task-model; reason: Accepted literal-string task identity is absent from core. -->
<!-- consolidation: discard; ref: none; reason: Queue sequencing is historical execution status. -->
- **R2** — Archived ids are not reused. Confirmed.
<!-- consolidation: integrate; ref: docs/specs/tasks.md#task-model; reason: Accepted archived-ID nonreuse is absent from core. -->
- **R1** — my earlier description was wrong; it is reframed in item 6 below.
<!-- consolidation: discard; ref: none; reason: Interview correction and navigation. -->

---

## 1 — Where do tasks live inside a linked git worktree?  [Q5]

**Context.** No written spec settles this, and the code contradicts itself today. Task *artifact* storage maps a linked worktree onto the main worktree and refuses to create a second store, while ordinary task read/write uses the worktree's own `backlog/` folder. Your ruling was "it should resolve to the agreed upon root, and all code must agree" — but no agreed root is actually written down, so this is that decision.
<!-- consolidation: discard; ref: docs/specs/tasks.md#project-data-store; reason: Historical ambiguity and mismatched paths are now settled by the configured shared-store contract. -->

- **A (recommended)** — **One store.** Tasks live in the main worktree's `backlog/`, and every path resolves through the same worktree-to-main mapping. A scratch worktree cannot strand tasks, and one store means one writer.
<!-- consolidation: exists; ref: docs/specs/tasks.md#project-data-store; reason: Linked worktrees use the main project's configured store. -->
<!-- consolidation: discard; ref: docs/specs/tasks.md#project-data-store; reason: Fixed backlog directory is superseded by configurable storage defaulting to .agentic-workspace. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#mutation-and-concurrency-boundary; reason: One store does not imply a single writer process and core instead requires coordinated fresh-state mutations. -->
- **B** — **Per worktree.** Each worktree keeps its own `backlog/`, and allocation scans sibling worktrees to avoid id clashes. Tasks created in a scratch worktree die when you `git worktree remove` it.
<!-- consolidation: discard; ref: docs/specs/tasks.md#project-data-store; reason: Rejected per-worktree collections conflict with one configured project store. -->

**Answer:** A
<!-- consolidation: exists; ref: docs/specs/tasks.md#project-data-store; reason: Accepted shared-store decision is explicitly represented. -->

## 2 — Make `client-established` identity a first-class case  [Q2, departure 2]

**Context.** Claude, Pi and OpenCode v2 legitimately choose their own session ids. The adapter contract should carry that as a valid basis ("the adapter established it"), rather than treating it as a confirmation that failed to arrive — that misframing was the actual agent-agnosticism bug.
<!-- consolidation: integrate; ref: docs/architecture/session-harness.md#harness-construction-and-promises; reason: Core should explicitly allow adapter-established identity without requiring provider issuance. -->
<!-- consolidation: discard; ref: none; reason: Named provider-version behavior is historical evidence rather than a permanent support matrix. -->

- **A (recommended)** — Yes: `client-established` and `provider-confirmed` are both first-class bases; shared code never interprets provider mechanics.
<!-- consolidation: integrate; ref: docs/architecture/session-harness.md#harness-construction-and-promises; reason: Accepted valid identity bases are not explicit in core and need not freeze these literal labels. -->
<!-- consolidation: exists; ref: docs/BLUEPRINT.md#component-ownership; reason: Provider mechanics are exclusively Harness-owned. -->
- **B** — Some other shape you have in mind (say so and I will take it back to the advisor).
<!-- consolidation: discard; ref: none; reason: Unselected open-ended interview alternative. -->

**Answer:** A - I don't understand what you write here `client-established` | `provider-confirmed` but I think you understand what I want. The adapter does the harness specific actions and the caller should request the harness to create / resume sessions and provide whatever information the caller needs.
<!-- consolidation: exists; ref: docs/architecture/session-harness.md#harness-construction-and-promises; reason: Answer approves provider-owned create and resume responsibilities without requiring the proposed terminology. -->

## 3 — Keep `doctor`, in report-only form?  [you asked what it does]

**Context.** `backlog doctor` currently checks six things: reserved-prefix collisions; duplicate task ids in active/completed; cross-branch id collisions (manual review); document and decision identity health (duplicates, missing ids, unreadable files); draft identity health (duplicate numeric ids, filename/frontmatter drift, unreadable files); dependency self-references and cycles. It reports only and exits 1 on findings. Repair was its *only* mutation, and repair is being deleted.
<!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Doctor reserved-prefix scan is part of the command explicitly rejected below. -->
<!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Doctor active or completed duplicate scan is part of the command explicitly rejected below. -->
<!-- consolidation: discard; ref: docs/specs/tasks.md#project-data-store; reason: Doctor cross-branch collision scan is superseded by one configured store without branch discovery. -->
<!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Doctor document and decision health checks are inventory of the explicitly rejected diagnostic command. -->
<!-- consolidation: discard; ref: docs/specs/tasks.md#task-model; reason: Doctor draft identity checks concern draft behavior absent from the current model. -->
<!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Doctor dependency-cycle reporting is inventory of the rejected command rather than approval of a new diagnostic surface. -->
<!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Doctor report-only exit code and repair-deletion status are historical command mechanics superseded by complete removal. -->

**Recommendation: keep it, report-only.** Five of the six checks have no other surface in the CLI; deleting doctor silently drops prefix-collision, doc/decision and draft-drift reporting.
<!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Explicit owner answer rejects doctor retention. -->

- **A (recommended)** — Keep doctor, report-only (`--fix` and `--yes` disappear).
<!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Rejected by the owner below. -->
- **B** — Delete doctor entirely.
<!-- consolidation: integrate; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Explicitly accepted doctor removal is not named among core's rejected surfaces. -->

**Answer:** delete doctor entirely. I'll say that again if it's not written anywhere. We do not support any data corruption whatsoever. If there is data corruption, it means one of two things: either the app is corrupting data -> we have a bug -> we fix the bug. or "something" is corrupting the data from external source -> we do not support this -> we fail when we actually try to access / read or do an action that errors - the mentality should be, we try to fail only specifically what went wrong and not the whole app and provide a user friendly error message so the user could troubleshoot what went wrong. Fixing corruptions masks real problems - if a user wrote a program or told an agent to write docs in a certain corrupted format and we keep fixing it without the user ever knowing it's corrupted, then we're masking the underlying issue. If we instead, fail and provide a helpful message to the user, the user will see this, correct its script / agent's format and it will never happen again.
<!-- consolidation: integrate; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Explicit removal of doctor is missing from core. -->
<!-- consolidation: integrate; ref: docs/specs/tasks.md#project-data-store; reason: Do not automatically repair corrupted data is an accepted rule missing from core. -->
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#error-handling-and-cleanup; reason: App-created corruption is a defect to fix at its source rather than compensate for with repair code. -->
<!-- consolidation: integrate; ref: docs/specs/interfaces.md#filtering-and-search; reason: Fail only the affected access or action with helpful context while preserving unaffected application work. -->
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#error-handling-and-cleanup; reason: Accepted rationale is that silent repair masks the external writer defect rather than exposing actionable errors. -->

## 4 — Should doctor also scan *archived* records for duplicates?

**Context.** Its duplicate scan covers active and completed only, so a duplicate whose other side is archived is not reported there. Resolving such an id already fails closed and names both containers, so this is about reporting, not safety.
<!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Removed doctor's scan scope is obsolete implementation inventory. -->
<!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#task-model; reason: Exact cross-state duplicate resolution evidence is historical and must not imply numeric equivalence rejected by literal-ID policy. -->

- **A (recommended)** — Include archived, so hand-made duplicates stay findable.
<!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Doctor removal rejects expanding its scan. -->
- **B** — Leave it; the fail-closed path already surfaces it.
<!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Doctor removal supersedes its retained scan options. -->

**Answer:** Per decision #3 - we remove doctor.
<!-- consolidation: integrate; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Reaffirms explicit doctor removal missing from core. -->

## 5 — Tolerant reads: confirm the exit code

**Context.** Implemented per your Q3 answer: a malformed record produces one warning naming the file and the parse error, is skipped, and the command still succeeds. The consequence is that scripts and MCP callers now get exit 0 with that record simply absent from the results.
<!-- consolidation: integrate; ref: docs/specs/interfaces.md#filtering-and-search; reason: Confirmed warning naming the file and error plus skipped-record successful results are absent from core. -->

- **A (as implemented, recommended)** — Exit 0; the stderr warning is the signal.
<!-- consolidation: integrate; ref: docs/specs/interfaces.md#filtering-and-search; reason: Accepted successful collection-read exit with stderr warning is not explicit in core. -->
- **B** — Print the readable results, then exit non-zero, so automation can detect that corruption exists.
<!-- consolidation: discard; ref: docs/specs/interfaces.md#filtering-and-search; reason: Owner explicitly selects exit zero instead. -->

**Answer:** I think I already answered this a couple of times. Yes. A.
<!-- consolidation: integrate; ref: docs/specs/interfaces.md#filtering-and-search; reason: Explicitly confirms tolerant collection reads return success and a warning. -->

## 6 — Demotion response text  [R1, reframed]

**Context.** My earlier description was wrong, so here is the true state. MCP **still emits** the line `Removed references to TASK-1 from TASK-2.` when a demotion actually cleans references (`src/mcp/tools/tasks/handlers.ts:429-434`). What changed is our **test**: it used to assert that text and now asserts the resulting state (`dependencies: []`). So the text is emitted but is no longer guaranteed by any test.
<!-- consolidation: discard; ref: docs/specs/tasks.md#task-model; reason: Historical text-test correction concerns demotion which core now explicitly removes. -->

- **A (recommended)** — Assert both the text and the state, so a future regression that stops announcing the cleanup is caught.
<!-- consolidation: discard; ref: docs/specs/tasks.md#task-model; reason: Rejected in sheet 3 item 1 and demotion is no longer supported. -->
- **B** — Keep state-only; the announcement is cosmetic.
<!-- consolidation: discard; ref: docs/specs/tasks.md#task-model; reason: Accepted historical demotion-specific assertion choice is obsolete with demotion removal. -->

**Answer:** I still don't understand your explanation. Why do you keep failing explaining this properly? Explain this like you explained other questions. What is this demotion? which references are cleaned? What is the scenario? 
<!-- consolidation: discard; ref: docs/specs/tasks.md#task-model; reason: Clarification was supplied in sheet 3 for the now-removed demotion feature. -->

## 7 — Correct outcome for the stopped input transport  [B4]

**Context.** In `src/agent-workspace/live/tmux/transport-detach.integration.test.ts`, the input transport stops while a delivery is in flight, and the system reports "Input transport stopped while input delivery was in flight; delivery is uncertain". After the test double was fixed, that same outcome remains, so this is now a question about intended behaviour.
<!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#live-terminal-and-client-lifetime; reason: Current applicability of the historical uncertainty assertion after sheet 8's bounded drain requires verification. -->

- **A (recommended)** — That is the correct, honest outcome for this path; update the test to expect it.
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#runningexecution-interaction-contract; reason: Exact uncertainty reporting on this path was not approved by this unanswered question. -->
- **B** — Wrong outcome; the detach should resolve as delivered.
<!-- consolidation: discard; ref: docs/architecture/session-harness.md#runningexecution-interaction-contract; reason: Successful delivery cannot be asserted without transport completion and failures must be reported. -->
- **C** — Drop the test until a design call is made.
<!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: No approval to remove this coverage. -->

**Answer:** I have no idea what you're talking about. You invented terminology I don't know of or not familiar with. What is the input transport? What is the delivery? `"Input transport stopped while input delivery was in flight; delivery is uncertain"` - I have absolutely no idea what this sentense means.
<!-- consolidation: discard; ref: none; reason: Terminology clarification request is addressed in subsequent sheets without approving an outcome here. -->

## 8 — The four hang failures  [H]

**Context.** `atomic-task-create` (2 failures) and `mode-session-reservation-contract` (2) hang at 100% CPU. Reproducible under plain `bun test`; still hangs on Bun 1.4.3; no symbolicated frames, no CPU profile produced, no backtrace on SIGQUIT. Each hung run also leaks roughly 4.4 GB of extracted libraries into the temp directory.
<!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Historical failure and disk measurements require remeasurement rather than becoming core. -->

- **H1 (recommended)** — Accept as known red, record it, revisit if it starts costing CI time.
<!-- consolidation: discard; ref: none; reason: Explicitly rejected by the owner below. -->
- **H2** — Keep instrumenting now; the next step would be a minimal reproduction under a debugger.
<!-- consolidation: discard; ref: none; reason: Unselected historical diagnostic route. -->
- **H3** — Minimize one test to its smallest failing form and treat that as the bug report.
<!-- consolidation: discard; ref: none; reason: Accepted bounded investigation task belongs in execution tracking rather than a permanent requirement. -->

**Answer:** Of course H3. How is H1 recommended? This sounds like a critical bug that needs to be addressed immediately and not defered. 
<!-- consolidation: discard; ref: none; reason: Accepted minimization and urgency govern historical diagnostic work and do not certify that work completed. -->

## 9 — Repo hygiene: stale worktree registrations

**Context.** 22 `prunable` worktree registrations remain from earlier sessions whose directories are already gone, cluttering `git worktree list`. They are dead metadata, not data loss.
<!-- consolidation: discard; ref: none; reason: Historical repository-specific inventory. -->

- **A (recommended)** — Run `git worktree prune`.
<!-- consolidation: discard; ref: none; reason: One-time cleanup action approved subject to the preservation gate below. -->
- **B** — Leave them.
<!-- consolidation: discard; ref: none; reason: Unselected one-time maintenance alternative. -->

**Answer:** If cleanup can be done, then of course, clean it up. Please make sure that we don't lose anything (data, code) by pruning those worktrees
<!-- consolidation: discard; ref: none; reason: One-time permission to prune stale registrations is operational work rather than core behavior. -->
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#error-handling-and-cleanup; reason: Explicit safety gate requires verifying no data or code loss before pruning worktree registrations and is not stated in core. -->
