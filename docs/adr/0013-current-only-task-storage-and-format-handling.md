# ADR-0013: Current-only task storage and format handling

**Status:** Accepted

**Date:** 2026-10-29

**Supersedes:** [ADR-0010](0010-temporal-due-dates-luxon-display.md#decision), explicit migration of legacy date-format syntax only; [ADR-0002](0002-storage-filesystem-paths-formats.md#formats), malformed-record collection skip/warn provision only

## Purpose

Use current storage formats and surface decoding failures without compatibility conversion or corruption recovery.

## Blueprint Mapping

**Components:** Storage and its shared decoders; Controller collection loading and received-event reconciliation.

**Contracts:** [Storage](../blueprints/storage.md), [Controller](../blueprints/controller.md), [Tasks and storage](../specs/tasks.md), and [Configuration](../specs/configuration.md).

## Decision

**Selected Technology:** Current-only format handling through shared record decoders, with visible failures instead of migration or skip-and-return recovery.

**Role:** Storage accepts current formats and surfaces shared-decoder failures. Collection reads do not suppress malformed records and return partial results as success. Direct-target reads also surface decoding failures.

**Implementation Constraints:**
- Remove legacy conversion, compatibility aliases, and executable migration entry points. The explicit legacy date-format conversion permitted by ADR-0010 is no longer supported. Any future migration requires separate explicit authorization; this decision authorizes no rewrite, rename, relocation, reinterpretation, or deletion of existing data.
- A malformed record causes its decoding failure to surface, including during collection loading. Do not skip it with a warning and report a successful partial collection, substitute a repaired record, or hide corruption behind an empty result.
- Actual temporary `ENOENT` during reconciliation of a received filesystem event is distinct from malformed-record decoding. Handling that event race does not authorize swallowing decoder failures, repairing corruption, or treating missing required resources as optional.
- Retain shared codec validation, security decoding, required persistence reads, and the required-resource versus genuinely optional-file distinction in the owning contracts.

Supersession is limited to the two provisions named above. ADR-0010's native Temporal parsing, written-calendar-day semantics, Luxon date-only formatting, and separately appended timestamp time remain in force. ADR-0002's storage paths, formats, atomic-write and locking strategy, and strict direct-record reads remain in force. [ADR-0011](0011-task-mode-approval-storage.md) continues to own task/mode approval storage and preservation of existing approval data.

## Alternatives

| Alternative | Reason Not Selected |
|---|---|
| Retain explicit legacy-format conversion | Conflicts with approved current-only handling and keeps a superseded executable path. |
| Skip malformed collection records with warnings | Reports partial data as successful loading and conceals the failure rejected by the approved decoding contract. |

## Rationale

One current-format decoding path makes invalid data visible without a parallel compatibility or repair mechanism. A received-event file-absence race is a distinct filesystem condition, not an alternative interpretation of corrupt data.

## Consequences

**Benefits**
- Collection and direct-target decoding failures remain visible through the shared decoder.
- Current-format support has no implicit migration or data-repair authority.

**Trade-offs**
- Malformed records can prevent successful collection loading rather than produce a partial successful result.
- Unsupported existing formats need separately authorized correction; ordinary reads do not convert them.

## References

- [Storage blueprint](../blueprints/storage.md) — decoding, persistence, and received-event handling.
- [Task requirements](../specs/tasks.md) — record failures and required-resource behavior.
- [Configuration requirements](../specs/configuration.md) — current configuration formats.
- [ADR-0002](0002-storage-filesystem-paths-formats.md#formats) and [ADR-0010](0010-temporal-due-dates-luxon-display.md#decision) — preserved historical decisions with the limited supersessions above.
- [Approval disposition](../audits/contract-change-proposals.md#current-only-formats-and-removal-of-migration-support) — non-authoritative approval mapping.
