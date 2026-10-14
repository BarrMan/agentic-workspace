## Definition of Done

- [ ] bunx tsc --noEmit passes when TypeScript touched
- [ ] bun run check . passes when formatting/linting touched
- [ ] bun test (or scoped test) passes

## Implementation Notes

Implemented on branch agentic-workspace/task/BACK-19 in its own worktree. autoCommit config key, shouldAutoCommit, all autoCommit params, commit-execution logic, selected-commit machinery, CLI/wizard surface, docs, and feature-only tests removed. Legacy config.yml auto_commit entries are ignored without error. Verification: bunx tsc --noEmit clean; bun run check . clean; rg autoCommit/auto_commit/auto-commit/shouldAutoCommit over src = zero matches; full suite 2306 passed with 9 pre-existing timeouts in cli-list-window/cli-draft-edit (reproduced on untouched HEAD). Uncommitted on branch agentic-workspace/task/BACK-19.

Committed 0ebbcc75, merged to main as merge commit 8ec99550. Main dist/agentic-workspace rebuilt.