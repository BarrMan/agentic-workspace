---
consolidation:
  total: 15
  counts:
    exists: 6
    discard: 3
    integrate: 1
    unconfirmed: 5
  percentages:
    exists: 40.00%
    discard: 20.00%
    integrate: 6.67%
    unconfirmed: 33.33%
---
## Target
Preset-only session persistence and current execution configuration. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#project-storage-and-configuration; reason: Persist preset/provider identity rather than configuration snapshots. -->

## Dependents
SessionStore validation/receipts, AgentSessionService launch/adoption/resume/ask,
SessionProcess roots, current-model export, workspace activity/context, mode deletion. <!-- consolidation: discard; ref: none; reason: Change-specific dependent inventory rather than enduring ownership contract. -->

## Test coverage
Existing store, launch, adoption, ask-context, model, mode lifecycle, and workspace
contracts cover these seams. Update frozen-configuration assertions to current
configuration; add receipt-resolution and pending-journal rejection checks. <!-- consolidation: discard; ref: none; reason: Historical coverage assertion does not certify current coverage. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Assertions and fixtures must align with current configuration contracts. --> <!-- consolidation: unconfirmed; ref: docs/architecture/application-boundaries.md#durability-checkpoint-collaboration; reason: Exact receipt-resolution check design is not established by the current checkpoint contract. --> <!-- consolidation: unconfirmed; ref: docs/specs/configuration.md#deleting-a-mode; reason: Pending-journal rejection behavior needs recovery-policy disposition. -->

## Risk: High
Shared persisted interface with multiple consumers and an explicitly separate live-state migration. <!-- consolidation: discard; ref: none; reason: Change-specific risk assessment. --> <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Live-state migration ownership and approval must remain explicit. -->

## Recommended action
Keep preset name and runtime/path fields; inject configuration-only receipt resolution;
resolve concrete adapters at execution; reject moving mode-deletion journals unchanged. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#conversation-records-versus-runtime; reason: Persist identity and necessary runtime/path ownership references. --> <!-- consolidation: unconfirmed; ref: docs/architecture/application-boundaries.md#storage-and-configuration-interfaces; reason: Configuration-only receipt injection is an unapproved implementation recommendation. --> <!-- consolidation: exists; ref: docs/BLUEPRINT.md#harness-and-execution; reason: Harness constructs the provider from current preset inputs at execution. --> <!-- consolidation: unconfirmed; ref: docs/specs/configuration.md#deleting-a-mode; reason: Moving-journal rejection and recovery disposition are not approved. -->
Rebuild after edits, run affected isolated tests/types, smoke only in temporary fixtures. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#validation; reason: Integrated rebuild and type checks are required before runnable handoff. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Affected isolated tests and owned fixtures are required. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Persisted-interface smoke checks must use temporary fixtures rather than live user records. -->
