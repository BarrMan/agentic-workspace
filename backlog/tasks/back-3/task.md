---
task_schema_version: 3
id: BACK-3
title: Remove status tabs in workspace view
status: Done
assignee: []
created_date: '2026-10-07 15:06'
updated_date: '2026-10-08 04:45'
labels: []
dependencies: []
ordinal: 3000
agentConfiguration:
  selectedPreset: opencode
  presets:
    opencode:
      command: opencode
      env: {}
      prepare: ''
      worktree: false
      bootstrap: opencode
    claude:
      command: claude
      env: {}
      prepare: ''
      worktree: false
      bootstrap: claude
    codex:
      command: codex
      env: {}
      prepare: ''
      worktree: false
      bootstrap: codex
    gemini:
      command: gemini
      env: {}
      prepare: ''
      worktree: false
      bootstrap: gemini
    agy:
      command: agy
      env: {}
      prepare: ''
      worktree: false
      bootstrap: antigravity
description: >-
  Workspace view currently shows status tabs (To Do / In Progress / Done).
  Replace them with a single flat task list sorted by the configured status
  order.


  AGREED REQUIREMENTS

  1. Flat list: show all tasks in one list, no status tabs. Sort by the
  configured `statuses` order (default To Do, In Progress, Done). Any task whose
  status is not in the configured list is appended after the known statuses, in
  first-seen order.

  2. "Done" means the terminal configured status (last entry in `statuses`, see
  src/utils/terminal-status.ts getTerminalStatus). Done rows get strikethrough
  only (TextAttributes.STRIKETHROUGH on the row label), no extra marker.

  3. Status separation is implicit, as today: tasks with an active session keep
  the activity marker dot; todo/no-session tasks have no marker; done rows are
  struck through.

  4. Repurpose Left/Right: jump to the previous/next status group and select
  that group first task. Same behavior as the old tabs, including empty groups -
  go to the next group, do NOT skip empty groups. Cursor wraps.

  5. Keep activeStatus in persisted state and navigation history as a cursor
  only. It must NOT filter the workspace list anymore. Board view filtering is
  unchanged.

  6. Delete src/ui/opentui/status-tabs.ts and
  src/test/opentui-status-tabs.test.ts. Do not leave legacy code and do not run
  migrations of any kind.

  7. New keybindings, workspace view only:
     - Shift+Z: mark the selected task done by setting its status to the terminal configured status. If the task is already done, the shortcut must be hidden from help/footer and must do nothing.
     - Shift+D: permanently delete the selected task. "No trace" means: delete the task markdown file, strip references/dependency links from other tasks (reuse the vacated-task cleanup used by archive), delete the task session directory, and when autoCommit is enabled stage the removal and commit. A Y/N confirmation overlay must be shown before deleting.
  8. No migrations of any kind.
---

