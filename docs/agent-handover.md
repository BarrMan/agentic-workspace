---
consolidation:
  total: 191
  counts:
    exists: 29
    discard: 92
    integrate: 54
    unconfirmed: 16
  percentages:
    exists: 15.18%
    discard: 48.17%
    integrate: 28.27%
    unconfirmed: 8.38%
---
# Backlog.md agent handover

> **Non-authoritative supporting material.** This file is not a contract. Authoritative owner(s): [CONVENTIONS](CONVENTIONS.md), [BLUEPRINT](BLUEPRINT.md), [sessions](specs/sessions.md), [interfaces](specs/interfaces.md), [tasks](specs/tasks.md), [architecture](architecture/application-boundaries.md).
> Disposition: Mixed — see markers.

## Start here

This is a checkpoint handover, not a claim that the refactoring is finished. <!-- consolidation: discard; ref: none; reason: Historical checkpoint status qualification. -->

- Repository: `/Users/imribarr/Projects/Backlog.md` <!-- consolidation: discard; ref: none; reason: Historical checkout location. -->
- Branch: `tasks/back-709-task-query-lifecycle` <!-- consolidation: discard; ref: none; reason: Historical branch. -->
- Latest commit: `2f2682a` — `BACK-717 - Checkpoint task graph and TUI ownership refactoring` <!-- consolidation: discard; ref: none; reason: Historical checkpoint. -->
- Previous baseline: `5e499ca` <!-- consolidation: discard; ref: none; reason: Historical baseline. -->
- The user requested that checkpoint commit. It contains the accumulated task graph, HTTP, TUI, browser, test, and tooling changes. No push was performed. <!-- consolidation: discard; ref: none; reason: Historical commit authorization and scope. -->
- Read repository `MANIFESTO.md` and `AGENTS.md`, and run `backlog instructions overview` before continuing. Read the matching execution/finalization guides before task lifecycle changes. <!-- consolidation: discard; ref: none; reason: Historical contributor navigation procedure. -->
- Before nontrivial implementation, read `~/.config/opencode/agent-config.json`; apply only enabled automations. <!-- consolidation: discard; ref: none; reason: Personal automation workflow belongs to contributor instructions. -->

### Worktree intentionally left outside the commit

Verified immediately before writing this document:

```text
 M backlog/config.yml
?? backlog/decisions/decision-2 - Choose-Stack.md
?? src/ui/workspace-config-dialog.ts
```
<!-- consolidation: discard; ref: none; reason: Historical excluded-worktree inventory. -->

- Config change: `hide_empty_columns: true`. Treat as a local setting; do not silently commit or discard it. <!-- consolidation: discard; ref: none; reason: Historical local setting value. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#general-principles; reason: Preserve unrelated local configuration. -->
- `Choose Stack` is an empty proposed decision. It was excluded from the checkpoint. Do not assume it is an accepted architecture decision or delete it without investigating provenance. Manage Backlog records via CLI. <!-- consolidation: discard; ref: none; reason: Historical excluded decision record. --> <!-- consolidation: exists; ref: docs/adr/README.md#active-decisions; reason: Proposal status is not architecture approval. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#general-principles; reason: Preserve work of unresolved provenance. --> <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Agent-only CLI mutation safeguard needs explicit disposition distinct from user file access. -->
- `workspace-config-dialog.ts` is an unfinished, currently unreferenced extraction. Equivalent logic remains in the workspace controller. Either integrate it properly or remove it as part of an explicit cleanup; do not mistake its existence for completed work. <!-- consolidation: discard; ref: none; reason: Historical draft extraction status and cleanup task. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Extracted owners must replace the production path before migration is complete. -->

## Where the conversation stopped

The user asked to commit, then investigate why `src/markdown/` exists and what its parser parses. The commit and read-only investigation are complete. The final explanation is recorded below. No Markdown parser changes were requested or implemented. <!-- consolidation: discard; ref: none; reason: Historical conversation and completed investigation scope. -->

Before that, the user requested three still-relevant cleanup directions:

1. Make `src/ui/board/tui-renderer.ts` readable; avoid compressed one-line control flow and superficial forwarding methods. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#code-structure; reason: Explicit readability rule rejects compressed control flow and responsibility-free forwarding methods. -->
2. Organize files by actual functionality throughout the repository. TUI components should have a component directory separate from models/services/orchestration. Do not create a directory containing only one file merely to satisfy a naming convention. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#code-structure; reason: Changes belong to cohesive owning features. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#code-structure; reason: Separate cohesive UI components from model/orchestration code without ceremonial singleton directories. -->
3. Remove `BoardInput`'s string-command dispatch indirection. Bind configured shortcuts directly to handler methods instead of mapping keys to strings and then dispatching those strings elsewhere. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Configured shortcuts bind directly to behavior rather than duplicate command-string dispatch. -->

Item 3 is implemented and committed. Item 1 received a readability pass; inspect the actual result rather than assuming it is perfect. Item 2 was audited and planned, but the folder moves have **not** been performed. The user then steered the work toward the checkpoint and Markdown investigation. <!-- consolidation: discard; ref: none; reason: Historical implementation and remaining-work status. -->

## The user's engineering principles

- **Fix ownership, not appearances.** Moving a thousand-line function into `runtime.ts`, wrapping it in a class, or distributing its captured variables through callback bags is not a refactor. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Refactoring must change real ownership rather than relocate monolithic closures. -->
- **Real component composition.** Think of the TUI as a component tree: renderer → board view → lane views, with independent filter/footer/dialog components. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Cohesive board/lane and independent filter/footer/dialog composition is missing. -->
- **Classes for stateful owners.** If an exported factory owns mutable state and defines many nested private functions, use class fields and private methods. Do not simply move the same giant closure into `run()`, a constructor, or `#mount()`. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#code-structure; reason: Stateful owner classes require genuine field/private-method decomposition beyond the named domain classes. -->
- **Pure functions remain useful.** Policy, formatting, filtering helpers, and straightforward calculations do not need ceremonial classes. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#general-principles; reason: Avoid speculative abstraction around simple calculations. -->
- **One authoritative owner per state.** Board selection belongs to the Board model; widgets reflect it. Avoid separate widget/domain selection, duplicate filter state, and competing lifecycle flags. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Explicit Board selection and filter ownership is absent. --> <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Duplicate writable view/lifecycle hierarchies are not required. -->
- **Direct behavior wiring.** Use the existing keyboard configuration and bind handlers directly. Avoid command-string enums and dispatch switches that duplicate the binding table without adding behavior. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Direct configured handler binding is missing. -->
- **Readable code over artificial line-count targets.** Small methods should have clear responsibilities. Do not compress code into single-line statements or introduce pointless passthrough methods merely to shorten a file. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#code-structure; reason: Readability and meaningful method responsibilities outrank line-count targets. -->
- **Functional organization.** Group multiple related components/models/policies/services. Keep cohesive existing modules. Avoid flat piles of newly extracted files, singleton directories, re-export-only compatibility shims, and generic layers with no actual need. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#code-structure; reason: Organize by owning feature and reuse cohesive modules. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#code-structure; reason: Avoid ceremonial singleton folders and flat extraction piles. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Remove compatibility projections and shims. -->
- **Remove superseded code.** Migrate callers and delete the old implementation. Do not leave disconnected new classes alongside the original implementation. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Remove superseded implementations and align callers. -->
- **Validate subagent work.** Several agents claimed migrations while only renaming files or wrapping closures. Inspect source, ownership, callers, and tests before accepting completion. <!-- consolidation: discard; ref: none; reason: Historical delegation failure narrative. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Integrator must inspect actual ownership and caller migration before accepting delegated completion. -->
- **Use fresh parallel subagents.** The user explicitly requested parallel implementation and fresh follow-up reviews for correctness and analogous applications elsewhere. They objected to agent contexts exceeding roughly 90k. Tools do not expose context sizes: rotate proactively; hand over only narrow findings and paths. Do not resume long old sessions or forward this entire document to every worker. <!-- consolidation: discard; ref: none; reason: Session-specific delegation authorization and agent context-management procedure. -->
- **Bound ownership when parallelizing.** Assign disjoint files, agree concrete APIs, then integrate. Agents repeatedly stopped on missing APIs or observed temporary type errors from another writer. Sequence dependent implementation where necessary. <!-- consolidation: discard; ref: none; reason: Parallel agent workflow remains contributor procedure rather than durable product contract. -->
- **No dishonest performance claims.** The target is all product tests together in at most 30 seconds wall time, not 30 seconds per file. A deadline that kills an unfinished run does not achieve the target. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#testing; reason: Applicability of the historical whole-suite 30-second target needs disposition. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#testing; reason: Canceled incomplete runs cannot establish successful runtime performance. -->
- No commits or pushes without a request. The latest commit was explicitly requested; future changes are not automatically authorized for commit. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Commits and pushes require explicit request rather than inherited authorization. -->

## Implemented and covered

### Task reads, graph, and project lifecycle

- Removed `ContentStore`, mutable Core/filesystem selection, legacy retained read modes, and obsolete read/session machinery. <!-- consolidation: discard; ref: none; reason: Historical removal inventory. -->
- Ordinary CLI/MCP/Core reads use the persistent task-read implementation; root/backlog/config selection is immutable for an operation. Selecting a different project constructs a new Core. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#application-controller; reason: Operation project/config selection remains immutable across awaits. --> <!-- consolidation: discard; ref: none; reason: Historical persistent-read implementation and Core construction mechanism. -->
- MCP creates a fresh operation Core for configuration freshness. <!-- consolidation: discard; ref: none; reason: Historical MCP implementation technique rather than retained API approval. -->
- Browser startup loads a `ProjectTaskGraph` before accepting requests. Prepared task records carry `isReady`; collection queries filter/project them rather than building readiness indexes per request. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#feature-contracts; reason: Startup-owned browser graph retention needs scope disposition without reviving the superseded stateless design. -->
- Reconciliation replaces prepared state before notifying subscribers. Dependency details reuse graph context. The graph remains in memory, not persisted to disk. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#application-controller; reason: Prepared task state must be replaced before subscriber notification. --> <!-- consolidation: unconfirmed; ref: docs/architecture/application-boundaries.md#application-controller; reason: In-memory graph reuse and persistence scope need reconciliation with retained collection architecture. -->
- The earlier instruction forbidding retained server state was explicitly superseded by the user's startup-owned graph design. Do not resurrect the obsolete design. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#application-controller; reason: Established startup-owned read graph decision must survive if the server is retained rather than restoring obsolete no-retained-state rules. -->
- `ProjectTaskGraph.resolveParentTask()` owns resolution and throws the existing `AmbiguousTaskIdError` and `TaskCollectionParentNotFoundError`. Callers no longer inspect `graph.snapshot.identityIndex` or status unions. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#application-controller; reason: Parent resolution owns ambiguity and missing-parent errors rather than exposing graph internals. -->
- Shared collection errors live in `src/core/domain-errors.ts`. Do not reintroduce graph-specific duplicate error classes; an agent did that and it was reverted. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#application-controller; reason: Shared collection errors have one owner across read implementations. --> <!-- consolidation: discard; ref: none; reason: Historical duplicate-class regression. -->
- Protected HTTP operations fail closed after configuration reconciliation errors; successful recovery restores readiness. Watcher staging handles config changes during loading and late disposal. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#application-controller; reason: Retained scoped operations must fail closed on config reconciliation errors and recover readiness only after successful reconciliation. --> <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#application-controller; reason: Reconciliation must handle config changes during loading and disposal races. -->

Preserve these contracts:

- `X-Backlog-Project-Scope`: missing → `400 PROJECT_SCOPE_REQUIRED`; stale → `409 PROJECT_SCOPE_MISMATCH`. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Established HTTP scope header/error contract needs retention disposition rather than silent removal. -->
- `/api/status` and `/api/version` are exempt from the scope gate. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Established HTTP scope exemptions need retained API disposition. -->
- WebSocket URL carries `projectScope`; one shared socket, no polling fallback. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Established browser WebSocket targeting and no-polling contract need retained surface disposition. -->
- Mutations must not automatically retry. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#application-controller; reason: Retained adapter mutations must not automatically retry and duplicate partial effects. -->
- Preserve canonical ID ambiguity, completed-task evidence, local/cross-branch visibility, full-text behavior, custom initialization, partial mutations, and locked writes. <!-- consolidation: integrate; ref: docs/specs/tasks.md#tasks-and-storage; reason: Canonical ID ambiguity and completed-task identity evidence need explicit preservation. --> <!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Cross-branch task visibility conflicts with deterministic project-store loading. --> <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#filtering-and-search; reason: Exact historical full-text behavior is unspecified and matching details remain open. --> <!-- consolidation: unconfirmed; ref: docs/specs/configuration.md#configuration-and-modes; reason: Custom initialization details are not identified sufficiently to fold. --> <!-- consolidation: exists; ref: docs/BLUEPRINT.md#application-controller-and-stores; reason: Partial effects must be reported truthfully. --> <!-- consolidation: exists; ref: docs/BLUEPRINT.md#authoritative-mutation-and-publication; reason: Writes use locked authoritative state. -->

### Native Elysia HTTP contracts

- Resource routes now use Elysia query/params/body/response schemas and plain data or native `status(...)` responses. The last audit found no `Response.json` usages in the server. <!-- consolidation: discard; ref: none; reason: Historical framework usage and audit result. -->
- Collection repeated/comma query coercion uses schema transforms; alias normalization preserves existing wire behavior. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Historical query coercion and alias wire contract need retained API disposition. -->
- Summary, full task, detail, dependency graph, and readiness schemas are distinct. Earlier inaccurate response schemas stripped fields or rejected valid output; those were corrected. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#code-structure; reason: Response schemas must match distinct projections rather than strip valid fields with one generic schema. --> <!-- consolidation: discard; ref: none; reason: Historical schema correction report. -->
- Request validation maps to 400; response validation failures map to 500. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Established HTTP validation status contract needs surface retention disposition. -->
- Domain error mapping is centralized. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#application-controller; reason: Retained transport domain-error mapping should have one owner. -->
- Native Elysia status responses require checking their actual response code during mutation reconciliation. `set.status` may still be 200 before mapping; an explicit regression test covers this. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#testing; reason: Mutation reconciliation must use actual final response outcomes rather than pre-mapping status defaults. --> <!-- consolidation: discard; ref: none; reason: Historical framework-specific regression coverage. -->
- Keep raw `Response` where genuinely appropriate for assets/HTML/streams. <!-- consolidation: unconfirmed; ref: docs/adr/README.md#active-decisions; reason: Framework-specific response practice depends on retained server technology scope. -->

### Board domain, persistence, and TUI components

Current substantive files under `src/ui/board/`:

| Files | Responsibility |
| --- | --- |
| `board.ts`, `filter.ts`, `lane.ts` | Pure task/filter/lane/selection/move state; no terminal widgets or storage <!-- consolidation: exists; ref: docs/BLUEPRINT.md#component-ownership; reason: Models remain independent of rendering and persistence. --> |
| `board-actions.ts` | Persistence, frozen move intents, partial outcomes, latest-corpus merging, pending-write settlement <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Board persistence owner freezes intent and settles writes against the latest corpus. --> |
| `tui-renderer.ts` | Component composition, updates, rendering, startup and disposal <!-- consolidation: discard; ref: docs/BLUEPRINT.md#component-ownership; reason: Historical renderer implementation ownership is not the current pure-renderer contract. --> |
| `board-view.ts`, `lane-view.ts` | Board/lane widget tree reflecting domain state <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Rendering reflects owner state without domain mutation. --> |
| `filter-bar.ts`, `footer.ts` | Filter controls and footer widget/timer lifecycle <!-- consolidation: discard; ref: none; reason: Historical component file map. --> |
| `board-dialogs.ts`, `task-popup.ts` | Modal/composer/help and task-popup lifecycle <!-- consolidation: discard; ref: none; reason: Historical component file map. --> |
| `board-interaction.ts` | Direct shortcut registration and action handlers <!-- consolidation: discard; ref: none; reason: Historical input file map. --> |
| Supporting configuration/policy/screen files | Focused calculations and terminal setup <!-- consolidation: discard; ref: none; reason: Historical supporting-file inventory. --> |

- Production instantiates `new TUIRenderer(...).run()` directly. <!-- consolidation: discard; ref: none; reason: Historical production wiring. -->
- Removed `renderBoardTui`, the forwarding controller, old `runtime.ts`, old move/session implementations, empty board façade modules, and `board-input.ts`. <!-- consolidation: discard; ref: none; reason: Historical removal inventory. -->
- `LaneView` and `BoardTaskPopup` are actual classes; obsolete factory exports were removed. <!-- consolidation: discard; ref: none; reason: Historical class conversion result. -->
- Renderer review fixed initialization/resolver ordering, teardown before view handoff, late update guards, resize listener cleanup, and refreshed filter choices. <!-- consolidation: discard; ref: none; reason: Historical renderer repair report. -->
- BoardInteraction now binds configured keys directly, retains handlers for unbinding, and reports async failures through footer feedback. No `BoardCommand` string dispatch remains. <!-- consolidation: discard; ref: none; reason: Historical direct-binding implementation report. -->
- Domain and persistence tests cover move/recruit projections, branch guards, commit snapshots, watcher/write races, and partial results. <!-- consolidation: discard; ref: none; reason: Historical coverage report. -->

Behavior to preserve during cleanup:

- Highlighted recruited selections collapse to a preview before a subsequent confirmation persists that exact order. <!-- consolidation: integrate; ref: docs/specs/interfaces.md#workspace-and-board; reason: Established recruit-preview-confirm ordering is more specific than current preview/commit contract. -->
- Branch tasks cannot move/recruit; filters that hide/reorder a subset block movement, but status exclusions intentionally differ. <!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Cross-branch task collection semantics are superseded. --> <!-- consolidation: integrate; ref: docs/specs/interfaces.md#workspace-and-board; reason: Board movement restrictions under subset filters and status-exclusion exception are missing. -->
- Hidden empty lanes are available as move targets. <!-- consolidation: integrate; ref: docs/specs/interfaces.md#workspace-and-board; reason: Hidden empty lane movement targets are missing. -->
- Writes freeze their intent; returned changes merge into the latest corpus after intervening watcher events. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#authoritative-mutation-and-publication; reason: Capture intent before waits and apply intended changes to fresh state. -->
- Closing waits for pending writes/modal work, releases only owned resources, and preserves shared screens when requested. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: UI closing must settle pending writes/modal work and preserve shared screens. --> <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Client teardown releases only its own attachment resources. -->
- Draft creations do not appear on the board; filtered creations are not incorrectly focused. <!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Draft promotion/demotion is not supported. --> <!-- consolidation: integrate; ref: docs/specs/interfaces.md#workspace-and-board; reason: Created tasks hidden by active filters must not acquire invisible focus. -->
- Popup updates defer appropriately during modals, restore focus, and ignore invalidated async work. <!-- consolidation: integrate; ref: docs/DESIGN-SYSTEM.md#dialogs-and-focus; reason: Popup updates defer through modals and restore prior focus. --> <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Stale async work cannot update a replacement view. -->

### Other UI owners

- `TaskViewerController(task, options).run()` replaced the large `viewTaskEnhanced` factory. It now has private state/methods, uses existing session/rendering owners, and tears down listeners/timers/widgets. <!-- consolidation: discard; ref: none; reason: Historical task-viewer refactor result. -->
- Task-viewer graph replacement now uses incoming watcher tasks; ready filtering reads prepared state. The controller owns filter state, the session owns corpus/graph/prepared list/selection. <!-- consolidation: discard; ref: none; reason: Historical task-viewer implementation inventory. -->
- `UnifiedViewController(options).run()` replaced `runUnifiedView`. A follow-up moved watcher/view/lifecycle closures into private methods and corrected subscriber/screen/process-listener cleanup. <!-- consolidation: discard; ref: none; reason: Historical unified-view refactor result. -->
- `AgentWorkspaceController(core, options).run()` replaced the old exported function, but **its underlying closure decomposition is unfinished**. Last review found a roughly 1,082-line `#mount` closure. Do not report this as a completed class refactor. <!-- consolidation: discard; ref: none; reason: Historical incomplete decomposition finding rather than current completion evidence. -->
- `src/ui/workspace-config-dialog.ts` remains an unintegrated draft outside the commit. <!-- consolidation: discard; ref: none; reason: Historical draft status. -->

### Other retained fixes

- Browser scope/unmount async guards, scoped detail cache, and explicit scope-header handling in fixtures. <!-- consolidation: discard; ref: none; reason: Historical browser fix inventory. -->
- Board export rejects ambiguous identities before writing its destination. <!-- consolidation: integrate; ref: docs/specs/interfaces.md#workspace-and-board; reason: Retained export operations must reject identity ambiguity before destination writes. -->
- Definition-of-Done escaped multiline round-trip parsing and filesystem task-mutation fallback return fixes. <!-- consolidation: discard; ref: none; reason: Historical parser and return-value fixes. -->

## Active and remaining work

### 1. Functional folder organization — audited, not executed

Track with `BACK-719`; it was created To Do/unassigned. Assign yourself through CLI when starting. `BACK-717` remains In Progress for TUI cleanup; check current task records rather than inferring status from old completion claims. <!-- consolidation: discard; ref: none; reason: Historical task-based work queue superseded by alignment ledger tracking. -->

Proposed board organization from the audit:

- `board/components/`: board view, lane view, filter bar, footer, dialogs, task popup. <!-- consolidation: discard; ref: none; reason: Proposed historical file-move map rather than durable exact placement. -->
- `board/models/`: Board, Filter, Lane and genuinely model-owned configuration/derived values. <!-- consolidation: discard; ref: none; reason: Proposed historical file-move map. -->
- `board/policies/`: existing column/filter/move policies (multiple cohesive files). <!-- consolidation: discard; ref: none; reason: Proposed historical file-move map. -->
- Keep orchestration/integration files at the feature root if there is no worthwhile multi-file subgroup. Do not create a singleton `services/` just for `board-actions.ts`. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#code-structure; reason: Keep useful feature-root integration instead of ceremonial singleton layers. -->
- Review the exact placement of navigation/configuration/outcome helpers rather than mechanically treating every helper as a model. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#code-structure; reason: Place helpers with actual responsibility owners. -->

Other concrete audit candidates:

- Remove task-viewer and unified re-export-only façades at `src/ui/task-viewer-*.ts`, `task-viewer-with-search.ts`, and `unified-view.ts` after retargeting callers to their substantive owners. Inspect exports before deleting; some aggregate multiple useful symbols. <!-- consolidation: discard; ref: none; reason: Historical cleanup candidates. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Migrate all callers before removing superseded paths. -->
- Group workspace UI into `src/ui/workspace/`: controller, model, reconciliation, config editor, and eventually the integrated config dialog. Keep `src/agent-workspace/` as its distinct domain/persistence subsystem. <!-- consolidation: discard; ref: none; reason: Historical proposed folder layout. -->
- Group cohesive command clusters: task-list parse/query/render/project files; task-edit option files; init files; config-command/wizard files. Keep unrelated standalone commands at their current feature boundary. <!-- consolidation: discard; ref: none; reason: Historical proposed command moves rather than fixed architecture. -->
- Browser board has a possible feature-owned cluster under `web/features/board/` (components/hooks/models). Confirm dependencies before moving shared task components. <!-- consolidation: discard; ref: none; reason: Historical optional browser folder proposal. -->

Existing cohesive areas should remain meaningful: `file-system`, `markdown`, CLI feature registration, MCP tools, server resource routes, web feature folders, git/process/constants/types, scripts/tooling. The audit did not find a reason to churn every directory into generic service/model layers. Tests already group behavior through names/colocation; decide any test relocation based on usefulness, not symmetry. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#code-structure; reason: Preserve cohesive feature ownership rather than generic layer churn. --> <!-- consolidation: discard; ref: none; reason: Historical audit and existing test layout observations. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#testing; reason: Tests stay beside behavioral owners rather than artificial symmetry. -->

For every move: migrate real imports, tests, build/discovery scripts and affected documentation; delete old paths without compatibility barrels. Preserve unrelated local work. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Align callers and fixtures and remove obsolete paths. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: File moves must update build and discovery scripts as well as imports. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#documentation-maintenance; reason: Affected documentation must remain accurate. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#general-principles; reason: Preserve unrelated local work. -->

### 2. Workspace closure and unfinished extraction

Finish real state ownership/private methods and integrate the config-dialog draft, or remove the draft if superseded. A class whose `run()` or `#mount()` contains the old monolith is not acceptable. Keep the user-facing workspace behavior and keyboard/session switching tests intact. <!-- consolidation: discard; ref: none; reason: Historical unfinished extraction task. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Class conversion must decompose ownership rather than hide the old closure. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#general-principles; reason: Refactoring must preserve approved behavior. -->

### 3. Complete product tests in ≤30 seconds — unmet
<!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#testing; reason: Historical whole-product performance target and current satisfaction need explicit disposition. -->

- Initial historical isolated profile: 325 files, 316 passed, 7 failed, 2 cut off. Those original failures were individually addressed; later code changes mean this is not a current whole-suite certificate. <!-- consolidation: discard; ref: none; reason: Historical profile and remediation evidence with explicit limitations. -->
- CLI init historically fell to 19.36 seconds, but subsequent runs varied. Latest shared-bundle measurement was roughly 19.50 seconds for that file alone. <!-- consolidation: discard; ref: none; reason: Historical timing measurements. -->
- Composer once passed in 29.84 seconds and later took roughly 37 seconds under different conditions. It has no established reliable margin. <!-- consolidation: discard; ref: none; reason: Historical timing variability. -->
- `scripts/run-ci-tests.ts` now runs isolated files through six worker slots, discovers `.test`/`.spec` files, builds a shared Bun CLI bundle, preserves platform profile/name-filter handling, and reports progress. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#testing; reason: Historical custom runner replaced by current Bun test procedure. -->
- `src/test/test-cli.ts` supports the shared CLI command; init/dependency tests migrated 68 legacy subprocess calls. <!-- consolidation: discard; ref: none; reason: Historical helper migration count. -->
- Watcher/board tests replaced several fixed synchronization sleeps with event or persistence barriers. Timing-semantic tests may still need deliberate time behavior; don't delete their purpose. <!-- consolidation: discard; ref: none; reason: Historical synchronization repair. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#testing; reason: Replace incidental sleeps with barriers while retaining genuine timing-semantic coverage. -->
- `BACKLOG_TEST_DEADLINE_MS` is optional diagnostic cancellation, not a speed improvement. No passing full-product ≤30-second run exists. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#testing; reason: Obsolete deadline knob and historical unmet performance result. -->

Historical reports:

```text
/var/folders/6z/jl00z05s7b7gmlgvjtf7fh9w0000gn/T/opencode/backlog-test-runtime-profile-20260930T131824Z/report.json
/var/folders/6z/jl00z05s7b7gmlgvjtf7fh9w0000gn/T/opencode/backlog-test-runtime-human-report-20260930.md
```
<!-- consolidation: discard; ref: none; reason: Historical diagnostic artifact locations. -->

Measure whole-suite wall time when other agents are not running expensive tests. Use the runner's deadline and cleanup; never report killed/incomplete runs as successful. Preserve all meaningful coverage; do not meet the budget through skips, cached results, or mocking away integration behavior. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#testing; reason: Performance baselines require uncontended whole-run wall-time measurement. --> <!-- consolidation: discard; ref: docs/CONVENTIONS.md#testing; reason: Old custom-runner deadline procedure is superseded. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#testing; reason: Canceled runs or omitted/cached/mocked-away coverage cannot satisfy a performance target. -->

### Task references

- `BACK-709`: startup task graph/read ownership, recorded Done. <!-- consolidation: discard; ref: none; reason: Historical task status. -->
- `BACK-710`–`BACK-714`: earlier async fixes, runtime profiles, test corrections, fail-closed recovery. <!-- consolidation: discard; ref: none; reason: Historical task inventory. -->
- `BACK-715`: whole-product 30-second goal, unfinished. <!-- consolidation: discard; ref: none; reason: Historical task status does not settle current target applicability. -->
- `BACK-716`: Elysia typed JSON contracts; implementation covered, verify metadata before finalizing. <!-- consolidation: discard; ref: none; reason: Historical task verification reminder. -->
- `BACK-717`: TUI ownership/component/readability/direct-bindings cleanup, In Progress. <!-- consolidation: discard; ref: none; reason: Historical task status. -->
- `BACK-718`: graph domain-error ownership; implemented, verify metadata. <!-- consolidation: discard; ref: none; reason: Historical task verification reminder. -->
- `BACK-719`: functional folder organization, not implemented. <!-- consolidation: discard; ref: none; reason: Historical task status. -->

## Markdown investigation findings

`src/markdown/` is the persistence codec for Backlog records, not a general-purpose Markdown language parser. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#stores-and-repositories; reason: Record codec ownership should be distinguished from general Markdown rendering/parsing. -->

- `frontmatter.ts` delegates YAML-frontmatter extraction to `gray-matter`. <!-- consolidation: discard; ref: none; reason: Historical implementation/library inventory. -->
- `parser.ts` maps frontmatter and structured body fields into Task/document/decision objects: IDs, statuses, dependencies, dates, assignees, labels, etc. <!-- consolidation: discard; ref: none; reason: Historical parser source map. -->
- `structured-fields.ts` and `structured-sections.ts` identify Backlog-owned description/plan/notes/summary sections by headings and markers. <!-- consolidation: discard; ref: none; reason: Historical structured-field source map. -->
- `checklists.ts` and structured-section logic parse acceptance criteria and Definition of Done, checked state and stable indices. <!-- consolidation: discard; ref: none; reason: Historical checklist source map. -->
- `comments.ts` handles Backlog comment author/date/body conventions. <!-- consolidation: discard; ref: none; reason: Historical comment source map. -->
- `scanner.ts` and `ranges.ts` recognize enough fence/HTML context to avoid treating markers inside examples as real task state. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#stores-and-repositories; reason: Markers inside fenced or HTML examples must not become task state. -->
- `serializer.ts` performs source-preserving edits so changing a checkbox does not reformat unrelated Markdown. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#stores-and-repositories; reason: Source-preserving edits must leave unrelated Markdown unchanged. -->
- `file-system/task-repository.ts` and `operations.ts` call the codec for reads/writes; content repositories use the same frontmatter/body approach. <!-- consolidation: discard; ref: none; reason: Historical repository caller map. -->

A generic Markdown AST parser would not supply Backlog schema mapping, section aliases, checklist indices, marker validation, or minimal-diff writes. It could replace some syntax scanning if source-position fidelity is demonstrated. Do not replace it merely because its folder is called Markdown. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#stores-and-repositories; reason: Generic parsing cannot replace record schema mapping or source-preserving codec responsibilities. --> <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Parser substitution is only a conditional proposal pending source-position fidelity evidence. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#general-principles; reason: Names alone do not justify unrelated rewrites. -->

The user was told the responsibility is justified, but a storage-oriented location/name could communicate it better during a coherent storage reorganization. This was a recommendation, not authorization to rewrite the parser. One concrete overlap was found: marker-range pairing in `ranges.ts` and `structured-sections.ts`; inspect differing ambiguity semantics before sharing it. <!-- consolidation: discard; ref: none; reason: Historical optional naming recommendation and source-overlap finding. --> <!-- consolidation: unconfirmed; ref: none; reason: Recommendations do not constitute approval. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Deduplicating parsers must preserve differing ambiguity semantics rather than merge by superficial similarity. -->

## Verification evidence and practical checks

Before `2f2682a`:

- `bunx tsc --noEmit` passed. <!-- consolidation: discard; ref: none; reason: Historical check result. -->
- `bun run check .` passed (824 files at that point). <!-- consolidation: discard; ref: none; reason: Historical check result. -->
- `bun run build` passed. <!-- consolidation: discard; ref: none; reason: Historical build result. -->
- Git whitespace checks passed; pre-commit hooks ran successfully without bypasses. <!-- consolidation: discard; ref: none; reason: Historical commit-check evidence. -->
- Latest direct-binding pass: keyboard 4, move 21, hide-empty 15, popup 7 tests passed. <!-- consolidation: discard; ref: none; reason: Historical scoped test batch. -->
- Earlier component pass: 52 focused board tests passed; task-viewer and unified targeted suites also passed in their individual passes. <!-- consolidation: discard; ref: none; reason: Historical scoped test batch. -->
- A precommit scope test failure was corrected: malformed YAML emits loading `error`, not successful `config`. The test now registers an error-event barrier before the bad edit, then verifies the repaired config publication. Scope suite 3 passed; lifecycle suite 11 passed. No production lifecycle change was required for that fix. <!-- consolidation: discard; ref: none; reason: Historical test correction and results. -->

Use focused checks with hard 30-second tool limits, for example: <!-- consolidation: discard; ref: docs/CONVENTIONS.md#testing; reason: Historical hard tool limit superseded by current scoped test procedure. -->

```bash
bunx tsc --noEmit
bun run check .
bun run build
bun test --timeout=10000 src/test/board-tui-move.test.ts
bun test --timeout=10000 src/test/board-hide-empty-columns.test.ts
bun test --timeout=10000 src/test/board-popup-sync.test.ts
bun test --timeout=10000 src/test/server-runtime-scope.test.ts
```
<!-- consolidation: discard; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Historical check example uses old commands and test inventory. -->

Other relevant regression anchors: `board-domain`, `board-actions`, `board-view`, `ui-keymap`, `task-viewer-filter-model`, `ui-state-owners`, `unified-view-filters`, `unified-view-loading`, `agent-workspace-navigation`, `agent-workspace-switching`, `server-api-lifecycle`, `server-task-collection-query`, `project-task-graph`. <!-- consolidation: discard; ref: none; reason: Historical regression-file navigation. -->

### Lessons from failures during this work

- Register event barriers **before** the edit/action. Await the event actually emitted by that outcome, not an unrelated later notification. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#testing; reason: Subscribe before triggering actions and await the outcome-specific event. -->
- Watcher-based prepared state is not synchronous request-time reload. Tests should await reconciliation/publication instead of immediately reading after external file writes. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#testing; reason: Watcher assertions must await reconciliation publication rather than assume synchronous reload. -->
- Schemas for summaries and detail objects must match their distinct payloads; a generic Task schema can remove fields or reject valid summaries. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#code-structure; reason: Each response projection needs a matching schema. -->
- Native framework response hooks execute before final response mapping. Test successful and rejected mutation paths explicitly. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#testing; reason: Verify final successful and rejected response outcomes when hooks precede response mapping. -->
- Terminal/global mock tests can interfere when combined in one process; isolated processes and careful shared-screen cleanup matter. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#testing; reason: Shared test isolation and owned cleanup are required. -->
- Use `onReady` and actual write completion rather than startup sleeps. Use canonical temp paths when `/var` versus `/private/var` affects assertions. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#testing; reason: Synchronize with readiness and write completion instead of startup sleeps. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#testing; reason: Canonicalize equivalent temporary path spellings in identity assertions. -->
- Extracted modules must be wired into the production call path; an unused new file is not progress toward removing the old owner. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Completion requires real production wiring rather than disconnected replacements. -->
- Temporary concurrent type errors are not verification. Re-run integrated checks after all writers finish. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Integration checks must run after concurrent writers settle. -->
- Check actual method bodies and the longest closure, not just file/class names or reported line counts. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Structural review must inspect implementation ownership rather than names and line counts. -->

## Suggested next agent sequence

1. Read instructions, confirm commit/status, and read the current task records. Preserve the three excluded worktree items. <!-- consolidation: discard; ref: none; reason: Historical continuation procedure. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#general-principles; reason: Preserve excluded user work. -->
2. If continuing the outstanding cleanup, start the functional-folder task with a concrete move map and disjoint agent ownership. Pair component relocation with removal of obsolete façade imports. <!-- consolidation: discard; ref: none; reason: Historical execution sequencing. -->
3. Give a separate agent the genuinely unfinished workspace decomposition; agree its destination/API before parallel moves touch its files. <!-- consolidation: discard; ref: none; reason: Historical delegation plan. -->
4. Use a fresh review agent to validate architecture, caller migration, cleanup, and absence of dead compatibility paths; fix findings with new narrow agents. <!-- consolidation: discard; ref: none; reason: Agent-specific review workflow rather than durable product contract. -->
5. Run integrated bounded verification and update Backlog evidence honestly. Keep the full-suite performance task open until an actual complete timed run meets the target. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#testing; reason: Verification evidence must reflect actual outcomes. --> <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#testing; reason: Current applicability and satisfaction of the historical whole-suite target remain unresolved. -->
6. If the user instead follows up on Markdown, answer or investigate that specific persistence concern without automatically launching an unrelated parser rewrite. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#general-principles; reason: Avoid unrelated cleanup beyond requested scope. -->
