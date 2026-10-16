---
consolidation:
  total: 32
  counts:
    exists: 26
    discard: 6
    integrate: 0
    unconfirmed: 0
  percentages:
    exists: 81.25%
    discard: 18.75%
    integrate: 0.00%
    unconfirmed: 0.00%
---
# Follow-up questionnaire — mode approval and task storage
> **Non-authoritative supporting material.** This file is not a contract. Authoritative owner(s): [SPEC](SPEC.md), [BLUEPRINT](BLUEPRINT.md), [CONVENTIONS](CONVENTIONS.md).
> Disposition: Mixed — see markers.

Your previous answers are retained. This round addresses the remaining choices in mode-level approval and configurable task storage, plus the existing file tools affected by removing artifact approval.

Answer **Yes** to accept a recommendation, or describe your preferred behavior. No other document needs to be open.

## Mode approval

### 1. Approval belongs to one task's mode
**Context:** You replaced document approval with a mode approval stamp. The same mode can be used by many tasks. <!-- consolidation: exists; ref: docs/specs/configuration.md#configuration-and-modes; reason: Approval belongs to task-and-mode pairs rather than documents. -->
**Question:** Does approving Plan for task A approve only that task's Plan mode, leaving task B unchanged? <!-- consolidation: exists; ref: docs/specs/configuration.md#configuration-and-modes; reason: Accepted per-task scope is an explicit acceptance scenario. -->
**Recommendation:** Yes. Store approval separately for each task and mode, not on the shared mode definition. <!-- consolidation: exists; ref: docs/specs/configuration.md#configuration-and-modes; reason: Accepted recommendation is represented by task-and-mode approval. -->
**Answer:**
This is a really stupid question. Of course it's per task... <!-- consolidation: exists; ref: docs/specs/configuration.md#configuration-and-modes; reason: Per-task approval decision is already folded. -->

### 2. Who sets the stamp
**Context:** The application will not inspect documents to decide whether a mode is approved. <!-- consolidation: exists; ref: docs/specs/configuration.md#configuration-and-modes; reason: Approval is independent of artifact contents and hashes. -->
**Question:** Is approval a person-only action, or may an agent also set it? <!-- consolidation: exists; ref: docs/specs/configuration.md#configuration-and-modes; reason: Agent-invoked approval in response to user direction is settled. -->
**Recommendation:** Make it an explicit human action. An agent completing work does not approve its own result. <!-- consolidation: discard; ref: docs/specs/configuration.md#configuration-and-modes; reason: Human-only action is superseded by the accepted agent-usable CLI command. --> <!-- consolidation: exists; ref: docs/specs/configuration.md#configuration-and-modes; reason: Finishing work alone does not grant approval. -->
**Answer:**
It's a cli command the agent may use. The agent will not approve it automatically because nothing tells it to approve it automatically. The user may say "consider this approved" or whatever. <!-- consolidation: exists; ref: docs/specs/configuration.md#configuration-and-modes; reason: User-directed agent approval via CLI and no automatic completion approval are explicit. -->

### 3. Clearing approval
**Context:** File changes can no longer invalidate approval because the application does not know what a mode produces. <!-- consolidation: exists; ref: docs/specs/configuration.md#configuration-and-modes; reason: Mode outputs are opaque and approval is independent of file contents. -->
**Question:** Should approval remain until someone explicitly clears it, or should further session activity clear it automatically? <!-- consolidation: exists; ref: docs/specs/configuration.md#configuration-and-modes; reason: Further session activity clears approval under the accepted answer. -->
**Recommendation:** Keep it until explicitly cleared. Do not infer approval changes from files, messages, or session restarts. <!-- consolidation: discard; ref: docs/specs/configuration.md#configuration-and-modes; reason: Explicit-clear-only policy is superseded by accepted activity invalidation. -->
**Answer:**
I like the further session activity clearing the approval. <!-- consolidation: exists; ref: docs/specs/configuration.md#configuration-and-modes; reason: Activity invalidation is approved even though exact activity triggers remain open in BLUEPRINT. -->

## Existing file tools

### 4. Generic task files without artifact rules
**Context:** Separately from approval, the application has a task-file viewer and commands to list, read, and write task files. Today these are called artifacts. <!-- consolidation: exists; ref: docs/specs/tasks.md#using-task-artifacts; reason: Generic artifact viewing and list/read/write tools are retained. -->
**Question:** Should these generic file tools remain after removing mode-specific artifact declarations and document approval? <!-- consolidation: exists; ref: docs/specs/tasks.md#using-task-artifacts; reason: Retention is settled by the dedicated directory answer and questionnaire 5 answer 7. -->
**Recommendation:** Keep them as optional file tools, with no required filenames, expected mode outputs, or approval checks. <!-- consolidation: exists; ref: docs/specs/tasks.md#using-task-artifacts; reason: Later accepted generic-file contract includes optional names and no approval checks. -->
**Answer:**
The task artifacts should have a dedicated place saved inside of the task's folder. like `/artifacts` or something like that. the list artifacts command will display the files in that list. <!-- consolidation: exists; ref: docs/specs/tasks.md#tasks-and-storage; reason: Every task has an artifacts directory inside its task folder. --> <!-- consolidation: exists; ref: docs/specs/tasks.md#using-task-artifacts; reason: List-artifacts lists files in that directory. -->

## Task storage

### 5. Default location
**Context:** The source currently stores task records under the project's `.agentic-workspace` directory, not inside `.git`. The inspected home-directory location is used for worktrees. You approved project-configurable task storage in a user-level location, the project, or a custom path. <!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Inspected historical source locations are evidence rather than the configurable-location contract. --> <!-- consolidation: exists; ref: docs/specs/tasks.md#tasks-and-storage; reason: Project, user-level and custom locations are approved options. -->
**Question:** Which location should a new project use when the user has not chosen one? <!-- consolidation: exists; ref: docs/specs/tasks.md#tasks-and-storage; reason: Project-local default is explicitly settled. -->
**Recommendation:** Default to the project's `.agentic-workspace` directory; allow user-level or custom storage through project configuration. <!-- consolidation: exists; ref: docs/specs/tasks.md#tasks-and-storage; reason: Accepted default and configuration alternatives are specified. -->
**Answer:**
recommended. <!-- consolidation: exists; ref: docs/specs/tasks.md#tasks-and-storage; reason: Answer accepts the documented project-local default. -->

### 6. Changing the storage location
**Context:** A project may already have tasks when the user changes its configured storage path. <!-- consolidation: exists; ref: docs/specs/tasks.md#changing-the-storage-location; reason: Relocation explicitly covers existing records and artifacts. -->
**Question:** Should the application move those existing tasks, or should the user move them before changing the setting? <!-- consolidation: exists; ref: docs/specs/tasks.md#changing-the-storage-location; reason: Application-owned full-folder move is settled. -->
**Recommendation:** Require an explicit move by the user for now. A path setting alone should not silently move or delete existing data; report when records remain at the previous location. <!-- consolidation: discard; ref: docs/specs/tasks.md#changing-the-storage-location; reason: Manual relocation recommendation is superseded by application-owned movement of the entire data folder. -->
**Answer:**
if changed, the application makes sure the entire data folder is moved to the new place. <!-- consolidation: exists; ref: docs/specs/tasks.md#changing-the-storage-location; reason: Full-folder application relocation is explicit without inventing failure or rollback policy. -->
---

These are product choices, not requests to investigate code. The provider-independent model-setting command, removal of reset and board export, first-launch worktree creation, deterministic task storage, and retained completion behavior are already settled and are not being asked again. <!-- consolidation: exists; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Provider-independent current-model capture is settled. --> <!-- consolidation: discard; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Reset removal is settled and retained in alignment ACT-3 rather than a duplicate core absence list. --> <!-- consolidation: discard; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Board-export removal is settled and retained in alignment ACT-3 rather than a duplicate core absence list. --> <!-- consolidation: exists; ref: docs/specs/tasks.md#launching-work-and-completing-a-task; reason: First-launch worktrees and separate completion cleanup are settled. --> <!-- consolidation: exists; ref: docs/specs/tasks.md#tasks-and-storage; reason: Deterministic configured task storage is settled. -->
