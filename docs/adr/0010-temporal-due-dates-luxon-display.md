# ADR-0010: Temporal due dates and Luxon date display

**Status:** Accepted  
**Date:** 2026-10-20  
**Supersedes:** [ADR-0008](0008-luxon-date-handling.md), date parsing and validation responsibility only; [ADR-0009](0009-luxon-date-format-tokens.md), timestamp formatting details and migration scope only

## Purpose

Separate strict date/time input parsing from configured display formatting without maintaining a custom date grammar or formatter.

## Decision

- Use the native Temporal API available in Bun 1.4.3 and later for due-date parsing.
- Native Temporal owns strict date/time parsing and validation, using the platform's supported input forms. Do not add a parallel shape, offset-range, or token grammar. The task contract owns due-day interpretation; see [TASK-024](../specs/tasks.md#task-024-due-date-interpretation).
- Preserve the timestamp's written calendar day as the due date. Applying a timestamp's offset must not move that due day. Accept standard offsets supported by Temporal, including `+15:00`; do not impose an application-specific ±14-hour limit.
- Retain Luxon for `date_format`, which is a case-sensitive date-only pattern defaulting to `yyyy-MM-dd`. Render timestamp time separately as fixed `HH:mm`. Configured time tokens are unsupported.
- Do not rewrite configuration or task data on ordinary load. The explicit task/config migration may convert legacy syntax only by exact lookup to supported date-only patterns; report mixed/time-token or unmatched values and leave them unchanged.

## Alternatives

### Luxon for all parsing and display

Rejected: the approved strict parsing behavior and date-only/time-separated display strategy should not be implemented with bespoke constraints around library parsing or custom token handling.

### Custom date-shape, offset, or format-token parser

Rejected: it duplicates date grammar/formatting behavior and creates app-specific rules such as an offset cutoff not required by the owner contract.

## Rationale

Temporal supplies strict date/time parsing and validation using the platform's supported forms; the domain contract, not a prescribed parsing sequence, defines which calendar day a timestamp denotes as a due date. Luxon remains useful for configured date-only patterns. Keeping timestamp time as a separate fixed display component avoids accepting arbitrary mixed date/time format patterns and avoids a custom format parser.

## Consequences

**Benefits**
- Native parsing owns calendar and timestamp validity, including supported standard offsets.
- Due-day semantics remain independent of timestamp offset conversion.
- Configured display formatting remains Luxon-based, with one documented date-only format scope.

**Trade-offs**
- Mixed date/time `date_format` configurations are unsupported and are not automatically rewritten.
- Temporal API/type declaration integration must be verified against the supported Bun and TypeScript environment.

## References

- [Due-date contract](../specs/tasks.md#task-024-due-date-interpretation)
- [Configuration contract](../specs/configuration.md#config-016-date-format-tokens)
- [Engineering Conventions](../CONVENTIONS.md#dependencies)
- [ADR-0008](0008-luxon-date-handling.md) — remaining timestamp and Luxon formatting rationale, with parsing/validation superseded here.
- [ADR-0009](0009-luxon-date-format-tokens.md) — date-only Luxon token language, refined here for explicit migration scope and separate fixed time display.
