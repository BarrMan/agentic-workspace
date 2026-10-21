---
task_schema_version: 3
id: BACK-15
title: Agent session statuses indications bug
status: Done
created_date: '2026-10-08 06:39'
updated_date: '2026-10-09 04:32'
labels: []
dependencies: []
type: bug
ordinal: 15000
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
  Problem

  - Workspace task-row dot indications are incoherent. After a restart only one
  blue dot appeared then vanished; a parked/idle agent showed green; other
  durable-active sessions showed no indication. The original report also notes:
  (1) a task moved to done via the CLI does not refresh the TUI instantly; (2)
  restarting clears all status indications.


  Agreed indication contract (settled with owner)

  - Green = the agent is genuinely working (model turn or tool executing).

  - Blue = the task has an active session that is not currently working (parked,
  idle at the prompt, or not yet re-detected after resume).

  - No dot = no active session (stopped/failed/historical).

  - After restart the active session shows blue and flips to green only when
  work actually starts; it must never vanish in between.

  - waiting (orange) and error (red) remain transient states.


  Root causes (verified)

  1. workspace.ts hides the dot when the derived activity is "unknown",
  contradicting status-icon.ts which documents that no derived value yet reads
  as parked blue. The first poll after auto-resume yields unknown, so the blue
  dot appears then disappears.

  2. Dot existence is driven by durable activeSessionTaskIds while colour is
  driven only by the in-memory activityByTask overlay, producing
  parked-but-green and active-but-no-dot.

  3. probeTarget.lifecycle is snapshotted at launch and never refreshed, so
  terminal transitions never short-circuit.

  4. The agent resolver trusts a running hook write for 900 s and checks it
  ahead of pane chrome, so an idle agent stays green for up to 15 minutes.

  5. On restart only the selected task is auto-resumed/probed, so other
  durable-active sessions get no baseline indication.


  Design decisions (settled)

  - Source of truth = durable session status; the hook sidecar is the event
  stream. CLI-created and workspace-created sessions already share the same
  chokepoint (prepareAgentLaunch) and the same deterministic sidecar path, so
  both are covered.

  - Read hook transitions via fs.watch on the per-session .activity directory
  (existing house pattern), coalesced, plus an initial reconcile on load and a
  slow backstop tick.

  - Liveness: SIGKILL is uncatchable; detect termination from tmux pane-dead
  (remain-on-exit is on), preferably via a pane-died hook, with a single ~30 s
  liveness/reconcile fallback.

  - Delete the sample-based timers startingFloorMs, errorRelatchMs, the 900 s
  standing window, and pendingIdle; keep only the liveness fallback.

  - External/attached (nativeWorkspace falsy) sessions stay supported and are
  covered; no removal in this task. Non-hook-backed custom prompt presets keep a
  pane-chrome fallback.


  Out of scope

  - Removing external/CLI-attach support.

  - Plain-shell agent-session start currently launches then stops
  (stopWhenUnowned) - separate behavior.


  Definition of Done

  - bunx tsc --noEmit passes when TypeScript is touched.

  - bun run check . passes when formatting/linting is touched.

  - bun test (or scoped test) passes.

  - Rebuild dist/agentic-workspace after changes, confirm no src .ts file is
  newer than dist/agentic-workspace, then verify manually against the rebuilt
  binary.


  Decisions (settled with the plan author)

  1. Base branch: fast-forward the worktree to local main before starting (git
  merge --ff-only main); do not use origin/main, which is behind HEAD. The
  branch stays agentic-workspace/task/BACK-15.

  2. Indication API: replace activeSessionTaskIds + activityByTask with a single
  indicationByTask: Map<taskId, AgentIndication> over a new AgentIndication type
  (working | parked | waiting | error); the row dot renders iff a key exists.
  Mapping: running -> working; idle|unknown|parked|starting -> parked; waiting
  -> waiting; error -> error; stopped/no-session -> absent. The agent
  header/placeholder overlay derives from the same map.

  3. Orphaned sidecar: keep a ceiling for every hook status, not just running.
  Make it liveness-based - a sidecar is evidence only while its pane is alive (a
  dead/absent pane ignores the sidecar entirely), with a generous age ceiling as
  a secondary guard. Never leave idle/error/waiting unguarded.

  4. Stale running hook: fall through to pane chrome first; default to idle
  (blue) only when chrome is also absent. Never keepPrevious. Green requires a
  fresh running hook (<30 s) or chrome running.

  5. Liveness: the bounded ~30 s probe is sufficient for the DoD; defer the
  pane-died hook. If added later it must be scoped to all durable-active
  (RUNNING/STARTING) sessions and write the terminal status to the sidecar so
  the watcher catches it. The backstop sweep must cover all durable-active
  sessions, not only tracked ones, or a killed non-selected session stays blue.

  6. starting -> blue (#60a5fa), selected #1e40af; remove cyan from
  status-icon.ts and update status-icon.test.ts (cyan assertions at lines
  39/55/85).

  7. error is fully transient: remove the 30 s latch and the errorSince
  bookkeeping in the controller.

  8. Cadence: fs.watch coalesce 10 ms (match view-state-store.ts). One 30 s
  timer serves both backstop reconcile and liveness, for hook-backed/tracked
  sessions. Keep the adaptive cadence (500 ms live / 1 s attached / 5 s idle)
  only for targets with no sidecar (custom prompt / non-hook-backed).

  9. Docs: annotate the divergence in docs/aoe-status-tracking-plan.md (the 900
  s window and rule 10); leave the historical AOE mirror text intact.

  Item (1) of the original report (CLI -> done TUI refresh) is already fixed by
  7ba600b9 (#startWatchers + watchTasks) and is out of scope for the remaining
  work.
---

