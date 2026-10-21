---
task_schema_version: 3
id: BACK-23
title: Modes
status: Done
created_date: '2026-10-09 07:42'
updated_date: '2026-10-10 09:15'
labels: []
dependencies: []
ordinal: 23000
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
  Add configurable PLAN and BUILD modes with separate session histories, task
  artifacts, and user-controlled approvals. Keep mode selection and live-preview
  navigation clear while preserving the task list's original design.
---

