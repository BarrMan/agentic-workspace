# Normalization and regex audit

This was a source inventory, not a behavior contract. Its generated counts, line numbers, caller classifications, and broad cleanup signals described a prior tree and are retired; they must not be used as current evidence. For bounded current implementation findings, scoped verification, and unresolved issues, see the [normalization-refactor evidence/review index](normalization-refactor-decisions.md). Behavior belongs to the linked owner contracts, not this audit.

Important corrections to the old inventory:

- It asserted that lowercase priority values were canonical. Current priority behavior is owned by [Tasks](../specs/tasks.md); do not retain that obsolete claim.
- It described PID start-time fencing, environment filtering, status-spelling normalization, and a custom date parser as current behavior. The index names inspected paths and current discrepancies; these old descriptions are not evidence.
- It reported `.github/workflows/ci.yml` and `.husky/pre-commit` absent. Both files exist; see the index for the bounded check-script evidence and current non-writing check baseline.
- The removed cross-branch discovery and pane-snapshot references are historical inventory entries, not proof that those implementations remain in another branch or current tree.

No exhaustive replacement inventory is claimed. Re-audit a specific behavior only against its owner contract and current direct callers; do not infer removal or safety from a regex scanner, historical totals, or stale line references.
