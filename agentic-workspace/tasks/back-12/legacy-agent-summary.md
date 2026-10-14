## Acceptance Criteria

- [x] The test passes deterministically (no flake) or is explicitly repaired/quarantined with a tracked reason.
- [x] A full suite run reports no unexpected failures (only intentionally skipped tests).

## Definition of Done

- [x] bunx tsc --noEmit passes when TypeScript touched
- [x] bun run check . passes when formatting/linting touched
- [x] bun test (or scoped test) passes

## Implementation Plan

Done: hermetic TMUX handling + verification. Out of scope (not changed): tui-vim-boundary-navigation.test.ts also constructs titled screens without clearing TMUX, but it passes; noted for a future hardening pass.

## Implementation Notes

Verified after rebuild (bun run build; find src -name '*.ts' -newer dist/agentic-workspace printed nothing):
- bun test src/test/tui-window-title.test.ts (ambient TMUX set): 10 pass / 0 fail.
- env -u TMUX bun test src/test/tui-window-title.test.ts: 10 pass / 0 fail.
- bun run test (default 5 lanes): 262/262 files, but src/test/cli-list-window.test.ts and src/test/cli-draft-edit.test.ts hit the 10s per-test cap under lane contention (both pass in isolation via scripts/run-ci-tests.ts on the single file).
- AGENTIC_WORKSPACE_TEST_LANES=2 bun run test: exit 0, 262/262 files, 2378 passed, no failures.
- bunx tsc --noEmit: pass. bun run check .: pass (biome, 578 files).

## Final Summary

Made src/test/tui-window-title.test.ts hermetic to the ambient TMUX env (save/delete in beforeAll, restore in afterAll), matching the tui-task-composer/agent-sessions convention. Verified after rebuild: scoped suite 10/10 with TMUX set and unset; tsc and biome check pass; full suite 262/262 files / 2378 tests green (AGENTIC_WORKSPACE_TEST_LANES=2; default 5-lane runs hit pre-existing per-test timeouts on two unrelated CLI files under contention, both pass in isolation). Committed as 92021e44 on main; src/ui/tui.ts unchanged.