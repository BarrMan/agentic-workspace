# BACK-27 — Execution checklist (draft)

Unchecked items are remaining proof/reconciliation gates, not a claim that no implementation exists. Use the [handoff](../../../../../docs/agentic-workspace/shared-agent-runtime-handoff.md) for the current source checkpoint and the [remediation plan](../../../../../docs/agentic-workspace/test-suite-remediation-plan.md) before changing a failing area. Use isolated disposable tasks; never use BACK-27 as a deletion fixture.

Execution is PAUSED for user handoff; preserve this checklist without advancing implementation, dispatch, commits or builds. The runtime plan's [cross-mode admission recommendation](../../../../../docs/agentic-workspace/shared-agent-server-plan.md#1-simplify-classification-admission-and-local-selection) remains unimplemented, with controller proof failing.

## Phase 1 — Baseline and tests

- [ ] T1 Reconcile current uncommitted deletion changes with `spec.md`; identify all deletion callers, host teardown/sweep paths, task-state writers, and exact AgenticWorkspace-owned cleanup targets. Record gaps without touching unrelated work.
- [ ] T2 [parallel with T3] Extend task/core and session-service tests for owned/foreign native and CLI sessions (RUNNING, STARTING, PARKED), exact identity/path scoping, no stop/kill/provider delete, task-state removal, worktree/branch preservation, and pre-/post-removal failure outcomes.
- [ ] T3 [parallel with T2] Extend UI/host tests for cancellation, direct and external removal, pending launch/adoption, post-delete callbacks, process-exit and startup sweep, and replacement task with reused ID. Assert no reattachment or unintended stop.

## Phase 2 — Implementation

- [ ] T4 [after T1, T2] Introduce a deletion-only association cleanup in core/session storage, leaving completion and explicit stop intact. Protect exact task/session identities and scoped file removal; keep destructive cleanup within the deletion exclusion window and report the commit boundary truthfully.
- [ ] T5 [after T1, T3; separate ownership from T4] Implement idempotent host release and callback/adoption invalidation, including exit teardown and startup sweep behavior; do not stop detached native or CLI processes. Guard state writes against deleted/reused task identities.
- [ ] T6 [after T4, T5] Wire TUI confirmation and external-removal observation to detach without stop, preserve cancel, remove redundant unlocked purge, and show actionable pre-/post-removal notices.

## Phase 3 — Verification

- [ ] T7 [after T4–T6] Reconcile targeted source proof and regression sensitivity; parent runs assembled typecheck/scoped lint/diff checks, rebuilds MAIN after integration, checks source freshness, and verifies the rebuilt installed command with explicitly permitted disposable isolated fixtures. Confirm provider conversation and Git worktree/branch preservation; do not infer acceptance or artifact approval from source tests.

T2 and T3 can proceed in parallel with disjoint writers. T4 and T5 coordinate fixed shared APIs; T6 is the integration gate. The runtime plan governs authorized implementation and verified-slice commits; these artifacts remain drafts without recorded user approval.
