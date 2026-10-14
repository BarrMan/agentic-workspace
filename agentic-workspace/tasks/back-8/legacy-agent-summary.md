## Definition of Done

- [ ] bunx tsc --noEmit passes when TypeScript touched
- [ ] bun run check . passes when formatting/linting touched
- [ ] bun test (or scoped test) passes

## Implementation Plan

Implement single-default-server migration per description sections A-K, in order.
Milestones:
1. naming helper + pattern (A)
2. exec.ts default/TMUX="" (B); session-control.ts (E)
3. agent-host.ts guard/tags/teardown/env (C); vt-channel (D)
4. sessions/state + workspace-context v2 (G,H)
5. controller rewire (F)
6. startup sweep (I)
7. tests (J) + docs (K)
Verify: bun run build after each step; final bun run build + freshness check; bun test (scoped) + bunx tsc --noEmit; bun run check .

## Implementation Notes

PROGRESS (implementation landed, all in one pass; single default tmux server)

DONE (A–H, K by orchestrator + 3 parallel implementer subagents; I by orchestrator):
- Naming (A): session-utils.ts adds nativeSessionName(taskId,id)=`agentic-workspace-<slug>-<8hex>` + isAgenticWorkspaceSessionName + AGENTIC_WORKSPACE_SESSION_NAME_PATTERN. startReserved, prepareNativeSession, registerPendingSession all use it. Agent session names + CLI session names share one grammar.
- Transport (B): exec.ts accepts any -L label incl. "default"; grammar guard/isWorkspaceSocketName removed; every spawn uses env {...process.env, TMUX:""}.
- Session control (E): socket.ts (kill-server + resolveWorkspaceSocketName) DELETED. New live/tmux/session-control.ts: hasOwnedSession/killOwnedSession (kill-session -t + has-session proof; NEVER kill-server). ZERO production kill-server remains.
- Host (C): agent-host.ts takes taskId/sessionId/rootDir, sets SESSION-level @agentic-workspace_* tags, guard = has-session, async+sync teardown use kill-session, new-session passes -e HOME/SHELL/PATH/TERM. VT forwarder path=/tmp/agentic-workspace-vt-<sessionName>-<pid>.sock (A3/C10/D).
- Sessions/state (G): prepareNativeSession/adoptPendingSession/launchNativeRecord/prepareSession drop socketName; tmuxName derived from nativeSessionName.
- Context (H): WORKSPACE_CONTEXT_VERSION=2; field socket->session; socketAlive->sessionAlive; liveness = has-session on default.
- Controller (F): no socket minting; prepareSession(taskId,sessionId,predecessorId); createAgentHost({socketName:"default", sessionName:record.tmuxName, taskId, sessionId:record.id, rootDir}); isAgentAlive=has-session; context token session=record.tmuxName; probe target <tmuxName>:0.0.
- Startup sweep (I): new live/tmux/session-sweep.ts sweepStaleNativeSessions — list-sessions -F only, requires name grammar + @agentic-workspace_role=native-workspace + @agentic-workspace_owner_pid dead + @agentic-workspace_session present, best-effort pgid kill then killOwnedSession; inconclusive never kills; never kill-server/list-panes -a. Wired via OPTIONAL OpenTuiWorkspaceRuntime.sweepStaleSessions (createStaleSessionSweep at the 3 production entry points), so unit tests never touch the default server.
- Docs (K): opentui-workspace-session-contract.md / opentui-workspace-spec.md updated to single default server + session token.

VERIFICATION:
- bunx tsc --noEmit: clean.
- bun run check .: clean (biome).
- bun run build: success; find src -name '*.ts' -newer dist/agentic-workspace: EMPTY (binary fresh, per AGENTS.md).
- Full suite: 2361 pass across 260 files. ONE failure: src/test/tui-window-title.test.ts, reproduced unchanged at HEAD in a clean worktree (unrelated, pre-existing).
- Targeted: session-control.test.ts + opentui-agent-host-cleanup.test.ts + workspace-context.test.ts + agent-sessions.test.ts + opentui-workspace-controller.test.ts = 114 pass / 1 skip / 0 fail.

DEVIATIONS / REMAINING (from the plan's OPEN QUESTIONS):
- Sweep reaps only sessions whose @agentic-workspace_owner_pid is DEAD and matching tags; it does not distinguish STARTING vs RUNNING (only dead owner matters). Confirm policy.
- Picker delete of a running native session still refused (sessions.ts delete guard unchanged); could route through killOwnedSession later.
- Tags are SESSION-level (needed by the sweep) rather than pane-level as session-process.ts uses; both grammars coexist.
- new-session -e override of a poisoned server base env not yet experimentally confirmed on tmux 3.7c.
- has-session exit semantics: absence treated as exit!=0 with can't find session / no server running / no sessions.
- Not committed; working tree also contains unrelated pre-existing changes.

## Final Summary

Consolidated agentic-workspace workspace onto the single default tmux server: one named session per agent (agentic-workspace-<slug>-<8hex>), no private -L servers, no kill-server; teardown and startup sweep are session-scoped and never touch unrelated sessions. Fixed the regression that made pre-existing tasks fail to resume by migrating 15 legacy session records by hand (tmuxName ink-proto-* -> agentic-workspace-<slug>-<8hex>); no app migration code added. Verified: tsc/biome clean, binary rebuilt, targeted + full suite green (only the pre-existing unrelated tui-window-title failure), and all agents resume and run as named sessions on default alongside an unrelated AOE session. Committed on main (3e9ea04f). Follow-ups: perf reductions in BACK-9; test-runner hardening and the tui-window-title failure in BACK-11/BACK-12.