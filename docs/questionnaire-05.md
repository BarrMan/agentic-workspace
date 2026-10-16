---
consolidation:
  total: 83
  counts:
    exists: 57
    discard: 12
    integrate: 0
    unconfirmed: 14
  percentages:
    exists: 68.67%
    discard: 14.46%
    integrate: 0.00%
    unconfirmed: 16.87%
---
# Remaining existing features — questionnaire 5
> **Non-authoritative supporting material.** This file is not a contract. Authoritative owner(s): [PRODUCT](PRODUCT.md), [SPEC](SPEC.md), [BLUEPRINT](BLUEPRINT.md), [CONVENTIONS](CONVENTIONS.md), [DESIGN-SYSTEM](DESIGN-SYSTEM.md), [screens](screens/README.md).
> Disposition: Mixed — see markers.

The earlier decisions are settled. This batch groups the remaining existing capabilities instead of asking about each small behavior separately. <!-- consolidation: unconfirmed; ref: none; reason: Approved contracts remain authoritative rather than being reopened by an inventory. -->

Answer **Retain** to accept a recommendation, or list what to change or remove. A group can be accepted with exceptions. Nothing here requires reading another document. Current behavior is based on source inspection; command-only claims are identified as advertised functionality. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#testing; reason: Source inspection and advertised command evidence remain distinct from runtime verification. -->

## Task management

### 1. Task fields
**Context:** Existing task interfaces expose title, description, type, priority, project, milestone, labels, and a due date when present. Available statuses come from project configuration. <!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Historical field inventory includes project and due date excluded by the accepted model. --> <!-- consolidation: exists; ref: docs/specs/tasks.md#tasks-and-storage; reason: Statuses come from project configuration. -->
**Question:** Which of these task fields should remain part of the product? <!-- consolidation: exists; ref: docs/specs/tasks.md#tasks-and-storage; reason: Accepted editable-field list settles the question. -->
**Recommendation:** Retain the existing fields and configurable statuses; list any fields you want removed. This does not make optional fields mandatory. <!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Retaining every existing field was superseded by the explicit project and due-date exclusions. --> <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#tasks-and-storage; reason: Core lists editable fields but does not specify which are optional or required. -->
**Answer:**
We can remove due date and project. Project is already the scope of the entire app and due date should be removed as well. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#open-design-decisions; reason: The questionnaire 5 reconciliation explicitly omits project and due date while the project directory scopes tasks. -->

### 2. Task dependencies
**Context:** Tasks can reference dependencies and display blockers/readiness. Completion help also advertises keeping dependency links after completion. <!-- consolidation: exists; ref: docs/specs/tasks.md#tasks-and-storage; reason: Dependency display and retained links after completion are approved. -->
**Question:** Should task dependencies and their links to completed tasks remain? <!-- consolidation: exists; ref: docs/specs/tasks.md#tasks-and-storage; reason: Accepted retention is explicit. -->
**Recommendation:** Retain them. Completing a task should not erase the fact that another task depended on it. This does not introduce an automatic launch or completion gate. <!-- consolidation: exists; ref: docs/specs/tasks.md#tasks-and-storage; reason: Dependency links survive completion. --> <!-- consolidation: exists; ref: docs/specs/tasks.md#tasks-and-storage; reason: Dependencies are informational and do not automatically gate launch or completion. -->
**Answer:**
Yes, retain. <!-- consolidation: exists; ref: docs/specs/tasks.md#tasks-and-storage; reason: Dependency retention answer is folded. -->

### 3. Archiving unfinished work
**Context:** Archiving is separate from completing or deleting a task. The current implementation archives non-completed tasks and rejects tasks already in a completed status; CLI help describes canceled, duplicate, or invalid work. <!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Existing archive implementation and help are not approval of archive policy. -->
**Question:** Is archive intended specifically for abandoning unfinished work, with completed work going through completion instead? <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Answer addresses completion only and questionnaire 6 archive question remains blank. -->
**Recommendation:** Retain that distinction. Archive canceled/duplicate/invalid tasks; use completion for finished work. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Archive retention and eligibility were not accepted by the answer. --> <!-- consolidation: exists; ref: docs/specs/tasks.md#launching-work-and-completing-a-task; reason: Explicit completion of finished work is retained. -->
**Answer:**
Currently I don't think we support completing a work but we definitely should. If we already support it then good, if not, let's add it and also add it to the keybindings.  <!-- consolidation: exists; ref: docs/specs/tasks.md#launching-work-and-completing-a-task; reason: Completion and its separate TUI keybinding are explicit requirements regardless of implementation status. -->

### 4. Milestone management and progress
**Context:** Existing milestone features include add, rename, list, and archive operations, plus task-status counts and a completion percentage. Rename help advertises updating task references. You already settled that removal must clear or reassign references. <!-- consolidation: exists; ref: docs/specs/tasks.md#managing-milestones; reason: Add, rename, list and archive operations are retained. --> <!-- consolidation: exists; ref: docs/specs/tasks.md#managing-milestones; reason: Task-status counts and completion percentages are retained. --> <!-- consolidation: exists; ref: docs/specs/tasks.md#managing-milestones; reason: Rename preserves assignments. --> <!-- consolidation: exists; ref: docs/specs/tasks.md#managing-milestones; reason: Removal clears or reassigns every reference. -->
**Question:** Should the remaining milestone-management and progress features stay? <!-- consolidation: exists; ref: docs/specs/tasks.md#managing-milestones; reason: Accepted milestone feature set is represented. -->
**Recommendation:** Retain them, including preserving assignments when a milestone is renamed. <!-- consolidation: exists; ref: docs/specs/tasks.md#managing-milestones; reason: Retention and rename-reference preservation are explicit. -->
**Answer:**
yes <!-- consolidation: exists; ref: docs/specs/tasks.md#managing-milestones; reason: Answer accepts the represented milestone feature set. -->

## Finding and working with tasks

### 5. Filters and cross-record search
**Context:** The task view filters by text, status, type, project, priority, milestone, and label, with a visible summary and reset action. The search command advertises searching tasks, documents, and decision records, with filters and plain/JSON output. <!-- consolidation: exists; ref: docs/specs/interfaces.md#filtering-and-search; reason: Text, status, type, priority, milestone and label filters with summary and reset are retained. --> <!-- consolidation: discard; ref: docs/specs/interfaces.md#filtering-and-search; reason: Project is the scope rather than a task field or independent filter. --> <!-- consolidation: exists; ref: docs/specs/interfaces.md#filtering-and-search; reason: Task/document/decision search with filters and plain/JSON output is retained. -->
**Question:** Should all these filtering and search capabilities remain? <!-- consolidation: exists; ref: docs/specs/interfaces.md#filtering-and-search; reason: Accepted search scope is represented subject to removal of the project field. -->
**Recommendation:** Retain them; name any filter or record type you want excluded. Existing output options remain useful for agents and scripts, but this does not approve undocumented output formats. <!-- consolidation: exists; ref: docs/specs/interfaces.md#filtering-and-search; reason: Accepted capabilities and limited output-format approval are specified. -->
**Answer:**
yes <!-- consolidation: exists; ref: docs/specs/interfaces.md#filtering-and-search; reason: Core reconciles retained search with the explicit project-field removal. -->

### 6. Remaining workspace controls
**Context:** The existing interface supports previewing/canceling a board move before committing it; assigning or unassigning groups; expanding/collapsing groups; copying a task ID; choosing a retained session; fullscreen agent terminals; and searchable help with customizable, conflict-checked shortcuts. <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Board move preview, cancel and commit are retained. --> <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Group assignment and unassignment are retained. --> <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Group expansion and collapse are retained. --> <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Copying task IDs is retained. --> <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Choosing retained sessions is retained. --> <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Fullscreen agent terminals are retained. --> <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Searchable help and customizable conflict-checked shortcuts are retained. -->
**Question:** Are any of these existing controls unnecessary or wrong for the product? <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Retention answer and all enumerated controls are represented. -->
**Recommendation:** Retain them, with any exceptions you name. Your decisions to keep both views, nested groups, and saved preferences are not being reopened. <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Retained controls, dual views, nesting and preference persistence are explicit. -->
**Answer:**
yes, retain. <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Answer accepts the enumerated controls without exceptions. -->

### 7. Viewing and editing task files
**Context:** Besides the file-list command you confirmed, existing tools display text/Markdown or binary-file metadata, read file contents, and write contents from another file or standard input. A write replaces the selected file's contents. <!-- consolidation: exists; ref: docs/specs/tasks.md#using-task-artifacts; reason: Text/Markdown and binary-metadata viewing are retained. --> <!-- consolidation: exists; ref: docs/specs/tasks.md#using-task-artifacts; reason: Reading file contents is retained. --> <!-- consolidation: exists; ref: docs/specs/tasks.md#using-task-artifacts; reason: File/stdin writes replace the selected artifact contents. -->
**Question:** Should these viewing, reading, and writing tools remain for files in the task's `artifacts/` directory? <!-- consolidation: exists; ref: docs/specs/tasks.md#using-task-artifacts; reason: Accepted tool retention and directory scope are explicit. -->
**Recommendation:** Retain them as generic file tools. No artifact approval, required document names, or knowledge of what a mode produces. <!-- consolidation: exists; ref: docs/specs/tasks.md#using-task-artifacts; reason: Generic optional files have no mode schemas or approval checks. -->
**Answer:**
yes <!-- consolidation: exists; ref: docs/specs/tasks.md#using-task-artifacts; reason: Answer accepts generic file tools and constraints. -->

## Configuration and integrations

### 8. Agent-settings controls
**Context:** Existing settings offer named agent presets, editable mode prompts, explicit/default model selection, model discovery, and repository/task/artifact/subagent permission controls. Edits are staged until Save, and canceling does not save them. <!-- consolidation: exists; ref: docs/specs/configuration.md#edit-agent-settings; reason: Named presets are retained. --> <!-- consolidation: exists; ref: docs/specs/configuration.md#edit-agent-settings; reason: Editable mode prompts are retained. --> <!-- consolidation: exists; ref: docs/specs/configuration.md#edit-agent-settings; reason: Default and explicit model selection plus discovery are retained. --> <!-- consolidation: exists; ref: docs/specs/configuration.md#edit-agent-settings; reason: Repository/task/artifact/subagent permission controls are retained. --> <!-- consolidation: exists; ref: docs/specs/configuration.md#edit-agent-settings; reason: Save commits staged edits and cancel discards them. -->
**Question:** Should these controls remain, apart from the artifact declarations and artifact approval already removed? <!-- consolidation: exists; ref: docs/specs/configuration.md#edit-agent-settings; reason: Accepted settings controls are represented while mode approval owns the removed artifact semantics. -->
**Recommendation:** Retain them. Keep the already-agreed distinctions between instruction-only and enforced permissions, and never silently replace an unavailable model. <!-- consolidation: exists; ref: docs/specs/configuration.md#edit-agent-settings; reason: Accepted settings controls are retained. --> <!-- consolidation: exists; ref: docs/specs/configuration.md#edit-agent-settings; reason: Instruction-only permissions are labeled guidance rather than enforcement. --> <!-- consolidation: exists; ref: docs/specs/configuration.md#edit-agent-settings; reason: Unavailable configured models remain selected with visible feedback. -->
**Answer:**
yes <!-- consolidation: exists; ref: docs/specs/configuration.md#edit-agent-settings; reason: Answer accepts retained agent settings and their constraints. -->

### 9. MCP access
**Context:** The product advertises an optional MCP server started with `mcp start`, alongside its ordinary CLI. Initialization offers CLI, MCP, or no integration setup. <!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Advertised integration/setup choices are inventory rather than accepted scope. -->
**Question:** Should MCP remain a supported way for agents to access the workspace? <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Conditional answer does not establish benefit and questionnaire 6 remains unanswered. -->
**Recommendation:** Retain it as optional; ordinary task management must not require starting an MCP server. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Optional MCP retention remains conditional rather than approved. -->
**Answer:**
If the MCP helps us in some way, then yes, retain. If it just adds overhead, then let's remove it. If it helps with token usage when agent need to use the task management tools instead of using the CLI, then it's good to have it. <!-- consolidation: unconfirmed; ref: docs/PRODUCT.md#open-product-decisions; reason: Conditional retention needs demonstrated benefit or an integration decision and no token saving is established. -->

### 10. Bundled guides and instruction-file setup
**Context:** `skill` and `instructions` print bundled guidance. `agents --update-instructions` advertises adding or updating a short workspace-command reminder in agent instruction files. These are existing utilities, not runtime requirements for a particular agent workflow. <!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Printable guides are inventory awaiting retention. --> <!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Instruction-file setup is advertised implementation awaiting retention. -->
**Question:** Do you want to keep both the printable guides and the optional instruction-file setup? <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: User requested explanation rather than approving either utility. -->
**Recommendation:** Retain them as opt-in assistance, not mandatory workflows or permission to overwrite unrelated instructions. List either utility you want removed. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Printable-guide retention is unapproved. --> <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Instruction-file editing retention and managed-write policy remain undecided. -->
**Answer:**
Not really sure what they do still. Is it just printable for the user to see? What does it print? On which use-case would a user want to use this?  <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Clarification request is not acceptance and questionnaire 6 explanations have no retention answers. -->

### 11. Remaining command conveniences
**Context:** Installed help advertises interactive configuration plus `config get/set/list`; scoped `agent-config show/init/set`; shell-completion installation; task-ID prefixes during initialization; and plural `tasks`/`milestones` command aliases. <!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: General config commands are advertised inventory. --> <!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Broad agent-config commands are advertised inventory. --> <!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Shell-completion installation is advertised inventory. --> <!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Initialization task-ID prefix is advertised inventory. --> <!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Plural aliases are advertised inventory. -->
**Question:** Which of these command conveniences should remain? <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Answer settles selective API principles but not each command retention decision. -->
**Recommendation:** Retain the existing conveniences; list exceptions. This does not change the configuration precedence, storage behavior, or provider-independent model-setting behavior already agreed. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Blanket retention is not approved and questionnaire 6 asks specific removals without answers. -->
**Answer:**
Basically the answer is related to the core idea of this project. It's not a CLI tool. Setup is not done by `init` command. We will create an init wizard later but for now all settings and configurations are available inside of the TUI. The CLI commands are meant for external integration with this project (external also means the agents within the sessions). <!-- consolidation: exists; ref: docs/specs/interfaces.md#feature-contracts; reason: Application is TUI-first with CLI integration for session agents and external apps. --> <!-- consolidation: exists; ref: docs/specs/configuration.md#configuration-and-modes; reason: Setup/settings live in TUI and future wizard is outside current requirements. -->
So rule is: 
1. Do we want to allow the agent within a session to access these commands? (Setting the current task done or setting the mode's model to the currently using model are obvious ones for example) <!-- consolidation: exists; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Session-agent integration criterion and Done/current-model examples are retained operations. -->
2. Do we want external apps to easily be able to access these commands? (creating a task is an obvious one) <!-- consolidation: exists; ref: docs/specs/interfaces.md#supported-integration-operations; reason: External task creation is an approved selective integration operation. -->

So generally speaking again, it's public API for the agents within the sessions + public API for external apps. <!-- consolidation: exists; ref: docs/specs/interfaces.md#feature-contracts; reason: Both integration audiences are explicit. -->
Of course the agents could modify the config files and data files and whatnot however they want. Everything is exposed, unencrypted and can easily be modified. But I want to expose only things that are "needed" and not every little thinig in the project. <!-- consolidation: exists; ref: docs/specs/configuration.md#configuration-and-modes; reason: Configuration/data files remain openly accessible and editable. --> <!-- consolidation: exists; ref: docs/specs/interfaces.md#feature-contracts; reason: Concrete integration need determines API exposure rather than every internal setting. -->
---

Implementation details such as file locks, request ordering, and serialization are not product questions for you. I will place them in the appropriate architecture or conventions documentation, rather than ask you to approve code mechanics. Confirming features here does not establish that their implementation is correct or complete. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#authoritative-mutation-and-publication; reason: Logical locking, publication and serialization contracts have architectural ownership. --> <!-- consolidation: unconfirmed; ref: none; reason: Feature approval is distinct from implementation verification. -->
