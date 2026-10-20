# ADR-0009: Luxon date-format tokens

**Status:** Accepted  
**Supersedes:** [ADR-0008](0008-luxon-date-handling.md), `date_format` token-language provision only

## Decision

`date_format` uses case-sensitive Luxon tokens only and defaults to `yyyy-MM-dd`. A bounded migration converts legacy tokens; ordinary configuration loading does not rewrite them. Date-only values omit time, while timestamps with date-only formats append `HH:mm`.

ADR-0008 remains accepted for its date-library, parsing, validation, and timestamp semantics; only its token-language provision is superseded.

## References

- [ADR-0008](0008-luxon-date-handling.md) — Luxon date handling; superseded only for `date_format` token language.
- [Configuration contract](../specs/configuration.md#config-016-date-format-tokens) — observable token and migration behavior.
