# BACK-26 — Requirements

## Goal

Remove obsolete Spec Kit setup from the active mode configuration, make the existing YOLO setting effective for profiled launches, and make the Modes settings screen legible without changing its navigation.

## Behavior

1. Remove Spec Kit references from the live PLAN and BUILD prompts and remove `SPECIFY_FEATURE_*` variables from the OpenCode preset. Keep Backlog's canonical `spec.md`, `plan.md`, and `tasks.md` guidance; do not rewrite historical documents or captured session prompts.
2. The current effective `yoloMode` controls each harness's verified auto-approval flag on new and resumed sessions, with or without a profile, including snapshot-backed resumes. Preserve snapshot profiles, models, roots, and presets; already-running processes do not change. When YOLO is off, Backlog must not launch with a stale embedded auto-approval flag. OpenCode uses `--auto`, Claude uses `--dangerously-skip-permissions`, and Pi has no verified flag and remains unchanged. Do not introduce a per-mode toggle.
3. Retain OpenCode's configured native profile rules and the instruction that only the user can approve artifacts or change `.artifacts.json`. Harness permission auto-acceptance is not artifact approval. **Accepted risk:** the user chose Claude's full permission bypass even for PLAN; PLAN's read-only instruction cannot then be enforced by native permissions. Shell/MCP access can also circumvent OpenCode path rules. Profile instructions are not a security boundary under YOLO.
4. Keep the Modes settings category/mode/profile panes. Visually separate the profile overview and fields, show recognizable input/textarea surfaces for active name, approval-artifact, prompt, and artifact editors, and preserve mouse/keyboard selection, focus, Enter/Escape, textarea newline/staging, scrolling, and short/narrow-terminal access.

## Acceptance criteria

- Active config has no Spec Kit prompt text or `SPECIFY_FEATURE_*` variables; canonical Backlog task artifacts remain available.
- With YOLO on, new and resumed commands use only supported provider flags; with YOLO off, no auto-approval flag survives profile preparation. Model overrides survive command composition. Snapshot-backed resumes use the current setting without replacing captured profile data. Unsupported providers remain unchanged.
- OpenCode profile rules are installed; user-only artifact approval remains separate. Settings copy states provider-specific risks accurately.
- Mode fields and editors are distinguishable while existing focus and input behaviors and 80×16 / 72×14 reachability remain intact.

## Boundaries

No permission subsystem, per-mode YOLO switch, historical session rewrite, new UI navigation, new dependency, or Spec Kit migration.
