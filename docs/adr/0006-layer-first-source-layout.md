# ADR-0006: Layer-first source layout

**Status:** Accepted
**Date:** 2026-10-19
**Supersedes:** None

## Purpose

Map the component ownership in [BLUEPRINT](../BLUEPRINT.md) to the source tree so a change lands with its owner. The tree had grown by historical accident: task identity, readiness, persistence, and runtime code sat in shared utility and feature directories with no dependency direction, and custom errors lived wherever their first caller happened to be.

## Blueprint Mapping

**Components:** Models, Storage, Controller, SessionRuntime, Renderer, CLI.

**Contracts:** [Component ownership](../BLUEPRINT.md#component-ownership) and the [repository layout](../BLUEPRINT.md#repository-layout).

## Decision

**Selected Technology:** Layer-first directories under `src/`: `model/`, `storage/`, `filesystem/`, `controller/`, `runtime/`, `renderer/`, `cli/`, `lib/`, and `test/`.

**Role:** Each top-level directory is the code home of one component. Within a layer, directories group related owners (`model/task/`, `model/session/`, `storage/markdown/`, `runtime/agents/`, `runtime/live/`). `filesystem/` is the substrate Storage owns; it is not a second persistence owner. `lib/` holds only domain-free helpers. Custom errors live in the `errors/` subdirectory of the owning layer.

### Behavior placement

- A model owns its rules. Task identity comparison, record equality, and readiness are Task operations; callers do not re-implement them or route them through a controller.
- Readiness is corpus-wide, so `Task.ready(graph)` takes the graph built by the caller rather than reading other records itself.
- Persistence codecs, repositories, locks, and watchers stay in `storage/` or `filesystem/`; application workflows stay in `controller/`; provider mechanics stay in `runtime/`.

## Alternatives

### Keep the flat tree

Rejected: it leaves domain rules and storage mechanics in shared utility directories, which makes ownership and dependency direction invisible.

### Group by feature domain only

Rejected: `task/`, `session/`, and `workspace/` feature roots would mix model, storage, controller, and renderer code in each tree, and the same layering question would reappear inside every feature.

### Keep central `utils/` alongside layers

Rejected: a catch-all utility directory is where ownership goes to die; it becomes the default destination for code that has a real owner.

## Rationale

The component table already defines the dependency direction. Using the same names for directories makes every import path state its owner and makes a misplacement visible in review. It also gives the existing model-owned-behavior decision ([ADR-0001](0001-model-owned-domain-behavior.md)) a physical home instead of leaving behavior in utilities.

## Consequences

**Benefits**
- A change's layer and owner are visible from its path.
- Domain behavior, persistence, and runtime mechanics no longer compete inside one directory.
- Test placement follows the same rule: focused tests beside their implementation; shared fixtures and cross-cutting contracts under `src/test/`.

**Trade-offs**
- Import paths change broadly; the migration is mechanical but touching.
- The layer boundary must be maintained deliberately: `lib/` must not accumulate domain helpers, and `controller/` must not absorb storage mechanics.
- Historical references in research and audit documents may name pre-migration paths; the contracts and source are authoritative.

## References

- [BLUEPRINT: Repository Layout](../BLUEPRINT.md#repository-layout) — current tree and rules.
- [BLUEPRINT: Component Ownership](../BLUEPRINT.md#component-ownership) — component responsibilities and dependencies.
- [ADR-0001](0001-model-owned-domain-behavior.md) — model-owned domain behavior.
- [ADR-0002](0002-storage-filesystem-paths-formats.md) — storage substrate and formats.
