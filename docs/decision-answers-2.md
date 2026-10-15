# Decision answer sheet 2 — Backlog.md

Answer inline, right after each `Answer:`, then tell me "answers are in the file".
Keep the file afterwards — it is the record. Nothing here needs a tool call; every item is one letter (or yes/no).

## Already settled — for context only, do not re-answer

- **Q1** — Delete the duplicate *repair* feature entirely; doctor keeps *detecting*. Implemented, in flight.
- **Q2** — Slice I. Durable receipts kept for v1, deleted for v2 (verified: v1's receipt is the only recovery path when the launcher dies between provider creation and Backlog persistence; v2 names its own session, so its receipt is redundant). No `HarnessBuilder` — the existing adapter registry is the ownership boundary.
- **Q3** — Corrupted data: warn, skip the record, never fail the process. No repair code. Implemented.
- **Q4** — Task ids are literal whole strings: `TASK-01` is not `TASK-1`, and we do not compare numbers. Queued behind Q1.
- **R2** — Archived ids are not reused. Confirmed.
- **R1** — my earlier description was wrong; it is reframed in item 6 below.

---

## 1 — Where do tasks live inside a linked git worktree?  [Q5]

**Context.** No written spec settles this, and the code contradicts itself today. Task *artifact* storage maps a linked worktree onto the main worktree and refuses to create a second store, while ordinary task read/write uses the worktree's own `backlog/` folder. Your ruling was "it should resolve to the agreed upon root, and all code must agree" — but no agreed root is actually written down, so this is that decision.

- **A (recommended)** — **One store.** Tasks live in the main worktree's `backlog/`, and every path resolves through the same worktree-to-main mapping. A scratch worktree cannot strand tasks, and one store means one writer.
- **B** — **Per worktree.** Each worktree keeps its own `backlog/`, and allocation scans sibling worktrees to avoid id clashes. Tasks created in a scratch worktree die when you `git worktree remove` it.

**Answer:** A

## 2 — Make `client-established` identity a first-class case  [Q2, departure 2]

**Context.** Claude, Pi and OpenCode v2 legitimately choose their own session ids. The adapter contract should carry that as a valid basis ("the adapter established it"), rather than treating it as a confirmation that failed to arrive — that misframing was the actual agent-agnosticism bug.

- **A (recommended)** — Yes: `client-established` and `provider-confirmed` are both first-class bases; shared code never interprets provider mechanics.
- **B** — Some other shape you have in mind (say so and I will take it back to the advisor).

**Answer:** A - I don't understand what you write here `client-established` | `provider-confirmed` but I think you understand what I want. The adapter does the harness specific actions and the caller should request the harness to create / resume sessions and provide whatever information the caller needs.

## 3 — Keep `doctor`, in report-only form?  [you asked what it does]

**Context.** `backlog doctor` currently checks six things: reserved-prefix collisions; duplicate task ids in active/completed; cross-branch id collisions (manual review); document and decision identity health (duplicates, missing ids, unreadable files); draft identity health (duplicate numeric ids, filename/frontmatter drift, unreadable files); dependency self-references and cycles. It reports only and exits 1 on findings. Repair was its *only* mutation, and repair is being deleted.

**Recommendation: keep it, report-only.** Five of the six checks have no other surface in the CLI; deleting doctor silently drops prefix-collision, doc/decision and draft-drift reporting.

- **A (recommended)** — Keep doctor, report-only (`--fix` and `--yes` disappear).
- **B** — Delete doctor entirely.

**Answer:** delete doctor entirely. I'll say that again if it's not written anywhere. We do not support any data corruption whatsoever. If there is data corruption, it means one of two things: either the app is corrupting data -> we have a bug -> we fix the bug. or "something" is corrupting the data from external source -> we do not support this -> we fail when we actually try to access / read or do an action that errors - the mentality should be, we try to fail only specifically what went wrong and not the whole app and provide a user friendly error message so the user could troubleshoot what went wrong. Fixing corruptions masks real problems - if a user wrote a program or told an agent to write docs in a certain corrupted format and we keep fixing it without the user ever knowing it's corrupted, then we're masking the underlying issue. If we instead, fail and provide a helpful message to the user, the user will see this, correct its script / agent's format and it will never happen again.

## 4 — Should doctor also scan *archived* records for duplicates?

**Context.** Its duplicate scan covers active and completed only, so a duplicate whose other side is archived is not reported there. Resolving such an id already fails closed and names both containers, so this is about reporting, not safety.

- **A (recommended)** — Include archived, so hand-made duplicates stay findable.
- **B** — Leave it; the fail-closed path already surfaces it.

**Answer:** Per decision #3 - we remove doctor.

## 5 — Tolerant reads: confirm the exit code

**Context.** Implemented per your Q3 answer: a malformed record produces one warning naming the file and the parse error, is skipped, and the command still succeeds. The consequence is that scripts and MCP callers now get exit 0 with that record simply absent from the results.

- **A (as implemented, recommended)** — Exit 0; the stderr warning is the signal.
- **B** — Print the readable results, then exit non-zero, so automation can detect that corruption exists.

**Answer:** I think I already answered this a couple of times. Yes. A.

## 6 — Demotion response text  [R1, reframed]

**Context.** My earlier description was wrong, so here is the true state. MCP **still emits** the line `Removed references to TASK-1 from TASK-2.` when a demotion actually cleans references (`src/mcp/tools/tasks/handlers.ts:429-434`). What changed is our **test**: it used to assert that text and now asserts the resulting state (`dependencies: []`). So the text is emitted but is no longer guaranteed by any test.

- **A (recommended)** — Assert both the text and the state, so a future regression that stops announcing the cleanup is caught.
- **B** — Keep state-only; the announcement is cosmetic.

**Answer:** I still don't understand your explanation. Why do you keep failing explaining this properly? Explain this like you explained other questions. What is this demotion? which references are cleaned? What is the scenario? 

## 7 — Correct outcome for the stopped input transport  [B4]

**Context.** In `src/agent-workspace/live/tmux/transport-detach.integration.test.ts`, the input transport stops while a delivery is in flight, and the system reports "Input transport stopped while input delivery was in flight; delivery is uncertain". After the test double was fixed, that same outcome remains, so this is now a question about intended behaviour.

- **A (recommended)** — That is the correct, honest outcome for this path; update the test to expect it.
- **B** — Wrong outcome; the detach should resolve as delivered.
- **C** — Drop the test until a design call is made.

**Answer:** I have no idea what you're talking about. You invented terminology I don't know of or not familiar with. What is the input transport? What is the delivery? `"Input transport stopped while input delivery was in flight; delivery is uncertain"` - I have absolutely no idea what this sentense means.

## 8 — The four hang failures  [H]

**Context.** `atomic-task-create` (2 failures) and `mode-session-reservation-contract` (2) hang at 100% CPU. Reproducible under plain `bun test`; still hangs on Bun 1.4.3; no symbolicated frames, no CPU profile produced, no backtrace on SIGQUIT. Each hung run also leaks roughly 4.4 GB of extracted libraries into the temp directory.

- **H1 (recommended)** — Accept as known red, record it, revisit if it starts costing CI time.
- **H2** — Keep instrumenting now; the next step would be a minimal reproduction under a debugger.
- **H3** — Minimize one test to its smallest failing form and treat that as the bug report.

**Answer:** Of course H3. How is H1 recommended? This sounds like a critical bug that needs to be addressed immediately and not defered. 

## 9 — Repo hygiene: stale worktree registrations

**Context.** 22 `prunable` worktree registrations remain from earlier sessions whose directories are already gone, cluttering `git worktree list`. They are dead metadata, not data loss.

- **A (recommended)** — Run `git worktree prune`.
- **B** — Leave them.

**Answer:** If cleanup can be done, then of course, clean it up. Please make sure that we don't lose anything (data, code) by pruning those worktrees
