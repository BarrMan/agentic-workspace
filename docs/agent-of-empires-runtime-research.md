# Agent of Empires: runtime lessons for Backlog

## Scope and evidence

This note synthesizes verified librarian findings; it does not authorize implementation or migration.
Canonical project: [agent-of-empires/agent-of-empires](https://github.com/agent-of-empires/agent-of-empires).
Canonical documentation: [agent-of-empires.com/docs](https://agent-of-empires.com/docs/).
Source links below target unpinned `main`; use the [pinned deletion audit](aoe-multi-client-deletion-source-audit.md) and [completion/resume audit](aoe-natural-completion-resume-source-audit.md) for immutable evidence and the separately inspected stop-order delta. Simultaneous multi-TUI sharing was not tested.
Parent owns validation. Treat source-backed behavior separately from inferred design lessons.

## Verified architecture

### Ordinary TUI and optional daemon

- `is_serve_command` identifies an explicit `serve` subcommand as a separate, feature-gated path.
- With no subcommand, dispatch enters `tui::run`; ordinary TUI startup checks tmux and starts a local TUI.
- Structured-view features can offer a daemon; these paths do not establish a daemon requirement for ordinary TUI use.
- Sources: [`src/main.rs`](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/main.rs), [`src/tui/mod.rs`](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/tui/mod.rs).

### Selection belongs to the local view

- `HomeView` owns its cursor and `selected_session` locally.
- `Storage` persists profile session rows in `sessions.json`; those rows do not persist the view's selection fields.
- AOE profiles are not Backlog task modes. This is evidence for local UI selection, not a direct replacement contract for Backlog `activeSessionId`.
- Sources: [`src/tui/home/mod.rs`](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/tui/home/mod.rs), [`src/session/storage.rs`](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/session/storage.rs).

### Explicit creation, attachment, and termination

- The README states that sessions survive quitting and SSH disconnection.
- Quick-start describes explicit session creation, selection followed by Enter to attach, and `Ctrl+b d` to detach.
- `perform_deletion` kills the session's tmux runtime before worktree/container teardown.
- `perform_stop` kills the agent pane. Stop, deletion, and presentation detachment are distinct operations.
- Sources: [`README.md`](https://github.com/agent-of-empires/agent-of-empires/blob/main/README.md), [`docs/quick-start.md`](https://github.com/agent-of-empires/agent-of-empires/blob/main/docs/quick-start.md), [`src/session/deletion.rs`](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/session/deletion.rs), [`src/session/stop.rs`](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/session/stop.rs).

### tmux and runtime identity

- tmux supports a configurable socket name/path; the default is normal shared tmux, not one isolated server per UI.
- Instance records carry agent native-session identity/ownership and resume fields; tmux naming is deterministic.
- These mechanisms locate runtimes and conversations. They do not by themselves prove safe simultaneous execution of the same native conversation.
- Sources: [`src/tmux/mod.rs`](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/tmux/mod.rs), [`src/session/instance.rs`](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/session/instance.rs).

### Filesystem coordination

- Storage mutators use a mutex and filesystem `flock`; recovery uses a cross-process recovery lock.
- These are concrete coordination mechanisms for their protected operations, not proof that every multi-app launch/stop/resume race is handled.
- Sources: [`src/session/storage.rs`](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/session/storage.rs), [`src/session/recovery.rs`](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/session/recovery.rs).

## Comparison with Backlog's accepted direction

| Concern | AOE evidence | Backlog target |
|---|---|---|
| Ordinary UI | Local TUI; optional feature paths can serve | No central lifecycle daemon |
| Terminal backend | Shared tmux by default; socket configurable | Shared normal tmux or existing configured override |
| View selection | Local `HomeView` selection | Local UI selection, with task/mode history semantics defined separately |
| Conversation creation | Explicit new/attach workflow | Distinct saved/native conversations by default on requested execution; history viewing creates none |
| History | Profile session rows in filesystem | Shared task-owned filesystem history; fixed modes and preset-only current configuration |
| UI close | Sessions survive quit/disconnect | Dispose frontend transport only; no last-client/idle/completion-helper garbage collection |
| Nonworking runtime | Explicit lifecycle actions documented | Observe verified natural exit as stopped; explicit exact resume/stop, unknown nonmutating |
| Coordination | Mutator and recovery locks | Existing task/session admission and short locked mutations; no global native-ID exclusion |

## Adopt the patterns, preserve Backlog policy

- Keep UI cursor/selection local; preserve shared conversation history independently of which UI displays it.
- Make new execution and attachment explicit. Merely reading/selecting history must not create an unrequested conversation.
- Separate presentation state, persisted history, and runtime authority; reuse verified identities for recovery rather than fabricating native IDs.
- Keep existing task-admission/session claims and current-record publication checks. They protect a Backlog instance, not global provider-native-ID execution uniqueness.
- Keep fixed modes, current task → project → user preset resolution, runtime OpenCode adapter selection, and existing harness-independent activity detection.
- Apply the [authorized shared-runtime plan](shared-agent-server-plan.md), which supersedes isolated servers and retained-work completion helpers. Adopt instance-owned lifecycle and local selection; Backlog task deletion remains forget-only, unlike AoE purge.
- Verified survivor recovery sends no new prompt or history mutation. Unknown/unreachable attribution fails closed rather than enabling cleanup or duplicate execution.
- Preserve exact runtime/resource validators and truthful teardown errors; remove superseded private lifecycle machinery only after its consumers are replaced.

## Limits and next reference

No concurrent two-TUI behavior, provider shared-backend guarantees, exact native-execution exclusion, or full lifecycle race coverage was verified here.
No new source inspection, runtime launches, tests, or builds were performed for this synthesis.
The authorized [runtime plan](shared-agent-server-plan.md) owns target choices, the [findings](shared-agent-runtime-simplification.md) own technical safeguards, and the [handoff](shared-agent-runtime-handoff.md) owns current proof gaps. Full AoE UI activation-chain and CLI/UI backend equivalence remain UNKNOWN.
Permanent logs and bootstrap delivery are supported features. This note authorizes no schema/path change.
Schema migration remains paused; any later migration requires final decisions and separate authorization, with backup and quiesced writers.
