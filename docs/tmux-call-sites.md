---
consolidation:
  total: 149
  counts:
    exists: 1
    discard: 93
    integrate: 0
    unconfirmed: 55
  percentages:
    exists: 0.67%
    discard: 62.42%
    integrate: 0.00%
    unconfirmed: 36.91%
---
# tmux Call-Site Inventory — `src/agent-workspace/tmux-workspace.ts` (1108 lines)

> **Non-authoritative supporting material.** This file is not a contract. Authoritative owner(s): [BLUEPRINT](BLUEPRINT.md), [session architecture](architecture/session-harness.md), [CONVENTIONS](CONVENTIONS.md).
> Disposition: Historical — discard.

Read-only audit. Every raw tmux CLI invocation in this file, plus the two modules that feed it. <!-- consolidation: discard; ref: none; reason: Historical bounded source inventory rather than approved API. -->
> ⚠️ **Line numbers are approximate.** They were taken from `tmux-workspace.ts` at the commit of
> this audit and they **drift as the refactor proceeds**. Always confirm a number against the
> source before acting on it — prefer the argv string over the line number. Re-verify after any edit. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#testing; reason: Historical inspection is not fresh source evidence. -->

## How this was counted

A grep for `this.run([` / `this.require([` yields **42** hits. That count is wrong because: <!-- consolidation: discard; ref: none; reason: Historical grep undercount. -->

1. Many argv arrays are formatted multi-line, so `[` sits on the line *after* the call
   (e.g. `:606`, `:625`, `:684`, `:925`). A single-line grep misses these. <!-- consolidation: discard; ref: none; reason: Inventory collection-method explanation. -->
2. `this.command(` (`:773`) is a third wrapper with the same contract shape. <!-- consolidation: discard; ref: none; reason: Historical wrapper inventory. -->
3. `attach-session` / `switch-client` never touch `run()` at all — they go through `Bun.spawn`
   at `:223` and `:823`. <!-- consolidation: discard; ref: none; reason: Historical out-of-band invocation inventory. -->

Exhaustive parse of `this.run(` / `this.require(` / `this.command(` call sites yields **54 sites**.
Subtracting the 2 that are the *definitions* of `require()`/`command()` themselves (`:774`, `:781`)
and the 2 generic passthroughs (`:245`, `:657`) leaves **50 concrete argv arrays**, plus **2
`Bun.spawn` tmux argv arrays** = **52 concrete tmux CLI invocations** in this file. <!-- consolidation: unconfirmed; ref: none; reason: Definition subtraction and concrete invocation count conflict with later 54-row and 56-total claims. -->

The previously cited figure of **45 is not reproducible** by any method I applied. Treat this
document's 52 as the working number and reconcile the delta before migrating. <!-- consolidation: unconfirmed; ref: none; reason: Preserve count-reconciliation gate rather than approve 52 or 56. -->

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
<!-- consolidation: discard; ref: none; reason: Historical run implementation excerpt. -->

- `TmuxCommandOptions` (`:21`) = `{ timeoutMs?: number | null }`. Threaded straight through to
  `Server.cmd(command, args, options)` (`:50`). Only ever supplied by a caller of `require()`.
  **No call site in this file passes `options`** — verify before assuming a wrapper must support it. <!-- consolidation: unconfirmed; ref: none; reason: Preserve unused-timeout verification gate before expanding proposed API. -->
- `TmuxCommandResult` (`:22`) = `{ exitCode: number; stdout: string; stderr: string }`. <!-- consolidation: discard; ref: none; reason: Historical result declaration inventory. -->
- **Return shape**: never rejects for a tmux failure. A non-zero exit becomes a returned
  `{ exitCode, stdout, stderr }` triple via `failure()` (`:769-772`) when libtmux throws
  `TmuxCommandError`. `stdout`/`stderr` are normalised through `outputText()` (`:196`):
  array-of-lines is joined with `\n` and a trailing `\n` appended; an empty array yields `""`.
  **Every `stdout.trim()` at a consumer depends on that trailing-newline normalisation.** <!-- consolidation: unconfirmed; ref: none; reason: Claimed universal newline dependency and nonzero-value contract need verification. -->
- **Rejection** is reserved for programming errors: empty `args`, or a thrown error that is not
  `TmuxCommandError` (propagated untouched — it is *not* wrapped in `TmuxCommandResult`). <!-- consolidation: discard; ref: none; reason: Historical unexpected-error propagation description. -->
- Consequence: `run()` distinguishes three outcomes — success, tmux-error-as-value, and
  host-level throw. Any wrapper replacing it must preserve that three-way split. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#error-handling; reason: Preserve error-channel distinction pending exact extraction approval. -->

### `require()` — `:778-783`

```ts
private async require(args: readonly string[], message: string, options?: TmuxCommandOptions): Promise<void> {
	if (args[0] === "select-pane" || args[0] === "send-keys" || args[0] === "select-window" || args[0] === "set-option")
		this.diag(`require ${JSON.stringify(args)}`);
	const result = await this.run(args, options);
	if (result.exitCode !== 0) throw this.error(message, result);
}
```
<!-- consolidation: discard; ref: none; reason: Historical require implementation excerpt. -->

- Returns `void`; **stdout is discarded** — callers that need output use `run()` directly. <!-- consolidation: discard; ref: none; reason: Historical wrapper return behavior. -->
- Side effect: writes a line to `/tmp/focus.log` via `diag()` (`:880-887`) for
  `select-pane` / `send-keys` / `select-window` / `set-option` **only**. That is a hard-coded
  4-subcommand allowlist; migrating subcommands off `require()` silently kills the log. <!-- consolidation: unconfirmed; ref: none; reason: Diagnostic allowlist necessity and temporary log policy need current disposition. -->
- Failure → `error(message, result)` (`:784-786`) = `` `${message}: ${stderr.trim() || "tmux command failed"}` ``. <!-- consolidation: discard; ref: none; reason: Historical error-format expression. -->

### `command()` — `:773-777`

```ts
private async command(args: readonly string[], message: string) {
	const result = await this.run(args);
	if (result.exitCode !== 0) throw this.error(message, result);
	return result;
}
```
<!-- consolidation: discard; ref: none; reason: Historical command implementation excerpt. -->

- `require()` **plus** the `TmuxCommandResult`. Used exactly once (`:684`). Takes **no** `options`. <!-- consolidation: discard; ref: none; reason: Historical wrapper use and signature inventory. -->
- Both wrappers deliberately do *not* accept a timeout of their own. <!-- consolidation: unconfirmed; ref: none; reason: Wording conflicts with require options timeoutMs and needs source clarification. -->

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
<!-- consolidation: discard; ref: none; reason: Historical generic listPanes adapter excerpt. -->

Two generic passthroughs exist; they are the only argv arrays with no literal subcommand in this file: <!-- consolidation: discard; ref: none; reason: Historical passthrough inventory count. -->

| line | argv | fed by | concrete commands produced |
|---|---|---|---|
| `:657` | `[command, ...args]` | `livePreviewPanes` `:648` → `tmux-pane-lookup.ts` | `list-panes -a -f <filter> -F <PANE_LOOKUP_FORMAT>` <!-- consolidation: discard; ref: none; reason: Historical pane-lookup call mapping. --> |
| `:245` | `[args]` | `collectAbandonedHost` `:241` → `tmux-orphan-sweep.ts` | `list-sessions -F #{session_name}`, `show-options -qv -t <session> <option>` (×2 options), `list-clients -t <name> -F #{client_pid}` <!-- consolidation: discard; ref: none; reason: Historical orphan-sweep call mapping does not authorize cleanup. --> |

**`tmux-pane-lookup.ts` (90 lines)** builds the argv *outside* this file, so grepping
`tmux-workspace.ts` cannot see the `list-panes` invocation. It composes: <!-- consolidation: discard; ref: none; reason: Historical external argv-construction location. -->

- `PANE_LOOKUP_FORMAT` (`:23-31`) — tab-joined: `#{pane_id}`, `#{pane_dead}`, `#{window_id}`,
  `#{@agentic_workspace_root}`, `#{@agentic_workspace_task}`, `#{@agentic_workspace_role}`, `#{pane_title}`. <!-- consolidation: discard; ref: none; reason: Historical lookup format declaration. -->
- `paneFilter()` (`:71-83`) — recursive `#{&&:...}` / `#{==:...}` tmux format expressions;
  `formatLiteral()` (`:89`) escapes `#`, `,`, `}` with `##`, `#,`, `#}`. <!-- consolidation: unconfirmed; ref: none; reason: Preserve embedded-format escaping safeguard pending verification. -->
- `parsePaneLookupRow()` (`:54-69`) — splits on `\t`, requires `%` prefix on paneId. <!-- consolidation: discard; ref: none; reason: Historical parser implementation detail. -->

The filter string is **injected into the filter expression with `rootPath` as a format literal**.
A wrapper that shells out naively, or that re-quotes argv, can corrupt the filter. <!-- consolidation: unconfirmed; ref: none; reason: Retain filter-injection and quoting safeguard pending exact expression verification. -->

---

## 3. Full call-site inventory — 54 rows

Method column: enclosing method on `TmuxWorkspace` (or the module-level function).

| # | line | subcommand + full argv | method | result used how | notes |
|---|---|---|---|---|---|
| 1 | 245 | `[...args]` generic passthrough | `collectAbandonedHost` | forwarded to `findAbandonedWorkspaces` | orphan sweep; `runner.run` signature `Promise<TmuxCommandResult>` <!-- consolidation: discard; ref: none; reason: Historical passthrough inventory. --> |
| 2 | 354-355 | `set-option -w -t <target> automatic-rename off` | `ensureHostUnlocked` | void; throws on failure | loop over `[boardWindow, workspaceWindow]` → **2 executions** <!-- consolidation: discard; ref: none; reason: Historical window-option inventory. --> |
| 3 | 358-359 | `set-option -w -t <target> remain-on-exit on` | `ensureHostUnlocked` | void | same loop, **2 executions**; `remain-on-exit` is what makes panes outlive the client <!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: remain-on-exit concerns process exit and does not alone establish client-independent lifetime. --> |
| 4 | 363 | `rename-window -t <boardWindow> Board` | `ensureHostUnlocked` | void | <!-- consolidation: discard; ref: none; reason: Historical board rename inventory. --> |
| 5 | 365 | `rename-window -t <workspaceWindow> Workspace` | `ensureHostUnlocked` | void | <!-- consolidation: discard; ref: none; reason: Historical workspace rename inventory. --> |
| 6 | 366-367 | `set-option -t <session> key-table <table>` | `ensureHostUnlocked` | void | This key-table name is not generated by current `src/` code. <!-- consolidation: discard; ref: none; reason: Historical key-table source observation. --> |
| 7 | 370-371 | `bind-key -T <table> <prefix> switch-client -T prefix` | `ensureHostUnlocked` | void | re-binds prefix **inside** the table; `prefix()` is read at `:365` order-wise <!-- consolidation: discard; ref: none; reason: Historical prefix binding inventory. --> |
| 8 | 375 | `unbind-key -q -T <table> <key>` | `ensureHostUnlocked` | void | loop over `["C-m","C-i","/"]` → **3 executions** <!-- consolidation: discard; ref: none; reason: Historical unbind loop inventory. --> |
| 9 | 433 | `display-message -p -t <activePane> #{window_id}` | `rebuildTopology` | **read** `exitCode===0 && stdout.trim()===workspace` | `#{}` format read <!-- consolidation: discard; ref: none; reason: Historical topology format read. --> |
| 10 | 441-442 | `swap-pane -d -s <activePane> -t <display>` | `rebuildTopology` | void | `-d` = no focus change <!-- consolidation: discard; ref: none; reason: Historical pane swap inventory. --> |
| 11 | 447 | `kill-window -t <workspace>` | `rebuildTopology` | void | guarded by `windowInSession` <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#observation-stop-and-deletion; reason: Window membership alone needs verification against full owned-resource provenance. --> |
| 12 | 496 | `rename-window -t <window> Workspace` | `rebuildTopology` | void | <!-- consolidation: discard; ref: none; reason: Historical topology rename inventory. --> |
| 13 | 497-498 | `set-option -w -t <window> remain-on-exit on` | `rebuildTopology` | void | <!-- consolidation: discard; ref: none; reason: Historical remain-on-exit option inventory. --> |
| 14 | 502 | `unbind-key -q -T <table> <key>` | `rebuildTopology` | void | loop, **3 executions**; idempotent cleanup <!-- consolidation: unconfirmed; ref: none; reason: Preserve repeated-cleanup quiet-flag safeguard pending verification. --> |
| 15 | 535 | `swap-pane -d -s <source> -t <target>` | `swapPanes` | void | early-returns if `source===target` <!-- consolidation: discard; ref: none; reason: Historical self-swap short-circuit inventory. --> |
| 16 | 557 | `capture-pane -p -S -<20> -t <pane>` | `requireLivePane` | **read** `stdout.trim()` into the thrown error message | tail of last 20 lines <!-- consolidation: discard; ref: none; reason: Historical diagnostic capture inventory. --> |
| 17 | 587 | `display-message -p -t <pane> #{window_id}` | `nameShellPane` | **read** `.stdout.trim()` | 🔴 focus-critical sequence, step 1 <!-- consolidation: unconfirmed; ref: none; reason: Preserve focus ordering claim pending current tmux verification. --> |
| 18 | 588 | `display-message -p -t <window> #{pane_id}` | `nameShellPane` | **read** `.stdout.trim()` | 🔴 focus-critical, step 2 (window's active pane) <!-- consolidation: unconfirmed; ref: none; reason: Preserve captured-focus dependency pending verification. --> |
| 19 | 589 | `select-pane -t <pane> -T <name>` | `nameShellPane` | void | 🔴 focus-critical, step 3 — **`-T` activates as a side effect** <!-- consolidation: unconfirmed; ref: none; reason: Claimed title-setting activation side effect needs actual tmux verification. --> |
| 20 | 590 | `select-pane -t <active>` | `nameShellPane` | void, exitCode ignored | 🔴 focus-critical, step 4 — restores focus; `run()` not `require()` so restore can never throw <!-- consolidation: unconfirmed; ref: none; reason: Never-throw claim conflicts with documented host-error rejection. --> |
| 21 | 600-601 | `respawn-pane -k -t <pane> -c <rootPath> <workspaceCommand>` | `launchUi` | void | command string built by `workspaceCommand()` `:180`; `-k` kills the existing process <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#observation-stop-and-deletion; reason: Destructive UI respawn requires exact role and owned-pane evidence. --> |
| 22 | 606-617 | `bind-key -T <table> C-q if-shell -F '#{==:#{window_id},<wsWindow>}' 'if-shell -F '\''#{window_zoomed_flag}'\'' '\''resize-pane -Z; select-pane -t <tasksPane>'\'' '\''select-pane -t <tasksPane>'\''' ''` | `bindReturnKey` | void | nested tmux-in-tmux: **`resize-pane -Z` appears inside the bound command string too** <!-- consolidation: discard; ref: none; reason: Historical nested key-binding inventory. --> |
| 23 | 622 | `select-window -t <window>` | `selectWindow` | void | <!-- consolidation: discard; ref: none; reason: Historical window selection inventory. --> |
| 24 | 625-631 | `display-message -p -t <WORKSPACE_WINDOW> #{window_zoomed_flag}` | `zoomed` | **read** `exitCode===0 && stdout.trim()==="1"` | 🔴 **raced against by `resize-pane -Z` at `:865`/`:868`** <!-- consolidation: unconfirmed; ref: none; reason: Preserve cross-process zoom race finding pending verification. --> |
| 25 | 657 | `[command, ...args]` generic passthrough | `listPanes` | **read** `exitCode`, regex `/no server running/i` on stderr, else `stdout.split("\n")` | feeds `tmux-pane-lookup.ts` `list-panes` <!-- consolidation: discard; ref: none; reason: Historical lookup adapter inventory. --> |
| 26 | 665 | `display-message -p -t <pane> #{pane_id}` | `paneExists` | **read** `exitCode===0 && stdout.trim()===pane` | `#{}` read <!-- consolidation: discard; ref: none; reason: Historical pane existence probe. --> |
| 27 | 669 | `display-message -p -t <pane> #{pane_id} #{pane_dead}` | `paneLive` | **read** `exitCode`, then `split(/\s+/)` → `id` + `dead` | two-field format; whitespace split, not fixed index <!-- consolidation: discard; ref: none; reason: Historical two-field liveness parser inventory. --> |
| 28 | 675 | `show-options -gv prefix` | `prefix` | **read** `exitCode===0 && stdout.trim()`; falls back `"C-b"` | `-g` global <!-- consolidation: discard; ref: none; reason: Historical prefix fallback inventory. --> |
| 29 | 684-685 | `list-windows -t <session> -F #{window_id}` | `windowInSession` | **read** `stdout.split("\n")`, `some(trim()===window)` | via `command()`; `#{}` read <!-- consolidation: discard; ref: none; reason: Historical window membership inventory. --> |
| 30 | 699 | `show-options -qv -t <session> <key>` | `option` | **read** `exitCode===0 && stdout.trim()` → string\|undefined | `-qv` = quiet+value; **non-zero is not an error, means "unset"** <!-- consolidation: unconfirmed; ref: none; reason: Blanket failure-as-unset claim needs absent-option versus transport-error verification. --> |
| 31 | 711 | `set-option -t <session> <key> <value>` | `set` | void | no `-q`; every state write goes through here <!-- consolidation: discard; ref: none; reason: Historical option writer inventory. --> |
| 32 | 714 | `set-option -qu -t <session> <key>` | `unset` | void | 🔴 **`-qu` quiet: without it, unsetting an already-unset option throws** <!-- consolidation: unconfirmed; ref: none; reason: Preserve repeat-safe unset safeguard pending verification. --> |
| 33 | 722 | `display-message -p -t <pane> #{pane_height}` | `resizeRegion` | **read** `Number(stdout.trim())` | `#{}` read; only reached when the option disagrees <!-- consolidation: discard; ref: none; reason: Historical height-read inventory. --> |
| 34 | 726 | `resize-pane -t <pane> -y <rows>` | `resizeRegion` | void | message is caller-supplied <!-- consolidation: discard; ref: none; reason: Historical height-write inventory. --> |
| 35 | 832 | `select-pane -t <BOARD_PANE>` | `showBoard` | void | must run **after** `selectWindow` <!-- consolidation: unconfirmed; ref: none; reason: Preserve window-before-pane focus ordering pending verification. --> |
| 36 | 839-840 | `select-pane -t <await liveUiPane(TASKS_PANE)>` | `showWorkspace` | void | 🔴 **claims task-pane focus immediately after `select-window`, BEFORE revalidating footer/nav/details** <!-- consolidation: unconfirmed; ref: none; reason: Preserve early focus handoff ordering pending current topology verification. --> |
| 37 | 865 | `resize-pane -Z -t <active>` | `focusAgent` | void | 🔴 **unzoom toggle, gated by `zoomed()` read at `:625`**; bare atomic toggle <!-- consolidation: unconfirmed; ref: none; reason: Preserve atomic-toggle and observation ordering safeguard pending verification. --> |
| 38 | 866 | `select-pane -t <active>` | `focusAgent` | void | sits between the unzoom and zoom toggles <!-- consolidation: discard; ref: none; reason: Historical focus sequence inventory. --> |
| 39 | 868 | `resize-pane -Z -t <active>` | `focusAgent` | void | 🔴 **zoom toggle, gated by a second `zoomed()` read** <!-- consolidation: unconfirmed; ref: none; reason: Preserve second observation and toggle sequencing pending verification. --> |
| 40 | 874 | `select-pane -t <pane>` | `focusSearch` | **read** `exitCode` → logged to `/tmp/focus.log` | `run()` not `require()`; failure tolerated <!-- consolidation: discard; ref: none; reason: Historical best-effort focus diagnostic inventory. --> |
| 41 | 876 | `send-keys -t <pane> /` | `focusSearch` | **read** `exitCode` → logged | 🔴 **argv is bare — DO NOT add Enter or `-l`.** See §2.2 of `tmux-layer-spec.md` <!-- consolidation: unconfirmed; ref: none; reason: Preserve exact search-key semantics pending library and CLI verification. --> |
| 42 | 889 | `select-pane -t <TASKS_PANE>` | `focusTasks` | void | <!-- consolidation: discard; ref: none; reason: Historical task-focus inventory. --> |
| 43 | 893 | `select-pane -t <DETAILS_PANE>` | `focusDetails` | void | <!-- consolidation: discard; ref: none; reason: Historical details-focus inventory. --> |
| 44 | 901 | `display-message -p -t <details> #{pane_height}` | `setDetailsVisible` | **read** `Number(stdout.trim())` | `#{}` read <!-- consolidation: discard; ref: none; reason: Historical details-height inventory. --> |
| 45 | 902 | `display-message -p -t <display> #{pane_height}` | `setDetailsVisible` | **read** `Number(stdout.trim())` | `#{}` read <!-- consolidation: discard; ref: none; reason: Historical display-height inventory. --> |
| 46 | 908 | `resize-pane -t <details> -y <rows>` | `setDetailsVisible` | void | ratio of 44 % of details+display height <!-- consolidation: discard; ref: docs/screens/workspace.md#ordered-regions; reason: Old 44-percent detail sizing is superseded by approved roughly 30-percent layout. --> |
| 47 | 925-933 | `if-shell -t <session> -F '#{==:#{<MAILBOX>},<request>}}' "set-option -t <session> <MAILBOX> ''"` | `takeTaskRequest` | void | compare-and-clear is **atomic inside tmux**; `request` is regex-validated `/^[A-Za-z0-9][A-Za-z0-9_.-]*$/` at `:922` specifically because it is interpolated into format syntax <!-- consolidation: unconfirmed; ref: none; reason: Preserve request interpolation validation and compare-clear atomicity pending exact syntax verification. --> |
| 48 | 962 | `wait-for -S <channel>` | `updateWorkspaceState` | void | one invocation per listener — tmux has no chaining and `wait-for` takes a single channel <!-- consolidation: unconfirmed; ref: none; reason: Claimed no-chaining limitation needs tmux verification before API design. --> |
| 49 | 1002 | `wait-for <channel>` | `subscribeWorkspaceState` | void | long-poll loop <!-- consolidation: discard; ref: none; reason: Historical subscription wait inventory. --> |
| 50 | 1018 | `wait-for -S <channel>` | `subscribeWorkspaceState` | void | teardown signal <!-- consolidation: discard; ref: none; reason: Historical subscription teardown inventory. --> |
| 51 | 1029 | `switch-client -l` | `detach` | void | only when `process.env.TMUX` is set <!-- consolidation: discard; ref: none; reason: Historical inside-tmux detach inventory. --> |
| 52 | 1030 | `detach-client -t <session>` | `detach` | void | else-branch <!-- consolidation: discard; ref: none; reason: Historical external-client detach inventory. --> |
| 53 | 1053 | `list-panes -s -t <session> -F #{pane_pid}` | `killPaneProcessTrees` | **read** `exitCode !== 0 → return` (silent), else split pids | 🔴 **format read**; `-s` = all panes in session <!-- consolidation: discard; ref: docs/BLUEPRINT.md#observation-stop-and-deletion; reason: Silent probe failure cannot prove no cleanup targets. --> |
| 54 | 1089 | `kill-session -t <session>` | `killSessionIfPresent` | **read** `exitCode===0 \|\| SESSION_ABSENT.test(stderr.toLowerCase())` | 🔴 **`SESSION_ABSENT` = `/can't find session\|no server running\|error connecting/` (`:69`)** <!-- consolidation: discard; ref: docs/BLUEPRINT.md#observation-stop-and-deletion; reason: Transport-error-as-absence conflicts with current cleanup contract. --> |

### Out-of-band (not via `run()`/`require()`)

| line | argv | site | notes |
|---|---|---|---|
| 223-228 | `tmux switch-client -t <session>` then `tmux attach-session -t <session>` | `attachWorkspaceClient` (`:218`) | `Bun.spawn`, inherits stdio; falls through to the second command on non-zero exit; throws only if both fail <!-- consolidation: unconfirmed; ref: none; reason: Two-command fallback conflicts with proposed combined switch-client attach-session argv. --> |
| 823 | `tmux <switch-client\|attach-session> -t <session>` | `attachClient` (`:819`) | `process.env.TMUX ? "switch-client" : "attach-session"`; **awaits exit code and throws** — the interactive hand-off <!-- consolidation: discard; ref: none; reason: Historical interactive handover inventory. --> |

Library-mediated (no argv in this file, but they are tmux operations and must be modelled by the
wrapper): `tmux.newSession` `:271`, `session.newWindow` `:404`, `pane.split` `:415`,
`tmux.hasSession` `:258`, `tmux.sessions()` `:428`, `tmux.panes()` `:432`, and `tmux.cmd` `:762`. <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#component-ownership; reason: Requirement to model library-mediated operations conflicts with raw-argv-only proposal boundary. -->

---

## 4. Completeness check

**Total rows: 54** (52 concrete argv arrays + 2 generic passthroughs). <!-- consolidation: unconfirmed; ref: none; reason: Concrete-array count contradicts earlier subtraction to 50. -->

Per-subcommand tally, summing to 54: <!-- consolidation: discard; ref: none; reason: Historical table-row tally is not exhaustive current-source verification. -->

| subcommand | count | lines |
|---|---|---|
| `display-message -p` | 9 | 433, 587, 588, 625, 665, 669, 722, 901, 902 <!-- consolidation: discard; ref: none; reason: Historical display-message count. --> |
| `select-pane` | 8 | 589, 590, 832, 839, 866, 874, 889, 893 <!-- consolidation: discard; ref: none; reason: Historical pane-selection count. --> |
| `set-option` | 6 | 354, 358, 366, 497, 711, 714 <!-- consolidation: discard; ref: none; reason: Historical option-write count. --> |
| `resize-pane` | 4 | 726, 865, 868, 908 <!-- consolidation: discard; ref: none; reason: Historical resize count. --> |
| `rename-window` | 3 | 363, 365, 496 <!-- consolidation: discard; ref: none; reason: Historical rename count. --> |
| `wait-for` | 3 | 962, 1002, 1018 <!-- consolidation: discard; ref: none; reason: Historical channel count. --> |
| `<generic-passthrough>` | 2 | 245, 657 <!-- consolidation: discard; ref: none; reason: Historical passthrough count. --> |
| `bind-key` | 2 | 370, 606 <!-- consolidation: discard; ref: none; reason: Historical key-binding count. --> |
| `show-options` | 2 | 675, 699 <!-- consolidation: discard; ref: none; reason: Historical option-read count. --> |
| `swap-pane` | 2 | 441, 535 <!-- consolidation: discard; ref: none; reason: Historical swap count. --> |
| `unbind-key` | 2 | 375, 502 <!-- consolidation: discard; ref: none; reason: Historical unbind count. --> |
| `capture-pane` | 1 | 557 <!-- consolidation: discard; ref: none; reason: Historical capture count. --> |
| `detach-client` | 1 | 1030 <!-- consolidation: discard; ref: none; reason: Historical detach count. --> |
| `if-shell` | 1 | 925 <!-- consolidation: discard; ref: none; reason: Historical conditional-command count. --> |
| `kill-session` | 1 | 1089 <!-- consolidation: discard; ref: none; reason: Historical session-kill count. --> |
| `kill-window` | 1 | 447 <!-- consolidation: discard; ref: none; reason: Historical window-kill count. --> |
| `list-panes` | 1 | 1053 <!-- consolidation: discard; ref: none; reason: Historical pane-list count. --> |
| `list-windows` | 1 | 684 <!-- consolidation: discard; ref: none; reason: Historical window-list count. --> |
| `respawn-pane` | 1 | 600 <!-- consolidation: discard; ref: none; reason: Historical respawn count. --> |
| `select-window` | 1 | 622 <!-- consolidation: discard; ref: none; reason: Historical window-selection count. --> |
| `send-keys` | 1 | 876 <!-- consolidation: discard; ref: none; reason: Historical key-send count. --> |
| `switch-client` | 1 | 1029 <!-- consolidation: discard; ref: none; reason: Historical switch count. --> |
| **sum** | **54** | <!-- consolidation: discard; ref: none; reason: Historical inventory table total. --> |

Plus 2 `Bun.spawn` arrays (`:223`, `:823`) → **56 total tmux invocations in the file.** <!-- consolidation: unconfirmed; ref: none; reason: Invocation total conflicts with 52 concrete count and includes generic passthroughs. -->

Runtime execution count is higher than 56 because rows 2, 3, 8, 14 sit in loops
(2 + 2 + 3 + 3 = 10 executions from 4 argv templates). <!-- consolidation: discard; ref: none; reason: Historical loop-versus-template count explanation. -->

---

## 5. 🔴 Critical behaviour — must not change during migration
<!-- consolidation: unconfirmed; ref: none; reason: Preservation constraints need approved-behavior reconciliation and cannot freeze unsafe source behavior. -->

### A. `exitCode` + stderr-regex sites (7)

| line | test |
|---|---|
| `:657` | `listed.exitCode !== 0` → `/no server running/i.test(listed.stderr)` → `return []`, else throw <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#observation-stop-and-deletion; reason: Exact no-server classifier needs verification. --> |
| `:665` | `paneExists`: `exitCode === 0 && stdout.trim() === pane` <!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#sessions; reason: Failure-as-false must not be interpreted as conclusive absence. --> |
| `:669` | `paneLive`: `exitCode !== 0` → false; then `split(/\s+/)` <!-- consolidation: discard; ref: docs/specs/sessions.md#sessions; reason: Failed liveness query must remain unknown rather than stopped. --> |
| `:675` | `prefix`: `exitCode === 0 && stdout.trim()` truthy, else `"C-b"` <!-- consolidation: unconfirmed; ref: none; reason: Proposed prefix fallback needs policy disposition. --> |
| `:699` | `option`: `exitCode === 0 && stdout.trim()` else `undefined` <!-- consolidation: unconfirmed; ref: none; reason: Failed query and missing option need distinction verification. --> |
| `:1053` | `killPaneProcessTrees`: `exitCode !== 0` → **silent return**, no throw <!-- consolidation: discard; ref: docs/CONVENTIONS.md#error-handling; reason: Cleanup failures must not be silently swallowed. --> |
| `:1090` (`kill-session` at `:1089`) | `exitCode === 0 \|\| SESSION_ABSENT.test(stderr.toLowerCase())` → treat as done <!-- consolidation: discard; ref: docs/BLUEPRINT.md#observation-stop-and-deletion; reason: error connecting cannot establish absence or successful cleanup. --> |

Also exit-code-sensitive: `:433` (`exitCode === 0` before comparing `#{window_id}`),
`:625` (`zoomed`, requires `exitCode === 0` **and** `"1"` — a failed read must read as *not zoomed*,
which makes `:868` attempt a zoom toggle that tmux then treats as an unzoom). <!-- consolidation: unconfirmed; ref: none; reason: Failed zoom-read fallback and resulting toggle behavior need verification before preserving. -->

`SESSION_ABSENT` is defined at `:69`:
```ts
const SESSION_ABSENT = /can't find session|no server running|error connecting/;
```
<!-- consolidation: discard; ref: docs/BLUEPRINT.md#observation-stop-and-deletion; reason: Broad historical regex incorrectly includes transport failure as absence. -->
Any wrapper that surfaces stderr differently (e.g. merging into stdout, or trimming the
"error connecting" prefix) breaks teardown. <!-- consolidation: discard; ref: docs/BLUEPRINT.md#observation-stop-and-deletion; reason: Current teardown must report transport errors rather than preserve swallowed failure behavior. -->

### B. `#{...}` format-string reads (10)

`display-message -p` × 9 — `:433` `#{window_id}`, `:587` `#{window_id}`, `:588` `#{pane_id}`,
`:625` `#{window_zoomed_flag}`, `:665` `#{pane_id}`, `:669` `#{pane_id} #{pane_dead}`,
`:722` `#{pane_height}`, `:901` `#{pane_height}`, `:902` `#{pane_height}`.
Plus `list-panes -s -F #{pane_pid}` at `:1053`. <!-- consolidation: discard; ref: none; reason: Historical format-read inventory. -->

Format strings are also **embedded inside command arguments** at `:606` (`#{==:#{window_id},...}`,
`#{window_zoomed_flag}`), `:925` (`#{==:#{...},<request>}}`), and built externally in
`tmux-pane-lookup.ts`. A wrapper that re-quotes or escapes `#`, `,`, `}`, `'` or `;` will
corrupt them. <!-- consolidation: unconfirmed; ref: none; reason: Preserve embedded-command and format-escaping safeguard pending exact boundary verification. -->

### C. `send-keys` — `:876`

`["send-keys", "-t", pane, "/"]`. The `/` must stay a **bare literal argument**: no `-l`, no trailing
`Enter` argv element. tmux — not this layer — decides whether Enter is sent. <!-- consolidation: unconfirmed; ref: none; reason: Bare key semantics require verification without silently adding Enter. -->

> ⚠️ **DO NOT** route this through libtmux's `sendKeys()` and **DO NOT** add an `enter`/`literal`
> option. **libtmux's `sendKeys()` appends Enter by default; the tmux CLI does not.** An earlier
> draft conflated the wrapper's semantics with the CLI's and specified
> `sendKeys(pane, "/", { enter: false, literal: true })`. Implemented as written, `focusSearch()`
> would send `/` with a carriage return, the footer search box would never activate, and the
> regression would only surface by hand. Adding an explicit Enter flag here has the same effect. <!-- consolidation: unconfirmed; ref: none; reason: Claimed carriage-return result contradicts enter-false example and companion spec rationale. -->

Failure is tolerated (`run()`, result only logged to `/tmp/focus.log`). <!-- consolidation: unconfirmed; ref: none; reason: Search-key delivery failure tolerance requires current interaction policy verification. -->

### D. `resize-pane -Z` — `:865`, `:868` (+ inside the bound string at `:606`)

Both are **bare atomic toggles**, never a read-then-set. The guards are `zoomed()` reads at
`:625`, and the sequence is: <!-- consolidation: unconfirmed; ref: none; reason: Preserve atomic-toggle sequence pending source and tmux verification. -->

```
if (!zoom  && zoomed()) resize-pane -Z   // :864-865  unzoom
select-pane -t active                    // :866
if ( zoom  && !zoomed()) resize-pane -Z  // :867-868  zoom
```
<!-- consolidation: discard; ref: none; reason: Historical focusAgent sequence example. -->

Converting either to `if (zoomed()) resize-pane -Z` elsewhere, or moving the `zoomed()` read
inside a wrapper that adds its own tmux round-trip, widens the race with a user pressing `C-q`
(the `:606` binding also toggles `-Z`). **The read at `:625` and the toggle must stay adjacent
in one call frame.** <!-- consolidation: unconfirmed; ref: none; reason: Preserve no-extra-round-trip race safeguard pending current implementation verification. -->

### E. Quiet flags — `:375`, `:502`, `:714`

`unbind-key -q` (×2 templates, 3 keys each) and `set-option -qu`. Both are **idempotent cleanup**:
dropping `-q`/`-qu` makes `unbind-key` fail on a key that was never bound and `set-option` fail on
an option that was never set. `:502` runs on the `rebuildTopology` path, which is exactly the
already-partial-workspace case where these are missing. `:699` (`show-options -qv`) is the same
family — non-zero means "unset", not "error". <!-- consolidation: unconfirmed; ref: none; reason: Quiet cleanup semantics need verification and blanket failure-as-unset is not established. -->

### F. 🔴 `nameShellPane` focus sequence — `:584-591`

```ts
const window = (await this.run(["display-message", "-p", "-t", pane, "#{window_id}"])).stdout.trim();
const active = window ? (await this.run(["display-message", "-p", "-t", window, "#{pane_id}"])).stdout.trim() : "";
await this.require(["select-pane", "-t", pane, "-T", SHELL_PANES[key].name], "Could not name workspace pane");
if (active && active !== pane) await this.run(["select-pane", "-t", active]);
```
<!-- consolidation: discard; ref: none; reason: Historical nameShellPane focus workaround excerpt. -->

tmux has no "rename pane without activating"; `select-pane -T` **activates its target**. So the
window's active pane is captured first, renamed, then restored. This is a fixed, unavoidable
race window between `:589` and `:590`. <!-- consolidation: unconfirmed; ref: none; reason: Claimed unavoidable title activation and race require actual tmux verification. --> Ordering constraints:

1. The two `display-message` reads must precede `:589` (the pane's window may not be known
   otherwise, and the window's active pane changes at `:589`). <!-- consolidation: unconfirmed; ref: none; reason: Preserve capture-before-title ordering pending activation-side-effect verification. -->
2. `:590` uses `run()`, **not** `require()` — focus restoration must never throw. <!-- consolidation: unconfirmed; ref: none; reason: Never-throw constraint conflicts with run host-level errors. -->
3. The `active !== pane` guard prevents a redundant activate-then-deactivate flicker. <!-- consolidation: unconfirmed; ref: none; reason: Claimed self-selection flicker and guard need verification. -->
4. `nameShellPane` is called from `ensureShellPane` (`:539`, `:543`) *and* unconditionally at
   `:341-347` during bootstrap. A wrapper that "batches" or "coalesces" these calls collapses
   the race. <!-- consolidation: unconfirmed; ref: none; reason: Batching effect on focus race is asserted without current verification. -->

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
<!-- consolidation: discard; ref: none; reason: Historical showWorkspace implementation excerpt. -->

Note `await this.liveUiPane(...)` is **inside** the argv array at `:839-840` — the pane is
resolved *and respawned and liveness-verified* before the `select-pane` runs. Focus is claimed
**before** the remaining three regions are revalidated, so a concurrent key press arriving
mid-handoff is not undone by the work that follows. `liveUiPane` (`:540-546`) itself is
`ensureShellPane` → `respawnUi` → `requireLivePane`, so it can `throw`. Reordering, or making
`:839` lazy, breaks the guarantee. <!-- consolidation: unconfirmed; ref: none; reason: Preserve awaited live-pane and early-focus ordering pending current handoff verification. --> `showBoard` (`:828-833`) has the same shape at `:832`. <!-- consolidation: discard; ref: none; reason: Historical equivalent board call-site observation. -->

---

## 6. Migration hazards not covered by the subcommand list

- **`diag()` allowlist** at `:779-780` — only `select-pane` / `send-keys` /
  `select-window` / `set-option` are traced. Preserved only if those four keep flowing through
  the same wrapper. <!-- consolidation: unconfirmed; ref: none; reason: Diagnostic allowlist preservation needs current logging disposition. -->
- **Ordering inside `ensureHostUnlocked`** (`:256-354`): all `set()` writes (rows 31) must
  complete before any `nameShellPane` (`:341-347`), because `ensureShellPane`/`zoomed` read those
  options back. <!-- consolidation: unconfirmed; ref: none; reason: Preserve write-before-read bootstrap ordering pending exact source verification. --> `OWNER_PID` is published at `:280` *before* any pane exists. <!-- consolidation: discard; ref: none; reason: Historical PID publication order does not establish runtime ownership. -->
- **`run()`'s three-way outcome** (§1) — `throw` vs returned non-zero are treated differently at
  `:1053` (silent return) and `:590` (ignored). <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#error-handling; reason: Preserve error-channel distinction without approving swallowed cleanup failures. -->
- **`TmuxCommandOptions.timeoutMs` is accepted but never used** at any of the 54 call sites.
  If the wrapper introduces a default timeout, rows 47/48/49/50 (`if-shell`, `wait-for`)
  are the ones that would change behaviour. <!-- consolidation: unconfirmed; ref: none; reason: Preserve no-invented-timeout constraint until wait and subscription lifetimes are verified. -->
- **`takeTaskRequest`'s regex guard at `:922`** exists solely because `:926` interpolates
  `request` into tmux format syntax. Move the check and you re-open format injection. <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport; reason: Retain request-format validation safety gate pending exact escaping and call-site verification. -->
