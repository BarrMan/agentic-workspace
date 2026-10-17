---
consolidation:
  total: 195
  counts:
    exists: 61
    discard: 36
    integrate: 0
    unconfirmed: 98
  percentages:
    exists: 31.28%
    discard: 18.46%
    integrate: 0.00%
    unconfirmed: 50.26%
---
# Follow-up questionnaire — round 2
> **Non-authoritative supporting material.** This file is not a contract. Authoritative owner(s): [PRODUCT](PRODUCT.md), [SPEC](SPEC.md), [BLUEPRINT](BLUEPRINT.md), [CONVENTIONS](CONVENTIONS.md), [DESIGN-SYSTEM](DESIGN-SYSTEM.md), [screens](screens/README.md), [ADRs](adr/README.md).
> Disposition: Mixed — see markers.

These are the remaining decisions identified so far, not a claim that every requirement is settled. Previous answers remain in effect. <!-- consolidation: unconfirmed; ref: none; reason: Accepted decisions remain authoritative while unresolved inventory does not approve behavior. -->

Answer **Yes** to accept a recommendation, or write your preferred behavior. **Unsure** is useful too. Blank answers approve nothing. Each question is self-contained; no other document needs to be open. <!-- consolidation: unconfirmed; ref: none; reason: Unanswered recommendations are not approval. -->

## Sessions and configuration

### 1. Remembering why an old session ended
**Context:** Conversations can remain resumable without saving a historical running/stopped/failed label. <!-- consolidation: exists; ref: docs/specs/sessions.md#sessions; reason: Retained conversation identity does not require saved lifecycle labels. -->
**Question:** May we forget whether an old session was stopped deliberately or failed, once its runtime evidence is gone? <!-- consolidation: exists; ref: docs/specs/sessions.md#sessions; reason: Accepted answer explicitly permits losing the historical stopped-versus-failed distinction. -->
**Recommendation:** Yes. Preserve conversations and resume identity, report errors when they happen, and retain unfinished cleanup information—but no permanent status history. <!-- consolidation: exists; ref: docs/specs/sessions.md#sessions; reason: Accepted identity, ephemeral state, immediate errors and unfinished-operation evidence are specified. -->
**Answer:**
We don't care whether it stopped deliberately or failed. We have a session id? Do we know the runtime state of this session? Yes - perfect, we can resume. (The runtime state of this conversation should be either running, idle, stopped - just like we discussed previously regarding the harness and the liveness probe) <!-- consolidation: exists; ref: docs/specs/sessions.md#sessions; reason: Runtime observation and no durable stopped-versus-failed history are explicit. --> <!-- consolidation: exists; ref: docs/specs/sessions.md#stop-and-resume-a-session; reason: Retained identity enables exact-conversation resume subject to provider validation rather than a saved label. -->

### 2. Merging nested configuration
**Context:** Root and project settings already merge field by field; collections need a precise rule. <!-- consolidation: exists; ref: docs/specs/configuration.md#configuration-and-modes; reason: Field-by-field inheritance is settled. --> <!-- consolidation: unconfirmed; ref: docs/specs/configuration.md#configuration-and-modes; reason: Core does not specify nested-object or list merge semantics. -->
**Question:** How should nested settings, named presets, and lists combine? <!-- consolidation: unconfirmed; ref: docs/specs/configuration.md#configuration-and-modes; reason: Answer establishes precedence but does not choose deep merge, preset-name merge or list policy. -->
**Recommendation:** Merge objects and presets by name, keeping unspecified inherited fields. Replace lists as a whole rather than combining their items. <!-- consolidation: unconfirmed; ref: docs/specs/configuration.md#configuration-and-modes; reason: Nested-object and named-preset merging were not specifically accepted. --> <!-- consolidation: unconfirmed; ref: docs/specs/configuration.md#configuration-and-modes; reason: Whole-list replacement was not specifically accepted. -->
**Answer:**
No need to overcomplicate this. Use native JS object merge or lodash. But the functionality should be, if a more specific config overrided a field, we'll use the more specific config. <!-- consolidation: exists; ref: docs/specs/configuration.md#configuration-and-modes; reason: Explicit task fields override project then root fields. --> <!-- consolidation: discard; ref: docs/CONVENTIONS.md#general-principles; reason: Native merge or lodash are illustrative implementation alternatives rather than a mandated dependency. -->
Example:
Root config:
Use worktrees: false
Project config:
Use worktrees: false
Task config:
Use worktrees: true

Then we use task config: worktree = true <!-- consolidation: exists; ref: docs/specs/configuration.md#configuration-and-modes; reason: The complete preceding root/project/task example is reproduced as the worktree precedence acceptance scenario. -->

### 3. Clearing an inherited setting
**Context:** Leaving a setting out means inheriting it, not removing it. <!-- consolidation: exists; ref: docs/specs/configuration.md#configuration-and-modes; reason: Unspecified fields inherit. -->
**Question:** How should a project explicitly remove an inherited optional setting? <!-- consolidation: unconfirmed; ref: docs/specs/configuration.md#configuration-and-modes; reason: User questions nullable fields and no concrete clearable field or clearing policy is approved. -->
**Recommendation:** Use `null` to clear it; an omitted field continues to inherit. Reject clearing a setting that is required to run. <!-- consolidation: unconfirmed; ref: docs/specs/configuration.md#configuration-and-modes; reason: Null-clearing and required-field clearing policy have no accepted answer. --> <!-- consolidation: exists; ref: docs/specs/configuration.md#configuration-and-modes; reason: Omission inheritance is independently settled. -->
**Answer:**
Why are you asking this? Is there a field that is nullable in our config? I don't think so.  <!-- consolidation: unconfirmed; ref: docs/specs/configuration.md#configuration-and-modes; reason: Nullable-field applicability is a factual clarification request rather than approval of null clearing. -->
All fields are either booleans or text. no? <!-- consolidation: unconfirmed; ref: docs/specs/configuration.md#configuration-and-modes; reason: Tentative field-type question is not an approved exhaustive configuration schema. -->

### 4. Task-specific overrides
**Context:** Tasks may override inherited agent configuration. <!-- consolidation: exists; ref: docs/specs/configuration.md#configuration-and-modes; reason: Task overrides are supported. -->
**Question:** Should task overrides use the same field-by-field merge rules as project overrides? <!-- consolidation: exists; ref: docs/specs/configuration.md#configuration-and-modes; reason: Consistent field-by-field precedence is settled. -->
**Recommendation:** Yes. Removing a task's override restores inheritance; it does not erase the project setting. <!-- consolidation: exists; ref: docs/specs/configuration.md#configuration-and-modes; reason: Unspecified task fields inherit project settings under the common rule. -->
**Answer:**
Dude stop asking the same question over and over again. Don't waste my time. config is config, the behavior of merging is the same. Don't ask stupid questions again. <!-- consolidation: exists; ref: docs/specs/configuration.md#configuration-and-modes; reason: Consistent merge behavior is settled and need not be reopened. -->

### 5. Where modes are defined
**Context:** The workspace requires a mode catalogue, and tasks have sessions belonging to those modes. <!-- consolidation: exists; ref: docs/specs/configuration.md#configuration-and-modes; reason: Startup requires a mode catalogue and sessions have fixed mode membership. -->
**Question:** May tasks add their own modes, or must all tasks use the project's effective catalogue? <!-- consolidation: unconfirmed; ref: docs/specs/configuration.md#configuration-and-modes; reason: User challenges this premise and does not decide private task-mode policy. -->
**Recommendation:** Use one project catalogue, which may inherit root definitions. Task overrides may change agent settings, not introduce private modes. <!-- consolidation: exists; ref: docs/specs/configuration.md#configuration-and-modes; reason: Project configuration owns the mode catalogue. --> <!-- consolidation: unconfirmed; ref: docs/specs/configuration.md#configuration-and-modes; reason: Root catalogue inheritance and the specific private-mode prohibition were not approved by this answer. -->
**Answer:**
Dude, where are those questions coming from? Is it coming from a random doc file you're reading that says something like that? If so, please tell me which doc it is and I'll review that doc directly. If not, then you're just making features up and not doing your job properly. <!-- consolidation: discard; ref: none; reason: Request for provenance rejects speculative feature inference and does not approve the proposed private-mode policy. -->

### 6. A separate parked state
**Context:** Older requirements distinguish a parked, resumable session from a stopped session. <!-- consolidation: discard; ref: docs/BLUEPRINT.md#open-design-decisions; reason: Historical parked lifecycle labels are explicitly superseded. -->
**Question:** Is “park” a distinct user action we need to keep? <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Removal of a distinct public park action has no answer even though parked lifecycle storage is superseded. -->
**Recommendation:** No. Stop the execution while retaining the conversation; offer resume when that conversation can be resumed. Avoid a second name for the same behavior. <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Proposed removal of the park action/name is unanswered. --> <!-- consolidation: exists; ref: docs/specs/sessions.md#stop-and-resume-a-session; reason: Stop retains identity and exact resume is independently specified. -->
**Answer:**

### 7. Restarting the workspace
**Context:** Opening the workspace can reconnect to agents that are already running without starting new ones. <!-- consolidation: exists; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Reattachment displays the existing live execution. -->
**Question:** Should reopening the workspace also restart stopped agents automatically? <!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Reopening auto-resume policy is not answered and client survival alone does not decide it. -->
**Recommendation:** No. Reconnect to existing executions, but require an explicit resume action for stopped ones. <!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#stop-and-resume-a-session; reason: Blanket no-auto-resume-on-reopen recommendation is unanswered. --> <!-- consolidation: exists; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Reattachment to existing executions is independently approved. -->
**Answer:**

### 8. Remembered view settings
**Context:** Selection, filters, and collapsed groups are interface preferences, not session state. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#durable-conversation-and-operation-records; reason: Workspace preferences and group state have separate persistence ownership from runtime state. -->
**Question:** Which view preferences should survive closing and reopening the workspace? <!-- consolidation: exists; ref: docs/specs/workspace-and-board.md#workspace-and-board; reason: Questionnaire 3 answer 11 later accepts preference persistence. -->
**Recommendation:** Remember the selected task and mode, filters, and collapsed groups per project. Keep open windows independent; saving a preference must not change another window's view. <!-- consolidation: exists; ref: docs/specs/workspace-and-board.md#workspace-and-board; reason: Later accepted task/mode, filter and collapsed-group persistence is explicit. --> <!-- consolidation: unconfirmed; ref: docs/specs/workspace-and-board.md#workspace-and-board; reason: Cross-window view independence is not answered or specified by preference persistence. -->
**Answer:**

### 9. Restrictions a provider cannot enforce
**Context:** Some agents may not support a requested tool or permission restriction. <!-- consolidation: unconfirmed; ref: docs/specs/configuration.md#edit-agent-settings; reason: Provider capability applicability requires evidence and core does not enumerate restriction support. -->
**Question:** Should launch fail when the selected provider cannot enforce a requested restriction? <!-- consolidation: unconfirmed; ref: docs/specs/configuration.md#edit-agent-settings; reason: Launch failure for unsupported requested enforcement is unanswered. -->
**Recommendation:** Yes, with an explanation. Do not silently replace enforcement with instructions asking the agent to comply. <!-- consolidation: unconfirmed; ref: docs/specs/configuration.md#edit-agent-settings; reason: Failure policy is unapproved and later retention of truthful instruction-only settings does not settle it. -->
**Answer:**

## Tasks, worktrees, and deletion

### 10. Moving between drafts and tasks
**Context:** Promoting a draft or demoting a task can affect references and attached work. <!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Later questionnaire 3 answer 3 rejects draft promotion/demotion. -->
**Question:** Should promotion and demotion preserve identity, dependencies, artifacts, settings, and session history? <!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Unsupported conversion makes preservation policy obsolete. -->
**Recommendation:** Yes. Treat them as changes to the same record, and reject demotion while its agent is running rather than stopping it implicitly. <!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Both conversion behavior and running-agent demotion policy are superseded by no promotion/demotion. -->
**Answer:**

### 11. Task discovery
**Context:** A repository can have multiple branches and worktrees containing task records. <!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Multiple discoverable branch stores are superseded by one configured project store. -->
**Question:** Which tasks should appear in a project's workspace? <!-- consolidation: exists; ref: docs/specs/tasks.md#tasks-and-storage; reason: Later questionnaire 3 answer 6 establishes deterministic project-store loading. -->
**Recommendation:** Include tasks from that project's branches and worktrees, but not unrelated projects. Show one task per stable identity; surface conflicting versions rather than silently choosing one. <!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Branch-discovery and duplicate-version handling premise is rejected by the deterministic-store decision. -->
**Answer:**

### 12. Creating a task's worktree
**Context:** Creating tasks does not necessarily mean starting agents immediately. <!-- consolidation: exists; ref: docs/specs/tasks.md#launching-work-and-completing-a-task; reason: Task creation and first session launch are distinct. -->
**Question:** When should a task receive its dedicated Git worktree? <!-- consolidation: exists; ref: docs/specs/tasks.md#launching-work-and-completing-a-task; reason: Later questionnaire 3 answer 4 settles first-launch allocation. -->
**Recommendation:** On its first agent launch, not when the task record is created. <!-- consolidation: exists; ref: docs/specs/tasks.md#launching-work-and-completing-a-task; reason: This blank recommendation is independently accepted in questionnaire 3 answer 4. -->
**Answer:**

### 13. Existing branch or worktree names
**Context:** The desired name might already belong to other work. <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#launching-work-and-completing-a-task; reason: Collision scenario lacks an approved user-visible outcome. -->
**Question:** What should happen when a task's branch or worktree name is already taken? <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#launching-work-and-completing-a-task; reason: Existing-name reuse/failure policy has no answer. -->
**Recommendation:** Reuse it only when it is verifiably owned by that task. Otherwise stop with an explanation; never overwrite or adopt unrelated work. <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#launching-work-and-completing-a-task; reason: Specific collision reuse and failure policy remains an unanswered recommendation. -->
**Answer:**

### 14. Completing a task
**Context:** Completion and deletion need not have the same consequences. <!-- consolidation: exists; ref: docs/specs/tasks.md#task-deletion; reason: Deletion is explicitly distinct from Done and completion/cleanup. -->
**Question:** Should marking a task complete remove its branch or worktree? <!-- consolidation: exists; ref: docs/specs/tasks.md#launching-work-and-completing-a-task; reason: Later answers distinguish status-only Done from completion that removes the worktree. --> <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#launching-work-and-completing-a-task; reason: Core expressly leaves completion branch-removal policy unapproved. -->
**Recommendation:** No. Keep both until an explicit cleanup or deletion operation, including uncommitted work and unmerged commits. <!-- consolidation: discard; ref: docs/specs/tasks.md#launching-work-and-completing-a-task; reason: Blanket completion worktree preservation is superseded by accepted completion cleanup while Done alone preserves it. --> <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#launching-work-and-completing-a-task; reason: Completion branch retention and unmerged-commit policy are not settled. -->
**Answer:**

### 15. Deleting a group
**Context:** Groups organize tasks but do not own their work. <!-- consolidation: exists; ref: docs/specs/workspace-and-board.md#workspace-and-board; reason: Group deletion preserves its tasks and child groups. -->
**Question:** What happens to tasks when their group is deleted? <!-- consolidation: exists; ref: docs/specs/workspace-and-board.md#workspace-and-board; reason: Later questionnaire 3 answer 9 settles preservation and chosen destination. -->
**Recommendation:** Make them ungrouped. Do not delete tasks or stop agents. <!-- consolidation: discard; ref: docs/specs/workspace-and-board.md#workspace-and-board; reason: Mandatory ungrouping is superseded by user-selected destination including root placement. --> <!-- consolidation: exists; ref: docs/specs/workspace-and-board.md#workspace-and-board; reason: Preserving tasks is independently approved. --> <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#stores-and-repositories; reason: Group move-before-removal is explicitly not task cleanup and view state is not execution state. -->
**Answer:**

### 16. Deleting a mode
**Context:** Deleting a mode already requires warning that its sessions will be removed and running agents killed. <!-- consolidation: exists; ref: docs/specs/configuration.md#delete-a-mode; reason: Warning, confirmation and destructive session scope are already approved. -->
**Question:** Should that deletion apply across every task using the project's mode catalogue? <!-- consolidation: unconfirmed; ref: docs/specs/configuration.md#delete-a-mode; reason: Cross-task extent remains explicitly open. -->
**Recommendation:** Yes. Before proceeding, require a replacement if it is the default mode; refuse to remove the last mode. Affected views switch to the remaining default. <!-- consolidation: unconfirmed; ref: docs/specs/configuration.md#delete-a-mode; reason: Cross-task deletion recommendation has no answer. --> <!-- consolidation: unconfirmed; ref: docs/specs/configuration.md#delete-a-mode; reason: Default-mode replacement requirement remains open. --> <!-- consolidation: unconfirmed; ref: docs/specs/configuration.md#delete-a-mode; reason: Last-mode refusal policy remains open. --> <!-- consolidation: unconfirmed; ref: docs/specs/configuration.md#delete-a-mode; reason: Remaining-default view switching is unapproved. -->
**Answer:**

### 17. Deleting a session's files
**Context:** Deleting a session can mean removing workspace records or also deleting the provider's conversation data. <!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#deleting-a-session; reason: Provider-owned file scope is explicitly unresolved. -->
**Question:** Should session deletion erase the provider's saved conversation too? <!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#deleting-a-session; reason: Provider conversation deletion has no accepted policy. -->
**Recommendation:** No. Remove workspace-owned session records and resources only; leave provider-owned conversation storage untouched. <!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#deleting-a-session; reason: Provider-storage preservation is an unanswered proposal rather than approved deletion scope. -->
**Answer:**

## Search, milestones, and artifacts

### 18. Combining search filters
**Context:** A search can include several statuses, priorities, or record types. <!-- consolidation: unconfirmed; ref: docs/specs/filtering-and-search.md#filtering-and-search; reason: Exact multi-value filter support and matching details are not settled by general filtering approval. -->
**Question:** How should multiple filter values combine? <!-- consolidation: unconfirmed; ref: docs/specs/filtering-and-search.md#filtering-and-search; reason: Core explicitly leaves filter combinations undecided. -->
**Recommendation:** Match any selected value within one filter, and require a match across different filters. For example, status A or B, together with priority High. <!-- consolidation: unconfirmed; ref: docs/specs/filtering-and-search.md#filtering-and-search; reason: OR-within and AND-across recommendation is unanswered. -->
**Answer:**

### 19. Search contents
**Question:** Which content should text search cover? <!-- consolidation: unconfirmed; ref: docs/specs/filtering-and-search.md#filtering-and-search; reason: Record families are approved but exact searchable fields and matching details are not. -->
**Recommendation:** Record IDs, titles, descriptions, and document/decision bodies. Do not search terminal output or provider conversation storage. <!-- consolidation: unconfirmed; ref: docs/specs/filtering-and-search.md#filtering-and-search; reason: Proposed field/body coverage has no answer. --> <!-- consolidation: exists; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Application does not retain terminal output for later retrieval. --> <!-- consolidation: unconfirmed; ref: docs/specs/filtering-and-search.md#filtering-and-search; reason: Specific provider-conversation search exclusion is not answered. -->
**Answer:**

### 20. Finished and archived search results
**Question:** Should completed and archived records appear in search by default? <!-- consolidation: unconfirmed; ref: docs/specs/filtering-and-search.md#filtering-and-search; reason: Search default inclusion policy is not approved. -->
**Recommendation:** Include completed records, but require an explicit option to include archived records. <!-- consolidation: unconfirmed; ref: docs/specs/filtering-and-search.md#filtering-and-search; reason: Default completed inclusion and archived opt-in are unanswered proposals. -->
**Answer:**

### 21. Removing or archiving milestones
**Context:** Tasks may still refer to a milestone after it is no longer active. <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#managing-milestones; reason: Archive assignment policy is not specified by milestone operation retention. -->
**Question:** What should happen to those task assignments? <!-- consolidation: exists; ref: docs/specs/tasks.md#managing-milestones; reason: Later answers settle rename preservation and removal clear-or-reassign. --> <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#managing-milestones; reason: Archive assignment behavior remains unanswered. -->
**Recommendation:** Archiving keeps the assignments for history. Removing clears the assignments without deleting tasks. Renaming preserves the assignments. <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#managing-milestones; reason: Archive preservation recommendation has no explicit accepted answer. --> <!-- consolidation: discard; ref: docs/specs/tasks.md#managing-milestones; reason: Clear-only removal is superseded by accepted clear-or-reassign choice. --> <!-- consolidation: exists; ref: docs/specs/tasks.md#managing-milestones; reason: Rename preservation is independently accepted in questionnaire 5 answer 4. -->
**Answer:**

### 22. Milestone progress
**Question:** How should milestone progress be calculated? <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#managing-milestones; reason: Retained completion percentages do not specify their calculation. -->
**Recommendation:** Completed assigned tasks divided by all assigned tasks, with every task weighted equally. A milestone with no tasks shows “No tasks,” not a completion percentage. <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#managing-milestones; reason: Exact numerator/denominator and equal weighting are unanswered. --> <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#managing-milestones; reason: Empty milestone display is unanswered. -->
**Answer:**

### 23. Meaning of artifact approval
**Context:** Artifact approval could be a review label or a mandatory gate on other actions. <!-- consolidation: discard; ref: docs/specs/configuration.md#configuration-and-modes; reason: Artifact approval premise is superseded by informational task-and-mode approval. -->
**Question:** Does approval block or enable agent launches, task transitions, or completion? <!-- consolidation: exists; ref: docs/specs/configuration.md#configuration-and-modes; reason: Later decisions establish informational mode approval without artifact-review gates. -->
**Recommendation:** Keep it informational unless you need a specific gate. Do not add automatic restrictions merely because an artifact is unapproved. <!-- consolidation: discard; ref: docs/specs/configuration.md#configuration-and-modes; reason: Artifact-specific approval recommendation is superseded. --> <!-- consolidation: exists; ref: docs/specs/configuration.md#configuration-and-modes; reason: Informational non-gating approval is independently settled for task modes. -->
**Answer:**

### 24. Who can approve artifacts
**Question:** May an agent approve artifacts, or is approval reserved for a person? <!-- consolidation: discard; ref: docs/specs/configuration.md#configuration-and-modes; reason: Artifact approval is removed and user-directed agent mode approval is accepted. -->
**Recommendation:** Reserve approval for an explicit human action; agents may prepare or update artifacts, not approve their own work. <!-- consolidation: discard; ref: docs/specs/configuration.md#configuration-and-modes; reason: Human-only artifact approval is superseded by agent-usable task/mode approval under user direction. -->
**Answer:**

## Public commands

### 25. Which commands should remain
**Context:** These commands are advertised today; that does not make them approved requirements. Names below omit the common `agentic-workspace` prefix. <!-- consolidation: exists; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Installed help inventory is not blanket API approval. -->
**Question:** Which command families belong in the product? <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Core has a selective baseline and explicitly leaves the remaining inventory undecided. -->
**Recommendation:** Mark each row **Keep**, **Remove**, or **Change**, listing exceptions when needed. Keeping a family approves its purpose, not unspecified options or destructive behavior. <!-- consolidation: exists; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Purpose approval does not approve unspecified syntax/options or the full inventory. -->
**Answer:** Fill the final column. Removed output and reconcile commands are intentionally absent. <!-- consolidation: exists; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Stored terminal-output retrieval is excluded. --> <!-- consolidation: discard; ref: docs/specs/sessions.md#sessions; reason: Reconcile removal is already settled and retained in alignment ACT-2 alongside the observed-state contract rather than reopened as inventory. -->

| Commands | Purpose | Answer |
|---|---|---|
| `init` | Initialize a project. | <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Exact setup command removal is unanswered in questionnaire 6. --> |
| `task create/list/edit/view/archive/complete/demote` | Manage tasks, including demotion to drafts. | <!-- consolidation: exists; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Task creation purpose is independently approved. --> <!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Draft demotion is rejected. --> <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Remaining task-family command entry points are not blanket-approved by retained TUI features. --> |
| `draft create/list/edit/view/archive/promote` | Manage drafts, including promotion to tasks. | <!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Direct task model rejects draft promotion/demotion and supersedes this family premise. --> |
| `task artifact status/list/read/write` | Inspect and edit task artifacts. | <!-- consolidation: exists; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Generic artifact list/read/write purposes are accepted later. --> <!-- consolidation: discard; ref: docs/specs/configuration.md#configuration-and-modes; reason: Artifact approval/status semantics are superseded by mode approval. --> |
| `search` | Search across tasks, documents, and decisions. | <!-- consolidation: exists; ref: docs/specs/filtering-and-search.md#filtering-and-search; reason: Cross-record search is accepted in questionnaire 5. --> |
| `milestone list/add/rename/remove/archive` | Manage milestones. | <!-- consolidation: exists; ref: docs/specs/tasks.md#managing-milestones; reason: Milestone operation purposes are accepted later. --> <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Exact milestone command entry points remain in the unsettled API inventory. --> |
| `board`, `board view`, `board export` | View a board and export Markdown. | <!-- consolidation: exists; ref: docs/specs/workspace-and-board.md#workspace-and-board; reason: Board view purpose is retained. --> <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Exact board CLI entry points are not accepted by TUI view retention. --> <!-- consolidation: discard; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Board export is explicitly rejected in questionnaire 3 answer 20 and is absent from the approved baseline. --> |
| `doc create/update/list/search/view` | Manage project documents. | <!-- consolidation: exists; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Document command family is explicitly accepted later. --> |
| `decision create/list` | Create and list architectural decision records. | <!-- consolidation: exists; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Decision command family is explicitly accepted later. --> |
| `config`, `config get/set/list` | Edit or inspect general settings. | <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Broad configuration API retention is unanswered in questionnaire 6. --> |
| `agent-config show/init/set`, `agent-config model set` | Edit or inspect agent settings. | <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Broad agent-config API retention remains unanswered. --> <!-- consolidation: exists; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Specific provider-independent model capture is explicitly accepted later. --> |
| `workspace` | Open the interactive workspace. | <!-- consolidation: exists; ref: docs/SPEC.md#feature-contracts; reason: Opening the TUI workspace is the approved product surface. --> <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: This blank inventory row does not settle the exact command name. --> |
| `agent-session list/start/stop/attach/delete` | Manage and attach to task sessions. | <!-- consolidation: exists; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: CLI session start purpose is approved. --> <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Additional exact session command entry points remain inventory rather than blanket approval. --> |
| `agent-session ask` | Send a question to a retained session. | <!-- consolidation: exists; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Ask is accepted in questionnaire 3 and current eligibility is stopped-only. --> |
| `agent-session handoff` | Start a successor before retiring its predecessor. | <!-- consolidation: exists; ref: docs/specs/sessions.md#handoff; reason: Successor-before-predecessor behavior is settled. --> <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: This blank row does not approve exact handoff CLI syntax. --> |
| `agent-session reset` | Reset saved session state; exact scope is not settled. | <!-- consolidation: discard; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Questionnaire 3 answer 18 explicitly rejects reset so its scope must not be reopened. --> |
| `cleanup` | Move eligible completed tasks into completed storage. | <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: A distinct cleanup CLI surface and eligibility are not accepted by the completion contract. --> |
| `agents`, `agents --update-instructions` | Inspect or update workspace guidance in agent instruction files. | <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Guidance editing command retention remains unanswered. --> |
| `skill`, `instructions`, `instructions --list` | Print agent-facing skills and workflow guides. | <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Printable guidance entry points remain undecided. --> |
| `completion install`, `completion __complete` | Install shell completion and supply completion suggestions. | <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Shell-completion retention remains unanswered. --> |
| `mcp start` | Expose workspace operations to tools through an MCP server. | <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: MCP retention is conditional and unanswered. --> |
| `help` | Show general or command-specific help. | <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Blank command-help inventory row has no explicit core API acceptance. --> |
| `tasks`, `milestones` aliases | Allow plural alternatives to `task` and `milestone`. | <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Alias retention or removal is unanswered in questionnaire 6. --> |

### 26. Commands without a subcommand
**Context:** Commands such as `task` and `draft` can otherwise have surprising implicit behavior. <!-- consolidation: discard; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Historical command-shape motivation is not a durable behavior requirement. -->
**Question:** What should `task`, `task <id>`, `draft`, and `draft <id>` do? <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Bare task command semantics are unanswered. --> <!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Draft command premise is superseded by the direct task model. -->
**Recommendation:** With no ID, list records; with an ID, display that record. Never create or edit implicitly. Make bare `board` display the board. <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Implicit task list/view and no implicit mutation policy are unanswered. --> <!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Proposed draft defaults depend on the superseded draft model. --> <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Bare board command behavior is unanswered. -->
**Answer:**

### 27. Choosing a session from the command line
**Context:** A task can have several modes and sessions; a command-line invocation has no reliable window selection. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#models-and-relationships; reason: Tasks own per-mode retained histories and active selection. --> <!-- consolidation: discard; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: CLI window-selection assumption motivates an unanswered targeting policy rather than establishing it. -->
**Question:** What should a session command do when its target is ambiguous? <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: CLI target disambiguation UX has no accepted answer. -->
**Recommendation:** Require an explicit mode or session when multiple targets fit. Do not guess which agent to stop, delete, attach to, or question. <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Specific required CLI target syntax is unanswered despite settled internal identity validation. -->
**Answer:**

### 28. Asking a stopped session a question
**Context:** A retained conversation may have no running agent to receive a question. <!-- consolidation: exists; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Ask is explicitly eligible only for stopped sessions. -->
**Question:** Should `agent-session ask` resume that conversation automatically? <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#open-design-decisions; reason: Automatic ask-resume consent is explicitly unsettled. -->
**Recommendation:** Require explicit agreement to resume a stopped conversation. If resumed, send the question to that exact conversation and show how to attach; do not invent a stored-output retrieval feature. <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#open-design-decisions; reason: Resume consent policy is unanswered. --> <!-- consolidation: exists; ref: docs/specs/sessions.md#stop-and-resume-a-session; reason: Exact conversation rather than silent replacement is independently required. --> <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Showing attach guidance after ask is unanswered. --> <!-- consolidation: exists; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Ask is question/answer rather than transcript retrieval. -->
**Answer:**

### 29. Resetting session state
**Context:** A reset command can discard the information needed to locate running agents or resume conversations. <!-- consolidation: discard; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Risk rationale concerns a reset surface explicitly rejected later in questionnaire 3. -->
**Question:** Is there a distinct user need for `agent-session reset` beyond stopping or deleting selected sessions? <!-- consolidation: discard; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Questionnaire 3 answer 18 settles removal and no need decision remains open. -->
**Recommendation:** Remove it unless you can name that need. Do not retain a broad state-wiping command as a substitute for reliable lifecycle handling. <!-- consolidation: discard; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Conditional proposal is superseded by unconditional removal accepted in questionnaire 3 and retained as alignment ACT-3 execution work. -->
**Answer:**

### 30. Writing over files
**Context:** Artifact writes and board exports can target files that already exist. <!-- consolidation: exists; ref: docs/specs/tasks.md#using-task-artifacts; reason: Artifact writes replace selected existing contents. --> <!-- consolidation: discard; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Board export is explicitly rejected later in questionnaire 3. -->
**Question:** Should these commands overwrite existing files automatically? <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#using-task-artifacts; reason: Generic replacement writes are accepted later but exact overwrite-consent UX is not specified. --> <!-- consolidation: discard; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Board-export overwrite policy is obsolete after removal. -->
**Recommendation:** No. Require an explicit overwrite choice. A board export without a filename prints Markdown instead of choosing a file to replace. <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#using-task-artifacts; reason: Extra artifact overwrite confirmation has no answer. --> <!-- consolidation: discard; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Stdout board export is rejected along with the entire export feature. -->
**Answer:**

### 31. What cleanup is allowed to do
**Question:** Should `cleanup` only move completed task records, or also delete branches, worktrees, and session history? <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Distinct cleanup command scope is unanswered and must not redefine the accepted completion operation. -->
**Recommendation:** Move completed records only, skipping tasks with running agents. Keep destructive removal as a separate explicit action. <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Record-only cleanup and running-agent exclusion are unanswered for any distinct cleanup API. --> <!-- consolidation: discard; ref: docs/specs/tasks.md#launching-work-and-completing-a-task; reason: If applied to completion/cleanup this conflicts with retained session cleanup and worktree removal. -->
**Answer:**

### 32. Updating instruction and shell files
**Context:** Instruction setup and shell-completion installation modify files outside task records. <!-- consolidation: discard; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Existing utilities are implementation inventory whose retention remains undecided. -->
**Question:** What modification boundary should these commands follow? <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Retention and public managed-file mutation policy remain unanswered. -->
**Recommendation:** Show the target files and proposed edits first. Change only an explicitly managed section after confirmation; preserve all unrelated content. <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Preview, confirmation and managed-section product behavior is unapproved and must not be inferred from contributor preservation rules. -->
**Answer:**

### 33. Commands run by scripts
**Context:** A script cannot answer an unexpected interactive prompt. <!-- consolidation: discard; ref: none; reason: General script limitation motivates the proposal but is not an independent product decision. -->
**Question:** How should commands behave when no interactive terminal is available? <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Noninteractive API behavior remains unanswered. -->
**Recommendation:** Accept complete explicit inputs, otherwise fail with a clear message. Never wait for a prompt, infer destructive consent, or launch an interactive screen. <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Noninteractive success/failure and no-prompt behavior is unapproved. --> <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#requirements; reason: Noninteractive destructive consent remains explicitly open. -->
**Answer:**

### 34. Confirming destructive operations
**Question:** Which actions require explicit confirmation? <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#requirements; reason: Cross-operation confirmation policy is unanswered beyond already approved specific behavior. -->
**Recommendation:** Confirm actions that kill agents or discard files, branches, or history, with the affected items stated. Scripts must provide deliberate consent. A force option may authorize stopping an agent, but must not silently authorize unrelated data deletion. <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#requirements; reason: Blanket destructive confirmation rule is not approved. --> <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#requirements; reason: Script consent rule remains open. --> <!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#deleting-a-session; reason: Cross-operation force scope is unanswered beyond the settled kill-before-session-removal behavior. -->
**Answer:**

### 35. Reporting command results
**Context:** People need readable results; scripts need predictable success and failure signals. <!-- consolidation: discard; ref: none; reason: General output-contract motivation is not an accepted format specification. -->
**Question:** What common output contract should commands follow? <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: General CLI output contract remains unanswered. -->
**Recommendation:** Put results on standard output and diagnostics on standard error. Return zero only for complete success and nonzero for errors, cancellation, or partial failure. Offer documented JSON for data-returning commands, without prompts or progress mixed into it; do not add JSON to interactive screens. <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Common stdout/stderr separation proposal is unanswered. --> <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Exit status for errors, cancellation and partial failure has no answer. --> <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Blanket data-command JSON and screen exclusion are unapproved despite search-specific JSON acceptance. -->
**Answer:**

## Support and acceptance criteria

### 36. Supported environments and agents
**Question:** Which operating systems, shells, and agent providers must we support? <!-- consolidation: unconfirmed; ref: docs/PRODUCT.md#open-product-decisions; reason: No approved environment or provider-support matrix is supplied. -->
**Recommendation:** State a small explicit supported set. I will verify installation and runtime-version requirements against that set rather than treating every advertised integration as guaranteed. <!-- consolidation: unconfirmed; ref: docs/PRODUCT.md#open-product-decisions; reason: Support-set selection is unanswered and advertised integrations are not guarantees. -->
**Answer:**

### 37. Scale and speed
**Question:** What task/session counts and responsiveness must the product handle acceptably? <!-- consolidation: unconfirmed; ref: docs/PRODUCT.md#open-product-decisions; reason: Scale and response-time targets have no answer. -->
**Recommendation:** Give your expected largest project and any delays you consider unacceptable. Use those as test targets rather than inventing performance guarantees. <!-- consolidation: unconfirmed; ref: docs/PRODUCT.md#open-product-decisions; reason: No approved scale/performance acceptance targets are provided. -->
**Answer:**

### 38. Terminal accessibility
**Question:** What terminal-size and accessibility guarantees are essential? <!-- consolidation: unconfirmed; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Exact minimum dimensions and broader accessibility guarantees remain undecided. -->
**Recommendation:** Require keyboard access and readable status text so color is never the only signal. Reflow where possible and show a clear notice when the terminal is too small. Please name any screen-reader support or minimum terminal size you require. <!-- consolidation: exists; ref: docs/DESIGN-SYSTEM.md#status-and-activity; reason: Text and markers ensure color is not the only signal. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Keyboard navigation and visible essential actions are independently specified. --> <!-- consolidation: unconfirmed; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: General reflow and too-small notice policy is unanswered beyond task-region shrinking. --> <!-- consolidation: unconfirmed; ref: docs/screens/workspace.md#focus-and-constrained-terminals; reason: Screen-reader support and minimum size are not approved. -->
**Answer:**

## Anything missing?

**Question:** Is there a behavior above that should not exist, or an essential requirement we have missed? <!-- consolidation: unconfirmed; ref: docs/SPEC.md#open-product-decisions; reason: Blank completeness check supplies no new approval or guarantee of complete coverage. -->
**Answer:**

---

Answers establish desired behavior, not proof that it is implemented. Exact command options and technical details still require agent verification; any remaining product choices will go into a new questionnaire, not be appended here. <!-- consolidation: unconfirmed; ref: none; reason: Approval and implementation verification remain distinct. --> <!-- consolidation: exists; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Exact unsettled API syntax is not inferred from purpose approval. --> <!-- consolidation: discard; ref: none; reason: New-questionnaire filing procedure is temporary interview workflow. -->
