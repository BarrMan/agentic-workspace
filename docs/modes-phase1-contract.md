# BACK-23 Phase 1 contract and ownership

Phase 1 defined the data contracts below. Canonical task containers are the only readable task layout; legacy flat task records are not read. Manually move each `<name>.md` to `<lowercase-id>/task.md`, set frontmatter `id` to match the directory name, and set `task_schema_version` to `3`. Version-1 session state is unsupported; manually set `version` to `2`, move `sessions` and `activeSessionId` into `modes.build`, and preserve `taskId` before use.

## Seed catalog

| Stable ID | Name | Model | Repository | Task metadata | Artifacts | Subagents | Approval indicator |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `plan` | PLAN | Default (no Backlog override) | Read | Read-Write | Read-Write | Allowed | `plan.md` |
| `build` | BUILD | Default (no Backlog override) | Read-Write | Read-Write | Read-Write | Allowed | None |

PLAN declares optional `spec.md` (WHAT: requirements, behavior, constraints, acceptance criteria, durable decisions) and `plan.md` (HOW: approach, affected areas, steps, validation). Creation and session start do not create these files. Catalog version is `1`; IDs are stable lowercase keys and display names may change. Seed only on explicit project configuration initialization when `modes` is absent. Ordinary config reads/saves do not seed; root/card preset resolution never supplies a mode catalog. Existing configuration fields round-trip untouched.

Profile `textColor` is optional and uses the shared lowercase ANSI palette in `src/agent-workspace/mode-colors.ts`. Settings “Default” omits the field; legacy PLAN/BUILD presentation defaults do not rewrite stored profiles.

## Workspace startup

`agenticworkspace workspace` and interactive board entry require a valid catalog in the exact project configuration. Missing project configuration or missing `modes` fails before terminal acquisition or local store creation. There is no built-in, root, or card catalog fallback. A missing or deleted persisted task mode resolves against the project catalog's default without rewriting the selection during startup.

For a legacy project, manually convert flat task and draft records by moving `<name>.md` to `<lowercase-id>/task.md` under the same root, setting frontmatter `id` to match the directory name, and setting `task_schema_version` to `3`. Back up and manually convert version-1 session state by setting `version` to `2`, moving `sessions` and `activeSessionId` into `modes.build`, and preserving `taskId`. `agenticworkspace agent-config init project` initializes only a missing project catalog. Host setup failure destroys the acquired renderer, and teardown remains idempotent even when root disposal fails.

## Durable artifacts and approvals (Phase 2 implementation boundary)

Canonical task container: `tasks/<lowercase-task-id>/task.md`; artifacts are sibling relative paths. `.artifacts.json` is a lazy, version-1 sidecar containing `approvals[path] = { sha256, approvedAt }`. SHA-256 covers exact bytes. Effective state is Missing, Draft, or Approved; only matching current bytes are Approved. A review carries `reviewedHash`, and approval rejects content changed since review. The sidecar is excluded from artifact listings/search and cannot be agent edited/approved. Reserve `task.md` and `.artifacts.json`; reject absolute paths, traversal, empty segments, and backslashes. The Phase 2 service must additionally enforce canonical-root and symlink containment.

## UI interaction sketch (approved target, later phase)

Task rows show a right-aligned selected mode label and an independent approval checkmark for its configured indicator artifact. Tab cycles modes without launching/resuming; Enter creates/resumes only the selected mode. Focused agent input forwards Tab to the harness. Modes settings use a list-left/profile-right layout with staged save/discard. A task artifact viewer exposes explicit Approve current version and Revoke actions, bound to the content hash reviewed; approval never gates session use.

Settings profile/field navigation is editor-local, separate from persisted task-mode selection and mode-scoped active-session pointers. Profile edits apply to future sessions; existing `createdWith` snapshots remain immutable.

## File ownership for implementation lanes

- **Storage/artifacts (Phase 2):** `src/file-system/task-artifact-repository.ts` (new), `src/file-system/operations.ts`, `task-repository.ts`, `project-layout.ts`; integrate canonical roots and lifecycle only through the owning persistence integration.
- **Sessions/runtime (Phase 2):** `src/agent-workspace/types.ts`, `session-store.ts`, `sessions.ts`, `session-utils.ts`, `workspace-state.ts`, and runtime/session context modules. `types.ts` is shared contract ownership; serialize central changes sequentially.
- **Harness (Phase 2):** adapter leaf implementations under `src/agent-workspace/agents/` plus `session-launch.ts`; coordinate adapter capability definitions in `types.ts` with session owner.
- **Upgrade (Phase 2/3):** new migration module and fixtures under `src/agent-workspace/` / persistence tests; consume finalized storage/session contracts and do not concurrently edit their implementation files.
- **Integrator/shared:** `config.ts` owns project catalog seed/validation; `workspace-controller.ts` and `agent-settings.ts` are Phase 4 integration boundaries; CLI/MCP registration and task schema remain deferred to Phase 3.
