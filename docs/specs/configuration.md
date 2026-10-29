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

- An `init` command or setup wizard; prescribed mode sequences, required deliverables, or artifact-review gates; provider-owned configuration, data, or state changes.

## Actors

| Actor | Description |
|---|---|
| User | Configures settings and modes, selects task modes, and directs approval or mode deletion. |
| Agent / integration caller | Uses task configuration and may set approval in response to user direction or capture its current model. |
| Application | Resolves effective settings, applies mode behavior, and reports operation outcomes. |

## Functional Requirements

`default_assignee` and assignee task fields have no supported semantics in configuration, task input/frontmatter, output, search/filter surfaces, UI, CLI flags, or completions. Existing data is not rewritten to remove them; current unknown-input and custom-frontmatter schema rules still apply.

### CONFIG-001: TUI configuration

**Description:** Setup and all settings/configuration are available inside the TUI, not through an `init` command; a future wizard remains deferred. Explicit fresh-workspace initialization provisions required configuration, directories, state, lock parents, and the default mode catalogue under CONFIG-004. Ordinary startup and reads do not provision or repair missing required resources.

**Trigger:** User sets up or changes configuration.

**Preconditions:** Application is available.

**Behavior:**
1. Provide setup and configuration access in the TUI; do not require `init`.
2. Provision required resources and defaults during explicit fresh-workspace initialization; [task storage](tasks.md#task-006-task-storage-format) owns workspace/task resource requirements.
3. Require initialized resources for subsequent use. Optional settings and files retain their documented absence semantics; they do not justify substituting defaults for missing required state.

**Outcome:** User can configure the application from within the TUI.

**Failures:** Missing required configuration, state, directories, or catalogue fail the affected operation with a useful error; do not lazily recreate them.

**Acceptance Criteria:**
- [ ] Setup and settings can be accessed in the TUI; no `init` command is required.
- [ ] Explicit initialization provisions required resources; ordinary startup, reads, writes, and lock acquisition fail on missing required resources without repair.

### CONFIG-002: Editable project configuration

**Description:** The project's configuration, including agent presets and mode catalogue, lives in one user-editable configuration file; configuration and data stay openly accessible and editable. The public API is an integration convenience, not an exclusive access boundary.

**Trigger:** User or application reads or changes project configuration.

**Preconditions:** A project configuration exists.

**Behavior:**
1. Keep the listed project configuration in one file.
2. Permit direct user access and editing.
3. Use the supported `config.yml` filename at the configured location. Do not discover `config.yaml` or alternate old formats through compatibility paths.
4. Validate unknown file and mutation inputs against the current schemas at acceptance, preserving project-only mode ownership and existing security checks. Resolve omitted optional settings without rewriting files or repeatedly parsing accepted models.
5. Mutations read current persisted configuration under the same resource lock and save atomically; do not overwrite it from a stale instance cache. [Storage](../blueprints/storage.md) owns persistence mechanics.

**Outcome:** Users can inspect and edit configuration/data without relying exclusively on the public API.

**Failures:** Reject malformed or unsupported configuration without rewriting it. Missing required configuration/catalogue fails; an optional field's absence follows CONFIG-003 and its owning setting contract.

**Acceptance Criteria:**
- [ ] Agent presets and mode catalogue are present in the project's single user-editable configuration file.
- [ ] Configuration and data remain directly accessible and editable; API access is not exclusive.
- [ ] `config.yaml` is not discovered or converted; unknown inputs retain current schema checks and accepted objects are not repeatedly revalidated.
- [ ] Configuration mutations use current persisted state under the lock and atomic writes, preserving concurrent changes rather than writing stale cached state.

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

**Description:** A mode catalogue is required for workspace startup. Explicit fresh-workspace initialization creates exactly two editable built-in modes in PLAN-then-BUILD order, with PLAN as the default. PLAN is the planning mode with repository read access; BUILD is the implementation mode with repository read-write access. Mode artifact templates are optional, and approval metadata is informational rather than an execution gate. The editable default prompts are defined by [`getDefaultModeCatalog`](../../src/storage/config.ts). Users can add modes, rename labels, reorder modes, select a default, and delete modes as long as at least one remains. Once a catalogue exists, it is authoritative: do not merge or restore built-ins, including previously deleted built-ins. Mode contents and outputs are user-defined.

Seeding PLAN and BUILD does not require users to follow a PLAN-to-BUILD sequence or produce artifacts; the defaults do not constrain the user's workflow.

**Trigger:** Explicit workspace initialization, catalogue loading, or user catalogue edits.

**Preconditions:** Initialization targets a fresh workspace. Subsequent startup requires valid project configuration with a catalogue.

**Behavior:**
1. Create PLAN and BUILD during explicit fresh-workspace initialization only.
2. Load the required catalogue without seeding, merging defaults, or repairing missing data.
3. Support adding modes, renaming labels, reordering modes, defining prompts and optional deliverables, selecting a default, and deleting modes while at least one remains.

**Outcome:** The workspace uses the user-defined catalogue and selected default.

**Failures:** Missing, malformed, empty, or otherwise invalid catalogues fail startup and report the error; do not replace them (CONFIG-014).

**Acceptance Criteria:**
- [ ] Users can add modes, rename labels, reorder modes, define prompts and optional deliverables, and select a default.
- [ ] Explicit fresh-workspace initialization creates exactly PLAN and BUILD; ordinary startup does not create an absent catalogue or change an existing custom or one-mode catalogue.
- [ ] Users can delete any mode while at least one remains; deleting the last mode is refused.
- [ ] The workspace requires its mode catalogue at startup.

### CONFIG-005: Modes are categories

**Description:** Modes are categories, not a prescribed sequence; Plan, particular deliverables, and specific workflows are not required.

**Trigger:** User configures or uses a mode.

**Preconditions:** A mode exists.

**Behavior:**
1. Permit user-defined mode categories without imposing a workflow or deliverable set.

**Outcome:** The user controls the workflow and mode contents.

**Failures:** None.

**Acceptance Criteria:**
- [ ] A user-defined mode can be used without requiring Plan, specific deliverables, or a prescribed sequence.

### CONFIG-006: Task mode and session ownership

**Description:** Each task session belongs to one mode. Changing a task's selected mode changes its context without changing session execution or membership. Only the explicit move choice during [mode deletion](#config-012-confirmed-mode-deletion-cleanup) changes session membership. `Tab` changes the selected mode for the selected task, and each task remembers its own selection.

**Trigger:** User presses `Tab` to change the selected task's mode.

**Preconditions:** A task and mode catalogue exist.

**Behavior:**
1. Update and remember that task's selection.
2. Leave existing session ownership and execution unchanged.

**Outcome:** The task uses its selected context while sessions retain their owning modes.

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
5. Transform the fresh full task through its domain approval operation under the current-task lock, then persist through [TASK-025's `edit(task)` contract](tasks.md#task-025-complete-record-updates-and-edits). Use no approval override flag or special persistence path.

**Outcome:** Approval accurately indicates the task/mode state without imposing a workflow gate.

**Failures:** Apply TASK-025's two-save and notification failure outcomes; a durable approval change is not undone by a later notification failure.

**Acceptance Criteria:**
- [ ] The CLI can set approval for a specified task/mode in response to user direction; completing work alone does not.
- [ ] Approval does not depend on shared mode definitions or artifact contents/hashes.
- [ ] Further session activity clears only that task/mode approval; another task's approval remains unchanged.
- [ ] Approval is informational and does not block work on artifact review.
- [ ] Approval transforms the locked current task and persists the full result through ordinary edit semantics; unrelated fields survive and no persistence-control flag is required.

### CONFIG-008: Agent settings

**Description:** Retain named presets, editable mode prompts, default or explicit model selection, model discovery, and repository/task/artifact/subagent permission controls. Edits are staged until Save; cancel discards them. The [settings screen](../screens/settings.md) owns composition and focus behavior.

**Trigger:** User edits agent settings.

**Preconditions:** Agent settings are available in the TUI.

**Behavior:**
1. Stage supported edits.
2. Retain staged edits on Save and discard them on cancel.
3. Accept preset commands only as argv arrays: the first item is a non-empty executable and every item is a NUL-free string. Preserve empty later arguments. Do not convert string commands during startup, reading, or editing.

**Outcome:** Saved settings are retained; canceled edits have no effect.

**Failures:** Reject invalid command arrays and unsupported string commands at acceptance; leave existing configuration untouched.

**Acceptance Criteria:**
- [ ] Agent settings expose named presets, editable mode prompts, model selection/discovery, and the specified permission controls.
- [ ] Saving staged settings retains them; canceling discards them.
- [ ] Command arrays enforce the executable and NUL constraints while preserving empty later arguments; string commands fail without conversion or configuration rewrite.

### CONFIG-009: Permission enforcement disclosure

**Description:** Permission controls disclose their actual enforcement. Instruction-only controls are guidance, provider-enforced restrictions constrain execution, and explicit preset bypass flags may override configured permission restrictions even when YOLO is off. YOLO is a separate appended option. The UI must not claim restricted execution when bypass flags are present.

**Trigger:** User views or configures permissions.

**Preconditions:** Permission controls are available.

**Behavior:**
1. Identify instruction-only controls.
2. Describe their actual enforcement level.
3. Disclose when explicit preset bypass flags can override configured permission restrictions, independently of YOLO.
4. Treat YOLO as a separate appended option, not as the condition for preset bypass flags.

**Outcome:** Users can distinguish guidance from provider-enforced restrictions.

**Failures:** None.

**Acceptance Criteria:**
- [ ] Instruction-only permissions are labeled as guidance, preset bypass flags are disclosed as overriding configured restrictions even when YOLO is off, and restricted execution is not claimed when bypass flags are present.

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

**Description:** The provider-independent [current-model capture operation](supported-integration-operations.md#supported-integration-operations) sets the specified mode model in project configuration to a caller-supplied opaque model ID. The workspace does not impose a model-ID character grammar; provider availability and errors are handled as specified by CONFIG-010.

**Trigger:** Calling session invokes model capture.

**Preconditions:** The calling session has a current model and mode.

**Behavior:**
1. Store the supplied model ID as the specified mode's model in project configuration without applying a local character-grammar validation.

**Outcome:** Project configuration reflects the caller-supplied model ID for the specified mode.

**Failures:** See [error handling](../CONVENTIONS.md#error-handling).

**Acceptance Criteria:**
- [ ] Invoking capture records the supplied opaque model ID for the specified mode in project configuration without local character-grammar validation; provider availability and errors remain reported under CONFIG-010.

### CONFIG-012: Confirmed mode deletion cleanup

**Description:** Before deletion, let the user choose to discard the mode's sessions or move them into another chosen existing mode, and confirm the selected effects. Discard kills the affected running agents and removes their workspace-owned sessions; move preserves their identities, conversations, and executions. Sessions in other modes remain owned and unchanged. Never modify provider-owned configuration, data, or state.

**Trigger:** User requests mode deletion.

**Preconditions:** The mode exists, another mode remains, and the user confirms discard or selects a different existing destination mode and confirms move.

**Behavior:**
1. Offer discard or move to a chosen remaining mode, explain the selected effects, and request confirmation.
2. For discard, preflight all affected native cleanup targets before any batch stop effects under [native cleanup preflight](sessions.md#session-015-validate-batch-cleanup). Kill affected running agents before removing their workspace-owned sessions and tracking.
3. For move, transfer each affected session to the chosen mode on the same task without stopping, resuming, or replacing its execution. Preserve existing destination sessions; no particular transfer ordering is required.
4. Remove the source mode only after its sessions have been discarded or transferred. Keep ownership and observers for surviving sessions, including those in unaffected modes. Apply catalogue and task-selection fallback under CONFIG-013.
5. Preserve provider-owned state.
6. Notification failure does not undo durable effects or skip remaining required cleanup, catalogue changes, or task-reference cleanup. Report failures after required work is attempted, preserving execution tracking when cleanup fails.

**Outcome:** The source mode is removed; its sessions are either discarded or retained in the chosen destination, and unrelated sessions remain intact.

**Failures:** Rejection or failed preflight causes no deletion/batch stop effects. Later failure reports completed effects and incomplete work; notification failure does not roll back persistence or substitute for required cleanup.

**Acceptance Criteria:**
- [ ] The user can choose discard or move to another existing mode; confirmation explains the selected effects.
- [ ] Rejection or failed preflight occurs before effects.
- [ ] Discard kills affected running agents before removing their workspace-owned sessions; move preserves each affected session's identity, conversation, and live execution in the chosen mode.
- [ ] Existing destination and unrelated-mode sessions retain their ownership and observers; no particular transfer ordering is required.
- [ ] Provider-owned configuration, data, and state are unchanged.
- [ ] Later failure or interruption reports the error and completed effects.
- [ ] Notification failure leaves durable effects intact and does not prevent required cleanup or catalogue/reference changes; failed execution cleanup preserves tracking evidence.

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

**Description:** Startup requires the catalogue provisioned by explicit initialization under CONFIG-004. A missing, malformed, empty, or otherwise invalid catalogue fails startup and is reported without substitution or repair. Mode identifiers are unique names and have no version scheme; see the [architecture contract](../BLUEPRINT.md).

**Trigger:** Application startup loads the mode catalogue.

**Preconditions:** Workspace initialization is separate from startup loading.

**Behavior:**
1. Load required project modes without initializing absent data.
2. Validate unknown stored configuration at acceptance and proceed only with a valid catalogue.

**Outcome:** Startup proceeds only with a successfully loaded catalogue.

**Failures:** Missing or invalid catalogues fail startup and report the error; they are not replaced or repaired.

**Acceptance Criteria:**
- [ ] Missing, empty, or invalid catalogues prevent startup and report the load error without substitution, initialization, or repair.
- [ ] Mode identifiers are unique names and do not use a version scheme.

### CONFIG-015: Priority labels

**Description:** Project configuration defines `priorities` as an ordered `string[]`, defaulting to `["High", "Medium", "Low"]`. A task stores and displays the selected configured label directly; priority has no separate normalized value. Only the current format is supported; existing values are not migrated or rewritten.

**Trigger:** Priority configuration is loaded or a task priority is created, edited, or displayed.

**Preconditions:** Project configuration is available.

**Behavior:**
1. Use the ordered configured priority labels, with the stated default when unspecified.
2. Store and display a task's priority as the configured label itself.
3. Validate supplied values against current configuration/input schemas; do not map old label/value pairs or normalize stored labels through a compatibility path.
4. Do not migrate or rewrite priority values during load.

**Outcome:** Supported task priorities are exact configured labels; existing stored data is not converted.

**Failures:** Reject unsupported input/record formats under their accepting schema; leave stored data unchanged and apply [TASK-007](tasks.md#task-007-malformed-records) to malformed task records.

**Acceptance Criteria:**
- `priorities` is an ordered string array with the stated default; task priority is the label, without paired label/value entries.
- Unsupported old formats are not mapped or migrated; invalid input is reported under the accepting schema without rewriting existing data.

### CONFIG-016: Date format tokens

**Description:** `date_format` is a case-sensitive Luxon date-only pattern, defaulting to `yyyy-MM-dd`. Timestamp display appends fixed `HH:mm` separately. Patterns containing time tokens are unsupported. Old syntax is not converted; startup and loading never rewrite configuration.

**Trigger:** A date is configured or displayed.

**Preconditions:** Configuration and date values are available.

**Behavior:**
1. Interpret `date_format` as a case-sensitive Luxon date-only pattern, defaulting to `yyyy-MM-dd`.
2. Render a date-only value with that pattern. Render a timestamp with the date pattern followed by fixed `HH:mm`; do not accept configured time tokens.
3. Reject unsupported patterns under the current configuration schema, without an old-syntax conversion or alias lookup.
4. Never rewrite date configuration during startup or load.

**Outcome:** Date formatting uses a date-only Luxon pattern; timestamp time is appended separately as `HH:mm`.

**Failures:** Report unsupported patterns and leave existing configuration unchanged.

**Acceptance Criteria:**
- `date_format` is a case-sensitive Luxon date-only pattern; default is `yyyy-MM-dd`. Configured time tokens are unsupported.
- Date-only values use the pattern; timestamps append fixed `HH:mm` separately.
- Unsupported patterns fail without conversion; startup/load does not rewrite configuration.

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
- Defaults for required resources are provisioned by explicit initialization; absent optional settings may inherit without creating files or repairing missing required state.
- Current schemas accept unknown inputs once; atomic persistence, lock ownership, and security containment remain required.

### Task mode and session ownership

**States:**

| State | Meaning |
|---|---|
| Selected task mode | The task's independently remembered context selection. |
| Session owning mode | The mode containing an existing session; only confirmed mode-deletion transfer changes membership. |

**Transitions:**

| From | Trigger | To | Required Behavior |
|---|---|---|---|
| Selected task mode | User presses `Tab` | New selected mode | Change only that task's context; existing sessions retain their owning mode. |

**Invariants:**
- Task selection changes neither a session's owning mode nor execution; membership changes only under CONFIG-012.
- Modes are user-defined categories without prescribed sequence or required deliverable set.

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
- Approval changes use the locked full-task domain transformation and TASK-025 edit contract.

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
| Uninitialized workspace | Required configuration and catalogue have not been explicitly provisioned. |
| Available catalogue | Project-defined set of modes and its selected default. |

**Transitions:**

| From | Trigger | To | Required Behavior |
|---|---|---|---|
| Fresh uninitialized workspace | Explicit initialization | Available catalogue | Provision PLAN and BUILD with PLAN as default. |
| Missing or invalid required catalogue | Ordinary startup | Startup failed | Report the error without seeding or repair. |
| Available catalogue | Delete a non-last mode | Updated catalogue | Remove it and apply the deletion fallback described by CONFIG-013. |

**Invariants:**
- The catalogue is required for startup; failure to load it fails startup and reports the error.
- Startup and reads never seed a missing catalogue or restore built-ins to an existing one.
- Mode identifiers are unique names without a version scheme.
- The catalogue always retains at least one mode and a valid default.

## User Interactions

### Configuration, mode, and agent settings management

**Context:** In the TUI when managing configuration, task modes, or agent settings; mode deletion is requested for a configured mode. An agent may set approval in response to user direction.

**Action:** User edits settings and saves or cancels; changes a selected task mode with `Tab`; or confirms mode deletion after reviewing its effects. An agent sets task-and-mode approval at user direction.

**Response:** Settings are retained on Save and discarded on cancel; each task remembers its own mode selection; mode deletion follows CONFIG-012's discard-or-move choice and refuses deletion of the last mode. Approval applies only to the specified task/mode, and further session activity in that mode clears it.

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
- Required resource loss fails without lazy repair. Atomic, locked mutations use current persisted state; post-save notification failure does not undo effects or skip required cleanup.

### Security

- Mode deletion does not modify provider-owned configuration, data, or state.

### Compatibility

- Configuration and data remain directly accessible and editable; API access is not exclusive.
- Current configuration formats and `config.yml` only; no string-command, priority, date-format, deprecated-key, or filename migration/alias path. Existing files and migration manifests remain untouched.

## Edge Cases

| Condition | Required Behavior |
|---|---|
| Catalogue cannot load at startup | Fail startup and report the error; do not substitute a catalogue. |
| Required catalogue, configuration, directory, or state is missing | Fail the affected operation; do not initialize or repair it during an ordinary read/write. |
| An optional setting is omitted | Apply its documented default or inheritance without rewriting configuration. |
| A preset command is a string, an old format is supplied, or only `config.yaml` exists | Apply current schemas and supported filename rules; do not convert, discover an alias, or rewrite existing data. |
| Configuration changed since an instance cached it | Mutate the current persisted configuration under the lock rather than overwriting from cache. |
| Model discovery fails or configured model is unavailable | Retain selected model and show the problem; do not silently substitute. |
| Provider adapter is missing / has no discovery | Report unsupported preset / return empty model list, respectively. |
| Native cleanup validation rejects deletion | Reject before deletion or batch stop effects. |
| Mode deletion fails or is interrupted after preflight | Report error and completed effects. |
| A task edit's second save or post-save notification fails during approval | Apply TASK-025's partial-effect reporting; do not claim rollback of the first save. |
| A notification fails during mode deletion | Keep durable effects and continue required cleanup/configuration/reference work; report notification and cleanup errors. |
| User cancels staged settings | Discard staged edits. |
| User deletes the last mode | Refuse deletion; retain the mode. |

## Open Questions

| Question | Impact | Status |
|---|---|---|
| Which exact session events count as “further session activity” that clears approval? | Determines the precise approval-clearing trigger; the rule remains that further activity in the approved task's mode clears only that task/mode approval. | Open |
