---
consolidation:
  total: 20
  counts:
    exists: 1
    discard: 18
    integrate: 0
    unconfirmed: 1
  percentages:
    exists: 5.00%
    discard: 90.00%
    integrate: 0.00%
    unconfirmed: 5.00%
---

# Consolidation audit (derived reconciliation record)

> **Non-authoritative supporting material.** This file is not a contract. Authoritative owner(s): [PRODUCT](PRODUCT.md), [SPEC](SPEC.md), [BLUEPRINT](BLUEPRINT.md), [CONVENTIONS](CONVENTIONS.md), [DESIGN-SYSTEM](DESIGN-SYSTEM.md), [ADRs](adr/README.md).
> Disposition: Fold then retire.

This compact ledger reconciles confirmed answer sources to owning core contracts and records unresolved proof/decision work. It is **derived**, not an approval source and not a full reverse audit of every core claim. Core contracts are the source of truth. Consolidation annotations, reports, current core wording, and implementation are not approval evidence. Separate source-audit maps document questionnaire 1–3 and decision-sheet coverage; this ledger links to repository primary sources below and does not replace those audits. <!-- consolidation: discard; ref: none; reason: Derived audit scope and evidentiary limitations are historical reconciliation metadata. -->

## Source registry

- Task decisions on literal IDs, duplicate handling, persistence, and non-reuse are consolidated in [task requirements](specs/tasks.md#requirements) and [task storage](specs/tasks.md#tasks-and-storage).
- Supported operation dispositions and collection warnings are consolidated in [supported integration operations](specs/supported-integration-operations.md#supported-integration-operations).
- Testing decisions, CLI process boundaries, watcher testing, and bounded input behavior are consolidated in [CONVENTIONS testing](CONVENTIONS.md#testing), [task artifact behavior](specs/tasks.md#using-task-artifacts), and [session observation](specs/sessions.md#observe-and-detach-from-a-live-session).
- Session persistence and ownership decisions are consolidated in [BLUEPRINT](BLUEPRINT.md#component-ownership) and [durable conversation and operation records](BLUEPRINT.md#durable-conversation-and-operation-records).
- [`questionnaire.md`](questionnaire.md), DEC-006; [`questionnaire-02.md`](questionnaire-02.md), items 1 and 5; [`questionnaire-03.md`](questionnaire-03.md), sections 3–6, 10, 18, 20, 23: answered questionnaire items only; unanswered recommendations remain unapproved. <!-- consolidation: discard; ref: none; reason: Source registry is a historical source pointer. -->
- Session creation, rollback, persistence, and ownership requirements are consolidated in [new session](BLUEPRINT.md#new-session), [authoritative mutation and publication](BLUEPRINT.md#authoritative-mutation-and-publication), and [component ownership](BLUEPRINT.md#component-ownership).

## Source → core trace groups

| Confirmed source | Decision/coverage | Owning destination and ledger trace |
|---|---|---|
| [questionnaire.md](questionnaire.md) DEC-006; [questionnaire-02.md](questionnaire-02.md) item 1 | Persist only essential product/recovery information; no need for deliberate-stop versus failure history. | [CONVENTIONS: changes/refactoring](CONVENTIONS.md#changes-and-refactoring); session identity/observation owner; no runtime proof implied. | <!-- consolidation: discard; ref: none; reason: Derived source-to-contract trace, not approval. -->
| Task requirements and storage contracts | Prevent duplicate identities; no automatic repair; actionable partial collection warning with readable results. | Task model, project store, and supported API feature owners; ACT-4/INV-1. Application-produced corruption is fixed at its source. | <!-- consolidation: discard; ref: none; reason: Derived source-to-contract trace, not approval. -->
| [Task identity](specs/tasks.md#requirements) | IDs are literal whole strings; archived IDs are not reused. | Task identity owner; see [task model](specs/tasks.md#requirements). | <!-- consolidation: discard; ref: none; reason: Derived source-to-contract trace, not approval. -->
| [CONVENTIONS: test ownership](CONVENTIONS.md#testing); [questionnaire-02.md](questionnaire-02.md) item 2 | Tests follow the spec; inconsistent callers/tests are bugs, not authority. | [CONVENTIONS: test ownership](CONVENTIONS.md#testing). | <!-- consolidation: discard; ref: none; reason: Derived source-to-contract trace, not approval. -->
| [Supported integration operations](specs/supported-integration-operations.md#supported-integration-operations); [questionnaire-03.md](questionnaire-03.md) §§18/20/23 | Approved doctor/reset/board-export/`--no-git` dispositions, with exact scope per answer. | Supported API/task owners and ACT-3/6. Not all command-family questions are settled. | <!-- consolidation: discard; ref: none; reason: Derived source-to-contract trace, not approval. -->
| [questionnaire-03.md](questionnaire-03.md) §§1–6, 10, 18, 20, 23 | Feature-specific task, completion, store, mode, artifact, and integration outcomes. | Corresponding linked feature contracts; actions remain open where implementation proof or exact CLI scope remains outstanding. | <!-- consolidation: discard; ref: none; reason: Derived source-to-contract trace, not approval. -->
| [questionnaire-05.md](questionnaire-05.md) §11; [questionnaire-06.md](questionnaire-06.md) command questions | TUI setup/settings affirmed; exact remaining command inventory unanswered. MCP use versus overhead is conditional, not a retention result. | [DEC-5](alignment-plan.md#dec-5-questionnaire-6-parent-decision-fold); exact commands remain open. | <!-- consolidation: discard; ref: none; reason: Derived source-to-contract trace, not approval. -->
| [CONVENTIONS test ownership](CONVENTIONS.md#testing); [task artifact behavior](specs/tasks.md#using-task-artifacts); [session observation](specs/sessions.md#observe-and-detach-from-a-live-session) | Source-based tests; few basic observable-result e2e flows; per-case process classification; visible watcher result and low-level same-size/same-mtime detection; bounded in-flight input. | [CONVENTIONS test ownership](CONVENTIONS.md#testing); live-terminal contract and [retained-reference conflicts](alignment-plan.md#retained-reference-conflicts-requiring-reconciliation). No periodic-recheck guarantee. | <!-- consolidation: discard; ref: none; reason: Derived source-to-contract trace, not approval. -->
| [CONVENTIONS test ownership](CONVENTIONS.md#testing) | In-process ordinary CLI cases; true process-boundary exceptions; serialize `runCli`; direct service tests; retain a small binary check. | [CONVENTIONS test ownership](CONVENTIONS.md#testing); exact scope below. See alignment ledger for action/evidence tracking; packaging wording deferred and Sheet 9 unanswered. | <!-- consolidation: discard; ref: none; reason: Derived source-to-contract trace, not approval. -->
| [Session deletion and launch contracts](specs/sessions.md#sessions); [component ownership](BLUEPRINT.md#component-ownership) | Forget-only deletion/no-signalling, existing per-mode launch admission, bootstrap/log/output preservation, and scoped shared-runtime direction. | [ACT-1/8/9/15/19/23](alignment-plan.md#implementation-actions) and [retained-reference conflicts](alignment-plan.md#retained-reference-conflicts-requiring-reconciliation); preserve safety gates. | <!-- consolidation: discard; ref: none; reason: Derived source-to-contract trace, not approval. -->
| [Session persistence and ownership](BLUEPRINT.md#durable-conversation-and-operation-records) | Historical OpenCode sessions target v2 for separately authorized manual migration; preserve IDs/history. | [DEC-6](alignment-plan.md#dec-6-existing-data-affected-by-removals); execution requires inventory, backup, quiescence, native compatibility and staged validation. Stable identity/preset configuration link to [BLUEPRINT](BLUEPRINT.md). | <!-- consolidation: discard; ref: none; reason: Derived source-to-contract trace, not approval. -->

## Narrow approved test scope and open evidence

- Approved conversion targets: `cli-init-input`, `cli-init-cursor-pty` (retain no-editor assertion), two spawned rejection cases in `opentui-mode-startup-contract`, and json-watch one-shot comparison/invalid-option cases. Preserve actual watch-process cases. App-logic CLI cases convert in-process; direct service tests remain direct. Only the obsolete external-editor handoff case and its editor-only helper were approved for deletion; no whole suite was approved for deletion. <!-- consolidation: discard; ref: none; reason: Historical bounded test-scope record. -->
- Reference-cleanup tests assert resulting state; cleanup wording is decorative. This does not approve broad output-text assertions or separate dependency-removal policy. <!-- consolidation: discard; ref: none; reason: Historical test-scope record. -->
- Preserve sheet 7's approved small compiled-binary check; sheet 8's later assistant narrative did not supersede it. Packaging wording was deferred. Sheet 9 contains no answer. See the alignment ledger for action/evidence tracking. <!-- consolidation: discard; ref: none; reason: Historical decision-sheet status. -->
- Stale-worktree pruning was a one-time conditional permission only: prove registrations are stale and no data/code can be lost before any action. It is not standing cleanup authorization. <!-- consolidation: discard; ref: none; reason: Historical conditional authorization record. -->
- Approved in-flight input may finish for up to two seconds on close/deletion, then report if not delivered. Queued/undispatched input, timeout aftermath, exact error presentation, and detach promise/error-channel semantics remain open. <!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Detailed timeout and queued-input behavior remains unresolved. -->
- Watcher A′: assert external edit becomes visible; low-level test covers same-size/same-mtime detection. No periodic recheck, always-notice behavior, or deletion of the visible-result case is authorized. <!-- consolidation: discard; ref: none; reason: Historical approved test scope and limits. -->

Core claims outside these trace groups may lack confirmed evidence and have not been validated by this compact ledger. Earlier mapping percentages/counts are not deletion-ready or completeness proof. No action, runtime migration, verification gate, or source-retirement permission is claimed complete. <!-- consolidation: exists; ref: docs/README.md#work-and-evidence; reason: Supporting evidence is not authority or proof of completeness. -->
