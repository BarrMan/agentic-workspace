## Acceptance Criteria

- [ ] Operational: exactly one backlog workspace process runs; the stray --inspect-wait workspace is closed.
- [ ] After a workspace restart each agent has at most one persistent /bin/sh (steady state <= 4 persistent procs/agent: sh, opencode, serena, backlog __vt-pipe); no shell cd prefix; cwd applied via new-session -c (already drafted - verify and assert).
- [ ] Phase 2: per-agent idle tmux forks fused into a single tmux invocation per tick that both reads activity and writes the pipe-pane lease; the lease write is never coupled to UI throttling; no separate heartbeat fork.
- [ ] Phase 3: fallback/external capture uses fs.watch plus a low-frequency (>=2s) backstop poll instead of the 250ms interval; no long-lived cat; absent-VT input coalesces instead of forking per 512 bytes per keystroke; works on macOS/Linux/Windows.
- [ ] No zombie children attributable to Backlog once agents are idle (external serena-side zombies documented).
- [ ] tsc --noEmit and biome check clean; tests green except the pre-existing unrelated tui-window-title failure; binary rebuilt and find src -name '*.ts' -newer dist/backlog empty.
- [ ] Before/after idle per-agent tmux-fork rate recorded using the analytical per-interval method plus ps-sampling sanity check and post-restart process count; no sudo tooling required.

## Definition of Done

- [ ] bunx tsc --noEmit passes when TypeScript touched
- [ ] bun run check . passes when formatting/linting touched
- [ ] bun test (or scoped test) passes

## Implementation Plan

## Phases
0. Baseline measurement (no code): sample idle per-agent tmux forks out-of-band (e.g. `dtrace`/`fs_usage` for `tmux` execs plus periodic `ps` sampling) for ~60s; record in notes.
1. Collapse the launch shell chain: use `new-session -c <cwd>` (drop the `cd &&` prefix), merge the controller `env ... sh -c` with the agent-host command so only one persistent `sh -c` survives, and fold the `wait-for && exec` gate into that same command. Remove the double cwd in the fallback. Target: one persistent shell per agent.
2. Consolidate per-agent timers: a single periodic tmux call per agent for liveness+activity; drop the separate VT heartbeat fork (or derive lease liveness from the activity tick); reuse one temp dir instead of `mkdtemp` per call.
3. Fallback/external path: replace `cat >> file` + 250ms poller with `fs.watch`; remove the redundant interval; coalesce `send-keys` chunks.
4. Zombie triage: identify the owner (serena vs opencode vs backlog); if external, document and add no code.
5. Operational: close the stray workspace process.
6. Verify: `bunx tsc --noEmit`, `bun run check .`, tests, `bun run build` + freshness, manual default-server check, and re-measure then compare.

## Parallelization
- Code phases 1-3 touch overlapping files (`agent-host.ts`, `vt-channel.ts`, `workspace-controller.ts`), so they need a single owner and run sequentially.
- Phase 0 (measurement), phase 4 (zombie triage), and the operational step 5 are independent and can run in parallel.

## Implementation Notes

## Baseline (2026-10-07, before changes)
- Persistent processes per agent: Backlog ~8-9 (1 `sh`, `opencode`, `serena`, 4 node LSP, `backlog __vt-pipe`) plus an occasional zombie; AOE 4 core + same 4 node LSP.
- Machine-wide `sleep` = 0, `cat` = 0 for both tools.
- Agents back-3/5/6/7/8; tmux server 33689; workspace 42325.
- Census was taken from the LIVE process tree, so it may reflect a stale `dist/backlog`; re-baseline after rebuild + restart.

## Phase 0 measurement (out-of-band, no code)
- dtrace unavailable (no non-interactive sudo); 0.5s `ps` sampling only proves forks are sub-interval (3 caught in 60s).
- Analytical idle rate from code intervals: VT lease heartbeat 1/s (`vt-channel.ts:98,621-625`) + activity probe ~2 execs/s (`display-message` + `capture-pane`, `agent-status-probe.ts:82/91`; 500ms tick with 1s cache) = ~180 tmux execs/min/agent (~900/min for 5 agents).
- Target: fuse the two per-agent periodic tmux calls into one fork (keep the lease write); idle trends toward one tmux call per agent per tick.

## Phase 1 status (DRAFTED, UNVERIFIED)
- An earlier subagent edited `workspace-controller.ts`, `agent-host.ts`, `vt-channel.ts` (removed extra `sh -c`, removed `cd &&`, cwd via `new-session -c`, gate `exec ${opts.command}`), and rebuilt dist. It was cancelled before verification, and also touched `workspace.ts`, `agent-settings.ts`, `opentui-workspace-layout.test.ts` (unconfirmed).
- Required next: rebuild + re-baseline, review the diff (separate from BACK-8 hunks), tsc/biome, scoped tests, then E2E after a workspace restart.

## Phase 4 zombie triage (no code)
- 3 zombies were children of `serena` MCP (session leaders), leaked ~18min. Root cause: `serena` spawns language-server children with their own session and fails to `wait()` one. Backlog is the grandparent and has no subreaper; out of scope. Clears when the session stops.

## Operational (done)
- Stray `9059 bun --inspect-wait ./src/cli/index.ts workspace` had no children and owned no sessions; terminated. Only `42325 backlog workspace` remains.

## Decisions
- No app migration code for BACK-8; records were migrated by hand.
- No instrumentation code; measurement out-of-band.
- Phase 2: fuse activity read + lease write into one tmux invocation; never couple the lease to UI cadence.
- AC#4: fs.watch plus a >=2s backstop poll (not strictly event-only).
- AC#7: analytical per-interval rate is the accepted metric (no sudo tooling).

## BACK-9 implementation (2026-10-07)

### Phase 0 — gate (done)
- `bun run build` fresh; `find src -name '*.ts' -newer dist/backlog` empty. `bunx tsc --noEmit` and `bun run check .` clean.
- Repo state had advanced: the earlier "uncommitted Phase-1 draft" is now committed in `3e9ea04f` (single default server + named session, cwd via `new-session -c`, direct `exec`). Audited and verified rather than re-implementing.
- `dist/backlog` is current vs source; the live workspace (pid 42325) still runs old code, so its process tree is not evidence yet.

### Phase 1 — launch shell collapse (verified)
- E2E on an isolated server (`createArmedSession`, command `env FOO=1 /bin/sh -c '<script>'`): the pane process group contains exactly ONE persistent `/bin/sh -c <script>` plus the agent/sleep child. The outer gate `sh` is `exec`'d away; cwd is applied by `new-session -c` (argv showed `-c /tmp`); no `cd` prefix anywhere.
- Added a regression assertion in `opentui-agent-host-cleanup.test.ts`: the agent `new-session` argv carries `-c <cwd>`, matches no `cd `, and the gate is `wait-for ... && exec` (AC#2 asserted).
- The live post-restart process count still needs a user-initiated workspace restart to re-measure (live agents run old code).

### Phase 2 — fused lease tick (verified; AC#3)
- `vt-channel.ts`: the 1 s lease tick is now ONE tmux invocation `display-message -p -t <pane> '#{pane_dead} #{window_activity}' ; set-option -t <pane> @aoe_vt_owner_hb <stamp>` (literal `;` argv separator). It both stamps the lease and reads liveness/activity; the lease cadence stays under the tmux layer and is never derived from the UI tick.
- Verified live: chained invocation exits 0 with clean parseable stdout (`"0 <second>"`), lease value reads back, `channel.activity()` populated.
- `VtChannel`/`AgentHost` expose `activity()`; `agent-status-probe.ts` consumes it for owned sessions (external sessions still fork `display-message`); `agent-status-probe` now implements `skip_capture` (via the existing `shouldSkipCapture`), so an unchanged window takes ZERO captures. `pendingProposal` is threaded from the resolver to refuse a skip during a `running -> idle` hold.
- `exec.ts`: per-call `mkdtemp`+`rm` replaced by a process-wide reusable capture-slot pool (concurrency-safe, one base dir, one exit handler). Made process-wide after review (per-instance leaked a dir + listener per throwaway `createTmuxExec`).
- New tests: `agent-status-probe.test.ts` (VT read = no fork; skip unchanged; pending proposal refuses skip) and the existing suite.

### Phase 3 — timers/fallback (done, one flagged clause)
- `existing-agent-host.ts`: 250 ms poll -> `BACKSTOP_POLL_MS = 2000`; `fs.watch` retained and driving.
- `agent-host.ts` fallback: `fs.watch(capturePath, capture)` added; 250 ms -> `FALLBACK_CAPTURE_BACKSTOP_MS = 2000`; watcher closed on teardown/error.
- `input/worker.ts`: absent-VT input chunks are chained into ONE tmux invocation with a literal `;` separator (verified against real tmux); per-command 512 B cap kept, 8 KiB per-invocation cap added. New `worker.test.ts`.
- FLAG (AC#4 "no long-lived cat"): the fallback still uses `pipe-pane 'cat >> file'`. macOS `dd` lacks `oflag=append`, and any file-based byte-stream capture needs a persistent writer; removing `cat` requires migrating the fallback to `capture-pane` snapshots, which trades byte fidelity/scrollback and would rewrite the fallback tests. Left as-is pending a decision.

### Phase 4/5 — zombie + operational (done)
- Zombies were children of `serena` (external MCP runtime); no Backlog change. Exactly one `backlog workspace` remains (42325); the stray `--inspect-wait` process is gone.

### Phase 6 — verification
- `bunx tsc --noEmit` exit 0; `bun run check .` clean; `bun run build` fresh.
- Scoped suites green: agent-status, agent-status-probe, worker, opentui-existing-agent-host, opentui-agent-host-cleanup (incl. new assertion), session-launch, session-control, agent-sessions, opentui-workspace-controller (isolated).
- Full suite: 264/264 files, 2382 passed with `--timeout=30000`. Two pre-existing, unrelated flakes in CLI subprocess tests: `cli-list-window` (10 s timeout under 5-lane load) and `cli-doc-decision-board` (`Generated on:` differs by one wall-clock second between two runs). Both pass in isolation. The previously-noted `tui-window-title` failure now passes.
- AC#7 (before/after, analytical): before ~180 tmux execs/min/agent (lease 1/s + activity 2/s); after ~60/min (fused read+lease 1/s, zero idle captures). Corroborated by the isolated E2E (chained call verified) and by the one-`sh` process count.

### Remaining for the user
- Restart the live workspace to re-measure the persistent-process count (AC#2) against the rebuilt binary.
- Decide the AC#4 fallback `cat` clause (keep byte-stream writer vs migrate to `capture-pane` snapshots).

## Orphaned-process investigation (2026-10-08) - user reported leftover sleep/cat procs after quitting
- Live census: 11 orphaned `sh -c trap "" HUP TERM INT; while :; do sleep 1; done` shells, all PPID=1, one per pty ttys020-030, uptimes 10h/27m/etc. 0 real `cat` procs; 22 `sleep` (each keepalive re-forks one).
- ROOT CAUSE: these are leaked **test-harness** fixtures from `src/test/opentui-agent-host-cleanup.test.ts:92,198` (the ONLY tree occurrence of that literal). NOT spawned by the `backlog workspace` runtime: `rg -a -c "while :; do sleep 1" dist/backlog` = 0 (control literal `__vt-pipe` = 2, so binary strings are greppable).
- Mechanism: fixture ignores SIGHUP+SIGTERM by design; tmux kill-session/kill-server only SIGHUP; the test socket-death cleanup path (`tmux-test-server.ts:50/69`, `test-preload.ts:55`) never runs the SIGKILL escalation (`process-tree.ts:190` `terminateProcessTree`) that only fires from `agent-host.ts:285`. Runner-deadline kill or aborted case => pane root survives server death, reparents to launchd.
- Not a product-runtime bug. Fix belongs in test teardown (SIGKILL pane pgids before kill-server; capture pgid at start).
- AOE separation: tmux server 33689 + `aoe_Design_Refactor_45a63f04` + `aoe __vt-pipe` are AOE-owned (/Projects/gemini), PPID=1, unaffected by Backlog. Backlog shares the default server (BACK-8) and adds `backlog-back-5/9/10` sessions (PPID=33689), all healthy; `backlog workspace` pid 2196 is the single live app process.

## Orphan-leak fix implemented + verified (2026-10-08)
- Root cause (confirmed): HUP-ignoring test fixture panes survived because test teardown only SIGHUPed via `kill-server`.
- Fix: new `src/test/tmux-pane-groups.ts` (libtmux-free) with `killTmuxSocketPaneGroups(socket)` that enumerates `list-panes -a -F "#{pane_pid}"` and SIGKILLs each pane process group via `terminateProcessTreeSync`. `killTmuxServer` now reaps groups before `kill-server`; added `killTmuxServerSync` used by the `test-preload.ts` exit hook. Guard/prefix moved to the new module and re-exported from `tmux-test-server.ts` (public API preserved).
- Regression test added to `tmux-test-server.test.ts` ("retires a HUP-ignoring pane group before retiring the server") — creates a real HUP/TERM-ignoring pane, asserts it is dead after `killTmuxServer`.
- Verification (me, after rebuild): `find src -name "*.ts" -newer dist/backlog` empty; `bunx tsc --noEmit` rc=0; `bun run check .` clean (582 files); `tmux-test-server.test.ts` 6/6 pass; `opentui-agent-host-cleanup.test.ts` 6/6 pass.
- Live cleanup: 11 orphaned keepalive processes (PIDs 70730,58505,99746,33313,6058,63038,32463,75084,85534,32100,72629) SIGKILLed by group; 0 remain, sleep count 22 -> 0; removed stale sockets `backlog-back9-measure-78585/-80743`, `test-coalesce`. AOE server/session and live `backlog-back-*` sessions untouched; exactly one `backlog workspace` (2196).
- Still-open gap (not fixed): a test file SIGKILLed at the runner deadline runs no exit hook, so a parent-side sweep of stale `backlog-test-*` sockets would be the remaining belt-and-braces. In-process cleanup now escalates to SIGKILL on every path that runs.

## Parent-side sweep + process census (2026-10-08)
- Closed the deadline-rebuild gap: `scripts/run-ci-tests.ts` now writes a run-scoped socket registry (`$TMPDIR/tmux-sockets`, passed as `BACKLOG_TEST_TMUX_REGISTRY`), `uniqueTmuxSocket` and the test preload register every test socket, and the runner calls `sweepRegisteredTestTmuxServers()` in `finally` (SIGKILLs pane groups, kills each server, removes the socket file). Only names with the `backlog-test` prefix are touched, so concurrent runs and the default/AOE socket are never affected.
- New `src/test/tmux-pane-groups.test.ts`: registry no-op/append test + real-TMUX sweep test (HUP-ignoring pane killed, socket file removed).
- E2E proof: a temp test that starts a HUP-ignoring server then hangs was run under `BACKLOG_TEST_DEADLINE_MS=3000`; runner SIGKILLed it and the sweep left 0 `backlog-test-*` sockets and 0 HUP keepalives.
- Commits: `4c5bb691` (BACK-9 records), `f4f7feb1` (runner sweep). Branch: main.
- Process census Backlog vs AOE (per agent, persistent): 1 shell wrapper + 1 opencode + 1 serena + 1 typescript-language-server + 2 tsserver + 1 typingsInstaller + 1 `__vt-pipe` = 8 each. Delta 0 on every category; wrappers differ in form (`/bin/sh -c` vs `/bin/zsh aoe-pane-env`) but not count. Idle sleep/cat = 0 on both. Only deviations are serena-owned: a `SerenaDashboardTrayManager` singleton attached to one agent (back-3) and 2 short-lived serena zombies — not Backlog-spawned and not persistent.

## Comments

Answers to implementer questions captured in the description: (1) rebuild+re-baseline, Phase 1 already drafted; (2) Phase 2 = fuse into one tmux fork, keep lease; (3) AC#4 = fs.watch + >=2s backstop, cross-platform; (4) AC#7 = analytical rate accepted, no sudo.

AC#4 '\''no long-lived cat'\'' is not satisfiable while the fallback captures a raw byte stream to a file: macOS dd lacks oflag=append and any file-based pipe capture needs a persistent writer. Removing cat requires migrating the fallback to capture-pane snapshots (loses byte fidelity/scrollback, rewrites fallback tests). Implemented fs.watch + 2s backstop and left cat in place pending a decision.