# Signals

Part of [BLUEPRINT](../BLUEPRINT.md). Signals are post-commit notifications from operation owners to Renderer. Renderer queries those owners for data; handlers never initiate Controller mutations. The synchronous [Signals implementation](../../src/controller/signals.ts) attempts every subscriber and aggregates delivery failures.

## Signals Class

```ts
class Signals {
  // publish delivers a post-commit notification to every subscriber for this signal.
  // It does not initiate Controller mutations or mutate models.
  publish(name, ...payload) { /* transport implementation */ }

  // subscribe registers a handler and returns an unsubscribe function.
  subscribe(name, handler) { /* transport implementation */ }
}
```

## Signals

| Signal | Payload | When |
|---|---|---|
| `TasksChanged` | whole Task or TaskId | task changed |
| `SelectionChanged` | TaskId, SessionId | domain selection changed |
| `DetailsChanged` | whole model or details | details changed |
| `PreviewChanged` | SessionId or preview data | preview target changed |
| `IndicationsChanged` | SessionId, SessionState, SessionActivity | runtime/activity indication changed |
| `NoticeChanged` | Notice | result or error |
| `ViewChanged` | View | explicit navigation |
| `Closed` | none | app close completed; force-close shutdown succeeded if requested |

## Commit and Failure Semantics

- Task writes and task-change publication belong to TasksService. `update(task)` intentionally emits no event; `edit(task)` publishes only after both saves succeed. [Update Task](controller.md#update-task) owns the exact timestamp/hook sequence and first-save partial outcome.
- Publication follows the owning operation's successful durable write or committed in-memory transition directly. There is no global deferred post-commit transaction/collector.
- Failed persistence publishes no success for that failed write. A subscriber failure does not undo a committed record or prevent other subscribers from being attempted.
- Multi-effect owners collect notification errors locally while completing required cleanup, reference writes and configuration/journal work. They report primary and post-commit failures with completed effects; they do not imply atomic rollback.
- TasksService collection observers are separate from synchronous Signals. Their asynchronous callbacks are all attempted and failures aggregated. Consumers own their unsubscribe functions; application-owned service disposal is separate from normal TUI close.
