# P8S-B — Settings, sessions/artifacts, help/dialogs

Presentation-only evidence against [screen contracts](../screens/README.md) and [DESIGN-SYSTEM](../DESIGN-SYSTEM.md). Contracts are unchanged. `verified` means the scoped source and a proving test align; `gap` means a demonstrated mismatch; `blocked` means required evidence is outside the sealed lane; `unknown` means this trace does not prove the claim.

## Settings — `src/ui/opentui/agent-settings.ts`

| Claim | Evidence / status |
|---|---|
| Full-screen header, 20-column category pane, adjacent rounded content, footer, focus cyan | Renderer composition at `agent-settings.ts:266-347,632-647`; `opentui-agent-settings.test.ts:72-112` checks shell/panes. **verified** |
| Preset editing, stage/commit/cancel, explicit default; committed draft only on save | `agent-settings.ts:1064-1085,1114-1117,1130-1163`; tests `151-226,392-425`. **verified** |
| Mode/model/permission fields and instruction vs native-support explanation | `agent-settings.ts:491-501,829-870`; model picker mounted in this module and mode settings suites exercise editing (`opentui-mode-settings-input.test.ts`, `opentui-mode-settings-contract.test.ts`). **verified** |
| Validation/save failure visible without losing staged values | Save catch and retained draft `agent-settings.ts:1144-1163`; preset callback failure test `opentui-agent-settings.test.ts:426-490`; field validation flows in `opentui-mode-settings-input.test.ts`. **verified** |
| Environment multiline paste/Shift+Enter and constrained sizes/selection access | `agent-settings.ts:387-395,706-715`; tests `275-391`. **verified** |
| Removal/history presentation and behavior | Mode delete shows session count/destination `agent-settings.ts:886-891`; behavior uses draft functions. Exact history/removal presentation and tests are not fully mapped. **unknown** (next trace: follow delete/default/session-count paths and assert rendered history/removal states). |

## Sessions and artifacts

| Claim | Evidence / status |
|---|---|
| Picker selection, identity, newest-first ordering, empty state, resume feedback and retained selection on failure | `session-picker.ts:21-28,51-70,80-100`; `opentui-session-picker.test.ts:27-109,150-176`. **verified** |
| Picker modal input containment, cancellation and focus return | Key/paste listeners and prior-focus restoration `session-picker.ts:71-79,121-159`; tests `61-109,150-176`. **verified** |
| Attach/resume captured task/session intent | callbacks receive session ID; selected task captured by options, but end-to-end operation ownership is outside this lane. **blocked** (next trace: P3/P5 attach/resume caller and IF-SI acceptance). |
| Artifact listing, selection, approval/draft/missing labels; text/binary view; empty/error states | `task-artifact-view.ts:220-247,260-289`; approval projection test `opentui-artifact-approval-projection.test.ts`; live view test `artifact-view-live-refresh-contract.test.ts:63-107`. **verified** |
| Artifact view keeps selected task/mode context visible | View receives task ID but this component renders no task/mode context (`task-artifact-view.ts:18-24,49-50,260-268`). Caller composition is not in allowlist. **blocked** (next trace: caller's surrounding header/context and a rendered-frame assertion). |
| Artifact storage semantics | Backend-owned; deliberately not changed or evaluated. **blocked** (next trace: backend lane). |

## Help and dialogs

| Claim | Evidence / status |
|---|---|
| Help shortcut ordering/search/capture flow | Help renderer is not in the sealed allowlist and no corresponding source/test was traced. **blocked** (next trace: P7 help render module and IF-WB-007 tests). |
| Confirm dialog copy, accept/decline/cancel and containment | `confirm.ts:26-68,70-99`; `opentui-confirm.test.ts:24-46`. **verified** |
| Group create/delete composition, destination/root selection and Escape cancel | `group-modal.ts:22-44`; `group-delete-modal.ts:32-65`; tests `opentui-group-modal.test.ts:37-115`, `opentui-group-delete-modal.test.ts:38-100`. **verified** |
| Focus return for confirm/group forms | Confirm does not record/restore prior focus (`confirm.ts:15-20,68-77`); group delegates to `mountTaskForm` outside the allowlist (`group-modal.ts:29-44`, `group-delete-modal.ts:54-66`). **unknown** (next trace: confirm focus lifecycle and task-form focus restoration assertion). |
| Modal input containment and preserving values on submit failure | Confirm listener stops propagation; groups delegate to shared task form, whose containment/failure behavior was not traced here. **unknown** (next trace: task-form implementation plus failure/paste interaction tests). |
| Shared pattern divergence | No shared pattern change established by this trace; no shared styling was edited. |

**Totals:** verified 9; gap 0; blocked 4; unknown 3. No demonstrated gap met the fix threshold; no source or test files changed.
