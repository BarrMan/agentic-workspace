# Product Specification: AgenticWorkspace Sessions

## Overview

This contract specifies session identity and observed state, session startup and recovery, running-session limits, stopping and exact resume, handoff, live terminal behavior, and session deletion. The product-wide contract is indexed by [SPEC](../SPEC.md).

## Features

| Feature | Description | Contract |
|---|---|---|
| Sessions | Create, observe, continue, hand off, and delete retained agent conversations. | Sessions feature contract below |

## Feature Contracts

### Sessions

#### Purpose

Sessions let users launch and continue agent conversations attached to tasks, observe their runtime state and live terminal, and manage the conversation lifecycle without losing identity or misrepresenting uncertain runtime evidence.

#### Requirements

| ID | Requirement |
|---|---|
| SESSION-001 | A session retains its identity and conversation history. Current runtime state is derived from observation; historical lifecycle labels and transition logs are not required. Past stopped-versus-failed distinctions need not persist. Relevant launch progress and errors are reported when they occur. |
| SESSION-002 | Runtime state distinguishes running, idle, and stopped sessions, with permission requests indicated separately. If current liveness cannot be established, report unknown or unavailable; an old record alone proves neither running nor stopped, and uncertain evidence must not cause an agent to be stopped or declared stopped. |
| SESSION-003 | The workspace checks every task every 30 seconds to refresh observed runtime state. |
| SESSION-004 | Starting from the CLI or workspace has identical semantics. A start creates a session only in the selected mode and makes it that task's active session for the mode. It resolves the task's [current effective configuration](configuration.md#configuration-and-modes) and applies the [first-launch worktree contract](tasks.md#launching-work-and-completing-a-task). |
| SESSION-005 | Starting moves an unfinished task to its configured in-progress status. If that status change cannot be completed, the start fails with an error. A finished task retains its status. |
| SESSION-006 | At launch, the agent receives the provider's startup/bootstrap delivery and artifact context exactly once. Session creation waits for readiness and initial delivery, not the agent's answer. |
| SESSION-007 | The launch environment explicitly sets workspace identity for project, worktree, task, mode, and session, together with variables defined by the user on the selected preset. It contains those explicit values without inherited variables from the launching process. Workspace identity variable names are `AGENTIC_WORKSPACE_PROJECT_DIR`, `AGENTIC_WORKSPACE_WORKTREE_DIR`, `AGENTIC_WORKSPACE_TASK_DIR`, `AGENTIC_WORKSPACE_TASK_ID`, `AGENTIC_WORKSPACE_MODE_ID`, and `AGENTIC_WORKSPACE_SESSION_ID`; workspace-defined names use the `AGENTIC_WORKSPACE_` prefix. |
| SESSION-008 | User-defined preset variable values may reference only `AGENTIC_WORKSPACE_PROJECT_DIR`, `AGENTIC_WORKSPACE_WORKTREE_DIR`, and `AGENTIC_WORKSPACE_TASK_DIR`. Preset values cannot override those reserved paths. |
| SESSION-009 | A critical creation failure—including startup failure, initial-instruction delivery failure, or final durable publication failure after startup—fails creation and triggers recovery. The new execution remains durably trackable until it can be stopped or released. Recovery stops/releases the new execution before removing the failed session's task association and persisting that rollback. The previous active selection is restored only if the failed session remains selected; a newer selection is preserved. |
| SESSION-010 | If execution cleanup or rollback publication is incomplete, durable ownership/recovery evidence is retained. The product reports the original creation error together with cleanup/publication errors and actionable evidence, does not claim rollback succeeded, and does not erase the last tracking information for an execution that could not be stopped. |
| SESSION-011 | Session creation is ready only after provider initialization and identity establishment, supported acknowledgment that the initial instruction submission was accepted, and successful durable publication. Initial instructions are submitted exactly once; creation does not wait for an answer. Resuming requires the exact conversation identity and successful initialization; it does not replay the initial prompt or send a synthetic probe. |
| SESSION-012 | A project-wide soft limit applies across tasks, modes, workspace windows, and supported launch surfaces. A start is always allowed. When the limit is exceeded, stop eligible sessions only as needed to satisfy it, choosing the positively observed idle session with the longest continuous idle duration. Working sessions, permission requests, and sessions with unknown activity are protected from automatic stopping. If no session is positively idle, the new session starts and the limit may remain exceeded. |
| SESSION-013 | Stopping ends the agent while retaining its conversation identity. If the stopped session was active, another retained session becomes active when one exists. |
| SESSION-014 | Resuming continues the same conversation using current effective configuration. If exact resume is impossible, fail with an explanation and ask the user what to do. Starting a new conversation requires explicit user agreement and is a distinct action, not an automatic resume fallback. |
| SESSION-015 | Before a batch cleanup operation stops any relevant native target, all relevant native targets are validated. A preflight rejection occurs before cleanup effects. If a stop fails after preflight succeeds, earlier effects may already have completed; report completed and incomplete effects and actionable errors/evidence without implying transactional rollback. Cleanup precedes removal of relationships and tracking evidence as required by the relevant [task deletion](tasks.md#task-deletion) or [mode deletion](configuration.md#delete-a-mode) contract. |
| SESSION-016 | Handoff creates a distinct successor session. A predecessor is eligible for retirement only when it belongs to the workspace. The successor must be confirmed running, including successful durable publication, before an eligible predecessor is ended. If the successor fails to start, the predecessor remains intact. If predecessor retirement fails after the successor is confirmed running, the successor remains running and the failure is reported. A successor publication failure follows the [creation publication-failure rule](#creation-failure-and-recovery). |
| SESSION-017 | The workspace displays the agent's live terminal, seeded from its current screen and updated while it runs. Retained conversation history and the [ask operation](supported-integration-operations.md#supported-integration-operations) are separate from terminal capture. |
| SESSION-018 | Leaving the workspace detaches the client and keeps agents running. An app crash likewise leaves sessions running; report stopped only after observing that the agent is no longer running. |
| SESSION-019 | When closing the workspace or deleting a task, an already in-flight terminal input write is allowed to finish for up to two seconds before teardown. Report if delivery did not complete. |
| SESSION-020 | Deletion is refused while the session's agent is running. With force, the agent is killed before the session is removed. Runtime-evidence constraints continue to apply. |

#### Behavioral Flows

##### Starting a session

**Trigger:** The user starts a session from the CLI or workspace.

**Preconditions:** A task and mode are selected; task configuration and the first-launch worktree contract can be resolved.

**Flow:**

1. Resolve effective configuration, establish the required work context, and prepare the launch environment and initial instruction/artifact context.
2. Create the session in the selected mode and make it the task's active session for that mode.
3. Initialize the provider, establish identity, and deliver the initial instruction exactly once.
4. After supported acceptance of initial delivery and successful durable publication, report creation ready without waiting for an answer.
5. Move an unfinished task to its configured in-progress status; leave a finished task's status unchanged.

**Postconditions:** The selected task/mode has the new active session and the session is ready; an unfinished task has its configured in-progress status.

##### Creation failure and recovery

**Trigger:** A critical startup, initial-delivery, or final-publication step fails.

**Preconditions:** A new execution may have been started and must remain trackable.

**Flow:**

1. Fail session creation and retain durable tracking of the new execution.
2. Stop or release that execution.
3. Only after successful execution cleanup, remove the failed session's task association and persist the rollback.
4. Restore the previous active selection only if the failed session is still selected; preserve any newer selection.
5. If cleanup or rollback publication is incomplete, retain ownership/recovery evidence and report the original error, secondary errors, and actionable evidence.

**Postconditions:** Either the failed session is rolled back after its execution is cleaned up, or durable evidence remains to track unresolved cleanup/rollback; no unsuccessful rollback is reported as successful.

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
5. If a stop fails after successful preflight, report effects already completed and those incomplete, with actionable errors/evidence; do not imply rollback.

**Postconditions:** Stop retains identity; successful resume continues that identity without replaying initial instructions or sending a synthetic probe.

##### Handoff

**Trigger:** The user requests handoff to a distinct successor session.

**Preconditions:** The predecessor is eligible for retirement only if it belongs to the workspace.

**Flow:**

1. Start and durably publish the successor, establishing that it is running.
2. Only after successor confirmation, end an eligible workspace-owned predecessor.
3. If successor startup fails, leave the predecessor intact. If predecessor retirement fails, leave the confirmed successor running and report the failure. A successor publication failure follows [creation failure and recovery](#creation-failure-and-recovery).

**Postconditions:** The successor is running after successful handoff; an external predecessor is not ended by this operation.

##### Observe and detach from a live session

**Trigger:** The workspace attaches to, detaches from, or crashes while connected to a session.

**Preconditions:** A session may be running independently of the workspace client.

**Flow:**

1. On attachment, seed the terminal display from the current screen and show subsequent updates.
2. On workspace departure or app crash, detach the client without stopping the agent.
3. Report stopped only when observation establishes the agent is no longer running; otherwise report unknown/unavailable when liveness cannot be established.
4. On workspace close or task deletion, allow an in-flight terminal input write up to two seconds to finish and report if delivery did not complete.

**Postconditions:** Client lifetime does not determine agent lifetime; terminal display reflects the current screen when attached.

##### Deleting a session

**Trigger:** The user requests session deletion, optionally with force.

**Preconditions:** Runtime evidence is sufficient to determine whether the agent is running.

**Flow:**

1. Refuse deletion if the agent is running and force was not requested.
2. With force, kill the agent first.
3. Remove the session only after the required stop/kill operation succeeds.

**Postconditions:** A running agent is not orphaned by session removal; deletion follows the runtime-evidence constraint.

#### Edge Cases and Failures

| Condition | Expected Behavior |
|---|---|
| Current liveness cannot be established | Report unknown/unavailable; do not infer running or stopped from an old record, and do not stop the agent. |
| Task cannot be moved to its configured in-progress status | Fail the start and show an error. |
| Startup, initial instruction delivery, or final durable publication fails | Fail creation and follow the cleanup-before-association-removal recovery sequence. |
| Execution cleanup or rollback publication is incomplete | Preserve durable ownership/recovery evidence and report original and secondary errors with actionable evidence; do not claim success or erase the last execution tracking information. |
| A start exceeds the soft limit but no session is positively idle | Allow the start; leave working, permission-requesting, and unknown-activity sessions running, and allow the limit to remain exceeded. |
| A batch cleanup target fails validation | Reject before cleanup effects begin. |
| A stop fails after successful preflight | Earlier effects may have completed; report completed/incomplete effects and actionable errors/evidence without implying transactional rollback. |
| Exact conversation resumption is impossible | Explain the failure and ask the user; do not automatically create a new conversation. |
| Successor fails to start during handoff | Keep the predecessor intact. |
| Predecessor retirement fails after successor confirmation | Keep the successor running and report the failure. |
| Deletion is requested for a running session without force | Refuse deletion. |
| In-flight terminal input does not complete within the two-second close/delete allowance | Report that delivery did not complete. |

#### Behavioral Invariants

- Session identity and retained conversation identity are not confused with observed runtime state.
- Uncertain liveness evidence never authorizes stopping an agent or declaring it stopped.
- Creation recovery stops/releases the new execution before removing its task association; incomplete cleanup or rollback retains actionable tracking evidence.
- A newer active selection is never overwritten by rollback of an older failed creation.
- Exact resume never silently becomes a new conversation.
- A handoff predecessor is not retired before durable confirmation that its successor is running.
- A workspace client detaching or crashing does not itself stop the agent.
- Native cleanup validation precedes batch stop effects; later partial failure is not represented as transactional rollback.

#### Acceptance Criteria

- [ ] Starting through either the CLI or workspace creates an active session only in the selected mode, applies resolved configuration/work context, and changes only an unfinished task to its configured in-progress status.
- [ ] Initial instructions and artifact context are delivered once; readiness requires provider initialization, identity establishment, accepted delivery, and durable publication, but not an agent answer.
- [ ] Trigger startup, initial-delivery, and final-publication failures independently; confirm cleanup precedes relationship removal and incomplete settlement retains actionable evidence and reports all relevant errors.
- [ ] Verify that a task's observed runtime state refreshes every 30 seconds and that uncertain evidence appears unknown/unavailable without stopping the agent or declaring it stopped.
- [ ] With two positively idle sessions of different continuous idle durations, confirm the longer-idle session is stopped first when needed across tasks/windows. With only protected or unknown sessions, confirm a new start succeeds and the limit may remain exceeded; below the limit, idle sessions remain running.
- [ ] Stop and resume a session and confirm conversation identity is retained; when exact resume is unavailable, confirm no new conversation starts absent explicit user agreement.
- [ ] Reject a native cleanup preflight failure before effects; after a later stop failure, report completed and incomplete effects without implying rollback.
- [ ] Confirm a failed handoff successor leaves its predecessor intact; confirm a confirmed successor remains running if predecessor retirement fails, and an external predecessor is not ended.
- [ ] Detach or crash the workspace client while an agent runs; confirm the agent keeps running. Reattach and confirm the current screen and subsequent updates appear.
- [ ] Request deletion of a running session without force and confirm refusal; with force, confirm the agent is killed before session removal.
- [ ] Close the workspace or delete a task with terminal input in flight; confirm up to two seconds is allowed for delivery and incomplete delivery is reported.

#### Open Decisions

| Question | Constraints | Status |
|---|---|---|
| What automatic recovery, if any, is required after a crash/interruption during creation or handoff? | The synchronous creation failure guarantees, cleanup ordering, durable tracking, and handoff success/failure ordering above remain in force. | Open |
| What retry UX and outcomes are required for repeated or concurrent session operations, including creation and handoff? | No unsettled policy suspends the established synchronous failure guarantees. | Open |
| What are the queued-but-undispatched terminal input and post-timeout dispositions, and the exact error presentation when delivery does not complete? | An already in-flight write receives up to two seconds before workspace-close/task-delete teardown; incomplete delivery must be reported. | Open |
| What provider-owned files, if any, are included in session deletion, and what recovery behavior applies beyond the specified refusal/force ordering? | Deletion is refused while the agent runs; force kills it before removing the session, subject to runtime-evidence constraints. | Open |

## Global Behavioral Invariants

- Across supported launch surfaces, session behavior is consistent and the project-wide running-session soft limit is not a prohibition on starting a session.

## Open Product Decisions

| Decision | Affected Features | Status |
|---|---|---|
| Automatic crash/interruption recovery, retry UX, and repeated/concurrent operation outcomes remain undecided, subject to the approved synchronous creation and handoff guarantees above. | Sessions | Open |
| Queued terminal input disposition, post-timeout behavior, and exact incomplete-delivery error presentation remain undecided. | Sessions | Open |
| Provider-owned file scope and recovery policy beyond the specified session-deletion ordering remain undecided. | Sessions | Open |
