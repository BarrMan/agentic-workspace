# tmux Abstraction Layer — API Spec

**Status:** spec only. No implementation exists or is authorised by this document.
**Scope:** encapsulate the raw tmux CLI call sites in `src/agent-workspace/tmux-workspace.ts`
behind a libtmux-styled API surface.

**Verified count:** an exhaustive read of the source finds **54 call sites → 50 concrete argv
arrays, plus 2 `Bun.spawn` tmux arrays (`:223`, `:823`) = 56 tmux invocations**. The earlier grep
figure of ~45 was an **undercount**: multi-line argv arrays put `[` on the line *after* the call,
so a single-line grep for `run(`/`require(` missed them, and `attach-session` never touches
`run()` at all. Any index below that reports a site count should use 56.

---

## 0. Non-goals and the load-bearing constraint

### This layer wraps RAW ARGV, not libtmux.

`libtmux@0.1.0-alpha.12` is already a dependency and is already used for the object-graph sites
(`hasSession`, `newSession`, `sessions()`, `panes()`, `newWindow`, `split`). Those sites stay as they are.

Every site that currently shells out through `this.run([...])` / `this.require([...])` must keep
shelling out the *same* argv. The audit found three libtmux behaviours that make wrapping the raw
sites over libtmux a behaviour change, not a refactor:

1. **`literalFormat()` rewrites `#` → `##`.** All nine `display-message -p` sites read formats
   containing `#{...}`. Passing them through `literalFormat()` corrupts every one of them.
2. **libtmux throws `TmuxCommandError` where current code needs the exit code.** `run()` currently
   catches `TmuxCommandError` and converts it into a `{ exitCode, stdout, stderr }` value; six call
   sites branch on `exitCode !== 0` instead of catching. A throwing layer forces those branches to
   become try/catch and loses the value-form contract.
3. **Flag passthrough is not neutral.** `-q`, `-qu`, `-Z`, `-l`, `-F`, `-p`, `-g` are load-bearing
   (§1–§5). Any layer that "normalises" flags changes runtime behaviour.

So: **the layer's only job is to make argv construction legible and testable. It must not change a
single emitted argv.**

### What "libtmux naming style" means here

Verb-first method names in the order libtmux uses (`newSession`, `killWindow`, `selectPane`,
`displayMessage`, `sendKeys`), an options object as the trailing argument **only where the method
genuinely has options** — never to reintroduce a defaulted flag that has no call site (§2.2) — and a
typed `Result` return instead of an exception for anything the current code branches on. It does **not** mean
importing libtmux types beyond `PaneDirection` / `SplitOptions` / `NewWindowOptions`, which are
already imported by the call sites.

---

## 1. Module layout

Split by tmux object domain so parallel workers can own one file each with no write contention.
Every module is a pure factory over an injected exec surface — no module imports another module's
state, and only `types.ts` and `exec.ts` are shared dependencies.

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

Total: **39 public methods** across 9 files.

`tmux-workspace.ts` keeps everything that is *workspace* logic (bootstrap, topology rebuild, live
preview placement, state locking, termination handling) and calls this layer for argv. The
`TmuxWorkspaceServer` interface, `TmuxCommandResult`, `SESSION_ABSENT` regex and `tmux-pane-lookup.ts`
stay where they are; the layer imports the types, not the reverse.

### Dependency graph

```
types.ts   ←── exec.ts ←── { server-session, window, pane, options, signals-keys, channels, client }
   ↑                        ↑
   └────────────────────────┴── pane.ts ──→ tmux-pane-lookup.ts (cmd adapter, §6.4)
```

No cycles. `options.ts` depends on `types.ts` only (it never re-enters `exec.ts` — the caller
decides throw-vs-return, which is what §1.4 requires).

---

## 2. Locked-in behaviours

These five are the silent-corruption risks. Each is restated as a hard requirement on the argv in
§3. An implementation that changes any of them is wrong even if the tests pass.

### 2.1 Quiet flags are preserved

| argv | why the flag is mandatory |
|---|---|
| `unbind-key -q -T <table> <key>` | without `-q`, unbinding a key that was never bound exits non-zero → `require` throws → idempotent cleanup (`rebuildTopology`, `ensureHostUnlocked`) fails on a workspace that is already clean. |
| `set-option -qu -t <session> <key>` | without `-q`, unsetting an absent option exits non-zero → `throw`. |

`-q` is present at **four** argv sites (`set-option -qu` at `:845`; `unbind-key -q` at `:389` and
`:441`, each looping `["C-m","C-i","/"]`). It is a *silent* flag: the tests pass either way on a
dirty workspace and only fail on the second run.

### 2.2 `send-keys` is bare — DO NOT add Enter or `-l`

`focusSearch` (`:876`) is the **single call site** of the send-keys path. It sends the `/` keypress
to focus the footer's search box, and its argv is bare — verified at `tmux-workspace.ts:876`:

```ts
const send = await this.run(["send-keys", "-t", pane, "/"]);
```

This matches the CLI invocation exactly:

```
send-keys -t <pane> /
```

There is no `-l` flag and no trailing `Enter` key argument. It relies on tmux's own `send-keys`
default behaviour.

> **DO NOT** route this through libtmux's `sendKeys()`, and **DO NOT** add an `enter`/`literal`
> parameter to the layer's method.
>
> **Why:** libtmux's `sendKeys()` **appends Enter by default**; the tmux CLI does not. An earlier
> draft of this spec conflated the library wrapper's semantics with the CLI's and specified
> `sendKeys(pane, "/", { enter: false, literal: true })`. Implemented as written, `focusSearch()`
> would send `/` with no carriage return, the footer search box would never activate, and the
> regression would only surface by hand. The bare form is correct precisely because tmux, not the
> layer, decides whether Enter is sent.

The other two `send-keys` mentions in the tree (`:374`, `:501`) are **not** send-keys invocations —
they are key-table arrays `["C-m","C-i","/"]` inside unbind-key loops.

### 2.3 `resize-pane -Z` stays a bare atomic toggle

Two sites, `focusAgent` (`:955`, `:958`):

```
resize-pane -Z -t <activePane>
```

These are emitted **directly**. They MUST NOT be re-expressed as a read-then-toggle:

```
# FORBIDDEN
if-shell -F '#{window_zoomed_flag}' 'resize-pane -Z' 'resize-pane -Z'
```

The surrounding `zoomed()` helper (`:625`, a `display-message -p … #{window_zoomed_flag}` read) is
already a check-then-act against a *different* process; the conditions that consult it are at
`:864` and `:867`. Wrapping the toggle in another
format read would add a second TOCTOU window inside the guard, and a `if-shell` would additionally
re-evaluate the flag at tmux-exec time — so the read used for the decision and the flag the write
acts on would not be the same observation. `-Z` is atomic at the tmux level precisely so we do not
need a read. Keep the bare toggle.

### 2.4 `exitCode` / `stderr` branching is preserved, not converted to exceptions

Six sites branch on the result rather than catching. They MUST receive a value:

| site | current code | contract |
|---|---|---|
| `listPanes` `:657` | `exitCode !== 0` → `/no server running/i.test(stderr)` → return `[]`; else throw | returns `readonly string[]` |
| `command()` `:665` | `exitCode !== 0` → throw | throws |
| `option()` `:669` | `exitCode === 0 && stdout.trim()` → value, else `undefined` | returns `string \| undefined` |
| `killPaneProcessTrees` `:675` | `exitCode !== 0` → return silently | returns void, non-throwing |
| `killSessionIfPresent` `:699` | `exitCode === 0 \|\| SESSION_ABSENT.test(stderr.toLowerCase())` → return; else throw | returns void |
| `prefix()` `:1053` | `exitCode === 0 && stdout.trim()` → value, else `"C-b"` | returns `string` |
| `agentWindow` in `rebuildTopology` `:1089` | `exitCode === 0 && stdout.trim() === workspace` | returns value |

(Line refs point at the `exitCode`/stderr **call site**, not the regex-match line — the earlier
draft's numbers were off.)

`SESSION_ABSENT = /can't find session|no server running|error connecting/` and the
`/no server running/i` test are **moved verbatim** into the layer, and callers must not need to
re-derive them. `require()` keeps throwing; `run()` never throws for a non-zero exit.

### 2.5 Format strings pass through raw

The nine `display-message -p` sites and the one `list-panes -F` site read formats containing `#{…}`:

`#{window_id}` · `#{pane_id}` · `#{pane_id} #{pane_dead}` · `#{pane_height}` · `#{window_zoomed_flag}` ·
`#{pane_pid}` · `#{window_id}` (list-windows) · `#{session_name}` · `#{client_pid}` · plus the
tab-joined `PANE_LOOKUP_FORMAT` from `tmux-pane-lookup.ts`.

The layer MUST NOT escape, normalise or quote these. No `literalFormat()`, no `#{` → `#!{`, no
`str.replaceAll("#","##")`. The caller owns format-string construction; `tmux-pane-lookup.ts`'s own
`formatLiteral()` (which escapes values *inside* `#{==:…}`) is a caller-side concern and stays
there — note the asymmetry deliberately: `formatLiteral` escapes user data embedded in a filter, and
the *format itself* passes through raw.

---

## 3. Method signatures and emitted argv

`T` below is a tmux target id: `@<n>` window, `%<n>` pane, `$0` session. Passed through verbatim.

### 3.1 `types.ts`

```ts
export type TmuxResult = { readonly exitCode: number; readonly stdout: string; readonly stderr: string };
export type TmuxCommandOptions = { timeoutMs?: number | null };
export type TmuxTarget = string;
export type TmuxSessionName = string;
export type TmuxKeyTable = string;
export type TmuxChannel = string;
```

`stdout`/`stderr` keep the trailing-newline normalisation of `outputText()` today:
`lines.length ? lines.join("\n") + "\n" : ""`. Callers `.trim()` today and must keep doing so;
the layer does not trim, because trimming would break `paneLive`'s two-field split semantics
(§3.4).

### 3.2 `exec.ts` — 3 methods

Injected into every other module. Replaces `run`/`require`/`command` (`:757`, `:776`, `:674`).

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

Emits `argv[0]` as the tmux subcommand and `argv.slice(1)` as arguments — identical to
`this.run`'s current `[command, ...commandArgs]` destructure. `require` keeps the
`diag()` logging branch for `select-pane`, `send-keys`, `select-window`, `set-option`
(`:777`) — that diagnostic set is a deliberate debugging aid and must not drift.

`failure(error)` stays: only `TmuxCommandError` is convertible; anything else rethrows (`:667`).

### 3.3 `server-session.ts` — 6 methods

```ts
hasSession(name: TmuxSessionName): Promise<boolean>
listSessions(): Promise<readonly string[]>
listClients(session: TmuxSessionName): Promise<readonly string[]>
killSession(name: TmuxSessionName, message?: string): Promise<void>
killSessionIfPresent(name: TmuxSessionName, message?: string): Promise<void>
ifShell(session: TmuxSessionName, format: string, command: string): Promise<void>
```

| method | verbatim argv |
|---|---|
| `hasSession` | libtmux handle, **not raw argv** — unchanged (`:268`) |
| `listSessions` | `["list-sessions", "-F", "#{session_name}"]` (`:113` orphan sweep) |
| `listClients` | `["list-clients", "-t", name, "-F", "#{client_pid}"]` (`:151`) |
| `killSession` | `["kill-session", "-t", name]` (`:1090`) |
| `killSessionIfPresent` | `["kill-session", "-t", name]`; returns silently on `exitCode === 0` **or** `SESSION_ABSENT.test(stderr.toLowerCase())`; throws `${message}: ${stderr}` otherwise (§2.4) |
| `ifShell` | `["if-shell", "-t", session, "-F", format, command]` (`:1042`) |

Note `ifShell` takes the **command as one argv element**, not split on spaces — see the
`takeTaskRequest` site, which passes `` `set-option -t ${session} ${MAILBOX} ''` `` as a single
element. Do not add a `.split(" ")`.

### 3.4 `window.ts` — 4 methods

```ts
renameWindow(target: TmuxTarget, name: string): Promise<void>
selectWindow(target: TmuxTarget): Promise<void>
killWindow(target: TmuxTarget): Promise<void>
listWindows(session: TmuxSessionName): Promise<readonly string[]>
```

| method | verbatim argv | current site |
|---|---|---|
| `renameWindow` | `["rename-window", "-t", target, name]` | `:391` Board, `:396` Workspace, `:435` rebuild |
| `selectWindow` | `["select-window", "-t", target]` | `:833` |
| `killWindow` | `["kill-window", "-t", target]` | `:406` |
| `listWindows` | `["list-windows", "-t", session, "-F", "#{window_id}"]` → `command()` semantics (throws on non-zero, returns stdout) | `:850` |

`newWindow` stays on the libtmux `session.newWindow({ startDirectory, shellCommand })` handle
(`:334`, `:373`) — it is not raw argv today, so it does not enter this layer's argv contract.

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

| method | verbatim argv | notes |
|---|---|---|
| `selectPane` | `["select-pane", "-t", target]` | **returns `TmuxResult`, does not throw** — three call sites branch: `:475` (focus restore, best-effort), `:1001` (diag log), and the `require` sites at `:922`/`:927`/`:990`/`:995`/`:983`/`:978`. Callers that need throwing use `exec.require(["select-pane", …])` or a thin local wrapper. |
| `setPaneTitle` | `["select-pane", "-t", target, "-T", title]` | ⚠ `setPaneTitle` **activates** its target (see `nameShellPane` `:470` comment). The focus-restore dance — read `#{window_id}`, read `#{pane_id}`, set title, re-select original if different — stays in the caller, not the method. The method does not invent a non-activating path; tmux has none. |
| `swapPane` | `["swap-pane", "-d", source === target ? skip : …]` — always `["swap-pane", "-d", "-s", source, "-t", target]` | `-d` detaches the source after swapping. Callers keep the `if (source === target) return` short-circuit (`:440`). Sites `:402`, `:440`. |
| `resizePaneHeight` | `["resize-pane", "-t", target, "-y", String(rows)]` | `rows` is `Math.max(1, Math.floor(height))` computed by the caller; the non-finite guard stays in the caller (`:838`). Sites `:838`, `:964`. |
| `toggleZoom` | `["resize-pane", "-Z", "-t", target]` | **exactly this, bare.** No `-y`, no size arg, no `if-shell` (§2.3). Sites `:955`, `:958`. |
| `capture` | `["capture-pane", "-p", "-S", "-" + lines, "-t", target]` with `lines = 20` default | `-p` to stdout, `-S -20` to tail. Site `:466`. `start` is the line offset (negative = from history end). |
| `respawnPane` | `["respawn-pane", "-k", "-t", target, "-c", cwd, command]` | `-k` kills the existing process. `command` is the **entire** `workspaceCommand(…)` shell string as one argv element — do not split. Site `:497`. |
| `listPanes` | `["list-panes", "-a", "-f", filter, "-F", format]` when `filter` given, else `["list-panes", "-a", "-F", format]` | **§2.4 contract:** on `exitCode !== 0` return `[]` if `/no server running/i.test(stderr)`, else throw `Could not inspect live preview panes`. Fed by `tmux-pane-lookup.ts` (`:657`, `:670`). |
| `listPanePids` | `["list-panes", "-s", "-t", session, "-F", "#{pane_pid}"]` | **non-throwing**: `exitCode !== 0` → `[]`. Then filters `Number.isInteger(pid) && pid > 1 && pid !== process.pid`. Site `:1054`. |

`listPanes` (all-server, filter-formatted) and `listPanePids` (session-scoped, `-s`) are deliberately
**two separate methods** — merging them would force a conditional argv shape at every call site.

### 3.6 `options.ts` — 5 methods

```ts
showOption(name: string, options: { global?: boolean; session?: TmuxSessionName; target?: TmuxTarget }): Promise<string | undefined>
setOption(name: string, value: string, options?: { session?: TmuxSessionName }): Promise<void>
unsetOption(name: string, options: { session?: TmuxSessionName }): Promise<void>
setWindowOption(name: string, value: string, target: TmuxTarget): Promise<void>
```

| method | verbatim argv | contract |
|---|---|---|
| `showOption` (session) | `["show-options", "-qv", "-t", session, name]` | `-q` **quiet** (missing option is not an error), `-v` **value only**, `-t` target session. Returns `undefined` when `exitCode !== 0` or `stdout.trim()` is empty (§2.4). Site `:855`. |
| `showOption` (global, prefix) | `["show-options", "-gv", "prefix"]` | `-g` **global**, `-v` value. Returns `"C-b"` when `exitCode !== 0` or empty. Site `:838`. `-gv` order is as emitted today; do not reorder to `-vg`. |
| `setOption` | `["set-option", "-t", session, name, value]` | plain set. Sites `:281`, `:354`–`:364`, `:394`, `:986`, `:1006`. |
| `unsetOption` | `["set-option", "-qu", "-t", session, name]` | **`-qu` = quiet + unset.** §2.1. Site `:845`. |
| `setWindowOption` | `["set-option", "-w", "-t", target, name, value]` | `-w` window scope. `automatic-rename off`, `remain-on-exit on`. Sites `:387`, `:392`, `:438`. |

Note the *session* variant and the *window* variant differ by `-w`, and the global read differs by
`-g`; the quiet flag is `-q` in one position and `-qu` in the other. These are four distinct argv
shapes, not one method with boolean flags threaded through it — keep them distinct so no caller can
accidentally drop `-q`.

`setOption` is `require`-semantics (throws) — every current site is a `require` site.
`showOption` is value-semantics — every current site branches.

### 3.7 `signals-keys.ts` — 6 methods

```ts
bindKey(key: string, command: string, options: { table: TmuxKeyTable }): Promise<void>
unbindKey(key: string, options: { table: TmuxKeyTable }): Promise<void>
bindReturnKey(options: { table: TmuxKeyTable; workspaceWindow: TmuxTarget; tasksPane: TmuxTarget }): Promise<void>
sendKeys(target: TmuxTarget, keys: string): Promise<TmuxResult>   // no enter / no literal — see §2.2
signalProcessTree(pid: number, options?: { graceMs?: number }): Promise<void>
killPaneProcessTrees(session: TmuxSessionName): Promise<void>
```

| method | verbatim argv | notes |
|---|---|---|
| `bindKey` | `["bind-key", "-T", table, key, …command]` | `switch-client` case emits `["bind-key", "-T", table, prefix, "switch-client", "-T", "prefix"]` (`:399`) — command **and its args** are separate argv elements. |
| `unbindKey` | `["unbind-key", "-q", "-T", table, key]` | **`-q` mandatory** (§2.1). Sites `:389`, `:441`. |
| `bindReturnKey` | `["bind-key", "-T", table, "C-q", "if-shell", "-F", `#{==:#{window_id},${workspaceWindow}}`, `if-shell -F '#{window_zoomed_flag}' 'resize-pane -Z; select-pane -t ${tasksPane}' 'select-pane -t ${tasksPane}`, ""]` | The trailing `""` is a real argv element, not an accident — tmux needs an empty final arg here. The nested `if-shell` script is **one** argv element with `;` inside. §2.3 applies to the `resize-pane -Z` inside it: it too is a bare atomic toggle. Site `:503`. |
| `sendKeys` | `["send-keys", "-t", target, ...keys]` — bare, matching current argv byte-for-byte | **No `enter`, no `literal`, no `-l`, no `Enter` element** (§2.2). These are **not** parameters of this method and MUST NOT be added: an optional param invites someone to "fix" it toward libtmux semantics, which appends Enter by default and would break `focusSearch()`. Sole call site: `focusSearch()` (`:876`) → `["send-keys","-t",pane,"/"]`. |
| `signalProcessTree` | no tmux argv — reads `ps -A -o "pid=,ppid="` via `Bun.spawn` (`:1085`) | children first then `SIGTERM`, `await Bun.sleep(100)`, then `SIGKILL`. `signalProcess` swallows ESRCH. Not a tmux method; kept here because it is driven by `listPanePids`. |
| `killPaneProcessTrees` | `listPanePids` + `signalProcessTree` per pid | non-throwing; pid filter excludes `pid <= 1` and `process.pid` (`:1054`). |

`bindKey`/`unbindKey`/`bindReturnKey` are separate methods rather than a general `bind` because the
three argv shapes share nothing except `-T <table>`; a merged signature would make the `-q` in
`unbindKey` optional, which is exactly the regression §2.1 forbids.

### 3.8 `channels.ts` — 2 methods

```ts
signalChannel(channel: TmuxChannel, message?: string): Promise<void>
waitFor(channel: TmuxChannel, message?: string): Promise<void>
```

| method | verbatim argv | sites |
|---|---|---|
| `signalChannel` | `["wait-for", "-S", channel]` | `:1006`, `:1010` |
| `waitFor` | `["wait-for", channel]` | `:1002` |

Both are `require`-semantics. **One channel per invocation** — see the comment at `:1000`: tmux has
no command chaining and `wait-for` takes a single channel, so `["wait-for","-S",a,";",…]` fails with
"too many arguments". The fan-out loop stays in the caller (`updateWorkspaceState`).

### 3.9 `client.ts` — 4 methods

```ts
attachSession(session: TmuxSessionName): Promise<string>
switchClientAttach(session: TmuxSessionName): Promise<string>
detachClient(session: TmuxSessionName): Promise<void>
switchClientLast(): Promise<void>
```

| method | verbatim argv | notes |
|---|---|---|
| `attachSession` | `["tmux", "attach-session", "-t", session]` | `Bun.spawn` with `stdin/stdout/stderr: "inherit"` — **not** through `exec.run` (`:229`, `:906`). Returns the command name that succeeded. |
| `switchClientAttach` | `["tmux", "switch-client", "attach-session", "-t", session]` | `:230`; `switch-client` with an `attach-session` argument is the inside-tmux path. |
| `detachClient` | `["detach-client", "-t", session]` | `exec.run` (non-throwing) when `process.env.TMUX` is unset (`:1049`). |
| `switchClientLast` | `["switch-client", "-l"]` | `exec.run` (non-throwing) when `process.env.TMUX` is set (`:1049`). |

`attachSession`/`switchClientAttach` keep the `stdin: "inherit"` contract — they are handovers, not
pipe-captured reads, and must never be routed through `exec.run`.

---

## 4. Behaviour-lock test matrix

Every row is a test the implementation must ship. All assert on the **captured argv**, not on tmux's
behaviour, so they run without a tmux server.

| # | Behaviour | Test |
|---|---|---|
| 1 | quiet `unbind-key` | argv === `["unbind-key","-q","-T",table,"C-m"]` |
| 2 | quiet `set-option -qu` | argv === `["set-option","-qu","-t",session,key]` |
| 3 | send-keys is bare | argv === `["send-keys","-t",pane,"/"]` — no `-l` element, no `"Enter"` element, no trailing key argument |
| 4 | send-keys has no enter/literal params | `sendKeys.length === 2`; no exported option bag exposes `enter` or `literal` |
| 5 | zoom is bare | argv === `["resize-pane","-Z","-t",pane]`; **no** `if-shell` in the argv of any method the zoom path can reach |
| 6 | display-message raw format | argv === `["display-message","-p","-t",pane,"#{window_zoomed_flag}"]` — exact `#{`, no `##` |
| 7 | run does not throw | a rejected child with `exitCode: 1` resolves to `{exitCode:1,…}` |
| 8 | require throws | same input, `require` rejects with `${message}: ${stderr.trim()}` |
| 9 | kill-session absent | stderr `"can't find session: x"` resolves without throwing |
| 10 | listPanes no server | stderr `"no server running on /tmp/tmux-0/default"` → `[]` |
| 11 | listPanePids failure | non-zero exit → `[]`, not a throw |
| 12 | showOption missing | non-zero exit → `undefined` |
| 13 | prefix fallback | non-zero or empty → `"C-b"` |
| 14 | all 9 display-message formats | table-driven over the exact format strings in §2.5 |
| 15 | bindReturnKey trailing `""` | last argv element is `""` |

---

## 5. Explicitly out of scope

- **Migrating raw sites onto libtmux.** Deferred until §0's three blockers are resolved upstream.
  This spec's existence is the reason they can be deferred.
- **Refactoring the workspace bootstrap / topology-rebuild / live-preview logic.** Only argv
  construction moves.
- **Touching `tmux-pane-lookup.ts`'s `formatLiteral()`.** Its `#{==:…}` value escaping is correct
  and caller-side (§2.5).
- **Any change to `SESSION_ABSENT`, `PANE_LIVENESS_BUDGET_MS`, `PANE_TREE_TERM_GRACE_MS`,
  `PANE_OUTPUT_TAIL_LINES`, `BOOTSTRAP_LOCK_*`.**

---

## 6. Migration notes for the implementing workers

### 6.1 Ownership map

One worker per file. `exec.ts` and `types.ts` land first and block everything else — sequence them.
`tmux-workspace.ts` is touched only after all nine modules exist, by one worker.

### 6.2 Extraction order within `tmux-workspace.ts`

Delete-as-you-go in dependency order: `signals-keys` → `channels` → `client` → `options` →
`window` → `pane` → `server-session`. `format` sites ride along with `pane`/`window` since their
argv is `display-message` against a pane or window target.

### 6.3 Site index (current line numbers, for cross-checking the migration)

> **Caveat:** this per-line index predates the exhaustive re-read that produced the verified
> count of 56 (§Scope). Treat it as **indicative, not authoritative** — individual line numbers
> drift and were grep-derived. The refs this document load-bear on (`sendKeys`/`focusSearch`
> `:876`, `zoomed()` `:625`, the §2.4 `exitCode` sites, `Bun.spawn` arrays `:223`/`:823`) have
> been re-verified; everything else should be re-checked against source before being used to
> drive the migration.

`run` sites: `:400` `:463` `:465` `:470` `:466` `:471` `:838` `:847` `:855` `:838` `:838` `:938` `:939`
`:1001` `:1002` `:1049`×2 `:1054` `:1090` · orphan-sweep `:113` `:131` `:151` ·
generic passthrough `:657` (fed by `tmux-pane-lookup.ts`).

`require` sites: `:387` `:392` `:391` `:394` `:396` `:399` `:389`×3 `:438` `:441`×3 `:406` `:402`
`:440` `:473` `:497` `:503` `:833` `:922` `:927` `:955` `:958` `:978` `:983` `:990` `:995` `:964`
`:1006` `:1010` `:1042` `:502`.

### 6.4 The generic passthrough

`tmux-pane-lookup.ts` takes `cmd(command, args)`. Wire it to the layer as:

```ts
cmd: (command, args) => tmux.pane.exec.run([command, ...args]).then(r =>
  r.exitCode !== 0
    ? (SESSION_ABSENT_OR_NO_SERVER.test(r.stderr) ? [] : (() => { throw … })())
    : (r.stdout ? r.stdout.split("\n") : []))
```

This preserves `:657`'s exact semantics, including that the filter/format strings built inside
`tmux-pane-lookup.ts` reach argv unescaped.
