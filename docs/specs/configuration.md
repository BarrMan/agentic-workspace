# Product Requirements: Configuration and Modes

## Overview

Define configuration access and precedence, configurable modes and task-scoped approval, agent settings, model selection, and mode deletion.

## Goals

- Let users configure workspace behavior and agent settings while keeping mode and approval behavior under user control.
- Keep configuration and data openly accessible and editable.

## Scope

### In Scope

- TUI setup and settings; project configuration; task-effective settings; mode catalogue and task mode selection; task/mode approval; agent presets, prompts, models, permissions, and mode deletion.

### Out of Scope

- An `init` command or setup wizard; prescribed mode sequences, required documents, or artifact-review gates; provider-owned configuration, data, or state changes.

## Actors

| Actor | Description |
|---|---|
| User | Configures settings and modes, selects task modes, and directs approval or mode deletion. |
| Agent / integration caller | Uses task configuration and may set approval in response to user direction or capture its current model. |
| Application | Resolves effective settings, applies mode behavior, and reports operation outcomes. |

## Functional Requirements

### CONFIG-001: TUI configuration

**Description:** Setup and all settings/configuration are available inside the TUI, not through an `init` command; a future wizard remains deferred.

**Trigger:** User sets up or changes configuration.

**Preconditions:** Application is available.

**Behavior:**
1. Provide setup and configuration access in the TUI; do not require `init`.

**Outcome:** User can configure the application from within the TUI.

**Failures:** None.

**Acceptance Criteria:**
- [ ] Setup and settings can be accessed in the TUI; no `init` command is required.

### CONFIG-002: Editable project configuration

**Description:** The project's configuration, including agent presets and mode catalogue, lives in one user-editable configuration file; configuration and data stay openly accessible and editable. The public API is an integration convenience, not an exclusive access boundary.

**Trigger:** User or application reads or changes project configuration.

**Preconditions:** A project configuration exists.

**Behavior:**
1. Keep the listed project configuration in one file.
2. Permit direct user access and editing.

**Outcome:** Users can inspect and edit configuration/data without relying exclusively on the public API.

**Failures:** None.

**Acceptance Criteria:**
- [ ] Agent presets and mode catalogue are present in the project's single user-editable configuration file.
- [ ] Configuration and data remain directly accessible and editable; API access is not exclusive.

### CONFIG-003: Effective configuration precedence

**Description:** Resolve settings field by field: task overrides project, which overrides root; unspecified fields inherit and explicit false overrides inherited true. Starting, resuming, and asking an agent use the task's current effective configuration.

**Trigger:** A task is started, resumed, or an agent is asked to act.

**Preconditions:** Root, project, and task settings may supply fields.

**Behavior:**
1. Resolve each field task > project > root, preserving explicit false values.
2. Use the resolved configuration for the operation.

**Outcome:** The operation uses the task's current effective configuration.

**Failures:** None.

**Acceptance Criteria:**
- [ ] Given root and project values of false and task true, the effective value is true.
- [ ] Given inherited true and task false, the effective value is false; other unspecified fields inherit.
- [ ] A later start, resume, or ask uses the current resolved configuration.

### CONFIG-004: Configurable mode catalogue

**Description:** A mode catalogue is required for workspace startup. Modes are dynamic and configurable; users define modes and instructions, including whether a mode produces documents, and can add modes, rename labels, reorder modes, and select a default. Mode contents and outputs are user-defined.

**Trigger:** Workspace startup or user catalogue edits.

**Preconditions:** The project catalogue is available.

**Behavior:**
1. Load the catalogue.
2. Support adding modes, renaming labels, reordering modes, defining prompts and optional documents, and selecting a default.

**Outcome:** The workspace uses the user-defined catalogue and selected default.

**Failures:** Catalogue load failures fail startup and report the error (CONFIG-014).

**Acceptance Criteria:**
- [ ] Users can add modes, rename labels, reorder modes, define prompts and optional documents, and select a default.
- [ ] The workspace requires its mode catalogue at startup.

### CONFIG-005: Modes are categories

**Description:** Modes are categories, not a prescribed sequence; Plan, particular documents, and specific workflows are not required.

**Trigger:** User configures or uses a mode.

**Preconditions:** A mode exists.

**Behavior:**
1. Permit user-defined mode categories without imposing a workflow or document set.

**Outcome:** The user controls the workflow and mode contents.

**Failures:** None.

**Acceptance Criteria:**
- [ ] A user-defined mode can be used without requiring Plan, specific documents, or a prescribed sequence.

### CONFIG-006: Task mode and session ownership

**Description:** Each task session belongs to one fixed mode. Changing a task's selected mode changes its context without changing session execution; sessions retain their owning mode. `Tab` changes the selected mode for the selected task, and each task remembers its own selection.

**Trigger:** User presses `Tab` to change the selected task's mode.

**Preconditions:** A task and mode catalogue exist.

**Behavior:**
1. Update and remember that task's selection.
2. Leave existing session ownership and execution unchanged.

**Outcome:** The task uses its selected context while sessions retain their fixed owning modes.

**Failures:** None.

**Acceptance Criteria:**
- [ ] Pressing `Tab` changes and remembers the selected task's mode independently of other tasks.
- [ ] Changing the selected mode does not change an existing session's owning mode or execution.

### CONFIG-007: Task-and-mode approval

**Description:** Approval is scoped to a task and mode, independent of shared mode definitions and artifact contents/hashes. A CLI command lets an agent set approval in response to user direction. Finishing work alone does not grant approval; further session activity in the approved task/mode clears approval. Approval is informational, not an artifact-review gate.

**Trigger:** Agent sets approval at user direction, or further session activity occurs.

**Preconditions:** The specified task and mode exist.

**Behavior:**
1. Set approval only for the specified task and mode when an agent acts in response to user direction.
2. Do not infer approval from finished work.
3. Clear only that task/mode's approval when further session activity occurs in that mode.
4. Do not use approval as a workflow gate or depend on shared mode definitions or artifact contents/hashes.

**Outcome:** Approval accurately indicates the task/mode state without imposing a workflow gate.

**Failures:** None.

**Acceptance Criteria:**
- [ ] The CLI can set approval for a specified task/mode in response to user direction; completing work alone does not.
- [ ] Approval does not depend on shared mode definitions or artifact contents/hashes.
- [ ] Further session activity clears only that task/mode approval; another task's approval remains unchanged.
- [ ] Approval is informational and does not block work on artifact review.

### CONFIG-008: Agent settings

**Description:** Retain named presets, editable mode prompts, default or explicit model selection, model discovery, and repository/task/artifact/subagent permission controls. Edits are staged until Save; cancel discards them. The [settings screen](../screens/settings.md) owns composition and focus behavior.

**Trigger:** User edits agent settings.

**Preconditions:** Agent settings are available in the TUI.

**Behavior:**
1. Stage supported edits.
2. Retain staged edits on Save and discard them on cancel.

**Outcome:** Saved settings are retained; canceled edits have no effect.

**Failures:** None.

**Acceptance Criteria:**
- [ ] Agent settings expose named presets, editable mode prompts, model selection/discovery, and the specified permission controls.
- [ ] Saving staged settings retains them; canceling discards them.

### CONFIG-009: Permission enforcement disclosure

**Description:** Instruction-only permissions remain available and are clearly identified as guidance, distinct from provider-enforced restrictions. UI describes actual enforcement rather than presenting instructions as filesystem isolation.

**Trigger:** User views or configures permissions.

**Preconditions:** Permission controls are available.

**Behavior:**
1. Identify instruction-only controls.
2. Describe their actual enforcement level.

**Outcome:** Users can distinguish guidance from provider-enforced restrictions.

**Failures:** None.

**Acceptance Criteria:**
- [ ] Instruction-only permissions are labeled as guidance and are not described as filesystem isolation.

### CONFIG-010: Model discovery and availability

**Description:** If model discovery fails or a configured model is unavailable, retain the selected model and show the problem. A missing provider adapter produces an unsupported-preset error; an adapter without discovery returns an empty model list. Model changes require user choice, not silent substitution.

**Trigger:** Model discovery, preset use, or model selection.

**Preconditions:** A provider preset or configured model is selected.

**Behavior:**
1. Preserve the selection on discovery or availability errors and report the problem.
2. Report an unsupported-preset error when the provider adapter is missing.
3. Return an empty model list when an adapter has no discovery capability.
4. Require user choice before changing a model.

**Outcome:** The selected model is preserved unless the user chooses another.

**Failures:** Report the applicable problem without substituting a model.

**Acceptance Criteria:**
- [ ] Discovery failure or unavailable configured model retains the selection and displays the problem.
- [ ] Missing adapter reports unsupported preset; an adapter without discovery returns an empty model list.
- [ ] No model substitution occurs without user choice.

### CONFIG-011: Capture current model

**Description:** The provider-independent [current-model capture operation](supported-integration-operations.md#supported-integration-operations) sets the calling session's mode model in project configuration to the model that session currently uses.

**Trigger:** Calling session invokes model capture.

**Preconditions:** The calling session has a current model and mode.

**Behavior:**
1. Store that session's current model as its mode model in project configuration.

**Outcome:** Project configuration reflects the calling session's current model for its mode.

**Failures:** See [error handling](../CONVENTIONS.md#error-handling).

**Acceptance Criteria:**
- [ ] Invoking capture records the calling session's current model for its mode in project configuration.

### CONFIG-012: Confirmed mode deletion cleanup

**Description:** Before deletion, ask for confirmation and explain that workspace-owned sessions will be removed and running agents killed. After confirmation, validate all relevant native cleanup targets before any batch stop effects, following [native cleanup preflight](sessions.md#session-013-stop-while-retaining-identity). Rejection precedes effects. On later failure or interruption, report the error and completed effects. Remove the mode and its sessions and kill its running agents; sessions are removed, not transferred. Never modify provider-owned configuration, data, or state.

**Trigger:** User requests mode deletion.

**Preconditions:** The mode exists and user confirms deletion.

**Behavior:**
1. Explain deletion effects and request confirmation.
2. After confirmation, preflight all relevant native cleanup targets before batch stop effects.
3. After successful validation, kill running agents and remove workspace-owned sessions and the mode.
4. Preserve provider-owned state and do not transfer session history.

**Outcome:** The mode and its sessions are removed; session history is not transferred.

**Failures:** Rejection or failed preflight causes no deletion/batch stop effects. A later failure or interruption is reported with completed effects.

**Acceptance Criteria:**
- [ ] The confirmation explains session removal and running-agent termination.
- [ ] Rejection or failed preflight occurs before effects.
- [ ] Successful deletion removes the mode and its sessions and kills its running agents without transferring session history.
- [ ] Provider-owned configuration, data, and state are unchanged.
- [ ] Later failure or interruption reports the error and completed effects.

### CONFIG-013: Catalogue deletion and task fallback

**Description:** Deleting a mode removes it from the project catalogue. Tasks that selected it fall back to the catalogue default; deleting the last mode is refused. If the deleted mode is the current default, the first remaining mode in catalogue order becomes the new default and remains selectable by the user.

**Trigger:** A mode is deleted after confirmation and cleanup.

**Preconditions:** The mode exists; at least one other mode remains.

**Behavior:**
1. Remove the mode from the project catalogue.
2. If it was the default, make the first remaining mode in catalogue order the new default.
3. Update every task that selected the deleted mode to the catalogue default.

**Outcome:** The catalogue has a valid default and affected tasks select it.

**Failures:** Refuse deletion of the last mode.

**Acceptance Criteria:**
- [ ] Deleting a non-default mode removes it and tasks that selected it fall back to the existing catalogue default.
- [ ] Deleting the default makes the first remaining mode in catalogue order the default; it can subsequently be changed by user selection.
- [ ] Deleting the last mode is refused and the mode remains in the catalogue.

### CONFIG-014: Catalogue startup failure

**Description:** If the mode catalogue cannot be loaded at startup, the application fails and reports the error rather than substituting one. Mode identifiers are unique names and have no version scheme; see the [architecture contract](../BLUEPRINT.md).

**Trigger:** Application startup loads the mode catalogue.

**Preconditions:** A project catalogue is configured.

**Behavior:**
1. Load the catalogue.
2. Proceed with startup only if the catalogue loads successfully.

**Outcome:** Startup proceeds only with a successfully loaded catalogue.

**Failures:** A load failure fails startup and reports the error.

**Acceptance Criteria:**
- [ ] Catalogue load failure prevents startup and reports the load error without substituting a catalogue.
- [ ] Mode identifiers are unique names and do not use a version scheme.

## States and Transitions

### Configuration

**States:**

| State | Meaning |
|---|---|
| Effective configuration | Current field-by-field task, project, and root resolution. |

**Transitions:**

| From | Trigger | To | Required Behavior |
|---|---|---|---|
| Configuration inputs | Start, resume, or ask | Effective configuration | Resolve each field task > project > root; explicit false overrides inherited true. |

**Invariants:**
- A task's effective configuration is resolved field by field and used by its operations.

### Task mode and session ownership

**States:**

| State | Meaning |
|---|---|
| Selected task mode | The task's independently remembered context selection. |
| Session owning mode | The fixed mode assigned to an existing session. |

**Transitions:**

| From | Trigger | To | Required Behavior |
|---|---|---|---|
| Selected task mode | User presses `Tab` | New selected mode | Change only that task's context; existing sessions retain their owning mode. |

**Invariants:**
- A session's owning mode remains fixed; task selection does not change session execution.
- Modes are user-defined categories without prescribed sequence or required document set.

### Task/mode approval

**States:**

| State | Meaning |
|---|---|
| Unapproved | The task/mode has no approval recorded. |
| Approved | The task/mode has approval recorded. |

**Transitions:**

| From | Trigger | To | Required Behavior |
|---|---|---|---|
| Unapproved task/mode | Agent sets approval on user direction | Approved task/mode | Record approval only for that task and mode. |
| Approved task/mode | Further session activity in that mode | Unapproved task/mode | Clear that task/mode's approval. |

**Invariants:**
- Approval is task-and-mode scoped, informational, and not an artifact-review gate.

### Agent settings

**States:**

| State | Meaning |
|---|---|
| Current settings | Saved agent settings. |
| Staged settings | Unsaved agent-setting edits. |

**Transitions:**

| From | Trigger | To | Required Behavior |
|---|---|---|---|
| Current settings | User edits | Staged settings | Hold edits until Save or cancel. |
| Staged settings | Save / cancel | Saved / prior settings | Save retains edits; cancel discards them. |

**Invariants:**
- None.

### Mode catalogue

**States:**

| State | Meaning |
|---|---|
| Available catalogue | Project-defined set of modes and its selected default. |

**Transitions:**

| From | Trigger | To | Required Behavior |
|---|---|---|---|
| Available catalogue | Delete a non-last mode | Updated catalogue | Remove it and apply the deletion fallback described by CONFIG-013. |

**Invariants:**
- The catalogue is required for startup; failure to load it fails startup and reports the error.
- Mode identifiers are unique names without a version scheme.
- The catalogue always retains at least one mode and a valid default.

## User Interactions

### Configuration, mode, and agent settings management

**Context:** In the TUI when managing configuration, task modes, or agent settings; mode deletion is requested for a configured mode. An agent may set approval in response to user direction.

**Action:** User edits settings and saves or cancels; changes a selected task mode with `Tab`; or confirms mode deletion after reviewing its effects. An agent sets task-and-mode approval at user direction.

**Response:** Settings are retained on Save and discarded on cancel; each task remembers its own mode selection; deletion removes the mode and its sessions and refuses deletion of the last mode. Approval applies only to the specified task/mode, and further session activity in that mode clears it.

**Feedback:** Deletion effects are explained before confirmation; catalogue load, model discovery, model availability, and deletion failures are reported as specified above. No other interaction feedback is specified.

## External Behavior

### Configuration file and integrations

**Purpose:** Allow users and integrations to configure and use workspace behavior.

**Inputs:** One user-editable project configuration file, root/project/task settings, mode catalogue, and integration operation inputs.

**Outputs:** Effective task settings; mode and agent behavior; the calling session's current model captured in project configuration.

**Failures:** A missing or unloadable mode catalogue prevents startup and reports the error. Model discovery failure or unavailable configured model retains the selected model and displays the problem. See [error handling](../CONVENTIONS.md#error-handling).

## Non-Functional Requirements

### Performance

- None.

### Reliability

- Catalogue load failure prevents startup and reports the error without substituting a catalogue.
- Model discovery failure or an unavailable configured model retains the selection and displays the problem.

### Security

- Mode deletion does not modify provider-owned configuration, data, or state.

### Compatibility

- Configuration and data remain directly accessible and editable; API access is not exclusive.

## Edge Cases

| Condition | Required Behavior |
|---|---|
| Catalogue cannot load at startup | Fail startup and report the error; do not substitute a catalogue. |
| Model discovery fails or configured model is unavailable | Retain selected model and show the problem; do not silently substitute. |
| Provider adapter is missing / has no discovery | Report unsupported preset / return empty model list, respectively. |
| Native cleanup validation rejects deletion | Reject before deletion or batch stop effects. |
| Mode deletion fails or is interrupted after preflight | Report error and completed effects. |
| User cancels staged settings | Discard staged edits. |
| User deletes the last mode | Refuse deletion; retain the mode. |

## Open Questions

| Question | Impact | Status |
|---|---|---|
| Which exact session events count as “further session activity” that clears approval? | Determines the precise approval-clearing trigger; the rule remains that further activity in the approved task's mode clears only that task/mode approval. | Open |
