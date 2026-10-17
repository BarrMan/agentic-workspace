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
| Language | TypeScript, with strict compiler settings. | Recorded in [CONVENTIONS — Code Organization](../CONVENTIONS.md#code-organization) |
| JavaScript tooling and test runtime | Bun 1.4 or newer; dependencies are installed with `bun install`. This records test/tooling use, not an application-runtime decision. | Recorded in [CONVENTIONS — Testing](../CONVENTIONS.md#testing) and [Dependencies](../CONVENTIONS.md#dependencies) |
| Formatting and linting | Biome. | Recorded in [CONVENTIONS — Validation](../CONVENTIONS.md#validation) |
| Packaging | Nix packaging, validated with `nix build .#agentic-workspace`. | Recorded in [CONVENTIONS — Validation](../CONVENTIONS.md#validation) |
| Durable storage boundary | Filesystem-backed stores and repositories own canonical paths, locked reload, validation, serialization, and atomic durable writes. | Recorded in [BLUEPRINT — Component Ownership](../BLUEPRINT.md#component-ownership) |

The application runtime, TUI framework, and concrete durable storage engine/record format are not specified in either an ADR or BLUEPRINT.

## Decision History

| ADR | Decision | Status | Replaced By |
|---|---|---|---|
| [ADR-0001](0001-model-owned-domain-behavior.md) | Model-owned domain behavior | Accepted | — |
