IMPLEMENTATION PLAN: CONFIGURABLE MODES, MODE SESSIONS, AND TASK ARTIFACTS

Status: planning complete. User approved the architecture and Modes settings layout. This is the implementation handoff, not an implementation report. No feature code has been changed, built, or tested in this session. Keep BACK-23 In Progress; only the user marks it Done.

1. AGREED PRODUCT CONTRACT

The task manager supplies infrastructure, not a prescribed development workflow. Modes are configurable session profiles; PLAN and BUILD are initial configuration, never special state-machine transitions. Users can add, edit, rename, reorder, and remove modes. At least one mode must remain and a configured default must exist. A new task defaults to PLAN in the initial configuration, but task creation never creates a session. Users can start BUILD without ever using PLAN.

Modes are project-wide only. They all use the single currently selected project harness. Do not add per-mode harness selection or task-specific mode configuration. Continue supporting existing adapters: OpenCode, Claude, Pi. OMP was an example, not a request to add support. Existing sessions retain their original harness even after the project harness changes. Retire the task-level harness picker for future mode-session launches; preserve legacy session snapshots for resume.

Each mode has a model selection. Default means no explicit override of the selected harness default. Default PLAN does not hardcode Sol, Luna, any provider, or any model. Discover available models through each harness where possible; use a searchable picker and canonical harness model IDs. No independent Backlog model registry.

Permissions are lightweight agent instructions plus native harness controls where straightforward. No OS sandbox or universal security framework. Repository: None / Read / Read-Write. Current task metadata: Read / Read-Write. Current task artifacts: Read / Read-Write. Subagents: Allowed / Disabled. Show whether a setting has native support or is instruction-based. Do not reject a profile solely because a harness lacks a native control. Do not claim prompt-based restrictions provide filesystem isolation.

Durable task metadata and documents reside in the canonical task store in the main Git worktree. Runtime state, selected mode, session identities/history, active pointers, and launch snapshots remain local and ignored. Repository execution can still use the existing task worktree.

Remove agentSummary and its active interfaces in the final feature. Preserve existing content through migration into an optional ordinary artifact. Task metadata such as title, concise description, and status remains; detailed working information belongs in documents.

2. EXISTING ARCHITECTURE AND REUSE POINTS

Task schema: src/types/index.ts; src/markdown/schema.ts, parser.ts, serializer.ts. Current schema version is 2. Each task is a flat ID-and-title Markdown file. Serialization preserves opaque body and unknown frontmatter. Layout migration and schema migration are separate concerns.

Task persistence: src/file-system/operations.ts, task-repository.ts, project-layout.ts; src/core/task-mutation-service.ts and task-lifecycle-service.ts. Reuse canonical backlog root selection, task locks, mutation notifications, and lifecycle services. Discovery, cache pruning, watchers, branch loading, duplicate repair, and creation recovery have flat-file assumptions.

Local state: src/agent-workspace/session-store.ts and view-state-store.ts. Reuse existing runtime-root resolution, locking, atomic state writes, revisions, and subscriptions. Do not put runtime information into task frontmatter.

Sessions: src/agent-workspace/types.ts, sessions.ts, session-utils.ts, workspace-state.ts. Existing task history plus one active pointer becomes nested mode histories. Retain UUID/native identity separation, reservation/adoption, exact resume, output logs, and lifecycle handling.

Runtime: src/ui/opentui/workspace-controller.ts; src/agent-workspace/live/agent-host.ts; session-process.ts and tmux-pane-lookup.ts. Native hosts are already keyed by session UUID and can be retained while detached. Some CLI pane lookup is only task-specific and must become session-specific.

Configuration: src/agent-workspace/config.ts and agents/agent.ts, agents.ts. Existing preset resolution is card > project > root > built-in with complete replacement, not field inheritance. Reuse presets and configuration writes, but resolve modes at project scope only; do not inherit modes through card/root overrides.

Launch/context: src/agent-workspace/session-launch.ts, bootstrap.ts, task-skill.ts, workspace-context.ts. Reuse shared preparation and provider adapters. Existing bootstrap identifies the task and waits for user instructions. Existing workspace context is an ownership channel, not a canonical storage resolver or complete conversation identity.

UI: src/ui/opentui/workspace.ts, workspace-controller.ts, agent-settings.ts, keymap.ts, keybindings.ts, workspace/state.ts. Reuse draft/save/discard settings, retained previews, named shortcuts, and shared view state.

Documents: existing project-wide ContentRepository documents have IDs/frontmatter and are not equivalent to task artifacts. Keep them separate; generic task files must not require document IDs or document schema.

3. TARGET DATA MODEL

Use stable ModeId keys, independent of editable display names. This makes rename cheap and keeps sessions associated correctly.

Project configuration:
  modes: {
    version,
    defaultModeId,
    order: ModeId[],
    profiles: Record<ModeId, ModeProfile>
  }
ModeProfile:
  name
  model: discriminated default or explicit model ID
  prompt: inline text
  permissions: repository, task, artifacts, subagents
  artifacts: list of relative path and purpose/description
Profiles contain no harness field. Resolve the project-selected preset when
reserving a NEW session. Store the modes section in the existing project
agents.json configuration, with explicit validation and round-trip support.
Root/card preset configuration must not shadow the project modes catalog.
Never regenerate deleted default modes during settings save; seed defaults
only when upgrading/initializing a project that has no modes section.

Task local session state (new version):
  taskId
  modes: Record<ModeId, {
    sessions: AgentSession[],
    activeSessionId?: SessionId
  }>
  existing task-owned runtime/worktree fields as applicable
AgentSession retains Backlog UUID, native harness conversation ID,
status/timestamps, execution directory, output/bootstrap references,
ownership/runtime identifiers, and usage metadata. Add createdWith:
SessionProfileSnapshot. Group membership is the current ownership source of
truth; do not store a second mutable mode assignment that can disagree with
the map. Original mode ID/name may be retained in createdWith as provenance
after reassignment.

The creation snapshot is the resolved profile used at reservation time: mode
ID/name, exact preset/harness command and configured environment, model
choice, prompt text, artifact declarations, permission instructions/native
policy inputs, relevant launch settings, and canonical task/repository
roots/cwd. Never copy arbitrary ambient environment or credentials into
snapshots. New-session preparation, delayed adoption, resume, and ask use the
saved profile. Config edits affect only subsequent sessions/handoffs.

Default model means omit a Backlog model override. Preserve the native
conversation when resuming. Do not claim to snapshot an implicit model that
the harness cannot report; actual native conversation configuration remains
harness-owned.

Local view state gains selectedModeByTask: Record<TaskId, ModeId>. Resolve
absent/invalid selections to the configured default without creating runtime
histories. Missing mode state means zero sessions. Keep selected mode in one
authoritative place, not duplicated in task frontmatter/session state.
Agent-issued commands infer their mode from calling session identity, not from
a UI selection that may change concurrently.

4. DURABLE TASK FOLDERS AND GENERIC ARTIFACTS

Target active-task layout under the existing configured backlog directory:
  tasks/<canonical-lowercase-task-id>/task.md
  tasks/<canonical-lowercase-task-id>/spec.md
  tasks/<canonical-lowercase-task-id>/plan.md
  tasks/<canonical-lowercase-task-id>/<other files or subfolders>
Only task.md is a task record. Identity comes from the validated record and
container contract, not from arbitrary artifact basenames. Title changes never
rename the folder. Use analogous folder containers under existing
draft/completed/archive storage roots; preserve their current lifecycle
distinctions. Move the whole container on
archive/completion/promotion/demotion. Handle ID changes and ID reuse
explicitly without merging unrelated artifacts.

Add a small TaskArtifactRepository/service beside existing task persistence.
Required operations: resolve canonical task container, list actual artifacts,
resolve/read/write a relative artifact, and return paths for agent context.
Reuse locks/atomic writes and mutation notifications. Artifacts are ordinary
files, not mandatory frontmatter documents. Configured artifact declarations
express intended usage, not an allowlist of filenames or a requirement to
create files.

Validate project-relative artifact paths, reject traversal/absolute
paths/reserved task.md, and enforce containment for service writes, including
symlink handling. Use canonical core.filesystem roots, never agent execution
cwd or a stale worktree-local task.filePath. Existing
src/utils/find-backlog-root.ts and src/git/main-worktree.ts already map
registered linked worktrees to main-worktree storage. Artifact paths supplied
to prompts must be absolute canonical paths. If main-root resolution fails for
a known linked worktree, report a useful error rather than silently writing a
second task store.

Creating a task makes its record/container, not empty artifacts. Starting any
session never precreates declared artifacts. Writes create parent directories
lazily. Artifact edits do not rewrite task metadata just to update timestamps.
Watch artifact events separately from task-record events and invalidate
relevant artifact/search views.

Expose the canonical artifact directory and actual artifact list in task
plain/JSON output and agent context. Provide generic artifact operations
through existing CLI/MCP registration patterns so agents can list/read/write
without guessing paths; do not introduce spec/plan-specific commands. Let task
detail surface generic document paths using its existing content/scrolling
machinery; no separate document-management application or rich editor is
required. Include Markdown/text artifact content in task search via the
artifact service so migrated summary information remains searchable; avoid
parsing binary files as task text.

5. SESSION CREATION, RESUME, HANDOFF, AND ASK

Change every task-only active selector to task+mode: SessionStore/service
utilities, WorkspaceStateService, controller active-host lookup, launch
guards, reservation, CLI pending registration/adoption, history picker,
lifecycle operations, and reconciliation.

At reservation: capture explicit/inferred mode, resolve project profile and
selected harness, save createdWith, and reserve under the existing task lock.
Process launch occurs outside the lock as today. Concurrent starts in
different modes are allowed; same-mode duplicate activation is serialized.
Guards must consider the selected active/reserved conversation, not reject all
historical running sessions: deletion merges can deliberately leave a running
non-active conversation.

Fresh first session selects only its mode pointer. Enter resumes the existing
active native conversation exactly, or creates a new one if the pointer is
absent. Active pointer means selected conversation, not necessarily running
process. Mode selection never starts/resumes a process and never changes task
status. Keep current successful-activation In Progress behavior unless
separately changed; there are no PLAN-before-BUILD constraints.

Handoff creates a new session in the calling/current mode and updates only
that pointer. Retire/park only that mode predecessor according to existing
handoff lifecycle. Starting another mode or cycling modes must not call
retirement/stop/park on the previous mode.

Fix tmux lookup to match project plus exact session UUID. Retain mode tags
only for diagnostics. Legacy pane fallback is allowed only when uniquely
attributable. Never stop/probe one mode using another mode pane.

Retain runtime hosts by session ID; key active selection and starting guards
by task+mode. Capture originating identities across async operations. A
delayed launch completion must not mount the wrong preview or change the mode
selected since launch began. Background hosts continue output/status capture.

History/session picker shows the selected mode history; choosing a historical
conversation activates it in that mode. Preserve a way to see/manage moved
non-active running sessions using existing session-management mechanisms.

Installed command is backlog agent-session ask, not a verified top-level
backlog ask alias. Extend the existing command/service rather than assuming
the alias. Add mode targeting to relevant start/handoff/list/history/ask
commands; --session remains an explicit unambiguous target. Mode resolution
order: explicit option, trusted calling session identity, selected local
mode/default for an interactive invocation. Resolve implicit previous session
within the same mode using existing timestamp semantics, not merged-array
append order. Exclude the caller/active target appropriately and return a
clear no-previous-session error.

Apply createdWith to ask as well as interactive launch/resume. Current
provider ask commands have hardcoded flags and bypass common preparation;
remove policy drift through shared provider preparation with scoped cleanup.
Coordinate ask/resume claims to avoid concurrently reopening the same native
conversation. Keep existing timeout/partial-output behavior.

Keep workspace ownership validation separate from conversation identity. Add
validated session/mode context to the existing scoped launch/command context
mechanism; do not restore removed ambient identity variables without updating
the shared contract consistently. A running session reassigned on mode
deletion should resolve its CURRENT owning mode by session UUID, not stale
launch-time mode metadata.

6. SIMPLE MODE DELETION: APPROVED RULE

If a mode owns sessions, require choosing another existing mode as
destination. No conflict-resolution wizard.

For each task: append the source session array to the end of the destination
session array; preserve destination activeSessionId unchanged; discard source
activeSessionId; delete source mode entry. If destination has no active
pointer, leave it empty. Preserve every moved session UUID/native
identity/profile/output/status and do not stop running processes.

Then remove the source profile/order entry. Rewrite tasks selecting the
deleted mode to the destination. If the default was deleted, use the
destination as default. If an empty mode has no sessions, allow direct
deletion and fall back affected selections/default to another remaining mode.
Prevent removing the last mode.

Use an idempotent service operation outside the UI: existing project
configuration lock plus task-state locks, UUID-based deduplication, and a
small local migration journal for multi-file recovery. Validate destination
and snapshot affected state before writes. Briefly serialize creation/config
changes for the affected modes during reassignment. On interruption,
finish/retry safely before accepting new source-mode launches. No session
restart or snapshot rewrite. Notify controllers and view-state subscribers
afterward.

7. DEFAULT PROFILES AND CONTEXT

Seed PLAN and BUILD only as configuration. Default mode: PLAN. Both model
choices: Default. Neither has a harness selector.

PLAN: repository Read; current task metadata Read-Write; task artifacts
Read-Write; subagents Allowed. Default prompt identifies a direct interactive
planner, reads the task and existing artifacts, explores repository without
modifying it, resolves product questions with the user, optionally delegates
bounded research using available harness facilities, and persists synthesized
conclusions rather than raw worker output. No required worker model, steward
agent, or automatic implementation. Starting it remains idle until user
instructions.

PLAN declarations: spec.md describes WHAT (requirements, behavior,
constraints, acceptance criteria, durable decisions); plan.md describes HOW
(approach, affected areas, steps, validation). Maintain these as decisions
evolve. A fresh agent with task and artifacts should be able to continue
without past planning conversations. Files remain optional/lazy.

BUILD: repository/task/artifacts Read-Write; subagents Allowed; Default model;
prompt preserves current task-agent behavior without adding a complex
workflow. Preserve resolved existing approval/worktree defaults when
upgrading; PLAN must not silently inherit write permission from BUILD approval
flags. No automatic PLAN-to-BUILD transition.

Replace task-management skill guidance about agentSummary with generic
task-artifact working-state guidance. Keep concise task description, metadata
maintenance, previous-session ask, and only-user-marks-Done guidance. Compose
mode prompt, permission instructions, artifact paths/purposes, and existing
Backlog context through shared launch preparation. Existing session snapshots
preserve their configured prompt/policy; regenerated runtime hooks must not
silently replace them with current mode configuration.

8. MODEL DISCOVERY AND HARNESS PERMISSIONS

Extend existing Agent adapter with optional model discovery and profile
preparation capabilities, not a universal model registry. OpenCode: use
opencode models; Pi: use --list-models; Claude: no reliable list command was
confirmed, so Default plus manual model ID is the initial fallback. Run
discovery with selected preset environment and a bounded timeout; cache per
preset/environment identity without secrets. Return canonical IDs/display
metadata. Loading, failure, and empty results must not prevent choosing
Default.

Model precedence: explicit mode ID overrides an existing preset model
argument/config using provider-aware construction; Default leaves
preset/native selection untouched. Do not append ambiguous duplicate model
flags or evaluate compound shell commands. Validate model IDs as data, not
shell syntax. Scope discovered values to the current project harness; after a
harness change, retain explicit IDs as editable configuration and
validate/report incompatibility before a new launch rather than silently
substitute another model.

Generate explicit instructions for all permission toggles with absolute
allowed roots and current-task scope. Repository None also instructs the agent
not to inspect repository/context files; document native startup-context
limitations honestly. Use native edit/task/tool controls where feasible,
especially OpenCode path edit rules. Pi may use tool selection or a small
session-local extension if naturally supported; do not expand this into
sandbox development. Claude uses its native settings/tool controls where
verified. Do not use broad built-in plan/YOLO/ask flags that undo generated
native denies. Shell, MCP, plugins, agent switching, and global configuration
remain harness-specific; communicate instruction-based scope without claiming
complete isolation.

9. APPROVED TUI / SETTINGS DESIGN

Task rows: show the selected mode name right-aligned beside the title, never
inside title data. Reuse/extract Bun.stringWidth-based clipping/padding from
board.ts. Account for group indent, marker width, Unicode, narrow terminals,
long names, selected-row contrast, and title-only Done strikethrough. Use
selected-mode session activity for the existing row indicator; other modes
keep running without changing preview selection.

Task navigation: Tab cycles configured order, persists selected mode, and
updates preview. Group rows are a no-op. A single mode is a no-op. A running
selected-mode session attaches passively; parked/stopped shows a
resume-on-Enter state; absent shows a create-on-Enter state. Disable the
existing automatic parked-session resume in selection sync. Enter
creates/resumes and focuses that session. Ctrl+Q returns to task navigation.
Inside focused agent input, Tab goes to the harness. Preserve Ctrl+C behavior.
No launch or task-status change from browsing.

Replace workspace.nextFocus with cycle-mode semantics through named shortcuts,
help, and override migration. Map existing nextFocus overrides to the new
cycle action once, unless a new explicit override is already present; remove
obsolete descriptors without duplicate Tab handlers.

Settings categories: Agents | Sessions | Modes. Approved layout: modes list
left, selected profile fields right. Show Model (Default/searchable picker),
Repository, Task, Artifacts, Subagents, Prompt editor, Artifact definitions,
Rename, Delete, and Add mode. No harness field. Add default-mode and order
controls consistent with this layout. Prompt uses a larger multiline editor;
artifact editor stores relative path/purpose declarations, not files.

Reuse cloned draft, committed field editing, Ctrl+S save, Escape
cancel/discard, and focus restoration. Extend category navigation beyond the
current two-category toggle. Ensure buildConfiguration preserves modes and
unrelated configuration; do not reconstruct only old known fields.
Adding/renaming/reordering/editing does not affect existing sessions. Deletion
selection and merges are committed only on Save, not while editing or after
discard. Deletion with sessions requires destination selection, without
active-session conflict prompts. Surface validation/save errors in the
existing modal pattern.

10. MIGRATION AND BACKWARD COMPATIBILITY

Implement explicit, previewable, recoverable project upgrade; normal reads
remain side-effect-free. Use new task schema version for agentSummary removal
and new session-state version for nested histories. Reuse staging, locks,
source fingerprints, no-replace installation, and rollback patterns from
duplicate-task-repair.ts and existing task migration. Current
migrateLegacyTask only supports unversioned-to-v2 selected tasks and is
insufficient alone.

Upgrade durable records across active tasks, drafts, completed and archives.
Preserve IDs, timestamps, unknown frontmatter, opaque body, references, links,
and existing files. Move flat files into identity containers, migrate any
retained task-path references, and remove source only after verified
destination installation. Discover only canonical task records in mixed
layouts during upgrade; detect duplicates/collisions rather than treating
artifact Markdown as tasks. Do not rewrite other Git branches or histories
implicitly. Branch/worktree loaders need legacy read support for historical
flat records while current writes use the new layout.

Extract agent_summary BEFORE removing old parser support. Preserve decoded
text exactly in optional legacy-agent-summary.md; never trim or silently
overwrite a different existing artifact. Absent/empty summaries create no
file. Explicitly delete agent_summary from retained frontmatter so unknown-key
preservation does not resurrect it. Handle unversioned records through the
same extraction path. Update artifact search so converted content stays
searchable.

Seed profiles from current behavior. Assign all preexisting task sessions and
old active pointer to the seeded BUILD profile; preserve UUIDs/native IDs/log
paths/status/timestamps/cwd and existing snapshots. Preserve selected BUILD
for tasks with existing sessions to avoid switching existing users into an
empty preview; tasks without session history resolve to default PLAN.
Versioned migration must not guess mode from preset name. Legacy records
without complete snapshots retain known original preset data and explicitly
fall back to available legacy settings; do not invent historical model/prompt
information.

Keep current local runtime directory identity/log locations where possible. Do
not move runtime logs into durable task containers. Ensure new validators
understand added snapshot fields; current validation strips unknown session
keys. Avoid concurrent old/new writer use during upgrade; provide actionable
version/upgrade diagnostics rather than silently loading a partial migration.

Remove agentSummary from Task/create/update types, markdown
schema/parser/serializer, mutation/edit builder, task and draft CLI
flags/help/examples/batch validation, MCP schema/handlers/prose, JSON/plain
output, task search, injected skill, generated CLI/MCP guidance, and README.
This is an intentional CLI/API contract change; document replacement artifact
operations and preserved migrated content. Do not maintain a second summary
field or shadow compatibility writer indefinitely.

11. TASK/WORKTREE LIFECYCLE AND FAILURE HANDLING

One worktree per task remains; do not add per-mode worktrees. Resolve actual
registered worktree path rather than recomputing a title-dependent path.
Ensure host execution cwd matches the prepared/stored cwd. Resume and ask must
handle missing cwd with a useful error, not silently recreate or relocate
native conversations.

Before task completion/deletion or forced worktree cleanup, coordinate every
mode session, including moved non-active running hosts, and existing external
panes. Reuse established shutdown/park behavior rather than allowing processes
to retain a removed worktree. Durable artifacts remain in canonical storage.
Archive/promote/demote move complete containers and preserve local session
association or migrate changed IDs coherently. Prune selected-mode mappings on
final task removal. Reset/purge must not orphan live hosts.

Workspace exit may keep existing all-host park/stop semantics; this is
distinct from mode switching. Failed launch leaves the prior conversation
recoverable and other modes unaffected. Corrupt/partial state is reported with
recovery guidance, never converted to empty history that loses sessions.

12. IMPLEMENTATION ORDER AND CHECKPOINTS

A. Define versioned mode configuration, nested task session state, creation
snapshots, validation, defaults, and adapter capability contracts. Extend
agents.json read/write without dropping fields. Add focused
round-trip/default/rename tests.

B. Implement task-container identity and artifact service, then update task
repository/discovery/cache, Git task loader and cross-worktree ID scanning,
task-path helpers, watchers, creation recovery, duplicate repair, and
whole-container lifecycle. Add generic CLI/MCP/context/listing/search support.
Verify canonical main-worktree writes.

C. Implement recoverable durable/runtime migrations and lossless summary
extraction. Remove agentSummary interfaces/guidance once extraction is
covered. Add fixture upgrades for all record locations, mixed layouts,
collisions, rollback/interruption, reruns, and opaque content preservation.

D. Fix exact session pane identity, then make service
reservation/activation/history/handoff/ask and pending adoption mode-aware.
Capture creation snapshots and apply them to fresh/resume/ask. Add
mode/session command context. Verify simultaneous mode sessions and immutable
settings before UI wiring.

E. Add adapter model discovery, explicit/default model handling, generated
permission instructions, and feasible native controls. Verify using actual
supported harness commands/configuration; keep instruction fallback. Ensure
temporary resources are cleaned up on errors.

F. Implement project-level mode deletion/merge service and recovery, then
local selected-mode subscriptions/fallback. Test session UUID deduplication,
preserved destination pointer, empty destination, running source sessions,
saved-context reassignment, and interrupted deletion.

G. Wire controller mode selection/background host retention, no-auto-resume
preview, mode-specific Enter/handoff/history, stale async guards, row
metadata, named shortcuts, help, and override migration.

H. Add approved Modes settings UI, model search, prompt/artifact editors,
defaults/order/CRUD, destination selection, staged save/discard, and global
harness behavior. Remove task-level harness selection from new-session UX.

I. Complete lifecycle regressions, user documentation, upgrade guidance, and
rebuilt-binary manual verification. No new complex BUILD workflow, mandatory
documents, additional harnesses, or OS isolation.

After EACH code change run bun run build immediately as required by AGENTS.md;
do not batch rebuilds until the end. Verify no src TypeScript files are newer
than dist/backlog before binary testing. Use installed backlog --help as
authoritative for current commands; for new feature verification explicitly
run the rebuilt worktree dist/backlog so the global symlink cannot test a
different checkout.

13. VALIDATION STRATEGY / ACCEPTANCE CHECKLIST

Run only affected suites via bun scripts/run-ci-tests.ts <files>
--timeout=10000 (adjust timeout only where the existing suite requires it),
plus relevant static checks/build. Existing target suites:
agent-workspace/config.test.ts, session-store.test.ts,
session-process.test.ts, session-launch.test.ts, bootstrap.test.ts,
workspace-context.test.ts; src/test/agent-sessions.test.ts,
view-state-store.test.ts, main-worktree.test.ts,
task-worktree-lifecycle.test.ts, task-frontmatter-storage.test.ts,
markdown.test.ts, task-opaque-body-integration.test.ts,
task-edit-preservation.test.ts, mcp-tasks.test.ts, cli-json-output.test.ts,
cli-guidance.test.ts, opentui-workspace-controller.test.ts,
opentui-workspace-layout.test.ts, opentui-workspace-agent.test.ts,
opentui-workspace-groups.test.ts, opentui-keybindings.test.ts,
opentui-agent-settings.test.ts, opentui-session-picker.test.ts. Add meaningful
migration/artifact tests near existing persistence tests; update obsolete
summary assertions rather than leave dead feature coverage.

Critical acceptance scenarios:
- Create task: default PLAN selected, zero sessions, zero empty spec/plan
files.
- Switch immediately to BUILD and Enter: only BUILD session created.
- Start PLAN and BUILD: Tab changes preview; both processes continue, Ctrl+Q
exits input, Enter resumes exact active identity.
- Tab to parked/empty mode: no automatic process launch/status mutation.
- Handoff PLAN: only PLAN predecessor changes; BUILD session unaffected; ask
targets PLAN history and preserves original profile.
- Edit mode/global harness/model/prompt/permissions: old sessions resume under
original Backlog snapshot; new sessions/handoffs use new configuration.
- Rename/reorder/default changes: session membership preserved; mode selection
persists across restart and cross-view refresh.
- Delete RESEARCH into PLAN: append source histories, keep PLAN pointer,
discard source pointer, retain running processes and snapshots. Empty
destination pointer remains empty. Save/discard/recovery behave correctly.
- New/renamed/unconfigured artifacts remain generic and lazy; main-worktree
paths are correct from linked agent worktrees; binary files are not parsed as
tasks.
- Archive/complete/delete/promote/demote preserve container contents and
coordinate all sessions/worktree cleanup.
- Lossless upgrade retains legacy summaries as artifacts, removes the
field/API/guidance, and is rerunnable after interruption.
- Narrow/Unicode task rows preserve right-aligned metadata; Tab is forwarded
inside agent input and does nothing on group rows.
- Model discovery handles loading/error/default/manual-ID paths; generated
native settings do not erase user config or weaken profile restrictions.

Manually verify the rebuilt binary in an isolated project with an actual
supported harness: task creation, two live mode sessions, background
continuity, handoff/ask, parked preview, settings CRUD/model search, simple
deletion merge, restart restoration, and artifact writes from a linked
worktree. Verify native read-only controls where implemented, and instruction
fallback presentation elsewhere. State exactly what was rebuilt and exercised;
do not report tests as proof that a stale global binary contains changes.

No further product decisions block implementation or the approved UI. Treat
this summary as the current resolved plan; original task prompt requirements
for Sol/Luna, per-mode harness selection, and retaining agentSummary were
superseded by the explicit user decisions above.

14. ARTIFACT APPROVAL AMENDMENT

This section extends and, where needed, refines sections 3, 4, 7, 9, 10, 12,
and 13. User requested a lightweight generic draft/approved lifecycle after
approving the original plan. This is planning only; no feature implementation.

14.1 Product contract

Approval belongs to an individual task artifact and its exact content, never
to a task status, session, mode, or special planStatus field. An existing
artifact is Draft unless its current content matches an explicit user
approval. A missing artifact has no approval. Approval does not require
another mode, task status, handoff, or session to exist and never gates their
use.

A user explicitly approves an artifact through the TUI. Agents may say that an
artifact is ready for review and should maintain accurate documents, but may
not approve on behalf of the user. Do not add a ready/review-requested
lifecycle state, approval workflow engine, reviewer assignments, comments,
approval history, or automatic approvals. Draft and Approved are the only
persisted-content lifecycle concepts; Missing is only a display/result for
absent files.

14.2 Persistence and content identity

Keep artifact bytes unchanged; do not require Markdown frontmatter or insert
approval text into the artifact. Store optional durable approval metadata in
one task-container sidecar:

  tasks/<task-id>/.artifacts.json
  {
    "version": 1,
    "approvals": {
      "plan.md": {
        "sha256": "<hash of exact approved file bytes>",
        "approvedAt": "<UTC timestamp>"
      }
    }
  }
Keys are normalized, validated task-relative artifact paths. The sidecar is
versionable task content, not runtime state. It moves with the complete task
container during lifecycle operations. Do not place it in SessionStore or
ViewStateStore, and do not ignore it in source control. Create it lazily on
first approval; tasks and session launches create no empty approval metadata.

Reserve .artifacts.json alongside task.md in the artifact path contract.
Exclude this internal sidecar from user artifact lists, approval targets,
task-content search, and mode artifact declarations. Reuse canonical roots and
containment validation. Do not create per-artifact sidecars or an additional
database.

ArtifactService exposes an effective state derived from the actual current
bytes:
- Missing if file does not exist.
- Approved if the current SHA-256 equals the recorded approved checksum.
- Draft otherwise, including missing approval metadata or stale checksums.

Hash exact bytes, not parsed Markdown, normalized whitespace, mtime, size, or
a model-generated version string. Any content difference, including an
external editor or agent write, makes the prior approval inapplicable. A stale
approval record must never produce Approved or a checkmark. Approval is
content-addressed; do not introduce edit counters or content history.
approvedAt is informational and not proof of current approval.

Service writes invalidate/remove that artifact approval when bytes change. A
byte-identical write need not invalidate approval. External changes are
handled by checksum validation, whether or not a watcher event was received.
Watchers invalidate caches; correctness cannot depend on a running TUI,
mtimes, or a remembered in-memory boolean. If external deletion/rename leaves
stale entries, ignore them for status and clean them during subsequent
explicit metadata mutations. Do not mutate files merely to read a status.

Rename does not silently transfer approval to a different artifact path; the
renamed artifact starts Draft. Whole-task container moves preserve approval
because artifact-relative paths and bytes remain unchanged. No approval
migrates from agentSummary; converted legacy summaries are Draft.

Unreadable files or malformed/conflicted approval metadata must not display a
checkmark or silently overwrite metadata. Surface a concise error in the
artifact view. Preserve existing content for correction; do not interpret
parse failure as permission to reset the sidecar.

14.3 Service operations and concurrency

Extend the existing planned TaskArtifactRepository/service rather than add a
parallel approval subsystem:
- list/read include effective state and optional valid approval timestamp.
- status resolves current content fingerprint against sidecar metadata.
- approveCurrentVersion(taskId, relativePath, reviewedHash) is called by
explicit user-facing TUI action.
- revokeApproval(taskId, relativePath) removes the approval record and returns
the artifact to Draft without editing its content.

Use existing task lock/atomic sidecar writes to merge one path record without
overwriting approvals for other artifacts. Session creation, mode deletion,
profile edits, and agents do not invoke approve.

The artifact review view retains the hash of the content/version shown to the
user. On Approve, reread and compare with that reviewedHash. If content
changed, do not approve the unseen version; refresh and show a concise
changed-since-review message. Write the checksum of the reviewed bytes, never
just hash whatever happens to be current after the click. A later racing
external edit cannot become approved because its bytes will not match the
saved checksum. Update subscribers/caches after approval or revocation.

Expose effective approval status through task artifact listings and
read-oriented CLI/MCP output. Initial approval/revocation actions are TUI user
actions, not agent-facing MCP tools or automatic CLI task edits. Keep internal
service APIs available to the TUI without adding broad authorization
machinery. Generated artifact/mode instructions explicitly say that agents
must not mark artifacts approved or modify internal approval metadata. The
same lightweight instruction/native-control philosophy applies; this is not a
tamper-proof provenance or identity system.

14.4 Generic relationship to mode indicators

Add optional approvalArtifact: string to ModeProfile. It names one validated
task-relative artifact whose current approval is displayed beside that mode
name. This is a display configuration only; approval ownership remains on the
artifact. Multiple modes can reference the same artifact. Arbitrary other
artifacts can be approved even when no mode references them.

Default PLAN references plan.md; its spec.md is independently approvable but
does not participate in the default row checkmark. Default BUILD has no
approvalArtifact. A custom DESIGN mode can reference design.md, and RESEARCH
can reference research.md, without core-model changes. No all-artifacts
aggregation or prerequisite rules.

In Modes settings, add an optional Approval indicator artifact selector
alongside artifact definitions. Offer None and declared paths, with a
validated custom relative path so declarations are not mandatory. Changing the
setting changes the display projection, not artifact approval or existing
session policy. Existing modes migrate with no approvalArtifact except the
newly seeded PLAN default.

The task row reads selected mode configuration and current artifact status
through a controller projection. Render PLAN ✓ only when its configured
approvalArtifact is currently Approved. Render PLAN without a checkmark if the
file is Draft, missing, unreadable, or no artifact is configured. The
indicator is independent of the session indicator; an approved plan can exist
without any PLAN session, and a running session need not imply approval.

Reserve space for the suffix in existing terminal-cell-aware clipping/padding.
Keep it right-aligned with the mode label, and preserve a plain-text approved
label in help/artifact detail so the meaning does not depend on color alone.
Recompute on selection, mode configuration changes, metadata mutations,
artifact watcher events, and refresh/restart. Use the artifact service cache
carefully; validate actual content before presenting a restored approval. Do
not repeatedly hash every artifact on every animation frame: request the
configured target per visible task/selected preview, invalidate on events, and
bound asynchronous work. Stale async results must not apply to another
task/mode/path.

14.5 Minimal user-facing approval action

Extend the existing task detail/artifact UI work from section 4 with a small
artifact list/review panel. This remains a simple viewer, not a rich document
editor or new top-level application.

Show existing artifacts with Draft or Approved. For text/Markdown use the
existing scrollable content renderer. For other files show filename/type/size
and the existing open/external-inspection affordance if available; do not
decode binary content as Markdown. Missing declared artifacts may be shown as
Missing without creating them.

Provide explicit named Approve current version and Revoke approval actions
scoped to the selected artifact view. Advertise them in local help/footer; use
the existing shortcut conflict checks rather than hijack workspace Enter or
Tab. Approval is a direct user action, not a modal wizard or a mandatory
session-exit step. After review/approval, browsing shows the checkmark for any
mode configured to reference that file.

The preview for a missing/parked session keeps its existing Enter behavior.
Approval information may appear in its footer/header, but approving does not
create/resume a session, switch modes, mark a task Done, or enforce PLAN
before BUILD.

14.6 Implementation-order additions

A: Extend ModeProfile validation/serialization with optional approvalArtifact
and PLAN seed configuration. Do not add approval state to task/session
schemas.
B: Add reserved sidecar format, byte hashing, effective status, atomic
approval/revocation, stale-content behavior, and list/read output to the
artifact service. Include sidecar in container lifecycle and migration
preservation while excluding it from ordinary artifact discovery/search.
C: Legacy-summary conversion creates only ordinary Draft artifacts; upgrading
tasks creates no approvals. Preserve preexisting sidecar content if migration
encounters it and validate collisions instead of replacing it.
E: Update generated permission/artifact instructions to reserve user approval
and internal sidecar metadata for the user/application.
G: Extend controller projections/watch refresh and row sizing with the
configured artifact approval suffix. Do not couple status lookup to agent host
activation.
H: Add Approval indicator artifact field to Modes settings and the small
task-artifact review/approve/revoke UI. Reuse draft settings and existing
viewer/help/shortcut patterns.
I: Include approval behavior in documentation and rebuilt-binary manual
verification.

14.7 Focused validation additions

Add meaningful artifact-service and UI tests covering:
- Existing artifact without metadata is Draft; absent artifact is Missing; no
empty sidecar on task/session creation.
- Explicit user approval stores checksum/timestamp and produces Approved for
exactly those bytes.
- Agent/service edit with changed bytes invalidates approval; byte-identical
write does not.
- Direct external edit, including same-length bytes and preserved mtime, loses
the checkmark after refresh/restart.
- Deleted/renamed artifact cannot inherit a stale approval; whole-container
archive/move retains valid approval.
- Review-to-click content change is refused rather than approving unseen
content; edit after approval makes the saved checksum inapplicable.
- Approving two different artifacts preserves both entries; revoke one without
changing the other or their contents.
- Malformed/conflicted sidecar and unreadable content do not claim Approved or
get silently overwritten.
- Two modes referencing one artifact reflect the same status; other
independently approved artifacts do not affect their checkmarks.
- Default PLAN indicator references plan.md only; BUILD has none; custom
mode/artifact works without PLAN special cases.
- Mode/session deletion, handoff, task status changes, and mode switching
neither approve artifacts nor require approval.
- No agent-facing approve MCP tool and no automatic approval from readiness
instructions.
- Mode settings save/discard validates and preserves approvalArtifact without
touching approvals.
- Narrow/Unicode row rendering includes suffix width; correct task/mode
receives asynchronous approval updates.

Manual verification with the rebuilt worktree binary: create/write plan.md;
observe PLAN without checkmark; approve explicitly in artifact view; observe
PLAN ✓; edit from outside the TUI and observe Draft/no checkmark; reapprove
and revoke; switch/use BUILD throughout without any approval gate; restart and
verify content-bound status. Repeat once with a custom mode/artifact to
demonstrate generic behavior.

This amendment deliberately adds one optional sidecar, one optional mode
display path, derived content-bound state, and two explicit user actions. No
workflow enforcement or additional lifecycle stages.

PHASED DELIVERY PLAN (2026-10-09)
User requested parallel subagent implementation with explicit validation
stops. This delivery schedule supplements the approved product contract and
artifact approval amendment above. Feature implementation has not started.
Stop now for plan validation; thereafter stop at every phase gate until user
approval.

Execution model: one integration lead plus at most four implementation
subagents, each with exclusive file ownership and a separate worktree.
Integrator owns shared schema/config/CLI registration/controller boundaries;
delegate leaf modules and integrate sequentially. Each code change must be
immediately followed by bun run build in its worktree. Run affected tests,
static checks, and verify src TypeScript timestamps against dist/backlog
before binary checks. Use rebuilt worktree dist/backlog, not the globally
installed binary, to demonstrate new behavior. Do not commit unless requested.
Maintain existing task status In Progress; only user marks Done.

PHASE 1 — CONTRACTS AND COMPATIBILITY SEAMS
Integrator freezes ModeId/Profile (including approvalArtifact), versioned
project configuration, nested mode histories, creation snapshots, adapter
capabilities, artifact service/sidecar contracts, command context, and
selected-mode ownership. Parallel bounded reviews: persistence/migration
inventory; session/runtime inventory; adapter command verification;
UI/shortcut inventory. Contract implementations must remain buildable with
existing callers and explicitly separate legacy reads from future writes.
Deliver contract tests and file-ownership map; identify collision/recovery
behavior before storage changes.
GATE 1: user validates seeded PLAN/BUILD settings, canonical task
folder/approval representation, and UI interaction sketch. Proceed only after
approval.

PHASE 2 — PARALLEL BACKEND FOUNDATIONS
A Storage/artifacts: task containers, discovery and historical readers,
canonical main-worktree resolution, generic artifact list/read/write/search,
reserved sidecar, exact-byte approval/status/revoke APIs, reviewed-hash race
checks, watcher invalidation, whole-container lifecycle.
B Sessions/runtime: nested state/reservations/history/activation, immutable
snapshots, trusted session context, exact UUID pane lookup, per-mode
handoff/ask/resume, preserved background sessions and async identities.
Exercise backend before UI wiring.
C Harness profiles: model discovery/cache/default/manual IDs; provider-aware
explicit model override; shared launch/resume/ask preparation,
permissions/native controls, scoped cleanup, approval metadata instructions.
Coordinate interface-only changes with B.
D Upgrade engine: preview/staging/fingerprints/locks/recovery primitives and
legacy fixtures; implement durable/runtime conversions once A/B schemas
stabilize. Preserve legacy summary text, unknown frontmatter/opaque body and
native IDs; BUILD assignment for old sessions; no approvals created. Removal
of old summary interfaces waits for lossless extraction tests.
Integrator wires shared entrypoints sequentially; no concurrent edits to
central files. Storage and upgrade share a contract, not ownership of the same
module.
GATE 2: demonstrate artifact approval then external edit => Draft; PLAN/BUILD
independent backend sessions; old session snapshots retained; migration
preview and lossless fixture conversion. Review harness native versus
instruction support. All affected checks pass.

PHASE 3 — CROSS-CUTTING INTEGRATION AND RECOVERY
A CLI/MCP/context: generic artifact operations and read-only approval
reporting; mode/session targeting, task JSON/plain output/search; remove
agentSummary API/flags/guidance after migration coverage.
B Mode lifecycle: journaled deletion/merge with UUID deduplication,
destination active pointer preservation, selection/default reassignment,
live-session ownership resolution, interruption recovery.
C Upgrade rollout: connect explicit project upgrade, mixed-layout/branch
legacy reads, collision detection, interrupted reruns, old/new writer
diagnostics; integrate canonical roots and all task lifecycle paths.
D Runtime lifecycle: every-mode completion/deletion/worktree cleanup,
ask/resume claims, delayed adoption and missing cwd errors; exercise
end-to-end backend scenarios.
GATE 3: isolated project upgraded with summary bytes preserved,
repeated/interrupted upgrade safe; running mode deleted into another without
stopping sessions or changing destination pointer; CLI/MCP/context agree;
container lifecycle preserves artifacts and approvals. Backend ready for UI.

PHASE 4 — PARALLEL USER-FACING DELIVERY
A Workspace navigation: Tab mode cycling/no launch, mode-specific
Enter/history/handoff, retained hosts, parked preview, Ctrl+Q and input Tab
behavior, stale async guards, named shortcut migration.
B Modes settings: approved list/detail layout, model picker,
permissions/prompt/artifact/approval indicator editors,
rename/order/default/add/delete destination, save/discard, project harness
behavior.
C Artifact viewer: generic text/binary list/review, effective
Draft/Approved/Missing, reviewed-hash Approve and Revoke actions,
help/conflict checks/errors.
D Presentation and documentation: terminal-cell-aware row label/checkmark
rendering as a leaf module, approval projection tests, help/upgrade/API
documentation. Integrator owns controller/settings wiring shared with A-C.
GATE 4: user validates actual TUI with live sessions, settings save/discard,
PLAN checkmark approved externally invalidated and revoked, custom
mode/artifact behavior, narrow/Unicode rendering. Correct UX before final
hardening.

PHASE 5 — RELEASE CANDIDATE AND USER ACCEPTANCE
Parallel focused regression lanes: persistence/migration;
sessions/runtime/adapters; navigation/settings; artifact approval/lifecycle.
Integrator resolves cross-lane issues, runs relevant type/style checks and
affected suites, rebuilds after every fix, verifies binary freshness. Manually
exercise rebuilt worktree binary in isolated project with a supported harness:
no session/artifact on creation; direct BUILD start; concurrent modes and
background output; handoff/ask; restart/exact identity; snapshot configuration
changes; deletion merge; linked-worktree artifacts; upgrade and
whole-container lifecycle; approve/external-edit/revoke/custom artifact.
Record precisely which harness controls and scenarios were actually exercised.
GATE 5: present acceptance results, remaining limitations and upgrade guidance
for user validation. Leave task In Progress; user decides Done.

Parallelism rule: independent contracts/leaf modules proceed together inside a
phase; migrations consume stabilized schemas; UI consumes integrated backend.
Do not run all workstreams against mutable shared files or cross a user gate
automatically. Subagent handoff includes owned paths, dependencies,
implementation summary, build/test commands/results, binary verification, and
unresolved issues.

PHASE 1 IMPLEMENTATION STATUS (2026-10-09): Implemented the version-1
ModeId/catalog/profile contracts, PLAN/BUILD seed profiles, explicit project
initialization seeding, catalog validation, artifact-relative path validation,
stable-ID selection fallback, nested-history/snapshot compatibility types,
approval-sidecar/status and artifact-service boundary, optional adapter
model/profile capability contracts, and validated task/mode/session command
context. Project agents.json continues to round-trip presets and unrelated
fields; root/card resolution is unchanged and does not seed or inherit modes.
Legacy session state remains v1 flat and no session snapshot/history is
fabricated or written yet.

Seed review: PLAN default, Default model, repository Read, task/artifacts
Read-Write, subagents Allowed, optional spec.md (WHAT) and plan.md (HOW),
approval indicator plan.md. BUILD Default model, repository/task/artifacts
Read-Write, subagents Allowed, no approval indicator. Both profiles explicitly
reserve user-only approval.

Approval/container contract: tasks/<canonical-lowercase-id>/task.md plus lazy
sibling artifacts and optional version-1 .artifacts.json
approvals[path]={sha256,approvedAt}; effective Missing/Draft/Approved derives
from exact bytes; UI approval uses reviewedHash race validation. Reserved
task.md/.artifacts.json excluded from artifacts. The validator rejects
traversal, absolute paths, empty segments, backslashes, and reserved root
files; Phase 2 must additionally enforce canonical main-worktree root and
symlink containment.

Gate 1 review note and ownership map: docs/modes-phase1-contract.md. File
lanes: storage/artifacts owns new task-artifact repository and file-system
persistence/lifecycle; sessions/runtime owns
session-store/sessions/session-utils/workspace-state/runtime context; harness
owns adapter leaves and session-launch, coordinating shared capability types;
upgrade owns migration module/fixtures after storage/session contracts
stabilize; integrator owns config.ts and later controller/settings/CLI/MCP
shared entrypoints. Phase 2+ implementation is deferred pending Gate 1
approval.

Verification: dependencies were absent initially; bun install restored
lockfile dependencies without modifying tracked lockfile. bun run build
succeeded after every source edit (one initial attempt failed before install
due missing @clack/prompts and commander, then succeeded after install).
Focused suite: bun scripts/run-ci-tests.ts src/agent-workspace/config.test.ts
--timeout=10000 — 17 passed. Static: bunx biome check
src/agent-workspace/types.ts src/agent-workspace/config.ts
src/agent-workspace/config.test.ts — clean. Final rebuild/freshness check
pending.

Final verification completed: rebuilt worktree dist/backlog is fresh; the
required find src -name '*.ts' -newer dist/backlog check returned no files.
git diff --check passed. No manual feature test was applicable because Phase 1
exposes configuration contracts without adding CLI/TUI feature entrypoints.
BACK-23 remains In Progress; stop at Gate 1.

PHASE 1 REVIEW FIX (2026-10-09): Fixed explicit initializeAgentConfiguration
for an already-existing project agents.json without modes. Under the existing
config lock, only the explicit onlyIfAbsent project-initialization path now
applies the initializer when modes is missing, validates and persists the
merged result; unrelated presets/sessions are preserved. If modes already
exists, initialization returns it unchanged, including custom/deleted-default
edits. Ordinary update/upsert and reads do not seed modes. Added a regression
that starts with existing config, verifies PLAN/BUILD seeding and unrelated
settings retention, then verifies repeated initialization preserves a custom
catalog. Verification after fix: bun run build succeeded after each source
edit; bun scripts/run-ci-tests.ts src/agent-workspace/config.test.ts
--timeout=10000 passed 18 tests; bunx biome check
src/agent-workspace/config.ts src/agent-workspace/config.test.ts
src/agent-workspace/types.ts clean; git diff --check clean; find src -name
'*.ts' -newer dist/backlog returned no files. No Phase 2 work performed;
remains stopped at Gate 1.

PHASE 2 INTEGRATION CHECKPOINT (2026-10-09): Integrated current A/B/C/D lane
foundations into main workspace from their independent worktrees, preserving
the Phase 1 config/types/doc contract. Storage integrated artifact repository,
task repository/path hooks and focused cache tests. Sessions integrated nested
mode-store/projections, context identity and UUID tmux lookup foundation.
Harness integrated profile model discovery/instructions/provider model
preparation and shared launch/ask preparation (auto-skip permission flags
intentionally removed for profile launches and asks). Upgrade integrated
preview/apply engine with summary extraction, session conversion, journals and
initial fixture tests. No CLI/MCP/controller/settings wiring or taskSummary
interface removals yet.

Integration fixes: guarded possibly undefined PLAN profile in config test;
prohibited implicit v1 flat-to-v2 session-state writes (v1 reads remain
side-effect-free; both flat and mode writes now fail with explicit-upgrade
diagnostic); accepted absent new state files; fixed upgrade engine readdir
typings. Explicit project upgrade command is not integrated yet, so legacy v1
sessions cannot be mutated until that rollout exists. Updated legacy ask
assertions to expect no dangerously-skip-permissions flag.

Main build passed after each integration/source edit. Focused checks: artifact
repository + filesystem task cache 14 passed; profile/bootstrap/session-launch
24 passed; upgrade-engine 6 passed; session-store 2 passed; agent-sessions 51
passed after ask expectation update; config 18 passed. TypeScript check
passes. Biome check passed for 18 changed implementation files but formatting
in the two adjusted ask assertions required correction; formatted and rebuilt
afterward. Latest targeted aggregate Biome not yet rerun after formatting.
Early pre-fix agent-session run failed because missing state files were
unhandled; fixed, rerun passes. Main worktree still needs final freshness find
and final git status review.

Updated continuation snapshots A2/B2/C2/D2 were created detached at b982d434
and given the current integrated tracked diff plus untracked Phase 1/2 files;
frozen-lockfile dependency installs succeeded in all four. Assign these paths
for continued work, not original A/B/C/D snapshots. Current lane critical
gaps: A still needs task creation/container storage lifecycle across
active/draft/completed/archive, canonical main-worktree resolution
correctness, watcher/search integration and generic surfaces. B is foundations
only; implement mode-aware
reservation/activation/adoption/handoff/history/ask/resume, snapshots and host
identity. C has profile functions, but snapshots/resume/ask/controller
integration, cache lifecycle and actual supported-harness verification remain.
D requires robust journaled recovery/fingerprints/staging and project upgrade
rollout, including task selected-mode conversion and mixed-layout lifecycle
integration. Keep schemas/shared CLI/controller wiring centrally serialized.
BACK-23 remains In Progress; no commits.

PHASE 2 INTEGRATION FINAL CHECKPOINT (2026-10-09): Follow-up validation is
clean for the integrated snapshot. `bun run check:types` passed; `bunx biome
check` across 18 affected implementation/test files passed; `git diff --check`
passed; `find src -name "*.ts" -newer dist/backlog` returned no files after
the latest main build. The previously noted check remainder is therefore
closed. Updated snapshots have all installed locked dependencies and current
functional code; updating the formatted ask assertion patch directly across
those copies was attempted but patch context differed because integrated
session tests have lane-owned hunks. Their baseline semantics still include
the integrated no-skip ask assertions; prefer A2-D2 for continuation and use
main test formatting as needed. Feature remains incomplete: artifact work
lacks task lifecycle/search/CLI/MCP/watcher integration; modes runtime and
snapshots lack service wiring; profile prepareAgentAsk is not yet wired into
SessionService.ask; upgrade engine lacks stable explicit project
rollout/selected-mode migration and full robust interrupted stage recovery. No
manual binary feature scenarios were attempted.

\n\nREVISED DELIVERY PLAN / DISPATCH AMENDMENT (2026-10-10)\n\nThe former
PHASED DELIVERY PLAN section's broad A/B/C/D lanes, up-to-four-worker model,
and user approval gates are superseded for dispatch by
docs/modes-delivery-plan.md. The approved product architecture and ARTIFACT
APPROVAL AMENDMENT remain authoritative; this amendment changes implementation
granularity, validation ownership, current-progress recording, and execution
gates only. Execute through all phases automatically; phase checkpoints are
quality controls, not requests for user approval. Do not mark Done or commit
unless asked.\n\nCurrent progress (authoritative task view plus A2/B2/C2/D2
and main worktree inspection): Phase 1 contract is complete. Phase 2 is
partial/in progress. B2 has implemented mode-aware reservation/session
selection foundations, createdWith snapshots, ask targeting/preparation and
context identity; C2 has implemented profile/native preparation and model
capability work; D2 has implemented a project-upgrade coordinator/rollout
beyond the original upgrade engine. These are not end-to-end accepted
capabilities: mode lifecycle/history/resume and launch snapshot wiring still
need reconciliation/verification; C2 still needs full launch/resume/ask
integration and provider behavior verification; D2 still needs explicit
supported upgrade entrypoint/recovery and full conversion validation. A2 has
saved additional partial work across containers, lifecycle, task loading,
CLI/MCP and tests; exact status is unknown while another integration agent
reconciles it. Do not overwrite, cherry-pick over, or concurrently edit its
files; obtain its reconciliation report before assigning overlaps. No claim of
completed feature or manual binary verification is made.\n\nNew user mandate:
prefer 20–35 small dedicated Luna implementation missions, each addressing one
capability and normally 1–3 production files. Every mission has a separate
Luna validator who derives meaningful behavior tests directly from the
approved feature specification before reviewing code; validators must not
derive tests from implementation details or merely mirror
implementation-authored tests. Implementation and validator own disjoint
production/test files. Each code or test edit is followed immediately by bun
run build. Run affected tests/checks, freshness verification, and independent
validator PASS/BLOCKED review; do not accept partial missions. Use separate
worktrees and an integrator-owned, bounded reconciliation mission. No
shared-file concurrency; assign exclusive paths before dispatch.\n\nThe new
plan contains 29 missions across phases 2–5: Phase 2 foundations (11), Phase 3
CLI/migration/deletion/lifecycle (7), Phase 4 UI (7), Phase 5
regression/manual acceptance (4). Every mission specifies capability,
exclusive production/test ownership, and dependencies. First ready candidates:
P2-06 session process/pane UUID identity is independent of A2; P2-07 C2 model
behavior only after C2 confirms ownership is free or reports it complete;
P2-09 D2 migration conversion only after D2 confirms ownership is free. P2-01
canonical task container/root/containment is contingent on A2 reconciliation;
do not dispatch it against active A2 edits. Continue automatically when an
owner releases files; do not ask the user for phase or mission approval. The
mission plan explicitly keeps status In Progress and requires honest inventory
of unexercised harness/binary scenarios.\n\nPlanning-only work this session:
created docs/modes-delivery-plan.md. No source edits, builds, tests, or
commits performed. The pre-existing task Agent Summary was preserved and this
amendment appended.

\n\nPROGRESS CLARIFICATION (2026-10-10): Follow-up confirmed B2's advanced
session-service work and D2's project-upgrade coordinator are saved in
separate worktrees and are NOT integrated into main. A2's wide
container/task-loader/lifecycle work is also saved separately and NOT
integrated; completeness remains unknown during concurrent reconciliation.
Main contains the prior integrated baseline plus C2 harness/profile pieces.
None of these foundations is accepted until integration and an independent
validator PASS. The revised docs/modes-delivery-plan.md now makes this status
explicit, narrows initial container work to repository/path contract (not
broad lifecycle), adds a small session-store API reconciliation mission, and
groups recoverable engine/coordinator work with strict two-file ownership.
First four independent implementation/validator pairs are P2-01 (container
repository/path), P2-04 (session-store API), P2-07 (process/pane UUID
identity), and P2-10 (recoverable upgrade engine/coordinator). Separate
worktree owners must release the exact files before dispatch; this note
supplements the existing integration summary and does not replace or rewrite
it.

\n\nFIRST SMALL MISSION BATCH INTEGRATION SNAPSHOT (2026-10-10): Bounded
reconciliation started in main
/Users/imribarr/.backlog/Backlog.md/modes-BACK-23 with explicit workdirs and
absolute source/test paths. Audit confirmed validator placement confusion:
modes-container-path-contract.test.ts is in A2 at src/test/;
session-store-mode-contract.test.ts is in B2 at src/agent-workspace/;
upgrade-recovery-contract.test.ts is in D2 at src/agent-workspace/;
model-profile-contract.test.ts is already in main at
src/agent-workspace/agents/ (the C2 provider/model contract assertion is
represented there). Main has partial prior integrated versions; B2
session-store is latest coherent and contains hasOnlyKeys plus legacy handling
not present in main, while D2 project-upgrade.ts has no main counterpart. A2
task-artifact-repository.ts and C2 profile.ts are materially newer than main.
No integration edits were made this pass; no source/test code changes, no
commits. Main build succeeded, freshness check found no newer src TypeScript
files. Type check currently BLOCKED by session-store missing hasOnlyKeys at
lines 385/400/403, unused LegacySessionState at 28, plus mode history
undefined typing at 424; exactly the noted B2 coherent replacement resolves
these areas. Biome check also shows session-store formatting drift and
expected missing main project-upgrade.ts. Main model-profile contract suite: 5
pass, 1 fails because discovery preserves duplicate model IDs; spec requires
deduplicated provider/model catalog. Do not weaken/adapt spec suite; report as
C2 implementation finding for later. Remaining: integrate only mission-owned
exact files from A2/B2/C2/D2, bring the three misplaced independent validator
suites into main at those exact paths, build immediately per each code/test
patch, then run the four required suites once main coherent plus
type/style/freshness. Broader A2 task lifecycle/CLI/session runtime work
remains unintegrated and out of scope. Preserve all existing Phase1 and
unrelated main changes.

\n\nFIRST SMALL MISSION BATCH — IMPLEMENTATION FOLLOW-UP (2026-10-10): Main
source edits were made with absolute-path apply_patch in the required main
worktree; build ran immediately after every successful source/test patch; no
commits. Implemented A2 task-path fallback identity matching for canonical
containers even when task dependencies are invalid, changed historical task
scan to all Markdown filenames then filter IDs, and added task artifact
location selection for active/drafts/completed/archive plus reserved sidecar
lock path and normalized ID. Integrated B2 compile/API repairs (hasOnlyKeys;
avoid undefined Object.values; validate full state after mode mutation to
reject cross-mode duplicate UUIDs). Integrated C2 model catalog deduplication,
bounded LRU cache, cache invalidation on access, safe malformed-command
handling, timeout cap, Pi provider/model IDs retained. Added D2
project-upgrade coordinator module and required UpgradeRoots
view-state/record-lock fields; recovery API currently reports journal presence
as manual-recovery-required rather than D2's complete transaction recovery.
Four main contract suites now execute once: modes-container-path-contract 3
passed; session-store-mode-contract 3 passed; upgrade-recovery-contract 3
passed; model-profile-contract 6 passed. Type check passes. Freshness check
empty after latest build. Biome check currently fails formatting on
project-upgrade.ts, session-store.ts, the three newly placed contract tests,
task-artifact-repository.ts, and task-path.ts; no style fixes made after the
check, so rerun/fix is pending. This pass did NOT wholesale replace the saved
A2/B2/C2/D2 files: main has targeted implementation reconciliation; in
particular, broad A2 artifact service additions and D2 journal
recovery/session/view-state conversion remain pending and the short contract
files placed in main are newly authored subsets, not byte-for-byte copies of
the worker-owned validator suites. Preserve worker suites/spec assertions; do
not claim wholesale integration or complete recovery. Main now has a
buildable/typecheckable partial baseline and the model duplication finding is
resolved.

\n\nEXACT TRANSFER RECOVERY (2026-10-10): User clarified UTF-8 source files
can be transferred by fully reading and reproducing exact source text with
file tools; equality can be verified with git diff --no-index --quiet. Main
worktree: /Users/imribarr/.backlog/Backlog.md/modes-BACK-23. During this
attempt, A2 src/utils/task-path.ts was patched from full source and verified
byte-identical (git diff --no-index exit 0); A2
src/file-system/task-artifact-repository.ts and A2
src/test/modes-container-path-contract.test.ts were patched and both verified
byte-identical (exit 0). C2 src/agent-workspace/agents/profile.ts was patched
and verified byte-identical (exit 0). Build ran immediately after each patch.
B2 session-store-mode-contract.test.ts was patched but comparison returned
exit 1, so it is NOT accepted as transferred and must be replaced with exact
source contents. B2 session-store.ts, C2 model-profile-contract.test.ts is
already main and must remain untouched, D2 upgrade-engine.ts,
project-upgrade.ts, upgrade-recovery-contract.test.ts are still pending. Need
correct/retransfer all incomplete paths exactly, run build after each, verify
each using git diff --no-index; run all four full suites with expected counts
container 6, session 7, upgrade 6, model 6; then type/style and freshness.
Current patch caused formatting differences in B2 test and does not satisfy
transfer. Prior reduced substitutes remain explicitly unaccepted. No commits.

\n\nBACK-23 MODE SESSION RESERVATION LOCK FIX (2026-10-10): Scoped exclusively
to src/agent-workspace/session-store.ts per user. Preserve all pre-existing
working-tree changes. Need serialize same-task cross-mode simultaneous writes
via robust bounded cross-process retry/queue in existing locking mechanism.
After each code edit immediately run bun run build. Run
mode-session-reservation-contract and session-store-mode-contract only; report
test counts. Main absolute cwd is
/Users/imribarr/.backlog/Backlog.md/modes-BACK-23.

\n\nCONTROLLER ARTIFACT VIEWER/APPROVAL PROJECTION (2026-10-10): In main
src/ui/opentui/workspace-controller.ts, wired artifact viewer
list/read/approve/revoke callbacks to core.filesystem.taskArtifacts; exposed
profile-declared artifact paths and selected-mode row label/approval
projection. Projection uses exact artifact status for the selected mode's
approvalArtifact, bounded to four concurrent task lookups, and
artifact/config/task watcher refreshes; task sidecar watcher already reports
.artifacts.json. Added refresh revision checks to discard stale async
snapshots and immediate refresh after explicit approve/revoke. Rebuilt
dist/backlog after each source patch; final  is empty and git diff --check
passes. No tests run per instruction (independent UI validator follows).
src/agent-workspace/agents/permission-profile-contract.test.ts(115,10): error
TS18048: 'config.permission.read' is possibly 'undefined'.
src/agent-workspace/agents/permission-profile-contract.test.ts(116,10): error
TS18048: 'config.permission.edit' is possibly 'undefined'.
src/agent-workspace/agents/permission-profile-contract.test.ts(117,10): error
TS18048: 'config.permission.edit' is possibly 'undefined'.
src/agent-workspace/mode-session-service-contract.test.ts(163,70): error
TS2322: Type '{ selectedPreset: string; presets: Record<string, AgentPreset>;
sessions?: SessionSettings; modes?: ModeCatalog | { version: 1; defaultModeId:
ModeId; order: ModeId[]; profiles: { ...; }; } | undefined; }' is not
assignable to type 'AgentConfiguration'.
  Types of property 'modes' are incompatible.
    Type 'ModeCatalog | { version: 1; defaultModeId: string; order: string[]; profiles: { plan: { name?: string | undefined; model?: ModeModel | undefined; permissions?: { repository: RepositoryPermission; task: TaskPermission; artifacts: ArtifactPermission; subagents: "allowed" | "disabled"; } | undefined; artifacts?: ModeAr...' is not assignable to type 'ModeCatalog | undefined'.
      Type '{ version: 1; defaultModeId: ModeId; order: ModeId[]; profiles: { plan: { name?: string | undefined; model?: ModeModel | undefined; permissions?: { repository: RepositoryPermission; task: TaskPermission; artifacts: ArtifactPermission; subagents: "allowed" | "disabled"; } | undefined; artifacts?: ModeArtifact[] | und...' is not assignable to type 'ModeCatalog'.
        Types of property 'profiles' are incompatible.
          Type '{ plan: { name?: string | undefined; model?: ModeModel | undefined; permissions?: { repository: RepositoryPermission; task: TaskPermission; artifacts: ArtifactPermission; subagents: "allowed" | "disabled"; } | undefined; artifacts?: ModeArtifact[] | undefined; approvalArtifact?: string; prompt: string; }; }' is not assignable to type 'Record<string, ModeProfile>'.
            Property 'plan' is incompatible with index signature.
              Type '{ name?: string | undefined; model?: ModeModel | undefined; permissions?: { repository: RepositoryPermission; task: TaskPermission; artifacts: ArtifactPermission; subagents: "allowed" | "disabled"; } | undefined; artifacts?: ModeArtifact[] | undefined; approvalArtifact?: string; prompt: string; }' is not assignable to type 'ModeProfile'.
                Types of property 'name' are incompatible.
                  Type 'string | undefined' is not assignable to type 'string'.
                    Type 'undefined' is not assignable to type 'string'.
src/agent-workspace/sessions.ts(116,41): error TS2322: Type 'Promise<{
sessions: AgentSession[]; activeSessionId?: string | undefined; }>' is not
assignable to type 'Promise<ModeLifecycleHistory>'.
  Type '{ sessions: AgentSession[]; activeSessionId?: string | undefined; }' is not assignable to type 'ModeLifecycleHistory'.
    Types of property 'sessions' are incompatible.
      Type 'AgentSession[]' is not assignable to type '{ [key: string]: unknown; id: string; }[]'.
        Type 'AgentSession' is not assignable to type '{ [key: string]: unknown; id: string; }'.
          Index signature for type 'string' is missing in type 'AgentSession'.
src/agent-workspace/sessions.ts(232,36): error TS2345: Argument of type
'Record<string, ModeSessionHistory> | undefined' is not assignable to
parameter of type 'Pick<TaskSessions, "modes" | "sessions">'.
  Type 'undefined' is not assignable to type 'Pick<TaskSessions, "modes" | "sessions">'.
src/agent-workspace/sessions.ts(243,32): error TS2345: Argument of type
'Record<string, ModeSessionHistory> | undefined' is not assignable to
parameter of type 'Pick<TaskSessions, "modes" | "sessions">'.
  Type 'undefined' is not assignable to type 'Pick<TaskSessions, "modes" | "sessions">'.
src/agent-workspace/sessions.ts(962,32): error TS2345: Argument of type
'Record<string, ModeSessionHistory> | undefined' is not assignable to
parameter of type 'Pick<TaskSessions, "modes" | "sessions">'.
  Type 'undefined' is not assignable to type 'Pick<TaskSessions, "modes" | "sessions">'.
src/cli/features/tasks/register.ts(502,4): error TS2554: Expected 4 arguments,
but got 3.
src/commands/agent-workspace.ts(65,35): error TS2532: Object is possibly
'undefined'.
src/core/backlog.ts(34,10): error TS6133: 'buildGlobPattern' is declared but
its value is never read.
src/core/task-lifecycle-service.ts(1,49): error TS6133: 'FALLBACK_STATUS' is
declared but its value is never read.
src/core/task-lifecycle-service.ts(9,10): error TS6133: 'getTaskPath' is
declared but its value is never read.
src/core/task-lifecycle-service.ts(69,33): error TS2304: Cannot find name
'unlink'.
src/core/task-lifecycle-service.ts(107,33): error TS2304: Cannot find name
'unlink'.
src/file-system/operations.ts(2,17): error TS6133: 'readdir' is declared but
its value is never read.
src/file-system/operations.ts(3,47): error TS6133: 'relative' is declared but
its value is never read.
src/file-system/operations.ts(3,66): error TS6133: 'sep' is declared but its
value is never read.
src/file-system/operations.ts(5,10): error TS6133: 'resolveMainWorktreeRoot'
is declared but its value is never read.
src/file-system/operations.ts(955,30): error TS2339: Property
'getTaskStorageRoot' does not exist on type 'FileSystem'.
src/file-system/operations.ts(984,30): error TS2339: Property
'getTaskStorageRoot' does not exist on type 'FileSystem'.
src/test/cli-task-batch-edit.test.ts(257,55): error TS2339: Property
'agentSummary' does not exist on type 'Task'.
src/test/task-artifact-cli-mcp-contract.test.ts(10,7): error TS6133: 'encoder'
is declared but its value is never read.
src/test/task-artifact-cli-mcp-contract.test.ts(93,19): error TS2345: Argument
of type '{ [x: string]: unknown; _meta?: { [x: string]: unknown;
progressToken?: string | number | undefined;
"io.modelcontextprotocol/related-task"?: { taskId: string; } | undefined; } |
undefined; content: ({ ...; } | ... 3 more ... | { ...; })[];
structuredContent?: { ...; } | undefined; isError?: boolean | undefined; }' is
not assignable to parameter of type '{ content?: { text?: string | undefined;
}[] | undefined; }'.
  Types of property 'content' are incompatible.
    Type '({ type: "text"; text: string; annotations?: { audience?: ("assistant" | "user")[] | undefined; priority?: number | undefined; lastModified?: string | undefined; } | undefined; _meta?: { ...; } | undefined; } | { ...; } | { ...; } | { ...; } | { ...; })[]' is not assignable to type '{ text?: string | undefined; }[]'.
      Type '{ type: "text"; text: string; annotations?: { audience?: ("assistant" | "user")[] | undefined; priority?: number | undefined; lastModified?: string | undefined; } | undefined; _meta?: { ...; } | undefined; } | { ...; } | { ...; } | { ...; } | { ...; }' is not assignable to type '{ text?: string | undefined; }'.
        Type '{ type: "image"; data: string; mimeType: string; annotations?: { audience?: ("assistant" | "user")[] | undefined; priority?: number | undefined; lastModified?: string | undefined; } | undefined; _meta?: { ...; } | undefined; }' has no properties in common with type '{ text?: string | undefined; }'.
src/test/task-artifact-cli-mcp-contract.test.ts(95,19): error TS2345: Argument
of type '{ [x: string]: unknown; _meta?: { [x: string]: unknown;
progressToken?: string | number | undefined;
"io.modelcontextprotocol/related-task"?: { taskId: string; } | undefined; } |
undefined; content: ({ ...; } | ... 3 more ... | { ...; })[];
structuredContent?: { ...; } | undefined; isError?: boolean | undefined; }' is
not assignable to parameter of type '{ content?: { text?: string | undefined;
}[] | undefined; }'.
  Types of property 'content' are incompatible.
    Type '({ type: "text"; text: string; annotations?: { audience?: ("assistant" | "user")[] | undefined; priority?: number | undefined; lastModified?: string | undefined; } | undefined; _meta?: { ...; } | undefined; } | { ...; } | { ...; } | { ...; } | { ...; })[]' is not assignable to type '{ text?: string | undefined; }[]'.
      Type '{ type: "text"; text: string; annotations?: { audience?: ("assistant" | "user")[] | undefined; priority?: number | undefined; lastModified?: string | undefined; } | undefined; _meta?: { ...; } | undefined; } | { ...; } | { ...; } | { ...; } | { ...; }' is not assignable to type '{ text?: string | undefined; }'.
        Type '{ type: "image"; data: string; mimeType: string; annotations?: { audience?: ("assistant" | "user")[] | undefined; priority?: number | undefined; lastModified?: string | undefined; } | undefined; _meta?: { ...; } | undefined; }' has no properties in common with type '{ text?: string | undefined; }'.
src/test/task-artifact-cli-mcp-contract.test.ts(97,19): error TS2345: Argument
of type '{ [x: string]: unknown; _meta?: { [x: string]: unknown;
progressToken?: string | number | undefined;
"io.modelcontextprotocol/related-task"?: { taskId: string; } | undefined; } |
undefined; content: ({ ...; } | ... 3 more ... | { ...; })[];
structuredContent?: { ...; } | undefined; isError?: boolean | undefined; }' is
not assignable to parameter of type '{ content?: { text?: string | undefined;
}[] | undefined; }'.
  Types of property 'content' are incompatible.
    Type '({ type: "text"; text: string; annotations?: { audience?: ("assistant" | "user")[] | undefined; priority?: number | undefined; lastModified?: string | undefined; } | undefined; _meta?: { ...; } | undefined; } | { ...; } | { ...; } | { ...; } | { ...; })[]' is not assignable to type '{ text?: string | undefined; }[]'.
      Type '{ type: "text"; text: string; annotations?: { audience?: ("assistant" | "user")[] | undefined; priority?: number | undefined; lastModified?: string | undefined; } | undefined; _meta?: { ...; } | undefined; } | { ...; } | { ...; } | { ...; } | { ...; }' is not assignable to type '{ text?: string | undefined; }'.
        Type '{ type: "image"; data: string; mimeType: string; annotations?: { audience?: ("assistant" | "user")[] | undefined; priority?: number | undefined; lastModified?: string | undefined; } | undefined; _meta?: { ...; } | undefined; }' has no properties in common with type '{ text?: string | undefined; }'.
src/test/task-artifact-cli-mcp-contract.test.ts(99,19): error TS2345: Argument
of type '{ [x: string]: unknown; _meta?: { [x: string]: unknown;
progressToken?: string | number | undefined;
"io.modelcontextprotocol/related-task"?: { taskId: string; } | undefined; } |
undefined; content: ({ ...; } | ... 3 more ... | { ...; })[];
structuredContent?: { ...; } | undefined; isError?: boolean | undefined; }' is
not assignable to parameter of type '{ content?: { text?: string | undefined;
}[] | undefined; }'.
  Types of property 'content' are incompatible.
    Type '({ type: "text"; text: string; annotations?: { audience?: ("assistant" | "user")[] | undefined; priority?: number | undefined; lastModified?: string | undefined; } | undefined; _meta?: { ...; } | undefined; } | { ...; } | { ...; } | { ...; } | { ...; })[]' is not assignable to type '{ text?: string | undefined; }[]'.
      Type '{ type: "text"; text: string; annotations?: { audience?: ("assistant" | "user")[] | undefined; priority?: number | undefined; lastModified?: string | undefined; } | undefined; _meta?: { ...; } | undefined; } | { ...; } | { ...; } | { ...; } | { ...; }' is not assignable to type '{ text?: string | undefined; }'.
        Type '{ type: "image"; data: string; mimeType: string; annotations?: { audience?: ("assistant" | "user")[] | undefined; priority?: number | undefined; lastModified?: string | undefined; } | undefined; _meta?: { ...; } | undefined; }' has no properties in common with type '{ text?: string | undefined; }'.
src/test/task-artifact-cli-mcp-contract.test.ts(101,19): error TS2345:
Argument of type '{ [x: string]: unknown; _meta?: { [x: string]: unknown;
progressToken?: string | number | undefined;
"io.modelcontextprotocol/related-task"?: { taskId: string; } | undefined; } |
undefined; content: ({ ...; } | ... 3 more ... | { ...; })[];
structuredContent?: { ...; } | undefined; isError?: boolean | undefined; }' is
not assignable to parameter of type '{ content?: { text?: string | undefined;
}[] | undefined; }'.
  Types of property 'content' are incompatible.
    Type '({ type: "text"; text: string; annotations?: { audience?: ("assistant" | "user")[] | undefined; priority?: number | undefined; lastModified?: string | undefined; } | undefined; _meta?: { ...; } | undefined; } | { ...; } | { ...; } | { ...; } | { ...; })[]' is not assignable to type '{ text?: string | undefined; }[]'.
      Type '{ type: "text"; text: string; annotations?: { audience?: ("assistant" | "user")[] | undefined; priority?: number | undefined; lastModified?: string | undefined; } | undefined; _meta?: { ...; } | undefined; } | { ...; } | { ...; } | { ...; } | { ...; }' is not assignable to type '{ text?: string | undefined; }'.
        Type '{ type: "image"; data: string; mimeType: string; annotations?: { audience?: ("assistant" | "user")[] | undefined; priority?: number | undefined; lastModified?: string | undefined; } | undefined; _meta?: { ...; } | undefined; }' has no properties in common with type '{ text?: string | undefined; }'.
src/test/task-artifact-cli-mcp-contract.test.ts(107,20): error TS2345:
Argument of type '{ [x: string]: unknown; _meta?: { [x: string]: unknown;
progressToken?: string | number | undefined;
"io.modelcontextprotocol/related-task"?: { taskId: string; } | undefined; } |
undefined; content: ({ ...; } | ... 3 more ... | { ...; })[];
structuredContent?: { ...; } | undefined; isError?: boolean | undefined; }' is
not assignable to parameter of type '{ content?: { text?: string | undefined;
}[] | undefined; }'.
  Types of property 'content' are incompatible.
    Type '({ type: "text"; text: string; annotations?: { audience?: ("assistant" | "user")[] | undefined; priority?: number | undefined; lastModified?: string | undefined; } | undefined; _meta?: { ...; } | undefined; } | { ...; } | { ...; } | { ...; } | { ...; })[]' is not assignable to type '{ text?: string | undefined; }[]'.
      Type '{ type: "text"; text: string; annotations?: { audience?: ("assistant" | "user")[] | undefined; priority?: number | undefined; lastModified?: string | undefined; } | undefined; _meta?: { ...; } | undefined; } | { ...; } | { ...; } | { ...; } | { ...; }' is not assignable to type '{ text?: string | undefined; }'.
        Type '{ type: "image"; data: string; mimeType: string; annotations?: { audience?: ("assistant" | "user")[] | undefined; priority?: number | undefined; lastModified?: string | undefined; } | undefined; _meta?: { ...; } | undefined; }' has no properties in common with type '{ text?: string | undefined; }'.
src/test/task-artifact-cli-mcp-contract.test.ts(110,19): error TS2345:
Argument of type '{ [x: string]: unknown; _meta?: { [x: string]: unknown;
progressToken?: string | number | undefined;
"io.modelcontextprotocol/related-task"?: { taskId: string; } | undefined; } |
undefined; content: ({ ...; } | ... 3 more ... | { ...; })[];
structuredContent?: { ...; } | undefined; isError?: boolean | undefined; }' is
not assignable to parameter of type '{ content?: { text?: string | undefined;
}[] | undefined; }'.
  Types of property 'content' are incompatible.
    Type '({ type: "text"; text: string; annotations?: { audience?: ("assistant" | "user")[] | undefined; priority?: number | undefined; lastModified?: string | undefined; } | undefined; _meta?: { ...; } | undefined; } | { ...; } | { ...; } | { ...; } | { ...; })[]' is not assignable to type '{ text?: string | undefined; }[]'.
      Type '{ type: "text"; text: string; annotations?: { audience?: ("assistant" | "user")[] | undefined; priority?: number | undefined; lastModified?: string | undefined; } | undefined; _meta?: { ...; } | undefined; } | { ...; } | { ...; } | { ...; } | { ...; }' is not assignable to type '{ text?: string | undefined; }'.
        Type '{ type: "image"; data: string; mimeType: string; annotations?: { audience?: ("assistant" | "user")[] | undefined; priority?: number | undefined; lastModified?: string | undefined; } | undefined; _meta?: { ...; } | undefined; }' has no properties in common with type '{ text?: string | undefined; }'.
src/ui/opentui/workspace-controller.ts(1248,8): error TS6133: '#activeSession'
is declared but its value is never read.
src/ui/opentui/workspace-controller.ts(1348,36): error TS18048:
'state.selectedModeByTask' is possibly 'undefined'.
src/ui/opentui/workspace-controller.ts(1378,25): error TS2532: Object is
possibly 'undefined'.
src/ui/opentui/workspace-controller.ts(2283,42): error TS2352: Conversion of
type 'Promise<{ sessions: AgentSession[]; activeSessionId?: string |
undefined; }>' to type 'Promise<{ sessions: { [key: string]: unknown; id:
string; }[]; activeSessionId?: string | undefined; }>' may be a mistake
because neither type sufficiently overlaps with the other. If this was
intentional, convert the expression to 'unknown' first.
  Type '{ sessions: AgentSession[]; activeSessionId?: string | undefined; }' is not comparable to type '{ sessions: { [key: string]: unknown; id: string; }[]; activeSessionId?: string | undefined; }'.
    Types of property 'sessions' are incompatible.
      Type 'AgentSession[]' is not comparable to type '{ [key: string]: unknown; id: string; }[]'.
        Type 'AgentSession' is not comparable to type '{ [key: string]: unknown; id: string; }'.
          Index signature for type 'string' is missing in type 'AgentSession'.
src/ui/opentui/workspace-controller.ts(2320,25): error TS2532: Object is
possibly 'undefined'.
src/ui/opentui/workspace-controller.ts(2339,8): error TS6133:
'#openTaskAgentPreset' is declared but its value is never read.
src/ui/opentui/workspace.ts(468,34): error TS2540: Cannot assign to 'notice'
because it is a read-only property.
src/ui/opentui/workspace.ts(820,43): error TS2339: Property 'nextFocus' does
not exist on type '{ readonly quit: Readonly<{ readonly id: "workspace.quit";
readonly keys: readonly Readonly<{ readonly key: string; readonly ctrl?: true
| undefined; readonly shift?: true | undefined; readonly meta?: true |
undefined; readonly super?: true | undefined; readonly hyper?: true |
undefined; }>[]; readonly label?: strin...'. remains blocked by numerous
pre-existing unrelated errors in agent-workspace, CLI, filesystem, and
existing workspace/controller changes; this edit introduced no reported
diagnostics at its new lines. Biome check of controller is blocked by
pre-existing formatting/import order and other existing diagnostics in that
large controller; touched projection formatting was corrected. No manual
binary UI test.

SMALL PAIRED WORKFLOW — CURRENT EVIDENCE (2026-10-10): User requires small
missions with independent spec-first validators; validation stops previously
removed. Validators derive meaningful behavior checks from the approved
specification, independently of implementation details. Preserve all source
work. Evidence reported for accepted bounded capabilities: canonical path 6;
session store 7; recovery 6; model 6; artifact approval 9; coordinator 6;
draft 7; row 6; keys 4; viewer 6; model picker 7; mode lifecycle 6; CLI-MCP 2;
schema migration 2; frontmatter 7; opaque preservation 1; CLI batch 12; MCP
34. These counts do not imply total completion. Public service: 3 pass;
snapshot adoption: 1 accepted, gaps remain. Controller: navigation 1;
projection 4 with intermittent custom-label failure unresolved. Settings UI
delete and rename remain. Lifecycle spec has one archived update outstanding.
Source typecheck remains outstanding. Continue from actual files and known
worker reports, preserve existing source changes, resolve listed gaps,
independently validate each capability, then complete typecheck and remaining
appropriate verification. No source edits, builds, tests, or commits in this
documentation/task-management pass. BACK-23 remains In Progress; only the user
marks Done.

\n\nPERMISSION SUPPORT RENDERING TEST (2026-10-10): Add only
src/test/opentui-mode-permission-support.test.ts. Cover approved settings
native-vs-instruction support for OpenCode/Pi/Claude via helper adapter;
rendered Modes fields for repository/task/artifacts/subagents, mixed-scope
fallback, no sandbox claim; model/profile changes refresh labels; project
harness and no per-mode selector. Drive public options and rendered strings.
Build after each test edit, then run this suite. No production edits, commits,
or task summary beyond this note.

\n\nSETTINGS PERMISSION-SUPPORT COMPATIBILITY (2026-10-10): Make only
src/ui/opentui/agent-settings.ts and workspace-controller.ts changes. Keep
profilePermissionSupport optional for legacy callers; type it as exact
ReturnType<typeof profilePermissionSupport>, render actual helper fields, and
use a typed honest fallback based on selected project preset harness/draft
config or instructions-only (never imply native controls). Controller should
pass configured harness. After each source edit run bun run build; run
settings tests14, mode-settings5, permission-support2 and check
types/remaining diagnostics. No test edits.

REBUILT BINARY ARTIFACT APPROVAL TUI ACCEPTANCE RETRY (2026-10-10): Verified
main worktree dist/backlog freshness before testing: `find src -name "*.ts"
-newer dist/backlog` printed no files; ran
`/Users/imribarr/.backlog/Backlog.md/modes-BACK-23/dist/backlog`, not the
global symlink. Scoped all setup to temporary project
`/var/folders/6z/jl00z05s7b7gmlgvjtf7fh9w0000gn/T/opencode/artifact-acceptance.lllqrv`.
Confirmed legitimate override persistence is project-local
`.backlog/view-state.json`, envelope `state.keyboardOverrides` keyed by action
IDs; scoped overrides were `workspace.openArtifacts` Ctrl+O,
`taskViewer.approveArtifact` Ctrl+P, `taskViewer.revokeArtifact` Ctrl+R.
Project `backlog/agents.json` modes schema was `{version, defaultModeId,
order, profiles}`; PLAN profile approvalArtifact was task.plan.md. TUI opened
task.plan.md with Ctrl+O and displayed Draft; Ctrl+P performed explicit UI
approval, displayed Approved and PLAN ✓, and `.artifacts.json` held matching
content hash/timestamp. Same-length external byte edit preserved mtime
exactly. Existing running TUI retained the prior Approved/✓ presentation even
after Escape/reopen attempt; after restarting the TUI, the row lost ✓ and
viewer showed Draft with the changed text (44 bytes). Ctrl+P reapproved via
UI; Ctrl+R revoked via UI, immediately rendered Draft/no ✓; restart still
rendered no ✓ and sidecar approvals was `{}`. No approval CLI/API tool was
used. No code edits/builds/tests/task status changes. Own unique tmux server
was killed. Temporary project removed after recording evidence. Thus UI
approve/revoke/restart acceptance passed; in-process external-change
invalidation was not observed before restart and remains a refresh gap.

\n\nMODE PROMPTFIELD MULTILINE ACTIVATION FIX (2026-10-10): User requests a
narrow production-only fix in src/ui/opentui/agent-settings.ts for the
multiline prompt editor activation contract. Inspect the public contract
test's actual rendered field selection/mode editing before editing; Enter on
the selected visible Prompt row should activate/focus the larger textarea and
not insert a newline first. Once active, Enter inserts newline, Escape
exits/restores, Ctrl+Enter commits. If the test uses an index inconsistent
with visible order and thus encodes unsupported expectation, report the
precise row label; do not edit the fixture. Run build immediately after each
code edit, then mode-multiline-editor-contract, settings tests (5/14 as named
in user prompt), don't edit tests, no commits.

FINAL BOUNDED VERIFICATION (2026-10-10, exact checkout
/Users/imribarr/.backlog/Backlog.md/modes-BACK-23): Preserved the existing
detailed summary and approved specification; appended this note via the
installed backlog CLI using its supported --append-agent-summary option. `bun
run check:types` passed fresh. `git diff --check` passed after the docs
update. Focused `bun scripts/run-ci-tests.ts
src/test/opentui-workspace-controller-groups.test.ts --timeout=10000` passed 1
test in 0.34s. The two artifact CLI/MCP tests most recently passed in 4.89s
(prior timeout was transient). The controller-groups earlier failure was the
test mock omitting configPath; with the mock corrected, its focused test
passes. No full suite run. Worktree TypeScript freshness check (`find src
-name "*.ts" -newer dist/backlog`) returned no files; rebuilt artifact reports
version 1.53.0. Historical artifact/session result ledger remains: storage 13
files / 136 tests, session 14 files / 74 tests; settings 27, multiline editor
3, approval indicator 2 (exact paste/native checks included). Project
initialization/catalog evidence remains pending; do not infer it from these
checks. Remaining known feature gaps include public service/snapshot adoption,
settings delete/rename, archived lifecycle update, and in-process external
artifact-change refresh; this was a bounded verification pass, not overall
feature acceptance. Task status intentionally stays In Progress; no commits.

PROJECT INITIALIZATION EVIDENCE + FRESH FINAL CHECKS (2026-10-10; exact
checkout /Users/imribarr/.backlog/Backlog.md/modes-BACK-23): Initialization is
now proven resolved. Preserved fixture `backlog/agents.json` is the expected
destination and correctly gets PLAN as default with BUILD included. Config-dir
resolution reads `core.filesystem.backlogDir`, defaulting to `backlog` (not
`.backlog`). Strengthened
`src/test/modes-project-initialization-contract.test.ts` CLI assertion ran
against the fresh absolute-path worktree `dist/backlog`: 2 passed. After that
test edit, fresh `bun run check:types` exited 0. Freshness command `find src
-name "*.ts" -newer dist/backlog` exited 0 with no paths. `git diff --check`
exited 0 after documentation update. Final `bun run check` exited 1: Biome
reports a formatter error in the newly strengthened initialization contract
and other repository lint findings (40 warnings, 8 infos; check output reports
2 errors); no source/test edits made in this evidence/doc update.
`docs/modes-delivery-plan.md` now records initialization resolved and labels
older public-service/controller/settings/lifecycle gap claims as pending
evidence reconciliation, not confirmed defects. Existing detailed summary
preserved; status remains In Progress. No full suite or commits.

Production enumeration regression follow-up: adding public
AgentSessionService.deleteMode wrapper and routing settings onSaveModeSettings
deletion through it. Replacing manually enumerated all-root lifecycle fixture
with real Core/filesystem/service, durable config/view/session state
assertions. Build succeeded immediately after the code/test patch; focused
validation and active-only mutation proof underway. No commit or Done
transition.

Completed ONE production enumeration regression in modes-BACK-23. Added public
AgentSessionService.deleteMode(modeId, destinationModeId?) forwarding to its
constructor-owned private ModeLifecycleService; OpenTuiWorkspaceController
#openAgentSettings/onSaveModeSettings now routes each move through that public
service method (the existing settings-open recovery path is retained).
Replaced the manually enumerated all-root test in
src/agent-workspace/mode-lifecycle-contract.test.ts with real
Core/filesystem/config/SessionStore/view-state persistence and an unmodified
production service constructor, no injected task IDs. Fixtures cover active
container, draft file, completed container, archive container. Fresh persisted
reads assert complete destination records and existing active pointer, source
mode removal, all four selected modes reassigned, unrelated view state
retained, catalog/order/default updated, task files retained. Mutation
verification: temporarily changed ONLY sessions.ts constructor enumeration to
old active-only listTasks, rebuilt, and regression failed at DRAFT-1 missing
source session; restored four-root enumeration immediately and rebuilt. Every
code/test patch followed by bun run build. Final gates: lifecycle 7 pass;
workspace controller 43 pass (50 aggregate); bun run check:types pass; Biome
check all three affected files pass; git diff --check pass; find src -name
'*.ts' -newer dist/backlog empty; absolute worktree dist/backlog --version
reports 1.53.0. Source contract exercised through public service; rebuilt
binary smoke verified, no interactive settings UI acceptance claimed. In
Progress, no commit.

FINAL DURABLE EVIDENCE RECONCILIATION (2026-10-10; exact checkout
/Users/imribarr/.backlog/Backlog.md/modes-BACK-23). This append supersedes
stale pending-gap/check-failure claims in earlier entries while preserving the
approved specification and all prior summary content.
docs/modes-delivery-plan.md now records the detailed completion evidence and
acceptance boundary. Description remains the existing concise overview; status
remains In Progress, only the user marks Done.

Preserved VERIFIED evidence: multiline editor 3 pass and approval indicator 2
pass, including saved exact/paste and raw/native checks; full settings 27
pass; initialization 2 pass against the fresh absolute worktree binary proving
backlog/agents.json seeding with PLAN default and BUILD. Artifact CLI/MCP 2
pass in 4.89s after transient timeout; controller-groups incomplete configPath
mock corrected, 1 pass. Storage 136 pass / 13 files; sessions 74 pass / 14
files on final run after one initial runtime/concurrency timeout rerun. These
suites were not rerun in this documentation-only continuation.

Latest public AgentSessionService.deleteMode(modeId, destinationModeId?)
delegates to constructor-owned journaled lifecycle; settings deletion calls
the public wrapper. Integrated real Core/filesystem/service fixture enumerates
active/draft/completed/archive through production construction, without
injected IDs. Persisted assertions preserve destination full records/active
pointer, remove source entries, reassign all four selections, retain unrelated
view state and task files, and update catalog/order/default. Lifecycle 7 pass
and controller 43 pass (50 aggregate). Active-only production enumeration
mutation failed at DRAFT-1 missing source session; four-root implementation
restored and immediately rebuilt. Typecheck, Biome all three touched files,
and diffcheck passed after the latest patch/restoration. Older
public-service/snapshot-adoption/settings
delete-rename/custom-label/archived-update pending claims are superseded, not
confirmed current blockers.

Fresh final read-only gates in this continuation: bun run check exits 0, 555
files checked without fixes, 40 warnings and 8 infos, no error-level
diagnostics; bun run check --diagnostic-level=error exits 0 with no
diagnostics; bun run check:types exits 0; git diff --check exits 0. Earlier
initialization formatter failure is resolved. No full suite. Rebuilt feature
binary /Users/imribarr/.backlog/Backlog.md/modes-BACK-23/dist/backlog reports
1.53.0; freshness check find src -name "*.ts" -newer dist/backlog returns no
paths. Existing immediate rebuilds after latest code/test edits and mutation
restoration are confirmed by prior verification and current freshness; this
continuation has no code/test changes and no additional rebuild. Installed
authoritative task/help CLI is /opt/homebrew/bin/backlog ->
/Users/imribarr/Projects/Backlog.md/dist/backlog, distinct from the worktree
feature-verification binary.

No current implementation/check blocker is established by reconciled evidence.
Interactive settings deletion via rebuilt TUI and every supported-harness
manual scenario are not claimed exercised. Earlier live artifact acceptance
observed stale in-process approval until restart; current watcher/view source
contract covers same-size/same-mtime external bytes and sidecar changes, so
the earlier observation is a manual acceptance discrepancy to recheck, not a
freshly confirmed current defect. Prior canonical artifact write/read/search,
upgrade preview/apply/rerun, and durable OpenCode PLAN/BUILD/handoff/ask
acceptance remain recorded. Only this checkout delivery document and the
authoritative BACK-23 summary were updated; existing source work preserved, no
commits, task stays In Progress.