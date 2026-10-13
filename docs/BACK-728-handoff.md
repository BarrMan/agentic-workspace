# BACK-728 — Handoff Document

**Status as of:** 2026-10-04, ~11:00 local
**Repo:** `/Users/imribarr/Projects/agentic-workspace`
**HEAD:** `243ba18b` — `BACK-728 - Exit on quit, fix footer focus matcher, stop tick re-presenting`

> **You have no prior context.** Read this whole document before touching anything.
> Nothing here is speculative unless explicitly marked "unverified".

---

## 1. What we are trying to do

BACK-728 is the multi-pane agent workspace launched by `agenticworkspace workspace`. It has two
user-visible problems:

1. **Ctrl+C / `q` does not exit.** The app dies visually (all panes go dead) but the
   process stays alive holding the terminal.
2. **It is laggy.** Measured: ~240 tmux subprocess calls and ~1,836 ms of serialized tmux
   wait per **30 seconds of idle**, with no user input.

There are two candidate resolutions, and **the decision between them has not been made**:

- **(A) Narrow fix** — repair the Ctrl+C/exit path inside the existing tmux-as-UI-substrate
  architecture. Days of work. Preserves everything.
- **(B) Replace the UI substrate** — one Ink process owns the terminal; tmux survives only
  as a private, never-attached PTY container for agent processes. Verified viable (see §6).

The user has expressed a clear preference for **(B)**, and it has been validated by a
working spike. It has **not** been formally approved, and no migration work has started.

---

## 2. Repo state — verify before you rely on it

```
HEAD:   243ba18b
Status: clean except untracked directories (listed below)
Binary: dist/agenticworkspace is CURRENT (nothing in src/ is newer)
```

Untracked directories, **none of which should be committed**:

| Path | Origin | Notes |
|---|---|---|
| `.backlog/` | the user's live project data | **Never modify, move, delete, or commit** |
| `docs/pi-extensions/` | **unknown** | ownership never established. Do not commit. |
| `.omp/` | appeared during this session | likely agent-session scratch |
| `.pi/` | appeared during this session | likely agent-session scratch |

### Project scripts (note the exact names — there is no `typecheck` script)

```sh
bun run check:types     # tsc --noEmit — THIS is the typecheck
bun test                # full suite, ~170s
bun run build           # produces dist/agenticworkspace
bun run check           # biome check (lint+format)
bun run lint            # biome lint --write
```

---

## 3. Hard project rules — violating these has caused real damage before

### 3.1 Rebuild after every source change (MANDATORY, not batchable)

`/opt/homebrew/bin/agenticworkspace` is a symlink to `/Users/imribarr/Projects/agentic-workspace/dist/agenticworkspace`.
Editing `src/**` changes nothing about what the `agenticworkspace` command actually runs.

```sh
bun run build
find src -name '*.ts' -newer dist/agenticworkspace   # MUST print nothing
```

If the second command lists files, the build did not pick them up. **Do not proceed to
manual testing.** This has caused repeated false "verified" claims on this project.

### 3.2 Never run these in the main working tree

```sh
git stash    git checkout --    git reset    git clean
```

The dirty tree is the only copy of the work. Use a separate `git worktree` if you need a
clean checkout for comparison.

### 3.3 Never `tmux kill-server` without `-L`

A bare `tmux kill-server` resolves to the **developer's default socket** and destroys every
unrelated session on the machine. The project has a dedicated guard for this at
`src/test/tmux-test-server.ts` (`TEST_TMUX_SOCKET_PREFIX = "backlog-test"`, plus
`assertIsolatedSocket`). Kill tmux servers **by PID** or via a private socket.

Also note: `tmux list-panes -a` **ignores `-t`** and shows real user sessions. Do not run it
against the default socket.

### 3.4 Never claim an e2e fix without testing the real process

There is a genuine trap here, described in §4.2 — a test passed and the user-visible bug
persisted, because the test exercised a different process than the one the user launches.

### 3.5 Never modify `.git/backlog-workspace/88f5d4c122ec...` or the user's `.backlog/`

Without explicit permission.

---

## 4. Root-cause diagnoses

### 4.1 Why Ctrl+C does not exit

The outer `agenticworkspace workspace` process calls `TmuxWorkspace.enter()`
(`src/agent-workspace/tmux-workspace.ts:812`), which calls `ensureHost()`,
`installTerminationHandlers()`, `showWorkspace()`, then **`attachClient()`** (line 827).

`attachClient()` hands the terminal to tmux through inherited stdio. The outer process is
therefore **no longer in the terminal's foreground process group**, so Ctrl+C is delivered
as a keypress to a pane and never reaches the outer process as SIGINT.

Two further defects compound it:

- `quitWorkspace()` kills pane process trees but **deliberately preserves** the tmux session,
  windows, layout, and the attached client via `remain-on-exit`. This is exactly the
  "all panes dead, program alive" symptom.
- `detach()` (lines 961–964) runs `switchClientLast()` whenever `TMUX` is set, but entry
  from a plain shell used `attach-session`, so `switch-client -l` has no previous client to
  return to.

**The narrow fix (option A) has three required changes, designed but NOT implemented:**

1. On explicit quit, kill the tmux session rather than preserving it — **or** redesign exit
   semantics explicitly. This is an open product decision, not purely technical.
2. Correct `detach()` for the `attach-session` entry path.
3. Make the outer process explicitly `process.exit(0)` after the client returns.

### 4.2 A "verified fix" that was not

The quit helpers were hardened and `workspace-quit` / `workspace-quit-keybind` passed at
12/12. An e2e test also showed Ctrl+C and `q` reducing five processes to zero.

**That e2e test was invalid for the user's symptom.** It exercised the inner `workspace-ui`
process (whose call sites at `src/ui/workspace/regions/navigation.ts:79` and
`src/ui/workspace/navigation-keys.ts:52` correctly call
`quitWorkspaceHost(host, host.exit ?? process.exit)`), not the outer `agenticworkspace workspace`
process the user actually launches. The inner path was never the problem.

### 4.3 Why it is laggy

Measured, not guessed:

| Scenario | Result |
|---|---|
| Populated `.backlog/`, switching panes | 18.9 / 15.6 / 18.6 / 18.8 ms, **one** `swap-pane`, zero spawns |
| Missing `.backlog/` | 60.6 / 16.8 / 16.8 / 17.9 ms, nothing displayed, first switch = 9 tmux calls |
| Entering a **sessionless** task | **89 tmux calls / 630 ms** |
| Idle, 30 s | **240 tmux calls / 1,836 ms** serialized tmux wait |

Slowest call sites: `show-options` 599 ms, `display-message` 564 ms, `select-pane` 345 ms,
`list-panes` 328 ms. Every tmux invocation costs ~6 ms and the code path uses **sequential
awaits**, so costs multiply linearly.

**The missing `.backlog/` migration was disproved as the cause.** It makes session
resolution silently broken but does not make ordinary switches materially slower.

Three concrete defects identified:

1. **`presentPane`** (`src/agent-workspace/tmux-workspace.ts:514`) treats
   `paneIds.get(activeTaskId)` as the display slot. If the task is not actually in that
   slot, two agent panes swap with each other and the placeholder remains.
2. **Two pane processes own independent `TmuxWorkspace` state.** Their first-switch swaps
   cancel each other.
3. **`paneIds` is loaded once** around `tmux-workspace.ts:533` and never invalidated, pushing
   later-started sessions onto the respawn path.

---

## 5. Test baseline — measured, do not trust relayed numbers

```
bun test  →  345 files, 2894 pass, 15 fail, 0 skips, exit 1, ~170s
```

**Four failures are deterministic and pre-existing** — they reproduce identically at clean
`e03c1f3f` and were introduced by nothing in this work:

- `branch-task-loader-resilience.test.ts` (2)
- `cli-init-create.test.ts` (1)
- `cli-guidance.test.ts` (1)
- `agent-workspace-cli.test.ts` (1)

**One is flaky and already broken at clean HEAD**, failing at a *different line each run*
(observed at 411, 563, and 870 across runs):

- `tmux-workspace-integration.test.ts`

  Current signature: `Timed out waiting for Workspace footer input focus.` at line 411,
  `selected=%4 expected=%3 editing=true`. An earlier run produced
  `Timed out waiting for live Workspace search filtering.` at line 563.

`server-statistics-endpoint.test.ts` passes in isolation and is load-dependent — it fails
under full-suite load only.

A previously relayed baseline claimed `tui-window-title.test.ts` was failing. **It passes.**
Do not treat relayed baselines as authoritative; re-measure.

---

## 6. Work completed by previous agents

### 6.1 Committed — `e03c1f3f` (baseline)

`BACK-728 - Replace tmux-option workspace state with a view-state store`. Includes the
view-state store, `recover()` split, session lookup deduplication, removal of
`git rev-parse`, and reduction of 20-spawns-per-keypress to one.

### 6.2 Committed — `243ba18b` (this session)

`BACK-728 - Exit on quit, fix footer focus matcher, stop tick re-presenting`
14 files, +424 / −44:

- `src/ui/workspace/regions/quit.ts` — quit helper now requires an explicit `exit`
  callback; missing production call sites fail at compile time instead of silently
  teardown-only.
- `src/ui/workspace/navigation-keys.ts`, `src/ui/workspace/regions/navigation.ts` — updated
  call sites.
- `src/ui/workspace/pane.ts` — footer input-focus matcher fix.
- `src/ui/unified/controller.ts` — tick no longer re-presents the workspace every tick. (This path was removed with the legacy blessed TUI.)
- `src/agent-workspace/tmux-workspace.ts`, `src/utils/debug-log.ts` — env-forwarding for
  `BACKLOG_DEBUG` into pane children. **Note:** these two were not among the three named
  fixes but are legitimate and documented in the commit body.
- Tests: `workspace-quit.test.ts` (modified), `workspace-quit-keybind.test.ts` (new),
  `workspace-tick-presentation.test.ts` (new), `workspace-search-rendering.test.ts`,
  `agent-workspace-navigation.test.ts`, `tmux-workspace-integration.test.ts`,
  `view-state-harness.ts`.

Verification at commit time: `bun run check:types` exit 0; 24 pass / 0 fail on
quit/tick/navigation tests; 68 pass / 0 fail on the tmux suite; `bun run build` exit 0;
binary freshness check empty.

One assertion change was scrutinized and judged **correcting, not loosening**:
`workspace-search-rendering` changed `"[Q] Close"` → `"[Q] Back"` because `footer.ts:23`
returns `isTmuxWorkspace() ? "Back" : "Close"` and the test runs inside a tmux workspace.

### 6.3 The Ink spike — built, verified, NOT a production migration

**Location:** `/Users/imribarr/Projects/ink-pty-spike` (standalone, outside this repo)
**Verdict:** the architecture works under Bun. 565 lines. See its `README.md`.

Proven with a **real, authenticated `opencode`** (truecolor TUI, no synthetic fallback):

- Ink 6.8 renders under Bun: navbar, content pane, footer.
- tmux on a **private socket** (`-L inkspike.<pid>`, own `TMUX_TMPDIR`) hosts the agent.
- `tmux pipe-pane -o 'cat > <file>'` streams **raw ANSI** (not a `capture-pane` scrape).
- `@xterm/headless` parses it into a colored cell grid.
- Ink re-emits those exact colors: `#5c9cf5`, `#ffffff`, `#808080`, bg `#1e1e1e`.
- Input round-trips: typed text → `send-keys` → **live LLM reply** → streamed back →
  rendered with color.

```sh
cd /Users/imribarr/Projects/ink-pty-spike
cat README.md
bun run src/main.tsx      # needs a real terminal
```

---

## 7. Findings from the spike that MUST shape the design

These are not theoretical — each one is a bug if unhandled.

1. **`exitOnCtrlC` defaults to `FALSE` in Ink 6.** Proved by experiment: heartbeats kept
   firing after Ctrl+C and `waitUntilExit` never resolved. You must opt in explicitly or
   handle it in `useInput`. *(This is the same class of bug we are trying to eliminate.)*
2. **Ink never enters the alternate screen.** `ESC[?1049h` is never emitted. Full-screen Ink
   pollutes terminal scrollback. You must wrap this yourself.
3. **`useInput` delivers stdin in CHUNKS, not per key.** `if (input.length === 1)` silently
   drops pasted or fast-typed text. Must split/batch.
4. **`@xterm/headless.write()` is async** even headless. Reading `buffer.active` in the same
   tick yields an **empty grid**. Needs a pending-write counter or the pane renders blank.
5. **`pipe-pane` cannot be attached retroactively.** Attach to a bare shell, then
   `send-keys` the agent command — otherwise the splash is lost.
6. **`send-keys` per keystroke is a `spawnSync` fork (~20–30 ms)** that blocks the Ink event
   loop. Batch into a single `send-keys -l`.
7. **Claude Code renders with ZERO color inside tmux** — 0 SGR sequences in 2,830 bytes.
   Almost certainly tmux's default `TERM=screen`. Likely fix is
   `set -g default-terminal "tmux-256color"`, **but this is UNVERIFIED.**
8. **Render cost is the real scaling risk.** A 122×34 grid is ~7 KB of Ink output and ~2,400
   `<Text>` nodes per frame. One pane works; a multi-pane workspace needs cell-diffing or it
   re-emits the whole grid every tick — the exact class of bug already being fixed.
9. Non-TTY stdout: Ink renders but chalk strips all color, and React logs a spurious
   "two children with the same key" warning into the frame.
10. `resize-window` from the host works (confirmed 120×34 → 80×24) but was **not** wired to
    Ink's resize event.

---

## 8. Open questions — resolve before committing to the migration

### 8.1 Does `tmux-256color` restore Claude's colors? (highest value, ~2 minutes)

This decides whether claude can be supported in an Ink pane at all. Silent color loss is
indistinguishable from a broken pipeline, so it must be proven either way.

### 8.2 `nativeSessionId` capture is NOT verified end to end

This **gates the resume-based architecture**. If agents are killed with the TUI (which the
new design requires) and the session ID is wrong or missing, resume fails and you have lost
the user's agent conversation. Verify before relying on it.

Resume commands already exist in `src/agent-workspace/bootstrap.ts`:

| Preset | Resume invocation |
|---|---|
| opencode | `--session <id>` |
| claude | `--resume <id>` |
| codex | `resume <id>` |
| gemini | `--resume <id>` |
| antigravity | `--conversation <id>` |

`buildAgentResumeCommand` also handles unknown IDs via `--continue`, `resume --last`, or
`--resume latest`.

### 8.3 Exit semantics on explicit quit (blocks option A)

Does explicit quit **kill** the tmux session, or preserve it and return the terminal? The
user must decide. This is a product decision, not a technical one.

---

## 9. Uncommitted / pending work

| Item | Status |
|---|---|
| Ctrl+C narrow fix (option A) | Designed, **not implemented** — see §4.1 |
| `.backlog/` migration | **Never run.** The user has not done it. Roughly 30 live session dirs remain under `.git/backlog-workspace/`. Leave it to the user. |
| `docs/pi-extensions/01-agent-yaml-error.md` | Untracked, ownership unknown, nothing in `src/` references it. Needs a decision. |
| `docs/BACK-728-handoff.md` (this file) | Untracked, not committed |
| Ink migration | Not started. Spike only. |

---

## 10. Scale of the option-B migration

Measured, so the estimate is grounded:

| Area | Files | Lines |
|---|---|---|
| `src/ui/` (all TUI) | 83 | 13,327 |
| `src/ui/workspace/` | 20 | 2,326 |
| `src/agent-workspace/` | 28 | 5,310 |
| `src/agent-workspace/tmux/` | 8 | 1,380 |
| Files importing blessed | 42 | 9,815 |
| `tmux-workspace.ts` | 1 | 1,023 (only ~43 calls into the tmux layer) |

Supporting facts:

- UI used `neo-neo-bblessed@1.0.10` at the time of this handoff (the legacy blessed TUI has since been removed). **Ink is not currently used.**
- `react@19.2.7` + `react-dom` + `react-router-dom` are already dependencies (for the **web**
  UI). React is not a new paradigm here.
- `node-pty` appears only in `trustedDependencies` — absent from dependencies, not installed.
  It loads under Bun but `spawn()` fails with `posix_spawnp failed` because the `spawn-helper`
  native binary is not built. **It fails identically under Node**, so this is node-pty's
  install, not a Bun limitation. Fixable, but adds native-build friction.
- `@xterm/headless@5.5.0` **is already installed** in `node_modules`.
- tmux is **not** currently drawing the UI. `tmux-workspace.ts:637` respawns panes as the
  same binary running blessed via `workspace-ui`.
- Agent output is scraped by `capture-pane` polling at `src/agent-workspace/tmux/pane.ts:187`.
- Debug instrumentation already supports `BACKLOG_DEBUG=tmux,view,session,store`,
  `BACKLOG_DEBUG_FILE`, `BACKLOG_DEBUG_VERBOSE`; pane children receive these env vars.
- `Bun.file(p).text()` is safe against atomic-rename writes. `Bun.Glob` does **not** descend
  into dot-directories.
- tmux facts: `=title` cannot target `swap-pane` (use pane IDs); pane IDs are monotonic and
  not reused.

### Target architecture

```
agenticworkspace workspace
  └─ ONE Ink process — owns the terminal, alternateScreen, ctrl+c
       ├─ navbar / task list / details / footer   ← Yoga Flexbox, replaces 6 processes
       ├─ live agent output  ← pipe-pane → @xterm/headless → cell grid → Ink <Text>
       └─ (agents die with the TUI; resume from persisted nativeSessionId next launch)
  └─ private tmux session on a private socket — never attached, PTY + agents only
```

**Deletes:** the terminal-handover layer (~450 lines), six UI processes, cross-process state
races, the tmux key-table, and the `capture-pane` polling loop. **Agents already die on a
clean quit** via `quitWorkspace()` → `killPaneProcessTrees()` (descendants-first SIGTERM,
100 ms grace, then SIGKILL), so allowing them not to outlive the TUI costs nothing new.

---

## 11. Recommended next steps, in order

1. **Resolve §8.1** — confirm or refute `tmux-256color` fixing claude colors. Cheapest
   highest-information test available.
2. **Verify §8.2** — trace `nativeSessionId` capture for all five presets end to end. This
   gates the whole resume-based design.
3. **Decide A vs B** with the user, presenting §7 findings honestly.
4. If **B**: scope a vertical slice — one Ink process, one private-socket tmux for agent PTYs,
   explicit shutdown, resume on relaunch. Reuse `/Users/imribarr/Projects/ink-pty-spike` as
   the starting skeleton.
5. If **A**: resolve §8.3, implement the three changes in §4.1, rebuild, and **test the outer
   `agenticworkspace workspace` process** — not the inner `workspace-ui`.
6. Re-measure a clean test baseline (§5 numbers are from a dirty tree).
7. Decide what to do with `docs/pi-extensions/`.
8. Run the `.backlog/` migration — but only with the user's explicit go-ahead.

---

## 12. Incidents during this work — read before trusting any agent report

### 12.1 A subagent left three processes spinning at 98–99% CPU for ~53 minutes

The Ink spike worker reported **"Zero stray processes."** That was false. Three
`bun run src/minimal.tsx` processes were orphaned (PPID=1) and burned ~3 cores on a 10-core
machine for over half an hour. Root cause: an Ink render loop that never exits after the
output capture completes.

**Any subagent that launches a TUI or long-running process must clean it up and prove it.**
Verify independently; do not trust the report.

### 12.2 The default tmux server died, cause unknown

The user's default socket had four live sessions early in this work:
`aoe_Serena_Pi_52aaad66`, `aoe_TMux_Lag_7b27db70`, `backlog-workspace-2e166c0806fa`,
`backlog-workspace-88f5d4c122ec`.

All four were gone before any cleanup was performed. **Nothing in this session's cleanup
killed it** — the only tmux server terminated was PID 2853, this project's own A/B
experiment lab (session `driver`, cwd `/private/tmp/backlog-ab-lab/repo`), killed **by PID**,
never with `kill-server`.

**The cause was never established.** Prime suspect is the test suite, which creates sockets
aggressively (`backlog-test-*`, `backlog-integration-*`, `backlog-workspace-*`) and for which
the `tmux-test-server.ts` guard exists precisely because a bare `kill-server` reaches the
default socket. **This is worth auditing** — it is a live risk to the user's sessions.

### 12.3 Cleanup that was performed

Killed: 3 runaway `minimal.tsx` loops; orphan tmux server PID 2853 (by PID); 5
`dist/agenticworkspace workspace-ui` panes; 4 `sleep` processes; 17 stale tmux socket files (each
truth-tested by exit code first). Verified zero remaining tmux servers, sockets, or orphans.
All three live `pi` agent sessions survived.

---

## 13. Style / engineering constraints

- Use `Object.assign`, not spread, to inject dependencies into class instances.
- Avoid god functions, meaningless names, mutation inside reads, duplicated idioms, and
  per-call symptom patches.
- Every changed line must trace directly to the request. No drive-by cleanup or refactoring.
- Keep it simple — no speculative abstractions, configurability, or future-proofing.
- Comments explain non-obvious reasons, not obvious code.
- Workers verify their own work and return **conclusions and evidence, not exploration
  transcripts**.
- Never report success without checking the result. Never weaken tests to make them pass.
  Fix causes, not symptoms.
