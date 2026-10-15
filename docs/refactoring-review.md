# Backlog.md Refactoring Review

## Status

`BACK-708` implementation and its source-backed findings review are complete. The refactoring baseline is intentionally uncommitted; do not reset or clean it, and commit only when requested. Preserve `.envrc` without reading secrets. `BACK-707.3` real-provider Workspace acceptance remains unverified and separate.

## Architecture Entry Map

| Area | Owner | Contract |
| --- | --- | --- |
| CLI | `src/cli/` | `index.ts` starts the CLI; feature registrars define command families, task policies define task command behavior, and runtime/read-output own project-root and output-mode concerns. |
| Core | `src/core/backlog.ts` and workflow services | `ProjectSession` owns project-bound state, readiness, disposal, and reinitialization. Core composes read, creation, mutation, lifecycle, content, and shared-commit workflows. |
| Filesystem content | `src/file-system/` | Layout, task, content repositories, and locks own persistence. Awaited mutation subscriptions publish successful writes with captured root identity; ContentStore unsubscribes on disposal. |
| Markdown | `src/markdown/` | Scanner/ranges protect structured regions; comments and checklists own their canonical markup. Structural callers retain section placement. |
| TUI | `src/ui/` | Board, viewer, and unified sessions own selection, pending-write, and teardown lifetimes; controllers remain widget adapters. |
| Browser | `src/web/` | App data and route/modal sessions own refresh and route identity; features own initialization, milestone, form, and modal concerns. |
| Server | `src/server/` | Elysia app composition, resource plugins, task collection, host lifecycle, and WebSocket publication are separate owners. |
| MCP | `src/mcp/` | `McpServer` composes a Core application; root activation and tools/resources remain MCP adapter concerns. |

## Preserved Contracts

- Markdown remains the durable source of truth. CLI semantic mutations preserve metadata, structured-section boundaries, deterministic serialization, locking, rollback, and Git ownership.
- Fresh initialization, migration, and runtime defaults remain distinct. Reinitialization preserves existing configuration unless an explicit override applies.
- Task edits retain full replacement versus incremental semantics, dependency validation, protected marker/fence handling, and checklist/comment safety.
- Async consumers capture a session/generation and revalidate after awaits. Store disposal and allocation reinitialization races have regression coverage.
- Ordinal-only task edits preserve `updatedDate`; substantive changes advance it. Status callback failure output and debug success output remain intact.
- Source-mode detached Workspace workers and executable test fixtures resolve `src/cli/index.ts`; compiled workers invoke the compiled executable directly.
- CLI, browser, TUI, and MCP express one model; the CLI remains canonical and MCP is a composed optional adapter.
- Existing HTTP coercion and full-replacement behavior is preserved. Tightening it needs a product decision: port strings and falsy zero, `"false"` Boolean coercion, permissive `parseInt`, and dropped non-string IDs are compatibility questions, not incidental cleanup.

## Verification

Integrated commands passed:

- `bunx tsc --noEmit`
- `bunx biome check .` (802 files, including TSX)
- `bun run build`
- `bun scripts/smoke-compiled-build.ts dist/backlog 1.53.0`
- targeted `git diff --check`

Scoped regression evidence, not an aggregate or full-suite claim:

- CLI: 153 passed, 1 skipped.
- Browser: 120 passed.
- Core: 64; corpus: 10; reorder: 16; status callbacks: 11; atomic/vacated/init: 33.
- MCP: 41.
- Autocommit/watch: 19.
- Malformed dependencies, markers, and ranges: 38.
- Content/filesystem: 126.

The analyzer report `back708-final-runtime-verified-20260930.json` reports zero enabled check issues, one 12-line delegation-signature clone group, and 319 health findings across 801 analyzed files: 28 structural and 291 estimated-CRAP-only. `refactoring-findings.json` contains individual source-backed explanations for every health finding and the intentional Core milestone-facade signature clone. The health gate still reports failure; completion uses the task's explicit resolved-or-individually-explained criterion.

Analyzer configuration is unchanged: no thresholds, suppressions, or baselines were altered. Type-aware analysis is partial; architecture boundaries and policies are not configured checks. Estimated CRAP uses static estimated coverage and is not execution coverage.

## Review Boundaries

- Do not claim real-provider Workspace terminal acceptance; it belongs to `BACK-707.3`.
- Do not add scoped counts together or represent them as a full-suite pass.
- Do not treat internal TypeScript exports as public compatibility surface. Preserve documented CLI, MCP, configuration, and instruction contracts.
