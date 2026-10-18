# Implementation alignment plan

## Authority and scope

This is a bounded execution plan and evidence ledger, not a contract. Authority remains with [PRODUCT](PRODUCT.md), [SPEC](SPEC.md) and its linked [feature contracts](SPEC.md#features), [BLUEPRINT](BLUEPRINT.md) and its [blueprint pages](BLUEPRINT.md#detailed-pages), [CONVENTIONS](CONVENTIONS.md), [DESIGN-SYSTEM](DESIGN-SYSTEM.md), [screen specifications](screens/README.md), and [accepted ADRs](adr/README.md). Resolve conflicts against the owning contract; do not change a requirement to fit existing code.

Scope is an entire-project alignment audit followed by only evidenced, contract-required source/test corrections. This plan does not authorize contract edits, unrelated broad refactors, new mirrored interfaces, permanent migrations/aliases/compatibility paths, automatic repair of user data, or safety-gate weakening. Incompatible real data may receive manual correction only with explicit preservation authorization. Escalate genuine unresolved policy/architecture decisions to the owner; do not treat approved requirements as open decisions.

The `research/aoe` plans are explicitly historical evidence. Do not adopt their claims as authority or edit/delete them in this work. No current task ID is supplied; this supporting plan belongs here in `docs/`.

## Evidence ledger: initial baseline

Evidence labels: **confirmed source mismatch** means code inspected directly conflicts with an owning requirement; **installed-only drift** is currently established only by installed CLI behavior; **candidate** is a focused lead that needs full path/contract tracing; **unverified** means no conformance conclusion. Inspection is not executed test evidence. Recheck only the named paths and requirements as packages begin.

| State | Initial evidence | Required follow-up |
|---|---|---|
| Confirmed source mismatch | `src/agent-workspace/config.ts:356-362`, `resolveAgentConfiguration`, returns whole card config before project/root fallback; CONFIG-003 requires field-wise task > project > root, preserving explicit `false`. Presets call through this resolver. | P4 traces all fields and callers; test field inheritance, false override, and current settings on start/resume/ask. |
| Source guard present; diagnostic mismatch candidate | `src/agent-workspace/config.ts:341-348`, `requireProjectModeCatalog`, rejects absent catalogue. Its error directs users to unsupported `agent-config init project`. Do not claim the catalogue guard is missing. | P4 traces all failure wording/callers; correct unsupported guidance where this path is reachable. |
| Consolidated | CONFIG-002 requires one project configuration file including presets and catalogue. Presets and catalogue now live in the project YAML `agentic-workspace.config.yml` under `agent_configuration`. | Consolidation is complete; no separate agent configuration file remains. |
| Installed-only drift | Installed root/`agent-session --help` exposed `init`, task/milestone plural aliases, cleanup, instructions, and `agent-session reset`, conflicting with IF-API-011/013 inventory. | Source inventory before claiming source mismatch. `src/cli/features/tasks/register.ts` registers an alias; trace handlers, callers, fixtures and docs. Remove forbidden operations and their callers, not merely help entries. Keep `workspace` as the intentional user entry point. Approved exhaustive operation list: [supported integration operations](specs/supported-integration-operations.md#supported-integration-operations), especially lines 319-340. |
| Confirmed source mismatch | `src/ui/opentui/workspace.ts:675-677` header `Agent session · mode · status` omits actual workdir and required ordered agent/status/mode/path. See [workspace screen](screens/workspace.md#ordered-regions). | UI package corrects and tests full ordered header, including actual path. One designer owns every `workspace.ts` write. |
| Candidate | Workspace tab/selected chrome may diverge from screen requirements. | Verify complete render paths and screen states before any correction. |
| Confirmed risky path; outcome unverified | `src/agent-workspace/sessions.ts:503-537` deletion uses persisted RUNNING/STARTING, native refusal and forced non-native `process.kill`. SESSION-002/020 require observed evidence and verified ownership. | Highest-priority session trace; prove exact ownership/provenance and current observation before destructive effects. Do not infer safe PID ownership. |
| Not an established defect | `src/agent-workspace/session.test.ts:107-128` startup checkpoint rejection retains execution relationship/evidence. This can be correct: startup failure retains tracking; distinguish it from final publication failure rollback. | Verify both outcomes against BLUEPRINT creation settlement and session contract. Existing inspected tests at `81-128,247-268,377-435` are inspection only, not executed tests. |
| Unverified | Exact provider resume identity/readiness; 30-second all-task observation; captured endpoints; provider-state nonownership; handoff/concurrency/admission. Absence of a method named `observe()` alone is not a violation; semantics control. | Session/Harness package builds scenario evidence from behavior, tests, and live provider/runtime where required. |
| Unverified | Task/storage behavior broadly. Pointers: `src/core/task-identity-index.ts`, `src/utils/task-record-index.ts` for TASK-003; `src/file-system/task-artifact-repository.ts` and its test for artifact containment; `src/test/task-container-lifecycle-contract.test.ts` for selected preservation/collision/deletion cases; `src/git/task-worktree.ts` and `src/test/task-worktree-lifecycle.test.ts` for TASK-012. | Audit all listed TASK requirements, not inferred from sampled tests. TASK-006/008 roots/relocation and TASK-015–019 full deletion cleanup chain require trace. TASK-020–022 also require explicit audit. |
| Confirmed source deletion gap | `src/core/task-lifecycle-service.ts:156-178` delete calls `sessions.forgetTaskSessions` and then container removal without worktree cleanup; `src/agent-workspace/sessions.ts:417-422` explicitly does not stop runtime; `src/test/task-delete.test.ts:431-467` asserts no-stop; `src/git/task-worktree.ts:133-143` is best-effort and suppresses cleanup failures, so merely calling the helper is insufficient. | P5 coordinates TASK-015–019 acceptance: establish observed ownership/liveness; preflight all native targets before any stop; preserve in-flight input lifetime; cleanup before forget; remove worktree/branch; retain tracking if execution cleanup fails; report truthful partial effects. Do not reopen settled deletion policy; the required per-operation user confirmation remains mandatory. Distinguish destructive confirmed task deletion (remove worktree/branch) from safe stale-registration pruning (preserve contents/work). |
| Candidate | `src/index.ts` broad exports and `commands/project-view-commands.ts` importing it merit ownership/import review. | No proven violation or preauthorized API contraction; trace concrete dependency direction and actual public surface. |
| Not a defect by itself | Core imports of FileSystem/Git are permitted by BLUEPRINT. Sampled strict TypeScript, Biome, and test colocation appear aligned. | Validate relevant full package/scripts; do not recast these observations as a blanket pass. |
| Unverified | All six screens, DESIGN-SYSTEM behavior, IF-FS and other IF-WB/IF-SI behavior, remaining requirements and architecture scenarios. | Use per-requirement ledgers and source/runtime evidence, not broad absence claims from limited searches. |

## Coverage matrix and package ownership

Every requirement is audited; no family is presumed aligned. At the first package checkpoint, expand each compact ID range below to one ledger row per requirement and per acceptance/failure/recovery subscenario. Do this before implementation, not as 87 blank rows in this plan. For each requirement record owner, exact implementation references, test references, status (`unknown`, `gap`, `blocked`, `verified`), evidence type, and concise result. `verified` requires requirement-specific evidence. Full alignment requires every applicable row verified: any unknown, gap, or blocked row means INCOMPLETE. A bounded progress handoff may disclose blockers but is not an alignment completion claim.

| Coverage target (all IDs/sections required) | Owning package |
|---|---|
| TASK-001–TASK-022; each complete requirement plus flow, acceptance, edge cases, failure/recovery; [tasks contract](specs/tasks.md) | P2 accountable for TASK-001–011,014,020–022; P5 accountable for TASK-012–013,015–019. Record contributing cross-package scenarios at P1. |
| SESSION-001–SESSION-020; every startup/resume/observe/handoff/cleanup scenario; [sessions contract](specs/sessions.md) | P3 Harness/runtime and session behavior; deletion also coordinated with P2/P5, no shared-file split. |
| CONFIG-001–CONFIG-014; each configuration, precedence, catalogue, approval, preset, permission/model, deletion and startup scenario; [configuration contract](specs/configuration.md) | P4 Configuration fixer; P5/P8S contribute operation and UI consumption evidence. |
| IF-WB-001–IF-WB-008; [workspace and board](specs/workspace-and-board.md) | P7 Workspace UI (render/interaction owner: designer). |
| IF-FS-001–IF-FS-003; [filtering and search](specs/filtering-and-search.md) | P8B backend search fixer accountable; P5 corpus/archive wiring, P6 output and P8S filters UI contribute their scenarios. |
| IF-SI-001–IF-SI-007; [session interaction and feedback](specs/session-interaction-and-feedback.md) | P7 accountable; P3 contributes session behavior and P5 shared coordination. Freeze scenario ownership at checkpoint. |
| IF-API-001–IF-API-013; exhaustive operation inventory, every named operation/option and excluded surface; [integration contract](specs/supported-integration-operations.md), including inventory lines 319-340 | P6 CLI surface/parity. |
| All six screen docs: [workspace](screens/workspace.md), [board](screens/board.md), [tasks](screens/tasks.md), [settings](screens/settings.md), [sessions and artifacts](screens/sessions-artifacts.md), [help and dialogs](screens/help-dialogs.md), every composition/state/focus/action/size section | P7 workspace; P8S other screens. All UI work authored/reviewed by designer; one writer per file. |
| [DESIGN-SYSTEM](DESIGN-SYSTEM.md), every shared pattern/status/focus/dialog/open question | P7 design owner; P8S applies shared patterns, not a separate competing style. |
| [PRODUCT](PRODUCT.md), all vision/scope/users/goals/non-goals | P9 read-only auditor; escalate scope ambiguity, no source change absent owning-contract correction authorization. |
| [BLUEPRINT](BLUEPRINT.md), [task blueprint](blueprints/task.md), [session/Harness blueprint](blueprints/session.md), [controller blueprint](blueprints/controller.md), every ownership/operation/failure/open-decision section | P1 seam freeze and P9 audit; implementation owners P2–P8S/P8B. |
| [ADR-0001](adr/0001-model-owned-domain-behavior.md), full decision and consequences | P1 seam freeze; P9 confirms package changes preserve it. |
| [CONVENTIONS](CONVENTIONS.md), all engineering/error/concurrency/test/refactoring/validation rules | P9 audit and every package's applicable verification. |

### First-checkpoint ledger expansion

Expand compact family rows into one row for each ID below and further rows for every distinct acceptance, failure, interruption/recovery, repeated/concurrent operation, and invariant scenario in its owning contract. Retain these exact identifiers; do not collapse them back to a “family passed” checkbox.

| Family | IDs to create at checkpoint |
|---|---|
| Tasks | TASK-001, TASK-002, TASK-003, TASK-004, TASK-005, TASK-006, TASK-007, TASK-008, TASK-009, TASK-010, TASK-011, TASK-012, TASK-013, TASK-014, TASK-015, TASK-016, TASK-017, TASK-018, TASK-019, TASK-020, TASK-021, TASK-022 |
| Sessions | SESSION-001, SESSION-002, SESSION-003, SESSION-004, SESSION-005, SESSION-006, SESSION-007, SESSION-008, SESSION-009, SESSION-010, SESSION-011, SESSION-012, SESSION-013, SESSION-014, SESSION-015, SESSION-016, SESSION-017, SESSION-018, SESSION-019, SESSION-020 |
| Configuration | CONFIG-001, CONFIG-002, CONFIG-003, CONFIG-004, CONFIG-005, CONFIG-006, CONFIG-007, CONFIG-008, CONFIG-009, CONFIG-010, CONFIG-011, CONFIG-012, CONFIG-013, CONFIG-014 |
| Workspace and board | IF-WB-001, IF-WB-002, IF-WB-003, IF-WB-004, IF-WB-005, IF-WB-006, IF-WB-007, IF-WB-008 |
| Filtering and search | IF-FS-001, IF-FS-002, IF-FS-003 |
| Session interaction and feedback | IF-SI-001, IF-SI-002, IF-SI-003, IF-SI-004, IF-SI-005, IF-SI-006, IF-SI-007 |
| Supported integration API | IF-API-001, IF-API-002, IF-API-003, IF-API-004, IF-API-005, IF-API-006, IF-API-007, IF-API-008, IF-API-009, IF-API-010, IF-API-011, IF-API-012, IF-API-013 |

Suggested ledger columns: `requirement/scenario | accountable owner | implementation path + symbol/lines | test path + case | status | evidence type | result/decision`. Include each screen document and every named architecture/design/ADR/convention section as individual section rows or exact section-group rows, with links to their owning contract. There is no automatic pass from a sibling scenario. If a requirement has multiple implementations/adapters, ledger each and record parity evidence.

The ID ranges in the compact matrix represent every member of the stated family, not a sample. The explicit enumeration above is the checkpoint row-generation list; it is not a substitute for reading each requirement body and its linked sections. Confirm generated row count against the family totals before any package write.

For screen and architecture coverage, record both the owning document and its section heading so a later contract edit can be compared deliberately. Keep source/test references close to the specific scenario they prove, not in one package-level citation with no mapping.

For a “no implementation change” result, ledger the exact path/behavior inspected and its supporting test or live evidence. If no source implementation exists but the contract requires it, record a gap only after verifying the owning path and supported call flow; a broad search miss by itself is not enough.

## Package audit slices

The following slices guide the first ledger discovery only; they do not predeclare gaps. Auditors map each requirement to actual source callers and tests and add any missing path before package writes. If a listed slice spans another owner, record the dependency and stop rather than editing that owner's file.

### P2 — Task domain and repositories

- Read all TASK-001–022 headings, behavior, outcomes, failures and acceptance criteria in `specs/tasks.md`; inspect all linked flow/invariant/storage sections, not only the criteria.
- Enumerate task creation/ID allocation and lookup; full-string identity, ambiguous collisions, archived ID reservation; configured statuses, dependencies and user-directed actions.
- Enumerate project storage location, custom roots, relocation, path resolution, artifact containment/symlinks, data preservation, worktrees and task lifecycle effects.
- For TASK-013–019, ledger status-only Done separately from completion and archive/deletion behavior; trace each cleanup side effect and stopping point in the full chain.
- For TASK-020–022, inspect their exact requirements and callers; do not infer coverage from the artifact containment test.
- Acceptance: task identity and unrelated records survive collisions/failures; relocation/deletion reports completed effects without pretending rollback; artifact traversal/symlink escapes fail closed; no required workflow/documents inferred from default names. P5 owns lifecycle archive/deletion scenarios TASK-012–013,015–019.
- Recovery: inspect interrupted multi-step operations and cleanup failures for preserved resources/evidence. No automatic data repair, retries, migration, or compatibility projection.

### P3 — Session and Harness

- Read each SESSION requirement and linked acceptance/failure/recovery scenario, then map it to Session, RunningExecution, Harness, application calls and test boundaries.
- Trace retained conversation identity separately from runtime incarnation and provider identity; startup reservation/readiness, exactly-once initial delivery, exact resume, initialized endpoint capture, observation, and event/subscription replacement.
- Audit SESSION-002/020 destruction/forget paths against observed evidence, exact resource provenance and ownership; persisted lifecycle words, PID or socket alone are not authority.
- Audit SESSION-003 scope and cadence across every task; count how task availability/refresh failures are reported. Do not equate one task's observation with all-task coverage.
- Audit handoff predecessor/successor settlement, per-task/mode launch admission, same conversation concurrency, client attachment and terminal lifetime as distinct scenarios.
- Trace startup/instruction failure: retain provisional relationship/tracking evidence and stop; final durable publication failure: clean new execution and roll back only exact provisional relationship; cleanup failure retains evidence.
- Audit provider-owned configuration/data/state as non-owned and untouched; never promote provider receipts or historical labels into durable lifecycle state.
- Acceptance requires exact conversation resume without replay, readiness without waiting for an answer, turn completion distinct from execution exit, uncertain observation never destructive, and obsolete listener/output unable to target replacement execution.
- Validation must identify fake/source-only versus live provider/terminal results. Where a claim depends on actual provider readiness, resume identity, or terminal transport, request live controlled evidence; no developer/default tmux socket.

### P4 — Configuration

- Audit CONFIG-001–014 and all exact configuration/model callers and tests. Own precedence including explicit false, catalogue guards/guidance, configuration ownership, approval invalidation, permissions/models, presets, mode removal with retained history, and startup behavior.
- Verify current settings through start/resume/ask, UI and operation consumption with evidence contributed by P5/P8S. Never infer consolidation or move/overwrite user data.
- Shared types, if needed, require one explicit owner or recorded serial transfer; there is no generic shared-foundation package. No CLI/UI writes.
- Acceptance: false overrides inherited true; catalogue-required startup rejects absent/invalid data with supported guidance; mode removal preserves history; no required workflow/documents inferred from defaults.

### P5 — Shared application/session coordination

- Map every application operation to its supported CLI/UI callers and each owning domain/store operation. Ensure callers use the same application boundary rather than reimplementing behavior.
- Trace captured target identity across waits, admission/claims, authoritative reload, external execution outside store locks, durable checkpoints, final publication and cleanup settlement.
- Verify stale/deleted/replaced records cannot be resurrected; latest unrelated fields and selection survive. Distinguish committed writes from lock-release failures and uncertain commits.
- Verify mode/task approval ownership and invalidation follows contract, while passive observation/attachment is not activity.
- Acceptance covers operation sequencing and truthful partial completion for creation, handoff, deletion, relocation and cleanup; no generic phase interpreter or arbitrary abstraction added.
- This package waits for P2/P3 owners to state their domain operations; it does not absorb their behavior into application code.

### P6 — CLI/API

- Derive an exact source operation/option list from the exhaustive supported inventory in the contract; compare against every registration, parser, handler, alias, caller, fixture, documentation mention and installed help item.
- Preserve all approved integration operations and task/session semantics; `workspace` remains the explicit user entry point, not an integration API expansion.
- For forbidden or superseded surfaces, remove implementation and dependent callers/fixtures/docs as scoped; a hidden or undocumented live handler remains a gap. Do not remove approved behavior based on similar names.
- Check errors, argument validation, project/task/session targeting, stdout/stderr and status outcomes only where specified by the contracts.
- Validation includes affected in-process CLI source tests. Main integrator owns rebuild and installed binary help/smoke, so do not claim installed parity from source alone.

### P7 — Workspace UI and shared presentation

- Enumerate all ordered regions, selection/focus states, tabs, status and session feedback, actions, keys, terminal sizes, empty/error states from `screens/workspace.md` and applicable IF-WB/IF-SI requirements.
- Trace the entire render/projection path for header, selected chrome and status—not just visible strings. Confirm actual workdir value is the specified path, not a label or inferred cwd.
- Keep domain state and execution lifecycle outside renderer; dispatch captured intent through shared application operations. Attachment/detachment never owns execution lifetime.
- Apply DESIGN-SYSTEM shared labels/markers and focus/dialog rules without inventing decoration or weakening accessible text cues.
- Acceptance includes observed status rather than persisted labels, ordered header composition, focus/actions, resize/terminal geometry, and failures preserving edits/navigation as specified.
- One designer owns all `workspace.ts` modifications. UI review and relevant interaction/screen tests belong to the designer; no parallel source or test writer on those paths.

### P8S — Other screens (designer)

- Create individual screen checklists for board, tasks, settings, sessions/artifacts, help/dialogs; audit every composition section, state, focus transition, action, terminal-size rule and documented exception.
- Audit IF-FS-001–003 filter UI behavior, including empty/error states and selection interactions; backend matching/order belongs to P8B and corpus/archive wiring to P5.
- Ensure screen modules render projections and dispatch through application/domain owners. No second domain or writable projection.
- Reuse shared design-system patterns. Request P7 serial review/change for shared patterns; record explicit transfer rather than broad default overlap. P8S may contribute P7 board and P4 settings evidence.
- Acceptance includes keyboard focus visibility, modal input containment, unsaved-value preservation on failure, and screen-specific behavior—not merely render snapshots.

### P9 — Cross-project evidence and final review

- Reconcile each family row and every screen/architecture/contract section against the worker's implementation/test refs; inspect changed files and source diffs narrowly.
- Confirm owners and exact file scopes were respected; account for every file changed and every baseline user edit. Require tests named in ledgers actually executed and commands/result preserved.
- Confirm accepted open decisions were not silently decided in code. If unresolved authority blocks conformance, pause that operation and seek explicit approval rather than broadening scope.
- Check policy-sensitive data changes with preservation authorization; reject automatic migration/repair and unowned data deletion.
- Report unverified live/runtime claims plainly and leave acceptance incomplete when required live evidence cannot be obtained.
- Full family verification occurs here after all delegated downstream scenarios are joined. The parent integrator owns ledger index and final checks; package artifacts, when execution starts, live at `docs/alignment/<package-id>.md`. Do not create them during this planning edit.

### Ledger status and escalation rules

- **unknown** is the initial state, and remains until the exact requirement and all its listed scenarios are inspected. Lack of a search hit is not evidence of absence.
- **gap** means a demonstrated source or test mismatch against an approved contract. Cite the exact requirement, implementation path, and failing/missing behavior. A suspected concern stays unknown or candidate until traced.
- **blocked** means a concrete approved-policy/architecture decision or unavailable required evidence prevents a conformance judgment. Cite the owning open-decision section, question and impact; route to its decision owner. A blocker does not authorize a workaround.
- **verified** means evidence directly exercises or proves every scenario represented by that ledger row. For code, cite implementation and test plus command result where execution is required. For installed-only behavior, cite exact installed help/smoke and label it installed-only.
- A package may release its owned slice only when its own acceptance is met and downstream scenarios are explicitly assigned/tracked. It must not claim full family alignment while delegated scenarios remain. For the complete alignment claim, every applicable row must be `verified`; `unknown`, `gap`, or `blocked` means INCOMPLETE. No status is inherited from a related ID.
- A requirement with multiple entry points needs evidence of shared ownership or parity per entry point. A requirement with distinct positive and failure outcomes has at least separate rows or unambiguous subscenario cells.
- Update evidence after edits: prior inspection or a previously passing test does not validate changed source. Keep the evidence path and tested revision/file state clear.
- Open contract decisions are not automatically package blockers when irrelevant. Escalate only when a concrete requirement cannot be safely implemented without one; avoid approval requests for decisions already settled by the contract.
- If a package finds unexpected overlap, stop before editing. Propose the exact path transfer and dependency update to the integrator; do not let two writers race or silently enlarge the allowlist.
- If data preservation cannot be established, leave existing data untouched and block the destructive change pending explicit authorization. There is no default permission to convert or repair.

### Acceptance evidence by surface

For product behavior, use the owning contract's own acceptance and recovery scenarios as the test oracle; the items below are cross-checks, not replacements for that exhaustive read.

| Surface | Positive evidence | Failure/recovery evidence |
|---|---|---|
| Task identity and storage | Exact ID resolution, configured project paths and canonical records; work with Git and non-Git project where specified. | Duplicate/ambiguous IDs fail closed; archive reserves IDs; collision reports both paths; failed relocation/deletion truthfully reports partial effects and preserves unrelated data. Confirmed task deletion removes its worktree/branch per TASK-015–019; safe pruning of stale registrations preserves contents, branches and uncommitted work. |
| Artifacts and worktrees | Valid artifact paths remain within their task; worktree ownership and task association follow contract. | Traversal and symlink escape rejected; safe prune does not destroy contents or uncommitted work; confirmed task deletion removes its authorized worktree/branch; failed operation reports completed effects and retained tracking. |
| Configuration | Each effective field resolves task > project > root and uses current values for start/resume/ask; explicit false wins. | Absent/invalid catalogue blocks startup before dependent operation and gives supported manual guidance; mode removal cannot silently discard retained history. |
| Session execution | Reserved identity persists; initial delivery exactly once; ready after required initialization/publication; resume retains exact conversation; observation reflects evidence. | Startup rejection preserves provisional relationship/tracking; final publication rejection alone invokes conditional rollback; unknown observation does not stop/claim stopped; cleanup failure preserves evidence. |
| Integration CLI | Every approved operation remains available with its specified target and outcomes; user `workspace` entry point launches the TUI. | Forbidden operation cannot run through hidden registration/alias; invalid target fails without unintended mutation; source behavior and installed behavior reported separately. |
| Workspace/screen | Each specified region, order, state, interaction, focus and size behavior is visible and functional. | Modal/editor failure retains unsaved values; stale output/selection cannot mutate new target; screen failure does not mutate domain state. |
| Shared architecture | Same application operations and owner behavior are reached from supported entry points; repositories own canonical persistence, Task owns relationships, Session/Harness own execution boundaries. | Stale records/callbacks fail without resurrecting state; external work remains outside store locks; publication/cleanup failures remain distinguishable. |

These are prompts to locate evidence in the requirements, not blanket assertions: mark only the ledger rows supported by the observed code and actual executed validation. Where an acceptance condition is inherently live (provider identity/readiness, real terminal behavior), a mock is supporting evidence only, not final verification. Any `unknown`, `gap`, or `blocked` applicable row makes FULL alignment **INCOMPLETE**. Bounded progress may be handed off with blockers disclosed, but blocked rows never authorize completion.

## Execution packages

One writer at a time per file, including tests and fixtures. These are concrete seed allowlists, not blanket directory assignments: P0 performs targeted existence checks and P1 narrows each list to actually modified files, records exact callers/tests/exports before writes, seals non-overlapping file ownership, and issues bounded serial tickets/subpackages at non-overlap seams. Never dispatch an entire repo family to one worker. A worker must not edit an unlisted file; serial transfer requires recorded baseline/file state. A reviewer/auditor is read-only. **Fixer** owns implementation and focused source tests; **designer** owns screen presentation implementation and interaction tests; **auditor** is read-only, reports evidence/gaps. Packages may conclude no change is needed when evidence verifies alignment.

| ID / work package | Depends on | Initial write scope (concrete seed allowlist; P1 seals narrowed actual set) | Explicit no-touch / transfer | Acceptance, failure/recovery cases and validation owner |
|---|---|---|---|---|
| P0 Baseline, inventory and audit dispatch | — | None | All source writes | First dispatch is read-only audits, before P0 completes audits: task/storage, session/Harness, configuration, CLI, UI/screens, plus architecture/contract cross-check. Capture fresh `git status`, protect `src/agent-workspace/live/tmux/vt-channel.ts` and untracked `pane-snapshot.ts`, `pane-snapshot.test.ts`, `vt-channel.integration.test.ts`; inventory requirements, scenarios, callers/tests/fixtures/config/exports and candidate files. No unspecified task workspace. Auditor/integrator. |
| P1 Ownership/seam freeze | P0 | No source writes | No unresolved decisions silently settled; no mirrored interfaces or broad refactor | Read BLUEPRINT, its blueprint pages, and ADR-0001. Seal evidence, exact modified-file allowlists, named callers/tests/exports and per-slice dependencies; split large ownership buckets into bounded serial tickets. Auditor owns evidence; integrator accepts freeze before writes. |
| P2 Task domain and storage fixer | P0, P1 | `src/agent-workspace/task.ts`; `src/core/{task-identity-index,task-mutation-service,task-query-workflow,task-creation-input,task-creation-transaction,task-creation-workflow,milestones}.ts`; `src/file-system/{task-repository,task-artifact-repository,content-repository,project-layout,operations}.ts` | Exclude lifecycle/worktree, config, search, shared facade. No `workspace.ts`, `sessions.ts`, CLI. P2 never writes lifecycle/worktree files. | TASK-001–011,014,020–022 accountable. Identity, storage, roots/relocation, artifact containment and preservation. P5 contributes TASK-012–013,015–019 lifecycle/archive/deletion scenarios; dependent P5/UI evidence need not block P5 start. Fixer; assigned source tests. |
| P3 Session/Harness fixer | P0, P1 | `src/agent-workspace/{session,sessions,harness,session-process,session-launch,session-store,activity-observer}.ts` plus provider/runtime files individually assigned at P1 | No application lifecycle files. Preserve protected user tmux files. `sessions.ts` transfers to P5 only by explicit serial handoff with baseline/file state; P3 then read-only on it. | SESSION-001–020 accountable except coordination/deletion scenarios assigned P5. Exact identity/readiness/resume, uncertainty, observation, provider nonownership, handoff/admission. Fixer; source tests and controlled live validation where needed. |
| P4 Configuration fixer | P0, P1 | `src/agent-workspace/{config,mode-model}.ts`; `src/file-system/config.ts`; `src/utils/{project-config,config-watcher}.ts`; `src/agent-workspace/config.test.ts` and exact config/model tests | No CLI/UI. Shared types require one named owner or serial transfer; no generic foundation package. | CONFIG-001–014 accountable. Precedence, catalogue, settings/model and startup behavior; P5/P8S contribute operation/UI consumption evidence. Fixer; assigned tests. |
| P5 Application/lifecycle fixer | P2, P3, P4, P8B | `src/core/{agentic-workspace,session-application,task-lifecycle-service,vacated-task-reference-service}.ts`; `src/git/{task-worktree,task-worktree-cleanup}.ts`; transferred `src/agent-workspace/sessions.ts`; `src/test/{task-delete,task-worktree-lifecycle,task-container-lifecycle-contract}.test.ts`; `src/core/session-application.test.ts` | P2 never writes lifecycle/worktree files. P3→P5 sessions.ts and shared test transfer is explicit, serial, baseline-recorded; P3 read-only thereafter. P2/P4/P8B never write core facade concurrently; requests route to P5. | TASK-012–013,015–019 accountable plus cross-owner coordination. Prioritize confirmed deletion gap: observed ownership/liveness; preflight all native targets before any stop; input lifetime; cleanup-before-forget; worktree/branch removal; retain tracking on failed execution cleanup; truthful partial effects. Fixer; owned lifecycle tests. |
| P6 CLI fixer | P5 | Exact CLI registrations, `src/commands/search.ts`, individually inventoried command handlers including any commands directory, CLI tests incl `src/test/cli-search-command.test.ts`; exact obsolete usage/readme/guidance paths may be assigned | No contract edits; no hiding live forbidden handlers. No shared facade/domain/UI writes. | IF-API-001–013 accountable. Remove disallowed handlers and dependent callers/docs as assigned; preserve approved surface and `workspace`. Fixer; CLI source tests. Main integrator owns binary validation. |
| P7 Workspace/shared presentation designer | P5 | `src/ui/opentui/{workspace,workspace-controller,workspace-agent,workspace-agent-host-owner,controls,keybindings,keymap}.ts` plus model/state/tests individually sealed; P1 may assign actual help/theme modules | One writer for `workspace.ts`; no other package edits shared presentation files. | IF-WB-001–008 accountable; IF-SI-001–007 presentation accountable with backend evidence from P3/P5. Workspace and DESIGN-SYSTEM. Designer validates relevant UI tests and states. |
| P8B Search backend fixer | P0, P1 | `src/core/search-service.ts`; `src/utils/{task-search,task-id-search}.ts`; `src/test/{search-service,task-search-parity,task-search-label-filter}.test.ts` | No command/UI/shared facade changes. P5 corpus/archive wiring, P6 output and P8S filters UI are delegated scenarios, not P8B prerequisites. | IF-FS-001–003 backend accountable. Fixer; listed source tests. |
| P8S Other-screen designer | P7 | `src/ui/opentui/{board,agent-settings,filters,task-filters,task-actions,task-lifecycle,task-composer,task-detail-content,task-artifact-view,session-picker,confirm,group-modal,group-delete-modal}.ts` plus sealed board/help/tests | No broad default overlap. Shared-pattern changes require explicit serial request/transfer to P7; no workspace or backend writes. | Board, tasks, settings, sessions/artifacts, help/dialogs specs; contributes P7 board IF-WB and P4 settings evidence, plus IF-FS UI contribution. Designer validates assigned screen tests. |
| P9 Completion audit and parent integrator | P6, P8S | No source edits except targeted fixes returned to owner; evidence ledger only | No opportunistic fixes, broad refactors or overlap | Reconcile all 87 IDs, six screens, PRODUCT/CONVENTIONS, BLUEPRINT, three architecture pages and ADR. Integrator owns source checks, build/freshness and safe installed smoke. Full family verification occurs here; any unknown/gap/blocked applicable row means INCOMPLETE. |

### Dependency order and dispatch

Authoritative acyclic graph: `P0 → P1 → {P2, P3, P4, P8B}`; `{P2, P3, P4, P8B} → P5`; `P5 → {P6, P7}`; `P7 → P8S`; `{P6, P8S} → P9`. Braces mean all listed predecessors complete. P0/P1 are read-only baseline, audit and allowlist release; no source writes. P0's first read-only dispatch starts audits while baseline inventory is underway, not after all P0 audits finish. P1 seals evidence and seams before writes. Each package may release its owned slice with delegated downstream scenarios explicitly tracked; P2/P3/P4/P8B need not prove dependent P5/UI scenarios before P5 starts. Full family verification is P9. One writer per file; `workspace.ts` has one writer; `sessions.ts` transfers serially P3→P5.

First dispatch batch under P0 (concurrent with baseline capture): read-only audits for task/storage, sessions/Harness, configuration, CLI inventory, UI/screens and architecture/contracts. Auditors return compact row-level evidence, individually mapped callers/tests/fixtures/exports, and proposed concrete path lists; no source writes. P1 then reconciles overlaps, seals narrowed allowlists and divides ownership into bounded serial slices. No broad unconstrained repository lane or family-wide claim from sample inspection.

Gate releases are explicit:

1. **Inventory release:** P0 lists all applicable requirement IDs, scenarios, candidate source/test references, untracked/modified files and open unknowns. No source writes before the inventory and baseline are captured.
2. **Seam release:** P1 assigns one owner per domain and per shared file; P2/P3/P4/P8B receive narrowed, non-overlapping path lists. An owner can return a verified no-change slice.
3. **Owner-slice release:** P2/P3/P4/P8B return their owned rows and explicit downstream dependencies. P5 may start when its required operation seams are stable; dependent scenarios remain tracked and are not a prerequisite for P5 to begin.
4. **Coordination release:** P5 returns lifecycle/application evidence; dependent P6/P7 scenarios continue downstream.
5. **Adapter release:** P6 and P7 work on disjoint sealed scopes after P5; P8S follows P7. Each can release its owned slice while delegated scenarios remain open.
6. **Completion release:** P9 reconciles all evidence and returns concrete gaps to owners. Integrator accepts only when every applicable row is verified and required source checks/final binary verification pass; blockers mean incomplete.

At each release, preserve completed work, status and evidence. A failed release is not a license to route around an owner: return the minimal blocking requirement, evidence and decision needed, then resume downstream work only when its dependency is resolved.

## Per-package checkpoints and verification

Before implementation, every assigned requirement has an owner and exact implementation/test search plan, and its individual requirement plus subscenarios are ledgered. Record `unknown` until inspected. After audit, set `gap`, `blocked`, or `verified`; a gap becomes verified only after implementation and evidence. Evidence types must distinguish at least source inspection, source test executed, type/check command, live provider/terminal/runtime, installed help/binary, and screen interaction. Record exact paths/line or test names and command/outcome; inspection cannot be reported as an executed test, a source test is not binary proof, and mocked provider evidence is not live evidence.

Each package reports: requirements/sections audited; ledger status totals and unknown/unassigned count; source/test refs; exact files changed; commands actually run and results; acceptance/failure/recovery evidence; unresolved dependency/decision; preservation/partial effects; handoff and rollback needs. Failure reports identify completed effects, incomplete effects, cleanup errors and retained recovery evidence. Stop at the contract's failure boundary; do not invent retries or recovery beyond the owning contract, automatically repair data, or perform destructive cleanup beyond authorized ownership. Validation owner is named per package above; integrator owns cross-package completion and the final review.

For validation failures, capture the smallest reproducible command and relevant failing test/scenario, not an unfiltered log dump. Report whether failure preceded or followed any side effect, the durable state left behind, and whether execution may still be running. Do not repeat potentially non-idempotent operations to “see if they work.” The owner decides the contract-permitted next action and records it in the package ledger.

Use focused package scripts only after inspecting actual `package.json` scripts. Available documented examples: `bun run check` is nonwriting; `bun run check:types`; affected tests as `bun test <affected-test-file> --timeout=10000`. `format` and `lint` mutate; do not run without assigned intent. `check:fallow` is conditional, not assumed universally mandatory. Nix validation only if packaging is touched. No tests or build were performed in this planning pass.

## Final completion and runnable handoff

P9 checks the entire coverage matrix, screen/architecture sections and requirement subscenarios; every applicable row must be `verified`, with no unknown, gap, blocked, or unassigned owner, for FULL alignment. A bounded incomplete handoff may disclose blockers but cannot claim alignment. Confirm forbidden CLI surfaces are absent at source and handlers/callers/fixtures/docs are dealt with; permitted operations and `workspace` remain. Verify config precedence false cases, catalogue guard/error, data preservation, session uncertainty/ownership, startup versus publication rollback, screen behaviors and failure paths. Require live provider/terminal verification where claims depend on actual provider/runtime behavior; use an isolated assigned socket, never a developer/default tmux socket.

The main integrator performs cross-package source tests/checks and, after integration, `bun run build`, then the AGENTS source-freshness check (`find src -name '*.ts' -newer dist/agentic-workspace`, expected no output), installed CLI help and safe binary smoke checks. Report source test results separately from installed binary results. Preserve all baseline and newly observed unrelated user edits; recheck status before/after and explicitly account for them. No stale binary can establish successful handoff. Documentation-only planning does not require build.

## Copy-pastable bounded worker brief

```text
Package: P<n> — <one bounded ownership area>
Role: fixer / designer / read-only auditor
Authority: use the owning SPEC/architecture/screen/ADR contract; this plan is supporting evidence.
Requirements: enumerate exact IDs and all acceptance, failure, recovery, and subscenario sections before coding.
Ledger: one row per requirement/subscenario; owner, implementation ref, test ref, status unknown/gap/blocked/verified, evidence type and result. Verify owned rows before slice release; explicitly assign outstanding downstream rows. Full alignment waits for P9.
Write allowlist: <exact paths>. No-touch: <exact shared paths and other owners>. One writer per file, including tests; stop for serial handoff if overlap appears.
Acceptance: <observable positive and failure/recovery cases>. Preserve safety, data, partial effects and unrelated work. No aliases/migrations/automatic repair or broad refactor.
Validation owner: <name/role>. Run only <targeted command(s)>; report exact command and result. Distinguish inspection, source tests, live runtime, and installed binary.
Return: changed paths; row ledger/evidence; validation; unresolved decision/dependency; failure/recovery and preserved-work notes. Do not claim alignment beyond audited rows.
```

## Next action

Dispatch the read-only audit batch under P0 while baseline capture is underway. P1 reconciles evidence, verifies concrete path allowlists, assigns callers/tests/exports, narrows actual modified files and divides large ownership buckets into bounded serial work; only then authorize P2/P3/P4/P8B as distinct ownership buckets, without a generic shared-foundation package.
