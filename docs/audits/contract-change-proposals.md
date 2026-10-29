# Approved contract change disposition

Non-authoritative approval map. The owner's `> Approved` annotations are preserved below; SPEC, BLUEPRINT, CONVENTIONS, and ADRs own the resulting contracts. This document records their mapping and outstanding coordination caveats, not runtime conformance.

Contract approval grants no new data-migration authority. Any separately authorized one-off migration remains limited to its original scope; removing compatibility code does not authorize rewriting, renaming, moving, or deleting existing data. No new test cases, assertions, helpers, or replacement suites are authorized by this disposition. General engineering testing rules remain in [CONVENTIONS](../CONVENTIONS.md#testing).

## 1. Independent task completion

- **Owners:** [Tasks](../specs/tasks.md), TASK-013 and lifecycle tables; [Task blueprint](../blueprints/task.md).
- **Approved disposition:** Persist independent boolean `done`, defaulting to false when absent without inference from status or directory. `markDone` sets it true, preserves status and worktree, permits branches, and invokes no status-change hook. Dependencies remain informational rather than automatic launch/completion gates.
> Approved

## 2. Archive and explicit cleanup

- **Owners:** [Tasks](../specs/tasks.md), TASK-013/TASK-022; [Controller](../blueprints/controller.md) and [Storage](../blueprints/storage.md).
- **Approved disposition:** One archive operation replaces separate completion/cleanup. It performs session/worktree and vacated-reference cleanup and moves the task to archive storage, with no status/done eligibility gate or implicit done change. Execution-safety and cleanup requirements remain. Historical completed records remain readable and are not relocated automatically.
> Approved

## 3. Complete-object updates and concurrency

- **Owners:** [Controller: Update Task](../blueprints/controller.md#update-task), [Storage](../blueprints/storage.md), and [ADR-0012](../adr/0012-explicit-operation-persistence-coordination.md).
- **Approved disposition:** `update(task)` and `edit(task)` take a complete task and derive its ID from it, without previous-status/approval-control arguments, partial-change dispatch, merging, or missing-field reconstruction. Callers derive replacements from the current task supplied under the task lock and persist before release; persistence does not reacquire that lock.
- **Retained caveat:** The public replacement method requires but does not enforce caller lock ownership. Audit direct callers, including existing tests. Do not promise standalone stale-replacement safety; any unresolved external-writer/conflict policy belongs in the Controller contract.
> Approved

## 4. Timestamp ownership

- **Owners:** [Tasks](../specs/tasks.md), [Controller: Update Task](../blueprints/controller.md#update-task), [Task](../blueprints/task.md), [Storage](../blueprints/storage.md), and [ADR-0012](../adr/0012-explicit-operation-persistence-coordination.md).
- **Approved disposition:** `update` persists without advancing the timestamp. `edit` intentionally performs `update` → timestamp advance → `update` → hook/event publication. A failed second save leaves the first committed; publication failure undoes neither save. JSON uses `updatedAt`; model/persistence use `updatedDate`/`updated_date`.
- **Ownership:** TasksService owns task-write sequencing, hooks, publication, board/status coordination, reference-cleanup task writes, and lifecycle outcomes. Task retains approval transforms under the current-task lock; `edit` persists them without a Storage approval override. Session-only writes remain in SessionStore.
> Approved

## 5. Direct publication and partial failures

- **Owners:** [Controller](../blueprints/controller.md), [Storage](../blueprints/storage.md), [Tasks](../specs/tasks.md), and [Configuration mode deletion](../specs/configuration.md#config-012-confirmed-mode-deletion-cleanup).
- **Approved disposition:** Publish directly after the required successful saves, retaining hooks for actual status changes. Failed writes publish no success; later notification failure does not undo persistence. Multi-effect operations report partial effects and continue required cleanup despite notification failure, without a generic deferred-publication collector.
- **Retained caveat:** Verify archive/delete/mode-deletion cleanup, configuration and journal work, and subscriber attempts when notifications fail. Static inspection does not establish these outcomes.
> Approved

## 6. Validation and accepted models

- **Owners:** [CONVENTIONS](../CONVENTIONS.md#changes-and-refactoring), [Controller](../blueprints/controller.md), [Task](../blueprints/task.md), [Storage](../blueprints/storage.md), and [task input requirements](../specs/tasks.md).
- **Approved disposition:** Validate unknown input once at its accepting boundary, reuse schemas and security decoding, then trust accepted models. Retain storage encoding, card-scope, and operation-specific relationship checks; remove repeated accepted-object validation and fallback repair.
- **Retained caveat:** Trace title/date/configured-value/milestone guarantees to actual accepting owners; TypeScript interfaces do not supply runtime validation. Preserve the distinction between an absent title option and an explicitly empty value.
> Approved

## 7. Task and session ownership

- **Owners:** [BLUEPRINT](../BLUEPRINT.md#component-ownership), [Controller](../blueprints/controller.md), [Task](../blueprints/task.md), [Session](../blueprints/session.md), and [ADR-0012](../adr/0012-explicit-operation-persistence-coordination.md).
- **Approved disposition:** TasksService sequences task operations; Core owns session execution; models retain transforms and relationships; Storage owns persistence. Use real owners rather than forwarding facades or removed intermediary services. Preserve task-derived execution paths, replacement selection ordering, lifecycle exclusion, and uncertain-cleanup evidence.
> Approved

## 8. Lock and identifier API simplification

- **Owners:** [Controller](../blueprints/controller.md), [Storage](../blueprints/storage.md), [TASK-003](../specs/tasks.md#task-003-task-identity), and [CONVENTIONS](../CONVENTIONS.md#identity-and-reference-resolution).
- **Approved disposition:** `withTaskLock(taskId, callback, options)` acquires by task identity, loads the current task, owns missing-task failure, and supplies that task to its callback. IDs are task-specific. Lookup uses exact strings without `taskIdKey`, normalization, or aliases; controlled creation spelling is separate, and numeric segments remain exact. This does not claim downstream persistence performs no reads.
> Approved

### Shared locking

- **Owners:** [Storage](../blueprints/storage.md), [Controller](../blueprints/controller.md), and [ADR-0012](../adr/0012-explicit-operation-persistence-coordination.md).
- **Approved disposition:** One `LockOwner` mechanism protects persisted resources and conversation claims, with explicit resource identities and acquisition owners. Acquire before loading the current task; consume that task rather than reloading or reconstructing `filePath`. The same task in a project's shared store has the same lock across linked worktrees; projects remain independent. Preserve short session-state critical sections, task-operation exclusion during provider startup, and containment/symlink/collision/corrupt-record checks.
- **Retained caveat:** Do not run old and new lock namespaces concurrently during cutover. Verify contention and all acquisition owners; this approval is not runtime evidence.
> Approved

## Scope discipline

### Explicit configuration initialization and direct owners

- **Approved mapping:** [Configuration](../specs/configuration.md), CONFIG-001/004/014, owns explicit initialization of default modes and failure on a missing required catalogue. Catalogue reads do not seed defaults. [Storage](../blueprints/storage.md) owns required resource provisioning; [CONVENTIONS](../CONVENTIONS.md#code-organization) owns direct-owner calls, private FileSystem, and standard path/glob APIs with named constants in their owning module.
- **Boundary caveat:** Used Storage operations, runtime/provider ports, bound callbacks, and test-input construction require semantic review, not a body-length deletion rule. Removing Core forwarders does not authorize bypassing Storage.
- **Verification caveat:** Configuration mutation must read persisted current state under its lock rather than overwrite from an instance cache. Verify group/view disappearance handling and provisioning of root-user configuration, mode-deletion, and custom-workspace lock parents. Existing-workspace initialization needs separate operational authorization.

### Current-only formats and removal of migration support

- **Approved mapping:** [Configuration](../specs/configuration.md), CONFIG-008/015/016; [Tasks](../specs/tasks.md), TASK-023 and counter/directory conversion clauses; [Storage](../blueprints/storage.md); [CONVENTIONS](../CONVENTIONS.md#changes-and-refactoring). Remove legacy conversion, compatibility aliases, deprecated fields, and executable migration entry points, including startup string-command conversion, task/config conversion, counter/directory scripts, and alternate `config.yaml` discovery. Supported `config.yml`, custom workspace paths, milestones, and current input validation remain.
- **Data boundary:** Old string commands, obsolete counters, and unsupported filenames receive no compatibility conversion/discovery. Existing files, migration manifests, and historical approval metadata remain untouched; [ADR-0011](../adr/0011-task-mode-approval-storage.md) still owns approval preservation.
- **Accepted decision:** [ADR-0013](../adr/0013-current-only-task-storage-and-format-handling.md) removes ADR-0010's explicit legacy-format conversion permission while preserving its Temporal/Luxon/date scope. [Configuration](../specs/configuration.md), [Tasks](../specs/tasks.md), and [Storage](../blueprints/storage.md) own current-only acceptance and failure behavior; historical ADR bodies remain preserved.

### Required workspace state must fail rather than repair itself

- **Approved mapping:** [Storage](../blueprints/storage.md), [Task](../blueprints/task.md), [Configuration](../specs/configuration.md), and [Tasks](../specs/tasks.md) own explicit initialization and missing-resource outcomes. Task creation provisions required directories and empty session state. Ordinary access, lock acquisition, and atomic writers do not recreate required resources or substitute empty results. Shared-decoder failures surface for collections and direct access; no malformed-record skip-and-return partial success is allowed. [ADR-0013](../adr/0013-current-only-task-storage-and-format-handling.md) supersedes ADR-0002's collection skip/warn provision. Actual temporary `ENOENT` during received-event reconciliation is distinct from corruption and does not authorize repair or suppressed decoding failures.
- **Retained caveat:** Main must record any unresolved per-resource absence policy in its owning contract, especially milestone roots, session state, and genuinely optional group/view files. Verify disappearance of previously persisted state rather than overwriting from caches. Do not infer a required/optional policy from implementation or weaken existing data preservation.
- **Boundary caveat:** Root configuration decoding and task-frontmatter acceptance retain project-only mode ownership checks. Unknown patch/upsert input and operation-specific relationship checks remain; accepted-model reparsing and active/selected-ID fallback repair do not.

### Verification boundary

Contract approval does not establish implementation conformance or runtime readiness. Track verification issues separately from these contracts and approval evidence; unresolved policy remains in its owning contract.
