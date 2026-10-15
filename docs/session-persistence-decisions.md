# Session persistence: decisions and next steps

## Purpose

Define the agreed session-storage contract and separate implementation-ready changes from questions that still require discussion. This is a target design, not a claim that the current code implements it. Writing this document does not authorize code changes or a commit.

The user-authorized [shared-runtime plan](shared-agent-server-plan.md) supersedes the private-instance isolation/completion-helper direction. It owns lifecycle and implementation sequence; the [canonical handoff](shared-agent-runtime-handoff.md) owns current source/proof status. Authorization is not artifact approval or runtime acceptance. Preserve existing conversation schema/logs/output/bootstrap; field minimization and native migration are separately gated follow-ups.

## Agreed decisions

### Agent identity and version selection

- Save the harness identity as `opencode`, not `opencode-v1` or `opencode-v2`.
- Select the version-specific adapter from the configured executable at execution time. Runtime adapter distinctions do not become saved session identities.
- Treat existing historical OpenCode sessions as v2 sessions under the requested one-time manual migration. Do not leave them permanently classified as ambiguous or blocked.
- Do not retain a legacy compatibility layer or historical unversioned-harness refusal guard.
- Preserve Backlog session IDs, native conversation IDs, and conversation history. Relabeling a record alone does not prove native resume compatibility; verify that separately.

### Configuration

- Save the preset name, not a preset configuration snapshot.
- Resolve configuration normally when executing: task overrides, then project configuration, then user configuration.
- Task-specific configuration belongs on the task, not in a session's saved configuration scope.
- Do not use saved commands, environment variables, preparation commands, or resume flags in preference to current resolved configuration.
- Configuration edits apply to existing sessions when they next execute.

### Mode

- A session has one fixed mode; it does not move between modes.
- Save its mode identity, not both current mode and original creation mode.
- Do not save copies of mode prompts, permissions, or model selection in session creation snapshots. Resolve the current mode configuration for execution.
- Do not duplicate launch paths in a creation snapshot. Correct project/worktree targeting remains required; its minimal storage contract is still open.

### Conversation versus runtime state

- The Backlog session ID to native harness conversation ID mapping identifies the conversation to resume.
- Live-process bookkeeping is a separate concern from durable conversation identity.
- Existing runtime fields are not accepted as permanently necessary merely because current code consumes them. Decide their replacement before deleting safety checks.

## Implementation entry map and evidence limits

- The [current native contract](../../Projects/Backlog.md/docs/opentui-workspace-session-contract.md) covers shared attachment, durable output, provider execution and bootstrap delivery. These are supported features; deleting old lifecycle machinery does not authorize feature removal.
- Source anchors: `src/agent-workspace/{bootstrap,sessions,session-store,session-process}.ts`, `agents/opencode-v2.ts`, `live/agent-host.ts`, and `src/ui/opentui/workspace-controller.ts`.
- The output command reads persisted terminal output, not native conversation history. Installed CLI behavior remains governed by repository `AGENTS.md`; MAIN build and live two-app acceptance are outstanding in the handoff.

## Current lifecycle and proof gates

Use the [runtime choices](shared-agent-server-plan.md#runtime-choices) and [technical safeguards](shared-agent-runtime-simplification.md#invariants-and-gates) as their single source. Shared normal/configured tmux, frontend-local selection and explicit instance-owned lifecycle replace private servers, frontend recovery exclusivity, automatic idle/last-client cleanup and completion helpers. No global native-ID uniqueness or descendant-settlement certificate is required.

Preserve canonical project/state/task roots separately from execution cwd, locked complete read-modify-write, exact native/provider identity and validated owned-resource paths. Permanent logs, bootstrap and external attachment remain supported. Runtime field consumers and policy gates must be reconciled before write retirement; no automatic state relocation, schema growth or provider data rewrite is implied.

## Separate paused persistence follow-up

These persistence decisions do not authorize migration or field deletion as part of structural shared-runtime simplification. Reconcile implementation/evidence against the current native contract before any separately authorized follow-up; unchecked items are proof/reconciliation gates, not claims that source is absent.

- [ ] Reconcile/prove persisted `opencode` identity and execution-time adapters across launch, resume and ask.
- [ ] Reconcile/prove preset-only storage and current task/project/user configuration on existing conversations.
- [ ] Reconcile/prove fixed-mode/current-profile execution without duplicate creation snapshots.
- [ ] Update store validation, types, callers, and fixtures to the revised contract. Remove obsolete legacy-handling branches and tests rather than adding compatibility exceptions.
- [ ] After separate authorization, inventory/back up state, quiesce writers, validate native compatibility and staged transformations, then perform one coordinated migration. Preserve conversation IDs, history, and unrelated data.
- [ ] Update documentation whose configuration, identity, or mode contracts become false.

Runtime-field retirement is gated by the runtime plan's last-consumer/policy proof. Output and bootstrap removal are not authorized; native/schema migration remains paused and does not block shared-runtime simplification.

## Verification and release gates

- Prove current configuration edits affect existing sessions and task/project/user precedence is respected.
- Prove saved OpenCode identities remain `opencode` while runtime version selection chooses the correct adapter.
- Prove fixed-mode previous-session selection still works and native IDs survive migration unchanged.
- Follow the [runtime execution rules](shared-agent-server-plan.md#execution-and-verification-rules) and [test remediation procedure](test-suite-remediation-plan.md#mandatory-procedure): batch edits, audited targeted tests, parent assembled checks and MAIN rebuild/freshness before installed-binary checks. Real two-app proof requires explicitly permitted disposable targets.
- Classify the outstanding release-test failures; do not call them unrelated without evidence. If failures remain, obtain a release-gate decision before committing.
- Preserve unrelated dirty files and task data. Never modify or approve `.artifacts.json`. Stage only reviewed explicit paths/hunks; the checkout is already on `main` and needs no merge.

## Next step

Continue authorized shared-runtime slices from the canonical handoff and existing runtime plan, with verified commits before advancing. Resolve remaining policy questions before field retirement; any persistence/native migration still requires its separate authorization and compatibility/quiescence evidence.
