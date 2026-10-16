---
consolidation:
  total: 30
  counts:
    exists: 6
    discard: 22
    integrate: 0
    unconfirmed: 2
  percentages:
    exists: 20.00%
    discard: 73.33%
    integrate: 0.00%
    unconfirmed: 6.67%
---
# AoE natural completion and resume: bounded source audit
> **Non-authoritative supporting material.** This file is not a contract. Authoritative owner(s): [SPEC](SPEC.md), [BLUEPRINT](BLUEPRINT.md), [sessions](specs/sessions.md), [session harness](architecture/session-harness.md).
> Disposition: Historical — discard.

## Revision / evidence

<!-- consolidation: discard; ref: none; reason: Immutable source pins and inspection scope are audit provenance. -->
Primary source: [agent-of-empires/agent-of-empires](https://github.com/agent-of-empires/agent-of-empires). The authorized audit pins **563456d8a05eddd2e09628de151d15a0e16b183e** (2026-10-11). GitHub API reported current `main` on 2026-10-12 as **98a0ba1f035096491e2770c49e9f6ae816a93b83**; I inspected its `src/session/instance/kill.rs` delta as well. All citations below are immutable GitHub source links with file/line anchors; current-head difference is explicitly noted where relevant.

## Mechanisms

- **Provider exit is not shell/pane exit.** The wrapper script runs `stty susp undef` then `exec env …` ([launch wrapper](https://github.com/agent-of-empires/agent-of-empires/blob/563456d8a05eddd2e09628de151d15a0e16b183e/src/session/instance/launch_command.rs#L254-L276)); the host builder supplies this wrapper around the provider command ([host builder](https://github.com/agent-of-empires/agent-of-empires/blob/563456d8a05eddd2e09628de151d15a0e16b183e/src/session/instance/launch_command.rs#L496-L555)). `exec` replaces that shell process with the provider; these lines do not establish a persistent shell after provider exit. AOE start distinguishes an existing live pane (`Skipped`) from a dead pane, which it cleans before relaunch ([start.rs](https://github.com/agent-of-empires/agent-of-empires/blob/563456d8a05eddd2e09628de151d15a0e16b183e/src/session/instance/start.rs#L47-L112)); tmux's pane-dead and pane-running-shell checks are distinct ([tmux/session.rs](https://github.com/agent-of-empires/agent-of-empires/blob/563456d8a05eddd2e09628de151d15a0e16b183e/src/tmux/session.rs#L283-L310)). Resume's two-second post-shell grace applies after the pane stops running its boot shell; missing session/dead pane returns dead, while timeout returns alive ([resume probe](https://github.com/agent-of-empires/agent-of-empires/blob/563456d8a05eddd2e09628de151d15a0e16b183e/src/session/instance/resume.rs#L15-L28), [probe loop](https://github.com/agent-of-empires/agent-of-empires/blob/563456d8a05eddd2e09628de151d15a0e16b183e/src/session/instance/resume.rs#L67-L97)). It is a startup-settle check, **not provider completion or descendant-quiescence proof**; source does not say whether an ended provider pane remains dead versus is respawned by tmux configuration.
<!-- consolidation: discard; ref: none; reason: Wrapper exec semantics are an upstream source finding. -->
<!-- consolidation: discard; ref: none; reason: Live-versus-dead pane start behavior is upstream reference evidence. -->
<!-- consolidation: discard; ref: none; reason: Resume grace probe and its completion-proof limitations are upstream evidence. -->
- **Native identity and pane lifecycle.** `Instance::restart_with_size*` enters the resume orchestration; it retains the persisted instance/native ID, reserves its lifecycle, kills the outgoing pane for restart, prepares the launch, and starts the replacement ([resume orchestration](https://github.com/agent-of-empires/agent-of-empires/blob/563456d8a05eddd2e09628de151d15a0e16b183e/src/session/instance/resume.rs#L30-L58), [ordered stop/prepare](https://github.com/agent-of-empires/agent-of-empires/blob/563456d8a05eddd2e09628de151d15a0e16b183e/src/session/instance/resume.rs#L153-L193)). Agent-specific flags distinguish `--resume <sid>` for existing conversation from a pinned new-session flag (`--session-id <sid>`) where configured ([flag builder](https://github.com/agent-of-empires/agent-of-empires/blob/563456d8a05eddd2e09628de151d15a0e16b183e/src/session/instance/launch_command.rs#L95-L132)). Resume is policy/capability gated, and a failed resume is marked against that SID rather than silently treated as success ([policy](https://github.com/agent-of-empires/agent-of-empires/blob/563456d8a05eddd2e09628de151d15a0e16b183e/src/session/instance/resume.rs#L258-L286), [probe result](https://github.com/agent-of-empires/agent-of-empires/blob/563456d8a05eddd2e09628de151d15a0e16b183e/src/session/instance/resume.rs#L317-L379)). Normal start returns `Skipped` if an owned tmux session already exists; it does not create another instance in that case (pinned `start.rs`, `start_with_size_opts`). These locks protect AOE's instance lifecycle, not exact-native-ID execution exclusion across unrelated sessions/clients.
<!-- consolidation: discard; ref: none; reason: Upstream restart reservation and teardown sequence are reference evidence. -->
<!-- consolidation: discard; ref: none; reason: Upstream provider flag distinctions are not this application's API contract. -->
<!-- consolidation: discard; ref: none; reason: Upstream resume failure marking is source evidence. -->
<!-- consolidation: discard; ref: none; reason: Upstream live-start skip and lock-scope limit are external findings. -->
- **What runtime evidence is checked.** The cited probe examines tmux session existence, pane-dead state, and whether the pane process is still a shell; it does not inspect provider PID, process group, descendants, or a provider-specific completion receipt. In current-head `kill.rs`, the new stop ordering reserves/persists `Stopped` before teardown to prevent a watcher mistaking the dying pane for a crash ([current commit](https://github.com/agent-of-empires/agent-of-empires/blob/98a0ba1f035096491e2770c49e9f6ae816a93b83/src/session/instance/kill.rs#L340-L407)). Stop still kills the owned tmux session and stops its sandbox; the inspected source does not establish descendant/process-group termination.
<!-- consolidation: discard; ref: none; reason: Probe evidence coverage is a bounded external finding. -->
<!-- consolidation: discard; ref: none; reason: Upstream stop-order revision is historical evidence rather than a schema requirement. -->
<!-- consolidation: discard; ref: none; reason: Upstream stop effects do not establish descendant settlement. -->
- **Resources and duplicate-execution uncertainty.** Launch hooks execute before command preparation; restart stops outgoing pane before conversation carry/command construction, because transcript copying while it is still running is unsafe ([resume.rs](https://github.com/agent-of-empires/agent-of-empires/blob/563456d8a05eddd2e09628de151d15a0e16b183e/src/session/instance/resume.rs#L153-L193)). Temporary launch script is fed through `/dev/fd/3`, not a persistent script file ([launch_command.rs](https://github.com/agent-of-empires/agent-of-empires/blob/563456d8a05eddd2e09628de151d15a0e16b183e/src/session/instance/launch_command.rs#L205-L229)); Pi identity extension is written under AoE app data and reused ([launch_command.rs](https://github.com/agent-of-empires/agent-of-empires/blob/563456d8a05eddd2e09628de151d15a0e16b183e/src/session/instance/launch_command.rs#L65-L78)). Neither observation proves all launch resources/descendants are cleaned. Current-head stop errors from the owned-session kill path propagate to its caller; contrast deletion's separately audited `kill_all_tmux_sessions_locked` swallowing errors (authorized parent note, lines 41–42). There is no exact-native-ID exclusion guarantee established here; source does not establish whether any provider descendants remain active or whether a second invocation could duplicate work.
<!-- consolidation: discard; ref: none; reason: Upstream transcript-carry ordering is source rationale. -->
<!-- consolidation: discard; ref: none; reason: Descriptor-fed scripts and reused Pi extension are external resource implementation facts. -->
<!-- consolidation: discard; ref: none; reason: Contrasting upstream stop and purge error propagation is source evidence. -->
<!-- consolidation: discard; ref: none; reason: Descendant and duplicate-execution proof limits stay with this audit. -->
- **Quit, delete, stop, completion differ.** Ordinary TUI quit restores terminal state and does not invoke stop/delete; detach only detaches a tmux client ([pinned `tui/mod.rs`](https://github.com/agent-of-empires/agent-of-empires/blob/563456d8a05eddd2e09628de151d15a0e16b183e/src/tui/mod.rs#L134-L157), [pinned `tmux/session.rs`](https://github.com/agent-of-empires/agent-of-empires/blob/563456d8a05eddd2e09628de151d15a0e16b183e/src/tmux/session.rs#L283-L310)). TUI/CLI deletion is a destructive AOE session lifecycle, not evidence of natural provider completion. Explicit stop kills the session and sandbox and commits stopped/error status (pinned [kill.rs](https://github.com/agent-of-empires/agent-of-empires/blob/563456d8a05eddd2e09628de151d15a0e16b183e/src/session/instance/kill.rs#L327-L405); current-head change moves `Stopped` reservation before the kill). Natural completion is not shown to trigger stop/delete or a completion callback in the inspected path.
<!-- consolidation: discard; ref: none; reason: Upstream quit and detach call paths are reference findings. -->
<!-- consolidation: discard; ref: none; reason: Upstream destructive delete and explicit-stop effects are source evidence. -->
<!-- consolidation: discard; ref: none; reason: Absence of a demonstrated natural-completion callback is an audit coverage limit. -->

## Applicability to Backlog.md

AOE demonstrates a useful distinction between provider-native conversation identity, AOE instance identity, and tmux pane lifecycle, plus restart-with-same-native-ID semantics. Backlog adopts that instance-owned lifecycle rather than requiring global/exact native-ID exclusion or all-descendant settlement. This accepts that a dead pane does not prove every descendant exited, and that separate Backlog instances are not globally excluded by native ID. Some AOE teardown paths can swallow kill errors; Backlog must retain truthful errors. AOE's destructive stop/delete behavior does not apply to Backlog's forget-task contract.
<!-- consolidation: exists; ref: docs/architecture/session-harness.md#session; reason: Application conversation provider identity and replaceable execution are distinct. -->
<!-- consolidation: exists; ref: docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport; reason: Global native-ID exclusion is explicitly prohibited. -->
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#runningexecution; reason: Blanket waiver of descendant settlement is not stated by the current owned-resource cleanup contract. -->
<!-- consolidation: exists; ref: docs/CONVENTIONS.md#error-handling; reason: Teardown failures must remain visible. -->
<!-- consolidation: discard; ref: docs/specs/tasks.md#purpose; reason: Forget-only deletion conflicts with the approved destructive task-deletion scope. -->

**Concrete takeaway:** AOE's live owned pane makes start skip; a dead pane is cleaned and the same instance's stored native conversation ID is relaunched with provider-native resume flags (subject to capability/policy). Explicit restart tears down the outgoing pane before relaunch. Backlog adopts this instance lifecycle: reconcile verified natural exit as stopped, and on explicit resume clear the validated outgoing owned pane/resource reservation before resuming the saved identity. No descendant ledger/receipt or all-descendant settlement proof is required. Exact target validation, truthful probe/teardown errors, and Backlog's separate forget-only deletion contract remain required.
<!-- consolidation: discard; ref: none; reason: Repeated upstream start and restart summary is reference evidence. -->
<!-- consolidation: exists; ref: docs/specs/sessions.md#sessions; reason: Stopped state requires current exit evidence. -->
<!-- consolidation: exists; ref: docs/architecture/session-harness.md#session; reason: Exact resume validates outgoing ownership and cleans resources before replacement activity preparation. -->
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#runningexecution; reason: Confirm whether the no-descendant-proof exception meets the current complete owned-resource cleanup obligation. -->
<!-- consolidation: exists; ref: docs/BLUEPRINT.md#observation-stop-and-deletion; reason: Exact targets and truthful probe and teardown errors remain mandatory. -->
<!-- consolidation: discard; ref: docs/specs/tasks.md#task-deletion; reason: Forgetting alone explicitly fails the current task-deletion contract. -->

**Scope:** remote official upstream raw/API source only; no checkout, build, tests, runtime, tmux, Backlog CLI, or provider invocation. Line links target immutable commits; current main inspected only for the stop-order delta and its stated lines.
<!-- consolidation: discard; ref: none; reason: Historical inspection scope is retained in the source audit. -->
