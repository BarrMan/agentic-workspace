---
task_schema_version: 3
id: BACK-18
title: AgenticWorkspace commands should detect worktree main branch
status: Done
created_date: '2026-10-08 07:25'
updated_date: '2026-10-08 10:29'
labels: []
dependencies: []
ordinal: 18000
description: >-
  Currently, when working with worktrees, when using agentic-workspace commands, it looks
  at the current PWD thus missing the task it's standing on. We need the agentic-workspace
  commands to be worktree agnostic. Knowing the main worktree location and
  reading the tasks from there
---

