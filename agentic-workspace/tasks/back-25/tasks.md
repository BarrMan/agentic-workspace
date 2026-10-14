---
description: "Implementation tasks for BACK-25 two-fix draft"
---

# Tasks: Safe Workspace Task Deletion and Companion Overlay Opt-Out

**Superseded deletion work graph:** use [BACK-27/tasks.md](../back-27/tasks.md); do not execute the old stop-before-delete checklist below. Companion opt-out was handled separately. Existing checkboxes and approval status are preserved, not new proof.

**Input**: `spec.md`, `plan.md`, `research.md`, `quickstart.md` in `agentic-workspace/tasks/back-25/`

**Prerequisites**: Draft spec and plan submitted for user approval; research and quickstart available.

**Organization**: Tasks are grouped by setup, foundation, and independently testable user story. Story 1 is the P1 MVP; Story 2 can proceed independently after setup.

## Format: `[ID] [P?] [Story] Description`

- `[P]` means independent work in different files with no dependency.
- `[US1]` and `[US2]` map to the spec's P1 and P2 stories.
- Each implementation task names its exact repository path; the external user config path is explicit.

## Phase 1: Setup

**Purpose**: Confirm existing test infrastructure; no new dependencies, schema, or scaffolding are needed.

- [x] T001 Verify existing fixture/test entry points and targeted test runner usage in `src/test/opentui-workspace-controller.test.ts`, `src/test/agent-sessions.test.ts`, `src/test/task-delete.test.ts`, and `src/test/opentui-confirm.test.ts`.

## Phase 2: Foundational

**Purpose**: Resolve existing lifecycle contracts before US1 implementation; US2 does not depend on this lifecycle research.

- [x] T002 Trace workspace/session context and native RUNNING, PARKED, and STOPPED transitions in `src/agent-workspace/sessions.ts` and `src/agent-workspace/workspace-state.ts`; confirm the supported safe settlement/preflight path and failure propagation without weakening foreign-owner protection.

**Checkpoint**: Existing fixtures and lifecycle contracts understood for US1; no new infrastructure is introduced.

## Phase 3: User Story 1 - Delete a task with native sessions safely (Priority: P1) 🎯 MVP

**Goal**: Confirmed deletion safely settles owned RUNNING or parked native sessions for the task, protects foreign-owned RUNNING sessions, retains data on cleanup failure, and cancellation preserves all data.

**Independent Test**: In an isolated disposable project/workspace, verify confirmed deletion for an owned RUNNING session and a parked native session for the task with no live owning process, foreign-owner protection, failure notice/data retention, and cancel preservation. Never delete live task BACK-25.

### Tests for User Story 1

- [x] T003 [P] [US1] Add/update TUI regression tests for Enter confirmation, cancel preservation, and an actionable cleanup-failure notice that confirms task/session data remain in `src/test/opentui-workspace-controller.test.ts` and `src/test/opentui-confirm.test.ts`.
- [x] T004 [P] [US1] Add/update lifecycle tests for safe owned RUNNING cleanup, safe preflight/cleanup of a parked native session for the task with no live owning process, foreign-owned RUNNING protection, and task/session retention on cleanup failure; assert existing awaited cleanup-before-file-removal behavior in `src/test/agent-sessions.test.ts` and `src/test/task-delete.test.ts`.

### Implementation for User Story 1

- [x] T005 [US1] Implement safe native-session cleanup and workspace-context preflight for owned RUNNING and parked sessions, preserving the foreign-owner guard and not relying on `ownerPid` for parked sessions, in `src/agent-workspace/sessions.ts` and `src/agent-workspace/workspace-state.ts`.
- [ ] T006 [US1] Order TUI deletion to preflight foreign ownership, stop an owned host before core deletion, explicitly settle the parked result to STOPPED, surface cleanup failure actionably without deleting task/session data, and retain `#finalTaskRemoval` after successful deletion in `src/ui/opentui/workspace-controller.ts`.

**Checkpoint**: Story 1 passes its targeted tests and can be demonstrated only against disposable fixtures. `src/core/task-lifecycle-service.ts` already awaits cleanup before filesystem removal; preserve and test that existing behavior rather than adding a redundant implementation task.

## Phase 4: User Story 2 - Disable only the Desktop Companion overlay (Priority: P2)

**Goal**: Persistently opt out of only the OMO-slim Desktop Companion overlay while retaining core OMO-slim and existing user settings.

**Independent Test**: With user permission, set the nested opt-out, restart OpenCode, and verify overlay off/core OMO-slim active with unrelated settings preserved; without permission, provide the manual quickstart steps and leave the config untouched.

- [ ] T007 [US2] Obtain permission before changing the external user file `~/.config/opencode/oh-my-opencode-slim.json`; if authorized, merge only `companion.enabled=false` while preserving other keys, restart OpenCode, and verify the overlay is disabled while core OMO-slim remains active; otherwise provide the manual steps in `agentic-workspace/tasks/back-25/quickstart.md` and make no config write.

**Checkpoint**: Story 2 is validated independently; no AgenticWorkspace source, repository config, or repository-wide defaults are changed for this story.

## Phase 5: Polish & Cross-Cutting Validation

**Purpose**: Run targeted checks and verify the installed binary only after relevant code changes.

- [ ] T008 Run relevant targeted tests from `src/test/opentui-workspace-controller.test.ts`, `src/test/agent-sessions.test.ts`, `src/test/task-delete.test.ts`, and `src/test/opentui-confirm.test.ts`; immediately run `bun run build` after EACH code change, confirm `find src -name '*.ts' -newer dist/agentic-workspace` prints nothing, then manually retest the installed `agentic-workspace` binary against a disposable task (never BACK-25), following `agentic-workspace/tasks/back-25/quickstart.md`.

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Start immediately; confirms existing test harness only.
- **Foundational (Phase 2)**: Depends on setup; blocks US1 lifecycle implementation decisions until ownership/state transitions are traced. It does not block US2.
- **User Story 1 (Phase 3)**: Depends on setup and T002 foundational lifecycle research; P1 is the MVP.
- **User Story 2 (Phase 4)**: May start after setup without waiting for T002 or US1; it requires user authorization before touching the external user config.
- **Polish (Phase 5)**: After code changes and intended user stories; rebuild and manual binary verification are mandatory for code changes.

### Within User Story 1

- The TUI and lifecycle test work (T003/T004) should be completed before implementation; those tests target separate files and may proceed in parallel.
- T005 establishes safe state/context cleanup; T006 coordinates TUI ordering and the notice using those lifecycle guarantees.
- Existing cleanup-before-file-removal behavior in `src/core/task-lifecycle-service.ts` must remain protected by the test in T004; no separate implementation task is needed.
- No task may use the live BACK-25 task as a deletion fixture.

### Parallel Opportunities

- US2 can proceed after T001 in parallel with US1 lifecycle research and implementation, subject to user permission for the external config write.
- US1 TUI and lifecycle tests may proceed in parallel after setup/foundational checks, as they target different files.

## Implementation Strategy

### MVP First

Complete setup, trace the lifecycle contract, then implement and independently validate P1 User Story 1. Story 2 is a separate P2 increment and does not require AgenticWorkspace code changes.

### Incremental Delivery

Validate US1 against disposable fixtures and the rebuilt installed binary. Validate US2 only after permission for the user-level config change, or leave the config unchanged and provide the manual quickstart steps.
