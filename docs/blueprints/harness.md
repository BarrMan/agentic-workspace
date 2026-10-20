# Harness

Part of [BLUEPRINT](../BLUEPRINT.md). Harness is the provider-adapter boundary owned by [SessionRuntime](session.md). SessionRuntime depends only on the `HarnessProvider` execution boundary below; each provider supplies an implementation. Harness selection is configuration, never a branch inside SessionRuntime.

Provider adapters implement the internal `HarnessInterface` contract in `src/runtime/agents/core/agent.ts` (command construction, preparation, hooks, and identity capture). The explicit startup list in `src/runtime/agents/startup.ts` registers those adapters. `HarnessProvider` is the narrower runtime boundary that launches and resumes an execution.

## Responsibility

Harness owns one provider execution attempt. It turns a provider-neutral request into a live `RunningExecution` and owns every provider-specific step:

- resolve the executable, version, arguments, environment, and launch profile;
- prepare provider resources and the execution host;
- create the process or pane and capture its resources;
- establish the provider conversation identity;
- wait for positive initialization evidence;
- deliver the initial instructions exactly once;
- wait for initial-instruction acceptance;
- expose observation and stop;
- clean up completely when launch or resume fails.

Harness does not decide task, mode, session, selection, or persistence state. It does not render terminals or own keybindings. SessionRuntime passes resolved data in; Harness returns an execution handle or throws.

Harness may read and write its own provider receipts, resource files, sockets, and process handles. It never reads or writes workspace records or constructs workspace storage paths.

## Interface

```ts
interface HarnessProvider {
  launch(request: LaunchRequest): Promise<RunningExecution>
  resume(providerSessionId: string, request: ResumeRequest): Promise<RunningExecution>
  stop(execution: RunningExecution): Promise<void>
  observe(execution: RunningExecution): Promise<RuntimeEvidence>
}
```

`RunningExecution` and `RuntimeEvidence` are defined in [Session](session.md#types). `TaskId`, `ModeId`, `SessionId`, and `ResolvedConfig` are defined in [Models](models.md).

### Launch request

```ts
type LaunchRequest = {
  taskId: TaskId
  modeId: ModeId
  sessionId: SessionId
  path: string
  instructions: string
  configuration: ResolvedConfig
}
```

| Field | Meaning |
|---|---|
| `taskId`, `modeId`, `sessionId` | Correlation identity for the execution. |
| `path` | Working directory or worktree the provider starts in. |
| `instructions` | Initial prompt; delivered exactly once by `launch`. |
| `configuration` | Resolved mode configuration, including the selected harness preset. Harness reads provider settings; it does not resolve precedence or re-read project configuration. |

```ts
type ResumeRequest = Omit<LaunchRequest, "instructions">
```

Resume targets exactly `providerSessionId`. It never chooses a new conversation and never replays the initial instructions.

## Required evidence

Every harness must establish the same positive evidence, regardless of provider:

| Evidence | Must prove |
|---|---|
| Identity | A provider conversation ID correlated with the local session. |
| Initialization | The provider is ready for input. |
| Prompt acceptance | The initial instructions were accepted, not answered. |
| Resume | The exact retained conversation is initialized. |
| Failure | The execution is stopped and resources are released before the error is thrown. |
| Observation | Turn completion, permission wait, execution exit, and activity where the provider supports them; otherwise `unknown`. |

Provider receipt paths, event names, executable names, flags, environment variables, and readiness deadlines stay in the adapter.

## Operation contract

### `launch`

- Returns only after identity, initialization, and initial-prompt acceptance are positively observed.
- Delivers the initial instructions exactly once.
- Never returns a handle with unknown provider identity.
- On failure, stops the execution, releases resources, and throws. One attempt only; no retry.

### `resume`

- Requires a non-empty exact `providerSessionId`.
- Starts the retained conversation without sending the initial instructions again.
- Returns only after resume initialization is positively observed.
- On failure, stops the execution, releases resources, and throws. One attempt only; no retry.

### `stop`

- Stops the actual process or pane and releases captured resources.
- Is idempotent.
- A metadata write is not proof of stop.

### `observe`

- Maps provider evidence to `RuntimeEvidence`.
- Returns `unknown` when evidence is insufficient.
- Never infers `running` or `stopped` from absence, and never changes Session state.

## Harness-agnostic rules

- SessionRuntime never branches on provider name.
- No provider-specific field appears in Session or SessionRuntime.
- A new harness implements this interface and its evidence; it does not require SessionRuntime changes.
- A provider ID alone proves neither liveness nor resumability.
- Provider-specific lifecycle events are normalized at the Harness boundary; Session consumes only `RuntimeEvidence`.

## Non-goals

Task and Mode business rules, selection, persistence, Controller operations, terminal rendering, keybindings, and soft-limit eviction are outside Harness.
