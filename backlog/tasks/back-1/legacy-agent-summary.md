## Definition of Done

- [x] bunx tsc --noEmit passes when TypeScript touched
- [x] bun run check . passes when formatting/linting touched
- [x] bun test (or scoped test) passes

## Implementation Plan

Add per-session deletion (single session at a time).

API:
- SessionStore.remove(taskId, sessionId): remove one record under lock, clear activeSessionId/handoff when they reference it, return removed record.
- AgentSessionService.delete(taskId, sessionId, { force? }): reject RUNNING/STARTING without force; with force kill a live non-native pane first; retire a pending request marker; remove record; best-effort unlink outputPath + bootstrapPath; clear active pointer. Native workspace panes are workspace-owned (refuse to kill, but allow record removal when stopped).
- WorkspaceStateService.deleteSession facade.

CLI: backlog agent-session delete <taskId> --session <id> [--force].

TUI: session picker gains delete key (d/Delete) with inline confirmation and onDelete callback; workspace controller wires it to deleteSession with force after confirmation.

Decisions: single session; refuse running/starting unless --force (stop-then-delete); remove .log/.md sidecars; expose in CLI and TUI; deleting the active session clears the pointer.

Docs: add lifecycle row to docs/opentui-workspace-session-contract.md.

Verification: bunx tsc --noEmit, bun run check ., bun test (scoped), rebuild binary.

## Implementation Notes

Implemented per-session deletion across core, CLI, and TUI.

Core: SessionStore.remove clears activeSessionId/handoff references in one locked mutation; AgentSessionService.delete refuses running/starting unless force (force kills a non-native pane first), always refuses running native workspace sessions, removes native STARTING pending requests with their marker, and best-effort unlinks outputPath/bootstrapPath; WorkspaceStateService.deleteSession facade.

CLI: backlog agent-session delete <taskId> --session <id> [--force].
TUI: session picker d/Delete opens inline confirmation; y deletes via deleteSession(taskId,id,{force:true}); n/Esc cancels; controller cleans in-memory presentation.

Verification: bunx tsc --noEmit clean; bun run check . clean; 81 pass/1 skip/0 fail across agent-sessions, agent-workspace-cli, opentui-session-picker, opentui-workspace-controller tests. Manual run against rebuilt dist/backlog: help lists 'delete [options] <taskId>'; deleting a seeded stopped session exited 0, removed the record + .log/.md sidecars, and cleared the active pointer. Binary rebuilt (no src file newer than dist/backlog).