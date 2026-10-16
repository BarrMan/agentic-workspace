# Decision sheet — AoE status tracking and test suite

> **Non-authoritative working sheet.** Not a contract. Answers here are applied to the owning contracts and to each document's disposition markers.

Each group below is one document. Decide the group as a whole, select statements individually, or write a narrowing instruction.

- Group box: `[ ] Discard all` · `[ ] Approve all (integrate)` · `[ ] Select individually` · `[ ] Narrow further: ______`
- Per statement (only if selecting individually): `d` discard · `i` integrate · `?` still open.
- Class tag: `P` = proposal / unanswered claim (a policy answer can retire it) · `G` = evidence or safety gate (needs evidence, not a decision).

Family total: **294** statements — 45 P · 249 G.

## G1 · Agent of Empires: runtime lessons for Backlog

**Document:** `docs/agent-of-empires-runtime-research.md` · **5 statements** — 0 P · 5 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ _no owning contract — retire, or escalate as a new decision_** — 1 statement(s)

1. `G` **Research evidence does not authorize product changes.** — This note synthesizes verified librarian findings; it does not authorize implementation or migration. — `docs/agent-of-empires-runtime-research.md:22`

**→ `docs/BLUEPRINT.md#component-ownership`** — 1 statement(s)

1. `G` **Shared application ownership is specified but a blanket daemon prohibition is not.** — | Ordinary UI | Local TUI; optional feature paths can serve | No central lifecycle daemon | — `docs/agent-of-empires-runtime-research.md:86`

**→ `docs/architecture/session-harness.md#harness`** — 1 statement(s)

1. `G` **Exact OpenCode runtime adapter selection needs current adoption evidence beyond source.** — - Keep fixed modes, current task → project → user preset resolution, runtime OpenCode adapter selection, and existing harness-independent activity detection. — `docs/agent-of-empires-runtime-research.md:108`

**→ `docs/architecture/session-harness.md#route-runtime-events-and-observe`** — 1 statement(s)

1. `G` **Retaining existing harness-independent activity detection needs current adoption and provider evidence.** — - Keep fixed modes, current task → project → user preset resolution, runtime OpenCode adapter selection, and existing harness-independent activity detection. — `docs/agent-of-empires-runtime-research.md:109`

**→ `docs/CONVENTIONS.md#changes-and-refactoring`** — 1 statement(s)

1. `G` **Retain migration authorization backup and writer-quiescence gate until its current disposition is confirmed.** — Schema migration remains paused; any later migration requires final decisions and separate authorization, with backup and quiesced writers. — `docs/agent-of-empires-runtime-research.md:133`

## G2 · Agent of Empires — Reference Architecture for `agentic-workspace workspace`

**Document:** `docs/aoe-agent-workspace-reference.md` · **51 statements** — 16 P · 35 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host`** — 15 statement(s)

1. `G` **Attributing both bugs solely to UI substrate is an unverified causal inference.** — to tmux via inherited stdio and tmux draws everything. That single choice produces both reported bugs. — `docs/aoe-agent-workspace-reference.md:60`
2. `G` **External counterexample does not prove a shared root cause for both local bugs.** — tmux the UI substrate rather than a backend. — `docs/aoe-agent-workspace-reference.md:69`
3. `P` **Explicit input targeting is required but adopting this specific list-scroll suppression guard has no approval.** — selection mid-live-send would silently aim the next keystroke at another pane" (`input.rs:4486-4490`). **[comment]** — `docs/aoe-agent-workspace-reference.md:371`
4. `G` **Terminal ownership alone cannot establish that every process-lifetime exit bug is impossible.** — process group. Our bug is structurally impossible in this design rather than patched. — `docs/aoe-agent-workspace-reference.md:434`
5. `P` **Repeated architectural root-cause inference is not established by the external comparison.** — symptom: tmux is the UI substrate. — `docs/aoe-agent-workspace-reference.md:599`
6. `G` **Retaining a particular terminal instance across task navigation exceeds core execution-survival and attachment guarantees.** — `createWorkspaceAgent` creates one `EmbeddedTerminalRenderable` per agent. The controller retains that terminal across task navigation, while tmux streams raw output into it. OpenTUI owns ANSI … — `docs/aoe-agent-workspace-reference.md:696`
7. `G` **OpenTUI ownership of ANSI styling lacks a precise core technology or feature contract.** — `createWorkspaceAgent` creates one `EmbeddedTerminalRenderable` per agent. The controller retains that terminal across task navigation, while tmux streams raw output into it. OpenTUI owns ANSI … — `docs/aoe-agent-workspace-reference.md:696`
8. `G` **Native cursor visibility and shape ownership lacks a precise core contract.** — `createWorkspaceAgent` creates one `EmbeddedTerminalRenderable` per agent. The controller retains that terminal across task navigation, while tmux streams raw output into it. OpenTUI owns ANSI … — `docs/aoe-agent-workspace-reference.md:696`
9. `G` **Native paste handling lacks a precise core contract.** — `createWorkspaceAgent` creates one `EmbeddedTerminalRenderable` per agent. The controller retains that terminal across task navigation, while tmux streams raw output into it. OpenTUI owns ANSI … — `docs/aoe-agent-workspace-reference.md:696`
10. `G` **Native mouse reporting lacks a precise core contract.** — `createWorkspaceAgent` creates one `EmbeddedTerminalRenderable` per agent. The controller retains that terminal across task navigation, while tmux streams raw output into it. OpenTUI owns ANSI … — `docs/aoe-agent-workspace-reference.md:696`
11. `G` **Explicit prohibition of tmux attach is more specific than the approved terminal-host attachment boundary.** — AgenticWorkspace's `f` instead expands the same retained `EmbeddedTerminalRenderable` and hides workspace chrome. It does not run `tmux attach` or install another terminal emulator. OpenTUI keeps … — `docs/aoe-agent-workspace-reference.md:710`
12. `G` **OpenTUI-specific input ownership across both views lacks a precise core technology contract.** — AgenticWorkspace's `f` instead expands the same retained `EmbeddedTerminalRenderable` and hides workspace chrome. It does not run `tmux attach` or install another terminal emulator. OpenTUI keeps … — `docs/aoe-agent-workspace-reference.md:710`
13. `G` **OpenTUI-specific rendering ownership across both views lacks a precise core technology contract.** — AgenticWorkspace's `f` instead expands the same retained `EmbeddedTerminalRenderable` and hides workspace chrome. It does not run `tmux attach` or install another terminal emulator. OpenTUI keeps … — `docs/aoe-agent-workspace-reference.md:710`
14. `G` **OpenTUI-specific cursor ownership across both views lacks a precise core contract.** — AgenticWorkspace's `f` instead expands the same retained `EmbeddedTerminalRenderable` and hides workspace chrome. It does not run `tmux attach` or install another terminal emulator. OpenTUI keeps … — `docs/aoe-agent-workspace-reference.md:710`
15. `G` **OpenTUI-specific scrolling ownership across both views lacks a precise core contract.** — AgenticWorkspace's `f` instead expands the same retained `EmbeddedTerminalRenderable` and hides workspace chrome. It does not run `tmux attach` or install another terminal emulator. OpenTUI keeps … — `docs/aoe-agent-workspace-reference.md:710`

**→ _no owning contract — retire, or escalate as a new decision_** — 11 statement(s)

1. `G` **Reference evidence does not authorize behavior changes.** — **Status:** reference notes. Specifies **no** AgenticWorkspace change and authorises **no** implementation. — `docs/aoe-agent-workspace-reference.md:19`
2. `G` **External dependency unusedness was explicitly not exhaustively verified.** — files — **[inference]** vestigial for this path (not grepped exhaustively). — `docs/aoe-agent-workspace-reference.md:562`
3. `G` **External adjacent-finished navigation body was unread and stale shortcut inference remains unverified.** — likely comes from a configured per-tool hotkey letter navigating *finished* sessions. — `docs/aoe-agent-workspace-reference.md:584`
4. `G` **Structured preview debounce scope is explicitly retained among unverified external findings.** — input-side paste-burst detector. — `docs/aoe-agent-workspace-reference.md:587`
5. `G` **External dashboard paste synthesis remains unanswered.** — - Whether the dashboard composer synthesizes a paste burst internally was not found. — `docs/aoe-agent-workspace-reference.md:588`
6. `G` **This repeated external send finding is explicitly labeled unverified despite the earlier source claim.** — - No retry or queue exists for a failed dashboard send. — `docs/aoe-agent-workspace-reference.md:589`
7. `G` **External dependency retention remains unverified.** — - `portable-pty` may be vestigial; not grepped exhaustively. — `docs/aoe-agent-workspace-reference.md:590`
8. `G` **Foreground process group as the sole reason Ctrl+C works is an unverified causal inference.** — never leaves the foreground process group. — `docs/aoe-agent-workspace-reference.md:609`
9. `P` **Categorical absence of tmux session-list change notifications requires verification and is not established by this benchmark.** — `refreshDue()` fires at `CACHE_TTL/2` = 1 s and **tmux has no "session list changed" event**. — `docs/aoe-agent-workspace-reference.md:631`
10. `G` **External behavior does not define approved local requirements.** — Native behavior is intentionally not an AOE reimplementation. OpenTUI handles normal-buffer history scrolling and mouse-enabled alternate-screen input. The workspace does not add AOE's … — `docs/aoe-agent-workspace-reference.md:700`
11. `G` **External presentation reference does not authorize copying runtime ownership.** — AOE's full-window attach path is a presentation reference, not a terminal-ownership design to copy. At upstream commit `0a17c859173a8794abfb55ae7e8038c4c4b17e7d`: — `docs/aoe-agent-workspace-reference.md:704`

**→ `docs/screens/workspace.md#focus-and-constrained-terminals`** — 8 statement(s)

1. `P` **Historical symptom attribution and mandatory process.exit remedy are not established by the approved exit behavior.** — handler must call `process.exit` explicitly rather than merely unmounting. — `docs/aoe-agent-workspace-reference.md:50`
2. `G` **External exit routes alone do not prove the local failure is resolved.** — This is the structural answer to BACK-728's "panes dead, process alive holding the terminal." — `docs/aoe-agent-workspace-reference.md:410`
3. `P` **Exit-chord and pre_exec transfer recommendation is not a local signal implementation contract.** — never leaves the foreground process group. — `docs/aoe-agent-workspace-reference.md:609`
4. `G` **Attribution of the local bug to surviving handles is not independently established by the external reference.** — **unmount ≠ process exit**. Any surviving timer, worker, or socket holds the terminal. — `docs/aoe-agent-workspace-reference.md:648`
5. `G` **Native mouse-enabled alternate-screen behavior is absent from the precise workspace contract.** — Native behavior is intentionally not an AOE reimplementation. OpenTUI handles normal-buffer history scrolling and mouse-enabled alternate-screen input. The workspace does not add AOE's … — `docs/aoe-agent-workspace-reference.md:700`
6. `G` **Explicit exclusion of alternate-screen paging fallback needs confirmed disposition rather than inference from core silence.** — Native behavior is intentionally not an AOE reimplementation. OpenTUI handles normal-buffer history scrolling and mouse-enabled alternate-screen input. The workspace does not add AOE's … — `docs/aoe-agent-workspace-reference.md:700`
7. `G` **Explicit exclusion of custom Shift+Page handling needs confirmed disposition rather than inference from core silence.** — Native behavior is intentionally not an AOE reimplementation. OpenTUI handles normal-buffer history scrolling and mouse-enabled alternate-screen input. The workspace does not add AOE's … — `docs/aoe-agent-workspace-reference.md:700`
8. `G` **Hiding workspace chrome must preserve the approved visible Ctrl+Q hint row and exact remaining chrome is not specified.** — AgenticWorkspace's `f` instead expands the same retained `EmbeddedTerminalRenderable` and hides workspace chrome. It does not run `tmux attach` or install another terminal emulator. OpenTUI keeps … — `docs/aoe-agent-workspace-reference.md:710`

**→ `docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport`** — 8 statement(s)

1. `P` **Functional probing recommendation and applicability to the local transport require verification rather than approval by reference.** — tmux older than upstream first tested. — `docs/aoe-agent-workspace-reference.md:470`
2. `P` **Bind-arm-await startup ordering is prototype evidence whose current local applicability is not established.** — work: awaiting the dial-in before arming deadlocks until timeout. — `docs/aoe-agent-workspace-reference.md:479`
3. `P` **Proposed background TTL snapshot optimization has not been approved for the local runtime.** — fork count — there is no persistent connection (§4.5, §4.8). This helps under any UI. — `docs/aoe-agent-workspace-reference.md:604`
4. `G` **Adopting an exclusive pipe lease requires distinguishing transport ownership from shared execution ownership.** — returning over the same socket** on tmux 3.8+. — `docs/aoe-agent-workspace-reference.md:613`
5. `P` **Bidirectional socket addition is unapproved and its repeated 3.8+ premise conflicts with this document's correction.** — returning over the same socket** on tmux 3.8+. — `docs/aoe-agent-workspace-reference.md:613`
6. `P` **Functional-probe prescription remains an unapproved transport recommendation.** — Capability-probe functionally instead. — `docs/aoe-agent-workspace-reference.md:652`
7. `P` **Proposed landing layer for snapshot mechanisms is not an approved implementation assignment.** — `SESSION_ABSENT`, `tmux-pane-lookup.ts`). The layer this document's §2 mechanisms would land in. — `docs/aoe-agent-workspace-reference.md:661`
8. `P` **Query-response suppression is a specific claimed transport safeguard not established by the generic single-writer contract.** — Public CLI smoke checks for the native cutover verified styled output, Unicode, application cursor keys, bracketed paste, pane-local mouse coordinates, hidden cursors away from the live tail, … — `docs/aoe-agent-workspace-reference.md:698`

**→ `docs/adr/README.md#active-decisions`** — 5 statement(s)

1. `G` **General rejection of persistent control mode requires local applicability evidence and approval.** — connection is not a safe default, because the most common dev platform breaks it. — `docs/aoe-agent-workspace-reference.md:321`
2. `P` **Claim that reducing fork count is the only available optimization is not established by external source absence.** — fork count. — `docs/aoe-agent-workspace-reference.md:394`
3. `G` **No-persistent-connection and only-fork-count generalization requires local verification.** — fork count — there is no persistent connection (§4.5, §4.8). This helps under any UI. — `docs/aoe-agent-workspace-reference.md:604`
4. `G` **External control-mode failure does not approve a local architectural prohibition.** — milliseconds on macOS tmux 3.x (§4.5). — `docs/aoe-agent-workspace-reference.md:616`
5. `P` **Specific EmbeddedTerminalRenderable implementation is not established by the generic retained-terminal contract.** — AgenticWorkspace's `f` instead expands the same retained `EmbeddedTerminalRenderable` and hides workspace chrome. It does not run `tmux attach` or install another terminal emulator. OpenTUI keeps … — `docs/aoe-agent-workspace-reference.md:710`

**→ `docs/architecture/session-harness.md#runningexecution`** — 3 statement(s)

1. `G` **Sufficiency of token tables for safe provider permission responses requires verification.** — dashboard action available, and the per-agent token table is the entire mechanism. — `docs/aoe-agent-workspace-reference.md:538`
2. `P` **Async input batching and one-call typing target are recommendations rather than approved delivery requirements.** — must cost one call, not five. — `docs/aoe-agent-workspace-reference.md:606`
3. `G` **Delivery ownership is approved but OpenTUI key-encoding ownership is not specified.** — `createWorkspaceAgent` creates one `EmbeddedTerminalRenderable` per agent. The controller retains that terminal across task navigation, while tmux streams raw output into it. OpenTUI owns ANSI … — `docs/aoe-agent-workspace-reference.md:696`

**→ `docs/specs/session-interaction-and-feedback.md#session-interaction-and-feedback`** — 1 statement(s)

1. `P` **Proposed dashboard permission action has no recorded approval here.** — dashboard action available, and the per-agent token table is the entire mechanism. — `docs/aoe-agent-workspace-reference.md:538`

## G3 · AOE vs AgenticWorkspace lifecycle/efficiency comparison

**Document:** `docs/aoe-lifecycle-comparison.md` · **8 statements** — 2 P · 6 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/architecture/application-boundaries.md#stores-and-repositories`** — 2 statement(s)

1. `P` **Visible-read optimization is a proposal whose current need and adoption are unverified.** — | 1 | `readAll()` reads EVERY task `state.json` sequentially per refresh; cost scales with total tasks, not visible ones | `session-store.ts:234-259` (comment + sequential `await` loop); single … — `docs/aoe-lifecycle-comparison.md:49`
2. `G` **One-read performance invariant needs current measurement and adoption confirmation.** — Also cheaper only because of prior work (keep, do not regress): one batched session read per refresh `workspace-controller.ts:622-631` (was 85,547 reads / 3130 ms per refresh over 121 visible tasks). … — `docs/aoe-lifecycle-comparison.md:90`

**→ `docs/BLUEPRINT.md#observation-stop-and-deletion`** — 1 statement(s)

1. `G` **Batch-probe optimization needs current evidence and adoption rather than copying upstream.** — | 6 | `settleDeadSessions` probes STARTING/RUNNING sessions sequentially, one tmux exec each | `sessions.ts:492-513` (code comment marked "SUSPECT: unbounded sequential `await this.process.alive`"); … — `docs/aoe-lifecycle-comparison.md:54`

**→ `docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport`** — 1 statement(s)

1. `P` **Capture-file backoff adoption and relevance to the socket-stream target are unverified.** — | 8 | Fallback/existing capture polls the file every 250 ms (statSync) even with no new bytes | `agent-host.ts:197-216,240-242`; `existing-agent-host.ts:82-85` | Back off timer on N consecutive … — `docs/aoe-lifecycle-comparison.md:56`

**→ `docs/architecture/session-harness.md#harness`** — 1 statement(s)

1. `G` **Thread and polling strategy is not fixed by core.** — | Per-instance OS threads for session-ID polling (default 50-thread budget) | `src/session/poller.rs#L12-L40` | We have no daemon/step-2 session-ID protocol; thread-per-instance does not scale and … — `docs/aoe-lifecycle-comparison.md:65`

**→ `docs/BLUEPRINT.md#component-ownership`** — 1 statement(s)

1. `G` **Rejection rationale for external daemon technology is not an approved core decision.** — | ACP daemon + structured session feed + tracing session tee | `src/main.rs#L100-L165`, `src/acp/session_tee.rs#L1-L115` | Different product surface; adds a supervised process + transport for zero … — `docs/aoe-lifecycle-comparison.md:69`

**→ `docs/architecture/session-harness.md#route-runtime-events-and-observe`** — 1 statement(s)

1. `G` **Exact detection mechanisms and user rule surface lack current adoption evidence.** — | Manifest TOML rules engine + user `status_rules` | `manifest.rs#L371-L451,L507+` | Plan §8 non-goal; adds a parser + config surface for cases pane/title + hooks cover | — `docs/aoe-lifecycle-comparison.md:72`

**→ `docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host`** — 1 statement(s)

1. `G` **Rendering cadence and wake budget are not specified by core.** — | Always-on 33 ms event loop with 500 ms status schedule in one process | `app.rs#L535-L625` | Our renderer renders on change at 30 fps cap; an always-hot loop is pure wake cost at idle | — `docs/aoe-lifecycle-comparison.md:74`

## G4 · AOE-Style Lifecycle & Efficiency — Implementation Plan

**Document:** `docs/aoe-lifecycle-implementation-plan.md` · **39 statements** — 10 P · 29 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport`** — 10 statement(s)

1. `G` **Capture backoff and its latency bound need adoption confirmation.** — | 8 | §3.1 (`output` liveness source) | **Adjacent** | The resolver consumes output liveness; the fallback capture poll feeds those bytes. Phase L6 must never delay *live* bytes (§3.6). | — `docs/aoe-lifecycle-implementation-plan.md:189`
2. `G` **Cadence optimization and absolute live-owner safety claim need runtime validation and adoption.** — **Deliverable.** An armed VT pane costs ~0.5 forks/s at idle instead of 1/s, and a live owner can no longer be declared stale by a racing process. — `docs/aoe-lifecycle-implementation-plan.md:324`
3. `G` **Coupled lease constants and missed-beat tolerance need current adoption and evidence.** — | Constants | `src/agent-workspace/live/tmux/vt-channel.ts:98-100` | `VT_HEARTBEAT_MS` 1 s → 2 s **and** `VT_HEARTBEAT_STALE_MS` 3.5 s → 5 s. Update the constant's comment: the window must be ≥ 2 × … — `docs/aoe-lifecycle-implementation-plan.md:330`
4. `G` **Takeover bound and missed-beat safety tradeoff require verified current lease semantics.** — **Risk.** The comparison's stated fix (~2 s cadence with the existing 3.5 s stale window) is **wrong**: 2 s cadence tolerating one missed beat means a 4 s gap, so a *live* owner would be declared … — `docs/aoe-lifecycle-implementation-plan.md:342`
5. `G` **Capture-file backoff relevance and adoption remain unverified against socket streaming.** — **Deliverable.** The two 250 ms capture timers stop issuing an empty `stat`/`fstat` + `read` on every tick when nothing is arriving, while first-byte latency stays bounded. — `docs/aoe-lifecycle-implementation-plan.md:350`
6. `G` **Backoff cap reset and final-flush contract need adoption confirmation.** — | Fallback host | `src/agent-workspace/live/agent-host.ts:195-216`, `:241-242` | Keep the 250 ms tick but skip the `statSync` branch on consecutive empty reads and schedule the next read later, … — `docs/aoe-lifecycle-implementation-plan.md:356`
7. `P` **Watcher-reset and latency policy are proposed implementation details.** — | Attached host | `src/agent-workspace/live/existing-agent-host.ts:37-54`, `:82-85` | Same policy over `fstatSync`/`readSync` (`:41`), capped at 500 ms. Here the directory watcher (`:82`) is the … — `docs/aoe-lifecycle-implementation-plan.md:357`
8. `G` **Latency safety dependency must be revalidated before adopting or retiring backoff work.** — **Risk — coordinate with the status work.** The bytes this timer produces are the fallback transport's output stream, which the status resolver reads as its output-liveness source (§3.1 `output`). A … — `docs/aoe-lifecycle-implementation-plan.md:367`
9. `P` **Retain lease boundary tests pending adoption of the proposed timings.** — **L5 — new VT lease test (no suite covers `vt-channel.ts` today).** With an injected clock: beats are stamped at a 2 s cadence; a lease 4.1 s old is **not** stolen while the owner is beating; a lease … — `docs/aoe-lifecycle-implementation-plan.md:470`
10. `G` **Retain backoff reset and final-byte checks pending current transport disposition.** — **L6 — `opentui-existing-agent-host.test.ts` / `opentui-agent-host-cleanup.test.ts` (extend).** N empty ticks raise the cadence and cap it; one new byte resets it; `stop()` still performs a final … — `docs/aoe-lifecycle-implementation-plan.md:473`

**→ `docs/CONVENTIONS.md#testing`** — 10 statement(s)

1. `G` **Retain tab-coverage and runtime performance acceptance pending verification with a current corpus.** — **Review evidence.** In this repo (123 tasks): run `AGENTIC_WORKSPACE_DEBUG=store AGENTIC_WORKSPACE_DEBUG_FILE=/tmp/agentic-workspace-debug.log agentic-workspace workspace` and open the log — … — `docs/aoe-lifecycle-implementation-plan.md:224`
2. `G` **Phase-specific acceptance remains unverified rather than completed by mapping.** — **Stop condition.** `readAll.begin` reports only the active tab, every tab still renders its dots, and `src/agent-workspace/session-store.test.ts` proves the unfiltered path is behaviourally … — `docs/aoe-lifecycle-implementation-plan.md:233`
3. `P` **Retain batching runtime proof gate but require isolated owned targets before execution.** — **Review evidence.** Start three agents in three tasks, then in the app press Enter on a fourth and confirm the start is not stalled by the limit scan; run with `AGENTIC_WORKSPACE_DEBUG=tmux … — `docs/aoe-lifecycle-implementation-plan.md:251`
4. `G` **Batch acceptance and current API compatibility need verification without preserving superseded lifecycle semantics.** — **Stop condition.** One `listPanes` line per pass, all existing settle behaviour reproduced by tests, and `alive()`'s signature and output unchanged. — `docs/aoe-lifecycle-implementation-plan.md:261`
5. `G` **Retain idle-render and lease-takeover proof gates pending isolated runtime verification.** — **Review evidence.** Arm one agent and leave the workspace idle for 60 s with `AGENTIC_WORKSPACE_DEBUG=tmux AGENTIC_WORKSPACE_DEBUG_FILE=/tmp/agentic-workspace-debug.log`: the heartbeat's … — `docs/aoe-lifecycle-implementation-plan.md:335`
6. `P` **Lease acceptance gate is not established by this plan or mapping.** — **Stop condition.** Idle forks halve, no spurious takeover appears in a 60 s idle log, and a killed owner's lease is still reclaimed. — `docs/aoe-lifecycle-implementation-plan.md:345`
7. `G` **Retain bounded-latency and final-byte proof gate pending current isolated transport verification.** — **Review evidence.** Attach to a CLI-owned session, leave it idle for 60 s, and read `capture.idle` in the log sink: `emptyTicks` grows while `cadenceMs` caps at 500. Then type into the attached pane … — `docs/aoe-lifecycle-implementation-plan.md:361`
8. `G` **Phase transport acceptance remains unverified.** — **Stop condition.** Idle ticks back off and cap; typed input still echoes within ~1 s; teardown still flushes. — `docs/aoe-lifecycle-implementation-plan.md:371`
9. `G` **Retain filtered-read error and pool-completeness checks if the optimization is adopted.** — **L1 — `session-store.test.ts` (extend).** A filter of `[a, c]` reads exactly those two files: build a directory where the skipped files' contents would throw `invalid state` if read (a stronger … — `docs/aoe-lifecycle-implementation-plan.md:455`
10. `G` **Retain per-phase real-runtime gate until its disposition is confirmed.** — **Per-phase gate (all phases):** affected suites green, `bun run check:types`, scoped Biome on changed files, and one real `agentic-workspace workspace` run with the phase's described observation. No … — `docs/aoe-lifecycle-implementation-plan.md:503`

**→ `docs/architecture/application-boundaries.md#stores-and-repositories`** — 6 statement(s)

1. `P` **Conditional cache and watcher adoption remains unapproved.** — If the user later wants it, the safe form is: reuse `watchConfig` for invalidation, never an ad-hoc cache keyed on nothing. — `docs/aoe-lifecycle-implementation-plan.md:171`
2. `P` **Tab-scoped bounded parallel reading is a proposed optimization without current adoption evidence.** — **Deliverable.** One refresh still performs exactly one directory scan, but opens and parses `state.json` only for the tasks the active status tab can render, and does so with a bounded worker pool … — `docs/aoe-lifecycle-implementation-plan.md:211`
3. `P` **Exact filtered-read signature and missing-file semantics are proposed details.** — | Store filter | `src/agent-workspace/session-store.ts:234-257` | `readAll(taskIds?: readonly string[])`: build the accepted slug set (`slug`, `src/agent-workspace/session-utils.ts:23`) and skip … — `docs/aoe-lifecycle-implementation-plan.md:217`
4. `P` **Worker pool and concurrency 32 are unconfirmed optimization choices.** — | Parallel read | same, `:249-255` | Replace the serial loop with the repo's existing bounded worker-pool shape: `await Promise.all(Array.from({ length: Math.min(CONCURRENCY, entries.length) }, … — `docs/aoe-lifecycle-implementation-plan.md:218`
5. `G` **Exact eager-read performance constraint lacks current adoption evidence.** — | S1 config load | one `Promise.all` read (`workspace-controller.ts:808-813`) vs profile merge + migrations | L1 (must not split the eager read into more round-trips) | — `docs/aoe-lifecycle-implementation-plan.md:420`
6. `G` **Exact scan-count invariant needs current adoption and baseline evidence.** — | Refresh read (prior work, keep) | one batched session read per refresh, `#taskSessions` (`workspace-controller.ts:861-869`) — was 85,547 reads / 3130 ms over 121 visible tasks | L1 must keep it at … — `docs/aoe-lifecycle-implementation-plan.md:426`

**→ `docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host`** — 2 statement(s)

1. `G` **Conditional selection-diff optimization has no demonstrated current adoption.** — **Decision:** no work. The residual per-selection cost is not rendering — it is the snapshot reload a selection change triggers (`#viewState.subscribe` → `#scheduleRefresh`, … — `docs/aoe-lifecycle-implementation-plan.md:125`
2. `G` **Exact refresh scan and cache constraints need current adoption evidence.** — | 1 | §4.1 (refresh shape), §6.3 (anti-flicker) | **Adjacent** | The status plan changes *when the mount repaints* (`#applyActivity` → `setActivity`, `workspace-controller.ts:618-621`), not *what a … — `docs/aoe-lifecycle-implementation-plan.md:182`

**→ `docs/architecture/session-harness.md#session`** — 2 statement(s)

1. `G` **Batch API and task-only matching need current identity and multi-session validation.** — | Batch probe | `src/agent-workspace/session-process.ts:404-417,455-478` | **Add** `probePanes(sessions)` (final name settled in review): one `findTmuxPanesByTaskAndRole` call with `role: … — `docs/aoe-lifecycle-implementation-plan.md:244`
2. `G` **Batching and exact-result fixture expectations require current identity semantics.** — **L2 — `src/test/agent-sessions.test.ts` and `tmux-pane-lookup.test.ts` (extend).** With a recording `listPanes`, K=5 live records produce **one** call; a record with no row yields exactly … — `docs/aoe-lifecycle-implementation-plan.md:458`

**→ `docs/CONVENTIONS.md#tooling-and-validation`** — 1 statement(s)

1. `P` **Per-phase interactive acceptance gate should be retained pending disposition rather than inferred satisfied.** — **Review command for every phase:** `agentic-workspace workspace` (equivalently `bun run cli workspace`). No phase ends with documentation, tests, or internal components as its only deliverable. — `docs/aoe-lifecycle-implementation-plan.md:34`

**→ `docs/specs/sessions.md#sessions`** — 1 statement(s)

1. `G` **Current all-task observation and consumers must be verified before accepting the historical under-read assurance.** — **Risk.** The only correctness hazard is reading *too little*. Guarded because the mount renders only the active tab's rows (`workspace.ts:448`) and every other consumer uses the selected task's own … — `docs/aoe-lifecycle-implementation-plan.md:230`

**→ `docs/BLUEPRINT.md#observation-stop-and-deletion`** — 1 statement(s)

1. `P` **One-fork batching and exact legacy result shape are proposed implementation choices.** — **Deliverable.** A reconcile pass and a running-limit scan issue **one** `list-panes` fork for all durable panes instead of 1-3 forks per session, and every consumer still sees the exact `{exitCode, … — `docs/aoe-lifecycle-implementation-plan.md:238`

**→ `docs/architecture/session-harness.md#runningexecution`** — 1 statement(s)

1. `G` **Exact stderr and malformed-value fallback API need verification rather than becoming permanent interface rules.** — | Contract parity | same | A record with no row ⇒ `{ exitCode: 1, stdout: "", stderr: missingPaneStderr(session.id) }` — the **exact** string (`session-process.ts:120`), because `liveSession`'s … — `docs/aoe-lifecycle-implementation-plan.md:245`

**→ `docs/architecture/session-harness.md#harness`** — 1 statement(s)

1. `G` **Thread strategy rejection is not a current approved architecture decision.** — | Per-instance OS threads for session-ID polling (50-thread budget) | `src/session/poller.rs#L12-L40` | No daemon/step-2 session-ID protocol; thread-per-instance does not scale and Bun async + event … — `docs/aoe-lifecycle-implementation-plan.md:381`

**→ `docs/BLUEPRINT.md#component-ownership`** — 1 statement(s)

1. `G` **External technology rejection rationale lacks an effective core decision.** — | ACP daemon + structured session feed + tracing session tee | `src/main.rs#L100-L165`, `src/acp/session_tee.rs#L1-L115` | Different product surface; adds a supervised process and transport for no … — `docs/aoe-lifecycle-implementation-plan.md:385`

**→ `docs/architecture/session-harness.md#route-runtime-events-and-observe`** — 1 statement(s)

1. `G` **Detection engine rejection and sufficiency claims need current adoption evidence.** — | Manifest TOML rules engine + user `status_rules` | `manifest.rs#L371-L451,L507+` | Status-plan non-goal; a parser and config surface for cases pane/title + hooks already cover. | — `docs/aoe-lifecycle-implementation-plan.md:388`

**→ `docs/BLUEPRINT.md#authoritative-mutation-and-publication`** — 1 statement(s)

1. `G` **No-fsync preservation is not itself an approved durability guarantee.** — | S7 write path | `writeFileAtomic` = temp + rename, **no fsync** (`session-store.ts:78-82`) | L1 (keep the same write helper) | — `docs/aoe-lifecycle-implementation-plan.md:423`

**→ `docs/architecture/session-harness.md#readiness-and-identity-correlation`** — 1 statement(s)

1. `G` **Blanket absence of a live-provider gate cannot waive current provider acceptance proof.** — - No live-provider suite is a gate. Provider/tmux behaviour is verified in the app; automated tests use a fake `TmuxExec` and the real tmux test server (`src/test/tmux-test-server.ts`). — `docs/aoe-lifecycle-implementation-plan.md:484`

## G5 · AoE multi-client and deletion source audit

**Document:** `docs/aoe-multi-client-deletion-source-audit.md` · **8 statements** — 1 P · 7 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ _no owning contract — retire, or escalate as a new decision_** — 4 statement(s)

1. `G` **Research observations do not authorize architecture adoption.** — Useful bounded patterns: keep each UI’s selection local; serialize authoritative persisted mutations and reload current disk state under that lock; use notifications as refresh hints with a bounded … — `docs/aoe-multi-client-deletion-source-audit.md:88`
2. `G` **Draft implementation work is not behavioral approval.** — This is a proposed implementation sequence, not approval of BACK-27's draft artifacts or authorization to implement. — `docs/aoe-multi-client-deletion-source-audit.md:105`
3. `G` **Accidental-live cleanup uncertainty must remain open until verified rather than being retired by annotation.** — Migration, new-project admission, modes/schema conversion, startup witnesses, provider-v2 readiness, new daemons and changing tmux topology are not deletion prerequisites established by this audit. … — `docs/aoe-multi-client-deletion-source-audit.md:130`
4. `G` **External recovery methods do not authorize product lifecycle changes.** — - **Backlog mapping:** BACK-27 still means forgetting task associations, not AOE runtime-session deletion. AOE is a precedent only for shared tmux persistence and per-client selection; its … — `docs/aoe-multi-client-deletion-source-audit.md:155`

**→ `docs/architecture/application-boundaries.md#stores-and-repositories`** — 1 statement(s)

1. `P` **Exact peer notification fallback and selection clearing policy are not approved merely by upstream behavior.** — Useful bounded patterns: keep each UI’s selection local; serialize authoritative persisted mutations and reload current disk state under that lock; use notifications as refresh hints with a bounded … — `docs/aoe-multi-client-deletion-source-audit.md:86`

**→ `docs/specs/tasks.md#edge-cases-and-failures`** — 1 statement(s)

1. `G` **Permanent prohibition on deleted task-ID reuse is not settled by current deletion policy.** — The supplied **BACK-27/spec.md** contract is task deletion = forget task and Backlog associations for every status/owner. It expressly does **not** stop/kill a provider, delete provider … — `docs/aoe-multi-client-deletion-source-audit.md:95`

**→ `docs/specs/tasks.md#purpose`** — 1 statement(s)

1. `G` **Provider-owned file scope and any consent for its removal remain explicitly unresolved.** — Operational caveat: a still-running process may recreate Backlog-owned sidecars after task associations are forgotten. Removing those sidecars requires explicit user acceptance of that disruption; … — `docs/aoe-multi-client-deletion-source-audit.md:100`

**→ `docs/architecture/application-boundaries.md#application-controller`** — 1 statement(s)

1. `G` **Interactive versus noninteractive ask runtime proof is unresolved even though stopped-only ask intent is approved.** — - **Backlog mapping:** BACK-27 still means forgetting task associations, not AOE runtime-session deletion. AOE is a precedent only for shared tmux persistence and per-client selection; its … — `docs/aoe-multi-client-deletion-source-audit.md:156`

## G6 · AoE natural completion and resume: bounded source audit

**Document:** `docs/aoe-natural-completion-resume-source-audit.md` · **2 statements** — 0 P · 2 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/architecture/session-harness.md#runningexecution`** — 2 statement(s)

1. `G` **Blanket waiver of descendant settlement is not stated by the current owned-resource cleanup contract.** — AOE demonstrates a useful distinction between provider-native conversation identity, AOE instance identity, and tmux pane lifecycle, plus restart-with-same-native-ID semantics. Backlog adopts that … — `docs/aoe-natural-completion-resume-source-audit.md:54`
2. `G` **Confirm whether the no-descendant-proof exception meets the current complete owned-resource cleanup obligation.** — **Concrete takeaway:** AOE's live owned pane makes start skip; a dead pane is cleaned and the same instance's stored native conversation ID is relaunched with provider-native resume flags (subject to … — `docs/aoe-natural-completion-resume-source-audit.md:62`

## G7 · AOE-Style Agent Status Tracking — Implementation Plan

**Document:** `docs/aoe-status-tracking-plan.md` · **81 statements** — 4 P · 77 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/architecture/session-harness.md#route-runtime-events-and-observe`** — 23 statement(s)

1. `G` **Exact fs.watch path and ten-millisecond debounce need current implementation disposition.** — > what AOE does. — `docs/aoe-status-tracking-plan.md:95`
2. `G` **Temp-sidecar claim contradicts the deterministic task-directory sidecar later in this document.** — **Consequence:** the only durable artifact the activity axis touches is the ephemeral per-launch sidecar (§2.6), which lives inside the owned `mkdtemp` directory and is removed with it … — `docs/aoe-status-tracking-plan.md:160`
3. `G` **Specific hook-age and chrome interpretation require provider evidence.** — | fresh hook `running` (<30 s) or chrome spinner | `running` | — `docs/aoe-status-tracking-plan.md:167`
4. `G` **Provider-specific permission evidence must be verified.** — | hook `waiting`, or blocked-prompt chrome | `waiting` | — `docs/aoe-status-tracking-plan.md:168`
5. `G` **The displayed shell examples do not implement the claimed mode and uid guard and require verification.** — Properties copied verbatim from `src/hooks/command.rs:108-140`: `sh -c`, `set -f`, `umask 077`, dir-mode/ownership guard, **unconditional `exit 0`**. Ownership trailer is `0 # … — `docs/aoe-status-tracking-plan.md:238`
6. `G` **Exact provider event-to-activity mapping needs current signal verification.** — For the plugin/extension providers (opencode, pi, omp) the emitter is a JS/TS module that writes the same sidecar via `node:fs`, and must be **crash-safe and non-throwing** because a throwing … — `docs/aoe-status-tracking-plan.md:242`
7. `G` **Temporary status-directory location conflicts with the deterministic sidecar section.** — `launchEnvironment`, so it never leaks from the parent process. — `docs/aoe-status-tracking-plan.md:268`
8. `G` **Exact sidecar cleanup location must reconcile temp and deterministic task paths.** — except the one deliberate Codex install in §2.5. — `docs/aoe-status-tracking-plan.md:288`
9. `G` **Exact task-path layout conflicts with temp-sidecar statements and obsolete log and bootstrap neighbors.** — - Path: `<task dir>/<sessionId>.activity/status` — a **deterministic** per-session path derived from the session identity and the same task directory that already holds `<sessionId>.log` and … — `docs/aoe-status-tracking-plan.md:312`
10. `G` **Exact 900-second ceiling conflicts with the later removal of AOE timing and needs reconciliation.** — - Freshness is enforced for every status, not just `running`: a write older than the 900 s standing ceiling is ignored entirely, so a file orphaned by a hard-killed session reads as absent, never as … — `docs/aoe-status-tracking-plan.md:315`
11. `G` **Pane-title-output fallback and fidelity presentation require verified provider applicability.** — - **Attached external sessions** (CLI-owned, already running) read the same deterministic sidecar, so a CLI-started session shows the same activity as a workspace-started one. Only a pane … — `docs/aoe-status-tracking-plan.md:322`
12. `P` **Reserved user rule feature is unapproved and conflicts with the non-goal below.** — 6. configured per-agent rules (none initially; reserved) (AOE 5b). — `docs/aoe-status-tracking-plan.md:354`
13. `G` **External chrome rules require current provider evidence before adoption.** — 8. pane/title chrome rules for the six providers — the manifest equivalent (`src/tmux/detect/manifests/{claude,codex,opencode,pi,omp,antigravity}.toml`). — `docs/aoe-status-tracking-plan.md:358`
14. `G` **Exact watcher debounce and sidecar layout need current disposition.** — > rules above are retained only to document what AOE does. — `docs/aoe-status-tracking-plan.md:376`
15. `G` **Temp-only sidecar assertion conflicts with deterministic task-owned status path.** — **Review evidence:** launch each of claude/opencode/pi from the workspace; send a prompt (`running`), trigger a permission/approval prompt (`waiting`), end a turn (`idle`); confirm the file appears … — `docs/aoe-status-tracking-plan.md:523`
16. `G` **OMP and Antigravity chrome and external fidelity require verified support.** — **Deliverable:** derive-on-attach path; `unknown`-until-evidence; pane/title chrome rules for omp and antigravity; documented lower fidelity for attached external sessions. — `docs/aoe-status-tracking-plan.md:593`
17. `G` **Reload gate needs resolution of conflicting sidecar lifetime statements.** — **Stop:** reload semantics match §5. — `docs/aoe-status-tracking-plan.md:602`
18. `G` **Detection engine exclusion is an unconfirmed implementation choice and conflicts with reserved rules above.** — - No AOE manifest/TOML engine and no user-editable `status_rules` UI. — `docs/aoe-status-tracking-plan.md:625`
19. `G` **Temp-only sidecar restriction contradicts the deterministic task path.** — - **`[D2]` No activity persistence** — no `state.json` field, no settings key, no sidecar outside the ephemeral launch dir. — `docs/aoe-status-tracking-plan.md:634`
20. `G` **Copying empty-capture waiting precedence needs verification after removal of the AOE timer resolver.** — 4. **Stale `waiting` after Esc-cancel** — AOE issue #2937: `waiting` is written on prompt open, and Esc fires no clearing hook. Mitigation: `hook_waiting` is the lowest-priority hook rule and only … — `docs/aoe-status-tracking-plan.md:656`
21. `G` **Clarify external versus CLI-started sessions and verify fallback evidence before claiming all attached sessions lack sidecars.** — 9. **Attached external sessions have no sidecar.** Mitigation: pane/title fidelity, surfaced as such (§2.6); never `error`. — `docs/aoe-status-tracking-plan.md:666`
22. `G` **Waiting chrome fallback requires provider-specific current verification.** — - `waiting` hook with non-empty capture → falls to chrome; empty capture → `waiting`; — `docs/aoe-status-tracking-plan.md:713`
23. `G` **Temp-only assertion conflicts with deterministic task sidecar and explicit Codex exception.** — - generated commands/extensions contain only owned temp paths; no `~`, no project, no global path; — `docs/aoe-status-tracking-plan.md:721`

**→ `docs/architecture/session-harness.md#harness`** — 11 statement(s)

1. `G` **Owner-selected six-provider plan scope needs current supported-provider disposition and does not certify readiness.** — **Provider scope (user decision):** **Claude Code, OMP, Pi, OpenCode, Codex, Antigravity.** — `docs/aoe-status-tracking-plan.md:26`
2. `G` **Owner intent behind agy is explicitly assumed rather than confirmed.** — **Assumption — "agy":** the user wrote "agy"; this plan reads it as **Antigravity**. AOE defines `AgentDef` id `antigravity` with `aliases: &["agy"]` and binary `agy` (`src/agents.rs:796-802`), so … — `docs/aoe-status-tracking-plan.md:29`
3. `G` **OMP isolated loader and launch-gate removal need explicit verification.** — | **omp** | **No** hook_config (`src/agents.ts:846-875`) | hooks under `.omp/hooks/{pre,post}/` (project) or profile dirs; **`omp --hook <dir>`** explicit loader; `pi.on(...)` ExtensionAPI (OMP is a … — `docs/aoe-status-tracking-plan.md:190`
4. `G` **Lack of verified isolated loader remains an explicit capability gate.** — | **antigravity** | **No** hook_config (`src/agents.rs:796-808`) | `hooks.json` at workspace `.agents/hooks.json`, global `~/.gemini/config/hooks.json`, or a plugin's `hooks.json`; events … — `docs/aoe-status-tracking-plan.md:191`
5. `G` **OMP launch gate remains unresolved rather than certified by a plan.** — - `omp` — unreachable until its launch gate lifts; no code path today. — `docs/aoe-status-tracking-plan.md:283`
6. `G` **OMP hook path remains gated and unverified.** — | **omp** | `<owned temp dir>/hooks/pre/agentic-workspace-status.ts`, loaded via `--hook` | Removed with the temp dir. (Inactive until the launch gate lifts.) | — `docs/aoe-status-tracking-plan.md:302`
7. `G` **Antigravity isolated hook capability remains unresolved.** — | **antigravity** | none | n/a | — `docs/aoe-status-tracking-plan.md:303`
8. `G` **Earlier accepted trust bypass must be explicitly reconciled with the current provider launch gate rather than silently enabled or retired.** — **Deliverable:** merge-preserving write of `$CODEX_HOME/hooks.json` (else `~/.codex/hooks.json`) with the `0 # agentic-workspace-hooks` trailer; **constant command text** that reads the sidecar from … — `docs/aoe-status-tracking-plan.md:537`
9. `G` **Provider isolated-loader gates require current verification before lifting.** — - No hook install for **antigravity** (no isolated surface) and no active hook install for **omp** until its launch gate lifts (`session-launch.ts:166-171`). — `docs/aoe-status-tracking-plan.md:636`
10. `G` **Preserve prior trust-bypass decision pending explicit current launch-policy reconciliation and live hook proof.** — 2. **Codex hook trust.** New non-managed Codex hooks require review/trust (`/hooks`), and AOE's own approach preserves `[hooks.state]` rather than faking trust (`src/hooks/codex.rs:88-111`). … — `docs/aoe-status-tracking-plan.md:651`
11. `G` **Antigravity isolated-loader capability remains unanswered.** — 3. **Antigravity:** if a process-scoped hooks-file loader or config-dir env exists but is undocumented, it should be verified and this row revisited; otherwise Antigravity stays detection-only. — `docs/aoe-status-tracking-plan.md:677`

**→ `docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host`** — 10 statement(s)

1. `G` **Non-remounting presentation contract is useful but exact API and adoption are not settled by core.** — - Add a **non-remounting** update path: extend the mount with `setActivity(readonly Map<string, AgentActivity>)`, which mutates the existing `activeSessionTaskIds` state (`workspace.ts:94`) and calls … — `docs/aoe-status-tracking-plan.md:404`
2. `G` **Exact refresh invalidation policy is not a current core requirement.** — - Full refresh runs only when the *snapshot* changes (task set, selection, session identity), exactly as today. Activity changes ride `setActivity`. — `docs/aoe-status-tracking-plan.md:406`
3. `G` **Timer scheduling alone does not prove absence of input latency.** — - The tick runs on a timer, never on the paint path, so it cannot add input latency. — `docs/aoe-status-tracking-plan.md:418`
4. `G` **Exact idle fork and repaint budgets need current measurement.** — - Gated tick with no change → no tmux call, no repaint (AOE skip-capture + `refresh_needed` gate, `reference` §3.2). — `docs/aoe-status-tracking-plan.md:420`
5. `G` **Exact non-remounting update path needs adoption beyond source references.** — 1. Activity updates go through `setActivity` + `redraw` (`workspace.ts:406`), never a full `#scheduleRefresh` (`workspace-controller.ts:379`). — `docs/aoe-status-tracking-plan.md:483`
6. `G` **No-op render optimization is not an explicit current contract.** — 2. `setActivity` must be a no-op when the value is unchanged (avoids `requestRender` storms). — `docs/aoe-status-tracking-plan.md:485`
7. `G` **Stable-mount acceptance needs current adoption and verification.** — 3. The mount identity (`#mount`, `workspace-controller.ts:247`) must be stable across activity updates — assert in tests that `dispose` (`:363`) is not called. — `docs/aoe-status-tracking-plan.md:487`
8. `G` **Idle fork and no-remount acceptance require current adoption and runtime evidence.** — **Review evidence:** while idle, the workspace makes ~zero tmux status calls; changing activity repaints without a mount dispose. — `docs/aoe-status-tracking-plan.md:568`
9. `G` **Retain no-remount acceptance concern pending current presentation-policy adoption.** — 5. **Poll causing remount storm.** Mitigation: §6.3 — activity never via a full refresh; test asserts stable mount identity. — `docs/aoe-status-tracking-plan.md:658`
10. `P` **Exact stable-mount acceptance remains a proposed optimization contract.** — - N consecutive activity updates leave `#mount` identity unchanged (no `dispose`, `:363`) and do not call `mountWorkspace` again; — `docs/aoe-status-tracking-plan.md:741`

**→ `docs/architecture/session-harness.md#readiness-and-identity-correlation`** — 9 statement(s)

1. `G` **Upstream hook support alone does not establish current provider acceptance or detection-only capability.** — `[D1]`: hooks are unconditional for **supported** providers. "Supported" = AOE installs a status hook **or** the provider ships a documented event surface with a **process-scoped** loader. A provider … — `docs/aoe-status-tracking-plan.md:182`
2. `G` **Process-scoped Pi emitter acceptance needs live provider verification.** — | **pi** | **No** hook_config; AOE relies on its Pi *session-capture extension* for identity, not status (`src/agents.rs:680-694`) | extensions with lifecycle events (`session_start`, `tool_call`, … — `docs/aoe-status-tracking-plan.md:189`
3. `G` **Summary is not verified support and conflicts with the later dormant Codex launch arm.** — **Summary of the six:** hook-backed = **claude, codex, opencode, pi** (all four install); designed-but-gated = **omp**; detection-only = **antigravity**. — `docs/aoe-status-tracking-plan.md:194`
4. `G` **Retain real-provider hook transition and config-isolation proof until exercised.** — **Review evidence:** launch each of claude/opencode/pi from the workspace; send a prompt (`running`), trigger a permission/approval prompt (`waiting`), end a turn (`idle`); confirm the file appears … — `docs/aoe-status-tracking-plan.md:522`
5. `G` **Preserve real-event and global-write isolation acceptance gate.** — **Stop:** hook status changes on real events; zero global writes proven for the three providers. — `docs/aoe-status-tracking-plan.md:529`
6. `G` **Codex live launch acceptance remains gated and unverified.** — **Verification:** `bun test src/agent-workspace/status-hooks.test.ts` (byte-level round-trip on a fixture). No real Codex session can be exercised: `LAUNCH_REFUSALS` still refuses Codex launches for … — `docs/aoe-status-tracking-plan.md:544`
7. `G` **OMP and Antigravity detection proof remains outstanding.** — **Review evidence:** close and reopen the workspace; a previously `waiting` agent shows `unknown`, never stale `waiting` and never a false green; an OMP/Antigravity pane yields a pane-derived … — `docs/aoe-status-tracking-plan.md:598`
8. `G` **Retain per-provider real-session verification gate and do not infer support from upstream inventory.** — 1. **Provider hook schema unverified for the emitters** (Claude plugin `hooks.json` accepted from a `--plugin-dir`; OpenCode plugin discovery via `OPENCODE_CONFIG_DIR`; Pi `--extension`; OMP … — `docs/aoe-status-tracking-plan.md:647`
9. `G` **Preserve interactive provider acceptance and do not read no-live-suite as waiver of live verification.** — - No live-provider suite is a gate: provider hook schemas are verified interactively in §7; automated tests use recorded hook JSON fixtures and synthetic pane text only. — `docs/aoe-status-tracking-plan.md:753`

**→ `docs/specs/sessions.md#sessions`** — 5 statement(s)

1. `G` **Error mapping must preserve stopped versus unavailable evidence distinctions.** — | hook `error`, dead pane + hook, tmux error | `error` | — `docs/aoe-status-tracking-plan.md:170`
2. `G` **Keeping old activity without current evidence needs a bounded validity rule.** — 9. no match → keep last known activity (`src/tmux/detect/mod.rs:88-93`); on a cold attach with no evidence at all → `unknown`, never `idle` (`[D2]`). — `docs/aoe-status-tracking-plan.md:360`
3. `G` **Pausing observation under modals must reconcile the all-task thirty-second guarantee.** — - Pause polling while `#hasModal()` is true (`workspace-controller.ts:405`, `:419-429`) and while a session start/attach is in flight — those already schedule their own refresh. — `docs/aoe-status-tracking-plan.md:415`
4. `G` **Modal pause must be reconciled with required periodic observation.** — **Review evidence:** all listed failure modes hold (inconclusive probe leaves status unchanged with a notice; modal pauses polling; teardown leaves no timer). — `docs/aoe-status-tracking-plan.md:610`
5. `G` **Modal pause needs reconciliation with periodic runtime observation.** — - polling pauses while a modal owns focus (`#hasModal`, `workspace-controller.ts:405`); — `docs/aoe-status-tracking-plan.md:739`

**→ `docs/specs/supported-integration-operations.md#supported-integration-operations`** — 5 statement(s)

1. `G` **Automatic Codex install versus later explicit-only installation needs reconciliation.** — | **codex** | **Yes** — `json_hooks(".codex/hooks.json", CODEX_HOOK_EVENTS, HookFormat::CodexJson)` (`src/agents.rs:620-625`) | `hooks.json` next to the active config layer; inline `[hooks]` in … — `docs/aoe-status-tracking-plan.md:187`
2. `G` **Hooks-install command approval and dormant launch bypass need reconciliation with the selective API.** — through `agentic-workspace agent-session hooks install`. — `docs/aoe-status-tracking-plan.md:281`
3. `G` **Explicit hook-install and uninstall public commands need current API disposition.** — | **codex** | `$CODEX_HOME/hooks.json` else `~/.codex/hooks.json` (`src/hooks/mod.rs:80-90`) | **Marked, merge-preserving, reversible, implemented.** Install replaces our own groups with a canonical … — `docs/aoe-status-tracking-plan.md:301`
4. `G` **Codex hook verbs need current selective API disposition.** — **Deliverable:** merge-preserving write of `$CODEX_HOME/hooks.json` (else `~/.codex/hooks.json`) with the `0 # agentic-workspace-hooks` trailer; **constant command text** that reads the sidecar from … — `docs/aoe-status-tracking-plan.md:536`
5. `G` **Earlier trust-bypass and uninstall decision needs current API and provider-gate reconciliation without silently discarding its approval history.** — 2. ~~**Codex trust:** do we pass `--dangerously-bypass-hook-trust` for our launches, or require the user to trust the hook via `/hooks` once?~~ **Resolved: marked merge + … — `docs/aoe-status-tracking-plan.md:674`

**→ `docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport`** — 4 statement(s)

1. `G` **Exact capture gate and zero-tmux cost claim require adoption and measurement in the shared streaming design.** — Implement the AOE gate exactly: skip the capture when `window_activity == lastActivity` **and** `lastCaptureSecond > activity` **and** no fresh hook **and** no pending proposal … — `docs/aoe-status-tracking-plan.md:382`
2. `G` **Exact capture optimization and TTL require current streaming-path validation.** — 6. **tmux capture cost / alternate-screen.** Mitigation: `skip_capture` + batched metadata + 2 s TTL; never capture when activity is unchanged. — `docs/aoe-status-tracking-plan.md:660`
3. `G` **Preserve formatting-safety concern but verify exact command-layer applicability before promoting a blanket rule.** — 7. **`%` mangling in tmux format strings** (AOE correction in `docs/aoe-agent-workspace-reference.md` §6). Mitigation: use `display-message -p` with literal formats, never a bare `%` in a command … — `docs/aoe-status-tracking-plan.md:662`
4. `G` **Retain optimization boundary test if capture-gate adoption is confirmed.** — - `skip_capture` truth table including the "capture inside or before the activity second proves nothing" case (`status_update.rs:492-510`). — `docs/aoe-status-tracking-plan.md:717`

**→ `docs/CONVENTIONS.md#testing`** — 4 statement(s)

1. `G` **Hook launch source and PTY acceptance remain distinct pending evidence.** — **Verification:** `bun test src/agent-workspace/session-launch.test.ts`; PTY smoke of `agentic-workspace workspace`. — `docs/aoe-status-tracking-plan.md:527`
2. `G` **Retain performance acceptance until verified against current observation policy.** — **Stop:** no remount storm; idle fork budget holds. — `docs/aoe-status-tracking-plan.md:572`
3. `G` **Preserve visual PTY acceptance as distinct from source tests.** — **Verification:** `bun test src/test/opentui-workspace-layout.test.ts src/test/opentui-status-tabs.test.ts` (tabs must stay green and unmodified); PTY smoke. — `docs/aoe-status-tracking-plan.md:585`
4. `G` **Reopen runtime acceptance is separate from controlled controller tests.** — **Verification:** `bun test src/test/opentui-workspace-controller.test.ts`; PTY reopen smoke. — `docs/aoe-status-tracking-plan.md:600`

**→ `docs/architecture/session-harness.md#session`** — 3 statement(s)

1. `G` **Stale-shell and chrome evidence cannot automatically prove idle.** — | hook `idle`, parked prompt chrome, stale shell | `idle` | — `docs/aoe-status-tracking-plan.md:169`
2. `G` **Output bytes alone do not establish provider activity and require an evidence contract.** — | `output` | live byte liveness | the controller's output subscription | — `docs/aoe-status-tracking-plan.md:337`
3. `G` **Exact immediate-attach batching and output-evidence mechanism needs current verification.** — - **Derive on attach/open.** When the workspace mounts a session, the resolver runs immediately over the available live evidence: the ephemeral sidecar (if we own the launch), the batched tmux probe, … — `docs/aoe-status-tracking-plan.md:437`

**→ `docs/CONVENTIONS.md#tooling-and-validation`** — 3 statement(s)

1. `G` **Retain interactive phase acceptance gates pending current disposition.** — Format mirrors `docs/opentui-workspace-implementation-plan.md` (deliverable → slices → review evidence → stop condition). Every phase is reviewable via `agentic-workspace workspace` or `bun run cli … — `docs/aoe-status-tracking-plan.md:499`
2. `G` **User visual acceptance is not evidenced by this plan.** — **Stop:** visual stability confirmed by the user. — `docs/aoe-status-tracking-plan.md:587`
3. `P` **User phase approval is not established by this plan.** — **Stop:** user approves; no full-app test run required at any point. — `docs/aoe-status-tracking-plan.md:615`

**→ `docs/architecture/session-harness.md#runningexecution`** — 2 statement(s)

1. `G` **Exact pane metadata evidence and provider interpretation need verification.** — | `pane` | `#{pane_dead}`, `#{pane_current_command}`, `#{pane_title}`, `#{window_activity}` | `src/agent-workspace/live/tmux/exec.ts:81` (`createTmuxExec`), `session-process.ts:228` (`#{pane_dead}`) | — `docs/aoe-status-tracking-plan.md:336`
2. `G` **Batch-probe API and cache timings require current adoption evidence.** — - One **batched** tmux probe per tick for all live sessions (`list-panes -a`-style metadata), never one fork per session; TTL 2 s, refresh at half-life. Reuse `createTmuxExec` … — `docs/aoe-status-tracking-plan.md:413`

**→ `docs/screens/workspace.md#states`** — 2 statement(s)

1. `P` **Exact placeholder copy is explicitly not approved.** — | Agent placeholder | `workspace.ts` agent pane | `waiting` → "Agent is waiting for input."; keep existing `starting`/`error` strings. | — `docs/aoe-status-tracking-plan.md:471`
2. `G` **Flicker-free runtime acceptance still needs evidence rather than a source-only claim.** — **Review evidence:** real `agentic-workspace workspace` shows green→yellow→dim transitions without flicker; tabs unchanged. — `docs/aoe-status-tracking-plan.md:582`

## G8 · Backlog.md test-suite improvement report

**Document:** `docs/test-suite-improvement-report.md` · **66 statements** — 11 P · 55 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/CONVENTIONS.md#testing`** — 28 statement(s)

1. `G` **Git/provider setup and inherited override exception require reconciliation with current preload contract.** — - The preload establishes Git test identity, removes workspace/provider pinning variables, and supplies a unique tmux socket when no override exists. Dedicated tmux helpers enforce test-owned labels … — `docs/test-suite-improvement-report.md:97`
2. `G` **Inherited override and nested-runner policy require reconciliation with later trusted-override decision.** — **Why it matters:** with an ordinary clean environment, deleting an environment-clearing line could leave the existing assertion green. A supplied nonblank socket survives the preload; the source … — `docs/test-suite-improvement-report.md:137`
3. `P` **Retention of this historical constructor check is not established by current core.** — **Smallest improvement:** add one parameterized child/preload observation contract using a fixture-owned process and seeded workspace/provider variables. Observe only serialized environment/socket … — `docs/test-suite-improvement-report.md:139`
4. `G` **Preserve these isolation mechanisms pending reconciliation with native runner and trusted override policy.** — **Preserve:** nested-runner ownership, inherited fixture scopes, provider-config clearing, and test-owned cleanup registration. Do not weaken socket guards to make the harness simpler. — `docs/test-suite-improvement-report.md:141`
5. `G` **Narrow-selection safety expectation needs disposition under native runner without reinstating withdrawn self-tests.** — **Smallest improvement:** make the workflow use the existing lane environment variable; choose one intentional CLI artifact handoff and remove the redundant build only after preserving compiled smoke … — `docs/test-suite-improvement-report.md:149`
6. `G` **Exact platform profile JUnit and whole-run deadline gates need current execution-policy confirmation.** — **Preserve:** the cross-OS platform contract profile, bounded deadline, JUnit artifacts, and separate distribution/compiled checks. Do not replace the platform profile with indiscriminate … — `docs/test-suite-improvement-report.md:151`
7. `P` **Historical platform-matrix restriction is not established by current core.** — **Preserve:** the cross-OS platform contract profile, bounded deadline, JUnit artifacts, and separate distribution/compiled checks. Do not replace the platform profile with indiscriminate … — `docs/test-suite-improvement-report.md:151`
8. `P` **Exact probe coalescing contract was conditional and not approved here.** — **Smallest improvement:** for reset, create two staged paths in a temporary repository, invoke public `resetPaths`, and independently inspect staged versus unstaged changes and the untouched file. … — `docs/test-suite-improvement-report.md:179`
9. `G` **Preserve exact Git path and filesystem-only obligations pending current boundary-contract review.** — **Preserve:** path normalization, root scoping, filesystem-only policy, bounded external commands, inherited-pipe settlement, and timer/resource release. A command-dispatch assertion is legitimate in … — `docs/test-suite-improvement-report.md:181`
10. `G` **Exact parsing efficiency requirement remains conditional.** — **Smallest improvement:** express races through concurrent public listing/loading and gate file reads at the filesystem boundary. Assert later reads never publish stale/deleted content, returned … — `docs/test-suite-improvement-report.md:189`
11. `G` **Preserve watcher byte duplicate detach rename and malformed/absent obligations pending current supported-surface review.** — **Preserve:** exact initial JSON bytes, no duplicate output, post-detach silence, real atomic-rename coverage, malformed versus absent distinction, and branch-only task preservation. — `docs/test-suite-improvement-report.md:201`
12. `G` **Separate type-fixture need remains conditional.** — **Smallest improvement:** keep the first prototype-key persistence/approval/revoke contract intact. Replace the literal-only case with an actual configuration load/validation plus public artifact … — `docs/test-suite-improvement-report.md:229`
13. `G` **Preserve security-relevant key and byte checks until retained storage contracts are identified separately from obsolete approval.** — **Preserve:** optional declarations are not a filename allowlist; approval records for `__proto__`, `constructor`, and `toString` persist and revoke independently; bytes/hashes remain exact. Do not … — `docs/test-suite-improvement-report.md:231`
14. `G` **Admission closure guarantee belongs to retired runner and needs disposition.** — **Preserve:** unknown/survivor means nonzero outcome plus retained evidence; no TMPDIR deletion before terminal proof; no launch after closed admission; bounded capture; concurrent settlement … — `docs/test-suite-improvement-report.md:251`
15. `G` **Preserve output resource bound pending current cleanup-boundary review.** — **Preserve:** unknown/survivor means nonzero outcome plus retained evidence; no TMPDIR deletion before terminal proof; no launch after closed admission; bounded capture; concurrent settlement … — `docs/test-suite-improvement-report.md:251`
16. `G` **Preserve exact owned-process authentication gate pending replacement of retired ledger machinery.** — **Preserve:** unknown/survivor means nonzero outcome plus retained evidence; no TMPDIR deletion before terminal proof; no launch after closed admission; bounded capture; concurrent settlement … — `docs/test-suite-improvement-report.md:251`
17. `P` **Exact platform scheduling and manifest proposal was not approved and F13 self-test expansion was withdrawn.** — **Smallest improvement:** enumerate required gates and OS prerequisites in the execution manifest/report, use explicit skips for unsupported cases, and require at least one scheduled/job-owned route … — `docs/test-suite-improvement-report.md:259`
18. `P` **Exact suite split remains a proposal and does not replace honest-fixture remediation.** — - Split large controller tests by behavior ownership: selection/navigation, group edits, composer persistence, configuration save/cancel, shared session attachment, and observation. Splitting without … — `docs/test-suite-improvement-report.md:298`
19. `G` **Preserve these UI regression obligations until mapped to current screen and approval contracts individually.** — - Preserve cancellation with no disk writes, reopening persisted settings, independent validation across categories, prompt/model/provider selection, safe approval projection, multi-reader detach, … — `docs/test-suite-improvement-report.md:300`
20. `P` **Snapshot reduction is an unapproved recommendation requiring current coverage equivalence review.** — - Native frame/assertion duplication is S-only in unreviewed files. Prefer semantic visible labels/focus and a few fixed-size representative frames over broad snapshot churn. — `docs/test-suite-improvement-report.md:301`
21. `P` **Exact smoke count and entrypoint remain a recommendation requiring retained coverage review.** — - Use one small real owned tmux/transport smoke for actual rows/socket forwarding and terminal attachment. Stub executables such as transport-detach test commands are external-boundary integration, … — `docs/test-suite-improvement-report.md:317`
22. `G` **Exact authentication machinery and withdrawn harness test retention need execution-policy reconciliation.** — - Keep fake clock/probe/signal tests for arbitrary PID/UID/recycle/provenance failures; keep real process checks restricted to authenticated fixture-owned identities. — `docs/test-suite-improvement-report.md:340`
23. `P` **Proposed parameterization requires targeted review of these signal-only files.** — - Parameterize shell/input/env combinations and retain error outcomes. Their S status means there is no verified defect in these files in this audit. — `docs/test-suite-improvement-report.md:350`
24. `P` **Unreviewed coverage questions require targeted current-contract review and do not establish missing scenarios.** — Additional targeted questions for S files: permission errors versus malformed data, cancellation during bootstrap/ask/save, duplicate identity at mutation time, custom backlog roots and root … — `docs/test-suite-improvement-report.md:374`
25. `P` **Exact proposed seam approval remains conditional.** — The following are short rewrite sketches grounded in actual reviewed tests, not executed patches. Fixture setup and teardown are omitted for readability; any implementation must keep them. Agree the … — `docs/test-suite-improvement-report.md:378`
26. `G` **Preserve independent compiled smoke and JUnit obligations pending execution-policy reconciliation.** — | 2. CI/runner | One intended CLI artifact handoff | Helpers run that artifact; redundant CI build removed only when separate compiled smoke remains; JUnit paths still valid | — `docs/test-suite-improvement-report.md:480`
27. `G` **Additional manifest/report mechanism remains conditional and F13 self-tests were withdrawn.** — - Use the runner's existing structured report for per-file wall time, completed/pending/failed files, lane count, build time and deadline diagnostics. Add skipped/gated contract accounting if needed. — `docs/test-suite-improvement-report.md:497`
28. `G` **Exact report and platform checks need current runner applicability confirmation without reinstating withdrawn self-tests.** — - Check that generated JUnit names do not collide, platform manifest entries exist, and required real-boundary cases actually execute. No claim about current timings or test success is made here. — `docs/test-suite-improvement-report.md:500`

**→ `docs/SPEC.md#open-product-decisions`** — 13 statement(s)

1. `G` **Exact MCP seam and retained scope require integration-scope disposition.** — | MCP `testInterface.callTool` and schema discovery | Tool schema, validation, response/error contract | Real stdio connection and compiled packaging | — `docs/test-suite-improvement-report.md:109`
2. `G` **Preserve persisted compiled roundtrip coverage intent while current MCP retention and smoke route remain unsettled.** — **Smallest improvement:** update smoke assertions to public JSON task queries or the agreed current repository container contract; record actual child statuses and bound settlement of only recorded … — `docs/test-suite-improvement-report.md:269`
3. `G` **Retained stdio and resource-registration obligations depend on integration-scope disposition.** — **Preserve:** unique IDs, draft promotion/demotion, lost-write protection, compile target version, stdio startup, resource registration, and cleanup error reporting. Remove this smoke script only if … — `docs/test-suite-improvement-report.md:271`
4. `G` **Historical init and guidance surfaces need retained API disposition.** — - Packaging, root entry, launcher, pipe, init/no-Git, cursor PTY, and editor handoff remain distinct boundary tests. Verify which executable each test uses. — `docs/test-suite-improvement-report.md:284`
5. `G` **Retained MCP scope and exact test seam are unresolved.** — - Prefer `testInterface.callTool` for schema/validation/result/error contracts and a small real stdio lifecycle suite for handshake/framing/cleanup. — `docs/test-suite-improvement-report.md:289`
6. `G` **Exact retained protocol content contract needs integration-scope confirmation.** — - The inspected tool tests already exercise public behavior. Factor repeated temporary-project and content extraction code only when actually repeated; reject malformed content shapes where the … — `docs/test-suite-improvement-report.md:290`
7. `G` **Preserve adapter validation and containment safety pending retained MCP contract disposition.** — - Keep enum canonicalization, unknown values, workspace-root containment, client roots, and no-remote behavior as adapter-specific regressions. Preserve error results and disk nonmutation on … — `docs/test-suite-improvement-report.md:291`
8. `G` **Historical identity syntax repair and Git scope matrix needs current supported-operation review.** — | Identity/prefix/IDs/worktrees/duplicates | Canonical identity versus display representation, ambiguity refusal, padded/subtask IDs, separate branch content, collision repair and scope of Git … — `docs/test-suite-improvement-report.md:328`
9. `G` **Retained board/statistics/readme surfaces and exact edge outcomes need owning-contract review.** — | Board/groups/reorder/statistics/readme | Deterministic ordering, boundary moves, empty/unknown statuses, nonmutation, real group persistence and minimal surface presentation | — `docs/test-suite-improvement-report.md:331`
10. `G` **Exact historical offline/editor API and platform obligations need retained-surface review.** — | Git/offline/local-only/runtime/editor/packaging | Real temporary Git where required, process-boundary denial of remote work, canonical runtime cwd, input handoff, package resolution/platform … — `docs/test-suite-improvement-report.md:333`
11. `G` **Exact guidance and completion surfaces require current API disposition before prescribing coverage.** — - `commands/completion`, `commands/skill`, `completions/helper`, and `utils/read-output-mode` should test actual exported behavior: shell choice, quoting/prefix/help failures, completion shape and … — `docs/test-suite-improvement-report.md:349`
12. `G` **Exact retained compiled mutation route depends on supported integration scope.** — | Source CLI versus compiled/package behavior | Distinct runner bundle, compiled smoke and Nix checks inspected | Compiled create/read roundtrip; record artifact identity. Installed CLI remains … — `docs/test-suite-improvement-report.md:371`
13. `G` **Exact retained compiled mutation route and scheduled gate ownership require current scope disposition.** — | 7. Smoke/gates | Current-layout parallel query and compiled create/read | Exact successful-writer results and child statuses; bounded fixture-only settlement; compiled roundtrip persisted; each … — `docs/test-suite-improvement-report.md:489`

**→ `docs/CONVENTIONS.md#error-handling`** — 6 statement(s)

1. `G` **Preserve historical terminal-proof and evidence-retention gate pending reconciliation with retired runner and disposable scratch policy.** — - Workers share a run-scoped temporary root but use unique project directories. Owned-process scopes, authenticated identity ledgers, cancellation, and terminal settlement govern runner cleanup. … — `docs/test-suite-improvement-report.md:96`
2. `G` **Preserve unresolved-cleanup failure and evidence gate pending native-runner reconciliation.** — **Preserve:** unknown/survivor means nonzero outcome plus retained evidence; no TMPDIR deletion before terminal proof; no launch after closed admission; bounded capture; concurrent settlement … — `docs/test-suite-improvement-report.md:251`
3. `G` **Reconcile terminal-proof deletion gate with later disposable-scratch policy without losing ownership evidence.** — **Preserve:** unknown/survivor means nonzero outcome plus retained evidence; no TMPDIR deletion before terminal proof; no launch after closed admission; bounded capture; concurrent settlement … — `docs/test-suite-improvement-report.md:251`
4. `G` **Historical concurrent settlement guarantee needs current owner confirmation.** — **Preserve:** unknown/survivor means nonzero outcome plus retained evidence; no TMPDIR deletion before terminal proof; no launch after closed admission; bounded capture; concurrent settlement … — `docs/test-suite-improvement-report.md:251`
5. `G` **Preserve old registry admission interruption reporting and uncertainty gates until retired runner responsibilities are reconciled.** — - Keep unique sockets, safe labels, authenticated registry/ledger state, timeout diagnostics, signal interruption, deadline-aware admission, pending-file reporting, and evidence retention on … — `docs/test-suite-improvement-report.md:342`
6. `G` **Preserve exact terminal-proof and uncertainty gates pending retired runner and scratch-policy reconciliation.** — | No cleanup before authenticated terminal proof | Present fake runner and real lifecycle chunks | Keep unknown/survivor/rejection, inherited pipes, checkpoint failure, closed admission and retry | — `docs/test-suite-improvement-report.md:363`

**→ `docs/specs/sessions.md#sessions`** — 6 statement(s)

1. `G` **Exact historical states and service entrypoints require reconciliation with ephemeral observation and model ownership.** — **Smallest improvement:** retain a compact boundary fixture and separate named table cases for live STARTING, dead, conclusively missing without a request, missing with a queued request, and … — `docs/test-suite-improvement-report.md:169`
2. `G` **Preserve queued-start safety intent while reconciling exact historical lifecycle state.** — **Preserve exactly:** observation never kills; queued missing-pane STARTING remains STARTING; transient errors are nonmutating; explicit stop is separately allowed to mutate. Do not resurrect an old … — `docs/test-suite-improvement-report.md:171`
3. `G` **Historical state matrix needs current observation-contract reconciliation.** — - Use table cases for the catalog/default mode, custom modes, stale active IDs, stopped/starting/running states, and malformed config. Keep mode-local histories independent. — `docs/test-suite-improvement-report.md:307`
4. `G` **Exact queued STARTING representation needs reconciliation without losing uncertainty safety.** — - Preserve missing-pane queued STARTING, nonmutating errors, no observation teardown, and explicit stop ownership. Do not add backward-compatibility tests for unsupported persisted formats; ask the … — `docs/test-suite-improvement-report.md:308`
5. `G` **Exact queued STARTING rule requires current observation and recovery reconciliation.** — | Queued request + absent pane is STARTING | Present in shared-runtime observation case | Named isolated case, independent of obsolete backend flag semantics | — `docs/test-suite-improvement-report.md:359`
6. `G` **Exact historical queued STARTING outcome needs reconciliation.** — | 3. Lifecycle | Queued missing-pane STARTING named scenario | No kills, STARTING retained, uncertain probes nonmutating; explicit stop tested separately | — `docs/test-suite-improvement-report.md:482`

**→ _no owning contract — retire, or escalate as a new decision_** — 5 statement(s)

1. `G` **No blanket authorization to preserve legacy flag compatibility.** — **Smallest improvement:** retain a compact boundary fixture and separate named table cases for live STARTING, dead, conclusively missing without a request, missing with a queued request, and … — `docs/test-suite-improvement-report.md:169`
2. `G` **Exact legacy filter and retained transport obligations need current contract reconciliation.** — **Preserve:** independent expected IDs, legacy untyped exclusions, OR/casing/composed filters, transport schemas, local-only behavior, and malformed-input errors. Two surfaces agreeing can both be … — `docs/test-suite-improvement-report.md:241`
3. `G` **Retained fields and aliases require current API reconciliation rather than historical blanket preservation.** — - Put repeated ID/filter/status/type/project/milestone combinations in literal Core scenario tables; preserve CLI-specific parsing, aliases, repeated/comma arguments, exit status, empty result, and … — `docs/test-suite-improvement-report.md:280`
4. `G` **Legacy compatibility requires explicit owner approval.** — - Preserve missing-pane queued STARTING, nonmutating errors, no observation teardown, and explicit stop ownership. Do not add backward-compatibility tests for unsupported persisted formats; ask the … — `docs/test-suite-improvement-report.md:308`
5. `G` **Unknown-field preservation recursive docs and retained containment/key checks require current representation and surface review.** — | Markdown/frontmatter/content/artifacts/docs/references | Independent literal parse/serialize examples, unknown-field/body preservation, recursive docs, path containment, byte-bound approval and … — `docs/test-suite-improvement-report.md:327`

**→ `docs/BLUEPRINT.md#component-ownership`** — 2 statement(s)

1. `G` **Historical session-service seam must be reconciled with concrete model and application ownership.** — | Session service public lifecycle with typed external-boundary doubles | Ownership, observation, resume/forget semantics, error nonmutation | Installed provider compatibility or real tmux parsing | — `docs/test-suite-improvement-report.md:110`
2. `G` **Exact historical service operations must follow current model/application ownership.** — - Agree service lifecycle versus transport seams. Replace service-internal field access with public start/list/live/ask/stop/forget behavior, keeping identity/provenance negative assertions. — `docs/test-suite-improvement-report.md:313`

**→ `docs/specs/tasks.md#edge-cases-and-failures`** — 2 statement(s)

1. `G` **Preserve admission safety checks while exact concurrent deletion and retry outcomes remain open.** — **Preserve:** at least one writer succeeds; failed writers fail loudly and contribute no labels; every successful writer's label survives; deletion locks prevent all competing session admission … — `docs/test-suite-improvement-report.md:211`
2. `G` **Exact deletion-race outcomes remain open while admission safety must be preserved.** — | Deletes cannot admit concurrent session work | Present in `task-delete` with four admission routes | Guarantee gate release/drain; route parameterization with no process calls | — `docs/test-suite-improvement-report.md:365`

**→ `docs/specs/tasks.md#using-task-artifacts`** — 1 statement(s)

1. `G` **Preserve file containment coverage while confirming the retained repository seam.** — | Artifact repository public read/write/approval APIs | Path containment, byte hashes, approval invalidation | Full UI routing | — `docs/test-suite-improvement-report.md:113`

**→ `docs/BLUEPRINT.md#application-controller-and-stores`** — 1 statement(s)

1. `G` **Exact lost-ack resource-retention behavior needs current transport contract confirmation.** — **Preserve:** no pane destruction before provenance validation; lost ACK retains resources; failed kill retains retry evidence; conclusively missing instance is distinct from an arbitrary error … — `docs/test-suite-improvement-report.md:221`

**→ `docs/BLUEPRINT.md#open-design-decisions`** — 1 statement(s)

1. `G` **Upgrade journals exact receipts automatic crash recovery and retry policy need disposition under current contracts.** — - Preserve upgrade containment, journals, crash recovery, canonical project roots, immutable path contexts, resume receipts, reservation races, stale callbacks, marker validation, and cleanup … — `docs/test-suite-improvement-report.md:316`

**→ `docs/specs/tasks.md#task-deletion`** — 1 statement(s)

1. `P` **Transactional failure no-partial-move and idempotent retry promises are not approved general outcomes.** — | Core/mutation/create/edit/delete/container/draft | Locked mutation, transactional failure, opaque data preservation, admission exclusion, no partial moves, idempotent retries | — `docs/test-suite-improvement-report.md:326`

## G9 · Test-suite remediation plan

**Document:** `docs/test-suite-remediation-plan.md` · **34 statements** — 1 P · 33 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/CONVENTIONS.md#testing`** — 13 statement(s)

1. `G` **Retain explicit withdrawal of harness-only work until its scope restriction is reconciled in maintained execution guidance.** — Track the fourteen findings from the [original static report](test-suite-improvement-report.md#3-prioritized-evidence-backed-findings), pursuing bounded application-behavior remediation while … — `docs/test-suite-remediation-plan.md:22`
2. `G` **Preserve ownership evidence pending reconciliation of old ledger and nested-runner mechanisms with no global supervisor.** — 2. **Fake-safety audit:** confirm transport/process/provider boundaries before any named test run. Use complete typed fixtures (`satisfies` where suitable), real temporary Core/state for … — `docs/test-suite-remediation-plan.md:33`
3. `G` **Preserve explicit no-replacement scope and trusted-override decision pending reconciliation with current preload ownership.** — | F1 | P0 preload hostile-input isolation | Policy is CLOSED by decision; no authenticated inherited-override policy or safety implementation is established. Harness-only scope expansion was … — `docs/test-suite-remediation-plan.md:51`
4. `G` **Retain no-replacement scope restriction pending maintained execution-policy disposition.** — | F2 | P1 CI/runner controls | Harness-only self-test work is withdrawn; do not replace it with tests of test selection, runner behavior, JUnit or compiled-test smoke. This does not waive ordinary … — `docs/test-suite-remediation-plan.md:54`
5. `G` **Retain no-replacement decision and unresolved cleanup-helper disposition without inferring safety from deleted tests.** — | F12 | P2 executable runner safety seam | Harness-only self-test work is withdrawn; add no replacement runner safety suite. Retain runtime helpers/cleanup and existing application safety contracts; … — `docs/test-suite-remediation-plan.md:57`
6. `G` **Preserve watcher byte freshness and absence regression obligations pending current owning behavior review.** — | F7 | P1 async absence fences | CLI watch and agent-host observer absence fences VERIFIED AND COMMITTED (`bbfbd107`, 11 tests). Task-watcher: canonical fixtures, canonical-absence snapshot fix (no … — `docs/test-suite-remediation-plan.md:59`
7. `G` **Exact Git root/path/filesystem-only test obligations need current boundary-contract reconciliation.** — | F5 | P1 Git public outcomes | VERIFIED AND COMMITTED (`6ebc5b0c`): public temporary-repository reset/detection scenarios and dropped private-patch oracles; 15 tests; scoped lint/diff passed. … — `docs/test-suite-remediation-plan.md:60`
8. `G` **Retain no-replacement scope restriction pending maintained execution-policy disposition.** — | F13 | P2 gate/platform accounting | Harness-only self-test work is withdrawn; add no replacement suite that tests test gates/platform accounting. | — `docs/test-suite-remediation-plan.md:62`
9. `P` **Broad in-process route conversion remains a proposal and must preserve actual process-boundary coverage.** — Open: `cli-draft-edit.test.ts` times out under 5-lane load (four sequential CLI spawns, ~3 s alone, 3 of 5 loaded runs failed; sibling CLI suites timed out in the same runs, so this is machine … — `docs/test-suite-remediation-plan.md:74`
10. `G` **Preserve tuning restriction pending reconciliation with native runner and current timeout procedure.** — Open: `cli-draft-edit.test.ts` times out under 5-lane load (four sequential CLI spawns, ~3 s alone, 3 of 5 loaded runs failed; sibling CLI suites timed out in the same runs, so this is machine … — `docs/test-suite-remediation-plan.md:74`
11. `G` **Explicit scope exclusion needs maintained execution-policy disposition before retiring this gate.** — Prior reconnaissance exp7 `ses_ecfde3785ffej1o03aaGyGP4gz` is terminal; no F1 implementation is started or accepted. The later read-only reconnaissance is also terminal (session status in the … — `docs/test-suite-remediation-plan.md:80`
12. `G` **Historical override name and trust guarantee must be reconciled with the current unique socket requirement.** — AoE-aligned decision: the inherited socket override is trusted without authentication. In the pinned AoE checkout, `src/tmux/mod.rs:73-108` honours a nonempty `AOE_TMUX_SOCKET` as a socket path … — `docs/test-suite-remediation-plan.md:82`
13. `G` **Preserve explicit exclusions until current override and test-scope policy is reconciled.** — Authentication machinery, inferring trust from a socket-name pattern, and any F1 self-tests are explicitly excluded. F1 is CLOSED by decision. — `docs/test-suite-remediation-plan.md:84`

**→ _no owning contract — retire, or escalate as a new decision_** — 9 statement(s)

1. `G` **Remediation must preserve approved safety constraints and distinguish verification from approval.** — Track the fourteen findings from the [original static report](test-suite-improvement-report.md#3-prioritized-evidence-backed-findings), pursuing bounded application-behavior remediation while … — `docs/test-suite-remediation-plan.md:22`
2. `G` **Work ledgers and evidence do not approve behavior.** — [Runtime handoff](shared-agent-runtime-handoff.md) owns the assembled checkpoint and active file ownership. [Runtime plan execution … — `docs/test-suite-remediation-plan.md:24`
3. `G` **Historical source evidence is not approval of current requirements.** — The [original static report](test-suite-improvement-report.md) remains unchanged historical evidence. Its links/anchors to removed self-tests describe the review snapshot, not current required … — `docs/test-suite-remediation-plan.md:28`
4. `G` **Verification gaps remain tracked until verified.** — 6. **Finish before advance:** record changed scope, refactor result, exact proof, exclusions and remaining acceptance gaps in the finding ledger below. Verify and commit the completed slice BEFORE … — `docs/test-suite-remediation-plan.md:37`
5. `G` **Evidence and unresolved verification cannot become completion through documentation.** — Statuses below distinguish reconnaissance, reported work and verified completion. None is promoted to completed remediation without reconciled current-tree proof and the commit gate. — `docs/test-suite-remediation-plan.md:47`
6. `G` **Legacy flag coverage and scoped commit gate need current applicability confirmation without restoring compatibility semantics.** — | F4 | P1 named observation lifecycle | Current source suites passed as recorded in the handoff; the prior service-only 67 + 16 count is historical. Preserve scenario separation/public entrypoints … — `docs/test-suite-remediation-plan.md:56`
7. `G` **Application safety contracts survive evidence changes.** — | F12 | P2 executable runner safety seam | Harness-only self-test work is withdrawn; add no replacement runner safety suite. Retain runtime helpers/cleanup and existing application safety contracts; … — `docs/test-suite-remediation-plan.md:57`
8. `G` **Legacy-filter and local-only obligations require current supported-surface review.** — | F11 | P2 cross-surface semantics | VERIFIED AND COMMITTED (`cc039a23`): shared literal scenario matrix with independent expected IDs across dense Core plus thin CLI/MCP routes; 29 tests; scoped … — `docs/test-suite-remediation-plan.md:64`
9. `G` **Preserve owner-decision gate for refresh behavior until its answer is folded into the owning contract.** — Per-case budgets, measured: `agent-sessions.test.ts` is bounded at width **8** (worst loaded case 3,102 ms; width 4 was *worse* than no limit at 4,107 ms; width 16 timed out once at 10,005 ms; the … — `docs/test-suite-remediation-plan.md:72`

**→ `docs/CONVENTIONS.md#tooling-and-validation`** — 3 statement(s)

1. `G` **Retain scoped dispatch and commit gates until their current execution disposition is confirmed.** — [Runtime handoff](shared-agent-runtime-handoff.md) owns the assembled checkpoint and active file ownership. [Runtime plan execution … — `docs/test-suite-remediation-plan.md:24`
2. `G` **Preserve the scoped commit-before-next-slice gate until its execution disposition is confirmed.** — 6. **Finish before advance:** record changed scope, refactor result, exact proof, exclusions and remaining acceptance gaps in the finding ledger below. Verify and commit the completed slice BEFORE … — `docs/test-suite-remediation-plan.md:37`
3. `G` **Scoped commit gate must be retained until execution disposition is confirmed.** — Statuses below distinguish reconnaissance, reported work and verified completion. None is promoted to completed remediation without reconciled current-tree proof and the commit gate. — `docs/test-suite-remediation-plan.md:47`

**→ `docs/BLUEPRINT.md#open-design-decisions`** — 3 statement(s)

1. `G` **Historical authorization must be reconciled with currently unsettled automatic resume and recovery policy.** — The [canonical AoE functionality map](aoe-functionality-map.md) is verified across 97 features in S/R/W/A/C/O and independently audit-verified coverage-complete and accurate (92 body-verified, 4 … — `docs/test-suite-remediation-plan.md:26`
2. `G` **Reconcile earlier resume-phase authorization with current unresolved automatic resume policy.** — The map gate is satisfied. Continue bounded, honest application-behavior remediation; explicit authorization covers AoE-aligned implementation and resume-policy phases 3–4. Source preparation … — `docs/test-suite-remediation-plan.md:43`
3. `G` **Earlier claimed data-model approval cannot override currently unsettled recovery representation and policy.** — The map gate is satisfied. Continue bounded, honest application-behavior remediation; explicit authorization covers AoE-aligned implementation and resume-policy phases 3–4. Source preparation … — `docs/test-suite-remediation-plan.md:43`

**→ `docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport`** — 2 statement(s)

1. `G` **Core specifies explicit backend selection but does not settle inherited override trust or authentication policy.** — AoE-aligned decision: the inherited socket override is trusted without authentication. In the pinned AoE checkout, `src/tmux/mod.rs:73-108` honours a nonempty `AOE_TMUX_SOCKET` as a socket path … — `docs/test-suite-remediation-plan.md:82`
2. `G` **Preserve explicit no-authentication disposition pending current override-policy reconciliation.** — AoE-aligned decision: the inherited socket override is trusted without authentication. In the pinned AoE checkout, `src/tmux/mod.rs:73-108` honours a nonempty `AOE_TMUX_SOCKET` as a socket path … — `docs/test-suite-remediation-plan.md:82`

**→ `docs/CONVENTIONS.md#changes-and-refactoring`** — 1 statement(s)

1. `G` **Mandatory refactor-first ordering requires current finding applicability rather than blanket promotion.** — 1. **Failing area first:** apply its relevant report refactor BEFORE fixing residual failures. Read only the named finding, touched harness/source seam and callers needed for that bounded scenario. … — `docs/test-suite-remediation-plan.md:32`

**→ `docs/specs/sessions.md#sessions`** — 1 statement(s)

1. `G` **Scenario distinction remains useful but historical STARTING and queued-state representation must be reconciled with observed-state contract.** — 3. **Vertical scenario:** write small named public-behavior cases with independent expected outcomes. Separate live STARTING, conclusive dead/missing, valid queued missing and uncertain observation. … — `docs/test-suite-remediation-plan.md:34`

**→ `docs/specs/tasks.md#using-task-artifacts`** — 1 statement(s)

1. `G` **Preserve relevant prototype-key and path safety coverage while determining its applicability to generic files.** — | F10 | P2 real optional-artifact behavior | VERIFIED AND COMMITTED (`ba1fc8f7`): public config validation/artifact read/write plus a path failure replaced the literal-only omission check; 2 tests; … — `docs/test-suite-remediation-plan.md:63`

**→ `docs/CONVENTIONS.md#error-handling`** — 1 statement(s)

1. `G` **Retain unresolved-cleanup evidence and nonzero-outcome gate while reconciling disposable scratch policy with retired runner terminal-proof rules.** — Disk: the accumulation was Bun re-extracting each embedded file of a **compiled** binary (5,560,064 bytes per launch of `libopentui.dylib`; upstream Bun issue #29585), not dyld shared-cache … — `docs/test-suite-remediation-plan.md:76`
