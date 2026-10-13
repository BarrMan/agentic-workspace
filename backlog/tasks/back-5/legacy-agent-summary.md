## Definition of Done

- [x] bunx tsc --noEmit passes when TypeScript touched
- [x] bun run check . passes when formatting/linting touched
- [x] bun test (or scoped test) passes

## Implementation Plan

A. Dropdown visual (src/ui/opentui/agent-settings.ts)
- Add settings-palette constants; replace addModalSurface with a compact, centered dropdown surface (width from longest entry, clamped; rounded accent border; one footer hint line).
- Render one row per entry (selected row: accent background, dark fg, bold, ">" marker; default tagged with a dot; unsupported adapters tagged). Keep entries order, selection-index logic, and key handling (Esc/Enter/Up/Down/j/k) unchanged.
- Keep the failing-callback path so the error text still appears in the frame.

B. Close immediately + warming preview (src/ui/opentui/workspace-controller.ts, #openTaskAgentPreset onSelect)
- After the awaited card-preset write, for handoff: mark the mounted predecessor agent as error so the live preview shows the warming placeholder, add the task to #startingTasks, schedule a refresh, then kick off #launchAgent(taskId, w, h, undefined, predecessor?.id) in the background (tracked in #agentStarts) and return immediately so the picker disposes.
- In the background task: on success stop the predecessor host and set the notice; on failure set the notice; finally clear #startingTasks/#agentStarts and refresh.
- Leave the non-handoff (p) path unchanged.

C. Tests
- opentui-agent-settings.test.ts: keep the inherit(undefined) and error-frame cases; add a selected-row highlight assertion.
- opentui-workspace-controller.test.ts: add an h handoff regression test (onHandoffRequest -> onSelect) asserting the modal closed, liveAgent goes warming -> host, the successor is the active session, and the predecessor is stopped.

D. Verify
- bunx tsc --noEmit; bun run check .; scoped bun test then full bun test; then bun run build and confirm no src/**/*.ts is newer than dist/backlog.

## Implementation Notes

Findings (root cause of the two UX problems):
- "h" is the correct handoff key (lowercase) and the binding already works.
- The chooser is mountOpenTuiPresetPicker (src/ui/opentui/agent-settings.ts:729), painted by addModalSurface (agent-settings.ts:69) as a 92%x92% box with a plain "> name [default]" text blob -> the ugly look.
- Handoff onSelect (src/ui/opentui/workspace-controller.ts:1703-1741) awaits the entire #launchAgent before returning, so the picker stays open on "Selecting preset..." until the agent is already running; the warming screen is never seen.
- The normal start path #startAgent (workspace-controller.ts:1001) backgrounds #launchAgent and adds #startingTasks, which drives the "Agent is warming up..." placeholder (src/ui/opentui/workspace.ts:491). Handoff must mirror this.
- During handoff #agents/#activeAgents still point at the predecessor, and the warming placeholder only appears when the selected agent is absent/errored (workspace-controller.ts:759-764), so the predecessor must be detached/marked error at kickoff.

Decisions:
- Reuse the single mountOpenTuiPresetPicker for both h (handoff) and p (choose task preset).
- Use a light dim backdrop behind the dropdown.
- Shorten titles to "Hand off <id>" and "<id> agent preset".

## Final Summary

Handoff and session start unified. Handoff now stops the active session, starts a fresh session, and marks it active; the CLI (agent-session handoff) and workspace (h) share the same path. Removed the separate handoff machinery: requestHandoff/continueHandoff, state.handoff, predecessorId, HANDED_OFF, and the handoff-continue worker. The preset picker was widened/roomed up. Verified: bunx tsc --noEmit and bun run check . clean; full suite 264/264 files / 2389 tests (only pre-existing cli-list-window load-flake); dist/backlog rebuilt and fresh.