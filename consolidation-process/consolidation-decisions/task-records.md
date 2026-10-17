# Task identity, records and storage model

> **Working sheet — not a contract.** Answers are applied to the owning contracts and to each document's disposition markers.

**What this group is:** How task and project records are identified, stored, archived and projected.

**Default:** Decide — product-visible behavior.

**98 statements** — 17 P (proposal / unanswered) · 81 G (evidence or safety gate).

**Decision for this group:** `[ ] Discard all` · `[ ] Plan work (→ alignment plan, not a contract)` · `[ ] Amend a contract` · `[ ] Select individually` · `[ ] Narrow: ______`

Answers are per statement only if you choose "Select individually": `d` discard · `w` plan work · `a` amend the contract named · `?` keep open.

---

### from `docs/BACK-728-handoff.md` (1)

1. `G` **Historical architecture alternatives lack an approval record.** — 3. **Decide A vs B** with the user, presenting §7 findings honestly. — `docs/BACK-728-handoff.md:432` · related: `docs/adr/README.md#active-decisions`

### from `docs/SPEC-unconfirmed.md` (6)

1. `P` **Setup command and its name path and prefix options are not approved by TUI setup requirements.** — | PRD-003 | Initialization accepts a project name, project-relative record directory, and task prefix. | Help: init --help — [projectName], --agentic-workspace-dir, --task-prefix | Pending | | — `docs/SPEC-unconfirmed.md:43` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
2. `G` **Metadata persistence is approved but exact task.md and frontmatter representation is not fixed by the core contract.** — | TSK-001 | Task records are saved in task containers as task.md, using Markdown serialization with frontmatter. | Source: src/file-system/operations.ts:718–793 — saveTask, serializeTask call | … — `docs/SPEC-unconfirmed.md:52` · related: `docs/architecture/application-boundaries.md#stores-and-repositories`
3. `G` **Exact collection ID allocation and creation-lock mechanism is not settled by shared-operation coordination.** — | TSK-002 | Task creation allocates an ID under the creation lock and saves the new record. | Source: src/core/task-creation-workflow.ts — TaskCreationService.create | Pending | | — `docs/SPEC-unconfirmed.md:53` · related: `docs/BLUEPRINT.md#open-design-decisions`
4. `P` **Exact task edit command and options are not approved wholesale.** — | TSK-004 | Task editing accepts replacement title and description values for an existing task ID. | Help: task edit --help — --title, --description | Pending | | — `docs/SPEC-unconfirmed.md:55` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
5. `P` **Exact CLI worktree option remains unapproved API syntax.** — | WRK-001 | Agent configuration exposes a worktree-per-task setting. | Help: agent-config --help — --worktree-per-task; Source: src/core/agentic-workspace.ts — ensureTaskWorktreeFor | Pending | | — `docs/SPEC-unconfirmed.md:62` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
6. `G` **Exact CLI syntax and file scope are not settled by the force-ordering contract.** — | CLI-057 | agent-session delete <taskId> [--session] [--force] | Delete a session record/files; help advertises stopping a running session first with --force. | Help: agent-session delete --help | … — `docs/SPEC-unconfirmed.md:141` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`

### from `docs/agent-handover.md` (1)

1. `G` **Agent-only CLI mutation safeguard needs explicit disposition distinct from user file access.** — - Choose Stack is an empty proposed decision. It was excluded from the checkpoint. Do not assume it is an accepted architecture decision or delete it without investigating provenance. Manage Backlog … — `docs/agent-handover.md:44` · related: `docs/CONVENTIONS.md#changes-and-refactoring`

### from `docs/agent-session-ownership-plan.md` (3)

1. `G` **PID-specific adoption rejection needs scoped queue-path disposition while provenance safety remains mandatory.** — **Stop condition:** no path launches a record twice, and no path adopts a record owned by another pid. — `docs/agent-session-ownership-plan.md:102` · related: `docs/BLUEPRINT.md#architectural-invariants`
2. `G` **Tracked-set implementation gate remains until retained adoption path is reconciled.** — 5. **Adoption is not a second launch.** Exactly one host per record, guarded by the tracked/launching set. — `docs/agent-session-ownership-plan.md:132` · related: `docs/specs/sessions.md#creation-failure-and-recovery`
3. `G` **Forged-context wedge and claimed reset remedy need current-path verification rather than acceptance as harmless.** — 1. **A forged context can wedge one task.** An invocation that presents a live non-workspace pid, this project's root, and any live workspace-shaped socket registers a starting record nobody adopts … — `docs/agent-session-ownership-plan.md:163` · related: `docs/BLUEPRINT.md#architectural-invariants`

### from `docs/alignment-plan.md` (4)

1. `G` **ACT-11 discovery removal and linked-worktree proof remain open.** — | ACT-11 · Action | Deterministic store | Inventory: src/core/task-loader.ts indexes branch candidates; src/core/agentic-workspace.ts scans same-repository worktrees. | Remove branch/worktree task … — `docs/alignment-plan.md:41` · related: `docs/SPEC.md#global-behavioral-invariants`
2. `G` **ACT-12 timing and failed-allocation behavior still need verification.** — | ACT-12 · Action | Worktree timing/failure | Inventory: src/core/task-creation-workflow.ts creates/reuses worktree during task creation; session-service-mechanics.ts:388–395 falls back to project … — `docs/alignment-plan.md:42` · related: `docs/SPEC.md#global-behavioral-invariants`
3. `G` **ACT-13 removal behavior and guide alignment remain unverified.** — | ACT-13 · Action | Mode approval, artifacts | Inventory: task-artifact-repository.ts hashes/records artifact approval; agent-settings.ts:849–862 declares expected paths. Questionnaire 6 findings … — `docs/alignment-plan.md:43` · related: `docs/SPEC.md#global-behavioral-invariants`
4. `G` **DOC-1 transitive safety-content accounting and checkpoint proof remain unfinished.** — **Remaining fold:** The legacy screen/runtime/redesign documents remain source material, with authority banners directing readers to canonical contracts. SAFE-1–3 retain scoped execution gates and … — `docs/alignment-plan.md:169` · related: `docs/CONVENTIONS.md#documentation-maintenance`

### from `docs/aoe-agent-workspace-reference.md` (1)

1. `P` **Proposed dashboard permission action has no recorded approval here.** — dashboard action available, and the per-agent token table is the entire mechanism. — `docs/aoe-agent-workspace-reference.md:538` · related: `docs/specs/session-interaction-and-feedback.md#session-interaction-and-feedback`

### from `docs/aoe-multi-client-deletion-source-audit.md` (1)

1. `G` **Draft implementation work is not behavioral approval.** — This is a proposed implementation sequence, not approval of BACK-27's draft artifacts or authorization to implement. — `docs/aoe-multi-client-deletion-source-audit.md:105`

### from `docs/aoe-status-tracking-plan.md` (2)

1. `G` **Exact refresh invalidation policy is not a current core requirement.** — - Full refresh runs only when the *snapshot* changes (task set, selection, session identity), exactly as today. Activity changes ride setActivity. — `docs/aoe-status-tracking-plan.md:406` · related: `docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host`
2. `P` **Exact stable-mount acceptance remains a proposed optimization contract.** — - N consecutive activity updates leave #mount identity unchanged (no dispose, :363) and do not call mountWorkspace again; — `docs/aoe-status-tracking-plan.md:741` · related: `docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host`

### from `docs/footer-search-recovery-handover.md` (1)

1. `G` **Responsible mutation invocation remains unknown and must not be inferred.** — The record had already been repaired earlier and subsequently became damaged again during agent task updates. The exact invocation responsible is **not established**. Earlier claims that a particular … — `docs/footer-search-recovery-handover.md:60`

### from `docs/modes-delivery-plan.md` (1)

1. `G` **Exact conversion requires explicit stored-data policy and verified recipe.** — mode deletion merge, manual record conversion, — `docs/modes-delivery-plan.md:234` · related: `docs/CONVENTIONS.md#changes-and-refactoring`

### from `docs/modes-phase1-contract.md` (4)

1. `G` **Exact version and conversion recipe need current-schema and data-policy verification.** — Phase 1 defined the data contracts below. Canonical task containers are the only readable task layout; legacy flat task records are not read. Manually move each <name>.md to <lowercase-id>/task.md, … — `docs/modes-phase1-contract.md:20` · related: `docs/CONVENTIONS.md#changes-and-refactoring`
2. `G` **Draft disposition and exact manual conversion require current data-policy verification.** — For a legacy project, manually convert flat task and draft records by moving <name>.md to <lowercase-id>/task.md under the same root, setting frontmatter id to match the directory name, and setting … — `docs/modes-phase1-contract.md:37` · related: `docs/CONVENTIONS.md#changes-and-refactoring`
3. `G` **Preserve backup safeguard pending verification of obsolete conversion recipe.** — For a legacy project, manually convert flat task and draft records by moving <name>.md to <lowercase-id>/task.md under the same root, setting frontmatter id to match the directory name, and setting … — `docs/modes-phase1-contract.md:37` · related: `docs/BLUEPRINT.md#durable-conversation-and-operation-records`
4. `P` **Broad setup CLI syntax is not approved.** — For a legacy project, manually convert flat task and draft records by moving <name>.md to <lowercase-id>/task.md under the same root, setting frontmatter id to match the directory name, and setting … — `docs/modes-phase1-contract.md:37` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`

### from `docs/opencode-migration.md` (15)

1. `G` **External schema identity assumptions need version-specific verification.** — 4. The project moves from /Users/imribarr/Projects/Backlog.md to /Users/imribarr/Projects/agentic-workspace. OpenCode identifies it by absolute path in project.worktree, project_directory.directory, … — `docs/opencode-migration.md:25`
2. `G` **Preserve baseline-comparison gate pending external migration applicability and writer-quiescence verification.** — 9. **Record the pre-migration session counts.** These numbers change as sessions are created, so capture them now and compare against them after the migration (the verification section refers to … — `docs/opencode-migration.md:31` · related: `docs/CONVENTIONS.md#changes-and-refactoring`
3. `G` **Script also changes worktree project_id and filesystem moves are outside the database transaction.** — 10. The database statements below use SQLite's read/write mode only for the explicit migration. They update only the listed path columns and run in one transaction. Do not change the database path or … — `docs/opencode-migration.md:40`
4. `G` **Destructive destination deletion is unsafe to reuse against the current worktree.** — Save this block as a shell script if desired. Run it once, from any directory, after completing the preconditions. It intentionally stops on errors. The rm -rf guard below removes the destination if … — `docs/opencode-migration.md:44` · related: `docs/CONVENTIONS.md#general-principles`
5. `G` **Preserve post-move path-verification gate pending external schema verification.** — 1. Confirm the project and all recorded paths now point to the new locations, with no remaining old-root paths: — `docs/opencode-migration.md:149`
6. `G` **Path-check SQL uses a new linked-worktree prefix different from the script's .backlog destination.** —  — `docs/opencode-migration.md:165`
7. `G` **Exact row-count and path expectations require a fresh baseline and consistent prefixes.** — Expected: the project row shows /Users/imribarr/Projects/agentic-workspace; all five old_* counts are 0; new_project_paths is 2; new_linked_worktrees matches the number of task worktrees under the … — `docs/opencode-migration.md:167`
8. `G` **Count-check SQL assumes historical project identity and external schema.** —  — `docs/opencode-migration.md:177`
9. `G` **Preserve mismatch stop gate without certifying the unsafe rollback recipe.** — Expected: both counts must equal the baseline you recorded in precondition 9. If either differs, do not relaunch OpenCode; investigate or roll back. — `docs/opencode-migration.md:179`
10. `G` **Session and permission reassignment needs verified identity ownership and quiescent writers.** — If a newly-created id holds 0 sessions while daf950e6… holds ~1,669, re-point session, session_v2, and permission from daf950e6… to the new id in one transaction using the same BEGIN IMMEDIATE / … — `docs/opencode-migration.md:191`
11. `G` **Identity reuse alone has not been shown to establish complete migration.** — If OpenCode reused daf950e61fbe12fb12e15d6f716c25dba9b42c4d, nothing needs to be done. — `docs/opencode-migration.md:202`
12. `G` **Session conservation remains a required external migration verification gate.** — | Docs directory: ~/docs/Backlog.md → ~/docs/agentic-workspace | Existing session records and their counts | — `docs/opencode-migration.md:269`
13. `P` **External identity diagnosis depends on current schema and verified targets.** — - **Sessions are missing:** Check that project.worktree equals the new project path and that session.directory and session_v2.directory no longer contain the old project path. Use the read-only SQL … — `docs/opencode-migration.md:273`
14. `G` **Pruning is not verified worktree repair and needs exact administrative-link evidence.** — - **Git worktree errors:** The linked-worktree registrations contain absolute paths, so moving the project/task-worktree directory invalidates them. Run git -C … — `docs/opencode-migration.md:275`
15. `G` **Preserve unresolved worktree-usability verification gate.** — - **Git worktree errors:** The linked-worktree registrations contain absolute paths, so moving the project/task-worktree directory invalidates them. Run git -C … — `docs/opencode-migration.md:275`

### from `docs/opentui-workspace-behavior-matrix.md` (1)

1. `G` **Exact help-opening question-mark binding is not specified.** — | Shortcut editor | ? opens help and / searches. Binding and description are separate columns in one shared responsive layout, so descriptions stay aligned across capture phases. Enter starts a … — `docs/opentui-workspace-behavior-matrix.md:38` · related: `docs/screens/help-dialogs.md#help`

### from `docs/opentui-workspace-implementation-plan.md` (4)

1. `G` **Exact board command/export and milestone-grouping API scope needs disposition.** — - Interactive board commands use the native controller, including milestone grouping. Plain board exports retain Markdown output. — `docs/opentui-workspace-implementation-plan.md:27` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
2. `G` **Legacy alias-array compatibility requires explicit exception.** — - Shortcut recording now replaces the selected label with an inline input and requires Save/Discard confirmation. Saved bindings support one or two ordered strokes; legacy arrays remain alternative … — `docs/opentui-workspace-implementation-plan.md:59`
3. `G` **Exact y/c/a bindings and separate archive behavior need disposition.** — - y, c, and a copy, complete, and archive selected task. — `docs/opentui-workspace-implementation-plan.md:163` · related: `docs/screens/tasks.md#states-focus-and-terminal-constraints`
4. `G` **Historical cutover proof checkpoint needs current-contract scope and evidence before retirement.** — Run agentic-workspace workspace and prove task, board, detail, filter, search, edit, session, history, handoff, config, worktree, quick-preview, close/reopen, and failure states. — `docs/opentui-workspace-implementation-plan.md:283`

### from `docs/opentui-workspace-session-contract.md` (3)

1. `G` **Intended behavior and runnable verification remain distinct with safeguards retained.** — Shared-runtime implementation/acceptance checkpoint: canonical handoff. Stable simplification safeguards and unresolved per-session policies: runtime findings. The contract records intended behavior; … — `docs/opentui-workspace-session-contract.md:22`
2. `G` **Live Pi acceptance remains unverified and must not be inferred from argument inspection.** — | Pi | Supports explicit --skill loading and exact --session-id / --session identity. Adapter verified against upstream CLI arguments; no live Pi session was exercised in this pass. | — `docs/opentui-workspace-session-contract.md:86` · related: `docs/architecture/session-harness.md#readiness-and-identity-correlation`
3. `G` **Retry UX remains open.** — | Start failure | Kills created live pane, marks reserved record failed, records endedAt and error, and clears active pointer if needed (sessions.ts:167-180). | Preserve selected task and unsaved UI … — `docs/opentui-workspace-session-contract.md:196` · related: `docs/specs/sessions.md#creation-failure-and-recovery`

### from `docs/opentui-workspace-spec.md` (2)

1. `G` **Exact question-mark help-opening binding is not specified.** — - ? opens shortcut help. / searches; Enter replaces the selected row's binding. Binding and description are separate columns in one shared responsive layout, so descriptions stay aligned across … — `docs/opentui-workspace-spec.md:40` · related: `docs/screens/help-dialogs.md#help`
2. `G` **Separate task archive semantics require disposition.** — - Complete, archive, copy, and board move actions. — `docs/opentui-workspace-spec.md:176` · related: `docs/specs/tasks.md#launching-work-and-completing-a-task`

### from `docs/pending-decisions.md` (1)

1. `G` **Legacy compatibility requires explicit exception.** — - Standing policy applied: no legacy/backward-compat maintenance, **no migration code in the repo** (migration is a manual human action). The migration tooling and flat-record readers are gone; … — `docs/pending-decisions.md:39`

### from `docs/questionnaire-02.md` (16)

1. `G` **Existing-name reuse/failure policy has no answer.** — **Question:** What should happen when a task's branch or worktree name is already taken? — `docs/questionnaire-02.md:116` · related: `docs/specs/tasks.md#launching-work-and-completing-a-task`
2. `P` **Core expressly leaves completion branch-removal policy unapproved.** — **Question:** Should marking a task complete remove its branch or worktree? — `docs/questionnaire-02.md:122` · related: `docs/specs/tasks.md#launching-work-and-completing-a-task`
3. `G` **Record families are approved but exact searchable fields and matching details are not.** — **Question:** Which content should text search cover? — `docs/questionnaire-02.md:153` · related: `docs/specs/filtering-and-search.md#filtering-and-search`
4. `P` **Search default inclusion policy is not approved.** — **Question:** Should completed and archived records appear in search by default? — `docs/questionnaire-02.md:158` · related: `docs/specs/filtering-and-search.md#filtering-and-search`
5. `P` **Default completed inclusion and archived opt-in are unanswered proposals.** — **Recommendation:** Include completed records, but require an explicit option to include archived records. — `docs/questionnaire-02.md:159` · related: `docs/specs/filtering-and-search.md#filtering-and-search`
6. `G` **Archive assignment behavior remains unanswered.** — **Question:** What should happen to those task assignments? — `docs/questionnaire-02.md:164` · related: `docs/specs/tasks.md#managing-milestones`
7. `P` **Archive preservation recommendation has no explicit accepted answer.** — **Recommendation:** Archiving keeps the assignments for history. Removing clears the assignments without deleting tasks. Renaming preserves the assignments. — `docs/questionnaire-02.md:165` · related: `docs/specs/tasks.md#managing-milestones`
8. `G` **Retained completion percentages do not specify their calculation.** — **Question:** How should milestone progress be calculated? — `docs/questionnaire-02.md:169` · related: `docs/specs/tasks.md#managing-milestones`
9. `G` **Exact numerator/denominator and equal weighting are unanswered.** — **Recommendation:** Completed assigned tasks divided by all assigned tasks, with every task weighted equally. A milestone with no tasks shows “No tasks,” not a completion percentage. — `docs/questionnaire-02.md:170` · related: `docs/specs/tasks.md#managing-milestones`
10. `G` **Empty milestone display is unanswered.** — **Recommendation:** Completed assigned tasks divided by all assigned tasks, with every task weighted equally. A milestone with no tasks shows “No tasks,” not a completion percentage. — `docs/questionnaire-02.md:170` · related: `docs/specs/tasks.md#managing-milestones`
11. `G` **Remaining task-family command entry points are not blanket-approved by retained TUI features.** — | task create/list/edit/view/archive/complete/demote | Manage tasks, including demotion to drafts. | | — `docs/questionnaire-02.md:195` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
12. `G` **Exact milestone command entry points remain in the unsettled API inventory.** — | milestone list/add/rename/remove/archive | Manage milestones. | | — `docs/questionnaire-02.md:199` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
13. `G` **Implicit task list/view and no implicit mutation policy are unanswered.** — **Recommendation:** With no ID, list records; with an ID, display that record. Never create or edit implicitly. Make bare board display the board. — `docs/questionnaire-02.md:221` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
14. `G` **Bare board command behavior is unanswered.** — **Recommendation:** With no ID, list records; with an ID, display that record. Never create or edit implicitly. Make bare board display the board. — `docs/questionnaire-02.md:221` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
15. `P` **Specific required CLI target syntax is unanswered despite settled internal identity validation.** — **Recommendation:** Require an explicit mode or session when multiple targets fit. Do not guess which agent to stop, delete, attach to, or question. — `docs/questionnaire-02.md:227` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
16. `G` **Extra artifact overwrite confirmation has no answer.** — **Recommendation:** No. Require an explicit overwrite choice. A board export without a filename prints Markdown instead of choosing a file to replace. — `docs/questionnaire-02.md:245` · related: `docs/specs/tasks.md#using-task-artifacts`

### from `docs/questionnaire-05.md` (1)

1. `G` **Answer addresses completion only and questionnaire 6 archive question remains blank.** — **Question:** Is archive intended specifically for abandoning unfinished work, with completed work going through completion instead? — `docs/questionnaire-05.md:41` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`

### from `docs/questionnaire-06.md` (4)

1. `P` **Removal of init and interactive config is not approved by this blank answer.** — **Recommendation:** Yes. Keep setup/settings in the TUI and one canonical command name per API operation. This does not remove task, milestone, or session operations themselves. — `docs/questionnaire-06.md:52` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
2. `P` **Removal of shell completion is not approved.** — **Recommendation:** Yes. Keep setup/settings in the TUI and one canonical command name per API operation. This does not remove task, milestone, or session operations themselves. — `docs/questionnaire-06.md:52` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
3. `P` **Removing plural aliases and requiring one canonical name remain unapproved.** — **Recommendation:** Yes. Keep setup/settings in the TUI and one canonical command name per API operation. This does not remove task, milestone, or session operations themselves. — `docs/questionnaire-06.md:52` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
4. `P` **Unanswered recommendations do not approve API features and implementation remains distinct from accepted requirements.** — These are decisions about existing entry points. No new API names, workflow restrictions, or features are implied. Accepted removals will be recorded as requirements; code changes remain a separate … — `docs/questionnaire-06.md:69`

### from `docs/questionnaire-07.md` (1)

1. `G` **Post-answer execution lifetime remains undecided.** — Either choice preserves the exact conversation identity and does not replay its initial prompt. Whether an execution started for ask stops after answering is a separate, unresolved lifetime decision. — `docs/questionnaire-07.md:37`

### from `docs/questionnaire.md` (2)

1. `G` **SPEC owns approved behavior.** — - Keep destinations distinct: **SPEC** defines required behavior; **ARCHITECTURE** describes verified current implementation; **ADRs** record significant architectural decisions and rationale. … — `docs/questionnaire.md:29`
2. `G` **Older design material is not a competing authority.** — **Recommendation:** Record significant accepted decisions and their rationale in ADRs, with links to affected SPEC requirements; put execution steps in task records. Add claims to ARCHITECTURE only … — `docs/questionnaire.md:38`

### from `docs/recent-app-file-activity.md` (1)

1. `G` **Project reproducibility and preservation gates unresolved.** — | Projects | ~/Projects | 16.78 GiB | Review generated dependencies/build artifacts project by project. Preserve source and .git. | — `docs/recent-app-file-activity.md:39`

### from `docs/refactoring-handoff.md` (1)

1. `G` **Agent-only CLI mutation safeguard needs explicit disposition and is not repealed merely by user-editable product files.** — - Markdown is authoritative. Use CLI semantic mutations for Backlog records, not direct task-file edits. — `docs/refactoring-handoff.md:39` · related: `docs/CONVENTIONS.md#changes-and-refactoring`

### from `docs/research-architecture-documentation.md` (3)

1. `G` **Linked structural contracts own boundaries and meaningful operations rather than declaration mirrors.** — Treat architecture documentation as a small set of purpose-separated, linked sources of truth—not a prose mirror of the source tree. Record durable ownership boundaries, responsibilities, permitted … — `docs/research-architecture-documentation.md:22`
2. `P` **Specific diagram view selection is a recommendation rather than an approved required format.** — arc42 recommends hierarchical building blocks with purpose/responsibility and interfaces, but refinement by relevance: explain important, surprising, risky, complex, or volatile parts rather than … — `docs/research-architecture-documentation.md:41`
3. `G` **Core has logical detail contracts but does not approve a separate machine-consumed schema documentation mandate.** — arc42 recommends hierarchical building blocks with purpose/responsibility and interfaces, but refinement by relevance: explain important, surprising, risky, complex, or volatile parts rather than … — `docs/research-architecture-documentation.md:41` · related: `docs/BLUEPRINT.md#component-contracts`

### from `docs/shared-agent-runtime-handoff.md` (2)

1. `G` **Approval and verification remain separate.** — Update each owning artifact in place when its claims change. Keep checkpoint/lane/proof state here, stable decisions/procedures in their owning plans and contracts, and finding progress in the … — `docs/shared-agent-runtime-handoff.md:42`
2. `G` **Source proof does not grant runtime acceptance.** — 5. **Build/handoff:** MAIN rebuild and freshness verification remain required after integration before any runnable handoff. No live/two-client acceptance or artifact approval is claimed. — `docs/shared-agent-runtime-handoff.md:57`

### from `docs/shared-agent-runtime-simplification.md` (1)

1. `G` **Review and implementation authorization do not establish acceptance.** — This document records oracle's source-grounded simplification actions for the shared runtime plan. It is not artifact approval or runtime acceptance. Source references name symbols rather than line … — `docs/shared-agent-runtime-simplification.md:20`

### from `docs/shared-agent-server-plan.md` (1)

1. `G` **Static evidence and authorization do not establish runtime acceptance.** — This replaces the per-instance isolation plan, with implementation authorized by the user. Oracle statically reviewed the direction, actual MAIN seams and feature inventory; neither authorization nor … — `docs/shared-agent-server-plan.md:22`

### from `docs/storage-review-downloads.md` (2)

1. `G` **Owner preservation decision pending.** — | MyAirBridge File Share | 14.33 GiB | archives/shares | medium | KEEP | Purpose inferred from directory name; contents not read. | — `docs/storage-review-downloads.md:49`
2. `G` **Personal-data preservation decision pending.** — | WhatsApp Chat with Mom | 408.83 MiB | archives/shares | medium | KEEP | Purpose inferred from directory name; contents not read. | — `docs/storage-review-downloads.md:69`

### from `docs/storage-review-projects.md` (3)

1. `G` **Worktree and submodule preservation gate unresolved.** — | Lumi † | flutter_app **650.5**; esp32-rainmaker **363.5**; webserver **315.8**; esp32-idf **225.1**; esp32-idf2 **184.3** | Generated estimates within these: about **583.3**, **360.4**, **314.9**, … — `docs/storage-review-projects.md:115`
2. `G` **Unknown state and nested worktree preservation require owner review.** — | Backlog.md | node_modules **682.2**; .backlog **593.0**; .git **97.8**; dist **71.7**; .opencode **61.3** | Dependencies and compiled output dominate the generated category. .backlog is retained as … — `docs/storage-review-projects.md:116`
3. `G` **Host worktree preservation and removal-safety gates remain unresolved.** — **Preserve all agent/worktree directories and their working files.** The marked gemini-* folders, gemini-worktrees, agent-named folders, and potential nested worktrees/submodules may hold uncommitted … — `docs/storage-review-projects.md:126`

### from `docs/storage-review-sessions.md` (4)

1. `G` **Original-preservation gate awaits an approved archival policy.** — Use native context compaction for inexpensive continuation, and a separate lossless archive plus searchable summaries for durable exact retrieval. Do not replace originals with summaries. A lossy … — `docs/storage-review-sessions.md:21`
2. `G` **Compression trial and resource settings await authorization.** — Zstandard 1.5.7 is already installed. Its documented compression is lossless; zstd -t verifies compressed-stream integrity without creating decompressed files, and originals are kept by default (-k … — `docs/storage-review-sessions.md:165`
3. `G` **Archival scope and completeness gate await approval.** — 3. Preserve unsanitized originals and required attachments, subagents, spilled outputs, snapshots, instruction/session state, plus a version/schema/path manifest. Keep credentials out of general … — `docs/storage-review-sessions.md:173`
4. `G` **Consistent-snapshot mechanism must be authorized and validated.** — 3. Preserve unsanitized originals and required attachments, subagents, spilled outputs, snapshots, instruction/session state, plus a version/schema/path manifest. Keep credentials out of general … — `docs/storage-review-sessions.md:173`

### from `docs/storage-review-zesty.md` (1)

1. `G` **Local-history preservation gate awaits owner disposition.** — 5. **Git history and metadata:** 31 outermost .git directories account for approximately **2.1553 GiB of per-path allocation**. They preserve history and potentially local-only objects; they are … — `docs/storage-review-zesty.md:166`

### from `docs/test-suite-improvement-report.md` (2)

1. `G` **Unknown-field preservation recursive docs and retained containment/key checks require current representation and surface review.** — | Markdown/frontmatter/content/artifacts/docs/references | Independent literal parse/serialize examples, unknown-field/body preservation, recursive docs, path containment, byte-bound approval and … — `docs/test-suite-improvement-report.md:327`
2. `G` **Historical identity syntax repair and Git scope matrix needs current supported-operation review.** — | Identity/prefix/IDs/worktrees/duplicates | Canonical identity versus display representation, ambiguity refusal, padded/subtask IDs, separate branch content, collision repair and scope of Git … — `docs/test-suite-improvement-report.md:328` · related: `docs/SPEC.md#open-product-decisions`

### from `docs/test-suite-remediation-plan.md` (2)

1. `G` **Verification gaps remain tracked until verified.** — 6. **Finish before advance:** record changed scope, refactor result, exact proof, exclusions and remaining acceptance gaps in the finding ledger below. Verify and commit the completed slice BEFORE … — `docs/test-suite-remediation-plan.md:37`
2. `G` **Preserve the scoped commit-before-next-slice gate until its execution disposition is confirmed.** — 6. **Finish before advance:** record changed scope, refactor result, exact proof, exclusions and remaining acceptance gaps in the finding ledger below. Verify and commit the completed slice BEFORE … — `docs/test-suite-remediation-plan.md:37` · related: `docs/CONVENTIONS.md#tooling-and-validation`

