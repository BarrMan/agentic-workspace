# OpenTUI Workspace Durable Agent-Session Contract

**Status:** The current native contract below supersedes the historical Phase 0 contract retained later in this document. Native workspace agents now share durable session records with CLI sessions; exact tagged tmux-instance ownership controls teardown.

Shared-runtime implementation/acceptance checkpoint: [canonical handoff](../../../docs/Backlog.md/shared-agent-runtime-handoff.md). Stable simplification safeguards and unresolved per-session policies: [runtime findings](../../../docs/Backlog.md/shared-agent-runtime-simplification.md). The contract records intended behavior; the checkpoint distinguishes source proof from runnable acceptance.

## Current native contract

### Presentation and process ownership

- `EmbeddedTerminalRenderable` owns parsing, rendering, input encoding, cursor, and scrolling. The controller retains one terminal per selected session identity across task/view changes and fullscreen transitions.
- Native workspace launches create durable session records marked `nativeWorkspace`, with the provider's native conversation ID and a raw output log.
- Native workspace launches create tagged panes and durable output capture that persists independently of any frontend. Task deletion forgets the session association only; it does not terminate the process. Explicit stop and completion are separate lifecycle operations, and no owning frontend has cleanup authority. A retained dead pane can be cleaned for resume; a conclusively absent instance is already stopped. tmux teardown is not an all-descendants certificate: a provider descendant may survive pane/session teardown. Persistence/reset and forget-only delete do not stop instances. See [`agent-host.ts`](../src/agent-workspace/live/agent-host.ts) and [`session-process.ts`](../src/agent-workspace/session-process.ts).
- An already-running CLI-owned session remains externally owned (that is, a session started without a live workspace context, or one started before the ownership channel existed). Selecting its task attaches the real native pane automatically: no `Enter`, no start, no resume, no usage record, and no ownership change. The preview replays and follows its existing raw output log, forwards ordered input, and resizes its pane; returning to the task keeps the same preview. Detachment stops only preview watchers and input resources; it does not kill the pane, replace its output capture, or mark it stopped.
- The passive probe never kills a pane. An exact owned live pane is live; an exact owned dead pane is dead and an exact missing target is missing. Foreign ownership and inconclusive tmux transport/probe failures remain errors. A stopped task never auto-resumes.
- The shared agent backend uses the default tmux server or the existing configured socket override, independent of an ambient tmux client. `agenticworkspace agent-session attach` switches the client only when already attached to that same backend; from any other context it attaches a new client instead of switching. Test-owned socket overrides and ownership registries remain required for real test resources.
- Pane lookup uses the tagged project root, task ID, and role. Provider-controlled pane titles are display labels, not durable identity.
- A stop failure remains visible and must not be recorded as a successful stop. Cleanup validates all known launch resources before deleting any, cleans them before killing the exact owned pane, and leaves pane metadata available for retry if cleanup fails. If cleanup succeeds but tmux kill fails, the agent may remain live with its launch resources removed; report this as incomplete teardown, not as an unchanged healthy session. A confirmed missing pane is success only for a typed tmux command failure with an exact supported diagnostic; transport errors and arbitrary messages are not absence. Cleanup validates exact root/task/session/tmux/pane/role tags and known launch-resource inventory; it never signals OS process groups or deletes unvalidated provider/user paths. A tmux teardown is intentionally not proof that every descendant exited. A tmux session whose name is not a project session name (`backlog-<task-slug>-<8 hex>`) is refused before any tmux command and remains untouched.

### Command-line sessions and ownership

- Native process/session persistence is frontend-independent; CLI sessions do not have command-scoped lifetime. Task deletion forgets its session association only; explicit stop and completion remain separate lifecycle operations.
- `agenticworkspace agent-session start` with a validated pane context registers a `nativeWorkspace` session record and request marker under `<root>/.backlog/agent-requests/`, and launches nothing. Timer polling delegates admission to `AgentSessionService`; requester PID is informational, not authority. A marker plus `starting` record is necessary but runtime identity is verified under task/session claims. A missing exact runtime launches fresh once; a live exact runtime attaches without redispatch; dead or uncertain runtimes fail closed. The marker remains until service publication succeeds. The adopter need not inherit the requester's pane context.
- Without that context, `agent-session start` launches on the shared backend and records the session independently of the command process lifetime. An explicit stop or completion operation handles termination.
- Observation never kills: verified dead/missing nonqueued runtimes settle `stopped`; a valid queued request with a missing runtime remains `starting` until marker polling admits it. Unknown/uncertain observation does not mutate. `ownerPid` and marker PID are informational compatibility fields, not authority.
- Stopping a never-launched pending record cancels the request and removes its marker.

### Selection and conversation identity

- `s` lists the selected task's sessions newest first and marks the active session.
- Selecting a retained live session displays that terminal. Selecting an externally owned live session attaches its preview. Selecting a parked or stopped session resumes its exact stored native conversation.
- Resume resolves the stored preset name through current task, project, then user configuration. It keeps the exact native conversation ID and saved path context, never a guessed ID or a “latest session” flag. An unavailable exact-resume mechanism fails explicitly.
- Selection failure preserves the previously active conversation. Late output belongs to its retained session terminal, not whichever task happens to be selected.
- Session records and output remain owned by `AgentSessionService` and `SessionStore`; the picker does not create a second history store.

### Scoped configuration and explicit handoff

- Configuration resolution remains task, project, root, then built-ins. Project settings use the existing configuration service, not a second UI store. User-level settings are not exposed in this pass.
- Presets contain a command, optional `resumeFlag`, and environment variables. Existing adapter, preparation, and worktree fields remain intact. A blank resume flag uses the adapter default; an explicit flag precedes the quoted exact native conversation ID. A flag alone does not provide a missing skill loader or native identity mechanism.
- `,` opens fullscreen project-only Settings with adjacent rounded category/content panes and cyan focus. Fields remain read-only until selected and edited with `Enter`. `Right` enters fields; `Left` returns to categories without changing values. `Tab`/`Shift+Tab`, `Up`/`Down`, and mouse clicks select fields. During editing, arrows change staged preset options and native inputs accept text; `Enter` commits the field and `Escape` cancels its edit. Environment supports multiline paste and terminal-supported `Shift+Enter` for newlines. At the selector, `Space` marks the chosen preset as default and `n` copies its adapter into a new named preset. `Ctrl+S` persists committed draft values only; `Escape` outside editing discards the whole draft. Existing metadata survives edits. The horizontal scrollbar stays hidden; the vertical scrollbar appears only on overflow. Environment values remain ordinary scoped configuration, not a separate secret store.
- New tasks inherit project settings unless creation selects preset. Explicit selection saves complete task configuration in same atomic creation operation. `p` selects task preset or clears override to restore inheritance.
- `h` selects replacement preset before reserving linked session. Reservation records `predecessorId` and rejects changed active predecessor. Activation occurs only after successful launch; failure leaves previous active session usable. After activation, workspace-owned predecessor stops but remains available for exact resume. Externally owned predecessor remains running.
- Configuration edits affect existing sessions when they next launch, resume, or answer a question. Session records save only the preset name, not commands, environment, configuration scope, or creation-profile snapshots.
- A session's fixed mode is its owning nested history. Execution uses that mode's current profile. A mode with sessions cannot be deleted or merged into another mode. Existing moving mode-deletion journals require an explicit recovery decision and remain untouched.


### Idle startup and skill isolation

New task-manager launches use the saved working directory: the project root or the task worktree when configured and present. They do not prepare task worktrees or automatically move the task to In Progress. The only initial instruction is:

```text
Active task: <taskId>.
Wait for user instructions.
```

`agenticworkspace skill` prints the Backlog Task Management skill body. The agent-specific skill file lives in an owned temporary directory loaded only for that process. No launch writes skills into project or global discovery paths. Cleanup removes only the owned temporary directory after termination or failed startup.

The launched environment strips `BACKLOG_CWD`, `BACKLOG_TASK_ID`, `BACKLOG_SESSION_ID`, `BACKLOG_PROJECT_ROOT`, `TASK_ID`, and `SESSION_ID`. `BACKLOG_PROJECT_DIR`, `BACKLOG_WORKTREE_DIR`, and `BACKLOG_TASK_DIR` come from the saved project root, actual session cwd, and canonical task-artifact container respectively; the task directory is not the `.backlog` session-log directory. These reserved paths cannot be overridden by preset values. Other inherited variables are overlaid by current preset entries in configured order, expanded by `/bin/sh` in the worktree (unset variables expand to empty); failed expansions warn by variable name and retain the inherited value. Shell command substitutions execute as code, so preset values must be trusted. Resume preserves saved canonical roots; task-directory moves are not supported. See [`harness-environment.ts`](../src/agent-workspace/harness-environment.ts) and [`sessions.ts`](../src/agent-workspace/sessions.ts).

The public `opencode` preset resolves the configured CLI version at each launch, resume, ask, or current-model export. Concrete v1/v2 adapters are execution-only; neither a harness identity nor an adapter version is stored in a session. OpenCode 1.19 launches normally with `--prompt`; its process-scoped plugin records the created session ID and recognizes a switch to an existing top-level conversation after the first user message there. OpenCode 2.0.26 launches normally with `--standalone --session <exact native ID> --prompt`; its client-local CLI plugin records the active session-route receipt. Version 1 loads the process-scoped skill through `skills.paths`; version 2 uses the `skills` array. Both normal interactive prompts invoke the initial model turn. Resume preserves the exact native ID; v2 verifies that it exists before resuming. Receipt hydration uses current preset configuration without running the CLI and accepts only private, regular receipt files at the owned session path with valid native-ID syntax. Claude uses session-only `--plugin-dir`. Custom commands must bind `{skill}` to their native skill loader and include `{prompt}` or `{instructions}`. Providers without a verified process-scoped loader fail explicitly rather than installing globally or relocating the user's authentication/configuration profile.

Provider support and verification:

| Provider | Session-local skill loading |
|---|---|
| OpenCode 1.19 | Selected automatically by the public `opencode` preset; inline `skills.paths`, interactive `--prompt` and native-plugin session-ID receipt. |
| OpenCode 2.0.26 | Selected automatically by the public `opencode` preset; inline `skills` array, interactive `--standalone --session` plus `--prompt` and client-local CLI route receipt. |
| Claude Code 2.1.289 | Supported through `--plugin-dir`; the native plugin list marks the temporary plugin loaded for that session. |
| Pi | Supports explicit `--skill` loading and exact `--session-id` / `--session` identity. Adapter verified against upstream CLI arguments; no live Pi session was exercised in this pass. |
| OMP | Blocked: its documented `--skills` option filters discovered skills; it does not load a process-scoped skill path. |
| Codex CLI 0.148.0 | Blocked: documented skill discovery uses repository, user, admin, or system locations, not a process-scoped directory. |
| Gemini CLI 0.62.0 | Blocked: skill link/install persists user or workspace scope. Installed resume help offers latest/index selection, not exact UUID resume. |
| Antigravity | Blocked: no installed executable or verified session-scoped loader/exact-resume interface on this workstation. |

Provider references: [OpenCode v1 skills](https://opencode.ai/docs/skills/), [v2 configuration](https://opencode.ai/v2/docs/config), [v2 CLI plugins](https://opencode.ai/v2/docs/build/plugins/cli), [Claude session plugins](https://code.claude.com/docs/en/plugins/create), [Pi CLI](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent), [Codex skills](https://developers.openai.com/codex/skills), and [Gemini skills](https://geminicli.com/docs/cli/skills/).

### Process-scoped status hooks

Status hooks are installed unconditionally at the shared launch chokepoint, so `agenticworkspace workspace`,
`agenticworkspace agent-session start`, and `agent-session … resume` produce identical launch artefacts: a
session created from the CLI is indistinguishable from one created by the workspace UI. The hooks
are process-scoped and owned exactly like the skill file:
each launch creates its sidecar and hook artifacts inside the same `mkdtemp` directory, removed with
it. Claude writes a `hooks/hooks.json` inside the plugin already passed with `--plugin-dir`,
legacy and 1.19 OpenCode use a plugin found through `OPENCODE_CONFIG_DIR`, 2.0.26 OpenCode uses a
client-local CLI plugin, and Pi uses an extension passed with `--extension`.
Every shell hook command is crash-safe, ends with the `0 # backlog-hooks` ownership trailer, and
always exits zero (a throwing hook blocks the agent's tool calls). Each hook writes only
the session's own `<task dir>/<sessionId>.activity/status` sidecar and nothing else under the
project; nothing is written to `~/.claude`, `~/.config/opencode`, `~/.pi`, or a global location.

Codex is the single exception, and only through an explicit verb: `agenticworkspace agent-session hooks
install` performs a marked, merge-preserving write of `$CODEX_HOME/hooks.json` (else
`~/.codex/hooks.json`) that keeps every user entry byte-identical and whose stored command reads the
sidecar from `BACKLOG_AGENT_STATUS_DIR`, so re-install is idempotent. `hooks uninstall` removes only
trailer-marked entries and restores the original file. `config.toml` is read only, to honor
`[features] hooks`; nothing removes user configuration at session end.

The sidecar path is deterministic — `<task dir>/<sessionId>.activity/status`, beside the session's
log and bootstrap files — so a session started by the CLI is read by the workspace exactly like one
it launched itself, without persisting any activity state. Writers remove it on stop, and readers
liveness-gate every hook status: a sidecar is evidence only while its pane is alive, with a generous
age ceiling as a secondary guard, so a file orphaned by a hard-killed session reads as absent rather
than as a live status. Only a pane Backlog did not launch at all falls back to lower-fidelity
pane/title evidence. The activity overlay is derived on attach and updated from hook transitions read
with `fs.watch` on the per-session `<task dir>/<sessionId>.activity` directory (coalesced ~10 ms),
with an initial reconcile and a slow 30 s backstop; the watcher pauses while a modal owns focus and is
stopped on teardown; nothing about it survives a restart, so a stale green can never be replayed.

| Provider | Hook surface | Install (owned temp dir) | Fallback detection |
|---|---|---|---|
| Claude Code | `hooks/hooks.json` in the session plugin | Supported | pane/title chrome |
| OpenCode 1.19 | plugin via `OPENCODE_CONFIG_DIR` | Supported | pane/title chrome |
| OpenCode 2.0.26 | client-local CLI plugin | Supported | pane/title chrome |
| Pi | `--extension` module | Supported | pane/title chrome |
| OMP | `--hook` module | Not installed while the launch gate holds | pane/title chrome |
| Antigravity | workspace/global/plugin hooks | Not installed (no isolated loader) | pane/title chrome |
| Codex | `hooks.json` marked merge in `$CODEX_HOME` | Implemented; reachable via `hooks install` (the launch arm is dormant behind the Codex skill-loader refusal) | pane/title chrome |

### View state and keyboard ownership

Project-local view state persists selection, filters, status tab, visibility preferences, and shortcut overrides. Navigation history is separate, bounded to 100 states, and lasts only for the current workspace process.

`Ctrl+C` and `Ctrl+Q` leave focused agent input/fullscreen without sending an interrupt. Navigation `Ctrl+C` exits; `q` never exits. Modal input cannot invoke background workspace actions.

## Historical Phase 0 contract

The following sections preserve the original migration requirements and source anchors. Their rules about separate temporary agents, teardown, status changes, worktrees, and read-only stopped-session history do not describe the current native behavior above.

## Scope

This contract covers durable task-scoped agent sessions. It covers `AgentSessionService`, `SessionProcess`, session persistence, workspace view persistence, and current workspace callers.

It does not preserve tmux as presentation. It preserves tmux-backed agent processes until a later approved replacement.

- Approved product rules: [OpenTUI Workspace Specification](opentui-workspace-spec.md).
- Phase gates and implementation ownership: [OpenTUI Workspace Implementation Plan](opentui-workspace-implementation-plan.md).

## Ownership boundary

```text
OpenTUI renderer
  -> selection, rendering, input routing, subscriptions, and display teardown
OpenTUI workspace controller
  -> intent dispatch, Core/workspace-state calls, watcher coordination, stale-result rejection
Existing domain services
  -> task persistence, configuration persistence, session persistence, tmux process lifecycle
```

The renderer and controller MAY attach to a selected running session and detach from its presentation. They MUST NOT create, kill, stop, reset, reconcile, resume, or hand off a durable session as a side effect of mounting, selection, unmounting, app exit, or terminal cleanup.

Only explicit user lifecycle intents may call `WorkspaceStateService` or `AgentSessionService` lifecycle methods. `SessionProcess` remains the sole tmux-process adapter. `SessionStore` remains the durable state owner.

`WorkspaceStateService` is intentionally a thin facade over `Core` and `AgentSessionService`; reads do not reconcile tmux state ([`workspace-state.ts:27-55`](../src/agent-workspace/workspace-state.ts#L27-L55)). The OpenTUI controller must use it rather than reproduce session lookups or persistence.

## Durable records and identities

### Session state

Each task has one validated, versioned `TaskSessions` record. It contains an optional active-session ID, optional task worktree path, ordered historical sessions, and optional handoff ([`types.ts:45-96`](../src/agent-workspace/types.ts#L45-L96)). Session status is one of `starting`, `running`, `stopped`, `handed-off`, or `failed` ([`types.ts:7-14`](../src/agent-workspace/types.ts#L7-L14)).

The state root is `<executionDir>/.backlog`, with a hashed `~/.backlog/<hash>` fallback when that path is not writable. Each task record is `<state-root>/<task-slug>/state.json` ([`session-store.ts:57-75`](../src/agent-workspace/session-store.ts#L57-L75), [`session-store.ts:222-225`](../src/agent-workspace/session-store.ts#L222-L225)). Mutations hold a file lock and use atomic replace writes ([`session-store.ts:196-219`](../src/agent-workspace/session-store.ts#L196-L219), [`session-store.ts:77-83`](../src/agent-workspace/session-store.ts#L77-L83)).

Invalid durable state fails closed with an explicit reset command. A UI must surface this failure; it must not substitute an empty state ([`session-store.ts:179-193`](../src/agent-workspace/session-store.ts#L179-L193)). `reset` only removes persisted state. It does not stop a tmux process ([`sessions.ts:56-59`](../src/agent-workspace/sessions.ts#L56-L59), [`session-store.ts:227-230`](../src/agent-workspace/session-store.ts#L227-L230)).

### Workspace view state

Selection, filters, and details visibility use the separate `view-state.json` envelope. It has a monotonic revision and writer origin, atomic writes, a directory watcher, and an explicit recheck fallback ([`view-state-store.ts:16-40`](../src/agent-workspace/view-state-store.ts#L16-L40), [`view-state-store.ts:99-123`](../src/agent-workspace/view-state-store.ts#L99-L123), [`view-state-store.ts:187-213`](../src/agent-workspace/view-state-store.ts#L187-L213)). Closing the view store stops its watcher and clears its listeners only ([`view-state-store.ts:125-139`](../src/agent-workspace/view-state-store.ts#L125-L139)).

## Lifecycle contract

| Operation | Observed behavior | OpenTUI contract |
| --- | --- | --- |
| Start | Resolves configuration, reserves one `starting` record under lock, then performs expensive work outside lock. A task rejects another `starting` or `running` session ([`sessions.ts:61-125`](../src/agent-workspace/sessions.ts#L61-L125)). | Start only from an explicit action. Render `starting` until service returns. Never start because output is unavailable or a pane is missing; the only non-explicit start is a parked session auto-resuming for the selected task. |
| Successful start | Creates a tagged tmux placeholder, configures output capture, launches agent, marks session `running`, sets it active, and records use ([`sessions.ts:127-166`](../src/agent-workspace/sessions.ts#L127-L166); [`session-process.ts:122-183`](../src/agent-workspace/session-process.ts#L122-L183)). The owning workspace's `WorkspaceStateService.activateSession` then moves the task to the configured In Progress status — a no-op for tasks already there and for terminal `Done` tasks; `AgentSessionService` itself never touches task status. It then enforces the running-session cap by stopping least-used eligible sessions from other tasks ([`sessions.ts:452-488`](../src/agent-workspace/sessions.ts#L452-L488)). | Display returned persisted state. When the started task is the selected one, the workspace follows the status tab to In Progress while keeping that task selected; an adopted request for another task never steals the view. Do not infer running from a visual attach or a nonempty output file. |
| Start failure | Kills created live pane, marks reserved record `failed`, records `endedAt` and error, and clears active pointer if needed ([`sessions.ts:167-180`](../src/agent-workspace/sessions.ts#L167-L180)). | Preserve selected task and unsaved UI data. Show failure state and stored error. A later explicit start may retry. |
| Open / attach | `attach` requires a running session, updates usage, then uses `switch-client` inside tmux or `attach-session` outside tmux ([`sessions.ts:204-208`](../src/agent-workspace/sessions.ts#L204-L208); [`session-process.ts:225-231`](../src/agent-workspace/session-process.ts#L225-L231)). | Opening live agent is a presentation request for current task/session. It must not mutate status except normal usage bookkeeping. |
| Reconnect / recovery | `list` is a pure persisted read. Explicit reconciliation probes live panes, settles dead sessions and stalled handoffs, then continues ready handoffs ([`sessions.ts:300-315`](../src/agent-workspace/sessions.ts#L300-L315)). An active dead or missing pane resumes from its saved preset snapshot and native session identity where available ([`sessions.ts:428-449`](../src/agent-workspace/sessions.ts#L428-L449)). | Reconcile only through an explicit watcher/controller policy. Never reconcile from every render or getter. Do not silently start an absent session; a parked session auto-resumes through the controller boot/selection policy. |
| Stop | Resolves active or requested running session, kills its live tmux pane, persists `stopped` and `endedAt`, and clears active pointer ([`sessions.ts:183-192`](../src/agent-workspace/sessions.ts#L183-L192)). | Stop requires explicit user intent and confirmation behavior defined by product flow. UI close, route change, task switch, and preview exit MUST NOT call stop. |
| Stop failure | Tmux kill runs before durable mutation; a kill failure rejects and leaves the record unchanged ([`sessions.ts:183-192`](../src/agent-workspace/sessions.ts#L183-L192); [`session-process.ts:213-223`](../src/agent-workspace/session-process.ts#L213-L223)). | Surface failure. Do not present a failed stop as `stopped`, clear agent identity, or remove saved history. |
| Per-session delete (separate from task deletion) | `agenticworkspace agent-session delete <taskId> --session <sessionId> [--force]` removes a session association. Currently flagged live sessions refuse even force; direct live sessions can stop under force. Unifying that live-force policy is OPEN; strict/retryable sidecar cleanup is PROPOSED, not accepted. See the [policy boundary](../../../docs/Backlog.md/shared-agent-runtime-simplification.md#deletion-and-record-retirement). | Preserve explicit inline confirmation/cancel and current refusals. BACK-27's forget-only task deletion does not authorize changing this command's live-force or cleanup policy. |
| History / output | Historical records remain ordered in durable state. Output reads selected session log, including stopped sessions, and missing logs fail explicitly ([`sessions.ts:194-201`](../src/agent-workspace/sessions.ts#L194-L201)). Existing UI guards history output by selected task, selected session, mode, and closed state ([`session-view.ts:108-135`](../src/ui/workspace/session-view.ts#L108-L135)). | History is read-only rendering of persisted session records and logs. A stopped or handed-off session remains historical, not attachable. |
| Handoff | Request requires active session and records one `ready` request; normal runtime dispatches a detached continuation worker ([`sessions.ts:210-241`](../src/agent-workspace/sessions.ts#L210-L241); [`session-worker-client.ts:8-35`](../src/agent-workspace/session-worker-client.ts#L8-L35)). Continuation demotes predecessor, starts one replacement with predecessor snapshot and cwd, then stops predecessor and marks handoff complete ([`sessions.ts:244-279`](../src/agent-workspace/sessions.ts#L244-L279)). | UI may request and display handoff state. It must not write handoff files, inject terminal input, or recreate continuation logic. Retain predecessor output and task context. |
| Configuration | Resolution is card, then project, then root or built-in configuration ([`config.ts:140-170`](../src/agent-workspace/config.ts#L140-L170)). Each session stores exact preset snapshot and configuration scope ([`types.ts:45-67`](../src/agent-workspace/types.ts#L45-L67)). | Configuration UI uses existing configuration APIs. Changes affect future starts. Resumption and handoff use stored snapshot when present; they must not drift to edited configuration. |
| Worktree | A worktree preset chooses one task-state path, creates or reuses branch `backlog/session/<task-slug>`, and stores session cwd ([`sessions.ts:97-102`](../src/agent-workspace/sessions.ts#L97-L102); [`session-worktree.ts:4-18`](../src/agent-workspace/session-worktree.ts#L4-L18)). Resume ensures same worktree again ([`sessions.ts:433-440`](../src/agent-workspace/sessions.ts#L433-L440)). | UI selects and displays configuration only. It must not create, delete, move, or clean up worktrees. No automatic worktree removal exists in this contract. |

## Handoff and recovery failures

A failed replacement restores predecessor presentation when no replacement started. It records handoff `failed`, retains an active predecessor when available, and permits continuation retry ([`sessions.ts:280-289`](../src/agent-workspace/sessions.ts#L280-L289)). Reconciliation returns a handoff stuck in `replacing` by a dead owner to `ready` ([`sessions.ts:391-405`](../src/agent-workspace/sessions.ts#L391-L405)).

A dead non-active session becomes `stopped`. An abandoned `starting` session becomes `failed`; both release an active pointer when applicable ([`sessions.ts:371-388`](../src/agent-workspace/sessions.ts#L371-L388)). A dead active session is resumed first; failure to resume records error before settlement ([`sessions.ts:323-349`](../src/agent-workspace/sessions.ts#L323-L349)).

`resumeLivePreviewPane` may only revive a persisted active session with an existing dead pane. It throws when no active session exists and must never guess or create a new agent ([`sessions.ts:408-426`](../src/agent-workspace/sessions.ts#L408-L426)).

## Presentation teardown: retain and change

Current tmux presentation distinguishes incidental detach from deliberate legacy quit. Incidental detach only detaches client and leaves pane processes alive ([`tmux-workspace.ts:956-964`](../src/agent-workspace/tmux-workspace.ts#L956-L964); [`tmux/client.ts:17-34`](../src/agent-workspace/tmux/client.ts#L17-L34)). Legacy deliberate quit kills workspace-pane process trees before detach ([`tmux-workspace.ts:966-982`](../src/agent-workspace/tmux-workspace.ts#L966-L982)).

OpenTUI changes deliberate workspace close:

1. Closing OpenTUI detaches and destroys renderer, controller subscriptions, timers, and view-state watcher.
2. Closing OpenTUI MUST NOT call `AgentSessionService.stop`, `reset`, `reconcileTaskSessions`, `resumeLivePreviewPane`, or any `SessionProcess.kill*` method.
3. Closing OpenTUI MUST preserve every durable agent session and its tmux process for a later workspace reopen.
4. Explicit stop and explicit handoff remain durable service actions. They are not teardown work.

Existing OpenTUI controller teardown already destroys its mount, renderer, and optionally owned view-state store without calling session lifecycle code ([`workspace-controller.ts:112-124`](../src/ui/opentui/workspace-controller.ts#L112-L124)). Future phases must preserve this separation.

## Stale-output rejection contract

Task selection is a security and correctness boundary for presentation. Current Blessed UI increments a selection generation, clears prior session state before asynchronous lookup, then accepts results only when generation and task still match ([`pane.ts:441-451`](../src/ui/workspace/pane.ts#L441-L451), [`pane.ts:460-515`](../src/ui/workspace/pane.ts#L460-L515)).

Every OpenTUI agent presentation request, result, and subscription event MUST carry this identity:

```ts
type AgentPresentationIdentity = {
	renderEpoch: number;
	taskId: string;
	sessionId?: string;
};

type AgentOutputEvent = AgentPresentationIdentity & {
	outputRevision: number;
};
```

Rules:

1. Increment `renderEpoch` synchronously before selecting a different task, changing displayed session, entering or leaving history/output mode, or tearing down controller.
2. Clear right-pane task details, session identity, and live output synchronously before any async read or subscription replacement.
3. Commit an async result only when `renderEpoch`, `taskId`, and `sessionId` exactly match current presentation identity.
4. For one identity, commit only an `outputRevision` newer than displayed revision. This prevents an older callback from overwriting newer output from same session.
5. A session lifecycle update that changes active session ID creates a new identity. A sessionless state still carries task ID and current epoch.
6. Drop every mismatched event silently. It may update no text, status, focus, footer, or error state for current selection.

This extends existing task/session checks in history view and selection code. It fulfills specification rule that old output clears before new output commits and that late results for an unselected task are ignored ([`opentui-workspace-spec.md:90-103`](opentui-workspace-spec.md#L90-L103)).

## Retained caller behavior

- CLI session commands remain direct service callers for list, start, stop, attach, output, handoff, continuation, reconciliation, reset, and deletion ([`agent-workspace.ts:159-233`](../src/commands/agent-workspace.ts#L159-L233)).
- Workspace task selection loads persisted session state through `WorkspaceStateService`; it does not own `SessionProcess` ([`workspace-state.ts:31-85`](../src/agent-workspace/workspace-state.ts#L31-L85)).
- Existing config editor loads and saves scoped configuration through `getEditableAgentConfiguration` and `updateAgentConfiguration`, including command, environment, prepare, worktree, and bootstrap settings ([`config-editor.ts:109-147`](../src/ui/workspace/config-editor.ts#L109-L147)).
- Workspace view-state persistence remains a presentation-state dependency. Durable session records remain independent from it.

## Migration decisions

| Decision | Disposition |
| --- | --- |
| `AgentSessionService`, `SessionProcess`, session store, session logs, and tmux agent processes | Retain. |
| Task/config/session state persistence and watcher patterns | Retain. |
| Configuration precedence, preset snapshots, native session identity, output history, handoff ordering, and worktree reuse | Retain. |
| Tmux/Blessed presentation attach, pane swapping, workspace panes, and legacy quit behavior | Replace after parity. |
| Legacy deliberate workspace quit killing presentation process trees | Change. OpenTUI close detaches UI only and preserves durable agent sessions. |
| Any UI-owned session lifecycle cleanup, implicit start, or stale-output acceptance | Prohibited. |
