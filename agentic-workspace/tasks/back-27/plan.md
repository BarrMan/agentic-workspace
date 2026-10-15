# BACK-27 — Implementation plan (draft)

Spec: `spec.md`. This planning artifact remains draft; shared-runtime implementation authorization does not approve it. The [runtime plan](../../../docs/shared-agent-server-plan.md) owns working-slice order; the [handoff](../../../docs/shared-agent-runtime-handoff.md) owns current proof and lane state.

## Approach

Replace deletion's stop-and-settle lifecycle with a deletion-specific **forget/detach** operation. Keep the existing cleanup used by completion and explicit session stop intact. Core deletion owns task-scoped session cleanup under its task/reference locks; the UI releases retained hosts without stopping them and invalidates pending callbacks. Make surviving processes ineligible for workspace-exit teardown and orphan sweep. Preserve exact task/session identity checks so late writers cannot restore deleted state or affect a newly created task with the same ID.

## Phases and ownership

1. **Baseline and contracts (read-only, then tests):** reconcile uncommitted source and tests before edits. Trace deletion entry points (core, TUI, external watcher), native/CLI host lifetimes, marker/sidecar ownership, startup sweep, generated status hooks, and existing tests. Add failing assertions for detach-only semantics in existing suites. Service and host-lifetime test design can run in parallel in separate test files.
2. **Deletion-specific core cleanup:** in `src/core/task-lifecycle-service.ts`, `src/core/agentic-workspace.ts`, `src/agent-workspace/sessions.ts`, and session-state/store helpers as needed, remove only exact task-scoped AgenticWorkspace associations and known files. Do not reuse the process-stopping completion cleanup. Guard deletion/admission and task-ID reuse with existing locks and exact session identities; scope path cleanup to validated AgenticWorkspace roots. Define the committed-removal boundary and recoverable cleanup-failure notice.
3. **Detached host and writer lifecycle:** in `src/agent-workspace/live/agent-host.ts`, tmux teardown/sweep code, status hooks, and launch/adoption paths as needed, release ownership without calling stop; prevent later exit/sweep from killing detached processes. Block late state writes from recreating an association or targeting a replacement task. Existing running hooks may recreate activity files; that accepted limitation is not a reason to kill them.
4. **TUI integration:** in `src/ui/opentui/workspace-controller.ts`, confirm/cancel as before, call core deletion without owned-stop callbacks, and replace `#finalTaskRemoval`'s stop behavior for both direct deletion and external task-removal observation with idempotent detach. Preserve truthful notices and avoid a second unlocked task-ID-based purge after core deletion.
5. **Validate:** targeted tests cover native and CLI RUNNING (owned and foreign), STARTING/adoption, PARKED, mixed modes, duplicate removal, cancellation, callbacks after deletion, same-ID recreation, teardown/sweep, path safety, and injected failure before/after task removal. Exercise the installed binary only with disposable tasks and isolated tmux/workspace state; verify provider conversation and worktree/branch survive.

## Sequencing and safe parallel work

Phases 2 and 3 have separable file ownership and can be researched/test-designed in parallel after shared interfaces stabilize; phase 4 depends on both. Follow the runtime plan's fresh bounded owners and verified-slice commit sequence. Batch implementation edits and source checks; the parent rebuilds MAIN after integration before a runnable handoff, as required by `AGENTS.md`. Preserve unrelated uncommitted changes.

## Separate future phase — planning-agent approval delegation

The current task profile and artifact API reserve approval for the user; this section proposes a **policy and product change**, not permission for this agent to approve these drafts. After the deletion work, design an explicit, user-granted, task-scoped authorization in the TUI for a planning agent to approve only specified planning artifacts. The approval service—not an agent editing `.artifacts.json`—would verify the grant, exact reviewed content hash, task and artifact scope, and approver identity, then record an auditable approval. A user must be able to revoke the grant; edits must invalidate prior approval. Test that an ungranted agent cannot approve, a scoped grant cannot approve another task or file, and revocation/content changes prevent stale approval. Update the agent profile's user-only rule **only if the user separately authorizes that policy change**. This phase is independent of and not required to complete BACK-27's deletion acceptance criteria; it does not approve the current artifacts.

## Checks for build mode

Audit fixture safety before bounded named suites using `bun scripts/run-ci-tests.ts <affected-test-file> --timeout=10000` (likely `src/test/agent-sessions.test.ts`, `src/test/task-delete.test.ts`, the controller suites, and only host/hook suites actually touched). For a failing area, first apply its relevant [report remediation](../../../docs/test-suite-remediation-plan.md), then fix residual failures. Runner-owned temporary CLI bundles are ordinary test mechanics, not an installed MAIN rebuild. Parent performs assembled typecheck/scoped lint/diff checks, MAIN `bun run build`, and `AGENTS.md` freshness/installed-binary verification before a runnable handoff. Artifact approval and task Done require their own evidence/user authority.

## Risks and explicit non-goals

A live process may depend on AgenticWorkspace-generated runtime files removed at deletion and may write fresh sidecars later. The user accepted this limitation; avoid claiming uninterrupted live-session operation or permanent absence of regenerated files. A provider conversation remains provider-owned, not a AgenticWorkspace session record. Do not change OMO-slim config, Git worktrees/branches, non-deletion stop/completion behavior, or introduce physical multi-resource atomicity.
