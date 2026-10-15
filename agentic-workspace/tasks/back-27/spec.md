# BACK-27 — Delete tasks without stopping linked sessions

Status: Draft for user approval.

## Outcome

Confirming deletion removes a task and its AgenticWorkspace-owned task/session associations, regardless of whether linked sessions are RUNNING, STARTING, PARKED, or stopped and regardless of which workspace owns them. It does **not** stop or kill a process, delete an OpenCode conversation, or remove a Git worktree or branch. Cancellation changes nothing. This replaces the deletion story in the obsolete BACK-25 draft; the Companion opt-out was handled separately and is out of scope.

Runtime-policy boundary: deletion remains forget-only and must not signal processes. Non-deletion stop, completion, and resume follow the [shared runtime plan](../../../docs/shared-agent-server-plan.md#backend-completion-and-exact-resume): instance-owned tmux lifecycle, exact saved native identity, and no promise of descendant termination or global native-ID exclusion. This reference does not expand deletion scope.

Implementation constraints: the [runtime simplification findings](../../../docs/shared-agent-runtime-simplification.md) do not expand this task to per-session CLI deletion or other runtime policies. Keep one Core association-only forget path under caller-held task/reference/admission locks, without reacquiring them, regardless of status, flag or owner. Remove exact owned sidecars/markers before metadata/container removal; perform no tmux probe. Controller removal only detaches/disposes locally; it does not perform a second purge or observation-triggered teardown. Marker and original copied-record/pane-callback provenance must prevent resurrection or task-ID replacement; cleanup failures retain retry inventory and report truthful partial completion. This spec remains Draft; the reference is not approval or runtime acceptance.

## Acceptance criteria

1. Confirmed task deletion removes the task container, task-scoped AgenticWorkspace session history/active pointers, request markers, and known AgenticWorkspace-owned task sidecars/logs for linked native and CLI sessions across modes. It never uses a session's status or owner PID as permission to stop or block deletion. Deletion is scoped to the exact project, task and session identities; persisted paths cannot cause deletion of provider storage, another task's files, or arbitrary filesystem targets.
2. A running owned or foreign native/CLI process is not stopped or killed by deletion, by the deleting workspace's later teardown, or by orphan cleanup. Its OpenCode conversation is not deleted. AgenticWorkspace stops managing the detached process and does not reattach it to the deleted task.
3. Deleting a task neither removes nor changes its Git worktree or branch. Non-deletion completion/stop behavior remains separate from deletion and follows the shared runtime policy linked above.
4. Explicit TUI deletion, observation of deletion from another workspace, pending launch/adoption, delayed output/status callbacks, and concurrent task-ID reuse must not recreate a deleted task's AgenticWorkspace association, stop a detached process, or mutate a replacement task's association. Repeated detach/removal is safe.
5. Cancelling confirmation does not delete files, detach hosts, stop processes, or change session records.
6. Failures are reported truthfully: before task removal, preserve the task and explain the failure; after removal, report that deletion committed but AgenticWorkspace cleanup is incomplete and give a safe retry/recovery action. No silent claim of full rollback after a committed removal.

## Deliberate limits

- Remove known AgenticWorkspace-owned task files at deletion time even when a live process might still need them; the user accepts possible disruption of that process without a stop signal. An already-running hook may recreate an activity file later. Permanent absence of such files is **not** guaranteed; the task and its AgenticWorkspace association must stay gone.
- Do not delete provider-managed conversation data or follow untrusted session-record paths. Do not introduce a transaction journal or restart stopped agents for rollback.
- No Companion configuration work and no deletion of Git worktrees or branches.

## Verification

Use isolated disposable tasks, including owned and foreign running sessions, parked sessions with undefined owner PID, CLI sessions, pending adoption, cancellation, and task-ID reuse. Assert zero stop/kill/provider-delete/Git removal calls, correct task/AgenticWorkspace-state removal, conversation preservation, no reattachment, and truthful notices on injected failures. Never delete BACK-27 as a fixture.
