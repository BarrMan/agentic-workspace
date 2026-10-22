# Signals

Part of [BLUEPRINT](../BLUEPRINT.md). Signals are post-commit notifications from Controller to Renderer. Renderer queries Controller for data; handlers never call Controller operations.

## Signals Class

```ts
class Signals {
  // publish delivers a post-commit notification to every subscriber for this signal.
  // It does not call Controller operations or mutate models.
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
