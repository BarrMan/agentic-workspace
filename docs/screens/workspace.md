# Workspace

Purpose: navigate the project's grouped tasks and inspect or use the selected task's session. Product rules: [SPEC](../SPEC.md). Shared visual rules: [design system](../DESIGN-SYSTEM.md).

## Ordered regions

1. Workspace header: workspace identity and active filter state/control.
2. Task region: nested task groups and tasks. In normal layout, target roughly 30% of workspace width, subject to a maximum of 35 terminal display cells and shrinking below that cap when space is constrained. Status tabs sit inside Tasks: active tab is a three-row cap with reversed bottom seams opening to the task viewport; inactive labels share its baseline at natural label width plus one space on each side. No per-tab count, fixed cell, underline, or separator; Tasks title carries the count. To Do is blue, In Progress yellow, Done bright green, custom statuses neutral. Status-tab labels use `#1f1f1f` and their borders use `#555555`. The selected task row is bold with raised chrome and dark text on a light-slate background; use a darker status-color variant where needed for contrast. Keep keyboard focus visibly indicated independently of selection.
3. Selected-task region: details and selected-mode session presentation. Details use roughly 30% of right-region height above live preview. `Space` shows/hides details in normal flow; the same retained terminal gains the released rows. The details border has a right-aligned collapse hint. When a session is active, its session header shows, in order, agent, runtime status, selected mode, and actual working-directory path on one line. Hide it when that mode has no active session; do not substitute an assumed path.
4. Footer: follows the [essential-actions requirement, IF-WB-008](../specs/workspace-and-board.md#if-wb-008-complete-action-listings), and shows concise operation status/error.

The task-list width and details/preview proportions above are approved qualitative layout rules. No minimum terminal dimensions are established.

## States

- Empty project and no matching filter results must be distinguishable.
- Task loading/refresh failure, save failure, and externally removed selection need visible feedback.
- Session absent for selected mode: explain there is no session in that mode; offer the normal start action.
- Starting: unavailable until usable; do not present as running.
- Running: show the live terminal; selecting it attaches without sending input or changing control.
- Parked: the live preview pane is retained; selecting a parked session switches the preview to that session without resuming it.
- Stopped: show a prompt to resume and identify the session-picker/start shortcut; resume requires an explicit user action and never happens automatically.
- Unknown/unavailable liveness: do not infer running or stopped from stored labels.
- Starting, running, parked, and stopped are distinct lifecycle states. Starting is unavailable until usable; it is never presented as running.
- Permission request and activity error must remain distinguishable.
- Task-row activity indications appear on selected and unselected rows only when there is observed activity evidence; lifecycle state alone does not determine the indication. Selection remains visible when focus moves elsewhere.
- Selecting a task updates the task-list highlight, details region, and preview region together. Activity evidence updates only the task-row indication and session header, leaving the list, details, and preview content and position unchanged.
- Navigation preserves the viewport while selection remains visible, scrolling only enough when it crosses an edge. Refreshing selection preserves the viewport; status, filter, and view changes reset it.
- `g`/`G` select the first/last filtered task within the active status tab; `Home`/`End` remain available. Empty panes are safe; editable fields and focused agent terminals keep their input.

## Focus and constrained terminals

Keyboard/focus behavior follows SPEC and the active shortcut configuration. `Tab` changes the selected mode for the selected task; session execution remains unchanged. `f` shows the same retained terminal fullscreen with a bottom row reserved for the visible `Ctrl+Q` exit hint; `Ctrl+Q` and `Ctrl+C` return to navigation without forwarding an interrupt. Navigation `Ctrl+C` exits; `q` never exits. At narrow sizes, shrink the task region below its 35-cell cap and preserve selected-task identity and essential footer actions. Exact minimum dimensions, wrapping/truncation policy, and collapse threshold remain undecided.

The task-list pane is toggled with `Shift+[`, without restarting the selected agent. Start applies to the selected mode only and requires an explicit action; each action makes one attempt, with visible failure and no automatic retry. Close and reopen follow [SESSION-018](../specs/sessions.md#session-018-close-the-app-with-or-without-stopping-sessions). The close confirmation is a focused modal stating that sessions are working and offering “Force close” and “Close without stopping sessions”; keep input within the modal under the shared dialog rules.

## Open Questions

Exact empty/loading/error copy and visual placements, minimum terminal dimensions, wrapping/truncation policy, collapse threshold, and whether to show an additional mode-specific footer cue are unspecified.
