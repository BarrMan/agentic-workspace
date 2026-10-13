## Acceptance Criteria

- [x] Workspace task pane renders all tasks in one flat list, no status tabs, sorted by configured status order with unknown statuses appended last.
- [x] Rows in the terminal configured status render with strikethrough text.
- [x] activeStatus persists as a cursor only and no longer filters the workspace list; board behavior unchanged.
- [x] src/ui/opentui/status-tabs.ts and src/test/opentui-status-tabs.test.ts are deleted; no status-tab code remains.
- [x] Shift+Z sets the selected task status to the terminal configured status; when already done the shortcut is hidden and does nothing.
- [x] Shift+D shows a Y/N confirmation and, on confirm, permanently removes the task file, its references/dependency links in other tasks, and its session directory; with autoCommit the removal is committed.
- [ ] Left/Right arrows no longer jump between status groups: bindings removed from keymap, keybindings, and workspace view; statusCursor/onStatusChange machinery deleted.
- [ ] Workspace task list pane matches AOE's session-list width: fixed 35 columns, clamped so the preview keeps >=40 columns (floor 10), responsive to resize.

## Definition of Done

- [x] bunx tsc --noEmit passes when TypeScript touched
- [x] bun run check . passes when formatting/linting touched
- [x] bun test (or scoped test) passes

## Implementation Plan

PHASE 1 - Flat list (src/ui/opentui/workspace.ts)
- Remove import mountWorkspaceStatusTabs (line 20), the taskTabRow box (287-291), the statusTabs mount + taskList.add(taskTabRow) (382-387), and every statusTabs.* call (536, 542, 543, 638-639, 723, 752).
- Keep the groups/statuses build (206-214). Replace taskOrder (220) with a flat concat of the groups values in configured status order. Groups insertion order is already statuses order, then unknown statuses.
- Introduce a statusCursor (index into statuses) replacing statusIndex. Derive it from the selected task status during apply/select so Up/Down crossing a group updates the cursor.
- Turn selectStatus(index) (180-193) into jumpToStatus(index): Left/Right move the cursor by exactly one group (wrap); call opts.onStatusChange(status); select the first task of the target group in the flat taskOrder; when the group is empty keep the current selection and only move the cursor (no skipping, matches the old tab behavior).
- redraw rows (445-464): terminal status = getTerminalStatus(opts.statuses). Render a terminal task label with TextAttributes.BOLD | TextAttributes.STRIKETHROUGH, keeping the existing bg/fg and activity-marker logic.
- The status tab row was the focusable node. Make taskList (or taskViewport) focusable: true and focus it wherever statusTabs.focus/blur was used, so the onKeyPress gating (593) and remount focus restore (541-543) keep working.
- Footer (498-519): show [Shift+Z] Done only when the selected task is not terminal; add [Shift+D] Delete.
- Bind workspace.markDone / workspace.deleteTask in this view and route to opts.onTaskAction(task, "done"/"delete").
- Extend OpenTuiWorkspaceTaskAction (line 59) with "done" | "delete".

PHASE 2 - Controller (src/ui/opentui/workspace-controller.ts)
- #loadSnapshot (847-856): stop filtering workspace tasks by activeStatus (matchesStatus always true for the workspace view); keep board filtering unchanged. selectedTaskIndex becomes the index into the full sorted list.
- onStatusChange (778-784): resolve the first task of the jumped-to group (or keep selection when the group is empty), then persist activeStatus cursor + selectedTaskId.
- #handleTaskAction (1777): add cases:
  - "done": guard no-op when the task is already terminal (the view also hides the shortcut); else load config, status = getTerminalStatus(config.statuses), await core.editTask(id, { status }, autoCommit), set notice, refresh.
  - "delete": open the Phase 4 confirm overlay; on confirm call the new core.deleteTask (Phase 5); notice + refresh.
- Fix the filter-editor selection check (1637-1638) that assumes activeStatus
filters the workspace list.

PHASE 3 - Keybindings (src/ui/keymap.ts, src/ui/opentui/keybindings.ts)
- keymap workspace: markDone: ["S-z"], deleteTask: ["S-d"].
- keybindings workspace: add markDone / deleteTask descriptors; add
shortcutDescriptions entries.
- Help overlay: #openHelp (1760) builds items from
shortcutHelpItems("workspace"). Make markDone conditional on the selected task
not being terminal (filter the items) so it is hidden when already done.

PHASE 4 - Confirm overlay (new src/ui/opentui/confirm.ts)
- Add mountOpenTuiConfirm(renderer, parent, { title, message }) returning
Promise<boolean>, modeled on src/ui/opentui/task-actions.ts (backdrop + box +
Y/N keys, default No/Escape=false). Register it in the runtime type/defaults
in workspace-controller.ts and add a #openConfirm helper.

PHASE 5 - Permanent delete (core)
- Add TaskLifecycleService.delete(taskId, autoCommit, options) modeled on
archive() (src/core/task-lifecycle-service.ts:155): unlink the task file; run
vacatedTaskReferences.withLockedCleanup to strip references/dependency links
from other tasks; remove the task session directory (SessionStore.reset only
removes state.json - add recursive removal of the task session dir, or delete
each session then rm the dir); when autoCommit, stage the removal and commit
(add a git removePath method if needed; git add of a deleted path stages the
deletion).
- Add a Core.deleteTask(taskId, autoCommit, options) wrapper near archiveTask
(src/core/backlog.ts:1111).
- Refuse cross-branch tasks as runTaskLifecycleAction does (task.branch).

PHASE 6 - Tests
- Delete src/test/opentui-status-tabs.test.ts.
- opentui-workspace-layout.test.ts: rewrite the tab tests at 206, 368, 432,
452, 721 to assert flat order/sort, strikethrough, and group jumping; add
markDone/delete coverage with an injected confirm.
- opentui-workspace-controller.test.ts: update the findStatusTabRow helper
(434-444) and the assertions at 719, 1592, 1765; add controller tests for the
done/delete actions.
- opentui-navigation-history.test.ts: activeStatus stays; only wording may
change.

PHASE 7 - Definition of Done
- bunx tsc --noEmit; bun run check .; bun test (scoped first); then bun run
build per AGENTS.md and confirm no src file is newer than dist/backlog.

## Implementation Notes

Execution: split into parallel workstreams. FROZEN INTERFACES: (1)
shortcutsConfig.workspace.markDone (S-z) + deleteTask (S-d) +
confirmOverlay.accept/decline added by orchestrator; (2) new util
orderTasksByStatus(tasks,statuses) in src/utils/task-order-by-status.ts; (3)
Backend adds Core.deleteTask(taskId,autoCommit?,options?) ->
VacatedTaskResult, TaskLifecycleService.delete, SessionStore.removeTaskDir,
AgentSessionService.purge, WorkspaceStateService.removeTaskSessions; (4) new
src/ui/opentui/confirm.ts mountOpenTuiConfirm(renderer,parent,{title,message})
-> {result:Promise<boolean>,dispose}. WS A backend delete+purge, WS B confirm
overlay, WS C workspace flat-list view (owns workspace.ts + layout tests,
deletes status-tabs). Orchestrator does controller integration (Phase 2) +
controller tests, then tsc/check/tests/build.

Implemented via parallel subagents (backend delete+session purge, confirm
overlay, workspace flat-list view) + orchestrator controller integration.
Verification: bunx tsc --noEmit clean; bun run check . clean (575 files);
scoped tests 131 pass/1 skip (confirm, task-delete, layout, controller,
status-icon, agent-sessions, session-picker, agent-workspace-cli,
workspace-state-in-progress, status-resolution). Full 'bun run test': 2329
pass, 1 fail in src/test/tui-window-title.test.ts which imports only
src/ui/tui.ts (untouched) - pre-existing/environmental, unrelated to BACK-3.
Rebuilt dist/backlog (bun run build) at 18:52; 'find src -name *.ts -newer
dist/backlog' prints nothing.
Notes: session-dir purge is orchestrated by the controller (core has no
session store): Core.deleteTask removes file+refs+git, then
WorkspaceStateService.removeTaskSessions purges the task state dir. New util
orderTasksByStatus in src/utils/task-order-by-status.ts is shared by
controller and view.

FOLLOW-UP VERIFIED (2026-10-08): scoped tests opentui-workspace-layout +
opentui-workspace-controller + opentui-navigation-history = 3/3 files, 59
passed. bunx tsc --noEmit clean. Biome clean on the 6 changed files (full 'bun
run check .' fails only on untracked backlog/agents.json, environmental). bun
run build ok; 'find src -name *.ts -newer dist/backlog' prints nothing. Zero
remaining references to
previousStatus/nextStatus/jumpToStatus/statusCursor/+workspace onStatusChange.

## Comments

FOLLOW-UP (2026-10-08, user): Drop the Left/Right status-group jump from AC#3
(no longer wanted). Also shrink the task list pane from 30% to AOE's
session-list width. AOE reference: fixed home_list_width=35
(Constraint::Length) in
/Users/imribarr/tmp/projects/agent-of-empires/src/tui/home/lifecycle.rs:425,
clamped list.min(width-PREVIEW_MIN_WIDTH) with PREVIEW_MIN_WIDTH=40 in
src/tui/responsive.rs. Removed previousStatus/nextStatus from src/ui/keymap.ts
and src/ui/opentui/keybindings.ts, the onStatusChange callback + controller
handler, and jumpToStatus/statusCursor in workspace.ts. Updated layout +
controller tests (dropped the jump test); navigation-history left intact.