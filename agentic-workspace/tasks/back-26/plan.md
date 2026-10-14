# BACK-26 — Implementation plan

## Affected areas

- **Mode configuration:** Update only the active PLAN/BUILD prompts and OpenCode preset environment in `agentic-workspace/agents.json`. Preserve canonical AgenticWorkspace artifact guidance.
- **Launch policy:** In `src/agent-workspace/session-launch.ts`, build the command from the prepared profile preset rather than the original preset, then apply the current YOLO policy and provider-registered flag. Prevent stale embedded flags when YOLO is off. Preserve OpenCode native permission rules and its special handling for the one-shot `serve` process. In `src/agent-workspace/sessions.ts`, use the current effective setting for snapshot-backed resumes instead of forcing YOLO off, without changing captured profile/model/root data. Update the Sessions YOLO explanation in `src/ui/opentui/agent-settings.ts` to distinguish OpenCode, Claude, and Pi.
- **Modes presentation:** Improve field grouping, spacing, selected-state visibility, and native input/textarea styling in the Modes section of `src/ui/opentui/agent-settings.ts`. Retain the current three-pane layout, focus ownership, and viewport-aware editor sizing.

## Phases and safe parallel work

1. Clean the active configuration and establish current launch/UI behavior.
2. Implement launch behavior with focused regressions for profile commands/model overrides, on/off toggles, providers, new/resumed/snapshot sessions. Modes UI design and targeted interaction-test preparation can proceed independently. Coordinate any shared `agent-settings.ts` edits.
3. Integrate, run only affected test files, and manually check representative behavior with the rebuilt installed binary. After **every code change**, run `bun run build` before making another code change; verify no `src/**/*.ts` is newer than `dist/agentic-workspace`. Serialize builds and writer changes even when read-only design or review runs in parallel.

Preserve unrelated uncommitted work. Neither approving artifacts nor editing `.artifacts.json` is part of this task.
