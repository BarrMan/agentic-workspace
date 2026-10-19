# Software Blueprint: AgenticWorkspace

## Overview

AgenticWorkspace manages project tasks, configured modes, retained conversations, and live sessions. Six components: Models, Controller, Renderer, CLI, Storage, SessionRuntime. [SPEC](SPEC.md) owns behavior; [ADRs](adr/README.md) own technology.

## Component Ownership

| Component | Responsibility | Depends on |
|---|---|---|
| Models | Task, Mode, Session, RunningExecution, Config, preferences, groups. Owns business rules and relations. | none |
| Controller | Sole operation boundary. Owns models, persists through Storage, calls Session operations, publishes signals. | Models, Storage |
| Renderer | Views, keybindings, focus, layout, terminal attachment, terminal backend. | Controller, Storage (presentation config), SessionRuntime |
| CLI | Maps supported commands to Controller operations. | Controller |
| Storage | Model-typed persistence and presentation configuration. Sole owner of the filesystem. | Models, filesystem |
| SessionRuntime | Start, exact-resume, stop, observe, attach. Composed of Harness and terminal host. | Models, execution host |

Controller is UI-agnostic: no keybindings, focus, layout, or terminal backend. Only Renderer knows the terminal backend. Application init runs `controller.load(project)` before `renderer.init(controller)`.

## Repository Layout

`src/` uses the component boundaries as its top-level layers. A file belongs to the layer that owns its behavior, not to a catch-all utility directory.

| Directory | Component | Owns |
|---|---|---|
| `model/` | Models | Task and Session records and behavior, identity, readiness, dependency graph, ordering, filters, configuration types, domain constants, and domain errors. No I/O. |
| `storage/` | Storage | Model-typed persistence, record codecs and schema validation, repositories, watchers, session/group/view state, and storage errors. |
| `filesystem/` | Storage substrate | Filesystem operations, path resolution, atomic writes, locks, and git worktree access. |
| `controller/` | Controller | The operation boundary and application workflows: task lifecycle, creation, mutation, queries, search, and initialization. |
| `runtime/` | SessionRuntime | Harness adapters, agent presets, session process and tmux management, activity/status, and workspace context. |
| `renderer/` | Renderer | OpenTUI screens, board, presentation formatters, and README/board rendering. |
| `cli/` | CLI | Command registration, feature modules, completions, and CLI-only parsing and output. |
| `lib/` | none | Generic, domain-free helpers such as dates, slugs, process capture, and debug logging. It does not import application layers. |
| `test/` | none | Shared fixtures and cross-cutting contract/integration tests. Focused tests sit beside their owner. |
| `types/` | none | Ambient `.d.ts` declarations only. |

Rules:

- Put a change in its owner's directory. `lib/` is not a default for helpers that know task, session, storage, runtime, or presentation concepts.
- Domain behavior lives on the model that owns it. Task identity comparison, value equality, and readiness are Task operations, not free helpers or controller methods.
- Custom errors live in the `errors/` subdirectory of the layer that owns the failure.
- A new top-level directory or a new layer-crossing dependency requires a BLUEPRINT update.

## Detailed Pages

| Page | Owns |
|---|---|
| [Models](blueprints/models.md) | Shared types, preferences, Configuration |
| [Controller](blueprints/controller.md) | Operation boundary, load, task mutation, create/resume/stop, observe, shutdown |
| [Task](blueprints/task.md) | Task schema, session relationships, serialization, selection |
| [Session](blueprints/session.md) | Session, RunningExecution, SessionRuntime |
| [Harness](blueprints/harness.md) | Provider-adapter interface, launch/resume/stop/observe, readiness evidence |
| [Storage](blueprints/storage.md) | Task and presentation persistence |
| [Renderer](blueprints/renderer.md) | Views, keybindings, terminal attachment |
| [CLI](blueprints/cli.md) | Command-to-Controller mapping |
| [Signals](blueprints/signals.md) | Post-commit notifications |

## Shared Rules

- Callers supply valid data. Controller does not re-validate parameters; models enforce their schema, Storage validates encoding, and SessionRuntime validates provider identity.
- Storage is the only component that knows workspace persistence: workspace paths, record formats, storage codecs, locks, and file watching. Controller calls Storage; Renderer may call Storage only for presentation configuration; CLI calls Controller only. No application or frontend component holds a workspace filesystem handle or constructs workspace storage paths. Milestone and task reads are Storage operations, not Controller filesystem calls.
- Runtime execution resources are not workspace persistence: provider receipts, terminal sockets and panes, process handles, logs, and user-selected input files stay with SessionRuntime, Harness, or Renderer. Those components may use filesystem or socket APIs for their own resources, but never to read or write workspace records.
- Signals are post-commit. Handlers never call Controller operations.
- Only an explicit Controller operation starts or resumes a session. Runtime state is observed, never persisted as history; `unknown` authorizes no destructive action.
- Create order: reserve → persist reservation → start → persist identity → publish. Any creation failure stops or cleans up the execution and rolls back the reservation; if cleanup fails or the execution may still be running, keep durable tracking of it.
- Terminal detach never stops execution. Shutdown stops every owned execution.
- Every Renderer and CLI operation uses the same Controller method.
- A start is never blocked. The project-wide soft limit stops only positively idle sessions, longest continuously idle first; running, permission, and unknown sessions are protected.
- Session identity survives execution replacement. A provider ID alone proves neither liveness nor resumability.
- SessionRuntime never branches on provider name. Harness selection is configuration; provider-specific launch, readiness, and event handling stay inside the adapter.

## Capabilities

| Capability | Components | Contract |
|---|---|---|
| Tasks, artifacts, dependencies, persistence | Controller, Models, Storage | [tasks](specs/tasks.md) |
| Sessions and runtime lifecycle | Controller, Models, SessionRuntime, Storage | [sessions](specs/sessions.md) |
| Configuration, modes, preferences | Controller, Models, Storage | [configuration](specs/configuration.md) |
| Workspace, board, filters, search | Controller, Models, Renderer | [workspace](specs/workspace-and-board.md), [filtering](specs/filtering-and-search.md) |
| Session interaction and attachment | Controller, Renderer, SessionRuntime | [session interaction](specs/session-interaction-and-feedback.md) |
| CLI | CLI, Controller | [integration](specs/supported-integration-operations.md) |
| Presentation, layout, keybindings | Renderer, Storage | [DESIGN-SYSTEM](DESIGN-SYSTEM.md), [screens](screens/README.md) |

## Open Design Decisions

| Decision | Constraint | Status |
|---|---|---|
| Durable recovery record shape | Preserve creation identity, prior selection, and resource ownership without lifecycle history | Open |
| Exact event/unsubscribe and execution-handle shapes | Provider details stay inside Harness | Open |
| Provider readiness evidence | Must prove correlated identity, initialization, and initial submission, not an answer | Open |
