# OpenTUI Workspace Implementation Plan

**Status:** The native `EmbeddedTerminalRenderable` cutover is working and user-approved. OpenTUI owns terminal rendering, scrolling, cursor behavior, and input encoding; tmux only hosts agents. Public CLI smoke checks covered real opencode typing, retained drafts across task navigation, native terminal modes, and clean exit.

## Previous native cleanup and usability pass

Baseline commit: `a013727` (`BACK-728 - Use native OpenTUI agent terminal`). The user then authorized parallel cleanup, prompt injection, input/layout fixes, native board routing, filter repairs, and focused tests.

- Removed obsolete examples/presentation paths, hidden `workspace-ui`, unused terminal adapters, compatibility aliases, and legacy-only tests. The retained transport lives under `src/agent-workspace/live`; tmux only hosts agent processes.
- Interactive board commands use the native controller, including milestone grouping. Plain board exports retain Markdown output.
- New opencode agents receive existing bootstrap instructions. A tmux launch gate attaches output capture before starting the noninteractive command; the UI shows a warming-up message until output arrives.
- Native Alt normalization preserves backward word deletion, forward Delete, and explicit Super. No editor-specific word-deletion implementation exists.
- The task pane is 30% wide and toggles with `Ctrl+[`. Task details toggle independently. Selection has explicit high-contrast colors.
- Filter dialogs are opaque and use native focus ownership with supported key listeners. Typing `y` no longer invokes the generic yes/confirm shortcut. Search, status choices, reset, cancel, and paste remain isolated from the underlying workspace or board.

Actual PTY checks exercised real opencode prompt startup and word deletion, retained agent state, warmup, task-pane collapse, search exclusion, status filtering/reset, pasted board search, milestone grouping, persisted board moves, and clean terminal restoration. A real tmux fallback smoke delivered 9,625 ordered bytes without loss and stopped its private server. Hex input chunks stay below tmux's command-message limit.

Verification: 89 passing tests and one skipped test across 13 focused suites; TypeScript and the changed-file Biome checks passed. Fallow findings fell from 87 to 32, with no remaining native-workspace findings, unused files, unused dependencies, or unresolved imports. Remaining findings are outside this cleanup; fallow warns that hidden `.omp` source is excluded.

## Current workspace pass

- Fullscreen reuses the retained native terminal; OpenTUI remains the presentation owner.
- Task details overlay the preview without resizing it. Status selection uses native tabs.
- Shortcut help supports search and recorded, project-local overrides. `Shift+[` toggles the task pane; `Ctrl+[` and `Ctrl+]` navigate a bounded 100-state history.
- `Ctrl+C` and `Ctrl+Q` leave focused agent input without interrupting the agent. Navigation `Ctrl+C` exits; `q` never exits.
- Task-manager launches use an exact idle prompt and a temporary session-local AgenticWorkspace skill. `agentic-workspace skill` prints its body. New sessions start at the project root without task/path environment injection, automatic task-status changes, or worktree creation.
- Native workspace and CLI agents share durable records. The session picker selects exact conversations; externally owned live sessions remain alive when the workspace detaches.

Public CLI checks have exercised task-selection history, status wraparound, board-to-workspace history, filter/selection restoration, shortcut search and recording, replacement of default aliases, and clean navigation exit. The public `agentic-workspace skill` command prints the requested skill body.

Final verification for this pass:

- 94 tests passed and one skipped across 18 focused files, including the independently verified skill command and pane-identity fix. After replacing shortcut-search control-character regexes, the 11 filter/keybinding tests passed again.
- `bun run check:types` passed. Scoped Biome checks passed after formatting the changed workspace files and correcting the shortcut-search guards.
- A compiled CLI built into an owned temporary directory printed the exact skill body outside a project. Its real PTY workspace rendered tasks, opened shortcut help, filtered for fullscreen, and exited with status 0 while restoring the terminal.
- Real OpenCode sessions switched newest-to-older by exact identity, resumed a stopped conversation after reopening, and retained both native IDs after clean multi-session exit. External attachment preserved the running OpenCode child and durable identity after detachment; fullscreen resized its tmux pane to 120 × 40.
- Native surface checks proved that the details overlay leaves terminal dimensions unchanged, fullscreen retains the same terminal, focused `q` reaches the agent, `Ctrl+C` and `Ctrl+Q` return to navigation without interruption, and recorded task-pane shortcuts survive reopening.
- OpenCode exported exactly the two-line startup instruction as one user message, with no assistant or tool messages. Its temporary skill was discovered natively. Claude's session-only plugin discovery passed; a complete interactive Claude lifecycle was not verified. Codex, Gemini, and Antigravity remain blocked by explicit loader or exact-resume prerequisites.

### Shortcut and startup feedback pass

- Shortcut recording now replaces the selected label with an inline input and requires Save/Discard confirmation. Saved bindings support one or two ordered strokes; legacy arrays remain alternative aliases. Escape is recordable, and Escape after the first stroke finishes a single-stroke binding.
- Status tabs use one compact row with active/inactive colors and overflow arrows, without the underline row. Existing status wrapping and empty-status navigation remain unchanged.
- The reported `READY` startup came from a root-scoped OpenCode preset overwritten with an echo command, not a launch-code defect. The preset was restored through the CLI. With user approval, the three affected session records were backed up, their owning workspace shut down, and their metadata reset through the CLI while preserving logs.
- Real public-workspace PTYs verified inline recording, confirmation, discard, Escape recording, saved two-stroke dispatch after reopening, and compact tabs at 48 columns. A first session opened actual OpenCode and exported exactly one user bootstrap message. A recorded exit sequence left focused OpenCode without changing its unsent draft or native conversation identity.
- All 47 focused tests across seven files passed. TypeScript checking and scoped Biome checking passed.

The numbered phases below and the preceding cleanup results are historical planning and verification records, not verification results for this pass. The [current specification](./opentui-workspace-spec.md#current-native-behavior) and [session contract](./opentui-workspace-session-contract.md) define current behavior.

## 1. Delivery model

Each phase changes the actual workspace screen.

```sh
agentic-workspace workspace
```

is the review command for every phase.

No phase ends with documentation, tests, or internal components as its only deliverable.

The obsolete workspace presentation has been deleted. It is not an alternate public UI.

Every phase has fixed file ownership, independent parallel slices, verification evidence, and an explicit user review gate. No later phase begins before that approval.

## 2. Invariants

Every phase preserves these rules:

- One OpenTUI workspace host owns presentation.
- Existing `Core`, workspace persistence, and watchers remain domain owners.
- Durable tmux agent sessions remain intact.
- Tmux has no presentation responsibility after Phase 0.
- Normal-mode `Ctrl+C` alone requests application exit.
- `q` never exits.
- In live preview, `Ctrl+Q` and `Ctrl+C` return to navigation without interrupting the agent; other keys go to the native terminal.
- Task selection immediately replaces right-pane details and agent identity.
- Late output from a prior task/session cannot render.

## 3. Phase 0 — Visible read-only shell

### Deliverable

`agentic-workspace workspace` launches one OpenTUI shell.

```text
navbar with visible filter state
left real task list
right collapsible selected-task details and live-agent state region
footer
```

The shell uses real workspace tasks, persisted selection, filters, and session state. It supports selection movement and detail-pane collapse only. It supports no task mutation, session input, quick preview, handoff, config editing, or board route yet.

Legacy presentation source stays available only as rollback source. Public command does not launch tmux presentation panes or hidden `workspace-ui` processes.

### Parallel slices

| Slice | Owner boundary | Output |
|---|---|---|
| Public startup | `src/commands/agent-workspace.ts` and startup tests | `agentic-workspace workspace` creates one OpenTUI controller and preserves non-TTY error behavior |
| Shell layout | `src/ui/opentui/workspace.ts` and shell layout tests | Navbar/filter, left task list, collapsible right details/agent region, footer |
| State adapter | `src/ui/opentui/workspace-controller.ts` and controller tests | Real `Core`, workspace state, watchers, `UnifiedViewSession`, `TaskViewerSession`, and session-state adapter |
| Agent state region | New OpenTUI agent-view module and tests | Selected-task session state, no-session/loading/stopped/error states, stale identity guard |

### Review evidence

Run:

```sh
agentic-workspace workspace
```

Review:

- OpenTUI shell is visible.
- Real tasks appear in left pane.
- Selected task details replace immediately on movement.
- Right pane collapses and expands.
- Selected task's current agent state replaces old state.
- No tmux presentation pane or hidden workspace UI process starts.

### Stop condition

User approves actual shell appearance and selection behavior.

## 4. Phase 1 — Visible normal task workflow

### Deliverable

Same `agentic-workspace workspace` screen supports filter editing/search, task create/edit, task actions, board route, help, and normal-mode shortcuts.

### Current review target

The approved Phase 1 normal workflow was recovered from session history on 2026-10-05, before Phase 2 live-preview changes. The workspace surface, controller, and terminal host matched their historical snapshots at recovery. The Enter-only increment below extends that recovered screen without changing its layout. `agentic-workspace workspace` still launches OpenTUI, not the legacy tmux presentation.

Recovery verification: the actual CLI ran in an isolated PTY project. Task navigation changed the selected description, Space collapsed and restored details, idle produced zero output bytes over 1.6 seconds, and Ctrl+C exited with code 0 and restored the main screen. TypeScript, focused tests, and Biome passed. Real-terminal appearance still requires user review.

- `/` opens task filters and persists applied values.
- `n` opens task creation.
- `e` edits selected task title, description, type, and priority.
- `y`, `c`, and `a` copy, complete, and archive selected task.
- `Shift+B` routes to in-host board and returns to same selected task.
- `?` opens shortcut help.
- `Ctrl+C` exits public OpenTUI workspace. `q` does not exit. `Esc` closes overlays only.

### Enter-only agent increment

- Press `Enter` on a selected task to start its configured agent command and environment in the existing lower-right agent region. The default command is `opencode`.
- Startup uses the working prototype's `createAgentHost`, armed tmux pane, socket forwarder, headless VT parser, and event-driven retained output renderer. The prototype source is unchanged; the required host/transport modules are copied under `src/agent-workspace/prototype/`.
- No task prompt, bootstrap, preparation command, or worktree is sent. Agent keyboard input is enabled only after Tab focuses the running preview.
- Repeated `Enter` reuses the task's starting/running host. Switching tasks hides the previous output and restores the selected task's own host without restarting it.
- Hosts have the prototype's workspace lifetime, not the legacy durable-session lifecycle. Exiting waits for in-flight startup, stops only this workspace's private tmux servers, and restores the terminal.
- Each task uses a separate PID/instance socket. The private `__vt-pipe` re-exec route supports both source and compiled CLI entrypoints. The imported transport retains the first accepted socket before arming completes, so fast forwarder startup cannot lose the connection.
- Compiled verification exposed `EAGAIN` from Bun's file reader on tmux's non-blocking stdin socket. The copied forwarder uses `process.stdin` for readiness-driven reads; socket transport, synchronous input writes, and VT parsing remain unchanged. Both source and compiled CLI smoke runs delivered live output after the fix.
- PTY verification showed real `opencode` at its idle prompt inside the agent region. A deterministic two-task agent verified live output, task isolation, duplicate-Enter protection, empty agent arguments, zero input bytes, skipped preparation, and server cleanup on `Ctrl+C`. This does not claim user-terminal visual approval.

### Preview sizing and input iteration

- Details occupy approximately 30% of the right-hand content area. Space hides or restores only details; the preview takes all remaining height without changing the task-list width.
- The host resizes both its VT parser and tmux window to the preview's actual dimensions, including when details are toggled.
- Tab focuses a running preview and displays its cursor. Keys and paste use the prototype input translator and worker. Ctrl+Q returns to task navigation; Ctrl+C is ignored while preview input is focused and exits normally outside input mode.
- Direct public-CLI PTY smoke confirmed preview dimensions changing from 76×26 to 76×37 and back, typed text reaching the agent, a visible cursor, Ctrl+Q restoring task navigation, and clean Ctrl+C exit. No test suite was run for this iteration.

Review with `bun src/cli/index.ts workspace`: Enter starts the agent, Space toggles details, Tab enters input, and Ctrl+Q returns to tasks. Stop here for user review.

### Preview restoration and legacy styling

- A remounted preview could sample its cached frame before layout, when its height was zero. Slicing the frame to that height stored blank output; unchanged samples then skipped publication. The renderer now receives the entire frame and clips it through its existing viewport.
- Legacy styling came from `src/ui/components/filter-header.ts`, `src/ui/workspace/task-widgets.ts`, `src/ui/workspace/reconciliation.ts`, `src/ui/workspace/pane.ts`, and `src/ui/workspace/footer.ts` (all removed with the legacy blessed TUI): cyan filter border, status-grouped task rows, inverse/bold selection, yellow focus border, gray inactive borders, blue task-ID heading, and bracketed shortcut hints.
- The 44% task-list width, 30% details height, Space toggle, Tab input, Ctrl+Q return, and existing filter dialog remain intact. The details and preview now have separate borders.
- Real `opencode` PTY smoke verified Ctrl+Q, navigation away and back, restored live output, re-entered input, and preservation of an unsubmitted draft in the same tmux pane. Selected-row cells were inverse and bold. At 140×44, the pane resized from 76×25 to 76×37 and back, and Ctrl+C restored the main screen with exit code 0.
- No test suite was run. Cursor research is recorded in `docs/aoe-agent-workspace-reference.md`, section 13. Cursor visibility/style and the explicit Ctrl+C override were not changed in this iteration.


### Parallel slices

| Slice | Owner boundary | Output |
|---|---|---|
| Keybinding adapter | `src/ui/opentui/keybindings.ts`, keymap bridge, keybinding tests | Live adapter over `uiKeymap`, named callbacks, footer/help/modal remap proof |
| Task workflow controller | Controller task-intent handlers and controller tests | Create/edit/complete/archive/move/copy through existing `Core` APIs |
| Overlay integration | Composer, filters, task-actions, controls, and overlay tests | Modal focus restoration, validation/error retention, no shortcut leakage |
| Board route | Board route adapter and board-route tests | In-host board route and persisted selection/filter return |

### Review evidence

Run `agentic-workspace workspace`. Review real task creation, editing, filters, search, board return, footer/help, and remapped shortcuts.

Confirm `Ctrl+C` is sole exit request, `q` does not exit, and `Esc` only closes/backtracks.

### Stop condition

User approves normal task workflow.

## 5. Phase 2 — Visible live-agent and quick-preview workflow

**Only the Enter-only increment above is active.** History, handoff, configuration UI, durable-session integration, worktrees, and quick preview remain outside the current authorization.

### Deliverable

Same `agentic-workspace workspace` screen renders live durable agent output, history, handoff, configuration, worktree state, and quick preview.

### Parallel slices

| Slice | Owner boundary | Output |
|---|---|---|
| Session state bridge | Agent-session adapter module and tests | Task-to-session lookup, attach/detach, start/open, state refresh, stale-event rejection |
| Live output and history | Agent view module and tests | Output rendering, history navigation, unavailable/stopped/loading states |
| Quick-preview router | Dedicated input-mode module and tests | `Ctrl+Q` exit preview, ignored `Ctrl+C`, all other input forwarded only to agent |
| Session actions | Handoff/config/worktree controller module and tests | Existing service-backed actions and error states |

### Review evidence

Run `bun run cli workspace` with an active agent.

```text
Enter               create selected task agent when absent, or return to unfocused live output
No active session   press Enter to create one
S                   show selected task session history
↑ / ↓               choose a history session
H                   request durable handoff
P                   edit task-scoped agent command, environment, prepare, worktree, and bootstrap settings
Tab                 enter quick preview for selected running agent
Ctrl+Q              exit quick preview without forwarding
Ctrl+C              stays ignored during quick preview
```

Review live output, stopped-session history, task switching, handoff status, configuration, worktree state, and preview input.

Normal `Ctrl+C` exits workspace. `q` never exits.

### Stop condition

User approves agent workflow.

## 6. Phase 3 — Visible full-parity acceptance

### Deliverable

Same OpenTUI workspace satisfies full retained user workflow and cutover acceptance.

### Parallel slices

| Slice | Owner boundary | Output |
|---|---|---|
| Lifecycle hardening | OpenTUI startup/close integration and tests | Watcher ownership, signal handling, UI-only teardown, non-TTY behavior |
| End-to-end proof | Focused E2E/manual verification tooling only | Public command, task workflow, session persistence, and no-presentation-tmux assertions |
| Compiled CLI proof | Build/smoke support only | Compiled executable launches workspace cleanly |
| Parity audit | Tests and documentation only | Matrix closure against behavior and session contracts |

### Review evidence

Run `agentic-workspace workspace` and prove task, board, detail, filter, search, edit, session, history, handoff, config, worktree, quick-preview, close/reopen, and failure states.

Run focused tests, full tests, build, actual terminal verification, and compiled CLI smoke.

### Stop condition

User approves full parity before deletion.

## 7. Phase 4 — Remove legacy presentation

### Deliverable

The visible `agentic-workspace workspace` remains unchanged. Legacy Blessed workspace presentation and tmux layout code are deleted.

Durable tmux agent-session implementation remains.

### Parallel slices

| Slice | Owner boundary | Output |
|---|---|---|
| Legacy UI deletion | Legacy Blessed workspace modules and dedicated tests | Remove obsolete panes, regions, controller, and handlers |
| Tmux presentation deletion | `TmuxWorkspace` presentation-only code and hidden workspace UI paths | Remove layout, hidden process launch, key tables, and presentation signals |
| Test/doc cleanup | Obsolete tests and documentation references only | Delete stale tests and update public architecture docs |

### Review evidence

Run `agentic-workspace workspace`. Confirm same OpenTUI output. Confirm no legacy presentation caller remains. Confirm durable agent sessions still pass lifecycle tests.

Run full tests, build, actual terminal check, and compiled smoke.

### Stop condition

User approves final deletion result.

## 8. Verification standard

Every phase requires:

1. A visible `agentic-workspace workspace` review target.
2. Focused tests for changed behavior.
3. TypeScript check.
4. Biome check for changed files.
5. Actual terminal exercise of changed workspace path.

Phases 3 and 4 also require full tests, build, and compiled executable smoke.

## 9. Rollback

Before Phase 4, rollback restores legacy presentation as the public command entrypoint in one revert. It does not run a dual public UI.

After Phase 4, rollback reverts the cutover/deletion changes as one commit.

## 10. Cross-references

- `docs/opentui-workspace-spec.md`
- `docs/opentui-workspace-behavior-matrix.md`
- `docs/opentui-workspace-session-contract.md`
- `docs/BACK-728-handoff.md`
- `docs/tmux-layer-spec.md`
- `docs/aoe-agent-workspace-reference.md`
