# Board, workspace and screen behavior

> **Working sheet — not a contract.** Answers are applied to the owning contracts and to each document's disposition markers.

**What this group is:** How the board and workspace screens behave: views, filters, search, focus, keybindings, footers.

**Default:** Decide — presentation contract.

**78 statements** — 31 P (proposal / unanswered) · 47 G (evidence or safety gate).

**Decision for this group:** `[ ] Discard all` · `[ ] Plan work (→ alignment plan, not a contract)` · `[ ] Amend a contract` · `[ ] Select individually` · `[ ] Narrow: ______`

Answers are per statement only if you choose "Select individually": `d` discard · `w` plan work · `a` amend the contract named · `?` keep open.

---

### from `docs/BACK-728-handoff.md` (4)

1. `G` **Directory provenance and disposition remain unknown.** — | docs/pi-extensions/ | **unknown** | ownership never established. Do not commit. | — `docs/BACK-728-handoff.md:65` · related: `docs/CONVENTIONS.md#general-principles`
2. `G` **Legacy live-state migration authorization and ownership remain unresolved.** — | .agentic-workspace/ migration | **Never run.** The user has not done it. Roughly 30 live session dirs remain under .git/backlog-workspace/. Leave it to the user. | — `docs/BACK-728-handoff.md:364` · related: `docs/CONVENTIONS.md#changes-and-refactoring`
3. `P` **Legacy live-data conversion remains authorization-gated and is not approved by this annotation.** — 8. Run the .agentic-workspace/ migration — but only with the user's explicit go-ahead. — `docs/BACK-728-handoff.md:440` · related: `docs/CONVENTIONS.md#changes-and-refactoring`
4. `G` **Default-server death cause and isolation audit completion were never established.** — default socket. **This is worth auditing** — it is a live risk to the user's sessions. — `docs/BACK-728-handoff.md:470` · related: `docs/CONVENTIONS.md#testing`

### from `docs/SPEC-unconfirmed.md` (1)

1. `G` **View-state locking mechanism is observed evidence not an approved universal synchronization policy.** — | NFR-009 | Session-store and view-state updates reload and mutate state under a file lock before writing. This is evidence of those concurrency mechanisms, not a whole-product no-lost-update … — `docs/SPEC-unconfirmed.md:107` · related: `docs/architecture/application-boundaries.md#stores-and-repositories`

### from `docs/agent-handover.md` (1)

1. `P` **Established browser WebSocket targeting and no-polling contract need retained surface disposition.** — - WebSocket URL carries projectScope; one shared socket, no polling fallback. — `docs/agent-handover.md:94` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`

### from `docs/agent-of-empires-runtime-research.md` (1)

1. `G` **Research evidence does not authorize product changes.** — This note synthesizes verified librarian findings; it does not authorize implementation or migration. — `docs/agent-of-empires-runtime-research.md:22`

### from `docs/alignment-plan.md` (2)

1. `G` **DEC-5 answer destinations remain unfinished accounting.** — **Finish:** Each answer has an explicit contract/action destination. No unapproved recommendation silently becomes policy; newly approved removals gain executable finish conditions here. — `docs/alignment-plan.md:147` · related: `docs/SPEC.md#overview`
2. `G` **Any newly approved removals still require bounded implementation finish criteria.** — **Finish:** Each answer has an explicit contract/action destination. No unapproved recommendation silently becomes policy; newly approved removals gain executable finish conditions here. — `docs/alignment-plan.md:147` · related: `docs/SPEC.md#global-behavioral-invariants`

### from `docs/aoe-agent-workspace-reference.md` (7)

1. `P` **Historical symptom attribution and mandatory process.exit remedy are not established by the approved exit behavior.** — handler must call process.exit explicitly rather than merely unmounting. — `docs/aoe-agent-workspace-reference.md:50` · related: `docs/screens/workspace.md#focus-and-constrained-terminals`
2. `P` **Claim that reducing fork count is the only available optimization is not established by external source absence.** — fork count. — `docs/aoe-agent-workspace-reference.md:394` · related: `docs/adr/README.md#active-decisions`
3. `G` **Terminal ownership alone cannot establish that every process-lifetime exit bug is impossible.** — process group. Our bug is structurally impossible in this design rather than patched. — `docs/aoe-agent-workspace-reference.md:434` · related: `docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host`
4. `P` **Bind-arm-await startup ordering is prototype evidence whose current local applicability is not established.** — work: awaiting the dial-in before arming deadlocks until timeout. — `docs/aoe-agent-workspace-reference.md:479` · related: `docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport`
5. `G` **External dashboard paste synthesis remains unanswered.** — - Whether the dashboard composer synthesizes a paste burst internally was not found. — `docs/aoe-agent-workspace-reference.md:588`
6. `G` **This repeated external send finding is explicitly labeled unverified despite the earlier source claim.** — - No retry or queue exists for a failed dashboard send. — `docs/aoe-agent-workspace-reference.md:589`
7. `G` **Attribution of the local bug to surviving handles is not independently established by the external reference.** — **unmount ≠ process exit**. Any surviving timer, worker, or socket holds the terminal. — `docs/aoe-agent-workspace-reference.md:648` · related: `docs/screens/workspace.md#focus-and-constrained-terminals`

### from `docs/aoe-lifecycle-implementation-plan.md` (2)

1. `P` **Exact filtered-read signature and missing-file semantics are proposed details.** — | Store filter | src/agent-workspace/session-store.ts:234-257 | readAll(taskIds?: readonly string[]): build the accepted slug set (slug, src/agent-workspace/session-utils.ts:23) and skip non-matching … — `docs/aoe-lifecycle-implementation-plan.md:217` · related: `docs/architecture/application-boundaries.md#stores-and-repositories`
2. `P` **Lease acceptance gate is not established by this plan or mapping.** — **Stop condition.** Idle forks halve, no spurious takeover appears in a 60 s idle log, and a killed owner's lease is still reclaimed. — `docs/aoe-lifecycle-implementation-plan.md:345` · related: `docs/CONVENTIONS.md#testing`

### from `docs/aoe-status-tracking-plan.md` (6)

1. `G` **Pausing observation under modals must reconcile the all-task thirty-second guarantee.** — - Pause polling while #hasModal() is true (workspace-controller.ts:405, :419-429) and while a session start/attach is in flight — those already schedule their own refresh. — `docs/aoe-status-tracking-plan.md:415` · related: `docs/specs/sessions.md#sessions`
2. `P` **Exact placeholder copy is explicitly not approved.** — | Agent placeholder | workspace.ts agent pane | waiting → "Agent is waiting for input."; keep existing starting/error strings. | — `docs/aoe-status-tracking-plan.md:471` · related: `docs/screens/workspace.md#states`
3. `G` **Flicker-free runtime acceptance still needs evidence rather than a source-only claim.** — **Review evidence:** real agentic-workspace workspace shows green→yellow→dim transitions without flicker; tabs unchanged. — `docs/aoe-status-tracking-plan.md:582` · related: `docs/screens/workspace.md#states`
4. `G` **User visual acceptance is not evidenced by this plan.** — **Stop:** visual stability confirmed by the user. — `docs/aoe-status-tracking-plan.md:587` · related: `docs/CONVENTIONS.md#tooling-and-validation`
5. `G` **OMP and Antigravity detection proof remains outstanding.** — **Review evidence:** close and reopen the workspace; a previously waiting agent shows unknown, never stale waiting and never a false green; an OMP/Antigravity pane yields a pane-derived activity. — `docs/aoe-status-tracking-plan.md:598` · related: `docs/architecture/session-harness.md#readiness-and-identity-correlation`
6. `G` **Modal pause needs reconciliation with periodic runtime observation.** — - polling pauses while a modal owns focus (#hasModal, workspace-controller.ts:405); — `docs/aoe-status-tracking-plan.md:739` · related: `docs/specs/sessions.md#sessions`

### from `docs/footer-search-recovery-handover.md` (2)

1. `G` **Verification must establish the mismatch instead of inferring success.** — 3. Inspect the navigation process's actual error. Fix or revert the specific regression based on evidence. — `docs/footer-search-recovery-handover.md:70`
2. `G` **Historical full-width filter/search composition needs reconciliation with current ordered regions.** — - Layout: full-width filters, Tasks beside Details/native agent, full-width shortcuts or temporary search. — `docs/footer-search-recovery-handover.md:84` · related: `docs/screens/workspace.md#ordered-regions`

### from `docs/opencode-migration.md` (6)

1. `G` **Host-session availability and path migration behavior are unverified external assumptions.** — 2. This OpenCode session's own state is in that database. It will be unavailable in the new session until the database paths have been migrated and verified. — `docs/opencode-migration.md:23`
2. `G` **Historical history-replacement intent is not current authorization.** — 5. The origin remote is already git@github.com:BarrMan/agentic-workspace.git; the fork remote has been removed. The remote's main is intended to be a single fresh commit of the current tree. — `docs/opencode-migration.md:26`
3. `G` **Destination is now the active repository and destructive removal lacks fresh ownership or authorization.** — 8. The throwaway clone at /Users/imribarr/Projects/agentic-workspace has already been removed. The script must use rm -rf to remove the destination if present; the rmdir guard cannot remove the … — `docs/opencode-migration.md:29` · related: `docs/CONVENTIONS.md#general-principles`
4. `G` **Reopen step depends on unresolved migration safety and baseline checks.** — Reopen /Users/imribarr/Projects/agentic-workspace in OpenCode, then run: — `docs/opencode-migration.md:183`
5. `G` **Preserve no-overwrite rollback gate despite script merely skipping conflicted moves.** — If any reverse mv destination already exists, stop rather than overwrite it; resolve the directory conflict manually. The database has already been restored to its pre-migration path values by the … — `docs/opencode-migration.md:260` · related: `docs/CONVENTIONS.md#general-principles`
6. `G` **Restore success cannot be inferred without consistent snapshot and post-restore verification.** — If any reverse mv destination already exists, stop rather than overwrite it; resolve the directory conflict manually. The database has already been restored to its pre-migration path values by the … — `docs/opencode-migration.md:260`

### from `docs/opentui-workspace-implementation-plan.md` (12)

1. `P` **Unapproved compatibility UI is excluded.** — The obsolete workspace presentation has been deleted. It is not an alternate public UI. — `docs/opentui-workspace-implementation-plan.md:80`
2. `P` **Exact slash filter-opening binding is not established.** — - / opens task filters and persists applied values. — `docs/opentui-workspace-implementation-plan.md:160` · related: `docs/screens/workspace.md#focus-and-constrained-terminals`
3. `P` **Exact n binding is candidate evidence.** — - n opens task creation. — `docs/opentui-workspace-implementation-plan.md:161` · related: `docs/screens/tasks.md#states-focus-and-terminal-constraints`
4. `P` **Exact e binding is candidate evidence.** — - e edits selected task title, description, type, and priority. — `docs/opentui-workspace-implementation-plan.md:162` · related: `docs/screens/tasks.md#states-focus-and-terminal-constraints`
5. `P` **Exact Shift+B binding remains candidate evidence.** — - Shift+B routes to in-host board and returns to same selected task. — `docs/opentui-workspace-implementation-plan.md:164` · related: `docs/screens/board.md#states-and-focus`
6. `P` **Exact question-mark opening binding is not established.** — - ? opens shortcut help. — `docs/opentui-workspace-implementation-plan.md:165` · related: `docs/screens/help-dialogs.md#help`
7. `P` **Exact Enter start/open binding remains candidate evidence.** —  — `docs/opentui-workspace-implementation-plan.md:248` · related: `docs/screens/workspace.md#focus-and-constrained-terminals`
8. `P` **Exact S picker binding remains candidate evidence.** —  — `docs/opentui-workspace-implementation-plan.md:250` · related: `docs/screens/sessions-artifacts.md#focus-and-constrained-terminals`
9. `P` **Exact arrow picker navigation is not established in core.** —  — `docs/opentui-workspace-implementation-plan.md:251` · related: `docs/screens/sessions-artifacts.md#focus-and-constrained-terminals`
10. `P` **Exact H handoff binding remains candidate evidence.** —  — `docs/opentui-workspace-implementation-plan.md:252` · related: `docs/screens/sessions-artifacts.md#focus-and-constrained-terminals`
11. `P` **Historical phase review target remains checkpoint evidence work.** — 1. A visible agentic-workspace workspace review target. — `docs/opentui-workspace-implementation-plan.md:321`
12. `G` **Scoped terminal acceptance checkpoint requires evidence before retirement.** — 5. Actual terminal exercise of changed workspace path. — `docs/opentui-workspace-implementation-plan.md:325` · related: `docs/CONVENTIONS.md#testing`

### from `docs/opentui-workspace-session-contract.md` (1)

1. `P` **Exact s binding is not established.** — - s lists the selected task's sessions newest first and marks the active session. — `docs/opentui-workspace-session-contract.md:47` · related: `docs/screens/sessions-artifacts.md#focus-and-constrained-terminals`

### from `docs/opentui-workspace-spec.md` (3)

1. `G` **Core authority is established.** — > **Retained source material pending fold.** SPEC owns canonical behavior and BLUEPRINT owns canonical structure; they supersede conflicting authority claims below. Scoped execution safety gates … — `docs/opentui-workspace-spec.md:17`
2. `P` **Exact Quick preview footer wording is not established.** —  — `docs/opentui-workspace-spec.md:252` · related: `docs/screens/workspace.md#focus-and-constrained-terminals`
3. `G` **Superseded public compatibility paths are removed.** — 10. Blessed workspace presentation code has no public caller. — `docs/opentui-workspace-spec.md:352`

### from `docs/questionnaire-02.md` (4)

1. `G` **Core explicitly leaves filter combinations undecided.** — **Question:** How should multiple filter values combine? — `docs/questionnaire-02.md:148` · related: `docs/specs/filtering-and-search.md#filtering-and-search`
2. `P` **Noninteractive success/failure and no-prompt behavior is unapproved.** — **Recommendation:** Accept complete explicit inputs, otherwise fail with a clear message. Never wait for a prompt, infer destructive consent, or launch an interactive screen. — `docs/questionnaire-02.md:262` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
3. `G` **Noninteractive destructive consent remains explicitly open.** — **Recommendation:** Accept complete explicit inputs, otherwise fail with a clear message. Never wait for a prompt, infer destructive consent, or launch an interactive screen. — `docs/questionnaire-02.md:262` · related: `docs/specs/tasks.md#requirements`
4. `P` **Scale and response-time targets have no answer.** — **Question:** What task/session counts and responsiveness must the product handle acceptably? — `docs/questionnaire-02.md:284` · related: `docs/PRODUCT.md#open-product-decisions`

### from `docs/questionnaire-05.md` (2)

1. `G` **Conditional answer does not establish benefit and questionnaire 6 remains unanswered.** — **Question:** Should MCP remain a supported way for agents to access the workspace? — `docs/questionnaire-05.md:87` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
2. `G` **User requested explanation rather than approving either utility.** — **Question:** Do you want to keep both the printable guides and the optional instruction-file setup? — `docs/questionnaire-05.md:94` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`

### from `docs/recent-app-file-activity.md` (1)

1. `G` **Data ownership and deletion safety require review.** — | Temporary-labelled material | ~/tmp | 6.17 GiB | Directory name alone does not establish disposability. | — `docs/recent-app-file-activity.md:44`

### from `docs/research-requirements-documentation.md` (1)

1. `G` **Local SPEC authority and linked ownership are explicit.** — PRD, SRS, and SPEC are labels, not one universal document taxonomy. ISO/IEC/IEEE 29148 defines requirements-engineering processes and information items; NASA uses names such as Software Requirements … — `docs/research-requirements-documentation.md:22`

### from `docs/research-ui-documentation.md` (2)

1. `G` **Adopted pages cover these concerns but a universal exact template is not mandated.** — - Screen templates should include purpose, ordered regions, states (including empty/loading/error), key/focus map, narrow/short-terminal behavior, and links to governing SPEC/design-system rules. … — `docs/research-ui-documentation.md:42` · related: `docs/screens/README.md#screen-specifications`
2. `P` **Template and global token values remain recommendations with incomplete approved values.** — - Screen templates should include purpose, ordered regions, states (including empty/loading/error), key/focus map, narrow/short-terminal behavior, and links to governing SPEC/design-system rules. … — `docs/research-ui-documentation.md:42` · related: `docs/DESIGN-SYSTEM.md#type-cells-and-spacing`

### from `docs/storage-review-downloads.md` (1)

1. `G` **Personal-data disposition and classification require owner confirmation.** — - **Preserve study, family/legal documents and correspondence.** Suggested label: documents-study or documents-personal-legal after the owner confirms purpose. Extension-based grouping does not … — `docs/storage-review-downloads.md:295`

### from `docs/storage-review-sessions.md` (1)

1. `G` **Maintenance safety budget and authorization must be established, old free-space figures are insufficient.** — SQLite deletion ordinarily leaves reusable free pages without shrinking the file. VACUUM is a separate rebuild and may need free space up to twice the original database size. With the user-supplied … — `docs/storage-review-sessions.md:167`

### from `docs/storage-review-zesty.md` (1)

1. `G` **Reproducibility and offline-use safety gates unresolved.** — 1. **Installed JavaScript dependencies:** dashboard/node_modules and zesty-fed/node_modules are substantial named examples. Across the tree, 16 outermost directories named node_modules account for … — `docs/storage-review-zesty.md:162`

### from `docs/test-suite-runtime-report.md` (2)

1. `P` **Three-minute expectation and exact job timeout in the example are not established durable budgets.** — ## 9. How to run — `docs/test-suite-runtime-report.md:201` · related: `docs/CONVENTIONS.md#testing`
2. `G` **Isolation requirements do not prove the absolute no-stall or no-impact claim under all shared-machine conditions.** — A live agentic-workspace workspace therefore cannot stall a run, or be affected by one. — `docs/test-suite-runtime-report.md:227` · related: `docs/CONVENTIONS.md#testing`

### from `docs/tmux-call-sites.md` (6)

1. `G` **Retain filter-injection and quoting safeguard pending exact expression verification.** — A wrapper that shells out naively, or that re-quotes argv, can corrupt the filter. — `docs/tmux-call-sites.md:143`
2. `G` **Window membership alone needs verification against full owned-resource provenance.** — | 11 | 447 | kill-window -t <workspace> | rebuildTopology | void | guarded by windowInSession | — `docs/tmux-call-sites.md:163` · related: `docs/BLUEPRINT.md#observation-stop-and-deletion`
3. `G` **Preserve window-before-pane focus ordering pending verification.** — | 35 | 832 | select-pane -t <BOARD_PANE> | showBoard | void | must run **after** selectWindow | — `docs/tmux-call-sites.md:187`
4. `G` **Preserve early focus handoff ordering pending current topology verification.** — | 36 | 839-840 | select-pane -t <await liveUiPane(TASKS_PANE)> | showWorkspace | void | 🔴 **claims task-pane focus immediately after select-window, BEFORE revalidating footer/nav/details** | — `docs/tmux-call-sites.md:188`
5. `G` **Search-key delivery failure tolerance requires current interaction policy verification.** — Failure is tolerated (run(), result only logged to /tmp/focus.log). — `docs/tmux-call-sites.md:311`
6. `G` **Preserve awaited live-pane and early-focus ordering pending current handoff verification.** — :839 lazy, breaks the guarantee. showBoard (:828-833) has the same shape at :832. — `docs/tmux-call-sites.md:380`

### from `docs/tmux-layer-spec.md` (9)

1. `P` **Workspace responsibilities and import direction are unapproved and SESSION_ABSENT placement conflicts with section 2.4.** — stay where they are; the layer imports the types, not the reverse. — `docs/tmux-layer-spec.md:100` · related: `docs/BLUEPRINT.md#component-ownership`
2. `G` **Claimed four sites lists three templates and needs count and repeat-run verification.** — dirty workspace and only fail on the second run. — `docs/tmux-layer-spec.md:130`
3. `P` **Bare search-key routing is a proposed exact argv safeguard needing verification.** — ### 2.2 send-keys is bare — DO NOT add Enter or -l — `docs/tmux-layer-spec.md:133` · related: `docs/architecture/session-harness.md#runningexecution`
4. `G` **Stated six-site count conflicts with seven table rows.** — Six sites branch on the result rather than catching. They MUST receive a value: — `docs/tmux-layer-spec.md:195`
5. `P` **Proposed rename argv needs source verification.** — | renameWindow | ["rename-window", "-t", target, name] | :391 Board, :396 Workspace, :435 rebuild | — `docs/tmux-layer-spec.md:327`
6. `G` **capture signature must be limited to current live screen rather than transcript persistence.** —  — `docs/tmux-layer-spec.md:353` · related: `docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport`
7. `P` **Proposed fan-out ownership is unapproved.** — "too many arguments". The fan-out loop stays in the caller (updateWorkspaceState). — `docs/tmux-layer-spec.md:448` · related: `docs/BLUEPRINT.md#component-ownership`
8. `P` **Proposed inventory-shaped format matrix needs source reconciliation.** — | 14 | all 9 display-message formats | table-driven over the exact format strings in §2.5 | — `docs/tmux-layer-spec.md:495`
9. `P` **Proposed library migration deferral does not establish accepted strategy.** — This spec's existence is the reason they can be deferred. — `docs/tmux-layer-spec.md:503` · related: `docs/adr/README.md#active-decisions`

