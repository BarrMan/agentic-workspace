---
task_schema_version: 3
id: BACK-8
title: Investigate performance degragation of AgenticWorkspace
status: Done
created_date: '2026-10-07 15:52'
updated_date: '2026-10-08 02:45'
labels: []
dependencies: []
ordinal: 8000
agentConfiguration:
  selectedPreset: opencode
  presets:
    opencode:
      command:
        - opencode
      env: {}
      prepare: ''
      worktree: false
      bootstrap: opencode
    claude:
      command:
        - claude
      env: {}
      prepare: ''
      worktree: false
      bootstrap: claude
    codex:
      command:
        - codex
      env: {}
      prepare: ''
      worktree: false
      bootstrap: codex
    gemini:
      command:
        - gemini
      env: {}
      prepare: ''
      worktree: false
      bootstrap: gemini
    agy:
      command:
        - agy
      env: {}
      prepare: ''
      worktree: false
      bootstrap: antigravity
description: >-
  GOAL

  `agentic-workspace workspace` must use EXACTLY ONE tmux server: the default
  tmux server (no `-L`). Every agent is ONE tmux session on it, named uniquely.
  No private `-L ink-proto-<pid>-<n>` servers. This matches AOE
  (docs/aoe-agent-workspace-reference.md:379,384;
  docs/opentui-workspace-spec.md:20;
  docs/opentui-workspace-session-contract.md:14). The CLI `agent-session`
  backend already does this (session-process.ts:132 `new Server({ socketName:
  "default" })`); only the native workspace path deviates.


  WHY WE ARE HERE (root cause)

  The native path mints a private per-launch server:
  workspace-controller.ts:19,1205 `resolveWorkspaceSocketName(process.pid,
  ++#agentInstance)`; :1267-1271 `createTmuxExec({socketName})` +
  `createAgentHost({socketName, sessionName:"agent"})`; agent-host.ts:219,223
  `new-session -L <socketName>`; teardown via socket.ts:61 `kill-server`. This
  was a deliberate BACK-728 prototype carry-over ("never touch the developer's
  default socket", docs/agent-session-ownership-plan.md:114,123) promoted in
  216776cd. Cost: N servers for N tasks + no reaper (tmux-orphan-sweep.ts
  deleted in 216776cd). ALSO a drift: design said "one server per workspace";
  code is one per launch.


  PLAN (ordered)


  A. NAMING (first)

  1. Add `nativeSessionName(taskId,id) =>
  \`agentic-workspace-${slug(taskId)}-${id.slice(0,8)}\`` in
  src/agent-workspace/session-utils.ts; reuse at sessions.ts:464; use for native
  records at sessions.ts:214,288,404. Ownership grammar:
  /^agentic-workspace-[a-z0-9-]+-[0-9a-f]{8}$/.

  2. Gates already derive from sessionName (vt-channel.ts:778,
  agent-host.ts:218) -> become unique automatically.

  3. vt-channel.ts:554 forwarder path ->
  /tmp/agentic-workspace-vt-${sessionName}-${process.pid}.sock (sessionName
  available at vt-channel.ts:174). MANDATORY: on a shared server all sessions
  share socketName and one process shares pid.

  4. agent-host.ts:152 capture path -> ink-agent-${sessionName}.raw.


  B. TRANSPORT

  5. src/agent-workspace/live/tmux/exec.ts: accept socketName "default"; remove
  grammar guard (exec.ts:84-86) and isWorkspaceSocketName (exec.ts:12,15); spawn
  env `{...process.env, TMUX:""}` (exec.ts:40-52) so ambient $TMUX cannot
  misroute.


  C. HOST + TEARDOWN

  6. agent-host.ts:347-355 ownership guard -> replace "server answers" with
  `has-session -t sessionName`; refuse if it exists.

  7. Tag the created session: @agentic-workspace_root(realpath)
  @agentic-workspace_task @agentic-workspace_role=native-workspace
  @agentic-workspace_session=<record.id>
  @agentic-workspace_owner_pid=process.pid (mirror session-process.ts:165-171).

  8. Async teardown agent-host.ts:246-328: keep pgid/process-tree kill FIRST
  (process-tree.ts:190-199; kill-session only SIGHUPs); replace
  killWorkspaceServer call (:311-317) with killOwnedSession.

  9. Sync exit teardown agent-host.ts:117-145: replace kill-server (:123) +
  list-sessions (:129) with `tmux -L default kill-session -t <sessionName>` +
  `has-session` proof. Store sessionName on OwnedAgentSession (:52-58).

  10. Pass per-session env via `new-session -e HOME/SHELL/PATH/TERM`
  (agent-host.ts:223-237, vt-channel.ts:786-796): the shared server base env
  gets poisoned by the first agent (ref doc:384).


  D. VT

  11. vt-channel.ts: gate uses `-L default` (via opts.socketName); update
  private-socket comments (vt-channel.ts:171); keep discardArmedSession's
  existing `kill-session` (:734).


  E. RETIRE PRIVATE-SOCKET MODULE

  12. Delete `killWorkspaceServer` (socket.ts:61-86) and
  `resolveWorkspaceSocketName` (socket.ts:26-34). Add
  src/agent-workspace/live/tmux/session-control.ts:
  `killOwnedSession(sessionName,run)` (validates name; `kill-session -t` only;
  proves via `has-session`; NEVER kill-server) and `hasOwnedSession`.

  13. session-process.ts unchanged (already correct on default).


  F. CONTROLLER

  14. Remove socket minting (workspace-controller.ts:19,1205); use
  `record.tmuxName` as session name.

  15. isAgentAlive(sessionName) on default, target `${sessionName}:0.0`
  (:96,119-127,1178,1279,1321).

  16. Launch (:1256-1289): `createTmuxExec({socketName:"default"})`;
  `createAgentHost({socketName:"default", sessionName, ...})`; workspaceContext
  token = session; probeTarget.target `${sessionName}:0.0`.

  17. Teardown paths all flow through host.stop: destroy/#stopAgents
  (:445-480,1428-1437), #quit (:1944), retained (:1188), wrapper error
  (:1295-1311,1331). Picker delete stays refused for running native (:1394-1413;
  sessions.ts:131-133).


  G. SESSIONS/STATE

  18. `prepareNativeSession`/`adoptPendingSession` drop the socketName param and
  derive `tmuxName=nativeSessionName(taskId,id)`
  (sessions.ts:181,214,246-260,288,377-433,404; workspace-state.ts:40-42).


  H. CONTEXT TOKEN

  19. workspace-context.ts: bump version to 2; field `socket` -> `session` (the
  hosting pane's session name, same grammar); `workspaceContextInto` writes
  session; `defaultSocketAlive` -> `has-session` on default
  (workspace-context.ts:20,27,47-55,70-73,97-111,121-140).


  I. STARTUP SWEEP

  20. Extend #settleStaleRequests/run() (workspace-controller.ts:1141-1161,430):
  reap leftover `agentic-workspace-*` sessions on default ONLY when owner pid is
  dead AND @agentic-workspace_owner_pid/@agentic-workspace_session match; settle
  pane group first (best-effort); inconclusive probe NEVER kills; never
  kill-server. Reuse the tri-state discipline from the deleted
  tmux-orphan-sweep.ts (`git show
  216776cd^:src/agent-workspace/tmux-orphan-sweep.ts`). `settleDeadSessions`
  (sessions.ts:695-726) demotes but does not kill; this is the missing half.


  J. TESTS

  21. Rewrite src/agent-workspace/live/tmux/socket.test.ts -> session-control
  tests; add an assertion that NO `kill-server` argv is ever produced.

  22. src/test/opentui-agent-host-cleanup.test.ts: run host on a
  `uniqueTmuxSocket()` (tmux-test-server.ts:20); assert teardown removes ONLY
  our named session while another session on the same server survives.

  23. Update fixtures socket->session in agent-sessions.test.ts
  (:685,741,765,788,834, context literals), workspace-context.test.ts
  (:22-23,74-76,110), opentui-workspace-controller.test.ts
  (:404,409,1064,1999,2007,2010). Keep tmux-test-server isolation; NO test may
  use "default".


  K. DOCS

  24. Update opentui-workspace-session-contract.md:21 ("private socket" ->
  session token) and stale private-socket comments (exec.ts:1,19;
  agent-host.ts:63-69; vt-channel.ts:171; workspace-context.ts:2-8,26).


  ORDER: A1 -> B -> E(session-control) -> C -> D -> G -> H -> F -> I -> J/K.
  Expect a compile-broken window across E..H (signatures + context schema flip
  together). `bun run build` after each step; end with `bun run build` + `find
  src -name '*.ts' -newer dist/agentic-workspace` (must be empty) per AGENTS.md.


  HARD RULES

  - Delete EVERY production `kill-server` (only agent-host.ts:123,313 and
  socket.ts:71 today). Shared-server teardown is `kill-session -t <validated
  name>` only.

  - Never a bare `list-panes -a` on default (docs/BACK-728-handoff.md:87-95).

  - Keep the process-tree pgid kill BEFORE kill-session; panes own their pgid
  and HUP-ignoring descendants otherwise leak.

  - Prove ownership (tags + dead owner) before reaping; inconclusive probe never
  kills.


  RISKS (ranked)

  1. Accidental default-server destruction -> delete all kill-server + a test
  asserting none.

  2. Killing a foreign/user session -> require @agentic-workspace_* tags + dead
  owner before any kill.

  3. `list-panes -a` leaking user panes -> avoid for teardown.

  4. VT forwarder path collision -> include sessionName.

  5. Server env poisoning -> `new-session -e`.

  6. Ambient $TMUX misroute -> `-L default` + `TMUX:""` on every spawn incl.
  sync path.

  7. Tests hitting the real default -> keep
  assertIsolatedSocket/uniqueTmuxSocket mandatory.


  OPEN QUESTIONS

  - Does `new-session -e` override a poisoned server base env on tmux 3.7c?
  Verify with a real test.

  - Wait-for channel scoping: assume server-global (unique names required);
  confirm experimentally.

  - `has-session` exit semantics (absent vs unreachable) for guard/sweep.

  - Is 8-hex session id collision-safe under heavy use? (CLI parity vs risk.)

  - Should the sweep also kill RUNNING dead-owner native sessions, or only
  STARTING?

  - Picker delete of a running native session: keep refused, or now force-stop
  via killOwnedSession?

  - Role tag "native-workspace" vs CLI "live-preview": confirm no code assumes
  only two roles.
---

