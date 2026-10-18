# ADR-0003: Schema validation with Zod

**Status:** Accepted

**Date:** 2026-10-18

**Supersedes:** None

## Purpose

Define one declarative validation boundary for Markdown frontmatter. Tasks, decisions, milestones, and documents previously decoded individual fields with hand-written helpers, so types, defaults, list coercion, date checks, and enums were spread across parser code and easy to apply inconsistently.

## Blueprint Mapping

**Components:** Markdown parsing and serialization, task and record storage.

**Contracts:** Frontmatter validation and record decoding; the serializer remains the canonical writer.

## Decision

**Selected Technology:** `zod@4` schemas in `src/markdown/task-record-schema.ts` and `src/markdown/record-schemas.ts`.

**Role:** `gray-matter` remains the only frontmatter extractor. A generic key map translates frontmatter keys to record properties; the schema owns validation, coercion, defaults, enums, dates, and list shapes. The parser maps `ZodError` issues to the existing public error classes, including `TaskDependenciesParseError` for structured dependency values. Serialization keeps its canonical key order and omission rules, and unknown frontmatter keys are retained by callers when a record is saved.

**Implementation Constraints:**
- Schemas are not `.strict()`, so unknown frontmatter keys are not rejected or silently stripped from a save path.
- Dates remain strings in the record model. `YYYY-MM-DD` and `YYYY-MM-DD HH:mm` continue to parse unchanged, and due dates keep their existing day-only normalization.
- Schema-version errors stay distinct from field-validation errors.
- No per-field validation or assignment loops in the parser; field membership is defined by the key map and the schema shape.

## Alternatives

### Keep hand-written per-field decoders

This preserves the current code but duplicates type, default, list, date, and enum rules across fields and records, and makes each new field an opportunity to diverge.

### Decorator-based validation (class-validator and similar)

Decorators require classes or experimental TypeScript configuration, a runtime metadata layer, and a parallel class model for interfaces that are otherwise plain data. They also couple validation to class declaration rather than to an explicit record contract.

### `io-ts` or `valibot`

Both are viable schema libraries. Zod was selected because it is already installed, has the required coercion and issue-path support, and provides type inference without an additional codec vocabulary.

### JSON Schema with Ajv

JSON Schema describes the wire shape well but is less direct for TypeScript-first defaults and coercions, and would add a separate schema document plus a validator dependency for the same boundary.

## Rationale

Zod keeps the validation contract in one place, makes field rules readable next to their property names, and infers the parsed shape without a decorator runtime or a second type definition. Plain schema values fit the existing plain `Task`, `Decision`, `Milestone`, and `Document` interfaces, work with Bun's YAML output, and let the parser translate issues into the established error classes instead of changing callers.

## Consequences

**Benefits**
- One declarative source for defaults, enums, dates, list coercion, and nested object rules.
- Field errors carry issue paths that the parser can map deliberately.
- Adding a field means adding it to the key map and one schema object, not another decoding helper.

**Trade-offs**
- Decision `status` and document `type` are now checked against their declared unions; malformed values that previously loaded as strings now fail validation.
- Dependency values remain a special case because their error must preserve `TaskDependenciesParseError` and entry index reporting.
- Frontmatter in unknown keys is outside the schema; retention depends on the serializer being given the original frontmatter.

## References

- [Markdown parser](../../src/markdown/parser.ts) — public parse functions and error mapping.
- [Task record schema](../../src/markdown/task-record-schema.ts) — task field, date, enum, and dependency rules.
- [Record schemas](../../src/markdown/record-schemas.ts) — decision, milestone, and document rules.
- [SPEC](../../docs/SPEC.md) — current record behavior.
