## Definition of Done

- [x] bunx tsc --noEmit passes when TypeScript touched
- [x] bun run check . passes when formatting/linting touched
- [x] bun test (or scoped test) passes

## Implementation Notes

Root cause: not a Backlog bug. OpenCode 1.18.35 eagerly enumerates every discovered skill (name + description + location) in the system prompt and every non-primary agent (name + description) in the task-tool description. Bodies are already lazy-loaded; only metadata was inflating context. The blow-up came from 202 agent files + 194 skill dirs (plus 105 commands) symlinked into the global OpenCode config by wshobson-agents-omp — only 1 of 202 agents and ~16 skills had ever been used.

Fix (OpenCode-side; no Backlog source touched): ran the project's official uninstaller:
  python3 /Users/imribarr/Projects/wshobson-agents-omp/tools/install_opencode.py uninstall --config-dir "$HOME/.opencode-personal/config/opencode"
Removed 491 repo-owned symlinks (202 agents, 105 commands, 184 skills); kept
10 external ~/.claude skill links and all hand-written config (opencode.jsonc,
AGENTS.md, agent-config.json, plugin/model-router.ts). Resolved config shrank
3,080,330 B -> 4,721 B; agent entries 206 -> 4.

Verification: fresh `opencode run --agent build --model
deepseek/deepseek-flash` first assistant message tokens.total = 17,304
(previous ~51k; target <= 20k). Session id ses_ee66725c6ffelOuPmTMv51iK9q.

## Final Summary

Baseline cut from ~51k to 17,304 tokens by uninstalling the
wshobson-agents-omp OpenCode artifacts (491 symlinks). OpenCode config change
only; no Backlog code touched.