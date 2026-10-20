# ADR-0008: Luxon date handling

**Status:** Accepted  
**Date:** 2026-10-20  
**Supersedes:** [ADR-0003](0003-schema-validation-with-zod.md), date-specific provisions only

## Purpose

Use a date library for date parsing, validation, and formatting rather than maintaining custom date parsing and formatting logic.

## Decision

**Selected Technology:** Luxon.

**Role:** Luxon owns date parsing, validation, and formatting.

**Date behavior:**
- Due dates remain calendar-day strings in `YYYY-MM-DD` form.
- Timestamp input preserves the calendar day written in the input.
- Canonical `yyyy-MM-dd HH:mm` timestamps represent UTC.
- Offset timestamps are converted to UTC for display.
- The existing `date_format` token language is unchanged.

## Alternatives

### Native `Date` and custom parsing/formatting

Rejected: preserving parsing, validation, timezone conversion, and configured formatting would require custom logic in addition to platform date handling.

## Rationale

Luxon provides one established library for parsing, validating, timezone-aware conversion, and formatting. This avoids maintaining custom parsing and formatting logic while retaining the existing date representations and configured format tokens.

## Consequences

**Benefits**
- Date parsing, validation, and formatting share one library and consistent timezone behavior.
- Timestamp display has an explicit UTC rule while preserving the written calendar day at input.
- Existing `date_format` tokens remain valid without migration.

**Trade-offs**
- Date handling depends on Luxon and its supported parsing/formatting behavior.
- Callers must distinguish calendar-day due dates from UTC timestamps.

## References

- [ADR-0003](0003-schema-validation-with-zod.md) — record validation; superseded only for date-specific provisions.
- [Engineering Conventions](../CONVENTIONS.md#dependencies) — use of Luxon for date handling.
