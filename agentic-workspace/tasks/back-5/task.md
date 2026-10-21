---
task_schema_version: 3
id: BACK-5
title: Handoff functionality does not work
status: Done
created_date: '2026-10-07 15:30'
updated_date: '2026-10-08 04:09'
labels: []
dependencies: []
ordinal: 5000
agentConfiguration:
  selectedPreset: opencode
  presets:
    opencode:
      command:
        - opencode
      env: {}
      prepare: ''
      worktree: false
      bootstrap: opencode
    claude:
      command:
        - claude
      env: {}
      prepare: ''
      worktree: false
      bootstrap: claude
    codex:
      command:
        - codex
      env: {}
      prepare: ''
      worktree: false
      bootstrap: codex
    gemini:
      command:
        - gemini
      env: {}
      prepare: ''
      worktree: false
      bootstrap: gemini
    agy:
      command:
        - agy
      env: {}
      prepare: ''
      worktree: false
      bootstrap: antigravity
description: >-
  Refined requirement (corrected): the workspace handoff key is lowercase "h"
  and it already works. The remaining work is UX.


  1. The handoff preset chooser (mountOpenTuiPresetPicker in
  src/ui/opentui/agent-settings.ts) looks bad: it is a near-fullscreen (92%x92%)
  plain modal with a bare "> name [default]" text list. Replace it with a
  compact dropdown styled like the Settings screen: settings palette (bg
  #18181b, text #d4d4d8, dim #a1a1aa, border #52525b, accent #22d3ee), rounded
  accent border, a highlighted selected row, a single key-hint line, and errors
  shown in the danger colour.


  2. Once a preset is selected, the modal must close immediately and the
  workspace must show the standard "Agent is warming up..." live preview (the
  same flow as starting an agent), then attach the new session.


  Scope: the handoff key (h) and the choose-task-preset key (p) share
  mountOpenTuiPresetPicker, so both get the new dropdown. Titles shortened to
  "Hand off <id>" and "<id> agent preset". A light dim backdrop behind the
  dropdown is the chosen treatment.
---

