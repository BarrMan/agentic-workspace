# P8S — Other screens

Authority: [board](../screens/board.md), [tasks](../screens/tasks.md), [settings](../screens/settings.md), [sessions/artifacts](../screens/sessions-artifacts.md), [help/dialogs](../screens/help-dialogs.md), [design system](../DESIGN-SYSTEM.md), [IF-WB](../specs/workspace-and-board.md), [IF-FS](../specs/filtering-and-search.md). This is evidence, not a contract. No contract documents are edited.

Status meanings: `unknown` = not fully evidenced; `gap` = demonstrated mismatch; `blocked` = dependency/evidence prevents judgment; `verified` = requirement-specific source and interaction/test evidence. Screen contracts leave some details unspecified; those are recorded as exceptions, not invented requirements.

## Board — `src/ui/opentui/board.ts`

| Checklist item | Evidence / exception | Status |
|---|---|---|
| Configured status columns, task identity/status, task rows; milestone grouping when enabled | Renderer inspected; source uses board projection | unknown |
| Filter summary, selected-task context, footer action hints; empty columns/tasks and no configured columns | Rendered states present in source; runtime evidence absent | unknown |
| Focus/selection; column/task navigation; `g`/`G`, Home/End; preview, cancel, commit move | Handlers inspected; no board interaction test found in scoped test inventory | unknown |
| Task select/create/edit/copy/complete/archive, settings/filter/help, view/workspace handoff, hide-empty, history | Intent callbacks are provided; application operation path not audited end-to-end | unknown |
| Resize, narrow columns, clipping, horizontal/vertical visibility and selected-task access | Dynamic column/row viewport and clipping present; minimum size and scroll contract unspecified | unknown |
| Loading/operation failure feedback retains pending move and task context | Contract specifies visible feedback but exact placement/copy unspecified; not established by inspection | unknown |
| Shared status labels/markers, focus visibility and footer/dialog treatment | DESIGN-SYSTEM application not fully verified | unknown |
| IF-WB-001 view switching preserves organization; IF-WB-005 board composition; IF-WB-006 move/action flows | Requires controller/application and interaction evidence; no edits to P7 files | blocked |

## Tasks — detail, composer, actions, lifecycle

| Checklist item | Evidence / exception | Status |
|---|---|---|
| Detail identity, description, status, type, priority, milestone, labels, dependencies/readiness, selected-mode session context | Exact detail ordering is unspecified; source/test evidence not yet mapped per field | unknown |
| Create fields: title, description, status, type, priority, agent preset, worktree-per-task, YOLO; edit: title, description, type, priority | No removed fields (due date, separate project) may be exposed | unknown |
| Option cycler uses one-line `◀ value ▶`; arrows wrap; keyboard focus stays in form | Exact order/required markers unspecified | unknown |
| Save/cancel and failure preserve unsaved form values; empty optional differs from unavailable/error | Failure-path evidence not established | unknown |
| Short/narrow terminal navigation, fitting controls, clipping/wrapping/scrolling | Exact minimum dimensions and policies unspecified | unknown |
| Task action and lifecycle intents target captured task; no renderer-owned domain mutation | Application/domain ownership path and failure behavior need tracing | unknown |

## Settings — `agent-settings.ts`

| Checklist item | Evidence / exception | Status |
|---|---|---|
| Fullscreen shell; three-row Settings/[ Project ] header and three-row contextual footer | Geometry and field composition specified by screen contract | unknown |
| 20-column rounded Categories pane with Agents; rounded content pane; cyan `#22d3ee` focus | Exact dialog copy/wrapping/minimum dimensions unspecified | unknown |
| Named presets, mode instructions, model selection/discovery, permission controls; distinguish guidance from provider-enforced restrictions | CONFIG contracts own behavior; P8S audits UI consumption only | unknown |
| Label, selected-field description, read-only value; field editing visibly identified | Inspection and interaction evidence incomplete | unknown |
| Right enters fields, Left returns; Tab/Shift+Tab, Up/Down, mouse selection; Enter edit/commit; Escape cancels editor | Keyboard containment/focus visibility require interaction evidence | unknown |
| Preset arrows stage choice; Space sets default; `n` copies adapter; Ctrl+S saves committed draft only | CONFIG-008 owns save/cancel semantics | unknown |
| Multiline environment paste; Shift+Enter newline where supported; hidden horizontal and overflow-only vertical scrollbar | Constrained-size/terminal evidence absent | unknown |
| Discovery/availability and validation/save error retains staged values | CONFIG-010 and CONFIG-008; failure retention not verified | unknown |

## Sessions and artifacts

| Checklist item | Evidence / exception | Status |
|---|---|---|
| Session picker shows retained sessions for selected task/mode with enough identity; loading/unavailable/resume-failure feedback | Exact row composition/copy unspecified; selected context and attach/resume ownership require end-to-end trace | unknown |
| Selection, attach and resume actions use captured session/task intent | IF-SI-001/002 behavior; P7/P3 ownership dependency | blocked |
| Artifact list represents generic files in selected task `artifacts/`; text/Markdown and binary metadata viewing; read/write selected file | No required filenames, mode-specific expectations, or file-level approval indicators | unknown |
| Artifact errors/loading/empty states and selected task/mode context remain visible | Long-content/filename handling, truncation, wrapping, paging and exact states unspecified | unknown |
| Keyboard focus/actions and constrained-terminal access | Configured bindings apply; interaction evidence absent | unknown |

## Help and dialogs

| Checklist item | Evidence / exception | Status |
|---|---|---|
| Help lists complete shortcuts; searchable; aligned binding and description columns, including capture | Exact row order and empty-search copy unspecified | unknown |
| `/` search, Enter capture; inline Press key prompt; first stroke display/prompt placement; optional second stroke; Save/Discard | IF-WB-007 and screen flow; complete key-transition test evidence absent | unknown |
| Escape after first stroke confirms single-stroke binding; Left/Right choice; Enter applies; Escape can be recorded; nothing persists before Save | Conflict/prefix rejection retains working binding | unknown |
| Dialog context, active control/actions; opaque filter modal owns keyboard and paste; Enter/Ctrl+S apply, Ctrl+R reset draft, Escape cancels | No universal dialog geometry; minimum size/clipping/action priority unspecified | unknown |
| Modal containment; visible focus; failed operation retains unsaved input | DESIGN-SYSTEM rule; failure-path interaction evidence absent | unknown |
| Constrained terminals keep prompt, value and primary actions keyboard reachable | No universal sizing behavior specified | unknown |

## Filter UI — IF-FS-001..003

| Checklist item | Evidence / exception | Status |
|---|---|---|
| Filter dimensions: text, status, type, priority, milestone, label; active summary; clear/reset | IF-FS-001. Must dispatch filters; matching and ordering remain backend-owned | unknown |
| Draft selection interactions, apply, reset, cancel; input/paste containment | IF-FS-001/003 and help-dialog contract; exact modal geometry unspecified | unknown |
| Empty matching set and filter/search error feedback; preserve draft on failure | No filter-specific empty/error proof found | unknown |
| Filter scope stays project directory; UI does not reimplement matching/combination/order/archive rules | IF-FS-001..003 backend-owned; P8B/P5 dependencies | blocked |

## Shared pattern and handoff

No shared presentation file was changed. No exact shared-pattern change request is established by this bounded source inspection; if a concrete need appears, transfer the exact request to P7 before editing. P7-owned `workspace.ts`, controller, controls, keybindings and keymap remain untouched. Backend matching/order remains P8B-owned; corpus/archive wiring remains P5-owned.

**Status totals:** verified 0; gap 0; blocked 3; unknown 37. This is an incomplete evidence ledger, not an alignment claim. Inspection was limited; unresolved `unknown` rows need requirement-specific source/test/interaction evidence before status changes.
