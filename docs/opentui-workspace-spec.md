# OpenTUI Workspace Specification

> [`docs/SPEC.md`](./SPEC.md) is authoritative wherever this document disagrees with it.

**Status:** the native terminal baseline is user-approved. The current behavior below describes the subsequent workspace pass and supersedes the historical design sections.

## Current native behavior

- `agentic-workspace workspace`, interactive `agentic-workspace board`, and `agentic-workspace board view` use OpenTUI. Piped board output remains Markdown; `--milestones` works on direct and nested board commands.
- Tasks occupy 30% of workspace width. `Shift+[` hides that pane without restarting selected agent. `Space` shows or hides details in normal layout flow. Details use roughly 30% of right-region height above live preview. Hiding details expands same retained terminal and changes its rows. Collapse hint is right-aligned on details border.
- Task navigation keeps the current viewport while selection remains visible. Moving past its top or bottom scrolls only enough to reveal the selected row. Selection refreshes retain the viewport; changing status, filters, or view resets it.
- In task lists, `g` selects the first filtered task and `G` selects the last. Workspace jumps stay within the active status tab; board jumps stay within the selected status pane. `Home` and `End` remain available. Empty panes are safe, and editable fields and focused agent terminals keep their input.
- Status tabs live inside Tasks and use native `BoxRenderable` and `TextRenderable` composition. Each label keeps its natural width plus one space per side; there is no per-tab count or fixed cell. The active tab draws a three-row cap whose reversed bottom seams open into the task viewport, while inactive labels rest on the shared baseline. To Do is blue, In Progress is yellow, and Done is bright green. Custom statuses remain neutral. Selection adds bold text and raised chrome, not a text-background highlight; all labels keep the `#1f1f1f` background and borders are `#555555`. The Tasks title carries the count. Keyboard and mouse click navigation both work; overflow scrolls to keep the active tab visible and exposes clickable `◀` and `▶`. This composition requires no additional package or custom renderer.
- `Enter` starts selected agent once or returns to retained terminal. New sessions receive exactly `Active task: <taskId>.` and `Wait for user instructions.` on separate lines. Starting a session does not authorize task work, but it moves the task to the configured In Progress status and the workspace follows the status tab there while keeping the task selected. Attaching does not change status. While the agent session is starting, the agent header shows `warming up`.
- `Tab` focuses agent. `f` shows same retained terminal fullscreen, reserving one bottom row for visible `Ctrl+Q` exit hint. `Ctrl+Q` and `Ctrl+C` return to navigation without forwarding an interrupt; navigation `Ctrl+C` exits. `q` never exits.
- OpenTUI owns terminal parsing, styling, cursor behavior, scrolling, paste, and key encoding. The adapter normalizes the native parser's legacy Alt modifier before native encoding, and for legacy raw sequences the native encoder cannot faithfully re-encode it forwards the original bytes unchanged: Alt/Option plus one printable character (iTerm2 sends `Esc b`/`Esc f` for Option+Left/Right word motion) and legacy SS3 arrows (`Esc O A`–`Esc O D`). It does not implement word editing.
- Modal, preview, details, and tab surfaces use neutral backgrounds instead of dark blue. Filter dialogs remain opaque and own keyboard/paste focus. `Enter` or `Ctrl+S` applies, `Ctrl+R` resets draft, and `Escape` cancels.
- Workspace agents use durable task-session records, saved native conversation IDs, and output logs. `s` opens newest-first session picker with active session marked. Selection displays retained live terminal or resumes exact conversation, never latest conversation by inference.
- The task-row dot is the agent-session indication: a single map keyed by task id that renders iff the task has an active session. Green = working (a fresh <30 s `running` hook or pane chrome showing running); blue = parked (any active session not currently working, including idle, unknown, not-yet-probed after restart/resume, and durable parked/starting); orange = waiting and red = error, both transient. A task with no active session renders no dot. It appears on selected and unselected task rows. The selected row uses dark text on a light slate background, with a darkened variant of each colour for readable contrast. Selection stays visible when focus moves elsewhere.
- Workspace exit awaits workspace-owned agent teardown. Normal exit, `SIGINT`, and `SIGTERM` close owned terminals and stop owned agent process groups, including children that ignore `SIGHUP`. Teardown escalates from `SIGTERM` to `SIGKILL` when necessary. Releasing a process **parks** the session: the durable record stays non-terminal (`parked`) with its active pointer, and the next workspace start auto-resumes the selected task's parked conversation. Workspace exit therefore never ends a session. Ownership and termination must be proven before removing process handles or capture files; failures remain explicit and never mark the session stopped. A tmux session whose name is not a project session name (`agentic-workspace-<task-slug>-<8 hex>`) is refused, not adopted or killed. Attaching to CLI-owned running sessions does not transfer ownership; workspace exit detaches without killing them. `SIGKILL` and hard crashes cannot run in-process cleanup.
- Selecting a task whose CLI-owned session still runs attaches its real pane automatically. Auto-attach sends no `Enter`, starts no session, resumes no conversation, records no usage, and changes no ownership; returning to the task keeps the same preview. A stopped task never auto-resumes. Auto-attach probes only the selected task; a bounded ~30 s probe/reconcile sweep covers every durable-active session for liveness, so a non-selected session's dot is not stale until selected. The passive probe settles a session only when tmux conclusively reports its pane dead or canonically missing, and never kills a pane; an inconclusive probe leaves durable status unchanged and shows a notice. A tmux pane-died hook is deferred future work.
- The shared agent backend is always the default tmux server, independent of an ambient tmux client. Every agent is one uniquely named session on it, `agentic-workspace-<task-slug>-<8 hex>`. A workspace running inside another tmux server still attaches the real agent on the default server.
- `Ctrl+[` and `Ctrl+]` navigate up to 100 session-local snapshots of task selection, filters, workspace/board view, and status tab. New navigation after going back discards forward history.
- `?` opens shortcut help. `/` searches; `Enter` replaces the selected row's binding. Binding and description are separate columns in one shared responsive layout, so descriptions stay aligned across capture phases. The active row holds a native inline `Press key...` input. After the first stroke, such as `Shift+F`, the binding renders as plain text and the native pending input moves right within the same column, while the description keeps its column. The footer offers an optional second stroke. A second stroke opens the unchanged Save/Discard footer. `Escape` after the first stroke opens single-stroke confirmation and removes the pending prompt. `Left`/`Right` selects Save or Discard; `Enter` applies the choice. Initial `Escape` is recorded, so pressing `Escape` twice confirms an Escape binding. Nothing persists until Save. Overrides persist in project-local view state and replace default aliases; legacy alias arrays remain aliases. Conflicting bindings, including ambiguous sequence prefixes, cannot replace a working binding.
- Navigation footer shows essential actions only. Tasks with saved sessions show Sessions/Handoff instead of Start; tasks without sessions show Enter/Start. Focused agent input shows only leave-agent shortcut. Help retains complete shortcut list.
- `,` opens a fullscreen, project-only Settings shell. A three-row header shows `Settings` and `[ Project ]`; a three-row footer shows contextual key hints and status. A 20-column rounded `Categories` pane containing `Agents` sits beside a rounded content pane, with cyan `#22d3ee` focus. Fields show a label, the selected field's description, and a read-only value. `Right` enters the category's fields; `Left` returns to categories without changing values. `Tab`/`Shift+Tab`, `Up`/`Down`, or mouse clicks select fields. `Enter` starts editing; preset arrows change a staged choice, and text fields reveal a native input. `Enter` commits the field to the settings draft; `Escape` cancels that field edit and stays in Settings. Multiline environment paste works; `Shift+Enter` inserts a newline when supported by the terminal. At the preset selector, `Space` marks the chosen preset as default and `n` copies its provider adapter into a new named preset. `Ctrl+S` saves only committed draft values, never the current uncommitted editor buffer. `Escape` outside editing discards the whole draft. Existing preparation, worktree, and adapter fields survive edits. The horizontal scrollbar stays hidden; the vertical scrollbar appears only on overflow. User-level settings are not exposed.
- New-task creation defaults to inheriting project configuration. Choosing preset saves explicit task override atomically with creation. `p` changes selected task's preset or clears override. `h` chooses replacement preset before starting linked session; failed launch preserves active predecessor. Settings UI is project scope only; preset visibility does not claim live verification for additional providers.
- Task create and edit forms stay compact: option fields render as a one-line `◀ value ▶` cycler (Left/Up previous, Right/Down next, wrapping) instead of an expanded list. The create form keeps title, description, status, type, priority, project, agent preset, worktree-per-task, and YOLO. The edit form shows title, description, type, and priority. Due date remains editable through the CLI and visible in the read-only details pane.
- `agentic-workspace skill` prints AgenticWorkspace Task Management skill. Task-manager launches supply temporary session-scoped skill directory rather than installing into global or project discovery paths. New agents run from project root without task/project metadata environment variables. Provider prerequisites are described in [session contract](./opentui-workspace-session-contract.md).
- Workspace refresh reads project session state once rather than reloading the task corpus for each visible task. Rapid navigation coalesces pending refreshes and commits the latest selection instead of replaying obsolete snapshots. Session state remains freshly read; this does not introduce a stale session cache. Board cross-branch task loading remains unchanged.

Legacy terminals encode `Ctrl+[` and `Escape` identically. Navigation treats that byte as history back; modal and agent focus retain Escape behavior.

### TTT tab reference

This composition follows the [TTT v1.6.0 `tabbar_widget.go`](https://github.com/eugenioenko/ttt/blob/v1.6.0/internal/ui/tabbar_widget.go): the active tab is a three-row cap whose reversed bottom seams open into the content viewport below, and inactive labels rest on a shared baseline at natural label width plus one space per side. AgenticWorkspace renders the same geometry inside Tasks, with plain status labels, no per-tab count, and no underline, separator, or fixed cell.

### AOE settings reference

Settings composition follows Agent of Empires' actual renderer: a fullscreen [shell](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/tui/settings/render.rs#L75-L117) with a three-row header, adjacent rounded category and content panes, and a three-row footer. Focus uses a cyan accent on the focused pane. The same renderer supplies [header and scope controls](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/tui/settings/render.rs#L280-L385), [category navigation and focus](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/tui/settings/render.rs#L436-L511), [field controls](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/tui/settings/render.rs#L517-L675), and [footer actions](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/tui/settings/render.rs#L1204-L1346).

The remaining sections preserve original design history. They do not override current shortcuts, session ownership, idle startup, or split-pane rules above.

## 1. Goal

`agentic-workspace workspace` becomes one OpenTUI Core workspace process.

It replaces tmux/Blessed presentation. It retains existing task domain services, persistence, watchers, and durable tmux-backed agent sessions.

## 2. Scope

### In scope

- Public `agentic-workspace workspace` OpenTUI workspace.
- Task navigation, filtering, search, details, creation, editing, lifecycle actions, and board route.
- Live agent session status, output, history, handoff, configuration, and quick preview.
- Config-driven shortcuts, help, footer labels, and workspace exit behavior.
- Removal of legacy presentation after parity passes.

### Out of scope

- Replacing `Core` task persistence or domain logic.
- Replacing durable agent processes; session lifecycle ownership follows the [session-service target design](./session-service-redesign.md#ownership).
- Changing agent-provider semantics.
- Adding a second public workspace command or compatibility UI.

## 3. Public command

```sh
agentic-workspace workspace
```

The command starts one OpenTUI host.

It must not create tmux presentation panes or hidden `workspace-ui` processes.

A non-TTY invocation retains explicit existing non-interactive failure behavior. It must not emulate a terminal interface in plain output.

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

- Top navbar contains workspace identity, active filter state, and filter control.
- Left pane contains visible tasks and current selection.
- Right pane contains selected task details and relevant live-agent state/output.
- Right pane is collapsible. When collapsed, task list uses released width.
- Bottom footer contains contextual shortcuts, current mode, operation status, and errors.
- Board is a route inside same OpenTUI host. It does not create tmux panes.

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

Only one route, focus target, details mode, overlay, and input mode are active at once.

Opening an overlay records prior focus. Closing it restores prior focus.

## 6. Task selection invariant

Changing selected task must immediately replace right-pane identity.

Same selection update must show:

- Selected task details.
- Selected task agent-session state.
- Selected task live output when a session exists.
- Explicit no-session, starting, stopped, or unavailable state when no usable output exists.

Old task output must clear before new task output commits.

Any asynchronous result must carry task/session identity. A late result for an unselected task is ignored.

## 7. Normal workspace behavior

Retain current domain behavior for:

- Persisted selection, filters, and workspace state.
- Task list navigation and details visibility.
- Task filtering and search.
- New task creation and task field editing.
- Complete, archive, copy, and board move actions.
- Board route and return to task route.
- Agent start/open, live output, history, handoff, configuration, and worktree selection.
- Task/config/session watcher refresh.

Mutations use the shared owners defined in the [session-service target design](./session-service-redesign.md#ownership).

Closing the workspace detaches the UI only. It must never terminate a durable agent session.

## 8. Shortcut source and dispatch

`src/ui/keymap.ts` remains the canonical persisted shortcut source.

`src/ui/opentui/keybindings.ts` adapts that live configuration. It must not become a second shortcut configuration.

Every workspace action registers a named callback:

```ts
keybindings.on(shortcutsConfig.workspace.newTask, startNewTask);
keybindings.on(shortcutsConfig.workspace.search, beginSearch);
keybindings.on(shortcutsConfig.workspace.handoff, openHandoff);
```

Footer labels and help labels derive from the same live configuration.

A runtime shortcut remap must update dispatch, footer labels, help labels, and modal labels together.

### 8.1 Normal-mode precedence

Outside quick preview, dispatch order is:

```text
active overlay
→ focused control
→ focused panel
→ route-wide action
→ workspace-global action
```

An action may not leak through an active modal.

### 8.2 Normal-mode exit

`Ctrl+C` is the only application-exit shortcut.

`q` never exits the workspace.

`Esc` never exits the application. It closes an overlay or returns from nested detail/history state.

If unsaved user input exists, `Ctrl+C` opens the existing confirmation behavior before exit.

### 8.3 Quick preview

Quick preview gives keyboard control to selected task's live agent.

Input precedence in quick preview is exact:

```text
Ctrl+Q → exit quick preview; do not send key to agent
Ctrl+C → ignore; do not send key to agent; do not exit application
all other keys → send to live agent only
```

No workspace shortcut runs during quick preview.

Footer must show:

```text
Quick preview • Ctrl+Q exit preview
```

On `Ctrl+Q`, restore prior workspace focus and normal shortcut routing.

## 9. Required state feedback

Workspace provides explicit visible states for:

- No tasks.
- No matching tasks.
- Selected task removed externally.
- Task loading or refresh failure.
- Task save failure.
- Agent unavailable, starting, running, stopped, or output unavailable.
- Configuration save failure.
- Handoff failure.

Errors preserve unsaved form data.

### 9.1 Agent activity overlay

The task-row dot is the agent-session indication: a single map keyed by task id that renders iff the
task has an active session. The source of truth is the durable session status; the hook sidecar is
the event stream. Green = working (a fresh <30 s `running` hook or pane chrome showing running);
blue = parked (any active session not currently working, including idle, unknown, not-yet-probed
after restart/resume, and durable parked/starting); orange = waiting and red = error, both
transient. A task with no active session renders no dot. It drives:

- the task row marker dot colour (green working, blue parked, orange waiting, red error; no dot
  without an active session);
- the live-preview header (`Agent session · <preset> · <activity>`);
- the preview placeholder (`Agent is waiting for input.` while waiting).

Hook transitions are read with `fs.watch` on the per-session `<task dir>/<sessionId>.activity`
directory (coalesced ~10 ms), with an initial reconcile and a slow 30 s backstop. The overlay is
derived, never authoritative, and is never persisted: no `state.json` field, no `SessionStore.mutate`
call, no `SessionState.version` change. It updates through a dedicated `setActivity` mount method plus
a redraw — never a workspace refresh — so an activity change cannot remount the surface or churn the
status tabs. The status tabs keep rendering task statuses only.

## 10. Reuse boundaries

### Reuse directly

| Existing code | New responsibility |
|---|---|
| `src/ui/opentui/host.ts` | Single renderer lifecycle and terminal cleanup |
| `src/ui/opentui/workspace.ts` | Workspace layout scaffold |
| `src/ui/opentui/workspace-controller.ts` | Public workspace controller scaffold |
| `src/ui/opentui/keybindings.ts` | Binding registry, priority, and shortcut rendering |
| `src/ui/opentui/board.ts` | In-host board route |
| `src/ui/opentui/task-composer.ts` | New-task overlay |
| `src/ui/opentui/task-actions.ts` | Task action overlay |
| `src/ui/opentui/filters.ts` | Filter editor |
| `src/ui/opentui/controls.ts` | Shared modal controls |
| `Core` | Task reads, writes, and lifecycle mutations |
| Session and Harness | Session lifecycle and provider execution, as defined in the [session-service target design](./session-service-redesign.md#ownership) |
| Existing task/config/session watchers | Live refresh |

### Remove after successful cutover

- `TmuxWorkspace` presentation layout.
- Hidden `workspace-ui` presentation command.
- Blessed `WorkspacePane`.
- Blessed workspace navigation/footer regions.
- Legacy workspace key handlers.
- Presentation tmux key tables and pane focus logic.

## 11. Architecture rule

```text
OpenTUI renderer
→ emits user intent only

OpenTUI workspace controller
→ coordinates Core, workspace state, watchers, and agent sessions

Existing domain services
→ own persistence, mutations, and process lifecycle
```

Renderer code must not write tasks, spawn agents, stop agents, own persistence, or duplicate domain filtering rules.

## 12. Acceptance criteria

The cutover is complete only when:

1. `agentic-workspace workspace` launches one OpenTUI host.
2. No hidden workspace UI process or tmux presentation pane starts.
3. Normal-mode `Ctrl+C` is only application-exit path.
4. Quick preview forwards only allowed keys and implements exact `Ctrl+Q` and `Ctrl+C` rules.
5. Task selection updates task details and task-specific live-agent state immediately.
6. Stale prior-task output never appears after selection changes.
7. Existing task and agent-session workflows pass end to end.
8. Runtime key remaps update behavior, footer, help, and modal labels.
9. Closing workspace preserves durable agent sessions.
10. Blessed workspace presentation code has no public caller.
11. Full tests, build, actual terminal verification, and compiled CLI smoke pass.

## 13. Cross-references

- `docs/BACK-728-handoff.md`
- `docs/tmux-layer-spec.md`
- `docs/aoe-agent-workspace-reference.md`
- `docs/opentui-workspace-implementation-plan.md`
- `docs/opentui-workspace-behavior-matrix.md`
- `docs/opentui-workspace-session-contract.md`
