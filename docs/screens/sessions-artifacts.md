# Sessions and task artifacts

Purpose: choose a retained session or work with generic files stored in a task's `artifacts/` directory. Product rules: [SPEC](../SPEC.md). Shared rules: [design system](../DESIGN-SYSTEM.md).

## Session picker

Show retained sessions for the selected task and mode, with enough identity to choose the intended conversation. Attach and resume behavior follows [IF-SI-001 and IF-SI-002](../specs/session-interaction-and-feedback.md#functional-requirements). Loading, unavailable, and resume failure states need visible feedback; exact copy and row composition are unspecified.

## Artifact files

List generic files in the selected task's `artifacts/` directory. File viewing may show text/Markdown or binary metadata; reading and writing operate on the selected file. There are no required names, mode-specific artifact expectations, or file-level approval indicators. Approval behavior follows the [configuration contract](../specs/configuration.md#functional-requirements); this page does not define a separate approval screen.

## Focus and constrained terminals

Keep the selected task/mode context visible while browsing. Keyboard behavior follows configured bindings and SPEC.

## Open Questions

Exact row composition, long filename/content handling, narrow-terminal truncation, wrapping, paging, and empty/loading/error presentation are unspecified.
