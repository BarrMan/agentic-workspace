# AgenticWorkspace

Markdown-native task management and a terminal Kanban board for Git repositories and local projects.

[GitHub](https://github.com/BarrMan/agentic-workspace) · [MIT](LICENSE)

![AgenticWorkspace board demo](./.github/agentic-workspace-demo.gif)

## Why AgenticWorkspace

Review the work before implementation: capture an idea as small tasks, organize work with milestones and dependencies, and keep task context in the repository. The task ledger remains readable alongside the code and can be used with or without AI agents.

## Features

- Markdown task records and durable task artifacts.
- Tasks, drafts, documents, decisions, and milestones managed from the CLI.
- Terminal Kanban board and Markdown board export.
- Shared search across tasks, documents, and decisions.
- CLI workflow instructions for AI agents; optional MCP server integration.
- Local project files; Git integration can be disabled at initialization.

## Installation

Requires [Bun](https://bun.sh) 1.4 or newer. Build from source:

```bash
git clone https://github.com/BarrMan/agentic-workspace
cd agentic-workspace
bun install
bun run build
```

Then put `dist/agentic-workspace` on your `PATH`.

With Nix:

```bash
nix run github:BarrMan/agentic-workspace
```

## Quick start

```bash
agentic-workspace init "My Project"
agentic-workspace task create "Add project search"
agentic-workspace task list
agentic-workspace board
```

To initialize without Git integration, run `agentic-workspace init "Personal Planning" --no-git`.

## Core concepts

### Tasks

Tasks are Markdown records with structured metadata. Task ID prefixes are configurable; the default prefix is `task`, so IDs use that prefix rather than this repository's `BACK-1` examples. Use `agentic-workspace task` to create, list, edit, view, complete, archive, or demote tasks. Task artifacts hold durable files associated with a task.

Completing a task moves finished work to completed storage during cleanup while preserving its task and dependency history. Archiving canceled, duplicate, or invalid work is different: it removes incoming dependencies and task references.

### Drafts

Drafts are work not yet promoted to tasks. The `draft` commands list, create, edit, view, archive, and promote drafts.

### Milestones

Milestones group and track task progress. The `milestone` commands list, add, rename, remove, and archive milestones.

### Documents

Use `doc` to create, update, list, search, and view project documents.

### Decisions

Use `decision` to create and list project decisions. Search can include decisions alongside tasks and documents.

Records use versioned YAML metadata. The CLI help does not specify the current task or draft schema version; the README therefore does not prescribe a schema number. Keep task bodies as Markdown content and use the CLI for task operations.

## Using the CLI

`agentic-workspace --help` lists all commands. Common operations include:

```bash
agentic-workspace task create "Add project search"
agentic-workspace task list
agentic-workspace task view "$TASK_ID"
agentic-workspace draft list
agentic-workspace milestone list
agentic-workspace doc list
agentic-workspace decision list
agentic-workspace search "authentication" --plain
agentic-workspace board
agentic-workspace board export
```

The task ID shown in an example is illustrative; use the ID returned by your own command. `search` can filter by result type, task type, status, priority, project, or modified file and supports `--json`. `completion install` installs shell completion scripts. `cleanup` interactively moves eligible completed tasks to the completed folder. `skill` prints the session-local task-management skill, and `instructions` prints workflow guidance.

The `agents` command can update the short AgenticWorkspace CLI nudge in selected agent instruction files. `config` manages project configuration; `config get`, `config set`, and `config list` inspect or update values.

## Working with AI agents

CLI instructions are the recommended AI integration. After initialization, use:

```bash
agentic-workspace instructions overview
```

The available guides cover task creation, execution, finalization, initialization-required guidance, and the agent workspace. Provide an agent with one task at a time, review its task plan and artifacts, then review the implementation and verification. Prefer CLI operations to hand-editing structured task metadata.

## OpenTUI workspace and agent sessions

`agentic-workspace workspace` opens the OpenTUI task-centered agent workspace. `agentic-workspace agent-session` manages task sessions: start, list, attach, stop, inspect saved output, hand off, ask a previous session a question, reconcile, reset, or delete session state.

Use `agentic-workspace agent-config` to inspect and selectively edit scoped agent configuration, initialize a scope, select or update a preset, and configure a project's mode model. See the command help for available options and scopes.

## MCP integration

MCP is optional; use CLI instructions by default. To run the MCP server over stdio, configure an MCP client to start:

```bash
agentic-workspace mcp start
```

AgenticWorkspace uses the `AGENTIC_WORKSPACE_` environment-variable prefix, `agentic-workspace://` MCP resource URIs, and `agentic-workspace/` task and `.agentic-workspace/` runtime directories.

## Configuration

`agentic-workspace config` manages project settings. Initialization accepts a project-relative `--agentic-workspace-dir`, a `--task-prefix` (letters only; default `task`), and `--integration-mode` (`cli`, `mcp`, or `none`). See `agentic-workspace init --help`, `agentic-workspace config --help`, and [Advanced configuration](ADVANCED-CONFIG.md) for details.

## Guides & reference

- [CLI instructions and reference](CLI-INSTRUCTIONS.md)
- [Advanced configuration](ADVANCED-CONFIG.md)
- [Development guide](DEVELOPMENT.md)
- [Project documentation](docs/)

For record-format and migration details, use the development guide and relevant documentation rather than relying on implementation details here.

## Troubleshooting

- Run `agentic-workspace --help` or `agentic-workspace <command> --help` to check the commands and options available in your installed version.
- If project files are not where expected, check the selected `--agentic-workspace-dir` and any `AGENTIC_WORKSPACE_CWD` setting.
- For task IDs, use the ID returned by the CLI; the prefix can be configured during initialization.

## Talks & community

- **Devoxx Belgium 2025:** [The spec-driven agent workflow behind AgenticWorkspace](https://www.youtube.com/watch?v=LSoDQU_9MMA)
- **AI Engineer Code Summit 2025:** [AgenticWorkspace: task management for AI agents](https://www.youtube.com/watch?v=zMXKhhwiCIc)

## License

AgenticWorkspace is released under the **MIT License**. See [LICENSE](LICENSE).
