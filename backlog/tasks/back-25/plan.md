# Implementation Plan: Safe Workspace Task Deletion and Companion Overlay Opt-Out

**Superseded deletion plan:** use [BACK-27/plan.md](../back-27/plan.md) and its shared-runtime pointers. The old stop-before-delete and per-edit build procedure below is historical. Companion opt-out was handled separately; no approval/completion is implied.

**Branch**: `back-25` | **Date**: 2026-10-10 | **Spec**: `spec.md`

**Input**: Draft feature specification in `backlog/tasks/back-25/spec.md`

## Summary

Implement the P1 TUI task-deletion lifecycle fix in the existing Backlog TypeScript/Bun code, preserving ownership safeguards and ensuring cleanup failure prevents task-file removal and produces an actionable notice. Separately document the P2 user configuration contract for disabling only the OMO-slim Desktop Companion overlay; this overlay is part of an external plugin, not this repository. This planning phase does not write user config; later build-mode work may modify `~/.config/opencode/oh-my-opencode-slim.json` only after explicit out-of-repository permission, and otherwise must provide manual steps.

## Technical Context

- **Language/Version**: TypeScript; Bun runtime/tooling.
- **Primary Dependencies**: Existing Backlog core lifecycle, native-session manager, and OpenTUI workspace controller; no new dependency.
- **Storage**: Existing task files and native-session state; OMO-slim user JSON config is external to the repository.
- **Testing**: Targeted Bun tests listed below; manual validation of the rebuilt installed `backlog` binary for the TUI behavior.
- **Target Platform**: Existing supported Backlog CLI platforms; user-config example uses the specified OpenCode path `~/.config/opencode/oh-my-opencode-slim.json`.
- **Project Type**: TypeScript CLI with OpenTUI workspace interface.
- **Performance Goals**: No new latency target; session cleanup must complete or fail safely before task-file deletion.
- **Constraints**: Preserve foreign-session protection, task/session data on cleanup failure, and cancellation semantics. Rebuild `dist/backlog` after each code change and verify it is current before manual binary testing.
- **Scale/Scope**: Two independent user stories; one repository lifecycle change and one external-plugin configuration opt-out contract.

## Constitution Check

`.specify/extensions.yml` is absent. `.specify/memory/constitution.md` (if present) is a placeholder without enforceable principles; no additional project constitution gates can be derived. Apply repository `AGENTS.md`: after each code change run `bun run build`; run only affected tests; before claiming binary verification, confirm `find src -name '*.ts' -newer dist/backlog` prints nothing and test the rebuilt installed `backlog` binary. This draft plan makes no implementation changes and has not run these checks.

## Phase 0: Research

See `research.md`. Confirm lifecycle ownership/status transitions. The current evidence is not enough to claim the root cause of an absent TUI notice; trace its error/notice path during build work.

## Phase 1: Design and implementation direction

1. In the TUI deletion flow, preflight whether the associated native session is owned by another workspace. A foreign-owned RUNNING session must remain protected.
2. For an owned RUNNING native session, stop the owning host before core task deletion. `host.stop` parks a native session, so stopping alone is not sufficient: explicitly settle it safely to `STOPPED` before filesystem removal.
3. For a parked native session for the task, with no live owning process and `ownerPid` undefined, do not infer ownership from PID. Determine whether safe cleanup is possible using available task/session context; do not delete task or session data unless cleanup succeeds.
4. Preserve the task and all session data when cleanup fails; surface an actionable TUI notice. Preserve cancellation behavior. Core task deletion already awaits session cleanup before task-file removal; tests must protect this ordering.
5. Keep `#finalTaskRemoval` after successful core deletion unless code tracing proves a different safe ordering is required; it currently runs after `core.deleteTask`, so do not move it earlier blindly.
6. Do not change OMO-slim repository-wide defaults. This planning phase does not write user config. Later build-mode work may modify `~/.config/opencode/oh-my-opencode-slim.json` only after explicit out-of-repository permission; otherwise provide manual steps. Preserve other keys and verify after OpenCode restart.

### Target paths and tests

- `src/ui/opentui/workspace-controller.ts` (deletion confirmation/cleanup notice)
- `src/core/task-lifecycle-service.ts` (cleanup-before-file-removal lifecycle)
- `src/agent-workspace/sessions.ts` (native session state and ownership cleanup)
- `src/agent-workspace/workspace-state.ts` (workspace/session association)
- Targeted tests: `src/test/opentui-workspace-controller.test.ts`, `src/test/agent-sessions.test.ts`, `src/test/task-delete.test.ts`, `src/test/opentui-confirm.test.ts`

Use existing lifecycle APIs and test conventions; add/update only tests that cover the acceptance scenarios. Do not use live task BACK-25 as a deletion fixture: use a disposable task and isolated project/workspace fixture.

### Documentation outputs and omissions

This task introduces no new domain entities, so no `data-model.md` is needed. No new API or wire contract is introduced; the existing TUI deletion and external user-config contracts are captured in `spec.md`, `research.md`, and `quickstart.md`, so no `contracts/` directory is needed. `tasks.md` is a draft implementation checklist for user approval.

## Project Structure

### Documentation (this feature)

```text
backlog/tasks/back-25/
├── spec.md
├── plan.md
├── research.md
├── quickstart.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── ui/opentui/workspace-controller.ts
├── core/task-lifecycle-service.ts
└── agent-workspace/
    ├── sessions.ts
    └── workspace-state.ts

src/test/
├── opentui-workspace-controller.test.ts
├── agent-sessions.test.ts
├── task-delete.test.ts
└── opentui-confirm.test.ts
```

**Structure Decision**: Keep both changes within the existing TypeScript/Bun repository structure. The OMO-slim opt-out is external configuration guidance, not a Backlog source/config change.

## Validation Gate for Build Work

For each individual code change: immediately run `bun run build`. Then verify `find src -name '*.ts' -newer dist/backlog` prints nothing before manually exercising the rebuilt installed `backlog` binary. Run the targeted test files relevant to each change; implementation validation remains a separate build-phase activity.
