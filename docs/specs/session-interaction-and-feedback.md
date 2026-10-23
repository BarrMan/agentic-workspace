# Product Requirements: Session interaction and feedback

## Overview

Let users inspect the selected task's session, safely attach to a live session or explicitly resume a stopped one, and understand its identity, execution context, and state.

## Goals

- Let users inspect and interact with the selected task's session for its selected mode.
- Make session identity, execution context, lifecycle state, and observed activity clear to users.

## Scope

### In Scope

- Selecting and attaching to task sessions; starting or resuming sessions; presenting session identity, execution context, no-session and ended-session states; and indicating observed session activity in task rows.

### Out of Scope

- Workspace screen composition and visibility, owned by the [workspace screen specification](../screens/workspace.md).
- Session picker and file-view composition, owned by the [session/artifact screen specification](../screens/sessions-artifacts.md).
- Shared visual rules, owned by the [design system](../DESIGN-SYSTEM.md).

## Actors

| Actor | Description |
|---|---|
| User | Selects tasks and sessions, starts or resumes sessions, and observes session state and activity. |
| Application | Displays selected-session information and performs the required attach, start, resume, and activity-indicator behavior. |

## Functional Requirements

### IF-SI-001: Select and attach to a session

**Description:** Selecting a task shows the session for its selected mode. Selecting a running or parked session only attaches/switches the presentation to its live pane; it sends no input and changes no control state.

**Trigger:** The user selects a task with a running or parked session in the selected mode.

**Preconditions:** The task has a running or parked session.

**Behavior:**
1. Show the selected-mode session.
2. Attach/switch the presentation to the live pane without starting, resuming, sending input, or changing control state.

**Outcome:** The user sees the live pane for the running or parked session, with input and control state unchanged by selection.

**Failures:** None specified. Generic error handling follows [CONVENTIONS](../CONVENTIONS.md#error-handling).

**Acceptance Criteria:**
- [ ] IF-SI-001-AC-01: Select a running or parked session and confirm presentation switches to its live pane without starting/resuming, sending input, or changing control.

### IF-SI-002: Start or resume a session

**Description:** Start or resume occurs only after an explicit user action. Parked sessions are live and need no resume. Resuming a stopped session follows the [exact-conversation contract](sessions.md#session-014-resume-the-exact-conversation). Each action makes exactly one attempt; failure remains visible and is not retried. A starting session remains unavailable until provider initialization and identity establishment, plus supported acknowledgment of initial instruction submission (not an answer).

**Trigger:** The user explicitly invokes a start/resume action, including the contextual workspace action in [IF-SI-008](#if-si-008-workspace-session-actions), or CLI operation.

**Preconditions:** The selected task and mode are available.

**Behavior:**
1. Keep a starting session unavailable until provider initialization, identity establishment, and supported acknowledgment of initial-instruction submission (not an answer) are complete.
2. Make exactly one start or resume attempt for this action; resume a stopped session according to the exact-conversation contract. A parked session is already live and is not resumed.
3. On failure, show the failure and do not retry unless the user takes another explicit action.

**Outcome:** A starting session remains unavailable until startup completion; a resumed session follows the exact-conversation contract; failures remain visible without retry.

**Failures:** A session that has not met all startup-completion conditions remains unavailable. A failed attempt remains failed and visible; another attempt requires another explicit user action.

**Acceptance Criteria:**
- [ ] IF-SI-002-AC-01: Start a session and confirm it remains unavailable until all startup-completion conditions are met.
- [ ] IF-SI-002-AC-02: Explicitly resume a stopped session and confirm resume follows the exact-conversation contract.
- [ ] IF-SI-002-AC-03: Confirm start/resume occurs only from an explicit action, makes one attempt, and a failure is visible without retry; parked sessions do not require resume.

### IF-SI-003: Identify the selected session and execution context

**Description:** The selected-session presentation identifies the session and its actual execution context according to the [session-header contract](../screens/workspace.md#ordered-regions). The workspace screen owns its composition and visibility; the [session/artifact screen](../screens/sessions-artifacts.md) owns picker and file-view composition.

**Trigger:** The application displays the selected session.

**Preconditions:** A session is selected.

**Behavior:**
1. Identify the session and its actual execution context in accordance with the linked session-header contract.

**Outcome:** The selected session and actual execution context are identifiable.

**Failures:** None specified.

**Acceptance Criteria:**
- [ ] IF-SI-003-AC-01: Confirm the selected-session presentation identifies the session and its actual execution context according to the linked session-header contract.

### IF-SI-004: Present the no-session state

**Description:** If the selected mode has no session, the body says so and the footer offers the contextual start action defined in [IF-SI-008](#if-si-008-workspace-session-actions).

**Trigger:** The application displays a task whose selected mode has no session.

**Preconditions:** The selected mode has no session.

**Behavior:**
1. Show the no-session message in the body.
2. Offer the start shortcut in the footer.

**Outcome:** The user sees that no session exists and can identify the start shortcut.

**Failures:** None specified.

**Acceptance Criteria:**
- [ ] IF-SI-004-AC-01: Launch with no session and confirm the no-session body and start shortcut appear without a keypress.

### IF-SI-005: Present the ended-session state

**Description:** If a session is stopped/ended, the body immediately prompts explicit resume and identifies the separate session-picker action defined in [IF-SI-008](#if-si-008-workspace-session-actions); selection never resumes it.

**Trigger:** The application displays a task whose session has ended.

**Preconditions:** The selected session has ended.

**Behavior:**
1. Immediately show a resume prompt in the body.
2. Identify the separate session-picker action.
3. Do not resume the session automatically.

**Outcome:** The user sees that the session is stopped and can identify the explicit resume and session-picker actions.

**Failures:** None specified.

**Acceptance Criteria:**
- [ ] IF-SI-005-AC-01: Select or launch with a stopped/ended session and confirm the resume prompt and separate session-picker action appear immediately without a keypress or automatic resume.

### IF-SI-006: Show initial session states on startup

**Description:** The no-session and ended-session initial displays are available immediately on application startup without requiring a keypress.

**Trigger:** The application starts with a selected task having no session or an ended session.

**Preconditions:** The selected task's mode has no session or its session has ended.

**Behavior:**
1. Immediately display the appropriate no-session or ended-session body and footer information.

**Outcome:** The initial state is visible without user input.

**Failures:** None specified.

**Acceptance Criteria:**
- [ ] IF-SI-006-AC-01: Launch with no session and with an ended session in turn; confirm each correct body/footer state appears without a keypress.

### IF-SI-007: Indicate observed session activity

**Description:** A task row shows one dot for an active session in the selected mode only when activity evidence exists. It shows no dot without activity evidence or without an active session in that mode. The indicator reflects observed state, not a saved historical lifecycle label, and uses the [design-system status/activity colors](../DESIGN-SYSTEM.md#status-and-activity).

**Trigger:** The application displays a task row.

**Preconditions:** The task has a selected mode.

**Behavior:**
1. Check observed activity evidence for an active session in the selected mode.
2. Show one dot when evidence exists and no dot otherwise, without deriving the indicator from a saved historical lifecycle label.

**Outcome:** The row's dot represents observed activity for the selected mode.

**Failures:** When there is no activity evidence or no active session for the selected mode, show no activity dot.

**Acceptance Criteria:**
- [ ] IF-SI-007-AC-01: Compare active-session activity evidence against absent evidence and historical labels; confirm exactly one dot is shown only for observed active activity in the selected mode.

### IF-SI-008: Workspace session actions

**Description:** Session browsing and session use are separate actions. In workspace navigation, the default `S` binding opens the session picker; the default `Enter` binding uses the selected task's session for its selected mode according to its current state. Shortcut customization follows [IF-WB-007](workspace-and-board.md#if-wb-007-searchable-help-and-shortcuts).

**Trigger:** The user invokes the session-picker or contextual session action from workspace navigation.

**Preconditions:** A task and mode are selected. These navigation bindings do not intercept input owned by a dialog, editable field, or focused agent terminal.

**Behavior:**
1. The session-picker action (`S` by default) lists retained sessions for the selected task and mode only. Opening or cancelling the picker never creates, resumes, or stops a session and never sends terminal input. It remains a picker action when the session is stopped or the list is empty, rather than becoming a resume/start action.
2. The contextual session action (`Enter` by default) follows this table. The target is the selected session for the selected task/mode, not an arbitrary retained conversation.

   | Session state | Required action |
   |---|---|
   | No selected/active session for this task and mode | Request creation of one new session in that mode. |
   | Stopped/ended selected session | Request exact-conversation resume of that session, not a new conversation. A stopped selected session is not treated as absence of a session. |
   | Running or parked selected session | Move input focus into its live preview so the user can converse with the agent; do not start/resume or send the triggering Enter to the agent. |
   | Starting | Keep the session unavailable and do not make another start/resume attempt. |
   | Unknown/unavailable liveness | Show the uncertainty; do not infer absence or stopped state, create a replacement, or attempt resume. |

3. Creation and resume retain all existing configuration, confirmation, readiness, and execution-safety requirements in the [sessions contract](sessions.md). Each invocation makes at most one attempt; a failed resume never falls back to creating a conversation.
4. Prompts, footer, and help distinguish the picker action from the contextual action, describe the contextual action for the current state, and show the active configured bindings.

**Outcome:** Users can browse sessions without execution side effects and explicitly create, resume, or enter live interaction through one state-dependent action.

**Failures:** Picker loading failure is visible without starting/resuming a session. Start/resume failures follow IF-SI-002 and the exact-conversation contract; no automatic retry or replacement occurs. With no selected task, neither action creates or resumes a session.

**Acceptance Criteria:**
- [ ] IF-SI-008-AC-01: With default bindings, press `S` for running, parked, stopped, and no-session states; confirm only the selected task/mode's picker opens, including an empty list, without execution or input side effects. Cancel and confirm the same.
- [ ] IF-SI-008-AC-02: Press navigation `Enter` with no selected/active session and confirm one creation request in the selected mode; with a stopped selected session, confirm one exact-conversation resume request and no replacement creation.
- [ ] IF-SI-008-AC-03: Press navigation `Enter` for a running or parked session and confirm input focus enters its live preview without restarting/resuming it or forwarding the triggering key; subsequent terminal input reaches the agent.
- [ ] IF-SI-008-AC-04: Invoke the contextual action while starting or liveness is unknown; confirm no duplicate start, resume, or replacement occurs and the unavailable/uncertain state remains visible.
- [ ] IF-SI-008-AC-05: Confirm prompts, footer, and help distinguish picker from contextual use, reflect state and configured bindings, and that navigation actions do not intercept modal, editing, or agent-terminal input.

## States and Transitions

### Task session lifecycle

**Terminology:** Running means a live session actively processing. Parked means a loaded session with a live harness, process, and terminal pane but no active turn; selecting it switches presentation to that live pane and does not resume or restart it. Stopped means no harness, process, or pane; use requires explicit resume of the exact retained conversation. Starting means startup is in progress and unavailable until ready; it is never presented as running. Unknown means current evidence is insufficient and is never inferred as running or stopped. Activity indication is separate from lifecycle state: selection or observation updates the task-row session indication, not the selected-session lifecycle.

**States:**

| State | Meaning |
|---|---|
| No session | The selected mode has no session; the body identifies this and the footer offers the start shortcut. |
| Starting session | Startup is in progress; the session remains unavailable until startup completion. |
| Running | A live session actively processing. |
| Parked | A loaded session with a live harness, process, and pane but no active turn. |
| Stopped | No harness, process, or pane; explicit exact-conversation resume is required before use. |
| Starting | Startup is in progress; unavailable until ready and never presented as running. |
| Unknown | Current evidence is insufficient; never inferred as running or stopped. |

**Transitions:**

| From | Trigger | To | Required Behavior |
|---|---|---|---|
| Task selection | User selects a task | Selected task's session for selected mode, or no session | Show the selected-mode session; selection never starts or resumes it. |
| Running or parked session | User selects session | Live pane presented | Attach/switch only; send no input and change no control state. |
| No session | User starts session | Starting session | Keep the session unavailable until startup completion. |
| Stopped session | User explicitly resumes session | Starting/resumed session | Make one attempt and follow the [exact-conversation contract](sessions.md#session-014-resume-the-exact-conversation); do not retry on failure. |
| Stopped session | User selects task/session | Stopped presentation | Immediately prompt resume and identify the separate session-picker action; do not resume. |

**Invariants:**
- Selecting a running or parked session only switches to its live pane; it does not start/resume, submit input, or change control.
- No selection automatically starts or resumes a session; each start/resume attempt requires an explicit action and is attempted once.
- A starting session is unavailable until startup completion.
- Unknown evidence never authorizes a running or stopped claim.

### Task-row activity indicator

**States:**

| State | Meaning |
|---|---|
| Activity dot shown | An active session in the selected mode has observed activity evidence. |
| No activity dot | There is no activity evidence or no active session for the selected mode. |

**Transitions:**

| From | Trigger | To | Required Behavior |
|---|---|---|---|
| Task row | Application checks selected-mode activity | Activity dot shown or no activity dot | Show one dot only when observed activity exists for an active session in the selected mode. |

**Invariants:**
- The activity dot describes observed activity in the selected mode, never merely a saved historical lifecycle label.

## User Interactions

### Inspect and interact with a task session

**Context:** The user selects a task and its selected-mode session.

**Action:** Select a task/session; explicitly start a new session or resume a stopped session; inspect session identity, execution context, and activity.

**Response:** Selecting a running or parked session switches to its live pane only, without input or control changes. Selecting a stopped session immediately shows the resume prompt and separate session-picker action without resuming. The navigation picker and contextual actions follow IF-SI-008. Start/resume occurs only on explicit action, once per action; keep a starting session unavailable until startup completes and show failures without retry.

**Feedback:** Identify the start or session-picker shortcut as applicable and show the task-row activity dot only when observed activity exists for an active session in the selected mode.

## External Behavior

### Session interaction and presentation

**Purpose:** Let users inspect and interact with a task's selected-mode session.

**Inputs:** Task and session selection, start/resume actions, and observed activity evidence for the selected mode.

**Outputs:** The selected-mode session, its identity and actual execution context, no-session/ended-session prompts and shortcuts, and the task-row activity indicator.

**Failures:** A starting session remains unavailable until provider initialization and identity establishment, plus supported acknowledgment of initial instruction submission (not an answer). Selecting a running session sends no input and changes no control state. Resuming a stopped session follows the exact-conversation contract.

## Non-Functional Requirements

### Performance

- None.

### Reliability

- A starting session remains unavailable until provider initialization, identity establishment, and supported acknowledgment of initial instruction submission (not an answer).
- Selecting a running session sends no input and changes no control state.

### Security

- None.

### Compatibility

- None.

## Edge Cases

| Condition | Required Behavior |
|---|---|
| The selected mode has no session at startup. | Immediately show the no-session body and start shortcut without requiring a keypress. |
| The selected session is stopped/ended. | Immediately show the resume prompt and separate session-picker action without requiring a keypress; do not resume automatically. |
| A session is starting but startup completion conditions are not all met. | Keep the session unavailable. |
| A running or parked session is selected. | Switch to its live pane only; do not start/resume, send input, or change control. |
| Start or resume fails. | Show the failed attempt; do not retry unless the user explicitly acts again. |
| Session evidence is uncertain. | Show Unknown; do not infer running or stopped. |
| There is no activity evidence or no active session for the selected mode. | Show no activity dot. |
| A saved historical lifecycle label conflicts with observed activity. | Use observed activity, not the saved label, for the dot. |

## Open Questions

None.
