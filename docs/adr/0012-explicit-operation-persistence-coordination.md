# ADR-0012: Explicit operation and persistence coordination

**Status:** Accepted

**Date:** 2026-10-29

**Supersedes:** [ADR-0001](0001-model-owned-domain-behavior.md), persistence-owned locked reload/validation coordination only

## Purpose

Make task-operation sequencing, lock ownership, and resource provisioning explicit while retaining model-owned transforms and Storage's typed persistence boundary.

## Blueprint Mapping

**Components:** TasksService and Core within Controller; Task and Session models; Storage and its private FileSystem implementation.

**Contracts:** [Controller task updates](../blueprints/controller.md#update-task), [Task operations](../blueprints/task.md#operations), and [Storage operations and invariants](../blueprints/storage.md).

## Decision

**Selected Technology:** Complete-object persistence coordinated by the operation owner, using the shared `LockOwner` mechanism and explicit resource initialization.

**Role:** TasksService owns task-write sequencing, hooks, publication, lifecycle outcomes, and reference-cleanup task writes. Core owns session execution. Models retain synchronous domain transforms and relationships. Storage owns persistence, codecs, encoding checks, locks, and atomic writes; its FileSystem stays private.

**Implementation Constraints:**
- `update(task)` and `edit(task)` receive the complete task and derive its ID from it. Neither takes previous-status or approval-control arguments, merges partial changes, or reconstructs missing fields. `update` persists without advancing the timestamp. `edit` intentionally sequences `update` → timestamp advance → `update` → hook/event publication. If the second write fails, the first remains committed; a later hook/publication failure undoes neither write.
- The caller acquires the task-operation lock, derives changes from the current task supplied by `withTaskLock`, and persists before releasing it. The lock boundary owns the missing-task failure. Persistence does not nest acquisition of that same lock or duplicate the domain-model reload/revalidation cycle; required underlying persistence reads, codec validation, and security decoding remain. This caller-held-lock requirement is a precondition, not an automatically enforced guarantee for standalone replacement calls.
- Use one shared locking mechanism for persisted resources and conversation claims, with explicit acquisition ownership and resource-specific identities. The same exact task ID in a main project's shared store uses the same task lock across linked worktrees; different projects remain independent. Acquire the task lock before loading the current task. Keep session-state critical sections short and provider startup outside them, while the outer task-operation lock excludes deletion.
- Apply approval transforms through the Task model under the current-task lock and persist through `edit`. Storage writes the complete supplied record without an approval override or special save path. Session-only changes remain in SessionStore.
- Explicit workspace initialization and task creation provision required resources, including task directories and initial empty session state. Ordinary access must fail on missing required resources rather than recreate them. Genuinely optional files retain their owning absence contract. This decision authorizes no initialization against existing user data, migration, or automatic repair.
- Validate unknown input at its accepting boundary and retain codec/encoding and security checks. Do not reparse accepted models in each layer. Preserve real locks, atomic replacement, create-only writes, containment, symlink/collision checks, and execution-safety gates. Required cleanup continues despite notification failures; report committed and incomplete effects truthfully.

The supersession is limited to ADR-0001's assignment of the locked reload/validation cycle to persistence. Its model-owned behavior and genuine production boundaries remain. [ADR-0002](0002-storage-filesystem-paths-formats.md) still owns storage paths, formats, and atomic-write strategy; [ADR-0011](0011-task-mode-approval-storage.md) still owns `mode_approvals` and preservation of existing approval data. Neither record is superseded by this decision.

## Alternatives

| Alternative | Reason Not Selected |
|---|---|
| Persistence reloads models and dispatches partial changes | Duplicates operation ownership and accepted-object validation; hides the caller's responsibility for a complete replacement derived under its lock. |
| Save a timestamped copy once during `edit` | Conflicts with the approved two-write sequence and its explicit partial-commit outcome. |
| Separate lifecycle lock mechanisms and lazy resource repair | Splits acquisition ownership and hides missing required state during ordinary operations. |

## Rationale

One task-operation owner can sequence model transforms, durability, hooks, and cleanup without forwarding facades or a persistence command interpreter. A shared locking mechanism protects current-state operations across worktrees without nested acquisition. Explicit provisioning distinguishes a valid optional absence from damaged required state.

## Consequences

**Benefits**
- Task operations and session execution have distinct coordination owners while models and Storage retain their boundaries.
- Lock acquisition, resource creation, and partial effects are visible in the operation contract.

**Trade-offs**
- Every replacement caller must honor the lock precondition; the complete-object API does not itself prevent stale standalone writes.
- An edit has two durable writes and can leave the first committed if the second fails; multi-effect operations are not transactions.
- Missing required resources are surfaced as errors. Any existing-data provisioning or correction needs separate authorization.

## References

- [Controller](../blueprints/controller.md) — operation sequencing and failure ownership.
- [Storage](../blueprints/storage.md) — persistence and resource boundaries.
- [Engineering Conventions](../CONVENTIONS.md) — validation, direct owners, locking, and initialization practices.
- [Tasks and storage](../specs/tasks.md) and [Configuration](../specs/configuration.md) — lifecycle, required-state, and approval behavior.
- [Approval disposition](../audits/contract-change-proposals.md) — non-authoritative approval evidence and remaining coordination caveats.
