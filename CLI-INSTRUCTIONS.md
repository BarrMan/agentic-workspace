# CLI Reference

Full command reference for AgenticWorkspace. For getting started, see [README.md](README.md).

All examples use the `agentic-workspace` command, available after installing the `agentic-workspace` package globally (`npm i -g agentic-workspace`) or as a project dependency. For one-off runs without installing, use `npx agentic-workspace <command>`, e.g. `npx agentic-workspace board`.

## Project Setup

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Initialize project | `agentic-workspace init [project-name]` (creates backlog structure with a minimal interactive flow) |
| Re-initialize | `agentic-workspace init` (preserves existing config, allows updates) |
| Advanced settings wizard | `agentic-workspace config` (no args) — launches the full interactive configuration flow |

`agentic-workspace init` keeps first-run setup focused on the essentials:
- **Project name** – identifier for your backlog (defaults to the current directory on re-run).
- **AgenticWorkspace folder** – choose `agentic-workspace/`, `.agentic-workspace/`, or a custom project-relative path.
- **Config location** – for built-in folders, choose folder-local `config.yml` or root `agentic-workspace.config.yml`; custom paths use root `agentic-workspace.config.yml`.
- **Integration choice** – decide whether your AI tools use **CLI instructions** (recommended), the optional **MCP connector**, or no AI setup.
- **Instruction files (CLI path)** – the CLI setup writes a short nudge to AGENTS.md by default in non-interactive setup. `--agent-instructions cursor` also selects AGENTS.md, and the interactive CLI and Web setup identify Cursor under that shared target. Existing user-managed `.cursor/rules` files may coexist; AgenticWorkspace does not migrate or remove them, and repeated initialization preserves non-AgenticWorkspace content in AGENTS.md.
- **Advanced settings prompt** – default answer "No" finishes init immediately; choosing "Yes" jumps straight into the advanced wizard documented in [ADVANCED-CONFIG.md](ADVANCED-CONFIG.md).

You can rerun the wizard anytime with `agentic-workspace config`. All existing CLI flags (for example `--defaults`, `--agent-instructions`) continue to provide fully non-interactive setups, and init also supports `--agentic-workspace-dir <path>` plus `--config-location <folder|root>` for scripted configuration.

Humans and agents can run `agentic-workspace instructions` for workflow guides and `agentic-workspace instructions overview` for the overview.

## Documentation

- Document IDs are global across all subdirectories under `agentic-workspace/docs`. You can organize files in nested folders (e.g., `agentic-workspace/docs/guides/`), and `agentic-workspace doc list` and `agentic-workspace doc view <id>` work across the entire tree.
- Use `agentic-workspace doc create "New Guide" -p guides` to create a document in a docs subdirectory. The created output includes the persisted docs-relative file path, such as `agentic-workspace/docs/guides/doc-1 - New-Guide.md`.
- Use `agentic-workspace doc update doc-1 --content "Updated markdown"` to update document content. Add `--title`, `-t/--type`, `--tags`, or `-p/--path` to update metadata or move the document while preserving omitted fields.
- Use `agentic-workspace doc search "query"` for scoped document search with plain text output that includes document IDs and follow-up `agentic-workspace doc view <docId>` commands. Use `--limit <number>` to cap results.
- Document paths are always relative to the docs directory. Absolute paths and traversal segments such as `..` are rejected.

## Task Management

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Create task | `agentic-workspace task create "Add OAuth System"`                    |
| Create with description | `agentic-workspace task create "Feature" -d "Add authentication system"` |
| Create with assignee | `agentic-workspace task create "Feature" -a @sara`           |
| Create with status | `agentic-workspace task create "Feature" -s "In Progress"`    |
| Create with labels | `agentic-workspace task create "Feature" -l auth,backend`     |
| Create with priority | `agentic-workspace task create "Feature" --priority high`     |
| Create with due date | `agentic-workspace task create "Feature" --due-date 2026-08-10` |
| Create with deps | `agentic-workspace task create "Feature" --dep task-1,task-2` |
| Create with refs | `agentic-workspace task create "Feature" --ref https://docs.example.com --ref src/api.ts` |
| Create with docs | `agentic-workspace task create "Feature" --doc https://design-docs.example.com --doc docs/spec.md` |
| Create sub task | `agentic-workspace task create -p 14 "Add Login with Google"`|
| Create (all options) | `agentic-workspace task create "Feature" -d "Description" -a @sara -s "To Do" -l auth --priority high --dep task-1 --ref src/api.ts --doc docs/spec.md -p 14` |
| List tasks  | `agentic-workspace task list [-s <status>] [-a <assignee>] [-p <parent>] [--labels <labels>] [--search <query>] [--limit <n>]` |
| List filtered | `agentic-workspace task list --labels frontend,bug --search "login" --limit 10 --plain` |
| List in windows | `agentic-workspace task list --max-count 20 --skip 20 --plain` |
| Count tasks | `agentic-workspace task list --status "To Do" --count` |
| List as JSON | `agentic-workspace task list --status "To Do" --json` |
| Watch as JSON | `agentic-workspace task list --json --watch` |
| List by parent | `agentic-workspace task list --parent 42` or `agentic-workspace task list -p task-42` |
| View detail | `agentic-workspace task 7` (plain task detail)               |
| View (AI mode) | `agentic-workspace task 7 --plain`                           |
| View as JSON | `agentic-workspace task 7 --json` |
| Edit        | `agentic-workspace task edit 7 -a @sara -l auth,backend`       |
| Add deps    | `agentic-workspace task edit 7 --dep task-1 --dep task-2`     |
| Set due date | `agentic-workspace task edit 7 --due-date 2026-08-10` |
| Clear due date | `agentic-workspace task edit 7 --clear-due-date` |
| Complete    | `agentic-workspace task complete 7` (move finished work to completed storage) |
| Archive     | `agentic-workspace task archive 7` (canceled, duplicate, or invalid work) |

Mark finished work Done (or the configured final status). During periodic cleanup, use Complete to move it off the board while preserving its record and dependency links. Archive removes incoming dependencies and task references.

### Paging long lists

`task list`, `search`, `draft list`, `milestone list`, `doc list`, `doc search`, and `decision list` print every match by default. `--max-count <n>` prints at most `n` items and `--skip <n>` leaves out the first `n`, as in `git log`. Both apply after filtering, sorting, and `--limit`, in the order the output prints: `task list` groups by status unless `--sort priority` prints one flat list, plain `search` prints tasks, then documents, then decisions, and `milestone list` prints active milestones before completed ones. Each list has a stable order: `task list` shows the newest task first, and only `--sort priority` (configured priorities first) or `--sort id` and `--sort ordinal` (both oldest first) change that; tasks, drafts, and decisions break ties by ID, documents sort by title and then path, search results by score and then corpus order, and milestones follow their files and then the tasks that name them. So consecutive windows of an unchanged backlog join into the complete output without overlapping or leaving items out. With `--json`, `task list` windows its flat `tasks` array in sort order without status groups and `search` windows its results in relevance order, so read all windows of a list in one output mode. The options print text instead of opening an interactive view.

Output cut by a window ends with the shown range, the total, and the command that prints the following items:

```text
Showing 21-40 of 57 items. Next: agentic-workspace task list --status 'To Do' --max-count 20 --skip 40
```

The last window has no `Next:` part, and a `--skip` past the end prints only `Showing 0 of 57 items.` Output that is not cut has no footer. `--count` prints only the number of items the same command would list, as `grep --count` does; it cannot be combined with `--json`. There are no short forms because `-m` already means `--milestone`. `--limit` keeps its behavior: it silently shortens the list before any window applies.

Task and milestone due dates are calendar days stored as `YYYY-MM-DD`. Use a plain date such as `2026-08-10`; a due date carries no time and no timezone.

### Stable JSON output

Use `--json` when a script or integration needs structured output:

```bash
agentic-workspace task list --status "To Do" --json | jq '.tasks[] | .id'
agentic-workspace task BACK-7 --json
agentic-workspace search "authentication" --json | jq '.results[] | [.type, .data.id]'
```

Use `agentic-workspace task list --json --watch` to receive the full matching list immediately, then a full replacement whenever its JSON result changes. Every response uses exactly the same fields, envelope, indentation, and trailing newline as `task list --json`. Read successive complete JSON values, not individual lines or the whole stream as one document. For example:

```bash
agentic-workspace task list --json --watch | jq --unbuffered -c '.tasks'
```

Each response replaces the subscriber's previous list, including an empty `tasks` array. Filters, sorting, limits, and local editable task scope are unchanged; completed storage, archives, drafts, and other branches are not added to the list. Dependency and configuration changes can update derived fields or which tasks match. Unchanged results are suppressed, and rapid edits or slow consumers may coalesce intermediate states. The command reconciles periodically as well as on file notifications; this is a current-state subscription, not an edit history. Restart it to receive a fresh full list.

`--watch` requires `--json` and cannot be combined with `--plain`. Stop it with Ctrl+C or terminate the process; closing the output pipe also stops it. It also ends when the process that started it ends. A failure after earlier responses writes a diagnostic to stderr and exits nonzero without emitting a replacement for that failed read.

Each successful response is one pretty-printed JSON document followed by a newline. The top-level contract is versioned and identifies the command result:

| Command | Envelope |
|---------|----------|
| `task list --json` | `{ "schemaVersion": 1, "kind": "task-list", "tasks": [...] }` |
| `task view <id> --json` and `task <id> --json` | `{ "schemaVersion": 1, "kind": "task-view", "task": {...} }` |
| `search [query] --json` | `{ "schemaVersion": 1, "kind": "search", "results": [...] }` |

Task list and task search results use these compact fields: `id`, `title`, `status`, `type`, `priority`, `project`, `assignees`, `reporter`, `labels`, `milestone`, `parentTaskId`, `references`, `modifiedFiles`, `ordinal`, `createdAt`, `updatedAt`, `dueDate`, and `isReady`. `project` reports the task's `project:` frontmatter and is `null` when the task has none. Setting or filtering by it requires a `projects:` list in the project config. `isReady` is derived from the whole visible corpus at read time and never stored: it is `true` when the task is unfinished and every dependency it names resolved to a completed task, and `false` for a finished task or one whose dependencies are unfinished, unknown, or ambiguous. It is the same verdict `task list --ready` filters on.

Task view includes the compact fields above and adds `path`, `description`, `dependencies`, `dependencyGraph`, `readiness`, `documentation`, `subtasks`, and `agentSummary`. `path` is relative to the project root.

Task view also carries `dependencyGraph`, a property of the task detail that is derived from the whole visible corpus at read time and never stored in the Markdown file. `task.dependencies` stays the task's own list of direct dependency IDs, unchanged. `task.dependencyGraph` contains `root` (the selected task's ID), `nodes`, and `edges`. Each edge is `{ "from": ..., "to": ... }` and always points from the task that declares the dependency to the task it depends on, so `to` blocks `from`. Each node contains `id`, `title`, `status`, `state`, `completed`, `dependencyDepth`, and `dependentDepth`. The two depths are the shortest hop counts from the root: `0` is the root itself, `1` is a direct relationship, anything higher is transitive, and `null` means the node is not reachable in that direction. Nodes are listed root first and then by task ID, edges by `from` and then `to`. See "Dependency Management" for what the graph covers and how it reports identities it cannot resolve.

`readiness` explains the `isReady` field above it and comes from the same derivation. It contains `isReady`, `isBlocked`, `blockingDependencies` (dependencies that resolved to unfinished tasks), and `missingDependencies` (dependency IDs no single visible task claims). Both lists fail closed: an unknown or ambiguous dependency blocks instead of being treated as satisfied.

Search keeps relevance order and discriminates every result with `type` and `data`. Task data uses the compact task fields. Document data contains `id`, `title`, `type`, `path`, `tags`, `createdAt`, and `updatedAt`. Decision data contains `id`, `title`, `status`, and `date`. Search scores are not part of the version 1 public contract.

When `--max-count` or `--skip` cuts a `task list`, `search`, or `decision list` result, the envelope also contains `total`, the number of items before the window, and `nextSkip`, the `--skip` value for the following items or `null` when none follow. Output that is not cut has neither field.

Absent scalar fields are `null`, and absent collections are `[]`. Date-only values remain `YYYY-MM-DD`; UTC date-times use RFC 3339. Internal fields, absolute paths, raw Markdown source objects, branch metadata, and search implementation details are not exposed.

`--json` and `--plain` are mutually exclusive. Explicit JSON mode is always noninteractive, including in a terminal. Without `--json`, existing interactive, explicit plain, and automatic non-TTY plain behavior is unchanged. One-shot errors leave stdout empty, write a concise message to stderr, and exit nonzero. Version 1 may gain backward-compatible fields, but removing, renaming, retyping, or changing documented field semantics requires a new `schemaVersion`.

### Task artifacts

Use task artifacts for detailed working state and durable context instead of a task summary field. Artifact paths are relative to the task container; use ordinary filenames such as `notes.md`, `spec.md`, or `plan.md` as appropriate.

```bash
agentic-workspace task artifact list BACK-7
agentic-workspace task artifact read BACK-7 plan.md
agentic-workspace task artifact write BACK-7 plan.md --from plan.md
agentic-workspace task artifact status BACK-7 plan.md
```

`write` reads bytes from stdin by default or from `--from <file>`. Approval is user-only and is performed in the TUI; agents can inspect approval status but cannot approve artifacts.

For multi-line task descriptions, pass real newlines inside a quoted argument. The CLI preserves input literally; `\n` is not converted automatically.

### Literal backticks in task text

When task text includes Markdown code spans, quote it so the shell passes the backticks literally. Unescaped backticks in double-quoted or unquoted arguments are command substitution in many shells, and AgenticWorkspace cannot recover the original text after the shell has already executed it.

Use single-quoted CLI arguments for values that contain literal backticks:

```bash
agentic-workspace task create 'Document `agentic-workspace init` setup'
```

If single quotes are not practical in your shell, escape each literal backtick before running the command. Do not rely on AgenticWorkspace to sanitize accidental command output after substitution.

## Milestone Management

Milestones are managed through milestone files. Use CLI commands instead of editing milestone markdown directly so IDs, filenames, task references, and archive state stay consistent.

| Action | Example |
|--------|---------|
| List milestones | `agentic-workspace milestone list --plain` |
| List completed milestones too | `agentic-workspace milestone list --show-completed --plain` |
| Add milestone | `agentic-workspace milestone add "Release 1.0"` |
| Add with description | `agentic-workspace milestone add "Beta" --description "Beta scope"` |
| Add with due date | `agentic-workspace milestone add "Beta" --due-date 2026-08-10` |
| Rename and update tasks | `agentic-workspace milestone rename "Release 1.0" "Release 2.0"` |
| Set due date without renaming | `agentic-workspace milestone rename "Release 1.0" "Release 1.0" --due-date 2026-08-10` |
| Clear due date | `agentic-workspace milestone rename "Release 1.0" "Release 1.0" --clear-due-date` |
| Rename without task updates | `agentic-workspace milestone rename m-1 "Release 2.0" --no-update-tasks` |
| Remove and clear task milestones | `agentic-workspace milestone remove "Release 1.0"` |
| Remove and keep task values | `agentic-workspace milestone remove "Release 1.0" --task-handling keep` |
| Remove and reassign tasks | `agentic-workspace milestone remove "Release 1.0" --task-handling reassign --reassign-to "Release 2.0"` |
| Archive milestone | `agentic-workspace milestone archive m-1` |

`milestone remove` task handling modes are `clear` (default), `keep`, and `reassign`. `--reassign-to` is required when using `--task-handling reassign`, and the target must be an active milestone file.

## Search

Find tasks, documents, and decisions across your entire backlog with fuzzy search:

| Action             | Example                                              |
|--------------------|------------------------------------------------------|
| Search tasks       | `agentic-workspace search "auth"`                        |
| Filter by status   | `agentic-workspace search "api" --status "In Progress"`   |
| Filter by priority | `agentic-workspace search "bug" --priority high`        |
| Combine filters    | `agentic-workspace search "web" --status "To Do" --priority medium` |
| Plain text output  | `agentic-workspace search "feature" --plain` (for scripts/AI) |
| JSON output        | `agentic-workspace search "feature" --json` (for structured integrations) |
| Find by modified file | `agentic-workspace search --modified-file src/path.ts --plain` |
| Page results       | `agentic-workspace search "api" --max-count 20 --skip 20 --plain` |

**Search features:**
- **Fuzzy matching** -- finds "authentication" when searching for "auth"
- **Modified-file lookup** -- tasks can record project-root-relative modified files; find them later with `--modified-file`

## Draft Workflow

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Create draft | `agentic-workspace task create "Feature" --draft`             |
| Draft flow  | `agentic-workspace draft create "Spike GraphQL"` → `agentic-workspace draft promote 3.1` |
| Demote to draft| `agentic-workspace task demote <id>` |

## Dependency Management

Manage task dependencies to express execution order:

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Add dependencies | `agentic-workspace task edit 7 --dep task-1 --dep task-2`     |
| Add multiple deps | `agentic-workspace task edit 7 --dep task-1,task-5,task-9`    |
| Create with deps | `agentic-workspace task create "Feature" --dep task-1,task-2` |
| View dependencies | `agentic-workspace task 7` (shows dependencies in the plain task detail)  |
| Validate dependencies | Use task commands to automatically validate dependencies |

**Dependency Features:**
- **Automatic validation**: verifies that referenced dependency tasks exist
- **Flexible formats**: Use `task-1`, `1`, or comma-separated lists like `1,2,3`
- **Completion tracking**: See which dependencies are blocking task progress

### Dependency graph in task detail

Task detail shows the whole dependency context around the selected task, under `Dependency Graph`, directly above the description. It is derived and read-only, and it replaces the raw `Dependencies:` ID list in plain output: the graph names the same direct dependencies and resolves their titles, status, and everything behind them.

Every plain task output uses this one layout, so `task create --plain`, `task edit --plain`, `task view --plain`, and the MCP task results all render identically. `--json` is unaffected: `task.dependencies` remains the editable direct list alongside `task.dependencyGraph`.

```text
Dependency Graph:
--------------------------------------------------
Depends on (1 direct, 2 total):
└─ BACK-2 - Parser rewrite [In Progress]
   └─ BACK-1 - Token schema [completed]

Dependents (2 direct, 2 total):
├─ BACK-8 - Migration guide [To Do]
└─ BACK-9 - Release checklist [To Do]
```

- **Edge direction.** A dependency edge points from the task that declares it to the task it depends on, so the task it points at blocks the task it comes from.
- **Direct versus transitive.** `Depends on` lists everything the selected task transitively depends on; `Dependents` lists everything that transitively depends on it. Nesting shows the distance: the outermost entries are direct relationships and everything indented below them is transitive. The heading counts both, as `N direct, M total`.
- **Dependents.** "Dependents" means the tasks this one blocks. It is the reverse of the task's own dependency list, and nothing on it is editable from here; change it on the task that declares it.
- **Visibility.** The graph resolves against exactly what task detail can already see: the current checkout plus completed tasks for the CLI, TUI, and MCP. Archiving a task takes it out of every one of those, so an archived ID stops resolving instead of coming back.
- **Cycles and repeats.** Every task appears once. A relationship that points back into the branch above it is marked `(cycle)`, and a task already shown elsewhere in the same section is marked `(shown above)` rather than being expanded again.
- **Unresolved identities.** `unknown task ID` means no visible task claims that ID. `ambiguous task ID` means more than one record claims it, so nothing is chosen. Neither is ever treated as satisfied, and the graph never traverses past one, so anything behind it is left out rather than reported as resolved. Review the conflicting task records and resolve duplicate IDs manually before trusting a graph that reports one.

## Board Operations

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Kanban board      | `agentic-workspace board` (interactive UI, press 'E' to edit in editor) |
| Export board | `agentic-workspace board export [file]` (exports Kanban board to markdown) |
| Export with version | `agentic-workspace board export --export-version "v1.0.0"` (includes version in export) |

## Documentation

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Create doc | `agentic-workspace doc create "API Guidelines"` |
| Create with path | `agentic-workspace doc create "Setup Guide" -p guides/setup` |
| Create with type | `agentic-workspace doc create "Architecture" -t guide` |
| Update content | `agentic-workspace doc update doc-1 --content "Updated markdown"` |
| Update metadata/path | `agentic-workspace doc update doc-1 --title "Setup Handbook" -t guide --tags setup,runbook -p guides` |
| List docs | `agentic-workspace doc list` |
| Search docs | `agentic-workspace doc search "architecture" --limit 5` |
| View doc | `agentic-workspace doc view doc-1` |

## Decisions

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Create decision | `agentic-workspace decision create "Use PostgreSQL for primary database"` |
| Create with status | `agentic-workspace decision create "Migrate to TypeScript" -s proposed` |

## Agent Instructions

| Action                                          | Example                                              |
|-------------------------------------------------|------------------------------------------------------|
| Open the local CLI documentation entry point | `agentic-workspace` |
| List workflow guides | `agentic-workspace instructions` |
| Required first read for task workflow | `agentic-workspace instructions overview` |
| Read a detailed workflow guide | `agentic-workspace instructions task-execution` |
| Update CLI agent instruction files | `agentic-workspace agents --update-instructions` (updates CLAUDE.md, AGENTS.md, GEMINI.md, .github/copilot-instructions.md) |

## Maintenance

| Action      | Example                                                                                      |
|-------------|----------------------------------------------------------------------------------------------|
| Cleanup done tasks | `agentic-workspace cleanup` (move old completed tasks to completed folder to cleanup the kanban board) |

Full help: `agentic-workspace --help`

---

## Sharing & Export

### Board Export

Export your Kanban board to a clean, shareable markdown file:

```bash
# Export to default AgenticWorkspace file
agentic-workspace board export

# Export to custom file
agentic-workspace board export project-status.md

# Force overwrite existing file
agentic-workspace board export --force

# Export to README.md with board markers
agentic-workspace board export --readme

# Include a custom version string in the export
agentic-workspace board export --export-version "v1.2.3"
agentic-workspace board export --readme --export-version "Release 2024.12.1-beta"
```

Perfect for sharing project status, creating reports, or storing snapshots in version control.

---

## Shell Tab Completion

AgenticWorkspace can install tab completion for bash, zsh, fish, and PowerShell.

**Quick Installation:**
```bash
# Auto-detect and install for your current shell
agentic-workspace completion install

# Or specify shell explicitly
agentic-workspace completion install --shell bash
agentic-workspace completion install --shell zsh
agentic-workspace completion install --shell fish
agentic-workspace completion install --shell pwsh
```

**What you get:**
- Command completion: `agentic-workspace <TAB>` → shows all commands
- Dynamic task IDs: `agentic-workspace task edit <TAB>` → shows actual task IDs from your backlog
- Smart flags: `--status <TAB>` → shows configured status values
- Context-aware suggestions for priorities, labels, and assignees

Full documentation: See [completions/README.md](completions/README.md) for detailed installation instructions, troubleshooting, and examples.
