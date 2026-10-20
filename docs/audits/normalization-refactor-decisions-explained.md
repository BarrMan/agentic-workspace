# Normalization refactor decisions: rationale

This explanation was written against an earlier implementation and is not authoritative. Its item-by-item verdicts and code references became stale. See the [current evidence/review index](normalization-refactor-decisions.md) for bounded implementation evidence and follow its owner-contract links for behavior.

Retained safety reasoning:

- Task identity is the whole ID; `TASK-01` and `TASK-1` are different identities. See [Tasks](../specs/tasks.md).
- Session/process identity checks, workspace-context shape validation, sidecar deletion, and recursive purge containment defend separate trust boundaries. Do not collapse these into one string-normalization helper; concrete scenarios are retained in [Q9.1–Q9.5](normalization-refactor-open-questions.md#q91-session-file-delete-guard).
- Process-library tradeoffs and the remaining same-name PID-reuse limitation are retained in [Q7](normalization-refactor-open-questions.md#q7-process-library).
- Keybinding matcher alternatives, semantic gaps, migration risks, and sources remain in [the research note](../research/keybinding-modifier-matching.md).

Historical claims about status whitespace normalization, PID start-time fencing, custom date parsing, launch-environment filtering, sanitizer methods, and source files reported absent must not be relied on. Consult current source and the index. This document does not change an owner contract or decide unresolved policy.
