## Definition of Done

- [x] bunx tsc --noEmit passes when TypeScript touched
- [x] bun run check . passes when formatting/linting touched
- [x] bun test (or scoped test) passes

## Implementation Plan

Root cause: the selected task row hard-codes its activity dot to SELECTED_SESSION_FOREGROUND (#166534, green) at src/ui/opentui/workspace.ts:456, so the dot never reflects waiting/idle/error/starting while the row is selected. The active session task is normally the selected row, hence "green is not changing when a session really is in progress".

Fix:
- Add getSelectedActivityColor(activity) to src/ui/status-icon.ts: contrast-safe (>=4.5 on #cbd5e1) darker variants: starting cyan-700, running green-700, waiting amber-700, idle gray-600, error red-700; default #166534.
- workspace.ts: use getSelectedActivityColor(activity) for the selected row instead of the constant.
- Tests: extend status-icon.test.ts; update opentui-workspace-layout.test.ts expectSelection and add a selected-row activity-transition regression test.

Verification: bunx tsc --noEmit; bun run check .; bun test src/test/opentui-workspace-layout.test.ts src/test/status-icon.test.ts; bun run build + find src -name "*.ts" -newer dist/backlog prints nothing.

## Implementation Notes

Implemented (2): resolveInProgressStatus in src/utils/status.ts; WorkspaceStateService.activateSession now awaits activateNativeSession then best-effort ensureTaskInProgress (core.updateTaskFromInput, includeCrossBranch:false, skip terminal/already-in-progress, guard target !== terminal) and returns the resolved status. Controller workspace-controller.ts added #followActivationStatus, invoked at both non-attach activation sites (1167/1302) with the adopt flag; persists {activeStatus, selectedTaskId} so the tab follows and the task stays selected. Docs updated: guidelines/cli-instructions/agent-workspace.md, docs/opentui-workspace-spec.md, docs/opentui-workspace-session-contract.md. Tests: new src/test/status-resolution.test.ts, src/test/workspace-state-in-progress.test.ts (4 cases incl. 2-status terminal guard), and a controller tab-follow case.

Verified: bunx tsc --noEmit pass; bun run check . pass; tests pass (workspace-state/status-resolution 8/0, controller 33/0, agent-sessions+layout+terminal-status 63/0/1 skip, layout+tabs+nav+config+status-icon 98/0/1 skip). Independent subagent confirmed each risk (attach/adopt/terminal/idempotent/refresh-loop/selection-preserved). Rebuilt dist/backlog; find src -name "*.ts" -newer dist/backlog empty. Status intentionally left In Progress pending user confirmation before Done. Note: manual TUI smoke not performed.

## Final Summary

Selected task-row activity dot now reflects derived activity (running/waiting/idle/error/starting) via a contrast-safe palette instead of a fixed green.