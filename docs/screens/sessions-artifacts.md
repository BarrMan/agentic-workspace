# Sessions and task artifacts

Purpose: choose a retained session or work with generic files stored in a task's `artifacts/` directory. Product rules: [SPEC](../SPEC.md). Shared rules: [design system](../DESIGN-SYSTEM.md).

## Session picker

Show retained sessions for the selected task and mode, with enough identity to choose the intended conversation. Selecting a running session attaches without sending input; resuming an ended session continues the same conversation and does not silently create a replacement. Loading, unavailable, and resume failure states need visible feedback; exact copy and row composition are unspecified.

## Artifact files

List generic files in the selected task's `artifacts/` directory. File viewing may show text/Markdown or binary metadata; reading and writing operate on the selected file. There are no required names, mode-specific artifact expectations, or file-level approval indicators. Approval belongs to a task and mode, is set through the agent-capable CLI, and further session activity in that mode clears it; this page does not define a separate approval screen.

## Focus and constrained terminals

Keep the selected task/mode context visible while browsing. Keyboard behavior follows configured bindings and SPEC.

## Open Questions

Exact row composition, long filename/content handling, narrow-terminal truncation, wrapping, paging, and empty/loading/error presentation are unspecified.
