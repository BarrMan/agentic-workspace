---
task_schema_version: 3
id: BACK-22
title: agent-session ask does not return an answer
status: Done
assignee: []
created_date: '2026-10-09 03:32'
updated_date: '2026-10-09 04:13'
labels: []
dependencies: []
priority: medium
type: bug
ordinal: 22000
description: >-
  backlog agent-session ask returns no answer: it times out with empty stdout
  because the resumed agent runs a long autonomous turn and captured output is
  discarded. Also covers the command being absent from the BACK-17 worktree
  source, and the task-first startup instruction.
---

