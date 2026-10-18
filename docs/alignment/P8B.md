# P8B — Search backend alignment ledger

Authority: [filtering and search](../specs/filtering-and-search.md); application-boundary claims checked against [application boundaries](../architecture/application-boundaries.md). Supporting plan: P8B row in [implementation alignment plan](../implementation-alignment-plan.md). This ledger records backend evidence only; inspection is not test execution.

Statuses: **verified** = source/test evidence matches the stated scenario; **gap** = demonstrated mismatch; **blocked** = scenario belongs to a delegated owner or cannot be resolved from the contract; **unknown** = not established.

| Requirement / scenario | Status | Audit evidence |
|---|---|---|
| IF-FS-001 — each supported filter dimension: text/query | verified | `matchesTaskSearchFields` performs case-insensitive literal substring matching; `task-search-parity.test.ts` covers exact and non-match cases. |
| IF-FS-001 — status | verified | `createTaskFilterMatcher` applies normalized status set. |
| IF-FS-001 — type | verified | Shared matcher applies task-type predicate. |
| IF-FS-001 — priority | verified | Shared matcher normalizes values and matches requested set. |
| IF-FS-001 — milestone | verified | Shared matcher resolves configured milestone values and no-milestone sentinel. |
| IF-FS-001 — label, default any / explicit all | verified | Shared matcher uses `labelMatch`; `task-search-label-filter.test.ts` covers single, any, all. |
| IF-FS-001-AC-01 — each dimension project-scoped | blocked | Scope of supplied task corpus is upstream; this backend receives a task array. Filter-dimension predicates are accounted individually above. |
| IF-FS-001-AC-02 — active filter summary | blocked | Interface/UI behavior belongs to P8S. |
| IF-FS-001-AC-03 — clear/reset returns project task set | blocked | UI/reset behavior and corpus scope belong to P8S/P5. |
| IF-FS-001 failure scenario | verified | Contract specifies no failures; predicates return booleans and empty filters impose no constraint. |
| IF-FS-001 empty filters / empty task corpus | verified | Empty checks all-match; `applyTaskFilters` preserves empty input as empty. |
| IF-FS-001 project-directory boundary | blocked | Supplied task corpus is caller-owned; project loading/scope is outside this backend. |
| IF-FS-002 — project task coverage | verified | `searchSnapshot` constructs task entities and applies requested type selection. |
| IF-FS-002 — task id/title/description fields | verified | `searchSnapshot` searches stored IDs, titles, and task body text using literal substring checks. `search-service.test.ts` covers task fields. |
| IF-FS-002 — case-insensitive literal matching | verified | Shared literal matcher lowercases query and fields; search/parity tests cover case-insensitivity and fuzzy near-miss rejection. |
| IF-FS-002 — task ID matching | verified | `task-id-search.ts` now supplies only stored ID spellings (case variants); substring matching does not synthesize suffix/numeric-segment aliases. No whole-token boundary is required by the contract. |
| IF-FS-002 — project scope excludes outside records | blocked | `searchSnapshot` searches exactly its supplied corpus; corpus assembly/scope is not owned here. |
| IF-FS-002 failures | verified | Contract has no additional failure behavior; invalid/corpus I/O handling is upstream. |
| IF-FS-002 empty query / empty corpus | verified | Whitespace-only query returns all allowed entities in collection order; empty corpus returns `[]`. |
| IF-FS-002 empty query options / type selection | verified | Omitted types or empty types means all types; filters apply to tasks only. |
| IF-FS-003-AC-01 — OR within values, AND between filters | verified | Shared task predicate uses OR for status/priority/assignee and label-any; separate checks combine via `every`; label-all is explicit. |
| IF-FS-003-AC-02 — default active/completed; archived only on request | blocked | Archive corpus selection belongs to P5. |
| IF-FS-003-AC-03 — plain text/JSON only | blocked | Output format and rendering belong to P6. |
| IF-FS-003-AC-04 — regex, fuzzy ranking, pagination unsupported | verified (backend matching/order) | Literal matcher removes fuzzy ranking; no regex or pagination is applied by the backend. Unsupported request/output exposure remains P6. |
| IF-FS-003 failures — unsupported format / regex / ranking / pagination | blocked | Contract says unsupported; rejection/exposure and output handling are P6. |
| IF-FS-003 ordering — matching results | verified | `searchSnapshot` iterates supplied corpus order for matching and empty queries; `search-service.test.ts` pins order and empty corpus behavior. |
| IF-FS-003 limit edge (0 / negative) | unknown | Search service tests cover limit 1 only; contract does not define limit semantics, and pagination is out of scope. |
| IF-FS-003 deterministic tie/order edge | verified | No relevance ties remain; matching and empty-query order follows stable input order, pinned by `search-service.test.ts`. |
| Edge — omitted archived option | blocked | P5 archive selection. |
| Edge — explicitly include archived | blocked | P5 archive selection. |
| Edge — records outside project | blocked | Upstream corpus scope. |
| Edge — unsupported format / regex / fuzzy / pagination request | blocked | P6 request validation/output surface; P8B does not implement fuzzy matching or pagination. |
| Delegated P5 corpus/archive wiring | blocked (delegated) | Record only; not implemented in P8B. |
| Delegated P6 CLI output/unsupported request surface | blocked (delegated) | Record only; not implemented in P8B. |
| Delegated P8S filter UI, summary, reset interactions | blocked (delegated) | Record only; not implemented in P8B. |

Whole-token semantics: the authoritative spec requires literal matching but does not define token boundaries; implemented substring matching and did not infer a whole-token rule. Tests executed: `bun test src/test/search-service.test.ts --timeout=10000` (5 passed), `bun test src/test/task-search-parity.test.ts --timeout=10000` (19 passed), `bun test src/test/task-search-label-filter.test.ts --timeout=10000` (5 passed). `bun run check:types` failed on existing errors outside the P8B allowlist; it reported no diagnostics for P8B files. Failures were in `src/agent-workspace/config.ts`, protected `src/agent-workspace/live/tmux/**`, and unrelated tests.
