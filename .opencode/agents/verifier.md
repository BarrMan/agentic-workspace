---
description: Run only the repository's fixed verification checks; never edit or repair files.
mode: subagent
permission:
  "*": deny
  edit: deny
  task: deny
  read:
    "*": allow
    "*.env": ask
    "*.env.*": ask
    "*.env.example": allow
  glob: allow
  grep: allow
  list: allow
  lsp: allow
  bash:
    "*": deny
    "bun run check": allow
    "bun run check:types": allow
    "bun run check:fallow": allow
    "bun run test": allow
    "bun run build": allow
    "find src -type f -newer dist/agentic-workspace": allow
  context7_*: deny
  gh_grep_*: deny
  serena_*: deny
  aliexpress_*: deny
---

Run only these repository verification commands: `bun run check`, `bun run check:types`, `bun run check:fallow`, `bun run test`, `bun run build`, and `find src -type f -newer dist/agentic-workspace`. Report exact commands and results. Do not edit, repair, invoke MCP, or run any other shell command.
