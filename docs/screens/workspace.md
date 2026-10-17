# Workspace

Purpose: navigate the project's grouped tasks and inspect or use the selected task's session. Product rules: [SPEC](../SPEC.md). Shared visual rules: [design system](../DESIGN-SYSTEM.md).

## Ordered regions

1. Workspace header: workspace identity and active filter state/control.
2. Task region: nested task groups and tasks. In normal layout, target roughly 30% of workspace width, subject to a maximum of 35 terminal display cells and shrinking below that cap when space is constrained. Status tabs sit inside Tasks: active tab is a three-row cap with reversed bottom seams opening to the task viewport; inactive labels share its baseline at natural label width plus one space on each side. No per-tab count, fixed cell, underline, or separator; Tasks title carries the count. To Do is blue, In Progress yellow, Done bright green, custom statuses neutral. Selection is bold with raised chrome, not a text-background highlight. Labels use `#1f1f1f` and borders `#555555`.
3. Selected-task region: details and selected-mode session presentation. Details use roughly 30% of right-region height above live preview. `Space` shows/hides details in normal flow; the same retained terminal gains the released rows. The details border has a right-aligned collapse hint. When a session is active, its session header shows, in order, agent, runtime status, selected mode, and actual working-directory path on one line. Hide it when that mode has no active session; do not substitute an assumed path.
4. Footer: follows the [essential-actions requirement, IF-WB-008](../specs/workspace-and-board.md#if-wb-008-complete-action-listings), and shows concise operation status/error.

The task-list width and details/preview proportions above are approved qualitative layout rules. No minimum terminal dimensions are established.

## States

- Empty project and no matching filter results must be distinguishable.
- Task loading/refresh failure, save failure, and externally removed selection need visible feedback.
- Session absent for selected mode: explain there is no session in that mode; offer the normal start action.
- Starting: unavailable until usable; do not present as running.
- Running: show live terminal; selecting it attaches without sending input or changing control.
- Ended: prompt to resume and identify the session-picker shortcut.
- Unknown/unavailable liveness: do not infer running or ended from stored labels.
- Permission request and activity error must remain distinguishable.
- Active-session dots appear on selected and unselected task rows; no active session means no dot. The selected row uses dark text on light slate, with a darker status-color variant for contrast. Selection remains visible when focus moves elsewhere.
- Navigation preserves the viewport while selection remains visible, scrolling only enough when it crosses an edge. Refreshing selection preserves the viewport; status, filter, and view changes reset it.
- `g`/`G` select the first/last filtered task within the active status tab; `Home`/`End` remain available. Empty panes are safe; editable fields and focused agent terminals keep their input.

## Focus and constrained terminals

Keyboard/focus behavior follows SPEC and the active shortcut configuration. `Tab` changes the selected mode for the selected task; session execution remains unchanged. `f` shows the same retained terminal fullscreen with a bottom row reserved for the visible `Ctrl+Q` exit hint; `Ctrl+Q` and `Ctrl+C` return to navigation without forwarding an interrupt. Navigation `Ctrl+C` exits; `q` never exits. At narrow sizes, shrink the task region below its 35-cell cap and preserve selected-task identity and essential footer actions. Exact minimum dimensions, wrapping/truncation policy, and collapse threshold remain undecided.

The task-list pane is toggled with `Shift+[`, without restarting the selected agent. Start applies to the selected mode only.

## Open Questions

Exact empty/loading/error copy and visual placements, minimum terminal dimensions, wrapping/truncation policy, collapse threshold, and whether to show an additional mode-specific footer cue are unspecified.
