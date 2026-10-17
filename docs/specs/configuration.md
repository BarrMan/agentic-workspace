# Product Specification: Configuration and Modes

## Overview

This feature contract defines configuration access and precedence, configurable modes and task-scoped approval, agent settings, model selection, and mode deletion.

## Features

| Feature | Description | Contract |
|---|---|---|
| Configuration and modes | Configure effective task settings, modes, agent settings, and mode lifecycle behavior. | Configuration and Modes |

## Feature Contracts

### Configuration and Modes

#### Purpose

Allow users to configure workspace behavior and agent settings while keeping mode and approval behavior under user control.

#### Requirements

| ID | Requirement |
|---|---|
| [CONFIG-001] | Setup and all settings/configuration MUST be available inside the TUI; setup MUST NOT be performed by an `init` command. A future wizard remains deferred. |
| [CONFIG-002] | The project's configuration, including agent presets and the mode catalogue, MUST live in one user-editable configuration file. Configuration and data files MUST remain openly accessible and editable; the public API is an integration convenience, not an exclusive access boundary. |
| [CONFIG-003] | Resolve configuration consistently field by field: explicitly supplied task settings override project settings, which override root settings. Unspecified fields inherit, and an explicit `false` overrides an inherited `true`. Starting, resuming, and asking an agent MUST use the task's current effective configuration. |
| [CONFIG-004] | The mode catalogue MUST be present for the workspace to start. Modes MUST be dynamic and configurable; users choose modes and their instructions, including whether a mode produces any documents. Mode contents and outputs are user-defined. |
| [CONFIG-005] | Modes MUST be categories, not a prescribed sequence. The application MUST NOT require Plan, particular documents, or a specific workflow. |
| [CONFIG-006] | Each task session MUST belong to one fixed mode. Changing the selected mode for a task MUST change the task's context without changing session execution; sessions retain their owning mode. Pressing `Tab` changes the selected mode for the selected task, and each task remembers its own selection. |
| [CONFIG-007] | Approval MUST be scoped to a particular task and mode, independent of shared mode definitions and artifact contents or hashes. A CLI command MUST allow an agent to set approval in response to the user's direction. Finishing work alone MUST NOT grant approval. Further session activity in that task's mode MUST clear its approval. Approval is informational; the user controls the workflow without an application-imposed artifact-review gate. |
| [CONFIG-008] | Agent settings MUST retain named presets, editable mode prompts, default or explicit model selection, model discovery, and repository/task/artifact/subagent permission controls. Edits MUST be staged until **Save**; canceling MUST discard staged changes. The [settings screen](../screens/settings.md) owns composition and focus behavior. |
| [CONFIG-009] | Instruction-only permissions MUST remain available and be clearly identified as guidance, distinct from provider-enforced restrictions. The UI MUST describe their actual enforcement level rather than presenting instructions as filesystem isolation. |
| [CONFIG-010] | If model discovery fails or a configured model is unavailable, retain the selected model and show the problem. Changing the model MUST require a user choice rather than a silent substitution. |
| [CONFIG-011] | The provider-independent [current-model capture operation](supported-integration-operations.md#supported-integration-operations) MUST set the calling session's mode model in project configuration to the model that session currently uses. |
| [CONFIG-012] | Before deleting a mode, ask the user to confirm and explain that the mode's workspace-owned sessions will be removed and running agents killed. After confirmation, validate all relevant native cleanup targets before any batch stop effects, following [native cleanup preflight](sessions.md#stop-and-resume-a-session). A rejection MUST happen before effects. If any later step fails or is interrupted, report the error and stop without continuing, automatic recovery, retry, or rollback; report completed effects. Remove the mode and its sessions and kill their running agents. Mode deletion removes those sessions rather than transferring their history to another mode. Provider-owned configuration, data, and state are never modified. |

#### Behavioral Flows

##### Resolve and use task configuration

**Trigger:** A task is started, resumed, or an agent is asked to act.

**Preconditions:** Root, project, and task settings may supply configuration fields.

**Flow:**

1. Resolve each field using task settings before project settings before root settings.
2. Inherit values for unspecified fields; use an explicitly supplied `false` instead of inherited `true`.
3. Use the resolved configuration for the start, resume, or ask operation.

**Postconditions:** The operation uses the task's current effective configuration.

##### Select and approve a task mode

**Trigger:** The user changes a task's selected mode, or an agent sets approval in response to user direction.

**Preconditions:** The workspace has a mode catalogue and the task exists.

**Flow:**

1. Pressing `Tab` changes the selected mode for the selected task and preserves that task's independent selection.
2. Changing selection does not change session execution or the fixed owning mode of existing sessions.
3. Approval applies only to the specified task and mode; session activity in that task's approved mode clears it.

**Postconditions:** The selected task context and its approval indication reflect the action without changing another task's approval.

##### Edit agent settings

**Trigger:** The user edits settings.

**Preconditions:** Agent settings are available in the TUI.

**Flow:**

1. Stage changes to presets, mode prompts, models, or permission controls.
2. On **Save**, retain the staged changes.
3. On cancel, discard the staged changes.

**Postconditions:** Saved settings are retained; canceled edits have no effect.

##### Delete a mode

**Trigger:** The user requests deletion of a mode.

**Preconditions:** The mode exists.

**Flow:**

1. Ask for confirmation and explain that the mode's sessions will be removed and its running agents killed.
2. After confirmation, validate all relevant native cleanup targets before any batch stop effects.
3. If validation rejects the deletion, stop before effects. Otherwise kill the mode's running agents, then remove its workspace-owned records, leaving provider-owned state untouched. If any step fails or is interrupted, report the error and stop without continuing, automatic recovery, retry, or rollback.

**Postconditions:** Deleted mode sessions are removed, not transferred; a later partial failure is not treated as transactional rollback.

#### Edge Cases and Failures

| Condition | Expected Behavior |
|---|---|
| A field is unspecified at the task level. | It inherits the project value, or the root value if not supplied by the project. |
| Task setting is explicitly `false` while inherited setting is `true`. | Use `false`; other unspecified fields continue to inherit. |
| Approval is granted to one task and mode. | Another task's approval remains unchanged. |
| Model discovery fails or the configured model is unavailable. | Retain the selected model and show the problem; do not silently substitute a model. |
| A permission is instruction-only. | Identify it as guidance and describe its actual enforcement level; do not represent it as filesystem isolation. |
| Native cleanup validation rejects a mode deletion. | No deletion or batch stop effects occur. |
| Mode deletion fails or is interrupted after preflight. | Report the error and completed effects, then stop without continuing, automatic recovery, retry, or rollback. |

#### Behavioral Invariants

- A task's effective configuration is resolved field by field, and operations use its current resolution.
- A session's owning mode remains fixed; changing task selection does not change session execution.
- Approval is task-and-mode scoped, informational, and not an artifact-review gate.
- Modes remain user-defined categories without a prescribed sequence or required document set.

#### Acceptance Criteria

- [ ] Given root and project worktree settings of `false` and a task override of `true`, the effective value is `true`.
- [ ] Given an inherited `true` and explicit task `false`, the effective value is `false`; other unspecified fields still inherit.
- [ ] A later start, resume, or ask uses the current resolved configuration.
- [ ] Approving task A's mode leaves task B's approval unchanged; further session activity in A's approved mode clears that indication.
- [ ] A user can configure modes with arbitrary prompts and optional files; approval and session actions still operate by task and mode.
- [ ] Canceling staged settings discards them, and saving retains them.
- [ ] Failed model discovery or an unavailable configured model preserves the selected model and displays the problem without substituting another model.
- [ ] Rejected deletion preflight causes no effects; successful deletion removes the mode and its sessions and kills its running agents without transferring session history.

#### Open Decisions

| Question | Constraints | Status |
|---|---|---|
| What are the default/last-mode handling and cross-task extent for mode deletion? | Deletion requires confirmation and cleanup preflight, removes the mode's sessions rather than transferring history, and failure stops the operation without automatic recovery, retry, or rollback. | Open |
| What is the startup failure ordering when the mode catalog cannot be loaded? | Startup requires a mode catalog; no fallback or default catalog is approved. | Open |
| How is the mode catalog seeded and identified, and are mode IDs versioned or syntactically constrained? | Setup happens in the TUI; there is no `init` command. | Open |

## Global Behavioral Invariants

- Configuration and data files remain openly accessible and editable; the public API is not an exclusive access boundary.
- Users control the workflow; approval does not impose an artifact-review gate.

## Open Product Decisions

None recorded in this feature contract beyond the mode-deletion decision above.
