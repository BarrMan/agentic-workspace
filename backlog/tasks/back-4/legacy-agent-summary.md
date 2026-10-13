## Acceptance Criteria

- [x] Running 'backlog --version' from any directory prints the repo build version (currently 1.53.0).
- [x] The global 'backlog' command resolves to /Users/imribarr/Projects/Backlog.md/dist/backlog.
- [x] Rebuilding with 'bun run build' leaves the global symlink valid (path-based, survives overwrite).

## Definition of Done

- [ ] bunx tsc --noEmit passes when TypeScript touched
- [ ] bun run check . passes when formatting/linting touched
- [ ] bun test (or scoped test) passes

## Implementation Notes

During development, 'backlog' is provided by a symlink from a writable PATH directory to the compiled build output dist/backlog. The symlink points at the path, not the inode, so 'bun run build' overwriting dist/backlog keeps it valid. Recreate with: ln -sf "$PWD/dist/backlog" /opt/homebrew/bin/backlog. Overridable for other dirs via ln -sf.

## Comments

opencode: Symlink restored: /opt/homebrew/bin/backlog -> /Users/imribarr/Projects/Backlog.md/dist/backlog. Verified 'backlog --version' from /tmp returns 1.53.0, and the symlink remains valid after 'bun run build'.