---
task_schema_version: 3
id: BACK-17
title: Add groups to task list
status: Done
created_date: '2026-10-08 07:03'
updated_date: '2026-10-09 04:30'
labels: []
dependencies: []
ordinal: 17000
agentConfiguration:
  selectedPreset: opencode
  presets:
    opencode:
      command:
        - opencode
      env: {}
      prepare: ''
      bootstrap: opencode
    claude:
      command:
        - claude
      env: {}
      prepare: ''
      bootstrap: claude
    pi:
      command:
        - pi
      env: {}
      prepare: ''
      bootstrap: pi
      resumeFlag: '--session'
  sessions:
    worktreePerTask: true
    yoloMode: true
description: >-
  Workspace task list supports groups (tree with collapse/expand, create-group
  modal, task membership). Remaining work has two parts. (1) Option/meta
  keybindings: on macOS iTerm2 with Option=Normal, Option+g arrives as the
  composed glyph '©' and never matches the M-g binding; fix by enabling the
  kitty keyboard protocol in the renderer and resolving the Option chord to its
  base key, and display bindings as Option+G on macOS / Alt+G elsewhere. (2)
  Delete a group: pressing the delete key on a selected group currently does
  nothing; it must open a delete confirmation like tasks, and for a non-empty
  group ask where to move its direct tasks and child groups (Root or an existing
  group, defaulting to the group's parent or root).
---

