## Plan synced (2026-10-09)

### Decisions
- Display: Option+G on macOS (darwin) / Alt+G elsewhere. Never the raw composed glyph, never Meta.
- Robustness: option (c) = enable kitty keyboard + resolve event.baseCode + ABC/US compose-table fallback.
- Delete group default destination = the deleted group parent (Root if it is a root-level group). Same behavior for nested child groups.
- Deleting a group moves its direct tasks AND direct child groups to one destination (Root checkbox or one group), then removes only the deleted group.

### How AOE does it (reference: /Users/imribarr/tmp/projects/agent-of-empires)
- Config notation Alt+<single-char>, case-insensitive, lowercased (src/session/config/mod.rs:241; src/tui/home/input.rs:354).
- Pushes kitty DISAMBIGUATE_ESCAPE_CODES on startup (src/tui/mod.rs:164-176, app.rs:457) so Alt/Option arrives as KeyModifiers::ALT.
- Dispatch matches code==Char(c) and modifiers==ALT (input.rs:528-535). No compose table, no baseCode; non-kitty terminals must configure Option=Esc/Meta.
- Display Alt+KEY universally (bindings.rs:378-397); no OS-specific Option relabel.
- Plugin chord parser rejects alt/option/meta/super/cmd (bindings.rs:327).

### Root cause in AgenticWorkspace
- createOpenTuiHost (src/ui/opentui/host.ts:11) never sets useKittyKeyboard, so kitty is disabled in production (buildKittyKeyboardFlags(null)=0). Most OpenTUI test suites pass kittyKeyboard:true, so tests exercise kitty but prod does not.
- Verified with OpenTUI parser: CSI 103;3u -> {name:g, option:true, meta:true} which already matches M-g; CSI 169:0:103;3u -> {name:(c), option:true, baseCode:103}.
- OpenTUI with useKittyKeyboard {} defaults disambiguate+alternateKeys (flags 5) and parses CSI-u, exposing event.option and event.baseCode. It does not map a bare glyph back to a base key.

### Workstream A - Option/meta keybindings
Files: src/ui/opentui/host.ts, src/ui/opentui/keybindings.ts, src/ui/keymap.ts, new src/ui/opentui/option-compose.ts, tests.
1. host.ts createCliRenderer -> useKittyKeyboard: {} (explicit disambiguate+alternateKeys).
2. keybindings.ts shortcutKeyFromEvent: for option/meta chords resolve base key: event.baseCode char if present, else compose-table lookup, else event.name.
3. New option-compose.ts: ABC/US compose table + reverse lookup.
4. keymap.ts keyFromCanonical accepts Option-/Alt-/A- as aliases of M-; formatKey and keybindings.ts formatShortcutKey render meta as Option on darwin / Alt elsewhere.
5. Tests: alias parsing; shortcutKeyFromEvent for baseCode and composed glyph; recording stores canonical and displays Option+G; workspace.newGroup matches the composed-glyph path.

### Workstream B - delete a group
Files: src/ui/opentui/workspace.ts, src/ui/opentui/workspace-controller.ts, new src/ui/opentui/group-delete-modal.ts, src/ui/opentui/groups.ts, tests.
1. workspace.ts: add onGroupDelete option; deleteTask keybinding branches on selected row kind group vs task; add [S-d] Delete footer hint for groups.
2. New group-delete-modal.ts: mountTaskForm with Root checkbox + Group select; default destination = parent group or Root.
3. workspace-controller.ts #deleteGroup: empty group -> openConfirm then remove; non-empty -> destination modal -> reparent direct tasks and direct child groups to chosen destination -> remove deleted group; clear selection if selected; register modal in hasModal/dispose; notice + refresh.
4. groups.ts: destination options exclude the deleted group plus all descendants (collectDescendantGroupIds) to avoid cycles.
5. Tests: group-delete-modal, controller empty/non-empty/nested, workspace hint and key routing.

### Execution
Two deepseek-general subagents in parallel (A: host/keymap/keybindings/option-compose; B: workspace/controller/group-delete-modal/groups). Orchestrator integrates, then bun run build and find src -name '*.ts' -newer dist/agentic-workspace (must print nothing). DoD: bunx tsc --noEmit, bun run check ., scoped tests, build.

### Correction (2026-10-09): kitty is ALREADY enabled; compose table is the fix
- Verified against @opentui/core 0.5.14 (chunk-bun-j2z63cdy.js): const kittyConfig = config.useKittyKeyboard ?? {}; buildKittyKeyboardFlags(kittyConfig). With host.ts unchanged, kittyConfig={} -> flags=5 (disambiguate+alternateKeys) and useKittyForParsing=true. The renderer.d.ts comment null/undefined = disabled is misleading; only false disables. So kitty is enabled in production and setting useKittyKeyboard:{} is a NO-OP. Workstream A step 1 dropped; no host.ts change.
- AgenticWorkspace runtime check: buildKittyKeyboardFlags(undefined)=0, (null)=0, ({ })=5, undefined ?? { } = { } => 5.
- iTerm2 Option=Normal does not implement the kitty protocol and delivers the composed glyph (c) with option:false (matches the original root cause key (c)). So the fix is the compose-table mapping applied even when option/meta is false: if the event is a bare modifier-less known Option-composed glyph, map it to {key: base, meta: true}. baseCode resolution applies only when a modifier flag is set, so Shift+digit (alternateKeys) is never turned into meta.
- Still valid: option-compose.ts table; shortcutKeyFromEvent resolution; Option+G on darwin / Alt+G elsewhere; Option-/Alt-/A- aliases of M-.
- Test correction: must assert shortcutKeyFromEvent({name:(c)}) with NO modifiers resolves to {key:g, meta:true}, and that plain g still does NOT match M-g.

\n### Controller group deletion implementation (2026-10-09)\n- Added injectable runtime mountGroupDelete and implemented #deleteGroup: empty groups use the standard confirmation; populated groups offer eligible destinations excluding the group subtree and move direct task membership plus direct child groups in one GroupStore update. Group array ordering and task membership entries are preserved except for the moved direct tasks; only the selected group is removed.\n- Added src/test/opentui-workspace-controller-groups.test.ts covering empty-group confirmation, subtree exclusion, reparenting, and child order.\n- Rebuilt after changes with bun run build. bunx tsc --noEmit: no errors. Scoped test passed (1 file, 1 test).

## Implementation complete (2026-10-09)
- Rebased agentic-workspace/task/BACK-17 onto main (8624d5da); restored WIP and resolved conflicts from main refactors (keymap moved to src/ui/opentui/keymap.ts; controls.ts checkbox->toggle).
- Workstream A (Option/meta): verified on rebased tree; no code changes needed. Suites: opentui-keybindings, ui-keymap, ui-option-compose.
- Workstream B (delete group): implemented #deleteGroup in workspace-controller (empty -> confirm then remove; non-empty -> destination modal defaulting to parent/Root, moves direct tasks + direct child groups preserving order, destinations exclude deleted group + all descendants); added runtime mountGroupDelete; adapted group-delete-modal to toggle API; workspace.ts footer hint + key routing.
- New tests: opentui-group-delete-modal.test.ts, opentui-workspace-controller-groups.test.ts.
- Verification: bunx tsc --noEmit clean; bunx biome check . clean (only pre-existing status-icon infos); 8 scoped suites 81/81 pass; bun run build succeeded; find src -name *.ts -newer dist/agentic-workspace printed nothing.
- Note: build landed in the worktree dist/agentic-workspace; /opt/homebrew/bin/agentic-workspace still targets main dist (per user: no AGENTIC_WORKSPACE_BUILD_OUTFILE override). Task left In Progress; user moves to Done.