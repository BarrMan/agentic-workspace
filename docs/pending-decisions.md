# Pending decisions — Backlog.md

Three decisions block remaining work. Everything else is either already done or under diagnosis.

## Status

Items 1–5 below are **settled and implemented** — this file is background for them now, not a list of open questions. What actually remains open to the owner lives in the two decision sheets.

| decision | ruling | state |
| --- | --- | --- |
| 1 duplicate-task repair | report and refuse; the repair feature is gone | `doctor` deleted; duplicate ids reported with both record paths; ambiguous MCP ids rejected |
| 2 session-identity refactor | option (i): adapters own proposed identity, one ownership-checked publisher, receipts kept for OpenCode v1 | steps 1–4 implemented and the receipt-waiting flag deleted; steps 5–6 remain — see the checkpoint |
| 3 unparseable corpus record | tolerant reads — one path-specific warning, the record is skipped, the command exits 0; explicit single-record loads stay strict | implemented |
| 4 zero-padded ids | kept distinct and fail closed: `TASK-01` is not `TASK-1`; collisions are reported, never guessed | implemented |
| 5 worktree task creation | tasks live in the main worktree's store; linked worktrees share it | implemented, including the synchronous/async root-resolution guard |
| unattributed test hangs | not product defects: the survivors were machine starvation and one test-design race (comparing two runs' generated timestamps). The remaining flake is spawn cost | see next action 2 in [handoff.md](handoff.md) |

Open with the owner: [decision-answers-5.md](decision-answers-5.md) (input on close) and [decision-answers-6.md](decision-answers-6.md) (items 1–3). Current suite state and ordered next actions: [handoff.md](handoff.md).

## Where things stand

- Standing policy applied: no legacy/backward-compat maintenance, **no migration code in the repo** (migration is a manual human action). The migration tooling and flat-record readers are gone; refusal messages tell the user how to convert by hand.
- Fixed today, verified: conversation guard removed with the write-side bug fixed at the root; programmatic CLI entry (`runCli`) with two real exit-code regressions found and fixed (shell completion, MCP shutdown); runner process-group reaping with ownership proof; search tolerance for one unparseable record; UI legacy removal; **id-allocation collision** (create → archive → create used to mint a duplicate `TASK-1`) now fixed and reproduced; **archived-record resolution** on delete; **draft creation** in a missing `backlog/drafts` directory.
- Deliberate behavior change: **archived ids are no longer reusable.** No doc claimed otherwise, so nothing to update.
- Full suite now: **287/287 files, 2,444 passed, 89 failed across 32 files.**
- Of the 89: 29 are these decisions, 2 are load flakes (both pass in isolation), 24 are newly surfaced and under diagnosis, 32 are pre-existing with test files byte-identical to `HEAD`.

---

## Decision 1 — What to do about duplicate-task repair

**Situation.** `src/core/duplicate-task-repair.ts:430-438` refuses to repair a duplicate held in *canonical task containers*: "canonical task-container duplicates require whole-container repair and are currently refused to preserve sibling artifacts and sidecars." Consequences: 7 assertions expect repair to work (6 in `src/test/cli-doctor.test.ts`, 1 in `src/test/container-duplicate-repair-contract.test.ts:97`), and `src/test/duplicate-task-repair.test.ts` has 20 failures because its fixtures *are* legacy flat duplicate scenarios.

**Why it matters.** It decides whether the product self-heals corrupted data or reports it — and it is the largest single block keeping the suite red.

**Related wart found during the fixture work.** `src/core/duplicate-task-repair.ts:139-143` still derives a record's "logical path" from the basename and a `" - "` separator — a flat-filename assumption. Every canonical record's basename is `task.md`, so that helper is degenerate; it is only prevented from collapsing records together because grouping happens by canonical id first (`:165-172`). Whichever option you choose, this helper should be deleted or re-derived from the canonical path rather than left as a trap.

**Context that changed the picture.** The collision's source is now closed: allocation reserves logical identities across active, completed, archived, and draft stores (`src/core/backlog.ts:557-571`), so normal use can no longer mint a duplicate. Remaining duplicates are hand-made or already-damaged data.

**Options.**
- **(a) Implement whole-container repair.** Destructive: pick a winner, merge the loser, preserve its artifacts and sidecars. Medium work, real data-loss risk, and it needs a design pass first.
- **(b) Keep the refusal; rewrite the expectations** to assert a blocked preview and no mutation, and restrict the legacy suite to canonical cases. Small.
- **(c) Delete the repair feature**, keeping duplicate reporting only. Smallest surface; loses detection value.

**Recommendation: (b).** The only remaining duplicates are damaged or hand-made — exactly when a human should look before anything merges. It matches the manual-repair stance already adopted. Choose (a) only if you want the product to self-heal; then I'd want the artifact-preservation design agreed before code is written.

---

## Decision 2 — How far to take the session-identity refactor

**Situation.** An adapter exposes `nativeSessionIdForLaunch()`; shared orchestration calls it during *reservation* and writes the value into the durable record **before launch** (`src/agent-workspace/sessions.ts:941-966,1537-1553,1636-1655`), then picks `prepared.nativeSessionId ?? options.nativeSessionId` (`session-launch.ts:215-218`). One adapter sets `waitsForNativeSessionReceipt` (OpenCode v1).

**The verdict.** Oracle judged this a genuine agent-agnosticism violation — not because harnesses differ, but because *shared code interprets provider mechanics and decides which adapter's id to trust.* Two supporting facts:

- The flag **does not implement a wait**: `bindNativeReceipt` samples and returns immediately if absent (`sessions.ts:389-400`), so the same harness gets different timing by entrypoint (workspace launch stays `STARTING`, direct launch goes `RUNNING`).
- Three sibling leaks of the same shape: `SessionStore` parsing OpenCode `ses_` identity (`session-store.ts:37,839-863`, and it gates on the literal preset name at `:860`); provider-name id generation in orchestration (`sessions.ts:1169-1187`); `mode-model.ts` owning OpenCode export schemas while rejecting non-OpenCode sessions.

**A correction you should have.** An earlier suspicion — that OpenCode v2 stores a *fictional* identity — is **refuted**. The installed `opencode` is v1.19.0; v2 is the separate `opencode2` binary (v2.0.26), whose `--session` is documented as "continue, or create if it does not exist." Verified locally: a fabricated `ses_<32 hex>` id creates a session under exactly that id, and re-running resumes it. So for v2 the client-chosen id *is* the provider identity, and the repo stores it correctly. Claude documents `--session-id` as establishing the conversation and can confirm identity later via `SessionStart.session_id`. Pi documents `--session-id` as create-if-absent but its `session_start` event carries **no id**, so it cannot confirm at all. A strict "provider-confirmed identity" rule is therefore unachievable for Pi and wrong for v2 — the contract must treat **client-established identity as a first-class case**.

**Options.**
- **(i) Bounded first slice (oracle's recommendation).** Adapters take `{kind:"new"} | {kind:"resume", nativeSessionId}` and return confirmed-or-client-established identity; adapters own proposed ids and final command assembly; one ownership-checked publisher handles immediate and deferred identity; OpenCode receipts route through it and storage stops hydrating identity; delete the flag **and** the requested-id plumbing together. Receipts stay durable. Medium cross-cutting refactor; no schema migration; lands in the region fix-58 just changed.
- **(ii) Full end state.** Also delete durable receipt transport — not honest yet; nothing verified replaces its recovery function.
- **(iii) Narrow.** Fix only the live hazard and leave the interface alone. Given the v2 correction, no wrong data is being stored today, so this is now optional tidiness rather than a bug fix.
- **(iv) Defer.** Capture as a spec and keep the current guard.

**Recommendation: (i), at low urgency.** Nothing is broken in a way users can hit right now; this is design debt that will keep costing every time an adapter is added. Do not pick (ii).

---

## Decision 3 — What should an unparseable corpus record do?

**Situation.** With a canonical but malformed record present (`backlog/completed/task-99/task.md`, `title: [unclosed`), `task list` warns twice on stderr, prints nothing, and exits 1. The two `cli-task-list` cases expect the listing to succeed.

**Why it matters.** It governs behavior on damaged data, and the recent history here is deliberate.

**What the investigation established.** The `Skipping unreadable or unparseable task record …` warning comes from the **duplicate-diagnosis scan** (`src/core/duplicate-task-repair.ts:116-124`), which skips and continues and sets no exit code. The exit 1 comes from the **corpus loader**: `src/core/persistent-task-read.ts:49-69` calls `listCompletedTasks()` with no catch and `src/file-system/task-repository.ts:82-101` propagates parse errors, so the list handler (`src/cli/features/tasks/register.ts:180-183`) returns 1. `search` shares that path and fails identically — the two commands are consistent. No test or doc contracts a non-zero exit for a *skipped* record; the two failing cases only expect exit 0 because their filters never load the corpus. And `6cb96c42 fix(tasks): enforce current-only local and Git reads` deliberately **removed** a catch that used to swallow non-fatal parse errors, so failing loudly is a recent decision rather than an accident.

**Options.**
- **(a) Keep strict; update the two `cli-task-list` expectations** to assert failure and name the offending record. **Recommended.**
- **(b) Restore tolerance in the corpus loader** (skip + warn, matching the duplicate scan). Reverses `6cb96c42` and risks re-hiding corrupt or foreign records.
- **(c) Keep strict, but improve the error** to name the file and the manual fix instead of a bare repeated `YAML Parse error`. Closest to the manual-repair stance, at some cost.

---

## Decision 4 — Do zero-padded ids stay distinct, or become aliases?

**Situation.** `zeroPaddedIds` is a supported, documented feature, so `TASK-01` is a legitimate identity form. But logical equality strips padding, so `task-1/` (TASK-1) and `task-01/` (TASK-01) are both valid container names while being logically equal. Allocation now refuses to mint such a pair, yet legacy or hand-made records can still contain both — and the product then rejects with an ambiguity error rather than silently guessing which one you meant. `src/test/local-task-command-performance.test.ts:276-305,334-380` builds exactly that collision and asserts the rejection: 2 failures.

A second suite depends on the same policy. `src/test/readiness-surface-agreement.test.ts` asserts a fail-closed result for an identity claimed by more than one record, but its fixture uses two records sharing one flat id — a shape canonical layout cannot represent — so it currently fails on an obsolete flat path. Rewriting it as a **padding** collision (`task-1/` versus `task-01/`) would make the scenario constructible, which is why its fix belongs with this decision rather than the fixture batch.

**Why it matters.** It decides whether the product absorbs the padding distinction (treating a padded id as an alias of the unpadded one) or treats it as a genuine separate identity whose collision is an error. An alias rule is compatibility behavior that must live in the codebase permanently — the same category as the flat-record support already removed.

**Options.**
- **(a) Keep them distinct and fail closed.** Collisions are reported, never guessed; the test asserts the rejection. Consistent with the standing policy. **Recommended.**
- **(b) Normalize padded ids to unpadded.** Friendlier for legacy data, but it keeps compatibility behavior forever and reintroduces ambiguity unless padding is dropped as a feature entirely.

**Recommendation: (a).** If padded ids ever need to go away, that is a one-time manual conversion of the padded records, not a permanent alias rule.

---

## Decision 5 — Pre-existing bug: task creation from a linked git worktree fails

**Situation.** `saveTask` throws `Task <id> resolves outside active task storage` when a task is created from a linked worktree. Confirmed by A/B testing **HEAD itself** in a temporary worktree: both `src/test/worktree-task-id-allocation.test.ts` (0/4) and `src/test/worktree-refresh.test.ts` (1/1) fail at HEAD with the same error. This predates the current session's work entirely — it is not a regression.

**Cause.** Two root notions disagree. `TaskArtifactRepository.root()` (`src/file-system/task-artifact-repository.ts:113–120`) deliberately maps a linked worktree's backlog path to the **main** worktree's store, so the container it returns lives under main. But `saveTask`'s guard compares that container's parent against the **active** root, which for a linked worktree is derived from that worktree's own resolved backlog directory (`src/file-system/operations.ts:197–204,363–365,733–736`). They can never match, so creation always throws.

**Why it matters.** Anyone running `backlog` from a git worktree cannot create tasks. The failing tests also imply a third expectation — that allocation should scan *sibling* worktrees for uncommitted tasks — which only makes sense if each worktree has its own store.

**Options.**
- **(a) Tasks live in the main worktree's store.** Make the active-root resolution use the same linked-worktree → main mapping as `root()`, so guard and container path agree. Small and coherent, but it contradicts what the sibling-scanning tests expect.
- **(b) Tasks live per worktree.** Drop the main-worktree remap from `root()` and let each worktree use its own `backlog/`, with the sibling scan doing cross-worktree allocation. Larger; changes storage semantics and how worktree tasks are found and committed.
- **(c) Leave it for now.** Out of the original scope; record it as a known pre-existing bug.

**Recommendation: (c) now, then (a) or (b) as its own piece of work.** It is a design question about where tasks live, not a compatibility issue, so it should not be folded into the legacy cleanup. If the sibling-scan tests encode the intended design, (b) is the better fit — but that needs confirming with whoever wrote them rather than my reading.

---

## Small rulings (either answer is fine)

1. **Demotion feedback — CONFIRMED regression; needs your intent.** MCP task responses silently drop the dependency-cleanup line. `src/mcp/tools/tasks/handlers.ts:383-387` (archive) and `:438-441` (edit/demote) compute `formatDependencyCleanupMessage(...)` and pass it to `formatTaskCallResult`, whose `_summaryLines` parameter (`src/mcp/utils/task-response.ts:8`) is accepted and **never rendered** — only `formatTaskPlainText` output is returned. So an MCP client is never told that dependent references were cleaned, and the computed message is dead code. `src/test/mcp-drafts.test.ts:137-153` asserts only the resulting state (`dependencies` is `[]`), which is why nothing catches it. Two options: restore the line for the cleanup cases, or delete the dead parameter and its two call sites and accept that responses do not report cleanup. Not changed unilaterally — it is user-visible.
2. **Archived ids are not reusable** (deliberate, above). Confirm you're comfortable with ids advancing rather than compacting after archive.

## Not decisions — status

- The suspect cluster of 24 newly surfaced failures (task-creation/demotion timeouts, `resolves outside active task storage`, vacated-id reuse, allocation returning `TASK-1` instead of `TASK-42`) is under diagnosis, reproduce-first, on a deliberately quiet machine.
- 32 pre-existing failures are being triaged read-only: legacy flat and schema-version-2 fixtures, plus stale text/tool-list assertions.
- A mechanical batch to convert the remaining legacy fixtures is authorized by the standing policy but held until the regression picture is clear.
- Not yet done: `bun run build`, and any commit.
