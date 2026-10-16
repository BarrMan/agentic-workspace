# Product Specification: Session interaction and feedback

## Overview

Let users inspect the selected task's session, safely attach to or resume it, and understand the selected session's identity, execution context, and state.

## Features

| Feature | Description | Contract |
|---|---|---|
| Session interaction and feedback | Select, observe, start, resume, and identify task sessions in the workspace. | [Session interaction and feedback](#session-interaction-and-feedback) |

## Feature Contracts

### Session interaction and feedback

#### Purpose

Let users inspect the selected task's session, safely attach to or resume it, and understand the selected session's identity, execution context, and state.

#### Requirements

| ID | Requirement |
|---|---|
| IF-SI-001 | Selecting a task must show the active session for its selected mode. Selecting a running session must only attach: it must send no input and change no control state. |
| IF-SI-002 | Resuming a stopped session must follow the [exact-conversation contract](sessions.md#stop-and-resume-a-session). A starting session must remain unavailable until [startup completion](sessions.md#starting-a-session): provider initialization and identity establishment, plus supported acknowledgment of initial instruction submission (not an answer). |
| IF-SI-003 | The selected-session presentation must identify the session and its actual execution context according to the [session-header contract](../screens/workspace.md#ordered-regions). The workspace screen owns its composition and visibility; the [session/artifact screen](../screens/sessions-artifacts.md) owns picker and file-view composition. |
| IF-SI-004 | If the selected mode has no session, the body must say so and the footer must offer the start shortcut. |
| IF-SI-005 | If a session has ended, the body must prompt resume and identify the session-picker shortcut. |
| IF-SI-006 | The no-session and ended-session initial displays must be available immediately on application startup without requiring a keypress. |
| IF-SI-007 | A task row must show one dot for an active session in the selected mode only when activity evidence exists. It must show no dot when there is no activity evidence or no active session in that mode. The indicator must reflect observed state, not a saved historical lifecycle label, and use the [design-system status/activity colors](../DESIGN-SYSTEM.md#status-and-activity). |

#### Behavioral Flows

##### Select and attach to a running session

**Trigger:** The user selects a task with a running session in the selected mode.

**Preconditions:** The task has a running session.

**Flow:**

1. The application shows that active session and identifies its session and actual execution context.
2. Selecting the running session attaches the user without sending input or changing control.

**Postconditions:** The user is attached to the running session, with its input and control state unchanged by selection.

##### Start or resume a session

**Trigger:** The user invokes start for a mode with no session, or resume for an ended/stopped session.

**Preconditions:** The selected task and mode are available.

**Flow:**

1. With no session, the body identifies the absence and the footer offers the start shortcut; with an ended session, the body prompts resume and identifies the picker shortcut.
2. Starting follows the session startup contract; the session remains unavailable until its provider is initialized, identity is established, and supported initial-instruction submission acknowledgment is received (not an answer).
3. Resuming a stopped session follows the exact-conversation contract.

**Postconditions:** A starting session is unavailable until startup completion; a resumed session follows the exact-conversation contract.

##### Display session activity

**Trigger:** The application displays a task row.

**Preconditions:** The task has a selected mode.

**Flow:**

1. The application checks observed activity evidence for an active session in that mode.
2. It displays one dot when such evidence exists and no dot otherwise; it does not derive the indicator from a saved historical lifecycle label.

**Postconditions:** The row's dot represents observed activity for the selected mode.

#### Edge Cases and Failures

| Condition | Expected Behavior |
|---|---|
| The selected mode has no session at startup. | Immediately show the no-session body and start shortcut without requiring a keypress. |
| The selected session has ended. | Immediately show the resume prompt and session-picker shortcut without requiring a keypress. |
| A session is starting but startup completion conditions are not all met. | Keep the session unavailable. |
| A running session is selected. | Attach only; send no input and do not change control. |
| There is no activity evidence or no active session for the selected mode. | Show no activity dot. |
| A saved historical lifecycle label conflicts with observed activity. | Use observed activity, not the saved label, for the dot. |

#### Behavioral Invariants

- Selecting a running session is observational and does not submit input or change control.
- A starting session is unavailable until startup completion.
- The activity dot describes observed activity in the selected mode, never merely a saved historical lifecycle label.
- [Screen specifications](../screens/README.md) own screen composition; the [design system](../DESIGN-SYSTEM.md) owns shared visual rules. Interface behavior remains defined by this contract and its linked feature contracts.

#### Acceptance Criteria

- [ ] Select a running session and confirm it attaches without sending input or changing control.
- [ ] Start a session and confirm it remains unavailable until all startup-completion conditions are met.
- [ ] Select a stopped session and confirm resume follows the exact-conversation contract.
- [ ] Launch with no session and with an ended session in turn; confirm each correct body/footer state appears without a keypress.
- [ ] Compare active-session activity evidence against absent evidence and historical labels; confirm exactly one dot is shown only for observed active activity in the selected mode.

#### Open Decisions

| Question | Constraints | Status |
|---|---|---|

## Global Behavioral Invariants

- The activity dot describes observed activity in the selected mode, never merely a saved historical lifecycle label.
- [Screen specifications](../screens/README.md) own screen composition; the [design system](../DESIGN-SYSTEM.md) owns shared visual rules. Interface behavior remains defined by this contract and its linked feature contracts.

## Open Product Decisions

| Decision | Affected Features | Status |
|---|---|---|
