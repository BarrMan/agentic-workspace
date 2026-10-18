# Architecture Decisions

This directory defines the project's approved technology stack and concrete implementation choices.

## Active Decisions

| Area | Selected Technology / Strategy | ADR |
|---|---|---|
| Domain ownership and persistence coordination | Model-owned domain behavior | [ADR-0001](0001-model-owned-domain-behavior.md) |
| Storage | Local filesystem; Markdown/YAML task records; JSON state | [ADR-0002](0002-storage-filesystem-paths-formats.md) |

## Decision History

| ADR | Decision | Status | Replaced By |
|---|---|---|---|
| [ADR-0001](0001-model-owned-domain-behavior.md) | Model-owned domain behavior | Accepted | — |
| [ADR-0002](0002-storage-filesystem-paths-formats.md) | Filesystem storage, paths, and formats | Accepted | — |
