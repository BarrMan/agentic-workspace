# Architecture Decisions

This directory defines the project's approved technology stack and concrete implementation choices.

## Active Decisions

| Area | Selected Technology / Strategy | ADR |
|---|---|---|
| Domain ownership | Model-owned transforms and relationships | [ADR-0001](0001-model-owned-domain-behavior.md), coordination refined by [ADR-0012](0012-explicit-operation-persistence-coordination.md) |
| Operation and persistence coordination | TasksService task sequencing; Core session execution; complete-object writes under shared locks; explicit initialization | [ADR-0012](0012-explicit-operation-persistence-coordination.md) |
| Storage | Local filesystem; Markdown/YAML task records; JSON state; decoding failures surface | [ADR-0002](0002-storage-filesystem-paths-formats.md), collection failure handling refined by [ADR-0013](0013-current-only-task-storage-and-format-handling.md) |
| Format support | Current-only formats; no legacy conversion or malformed-record skip-and-return recovery | [ADR-0013](0013-current-only-task-storage-and-format-handling.md) |
| Task/mode approval | Task-record `mode_approvals`; independent of artifacts and hashes | [ADR-0011](0011-task-mode-approval-storage.md) |
| Provider session identity | Persisted in session state only | [ADR-0007](0007-persist-provider-session-identities.md) |
| Record validation | Zod frontmatter schemas | [ADR-0003](0003-schema-validation-with-zod.md) |
| Content identity | Frontmatter decision IDs; title-bearing filenames are presentation | [ADR-0004](0004-document-and-decision-identity.md), affirmed for decision records by [ADR-0005](0005-project-document-removal.md) |
| Source layout | Layer-first directories mirroring component ownership | [ADR-0006](0006-layer-first-source-layout.md) |
| Date handling | Native Temporal due-date parsing; Luxon date-only formatting with separately appended `HH:mm` | [ADR-0010](0010-temporal-due-dates-luxon-display.md), legacy-format migration removed by [ADR-0013](0013-current-only-task-storage-and-format-handling.md) |

## Decision History

| ADR | Decision | Status | Replaced By |
|---|---|---|---|
| [ADR-0001](0001-model-owned-domain-behavior.md) | Model-owned domain behavior | Superseded in part | [ADR-0012](0012-explicit-operation-persistence-coordination.md) (persistence-owned locked reload/validation coordination only; model-owned transforms and relationships retained) |
| [ADR-0002](0002-storage-filesystem-paths-formats.md) | Filesystem storage, paths, and formats | Superseded in part | [ADR-0011](0011-task-mode-approval-storage.md) (artifact approval metadata only); [ADR-0013](0013-current-only-task-storage-and-format-handling.md) (malformed-record collection skip/warn only) |
| [ADR-0003](0003-schema-validation-with-zod.md) | Schema validation with Zod | Accepted | — |
| [ADR-0004](0004-document-and-decision-identity.md) | Document and decision identity | Superseded in part | [ADR-0005](0005-project-document-removal.md) (project-document provisions) |
| [ADR-0005](0005-project-document-removal.md) | Remove project documents; retain decision-record identity | Accepted | — |
| [ADR-0006](0006-layer-first-source-layout.md) | Layer-first source layout | Accepted | — |
| [ADR-0007](0007-persist-provider-session-identities.md) | Persist provider session identities | Accepted | [ADR-0002](0002-storage-filesystem-paths-formats.md) (provider receipt path only) |
| [ADR-0008](0008-luxon-date-handling.md) | Luxon date handling | Superseded in part | [ADR-0003](0003-schema-validation-with-zod.md) (date-specific provisions only); [ADR-0009](0009-luxon-date-format-tokens.md) (`date_format` token language only); [ADR-0010](0010-temporal-due-dates-luxon-display.md) (parsing/validation responsibility) |
| [ADR-0009](0009-luxon-date-format-tokens.md) | Luxon date-format tokens | Superseded in part | [ADR-0010](0010-temporal-due-dates-luxon-display.md) (separate fixed timestamp time and explicit migration scope) |
| [ADR-0010](0010-temporal-due-dates-luxon-display.md) | Temporal due-date parsing; Luxon date-only display | Superseded in part | [ADR-0013](0013-current-only-task-storage-and-format-handling.md) (explicit migration of legacy date-format syntax only; Temporal/Luxon/date scope retained) |
| [ADR-0011](0011-task-mode-approval-storage.md) | Task/mode approval storage | Accepted | — |
| [ADR-0012](0012-explicit-operation-persistence-coordination.md) | Explicit operation and persistence coordination | Accepted | — |
| [ADR-0013](0013-current-only-task-storage-and-format-handling.md) | Current-only task storage and format handling | Accepted | — |
