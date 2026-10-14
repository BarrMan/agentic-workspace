## Acceptance Criteria

- [x] Running 'agentic-workspace --version' from any directory prints the repo build version (currently 1.53.0).
- [x] The global 'agentic-workspace' command resolves to /Users/imribarr/Projects/agentic-workspace/dist/agentic-workspace.
- [x] Rebuilding with 'bun run build' leaves the global symlink valid (path-based, survives overwrite).

## Definition of Done

- [ ] bunx tsc --noEmit passes when TypeScript touched
- [ ] bun run check . passes when formatting/linting touched
- [ ] bun test (or scoped test) passes

## Implementation Notes

During development, 'agentic-workspace' is provided by a symlink from a writable PATH directory to the compiled build output dist/agentic-workspace. The symlink points at the path, not the inode, so 'bun run build' overwriting dist/agentic-workspace keeps it valid. Recreate with: ln -sf "$PWD/dist/agentic-workspace" /opt/homebrew/bin/agentic-workspace. Overridable for other dirs via ln -sf.

## Comments

opencode: Symlink restored: /opt/homebrew/bin/agentic-workspace -> /Users/imribarr/Projects/agentic-workspace/dist/agentic-workspace. Verified 'agentic-workspace --version' from /tmp returns 1.53.0, and the symlink remains valid after 'bun run build'.