## Definition of Done

- [ ] bunx tsc --noEmit passes when TypeScript touched
- [ ] bun run check . passes when formatting/linting touched
- [ ] bun test (or scoped test) passes

## Implementation Plan

BACK-14 - Phased implementation plan

Phase 1 - Remove interactive entry points (plain fallback) + delete overview
- Rewire to never construct blessed controllers; delete the interactive branch and fall back to existing plain/JSON:
  - src/cli/features/tasks/register.ts (task view :391, bare task :497)
  - src/cli/features/tasks/list-project.ts (:16,:22)
  - src/cli/features/drafts/register.ts (:45,:94)
  - src/commands/search.ts (:295)
  - src/commands/content-commands.ts (:169 doc list picker)
- Delete agentic-workspace overview: src/commands/overview.ts, src/ui/overview-tui.ts,
src/ui/overview-content.ts, and registration in
src/commands/project-view-commands.ts (:127-141).
- Update list-output resolution so a TTY defaults to plain for those commands;
keep `--plain` accepted. Update command help text.
- Tests: rewrite CLI command tests for plain default; delete overview tests.
- Green check: bunx tsc --noEmit; bun run build; find src -name '*.ts' -newer
dist/agentic-workspace prints nothing.

Phase 2 - Port rich detail into the OpenTUI workspace (option c: full parity)
- Load TaskDetail for the selected task in OpenTuiWorkspaceController /
mountOpenTuiWorkspace; add it to OpenTuiWorkspaceOptions so the detail pane
can render it.
- Port the old blessed detail presentation from
src/ui/task-viewer/detail-content.ts into an OpenTUI-styled renderer (new
src/ui/opentui/ format/render module) using t / bold / fg / bg / dim /
strikethrough. Cover: header (status icon+color, id, title), metadata
(priority dot, type/project badges, dates, assignees, reporter, milestone,
parent, subtasks, readiness, modified files), dependency graph, description,
references/documentation, AC and DoD checklists, implementation plan/notes,
comments, final summary.
- Reimplement the helper emitters as StyledText (no tag parser, no strip):
formatHeading, wrapStatusColor -> fg, formatAcceptanceCriteriaProgress,
formatProjectBadge, formatTaskTypeBadge, styleCodePath / transformCodePaths,
formatDependencyNodeTuiLabel.
- Tests: new OpenTUI workspace rich-detail rendering tests.

Phase 3 - Relocate surviving shared modules to proper homes
- Plain formatting -> src/formatters/: checklist.ts, code-path.ts (plain
half), status-icon.ts (plain parts), task-labels.ts, acceptance-criteria
suffix (formatAcceptanceCriteriaSummarySuffix), dependency-graph-text.ts plain
half.
- CLI splash/loading -> src/cli/: move root-entry.ts; rewrite loading.ts
without blessed (only board export still uses it after Phase 1).
- OpenTUI-only -> src/ui/opentui/: keymap.ts data (drop
BlessedKeyEvent/matchesKey), task-filter-wiring.ts (taskFilterOptions),
FilterState (from components/filter-header.ts), TaskComposerOptions (from
components/task-composer.ts), board/models/** plus retained policies
(move-policy, filter-policy, column-policy minus blessed formatters),
board/configuration.ts, board/interaction.ts, workspace/state.ts,
workspace/model/drafts.ts, task-viewer/detail-content.ts (or its port),
task-viewer/lifecycle.ts.
- Split src/ui/task-lifecycle.ts: keep completeTaskFromTui,
formatTaskArchivedMessage, formatTaskCompletionBlockedMessage; delete
confirmTaskLifecycleAction (blessed-only).
- Green check: tsc + build + verifier.

Phase 4 - Delete legacy blessed code + tests + tooling
- Delete: ui/board/ blessed parts (screen.ts, tui-renderer.ts,
board-interaction.ts, board-actions.ts, board/components/**, blessed
policies), ui/components/**, ui/shared/task-popup.ts, ui/unified/**,
ui/task-viewer/** (controller, editor, rendering, navigation, filters,
session, interactions, lifecycle-shortcut, configuration), ui/tui.ts,
ui/footer-content.ts, ui/list-removal-adapter.ts, ui/heading.ts,
ui/project.ts, ui/task-type.ts, ui/view-switcher.ts, ui/utils/strip-tags.ts,
ui/opentui/task-viewer.ts, src/types/neo-neo-bblessed.d.ts.
- Delete/rewrite blessed-only tests; update scripts/run-ci-tests.ts lanes;
delete scripts/run-tui-interactive-tests.sh and
tools/tui-screenshot-compare.sh (+ its test).
- Update docs: docs/opentui-workspace-implementation-plan.md,
docs/opentui-workspace-spec.md, docs/BACK-728-handoff.md references.
- Green check: tsc + build + verifier; rg "neo-neo-bblessed" src returns only
package/lock/nix outside tests.

Phase 5 - Remove dependency and verify
- Remove package.json neo-neo-bblessed entry; bun install; regenerate bun.nix;
drop the orphan .gitignore blessed-resources header.
- bunx tsc --noEmit; bun run check .; bun run build; find src -name '*.ts'
-newer dist/agentic-workspace prints nothing; bun run test.
- Manual TTY smoke: agentic-workspace board, agentic-workspace workspace, agentic-workspace doc view; plain
defaults for search, task view, task <id>, task list --project, draft
view/list, doc list.

## Implementation Notes

Phase 1 (interactive entry points) implemented in worktree
remove-legacy-blessed-tui-code-and-dependency-BACK-14:
- tasks/register.ts: removed runTaskListProjectView + TaskViewerController
interactive branches; printTaskViewOutput now treats non-json as plain; help
text de-plain-ed.
- Deleted cli/features/tasks/list-project.ts + list-project-filter.ts.
- drafts/register.ts: draft list + draft view are print-only; dropped
TaskViewerController/shouldAutoPlain.
- search.ts: removed
renderInteractiveSearch/buildSearchFilterDescription/hasAnyPrefix; always
plain/json.
- content-commands.ts: doc list + doc view print-only; dropped
genericSelectList/scrollableViewer imports.
- Removed registerOverviewCommand + deleted commands/overview.ts,
ui/overview-tui.ts, ui/overview-content.ts; cli/register.ts no longer wires
overview/shouldAutoPlain.
- tui-interactive-editor-handoff.test.ts: removed removed-entry-point
scenarios (bare task viewer + task list editor handoff), kept board ones.
Verification: bunx tsc --noEmit PASS; bun run check . PASS; focused tests PASS
(cli-auto-plain-non-tty, cli-doc-view, cli-doc-search, cli-draft-edit,
cli-list-window, cli-pipe-output, cli-json-output, cli-task-project,
task-project-filtering, cli-guidance, cli-root-entry,
tui-interactive-editor-handoff). Not built per instruction.

### Implementation progress (phases 1-5)

Phase 1: removed blessed interactive entry points (search, task view <id>,
bare task <id>, task list --project, draft view/list, doc list picker,
overview). TTY now defaults to plain; --plain still accepted. Deleted
commands/overview.ts, ui/overview-tui.ts, ui/overview-content.ts,
cli/features/tasks/list-project.ts + list-project-filter.ts and their
registration.

Phase 2: ported the rich task detail into the OpenTUI workspace via new
src/ui/opentui/task-detail-content.ts (StyledText, no blessed tags).
workspace-controller now loads TaskDetail (loadTaskDetail) and workspace.ts
renders it; local plain taskDetails() fallback kept. New test
src/test/opentui-workspace-detail.test.ts.

Phase 3: relocated survivors. Plain formatters ->
src/formatters/{checklist,code-path,status-icon,task-labels,acceptance-criteria-progress}.ts.
root-entry -> src/cli/root-entry.ts; loading rewritten blessed-free at
src/cli/loading.ts. OpenTUI-only models fold under src/ui/opentui/: keymap.ts,
task-filters.ts (FilterState + taskFilterOptions), task-lifecycle.ts,
board/{models,policies,configuration,interaction},
workspace/{state,model/drafts}. Blessed-tag emitters stripped
(wrapStatusColor, formatAcceptanceCriteriaProgress,
formatDependencyNodeTuiLabel, matchesKey, styleCodePath/transformCodePaths,
column-policy formatters). src/ui is now src/ui/opentui/** only.

Phase 4: deleted all legacy blessed code (src/ui/board, components, shared,
task-viewer, unified, utils, tui.ts, heading, project, task-type,
task-filter-wiring, task-lifecycle, footer-content, list-removal-adapter,
view-switcher, opentui/task-viewer) and core/tui-task-edit-session.ts +
Core.editTaskInTui. Deleted ~40 blessed-only tests and legacy tooling
(scripts/run-tui-interactive-tests.sh, tools/tui-screenshot-compare.sh);
updated run-ci-tests lists, CI workflow, docs, CLI-INSTRUCTIONS.md.

Phase 5: removed neo-neo-bblessed devDependency + ambient types; `bun install
--lockfile-only` pruned the jimp tree from bun.lock; `bun run update-nix`
regenerated bun.nix (also removed ~374 stale entries not present in the lock);
removed the .gitignore blessed section.

Verification: bunx tsc --noEmit clean; bun run check . clean; bun run build
landed (find src -name "*.ts" -newer dist/agentic-workspace prints nothing);
scoped/affected tests all pass. Full `bun run test` reports 226/226 files,
2106-2111 passed, but exits 1 solely due to a pre-existing load-sensitive 10s
timeout in src/test/cli-list-window.test.ts; reproduced identically on base
commit d02ba947 under the same 5-file contention (base also exits 1), so not a
regression. Manual plain smoke passes for task view / bare task / task list
--project / doc list / draft list / search / board export; `agentic-workspace overview`
is unknown.