# Host storage and cleanup

> **Working sheet — not a contract.** Answers are applied to the owning contracts and to each document's disposition markers.

**What this group is:** What may be deleted from this host: caches, installers, images, toolchains, personal data, retention.

**Default:** Decide — irreversible effects.

**186 statements** — 38 P (proposal / unanswered) · 148 G (evidence or safety gate).

**Decision for this group:** `[ ] Discard all` · `[ ] Plan work (→ alignment plan, not a contract)` · `[ ] Amend a contract` · `[ ] Select individually` · `[ ] Narrow: ______`

Answers are per statement only if you choose "Select individually": `d` discard · `w` plan work · `a` amend the contract named · `?` keep open.

---

### from `docs/BACK-728-handoff.md` (3)

1. `P` **Scratch origin is speculative and does not authorize cleanup.** — | .omp/ | appeared during this session | likely agent-session scratch | — `docs/BACK-728-handoff.md:66` · related: `docs/CONVENTIONS.md#general-principles`
2. `P` **Scratch origin is speculative and does not authorize cleanup.** — | .pi/ | appeared during this session | likely agent-session scratch | — `docs/BACK-728-handoff.md:67` · related: `docs/CONVENTIONS.md#general-principles`
3. `P` **Explicit process.exit implementation proposal is not an approved cleanup strategy.** — 3. Make the outer process explicitly process.exit(0) after the client returns. — `docs/BACK-728-handoff.md:160` · related: `docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host`

### from `docs/SPEC-unconfirmed.md` (8)

1. `G` **Guidance retention and exact content await DEC-5 rather than help-based approval.** — | PRD-005 | Built-in workflow guides cover task creation, execution, finalization, initialization, and workspace use. | Help: instructions --help — named guide list | Pending | | — `docs/SPEC-unconfirmed.md:45` · related: `docs/SPEC.md#open-product-decisions`
2. `G` **Existing MCP implementation is not approval of retention.** — | PRD-006 | MCP is exposed as a separate optional integration alongside the ordinary task CLI. | Help: init --help, task --help, mcp --help | Pending | | — `docs/SPEC-unconfirmed.md:46` · related: `docs/PRODUCT.md#open-product-decisions`
3. `G` **Alias retention remains INV-1 rather than approval by advertised presence.** — Every entry below is an installed-help observation, not approval of command behavior or proof that its implementation works. Command names are relative to agentic-workspace; options shown are … — `docs/SPEC-unconfirmed.md:112` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
4. `G` **Setup and instruction-file conveniences remain DEC-5.** — | CLI-001 | init [projectName] | Initialize project storage/configuration with optional instruction setup. | Help: init --help | Pending | | — `docs/SPEC-unconfirmed.md:116` · related: `docs/SPEC.md#open-product-decisions`
5. `G` **Archive behavior and command retention await DEC-5.** — | CLI-012 | task archive | Archive canceled, duplicate, or invalid work. | Help: task --help | Pending | | — `docs/SPEC-unconfirmed.md:124` · related: `docs/SPEC.md#open-product-decisions`
6. `G` **Instruction-file editing and exact command retention remain DEC-5.** — | CLI-038 | agents [--update-instructions] | Manage the short CLI nudge in agent instruction files; update selected files with --update-instructions. | Help: agents --help | Pending | | — `docs/SPEC-unconfirmed.md:126` · related: `docs/SPEC.md#open-product-decisions`
7. `G` **Shell-helper retention remains DEC-5 even for advertised internal callbacks.** — | CLI-044 | completion __complete <line> <point> | Internal shell-completion callback. | Help: completion --help | Pending | | — `docs/SPEC-unconfirmed.md:132` · related: `docs/SPEC.md#open-product-decisions`
8. `G` **MCP retention remains explicitly undecided.** — | CLI-062 | mcp start | Start the MCP server over stdio. | Help: mcp --help | Pending | | — `docs/SPEC-unconfirmed.md:145` · related: `docs/PRODUCT.md#open-product-decisions`

### from `docs/agent-handover.md` (4)

1. `G` **Startup-owned browser graph retention needs scope disposition without reviving the superseded stateless design.** — - Browser startup loads a ProjectTaskGraph before accepting requests. Prepared task records carry isReady; collection queries filter/project them rather than building readiness indexes per request. — `docs/agent-handover.md:83` · related: `docs/SPEC.md#feature-contracts`
2. `G` **In-memory graph reuse and persistence scope need reconciliation with retained collection architecture.** — - Reconciliation replaces prepared state before notifying subscribers. Dependency details reuse graph context. The graph remains in memory, not persisted to disk. — `docs/agent-handover.md:84` · related: `docs/architecture/application-boundaries.md#application-controller`
3. `G` **Established HTTP scope header/error contract needs retention disposition rather than silent removal.** — - X-Backlog-Project-Scope: missing → 400 PROJECT_SCOPE_REQUIRED; stale → 409 PROJECT_SCOPE_MISMATCH. — `docs/agent-handover.md:92` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
4. `P` **Recommendations do not constitute approval.** — The user was told the responsibility is justified, but a storage-oriented location/name could communicate it better during a coherent storage reorganization. This was a recommendation, not … — `docs/agent-handover.md:229`

### from `docs/alignment-plan.md` (5)

1. `G` **ACT-20 settlement proof and DEC-4 automatic recovery choices remain open without reopening synchronous safeguards.** — | ACT-20 · Action | Durable operation evidence, creation failure | IMPLEMENTATION §6 flags incomplete durable settlement after cleanup/persistence failure; the correction plan requires rehydratable … — `docs/alignment-plan.md:50` · related: `docs/specs/sessions.md#creation-failure-and-recovery`
2. `G` **INV-1 exact API syntax caller mapping and convenience retention remain open.** — **Required work:** Preserve unresolved inventory IDs and evidence until folded into a decision or verified reference. Map the approved API operations to precise supported syntax/options and their … — `docs/alignment-plan.md:83` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
3. `G` **Destructive task-deletion scope and uncommitted-work disposal remain unresolved.** — **Known:** Forget-only deletion does not signal an agent and remains distinct from stopping or purging and from separately approved completion cleanup. Destructive task-deletion scope, including … — `docs/alignment-plan.md:103` · related: `docs/specs/tasks.md#task-deletion`
4. `G` **DEC-1 acceptance completion still depends on owner decisions.** — **Finish:** Owner-approved outcomes for the remaining continuation/recovery/scope/race choices are folded into the task contract and acceptance cases. Existing cleanup-before-removal ordering for … — `docs/alignment-plan.md:107` · related: `docs/specs/tasks.md#task-deletion`
5. `G` **DEC-4 interruption retry and repeated or concurrent user-visible outcomes remain unresolved.** — **Required work:** Keep already approved technical coordination and durability guarantees distinct from unapproved user-visible policy. Identify only remaining automatic interruption recovery, retry … — `docs/alignment-plan.md:135` · related: `docs/SPEC.md#open-product-decisions`

### from `docs/aoe-agent-workspace-reference.md` (1)

1. `G` **External dependency retention remains unverified.** — - portable-pty may be vestigial; not grepped exhaustively. — `docs/aoe-agent-workspace-reference.md:590`

### from `docs/aoe-lifecycle-comparison.md` (1)

1. `P` **Visible-read optimization is a proposal whose current need and adoption are unverified.** — | 1 | readAll() reads EVERY task state.json sequentially per refresh; cost scales with total tasks, not visible ones | session-store.ts:234-259 (comment + sequential await loop); single caller … — `docs/aoe-lifecycle-comparison.md:49` · related: `docs/architecture/application-boundaries.md#stores-and-repositories`

### from `docs/disk-growth-investigation.md` (3)

1. `P` **Absolute cleanup-on-every-exit assurance is not established for killed workers or failed teardown.** — performs now dies with the run instead of accumulating in the real temp directory. — `docs/disk-growth-investigation.md:64` · related: `docs/CONVENTIONS.md#testing`
2. `G` **Duplicate-folder claim is not proven and later Downloads review explicitly leaves it unverified.** — | ~/Downloads (includes two ~8.5 GB duplicate folders) | 67.4 GB | — `docs/disk-growth-investigation.md:90`
3. `P` **The destructive final command lacks target ownership and active-use checks, diagnostic heading is not cleanup permission.** —  — `docs/disk-growth-investigation.md:108`

### from `docs/handoff.md` (1)

1. `G` **Closed-host idle-database safety prerequisite must be revalidated before reusing the maintenance command.** — - The host database ~/.opencode-personal/data/opencode/opencode.db was 12.5 GB, half of it free pages inside the file; the owner compacts it with opencode closed (sqlite3 … "VACUUM;"). Free disk went … — `docs/handoff.md:73`

### from `docs/modes-delivery-plan.md` (1)

1. `G` **Preserve A2 ownership exclusion until writer reconciliation rather than redispatch old phases.** — unreconciled storage changes. — `docs/modes-delivery-plan.md:176` · related: `docs/CONVENTIONS.md#general-principles`

### from `docs/modes-phase1-contract.md` (1)

1. `G` **Fixed build-mode conversion and version-2 shape are not current approved storage requirements.** — Phase 1 defined the data contracts below. Canonical task containers are the only readable task layout; legacy flat task records are not read. Manually move each <name>.md to <lowercase-id>/task.md, … — `docs/modes-phase1-contract.md:20` · related: `docs/BLUEPRINT.md#durable-conversation-and-operation-records`

### from `docs/opencode-migration.md` (3)

1. `G` **Preserve backup-retention gate but clone consistency with live WAL writers needs verification.** — 3. The database is at /Users/imribarr/.opencode-personal/data/opencode/opencode.db (a custom path, approximately 6.1 GB). opencode db path reports the configured path. The commands below make a … — `docs/opencode-migration.md:24` · related: `docs/CONVENTIONS.md#changes-and-refactoring`
2. `G` **Duplicate-project retention and later deletion lack current schema and rollback proof.** — Expected: the project row shows /Users/imribarr/Projects/agentic-workspace; all five old_* counts are 0; new_project_paths is 2; new_linked_worktrees matches the number of task worktrees under the … — `docs/opencode-migration.md:167`
3. `G` **Backup retention remains mandatory pending verified recovery.** — 5. Start a **new** OpenCode session from /Users/imribarr/Projects/agentic-workspace. Confirm this project opens under the new absolute path and its existing sessions are listed. Do not delete the … — `docs/opencode-migration.md:223` · related: `docs/CONVENTIONS.md#changes-and-refactoring`

### from `docs/opentui-workspace-session-contract.md` (1)

1. `G` **Skill command is unsettled guidance API scope.** — agentic-workspace skill prints the AgenticWorkspace Task Management skill body. The agent-specific skill file lives in an owned temporary directory loaded only for that process. No launch writes … — `docs/opentui-workspace-session-contract.md:73` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`

### from `docs/opentui-workspace-spec.md` (1)

1. `G` **Legacy alias-array compatibility needs explicit exception rather than assumed retention.** — - ? opens shortcut help. / searches; Enter replaces the selected row's binding. Binding and description are separate columns in one shared responsive layout, so descriptions stay aligned across … — `docs/opentui-workspace-spec.md:40`

### from `docs/pending-decisions.md` (1)

1. `G` **Exact receipt persistence need requires current recovery evidence.** — - **(i) Bounded first slice (oracle's recommendation).** Adapters take {kind:"new"} | {kind:"resume", nativeSessionId} and return confirmed-or-client-established identity; adapters own proposed ids … — `docs/pending-decisions.md:78` · related: `docs/BLUEPRINT.md#durable-conversation-and-operation-records`

### from `docs/questionnaire-02.md` (14)

1. `P` **Failure policy is unapproved and later retention of truthful instruction-only settings does not settle it.** — **Recommendation:** Yes, with an explanation. Do not silently replace enforcement with instructions asking the agent to comply. — `docs/questionnaire-02.md:91` · related: `docs/specs/configuration.md#edit-agent-settings`
2. `G` **Completion branch retention and unmerged-commit policy are not settled.** — **Recommendation:** No. Keep both until an explicit cleanup or deletion operation, including uncommitted work and unmerged commits. — `docs/questionnaire-02.md:123` · related: `docs/specs/tasks.md#launching-work-and-completing-a-task`
3. `G` **Archive assignment policy is not specified by milestone operation retention.** — **Context:** Tasks may still refer to a milestone after it is no longer active. — `docs/questionnaire-02.md:163` · related: `docs/specs/tasks.md#managing-milestones`
4. `P` **Exact board CLI entry points are not accepted by TUI view retention.** — | board, board view, board export | View a board and export Markdown. | | — `docs/questionnaire-02.md:200` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
5. `G` **Broad configuration API retention is unanswered in questionnaire 6.** — | config, config get/set/list | Edit or inspect general settings. | | — `docs/questionnaire-02.md:203` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
6. `G` **Broad agent-config API retention remains unanswered.** — | agent-config show/init/set, agent-config model set | Edit or inspect agent settings. | | — `docs/questionnaire-02.md:204` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
7. `P` **A distinct cleanup CLI surface and eligibility are not accepted by the completion contract.** — | cleanup | Move eligible completed tasks into completed storage. | | — `docs/questionnaire-02.md:210` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
8. `G` **Guidance editing command retention remains unanswered.** — | agents, agents --update-instructions | Inspect or update workspace guidance in agent instruction files. | | — `docs/questionnaire-02.md:211` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
9. `G` **Shell-completion retention remains unanswered.** — | completion install, completion __complete | Install shell completion and supply completion suggestions. | | — `docs/questionnaire-02.md:213` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
10. `G` **MCP retention is conditional and unanswered.** — | mcp start | Expose workspace operations to tools through an MCP server. | | — `docs/questionnaire-02.md:214` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
11. `G` **Alias retention or removal is unanswered in questionnaire 6.** — | tasks, milestones aliases | Allow plural alternatives to task and milestone. | | — `docs/questionnaire-02.md:216` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
12. `G` **Distinct cleanup command scope is unanswered and must not redefine the accepted completion operation.** — **Question:** Should cleanup only move completed task records, or also delete branches, worktrees, and session history? — `docs/questionnaire-02.md:249` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
13. `G` **Record-only cleanup and running-agent exclusion are unanswered for any distinct cleanup API.** — **Recommendation:** Move completed records only, skipping tasks with running agents. Keep destructive removal as a separate explicit action. — `docs/questionnaire-02.md:250` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
14. `G` **Retention and public managed-file mutation policy remain unanswered.** — **Question:** What modification boundary should these commands follow? — `docs/questionnaire-02.md:255` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`

### from `docs/questionnaire-05.md` (7)

1. `P` **Archive retention and eligibility were not accepted by the answer.** — **Recommendation:** Retain that distinction. Archive canceled/duplicate/invalid tasks; use completion for finished work. — `docs/questionnaire-05.md:42` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
2. `G` **Optional MCP retention remains conditional rather than approved.** — **Recommendation:** Retain it as optional; ordinary task management must not require starting an MCP server. — `docs/questionnaire-05.md:88` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
3. `G` **Conditional retention needs demonstrated benefit or an integration decision and no token saving is established.** — If the MCP helps us in some way, then yes, retain. If it just adds overhead, then let's remove it. If it helps with token usage when agent need to use the task management tools instead of using the … — `docs/questionnaire-05.md:90` · related: `docs/PRODUCT.md#open-product-decisions`
4. `P` **Printable-guide retention is unapproved.** — **Recommendation:** Retain them as opt-in assistance, not mandatory workflows or permission to overwrite unrelated instructions. List either utility you want removed. — `docs/questionnaire-05.md:95` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
5. `G` **Instruction-file editing retention and managed-write policy remain undecided.** — **Recommendation:** Retain them as opt-in assistance, not mandatory workflows or permission to overwrite unrelated instructions. List either utility you want removed. — `docs/questionnaire-05.md:95` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
6. `G` **Clarification request is not acceptance and questionnaire 6 explanations have no retention answers.** — Not really sure what they do still. Is it just printable for the user to see? What does it print? On which use-case would a user want to use this? — `docs/questionnaire-05.md:97` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
7. `G` **Answer settles selective API principles but not each command retention decision.** — **Question:** Which of these command conveniences should remain? — `docs/questionnaire-05.md:101` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`

### from `docs/questionnaire-06.md` (6)

1. `P` **MCP removal recommendation has no answer and retention is explicitly undecided.** — **Recommendation:** Remove MCP unless you name a concrete client or workflow that benefits from it. Do not keep it on an unproven promise of token savings. — `docs/questionnaire-06.md:34` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
2. `G` **Guidance retention remains unanswered.** — **Question:** Should the API retain an on-demand guidance command for agents? — `docs/questionnaire-06.md:39` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
3. `G` **Instruction-file editing retention has no answer.** — **Question:** Should this instruction-file editing command remain? — `docs/questionnaire-06.md:45` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
4. `G` **Broad configuration API retention remains unanswered.** — **Question:** Should external callers have these broad configuration APIs, or only the specific configuration operations with an identified integration need? — `docs/questionnaire-06.md:57` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
5. `P` **Archive retention was not answered in questionnaire 5 and remains blank here.** — **Question:** Should this separate archive operation remain for abandoned work? — `docs/questionnaire-06.md:63` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
6. `P` **Separate archive retention and eligibility remain unapproved.** — **Recommendation:** Yes. Retain archive for unfinished work that will not be completed, and completion for finished work. — `docs/questionnaire-06.md:64` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`

### from `docs/questionnaire.md` (1)

1. `P` **No-separate-archive and Git-only retention detail was not specifically confirmed by the qualified answer or core.** — **Recommendation:** Yes. Fold still-needed material into its proper core destination, then remove superseded standalone documents after DEC-004’s checks. Do not create a separate archive category; … — `docs/questionnaire.md:54` · related: `docs/CONVENTIONS.md#documentation-maintenance`

### from `docs/recent-app-file-activity.md` (27)

1. `G` **Personal-data preservation and duplicate review unresolved.** — | Downloads | ~/Downloads | 64.27 GiB | Mostly personal/shared material. Review archives and possible duplicate folders; do not blanket-delete. | — `docs/recent-app-file-activity.md:35`
2. `G` **Local-work preservation and cleanup permission require review.** — | Go Version Manager | ~/.gvm/pkgsets | 37.11 GiB | Selectively review package sets. May contain local/custom work, not just disposable downloads. | — `docs/recent-app-file-activity.md:36`
3. `G` **Workload-data preservation and cleanup permission require review.** — | Docker | ~/Library/Containers/com.docker.docker | 29.41 GiB | Review images/build cache inside Docker. Preserve persistent volumes and needed containers. | — `docs/recent-app-file-activity.md:38`
4. `G` **VM persistence and disposability remain unknown.** — | Claude Desktop | ~/Library/Application Support/Claude | 10.74 GiB | Dominated by a 10 GiB VM filesystem image; persistence is unverified. Not classified as cache. | — `docs/recent-app-file-activity.md:42`
5. `G` **Cache cleanup depends on unresolved active and offline-use gates.** — | npm | ~/.npm | 5.66 GiB | Mostly execution/download caches; comparatively lower-risk after checking active/offline workflows. | — `docs/recent-app-file-activity.md:46`
6. `P` **Candidate list grants no deletion permission.** — These are review candidates, **not deletion instructions**. Quit the owning app/tool and prefer its own cleanup controls. Cache removal can require downloads or break offline/reproducible workflows. — `docs/recent-app-file-activity.md:50`
7. `P` **App quiescence and recovery requirements need target-specific review.** — These are review candidates, **not deletion instructions**. Quit the owning app/tool and prefer its own cleanup controls. Cache removal can require downloads or break offline/reproducible workflows. — `docs/recent-app-file-activity.md:50`
8. `G` **Active-use and pinning review unresolved.** — | ~/.npm/_npx | 4.33 GiB | Downloaded execution environments; check active or pinned uses. | — `docs/recent-app-file-activity.md:54`
9. `G` **Custom-data preservation and removal permission unresolved.** — | ~/.opencode-personal/cache | 1.91 GiB | Recently active tool cache; preserve custom additions. | — `docs/recent-app-file-activity.md:55`
10. `P` **Proposed cleanup candidate still needs target-specific permission.** — | ~/Library/Caches/Arc | 1.55 GiB | Browser cache, not the Arc profile/history directory. | — `docs/recent-app-file-activity.md:56`
11. `G` **Offline speech requirement and removal decision unresolved.** — | ~/.cache/pi-voice-stt | 1.51 GiB | Almost entirely a speech model; removal interrupts offline speech until reacquired. | — `docs/recent-app-file-activity.md:57`
12. `G` **Recovery cost and cache-removal permission require review.** — | ~/.npm/_cacache | 1.32 GiB | npm download cache; regeneration/network cost. | — `docs/recent-app-file-activity.md:58`
13. `G` **App-managed cleanup and data-value gate unresolved.** — | ~/Library/Caches/net.whatsapp.WhatsApp | 998.79 MiB | Use app-managed cleanup; cache location does not prove every item is expendable. | — `docs/recent-app-file-activity.md:59`
14. `G` **Browser-profile preservation and cleanup scope require review.** — | ~/Library/Caches/company.thebrowser.Browser | 948.35 MiB | Matches Arc's bundle ID; preserve browser profiles outside this cache. | — `docs/recent-app-file-activity.md:60`
15. `P` **Proposed cache-removal permission remains unresolved.** — | ~/Library/Application Support/Code/CachedExtensionVSIXs | 826.27 MiB | 24 extension-package cache files, separate from installed extensions and editor state. | — `docs/recent-app-file-activity.md:61`
16. `G` **Installer archival needs unresolved.** — | Two downloaded installers listed below | 692.46 MiB | Nimbalyst and agent-orchestrator DMGs; confirm no archival need. | — `docs/recent-app-file-activity.md:62`
17. `G` **Dependency recovery and removal permission require review.** — | ~/.gradle/caches | 567.10 MiB | Rebuild/re-download cost; repository availability matters. | — `docs/recent-app-file-activity.md:63`
18. `P` **Cleanup recommendation and preview gate require approval.** — | ~/Library/Caches/Homebrew | 363.04 MiB | Package downloads; use Homebrew cleanup with a preview. | — `docs/recent-app-file-activity.md:65`
19. `G` **Emulator persistence and cleanup safety remain unresolved.** — | .android | avd 1.68 GiB — emulator storage, potentially persistent user state | — `docs/recent-app-file-activity.md:118`
20. `G` **Deployment ownership, rollback and recovery gates unresolved.** — Each contains Autodesk Fusion.app and bundled libraries. Active version, rollback requirements, and unique APFS sharing are **not established**. These are application resources, not generic cache. … — `docs/recent-app-file-activity.md:168`
21. `G` **Persistent-data preservation and disk-image removal permission unresolved.** — **Docker:** Containers/com.docker.docker/Data/vms/0/data/Docker.raw occupies **29.38 GiB allocated**, versus **59.60 GiB logical**. Last observed modification October 12. It may contain images, build … — `docs/recent-app-file-activity.md:170`
22. `G` **Session and browser-store preservation gate awaits owner disposition.** — **Claude:** Application Support/Claude/vm_bundles/claudevm.bundle/rootfs.img occupies **10.00 GiB**, modified June 16. The whole VM bundle is 10.24 GiB. Other resources include claude-code/2.1.222 … — `docs/recent-app-file-activity.md:172`
23. `G` **VM persistence and cleanup safety remain unknown.** — **Claude:** Application Support/Claude/vm_bundles/claudevm.bundle/rootfs.img occupies **10.00 GiB**, modified June 16. The whole VM bundle is 10.24 GiB. Other resources include claude-code/2.1.222 … — `docs/recent-app-file-activity.md:172`
24. `G` **Browser-history preservation and cleanup scope require owner decision.** — **Arc:** profile History and Favicons databases, including versioned profile snapshots, are substantial recent modifications. They are user/browser data, not ordinary cache. Do not blanket-delete … — `docs/recent-app-file-activity.md:176`
25. `G` **Active-version and recovery gates unresolved for binary cleanup.** — Repeated tool binaries are possible version-retention opportunities, but active versions and recovery requirements were not checked. Databases, Git packs, sessions, and logs can contain valuable … — `docs/recent-app-file-activity.md:241`
26. `G` **Historical-data preservation and removal permission require owner review.** — Repeated tool binaries are possible version-retention opportunities, but active versions and recovery requirements were not checked. Databases, Git packs, sessions, and logs can contain valuable … — `docs/recent-app-file-activity.md:241`
27. `G` **Ownership and recovery gates remain unresolved for future cleanup.** — - No passwords or personal file contents were retrieved. No cleanup was performed. Review app ownership and backup/recovery needs before deleting anything. — `docs/recent-app-file-activity.md:251`

### from `docs/refactoring-handoff.md` (3)

1. `G` **Historical Elysia server decomposition has no current retention or technology-selection decision here.** — | Add an HTTP route | src/server/resources/, composed by app.ts; retain Elysia app, host, task collection, and WebSocket boundaries. | — `docs/refactoring-handoff.md:34` · related: `docs/adr/README.md#active-decisions`
2. `G` **Blanket rollback preservation lacks operation scope and must not imply rollback for partial cleanup.** — - Preserve replacement versus incremental updates, structured Markdown boundaries, locking, rollback, deterministic serialization, and Git transaction ownership. — `docs/refactoring-handoff.md:40` · related: `docs/specs/tasks.md#task-deletion`
3. `G` **HTTP replacement retention requires disposition within selective API scope.** — - Preserve the existing HTTP full-replacement and coercion behavior. Any validation tightening needs a product decision covering port strings/falsy zero, Boolean("false"), partial parseInt, and … — `docs/refactoring-handoff.md:45` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`

### from `docs/refactoring-review.md` (7)

1. `G` **Browser retention and route/modal architecture applicability need disposition.** — | Browser | src/web/ | App data and route/modal sessions own refresh and route identity; features own initialization, milestone, form, and modal concerns. | — `docs/refactoring-review.md:33` · related: `docs/SPEC.md#feature-contracts`
2. `G` **MCP retention remains undecided.** — - CLI, browser, TUI, and MCP express one model; the CLI remains canonical and MCP is a composed optional adapter. — `docs/refactoring-review.md:45` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
3. `G` **HTTP full-replacement retention needs scope disposition.** — - Existing HTTP coercion and full-replacement behavior is preserved. Tightening it needs a product decision: port strings and falsy zero, "false" Boolean coercion, permissive parseInt, and dropped … — `docs/refactoring-review.md:46` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
4. `G` **Port strings and falsy-zero validation policy is unanswered.** — - Existing HTTP coercion and full-replacement behavior is preserved. Tightening it needs a product decision: port strings and falsy zero, "false" Boolean coercion, permissive parseInt, and dropped … — `docs/refactoring-review.md:46` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
5. `G` **False-string Boolean coercion policy is unanswered.** — - Existing HTTP coercion and full-replacement behavior is preserved. Tightening it needs a product decision: port strings and falsy zero, "false" Boolean coercion, permissive parseInt, and dropped … — `docs/refactoring-review.md:46` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
6. `G` **Permissive integer parsing policy is unanswered.** — - Existing HTTP coercion and full-replacement behavior is preserved. Tightening it needs a product decision: port strings and falsy zero, "false" Boolean coercion, permissive parseInt, and dropped … — `docs/refactoring-review.md:46` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
7. `G` **Dropped non-string ID policy is unanswered.** — - Existing HTTP coercion and full-replacement behavior is preserved. Tightening it needs a product decision: port strings and falsy zero, "false" Boolean coercion, permissive parseInt, and dropped … — `docs/refactoring-review.md:46` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`

### from `docs/shared-agent-runtime-simplification.md` (1)

1. `G` **Documentation and authorization do not establish verification.** — - Resolve per-session live-delete, strict/retryable session cleanup, and running-limit policy with the user before implementing those behavior changes. Resolve field-dependent policies before … — `docs/shared-agent-runtime-simplification.md:68`

### from `docs/storage-cleanup-plan.md` (21)

1. `G` **Host-specific preservation gate requires owner review, historical size is not deletion authority.** — | 1 | ~/Downloads | 64.27 GiB | Review, not bulk-delete | Mostly personal: shares, photos, study material. See storage-review-downloads.md. | — `docs/storage-cleanup-plan.md:34`
2. `G` **Per-project ownership and reproducibility require a decision before cleanup.** — | 3 | ~/Projects generated dirs (node_modules, venv, build) | ~10.7 GiB | REVIEW per project | Source (4.9 GiB) and .git (1.1 GiB) preserve. | — `docs/storage-cleanup-plan.md:36`
3. `G` **Business-data preservation and cleanup permission remain owner-specific.** — | 4 | ~/Zesty deps/build | several GiB | REVIEW per project | Business/project data — preserve. | — `docs/storage-cleanup-plan.md:37`
4. `P` **VM persistence and retirement authorization are not established.** — | 5 | ~/Library/Application Support/Claude/vm_bundles | 10 GiB | LEAVE unless retiring | rootfs.img; persistence unverified; not a cache. | — `docs/storage-cleanup-plan.md:38`
5. `P` **Cache removal recommendation lacks active-use and recovery approval.** — | 9 | ~/.npm/_npx + _cacache | 5.65 GiB | CLEANUP-CANDIDATE | Re-download cost; safe-ish. | — `docs/storage-cleanup-plan.md:42`
6. `G` **Cache classification alone does not authorize removal.** — | 10 | ~/.opencode-personal/cache | 1.91 GiB | CLEANUP-CANDIDATE | Tool cache. | — `docs/storage-cleanup-plan.md:43`
7. `G` **Offline-use requirements and removal permission remain unresolved.** — | 11 | ~/.cache/pi-voice-stt | 1.51 GiB | REVIEW | Speech model; blocks offline STT if removed. | — `docs/storage-cleanup-plan.md:44`
8. `G` **Host cache cleanup needs app-specific review and permission.** — | 12 | ~/Library/Caches/Arc + company.thebrowser.Browser | 2.5 GiB | CLEANUP-CANDIDATE | Browser caches; profiles are elsewhere. | — `docs/storage-cleanup-plan.md:45`
9. `G` **Build reproducibility and offline requirements remain unresolved.** — | 13 | ~/.gradle/caches + wrapper | 1.06 GiB | REVIEW | Offline/repro build impact. | — `docs/storage-cleanup-plan.md:46`
10. `G` **Host cache cleanup permission remains unresolved.** — | 14 | ~/Library/Application Support/Code/CachedExtensionVSIXs | 826 MiB | CLEANUP-CANDIDATE | Extension download cache only. | — `docs/storage-cleanup-plan.md:47`
11. `G` **Installation and archival needs remain unresolved.** — | 16 | Downloads/agent-orchestrator-darwin-arm64.dmg | 229 MiB | REVIEW | Confirm installed. | — `docs/storage-cleanup-plan.md:49`
12. `G` **Anonymous-volume amount conflicts with detailed named-volume evidence and data value is unverified.** — | 17 | Dangling anonymous Docker volumes | ~207 MB | docker volume prune | Unattached, unattributable; low value. | — `docs/storage-cleanup-plan.md:50`
13. `G` **Missing toolchains do not establish binary disuse or removal permission.** — | 18 | ~/.gvm/pkgsets/*/bin (old sets) | ~600 MiB | REVIEW | Bins now orphaned; toolchains not installed. | — `docs/storage-cleanup-plan.md:51`
14. `G` **Preserve workload-specific exclusions until retirement is explicitly decided.** — - Docker: sintro-*, kwok-*, mobileye-vm_* containers and infra_*, mobileye-vm_* volumes. — `docs/storage-cleanup-plan.md:56`
15. `G` **Name similarity does not establish duplication or safe deletion.** — - Characters vs Characters-Copy in Downloads: possible duplicate, **unverified**. — `docs/storage-cleanup-plan.md:57`
16. `P` **Host archival proposal is not approved product scope or an authorized retention change.** — 2. Keep cold originals; **archive losslessly with zstd** (already installed) plus a small searchable summary that points into the archive. — `docs/storage-cleanup-plan.md:68` · related: `docs/PRODUCT.md#non-goals`
17. `G` **Exact host archival preservation gate awaits retention-policy approval.** — 3. Never replace originals with summaries — summaries lose exact wording, IDs, tool output, attachments. — `docs/storage-cleanup-plan.md:69`
18. `P` **Retain host cleanup precondition pending target-specific authorization.** — - Confirm each target's ownership and rebuild/re-download path. — `docs/storage-cleanup-plan.md:77`
19. `P` **Host app-quiescence gate needs target-specific validation.** — - Quit the owning app before cleaning its caches. — `docs/storage-cleanup-plan.md:78`
20. `P` **Cleanup mechanism recommendation awaits target-specific review.** — - Prefer app-supported cleanup/prune over manual deletion. — `docs/storage-cleanup-plan.md:79`
21. `G` **Host reclamation acceptance check remains required if cleanup is authorized.** — - Re-measure host free space after cleanup; logical deletion may not release host blocks. — `docs/storage-cleanup-plan.md:80`

### from `docs/storage-review-docker.md` (5)

1. `G` **Attribution of 207 MB to anonymous volumes conflicts with named-volume sizes below, preservation needs remain unresolved.** — Preserved containers: sintro-postgres, sintro-redis (infrastructure), deskribe-query-api, grafana, victoriametrics (mobileye-vm), and kwok-clamp-repro-kwok-controller, -kube-scheduler, … — `docs/storage-review-docker.md:58`
2. `G` **Historical review estimate cannot retire inventory, rebuildability or permission gates for future cleanup.** — builder du separately reported **2.119 GB shared, 8.451 GB private, 10.57 GB total/reclaimable**. Shared cache can remain referenced by images; do not add its 10.57 GB to image estimates. The … — `docs/storage-review-docker.md:73`
3. `G` **Retain host prune safety gate pending workload-data and removal-permission decisions.** — 4. **Avoid blanket docker system prune --volumes:** it removes stopped containers and can delete persistent data in unused anonymous volumes. Named volumes need separate review as well. Ordinary … — `docs/storage-review-docker.md:108`
4. `G` **Retirement, backup and destructive disk-reset permission require separate approval.** — 5. If intentionally retiring this Docker Desktop installation, use its supported reset/uninstall workflow after preserving needed data. Treat deletion of Docker.raw or reducing its maximum disk size … — `docs/storage-review-docker.md:109`
5. `G` **Data-value safety gate remains unresolved for future cleanup.** — Validation: local endpoint and default context were checked. After force-killing stale Docker backends and relaunching, the daemon reported server 29.8.2/API 1.56 and the authorized cleanup … — `docs/storage-review-docker.md:118`

### from `docs/storage-review-downloads.md` (7)

1. `G` **Owner and backup gates remain unresolved, labels grant no cleanup permission.** — These are **proposed logical destinations only**, not created folders. Folder names start with Downloads/ and are relative to the home directory. Confidence describes category evidence, not deletion … — `docs/storage-review-downloads.md:29`
2. `G` **Owner and data-retention decision pending.** — | vm-export-data | 2.65 GiB | source/tools | medium | REVIEW | Purpose inferred from directory name; contents not read. | — `docs/storage-review-downloads.md:55`
3. `G` **Original-data retention decision pending.** — | web_valley_forums | 796.87 MiB | source/tools | medium | REVIEW | Source/tool/data artifact inferred from name or extension; may be project output or original data. | — `docs/storage-review-downloads.md:59`
4. `G` **Original-data retention decision pending.** — | connect_device_node | 570.50 MiB | source/tools | medium | REVIEW | Source/tool/data artifact inferred from name or extension; may be project output or original data. | — `docs/storage-review-downloads.md:64`
5. `G` **Original-data retention decision pending.** — | lumi_connection_kit | 570.47 MiB | source/tools | medium | REVIEW | Source/tool/data artifact inferred from name or extension; may be project output or original data. | — `docs/storage-review-downloads.md:65`
6. `P` **Installer deletion recommendation is not explicit permission.** — - **Nimbalyst DMG: DELETE-CANDIDATE**, based on the supplied fact that Nimbalyst is already uninstalled. This applies only to the installer. — `docs/storage-review-downloads.md:296`
7. `G` **Installer and working-app safety review remains unresolved.** — - **agent-orchestrator DMG: REVIEW**; installation unclear. Other DMGs/packages/app bundles are also REVIEW: confirm installed version, need for offline reinstall and ownership before deletion. App … — `docs/storage-review-downloads.md:297`

### from `docs/storage-review-gvm.md` (20)

1. `P` **Historical cleanup recommendation requires owner permission and satisfied cache gates.** — **Keep the active/default go1.27.0/global set. Review older sets, then conditionally clean their module caches rather than deleting entire sets.** The older sets contain 33,233,829,888 allocated … — `docs/storage-review-gvm.md:21`
2. `G` **Binary migration and consumer review remain unresolved.** — **Keep the active/default go1.27.0/global set. Review older sets, then conditionally clean their module caches rather than deleting entire sets.** The older sets contain 33,233,829,888 allocated … — `docs/storage-review-gvm.md:21`
3. `G` **Binary preservation and cache cleanup gates unresolved by this review.** — | go1.24.2 | 8,351,424,512 (7.78 GiB) | 8,185,221,120 (7.62 GiB) | REVIEW binaries; CONDITIONAL-CLEANUP cache | — `docs/storage-review-gvm.md:41`
4. `G` **Binary preservation and cache cleanup gates unresolved by this review.** — | go1.24.7 | 6,745,788,416 (6.28 GiB) | 6,656,856,064 (6.20 GiB) | REVIEW binaries; CONDITIONAL-CLEANUP cache | — `docs/storage-review-gvm.md:42`
5. `G` **Compatibility and cache cleanup gates unresolved.** — | go1.25.0 | 5,740,728,320 (5.35 GiB) | 5,664,579,584 (5.28 GiB) | REVIEW: project minimum matches; CONDITIONAL-CLEANUP cache | — `docs/storage-review-gvm.md:44`
6. `G` **Binary preservation and cache cleanup gates unresolved.** — | go1.26.0 | 4,471,681,024 (4.16 GiB) | 4,394,328,064 (4.09 GiB) | REVIEW binaries; CONDITIONAL-CLEANUP cache | — `docs/storage-review-gvm.md:45`
7. `G` **Compatibility and cache cleanup gates unresolved.** — | go1.23.1 | 2,392,825,856 (2.23 GiB) | 2,392,825,856 (2.23 GiB) | REVIEW: project minimum matches; CONDITIONAL-CLEANUP cache | — `docs/storage-review-gvm.md:46`
8. `G` **Cache cleanup conditions require separate authorization.** — | go1.23.6 | 2,021,732,352 (1.88 GiB) | 2,021,732,352 (1.88 GiB) | CONDITIONAL-CLEANUP cache | — `docs/storage-review-gvm.md:47`
9. `G` **Cache cleanup conditions require separate authorization.** — | go1.22.4 | 1,863,270,400 (1.74 GiB) | 1,863,270,400 (1.74 GiB) | CONDITIONAL-CLEANUP cache | — `docs/storage-review-gvm.md:48`
10. `G` **Compatibility and cache cleanup gates unresolved.** — | go1.22 | 918,159,360 (875.62 MiB) | 918,159,360 (875.62 MiB) | REVIEW older compatibility needs; CONDITIONAL-CLEANUP cache | — `docs/storage-review-gvm.md:49`
11. `G` **Compatibility and cache cleanup gates unresolved.** — | go1.21 | 820,297,728 (782.30 MiB) | 820,297,728 (782.30 MiB) | REVIEW: project minimum matches; CONDITIONAL-CLEANUP cache | — `docs/storage-review-gvm.md:50`
12. `G` **Cache cleanup conditions require separate authorization.** — | go1.24 | 316,559,360 (301.89 MiB) | 316,559,360 (301.89 MiB) | CONDITIONAL-CLEANUP cache | — `docs/storage-review-gvm.md:51`
13. `P` **Host preservation recommendation has no product-core disposition.** — | system | 0 (0 B) | 0 (0 B) | KEEP: no storage benefit from removal | — `docs/storage-review-gvm.md:52`
14. `G` **Cache-local edits, dependency recovery, offline needs and active consumers are unsatisfied cleanup gates.** — “Conditional” means no local edits to cached source need preservation, private/public dependencies remain obtainable, offline operation is not required, and no concurrent Go build/install depends on … — `docs/storage-review-gvm.md:54`
15. `G` **Existing initialized-shell prerequisite remains a safety boundary for any later authorized inspection.** — Read-only GVM commands, in an existing shell where GVM is already initialized: — `docs/storage-review-gvm.md:131`
16. `P` **Targeted cleanup recommendation remains conditional on unverified safety gates.** — The Go tool's own go help clean confirms that -modcache removes the entire module cache, **including unpacked dependency source**. After satisfying the cleanup conditions above, the largest old cache … — `docs/storage-review-gvm.md:139`
17. `P` **Destructive host command example needs explicit target authorization and satisfied cache-preservation conditions.** —  — `docs/storage-review-gvm.md:147`
18. `G` **Recovery access and concurrent-use safety conditions remain unresolved.** — This targets **8,185,221,120 bytes (7.62 GiB)** of allocated cache attribution. It also removes that cache's downloaded toolchains; reacquisition may require private-repository credentials/network … — `docs/storage-review-gvm.md:149`
19. `G` **Per-cache removal still requires separate review and permission.** — This targets **8,185,221,120 bytes (7.62 GiB)** of allocated cache attribution. It also removes that cache's downloaded toolchains; reacquisition may require private-repository credentials/network … — `docs/storage-review-gvm.md:149`
20. `G` **Whole-set deletion safety and installed behavior remain unverified.** — Upstream GVM documents gvm pkgset delete <name> and implements gvm uninstall <version>. Whole-set deletion also removes binaries and custom content; it is not recommended here. Upstream uninstall … — `docs/storage-review-gvm.md:151`

### from `docs/storage-review-projects.md` (2)

1. `G` **Unknown state and Git preservation gate awaits owner review.** — | ruflo | v3 **1,586.0**; .git **497.9**; .gitnexus **247.4**; v2 **145.7**; ruflo **9.7** | v3 is overwhelmingly conventional generated storage: about **1,551.4 MiB**. .gitnexus and v2 remain … — `docs/storage-review-projects.md:113`
2. `G` **Checkpoint preservation disposition remains owner-specific, sizes are historical.** — | summarizer | checkpoints **2,203.1**; data **0.789**; __pycache__ **0.023** | Checkpoints account for almost the entire folder and are retained as assets/user data. These are its three immediate … — `docs/storage-review-projects.md:114`

### from `docs/storage-review-sessions.md` (12)

1. `P` **External-store archival proposal is not an approved product feature or host retention change.** — Use native context compaction for inexpensive continuation, and a separate lossless archive plus searchable summaries for durable exact retrieval. Do not replace originals with summaries. A lossy … — `docs/storage-review-sessions.md:21` · related: `docs/PRODUCT.md#non-goals`
2. `P` **Custom persistence must be resolved before applying archival or cleanup recommendations.** — OpenCode source was verified at the official v1.19.0 tag. The personal database includes additional session/instruction tables absent from the default store; the version string alone does not prove … — `docs/storage-review-sessions.md:60`
3. `G` **VM persistence and deletion safety remain unknown.** — - Desktop vm_bundles: **10,996,469,760 bytes (10.24 GiB)**, including claudevm.bundle/rootfs.img: **10,737,418,240 bytes (10 GiB)**. The image is potential persistent VM data, not established as … — `docs/storage-review-sessions.md:77`
4. `G` **Unknown record ownership cannot authorize retention changes.** — - ~/.claude/homunculus: **49,782,784 bytes**, including 82 JSONL files allocating **49,668,096 bytes**. Ownership/record purpose is unknown; not classified as native conversation storage. — `docs/storage-review-sessions.md:81`
5. `G` **Actual host retention policy must be established before changing it.** — The current documented cleanupPeriodDays default is 30; 0 fails validation rather than disabling cleanup. Desktop/Cowork-origin transcripts have separate retention behavior in newer versions. No … — `docs/storage-review-sessions.md:150`
6. `G` **Retention option includes an unresolved original-preservation requirement.** — | Native context compaction | Originals must remain separately retained | Supported continuation; omitted facts absent from context | Reduces tokens, not demonstrated storage; summary may add bytes | — `docs/storage-review-sessions.md:160`
7. `P` **Proposed host retention workflow awaits approval.** — 1. Keep active sessions in their native stores. Use native compaction for context cost, not storage retention. — `docs/storage-review-sessions.md:171`
8. `G` **Cold-retention and profile identity policy remain undecided.** — 2. Define cold retention by actual last session update, separately per profile. Do not use DB file mtime or assume the two OpenCode stores are duplicates. — `docs/storage-review-sessions.md:172`
9. `G` **Lossless archival and integrity gate await workflow approval.** — 4. Compress the preservation package losslessly with the installed zstd. Retain originals until archive integrity and restored-file hashes pass. For disk savings, subsequent removal or relocation … — `docs/storage-review-sessions.md:174`
10. `G` **Removal and relocation permission remain separate unresolved gates.** — 4. Compress the preservation package losslessly with the installed zstd. Retain originals until archive integrity and restored-file hashes pass. For disk savings, subsequent removal or relocation … — `docs/storage-review-sessions.md:174`
11. `P` **Host retrieval-index proposal is not approved durable product scope.** — 5. Add small searchable summaries and an index mapping app/profile/session/time to archive member, exact transcript location and attachment references. Treat summaries as navigation hints: retrieve … — `docs/storage-review-sessions.md:175` · related: `docs/PRODUCT.md#non-goals`
12. `G` **Optional indexing cost and privacy tradeoff has no approved disposition.** — 5. Add small searchable summaries and an index mapping app/profile/session/time to archive member, exact transcript location and attachment references. Treat summaries as navigation hints: retrieve … — `docs/storage-review-sessions.md:175`

### from `docs/storage-review-zesty.md` (8)

1. `G` **Business-data preservation gate awaits owner review.** — Legend: **P** = project/source/assets/business data or unknown, preserve; **D** = installed dependencies, review reproducibility; **V** = possible Python environment, confirm role; **C** = possible … — `docs/storage-review-zesty.md:105`
2. `G` **Dependency reproducibility gate unresolved.** — Legend: **P** = project/source/assets/business data or unknown, preserve; **D** = installed dependencies, review reproducibility; **V** = possible Python environment, confirm role; **C** = possible … — `docs/storage-review-zesty.md:105`
3. `G` **Environment role requires owner confirmation.** — Legend: **P** = project/source/assets/business data or unknown, preserve; **D** = installed dependencies, review reproducibility; **V** = possible Python environment, confirm role; **C** = possible … — `docs/storage-review-zesty.md:105`
4. `G` **Generated-output classification requires confirmation.** — Legend: **P** = project/source/assets/business data or unknown, preserve; **D** = installed dependencies, review reproducibility; **V** = possible Python environment, confirm role; **C** = possible … — `docs/storage-review-zesty.md:105`
5. `G` **Host history preservation gate awaits owner disposition.** — Legend: **P** = project/source/assets/business data or unknown, preserve; **D** = installed dependencies, review reproducibility; **V** = possible Python environment, confirm role; **C** = possible … — `docs/storage-review-zesty.md:105`
6. `G` **Cache role and removal safety require confirmation.** — | dashboard | .angular | 1.2418 | C — likely framework output/cache; confirm | — `docs/storage-review-zesty.md:114`
7. `G` **Tool-state preservation depends on unresolved ownership review.** — | pod-rightsizing | .opencode | 0.0598 | P — tooling/project state; not assumed cache | — `docs/storage-review-zesty.md:132`
8. `G` **Cleanup prerequisites require an owner-led review not supplied by the inventory.** — Category totals can overlap (for example generated output inside dependencies) and use per-path rather than unique-block accounting. Do not add them together or treat them as reclaimable space. No … — `docs/storage-review-zesty.md:168`

### from `docs/test-suite-improvement-report.md` (5)

1. `G` **Exact lost-ack resource-retention behavior needs current transport contract confirmation.** — **Preserve:** no pane destruction before provenance validation; lost ACK retains resources; failed kill retains retry evidence; conclusively missing instance is distinct from an arbitrary error … — `docs/test-suite-improvement-report.md:221` · related: `docs/BLUEPRINT.md#application-controller-and-stores`
2. `G` **Preserve output resource bound pending current cleanup-boundary review.** — **Preserve:** unknown/survivor means nonzero outcome plus retained evidence; no TMPDIR deletion before terminal proof; no launch after closed admission; bounded capture; concurrent settlement … — `docs/test-suite-improvement-report.md:251` · related: `docs/CONVENTIONS.md#testing`
3. `G` **Retained stdio and resource-registration obligations depend on integration-scope disposition.** — **Preserve:** unique IDs, draft promotion/demotion, lost-write protection, compile target version, stdio startup, resource registration, and cleanup error reporting. Remove this smoke script only if … — `docs/test-suite-improvement-report.md:271` · related: `docs/SPEC.md#open-product-decisions`
4. `G` **Preserve adapter validation and containment safety pending retained MCP contract disposition.** — - Keep enum canonicalization, unknown values, workspace-root containment, client roots, and no-remote behavior as adapter-specific regressions. Preserve error results and disk nonmutation on … — `docs/test-suite-improvement-report.md:291` · related: `docs/SPEC.md#open-product-decisions`
5. `G` **Upgrade journals exact receipts automatic crash recovery and retry policy need disposition under current contracts.** — - Preserve upgrade containment, journals, crash recovery, canonical project roots, immutable path contexts, resume receipts, reservation races, stale callbacks, marker validation, and cleanup … — `docs/test-suite-improvement-report.md:316` · related: `docs/BLUEPRINT.md#open-design-decisions`

### from `docs/tmux-call-sites.md` (3)

1. `G` **Preserve repeated-cleanup quiet-flag safeguard pending verification.** — | 14 | 502 | unbind-key -q -T <table> <key> | rebuildTopology | void | loop, **3 executions**; idempotent cleanup | — `docs/tmux-call-sites.md:166`
2. `P` **Quiet cleanup semantics need verification and blanket failure-as-unset is not established.** — family — non-zero means "unset", not "error". — `docs/tmux-call-sites.md:336`
3. `G` **Preserve error-channel distinction without approving swallowed cleanup failures.** — :1053 (silent return) and :590 (ignored). — `docs/tmux-call-sites.md:393` · related: `docs/CONVENTIONS.md#error-handling`

### from `docs/tmux-layer-spec.md` (3)

1. `G` **Preserve absent-option cleanup safeguard pending verification.** — | set-option -qu -t <session> <key> | without -q, unsetting an absent option exits non-zero → throw. | — `docs/tmux-layer-spec.md:126` · related: `docs/CONVENTIONS.md#error-handling`
2. `P` **Proposed discovery argv does not approve orphan cleanup.** — | listSessions | ["list-sessions", "-F", "#{session_name}"] (:113 orphan sweep) | — `docs/tmux-layer-spec.md:302`
3. `G` **Preserve quiet cleanup safeguard pending verification.** — | unbindKey | ["unbind-key", "-q", "-T", table, key] | **-q mandatory** (§2.1). Sites :389, :441. | — `docs/tmux-layer-spec.md:422`

