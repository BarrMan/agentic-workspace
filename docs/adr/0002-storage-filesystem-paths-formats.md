# ADR-0002: Filesystem storage, paths, and formats

**Status:** Accepted  
**Date:** 2026-10-18  
**Supersedes:** None

## Purpose

Fix the concrete storage substrate for workspace-owned data so Storage, Task, and Session share one path and format contract. This decision does not define domain behavior; Task and Session remain its owners.

## Blueprint Mapping

**Components:** Storage, Task, Session.

**Contracts:** Storage owns persistence; Task owns task records and relationships; Session owns the durable conversation projection. See [BLUEPRINT component ownership](../BLUEPRINT.md#component-ownership) and [TASK-006](../specs/tasks.md#task-006-task-storage-format).

## Decision

**Selected Technology:** Local filesystem; Markdown with YAML frontmatter for human-authored task records; JSON for machine-owned state.

**Role:** Storage resolves the configured root, reads and writes model records in their owning formats, and uses atomic replacement. It never interprets domain behavior or manages provider-owned state.

### Paths

The root is the configured workspace-owned task-data location: `.agentic-workspace` by default, the application user-level location (`~/.agentic-workspace/<sha256(project-root)[:16]>`), or a user-selected path. It stays outside `.git` and resolves to one deterministic store across linked worktrees; ambiguous stores fail closed.

| Data | Path |
|---|---|
| Active task | `<root>/tasks/<lowercase-id>/task.md` |
| Draft | `<root>/drafts/<lowercase-id>/task.md` |
| Completed task | `<root>/completed/<lowercase-id>/task.md` |
| Archived task | `<root>/archive/tasks/<lowercase-id>/task.md` |
| Archived draft | `<root>/archive/drafts/<lowercase-id>/task.md` |
| Task artifacts | `<task-container>/artifacts/` |
| Milestone | `<root>/milestones/m-<id>.md` |
| Archived milestone | `<root>/archive/milestones/m-<id>.md` |
| Decision | `<root>/decisions/*.md` |
| Task session state | `<root>/<slug(task-id)>/state.json` |
| Session bootstrap | `<root>/<slug(task-id)>/<session-id>.md` |
| Session log | `<root>/<slug(task-id)>/<session-id>.log` |
| Provider identity receipt | `<root>/<slug(task-id)>/<session-id>.native-session-id` |
| Presentation state | `<root>/view-state.json` |

### Formats

**Task records:** UTF-8 Markdown with YAML frontmatter delimited by `---`. `task_schema_version` is `3`; `id` matches the lowercase container directory. The Markdown body is opaque content owned by the task record. Mismatched directory/frontmatter identities fail closed.

**Artifacts:** Files under `artifacts/`; approval metadata lives in `.artifacts.json` version 1, keyed by artifact path with SHA-256 hashes. Artifact paths resolve inside the directory, including through symlinks.

**Session state:** JSON `state.json` with `version: 2`, a `modes` map, and each mode's `sessions` plus `activeSessionId`. Runtime state is observed separately and is not stored as lifecycle history.

**Presentation state:** JSON `view-state.json` with a revision envelope containing `rev`, `origin`, and `state`.

**Writes:** UTF-8, sibling temporary file plus `rename`; a durable write completes before publication. Mutations that read-modify-write use a lock. Malformed records are skipped by collection reads with a warning; direct single-record reads fail strictly.

## Alternatives

### Embedded database

Rejected: adds a binary dependency for records that must stay human-editable, diffable, and usable without a running server.

### One JSON document for all workspace data

Rejected: all-or-nothing writes, large merge conflicts, and no readable task prose. Per-task records keep writes and review scoped.

### YAML-only task records

Rejected: task content needs a Markdown body. YAML frontmatter plus Markdown body keeps metadata structured and prose readable.

### Provider-owned storage

Rejected: provider configuration, data, and state are outside workspace ownership and must never be moved or managed.

## Rationale

The filesystem keeps workspace data inspectable, versionable, and portable. Markdown is the right format for task prose; JSON is the right format for machine-owned state that is not edited by hand. Per-task containers bound artifact and session files to the task identity, and atomic replacement plus locks prevent torn reads without requiring a database.

## Consequences

**Benefits**
- Records are readable and editable with standard tools.
- Task and session data can be inspected, backed up, and relocated as files.
- No database process or schema server is required.
- Per-task paths keep artifact and session side files adjacent to their owner.

**Trade-offs**
- Storage must implement path resolution, locking, atomic writes, and format version checks.
- Cross-record transactions are unavailable; operations sequence per-record writes and report partial effects.
- Format version checks must preserve unknown frontmatter and fail explicitly on unsupported versions.
- Relocation is a filesystem move, not a database backup/restore.

## References

- [BLUEPRINT: Storage](../blueprints/storage.md) — persistence operations and invariants.
- [TASK-006](../specs/tasks.md#task-006-task-storage-format) — task storage format.
- [TASK-007](../specs/tasks.md#task-007-malformed-records) — malformed record handling.
- [TASK-008](../specs/tasks.md#task-008-relocating-task-storage) — relocation.
- [ADR-0001](0001-model-owned-domain-behavior.md) — model ownership and persistence coordination.
