# Feature Specification: Safe Workspace Task Deletion and Companion Overlay Opt-Out

**Superseded deletion draft:** use [BACK-27/spec.md](../back-27/spec.md) for task forget-only deletion. The deletion requirements below are historical, not implementation instructions. Companion opt-out was handled separately; this pointer does not claim artifact approval or task completion.

**Feature Branch**: `back-25`

**Created**: 2026-10-10

**Status**: Draft

**Input**: User description: Two independent fixes: safely delete workspace tasks with native sessions, and persistently disable only the OMO-slim Desktop Companion overlay.

## User Scenarios & Testing

### User Story 1 - Delete a task with native sessions safely (Priority: P1)

From the AgenticWorkspace workspace TUI, a user confirms task deletion with Enter. Deletion safely cleans up an owned RUNNING native session or a parked native session for the task, with no live owning process, before removing task files. A RUNNING native session owned by another workspace remains protected.

**Why this priority**: Task deletion must complete for supported workspace sessions while avoiding loss of active or foreign-owned session data.

**Independent Test**: In an isolated workspace, separately confirm deletion of disposable tasks with an owned RUNNING native session and a parked native session for the task with no live owning process; verify safe cleanup and verify a foreign-owned RUNNING session is protected.

**Acceptance Scenarios**:

1. **Given** a disposable task with a RUNNING native session owned by the workspace, **When** the user confirms deletion with Enter, **Then** the session is stopped/settled safely before filesystem deletion and the task is permanently removed.
2. **Given** a disposable task with a parked native session for the task and no live owning process, **When** the user confirms deletion with Enter, **Then** safe preflight and cleanup complete before the task is permanently removed.
3. **Given** a task associated with a RUNNING native session owned by another workspace, **When** the user confirms deletion, **Then** the foreign session remains protected and its data is not removed.
4. **Given** session cleanup fails, **When** the user confirms deletion, **Then** the task and session data remain and the TUI displays an actionable notice.
5. **Given** a task awaiting deletion confirmation, **When** the user cancels, **Then** the task and all session data remain unchanged.

---

### User Story 2 - Disable only the Desktop Companion overlay (Priority: P2)

A user opts out of the OMO-slim Desktop Companion overlay by setting `companion.enabled` to `false` in `~/.config/opencode/oh-my-opencode-slim.json` and restarting OpenCode. Other OMO-slim functionality remains active.

**Why this priority**: Users who do not want the overlay need a persistent, user-scoped opt-out without disabling core OMO-slim functionality or changing defaults for other users.

**Independent Test**: Set the nested user configuration value to false, restart OpenCode, and verify the Desktop Companion overlay is disabled while core OMO-slim remains active and existing configuration is preserved.

**Acceptance Scenarios**:

1. **Given** OMO-slim is configured and `companion.enabled` is set to `false` in the specified user config, **When** OpenCode restarts, **Then** only the Desktop Companion overlay is disabled and core OMO-slim remains active.
2. **Given** the user config contains other existing settings, **When** the opt-out is applied, **Then** those settings are preserved and no repository-wide default is changed.

## Requirements

### Functional Requirements

- **FR-001**: On confirmed TUI task deletion, the system MUST safely stop or settle an owned RUNNING native session before deleting task files.
- **FR-002**: The system MUST safely preflight and clean up a parked native session for the task, with no live owning process, before deleting task files; it MUST NOT infer ownership from `ownerPid`.
- **FR-003**: The system MUST protect a RUNNING native session owned by another workspace from deletion.
- **FR-004**: If session cleanup fails, the system MUST retain the task and session data and show an actionable notice.
- **FR-005**: Cancelling the deletion confirmation MUST leave the task and its session data unchanged.
- **FR-006**: The user MUST be able to persistently disable only the OMO-slim Desktop Companion overlay using `companion.enabled=false` in `~/.config/opencode/oh-my-opencode-slim.json`.
- **FR-007**: Disabling the overlay MUST leave core OMO-slim functionality active, preserve existing user configuration, and not change repository-wide defaults.

## Assumptions

- The scope is the two user-requested fixes described above, not the current BACK-25 title's environment-variable injection topic.
- A parked native session for the task has no live owning process and has `ownerPid` undefined; safe preflight must use available task/session context, not infer ownership from PID.
- The user configuration path and nested setting are the intended persistent opt-out contract; existing settings must be retained.
- Source evidence indicates task deletion awaits session cleanup before file deletion, while session cleanup currently rejects native RUNNING and PARKED states; this does not establish the root cause of any missing TUI notice.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In isolated tests, 100% of confirmed deletions for owned RUNNING and parked native-session-for-task cases complete only after safe session cleanup, with the task removed.
- **SC-002**: In isolated tests, 100% of foreign-owned RUNNING sessions remain protected, and every simulated cleanup failure retains task/session data and presents an actionable notice.
- **SC-003**: After restart with the specified setting false, the Desktop Companion overlay is absent while core OMO-slim remains active; unrelated config values remain unchanged.
