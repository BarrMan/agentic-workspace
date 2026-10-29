# Software Blueprint: AgenticWorkspace

## Overview

AgenticWorkspace manages project tasks, configured modes, retained conversations, and live sessions. Six components: Models, Controller, Renderer, CLI, Storage, SessionRuntime. Within Controller, TasksService owns task operations and the initialized task collection; Core owns session orchestration. Within Storage, SessionStore owns durable session histories. [SPEC](SPEC.md) owns behavior; [ADRs](adr/README.md) own technology and decision history.

## Component Ownership

| Component | Responsibility | Owned state | Dependencies |
|---|---|---|---|
| Models | Domain transformations, task/session relationships, runtime state and configuration resolution. | Task records and relationships; Session conversation projection and observed state; Config snapshots. | Domain types; Session's runtime port |
| Controller | TasksService owns task reads, writes, hooks, publication and lifecycle; Core coordinates sessions and composes workflow owners. | Initialized task collection, hydrated models, owned executions and pending launches. | Models, Storage, Session operations |
| Renderer | Views, keybindings, focus, layout and terminal attachment. | Presentation, terminal backend and its subscriptions. | Controller owners, typed Storage operations, SessionRuntime |
| CLI | Accepts supported command input and invokes the same owners as Renderer. | Command input and output. | Controller owners, typed Storage lock boundary, Models |
| Storage | Sole workspace-persistence boundary, including SessionStore. | Durable task/configuration records, session histories, presentation state, locks and watchers. | Models, private FileSystem substrate |
| SessionRuntime | Start, exact-resume, stop, observe and attach through Harness and the execution host. | Execution resources and observation subscriptions. | Model ports, Harness, execution host |

Controller is UI-agnostic: no keybindings, focus, layout, or terminal backend. Only Renderer knows the terminal backend. [Application composition](../src/index.ts) awaits `core.tasks.init()` before exposing the application. Callers use existing owners such as `core.tasks`, `core.store`, and `core.workspaceState` directly; Core does not mirror their APIs with forwarding methods.

## Repository Layout

`src/` uses the component boundaries as its top-level layers. A file belongs to the layer that owns its behavior, not to a catch-all utility directory.

| Directory | Component | Owns |
|---|---|---|
| `model/` | Models | Task and Session records and behavior, exact identity, readiness, dependency rules, ordering, search and filters, configuration types, domain constants, and domain errors. No direct persistence. |
| `storage/` | Storage | Model-typed persistence, record codecs and schema validation, repositories, watchers, session/group/view state, and storage errors. |
| `filesystem/` | Storage substrate | Filesystem operations, path resolution, atomic writes, locks, and git worktree access. |
| `controller/` | Controller | TasksService, Core session orchestration, workspace workflows, search and explicit initialization. |
| `runtime/` | SessionRuntime | Harness adapters, agent presets, session process and tmux management, activity/status, and workspace context. |
| `renderer/` | Renderer | OpenTUI screens, board, and presentation formatters. |
| `cli/` | CLI | Command registration, feature modules, completions, and CLI-only parsing and output. |
| `lib/` | none | Generic, domain-free helpers such as dates, slugs, POSIX path strings, regex escaping, comparison keys, process capture, and debug logging. It does not import application layers. |
| `test/` | none | Shared fixtures and cross-cutting contract/integration tests. Focused tests sit beside their owner. |
| `types/` | none | Ambient `.d.ts` declarations only. |

Rules:

- Put a change in its owner's directory. `lib/` is not a default for helpers that know task, session, storage, runtime, or presentation concepts.
- Domain behavior lives on the model that owns it. Task's identity comparison is exact string equality; its value equality and readiness operate on the record and supplied corpus, without a persistence resolver.
- Custom errors live in the `errors/` subdirectory of the layer that owns the failure.
- A new top-level directory or a new layer-crossing dependency requires a BLUEPRINT update.

## Models and Relationships

- [Task](blueprints/task.md) owns the complete task record, independent `done` indication, mode/session membership and active selection. Storage location is metadata, not task status or completion.
- [Session](blueprints/session.md) owns one retained conversation and its current execution state. SessionStore persists its history; observations remain ephemeral.
- [Configuration](blueprints/models.md#configuration) resolves accepted configuration snapshots. The project owns the mode catalogue; explicit initialization provisions its defaults.

## Component Contracts

### Detailed Pages

| Page | Owns |
|---|---|
| [Models](blueprints/models.md) | Shared types, preferences, Configuration |
| [Controller](blueprints/controller.md) | TasksService collection and writes; Core session orchestration; initialization and disposal |
| [Task](blueprints/task.md) | Task record, domain transformations, session relationships and selection |
| [Session](blueprints/session.md) | Session, RunningExecution, SessionRuntime |
| [Harness](blueprints/harness.md) | Provider-adapter interface, launch/resume/stop/observe, readiness evidence |
| [Storage](blueprints/storage.md) | Typed persistence boundary, SessionStore, locks, initialization and watchers |
| [Renderer](blueprints/renderer.md) | Views, keybindings, terminal attachment |
| [CLI](blueprints/cli.md) | Command-to-Controller mapping |
| [Signals](blueprints/signals.md) | Post-commit notifications |

## Component Interactions

1. Explicit workspace initialization provisions required storage and defaults. Ordinary application load reads that state and initializes TasksService; it starts no execution. See [load](blueprints/controller.md#load) and [resource initialization](blueprints/storage.md#initialization-and-required-state).
2. A task-edit caller acquires the task lock and receives the fresh complete record, derives its replacement, and awaits TasksService persistence under that same lock. See [Update Task](blueprints/controller.md#update-task).
3. Core coordinates task status through TasksService, persists a session reservation through SessionStore, starts through Session, then durably publishes identity. See [Create a Session](blueprints/controller.md#create-a-session).
4. Normal TUI close releases its own subscriptions and terminal presentation. The application owner disposes TasksService; force close separately invokes `Core.shutdown()`. See [shutdown](blueprints/controller.md#shutdown).

## Essential Algorithms

- [Task collection](blueprints/controller.md#load): one initial load of active, completed and archived records into an exact-`task.id` Map; affected-record updates thereafter, including immediate updates from owned commits.
- [Task edit](blueprints/controller.md#update-task): save the supplied record, advance `updatedDate`, save again, then attempt status-change work and publication. Two saves are intentional and are not a transaction.
- [Lock ownership](blueprints/storage.md#locking-and-fresh-reads): one shared mechanism keyed by actual resources; acquire before fresh reads, with one acquisition owner and no nested acquisition of the same lock.

## Architectural Invariants

### Shared Rules

- Unknown input is validated once at its accepting boundary; accepted typed objects are not repeatedly parsed across layers. Model relationship rules, storage codecs and security-boundary checks still apply. Types alone do not establish runtime validation.
- Storage owns workspace paths, record formats, codecs, locks and file watching. Its FileSystem remains private; thin forwarding at this typed boundary is legitimate. Callers may use typed locking and presentation operations without bypassing task-operation ownership. No frontend constructs workspace storage paths or holds the private filesystem.
- Runtime execution resources are not workspace persistence: provider receipts, terminal sockets and panes, process handles, logs, and user-selected input files stay with SessionRuntime, Harness, or Renderer. Those components may use filesystem or socket APIs for their own resources, but never to read or write workspace records.
- An operation's owner may initiate non-persistence I/O through its owning collaborator. Persistence belongs to Storage; Models never access it directly. Corpus validation consumes the TasksService collection, as specified by [Task](blueprints/task.md#corpus-operations).
- Task identity is the exact stored string. There are no normalized lookup keys, source-ranking resolvers or corruption-based identity recovery. Persistence collision, malformed-record, containment and symlink checks remain required.
- Required state is created by explicit workspace or new-task initialization. Ordinary reads, writes, locking and startup do not repair missing required resources or migrate old formats.
- Signals are post-commit. Handlers never call Controller mutations. Notification failures do not undo persistence or excuse skipping required cleanup; owners report partial effects and aggregate post-commit failures.
- Only an explicit Controller operation starts or resumes a session. Runtime state is observed, never persisted as history; `unknown` authorizes no destructive action.
- Create order: reserve → persist reservation → start → persist identity → publish. Startup or durable identity-publication failure requires execution cleanup before reservation rollback; if cleanup fails or the execution may still be running, keep durable tracking. Post-commit notification failure does not undo persistence.
- Terminal detach never stops execution. Ordinary app close preserves execution; force close invokes Core shutdown, which attempts every owned or rediscovered target before reporting aggregate failure. [SESSION-018](specs/sessions.md#session-018-close-the-app-with-or-without-stopping-sessions) owns the close choice and reopen behavior.
- Renderer and CLI invoke the same operation owners; task writes always pass through TasksService and session-history writes through SessionStore.
- The project-wide soft limit never blocks a start. It stops only positively idle sessions, longest continuously idle first; working, permission-waiting and unknown sessions are protected.
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

Provider-specific readiness evidence must satisfy the [Harness evidence contract](blueprints/harness.md#required-evidence); an adapter's inability to supply it does not relax the gate. Record and execution-port declarations are linked from their owning pages rather than treated as unresolved architecture.
