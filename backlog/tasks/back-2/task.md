---
task_schema_version: 3
id: BACK-2
title: Status indicator is not updating
status: Done
assignee: []
created_date: '2026-10-07 14:34'
updated_date: '2026-10-07 15:14'
labels: []
dependencies: []
ordinal: 2000
description: >-
  Two requirements in the workspace agent-session flow.


  (1) Bug (fixed): the activity dot on the SELECTED task row was hard-coded
  green (SELECTED_SESSION_FOREGROUND) so it never changed while a session was in
  progress. Fixed via getSelectedActivityColor + selected-row palette in
  src/ui/status-icon.ts and src/ui/opentui/workspace.ts.


  (2) Feature (implemented; awaiting user confirmation): when a task gains an
  active agent session, its status automatically moves to the configured In
  Progress status, and the workspace follows the status tab to In Progress while
  keeping the same task selected. Attach (passive) never moves status; adoption
  of another tasks request moves that task but never steals the tab; terminal
  (Done) tasks are never moved; a 2-status config can never nudge a task into
  the terminal column.


  Constraint: the status write happens only on a real activation event, never on
  refresh.
---

