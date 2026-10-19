# Normalization and Regex Refactor Decisions

Companion to [normalization-and-regex-audit.md](normalization-and-regex-audit.md). This records the change boundary and why remaining candidates were left unchanged.

## Change boundary

The refactor applied the behavior-preserving actions from the audit:

- Ask preparation consumes the already prepared, sanitized preflight preset.
- OpenCode adapters reuse the shared command helpers.
- Redundant list normalization passes were removed; clearable-list semantics were preserved.
- Canonical status lookup has one synchronous implementation.
- Initialization uses nullish coalescing directly; policy-free project/type filter wrappers were removed.
- Priority and process normalization avoid repeated work; renderer filter lists reuse the shared normalizer.
- Unused process identity and pane-root probes were deleted.
- Literal backslash replacement and literal message checks use native string operations.

## Intentionally unchanged

| Item | Why it remained unchanged |
|---|---|
| Cross-branch discovery removal | This is a contract-level feature removal, not a normalization refactor. It changes loader behavior, configuration and tests, and needs an explicit product decision plus a data-preservation plan. |
| Draft promotion/demotion removal | TASK-002 excludes the feature, but stored-draft handling is unresolved. Removing individual identity helpers would silently change collision and lock behavior before the data policy is decided. |
| `taskIdKey` and padded task IDs | Padding is part of task identity: `TASK-01` and `TASK-1` are different tasks. Delegating to numeric canonicalization would merge distinct IDs. |
| Draft and task identity equality | Draft identity has legacy compatibility rules that are not task equality. Sharing one key would change existing draft lookup and collision behavior. |
| Clearable-list parsing vs sanitization | Omitted input, explicit `[]`, and blank-only values deliberately produce different results. `parseClearableStringList` and `sanitizeClearableStringArray` operate at different stages and must not be merged. |
| Status equality, lookup, and comparison keys | Lookup collapses all whitespace; equality preserves internal whitespace. The synchronous lookup was consolidated, but the distinct comparison keys remain because they answer different questions. |
| Assignee and label equality | Assignee equality removes one leading `@` and collapses internal whitespace; label and generic comparison keys do not. These names document different domain rules. |
| Priority label vs value | Configured labels preserve display casing; priority values are normalized lowercase. Resolution intentionally returns the value, not the configured spelling. |
| Task lifecycle and record path normalization | Lifecycle prefix rewriting and absolute/worktree/nested-record path handling have different responsibilities. Treating one as a wrapper around the other would change path resolution. |
| Process identity checks used for termination | PID plus start-time fencing is required for safe tree termination. Only probes with no production callers were deleted. |
| Task-ID grammars, numeric option validation, escaped-prefix capture | These are strict validators with distinct diagnostics and matching scope, not generic string cleanup. |
| Date, timezone, shell-syntax, Unicode model-ID, ownership-hash, pane/session-ID, and tmux-diagnostic regexes | Each encodes a grammar or trust-boundary rule. Replacing them with looser string checks would weaken validation. |
| Process-table and CRLF/whitespace splitting | The regex is the appropriate split API for variable-width whitespace; `split(" ")` is not equivalent. |
| Suffix alternatives and one-newline removal | Arrays of `endsWith` checks or CRLF-aware slicing are longer and easier to get wrong than the current expressions. |
| Artifact path validation duplication | Schema, editor, and storage checks reject different cases, including lock/temp names and NUL input, and produce different diagnostics. Merging them risks weakening a boundary. |
| Config alias normalization | Alias precedence is behavior. Deleting or flattening it requires a supported-configuration decision, not a local cleanup. |
| Filesystem ownership and launch-environment sanitization | Repeated checks see different data at different boundaries, including adapter-added environment values. Consolidating them would reduce defense in depth. |
| Keybinding modifier matcher | The existing loop is readable and the optional single-match cleanup has negligible benefit. |
| Agent wrapper methods and Pi's sanitization hook | The hook is required by the interface. Replacing wrappers with function-valued members saves little and would not justify an interface change. |
| Test-only terminal helpers | Ownership and handoff of terminal work are unresolved; absence of production callers does not establish safe deletion. |
| Code-path heuristics and typed stale-approval errors | These are behavior improvements rather than regex or normalization simplifications, so they were left out of this change. |

The shared conclusion is deliberate: no universal `isSafeId`, `isSafePath`, or `normalizeWhitespace` abstraction was introduced. The repeated expressions represent different grammars, boundaries, or failure behavior, and a common helper would make those distinctions easier to erase.
