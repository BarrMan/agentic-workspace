# Session recovery, receipts and detach

> **Working sheet — not a contract.** Answers are applied to the owning contracts and to each document's disposition markers.

**What this group is:** How sessions survive interruption: receipts, resume, in-flight input, detach and drain semantics.

**Default:** Decide — product-visible behavior.

**70 statements** — 19 P (proposal / unanswered) · 51 G (evidence or safety gate).

**Decision for this group:** `[ ] Discard all` · `[ ] Plan work (→ alignment plan, not a contract)` · `[ ] Amend a contract` · `[ ] Select individually` · `[ ] Narrow: ______`

Answers are per statement only if you choose "Select individually": `d` discard · `w` plan work · `a` amend the contract named · `?` keep open.

---

### from `docs/BACK-728-handoff.md` (1)

1. `P` **Batching mechanism is a spike recommendation rather than approved input transport.** — loop. Batch into a single send-keys -l. — `docs/BACK-728-handoff.md:311` · related: `docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host`

### from `docs/IMPACT_LATEST.md` (4)

1. `P` **Exact receipt-resolution check design is not established by the current persistence contract.** — configuration; add receipt-resolution and pending-journal rejection checks. — `docs/IMPACT_LATEST.md:28` · related: `docs/architecture/application-boundaries.md#stores-and-repositories`
2. `G` **Pending-journal rejection behavior needs recovery-policy disposition.** — configuration; add receipt-resolution and pending-journal rejection checks. — `docs/IMPACT_LATEST.md:28` · related: `docs/specs/configuration.md#delete-a-mode`
3. `P` **Configuration-only receipt injection is an unapproved implementation recommendation.** — resolve concrete adapters at execution; reject moving mode-deletion journals unchanged. — `docs/IMPACT_LATEST.md:35` · related: `docs/architecture/application-boundaries.md#stores-and-repositories`
4. `P` **Moving-journal rejection and recovery disposition are not approved.** — resolve concrete adapters at execution; reject moving mode-deletion journals unchanged. — `docs/IMPACT_LATEST.md:35` · related: `docs/specs/configuration.md#delete-a-mode`

### from `docs/SPEC-unconfirmed.md` (1)

1. `G` **Exact path-specific error presentation is source evidence rather than settled wording.** — | WRK-004 | Resume preparation rejects a missing recorded working directory with a path-specific error. This is narrower than a guarantee that every failed worktree request blocks every launch. | … — `docs/SPEC-unconfirmed.md:63` · related: `docs/specs/sessions.md#stop-and-resume-a-session`

### from `docs/agent-session-ownership-plan.md` (3)

1. `G` **Slice c protection against resuming never-launched reservations needs recovery-policy disposition.** — **Slices:** (a) reuse settleDeadSessions; (b) make the startup sweep cover tasks the user has not selected — a pending STARTING record blocks a new session for its task until reconciled … — `docs/agent-session-ownership-plan.md:107` · related: `docs/specs/sessions.md#creation-failure-and-recovery`
2. `G` **Historical PID guard cannot be retired without mapping exact execution ownership protection to the shared runtime.** — 6. **A record owned by another live pid is never adopted or resumed** (sessions.ts:129-134 semantics stay, relaxed only for self). — `docs/agent-session-ownership-plan.md:133` · related: `docs/BLUEPRINT.md#architectural-invariants`
3. `P` **Queued adoption liveness and recovery disposition are not established by core synchronous failure rules.** — 2. **Adoption is workspace-view only.** The request timer only launches while the workspace view is mounted; a request registered from board view waits for the view to return. The marker survives, so … — `docs/agent-session-ownership-plan.md:164` · related: `docs/specs/sessions.md#creation-failure-and-recovery`

### from `docs/alignment-plan.md` (8)

1. `G` **ACT-7 all-operation implementation verification remains open.** — | ACT-7 · Action | Field precedence | Inventory: resolveAgentConfiguration / projectOrParent in src/agent-workspace/config.ts choose a whole scope instead of consistent field precedence. | Apply root … — `docs/alignment-plan.md:37` · related: `docs/SPEC.md#global-behavioral-invariants`
2. `G` **ACT-17 fallback removal and guidance reconciliation remain open.** — | ACT-17 · Action | Exact resume | shared-agent-runtime-handoff.md says failed saved-ID resume may fall back to a fresh session; current SPEC and redesign require exact identity. | Reconcile the … — `docs/alignment-plan.md:47` · related: `docs/SPEC.md#global-behavioral-invariants`
3. `G` **DEC-2 destination collision policy remains open.** — **Decide:** Destination collision handling, partial-copy/move failure, interruption/recovery, when configured authority changes, and concurrent readers/writers or sessions during relocation. No … — `docs/alignment-plan.md:115` · related: `docs/specs/tasks.md#changing-the-storage-location`
4. `G` **DEC-2 partial failure and interruption recovery remain open.** — **Decide:** Destination collision handling, partial-copy/move failure, interruption/recovery, when configured authority changes, and concurrent readers/writers or sessions during relocation. No … — `docs/alignment-plan.md:115` · related: `docs/specs/tasks.md#changing-the-storage-location`
5. `G` **DEC-2 authority-switch timing remains open.** — **Decide:** Destination collision handling, partial-copy/move failure, interruption/recovery, when configured authority changes, and concurrent readers/writers or sessions during relocation. No … — `docs/alignment-plan.md:115` · related: `docs/specs/tasks.md#changing-the-storage-location`
6. `G` **DEC-2 concurrent access policy remains open.** — **Decide:** Destination collision handling, partial-copy/move failure, interruption/recovery, when configured authority changes, and concurrent readers/writers or sessions during relocation. No … — `docs/alignment-plan.md:115` · related: `docs/specs/tasks.md#changing-the-storage-location`
7. `G` **DEC-3 completion awaits explicit scope and recovery decisions with safeguards retained.** — **Finish:** Approved scope and degraded-operation outcomes replace the open boundaries without weakening confirmed constraints. — `docs/alignment-plan.md:127` · related: `docs/SPEC.md#open-product-decisions`
8. `G` **DEC-4 provenance and owner decisions remain open finish work.** — **Finish:** Every claimed recovery behavior has approved provenance, and remaining choices have concrete owner-approved outcomes. No general rollback/resume promise is inferred from one failure case. — `docs/alignment-plan.md:137` · related: `docs/SPEC.md#open-product-decisions`

### from `docs/aoe-agent-workspace-reference.md` (1)

1. `P` **Functional-probe prescription remains an unapproved transport recommendation.** — Capability-probe functionally instead. — `docs/aoe-agent-workspace-reference.md:652` · related: `docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport`

### from `docs/aoe-functionality-map.md` (1)

1. `G` **Reference evidence is not approval or implementation authorization.** — not artifact approval, and not a green-light to resume Backlog implementation. — `docs/aoe-functionality-map.md:22`

### from `docs/aoe-lifecycle-comparison.md` (1)

1. `G` **Rejection rationale for external daemon technology is not an approved core decision.** — | ACP daemon + structured session feed + tracing session tee | src/main.rs#L100-L165, src/acp/session_tee.rs#L1-L115 | Different product surface; adds a supervised process + transport for zero … — `docs/aoe-lifecycle-comparison.md:69` · related: `docs/BLUEPRINT.md#component-ownership`

### from `docs/aoe-lifecycle-implementation-plan.md` (3)

1. `G` **Retain bounded-latency and final-byte proof gate pending current isolated transport verification.** — **Review evidence.** Attach to a CLI-owned session, leave it idle for 60 s, and read capture.idle in the log sink: emptyTicks grows while cadenceMs caps at 500. Then type into the attached pane and … — `docs/aoe-lifecycle-implementation-plan.md:361` · related: `docs/CONVENTIONS.md#testing`
2. `G` **Phase transport acceptance remains unverified.** — **Stop condition.** Idle ticks back off and cap; typed input still echoes within ~1 s; teardown still flushes. — `docs/aoe-lifecycle-implementation-plan.md:371` · related: `docs/CONVENTIONS.md#testing`
3. `G` **External technology rejection rationale lacks an effective core decision.** — | ACP daemon + structured session feed + tracing session tee | src/main.rs#L100-L165, src/acp/session_tee.rs#L1-L115 | Different product surface; adds a supervised process and transport for no … — `docs/aoe-lifecycle-implementation-plan.md:385` · related: `docs/BLUEPRINT.md#component-ownership`

### from `docs/app-directory-map.md` (1)

1. `G` **Directory recreation must not imply retained conversations or recovery evidence are disposable or reconstructible. The blanket transient-state characterization needs qualification.** — Nothing below appears in the tree above: each path is recreated by the process that owns it, and none of it is repository content. — `docs/app-directory-map.md:748` · related: `docs/BLUEPRINT.md#durable-conversation-and-operation-records`

### from `docs/footer-search-recovery-handover.md` (2)

1. `G` **Recovery authorization remains bounded and needs agreement before destructive continuation.** — The previous agent stopped implementation after acknowledging those failures. No repairs were made while writing this document. Current operational mode permits changes, but agree on the narrow … — `docs/footer-search-recovery-handover.md:24` · related: `docs/CONVENTIONS.md#general-principles`
2. `G` **Agent-only mutation/recovery safeguard needs explicit disposition and is not repealed by user-editable files.** — b3b4a050 is a recovery reference for original task content; inspect it before deciding what to restore. Repository policy forbids manually editing task Markdown: use the documented product … — `docs/footer-search-recovery-handover.md:62` · related: `docs/CONVENTIONS.md#changes-and-refactoring`

### from `docs/handoff.md` (1)

1. `P` **Runtime and resume proof completion is not established by this mapping.** — 4. Then the canonical checkpoint's own work: shared-runtime slice I steps 5–6 and resume-policy phase 4 — see shared-agent-runtime-handoff.md. — `docs/handoff.md:88`

### from `docs/modes-phase1-contract.md` (2)

1. `G` **Default and deleted-mode selection recovery is unresolved.** — agentic-workspace workspace and interactive board entry require a valid catalog in the exact project configuration. Missing project configuration or missing modes fails before terminal acquisition or … — `docs/modes-phase1-contract.md:35` · related: `docs/specs/configuration.md#delete-a-mode`
2. `G` **Current settings shell specifies categories and content rather than this mode-specific two-pane layout.** — Task rows show a right-aligned selected mode label and an independent approval checkmark for its configured indicator artifact. Tab cycles modes without launching/resuming; Enter creates/resumes only … — `docs/modes-phase1-contract.md:45` · related: `docs/screens/settings.md#contents-and-order`

### from `docs/opencode-migration.md` (3)

1. `P` **Whole migration recipe needs verified backup consistency target ownership writer quiescence schema and recovery before reuse.** —  — `docs/opencode-migration.md:143` · related: `docs/CONVENTIONS.md#changes-and-refactoring`
2. `G` **Preserve user-visible session recovery verification pending safe migration applicability.** — 5. Start a **new** OpenCode session from /Users/imribarr/Projects/agentic-workspace. Confirm this project opens under the new absolute path and its existing sessions are listed. Do not delete the … — `docs/opencode-migration.md:223`
3. `G` **Preserve failure-recovery gate but snapshot validity and partial filesystem effects need verification.** — - **Sessions are missing:** Check that project.worktree equals the new project path and that session.directory and session_v2.directory no longer contain the old project path. Use the read-only SQL … — `docs/opencode-migration.md:273`

### from `docs/opentui-workspace-behavior-matrix.md` (1)

1. `P` **Exact s binding is not established.** — | Session picker | s lists task sessions newest first, marks active, and selects or resumes exact native conversation. | — `docs/opentui-workspace-behavior-matrix.md:39` · related: `docs/screens/sessions-artifacts.md#focus-and-constrained-terminals`

### from `docs/opentui-workspace-session-contract.md` (5)

1. `P` **Marker-adoption missing/live/dead runtime recovery policy and timing are not approved automatic recovery.** — - agentic-workspace agent-session start with a validated pane context registers a nativeWorkspace session record and request marker under <root>/.agentic-workspace/agent-requests/, and launches … — `docs/opentui-workspace-session-contract.md:40` · related: `docs/specs/sessions.md#creation-failure-and-recovery`
2. `G` **Pending-request cancellation policy depends on unresolved creation recovery.** — - Stopping a never-launched pending record cancels the request and removes its marker. — `docs/opentui-workspace-session-contract.md:43` · related: `docs/specs/sessions.md#creation-failure-and-recovery`
3. `G` **Existing moving-deletion journals need explicit recovery disposition and must remain untouched.** — - A session's fixed mode is its owning nested history. Execution uses that mode's current profile. A mode with sessions cannot be deleted or merged into another mode. Existing moving mode-deletion … — `docs/opentui-workspace-session-contract.md:60` · related: `docs/specs/configuration.md#delete-a-mode`
4. `G` **Antigravity isolated loading and exact resume remain unverified prerequisites.** — | Antigravity | Blocked: no installed executable or verified session-scoped loader/exact-resume interface on this workstation. | — `docs/opentui-workspace-session-contract.md:90` · related: `docs/architecture/session-harness.md#harness`
5. `P` **Automatic abandoned-start and dead-active recovery is not approved.** — A dead non-active session becomes stopped. An abandoned starting session becomes failed; both release an active pointer when applicable. A dead active session is resumed first; failure to resume … — `docs/opentui-workspace-session-contract.md:208` · related: `docs/specs/sessions.md#creation-failure-and-recovery`

### from `docs/pending-decisions.md` (3)

1. `G` **Durable v1 receipt necessity remains implementation evidence to verify.** — | 2 session-identity refactor | option (i): adapters own proposed identity, one ownership-checked publisher, receipts kept for OpenCode v1 | steps 1–4 implemented and the receipt-waiting flag … — `docs/pending-decisions.md:29` · related: `docs/BLUEPRINT.md#open-design-decisions`
2. `G` **Preserve recovery-evidence removal gate until replacement is verified.** — - **(ii) Full end state.** Also delete durable receipt transport — not honest yet; nothing verified replaces its recovery function. — `docs/pending-decisions.md:79` · related: `docs/BLUEPRINT.md#durable-conversation-and-operation-records`
3. `G` **Do not erase receipt recovery evidence without verified replacement.** — **Recommendation: (i), at low urgency.** Nothing is broken in a way users can hit right now; this is design debt that will keep costing every time an adapter is added. Do not pick (ii). — `docs/pending-decisions.md:83` · related: `docs/BLUEPRINT.md#durable-conversation-and-operation-records`

### from `docs/questionnaire-02.md` (6)

1. `P` **Proposed removal of the park action/name is unanswered.** — **Recommendation:** No. Stop the execution while retaining the conversation; offer resume when that conversation can be resumed. Avoid a second name for the same behavior. — `docs/questionnaire-02.md:73` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`
2. `P` **Reopening auto-resume policy is not answered and client survival alone does not decide it.** — **Question:** Should reopening the workspace also restart stopped agents automatically? — `docs/questionnaire-02.md:78` · related: `docs/specs/sessions.md#observe-and-detach-from-a-live-session`
3. `P` **Blanket no-auto-resume-on-reopen recommendation is unanswered.** — **Recommendation:** No. Reconnect to existing executions, but require an explicit resume action for stopped ones. — `docs/questionnaire-02.md:79` · related: `docs/specs/sessions.md#stop-and-resume-a-session`
4. `G` **Automatic ask-resume consent is explicitly unsettled.** — **Question:** Should agent-session ask resume that conversation automatically? — `docs/questionnaire-02.md:232` · related: `docs/BLUEPRINT.md#open-design-decisions`
5. `G` **Resume consent policy is unanswered.** — **Recommendation:** Require explicit agreement to resume a stopped conversation. If resumed, send the question to that exact conversation and show how to attach; do not invent a stored-output … — `docs/questionnaire-02.md:233` · related: `docs/BLUEPRINT.md#open-design-decisions`
6. `G` **Showing attach guidance after ask is unanswered.** — **Recommendation:** Require explicit agreement to resume a stopped conversation. If resumed, send the question to that exact conversation and show how to attach; do not invent a stored-output … — `docs/questionnaire-02.md:233` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`

### from `docs/questionnaire-07.md` (2)

1. `P` **Resume-consent option was not answered.** — - **A — Yes:** the explicit ask request authorizes starting the retained conversation to answer, using current effective configuration. — `docs/questionnaire-07.md:34`
2. `P` **Resume-consent option was not answered.** — - **B — Separate opt-in:** require explicit permission to resume before starting execution. Without it, explain what is needed rather than resuming automatically. — `docs/questionnaire-07.md:35`

### from `docs/shared-agent-runtime-handoff.md` (2)

1. `G` **External evidence cannot establish product acceptance.** — | Pinned AoE deletion audit, completion/resume audit, research index | Bounded upstream source evidence and applicability limits, not Backlog acceptance | — `docs/shared-agent-runtime-handoff.md:40`
2. `G` **Current-model capture with inherited context still needs runtime evidence.** — - IMPLEMENTED — conversation guard removed, replacing the previously open mode-model.ts decision: the guard that rejected conversation-bearing workspace contexts is gone … — `docs/shared-agent-runtime-handoff.md:70` · related: `docs/specs/supported-integration-operations.md#supported-integration-operations`

### from `docs/shared-agent-runtime-simplification.md` (1)

1. `G` **Upstream activation and backend equivalence lack verification.** — - Pinned-start/resume evidence in the natural-completion/resume audit supports instance-owned live/dead/start-skip/outgoing-teardown behavior. Full AOE UI activation-chain and CLI/UI backend … — `docs/shared-agent-runtime-simplification.md:46` · related: `docs/CONVENTIONS.md#testing`

### from `docs/storage-review-downloads.md` (1)

1. `G` **Ownership, backup and duplicate-verification gate unresolved.** — - **Preserve photos, Characters assets, MyAirBridge shares and all archives** until their ownership, unique contents and independent backup have been verified. Characters / Characters-Copy is an … — `docs/storage-review-downloads.md:294`

### from `docs/storage-review-gvm.md` (2)

1. `G` **Compiler compatibility and private-module recovery gates remain unresolved.** — A go directive is a minimum version; a toolchain directive suggests a toolchain rather than pinning an exact exclusive version. The active 1.27.0 satisfies these declared minimums. This does **not** … — `docs/storage-review-gvm.md:121`
2. `G` **External local-replacement preservation gate requires owner review.** — A go directive is a minimum version; a toolchain directive suggests a toolchain rather than pinning an exact exclusive version. The active 1.27.0 satisfies these declared minimums. This does **not** … — `docs/storage-review-gvm.md:121`

### from `docs/storage-review-sessions.md` (2)

1. `G` **Product exact conversation resume does not approve byte-exact external archive acceptance criteria.** — Use native context compaction for inexpensive continuation, and a separate lossless archive plus searchable summaries for durable exact retrieval. Do not replace originals with summaries. A lossy … — `docs/storage-review-sessions.md:21` · related: `docs/specs/sessions.md#stop-and-resume-a-session`
2. `G` **Credential archival privacy and recovery policy requires a decision.** — 3. Preserve unsanitized originals and required attachments, subagents, spilled outputs, snapshots, instruction/session state, plus a version/schema/path manifest. Keep credentials out of general … — `docs/storage-review-sessions.md:173`

### from `docs/test-suite-improvement-report.md` (8)

1. `G` **Preserve admission safety checks while exact concurrent deletion and retry outcomes remain open.** — **Preserve:** at least one writer succeeds; failed writers fail loudly and contribute no labels; every successful writer's label survives; deletion locks prevent all competing session admission … — `docs/test-suite-improvement-report.md:211` · related: `docs/specs/tasks.md#edge-cases-and-failures`
2. `G` **Exact legacy filter and retained transport obligations need current contract reconciliation.** — **Preserve:** independent expected IDs, legacy untyped exclusions, OR/casing/composed filters, transport schemas, local-only behavior, and malformed-input errors. Two surfaces agreeing can both be … — `docs/test-suite-improvement-report.md:241`
3. `G` **Reconcile terminal-proof deletion gate with later disposable-scratch policy without losing ownership evidence.** — **Preserve:** unknown/survivor means nonzero outcome plus retained evidence; no TMPDIR deletion before terminal proof; no launch after closed admission; bounded capture; concurrent settlement … — `docs/test-suite-improvement-report.md:251` · related: `docs/CONVENTIONS.md#error-handling`
4. `G` **Historical concurrent settlement guarantee needs current owner confirmation.** — **Preserve:** unknown/survivor means nonzero outcome plus retained evidence; no TMPDIR deletion before terminal proof; no launch after closed admission; bounded capture; concurrent settlement … — `docs/test-suite-improvement-report.md:251` · related: `docs/CONVENTIONS.md#error-handling`
5. `G` **Preserve exact owned-process authentication gate pending replacement of retired ledger machinery.** — **Preserve:** unknown/survivor means nonzero outcome plus retained evidence; no TMPDIR deletion before terminal proof; no launch after closed admission; bounded capture; concurrent settlement … — `docs/test-suite-improvement-report.md:251` · related: `docs/CONVENTIONS.md#testing`
6. `P` **Transactional failure no-partial-move and idempotent retry promises are not approved general outcomes.** — | Core/mutation/create/edit/delete/container/draft | Locked mutation, transactional failure, opaque data preservation, admission exclusion, no partial moves, idempotent retries | — `docs/test-suite-improvement-report.md:326` · related: `docs/specs/tasks.md#task-deletion`
7. `G` **Exact queued STARTING rule requires current observation and recovery reconciliation.** — | Queued request + absent pane is STARTING | Present in shared-runtime observation case | Named isolated case, independent of obsolete backend flag semantics | — `docs/test-suite-improvement-report.md:359` · related: `docs/specs/sessions.md#sessions`
8. `G` **Exact deletion-race outcomes remain open while admission safety must be preserved.** — | Deletes cannot admit concurrent session work | Present in task-delete with four admission routes | Guarantee gate release/drain; route parameterization with no process calls | — `docs/test-suite-improvement-report.md:365` · related: `docs/specs/tasks.md#edge-cases-and-failures`

### from `docs/tmux-call-sites.md` (1)

1. `G` **Blanket failure-as-unset claim needs absent-option versus transport-error verification.** — | 30 | 699 | show-options -qv -t <session> <key> | option | **read** exitCode===0 && stdout.trim() → string\|undefined | -qv = quiet+value; **non-zero is not an error, means "unset"** | — `docs/tmux-call-sites.md:182`

### from `docs/tmux-layer-spec.md` (4)

1. `P` **Proposed swap flag semantics and short-circuit need verification.** — | swapPane | ["swap-pane", "-d", source === target ? skip : …] — always ["swap-pane", "-d", "-s", source, "-t", target] | -d detaches the source after swapping. Callers keep the if (source === … — `docs/tmux-layer-spec.md:362`
2. `P` **detachClient signature is proposed.** —  — `docs/tmux-layer-spec.md:460` · related: `docs/BLUEPRINT.md#component-ownership`
3. `G` **Missing-option versus transport-failure distinction is unspecified.** — | 12 | showOption missing | non-zero exit → undefined | — `docs/tmux-layer-spec.md:493`
4. `G` **Adapter example uses undefined absence classifier and must not swallow transport failures.** —  — `docs/tmux-layer-spec.md:553` · related: `docs/BLUEPRINT.md#observation-stop-and-deletion`

