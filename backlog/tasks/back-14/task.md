---
task_schema_version: 3
id: BACK-14
title: Remove legacy blessed TUI code and dependency
status: Done
assignee: []
created_date: '2026-10-08 06:34'
updated_date: '2026-10-08 11:05'
labels:
  - refactor
  - cleanup
  - tui
dependencies: []
ordinal: 14000
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
  BACK-14 Plan (locked)


  Goal

  Remove `neo-neo-bblessed` and all legacy blessed TUI code. Keep only the
  OpenTUI UI: `backlog workspace`, the OpenTUI board (`backlog board` / `board
  view`, also reachable from the workspace), and `backlog doc view`'s OpenTUI
  scroll viewer.


  Locked decisions

  1. No interactive UI outside the OpenTUI workspace/board. Remove blessed
  interactive entry points: `search`; `task view <id>`; bare `task <id>`; `task
  list --project`; `draft view` / `draft <id>`; `draft list`; `doc list` picker;
  `overview`.

  2. TTY now defaults to plain output for those commands; `--plain` is still
  accepted.

  3. Delete the `backlog overview` feature entirely (`commands/overview.ts`,
  `ui/overview-tui.ts`, `ui/overview-content.ts`, registration).

  4. Delete `genericSelectList`; `doc list` is print-only.

  5. No standalone task/draft viewer. Editing is the OpenTUI workspace form or
  `backlog task edit`. Delete `Core.editTaskInTui`, `ui/task-viewer/editor.ts`,
  `core/tui-task-edit-session.ts` (incl. `BlessedScreen`).

  6. Delete `ui/board/board-actions.ts`.

  7. Blessed tag strings migrate to OpenTUI StyledText, one-time, with no
  translator/strip leftovers. Chosen: full rich parity - port the old rich
  detail presentation into the OpenTUI workspace detail pane and render it with
  `t`/StyledText (load `TaskDetail`).

  8. Reorganize: `src/ui/` ends as `src/ui/opentui/**` only; plain formatting
  helpers move to `src/formatters/`; CLI splash/loading move to `src/cli/`;
  OpenTUI-only models/keymaps fold under `src/ui/opentui/`.


  Key finding

  After these deletions, no blessed-tag emitter survives in production. The only
  OpenTUI consumer of blessed tags was `opentui/task-viewer.ts` (standalone
  viewer, no production caller), which is deleted. The workspace currently
  renders a plain local `taskDetails()`; decision 7 ports the rich content into
  it.


  Phases (details in Implementation Plan)

  1. Remove interactive entry points (plain fallback) + delete overview.

  2. Port rich detail into OpenTUI workspace (StyledText, load TaskDetail).

  3. Relocate surviving shared modules to proper homes.

  4. Delete legacy blessed code + tests + tooling.

  5. Remove dependency, regenerate lock/nix, verify.


  Out of scope

  CLI `@clack/prompts` wizards and readline prompts stay. `--plain`/`--json`
  output paths unchanged.


  Verification

  `bunx tsc --noEmit`; `bun run check .`; `bun run build` after every change;
  `find src -name '*.ts' -newer dist/backlog` prints nothing; focused tests then
  `bun run test`; manual TTY smoke.
---

