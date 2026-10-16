---
consolidation:
  total: 111
  counts:
    exists: 75
    discard: 36
    integrate: 0
    unconfirmed: 0
  percentages:
    exists: 67.57%
    discard: 32.43%
    integrate: 0.00%
    unconfirmed: 0.00%
---
# Existing behavior — questionnaire 3

These questions come from the corrected implementation audit. **Context** describes what source inspection found, or explicitly identifies a CLI-help claim. It does not mean that behavior is correct. <!-- consolidation: exists; ref: docs/SPEC.md#authority; reason: Source and installed help establish evidence rather than approval. -->

Answer **Yes** to accept a recommendation, or describe the behavior you want. You do not need to review another document. Earlier answers remain settled; unanswered questions from the previous questionnaire are not requirements. <!-- consolidation: exists; ref: docs/SPEC.md#authority; reason: Approved decisions remain authoritative and unanswered recommendations are not requirements. -->

## Task lifecycle and Git

### 1. “Done” versus “complete”
**Context:** The workspace's Done action changes task status only. The completion operation moves the task into completed storage and invokes session cleanup and worktree removal. <!-- consolidation: exists; ref: docs/specs/tasks.md#work-context-and-completion; reason: Status-only Done and completion with storage move/session cleanup/worktree removal are distinct. -->
**Question:** Should marking a task done and cleaning up its execution environment remain separate actions? <!-- consolidation: exists; ref: docs/specs/tasks.md#work-context-and-completion; reason: Accepted separation is explicit. -->
**Recommendation:** Yes. Marking work done should not implicitly remove its worktree; cleanup should be explicit and clearly named. <!-- consolidation: exists; ref: docs/specs/tasks.md#work-context-and-completion; reason: Done retains worktree and completion/cleanup is separately explicit. -->
**Answer:**
Yes. Separate. <!-- consolidation: exists; ref: docs/specs/tasks.md#work-context-and-completion; reason: Accepted action separation is folded. -->

### 2. Cleanup during completion
**Context:** The existing completion operation does more than store a finished task: it also invokes session cleanup and worktree removal. <!-- consolidation: exists; ref: docs/specs/tasks.md#work-context-and-completion; reason: Completion includes session cleanup and worktree removal. -->
**Question:** Is that cleanup part of the completion operation you want to retain? <!-- consolidation: exists; ref: docs/specs/tasks.md#work-context-and-completion; reason: Retained completion cleanup is settled. -->
**Recommendation:** Retain it only as an explicitly destructive completion/cleanup action, not as a second, unexpectedly stronger way to mark a task done. <!-- consolidation: exists; ref: docs/specs/tasks.md#work-context-and-completion; reason: Explicit completion cleanup is separate from status-only Done without inventing new confirmation policy. -->
**Answer:**
This is a confirmed behavior. Do nothing about it. <!-- consolidation: exists; ref: docs/specs/tasks.md#work-context-and-completion; reason: Answer preserves the existing completion semantics as the approved contract. -->

### 3. Changing IDs when promoting drafts
**Context:** Promoting a draft currently gives it a new task ID. Demoting a task likewise gives it a new draft ID and updates related references. <!-- consolidation: discard; ref: docs/specs/tasks.md#task-model; reason: Draft promotion/demotion behavior is rejected. -->
**Question:** Should moving between draft and task change the record's identity? <!-- consolidation: discard; ref: docs/specs/tasks.md#task-model; reason: Rejected draft/task conversion makes its ID policy obsolete. -->
**Recommendation:** No. Preserve its ID so references do not need to change merely because it became a task or draft. <!-- consolidation: discard; ref: docs/specs/tasks.md#task-model; reason: Recommendation assumes unsupported promotion/demotion. -->
**Answer:**
This is not a SPEC requirement of the app. A task cannot be a draft. It's a task. You cannot promote or demote a task. <!-- consolidation: exists; ref: docs/specs/tasks.md#task-model; reason: Direct task identity and no promotion/demotion are explicit. -->

### 4. When a worktree is created
**Context:** When worktrees are enabled, task creation currently attempts to create or reuse the task's worktree before an agent is launched. <!-- consolidation: discard; ref: docs/specs/tasks.md#work-context-and-completion; reason: Historical task-creation allocation is superseded by first-launch allocation. -->
**Question:** Is creating the worktree at task creation the intended behavior? <!-- consolidation: exists; ref: docs/specs/tasks.md#work-context-and-completion; reason: Accepted answer explicitly prohibits task-creation allocation. -->
**Recommendation:** Keep it if a newly created task should immediately have its own checkout; otherwise defer it until first launch. This is a timing choice, not a change to configuration precedence. <!-- consolidation: discard; ref: docs/specs/tasks.md#work-context-and-completion; reason: Conditional alternatives are resolved by the accepted first-launch choice. -->
**Answer:**
Do not create at task creation. Create at first session launch. <!-- consolidation: exists; ref: docs/specs/tasks.md#work-context-and-completion; reason: Exact allocation timing is specified. -->

### 5. Failed worktree creation
**Context:** Task creation currently logs a worktree-creation failure but can still succeed in creating the task record. <!-- consolidation: discard; ref: docs/specs/tasks.md#work-context-and-completion; reason: Historical task-creation worktree attempt is superseded by first-launch timing. -->
**Question:** Should the task still be created when its requested worktree cannot be created? <!-- consolidation: exists; ref: docs/specs/tasks.md#work-context-and-completion; reason: Settled outcome retains the task after worktree allocation failure. -->
**Recommendation:** Yes, with a visible warning. Keep the task, but do not treat the failed worktree setup as successful or silently substitute the project checkout when launching an agent. <!-- consolidation: exists; ref: docs/specs/tasks.md#work-context-and-completion; reason: Retain task, warn visibly and prohibit silent checkout substitution. -->
**Answer:**
Yes with visible warning. Also, we should add the working directory in the header status we have like opencode * running * plan * /Users/.../worktree-path <!-- consolidation: exists; ref: docs/specs/tasks.md#work-context-and-completion; reason: Visible worktree-failure warning is specified. --> <!-- consolidation: exists; ref: docs/screens/workspace.md#ordered-regions; reason: Session header includes agent, runtime status, mode and actual working directory in order. -->

### 6. Discovering tasks outside the current checkout
**Context:** Task loading considers configured local and remote branches, plus other worktrees of the same repository—not just files in the current checkout. <!-- consolidation: discard; ref: docs/specs/tasks.md#project-data-store; reason: Branch-based discovery is superseded by one deterministic configured project store. -->
**Question:** Should the workspace retain this cross-branch and cross-worktree task discovery? <!-- consolidation: exists; ref: docs/specs/tasks.md#project-data-store; reason: Accepted rejection of branch discovery is explicit. -->
**Recommendation:** Yes, if the workspace is intended to show the repository's work rather than only the current checkout's tasks. <!-- consolidation: discard; ref: docs/specs/tasks.md#project-data-store; reason: Cross-branch discovery recommendation is rejected. -->
**Answer:**
What is the current checkout? I'll write it plain simple - there's no "task discovery" - tasks live in a specific deterministic path. I believe we already have a getRoot function or something like that which gets the main worktree path. There the task exist and only there. <!-- consolidation: exists; ref: docs/specs/tasks.md#project-data-store; reason: Linked worktrees resolve the main project store and loading does not discover branch records. --> <!-- consolidation: discard; ref: docs/BLUEPRINT.md#project-storage-and-configuration; reason: Tentative getRoot implementation name is not a prescribed interface. -->

## Workspace organization

### 7. Keeping the separate board
**Context:** There is both a grouped task workspace and a status-column board, with actions to switch between them. <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Both views and switching are retained. -->
**Question:** Do you want both views to remain part of the product? <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Dual-view retention is settled. -->
**Recommendation:** Keep both only if the board serves a distinct workflow you use; otherwise remove the separate board rather than maintaining two task-navigation surfaces. <!-- consolidation: discard; ref: docs/specs/interfaces.md#workspace-and-board; reason: Conditional alternatives are resolved by retaining both views. -->
**Answer:**
Yes, both views. <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Accepted grouped workspace and separate board are explicit. -->

### 8. Nested groups
**Context:** Workspace groups can contain child groups as well as tasks. <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Nested groups and tasks are supported. -->
**Question:** Should groups continue supporting nesting, rather than only a flat list of groups? <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Nesting is settled. -->
**Recommendation:** Keep the existing nesting unless you want to simplify organization to one level. <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Accepted recommendation retains nesting. -->
**Answer:**
yes. continue nesting. <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Accepted nested organization is specified. -->

### 9. Deleting a populated group
**Context:** Group deletion offers a destination for its direct tasks and child groups, including ungrouped/root placement. It is not task deletion. <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Group deletion preserves children with a user-selected destination. -->
**Question:** Should deleting a populated group retain this move-before-removal behavior? <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Accepted preservation and relocation are explicit. -->
**Recommendation:** Yes. Preserve its tasks and child groups and let the user choose where they go. <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Accepted group-deletion outcome is represented. -->
**Answer:**
yes. <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Answer accepts preservation with user-selected relocation. -->

### 10. Remembering a mode separately for each task
**Context:** Switching back to a task restores that task's previously selected mode. <!-- consolidation: exists; ref: docs/specs/configuration.md#modes-and-approval; reason: Each task remembers its selected mode. -->
**Question:** Should mode selection remain per task, or should switching tasks keep the same selected mode throughout the workspace? <!-- consolidation: exists; ref: docs/specs/configuration.md#modes-and-approval; reason: Per-task selection is settled. -->
**Recommendation:** Keep the existing per-task selection so returning to a task restores where you left it. <!-- consolidation: exists; ref: docs/specs/configuration.md#modes-and-approval; reason: Accepted per-task selection is specified. -->
**Answer:**
yes. <!-- consolidation: exists; ref: docs/specs/configuration.md#modes-and-approval; reason: Answer accepts per-task mode restoration. -->

### 11. Remembered workspace preferences
**Context:** Filters, task/mode selection, details visibility, shortcut overrides, group membership, and collapsed groups are saved and reloaded. <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Filter persistence is explicit. --> <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Task and per-task mode selection persist. --> <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Details visibility persists. --> <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Shortcut overrides persist. --> <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Group membership and collapsed groups persist. -->
**Question:** Are any of these things supposed to reset when the workspace is reopened? <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Retention answer approves restoration of all enumerated preferences. -->
**Recommendation:** Retain the existing persistence; list any exceptions you want. <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Accepted preference persistence has no listed exceptions. -->
**Answer:**
retain <!-- consolidation: exists; ref: docs/specs/interfaces.md#workspace-and-board; reason: Preference persistence answer is folded. -->

## Artifacts and agent settings

### 12. Approval belongs to an exact artifact version
**Context:** Approval applies to the reviewed file contents. Changed contents invalidate approval, and the UI refuses approval if the file changed after it was displayed. <!-- consolidation: discard; ref: docs/specs/configuration.md#modes-and-approval; reason: Artifact-hash approval is superseded by task-and-mode approval. -->
**Question:** Is that exact-version approval behavior the intended contract? <!-- consolidation: discard; ref: docs/specs/configuration.md#modes-and-approval; reason: Later answer 13 replaces the file-approval premise. -->
**Recommendation:** Yes. An approved document must not remain approved after its contents change. <!-- consolidation: discard; ref: docs/specs/configuration.md#modes-and-approval; reason: File-change invalidation is superseded by session-activity invalidation of mode approval. -->
**Answer:**
retain. but what do you mean by the UI refuses approval? what does it refuse? no refusal. Just approved indication that's all. <!-- consolidation: discard; ref: docs/specs/configuration.md#modes-and-approval; reason: Initial artifact-approval retention is explicitly superseded by the next answer. --> <!-- consolidation: exists; ref: docs/specs/configuration.md#modes-and-approval; reason: Informational approval indication rather than an application gate survives. -->

### 13. Expected artifacts for a mode
**Context:** Mode settings can declare expected artifact paths and purposes, and select an artifact whose approval is shown as an indicator. The artifact view displays missing declared files. <!-- consolidation: discard; ref: docs/specs/configuration.md#modes-and-approval; reason: Expected artifact schemas and file approval are superseded by opaque configurable modes. -->
**Question:** Should these per-mode artifact declarations and the approval indicator remain? <!-- consolidation: discard; ref: docs/specs/configuration.md#modes-and-approval; reason: Accepted answer rejects artifact declarations and substitutes mode approval. -->
**Recommendation:** Keep them if modes are expected to produce specific deliverables; they are existing functionality, not a proposed launch or completion gate. <!-- consolidation: discard; ref: docs/specs/configuration.md#modes-and-approval; reason: Conditional artifact-declaration retention is rejected. -->
**Answer:**
After this question I might change my answer to the previous one. document artifacts are not for approval. approval is for the whole mode. meaning, plan mode will have the approval stamp or not. build mode also. This is a better product requirement. Also, this fits better to the fact that our code should NOT know anything about the mode's contents. It does not know about any artifacts the mode creates. It's dynamic and configurable. <!-- consolidation: exists; ref: docs/specs/configuration.md#modes-and-approval; reason: Mode approval replaces document approval. --> <!-- consolidation: exists; ref: docs/specs/configuration.md#modes-and-approval; reason: Dynamic mode contents and outputs are opaque to the application. -->

### 14. Replacing artifact contents
**Context:** Writing an artifact currently replaces the bytes at its task-relative path and clears the old approval. <!-- consolidation: exists; ref: docs/specs/tasks.md#task-artifacts; reason: Generic writes replace contents within the dedicated artifact directory. --> <!-- consolidation: discard; ref: docs/specs/configuration.md#modes-and-approval; reason: File-write approval invalidation is superseded. -->
**Question:** Should artifact writing continue to allow replacing an existing artifact in place? <!-- consolidation: exists; ref: docs/specs/tasks.md#task-artifacts; reason: Later questionnaire 5 answer 7 explicitly retains replacement writes as generic tools. -->
**Recommendation:** Yes. Treat it as editing that artifact, with approval invalidated when it is written. <!-- consolidation: exists; ref: docs/specs/tasks.md#task-artifacts; reason: Replacement writes are independently accepted later. --> <!-- consolidation: discard; ref: docs/specs/configuration.md#modes-and-approval; reason: Artifact-write approval invalidation is rejected. -->
**Answer:**
Please see my previous answer. This app should not be opinionated wy of writing docs, or managing tasks or managing agent workflow. The user may or may not create docs, may or may not want to use the plan mode and may delete the plan mode. he may also change the plan mode prompt to not create those artifacts and that's perfectly fine. <!-- consolidation: exists; ref: docs/specs/configuration.md#modes-and-approval; reason: No required Plan mode, workflow, deliverable or fixed prompt is imposed. -->

### 15. Permissions enforced only through instructions
**Context:** Agent settings distinguish provider-enforced permissions from instruction-only permissions, and warn that instructions do not provide filesystem isolation. <!-- consolidation: exists; ref: docs/specs/configuration.md#agent-settings; reason: Guidance and enforcement are explicitly distinguished. -->
**Question:** Should instruction-only permissions remain an available option? <!-- consolidation: exists; ref: docs/specs/configuration.md#agent-settings; reason: Instruction-only permissions are explicitly retained. -->
**Recommendation:** Yes, but identify them clearly as guidance rather than an enforced security boundary. Never imply that the agent is technically prevented from violating them. <!-- consolidation: exists; ref: docs/specs/configuration.md#agent-settings; reason: Accepted guidance labeling and no filesystem-isolation claim are specified. -->
**Answer:**
retain. <!-- consolidation: exists; ref: docs/specs/configuration.md#agent-settings; reason: Answer accepts instruction-only permissions with truthful enforcement labeling. -->

### 16. A configured model disappears from discovery
**Context:** The model picker retains the configured model with an unavailable warning. Discovery errors do not automatically replace the selection. <!-- consolidation: exists; ref: docs/specs/configuration.md#agent-settings; reason: Retained model selection and visible discovery errors are specified. -->
**Question:** Should the product keep that model selection until the user changes it? <!-- consolidation: exists; ref: docs/specs/configuration.md#agent-settings; reason: Only user choice changes the selected model. -->
**Recommendation:** Yes. Show the problem rather than silently switching models. <!-- consolidation: exists; ref: docs/specs/configuration.md#agent-settings; reason: Accepted no-substitution behavior is explicit. -->
**Answer:**
retain <!-- consolidation: exists; ref: docs/specs/configuration.md#agent-settings; reason: Model retention answer is folded. -->

## Existing command features

Command names below omit the common `agentic-workspace` prefix. These contexts are advertised by installed CLI help unless stated otherwise; successful execution has not been verified. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Historical evidence limitation is not a permanent implementation claim. -->

### 17. Asking a retained session a question
**Context:** `agent-session ask` advertises sending a question to a specified or prior handed-off session and printing its answer. That is different from retrieving stored terminal output, which you already removed. <!-- consolidation: exists; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Retained-session question/answer is supported separately from transcript retrieval. -->
**Question:** Do you want this question-and-answer command to remain? <!-- consolidation: exists; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Ask retention is settled with stopped-only eligibility. -->
**Recommendation:** Keep it only if consulting an earlier session is an intended workflow. Its existence does not authorize storing or retrieving terminal transcripts. <!-- consolidation: exists; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Accepted ask purpose does not authorize terminal-transcript retrieval. -->
**Answer:**
retain <!-- consolidation: exists; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Ask retention answer is folded. -->

### 18. Resetting saved session state
**Context:** `agent-session reset` is advertised separately from stopping or deleting a session. Help describes resetting saved task-session state, without establishing safe data-loss boundaries. <!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Advertised reset inventory is historical and the owner explicitly rejects retention below. -->
**Question:** Is reset a user-facing operation you want to keep? <!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Answer settles removal and must not be reopened through the remaining API inventory. -->
**Recommendation:** Remove it unless it serves a distinct workflow you need. Do not retain it merely to repair state the application should manage correctly. <!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Settled reset removal is intentionally tracked in alignment ACT-3 alongside the positive API contract rather than a new core absence list. -->
**Answer:**
remove <!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Accepted reset removal remains alignment ACT-3 execution work and must not be reopened or duplicated as a core absence list. -->

### 19. Document-management commands
**Context:** The product exposes commands to create, update, list, search, and view documents, alongside commands to create and list decision records. <!-- consolidation: exists; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Document create/update/list/search/view is an approved operation family. --> <!-- consolidation: exists; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Decision create/list is an approved operation family. -->
**Question:** Should managing documents and decision records through the CLI remain part of the product? <!-- consolidation: exists; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Both command families are retained explicitly. -->
**Recommendation:** Retain these commands if agents should use them in their workflow; otherwise keep ordinary file editing and remove the redundant command surface. <!-- consolidation: exists; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Accepted retention is represented for both families. -->
**Answer:**
retain. these are nice commands. <!-- consolidation: exists; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Answer accepts document and decision command families. -->

### 20. Board export into README
**Context:** Board export advertises both Markdown output and a mode that writes into marked sections of README. <!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Historical advertised export is rejected by the owner below. -->
**Question:** Should the product retain the README-editing export, as well as ordinary Markdown export? <!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Owner rejects all board export and the settled decision must not be reopened. -->
**Recommendation:** Keep ordinary export; retain README editing only if maintaining an embedded board is an actual workflow you want. <!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Recommendation is rejected by the explicit all-export removal answer and is not in the approved baseline. -->
**Answer:**
no need for board export. remove this. <!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Accepted all-export removal is preserved in alignment ACT-3 while the core positively retains board viewing and rejects preservation of rejected surfaces. -->

### 21. Removing a milestone while tasks still reference it
**Context:** Milestone removal advertises three treatments for matching tasks: clear the assignment, keep it, or reassign it. <!-- consolidation: discard; ref: docs/specs/tasks.md#milestones; reason: Keeping dangling references is superseded by mandatory clear or reassign. -->
**Question:** Should removal allow keeping references to a milestone that no longer exists? <!-- consolidation: exists; ref: docs/specs/tasks.md#milestones; reason: Accepted answer prohibits dangling references. -->
**Recommendation:** No. Clear or reassign those references instead of deliberately leaving a missing milestone behind. <!-- consolidation: exists; ref: docs/specs/tasks.md#milestones; reason: Accepted clear-or-reassign behavior is explicit. -->
**Answer:**
recommended. <!-- consolidation: exists; ref: docs/specs/tasks.md#milestones; reason: Answer accepts reference cleanup on milestone removal. -->

### 22. Importing a model choice from OpenCode
**Context:** `agent-config model set` advertises setting a mode's model from the calling OpenCode session's last-used model, as an alternative to naming a model explicitly. <!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Provider-specific framing is superseded by provider-independent calling-session model capture. -->
**Question:** Should that OpenCode-specific shortcut remain? <!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: OpenCode-only premise is explicitly rejected. -->
**Recommendation:** Keep it only if inheriting the current coding agent's model is a useful, intentional workflow; otherwise use explicit model selection. <!-- consolidation: exists; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Accepted current-session model capture is retained independently of provider. -->
**Answer:**
yes. but it's not specific to opencode. I don't know why you keep mentioning opencode. look at the command, where does it say opencode anywhere? This command will set the model to the mode the session is in with the model the session currently uses in the project's config. <!-- consolidation: exists; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Command sets the calling mode model in project configuration from the current session model across providers. -->

### 23. Projects without Git
**Context:** Initialization advertises a `--no-git` option. <!-- consolidation: discard; ref: docs/PRODUCT.md#overview; reason: Advertised Git opt-out flag is rejected and directory-scoped projects need no Git prerequisite. -->
**Question:** Is using the product without Git an intended supported workflow? <!-- consolidation: exists; ref: docs/PRODUCT.md#overview; reason: Projects may or may not use Git. -->
**Recommendation:** Retain it if standalone task management is in scope. Do not promise worktrees or branch discovery in that mode. <!-- consolidation: discard; ref: docs/specs/tasks.md#project-data-store; reason: Conditional flag framing is rejected and task branch discovery is removed for all projects. -->
**Answer:**
Remove the `--no-git` option. We manage tasks for a directory. the directory may or may not have git, it does not matter. Also, there should be an option in the config (project config) to decide where to place the task's data. I thinkn currently it's inside of `.git` folder which is wrong. It should either be where we store other data (I think it's `~/.agentic-workspace/...`) and if user chooses to store in the project's folder it should be `.agentic-workspace` folder or allow the user to choose a path on its own. <!-- consolidation: discard; ref: docs/specs/tasks.md#task-model; reason: Git-independent directory scope supersedes the no-git option and its accepted removal remains alignment ACT-6 execution work. --> <!-- consolidation: exists; ref: docs/specs/tasks.md#task-model; reason: Project directory scopes tasks independently of Git. --> <!-- consolidation: exists; ref: docs/specs/tasks.md#project-data-store; reason: Project configuration selects project-local, application-user-level or custom storage outside .git. --> <!-- consolidation: discard; ref: docs/specs/tasks.md#project-data-store; reason: Tentative existing .git and home-directory guesses are not authoritative paths and questionnaire 4 corrects the source observation. -->
---

This batch covers concrete behavior choices exposed by the audit. It does not silently approve the rest of the command inventory. Facts still requiring investigation remain agent work, not questions for you to research. Further decision questions, if needed, will go into a new file. <!-- consolidation: exists; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Accepted operations do not approve the rest of the installed inventory. --> <!-- consolidation: discard; ref: none; reason: Agent research assignment and next-questionnaire filing are interview workflow rather than durable product requirements. -->
