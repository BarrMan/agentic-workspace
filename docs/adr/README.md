# Architecture Decisions

This directory records the project's approved technology choices and significant architectural decisions. Accepted ADRs are authoritative until superseded or deprecated; together, active ADRs define approved decisions and their rationale. [PRODUCT](../PRODUCT.md) owns scope; [SPEC](../SPEC.md) and [specs/](../specs/) own behavior; [BLUEPRINT](../BLUEPRINT.md) and [architecture/](../architecture/) own logical architecture; [CONVENTIONS](../CONVENTIONS.md) owns engineering practices; [DESIGN-SYSTEM](../DESIGN-SYSTEM.md) and [screens/](../screens/) own screen contracts.

## Active Decisions

| Area | Decision | ADR |
|---|---|---|
| Domain ownership and persistence coordination | Model-owned domain behavior | [ADR-0001](0001-model-owned-domain-behavior.md) |

## Recorded Stack

| Area | Recorded choice | Authority and source |
|---|---|---|
| Domain behavior and persistence coordination | Concrete Task, Session, and application-controller models own domain behavior and coordination; persistence owns locked reload, validation, serialization, and atomic writes. | Accepted in [ADR-0001](0001-model-owned-domain-behavior.md) |
| Language | TypeScript, with strict compiler settings. | Implemented/documented repository facts: TypeScript is a development dependency in [package.json](../../package.json); strict TypeScript settings are specified in [CONVENTIONS — Code Organization](../CONVENTIONS.md#code-organization) and [tsconfig.json](../../tsconfig.json). Not an ADR decision. |
| JavaScript tooling and test runtime | Bun 1.4 or newer; dependencies are installed with `bun install`. | Recorded in [CONVENTIONS — Testing](../CONVENTIONS.md#testing) and [Dependencies](../CONVENTIONS.md#dependencies); this is tooling/test-runtime documentation, separate from the application runtime. |
| Application runtime | Bun. | Implemented/documented repository fact: package entry points and scripts use Bun in [package.json](../../package.json), with repository toolchain requirements in [AGENTS](../../AGENTS.md#running-tests). Not an ADR decision. |
| TUI framework | `@opentui/core`. | Implemented repository fact: declared dependency in [package.json](../../package.json). Not an ADR decision. |
| Formatting and linting | Biome. | Recorded in [CONVENTIONS — Validation](../CONVENTIONS.md#validation) |
| Packaging | Nix packaging, validated with `nix build .#agentic-workspace`. | Recorded in [CONVENTIONS — Validation](../CONVENTIONS.md#validation) |
| Durable storage boundary | Filesystem-backed project data; stores and repositories own canonical paths, locked reload, validation, serialization, and atomic durable writes. | Documented boundary in [BLUEPRINT — Component Ownership](../BLUEPRINT.md#component-ownership) and [Application, storage, and UI](../architecture/application-boundaries.md); implementation/documentation fact, not an ADR decision. |

The concrete durable storage engine and record format are not recorded in the ADR inventory or BLUEPRINT.

## Decision History

| ADR | Decision | Status | Replaced By |
|---|---|---|---|
| [ADR-0001](0001-model-owned-domain-behavior.md) | Model-owned domain behavior | Accepted | — |
