# AgenticWorkspace

A terminal workspace for managing project tasks and agent sessions, with configurable modes, a grouped task view, and a Kanban board.

[GitHub](https://github.com/BarrMan/agentic-workspace) · [MIT](LICENSE)

![AgenticWorkspace board demo](./.github/agentic-workspace-demo.gif)

## What it is

AgenticWorkspace is TUI-first: people organize work and configure the workspace in the terminal interface. Its CLI serves agents running inside sessions and external applications that need task and session operations.

Tasks belong to a project directory. Git worktrees provide optional execution isolation; task management also applies to directories without Git. Modes describe configurable ways of working rather than a fixed plan/build workflow.

The [product purpose and scope](docs/PRODUCT.md) explain what AgenticWorkspace is for. The [product specification](docs/SPEC.md) defines approved behavior; this README is an introduction, not a second specification.

## Installation

Requires [Bun](https://bun.sh) 1.4 or newer. Build from source:

```bash
git clone https://github.com/BarrMan/agentic-workspace
cd agentic-workspace
bun install
bun run build
```

Put `dist/agentic-workspace` on your `PATH`.

With Nix:

```bash
nix run github:BarrMan/agentic-workspace
```

## Opening the workspace

From a configured project directory:

```bash
agentic-workspace workspace
```

Use the workspace's settings and help surfaces for configuration and available keybindings. The workspace and board are alternate views of the same project's work.

**Implementation alignment:** the approved product contract and the current binary are not yet fully aligned. Existing builds can expose old setup commands, behavior, or settings limitations. [The alignment plan](docs/alignment-plan.md) records those differences, including setup work; this README does not claim that fresh-project onboarding is already complete. Check installed `--help` when diagnosing current availability, while using SPEC to determine intended behavior.

## Agent and application integration

The public CLI is an integration API, not a command for every setting. Task creation and inspection are examples of external integration:

```bash
agentic-workspace task create "Add project search"
agentic-workspace task list
agentic-workspace task view "$TASK_ID"
```

Use the returned task ID. Consult the [supported product contracts](docs/SPEC.md) for intended behavior and `agentic-workspace <command> --help` for the syntax exposed by the installed binary. Availability in an older build does not establish that an operation belongs in the approved API.

Configuration and data remain ordinary editable files. API operations provide a convenient integration contract; they are not an exclusive access mechanism. Optional integrations still awaiting a product decision are identified in the alignment plan rather than promised here.

## Documentation

Start with the [documentation map](docs/README.md). Each concern has one authoritative home:

| Document | Purpose |
|---|---|
| [PRODUCT](docs/PRODUCT.md) | Product purpose, goals and scope. |
| [SPEC](docs/SPEC.md) | Features and behavior, including failure and recovery scenarios. |
| [BLUEPRINT](docs/BLUEPRINT.md) | Logical architecture, ownership, interfaces and operation contracts. |
| [Screen specifications](docs/screens/README.md) | What each screen contains and how its states and interactions behave. |
| [DESIGN-SYSTEM](docs/DESIGN-SYSTEM.md) | Shared visual rules and reusable interaction patterns. |
| [CONVENTIONS](docs/CONVENTIONS.md) | Coding, testing and organization practices. |
| [ADRs](docs/adr/README.md) | Accepted technology and significant architecture decisions, with rationale and supersession history. |
| [Alignment plan](docs/alignment-plan.md) | Implementation gaps, removals, open decisions and verification work. |
| [AGENTS.md](AGENTS.md) | Agent reading and execution instructions. |

## Development

Read [AGENTS.md](AGENTS.md) and [CONVENTIONS](docs/CONVENTIONS.md) before making changes. Compare changes with the relevant product, architecture and screen contracts. Tests and source behavior provide evidence; an accidental implementation change does not redefine the product.

Rebuild before trying source changes through the installed binary. The repository's build and targeted-test procedures are in AGENTS.md.

## Troubleshooting

- Check `agentic-workspace --help` for the installed binary's current commands.
- Check the configured project data path and any `AGENTIC_WORKSPACE_CWD` override if records appear to be missing.
- When source tests and the installed command disagree, verify that the binary was rebuilt.
- Record contract discrepancies in the alignment plan rather than silently changing requirements to match the implementation.

## Talks & community

- **Devoxx Belgium 2025:** [The spec-driven agent workflow behind AgenticWorkspace](https://www.youtube.com/watch?v=LSoDQU_9MMA)
- **AI Engineer Code Summit 2025:** [AgenticWorkspace: task management for AI agents](https://www.youtube.com/watch?v=zMXKhhwiCIc)

## License

AgenticWorkspace is released under the **MIT License**. See [LICENSE](LICENSE).
