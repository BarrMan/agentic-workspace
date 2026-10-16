---
consolidation:
  total: 183
  counts:
    exists: 0
    discard: 17
    integrate: 0
    unconfirmed: 166
  percentages:
    exists: 0.00%
    discard: 9.29%
    integrate: 0.00%
    unconfirmed: 90.71%
---
# tmux Abstraction Layer — API Spec

**Status:** spec only. No implementation exists or is authorised by this document. <!-- consolidation: unconfirmed; ref: docs/adr/README.md#record-and-approval-process; reason: Proposed extraction has no implementation authorization or architecture approval. -->
**Scope:** encapsulate the raw tmux CLI call sites in `src/agent-workspace/tmux-workspace.ts`
behind a libtmux-styled API surface. <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: Exact new wrapper boundary is an unapproved proposal. -->

**Verified count:** an exhaustive read of the source finds **54 call sites → 50 concrete argv
arrays, plus 2 `Bun.spawn` tmux arrays (`:223`, `:823`) = 56 tmux invocations**. The earlier grep
figure of ~45 was an **undercount**: multi-line argv arrays put `[` on the line *after* the call,
so a single-line grep for `run(`/`require(` missed them, and `attach-session` never touches
`run()` at all. <!-- consolidation: unconfirmed; ref: none; reason: Claimed 54 sites versus 50 arrays plus 2 spawns does not establish 56 concrete invocations and conflicts with companion inventory. --> Any index below that reports a site count should use 56. <!-- consolidation: unconfirmed; ref: none; reason: Site versus concrete-array counting must be reconciled before reuse. -->

---

## 0. Non-goals and the load-bearing constraint

### This layer wraps RAW ARGV, not libtmux.
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#launch-context-and-terminal-transport; reason: Raw-argv wrapper strategy is proposed rather than accepted. -->

`libtmux@0.1.0-alpha.12` is already a dependency and is already used for the object-graph sites
(`hasSession`, `newSession`, `sessions()`, `panes()`, `newWindow`, `split`). <!-- consolidation: discard; ref: none; reason: Historical dependency and object-graph inventory. --> Those sites stay as they are. <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: Proposed extraction boundary needs approval. -->

Every site that currently shells out through `this.run([...])` / `this.require([...])` must keep
shelling out the *same* argv. The audit found three libtmux behaviours that make wrapping the raw
sites over libtmux a behaviour change, not a refactor: <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Blanket byte-identical argv preservation needs current behavior approval and source verification. -->

1. **`literalFormat()` rewrites `#` → `##`.** All nine `display-message -p` sites read formats
   containing `#{...}`. Passing them through `literalFormat()` corrupts every one of them. <!-- consolidation: unconfirmed; ref: none; reason: Preserve raw-format corruption finding pending exact library and call-site verification. -->
2. **libtmux throws `TmuxCommandError` where current code needs the exit code.** `run()` currently
   catches `TmuxCommandError` and converts it into a `{ exitCode, stdout, stderr }` value; six call
   sites branch on `exitCode !== 0` instead of catching. A throwing layer forces those branches to
   become try/catch and loses the value-form contract. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#error-handling-and-cleanup; reason: Exact wrapper result-versus-exception behavior needs verification and proposal disposition. -->
3. **Flag passthrough is not neutral.** `-q`, `-qu`, `-Z`, `-l`, `-F`, `-p`, `-g` are load-bearing
   (§1–§5). Any layer that "normalises" flags changes runtime behaviour. <!-- consolidation: unconfirmed; ref: none; reason: Preserve flag-semantics safeguard pending current call-site verification. -->

So: **the layer's only job is to make argv construction legible and testable. It must not change a
single emitted argv.** <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: No-op extraction constraint does not approve obsolete runtime behavior. -->

### What "libtmux naming style" means here

Verb-first method names in the order libtmux uses (`newSession`, `killWindow`, `selectPane`,
`displayMessage`, `sendKeys`), an options object as the trailing argument **only where the method
genuinely has options** — never to reintroduce a defaulted flag that has no call site (§2.2) — and a
typed `Result` return instead of an exception for anything the current code branches on. It does **not** mean
importing libtmux types beyond `PaneDirection` / `SplitOptions` / `NewWindowOptions`, which are
already imported by the call sites. <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: Proposed naming options and imported-type boundary have no approval. -->

---

## 1. Module layout

Split by tmux object domain so parallel workers can own one file each with no write contention. <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: Worker-driven module layout is proposed not accepted architecture. -->
Every module is a pure factory over an injected exec surface — no module imports another module's
state, and only `types.ts` and `exec.ts` are shared dependencies. <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: Factory and shared-module shape needs approval and conflicts with later pane-lookup dependency. -->

```
src/agent-workspace/tmux/
  types.ts                 shared types only — 0 methods
  exec.ts                  argv execution + result shape — 3 methods
  server-session.ts        server + session object domain — 6 methods
  window.ts                window object domain — 4 methods
  pane.ts                  pane object domain — 9 methods
  options.ts               option (get/set) domain — 5 methods
  signals-keys.ts          key tables, send-keys, process signalling — 6 methods
  channels.ts              wait-for channels — 2 methods
  client.ts                client attachment — 4 methods
```
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: Proposed types.ts shared declarations require ownership review. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: Proposed exec.ts execution boundary requires approval. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: Proposed server-session.ts module requires approval. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: Proposed window.ts module requires approval. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: Proposed pane.ts module requires approval. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: Proposed options.ts module requires approval. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: Proposed signals-keys.ts mixes terminal commands and process effects without approved ownership. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: Proposed channels.ts module requires approval. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: Proposed client.ts module requires approval. -->

Total: **39 public methods** across 9 files. <!-- consolidation: unconfirmed; ref: none; reason: Proposed count conflicts with four listed options signatures and absent display-message signature. -->

`tmux-workspace.ts` keeps everything that is *workspace* logic (bootstrap, topology rebuild, live
preview placement, state locking, termination handling) and calls this layer for argv. The
`TmuxWorkspaceServer` interface, `TmuxCommandResult`, `SESSION_ABSENT` regex and `tmux-pane-lookup.ts`
stay where they are; the layer imports the types, not the reverse. <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#component-ownership; reason: Workspace responsibilities and import direction are unapproved and SESSION_ABSENT placement conflicts with section 2.4. -->

### Dependency graph

```
types.ts   ←── exec.ts ←── { server-session, window, pane, options, signals-keys, channels, client }
   ↑                        ↑
   └────────────────────────┴── pane.ts ──→ tmux-pane-lookup.ts (cmd adapter, §6.4)
```
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: Proposed module dependency graph needs consistency and ownership review. -->

No cycles. `options.ts` depends on `types.ts` only (it never re-enters `exec.ts` — the caller
decides throw-vs-return, which is what §1.4 requires). <!-- consolidation: unconfirmed; ref: none; reason: Claimed dependency and throw ownership reference nonexistent section 1.4 and conflict with option execution methods. -->

---

## 2. Locked-in behaviours

These five are the silent-corruption risks. Each is restated as a hard requirement on the argv in
§3. An implementation that changes any of them is wrong even if the tests pass. <!-- consolidation: unconfirmed; ref: docs/SPEC.md#authority; reason: Historical code preservation constraints require validation against approved behavior before becoming acceptance. -->

### 2.1 Quiet flags are preserved

| argv | why the flag is mandatory |
|---|---|
| `unbind-key -q -T <table> <key>` | without `-q`, unbinding a key that was never bound exits non-zero → `require` throws → idempotent cleanup (`rebuildTopology`, `ensureHostUnlocked`) fails on a workspace that is already clean. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#error-handling-and-cleanup; reason: Preserve repeated-cleanup quiet-flag safeguard pending tmux behavior verification. --> |
| `set-option -qu -t <session> <key>` | without `-q`, unsetting an absent option exits non-zero → `throw`. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#error-handling-and-cleanup; reason: Preserve absent-option cleanup safeguard pending verification. --> |

`-q` is present at **four** argv sites (`set-option -qu` at `:845`; `unbind-key -q` at `:389` and
`:441`, each looping `["C-m","C-i","/"]`). It is a *silent* flag: the tests pass either way on a
dirty workspace and only fail on the second run. <!-- consolidation: unconfirmed; ref: none; reason: Claimed four sites lists three templates and needs count and repeat-run verification. -->

### 2.2 `send-keys` is bare — DO NOT add Enter or `-l`
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#runningexecution-interaction-contract; reason: Bare search-key routing is a proposed exact argv safeguard needing verification. -->

`focusSearch` (`:876`) is the **single call site** of the send-keys path. It sends the `/` keypress
to focus the footer's search box, and its argv is bare — verified at `tmux-workspace.ts:876`: <!-- consolidation: discard; ref: none; reason: Historical focusSearch call-site inventory. -->

```ts
const send = await this.run(["send-keys", "-t", pane, "/"]);
```
<!-- consolidation: discard; ref: none; reason: Historical source example retained as evidence. -->

This matches the CLI invocation exactly:

```
send-keys -t <pane> /
```
<!-- consolidation: unconfirmed; ref: none; reason: Claimed equivalent CLI invocation needs current tmux semantics verification. -->

There is no `-l` flag and no trailing `Enter` key argument. It relies on tmux's own `send-keys`
default behaviour. <!-- consolidation: unconfirmed; ref: none; reason: Preserve no-added-Enter distinction pending library and CLI comparison. -->

> **DO NOT** route this through libtmux's `sendKeys()`, and **DO NOT** add an `enter`/`literal`
> parameter to the layer's method. <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: Exact wrapper API prohibition is part of an unapproved extraction. -->
>
> **Why:** libtmux's `sendKeys()` **appends Enter by default**; the tmux CLI does not. An earlier
> draft of this spec conflated the library wrapper's semantics with the CLI's and specified
> `sendKeys(pane, "/", { enter: false, literal: true })`. Implemented as written, `focusSearch()`
> would send `/` with no carriage return, the footer search box would never activate, and the
> regression would only surface by hand. The bare form is correct precisely because tmux, not the
> layer, decides whether Enter is sent. <!-- consolidation: unconfirmed; ref: none; reason: Rationale contradicts companion inventory about carriage return and needs actual key behavior verification. -->

The other two `send-keys` mentions in the tree (`:374`, `:501`) are **not** send-keys invocations —
they are key-table arrays `["C-m","C-i","/"]` inside unbind-key loops. <!-- consolidation: discard; ref: none; reason: Historical grep-hit classification. -->

### 2.3 `resize-pane -Z` stays a bare atomic toggle
<!-- consolidation: unconfirmed; ref: none; reason: Preserve atomic-toggle safeguard pending current tmux call-site verification. -->

Two sites, `focusAgent` (`:955`, `:958`):

```
resize-pane -Z -t <activePane>
```
<!-- consolidation: discard; ref: none; reason: Historical two-site emitted-argv example. -->

These are emitted **directly**. They MUST NOT be re-expressed as a read-then-toggle: <!-- consolidation: unconfirmed; ref: none; reason: Proposed no-extra-read race safeguard needs verification. -->

```
# FORBIDDEN
if-shell -F '#{window_zoomed_flag}' 'resize-pane -Z' 'resize-pane -Z'
```
<!-- consolidation: unconfirmed; ref: none; reason: Forbidden rewrite example supports unverified atomic-toggle constraint. -->

The surrounding `zoomed()` helper (`:625`, a `display-message -p … #{window_zoomed_flag}` read) is
already a check-then-act against a *different* process; the conditions that consult it are at
`:864` and `:867`. Wrapping the toggle in another
format read would add a second TOCTOU window inside the guard, and a `if-shell` would additionally
re-evaluate the flag at tmux-exec time — so the read used for the decision and the flag the write
acts on would not be the same observation. `-Z` is atomic at the tmux level precisely so we do not
need a read. Keep the bare toggle. <!-- consolidation: unconfirmed; ref: none; reason: Cross-process TOCTOU rationale and adjacent-read constraint need tmux verification. -->

### 2.4 `exitCode` / `stderr` branching is preserved, not converted to exceptions
<!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#error-handling-and-cleanup; reason: Preserve error-channel distinctions pending exact wrapper contract review. -->

Six sites branch on the result rather than catching. They MUST receive a value: <!-- consolidation: unconfirmed; ref: none; reason: Stated six-site count conflicts with seven table rows. -->

| site | current code | contract |
|---|---|---|
| `listPanes` `:657` | `exitCode !== 0` → `/no server running/i.test(stderr)` → return `[]`; else throw | returns `readonly string[]` <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#stop-deletion-and-completion; reason: Exact absent-server versus transport-error parsing needs verification. --> |
| `command()` `:665` | `exitCode !== 0` → throw | throws <!-- consolidation: unconfirmed; ref: none; reason: Proposed error semantics and line mapping require verification. --> |
| `option()` `:669` | `exitCode === 0 && stdout.trim()` → value, else `undefined` | returns `string \| undefined` <!-- consolidation: unconfirmed; ref: none; reason: Treating every failure as unset needs contract verification. --> |
| `killPaneProcessTrees` `:675` | `exitCode !== 0` → return silently | returns void, non-throwing <!-- consolidation: discard; ref: docs/CONVENTIONS.md#error-handling-and-cleanup; reason: Blanket swallowed cleanup failures conflict with current error contract. --> |
| `killSessionIfPresent` `:699` | `exitCode === 0 \|\| SESSION_ABSENT.test(stderr.toLowerCase())` → return; else throw | returns void <!-- consolidation: discard; ref: docs/BLUEPRINT.md#stop-deletion-and-completion; reason: Broad error-connecting-as-absence conflicts with explicit transport errors. --> |
| `prefix()` `:1053` | `exitCode === 0 && stdout.trim()` → value, else `"C-b"` | returns `string` <!-- consolidation: unconfirmed; ref: none; reason: Prefix error fallback is source behavior not approved policy. --> |
| `agentWindow` in `rebuildTopology` `:1089` | `exitCode === 0 && stdout.trim() === workspace` | returns value <!-- consolidation: discard; ref: none; reason: Historical topology branch inventory. --> |

(Line refs point at the `exitCode`/stderr **call site**, not the regex-match line — the earlier
draft's numbers were off.) <!-- consolidation: discard; ref: none; reason: Historical source-line correction. -->

`SESSION_ABSENT = /can't find session|no server running|error connecting/` and the
`/no server running/i` test are **moved verbatim** into the layer, and callers must not need to
re-derive them. <!-- consolidation: discard; ref: docs/BLUEPRINT.md#stop-deletion-and-completion; reason: SESSION_ABSENT includes transport errors and its placement contradicts section 1. --> `require()` keeps throwing; `run()` never throws for a non-zero exit. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#error-handling-and-cleanup; reason: Proposed value-versus-throw wrapper split needs approval. -->

### 2.5 Format strings pass through raw
<!-- consolidation: unconfirmed; ref: none; reason: Preserve format-expression integrity safeguard pending verification. -->

The nine `display-message -p` sites and the one `list-panes -F` site read formats containing `#{…}`:

`#{window_id}` · `#{pane_id}` · `#{pane_id} #{pane_dead}` · `#{pane_height}` · `#{window_zoomed_flag}` ·
`#{pane_pid}` · `#{window_id}` (list-windows) · `#{session_name}` · `#{client_pid}` · plus the
tab-joined `PANE_LOOKUP_FORMAT` from `tmux-pane-lookup.ts`. <!-- consolidation: discard; ref: none; reason: Historical format-string inventory rather than durable API. -->

The layer MUST NOT escape, normalise or quote these. No `literalFormat()`, no `#{` → `#!{`, no
`str.replaceAll("#","##")`. The caller owns format-string construction; `tmux-pane-lookup.ts`'s own
`formatLiteral()` (which escapes values *inside* `#{==:…}`) is a caller-side concern and stays
there — note the asymmetry deliberately: `formatLiteral` escapes user data embedded in a filter, and
the *format itself* passes through raw. <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#launch-context-and-terminal-transport; reason: Distinguishing expression passthrough from embedded-data escaping is a retained unverified injection safeguard. -->

---

## 3. Method signatures and emitted argv

`T` below is a tmux target id: `@<n>` window, `%<n>` pane, `$0` session. Passed through verbatim. <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#stop-deletion-and-completion; reason: Target syntax passthrough must not substitute for required ownership validation. -->

### 3.1 `types.ts`

```ts
export type TmuxResult = { readonly exitCode: number; readonly stdout: string; readonly stderr: string };
export type TmuxCommandOptions = { timeoutMs?: number | null };
export type TmuxTarget = string;
export type TmuxSessionName = string;
export type TmuxKeyTable = string;
export type TmuxChannel = string;
```
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: TmuxResult data shape is proposed not accepted interface. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: TmuxCommandOptions timeout shape is proposed. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: TmuxTarget alias needs demonstrated ownership and use. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: TmuxSessionName alias is proposed. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: TmuxKeyTable alias is proposed. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: TmuxChannel alias is proposed. -->

`stdout`/`stderr` keep the trailing-newline normalisation of `outputText()` today:
`lines.length ? lines.join("\n") + "\n" : ""`. Callers `.trim()` today and must keep doing so;
the layer does not trim, because trimming would break `paneLive`'s two-field split semantics
(§3.4). <!-- consolidation: unconfirmed; ref: none; reason: Exact newline normalization and paneLive split dependency need verification. -->

### 3.2 `exec.ts` — 3 methods

Injected into every other module. Replaces `run`/`require`/`command` (`:757`, `:776`, `:674`). <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: Proposed common executor injection and replacement scope are unapproved. -->

```ts
interface TmuxExec {
  /** Never throws for a non-zero exit. Converts TmuxCommandError into a TmuxResult. */
  run(argv: readonly string[], options?: TmuxCommandOptions): Promise<TmuxResult>;
  /** Runs, then throws Error(`${message}: ${stderr.trim() || "tmux command failed"}`) on exitCode !== 0. */
  require(argv: readonly string[], message: string, options?: TmuxCommandOptions): Promise<void>;
  /** Runs and returns the result, throwing on exitCode !== 0. Returns the result on success. */
  command(argv: readonly string[], message: string, options?: TmuxCommandOptions): Promise<TmuxResult>;
}
```
<!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#error-handling-and-cleanup; reason: TmuxExec.run proposed nonzero-value contract needs verification. -->
<!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#error-handling-and-cleanup; reason: TmuxExec.require proposed failure-message and void contract needs verification. -->
<!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#error-handling-and-cleanup; reason: TmuxExec.command proposed throw-and-result contract needs verification. -->

Emits `argv[0]` as the tmux subcommand and `argv.slice(1)` as arguments — identical to
`this.run`'s current `[command, ...commandArgs]` destructure. `require` keeps the
`diag()` logging branch for `select-pane`, `send-keys`, `select-window`, `set-option`
(`:777`) — that diagnostic set is a deliberate debugging aid and must not drift. <!-- consolidation: unconfirmed; ref: none; reason: Exact argv destructuring and diagnostic allowlist preservation need current source disposition. -->

`failure(error)` stays: only `TmuxCommandError` is convertible; anything else rethrows (`:667`). <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#error-handling-and-cleanup; reason: Preserve unexpected-error propagation while exact adapter conversion is unverified. -->

### 3.3 `server-session.ts` — 6 methods

```ts
hasSession(name: TmuxSessionName): Promise<boolean>
listSessions(): Promise<readonly string[]>
listClients(session: TmuxSessionName): Promise<readonly string[]>
killSession(name: TmuxSessionName, message?: string): Promise<void>
killSessionIfPresent(name: TmuxSessionName, message?: string): Promise<void>
ifShell(session: TmuxSessionName, format: string, command: string): Promise<void>
```
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: hasSession signature is proposed. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: listSessions signature is proposed. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: listClients signature is proposed. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#stop-deletion-and-completion; reason: killSession signature alone supplies no execution ownership authorization. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#stop-deletion-and-completion; reason: killSessionIfPresent signature requires exact absence and ownership semantics. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: ifShell signature is proposed. -->

| method | verbatim argv |
|---|---|
| `hasSession` | libtmux handle, **not raw argv** — unchanged (`:268`) <!-- consolidation: unconfirmed; ref: none; reason: Proposed unchanged library call needs source verification. --> |
| `listSessions` | `["list-sessions", "-F", "#{session_name}"]` (`:113` orphan sweep) <!-- consolidation: unconfirmed; ref: none; reason: Proposed discovery argv does not approve orphan cleanup. --> |
| `listClients` | `["list-clients", "-t", name, "-F", "#{client_pid}"]` (`:151`) <!-- consolidation: unconfirmed; ref: none; reason: Proposed client-list argv needs verification. --> |
| `killSession` | `["kill-session", "-t", name]` (`:1090`) <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#stop-deletion-and-completion; reason: Proposed destructive argv requires exact owned target authorization. --> |
| `killSessionIfPresent` | `["kill-session", "-t", name]`; returns silently on `exitCode === 0` **or** `SESSION_ABSENT.test(stderr.toLowerCase())`; throws `${message}: ${stderr}` otherwise (§2.4) <!-- consolidation: discard; ref: docs/BLUEPRINT.md#stop-deletion-and-completion; reason: Regex swallows transport errors contrary to current cleanup contract. --> |
| `ifShell` | `["if-shell", "-t", session, "-F", format, command]` (`:1042`) <!-- consolidation: unconfirmed; ref: none; reason: Proposed conditional command argv needs verification. --> |

Note `ifShell` takes the **command as one argv element**, not split on spaces — see the
`takeTaskRequest` site, which passes `` `set-option -t ${session} ${MAILBOX} ''` `` as a single
element. Do not add a `.split(" ")`. <!-- consolidation: unconfirmed; ref: none; reason: Preserve single-argument shell command boundary pending exact command verification. -->

### 3.4 `window.ts` — 4 methods

```ts
renameWindow(target: TmuxTarget, name: string): Promise<void>
selectWindow(target: TmuxTarget): Promise<void>
killWindow(target: TmuxTarget): Promise<void>
listWindows(session: TmuxSessionName): Promise<readonly string[]>
```
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: renameWindow signature is proposed. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: selectWindow signature is proposed. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#stop-deletion-and-completion; reason: killWindow signature requires validated resource ownership. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: listWindows signature is proposed. -->

| method | verbatim argv | current site |
|---|---|---|
| `renameWindow` | `["rename-window", "-t", target, name]` | `:391` Board, `:396` Workspace, `:435` rebuild <!-- consolidation: unconfirmed; ref: none; reason: Proposed rename argv needs source verification. --> |
| `selectWindow` | `["select-window", "-t", target]` | `:833` <!-- consolidation: unconfirmed; ref: none; reason: Proposed selection argv needs source verification. --> |
| `killWindow` | `["kill-window", "-t", target]` | `:406` <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#stop-deletion-and-completion; reason: Destructive argv requires exact resource ownership. --> |
| `listWindows` | `["list-windows", "-t", session, "-F", "#{window_id}"]` → `command()` semantics (throws on non-zero, returns stdout) | `:850` <!-- consolidation: unconfirmed; ref: none; reason: Proposed listing and error semantics need verification. --> |

`newWindow` stays on the libtmux `session.newWindow({ startDirectory, shellCommand })` handle
(`:334`, `:373`) — it is not raw argv today, so it does not enter this layer's argv contract. <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: Proposed newWindow exclusion relies on historical call-site evidence. -->

### 3.5 `pane.ts` — 9 methods

```ts
selectPane(target: TmuxTarget): Promise<TmuxResult>
setPaneTitle(target: TmuxTarget, title: string): Promise<void>
swapPane(source: TmuxTarget, target: TmuxTarget): Promise<void>
resizePaneHeight(target: TmuxTarget, rows: number): Promise<void>
toggleZoom(target: TmuxTarget): Promise<void>
capture(target: TmuxTarget, options?: { start?: number; lines?: number }): Promise<TmuxResult>
respawnPane(target: TmuxTarget, options: { cwd: string; command: string }): Promise<void>
listPanes(options: { filter?: string; format?: string }): Promise<readonly string[]>
listPanePids(session: TmuxSessionName): Promise<readonly number[]>
```
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: selectPane signature is proposed. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: setPaneTitle signature is proposed. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: swapPane signature is proposed. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: resizePaneHeight signature is proposed. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: toggleZoom signature is proposed. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#launch-context-and-terminal-transport; reason: capture signature must be limited to current live screen rather than transcript persistence. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#stop-deletion-and-completion; reason: respawnPane signature requires destructive-effect ownership review. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: listPanes signature is proposed. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#stop-deletion-and-completion; reason: listPanePids signature is not signaling authority. -->

| method | verbatim argv | notes |
|---|---|---|
| `selectPane` | `["select-pane", "-t", target]` | **returns `TmuxResult`, does not throw** — three call sites branch: `:475` (focus restore, best-effort), `:1001` (diag log), and the `require` sites at `:922`/`:927`/`:990`/`:995`/`:983`/`:978`. Callers that need throwing use `exec.require(["select-pane", …])` or a thin local wrapper. <!-- consolidation: unconfirmed; ref: none; reason: Proposed focus error contract and call-site count need verification. --> |
| `setPaneTitle` | `["select-pane", "-t", target, "-T", title]` | ⚠ `setPaneTitle` **activates** its target (see `nameShellPane` `:470` comment). The focus-restore dance — read `#{window_id}`, read `#{pane_id}`, set title, re-select original if different — stays in the caller, not the method. The method does not invent a non-activating path; tmux has none. <!-- consolidation: unconfirmed; ref: none; reason: Activation side effect and impossibility claim need tmux verification before preserving focus workaround. --> |
| `swapPane` | `["swap-pane", "-d", source === target ? skip : …]` — always `["swap-pane", "-d", "-s", source, "-t", target]` | `-d` detaches the source after swapping. Callers keep the `if (source === target) return` short-circuit (`:440`). Sites `:402`, `:440`. <!-- consolidation: unconfirmed; ref: none; reason: Proposed swap flag semantics and short-circuit need verification. --> |
| `resizePaneHeight` | `["resize-pane", "-t", target, "-y", String(rows)]` | `rows` is `Math.max(1, Math.floor(height))` computed by the caller; the non-finite guard stays in the caller (`:838`). Sites `:838`, `:964`. <!-- consolidation: unconfirmed; ref: none; reason: Preserve finite-height validation while proposed ownership and argv need verification. --> |
| `toggleZoom` | `["resize-pane", "-Z", "-t", target]` | **exactly this, bare.** No `-y`, no size arg, no `if-shell` (§2.3). Sites `:955`, `:958`. <!-- consolidation: unconfirmed; ref: none; reason: Proposed bare atomic toggle safeguard needs verification. --> |
| `capture` | `["capture-pane", "-p", "-S", "-" + lines, "-t", target]` with `lines = 20` default | `-p` to stdout, `-S -20` to tail. Site `:466`. `start` is the line offset (negative = from history end). <!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#live-terminal-and-client-lifetime; reason: Capture scope and unused start-versus-lines options need reconciliation without stored transcripts. --> |
| `respawnPane` | `["respawn-pane", "-k", "-t", target, "-c", cwd, command]` | `-k` kills the existing process. `command` is the **entire** `workspaceCommand(…)` shell string as one argv element — do not split. Site `:497`. <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#stop-deletion-and-completion; reason: Destructive respawn needs verified ownership and preserved command argument boundary. --> |
| `listPanes` | `["list-panes", "-a", "-f", filter, "-F", format]` when `filter` given, else `["list-panes", "-a", "-F", format]` | **§2.4 contract:** on `exitCode !== 0` return `[]` if `/no server running/i.test(stderr)`, else throw `Could not inspect live preview panes`. Fed by `tmux-pane-lookup.ts` (`:657`, `:670`). <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#stop-deletion-and-completion; reason: Exact absence parsing and filter passthrough need verification. --> |
| `listPanePids` | `["list-panes", "-s", "-t", session, "-F", "#{pane_pid}"]` | **non-throwing**: `exitCode !== 0` → `[]`. Then filters `Number.isInteger(pid) && pid > 1 && pid !== process.pid`. Site `:1054`. <!-- consolidation: discard; ref: docs/BLUEPRINT.md#stop-deletion-and-completion; reason: Silent probe failure and PID filtering cannot establish absence or cleanup authority. --> |

`listPanes` (all-server, filter-formatted) and `listPanePids` (session-scoped, `-s`) are deliberately
**two separate methods** — merging them would force a conditional argv shape at every call site. <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: Proposed two-method abstraction rationale needs approval. -->

### 3.6 `options.ts` — 5 methods

```ts
showOption(name: string, options: { global?: boolean; session?: TmuxSessionName; target?: TmuxTarget }): Promise<string | undefined>
setOption(name: string, value: string, options?: { session?: TmuxSessionName }): Promise<void>
unsetOption(name: string, options: { session?: TmuxSessionName }): Promise<void>
setWindowOption(name: string, value: string, target: TmuxTarget): Promise<void>
```
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: showOption signature is proposed. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: setOption signature is proposed. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: unsetOption signature is proposed. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: setWindowOption signature is proposed and only four methods are listed under five-method heading. -->

| method | verbatim argv | contract |
|---|---|---|
| `showOption` (session) | `["show-options", "-qv", "-t", session, name]` | `-q` **quiet** (missing option is not an error), `-v` **value only**, `-t` target session. Returns `undefined` when `exitCode !== 0` or `stdout.trim()` is empty (§2.4). Site `:855`. <!-- consolidation: unconfirmed; ref: none; reason: Proposed missing-option versus failed-query semantics need verification. --> |
| `showOption` (global, prefix) | `["show-options", "-gv", "prefix"]` | `-g` **global**, `-v` value. Returns `"C-b"` when `exitCode !== 0` or empty. Site `:838`. `-gv` order is as emitted today; do not reorder to `-vg`. <!-- consolidation: unconfirmed; ref: none; reason: Proposed global-prefix fallback and byte-order requirement are unapproved. --> |
| `setOption` | `["set-option", "-t", session, name, value]` | plain set. Sites `:281`, `:354`–`:364`, `:394`, `:986`, `:1006`. <!-- consolidation: unconfirmed; ref: none; reason: Proposed session-option argv requires source verification. --> |
| `unsetOption` | `["set-option", "-qu", "-t", session, name]` | **`-qu` = quiet + unset.** §2.1. Site `:845`. <!-- consolidation: unconfirmed; ref: none; reason: Preserve repeat-safe unset safeguard pending verification. --> |
| `setWindowOption` | `["set-option", "-w", "-t", target, name, value]` | `-w` window scope. `automatic-rename off`, `remain-on-exit on`. Sites `:387`, `:392`, `:438`. <!-- consolidation: unconfirmed; ref: none; reason: Proposed window-option scope needs verification. --> |

Note the *session* variant and the *window* variant differ by `-w`, and the global read differs by
`-g`; the quiet flag is `-q` in one position and `-qu` in the other. These are four distinct argv
shapes, not one method with boolean flags threaded through it — keep them distinct so no caller can
accidentally drop `-q`. <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: Proposed distinct option methods conflict with the shown multi-scope showOption bag. -->

`setOption` is `require`-semantics (throws) — every current site is a `require` site. <!-- consolidation: unconfirmed; ref: none; reason: Proposed write-error semantics rely on historical source inventory. -->
`showOption` is value-semantics — every current site branches. <!-- consolidation: unconfirmed; ref: none; reason: Proposed read-result semantics need source verification. -->

### 3.7 `signals-keys.ts` — 6 methods

```ts
bindKey(key: string, command: string, options: { table: TmuxKeyTable }): Promise<void>
unbindKey(key: string, options: { table: TmuxKeyTable }): Promise<void>
bindReturnKey(options: { table: TmuxKeyTable; workspaceWindow: TmuxTarget; tasksPane: TmuxTarget }): Promise<void>
sendKeys(target: TmuxTarget, keys: string): Promise<TmuxResult>   // no enter / no literal — see §2.2
signalProcessTree(pid: number, options?: { graceMs?: number }): Promise<void>
killPaneProcessTrees(session: TmuxSessionName): Promise<void>
```
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: bindKey signature is proposed and string command conflicts with spread argv example. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: unbindKey signature is proposed. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: bindReturnKey signature is proposed. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: sendKeys signature is proposed and string keys conflicts with spread argv. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#stop-deletion-and-completion; reason: signalProcessTree signature lacks required exact execution provenance. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#stop-deletion-and-completion; reason: killPaneProcessTrees signature requires explicit scope and error-policy approval. -->

| method | verbatim argv | notes |
|---|---|---|
| `bindKey` | `["bind-key", "-T", table, key, …command]` | `switch-client` case emits `["bind-key", "-T", table, prefix, "switch-client", "-T", "prefix"]` (`:399`) — command **and its args** are separate argv elements. <!-- consolidation: unconfirmed; ref: none; reason: String signature versus argument-list spreading is inconsistent. --> |
| `unbindKey` | `["unbind-key", "-q", "-T", table, key]` | **`-q` mandatory** (§2.1). Sites `:389`, `:441`. <!-- consolidation: unconfirmed; ref: none; reason: Preserve quiet cleanup safeguard pending verification. --> |
| `bindReturnKey` | `["bind-key", "-T", table, "C-q", "if-shell", "-F", `#{==:#{window_id},${workspaceWindow}}`, `if-shell -F '#{window_zoomed_flag}' 'resize-pane -Z; select-pane -t ${tasksPane}' 'select-pane -t ${tasksPane}`, ""]` | The trailing `""` is a real argv element, not an accident — tmux needs an empty final arg here. The nested `if-shell` script is **one** argv element with `;` inside. §2.3 applies to the `resize-pane -Z` inside it: it too is a bare atomic toggle. Site `:503`. <!-- consolidation: unconfirmed; ref: none; reason: Preserve nested command and empty-argument boundaries pending exact syntax verification. --> |
| `sendKeys` | `["send-keys", "-t", target, ...keys]` — bare, matching current argv byte-for-byte | **No `enter`, no `literal`, no `-l`, no `Enter` element** (§2.2). These are **not** parameters of this method and MUST NOT be added: an optional param invites someone to "fix" it toward libtmux semantics, which appends Enter by default and would break `focusSearch()`. Sole call site: `focusSearch()` (`:876`) → `["send-keys","-t",pane,"/"]`. <!-- consolidation: unconfirmed; ref: none; reason: Proposed key API and string-spread semantics need verification without inventing Enter. --> |
| `signalProcessTree` | no tmux argv — reads `ps -A -o "pid=,ppid="` via `Bun.spawn` (`:1085`) | children first then `SIGTERM`, `await Bun.sleep(100)`, then `SIGKILL`. `signalProcess` swallows ESRCH. Not a tmux method; kept here because it is driven by `listPanePids`. <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#stop-deletion-and-completion; reason: Proposed process-tree termination and timing lack exact ownership proof and approval. --> |
| `killPaneProcessTrees` | `listPanePids` + `signalProcessTree` per pid | non-throwing; pid filter excludes `pid <= 1` and `process.pid` (`:1054`). <!-- consolidation: discard; ref: docs/BLUEPRINT.md#stop-deletion-and-completion; reason: PID filtering and swallowed cleanup failures cannot replace validated ownership and truthful failure. --> |

`bindKey`/`unbindKey`/`bindReturnKey` are separate methods rather than a general `bind` because the
three argv shapes share nothing except `-T <table>`; a merged signature would make the `-q` in
`unbindKey` optional, which is exactly the regression §2.1 forbids. <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: Proposed separate key methods and rationale need approval. -->

### 3.8 `channels.ts` — 2 methods

```ts
signalChannel(channel: TmuxChannel, message?: string): Promise<void>
waitFor(channel: TmuxChannel, message?: string): Promise<void>
```
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: signalChannel signature is proposed. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: waitFor signature is proposed. -->

| method | verbatim argv | sites |
|---|---|---|
| `signalChannel` | `["wait-for", "-S", channel]` | `:1006`, `:1010` <!-- consolidation: unconfirmed; ref: none; reason: Proposed channel signal argv needs verification. --> |
| `waitFor` | `["wait-for", channel]` | `:1002` <!-- consolidation: unconfirmed; ref: none; reason: Proposed channel wait argv and lifetime need verification. --> |

Both are `require`-semantics. **One channel per invocation** — see the comment at `:1000`: tmux has
no command chaining and `wait-for` takes a single channel, so `["wait-for","-S",a,";",…]` fails with
"too many arguments". <!-- consolidation: unconfirmed; ref: none; reason: Exact single-channel and command-chaining claims need tmux verification. --> The fan-out loop stays in the caller (`updateWorkspaceState`). <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: Proposed fan-out ownership is unapproved. -->

### 3.9 `client.ts` — 4 methods

```ts
attachSession(session: TmuxSessionName): Promise<string>
switchClientAttach(session: TmuxSessionName): Promise<string>
detachClient(session: TmuxSessionName): Promise<void>
switchClientLast(): Promise<void>
```
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: attachSession signature is proposed. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: switchClientAttach signature is proposed. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: detachClient signature is proposed. -->
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: switchClientLast signature is proposed. -->

| method | verbatim argv | notes |
|---|---|---|
| `attachSession` | `["tmux", "attach-session", "-t", session]` | `Bun.spawn` with `stdin/stdout/stderr: "inherit"` — **not** through `exec.run` (`:229`, `:906`). Returns the command name that succeeded. <!-- consolidation: unconfirmed; ref: none; reason: Proposed interactive handover and return contract need verification. --> |
| `switchClientAttach` | `["tmux", "switch-client", "attach-session", "-t", session]` | `:230`; `switch-client` with an `attach-session` argument is the inside-tmux path. <!-- consolidation: unconfirmed; ref: none; reason: Combined subcommands conflict with companion inventory's separate switch then attach invocations. --> |
| `detachClient` | `["detach-client", "-t", session]` | `exec.run` (non-throwing) when `process.env.TMUX` is unset (`:1049`). <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#launch-context-and-terminal-transport; reason: Proposed detach routing must target only the current client transport. --> |
| `switchClientLast` | `["switch-client", "-l"]` | `exec.run` (non-throwing) when `process.env.TMUX` is set (`:1049`). <!-- consolidation: unconfirmed; ref: none; reason: Proposed client-switch behavior needs current source verification. --> |

`attachSession`/`switchClientAttach` keep the `stdin: "inherit"` contract — they are handovers, not
pipe-captured reads, and must never be routed through `exec.run`. <!-- consolidation: unconfirmed; ref: none; reason: Preserve interactive inherited-stdio handover boundary pending approval. -->

---

## 4. Behaviour-lock test matrix

Every row is a test the implementation must ship. All assert on the **captured argv**, not on tmux's
behaviour, so they run without a tmux server. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Proposed exact-argv tests require behavior approval and do not prove real tmux semantics. -->

| # | Behaviour | Test |
|---|---|---|
| 1 | quiet `unbind-key` | argv === `["unbind-key","-q","-T",table,"C-m"]` <!-- consolidation: unconfirmed; ref: none; reason: Proposed repeat-cleanup test awaits verified behavior. --> |
| 2 | quiet `set-option -qu` | argv === `["set-option","-qu","-t",session,key]` <!-- consolidation: unconfirmed; ref: none; reason: Proposed unset test awaits verified behavior. --> |
| 3 | send-keys is bare | argv === `["send-keys","-t",pane,"/"]` — no `-l` element, no `"Enter"` element, no trailing key argument <!-- consolidation: unconfirmed; ref: none; reason: Proposed search-key behavior test awaits verification. --> |
| 4 | send-keys has no enter/literal params | `sendKeys.length === 2`; no exported option bag exposes `enter` or `literal` <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Signature-arity assertion is an unapproved implementation-shaped test. --> |
| 5 | zoom is bare | argv === `["resize-pane","-Z","-t",pane]`; **no** `if-shell` in the argv of any method the zoom path can reach <!-- consolidation: unconfirmed; ref: none; reason: Proposed atomic zoom test needs scope reconciliation with nested key binding. --> |
| 6 | display-message raw format | argv === `["display-message","-p","-t",pane,"#{window_zoomed_flag}"]` — exact `#{`, no `##` <!-- consolidation: unconfirmed; ref: none; reason: Proposed format passthrough test has no corresponding explicit method signature. --> |
| 7 | run does not throw | a rejected child with `exitCode: 1` resolves to `{exitCode:1,…}` <!-- consolidation: unconfirmed; ref: none; reason: Proposed error-value test needs precise convertible error boundary. --> |
| 8 | require throws | same input, `require` rejects with `${message}: ${stderr.trim()}` <!-- consolidation: unconfirmed; ref: none; reason: Proposed error test omits empty-stderr fallback specified earlier. --> |
| 9 | kill-session absent | stderr `"can't find session: x"` resolves without throwing <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#stop-deletion-and-completion; reason: Exact missing-owned-target acceptance needs verified classifier. --> |
| 10 | listPanes no server | stderr `"no server running on /tmp/tmux-0/default"` → `[]` <!-- consolidation: unconfirmed; ref: none; reason: Proposed absent-server fixture must not imply default-server live access. --> |
| 11 | listPanePids failure | non-zero exit → `[]`, not a throw <!-- consolidation: discard; ref: docs/BLUEPRINT.md#stop-deletion-and-completion; reason: Probe failure cannot silently prove no cleanup targets. --> |
| 12 | showOption missing | non-zero exit → `undefined` <!-- consolidation: unconfirmed; ref: none; reason: Missing-option versus transport-failure distinction is unspecified. --> |
| 13 | prefix fallback | non-zero or empty → `"C-b"` <!-- consolidation: unconfirmed; ref: none; reason: Exact fallback policy is unapproved. --> |
| 14 | all 9 display-message formats | table-driven over the exact format strings in §2.5 <!-- consolidation: unconfirmed; ref: none; reason: Proposed inventory-shaped format matrix needs source reconciliation. --> |
| 15 | bindReturnKey trailing `""` | last argv element is `""` <!-- consolidation: unconfirmed; ref: none; reason: Proposed empty-argument test awaits verified command semantics. --> |

---

## 5. Explicitly out of scope

- **Migrating raw sites onto libtmux.** Deferred until §0's three blockers are resolved upstream.
  This spec's existence is the reason they can be deferred. <!-- consolidation: unconfirmed; ref: docs/adr/README.md#record-and-approval-process; reason: Proposed library migration deferral does not establish accepted strategy. -->
- **Refactoring the workspace bootstrap / topology-rebuild / live-preview logic.** Only argv
  construction moves. <!-- consolidation: unconfirmed; ref: none; reason: Preserve proposed bounded extraction scope without authorizing implementation. -->
- **Touching `tmux-pane-lookup.ts`'s `formatLiteral()`.** Its `#{==:…}` value escaping is correct
  and caller-side (§2.5). <!-- consolidation: unconfirmed; ref: none; reason: Preserve format-data escaping safeguard pending correctness verification. -->
- **Any change to `SESSION_ABSENT`, `PANE_LIVENESS_BUDGET_MS`, `PANE_TREE_TERM_GRACE_MS`,
  `PANE_OUTPUT_TAIL_LINES`, `BOOTSTRAP_LOCK_*`.** <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#stop-deletion-and-completion; reason: Blanket constant freeze includes unsafe absence regex and needs current-contract reconciliation. -->

---

## 6. Migration notes for the implementing workers

### 6.1 Ownership map

One worker per file. `exec.ts` and `types.ts` land first and block everything else — sequence them.
`tmux-workspace.ts` is touched only after all nine modules exist, by one worker. <!-- consolidation: unconfirmed; ref: none; reason: Proposed worker sequence is not current dispatch authorization. -->

### 6.2 Extraction order within `tmux-workspace.ts`

Delete-as-you-go in dependency order: `signals-keys` → `channels` → `client` → `options` →
`window` → `pane` → `server-session`. `format` sites ride along with `pane`/`window` since their
argv is `display-message` against a pane or window target. <!-- consolidation: unconfirmed; ref: none; reason: Proposed extraction order includes undeclared format methods. -->

### 6.3 Site index (current line numbers, for cross-checking the migration)

> **Caveat:** this per-line index predates the exhaustive re-read that produced the verified
> count of 56 (§Scope). Treat it as **indicative, not authoritative** — individual line numbers
> drift and were grep-derived. The refs this document load-bear on (`sendKeys`/`focusSearch`
> `:876`, `zoomed()` `:625`, the §2.4 `exitCode` sites, `Bun.spawn` arrays `:223`/`:823`) have
> been re-verified; everything else should be re-checked against source before being used to
> drive the migration. <!-- consolidation: unconfirmed; ref: none; reason: Preserve re-verification gate because stale source indexes conflict with claimed exhaustive counts. -->

`run` sites: `:400` `:463` `:465` `:470` `:466` `:471` `:838` `:847` `:855` `:838` `:838` `:938` `:939`
`:1001` `:1002` `:1049`×2 `:1054` `:1090` · orphan-sweep `:113` `:131` `:151` ·
generic passthrough `:657` (fed by `tmux-pane-lookup.ts`). <!-- consolidation: discard; ref: none; reason: Historical run-site line inventory. -->

`require` sites: `:387` `:392` `:391` `:394` `:396` `:399` `:389`×3 `:438` `:441`×3 `:406` `:402`
`:440` `:473` `:497` `:503` `:833` `:922` `:927` `:955` `:958` `:978` `:983` `:990` `:995` `:964`
`:1006` `:1010` `:1042` `:502`. <!-- consolidation: discard; ref: none; reason: Historical require-site line inventory. -->

### 6.4 The generic passthrough

`tmux-pane-lookup.ts` takes `cmd(command, args)`. Wire it to the layer as: <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: Proposed generic passthrough adapter is unapproved. -->

```ts
cmd: (command, args) => tmux.pane.exec.run([command, ...args]).then(r =>
  r.exitCode !== 0
    ? (SESSION_ABSENT_OR_NO_SERVER.test(r.stderr) ? [] : (() => { throw … })())
    : (r.stdout ? r.stdout.split("\n") : []))
```
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#stop-deletion-and-completion; reason: Adapter example uses undefined absence classifier and must not swallow transport failures. -->

This preserves `:657`'s exact semantics, including that the filter/format strings built inside
`tmux-pane-lookup.ts` reach argv unescaped. <!-- consolidation: unconfirmed; ref: none; reason: Exact semantic preservation is not established by the incomplete adapter example. -->
