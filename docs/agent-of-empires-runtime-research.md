---
consolidation:
  total: 59
  counts:
    exists: 23
    discard: 32
    integrate: 0
    unconfirmed: 4
  percentages:
    exists: 38.98%
    discard: 54.24%
    integrate: 0.00%
    unconfirmed: 6.78%
---
# Agent of Empires: runtime lessons for Backlog

## Scope and evidence

This note synthesizes verified librarian findings; it does not authorize implementation or migration.
<!-- consolidation: exists; ref: docs/SPEC.md#authority; reason: Research evidence does not authorize product changes. -->
Canonical project: [agent-of-empires/agent-of-empires](https://github.com/agent-of-empires/agent-of-empires).
Canonical documentation: [agent-of-empires.com/docs](https://agent-of-empires.com/docs/).
Source links below target unpinned `main`; use the [pinned deletion audit](aoe-multi-client-deletion-source-audit.md) and [completion/resume audit](aoe-natural-completion-resume-source-audit.md) for immutable evidence and the separately inspected stop-order delta. Simultaneous multi-TUI sharing was not tested.
<!-- consolidation: discard; ref: none; reason: Citation provenance and historical verification limit remain in this research source. -->
Parent owns validation. Treat source-backed behavior separately from inferred design lessons.
<!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Evidence reporting distinguishes inspection from runtime verification. -->

## Verified architecture

### Ordinary TUI and optional daemon

- `is_serve_command` identifies an explicit `serve` subcommand as a separate, feature-gated path.
<!-- consolidation: discard; ref: none; reason: External dispatch implementation fact is reference material. -->
- With no subcommand, dispatch enters `tui::run`; ordinary TUI startup checks tmux and starts a local TUI.
<!-- consolidation: discard; ref: none; reason: External startup callgraph is reference material. -->
- Structured-view features can offer a daemon; these paths do not establish a daemon requirement for ordinary TUI use.
<!-- consolidation: discard; ref: none; reason: External optional daemon scope is not a product requirement. -->
- Sources: [`src/main.rs`](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/main.rs), [`src/tui/mod.rs`](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/tui/mod.rs).

### Selection belongs to the local view

- `HomeView` owns its cursor and `selected_session` locally.
<!-- consolidation: discard; ref: none; reason: External view implementation fact. -->
- `Storage` persists profile session rows in `sessions.json`; those rows do not persist the view's selection fields.
<!-- consolidation: discard; ref: none; reason: External storage schema is reference evidence. -->
- AOE profiles are not Backlog task modes. This is evidence for local UI selection, not a direct replacement contract for Backlog `activeSessionId`.
<!-- consolidation: exists; ref: docs/BLUEPRINT.md#task-and-mode-relationships; reason: Task selection is explicitly distinct from presentation focus. -->
- Sources: [`src/tui/home/mod.rs`](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/tui/home/mod.rs), [`src/session/storage.rs`](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/session/storage.rs).

### Explicit creation, attachment, and termination

- The README states that sessions survive quitting and SSH disconnection.
<!-- consolidation: discard; ref: none; reason: External README guarantee is retained as research. -->
- Quick-start describes explicit session creation, selection followed by Enter to attach, and `Ctrl+b d` to detach.
<!-- consolidation: discard; ref: none; reason: External keybindings are not this product contract. -->
- `perform_deletion` kills the session's tmux runtime before worktree/container teardown.
<!-- consolidation: discard; ref: none; reason: External deletion call order is source evidence. -->
- `perform_stop` kills the agent pane. Stop, deletion, and presentation detachment are distinct operations.
<!-- consolidation: discard; ref: none; reason: External stop mechanism and terminology remain reference material. -->
- Sources: [`README.md`](https://github.com/agent-of-empires/agent-of-empires/blob/main/README.md), [`docs/quick-start.md`](https://github.com/agent-of-empires/agent-of-empires/blob/main/docs/quick-start.md), [`src/session/deletion.rs`](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/session/deletion.rs), [`src/session/stop.rs`](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/session/stop.rs).

### tmux and runtime identity

- tmux supports a configurable socket name/path; the default is normal shared tmux, not one isolated server per UI.
<!-- consolidation: discard; ref: none; reason: External runtime configuration fact. -->
- Instance records carry agent native-session identity/ownership and resume fields; tmux naming is deterministic.
<!-- consolidation: discard; ref: none; reason: External record and naming design is not an adopted schema. -->
- These mechanisms locate runtimes and conversations. They do not by themselves prove safe simultaneous execution of the same native conversation.
<!-- consolidation: discard; ref: none; reason: Bounded upstream evidence limitation. -->
- Sources: [`src/tmux/mod.rs`](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/tmux/mod.rs), [`src/session/instance.rs`](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/session/instance.rs).

### Filesystem coordination

- Storage mutators use a mutex and filesystem `flock`; recovery uses a cross-process recovery lock.
<!-- consolidation: discard; ref: none; reason: External locking mechanisms remain research evidence. -->
- These are concrete coordination mechanisms for their protected operations, not proof that every multi-app launch/stop/resume race is handled.
<!-- consolidation: discard; ref: none; reason: External concurrency verification limit is not a product promise. -->
- Sources: [`src/session/storage.rs`](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/session/storage.rs), [`src/session/recovery.rs`](https://github.com/agent-of-empires/agent-of-empires/blob/main/src/session/recovery.rs).

## Comparison with Backlog's accepted direction

| Concern | AOE evidence | Backlog target |
|---|---|---|
| Ordinary UI | Local TUI; optional feature paths can serve | No central lifecycle daemon <!-- consolidation: discard; ref: none; reason: AOE local-versus-serve behavior is external evidence. --> <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#component-ownership; reason: Shared application ownership is specified but a blanket daemon prohibition is not. --> |
| Terminal backend | Shared tmux by default; socket configurable | Shared normal tmux or existing configured override <!-- consolidation: discard; ref: none; reason: AOE socket defaults are external evidence. --> <!-- consolidation: exists; ref: docs/BLUEPRINT.md#launch-context-and-terminal-transport; reason: Explicit shared backend and configured socket override are required. --> |
| View selection | Local `HomeView` selection | Local UI selection, with task/mode history semantics defined separately <!-- consolidation: discard; ref: none; reason: AOE HomeView ownership is external evidence. --> <!-- consolidation: exists; ref: docs/BLUEPRINT.md#task-and-mode-relationships; reason: Task selection and presentation focus have distinct owners. --> |
| Conversation creation | Explicit new/attach workflow | Distinct saved/native conversations by default on requested execution; history viewing creates none <!-- consolidation: discard; ref: none; reason: AOE workflow is external evidence. --> <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#shared-application-operations; reason: Start and retained-session selection are separate operations with no startup on reads. --> |
| History | Profile session rows in filesystem | Shared task-owned filesystem history; fixed modes and preset-only current configuration <!-- consolidation: discard; ref: none; reason: AOE profile row storage is external evidence. --> <!-- consolidation: exists; ref: docs/BLUEPRINT.md#conversation-records-versus-runtime; reason: Task-owned retained history persists. --> <!-- consolidation: discard; ref: docs/specs/configuration.md#modes-and-approval; reason: A fixed catalogue is superseded by configurable modes while session membership stays fixed. --> <!-- consolidation: discard; ref: docs/specs/configuration.md#configuration-access-and-precedence; reason: Preset-only framing is superseded by field-by-field effective configuration. --> |
| UI close | Sessions survive quit/disconnect | Dispose frontend transport only; no last-client/idle/completion-helper garbage collection <!-- consolidation: discard; ref: none; reason: AOE persistence after quit is external evidence. --> <!-- consolidation: exists; ref: docs/BLUEPRINT.md#launch-context-and-terminal-transport; reason: Client disposal cannot own execution or shared-server lifetime. --> |
| Nonworking runtime | Explicit lifecycle actions documented | Observe verified natural exit as stopped; explicit exact resume/stop, unknown nonmutating <!-- consolidation: discard; ref: none; reason: AOE documented lifecycle actions are external evidence. --> <!-- consolidation: exists; ref: docs/specs/sessions.md#identity-and-observed-state; reason: Observed stopped and unknown states retain non-destructive uncertainty semantics. --> <!-- consolidation: exists; ref: docs/specs/sessions.md#stopping-and-exact-resume; reason: Stop and exact resume are explicit conversation operations. --> |
| Coordination | Mutator and recovery locks | Existing task/session admission and short locked mutations; no global native-ID exclusion <!-- consolidation: discard; ref: none; reason: AOE mutation and recovery locks are external evidence. --> <!-- consolidation: exists; ref: docs/BLUEPRINT.md#mutation-and-concurrency-boundary; reason: Admission and short fresh-state mutations are required. --> <!-- consolidation: exists; ref: docs/BLUEPRINT.md#launch-context-and-terminal-transport; reason: Global provider-native-ID exclusion is explicitly rejected. --> |

## Adopt the patterns, preserve Backlog policy

- Keep UI cursor/selection local; preserve shared conversation history independently of which UI displays it.
<!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-and-modules; reason: UI navigation and shared domain histories have separate ownership. -->
- Make new execution and attachment explicit. Merely reading/selecting history must not create an unrequested conversation.
<!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#shared-application-operations; reason: Reads and selection have no launch side effect. -->
- Separate presentation state, persisted history, and runtime authority; reuse verified identities for recovery rather than fabricating native IDs.
<!-- consolidation: exists; ref: docs/BLUEPRINT.md#conversation-records-versus-runtime; reason: History and observations are separate and saved IDs alone confer no runtime authority. -->
- Keep existing task-admission/session claims and current-record publication checks. They protect a Backlog instance, not global provider-native-ID execution uniqueness.
<!-- consolidation: exists; ref: docs/BLUEPRINT.md#mutation-and-concurrency-boundary; reason: Admission and incarnation-validated publication protect current records. -->
- Keep fixed modes, current task → project → user preset resolution, runtime OpenCode adapter selection, and existing harness-independent activity detection.
<!-- consolidation: discard; ref: docs/specs/configuration.md#modes-and-approval; reason: Fixed catalogue is superseded by configurable modes. -->
<!-- consolidation: exists; ref: docs/specs/configuration.md#configuration-access-and-precedence; reason: Current task over project over root resolution is required. -->
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#harness-construction-and-promises; reason: Exact OpenCode runtime adapter selection needs current adoption evidence beyond source. -->
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#session-subscriptions-and-event-ownership; reason: Retaining existing harness-independent activity detection needs current adoption and provider evidence. -->
- Apply the [authorized shared-runtime plan](shared-agent-server-plan.md), which supersedes isolated servers and retained-work completion helpers. Adopt instance-owned lifecycle and local selection; Backlog task deletion remains forget-only, unlike AoE purge.
<!-- consolidation: exists; ref: docs/BLUEPRINT.md#launch-context-and-terminal-transport; reason: Shared runtime replaces frontend-owned servers and client-count cleanup. -->
<!-- consolidation: discard; ref: docs/specs/tasks.md#scope; reason: Forget-only deletion is superseded by agent and work-context cleanup. -->
- Verified survivor recovery sends no new prompt or history mutation. Unknown/unreachable attribution fails closed rather than enabling cleanup or duplicate execution.
<!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-and-modules; reason: Verified attachment updates presentation without lifecycle or input effects. -->
<!-- consolidation: exists; ref: docs/BLUEPRINT.md#shared-operation-protocol; reason: Failed probes cannot authorize destructive effects or fabricated liveness. -->
- Preserve exact runtime/resource validators and truthful teardown errors; remove superseded private lifecycle machinery only after its consumers are replaced.
<!-- consolidation: exists; ref: docs/BLUEPRINT.md#stop-deletion-and-completion; reason: Provenance validation and truthful cleanup outcomes are mandatory. -->
<!-- consolidation: exists; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Superseded behavior and callers must be aligned together. -->

## Limits and next reference

No concurrent two-TUI behavior, provider shared-backend guarantees, exact native-execution exclusion, or full lifecycle race coverage was verified here.
<!-- consolidation: discard; ref: none; reason: Historical audit coverage limit. -->
No new source inspection, runtime launches, tests, or builds were performed for this synthesis.
<!-- consolidation: discard; ref: none; reason: Historical execution report. -->
The authorized [runtime plan](shared-agent-server-plan.md) owns target choices, the [findings](shared-agent-runtime-simplification.md) own technical safeguards, and the [handoff](shared-agent-runtime-handoff.md) owns current proof gaps. Full AoE UI activation-chain and CLI/UI backend equivalence remain UNKNOWN.
<!-- consolidation: discard; ref: docs/SPEC.md#authority; reason: Core contracts now own target choices and older plans retain evidence only. -->
<!-- consolidation: discard; ref: none; reason: External activation-chain coverage limit is retained with the audit. -->
Permanent logs and bootstrap delivery are supported features. This note authorizes no schema/path change.
<!-- consolidation: discard; ref: docs/specs/sessions.md#live-terminal-and-client-lifetime; reason: Permanent terminal logs conflict with live-stream-only retention. -->
<!-- consolidation: exists; ref: docs/specs/sessions.md#inputs-delivered-to-the-agent; reason: Startup instruction delivery remains supported with in-memory composition. -->
Schema migration remains paused; any later migration requires final decisions and separate authorization, with backup and quiesced writers.
<!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Retain migration authorization backup and writer-quiescence gate until its current disposition is confirmed. -->
