## Definition of Done

- [ ] bunx tsc --noEmit passes when TypeScript touched
- [ ] bun run check . passes when formatting/linting touched
- [ ] bun test (or scoped test) passes

## Implementation Plan

1. Add src/git/main-worktree.ts: findGitWorktreeRoot (nearest .git) + resolveMainWorktreeRoot (cheap .git-file gate, git worktree list --porcelain -z, first/main entry). 2. findBacklogRoot prefers the main worktree's mapped project with current-PWD fallback; raw runtime cwd unchanged. 3. MCP client roots routed through findBacklogRoot before activation. 4. Tests: find-backlog-root, main-worktree, runtime-cwd, mcp-workspace-root.

## Implementation Notes

Implemented worktree-agnostic project-root discovery. Files: new src/git/main-worktree.ts; changed src/utils/find-backlog-root.ts, src/mcp/root-activation.ts, and 4 test files.

Verification (rebuilt dist/backlog): bun run build ok; find src -name '*.ts' -newer dist/backlog empty; bunx tsc --noEmit clean; bun run check . clean; scoped tests 50/50 passed; manual 'from worktree' run resolves BACK-18 and main-only tasks from /Users/imribarr/Projects/Backlog.md.

Auto-commit was NOT touched here; it is removed in the split task BACK-19 (branch backlog/task/BACK-19). Changes are uncommitted on branch backlog/task/BACK-18.

Committed 732bcb31, merged to main as merge commit 7ac13d9f (main now 8ec99550). Main dist/backlog rebuilt.