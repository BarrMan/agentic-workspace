# Harness

Part of [BLUEPRINT](../BLUEPRINT.md). Harness is the provider-adapter boundary owned by [SessionRuntime](session.md). SessionRuntime depends only on the `HarnessProvider` execution boundary below; each provider supplies an implementation. Harness selection is configuration, never a branch inside SessionRuntime.

Provider adapters implement the internal [HarnessInterface](../../src/runtime/agents/core/agent.ts) contract (command construction, preparation, hooks and identity capture). The explicit [startup list](../../src/runtime/agents/startup.ts) registers those adapters. `HarnessProvider` is the narrower runtime boundary that launches and resumes an execution.

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

Launch inherits the parent environment unchanged. The workspace sets child identity and the selected tmux socket explicitly; Harness/adapters and preset values cannot replace these protected values. No environment variables are stripped. Inherited credentials are exposed to the child as an accepted consequence. Process identity for termination is PID plus process name, without a start-time or UID fence; inspection failure or unknown identity fails closed and never authorizes termination or clean completion. Same-name PID reuse is an accepted limitation.

## Interface

```ts
interface HarnessProvider {
  launch(context: SessionLaunchContext): Promise<RunningExecution>
  resume(nativeId: string, context: SessionLaunchContext): Promise<RunningExecution>
}
```

The actual port and execution types are declared in [model/session/types.ts](../../src/model/session/types.ts). Stop and observation are operations on the returned RunningExecution, exposed to Session through [SessionRuntime](session.md#sessionruntime); they are not additional HarnessProvider facade methods.

### Launch request

| Field | Meaning |
|---|---|
| `taskId`, `modeId`, `sessionId` | Correlation identity for the execution. |
| `record` | Retained AgentSession record and its launch references. |
| `cwd` | Working directory derived from the task's work context. |
| `prompt` | Initial prompt; delivered exactly once by `launch`, never replayed by resume. |
| `configuration`, `profile`, `preset` | Resolved configuration and selected mode/preset. Harness consumes these accepted values; it does not resolve precedence or re-read project configuration. |

Resume targets exactly the supplied native conversation ID. It never chooses a new conversation and never replays the initial instructions, even though the common context type contains a prompt.

## Required evidence

Every harness must establish the same positive evidence, regardless of provider:

| Evidence | Must prove |
|---|---|
| Identity | A provider conversation ID correlated with the local session. |
| Initialization | The provider is ready for input. |
| Prompt acceptance | The initial instructions were accepted, not answered. |
| Resume | The exact retained conversation is initialized. |
| Failure | Actual cleanup outcome, including retained execution/resource identity when cleanup cannot be proven. Never claim a clean stop from missing evidence. |
| Observation | Turn completion, permission wait, execution exit, and activity where the provider supports them; otherwise `unknown`. |

Provider receipt paths, event names, executable names, flags, environment variables, and readiness deadlines stay in the adapter.

## Operation contract

### `launch`

- Returns only after identity, initialization, and initial-prompt acceptance are positively observed.
- Delivers the initial instructions exactly once.
- Never returns a handle with unknown provider identity.
- On failure, attempts actual stop and resource cleanup, then throws with cleanup failures and any remaining execution evidence. Core retains durable tracking when cleanup is failed or uncertain. One attempt only; no retry.

### `resume`

- Requires a non-empty exact native conversation ID.
- Starts the retained conversation without sending the initial instructions again.
- Returns only after resume initialization is positively observed.
- On failure, attempts actual stop and resource cleanup and retains evidence for any uncertain execution in the thrown failure. One attempt only; no retry.

### Execution `stop`

- Stops the actual process or pane and releases captured resources.
- Is idempotent.
- A metadata write is not proof of stop.

### Execution `observe`

- Publishes normalized `RunningExecutionEvent` evidence through a subscription, with supported capabilities declared by the execution.
- Unsupported or insufficient evidence leaves the corresponding Session indication unknown.
- Never infers `running` or `stopped` from missing evidence. Session, rather than the adapter, applies evidence to its runtime state.

## Harness-agnostic rules

- SessionRuntime never branches on provider name.
- Provider-specific launch/readiness mechanics stay out of Session and SessionRuntime; retained native identity is data, not a branch on provider name.
- A new harness implements this interface and its evidence; it does not require SessionRuntime changes.
- A provider ID alone proves neither liveness nor resumability.
- Provider-specific lifecycle events are normalized at the execution boundary; Session consumes only supported normalized evidence.

## Non-goals

Task and Mode business rules, selection, persistence, Controller operations, terminal rendering, keybindings, and soft-limit eviction are outside Harness.
