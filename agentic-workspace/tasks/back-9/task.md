---
task_schema_version: 3
id: BACK-9
title: Reduce per-agent process and tmux-fork overhead in agentic-workspace workspace
status: Done
created_date: '2026-10-07 17:00'
updated_date: '2026-10-08 06:32'
labels: []
dependencies: []
priority: "Medium"
type: enhancement
ordinal: 9000
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
    pi:
      command:
        - pi
      env: {}
      prepare: ''
      worktree: false
      bootstrap: pi
      resumeFlag: '--session'
    omp:
      command:
        - omp
      env: {}
      prepare: ''
      worktree: false
      bootstrap: omp
      resumeFlag: '--resume'
description: >-
  ## Context

  BACK-8 consolidated `agentic-workspace workspace` onto one default tmux server
  and one named session per agent. BACK-9 is the follow-up performance task. A
  process census compared AgenticWorkspace's per-agent fan-out against AOE (`aoe
  1.18.0`) on the same machine and default tmux server.


  ## Baseline caveat - READ FIRST

  The original census (5 persistent procs/agent, including 2x `/bin/sh`) was
  taken from the LIVE workspace process tree, which may have been running a
  stale `dist/agentic-workspace`. It also cited `cd ... &&` at
  `agent-host.ts:171` and double cwd at `:241`; those have ALREADY been removed
  in the working tree by an earlier Phase-1 pass:

  - `workspace-controller.ts:1263` now builds `env <...> <prepared.command>`
  (the extra `sh -c` is gone).

  - `agent-host.ts:171-173` is now `const command = agentCommand;` (no `cd ...
  &&`).

  - `vt-channel.ts` applies cwd via `new-session -c` (`createArmedSession` takes
  `cwd?`, `-c` added around line 810), and the armed gate is `... wait-for
  <gate> && exec ${opts.command}` (the redundant `/bin/sh -c` wrapper is gone).


  Those Phase-1 edits are UNVERIFIED and uncommitted. Therefore:

  - Rebuild (`bun run build`) and re-baseline before any further code.

  - Treat Phase 1 as "already drafted, needs verification", not "to implement".

  - AC#2's cwd clause is already satisfied by the current tree; verify it holds
  and is asserted.

  - The "one persistent shell" outcome can only be MEASURED after a workspace
  restart (live agents run old code). Capture that with the user.


  ## Answered implementer questions

  1. Rebuild + re-baseline: yes, first. The persistent `/bin/sh` count is only
  re-measurable after a workspace restart; the code change for Phase 1 is
  already drafted locally.

  2. Phase 2 approach - chain into ONE tmux fork; keep the lease write. Do NOT
  drop the heartbeat and do NOT couple the pipe-pane lease write to the UI
  activity tick (UI throttling/busy would risk lease-steal). Fuse the read and
  the lease write into a single tmux invocation per tick, e.g. `tmux ...
  display-message -p '#{...}' \; set-option -t <session> @<lease> <tok>`, so
  both share one fork. The lease write must run at its own safe cadence
  regardless of UI cadence; the optimization is fusing the per-tick read with it
  (or having the UI reuse the tmux-layer tick), not removing it. Also reuse one
  temp dir instead of `mkdtemp` per `exec.run`.

  3. AC#4 fs.watch - allow a low-frequency backstop poll (>= 2s); do NOT require
  "strictly no poll". `fs.watch` is event-lossy/coalescing on macOS and
  unreliable across platforms. Target platforms are macOS, Linux, and Windows
  (see `package.json` `optionalDependencies`), so a backstop is required for
  correctness. Goal: replace the 4 Hz (250ms) poll with `fs.watch` plus a >=2s
  safety poll, keeping offset bookkeeping. This path is latent while the VT
  channel works, so it is lower priority than Phases 1-2.

  4. AC#7 measurement - an analytical per-interval rate derived from code is
  acceptable and is the recorded before/after, because it is exact and
  reproducible: sum each periodic tmux call's cadence, counting a chained
  `display-message \; set-option` as ONE fork (current ~180 execs/min/agent =
  heartbeat 1/s + activity ~2/s). Corroborate with (a) 0.5s `ps` sampling as a
  sanity check and (b) the post-restart persistent-process count.
  `dtrace`/`execsnoop` (sudo) are NOT required.


  ## Measured findings (current, pre-optimization)

  - Persistent procs/agent: AgenticWorkspace ~8-9 (1 `sh`, `opencode`, `serena`,
  4 node LSP, `agentic-workspace __vt-pipe`) + occasional zombie; AOE 4 core +
  same 4 node LSP. Neither spawns idle `sleep`/`cat` (machine-wide 0/0).

  - Idle tmux forks: ~180 execs/min/agent (VT lease heartbeat 1/s at
  `vt-channel.ts:98,621-625`; activity probe ~2 execs/s at
  `agent-status-probe.ts:82/91`, 500ms tick with 1s cache).

  - Latent fallback: long-lived `cat >> file` + 250ms poller
  (`agent-host.ts:259-260`, `existing-agent-host.ts:84`); absent-VT input forks
  `tmux send-keys -H` per 512 bytes per keystroke (`worker.ts:49-56`).

  - Three leaked zombies were children of `serena` (external MCP runtime); they
  clear when the session stops. Out of scope for AgenticWorkspace code.


  ## Goal

  Cut idle per-agent overhead without changing agent UX or the single-server
  ownership/teardown/sweep guarantees from BACK-8.


  ## Non-goals

  - No change to tmux ownership, teardown, or startup-sweep semantics.

  - No `kill-server` anywhere.

  - No instrumentation code; all measurement is out-of-band.


  ## Operational item

  Confirm exactly one `agentic-workspace workspace` process runs. The stray
  `9059 bun --inspect-wait ./src/cli/index.ts workspace` was already closed;
  only `42325 agentic-workspace workspace` remains.
---

