# AgenticWorkspace — Behaviour Specification

This is the authoritative behaviour contract for `agentic-workspace`. Where an older
document disagrees with this one, this one wins. Superseded (kept for history only):
[`opentui-workspace-spec.md`](./opentui-workspace-spec.md),
[`opentui-workspace-session-contract.md`](./opentui-workspace-session-contract.md),
[`modes-phase1-contract.md`](./modes-phase1-contract.md),
[`modes-delivery-plan.md`](./modes-delivery-plan.md).

The session-service redesign is the operative *design and execution* authority for the shared
agent-session backend: [`session-service-redesign.md`](./session-service-redesign.md)
(target design) and
[`session-service-redesign-correction-plan.md`](./session-service-redesign-correction-plan.md)
(execution). The
[`session-service-redesign-implementation-plan.md`](./session-service-redesign-implementation-plan.md)
is superseded wherever they conflict. This document remains the *behaviour* contract for that
backend, except for the explicitly approved creation-rollback change.

This document states rules and points at the code that implements them. It is not a code
description; read the referenced `file:line` for mechanics.

### Current-contract-only policy

The current specification and target design define the supported application. We do not maintain legacy code or backward-compatibility paths. Existing callers, tests, historical behavior, and bounded work assignments do not authorize exceptions.

Where the specification or design is incomplete or unclear, resolve the gap in the owning document rather than preserving an older implementation as an alternative. If you believe backward compatibility is needed, you MUST explicitly ask the user whether backward compatibility is wanted before acting. Do not infer permission from existing code or from an earlier plan.

Preserving user data is a separate obligation. This policy does not authorize deleting, resetting, rewriting, or making existing persisted data unusable. If a proposed contract change affects stored data, identify the affected artifacts and obtain the user's decision about preservation and manual conversion before changing them. Do not introduce compatibility or migration code without an explicit user decision changing this policy.

## 1. Scope

The native terminal workspace (`agentic-workspace workspace`, interactive board), the shared
durable agent-session backend, and the CLI/MCP surfaces that act on the same state. Ownership is
defined by the [target design's ownership table](./session-service-redesign.md#ownership); the
renderer emits intent only.

## 2. Modes and configuration

- **Sessions live per mode.** A task's durable session state is a map from mode id to a session
  history (`TaskSessions.modes`, `src/agent-workspace/types.ts:276-283`; read/write at
  `src/agent-workspace/session-store.ts:444-483`). The flat `sessions` / `activeSessionId` fields
  are a serialization mirror, not a second home (`session-store.ts:469-471`).
- **`Tab` cycles modes.** Cycling changes the selected mode for the selected task only; it never
  launches, resumes, or stops anything (`src/ui/opentui/workspace-controller.ts:2052`; binding
  `src/ui/opentui/keybindings.ts:193`).
- **Configuration is always the current one.** Every launch, resume, and ask resolves the mode
  profile and preset from the current configuration; nothing is restored from an immutable
  creation-time snapshot, and mode configuration is never merged across snapshots. A session
  record stores its native identity and preset name, not commands, environment, or profile
  snapshots (`AgentSession`, `src/agent-workspace/types.ts:242-268`).
- **A mode's sessions are never merged into another mode.** Deleting a mode does not fold its
  sessions into a destination mode.
- The mode catalog is project-scoped and must exist for the workspace to start; there is no
  built-in, root, or card catalog fallback (`src/agent-workspace/config.ts`).

## 3. Session state and the active-session invariant

- Durable statuses are `starting`, `running`, `parked`, `stopped`, `failed`
  (`src/agent-workspace/types.ts:102-114`). `error` is **not** durable — it is a UI-local
  presentation state.
- **Invariant:** a mode with one or more sessions ALWAYS has a valid `activeSessionId` pointing at
  one of its sessions. It is enforced on every write (`src/agent-workspace/session-store.ts:461-467`).
  - Creating a session makes it active in the same write
    (`src/agent-workspace/sessions.ts:1845-1852`).
  - Hand-off makes the successor active.
  - Stop moves the pointer to another surviving session, and keeps the stopped record as the
    pointer when it is the only session (`sessions.ts:1932-1934`).
  - Eviction, deletion, and rollback keep a valid pointer (`sessions.ts:1877-1890`).
- A mode with zero sessions has no active pointer, no dot, and no header.

## 4. Status vocabulary

| Durable status | Meaning |
|---|---|
| `starting` | A record is reserved and a launch is in flight. |
| `running` | The agent process is live for this session. |
| `parked` | The process is released but the conversation is retained and resumable. This is **not** an ended state. The name is misleading: users see this as *idle work*, rendered as the blue dot. |
| `stopped` | The session is ended; `endedAt` is set (`sessions.ts:1929-1930`). |
| `failed` | The launch did not succeed (`sessions.ts:1894-1896`). |

`error` is a UI-local state used when an attach or runtime inspection fails
(`workspace-controller.ts:1690-1691`); it is never written to durable session state as a status.

## 5. Selection and preview

Selecting a task shows the selected mode's active session. Selecting does not create a session and
does not mutate lifecycle except as noted:

- **Running** → attach the real terminal, passively: no `Enter`, no start, no resume, no ownership
  change (`workspace-controller.ts:1356-1384`).
- **Parked (released)** → auto-resume the exact stored conversation
  (`workspace-controller.ts:1322-1330`).
- **Starting** → stay passive; attach or resume only once it is usable
  (`workspace-controller.ts:1322-1323`).

With **no session in the mode**:

- the header is hidden;
- the body placeholder is exactly `` No session in <mode> `` (`src/ui/opentui/workspace.ts:677`);
- the footer cue is `[<select shortcut>] Start` (`workspace.ts:697`; shortcut
  `src/ui/opentui/keybindings.ts:201,273`).

With an **ended session** (an active session whose status is `stopped`): one body line,
`` Session ended · press <key> to resume ``, where `<key>` is the configured shortcut for starting
or resuming that mode's session.

All of the above happens on app start with no keypress.

## 6. Header, dots, footer

- **Header.** Exactly one line: `` Agent session · <mode> · <status> ``
  (`src/ui/opentui/workspace.ts:669-671`). Hidden when the mode has no active session.
- **Dots.** One dot per task row, belonging to that task's active session in the **currently
  selected mode** (`workspace-controller.ts:884-891`; rendering `workspace.ts:586-622`). The dot is
  coloured by the session's **activity events**, never by its durable lifecycle status:
  - green = actively working (we are waiting on it);
  - orange = waiting on the user (for example, asking for permissions);
  - blue = idle — it was running and is now doing nothing (the durable state confusingly named
    `parked` is exactly this case);
  - grey = ended;
  - red = error.

  Mapping lives at `workspace-controller.ts:218-223` and
  `src/agent-workspace/types.ts:140-169`; colours at `src/formatters/status-icon.ts:88-122`.
  A mode with no active session renders no dot.
- The footer shows essential actions for the current focus; the full list lives in help.

## 7. Starting, resuming, and hand-off

- **Starting** creates a session and makes it active in the same durable write (see §3). The UI and
  the CLI behave identically for the same action — there is no differentiation — and starting a
  session from either moves the task to the configured In Progress status
  (`src/agent-workspace/workspace-state.ts:92-112`). A terminal (`Done`) task is never moved.
- **Resume always continues the same conversation.** If an exact resume is impossible (auto-resume
  disabled, or a previous resume attempt failed), the app surfaces the reason and asks; it never
  silently starts a fresh conversation. A fresh conversation starts only on an explicit affirmative
  choice (`workspace-controller.ts:1472-1494`).
- **Hand-off.** The successor is a distinct session. It is launched and confirmed running FIRST,
  and the explicitly captured predecessor is ended only if `nativeWorkspace === true`, through
  the ordinary verified stop path (`AgentSessionService.finalizeHandoff` / `stopClaimedSession`
  in `src/agent-workspace/sessions.ts`). Unflagged predecessors remain running. The TUI captures
  its local predecessor separately from the durable active pointer; another client's selection
  never chooses the runtime to retire (`workspace-controller.ts`, `#handoffLocalSession`).
  Launch failure preserves the predecessor's record and runtime and restores the prior active
  pointer only while the successor is still selected (`rollbackHandoff`). Retirement failure
  reports "successor running; predecessor cleanup failed" without rolling back or killing the
  successor. If a launch fails *after* dispatch, the successor settles
  `failed` unless its pane is confirmed live, in which case it settles `running`
  (`settleDispatchedLaunchFailure`).
- **Queued hand-off** carries the captured predecessor identity, mode, and rollback selection
  in the existing `WorkspaceRequest` marker (`src/agent-workspace/workspace-context.ts`). Adoption
  validates these references and can finalize an already-live successor without relaunching it;
  the marker is consumed after successful finalization (`prepareNativeSessionLocked`).

## 8. Lifecycle at the edges

- **App exit = detach only.** On close, each live host is detached; nothing is stopped, parked, or
  killed; durable records stay `running`; the active pointer is untouched; the tmux pane survives
  (`workspace-controller.ts:1970-1986`; `src/agent-workspace/live/agent-host.ts:13`).
- **Crash = the same.** No cleanup runs; the tmux pane survives; a stale record settles to
  `stopped` lazily on first observation.
- **Explicit stop** kills the pane, writes `stopped` + `endedAt`, and moves the active pointer to a
  surviving session (`sessions.ts`, `stopClaimedSession`).
- **Park has no production trigger today.** The explicit park operation has no caller
  (`WorkspaceStateService.parkSession`; `AgentSessionService.parkNativeSession`). Hand-off never
  parks a predecessor.
- **Recovery is lazy.** Bulk settling of stale records happens only through the explicit
  `agentic-workspace agent-session reconcile <taskId>` command
  (`src/commands/agent-workspace.ts:255-258`).

## 9. Task lifecycle and deletion

- **Task deletion is forget-only.** It removes the session records, history, sidecars, and the
  session state directory. It does **not** stop a running agent — the agent keeps running orphaned
  — and it does **not** remove the worktree (`src/core/task-lifecycle-service.ts:156-179`;
  `sessions.ts:726`). See the known gap in §12.
- **Completion** is a separate operation: it cleans the task's sessions and removes the task's
  worktree (`task-lifecycle-service.ts:226-245`).

## 10. Tasks, list, and UI/CLI parity

- The UI and the CLI behave identically for the same action; the surface does not change the
  result (§7).
- The task list is **one grouped list** (`src/ui/opentui/groups.ts`, mounted at
  `workspace.ts:24,272-299`) with a **35-column cap** — not status tabs and not a percentage width
  (`workspace.ts:73-88`).

## 11. Testing

The suite is valid only under `bun test --parallel` (`package.json:40`). Running many test files
in one process produces false failures because a test registers a global agent name that leaks
between files (`src/test/agent-test-helpers.ts:19-27`). The test preload owns isolation; see
[`test-suite-runtime-report.md`](./test-suite-runtime-report.md).

## 12. Known gaps

These are current defects, not intended behaviour:

- Task deletion orphans a live agent (the running process is not stopped; §9;
  `src/core/task-lifecycle-service.ts:165`).
- The session picker cannot open an externally running session
  (`src/ui/opentui/session-picker.ts:88`).
- A late launch can steal task selection back (`workspace-controller.ts:2021-2033`).
- The background liveness sweep skips tasks that were never opened
  (`src/ui/opentui/workspace-controller.ts:744`).
- Mode and approval badges appear only on the selected row
  (`src/ui/opentui/mode-row-label.ts:52`).
- The startup prompt appends mode-profile text, whereas the contract promises identity only
  (`src/agent-workspace/bootstrap.ts:33` vs `src/agent-workspace/agents/profile.ts:234`).

## 13. References

- [`opentui-workspace-spec.md`](./opentui-workspace-spec.md) — superseded design + TTT/AOE composition references.
- [`opentui-workspace-session-contract.md`](./opentui-workspace-session-contract.md) — superseded session contract + ownership detail.
- [`modes-phase1-contract.md`](./modes-phase1-contract.md) — superseded mode/artifact data contracts.
- [`modes-delivery-plan.md`](./modes-delivery-plan.md) — superseded delivery plan.
- [`test-suite-runtime-report.md`](./test-suite-runtime-report.md) — test isolation and runtime.
