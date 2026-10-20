---
task_schema_version: 3
id: BACK-20
title: Minor Adjustments
status: Done
assignee: []
created_date: '2026-10-08 10:27'
updated_date: '2026-10-09 04:35'
labels: []
dependencies: []
ordinal: 20000
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
  Trim the task content model to title/description/agentSummary: remove
  acceptance criteria, Definition of Done, implementation plan/notes, final
  summary and comments across the model, markdown, CLI, MCP, TUI, formatters and
  docs; add the agent_summary field; and show a 'warming up' status in the
  workspace agent header. (Part 1, Option word motion, already landed.)
---

