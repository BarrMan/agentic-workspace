---
consolidation:
  total: 312
  counts:
    exists: 8
    discard: 249
    integrate: 4
    unconfirmed: 51
  percentages:
    exists: 2.56%
    discard: 79.81%
    integrate: 1.28%
    unconfirmed: 16.35%
---
# Agent of Empires — Reference Architecture for `agentic-workspace workspace`
> **Non-authoritative supporting material.** This file is not a contract. Authoritative owner(s): [SPEC](SPEC.md), [BLUEPRINT](BLUEPRINT.md), [workspace screen](screens/workspace.md).
> Disposition: Historical — discard.

**Status:** reference notes. Specifies **no** AgenticWorkspace change and authorises **no** implementation. <!-- consolidation: unconfirmed; ref: none; reason: Reference evidence does not authorize behavior changes. -->

**Source:** `agent-of-empires/agent-of-empires`, default branch `main`. Investigated 2026-10-04. <!-- consolidation: discard; ref: none; reason: External investigation provenance belongs in this reference. -->
**Purpose:** record how a shipped product solves the same two problems BACK-728 has — a multi-agent
terminal workspace that feels smooth, and a UI that always exits. Cited as `file:line` throughout so
any claim can be re-checked against upstream.

Every statement below is one of three kinds, marked inline:

- **[code]** — what the source demonstrably does.
- **[comment]** — what a doc comment or docs-site page claims. May be stale.
- **[inference]** — our reading, not stated upstream.

### Correction: Ink `exitOnCtrlC`

An earlier draft of this project's handoff, and the `ink-pty-spike` README caveat 1, both state
that "Ink 6 `exitOnCtrlC` defaults to FALSE — proved by experiment." **That is wrong.** <!-- consolidation: discard; ref: none; reason: Historical Ink spike correction is reference evidence. -->

Verified in the installed `ink@6.8.0`:

- `node_modules/ink/build/render.js:14` — `exitOnCtrlC: true` in the defaults object. This is the
  only defaulting layer; `options.js` is empty. <!-- consolidation: discard; ref: none; reason: Version-specific Ink defaulting implementation evidence. -->
- `node_modules/ink/build/hooks/use-input.js:110` — `useInput` filters Ctrl+C out of handlers when
  the flag is true. <!-- consolidation: discard; ref: none; reason: External Ink hook filtering implementation detail. -->
- `node_modules/ink/build/components/App.js:71` — a raw-byte check (`input === '\x03'`) that calls
  `handleExit()`. <!-- consolidation: discard; ref: none; reason: External Ink raw-byte exit implementation detail. -->

So Ctrl+C *does* reach Ink. The actual failure mode is that `handleExit` unmounts the reconciler
and writes a final frame, but **unmount does not end the process** — a surviving timer, worker, or <!-- consolidation: discard; ref: none; reason: Ink unmount and event-loop behavior is historical diagnostic evidence. -->
open socket keeps the event loop alive and the terminal held. That is BACK-728's symptom ("all
panes dead, program alive"), and it needs a different fix than the spike's caveat implies: the
handler must call `process.exit` explicitly rather than merely unmounting. <!-- consolidation: unconfirmed; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Historical symptom attribution and mandatory process.exit remedy are not established by the approved exit behavior. -->

Bearing on §5 below: that section works because the TUI owns the terminal. An Ink port needs an
explicit process-exit step on top of it, which §5 alone does not describe. <!-- consolidation: discard; ref: none; reason: Conditional Ink-port advice for an obsolete spike is not a current implementation requirement. -->

---

## 0. Why this document exists

`agentic-workspace workspace` currently uses **tmux as its UI substrate**: the outer process hands the terminal
to tmux via inherited stdio and tmux draws everything. That single choice produces both reported bugs. <!-- consolidation: discard; ref: none; reason: Historical tmux UI implementation snapshot. --> <!-- consolidation: unconfirmed; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Attributing both bugs solely to UI substrate is an unverified causal inference. -->

| Symptom | Measured / observed |
|---|---|
| Ctrl+C and `q` do not exit; panes go dead, process stays alive holding the terminal | `quitWorkspace()` kills pane trees then `detach()`s, deliberately keeping the session (`src/agent-workspace/tmux-workspace.ts:969-978`) <!-- consolidation: discard; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Historical failure evidence is not target behavior and exit must preserve agents. --> |
| Laggy | ~240 tmux subprocess calls and ~1,836 ms of serialized tmux wait per 30 s **idle** <!-- consolidation: discard; ref: none; reason: Historical measured baseline is not a durable performance requirement. --> |

AoE is a working counter-example. The sections below isolate the mechanisms worth understanding before
any design decision gets made. **[inference]** The lag and the exit bug share one root cause: making
tmux the UI substrate rather than a backend. <!-- consolidation: unconfirmed; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: External counterexample does not prove a shared root cause for both local bugs. -->

---

## 1. The core architectural decision

**AoE never uses tmux as a UI.** tmux is a backend PTY container that keeps each agent process alive
across TUI close, SSH drop, and terminal crash. The UI is a native Rust TUI that owns the terminal
and drives agents out-of-band. **[code]** <!-- consolidation: discard; ref: docs/BLUEPRINT.md#component-ownership; reason: AoE Rust UI and tmux container architecture is external evidence rather than stack approval. --> <!-- consolidation: exists; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Agent survival across client close and crash is independently required. --> <!-- consolidation: discard; ref: none; reason: External SSH-drop survival is not a separately specified local remote-client guarantee. -->

```
your terminal  →  AoE's own TUI (Ratatui + crossterm, owns the terminal)
                      ↓ forwards keystrokes
                  tmux session per agent (hidden; agent lives here)
                      ↓ streams output back
                  AoE's own TUI (shows preview, status, list)
```
<!-- consolidation: discard; ref: none; reason: Diagram illustrates one external terminal input/output topology rather than an approved local interface. -->

Entry: `src/main.rs:371` → `tui::run` (`src/tui/mod.rs:223`) when `aoe` runs with no subcommand. <!-- consolidation: discard; ref: none; reason: AoE entry-point source navigation. -->
Terminal ownership is RAII via `TerminalGuard` (`src/tui/mod.rs:142`), entered at `mod.rs:311`,
restored in `Drop` (`mod.rs:183-208`). **[code]** <!-- consolidation: discard; ref: none; reason: Rust RAII terminal guard is external implementation evidence. -->

**Every tmux fork happens on a named background thread, never on the paint path** — `aoe-display-snapshot`
(`mod.rs:1991`), `aoe-status-poller` (`src/tui/status_poller.rs:314`). **[code]** <!-- consolidation: discard; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Named background-thread placement is AoE implementation detail beyond the renderer boundary. -->

### 1.1 Terminal setup

All in `TerminalGuard::enter` (`src/tui/mod.rs:140-203`). **[code]**

| Feature | Where |
|---|---|
| Raw mode | `mod.rs:151`, undone `:189` <!-- consolidation: discard; ref: none; reason: External raw-mode setup and teardown. --> |
| Alternate screen (`?1049h`) | `mod.rs:153`; left at `:195`, `:429` <!-- consolidation: discard; ref: none; reason: External alternate-screen setup and teardown. --> |
| Bracketed paste | `mod.rs:153`; disabled `:196`, `:431` <!-- consolidation: discard; ref: none; reason: External bracketed-paste setup and teardown. --> |
| Mouse capture | conditional, `mod.rs:158`; forced off under Mosh (`mod.rs:300-301`) <!-- consolidation: discard; ref: none; reason: External Mosh-specific mouse policy is not approved locally. --> |
| Kitty `DISAMBIGUATE_ESCAPE_CODES` | best-effort, `mod.rs:168-171` — no support probe, because a probe "can stall startup for 2s" **[comment]** <!-- consolidation: discard; ref: none; reason: External Kitty flag and probe tradeoff is reference evidence. --> |

`Drop` order is deliberate: pop kitty flags first ("so the shell never inherits it"), then raw mode,
then mouse, then alt-screen + bracketed-paste + cursor-show. **[code]** <!-- consolidation: discard; ref: none; reason: AoE terminal restoration order is not a local execution-safety gate. -->

`stdin` must be a TTY or AoE bails (`mod.rs:290-293`) — "Without a tty the event loop would busy-loop
after the parent terminal dies." **[comment]** <!-- consolidation: discard; ref: none; reason: External TTY precondition and busy-loop rationale. -->

`with_raw_mode_disabled` (`src/tui/app.rs:413-460`) reverses all of it so `tmux attach` or `$EDITOR`
sees a clean tty, then restores and **recreates the crossterm `EventStream`** (`app.rs:433`, `:466`).
The field is `Option` specifically for this ("its stdin reader thread would compete with `tmux attach`",
`app.rs:117-119`). **[code]** <!-- consolidation: discard; ref: none; reason: External child-terminal handoff and EventStream recreation mechanism. -->

---

## 2. Idle cost: how AoE reaches ~zero tmux calls

### 2.1 Two server-wide snapshots, one fork each

| Snapshot | Refresh function | What one call covers |
|---|---|---|
| `SESSION_CACHE` (`src/tmux/mod.rs:243`) | `session_scan_command()` (`mod.rs:448`) | chains `show-options -gqv` ×3 + one `list-sessions -F` → **all** sessions <!-- consolidation: discard; ref: none; reason: External session snapshot batching implementation. --> |
| `PANE_META_CACHE` (`mod.rs:276`) | `batch_pane_metadata()` (`mod.rs:1034`) | one `list-panes -a -F`, 10 fields → **every** session's pane <!-- consolidation: discard; ref: none; reason: External pane metadata batching implementation. --> |

- TTL 2 s; refresh-due at half-life, `snapshot_refresh_due` (`mod.rs:1711`) = `CACHE_TTL / 2`. <!-- consolidation: discard; ref: docs/specs/sessions.md#sessions; reason: External cache cadence is not the approved 30-second workspace observation contract. -->
- `PaneMetadata` (`mod.rs:214-227`) carries `pane_dead`, `pane_pid`, `pane_title` (OSC 0/2, "which
  several agents use for their state"), and `window_activity` — "The window's last-output time, used
  to skip unchanged captures." **[code]** <!-- consolidation: discard; ref: none; reason: External metadata schema and capture optimization. -->
- **`Err` from `batch_pane_metadata` means "don't know", never "absent"** (`mod.rs:1032-1033`). **[comment]** <!-- consolidation: exists; ref: docs/architecture/session-harness.md#runningexecution; reason: Failed runtime probes remain uncertainty rather than evidence of absence. -->
- Concurrency: monotonic `next_refresh_id` (`mod.rs:403`); `publish_session_cache` (`mod.rs:407`)
  drops results with `refresh_id <= cache.refresh_id`; an unexpected failure keeps the last good <!-- consolidation: discard; ref: none; reason: External monotonic refresh publication algorithm. -->
  list (`mod.rs:422`). **[code]** <!-- consolidation: discard; ref: none; reason: External last-good cache retention policy. -->
- **Stale reads return `None`, never a false answer** — `session_exists_from_cache` (`mod.rs:1567`),
  `pane_dead_from_cache` (`mod.rs:1663`). **[code]** <!-- consolidation: discard; ref: docs/specs/sessions.md#sessions; reason: External stale-cache None representation is more specific than approved runtime uncertainty. -->

### 2.2 The render path never forks

`session_exists_for_display` (`mod.rs:1648`) is documented "Render-path liveness from the snapshot
only, never forking." Same for `pane_dead_for_display` (`mod.rs:1658`). Live `has-session` is a
fallback for cache misses only (`mod.rs:1634-1640`). **[code]** <!-- consolidation: discard; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: External snapshot-only display accessors are implementation evidence. --> <!-- consolidation: discard; ref: none; reason: External cache-miss live has-session fallback. -->

### 2.3 Status detection is rule-ranked and activity-gated

`src/tmux/status_detection.rs` is **pure parsing** — it contains no `tmux_command` and no
`capture_pane`. **[code]** Order: configured `status_rules` → agent manifest (13 embedded at <!-- consolidation: discard; ref: none; reason: External pure-parser separation is reference implementation evidence. -->
`src/tmux/detect/mod.rs:18-32`) → legacy detector. **[code]** <!-- consolidation: discard; ref: docs/architecture/session-harness.md#harness; reason: AoE rule precedence and manifest catalogue do not approve local provider detection policy. -->

`skip_capture` (`src/session/instance/status_update.rs:7`) refuses a capture when `window_activity`
is unchanged AND a prior capture exists past that second AND no hook fired AND nothing is pending. **[code]** <!-- consolidation: discard; ref: none; reason: External activity-gated capture predicate. -->

> "A capture inside or before the activity second proves nothing." — test comment citing issue #3624
> (`status_update.rs:492-510`). **[comment]** <!-- consolidation: discard; ref: none; reason: External capture timestamp test rationale. -->

An idle agent therefore performs **zero** tmux calls for status. The skip decision is free because
`activity` came from the bulk `list-panes -a` snapshot (`status_update.rs:390-395`). **[code]** <!-- consolidation: discard; ref: none; reason: External idle-status fork-cost finding is not a local performance guarantee. -->

Hook state is read from the filesystem, no fork (`read_hook_status`, `status_update.rs:274-277`). <!-- consolidation: discard; ref: none; reason: External hook observation transport. -->
**Correction (2026-10-07, pinned `0a17c859`)** — the earlier wording ("a fresh hook short-circuits
everything") is wrong for manifest-backed agents. A hook write is one observation among many and
enters the same priority-ranked rule engine as pane and title evidence: configured `status_rules`
are evaluated first, then manifest rules in descending priority, where the shared hook rules carry
`hook_running_fresh` 600 (max age 30 s), `hook_running_standing` 400 (max age 900 s), `hook_idle`
300, `hook_error` 300 and `hook_waiting` 240 (`manifest.rs:371-451`, `status_update.rs:286-330`). <!-- consolidation: discard; ref: docs/architecture/session-harness.md#harness; reason: Corrected AoE hook and manifest precedence is external detection policy. --> <!-- consolidation: discard; ref: none; reason: External fresh-running hook priority 600 and thirty-second age limit. --> <!-- consolidation: discard; ref: none; reason: External standing-running hook priority 400 and 900-second age limit. --> <!-- consolidation: discard; ref: none; reason: External idle-hook priority 300. --> <!-- consolidation: discard; ref: none; reason: External error-hook priority 300. --> <!-- consolidation: discard; ref: none; reason: External waiting-hook priority 240. -->
A higher-priority screen or title rule can therefore outrank a fresh hook, and a hook write older
than its `max_age_secs` is not evidence at all. The 900 s stale-`Running` fallback belongs to the <!-- consolidation: discard; ref: none; reason: External screen/title priority over fresh hooks. --> <!-- consolidation: discard; ref: none; reason: External max-age expiration of hook evidence. -->
**legacy manifest-less** branch, which otherwise applies the hook directly
(`status_update.rs:22-24,302-330`). Dead pane + hook present ⇒ `Error`, because "a dead pane <!-- consolidation: discard; ref: none; reason: External legacy manifest-less hook fallback is not a local compatibility requirement. -->
outranks every other signal, and only for a session that reported hooks at all"
(`status_update.rs:280-284`). **[code]** <!-- consolidation: discard; ref: docs/specs/sessions.md#sessions; reason: AoE dead-pane Error classification is not the approved observed-state model. -->

Extra debounce: `Error` re-latches at most every 30 s; within 3 s of start reports `Starting` without <!-- consolidation: discard; ref: none; reason: External error debounce duration. -->
probing (`status_update.rs:157-171`). **[code]** <!-- consolidation: discard; ref: docs/architecture/session-harness.md#readiness-and-identity-correlation; reason: External time-based Starting shortcut cannot establish approved provider readiness. -->

### 2.4 tmux options are leases, never status storage

The only options AoE writes are cross-process ownership leases: `@aoe_size_owner`,
`@aoe_size_owner_hb`, `@aoe_vt_owner`, `@aoe_vt_owner_hb`, `@aoe_vt_pipe_owner`
(`src/tmux/session.rs:47-58`). Status is derived in-process from captured bytes. **[code]** <!-- consolidation: discard; ref: none; reason: External tmux lease option inventory. --> <!-- consolidation: discard; ref: docs/architecture/session-harness.md#harness; reason: Capture-derived status is an external observation mechanism rather than a required Harness strategy. -->

---

## 3. Rendering: 33 ms tick, zero draws when idle

### 3.1 The loop

`App::run` (`src/tui/app.rs:617`), first paint before the loop (`app.rs:534-535`), break at `:1374`.
One `tokio::select!` with seven arms (`app.rs:1100-1152`). **[code]** <!-- consolidation: discard; ref: none; reason: External first-paint and select-loop implementation. -->

```rust
// 33ms (~30fps): 16ms tore on terminals without synchronized update.
let mut refresh_interval = tokio::time::interval(Duration::from_millis(33));
refresh_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
```
(`app.rs:573-575`) **[code]** <!-- consolidation: discard; ref: none; reason: External 33 ms refresh timer example and tearing rationale. -->

**The "~20Hz" comment at `app.rs:24` is stale.** The interval is 33 ms. **[code]** <!-- consolidation: discard; ref: none; reason: External comment correction is historical reference evidence. -->

Periodic work is *not* separate timers — it is `Instant::elapsed()` checks inside the post-select
block: status 500 ms, session feed 1 s, disk 5 s, metrics 1 s, spinner 120 ms, heartbeat 10 s,
presence 3 s, idle reap 60 s (`app.rs:592-603`). **[code]** <!-- consolidation: discard; ref: none; reason: External elapsed-check scheduling mechanism. --> <!-- consolidation: discard; ref: docs/specs/sessions.md#sessions; reason: External 500 ms status cadence is not local 30-second observation approval. --> <!-- consolidation: discard; ref: none; reason: External one-second session-feed cadence. --> <!-- consolidation: discard; ref: none; reason: External five-second disk cadence. --> <!-- consolidation: discard; ref: none; reason: External one-second metrics cadence. --> <!-- consolidation: discard; ref: none; reason: External 120 ms spinner cadence. --> <!-- consolidation: discard; ref: none; reason: External ten-second heartbeat cadence. --> <!-- consolidation: discard; ref: none; reason: External three-second presence cadence. --> <!-- consolidation: discard; ref: docs/specs/sessions.md#enforce-the-running-session-soft-limit; reason: External sixty-second idle reaping is not the approved evidence-based soft-limit policy. -->

### 3.2 Two gates, and idle means no draw at all

**Gate A — `needs_redraw`**: full clear + repaint. Cleared at the top of each iteration
(`app.rs:618-621`). Set only for theme, resize, banner change, post-attach settle, post-editor.
**Deliberately not used for content changes** — "a clear per tick strobes" (`app.rs:1172-1173`),
"No `needs_redraw`: its full clear flashes the screen" (`app.rs:2049`, `:2283`). **[code]** <!-- consolidation: discard; ref: none; reason: External full-clear invalidation gate and anti-flashing rationale. -->

**Gate B — `refresh_needed`**: whether to draw at all (`app.rs:1352-1366`). **[code]** <!-- consolidation: discard; ref: none; reason: External draw-needed gate. -->

```rust
let live = self.home.live_send.is_some();
refresh_needed |= full || live || woke_via_post_key || woke_via_preview;

let in_cooldown = last_refresh_at.is_some_and(|t| t.elapsed() < REFRESH_COOLDOWN);
if live && in_cooldown && !full && !woke_via_post_key && !woke_via_preview {
    refresh_needed = false;
}
if refresh_needed {
    self.draw(terminal)?;
    last_refresh_at = Some(std::time::Instant::now());
}
```
<!-- consolidation: discard; ref: none; reason: Coherent external refresh gate and cooldown code example. -->

Idle with nothing changed → `refresh_needed` stays false → **no draw call**. The 33 ms tick still
fires and runs every `elapsed()` check; it just paints nothing. <!-- consolidation: discard; ref: none; reason: External idle rendering cost finding does not establish a local draw-frequency requirement. -->

`clear_terminal` (`src/tui/mod.rs:207-213`) bypasses ratatui's `Terminal::clear` because its
cursor-position query "races the live `EventStream` and fails." **[comment]** <!-- consolidation: discard; ref: none; reason: External Ratatui cursor-query workaround. -->

### 3.3 Diffing is stock ratatui

`Terminal::draw` → `Buffer::diff`. The only backend is a thin wrapper (`src/tui/hyperlink.rs:114-163`)
that splits changed cells into runs by hyperlink target — for OSC 8 boundaries, not byte minimisation. <!-- consolidation: discard; ref: none; reason: External stock diff and hyperlink backend mechanism. -->
**No hand-rolled cell-diff or RLE encoder exists.** The single `CellDiffOption::AlwaysUpdate` in `src/`
(`home/render.rs:3243`) *forces* re-emission of hyperlink cells whose URI lives outside the Buffer. **[code]** <!-- consolidation: discard; ref: none; reason: External absence of custom diff/RLE implementation. --> <!-- consolidation: discard; ref: none; reason: External hyperlink AlwaysUpdate exception. -->

**Bearing on our Ink spike:** ratatui avoids re-*serialising* unchanged text but still rebuilds the
buffer each frame. It does not solve our ~2,400 `<Text>`-nodes-per-frame cost. **[inference]** <!-- consolidation: discard; ref: none; reason: Historical Ink versus Ratatui rendering-cost comparison. -->

### 3.4 Synchronized update

`draw` (`app.rs:379-408`) queues `BeginSynchronizedUpdate`, builds and draws inside the bracket, then
`execute!`s `EndSynchronizedUpdate`. The opener is queued but never flushed early — "flushing the
opener alone would put the widget build inside the bracket and freeze the display for that time." **[code]** <!-- consolidation: discard; ref: none; reason: External synchronized-update flush ordering. -->

---

## 4. Input: one queue, two modes

AoE has no "scrolling feature." There is one function that maps a key to **send it to the agent** or
**handle it locally**. Everything in §4 follows from that. **[inference]** <!-- consolidation: discard; ref: none; reason: External input-routing characterization is not local scrolling approval. -->

### 4.1 Mode 1 — Tab live-send: per-keystroke

`Tab` on a runnable session installs `LiveSendState`. Module header (`src/tui/home/live_send.rs:1-8`):
every key is routed through a translator producing a `TmuxAction`. **[code]** <!-- consolidation: discard; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: External Tab live-send binding differs from approved local mode cycling. -->

`HomeView::handle_key` (`home/input.rs:1719-1738`) intercepts **before every other handler**:
"Live-send capture normally wins over every other key handler: the home view is a thin relay to the
target pane." **[comment]** <!-- consolidation: discard; ref: none; reason: External live-send interception precedence. -->

Routing: key → `live_send::translate` (`input.rs:6034`) → `LiveDispatch::Send(tmux_key)` →
`worker.send(tmux_key)` (`input.rs:6037-6039`). **[code]** <!-- consolidation: discard; ref: none; reason: External translator-to-worker call sequence. -->

### 4.2 Mode 2 — dashboard message: one atomic prompt

A `SendMessageDialog` collects a whole message, then delivers it via `src/tui/home/send.rs`. **[code]** <!-- consolidation: discard; ref: none; reason: External dashboard composer feature is not local UI approval. -->
No live-send state is installed, no per-keystroke forwarding, the UI stays in dashboard mode. **[code]** <!-- consolidation: discard; ref: none; reason: External composer focus and delivery mode. -->
**No debounce, rate-limit, or coalescing exists on this path**; the only sleep is a per-tool
`enter_delay_ms`. **[code]** Failure sets `InfoDialog::new("Send Failed", ...)` and returns — no retry, <!-- consolidation: discard; ref: none; reason: External composer pacing and absence of coalescing. -->
no queue. **[code]** <!-- consolidation: discard; ref: docs/architecture/session-harness.md#session; reason: External send-error dialog and retry policy exceed the approved input-delivery failure contract. -->

**Both modes push bytes into the same tmux session. The agent cannot tell them apart.** **[inference]** <!-- consolidation: discard; ref: none; reason: External input-path equivalence inference is reference material. -->

### 4.3 The worker never blocks the UI

`LiveSendWorker::send` (`live_send.rs:562-566`) — **[code]**:

```rust
/// Enqueue a translated key. Returns immediately: the fork happens on the worker
/// thread, so the UI never blocks on tmux latency.
pub(super) fn send(&self, key: TmuxKey) {
    let _ = self.tx.send(WorkerMsg::Send(key));
}
```
<!-- consolidation: discard; ref: none; reason: Coherent external nonblocking enqueue code example. -->

Worker thread (`live_send.rs:404-470`): `recv_timeout` → drain with `try_recv` into one batch →
`coalesce` → `dispatch_batch` → `dispatch_via_fork`. **[code]** <!-- consolidation: discard; ref: none; reason: External worker batching pipeline. -->

`coalesce` (`live_send.rs:310-358`) merges consecutive `Send(Literal)` into one `send-keys -l` and
consecutive `Send(HexBytes)` into one `send-keys -H`. Test at `:2898` asserts typing "hello" is **one**
tmux call, not five. **[code]** <!-- consolidation: discard; ref: none; reason: External consecutive literal coalescing into send-keys -l. --> <!-- consolidation: discard; ref: none; reason: External consecutive hex-byte coalescing into send-keys -H. --> <!-- consolidation: discard; ref: none; reason: External hello batching test finding. -->

`dispatch_via_fork` (`live_send.rs:2026-2133`) targets `format!("{}:^.0", tmux_name)` (`:2072`). **[code]** <!-- consolidation: discard; ref: none; reason: External tmux target-address syntax. -->

### 4.4 Zero-fork input fast path

While a VT channel is armed, input goes back over the **same unix socket** —
`crate::tmux::vt::input_mode(...)` then `try_send_input` (`live_send.rs:2037-2068`). Fallback is a
fork. **[code]** <!-- consolidation: discard; ref: none; reason: External same-socket input fast path and fork fallback. -->

Single-writer invariant (`live_send.rs:6-11`): "a live input channel is a single-writer signal: two
writers would interleave on one pty input stream, so nothing goes through `send-keys` while it
exists." **[comment]** <!-- consolidation: discard; ref: docs/architecture/session-harness.md#runningexecution; reason: External channel-exclusive send-keys prohibition is stricter than the local single terminal-writer boundary. -->

### 4.5 `tmux -C` was tried and rejected

`live_send.rs:18-19` — **[comment]**:

> "A long-lived `tmux -C` connection was tried (#1485) and EOF'd within milliseconds on macOS tmux
> 3.x, so one fork per coalesced batch is the portable model; held keys and pastes coalesce into one fork." <!-- consolidation: discard; ref: none; reason: External historical control-mode failure and chosen workaround are not local technology approval. -->

**[inference]** This is the single most decision-relevant finding in the document: a persistent control
connection is not a safe default, because the most common dev platform breaks it. <!-- consolidation: unconfirmed; ref: docs/adr/README.md#active-decisions; reason: General rejection of persistent control mode requires local applicability evidence and approval. -->

### 4.6 Paste bursts

`PASTE_BURST_INTER_KEY_MS = 5`, `PASTE_BURST_MIN_LEN = 3` (`src/tui/app.rs:30-35`). Purpose: Mosh
strips bracketed-paste markers, so a paste arrives as a tight key stream that would fire AoE shortcuts
one at a time. **[code]** <!-- consolidation: discard; ref: none; reason: External Mosh paste-burst thresholds and shortcut rationale. -->

Gated by `wants_paste_burst` (`home/overlays.rs:161-170`) so only surfaces that consume a synthesized
paste are eligible. **[code]** Algorithm: <!-- consolidation: discard; ref: none; reason: External paste-capable surface eligibility gate. -->

1. Reject `KeyEventKind::Release` — "Terminals reporting releases would double-fire every handler" (`app.rs:633-635`). <!-- consolidation: discard; ref: none; reason: External release-event filter. -->
2. Seed the burst, then collect with a **per-key 5 ms** timeout, re-polling the *same* `EventStream` so no event is lost. <!-- consolidation: discard; ref: none; reason: External timed burst collection. -->
3. Classify: ≥3 keys and not all-identical (`is_auto_repeat_burst`, `app.rs:228-238`). <!-- consolidation: discard; ref: none; reason: External paste versus repeat classifier. -->
4. Paste branch: `split_trailing_enter` (`app.rs:239-253`) peels only the **last** Enter and replays it
   through ordinary `handle_key` so it submits; interior newlines stay literal. <!-- consolidation: discard; ref: none; reason: External trailing-Enter paste submission policy. -->
5. Short or auto-repeat: replay each key individually so held `j`/`k` still scroll. <!-- consolidation: discard; ref: none; reason: External short-burst and held-key replay. -->
6. Dispatch the deferred non-key event **after** the burst, then **one** draw for the whole burst. <!-- consolidation: discard; ref: none; reason: External deferred event ordering and single burst paint. -->

Multi-line pastes to an agent use `load-buffer` + `paste-buffer -p` (`home/input.rs:113-166`) — emitting
newlines directly "delivered them to every pane, including raw shells and REPLs that never set DECSET
2004." **[comment]** <!-- consolidation: discard; ref: none; reason: External paste-buffer mechanism and newline delivery rationale. -->

### 4.7 Scrolling is not a feature

Full table, all **[code]**:

| Input | Fate |
|---|---|
| printable / arrows / Home / End / Enter / Esc | forwarded to agent (`live_send.rs:2544-2560`) <!-- consolidation: discard; ref: none; reason: External live-send key translation table. --> |
| `Shift+PageUp` / `Shift+PageDown` | **local**, `preview_scroll_offset ± 10`, `saturating_sub` down (`input.rs:5991-6009`) <!-- consolidation: discard; ref: none; reason: External custom ten-line history shortcut is not local approval. --> |
| bare `PageUp` / `PageDown` | **forwarded** as `PPage` / `NPage` (`live_send.rs:2557-2558`) <!-- consolidation: discard; ref: none; reason: External bare paging translation. --> |
| `Alt+<hotkey>` | exits live-send, jumps list (`input.rs:1729-1732`) <!-- consolidation: discard; ref: none; reason: External agent-jump shortcut. --> |
| `Ctrl+C` | **forwarded to agent** (`input.rs:6028-6045`) <!-- consolidation: discard; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Approved local Ctrl+C leaves input without forwarding an interrupt. --> |
| wheel, alt-screen pane, mouse on | raw mouse bytes to pane; local offset reset to 0 <!-- consolidation: discard; ref: none; reason: External mouse-enabled alternate-screen routing. --> |
| wheel, alt-screen pane, mouse off | `PageUp`/`PageDown` to pane; offset reset to 0 <!-- consolidation: discard; ref: none; reason: External mouse-disabled paging fallback is not local approval. --> |
| wheel, normal-buffer pane | **local** `preview_scroll_offset += 3`, clamped (`input.rs:4541-4550`) <!-- consolidation: discard; ref: none; reason: External three-line normal-buffer wheel behavior. --> |
| wheel outside preview rect, live-send | ignored (`input.rs:4482-4485`) <!-- consolidation: discard; ref: none; reason: External preview-rectangle wheel filter. --> |
| wheel over list, live-send | suppressed (`input.rs:4486-4490`) <!-- consolidation: discard; ref: none; reason: External live-send list-wheel suppression. --> |

`preview_scroll_offset` is a **pure view offset** into already-captured text. No tmux subprocess, no
copy-mode, no `send -X` — anywhere in the path. Local scrolling never mutates the agent. **[code]** <!-- consolidation: discard; ref: none; reason: External pure view-offset scrolling mechanism. -->

> "the alternate screen has no scrollback, so the capture-window scroll is inert there and forwarding
> is the only way to reach the agent's history" (`input.rs:4292-4295`). **[comment]** <!-- consolidation: discard; ref: none; reason: External alternate-screen history rationale. -->

Bare PageUp is forwarded on purpose, so agents with their own paging UI keep working. Only `Shift+` is
stolen for local scroll — matching normal terminal-emulator convention. **[inference]** <!-- consolidation: discard; ref: none; reason: External paging-key design rationale. -->

**Guard worth stealing:** list scrolling is suppressed during live-send, because "changing the
selection mid-live-send would silently aim the next keystroke at another pane" (`input.rs:4486-4490`). **[comment]** <!-- consolidation: unconfirmed; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Explicit input targeting is required but adopting this specific list-scroll suppression guard has no approval. -->

### 4.8 The exec layer

Single construction point `tmux_command()` (`src/tmux/mod.rs:160`). **[code]** <!-- consolidation: discard; ref: none; reason: External command-construction helper. -->

- `Command::new("tmux")` + `-S <path>` or `-L <name>` (`mod.rs:164-171`). <!-- consolidation: discard; ref: none; reason: External tmux process construction syntax. -->
- `crate::process::reset_signals_on_exec(&mut cmd)` (`mod.rs:175`) via `pre_exec`
  (`src/process/mod.rs:212`). Comment (`mod.rs:172-174`): "Attach runs while aoe ignores
  SIGINT/SIGQUIT, and `SIG_IGN` survives exec; restore defaults so Ctrl+C still works in a hung tmux
  child." **[comment]** <!-- consolidation: discard; ref: none; reason: External signal-reset mechanism for its child handoff is reference evidence rather than a local safety gate. -->
- `tmux_query_command()` (`mod.rs:183`) adds `-u`, `env_remove("LC_ALL")`, `LC_MESSAGES=C`; test
  `tmux_query_command_preserves_ctype_for_session_names` (`mod.rs:2863`). <!-- consolidation: discard; ref: none; reason: External locale handling and test inventory. -->
- Timeout: `TMUX_COMMAND_TIMEOUT = 10 s` (`mod.rs:287`), one wall-clock budget shared across every
  subprocess in one logical operation (`mod.rs:289`). <!-- consolidation: discard; ref: none; reason: External shared ten-second operation deadline. -->
- Output to **tempfiles, not pipes** — "so a full pipe or a descendant holding the handles cannot
  wedge capture" (`src/process/mod.rs:141-142`). <!-- consolidation: discard; ref: none; reason: External tempfile capture design and deadlock rationale. -->
- `stdin(Stdio::null())` (`mod.rs:353`); wait polls `try_wait()` with `poll = (poll * 2).min(25 ms)`. <!-- consolidation: discard; ref: none; reason: External null-stdin child configuration. --> <!-- consolidation: discard; ref: none; reason: External exponential wait-poll interval. -->

**No persistent connection. No libtmux. No `tmux -C` control mode** — only `vt100 = "0.16"` in
Cargo.toml:31; grep for `control-mode|control_mode|--mode|notify` returns nothing. **[code]** <!-- consolidation: discard; ref: none; reason: External dependency and control-connection source inventory. -->

**[inference]** Every call pays fork + socket connect + tmux parse/format. The only lever is reducing
fork count. <!-- consolidation: discard; ref: none; reason: External per-call fork and socket/format overhead characterization. --> <!-- consolidation: unconfirmed; ref: docs/adr/README.md#active-decisions; reason: Claim that reducing fork count is the only available optimization is not established by external source absence. -->

### 4.9 Socket and session naming

Default tmux socket; `-S <path>` or `-L <name>` per command. Each agent gets its own session, name
shape `_<id8>`, extra web terminals `_<id8>_t<N>`; prefixes `TERMINAL_PREFIX` /
`CONTAINER_TERMINAL_PREFIX` / `SESSION_PREFIX`, debug builds use `aoe_dev_`
(`src/tmux/terminal_session.rs`, name-generation tests ~`:340-372`). **[code]** <!-- consolidation: discard; ref: docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport; reason: External default-socket choice does not override explicit shared-backend selection. --> <!-- consolidation: discard; ref: none; reason: External per-agent and web-terminal naming scheme. -->

`host_pane_inputs` pins `HOME`/`SHELL`/`PATH` — "the shared tmux server's base env may have been
poisoned by a sandboxed dev build." **[comment]** <!-- consolidation: discard; ref: docs/specs/sessions.md#starting-a-session; reason: External HOME/SHELL/PATH pinning is not the approved explicit launch-environment contract. -->

---

## 5. Exit: six independent routes

This is the structural answer to BACK-728's "panes dead, process alive holding the terminal." <!-- consolidation: unconfirmed; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: External exit routes alone do not prove the local failure is resolved. -->

1. **Ctrl+C belongs to the agent** during live-send — `(KeyCode::Char('c'), KeyModifiers::CONTROL) if
   !self.home.is_live_send_capturing()` (`app.rs:2017-2018`). **[code]** <!-- consolidation: discard; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Local Ctrl+C returns to navigation instead of reaching the agent. -->
2. **`quit_intent` returns `Ignore` whenever Ctrl is held** (`app.rs:1954-1965`), documented "Ctrl+Q is
   reserved for leaving live-send and never quits" (`app.rs:1943-1944`). **[code]** <!-- consolidation: discard; ref: none; reason: External all-Control-modifier quit suppression is broader than local Ctrl+Q behavior. -->
3. `IgnoreSignalsGuard` sets **SIGINT and SIGQUIT only** to `SIG_IGN`, restores in `Drop`
   (`app.rs:157-203`). Installed at **exactly one** production site: inside `with_raw_mode_disabled`
   (`app.rs:440`), scoped to the child's lifetime — **not** for the whole TUI session. **[code]** <!-- consolidation: discard; ref: none; reason: External child-scoped signal guard and production call-site evidence. -->
4. SIGHUP / SIGTERM / SIGINT each get their own `select!` arm setting `should_quit = true; break`
   (`app.rs:1130`, `:1141`, `:1152`). Registered "Exit cleanly when the terminal is force-quit,
   preventing PTY slot leaks" (`app.rs:554-555`). **[code]** <!-- consolidation: discard; ref: none; reason: External signal-driven loop exit implementation. -->
5. Bare `q` quits with confirmation (`app.rs:2033-2050`); `should_quit` is checked in the same
   iteration after `handle_key` (`app.rs:785-787`). **[code]** <!-- consolidation: discard; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Approved local q never exits unlike AoE confirmation quit. -->
6. Stdin EOF / error arms (`app.rs:1090-1104`). **[code]** <!-- consolidation: discard; ref: none; reason: External stdin-closure exit route. -->

Exit chords were picked **empirically** (`live_send.rs:44-52`) — **[comment]**:

> "Ctrl+`] and `Ctrl+\` were each tried and silently failed on at least one common macOS
> terminal/keyboard combination." <!-- consolidation: discard; ref: none; reason: External empirical rejected-chord history. -->

Default: `C-q` alone leaves live-send; `C-b` (`DEFAULT_LEADER`) arms the AoE menu. **[code]** <!-- consolidation: exists; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Ctrl+Q returning from agent input to navigation is approved. --> <!-- consolidation: discard; ref: none; reason: External Ctrl+B menu leader is not an approved local shortcut. -->

**[inference]** Because the TUI owns the terminal, the outer process never leaves the foreground
process group. Our bug is structurally impossible in this design rather than patched. <!-- consolidation: unconfirmed; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Terminal ownership alone cannot establish that every process-lifetime exit bug is impossible. -->

---

## 6. Preview transport

**Default is a VT channel over `pipe-pane`. `capture-pane` is the fallback.** **[code]** <!-- consolidation: discard; ref: none; reason: External default and fallback preview transport. -->

`src/tmux/vt.rs:1-5` — **[comment]**:

> "Shared in-process VT channel: a `tmux pipe-pane` stream feeds an in-process `vt100::Parser`, and
> where tmux allows it the same unix socket carries keystrokes back. tmux still owns the pane. One
> refcounted `VtChannel` per session, torn down when the last `Arc` drops." <!-- consolidation: discard; ref: none; reason: External pipe-pane to vt100 parser transport. --> <!-- consolidation: discard; ref: none; reason: External bidirectional socket input capability. --> <!-- consolidation: discard; ref: docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport; reason: External refcounted channel lifetime is not authority for shared-execution or server cleanup. -->

Arming (`vt.rs:2099-2108`): target `format!("{name}:^.0")` (`vt.rs:2013`), pipe command
`format!("{} __vt-pipe {}", sh_quote(exe), sh_quote(sock_path))`, flags `-IO` on tmux 3.8+ else `-O`
(`vt.rs:2106-2107`). **[code]** <!-- consolidation: discard; ref: none; reason: External pipe arming command and target syntax. --> <!-- consolidation: discard; ref: none; reason: External version-gated IO flags are corrected later in this reference. -->

The forwarder is the same binary re-exec'd as a hidden subcommand: `src/main.rs:52` →
`tui::run_vt_pipe`, body `run_pipe` (`vt.rs:364-399`) — "stdin (pane output) to the socket, and the
socket to stdout (pane input, when armed `-IO`). Unbuffered so a keystroke is never stalled behind a
stdio buffer." **[comment]** <!-- consolidation: discard; ref: none; reason: External hidden-subcommand bidirectional unbuffered forwarder. -->

**Cross-process exclusive lease** via `@aoe_vt_owner` / `@aoe_vt_owner_hb` / `@aoe_vt_pipe_owner`
(`session.rs:51-55`): "pipe-pane is exclusive per pane, so only the holder pipes and everyone else
stays on `capture-pane`" (`session.rs:52`). A second armer logs "vt: pipe owned by another process;
using capture fallback" (`vt.rs:2024-2030`). **[code]** <!-- consolidation: discard; ref: docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport; reason: External pipe-owner lease and second-client fallback are mechanisms rather than approved local exclusivity policy. -->

Every arming failure path logs and returns `None` → capture fallback (`vt.rs:2110-2115`, `:2130-2136`,
`:2168-2179`, `:2181-2192`). **[code]** Config `[tmux] vt_live`, default on, opt out via `AOE_VT_LIVE=0` <!-- consolidation: discard; ref: none; reason: External arming-failure capture fallback. -->
(Cargo.toml:28-31). **[code]** <!-- consolidation: discard; ref: none; reason: External VT configuration and environment override. -->

**Correction — the `-IO` version gate is wrong.** The flags are chosen by version above
(`-IO` on tmux 3.8+, else `-O`). Measured on tmux 3.7c: `-I` and `-O` are **independent flags**
and have been since tmux 1.x; `-IO` works on 3.7c. The correct approach is a **functional probe** — <!-- consolidation: discard; ref: none; reason: External version-gate correction and measured flag availability. -->
arm and observe — not a version check. A version gate silently downgrades to output-only on any
tmux older than upstream first tested. <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport; reason: Functional probing recommendation and applicability to the local transport require verification rather than approval by reference. -->

**Correction — a bare `%` in a `pipe-pane` command is mangled.** `man tmux` notes the string "may
contain the special character sequences supported by the `status-left` option." Verified:
`echo PCT_%s_TEST` renders as `PCT_1791111022_TEST`. Any `pipe-pane` command containing a bare `%`
is silently rewritten, which can make a working feature look broken. <!-- consolidation: discard; ref: none; reason: Measured tmux percent substitution is external command-escaping reference evidence. -->

**Correction — startup order is bind, then arm, then await.** The forwarder is spawned *by*
`pipe-pane`, so it cannot dial a listener that does not yet exist. **[inference]** from prototype
work: awaiting the dial-in before arming deadlocks until timeout. <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport; reason: Bind-arm-await startup ordering is prototype evidence whose current local applicability is not established. -->

Per-cycle decision (`live_send.rs:1418-1513`): sample the in-process grid by default, arming off-cycle
via `pending_vt_arm = Some(PendingArm::spawn(...))` (`:1443-1449`) gated by `channel_arm_due`
(`:697-706`). Until armed or on failure, one `capture-pane` fork serves the pane and retries on the <!-- consolidation: discard; ref: none; reason: External in-process sampling with off-cycle asynchronous arming. -->
`VT_REARM_INTERVAL` throttle. A half-drawn synchronized-output frame is not published <!-- consolidation: discard; ref: none; reason: External capture fallback and throttled rearming. -->
(`if sample.incomplete { (None, None) }`). **[code]** <!-- consolidation: discard; ref: none; reason: External incomplete-frame publication suppression. -->

Cadences (`src/tui/home/live_send.rs`):

| Constant | Value | Line |
|---|---|---|
| `LIVE_CAPTURE_INTERVAL_IDLE_MS` | 250 | `:634` <!-- consolidation: discard; ref: none; reason: External idle capture cadence. --> |
| `LIVE_CAPTURE_INTERVAL_FAST_MS` | 25 | `:585` <!-- consolidation: discard; ref: none; reason: External fast capture cadence. --> |
| `SAMPLE_QUIESCENCE_MS` | 6 | `:603` <!-- consolidation: discard; ref: none; reason: External sample quiescence interval. --> |
| `SAMPLE_LATENCY_CAP_MS` | 40 | `:607` <!-- consolidation: discard; ref: none; reason: External sample latency cap. --> |
| `AUTHORITATIVE_CAPTURE_INTERVAL` | 10 s | `:638` <!-- consolidation: discard; ref: none; reason: External authoritative capture cadence. --> |
| `PANE_COUNT_PROBE_MS` | ~2 s | ~`:937` <!-- consolidation: discard; ref: none; reason: External pane-count probe cadence. --> |
| `COMPOSITE_LAYOUT_MS` | 300 | ~`:1000` <!-- consolidation: discard; ref: none; reason: External composite layout cadence. --> |

`LiveCaptureWorker` (`live_send.rs:851-908`) — one long-lived thread forking `capture-pane`,
publishing into a single-slot mailbox the render loop drains, "moving the per-frame capture cost
(~8.5ms on macOS, ~90% of a live-send frame) off the hot path." **[comment]** <!-- consolidation: discard; ref: none; reason: External long-lived capture worker and single-slot publication mailbox. --> <!-- consolidation: discard; ref: none; reason: External capture cost measurement is not a local performance target. -->

`ViewMode::Terminal` (host/container shell) **always** uses `capture-pane` — "their prompt repaint
can expose a PROMPT_EOL_MARK to a pipe-pane seed, producing a false frame before the grid reconciles.
Slower, but no seed handoff." (`home/render.rs:2069-2072`). **[code]** <!-- consolidation: discard; ref: none; reason: External shell-preview capture-only exception and prompt-seeding rationale. -->

---

## 7. Dashboard can act on agents without focusing them

`a` / `A` → `ActionId::RespondToPermission` (`src/tui/home/bindings.rs:683-687`), `Context::Always`.
Dispatch `open_permission_response_dialog()` (`home/input.rs:2776`). **[code]** <!-- consolidation: discard; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: External permission-response shortcut is not implied by approved permission indication. -->

Choices (`src/tui/dialogs/permission_response.rs:41-45`): `Allow`, `AllowAlways`, `Deny`. Enter
submits the focused choice, Esc cancels; mouse clicks route too (`input.rs:1619-1623`). **[code]** <!-- consolidation: discard; ref: none; reason: External permission response choices. --> <!-- consolidation: discard; ref: none; reason: External permission dialog keyboard and mouse interactions. -->

Delivery (`src/tui/home/send.rs:196-234`) — "Send the tmux keystrokes for a permission-prompt decision
to the selected session's agent pane. No pane-readiness wait: this only makes sense against a live
pane already showing a prompt." **[comment]** Token mapping is pure (`send.rs:7-19`). **[code]** <!-- consolidation: discard; ref: none; reason: External permission delivery skips readiness waits against an already prompted pane. --> <!-- consolidation: discard; ref: none; reason: External pure permission-token mapping implementation. -->

`Session::send_key_tokens` (`src/tmux/session.rs:1025-1041`) — "Send exactly these tokens, with no
implicit Enter, to answer an agent's own permission prompt." **[code]** One subprocess **per token**;
no trailing Enter. <!-- consolidation: discard; ref: none; reason: External exact permission-token delivery without implicit Enter. --> <!-- consolidation: discard; ref: none; reason: External one-subprocess-per-token implementation cost. -->

Per-agent tables:

| Agent | Enter delay | Allow / Always / Deny | Line |
|---|---|---|---|
| Claude | 150 ms | `1` / `2` / `3` | `src/agents.rs:534-540` <!-- consolidation: discard; ref: none; reason: External Claude permission tokens and delivery delay. --> |
| Codex | 150 ms | `y` / `a` / `d` | `src/agents.rs:610-616` <!-- consolidation: discard; ref: none; reason: External Codex permission tokens and delivery delay. --> |
| unnamed | — | `[Enter]` / `[Right, …]` / — | `src/agents.rs:560-565` <!-- consolidation: discard; ref: none; reason: External unnamed-provider permission token mapping. --> |
| unnamed | — | `[Enter]` / none → row hidden | `[Down, Enter]` | `src/agents.rs:846-849` <!-- consolidation: discard; ref: none; reason: External unnamed-provider mapping and unavailable-choice hiding. --> |

The delay is measured, not guessed — **[comment]**: "Claude's 100ms paste completion window swallows an
earlier Enter"; "Codex's 120ms paste-burst window swallows an earlier Enter." <!-- consolidation: discard; ref: docs/architecture/session-harness.md#readiness-and-identity-correlation; reason: External Claude paste timing measurement is not local startup readiness evidence. --> <!-- consolidation: discard; ref: docs/architecture/session-harness.md#readiness-and-identity-correlation; reason: External Codex paste timing measurement is not local startup readiness evidence. -->

**[inference]** If we ever grow a multi-agent surface, `a` → Allow is the highest value-per-line
dashboard action available, and the per-agent token table is the entire mechanism. <!-- consolidation: unconfirmed; ref: docs/specs/session-interaction-and-feedback.md#session-interaction-and-feedback; reason: Proposed dashboard permission action has no recorded approval here. --> <!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#runningexecution; reason: Sufficiency of token tables for safe provider permission responses requires verification. -->

---

## 8. Web terminal — confirms the same design

`src/server/live_ws.rs:1-4` — **[comment]**:

> "One WebSocket per viewer on `/sessions/{id}/live-ws`. There is no PTY and no `tmux attach`: the
> server publishes rendered windows and the client scrolls them." <!-- consolidation: discard; ref: none; reason: External per-viewer WebSocket endpoint and rendered-window streaming architecture. -->

Two transports (`LiveTransport`, `live_ws.rs:225-229`): `Grid` = shared in-process `VtChannel`
(`live_ws.rs:738-742`), eligible only when `grid_transport_eligible` → `pane_count == Some(1) &&
window_lines <= SCROLLBACK_LINES` (`live_ws.rs:324-326`; `SCROLLBACK_LINES = 2000`, `src/tmux/vt.rs:638-639`).
`Snapshot` = `capture-pane`. Paired host/container routes hardcode `Snapshot`. **[code]** <!-- consolidation: discard; ref: none; reason: External grid transport eligibility and 2000-line limit. --> <!-- consolidation: discard; ref: none; reason: External snapshot transport and forced shell-route selection. -->

`pipe-pane` **is** used, but as a pane-output tap, not a PTY relay. **[code]** <!-- consolidation: discard; ref: none; reason: External output-tap transport characterization. -->
Router comment (`src/server/router.rs:286-287`): "Terminal WebSockets (capture-streaming live view;
the agent pane and the paired host/container shells). The xterm PTY relay was removed." **[comment]** <!-- consolidation: discard; ref: none; reason: External router comment and relay-removal history. -->

Docs claims: `docs/guides/live-mode.md:43` and `docs/guides/web/terminal.md:11` ("There is no xterm.js
and no PTY attach"). **[comment]** <!-- consolidation: discard; ref: none; reason: External web guide transport claim. -->

`portable-pty = "0.9"` remains in Cargo.toml:61-62 but no references were found in the checked
files — **[inference]** vestigial for this path (not grepped exhaustively). <!-- consolidation: unconfirmed; ref: none; reason: External dependency unusedness was explicitly not exhaustively verified. -->

---

## 9. Web URLs

| Resource | URL |
|---|---|
| Raw source | `https://raw.githubusercontent.com/agent-of-empires/agent-of-empires/main/<path>` |
| Directory listing | `https://api.github.com/repos/agent-of-empires/agent-of-empires/contents/<dir>` |
| Recursive tree | `https://api.github.com/repos/agent-of-empires/agent-of-empires/git/trees/main?recursive=1` |
| Docs | `https://www.agent-of-empires.com/docs/` |
| Web terminal guide | `https://www.agent-of-empires.com/guides/web/terminal.md` |

---

## 10. Findings not verified

Recorded so a later reader does not mistake these for settled.

- `jump_to_adjacent_finished` body unread. The `Alt+Up`/`Alt+Down` doc at `input.rs:415-419` appears
  **stale** — `parse_hotkey` (`input.rs:354-364`) defines the form as `Alt+<single-char>`, so the delta
  likely comes from a configured per-tool hotkey letter navigating *finished* sessions. <!-- consolidation: unconfirmed; ref: none; reason: External adjacent-finished navigation body was unread and stale shortcut inference remains unverified. -->
- `preview_mount_pending` debounce is **120 ms** (`PREVIEW_MOUNT_DEBOUNCE`, `app.rs:2351`) and governs
  the **structured/ACP WebSocket mount**, not the terminal preview. A distinct mechanism from the
  input-side paste-burst detector. <!-- consolidation: unconfirmed; ref: none; reason: Structured preview debounce scope is explicitly retained among unverified external findings. -->
- Whether the dashboard composer synthesizes a paste burst internally was not found. <!-- consolidation: unconfirmed; ref: none; reason: External dashboard paste synthesis remains unanswered. -->
- No retry or queue exists for a failed dashboard send. <!-- consolidation: unconfirmed; ref: none; reason: This repeated external send finding is explicitly labeled unverified despite the earlier source claim. -->
- `portable-pty` may be vestigial; not grepped exhaustively. <!-- consolidation: unconfirmed; ref: none; reason: External dependency retention remains unverified. -->

---

## 11. What this means for BACK-728

Restating §0 with the evidence now in hand. **[inference] throughout.**

**The lag and the exit bug share one root cause**, and it is architectural, not a bug in either
symptom: tmux is the UI substrate. <!-- consolidation: unconfirmed; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Repeated architectural root-cause inference is not established by the external comparison. -->

Three mechanisms transfer regardless of which UI substrate is eventually chosen:

1. **Background-thread tmux work + server-wide TTL snapshots** (§2). The only lever available is
   fork count — there is no persistent connection (§4.5, §4.8). This helps under any UI. <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport; reason: Proposed background TTL snapshot optimization has not been approved for the local runtime. --> <!-- consolidation: unconfirmed; ref: docs/adr/README.md#active-decisions; reason: No-persistent-connection and only-fork-count generalization requires local verification. -->
2. **Async coalescing worker for input** (§4.3). Replaces per-keystroke blocking forks; typing "hello"
   must cost one call, not five. <!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#runningexecution; reason: Async input batching and one-call typing target are recommendations rather than approved delivery requirements. -->
3. **Exit-chord discipline plus the `pre_exec` signal reset** (§5). Note that AoE's `IgnoreSignalsGuard`
   is scoped to child processes only; the reason their Ctrl+C works is not the guard, it is that the TUI
   never leaves the foreground process group. <!-- consolidation: unconfirmed; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Exit-chord and pre_exec transfer recommendation is not a local signal implementation contract. --> <!-- consolidation: discard; ref: none; reason: External child-scoped signal guard restates reference evidence. --> <!-- consolidation: unconfirmed; ref: none; reason: Foreground process group as the sole reason Ctrl+C works is an unverified causal inference. -->

The VT-channel-over-`pipe-pane` design (§6) is what our Ink spike rediscovered independently. The
additions the spike lacks and AoE has: the **cross-process exclusive lease**, and **keystrokes
returning over the same socket** on tmux 3.8+. <!-- consolidation: discard; ref: none; reason: Historical independent spike rediscovery claim. --> <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport; reason: Adopting an exclusive pipe lease requires distinguishing transport ownership from shared execution ownership. --> <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport; reason: Bidirectional socket addition is unapproved and its repeated 3.8+ premise conflicts with this document's correction. -->

**Not recommended:** a persistent `tmux -C` control connection. It was tried and it EOFs within
milliseconds on macOS tmux 3.x (§4.5). <!-- consolidation: unconfirmed; ref: docs/adr/README.md#active-decisions; reason: External control-mode failure does not approve a local architectural prohibition. -->

### 11.1 Prototype results (measured, not inferred)

Built at `/Users/imribarr/Projects/ink-agent-workspace-prototype` (standalone, ~6,100 lines,
Ink 6.8.0 + tmux 3.7c, bun). Every number below was measured against real processes. <!-- consolidation: discard; ref: none; reason: Historical standalone prototype location and measurement provenance. -->

**Idle cost** — `bun scripts/measure-idle.ts`, 30 s idle: <!-- consolidation: discard; ref: none; reason: Historical external-prototype measurement invocation. -->

| | baseline (`tmux` as UI substrate) | prototype |
|---|---|---|
| tmux calls | ~240 | **64** (3.8× fewer) <!-- consolidation: discard; ref: none; reason: Historical prototype call-count benchmark. --> |
| serialized tmux wait | ~1,836 ms | **790.7 ms** (2.3× less) <!-- consolidation: discard; ref: none; reason: Historical prototype serialized-wait benchmark. --> |

Not zero, and honestly so. Snapshot refresh alone is 60 of the 64 calls, because
`refreshDue()` fires at `CACHE_TTL/2` = 1 s and **tmux has no "session list changed" event**. <!-- consolidation: discard; ref: none; reason: Historical prototype snapshot call accounting. --> <!-- consolidation: unconfirmed; ref: none; reason: Categorical absence of tmux session-list change notifications requires verification and is not established by this benchmark. -->
The remaining 4 are 3 `capture-pane` (the 10 s authoritative floor) and 1 `display-message`. <!-- consolidation: discard; ref: none; reason: Historical prototype residual-call accounting. -->

**Exit** — `bun scripts/verify-exit.ts`, asserting on `waitpid` against the real PTY process: <!-- consolidation: discard; ref: none; reason: Historical prototype exit-check invocation and observation method. -->

| route | spec | result |
|---|---|---|
| `q` | §5 item 5 | PASS — process gone, status 0 <!-- consolidation: discard; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Historical prototype q-exit result conflicts with current q-never-exits behavior. --> |
| Ctrl+C while idle | §5 item 1 | PASS — process gone, status 0 <!-- consolidation: discard; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Prototype exit result is not verification of current navigation Ctrl+C behavior. --> |
| Ctrl+Q | §5 item 2 | PASS — correctly does *not* exit <!-- consolidation: discard; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Prototype non-exit result is historical evidence rather than current acceptance verification. --> |

After a clean exit: **0 live tmux servers on the private socket, 0 stray processes.** <!-- consolidation: discard; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Private-prototype teardown result must not become shared-agent termination on workspace exit. -->

**Three premises in this document are wrong, corrected by measurement:**

1. Ink's `exitOnCtrlC` defaults to **TRUE** (`render.js:14`), not false. The real BACK-728
   mechanism is not that Ctrl+C is disabled — it is that `handleExit` *unmounts*, and
   **unmount ≠ process exit**. Any surviving timer, worker, or socket holds the terminal. <!-- consolidation: discard; ref: none; reason: Repeated historical Ink default and unmount correction. --> <!-- consolidation: unconfirmed; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Attribution of the local bug to surviving handles is not independently established by the external reference. -->
   The prototype sets `exitOnCtrlC: false` anyway, because with it true, `useInput`
   swallows Ctrl+C (`use-input.js:110`), making §5 item 1 unreachable. <!-- consolidation: discard; ref: none; reason: Historical prototype Ink flag workaround. -->
2. The `-IO` "tmux 3.8+" gate is wrong — `-I`/`-O` are independent since tmux 1.x.
   Capability-probe functionally instead. <!-- consolidation: discard; ref: none; reason: Repeated measured tmux IO version correction. --> <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport; reason: Functional-probe prescription remains an unapproved transport recommendation. -->
3. tmux runs `%` substitution on `pipe-pane` command strings. Unescaped `%` in a path
   is silently expanded. <!-- consolidation: discard; ref: none; reason: Repeated external pipe-command percent expansion finding. -->

---

## 12. Cross-references

- `docs/tmux-layer-spec.md` — our own tmux boundary (`TmuxWorkspaceServer`, `TmuxCommandResult`,
  `SESSION_ABSENT`, `tmux-pane-lookup.ts`). The layer this document's §2 mechanisms would land in. <!-- consolidation: discard; ref: none; reason: Historical boundary symbol navigation. --> <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport; reason: Proposed landing layer for snapshot mechanisms is not an approved implementation assignment. -->
- `docs/tmux-call-sites.md` — our 56-invocation inventory. <!-- consolidation: discard; ref: none; reason: Historical invocation-count inventory navigation. -->
- `docs/BACK-728-handoff.md` — our measured baseline and root-cause diagnosis. <!-- consolidation: discard; ref: none; reason: Historical diagnostic source navigation rather than independent approval of its diagnosis. -->
- `docs/aoe-lifecycle-comparison.md` — stage-by-stage comparison of AOE's lifecycle against ours (S0-S11),
  with the ranked efficiency gaps and the mechanisms not worth copying. <!-- consolidation: discard; ref: none; reason: External lifecycle comparison navigation. -->
- `docs/aoe-status-tracking-plan.md` — plan for porting AOE-style agent status tracking into the agent
  workspace (provider hook surfaces, detection precedence, scheduling, phases). <!-- consolidation: discard; ref: none; reason: Supporting status-port plan navigation is not provider-policy approval. -->

## 13. OpenTUI cursor comparison (2026-10-05)

This comparison records the pre-native OpenTUI adapter. It is historical: the user subsequently approved `EmbeddedTerminalRenderable` behavior, including native scrolling and controls. <!-- consolidation: discard; ref: none; reason: Pre-native comparison is explicitly historical implementation evidence. --> <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Recorded user approval of native embedded-terminal behavior including scrolling and controls is missing from the core contract. -->

| Concern | AOE | Pre-native OpenTUI adapter |
|---|---|---|
| Passive preview | No hardware cursor; captured output remains active after leaving live-send. | No hardware cursor outside agent focus; the task's host survives navigation. <!-- consolidation: discard; ref: none; reason: External passive-preview cursor hiding. --> <!-- consolidation: discard; ref: none; reason: External capture continuation after live-send. --> <!-- consolidation: discard; ref: none; reason: Historical local passive cursor hiding. --> <!-- consolidation: discard; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Historical retained-host implementation is distinct from approved execution survival on navigation. --> |
| Live-input gate | Cursor requires live-send, zero preview scroll offset, and reliable position. | Cursor requires Tab focus and an in-bounds position. No local history viewport or reliability flag exists. <!-- consolidation: discard; ref: none; reason: External cursor visibility gate. --> <!-- consolidation: discard; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Historical Tab-focus cursor gate predates approved mode cycling. --> <!-- consolidation: discard; ref: none; reason: Historical absence of local history and reliability tracking. --> |
| Position | Maps pane coordinates through preview origin, captured-line range, clipping, and split-pane geometry. | Adds the output node's origin to xterm coordinates, with OpenTUI's one-based cursor offset. This covers the current single-pane live viewport, not split panes or scrollback. <!-- consolidation: discard; ref: none; reason: External preview cursor coordinate mapping. --> <!-- consolidation: discard; ref: none; reason: Historical local coordinate adapter and single-pane limitation. --> |
| Visibility | Honors pane DECTCEM (`?25h` / `?25l`), including alternate screen. | Both host cursor routes currently return `visible: true`. The separate snapshot cursor suppresses alternate screen, but the live adapter does not use it. Neither rule matches AOE's pane-visibility semantics. <!-- consolidation: discard; ref: none; reason: External DECTCEM visibility implementation. --> <!-- consolidation: discard; ref: none; reason: Historical local host cursor visibility defect. --> <!-- consolidation: discard; ref: none; reason: Historical unused snapshot alternate-screen suppression differs from external semantics. --> |
| Shape and blinking | The inspected rendering path sets position only; terminal defaults remain authoritative. | Focus forces a blinking block and does not restore the previous style on blur. <!-- consolidation: discard; ref: none; reason: External terminal-default cursor styling. --> <!-- consolidation: discard; ref: none; reason: Historical local forced blinking cursor and missing restoration. --> |
| Cursor-only movement | Cursor accompanies the cached sample and updates during live-send rendering. | Parsed-output notifications sample and publish cursor even when the text hash is unchanged. <!-- consolidation: discard; ref: none; reason: External cursor sample publication. --> <!-- consolidation: discard; ref: none; reason: Historical local cursor-only update implementation. --> |
| Drift recovery | Queries authoritative tmux cursor/dimensions periodically and reseeds after a stable mismatch. | No authoritative cursor reconciliation or reseeding exists. <!-- consolidation: discard; ref: none; reason: External authoritative cursor reconciliation algorithm. --> <!-- consolidation: discard; ref: none; reason: Historical local reconciliation gap is not current conformance evidence. --> |
| Scrollback | Reading history freezes the preview and hides the live cursor; Shift+Page and wheel have local/alternate-screen routing. | No local preview history or wheel routing exists; input uses the prototype chunk classifier. <!-- consolidation: discard; ref: none; reason: External history freeze and hidden live cursor. --> <!-- consolidation: discard; ref: none; reason: External custom history key and wheel routing. --> <!-- consolidation: discard; ref: none; reason: Historical local history and wheel feature gap. --> <!-- consolidation: discard; ref: none; reason: Historical local chunk-classifier input implementation. --> |
| Ctrl+C during input | Forwards to the agent without exiting AOE. | Intentionally ignored under the previously approved workspace rule. Ctrl+Q returns to tasks. <!-- consolidation: discard; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: External interrupt forwarding conflicts with approved local navigation return. --> <!-- consolidation: discard; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Historical ignored Ctrl+C is superseded by navigation return. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Ctrl+Q returns from agent input to task navigation. --> |
| Preview cell styling | Preserves terminal-derived styling in the preview. | The channel captures cell attributes, but the host currently flattens them to plain text. Workspace chrome styling is separate. <!-- consolidation: discard; ref: none; reason: External preservation of terminal cell styling. --> <!-- consolidation: discard; ref: none; reason: Historical local attribute flattening gap. --> <!-- consolidation: discard; ref: none; reason: Historical separation of workspace chrome styling from captured cells. --> |

Primary-source anchors inspected by Terra:

- [Preview coordinate mapping](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/tui/home/render.rs#L125-L178), [cursor placement](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/tui/home/render.rs#L3187-L3189), and [live-tail/reliability gate](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/tui/home/render.rs#L3261-L3271).
- [VT cursor seeding](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/tmux/vt.rs#L800-L845), [visibility independent of alternate screen](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/tmux/vt.rs#L1325-L1338), and [drift recovery](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/tmux/vt.rs#L2241-L2289).
- [Live-input routing and exit](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/tui/home/input.rs#L5939-L6085), including forwarding Ctrl+C and preserving passive capture on exit. <!-- consolidation: discard; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: External interrupt forwarding citation is not local behavior approval. --> <!-- consolidation: discard; ref: none; reason: External passive-capture continuation citation. -->

Historical implementation anchors were `mountWorkspaceAgent`, `AgentHost.cursor`, `VtChannel.cursor`, and `drainPreviewGrid`. The native cutover removed these adapters and the `@xterm/headless` production dependency. <!-- consolidation: discard; ref: none; reason: Historical adapter source inventory. --> <!-- consolidation: discard; ref: none; reason: Native adapter and dependency removal is implementation history rather than stack-selection approval. -->

### Native terminal cutover

`createWorkspaceAgent` creates one `EmbeddedTerminalRenderable` per agent. The controller retains that terminal across task navigation, while tmux streams raw output into it. OpenTUI owns ANSI styling, cursor visibility and shape, scrollback, selection, key encoding, paste, and mouse reporting. <!-- consolidation: discard; ref: none; reason: Factory name and one-renderable-per-agent construction are source inventory. --> <!-- consolidation: unconfirmed; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Retaining a particular terminal instance across task navigation exceeds core execution-survival and attachment guarantees. --> <!-- consolidation: discard; ref: docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport; reason: Specific tmux-to-native-renderable wiring is implementation evidence beyond the approved live-stream boundary. --> <!-- consolidation: unconfirmed; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: OpenTUI ownership of ANSI styling lacks a precise core technology or feature contract. --> <!-- consolidation: unconfirmed; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Native cursor visibility and shape ownership lacks a precise core contract. --> <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Recorded approval of native terminal scrolling is missing from the core contract. --> <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Recorded approval of native terminal controls is missing from the core contract. --> <!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#runningexecution; reason: Delivery ownership is approved but OpenTUI key-encoding ownership is not specified. --> <!-- consolidation: unconfirmed; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Native paste handling lacks a precise core contract. --> <!-- consolidation: unconfirmed; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Native mouse reporting lacks a precise core contract. -->

Public CLI smoke checks for the native cutover verified styled output, Unicode, application cursor keys, bracketed paste, pane-local mouse coordinates, hidden cursors away from the live tail, retained drafts in real opencode, resizing, and clean terminal restoration. That baseline forwarded `Ctrl+C` to the focused agent; the subsequent workspace pass changes it to leave agent input, like `Ctrl+Q`. The mirror suppresses its terminal-query responses because tmux already answers them. <!-- consolidation: discard; ref: none; reason: Historical styled-output smoke evidence is not current verification. --> <!-- consolidation: discard; ref: none; reason: Historical Unicode smoke evidence is not current verification. --> <!-- consolidation: discard; ref: none; reason: Historical application-cursor-key smoke evidence. --> <!-- consolidation: discard; ref: none; reason: Historical bracketed-paste smoke evidence. --> <!-- consolidation: discard; ref: none; reason: Historical pane-local mouse-coordinate smoke evidence. --> <!-- consolidation: discard; ref: none; reason: Historical hidden-cursor-away-from-tail smoke evidence. --> <!-- consolidation: discard; ref: none; reason: Historical real-opencode draft-retention smoke evidence. --> <!-- consolidation: discard; ref: none; reason: Historical terminal-resize smoke evidence. --> <!-- consolidation: discard; ref: none; reason: Historical terminal-restoration smoke evidence. --> <!-- consolidation: discard; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Baseline focused Ctrl+C forwarding is superseded. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Ctrl+C and Ctrl+Q leave agent input without interrupting execution. --> <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport; reason: Query-response suppression is a specific claimed transport safeguard not established by the generic single-writer contract. -->

Native behavior is intentionally not an AOE reimplementation. OpenTUI handles normal-buffer history scrolling and mouse-enabled alternate-screen input. The workspace does not add AOE's alternate-screen PageUp/PageDown fallback or custom Shift+Page history handling. <!-- consolidation: unconfirmed; ref: none; reason: External behavior does not define approved local requirements. --> <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Recorded approval of native terminal scrolling is missing from the core contract. --> <!-- consolidation: unconfirmed; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Native mouse-enabled alternate-screen behavior is absent from the precise workspace contract. --> <!-- consolidation: unconfirmed; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Explicit exclusion of alternate-screen paging fallback needs confirmed disposition rather than inference from core silence. --> <!-- consolidation: unconfirmed; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Explicit exclusion of custom Shift+Page handling needs confirmed disposition rather than inference from core silence. -->

### Fullscreen reference for the next workspace pass

AOE's full-window attach path is a presentation reference, not a terminal-ownership design to copy. At upstream commit `0a17c859173a8794abfb55ae7e8038c4c4b17e7d`: <!-- consolidation: unconfirmed; ref: none; reason: External presentation reference does not authorize copying runtime ownership. -->

- [Activation dispatch](https://github.com/agent-of-empires/agent-of-empires/blob/0a17c859173a8794abfb55ae7e8038c4c4b17e7d/src/tui/home/input.rs#L4030-L4100) chooses embedded live-send or session attachment. <!-- consolidation: discard; ref: none; reason: External fullscreen activation dispatch. -->
- [Attach sizing](https://github.com/agent-of-empires/agent-of-empires/blob/0a17c859173a8794abfb55ae7e8038c4c4b17e7d/src/tui/app.rs#L2680-L2705) gives the pane the client dimensions, attaches, then restores preview sizing. <!-- consolidation: discard; ref: none; reason: External attach sizing and preview restoration. -->
- [Terminal handoff](https://github.com/agent-of-empires/agent-of-empires/blob/0a17c859173a8794abfb55ae7e8038c4c4b17e7d/src/tui/app.rs#L412-L473) releases raw-mode, alternate-screen, and input ownership around tmux attachment, then restores the TUI. <!-- consolidation: discard; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: External terminal handoff is not the local retained-preview presentation contract. -->

AgenticWorkspace's `f` instead expands the same retained `EmbeddedTerminalRenderable` and hides workspace chrome. It does not run `tmux attach` or install another terminal emulator. OpenTUI keeps input, rendering, cursor, and scrolling ownership in both embedded and fullscreen views. `Ctrl+C` and `Ctrl+Q` return to navigation without interrupting the agent. <!-- consolidation: exists; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: f expands the same retained terminal fullscreen. --> <!-- consolidation: unconfirmed; ref: docs/adr/README.md#active-decisions; reason: Specific EmbeddedTerminalRenderable implementation is not established by the generic retained-terminal contract. --> <!-- consolidation: unconfirmed; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Hiding workspace chrome must preserve the approved visible Ctrl+Q hint row and exact remaining chrome is not specified. --> <!-- consolidation: unconfirmed; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Explicit prohibition of tmux attach is more specific than the approved terminal-host attachment boundary. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Fullscreen retains the same terminal instead of introducing another emulator. --> <!-- consolidation: unconfirmed; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: OpenTUI-specific input ownership across both views lacks a precise core technology contract. --> <!-- consolidation: unconfirmed; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: OpenTUI-specific rendering ownership across both views lacks a precise core technology contract. --> <!-- consolidation: unconfirmed; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: OpenTUI-specific cursor ownership across both views lacks a precise core contract. --> <!-- consolidation: unconfirmed; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: OpenTUI-specific scrolling ownership across both views lacks a precise core contract. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Both exit chords return to navigation without interrupting the agent. -->
