# P8S-A — Board, tasks, and filters evidence ledger

Authority: [Board](../screens/board.md), [Tasks](../screens/tasks.md), [Design system](../DESIGN-SYSTEM.md), [IF-WB](../specs/workspace-and-board.md), [IF-FS UI](../specs/filtering-and-search.md). Evidence only; contracts were not edited. `verified` means source and a focused test support the claim; `gap` means a concrete mismatch; `unknown` means trace/test coverage is insufficient; `blocked` means evidence crosses the frozen seam.

## Board

| Requirement | Status | Render path / evidence |
|---|---|---|
| Configured status columns, identity, empty status lanes | unknown | `src/ui/opentui/board.ts:102-142,245-283`; column behavior test is model policy only (`src/test/board-ui.test.ts:18-59`), not render proof. |
| Milestone grouping | unknown | `board.ts:116-141`; no scoped test proves grouping render. |
| Ordered summary, selected context, footer and no-column/no-match states | unknown | `board.ts:168-199,236-285`; no scoped render test. |
| Selection/navigation and preview, cancel, commit | unknown | `board.ts:295-333,417-459`; no board mount interaction test found in scoped inventory. |
| Task actions and application dispatch | blocked | callbacks at `board.ts:335-339,356-375`; following callback into application operations crosses frozen controller/application files. |
| View/workspace handoff, filters/settings/help, hide-empty/history | blocked | intent callbacks at `board.ts:391-415,473-506`; end-to-end owner outside allowlist. |
| Terminal resize, clipping, selected task access | unknown | `board.ts:217-255,257-283,518-520`; no terminal-size render test established. |
| Loading/error retains move and task context | unknown | notice slot at `board.ts:284`; pending move context at `board.ts:213-216`; controller error state is outside seam and no UI failure test proves retention. |
| Focus/status marker/footer design-system fit | unknown | selection emphasis `board.ts:260-278`; shared status text+marker rule is DESIGN-SYSTEM.md:5-17; no board render assertion proves it. |

## Tasks

| Requirement | Status | Render path / evidence |
|---|---|---|
| Detail identity, status, type/priority, milestone, labels, dependencies/readiness, description | verified | `src/ui/opentui/task-detail-content.ts:104-112,129-194,259-269`; `src/test/opentui-workspace-detail.test.ts:57-94` asserts identity, priority, milestone, readiness, graph and description. |
| Removed due-date field absent in detail | gap (fixed) | Was rendered by `task-detail-content.ts:129-137` despite tasks contract `docs/screens/tasks.md:7`; removed. Regression assertion: `src/test/opentui-workspace-detail.test.ts:80-84`. |
| Create/edit supported field composition | unknown | Create fields `src/ui/opentui/task-composer.ts:98-170`; no edit composer file is within this package; composer test `src/test/opentui-task-composer.test.ts:49-215` covers session controls/cycling, not the entire contract field matrix. |
| One-line option cyclers, wrapping, keyboard focus | verified | `task-composer.ts` mounts fields via `controls.ts` at `186-233` (implementation of control is outside allowlist); `opentui-task-composer.test.ts:175-215` verifies arrow wrap. |
| Save failure preserves unsaved values | unknown | Composer submits at `task-composer.ts:205-233`; form implementation and rejection path are in no-touch `controls.ts`, and scoped composer tests do not assert failure retention. |
| Detail selected-mode session context and constrained terminal behavior | unknown | Not present in detail-content input (`task-detail-content.ts:17-21,259-269`); composition and sizing require host/controller trace and focused tests. |
| Task actions target captured task; renderer has no writable domain state | verified | `src/ui/opentui/task-actions.ts:71-76,157-180` dispatches captured `options.task`; `task-lifecycle.ts:43-68` calls operation and reports outcomes. No direct UI test found proving these paths end-to-end. |

## Filters

| Requirement | Status | Render path / evidence |
|---|---|---|
| Supported filter dimensions, summary, clear/reset and apply | verified | `src/ui/opentui/filters.ts:24-37,198-201,268-310`; `src/test/opentui-filters.test.ts:20-94,96-130` proves choices, apply, cancel and reset. |
| Selection interactions, focus visibility, input containment | verified | `filters.ts:277-281,327-425`; filter test `opentui-filters.test.ts:20-94` verifies modal owns keys and typing does not leak. |
| Empty results / error feedback / preserve draft on failure | unknown | Editor apply disposes before `onApply` (`filters.ts:293-299`); no filter-specific empty/error/failure-retention test located. Matching-result and error display are controller-owned beyond the allowlist. |
| Backend matching/order not reimplemented | verified | `task-filters.ts:15-30` translates state to existing `TaskFilterOptions`; no local matching/ranking implementation. |

## Shared pattern / remaining trace

No shared-pattern change is requested. Existing modal styling follows the current shared focus/containment/value-retention rules (`filters.ts:158-195,327-425`; DESIGN-SYSTEM.md:23-29); exact universal geometry is explicitly open. The fixed detail due-date exposure was the only demonstrated screen-contract mismatch. Remaining work is evidence, not assumed defects: add/locate board mount-level interaction and terminal-size tests; trace controller callback persistence/error handling outside this sealed lane; test composer rejection preservation through the `controls.ts` form; test filter apply rejection and controller empty/error presentation. These dependencies remain unverified here rather than being inferred from source shape.

**Totals (rows above): verified 6; gap fixed 1; blocked 2; unknown 10.**
