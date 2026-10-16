# CLI and supported API surface

> **Working sheet — not a contract.** Answers are applied to the owning contracts and to each document's disposition markers.

**What this group is:** Which commands, aliases, options and integration operations are supported.

**Default:** Decide — supported surface.

**101 statements** — 34 P (proposal / unanswered) · 67 G (evidence or safety gate).

**Decision for this group:** `[ ] Discard all` · `[ ] Plan work (→ alignment plan, not a contract)` · `[ ] Amend a contract` · `[ ] Select individually` · `[ ] Narrow: ______`

Answers are per statement only if you choose "Select individually": `d` discard · `w` plan work · `a` amend the contract named · `?` keep open.

---

### from `docs/SPEC-unconfirmed.md` (12)

1. `G` **List and view entry points and exact invocation remain INV-1 decisions.** — | PRD-001 | Task creation, listing, and viewing are exposed as ordinary CLI commands without an agent-session argument. | Help: task --help, task create --help | Pending | | — `docs/SPEC-unconfirmed.md:42` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
2. `G` **Additional list and view CLI entry points remain INV-1.** — | TSK-003 | Tasks can be listed and their details viewed through the CLI. | Help: task --help — list, view | Pending | | — `docs/SPEC-unconfirmed.md:54` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
3. `G` **On-demand guidance command remains DEC-5.** — | CLI-002 | skill | Print the task-management skill. | Help: --help | Pending | | — `docs/SPEC-unconfirmed.md:117` · related: `docs/SPEC.md#open-product-decisions`
4. `G` **Default task command and output options are not an approved API contract.** — | CLI-003 | task [taskId] | Task entry point with --plain and --json options. | Help: task --help | Pending | | — `docs/SPEC-unconfirmed.md:118` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
5. `G` **Exact command syntax remains INV-1 where not settled by core.** — | CLI-004 | task create | Create a task. | Help: task create --help | Pending | | — `docs/SPEC-unconfirmed.md:119` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
6. `G` **Task-detail viewing command remains INV-1.** — | CLI-011 | task view | Display task details. | Help: task --help | Pending | | — `docs/SPEC-unconfirmed.md:123` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
7. `G` **Paging count versioning additional filters and unsettled syntax remain INV-1.** — | CLI-015 | search [query] | Search tasks/documents/decisions with filters and plain/JSON output. Paging, count, versioned JSON, and additional filter specifics remain unapproved. | Help: search … — `docs/SPEC-unconfirmed.md:125` · related: `docs/specs/filtering-and-search.md#filtering-and-search`
8. `G` **Shell-completion installation remains DEC-5.** — | CLI-045 | completion install | Install a shell-completion script. | Help: completion --help | Pending | | — `docs/SPEC-unconfirmed.md:133` · related: `docs/SPEC.md#open-product-decisions`
9. `G` **Named guidance API remains DEC-5.** — | CLI-046 | instructions [guide] [--list] | Print named workflow guides or the guide index. | Help: instructions --help | Pending | | — `docs/SPEC-unconfirmed.md:134` · related: `docs/SPEC.md#open-product-decisions`
10. `P` **Additional CLI stop entry point and targeting options remain INV-1.** — | CLI-050 | agent-session stop <taskId> [--session] | Stop the active or selected session. | Help: agent-session stop --help | Pending | | — `docs/SPEC-unconfirmed.md:138` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
11. `G` **Approved live attachment does not automatically approve a standalone CLI attachment command.** — | CLI-051 | agent-session attach <taskId> [--session] | Attach this terminal to a session. | Help: agent-session attach --help | Pending | | — `docs/SPEC-unconfirmed.md:139` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
12. `G` **Exact help command interface remains observed rather than expressly approved.** — | CLI-063 | help [command] | Display general or command-specific help. | Help: --help | Pending | | — `docs/SPEC-unconfirmed.md:146` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`

### from `docs/agent-handover.md` (2)

1. `G` **Historical query coercion and alias wire contract need retained API disposition.** — - Collection repeated/comma query coercion uses schema transforms; alias normalization preserves existing wire behavior. — `docs/agent-handover.md:101` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
2. `P` **Parser substitution is only a conditional proposal pending source-position fidelity evidence.** — A generic Markdown AST parser would not supply Backlog schema mapping, section aliases, checklist indices, marker validation, or minimal-diff writes. It could replace some syntax scanning if … — `docs/agent-handover.md:227` · related: `docs/CONVENTIONS.md#changes-and-refactoring`

### from `docs/agent-session-ownership-plan.md` (1)

1. `G` **Queue-specific foreign-owner rejection must remain until retained adoption paths and retirement are verified.** — - A marker whose pid is not this process, or is not alive, never launches a session. — `docs/agent-session-ownership-plan.md:79` · related: `docs/BLUEPRINT.md#architectural-invariants`

### from `docs/alignment-plan.md` (2)

1. `G` **ACT-10 help correction and all-caller behavior proof remain open.** — | ACT-10 · Action | Handoff | Inventory: installed handoff help says stop then start; availability observation CLI-054 does not verify ordering. | Correct help and verify all supported callers use … — `docs/alignment-plan.md:40` · related: `docs/SPEC.md#global-behavioral-invariants`
2. `G` **INV-1 exhaustive disposition and syntax verification are open finish conditions.** — **Finish:** Every retained inventory row is mapped to an approved contract, explicit owner decision, or evidence/reference destination; the public API has exact documented supported operations and … — `docs/alignment-plan.md:85` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`

### from `docs/aoe-lifecycle-comparison.md` (2)

1. `P` **Capture-file backoff adoption and relevance to the socket-stream target are unverified.** — | 8 | Fallback/existing capture polls the file every 250 ms (statSync) even with no new bytes | agent-host.ts:197-216,240-242; existing-agent-host.ts:82-85 | Back off timer on N consecutive 0-byte … — `docs/aoe-lifecycle-comparison.md:56` · related: `docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport`
2. `G` **One-read performance invariant needs current measurement and adoption confirmation.** — Also cheaper only because of prior work (keep, do not regress): one batched session read per refresh workspace-controller.ts:622-631 (was 85,547 reads / 3130 ms per refresh over 121 visible tasks). … — `docs/aoe-lifecycle-comparison.md:90` · related: `docs/architecture/application-boundaries.md#stores-and-repositories`

### from `docs/aoe-lifecycle-implementation-plan.md` (5)

1. `G` **Conditional selection-diff optimization has no demonstrated current adoption.** — **Decision:** no work. The residual per-selection cost is not rendering — it is the snapshot reload a selection change triggers (#viewState.subscribe → #scheduleRefresh, … — `docs/aoe-lifecycle-implementation-plan.md:125` · related: `docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host`
2. `G` **Capture backoff and its latency bound need adoption confirmation.** — | 8 | §3.1 (output liveness source) | **Adjacent** | The resolver consumes output liveness; the fallback capture poll feeds those bytes. Phase L6 must never delay *live* bytes (§3.6). | — `docs/aoe-lifecycle-implementation-plan.md:189` · related: `docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport`
3. `G` **Cadence optimization and absolute live-owner safety claim need runtime validation and adoption.** — **Deliverable.** An armed VT pane costs ~0.5 forks/s at idle instead of 1/s, and a live owner can no longer be declared stale by a racing process. — `docs/aoe-lifecycle-implementation-plan.md:324` · related: `docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport`
4. `G` **Capture-file backoff relevance and adoption remain unverified against socket streaming.** — **Deliverable.** The two 250 ms capture timers stop issuing an empty stat/fstat + read on every tick when nothing is arriving, while first-byte latency stays bounded. — `docs/aoe-lifecycle-implementation-plan.md:350` · related: `docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport`
5. `G` **Exact scan-count invariant needs current adoption and baseline evidence.** — | Refresh read (prior work, keep) | one batched session read per refresh, #taskSessions (workspace-controller.ts:861-869) — was 85,547 reads / 3130 ms over 121 visible tasks | L1 must keep it at … — `docs/aoe-lifecycle-implementation-plan.md:426` · related: `docs/architecture/application-boundaries.md#stores-and-repositories`

### from `docs/aoe-status-tracking-plan.md` (2)

1. `G` **Non-remounting presentation contract is useful but exact API and adoption are not settled by core.** — - Add a **non-remounting** update path: extend the mount with setActivity(readonly Map<string, AgentActivity>), which mutates the existing activeSessionTaskIds state (workspace.ts:94) and calls the … — `docs/aoe-status-tracking-plan.md:404` · related: `docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host`
2. `G` **Exact non-remounting update path needs adoption beyond source references.** — 1. Activity updates go through setActivity + redraw (workspace.ts:406), never a full #scheduleRefresh (workspace-controller.ts:379). — `docs/aoe-status-tracking-plan.md:483` · related: `docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host`

### from `docs/modes-delivery-plan.md` (1)

1. `G` **Retain B2 store path-release gate without reviving old lane.** — the store API. Keep it separate from sessions.ts service work. — `docs/modes-delivery-plan.md:251` · related: `docs/CONVENTIONS.md#general-principles`

### from `docs/opencode-migration.md` (4)

1. `G` **External project-ID inspection commands need current schema verification.** —  — `docs/opencode-migration.md:189`
2. `G` **Preserve writer-quiescence and failure stop gates while rollback validity remains unverified.** — If a check fails, quit OpenCode again and confirm it is not using the database. Roll back before starting another OpenCode session. The backup is a complete pre-migration clone of the database. These … — `docs/opencode-migration.md:227`
3. `G` **Copying only a live WAL database file does not establish a complete consistent backup.** — If a check fails, quit OpenCode again and confirm it is not using the database. Roll back before starting another OpenCode session. The backup is a complete pre-migration clone of the database. These … — `docs/opencode-migration.md:227`
4. `G` **Preserve reached-step precondition rather than authorize unconditional rollback.** — If a check fails, quit OpenCode again and confirm it is not using the database. Roll back before starting another OpenCode session. The backup is a complete pre-migration clone of the database. These … — `docs/opencode-migration.md:227`

### from `docs/opentui-workspace-behavior-matrix.md` (1)

1. `G` **Skill command awaits guidance API disposition.** — | Skill isolation | agentic-workspace skill prints requested body. Launches load temporary session-scoped skills, not global/project skill installations. | — `docs/opentui-workspace-behavior-matrix.md:42` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`

### from `docs/opentui-workspace-implementation-plan.md` (1)

1. `G` **Historical user-review stop gate requires evidence before retirement.** — Review with bun src/cli/index.ts workspace: Enter starts the agent, Space toggles details, Tab enters input, and Ctrl+Q returns to tasks. Stop here for user review. — `docs/opentui-workspace-implementation-plan.md:186`

### from `docs/opentui-workspace-session-contract.md` (3)

1. `G` **OMP isolated-loader prerequisite remains blocked pending verification.** — | OMP | Blocked: its documented --skills option filters discovered skills; it does not load a process-scoped skill path. | — `docs/opentui-workspace-session-contract.md:87` · related: `docs/architecture/session-harness.md#harness`
2. `G` **Codex isolated-loader prerequisite remains blocked pending verification.** — | Codex CLI 0.148.0 | Blocked: documented skill discovery uses repository, user, admin, or system locations, not a process-scoped directory. | — `docs/opentui-workspace-session-contract.md:88` · related: `docs/architecture/session-harness.md#harness`
3. `G` **Extra command surfaces require API disposition.** — - CLI session commands remain direct service callers for list, start, stop, attach, output, reconciliation, reset, and deletion (agent-workspace.ts). — `docs/opentui-workspace-session-contract.md:258` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`

### from `docs/opentui-workspace-spec.md` (1)

1. `P` **Unapproved compatibility surfaces are excluded.** — - Adding a second public workspace command or compatibility UI. — `docs/opentui-workspace-spec.md:81`

### from `docs/questionnaire-02.md` (16)

1. `G` **Core has a selective baseline and explicitly leaves the remaining inventory undecided.** — **Question:** Which command families belong in the product? — `docs/questionnaire-02.md:188` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
2. `G` **Exact setup command removal is unanswered in questionnaire 6.** — | init | Initialize a project. | | — `docs/questionnaire-02.md:194` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
3. `G` **This blank inventory row does not settle the exact command name.** — | workspace | Open the interactive workspace. | | — `docs/questionnaire-02.md:205` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
4. `G` **This blank row does not approve exact handoff CLI syntax.** — | agent-session handoff | Start a successor before retiring its predecessor. | | — `docs/questionnaire-02.md:208` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
5. `G` **Printable guidance entry points remain undecided.** — | skill, instructions, instructions --list | Print agent-facing skills and workflow guides. | | — `docs/questionnaire-02.md:212` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
6. `G` **Blank command-help inventory row has no explicit core API acceptance.** — | help | Show general or command-specific help. | | — `docs/questionnaire-02.md:215` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
7. `G` **Bare task command semantics are unanswered.** — **Question:** What should task, task <id>, draft, and draft <id> do? — `docs/questionnaire-02.md:220` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
8. `P` **CLI target disambiguation UX has no accepted answer.** — **Question:** What should a session command do when its target is ambiguous? — `docs/questionnaire-02.md:226` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
9. `G` **Generic replacement writes are accepted later but exact overwrite-consent UX is not specified.** — **Question:** Should these commands overwrite existing files automatically? — `docs/questionnaire-02.md:244` · related: `docs/specs/tasks.md#using-task-artifacts`
10. `G` **Noninteractive API behavior remains unanswered.** — **Question:** How should commands behave when no interactive terminal is available? — `docs/questionnaire-02.md:261` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
11. `P` **Blanket destructive confirmation rule is not approved.** — **Recommendation:** Confirm actions that kill agents or discard files, branches, or history, with the affected items stated. Scripts must provide deliberate consent. A force option may authorize … — `docs/questionnaire-02.md:267` · related: `docs/specs/tasks.md#requirements`
12. `G` **Script consent rule remains open.** — **Recommendation:** Confirm actions that kill agents or discard files, branches, or history, with the affected items stated. Scripts must provide deliberate consent. A force option may authorize … — `docs/questionnaire-02.md:267` · related: `docs/specs/tasks.md#requirements`
13. `G` **Cross-operation force scope is unanswered beyond the settled kill-before-session-removal behavior.** — **Recommendation:** Confirm actions that kill agents or discard files, branches, or history, with the affected items stated. Scripts must provide deliberate consent. A force option may authorize … — `docs/questionnaire-02.md:267` · related: `docs/specs/sessions.md#deleting-a-session`
14. `G` **General CLI output contract remains unanswered.** — **Question:** What common output contract should commands follow? — `docs/questionnaire-02.md:272` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
15. `P` **Common stdout/stderr separation proposal is unanswered.** — **Recommendation:** Put results on standard output and diagnostics on standard error. Return zero only for complete success and nonzero for errors, cancellation, or partial failure. Offer documented … — `docs/questionnaire-02.md:273` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
16. `P` **Blanket data-command JSON and screen exclusion are unapproved despite search-specific JSON acceptance.** — **Recommendation:** Put results on standard output and diagnostics on standard error. Return zero only for complete success and nonzero for errors, cancellation, or partial failure. Offer documented … — `docs/questionnaire-02.md:273` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`

### from `docs/questionnaire-06.md` (4)

1. `G` **No answer supplies a concrete integration or approves MCP removal.** — **Question:** Do you have an integration that needs MCP, or should we remove it and use the CLI API? — `docs/questionnaire-06.md:33` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
2. `P` **Retaining instructions is an unanswered API proposal.** — **Recommendation:** Retain instructions as concise API-use guidance, without prescribed plan/build/document workflows. Remove the separate skill entry point rather than maintain overlapping guidance … — `docs/questionnaire-06.md:40` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
3. `P` **Removing skill is an unanswered API proposal.** — **Recommendation:** Retain instructions as concise API-use guidance, without prescribed plan/build/document workflows. Remove the separate skill entry point rather than maintain overlapping guidance … — `docs/questionnaire-06.md:40` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
4. `P` **Specific removal and future-wizard disposition are unapproved.** — **Recommendation:** Remove it from the public CLI. It is an interactive setup convenience rather than a needed task API; any future setup assistance belongs in the TUI wizard. — `docs/questionnaire-06.md:46` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`

### from `docs/questionnaire-07.md` (2)

1. `P` **Eligibility option was not answered.** — - **A — Stopped only:** running sessions cannot be consulted through ask, even when idle. — `docs/questionnaire-07.md:24`
2. `P` **Eligibility option was not answered.** — - **C — Also working sessions:** support asking during ongoing work; interruption versus queuing would need a separate decision. — `docs/questionnaire-07.md:26`

### from `docs/research-requirements-documentation.md` (1)

1. `G` **Safety constraints remain approved and the session contract retains both named invariants.** — Negative requirements are legitimate when they constrain an unsafe or unwanted outcome: e.g. “uncertain liveness evidence does not authorize stopping an agent” or “deleting a running session is … — `docs/research-requirements-documentation.md:37`

### from `docs/shared-agent-runtime-handoff.md` (1)

1. `G` **These upstream equivalence claims lack proof.** — - AoE audits pin 563456d8a05eddd2e09628de151d15a0e16b183e and inspect the noted current-head stop delta at 98a0ba1f035096491e2770c49e9f6ae816a93b83. Full UI activation-chain and CLI/UI backend … — `docs/shared-agent-runtime-handoff.md:68` · related: `docs/CONVENTIONS.md#testing`

### from `docs/shared-agent-runtime-simplification.md` (1)

1. `G` **Exact queued-adoption and retry outcome needs reconciliation with DEC-4.** — - Prove the shared flow with a live STARTING reconciliation that never kills, transient preflight errors that leave state/runtime unchanged, different requester/controller PIDs, and a queued … — `docs/shared-agent-runtime-simplification.md:44` · related: `docs/specs/sessions.md#creation-failure-and-recovery`

### from `docs/shared-agent-server-plan.md` (1)

1. `G` **Exact ask timeout streaming and partial-output guarantees need supported-contract disposition.** — - CLI/headless execution uses the same shared runtime and persistent lifetime. History/output reads start no infrastructure. Ask retains its existing stopped-only, noninteractive timeout, … — `docs/shared-agent-server-plan.md:42` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`

### from `docs/storage-review-sessions.md` (1)

1. `P` **Proposed archival option needs completeness and restoration acceptance.** — | Native transcript export + zstd + summary index | Exact for exported bytes only; referenced external files require separate capture | OpenCode import is available but partial-state; Claude text … — `docs/storage-review-sessions.md:162`

### from `docs/test-suite-improvement-report.md` (1)

1. `G` **Exact historical offline/editor API and platform obligations need retained-surface review.** — | Git/offline/local-only/runtime/editor/packaging | Real temporary Git where required, process-boundary denial of remote work, canonical runtime cwd, input handoff, package resolution/platform … — `docs/test-suite-improvement-report.md:333` · related: `docs/SPEC.md#open-product-decisions`

### from `docs/test-suite-runtime-report.md` (1)

1. `P` **Later F7 remediation challenges fixed absence waits so these exact waits are not established requirements.** — - cli-json-watch: 1300 ms debounce and 1100 ms liveness waits on a real interval. — `docs/test-suite-runtime-report.md:183` · related: `docs/CONVENTIONS.md#testing`

### from `docs/tmux-call-sites.md` (8)

1. `P` **Preserve unused-timeout verification gate before expanding proposed API.** — **No call site in this file passes options** — verify before assuming a wrapper must support it. — `docs/tmux-call-sites.md:66`
2. `G` **Diagnostic allowlist necessity and temporary log policy need current disposition.** — 4-subcommand allowlist; migrating subcommands off require() silently kills the log. — `docs/tmux-call-sites.md:93`
3. `G` **remain-on-exit concerns process exit and does not alone establish client-independent lifetime.** — | 3 | 358-359 | set-option -w -t <target> remain-on-exit on | ensureHostUnlocked | void | same loop, **2 executions**; remain-on-exit is what makes panes outlive the client | — `docs/tmux-call-sites.md:155` · related: `docs/specs/sessions.md#observe-and-detach-from-a-live-session`
4. `G` **Destructive UI respawn requires exact role and owned-pane evidence.** — | 21 | 600-601 | respawn-pane -k -t <pane> -c <rootPath> <workspaceCommand> | launchUi | void | command string built by workspaceCommand() :180; -k kills the existing process | — `docs/tmux-call-sites.md:173` · related: `docs/BLUEPRINT.md#observation-stop-and-deletion`
5. `G` **Preserve cross-process zoom race finding pending verification.** — | 24 | 625-631 | display-message -p -t <WORKSPACE_WINDOW> #{window_zoomed_flag} | zoomed | **read** exitCode===0 && stdout.trim()==="1" | 🔴 **raced against by resize-pane -Z at :865/:868** | — `docs/tmux-call-sites.md:176`
6. `G` **Failed query and missing option need distinction verification.** — | :699 | option: exitCode === 0 && stdout.trim() else undefined | — `docs/tmux-call-sites.md:271`
7. `G` **Preserve embedded-command and format-escaping safeguard pending exact boundary verification.** — corrupt them. — `docs/tmux-call-sites.md:297`
8. `G` **Claimed carriage-return result contradicts enter-false example and companion spec rationale.** — > regression would only surface by hand. Adding an explicit Enter flag here has the same effect. — `docs/tmux-call-sites.md:309`

### from `docs/tmux-layer-spec.md` (27)

1. `G` **Claimed 54 sites versus 50 arrays plus 2 spawns does not establish 56 concrete invocations and conflicts with companion inventory.** — run() at all. Any index below that reports a site count should use 56. — `docs/tmux-layer-spec.md:28`
2. `G` **Preserve flag-semantics safeguard pending current call-site verification.** — (§1–§5). Any layer that "normalises" flags changes runtime behaviour. — `docs/tmux-layer-spec.md:51`
3. `P` **Proposed signals-keys.ts mixes terminal commands and process effects without approved ownership.** —  — `docs/tmux-layer-spec.md:91` · related: `docs/BLUEPRINT.md#component-ownership`
4. `G` **Claimed dependency and throw ownership reference nonexistent section 1.4 and conflict with option execution methods.** — decides throw-vs-return, which is what §1.4 requires). — `docs/tmux-layer-spec.md:112`
5. `G` **Preserve no-added-Enter distinction pending library and CLI comparison.** — default behaviour. — `docs/tmux-layer-spec.md:151`
6. `P` **Exact wrapper API prohibition is part of an unapproved extraction.** — > parameter to the layer's method. — `docs/tmux-layer-spec.md:154` · related: `docs/BLUEPRINT.md#component-ownership`
7. `P` **Proposed error semantics and line mapping require verification.** — | command() :665 | exitCode !== 0 → throw | throws | — `docs/tmux-layer-spec.md:200`
8. `G` **Treating every failure as unset needs contract verification.** — | option() :669 | exitCode === 0 && stdout.trim() → value, else undefined | returns string \| undefined | — `docs/tmux-layer-spec.md:201`
9. `P` **Proposed common executor injection and replacement scope are unapproved.** — Injected into every other module. Replaces run/require/command (:757, :776, :674). — `docs/tmux-layer-spec.md:259` · related: `docs/BLUEPRINT.md#component-ownership`
10. `P` **Proposed conditional command argv needs verification.** — | ifShell | ["if-shell", "-t", session, "-F", format, command] (:1042) | — `docs/tmux-layer-spec.md:306`
11. `G` **Preserve single-argument shell command boundary pending exact command verification.** — element. Do not add a .split(" "). — `docs/tmux-layer-spec.md:310`
12. `P` **Proposed listing and error semantics need verification.** — | listWindows | ["list-windows", "-t", session, "-F", "#{window_id}"] → command() semantics (throws on non-zero, returns stdout) | :850 | — `docs/tmux-layer-spec.md:330`
13. `G` **Destructive respawn needs verified ownership and preserved command argument boundary.** — | respawnPane | ["respawn-pane", "-k", "-t", target, "-c", cwd, command] | -k kills the existing process. command is the **entire** workspaceCommand(…) shell string as one argv element — do not … — `docs/tmux-layer-spec.md:366` · related: `docs/BLUEPRINT.md#observation-stop-and-deletion`
14. `P` **showOption signature is proposed.** —  — `docs/tmux-layer-spec.md:381` · related: `docs/BLUEPRINT.md#component-ownership`
15. `P` **setOption signature is proposed.** —  — `docs/tmux-layer-spec.md:382` · related: `docs/BLUEPRINT.md#component-ownership`
16. `P` **unsetOption signature is proposed.** —  — `docs/tmux-layer-spec.md:383` · related: `docs/BLUEPRINT.md#component-ownership`
17. `P` **setWindowOption signature is proposed and only four methods are listed under five-method heading.** —  — `docs/tmux-layer-spec.md:384` · related: `docs/BLUEPRINT.md#component-ownership`
18. `P` **Proposed missing-option versus failed-query semantics need verification.** — | showOption (session) | ["show-options", "-qv", "-t", session, name] | -q **quiet** (missing option is not an error), -v **value only**, -t target session. Returns undefined when exitCode !== 0 or … — `docs/tmux-layer-spec.md:388`
19. `P` **Proposed global-prefix fallback and byte-order requirement are unapproved.** — | showOption (global, prefix) | ["show-options", "-gv", "prefix"] | -g **global**, -v value. Returns "C-b" when exitCode !== 0 or empty. Site :838. -gv order is as emitted today; do not reorder to … — `docs/tmux-layer-spec.md:389`
20. `P` **Proposed session-option argv requires source verification.** — | setOption | ["set-option", "-t", session, name, value] | plain set. Sites :281, :354–:364, :394, :986, :1006. | — `docs/tmux-layer-spec.md:390`
21. `G` **Preserve repeat-safe unset safeguard pending verification.** — | unsetOption | ["set-option", "-qu", "-t", session, name] | **-qu = quiet + unset.** §2.1. Site :845. | — `docs/tmux-layer-spec.md:391`
22. `P` **Proposed window-option scope needs verification.** — | setWindowOption | ["set-option", "-w", "-t", target, name, value] | -w window scope. automatic-rename off, remain-on-exit on. Sites :387, :392, :438. | — `docs/tmux-layer-spec.md:392`
23. `P` **Proposed distinct option methods conflict with the shown multi-scope showOption bag.** — accidentally drop -q. — `docs/tmux-layer-spec.md:397` · related: `docs/BLUEPRINT.md#component-ownership`
24. `P` **Proposed write-error semantics rely on historical source inventory.** — setOption is require-semantics (throws) — every current site is a require site. — `docs/tmux-layer-spec.md:399`
25. `P` **Proposed read-result semantics need source verification.** — showOption is value-semantics — every current site branches. — `docs/tmux-layer-spec.md:400`
26. `P` **bindKey signature is proposed and string command conflicts with spread argv example.** —  — `docs/tmux-layer-spec.md:412` · related: `docs/BLUEPRINT.md#component-ownership`
27. `G` **String signature versus argument-list spreading is inconsistent.** — | bindKey | ["bind-key", "-T", table, key, …command] | switch-client case emits ["bind-key", "-T", table, prefix, "switch-client", "-T", "prefix"] (:399) — command **and its args** are separate argv … — `docs/tmux-layer-spec.md:421`

