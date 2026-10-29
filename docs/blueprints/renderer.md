# Renderer

Part of [BLUEPRINT](../BLUEPRINT.md). Renderer owns views, keybindings, focus, layout and the terminal backend. It invokes the [Controller owners](controller.md#state) and model transformations rather than implementing domain rules. [WorkspaceController](../../src/renderer/opentui/workspace-controller.ts) owns the TUI lifetime.

## Keybindings

Key actions use the same owners as CLI: `core.tasks` for task operations, Core for session orchestration, and the existing workspace/mode workflow owners for their operations. The command handlers do not route through duplicate Core forwarding methods.

An explicit task edit validates unknown input at its accepting UI boundary, obtains the fresh complete task through `core.storage.withTaskLock`, derives the replacement using model behavior where applicable, and awaits `core.tasks.edit(task)` before release. The [task-write contract](controller.md#update-task) owns timestamp, hook and event behavior; Renderer does not merge a partial record inside a persistence service.

Session actions use `Core.newSession`, `resumeSession` and `stopSession`. Selecting a parked session attaches to its live execution; only an explicit start/resume action starts execution. [Session interaction](../specs/session-interaction-and-feedback.md) owns the user-visible behavior.

## Render

Renderer consumes the initialized TasksService collection and existing workspace projections. It owns its task, configuration, group, view-state and runtime-monitoring subscriptions. Task updates arrive through `core.tasks.subscribe`; Storage owns filesystem watching and path/glob details. Renderer does not rescan storage or choose a different task identity based on source location.

## Terminal Attachment

Renderer requests `SessionRuntime.attach(record)` with the retained AgentSession record and mounts the returned TerminalAttachment in its terminal backend. It owns unmounting and awaits `SessionRuntime.detach(attachment)` when releasing presentation. [Workspace session interaction](../../src/renderer/opentui/workspace-sessions.ts) composes attachment with Core's observed-session and close operations.

## Invariants

- Only Renderer knows the terminal backend.
- Keybindings invoke the existing operation owners; typed Storage lock/presentation APIs do not bypass TasksService task-write policy.
- Renderer may use filesystem or socket APIs for its own terminal transport, but never reads workspace records or constructs workspace storage paths.
- Detach never stops execution.
- Normal TUI destruction unsubscribes and disposes only its owned presentation/monitoring resources. It does not dispose the shared TasksService. The application owner ends that service's lifetime separately; force close awaits `Core.shutdown()` for execution cleanup.
- The close modal follows [Workspace](../screens/workspace.md#focus-and-constrained-terminals); execution lifetime is owned by [SESSION-018](../specs/sessions.md#session-018-close-the-app-with-or-without-stopping-sessions) and [Controller close/shutdown](controller.md#shutdown).
