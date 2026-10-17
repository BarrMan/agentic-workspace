# Architecture Decisions

This directory records the project's approved technology choices and significant architectural decisions. Accepted ADRs are authoritative until superseded or deprecated; together, active ADRs define approved decisions and their rationale. [PRODUCT](../PRODUCT.md) owns scope; [SPEC](../SPEC.md) and [specs/](../specs/) own behavior; [BLUEPRINT](../BLUEPRINT.md) and [architecture/](../architecture/) own logical architecture; [CONVENTIONS](../CONVENTIONS.md) owns engineering practices; [DESIGN-SYSTEM](../DESIGN-SYSTEM.md) and [screens/](../screens/) own screen contracts.

## Active Decisions

| Area | Decision | ADR |
|---|---|---|
| Domain ownership and persistence coordination | Model-owned domain behavior | [ADR-0001](0001-model-owned-domain-behavior.md) |

## Recorded Stack

| Area | Approved choice | ADR |
|---|---|---|
| Domain behavior and persistence coordination | Concrete Task, Session, and application-controller models own domain behavior and coordination; persistence owns locked reload, validation, serialization, and atomic writes. | [ADR-0001](0001-model-owned-domain-behavior.md) |

Technology stack remains under-recorded: the ADRs present specify no language, framework, library, storage engine, or infrastructure choices.

## Decision History

| ADR | Decision | Status | Replaced By |
|---|---|---|---|
| [ADR-0001](0001-model-owned-domain-behavior.md) | Model-owned domain behavior | Accepted | — |
