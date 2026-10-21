# ADR-0011: Task/mode approval storage

**Status:** Accepted  
**Date:** 2026-10-20  
**Supersedes:** [ADR-0002](0002-storage-filesystem-paths-formats.md), artifact approval metadata provision only

## Purpose

Store approval as the informational state of one task and mode, without coupling it to artifact files or hashes.

## Blueprint Mapping

**Components:** Task, Storage.

**Contracts:** Task owns task-local state and serialization; Storage persists task records. See [Task](../blueprints/task.md) and [CONFIG-007](../specs/configuration.md#config-007-task-and-mode-approval).

## Decision

**Selected Strategy:** Persist task/mode approval in task-record frontmatter as `mode_approvals`.

- `Task.setModeApproval`, `Task.clearModeApproval`, and task serialization own the value and its task/mode scope.
- Approval is independent of artifact files and SHA-256 hashes. It is informational and never a runtime or workflow gate.
- Implementation removes artifact-hash approval handling. Existing `.artifacts.json` files and any associated lock files remain byte-for-byte untouched: no approval data is consumed, mapped, migrated, or deleted from them.
- Existing task-record `mode_approvals` values are preserved.

## Alternatives

### Approval metadata keyed by artifact path and hash

Rejected: artifact identity cannot represent task/mode approval, and tying approval to a file hash contradicts the task-and-mode scope.

### Migrate or delete existing artifact approval metadata

Rejected: no product need requires interpreting that historical metadata, and this decision authorizes no data deletion or reinterpretation.

## Rationale

Approval follows session activity in one task and mode, so Task already owns the relevant identity and lifecycle. Keeping it in the task record makes that ownership explicit and avoids a parallel artifact-based state model.

## Consequences

**Benefits**
- Approval has one task-local representation and owner.
- Artifact changes do not alter approval state.
- Existing artifact metadata is preserved without a migration path.

**Trade-offs**
- Artifact approval metadata is no longer read or written.
- The implementation must remove that code without modifying existing artifact metadata files.

## References

- [Configuration contract: task-and-mode approval](../specs/configuration.md#config-007-task-and-mode-approval)
- [Task blueprint](../blueprints/task.md)
- [ADR-0002](0002-storage-filesystem-paths-formats.md) — storage decision retained except for artifact approval metadata.
