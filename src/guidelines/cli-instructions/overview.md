## AgenticWorkspace Overview (CLI)

AgenticWorkspace tracks committed work: what will be built, fixed, or changed.

### When to Use AgenticWorkspace

Use the CLI when the user requests task operations or this session is explicitly assigned to an AgenticWorkspace task. Other work does not require task creation or loading these instructions.

Create tasks with `agentic-workspace task create` and update them with `agentic-workspace task edit <id>`. Consult command help for the fields and options you need.

In a task-bound agent session, read the assigned task first. Keep the description a short, user-friendly, up-to-date overview of what the task is about. Keep detailed working state in the canonical durable working-state artifacts, including requirements, findings, decisions, progress, verification, and blockers, so a fresh session can continue from the task without a separate handover document. Continue in the same mode as the previous ask when handing off within an ongoing conversation. Do not impose mandatory plan approval or other workflow gates.

### Find and Read Work

- `agentic-workspace search "query" --plain`
- `agentic-workspace task list --status "<todo status>" --plain`
- `agentic-workspace task list --status "<active status>" --plain`
- `agentic-workspace task list --search "login" --labels frontend,bug --limit 20 --plain`
- `agentic-workspace task view {{TASK_ID:123}} --plain`

For long lists, use `--max-count` and `--skip`, follow the printed `Next` command, or use `--count` for the total; command help covers the details.

For scripts, `task list`, `task view`, `task <id>`, and `search` accept versioned `--json` output instead of `--plain`. `task list --json --watch` emits complete replacement responses; read successive JSON values, not individual lines. Filters and local scope are unchanged; intermediate edits may be coalesced. Restart for a fresh snapshot.

### Structured Markdown Records

All application-owned structured fields live in versioned YAML frontmatter, not Markdown body sections: tasks and drafts use `task_schema_version: 2`, decisions use `decision_schema_version: 1`, and milestones use `milestone_schema_version: 1`. Bodies are opaque free-form Markdown.

```yaml
---
task_schema_version: 2
id: TASK-1
title: Example task
description: |
  Short, user-friendly overview of the task.
---

# Scratchpad
- [ ] This is body content.
```

### Shell quoting

Pass multi-line task descriptions and durable working-state values the way your shell preserves them literally; the CLI does not convert `\n` sequences written inside normal quotes. Prefer real line breaks inside a quoted argument. Agent sandboxes that screen commands through a tree-sitter AST walker reject ANSI-C strings, command substitutions, and heredoc forms (issue [#595](https://github.com/BarrMan/agentic-workspace/issues/595)), so avoid those forms under Claude Code, Codex, or similar harnesses.

When a value must contain Markdown code spans, quote it so the shell passes the backticks literally. Unescaped backticks in double-quoted or unquoted arguments are command substitution in many shells, and AgenticWorkspace cannot recover the original text after the shell has already executed it. Prefer single-quoted arguments:

```bash
agentic-workspace task create 'Document `agentic-workspace init` setup' \
  --description 'Requirements mention `agentic-workspace init --defaults` literally'
```

If single quotes are not practical in your shell, escape each literal backtick before running the command.

### Optional Guides

Load a guide only when its detail is useful for the requested operation:

- `agentic-workspace instructions task-creation` — creating or splitting tasks
- `agentic-workspace instructions task-execution` — updating and executing assigned work
- `agentic-workspace instructions task-finalization` — verifying and finishing tasks

Use `agentic-workspace <command> --help` before unfamiliar operations. Help describes fields, output, and examples.

### Task Lifecycle

Mark finished work Done (or the configured final status). During periodic cleanup, use Complete (`agentic-workspace task complete {{TASK_ID:123}}`) to move it off the board while preserving its record and dependency links.

Use Archive (`agentic-workspace task archive {{TASK_ID:123}}`) for canceled, duplicate, or invalid work. Archiving removes incoming dependencies and task references.

Use the CLI for AgenticWorkspace changes. Never edit task, draft, document, decision, or milestone markdown files directly; commands preserve metadata, relationships, and history.
