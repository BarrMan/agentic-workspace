# Research: BACK-25 Two-Fix Draft

**Historical draft evidence:** Decision 1's stop/foreign-owner deletion direction is superseded by [BACK-27/spec.md](../back-27/spec.md). It is not an accepted ADR or current lifecycle instruction. Companion opt-out was handled separately; retained source observations are not a fresh audit.

## Decision 1: Preserve session ownership and settle before task deletion

**Decision**: Handle native-session state and ownership before task-file removal. Preflight foreign-workspace RUNNING sessions and leave them protected. Stop an owned RUNNING session through its owning host, then explicitly settle it to `STOPPED`; `host.stop` parks native sessions and does not by itself satisfy the deletion requirement. For a parked native session for the task, with no live owning process and `ownerPid` undefined, do not infer ownership from PID; require safe preflight using available task/session context before cleanup. On any cleanup failure, retain task/session data and surface an actionable notice. Keep `#finalTaskRemoval` after successful deletion unless implementation tracing establishes a safe alternative.

**Rationale**: The inspected lifecycle currently calls `core.deleteTask` before `finalTaskRemoval` in `src/ui/opentui/workspace-controller.ts:2580-2615`; the core lifecycle awaits `cleanupTaskSessions` before deleting the task file in `src/core/task-lifecycle-service.ts:139-159`. Native `host.stop` parks sessions in `src/ui/opentui/workspace-controller.ts:1755-1772`; `finishNativeSession` marks a session STOPPED in `src/agent-workspace/sessions.ts:644-652`; session cleanup currently rejects native RUNNING and PARKED states in `src/agent-workspace/sessions.ts:1003-1028`. Workspace association/state logic is in `src/agent-workspace/workspace-state.ts:87-102`. Parked sessions have no live owning process and may have `ownerPid` undefined; this is not evidence of workspace ownership.

**Alternatives**:
- Delete task files first and clean sessions afterward: rejected because failure could leave the user without the task while session data remains.
- Treat `host.stop` as complete cleanup: rejected because it parks native sessions.
- Use `ownerPid` to authorize parked-session cleanup: rejected because parked sessions have no live owner PID.
- Move `#finalTaskRemoval` before core deletion without tracing: rejected because it currently follows core deletion and its ordering contract is not established.

## Decision 2: Keep the companion opt-out user-scoped and external

**Decision**: The intended user action is to set nested `companion.enabled` to `false` in `~/.config/opencode/oh-my-opencode-slim.json`, preserve all other config, and restart OpenCode. Do not modify Backlog or repository-wide defaults. This planning phase does not write the user config; later build-mode work may change it only after explicit out-of-repository permission, and otherwise must provide manual steps.

**Rationale**: The upstream OMO-slim configuration and Companion documentation describe nested companion configuration and a restart caveat:
- [Configuration documentation](https://github.com/alvinunreal/oh-my-opencode-slim/blob/master/docs/configuration.md)
- [Desktop Companion documentation](https://github.com/alvinunreal/oh-my-opencode-slim/blob/master/docs/companion.md)

These links support the requested configuration approach; the installed OMO-slim version and its exact behavior are unverified.

**Alternatives**:
- Disable OMO-slim entirely: rejected because it also disables core functionality.
- Change a repository-wide default: rejected because the request is a persistent per-user opt-out.
- Have this repository write the user's config: rejected because it is outside scope and requires explicit permission for an out-of-repository write.

## Build-time checks still required

- Trace the current TUI failure path and identify whether/how an actionable notice is shown on cleanup failure. The evidence above does not prove the root cause of any missing notice.
- Confirm how available task/session context safely preflights a parked session for the task, while preserving foreign-owner protection.
- Confirm that `finishNativeSession` is the correct safe settlement mechanism for an owned RUNNING session before deletion, including error handling and persistence ordering.
- Verify the cited upstream configuration behavior against the installed OMO-slim version before relying on it; the installed version has not been checked.
