# BACK-23 delivery plan — small implementation/validation pairs

> [`docs/SPEC.md`](./SPEC.md) is authoritative wherever this document disagrees with it.

This plan supersedes the 2026-10-09 broad-lane dispatch model in the task
Agent Summary. The approved product contract, artifact-approval amendment, and
`docs/modes-phase1-contract.md` remain authoritative. This document plans the
delivery and its completion evidence; it does not change the product contract.

## Current state

- **Phase 1 — contract: done.** Versioned mode/profile contracts, PLAN/BUILD
  seeds, approvalArtifact, compatibility types, adapter capability seams, and
  command context are implemented and documented.
- **Phase 2 — foundations: implemented with bounded validation evidence.**
  Current evidence records accepted/spec-first capabilities: canonical path
  (6), session store (7), recovery (6), model (6), artifact approval (9),
  coordinator (6), draft (7), row rendering (6), keys (4), viewer (6), model
  picker (7), mode lifecycle (6), CLI/MCP (2), schema migration (2),
  frontmatter (7), opaque preservation (1), CLI batch (12), and MCP (34).
  These counts are reported mission evidence, not a claim that every related
  capability or the whole feature is complete.
- **Public service, controller, settings, and lifecycle — reconciled.** The
  public `AgentSessionService.deleteMode(modeId, destinationModeId?)` delegates
  to its constructor-owned journaled lifecycle service; settings deletion now
  calls that wrapper. Production enumeration includes active, draft, completed,
  and archived tasks. The integrated lifecycle suite passes 7 tests and the
  workspace controller suite passes 43. Settings coverage passes 27 tests;
  older delete/rename, custom-label, snapshot-adoption, and archived-update
  pending claims are superseded by the current evidence, not carried forward as
  verified defects.
- **Source validation — current checks recorded below.** The controller-groups
  failure was caused by an incomplete mock (`configPath` was omitted); after
  correcting the mock, its focused suite passes. The artifact CLI/MCP timeout
  was transient: the latest two tests pass in 4.89s.
- **Project initialization — verified.** The preserved fixture's
  `agentic-workspace/agents.json` is the correct config location and receives PLAN as
  default plus BUILD. Config-dir resolution uses
  `core.filesystem.agenticWorkspaceDir`, whose default is `agentic-workspace`, not `.agentic-workspace`.
  The strengthened `modes-project-initialization-contract` CLI assertion was
  run against the fresh absolute-path worktree binary and passed 2 tests.
- **Phase 3 — CLI, migration, deletion, lifecycle: bounded checks complete.**
  CLI/MCP, migration, and all-root mode deletion have recorded passing evidence.
- **Phase 4 — user interface: bounded checks complete.** Viewer, row, keys,
  model picker, navigation, settings, and controller have passing evidence.
- **Phase 5 — regression/manual acceptance: in progress.** The rebuilt binary
  is fresh at version 1.53.0. Canonical artifact write/read/search smoke and
  manual project record conversion was exercised. A prior durable live
  OpenCode acceptance independently exercised PLAN and BUILD, handoff, and
  ask, including an external same-size/same-mtime artifact edit. This does not
  establish every supported-harness scenario or interactive settings acceptance.

Current validation ledger (2026-10-10): settings UI 27 pass; multiline editor
3 and approval indicator 2 pass, including exact paste/native validation;
session suites 14 files / 74 tests pass on final run (one concurrency-timeout
rerun was needed); storage suites 13 files / 136 tests pass. The UI/CLI run
reported 108 passing tests; its controller-groups mock was incomplete and the
focused corrected suite now passes (1 test). The artifact CLI/MCP suite's
latest two tests pass in 4.89s after a transient timeout. Project initialization
CLI contract passes 2 tests against the fresh absolute worktree `dist/agentic-workspace`.
Final fresh `bun run check:types` and `bun run check` both exit 0. Biome checks
555 files without applying fixes and reports 40 warnings and 8 informational
findings, but no error-level diagnostics; an additional read-only
`bun run check --diagnostic-level=error` also exits 0 with no diagnostics.
The previously reported initialization formatter error is resolved.
`git diff --check` passes. The rebuilt `dist/agentic-workspace`
identifies as 1.53.0; canonical artifact write/read/search and preview/apply/
rerun smoke checks passed against it. Durable live OpenCode acceptance
independently confirmed PLAN/BUILD, handoff, ask, and an external
same-size/same-mtime edit. These final checks are fresh; the focused suite
counts above are preserved prior verification, not suites rerun in this
documentation-only continuation. No full suite was run.
Status remains In Progress until the user marks the task Done.

### Final completion evidence and acceptance boundary (2026-10-10)

- Multiline editor: 3 pass; approval indicator: 2 pass, including saved exact
  content/paste and raw/native input checks. Full settings coverage: 27 pass.
- Initialization: 2 pass against the absolute rebuilt worktree binary, proving
  `agentic-workspace/agents.json` seeding with PLAN default and BUILD included.
- Artifact CLI/MCP: 2 pass in 4.89s after a transient timeout. Controller-groups:
  1 pass after the incomplete mock's missing `configPath` was corrected.
- Storage: 136 pass across 13 files. Sessions: 74 pass across 14 files on the
  final run, after one initial runtime/concurrency timeout rerun.
- Integrated public mode deletion: lifecycle 7 pass, controller 43 pass (50
  aggregate). The real Core/filesystem/service fixture uses unmodified
  constructor enumeration, not injected task IDs. It covers active container,
  draft file, completed container, and archive container. Fresh persisted reads
  prove full destination records and its original active pointer are preserved;
  source mode entries disappear; all four selected modes move; unrelated view
  state survives; catalog/order/default update; task files remain.
- Mutation proof: reverting only production enumeration to active-only
  `listTasks` made the integrated test fail at DRAFT-1's missing source session.
  Four-root enumeration was restored and rebuilt before final verification.
- After the latest source/test patch and mutation restoration, builds were run
  immediately. Typecheck, Biome on all three touched files, and diff whitespace
  checks passed. The final read-only repository-wide gates above now also pass.
- Verified binary: `/Users/imribarr/.agentic-workspace/agentic-workspace/modes-BACK-23/dist/agentic-workspace`,
  version 1.53.0. Final `find src -name '*.ts' -newer dist/agentic-workspace` returns no
  paths. `/opt/homebrew/bin/agentic-workspace` points instead to
  `/Users/imribarr/Projects/agentic-workspace/dist/agentic-workspace`; it is authoritative for
  task management/help, not the binary used to verify this checkout's feature.
- This continuation changes documentation and appends the authoritative task
  summary only. It makes no source/test edits, needs no additional rebuild,
  preserves the approved specification, and makes no commits.

**Remaining blockers:** no current implementation or error-level check blocker
is established by the reconciled evidence. Historical pending lists are not a
fresh failure. Interactive settings deletion through the rebuilt TUI and every
supported-harness manual scenario are not claimed as exercised by these source
contracts. The earlier live artifact acceptance observed stale in-process
approval until restart; current source has a watcher/view contract covering
same-size/same-mtime external edits and sidecar changes, so that historical
observation remains a manual acceptance discrepancy to recheck, not a newly
confirmed current defect. Only the user can accept completion and mark Done.

## Mission operating contract

Deliver 29 bite-sized missions. Each mission has one implementation owner and
a **separate Luna validator**. The validator starts from the approved behavior
in this plan, the task contract, and Phase 1 contract—not from implementation
details or implementation-authored test descriptions. Before implementation,
the validator writes meaningful behavior tests in the mission's owned test
file(s), reviews the code against the same behavior, and reports pass/block
with concrete evidence. Implementation may clarify a spec ambiguity in the
mission handoff, but may not narrow acceptance to match its code.

For every mission, in order:

1. Confirm listed prerequisites and exclusive ownership; work in a separate
   worktree. No concurrent mission may edit the same production **or test**
   file. If ownership must move, pause both pairs and have the integrator
   explicitly transfer it.
2. Validator derives test cases from user-visible/contract behavior and adds
   tests first. After each test/code edit, run `bun run build` immediately per
   AGENTS.md. The implementation owner then makes the smallest production
   change, also rebuilding immediately after each code edit.
3. Run only affected tests, checks, and build; verify the validator's tests
   meaningfully distinguish correct behavior from plausible failures. The
   validator independently reviews the implementation and results and returns
   **PASS** or **BLOCKED**, not a partial acceptance.
4. Integrator accepts only PASS plus successful build/required checks and
   clean binary freshness (`find src -name '*.ts' -newer dist/agentic-workspace`).
   Resolve integration conflicts in a separately owned integration mission;
   do not combine unrelated feature scope into a mission.

The validator does not implement the feature, rubber-stamp implementation
tests, or accept a claim unsupported by behavior evidence. For test-only
changes, run the required immediate build too. Never use a stale global
`agentic-workspace` binary as verification; manual checks use the rebuilt worktree
`dist/agentic-workspace` in an isolated project. Build/test failures block the mission
until repaired and re-reviewed. Phase boundaries are automatic quality
checkpoints, not user-approval gates. Continue through all phases without
asking the user to authorize each checkpoint. Do not mark BACK-23 Done or
commit unless explicitly requested.

## Phase 2 — remaining foundations

Complete and reconcile foundational persistence, session behavior, profiles,
and upgrade behavior before broad CLI/UI wiring. No mission may overlap A2's
unreconciled storage changes.

| ID | Capability / deliverable | Exclusive production ownership | Paired validator test ownership | Depends on |
| --- | --- | --- | --- | --- |
| P2-01 | Reconcile the narrow task-container repository/path contract: canonical main-worktree root, task identity, reserved paths and containment | `src/utils/task-path.ts`, `src/file-system/task-artifact-repository.ts` (only after A2 path ownership handoff) | `src/file-system/task-artifact-repository.test.ts` | A2 report for these paths only |
| P2-02 | Artifact exact-byte status, approval/revoke and reviewed-hash race semantics | `src/file-system/task-artifact-repository.ts` (serialized after P2-01) | `src/file-system/task-artifact-repository.test.ts` (same owner, sequential) | P2-01 |
| P2-03 | Artifact watcher/cache invalidation and searchable text projection, excluding binary/internal sidecar | `src/utils/task-watcher.ts`, `src/utils/task-search.ts` | `src/test/task-watcher.test.ts`, `src/test/search-service.test.ts` | P2-01 |
| P2-04 | Reconcile mode-keyed session-store read/write API and legacy-state diagnostics; keep this to the store contract, not service behavior | `src/agent-workspace/session-store.ts` | `src/agent-workspace/session-store.test.ts` | Phase 1 contract; B2 store changes require explicit handoff before editing |
| P2-05 | Complete mode-scoped reserve/activate/selected history and pending adoption; exact active-pointer semantics | `src/agent-workspace/sessions.ts` | `src/test/agent-sessions.test.ts` (serialize with P2-06) | P2-04; B2 service handoff |
| P2-06 | Mode-local handoff, previous-session resolution, ask target/context isolation, immutable createdWith resume/ask and native claim coordination | `src/agent-workspace/session-utils.ts`, then `sessions.ts` and `session-launch.ts` by serialized ownership | `src/test/agent-sessions.test.ts`, `src/agent-workspace/session-launch.test.ts` | P2-05, C2 profile baseline |
| P2-07 | Background host/session UUID identity and delayed activation cannot select wrong task/mode | `src/agent-workspace/session-process.ts`, `src/agent-workspace/tmux-pane-lookup.ts` | `src/test/tmux-pane-lookup.test.ts`, `src/agent-workspace/session-process.test.ts` | B2 process-path handoff |
| P2-08 | Profile model discovery/cache/default/manual model and provider-specific override contract | `src/agent-workspace/agents/profile.ts`, `src/agent-workspace/agents/agent.ts` | `src/agent-workspace/agents/profile.test.ts` | C2 paths released or confirmed complete |
| P2-09 | Permission instructions, native policy preparation, cleanup on failure, no broad bypass flags and Pi native/default behavior | `src/agent-workspace/agents/claude.ts`, `src/agent-workspace/agents/opencode.ts`, then `pi.ts` by serialized owner | new focused profile-preparation test file, path assigned before dispatch | P2-08 |
| P2-11 | Explicit bounded integration of Phase 2 foundations and publish authoritative baseline; no opportunistic feature edits | Integrator entrypoints named at dispatch after P2-01–09 | affected suites already owned above | P2-01–09 |

## Phase 3 — CLI, migration rollout, deletion and lifecycle

CLI/MCP/schema changes are separated by capability and file ownership. Any
shared command registration file has exactly one mission owner at a time.

| ID | Capability / deliverable | Exclusive production ownership | Paired validator test ownership | Depends on |
| --- | --- | --- | --- | --- |
| P3-02 | Journaled mode deletion/merge, UUID dedupe, destination pointer preservation, recovery and owner/selection fallback | new mode-lifecycle service module | new mode-lifecycle service test file | P2-05–07, P2-11 |
| P3-03 | Generic artifact CLI and MCP list/read/write, canonical paths and read-only approval status | CLI artifact leaves then MCP handlers/schema; registration edits serialized within mission | dedicated CLI and MCP artifact test files | P2-01–03, P2-11 |
| P3-04 | Task JSON/plain/context artifact paths and mode/session targeting options | CLI output/context/session-option leaf files | dedicated CLI output/session-option tests | P2-05–06, P3-03 |
| P3-05 | Remove agentSummary API/flags/parser/search/guidance only after manual preservation guidance is established | task schema/markdown and task/draft CLI/API leaf files, exact paths frozen at dispatch | tests cover each removed surface and content search | P3-03–04 |
| P3-06 | All-mode completion/delete/reset/worktree cleanup, moved running hosts and corrupt-state recovery | task lifecycle/session coordinator files assigned by integrator; one owner | task-worktree-lifecycle and session lifecycle tests | P2-02, P2-05–07, P3-02 |
| P3-07 | Cross-cutting lifecycle integration and acceptance | integrator wiring files only | affected regression tests, no shared test edits without ownership transfer | P3-02–06 |

## Phase 4 — user interface

Backend contracts and Phase 3 public surfaces are stable. Workspace, settings,
artifact review and presentation proceed in parallel only across disjoint
files; shared controller/state/keymap wiring is assigned to a bounded
integration mission rather than edited concurrently.

| ID | Capability / deliverable | Exclusive production ownership | Paired validator test ownership | Depends on |
| --- | --- | --- | --- | --- |
| P4-01 | Mode cycling, no-launch preview, Enter/resume, history/handoff, retained hosts and stale async guards | `src/ui/opentui/workspace-controller.ts` (exclusive to this mission) | `src/test/opentui-workspace-controller.test.ts` | P2-11, P3-07 |
| P4-02 | Row mode/approval label terminal-width clipping, selected styling, Unicode and narrow terminals | board row-rendering leaf files, excluding controller | dedicated board/layout rendering test | P2-02, P4-01 |
| P4-03 | Named cycle-mode shortcut, help and input Tab behavior | keymap/keybinding/help leaf files | `src/test/opentui-keybindings.test.ts` | P4-01 |
| P4-04 | Modes settings layout, model/profile/prompt fields, CRUD/order/default/delete destination and save/discard | settings UI/draft boundary files, serialized single owner | `src/test/opentui-agent-settings.test.ts` | P2-08–09, P3-02 |
| P4-05 | Artifact viewer and explicit reviewed-version Approve/Revoke actions, help/conflicts/errors | artifact-view UI leaf module | dedicated artifact-view UI test file | P2-02–03, P3-03 |
| P4-06 | Controller subscriptions, async approval projection and bounded shared settings/navigation wiring | integrator-only shared controller/state/keymap files | affected controller/settings/keybinding tests | P4-01–05 |
| P4-07 | User docs, API guidance and task-management artifact guidance | documentation/skill guidance files only | documentation assertions if existing; validator checks against contract | P3-05, P4-04–06 |

## Phase 5 — final regression and manual verification

| ID | Mission | Ownership / evidence | Depends on |
| --- | --- | --- | --- |
| P5-01 | Persistence, artifacts and lifecycle regressions | focused affected suites and freshness check | Phase 2–4 missions |
| P5-02 | Sessions, adapters, snapshots, concurrency and process identity regressions | focused session/adapter/process suites; actual supported-harness checks where possible | Phase 2–4 missions |
| P5-03 | Navigation, settings, artifact review and rendering regressions | focused TUI suites including narrow/Unicode and approval refresh | Phase 4 |
| P5-04 | Integrator fixes, isolated rebuilt-binary end-to-end walkthrough and honest acceptance inventory | main integration worktree; after each fix rebuild immediately; record exact binary and scenarios | P5-01–03 |

Manual scenarios include creation without empty artifacts/sessions, direct
BUILD start, independent PLAN/BUILD sessions and background continuity,
handoff/ask, parked preview, restart/exact identity, immutable snapshots,
mode deletion merge, manual record conversion,
whole-container lifecycle, linked-worktree artifact paths, and approve/edit
externally/revoke/custom approval indicator. Run only what environment and
installed harness support; report unexercised cases explicitly. A green source
test suite is not binary verification.

## Priority and first dispatch

**First dispatchable missions, after the integrator confirms baseline
ownership:**

1. **P2-01 — container repository/path contract**; implementation and
   validator use the existing artifact-repository test file, only after A2
   releases those exact paths. This is not authorization for broad A2 lifecycle
   integration.
2. **P2-04 — session-store API reconciliation**; implementation owns only
   `session-store.ts`, validator only `session-store.test.ts`, after B2 releases
   the store API. Keep it separate from `sessions.ts` service work.
3. **P2-07 — session process/pane UUID identity**; implementation owns process
   and pane lookup leaves, validator owns the listed process/pane tests, after
   B2 releases those paths.
This first-dispatch list is historical: those small missions have since been
implemented/reconciled to varying degrees. Use current source and validation
evidence before assigning remaining work; do not re-dispatch a capability
solely because its original mission appears here. Preserve exclusive ownership
and avoid overlapping active edits.

## Completion reporting

Keep a mission ledger in the BACK-23 Agent Summary with ID, implementation and
validator owners, exclusive paths, dependencies, test/build results, review
result, and unresolved items. Record partial work as partial with its exact
remaining behavior. At each phase checkpoint, continue directly to the next
ready mission; only a concrete failure, conflicting approved requirement, or
unavailable required harness blocks progress. Preserve BACK-23 as In Progress
until the user decides otherwise.
