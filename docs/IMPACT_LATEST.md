## Target
Preset-only session persistence and current execution configuration.

## Dependents
SessionStore validation/receipts, AgentSessionService launch/adoption/resume/ask,
SessionProcess roots, current-model export, workspace activity/context, mode deletion.

## Test coverage
Existing store, launch, adoption, ask-context, model, mode lifecycle, and workspace
contracts cover these seams. Update frozen-configuration assertions to current
configuration; add receipt-resolution and pending-journal rejection checks.

## Risk: High
Shared persisted interface with multiple consumers and an explicitly separate live-state migration.

## Recommended action
Keep preset name and runtime/path fields; inject configuration-only receipt resolution;
resolve concrete adapters at execution; reject moving mode-deletion journals unchanged.
Rebuild after edits, run affected isolated tests/types, smoke only in temporary fixtures.
