---
consolidation:
  total: 255
  counts:
    exists: 12
    discard: 19
    integrate: 3
    unconfirmed: 221
  percentages:
    exists: 4.71%
    discard: 7.45%
    integrate: 1.18%
    unconfirmed: 86.67%
---
# CLI Reference

Full command reference for AgenticWorkspace. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: This inventory is not an approved complete API and contains unresolved and superseded surfaces. --> For getting started, see [README.md](README.md).

All examples use the `agentic-workspace` command, available after installing the `agentic-workspace` package globally (`npm i -g agentic-workspace`) or as a project dependency. <!-- consolidation: discard; ref: none; reason: Package installation recipe is operational distribution reference outside core consolidation. --> For one-off runs without installing, use `npx agentic-workspace <command>`, e.g. `npx agentic-workspace board`. <!-- consolidation: discard; ref: none; reason: One-off package invocation is retained as installation reference without approving board CLI syntax. -->

## Project Setup

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Initialize project | `agentic-workspace init [project-name]` (creates backlog structure with a minimal interactive flow) <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Setup CLI and initialization syntax remain unsettled. --> |
| Re-initialize | `agentic-workspace init` (preserves existing config, allows updates) <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Reinitialization preservation and update contract need disposition. --> |
| Advanced settings wizard | `agentic-workspace config` (no args) — launches the full interactive configuration flow <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Broad configuration wizard command is not approved baseline API. --> |

`agentic-workspace init` keeps first-run setup focused on the essentials:
- **Project name** – identifier for your backlog (defaults to the current directory on re-run). <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Init naming and rerun default are unsettled setup behavior. -->
- **AgenticWorkspace folder** – choose `agentic-workspace/`, `.agentic-workspace/`, or a custom project-relative path. <!-- consolidation: discard; ref: docs/specs/tasks.md#project-data-store; reason: Folder-only setup choices are superseded by configured project user-level or user-selected storage. -->
- **Config location** – for built-in folders, choose folder-local `config.yml` or root `agentic-workspace.config.yml`; custom paths use root `agentic-workspace.config.yml`. <!-- consolidation: unconfirmed; ref: docs/specs/configuration.md#configuration-access-and-precedence; reason: Exact filename and setup-location choices are not established by the one-file configuration contract. -->
- **Integration choice** – decide whether your AI tools use **CLI instructions** (recommended), the optional **MCP connector**, or no AI setup. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: MCP retention and broad setup or guidance APIs are explicitly undecided. -->
- **Instruction files (CLI path)** – the CLI setup writes a short nudge to AGENTS.md by default in non-interactive setup. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Generated instruction-file default requires guidance API approval. --> `--agent-instructions cursor` also selects AGENTS.md, and the interactive CLI and Web setup identify Cursor under that shared target. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Cursor target mapping across CLI and Web is unapproved integration inventory. --> Existing user-managed `.cursor/rules` files may coexist; AgenticWorkspace does not migrate or remove them, <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Preserve user-file safety constraint pending setup integration disposition rather than assume migration permission. --> and repeated initialization preserves non-AgenticWorkspace content in AGENTS.md. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Retain reinitialization content-preservation guarantee for explicit setup disposition and verification. -->
- **Advanced settings prompt** – default answer "No" finishes init immediately; choosing "Yes" jumps straight into the advanced wizard documented in [ADVANCED-CONFIG.md](ADVANCED-CONFIG.md). <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Wizard routing and default answer remain unsettled setup inventory. -->

You can rerun the wizard anytime with `agentic-workspace config`. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Repeatable configuration wizard API needs disposition. --> All existing CLI flags (for example `--defaults`, `--agent-instructions`) continue to provide fully non-interactive setups, <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Existing noninteractive flags do not establish approved compatibility or API scope. --> and init also supports `--agentic-workspace-dir <path>` plus `--config-location <folder|root>` for scripted configuration. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Scripted init options remain unsettled command syntax. -->

Humans and agents can run `agentic-workspace instructions` for workflow guides and `agentic-workspace instructions overview` for the overview. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Broad guidance commands remain undecided. -->

## Documentation

- Document IDs are global across all subdirectories under `agentic-workspace/docs`. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Document operations are approved but ID namespace and fixed storage path are not specified. --> You can organize files in nested folders (e.g., `agentic-workspace/docs/guides/`), and `agentic-workspace doc list` and `agentic-workspace doc view <id>` work across the entire tree. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Recursive document scope and folder semantics need disposition beyond approved operation names. -->
- Use `agentic-workspace doc create "New Guide" -p guides` to create a document in a docs subdirectory. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Exact path flag is not established by approval of doc create. --> The created output includes the persisted docs-relative file path, such as `agentic-workspace/docs/guides/doc-1 - New-Guide.md`. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Creation output path and filename schema require disposition. -->
- Use `agentic-workspace doc update doc-1 --content "Updated markdown"` to update document content. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Doc update purpose is approved but exact content option remains inventory. --> Add `--title`, `-t/--type`, `--tags`, or `-p/--path` to update metadata or move the document while preserving omitted fields. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Metadata options move behavior and omitted-field preservation need explicit disposition. -->
- Use `agentic-workspace doc search "query"` for scoped document search with plain text output that includes document IDs and follow-up `agentic-workspace doc view <docId>` commands. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Search is approved but exact plain result layout and follow-up commands are unspecified. --> Use `--limit <number>` to cap results. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Exact result-limit option is unsettled. -->
- Document paths are always relative to the docs directory. Absolute paths and traversal segments such as `..` are rejected. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Retain document path-validation safety constraint for explicit contract disposition rather than infer approval or retirement. -->

## Task Management

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Create task | `agentic-workspace task create "Add OAuth System"` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Creation purpose is approved but exact command syntax awaits inventory disposition. -->                    |
| Create with description | `agentic-workspace task create "Feature" -d "Add authentication system"` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Description field is approved but exact creation option is unsettled. --> |
| Create with assignee | `agentic-workspace task create "Feature" -a @sara` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Assignee option is not approved API baseline. -->           |
| Create with status | `agentic-workspace task create "Feature" -s "In Progress"` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Configured statuses are approved but creation flag is unsettled. -->    |
| Create with labels | `agentic-workspace task create "Feature" -l auth,backend` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Label option and comma parsing need disposition. -->     |
| Create with priority | `agentic-workspace task create "Feature" --priority high` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Priority option and value spelling are unsettled. -->     |
| Create with due date | `agentic-workspace task create "Feature" --due-date 2026-08-10` <!-- consolidation: discard; ref: docs/BLUEPRINT.md#decision-reconciliation; reason: Accepted task fields omit due date. --> |
| Create with deps | `agentic-workspace task create "Feature" --dep task-1,task-2` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Dependencies are approved but creation option syntax is unsettled. --> |
| Create with refs | `agentic-workspace task create "Feature" --ref https://docs.example.com --ref src/api.ts` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Reference options are not settled API baseline. --> |
| Create with docs | `agentic-workspace task create "Feature" --doc https://design-docs.example.com --doc docs/spec.md` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Documentation-reference options require disposition. --> |
| Create sub task | `agentic-workspace task create -p 14 "Add Login with Google"` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Parent-task creation option is unsettled. -->|
| Create (all options) | `agentic-workspace task create "Feature" -d "Description" -a @sara -s "To Do" -l auth --priority high --dep task-1 --ref src/api.ts --doc docs/spec.md -p 14` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Combined creation example includes unresolved options and is not approved exact syntax. --> |
| List tasks  | `agentic-workspace task list [-s <status>] [-a <assignee>] [-p <parent>] [--labels <labels>] [--search <query>] [--limit <n>]` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Listing entry point and option set need API disposition. --> |
| List filtered | `agentic-workspace task list --labels frontend,bug --search "login" --limit 10 --plain` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Exact list filter combination remains unsettled. --> |
| List in windows | `agentic-workspace task list --max-count 20 --skip 20 --plain` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Pagination flags are unapproved inventory. --> |
| Count tasks | `agentic-workspace task list --status "To Do" --count` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Count option needs disposition. --> |
| List as JSON | `agentic-workspace task list --status "To Do" --json` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Task-list JSON entry point is not established by search JSON approval. --> |
| Watch as JSON | `agentic-workspace task list --json --watch` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Watch subscription is unresolved API inventory. --> |
| List by parent | `agentic-workspace task list --parent 42` or `agentic-workspace task list -p task-42` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Parent filter and identity aliases are unsettled. --> |
| View detail | `agentic-workspace task 7` (plain task detail) <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Task detail shorthand command is unsettled. -->               |
| View (AI mode) | `agentic-workspace task 7 --plain` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Plain task detail syntax needs disposition. -->                           |
| View as JSON | `agentic-workspace task 7 --json` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Task-detail JSON command is unapproved inventory. --> |
| Edit        | `agentic-workspace task edit 7 -a @sara -l auth,backend` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Edit entry point and assignee or label flags need disposition. -->       |
| Add deps    | `agentic-workspace task edit 7 --dep task-1 --dep task-2` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Dependency mutation purpose does not approve exact edit flags. -->     |
| Set due date | `agentic-workspace task edit 7 --due-date 2026-08-10` <!-- consolidation: discard; ref: docs/BLUEPRINT.md#decision-reconciliation; reason: Task due-date field is explicitly omitted from accepted model. --> |
| Clear due date | `agentic-workspace task edit 7 --clear-due-date` <!-- consolidation: discard; ref: docs/BLUEPRINT.md#decision-reconciliation; reason: Clearing a removed task due-date field is superseded behavior. --> |
| Complete    | `agentic-workspace task complete 7` (move finished work to completed storage) <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Completion behavior is approved but exact CLI command remains unsettled. --> |
| Archive     | `agentic-workspace task archive 7` (canceled, duplicate, or invalid work) <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Archive command and cancellation policy need disposition. --> |

Mark finished work Done (or the configured final status). <!-- consolidation: exists; ref: docs/specs/tasks.md#work-context-and-completion; reason: Done changes status independently of cleanup. --> During periodic cleanup, use Complete to move it off the board while preserving its record and dependency links. <!-- consolidation: exists; ref: docs/specs/tasks.md#work-context-and-completion; reason: Explicit completion moves to completed storage and task model preserves dependencies. --> Archive removes incoming dependencies and task references. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Archive reference removal is not an approved deletion or completion policy. -->

### Paging long lists

`task list`, `search`, `draft list`, `milestone list`, `doc list`, `doc search`, and `decision list` print every match by default. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Default list cardinality is unsettled and includes a superseded draft surface. --> `--max-count <n>` prints at most `n` items and `--skip <n>` leaves out the first `n`, as in `git log`. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Pagination flag semantics need disposition. --> Both apply after filtering, sorting, and `--limit`, <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Pagination operation order is not approved. --> in the order the output prints: `task list` groups by status unless `--sort priority` prints one flat list, <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Task-list grouping and priority exception require disposition. --> plain `search` prints tasks, then documents, then decisions, <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#filtering-and-search; reason: Cross-record search is approved but corpus output order is not. --> and `milestone list` prints active milestones before completed ones. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Milestone CLI order is unsettled. --> Each list has a stable order: `task list` shows the newest task first, and only `--sort priority` (configured priorities first) or `--sort id` and `--sort ordinal` (both oldest first) change that; <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Default and selectable task sort semantics are unapproved inventory. --> tasks, drafts, and decisions break ties by ID, <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Tie-breaking is unsettled and drafts are not retained task behavior. --> documents sort by title and then path, <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Document sort order is unspecified. --> search results by score and then corpus order, <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#filtering-and-search; reason: Search ranking and tie-breaking require disposition. --> and milestones follow their files and then the tasks that name them. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Milestone file and inferred-name ordering is not approved. --> So consecutive windows of an unchanged backlog join into the complete output without overlapping or leaving items out. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Pagination continuity guarantee needs API disposition. --> With `--json`, `task list` windows its flat `tasks` array in sort order without status groups <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: JSON task window shape and order are unsettled. --> and `search` windows its results in relevance order, so read all windows of a list in one output mode. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#filtering-and-search; reason: JSON search window ordering and cross-mode caveat require disposition. --> The options print text instead of opening an interactive view. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Pagination mode selection is not approved. -->

Output cut by a window ends with the shown range, the total, and the command that prints the following items: <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Window footer contract is unsettled. -->

```text
Showing 21-40 of 57 items. Next: agentic-workspace task list --status 'To Do' --max-count 20 --skip 40
```
<!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Exact pagination footer example is unapproved output syntax. -->

The last window has no `Next:` part, <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Last-page footer behavior is unsettled. --> and a `--skip` past the end prints only `Showing 0 of 57 items.` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Out-of-range pagination output needs disposition. --> Output that is not cut has no footer. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Footer omission rule is unspecified. --> `--count` prints only the number of items the same command would list, as `grep --count` does; <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Count output semantics are unsettled. --> it cannot be combined with `--json`. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Count and JSON option exclusion requires disposition. --> There are no short forms because `-m` already means `--milestone`. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Short-option allocation is unapproved API syntax. --> `--limit` keeps its behavior: it silently shortens the list before any window applies. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Limit compatibility and pre-window truncation need disposition. -->

Task and milestone due dates are calendar days stored as `YYYY-MM-DD`. Use a plain date such as `2026-08-10`; a due date carries no time and no timezone. <!-- consolidation: discard; ref: docs/BLUEPRINT.md#decision-reconciliation; reason: Task due-date field and its date-only representation are superseded. --> <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#milestones; reason: Milestone due-date support and representation are not established by the approved milestone contract. -->

### Stable JSON output

Use `--json` when a script or integration needs structured output: <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Search JSON purpose is approved but general flag availability across commands is unsettled. -->

```bash
agentic-workspace task list --status "To Do" --json | jq '.tasks[] | .id'
agentic-workspace task BACK-7 --json
agentic-workspace search "authentication" --json | jq '.results[] | [.type, .data.id]'
```
<!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Task-list JSON example depends on unsettled command and tasks envelope. -->
<!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Task-view JSON example depends on unsettled shorthand syntax. -->
<!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#filtering-and-search; reason: Search JSON is approved but example results type and data schema are not. -->

Use `agentic-workspace task list --json --watch` to receive the full matching list immediately, then a full replacement whenever its JSON result changes. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Subscription initial snapshot and update behavior require approval. --> Every response uses exactly the same fields, envelope, indentation, and trailing newline as `task list --json`. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Stream and one-shot output equivalence is not approved. --> Read successive complete JSON values, not individual lines or the whole stream as one document. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Stream framing contract is unsettled. --> For example:

```bash
agentic-workspace task list --json --watch | jq --unbuffered -c '.tasks'
```
<!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Watch consumption example depends on unapproved stream schema. -->

Each response replaces the subscriber's previous list, including an empty `tasks` array. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Replacement and empty-result stream semantics need disposition. --> Filters, sorting, limits, and local editable task scope are unchanged; completed storage, archives, drafts, and other branches are not added to the list. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Watch filtering and corpus exclusions are not approved by task-store scope alone. --> Dependency and configuration changes can update derived fields or which tasks match. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Watch invalidation inputs are unsettled. --> Unchanged results are suppressed, <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Duplicate suppression needs approval. --> and rapid edits or slow consumers may coalesce intermediate states. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Coalescing and backpressure guarantees need disposition. --> The command reconciles periodically as well as on file notifications; this is a current-state subscription, not an edit history. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Reconciliation and snapshot-only delivery are unsettled watch contracts. --> Restart it to receive a fresh full list. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Watch restart semantics are unapproved. -->

`--watch` requires `--json` and cannot be combined with `--plain`. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Watch option compatibility is unsettled. --> Stop it with Ctrl+C or terminate the process; closing the output pipe also stops it. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Signal and pipe-close shutdown contract needs disposition. --> It also ends when the process that started it ends. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Parent-lifetime coupling is unapproved API behavior. --> A failure after earlier responses writes a diagnostic to stderr and exits nonzero without emitting a replacement for that failed read. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Preserve stream failure-reporting guarantee pending API approval and verification. -->

Each successful response is one pretty-printed JSON document followed by a newline. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Exact JSON serialization is not approved. --> The top-level contract is versioned and identifies the command result: <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Public versioned envelope requires approval. -->

| Command | Envelope |
|---------|----------|
| `task list --json` | `{ "schemaVersion": 1, "kind": "task-list", "tasks": [...] }` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Task-list JSON envelope is not settled API. --> |
| `task view <id> --json` and `task <id> --json` | `{ "schemaVersion": 1, "kind": "task-view", "task": {...} }` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Task-view aliases and envelope require disposition. --> |
| `search [query] --json` | `{ "schemaVersion": 1, "kind": "search", "results": [...] }` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#filtering-and-search; reason: Search JSON is approved but exact envelope is not. --> |

Task list and task search results use these compact fields: `id`, `title`, `status`, `type`, `priority`, `project`, `assignees`, `reporter`, `labels`, `milestone`, `parentTaskId`, `references`, `modifiedFiles`, `ordinal`, `createdAt`, `updatedAt`, `dueDate`, and `isReady`. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Compact output schema needs disposition and includes explicitly removed project and dueDate fields. --> `project` reports the task's `project:` frontmatter and is `null` when the task has none. <!-- consolidation: discard; ref: docs/BLUEPRINT.md#decision-reconciliation; reason: Task project field is explicitly omitted from the accepted model. --> Setting or filtering by it requires a `projects:` list in the project config. <!-- consolidation: discard; ref: docs/specs/tasks.md#task-model; reason: Project-field activation and filtering are superseded. --> `isReady` is derived from the whole visible corpus at read time and never stored: <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#task-model; reason: Readiness display is approved but exact derivation scope and persistence rule are not. --> it is `true` when the task is unfinished and every dependency it names resolved to a completed task, and `false` for a finished task or one whose dependencies are unfinished, unknown, or ambiguous. <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#task-model; reason: Exact readiness truth table and fail-closed ambiguity handling require disposition. --> It is the same verdict `task list --ready` filters on. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Ready-filter option and equivalence are unsettled. -->

Task view includes the compact fields above and adds `path`, `description`, `dependencies`, `dependencyGraph`, `readiness`, `documentation`, `subtasks`, and `agentSummary`. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Task-view schema including summary and inherited removed fields is unapproved inventory. --> `path` is relative to the project root. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Output path representation requires disposition. -->

Task view also carries `dependencyGraph`, a property of the task detail that is derived from the whole visible corpus at read time and never stored in the Markdown file. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Derived graph output and storage exclusion are unsettled API contracts. --> `task.dependencies` stays the task's own list of direct dependency IDs, unchanged. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Exact dependencies JSON representation is not approved. --> `task.dependencyGraph` contains `root` (the selected task's ID), `nodes`, and `edges`. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Graph envelope fields need disposition. --> Each edge is `{ "from": ..., "to": ... }` and always points from the task that declares the dependency to the task it depends on, so `to` blocks `from`. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Edge serialization and orientation are unspecified in core. --> Each node contains `id`, `title`, `status`, `state`, `completed`, `dependencyDepth`, and `dependentDepth`. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Node schema is unapproved. --> The two depths are the shortest hop counts from the root: `0` is the root itself, `1` is a direct relationship, anything higher is transitive, and `null` means the node is not reachable in that direction. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Shortest-hop depth semantics require disposition. --> Nodes are listed root first and then by task ID, edges by `from` and then `to`. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Deterministic graph output order is unsettled. --> See "Dependency Management" for what the graph covers and how it reports identities it cannot resolve.

`readiness` explains the `isReady` field above it and comes from the same derivation. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Shared readiness derivation in JSON needs approval. --> It contains `isReady`, `isBlocked`, `blockingDependencies` (dependencies that resolved to unfinished tasks), and `missingDependencies` (dependency IDs no single visible task claims). <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Readiness explanation schema is unsettled. --> Both lists fail closed: an unknown or ambiguous dependency blocks instead of being treated as satisfied. <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#task-model; reason: Preserve dependency ambiguity safeguard for explicit disposition without converting informational readiness into launch gating. -->

Search keeps relevance order and discriminates every result with `type` and `data`. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#filtering-and-search; reason: Ranking and discriminator schema are not approved matching or output details. --> Task data uses the compact task fields. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#filtering-and-search; reason: Task search schema needs alignment with the approved task model. --> Document data contains `id`, `title`, `type`, `path`, `tags`, `createdAt`, and `updatedAt`. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#filtering-and-search; reason: Document search result schema is unspecified. --> Decision data contains `id`, `title`, `status`, and `date`. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#filtering-and-search; reason: Decision search result schema is unspecified. --> Search scores are not part of the version 1 public contract. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#filtering-and-search; reason: Versioned score exclusion has no approved output contract. -->

When `--max-count` or `--skip` cuts a `task list`, `search`, or `decision list` result, the envelope also contains `total`, the number of items before the window, and `nextSkip`, the `--skip` value for the following items or `null` when none follow. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Conditional pagination envelope fields and values are unsettled. --> Output that is not cut has neither field. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Omission of pagination fields is not approved. -->

Absent scalar fields are `null`, and absent collections are `[]`. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Missing-value serialization contract is unsettled. --> Date-only values remain `YYYY-MM-DD`; UTC date-times use RFC 3339. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Date output format and compatibility require disposition. --> Internal fields, absolute paths, raw Markdown source objects, branch metadata, and search implementation details are not exposed. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Retain data-exposure boundary pending exact API approval and verification. -->

`--json` and `--plain` are mutually exclusive. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Output-option exclusion is unsettled. --> Explicit JSON mode is always noninteractive, including in a terminal. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: JSON interaction-mode guarantee needs approval. --> Without `--json`, existing interactive, explicit plain, and automatic non-TTY plain behavior is unchanged. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Existing interaction compatibility is not automatically approved. --> One-shot errors leave stdout empty, write a concise message to stderr, and exit nonzero. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Preserve machine-readable error-channel guarantee for explicit API disposition. --> Version 1 may gain backward-compatible fields, but removing, renaming, retyping, or changing documented field semantics requires a new `schemaVersion`. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Public schema evolution policy is not approved by current baseline. -->

### Task artifacts

Use task artifacts for detailed working state and durable context instead of a task summary field. <!-- consolidation: exists; ref: docs/specs/tasks.md#task-artifacts; reason: Generic user-managed files provide arbitrary task content independent of prescribed summary schemas. --> Artifact paths are relative to the task container; <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#task-artifacts; reason: Wording needs reconciliation with the approved artifacts directory rather than arbitrary task-container paths. --> use ordinary filenames such as `notes.md`, `spec.md`, or `plan.md` as appropriate. <!-- consolidation: exists; ref: docs/specs/tasks.md#task-artifacts; reason: Files have arbitrary names and contents. -->

```bash
agentic-workspace task artifact list BACK-7
agentic-workspace task artifact read BACK-7 plan.md
agentic-workspace task artifact write BACK-7 plan.md --from plan.md
agentic-workspace task artifact status BACK-7 plan.md
```
<!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Artifact list purpose is approved but example command spelling remains unsettled. -->
<!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Artifact read purpose is approved but example command spelling remains unsettled. -->
<!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Artifact write from file is approved but exact --from option remains unsettled. -->
<!-- consolidation: discard; ref: docs/specs/configuration.md#modes-and-approval; reason: Artifact status example reflects superseded file approval rather than task-and-mode approval. -->

`write` reads bytes from stdin by default or from `--from <file>`. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: File or stdin writes are approved but default input and option spelling require disposition. --> Approval is user-only and is performed in the TUI; agents can inspect approval status but cannot approve artifacts. <!-- consolidation: discard; ref: docs/specs/configuration.md#modes-and-approval; reason: Approval belongs to task and mode and an agent may set it on user direction rather than inspecting or approving file contents. -->

For multi-line task descriptions, pass real newlines inside a quoted argument. <!-- consolidation: discard; ref: none; reason: Retain shell argument usage guidance outside core consolidation. --> The CLI preserves input literally; `\n` is not converted automatically. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Exact CLI input escape behavior requires disposition. -->

### Literal backticks in task text

When task text includes Markdown code spans, quote it so the shell passes the backticks literally. Unescaped backticks in double-quoted or unquoted arguments are command substitution in many shells, and AgenticWorkspace cannot recover the original text after the shell has already executed it. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Missing operational safety guidance to preserve literal task input and prevent unintended shell substitution before CLI invocation. -->

Use single-quoted CLI arguments for values that contain literal backticks: <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Missing concrete quoting safeguard for literal Markdown passed through a shell. -->

```bash
agentic-workspace task create 'Document `agentic-workspace init` setup'
```
<!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Exact task command syntax remains unsettled while the separate shell quoting safeguards are retained. -->

If single quotes are not practical in your shell, escape each literal backtick before running the command. Do not rely on AgenticWorkspace to sanitize accidental command output after substitution. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Missing alternate shell escaping safeguard and boundary that substitution occurs before application validation. -->

## Milestone Management

Milestones are managed through milestone files. <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#milestones; reason: File representation is not specified by the approved milestone contract. --> Use CLI commands instead of editing milestone markdown directly so IDs, filenames, task references, and archive state stay consistent. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: CLI recommendation and consistency guarantees need disposition while direct file access remains allowed. -->

| Action | Example |
|--------|---------|
| List milestones | `agentic-workspace milestone list --plain` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Milestone listing behavior is approved but CLI entry point and options are unsettled. --> |
| List completed milestones too | `agentic-workspace milestone list --show-completed --plain` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Completed milestone listing option requires disposition. --> |
| Add milestone | `agentic-workspace milestone add "Release 1.0"` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Add behavior is approved but exact CLI syntax is not. --> |
| Add with description | `agentic-workspace milestone add "Beta" --description "Beta scope"` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Milestone description option is unsettled. --> |
| Add with due date | `agentic-workspace milestone add "Beta" --due-date 2026-08-10` <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#milestones; reason: Milestone due date and CLI option are not approved. --> |
| Rename and update tasks | `agentic-workspace milestone rename "Release 1.0" "Release 2.0"` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Assignment-preserving rename is approved but exact CLI syntax remains unsettled. --> |
| Set due date without renaming | `agentic-workspace milestone rename "Release 1.0" "Release 1.0" --due-date 2026-08-10` <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#milestones; reason: Due-date update behavior and rename overload need disposition. --> |
| Clear due date | `agentic-workspace milestone rename "Release 1.0" "Release 1.0" --clear-due-date` <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#milestones; reason: Milestone due-date clearing is unsettled. --> |
| Rename without task updates | `agentic-workspace milestone rename m-1 "Release 2.0" --no-update-tasks` <!-- consolidation: discard; ref: docs/specs/tasks.md#milestones; reason: Approved rename preserves task assignments rather than leaving stale references. --> |
| Remove and clear task milestones | `agentic-workspace milestone remove "Release 1.0"` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Reference-clearing removal is approved but exact command remains unsettled. --> |
| Remove and keep task values | `agentic-workspace milestone remove "Release 1.0" --task-handling keep` <!-- consolidation: discard; ref: docs/specs/tasks.md#milestones; reason: Approved removal clears or reassigns all matching references and cannot retain dangling values. --> |
| Remove and reassign tasks | `agentic-workspace milestone remove "Release 1.0" --task-handling reassign --reassign-to "Release 2.0"` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Reassignment purpose is approved but exact CLI options are unsettled. --> |
| Archive milestone | `agentic-workspace milestone archive m-1` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Archive behavior is approved but exact entry syntax needs disposition. --> |

`milestone remove` task handling modes are `clear` (default), `keep`, and `reassign`. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Exact clear or reassign option names and default are unsettled. --> <!-- consolidation: discard; ref: docs/specs/tasks.md#milestones; reason: The keep mode contradicts mandatory clearing or reassignment of removed milestone references. --> `--reassign-to` is required when using `--task-handling reassign`, <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Reassignment option dependency needs disposition. --> and the target must be an active milestone file. <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#milestones; reason: Existing milestone requirement is approved but active-file eligibility restriction is not specified. -->

## Search

Find tasks, documents, and decisions across your entire backlog with fuzzy search: <!-- consolidation: exists; ref: docs/specs/interfaces.md#filtering-and-search; reason: Cross-record search spans project tasks documents and decisions. --> <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#filtering-and-search; reason: Fuzzy matching details are explicitly undecided. -->

| Action             | Example                                              |
|--------------------|------------------------------------------------------|
| Search tasks       | `agentic-workspace search "auth"` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Search purpose is approved but exact command syntax remains inventory. -->                        |
| Filter by status   | `agentic-workspace search "api" --status "In Progress"` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#filtering-and-search; reason: Status filtering is approved but option syntax is unsettled. -->   |
| Filter by priority | `agentic-workspace search "bug" --priority high` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#filtering-and-search; reason: Priority filter option and values need disposition. -->        |
| Combine filters    | `agentic-workspace search "web" --status "To Do" --priority medium` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#filtering-and-search; reason: Filter combinations are explicitly undecided. --> |
| Plain text output  | `agentic-workspace search "feature" --plain` (for scripts/AI) <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Plain search is approved but exact flag syntax is not settled here. --> |
| JSON output        | `agentic-workspace search "feature" --json` (for structured integrations) <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: JSON search is approved but exact command syntax remains inventory. --> |
| Find by modified file | `agentic-workspace search --modified-file src/path.ts --plain` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#filtering-and-search; reason: Modified-file filter is not in approved task filters. --> |
| Page results       | `agentic-workspace search "api" --max-count 20 --skip 20 --plain` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Search pagination flags need disposition. --> |

**Search features:**
- **Fuzzy matching** -- finds "authentication" when searching for "auth" <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#filtering-and-search; reason: Matching details are explicitly undecided. -->
- **Modified-file lookup** -- tasks can record project-root-relative modified files; find them later with `--modified-file` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#filtering-and-search; reason: Modified-file recording and lookup are unapproved inventory. -->

## Draft Workflow

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Create draft | `agentic-workspace task create "Feature" --draft` <!-- consolidation: discard; ref: docs/specs/tasks.md#task-model; reason: Creation produces a task directly rather than a draft. -->             |
| Draft flow  | `agentic-workspace draft create "Spike GraphQL"` → `agentic-workspace draft promote 3.1` <!-- consolidation: discard; ref: docs/specs/tasks.md#task-model; reason: Draft promotion is explicitly not provided by the approved model. --> |
| Demote to draft| `agentic-workspace task demote <id>` <!-- consolidation: discard; ref: docs/specs/tasks.md#task-model; reason: Draft demotion is explicitly rejected. --> |

## Dependency Management

Manage task dependencies to express execution order: <!-- consolidation: exists; ref: docs/specs/tasks.md#task-model; reason: Tasks have informational dependencies and readiness without automatic launch gating. -->

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Add dependencies | `agentic-workspace task edit 7 --dep task-1 --dep task-2` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Repeated dependency edit option is unsettled. -->     |
| Add multiple deps | `agentic-workspace task edit 7 --dep task-1,task-5,task-9` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Comma-separated dependency syntax requires disposition. -->    |
| Create with deps | `agentic-workspace task create "Feature" --dep task-1,task-2` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Dependency creation flags are not approved exact syntax. --> |
| View dependencies | `agentic-workspace task 7` (shows dependencies in the plain task detail) <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Shorthand task detail command and plain layout need disposition. -->  |
| Validate dependencies | Use task commands to automatically validate dependencies <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#task-model; reason: Automatic mutation validation guarantees are not specified by informational dependency support. --> |

**Dependency Features:**
- **Automatic validation**: verifies that referenced dependency tasks exist <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#task-model; reason: Existence validation on mutation requires explicit disposition. -->
- **Flexible formats**: Use `task-1`, `1`, or comma-separated lists like `1,2,3` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Dependency ID aliases and parser formats are unsettled. -->
- **Completion tracking**: See which dependencies are blocking task progress <!-- consolidation: exists; ref: docs/specs/tasks.md#task-model; reason: Dependency blocker and readiness display is approved. -->

### Dependency graph in task detail

Task detail shows the whole dependency context around the selected task, under `Dependency Graph`, directly above the description. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Full graph extent title and plain-detail placement are not approved API output. --> It is derived and read-only, <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#task-model; reason: Read-only graph derivation is not specified beyond dependency readiness display. --> and it replaces the raw `Dependencies:` ID list in plain output: the graph names the same direct dependencies and resolves their titles, status, and everything behind them. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Plain-output replacement and transitive identity resolution require disposition. -->

Every plain task output uses this one layout, so `task create --plain`, `task edit --plain`, `task view --plain`, and the MCP task results all render identically. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Cross-command rendering equivalence and MCP retention are unsettled. --> `--json` is unaffected: `task.dependencies` remains the editable direct list alongside `task.dependencyGraph`. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: JSON graph and direct-list compatibility is unapproved schema. -->

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
<!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Graph output illustration is not an approved plain-rendering contract. -->

- **Edge direction.** A dependency edge points from the task that declares it to the task it depends on, so the task it points at blocks the task it comes from. <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#task-model; reason: Graph edge orientation is not explicitly specified in approved dependency behavior. -->
- **Direct versus transitive.** `Depends on` lists everything the selected task transitively depends on; `Dependents` lists everything that transitively depends on it. <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#task-model; reason: Bidirectional transitive graph extent needs disposition. --> Nesting shows the distance: the outermost entries are direct relationships and everything indented below them is transitive. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Graph indentation semantics are unsettled. --> The heading counts both, as `N direct, M total`. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Graph count labels are unapproved output syntax. -->
- **Dependents.** "Dependents" means the tasks this one blocks. It is the reverse of the task's own dependency list, <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#task-model; reason: Reverse dependency projection is not specified by core readiness support. --> and nothing on it is editable from here; change it on the task that declares it. <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#task-model; reason: Dependency editing ownership through this graph needs disposition. -->
- **Visibility.** The graph resolves against exactly what task detail can already see: the current checkout plus completed tasks for the CLI, TUI, and MCP. <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#project-data-store; reason: Exact graph corpus and retained adapters need reconciliation with authoritative project storage. --> Archiving a task takes it out of every one of those, so an archived ID stops resolving instead of coming back. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Archive exclusion and reference resolution policy are unsettled. -->
- **Cycles and repeats.** Every task appears once. <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#task-model; reason: Graph deduplication scope is unspecified. --> A relationship that points back into the branch above it is marked `(cycle)`, <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Cycle rendering marker is not approved. --> and a task already shown elsewhere in the same section is marked `(shown above)` rather than being expanded again. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Repeat marker and expansion suppression need disposition. -->
- **Unresolved identities.** `unknown task ID` means no visible task claims that ID. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Missing-ID diagnostic and corpus scope are unsettled. --> `ambiguous task ID` means more than one record claims it, so nothing is chosen. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Retain duplicate-ID refusal safeguard pending API disposition. --> Neither is ever treated as satisfied, and the graph never traverses past one, so anything behind it is left out rather than reported as resolved. <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#task-model; reason: Fail-closed graph traversal safeguard requires explicit disposition rather than removal. --> Review the conflicting task records and resolve duplicate IDs manually before trusting a graph that reports one. <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#task-model; reason: Preserve ambiguity recovery gate while exact duplicate-ID repair policy remains unspecified. -->

## Board Operations

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Kanban board      | `agentic-workspace board` (interactive UI, press 'E' to edit in editor) <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Board view is approved but command and editor shortcut are not settled. --> |
| Export board | `agentic-workspace board export [file]` (exports Kanban board to markdown) <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Board export is unapproved integration inventory. --> |
| Export with version | `agentic-workspace board export --export-version "v1.0.0"` (includes version in export) <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Export version option needs disposition. --> |

## Documentation

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Create doc | `agentic-workspace doc create "API Guidelines"` <!-- consolidation: exists; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Named doc create operation creates project documents. --> |
| Create with path | `agentic-workspace doc create "Setup Guide" -p guides/setup` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Path option and nesting behavior are unsettled. --> |
| Create with type | `agentic-workspace doc create "Architecture" -t guide` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Document type option is not specified. --> |
| Update content | `agentic-workspace doc update doc-1 --content "Updated markdown"` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Update purpose is approved but exact content flag needs disposition. --> |
| Update metadata/path | `agentic-workspace doc update doc-1 --title "Setup Handbook" -t guide --tags setup,runbook -p guides` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Metadata and move option syntax is unsettled. --> |
| List docs | `agentic-workspace doc list` <!-- consolidation: exists; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Named doc list operation is approved. --> |
| Search docs | `agentic-workspace doc search "architecture" --limit 5` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Doc search is approved but limit option is not specified. --> |
| View doc | `agentic-workspace doc view doc-1` <!-- consolidation: exists; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Named doc view operation reads a selected project document. --> |

## Decisions

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Create decision | `agentic-workspace decision create "Use PostgreSQL for primary database"` <!-- consolidation: exists; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Named decision create operation is approved and example title does not approve a technology choice. --> |
| Create with status | `agentic-workspace decision create "Migrate to TypeScript" -s proposed` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Decision status option and values need disposition. --> |

## Agent Instructions

| Action                                          | Example                                              |
|-------------------------------------------------|------------------------------------------------------|
| Open the local CLI documentation entry point | `agentic-workspace` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: No-argument command behavior belongs to unsettled guidance API inventory. --> |
| List workflow guides | `agentic-workspace instructions` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Guidance command retention remains undecided. --> |
| Required first read for task workflow | `agentic-workspace instructions overview` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Required workflow guide and entry point have no approved guidance contract. --> |
| Read a detailed workflow guide | `agentic-workspace instructions task-execution` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Task-execution guidance command is unsettled. --> |
| Update CLI agent instruction files | `agentic-workspace agents --update-instructions` (updates CLAUDE.md, AGENTS.md, GEMINI.md, .github/copilot-instructions.md) <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Instruction-update command and write targets require guidance API disposition. --> |

## Maintenance

| Action      | Example                                                                                      |
|-------------|----------------------------------------------------------------------------------------------|
| Cleanup done tasks | `agentic-workspace cleanup` (move old completed tasks to completed folder to cleanup the kanban board) <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Explicit completion is approved but bulk cleanup command and age policy are unsettled. --> |

Full help: `agentic-workspace --help` <!-- consolidation: exists; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Installed help is the required capability-inspection surface rather than behavioral approval. -->

---

## Sharing & Export

### Board Export

Export your Kanban board to a clean, shareable markdown file: <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Board export is unsettled integration scope. -->

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
<!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Default board export destination example needs disposition. -->
<!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Custom output filename example needs disposition. -->
<!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Force-overwrite export option and replacement safety require disposition. -->
<!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: README marker-targeted export is not approved. -->
<!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Custom version-string export examples are unsettled API syntax. -->

Perfect for sharing project status, creating reports, or storing snapshots in version control. <!-- consolidation: discard; ref: none; reason: Promotional export use cases are not durable requirements or approval evidence. -->

---

## Shell Tab Completion

AgenticWorkspace can install tab completion for bash, zsh, fish, and PowerShell. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Completion installation and supported shell matrix remain unapproved integration inventory. -->

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
<!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Automatic shell detection and completion install command need disposition. -->
<!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Explicit bash zsh fish and pwsh selection examples are unsettled completion API syntax. -->

**What you get:**
- Command completion: `agentic-workspace <TAB>` → shows all commands <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Command completion coverage is not approved API behavior. -->
- Dynamic task IDs: `agentic-workspace task edit <TAB>` → shows actual task IDs from your backlog <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Dynamic task-ID completion requires disposition. -->
- Smart flags: `--status <TAB>` → shows configured status values <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Configured status completion is unsettled. -->
- Context-aware suggestions for priorities, labels, and assignees <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Context-sensitive completion field set needs disposition. -->

Full documentation: See [completions/README.md](completions/README.md) for detailed installation instructions, troubleshooting, and examples.
