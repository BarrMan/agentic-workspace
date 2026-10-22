# Renderer

Part of [BLUEPRINT](../BLUEPRINT.md). Renderer owns views, keybindings, focus, layout, and the terminal backend. It never implements domain rules.

## Keybindings

```ts
Renderer.bindKeys() {
  this.onKey("session.create", () => {
    this.controller.createSession(this.controller.selectedTask, this.controller.selectedMode)
  })

  this.onKey("session.resume", () => {
    this.controller.resumeSession(this.controller.selectedSession)
  })

  this.onKey("session.stop", () => {
    this.controller.stopSession(this.controller.selectedSession)
  })

  this.onKey("task.update", (change) => {
    this.controller.updateTask(this.controller.selectedTask.id, change)
  })
}

Renderer.onKey(key, handler) {
  this.keymap.set(key, handler)
}
```

## Render

```ts
Renderer.render(view) {
  this.activeView = view
  this.paint(view, this.controller.tasks, this.controller.selectedTask)
}
```

## Terminal Attachment

```ts
Renderer.attach(session) {
  attachment = this.sessionRuntime.attach(session)
  this.terminal.mount(attachment)
  return attachment
}

Renderer.detach(attachment) {
  this.terminal.unmount(attachment)
  this.sessionRuntime.detach(attachment)
}
```

## Invariants

- Only Renderer knows the terminal backend.
- Keybindings call Controller methods only.
- Renderer may use filesystem or socket APIs for its own terminal transport, but never reads workspace records or constructs workspace storage paths.
- Detach never stops execution.
- The close modal follows [Workspace](../screens/workspace.md#focus-and-constrained-terminals); execution lifetime is owned by [SESSION-018](../specs/sessions.md#session-018-close-the-app-with-or-without-stopping-sessions) and [Controller close/shutdown](controller.md#shutdown).
