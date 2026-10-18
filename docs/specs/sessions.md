# Product Requirements: Sessions

## Overview

Sessions let users launch and continue agent conversations attached to tasks, observe runtime state and live terminals, and manage lifecycle without losing identity or misrepresenting uncertain runtime evidence. This contract is indexed by [SPEC](../SPEC.md).

## Goals

- Specify observable session identity, runtime observation, startup, continuation, handoff, terminal, and deletion behavior without misrepresenting uncertain runtime evidence.

## Scope

### In Scope

- Session creation and readiness, runtime state, soft limits, stop/resume, handoff, workspace attachment, terminal input, and deletion.

### Out of Scope

- Provider-owned configuration, data, or state management and persistent historical lifecycle labels or transition logs.

## Actors

| Actor | Description |
|---|---|
| User | Starts, observes, stops, resumes, hands off, and deletes sessions. |
| Workspace | Creates and observes sessions, displays terminal state, and manages session lifecycle. |
| Agent/provider | Runs the conversation and supplies initialization, identity, and delivery acknowledgments. |

## Functional Requirements

### SESSION-001: Retain session identity and history

**Description:** A session retains its identity and conversation history.

**Trigger:** A session is created, used, or observed.

**Preconditions:** A session exists.

**Behavior:**
1. Retain identity and conversation history; derive current runtime state from observation.
2. Historical lifecycle labels, transition logs, and past stopped-versus-failed distinctions need not persist.
3. Report relevant launch progress and errors when they occur.

**Outcome:** The conversation remains identifiable and relevant launch progress/errors are reported.

**Failures:** None.

**Acceptance Criteria:**
- [ ] Session identity and conversation history persist; runtime is observed rather than inferred from historical labels, and relevant launch progress/errors are reported when they occur.

### SESSION-002: Report observed runtime state

**Description:** Runtime state distinguishes running, idle, stopped, and unknown sessions, with permission requests indicated separately. Stored state alone never establishes liveness.

**Trigger:** The workspace observes a session's runtime state.

**Preconditions:** Current runtime evidence may or may not establish liveness and activity.

**Behavior:**
1. Distinguish running, idle, stopped, and unknown sessions and indicate permission requests separately.
2. If current liveness cannot be established, report unknown or unavailable; an old record alone proves neither running nor stopped.
3. Do not stop an agent or declare it stopped on uncertain evidence.

**Outcome:** The reported state reflects current evidence without treating uncertainty as proof.

**Failures:** If current liveness cannot be established, report unknown or unavailable; do not stop the agent or declare it stopped.

**Acceptance Criteria:**
- [ ] Running, idle, stopped, and separate permission-request states are distinguished; uncertain current liveness reports unknown/unavailable and never causes a stop or stopped claim.

### SESSION-003: Refresh runtime observations

**Description:** The workspace observes every task every 30 seconds to update observed runtime state and indications. Observation never starts, resumes, stops, or retries a session.

**Trigger:** The 30-second refresh interval elapses.

**Preconditions:** Tasks are available to the workspace.

**Behavior:**
1. Observe every task every 30 seconds and update observed runtime state and indications only; do not start, resume, stop, or retry a session.

**Outcome:** Observed runtime state and indications are updated for every task at the specified interval without lifecycle actions.

**Failures:** None.

**Acceptance Criteria:**
- [ ] Every task is observed every 30 seconds; observation updates runtime state/indications only and never starts, resumes, stops, or retries a session.

### SESSION-004: Start consistently across surfaces

**Description:** Starting from the CLI or workspace has identical semantics.

**Trigger:** The user starts a session from the CLI or workspace.

**Preconditions:** A task and mode are selected; task configuration and the first-launch worktree contract can be resolved.

**Behavior:**
1. Resolve the task's [current effective configuration](configuration.md#functional-requirements), establish the required work context under the [first-launch worktree contract](tasks.md#task-013-done-and-completion), and prepare the launch environment and initial instruction/artifact context.
2. Coordinate unfinished-task status before any reservation or startup: move an unfinished task to its configured in-progress status and leave a finished task unchanged. If this change cannot complete, fail with an error before reservation or startup.
3. Reserve and persist exactly one provisional session relationship in the selected mode, making it the task's active session for that mode.
4. Start the reserved session outside the store lock; initialize the provider, establish identity, and deliver the initial instruction exactly once.
5. After supported acceptance of initial delivery and successful durable publication into the same reserved record, report creation ready without waiting for an answer.
6. Create a session only in the selected mode and store tasks, artifacts, and saved agent configuration on disk, not only in workspace memory.

**Outcome:** CLI and workspace starts behave identically using resolved configuration and disk-backed data; the selected task/mode has one new active session, ready only after startup, initialization, identity, accepted delivery, and durable publication.

**Failures:** A required status change fails the start before reservation/startup. Other startup and publication failures settle as specified in SESSION-009 and SESSION-010.

**Acceptance Criteria:**
- [ ] CLI and workspace starts have identical semantics, create only in the selected mode, select the task/mode active session, resolve effective configuration and worktree behavior, and use disk-backed task/artifact/agent configuration data.
- [ ] Creation order is configuration/context resolution, task-status coordination, one persisted provisional relationship, startup outside the lock, publication, then readiness reporting.

### SESSION-005: Coordinate task status before starting

**Description:** Starting moves an unfinished task to its configured in-progress status.

**Trigger:** The user starts a session for a task.

**Preconditions:** The task's finished/unfinished state and configured in-progress status are available.

**Behavior:**
1. Before session startup or reservation, move an unfinished task to its configured in-progress status.
2. Leave a finished task's status unchanged.

**Outcome:** Status coordination succeeds before session startup proceeds; a finished task retains its status.

**Failures:** If the required status change cannot be completed, fail the start with an error before session reservation or startup.

**Acceptance Criteria:**
- [ ] Starting moves an unfinished task to its configured in-progress status before session startup and fails with an error if that change cannot complete; a finished task's status is unchanged.

### SESSION-006: Deliver startup context once

**Description:** At launch, the agent receives the provider's startup/bootstrap delivery and artifact context exactly once.

**Trigger:** A session is launched.

**Preconditions:** Launch and artifact context are prepared.

**Behavior:**
1. Deliver the provider's startup/bootstrap content and artifact context exactly once.
2. Wait for readiness and initial delivery, not the agent's answer.

**Outcome:** Initial content is delivered once and session creation does not wait for an answer.

**Failures:** Initial-delivery failure fails creation under SESSION-009.

**Acceptance Criteria:**
- [ ] Startup/bootstrap delivery and artifact context are each delivered exactly once; readiness waits for initial delivery but not an answer.

### SESSION-007: Set explicit launch environment

**Description:** The launch environment explicitly sets workspace identity and selected-preset user variables without inherited variables from the launching process.

**Trigger:** A session launch environment is prepared.

**Preconditions:** Project, worktree, task, mode, session, and selected preset values are available.

**Behavior:**
1. Set workspace identity for project, worktree, task, mode, and session, together with selected-preset user variables.
2. Include those explicit values without inherited launching-process variables.
3. Use `AGENTIC_WORKSPACE_PROJECT_DIR`, `AGENTIC_WORKSPACE_WORKTREE_DIR`, `AGENTIC_WORKSPACE_TASK_DIR`, `AGENTIC_WORKSPACE_TASK_ID`, `AGENTIC_WORKSPACE_MODE_ID`, and `AGENTIC_WORKSPACE_SESSION_ID`; workspace-defined names use the `AGENTIC_WORKSPACE_` prefix.

**Outcome:** The agent receives the specified explicit workspace identity and selected-preset variables only.

**Failures:** None.

**Acceptance Criteria:**
- [ ] The launch environment contains explicit workspace identity and selected-preset user variables, with no inherited process variables and the specified identity names/prefix.

### SESSION-008: Restrict preset variable references

**Description:** User-defined preset variable values may reference only the three reserved workspace paths.

**Trigger:** A user-defined preset variable is configured or resolved.

**Preconditions:** Preset values and reserved workspace paths are available.

**Behavior:**
1. Permit references only to `AGENTIC_WORKSPACE_PROJECT_DIR`, `AGENTIC_WORKSPACE_WORKTREE_DIR`, and `AGENTIC_WORKSPACE_TASK_DIR`.
2. Do not allow preset values to override those reserved paths.

**Outcome:** Preset variables reference only permitted paths and cannot replace them.

**Failures:** Reject preset references outside the permitted paths and overrides of reserved paths.

**Acceptance Criteria:**
- [ ] Preset variable references are limited to the three permitted workspace paths, and reserved paths cannot be overridden.

### SESSION-009: Settle session creation failures

**Description:** Critical startup, initial-instruction delivery, or final durable publication failure fails creation and is reported.

**Trigger:** Startup, initial-instruction delivery, or final durable publication fails during creation.

**Preconditions:** A new execution may have started and must remain trackable if it could still be running.

**Behavior:**
1. Fail creation and report the error.
2. Stop or clean up any execution created by the failed attempt.
3. Roll back the provisional relationship after cleanup; repeated rollback is safe.
4. Keep durable tracking of any execution that may still be running or whose cleanup failed.

**Outcome:** Creation is not reported as successful; the provisional relationship is rolled back, and durable tracking is retained when the execution may still be running.

**Failures:** Any creation failure stops or cleans up the execution and rolls back the provisional relationship; cleanup failure retains durable tracking.

**Acceptance Criteria:**
- [ ] Startup, initial-delivery, and final-publication failures fail creation and report errors; the provisional relationship is rolled back after cleanup, and durable tracking is retained for any execution that may remain running or whose cleanup failed.

### SESSION-010: Report settlement truthfully

**Description:** Report completed effects, the original error, and any cleanup/publication errors truthfully.

**Trigger:** A session operation fails or its settlement is incomplete.

**Preconditions:** Effects may have completed and cleanup/publication may have failed.

**Behavior:**
1. Report completed effects, the original error, and cleanup/publication errors.
2. Do not imply rollback beyond the provisional-relationship rollback required after a failed creation.
3. Do not erase last tracking information for an execution that could not be stopped.

**Outcome:** Reports reflect actual effects and preserve tracking information for an unstopped execution.

**Failures:** Report cleanup/publication errors with the original error; retain tracking for an execution that may still be running.

**Acceptance Criteria:**
- [ ] Completed effects, original errors, and cleanup/publication errors are reported truthfully; no broader rollback is implied and last tracking information for an unstopped execution is retained.

### SESSION-011: Gate readiness and exact resume

**Description:** Creation is ready only after provider initialization, identity establishment, supported acknowledgment of initial instruction submission, and successful durable publication.

**Trigger:** A session is created or resumed.

**Preconditions:** Required provider evidence is supported; resume targets an exact conversation identity.

**Behavior:**
1. Require provider initialization, established identity, accepted initial instruction submission, and durable publication before creation is ready.
2. Submit initial instructions exactly once and do not wait for an answer.
3. Resume the exact conversation identity without replaying the initial prompt or sending a synthetic probe.

**Outcome:** Creation is ready only with required evidence and publication; resume continues the exact identity without replay or probe.

**Failures:** If readiness evidence, publication, or exact resume initialization is unavailable, fail under SESSION-009 and explain resume failure as required by SESSION-014.

**Acceptance Criteria:**
- [ ] Readiness requires provider initialization, established identity, accepted initial instruction submission, and durable publication; initial instructions are sent once without waiting for an answer. Resume initializes the exact identity without replay or synthetic probe.

### SESSION-012: Enforce the project-wide soft limit

**Description:** A project-wide soft limit applies across tasks, modes, workspace windows, and supported launch surfaces; a start is always allowed.

**Trigger:** A session starts while the project-wide limit is exceeded.

**Preconditions:** Runtime observations are available for eligible sessions.

**Behavior:**
1. Allow the start in all cases.
2. Stop eligible positively observed idle sessions only as needed, longest continuous idle duration first.
3. Protect working sessions, permission requests, and unknown-activity sessions from automatic stopping.
4. If no session is positively idle, allow the new session and the limit to remain exceeded.

**Outcome:** Eligible idle sessions are stopped only as needed; otherwise the session starts and the limit may remain exceeded.

**Failures:** If no session is positively idle, do not stop protected or unknown sessions; the start succeeds and the limit may remain exceeded.

**Acceptance Criteria:**
- [ ] The soft limit is project-wide and never blocks a start; only positively observed idle sessions are stopped as needed, longest continuously idle first, while protected/unknown sessions remain and the limit may stay exceeded.

### SESSION-013: Stop while retaining identity

**Description:** Stopping ends the agent while retaining its conversation identity.

**Trigger:** The user stops a retained session.

**Preconditions:** The selected session is retained.

**Behavior:**
1. End the agent while retaining its conversation identity.
2. If the stopped session was active, activate another retained session when one exists.

**Outcome:** The agent is stopped, identity remains, and an available retained session becomes active as applicable.

**Failures:** Report completed effects and the error.

**Acceptance Criteria:**
- [ ] Stopping ends the agent but retains identity; if it was active, another retained session becomes active when available.

### SESSION-014: Resume the exact conversation

**Description:** Resuming continues the same conversation using current effective configuration.

**Trigger:** The user resumes a retained session.

**Preconditions:** The selected session has an exact conversation identity.

**Behavior:**
1. Validate relevant native cleanup targets before any batch stop effects, then continue the same conversation using current effective configuration.
2. If exact resume is impossible, explain why and ask the user what to do.
3. Starting a new conversation requires explicit user agreement and is never an automatic resume fallback.

**Outcome:** Resume continues the exact conversation, or the user is asked how to proceed if it is impossible.

**Failures:** If exact resume is impossible, fail with an explanation and ask; do not automatically start a new conversation.

**Acceptance Criteria:**
- [ ] Resume continues the same conversation under current effective configuration; impossible exact resume explains and asks, and a new conversation requires explicit agreement.

### SESSION-015: Validate batch cleanup

**Description:** Before batch cleanup stops any relevant native target, all relevant native targets are validated.

**Trigger:** Task or mode deletion requires batch cleanup of native targets.

**Preconditions:** All relevant native targets can be identified.

**Behavior:**
1. Validate every relevant target before cleanup effects; a preflight rejection occurs before effects.
2. If cleanup fails, report completed effects and the error.
3. Cleanup precedes removal of relationships and tracking evidence as required by [task deletion](tasks.md#task-015-destructive-task-deletion) or [mode deletion](configuration.md#config-013-catalogue-deletion-and-task-fallback).

**Outcome:** Cleanup occurs only after successful validation and precedes required relationship/tracking removal.

**Failures:** Reject failed preflight before cleanup effects; if a cleanup step fails, report completed effects and the error.

**Acceptance Criteria:**
- [ ] Batch cleanup validates every relevant native target before effects; failed preflight has no effects, and cleanup precedes relationship/tracking removal where required.

### SESSION-016: Handoff to a successor

**Description:** Handoff creates a distinct successor session owned by this app instance.

**Trigger:** The user requests handoff to a distinct successor session.

**Preconditions:** A predecessor is eligible for retirement only when it belongs to this app instance.

**Behavior:**
1. Start and durably publish the successor, establishing that it is running, before ending an eligible predecessor owned by this app instance.
2. If a step fails or is interrupted, report the error and completed effects.
3. Keep the predecessor intact if successor creation fails; keep a successfully published successor if predecessor retirement fails.
4. The only rollback is creation-publication rollback defined in SESSION-009/010.

**Outcome:** The successor is confirmed before retiring an eligible predecessor owned by this app instance.

**Failures:** Successor creation failure leaves the predecessor intact; predecessor retirement failure leaves the successfully published successor running. Report errors and completed effects.

**Acceptance Criteria:**
- [ ] Handoff creates a distinct successor, retires only predecessors owned by this app instance after durable running confirmation, preserves predecessor on successor failure and successor on predecessor-retirement failure, with no rollback beyond SESSION-009/010.

### SESSION-017: Display the live terminal

**Description:** The workspace displays the agent's live terminal, seeded from its current screen and updated while it runs.

**Trigger:** The workspace attaches to a live session.

**Preconditions:** A live terminal screen is available.

**Behavior:**
1. Seed the display from the current screen and show updates while the agent runs.
2. Keep retained conversation history and the [ask operation](supported-integration-operations.md#supported-integration-operations) separate from terminal capture.

**Outcome:** The terminal reflects its current screen and subsequent updates without conflating history or ask operation with capture.

**Failures:** None.

**Acceptance Criteria:**
- [ ] The live terminal is seeded from the current screen and updated while running; conversation history and ask operation remain separate from terminal capture.

### SESSION-018: Stop sessions when the app closes

**Description:** Normal app close stops every session; all harness processes and terminal panes are gone. On reopen, every session is stopped and must be resumed explicitly. Detaching alone never stops execution. A crash is not a normal close and cleanup cannot be guaranteed; on reopen, current evidence decides liveness and stored state never proves running.

**Trigger:** The user closes the app, or the app reopens after a crash.

**Preconditions:** Sessions may be running when the app closes or crashes.

**Behavior:**
1. On normal app close, stop every session and ensure all harness processes and terminal panes are gone.
2. On reopen after normal close, treat all sessions as stopped; each requires explicit exact-conversation resume before use.
3. Detaching alone never stops execution.
4. A crash does not guarantee cleanup. On reopen after a crash, establish liveness only from current evidence; stored state never proves running, and uncertain evidence is unknown.

**Outcome:** Normal app close leaves no session runtime; after reopen all sessions require explicit resume. After a crash, only current evidence determines reported liveness.

**Failures:** If close cleanup or post-crash liveness cannot be established, report the failure or unknown/unavailable under SESSION-002; never claim stopped or running from uncertain or stored evidence.

**Acceptance Criteria:**
- [ ] Normal app close stops every session and leaves no harness process or terminal pane; on reopen each is stopped and requires explicit exact-conversation resume.
- [ ] Detach alone does not stop execution.
- [ ] After a crash, cleanup is not assumed; current evidence alone determines liveness and stored state never proves running.

### SESSION-019: Settle terminal input on close or deletion

**Description:** On app close or task deletion, terminal input already in flight is allowed up to two seconds to land before session shutdown completes.

**Trigger:** The app closes or a task is deleted while terminal input is queued or in flight.

**Preconditions:** Terminal input may have been dispatched or remain queued.

**Behavior:**
1. Allow input already in flight up to two seconds to land.
2. Discard text never dispatched and report it as not sent.
3. Distinguish unsent queued input from uncertain in-flight delivery; never automatically resend.

**Outcome:** Input settlement is reported accurately and no text is automatically resent.

**Failures:** If in-flight input does not land within the two-second allowance, report uncertain delivery; do not automatically resend.

**Acceptance Criteria:**
- [ ] Closing or deleting allows dispatched input up to two seconds to land; undispatched text is discarded and reported not sent, uncertain in-flight delivery is distinguished, and automatic resend never occurs.

### SESSION-020: Delete a session safely

**Description:** Deletion is refused while the session's agent is running.

**Trigger:** The user requests session deletion, optionally with force.

**Preconditions:** Runtime evidence is sufficient to determine whether the agent is running.

**Behavior:**
1. Refuse deletion while the agent is running unless force is requested.
2. With force, kill the agent before removing workspace-owned session records/resources.
3. Never modify provider-owned configuration, data, or state; runtime-evidence constraints continue to apply.

**Outcome:** A running agent is not orphaned by session removal and provider-owned state remains untouched.

**Failures:** Refuse non-forced deletion of a running session; apply runtime-evidence constraints when liveness is uncertain.

**Acceptance Criteria:**
- [ ] Deletion of a running session without force is refused; with force, kill precedes removal of workspace-owned records/resources, and provider state remains untouched.

## States and Transitions

### Loaded session states

**States:**

| State | Meaning |
|---|---|
| Running | A live session actively processing. |
| Parked | A loaded session with a live harness, process, and terminal pane, but no active turn. Selecting it switches presentation to its live pane; it is not resumed or restarted. |
| Stopped | No harness, process, or pane. The session must be explicitly resumed as the exact retained conversation before use. |
| Starting | Startup is in progress; the session is unavailable until usable and is never presented as running. |
| Unknown | Current evidence is insufficient; never infer running or stopped. |

Parked is a loaded runtime state, distinct from stopped. Activity indications are separate from lifecycle state: selecting or observing a session updates the task-row session indication, not the selected-session lifecycle.

### Observed runtime state

**States:**

| State | Meaning |
|---|---|
| Running | Current observation establishes that the agent is running and actively processing. |
| Idle | Current observation establishes an idle session; eligible for soft-limit stopping. |
| Stopped | Current evidence establishes that the agent is no longer running. |
| Unknown/unavailable | Current liveness or activity cannot be established; this never authorizes a stop or a stopped claim. |
| Permission request | Reported separately from running/idle/stopped activity and protected from automatic stopping. |

**Transitions:**

| From | Trigger | To | Required Behavior |
|---|---|---|---|
| Any observed state | Runtime refresh or lifecycle operation | Running, idle, stopped, or unknown/unavailable | Report only what current evidence establishes; uncertainty never authorizes a stop or a stopped claim. |
| Any observed state | Permission request is observed | Permission request indicated separately | Protect the session from automatic stopping. |

**Invariants:**
- Session identity is distinct from observed runtime state; unknown/unavailable evidence never authorizes stopping or declaring stopped.
- No session is automatically resumed or started. Each explicit user action makes exactly one attempt; failure remains visible and requires another explicit action to retry.
- Selecting a running or parked session only switches presentation to its live pane; it sends no input and changes no control state.
- Normal app close stops every session and leaves no harness process or terminal pane; park is not stop.
- Uncertain evidence never authorizes stopping or a stopped claim.

### Session creation and handoff

**States:**

| State | Meaning |
|---|---|
| Provisional creation | A session relationship is reserved while startup is in progress; it is not ready. |
| Ready | Initialization, identity, accepted initial delivery, and durable publication are established. |
| Creation failed | Creation did not succeed; the provisional relationship is rolled back after execution cleanup. |
| Handoff successor confirmed | The distinct successor is durably published and confirmed running. |
| Handoff settled | An eligible predecessor owned by this app instance is retired only after successor confirmation. |

**Transitions:**

| From | Trigger | To | Required Behavior |
|---|---|---|---|
| No reserved session | Startup reservation after task-status coordination | Provisional creation | Reserve and persist exactly one provisional relationship in the selected mode. |
| Provisional creation | Initialization, identity, accepted initial delivery, and durable publication succeed | Ready | Report readiness only after all required evidence and publication are established. |
| Provisional creation | Startup/readiness or initial-delivery failure | Creation failed | Fail and report creation; stop or clean up the execution and roll back the provisional relationship; retain tracking if it may still be running or cleanup failed. |
| Provisional creation | Final durable publication fails | Creation failed | Stop or clean up the execution and roll back the provisional relationship; retain tracking if it may still be running or cleanup failed. |
| Successor creation | Successor is durably published and confirmed running | Handoff successor confirmed | Keep the predecessor intact until this confirmation. |
| Handoff successor confirmed | Handoff retires an eligible predecessor owned by this app instance | Handoff settled | Retire only after confirmation; preserve the successor if predecessor retirement fails. |

**Invariants:**
- Creation readiness requires provider initialization, established identity, accepted initial delivery, and durable publication.
- Task-status coordination precedes reservation and session startup; handoff confirmation precedes predecessor retirement.
- A creation failure rolls back the provisional creation relationship after attempting execution cleanup; tracking is retained when the execution may still be running or cleanup failed.

## User Interactions

### Start and manage a session

**Context:** The user works with a task and selected mode through the CLI or workspace.

**Action:** Explicitly start or resume, observe, stop, hand off, attach to, detach from, or delete a session; provide terminal input where supported; close the app.

**Response:** Create one session for the selected mode only on explicit start; coordinate unfinished task status before startup and show readiness only after required initialization, identity, accepted initial delivery, and durable publication. Resume stopped sessions only on explicit action and continue the exact conversation. Selecting a parked session switches to its live pane without resuming. Each start/resume action makes one attempt, with visible failure and no automatic retry. Detaching alone does not stop execution. Normal app close stops every session and leaves no harness process or terminal pane; after reopen all sessions require explicit resume.

**Feedback:** Report operation errors and completed effects truthfully; show unknown/unavailable when liveness cannot be established, and explain when exact resume is impossible.

## External Behavior

### CLI, workspace, and agent integration

**Purpose:** Create, observe, and manage agent conversations consistently across supported launch surfaces.

**Inputs:** User lifecycle actions, task/mode configuration, provider runtime observations, and terminal input.

**Outputs:** Session readiness and identity, runtime and terminal state, and operation results/errors.

**Failures:** Generic failure behavior follows [error handling](../CONVENTIONS.md#error-handling); session-specific consequences are defined in SESSION-009/010/016.

## Non-Functional Requirements

### Performance

- Observe every task every 30 seconds; observation updates runtime state and indications only and never starts, resumes, stops, or retries a session.

### Reliability

- Do not infer running or stopped state from stale records or uncertain evidence; uncertainty never authorizes stopping an agent.
- Keep session identity and any potentially running execution durably trackable; only final durable publication failure rolls back the provisional relationship (SESSION-009/010).
- Confirm a durably published, running successor before retiring an eligible predecessor; handoff settlement follows SESSION-016.
- Do not automatically resend terminal input or substitute a new conversation for exact resume.

### Security

- Never modify provider-owned configuration, data, or state.

### Compatibility

- CLI and workspace session starts have identical semantics.

## Edge Cases

| Condition | Required Behavior |
|---|---|
| Current liveness cannot be established | Report unknown/unavailable; do not infer running or stopped from an old record, and do not stop the agent. |
| A session is parked | Keep its live runtime; selection switches presentation only and does not resume or restart it. |
| A session is stopped | Require explicit resume of the exact retained conversation before use. |
| A session is starting | Keep it unavailable and never present it as running. |
| A start or resume attempt fails | Keep the failure visible and do not retry without another explicit user action. |
| The app closes normally | Stop all sessions; no harness process or terminal pane remains, and sessions require explicit resume after reopen. |
| The app crashes | Do not assume cleanup; establish liveness after reopen only from current evidence, never stored state. |
| Task cannot be moved to its configured in-progress status | Fail the start and show an error before reservation or startup. |
| Startup or initial instruction delivery fails | Fail creation, report the error and completed effects, and preserve tracking for any execution that may remain active; startup/readiness failures may require cleanup. |
| Final durable publication fails after startup | Fail creation, stop the new execution, and roll back its provisional relationship; report errors and completed effects, and preserve tracking for any execution that may remain active. |
| A handoff or cleanup step fails or is interrupted | Report the error and completed effects; preserve tracking for any execution that may remain active and preserve the predecessor/successor outcomes defined in SESSION-016. |
| A start exceeds the soft limit but no session is positively idle | Allow the start; leave working, permission-requesting, and unknown-activity sessions running, and allow the limit to remain exceeded. |
| A batch cleanup target fails validation | Reject before cleanup effects begin. |
| A stop fails after successful preflight | Report effects already completed and the error; follow the generic failure handling contract. |
| Exact conversation resumption is impossible | Explain the failure and ask the user; do not automatically create a new conversation. |
| Successor fails to start during handoff | Keep the predecessor intact. |
| Predecessor retirement fails after successor confirmation | Keep the successor running and report the failure. |
| Deletion is requested for a running session without force | Refuse deletion. |
| Terminal input is queued but not dispatched when the workspace closes or a task is deleted | Discard the text and report that it was not sent; never automatically resend it. |
| In-flight terminal input does not land within the two-second close/delete allowance | Report that delivery is uncertain; never automatically resend it. |

## Open Questions

None.
