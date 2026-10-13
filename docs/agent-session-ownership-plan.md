# Agent Session Ownership — Implementation Plan

**Status:** implemented and verified live on 2026-10-07 (HEAD `46dc8840` plus uncommitted work); spec locked with the owner the same day. §7 records the measured evidence, §8 the residual limits. Every anchor was read in the working tree on 2026-10-07.

**Rule that governs this plan (owner's words):** a session started by `agenticworkspace agent-session start` must behave **exactly** as if it had been started from the workspace view. The workspace owns every session's lifetime.

**Scope:** the ownership/lifetime axis only. The activity axis belongs to `docs/aoe-status-tracking-plan.md`; the efficiency axis to `docs/aoe-lifecycle-implementation-plan.md`. Neither is re-planned here.

**Review command for every phase:** `agenticworkspace workspace` (equivalently `bun run cli workspace`).

---

## 1. The spec

| Context of the invocation | `agent-session start TASK-x` |
|---|---|
| A live workspace owns the calling context | The session record is created and **owned by that workspace** (`ownerPid` = the workspace pid, `nativeWorkspace: true`, `tmuxName` = the workspace's private socket). The CLI does **not** launch anything. The workspace adopts the record and launches it exactly as if Enter had been pressed — private socket, VT transport, native host — and it dies when the workspace exits. |
| No live workspace | The CLI launches the agent on the shared `default` server (native conversation, log, brief), then **stops it immediately** as the command exits. The record is left `stopped`, resumable. The next workspace shows it stopped and offers resume (`workspace-controller.ts:1015`: "Agent stopped; select this session to resume its exact conversation"). |

Consequences that follow, and are intended:

1. **A CLI invocation never leaves an unowned running agent.** Either the workspace owns it or it is dead by the time the command returns.
2. **The socket is not a launch target for the CLI.** It travels in the context only as a *liveness token* proving which workspace owns the invocation. All launching stays in the workspace process, which is what makes "exactly like the UI" true instead of approximated.
3. **Unowned-start is deliberate.** The owner chose "launch, then stop it immediately" over "record only", so the native conversation exists and `resume` continues it.

---

## 2. Why this is small: the machinery already exists

| Need | Already implemented | Anchor |
|---|---|---|
| Register a session record the workspace can own | `prepareNativeSession` writes a native record with `nativeWorkspace: true`, `ownerPid: process.pid`, `tmuxName: socketName`, `status: STARTING` | `src/agent-workspace/sessions.ts:139-166` |
| Launch/resume an existing record onto the workspace's socket | same method, resume branch | `sessions.ts:124-138`, `:167-186` |
| Refuse to double-drive a record | `if (!existing.nativeWorkspace \|\| this.ownerIsAlive(existing.ownerPid)) throw` | `sessions.ts:129-134` |
| Demote a native record whose owner died | `settleDeadSessions`: `if (session.nativeWorkspace) { if (!this.ownerIsAlive(session.ownerPid)) await this.finishNativeSession(...) }` | `sessions.ts:485-491` |
| Liveness check for a pid | `ownerIsAlive` | `sessions.ts:689` |
| Show a stopped session with a resume affordance | selection → `retained.error = "Agent stopped; select this session to resume its exact conversation."` | `workspace-controller.ts:1015` |
| Every task's session state, per refresh, no extra read | `#taskSessions` → `listAllSessions()` | `workspace-controller.ts:861-869` |
| Pane env injection point | `agentCommand = env <k=v…> sh -c <command>` built from `prepared.env` | `workspace-controller.ts:1079-1081` |

So the change is: **one context channel, one registration path, one adoption pass, one immediate-stop path.** No new durable field, no schema bump, no new server, no new transport.

---

## 3. The context channel

**Variable:** `BACKLOG_WORKSPACE_CONTEXT`. Value: compact JSON `{"v":1,"pid":<workspace pid>,"socket":"<ink-proto-<pid>-<n>>","rootDir":"<abs project root>"}`.

**Written** only at the workspace's own agent-pane launch site, into the `prepared.env` copy that becomes the pane command (`workspace-controller.ts:1079-1081`). Never written to the workspace's own `process.env`, never persisted into `presetSnapshot.env`, never inherited by anything the workspace did not launch as an agent pane.

**Read** by the CLI through one module, `src/agent-workspace/workspace-context.ts`:

- `readWorkspaceContext(): WorkspaceContext | undefined` — never throws; any failure returns `undefined` and the caller takes the unowned branch.
- Validation, all required: parseable JSON with `v === 1`; `pid` a positive integer and not this process's pid; the pid is alive; `rootDir` realpath-equals this project's root; and the socket answers `tmux -L <socket> list-sessions`. The last check is the real proof — it distinguishes a live workspace from a stale env inherited by a surviving child of a dead one, and it is the **only** use of the socket here.

### The request marker, and why a marker exists at all

The durable record alone is not enough to make adoption *timely*: the workspace's refresh is event-driven, so a record written by another process can sit unnoticed until the user presses a key. The channel therefore has a second, non-durable half:

- `workspaceRequestDir(rootDir)` = `<project root>/.backlog/agent-requests`; one JSON file per pending request (`{ taskId, sessionId, pid }`), written by `writeWorkspaceRequest` after the durable record exists, deleted by `deleteWorkspaceRequest` on adoption, on cancel, and by the boot sweep.
- The controller's request timer (started at boot, rescheduled at `min(activityInterval, 1 s)`) **readdirs only that directory** and reads only the requested task's state — never a global `readAll()` per tick. `readWorkspaceRequests` never creates the directory and never throws: an absent directory is the normal state.
- A marker whose `pid` is not this process, or is not alive, never launches a session.
- If writing the marker fails, the durable record is removed again, so a task is never left reserved by a request nobody can see.

---

## 4. Phases

### Phase S1 — Context channel
**Deliverable:** a pane launched by the workspace carries the context; the CLI can read and validate it.
**Slices:** (a) `workspace-context.ts` with the schema, `serializeWorkspaceContext`, `readWorkspaceContext`, `workspaceContextInto(env, {pid, socket, rootDir})`; (b) one injection at the controller's pane launch site; (c) unit tests for the validator's failure matrix (absent, malformed, wrong version, dead pid, self pid, root mismatch, dead socket).
**Review evidence:** launch a workspace in tmux, read a pane's env (`tmux -L <sock> show-environment` or run a command inside the pane), see the variable and only there.
**Stop condition:** the variable is present in agent panes, absent from a plain `backlog` invocation in the user's own shell.

### Phase S2 — CLI `agent-session start` branches
**Deliverable:** the owned branch registers and returns; the unowned branch launches and stops.
**Slices:** (a) `sessions.registerPendingSession(taskId, { preset }, context)` — writes `nativeWorkspace: true`, `ownerPid: context.pid`, `tmuxName: context.socket`, `status: STARTING`, `nativeSessionId: nativeSessionIdForLaunch(preset, id)`, `presetSnapshot`, `configScope`, `cwd`, `outputPath`/`bootstrapPath`; refuses when the task already has a STARTING/RUNNING session for that task. (b) `sessions.start()` routes on `readWorkspaceContext()`; owned → register only; unowned → existing launch path, then the existing stop path in-process before returning. (c) CLI verb output for both branches, plus `--json`. (d) `agent-session stop` on a pending (never-launched) record cancels the request instead of erroring.
**Review evidence:** from a bare terminal, `start` returns and `tmux -L default list-sessions` shows no leftover pane; from inside a pane, `start` returns and the task record is STARTING with a live `ownerPid`.
**Stop condition:** neither branch leaves a running agent that nothing owns.

### Phase S3 — Workspace adoption
**Deliverable:** a pending record owned by this workspace is launched exactly once, and pending records nobody owns settle stopped.
**Slices:** (a) `sessions.adoptPendingSession(taskId, socketName, sessionId)` — asserts `STARTING` + `nativeWorkspace` + `ownerPid === process.pid`, then runs the launch path in **adopt** mode: same body as `prepareNativeSession`'s post-record launch, but `resume: false` (the record was never launched, so `buildAgentResumeCommand` must not run). Extract the shared body rather than copying it. (b) Controller: on the existing refresh path, adopt records from the snapshot it already holds — `STARTING` + `nativeWorkspace` + `ownerPid === process.pid` + not currently hosted/launching — by calling the normal launch path with the record's id. An in-flight guard is mandatory: the workspace's own `STARTING` records are indistinguishable from pending ones, so the tracked/launching set decides. (c) The `sessions.ts:129-134` guard must allow the owner itself to adopt (`ownerPid === process.pid` is not "another terminal").
**Review evidence:** from inside a live pane, `agent-session start TASK-7` makes the session appear and run in the workspace with no second `start` call; exactly one agent host exists for it.
**Stop condition:** no path launches a record twice, and no path adopts a record owned by another pid.
**Amendment after the first live run:** the initial cut scanned the session snapshot only inside `#refresh`, which is event-driven, so an idle workspace never adopted — a `starting` record sat for 18 s with no second socket and no row marker. Adoption is now timer-driven over the request-marker directory (§3), with the refresh scan retained as belt-and-braces; measured adoption latency is one tick, ≤1 s.

### Phase S4 — Demotion is honest at startup
**Deliverable:** a pending record whose owner died is `stopped`, never resumed.
**Slices:** (a) reuse `settleDeadSessions`; (b) make the startup sweep cover tasks the user has not selected — a pending `STARTING` record blocks a new session for its task until reconciled (`startReserved` refuses "already has an active agent session"), so a stale pending record is user-visible; (c) verify a pending record is never sent through `resumeDeadActiveSession`.
**Review evidence:** kill a workspace with a pending record, reopen the workspace, select the task: it shows stopped and offers resume.
**Stop condition:** no STARTING record survives a workspace exit alive-claiming.

### Phase S5 — Tests
**Deliverable:** permanent suites for the validator, both `start` branches, adoption idempotency, and demotion.
**Note:** adoption and start-path tests need a fake `tmux` runner; the existing suite pattern for `session-process`/`agent-sessions` already stubs it — follow that convention, do not invent a new harness.

### Phase S6 — Live proof (owner-visible)
1. Bare terminal: `agent-session start TASK-1 --preset opencode` → command returns, `tmux -L default list-sessions` shows nothing left, record `stopped` with a native session id, log present.
2. Open `agenticworkspace workspace` → select TASK-1 → the session shows stopped with the resume affordance → resume → it runs on the workspace's private socket, killed when the workspace exits.
3. Inside a live pane: run `agent-session start TASK-2 --preset opencode` from the agent's own shell → the workspace launches it for TASK-2 with no further interaction; quitting the workspace kills it.
4. Kill the workspace while a pending record exists → reopen → the task shows stopped, resumable.

### Phase S7 — Docs
`docs/opentui-workspace-session-contract.md` (ownership/presentation section), `docs/opentui-workspace-spec.md` (§9), `src/guidelines/agent-guidelines.md` if the CLI verbs are described there.

---

## 5. Invariants this plan must not break

1. **Native records keep `ownerPid`.** Demotion depends on it (`sessions.ts:487`). Only shared-server CLI records clear it (`sessions.ts:307`).
2. **No new durable field, no `SessionState.version` bump.** Pending-ness is derived: `STARTING` + `nativeWorkspace` + live owner pid + not hosted in this process.
3. **The sidecar stays process-scoped and deterministic** (`sessionActivityDir`), and a hard-killed session must read as absent, never as a live status.
4. **One server per workspace; the CLI never kills a server.** `killWorkspaceServer` keeps refusing foreign socket names (`socket.ts:44-49`).
5. **Adoption is not a second launch.** Exactly one host per record, guarded by the tracked/launching set.
6. **A record owned by another live pid is never adopted or resumed** (`sessions.ts:129-134` semantics stay, relaxed only for self).

## 6. Deliberately not doing

1. **`agent-session attach` on an owned session.** `attach` uses the shared `default` server (`session-process.ts:128-133`); an owned session lives on the workspace's private socket, so the CLI cannot attach to it. Gap, documented, not fixed here.
2. **VT transport for adopted records.** VT must be armed before the command starts; adoption launches the pane itself, so adopted sessions *do* get VT — but only because the workspace performs the launch. External (`agent-session` on `default`) panes keep replay + `send-keys`.
3. **A global session scan per tick as the adoption trigger.** Dropped after measurement: the first cut relied on `#refresh`, which never runs on an idle workspace. The shipped trigger is a bounded readdir of the request-marker directory (§3) — one directory listing per tick instead of a full `readAll()` — so lifecycle Phase L1 stays free to narrow the refresh read to the active tab, and an IPC listener is unnecessary.
4. **Unifying the two CLI transport paths, or giving the CLI its own server.** Out of scope by owner decision.

---

## 7. Verification (measured 2026-10-07)

Every item below was observed on a real fixture with the real CLI and a real opencode agent, in tmux, not in a test harness.

| Claim | Evidence |
|---|---|
| Unowned branch launches then stops | `agent-session start TASK-1 --preset opencode` from a bare terminal printed `Started and stopped session <id> (preset: opencode); the next workspace offers to resume it.`; record `stopped` with `endedAt` and a retained `nativeSessionId`; the shared server held no `backlog-*` session afterwards; no `opencode --session` process survived; reopening the workspace showed the session stopped. |
| Owned branch registers and launches nothing | With the context inherited, the CLI printed `Registered session <id> for the owning workspace to launch (preset: opencode)` and the record was `nativeWorkspace: true`, `status: starting`, `ownerPid: <workspace pid>`, `tmuxName: ink-proto-<pid>-1`. |
| The context really reaches the pane | The launched pane's `pane_start_command` contains exactly `{"v":1,"pid":<wspid>,"socket":"ink-proto-<pid>-<n>","rootDir":"<realpath of the project>"}` — the same bytes §3 validates. The in-pane invocation was replayed with those exact bytes; driving opencode's own tool call was **not** exercised. |
| Adoption happens without user input | Within one tick the record became `running` with `tmuxName: ink-proto-<pid>-2` and a real `nativeSessionId`; both task rows showed `●`. |
| The adopted session dies with the workspace | Quitting the workspace left 0 sockets for it, 0 workspace processes, and no surviving agent — and the socket file was unlinked, which the pre-fix build left behind. |
| Demotion is honest after an abrupt death | Registering TASK-2 with a valid context and killing the workspace 0.4 s later left the record `starting` with a dead `ownerPid`. The next workspace settled it `stopped` with `endedAt` although the task was not selected, removed the marker, and did not block a later `agent-session start` for the same task. |

Suites run one file per process: `workspace-context` 19, `live/tmux/socket` 4, `agent-sessions` 36, `opentui-workspace-controller` 31, `session-launch` 14, `status-hooks` 12, `opentui-agent-host-cleanup` 5, `session-store` 1 — all passing. `bunx tsc --noEmit` clean; `bunx @biomejs/biome check src` clean apart from the pre-existing broken-symlink warning. Full suite: 257/257 files, 2332 passed, 151.4 s at 5 lanes. Two files are red and are **not** counted by the runner's summary line: `branch-task-loader-resilience` and `frontmatter-diagnostic-propagation`, both from the pre-existing `hydrateTasks` error-swallowing bug in `src/core/task-loader.ts` (`if (w.stateEntry) continue;`), which predates this work and is untouched by it.

Docs updated with this change: this plan, `docs/opentui-workspace-session-contract.md` (new `Command-line sessions and ownership` section, and the external-session bullet scoped to the unowned branch), `docs/aoe-status-tracking-plan.md` (Phase 1 evidence now states which process installs the hook artefacts in each branch), and `.gitignore` (the transient request-marker directory and `*.activity/` sidecars, which are recreated per session and would otherwise litter a tracked `.backlog/`). `docs/opentui-workspace-spec.md` needed no change: §9.1 describes the derived activity overlay, while ownership is a contract-level property. `docs/app-directory-map.md` still needs its regeneration for `.backlog/agent-requests/`.

## 8. Residual limits

1. **A forged context can wedge one task.** An invocation that presents a live non-workspace pid, this project's root, and any live workspace-shaped socket registers a `starting` record nobody adopts and no sweep demotes (the owner pid is alive). Impact is limited to that task's session state, which `agent-session reset <task>` clears; it grants nothing, because the trust model is already "a local process that can write inside `.backlog`".
2. **Adoption is workspace-view only.** The request timer only launches while the workspace view is mounted; a request registered from board view waits for the view to return. The marker survives, so nothing is lost.
3. **`agent-session attach` still cannot reach an owned session** (§6.1) — it targets the shared server, the session lives on the workspace's private socket.
4. **`.backlog/agent-requests/` is new user-visible state.** Created only when a request exists, removed once empty; it must be reflected in `docs/app-directory-map.md` at the next regeneration.
