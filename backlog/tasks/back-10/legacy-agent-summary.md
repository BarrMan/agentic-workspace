## Definition of Done

- [x] bunx tsc --noEmit passes when TypeScript touched
- [x] bun run check . passes when formatting/linting touched
- [x] bun test (or scoped test) passes

## Implementation Plan

Item 1: strip worktree from types.ts (AgentPreset), config.ts (built-ins + assertPreset), session-store.ts isPreset, commands/agent-workspace.ts (PresetOptions, applyPresetOptions, --worktree option/help/example), ui/opentui/agent-settings.ts customPreset; update all AgentPreset test literals/snapshots; drop the invalid-worktree case in config.test.ts.
Item 2: add a 'toggle' field kind to mountTaskForm (controls.ts) with boolean values; add worktreePerTask/yoloMode fields to taskComposerFields prefilled via resolveSessionSettings(options.agentConfiguration); on submit write input.agentConfiguration.sessions when changed. Verify worktree creation honors the card override via ensureTaskWorktreeFor.
Then: bunx tsc --noEmit, bun run check ., scoped+full tests, bun run build, binary smoke test.

## Implementation Notes

Implemented remaining items (2026-10-08).
Item 1: removed per-preset 'worktree' from AgentPreset (types.ts), the 7 built-ins + assertPreset (config.ts), isPreset (session-store.ts), the --worktree CLI option/help/example (commands/agent-workspace.ts), and customPreset (ui/opentui/agent-settings.ts). Added config.ts stripLegacyPresetFields so legacy agents.json / card configs no longer round-trip the key on read. Updated all AgentPreset test literals/snapshots, removed the invalid-worktree case, and added a legacy-strip test.
Item 2: added a 'toggle' field kind to mountTaskForm (ui/opentui/controls.ts) with boolean values and a focusable [x] control; task-composer.ts now renders 'Worktree per task' and 'YOLO mode' checkboxes prefilled from resolveSessionSettings(resolved project config) and persists card-scope agentConfiguration.sessions only when a value differs from inherited or a non-inherit preset is chosen. New src/test/opentui-task-composer.test.ts (5 tests).
Verification: bunx tsc --noEmit clean; bun run check . clean; scoped tests green; full suite 266/266 files, 2404 passed, exit 0 (runner --timeout=30000; cli-list-window.test.ts exceeds the 10s per-test default only under 5-lane load, passes 7.4s in isolation). bun run build rebuilt dist/backlog, freshness check empty. Binary smoke: project worktreePerTask=true creates git worktree backlog/task/<ID> on create and removes it on Done; legacy config keys stripped on read.
Legacy blessed UI cleanup split into BACK-14. Task left In Progress for user verification/close.

## Final Summary

Per-task worktree and YOLO session settings: project Settings > Sessions tab plus per-task override at creation via two composer checkboxes. Legacy per-preset worktree field removed (config read strips it) and all verification green.