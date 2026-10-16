---
consolidation:
  total: 237
  counts:
    exists: 115
    discard: 59
    integrate: 38
    unconfirmed: 25
  percentages:
    exists: 48.52%
    discard: 24.89%
    integrate: 16.03%
    unconfirmed: 10.55%
---
# OpenTUI Workspace Specification

> **Retained source material pending fold.** [SPEC](SPEC.md) owns canonical behavior and [BLUEPRINT](BLUEPRINT.md) owns canonical structure; they supersede conflicting authority claims below. Scoped execution safety gates remain required through the [alignment ledger](alignment-plan.md#scoped-execution-and-safety-references). This banner does not retire the material or waive its gates. <!-- consolidation: unconfirmed; ref: none; reason: Core authority is established. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#documentation-maintenance; reason: Unique safeguards must be mapped before retirement. -->

> [`docs/SPEC.md`](./SPEC.md) is authoritative wherever this document disagrees with it. <!-- consolidation: unconfirmed; ref: none; reason: Approved owners supersede source material. -->

**Status:** the native terminal baseline is user-approved. The current behavior below describes the subsequent workspace pass and supersedes the historical design sections. <!-- consolidation: discard; ref: none; reason: Historical approval and pass status do not override later core decisions. -->

## Current native behavior

- `agentic-workspace workspace`, interactive `agentic-workspace board`, and `agentic-workspace board view` use OpenTUI. Piped board output remains Markdown; `--milestones` works on direct and nested board commands. <!-- consolidation: exists; ref: docs/screens/board.md#ordered-contents; reason: Shared host board presentation is retained. --> <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Exact board command aliases and milestone flags require API inventory disposition. --> <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Piped board Markdown export is not an approved integration operation yet. -->
- Tasks occupy 30% of workspace width. `Shift+[` hides that pane without restarting selected agent. `Space` shows or hides details in normal layout flow. Details use roughly 30% of right-region height above live preview. Hiding details expands same retained terminal and changes its rows. Collapse hint is right-aligned on details border. <!-- consolidation: discard; ref: docs/screens/workspace.md#ordered-regions; reason: Unqualified 30 percent width is superseded by the 35-cell cap. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Task-pane toggle retains the agent. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#ordered-regions; reason: Space changes details visibility in normal flow. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#ordered-regions; reason: Details proportion and retained-terminal row expansion are specified. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#ordered-regions; reason: Right-aligned collapse hint is specified. -->
- Task navigation keeps the current viewport while selection remains visible. Moving past its top or bottom scrolls only enough to reveal the selected row. Selection refreshes retain the viewport; changing status, filters, or view resets it. <!-- consolidation: exists; ref: docs/screens/workspace.md#states; reason: Minimal selection scrolling and refresh/reset boundaries are specified. -->
- In task lists, `g` selects the first filtered task and `G` selects the last. Workspace jumps stay within the active status tab; board jumps stay within the selected status pane. `Home` and `End` remain available. Empty panes are safe, and editable fields and focused agent terminals keep their input. <!-- consolidation: exists; ref: docs/screens/workspace.md#states; reason: Workspace boundary navigation and input isolation are specified. --> <!-- consolidation: exists; ref: docs/screens/board.md#ordered-contents; reason: Board boundary jumps remain within the selected pane. -->
- Status tabs live inside Tasks and use native `BoxRenderable` and `TextRenderable` composition. Each label keeps its natural width plus one space per side; there is no per-tab count or fixed cell. The active tab draws a three-row cap whose reversed bottom seams open into the task viewport, while inactive labels rest on the shared baseline. To Do is blue, In Progress is yellow, and Done is bright green. Custom statuses remain neutral. Selection adds bold text and raised chrome, not a text-background highlight; all labels keep the `#1f1f1f` background and borders are `#555555`. The Tasks title carries the count. Keyboard and mouse click navigation both work; overflow scrolls to keep the active tab visible and exposes clickable `◀` and `▶`. This composition requires no additional package or custom renderer. <!-- consolidation: discard; ref: none; reason: Native renderable choices and package inventory are implementation detail. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#ordered-regions; reason: Natural tab width and no fixed cells or per-tab count are specified. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#ordered-regions; reason: Active cap and inactive baseline geometry are specified. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#ordered-regions; reason: Built-in and custom status colors are specified. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#ordered-regions; reason: Selection chrome and exact background and border colors are specified. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#ordered-regions; reason: Tasks title carries the count. --> <!-- consolidation: integrate; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Retain keyboard and mouse tab selection plus active-tab overflow tracking and clickable arrows. -->
- `Enter` starts selected agent once or returns to retained terminal. New sessions receive exactly `Active task: <taskId>.` and `Wait for user instructions.` on separate lines. Starting a session does not authorize task work, but it moves the task to the configured In Progress status and the workspace follows the status tab there while keeping the task selected. Attaching does not change status. While the agent session is starting, the agent header shows `warming up`. <!-- consolidation: unconfirmed; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Exact Enter start binding is not established in core. --> <!-- consolidation: discard; ref: docs/specs/sessions.md#starting-a-session; reason: Exact idle-only prompt is superseded by task and mode startup instructions. --> <!-- consolidation: discard; ref: docs/specs/sessions.md#starting-a-session; reason: Blanket idle-only authorization restriction is superseded by configured mode startup. --> <!-- consolidation: exists; ref: docs/specs/sessions.md#purpose; reason: Start changes unfinished task status and attach is not start. --> <!-- consolidation: integrate; ref: docs/screens/workspace.md#states; reason: Preserve selected task while following its start-induced status-tab change. --> <!-- consolidation: unconfirmed; ref: docs/screens/workspace.md#states; reason: Exact warming-up header copy remains unapproved in core. -->
- `Tab` focuses agent. `f` shows same retained terminal fullscreen, reserving one bottom row for visible `Ctrl+Q` exit hint. `Ctrl+Q` and `Ctrl+C` return to navigation without forwarding an interrupt; navigation `Ctrl+C` exits. `q` never exits. <!-- consolidation: discard; ref: docs/specs/configuration.md#configuration-and-modes; reason: Tab now selects the task mode rather than focusing the agent. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Fullscreen uses retained terminal and visible bottom exit hint. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Agent escape and navigation exit rules are specified. -->
- OpenTUI owns terminal parsing, styling, cursor behavior, scrolling, paste, and key encoding. The adapter normalizes the native parser's legacy Alt modifier before native encoding, and for legacy raw sequences the native encoder cannot faithfully re-encode it forwards the original bytes unchanged: Alt/Option plus one printable character (iTerm2 sends `Esc b`/`Esc f` for Option+Left/Right word motion) and legacy SS3 arrows (`Esc O A`–`Esc O D`). It does not implement word editing. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Record native terminal ownership of parsing styling cursor scrolling paste and encoding without app word editing. --> <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Preserve legacy Alt normalization and exact raw Alt-printable or SS3 bytes when native re-encoding loses meaning. -->
- Modal, preview, details, and tab surfaces use neutral backgrounds instead of dark blue. Filter dialogs remain opaque and own keyboard/paste focus. `Enter` or `Ctrl+S` applies, `Ctrl+R` resets draft, and `Escape` cancels. <!-- consolidation: integrate; ref: docs/DESIGN-SYSTEM.md#dialogs-and-focus; reason: Preserve neutral modal preview and details backgrounds without inventing new palette values. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#ordered-regions; reason: Neutral tab background is already specified. --> <!-- consolidation: exists; ref: docs/screens/help-dialogs.md#dialogs-and-editors; reason: Filter opacity focus and apply/reset/cancel bindings are specified. -->
- Workspace agents use durable task-session records, saved native conversation IDs, and output logs. `s` opens newest-first session picker with active session marked. Selection displays retained live terminal or resumes exact conversation, never latest conversation by inference. <!-- consolidation: exists; ref: docs/specs/sessions.md#sessions; reason: Conversation identities and histories persist. --> <!-- consolidation: discard; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Terminal output logs are superseded by live-only transport. --> <!-- consolidation: integrate; ref: docs/screens/sessions-artifacts.md#session-picker; reason: Preserve newest-first picker ordering and active marker within selected task and mode. --> <!-- consolidation: unconfirmed; ref: docs/screens/sessions-artifacts.md#focus-and-constrained-terminals; reason: Exact s picker binding remains candidate evidence. --> <!-- consolidation: exists; ref: docs/screens/sessions-artifacts.md#session-picker; reason: Live attach and exact-conversation resume are specified. -->
- The task-row dot is the agent-session indication: a single map keyed by task id that renders iff the task has an active session. Green = working (a fresh <30 s `running` hook or pane chrome showing running); blue = parked (any active session not currently working, including idle, unknown, not-yet-probed after restart/resume, and durable parked/starting); orange = waiting and red = error, both transient. A task with no active session renders no dot. It appears on selected and unselected task rows. The selected row uses dark text on a light slate background, with a darkened variant of each colour for readable contrast. Selection stays visible when focus moves elsewhere. <!-- consolidation: discard; ref: docs/specs/interfaces.md#session-interaction-and-feedback; reason: Dot requires selected-mode activity evidence rather than any task active pointer. --> <!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Specific hook freshness and pane-chrome evidence need provider validation. --> <!-- consolidation: exists; ref: docs/DESIGN-SYSTEM.md#status-and-activity; reason: Working green idle/unknown/starting blue permission orange and error red are specified. --> <!-- consolidation: discard; ref: docs/specs/sessions.md#sessions; reason: Durable parked/starting labels are not runtime truth. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#states; reason: No-active-session suppression selected/unselected dots contrast and persistent selection are specified. -->
- Workspace exit awaits workspace-owned agent teardown. Normal exit, `SIGINT`, and `SIGTERM` close owned terminals and stop owned agent process groups, including children that ignore `SIGHUP`. Teardown escalates from `SIGTERM` to `SIGKILL` when necessary. Releasing a process **parks** the session: the durable record stays non-terminal (`parked`) with its active pointer, and the next workspace start auto-resumes the selected task's parked conversation. Workspace exit therefore never ends a session. Ownership and termination must be proven before removing process handles or capture files; failures remain explicit and never mark the session stopped. A tmux session whose name is not a project session name (`agentic-workspace-<task-slug>-<8 hex>`) is refused, not adopted or killed. Attaching to CLI-owned running sessions does not transfer ownership; workspace exit detaches without killing them. `SIGKILL` and hard crashes cannot run in-process cleanup. <!-- consolidation: discard; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Workspace exit must leave executions running rather than TERM/KILL owned groups. --> <!-- consolidation: discard; ref: docs/specs/sessions.md#sessions; reason: Durable parking and automatic resume are superseded by observation and explicit lifecycle intent. --> <!-- consolidation: exists; ref: docs/BLUEPRINT.md#observation-stop-and-deletion; reason: Proven ownership cleanup-before-forgetting and explicit failure reporting remain required. --> <!-- consolidation: integrate; ref: docs/BLUEPRINT.md#observation-stop-and-deletion; reason: Retain exact project-session name validation before touching tmux targets. --> <!-- consolidation: exists; ref: docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport; reason: Attachment owns only client transport and never transfers execution ownership. --> <!-- consolidation: discard; ref: none; reason: Hard-kill cleanup limitation is explanatory historical runtime evidence. -->
- Selecting a task whose CLI-owned session still runs attaches its real pane automatically. Auto-attach sends no `Enter`, starts no session, resumes no conversation, records no usage, and changes no ownership; returning to the task keeps the same preview. A stopped task never auto-resumes. Auto-attach probes only the selected task; a bounded ~30 s probe/reconcile sweep covers every durable-active session for liveness, so a non-selected session's dot is not stale until selected. The passive probe settles a session only when tmux conclusively reports its pane dead or canonically missing, and never kills a pane; an inconclusive probe leaves durable status unchanged and shows a notice. A tmux pane-died hook is deferred future work. <!-- consolidation: exists; ref: docs/specs/interfaces.md#session-interaction-and-feedback; reason: Selecting live sessions only attaches without input or lifecycle effects. --> <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Automatic preview attachment must not record usage and returns to retained preview identity. --> <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#application-controller; reason: Task selection has no implicit start/resume side effect. --> <!-- consolidation: discard; ref: docs/specs/sessions.md#sessions; reason: Refresh targets every task rather than only durable-active records. --> <!-- consolidation: exists; ref: docs/specs/sessions.md#sessions; reason: Thirty-second refresh and explicit unknown evidence are specified. --> <!-- consolidation: discard; ref: docs/architecture/session-harness.md#session; reason: Observation does not settle durable lifecycle labels. --> <!-- consolidation: discard; ref: none; reason: Deferred pane hook is implementation backlog rather than a core requirement. -->
- The shared agent backend is always the default tmux server, independent of an ambient tmux client. Every agent is one uniquely named session on it, `agentic-workspace-<task-slug>-<8 hex>`. A workspace running inside another tmux server still attaches the real agent on the default server. <!-- consolidation: discard; ref: docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport; reason: Always-default wording omits the supported explicit socket override. --> <!-- consolidation: exists; ref: docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport; reason: Ambient client does not select the shared backend. --> <!-- consolidation: integrate; ref: docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport; reason: Preserve unique per-agent tmux session naming and project-name shape. -->
- `Ctrl+[` and `Ctrl+]` navigate up to 100 session-local snapshots of task selection, filters, workspace/board view, and status tab. New navigation after going back discards forward history. <!-- consolidation: integrate; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Navigation history bounds snapshot contents bindings and forward-history truncation are absent. -->
- `?` opens shortcut help. `/` searches; `Enter` replaces the selected row's binding. Binding and description are separate columns in one shared responsive layout, so descriptions stay aligned across capture phases. The active row holds a native inline `Press key...` input. After the first stroke, such as `Shift+F`, the binding renders as plain text and the native pending input moves right within the same column, while the description keeps its column. The footer offers an optional second stroke. A second stroke opens the unchanged Save/Discard footer. `Escape` after the first stroke opens single-stroke confirmation and removes the pending prompt. `Left`/`Right` selects Save or Discard; `Enter` applies the choice. Initial `Escape` is recorded, so pressing `Escape` twice confirms an Escape binding. Nothing persists until Save. Overrides persist in project-local view state and replace default aliases; legacy alias arrays remain aliases. Conflicting bindings, including ambiguous sequence prefixes, cannot replace a working binding. <!-- consolidation: unconfirmed; ref: docs/screens/help-dialogs.md#help; reason: Exact question-mark help-opening binding is not specified. --> <!-- consolidation: exists; ref: docs/screens/help-dialogs.md#help; reason: Search and replacement bindings are specified. --> <!-- consolidation: exists; ref: docs/screens/help-dialogs.md#help; reason: Aligned columns and inline prompt movement are specified. --> <!-- consolidation: exists; ref: docs/screens/help-dialogs.md#help; reason: One/two-stroke confirmation and Escape capture are specified. --> <!-- consolidation: exists; ref: docs/screens/help-dialogs.md#help; reason: Save-only persistence and conflict rejection are specified. --> <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Shortcut overrides persist across reopening. --> <!-- consolidation: integrate; ref: docs/screens/help-dialogs.md#help; reason: Saved override replaces default aliases rather than adding another binding. --> <!-- consolidation: unconfirmed; ref: none; reason: Legacy alias-array compatibility needs explicit exception rather than assumed retention. -->
- Navigation footer shows essential actions only. Tasks with saved sessions show Sessions/Handoff instead of Start; tasks without sessions show Enter/Start. Focused agent input shows only leave-agent shortcut. Help retains complete shortcut list. <!-- consolidation: exists; ref: docs/DESIGN-SYSTEM.md#shared-footer-and-focus; reason: Essential contextual actions agent escape and complete help are specified. --> <!-- consolidation: discard; ref: docs/DESIGN-SYSTEM.md#shared-footer-and-focus; reason: Start versus Sessions/Handoff depends on selected task and mode active session rather than task-wide saved history. -->
- `,` opens a fullscreen, project-only Settings shell. A three-row header shows `Settings` and `[ Project ]`; a three-row footer shows contextual key hints and status. A 20-column rounded `Categories` pane containing `Agents` sits beside a rounded content pane, with cyan `#22d3ee` focus. Fields show a label, the selected field's description, and a read-only value. `Right` enters the category's fields; `Left` returns to categories without changing values. `Tab`/`Shift+Tab`, `Up`/`Down`, or mouse clicks select fields. `Enter` starts editing; preset arrows change a staged choice, and text fields reveal a native input. `Enter` commits the field to the settings draft; `Escape` cancels that field edit and stays in Settings. Multiline environment paste works; `Shift+Enter` inserts a newline when supported by the terminal. At the preset selector, `Space` marks the chosen preset as default and `n` copies its provider adapter into a new named preset. `Ctrl+S` saves only committed draft values, never the current uncommitted editor buffer. `Escape` outside editing discards the whole draft. Existing preparation, worktree, and adapter fields survive edits. The horizontal scrollbar stays hidden; the vertical scrollbar appears only on overflow. User-level settings are not exposed. <!-- consolidation: unconfirmed; ref: docs/screens/settings.md#states-and-focus; reason: Comma opening binding is not established in core. --> <!-- consolidation: exists; ref: docs/screens/settings.md#contents-and-order; reason: Project shell header/footer and pane geometry colors and field order are specified. --> <!-- consolidation: exists; ref: docs/screens/settings.md#states-and-focus; reason: Category and field navigation are specified. --> <!-- consolidation: exists; ref: docs/screens/settings.md#states-and-focus; reason: Staged field editing commit and cancellation are specified. --> <!-- consolidation: exists; ref: docs/screens/settings.md#states-and-focus; reason: Multiline paste and supported newline key are specified. --> <!-- consolidation: exists; ref: docs/screens/settings.md#states-and-focus; reason: Preset default and adapter-copy actions are specified. --> <!-- consolidation: exists; ref: docs/screens/settings.md#states-and-focus; reason: Save excludes editor buffer and outer Escape discards draft. --> <!-- consolidation: integrate; ref: docs/screens/settings.md#states-and-focus; reason: Settings edits preserve unrelated preparation worktree and adapter metadata. --> <!-- consolidation: exists; ref: docs/screens/settings.md#states-and-focus; reason: Scrollbar visibility is specified. --> <!-- consolidation: discard; ref: docs/specs/configuration.md#configuration-and-modes; reason: Project-only exposure limit is superseded by all supported configuration reachable in TUI. -->
- New-task creation defaults to inheriting project configuration. Choosing preset saves explicit task override atomically with creation. `p` changes selected task's preset or clears override. `h` chooses replacement preset before starting linked session; failed launch preserves active predecessor. Settings UI is project scope only; preset visibility does not claim live verification for additional providers. <!-- consolidation: exists; ref: docs/specs/configuration.md#configuration-and-modes; reason: Unspecified task settings inherit project settings. --> <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#application-controller; reason: Explicit preset override is committed atomically with task creation. --> <!-- consolidation: unconfirmed; ref: docs/screens/tasks.md#states-focus-and-terminal-constraints; reason: Exact p override binding and clearing interaction are candidate evidence. --> <!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#handoff; reason: Replacement-preset chooser and h binding are not established by the core handoff contract. --> <!-- consolidation: exists; ref: docs/specs/sessions.md#handoff; reason: Failed successor preserves predecessor. --> <!-- consolidation: discard; ref: docs/specs/configuration.md#configuration-and-modes; reason: TUI exposes all supported configuration. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#testing; reason: UI visibility and live-provider verification are distinct evidence. -->
- Task create and edit forms stay compact: option fields render as a one-line `◀ value ▶` cycler (Left/Up previous, Right/Down next, wrapping) instead of an expanded list. The create form keeps title, description, status, type, priority, project, agent preset, worktree-per-task, and YOLO. The edit form shows title, description, type, and priority. Due date remains editable through the CLI and visible in the read-only details pane. <!-- consolidation: exists; ref: docs/screens/tasks.md#contents-and-order; reason: Compact option cycler and directional wrapping are specified. --> <!-- consolidation: exists; ref: docs/screens/tasks.md#contents-and-order; reason: Listed create/edit fields other than project and due date are retained. --> <!-- consolidation: discard; ref: docs/screens/tasks.md#contents-and-order; reason: Project field and due date are removed across surfaces. -->
- `agentic-workspace skill` prints AgenticWorkspace Task Management skill. Task-manager launches supply temporary session-scoped skill directory rather than installing into global or project discovery paths. New agents run from project root without task/project metadata environment variables. Provider prerequisites are described in [session contract](./opentui-workspace-session-contract.md). <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Skill command requires guidance API disposition. --> <!-- consolidation: integrate; ref: docs/architecture/session-harness.md#harness; reason: Preserve isolated process-scoped skill loading without global/project installation. --> <!-- consolidation: discard; ref: docs/specs/tasks.md#launching-work-and-completing-a-task; reason: Configured worktree first launch supersedes project-root-only execution. --> <!-- consolidation: discard; ref: docs/specs/sessions.md#starting-a-session; reason: Explicit task/project/mode/session environment is now required. -->
- Workspace refresh reads project session state once rather than reloading the task corpus for each visible task. Rapid navigation coalesces pending refreshes and commits the latest selection instead of replaying obsolete snapshots. Session state remains freshly read; this does not introduce a stale session cache. Board cross-branch task loading remains unchanged. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Refresh reads project session state once and coalesces navigation to the latest selection without stale caching. --> <!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Cross-branch task discovery is superseded by one configured store. -->

Legacy terminals encode `Ctrl+[` and `Escape` identically. Navigation treats that byte as history back; modal and agent focus retain Escape behavior. <!-- consolidation: integrate; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Preserve context-specific handling of indistinguishable legacy Escape/history bytes. -->

### TTT tab reference

This composition follows the [TTT v1.6.0 `tabbar_widget.go`](https://github.com/eugenioenko/ttt/blob/v1.6.0/internal/ui/tabbar_widget.go): the active tab is a three-row cap whose reversed bottom seams open into the content viewport below, and inactive labels rest on a shared baseline at natural label width plus one space per side. AgenticWorkspace renders the same geometry inside Tasks, with plain status labels, no per-tab count, and no underline, separator, or fixed cell. <!-- consolidation: exists; ref: docs/screens/workspace.md#ordered-regions; reason: Tab geometry label sizing and omitted decoration are fully specified. --> <!-- consolidation: discard; ref: none; reason: External renderer provenance remains source reference material. -->

### AOE settings reference

Settings composition follows Agent of Empires' actual renderer: a fullscreen [shell](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/tui/settings/render.rs#L75-L117) with a three-row header, adjacent rounded category and content panes, and a three-row footer. Focus uses a cyan accent on the focused pane. The same renderer supplies [header and scope controls](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/tui/settings/render.rs#L280-L385), [category navigation and focus](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/tui/settings/render.rs#L436-L511), [field controls](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/tui/settings/render.rs#L517-L675), and [footer actions](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/tui/settings/render.rs#L1204-L1346). <!-- consolidation: exists; ref: docs/screens/settings.md#contents-and-order; reason: Shell geometry and focus accent are specified. --> <!-- consolidation: discard; ref: none; reason: External renderer links are provenance rather than additional requirements. -->

The remaining sections preserve original design history. They do not override current shortcuts, session ownership, idle startup, or split-pane rules above. <!-- consolidation: discard; ref: none; reason: Historical hierarchy is superseded by core authority. -->

## 1. Goal

`agentic-workspace workspace` becomes one OpenTUI Core workspace process. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Explicit single OpenTUI host contract is missing. -->

It replaces tmux/Blessed presentation. It retains existing task domain services, persistence, watchers, and durable tmux-backed agent sessions. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#component-ownership; reason: Presentation is separate from shared domain persistence and runtime. --> <!-- consolidation: discard; ref: docs/BLUEPRINT.md#component-ownership; reason: Freeze of historical services is superseded by Task Session and Harness ownership. -->

## 2. Scope

### In scope

- Public `agentic-workspace workspace` OpenTUI workspace. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Name the single public OpenTUI host entry. -->
- Task navigation, filtering, search, details, creation, editing, lifecycle actions, and board route. <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Task workflows and board coexist. -->
- Live agent session status, output, history, handoff, configuration, and quick preview. <!-- consolidation: exists; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Live interaction and retained conversation identity are supported. --> <!-- consolidation: exists; ref: docs/specs/sessions.md#handoff; reason: Handoff is retained. --> <!-- consolidation: exists; ref: docs/specs/configuration.md#edit-agent-settings; reason: Agent configuration is retained. -->
- Config-driven shortcuts, help, footer labels, and workspace exit behavior. <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Custom shortcuts help and contextual footer are retained. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Exit behavior is specified. -->
- Removal of legacy presentation after parity passes. <!-- consolidation: unconfirmed; ref: none; reason: Historical deletion gate requires evidence before retirement. -->

### Out of scope

- Replacing `Core` task persistence or domain logic. <!-- consolidation: discard; ref: docs/BLUEPRINT.md#component-ownership; reason: Historical migration scope cannot freeze current domain design. -->
- Replacing durable agent processes; session lifecycle ownership follows the [session-service target design](./session-service-redesign.md#ownership). <!-- consolidation: exists; ref: docs/BLUEPRINT.md#component-ownership; reason: Runtime lifecycle remains outside presentation. -->
- Changing agent-provider semantics. <!-- consolidation: discard; ref: none; reason: Historical bounded migration scope. -->
- Adding a second public workspace command or compatibility UI. <!-- consolidation: unconfirmed; ref: none; reason: Unapproved compatibility surfaces are excluded. -->

## 3. Public command

```sh
agentic-workspace workspace
```
<!-- consolidation: discard; ref: none; reason: Command example repeats the public host requirement. -->

The command starts one OpenTUI host. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Explicit one-host OpenTUI lifecycle is missing. -->

It must not create tmux presentation panes or hidden `workspace-ui` processes. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Preserve prohibition on hidden UI processes and tmux presentation topology. -->

A non-TTY invocation retains explicit existing non-interactive failure behavior. It must not emulate a terminal interface in plain output. <!-- consolidation: integrate; ref: docs/specs/interfaces.md#feature-contracts; reason: Workspace non-TTY invocation explicitly fails rather than emulating a terminal. -->

## 4. Layout

```text
┌ Top navbar: workspace state and filter ────────────────────────────────┐
├ Task list ───────────────────┬ Details and live agent ────────────────┤
│ left pane                    │ right pane, collapsible                │
│ selected task                │ selected-task details                  │
│                              │ selected-task live agent               │
├ Bottom footer: shortcuts and status ──────────────────────────────────┤
└───────────────────────────────────────────────────────────────────────┘
```
<!-- consolidation: exists; ref: docs/screens/workspace.md#ordered-regions; reason: Header tasks selected-task region and footer ordering are specified. -->
<!-- consolidation: discard; ref: docs/screens/workspace.md#ordered-regions; reason: Diagram whole-right-region collapse is superseded by details-only normal-flow collapse. -->

- Top navbar contains workspace identity, active filter state, and filter control. <!-- consolidation: exists; ref: docs/screens/workspace.md#ordered-regions; reason: Header content is specified. -->
- Left pane contains visible tasks and current selection. <!-- consolidation: exists; ref: docs/screens/workspace.md#ordered-regions; reason: Task region is specified. -->
- Right pane contains selected task details and relevant live-agent state/output. <!-- consolidation: exists; ref: docs/screens/workspace.md#ordered-regions; reason: Selected-task region is specified. -->
- Right pane is collapsible. When collapsed, task list uses released width. <!-- consolidation: discard; ref: docs/screens/workspace.md#ordered-regions; reason: Details collapse releases terminal rows and task width is capped. -->
- Bottom footer contains contextual shortcuts, current mode, operation status, and errors. <!-- consolidation: exists; ref: docs/screens/workspace.md#ordered-regions; reason: Footer actions status and errors are specified. --> <!-- consolidation: discard; ref: docs/DESIGN-SYSTEM.md#shared-footer-and-focus; reason: Separate task-level mode cue is not required. -->
- Board is a route inside same OpenTUI host. It does not create tmux panes. <!-- consolidation: exists; ref: docs/screens/board.md#ordered-contents; reason: Board shares the workspace host. -->

## 5. Workspace state

```ts
type WorkspaceRoute = "tasks" | "board";

type WorkspaceFocus =
	| "taskList"
	| "details"
	| "agentSession"
	| "filter";

type DetailsMode = "task" | "agentOutput" | "agentHistory";

type WorkspaceOverlay =
	| "none"
	| "help"
	| "taskComposer"
	| "taskActions"
	| "filterEditor"
	| "handoff"
	| "agentConfig"
	| "fieldEditor"
	| "confirm";

type InputMode = "workspace" | "quickPreview";
```
<!-- consolidation: discard; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: WorkspaceRoute exact union is an illustrative historical declaration. -->
<!-- consolidation: discard; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: WorkspaceFocus exact union is an illustrative historical declaration. -->
<!-- consolidation: discard; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: DetailsMode output-history union assumes superseded transcript retention. -->
<!-- consolidation: discard; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: WorkspaceOverlay declaration is not a permanent interface contract. -->
<!-- consolidation: discard; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: InputMode declaration is local implementation shape. -->

Only one route, focus target, details mode, overlay, and input mode are active at once. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Preserve exclusive presentation route focus overlay and input ownership without freezing unions. -->

Opening an overlay records prior focus. Closing it restores prior focus. <!-- consolidation: integrate; ref: docs/DESIGN-SYSTEM.md#dialogs-and-focus; reason: Prior-focus capture and restoration are not explicit. -->

## 6. Task selection invariant

Changing selected task must immediately replace right-pane identity. <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Selection establishes identity before asynchronous attachment. -->

Same selection update must show:

- Selected task details. <!-- consolidation: exists; ref: docs/screens/workspace.md#ordered-regions; reason: Details follow selected task. -->
- Selected task agent-session state. <!-- consolidation: exists; ref: docs/specs/interfaces.md#session-interaction-and-feedback; reason: Selected task and mode determine session. -->
- Selected task live output when a session exists. <!-- consolidation: exists; ref: docs/screens/workspace.md#states; reason: Running session displays live terminal. -->
- Explicit no-session, starting, stopped, or unavailable state when no usable output exists. <!-- consolidation: exists; ref: docs/screens/workspace.md#states; reason: Absent starting ended and unknown displays are specified. -->

Old task output must clear before new task output commits. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Make synchronous prior-output clearing explicit before replacement reads. -->

Any asynchronous result must carry task/session identity. A late result for an unselected task is ignored. <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Async results are identity-bound and obsolete results cannot replace current view. -->

## 7. Normal workspace behavior

Retain current domain behavior for:

- Persisted selection, filters, and workspace state. <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: View preferences persist. -->
- Task list navigation and details visibility. <!-- consolidation: exists; ref: docs/screens/workspace.md#ordered-regions; reason: Task navigation and details toggle are specified. -->
- Task filtering and search. <!-- consolidation: exists; ref: docs/specs/interfaces.md#filtering-and-search; reason: Task filters are specified. -->
- New task creation and task field editing. <!-- consolidation: exists; ref: docs/screens/tasks.md#contents-and-order; reason: Task forms are specified. -->
- Complete, archive, copy, and board move actions. <!-- consolidation: exists; ref: docs/specs/tasks.md#launching-work-and-completing-a-task; reason: Completion cleanup remains distinct from Done. --> <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Copy ID and board moves are supported. --> <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#launching-work-and-completing-a-task; reason: Separate task archive semantics require disposition. -->
- Board route and return to task route. <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Users switch between both views. -->
- Agent start/open, live output, history, handoff, configuration, and worktree selection. <!-- consolidation: exists; ref: docs/specs/sessions.md#starting-a-session; reason: Session start uses effective configuration and work context. --> <!-- consolidation: exists; ref: docs/specs/sessions.md#handoff; reason: Handoff remains supported. --> <!-- consolidation: exists; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Live output and retained conversations remain distinct. -->
- Task/config/session watcher refresh. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Preserve subscriptions to existing task configuration and session refresh sources. -->

Mutations use the shared owners defined in the [session-service target design](./session-service-redesign.md#ownership). <!-- consolidation: exists; ref: docs/BLUEPRINT.md#component-ownership; reason: Shared model and application owners are specified. -->

Closing the workspace detaches the UI only. It must never terminate a durable agent session. <!-- consolidation: exists; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Client exit leaves executions running. -->

## 8. Shortcut source and dispatch

`src/ui/keymap.ts` remains the canonical persisted shortcut source. <!-- consolidation: discard; ref: none; reason: Exact source location is implementation navigation. -->

`src/ui/opentui/keybindings.ts` adapts that live configuration. It must not become a second shortcut configuration. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Shortcut dispatch and rendering share one live configuration authority. -->

Every workspace action registers a named callback: <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Preserve action callback registration through shared shortcut dispatch. -->

```ts
keybindings.on(shortcutsConfig.workspace.newTask, startNewTask);
keybindings.on(shortcutsConfig.workspace.search, beginSearch);
keybindings.on(shortcutsConfig.workspace.handoff, openHandoff);
```
<!-- consolidation: discard; ref: none; reason: Callback example is illustrative syntax rather than a separate interface mandate. -->

Footer labels and help labels derive from the same live configuration. <!-- consolidation: integrate; ref: docs/screens/help-dialogs.md#help; reason: Labels must derive from live shortcut configuration. -->

A runtime shortcut remap must update dispatch, footer labels, help labels, and modal labels together. <!-- consolidation: integrate; ref: docs/screens/help-dialogs.md#help; reason: Remaps update dispatch and all displayed bindings together. -->

### 8.1 Normal-mode precedence

Outside quick preview, dispatch order is:

```text
active overlay
→ focused control
→ focused panel
→ route-wide action
→ workspace-global action
```
<!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Preserve overlay control panel route global dispatch precedence. -->

An action may not leak through an active modal. <!-- consolidation: exists; ref: docs/DESIGN-SYSTEM.md#dialogs-and-focus; reason: Modal input isolation is required. -->

### 8.2 Normal-mode exit

`Ctrl+C` is the only application-exit shortcut. <!-- consolidation: exists; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Navigation exit binding is specified. -->

`q` never exits the workspace. <!-- consolidation: exists; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: q never exits. -->

`Esc` never exits the application. It closes an overlay or returns from nested detail/history state. <!-- consolidation: exists; ref: docs/screens/help-dialogs.md#dialogs-and-editors; reason: Escape cancels dialogs rather than exiting. --> <!-- consolidation: discard; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Nested transcript-history navigation is obsolete. -->

If unsaved user input exists, `Ctrl+C` opens the existing confirmation behavior before exit. <!-- consolidation: integrate; ref: docs/screens/help-dialogs.md#dialogs-and-editors; reason: Unsaved-input exit confirmation is missing. -->

### 8.3 Quick preview

Quick preview gives keyboard control to selected task's live agent. <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Preview input targets selected execution through terminal host. -->

Input precedence in quick preview is exact:

```text
Ctrl+Q → exit quick preview; do not send key to agent
Ctrl+C → ignore; do not send key to agent; do not exit application
all other keys → send to live agent only
```
<!-- consolidation: exists; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Ctrl+Q leaves preview without forwarding. -->
<!-- consolidation: discard; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Ctrl+C now leaves agent focus rather than being ignored. -->
<!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: All non-escape keys route exclusively to focused agent. -->

No workspace shortcut runs during quick preview. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Focused agent input must suppress background workspace shortcuts. -->

Footer must show:

```text
Quick preview • Ctrl+Q exit preview
```
<!-- consolidation: exists; ref: docs/DESIGN-SYSTEM.md#shared-footer-and-focus; reason: Focused agent footer offers only leave action. -->
<!-- consolidation: unconfirmed; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Exact Quick preview footer wording is not established. -->

On `Ctrl+Q`, restore prior workspace focus and normal shortcut routing. <!-- consolidation: exists; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Leave-agent shortcut restores navigation. -->

## 9. Required state feedback

Workspace provides explicit visible states for:

- No tasks. <!-- consolidation: exists; ref: docs/screens/workspace.md#states; reason: Empty project state is specified. -->
- No matching tasks. <!-- consolidation: exists; ref: docs/screens/workspace.md#states; reason: Empty filter results are distinguishable. -->
- Selected task removed externally. <!-- consolidation: exists; ref: docs/screens/workspace.md#states; reason: Removed selection has visible feedback. -->
- Task loading or refresh failure. <!-- consolidation: exists; ref: docs/screens/workspace.md#states; reason: Load and refresh failure are visible. -->
- Task save failure. <!-- consolidation: exists; ref: docs/screens/workspace.md#states; reason: Save failure is visible. -->
- Agent unavailable, starting, running, stopped, or output unavailable. <!-- consolidation: exists; ref: docs/screens/workspace.md#states; reason: Session presentation states are specified. -->
- Configuration save failure. <!-- consolidation: exists; ref: docs/screens/settings.md#states-and-focus; reason: Save errors retain staged values. -->
- Handoff failure. <!-- consolidation: exists; ref: docs/specs/sessions.md#handoff; reason: Handoff failures are reported. -->

Errors preserve unsaved form data. <!-- consolidation: exists; ref: docs/DESIGN-SYSTEM.md#dialogs-and-focus; reason: Failure retains unsaved values. -->

### 9.1 Agent activity overlay

The task-row dot is the agent-session indication: a single map keyed by task id that renders iff the
task has an active session. The source of truth is the durable session status; the hook sidecar is
the event stream. Green = working (a fresh <30 s `running` hook or pane chrome showing running);
blue = parked (any active session not currently working, including idle, unknown, not-yet-probed
after restart/resume, and durable parked/starting); orange = waiting and red = error, both
transient. A task with no active session renders no dot. It drives: <!-- consolidation: discard; ref: docs/specs/interfaces.md#session-interaction-and-feedback; reason: Durable task-wide status is superseded by selected-mode observed evidence. --> <!-- consolidation: exists; ref: docs/DESIGN-SYSTEM.md#status-and-activity; reason: Working permission idle and error colors are specified. --> <!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Hook freshness and chrome evidence need provider-specific validation. -->

- the task row marker dot colour (green working, blue parked, orange waiting, red error; no dot
  without an active session); <!-- consolidation: exists; ref: docs/DESIGN-SYSTEM.md#status-and-activity; reason: Activity color meanings are specified. --> <!-- consolidation: exists; ref: docs/specs/interfaces.md#session-interaction-and-feedback; reason: No active selected-mode session means no dot. -->
- the live-preview header (`Agent session · <preset> · <activity>`); <!-- consolidation: discard; ref: docs/screens/workspace.md#ordered-regions; reason: Header now includes agent runtime status selected mode and actual path. -->
- the preview placeholder (`Agent is waiting for input.` while waiting). <!-- consolidation: unconfirmed; ref: docs/screens/workspace.md#states; reason: Exact placeholder wording is not approved. -->

Hook transitions are read with `fs.watch` on the per-session `<task dir>/<sessionId>.activity`
directory (coalesced ~10 ms), with an initial reconcile and a slow 30 s backstop. The overlay is
derived, never authoritative, and is never persisted: no `state.json` field, no `SessionStore.mutate`
call, no `SessionState.version` change. It updates through a dedicated `setActivity` mount method plus
a redraw — never a workspace refresh — so an activity change cannot remount the surface or churn the
status tabs. The status tabs keep rendering task statuses only. <!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Exact activity sidecar watcher path and 10 ms debounce remain implementation evidence. --> <!-- consolidation: exists; ref: docs/specs/sessions.md#sessions; reason: Activity is ephemeral and refreshes every 30 seconds. --> <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Activity redraw must not remount workspace or churn status tabs. --> <!-- consolidation: discard; ref: none; reason: Exact setActivity method and state-version names are implementation shape. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#ordered-regions; reason: Status tabs represent task statuses. -->

## 10. Reuse boundaries

### Reuse directly

| Existing code | New responsibility |
|---|---|
| `src/ui/opentui/host.ts` | Single renderer lifecycle and terminal cleanup <!-- consolidation: discard; ref: none; reason: Historical source reuse inventory. --> |
| `src/ui/opentui/workspace.ts` | Workspace layout scaffold <!-- consolidation: discard; ref: none; reason: Historical source reuse inventory. --> |
| `src/ui/opentui/workspace-controller.ts` | Public workspace controller scaffold <!-- consolidation: discard; ref: none; reason: Historical source reuse inventory. --> |
| `src/ui/opentui/keybindings.ts` | Binding registry, priority, and shortcut rendering <!-- consolidation: discard; ref: none; reason: Historical source reuse inventory. --> |
| `src/ui/opentui/board.ts` | In-host board route <!-- consolidation: exists; ref: docs/screens/board.md#ordered-contents; reason: Board shares workspace host. --> |
| `src/ui/opentui/task-composer.ts` | New-task overlay <!-- consolidation: exists; ref: docs/screens/tasks.md#contents-and-order; reason: Task creation form is specified. --> |
| `src/ui/opentui/task-actions.ts` | Task action overlay <!-- consolidation: discard; ref: none; reason: Historical source reuse inventory. --> |
| `src/ui/opentui/filters.ts` | Filter editor <!-- consolidation: exists; ref: docs/screens/help-dialogs.md#dialogs-and-editors; reason: Filter editor contract is specified. --> |
| `src/ui/opentui/controls.ts` | Shared modal controls <!-- consolidation: discard; ref: none; reason: Historical source reuse inventory. --> |
| `Core` | Task reads, writes, and lifecycle mutations <!-- consolidation: discard; ref: docs/BLUEPRINT.md#component-ownership; reason: Task model application and repository now have explicit separate ownership. --> |
| Session and Harness | Session lifecycle and provider execution, as defined in the [session-service target design](./session-service-redesign.md#ownership) <!-- consolidation: exists; ref: docs/BLUEPRINT.md#component-ownership; reason: Session and Harness own conversation and execution. --> |
| Existing task/config/session watchers | Live refresh <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Retain shared watcher subscriptions rather than a second refresh authority. --> |

### Remove after successful cutover
<!-- consolidation: unconfirmed; ref: none; reason: Successful-cutover deletion gate requires evidence before retirement. -->

- `TmuxWorkspace` presentation layout. <!-- consolidation: discard; ref: none; reason: Historical removal checklist item. -->
- Hidden `workspace-ui` presentation command. <!-- consolidation: discard; ref: none; reason: Historical removal checklist item. -->
- Blessed `WorkspacePane`. <!-- consolidation: discard; ref: none; reason: Historical removal checklist item. -->
- Blessed workspace navigation/footer regions. <!-- consolidation: discard; ref: none; reason: Historical removal checklist item. -->
- Legacy workspace key handlers. <!-- consolidation: discard; ref: none; reason: Historical removal checklist item. -->
- Presentation tmux key tables and pane focus logic. <!-- consolidation: discard; ref: none; reason: Historical removal checklist item. -->

## 11. Architecture rule

```text
OpenTUI renderer
→ emits user intent only

OpenTUI workspace controller
→ coordinates Core, workspace state, watchers, and agent sessions

Existing domain services
→ own persistence, mutations, and process lifecycle
```
<!-- consolidation: exists; ref: docs/BLUEPRINT.md#component-ownership; reason: Renderer emits intent without owning effects. -->
<!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: UI controller coordinates application operations and watchers. -->
<!-- consolidation: exists; ref: docs/BLUEPRINT.md#component-ownership; reason: Domain application and infrastructure own persistence and execution effects. -->

Renderer code must not write tasks, spawn agents, stop agents, own persistence, or duplicate domain filtering rules. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#component-ownership; reason: Renderer has no domain mutation persistence or process authority. -->

## 12. Acceptance criteria

The cutover is complete only when:

1. `agentic-workspace workspace` launches one OpenTUI host. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Explicit single-host acceptance is missing. -->
2. No hidden workspace UI process or tmux presentation pane starts. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Explicit no-presentation-tmux acceptance is missing. -->
3. Normal-mode `Ctrl+C` is only application-exit path. <!-- consolidation: exists; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Navigation exit contract is specified. -->
4. Quick preview forwards only allowed keys and implements exact `Ctrl+Q` and `Ctrl+C` rules. <!-- consolidation: discard; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Historical ignored Ctrl+C rule is superseded by return to navigation. -->
5. Task selection updates task details and task-specific live-agent state immediately. <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Selection identity transition precedes async work. -->
6. Stale prior-task output never appears after selection changes. <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Obsolete output cannot update replacement view. -->
7. Existing task and agent-session workflows pass end to end. <!-- consolidation: unconfirmed; ref: none; reason: Historical parity gate needs evidence and current-contract scope before retirement. -->
8. Runtime key remaps update behavior, footer, help, and modal labels. <!-- consolidation: integrate; ref: docs/screens/help-dialogs.md#help; reason: Remap consistency across all labels and dispatch is missing. -->
9. Closing workspace preserves durable agent sessions. <!-- consolidation: exists; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Client exit leaves agents running. -->
10. Blessed workspace presentation code has no public caller. <!-- consolidation: unconfirmed; ref: none; reason: Superseded public compatibility paths are removed. -->
11. Full tests, build, actual terminal verification, and compiled CLI smoke pass. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#testing; reason: Historical cutover acceptance gate requires evidence before retirement rather than a new blanket full-suite rule. -->

## 13. Cross-references

- `docs/BACK-728-handoff.md`
- `docs/tmux-layer-spec.md`
- `docs/aoe-agent-workspace-reference.md`
- `docs/opentui-workspace-implementation-plan.md`
- `docs/opentui-workspace-behavior-matrix.md`
- `docs/opentui-workspace-session-contract.md`
