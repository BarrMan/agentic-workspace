# Shared agent runtime: simplification findings

This document records oracle's source-grounded simplification actions for the [shared runtime plan](shared-agent-server-plan.md). It is not artifact approval or runtime acceptance. Source references name symbols rather than line numbers because implementation may move them.

Current source/lane checkpoint: [handoff](shared-agent-runtime-handoff.md). Test refactors and finding evidence: [remediation plan](test-suite-remediation-plan.md). Read those for progress; this document owns the stable technical safeguards.

The canonical [AoE functionality map](aoe-functionality-map.md) is verified across 97 features in six domains (92 body-verified, 4 signature-level, 1 grep-only); thin-entry depth gaps are recorded in the map. With explicit parent/user authorization, aligned implementation may proceed. Source preparation consolidation and its `STARTING` guard are in `src/agent-workspace/sessions.ts`; post-startup cleanup ownership is in `src/ui/opentui/workspace-controller.ts`. The auto-resume setting and failed-resume marker data model are in `src/agent-workspace/types.ts`, `src/agent-workspace/config.ts`, and `src/agent-workspace/sessions.ts`. Resume-policy phases 3–4 and the deferred task-watcher F7 seam remain; see the [handoff](shared-agent-runtime-handoff.md#immediate-remaining-proof).

## Priority and implementation shape

Simplify runtime classification, request admission and frontend-local selection in their existing modules first. Then consolidate launch mechanics and explicit lifecycle; retain and integrate BACK-27 forget-only deletion and prove the remaining features; remove obsolete consumers and stop writing the retired field only when every consumer is gone; finish with assembled validation and build.

Use one coherent owner for coupled session/controller/CLI flow. Split only mechanically owned tests or backend work after interfaces stabilize. Finish the bounded retirement fix already in progress, but do not start another isolated patch wave before the consolidated flow. No exception stacks, parallel writer fragments, replacement state framework, or generic lifecycle abstraction. Structural simplification does not authorize weakening validation, accessibility, error handling, provider/path/provenance checks, or locks.

## Oracle findings and required actions

### One runtime, distinct request and attachment decisions

- `launchNativeRecord` and `launchReserved` use the same session process, socket/name/tags, live-preview/context preparation, capture and `prepareAgentLaunch`; `reserveSession` currently omits `nativeWorkspace` while workspace/pending paths set it. Missing flag is not evidence of a legacy-only runtime.
- Consolidate to one runtime lifecycle. Keep actual request admission and frontend-local attachment/selection as distinct decisions. Do not replace the flag with a backend boolean.
- Remove flag-based rejection of a direct instance as “another terminal,” CLI attach/send-key rejection, and differences in stop, cleanup, runtime classification and discovery filtering. Both entrypoints get the same verified runtime access; entrypoint presentation is not lifecycle authority. Preserve exact ownership/roles, including `killRetired` separation.

### Admission, adoption and observation

- `STARTING` plus the flag cannot prove a request was not launched: `launchNativeRecord` also reaches `STARTING`. These call sites need one existing task-admission/session-claims revalidation of the marker, record, and runtime: `AgentSessionService.delete`, `prepareNativeSessionLocked` (including its adoption path), `registerPendingSessionGated`, and controller `#pollRequests`, `#adoptRequest`, and `#launchAgent`. A marker alone is insufficient if interrupted adoption already created a runtime. Current ownership follows the [session-service target design](./session-service-redesign.md#ownership).
- Request registration supplies the invoking CLI's PID, but controller admission requires the controller's PID. Replace that contradictory routing with project/task/session-provenance admission under existing claims; requester PID is not frontend or runtime authority. Consume the marker at the service commit, not after asynchronous UI scheduling. Remove duplicate status/PID scans where marker polling covers them. A verified queued request must not be settled STOPPED by generic observation.
- Prove the shared flow with a live STARTING reconciliation that never kills, transient preflight errors that leave state/runtime unchanged, different requester/controller PIDs, and a queued missing-pane request admitted fresh exactly once. Dispatched STARTING with a consumed marker must not bypass the existing live-session deletion refusal.
- Unify `liveSession`, `settleDeadSessions`, `probePane` and `stopDeadSession` on the existing exact-runtime classifier: live attaches; conclusive dead/missing settles STOPPED; uncertain/error makes no mutation; verified queued request is preserved. Update callers, then remove destructive passive-observation branches. Teardown belongs only to explicit stop/resume. Parameterize tests across entrypoints rather than maintain duplicate implementations.
- Pinned-start/resume evidence in [the natural-completion/resume audit](aoe-natural-completion-resume-source-audit.md) supports instance-owned live/dead/start-skip/outgoing-teardown behavior. Full AOE UI activation-chain and CLI/UI backend equivalence remain UNKNOWN; do not claim their absence or equivalence. AOE destructive purge and swallowed kill errors are not models.

### Launch and lifecycle consolidation

- Once the shared flow is stable, consolidate `launchNativeRecord` and `launchReserved` around existing create/context/prepare/capture/dispatch/resource-cleanup mechanics. Do not create a generic framework.
- Keep fresh launch distinct from exact saved-native/provider resume. Keep direct-start publication distinct from explicit workspace activation; preparation must not change `activeSessionId`.
- Validate resume prerequisites before cleanup or status mutation. Keep retirement transition before `killRetired`; do not loosen its role/ownership checks.
- Remove misleading private-socket, workspace-PID and owner comments/diagnostics with their consumers; no cosmetic rename-only work.

### Deletion and record retirement

- Core task forget remains association-only, under caller-held existing locks (do not reacquire). Clean exact known sidecars/markers before record/container removal; never probe tmux, signal, call providers, delete Git data, or run a second UI purge. Retain original copied attachment records and pane callbacks; their exact provenance prevents resurrection/task-ID replacement.
- Per-session deletion currently removes the record first and performs best-effort sidecar cleanup; `removeFile` swallows errors. Strict/retryable cleanup is a proposed behavior change, not an established acceptance blocker. If approved, validate provenance and owned paths, perform authorized teardown, clean sidecars/marker, then remove the record; retain retry inventory on failure. Do not silently substitute Core task forget's stricter cleanup contract.
- Live per-session CLI/session-delete policy is OPEN: currently flagged live sessions refuse even force, while direct live sessions can stop under force. Oracle recommends both entrypoints refuse unless forced, with force doing verified teardown. This expands currently flagged behavior and needs user decision; do not claim approval. Keep this policy gate separate from structural simplification.
- Remove flag-based direct-instance/CLI policy and runtime discovery differences as above, but retain optional-field reading for existing v2 JSON while any consumer remains. Stop writing the field only after all consumers—including `src/commands/agent-workspace.ts` start/messaging—are removed. No bulk rewrite, migration descriptor, or permanent dual reader.
- `runningLimit`/`enforceRunningLimit` excludes flagged sessions. Choose explicit running-limit policy before removing its last dependency; do not silently expand automatic kills or replace the flag with a backend discriminator/legacy exception. Structural work must not change this behavior meanwhile.

## Invariants and gates

- Preserve Core's locked association-only forget and current membership checks. Order task admission → session claim → short store mutation; hold no lock across callbacks or reentrant task-status updates. Validate resume prerequisites BEFORE cleanup/mutation, transition to the retirement role before `killRetired`, retain STOPPED-only ask, and leave history activation to explicit activation rather than prepare.
- Preserve original copied attachment records and pane callback origins; validate exact canonical root/task/session/mode/provider/name/role and resource inventory. Cleanup precedes kill, and partial failure remains truthful and retryable. Preserve supported features and existing test-owned registries/ownership ledgers. Add no global native-ID uniqueness, all-descendant certificate, generic framework, daemon, private socket, runtime ledger, new protocol/schema, or last-client garbage collection.
- Keep all existing user features from the [plan](shared-agent-server-plan.md#feature-preservation). Structural simplification and deletion-policy decisions are separate gates.
- Resolve per-session live-delete, strict/retryable session cleanup, and running-limit policy with the user before implementing those behavior changes. Resolve field-dependent policies before removing the last consumer of the optional field. No artifact approval or runtime acceptance is implied.
