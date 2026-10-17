# Engineering Conventions

This document owns repeatable coding, organization, and verification practices. [BLUEPRINT](BLUEPRINT.md) owns structural constraints and interfaces; [SPEC](SPEC.md) and its linked [specs](specs/) own behavior; [PRODUCT](PRODUCT.md) owns scope. [ADRs](adr/README.md) record approved technical decisions and their rationale. [AGENTS](../AGENTS.md) owns contributor workflow and runnable-handoff requirements.

## General Principles

- Apply approved contracts even where existing code differs. Record implementation discrepancies as alignment issues; do not treat an implementation habit as a requirement or weaken a convention to match it.
- Preserve unrelated user work and limit changes to the requirements of the task.

## Naming and Organization

Use TypeScript naming patterns established in `src/`.

| Element | Convention | Example |
|---|---|---|
| Files | kebab-case source filenames | `task-store.ts` |
| Classes / Types | PascalCase | `TaskStore` |
| Functions / Methods | camelCase | `readTaskFile` |
| Variables | camelCase | `taskFile` |
| Constants | UPPER_SNAKE_CASE for shared constants | `TASK_FILE_READ_CONCURRENCY` |
| Tests | `*.test.ts` | `task-store.test.ts` |

## Code Structure

- Use the repository's strict TypeScript settings in [tsconfig.json](../tsconfig.json), including checked indexed access, explicit overrides, and unused-symbol checks. Use type-only imports when only a type is needed.
- Let [biome.json](../biome.json) define formatting and lint rules: tabs, 120-column formatting, double-quoted JavaScript strings, and organized imports. Do not maintain a second style configuration in prose.
- Put changes with the owning feature/module and reuse its existing types and helpers. Keep code in the owning feature or domain directory under `src/`; keep focused tests beside the implementation and shared test helpers under `src/test/`.
- Follow [BLUEPRINT](BLUEPRINT.md) for provider isolation, rendering and orchestration boundaries, dependency direction, interface ownership, module boundaries, and public interfaces.

## Error Handling

- **Expected failures:** Follow [SPEC](SPEC.md) for failure and recovery outcomes; report committed and incomplete effects accurately, and do not report a committed operation as rolled back.
- **Unexpected failures:** Catch errors where cleanup or useful context is required; avoid catch-and-rethrow that adds neither.
- **Propagation:** Preserve the primary failure and expose cleanup/release failures. Follow [BLUEPRINT](BLUEPRINT.md) for operation completion and concurrency contracts.
- **Cleanup:** Ignore only explicitly best-effort cleanup, such as an already-absent temporary resource. Follow [BLUEPRINT](BLUEPRINT.md) for cleanup ordering.

## Asynchronous Operations

- Await asynchronous work and ensure owned processes/resources are cleaned up on success, failure, and timeout. Tests that spawn processes must stop children and await exit ([test procedure](../AGENTS.md#running-tests)).
- Follow [BLUEPRINT](BLUEPRINT.md) for concurrency and cleanup ordering. Timeout handling is operation-specific; there is no repository-wide cancellation or timeout convention, so follow the owning operation contract.

## Testing

- **Organization:** Use Bun 1.4 or newer, following the CI pin and exact test invocation in [AGENTS](../AGENTS.md#running-tests). Run affected test files during iteration rather than the full suite by default. Keep focused behavior tests beside their owner; shared fixtures and CLI helpers live in `src/test/`.
- **Test boundaries:** Prefer real domain/store behavior with controlled external/provider boundaries. A passing double proves only the behavior exercised, not live-provider acceptance. Keep end-to-end coverage to a few basic user flows and assert observable results. Ordinary CLI behavior tests use the in-process CLI entry; spawn processes only for genuine process-boundary cases; direct service tests stay direct. Use source-based CLI tests for behavior and reserve compiled-binary checks for actual packaging/runtime verification.
- **Isolation:** [bunfig.toml](../bunfig.toml) selects the shared test preload, which owns run-scoped `TMPDIR`, clears workspace-pinning environment variables, and assigns a unique `AGENTIC_WORKSPACE_TMUX_SOCKET`. Reuse this isolation rather than adding another process supervisor or global cleanup layer. Use the isolated tmux test helper and owned resources; never a developer/default socket, bare `tmux kill-server`, or broad default-server process discovery. Serialize in-process `runCli` cases that mutate process globals.
- **Determinism:** Use reliable synchronization rather than timing assumptions. Tests that spawn processes own cleanup on success, failure, and timeout: stop children and await exit. For viewer/watch behavior, assert that an external edit becomes visible; test same-size/same-mtime detection at unit level. Do not require periodic rechecks or promise recovery from a missed notification.
- **Coverage:** Cover observable behavior and relevant failure paths at the owning test boundary. Retain the approved small compiled-binary check. Distinguish inspection, source tests, type checks, and live-runtime evidence in reports; re-measure baselines rather than copying historical diagnostic counts.

## Dependencies

- Reuse existing project utilities and dependencies before adding another package. Add runtime packages to `dependencies` and development-only tooling to `devDependencies` in [package.json](../package.json).
- Keep [bun.lock](../bun.lock) and, when changed, generated `bun.nix` aligned. When `bun.lock` changes, regenerate `bun.nix` with the pinned `update-nix` package script. Technology decisions belong in [ADRs](adr/README.md).
- Install dependencies with `bun install`; use the source entry through package scripts during development.

## Changes and Refactoring

- Keep record validation, serialization, callers, and fixtures aligned with an interface change.
- Pruning stale worktree registrations must not discard worktree contents, branches, or uncommitted data. Prune only registrations proven stale; preserve and report any worktree containing work.
- Persist information only for an essential product or recovery need; do not persist redundant historical state. Fix application-produced corruption at its source; do not add automatic repair.
- Follow [SPEC](SPEC.md): remove superseded behavior and its callers/fixtures rather than retaining aliases, legacy readers, fallback paths, or compatibility projections. If stored-data preservation or ownership is unresolved, escalate it; a bounded assignment does not authorize a compatibility route or automatic conversion.
- For breaking stored-data changes during development, use manual correction only with explicit data-preservation authorization. Do not add permanent migration or legacy-compatibility support.
- The application ships no migration tooling; refusal messages for incompatible stored data give manual conversion guidance.

## Tooling and Validation

| Tool / Command | Purpose | Configuration |
|---|---|---|
| `bun run check` | Configured formatting and lint checks | [package.json](../package.json), [biome.json](../biome.json) |
| `bun run check:types` | Type checking | [package.json](../package.json), [tsconfig.json](../tsconfig.json) |
| `bun test <affected-test-file> --timeout=10000` | Run affected tests with the documented timeout | [package.json](../package.json), [AGENTS](../AGENTS.md#running-tests) |
| `bun run build` | Build the executable | [package.json](../package.json) |
| `nix build .#agentic-workspace` | Validate Nix packaging | [package.json](../package.json), [flake.nix](../flake.nix) |

- Use the package scripts as the command inventory for formatting, linting, type checking, tests, build, source CLI, and Nix regeneration. Check the script before using it: `format` and `lint` write changes; `check` is a check.
- Use the affected-test procedure for behavior verification; formatting/lint and type checks provide different evidence.
- The main integrator rebuilds after code integration and verifies source freshness before an installed-CLI handoff, using the [procedure in AGENTS](../AGENTS.md#rebuild-before-a-runnable-handoff). Source tests do not refresh the installed binary. Documentation-only changes need content/link validation, not a build.
- Check installed executable capabilities using its own help, as required by [AGENTS](../AGENTS.md).
- Validate Nix packaging with `nix build .#agentic-workspace` and the resulting CLI's `--version`; packaging-specific smoke checks belong with the package definition.

## Documentation Maintenance

- Keep project documentation in `docs/`, with conventional root entry points. Link to code-owned command lists, schemas, and declarations instead of copying them.
- Update the owning contract when an accepted decision changes its claims. Code drift is an alignment issue; it does not silently amend SPEC, BLUEPRINT, or these conventions. Follow the [documentation map](README.md) for ownership; feature behavior belongs in SPEC and its linked [specs](specs/) contracts.
- Keep [AGENTS](../AGENTS.md) as a stable documentation/workflow entry point; product and design rules belong in their owning docs, not duplicated in AGENTS.
- ADRs preserve significant rationale and trade-offs. Record a new decision when superseding an accepted one; do not rewrite an accepted historical decision or fabricate one from current code.
- Before retiring a document, fully consolidate unique content and verify references. Keep unresolved material and safety gates in the owning contracts. Keep mutable progress, old test counts, and incident narratives out of core contracts.
