## Definition of Done

- [x] bunx tsc --noEmit passes when TypeScript touched
- [x] bun run check . passes when formatting/linting touched
- [x] bun test (or scoped test) passes

## Implementation Notes

Implemented: workspace task list rows now render the task title only, dropping the '{TaskID} - ' prefix (src/ui/opentui/workspace.ts:443). The task ID stays visible in the details pane header, so identity is not lost. Updated src/test/opentui-workspace-layout.test.ts row-locating helpers/assertions to key off titles instead of IDs.

Verification: rebuilt binary with 'bun run build' (find src -name '*.ts' -newer dist/agentic-workspace printed nothing). bun test src/test/opentui-workspace-layout.test.ts -> 20 pass/0 fail. Related opentui suites (controller, surfaces, filters, agent, confirm, host-cleanup, session-picker, agent-settings) -> 81 pass/0 fail. bunx tsc --noEmit exit 0. bun run check . -> No fixes applied.

Not touched: details pane header and board view still show the task ID.

## Final Summary

Workspace task-list rows render the task title only; the '{TaskID} - ' prefix was removed from src/ui/opentui/workspace.ts. The ID remains in the details pane header. Layout tests locate rows by title. Verified: rebuilt binary; bun test src/test/opentui-workspace-layout.test.ts (20 pass); related OpenTUI suites (81 pass); bunx tsc --noEmit (exit 0); bun run check . (clean). Note: the source change was committed as part of 42ed911c (BACK-3) by a concurrent agent that committed the shared working tree.