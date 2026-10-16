# Decision sheet — Session-service redesign and shared runtime

> **Non-authoritative working sheet.** Not a contract. Answers here are applied to the owning contracts and to each document's disposition markers.

Each group below is one document. Decide the group as a whole, select statements individually, or write a narrowing instruction.

- Group box: `[ ] Discard all` · `[ ] Approve all (integrate)` · `[ ] Select individually` · `[ ] Narrow further: ______`
- Per statement (only if selecting individually): `d` discard · `i` integrate · `?` still open.
- Class tag: `P` = proposal / unanswered claim (a policy answer can retire it) · `G` = evidence or safety gate (needs evidence, not a decision).

Family total: **332** statements — 20 P · 312 G.

## G1 · Existing product functionality — owner review inventory

**Document:** `docs/SPEC-unconfirmed.md` · **53 statements** — 6 P · 47 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/specs/supported-integration-operations.md#supported-integration-operations`** — 23 statement(s)

1. `G` **List and view entry points and exact invocation remain INV-1 decisions.** — | PRD-001 | Task creation, listing, and viewing are exposed as ordinary CLI commands without an agent-session argument. | Help: `task --help`, `task create --help` | Pending | | — `docs/SPEC-unconfirmed.md:42`
2. `P` **Setup command and its name path and prefix options are not approved by TUI setup requirements.** — | PRD-003 | Initialization accepts a project name, project-relative record directory, and task prefix. | Help: `init --help` — `[projectName]`, `--agentic-workspace-dir`, `--task-prefix` | Pending | | — `docs/SPEC-unconfirmed.md:43`
3. `P` **Exact initialization command and error instruction are not approved.** — | PRD-007 | Missing project modes produce an error naming `agent-config init project` as the initialization command. | Source: `src/agent-workspace/config.ts` — `requireProjectModeCatalog`; … — `docs/SPEC-unconfirmed.md:47`
4. `G` **Additional list and view CLI entry points remain INV-1.** — | TSK-003 | Tasks can be listed and their details viewed through the CLI. | Help: `task --help` — `list`, `view` | Pending | | — `docs/SPEC-unconfirmed.md:54`
5. `P` **Exact task edit command and options are not approved wholesale.** — | TSK-004 | Task editing accepts replacement title and description values for an existing task ID. | Help: `task edit --help` — `--title`, `--description` | Pending | | — `docs/SPEC-unconfirmed.md:55`
6. `G` **Specific CLI editing guidance remains source evidence and cannot substitute for TUI settings.** — | TSK-007 | Available task statuses are read from the project configuration; the CLI directs users to edit that list in the configuration file. | Source: `src/cli/features/config/values.ts:159–169`; … — `docs/SPEC-unconfirmed.md:56`
7. `P` **Exact CLI worktree option remains unapproved API syntax.** — | WRK-001 | Agent configuration exposes a worktree-per-task setting. | Help: `agent-config --help` — `--worktree-per-task`; Source: `src/core/agentic-workspace.ts` — `ensureTaskWorktreeFor` | Pending … — `docs/SPEC-unconfirmed.md:62`
8. `G` **Broad agent-config CLI and its task and preset options remain INV-1.** — | AGT-001 | Scoped agent configuration exposes named-preset selection and editing, including task/card scope. | Help: `agent-config --help` — `set`, `--task`, `--preset` | Pending | | — `docs/SPEC-unconfirmed.md:78`
9. `G` **Alias retention remains INV-1 rather than approval by advertised presence.** — Every entry below is an installed-help observation, not approval of command behavior or proof that its implementation works. Command names are relative to `agentic-workspace`; options shown are … — `docs/SPEC-unconfirmed.md:112`
10. `G` **Default task command and output options are not an approved API contract.** — | CLI-003 | `task [taskId]` | Task entry point with `--plain` and `--json` options. | Help: `task --help` | Pending | | — `docs/SPEC-unconfirmed.md:118`
11. `G` **Exact command syntax remains INV-1 where not settled by core.** — | CLI-004 | `task create` | Create a task. | Help: `task create --help` | Pending | | — `docs/SPEC-unconfirmed.md:119`
12. `G` **CLI listing and grouping semantics remain INV-1.** — | CLI-009 | `task list` | List tasks grouped by status. | Help: `task --help` | Pending | | — `docs/SPEC-unconfirmed.md:121`
13. `G` **TUI task editing approval does not settle this CLI entry point.** — | CLI-010 | `task edit` | Edit an existing task. | Help: `task edit --help` | Pending | | — `docs/SPEC-unconfirmed.md:122`
14. `G` **Task-detail viewing command remains INV-1.** — | CLI-011 | `task view` | Display task details. | Help: `task --help` | Pending | | — `docs/SPEC-unconfirmed.md:123`
15. `G` **TUI configuration approval does not settle this separate CLI convenience.** — | CLI-039 | `config` | Open interactive configuration when no subcommand is supplied. | Help: `config --help` | Pending | | — `docs/SPEC-unconfirmed.md:127`
16. `G` **Approved explicit completion does not settle age eligibility batch command or summary semantics.** — | CLI-043 | `cleanup` | Select age-eligible terminal-status tasks to move to completed storage and show an interactive summary. | Help: `cleanup --help` | Pending | | — `docs/SPEC-unconfirmed.md:131`
17. `G` **Retained session history does not approve this additional CLI entry point or mode option.** — | CLI-048 | `agent-session list <taskId> [--mode]` | List current/prior task sessions with mode selection. | Help: `agent-session list --help` | Pending | | — `docs/SPEC-unconfirmed.md:136`
18. `G` **Exact invocation mode and preset overrides and JSON output remain API inventory rather than blanket approval.** — | CLI-049 | `agent-session start <taskId> [--mode] [--preset] [--json]` | Start a persistent task session with mode/preset selection and JSON output. | Help: `agent-session start --help` | Pending | | — `docs/SPEC-unconfirmed.md:137`
19. `P` **Additional CLI stop entry point and targeting options remain INV-1.** — | CLI-050 | `agent-session stop <taskId> [--session]` | Stop the active or selected session. | Help: `agent-session stop --help` | Pending | | — `docs/SPEC-unconfirmed.md:138`
20. `G` **Approved live attachment does not automatically approve a standalone CLI attachment command.** — | CLI-051 | `agent-session attach <taskId> [--session]` | Attach this terminal to a session. | Help: `agent-session attach --help` | Pending | | — `docs/SPEC-unconfirmed.md:139`
21. `G` **Exact handoff CLI entry point and options remain INV-1.** — | CLI-054 | `agent-session handoff <taskId> [--mode]` | Handoff command exists. Its advertised stop-then-start ordering conflicts with approved SPEC; see conflict note above. | Help: `agent-session … — `docs/SPEC-unconfirmed.md:140`
22. `G` **Exact CLI syntax and file scope are not settled by the force-ordering contract.** — | CLI-057 | `agent-session delete <taskId> [--session] [--force]` | Delete a session record/files; help advertises stopping a running session first with `--force`. | Help: `agent-session delete … — `docs/SPEC-unconfirmed.md:141`
23. `G` **Exact help command interface remains observed rather than expressly approved.** — | CLI-063 | `help [command]` | Display general or command-specific help. | Help: `--help` | Pending | | — `docs/SPEC-unconfirmed.md:146`

**→ `docs/SPEC.md#open-product-decisions`** — 17 statement(s)

1. `G` **MCP and setup integration-choice policy remain DEC-5.** — | PRD-004 | Initialization advertises `cli`, `mcp`, and `none` integration choices. | Help: `init --help` — `--integration-mode` | Pending | | — `docs/SPEC-unconfirmed.md:44`
2. `G` **Guidance retention and exact content await DEC-5 rather than help-based approval.** — | PRD-005 | Built-in workflow guides cover task creation, execution, finalization, initialization, and workspace use. | Help: `instructions --help` — named guide list | Pending | | — `docs/SPEC-unconfirmed.md:45`
3. `G` **Archive retention scope and rejection policy remain DEC-5.** — | TSK-011 | Task archive rejects terminal-status tasks, moves other task containers to archive storage, and invokes vacated-task reference cleanup. | Source: `src/core/task-lifecycle-service.ts` — … — `docs/SPEC-unconfirmed.md:57`
4. `G` **Archive remains a separate DEC-5 choice.** — | ORG-005 | Interactive task surfaces expose creation, editing, and archival actions. | Source: `src/ui/opentui/workspace-controller.ts` — `#openTaskComposer`, `#handleTaskAction` | Pending | | — `docs/SPEC-unconfirmed.md:68`
5. `G` **Setup and instruction-file conveniences remain DEC-5.** — | CLI-001 | `init [projectName]` | Initialize project storage/configuration with optional instruction setup. | Help: `init --help` | Pending | | — `docs/SPEC-unconfirmed.md:116`
6. `G` **On-demand guidance command remains DEC-5.** — | CLI-002 | `skill` | Print the task-management skill. | Help: `--help` | Pending | | — `docs/SPEC-unconfirmed.md:117`
7. `G` **Archive behavior and command retention await DEC-5.** — | CLI-012 | `task archive` | Archive canceled, duplicate, or invalid work. | Help: `task --help` | Pending | | — `docs/SPEC-unconfirmed.md:124`
8. `G` **Instruction-file editing and exact command retention remain DEC-5.** — | CLI-038 | `agents [--update-instructions]` | Manage the short CLI nudge in agent instruction files; update selected files with `--update-instructions`. | Help: `agents --help` | Pending | | — `docs/SPEC-unconfirmed.md:126`
9. `G` **Broad configuration API remains DEC-5.** — | CLI-040 | `config get <key>` | Get a configuration value. | Help: `config --help` | Pending | | — `docs/SPEC-unconfirmed.md:128`
10. `G` **Broad configuration mutation API remains DEC-5.** — | CLI-041 | `config set <key> <value>` | Set a configuration value. | Help: `config --help` | Pending | | — `docs/SPEC-unconfirmed.md:129`
11. `G` **Broad configuration listing API remains DEC-5.** — | CLI-042 | `config list` | List configuration values. | Help: `config --help` | Pending | | — `docs/SPEC-unconfirmed.md:130`
12. `G` **Shell-helper retention remains DEC-5 even for advertised internal callbacks.** — | CLI-044 | `completion __complete <line> <point>` | Internal shell-completion callback. | Help: `completion --help` | Pending | | — `docs/SPEC-unconfirmed.md:132`
13. `G` **Shell-completion installation remains DEC-5.** — | CLI-045 | `completion install` | Install a shell-completion script. | Help: `completion --help` | Pending | | — `docs/SPEC-unconfirmed.md:133`
14. `G` **Named guidance API remains DEC-5.** — | CLI-046 | `instructions [guide] [--list]` | Print named workflow guides or the guide index. | Help: `instructions --help` | Pending | | — `docs/SPEC-unconfirmed.md:134`
15. `G` **Broad config query API remains DEC-5.** — | CLI-058 | `agent-config show [scope]` | Show resolved or exact scoped configuration. | Help: `agent-config --help` | Pending | | — `docs/SPEC-unconfirmed.md:142`
16. `G` **Setup command and seeding semantics remain DEC-5.** — | CLI-059 | `agent-config init <scope>` | Initialize an empty scope or seed missing modes in an existing project scope. | Help: `agent-config --help` | Pending | | — `docs/SPEC-unconfirmed.md:143`
17. `G` **Broad config mutation API remains DEC-5 despite approved editable presets.** — | CLI-060 | `agent-config set <scope>` | Select or selectively update a preset. | Help: `agent-config --help` | Pending | | — `docs/SPEC-unconfirmed.md:144`

**→ `docs/PRODUCT.md#open-product-decisions`** — 2 statement(s)

1. `G` **Existing MCP implementation is not approval of retention.** — | PRD-006 | MCP is exposed as a separate optional integration alongside the ordinary task CLI. | Help: `init --help`, `task --help`, `mcp --help` | Pending | | — `docs/SPEC-unconfirmed.md:46`
2. `G` **MCP retention remains explicitly undecided.** — | CLI-062 | `mcp start` | Start the MCP server over stdio. | Help: `mcp --help` | Pending | | — `docs/SPEC-unconfirmed.md:145`

**→ `docs/architecture/application-boundaries.md#stores-and-repositories`** — 2 statement(s)

1. `G` **Metadata persistence is approved but exact task.md and frontmatter representation is not fixed by the core contract.** — | TSK-001 | Task records are saved in task containers as `task.md`, using Markdown serialization with frontmatter. | Source: `src/file-system/operations.ts:718–793` — `saveTask`, `serializeTask` call … — `docs/SPEC-unconfirmed.md:52`
2. `G` **View-state locking mechanism is observed evidence not an approved universal synchronization policy.** — | NFR-009 | Session-store and view-state updates reload and mutate state under a file lock before writing. This is evidence of those concurrency mechanisms, not a whole-product no-lost-update … — `docs/SPEC-unconfirmed.md:107`

**→ `docs/BLUEPRINT.md#open-design-decisions`** — 1 statement(s)

1. `G` **Exact collection ID allocation and creation-lock mechanism is not settled by shared-operation coordination.** — | TSK-002 | Task creation allocates an ID under the creation lock and saves the new record. | Source: `src/core/task-creation-workflow.ts` — `TaskCreationService.create` | Pending | | — `docs/SPEC-unconfirmed.md:53`

**→ `docs/specs/sessions.md#stop-and-resume-a-session`** — 1 statement(s)

1. `G` **Exact path-specific error presentation is source evidence rather than settled wording.** — | WRK-004 | Resume preparation rejects a missing recorded working directory with a path-specific error. This is narrower than a guarantee that every failed worktree request blocks every launch. | … — `docs/SPEC-unconfirmed.md:63`

**→ `docs/specs/configuration.md#configuration-and-modes`** — 1 statement(s)

1. `P` **Exact label ordering and default-mode editing semantics are not established by the general dynamic-mode rule.** — | CFG-011 | Mode settings support adding modes, renaming labels, ordering modes, and selecting a default. | Source: `src/ui/opentui/mode-settings-draft.ts` — `addMode`, `renameMode`, `moveMode`, … — `docs/SPEC-unconfirmed.md:73`

**→ `docs/specs/configuration.md#edit-agent-settings`** — 1 statement(s)

1. `G` **Core requires visible discovery failure without model substitution but does not approve these exact adapter fallback semantics.** — | AGT-009 | Settings model discovery throws an unsupported-preset error if no provider adapter is registered; an adapter without model discovery returns an empty list. This does not establish … — `docs/SPEC-unconfirmed.md:79`

**→ `docs/specs/tasks.md#requirements`** — 1 statement(s)

1. `G` **Confirmation wording and consent remain DEC-1 and the observed prompt is not approval.** — | DEL-005 | Interactive task deletion asks for confirmation naming the task ID/title and saying it cannot be undone. The inspected prompt does not mention uncommitted work. | Source: … — `docs/SPEC-unconfirmed.md:95`

**→ `docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host`** — 1 statement(s)

1. `G` **Exact filesystem watcher coverage and refresh scheduling are not fixed by approved UI operations.** — | NFR-008 | Workspace watchers schedule refreshes for task additions/changes/removals, artifact changes, and project configuration changes. | Source: `src/ui/opentui/workspace-controller.ts` — … — `docs/SPEC-unconfirmed.md:106`

**→ `docs/specs/tasks.md#using-task-artifacts`** — 1 statement(s)

1. `G` **A help-only status command has no settled semantics and cannot be assumed to mean approved generic metadata or rejected artifact approval.** — | CLI-005 | `task artifact status` | Artifact status subcommand accepting task ID and path. | Help: `task artifact --help` | Pending | | — `docs/SPEC-unconfirmed.md:120`

**→ `docs/specs/filtering-and-search.md#filtering-and-search`** — 1 statement(s)

1. `G` **Paging count versioning additional filters and unsettled syntax remain INV-1.** — | CLI-015 | `search [query]` | Search tasks/documents/decisions with filters and plain/JSON output. Paging, count, versioned JSON, and additional filter specifics remain unapproved. | Help: `search … — `docs/SPEC-unconfirmed.md:125`

**→ `docs/adr/README.md#active-decisions`** — 1 statement(s)

1. `G` **Exact launcher syntax and OpenTUI technology-selection approval do not follow from the advertised command.** — | CLI-047 | `workspace` | Open the OpenTUI task-centered workspace. | Help: `--help` | Pending | | — `docs/SPEC-unconfirmed.md:135`

## G2 · Temporary documentation and product alignment ledger

**Document:** `docs/alignment-plan.md` · **54 statements** — 1 P · 53 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/SPEC.md#global-behavioral-invariants`** — 21 statement(s)

1. `G` **Completion of every action still requires its finish evidence and annotation closes none.** — Kinds: **Action** = implement/reconcile an approved decision; **Decision** = owner policy still needed; **Inventory** = agent investigation or mapping still needed. All implementation actions below … — `docs/alignment-plan.md:21`
2. `G` **ACT-2 command and lifecycle removal plus observation verification remain open.** — | ACT-2 · Action | [Observed state](specs/sessions.md#requirements) | Inventory: `reconcile` advertised and registered beside output. Retired `DESIGN.md` prescribed explicit reconciliation; its … — `docs/alignment-plan.md:32`
3. `G` **ACT-3 approved removal remains unfinished execution work with retained-view verification outstanding.** — | ACT-3 · Action | [Supported API](specs/supported-integration-operations.md#supported-integration-operations), [board](specs/workspace-and-board.md#workspace-and-board) | Inventory: `agent-session … — `docs/alignment-plan.md:33`
4. `G` **ACT-7 all-operation implementation verification remains open.** — | ACT-7 · Action | [Field precedence](specs/configuration.md#resolve-and-use-task-configuration) | Inventory: `resolveAgentConfiguration` / `projectOrParent` in `src/agent-workspace/config.ts` choose … — `docs/alignment-plan.md:37`
5. `G` **ACT-10 help correction and all-caller behavior proof remain open.** — | ACT-10 · Action | [Handoff](specs/sessions.md#handoff) | Inventory: installed handoff help says stop then start; availability observation CLI-054 does not verify ordering. | Correct help and verify … — `docs/alignment-plan.md:40`
6. `G` **ACT-11 discovery removal and linked-worktree proof remain open.** — | ACT-11 · Action | [Deterministic store](specs/tasks.md#loading-project-tasks) | Inventory: `src/core/task-loader.ts` indexes branch candidates; `src/core/agentic-workspace.ts` scans same-repository … — `docs/alignment-plan.md:41`
7. `G` **ACT-12 timing and failed-allocation behavior still need verification.** — | ACT-12 · Action | [Worktree timing/failure](specs/tasks.md#launching-work-and-completing-a-task) | Inventory: `src/core/task-creation-workflow.ts` creates/reuses worktree during task creation; … — `docs/alignment-plan.md:42`
8. `G` **ACT-13 removal behavior and guide alignment remain unverified.** — | ACT-13 · Action | [Mode approval](specs/configuration.md#select-and-approve-a-task-mode), [artifacts](specs/tasks.md#using-task-artifacts) | Inventory: `task-artifact-repository.ts` hashes/records … — `docs/alignment-plan.md:43`
9. `P` **ACT-14 provider coverage and correct-target capture remain unverified.** — | ACT-14 · Action | [Current-model capture](specs/supported-integration-operations.md#supported-integration-operations) | Inventory: `mode-model.ts:119–168` restricts to OpenCode; command writes … — `docs/alignment-plan.md:44`
10. `G` **ACT-16 runtime limit alignment remains open despite the settled policy.** — | ACT-16 · Action | [Soft limit](specs/sessions.md#enforce-the-running-session-soft-limit) | DESIGN's invariants select oldest stored `lastUsedAt` among not-working sessions; owner requires longest … — `docs/alignment-plan.md:46`
11. `G` **ACT-17 fallback removal and guidance reconciliation remain open.** — | ACT-17 · Action | [Exact resume](specs/sessions.md#stop-and-resume-a-session) | `shared-agent-runtime-handoff.md` says failed saved-ID resume may fall back to a fresh session; current SPEC and … — `docs/alignment-plan.md:47`
12. `G` **ACT-18 full-boundary caller migration and verification remain open.** — | ACT-18 · Action | [Shared application ownership](BLUEPRINT.md#component-ownership), [surface parity](specs/sessions.md#starting-a-session) | IMPLEMENTATION §6 identifies remaining … — `docs/alignment-plan.md:48`
13. `G` **ACT-22 all-caller concurrency and stale-publication proof remain open.** — | ACT-22 · Action | [Authoritative mutation](BLUEPRINT.md#authoritative-mutation-and-publication) | IMPLEMENTATION §6 notes Core-supplied Task/config snapshots may outlive asynchronous waits; fresh … — `docs/alignment-plan.md:52`
14. `G` **SAFE-1 named simplification capture parity and live acceptance checkpoints remain open and require current proof.** — | SAFE-1 · Inventory / runtime execution | [Handoff start procedure](shared-agent-runtime-handoff.md#start-procedure), [remaining proof](shared-agent-runtime-handoff.md#immediate-remaining-proof), … — `docs/alignment-plan.md:61`
15. `G` **SAFE-3 full finding accounting is still an open finish gate.** — | SAFE-3 · Inventory / test remediation | [Mandatory procedure](test-suite-remediation-plan.md#mandatory-procedure), [finding/proof ledger](test-suite-remediation-plan.md#finding-and-proof-ledger), … — `docs/alignment-plan.md:63`
16. `G` **Relocation implementation coverage remains unverified.** — **Evidence:** Questionnaire 4 approves full-folder relocation and its default; no cited audit proves the move implemented. Questionnaire 6 findings report completion `c`/`C` and Done `Shift+Z` from … — `docs/alignment-plan.md:91`
17. `G` **Exact completion key and retained presentation/settings runtime proof remain inventory work.** — **Evidence:** Questionnaire 4 approves full-folder relocation and its default; no cited audit proves the move implemented. Questionnaire 6 findings report completion `c`/`C` and Done `Shift+Z` from … — `docs/alignment-plan.md:91`
18. `G` **INV-2 retained-feature coverage investigation remains open and does not reopen approved behavior.** — **Required work:** Establish existing coverage for storage choices/full-folder move, TUI settings, staged Save/cancel, unavailable-model feedback, instruction-only permission labeling, … — `docs/alignment-plan.md:93`
19. `G` **INV-2 evidence collection and gap classification are unfinished.** — **Finish:** Each tested contract has appropriately scoped evidence; actual conflicts become bounded action items. Relocation failure/concurrency acceptance awaits DEC-2. — `docs/alignment-plan.md:95`
20. `G` **Any newly approved removals still require bounded implementation finish criteria.** — **Finish:** Each answer has an explicit contract/action destination. No unapproved recommendation silently becomes policy; newly approved removals gain executable finish conditions here. — `docs/alignment-plan.md:147`
21. `G` **These named actions retain open implementation and verification work after source retirement.** — **Retired sources:** `DESIGN.md` is folded into the owning product/structural contracts. Its exact reserved-directory reference restriction is in [launch inputs](specs/sessions.md#requirements); … — `docs/alignment-plan.md:167`

**→ `docs/specs/tasks.md#changing-the-storage-location`** — 6 statement(s)

1. `G` **Collision recovery and concurrent relocation policy remains explicitly unresolved.** — **Finish:** Each tested contract has appropriately scoped evidence; actual conflicts become bounded action items. Relocation failure/concurrency acceptance awaits DEC-2. — `docs/alignment-plan.md:95`
2. `G` **DEC-2 destination collision policy remains open.** — **Decide:** Destination collision handling, partial-copy/move failure, interruption/recovery, when configured authority changes, and concurrent readers/writers or sessions during relocation. No … — `docs/alignment-plan.md:115`
3. `G` **DEC-2 partial failure and interruption recovery remain open.** — **Decide:** Destination collision handling, partial-copy/move failure, interruption/recovery, when configured authority changes, and concurrent readers/writers or sessions during relocation. No … — `docs/alignment-plan.md:115`
4. `G` **DEC-2 authority-switch timing remains open.** — **Decide:** Destination collision handling, partial-copy/move failure, interruption/recovery, when configured authority changes, and concurrent readers/writers or sessions during relocation. No … — `docs/alignment-plan.md:115`
5. `G` **DEC-2 concurrent access policy remains open.** — **Decide:** Destination collision handling, partial-copy/move failure, interruption/recovery, when configured authority changes, and concurrent readers/writers or sessions during relocation. No … — `docs/alignment-plan.md:115`
6. `G` **DEC-2 finish requires owner-approved failure and concurrency outcomes without reopening full-folder scope.** — **Finish:** Explicit outcomes and acceptance scenarios cover those conditions, while retaining the full-folder move requirement. — `docs/alignment-plan.md:117`

**→ `docs/specs/tasks.md#task-deletion`** — 5 statement(s)

1. `G` **Destructive task-deletion scope and uncommitted-work disposal remain unresolved.** — **Known:** Forget-only deletion does not signal an agent and remains distinct from stopping or purging and from separately approved completion cleanup. Destructive task-deletion scope, including … — `docs/alignment-plan.md:103`
2. `G` **DEC-1 multiple-session and provider-owned file extent is unresolved.** — **Decide:** Exact multi-session and provider-owned data scope; whether to continue additional independent steps after a failure within the approved cleanup ordering; crash/interruption recovery … — `docs/alignment-plan.md:105`
3. `G` **DEC-1 continuation after partial failure is unresolved.** — **Decide:** Exact multi-session and provider-owned data scope; whether to continue additional independent steps after a failure within the approved cleanup ordering; crash/interruption recovery … — `docs/alignment-plan.md:105`
4. `G` **DEC-1 consent and confirmation wording remain open.** — **Decide:** Exact multi-session and provider-owned data scope; whether to continue additional independent steps after a failure within the approved cleanup ordering; crash/interruption recovery … — `docs/alignment-plan.md:105`
5. `G` **DEC-1 acceptance completion still depends on owner decisions.** — **Finish:** Owner-approved outcomes for the remaining continuation/recovery/scope/race choices are folded into the task contract and acceptance cases. Existing cleanup-before-removal ordering for … — `docs/alignment-plan.md:107`

**→ `docs/SPEC.md#open-product-decisions`** — 4 statement(s)

1. `G` **ACT-6 implementation proof and DEC-5 remaining convenience disposition stay open.** — | ACT-6 · Action | [Project-scoped tasks](specs/tasks.md#requirements), [TUI setup](specs/supported-integration-operations.md#supported-integration-operations) | Inventory: `init --help` advertises … — `docs/alignment-plan.md:36`
2. `G` **DEC-3 completion awaits explicit scope and recovery decisions with safeguards retained.** — **Finish:** Approved scope and degraded-operation outcomes replace the open boundaries without weakening confirmed constraints. — `docs/alignment-plan.md:127`
3. `G` **DEC-4 interruption retry and repeated or concurrent user-visible outcomes remain unresolved.** — **Required work:** Keep already approved technical coordination and durability guarantees distinct from unapproved user-visible policy. Identify only remaining automatic interruption recovery, retry … — `docs/alignment-plan.md:135`
4. `G` **DEC-4 provenance and owner decisions remain open finish work.** — **Finish:** Every claimed recovery behavior has approved provenance, and remaining choices have concrete owner-approved outcomes. No general rollback/resume promise is inferred from one failure case. — `docs/alignment-plan.md:137`

**→ `docs/CONVENTIONS.md#documentation-maintenance`** — 3 statement(s)

1. `G` **Uninspected transitive safeguards still require accounting before retirement.** — **Retirement gate:** A linked legacy plan may be retired only after its unique safeguards, known conflicts, pending evidence, and referenced unresolved choices have explicit destinations. Update … — `docs/alignment-plan.md:73`
2. `G` **DOC-1 transitive safety-content accounting and checkpoint proof remain unfinished.** — **Remaining fold:** The legacy screen/runtime/redesign documents remain source material, with authority banners directing readers to canonical contracts. SAFE-1–3 retain scoped execution gates and … — `docs/alignment-plan.md:169`
3. `G` **SAFE-1 through SAFE-3 unique and transitive safety accounting remains an open retirement gate.** — | [Shared-runtime handoff](shared-agent-runtime-handoff.md), [session correction](session-service-redesign-correction-plan.md), [test remediation](test-suite-remediation-plan.md) | Required scoped … — `docs/alignment-plan.md:245`

**→ `docs/CONVENTIONS.md#testing`** — 2 statement(s)

1. `G` **ACT-21 adapter and separately authorized live acceptance remain outstanding and doubles do not certify them.** — | ACT-21 · Action | [Harness evidence](BLUEPRINT.md#harness-and-provider-adapters) | IMPLEMENTATION §6 and correction C4 identify provider readiness correlation, supported-event semantics, and … — `docs/alignment-plan.md:51`
2. `G` **F3 and F4 proof and F7 precise evidence boundary require retained scoped verification rather than assumed completion.** — | SAFE-3 · Inventory / test remediation | [Mandatory procedure](test-suite-remediation-plan.md#mandatory-procedure), [finding/proof ledger](test-suite-remediation-plan.md#finding-and-proof-ledger), … — `docs/alignment-plan.md:63`

**→ `docs/specs/supported-integration-operations.md#supported-integration-operations`** — 2 statement(s)

1. `G` **INV-1 exact API syntax caller mapping and convenience retention remain open.** — **Required work:** Preserve unresolved inventory IDs and evidence until folded into a decision or verified reference. Map the approved API operations to precise supported syntax/options and their … — `docs/alignment-plan.md:83`
2. `G` **INV-1 exhaustive disposition and syntax verification are open finish conditions.** — **Finish:** Every retained inventory row is mapped to an approved contract, explicit owner decision, or evidence/reference destination; the public API has exact documented supported operations and … — `docs/alignment-plan.md:85`

**→ `docs/specs/tasks.md#edge-cases-and-failures`** — 2 statement(s)

1. `G` **DEC-1 crash recovery policy is unresolved.** — **Decide:** Exact multi-session and provider-owned data scope; whether to continue additional independent steps after a failure within the approved cleanup ordering; crash/interruption recovery … — `docs/alignment-plan.md:105`
2. `G` **DEC-1 repeated and racing deletion outcomes are unresolved.** — **Decide:** Exact multi-session and provider-owned data scope; whether to continue additional independent steps after a failure within the approved cleanup ordering; crash/interruption recovery … — `docs/alignment-plan.md:105`

**→ `docs/specs/sessions.md#deleting-a-session`** — 2 statement(s)

1. `G` **DEC-3 provider-owned file extent remains open.** — **Decide:** Provider-owned conversation data scope; failure/interruption/retry behavior; mode deletion cross-task extent and default/last-mode handling. Questionnaire 2 §§16–17 recommendations were … — `docs/alignment-plan.md:125`
2. `G` **DEC-3 deletion recovery remains open.** — **Decide:** Provider-owned conversation data scope; failure/interruption/retry behavior; mode deletion cross-task extent and default/last-mode handling. Questionnaire 2 §§16–17 recommendations were … — `docs/alignment-plan.md:125`

**→ `docs/SPEC.md#overview`** — 2 statement(s)

1. `G` **DEC-5 answer destinations remain unfinished accounting.** — **Finish:** Each answer has an explicit contract/action destination. No unapproved recommendation silently becomes policy; newly approved removals gain executable finish conditions here. — `docs/alignment-plan.md:147`
2. `G` **Latest-answer reconciliation and source-only acceptance verification remain parent-owned pending work.** — | [Questionnaire 6](questionnaire-06.md) | Preserved in place, no newly entered answers promoted here. Parent owns latest-answer reconciliation (DEC-5). Known completion/guidance findings cited with … — `docs/alignment-plan.md:242`

**→ `docs/CONVENTIONS.md#changes-and-refactoring`** — 1 statement(s)

1. `G` **ACT-4 removal remains open and draft-data treatment requires DEC-6.** — | ACT-4 · Action | [Task model](specs/tasks.md#requirements) | Inventory: draft commands advertised; promotion/demotion implemented in `src/file-system/operations.ts:1007–1141`. | Remove draft … — `docs/alignment-plan.md:34`

**→ `docs/specs/filtering-and-search.md#filtering-and-search`** — 1 statement(s)

1. `G` **ACT-5 field and filter removal verification remains open with persisted-field disposition under DEC-6.** — | ACT-5 · Action | [Task model](specs/tasks.md#requirements), [filters/search](specs/filtering-and-search.md#filtering-and-search) | Inventory: former TSK-005/006/FND-004 cite project field in … — `docs/alignment-plan.md:35`

**→ `docs/specs/sessions.md#creation-failure-and-recovery`** — 1 statement(s)

1. `G` **ACT-20 settlement proof and DEC-4 automatic recovery choices remain open without reopening synchronous safeguards.** — | ACT-20 · Action | [Durable operation evidence](BLUEPRINT.md#durable-conversation-and-operation-records), [creation failure](specs/sessions.md#creation-failure-and-recovery) | IMPLEMENTATION §6 … — `docs/alignment-plan.md:50`

**→ `docs/BLUEPRINT.md#harness-and-provider-adapters`** — 1 statement(s)

1. `G` **SAFE-2 full-boundary review and actual adapter-correlated proof remain outstanding execution gates.** — | SAFE-2 · Action / session redesign | [Correction execution order](session-service-redesign-correction-plan.md#execution-order-and-file-ownership), [C0 binding … — `docs/alignment-plan.md:62`

**→ `docs/specs/configuration.md#delete-a-mode`** — 1 statement(s)

1. `G` **DEC-3 affected tasks and default or last-mode behavior remain open.** — **Decide:** Provider-owned conversation data scope; failure/interruption/retry behavior; mode deletion cross-task extent and default/last-mode handling. Questionnaire 2 §§16–17 recommendations were … — `docs/alignment-plan.md:125`

## G3 · BACK-23 delivery plan — small implementation/validation pairs

**Document:** `docs/modes-delivery-plan.md` · **26 statements** — 1 P · 25 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ _no owning contract — retire, or escalate as a new decision_** — 10 statement(s)

1. `G` **Preserve task-specific completion authorization gate pending parent disposition.** — Status remains In Progress until the user marks the task Done. — `docs/modes-delivery-plan.md:88`
2. `G` **Retain scoped task completion gate without approving every old acceptance scenario.** — confirmed current defect. Only the user can accept completion and mark Done. — `docs/modes-delivery-plan.md:130`
3. `G` **Historical exact mission count and named validator assignment need parent disposition.** — a **separate Luna validator**. The validator starts from the approved behavior — `docs/modes-delivery-plan.md:135`
4. `G` **Historical autonomous phase authorization is not current execution permission.** — asking the user to authorize each checkpoint. Do not mark BACK-23 Done or — `docs/modes-delivery-plan.md:169`
5. `G` **Retain explicit completion and commit prohibition until parent disposition.** — commit unless explicitly requested. — `docs/modes-delivery-plan.md:170`
6. `G` **Preserve historical B2 ownership handoff pending reconciliation.** — | P2-07 | Background host/session UUID identity and delayed activation cannot select wrong task/mode | `src/agent-workspace/session-process.ts`, `src/agent-workspace/tmux-pane-lookup.ts` | … — `docs/modes-delivery-plan.md:186`
7. `G` **Exact caching and historical C2 path release require disposition.** — | P2-08 | Profile model discovery/cache/default/manual model and provider-specific override contract | `src/agent-workspace/agents/profile.ts`, `src/agent-workspace/agents/agent.ts` | … — `docs/modes-delivery-plan.md:187`
8. `G` **Historical checkpoints do not authorize redispatch or prove current acceptance.** — solely because its original mission appears here. Preserve exclusive ownership — `docs/modes-delivery-plan.md:258`
9. `G` **Old autonomous phase sequencing cannot grant current execution authority.** — unavailable required harness blocks progress. Preserve BACK-23 as In Progress — `docs/modes-delivery-plan.md:268`
10. `G` **Retain task-specific user completion gate pending parent disposition.** — until the user decides otherwise. — `docs/modes-delivery-plan.md:269`

**→ `docs/CONVENTIONS.md#general-principles`** — 6 statement(s)

1. `G` **Preserve A2 ownership exclusion until writer reconciliation rather than redispatch old phases.** — unreconciled storage changes. — `docs/modes-delivery-plan.md:176`
2. `G` **Historical mission retains a specific writer-handoff safety gate needing disposition.** — | P2-01 | Reconcile the narrow task-container repository/path contract: canonical main-worktree root, task identity, reserved paths and containment | `src/utils/task-path.ts`, … — `docs/modes-delivery-plan.md:180`
3. `G` **Retain B2 ownership-transfer gate without approving old service contract.** — | P2-04 | Reconcile mode-keyed session-store read/write API and legacy-state diagnostics; keep this to the store contract, not service behavior | `src/agent-workspace/session-store.ts` | … — `docs/modes-delivery-plan.md:183`
4. `G` **Retain A2 path-release and limited integration gate pending parent reconciliation.** — integration. — `docs/modes-delivery-plan.md:248`
5. `G` **Retain B2 store path-release gate without reviving old lane.** — the store API. Keep it separate from `sessions.ts` service work. — `docs/modes-delivery-plan.md:251`
6. `G` **Retain B2 process path-release gate pending reconciliation.** — B2 releases those paths. — `docs/modes-delivery-plan.md:254`

**→ `docs/CONVENTIONS.md#testing`** — 2 statement(s)

1. `G` **Interactive settings and supported-provider manual acceptance remain unverified.** — contracts. The earlier live artifact acceptance observed stale in-process — `docs/modes-delivery-plan.md:126`
2. `G` **Scoped validator-first test sequence needs current assignment disposition.** — tests first. After each test/code edit, run `bun run build` immediately per — `docs/modes-delivery-plan.md:150`

**→ `docs/specs/supported-integration-operations.md#supported-integration-operations`** — 2 statement(s)

1. `G` **MCP retention and exact API scope remain open.** — | P3-03 | Generic artifact CLI and MCP list/read/write, canonical paths and read-only approval status | CLI artifact leaves then MCP handlers/schema; registration edits serialized within mission | … — `docs/modes-delivery-plan.md:199`
2. `P` **Exact output and context options are not approved wholesale.** — | P3-04 | Task JSON/plain/context artifact paths and mode/session targeting options | CLI output/context/session-option leaf files | dedicated CLI output/session-option tests | P2-05–06, P3-03 | — `docs/modes-delivery-plan.md:200`

**→ `docs/specs/tasks.md#using-task-artifacts`** — 1 statement(s)

1. `G` **Searchable text projection and watcher guarantees need scope disposition beyond generic file tools.** — | P2-03 | Artifact watcher/cache invalidation and searchable text projection, excluding binary/internal sidecar | `src/utils/task-watcher.ts`, `src/utils/task-search.ts` | … — `docs/modes-delivery-plan.md:182`

**→ `docs/BLUEPRINT.md#models-and-relationships`** — 1 statement(s)

1. `G` **Task now owns relationships while historical B2 handoff gate still needs disposition.** — | P2-05 | Complete mode-scoped reserve/activate/selected history and pending adoption; exact active-pointer semantics | `src/agent-workspace/sessions.ts` | `src/test/agent-sessions.test.ts` … — `docs/modes-delivery-plan.md:184`

**→ `docs/architecture/session-harness.md#readiness-and-identity-correlation`** — 1 statement(s)

1. `G` **Pi-specific policy and default behavior require adapter evidence.** — | P2-09 | Permission instructions, native policy preparation, cleanup on failure, no broad bypass flags and Pi native/default behavior | `src/agent-workspace/agents/claude.ts`, … — `docs/modes-delivery-plan.md:188`

**→ `docs/specs/tasks.md#edge-cases-and-failures`** — 1 statement(s)

1. `G` **Corrupt-state recovery and multi-session deletion policy remain unresolved.** — | P3-06 | All-mode completion/delete/reset/worktree cleanup, moved running hosts and corrupt-state recovery | task lifecycle/session coordinator files assigned by integrator; one owner | … — `docs/modes-delivery-plan.md:202`

**→ `docs/screens/workspace.md#focus-and-constrained-terminals`** — 1 statement(s)

1. `G` **Exact row clipping remains unresolved and artifact-derived approval is superseded.** — | P4-02 | Row mode/approval label terminal-width clipping, selected styling, Unicode and narrow terminals | board row-rendering leaf files, excluding controller | dedicated board/layout rendering … — `docs/modes-delivery-plan.md:215`

**→ `docs/CONVENTIONS.md#changes-and-refactoring`** — 1 statement(s)

1. `G` **Exact conversion requires explicit stored-data policy and verified recipe.** — mode deletion merge, manual record conversion, — `docs/modes-delivery-plan.md:234`

## G4 · BACK-23 Phase 1 contract and ownership

**Document:** `docs/modes-phase1-contract.md` · **12 statements** — 3 P · 9 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/CONVENTIONS.md#changes-and-refactoring`** — 2 statement(s)

1. `G` **Exact version and conversion recipe need current-schema and data-policy verification.** — Phase 1 defined the data contracts below. Canonical task containers are the only readable task layout; legacy flat task records are not read. Manually move each `<name>.md` to … — `docs/modes-phase1-contract.md:20`
2. `G` **Draft disposition and exact manual conversion require current data-policy verification.** — For a legacy project, manually convert flat task and draft records by moving `<name>.md` to `<lowercase-id>/task.md` under the same root, setting frontmatter `id` to match the directory name, and … — `docs/modes-phase1-contract.md:37`

**→ `docs/BLUEPRINT.md#durable-conversation-and-operation-records`** — 2 statement(s)

1. `G` **Fixed build-mode conversion and version-2 shape are not current approved storage requirements.** — Phase 1 defined the data contracts below. Canonical task containers are the only readable task layout; legacy flat task records are not read. Manually move each `<name>.md` to … — `docs/modes-phase1-contract.md:20`
2. `G` **Preserve backup safeguard pending verification of obsolete conversion recipe.** — For a legacy project, manually convert flat task and draft records by moving `<name>.md` to `<lowercase-id>/task.md` under the same root, setting frontmatter `id` to match the directory name, and … — `docs/modes-phase1-contract.md:37`

**→ `docs/BLUEPRINT.md#application-controller-and-stores`** — 1 statement(s)

1. `P` **Exact catalogue schema and key syntax are not approved here.** — PLAN declares optional `spec.md` (WHAT: requirements, behavior, constraints, acceptance criteria, durable decisions) and `plan.md` (HOW: approach, affected areas, steps, validation). Creation and … — `docs/modes-phase1-contract.md:29`

**→ `docs/specs/configuration.md#configuration-and-modes`** — 1 statement(s)

1. `G` **Dynamic catalogue initialization policy is unspecified.** — PLAN declares optional `spec.md` (WHAT: requirements, behavior, constraints, acceptance criteria, durable decisions) and `plan.md` (HOW: approach, affected areas, steps, validation). Creation and … — `docs/modes-phase1-contract.md:29`

**→ `docs/DESIGN-SYSTEM.md#status-and-activity`** — 1 statement(s)

1. `P` **Exact shared palette tokens are expressly not established by core.** — Profile `textColor` is optional and uses the shared lowercase ANSI palette in `src/agent-workspace/mode-colors.ts`. Settings “Default” omits the field; legacy PLAN/BUILD presentation defaults do not … — `docs/modes-phase1-contract.md:31`

**→ _no owning contract — retire, or escalate as a new decision_** — 1 statement(s)

1. `G` **Default serialization and legacy presentation applicability need disposition.** — Profile `textColor` is optional and uses the shared lowercase ANSI palette in `src/agent-workspace/mode-colors.ts`. Settings “Default” omits the field; legacy PLAN/BUILD presentation defaults do not … — `docs/modes-phase1-contract.md:31`

**→ `docs/specs/configuration.md#delete-a-mode`** — 1 statement(s)

1. `G` **Default and deleted-mode selection recovery is unresolved.** — `agentic-workspace workspace` and interactive board entry require a valid catalog in the exact project configuration. Missing project configuration or missing `modes` fails before terminal … — `docs/modes-phase1-contract.md:35`

**→ `docs/specs/supported-integration-operations.md#supported-integration-operations`** — 1 statement(s)

1. `P` **Broad setup CLI syntax is not approved.** — For a legacy project, manually convert flat task and draft records by moving `<name>.md` to `<lowercase-id>/task.md` under the same root, setting frontmatter `id` to match the directory name, and … — `docs/modes-phase1-contract.md:37`

**→ `docs/specs/tasks.md#using-task-artifacts`** — 1 statement(s)

1. `G` **Preserve path rejection safeguard while reserved-name applicability changes with artifacts directory.** — Canonical task container: `tasks/<lowercase-task-id>/task.md`; artifacts are sibling relative paths. `.artifacts.json` is a lazy, version-1 sidecar containing `approvals[path] = { sha256, approvedAt … — `docs/modes-phase1-contract.md:41`

**→ `docs/screens/settings.md#contents-and-order`** — 1 statement(s)

1. `G` **Current settings shell specifies categories and content rather than this mode-specific two-pane layout.** — Task rows show a right-aligned selected mode label and an independent approval checkmark for its configured indicator artifact. Tab cycles modes without launching/resuming; Enter creates/resumes only … — `docs/modes-phase1-contract.md:45`

## G5 · OpenCode project migration runbook

**Document:** `docs/opencode-migration.md` · **41 statements** — 3 P · 38 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ _no owning contract — retire, or escalate as a new decision_** — 30 statement(s)

1. `G` **Host-session availability and path migration behavior are unverified external assumptions.** — 2. This OpenCode session's own state is in that database. It will be unavailable in the new session until the database paths have been migrated and verified. — `docs/opencode-migration.md:23`
2. `G` **External schema identity assumptions need version-specific verification.** — 4. The project moves from `/Users/imribarr/Projects/Backlog.md` to `/Users/imribarr/Projects/agentic-workspace`. OpenCode identifies it by absolute path in `project.worktree`, … — `docs/opencode-migration.md:25`
3. `G` **Historical history-replacement intent is not current authorization.** — 5. The `origin` remote is already `git@github.com:BarrMan/agentic-workspace.git`; the fork remote has been removed. The remote's `main` is intended to be a single fresh commit of the current tree. — `docs/opencode-migration.md:26`
4. `G` **Read-only baseline SQL assumes external schema and project ID that need verification.** — ``` — `docs/opencode-migration.md:38`
5. `G` **Script also changes worktree project_id and filesystem moves are outside the database transaction.** — 10. The database statements below use SQLite's read/write mode only for the explicit migration. They update only the listed path columns and run in one transaction. Do not change the database path or … — `docs/opencode-migration.md:40`
6. `G` **One-time external migration applicability and permission must be re-established.** — Save this block as a shell script if desired. Run it once, from any directory, after completing the preconditions. It intentionally stops on errors. The `rm -rf` guard below removes the destination … — `docs/opencode-migration.md:44`
7. `G` **Preserve verification-before-relaunch gate despite contradictory running-database precondition.** — Run these checks before relaunching OpenCode. The database queries use SQLite read-only mode. — `docs/opencode-migration.md:147`
8. `G` **Preserve post-move path-verification gate pending external schema verification.** — 1. Confirm the project and all recorded paths now point to the new locations, with no remaining old-root paths: — `docs/opencode-migration.md:149`
9. `G` **Path-check SQL uses a new linked-worktree prefix different from the script's .backlog destination.** — ``` — `docs/opencode-migration.md:165`
10. `G` **Exact row-count and path expectations require a fresh baseline and consistent prefixes.** — Expected: the project row shows `/Users/imribarr/Projects/agentic-workspace`; all five `old_*` counts are `0`; `new_project_paths` is `2`; `new_linked_worktrees` matches the number of task worktrees … — `docs/opencode-migration.md:167`
11. `G` **Duplicate-project retention and later deletion lack current schema and rollback proof.** — Expected: the project row shows `/Users/imribarr/Projects/agentic-workspace`; all five `old_*` counts are `0`; `new_project_paths` is `2`; `new_linked_worktrees` matches the number of task worktrees … — `docs/opencode-migration.md:167`
12. `G` **Preserve count-conservation gate pending consistent backup and baseline verification.** — 2. Confirm session row counts did not change from the pre-migration baseline: — `docs/opencode-migration.md:169`
13. `G` **Count-check SQL assumes historical project identity and external schema.** — ``` — `docs/opencode-migration.md:177`
14. `G` **Preserve mismatch stop gate without certifying the unsafe rollback recipe.** — Expected: both counts must equal the baseline you recorded in precondition 9. If either differs, do not relaunch OpenCode; investigate or roll back. — `docs/opencode-migration.md:179`
15. `G` **Reopen step depends on unresolved migration safety and baseline checks.** — Reopen `/Users/imribarr/Projects/agentic-workspace` in OpenCode, then run: — `docs/opencode-migration.md:183`
16. `G` **External project-ID inspection commands need current schema verification.** — ``` — `docs/opencode-migration.md:189`
17. `G` **Session and permission reassignment needs verified identity ownership and quiescent writers.** — If a newly-created id holds 0 sessions while `daf950e6…` holds ~1,669, re-point `session`, `session_v2`, and `permission` from `daf950e6…` to the new id in one transaction using the same `BEGIN … — `docs/opencode-migration.md:191`
18. `G` **Placeholder project-ID rewrite is an unverified external mutation recipe.** — ``` — `docs/opencode-migration.md:200`
19. `G` **Identity reuse alone has not been shown to establish complete migration.** — If OpenCode reused `daf950e61fbe12fb12e15d6f716c25dba9b42c4d`, nothing needs to be done. — `docs/opencode-migration.md:202`
20. `G` **Preserve user-visible session recovery verification pending safe migration applicability.** — 5. Start a **new** OpenCode session from `/Users/imribarr/Projects/agentic-workspace`. Confirm this project opens under the new absolute path and its existing sessions are listed. Do not delete the … — `docs/opencode-migration.md:223`
21. `G` **Preserve writer-quiescence and failure stop gates while rollback validity remains unverified.** — If a check fails, quit OpenCode again and confirm it is not using the database. Roll back before starting another OpenCode session. The backup is a complete pre-migration clone of the database. These … — `docs/opencode-migration.md:227`
22. `G` **Copying only a live WAL database file does not establish a complete consistent backup.** — If a check fails, quit OpenCode again and confirm it is not using the database. Roll back before starting another OpenCode session. The backup is a complete pre-migration clone of the database. These … — `docs/opencode-migration.md:227`
23. `G` **Preserve reached-step precondition rather than authorize unconditional rollback.** — If a check fails, quit OpenCode again and confirm it is not using the database. Roll back before starting another OpenCode session. The backup is a complete pre-migration clone of the database. These … — `docs/opencode-migration.md:227`
24. `G` **Rollback needs consistent backup WAL handling reached-step tracking and verified old binary before use.** — ``` — `docs/opencode-migration.md:258`
25. `G` **Restore success cannot be inferred without consistent snapshot and post-restore verification.** — If any reverse `mv` destination already exists, stop rather than overwrite it; resolve the directory conflict manually. The database has already been restored to its pre-migration path values by the … — `docs/opencode-migration.md:260`
26. `G` **Session conservation remains a required external migration verification gate.** — | Docs directory: `~/docs/Backlog.md` → `~/docs/agentic-workspace` | Existing session records and their counts | — `docs/opencode-migration.md:269`
27. `P` **External identity diagnosis depends on current schema and verified targets.** — - **Sessions are missing:** Check that `project.worktree` equals the new project path and that `session.directory` and `session_v2.directory` no longer contain the old project path. Use the read-only … — `docs/opencode-migration.md:273`
28. `G` **Preserve failure-recovery gate but snapshot validity and partial filesystem effects need verification.** — - **Sessions are missing:** Check that `project.worktree` equals the new project path and that `session.directory` and `session_v2.directory` no longer contain the old project path. Use the read-only … — `docs/opencode-migration.md:273`
29. `G` **Pruning is not verified worktree repair and needs exact administrative-link evidence.** — - **Git worktree errors:** The linked-worktree registrations contain absolute paths, so moving the project/task-worktree directory invalidates them. Run `git -C … — `docs/opencode-migration.md:275`
30. `G` **Preserve unresolved worktree-usability verification gate.** — - **Git worktree errors:** The linked-worktree registrations contain absolute paths, so moving the project/task-worktree directory invalidates them. Run `git -C … — `docs/opencode-migration.md:275`

**→ `docs/CONVENTIONS.md#changes-and-refactoring`** — 6 statement(s)

1. `G` **WAL and busy timeout do not establish writer quiescence or a consistent standalone database clone.** — 1. The database is in WAL mode, and the migration script sets `PRAGMA busy_timeout`, so the edit is safe to run while OpenCode is running. OpenCode does **not** need to be quit. — `docs/opencode-migration.md:22`
2. `G` **Preserve backup-retention gate but clone consistency with live WAL writers needs verification.** — 3. The database is at `/Users/imribarr/.opencode-personal/data/opencode/opencode.db` (a custom path, approximately 6.1 GB). `opencode db path` reports the configured path. The commands below make a … — `docs/opencode-migration.md:24`
3. `G` **Preserve baseline-comparison gate pending external migration applicability and writer-quiescence verification.** — 9. **Record the pre-migration session counts.** These numbers change as sessions are created, so capture them now and compare against them after the migration (the verification section refers to … — `docs/opencode-migration.md:31`
4. `P` **Preserve exact-target verification gate for any separately authorized external migration.** — 10. The database statements below use SQLite's read/write mode only for the explicit migration. They update only the listed path columns and run in one transaction. Do not change the database path or … — `docs/opencode-migration.md:40`
5. `P` **Whole migration recipe needs verified backup consistency target ownership writer quiescence schema and recovery before reuse.** — ``` — `docs/opencode-migration.md:143`
6. `G` **Backup retention remains mandatory pending verified recovery.** — 5. Start a **new** OpenCode session from `/Users/imribarr/Projects/agentic-workspace`. Confirm this project opens under the new absolute path and its existing sessions are listed. Do not delete the … — `docs/opencode-migration.md:223`

**→ `docs/CONVENTIONS.md#general-principles`** — 3 statement(s)

1. `G` **Destination is now the active repository and destructive removal lacks fresh ownership or authorization.** — 8. The throwaway clone at `/Users/imribarr/Projects/agentic-workspace` has already been removed. The script must use `rm -rf` to remove the destination if present; the `rmdir` guard cannot remove the … — `docs/opencode-migration.md:29`
2. `G` **Destructive destination deletion is unsafe to reuse against the current worktree.** — Save this block as a shell script if desired. Run it once, from any directory, after completing the preconditions. It intentionally stops on errors. The `rm -rf` guard below removes the destination … — `docs/opencode-migration.md:44`
3. `G` **Preserve no-overwrite rollback gate despite script merely skipping conflicted moves.** — If any reverse `mv` destination already exists, stop rather than overwrite it; resolve the directory conflict manually. The database has already been restored to its pre-migration path values by the … — `docs/opencode-migration.md:260`

**→ `docs/CONVENTIONS.md#testing`** — 2 statement(s)

1. `G` **Retain toolchain-shadowing check pending present environment verification.** — 4. In the new project directory, confirm the test suite is green and there is no Bun executable shadowing the installed Bun: — `docs/opencode-migration.md:214`
2. `G` **Preserve intended-toolchain verification without authorizing deletion of an uninspected local dependency entry.** — - **`node_modules/.bin/bun` shadows Bun:** This path must not exist. Remove or investigate the unexpected entry, check which `bun` is being executed with `command -v bun`, then rerun the build and … — `docs/opencode-migration.md:276`

## G6 · Pending decisions — Backlog.md

**Document:** `docs/pending-decisions.md` · **9 statements** — 0 P · 9 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/BLUEPRINT.md#durable-conversation-and-operation-records`** — 3 statement(s)

1. `G` **Exact receipt persistence need requires current recovery evidence.** — - **(i) Bounded first slice (oracle's recommendation).** Adapters take `{kind:"new"} | {kind:"resume", nativeSessionId}` and return confirmed-or-client-established identity; adapters own proposed ids … — `docs/pending-decisions.md:78`
2. `G` **Preserve recovery-evidence removal gate until replacement is verified.** — - **(ii) Full end state.** Also delete durable receipt transport — not honest yet; nothing verified replaces its recovery function. — `docs/pending-decisions.md:79`
3. `G` **Do not erase receipt recovery evidence without verified replacement.** — **Recommendation: (i), at low urgency.** Nothing is broken in a way users can hit right now; this is design debt that will keep costing every time an adapter is added. Do not pick (ii). — `docs/pending-decisions.md:83`

**→ `docs/SPEC.md#open-product-decisions`** — 2 statement(s)

1. `G` **Specific remaining sheet questions need disposition through current owners.** — Items 1–5 below are **settled and implemented** — this file is background for them now, not a list of open questions. What actually remains open to the owner lives in the two decision sheets. — `docs/pending-decisions.md:24`
2. `G` **Retain input-close and watcher decision pointers pending current disposition.** — Open with the owner: [decision-answers-5.md](decision-answers-5.md) (input on close) and [decision-answers-6.md](decision-answers-6.md) (items 1–3). Current suite state and ordered next actions: … — `docs/pending-decisions.md:35`

**→ `docs/BLUEPRINT.md#open-design-decisions`** — 1 statement(s)

1. `G` **Durable v1 receipt necessity remains implementation evidence to verify.** — | 2 session-identity refactor | option (i): adapters own proposed identity, one ownership-checked publisher, receipts kept for OpenCode v1 | steps 1–4 implemented and the receipt-waiting flag … — `docs/pending-decisions.md:29`

**→ _no owning contract — retire, or escalate as a new decision_** — 1 statement(s)

1. `G` **Legacy compatibility requires explicit exception.** — - Standing policy applied: no legacy/backward-compat maintenance, **no migration code in the repo** (migration is a manual human action). The migration tooling and flat-record readers are gone; … — `docs/pending-decisions.md:39`

**→ `docs/specs/supported-integration-operations.md#supported-integration-operations`** — 1 statement(s)

1. `G` **Archive response feedback and MCP retention remain undecided beyond removed demotion scope.** — 1. **Demotion feedback — CONFIRMED regression; needs your intent.** MCP task responses silently drop the dependency-cleanup line. `src/mcp/tools/tasks/handlers.ts:383-387` (archive) and `:438-441` … — `docs/pending-decisions.md:137`

**→ `docs/CONVENTIONS.md#changes-and-refactoring`** — 1 statement(s)

1. `G` **Retain scoped fixture-work hold until current regression and ownership reconciliation.** — - A mechanical batch to convert the remaining legacy fixtures is authorized by the standing policy but held until the regression picture is clear. — `docs/pending-decisions.md:144`

## G7 · Session persistence: decisions and next steps

**Document:** `docs/session-persistence-decisions.md` · **17 statements** — 1 P · 16 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ _no owning contract — retire, or escalate as a new decision_** — 7 statement(s)

1. `G` **Approval and implementation proof are distinct.** — Define the agreed session-storage contract and separate implementation-ready changes from questions that still require discussion. This is a target design, not a claim that the current code … — `docs/session-persistence-decisions.md:22`
2. `G` **Execution authorization is not approval or acceptance evidence.** — The user-authorized [shared-runtime plan](shared-agent-server-plan.md) supersedes the private-instance isolation/completion-helper direction. It owns lifecycle and implementation sequence; the … — `docs/session-persistence-decisions.md:24`
3. `G` **Legacy handling requires explicit exception.** — - Do not retain a legacy compatibility layer or historical unversioned-harness refusal guard. — `docs/session-persistence-decisions.md:33`
4. `G` **Unchecked proof does not establish source absence or acceptance.** — These persistence decisions do not authorize migration or field deletion as part of structural shared-runtime simplification. Reconcile implementation/evidence against the current native contract … — `docs/session-persistence-decisions.md:71`
5. `G` **Outstanding release failures and required precommit release decision need current disposition.** — - Classify the outstanding release-test failures; do not call them unrelated without evidence. If failures remain, obtain a release-gate decision before committing. — `docs/session-persistence-decisions.md:88`
6. `G` **Explicit artifacts.json prohibition and reviewed-only staging gate remain scoped safeguards absent from core.** — - Preserve unrelated dirty files and task data. Never modify or approve `.artifacts.json`. Stage only reviewed explicit paths/hunks; the checkout is already on `main` and needs no merge. — `docs/session-persistence-decisions.md:89`
7. `G` **Verified-commit checkpoint gate needs current authorization or explicit retirement.** — Continue authorized shared-runtime slices from the canonical handoff and existing runtime plan, with verified commits before advancing. Resolve remaining policy questions before field retirement; any … — `docs/session-persistence-decisions.md:93`

**→ `docs/CONVENTIONS.md#changes-and-refactoring`** — 7 statement(s)

1. `G` **Separate migration authorization and field-retirement gates must be retained until their scoped disposition is verified.** — The user-authorized [shared-runtime plan](shared-agent-server-plan.md) supersedes the private-instance isolation/completion-helper direction. It owns lifecycle and implementation sequence; the … — `docs/session-persistence-decisions.md:24`
2. `G` **Historical v2 conversion applies only to a separately authorized migration whose compatibility remains unverified.** — - Treat existing historical OpenCode sessions as v2 sessions under the requested one-time manual migration. Do not leave them permanently classified as ambiguous or blocked. — `docs/session-persistence-decisions.md:32`
3. `G` **Scoped no-migration authorization gate remains pending disposition beyond general escalation policy.** — Preserve canonical project/state/task roots separately from execution cwd, locked complete read-modify-write, exact native/provider identity and validated owned-resource paths. Permanent logs, … — `docs/session-persistence-decisions.md:67`
4. `G` **Separate authorization and evidence gates need explicit retained operational disposition.** — These persistence decisions do not authorize migration or field deletion as part of structural shared-runtime simplification. Reconcile implementation/evidence against the current native contract … — `docs/session-persistence-decisions.md:71`
5. `G` **Last-consumer and policy proof must be retained until verified or explicitly retired.** — Runtime-field retirement is gated by the runtime plan's last-consumer/policy proof. Output and bootstrap removal are not authorized; native/schema migration remains paused and does not block … — `docs/session-persistence-decisions.md:80`
6. `G` **Paused native/schema migration authorization remains a scoped gate to reconcile.** — Runtime-field retirement is gated by the runtime plan's last-consumer/policy proof. Output and bootstrap removal are not authorized; native/schema migration remains paused and does not block … — `docs/session-persistence-decisions.md:80`
7. `G` **Native-ID preservation proof is still required for the paused migration.** — - Prove fixed-mode previous-session selection still works and native IDs survive migration unchanged. — `docs/session-persistence-decisions.md:86`

**→ `docs/CONVENTIONS.md#testing`** — 2 statement(s)

1. `G` **Outstanding two-app runtime acceptance must be verified rather than inferred from source tests.** — - The output command reads persisted terminal output, not native conversation history. Installed CLI behavior remains governed by repository `AGENTS.md`; MAIN build and live two-app acceptance are … — `docs/session-persistence-decisions.md:61`
2. `G` **Explicit permission for two-app live proof remains a scoped execution gate.** — - Follow the [runtime execution rules](shared-agent-server-plan.md#execution-and-verification-rules) and [test remediation procedure](test-suite-remediation-plan.md#mandatory-procedure): batch edits, … — `docs/session-persistence-decisions.md:87`

**→ `docs/BLUEPRINT.md#observation-stop-and-deletion`** — 1 statement(s)

1. `P` **Exact descendant-settlement certificate rejection is scoped runtime evidence not established by core cleanup wording.** — Use the [runtime choices](shared-agent-server-plan.md#runtime-choices) and [technical safeguards](shared-agent-runtime-simplification.md#invariants-and-gates) as their single source. Shared … — `docs/session-persistence-decisions.md:65`

## G8 · Session service (`sessions.ts`) — owner proposal vs. oracle review

**Document:** `docs/session-service-redesign-brief.md` · **5 statements** — 0 P · 5 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/architecture/session-harness.md#readiness-and-identity-correlation`** — 2 statement(s)

1. `G` **Provider-specific signal timing is historical evidence requiring adapter verification.** — > - OpenCode v1 supplies identity **later**, through a receipt. — `docs/session-service-redesign-brief.md:240`
2. `G` **Provider-specific preparation timing requires verification rather than becoming a universal guarantee.** — > - Claude, Pi and OpenCode v2 establish identity during preparation. — `docs/session-service-redesign-brief.md:241`

**→ _no owning contract — retire, or escalate as a new decision_** — 1 statement(s)

1. `G` **Approved product contract takes precedence.** — forbids silently replacing a failed exact resume with a fresh conversation. — `docs/session-service-redesign-brief.md:42`

**→ `docs/BLUEPRINT.md#authoritative-mutation-and-publication`** — 1 statement(s)

1. `G` **Historical gate scope must be verified before relying on it for cross-process safety.** — | Mode lifecycle gate | In-process serialization only; **not** a universal cross-process mutex | — `docs/session-service-redesign-brief.md:199`

**→ `docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport`** — 1 statement(s)

1. `G` **At least one launch wording is ambiguous and cannot justify per-mode exclusion or mandatory launch.** — - At least one launch per mode, and concurrent-callback guards that JSON validation cannot prove. — `docs/session-service-redesign-brief.md:272`

## G9 · Session redesign — ownership and abstraction correction

**Document:** `docs/session-service-redesign-correction-plan.md` · **40 statements** — 1 P · 39 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/architecture/application-boundaries.md#authoritative-mutation-and-publication`** — 27 statement(s)

1. `G` **start admission-taking behavior needs current verification before nested use or gate retirement.** — - **Task admission.** `withTaskSessionAdmission` (`sessions.ts:340`) holds a non-reentrant per-task file lock (`retries: 0`). Do not call `start`, `stop`, `ask`, `delete`, `purge`, `reset`, … — `docs/session-service-redesign-correction-plan.md:92`
2. `G` **stop admission-taking behavior needs current verification before nested use or gate retirement.** — - **Task admission.** `withTaskSessionAdmission` (`sessions.ts:340`) holds a non-reentrant per-task file lock (`retries: 0`). Do not call `start`, `stop`, `ask`, `delete`, `purge`, `reset`, … — `docs/session-service-redesign-correction-plan.md:93`
3. `G` **ask admission-taking behavior needs current verification before nested use or gate retirement.** — - **Task admission.** `withTaskSessionAdmission` (`sessions.ts:340`) holds a non-reentrant per-task file lock (`retries: 0`). Do not call `start`, `stop`, `ask`, `delete`, `purge`, `reset`, … — `docs/session-service-redesign-correction-plan.md:94`
4. `G` **delete admission-taking behavior needs current verification before nested use or gate retirement.** — - **Task admission.** `withTaskSessionAdmission` (`sessions.ts:340`) holds a non-reentrant per-task file lock (`retries: 0`). Do not call `start`, `stop`, `ask`, `delete`, `purge`, `reset`, … — `docs/session-service-redesign-correction-plan.md:95`
5. `G` **purge admission-taking behavior needs current verification before nested use or gate retirement.** — - **Task admission.** `withTaskSessionAdmission` (`sessions.ts:340`) holds a non-reentrant per-task file lock (`retries: 0`). Do not call `start`, `stop`, `ask`, `delete`, `purge`, `reset`, … — `docs/session-service-redesign-correction-plan.md:96`
6. `G` **reset admission-taking behavior needs current verification before nested use or gate retirement.** — - **Task admission.** `withTaskSessionAdmission` (`sessions.ts:340`) holds a non-reentrant per-task file lock (`retries: 0`). Do not call `start`, `stop`, `ask`, `delete`, `purge`, `reset`, … — `docs/session-service-redesign-correction-plan.md:97`
7. `G` **liveSession admission-taking behavior needs current verification before nested use or gate retirement.** — - **Task admission.** `withTaskSessionAdmission` (`sessions.ts:340`) holds a non-reentrant per-task file lock (`retries: 0`). Do not call `start`, `stop`, `ask`, `delete`, `purge`, `reset`, … — `docs/session-service-redesign-correction-plan.md:98`
8. `G` **prepare-family admission-taking behavior needs current verification before nested use or gate retirement.** — - **Task admission.** `withTaskSessionAdmission` (`sessions.ts:340`) holds a non-reentrant per-task file lock (`retries: 0`). Do not call `start`, `stop`, `ask`, `delete`, `purge`, `reset`, … — `docs/session-service-redesign-correction-plan.md:99`
9. `G` **adoptPendingSession admission-taking behavior needs current verification before nested use or gate retirement.** — - **Task admission.** `withTaskSessionAdmission` (`sessions.ts:340`) holds a non-reentrant per-task file lock (`retries: 0`). Do not call `start`, `stop`, `ask`, `delete`, `purge`, `reset`, … — `docs/session-service-redesign-correction-plan.md:100`
10. `G` **finalizeHandoff admission-taking behavior needs current verification before nested use or gate retirement.** — - **Task admission.** `withTaskSessionAdmission` (`sessions.ts:340`) holds a non-reentrant per-task file lock (`retries: 0`). Do not call `start`, `stop`, `ask`, `delete`, `purge`, `reset`, … — `docs/session-service-redesign-correction-plan.md:101`
11. `G` **activateNativeSession admission-taking behavior needs current verification before nested use or gate retirement.** — - **Task admission.** `withTaskSessionAdmission` (`sessions.ts:340`) holds a non-reentrant per-task file lock (`retries: 0`). Do not call `start`, `stop`, `ask`, `delete`, `purge`, `reset`, … — `docs/session-service-redesign-correction-plan.md:102`
12. `G` **finishNativeSession admission-taking behavior needs current verification before nested use or gate retirement.** — - **Task admission.** `withTaskSessionAdmission` (`sessions.ts:340`) holds a non-reentrant per-task file lock (`retries: 0`). Do not call `start`, `stop`, `ask`, `delete`, `purge`, `reset`, … — `docs/session-service-redesign-correction-plan.md:103`
13. `G` **parkNativeSession admission-taking behavior needs current verification before nested use or gate retirement.** — - **Task admission.** `withTaskSessionAdmission` (`sessions.ts:340`) holds a non-reentrant per-task file lock (`retries: 0`). Do not call `start`, `stop`, `ask`, `delete`, `purge`, `reset`, … — `docs/session-service-redesign-correction-plan.md:104`
14. `G` **reconcileTaskSessions admission-taking behavior needs current verification before nested use or gate retirement.** — - **Task admission.** `withTaskSessionAdmission` (`sessions.ts:340`) holds a non-reentrant per-task file lock (`retries: 0`). Do not call `start`, `stop`, `ask`, `delete`, `purge`, `reset`, … — `docs/session-service-redesign-correction-plan.md:105`
15. `G` **rollbackHandoff safe-call claim under held admission requires current verification.** — - **Task admission.** `withTaskSessionAdmission` (`sessions.ts:340`) holds a non-reentrant per-task file lock (`retries: 0`). Do not call `start`, `stop`, `ask`, `delete`, `purge`, `reset`, … — `docs/session-service-redesign-correction-plan.md:106`
16. `G` **forgetTaskSessions safe-call claim under held admission requires current verification.** — - **Task admission.** `withTaskSessionAdmission` (`sessions.ts:340`) holds a non-reentrant per-task file lock (`retries: 0`). Do not call `start`, `stop`, `ask`, `delete`, `purge`, `reset`, … — `docs/session-service-redesign-correction-plan.md:107`
17. `G` **publishNativeIdentity safe-call claim under held admission requires current verification.** — - **Task admission.** `withTaskSessionAdmission` (`sessions.ts:340`) holds a non-reentrant per-task file lock (`retries: 0`). Do not call `start`, `stop`, `ask`, `delete`, `purge`, `reset`, … — `docs/session-service-redesign-correction-plan.md:108`
18. `G` **stopAllTaskSessions safe-call claim under held admission requires current verification.** — - **Task admission.** `withTaskSessionAdmission` (`sessions.ts:340`) holds a non-reentrant per-task file lock (`retries: 0`). Do not call `start`, `stop`, `ask`, `delete`, `purge`, `reset`, … — `docs/session-service-redesign-correction-plan.md:109`
19. `G` **output safe-call claim under held admission requires current verification.** — - **Task admission.** `withTaskSessionAdmission` (`sessions.ts:340`) holds a non-reentrant per-task file lock (`retries: 0`). Do not call `start`, `stop`, `ask`, `delete`, `purge`, `reset`, … — `docs/session-service-redesign-correction-plan.md:110`
20. `G` **sendKey safe-call claim under held admission requires current verification.** — - **Task admission.** `withTaskSessionAdmission` (`sessions.ts:340`) holds a non-reentrant per-task file lock (`retries: 0`). Do not call `start`, `stop`, `ask`, `delete`, `purge`, `reset`, … — `docs/session-service-redesign-correction-plan.md:111`
21. `G` **attach safe-call claim under held admission requires current verification.** — - **Task admission.** `withTaskSessionAdmission` (`sessions.ts:340`) holds a non-reentrant per-task file lock (`retries: 0`). Do not call `start`, `stop`, `ask`, `delete`, `purge`, `reset`, … — `docs/session-service-redesign-correction-plan.md:112`
22. `G` **touchUsage safe-call claim under held admission requires current verification.** — - **Task admission.** `withTaskSessionAdmission` (`sessions.ts:340`) holds a non-reentrant per-task file lock (`retries: 0`). Do not call `start`, `stop`, `ask`, `delete`, `purge`, `reset`, … — `docs/session-service-redesign-correction-plan.md:113`
23. `G` **list-family safe-call claim under held admission requires current verification.** — - **Task admission.** `withTaskSessionAdmission` (`sessions.ts:340`) holds a non-reentrant per-task file lock (`retries: 0`). Do not call `start`, `stop`, `ask`, `delete`, `purge`, `reset`, … — `docs/session-service-redesign-correction-plan.md:114`
24. `G` **deleteMode safe-call claim under held admission requires current verification.** — - **Task admission.** `withTaskSessionAdmission` (`sessions.ts:340`) holds a non-reentrant per-task file lock (`retries: 0`). Do not call `start`, `stop`, `ask`, `delete`, `purge`, `reset`, … — `docs/session-service-redesign-correction-plan.md:115`
25. `G` **finalizeHandoffLocked safe-call claim under held admission requires current verification.** — - **Task admission.** `withTaskSessionAdmission` (`sessions.ts:340`) holds a non-reentrant per-task file lock (`retries: 0`). Do not call `start`, `stop`, `ask`, `delete`, `purge`, `reset`, … — `docs/session-service-redesign-correction-plan.md:116`
26. `G` **failReservation safe-call claim under held admission requires current verification.** — - **Task admission.** `withTaskSessionAdmission` (`sessions.ts:340`) holds a non-reentrant per-task file lock (`retries: 0`). Do not call `start`, `stop`, `ask`, `delete`, `purge`, `reset`, … — `docs/session-service-redesign-correction-plan.md:117`
27. `G` **stopClaimedSession safe-call claim under held admission requires current verification.** — - **Task admission.** `withTaskSessionAdmission` (`sessions.ts:340`) holds a non-reentrant per-task file lock (`retries: 0`). Do not call `start`, `stop`, `ask`, `delete`, `purge`, `reset`, … — `docs/session-service-redesign-correction-plan.md:118`

**→ _no owning contract — retire, or escalate as a new decision_** — 10 statement(s)

1. `P` **Active-writer reconciliation is a scoped execution safeguard whose satisfaction is not established here.** — Inspected source may continue changing in another worktree/session. Before editing, inspect status and relevant diffs, reconcile active workers, and recheck symbols rather than assuming this snapshot … — `docs/session-service-redesign-correction-plan.md:33`
2. `G` **No-overlapping-writer gate remains an operational safeguard pending current execution reconciliation.** — These corrective slices are sequential because their files and contracts overlap. Parallelism resumes for disjoint CLI/UI consumer work only after C3 freezes the implemented seam. A read-only … — `docs/session-service-redesign-correction-plan.md:55`
3. `G` **Active writer and partial integration gate needs current execution verification.** — 1. Inspect Git status and targeted diffs. Identify active writers and completed-but-unintegrated controller changes. Do not overwrite or cherry-pick partial work blindly. — `docs/session-service-redesign-correction-plan.md:59`
4. `G` **No-overlap execution gate is not certified by mapping.** — Success: no overlapping writer, actual caller inventory, single composition owner, baseline evidence. No source design is accepted merely because an old contract compiles. — `docs/session-service-redesign-correction-plan.md:64`
5. `G` **Compile evidence cannot approve source design.** — Success: no overlapping writer, actual caller inventory, single composition owner, baseline evidence. No source design is accepted merely because an old contract compiles. — `docs/session-service-redesign-correction-plan.md:64`
6. `G` **Scoped owner and lock change-review gate remains until implementation reconciliation.** — This table is the executable ownership contract that earlier revisions lacked; do not substitute another interface package for it. Ownership, lock, and incarnation columns below are binding now. … — `docs/session-service-redesign-correction-plan.md:68`
7. `G` **Exact safe-call inventory under non-reentrant admission requires current source verification.** — Locks are layered, not per-row: the outer operation holds task admission — plus the session claim where a row names one — for the whole sequence, and the Locks-held column names only the layer that … — `docs/session-service-redesign-correction-plan.md:84`
8. `G` **Approved behavior governs alignment.** — - New/resume/rollback behavior remains as approved; no product decision is reopened. — `docs/session-service-redesign-correction-plan.md:247`
9. `G` **Scoped work cannot authorize incompatible ownership.** — - No alternative owner or compatibility route implements behavior owned by Task, Session, or the application controller. — `docs/session-service-redesign-correction-plan.md:248`
10. `G` **Disjoint-writer safeguard remains until current assignments are reconciled.** — All supported CLI/UI/Core/MCP callers must satisfy the same target ownership boundary before acceptance. Preserve disjoint file ownership. Do not restart completed features just to match proposed … — `docs/session-service-redesign-correction-plan.md:261`

**→ `docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport`** — 1 statement(s)

1. `G` **Exact post-pane workspace-context binding remains a scoped safety fix to verify against current explicit environment construction.** — - **Bounded Harness corrections.** Harness still needs launch-local workspace context after pane creation, resume ordering that cleans outgoing resources before preparing replacement activity … — `docs/session-service-redesign-correction-plan.md:120`

**→ `docs/BLUEPRINT.md#open-design-decisions`** — 1 statement(s)

1. `G` **Historical auto-resume confirmation error policy remains unsettled.** — The migrated application path now preserves exact-resume provider/root/working-directory checks, the failed-probe and auto-resume confirmation errors, launch preflight, and identity revalidation. … — `docs/session-service-redesign-correction-plan.md:233`

**→ `docs/architecture/session-harness.md#readiness-and-identity-correlation`** — 1 statement(s)

1. `G` **Live-provider acceptance remains explicitly unverified and mapping cannot close it.** — - Readiness correlation must be established deterministically, not only live. `HARNESS_READINESS_MATRIX` lives in `harness.ts`, and the former weak resume receipt check has been replaced by … — `docs/session-service-redesign-correction-plan.md:251`

## G10 · Session redesign — parallel implementation plan

**Document:** `docs/session-service-redesign-implementation-plan.md` · **26 statements** — 1 P · 25 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ _no owning contract — retire, or escalate as a new decision_** — 15 statement(s)

1. `G` **A plan cannot establish passing-test evidence.** — Implement [the target architecture](session-service-redesign.md), using [the debate brief](session-service-redesign-brief.md) as background. This document plans implementation; it does not authorize … — `docs/session-service-redesign-implementation-plan.md:24`
2. `G` **Approved SPEC supersedes old fallback plans.** — Read repository `AGENTS.md`, the [runtime handoff](shared-agent-runtime-handoff.md), and its safeguard pointers before runtime work. `docs/SPEC.md` takes precedence over old resume-fallback plans. … — `docs/session-service-redesign-implementation-plan.md:28`
3. `G` **Runtime and test-remediation prerequisite reading gates remain scoped execution safeguards.** — Read repository `AGENTS.md`, the [runtime handoff](shared-agent-runtime-handoff.md), and its safeguard pointers before runtime work. `docs/SPEC.md` takes precedence over old resume-fallback plans. … — `docs/session-service-redesign-implementation-plan.md:28`
4. `G` **Implementation gaps do not reopen approved policy.** — Remove unused contract filler such as `TaskAdmissionContext`; do not introduce a probe-capability field. Freeze the concrete evidence and interfaces, then dispatch the ready waves. Lack of a … — `docs/session-service-redesign-implementation-plan.md:104`
5. `G` **Placeholders cannot count as implemented acceptance.** — **Gate success:** approved startup/rollback semantics encoded in concrete shared types; provider matrix feasible; types compile; checkpoint and rollback ordering have deterministic fake tests; … — `docs/session-service-redesign-implementation-plan.md:106`
6. `G` **One-writer and shared-helper change gates remain scoped safety requirements until assignment reconciliation.** — All workers in a wave start from the same integrated base in isolated worktrees. One writer per file, including tests. If a worker needs an unowned file, it sends the integrator a bounded change … — `docs/session-service-redesign-implementation-plan.md:130`
7. `G` **Temporary compatibility paths require explicit exception.** — Superseded: temporary adapters and retaining the old application path are not authorized. Follow the current-contract-only policy and [target ownership design](session-service-redesign.md). — `docs/session-service-redesign-implementation-plan.md:134`
8. `G` **Verified-commit checkpoint and authorization gates remain scoped requirements needing current disposition.** — The runtime plan requires a verified checkpoint commit before the next implementation slice. Workers do not commit independently. Obtain explicit commit authorization at execution kickoff; without … — `docs/session-service-redesign-implementation-plan.md:136`
9. `G` **Read-only reviewer and no-concurrent-test-writer gate remains a scoped execution safeguard.** — V1 starts as a read-only audit of the integrated Wave 4 result while I2 makes only agreed retirement changes; final V1 verification uses the final assembled tree. It never writes tests concurrently … — `docs/session-service-redesign-implementation-plan.md:151`
10. `G` **No implicit compatibility exception.** — 5. Superseded: temporary compatibility exports are not authorized. Follow the current-contract-only policy and [target ownership design](session-service-redesign.md). — `docs/session-service-redesign-implementation-plan.md:244`
11. `G` **Shared-helper edit ownership gate remains scoped execution protection.** — Depends on I1 and M1. Exclusive writes: `src/core/agentic-workspace.ts`, `task-mutation-service.ts`, `task-lifecycle-service.ts`; `src/agent-workspace/mode-lifecycle.ts`, … — `docs/session-service-redesign-implementation-plan.md:277`
12. `G` **No concurrent serialization writer remains a scoped execution safeguard.** — 4. Mode deletion removes that mode's history and selection references without merging sessions into another mode. Coordinate view-state serialization with U1 through the frozen interface, not … — `docs/session-service-redesign-implementation-plan.md:282`
13. `G` **Shared-helper integrator ownership remains a scoped execution gate.** — Update `docs/SPEC.md` and architecture pointers for the approved semantics, especially the post-dispatch preserve-live clause in §7: critical creation failure now attempts full rollback, while … — `docs/session-service-redesign-implementation-plan.md:305`
14. `G` **Acceptance and runtime claims require evidence.** — 4. Return changed files, source-test counts, relevant behavior evidence, remaining blockers, and any contract change request. No commit/build/runtime claims without performing them. — `docs/session-service-redesign-implementation-plan.md:326`
15. `G` **Single-writer file ownership gate remains required until current assignments are reconciled.** — The integrator maintains the dependency board and file ownership ledger outside the repository alongside this plan. Dispatch only ready tickets; never ask two workers to “coordinate” edits to the … — `docs/session-service-redesign-implementation-plan.md:362`

**→ `docs/architecture/session-harness.md#readiness-and-identity-correlation`** — 5 statement(s)

1. `P` **V1 plugin signal remains a candidate needing production evidence.** — The implementation agent reported candidate signals: the owned v1 plugin, v2 API acknowledgment, Claude `UserPromptSubmit`, and Pi `before_agent_start`. These are investigation leads, not … — `docs/session-service-redesign-implementation-plan.md:102`
2. `G` **V2 API acknowledgment semantics need verification.** — The implementation agent reported candidate signals: the owned v1 plugin, v2 API acknowledgment, Claude `UserPromptSubmit`, and Pi `before_agent_start`. These are investigation leads, not … — `docs/session-service-redesign-implementation-plan.md:102`
3. `G` **Claude UserPromptSubmit timing and sufficiency need verification.** — The implementation agent reported candidate signals: the owned v1 plugin, v2 API acknowledgment, Claude `UserPromptSubmit`, and Pi `before_agent_start`. These are investigation leads, not … — `docs/session-service-redesign-implementation-plan.md:102`
4. `G` **Pi before_agent_start timing and sufficiency need verification.** — The implementation agent reported candidate signals: the owned v1 plugin, v2 API acknowledgment, Claude `UserPromptSubmit`, and Pi `before_agent_start`. These are investigation leads, not … — `docs/session-service-redesign-implementation-plan.md:102`
5. `G` **Provider and two-client runtime acceptance remain open until actual evidence is obtained.** — After final integration, the main agent runs `bun run build`, then the repository-prescribed freshness check `find src -name '*.ts' -newer dist/agentic-workspace` (must print nothing). Inspect … — `docs/session-service-redesign-implementation-plan.md:344`

**→ `docs/CONVENTIONS.md#changes-and-refactoring`** — 2 statement(s)

1. `G` **Scoped schema-migration prohibition remains pending explicit execution disposition.** — - No new packages, daemon, provider-global uniqueness rule, schema migration, or generic event/state-machine framework. — `docs/session-service-redesign-implementation-plan.md:55`
2. `G` **Scoped no-migration gate needs current disposition.** — Success: no schema migration; durable reservation precedes dispatch in contract tests; stale callbacks cannot resurrect records; independent session/usage changes survive; lock release failure is … — `docs/session-service-redesign-implementation-plan.md:210`

**→ `docs/architecture/session-harness.md#session`** — 1 statement(s)

1. `G` **Installing an already-live execution through an adopt seam is not explicitly specified as a current operation.** — 3. **Session's transition surface is incomplete.** Observed lifecycle changes (execution exit) never become record changes or publications; `stop()` retains the stopped execution and listeners; … — `docs/session-service-redesign-implementation-plan.md:218`

**→ `docs/specs/tasks.md#task-deletion`** — 1 statement(s)

1. `G` **Historical task-wide purge API is not independently approved by current cleanup scope.** — 4. **The controller interface dropped required inputs:** per-session delete `force`, hand-off successor/predecessor identity and prior selection, verified runtime origin for activate/finish/park, … — `docs/session-service-redesign-implementation-plan.md:219`

**→ `docs/specs/supported-integration-operations.md#supported-integration-operations`** — 1 statement(s)

1. `G` **Ask timeout and partial-answer behavior remain unspecified in core.** — 3. Migrate queued request admission and finalization, verified live attachment, reconciliation, park/finish, active selection, previous session, output, ask, input, deletion, forget, and task-wide … — `docs/session-service-redesign-implementation-plan.md:242`

**→ `docs/specs/sessions.md#creation-failure-and-recovery`** — 1 statement(s)

1. `G` **Automatic interruption recovery and retry outcomes remain DEC-4 rather than implied by this matrix.** — | Interrupted startup | Recovery at reservation, allocation, identity, readiness, final-write checkpoints; truthful partial failure | — `docs/session-service-redesign-implementation-plan.md:335`

## G11 · Session service target architecture

**Document:** `docs/session-service-redesign.md` · **1 statements** — 0 P · 1 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/BLUEPRINT.md#open-design-decisions`** — 1 statement(s)

1. `G` **Blanket preservation of every historical native-field policy needs reconciliation with changed lifetime and deletion contracts.** — - App-owned/native distinctions and ownership attribution retain their existing policy significance. — `docs/session-service-redesign.md:301`

## G12 · Shared agent runtime: simplification findings

**Document:** `docs/shared-agent-runtime-simplification.md` · **16 statements** — 0 P · 16 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ _no owning contract — retire, or escalate as a new decision_** — 7 statement(s)

1. `G` **Review and implementation authorization do not establish acceptance.** — This document records oracle's source-grounded simplification actions for the [shared runtime plan](shared-agent-server-plan.md). It is not artifact approval or runtime acceptance. Source references … — `docs/shared-agent-runtime-simplification.md:20`
2. `G` **Historical map checkpoint does not grant fresh execution permission.** — The canonical [AoE functionality map](aoe-functionality-map.md) is verified across 97 features in six domains (92 body-verified, 4 signature-level, 1 grep-only); thin-entry depth gaps are recorded in … — `docs/shared-agent-runtime-simplification.md:24`
3. `G` **Historical work-order gate needs parent reconciliation before reuse or retirement.** — Use one coherent owner for coupled session/controller/CLI flow. Split only mechanically owned tests or backend work after interfaces stabilize. Finish the bounded retirement fix already in progress, … — `docs/shared-agent-runtime-simplification.md:30`
4. `G` **Approved safety and identity constraints survive refactoring.** — Use one coherent owner for coupled session/controller/CLI flow. Split only mechanically owned tests or backend work after interfaces stabilize. Finish the bounded retirement fix already in progress, … — `docs/shared-agent-runtime-simplification.md:30`
5. `G` **Structural work cannot settle remaining product policy.** — - Live per-session CLI/session-delete policy is OPEN: currently flagged live sessions refuse even force, while direct live sessions can stop under force. Oracle recommends both entrypoints refuse … — `docs/shared-agent-runtime-simplification.md:59`
6. `G` **Refactoring does not approve policy changes.** — - Keep all existing user features from the [plan](shared-agent-server-plan.md#feature-preservation). Structural simplification and deletion-policy decisions are separate gates. — `docs/shared-agent-runtime-simplification.md:67`
7. `G` **Documentation and authorization do not establish verification.** — - Resolve per-session live-delete, strict/retryable session cleanup, and running-limit policy with the user before implementing those behavior changes. Resolve field-dependent policies before … — `docs/shared-agent-runtime-simplification.md:68`

**→ `docs/specs/sessions.md#deleting-a-session`** — 3 statement(s)

1. `G` **Detailed sidecar retry policy remains open while cleanup-before-removal is settled.** — - Per-session deletion currently removes the record first and performs best-effort sidecar cleanup; `removeFile` swallows errors. Strict/retryable cleanup is a proposed behavior change, not an … — `docs/shared-agent-runtime-simplification.md:58`
2. `G` **Truthful evidence is settled but guaranteed retry behavior remains open.** — - Preserve original copied attachment records and pane callback origins; validate exact canonical root/task/session/mode/provider/name/role and resource inventory. Cleanup precedes kill, and partial … — `docs/shared-agent-runtime-simplification.md:66`
3. `G` **Detailed sidecar scope and retry outcomes remain open.** — - Resolve per-session live-delete, strict/retryable session cleanup, and running-limit policy with the user before implementing those behavior changes. Resolve field-dependent policies before … — `docs/shared-agent-runtime-simplification.md:68`

**→ `docs/CONVENTIONS.md#documentation-maintenance`** — 1 statement(s)

1. `G` **Scoped safety reference must remain until its unique gates are folded and verified.** — Current source/lane checkpoint: [handoff](shared-agent-runtime-handoff.md). Test refactors and finding evidence: [remediation plan](test-suite-remediation-plan.md). Read those for progress; this … — `docs/shared-agent-runtime-simplification.md:22`

**→ `docs/specs/sessions.md#creation-failure-and-recovery`** — 1 statement(s)

1. `G` **Exact queued-adoption and retry outcome needs reconciliation with DEC-4.** — - Prove the shared flow with a live STARTING reconciliation that never kills, transient preflight errors that leave state/runtime unchanged, different requester/controller PIDs, and a queued … — `docs/shared-agent-runtime-simplification.md:44`

**→ `docs/CONVENTIONS.md#testing`** — 1 statement(s)

1. `G` **Upstream activation and backend equivalence lack verification.** — - Pinned-start/resume evidence in [the natural-completion/resume audit](aoe-natural-completion-resume-source-audit.md) supports instance-owned live/dead/start-skip/outgoing-teardown behavior. Full … — `docs/shared-agent-runtime-simplification.md:46`

**→ `docs/specs/tasks.md#task-deletion`** — 1 statement(s)

1. `G` **Resource-specific sidecar order needs reconciliation with execution-cleanup-first deletion.** — - Core task forget remains association-only, under caller-held existing locks (do not reacquire). Clean exact known sidecars/markers before record/container removal; never probe tmux, signal, call … — `docs/shared-agent-runtime-simplification.md:57`

**→ `docs/BLUEPRINT.md#observation-stop-and-deletion`** — 1 statement(s)

1. `G` **Unqualified cleanup-before-kill conflicts with cleanup-before-forgetting and needs resource-specific clarification.** — - Preserve original copied attachment records and pane callback origins; validate exact canonical root/task/session/mode/provider/name/role and resource inventory. Cleanup precedes kill, and partial … — `docs/shared-agent-runtime-simplification.md:66`

**→ `docs/BLUEPRINT.md#open-design-decisions`** — 1 statement(s)

1. `G` **Storage representation remains flexible and schema changes need concrete justification.** — - Preserve original copied attachment records and pane callback origins; validate exact canonical root/task/session/mode/provider/name/role and resource inventory. Cleanup precedes kill, and partial … — `docs/shared-agent-runtime-simplification.md:66`

## G13 · AOE-style shared runtime: simplification plan

**Document:** `docs/shared-agent-server-plan.md` · **32 statements** — 3 P · 29 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ _no owning contract — retire, or escalate as a new decision_** — 14 statement(s)

1. `G` **Static evidence and authorization do not establish runtime acceptance.** — This replaces the per-instance isolation plan, with implementation authorized by the user. Oracle statically reviewed the direction, actual MAIN seams and feature inventory; neither authorization nor … — `docs/shared-agent-server-plan.md:22`
2. `G` **Old integration checkpoint must be reconciled before treating work as accepted.** — Core task deletion as locked association-only forget is already implemented: exact known files/markers and associations, no signals, provider/Git deletion or second UI purge. Initial slice 3 proof … — `docs/shared-agent-server-plan.md:113`
3. `G` **Safety constraints survive structural changes.** — Remove superseded private runtime allocation/attachment ownership, exclusive frontend recovery, auto-GC and readiness machinery only after consumers are replaced. Keep useful resource/path … — `docs/shared-agent-server-plan.md:127`
4. `G` **Parked patches are not approval and their disposition remains parent-owned.** — Do not blanket-revert the private-foundation commit: some code remains reachable. Do not integrate parked private-consumer, startup-witness, v3-history, cutover-descriptor or migration patches merely … — `docs/shared-agent-server-plan.md:129`
5. `P` **Proposed implementation formats are not approved product features.** — Preserve current version-2 nested-mode history unless a concrete necessary change is demonstrated. A planned v3 or private-cutover descriptor is not a product feature. Choose one current … — `docs/shared-agent-server-plan.md:135`
6. `G` **Exact context cap is a scoped operational gate requiring parent disposition.** — - Start a fresh bounded agent/context for each new work item, with short pointer handoffs/results, fixed disjoint write scopes and no subdelegation, raw logs or broad reads. Keep each agent within … — `docs/shared-agent-server-plan.md:143`
7. `G` **Preserve explicit canceled-session exclusion until parent disposition.** — - Start a fresh bounded agent/context for each new work item, with short pointer handoffs/results, fixed disjoint write scopes and no subdelegation, raw logs or broad reads. Keep each agent within … — `docs/shared-agent-server-plan.md:143`
8. `G` **Harness-specific completion procedure requires current operational verification.** — - Start a fresh bounded agent/context for each new work item, with short pointer handoffs/results, fixed disjoint write scopes and no subdelegation, raw logs or broad reads. Keep each agent within … — `docs/shared-agent-server-plan.md:143`
9. `G` **Retain user-scoped sequencing gate pending current authorization rather than generalize it.** — - **User-required sequence:** verify and commit each completed slice BEFORE the next implementation slice; do not start the next implementation slice until the verified commit exists. The map gate is … — `docs/shared-agent-server-plan.md:144`
10. `G` **Historical map completion does not authorize a new lane.** — - **User-required sequence:** verify and commit each completed slice BEFORE the next implementation slice; do not start the next implementation slice until the verified commit exists. The map gate is … — `docs/shared-agent-server-plan.md:144`
11. `G` **Scoped hook permission does not authorize manual stash operations.** — - **User-required sequence:** verify and commit each completed slice BEFORE the next implementation slice; do not start the next implementation slice until the verified commit exists. The map gate is … — `docs/shared-agent-server-plan.md:144`
12. `G` **Preserve explicit destructive-command prohibition pending parent disposition.** — - **User-required sequence:** verify and commit each completed slice BEFORE the next implementation slice; do not start the next implementation slice until the verified commit exists. The map gate is … — `docs/shared-agent-server-plan.md:144`
13. `G` **Scoped remediation ordering requires current ledger reconciliation.** — - Apply the relevant report refactor before fixing residual failures in a failing area; green patched assertions alone do not complete remediation. Follow the remediation plan's separate bounded lane … — `docs/shared-agent-server-plan.md:145`
14. `G` **Retain scoped execution prohibitions without converting them into fresh permissions.** — - Preserve unrelated changes, task data and `.artifacts.json`. Normal commit hooks and checkpoint rules apply; no reset, history rewrite, blanket rollback or artifact approval. — `docs/shared-agent-server-plan.md:149`

**→ `docs/CONVENTIONS.md#testing`** — 4 statement(s)

1. `G` **Scoped withdrawn harness-test prohibition remains until parent reconciliation.** — - Keep coupled session/controller/CLI flow under one coherent owner. Disjoint mechanically-owned application-behavior tests or backend work may proceed only after interfaces stabilize. Do not create … — `docs/shared-agent-server-plan.md:142`
2. `G` **Retain scoped withdrawn-test prohibition.** — - Audit fake/resource safety before bounded named application-behavior tests; reuse valid proof. Runner heuristic temporary CLI bundles are normal test mechanics, not installed MAIN builds. Run only … — `docs/shared-agent-server-plan.md:146`
3. `G` **Prior unsafe acceptance evidence remains explicitly excluded.** — - Source/fake proof is not runtime acceptance. Real checks require disposable isolated fixtures and verified target-ownership boundaries; do not reuse earlier accidental-live results. — `docs/shared-agent-server-plan.md:147`
4. `G` **Preserve explicit no-cleanup gate until ownership is established.** — - Earlier live fixtures still lack terminal provenance. Possible survivors remain unresolved; this plan authorizes no ad-hoc signals or cleanup. Do not perform ad-hoc live cleanup; the parent owns … — `docs/shared-agent-server-plan.md:148`

**→ `docs/specs/supported-integration-operations.md#supported-integration-operations`** — 3 statement(s)

1. `G` **Ask is approved but exact noninteractive protocol details are not folded.** — AOE is the reference for instance-owned tmux lifecycle, not global provider-native-ID exclusion or descendant settlement. Keep Backlog's exact saved-ID/provider command correctness, noninteractive … — `docs/shared-agent-server-plan.md:32`
2. `G` **Exact ask timeout streaming and partial-output guarantees need supported-contract disposition.** — - CLI/headless execution uses the same shared runtime and persistent lifetime. History/output reads start no infrastructure. Ask retains its existing stopped-only, noninteractive timeout, … — `docs/shared-agent-server-plan.md:42`
3. `G` **Ask timeout and partial-output guarantees need contract disposition.** — Proof: no field-dependent behavior differences in attach/send-key, stop, cleanup, classification or discovery; retained ask timeout/partial output and provider-mismatch refusal; stop failures and … — `docs/shared-agent-server-plan.md:123`

**→ `docs/specs/tasks.md#edge-cases-and-failures`** — 2 statement(s)

1. `G` **Cancellation stage and interruption semantics are not specified for new destructive deletion.** — Validate Backlog-owned paths; never follow persisted paths into provider/user/unrelated-task storage. Cancellation changes nothing. Distinguish failures before task removal from committed removal … — `docs/shared-agent-server-plan.md:68`
2. `G` **Preserve identity failure scenarios while exact new deletion race and cancellation outcomes await DEC-1.** — Proof: owned/foreign RUNNING, STARTING, PARKED and stopped records, mixed modes, cancellation, pending publication, replacement task ID, unrelated task and truthful pre/post-removal failures. … — `docs/shared-agent-server-plan.md:115`

**→ `docs/CONVENTIONS.md#general-principles`** — 2 statement(s)

1. `G` **Retain scoped no-revert gate until reachable work and ownership are reconciled.** — Do not blanket-revert the private-foundation commit: some code remains reachable. Do not integrate parked private-consumer, startup-witness, v3-history, cutover-descriptor or migration patches merely … — `docs/shared-agent-server-plan.md:129`
2. `G` **Specific commit-agent procedure remains a scoped execution gate.** — - **User-required sequence:** verify and commit each completed slice BEFORE the next implementation slice; do not start the next implementation slice until the verified commit exists. The map gate is … — `docs/shared-agent-server-plan.md:144`

**→ `docs/adr/README.md#active-decisions`** — 1 statement(s)

1. `P` **Concrete provider-version support is source inventory not established technology approval.** — Keep tasks, references, artifacts and user-only approval; fixed/configurable modes, profiles and task → project → user configuration; distinct same-mode conversations; OpenCode v1/v2 runtime … — `docs/shared-agent-server-plan.md:46`

**→ `docs/specs/tasks.md#task-deletion`** — 1 statement(s)

1. `G` **Sidecar-specific ordering must preserve execution cleanup and recovery evidence.** — Core owns exact all-mode association/marker/known-file removal under caller-held existing task/reference/admission locks, without reacquiring them. Clean exact owned sidecars/markers before … — `docs/shared-agent-server-plan.md:64`

**→ `docs/architecture/session-harness.md#runningexecution`** — 1 statement(s)

1. `G` **Exact old tmux result parsing requires verification without freezing the helper signature.** — - Use the AOE instance-owned tmux lifecycle, without a process-tree settlement gate or cross-instance native-ID exclusion. `SessionProcess.alive` retains its signature and classifies exit 0/stdout 0 … — `docs/shared-agent-server-plan.md:74`

**→ `docs/specs/sessions.md#observe-and-detach-from-a-live-session`** — 1 statement(s)

1. `G` **Retained dead-pane mechanics are not an approved presentation guarantee.** — Acceptance: no global native-ID alias rejection; preserved IDs and provider command correctness; natural exit into a retained pane, detach/reopen, and explicit resume; same-instance race permits one … — `docs/shared-agent-server-plan.md:81`

**→ `docs/specs/sessions.md#creation-failure-and-recovery`** — 1 statement(s)

1. `G` **Repeated and concurrent operation outcomes remain DEC-4.** — Acceptance: no global native-ID alias rejection; preserved IDs and provider command correctness; natural exit into a retained pane, detach/reopen, and explicit resume; same-instance race permits one … — `docs/shared-agent-server-plan.md:81`

**→ `docs/BLUEPRINT.md#observation-stop-and-deletion`** — 1 statement(s)

1. `P` **Missing target provenance remains an unresolved safety finding.** — - Earlier live fixtures still lack terminal provenance. Possible survivors remain unresolved; this plan authorizes no ad-hoc signals or cleanup. Do not perform ad-hoc live cleanup; the parent owns … — `docs/shared-agent-server-plan.md:148`

**→ `docs/CONVENTIONS.md#tooling-and-validation`** — 1 statement(s)

1. `G` **Retain scoped parent-only live acceptance authorization.** — - Earlier live fixtures still lack terminal provenance. Possible survivors remain unresolved; this plan authorizes no ad-hoc signals or cleanup. Do not perform ad-hoc live cleanup; the parent owns … — `docs/shared-agent-server-plan.md:148`
