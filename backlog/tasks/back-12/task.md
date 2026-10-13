---
task_schema_version: 3
id: BACK-12
title: Fix pre-existing tui-window-title test failure
status: Done
assignee: []
created_date: '2026-10-07 17:22'
updated_date: '2026-10-07 17:52'
labels: []
dependencies: []
priority: medium
type: bug
ordinal: 12000
description: >-
  Root cause: src/test/tui-window-title.test.ts was non-hermetic. It assumed
  process.env.TMUX is unset, but blessed reads TMUX when the program is
  constructed and switches to a deferred tmux DCS-passthrough path when it is
  set. scripts/run-ci-tests.ts spawns test processes with ...process.env, so
  running the suite from inside tmux makes the title write never land on flush,
  and 'saves the previous window title and restores it when the screen is
  destroyed' failed (indexOf === -1). src/ui/tui.ts is correct and unchanged.
  Fix: clear process.env.TMUX for the duration of this suite (beforeAll
  saves/deletes, afterAll restores), matching the existing per-file convention
  in tui-task-composer.test.ts and agent-sessions.test.ts. The inTmux helper
  still sets TMUX for the tmux-specific test.
---

