# Board

Purpose: move among tasks arranged in status columns. Both the board and workspace remain available. Product behavior: [SPEC](../SPEC.md). Shared rules: [design system](../DESIGN-SYSTEM.md).

## Ordered contents

Render configured status columns with their tasks, preserving task identity and status. Keep the board as a route in the same workspace host. Provide task actions and movement preview/commit affordances. `g`/`G` jump to the first/last task within the selected status pane; `Home`/`End` remain available.

## States and focus

An empty status column remains identifiable and safe to navigate. Loading and operation failures should be visible without losing the pending move or task context; exact copy and placement are unspecified. Keyboard focus and move preview/cancel/commit follow SPEC and configured bindings.

At constrained terminal sizes, preserve access to columns and the selected task. The workspace boundary-navigation behavior is shared; no additional board-specific key signatures are established here.

## Open Questions

Exact column widths, card/row composition, selection decoration, scrolling, clipping, and minimum dimensions are unspecified; exact copy and placement for loading and operation failures are also unspecified.
