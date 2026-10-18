# ADR-0005: Remove project documents

**Status:** Accepted  
**Date:** 2026-10-18  
**Supersedes:** [ADR-0004](0004-document-and-decision-identity.md), project-document provisions only

## Purpose

Remove project documents from product scope while preserving decision records and the
decision-record identity rules accepted in ADR-0004.

## Blueprint Mapping

**Components:** Storage.

**Contracts:** Storage owns persisted path shape and record formats; see [Storage](../blueprints/storage.md).
Decision-record operations are defined by [IF-API-009](../specs/supported-integration-operations.md#if-api-009-manage-decision-records).

## Decision

**Selected Technology:** Decision records remain the only supported content record alongside tasks.

**Role:** Project documents are not stored, listed, searched, viewed, created, or edited. Their
storage path, CLI operations, search result types, matching fields, validation rules, and
document-specific identity helpers are removed from the contracts and integration inventory.

Decision records keep every identity rule accepted in ADR-0004:

- Identity is the frontmatter decision ID, not the filename.
- Comparison uses `decisionIdKey`, which trims whitespace, case-folds, and collapses leading zeros
  in a numeric body.
- Persisted filenames remain `<normalized-id> - <sanitized-title>.md`; the title suffix is
  presentation only.
- Write-boundary validation rejects empty or path-bearing IDs without sanitizing them.
- Lookups fail closed when multiple files claim the same identity key.

## Alternatives

### Retain read-only project documents

Rejected: the approved product scope removes project documents entirely, and read-only access would
keep document paths, storage, search matching, and integration operations alive without a product
purpose.

### Retain document identity helpers for compatibility

Rejected: there is no remaining record class that uses them, and keeping unused identity rules would
imply supported behavior that no longer exists.

## Rationale

Removing the record class at the contract boundary eliminates its storage, search, validation, and
integration surface together. Decision records are unaffected because their identity contract does
not depend on project-document behavior.

## Consequences

**Benefits**
- The supported record model matches product scope: tasks and decision records.
- Storage and search no longer need project-document paths, schemas, result types, or matching
  fields.
- The integration inventory no longer exposes project-document operations.

**Trade-offs**
- Existing project-document files are outside the supported model and receive no compatibility
  behavior from these contracts.
- Documentation and agent guidance must point to decision records and task artifacts rather than
  project documents.

## References

- [ADR-0004](0004-document-and-decision-identity.md) — decision-record identity rules retained.
- [ADR-0002](0002-storage-filesystem-paths-formats.md) — filesystem storage, paths, and formats.
- [ADR-0003](0003-schema-validation-with-zod.md) — schema validation with Zod.
- [Storage](../blueprints/storage.md) — persisted path and format contract.
- [IF-API-009](../specs/supported-integration-operations.md#if-api-009-manage-decision-records) —
  decision-record operations.
