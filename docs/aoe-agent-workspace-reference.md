# Agent of Empires — Reference Architecture for `agenticworkspace workspace`

**Status:** reference notes. Specifies **no** AgenticWorkspace change and authorises **no** implementation.

**Source:** `agent-of-empires/agent-of-empires`, default branch `main`. Investigated 2026-10-04.
**Purpose:** record how a shipped product solves the same two problems BACK-728 has — a multi-agent
terminal workspace that feels smooth, and a UI that always exits. Cited as `file:line` throughout so
any claim can be re-checked against upstream.

Every statement below is one of three kinds, marked inline:

- **[code]** — what the source demonstrably does.
- **[comment]** — what a doc comment or docs-site page claims. May be stale.
- **[inference]** — our reading, not stated upstream.

### Correction: Ink `exitOnCtrlC`

An earlier draft of this project's handoff, and the `ink-pty-spike` README caveat 1, both state
that "Ink 6 `exitOnCtrlC` defaults to FALSE — proved by experiment." **That is wrong.**

Verified in the installed `ink@6.8.0`:

- `node_modules/ink/build/render.js:14` — `exitOnCtrlC: true` in the defaults object. This is the
  only defaulting layer; `options.js` is empty.
- `node_modules/ink/build/hooks/use-input.js:110` — `useInput` filters Ctrl+C out of handlers when
  the flag is true.
- `node_modules/ink/build/components/App.js:71` — a raw-byte check (`input === '\x03'`) that calls
  `handleExit()`.

So Ctrl+C *does* reach Ink. The actual failure mode is that `handleExit` unmounts the reconciler
and writes a final frame, but **unmount does not end the process** — a surviving timer, worker, or
open socket keeps the event loop alive and the terminal held. That is BACK-728's symptom ("all
panes dead, program alive"), and it needs a different fix than the spike's caveat implies: the
handler must call `process.exit` explicitly rather than merely unmounting.

Bearing on §5 below: that section works because the TUI owns the terminal. An Ink port needs an
explicit process-exit step on top of it, which §5 alone does not describe.

---

## 0. Why this document exists

`agenticworkspace workspace` currently uses **tmux as its UI substrate**: the outer process hands the terminal
to tmux via inherited stdio and tmux draws everything. That single choice produces both reported bugs.

| Symptom | Measured / observed |
|---|---|
| Ctrl+C and `q` do not exit; panes go dead, process stays alive holding the terminal | `quitWorkspace()` kills pane trees then `detach()`s, deliberately keeping the session (`src/agent-workspace/tmux-workspace.ts:969-978`) |
| Laggy | ~240 tmux subprocess calls and ~1,836 ms of serialized tmux wait per 30 s **idle** |

AoE is a working counter-example. The sections below isolate the mechanisms worth understanding before
any design decision gets made. **[inference]** The lag and the exit bug share one root cause: making
tmux the UI substrate rather than a backend.

---

## 1. The core architectural decision

**AoE never uses tmux as a UI.** tmux is a backend PTY container that keeps each agent process alive
across TUI close, SSH drop, and terminal crash. The UI is a native Rust TUI that owns the terminal
and drives agents out-of-band. **[code]**

```
your terminal  →  AoE's own TUI (Ratatui + crossterm, owns the terminal)
                      ↓ forwards keystrokes
                  tmux session per agent (hidden; agent lives here)
                      ↓ streams output back
                  AoE's own TUI (shows preview, status, list)
```

Entry: `src/main.rs:371` → `tui::run` (`src/tui/mod.rs:223`) when `aoe` runs with no subcommand.
Terminal ownership is RAII via `TerminalGuard` (`src/tui/mod.rs:142`), entered at `mod.rs:311`,
restored in `Drop` (`mod.rs:183-208`). **[code]**

**Every tmux fork happens on a named background thread, never on the paint path** — `aoe-display-snapshot`
(`mod.rs:1991`), `aoe-status-poller` (`src/tui/status_poller.rs:314`). **[code]**

### 1.1 Terminal setup

All in `TerminalGuard::enter` (`src/tui/mod.rs:140-203`). **[code]**

| Feature | Where |
|---|---|
| Raw mode | `mod.rs:151`, undone `:189` |
| Alternate screen (`?1049h`) | `mod.rs:153`; left at `:195`, `:429` |
| Bracketed paste | `mod.rs:153`; disabled `:196`, `:431` |
| Mouse capture | conditional, `mod.rs:158`; forced off under Mosh (`mod.rs:300-301`) |
| Kitty `DISAMBIGUATE_ESCAPE_CODES` | best-effort, `mod.rs:168-171` — no support probe, because a probe "can stall startup for 2s" **[comment]** |

`Drop` order is deliberate: pop kitty flags first ("so the shell never inherits it"), then raw mode,
then mouse, then alt-screen + bracketed-paste + cursor-show. **[code]**

`stdin` must be a TTY or AoE bails (`mod.rs:290-293`) — "Without a tty the event loop would busy-loop
after the parent terminal dies." **[comment]**

`with_raw_mode_disabled` (`src/tui/app.rs:413-460`) reverses all of it so `tmux attach` or `$EDITOR`
sees a clean tty, then restores and **recreates the crossterm `EventStream`** (`app.rs:433`, `:466`).
The field is `Option` specifically for this ("its stdin reader thread would compete with `tmux attach`",
`app.rs:117-119`). **[code]**

---

## 2. Idle cost: how AoE reaches ~zero tmux calls

### 2.1 Two server-wide snapshots, one fork each

| Snapshot | Refresh function | What one call covers |
|---|---|---|
| `SESSION_CACHE` (`src/tmux/mod.rs:243`) | `session_scan_command()` (`mod.rs:448`) | chains `show-options -gqv` ×3 + one `list-sessions -F` → **all** sessions |
| `PANE_META_CACHE` (`mod.rs:276`) | `batch_pane_metadata()` (`mod.rs:1034`) | one `list-panes -a -F`, 10 fields → **every** session's pane |

- TTL 2 s; refresh-due at half-life, `snapshot_refresh_due` (`mod.rs:1711`) = `CACHE_TTL / 2`.
- `PaneMetadata` (`mod.rs:214-227`) carries `pane_dead`, `pane_pid`, `pane_title` (OSC 0/2, "which
  several agents use for their state"), and `window_activity` — "The window's last-output time, used
  to skip unchanged captures." **[code]**
- **`Err` from `batch_pane_metadata` means "don't know", never "absent"** (`mod.rs:1032-1033`). **[comment]**
- Concurrency: monotonic `next_refresh_id` (`mod.rs:403`); `publish_session_cache` (`mod.rs:407`)
  drops results with `refresh_id <= cache.refresh_id`; an unexpected failure keeps the last good
  list (`mod.rs:422`). **[code]**
- **Stale reads return `None`, never a false answer** — `session_exists_from_cache` (`mod.rs:1567`),
  `pane_dead_from_cache` (`mod.rs:1663`). **[code]**

### 2.2 The render path never forks

`session_exists_for_display` (`mod.rs:1648`) is documented "Render-path liveness from the snapshot
only, never forking." Same for `pane_dead_for_display` (`mod.rs:1658`). Live `has-session` is a
fallback for cache misses only (`mod.rs:1634-1640`). **[code]**

### 2.3 Status detection is rule-ranked and activity-gated

`src/tmux/status_detection.rs` is **pure parsing** — it contains no `tmux_command` and no
`capture_pane`. **[code]** Order: configured `status_rules` → agent manifest (13 embedded at
`src/tmux/detect/mod.rs:18-32`) → legacy detector. **[code]**

`skip_capture` (`src/session/instance/status_update.rs:7`) refuses a capture when `window_activity`
is unchanged AND a prior capture exists past that second AND no hook fired AND nothing is pending. **[code]**

> "A capture inside or before the activity second proves nothing." — test comment citing issue #3624
> (`status_update.rs:492-510`). **[comment]**

An idle agent therefore performs **zero** tmux calls for status. The skip decision is free because
`activity` came from the bulk `list-panes -a` snapshot (`status_update.rs:390-395`). **[code]**

Hook state is read from the filesystem, no fork (`read_hook_status`, `status_update.rs:274-277`).
**Correction (2026-10-07, pinned `0a17c859`)** — the earlier wording ("a fresh hook short-circuits
everything") is wrong for manifest-backed agents. A hook write is one observation among many and
enters the same priority-ranked rule engine as pane and title evidence: configured `status_rules`
are evaluated first, then manifest rules in descending priority, where the shared hook rules carry
`hook_running_fresh` 600 (max age 30 s), `hook_running_standing` 400 (max age 900 s), `hook_idle`
300, `hook_error` 300 and `hook_waiting` 240 (`manifest.rs:371-451`, `status_update.rs:286-330`).
A higher-priority screen or title rule can therefore outrank a fresh hook, and a hook write older
than its `max_age_secs` is not evidence at all. The 900 s stale-`Running` fallback belongs to the
**legacy manifest-less** branch, which otherwise applies the hook directly
(`status_update.rs:22-24,302-330`). Dead pane + hook present ⇒ `Error`, because "a dead pane
outranks every other signal, and only for a session that reported hooks at all"
(`status_update.rs:280-284`). **[code]**

Extra debounce: `Error` re-latches at most every 30 s; within 3 s of start reports `Starting` without
probing (`status_update.rs:157-171`). **[code]**

### 2.4 tmux options are leases, never status storage

The only options AoE writes are cross-process ownership leases: `@aoe_size_owner`,
`@aoe_size_owner_hb`, `@aoe_vt_owner`, `@aoe_vt_owner_hb`, `@aoe_vt_pipe_owner`
(`src/tmux/session.rs:47-58`). Status is derived in-process from captured bytes. **[code]**

---

## 3. Rendering: 33 ms tick, zero draws when idle

### 3.1 The loop

`App::run` (`src/tui/app.rs:617`), first paint before the loop (`app.rs:534-535`), break at `:1374`.
One `tokio::select!` with seven arms (`app.rs:1100-1152`). **[code]**

```rust
// 33ms (~30fps): 16ms tore on terminals without synchronized update.
let mut refresh_interval = tokio::time::interval(Duration::from_millis(33));
refresh_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
```
(`app.rs:573-575`) **[code]**

**The "~20Hz" comment at `app.rs:24` is stale.** The interval is 33 ms. **[code]**

Periodic work is *not* separate timers — it is `Instant::elapsed()` checks inside the post-select
block: status 500 ms, session feed 1 s, disk 5 s, metrics 1 s, spinner 120 ms, heartbeat 10 s,
presence 3 s, idle reap 60 s (`app.rs:592-603`). **[code]**

### 3.2 Two gates, and idle means no draw at all

**Gate A — `needs_redraw`**: full clear + repaint. Cleared at the top of each iteration
(`app.rs:618-621`). Set only for theme, resize, banner change, post-attach settle, post-editor.
**Deliberately not used for content changes** — "a clear per tick strobes" (`app.rs:1172-1173`),
"No `needs_redraw`: its full clear flashes the screen" (`app.rs:2049`, `:2283`). **[code]**

**Gate B — `refresh_needed`**: whether to draw at all (`app.rs:1352-1366`). **[code]**

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

Idle with nothing changed → `refresh_needed` stays false → **no draw call**. The 33 ms tick still
fires and runs every `elapsed()` check; it just paints nothing.

`clear_terminal` (`src/tui/mod.rs:207-213`) bypasses ratatui's `Terminal::clear` because its
cursor-position query "races the live `EventStream` and fails." **[comment]**

### 3.3 Diffing is stock ratatui

`Terminal::draw` → `Buffer::diff`. The only backend is a thin wrapper (`src/tui/hyperlink.rs:114-163`)
that splits changed cells into runs by hyperlink target — for OSC 8 boundaries, not byte minimisation.
**No hand-rolled cell-diff or RLE encoder exists.** The single `CellDiffOption::AlwaysUpdate` in `src/`
(`home/render.rs:3243`) *forces* re-emission of hyperlink cells whose URI lives outside the Buffer. **[code]**

**Bearing on our Ink spike:** ratatui avoids re-*serialising* unchanged text but still rebuilds the
buffer each frame. It does not solve our ~2,400 `<Text>`-nodes-per-frame cost. **[inference]**

### 3.4 Synchronized update

`draw` (`app.rs:379-408`) queues `BeginSynchronizedUpdate`, builds and draws inside the bracket, then
`execute!`s `EndSynchronizedUpdate`. The opener is queued but never flushed early — "flushing the
opener alone would put the widget build inside the bracket and freeze the display for that time." **[code]**

---

## 4. Input: one queue, two modes

AoE has no "scrolling feature." There is one function that maps a key to **send it to the agent** or
**handle it locally**. Everything in §4 follows from that. **[inference]**

### 4.1 Mode 1 — Tab live-send: per-keystroke

`Tab` on a runnable session installs `LiveSendState`. Module header (`src/tui/home/live_send.rs:1-8`):
every key is routed through a translator producing a `TmuxAction`. **[code]**

`HomeView::handle_key` (`home/input.rs:1719-1738`) intercepts **before every other handler**:
"Live-send capture normally wins over every other key handler: the home view is a thin relay to the
target pane." **[comment]**

Routing: key → `live_send::translate` (`input.rs:6034`) → `LiveDispatch::Send(tmux_key)` →
`worker.send(tmux_key)` (`input.rs:6037-6039`). **[code]**

### 4.2 Mode 2 — dashboard message: one atomic prompt

A `SendMessageDialog` collects a whole message, then delivers it via `src/tui/home/send.rs`. **[code]**
No live-send state is installed, no per-keystroke forwarding, the UI stays in dashboard mode. **[code]**
**No debounce, rate-limit, or coalescing exists on this path**; the only sleep is a per-tool
`enter_delay_ms`. **[code]** Failure sets `InfoDialog::new("Send Failed", ...)` and returns — no retry,
no queue. **[code]**

**Both modes push bytes into the same tmux session. The agent cannot tell them apart.** **[inference]**

### 4.3 The worker never blocks the UI

`LiveSendWorker::send` (`live_send.rs:562-566`) — **[code]**:

```rust
/// Enqueue a translated key. Returns immediately: the fork happens on the worker
/// thread, so the UI never blocks on tmux latency.
pub(super) fn send(&self, key: TmuxKey) {
    let _ = self.tx.send(WorkerMsg::Send(key));
}
```

Worker thread (`live_send.rs:404-470`): `recv_timeout` → drain with `try_recv` into one batch →
`coalesce` → `dispatch_batch` → `dispatch_via_fork`. **[code]**

`coalesce` (`live_send.rs:310-358`) merges consecutive `Send(Literal)` into one `send-keys -l` and
consecutive `Send(HexBytes)` into one `send-keys -H`. Test at `:2898` asserts typing "hello" is **one**
tmux call, not five. **[code]**

`dispatch_via_fork` (`live_send.rs:2026-2133`) targets `format!("{}:^.0", tmux_name)` (`:2072`). **[code]**

### 4.4 Zero-fork input fast path

While a VT channel is armed, input goes back over the **same unix socket** —
`crate::tmux::vt::input_mode(...)` then `try_send_input` (`live_send.rs:2037-2068`). Fallback is a
fork. **[code]**

Single-writer invariant (`live_send.rs:6-11`): "a live input channel is a single-writer signal: two
writers would interleave on one pty input stream, so nothing goes through `send-keys` while it
exists." **[comment]**

### 4.5 `tmux -C` was tried and rejected

`live_send.rs:18-19` — **[comment]**:

> "A long-lived `tmux -C` connection was tried (#1485) and EOF'd within milliseconds on macOS tmux
> 3.x, so one fork per coalesced batch is the portable model; held keys and pastes coalesce into one fork."

**[inference]** This is the single most decision-relevant finding in the document: a persistent control
connection is not a safe default, because the most common dev platform breaks it.

### 4.6 Paste bursts

`PASTE_BURST_INTER_KEY_MS = 5`, `PASTE_BURST_MIN_LEN = 3` (`src/tui/app.rs:30-35`). Purpose: Mosh
strips bracketed-paste markers, so a paste arrives as a tight key stream that would fire AoE shortcuts
one at a time. **[code]**

Gated by `wants_paste_burst` (`home/overlays.rs:161-170`) so only surfaces that consume a synthesized
paste are eligible. **[code]** Algorithm:

1. Reject `KeyEventKind::Release` — "Terminals reporting releases would double-fire every handler" (`app.rs:633-635`).
2. Seed the burst, then collect with a **per-key 5 ms** timeout, re-polling the *same* `EventStream` so no event is lost.
3. Classify: ≥3 keys and not all-identical (`is_auto_repeat_burst`, `app.rs:228-238`).
4. Paste branch: `split_trailing_enter` (`app.rs:239-253`) peels only the **last** Enter and replays it
   through ordinary `handle_key` so it submits; interior newlines stay literal.
5. Short or auto-repeat: replay each key individually so held `j`/`k` still scroll.
6. Dispatch the deferred non-key event **after** the burst, then **one** draw for the whole burst.

Multi-line pastes to an agent use `load-buffer` + `paste-buffer -p` (`home/input.rs:113-166`) — emitting
newlines directly "delivered them to every pane, including raw shells and REPLs that never set DECSET
2004." **[comment]**

### 4.7 Scrolling is not a feature

Full table, all **[code]**:

| Input | Fate |
|---|---|
| printable / arrows / Home / End / Enter / Esc | forwarded to agent (`live_send.rs:2544-2560`) |
| `Shift+PageUp` / `Shift+PageDown` | **local**, `preview_scroll_offset ± 10`, `saturating_sub` down (`input.rs:5991-6009`) |
| bare `PageUp` / `PageDown` | **forwarded** as `PPage` / `NPage` (`live_send.rs:2557-2558`) |
| `Alt+<hotkey>` | exits live-send, jumps list (`input.rs:1729-1732`) |
| `Ctrl+C` | **forwarded to agent** (`input.rs:6028-6045`) |
| wheel, alt-screen pane, mouse on | raw mouse bytes to pane; local offset reset to 0 |
| wheel, alt-screen pane, mouse off | `PageUp`/`PageDown` to pane; offset reset to 0 |
| wheel, normal-buffer pane | **local** `preview_scroll_offset += 3`, clamped (`input.rs:4541-4550`) |
| wheel outside preview rect, live-send | ignored (`input.rs:4482-4485`) |
| wheel over list, live-send | suppressed (`input.rs:4486-4490`) |

`preview_scroll_offset` is a **pure view offset** into already-captured text. No tmux subprocess, no
copy-mode, no `send -X` — anywhere in the path. Local scrolling never mutates the agent. **[code]**

> "the alternate screen has no scrollback, so the capture-window scroll is inert there and forwarding
> is the only way to reach the agent's history" (`input.rs:4292-4295`). **[comment]**

Bare PageUp is forwarded on purpose, so agents with their own paging UI keep working. Only `Shift+` is
stolen for local scroll — matching normal terminal-emulator convention. **[inference]**

**Guard worth stealing:** list scrolling is suppressed during live-send, because "changing the
selection mid-live-send would silently aim the next keystroke at another pane" (`input.rs:4486-4490`). **[comment]**

### 4.8 The exec layer

Single construction point `tmux_command()` (`src/tmux/mod.rs:160`). **[code]**

- `Command::new("tmux")` + `-S <path>` or `-L <name>` (`mod.rs:164-171`).
- `crate::process::reset_signals_on_exec(&mut cmd)` (`mod.rs:175`) via `pre_exec`
  (`src/process/mod.rs:212`). Comment (`mod.rs:172-174`): "Attach runs while aoe ignores
  SIGINT/SIGQUIT, and `SIG_IGN` survives exec; restore defaults so Ctrl+C still works in a hung tmux
  child." **[comment]**
- `tmux_query_command()` (`mod.rs:183`) adds `-u`, `env_remove("LC_ALL")`, `LC_MESSAGES=C`; test
  `tmux_query_command_preserves_ctype_for_session_names` (`mod.rs:2863`).
- Timeout: `TMUX_COMMAND_TIMEOUT = 10 s` (`mod.rs:287`), one wall-clock budget shared across every
  subprocess in one logical operation (`mod.rs:289`).
- Output to **tempfiles, not pipes** — "so a full pipe or a descendant holding the handles cannot
  wedge capture" (`src/process/mod.rs:141-142`).
- `stdin(Stdio::null())` (`mod.rs:353`); wait polls `try_wait()` with `poll = (poll * 2).min(25 ms)`.

**No persistent connection. No libtmux. No `tmux -C` control mode** — only `vt100 = "0.16"` in
Cargo.toml:31; grep for `control-mode|control_mode|--mode|notify` returns nothing. **[code]**

**[inference]** Every call pays fork + socket connect + tmux parse/format. The only lever is reducing
fork count.

### 4.9 Socket and session naming

Default tmux socket; `-S <path>` or `-L <name>` per command. Each agent gets its own session, name
shape `_<id8>`, extra web terminals `_<id8>_t<N>`; prefixes `TERMINAL_PREFIX` /
`CONTAINER_TERMINAL_PREFIX` / `SESSION_PREFIX`, debug builds use `aoe_dev_`
(`src/tmux/terminal_session.rs`, name-generation tests ~`:340-372`). **[code]**

`host_pane_inputs` pins `HOME`/`SHELL`/`PATH` — "the shared tmux server's base env may have been
poisoned by a sandboxed dev build." **[comment]**

---

## 5. Exit: six independent routes

This is the structural answer to BACK-728's "panes dead, process alive holding the terminal."

1. **Ctrl+C belongs to the agent** during live-send — `(KeyCode::Char('c'), KeyModifiers::CONTROL) if
   !self.home.is_live_send_capturing()` (`app.rs:2017-2018`). **[code]**
2. **`quit_intent` returns `Ignore` whenever Ctrl is held** (`app.rs:1954-1965`), documented "Ctrl+Q is
   reserved for leaving live-send and never quits" (`app.rs:1943-1944`). **[code]**
3. `IgnoreSignalsGuard` sets **SIGINT and SIGQUIT only** to `SIG_IGN`, restores in `Drop`
   (`app.rs:157-203`). Installed at **exactly one** production site: inside `with_raw_mode_disabled`
   (`app.rs:440`), scoped to the child's lifetime — **not** for the whole TUI session. **[code]**
4. SIGHUP / SIGTERM / SIGINT each get their own `select!` arm setting `should_quit = true; break`
   (`app.rs:1130`, `:1141`, `:1152`). Registered "Exit cleanly when the terminal is force-quit,
   preventing PTY slot leaks" (`app.rs:554-555`). **[code]**
5. Bare `q` quits with confirmation (`app.rs:2033-2050`); `should_quit` is checked in the same
   iteration after `handle_key` (`app.rs:785-787`). **[code]**
6. Stdin EOF / error arms (`app.rs:1090-1104`). **[code]**

Exit chords were picked **empirically** (`live_send.rs:44-52`) — **[comment]**:

> "Ctrl+`] and `Ctrl+\` were each tried and silently failed on at least one common macOS
> terminal/keyboard combination."

Default: `C-q` alone leaves live-send; `C-b` (`DEFAULT_LEADER`) arms the AoE menu. **[code]**

**[inference]** Because the TUI owns the terminal, the outer process never leaves the foreground
process group. Our bug is structurally impossible in this design rather than patched.

---

## 6. Preview transport

**Default is a VT channel over `pipe-pane`. `capture-pane` is the fallback.** **[code]**

`src/tmux/vt.rs:1-5` — **[comment]**:

> "Shared in-process VT channel: a `tmux pipe-pane` stream feeds an in-process `vt100::Parser`, and
> where tmux allows it the same unix socket carries keystrokes back. tmux still owns the pane. One
> refcounted `VtChannel` per session, torn down when the last `Arc` drops."

Arming (`vt.rs:2099-2108`): target `format!("{name}:^.0")` (`vt.rs:2013`), pipe command
`format!("{} __vt-pipe {}", sh_quote(exe), sh_quote(sock_path))`, flags `-IO` on tmux 3.8+ else `-O`
(`vt.rs:2106-2107`). **[code]**

The forwarder is the same binary re-exec'd as a hidden subcommand: `src/main.rs:52` →
`tui::run_vt_pipe`, body `run_pipe` (`vt.rs:364-399`) — "stdin (pane output) to the socket, and the
socket to stdout (pane input, when armed `-IO`). Unbuffered so a keystroke is never stalled behind a
stdio buffer." **[comment]**

**Cross-process exclusive lease** via `@aoe_vt_owner` / `@aoe_vt_owner_hb` / `@aoe_vt_pipe_owner`
(`session.rs:51-55`): "pipe-pane is exclusive per pane, so only the holder pipes and everyone else
stays on `capture-pane`" (`session.rs:52`). A second armer logs "vt: pipe owned by another process;
using capture fallback" (`vt.rs:2024-2030`). **[code]**

Every arming failure path logs and returns `None` → capture fallback (`vt.rs:2110-2115`, `:2130-2136`,
`:2168-2179`, `:2181-2192`). **[code]** Config `[tmux] vt_live`, default on, opt out via `AOE_VT_LIVE=0`
(Cargo.toml:28-31). **[code]**

**Correction — the `-IO` version gate is wrong.** The flags are chosen by version above
(`-IO` on tmux 3.8+, else `-O`). Measured on tmux 3.7c: `-I` and `-O` are **independent flags**
and have been since tmux 1.x; `-IO` works on 3.7c. The correct approach is a **functional probe** —
arm and observe — not a version check. A version gate silently downgrades to output-only on any
tmux older than upstream first tested.

**Correction — a bare `%` in a `pipe-pane` command is mangled.** `man tmux` notes the string "may
contain the special character sequences supported by the `status-left` option." Verified:
`echo PCT_%s_TEST` renders as `PCT_1791111022_TEST`. Any `pipe-pane` command containing a bare `%`
is silently rewritten, which can make a working feature look broken.

**Correction — startup order is bind, then arm, then await.** The forwarder is spawned *by*
`pipe-pane`, so it cannot dial a listener that does not yet exist. **[inference]** from prototype
work: awaiting the dial-in before arming deadlocks until timeout.

Per-cycle decision (`live_send.rs:1418-1513`): sample the in-process grid by default, arming off-cycle
via `pending_vt_arm = Some(PendingArm::spawn(...))` (`:1443-1449`) gated by `channel_arm_due`
(`:697-706`). Until armed or on failure, one `capture-pane` fork serves the pane and retries on the
`VT_REARM_INTERVAL` throttle. A half-drawn synchronized-output frame is not published
(`if sample.incomplete { (None, None) }`). **[code]**

Cadences (`src/tui/home/live_send.rs`):

| Constant | Value | Line |
|---|---|---|
| `LIVE_CAPTURE_INTERVAL_IDLE_MS` | 250 | `:634` |
| `LIVE_CAPTURE_INTERVAL_FAST_MS` | 25 | `:585` |
| `SAMPLE_QUIESCENCE_MS` | 6 | `:603` |
| `SAMPLE_LATENCY_CAP_MS` | 40 | `:607` |
| `AUTHORITATIVE_CAPTURE_INTERVAL` | 10 s | `:638` |
| `PANE_COUNT_PROBE_MS` | ~2 s | ~`:937` |
| `COMPOSITE_LAYOUT_MS` | 300 | ~`:1000` |

`LiveCaptureWorker` (`live_send.rs:851-908`) — one long-lived thread forking `capture-pane`,
publishing into a single-slot mailbox the render loop drains, "moving the per-frame capture cost
(~8.5ms on macOS, ~90% of a live-send frame) off the hot path." **[comment]**

`ViewMode::Terminal` (host/container shell) **always** uses `capture-pane` — "their prompt repaint
can expose a PROMPT_EOL_MARK to a pipe-pane seed, producing a false frame before the grid reconciles.
Slower, but no seed handoff." (`home/render.rs:2069-2072`). **[code]**

---

## 7. Dashboard can act on agents without focusing them

`a` / `A` → `ActionId::RespondToPermission` (`src/tui/home/bindings.rs:683-687`), `Context::Always`.
Dispatch `open_permission_response_dialog()` (`home/input.rs:2776`). **[code]**

Choices (`src/tui/dialogs/permission_response.rs:41-45`): `Allow`, `AllowAlways`, `Deny`. Enter
submits the focused choice, Esc cancels; mouse clicks route too (`input.rs:1619-1623`). **[code]**

Delivery (`src/tui/home/send.rs:196-234`) — "Send the tmux keystrokes for a permission-prompt decision
to the selected session's agent pane. No pane-readiness wait: this only makes sense against a live
pane already showing a prompt." **[comment]** Token mapping is pure (`send.rs:7-19`). **[code]**

`Session::send_key_tokens` (`src/tmux/session.rs:1025-1041`) — "Send exactly these tokens, with no
implicit Enter, to answer an agent's own permission prompt." **[code]** One subprocess **per token**;
no trailing Enter.

Per-agent tables:

| Agent | Enter delay | Allow / Always / Deny | Line |
|---|---|---|---|
| Claude | 150 ms | `1` / `2` / `3` | `src/agents.rs:534-540` |
| Codex | 150 ms | `y` / `a` / `d` | `src/agents.rs:610-616` |
| unnamed | — | `[Enter]` / `[Right, …]` / — | `src/agents.rs:560-565` |
| unnamed | — | `[Enter]` / none → row hidden | `[Down, Enter]` | `src/agents.rs:846-849` |

The delay is measured, not guessed — **[comment]**: "Claude's 100ms paste completion window swallows an
earlier Enter"; "Codex's 120ms paste-burst window swallows an earlier Enter."

**[inference]** If we ever grow a multi-agent surface, `a` → Allow is the highest value-per-line
dashboard action available, and the per-agent token table is the entire mechanism.

---

## 8. Web terminal — confirms the same design

`src/server/live_ws.rs:1-4` — **[comment]**:

> "One WebSocket per viewer on `/sessions/{id}/live-ws`. There is no PTY and no `tmux attach`: the
> server publishes rendered windows and the client scrolls them."

Two transports (`LiveTransport`, `live_ws.rs:225-229`): `Grid` = shared in-process `VtChannel`
(`live_ws.rs:738-742`), eligible only when `grid_transport_eligible` → `pane_count == Some(1) &&
window_lines <= SCROLLBACK_LINES` (`live_ws.rs:324-326`; `SCROLLBACK_LINES = 2000`, `src/tmux/vt.rs:638-639`).
`Snapshot` = `capture-pane`. Paired host/container routes hardcode `Snapshot`. **[code]**

`pipe-pane` **is** used, but as a pane-output tap, not a PTY relay. **[code]**
Router comment (`src/server/router.rs:286-287`): "Terminal WebSockets (capture-streaming live view;
the agent pane and the paired host/container shells). The xterm PTY relay was removed." **[comment]**

Docs claims: `docs/guides/live-mode.md:43` and `docs/guides/web/terminal.md:11` ("There is no xterm.js
and no PTY attach"). **[comment]**

`portable-pty = "0.9"` remains in Cargo.toml:61-62 but no references were found in the checked
files — **[inference]** vestigial for this path (not grepped exhaustively).

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
  likely comes from a configured per-tool hotkey letter navigating *finished* sessions.
- `preview_mount_pending` debounce is **120 ms** (`PREVIEW_MOUNT_DEBOUNCE`, `app.rs:2351`) and governs
  the **structured/ACP WebSocket mount**, not the terminal preview. A distinct mechanism from the
  input-side paste-burst detector.
- Whether the dashboard composer synthesizes a paste burst internally was not found.
- No retry or queue exists for a failed dashboard send.
- `portable-pty` may be vestigial; not grepped exhaustively.

---

## 11. What this means for BACK-728

Restating §0 with the evidence now in hand. **[inference] throughout.**

**The lag and the exit bug share one root cause**, and it is architectural, not a bug in either
symptom: tmux is the UI substrate.

Three mechanisms transfer regardless of which UI substrate is eventually chosen:

1. **Background-thread tmux work + server-wide TTL snapshots** (§2). The only lever available is
   fork count — there is no persistent connection (§4.5, §4.8). This helps under any UI.
2. **Async coalescing worker for input** (§4.3). Replaces per-keystroke blocking forks; typing "hello"
   must cost one call, not five.
3. **Exit-chord discipline plus the `pre_exec` signal reset** (§5). Note that AoE's `IgnoreSignalsGuard`
   is scoped to child processes only; the reason their Ctrl+C works is not the guard, it is that the TUI
   never leaves the foreground process group.

The VT-channel-over-`pipe-pane` design (§6) is what our Ink spike rediscovered independently. The
additions the spike lacks and AoE has: the **cross-process exclusive lease**, and **keystrokes
returning over the same socket** on tmux 3.8+.

**Not recommended:** a persistent `tmux -C` control connection. It was tried and it EOFs within
milliseconds on macOS tmux 3.x (§4.5).

### 11.1 Prototype results (measured, not inferred)

Built at `/Users/imribarr/Projects/ink-agent-workspace-prototype` (standalone, ~6,100 lines,
Ink 6.8.0 + tmux 3.7c, bun). Every number below was measured against real processes.

**Idle cost** — `bun scripts/measure-idle.ts`, 30 s idle:

| | baseline (`tmux` as UI substrate) | prototype |
|---|---|---|
| tmux calls | ~240 | **64** (3.8× fewer) |
| serialized tmux wait | ~1,836 ms | **790.7 ms** (2.3× less) |

Not zero, and honestly so. Snapshot refresh alone is 60 of the 64 calls, because
`refreshDue()` fires at `CACHE_TTL/2` = 1 s and **tmux has no "session list changed" event**.
The remaining 4 are 3 `capture-pane` (the 10 s authoritative floor) and 1 `display-message`.

**Exit** — `bun scripts/verify-exit.ts`, asserting on `waitpid` against the real PTY process:

| route | spec | result |
|---|---|---|
| `q` | §5 item 5 | PASS — process gone, status 0 |
| Ctrl+C while idle | §5 item 1 | PASS — process gone, status 0 |
| Ctrl+Q | §5 item 2 | PASS — correctly does *not* exit |

After a clean exit: **0 live tmux servers on the private socket, 0 stray processes.**

**Three premises in this document are wrong, corrected by measurement:**

1. Ink's `exitOnCtrlC` defaults to **TRUE** (`render.js:14`), not false. The real BACK-728
   mechanism is not that Ctrl+C is disabled — it is that `handleExit` *unmounts*, and
   **unmount ≠ process exit**. Any surviving timer, worker, or socket holds the terminal.
   The prototype sets `exitOnCtrlC: false` anyway, because with it true, `useInput`
   swallows Ctrl+C (`use-input.js:110`), making §5 item 1 unreachable.
2. The `-IO` "tmux 3.8+" gate is wrong — `-I`/`-O` are independent since tmux 1.x.
   Capability-probe functionally instead.
3. tmux runs `%` substitution on `pipe-pane` command strings. Unescaped `%` in a path
   is silently expanded.

---

## 12. Cross-references

- `docs/tmux-layer-spec.md` — our own tmux boundary (`TmuxWorkspaceServer`, `TmuxCommandResult`,
  `SESSION_ABSENT`, `tmux-pane-lookup.ts`). The layer this document's §2 mechanisms would land in.
- `docs/tmux-call-sites.md` — our 56-invocation inventory.
- `docs/BACK-728-handoff.md` — our measured baseline and root-cause diagnosis.
- `docs/aoe-lifecycle-comparison.md` — stage-by-stage comparison of AOE's lifecycle against ours (S0-S11),
  with the ranked efficiency gaps and the mechanisms not worth copying.
- `docs/aoe-status-tracking-plan.md` — plan for porting AOE-style agent status tracking into the agent
  workspace (provider hook surfaces, detection precedence, scheduling, phases).

## 13. OpenTUI cursor comparison (2026-10-05)

This comparison records the pre-native OpenTUI adapter. It is historical: the user subsequently approved `EmbeddedTerminalRenderable` behavior, including native scrolling and controls.

| Concern | AOE | Pre-native OpenTUI adapter |
|---|---|---|
| Passive preview | No hardware cursor; captured output remains active after leaving live-send. | No hardware cursor outside agent focus; the task's host survives navigation. |
| Live-input gate | Cursor requires live-send, zero preview scroll offset, and reliable position. | Cursor requires Tab focus and an in-bounds position. No local history viewport or reliability flag exists. |
| Position | Maps pane coordinates through preview origin, captured-line range, clipping, and split-pane geometry. | Adds the output node's origin to xterm coordinates, with OpenTUI's one-based cursor offset. This covers the current single-pane live viewport, not split panes or scrollback. |
| Visibility | Honors pane DECTCEM (`?25h` / `?25l`), including alternate screen. | Both host cursor routes currently return `visible: true`. The separate snapshot cursor suppresses alternate screen, but the live adapter does not use it. Neither rule matches AOE's pane-visibility semantics. |
| Shape and blinking | The inspected rendering path sets position only; terminal defaults remain authoritative. | Focus forces a blinking block and does not restore the previous style on blur. |
| Cursor-only movement | Cursor accompanies the cached sample and updates during live-send rendering. | Parsed-output notifications sample and publish cursor even when the text hash is unchanged. |
| Drift recovery | Queries authoritative tmux cursor/dimensions periodically and reseeds after a stable mismatch. | No authoritative cursor reconciliation or reseeding exists. |
| Scrollback | Reading history freezes the preview and hides the live cursor; Shift+Page and wheel have local/alternate-screen routing. | No local preview history or wheel routing exists; input uses the prototype chunk classifier. |
| Ctrl+C during input | Forwards to the agent without exiting AOE. | Intentionally ignored under the previously approved workspace rule. Ctrl+Q returns to tasks. |
| Preview cell styling | Preserves terminal-derived styling in the preview. | The channel captures cell attributes, but the host currently flattens them to plain text. Workspace chrome styling is separate. |

Primary-source anchors inspected by Terra:

- [Preview coordinate mapping](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/tui/home/render.rs#L125-L178), [cursor placement](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/tui/home/render.rs#L3187-L3189), and [live-tail/reliability gate](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/tui/home/render.rs#L3261-L3271).
- [VT cursor seeding](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/tmux/vt.rs#L800-L845), [visibility independent of alternate screen](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/tmux/vt.rs#L1325-L1338), and [drift recovery](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/tmux/vt.rs#L2241-L2289).
- [Live-input routing and exit](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/tui/home/input.rs#L5939-L6085), including forwarding Ctrl+C and preserving passive capture on exit.

Historical implementation anchors were `mountWorkspaceAgent`, `AgentHost.cursor`, `VtChannel.cursor`, and `drainPreviewGrid`. The native cutover removed these adapters and the `@xterm/headless` production dependency.

### Native terminal cutover

`createWorkspaceAgent` creates one `EmbeddedTerminalRenderable` per agent. The controller retains that terminal across task navigation, while tmux streams raw output into it. OpenTUI owns ANSI styling, cursor visibility and shape, scrollback, selection, key encoding, paste, and mouse reporting.

Public CLI smoke checks for the native cutover verified styled output, Unicode, application cursor keys, bracketed paste, pane-local mouse coordinates, hidden cursors away from the live tail, retained drafts in real opencode, resizing, and clean terminal restoration. That baseline forwarded `Ctrl+C` to the focused agent; the subsequent workspace pass changes it to leave agent input, like `Ctrl+Q`. The mirror suppresses its terminal-query responses because tmux already answers them.

Native behavior is intentionally not an AOE reimplementation. OpenTUI handles normal-buffer history scrolling and mouse-enabled alternate-screen input. The workspace does not add AOE's alternate-screen PageUp/PageDown fallback or custom Shift+Page history handling.

### Fullscreen reference for the next workspace pass

AOE's full-window attach path is a presentation reference, not a terminal-ownership design to copy. At upstream commit `0a17c859173a8794abfb55ae7e8038c4c4b17e7d`:

- [Activation dispatch](https://github.com/agent-of-empires/agent-of-empires/blob/0a17c859173a8794abfb55ae7e8038c4c4b17e7d/src/tui/home/input.rs#L4030-L4100) chooses embedded live-send or session attachment.
- [Attach sizing](https://github.com/agent-of-empires/agent-of-empires/blob/0a17c859173a8794abfb55ae7e8038c4c4b17e7d/src/tui/app.rs#L2680-L2705) gives the pane the client dimensions, attaches, then restores preview sizing.
- [Terminal handoff](https://github.com/agent-of-empires/agent-of-empires/blob/0a17c859173a8794abfb55ae7e8038c4c4b17e7d/src/tui/app.rs#L412-L473) releases raw-mode, alternate-screen, and input ownership around tmux attachment, then restores the TUI.

Backlog's `f` instead expands the same retained `EmbeddedTerminalRenderable` and hides workspace chrome. It does not run `tmux attach` or install another terminal emulator. OpenTUI keeps input, rendering, cursor, and scrolling ownership in both embedded and fullscreen views. `Ctrl+C` and `Ctrl+Q` return to navigation without interrupting the agent.
