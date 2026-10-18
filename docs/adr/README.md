# Architecture Decisions

This directory defines the project's approved technology stack and concrete implementation choices.

## Active Decisions

| Area | Selected Technology / Strategy | ADR |
|---|---|---|
| Domain ownership and persistence coordination | Model-owned domain behavior | [ADR-0001](0001-model-owned-domain-behavior.md) |
| Storage | Local filesystem; Markdown/YAML task records; JSON state | [ADR-0002](0002-storage-filesystem-paths-formats.md) |
| Record validation | Zod frontmatter schemas | [ADR-0003](0003-schema-validation-with-zod.md) |
| Content identity | Frontmatter document/decision IDs; title-bearing filenames are presentation | [ADR-0004](0004-document-and-decision-identity.md) |

## Decision History

| ADR | Decision | Status | Replaced By |
|---|---|---|---|
| [ADR-0001](0001-model-owned-domain-behavior.md) | Model-owned domain behavior | Accepted | — |
| [ADR-0002](0002-storage-filesystem-paths-formats.md) | Filesystem storage, paths, and formats | Accepted | — |
| [ADR-0003](0003-schema-validation-with-zod.md) | Schema validation with Zod | Accepted | — |
| [ADR-0004](0004-document-and-decision-identity.md) | Document and decision identity | Accepted | — |
