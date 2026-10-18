# CLI

Part of [BLUEPRINT](../BLUEPRINT.md). CLI maps supported commands to Controller operations. It does not touch models or storage directly.

## Run

```ts
CLI.run(argv) {
  command = this.parse(argv)

  switch (command.name) {
    case "task.update":
      this.controller.updateTask(command.taskId, command.change)
      return 0

    case "session.create":
      task = this.controller.tasks.get(command.taskId)
      mode = this.controller.modes.get(command.modeId)

      if (!task || !mode) {
        this.printUsage()
        return 1
      }

      this.controller.createSession(task, mode)
      return 0

    case "session.resume":
      session = this.controller.findSession(command.sessionId)

      if (!session) {
        this.printUsage()
        return 1
      }

      this.controller.resumeSession(session)
      return 0

    default:
      this.printUsage()
      return 1
  }
}
```

## Invariants

- CLI validates parsed command input before calling Controller.
- CLI calls the same Controller methods as Renderer.
- `session.resume` resolves retained stopped sessions, not only live sessions.
- CLI never reads or writes Storage directly.
