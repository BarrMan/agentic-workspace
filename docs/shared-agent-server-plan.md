# AOE-style shared runtime: simplification plan

## Status and evidence

This replaces the per-instance isolation plan, with implementation authorized by the user. Oracle statically reviewed the direction, actual MAIN seams and feature inventory; neither authorization nor static review constitutes artifact approval or runtime acceptance.

- Reference: [pinned AOE source audit](aoe-multi-client-deletion-source-audit.md).
- Runtime simplification oracle: [source findings and required actions](shared-agent-runtime-simplification.md).
- Task deletion contract: `backlog/tasks/back-27/spec.md`; its planning artifacts remain drafts.
- Prior persistence context: [session-persistence-decisions.md](session-persistence-decisions.md).
- Repository execution/build rules: `AGENTS.md` is authoritative.
- Mutable checkpoint and next-agent entry map: [canonical handoff](shared-agent-runtime-handoff.md).
- Test-work procedure, all fourteen findings and proof ledger: [remediation plan](test-suite-remediation-plan.md). The original static report remains evidence, not a rerun.

AOE is the reference for instance-owned tmux lifecycle, not global provider-native-ID exclusion or descendant settlement. Keep Backlog's exact saved-ID/provider command correctness, noninteractive ask behavior, and instance/task publication safeguards; do not add cross-instance native-ID exclusion or descendant-settlement prerequisites.

## Runtime choices

- Independent local TUIs share normal tmux or the existing configured socket override. No required new daemon, app-specific socket setting or per-frontend server.
- Each UI owns its selection. Shared `activeSessionId` is a history preference, not execution selection or another frontend's teardown authority.
- Distinct conversations in the same task/mode may run independently. Multiple clients may attach to one verified runtime; its input and terminal sizing are shared intentionally.
- New, live attach and stopped resume are distinct. The authorized AoE-style policy automatically resumes the saved native ID, with fresh-session fallback when it fails; successful resume preserves the exact ID and configuration, fallback may use a new ID. The setting and failed-resume marker data model are represented in `src/agent-workspace/types.ts`, `src/agent-workspace/config.ts`, and `src/agent-workspace/sessions.ts`; remaining policy work is phases 3–4 in the [handoff](shared-agent-runtime-handoff.md#immediate-remaining-proof). An absent frontend is not evidence that execution stopped.
- Quit/detach disposes UI transport, not the agent. Agents survive until natural termination or explicit stop. No idle, last-client or finish-then-clean garbage collection.
- Reopen reloads shared records and discovers surviving runtimes. Necessary recovery is separately serialized; no latest-private-instance selection or exclusive frontend adoption. Foreign target identity and backend transport/probe errors remain errors, not absence.
- CLI/headless execution uses the same shared runtime and persistent lifetime. History/output reads start no infrastructure. Ask retains its existing stopped-only, noninteractive timeout, partial-output and streaming contract.

## Feature preservation

Keep tasks, references, artifacts and user-only approval; fixed/configurable modes, profiles and task → project → user configuration; distinct same-mode conversations; OpenCode v1/v2 runtime adapters, Claude and Pi; exact native IDs; history, resume, logs/output and bootstrap delivery; embedded VT/input/resize and activity display; canonical task roots, resolved project/external state roots and worktree execution paths.

Preserve explicit stop and task-completion/worktree behavior. Task deletion is the deliberate exception: forget task associations without stopping processes, deleting provider conversations or removing worktrees/branches.

No feature removal is implied by removing a helper or protocol. Retain only the existing mechanism needed for the feature; do not keep a whole lifecycle architecture simply because logging or transport currently passes through it.

## Minimum boundaries and safeguards

- Reuse `createSessionTransport()` in `src/agent-workspace/session-process.ts` for socket/executor routing; `preparePane()` already supplies tmux-owned append capture.
- Superseded: `AgentSessionService` as the orchestration boundary. Follow the current ownership rules in [the target design](session-service-redesign.md).
- Reuse `SessionStore` locked reload/mutate and task/reference/admission locks. The complete read-modify-write must occur under the same state lock.
- Keep instance/task admission locks and current-record checks around publication races. They protect one Backlog instance's state; do not claim or implement global/exact provider-native-ID execution exclusion across instances. A verified live owned pane attaches; a dead/missing owned pane is not-live and can be resumed by explicit intent.
- Preserve durable logging independently of every UI reader. Attaching another client must not replace the log capture pipe, truncate output or steal another reader's VT lease.
- Exact identity and validated ownership—not PID alone—authorize signalling. A shared socket never authorizes `kill-server` as UI cleanup. Do not copy AOE's swallowed kill errors.
- Use existing watchers to reload shared state and clear deleted selections. Watch notifications are hints; AOE's verified five-second fallback applies when watching/subscription is unavailable, not as a guarantee for every missed event.

## Deletion semantics

Core owns exact all-mode association/marker/known-file removal under caller-held existing task/reference/admission locks, without reacquiring them. Clean exact owned sidecars/markers before metadata/container; perform no tmux probe, signals, provider or Git deletion. Status or frontend ownership does not block forgetting. Local deletion and another workspace's removal notification relinquish management without stop/kill; no second unlocked UI purge.

Pending publication, delayed callbacks and same-ID replacement must not recreate a removed association or mutate its replacement. Check exact record membership under the relevant admission/mutation boundary.

Validate Backlog-owned paths; never follow persisted paths into provider/user/unrelated-task storage. Cancellation changes nothing. Distinguish failures before task removal from committed removal with incomplete cleanup; do not claim rollback of committed effects.

The user accepts disruption from deleting known Backlog sidecars while processes still use them and possible later hook-file recreation. Those accepted limits do not authorize termination or association resurrection.

## Backend completion and exact resume

- Use the AOE instance-owned tmux lifecycle, without a process-tree settlement gate or cross-instance native-ID exclusion. `SessionProcess.alive` retains its signature and classifies exit 0/stdout 0 as live, stdout 1 as dead, and the canonical exact missing-target error as dead; other probe/transport errors remain errors. `nativeRuntimeClassification` returns `live | dead | missing | uncertain(reason)`, preserving ownership diagnostics on errors.
- `kill` and `killRetired` retain their signatures and use tmux lifecycle teardown, including dead/absent owned-pane cleanup; do not wait for or prove descendant termination. Explicit stop/completion stops the owned tmux instance and propagates errors. This does not promise every descendant process has exited.
- Natural exit reconciles a verified dead/missing instance as stopped. Explicit resume clears the outgoing owned pane/resource reservation using validated paths, then tries the exact saved native identity; if that SID fails to resume, start a fresh session per the user-selected AoE-style fallback. No descendant ledger, receipt, or all-descendant settlement prerequisite is required. Backend transport/probe errors and foreign target identity are not absence.
- Keep instance/task state and admission locks plus current-record membership checks so delayed callbacks cannot publish into a deleted or replaced task/session. These protect same-Backlog-instance publication races, not global native-ID uniqueness.
- Explicit native preparation preserves the shared history preference until explicit activation. Local frontend selection remains independent.
- Use AOE's instance-owned lifecycle: a verified live pane attaches/causes start to be skipped; a dead pane is cleaned and the same instance's saved native ID is relaunched; explicit restart tears down the outgoing pane before launch. Preserve provider-native resume flags/capability and conversation identity when resume succeeds; the selected fallback starts fresh after a failed SID. See [the focused source audit](aoe-natural-completion-resume-source-audit.md) for source facts and limits.

Acceptance: no global native-ID alias rejection; preserved IDs and provider command correctness; natural exit into a retained pane, detach/reopen, and explicit resume; same-instance race permits one launch; dead/missing stop; exact target and truthful error handling; deletion sends no process signals. Verify foreign target/uncertain probe errors remain errors and stale callbacks cannot mutate a replacement record.

## Five dependency-ordered working slices

Priority and detailed source-grounded actions are in the [runtime simplification findings](shared-agent-runtime-simplification.md). The dependency order below replaces isolated flag-retirement patch waves: simplify runtime classification/request admission and frontend-local selection first; consolidate launch and explicit lifecycle next; integrate forget-only deletion and prove retained features; remove obsolete consumers/field writes only after policy gates; then validate the assembled change.

### 1. Simplify classification, admission and local selection

Scope: existing `sessions.ts`, `session-process.ts`, `live/{agent-host,existing-agent-host}.ts` and `workspace-controller.ts` seams.

Unify exact-runtime observation and actual request admission while keeping frontend-local attachment/selection separate. Revalidate marker, record and runtime under existing admission/session claims; preserve queued requests and make uncertainty non-mutating. Do not treat a missing flag or PID as authority.

Proof: live attaches; conclusive dead/missing settles; uncertain/error does not mutate; queued adoption is not settled STOPPED; multiple entrypoints share behavior. Parameterize shared checks rather than duplicate implementations. Preserve two-client logging, identity and detach behavior.

Slice 1 implements the oracle's transient-mode recommendation: mode-filtered `WorkspaceStateService.listSessions`/`listMode` cannot authorize controller request admission or reliably discover a request's owning mode. Service admission validates owning mode under existing task/session claims and returns a required **transient** `modeId` alongside its attachment on live/fresh outcomes; no persisted session/JSON schema change. Controller admits directly without status/native-flag/mode lookup prechecks, then uses returned mode only for local `(task, mode)` and session-mode bookkeeping. It preserves selected task/mode/focus and rechecks the exact pair after a raced local handoff/start. Mode-filtered APIs and real fixtures remain honest; no all-task scan or fake aggregate. Current source proof and completed admission commit are recorded in the [handoff](shared-agent-runtime-handoff.md).

The [canonical AoE functionality map](aoe-functionality-map.md) is verified: it covers 97 features across S/R/W/A/C/O and is independently audit-verified coverage-complete and accurate (92 body-verified, 4 signature-level, 1 grep-only; thin-entry depth gaps are documented there). With explicit parent/user authorization, AoE-aligned implementation may proceed, including approved resume policy phases 3–4 and remaining test remediation. Source preparation consolidation and the controller's post-startup cleanup ownership are represented in `src/agent-workspace/sessions.ts` and `src/ui/opentui/workspace-controller.ts`. Remaining tasks and proof limits are in the [handoff](shared-agent-runtime-handoff.md); MAIN rebuild and freshness verification remain mandatory before a runnable handoff.

### 2. Consolidate launch mechanics and explicit lifecycle

Slice 2 `prepareSessionLaunch` consolidation is committed as `50d5b5ebcba9be1854d5478876abab826b625a62` (exactly `sessions.ts` and `shared-runtime-service.test.ts`); 84 tests and types passed, with scoped lint/diff. F8 `fix-10` committed as `645f0996ea40e24adda51b19a7c165c448027469` (exactly `atomic-task-edit.test.ts` and `task-delete.test.ts`); 19 tests and scoped Biome/diff passed. Oracle `ses_ecf96b0ceffeF5Junf7rGFYyjy` reverified the cleanup correction: pre-dispatch cleanup always performs validated kill and eligible FAILED publication; there is no post-dispatch kill; original error and secondary-error precedence remain correct. Public regression sensitivity is RED before / GREEN after across real preparation, controlled cleanup rejection, identity race and fake owned transport (zero dispatch, pane gone, hook reset in `finally`). No other material regression was found.

Source preparation consolidation is complete in `src/agent-workspace/sessions.ts`; its focused coverage is in `src/agent-workspace/shared-runtime-service.test.ts` and `src/test/agent-sessions.test.ts`. The `STARTING` guard remains part of classification. Controller post-startup cleanup ownership is in `src/ui/opentui/workspace-controller.ts`. The map gate is satisfied and authorized work may proceed; phases 3–4 of resume policy and the deferred task-watcher F7 seam remain. No live/two-client acceptance is claimed.

After classification/admission interfaces stabilize, share create/context/prepare/capture/dispatch/resource cleanup. Keep exact saved-native/provider resume distinct from fresh launch, direct-start publication distinct from explicit activation, and teardown explicit. Keep resume validation before mutation and retirement transition before `killRetired`.

Proof: one launch, two writable views; either/both detach without kill, lost logging or changed identity. Exact resume, stop failures and current-record publication checks remain correct.

### 3. Integrate BACK-27 forgetting and prove retained features

Scope: `src/core/{backlog,task-lifecycle-service}.ts`, `sessions.ts`, controller and only implicated host-disposal paths.

Core task deletion as locked association-only forget is already implemented: exact known files/markers and associations, no signals, provider/Git deletion or second UI purge. Initial slice 3 proof passed 12 `task-delete.test.ts` and 73 `controller.test.ts` cases without edits. A delayed-host-start/task-ID-reuse regression was fixed in preserved local-transport-lifecycle WIP by the same owner; no backend kill, provider/Git/probe or second purge changes. Source writers are terminal; parent acceptance/commit remains pending. This is not per-session CLI deletion policy.

Proof: owned/foreign RUNNING, STARTING, PARKED and stopped records, mixed modes, cancellation, pending publication, replacement task ID, unrelated task and truthful pre/post-removal failures. Preserve explicit-stop claim-release tests and existing feature coverage.

### 4. Remove obsolete consumers and field writes

Scope: `src/commands/agent-workspace.ts`, existing runtime/discovery consumers and version-2 history writers/readers.

Superseded: compatible reads of earlier v2 JSON are not authorized by this plan. Follow SPEC's Current-contract-only policy; identify affected stored data and ask the user about preservation and manual conversion before changing its contract.

Proof: no field-dependent behavior differences in attach/send-key, stop, cleanup, classification or discovery; retained ask timeout/partial output and provider-mismatch refusal; stop failures and completion behavior. Do not silently change running-limit kills.

### 5. Verify assembled behavior

Remove superseded private runtime allocation/attachment ownership, exclusive frontend recovery, auto-GC and readiness machinery only after consumers are replaced. Keep useful resource/path validators, process safety and accepted test ownership infrastructure.

Do not blanket-revert the private-foundation commit: some code remains reachable. Do not integrate parked private-consumer, startup-witness, v3-history, cutover-descriptor or migration patches merely because they exist.

Proof: no unintended private/auto-stop entrypoints; combined feature regressions and assembled types; MAIN build/freshness and specifically permitted disposable CLI/two-client checks.

## Format and migration limits

Preserve current version-2 nested-mode history unless a concrete necessary change is demonstrated. A planned v3 or private-cutover descriptor is not a product feature. Choose one current context/routing protocol; no permanent dual reader, retired fallback or automatic repair.

No schema revision, descriptor or offline cutover solely for task deletion or a discarded private-only policy. Any genuinely required conversion is separately authorized, backed up, performed with writers proven quiescent and validated before use. Locks or confirmation flags are not quiescence evidence. Never automatically rewrite/delete native IDs or provider conversations.

## Execution and verification rules

- Implement the dependency-ordered slices under the user's authorization and the [simplification findings](shared-agent-runtime-simplification.md). Resolve per-session live-delete and running-limit policy with the user before changing those behaviors. These remain unresolved policy gates; current slice 1 does not change them.
- Keep coupled session/controller/CLI flow under one coherent owner. Disjoint mechanically-owned application-behavior tests or backend work may proceed only after interfaces stabilize. Do not create dependency-overlay stacks or accept an unfinished lane as a working slice. Each integrated slice preserves a testable app and existing features. The authorized test-the-test deletion is complete per the [remediation plan](test-suite-remediation-plan.md); do not replace those suites with self-tests.
- Start a fresh bounded agent/context for each new work item, with short pointer handoffs/results, fixed disjoint write scopes and no subdelegation, raw logs or broad reads. Keep each agent within 150K tokens; same-task refinements must remain small and must not expand scope. Never repeatedly revive oversized aborted `ses_ed05301e7ffew4pYkH43lHwMHt`. Reconcile terminal results and inspect partial edits after cancellation before replacing a writer. Use hook-driven completion, not polling or `wait_for_user`, for agents.
- **User-required sequence:** verify and commit each completed slice BEFORE the next implementation slice; do not start the next implementation slice until the verified commit exists. The map gate is satisfied; proceed only with explicit parent/user authorization. Use a fresh commit-only agent, explicit intended-file staging and normal hooks; preserve unrelated WIP. Lint-staged's automatic backup stash is allowed. Manual stash/reset/clean/amend/push, Git config changes and hook bypasses are not authorized. A checkpoint commit is not a runnable handoff or runtime acceptance.
- Apply the relevant report refactor before fixing residual failures in a failing area; green patched assertions alone do not complete remediation. Follow the remediation plan's separate bounded lane for remaining findings; the map gate is satisfied.
- Audit fake/resource safety before bounded named application-behavior tests; reuse valid proof. Runner heuristic temporary CLI bundles are normal test mechanics, not installed MAIN builds. Run only necessary application suites; do not add test-the-test replacements. Rebuild MAIN and verify source freshness after integration before any runnable handoff.
- Source/fake proof is not runtime acceptance. Real checks require disposable isolated fixtures and verified target-ownership boundaries; do not reuse earlier accidental-live results.
- Earlier live fixtures still lack terminal provenance. Possible survivors remain unresolved; this plan authorizes no ad-hoc signals or cleanup. Do not perform ad-hoc live cleanup; the parent owns any later explicitly permitted isolated live acceptance and MAIN build.
- Preserve unrelated changes, task data and `.artifacts.json`. Normal commit hooks and checkpoint rules apply; no reset, history rewrite, blanket rollback or artifact approval.

These slices are the replacement work graph. Field minimization is not a prerequisite to the structural flow; stop field writes only after its consumers and policy gates are resolved. Log/bootstrap redesign, provider-readiness projects and unrelated migration work are not prerequisites.
