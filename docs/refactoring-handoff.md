# Backlog.md Refactoring Handoff

## Current State

`BACK-708` refactoring and its source-backed findings review are complete. Keep the uncommitted baseline intact; no commits are requested. Preserve `.envrc` and do not read secrets. `BACK-707.3` remains open because real-provider Workspace terminal acceptance has not been run.

## Where Changes Belong

| Need | Start here |
| --- | --- |
| Register or change a CLI task command | `src/cli/features/tasks/register.ts` and task policies; keep runtime and read-output concerns in `src/cli/`. |
| Read or mutate project state | `src/core/backlog.ts` for composition and `src/core/*-service.ts` or `*-workflow.ts` for the concrete transaction. `ProjectSession` owns project lifetime; read, mutation, lifecycle, and shared-commit workflows remain distinct. |
| Update files or publish content changes | `src/file-system/`; retain content-mutation, lock, atomic-write, and subscription ownership. |
| Change task comments or checklists | `src/markdown/comments.ts` or `checklists.ts`; use scanner/ranges for protected Markdown. |
| Change terminal UI state | `src/ui/` sessions first; keep screen/widget code as adapters. |
| Change browser data, routes, modals, milestones, forms, or initialization | `src/web/hooks/`, `components/`, and `features/`; route/modal sessions establish lifecycle identity. |
| Add an HTTP route | `src/server/resources/`, composed by `app.ts`; retain Elysia app, host, task collection, and WebSocket boundaries. |
| Add MCP capability | `src/mcp/tools/` or `resources/`, composed by `McpServer`; do not make MCP the product model. |

## Operating Contracts

- Markdown is authoritative. Use CLI semantic mutations for Backlog records, not direct task-file edits.
- Preserve replacement versus incremental updates, structured Markdown boundaries, locking, rollback, deterministic serialization, and Git transaction ownership.
- Capture project/session identity before asynchronous work and reject stale completions. Disposal and allocation reinitialization are tested contracts.
- Preserve `updatedDate` on ordinal-only edits and update it for substantive changes; retain status callback failure output and debug success output.
- Resolve source-mode worker and test launchers through `src/cli/index.ts`; retain the compiled executable fallback.
- Keep CLI behavior canonical. Browser, TUI, HTTP, and MCP adapt the same model.
- Preserve the existing HTTP full-replacement and coercion behavior. Any validation tightening needs a product decision covering port strings/falsy zero, `Boolean("false")`, partial `parseInt`, and non-string IDs.

## Verified Evidence

Passed integrated commands: `bunx tsc --noEmit`, `bunx biome check .` (802 files including TSX), `bun run build`, `bun scripts/smoke-compiled-build.ts dist/backlog 1.53.0`, and targeted `git diff --check`.

Passed scoped suites: CLI 153 with 1 skip; browser 120; Core 64; corpus 10; reorder 16; status callbacks 11; atomic/vacated/init 33; MCP 41; autocommit/watch 19; malformed dependencies/markers/ranges 38; content/filesystem 126. These batches overlap; do not sum them or claim a full-suite pass.

The final report `back708-final-runtime-verified-20260930.json` has zero enabled check issues, one 12-line Core milestone-facade signature clone, and 319 health findings across 801 files (28 structural, 291 CRAP-only). The findings ledger explains all individually; the health gate remains failing. Configuration is unchanged: no threshold, baseline, or suppression adjustment. Type-aware evidence is partial; boundary and policy checks are not configured; estimated CRAP is static estimation, not measured coverage.

## Remaining Decisions

- Real-provider Workspace terminal acceptance belongs to `BACK-707.3`; synthetic worker/session tests do not establish it.
- HTTP validation tightening requires a separate contract decision described above.
- Leave the baseline uncommitted until explicitly requested.
