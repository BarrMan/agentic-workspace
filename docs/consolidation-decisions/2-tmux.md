# Decision sheet — tmux layer and call sites

> **Non-authoritative working sheet.** Not a contract. Answers here are applied to the owning contracts and to each document's disposition markers.

Each group below is one document. Decide the group as a whole, select statements individually, or write a narrowing instruction.

- Group box: `[ ] Discard all` · `[ ] Approve all (integrate)` · `[ ] Select individually` · `[ ] Narrow further: ______`
- Per statement (only if selecting individually): `d` discard · `i` integrate · `?` still open.
- Class tag: `P` = proposal / unanswered claim (a policy answer can retire it) · `G` = evidence or safety gate (needs evidence, not a decision).

Family total: **221** statements — 118 P · 103 G.

## G1 · tmux Call-Site Inventory — `src/agent-workspace/tmux-workspace.ts` (1108 lines)

**Document:** `docs/tmux-call-sites.md` · **55 statements** — 5 P · 50 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ _no owning contract — retire, or escalate as a new decision_** — 46 statement(s)

1. `G` **Definition subtraction and concrete invocation count conflict with later 54-row and 56-total claims.** — `Bun.spawn` tmux argv arrays** = **52 concrete tmux CLI invocations** in this file. — `docs/tmux-call-sites.md:38`
2. `G` **Preserve count-reconciliation gate rather than approve 52 or 56.** — document's 52 as the working number and reconcile the delta before migrating. — `docs/tmux-call-sites.md:41`
3. `P` **Preserve unused-timeout verification gate before expanding proposed API.** — **No call site in this file passes `options`** — verify before assuming a wrapper must support it. — `docs/tmux-call-sites.md:66`
4. `G` **Claimed universal newline dependency and nonzero-value contract need verification.** — **Every `stdout.trim()` at a consumer depends on that trailing-newline normalisation.** — `docs/tmux-call-sites.md:72`
5. `G` **Diagnostic allowlist necessity and temporary log policy need current disposition.** — 4-subcommand allowlist; migrating subcommands off `require()` silently kills the log. — `docs/tmux-call-sites.md:93`
6. `G` **Wording conflicts with require options timeoutMs and needs source clarification.** — - Both wrappers deliberately do *not* accept a timeout of their own. — `docs/tmux-call-sites.md:108`
7. `G` **Preserve embedded-format escaping safeguard pending verification.** — `formatLiteral()` (`:89`) escapes `#`, `,`, `}` with `##`, `#,`, `#}`. — `docs/tmux-call-sites.md:139`
8. `G` **Retain filter-injection and quoting safeguard pending exact expression verification.** — A wrapper that shells out naively, or that re-quotes argv, can corrupt the filter. — `docs/tmux-call-sites.md:143`
9. `G` **Preserve repeated-cleanup quiet-flag safeguard pending verification.** — | 14 | 502 | `unbind-key -q -T <table> <key>` | `rebuildTopology` | void | loop, **3 executions**; idempotent cleanup | — `docs/tmux-call-sites.md:166`
10. `G` **Preserve focus ordering claim pending current tmux verification.** — | 17 | 587 | `display-message -p -t <pane> #{window_id}` | `nameShellPane` | **read** `.stdout.trim()` | 🔴 focus-critical sequence, step 1 | — `docs/tmux-call-sites.md:169`
11. `G` **Preserve captured-focus dependency pending verification.** — | 18 | 588 | `display-message -p -t <window> #{pane_id}` | `nameShellPane` | **read** `.stdout.trim()` | 🔴 focus-critical, step 2 (window's active pane) | — `docs/tmux-call-sites.md:170`
12. `G` **Claimed title-setting activation side effect needs actual tmux verification.** — | 19 | 589 | `select-pane -t <pane> -T <name>` | `nameShellPane` | void | 🔴 focus-critical, step 3 — **`-T` activates as a side effect** | — `docs/tmux-call-sites.md:171`
13. `G` **Never-throw claim conflicts with documented host-error rejection.** — | 20 | 590 | `select-pane -t <active>` | `nameShellPane` | void, exitCode ignored | 🔴 focus-critical, step 4 — restores focus; `run()` not `require()` so restore can never throw | — `docs/tmux-call-sites.md:172`
14. `G` **Preserve cross-process zoom race finding pending verification.** — | 24 | 625-631 | `display-message -p -t <WORKSPACE_WINDOW> #{window_zoomed_flag}` | `zoomed` | **read** `exitCode===0 && stdout.trim()==="1"` | 🔴 **raced against by `resize-pane -Z` at … — `docs/tmux-call-sites.md:176`
15. `G` **Blanket failure-as-unset claim needs absent-option versus transport-error verification.** — | 30 | 699 | `show-options -qv -t <session> <key>` | `option` | **read** `exitCode===0 && stdout.trim()` → string\|undefined | `-qv` = quiet+value; **non-zero is not an error, means "unset"** | — `docs/tmux-call-sites.md:182`
16. `G` **Preserve repeat-safe unset safeguard pending verification.** — | 32 | 714 | `set-option -qu -t <session> <key>` | `unset` | void | 🔴 **`-qu` quiet: without it, unsetting an already-unset option throws** | — `docs/tmux-call-sites.md:184`
17. `G` **Preserve window-before-pane focus ordering pending verification.** — | 35 | 832 | `select-pane -t <BOARD_PANE>` | `showBoard` | void | must run **after** `selectWindow` | — `docs/tmux-call-sites.md:187`
18. `G` **Preserve early focus handoff ordering pending current topology verification.** — | 36 | 839-840 | `select-pane -t <await liveUiPane(TASKS_PANE)>` | `showWorkspace` | void | 🔴 **claims task-pane focus immediately after `select-window`, BEFORE revalidating footer/nav/details** | — `docs/tmux-call-sites.md:188`
19. `G` **Preserve atomic-toggle and observation ordering safeguard pending verification.** — | 37 | 865 | `resize-pane -Z -t <active>` | `focusAgent` | void | 🔴 **unzoom toggle, gated by `zoomed()` read at `:625`**; bare atomic toggle | — `docs/tmux-call-sites.md:189`
20. `G` **Preserve second observation and toggle sequencing pending verification.** — | 39 | 868 | `resize-pane -Z -t <active>` | `focusAgent` | void | 🔴 **zoom toggle, gated by a second `zoomed()` read** | — `docs/tmux-call-sites.md:191`
21. `G` **Preserve exact search-key semantics pending library and CLI verification.** — | 41 | 876 | `send-keys -t <pane> /` | `focusSearch` | **read** `exitCode` → logged | 🔴 **argv is bare — DO NOT add Enter or `-l`.** See §2.2 of `tmux-layer-spec.md` | — `docs/tmux-call-sites.md:193`
22. `G` **Preserve request interpolation validation and compare-clear atomicity pending exact syntax verification.** — | 47 | 925-933 | `if-shell -t <session> -F '#{==:#{<MAILBOX>},<request>}}' "set-option -t <session> <MAILBOX> ''"` | `takeTaskRequest` | void | compare-and-clear is **atomic inside tmux**; `request` … — `docs/tmux-call-sites.md:199`
23. `G` **Claimed no-chaining limitation needs tmux verification before API design.** — | 48 | 962 | `wait-for -S <channel>` | `updateWorkspaceState` | void | one invocation per listener — tmux has no chaining and `wait-for` takes a single channel | — `docs/tmux-call-sites.md:200`
24. `P` **Two-command fallback conflicts with proposed combined switch-client attach-session argv.** — | 223-228 | `tmux switch-client -t <session>` then `tmux attach-session -t <session>` | `attachWorkspaceClient` (`:218`) | `Bun.spawn`, inherits stdio; falls through to the second command on non-zero … — `docs/tmux-call-sites.md:212`
25. `G` **Concrete-array count contradicts earlier subtraction to 50.** — **Total rows: 54** (52 concrete argv arrays + 2 generic passthroughs). — `docs/tmux-call-sites.md:223`
26. `G` **Invocation total conflicts with 52 concrete count and includes generic passthroughs.** — Plus 2 `Bun.spawn` arrays (`:223`, `:823`) → **56 total tmux invocations in the file.** — `docs/tmux-call-sites.md:253`
27. `G` **Preservation constraints need approved-behavior reconciliation and cannot freeze unsafe source behavior.** — ## 5. 🔴 Critical behaviour — must not change during migration — `docs/tmux-call-sites.md:261`
28. `P` **Proposed prefix fallback needs policy disposition.** — | `:675` | `prefix`: `exitCode === 0 && stdout.trim()` truthy, else `"C-b"` | — `docs/tmux-call-sites.md:270`
29. `G` **Failed query and missing option need distinction verification.** — | `:699` | `option`: `exitCode === 0 && stdout.trim()` else `undefined` | — `docs/tmux-call-sites.md:271`
30. `G` **Failed zoom-read fallback and resulting toggle behavior need verification before preserving.** — which makes `:868` attempt a zoom toggle that tmux then treats as an unzoom). — `docs/tmux-call-sites.md:277`
31. `G` **Preserve embedded-command and format-escaping safeguard pending exact boundary verification.** — corrupt them. — `docs/tmux-call-sites.md:297`
32. `G` **Bare key semantics require verification without silently adding Enter.** — `Enter` argv element. tmux — not this layer — decides whether Enter is sent. — `docs/tmux-call-sites.md:302`
33. `G` **Claimed carriage-return result contradicts enter-false example and companion spec rationale.** — > regression would only surface by hand. Adding an explicit Enter flag here has the same effect. — `docs/tmux-call-sites.md:309`
34. `G` **Search-key delivery failure tolerance requires current interaction policy verification.** — Failure is tolerated (`run()`, result only logged to `/tmp/focus.log`). — `docs/tmux-call-sites.md:311`
35. `G` **Preserve atomic-toggle sequence pending source and tmux verification.** — `:625`, and the sequence is: — `docs/tmux-call-sites.md:316`
36. `G` **Preserve no-extra-round-trip race safeguard pending current implementation verification.** — in one call frame.** — `docs/tmux-call-sites.md:328`
37. `P` **Quiet cleanup semantics need verification and blanket failure-as-unset is not established.** — family — non-zero means "unset", not "error". — `docs/tmux-call-sites.md:336`
38. `G` **Claimed unavoidable title activation and race require actual tmux verification.** — race window between `:589` and `:590`. Ordering constraints: — `docs/tmux-call-sites.md:350`
39. `G` **Preserve capture-before-title ordering pending activation-side-effect verification.** — otherwise, and the window's active pane changes at `:589`). — `docs/tmux-call-sites.md:353`
40. `G` **Never-throw constraint conflicts with run host-level errors.** — 2. `:590` uses `run()`, **not** `require()` — focus restoration must never throw. — `docs/tmux-call-sites.md:354`
41. `G` **Claimed self-selection flicker and guard need verification.** — 3. The `active !== pane` guard prevents a redundant activate-then-deactivate flicker. — `docs/tmux-call-sites.md:355`
42. `G` **Batching effect on focus race is asserted without current verification.** — the race. — `docs/tmux-call-sites.md:358`
43. `G` **Preserve awaited live-pane and early-focus ordering pending current handoff verification.** — `:839` lazy, breaks the guarantee. `showBoard` (`:828-833`) has the same shape at `:832`. — `docs/tmux-call-sites.md:380`
44. `G` **Diagnostic allowlist preservation needs current logging disposition.** — the same wrapper. — `docs/tmux-call-sites.md:388`
45. `G` **Preserve write-before-read bootstrap ordering pending exact source verification.** — options back. `OWNER_PID` is published at `:280` *before* any pane exists. — `docs/tmux-call-sites.md:391`
46. `G` **Preserve no-invented-timeout constraint until wait and subscription lifetimes are verified.** — are the ones that would change behaviour. — `docs/tmux-call-sites.md:396`

**→ `docs/BLUEPRINT.md#observation-stop-and-deletion`** — 3 statement(s)

1. `G` **Window membership alone needs verification against full owned-resource provenance.** — | 11 | 447 | `kill-window -t <workspace>` | `rebuildTopology` | void | guarded by `windowInSession` | — `docs/tmux-call-sites.md:163`
2. `G` **Destructive UI respawn requires exact role and owned-pane evidence.** — | 21 | 600-601 | `respawn-pane -k -t <pane> -c <rootPath> <workspaceCommand>` | `launchUi` | void | command string built by `workspaceCommand()` `:180`; `-k` kills the existing process | — `docs/tmux-call-sites.md:173`
3. `G` **Exact no-server classifier needs verification.** — | `:657` | `listed.exitCode !== 0` → `/no server running/i.test(listed.stderr)` → `return []`, else throw | — `docs/tmux-call-sites.md:267`

**→ `docs/CONVENTIONS.md#error-handling`** — 2 statement(s)

1. `G` **Preserve error-channel distinction pending exact extraction approval.** — host-level throw. Any wrapper replacing it must preserve that three-way split. — `docs/tmux-call-sites.md:76`
2. `G` **Preserve error-channel distinction without approving swallowed cleanup failures.** — `:1053` (silent return) and `:590` (ignored). — `docs/tmux-call-sites.md:393`

**→ `docs/specs/sessions.md#observe-and-detach-from-a-live-session`** — 1 statement(s)

1. `G` **remain-on-exit concerns process exit and does not alone establish client-independent lifetime.** — | 3 | 358-359 | `set-option -w -t <target> remain-on-exit on` | `ensureHostUnlocked` | void | same loop, **2 executions**; `remain-on-exit` is what makes panes outlive the client | — `docs/tmux-call-sites.md:155`

**→ `docs/BLUEPRINT.md#component-ownership`** — 1 statement(s)

1. `P` **Requirement to model library-mediated operations conflicts with raw-argv-only proposal boundary.** — `tmux.hasSession` `:258`, `tmux.sessions()` `:428`, `tmux.panes()` `:432`, and `tmux.cmd` `:762`. — `docs/tmux-call-sites.md:217`

**→ `docs/specs/sessions.md#sessions`** — 1 statement(s)

1. `G` **Failure-as-false must not be interpreted as conclusive absence.** — | `:665` | `paneExists`: `exitCode === 0 && stdout.trim() === pane` | — `docs/tmux-call-sites.md:268`

**→ `docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport`** — 1 statement(s)

1. `G` **Retain request-format validation safety gate pending exact escaping and call-site verification.** — `request` into tmux format syntax. Move the check and you re-open format injection. — `docs/tmux-call-sites.md:398`

## G2 · tmux Abstraction Layer — API Spec

**Document:** `docs/tmux-layer-spec.md` · **166 statements** — 113 P · 53 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ _no owning contract — retire, or escalate as a new decision_** — 71 statement(s)

1. `G` **Claimed 54 sites versus 50 arrays plus 2 spawns does not establish 56 concrete invocations and conflicts with companion inventory.** — `run()` at all. Any index below that reports a site count should use 56. — `docs/tmux-layer-spec.md:28`
2. `G` **Site versus concrete-array counting must be reconciled before reuse.** — `run()` at all. Any index below that reports a site count should use 56. — `docs/tmux-layer-spec.md:28`
3. `G` **Preserve raw-format corruption finding pending exact library and call-site verification.** — containing `#{...}`. Passing them through `literalFormat()` corrupts every one of them. — `docs/tmux-layer-spec.md:45`
4. `G` **Preserve flag-semantics safeguard pending current call-site verification.** — (§1–§5). Any layer that "normalises" flags changes runtime behaviour. — `docs/tmux-layer-spec.md:51`
5. `P` **Proposed count conflicts with four listed options signatures and absent display-message signature.** — Total: **39 public methods** across 9 files. — `docs/tmux-layer-spec.md:95`
6. `G` **Claimed dependency and throw ownership reference nonexistent section 1.4 and conflict with option execution methods.** — decides throw-vs-return, which is what §1.4 requires). — `docs/tmux-layer-spec.md:112`
7. `G` **Historical code preservation constraints require validation against approved behavior before becoming acceptance.** — §3. An implementation that changes any of them is wrong even if the tests pass. — `docs/tmux-layer-spec.md:119`
8. `G` **Claimed four sites lists three templates and needs count and repeat-run verification.** — dirty workspace and only fail on the second run. — `docs/tmux-layer-spec.md:130`
9. `G` **Claimed equivalent CLI invocation needs current tmux semantics verification.** — ``` — `docs/tmux-layer-spec.md:148`
10. `G` **Preserve no-added-Enter distinction pending library and CLI comparison.** — default behaviour. — `docs/tmux-layer-spec.md:151`
11. `G` **Rationale contradicts companion inventory about carriage return and needs actual key behavior verification.** — > layer, decides whether Enter is sent. — `docs/tmux-layer-spec.md:161`
12. `G` **Preserve atomic-toggle safeguard pending current tmux call-site verification.** — ### 2.3 `resize-pane -Z` stays a bare atomic toggle — `docs/tmux-layer-spec.md:167`
13. `P` **Proposed no-extra-read race safeguard needs verification.** — These are emitted **directly**. They MUST NOT be re-expressed as a read-then-toggle: — `docs/tmux-layer-spec.md:176`
14. `G` **Forbidden rewrite example supports unverified atomic-toggle constraint.** — ``` — `docs/tmux-layer-spec.md:182`
15. `G` **Cross-process TOCTOU rationale and adjacent-read constraint need tmux verification.** — need a read. Keep the bare toggle. — `docs/tmux-layer-spec.md:190`
16. `G` **Stated six-site count conflicts with seven table rows.** — Six sites branch on the result rather than catching. They MUST receive a value: — `docs/tmux-layer-spec.md:195`
17. `P` **Proposed error semantics and line mapping require verification.** — | `command()` `:665` | `exitCode !== 0` → throw | throws | — `docs/tmux-layer-spec.md:200`
18. `G` **Treating every failure as unset needs contract verification.** — | `option()` `:669` | `exitCode === 0 && stdout.trim()` → value, else `undefined` | returns `string \| undefined` | — `docs/tmux-layer-spec.md:201`
19. `P` **Prefix error fallback is source behavior not approved policy.** — | `prefix()` `:1053` | `exitCode === 0 && stdout.trim()` → value, else `"C-b"` | returns `string` | — `docs/tmux-layer-spec.md:204`
20. `G` **Preserve format-expression integrity safeguard pending verification.** — ### 2.5 Format strings pass through raw — `docs/tmux-layer-spec.md:215`
21. `G` **Exact newline normalization and paneLive split dependency need verification.** — (§3.4). — `docs/tmux-layer-spec.md:255`
22. `G` **Exact argv destructuring and diagnostic allowlist preservation need current source disposition.** — (`:777`) — that diagnostic set is a deliberate debugging aid and must not drift. — `docs/tmux-layer-spec.md:278`
23. `P` **Proposed unchanged library call needs source verification.** — | `hasSession` | libtmux handle, **not raw argv** — unchanged (`:268`) | — `docs/tmux-layer-spec.md:301`
24. `P` **Proposed discovery argv does not approve orphan cleanup.** — | `listSessions` | `["list-sessions", "-F", "#{session_name}"]` (`:113` orphan sweep) | — `docs/tmux-layer-spec.md:302`
25. `P` **Proposed client-list argv needs verification.** — | `listClients` | `["list-clients", "-t", name, "-F", "#{client_pid}"]` (`:151`) | — `docs/tmux-layer-spec.md:303`
26. `P` **Proposed conditional command argv needs verification.** — | `ifShell` | `["if-shell", "-t", session, "-F", format, command]` (`:1042`) | — `docs/tmux-layer-spec.md:306`
27. `G` **Preserve single-argument shell command boundary pending exact command verification.** — element. Do not add a `.split(" ")`. — `docs/tmux-layer-spec.md:310`
28. `P` **Proposed rename argv needs source verification.** — | `renameWindow` | `["rename-window", "-t", target, name]` | `:391` Board, `:396` Workspace, `:435` rebuild | — `docs/tmux-layer-spec.md:327`
29. `P` **Proposed selection argv needs source verification.** — | `selectWindow` | `["select-window", "-t", target]` | `:833` | — `docs/tmux-layer-spec.md:328`
30. `P` **Proposed listing and error semantics need verification.** — | `listWindows` | `["list-windows", "-t", session, "-F", "#{window_id}"]` → `command()` semantics (throws on non-zero, returns stdout) | `:850` | — `docs/tmux-layer-spec.md:330`
31. `P` **Proposed focus error contract and call-site count need verification.** — | `selectPane` | `["select-pane", "-t", target]` | **returns `TmuxResult`, does not throw** — three call sites branch: `:475` (focus restore, best-effort), `:1001` (diag log), and the `require` sites … — `docs/tmux-layer-spec.md:360`
32. `G` **Activation side effect and impossibility claim need tmux verification before preserving focus workaround.** — | `setPaneTitle` | `["select-pane", "-t", target, "-T", title]` | ⚠ `setPaneTitle` **activates** its target (see `nameShellPane` `:470` comment). The focus-restore dance — read `#{window_id}`, read … — `docs/tmux-layer-spec.md:361`
33. `P` **Proposed swap flag semantics and short-circuit need verification.** — | `swapPane` | `["swap-pane", "-d", source === target ? skip : …]` — always `["swap-pane", "-d", "-s", source, "-t", target]` | `-d` detaches the source after swapping. Callers keep the `if (source … — `docs/tmux-layer-spec.md:362`
34. `P` **Preserve finite-height validation while proposed ownership and argv need verification.** — | `resizePaneHeight` | `["resize-pane", "-t", target, "-y", String(rows)]` | `rows` is `Math.max(1, Math.floor(height))` computed by the caller; the non-finite guard stays in the caller (`:838`). … — `docs/tmux-layer-spec.md:363`
35. `P` **Proposed bare atomic toggle safeguard needs verification.** — | `toggleZoom` | `["resize-pane", "-Z", "-t", target]` | **exactly this, bare.** No `-y`, no size arg, no `if-shell` (§2.3). Sites `:955`, `:958`. | — `docs/tmux-layer-spec.md:364`
36. `P` **Proposed missing-option versus failed-query semantics need verification.** — | `showOption` (session) | `["show-options", "-qv", "-t", session, name]` | `-q` **quiet** (missing option is not an error), `-v` **value only**, `-t` target session. Returns `undefined` when … — `docs/tmux-layer-spec.md:388`
37. `P` **Proposed global-prefix fallback and byte-order requirement are unapproved.** — | `showOption` (global, prefix) | `["show-options", "-gv", "prefix"]` | `-g` **global**, `-v` value. Returns `"C-b"` when `exitCode !== 0` or empty. Site `:838`. `-gv` order is as emitted today; do … — `docs/tmux-layer-spec.md:389`
38. `P` **Proposed session-option argv requires source verification.** — | `setOption` | `["set-option", "-t", session, name, value]` | plain set. Sites `:281`, `:354`–`:364`, `:394`, `:986`, `:1006`. | — `docs/tmux-layer-spec.md:390`
39. `G` **Preserve repeat-safe unset safeguard pending verification.** — | `unsetOption` | `["set-option", "-qu", "-t", session, name]` | **`-qu` = quiet + unset.** §2.1. Site `:845`. | — `docs/tmux-layer-spec.md:391`
40. `P` **Proposed window-option scope needs verification.** — | `setWindowOption` | `["set-option", "-w", "-t", target, name, value]` | `-w` window scope. `automatic-rename off`, `remain-on-exit on`. Sites `:387`, `:392`, `:438`. | — `docs/tmux-layer-spec.md:392`
41. `P` **Proposed write-error semantics rely on historical source inventory.** — `setOption` is `require`-semantics (throws) — every current site is a `require` site. — `docs/tmux-layer-spec.md:399`
42. `P` **Proposed read-result semantics need source verification.** — `showOption` is value-semantics — every current site branches. — `docs/tmux-layer-spec.md:400`
43. `G` **String signature versus argument-list spreading is inconsistent.** — | `bindKey` | `["bind-key", "-T", table, key, …command]` | `switch-client` case emits `["bind-key", "-T", table, prefix, "switch-client", "-T", "prefix"]` (`:399`) — command **and its args** are … — `docs/tmux-layer-spec.md:421`
44. `G` **Preserve quiet cleanup safeguard pending verification.** — | `unbindKey` | `["unbind-key", "-q", "-T", table, key]` | **`-q` mandatory** (§2.1). Sites `:389`, `:441`. | — `docs/tmux-layer-spec.md:422`
45. `G` **Preserve nested command and empty-argument boundaries pending exact syntax verification.** — | `bindReturnKey` | `["bind-key", "-T", table, "C-q", "if-shell", "-F", `#{==:#{window_id},${workspaceWindow}}`, `if-shell -F '#{window_zoomed_flag}' 'resize-pane -Z; select-pane -t ${tasksPane}' … — `docs/tmux-layer-spec.md:423`
46. `P` **Proposed key API and string-spread semantics need verification without inventing Enter.** — | `sendKeys` | `["send-keys", "-t", target, ...keys]` — bare, matching current argv byte-for-byte | **No `enter`, no `literal`, no `-l`, no `Enter` element** (§2.2). These are **not** parameters of … — `docs/tmux-layer-spec.md:424`
47. `P` **Proposed channel signal argv needs verification.** — | `signalChannel` | `["wait-for", "-S", channel]` | `:1006`, `:1010` | — `docs/tmux-layer-spec.md:443`
48. `P` **Proposed channel wait argv and lifetime need verification.** — | `waitFor` | `["wait-for", channel]` | `:1002` | — `docs/tmux-layer-spec.md:444`
49. `G` **Exact single-channel and command-chaining claims need tmux verification.** — "too many arguments". The fan-out loop stays in the caller (`updateWorkspaceState`). — `docs/tmux-layer-spec.md:448`
50. `P` **Proposed interactive handover and return contract need verification.** — | `attachSession` | `["tmux", "attach-session", "-t", session]` | `Bun.spawn` with `stdin/stdout/stderr: "inherit"` — **not** through `exec.run` (`:229`, `:906`). Returns the command name that … — `docs/tmux-layer-spec.md:465`
51. `G` **Combined subcommands conflict with companion inventory's separate switch then attach invocations.** — | `switchClientAttach` | `["tmux", "switch-client", "attach-session", "-t", session]` | `:230`; `switch-client` with an `attach-session` argument is the inside-tmux path. | — `docs/tmux-layer-spec.md:466`
52. `P` **Proposed client-switch behavior needs current source verification.** — | `switchClientLast` | `["switch-client", "-l"]` | `exec.run` (non-throwing) when `process.env.TMUX` is set (`:1049`). | — `docs/tmux-layer-spec.md:468`
53. `G` **Preserve interactive inherited-stdio handover boundary pending approval.** — pipe-captured reads, and must never be routed through `exec.run`. — `docs/tmux-layer-spec.md:471`
54. `P` **Proposed repeat-cleanup test awaits verified behavior.** — | 1 | quiet `unbind-key` | argv === `["unbind-key","-q","-T",table,"C-m"]` | — `docs/tmux-layer-spec.md:482`
55. `P` **Proposed unset test awaits verified behavior.** — | 2 | quiet `set-option -qu` | argv === `["set-option","-qu","-t",session,key]` | — `docs/tmux-layer-spec.md:483`
56. `P` **Proposed search-key behavior test awaits verification.** — | 3 | send-keys is bare | argv === `["send-keys","-t",pane,"/"]` — no `-l` element, no `"Enter"` element, no trailing key argument | — `docs/tmux-layer-spec.md:484`
57. `P` **Proposed atomic zoom test needs scope reconciliation with nested key binding.** — | 5 | zoom is bare | argv === `["resize-pane","-Z","-t",pane]`; **no** `if-shell` in the argv of any method the zoom path can reach | — `docs/tmux-layer-spec.md:486`
58. `P` **Proposed format passthrough test has no corresponding explicit method signature.** — | 6 | display-message raw format | argv === `["display-message","-p","-t",pane,"#{window_zoomed_flag}"]` — exact `#{`, no `##` | — `docs/tmux-layer-spec.md:487`
59. `P` **Proposed error-value test needs precise convertible error boundary.** — | 7 | run does not throw | a rejected child with `exitCode: 1` resolves to `{exitCode:1,…}` | — `docs/tmux-layer-spec.md:488`
60. `P` **Proposed error test omits empty-stderr fallback specified earlier.** — | 8 | require throws | same input, `require` rejects with `${message}: ${stderr.trim()}` | — `docs/tmux-layer-spec.md:489`
61. `P` **Proposed absent-server fixture must not imply default-server live access.** — | 10 | listPanes no server | stderr `"no server running on /tmp/tmux-0/default"` → `[]` | — `docs/tmux-layer-spec.md:491`
62. `G` **Missing-option versus transport-failure distinction is unspecified.** — | 12 | showOption missing | non-zero exit → `undefined` | — `docs/tmux-layer-spec.md:493`
63. `P` **Exact fallback policy is unapproved.** — | 13 | prefix fallback | non-zero or empty → `"C-b"` | — `docs/tmux-layer-spec.md:494`
64. `P` **Proposed inventory-shaped format matrix needs source reconciliation.** — | 14 | all 9 display-message formats | table-driven over the exact format strings in §2.5 | — `docs/tmux-layer-spec.md:495`
65. `P` **Proposed empty-argument test awaits verified command semantics.** — | 15 | bindReturnKey trailing `""` | last argv element is `""` | — `docs/tmux-layer-spec.md:496`
66. `P` **Preserve proposed bounded extraction scope without authorizing implementation.** — construction moves. — `docs/tmux-layer-spec.md:505`
67. `G` **Preserve format-data escaping safeguard pending correctness verification.** — and caller-side (§2.5). — `docs/tmux-layer-spec.md:507`
68. `P` **Proposed worker sequence is not current dispatch authorization.** — `tmux-workspace.ts` is touched only after all nine modules exist, by one worker. — `docs/tmux-layer-spec.md:518`
69. `P` **Proposed extraction order includes undeclared format methods.** — argv is `display-message` against a pane or window target. — `docs/tmux-layer-spec.md:524`
70. `G` **Preserve re-verification gate because stale source indexes conflict with claimed exhaustive counts.** — > drive the migration. — `docs/tmux-layer-spec.md:533`
71. `P` **Exact semantic preservation is not established by the incomplete adapter example.** — `tmux-pane-lookup.ts` reach argv unescaped. — `docs/tmux-layer-spec.md:556`

**→ `docs/BLUEPRINT.md#component-ownership`** — 57 statement(s)

1. `P` **Exact new wrapper boundary is an unapproved proposal.** — behind a libtmux-styled API surface. — `docs/tmux-layer-spec.md:22`
2. `P` **Proposed extraction boundary needs approval.** — (`hasSession`, `newSession`, `sessions()`, `panes()`, `newWindow`, `split`). Those sites stay as they are. — `docs/tmux-layer-spec.md:38`
3. `P` **Proposed naming options and imported-type boundary have no approval.** — already imported by the call sites. — `docs/tmux-layer-spec.md:63`
4. `P` **Worker-driven module layout is proposed not accepted architecture.** — Split by tmux object domain so parallel workers can own one file each with no write contention. — `docs/tmux-layer-spec.md:69`
5. `G` **Factory and shared-module shape needs approval and conflicts with later pane-lookup dependency.** — state, and only `types.ts` and `exec.ts` are shared dependencies. — `docs/tmux-layer-spec.md:71`
6. `P` **Proposed types.ts shared declarations require ownership review.** — ``` — `docs/tmux-layer-spec.md:85`
7. `P` **Proposed exec.ts execution boundary requires approval.** — ``` — `docs/tmux-layer-spec.md:86`
8. `P` **Proposed server-session.ts module requires approval.** — ``` — `docs/tmux-layer-spec.md:87`
9. `P` **Proposed window.ts module requires approval.** — ``` — `docs/tmux-layer-spec.md:88`
10. `P` **Proposed pane.ts module requires approval.** — ``` — `docs/tmux-layer-spec.md:89`
11. `P` **Proposed options.ts module requires approval.** — ``` — `docs/tmux-layer-spec.md:90`
12. `P` **Proposed signals-keys.ts mixes terminal commands and process effects without approved ownership.** — ``` — `docs/tmux-layer-spec.md:91`
13. `P` **Proposed channels.ts module requires approval.** — ``` — `docs/tmux-layer-spec.md:92`
14. `P` **Proposed client.ts module requires approval.** — ``` — `docs/tmux-layer-spec.md:93`
15. `P` **Workspace responsibilities and import direction are unapproved and SESSION_ABSENT placement conflicts with section 2.4.** — stay where they are; the layer imports the types, not the reverse. — `docs/tmux-layer-spec.md:100`
16. `P` **Proposed module dependency graph needs consistency and ownership review.** — ``` — `docs/tmux-layer-spec.md:109`
17. `P` **Exact wrapper API prohibition is part of an unapproved extraction.** — > parameter to the layer's method. — `docs/tmux-layer-spec.md:154`
18. `P` **TmuxResult data shape is proposed not accepted interface.** — ``` — `docs/tmux-layer-spec.md:245`
19. `P` **TmuxCommandOptions timeout shape is proposed.** — ``` — `docs/tmux-layer-spec.md:246`
20. `P` **TmuxTarget alias needs demonstrated ownership and use.** — ``` — `docs/tmux-layer-spec.md:247`
21. `P` **TmuxSessionName alias is proposed.** — ``` — `docs/tmux-layer-spec.md:248`
22. `P` **TmuxKeyTable alias is proposed.** — ``` — `docs/tmux-layer-spec.md:249`
23. `P` **TmuxChannel alias is proposed.** — ``` — `docs/tmux-layer-spec.md:250`
24. `P` **Proposed common executor injection and replacement scope are unapproved.** — Injected into every other module. Replaces `run`/`require`/`command` (`:757`, `:776`, `:674`). — `docs/tmux-layer-spec.md:259`
25. `P` **hasSession signature is proposed.** — ``` — `docs/tmux-layer-spec.md:292`
26. `P` **listSessions signature is proposed.** — ``` — `docs/tmux-layer-spec.md:293`
27. `P` **listClients signature is proposed.** — ``` — `docs/tmux-layer-spec.md:294`
28. `P` **ifShell signature is proposed.** — ``` — `docs/tmux-layer-spec.md:297`
29. `P` **renameWindow signature is proposed.** — ``` — `docs/tmux-layer-spec.md:320`
30. `P` **selectWindow signature is proposed.** — ``` — `docs/tmux-layer-spec.md:321`
31. `P` **listWindows signature is proposed.** — ``` — `docs/tmux-layer-spec.md:323`
32. `P` **Proposed newWindow exclusion relies on historical call-site evidence.** — (`:334`, `:373`) — it is not raw argv today, so it does not enter this layer's argv contract. — `docs/tmux-layer-spec.md:333`
33. `P` **selectPane signature is proposed.** — ``` — `docs/tmux-layer-spec.md:348`
34. `P` **setPaneTitle signature is proposed.** — ``` — `docs/tmux-layer-spec.md:349`
35. `P` **swapPane signature is proposed.** — ``` — `docs/tmux-layer-spec.md:350`
36. `P` **resizePaneHeight signature is proposed.** — ``` — `docs/tmux-layer-spec.md:351`
37. `P` **toggleZoom signature is proposed.** — ``` — `docs/tmux-layer-spec.md:352`
38. `P` **listPanes signature is proposed.** — ``` — `docs/tmux-layer-spec.md:355`
39. `P` **Proposed two-method abstraction rationale needs approval.** — **two separate methods** — merging them would force a conditional argv shape at every call site. — `docs/tmux-layer-spec.md:371`
40. `P` **showOption signature is proposed.** — ``` — `docs/tmux-layer-spec.md:381`
41. `P` **setOption signature is proposed.** — ``` — `docs/tmux-layer-spec.md:382`
42. `P` **unsetOption signature is proposed.** — ``` — `docs/tmux-layer-spec.md:383`
43. `P` **setWindowOption signature is proposed and only four methods are listed under five-method heading.** — ``` — `docs/tmux-layer-spec.md:384`
44. `P` **Proposed distinct option methods conflict with the shown multi-scope showOption bag.** — accidentally drop `-q`. — `docs/tmux-layer-spec.md:397`
45. `P` **bindKey signature is proposed and string command conflicts with spread argv example.** — ``` — `docs/tmux-layer-spec.md:412`
46. `P` **unbindKey signature is proposed.** — ``` — `docs/tmux-layer-spec.md:413`
47. `P` **bindReturnKey signature is proposed.** — ``` — `docs/tmux-layer-spec.md:414`
48. `P` **sendKeys signature is proposed and string keys conflicts with spread argv.** — ``` — `docs/tmux-layer-spec.md:415`
49. `P` **Proposed separate key methods and rationale need approval.** — `unbindKey` optional, which is exactly the regression §2.1 forbids. — `docs/tmux-layer-spec.md:430`
50. `P` **signalChannel signature is proposed.** — ``` — `docs/tmux-layer-spec.md:438`
51. `P` **waitFor signature is proposed.** — ``` — `docs/tmux-layer-spec.md:439`
52. `P` **Proposed fan-out ownership is unapproved.** — "too many arguments". The fan-out loop stays in the caller (`updateWorkspaceState`). — `docs/tmux-layer-spec.md:448`
53. `P` **attachSession signature is proposed.** — ``` — `docs/tmux-layer-spec.md:458`
54. `P` **switchClientAttach signature is proposed.** — ``` — `docs/tmux-layer-spec.md:459`
55. `P` **detachClient signature is proposed.** — ``` — `docs/tmux-layer-spec.md:460`
56. `P` **switchClientLast signature is proposed.** — ``` — `docs/tmux-layer-spec.md:461`
57. `P` **Proposed generic passthrough adapter is unapproved.** — `tmux-pane-lookup.ts` takes `cmd(command, args)`. Wire it to the layer as: — `docs/tmux-layer-spec.md:545`

**→ `docs/BLUEPRINT.md#observation-stop-and-deletion`** — 17 statement(s)

1. `G` **Exact absent-server versus transport-error parsing needs verification.** — | `listPanes` `:657` | `exitCode !== 0` → `/no server running/i.test(stderr)` → return `[]`; else throw | returns `readonly string[]` | — `docs/tmux-layer-spec.md:199`
2. `P` **Target syntax passthrough must not substitute for required ownership validation.** — `T` below is a tmux target id: `@<n>` window, `%<n>` pane, `$0` session. Passed through verbatim. — `docs/tmux-layer-spec.md:233`
3. `G` **killSession signature alone supplies no execution ownership authorization.** — ``` — `docs/tmux-layer-spec.md:295`
4. `G` **killSessionIfPresent signature requires exact absence and ownership semantics.** — ``` — `docs/tmux-layer-spec.md:296`
5. `P` **Proposed destructive argv requires exact owned target authorization.** — | `killSession` | `["kill-session", "-t", name]` (`:1090`) | — `docs/tmux-layer-spec.md:304`
6. `G` **killWindow signature requires validated resource ownership.** — ``` — `docs/tmux-layer-spec.md:322`
7. `G` **Destructive argv requires exact resource ownership.** — | `killWindow` | `["kill-window", "-t", target]` | `:406` | — `docs/tmux-layer-spec.md:329`
8. `G` **respawnPane signature requires destructive-effect ownership review.** — ``` — `docs/tmux-layer-spec.md:354`
9. `G` **listPanePids signature is not signaling authority.** — ``` — `docs/tmux-layer-spec.md:356`
10. `G` **Destructive respawn needs verified ownership and preserved command argument boundary.** — | `respawnPane` | `["respawn-pane", "-k", "-t", target, "-c", cwd, command]` | `-k` kills the existing process. `command` is the **entire** `workspaceCommand(…)` shell string as one argv element — do … — `docs/tmux-layer-spec.md:366`
11. `G` **Exact absence parsing and filter passthrough need verification.** — | `listPanes` | `["list-panes", "-a", "-f", filter, "-F", format]` when `filter` given, else `["list-panes", "-a", "-F", format]` | **§2.4 contract:** on `exitCode !== 0` return `[]` if `/no server … — `docs/tmux-layer-spec.md:367`
12. `G` **signalProcessTree signature lacks required exact execution provenance.** — ``` — `docs/tmux-layer-spec.md:416`
13. `G` **killPaneProcessTrees signature requires explicit scope and error-policy approval.** — ``` — `docs/tmux-layer-spec.md:417`
14. `P` **Proposed process-tree termination and timing lack exact ownership proof and approval.** — | `signalProcessTree` | no tmux argv — reads `ps -A -o "pid=,ppid="` via `Bun.spawn` (`:1085`) | children first then `SIGTERM`, `await Bun.sleep(100)`, then `SIGKILL`. `signalProcess` swallows ESRCH. … — `docs/tmux-layer-spec.md:425`
15. `P` **Exact missing-owned-target acceptance needs verified classifier.** — | 9 | kill-session absent | stderr `"can't find session: x"` resolves without throwing | — `docs/tmux-layer-spec.md:490`
16. `G` **Blanket constant freeze includes unsafe absence regex and needs current-contract reconciliation.** — `PANE_OUTPUT_TAIL_LINES`, `BOOTSTRAP_LOCK_*`.** — `docs/tmux-layer-spec.md:509`
17. `G` **Adapter example uses undefined absence classifier and must not swallow transport failures.** — ``` — `docs/tmux-layer-spec.md:553`

**→ `docs/CONVENTIONS.md#error-handling`** — 9 statement(s)

1. `P` **Exact wrapper result-versus-exception behavior needs verification and proposal disposition.** — become try/catch and loses the value-form contract. — `docs/tmux-layer-spec.md:49`
2. `G` **Preserve repeated-cleanup quiet-flag safeguard pending tmux behavior verification.** — | `unbind-key -q -T <table> <key>` | without `-q`, unbinding a key that was never bound exits non-zero → `require` throws → idempotent cleanup (`rebuildTopology`, `ensureHostUnlocked`) fails on a … — `docs/tmux-layer-spec.md:125`
3. `G` **Preserve absent-option cleanup safeguard pending verification.** — | `set-option -qu -t <session> <key>` | without `-q`, unsetting an absent option exits non-zero → `throw`. | — `docs/tmux-layer-spec.md:126`
4. `G` **Preserve error-channel distinctions pending exact wrapper contract review.** — ### 2.4 `exitCode` / `stderr` branching is preserved, not converted to exceptions — `docs/tmux-layer-spec.md:193`
5. `P` **Proposed value-versus-throw wrapper split needs approval.** — re-derive them. `require()` keeps throwing; `run()` never throws for a non-zero exit. — `docs/tmux-layer-spec.md:212`
6. `P` **TmuxExec.run proposed nonzero-value contract needs verification.** — ``` — `docs/tmux-layer-spec.md:271`
7. `P` **TmuxExec.require proposed failure-message and void contract needs verification.** — ``` — `docs/tmux-layer-spec.md:272`
8. `P` **TmuxExec.command proposed throw-and-result contract needs verification.** — ``` — `docs/tmux-layer-spec.md:273`
9. `G` **Preserve unexpected-error propagation while exact adapter conversion is unverified.** — `failure(error)` stays: only `TmuxCommandError` is convertible; anything else rethrows (`:667`). — `docs/tmux-layer-spec.md:280`

**→ `docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport`** — 4 statement(s)

1. `P` **Raw-argv wrapper strategy is proposed rather than accepted.** — ### This layer wraps RAW ARGV, not libtmux. — `docs/tmux-layer-spec.md:35`
2. `G` **Distinguishing expression passthrough from embedded-data escaping is a retained unverified injection safeguard.** — the *format itself* passes through raw. — `docs/tmux-layer-spec.md:227`
3. `G` **capture signature must be limited to current live screen rather than transcript persistence.** — ``` — `docs/tmux-layer-spec.md:353`
4. `P` **Proposed detach routing must target only the current client transport.** — | `detachClient` | `["detach-client", "-t", session]` | `exec.run` (non-throwing) when `process.env.TMUX` is unset (`:1049`). | — `docs/tmux-layer-spec.md:467`

**→ `docs/adr/README.md#active-decisions`** — 2 statement(s)

1. `P` **Proposed extraction has no implementation authorization or architecture approval.** — **Status:** spec only. No implementation exists or is authorised by this document. — `docs/tmux-layer-spec.md:20`
2. `P` **Proposed library migration deferral does not establish accepted strategy.** — This spec's existence is the reason they can be deferred. — `docs/tmux-layer-spec.md:503`

**→ `docs/CONVENTIONS.md#changes-and-refactoring`** — 2 statement(s)

1. `G` **Blanket byte-identical argv preservation needs current behavior approval and source verification.** — sites over libtmux a behaviour change, not a refactor: — `docs/tmux-layer-spec.md:42`
2. `G` **No-op extraction constraint does not approve obsolete runtime behavior.** — single emitted argv.** — `docs/tmux-layer-spec.md:54`

**→ `docs/CONVENTIONS.md#testing`** — 2 statement(s)

1. `P` **Proposed exact-argv tests require behavior approval and do not prove real tmux semantics.** — behaviour, so they run without a tmux server. — `docs/tmux-layer-spec.md:478`
2. `P` **Signature-arity assertion is an unapproved implementation-shaped test.** — | 4 | send-keys has no enter/literal params | `sendKeys.length === 2`; no exported option bag exposes `enter` or `literal` | — `docs/tmux-layer-spec.md:485`

**→ `docs/architecture/session-harness.md#runningexecution`** — 1 statement(s)

1. `P` **Bare search-key routing is a proposed exact argv safeguard needing verification.** — ### 2.2 `send-keys` is bare — DO NOT add Enter or `-l` — `docs/tmux-layer-spec.md:133`

**→ `docs/specs/sessions.md#observe-and-detach-from-a-live-session`** — 1 statement(s)

1. `G` **Capture scope and unused start-versus-lines options need reconciliation without stored transcripts.** — | `capture` | `["capture-pane", "-p", "-S", "-" + lines, "-t", target]` with `lines = 20` default | `-p` to stdout, `-S -20` to tail. Site `:466`. `start` is the line offset (negative = from history … — `docs/tmux-layer-spec.md:365`
