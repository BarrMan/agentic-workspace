# tmux Call-Site Inventory — `src/agent-workspace/tmux-workspace.ts` (1108 lines)

Read-only audit. Every raw tmux CLI invocation in this file, plus the two modules that feed it.
> ⚠️ **Line numbers are approximate.** They were taken from `tmux-workspace.ts` at the commit of
> this audit and they **drift as the refactor proceeds**. Always confirm a number against the
> source before acting on it — prefer the argv string over the line number. Re-verify after any edit.

## How this was counted

A grep for `this.run([` / `this.require([` yields **42** hits. That count is wrong because:

1. Many argv arrays are formatted multi-line, so `[` sits on the line *after* the call
   (e.g. `:606`, `:625`, `:684`, `:925`). A single-line grep misses these.
2. `this.command(` (`:773`) is a third wrapper with the same contract shape.
3. `attach-session` / `switch-client` never touch `run()` at all — they go through `Bun.spawn`
   at `:223` and `:823`.

Exhaustive parse of `this.run(` / `this.require(` / `this.command(` call sites yields **54 sites**.
Subtracting the 2 that are the *definitions* of `require()`/`command()` themselves (`:774`, `:781`)
and the 2 generic passthroughs (`:245`, `:657`) leaves **50 concrete argv arrays**, plus **2
`Bun.spawn` tmux argv arrays** = **52 concrete tmux CLI invocations** in this file.

The previously cited figure of **45 is not reproducible** by any method I applied. Treat this
document's 52 as the working number and reconcile the delta before migrating.

---

## 1. `run()` / `require()` / `command()` — exact signatures and behaviour

### `run()` — `:758-768`

```ts
private async run(args: readonly string[], options?: TmuxCommandOptions): Promise<TmuxCommandResult> {
	const [command, ...commandArgs] = args;
	if (!command) throw new Error("tmux command is missing");
	try {
		return { exitCode: 0, stdout: outputText(await this.tmux.cmd(command, commandArgs, options)), stderr: "" };
	} catch (error) {
		const failure = this.failure(error);
		if (failure) return failure;
		throw error;
	}
}
```

- `TmuxCommandOptions` (`:21`) = `{ timeoutMs?: number | null }`. Threaded straight through to
  `Server.cmd(command, args, options)` (`:50`). Only ever supplied by a caller of `require()`.
  **No call site in this file passes `options`** — verify before assuming a wrapper must support it.
- `TmuxCommandResult` (`:22`) = `{ exitCode: number; stdout: string; stderr: string }`.
- **Return shape**: never rejects for a tmux failure. A non-zero exit becomes a returned
  `{ exitCode, stdout, stderr }` triple via `failure()` (`:769-772`) when libtmux throws
  `TmuxCommandError`. `stdout`/`stderr` are normalised through `outputText()` (`:196`):
  array-of-lines is joined with `\n` and a trailing `\n` appended; an empty array yields `""`.
  **Every `stdout.trim()` at a consumer depends on that trailing-newline normalisation.**
- **Rejection** is reserved for programming errors: empty `args`, or a thrown error that is not
  `TmuxCommandError` (propagated untouched — it is *not* wrapped in `TmuxCommandResult`).
- Consequence: `run()` distinguishes three outcomes — success, tmux-error-as-value, and
  host-level throw. Any wrapper replacing it must preserve that three-way split.

### `require()` — `:778-783`

```ts
private async require(args: readonly string[], message: string, options?: TmuxCommandOptions): Promise<void> {
	if (args[0] === "select-pane" || args[0] === "send-keys" || args[0] === "select-window" || args[0] === "set-option")
		this.diag(`require ${JSON.stringify(args)}`);
	const result = await this.run(args, options);
	if (result.exitCode !== 0) throw this.error(message, result);
}
```

- Returns `void`; **stdout is discarded** — callers that need output use `run()` directly.
- Side effect: writes a line to `/tmp/focus.log` via `diag()` (`:880-887`) for
  `select-pane` / `send-keys` / `select-window` / `set-option` **only**. That is a hard-coded
  4-subcommand allowlist; migrating subcommands off `require()` silently kills the log.
- Failure → `error(message, result)` (`:784-786`) = `` `${message}: ${stderr.trim() || "tmux command failed"}` ``.

### `command()` — `:773-777`

```ts
private async command(args: readonly string[], message: string) {
	const result = await this.run(args);
	if (result.exitCode !== 0) throw this.error(message, result);
	return result;
}
```

- `require()` **plus** the `TmuxCommandResult`. Used exactly once (`:684`). Takes **no** `options`.
- Both wrappers deliberately do *not* accept a timeout of their own.

---

## 2. The generic passthrough at `:656-663`

```ts
private async listPanes(command: string, args: readonly string[]): Promise<readonly string[]> {
	const listed = await this.run([command, ...args]);
	if (listed.exitCode !== 0) {
		if (/no server running/i.test(listed.stderr)) return [];
		throw this.error("Could not inspect live preview panes", listed);
	}
	return listed.stdout ? listed.stdout.split("\n") : [];
}
```

Two generic passthroughs exist; they are the only argv arrays with no literal subcommand in this file:

| line | argv | fed by | concrete commands produced |
|---|---|---|---|
| `:657` | `[command, ...args]` | `livePreviewPanes` `:648` → `tmux-pane-lookup.ts` | `list-panes -a -f <filter> -F <PANE_LOOKUP_FORMAT>` |
| `:245` | `[args]` | `collectAbandonedHost` `:241` → `tmux-orphan-sweep.ts` | `list-sessions -F #{session_name}`, `show-options -qv -t <session> <option>` (×2 options), `list-clients -t <name> -F #{client_pid}` |

**`tmux-pane-lookup.ts` (90 lines)** builds the argv *outside* this file, so grepping
`tmux-workspace.ts` cannot see the `list-panes` invocation. It composes:

- `PANE_LOOKUP_FORMAT` (`:23-31`) — tab-joined: `#{pane_id}`, `#{pane_dead}`, `#{window_id}`,
  `#{@agentic_workspace_root}`, `#{@agentic_workspace_task}`, `#{@agentic_workspace_role}`, `#{pane_title}`.
- `paneFilter()` (`:71-83`) — recursive `#{&&:...}` / `#{==:...}` tmux format expressions;
  `formatLiteral()` (`:89`) escapes `#`, `,`, `}` with `##`, `#,`, `#}`.
- `parsePaneLookupRow()` (`:54-69`) — splits on `\t`, requires `%` prefix on paneId.

The filter string is **injected into the filter expression with `rootPath` as a format literal**.
A wrapper that shells out naively, or that re-quotes argv, can corrupt the filter.

---

## 3. Full call-site inventory — 54 rows

Method column: enclosing method on `TmuxWorkspace` (or the module-level function).

| # | line | subcommand + full argv | method | result used how | notes |
|---|---|---|---|---|---|
| 1 | 245 | `[...args]` generic passthrough | `collectAbandonedHost` | forwarded to `findAbandonedWorkspaces` | orphan sweep; `runner.run` signature `Promise<TmuxCommandResult>` |
| 2 | 354-355 | `set-option -w -t <target> automatic-rename off` | `ensureHostUnlocked` | void; throws on failure | loop over `[boardWindow, workspaceWindow]` → **2 executions** |
| 3 | 358-359 | `set-option -w -t <target> remain-on-exit on` | `ensureHostUnlocked` | void | same loop, **2 executions**; `remain-on-exit` is what makes panes outlive the client |
| 4 | 363 | `rename-window -t <boardWindow> Board` | `ensureHostUnlocked` | void | |
| 5 | 365 | `rename-window -t <workspaceWindow> Workspace` | `ensureHostUnlocked` | void | |
| 6 | 366-367 | `set-option -t <session> key-table <table>` | `ensureHostUnlocked` | void | This key-table name is not generated by current `src/` code. |
| 7 | 370-371 | `bind-key -T <table> <prefix> switch-client -T prefix` | `ensureHostUnlocked` | void | re-binds prefix **inside** the table; `prefix()` is read at `:365` order-wise |
| 8 | 375 | `unbind-key -q -T <table> <key>` | `ensureHostUnlocked` | void | loop over `["C-m","C-i","/"]` → **3 executions** |
| 9 | 433 | `display-message -p -t <activePane> #{window_id}` | `rebuildTopology` | **read** `exitCode===0 && stdout.trim()===workspace` | `#{}` format read |
| 10 | 441-442 | `swap-pane -d -s <activePane> -t <display>` | `rebuildTopology` | void | `-d` = no focus change |
| 11 | 447 | `kill-window -t <workspace>` | `rebuildTopology` | void | guarded by `windowInSession` |
| 12 | 496 | `rename-window -t <window> Workspace` | `rebuildTopology` | void | |
| 13 | 497-498 | `set-option -w -t <window> remain-on-exit on` | `rebuildTopology` | void | |
| 14 | 502 | `unbind-key -q -T <table> <key>` | `rebuildTopology` | void | loop, **3 executions**; idempotent cleanup |
| 15 | 535 | `swap-pane -d -s <source> -t <target>` | `swapPanes` | void | early-returns if `source===target` |
| 16 | 557 | `capture-pane -p -S -<20> -t <pane>` | `requireLivePane` | **read** `stdout.trim()` into the thrown error message | tail of last 20 lines |
| 17 | 587 | `display-message -p -t <pane> #{window_id}` | `nameShellPane` | **read** `.stdout.trim()` | 🔴 focus-critical sequence, step 1 |
| 18 | 588 | `display-message -p -t <window> #{pane_id}` | `nameShellPane` | **read** `.stdout.trim()` | 🔴 focus-critical, step 2 (window's active pane) |
| 19 | 589 | `select-pane -t <pane> -T <name>` | `nameShellPane` | void | 🔴 focus-critical, step 3 — **`-T` activates as a side effect** |
| 20 | 590 | `select-pane -t <active>` | `nameShellPane` | void, exitCode ignored | 🔴 focus-critical, step 4 — restores focus; `run()` not `require()` so restore can never throw |
| 21 | 600-601 | `respawn-pane -k -t <pane> -c <rootPath> <workspaceCommand>` | `launchUi` | void | command string built by `workspaceCommand()` `:180`; `-k` kills the existing process |
| 22 | 606-617 | `bind-key -T <table> C-q if-shell -F '#{==:#{window_id},<wsWindow>}' 'if-shell -F '\''#{window_zoomed_flag}'\'' '\''resize-pane -Z; select-pane -t <tasksPane>'\'' '\''select-pane -t <tasksPane>'\''' ''` | `bindReturnKey` | void | nested tmux-in-tmux: **`resize-pane -Z` appears inside the bound command string too** |
| 23 | 622 | `select-window -t <window>` | `selectWindow` | void | |
| 24 | 625-631 | `display-message -p -t <WORKSPACE_WINDOW> #{window_zoomed_flag}` | `zoomed` | **read** `exitCode===0 && stdout.trim()==="1"` | 🔴 **raced against by `resize-pane -Z` at `:865`/`:868`** |
| 25 | 657 | `[command, ...args]` generic passthrough | `listPanes` | **read** `exitCode`, regex `/no server running/i` on stderr, else `stdout.split("\n")` | feeds `tmux-pane-lookup.ts` `list-panes` |
| 26 | 665 | `display-message -p -t <pane> #{pane_id}` | `paneExists` | **read** `exitCode===0 && stdout.trim()===pane` | `#{}` read |
| 27 | 669 | `display-message -p -t <pane> #{pane_id} #{pane_dead}` | `paneLive` | **read** `exitCode`, then `split(/\s+/)` → `id` + `dead` | two-field format; whitespace split, not fixed index |
| 28 | 675 | `show-options -gv prefix` | `prefix` | **read** `exitCode===0 && stdout.trim()`; falls back `"C-b"` | `-g` global |
| 29 | 684-685 | `list-windows -t <session> -F #{window_id}` | `windowInSession` | **read** `stdout.split("\n")`, `some(trim()===window)` | via `command()`; `#{}` read |
| 30 | 699 | `show-options -qv -t <session> <key>` | `option` | **read** `exitCode===0 && stdout.trim()` → string\|undefined | `-qv` = quiet+value; **non-zero is not an error, means "unset"** |
| 31 | 711 | `set-option -t <session> <key> <value>` | `set` | void | no `-q`; every state write goes through here |
| 32 | 714 | `set-option -qu -t <session> <key>` | `unset` | void | 🔴 **`-qu` quiet: without it, unsetting an already-unset option throws** |
| 33 | 722 | `display-message -p -t <pane> #{pane_height}` | `resizeRegion` | **read** `Number(stdout.trim())` | `#{}` read; only reached when the option disagrees |
| 34 | 726 | `resize-pane -t <pane> -y <rows>` | `resizeRegion` | void | message is caller-supplied |
| 35 | 832 | `select-pane -t <BOARD_PANE>` | `showBoard` | void | must run **after** `selectWindow` |
| 36 | 839-840 | `select-pane -t <await liveUiPane(TASKS_PANE)>` | `showWorkspace` | void | 🔴 **claims task-pane focus immediately after `select-window`, BEFORE revalidating footer/nav/details** |
| 37 | 865 | `resize-pane -Z -t <active>` | `focusAgent` | void | 🔴 **unzoom toggle, gated by `zoomed()` read at `:625`**; bare atomic toggle |
| 38 | 866 | `select-pane -t <active>` | `focusAgent` | void | sits between the unzoom and zoom toggles |
| 39 | 868 | `resize-pane -Z -t <active>` | `focusAgent` | void | 🔴 **zoom toggle, gated by a second `zoomed()` read** |
| 40 | 874 | `select-pane -t <pane>` | `focusSearch` | **read** `exitCode` → logged to `/tmp/focus.log` | `run()` not `require()`; failure tolerated |
| 41 | 876 | `send-keys -t <pane> /` | `focusSearch` | **read** `exitCode` → logged | 🔴 **argv is bare — DO NOT add Enter or `-l`.** See §2.2 of `tmux-layer-spec.md` |
| 42 | 889 | `select-pane -t <TASKS_PANE>` | `focusTasks` | void | |
| 43 | 893 | `select-pane -t <DETAILS_PANE>` | `focusDetails` | void | |
| 44 | 901 | `display-message -p -t <details> #{pane_height}` | `setDetailsVisible` | **read** `Number(stdout.trim())` | `#{}` read |
| 45 | 902 | `display-message -p -t <display> #{pane_height}` | `setDetailsVisible` | **read** `Number(stdout.trim())` | `#{}` read |
| 46 | 908 | `resize-pane -t <details> -y <rows>` | `setDetailsVisible` | void | ratio of 44 % of details+display height |
| 47 | 925-933 | `if-shell -t <session> -F '#{==:#{<MAILBOX>},<request>}}' "set-option -t <session> <MAILBOX> ''"` | `takeTaskRequest` | void | compare-and-clear is **atomic inside tmux**; `request` is regex-validated `/^[A-Za-z0-9][A-Za-z0-9_.-]*$/` at `:922` specifically because it is interpolated into format syntax |
| 48 | 962 | `wait-for -S <channel>` | `updateWorkspaceState` | void | one invocation per listener — tmux has no chaining and `wait-for` takes a single channel |
| 49 | 1002 | `wait-for <channel>` | `subscribeWorkspaceState` | void | long-poll loop |
| 50 | 1018 | `wait-for -S <channel>` | `subscribeWorkspaceState` | void | teardown signal |
| 51 | 1029 | `switch-client -l` | `detach` | void | only when `process.env.TMUX` is set |
| 52 | 1030 | `detach-client -t <session>` | `detach` | void | else-branch |
| 53 | 1053 | `list-panes -s -t <session> -F #{pane_pid}` | `killPaneProcessTrees` | **read** `exitCode !== 0 → return` (silent), else split pids | 🔴 **format read**; `-s` = all panes in session |
| 54 | 1089 | `kill-session -t <session>` | `killSessionIfPresent` | **read** `exitCode===0 \|\| SESSION_ABSENT.test(stderr.toLowerCase())` | 🔴 **`SESSION_ABSENT` = `/can't find session\|no server running\|error connecting/` (`:69`)** |

### Out-of-band (not via `run()`/`require()`)

| line | argv | site | notes |
|---|---|---|---|
| 223-228 | `tmux switch-client -t <session>` then `tmux attach-session -t <session>` | `attachWorkspaceClient` (`:218`) | `Bun.spawn`, inherits stdio; falls through to the second command on non-zero exit; throws only if both fail |
| 823 | `tmux <switch-client\|attach-session> -t <session>` | `attachClient` (`:819`) | `process.env.TMUX ? "switch-client" : "attach-session"`; **awaits exit code and throws** — the interactive hand-off |

Library-mediated (no argv in this file, but they are tmux operations and must be modelled by the
wrapper): `tmux.newSession` `:271`, `session.newWindow` `:404`, `pane.split` `:415`,
`tmux.hasSession` `:258`, `tmux.sessions()` `:428`, `tmux.panes()` `:432`, and `tmux.cmd` `:762`.

---

## 4. Completeness check

**Total rows: 54** (52 concrete argv arrays + 2 generic passthroughs).

Per-subcommand tally, summing to 54:

| subcommand | count | lines |
|---|---|---|
| `display-message -p` | 9 | 433, 587, 588, 625, 665, 669, 722, 901, 902 |
| `select-pane` | 8 | 589, 590, 832, 839, 866, 874, 889, 893 |
| `set-option` | 6 | 354, 358, 366, 497, 711, 714 |
| `resize-pane` | 4 | 726, 865, 868, 908 |
| `rename-window` | 3 | 363, 365, 496 |
| `wait-for` | 3 | 962, 1002, 1018 |
| `<generic-passthrough>` | 2 | 245, 657 |
| `bind-key` | 2 | 370, 606 |
| `show-options` | 2 | 675, 699 |
| `swap-pane` | 2 | 441, 535 |
| `unbind-key` | 2 | 375, 502 |
| `capture-pane` | 1 | 557 |
| `detach-client` | 1 | 1030 |
| `if-shell` | 1 | 925 |
| `kill-session` | 1 | 1089 |
| `kill-window` | 1 | 447 |
| `list-panes` | 1 | 1053 |
| `list-windows` | 1 | 684 |
| `respawn-pane` | 1 | 600 |
| `select-window` | 1 | 622 |
| `send-keys` | 1 | 876 |
| `switch-client` | 1 | 1029 |
| **sum** | **54** | |

Plus 2 `Bun.spawn` arrays (`:223`, `:823`) → **56 total tmux invocations in the file.**

Runtime execution count is higher than 56 because rows 2, 3, 8, 14 sit in loops
(2 + 2 + 3 + 3 = 10 executions from 4 argv templates).

---

## 5. 🔴 Critical behaviour — must not change during migration

### A. `exitCode` + stderr-regex sites (7)

| line | test |
|---|---|
| `:657` | `listed.exitCode !== 0` → `/no server running/i.test(listed.stderr)` → `return []`, else throw |
| `:665` | `paneExists`: `exitCode === 0 && stdout.trim() === pane` |
| `:669` | `paneLive`: `exitCode !== 0` → false; then `split(/\s+/)` |
| `:675` | `prefix`: `exitCode === 0 && stdout.trim()` truthy, else `"C-b"` |
| `:699` | `option`: `exitCode === 0 && stdout.trim()` else `undefined` |
| `:1053` | `killPaneProcessTrees`: `exitCode !== 0` → **silent return**, no throw |
| `:1090` (`kill-session` at `:1089`) | `exitCode === 0 \|\| SESSION_ABSENT.test(stderr.toLowerCase())` → treat as done |

Also exit-code-sensitive: `:433` (`exitCode === 0` before comparing `#{window_id}`),
`:625` (`zoomed`, requires `exitCode === 0` **and** `"1"` — a failed read must read as *not zoomed*,
which makes `:868` attempt a zoom toggle that tmux then treats as an unzoom).

`SESSION_ABSENT` is defined at `:69`:
```ts
const SESSION_ABSENT = /can't find session|no server running|error connecting/;
```
Any wrapper that surfaces stderr differently (e.g. merging into stdout, or trimming the
"error connecting" prefix) breaks teardown.

### B. `#{...}` format-string reads (10)

`display-message -p` × 9 — `:433` `#{window_id}`, `:587` `#{window_id}`, `:588` `#{pane_id}`,
`:625` `#{window_zoomed_flag}`, `:665` `#{pane_id}`, `:669` `#{pane_id} #{pane_dead}`,
`:722` `#{pane_height}`, `:901` `#{pane_height}`, `:902` `#{pane_height}`.
Plus `list-panes -s -F #{pane_pid}` at `:1053`.

Format strings are also **embedded inside command arguments** at `:606` (`#{==:#{window_id},...}`,
`#{window_zoomed_flag}`), `:925` (`#{==:#{...},<request>}}`), and built externally in
`tmux-pane-lookup.ts`. A wrapper that re-quotes or escapes `#`, `,`, `}`, `'` or `;` will
corrupt them.

### C. `send-keys` — `:876`

`["send-keys", "-t", pane, "/"]`. The `/` must stay a **bare literal argument**: no `-l`, no trailing
`Enter` argv element. tmux — not this layer — decides whether Enter is sent.

> ⚠️ **DO NOT** route this through libtmux's `sendKeys()` and **DO NOT** add an `enter`/`literal`
> option. **libtmux's `sendKeys()` appends Enter by default; the tmux CLI does not.** An earlier
> draft conflated the wrapper's semantics with the CLI's and specified
> `sendKeys(pane, "/", { enter: false, literal: true })`. Implemented as written, `focusSearch()`
> would send `/` with a carriage return, the footer search box would never activate, and the
> regression would only surface by hand. Adding an explicit Enter flag here has the same effect.

Failure is tolerated (`run()`, result only logged to `/tmp/focus.log`).

### D. `resize-pane -Z` — `:865`, `:868` (+ inside the bound string at `:606`)

Both are **bare atomic toggles**, never a read-then-set. The guards are `zoomed()` reads at
`:625`, and the sequence is:

```
if (!zoom  && zoomed()) resize-pane -Z   // :864-865  unzoom
select-pane -t active                    // :866
if ( zoom  && !zoomed()) resize-pane -Z  // :867-868  zoom
```

Converting either to `if (zoomed()) resize-pane -Z` elsewhere, or moving the `zoomed()` read
inside a wrapper that adds its own tmux round-trip, widens the race with a user pressing `C-q`
(the `:606` binding also toggles `-Z`). **The read at `:625` and the toggle must stay adjacent
in one call frame.**

### E. Quiet flags — `:375`, `:502`, `:714`

`unbind-key -q` (×2 templates, 3 keys each) and `set-option -qu`. Both are **idempotent cleanup**:
dropping `-q`/`-qu` makes `unbind-key` fail on a key that was never bound and `set-option` fail on
an option that was never set. `:502` runs on the `rebuildTopology` path, which is exactly the
already-partial-workspace case where these are missing. `:699` (`show-options -qv`) is the same
family — non-zero means "unset", not "error".

### F. 🔴 `nameShellPane` focus sequence — `:584-591`

```ts
const window = (await this.run(["display-message", "-p", "-t", pane, "#{window_id}"])).stdout.trim();
const active = window ? (await this.run(["display-message", "-p", "-t", window, "#{pane_id}"])).stdout.trim() : "";
await this.require(["select-pane", "-t", pane, "-T", SHELL_PANES[key].name], "Could not name workspace pane");
if (active && active !== pane) await this.run(["select-pane", "-t", active]);
```

tmux has no "rename pane without activating"; `select-pane -T` **activates its target**. So the
window's active pane is captured first, renamed, then restored. This is a fixed, unavoidable
race window between `:589` and `:590`. Ordering constraints:

1. The two `display-message` reads must precede `:589` (the pane's window may not be known
   otherwise, and the window's active pane changes at `:589`).
2. `:590` uses `run()`, **not** `require()` — focus restoration must never throw.
3. The `active !== pane` guard prevents a redundant activate-then-deactivate flicker.
4. `nameShellPane` is called from `ensureShellPane` (`:539`, `:543`) *and* unconditionally at
   `:341-347` during bootstrap. A wrapper that "batches" or "coalesces" these calls collapses
   the race.

### G. `showWorkspace` ordering — `:834-847`

```ts
await this.selectWindow(await this.id(WORKSPACE_WINDOW));   // select-window
await this.require(
	["select-pane", "-t", await this.liveUiPane(TASKS_PANE, "workspace-tasks")],
	"Could not focus workspace task list",
);
await this.liveUiPane(FOOTER_PANE, "workspace-footer");      // only now: footer
await this.liveUiPane(NAV_PANE, "workspace-nav");            // then: nav
await this.liveUiPane(DETAILS_PANE, "workspace-details");    // then: details
if (taskId) await this.set(MAILBOX, taskId);
```

Note `await this.liveUiPane(...)` is **inside** the argv array at `:839-840` — the pane is
resolved *and respawned and liveness-verified* before the `select-pane` runs. Focus is claimed
**before** the remaining three regions are revalidated, so a concurrent key press arriving
mid-handoff is not undone by the work that follows. `liveUiPane` (`:540-546`) itself is
`ensureShellPane` → `respawnUi` → `requireLivePane`, so it can `throw`. Reordering, or making
`:839` lazy, breaks the guarantee. `showBoard` (`:828-833`) has the same shape at `:832`.

---

## 6. Migration hazards not covered by the subcommand list

- **`diag()` allowlist** at `:779-780` — only `select-pane` / `send-keys` /
  `select-window` / `set-option` are traced. Preserved only if those four keep flowing through
  the same wrapper.
- **Ordering inside `ensureHostUnlocked`** (`:256-354`): all `set()` writes (rows 31) must
  complete before any `nameShellPane` (`:341-347`), because `ensureShellPane`/`zoomed` read those
  options back. `OWNER_PID` is published at `:280` *before* any pane exists.
- **`run()`'s three-way outcome** (§1) — `throw` vs returned non-zero are treated differently at
  `:1053` (silent return) and `:590` (ignored).
- **`TmuxCommandOptions.timeoutMs` is accepted but never used** at any of the 54 call sites.
  If the wrapper introduces a default timeout, rows 47/48/49/50 (`if-shell`, `wait-for`)
  are the ones that would change behaviour.
- **`takeTaskRequest`'s regex guard at `:922`** exists solely because `:926` interpolates
  `request` into tmux format syntax. Move the check and you re-open format injection.
