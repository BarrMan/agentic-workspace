# Product Specification: AgenticWorkspace Sessions

## Overview

This contract specifies session identity and observed state, session startup and recovery, running-session limits, stopping and exact resume, handoff, live terminal behavior, and session deletion. The product-wide contract is indexed by [SPEC](../SPEC.md).

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

## States and Transitions

| State | Meaning or transition |
|---|---|
| Running | Current observation establishes that the agent is running. |
| Idle | Current observation establishes an idle session; eligible for soft-limit stopping. |
| Stopped | Observation establishes that the agent is no longer running. |
| Unknown/unavailable | Current liveness or activity cannot be established; this never authorizes a stop or a stopped claim. |
| Permission request | Reported separately from running/idle/stopped activity and protected from automatic stopping. |
| Creation | Provisional session/execution becomes ready only after initialization, identity, accepted initial delivery, and durable publication. Only final publication failure rolls back the provisional relationship (SESSION-009/010). |
| Handoff | A durably published, confirmed-running successor precedes retirement of an eligible workspace-owned predecessor (SESSION-016). |

## External Behavior

### CLI, workspace, and agent integration

**Purpose:** Create, observe, and manage agent conversations consistently across supported launch surfaces.

**Inputs:** User lifecycle actions, task/mode configuration, provider runtime observations, and terminal input.

**Outputs:** Session readiness and identity, runtime and terminal state, and operation results/errors.

**Failures:** Follow [error handling and edge cases](../CONVENTIONS.md#error-handling); creation-publication rollback and handoff settlement are limited by SESSION-009/010/016.

## User Interactions

### Start and manage a session

**Context:** The user works with a task and selected mode through the CLI or workspace.

**Action:** Start, observe, stop, resume, hand off, attach to, detach from, or delete a session; provide terminal input where supported.

**Response:** Create one session for the selected mode, coordinate unfinished task status before startup, and show readiness only after required initialization, identity, accepted initial delivery, and durable publication. Report observed runtime and terminal state, preserve exact conversation identity on resume, and apply the specified lifecycle outcomes.

**Feedback:** Report operation errors and completed effects truthfully; show unknown/unavailable when liveness cannot be established, and explain when exact resume is impossible.

## Non-Functional Requirements

### Performance

- Refresh observed runtime state for every task every 30 seconds.

### Reliability

- Do not infer running or stopped state from stale records or uncertain evidence; uncertainty never authorizes stopping an agent.
- Keep session identity and any potentially running execution durably trackable; only final durable publication failure rolls back the provisional relationship (SESSION-009/010).
- Confirm a durably published, running successor before retiring an eligible predecessor; handoff settlement follows SESSION-016.
- Do not automatically resend terminal input or substitute a new conversation for exact resume.

### Security

- Never modify provider-owned configuration, data, or state.

### Compatibility

- CLI and workspace session starts have identical semantics.

## Features

| Feature | Description | Contract |
|---|---|---|
| Sessions | Create, observe, continue, hand off, and delete retained agent conversations. | Sessions feature contract below |

## Feature Contracts

### Sessions

#### Purpose

Sessions let users launch and continue agent conversations attached to tasks, observe their runtime state and live terminal, and manage the conversation lifecycle without losing identity or misrepresenting uncertain runtime evidence.

## Requirements

### SESSION-001: Retain session identity and history

**Description:** A session retains its identity and conversation history.

**Trigger:** A session is created, used, or observed.

**Preconditions:** A session exists.

**Behavior:**
1. Retain identity and conversation history; derive current runtime state from observation.
2. Historical lifecycle labels, transition logs, and past stopped-versus-failed distinctions need not persist.
3. Report relevant launch progress and errors when they occur.

**Outcome:** The conversation remains identifiable and relevant launch progress/errors are reported.

**Failures:** Follow [error handling and edge cases](../CONVENTIONS.md#error-handling).

**Acceptance Criteria:**
- [ ] Session identity and conversation history persist; runtime is observed rather than inferred from historical labels, and relevant launch progress/errors are reported when they occur.

### SESSION-002: Report observed runtime state

**Description:** Runtime state distinguishes running, idle, and stopped sessions, with permission requests indicated separately.

**Trigger:** The workspace observes a session's runtime state.

**Preconditions:** Current runtime evidence may or may not establish liveness and activity.

**Behavior:**
1. Distinguish running, idle, and stopped sessions and indicate permission requests separately.
2. If current liveness cannot be established, report unknown or unavailable; an old record alone proves neither running nor stopped.
3. Do not stop an agent or declare it stopped on uncertain evidence.

**Outcome:** The reported state reflects current evidence without treating uncertainty as proof.

**Failures:** If current liveness cannot be established, report unknown or unavailable.

**Acceptance Criteria:**
- [ ] Running, idle, stopped, and separate permission-request states are distinguished; uncertain current liveness reports unknown/unavailable and never causes a stop or stopped claim.

### SESSION-003: Refresh runtime observations

**Description:** The workspace checks every task every 30 seconds to refresh observed runtime state.

**Trigger:** The 30-second refresh interval elapses.

**Preconditions:** Tasks are available to the workspace.

**Behavior:**
1. Check every task every 30 seconds and refresh its observed runtime state.

**Outcome:** Runtime observations are refreshed for every task at the specified interval.

**Failures:** Follow [error handling and edge cases](../CONVENTIONS.md#error-handling).

**Acceptance Criteria:**
- [ ] The workspace refreshes observed runtime state for every task every 30 seconds.

### SESSION-004: Start consistently across surfaces

**Description:** Starting from the CLI or workspace has identical semantics.

**Trigger:** The user starts a session from the CLI or workspace.

**Preconditions:** A task and mode are selected; task configuration and the first-launch worktree contract can be resolved.

**Behavior:**
1. Create a session only in the selected mode and make it that task's active session for the mode.
2. Resolve the task's [current effective configuration](configuration.md#configuration-and-modes) and apply the [first-launch worktree contract](tasks.md#launching-work-and-completing-a-task).
3. Store tasks, artifacts, and saved agent configuration on disk, not only in workspace memory.

**Outcome:** CLI and workspace starts behave identically using resolved configuration and disk-backed data.

**Failures:** Follow [error handling and edge cases](../CONVENTIONS.md#error-handling).

**Acceptance Criteria:**
- [ ] CLI and workspace starts have identical semantics, create only in the selected mode, select the task/mode active session, resolve effective configuration and worktree behavior, and use disk-backed task/artifact/agent configuration data.

### SESSION-005: Coordinate task status before starting

**Description:** Starting moves an unfinished task to its configured in-progress status.

**Trigger:** The user starts a session for a task.

**Preconditions:** The task's finished/unfinished state and configured in-progress status are available.

**Behavior:**
1. Before session startup, move an unfinished task to its configured in-progress status.
2. Leave a finished task's status unchanged.

**Outcome:** Status coordination succeeds before session startup proceeds; a finished task retains its status.

**Failures:** If the required status change cannot be completed, fail the start with an error before session startup.

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

**Failures:** Follow [error handling and edge cases](../CONVENTIONS.md#error-handling).

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

**Failures:** Follow [error handling and edge cases](../CONVENTIONS.md#error-handling).

**Acceptance Criteria:**
- [ ] Preset variable references are limited to the three permitted workspace paths, and reserved paths cannot be overridden.

### SESSION-009: Settle session creation failures

**Description:** Critical startup, initial-instruction delivery, or final durable publication failure fails creation and is reported.

**Trigger:** Startup, initial-instruction delivery, or final durable publication fails during creation.

**Preconditions:** A new execution may have started and must remain trackable if it could still be running.

**Behavior:**
1. Fail creation and report the error.
2. Only after final publication failure, stop the new execution and roll back its provisional relationship.
3. Keep durable tracking of any execution that may still be running.
4. Apply generic failure handling from [error handling and edge cases](../CONVENTIONS.md#error-handling).

**Outcome:** Creation is not reported as successful; the provisional relationship is rolled back only after final publication failure.

**Failures:** Startup/readiness failures stop creation and may require cleanup; final publication failure stops the new execution and rolls back its provisional relationship.

**Acceptance Criteria:**
- [ ] Startup, initial-delivery, and final-publication failures fail creation and report errors; startup/readiness failures may require cleanup, while only final-publication failure rolls back the provisional relationship, retaining durable tracking for any execution that may remain running.

### SESSION-010: Report settlement truthfully

**Description:** Report completed effects, the original error, and any cleanup/publication errors truthfully.

**Trigger:** A session operation fails or its settlement is incomplete.

**Preconditions:** Effects may have completed and cleanup/publication may have failed.

**Behavior:**
1. Report completed effects, the original error, and cleanup/publication errors.
2. Do not imply rollback beyond the provisional-relationship rollback required after final publication failure.
3. Do not erase last tracking information for an execution that could not be stopped.

**Outcome:** Reports reflect actual effects and preserve tracking information for an unstopped execution.

**Failures:** Follow [error handling and edge cases](../CONVENTIONS.md#error-handling); report cleanup/publication errors with the original error.

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

**Failures:** If stopping fails, report completed effects and the error under [error handling and edge cases](../CONVENTIONS.md#error-handling).

**Acceptance Criteria:**
- [ ] Stopping ends the agent but retains identity; if it was active, another retained session becomes active when available.

### SESSION-014: Resume the exact conversation

**Description:** Resuming continues the same conversation using current effective configuration.

**Trigger:** The user resumes a retained session.

**Preconditions:** The selected session has an exact conversation identity.

**Behavior:**
1. Continue the same conversation using current effective configuration.
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
3. Cleanup precedes removal of relationships and tracking evidence as required by [task deletion](tasks.md#task-deletion) or [mode deletion](configuration.md#delete-a-mode).
4. Apply generic failure handling from [error handling and edge cases](../CONVENTIONS.md#error-handling).

**Outcome:** Cleanup occurs only after successful validation and precedes required relationship/tracking removal.

**Failures:** Reject failed preflight before cleanup effects; if a cleanup step fails, report completed effects and the error.

**Acceptance Criteria:**
- [ ] Batch cleanup validates every relevant native target before effects; failed preflight has no effects, and cleanup precedes relationship/tracking removal where required.

### SESSION-016: Handoff to a successor

**Description:** Handoff creates a distinct successor session.

**Trigger:** The user requests handoff to a distinct successor session.

**Preconditions:** A predecessor is eligible for retirement only when it belongs to the workspace.

**Behavior:**
1. Confirm the successor is running, including successful durable publication, before ending an eligible predecessor.
2. If a step fails or is interrupted, report the error and completed effects.
3. Keep the predecessor intact if successor creation fails; keep a successfully published successor if predecessor retirement fails.
4. Apply generic failure handling; the only rollback is creation-publication rollback defined in SESSION-009/010.

**Outcome:** The successor is confirmed before retiring an eligible workspace-owned predecessor; an external predecessor is not ended.

**Failures:** Successor creation failure leaves the predecessor intact; predecessor retirement failure leaves the successfully published successor running. Report errors and completed effects.

**Acceptance Criteria:**
- [ ] Handoff creates a distinct successor, retires only workspace-owned predecessors after durable running confirmation, preserves predecessor on successor failure and successor on predecessor-retirement failure, with no rollback beyond SESSION-009/010.

### SESSION-017: Display the live terminal

**Description:** The workspace displays the agent's live terminal, seeded from its current screen and updated while it runs.

**Trigger:** The workspace attaches to a live session.

**Preconditions:** A live terminal screen is available.

**Behavior:**
1. Seed the display from the current screen and show updates while the agent runs.
2. Keep retained conversation history and the [ask operation](supported-integration-operations.md#supported-integration-operations) separate from terminal capture.

**Outcome:** The terminal reflects its current screen and subsequent updates without conflating history or ask operation with capture.

**Failures:** Follow [error handling and edge cases](../CONVENTIONS.md#error-handling).

**Acceptance Criteria:**
- [ ] The live terminal is seeded from the current screen and updated while running; conversation history and ask operation remain separate from terminal capture.

### SESSION-018: Detach without stopping agents

**Description:** Leaving the workspace detaches the client and keeps agents running.

**Trigger:** The user leaves the workspace or the app crashes while connected to a session.

**Preconditions:** A session may be running independently of the workspace client.

**Behavior:**
1. Detach the client without stopping agents on departure or app crash.
2. Report stopped only after observing that the agent is no longer running.

**Outcome:** Client lifetime does not determine agent lifetime; stopped is reported only from observation.

**Failures:** If liveness cannot be established, report unknown/unavailable under SESSION-002.

**Acceptance Criteria:**
- [ ] Workspace departure and app crash detach without stopping agents; stopped is reported only after observation establishes not running.

### SESSION-019: Settle terminal input on close or deletion

**Description:** On workspace close or task deletion, terminal input already in flight is allowed up to two seconds to land.

**Trigger:** The workspace closes or a task is deleted while terminal input is queued or in flight.

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

## Flows

##### Starting a session

**Trigger:** The user starts a session from the CLI or workspace.

**Preconditions:** A task and mode are selected; task configuration and the first-launch worktree contract can be resolved.

**Flow:**

1. Resolve effective configuration, establish the required work context, and prepare the launch environment and initial instruction/artifact context.
2. Move an unfinished task to its configured in-progress status; leave a finished task's status unchanged. If the required status change fails, fail the start before session reservation or startup.
3. Reserve and persist exactly one provisional session relationship in the selected mode, making it the task's active session for that mode.
4. Start the reserved session outside the store lock; initialize the provider, establish identity, and deliver the initial instruction exactly once.
5. After supported acceptance of initial delivery and successful durable publication into the same reserved record, report creation ready without waiting for an answer.

**Postconditions:** The selected task/mode has one new active session, reserved only after task-status coordination; the session is ready only after startup, initialization, identity, accepted delivery, and durable publication. An unfinished task has its configured in-progress status.

##### Creation failure

**Trigger:** Task-status coordination, startup/readiness, initial delivery, or final publication fails.

**Preconditions:** A new execution may have been started and must remain trackable.

**Flow:**

1. Fail the start if required task-status coordination fails; otherwise, on startup/readiness or initial-delivery failure, fail creation and report the error. Generic failure handling follows [error handling and edge cases](../CONVENTIONS.md#error-handling).
2. Startup/readiness failures may require cleanup; the harness cleans allocations it cannot return as part of a failed launch attempt.
3. If final durable publication fails after startup, stop the new execution and roll back its provisional relationship. No other creation failure rolls back that relationship.
4. Retain durable tracking of any new execution that may still be running and report completed effects.

**Postconditions:** The failed operation is not reported as successful; startup/readiness failures may require cleanup, while only final publication failure rolls back the provisional relationship. Any execution that may still be running remains durably trackable.

##### Enforce the running-session soft limit

**Trigger:** A session is started while the project-wide limit is exceeded.

**Preconditions:** Runtime observations are available for eligible sessions.

**Flow:**

1. Allow the new session to start.
2. If the limit is exceeded, stop eligible positively observed idle sessions, longest continuous idle duration first, only as needed.
3. Do not automatically stop working, permission-requesting, or unknown-activity sessions.
4. If no positively idle session is available, leave the limit exceeded.

**Postconditions:** The start succeeds; the limit is satisfied when eligible idle sessions suffice, otherwise the count may remain above the limit.

##### Stop and resume a session

**Trigger:** The user stops or resumes a retained session.

**Preconditions:** The selected operation targets a retained session; resumption requires its exact conversation identity.

**Flow:**

1. On stop, end the agent and retain the conversation identity.
2. If the stopped session was active, activate another retained session when one exists.
3. On resume, validate relevant native cleanup targets before any batch stop effects, then continue the exact conversation with current effective configuration.
4. If exact resumption is impossible, explain why and ask the user what to do; do not start a new conversation without explicit agreement.
5. If a stop fails after successful preflight, report effects already completed and those incomplete, with actionable errors/evidence; follow [error handling and edge cases](../CONVENTIONS.md#error-handling).

**Postconditions:** Stop retains identity; successful resume continues that identity without replaying initial instructions or sending a synthetic probe.

##### Handoff

**Trigger:** The user requests handoff to a distinct successor session.

**Preconditions:** The predecessor is eligible for retirement only if it belongs to the workspace.

**Flow:**

1. Start and durably publish the successor, establishing that it is running.
2. Only after successor confirmation, end an eligible workspace-owned predecessor.
3. If any step fails or is interrupted, report the error and completed effects. Successor startup failure leaves the predecessor intact; predecessor retirement failure leaves the confirmed successor running. Generic failure handling and the sole creation-publication rollback follow SESSION-009/010 and [error handling and edge cases](../CONVENTIONS.md#error-handling).

**Postconditions:** The successor is running after successful handoff; an external predecessor is not ended by this operation.

##### Observe and detach from a live session

**Trigger:** The workspace attaches to, detaches from, or crashes while connected to a session.

**Preconditions:** A session may be running independently of the workspace client.

**Flow:**

1. On attachment, seed the terminal display from the current screen and show subsequent updates.
2. On workspace departure or app crash, detach the client without stopping the agent.
3. Report stopped only when observation establishes the agent is no longer running; otherwise report unknown/unavailable when liveness cannot be established.
4. On workspace close or task deletion, allow terminal input already in flight up to two seconds to land. Discard and report text never dispatched as not sent; do not automatically resend, and distinguish this from uncertain in-flight delivery.

**Postconditions:** Client lifetime does not determine agent lifetime; terminal display reflects the current screen when attached.

##### Deleting a session

**Trigger:** The user requests session deletion, optionally with force.

**Preconditions:** Runtime evidence is sufficient to determine whether the agent is running.

**Flow:**

1. Refuse deletion if the agent is running and force was not requested.
2. With force, kill the agent first.
3. Remove workspace-owned session records/resources only after the required stop/kill operation succeeds. Never touch provider-owned state.

**Postconditions:** A running agent is not orphaned by session removal; deletion follows the runtime-evidence constraint.

## Failure/Recovery

Failure handling follows [error handling and edge cases](../CONVENTIONS.md#error-handling). Session-specific settlement is limited to retaining actionable tracking evidence, preserving handoff participants as stated, and rolling back the provisional relationship only after final publication failure (SESSION-009/010/016).

| Condition | Expected Behavior |
|---|---|
| Current liveness cannot be established | Report unknown/unavailable; do not infer running or stopped from an old record, and do not stop the agent. |
| Task cannot be moved to its configured in-progress status | Fail the start and show an error. |
| Startup or initial instruction delivery fails | Fail creation, report the error and completed effects, and preserve tracking for any execution that may remain active. |
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

### Behavioral Invariants

- Session identity and retained conversation identity are not confused with observed runtime state.
- Uncertain liveness evidence never authorizes stopping an agent or declaring it stopped.
- Provider-owned configuration, data, and state remain untouched by session lifecycle operations.
- A newer active selection is never overwritten by the provisional-relationship rollback permitted only after final publication failure.
- Exact resume never silently becomes a new conversation.
- A handoff predecessor is not retired before durable confirmation that its successor is running.
- A workspace client detaching or crashing does not itself stop the agent.
- Native cleanup validation precedes batch stop effects; feature-specific settlement follows SESSION-009/010/016.
- Final durable publication failure during creation is the only creation failure that rolls back: it stops the new execution and removes its provisional relationship.

## Acceptance Criteria

- [ ] **SESSION-001:** Session identity and conversation history persist; runtime is observed rather than inferred from historical labels, and relevant launch progress/errors are reported when they occur.
- [ ] **SESSION-002:** Running, idle, stopped, and separate permission-request states are distinguished; uncertain current liveness reports unknown/unavailable and never causes a stop or stopped claim.
- [ ] **SESSION-003:** The workspace refreshes observed runtime state for every task every 30 seconds.
- [ ] **SESSION-004:** CLI and workspace starts have identical semantics, create only in the selected mode, select the task/mode active session, resolve effective configuration and worktree behavior, and use disk-backed task/artifact/agent configuration data.
- [ ] **SESSION-005:** Starting moves an unfinished task to its configured in-progress status before session startup and fails with an error if that change cannot complete; a finished task's status is unchanged.
- [ ] **SESSION-006:** Startup/bootstrap delivery and artifact context are each delivered exactly once; readiness waits for initial delivery but not an answer.
- [ ] **SESSION-007:** The launch environment contains explicit workspace identity and selected-preset user variables, with no inherited process variables and the specified identity names/prefix.
- [ ] **SESSION-008:** Preset variable references are limited to the three permitted workspace paths, and reserved paths cannot be overridden.
- [ ] **SESSION-009:** Startup, initial-delivery, and final-publication failures fail creation and report errors; startup/readiness failures may require cleanup, while only final-publication failure rolls back the provisional relationship, retaining durable tracking for any execution that may remain running.
- [ ] **SESSION-010:** Completed effects, original errors, and cleanup/publication errors are reported truthfully; no broader rollback is implied and last tracking information for an unstopped execution is retained.
- [ ] **SESSION-011:** Readiness requires provider initialization, established identity, accepted initial instruction submission, and durable publication; initial instructions are sent once without waiting for an answer. Resume initializes the exact identity without replay or synthetic probe.
- [ ] **SESSION-012:** The soft limit is project-wide and never blocks a start; only positively observed idle sessions are stopped as needed, longest continuously idle first, while protected/unknown sessions remain and the limit may stay exceeded.
- [ ] **SESSION-013:** Stopping ends the agent but retains identity; if it was active, another retained session becomes active when available.
- [ ] **SESSION-014:** Resume continues the same conversation under current effective configuration; impossible exact resume explains and asks, and a new conversation requires explicit agreement.
- [ ] **SESSION-015:** Batch cleanup validates every relevant native target before effects; failed preflight has no effects, and cleanup precedes relationship/tracking removal where required.
- [ ] **SESSION-016:** Handoff creates a distinct successor, retires only workspace-owned predecessors after durable running confirmation, preserves predecessor on successor failure and successor on predecessor-retirement failure, with no rollback beyond SESSION-009/010.
- [ ] **SESSION-017:** The live terminal is seeded from the current screen and updated while running; conversation history and ask operation remain separate from terminal capture.
- [ ] **SESSION-018:** Workspace departure and app crash detach without stopping agents; stopped is reported only after observation establishes not running.
- [ ] **SESSION-019:** Closing or deleting allows dispatched input up to two seconds to land; undispatched text is discarded and reported not sent, uncertain in-flight delivery is distinguished, and automatic resend never occurs.
- [ ] **SESSION-020:** Deletion of a running session without force is refused; with force, kill precedes removal of workspace-owned records/resources, and provider state remains untouched.

## Global Behavioral Invariants

- Across supported launch surfaces, session behavior is consistent and the project-wide running-session soft limit is not a prohibition on starting a session.
