---
task_schema_version: 3
id: BACK-19
title: Remove the auto-commit feature entirely
status: Done
created_date: '2026-10-08 07:50'
updated_date: '2026-10-08 09:32'
labels: []
dependencies: []
priority: "High"
type: task
ordinal: 19000
description: >-
  AgenticWorkspace currently supports an autoCommit config option and an autoCommit
  override threaded through Core task/milestone/document/decision mutations, the
  git commit helpers, CLI config wizard, TUI, MCP, and agent instructions.
  Remove the feature completely: the autoCommit config key, shouldAutoCommit,
  all autoCommit? parameters and their commit-execution logic, the wizard/CLI
  surface, docs, and the tests that cover auto-commit behavior. After removal,
  AgenticWorkspace never commits on its own; users commit manually.
---

