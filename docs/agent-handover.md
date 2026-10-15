# Backlog.md agent handover

## Start here

This is a checkpoint handover, not a claim that the refactoring is finished.

- Repository: `/Users/imribarr/Projects/Backlog.md`
- Branch: `tasks/back-709-task-query-lifecycle`
- Latest commit: `2f2682a` — `BACK-717 - Checkpoint task graph and TUI ownership refactoring`
- Previous baseline: `5e499ca`
- The user requested that checkpoint commit. It contains the accumulated task graph, HTTP, TUI, browser, test, and tooling changes. No push was performed.
- Read repository `MANIFESTO.md` and `AGENTS.md`, and run `backlog instructions overview` before continuing. Read the matching execution/finalization guides before task lifecycle changes.
- Before nontrivial implementation, read `~/.config/opencode/agent-config.json`; apply only enabled automations.

### Worktree intentionally left outside the commit

Verified immediately before writing this document:

```text
 M backlog/config.yml
?? backlog/decisions/decision-2 - Choose-Stack.md
?? src/ui/workspace-config-dialog.ts
```

- Config change: `hide_empty_columns: true`. Treat as a local setting; do not silently commit or discard it.
- `Choose Stack` is an empty proposed decision. It was excluded from the checkpoint. Do not assume it is an accepted architecture decision or delete it without investigating provenance. Manage Backlog records via CLI.
- `workspace-config-dialog.ts` is an unfinished, currently unreferenced extraction. Equivalent logic remains in the workspace controller. Either integrate it properly or remove it as part of an explicit cleanup; do not mistake its existence for completed work.

## Where the conversation stopped

The user asked to commit, then investigate why `src/markdown/` exists and what its parser parses. The commit and read-only investigation are complete. The final explanation is recorded below. No Markdown parser changes were requested or implemented.

Before that, the user requested three still-relevant cleanup directions:

1. Make `src/ui/board/tui-renderer.ts` readable; avoid compressed one-line control flow and superficial forwarding methods.
2. Organize files by actual functionality throughout the repository. TUI components should have a component directory separate from models/services/orchestration. Do not create a directory containing only one file merely to satisfy a naming convention.
3. Remove `BoardInput`'s string-command dispatch indirection. Bind configured shortcuts directly to handler methods instead of mapping keys to strings and then dispatching those strings elsewhere.

Item 3 is implemented and committed. Item 1 received a readability pass; inspect the actual result rather than assuming it is perfect. Item 2 was audited and planned, but the folder moves have **not** been performed. The user then steered the work toward the checkpoint and Markdown investigation.

## The user's engineering principles

- **Fix ownership, not appearances.** Moving a thousand-line function into `runtime.ts`, wrapping it in a class, or distributing its captured variables through callback bags is not a refactor.
- **Real component composition.** Think of the TUI as a component tree: renderer → board view → lane views, with independent filter/footer/dialog components.
- **Classes for stateful owners.** If an exported factory owns mutable state and defines many nested private functions, use class fields and private methods. Do not simply move the same giant closure into `run()`, a constructor, or `#mount()`.
- **Pure functions remain useful.** Policy, formatting, filtering helpers, and straightforward calculations do not need ceremonial classes.
- **One authoritative owner per state.** Board selection belongs to the Board model; widgets reflect it. Avoid separate widget/domain selection, duplicate filter state, and competing lifecycle flags.
- **Direct behavior wiring.** Use the existing keyboard configuration and bind handlers directly. Avoid command-string enums and dispatch switches that duplicate the binding table without adding behavior.
- **Readable code over artificial line-count targets.** Small methods should have clear responsibilities. Do not compress code into single-line statements or introduce pointless passthrough methods merely to shorten a file.
- **Functional organization.** Group multiple related components/models/policies/services. Keep cohesive existing modules. Avoid flat piles of newly extracted files, singleton directories, re-export-only compatibility shims, and generic layers with no actual need.
- **Remove superseded code.** Migrate callers and delete the old implementation. Do not leave disconnected new classes alongside the original implementation.
- **Validate subagent work.** Several agents claimed migrations while only renaming files or wrapping closures. Inspect source, ownership, callers, and tests before accepting completion.
- **Use fresh parallel subagents.** The user explicitly requested parallel implementation and fresh follow-up reviews for correctness and analogous applications elsewhere. They objected to agent contexts exceeding roughly 90k. Tools do not expose context sizes: rotate proactively; hand over only narrow findings and paths. Do not resume long old sessions or forward this entire document to every worker.
- **Bound ownership when parallelizing.** Assign disjoint files, agree concrete APIs, then integrate. Agents repeatedly stopped on missing APIs or observed temporary type errors from another writer. Sequence dependent implementation where necessary.
- **No dishonest performance claims.** The target is all product tests together in at most 30 seconds wall time, not 30 seconds per file. A deadline that kills an unfinished run does not achieve the target.
- No commits or pushes without a request. The latest commit was explicitly requested; future changes are not automatically authorized for commit.

## Implemented and covered

### Task reads, graph, and project lifecycle

- Removed `ContentStore`, mutable Core/filesystem selection, legacy retained read modes, and obsolete read/session machinery.
- Ordinary CLI/MCP/Core reads use the persistent task-read implementation; root/backlog/config selection is immutable for an operation. Selecting a different project constructs a new Core.
- MCP creates a fresh operation Core for configuration freshness.
- Browser startup loads a `ProjectTaskGraph` before accepting requests. Prepared task records carry `isReady`; collection queries filter/project them rather than building readiness indexes per request.
- Reconciliation replaces prepared state before notifying subscribers. Dependency details reuse graph context. The graph remains in memory, not persisted to disk.
- The earlier instruction forbidding retained server state was explicitly superseded by the user's startup-owned graph design. Do not resurrect the obsolete design.
- `ProjectTaskGraph.resolveParentTask()` owns resolution and throws the existing `AmbiguousTaskIdError` and `TaskCollectionParentNotFoundError`. Callers no longer inspect `graph.snapshot.identityIndex` or status unions.
- Shared collection errors live in `src/core/domain-errors.ts`. Do not reintroduce graph-specific duplicate error classes; an agent did that and it was reverted.
- Protected HTTP operations fail closed after configuration reconciliation errors; successful recovery restores readiness. Watcher staging handles config changes during loading and late disposal.

Preserve these contracts:

- `X-Backlog-Project-Scope`: missing → `400 PROJECT_SCOPE_REQUIRED`; stale → `409 PROJECT_SCOPE_MISMATCH`.
- `/api/status` and `/api/version` are exempt from the scope gate.
- WebSocket URL carries `projectScope`; one shared socket, no polling fallback.
- Mutations must not automatically retry.
- Preserve canonical ID ambiguity, completed-task evidence, local/cross-branch visibility, full-text behavior, custom initialization, partial mutations, and locked writes.

### Native Elysia HTTP contracts

- Resource routes now use Elysia query/params/body/response schemas and plain data or native `status(...)` responses. The last audit found no `Response.json` usages in the server.
- Collection repeated/comma query coercion uses schema transforms; alias normalization preserves existing wire behavior.
- Summary, full task, detail, dependency graph, and readiness schemas are distinct. Earlier inaccurate response schemas stripped fields or rejected valid output; those were corrected.
- Request validation maps to 400; response validation failures map to 500.
- Domain error mapping is centralized.
- Native Elysia status responses require checking their actual response code during mutation reconciliation. `set.status` may still be 200 before mapping; an explicit regression test covers this.
- Keep raw `Response` where genuinely appropriate for assets/HTML/streams.

### Board domain, persistence, and TUI components

Current substantive files under `src/ui/board/`:

| Files | Responsibility |
| --- | --- |
| `board.ts`, `filter.ts`, `lane.ts` | Pure task/filter/lane/selection/move state; no terminal widgets or storage |
| `board-actions.ts` | Persistence, frozen move intents, partial outcomes, latest-corpus merging, pending-write settlement |
| `tui-renderer.ts` | Component composition, updates, rendering, startup and disposal |
| `board-view.ts`, `lane-view.ts` | Board/lane widget tree reflecting domain state |
| `filter-bar.ts`, `footer.ts` | Filter controls and footer widget/timer lifecycle |
| `board-dialogs.ts`, `task-popup.ts` | Modal/composer/help and task-popup lifecycle |
| `board-interaction.ts` | Direct shortcut registration and action handlers |
| Supporting configuration/policy/screen files | Focused calculations and terminal setup |

- Production instantiates `new TUIRenderer(...).run()` directly.
- Removed `renderBoardTui`, the forwarding controller, old `runtime.ts`, old move/session implementations, empty board façade modules, and `board-input.ts`.
- `LaneView` and `BoardTaskPopup` are actual classes; obsolete factory exports were removed.
- Renderer review fixed initialization/resolver ordering, teardown before view handoff, late update guards, resize listener cleanup, and refreshed filter choices.
- BoardInteraction now binds configured keys directly, retains handlers for unbinding, and reports async failures through footer feedback. No `BoardCommand` string dispatch remains.
- Domain and persistence tests cover move/recruit projections, branch guards, commit snapshots, watcher/write races, and partial results.

Behavior to preserve during cleanup:

- Highlighted recruited selections collapse to a preview before a subsequent confirmation persists that exact order.
- Branch tasks cannot move/recruit; filters that hide/reorder a subset block movement, but status exclusions intentionally differ.
- Hidden empty lanes are available as move targets.
- Writes freeze their intent; returned changes merge into the latest corpus after intervening watcher events.
- Closing waits for pending writes/modal work, releases only owned resources, and preserves shared screens when requested.
- Draft creations do not appear on the board; filtered creations are not incorrectly focused.
- Popup updates defer appropriately during modals, restore focus, and ignore invalidated async work.

### Other UI owners

- `TaskViewerController(task, options).run()` replaced the large `viewTaskEnhanced` factory. It now has private state/methods, uses existing session/rendering owners, and tears down listeners/timers/widgets.
- Task-viewer graph replacement now uses incoming watcher tasks; ready filtering reads prepared state. The controller owns filter state, the session owns corpus/graph/prepared list/selection.
- `UnifiedViewController(options).run()` replaced `runUnifiedView`. A follow-up moved watcher/view/lifecycle closures into private methods and corrected subscriber/screen/process-listener cleanup.
- `AgentWorkspaceController(core, options).run()` replaced the old exported function, but **its underlying closure decomposition is unfinished**. Last review found a roughly 1,082-line `#mount` closure. Do not report this as a completed class refactor.
- `src/ui/workspace-config-dialog.ts` remains an unintegrated draft outside the commit.

### Other retained fixes

- Browser scope/unmount async guards, scoped detail cache, and explicit scope-header handling in fixtures.
- Board export rejects ambiguous identities before writing its destination.
- Definition-of-Done escaped multiline round-trip parsing and filesystem task-mutation fallback return fixes.

## Active and remaining work

### 1. Functional folder organization — audited, not executed

Track with `BACK-719`; it was created To Do/unassigned. Assign yourself through CLI when starting. `BACK-717` remains In Progress for TUI cleanup; check current task records rather than inferring status from old completion claims.

Proposed board organization from the audit:

- `board/components/`: board view, lane view, filter bar, footer, dialogs, task popup.
- `board/models/`: Board, Filter, Lane and genuinely model-owned configuration/derived values.
- `board/policies/`: existing column/filter/move policies (multiple cohesive files).
- Keep orchestration/integration files at the feature root if there is no worthwhile multi-file subgroup. Do not create a singleton `services/` just for `board-actions.ts`.
- Review the exact placement of navigation/configuration/outcome helpers rather than mechanically treating every helper as a model.

Other concrete audit candidates:

- Remove task-viewer and unified re-export-only façades at `src/ui/task-viewer-*.ts`, `task-viewer-with-search.ts`, and `unified-view.ts` after retargeting callers to their substantive owners. Inspect exports before deleting; some aggregate multiple useful symbols.
- Group workspace UI into `src/ui/workspace/`: controller, model, reconciliation, config editor, and eventually the integrated config dialog. Keep `src/agent-workspace/` as its distinct domain/persistence subsystem.
- Group cohesive command clusters: task-list parse/query/render/project files; task-edit option files; init files; config-command/wizard files. Keep unrelated standalone commands at their current feature boundary.
- Browser board has a possible feature-owned cluster under `web/features/board/` (components/hooks/models). Confirm dependencies before moving shared task components.

Existing cohesive areas should remain meaningful: `file-system`, `markdown`, CLI feature registration, MCP tools, server resource routes, web feature folders, git/process/constants/types, scripts/tooling. The audit did not find a reason to churn every directory into generic service/model layers. Tests already group behavior through names/colocation; decide any test relocation based on usefulness, not symmetry.

For every move: migrate real imports, tests, build/discovery scripts and affected documentation; delete old paths without compatibility barrels. Preserve unrelated local work.

### 2. Workspace closure and unfinished extraction

Finish real state ownership/private methods and integrate the config-dialog draft, or remove the draft if superseded. A class whose `run()` or `#mount()` contains the old monolith is not acceptable. Keep the user-facing workspace behavior and keyboard/session switching tests intact.

### 3. Complete product tests in ≤30 seconds — unmet

- Initial historical isolated profile: 325 files, 316 passed, 7 failed, 2 cut off. Those original failures were individually addressed; later code changes mean this is not a current whole-suite certificate.
- CLI init historically fell to 19.36 seconds, but subsequent runs varied. Latest shared-bundle measurement was roughly 19.50 seconds for that file alone.
- Composer once passed in 29.84 seconds and later took roughly 37 seconds under different conditions. It has no established reliable margin.
- `scripts/run-ci-tests.ts` now runs isolated files through six worker slots, discovers `.test`/`.spec` files, builds a shared Bun CLI bundle, preserves platform profile/name-filter handling, and reports progress.
- `src/test/test-cli.ts` supports the shared CLI command; init/dependency tests migrated 68 legacy subprocess calls.
- Watcher/board tests replaced several fixed synchronization sleeps with event or persistence barriers. Timing-semantic tests may still need deliberate time behavior; don't delete their purpose.
- `BACKLOG_TEST_DEADLINE_MS` is optional diagnostic cancellation, not a speed improvement. No passing full-product ≤30-second run exists.

Historical reports:

```text
/var/folders/6z/jl00z05s7b7gmlgvjtf7fh9w0000gn/T/opencode/backlog-test-runtime-profile-20260930T131824Z/report.json
/var/folders/6z/jl00z05s7b7gmlgvjtf7fh9w0000gn/T/opencode/backlog-test-runtime-human-report-20260930.md
```

Measure whole-suite wall time when other agents are not running expensive tests. Use the runner's deadline and cleanup; never report killed/incomplete runs as successful. Preserve all meaningful coverage; do not meet the budget through skips, cached results, or mocking away integration behavior.

### Task references

- `BACK-709`: startup task graph/read ownership, recorded Done.
- `BACK-710`–`BACK-714`: earlier async fixes, runtime profiles, test corrections, fail-closed recovery.
- `BACK-715`: whole-product 30-second goal, unfinished.
- `BACK-716`: Elysia typed JSON contracts; implementation covered, verify metadata before finalizing.
- `BACK-717`: TUI ownership/component/readability/direct-bindings cleanup, In Progress.
- `BACK-718`: graph domain-error ownership; implemented, verify metadata.
- `BACK-719`: functional folder organization, not implemented.

## Markdown investigation findings

`src/markdown/` is the persistence codec for Backlog records, not a general-purpose Markdown language parser.

- `frontmatter.ts` delegates YAML-frontmatter extraction to `gray-matter`.
- `parser.ts` maps frontmatter and structured body fields into Task/document/decision objects: IDs, statuses, dependencies, dates, assignees, labels, etc.
- `structured-fields.ts` and `structured-sections.ts` identify Backlog-owned description/plan/notes/summary sections by headings and markers.
- `checklists.ts` and structured-section logic parse acceptance criteria and Definition of Done, checked state and stable indices.
- `comments.ts` handles Backlog comment author/date/body conventions.
- `scanner.ts` and `ranges.ts` recognize enough fence/HTML context to avoid treating markers inside examples as real task state.
- `serializer.ts` performs source-preserving edits so changing a checkbox does not reformat unrelated Markdown.
- `file-system/task-repository.ts` and `operations.ts` call the codec for reads/writes; content repositories use the same frontmatter/body approach.

A generic Markdown AST parser would not supply Backlog schema mapping, section aliases, checklist indices, marker validation, or minimal-diff writes. It could replace some syntax scanning if source-position fidelity is demonstrated. Do not replace it merely because its folder is called Markdown.

The user was told the responsibility is justified, but a storage-oriented location/name could communicate it better during a coherent storage reorganization. This was a recommendation, not authorization to rewrite the parser. One concrete overlap was found: marker-range pairing in `ranges.ts` and `structured-sections.ts`; inspect differing ambiguity semantics before sharing it.

## Verification evidence and practical checks

Before `2f2682a`:

- `bunx tsc --noEmit` passed.
- `bun run check .` passed (824 files at that point).
- `bun run build` passed.
- Git whitespace checks passed; pre-commit hooks ran successfully without bypasses.
- Latest direct-binding pass: keyboard 4, move 21, hide-empty 15, popup 7 tests passed.
- Earlier component pass: 52 focused board tests passed; task-viewer and unified targeted suites also passed in their individual passes.
- A precommit scope test failure was corrected: malformed YAML emits loading `error`, not successful `config`. The test now registers an error-event barrier before the bad edit, then verifies the repaired config publication. Scope suite 3 passed; lifecycle suite 11 passed. No production lifecycle change was required for that fix.

Use focused checks with hard 30-second tool limits, for example:

```bash
bunx tsc --noEmit
bun run check .
bun run build
bun test --timeout=10000 src/test/board-tui-move.test.ts
bun test --timeout=10000 src/test/board-hide-empty-columns.test.ts
bun test --timeout=10000 src/test/board-popup-sync.test.ts
bun test --timeout=10000 src/test/server-runtime-scope.test.ts
```

Other relevant regression anchors: `board-domain`, `board-actions`, `board-view`, `ui-keymap`, `task-viewer-filter-model`, `ui-state-owners`, `unified-view-filters`, `unified-view-loading`, `agent-workspace-navigation`, `agent-workspace-switching`, `server-api-lifecycle`, `server-task-collection-query`, `project-task-graph`.

### Lessons from failures during this work

- Register event barriers **before** the edit/action. Await the event actually emitted by that outcome, not an unrelated later notification.
- Watcher-based prepared state is not synchronous request-time reload. Tests should await reconciliation/publication instead of immediately reading after external file writes.
- Schemas for summaries and detail objects must match their distinct payloads; a generic Task schema can remove fields or reject valid summaries.
- Native framework response hooks execute before final response mapping. Test successful and rejected mutation paths explicitly.
- Terminal/global mock tests can interfere when combined in one process; isolated processes and careful shared-screen cleanup matter.
- Use `onReady` and actual write completion rather than startup sleeps. Use canonical temp paths when `/var` versus `/private/var` affects assertions.
- Extracted modules must be wired into the production call path; an unused new file is not progress toward removing the old owner.
- Temporary concurrent type errors are not verification. Re-run integrated checks after all writers finish.
- Check actual method bodies and the longest closure, not just file/class names or reported line counts.

## Suggested next agent sequence

1. Read instructions, confirm commit/status, and read the current task records. Preserve the three excluded worktree items.
2. If continuing the outstanding cleanup, start the functional-folder task with a concrete move map and disjoint agent ownership. Pair component relocation with removal of obsolete façade imports.
3. Give a separate agent the genuinely unfinished workspace decomposition; agree its destination/API before parallel moves touch its files.
4. Use a fresh review agent to validate architecture, caller migration, cleanup, and absence of dead compatibility paths; fix findings with new narrow agents.
5. Run integrated bounded verification and update Backlog evidence honestly. Keep the full-suite performance task open until an actual complete timed run meets the target.
6. If the user instead follows up on Markdown, answer or investigate that specific persistence concern without automatically launching an unrelated parser rewrite.
