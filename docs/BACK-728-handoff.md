---
consolidation:
  total: 172
  counts:
    exists: 16
    discard: 115
    integrate: 13
    unconfirmed: 28
  percentages:
    exists: 9.30%
    discard: 66.86%
    integrate: 7.56%
    unconfirmed: 16.28%
---
# BACK-728 — Handoff Document

> **Non-authoritative supporting material.** This file is not a contract. Authoritative owner(s): [sessions](specs/sessions.md), [supported integration operations](specs/supported-integration-operations.md), [BLUEPRINT](BLUEPRINT.md), [application boundaries](architecture/application-boundaries.md), [CONVENTIONS](CONVENTIONS.md), [ADRs](adr/README.md).
> Disposition: Mixed — see markers.

**Status as of:** 2026-10-04, ~11:00 local <!-- consolidation: discard; ref: none; reason: Historical checkpoint timestamp. -->
**Repo:** `/Users/imribarr/Projects/agentic-workspace` <!-- consolidation: discard; ref: none; reason: Local checkout locator. -->
**HEAD:** `243ba18b` — `BACK-728 - Exit on quit, fix footer focus matcher, stop tick re-presenting` <!-- consolidation: discard; ref: none; reason: Historical checkpoint identity. -->

> **You have no prior context.** Read this whole document before touching anything. <!-- consolidation: discard; ref: none; reason: Historical handoff reading instruction. -->
> Nothing here is speculative unless explicitly marked "unverified". <!-- consolidation: discard; ref: none; reason: Blanket historical certainty assertion cannot override evidence or approval requirements. -->

---

## 1. What we are trying to do

BACK-728 is the multi-pane agent workspace launched by `agentic-workspace workspace`. It has two
user-visible problems: <!-- consolidation: discard; ref: none; reason: Historical task and entrypoint scope. -->

1. **Ctrl+C / `q` does not exit.** The app dies visually (all panes go dead) but the
   process stays alive holding the terminal. <!-- consolidation: discard; ref: none; reason: Historical exit failure symptom rather than current q-exit contract. -->
2. **It is laggy.** Measured: ~240 tmux subprocess calls and ~1,836 ms of serialized tmux
   wait per **30 seconds of idle**, with no user input. <!-- consolidation: discard; ref: none; reason: Historical idle latency measurement. -->

There are two candidate resolutions, and **the decision between them has not been made**: <!-- consolidation: unconfirmed; ref: docs/adr/README.md#active-decisions; reason: This handoff provides no approved UI technology selection. -->

- **(A) Narrow fix** — repair the Ctrl+C/exit path inside the existing tmux-as-UI-substrate
  architecture. Days of work. Preserves everything. <!-- consolidation: unconfirmed; ref: docs/adr/README.md#active-decisions; reason: Narrow tmux UI repair was an unapproved option with unverified effort and preservation claims. -->
- **(B) Replace the UI substrate** — one Ink process owns the terminal; tmux survives only
  as a private, never-attached PTY container for agent processes. Verified viable (see §6). <!-- consolidation: unconfirmed; ref: docs/adr/README.md#active-decisions; reason: Ink/private-tmux substrate proposal lacks technology approval despite spike evidence. -->

The user has expressed a clear preference for **(B)**, and it has been validated by a
working spike. It has **not** been formally approved, and no migration work has started. <!-- consolidation: discard; ref: none; reason: Historical preference spike and rollout status. --> <!-- consolidation: unconfirmed; ref: docs/adr/README.md#active-decisions; reason: Expressed preference and a spike do not establish formal architecture approval. -->

---

## 2. Repo state — verify before you rely on it

```
HEAD:   243ba18b
Status: clean except untracked directories (listed below)
Binary: dist/agentic-workspace is CURRENT (nothing in src/ is newer)
```
<!-- consolidation: discard; ref: none; reason: Historical checkout and binary freshness snapshot. -->

Untracked directories, **none of which should be committed**: <!-- consolidation: exists; ref: docs/CONVENTIONS.md#general-principles; reason: Unrelated user and unknown-origin files must be preserved. -->

| Path | Origin | Notes |
|---|---|---|
| `.agentic-workspace/` | the user's live project data | **Never modify, move, delete, or commit** <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Live user project data must not be changed or committed during engineering work without explicit authorization. --> |
| `docs/pi-extensions/` | **unknown** | ownership never established. Do not commit. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#general-principles; reason: Directory provenance and disposition remain unknown. --> |
| `.omp/` | appeared during this session | likely agent-session scratch <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#general-principles; reason: Scratch origin is speculative and does not authorize cleanup. --> |
| `.pi/` | appeared during this session | likely agent-session scratch <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#general-principles; reason: Scratch origin is speculative and does not authorize cleanup. --> |

### Project scripts (note the exact names — there is no `typecheck` script)
<!-- consolidation: discard; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Historical script inventory belongs to package scripts rather than a duplicate contract. -->

```sh
bun run check:types     # tsc --noEmit — THIS is the typecheck
bun test                # full suite, ~170s
bun run build           # produces dist/agentic-workspace
bun run check           # biome check (lint+format)
bun run lint            # biome lint --write
```
<!-- consolidation: discard; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Historical command example and timing yield to current package inventory. -->

---

## 3. Hard project rules — violating these has caused real damage before

### 3.1 Rebuild after every source change (MANDATORY, not batchable)
<!-- consolidation: discard; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Per-edit unbatchable builds are superseded by rebuilding after integration before runnable handoff. -->

`/opt/homebrew/bin/agentic-workspace` is a symlink to `/Users/imribarr/Projects/agentic-workspace/dist/agentic-workspace`. <!-- consolidation: exists; ref: AGENTS.md#why; reason: The documented installed-command symlink explains the rebuild-before-handoff rule, this claim is documented, not runtime-verified. -->
Editing `src/**` changes nothing about what the `agentic-workspace` command actually runs. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Source edits/tests do not refresh the installed binary. -->

```sh
bun run build
find src -name '*.ts' -newer dist/agentic-workspace   # MUST print nothing
```
<!-- consolidation: exists; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Rebuild and freshness procedure is explicitly delegated to AGENTS. -->

If the second command lists files, the build did not pick them up. **Do not proceed to
manual testing.** This has caused repeated false "verified" claims on this project. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Verified binary freshness is required before installed-runtime handoff. --> <!-- consolidation: discard; ref: none; reason: Historical false-verification incident summary. -->

### 3.2 Never run these in the main working tree

```sh
git stash    git checkout --    git reset    git clean
```
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Preserve the main dirty tree by prohibiting stash checkout-reset and clean during investigation. -->

The dirty tree is the only copy of the work. Use a separate `git worktree` if you need a
clean checkout for comparison. <!-- consolidation: discard; ref: none; reason: Historical only-copy baseline observation. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Use a separate worktree for clean comparisons rather than manipulating the dirty baseline. -->

### 3.3 Never `tmux kill-server` without `-L`
<!-- consolidation: exists; ref: docs/CONVENTIONS.md#testing; reason: Bare kill-server and developer/default sockets are forbidden. -->

A bare `tmux kill-server` resolves to the **developer's default socket** and destroys every
unrelated session on the machine. The project has a dedicated guard for this at
`src/test/tmux-test-server.ts` (`TEST_TMUX_SOCKET_PREFIX = "agentic-workspace-test"`, plus
`assertIsolatedSocket`). Kill tmux servers **by PID** or via a private socket. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#testing; reason: Tests use isolated tmux helpers and only owned resources. --> <!-- consolidation: discard; ref: none; reason: Historical helper symbol and prefix inventory. --> <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#observation-stop-and-deletion; reason: PID-only wording must retain provenance checks because a PID alone does not authorize termination. -->

Also note: `tmux list-panes -a` **ignores `-t`** and shows real user sessions. Do not run it
against the default socket. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#testing; reason: Broad default-server process discovery is forbidden. --> <!-- consolidation: discard; ref: none; reason: External tmux flag behavior is supporting operational evidence. -->

### 3.4 Never claim an e2e fix without testing the real process
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: End-to-end fixes must exercise the actual user-launched outer process. -->

There is a genuine trap here, described in §4.2 — a test passed and the user-visible bug
persisted, because the test exercised a different process than the one the user launches. <!-- consolidation: discard; ref: none; reason: Historical wrong-process verification incident. -->

### 3.5 Never modify `.git/backlog-workspace/88f5d4c122ec...` or the user's `.agentic-workspace/`

Without explicit permission. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Live project/session stores including old locations require explicit permission before modification. -->

---

## 4. Root-cause diagnoses

### 4.1 Why Ctrl+C does not exit

The outer `agentic-workspace workspace` process calls `TmuxWorkspace.enter()`
(`src/agent-workspace/tmux-workspace.ts:812`), which calls `ensureHost()`,
`installTerminationHandlers()`, `showWorkspace()`, then **`attachClient()`** (line 827). <!-- consolidation: discard; ref: none; reason: Historical outer-process call trace. -->

`attachClient()` hands the terminal to tmux through inherited stdio. The outer process is
therefore **no longer in the terminal's foreground process group**, so Ctrl+C is delivered
as a keypress to a pane and never reaches the outer process as SIGINT. <!-- consolidation: discard; ref: none; reason: Historical foreground-process diagnosis. -->

Two further defects compound it:

- `quitWorkspace()` kills pane process trees but **deliberately preserves** the tmux session,
  windows, layout, and the attached client via `remain-on-exit`. This is exactly the
  "all panes dead, program alive" symptom. <!-- consolidation: discard; ref: none; reason: Historical quit defect diagnosis. -->
- `detach()` (lines 961–964) runs `switchClientLast()` whenever `TMUX` is set, but entry
  from a plain shell used `attach-session`, so `switch-client -l` has no previous client to
  return to. <!-- consolidation: discard; ref: none; reason: Historical detach defect diagnosis. -->

**The narrow fix (option A) has three required changes, designed but NOT implemented:**
<!-- consolidation: discard; ref: none; reason: Historical implementation status introduction. -->

1. On explicit quit, kill the tmux session rather than preserving it — **or** redesign exit
   semantics explicitly. This is an open product decision, not purely technical. <!-- consolidation: discard; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Current exit behavior detaches clients and preserves running agents. -->
2. Correct `detach()` for the `attach-session` entry path. <!-- consolidation: discard; ref: none; reason: Historical proposed implementation repair. -->
3. Make the outer process explicitly `process.exit(0)` after the client returns. <!-- consolidation: unconfirmed; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Explicit process.exit implementation proposal is not an approved cleanup strategy. -->

### 4.2 A "verified fix" that was not

The quit helpers were hardened and `workspace-quit` / `workspace-quit-keybind` passed at
12/12. An e2e test also showed Ctrl+C and `q` reducing five processes to zero. <!-- consolidation: discard; ref: none; reason: Dated inner-process test result. -->

**That e2e test was invalid for the user's symptom.** It exercised the inner `workspace-ui`
process (whose call sites at `src/ui/workspace/regions/navigation.ts:79` and
`src/ui/workspace/navigation-keys.ts:52` correctly call
`quitWorkspaceHost(host, host.exit ?? process.exit)`), not the outer `agentic-workspace workspace`
process the user actually launches. The inner path was never the problem. <!-- consolidation: discard; ref: none; reason: Historical invalid-test diagnosis with source call-site evidence. -->

### 4.3 Why it is laggy

Measured, not guessed:

| Scenario | Result |
|---|---|
| Populated `.agentic-workspace/`, switching panes | 18.9 / 15.6 / 18.6 / 18.8 ms, **one** `swap-pane`, zero spawns <!-- consolidation: discard; ref: none; reason: Historical switch measurement. --> |
| Missing `.agentic-workspace/` | 60.6 / 16.8 / 16.8 / 17.9 ms, nothing displayed, first switch = 9 tmux calls <!-- consolidation: discard; ref: none; reason: Historical missing-store measurement. --> |
| Entering a **sessionless** task | **89 tmux calls / 630 ms** <!-- consolidation: discard; ref: none; reason: Historical sessionless-entry measurement. --> |
| Idle, 30 s | **240 tmux calls / 1,836 ms** serialized tmux wait <!-- consolidation: discard; ref: none; reason: Historical idle measurement. --> |

Slowest call sites: `show-options` 599 ms, `display-message` 564 ms, `select-pane` 345 ms,
`list-panes` 328 ms. Every tmux invocation costs ~6 ms and the code path uses **sequential
awaits**, so costs multiply linearly. <!-- consolidation: discard; ref: none; reason: Historical call-site timing and serialization diagnosis. -->

**The missing `.agentic-workspace/` migration was disproved as the cause.** It makes session
resolution silently broken but does not make ordinary switches materially slower. <!-- consolidation: discard; ref: none; reason: Historical rejected latency hypothesis and session-resolution finding. -->

Three concrete defects identified:

1. **`presentPane`** (`src/agent-workspace/tmux-workspace.ts:514`) treats
   `paneIds.get(activeTaskId)` as the display slot. If the task is not actually in that
   slot, two agent panes swap with each other and the placeholder remains. <!-- consolidation: discard; ref: none; reason: Historical presentPane defect. -->
2. **Two pane processes own independent `TmuxWorkspace` state.** Their first-switch swaps
   cancel each other. <!-- consolidation: discard; ref: none; reason: Historical duplicate workspace-state defect. -->
3. **`paneIds` is loaded once** around `tmux-workspace.ts:533` and never invalidated, pushing
   later-started sessions onto the respawn path. <!-- consolidation: discard; ref: none; reason: Historical stale pane-map defect. -->

---

## 5. Test baseline — measured, do not trust relayed numbers

```
bun test  →  345 files, 2894 pass, 15 fail, 0 skips, exit 1, ~170s
```
<!-- consolidation: discard; ref: none; reason: Historical failing baseline result. -->

**Four failures are deterministic and pre-existing** — they reproduce identically at clean
`e03c1f3f` and were introduced by nothing in this work: <!-- consolidation: discard; ref: none; reason: Historical baseline attribution whose stated four count differs from listed case counts. -->

- `branch-task-loader-resilience.test.ts` (2) <!-- consolidation: discard; ref: none; reason: Historical failure count. -->
- `cli-init-create.test.ts` (1) <!-- consolidation: discard; ref: none; reason: Historical failure count. -->
- `cli-guidance.test.ts` (1) <!-- consolidation: discard; ref: none; reason: Historical failure count. -->
- `agent-workspace-cli.test.ts` (1) <!-- consolidation: discard; ref: none; reason: Historical failure count. -->

**One is flaky and already broken at clean HEAD**, failing at a *different line each run*
(observed at 411, 563, and 870 across runs): <!-- consolidation: discard; ref: none; reason: Historical flaky baseline attribution. -->

- `tmux-workspace-integration.test.ts` <!-- consolidation: discard; ref: none; reason: Historical failing test locator. -->

  Current signature: `Timed out waiting for Workspace footer input focus.` at line 411,
  `selected=%4 expected=%3 editing=true`. An earlier run produced
  `Timed out waiting for live Workspace search filtering.` at line 563. <!-- consolidation: discard; ref: none; reason: Historical timeout signatures. -->

`server-statistics-endpoint.test.ts` passes in isolation and is load-dependent — it fails
under full-suite load only. <!-- consolidation: discard; ref: none; reason: Historical load-dependent failure diagnosis. -->

A previously relayed baseline claimed `tui-window-title.test.ts` was failing. **It passes.**
Do not treat relayed baselines as authoritative; re-measure. <!-- consolidation: discard; ref: none; reason: Historical corrected baseline result. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#testing; reason: Re-measure baselines rather than copying old counts. -->

---

## 6. Work completed by previous agents

### 6.1 Committed — `e03c1f3f` (baseline)

`BACK-728 - Replace tmux-option workspace state with a view-state store`. Includes the
view-state store, `recover()` split, session lookup deduplication, removal of
`git rev-parse`, and reduction of 20-spawns-per-keypress to one. <!-- consolidation: discard; ref: none; reason: Historical baseline commit changes. -->

### 6.2 Committed — `243ba18b` (this session)

`BACK-728 - Exit on quit, fix footer focus matcher, stop tick re-presenting`
14 files, +424 / −44: <!-- consolidation: discard; ref: none; reason: Historical commit size and subject. -->

- `src/ui/workspace/regions/quit.ts` — quit helper now requires an explicit `exit`
  callback; missing production call sites fail at compile time instead of silently
  teardown-only. <!-- consolidation: discard; ref: none; reason: Historical explicit-exit helper change. -->
- `src/ui/workspace/navigation-keys.ts`, `src/ui/workspace/regions/navigation.ts` — updated
  call sites. <!-- consolidation: discard; ref: none; reason: Historical caller updates. -->
- `src/ui/workspace/pane.ts` — footer input-focus matcher fix. <!-- consolidation: discard; ref: none; reason: Historical matcher fix. -->
- `src/ui/unified/controller.ts` — tick no longer re-presents the workspace every tick. (This path was removed with the legacy blessed TUI.) <!-- consolidation: discard; ref: none; reason: Historical fix in retired UI code. -->
- `src/agent-workspace/tmux-workspace.ts`, `src/utils/debug-log.ts` — env-forwarding for
  `AGENTIC_WORKSPACE_DEBUG` into pane children. **Note:** these two were not among the three named
  fixes but are legitimate and documented in the commit body. <!-- consolidation: discard; ref: none; reason: Historical debug instrumentation and commit-scope explanation. -->
- Tests: `workspace-quit.test.ts` (modified), `workspace-quit-keybind.test.ts` (new),
  `workspace-tick-presentation.test.ts` (new), `workspace-search-rendering.test.ts`,
  `agent-workspace-navigation.test.ts`, `tmux-workspace-integration.test.ts`,
  `view-state-harness.ts`. <!-- consolidation: discard; ref: none; reason: Historical changed-test inventory. -->

Verification at commit time: `bun run check:types` exit 0; 24 pass / 0 fail on
quit/tick/navigation tests; 68 pass / 0 fail on the tmux suite; `bun run build` exit 0;
binary freshness check empty. <!-- consolidation: discard; ref: none; reason: Historical type test build and freshness verification batch. -->

One assertion change was scrutinized and judged **correcting, not loosening**:
`workspace-search-rendering` changed `"[Q] Close"` → `"[Q] Back"` because `footer.ts:23`
returns `isTmuxWorkspace() ? "Back" : "Close"` and the test runs inside a tmux workspace. <!-- consolidation: discard; ref: none; reason: Historical assertion correction rationale. -->

### 6.3 The Ink spike — built, verified, NOT a production migration

**Location:** `/Users/imribarr/Projects/ink-pty-spike` (standalone, outside this repo) <!-- consolidation: discard; ref: none; reason: Historical external spike locator. -->
**Verdict:** the architecture works under Bun. 565 lines. See its `README.md`. <!-- consolidation: discard; ref: none; reason: Dated spike viability result rather than production approval. -->

Proven with a **real, authenticated `opencode`** (truecolor TUI, no synthetic fallback): <!-- consolidation: discard; ref: none; reason: Historical spike evidence scope. -->

- Ink 6.8 renders under Bun: navbar, content pane, footer. <!-- consolidation: discard; ref: none; reason: Historical spike rendering result. -->
- tmux on a **private socket** (`-L inkspike.<pid>`, own `TMUX_TMPDIR`) hosts the agent. <!-- consolidation: discard; ref: none; reason: Historical spike topology. -->
- `tmux pipe-pane -o 'cat > <file>'` streams **raw ANSI** (not a `capture-pane` scrape). <!-- consolidation: discard; ref: none; reason: Historical spike transport result. -->
- `@xterm/headless` parses it into a colored cell grid. <!-- consolidation: discard; ref: none; reason: Historical spike parser choice. -->
- Ink re-emits those exact colors: `#5c9cf5`, `#ffffff`, `#808080`, bg `#1e1e1e`. <!-- consolidation: discard; ref: none; reason: Historical color-fidelity measurement. -->
- Input round-trips: typed text → `send-keys` → **live LLM reply** → streamed back →
  rendered with color. <!-- consolidation: discard; ref: none; reason: Historical live input/output round-trip result. -->

```sh
cd /Users/imribarr/Projects/ink-pty-spike
cat README.md
bun run src/main.tsx      # needs a real terminal
```
<!-- consolidation: discard; ref: none; reason: Historical external spike invocation. -->

---

## 7. Findings from the spike that MUST shape the design

These are not theoretical — each one is a bug if unhandled. <!-- consolidation: discard; ref: none; reason: Historical spike-specific risk framing. -->

1. **`exitOnCtrlC` defaults to `FALSE` in Ink 6.** Proved by experiment: heartbeats kept
   firing after Ctrl+C and `waitUntilExit` never resolved. You must opt in explicitly or
   handle it in `useInput`. *(This is the same class of bug we are trying to eliminate.)* <!-- consolidation: discard; ref: none; reason: Ink-version-specific default and spike diagnosis do not establish current implementation requirements. -->
2. **Ink never enters the alternate screen.** `ESC[?1049h` is never emitted. Full-screen Ink
   pollutes terminal scrollback. You must wrap this yourself. <!-- consolidation: unconfirmed; ref: docs/adr/README.md#active-decisions; reason: Ink alternate-screen wrapper applies only if that unapproved substrate is selected. -->
3. **`useInput` delivers stdin in CHUNKS, not per key.** `if (input.length === 1)` silently
   drops pasted or fast-typed text. Must split/batch. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#code-structure; reason: Terminal input handlers must accept paste and multi-key chunks without dropping text. --> <!-- consolidation: discard; ref: none; reason: Ink-specific input delivery observation is supporting spike evidence. -->
4. **`@xterm/headless.write()` is async** even headless. Reading `buffer.active` in the same
   tick yields an **empty grid**. Needs a pending-write counter or the pane renders blank. <!-- consolidation: discard; ref: none; reason: External parser timing observation from the spike. --> <!-- consolidation: unconfirmed; ref: docs/adr/README.md#active-decisions; reason: Pending-write-counter remedy depends on unapproved rendering pipeline selection. -->
5. **`pipe-pane` cannot be attached retroactively.** Attach to a bare shell, then
   `send-keys` the agent command — otherwise the splash is lost. <!-- consolidation: discard; ref: docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport; reason: Spike startup-stream workaround superseded by current-screen seeding plus live updates. -->
6. **`send-keys` per keystroke is a `spawnSync` fork (~20–30 ms)** that blocks the Ink event
   loop. Batch into a single `send-keys -l`. <!-- consolidation: discard; ref: none; reason: Historical synchronous-spawn timing observation. --> <!-- consolidation: unconfirmed; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Batching mechanism is a spike recommendation rather than approved input transport. -->
7. **Claude Code renders with ZERO color inside tmux** — 0 SGR sequences in 2,830 bytes.
   Almost certainly tmux's default `TERM=screen`. Likely fix is
   `set -g default-terminal "tmux-256color"`, **but this is UNVERIFIED.** <!-- consolidation: discard; ref: none; reason: Historical zero-color observation. --> <!-- consolidation: unconfirmed; ref: docs/adr/README.md#active-decisions; reason: TERM attribution and proposed color remedy were never verified. -->
8. **Render cost is the real scaling risk.** A 122×34 grid is ~7 KB of Ink output and ~2,400
   `<Text>` nodes per frame. One pane works; a multi-pane workspace needs cell-diffing or it
   re-emits the whole grid every tick — the exact class of bug already being fixed. <!-- consolidation: discard; ref: none; reason: Historical grid-size and render-cost measurements. --> <!-- consolidation: unconfirmed; ref: docs/adr/README.md#active-decisions; reason: Cell-diffing requirement is an unapproved scaling recommendation for the Ink proposal. -->
9. Non-TTY stdout: Ink renders but chalk strips all color, and React logs a spurious
   "two children with the same key" warning into the frame. <!-- consolidation: discard; ref: none; reason: Historical non-TTY rendering observation. -->
10. `resize-window` from the host works (confirmed 120×34 → 80×24) but was **not** wired to
    Ink's resize event. <!-- consolidation: discard; ref: none; reason: Historical resize proof and missing spike wiring. -->

---

## 8. Open questions — resolve before committing to the migration

### 8.1 Does `tmux-256color` restore Claude's colors? (highest value, ~2 minutes)

This decides whether claude can be supported in an Ink pane at all. Silent color loss is
indistinguishable from a broken pipeline, so it must be proven either way. <!-- consolidation: unconfirmed; ref: docs/adr/README.md#active-decisions; reason: Claude color viability question remains unanswered for the unapproved Ink proposal. -->

### 8.2 `nativeSessionId` capture is NOT verified end to end
<!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#starting-a-session; reason: Current real-provider identity capture acceptance is not established by this handoff. -->

This **gates the resume-based architecture**. If agents are killed with the TUI (which the
new design requires) and the session ID is wrong or missing, resume fails and you have lost
the user's agent conversation. Verify before relying on it. <!-- consolidation: discard; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Agents dying with TUI exit contradicts current client-detach lifetime contract. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Verify exact provider conversation identity and resume end to end before relying on it for conversation preservation. -->

Resume commands already exist in `src/agent-workspace/bootstrap.ts`: <!-- consolidation: discard; ref: none; reason: Historical resume command source locator. -->

| Preset | Resume invocation |
|---|---|
| opencode | `--session <id>` <!-- consolidation: discard; ref: none; reason: Historical provider CLI syntax inventory. --> |
| claude | `--resume <id>` <!-- consolidation: discard; ref: none; reason: Historical provider CLI syntax inventory. --> |
| codex | `resume <id>` <!-- consolidation: discard; ref: none; reason: Historical provider CLI syntax inventory. --> |
| gemini | `--resume <id>` <!-- consolidation: discard; ref: none; reason: Historical provider CLI syntax inventory. --> |
| antigravity | `--conversation <id>` <!-- consolidation: discard; ref: none; reason: Historical provider CLI syntax inventory. --> |

`buildAgentResumeCommand` also handles unknown IDs via `--continue`, `resume --last`, or
`--resume latest`. <!-- consolidation: discard; ref: docs/specs/sessions.md#stop-and-resume-a-session; reason: Unknown-ID latest-conversation fallback contradicts exact resume with explicit user choice on failure. -->

### 8.3 Exit semantics on explicit quit (blocks option A)

Does explicit quit **kill** the tmux session, or preserve it and return the terminal? The
user must decide. This is a product decision, not a technical one. <!-- consolidation: discard; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Exit policy is now settled as client detachment preserving running agents. -->

---

## 9. Uncommitted / pending work

| Item | Status |
|---|---|
| Ctrl+C narrow fix (option A) | Designed, **not implemented** — see §4.1 <!-- consolidation: discard; ref: none; reason: Historical implementation status. --> |
| `.agentic-workspace/` migration | **Never run.** The user has not done it. Roughly 30 live session dirs remain under `.git/backlog-workspace/`. Leave it to the user. <!-- consolidation: discard; ref: none; reason: Historical migration and live-directory count. --> <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Legacy live-state migration authorization and ownership remain unresolved. --> |
| `docs/pi-extensions/01-agent-yaml-error.md` | Untracked, ownership unknown, nothing in `src/` references it. Needs a decision. <!-- consolidation: discard; ref: none; reason: Historical untracked and unreferenced status. --> <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#general-principles; reason: Unknown file provenance requires disposition before removal or commitment. --> |
| `docs/BACK-728-handoff.md` (this file) | Untracked, not committed <!-- consolidation: discard; ref: none; reason: Historical document commit status. --> |
| Ink migration | Not started. Spike only. <!-- consolidation: discard; ref: none; reason: Historical rollout status. --> |

---

## 10. Scale of the option-B migration

Measured, so the estimate is grounded:

| Area | Files | Lines |
|---|---|---|
| `src/ui/` (all TUI) | 83 | 13,327 <!-- consolidation: discard; ref: none; reason: Historical migration-size inventory. --> |
| `src/ui/workspace/` | 20 | 2,326 <!-- consolidation: discard; ref: none; reason: Historical migration-size inventory. --> |
| `src/agent-workspace/` | 28 | 5,310 <!-- consolidation: discard; ref: none; reason: Historical migration-size inventory. --> |
| `src/agent-workspace/tmux/` | 8 | 1,380 <!-- consolidation: discard; ref: none; reason: Historical migration-size inventory. --> |
| Files importing blessed | 42 | 9,815 <!-- consolidation: discard; ref: none; reason: Historical migration-size inventory. --> |
| `tmux-workspace.ts` | 1 | 1,023 (only ~43 calls into the tmux layer) <!-- consolidation: discard; ref: none; reason: Historical migration-size inventory. --> |

Supporting facts:

- UI used `neo-neo-bblessed@1.0.10` at the time of this handoff (the legacy blessed TUI has since been removed). **Ink is not currently used.** <!-- consolidation: discard; ref: none; reason: Historical dependency and retirement inventory not technology approval. -->
- `react@19.2.7` + `react-dom` + `react-router-dom` are already dependencies (for the **web**
  UI). React is not a new paradigm here. <!-- consolidation: discard; ref: none; reason: Historical installed-dependency rationale. -->
- `node-pty` appears only in `trustedDependencies` — absent from dependencies, not installed.
  It loads under Bun but `spawn()` fails with `posix_spawnp failed` because the `spawn-helper`
  native binary is not built. **It fails identically under Node**, so this is node-pty's
  install, not a Bun limitation. Fixable, but adds native-build friction. <!-- consolidation: discard; ref: none; reason: Historical node-pty installation diagnosis and friction estimate. -->
- `@xterm/headless@5.5.0` **is already installed** in `node_modules`. <!-- consolidation: discard; ref: none; reason: Historical dependency inventory. -->
- tmux is **not** currently drawing the UI. `tmux-workspace.ts:637` respawns panes as the
  same binary running blessed via `workspace-ui`. <!-- consolidation: discard; ref: none; reason: Historical pane-rendering architecture observation. -->
- Agent output is scraped by `capture-pane` polling at `src/agent-workspace/tmux/pane.ts:187`. <!-- consolidation: discard; ref: docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport; reason: Historical polling implementation does not replace current live stream contract. -->
- Debug instrumentation already supports `AGENTIC_WORKSPACE_DEBUG=tmux,view,session,store`,
  `AGENTIC_WORKSPACE_DEBUG_FILE`, `AGENTIC_WORKSPACE_DEBUG_VERBOSE`; pane children receive these env vars. <!-- consolidation: discard; ref: none; reason: Historical debug instrumentation inventory. -->
- `Bun.file(p).text()` is safe against atomic-rename writes. `Bun.Glob` does **not** descend
  into dot-directories. <!-- consolidation: discard; ref: none; reason: External runtime API observations rather than durable requirements. -->
- tmux facts: `=title` cannot target `swap-pane` (use pane IDs); pane IDs are monotonic and
  not reused. <!-- consolidation: discard; ref: none; reason: External tmux targeting observations rather than permanent ownership evidence. -->

### Target architecture

```
agentic-workspace workspace
  └─ ONE Ink process — owns the terminal, alternateScreen, ctrl+c
       ├─ navbar / task list / details / footer   ← Yoga Flexbox, replaces 6 processes
       ├─ live agent output  ← pipe-pane → @xterm/headless → cell grid → Ink <Text>
       └─ (agents die with the TUI; resume from persisted nativeSessionId next launch)
  └─ private tmux session on a private socket — never attached, PTY + agents only
```
<!-- consolidation: unconfirmed; ref: docs/adr/README.md#active-decisions; reason: One Ink terminal owner and Yoga UI tree are unapproved technology proposals. -->
<!-- consolidation: unconfirmed; ref: docs/adr/README.md#active-decisions; reason: Pipe-pane through xterm into Ink cells is an unapproved rendering pipeline. -->
<!-- consolidation: discard; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Diagram agents-die-with-TUI lifetime contradicts current detach semantics. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport; reason: Proposed per-launch private tmux topology needs reconciliation with explicit shared backend ownership. -->

**Deletes:** the terminal-handover layer (~450 lines), six UI processes, cross-process state
races, the tmux key-table, and the `capture-pane` polling loop. **Agents already die on a
clean quit** via `quitWorkspace()` → `killPaneProcessTrees()` (descendants-first SIGTERM,
100 ms grace, then SIGKILL), so allowing them not to outlive the TUI costs nothing new. <!-- consolidation: discard; ref: none; reason: Historical estimated deletion scope and quit implementation evidence. --> <!-- consolidation: discard; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Existing kill-on-quit behavior cannot justify violating current agent lifetime guarantees. -->

---

## 11. Recommended next steps, in order

1. **Resolve §8.1** — confirm or refute `tmux-256color` fixing claude colors. Cheapest
   highest-information test available. <!-- consolidation: unconfirmed; ref: docs/adr/README.md#active-decisions; reason: Claude color viability probe remains proposal-specific unanswered work. -->
2. **Verify §8.2** — trace `nativeSessionId` capture for all five presets end to end. This
   gates the whole resume-based design. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Real-provider exact identity/resume verification completion remains unestablished. -->
3. **Decide A vs B** with the user, presenting §7 findings honestly. <!-- consolidation: unconfirmed; ref: docs/adr/README.md#active-decisions; reason: Historical architecture alternatives lack an approval record. -->
4. If **B**: scope a vertical slice — one Ink process, one private-socket tmux for agent PTYs,
   explicit shutdown, resume on relaunch. Reuse `/Users/imribarr/Projects/ink-pty-spike` as
   the starting skeleton. <!-- consolidation: unconfirmed; ref: docs/adr/README.md#active-decisions; reason: Ink vertical slice and spike reuse remain unapproved implementation proposals. -->
5. If **A**: resolve §8.3, implement the three changes in §4.1, rebuild, and **test the outer
   `agentic-workspace workspace` process** — not the inner `workspace-ui`. <!-- consolidation: discard; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Old exit policy choice superseded by detach-preserves-agent contract. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Verify rebuilt public outer entrypoint rather than an inner helper process. -->
6. Re-measure a clean test baseline (§5 numbers are from a dirty tree). <!-- consolidation: exists; ref: docs/CONVENTIONS.md#testing; reason: Re-measure rather than reuse historical baseline counts. -->
7. Decide what to do with `docs/pi-extensions/`. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#general-principles; reason: Unknown directory ownership and disposition remain open. -->
8. Run the `.agentic-workspace/` migration — but only with the user's explicit go-ahead. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Legacy live-data conversion remains authorization-gated and is not approved by this annotation. -->

---

## 12. Incidents during this work — read before trusting any agent report

### 12.1 A subagent left three processes spinning at 98–99% CPU for ~53 minutes

The Ink spike worker reported **"Zero stray processes."** That was false. Three
`bun run src/minimal.tsx` processes were orphaned (PPID=1) and burned ~3 cores on a 10-core
machine for over half an hour. Root cause: an Ink render loop that never exits after the
output capture completes. <!-- consolidation: discard; ref: none; reason: Historical runaway-process incident and root-cause report. -->

**Any subagent that launches a TUI or long-running process must clean it up and prove it.**
Verify independently; do not trust the report. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#testing; reason: Spawned processes require stop and awaited exit on every outcome. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Independently verify delegated long-running process cleanup claims. -->

### 12.2 The default tmux server died, cause unknown

The user's default socket had four live sessions early in this work:
`aoe_Serena_Pi_52aaad66`, `aoe_TMux_Lag_7b27db70`, `backlog-workspace-2e166c0806fa`,
`backlog-workspace-88f5d4c122ec`. <!-- consolidation: discard; ref: none; reason: Historical user-session inventory. -->

All four were gone before any cleanup was performed. **Nothing in this session's cleanup
killed it** — the only tmux server terminated was PID 2853, this project's own A/B
experiment lab (session `driver`, cwd `/private/tmp/backlog-ab-lab/repo`), killed **by PID**,
never with `kill-server`. <!-- consolidation: discard; ref: none; reason: Historical session-loss and cleanup-accounting evidence. -->

**The cause was never established.** Prime suspect is the test suite, which creates sockets
aggressively (`backlog-test-*`, `backlog-integration-*`, `backlog-workspace-*`) and for which
the `tmux-test-server.ts` guard exists precisely because a bare `kill-server` reaches the
default socket. **This is worth auditing** — it is a live risk to the user's sessions. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#testing; reason: Default-server death cause and isolation audit completion were never established. -->

### 12.3 Cleanup that was performed

Killed: 3 runaway `minimal.tsx` loops; orphan tmux server PID 2853 (by PID); 5
`dist/agentic-workspace workspace-ui` panes; 4 `sleep` processes; 17 stale tmux socket files (each
truth-tested by exit code first). Verified zero remaining tmux servers, sockets, or orphans.
All three live `pi` agent sessions survived. <!-- consolidation: discard; ref: none; reason: Historical cleanup counts and survival evidence. -->

---

## 13. Style / engineering constraints

- Use `Object.assign`, not spread, to inject dependencies into class instances. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#code-structure; reason: Preserve class instance identity/prototype when injecting dependencies with Object.assign. -->
- Avoid god functions, meaningless names, mutation inside reads, duplicated idioms, and
  per-call symptom patches. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#code-structure; reason: Meaningful names and cohesive functions must avoid per-call symptom patches. --> <!-- consolidation: exists; ref: docs/BLUEPRINT.md#application-controller-and-stores; reason: Reads have no mutating lifecycle effects. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#general-principles; reason: Avoid duplicated behavior. -->
- Every changed line must trace directly to the request. No drive-by cleanup or refactoring. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#general-principles; reason: Avoid unrelated cleanup. -->
- Keep it simple — no speculative abstractions, configurability, or future-proofing. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#general-principles; reason: Avoid speculative abstractions. -->
- Comments explain non-obvious reasons, not obvious code. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#code-structure; reason: Comments should explain non-obvious rationale rather than restate code. -->
- Workers verify their own work and return **conclusions and evidence, not exploration
  transcripts**. <!-- consolidation: discard; ref: none; reason: Agent delegation reporting procedure rather than durable core contract. -->
- Never report success without checking the result. Never weaken tests to make them pass.
  Fix causes, not symptoms. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#testing; reason: Success claims require appropriate verification evidence. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#testing; reason: Never weaken tests to conceal failures instead of correcting their causes. -->
