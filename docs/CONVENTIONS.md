# Engineering Conventions

This document owns repeatable coding, organization, and verification practices. [BLUEPRINT](BLUEPRINT.md) owns structural constraints and boundaries; [SPEC](SPEC.md) and its linked [specs](specs/) own behavior; [PRODUCT](PRODUCT.md) owns scope. [ADRs](adr/README.md) record approved technical decisions and their rationale. [AGENTS](../AGENTS.md) owns contributor workflow and runnable-handoff requirements.

## Naming

- **Files:** Use kebab-case source filenames, such as `task-store.ts`.
- **Types and Classes:** Use PascalCase, such as `TaskStore`.
- **Functions and Methods:** Use camelCase, such as `readTaskFile`.
- **Variables and Constants:** Use camelCase for variables and UPPER_SNAKE_CASE for shared constants.
- **Interfaces:** Follow TypeScript naming patterns established in `src/`.
- Use the repository's naming patterns established in `src/` for other elements.
- Tests use `*.test.ts` filenames, such as `task-store.test.ts`.

## Code Organization

- Apply approved contracts even where existing code differs. Record implementation discrepancies as alignment issues; do not treat an implementation habit as a requirement or weaken a convention to match it.
- Use the repository's strict TypeScript settings in [tsconfig.json](../tsconfig.json), including checked indexed access, explicit overrides, and unused-symbol checks. Use type-only imports when only a type is needed.
- Let [biome.json](../biome.json) define formatting and lint rules; do not maintain a second style configuration in prose.
- Put changes with the owning feature/module and reuse its existing types and helpers. Keep code in the owning feature or domain directory under `src/`; keep focused tests beside the implementation and shared test helpers under `src/test/`.
- Follow [BLUEPRINT](BLUEPRINT.md) for provider isolation, rendering and orchestration boundaries, dependency direction, boundary ownership, module boundaries, and public contracts.

## Error Handling

- **Unrecoverable; application unusable:** Terminate the application.
- **Unrecoverable; error can be displayed:** Do not continue; display the error.
- **Completed side effects must be undone:** Roll back those actions, then display the error.
- **Soft failure; no important step affected:** Continue remaining steps and surface a warning.
- Every failure path maps to one of these four outcomes; do not invent feature-specific error handling.
- Feature contracts state only feature-specific consequences (what is rolled back or what the user must do) and refer here for generic error behavior.
- **Expected failures:** Follow [SPEC](SPEC.md) for failure and recovery outcomes; report committed and incomplete effects accurately, and do not report a committed operation as rolled back.
- **Unexpected failures:** Catch errors where cleanup or useful context is required; avoid catch-and-rethrow that adds neither.
- **Propagation:** Preserve the primary failure and expose cleanup/release failures. Follow [BLUEPRINT](BLUEPRINT.md) for operation completion and concurrency contracts.
- **Cleanup:** Ignore only explicitly best-effort cleanup, such as an already-absent temporary resource. Follow [BLUEPRINT](BLUEPRINT.md) for cleanup ordering.

## Asynchronous and Concurrent Code

- Await asynchronous work and ensure owned processes/resources are cleaned up on success, failure, and timeout. Tests that spawn processes must stop children and await exit ([test procedure](../AGENTS.md#running-tests)).
- Follow [BLUEPRINT](BLUEPRINT.md) for concurrency and cleanup ordering. Timeout handling is operation-specific; there is no repository-wide cancellation or timeout convention, so follow the owning operation contract.

## Testing

- **Organization:** Use Bun 1.4 or newer, following the CI pin and exact test invocation in [AGENTS](../AGENTS.md#running-tests). Run affected test files during iteration rather than the full suite by default. Keep focused behavior tests beside their owner; shared fixtures and CLI helpers live in `src/test/`.
- **Test boundaries:** Prefer real domain/store behavior with controlled external/provider boundaries. A passing double proves only the behavior exercised, not live-provider acceptance. Keep end-to-end coverage to a few basic user flows and assert observable results. Ordinary CLI behavior tests use the in-process CLI entry; spawn processes only for genuine process-boundary cases; direct service tests stay direct. Use source-based CLI tests for behavior and reserve compiled-binary checks for actual packaging/runtime verification.
- **Isolation:** [bunfig.toml](../bunfig.toml) selects the shared test preload, which owns run-scoped `TMPDIR`, clears workspace-pinning environment variables, and assigns a unique `AGENTIC_WORKSPACE_TMUX_SOCKET`. Reuse this isolation rather than adding another process supervisor or global cleanup layer. Use the isolated tmux test helper and owned resources; never a developer/default socket, bare `tmux kill-server`, or broad default-server process discovery. Serialize in-process `runCli` cases that mutate process globals.
- **Determinism:** Use reliable synchronization rather than timing assumptions. Tests that spawn processes own cleanup on success, failure, and timeout: stop children and await exit. For viewer/watch behavior, assert that an external edit becomes visible; test same-size/same-mtime detection at unit level. Do not require periodic rechecks or promise recovery from a missed notification.
- **Coverage:** Cover observable behavior and relevant failure paths at the owning test boundary. Retain the approved small compiled-binary check. Distinguish inspection, source tests, type checks, and live-runtime evidence in reports; re-measure baselines rather than copying historical diagnostic counts.

## Dependencies

- **Implementation facts, not technology decisions:** The current toolchain uses Bun 1.4+, TypeScript, and `@opentui/core`; project data is filesystem-backed. These are repository implementation facts, not approved technology decisions.
- Reuse existing project utilities and dependencies before adding another package. Add runtime packages to `dependencies` and development-only tooling to `devDependencies` in [package.json](../package.json).
- Keep [bun.lock](../bun.lock) and, when changed, generated `bun.nix` aligned. When `bun.lock` changes, regenerate `bun.nix` with the pinned `update-nix` package script. Technology decisions belong in [ADRs](adr/README.md).
- Install dependencies with `bun install`; use the source entry through package scripts during development.

## Maintainability

- Preserve unrelated user work and limit changes to the requirements of the task.
- Keep project documentation in `docs/`, with conventional root entry points. Link to code-owned command lists, schemas, and declarations instead of copying them.
- Update the owning contract when an accepted decision changes its claims. Code drift is an alignment issue; it does not silently amend SPEC, BLUEPRINT, or these conventions. Follow the [documentation map](README.md) for ownership; feature behavior belongs in SPEC and its linked [specs](specs/) contracts.
- Keep [AGENTS](../AGENTS.md) as a stable documentation/workflow entry point; product and design rules belong in their owning docs, not duplicated in AGENTS.
- ADRs preserve significant rationale and trade-offs. Record a new decision when superseding an accepted one; do not rewrite an accepted historical decision or fabricate one from current code.
- Before retiring a document, fully consolidate unique content and verify references. Keep unresolved material and safety gates in the owning contracts. Keep mutable progress, old test counts, and incident narratives out of core contracts.

### Changes and Refactoring

- Define each persisted record's shape and validation once in a schema beside its codec; map schema failures to the public error contract. Do not add per-field decoders or validators.
- Keep record validation, serialization, callers, and fixtures aligned with an interface change.
- Pruning stale worktree registrations must not discard worktree contents, branches, or uncommitted data. Prune only registrations proven stale; preserve and report any worktree containing work.
- Persist information only for an essential product or recovery need; do not persist redundant historical state. Fix application-produced corruption at its source; do not add automatic repair.
- Follow [SPEC](SPEC.md): remove superseded behavior and its callers/fixtures rather than retaining aliases or fallback paths. If stored-data preservation or ownership is unresolved, escalate it; a bounded assignment does not authorize a compatibility route.
- For breaking stored-data changes during development, use manual correction only with explicit data-preservation authorization.

## Validation

- **Formatting:** Use the formatter configured by [biome.json](../biome.json) through the package scripts in [package.json](../package.json).
- **Linting:** Use the linter configured by [biome.json](../biome.json) through the package scripts in [package.json](../package.json).
- **Type Checking:** Run `bun run check:types` using [tsconfig.json](../tsconfig.json).
- **Tests:** Run `bun test <affected-test-file> --timeout=10000` following [AGENTS](../AGENTS.md#running-tests); `bun run test` runs the full suite.
- **Build:** Run `bun run build` to build the executable.
- Use the package scripts as the command inventory for formatting, linting, type checking, tests, build, source CLI, and Nix regeneration. Check the script before using it: `format` and `lint` write changes; `check` is a check.
- Use the affected-test procedure for behavior verification; formatting/lint and type checks provide different evidence.
- The main integrator rebuilds after code integration and verifies source freshness before an installed-CLI handoff, using the [procedure in AGENTS](../AGENTS.md#rebuild-before-a-runnable-handoff). Source tests do not refresh the installed binary. Documentation-only changes need content/link validation, not a build.
- Check installed executable capabilities using its own help, as required by [AGENTS](../AGENTS.md).
- Validate Nix packaging with `nix build .#agentic-workspace` and the resulting CLI's `--version`; packaging-specific smoke checks belong with the package definition.
