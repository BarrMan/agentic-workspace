---
consolidation:
  total: 66
  counts:
    exists: 11
    discard: 27
    integrate: 17
    unconfirmed: 11
  percentages:
    exists: 16.67%
    discard: 40.91%
    integrate: 25.76%
    unconfirmed: 16.67%
---
# Backlog.md Refactoring Review

> **Non-authoritative supporting material.** This file is not a contract. Authoritative owner(s): [CONVENTIONS](CONVENTIONS.md), [BLUEPRINT](BLUEPRINT.md), [application boundaries](architecture/application-boundaries.md), [tasks](specs/tasks.md), [supported integration operations](specs/supported-integration-operations.md), [configuration](specs/configuration.md).
> Disposition: Mixed — see markers.

## Status

`BACK-708` implementation and its source-backed findings review are complete. The refactoring baseline is intentionally uncommitted; do not reset or clean it, and commit only when requested. Preserve `.envrc` without reading secrets. `BACK-707.3` real-provider Workspace acceptance remains unverified and separate. <!-- consolidation: discard; ref: none; reason: Historical BACK-708 completion report. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#general-principles; reason: Preserve unrelated uncommitted baseline work. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Explicit request required before commits. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#general-principles; reason: Preserve secret-bearing local files without reading secrets. --> <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#testing; reason: Dated handoff does not establish current real-provider acceptance. -->

## Architecture Entry Map

| Area | Owner | Contract |
| --- | --- | --- |
| CLI | `src/cli/` | `index.ts` starts the CLI; feature registrars define command families, task policies define task command behavior, and runtime/read-output own project-root and output-mode concerns. <!-- consolidation: discard; ref: none; reason: Historical implementation entry map. --> |
| Core | `src/core/backlog.ts` and workflow services | `ProjectSession` owns project-bound state, readiness, disposal, and reinitialization. Core composes read, creation, mutation, lifecycle, content, and shared-commit workflows. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#application-controller; reason: Project-bound readiness disposal and reinitialization ownership is missing and differs from agent Session lifetime. --> <!-- consolidation: exists; ref: docs/BLUEPRINT.md#component-contracts; reason: Application composition coordinates distinct shared workflows. --> |
| Filesystem content | `src/file-system/` | Layout, task, content repositories, and locks own persistence. Awaited mutation subscriptions publish successful writes with captured root identity; ContentStore unsubscribes on disposal. <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#stores-and-repositories; reason: Repositories own locked persistence. --> <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#stores-and-repositories; reason: Content-write subscriptions require awaited publication with captured project identity. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#error-handling; reason: Disposed subscription owners must unsubscribe even when the old ContentStore implementation is retired. --> |
| Markdown | `src/markdown/` | Scanner/ranges protect structured regions; comments and checklists own their canonical markup. Structural callers retain section placement. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#stores-and-repositories; reason: Codec protection of structured markup and section placement is missing. --> |
| TUI | `src/ui/` | Board, viewer, and unified sessions own selection, pending-write, and teardown lifetimes; controllers remain widget adapters. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Preserve UI-owned pending-write settlement and teardown lifetime without confusing these sessions with agent conversations. --> <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: UI presentation ownership remains separate from domain mutation and execution lifetime. --> |
| Browser | `src/web/` | App data and route/modal sessions own refresh and route identity; features own initialization, milestone, form, and modal concerns. <!-- consolidation: unconfirmed; ref: docs/SPEC.md#feature-contracts; reason: Browser retention and route/modal architecture applicability need disposition. --> |
| Server | `src/server/` | Elysia app composition, resource plugins, task collection, host lifecycle, and WebSocket publication are separate owners. <!-- consolidation: unconfirmed; ref: docs/adr/README.md#active-decisions; reason: Historical server decomposition is not approval of Elysia or retained HTTP scope. --> |
| MCP | `src/mcp/` | `McpServer` composes a Core application; root activation and tools/resources remain MCP adapter concerns. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#component-ownership; reason: Retained integration adapters compose shared application operations. --> |

## Preserved Contracts

- Markdown remains the durable source of truth. CLI semantic mutations preserve metadata, structured-section boundaries, deterministic serialization, locking, rollback, and Git ownership. <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#stores-and-repositories; reason: Explicit authoritative Markdown representation and protected deterministic edits are missing. --> <!-- consolidation: exists; ref: docs/BLUEPRINT.md#authoritative-mutation-and-publication; reason: Locked fresh mutations preserve unrelated fields. --> <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#task-deletion; reason: Blanket rollback assertion needs operation-specific scope. --> <!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#application-controller; reason: Git effects have infrastructure ownership. -->
- Fresh initialization, migration, and runtime defaults remain distinct. Reinitialization preserves existing configuration unless an explicit override applies. <!-- consolidation: discard; ref: none; reason: Legacy migration preservation is superseded. --> <!-- consolidation: integrate; ref: docs/specs/configuration.md#configuration-and-modes; reason: Initialization defaults must remain distinct from runtime defaults. --> <!-- consolidation: integrate; ref: docs/specs/configuration.md#configuration-and-modes; reason: Reinitialization must preserve existing configuration absent explicit overrides. -->
- Task edits retain full replacement versus incremental semantics, dependency validation, protected marker/fence handling, and checklist/comment safety. <!-- consolidation: integrate; ref: docs/specs/tasks.md#tasks-and-storage; reason: Replacement versus incremental edit semantics and dependency validation are missing. --> <!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#stores-and-repositories; reason: Protected fences and markers plus safe checklist/comment editing are missing. -->
- Async consumers capture a session/generation and revalidate after awaits. Store disposal and allocation reinitialization races have regression coverage. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#application-controller-and-stores; reason: Async effects reject stale identity and execution origins. --> <!-- consolidation: discard; ref: none; reason: Historical regression-coverage report. -->
- Ordinal-only task edits preserve `updatedDate`; substantive changes advance it. Status callback failure output and debug success output remain intact. <!-- consolidation: integrate; ref: docs/specs/tasks.md#tasks-and-storage; reason: Timestamp distinction for ordinal-only edits is missing. --> <!-- consolidation: integrate; ref: docs/specs/session-interaction-and-feedback.md#session-interaction-and-feedback; reason: Task status callback failure and debug success feedback need preservation. -->
- Source-mode detached Workspace workers and executable test fixtures resolve `src/cli/index.ts`; compiled workers invoke the compiled executable directly. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Source versus compiled worker launcher selection is missing. -->
- CLI, browser, TUI, and MCP express one model; the CLI remains canonical and MCP is a composed optional adapter. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#component-ownership; reason: Supported adapters use shared application and model owners. --> <!-- consolidation: discard; ref: docs/SPEC.md#feature-contracts; reason: CLI-canonical framing replaced by TUI-first selective API. --> <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: MCP retention remains undecided. -->
- Existing HTTP coercion and full-replacement behavior is preserved. Tightening it needs a product decision: port strings and falsy zero, `"false"` Boolean coercion, permissive `parseInt`, and dropped non-string IDs are compatibility questions, not incidental cleanup. <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: HTTP full-replacement retention needs scope disposition. --> <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Port strings and falsy-zero validation policy is unanswered. --> <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: False-string Boolean coercion policy is unanswered. --> <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Permissive integer parsing policy is unanswered. --> <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Dropped non-string ID policy is unanswered. -->

## Verification

Integrated commands passed:

- `bunx tsc --noEmit` <!-- consolidation: discard; ref: none; reason: Historical type-check result. -->
- `bunx biome check .` (802 files, including TSX) <!-- consolidation: discard; ref: none; reason: Historical formatter result. -->
- `bun run build` <!-- consolidation: discard; ref: none; reason: Historical build result. -->
- `bun scripts/smoke-compiled-build.ts dist/backlog 1.53.0` <!-- consolidation: discard; ref: none; reason: Historical packaging smoke result. -->
- targeted `git diff --check` <!-- consolidation: discard; ref: none; reason: Historical whitespace result. -->

Scoped regression evidence, not an aggregate or full-suite claim:

- CLI: 153 passed, 1 skipped. <!-- consolidation: discard; ref: none; reason: Historical scoped result. -->
- Browser: 120 passed. <!-- consolidation: discard; ref: none; reason: Historical scoped result. -->
- Core: 64; corpus: 10; reorder: 16; status callbacks: 11; atomic/vacated/init: 33. <!-- consolidation: discard; ref: none; reason: Historical Core result. --> <!-- consolidation: discard; ref: none; reason: Historical corpus result. --> <!-- consolidation: discard; ref: none; reason: Historical reorder result. --> <!-- consolidation: discard; ref: none; reason: Historical status-callback result. --> <!-- consolidation: discard; ref: none; reason: Historical atomic/vacated/init batch. -->
- MCP: 41. <!-- consolidation: discard; ref: none; reason: Historical scoped result. -->
- Autocommit/watch: 19. <!-- consolidation: discard; ref: none; reason: Historical scoped result. -->
- Malformed dependencies, markers, and ranges: 38. <!-- consolidation: discard; ref: none; reason: Historical scoped result. -->
- Content/filesystem: 126. <!-- consolidation: discard; ref: none; reason: Historical scoped result. -->

The analyzer report `back708-final-runtime-verified-20260930.json` reports zero enabled check issues, one 12-line delegation-signature clone group, and 319 health findings across 801 analyzed files: 28 structural and 291 estimated-CRAP-only. `refactoring-findings.json` contains individual source-backed explanations for every health finding and the intentional Core milestone-facade signature clone. The health gate still reports failure; completion uses the task's explicit resolved-or-individually-explained criterion. <!-- consolidation: discard; ref: none; reason: Historical analyzer counts. --> <!-- consolidation: discard; ref: none; reason: Historical findings-ledger coverage report. --> <!-- consolidation: discard; ref: none; reason: Task-specific completion criterion and failing health-gate status. -->

Analyzer configuration is unchanged: no thresholds, suppressions, or baselines were altered. Type-aware analysis is partial; architecture boundaries and policies are not configured checks. Estimated CRAP uses static estimated coverage and is not execution coverage. <!-- consolidation: discard; ref: none; reason: Historical unchanged analyzer configuration. --> <!-- consolidation: discard; ref: none; reason: Historical analysis coverage limitations. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#testing; reason: Static coverage estimates must not be represented as executed coverage. -->

## Review Boundaries

- Do not claim real-provider Workspace terminal acceptance; it belongs to `BACK-707.3`. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#testing; reason: Non-live evidence cannot establish live-provider acceptance. --> <!-- consolidation: discard; ref: none; reason: Historical acceptance task assignment. -->
- Do not add scoped counts together or represent them as a full-suite pass. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#testing; reason: Explicit overlapping-count and whole-suite reporting rule is missing. -->
- Do not treat internal TypeScript exports as public compatibility surface. Preserve documented CLI, MCP, configuration, and instruction contracts. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#component-contracts; reason: Internal operations do not automatically constitute public API. --> <!-- consolidation: unconfirmed; ref: none; reason: Current approved supported contracts apply across surfaces. -->
