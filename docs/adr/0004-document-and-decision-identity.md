# ADR-0004: Document and decision identity

**Status:** Accepted  
**Date:** 2026-10-18  
**Supersedes:** None

## Purpose

Fix the identity rule for project documents and decision records so persistence, lookup, and filename presentation cannot diverge. The rule intentionally differs from task identity.

## Blueprint Mapping

**Components:** Storage and content persistence.

**Contracts:** Storage owns persisted path shape and record formats; see [Storage](../blueprints/storage.md). Document and decision operations are defined by [IF-API-008](../specs/supported-integration-operations.md#if-api-008-manage-project-documents) and [IF-API-009](../specs/supported-integration-operations.md#if-api-009-manage-decision-records).

## Decision

**Selected Technology:** The frontmatter document or decision ID, compared through the shared prefixed-entity identity helpers.

### Identity

- A document or decision is identified by its frontmatter ID, not by its filename.
- Comparison uses `documentIdKey` and `decisionIdKey`. The keys trim surrounding whitespace, case-fold, and collapse leading zeros in a numeric body, so `doc-01` and `doc-1` compare equal. `normalizeEntityId` produces the stored prefixed form; the key helpers own comparison.
- Task IDs deliberately do not follow this rule. Task identity folds case and whitespace but preserves numeric segments exactly, so `TASK-01` and `TASK-1` remain distinct. Document and decision IDs have no allocation or padding contract, so their numeric spelling is not identity.

### Filenames

- Persisted filenames remain `<normalized-id> - <sanitized-title>.md` under the documents and decisions directories. The title suffix is presentation only; editing a title may rename the file without changing identity.
- Filename parsing for lookup and prior-file matching uses the identity key on the ID portion, never the title portion.

### Validation and lookup

- At the write boundary, an ID is rejected when its body is empty after normalization or contains a path separator (`/` or `\`). IDs are not sanitized, because sanitizing would change identity.
- Lookups and a save's prior-file matching compare identity keys. When more than one file claims the same key, the operation fails closed with an ambiguity error; no winner is chosen.
- No migration or automatic rename of existing files is performed. A title edit may rename that record's own file as part of its save.

## Alternatives

### Filename as identity

Rejected: title edits rename files, so filename identity would churn identity and break references.

### Sanitize IDs

Rejected: sanitization can collapse distinct IDs into one, which changes identity at the boundary where it must be preserved.

### Migrate existing filenames to the identity key

Rejected: identity already lives in frontmatter, so rewriting existing files adds risk without changing behavior.

### Reuse the task identity key

Rejected: task numeric segments preserve zero padding as part of external addressing, while document and decision IDs have no such contract. Sharing the rule would make different identity policies appear interchangeable.

## Rationale

One key function keeps cross-record lookup deterministic while filenames stay human-readable. Frontmatter authority survives renames. Validation at the write boundary rejects unaddressable IDs, while key comparison tolerates harmless spelling differences. Fail-closed ambiguity prevents silently reading or modifying the wrong file. Keeping content identity distinct from task identity matches their different contracts.

## Consequences

**Benefits**
- A document or decision keeps its identity when its title, and therefore its filename, changes.
- Persistence, lookup, and prior-file matching agree on one comparison rule.
- Ambiguous keys surface as errors instead of arbitrary selection.

**Trade-offs**
- IDs that differ only by numeric zero padding collide by design, so two such files are an ambiguity error rather than two records.
- Filenames and frontmatter IDs can disagree until a save; identity lookups must read the frontmatter, not trust the filename.

## References

- [Storage](../blueprints/storage.md) — persisted path and format contract.
- [ADR-0002](0002-storage-filesystem-paths-formats.md) — filesystem storage, paths, and formats.
- [ADR-0001](0001-model-owned-domain-behavior.md) — model-owned domain behavior.
- [`normalizeEntityId`](../../src/utils/entity-id.ts#L47) and [`entityIdKey`](../../src/utils/entity-id.ts#L40) — shared entity identity helpers.
- [`documentIdKey`](../../src/utils/document-id.ts#L12) — document identity key.
- [`decisionIdKey`](../../src/utils/decision-id.ts#L8) — decision identity key.
- [`validateIdToken`](../../src/file-system/content-repository.ts#L152) — write-boundary ID validation.
- [`findUniqueEntityById`](../../src/utils/entity-id.ts#L57) — fail-closed lookup and ambiguity error.
