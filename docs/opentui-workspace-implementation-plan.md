---
consolidation:
  total: 222
  counts:
    exists: 70
    discard: 92
    integrate: 22
    unconfirmed: 38
  percentages:
    exists: 31.53%
    discard: 41.44%
    integrate: 9.91%
    unconfirmed: 17.12%
---
# OpenTUI Workspace Implementation Plan

**Status:** The native `EmbeddedTerminalRenderable` cutover is working and user-approved. OpenTUI owns terminal rendering, scrolling, cursor behavior, and input encoding; tmux only hosts agents. Public CLI smoke checks covered real opencode typing, retained drafts across task navigation, native terminal modes, and clean exit. <!-- consolidation: discard; ref: none; reason: Historical cutover approval and smoke results are evidence rather than current acceptance. --> <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-and-modules; reason: Preserve native terminal rendering scrolling cursor and encoding ownership. -->

## Previous native cleanup and usability pass

Baseline commit: `a013727` (`BACK-728 - Use native OpenTUI agent terminal`). The user then authorized parallel cleanup, prompt injection, input/layout fixes, native board routing, filter repairs, and focused tests. <!-- consolidation: discard; ref: none; reason: Historical commit and bounded work authorization. -->

- Removed obsolete examples/presentation paths, hidden `workspace-ui`, unused terminal adapters, compatibility aliases, and legacy-only tests. The retained transport lives under `src/agent-workspace/live`; tmux only hosts agent processes. <!-- consolidation: discard; ref: none; reason: Historical deletion completion and source inventory. --> <!-- consolidation: exists; ref: docs/BLUEPRINT.md#component-ownership; reason: Runtime backend is separate from presentation. -->
- Interactive board commands use the native controller, including milestone grouping. Plain board exports retain Markdown output. <!-- consolidation: exists; ref: docs/screens/board.md#ordered-contents; reason: Board shares workspace host. --> <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Exact board command/export and milestone-grouping API scope needs disposition. -->
- New opencode agents receive existing bootstrap instructions. A tmux launch gate attaches output capture before starting the noninteractive command; the UI shows a warming-up message until output arrives. <!-- consolidation: discard; ref: docs/specs/sessions.md#inputs-delivered-to-the-agent; reason: Historical bootstrap is superseded by composed task/mode instructions. --> <!-- consolidation: discard; ref: docs/specs/sessions.md#live-terminal-and-client-lifetime; reason: Durable capture launch gate is not the target live-only transport. --> <!-- consolidation: discard; ref: docs/specs/sessions.md#startup-completion; reason: First output does not establish readiness. --> <!-- consolidation: unconfirmed; ref: docs/screens/workspace.md#states; reason: Exact warming-up wording remains unspecified. -->
- Native Alt normalization preserves backward word deletion, forward Delete, and explicit Super. No editor-specific word-deletion implementation exists. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-and-modules; reason: Preserve native modifier normalization and editing key fidelity without app-owned word editing. -->
- The task pane is 30% wide and toggles with `Ctrl+[`. Task details toggle independently. Selection has explicit high-contrast colors. <!-- consolidation: discard; ref: docs/screens/workspace.md#ordered-regions; reason: Uncapped width is superseded by 35-cell cap. --> <!-- consolidation: discard; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Task-pane binding is now Shift-bracket. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#ordered-regions; reason: Details toggle independently. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#states; reason: Selected rows retain readable contrast. -->
- Filter dialogs are opaque and use native focus ownership with supported key listeners. Typing `y` no longer invokes the generic yes/confirm shortcut. Search, status choices, reset, cancel, and paste remain isolated from the underlying workspace or board. <!-- consolidation: exists; ref: docs/screens/help-dialogs.md#dialogs-and-editors; reason: Opaque filter dialog owns key and paste input without leakage. --> <!-- consolidation: discard; ref: none; reason: Historical y-key fix and listener implementation are evidence. -->

Actual PTY checks exercised real opencode prompt startup and word deletion, retained agent state, warmup, task-pane collapse, search exclusion, status filtering/reset, pasted board search, milestone grouping, persisted board moves, and clean terminal restoration. A real tmux fallback smoke delivered 9,625 ordered bytes without loss and stopped its private server. Hex input chunks stay below tmux's command-message limit. <!-- consolidation: discard; ref: none; reason: Historical PTY and ordered-byte smoke results. --> <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-and-modules; reason: Tmux hex input chunks must stay below command-message size limit. -->

Verification: 89 passing tests and one skipped test across 13 focused suites; TypeScript and the changed-file Biome checks passed. Fallow findings fell from 87 to 32, with no remaining native-workspace findings, unused files, unused dependencies, or unresolved imports. Remaining findings are outside this cleanup; fallow warns that hidden `.omp` source is excluded. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Historical counts and tool findings must be remeasured rather than promoted to core. -->

## Current workspace pass

- Fullscreen reuses the retained native terminal; OpenTUI remains the presentation owner. <!-- consolidation: exists; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Fullscreen retains terminal identity. -->
- Task details overlay the preview without resizing it. Status selection uses native tabs. <!-- consolidation: discard; ref: docs/screens/workspace.md#ordered-regions; reason: Details now occupy normal flow and resize terminal rows. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#ordered-regions; reason: Status tabs are specified. -->
- Shortcut help supports search and recorded, project-local overrides. `Shift+[` toggles the task pane; `Ctrl+[` and `Ctrl+]` navigate a bounded 100-state history. <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Searchable help and persisted shortcut overrides are specified. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Task-pane toggle is specified. --> <!-- consolidation: integrate; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: History bindings and 100-state bound are absent. -->
- `Ctrl+C` and `Ctrl+Q` leave focused agent input without interrupting the agent. Navigation `Ctrl+C` exits; `q` never exits. <!-- consolidation: exists; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Agent escape and navigation exit rules are specified. -->
- Task-manager launches use an exact idle prompt and a temporary session-local AgenticWorkspace skill. `agentic-workspace skill` prints its body. New sessions start at the project root without task/path environment injection, automatic task-status changes, or worktree creation. <!-- consolidation: discard; ref: docs/specs/sessions.md#inputs-delivered-to-the-agent; reason: Idle-only prompt and missing identity environment are superseded. --> <!-- consolidation: integrate; ref: docs/architecture/session-harness.md#harness-construction-and-promises; reason: Preserve temporary process-scoped skill isolation. --> <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Skill command awaits guidance API disposition. --> <!-- consolidation: discard; ref: docs/specs/tasks.md#work-context-and-completion; reason: First launch now prepares configured worktree. --> <!-- consolidation: discard; ref: docs/specs/sessions.md#trigger-and-scope; reason: Start now changes unfinished task status. -->
- Native workspace and CLI agents share durable records. The session picker selects exact conversations; externally owned live sessions remain alive when the workspace detaches. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#dependency-direction; reason: Entry points share application/domain ownership. --> <!-- consolidation: exists; ref: docs/screens/sessions-artifacts.md#session-picker; reason: Picker selects exact retained conversation. --> <!-- consolidation: exists; ref: docs/specs/sessions.md#live-terminal-and-client-lifetime; reason: Detach leaves all executions running. -->

Public CLI checks have exercised task-selection history, status wraparound, board-to-workspace history, filter/selection restoration, shortcut search and recording, replacement of default aliases, and clean navigation exit. The public `agentic-workspace skill` command prints the requested skill body. <!-- consolidation: discard; ref: none; reason: Historical public-CLI verification evidence. -->

Final verification for this pass:

- 94 tests passed and one skipped across 18 focused files, including the independently verified skill command and pane-identity fix. After replacing shortcut-search control-character regexes, the 11 filter/keybinding tests passed again. <!-- consolidation: discard; ref: none; reason: Historical test counts and fix evidence. -->
- `bun run check:types` passed. Scoped Biome checks passed after formatting the changed workspace files and correcting the shortcut-search guards. <!-- consolidation: discard; ref: none; reason: Historical type/lint result. -->
- A compiled CLI built into an owned temporary directory printed the exact skill body outside a project. Its real PTY workspace rendered tasks, opened shortcut help, filtered for fullscreen, and exited with status 0 while restoring the terminal. <!-- consolidation: discard; ref: none; reason: Historical compiled runtime evidence. -->
- Real OpenCode sessions switched newest-to-older by exact identity, resumed a stopped conversation after reopening, and retained both native IDs after clean multi-session exit. External attachment preserved the running OpenCode child and durable identity after detachment; fullscreen resized its tmux pane to 120 × 40. <!-- consolidation: discard; ref: none; reason: Historical provider lifecycle and sizing evidence. -->
- Native surface checks proved that the details overlay leaves terminal dimensions unchanged, fullscreen retains the same terminal, focused `q` reaches the agent, `Ctrl+C` and `Ctrl+Q` return to navigation without interruption, and recorded task-pane shortcuts survive reopening. <!-- consolidation: discard; ref: none; reason: Historical surface-test results do not certify current layout or behavior. -->
- OpenCode exported exactly the two-line startup instruction as one user message, with no assistant or tool messages. Its temporary skill was discovered natively. Claude's session-only plugin discovery passed; a complete interactive Claude lifecycle was not verified. Codex, Gemini, and Antigravity remain blocked by explicit loader or exact-resume prerequisites. <!-- consolidation: discard; ref: none; reason: Historical OpenCode prompt/skill and Claude discovery evidence. --> <!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#readiness-evidence-and-failure-stages; reason: Complete Claude lifecycle acceptance remains unverified. --> <!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#harness-construction-and-promises; reason: Codex Gemini and Antigravity loader/exact-resume gates remain pending verification. -->

### Shortcut and startup feedback pass

- Shortcut recording now replaces the selected label with an inline input and requires Save/Discard confirmation. Saved bindings support one or two ordered strokes; legacy arrays remain alternative aliases. Escape is recordable, and Escape after the first stroke finishes a single-stroke binding. <!-- consolidation: exists; ref: docs/screens/help-dialogs.md#help; reason: Inline one/two-stroke capture confirmation and Escape recording are specified. --> <!-- consolidation: unconfirmed; ref: docs/SPEC.md#current-contract-only-policy; reason: Legacy alias-array compatibility requires explicit exception. -->
- Status tabs use one compact row with active/inactive colors and overflow arrows, without the underline row. Existing status wrapping and empty-status navigation remain unchanged. <!-- consolidation: discard; ref: docs/screens/workspace.md#ordered-regions; reason: One-row tabs are superseded by approved three-row active cap. --> <!-- consolidation: integrate; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Preserve tab wrapping and overflow arrow interaction. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#states; reason: Empty status navigation remains safe. -->
- The reported `READY` startup came from a root-scoped OpenCode preset overwritten with an echo command, not a launch-code defect. The preset was restored through the CLI. With user approval, the three affected session records were backed up, their owning workspace shut down, and their metadata reset through the CLI while preserving logs. <!-- consolidation: discard; ref: none; reason: One-off incident diagnosis and authorized recovery history. -->
- Real public-workspace PTYs verified inline recording, confirmation, discard, Escape recording, saved two-stroke dispatch after reopening, and compact tabs at 48 columns. A first session opened actual OpenCode and exported exactly one user bootstrap message. A recorded exit sequence left focused OpenCode without changing its unsent draft or native conversation identity. <!-- consolidation: discard; ref: none; reason: Historical public-PTY verification evidence. -->
- All 47 focused tests across seven files passed. TypeScript checking and scoped Biome checking passed. <!-- consolidation: discard; ref: none; reason: Historical test/type/lint counts. -->

The numbered phases below and the preceding cleanup results are historical planning and verification records, not verification results for this pass. The [current specification](./opentui-workspace-spec.md#current-native-behavior) and [session contract](./opentui-workspace-session-contract.md) define current behavior. <!-- consolidation: discard; ref: docs/SPEC.md#authority; reason: Historical evidence and authority navigation are superseded by core owners. -->

## 1. Delivery model

Each phase changes the actual workspace screen. <!-- consolidation: discard; ref: none; reason: Historical delivery sequencing. -->

```sh
agentic-workspace workspace
```
<!-- consolidation: discard; ref: none; reason: Historical review-command example. -->

is the review command for every phase. <!-- consolidation: discard; ref: none; reason: Historical review procedure. -->

No phase ends with documentation, tests, or internal components as its only deliverable. <!-- consolidation: discard; ref: none; reason: Historical phase deliverable constraint. -->

The obsolete workspace presentation has been deleted. It is not an alternate public UI. <!-- consolidation: discard; ref: none; reason: Historical deletion status. --> <!-- consolidation: exists; ref: docs/SPEC.md#current-contract-only-policy; reason: Unapproved compatibility UI is excluded. -->

Every phase has fixed file ownership, independent parallel slices, verification evidence, and an explicit user review gate. No later phase begins before that approval. <!-- consolidation: discard; ref: none; reason: Historical worker allocation and parallel sequencing. --> <!-- consolidation: unconfirmed; ref: docs/SPEC.md#evidence-and-decisions; reason: Phase review/approval gates need evidence before retirement and do not authorize renewed execution. -->

## 2. Invariants

Every phase preserves these rules:

- One OpenTUI workspace host owns presentation. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-and-modules; reason: Explicit single OpenTUI host requirement is missing. -->
- Existing `Core`, workspace persistence, and watchers remain domain owners. <!-- consolidation: discard; ref: docs/BLUEPRINT.md#component-ownership; reason: Historical Core/facade ownership is superseded by Task Session Harness and application boundaries. -->
- Durable tmux agent sessions remain intact. <!-- consolidation: exists; ref: docs/specs/sessions.md#live-terminal-and-client-lifetime; reason: Presentation lifetime does not terminate executions. -->
- Tmux has no presentation responsibility after Phase 0. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-and-modules; reason: Explicit no tmux presentation topology contract is missing. -->
- Normal-mode `Ctrl+C` alone requests application exit. <!-- consolidation: exists; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Navigation exit is specified. -->
- `q` never exits. <!-- consolidation: exists; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: q never exits. -->
- In live preview, `Ctrl+Q` and `Ctrl+C` return to navigation without interrupting the agent; other keys go to the native terminal. <!-- consolidation: exists; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Escape keys return without interruption. --> <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-and-modules; reason: All other keys route exclusively to focused agent. -->
- Task selection immediately replaces right-pane details and agent identity. <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-and-modules; reason: Selection establishes identity before async attachment. -->
- Late output from a prior task/session cannot render. <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-and-modules; reason: Obsolete output cannot update replacement view. -->

## 3. Phase 0 — Visible read-only shell

### Deliverable

`agentic-workspace workspace` launches one OpenTUI shell. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-and-modules; reason: Explicit single public OpenTUI shell contract is missing. -->

```text
navbar with visible filter state
left real task list
right collapsible selected-task details and live-agent state region
footer
```
<!-- consolidation: exists; ref: docs/screens/workspace.md#ordered-regions; reason: Header task region selected-task region and footer ordering is specified. -->
<!-- consolidation: discard; ref: docs/screens/workspace.md#ordered-regions; reason: Whole-right-region collapse is superseded by details-only normal-flow collapse. -->

The shell uses real workspace tasks, persisted selection, filters, and session state. It supports selection movement and detail-pane collapse only. It supports no task mutation, session input, quick preview, handoff, config editing, or board route yet. <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Real tasks and persisted preferences are specified. --> <!-- consolidation: discard; ref: none; reason: Historical read-only phase scope is obsolete. -->

Legacy presentation source stays available only as rollback source. Public command does not launch tmux presentation panes or hidden `workspace-ui` processes. <!-- consolidation: discard; ref: docs/SPEC.md#current-contract-only-policy; reason: Historical legacy rollback-source retention is not target compatibility policy. --> <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-and-modules; reason: Explicit no hidden UI children or tmux presentation requirement is missing. -->

### Parallel slices

| Slice | Owner boundary | Output |
|---|---|---|
| Public startup | `src/commands/agent-workspace.ts` and startup tests | `agentic-workspace workspace` creates one OpenTUI controller and preserves non-TTY error behavior <!-- consolidation: discard; ref: none; reason: Historical worker/file assignment. --> <!-- consolidation: integrate; ref: docs/specs/interfaces.md#product-surfaces; reason: Non-TTY workspace explicitly fails rather than emulating UI. --> |
| Shell layout | `src/ui/opentui/workspace.ts` and shell layout tests | Navbar/filter, left task list, collapsible right details/agent region, footer <!-- consolidation: discard; ref: none; reason: Historical worker/file assignment. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#ordered-regions; reason: Region ordering is specified. --> <!-- consolidation: discard; ref: docs/screens/workspace.md#ordered-regions; reason: Whole-right-region collapse is superseded. --> |
| State adapter | `src/ui/opentui/workspace-controller.ts` and controller tests | Real `Core`, workspace state, watchers, `UnifiedViewSession`, `TaskViewerSession`, and session-state adapter <!-- consolidation: discard; ref: docs/BLUEPRINT.md#component-ownership; reason: Historical adapter assignment is superseded by model/application ownership. --> |
| Agent state region | New OpenTUI agent-view module and tests | Selected-task session state, no-session/loading/stopped/error states, stale identity guard <!-- consolidation: discard; ref: none; reason: Historical worker/file assignment. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#states; reason: Session feedback states are specified. --> <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-and-modules; reason: Presentation rejects stale identity. --> |

### Review evidence

Run:

```sh
agentic-workspace workspace
```
<!-- consolidation: discard; ref: none; reason: Historical phase review command. -->

Review:

- OpenTUI shell is visible. <!-- consolidation: discard; ref: none; reason: Historical phase review checklist. -->
- Real tasks appear in left pane. <!-- consolidation: exists; ref: docs/screens/workspace.md#ordered-regions; reason: Task region renders project tasks. -->
- Selected task details replace immediately on movement. <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-and-modules; reason: Selection immediately establishes identity. -->
- Right pane collapses and expands. <!-- consolidation: discard; ref: docs/screens/workspace.md#ordered-regions; reason: Whole-right-region collapse is superseded by details-only toggle. -->
- Selected task's current agent state replaces old state. <!-- consolidation: exists; ref: docs/specs/interfaces.md#session-interaction-and-feedback; reason: Selection shows selected-mode session. -->
- No tmux presentation pane or hidden workspace UI process starts. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-and-modules; reason: Explicit no tmux presentation or hidden UI acceptance is missing. -->

### Stop condition

User approves actual shell appearance and selection behavior. <!-- consolidation: unconfirmed; ref: docs/SPEC.md#evidence-and-decisions; reason: Historical shell review gate requires evidence before retirement. -->

## 4. Phase 1 — Visible normal task workflow

### Deliverable

Same `agentic-workspace workspace` screen supports filter editing/search, task create/edit, task actions, board route, help, and normal-mode shortcuts. <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Workspace task workflows board help and shortcuts are retained. -->

### Current review target

The approved Phase 1 normal workflow was recovered from session history on 2026-10-05, before Phase 2 live-preview changes. The workspace surface, controller, and terminal host matched their historical snapshots at recovery. The Enter-only increment below extends that recovered screen without changing its layout. `agentic-workspace workspace` still launches OpenTUI, not the legacy tmux presentation. <!-- consolidation: discard; ref: none; reason: Historical recovery narrative and bounded increment status. -->

Recovery verification: the actual CLI ran in an isolated PTY project. Task navigation changed the selected description, Space collapsed and restored details, idle produced zero output bytes over 1.6 seconds, and Ctrl+C exited with code 0 and restored the main screen. TypeScript, focused tests, and Biome passed. Real-terminal appearance still requires user review. <!-- consolidation: discard; ref: none; reason: Historical recovery verification results. --> <!-- consolidation: unconfirmed; ref: docs/SPEC.md#evidence-and-decisions; reason: Outstanding real-terminal appearance approval is not closed by source/PT Y evidence. -->

- `/` opens task filters and persists applied values. <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Applied filters persist. --> <!-- consolidation: unconfirmed; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Exact slash filter-opening binding is not established. -->
- `n` opens task creation. <!-- consolidation: unconfirmed; ref: docs/screens/tasks.md#states-focus-and-terminal-constraints; reason: Exact n binding is candidate evidence. -->
- `e` edits selected task title, description, type, and priority. <!-- consolidation: exists; ref: docs/screens/tasks.md#contents-and-order; reason: Edit form fields are specified. --> <!-- consolidation: unconfirmed; ref: docs/screens/tasks.md#states-focus-and-terminal-constraints; reason: Exact e binding is candidate evidence. -->
- `y`, `c`, and `a` copy, complete, and archive selected task. <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Copy task ID is supported. --> <!-- consolidation: exists; ref: docs/specs/tasks.md#work-context-and-completion; reason: Completion cleanup is distinct from Done. --> <!-- consolidation: unconfirmed; ref: docs/screens/tasks.md#states-focus-and-terminal-constraints; reason: Exact y/c/a bindings and separate archive behavior need disposition. -->
- `Shift+B` routes to in-host board and returns to same selected task. <!-- consolidation: exists; ref: docs/screens/board.md#ordered-contents; reason: Board shares workspace host. --> <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-and-modules; reason: Board return preserves selected-task identity. --> <!-- consolidation: unconfirmed; ref: docs/screens/board.md#states-and-focus; reason: Exact Shift+B binding remains candidate evidence. -->
- `?` opens shortcut help. <!-- consolidation: unconfirmed; ref: docs/screens/help-dialogs.md#help; reason: Exact question-mark opening binding is not established. -->
- `Ctrl+C` exits public OpenTUI workspace. `q` does not exit. `Esc` closes overlays only. <!-- consolidation: exists; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Navigation Ctrl+C exits and q never exits. --> <!-- consolidation: exists; ref: docs/screens/help-dialogs.md#dialogs-and-editors; reason: Escape cancels dialogs. -->

### Enter-only agent increment

- Press `Enter` on a selected task to start its configured agent command and environment in the existing lower-right agent region. The default command is `opencode`. <!-- consolidation: exists; ref: docs/specs/sessions.md#trigger-and-scope; reason: Start uses selected task/mode current configuration. --> <!-- consolidation: unconfirmed; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Exact Enter binding and default provider are not established by core. -->
- Startup uses the working prototype's `createAgentHost`, armed tmux pane, socket forwarder, headless VT parser, and event-driven retained output renderer. The prototype source is unchanged; the required host/transport modules are copied under `src/agent-workspace/prototype/`. <!-- consolidation: discard; ref: none; reason: Historical prototype-copy implementation inventory. -->
- No task prompt, bootstrap, preparation command, or worktree is sent. Agent keyboard input is enabled only after Tab focuses the running preview. <!-- consolidation: discard; ref: docs/specs/sessions.md#inputs-delivered-to-the-agent; reason: Composed startup instructions are required. --> <!-- consolidation: discard; ref: docs/specs/tasks.md#work-context-and-completion; reason: First launch prepares configured worktree. --> <!-- consolidation: discard; ref: docs/specs/configuration.md#modes-and-approval; reason: Tab now changes mode rather than agent focus. -->
- Repeated `Enter` reuses the task's starting/running host. Switching tasks hides the previous output and restores the selected task's own host without restarting it. <!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#creation-failure-and-recovery; reason: Repeated-start semantics require current task/mode operation policy rather than old host reuse. --> <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-and-modules; reason: Task selection replaces preview without lifecycle effects. -->
- Hosts have the prototype's workspace lifetime, not the legacy durable-session lifecycle. Exiting waits for in-flight startup, stops only this workspace's private tmux servers, and restores the terminal. <!-- consolidation: discard; ref: docs/specs/sessions.md#live-terminal-and-client-lifetime; reason: Workspace lifetime never terminates executions. --> <!-- consolidation: discard; ref: docs/BLUEPRINT.md#launch-context-and-terminal-transport; reason: Per-frontend private servers are prohibited. --> <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-and-modules; reason: UI exit restores terminal state. -->
- Each task uses a separate PID/instance socket. The private `__vt-pipe` re-exec route supports both source and compiled CLI entrypoints. The imported transport retains the first accepted socket before arming completes, so fast forwarder startup cannot lose the connection. <!-- consolidation: discard; ref: none; reason: Historical private transport and re-exec implementation. --> <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-and-modules; reason: Preserve first accepted transport connection when it arrives before arming completes. -->
- Compiled verification exposed `EAGAIN` from Bun's file reader on tmux's non-blocking stdin socket. The copied forwarder uses `process.stdin` for readiness-driven reads; socket transport, synchronous input writes, and VT parsing remain unchanged. Both source and compiled CLI smoke runs delivered live output after the fix. <!-- consolidation: discard; ref: none; reason: Historical forwarder diagnosis fix and smoke evidence. -->
- PTY verification showed real `opencode` at its idle prompt inside the agent region. A deterministic two-task agent verified live output, task isolation, duplicate-Enter protection, empty agent arguments, zero input bytes, skipped preparation, and server cleanup on `Ctrl+C`. This does not claim user-terminal visual approval. <!-- consolidation: discard; ref: none; reason: Historical prototype verification results. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Automated runtime evidence does not substitute for user visual approval. -->

### Preview sizing and input iteration

- Details occupy approximately 30% of the right-hand content area. Space hides or restores only details; the preview takes all remaining height without changing the task-list width. <!-- consolidation: exists; ref: docs/screens/workspace.md#ordered-regions; reason: Normal-flow details proportion and retained-terminal expansion are specified. -->
- The host resizes both its VT parser and tmux window to the preview's actual dimensions, including when details are toggled. <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-and-modules; reason: Preview resize propagates through terminal host. --> <!-- consolidation: discard; ref: none; reason: Prototype VT parser naming is implementation inventory. -->
- Tab focuses a running preview and displays its cursor. Keys and paste use the prototype input translator and worker. Ctrl+Q returns to task navigation; Ctrl+C is ignored while preview input is focused and exits normally outside input mode. <!-- consolidation: discard; ref: docs/specs/configuration.md#modes-and-approval; reason: Tab now switches selected mode. --> <!-- consolidation: discard; ref: none; reason: Prototype translator/worker is obsolete source inventory. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Ctrl+Q returns to navigation and navigation Ctrl+C exits. --> <!-- consolidation: discard; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Agent Ctrl+C now returns to navigation rather than being ignored. -->
- Direct public-CLI PTY smoke confirmed preview dimensions changing from 76×26 to 76×37 and back, typed text reaching the agent, a visible cursor, Ctrl+Q restoring task navigation, and clean Ctrl+C exit. No test suite was run for this iteration. <!-- consolidation: discard; ref: none; reason: Historical PTY evidence and test omission. -->

Review with `bun src/cli/index.ts workspace`: Enter starts the agent, Space toggles details, Tab enters input, and Ctrl+Q returns to tasks. Stop here for user review. <!-- consolidation: discard; ref: docs/specs/configuration.md#modes-and-approval; reason: Historical review recipe includes superseded Tab behavior. --> <!-- consolidation: unconfirmed; ref: docs/SPEC.md#evidence-and-decisions; reason: Historical user-review stop gate requires evidence before retirement. -->

### Preview restoration and legacy styling

- A remounted preview could sample its cached frame before layout, when its height was zero. Slicing the frame to that height stored blank output; unchanged samples then skipped publication. The renderer now receives the entire frame and clips it through its existing viewport. <!-- consolidation: discard; ref: none; reason: Historical prototype frame-clipping diagnosis and fix. -->
- Legacy styling came from `src/ui/components/filter-header.ts`, `src/ui/workspace/task-widgets.ts`, `src/ui/workspace/reconciliation.ts`, `src/ui/workspace/pane.ts`, and `src/ui/workspace/footer.ts` (all removed with the legacy blessed TUI): cyan filter border, status-grouped task rows, inverse/bold selection, yellow focus border, gray inactive borders, blue task-ID heading, and bracketed shortcut hints. <!-- consolidation: discard; ref: docs/DESIGN-SYSTEM.md#type-cells-and-spacing; reason: Historical style-source inventory is not approval for additional shared palette or geometry. -->
- The 44% task-list width, 30% details height, Space toggle, Tab input, Ctrl+Q return, and existing filter dialog remain intact. The details and preview now have separate borders. <!-- consolidation: discard; ref: docs/screens/workspace.md#ordered-regions; reason: 44 percent task width is superseded by roughly 30 percent capped at 35 cells. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#ordered-regions; reason: Details proportion and Space toggle are specified. --> <!-- consolidation: discard; ref: docs/specs/configuration.md#modes-and-approval; reason: Tab now selects mode. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Ctrl+Q returns to navigation. --> <!-- consolidation: exists; ref: docs/screens/help-dialogs.md#dialogs-and-editors; reason: Filter dialog remains specified. --> <!-- consolidation: unconfirmed; ref: docs/screens/workspace.md#ordered-regions; reason: Separate preview border is historical styling evidence without explicit core approval. -->
- Real `opencode` PTY smoke verified Ctrl+Q, navigation away and back, restored live output, re-entered input, and preservation of an unsubmitted draft in the same tmux pane. Selected-row cells were inverse and bold. At 140×44, the pane resized from 76×25 to 76×37 and back, and Ctrl+C restored the main screen with exit code 0. <!-- consolidation: discard; ref: none; reason: Historical provider PTY and styling evidence. -->
- No test suite was run. Cursor research is recorded in `docs/aoe-agent-workspace-reference.md`, section 13. Cursor visibility/style and the explicit Ctrl+C override were not changed in this iteration. <!-- consolidation: discard; ref: none; reason: Historical verification scope and research navigation. -->


### Parallel slices

| Slice | Owner boundary | Output |
|---|---|---|
| Keybinding adapter | `src/ui/opentui/keybindings.ts`, keymap bridge, keybinding tests | Live adapter over `uiKeymap`, named callbacks, footer/help/modal remap proof <!-- consolidation: discard; ref: none; reason: Historical worker/file assignment. --> <!-- consolidation: integrate; ref: docs/screens/help-dialogs.md#help; reason: Live remaps update dispatch and footer/help/modal labels together. --> |
| Task workflow controller | Controller task-intent handlers and controller tests | Create/edit/complete/archive/move/copy through existing `Core` APIs <!-- consolidation: discard; ref: none; reason: Historical worker/file assignment and source API inventory. --> <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#shared-application-operations; reason: Supported actions use shared application ownership. --> <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#work-context-and-completion; reason: Separate archive semantics remain unspecified. --> |
| Overlay integration | Composer, filters, task-actions, controls, and overlay tests | Modal focus restoration, validation/error retention, no shortcut leakage <!-- consolidation: discard; ref: none; reason: Historical worker/file assignment. --> <!-- consolidation: exists; ref: docs/DESIGN-SYSTEM.md#dialogs-and-focus; reason: Modal isolation and unsaved-value retention are specified. --> <!-- consolidation: integrate; ref: docs/DESIGN-SYSTEM.md#dialogs-and-focus; reason: Restore prior focus after overlay close. --> |
| Board route | Board route adapter and board-route tests | In-host board route and persisted selection/filter return <!-- consolidation: discard; ref: none; reason: Historical worker/file assignment. --> <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Views and persisted preferences coexist. --> <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-and-modules; reason: Preserve selection/filter state across board return. --> |

### Review evidence

Run `agentic-workspace workspace`. Review real task creation, editing, filters, search, board return, footer/help, and remapped shortcuts. <!-- consolidation: discard; ref: none; reason: Historical phase manual-review recipe. -->

Confirm `Ctrl+C` is sole exit request, `q` does not exit, and `Esc` only closes/backtracks. <!-- consolidation: exists; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Navigation exit rules are specified. --> <!-- consolidation: exists; ref: docs/screens/help-dialogs.md#dialogs-and-editors; reason: Escape cancels dialogs. -->

### Stop condition

User approves normal task workflow. <!-- consolidation: unconfirmed; ref: docs/SPEC.md#evidence-and-decisions; reason: Historical user-review gate requires evidence before retirement. -->

## 5. Phase 2 — Visible live-agent and quick-preview workflow

**Only the Enter-only increment above is active.** History, handoff, configuration UI, durable-session integration, worktrees, and quick preview remain outside the current authorization. <!-- consolidation: discard; ref: docs/SPEC.md#authority; reason: Historical increment scope is superseded by approved core capabilities and does not authorize renewed execution. -->

### Deliverable

Same `agentic-workspace workspace` screen renders live durable agent output, history, handoff, configuration, worktree state, and quick preview. <!-- consolidation: exists; ref: docs/specs/interfaces.md#session-interaction-and-feedback; reason: Selected-mode session interaction is retained. --> <!-- consolidation: exists; ref: docs/specs/sessions.md#handoff; reason: Handoff is retained. --> <!-- consolidation: exists; ref: docs/specs/configuration.md#agent-settings; reason: Settings are retained. --> <!-- consolidation: discard; ref: docs/specs/sessions.md#live-terminal-and-client-lifetime; reason: Terminal output history is superseded by live-only transport. -->

### Parallel slices

| Slice | Owner boundary | Output |
|---|---|---|
| Session state bridge | Agent-session adapter module and tests | Task-to-session lookup, attach/detach, start/open, state refresh, stale-event rejection <!-- consolidation: discard; ref: none; reason: Historical worker/module assignment. --> <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-and-modules; reason: Shared operations identity-bound attachment and stale-result rejection are specified. --> |
| Live output and history | Agent view module and tests | Output rendering, history navigation, unavailable/stopped/loading states <!-- consolidation: discard; ref: none; reason: Historical worker/module assignment. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#states; reason: Live and unavailable/ended/loading states are specified. --> <!-- consolidation: discard; ref: docs/specs/sessions.md#live-terminal-and-client-lifetime; reason: Terminal output history is superseded. --> |
| Quick-preview router | Dedicated input-mode module and tests | `Ctrl+Q` exit preview, ignored `Ctrl+C`, all other input forwarded only to agent <!-- consolidation: discard; ref: none; reason: Historical worker/module assignment. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Ctrl+Q leaves preview. --> <!-- consolidation: discard; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Ctrl+C now leaves focus rather than being ignored. --> <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-and-modules; reason: Other keys are exclusive to focused agent. --> |
| Session actions | Handoff/config/worktree controller module and tests | Existing service-backed actions and error states <!-- consolidation: discard; ref: none; reason: Historical worker/module assignment. --> <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#shared-application-operations; reason: Shared operations own effects and explicit errors. --> |

### Review evidence

Run `bun run cli workspace` with an active agent. <!-- consolidation: discard; ref: none; reason: Historical phase review invocation. -->

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
<!-- consolidation: unconfirmed; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Exact Enter start/open binding remains candidate evidence. -->
<!-- consolidation: exists; ref: docs/specs/interfaces.md#session-interaction-and-feedback; reason: No-session state offers start. -->
<!-- consolidation: unconfirmed; ref: docs/screens/sessions-artifacts.md#focus-and-constrained-terminals; reason: Exact S picker binding remains candidate evidence. -->
<!-- consolidation: unconfirmed; ref: docs/screens/sessions-artifacts.md#focus-and-constrained-terminals; reason: Exact arrow picker navigation is not established in core. -->
<!-- consolidation: unconfirmed; ref: docs/screens/sessions-artifacts.md#focus-and-constrained-terminals; reason: Exact H handoff binding remains candidate evidence. -->
<!-- consolidation: discard; ref: docs/screens/settings.md#contents-and-order; reason: P task editor recipe is superseded by current settings and override surfaces. -->
<!-- consolidation: discard; ref: docs/specs/configuration.md#modes-and-approval; reason: Tab now selects the task mode rather than agent focus. -->
<!-- consolidation: exists; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Ctrl+Q exits agent focus without forwarding. -->
<!-- consolidation: discard; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Ctrl+C now exits agent focus rather than being ignored. -->

Review live output, stopped-session history, task switching, handoff status, configuration, worktree state, and preview input. <!-- consolidation: discard; ref: none; reason: Historical manual-review checklist including superseded transcript history. -->

Normal `Ctrl+C` exits workspace. `q` never exits. <!-- consolidation: exists; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Navigation exit behavior is specified. -->

### Stop condition

User approves agent workflow. <!-- consolidation: unconfirmed; ref: docs/SPEC.md#evidence-and-decisions; reason: Historical user-review gate requires evidence before retirement. -->

## 6. Phase 3 — Visible full-parity acceptance

### Deliverable

Same OpenTUI workspace satisfies full retained user workflow and cutover acceptance. <!-- consolidation: unconfirmed; ref: docs/SPEC.md#evidence-and-decisions; reason: Historical parity checkpoint cannot be declared complete by mapping. -->

### Parallel slices

| Slice | Owner boundary | Output |
|---|---|---|
| Lifecycle hardening | OpenTUI startup/close integration and tests | Watcher ownership, signal handling, UI-only teardown, non-TTY behavior <!-- consolidation: discard; ref: none; reason: Historical worker/module assignment. --> <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-and-modules; reason: UI-only resource disposal is specified. --> <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-and-modules; reason: Explicit SIGINT/SIGTERM terminal restoration remains missing. --> <!-- consolidation: integrate; ref: docs/specs/interfaces.md#product-surfaces; reason: Non-TTY workspace failure contract is missing. --> |
| End-to-end proof | Focused E2E/manual verification tooling only | Public command, task workflow, session persistence, and no-presentation-tmux assertions <!-- consolidation: unconfirmed; ref: docs/SPEC.md#evidence-and-decisions; reason: Historical end-to-end parity proof requires evidence before closure. --> |
| Compiled CLI proof | Build/smoke support only | Compiled executable launches workspace cleanly <!-- consolidation: exists; ref: docs/CONVENTIONS.md#validation; reason: Runnable handoff requires rebuilt executable verification. --> |
| Parity audit | Tests and documentation only | Matrix closure against behavior and session contracts <!-- consolidation: unconfirmed; ref: docs/SPEC.md#evidence-and-decisions; reason: Historical matrix closure needs current-contract evidence. --> |

### Review evidence

Run `agentic-workspace workspace` and prove task, board, detail, filter, search, edit, session, history, handoff, config, worktree, quick-preview, close/reopen, and failure states. <!-- consolidation: unconfirmed; ref: docs/SPEC.md#evidence-and-decisions; reason: Historical cutover proof checkpoint needs current-contract scope and evidence before retirement. -->

Run focused tests, full tests, build, actual terminal verification, and compiled CLI smoke. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Historical full-parity gate needs evidence before retirement rather than becoming a universal full-suite rule. -->

### Stop condition

User approves full parity before deletion. <!-- consolidation: unconfirmed; ref: docs/SPEC.md#evidence-and-decisions; reason: Owner approval before legacy deletion must not be waived without evidence. -->

## 7. Phase 4 — Remove legacy presentation

### Deliverable

The visible `agentic-workspace workspace` remains unchanged. Legacy Blessed workspace presentation and tmux layout code are deleted. <!-- consolidation: discard; ref: none; reason: Historical deletion-phase deliverable. -->

Durable tmux agent-session implementation remains. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#component-ownership; reason: Agent runtime remains separate from presentation. -->

### Parallel slices

| Slice | Owner boundary | Output |
|---|---|---|
| Legacy UI deletion | Legacy Blessed workspace modules and dedicated tests | Remove obsolete panes, regions, controller, and handlers <!-- consolidation: discard; ref: none; reason: Historical deletion worker/file inventory. --> |
| Tmux presentation deletion | `TmuxWorkspace` presentation-only code and hidden workspace UI paths | Remove layout, hidden process launch, key tables, and presentation signals <!-- consolidation: discard; ref: none; reason: Historical deletion worker/file inventory. --> |
| Test/doc cleanup | Obsolete tests and documentation references only | Delete stale tests and update public architecture docs <!-- consolidation: exists; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Remove superseded callers and fixtures with contract changes. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#documentation-maintenance; reason: Update owning contracts and references rather than retain stale duplicates. --> |

### Review evidence

Run `agentic-workspace workspace`. Confirm same OpenTUI output. Confirm no legacy presentation caller remains. Confirm durable agent sessions still pass lifecycle tests. <!-- consolidation: unconfirmed; ref: docs/SPEC.md#evidence-and-decisions; reason: Historical deletion parity and lifecycle verification gate needs evidence before retirement. -->

Run full tests, build, actual terminal check, and compiled smoke. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Historical deletion gate requires evidence before retirement. -->

### Stop condition

User approves final deletion result. <!-- consolidation: unconfirmed; ref: docs/SPEC.md#evidence-and-decisions; reason: Final owner-review checkpoint cannot be closed by annotation. -->

## 8. Verification standard

Every phase requires:

1. A visible `agentic-workspace workspace` review target. <!-- consolidation: unconfirmed; ref: docs/SPEC.md#evidence-and-decisions; reason: Historical phase review target remains checkpoint evidence work. -->
2. Focused tests for changed behavior. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Affected behavior tests are required. -->
3. TypeScript check. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#validation; reason: Type checking is specified. -->
4. Biome check for changed files. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#validation; reason: Configured formatting/lint validation is specified. -->
5. Actual terminal exercise of changed workspace path. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Scoped terminal acceptance checkpoint requires evidence before retirement. -->

Phases 3 and 4 also require full tests, build, and compiled executable smoke. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Historical parity/deletion gates need evidence rather than being silently waived or universalized. -->

## 9. Rollback

Before Phase 4, rollback restores legacy presentation as the public command entrypoint in one revert. It does not run a dual public UI. <!-- consolidation: discard; ref: docs/SPEC.md#current-contract-only-policy; reason: Historical pre-cutover rollback route does not authorize current compatibility UI. -->

After Phase 4, rollback reverts the cutover/deletion changes as one commit. <!-- consolidation: discard; ref: none; reason: Historical rollback procedure tied to obsolete phase commits. -->

## 10. Cross-references

- `docs/opentui-workspace-spec.md`
- `docs/opentui-workspace-behavior-matrix.md`
- `docs/opentui-workspace-session-contract.md`
- `docs/BACK-728-handoff.md`
- `docs/tmux-layer-spec.md`
- `docs/aoe-agent-workspace-reference.md`
