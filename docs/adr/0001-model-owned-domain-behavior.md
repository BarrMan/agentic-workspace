# ADR-0001: Model-owned domain behavior

**Status:** Accepted  
**Date:** 2026-10-16  
**Supersedes:** None

## Purpose

Establish a clear owner for domain behavior while application coordination sequences effects and durability.

## Blueprint Mapping

**Components:** Task, Session, application controller, and persistence.

**Contracts:** Component ownership and dependency direction; authoritative mutation and publication.

## Context

Domain behavior needs a clear owner while application coordination continues to sequence effects and durability. Merely moving service orchestration behind forwarding methods does not establish meaningful model ownership. A central package mirroring concrete model methods or a phase-driven persistence adapter would create competing definitions or implementations of domain rules.

## Decision

**Selected Technology/Strategy:** Concrete Task, Session, and application-controller models.

**Role:** Task owns task/session relationship rules; Session owns individual conversation/execution behavior; application coordination invokes those owners and sequences admission, external effects, and durability; persistence owns locked reload, validation, serialization, and atomic writes without interpreting domain commands.

**Implementation Constraints:**
- Keep behavioral interfaces at actual interchangeable production boundaries; do not mirror concrete models in a central behavioral contract package or introduce parallel dependency hierarchies solely for tests.
- Hydrate models from current locked state before durable mutations, invoke synchronous model behavior, and serialize the result; keep external startup and arbitrary awaited callbacks outside the store lock, and await required application-composed checkpoints.

Use concrete Task, Session, and application-controller models. Task is the sole implementation of task/session relationship rules; Session owns individual conversation/execution behavior. Application coordination invokes those owners and sequences admission, external effects, and durability. Persistence owns locked reload, validation, serialization, and atomic writes, not a second interpretation of domain commands.

Keep behavioral interfaces at actual interchangeable production boundaries, notably Harness providers. Do not mirror concrete models in a central behavioral contract package or introduce parallel dependency hierarchies solely for tests. Record, launch, event, and rollback-identity data stay with their owning modules.

Durable mutations hydrate the model from current locked state, invoke its synchronous behavior, and serialize the result. External startup and arbitrary awaited callbacks remain outside the store lock; required application-composed checkpoints are awaited. Effective contracts and ordering are owned by [BLUEPRINT](../BLUEPRINT.md).

## Alternatives Considered

### Keep plain records with service/store/process/adapter boundaries

This keeps sequencing and application responsibilities visible, but does not establish meaningful model-owned behavior.

### Central behavioral interfaces and a phase-driven persistence adapter

This centralizes model/controller contracts, but duplicates behavioral definitions and makes persistence an independent interpreter of model behavior.

### Move orchestration behind forwarding model methods

This changes where orchestration appears without giving models meaningful domain behavior; it only renames or hides existing service responsibilities.

## Rationale

Concrete models provide a single owner for domain rules, while application coordination retains responsibility for sequencing admission, external effects, and durability. This avoids the duplicate contracts and competing domain implementations inherent in a central interface package or phase-driven persistence adapter. It also goes beyond plain records and forwarding methods, which leave domain ownership in services or obscure orchestration without transferring behavior. Keeping interfaces only at genuine production variation points avoids a parallel contract hierarchy created solely for tests.

## Consequences

**Benefits**
- Each relationship and lifecycle rule has one owner across supported entry points; equivalent results from duplicate implementations do not satisfy the decision.
- Models remain independent of application locks and persistence infrastructure, while application coordination invokes model behavior at durable boundaries.
- Tests and callers use the actual owner or a genuine provider variation point rather than a parallel contract hierarchy.

**Trade-offs**
- Application coordination must hydrate and call model behavior at durable boundaries rather than delegate domain policy to a storage phase interpreter.
- Short locked mutations and fresh-state publication are needed to preserve concurrent changes. Rollback identity must survive rehydration; an original object's private map cannot be its sole authority.
- Integration must connect every supported caller, not only one migrated slice. Existing identity, cleanup, readiness, and durability safeguards remain obligations.

## References

- [BLUEPRINT: component ownership and dependency direction](../BLUEPRINT.md#component-ownership) — current logical contract.
- [BLUEPRINT: mutation and concurrency boundary](../BLUEPRINT.md#authoritative-mutation-and-publication) — current durable coordination algorithm.
- [SPEC](../SPEC.md) — current product behavior.
