# Software Blueprint: Task

This document is a part of [BLUEPRINT.md](../BLUEPRINT.md).

## Overview

Task owns task-local model state and behavior, including mode selection, task-and-mode approval, and the membership, order, selection, and rollback relationships for retained sessions. Application coordination supplies I/O and durable completion; Session owns runtime observations and execution lifecycle. Configuration resolution and provider construction remain with their respective owners.

## Component Ownership

| Component | Responsibility | Owned State | Dependencies |
|---|---|---|---|
| Task | Own task-local model behavior and session relationships | Task state, selected mode, mode-scoped session membership/order/active IDs, task-and-mode approval | Application coordination, configuration resolver, Harness factory, Session |
| Application coordination | Orchestrate I/O, fresh-state mutation, runtime operations, and durable publication | No Task-owned model state | Task, repositories/store, Session, configuration and Harness services |
| Session | Own runtime execution and runtime observations | Session runtime state and its durable record projection | Runtime/provider services and application coordination |

Dependencies point from application coordination to model and runtime operations; Task does not perform repository I/O or provider execution. Product task behavior and data fields are owned by [SPEC.md](../SPEC.md) and its specifications. This contract defines architectural ownership and relationships only.

## Models and Relationships

### Task

**Purpose:** Represents a project-scoped task and owns its task-local mode and session relationships.

**Properties:**

| Property | Type | Description |
|---|---|---|
| Task identity and details | Product-defined | Task identity and details; exact record shape is owned by SPEC. |
| Configuration association | Configuration references and overrides | Inputs for resolving current effective configuration, not a saved launch snapshot. |
| `selectedModeId` | Mode ID | Selected configurable mode for this task. Persistence uses the existing `selectedModeByTask` preference map; selection ownership remains with Task. |
| `modes[modeId].sessions` | Ordered session records | Retained history for one fixed mode, including history not currently visible in the catalogue. |
| `modes[modeId].activeSessionId` | Session ID or absent | ID of a retained member when history is nonempty; absent when empty. |
| `activeSession` | Session or absent | Derived live Session for the selected mode's active ID; the stored relationship is an ID, not a writable Session pointer. Identity alone does not establish liveness. |
| Task-and-mode approval | Approval indication | Informational indication for one task/mode pair; not shared-catalogue state and not inferred from artifacts. |

**Relationships:** A Task owns fixed mode-scoped session histories and their active IDs. Sessions do not move between modes. Session owns runtime state; Task owns membership and selection. Effective configuration is resolved from current settings and Task-owned inputs by the configuration owner.

**Invariants:** Session history is retained independently of catalogue visibility. A nonempty history's active ID names a retained member; an empty history has no active ID. The active Session is derived from selected mode and active ID.

## Component Contracts

### Task

**Responsibility:** Own synchronous task-model mutations and task-local session relationship rules. It does not persist, perform I/O, start execution, or own runtime lifecycle.

**Dependencies:** Application coordination for fresh-state loading and durable publication; configuration resolver for effective inputs; Harness factory for provider construction; Session for runtime state and records.

**Interface:**

Conceptual operations only; exact public signatures and composition remain open.

```ts
interface Task {
  getConfig(): EffectiveConfiguration
  getHarness(): Harness
  cycleMode(): ModeId
  reserveSession(modeId: ModeId): SessionCreation
  registerSession(modeId: ModeId, session: Session): void
  updateSessionRecord(modeId: ModeId, sessionId: SessionId, change: SessionChange): void
  selectSession(modeId: ModeId, sessionId: SessionId): void
  removeSession(modeId: ModeId, sessionId: SessionId): void
  rollbackSession(creation: SessionCreation): void
  removeMode(modeId: ModeId): void
  serialize(): TaskRecord
  serializeSessions(): SessionRelationships
}
```

**Contract:**
- **Preconditions:** Mutations operate on freshly loaded Task state and validate the exact task, mode, member, and creation incarnation. Required external cleanup must finish before removal or rollback. Session startup and durable writes are application responsibilities.
- **Postconditions:** Model mutations are synchronous. Mode selection and session relationship changes preserve valid membership and active selection. Serialization returns projections without I/O; `serialize()` covers task metadata, while `serializeSessions()` covers all retained mode histories and active IDs.
- **Failures:** Invalid, missing, wrong-mode, stale, or replaced targets are rejected and cannot mutate unrelated state. Store, validation, runtime, and cleanup failures are reported by application coordination; a failed cleanup does not justify forgetting tracking state.
- **Lifecycle:** Task is constructed from application-loaded data. No provider launch or hidden load occurs during construction or serialization. A reserved session is published once; startup happens outside the store mutation/lock. Runtime cleanup precedes relationship removal where required.

### Session

**Responsibility:** Own execution lifecycle, runtime observations, and its durable record projection.

**Dependencies:** Application coordination and runtime/provider services; Task relationship mutations are coordinated externally.

**Interface:**

Conceptual operations only; the interface notation does not prescribe method names or signatures.

```ts
interface Session {
  start(): Promise<void>
  stop(): Promise<void>
  record(): SessionRecord
}
```

**Contract:**
- **Preconditions:** Start or stop is invoked by application coordination for the exact retained session and execution origin.
- **Postconditions:** Session operations change runtime state; they do not independently alter Task membership, mode selection, or approval.
- **Failures:** Runtime and record-publication errors propagate to application coordination, which retains actionable tracking evidence when cleanup or publication fails.
- **Lifecycle:** Session creation, startup, stop/cleanup, and removal are distinct phases. Runtime observations come from Session rather than persisted Task relationship records.

## Component Interactions

### Create and start a session

**Trigger:** Application receives a session-creation request for a task and configured mode.

**Participants:** Application coordination, Task, configuration resolver, Harness factory, Session, repository/store.

**Flow:**

```text
validate request and prepare work context
resolve current configuration and construct Harness
creation = Task.reserveSession(modeId)
persist reservation before execution
start the reserved Session outside the store mutation/lock
await readiness and initial delivery
publish final state and return that same Session without reinsertion
```

**Completion:** The reservation is durable, the Session is ready with initial delivery complete, and final publication succeeds. Existing launch exclusivity is preserved.

**Failure:** Critical startup failure triggers runtime cleanup followed by `Task.rollbackSession(creation)` on fresh state. Persist rollback and report the original failure together with cleanup or write failures. A committed reservation whose write release is uncertain is inspected by its exact creation identity rather than blindly reserved again.

### Publish a session change or stop a session

**Trigger:** Application observes a Session record change, explicit stop, or qualifying activity that invalidates approval.

**Participants:** Application coordination, Session, Task, repository/store.

**Flow:**

```text
load fresh Task state
validate task, mode, session ID, and incarnation/origin
perform required Session update or cleanup
apply Task record, approval, selection, or removal mutation as authorized
serialize and persist the resulting model state
```

**Completion:** The intended Session projection and Task relationships are durable; unrelated histories and newer selections remain unchanged.

**Failure:** Reject obsolete or replaced targets. Do not start/resume execution as a side effect of record publication. If required cleanup or persistence fails, report partial effects and retain actionable tracking evidence; do not claim completion.

## Essential Algorithms

### Roll back a failed session creation

**Purpose:** Remove only the exact failed provisional member while preserving concurrent or newer selection changes.

**Pseudocode:**

```text
rollback(creation, currentTask):
  require creation identity and incarnation match a current retained member
  remove that member only
  if removed member was active:
    if creation.previousActive is still a retained member:
      restore it as active
    else:
      choose a valid surviving member, or no active ID if history is empty
  otherwise:
    preserve current active selection
```

**Guarantees:** Same-ID replacement is never removed; a newer selection survives; the active ID is valid or absent for an empty history.

**Implementation freedom:** Local representation of captured creation data and survivor choice when the previous active member no longer exists.

## Architectural Invariants

- Task alone owns task-local mode selection and session membership, order, active IDs, and rollback rules; serializers and repositories do not define a second selection policy.
- Session owns runtime state and observations; Task identity or retained membership does not establish that a Session is live.
- All relationship mutations validate fresh state and exact identity/incarnation; stale activity cannot affect a replacement or unrelated task/mode.
- Required runtime cleanup precedes loss of tracking. Task model methods remain synchronous and free of I/O; application coordination owns durable completion and failure reporting.
- Histories remain retained when absent from the visible catalogue. Removing a mode requires empty history; shared catalogue changes are coordinated separately.
- Effective configuration is resolved from current inputs by one configuration owner; Task does not persist a launch snapshot or implement an independent merge policy.

## Open Design Decisions

| Decision | Constraints | Status |
|---|---|---|
| Exact public signatures and composition of session creation | Must retain the reservation-before-execution boundary and must not perform all phases under a store lock. | Open |
| Activity trigger mapping for approval invalidation | Must be explicit; stale activity cannot affect a replacement or unrelated task/mode. | Open |
| Survivor choice when the previous active session is unavailable | Must leave a valid active member or no active ID for empty history; no tie/order policy is fixed here. | Open |
