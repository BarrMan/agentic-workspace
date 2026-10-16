# Decision sheet — OpenTUI workspace and handoffs

> **Non-authoritative working sheet.** Not a contract. Answers here are applied to the owning contracts and to each document's disposition markers.

Each group below is one document. Decide the group as a whole, select statements individually, or write a narrowing instruction.

- Group box: `[ ] Discard all` · `[ ] Approve all (integrate)` · `[ ] Select individually` · `[ ] Narrow further: ______`
- Per statement (only if selecting individually): `d` discard · `i` integrate · `?` still open.
- Class tag: `P` = proposal / unanswered claim (a policy answer can retire it) · `G` = evidence or safety gate (needs evidence, not a decision).

Family total: **253** statements — 68 P · 185 G.

## G1 · BACK-728 — Handoff Document

**Document:** `docs/BACK-728-handoff.md` · **28 statements** — 18 P · 10 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/adr/README.md#active-decisions`** — 14 statement(s)

1. `G` **This handoff provides no approved UI technology selection.** — There are two candidate resolutions, and **the decision between them has not been made**: — `docs/BACK-728-handoff.md:39`
2. `P` **Narrow tmux UI repair was an unapproved option with unverified effort and preservation claims.** — architecture. Days of work. Preserves everything. — `docs/BACK-728-handoff.md:42`
3. `P` **Ink/private-tmux substrate proposal lacks technology approval despite spike evidence.** — as a private, never-attached PTY container for agent processes. Verified viable (see §6). — `docs/BACK-728-handoff.md:44`
4. `G` **Expressed preference and a spike do not establish formal architecture approval.** — working spike. It has **not** been formally approved, and no migration work has started. — `docs/BACK-728-handoff.md:47`
5. `P` **Ink alternate-screen wrapper applies only if that unapproved substrate is selected.** — pollutes terminal scrollback. You must wrap this yourself. — `docs/BACK-728-handoff.md:303`
6. `P` **Pending-write-counter remedy depends on unapproved rendering pipeline selection.** — tick yields an **empty grid**. Needs a pending-write counter or the pane renders blank. — `docs/BACK-728-handoff.md:307`
7. `P` **TERM attribution and proposed color remedy were never verified.** — `set -g default-terminal "tmux-256color"`, **but this is UNVERIFIED.** — `docs/BACK-728-handoff.md:314`
8. `P` **Cell-diffing requirement is an unapproved scaling recommendation for the Ink proposal.** — re-emits the whole grid every tick — the exact class of bug already being fixed. — `docs/BACK-728-handoff.md:317`
9. `P` **Claude color viability question remains unanswered for the unapproved Ink proposal.** — indistinguishable from a broken pipeline, so it must be proven either way. — `docs/BACK-728-handoff.md:330`
10. `P` **One Ink terminal owner and Yoga UI tree are unapproved technology proposals.** — ``` — `docs/BACK-728-handoff.md:414`
11. `P` **Pipe-pane through xterm into Ink cells is an unapproved rendering pipeline.** — ``` — `docs/BACK-728-handoff.md:415`
12. `P` **Claude color viability probe remains proposal-specific unanswered work.** — highest-information test available. — `docs/BACK-728-handoff.md:429`
13. `G` **Historical architecture alternatives lack an approval record.** — 3. **Decide A vs B** with the user, presenting §7 findings honestly. — `docs/BACK-728-handoff.md:432`
14. `P` **Ink vertical slice and spike reuse remain unapproved implementation proposals.** — the starting skeleton. — `docs/BACK-728-handoff.md:435`

**→ `docs/CONVENTIONS.md#general-principles`** — 5 statement(s)

1. `G` **Directory provenance and disposition remain unknown.** — | `docs/pi-extensions/` | **unknown** | ownership never established. Do not commit. | — `docs/BACK-728-handoff.md:65`
2. `P` **Scratch origin is speculative and does not authorize cleanup.** — | `.omp/` | appeared during this session | likely agent-session scratch | — `docs/BACK-728-handoff.md:66`
3. `P` **Scratch origin is speculative and does not authorize cleanup.** — | `.pi/` | appeared during this session | likely agent-session scratch | — `docs/BACK-728-handoff.md:67`
4. `G` **Unknown file provenance requires disposition before removal or commitment.** — | `docs/pi-extensions/01-agent-yaml-error.md` | Untracked, ownership unknown, nothing in `src/` references it. Needs a decision. | — `docs/BACK-728-handoff.md:365`
5. `G` **Unknown directory ownership and disposition remain open.** — 7. Decide what to do with `docs/pi-extensions/`. — `docs/BACK-728-handoff.md:439`

**→ `docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host`** — 2 statement(s)

1. `P` **Explicit process.exit implementation proposal is not an approved cleanup strategy.** — 3. Make the outer process explicitly `process.exit(0)` after the client returns. — `docs/BACK-728-handoff.md:160`
2. `P` **Batching mechanism is a spike recommendation rather than approved input transport.** — loop. Batch into a single `send-keys -l`. — `docs/BACK-728-handoff.md:311`

**→ `docs/CONVENTIONS.md#changes-and-refactoring`** — 2 statement(s)

1. `G` **Legacy live-state migration authorization and ownership remain unresolved.** — | `.agentic-workspace/` migration | **Never run.** The user has not done it. Roughly 30 live session dirs remain under `.git/backlog-workspace/`. Leave it to the user. | — `docs/BACK-728-handoff.md:364`
2. `P` **Legacy live-data conversion remains authorization-gated and is not approved by this annotation.** — 8. Run the `.agentic-workspace/` migration — but only with the user's explicit go-ahead. — `docs/BACK-728-handoff.md:440`

**→ `docs/BLUEPRINT.md#observation-stop-and-deletion`** — 1 statement(s)

1. `G` **PID-only wording must retain provenance checks because a PID alone does not authorize termination.** — `assertIsolatedSocket`). Kill tmux servers **by PID** or via a private socket. — `docs/BACK-728-handoff.md:116`

**→ `docs/specs/sessions.md#starting-a-session`** — 1 statement(s)

1. `P` **Current real-provider identity capture acceptance is not established by this handoff.** — ### 8.2 `nativeSessionId` capture is NOT verified end to end — `docs/BACK-728-handoff.md:333`

**→ `docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport`** — 1 statement(s)

1. `P` **Proposed per-launch private tmux topology needs reconciliation with explicit shared backend ownership.** — ``` — `docs/BACK-728-handoff.md:417`

**→ `docs/CONVENTIONS.md#tooling-and-validation`** — 1 statement(s)

1. `G` **Real-provider exact identity/resume verification completion remains unestablished.** — gates the whole resume-based design. — `docs/BACK-728-handoff.md:431`

**→ `docs/CONVENTIONS.md#testing`** — 1 statement(s)

1. `G` **Default-server death cause and isolation audit completion were never established.** — default socket. **This is worth auditing** — it is a live risk to the user's sessions. — `docs/BACK-728-handoff.md:470`

## G2 · Backlog.md agent handover

**Document:** `docs/agent-handover.md` · **16 statements** — 6 P · 10 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/specs/supported-integration-operations.md#supported-integration-operations`** — 5 statement(s)

1. `G` **Established HTTP scope header/error contract needs retention disposition rather than silent removal.** — - `X-Backlog-Project-Scope`: missing → `400 PROJECT_SCOPE_REQUIRED`; stale → `409 PROJECT_SCOPE_MISMATCH`. — `docs/agent-handover.md:92`
2. `G` **Established HTTP scope exemptions need retained API disposition.** — - `/api/status` and `/api/version` are exempt from the scope gate. — `docs/agent-handover.md:93`
3. `P` **Established browser WebSocket targeting and no-polling contract need retained surface disposition.** — - WebSocket URL carries `projectScope`; one shared socket, no polling fallback. — `docs/agent-handover.md:94`
4. `G` **Historical query coercion and alias wire contract need retained API disposition.** — - Collection repeated/comma query coercion uses schema transforms; alias normalization preserves existing wire behavior. — `docs/agent-handover.md:101`
5. `G` **Established HTTP validation status contract needs surface retention disposition.** — - Request validation maps to 400; response validation failures map to 500. — `docs/agent-handover.md:103`

**→ `docs/CONVENTIONS.md#testing`** — 3 statement(s)

1. `P` **Applicability of the historical whole-suite 30-second target needs disposition.** — - **No dishonest performance claims.** The target is all product tests together in at most 30 seconds wall time, not 30 seconds per file. A deadline that kills an unfinished run does not achieve the … — `docs/agent-handover.md:73`
2. `P` **Historical whole-product performance target and current satisfaction need explicit disposition.** — ### 3. Complete product tests in ≤30 seconds — unmet — `docs/agent-handover.md:184`
3. `P` **Current applicability and satisfaction of the historical whole-suite target remain unresolved.** — 5. Run integrated bounded verification and update Backlog evidence honestly. Keep the full-suite performance task open until an actual complete timed run meets the target. — `docs/agent-handover.md:276`

**→ `docs/CONVENTIONS.md#changes-and-refactoring`** — 2 statement(s)

1. `G` **Agent-only CLI mutation safeguard needs explicit disposition distinct from user file access.** — - `Choose Stack` is an empty proposed decision. It was excluded from the checkpoint. Do not assume it is an accepted architecture decision or delete it without investigating provenance. Manage … — `docs/agent-handover.md:44`
2. `P` **Parser substitution is only a conditional proposal pending source-position fidelity evidence.** — A generic Markdown AST parser would not supply Backlog schema mapping, section aliases, checklist indices, marker validation, or minimal-diff writes. It could replace some syntax scanning if … — `docs/agent-handover.md:227`

**→ `docs/SPEC.md#feature-contracts`** — 1 statement(s)

1. `G` **Startup-owned browser graph retention needs scope disposition without reviving the superseded stateless design.** — - Browser startup loads a `ProjectTaskGraph` before accepting requests. Prepared task records carry `isReady`; collection queries filter/project them rather than building readiness indexes per … — `docs/agent-handover.md:83`

**→ `docs/architecture/application-boundaries.md#application-controller`** — 1 statement(s)

1. `G` **In-memory graph reuse and persistence scope need reconciliation with retained collection architecture.** — - Reconciliation replaces prepared state before notifying subscribers. Dependency details reuse graph context. The graph remains in memory, not persisted to disk. — `docs/agent-handover.md:84`

**→ `docs/specs/filtering-and-search.md#filtering-and-search`** — 1 statement(s)

1. `G` **Exact historical full-text behavior is unspecified and matching details remain open.** — - Preserve canonical ID ambiguity, completed-task evidence, local/cross-branch visibility, full-text behavior, custom initialization, partial mutations, and locked writes. — `docs/agent-handover.md:96`

**→ `docs/specs/configuration.md#configuration-and-modes`** — 1 statement(s)

1. `G` **Custom initialization details are not identified sufficiently to fold.** — - Preserve canonical ID ambiguity, completed-task evidence, local/cross-branch visibility, full-text behavior, custom initialization, partial mutations, and locked writes. — `docs/agent-handover.md:96`

**→ `docs/adr/README.md#active-decisions`** — 1 statement(s)

1. `G` **Framework-specific response practice depends on retained server technology scope.** — - Keep raw `Response` where genuinely appropriate for assets/HTML/streams. — `docs/agent-handover.md:106`

**→ _no owning contract — retire, or escalate as a new decision_** — 1 statement(s)

1. `P` **Recommendations do not constitute approval.** — The user was told the responsibility is justified, but a storage-oriented location/name could communicate it better during a coherent storage reorganization. This was a recommendation, not … — `docs/agent-handover.md:229`

## G3 · Agent Session Ownership — Implementation Plan

**Document:** `docs/agent-session-ownership-plan.md` · **12 statements** — 1 P · 11 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/specs/sessions.md#creation-failure-and-recovery`** — 5 statement(s)

1. `G` **Slice d explicit cancellation of queued startup is not resolved by synchronous creation rollback.** — **Slices:** (a) `sessions.registerPendingSession(taskId, { preset }, context)` — writes `nativeWorkspace: true`, `ownerPid: context.pid`, `tmuxName: context.socket`, `status: STARTING`, … — `docs/agent-session-ownership-plan.md:94`
2. `G` **Slice a never-launched adoption versus exact-resume selection needs retained queue-path disposition.** — **Slices:** (a) `sessions.adoptPendingSession(taskId, socketName, sessionId)` — asserts `STARTING` + `nativeWorkspace` + `ownerPid === process.pid`, then runs the launch path in **adopt** mode: same … — `docs/agent-session-ownership-plan.md:100`
3. `G` **Slice c protection against resuming never-launched reservations needs recovery-policy disposition.** — **Slices:** (a) reuse `settleDeadSessions`; (b) make the startup sweep cover tasks the user has not selected — a pending `STARTING` record blocks a new session for its task until reconciled … — `docs/agent-session-ownership-plan.md:107`
4. `G` **Tracked-set implementation gate remains until retained adoption path is reconciled.** — 5. **Adoption is not a second launch.** Exactly one host per record, guarded by the tracked/launching set. — `docs/agent-session-ownership-plan.md:132`
5. `P` **Queued adoption liveness and recovery disposition are not established by core synchronous failure rules.** — 2. **Adoption is workspace-view only.** The request timer only launches while the workspace view is mounted; a request registered from board view waits for the view to return. The marker survives, so … — `docs/agent-session-ownership-plan.md:164`

**→ `docs/BLUEPRINT.md#architectural-invariants`** — 4 statement(s)

1. `G` **Queue-specific foreign-owner rejection must remain until retained adoption paths and retirement are verified.** — - A marker whose `pid` is not this process, or is not alive, never launches a session. — `docs/agent-session-ownership-plan.md:79`
2. `G` **PID-specific adoption rejection needs scoped queue-path disposition while provenance safety remains mandatory.** — **Stop condition:** no path launches a record twice, and no path adopts a record owned by another pid. — `docs/agent-session-ownership-plan.md:102`
3. `G` **Historical PID guard cannot be retired without mapping exact execution ownership protection to the shared runtime.** — 6. **A record owned by another live pid is never adopted or resumed** (`sessions.ts:129-134` semantics stay, relaxed only for self). — `docs/agent-session-ownership-plan.md:133`
4. `G` **Forged-context wedge and claimed reset remedy need current-path verification rather than acceptance as harmless.** — 1. **A forged context can wedge one task.** An invocation that presents a live non-workspace pid, this project's root, and any live workspace-shaped socket registers a `starting` record nobody adopts … — `docs/agent-session-ownership-plan.md:163`

**→ `docs/BLUEPRINT.md#new-session`** — 1 statement(s)

1. `G` **Slice b in-flight adoption guard must survive until its replacement or retirement is verified.** — **Slices:** (a) `sessions.adoptPendingSession(taskId, socketName, sessionId)` — asserts `STARTING` + `nativeWorkspace` + `ownerPid === process.pid`, then runs the launch path in **adopt** mode: same … — `docs/agent-session-ownership-plan.md:100`

**→ `docs/architecture/session-harness.md#runningexecution`** — 1 statement(s)

1. `G` **Exact sidecar scoping and stale-sidecar rejection require verification or explicit retirement in runtime work.** — 3. **The sidecar stays process-scoped and deterministic** (`sessionActivityDir`), and a hard-killed session must read as absent, never as a live status. — `docs/agent-session-ownership-plan.md:130`

**→ `docs/CONVENTIONS.md#testing`** — 1 statement(s)

1. `G` **Two excluded failures and pre-existing attribution need current disposition before using this evidence for release.** — Suites run one file per process: `workspace-context` 19, `live/tmux/socket` 4, `agent-sessions` 36, `opentui-workspace-controller` 31, `session-launch` 14, `status-hooks` 12, … — `docs/agent-session-ownership-plan.md:157`

## G4 · AoE Functionality Map (canonical)

**Document:** `docs/aoe-functionality-map.md` · **3 statements** — 0 P · 3 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ _no owning contract — retire, or escalate as a new decision_** — 3 statement(s)

1. `G` **Reference evidence is not approval or implementation authorization.** — not artifact approval, and not a green-light to resume Backlog implementation. — `docs/aoe-functionality-map.md:22`
2. `G` **Unverified evidence remains unverified rather than becoming completed alignment.** — the Gaps lines. — `docs/aoe-functionality-map.md:78`
3. `G` **Unverified gaps remain open rather than being closed by documentation mapping.** — Carry these PENDING lists forward; do not treat any listed gap as verified. — `docs/aoe-functionality-map.md:1943`

## G5 · Footer search / broken workspace recovery handover

**Document:** `docs/footer-search-recovery-handover.md` · **12 statements** — 0 P · 12 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ _no owning contract — retire, or escalate as a new decision_** — 5 statement(s)

1. `G` **Current usability cannot be established from this failed handoff.** — The user's intended work was a single text input: Board/Workspace footer search. The work expanded excessively and the actual application is now **not verified usable**. The user is angry about scope … — `docs/footer-search-recovery-handover.md:22`
2. `G` **Navigation exception cause was never established.** — The Tasks pane was empty. Navigation pane `%97` was dead (exit status 1). Its visible contents showed only `Bun v1.3.14 (macOS arm64)` and the dead-pane notice. The actual navigation exception has … — `docs/footer-search-recovery-handover.md:52`
3. `G` **Responsible mutation invocation remains unknown and must not be inferred.** — The record had already been repaired earlier and subsequently became damaged again during agent task updates. The exact invocation responsible is **not established**. Earlier claims that a particular … — `docs/footer-search-recovery-handover.md:60`
4. `G` **Current recovery and acceptance completion must be established before closing this task.** — Intended task status before damage: In Progress, assignee `@OpenCode`, AC6 unchecked. Do not mark complete. — `docs/footer-search-recovery-handover.md:64`
5. `G` **Verification must establish the mismatch instead of inferring success.** — 3. Inspect the navigation process's actual error. Fix or revert the specific regression based on evidence. — `docs/footer-search-recovery-handover.md:70`

**→ `docs/CONVENTIONS.md#changes-and-refactoring`** — 2 statement(s)

1. `G` **Agent-only mutation/recovery safeguard needs explicit disposition and is not repealed by user-editable files.** — `b3b4a050` is a recovery reference for original task content; inspect it before deciding what to restore. Repository policy forbids manually editing task Markdown: use the documented product … — `docs/footer-search-recovery-handover.md:62`
2. `G` **Historical identity data preservation needs explicit ownership disposition rather than accidental deletion.** — - Native tmux architecture and strict migration tooling are already in the checkpoint. Don't casually remove branch-aware loading or historical identity handling while recovering the input task. — `docs/footer-search-recovery-handover.md:98`

**→ `docs/CONVENTIONS.md#general-principles`** — 1 statement(s)

1. `G` **Recovery authorization remains bounded and needs agreement before destructive continuation.** — The previous agent stopped implementation after acknowledging those failures. No repairs were made while writing this document. Current operational mode permits changes, but agree on the narrow … — `docs/footer-search-recovery-handover.md:24`

**→ `docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport`** — 1 statement(s)

1. `G` **Search-specific tmux event restriction needs reconciliation with the current socket-based terminal boundary.** — - tmux-native events; no sockets or new transport infrastructure. — `docs/footer-search-recovery-handover.md:81`

**→ `docs/screens/workspace.md#ordered-regions`** — 1 statement(s)

1. `G` **Historical full-width filter/search composition needs reconciliation with current ordered regions.** — - Layout: full-width filters, Tasks beside Details/native agent, full-width shortcuts or temporary search. — `docs/footer-search-recovery-handover.md:84`

**→ `docs/specs/workspace-and-board.md#workspace-and-board`** — 1 statement(s)

1. `G` **Exact native tmux window and recovery topology retention needs reconciliation with the board route in the shared host.** — - Preserve agent pane IDs/PIDs, Board/Workspace windows, zoom/detach/recovery, parked agents, and configured branch-aware Board loading. — `docs/footer-search-recovery-handover.md:86`

**→ `docs/CONVENTIONS.md#testing`** — 1 statement(s)

1. `G` **Lock path isolation ownership and stale-owner safety review remains unverified.** — - Latest bootstrap change uses shared `LockOwner` from `src/file-system/lock-owner.ts` / proper-lockfile rather than tmux bootstrap lock. Stale threshold 2 seconds, retry delay 25 ms, 200 retries. … — `docs/footer-search-recovery-handover.md:96`

## G6 · Backlog.md — handoff

**Document:** `docs/handoff.md` · **10 statements** — 4 P · 6 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ _no owning contract — retire, or escalate as a new decision_** — 5 statement(s)

1. `G` **Legacy compatibility is not retained without explicit approval.** — The standing aim is the one in the runtime plan: bring Backlog.md's agent runtime in line with the verified AoE feature map, with no legacy or migration surface, and a test suite whose green means … — `docs/handoff.md:24`
2. `G` **Historical all-five implementation completion does not establish current conformance or settle the separately mentioned MCP feedback question.** — | The owner's open decisions, which gate the remaining work | [decision-answers-5.md](decision-answers-5.md) (input on close) and [decision-answers-6.md](decision-answers-6.md) (items 1–3). … — `docs/handoff.md:33`
3. `G` **Superseded behavior is removed rather than supported implicitly.** — 2. No legacy, backward-compatibility or migration code anywhere — conversion of old data is a manual user action. — `docs/handoff.md:48`
4. `G` **Closed-host idle-database safety prerequisite must be revalidated before reusing the maintenance command.** — - The host database `~/.opencode-personal/data/opencode/opencode.db` was 12.5 GB, half of it free pages inside the file; the owner compacts it with opencode closed (`sqlite3 … "VACUUM;"`). Free disk … — `docs/handoff.md:73`
5. `P` **Runtime and resume proof completion is not established by this mapping.** — 4. Then the canonical checkpoint's own work: shared-runtime slice I steps 5–6 and resume-policy phase 4 — see [shared-agent-runtime-handoff.md](shared-agent-runtime-handoff.md). — `docs/handoff.md:88`

**→ `docs/CONVENTIONS.md#tooling-and-validation`** — 3 statement(s)

1. `P` **Sheet 8 explicitly defers item 3 packaging-coverage wording.** — | The owner's open decisions, which gate the remaining work | [decision-answers-5.md](decision-answers-5.md) (input on close) and [decision-answers-6.md](decision-answers-6.md) (items 1–3). … — `docs/handoff.md:33`
2. `P` **Item 3 contributor wording remains deferred so its editing gate is not retired.** — - Open questions that gate the remaining work: [decision-answers-5.md](decision-answers-5.md) (input on close — A/B/C, unanswered) and [decision-answers-6.md](decision-answers-6.md) (rewritten … — `docs/handoff.md:43`
3. `P` **Contributor packaging-evidence wording remains explicitly deferred in sheet 8.** — 1. Get the owner's answers (decision-answers-6 items 1–3, decision-answers-5). Then fix the artifact-view wait and its 150 ms assertion; decide whether `src/utils/task-watcher.ts` gains a periodic … — `docs/handoff.md:85`

**→ `docs/CONVENTIONS.md#testing`** — 1 statement(s)

1. `G` **Current source-versus-installed extraction status needs verification before relying on it.** — - Tests no longer cause it. **The built/installed CLI still does**: each launch leaves 5.4 MB in the system temp directory. 55 such files (~300 MB) were cleaned; two stale 24 KB run directories … — `docs/handoff.md:72`

**→ `docs/specs/supported-integration-operations.md#supported-integration-operations`** — 1 statement(s)

1. `G` **MCP dependency-cleanup feedback policy remains unanswered.** — 1. Get the owner's answers (decision-answers-6 items 1–3, decision-answers-5). Then fix the artifact-view wait and its 150 ms assertion; decide whether `src/utils/task-watcher.ts` gains a periodic … — `docs/handoff.md:85`

## G7 · OpenTUI Workspace Behavior Matrix

**Document:** `docs/opentui-workspace-behavior-matrix.md` · **19 statements** — 7 P · 12 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/screens/tasks.md#states-focus-and-terminal-constraints`** — 4 statement(s)

1. `P` **Exact p override interaction is candidate evidence.** — | Task configuration | Creation inherits project settings unless preset is chosen. `p` selects task override or restores inheritance. `h` selects replacement preset, retains predecessor until launch … — `docs/opentui-workspace-behavior-matrix.md:46`
2. `P` **Exact detail focus/backtracking keys remain candidate evidence.** — | Details | Details show task fields, active-session label, and handoff error. `Right` focuses details. `Esc` or `Left` returns to tasks. | **Retain** | Keep task details and backtracking behavior … — `docs/opentui-workspace-behavior-matrix.md:97`
3. `P` **Exact Ctrl+S and Left editor keys are not approved by source evidence alone.** — | Field editing | Details edits title, description, type, and priority through drafts. `Ctrl+S` writes changed fields through `Core`; `Esc` or `Left` closes editor. | **Retain** | Preserve field … — `docs/opentui-workspace-behavior-matrix.md:98`
4. `P` **Exact n binding remains candidate evidence.** — | New task | `n` opens composer and persists task through `Core.createTaskFromInput`, then selects created task. | **Retain** | Keep creation in task-composer overlay and existing `Core` mutation … — `docs/opentui-workspace-behavior-matrix.md:99`

**→ _no owning contract — retire, or escalate as a new decision_** — 3 statement(s)

1. `G` **Core owners supersede historical authority claims.** — > **Retained source material pending fold.** [SPEC](SPEC.md) owns canonical behavior and [BLUEPRINT](BLUEPRINT.md) owns canonical structure; they supersede conflicting authority claims below. Scoped … — `docs/opentui-workspace-behavior-matrix.md:17`
2. `G` **Parity-before-removal gate needs evidence before retirement.** — - **Remove** — delete legacy presentation behavior after public cutover and parity proof. — `docs/opentui-workspace-behavior-matrix.md:60`
3. `G` **Parity and owner-approval deletion gate requires evidence before retirement.** — | Presentation tmux mechanics | Pane naming, resizing, key tables, mailboxes, pane swaps, window selection, and presentation process respawn all live in `TmuxWorkspace`. | **Remove** after Phase 4 … — `docs/opentui-workspace-behavior-matrix.md:134`

**→ `docs/screens/sessions-artifacts.md#focus-and-constrained-terminals`** — 3 statement(s)

1. `P` **Exact s binding is not established.** — | Session picker | `s` lists task sessions newest first, marks active, and selects or resumes exact native conversation. | — `docs/opentui-workspace-behavior-matrix.md:39`
2. `G` **Exact historical picker navigation bindings are not core guarantees.** — | Session history | `s` loads selected task sessions. Arrow keys choose one. `Enter` focuses running session or shows stripped persisted output for stopped session. `Esc` backs out history then … — `docs/opentui-workspace-behavior-matrix.md:101`
3. `P` **Exact h binding remains candidate evidence.** — | Handoff | `h` requests handoff for selected task. Detached worker continues it. Replacement starts before retired session is killed; failure restores prior session when possible and records error. … — `docs/opentui-workspace-behavior-matrix.md:112`

**→ `docs/specs/supported-integration-operations.md#supported-integration-operations`** — 2 statement(s)

1. `G` **Skill command awaits guidance API disposition.** — | Skill isolation | `agentic-workspace skill` prints requested body. Launches load temporary session-scoped skills, not global/project skill installations. | — `docs/opentui-workspace-behavior-matrix.md:42`
2. `G` **Init copying and built-in defaults need API/config disposition.** — | Scope resolution | Card configuration wins over project, then root, then built-ins. A scope is complete and does not merge with parent. `init` is explicit copying. | **Retain** | Preserve … — `docs/opentui-workspace-behavior-matrix.md:120`

**→ `docs/screens/settings.md#states-and-focus`** — 2 statement(s)

1. `G` **Exact comma opening binding is not specified.** — | Agent settings | `,` opens fullscreen project-only Settings with a three-row header/footer and adjacent rounded category/content panes. Categories contains `Agents`; cyan marks pane focus. Fields … — `docs/opentui-workspace-behavior-matrix.md:45`
2. `G` **Exact p editor binding and legacy bootstrap field are not core guarantees.** — | Agent configuration | `p` opens card-first editor for root, project, or card scope. It edits selected preset command, environment, preparation command, worktree flag, and bootstrap type. | … — `docs/opentui-workspace-behavior-matrix.md:119`

**→ `docs/screens/help-dialogs.md#help`** — 1 statement(s)

1. `G` **Exact help-opening question-mark binding is not specified.** — | Shortcut editor | `?` opens help and `/` searches. Binding and description are separate columns in one shared responsive layout, so descriptions stay aligned across capture phases. `Enter` starts a … — `docs/opentui-workspace-behavior-matrix.md:38`

**→ `docs/specs/sessions.md#handoff`** — 1 statement(s)

1. `G` **Exact h preset chooser and persisted link shape are not core approval.** — | Task configuration | Creation inherits project settings unless preset is chosen. `p` selects task override or restores inheritance. `h` selects replacement preset, retains predecessor until launch … — `docs/opentui-workspace-behavior-matrix.md:46`

**→ `docs/specs/tasks.md#launching-work-and-completing-a-task`** — 1 statement(s)

1. `G` **Separate archive behavior and workspace move interaction need disposition.** — | Complete, archive, copy, and move | Native Workspace task-list keymap has no direct bindings for complete, archive, copy, or move. Legacy Board exposes complete, archive, copy, and move bindings. | … — `docs/opentui-workspace-behavior-matrix.md:100`

**→ `docs/screens/board.md#states-and-focus`** — 1 statement(s)

1. `P` **Exact Shift+B binding remains candidate evidence.** — | Board presentation | `Shift+B` selects a separate tmux Board window. Board runs `UnifiedViewController` with a Blessed renderer. | **Change** | Board is a route in same OpenTUI host. It creates no … — `docs/opentui-workspace-behavior-matrix.md:107`

**→ `docs/screens/workspace.md#focus-and-constrained-terminals`** — 1 statement(s)

1. `G` **Exact Enter start/focus behavior is not specified.** — | Start and open agent | `Enter` starts selected task only when no active session exists; otherwise it shows active session, then focuses and zooms agent. | **Retain** | Keep explicit start/open … — `docs/opentui-workspace-behavior-matrix.md:109`

## G8 · OpenTUI Workspace Implementation Plan

**Document:** `docs/opentui-workspace-implementation-plan.md` · **39 statements** — 12 P · 27 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ _no owning contract — retire, or escalate as a new decision_** — 16 statement(s)

1. `G` **Legacy alias-array compatibility requires explicit exception.** — - Shortcut recording now replaces the selected label with an inline input and requires Save/Discard confirmation. Saved bindings support one or two ordered strokes; legacy arrays remain alternative … — `docs/opentui-workspace-implementation-plan.md:59`
2. `P` **Unapproved compatibility UI is excluded.** — The obsolete workspace presentation has been deleted. It is not an alternate public UI. — `docs/opentui-workspace-implementation-plan.md:80`
3. `G` **Phase review/approval gates need evidence before retirement and do not authorize renewed execution.** — Every phase has fixed file ownership, independent parallel slices, verification evidence, and an explicit user review gate. No later phase begins before that approval. — `docs/opentui-workspace-implementation-plan.md:82`
4. `G` **Historical shell review gate requires evidence before retirement.** — User approves actual shell appearance and selection behavior. — `docs/opentui-workspace-implementation-plan.md:146`
5. `G` **Outstanding real-terminal appearance approval is not closed by source/PT Y evidence.** — Recovery verification: the actual CLI ran in an isolated PTY project. Task navigation changed the selected description, Space collapsed and restored details, idle produced zero output bytes over 1.6 … — `docs/opentui-workspace-implementation-plan.md:158`
6. `G` **Historical user-review stop gate requires evidence before retirement.** — Review with `bun src/cli/index.ts workspace`: Enter starts the agent, Space toggles details, Tab enters input, and Ctrl+Q returns to tasks. Stop here for user review. — `docs/opentui-workspace-implementation-plan.md:186`
7. `G` **Historical user-review gate requires evidence before retirement.** — User approves normal task workflow. — `docs/opentui-workspace-implementation-plan.md:214`
8. `G` **Historical user-review gate requires evidence before retirement.** — User approves agent workflow. — `docs/opentui-workspace-implementation-plan.md:264`
9. `G` **Historical parity checkpoint cannot be declared complete by mapping.** — Same OpenTUI workspace satisfies full retained user workflow and cutover acceptance. — `docs/opentui-workspace-implementation-plan.md:270`
10. `G` **Historical end-to-end parity proof requires evidence before closure.** — | End-to-end proof | Focused E2E/manual verification tooling only | Public command, task workflow, session persistence, and no-presentation-tmux assertions | — `docs/opentui-workspace-implementation-plan.md:277`
11. `G` **Historical matrix closure needs current-contract evidence.** — | Parity audit | Tests and documentation only | Matrix closure against behavior and session contracts | — `docs/opentui-workspace-implementation-plan.md:279`
12. `G` **Historical cutover proof checkpoint needs current-contract scope and evidence before retirement.** — Run `agentic-workspace workspace` and prove task, board, detail, filter, search, edit, session, history, handoff, config, worktree, quick-preview, close/reopen, and failure states. — `docs/opentui-workspace-implementation-plan.md:283`
13. `G` **Owner approval before legacy deletion must not be waived without evidence.** — User approves full parity before deletion. — `docs/opentui-workspace-implementation-plan.md:289`
14. `G` **Historical deletion parity and lifecycle verification gate needs evidence before retirement.** — Run `agentic-workspace workspace`. Confirm same OpenTUI output. Confirm no legacy presentation caller remains. Confirm durable agent sessions still pass lifecycle tests. — `docs/opentui-workspace-implementation-plan.md:309`
15. `G` **Final owner-review checkpoint cannot be closed by annotation.** — User approves final deletion result. — `docs/opentui-workspace-implementation-plan.md:315`
16. `P` **Historical phase review target remains checkpoint evidence work.** — 1. A visible `agentic-workspace workspace` review target. — `docs/opentui-workspace-implementation-plan.md:321`

**→ `docs/CONVENTIONS.md#testing`** — 4 statement(s)

1. `G` **Historical full-parity gate needs evidence before retirement rather than becoming a universal full-suite rule.** — Run focused tests, full tests, build, actual terminal verification, and compiled CLI smoke. — `docs/opentui-workspace-implementation-plan.md:285`
2. `G` **Historical deletion gate requires evidence before retirement.** — Run full tests, build, actual terminal check, and compiled smoke. — `docs/opentui-workspace-implementation-plan.md:311`
3. `G` **Scoped terminal acceptance checkpoint requires evidence before retirement.** — 5. Actual terminal exercise of changed workspace path. — `docs/opentui-workspace-implementation-plan.md:325`
4. `G` **Historical parity/deletion gates need evidence rather than being silently waived or universalized.** — Phases 3 and 4 also require full tests, build, and compiled executable smoke. — `docs/opentui-workspace-implementation-plan.md:327`

**→ `docs/screens/workspace.md#focus-and-constrained-terminals`** — 3 statement(s)

1. `P` **Exact slash filter-opening binding is not established.** — - `/` opens task filters and persists applied values. — `docs/opentui-workspace-implementation-plan.md:160`
2. `P` **Exact Enter binding and default provider are not established by core.** — - Press `Enter` on a selected task to start its configured agent command and environment in the existing lower-right agent region. The default command is `opencode`. — `docs/opentui-workspace-implementation-plan.md:170`
3. `P` **Exact Enter start/open binding remains candidate evidence.** — ``` — `docs/opentui-workspace-implementation-plan.md:248`

**→ `docs/screens/tasks.md#states-focus-and-terminal-constraints`** — 3 statement(s)

1. `P` **Exact n binding is candidate evidence.** — - `n` opens task creation. — `docs/opentui-workspace-implementation-plan.md:161`
2. `P` **Exact e binding is candidate evidence.** — - `e` edits selected task title, description, type, and priority. — `docs/opentui-workspace-implementation-plan.md:162`
3. `G` **Exact y/c/a bindings and separate archive behavior need disposition.** — - `y`, `c`, and `a` copy, complete, and archive selected task. — `docs/opentui-workspace-implementation-plan.md:163`

**→ `docs/screens/sessions-artifacts.md#focus-and-constrained-terminals`** — 3 statement(s)

1. `P` **Exact S picker binding remains candidate evidence.** — ``` — `docs/opentui-workspace-implementation-plan.md:250`
2. `P` **Exact arrow picker navigation is not established in core.** — ``` — `docs/opentui-workspace-implementation-plan.md:251`
3. `P` **Exact H handoff binding remains candidate evidence.** — ``` — `docs/opentui-workspace-implementation-plan.md:252`

**→ `docs/specs/supported-integration-operations.md#supported-integration-operations`** — 2 statement(s)

1. `G` **Exact board command/export and milestone-grouping API scope needs disposition.** — - Interactive board commands use the native controller, including milestone grouping. Plain board exports retain Markdown output. — `docs/opentui-workspace-implementation-plan.md:27`
2. `G` **Skill command awaits guidance API disposition.** — - Task-manager launches use an exact idle prompt and a temporary session-local AgenticWorkspace skill. `agentic-workspace skill` prints its body. New sessions start at the project root without … — `docs/opentui-workspace-implementation-plan.md:43`

**→ `docs/screens/workspace.md#states`** — 1 statement(s)

1. `G` **Exact warming-up wording remains unspecified.** — - New opencode agents receive existing bootstrap instructions. A tmux launch gate attaches output capture before starting the noninteractive command; the UI shows a warming-up message until output … — `docs/opentui-workspace-implementation-plan.md:28`

**→ `docs/architecture/session-harness.md#readiness-and-identity-correlation`** — 1 statement(s)

1. `G` **Complete Claude lifecycle acceptance remains unverified.** — - OpenCode exported exactly the two-line startup instruction as one user message, with no assistant or tool messages. Its temporary skill was discovered natively. Claude's session-only plugin … — `docs/opentui-workspace-implementation-plan.md:55`

**→ `docs/architecture/session-harness.md#harness`** — 1 statement(s)

1. `G` **Codex Gemini and Antigravity loader/exact-resume gates remain pending verification.** — - OpenCode exported exactly the two-line startup instruction as one user message, with no assistant or tool messages. Its temporary skill was discovered natively. Claude's session-only plugin … — `docs/opentui-workspace-implementation-plan.md:55`

**→ `docs/screens/board.md#states-and-focus`** — 1 statement(s)

1. `P` **Exact Shift+B binding remains candidate evidence.** — - `Shift+B` routes to in-host board and returns to same selected task. — `docs/opentui-workspace-implementation-plan.md:164`

**→ `docs/screens/help-dialogs.md#help`** — 1 statement(s)

1. `P` **Exact question-mark opening binding is not established.** — - `?` opens shortcut help. — `docs/opentui-workspace-implementation-plan.md:165`

**→ `docs/specs/sessions.md#creation-failure-and-recovery`** — 1 statement(s)

1. `G` **Repeated-start semantics require current task/mode operation policy rather than old host reuse.** — - Repeated `Enter` reuses the task's starting/running host. Switching tasks hides the previous output and restores the selected task's own host without restarting it. — `docs/opentui-workspace-implementation-plan.md:173`

**→ `docs/screens/workspace.md#ordered-regions`** — 1 statement(s)

1. `G` **Separate preview border is historical styling evidence without explicit core approval.** — - The 44% task-list width, 30% details height, Space toggle, Tab input, Ctrl+Q return, and existing filter dialog remain intact. The details and preview now have separate borders. — `docs/opentui-workspace-implementation-plan.md:192`

**→ `docs/specs/tasks.md#launching-work-and-completing-a-task`** — 1 statement(s)

1. `G` **Separate archive semantics remain unspecified.** — | Task workflow controller | Controller task-intent handlers and controller tests | Create/edit/complete/archive/move/copy through existing `Core` APIs | — `docs/opentui-workspace-implementation-plan.md:202`

## G9 · OpenTUI Workspace Durable Agent-Session Contract

**Document:** `docs/opentui-workspace-session-contract.md` · **35 statements** — 5 P · 30 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/specs/supported-integration-operations.md#supported-integration-operations`** — 8 statement(s)

1. `G` **Reset command retention and safe scope remain API disposition work.** — - Native workspace launches create tagged panes and durable output capture that persists independently of any frontend. Task deletion forgets the session association only; it does not terminate the … — `docs/opentui-workspace-session-contract.md:30`
2. `G` **Exact attach CLI surface requires API disposition.** — - The shared agent backend uses the default tmux server or the existing configured socket override, independent of an ambient tmux client. `agentic-workspace agent-session attach` switches the client … — `docs/opentui-workspace-session-contract.md:33`
3. `G` **Skill command is unsettled guidance API scope.** — `agentic-workspace skill` prints the AgenticWorkspace Task Management skill body. The agent-specific skill file lives in an owned temporary directory loaded only for that process. No launch writes … — `docs/opentui-workspace-session-contract.md:73`
4. `G` **Explicit Codex hooks install/uninstall surface needs API approval.** — `[features] hooks`; nothing removes user configuration at session end. — `docs/opentui-workspace-session-contract.md:114`
5. `G` **Hook command scope and isolated-loader gate remain unresolved.** — | Codex | `hooks.json` marked merge in `$CODEX_HOME` | Implemented; reachable via `hooks install` (the launch arm is dormant behind the Codex skill-loader refusal) | pane/title chrome | — `docs/opentui-workspace-session-contract.md:135`
6. `G` **Reset command scope and safe tracking removal require disposition.** — Invalid durable state fails closed with an explicit reset command. A UI must surface this failure; it must not substitute an empty state … — `docs/opentui-workspace-session-contract.md:184`
7. `G` **Exact delete CLI syntax remains API disposition.** — | Per-session delete (separate from task deletion) | `agentic-workspace agent-session delete <taskId> --session <sessionId> [--force]` removes a session association. Currently flagged live sessions … — `docs/opentui-workspace-session-contract.md:201`
8. `G` **Extra command surfaces require API disposition.** — - CLI session commands remain direct service callers for list, start, stop, attach, output, reconciliation, reset, and deletion ([`agent-workspace.ts`](../src/commands/agent-workspace.ts)). — `docs/opentui-workspace-session-contract.md:258`

**→ `docs/architecture/session-harness.md#harness`** — 6 statement(s)

1. `G` **OMP isolated-loader prerequisite remains blocked pending verification.** — | OMP | Blocked: its documented `--skills` option filters discovered skills; it does not load a process-scoped skill path. | — `docs/opentui-workspace-session-contract.md:87`
2. `G` **Codex isolated-loader prerequisite remains blocked pending verification.** — | Codex CLI 0.148.0 | Blocked: documented skill discovery uses repository, user, admin, or system locations, not a process-scoped directory. | — `docs/opentui-workspace-session-contract.md:88`
3. `G` **Gemini isolated loading and exact resume remain unverified prerequisites.** — | Gemini CLI 0.62.0 | Blocked: skill link/install persists user or workspace scope. Installed resume help offers latest/index selection, not exact UUID resume. | — `docs/opentui-workspace-session-contract.md:89`
4. `G` **Antigravity isolated loading and exact resume remain unverified prerequisites.** — | Antigravity | Blocked: no installed executable or verified session-scoped loader/exact-resume interface on this workstation. | — `docs/opentui-workspace-session-contract.md:90`
5. `G` **Isolated-loader launch gate remains unresolved.** — | OMP | `--hook` module | Not installed while the launch gate holds | pane/title chrome | — `docs/opentui-workspace-session-contract.md:133`
6. `G` **Isolated-loader launch gate remains unresolved.** — | Antigravity | workspace/global/plugin hooks | Not installed (no isolated loader) | pane/title chrome | — `docs/opentui-workspace-session-contract.md:134`

**→ `docs/specs/sessions.md#creation-failure-and-recovery`** — 5 statement(s)

1. `P` **Marker-adoption missing/live/dead runtime recovery policy and timing are not approved automatic recovery.** — - `agentic-workspace agent-session start` with a validated pane context registers a `nativeWorkspace` session record and request marker under `<root>/.agentic-workspace/agent-requests/`, and launches … — `docs/opentui-workspace-session-contract.md:40`
2. `G` **Pending-request cancellation policy depends on unresolved creation recovery.** — - Stopping a never-launched pending record cancels the request and removes its marker. — `docs/opentui-workspace-session-contract.md:43`
3. `G` **Retry UX remains open.** — | Start failure | Kills created live pane, marks reserved record `failed`, records `endedAt` and error, and clears active pointer if needed … — `docs/opentui-workspace-session-contract.md:196`
4. `G` **Automatic recovery policies remain unresolved.** — | Reconnect / recovery | Persisted reads preserve session records. An active dead or missing pane resumes from its saved preset snapshot and native session identity where available. | Reconcile only … — `docs/opentui-workspace-session-contract.md:198`
5. `P` **Automatic abandoned-start and dead-active recovery is not approved.** — A dead non-active session becomes `stopped`. An abandoned `starting` session becomes `failed`; both release an active pointer when applicable. A dead active session is resumed first; failure to … — `docs/opentui-workspace-session-contract.md:208`

**→ `docs/architecture/session-harness.md#route-runtime-events-and-observe`** — 3 statement(s)

1. `G` **Task-directory sidecar location conflicts with the earlier mkdtemp-sidecar claim and must reconcile configured storage and live-only transport.** — stopped on teardown; nothing about it survives a restart, so a stale green can never be replayed. — `docs/opentui-workspace-session-contract.md:125`
2. `G` **Pane/title fallback only for unlaunched agents requires provider evidence validation.** — stopped on teardown; nothing about it survives a restart, so a stale green can never be replayed. — `docs/opentui-workspace-session-contract.md:125`
3. `G` **Exact 10 ms watcher debounce and modal pause policy are not core approval.** — stopped on teardown; nothing about it survives a restart, so a stale green can never be replayed. — `docs/opentui-workspace-session-contract.md:125`

**→ _no owning contract — retire, or escalate as a new decision_** — 2 statement(s)

1. `G` **Intended behavior and runnable verification remain distinct with safeguards retained.** — Shared-runtime implementation/acceptance checkpoint: [canonical handoff](./shared-agent-runtime-handoff.md). Stable simplification safeguards and unresolved per-session policies: [runtime … — `docs/opentui-workspace-session-contract.md:22`
2. `G` **Historical parity-before-removal checkpoint needs evidence before retirement.** — | Tmux/Blessed presentation attach, pane swapping, workspace panes, and legacy quit behavior | Replace after parity. | — `docs/opentui-workspace-session-contract.md:270`

**→ `docs/architecture/session-harness.md#readiness-and-identity-correlation`** — 2 statement(s)

1. `G` **Live Pi acceptance remains unverified and must not be inferred from argument inspection.** — | Pi | Supports explicit `--skill` loading and exact `--session-id` / `--session` identity. Adapter verified against upstream CLI arguments; no live Pi session was exercised in this pass. | — `docs/opentui-workspace-session-contract.md:86`
2. `G` **Live Pi hook acceptance is not demonstrated by this inventory.** — | Pi | `--extension` module | Supported | pane/title chrome | — `docs/opentui-workspace-session-contract.md:132`

**→ `docs/BLUEPRINT.md#observation-stop-and-deletion`** — 1 statement(s)

1. `G` **Resource-removal-before-pane-kill ordering needs reconciliation with cleanup-before-removing tracking resources.** — - A stop failure remains visible and must not be recorded as a successful stop. Cleanup validates all known launch resources before deleting any, cleans them before killing the exact owned pane, and … — `docs/opentui-workspace-session-contract.md:35`

**→ `docs/screens/sessions-artifacts.md#focus-and-constrained-terminals`** — 1 statement(s)

1. `P` **Exact s binding is not established.** — - `s` lists the selected task's sessions newest first and marks the active session. — `docs/opentui-workspace-session-contract.md:47`

**→ `docs/specs/configuration.md#configuration-and-modes`** — 1 statement(s)

1. `G` **Exact built-in fallback defaults are not specified.** — - Configuration resolution remains task, project, root, then built-ins. Project settings use the existing configuration service, not a second UI store. User-level settings are not exposed in this … — `docs/opentui-workspace-session-contract.md:55`

**→ `docs/screens/settings.md#states-and-focus`** — 1 statement(s)

1. `P` **Exact comma opening binding is candidate evidence.** — - `,` opens fullscreen project-only Settings with adjacent rounded category/content panes and cyan focus. Fields remain read-only until selected and edited with `Enter`. `Right` enters fields; `Left` … — `docs/opentui-workspace-session-contract.md:57`

**→ `docs/screens/tasks.md#states-focus-and-terminal-constraints`** — 1 statement(s)

1. `P` **Exact p override interaction remains candidate evidence.** — - New tasks inherit project settings unless creation selects preset. Explicit selection saves complete task configuration in same atomic creation operation. `p` selects task preset or clears override … — `docs/opentui-workspace-session-contract.md:58`

**→ `docs/specs/configuration.md#delete-a-mode`** — 1 statement(s)

1. `G` **Existing moving-deletion journals need explicit recovery disposition and must remain untouched.** — - A session's fixed mode is its owning nested history. Execution uses that mode's current profile. A mode with sessions cannot be deleted or merged into another mode. Existing moving mode-deletion … — `docs/opentui-workspace-session-contract.md:60`

**→ `docs/architecture/application-boundaries.md#stores-and-repositories`** — 1 statement(s)

1. `G` **Explicit attach usage bookkeeping is retained only if a real use is established.** — | Open / attach | `attach` requires a running session, updates usage, then uses `switch-client` inside tmux or `attach-session` outside tmux … — `docs/opentui-workspace-session-contract.md:197`

**→ `docs/specs/sessions.md#stop-and-resume-a-session`** — 1 statement(s)

1. `G` **Exact stop confirmation interaction is unspecified.** — | Stop | Resolves active or requested running session, kills its live tmux pane, persists `stopped` and `endedAt`, and clears active pointer … — `docs/opentui-workspace-session-contract.md:199`

**→ `docs/specs/sessions.md#deleting-a-session`** — 1 statement(s)

1. `G` **Sidecar/provider cleanup recovery and exact confirmation remain unresolved.** — | Per-session delete (separate from task deletion) | `agentic-workspace agent-session delete <taskId> --session <sessionId> [--force]` removes a session association. Currently flagged live sessions … — `docs/opentui-workspace-session-contract.md:201`

## G10 · OpenTUI Workspace Specification

**Document:** `docs/opentui-workspace-spec.md` · **25 statements** — 9 P · 16 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ _no owning contract — retire, or escalate as a new decision_** — 8 statement(s)

1. `G` **Core authority is established.** — > **Retained source material pending fold.** [SPEC](SPEC.md) owns canonical behavior and [BLUEPRINT](BLUEPRINT.md) owns canonical structure; they supersede conflicting authority claims below. Scoped … — `docs/opentui-workspace-spec.md:17`
2. `G` **Approved owners supersede source material.** — > [`docs/SPEC.md`](./SPEC.md) is authoritative wherever this document disagrees with it. — `docs/opentui-workspace-spec.md:19`
3. `G` **Legacy alias-array compatibility needs explicit exception rather than assumed retention.** — - `?` opens shortcut help. `/` searches; `Enter` replaces the selected row's binding. Binding and description are separate columns in one shared responsive layout, so descriptions stay aligned across … — `docs/opentui-workspace-spec.md:40`
4. `G` **Historical deletion gate requires evidence before retirement.** — - Removal of legacy presentation after parity passes. — `docs/opentui-workspace-spec.md:74`
5. `P` **Unapproved compatibility surfaces are excluded.** — - Adding a second public workspace command or compatibility UI. — `docs/opentui-workspace-spec.md:81`
6. `G` **Successful-cutover deletion gate requires evidence before retirement.** — ### Remove after successful cutover — `docs/opentui-workspace-spec.md:312`
7. `G` **Historical parity gate needs evidence and current-contract scope before retirement.** — 7. Existing task and agent-session workflows pass end to end. — `docs/opentui-workspace-spec.md:349`
8. `G` **Superseded public compatibility paths are removed.** — 10. Blessed workspace presentation code has no public caller. — `docs/opentui-workspace-spec.md:352`

**→ `docs/specs/supported-integration-operations.md#supported-integration-operations`** — 3 statement(s)

1. `G` **Exact board command aliases and milestone flags require API inventory disposition.** — - `agentic-workspace workspace`, interactive `agentic-workspace board`, and `agentic-workspace board view` use OpenTUI. Piped board output remains Markdown; `--milestones` works on direct and nested … — `docs/opentui-workspace-spec.md:25`
2. `G` **Piped board Markdown export is not an approved integration operation yet.** — - `agentic-workspace workspace`, interactive `agentic-workspace board`, and `agentic-workspace board view` use OpenTUI. Piped board output remains Markdown; `--milestones` works on direct and nested … — `docs/opentui-workspace-spec.md:25`
3. `G` **Skill command requires guidance API disposition.** — - `agentic-workspace skill` prints AgenticWorkspace Task Management skill. Task-manager launches supply temporary session-scoped skill directory rather than installing into global or project … — `docs/opentui-workspace-spec.md:45`

**→ `docs/architecture/session-harness.md#route-runtime-events-and-observe`** — 3 statement(s)

1. `G` **Specific hook freshness and pane-chrome evidence need provider validation.** — - The task-row dot is the agent-session indication: a single map keyed by task id that renders iff the task has an active session. Green = working (a fresh <30 s `running` hook or pane chrome showing … — `docs/opentui-workspace-spec.md:35`
2. `G` **Hook freshness and chrome evidence need provider-specific validation.** — transient. A task with no active session renders no dot. It drives: — `docs/opentui-workspace-spec.md:278`
3. `G` **Exact activity sidecar watcher path and 10 ms debounce remain implementation evidence.** — status tabs. The status tabs keep rendering task statuses only. — `docs/opentui-workspace-spec.md:290`

**→ `docs/screens/workspace.md#focus-and-constrained-terminals`** — 2 statement(s)

1. `P` **Exact Enter start binding is not established in core.** — - `Enter` starts selected agent once or returns to retained terminal. New sessions receive exactly `Active task: <taskId>.` and `Wait for user instructions.` on separate lines. Starting a session … — `docs/opentui-workspace-spec.md:30`
2. `P` **Exact Quick preview footer wording is not established.** — ``` — `docs/opentui-workspace-spec.md:252`

**→ `docs/screens/workspace.md#states`** — 2 statement(s)

1. `P` **Exact warming-up header copy remains unapproved in core.** — - `Enter` starts selected agent once or returns to retained terminal. New sessions receive exactly `Active task: <taskId>.` and `Wait for user instructions.` on separate lines. Starting a session … — `docs/opentui-workspace-spec.md:30`
2. `P` **Exact placeholder wording is not approved.** — - the preview placeholder (`Agent is waiting for input.` while waiting). — `docs/opentui-workspace-spec.md:283`

**→ `docs/screens/sessions-artifacts.md#focus-and-constrained-terminals`** — 1 statement(s)

1. `P` **Exact s picker binding remains candidate evidence.** — - Workspace agents use durable task-session records, saved native conversation IDs, and output logs. `s` opens newest-first session picker with active session marked. Selection displays retained live … — `docs/opentui-workspace-spec.md:34`

**→ `docs/screens/help-dialogs.md#help`** — 1 statement(s)

1. `G` **Exact question-mark help-opening binding is not specified.** — - `?` opens shortcut help. `/` searches; `Enter` replaces the selected row's binding. Binding and description are separate columns in one shared responsive layout, so descriptions stay aligned across … — `docs/opentui-workspace-spec.md:40`

**→ `docs/screens/settings.md#states-and-focus`** — 1 statement(s)

1. `P` **Comma opening binding is not established in core.** — - `,` opens a fullscreen, project-only Settings shell. A three-row header shows `Settings` and `[ Project ]`; a three-row footer shows contextual key hints and status. A 20-column rounded … — `docs/opentui-workspace-spec.md:42`

**→ `docs/screens/tasks.md#states-focus-and-terminal-constraints`** — 1 statement(s)

1. `P` **Exact p override binding and clearing interaction are candidate evidence.** — - New-task creation defaults to inheriting project configuration. Choosing preset saves explicit task override atomically with creation. `p` changes selected task's preset or clears override. `h` … — `docs/opentui-workspace-spec.md:43`

**→ `docs/specs/sessions.md#handoff`** — 1 statement(s)

1. `P` **Replacement-preset chooser and h binding are not established by the core handoff contract.** — - New-task creation defaults to inheriting project configuration. Choosing preset saves explicit task override atomically with creation. `p` changes selected task's preset or clears override. `h` … — `docs/opentui-workspace-spec.md:43`

**→ `docs/specs/tasks.md#launching-work-and-completing-a-task`** — 1 statement(s)

1. `G` **Separate task archive semantics require disposition.** — - Complete, archive, copy, and board move actions. — `docs/opentui-workspace-spec.md:176`

**→ `docs/CONVENTIONS.md#testing`** — 1 statement(s)

1. `G` **Historical cutover acceptance gate requires evidence before retirement rather than a new blanket full-suite rule.** — 11. Full tests, build, actual terminal verification, and compiled CLI smoke pass. — `docs/opentui-workspace-spec.md:353`

## G11 · Backlog.md Refactoring Handoff

**Document:** `docs/refactoring-handoff.md` · **12 statements** — 0 P · 12 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/specs/supported-integration-operations.md#supported-integration-operations`** — 6 statement(s)

1. `G` **HTTP replacement retention requires disposition within selective API scope.** — - Preserve the existing HTTP full-replacement and coercion behavior. Any validation tightening needs a product decision covering port strings/falsy zero, `Boolean("false")`, partial `parseInt`, and … — `docs/refactoring-handoff.md:45`
2. `G` **Port string and falsy-zero validation policy is unanswered.** — - Preserve the existing HTTP full-replacement and coercion behavior. Any validation tightening needs a product decision covering port strings/falsy zero, `Boolean("false")`, partial `parseInt`, and … — `docs/refactoring-handoff.md:45`
3. `G` **Boolean false-string coercion policy is unanswered.** — - Preserve the existing HTTP full-replacement and coercion behavior. Any validation tightening needs a product decision covering port strings/falsy zero, `Boolean("false")`, partial `parseInt`, and … — `docs/refactoring-handoff.md:45`
4. `G` **Partial integer parsing policy is unanswered.** — - Preserve the existing HTTP full-replacement and coercion behavior. Any validation tightening needs a product decision covering port strings/falsy zero, `Boolean("false")`, partial `parseInt`, and … — `docs/refactoring-handoff.md:45`
5. `G` **Non-string ID rejection or dropping policy is unanswered.** — - Preserve the existing HTTP full-replacement and coercion behavior. Any validation tightening needs a product decision covering port strings/falsy zero, `Boolean("false")`, partial `parseInt`, and … — `docs/refactoring-handoff.md:45`
6. `G` **Referenced coercion decisions remain unresolved in core.** — - HTTP validation tightening requires a separate contract decision described above. — `docs/refactoring-handoff.md:58`

**→ `docs/CONVENTIONS.md#testing`** — 1 statement(s)

1. `G` **Current BACK-707.3 real-provider acceptance remains unverified by this dated handoff.** — `BACK-708` refactoring and its source-backed findings review are complete. Keep the uncommitted baseline intact; no commits are requested. Preserve `.envrc` and do not read secrets. `BACK-707.3` … — `docs/refactoring-handoff.md:22`

**→ `docs/SPEC.md#feature-contracts`** — 1 statement(s)

1. `G` **Browser retention and route/modal owner applicability need disposition.** — | Change browser data, routes, modals, milestones, forms, or initialization | `src/web/hooks/`, `components/`, and `features/`; route/modal sessions establish lifecycle identity. | — `docs/refactoring-handoff.md:33`

**→ `docs/adr/README.md#active-decisions`** — 1 statement(s)

1. `G` **Historical Elysia server decomposition has no current retention or technology-selection decision here.** — | Add an HTTP route | `src/server/resources/`, composed by `app.ts`; retain Elysia app, host, task collection, and WebSocket boundaries. | — `docs/refactoring-handoff.md:34`

**→ `docs/CONVENTIONS.md#changes-and-refactoring`** — 1 statement(s)

1. `G` **Agent-only CLI mutation safeguard needs explicit disposition and is not repealed merely by user-editable product files.** — - Markdown is authoritative. Use CLI semantic mutations for Backlog records, not direct task-file edits. — `docs/refactoring-handoff.md:39`

**→ `docs/specs/tasks.md#task-deletion`** — 1 statement(s)

1. `G` **Blanket rollback preservation lacks operation scope and must not imply rollback for partial cleanup.** — - Preserve replacement versus incremental updates, structured Markdown boundaries, locking, rollback, deterministic serialization, and Git transaction ownership. — `docs/refactoring-handoff.md:40`

**→ `docs/architecture/application-boundaries.md#application-controller`** — 1 statement(s)

1. `G` **Specific disposal and allocation-reinitialization outcomes are not described here or in core.** — - Capture project/session identity before asynchronous work and reject stale completions. Disposal and allocation reinitialization are tested contracts. — `docs/refactoring-handoff.md:41`

## G12 · Backlog.md Refactoring Review

**Document:** `docs/refactoring-review.md` · **11 statements** — 0 P · 11 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/specs/supported-integration-operations.md#supported-integration-operations`** — 6 statement(s)

1. `G` **MCP retention remains undecided.** — - CLI, browser, TUI, and MCP express one model; the CLI remains canonical and MCP is a composed optional adapter. — `docs/refactoring-review.md:45`
2. `G` **HTTP full-replacement retention needs scope disposition.** — - Existing HTTP coercion and full-replacement behavior is preserved. Tightening it needs a product decision: port strings and falsy zero, `"false"` Boolean coercion, permissive `parseInt`, and … — `docs/refactoring-review.md:46`
3. `G` **Port strings and falsy-zero validation policy is unanswered.** — - Existing HTTP coercion and full-replacement behavior is preserved. Tightening it needs a product decision: port strings and falsy zero, `"false"` Boolean coercion, permissive `parseInt`, and … — `docs/refactoring-review.md:46`
4. `G` **False-string Boolean coercion policy is unanswered.** — - Existing HTTP coercion and full-replacement behavior is preserved. Tightening it needs a product decision: port strings and falsy zero, `"false"` Boolean coercion, permissive `parseInt`, and … — `docs/refactoring-review.md:46`
5. `G` **Permissive integer parsing policy is unanswered.** — - Existing HTTP coercion and full-replacement behavior is preserved. Tightening it needs a product decision: port strings and falsy zero, `"false"` Boolean coercion, permissive `parseInt`, and … — `docs/refactoring-review.md:46`
6. `G` **Dropped non-string ID policy is unanswered.** — - Existing HTTP coercion and full-replacement behavior is preserved. Tightening it needs a product decision: port strings and falsy zero, `"false"` Boolean coercion, permissive `parseInt`, and … — `docs/refactoring-review.md:46`

**→ `docs/CONVENTIONS.md#testing`** — 1 statement(s)

1. `G` **Dated handoff does not establish current real-provider acceptance.** — `BACK-708` implementation and its source-backed findings review are complete. The refactoring baseline is intentionally uncommitted; do not reset or clean it, and commit only when requested. Preserve … — `docs/refactoring-review.md:22`

**→ `docs/SPEC.md#feature-contracts`** — 1 statement(s)

1. `G` **Browser retention and route/modal architecture applicability need disposition.** — | Browser | `src/web/` | App data and route/modal sessions own refresh and route identity; features own initialization, milestone, form, and modal concerns. | — `docs/refactoring-review.md:33`

**→ `docs/adr/README.md#active-decisions`** — 1 statement(s)

1. `G` **Historical server decomposition is not approval of Elysia or retained HTTP scope.** — | Server | `src/server/` | Elysia app composition, resource plugins, task collection, host lifecycle, and WebSocket publication are separate owners. | — `docs/refactoring-review.md:34`

**→ `docs/specs/tasks.md#task-deletion`** — 1 statement(s)

1. `G` **Blanket rollback assertion needs operation-specific scope.** — - Markdown remains the durable source of truth. CLI semantic mutations preserve metadata, structured-section boundaries, deterministic serialization, locking, rollback, and Git ownership. — `docs/refactoring-review.md:39`

**→ _no owning contract — retire, or escalate as a new decision_** — 1 statement(s)

1. `G` **Current approved supported contracts apply across surfaces.** — - Do not treat internal TypeScript exports as public compatibility surface. Preserve documented CLI, MCP, configuration, and instruction contracts. — `docs/refactoring-review.md:76`

## G13 · Shared agent runtime — canonical handoff

**Document:** `docs/shared-agent-runtime-handoff.md` · **20 statements** — 0 P · 20 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/CONVENTIONS.md#testing`** — 7 statement(s)

1. `G` **Preserve explicit cleanup prohibition until unresolved live ownership is settled.** — 7. **Remaining handoff gates:** the deferred task-watcher F7 seam is complete and committed (`5361dca8`); rebuild MAIN and verify freshness after integration before any runnable handoff. Phase 4 … — `docs/shared-agent-runtime-handoff.md:59`
2. `G` **Scoped withdrawn-harness-test gate remains required and is not fully folded.** — - The separate F1 scope-derived socket expansion was cancelled. Its never-integrated partial changes in `/var/folders/6z/jl00z05s7b7gmlgvjtf7fh9w0000gn/T/opencode/backlog-f1-aoe-harness` are out of … — `docs/shared-agent-runtime-handoff.md:67`
3. `G` **These upstream equivalence claims lack proof.** — - AoE audits pin `563456d8a05eddd2e09628de151d15a0e16b183e` and inspect the noted current-head stop delta at `98a0ba1f035096491e2770c49e9f6ae816a93b83`. Full UI activation-chain and CLI/UI backend … — `docs/shared-agent-runtime-handoff.md:68`
4. `G` **Watcher timing acceptance remains a bounded verification question.** — - MEASURED (latest, quiet acceptance run at `1e630d7e`) — suite runtime: **286/286 files, 2,489 passing, 3 failures, 138.66s at 5 lanes**, no deadline breach and no cleanup warning. One failure was a … — `docs/shared-agent-runtime-handoff.md:71`
5. `G` **Historical load-safety gate requires current-runner verification before retirement.** — - MEASURED (latest, quiet acceptance run at `1e630d7e`) — suite runtime: **286/286 files, 2,489 passing, 3 failures, 138.66s at 5 lanes**, no deadline breach and no cleanup warning. One failure was a … — `docs/shared-agent-runtime-handoff.md:71`
6. `G` **Unresolved residual ownership does not authorize ad-hoc cleanup.** — - MEASURED (temp debris) — **CORRECTED MECHANISM:** the accumulation is not macOS shared-cache extraction. Running a **compiled** Bun binary writes each embedded file to … — `docs/shared-agent-runtime-handoff.md:72`
7. `G` **Retain custom-stream concurrency limitation pending current entrypoint verification.** — - IMPLEMENTED — programmatic CLI entry, superseding the unauthorized-entry-point blocker: `runCli(argv, { cwd, stdout, stderr })` returns its exit code and `src/cli/index.ts` applies the real status; … — `docs/shared-agent-runtime-handoff.md:73`

**→ _no owning contract — retire, or escalate as a new decision_** — 6 statement(s)

1. `G` **Retain canceled-lane execution gate until parent explicitly settles it.** — 3. The map gate is satisfied (see above). Source preparation is consolidated in `src/agent-workspace/sessions.ts` with one runtime classification and a `STARTING` guard; post-startup cleanup … — `docs/shared-agent-runtime-handoff.md:26`
2. `G` **Retain scoped safety reference until its unique gates are verified and folded.** — | [Simplification findings](shared-agent-runtime-simplification.md) | Admission/observation, provenance, locks, lifecycle/deletion safeguards and unresolved field policies | — `docs/shared-agent-runtime-handoff.md:34`
3. `G` **External evidence cannot establish product acceptance.** — | [Pinned AoE deletion audit](aoe-multi-client-deletion-source-audit.md), [completion/resume audit](aoe-natural-completion-resume-source-audit.md), [research … — `docs/shared-agent-runtime-handoff.md:40`
4. `G` **Approval and verification remain separate.** — Update each owning artifact in place when its claims change. Keep checkpoint/lane/proof state here, stable decisions/procedures in their owning plans and contracts, and finding progress in the … — `docs/shared-agent-runtime-handoff.md:42`
5. `G` **Source proof does not grant runtime acceptance.** — 5. **Build/handoff:** MAIN rebuild and freshness verification remain required after integration before any runnable handoff. No live/two-client acceptance or artifact approval is claimed. — `docs/shared-agent-runtime-handoff.md:57`
6. `G` **Mapping cannot establish runtime acceptance.** — 7. **Remaining handoff gates:** the deferred task-watcher F7 seam is complete and committed (`5361dca8`); rebuild MAIN and verify freshness after integration before any runnable handoff. Phase 4 … — `docs/shared-agent-runtime-handoff.md:59`

**→ `docs/CONVENTIONS.md#documentation-maintenance`** — 1 statement(s)

1. `G` **Scoped prerequisite remains required until safety fold despite obsolete external link.** — 1. Read repository [`AGENTS.md`](../../Projects/Backlog.md/AGENTS.md), the [authorized runtime plan](shared-agent-server-plan.md) and [technical safeguards](shared-agent-runtime-simplification.md). … — `docs/shared-agent-runtime-handoff.md:24`

**→ `docs/CONVENTIONS.md#tooling-and-validation`** — 1 statement(s)

1. `G` **Build ownership is folded but scoped integration and commit assignment remain execution gates.** — 4. Before named tests, audit their fake/resource boundaries. Reuse valid proof. Parent owns source reconciliation, final doc review, commit orchestration and MAIN build/freshness/installed-binary … — `docs/shared-agent-runtime-handoff.md:27`

**→ `docs/BLUEPRINT.md#component-ownership`** — 1 statement(s)

1. `G` **Outstanding source reconciliation checkpoint remains unverified.** — 7. **Remaining handoff gates:** the deferred task-watcher F7 seam is complete and committed (`5361dca8`); rebuild MAIN and verify freshness after integration before any runnable handoff. Phase 4 … — `docs/shared-agent-runtime-handoff.md:59`

**→ `docs/specs/sessions.md#deleting-a-session`** — 1 statement(s)

1. `G` **Exact sidecar scope and recovery remain unresolved.** — - Per-session CLI live-force deletion is OPEN; flagged live currently refuses even force, direct force can stop. Strict/retryable per-session sidecar cleanup is PROPOSED. Core task forget-only … — `docs/shared-agent-runtime-handoff.md:64`

**→ `docs/CONVENTIONS.md#general-principles`** — 1 statement(s)

1. `G` **Retain explicit canceled-work exclusion until parent resolves disposition.** — - The separate F1 scope-derived socket expansion was cancelled. Its never-integrated partial changes in `/var/folders/6z/jl00z05s7b7gmlgvjtf7fh9w0000gn/T/opencode/backlog-f1-aoe-harness` are out of … — `docs/shared-agent-runtime-handoff.md:67`

**→ `docs/specs/supported-integration-operations.md#supported-integration-operations`** — 1 statement(s)

1. `G` **Current-model capture with inherited context still needs runtime evidence.** — - IMPLEMENTED — conversation guard removed, replacing the previously open `mode-model.ts` decision: the guard that rejected conversation-bearing workspace contexts is gone … — `docs/shared-agent-runtime-handoff.md:70`

**→ `docs/SPEC.md#open-product-decisions`** — 1 statement(s)

1. `G` **Specific input-close and watcher evidence still require scoped disposition.** — - Decisions are tracked outside the repository as [pending decisions](pending-decisions.md) and the decision sheets; this handoff records only their current state. The five formerly open decisions … — `docs/shared-agent-runtime-handoff.md:75`

## G14 · Test suite runtime report

**Document:** `docs/test-suite-runtime-report.md` · **11 statements** — 6 P · 5 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/CONVENTIONS.md#testing`** — 11 statement(s)

1. `P` **Approval and continuing applicability of the three-minute target are not established.** — The target is a full run under three minutes; the default configuration now meets it with margin. — `docs/test-suite-runtime-report.md:39`
2. `G` **Summary interpretation and progress-line workaround concern the retired runner and need applicability confirmation.** — counted as successes there. Grep the progress lines for `failed in` instead. — `docs/test-suite-runtime-report.md:50`
3. `G` **Continued applicability of template cloning needs confirmation without shared mutable fixture state.** — | One prepared project template per suite, cloned per case (`cp` = APFS clonefile, ~3 ms) instead of rebuilding | removed repeated `git init` + project init + config writes | — `docs/test-suite-runtime-report.md:82`
4. `P` **Need for this historical limiter under native runner is not established.** — | `createConcurrencyLimiter(width)` slot pool in `test-utils.ts` | caps how many cases of one process touch the machine at once, for suites where unbounded overlap caused real-time waits to expire … — `docs/test-suite-runtime-report.md:86`
5. `G` **Platform subset policy and exact CI job bound are historical configuration claims requiring confirmation before promotion.** — uses a 10-minute job timeout instead of the former runner deadline. — `docs/test-suite-runtime-report.md:175`
6. `P` **Later F7 remediation challenges fixed absence waits so these exact waits are not established requirements.** — - `cli-json-watch`: 1300 ms debounce and 1100 ms liveness waits on a real interval. — `docs/test-suite-runtime-report.md:183`
7. `G` **Necessity of particular real-clock waits must be reconciled with later completion-fence practice.** — - `config-watcher`, `task-watcher`, `watch-json`: production settle/read budgets and real-clock waits. — `docs/test-suite-runtime-report.md:184`
8. `P` **Three-minute expectation and exact job timeout in the example are not established durable budgets.** — ## 9. How to run — `docs/test-suite-runtime-report.md:201`
9. `P` **Exact historical CI bound is not established as durable policy.** — CI bounds the test job at 10 minutes. A full run is ~150 s on an idle 10-core machine and targets — `docs/test-suite-runtime-report.md:215`
10. `P` **Approval of three-minute performance target is unresolved.** — under three minutes; local runs rely on the caller to bound a busy or stalled process. — `docs/test-suite-runtime-report.md:216`
11. `G` **Isolation requirements do not prove the absolute no-stall or no-impact claim under all shared-machine conditions.** — A live `agentic-workspace workspace` therefore cannot stall a run, or be affected by one. — `docs/test-suite-runtime-report.md:227`
