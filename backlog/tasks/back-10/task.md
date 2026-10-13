---
task_schema_version: 3
id: BACK-10
title: Add worktree support
status: Done
assignee: []
created_date: '2026-10-07 17:06'
updated_date: '2026-10-08 09:55'
labels: []
dependencies: []
ordinal: 10000
agentConfiguration:
  selectedPreset: opencode
  presets:
    opencode:
      command: opencode
      env: {}
      prepare: ''
      bootstrap: opencode
    claude:
      command: claude
      env: {}
      prepare: ''
      bootstrap: claude
    codex:
      command: codex
      env: {}
      prepare: ''
      bootstrap: codex
    gemini:
      command: gemini
      env: {}
      prepare: ''
      bootstrap: gemini
    agy:
      command: agy
      env: {}
      prepare: ''
      bootstrap: antigravity
    pi:
      command: pi
      env: {}
      prepare: ''
      bootstrap: pi
      resumeFlag: '--session'
    omp:
      command: omp
      env: {}
      prepare: ''
      bootstrap: omp
      resumeFlag: '--resume'
  sessions:
    worktreePerTask: true
    yoloMode: true
description: >-
  Add worktree-per-task and YOLO session settings (project Settings > Sessions
  tab + per-task override), with worktree lifecycle
  create-on-create/remove-on-Done.


  Remaining items (approved scope):

  1. Remove the legacy per-preset `worktree` boolean everywhere it is still
  exposed: AgentPreset type + config schema, built-in presets, session-store
  isPreset round-trip validation, the agent-config --worktree CLI option, and
  the Settings UI. Legacy agents.json/snapshots stay loadable (unknown keys
  tolerated).

  2. Add two checkboxes to the new-task composer (task-level card override):
  'Worktree per task' and 'YOLO mode'. They are prefilled from the resolved
  project session settings and can be overridden per task. On submit, persist a
  card agentConfiguration.sessions override only when a value differs from the
  inherited project setting (or when a preset is also overridden); otherwise
  leave inheritance intact.


  Out of scope: legacy blessed UI cleanup (now tracked as BACK-14).
---

