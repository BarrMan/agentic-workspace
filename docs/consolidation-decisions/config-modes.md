# Configuration and task modes

> **Working sheet — not a contract.** Answers are applied to the owning contracts and to each document's disposition markers.

**What this group is:** How configuration resolves and how task modes are selected, approved and removed.

**Default:** Decide — product-visible behavior.

**94 statements** — 33 P (proposal / unanswered) · 61 G (evidence or safety gate).

**Decision for this group:** `[ ] Discard all` · `[ ] Plan work (→ alignment plan, not a contract)` · `[ ] Amend a contract` · `[ ] Select individually` · `[ ] Narrow: ______`

Answers are per statement only if you choose "Select individually": `d` discard · `w` plan work · `a` amend the contract named · `?` keep open.

---

### from `docs/BACK-728-handoff.md` (1)

1. `G` **Expressed preference and a spike do not establish formal architecture approval.** — working spike. It has **not** been formally approved, and no migration work has started. — `docs/BACK-728-handoff.md:47` · related: `docs/adr/README.md#active-decisions`

### from `docs/IMPACT_LATEST.md` (1)

1. `G` **Live-state migration ownership and approval must remain explicit.** — Shared persisted interface with multiple consumers and an explicitly separate live-state migration. — `docs/IMPACT_LATEST.md:31` · related: `docs/CONVENTIONS.md#changes-and-refactoring`

### from `docs/SPEC-unconfirmed.md` (13)

1. `G` **MCP and setup integration-choice policy remain DEC-5.** — | PRD-004 | Initialization advertises cli, mcp, and none integration choices. | Help: init --help — --integration-mode | Pending | | — `docs/SPEC-unconfirmed.md:44` · related: `docs/SPEC.md#open-product-decisions`
2. `G` **Broad agent-config CLI and its task and preset options remain INV-1.** — | AGT-001 | Scoped agent configuration exposes named-preset selection and editing, including task/card scope. | Help: agent-config --help — set, --task, --preset | Pending | | — `docs/SPEC-unconfirmed.md:78` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
3. `G` **TUI task editing approval does not settle this CLI entry point.** — | CLI-010 | task edit | Edit an existing task. | Help: task edit --help | Pending | | — `docs/SPEC-unconfirmed.md:122` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
4. `G` **TUI configuration approval does not settle this separate CLI convenience.** — | CLI-039 | config | Open interactive configuration when no subcommand is supplied. | Help: config --help | Pending | | — `docs/SPEC-unconfirmed.md:127` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
5. `G` **Broad configuration API remains DEC-5.** — | CLI-040 | config get <key> | Get a configuration value. | Help: config --help | Pending | | — `docs/SPEC-unconfirmed.md:128` · related: `docs/SPEC.md#open-product-decisions`
6. `G` **Broad configuration mutation API remains DEC-5.** — | CLI-041 | config set <key> <value> | Set a configuration value. | Help: config --help | Pending | | — `docs/SPEC-unconfirmed.md:129` · related: `docs/SPEC.md#open-product-decisions`
7. `G` **Broad configuration listing API remains DEC-5.** — | CLI-042 | config list | List configuration values. | Help: config --help | Pending | | — `docs/SPEC-unconfirmed.md:130` · related: `docs/SPEC.md#open-product-decisions`
8. `G` **Retained session history does not approve this additional CLI entry point or mode option.** — | CLI-048 | agent-session list <taskId> [--mode] | List current/prior task sessions with mode selection. | Help: agent-session list --help | Pending | | — `docs/SPEC-unconfirmed.md:136` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
9. `G` **Exact invocation mode and preset overrides and JSON output remain API inventory rather than blanket approval.** — | CLI-049 | agent-session start <taskId> [--mode] [--preset] [--json] | Start a persistent task session with mode/preset selection and JSON output. | Help: agent-session start --help | Pending | | — `docs/SPEC-unconfirmed.md:137` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
10. `G` **Exact handoff CLI entry point and options remain INV-1.** — | CLI-054 | agent-session handoff <taskId> [--mode] | Handoff command exists. Its advertised stop-then-start ordering conflicts with approved SPEC; see conflict note above. | Help: agent-session … — `docs/SPEC-unconfirmed.md:140` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
11. `G` **Broad config query API remains DEC-5.** — | CLI-058 | agent-config show [scope] | Show resolved or exact scoped configuration. | Help: agent-config --help | Pending | | — `docs/SPEC-unconfirmed.md:142` · related: `docs/SPEC.md#open-product-decisions`
12. `G` **Setup command and seeding semantics remain DEC-5.** — | CLI-059 | agent-config init <scope> | Initialize an empty scope or seed missing modes in an existing project scope. | Help: agent-config --help | Pending | | — `docs/SPEC-unconfirmed.md:143` · related: `docs/SPEC.md#open-product-decisions`
13. `G` **Broad config mutation API remains DEC-5 despite approved editable presets.** — | CLI-060 | agent-config set <scope> | Select or selectively update a preset. | Help: agent-config --help | Pending | | — `docs/SPEC-unconfirmed.md:144` · related: `docs/SPEC.md#open-product-decisions`

### from `docs/agent-of-empires-runtime-research.md` (1)

1. `G` **Exact OpenCode runtime adapter selection needs current adoption evidence beyond source.** — - Keep fixed modes, current task → project → user preset resolution, runtime OpenCode adapter selection, and existing harness-independent activity detection. — `docs/agent-of-empires-runtime-research.md:108` · related: `docs/architecture/session-harness.md#harness`

### from `docs/alignment-plan.md` (3)

1. `G` **ACT-6 implementation proof and DEC-5 remaining convenience disposition stay open.** — | ACT-6 · Action | Project-scoped tasks, TUI setup | Inventory: init --help advertises --no-git. Questionnaire 5 §11 establishes TUI setup/settings; questionnaire 6 asks about remaining conveniences. … — `docs/alignment-plan.md:36` · related: `docs/SPEC.md#open-product-decisions`
2. `G` **ACT-16 runtime limit alignment remains open despite the settled policy.** — | ACT-16 · Action | Soft limit | DESIGN's invariants select oldest stored lastUsedAt among not-working sessions; owner requires longest continuous idle time and positive idle evidence. This is a … — `docs/alignment-plan.md:46` · related: `docs/SPEC.md#global-behavioral-invariants`
3. `G` **Exact completion key and retained presentation/settings runtime proof remain inventory work.** — **Evidence:** Questionnaire 4 approves full-folder relocation and its default; no cited audit proves the move implemented. Questionnaire 6 findings report completion c/C and Done Shift+Z from source … — `docs/alignment-plan.md:91` · related: `docs/SPEC.md#global-behavioral-invariants`

### from `docs/aoe-agent-workspace-reference.md` (3)

1. `G` **General rejection of persistent control mode requires local applicability evidence and approval.** — connection is not a safe default, because the most common dev platform breaks it. — `docs/aoe-agent-workspace-reference.md:321` · related: `docs/adr/README.md#active-decisions`
2. `P` **Explicit input targeting is required but adopting this specific list-scroll suppression guard has no approval.** — selection mid-live-send would silently aim the next keystroke at another pane" (input.rs:4486-4490). **[comment]** — `docs/aoe-agent-workspace-reference.md:371` · related: `docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host`
3. `G` **External adjacent-finished navigation body was unread and stale shortcut inference remains unverified.** — likely comes from a configured per-tool hotkey letter navigating *finished* sessions. — `docs/aoe-agent-workspace-reference.md:584`

### from `docs/aoe-lifecycle-implementation-plan.md` (1)

1. `G` **Exact eager-read performance constraint lacks current adoption evidence.** — | S1 config load | one Promise.all read (workspace-controller.ts:808-813) vs profile merge + migrations | L1 (must not split the eager read into more round-trips) | — `docs/aoe-lifecycle-implementation-plan.md:420` · related: `docs/architecture/application-boundaries.md#stores-and-repositories`

### from `docs/aoe-status-tracking-plan.md` (1)

1. `P` **Reserved user rule feature is unapproved and conflicts with the non-goal below.** — 6. configured per-agent rules (none initially; reserved) (AOE 5b). — `docs/aoe-status-tracking-plan.md:354` · related: `docs/architecture/session-harness.md#route-runtime-events-and-observe`

### from `docs/disk-growth-investigation.md` (1)

1. `G` **The reclaim command assumes filename matches are disposable and needs ownership and active-use validation before approval.** —  — `docs/disk-growth-investigation.md:78`

### from `docs/modes-delivery-plan.md` (1)

1. `G` **Historical autonomous phase authorization is not current execution permission.** — asking the user to authorize each checkpoint. Do not mark BACK-23 Done or — `docs/modes-delivery-plan.md:169`

### from `docs/modes-phase1-contract.md` (4)

1. `P` **Exact catalogue schema and key syntax are not approved here.** — PLAN declares optional spec.md (WHAT: requirements, behavior, constraints, acceptance criteria, durable decisions) and plan.md (HOW: approach, affected areas, steps, validation). Creation and session … — `docs/modes-phase1-contract.md:29` · related: `docs/BLUEPRINT.md#application-controller-and-stores`
2. `G` **Dynamic catalogue initialization policy is unspecified.** — PLAN declares optional spec.md (WHAT: requirements, behavior, constraints, acceptance criteria, durable decisions) and plan.md (HOW: approach, affected areas, steps, validation). Creation and session … — `docs/modes-phase1-contract.md:29` · related: `docs/specs/configuration.md#configuration-and-modes`
3. `P` **Exact shared palette tokens are expressly not established by core.** — Profile textColor is optional and uses the shared lowercase ANSI palette in src/agent-workspace/mode-colors.ts. Settings “Default” omits the field; legacy PLAN/BUILD presentation defaults do not … — `docs/modes-phase1-contract.md:31` · related: `docs/DESIGN-SYSTEM.md#status-and-activity`
4. `G` **Default serialization and legacy presentation applicability need disposition.** — Profile textColor is optional and uses the shared lowercase ANSI palette in src/agent-workspace/mode-colors.ts. Settings “Default” omits the field; legacy PLAN/BUILD presentation defaults do not … — `docs/modes-phase1-contract.md:31`

### from `docs/opencode-migration.md` (4)

1. `G` **WAL and busy timeout do not establish writer quiescence or a consistent standalone database clone.** — 1. The database is in WAL mode, and the migration script sets PRAGMA busy_timeout, so the edit is safe to run while OpenCode is running. OpenCode does **not** need to be quit. — `docs/opencode-migration.md:22` · related: `docs/CONVENTIONS.md#changes-and-refactoring`
2. `P` **Preserve exact-target verification gate for any separately authorized external migration.** — 10. The database statements below use SQLite's read/write mode only for the explicit migration. They update only the listed path columns and run in one transaction. Do not change the database path or … — `docs/opencode-migration.md:40` · related: `docs/CONVENTIONS.md#changes-and-refactoring`
3. `G` **One-time external migration applicability and permission must be re-established.** — Save this block as a shell script if desired. Run it once, from any directory, after completing the preconditions. It intentionally stops on errors. The rm -rf guard below removes the destination if … — `docs/opencode-migration.md:44`
4. `G` **Preserve verification-before-relaunch gate despite contradictory running-database precondition.** — Run these checks before relaunching OpenCode. The database queries use SQLite read-only mode. — `docs/opencode-migration.md:147`

### from `docs/opentui-workspace-behavior-matrix.md` (1)

1. `G` **Exact comma opening binding is not specified.** — | Agent settings | , opens fullscreen project-only Settings with a three-row header/footer and adjacent rounded category/content panes. Categories contains Agents; cyan marks pane focus. Fields show … — `docs/opentui-workspace-behavior-matrix.md:45` · related: `docs/screens/settings.md#states-and-focus`

### from `docs/opentui-workspace-implementation-plan.md` (4)

1. `G` **Phase review/approval gates need evidence before retirement and do not authorize renewed execution.** — Every phase has fixed file ownership, independent parallel slices, verification evidence, and an explicit user review gate. No later phase begins before that approval. — `docs/opentui-workspace-implementation-plan.md:82`
2. `G` **Repeated-start semantics require current task/mode operation policy rather than old host reuse.** — - Repeated Enter reuses the task's starting/running host. Switching tasks hides the previous output and restores the selected task's own host without restarting it. — `docs/opentui-workspace-implementation-plan.md:173` · related: `docs/specs/sessions.md#creation-failure-and-recovery`
3. `G` **Separate preview border is historical styling evidence without explicit core approval.** — - The 44% task-list width, 30% details height, Space toggle, Tab input, Ctrl+Q return, and existing filter dialog remain intact. The details and preview now have separate borders. — `docs/opentui-workspace-implementation-plan.md:192` · related: `docs/screens/workspace.md#ordered-regions`
4. `G` **Owner approval before legacy deletion must not be waived without evidence.** — User approves full parity before deletion. — `docs/opentui-workspace-implementation-plan.md:289`

### from `docs/opentui-workspace-session-contract.md` (3)

1. `G` **Exact built-in fallback defaults are not specified.** — - Configuration resolution remains task, project, root, then built-ins. Project settings use the existing configuration service, not a second UI store. User-level settings are not exposed in this … — `docs/opentui-workspace-session-contract.md:55` · related: `docs/specs/configuration.md#configuration-and-modes`
2. `P` **Exact comma opening binding is candidate evidence.** — - , opens fullscreen project-only Settings with adjacent rounded category/content panes and cyan focus. Fields remain read-only until selected and edited with Enter. Right enters fields; Left returns … — `docs/opentui-workspace-session-contract.md:57` · related: `docs/screens/settings.md#states-and-focus`
3. `P` **Exact p override interaction remains candidate evidence.** — - New tasks inherit project settings unless creation selects preset. Explicit selection saves complete task configuration in same atomic creation operation. p selects task preset or clears override … — `docs/opentui-workspace-session-contract.md:58` · related: `docs/screens/tasks.md#states-focus-and-terminal-constraints`

### from `docs/questionnaire-02.md` (19)

1. `P` **Unanswered recommendations are not approval.** — Answer **Yes** to accept a recommendation, or write your preferred behavior. **Unsure** is useful too. Blank answers approve nothing. Each question is self-contained; no other document needs to be … — `docs/questionnaire-02.md:21`
2. `G` **Core does not specify nested-object or list merge semantics.** — **Context:** Root and project settings already merge field by field; collections need a precise rule. — `docs/questionnaire-02.md:33` · related: `docs/specs/configuration.md#configuration-and-modes`
3. `G` **Answer establishes precedence but does not choose deep merge, preset-name merge or list policy.** — **Question:** How should nested settings, named presets, and lists combine? — `docs/questionnaire-02.md:34` · related: `docs/specs/configuration.md#configuration-and-modes`
4. `P` **Nested-object and named-preset merging were not specifically accepted.** — **Recommendation:** Merge objects and presets by name, keeping unspecified inherited fields. Replace lists as a whole rather than combining their items. — `docs/questionnaire-02.md:35` · related: `docs/specs/configuration.md#configuration-and-modes`
5. `P` **Whole-list replacement was not specifically accepted.** — **Recommendation:** Merge objects and presets by name, keeping unspecified inherited fields. Replace lists as a whole rather than combining their items. — `docs/questionnaire-02.md:35` · related: `docs/specs/configuration.md#configuration-and-modes`
6. `P` **User questions nullable fields and no concrete clearable field or clearing policy is approved.** — **Question:** How should a project explicitly remove an inherited optional setting? — `docs/questionnaire-02.md:50` · related: `docs/specs/configuration.md#configuration-and-modes`
7. `G` **Null-clearing and required-field clearing policy have no accepted answer.** — **Recommendation:** Use null to clear it; an omitted field continues to inherit. Reject clearing a setting that is required to run. — `docs/questionnaire-02.md:51` · related: `docs/specs/configuration.md#configuration-and-modes`
8. `G` **Nullable-field applicability is a factual clarification request rather than approval of null clearing.** — Why are you asking this? Is there a field that is nullable in our config? I don't think so. — `docs/questionnaire-02.md:53` · related: `docs/specs/configuration.md#configuration-and-modes`
9. `G` **Tentative field-type question is not an approved exhaustive configuration schema.** — All fields are either booleans or text. no? — `docs/questionnaire-02.md:54` · related: `docs/specs/configuration.md#configuration-and-modes`
10. `P` **User challenges this premise and does not decide private task-mode policy.** — **Question:** May tasks add their own modes, or must all tasks use the project's effective catalogue? — `docs/questionnaire-02.md:65` · related: `docs/specs/configuration.md#configuration-and-modes`
11. `P` **Root catalogue inheritance and the specific private-mode prohibition were not approved by this answer.** — **Recommendation:** Use one project catalogue, which may inherit root definitions. Task overrides may change agent settings, not introduce private modes. — `docs/questionnaire-02.md:66` · related: `docs/specs/configuration.md#configuration-and-modes`
12. `P` **Cross-window view independence is not answered or specified by preference persistence.** — **Recommendation:** Remember the selected task and mode, filters, and collapsed groups per project. Keep open windows independent; saving a preference must not change another window's view. — `docs/questionnaire-02.md:85` · related: `docs/specs/workspace-and-board.md#workspace-and-board`
13. `G` **Cross-task extent remains explicitly open.** — **Question:** Should that deletion apply across every task using the project's mode catalogue? — `docs/questionnaire-02.md:134` · related: `docs/specs/configuration.md#delete-a-mode`
14. `P` **Cross-task deletion recommendation has no answer.** — **Recommendation:** Yes. Before proceeding, require a replacement if it is the default mode; refuse to remove the last mode. Affected views switch to the remaining default. — `docs/questionnaire-02.md:135` · related: `docs/specs/configuration.md#delete-a-mode`
15. `G` **Default-mode replacement requirement remains open.** — **Recommendation:** Yes. Before proceeding, require a replacement if it is the default mode; refuse to remove the last mode. Affected views switch to the remaining default. — `docs/questionnaire-02.md:135` · related: `docs/specs/configuration.md#delete-a-mode`
16. `G` **Last-mode refusal policy remains open.** — **Recommendation:** Yes. Before proceeding, require a replacement if it is the default mode; refuse to remove the last mode. Affected views switch to the remaining default. — `docs/questionnaire-02.md:135` · related: `docs/specs/configuration.md#delete-a-mode`
17. `P` **Remaining-default view switching is unapproved.** — **Recommendation:** Yes. Before proceeding, require a replacement if it is the default mode; refuse to remove the last mode. Affected views switch to the remaining default. — `docs/questionnaire-02.md:135` · related: `docs/specs/configuration.md#delete-a-mode`
18. `G` **Additional exact session command entry points remain inventory rather than blanket approval.** — | agent-session list/start/stop/attach/delete | Manage and attach to task sessions. | | — `docs/questionnaire-02.md:206` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
19. `G` **Approval and implementation verification remain distinct.** — Answers establish desired behavior, not proof that it is implemented. Exact command options and technical details still require agent verification; any remaining product choices will go into a new … — `docs/questionnaire-02.md:300`

### from `docs/questionnaire-03.md` (1)

1. `G` **Source and installed help establish evidence rather than approval.** — These questions come from the corrected implementation audit. **Context** describes what source inspection found, or explicitly identifies a CLI-help claim. It does not mean that behavior is correct. — `docs/questionnaire-03.md:19`

### from `docs/questionnaire-05.md` (1)

1. `G` **Feature approval is distinct from implementation verification.** — Implementation details such as file locks, request ordering, and serialization are not product questions for you. I will place them in the appropriate architecture or conventions documentation, … — `docs/questionnaire-05.md:113`

### from `docs/questionnaire-06.md` (1)

1. `G` **Removing broad config and agent-config families has no approval.** — **Recommendation:** Keep the specific operations, including capturing the calling session's model. Remove the broad configuration command families unless you have a concrete external use for one; all … — `docs/questionnaire-06.md:58` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`

### from `docs/questionnaire-07.md` (2)

1. `P` **Eligibility option was not answered.** — - **B — Stopped or positively idle:** allow a running session known to be idle, but not one working or awaiting permission. — `docs/questionnaire-07.md:25`
2. `G` **No selected eligibility rule was approved.** — Unknown activity is not evidence of idleness. This choice does not authorize interrupting work or bypassing a permission request. You may specify a different rule. — `docs/questionnaire-07.md:28`

### from `docs/questionnaire.md` (1)

1. `P` **Unanswered recommendations do not establish approval.** — - Use **Confirm**, **Change**, or **Reject**, with remarks. For a DEC question, **Confirm** accepts its recommendation. Leave Answer: blank until decided; unanswered items are **not approved**. — `docs/questionnaire.md:26`

### from `docs/refactoring-review.md` (1)

1. `G` **Current approved supported contracts apply across surfaces.** — - Do not treat internal TypeScript exports as public compatibility surface. Preserve documented CLI, MCP, configuration, and instruction contracts. — `docs/refactoring-review.md:76`

### from `docs/research-requirements-documentation.md` (1)

1. `G` **Contract approval and ledger work are distinct.** — Negative requirements are legitimate when they constrain an unsafe or unwanted outcome: e.g. “uncertain liveness evidence does not authorize stopping an agent” or “deleting a running session is … — `docs/research-requirements-documentation.md:37`

### from `docs/shared-agent-runtime-simplification.md` (1)

1. `G` **Structural work cannot settle remaining product policy.** — - Live per-session CLI/session-delete policy is OPEN: currently flagged live sessions refuse even force, while direct live sessions can stop under force. Oracle recommends both entrypoints refuse … — `docs/shared-agent-runtime-simplification.md:59`

### from `docs/shared-agent-server-plan.md` (2)

1. `G` **Parked patches are not approval and their disposition remains parent-owned.** — Do not blanket-revert the private-foundation commit: some code remains reachable. Do not integrate parked private-consumer, startup-witness, v3-history, cutover-descriptor or migration patches merely … — `docs/shared-agent-server-plan.md:129`
2. `P` **Proposed implementation formats are not approved product features.** — Preserve current version-2 nested-mode history unless a concrete necessary change is demonstrated. A planned v3 or private-cutover descriptor is not a product feature. Choose one current … — `docs/shared-agent-server-plan.md:135`

### from `docs/storage-review-docker.md` (1)

1. `G` **Writable-layer value and deletion permission remain unresolved.** — The stopped etcd container alone had a **338 MB writable layer**; the query API had **3.23 MB**. Container reclaimability does not establish that these layers are disposable. No event history was … — `docs/storage-review-docker.md:83`

### from `docs/storage-review-downloads.md` (1)

1. `G` **Credential preservation and publication privacy gate remains unresolved.** — - **Credentials/config: KEEP, private review.** Certificate/key/VPN suffixes suggest sensitive configuration. Do not share this manifest publicly without checking its filenames. — `docs/storage-review-downloads.md:300`

### from `docs/test-suite-improvement-report.md` (1)

1. `G` **Historical state matrix needs current observation-contract reconciliation.** — - Use table cases for the catalog/default mode, custom modes, stale active IDs, stopped/starting/running states, and malformed config. Keep mode-local histories independent. — `docs/test-suite-improvement-report.md:307` · related: `docs/specs/sessions.md#sessions`

### from `docs/test-suite-runtime-report.md` (2)

1. `P` **Approval and continuing applicability of the three-minute target are not established.** — The target is a full run under three minutes; the default configuration now meets it with margin. — `docs/test-suite-runtime-report.md:39` · related: `docs/CONVENTIONS.md#testing`
2. `P` **Approval of three-minute performance target is unresolved.** — under three minutes; local runs rely on the caller to bound a busy or stalled process. — `docs/test-suite-runtime-report.md:216` · related: `docs/CONVENTIONS.md#testing`

### from `docs/tmux-call-sites.md` (2)

1. `G` **Preserve error-channel distinction pending exact extraction approval.** — host-level throw. Any wrapper replacing it must preserve that three-way split. — `docs/tmux-call-sites.md:76` · related: `docs/CONVENTIONS.md#error-handling`
2. `G` **Preserve repeat-safe unset safeguard pending verification.** — | 32 | 714 | set-option -qu -t <session> <key> | unset | void | 🔴 **-qu quiet: without it, unsetting an already-unset option throws** | — `docs/tmux-call-sites.md:184`

### from `docs/tmux-layer-spec.md` (15)

1. `P` **Proposed extraction boundary needs approval.** — (hasSession, newSession, sessions(), panes(), newWindow, split). Those sites stay as they are. — `docs/tmux-layer-spec.md:38` · related: `docs/BLUEPRINT.md#component-ownership`
2. `P` **Proposed naming options and imported-type boundary have no approval.** — already imported by the call sites. — `docs/tmux-layer-spec.md:63` · related: `docs/BLUEPRINT.md#component-ownership`
3. `G` **Factory and shared-module shape needs approval and conflicts with later pane-lookup dependency.** — state, and only types.ts and exec.ts are shared dependencies. — `docs/tmux-layer-spec.md:71` · related: `docs/BLUEPRINT.md#component-ownership`
4. `P` **Proposed exec.ts execution boundary requires approval.** —  — `docs/tmux-layer-spec.md:86` · related: `docs/BLUEPRINT.md#component-ownership`
5. `P` **Proposed server-session.ts module requires approval.** —  — `docs/tmux-layer-spec.md:87` · related: `docs/BLUEPRINT.md#component-ownership`
6. `P` **Proposed window.ts module requires approval.** —  — `docs/tmux-layer-spec.md:88` · related: `docs/BLUEPRINT.md#component-ownership`
7. `P` **Proposed pane.ts module requires approval.** —  — `docs/tmux-layer-spec.md:89` · related: `docs/BLUEPRINT.md#component-ownership`
8. `P` **Proposed options.ts module requires approval.** —  — `docs/tmux-layer-spec.md:90` · related: `docs/BLUEPRINT.md#component-ownership`
9. `P` **Proposed channels.ts module requires approval.** —  — `docs/tmux-layer-spec.md:92` · related: `docs/BLUEPRINT.md#component-ownership`
10. `P` **Proposed client.ts module requires approval.** —  — `docs/tmux-layer-spec.md:93` · related: `docs/BLUEPRINT.md#component-ownership`
11. `P` **Proposed value-versus-throw wrapper split needs approval.** — re-derive them. require() keeps throwing; run() never throws for a non-zero exit. — `docs/tmux-layer-spec.md:212` · related: `docs/CONVENTIONS.md#error-handling`
12. `P` **Proposed two-method abstraction rationale needs approval.** — **two separate methods** — merging them would force a conditional argv shape at every call site. — `docs/tmux-layer-spec.md:371` · related: `docs/BLUEPRINT.md#component-ownership`
13. `G` **killPaneProcessTrees signature requires explicit scope and error-policy approval.** —  — `docs/tmux-layer-spec.md:417` · related: `docs/BLUEPRINT.md#observation-stop-and-deletion`
14. `P` **Proposed separate key methods and rationale need approval.** — unbindKey optional, which is exactly the regression §2.1 forbids. — `docs/tmux-layer-spec.md:430` · related: `docs/BLUEPRINT.md#component-ownership`
15. `G` **Preserve interactive inherited-stdio handover boundary pending approval.** — pipe-captured reads, and must never be routed through exec.run. — `docs/tmux-layer-spec.md:471`

