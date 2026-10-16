---
consolidation:
  total: 480
  counts:
    exists: 4
    discard: 472
    integrate: 4
    unconfirmed: 0
  percentages:
    exists: 0.83%
    discard: 98.33%
    integrate: 0.83%
    unconfirmed: 0.00%
---
# AoE Functionality Map (canonical)

Agent-of-Empires (AoE) functionality reference, assembled from the pinned source audit and six
domain lane artifacts. This is a **reference for aligning Backlog**, not an implementation plan,
not artifact approval, and not a green-light to resume Backlog implementation.
<!-- consolidation: exists; ref: docs/SPEC.md#authority; reason: Reference evidence is not approval or implementation authorization. -->

## 1. Purpose, pin, how to use, authority & limits

- **Purpose.** One canonical, honesty-preserving map of what AoE (the pinned CLI/TUI/daemon at the
  pin) actually does, so Backlog work can be aligned against observed behavior rather than copied
  from marketing, docs, or intent.
<!-- consolidation: discard; ref: none; reason: External inventory purpose. -->
- **Repository.** `agent-of-empires/agent-of-empires`, package version `1.19.0` at the pin.
<!-- consolidation: discard; ref: none; reason: External audit provenance. -->
- **Pin.** `563456d8a05eddd2e09628de151d15a0e16b183e` (`fix(tui): preserve failed purge retry state
  (#4352)`), verified `git rev-parse HEAD` in every lane. Checkout used by lanes:
  `/var/folders/6z/jl00z05s7b7gmlgvjtf7fh9w0000gn/T/opencode/aoe-source-audit` (clean, 1,874
  tracked paths; no deleted or skip-worktree paths).
<!-- consolidation: discard; ref: none; reason: External checkout evidence. -->
- **Blob base.** Every source path below resolves to
  `https://github.com/agent-of-empires/agent-of-empires/blob/563456d8a05eddd2e09628de151d15a0e16b183e/<path>`.
<!-- consolidation: discard; ref: none; reason: External source-reference resolution convention. -->
- **How to use.** Find the feature ID by domain (S/R/W/A/C/O), read its WHAT/HOW/config/unsupported
  and source refs; treat the **depth grade** as the confidence bound. Use the cross-domain section
  (§4) before attributing behavior at a seam, and the discrepancy section (§5) before trusting any
  pinned doc claim.
<!-- consolidation: discard; ref: none; reason: Local inventory reading procedure. -->
- **Authority & limits.** Evidence is **source inspection only** at the pin. No AoE, tmux, provider,
  daemon, build, test, service, or live-process inspection was executed. No external adapter/vendor/
  lockfile internals were read (they are an evidence boundary, not missing files). Line numbers are
  the pin's; the lanes cite them, this map carries them forward unverified at line precision. **This
  map does not establish runtime/actual behavior**, only what the pinned source says. Where a lane
  marked evidence PENDING, this map keeps it PENDING.
<!-- consolidation: discard; ref: none; reason: Audit-specific evidence boundary retained as reference. -->

## 2. Coverage & verification state

**Grade legend (per feature).**

- **[F] body-verified** — the lane read the implementing flow (trigger/guard→calls→effects→
  error/rollback) from source bodies at the pin. Residual subpaths may still be [S]/[G]; see Gaps.
<!-- consolidation: discard; ref: none; reason: Local audit grade definition. -->
- **[S] signature/entry-level** — entry points, structs, enums, or module surfaces read, interior
  flow not exhausted.
<!-- consolidation: discard; ref: none; reason: Local audit grade definition. -->
- **[G] grep/inventory/doc-only** — presence/claims from module lists, grep, or pinned docs; no
  verified flow.
<!-- consolidation: discard; ref: none; reason: Local audit grade definition. -->
- **[U] unread** — no feature is wholly [U] in this pass; unread material appears as per-entry Gaps.
<!-- consolidation: discard; ref: none; reason: Local audit coverage assessment. -->

**Critical honesty rules applied here** (mirrors the inventory's evidence limits):

1. A name, file match, screenshot, or doc sentence is **not** flow evidence.
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Preserve presence evidence versus inspected execution flow distinction. -->
2. Field names in terse baselines are **names, not verified defaults or semantics** unless a lane
   read the default.
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Preserve rule against inferring defaults and semantics from names. -->
3. `[S]`/`[G]`/`PENDING` are **never** promoted to verified fact. Lane PENDING lists are carried into
   the Gaps lines.
<!-- consolidation: exists; ref: docs/SPEC.md#evidence-and-decisions; reason: Unverified evidence remains unverified rather than becoming completed alignment. -->
4. Absence in one grep is **not** proof of absence; the inventory's own failed AGENTS extractor is
   called out as a non-result.
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Preserve incomplete search versus proven absence distinction. -->

**Overall feature-level breakdown (97 features).**

| Domain | Features | [F] | [S] | [G] | [U] |
|---|---|---|---|---|---|
| S — Sessions/state | 18 | 18 | 0 | 0 | 0 <!-- consolidation: discard; ref: none; reason: External audit count. --> |
| R — Native agents/substrate | 12 | 11 | 1 (R08) | 0 | 0 <!-- consolidation: discard; ref: none; reason: External audit count. --> |
| W — Workspaces/sandbox | 12 | 12 | 0 | 0 | 0 <!-- consolidation: discard; ref: none; reason: External audit count. --> |
| A — Structured/ACP | 20 | 20 | 0 | 0 | 0 <!-- consolidation: discard; ref: none; reason: External audit count. --> |
| C — Config/plugins | 17 | 15 | 1 (C04) | 1 (C17) | 0 <!-- consolidation: discard; ref: none; reason: External audit count. --> |
| O — Daemon/UI/ops | 18 | 16 | 2 (O06,O08) | 0 | 0 <!-- consolidation: discard; ref: none; reason: External audit count. --> |
| **Total** | **97** | **92** | **4** | **1** | **0** <!-- consolidation: discard; ref: none; reason: External audit total. --> |

**Where [F] is strong vs thin.** Highest-confidence line-linked deep bodies: S01/S04/S05/S08–S12/
S15–S17, R01–R07/R09–R12, W01–W12, A01–A12/A14–A20, C01/C02/C05/C06/C07/C09/C11–C15, O02/O04/O05/
O07/O09/O10/O12–O16/O18. Deeper than the original audit: S18 (carry/summary + call sites), A16 (upload/
storage bounds), C16 (validation/rollback), O11 (full tip catalog), O17 (migration ledger), O02 (push
handlers), O07 (BINDINGS chord matrix). Remaining thin [F]: R06 (A-side structured prompt path
deferred).
<!-- consolidation: discard; ref: none; reason: Historical audit confidence assessment. -->

**Mechanical inventories inherited from the pin (index-quality, not per-feature proof):**

- CLI root `Commands`: **37 variants** (34 visible roots + 3 hidden); nested command enums totaling
  **90** variants including hidden ACP `Ps`. Pre-clap helpers `__vt-pipe`, `__smart-rename`.
<!-- consolidation: discard; ref: none; reason: External CLI inventory. -->
- TUI: **47 `ActionId`**, **18 app executor `Action`**, **17 context-menu actions**, **29 structured
  `Intent`** variants, 12 web `ShortcutId`.
<!-- consolidation: discard; ref: none; reason: External UI inventory. -->
- HTTP: **152 explicit route templates** (route-template count, not method count) + SPA fallback.
<!-- consolidation: discard; ref: none; reason: External route inventory. -->
- Config: 23 top-level `Config` fields; `SessionConfig` 51, `AcpConfig` 17, `SandboxConfig` 21,
  `WorktreeConfig` 8, `TmuxConfig` 5, `LoggingConfig` 8, `AppStateConfig` 28; settings schema 15 core
  sections.
<!-- consolidation: discard; ref: none; reason: External schema inventory. -->
- ACP: 11 registry keys, 4 bundled adapters (3 manifests-only → external boundary). Native
  `agents.rs::AGENTS`: **17 records** (reconciled by lane R; the inventory's empty extractor result
  was a tooling failure, not absence).
<!-- consolidation: discard; ref: none; reason: External provider inventory. -->

## 3. Feature catalog

Brevity contract per entry: **WHAT** purpose; **HOW** trigger/guard→calls→fs/net/state effects→
success/error/retry/rollback; **config/defaults**; **supported/unsupported**; **source** pinned
file:fn:line (`path:line` per the lane; blob base per §1); **grade** + **gaps**.

### Domain S — Sessions, organization and durable state (S01–S18)

#### S01 — Create a session (CLI `add`, TUI dialog, web wizard, POST /sessions) [F]
- **WHAT.** Build a new session row and optional live launch from path/title/tool/profile.
<!-- consolidation: discard; ref: none; reason: External session creation model. -->
- **HOW (CLI).** `cli/add.rs::run`: guards in order — `--interactive` needs TTY, known profile,
  scratch+path conflict, path exists/canonicalize/must-be-dir, `--repo`/`--project` needs
  `--worktree`, `--repo-base` needs `--worktree`. Resolve project names → resolve config
  (`resolve_config_with_repo_or_warn`) → load instances → `resolve_session_title` → resolve tool →
  fork guards/seed → worktree/workspace creation (W) → parent/group linkage → **pre-persist
  duplicate check** (`cleanup_partial_session` + `duplicate_session_error`) → `Instance::new`, scratch
  provisioning, field assignment, `apply_agent_launch_config`, ACP capability/view election,
  structured agent spec/command-override/install check, sandbox info, repo-trust hook prompt. Persist
  under `acquire_session_identity_lock`, re-check duplicate inside lock, push row (+create group),
  `storage.update`. Optional launch: structured `--launch` no-op; terminal `start_with_size` +
  `merge_post_start` + tmux attach/`capture_launched_session_id_blocking`; launch failure rolls row
  to `Status::Error`.
<!-- consolidation: discard; ref: docs/specs/sessions.md#creation-failure-and-recovery; reason: External creation flow does not replace approved reservation and recovery. -->
- **Alt path.** `session/builder.rs::build_instance` (web/TUI) re-validates host-only agents, scratch
  combos, sandbox runtime, then workspace/worktree creation.
<!-- consolidation: discard; ref: none; reason: External builder flow. -->
- **Effects.** Worktree/workspace dirs + branch (W), sandbox container metadata, one session JSON
  row, optional tmux session, tips counters, optional hooks trust write.
<!-- consolidation: discard; ref: none; reason: External creation effects. -->
- **Errors/rollback.** `cleanup_partial_session` on partial failure; `Status::Error` on launch fail.
<!-- consolidation: discard; ref: none; reason: External creation failure policy. -->
- **Config/defaults.** `session.tie_workdir_to_name`, `agent_acp_cmd`, `agent_detect_as`,
  `worktree.*`, `sandbox.*`, `acp.*`, repo `.mcp.json`/hooks.
<!-- consolidation: discard; ref: none; reason: External creation settings. -->
- **Unsupported.** `--fork-from` with `--structured-view`/`--agent` (structured fork web-only); fork
  with worktree/scratch/sandbox/cmd-override; scratch+path; non-git worktree mode.
<!-- consolidation: discard; ref: none; reason: External creation limits. -->
- **Source.** `…/src/cli/add.rs` ([blob](https://github.com/agent-of-empires/agent-of-empires/blob/563456d8a05eddd2e09628de151d15a0e16b183e/src/cli/add.rs)); `session/builder.rs:444`.
- **Gaps.** Exact `acquire_session_identity_lock` acquisition line; web/TUI wizard create UI is O.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### S02 — New from selection/project, parent/subsession [F]
- **WHAT.** Parented creation with inherited defaults.
<!-- consolidation: discard; ref: none; reason: External subsession inventory. -->
- **HOW.** `add.rs:475–484` resolves `--parent`, refuses sub-session-of-sub-session, copies parent
  `group_path`, sets `parent_session_id`. `--fork-from` inherits parent tool unless user chose one;
  independent path/worktree still allowed. TUI `ActionId::{NewFromSelection,NewFromProject}` feed the
  same builder.
<!-- consolidation: discard; ref: none; reason: External parent and fork flow. -->
- **Config/defaults.** Inherited tool/context only; one nesting level.
<!-- consolidation: discard; ref: none; reason: External inheritance policy. -->
- **Unsupported.** Sub-session of a sub-session.
<!-- consolidation: discard; ref: none; reason: External nesting limit. -->
- **Source.** `…/src/cli/add.rs`.
- **Gaps.** How TUI prefill defaults (O); `is_sub_session` definition.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### S03 — Start / ensure [F]
- **WHAT.** Launch a stored terminal session; idempotent ensure.
<!-- consolidation: discard; ref: none; reason: External ensure feature inventory. -->
- **HOW.** `cli/session.rs::start_session`: resolve → `bail_if_acp` → `start_with_size_opts(...,
  false)` → capture native sid → lifecycle lock + `merge_post_start` merge → refusal if row vanished.
<!-- consolidation: discard; ref: none; reason: External start implementation. -->
- **Effects.** tmux session, merged runtime fields, captured agent session id.
<!-- consolidation: discard; ref: none; reason: External start effects. -->
- **Errors.** Structured sessions refused from CLI; orphan warning if row removed.
<!-- consolidation: discard; ref: none; reason: External start limitations. -->
- **Source.** `…/src/cli/session.rs::start_session`.
- **Gaps.** Archived/trashed policy inside start; substrate choice (R).
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### S04 — Stop [F]
- **WHAT.** Stop a running session without deleting row/conversation/worktree.
<!-- consolidation: exists; ref: docs/specs/sessions.md#stopping-and-exact-resume; reason: Stopping retains the conversation and is distinct from resource deletion. -->
- **HOW.** `stop_session`: resolve → `bail_if_acp` → probe tmux + container → early-return if neither
  running → `working.stop()` → verify row still exists. No confirmation prompt.
<!-- consolidation: discard; ref: none; reason: External stop flow and confirmation policy. -->
- **Effects.** tmux/pane teardown, container stop; session/conversation/files retained.
<!-- consolidation: discard; ref: none; reason: External substrate-specific effects. -->
- **Source.** `…/src/cli/session.rs::stop_session`; `session/stop.rs`.
- **Gaps.** Active-turn confirmation rules (R); `session/stop.rs` body.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### S05 — Restart / change engine / wake prompt [F]
- **WHAT.** Stop+start with resume policy and post-restart wake message.
<!-- consolidation: discard; ref: docs/specs/sessions.md#startup-completion; reason: External wake behavior does not authorize synthetic resume input. -->
- **HOW.** `restart_session_dispatch` (`--all` uses a parallel semaphore, skips the current tmux
  session) → `restart_session`: resolve → `bail_if_acp` → `restart_with_resume_policy(...,
  HonorAutoResumeSetting)` → wake msg from `config.session.restart_wake_message` (default
  `"wake up: pick up what you were doing"`) → `wait_until_ready` 5s + `send_restart_wake` → capture
  sid → lifecycle lock + `merge_post_restart` (+`touch_after_input` if wake sent).
<!-- consolidation: discard; ref: none; reason: External restart flow. -->
- **Outcomes.** `ResumeFailed` bails preserving sid; `FreshAfterFailedResume` prints old conversation
  still reachable; `Resumed`/`Fresh` success.
<!-- consolidation: discard; ref: docs/specs/sessions.md#stopping-and-exact-resume; reason: Fresh fallback conflicts with explicit new-conversation consent. -->
- **Source.** `…/src/cli/session.rs::restart_session`; `session/restart.rs`.
- **Gaps.** `instance/{resume,start,lifecycle}.rs` partial-mutation error paths.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### S06 — List/show/current/status + identifier resolution [F]
- **WHAT.** Enumerate, filter, render, resolve sessions.
<!-- consolidation: discard; ref: none; reason: External session query inventory. -->
- **HOW — resolution.** `cli/mod.rs::resolve_session`: exact id → unique prefix → ambiguous-prefix
  error listing candidates → exact title → exact `project_path` → `Session not found`.
<!-- consolidation: discard; ref: none; reason: External identifier resolution. -->
- **list.** `cli/list.rs::run` state filter `SessionScope`, JSON vs nested table `nest_children`,
  `--all` across profiles. <!-- consolidation: discard; ref: none; reason: External list flow. --> **status.** `cli/status.rs::run` refreshes tmux cache, `update_status_once`
  + `self_heal_session_id`, counts (Unknown/Starting→idle; Deleting/Creating not counted).
<!-- consolidation: discard; ref: docs/specs/sessions.md#identity-and-observed-state; reason: External counting policy does not preserve approved unknown-state distinction. -->
- **show.** id else current-tmux; `refresh_session_cache`; `update_status_once`; `self_heal_session_id`;
  JSON details or plain + `relationship_lines` (parent/children). <!-- consolidation: discard; ref: none; reason: External show flow. --> **current.** scans
  `list_profiles()` × `load_with_groups` for the current tmux session.
<!-- consolidation: discard; ref: none; reason: External current-session lookup. -->
- **Config.** `StateFilter` default all (back-compat).
<!-- consolidation: discard; ref: none; reason: External compatibility default. -->
- **Source.** `…/src/cli/{list,status,session,mod}.rs`.
- **Gaps.** `SessionScope::matches`; `set-session-id` covered under R03.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### S07 — Rename and native session naming [F]
- **WHAT.** Manual rename (title/group/branch) and automatic agent-driven naming.
<!-- consolidation: discard; ref: none; reason: External naming feature inventory. -->
- **HOW — manual.** `rename_session`: require one of title/group/branch; resolve by id or current
  tmux; locks (identity + session-title + lifecycle); reload authoritative rows; worktree reconcile;
  duplicate-pair check; branch-only requires managed worktree + cross-profile branch-collision
  search; tied edit via `edit_worktree_workdir` when `tie_workdir_to_name`; single `storage.update`
  (rebuilds GroupTree when group_path set); persist Err → branch rollback if disk still shows old
  branch else bail; post-commit `tmux::rekey_session` best-effort.
<!-- consolidation: discard; ref: none; reason: External manual rename transaction. -->
- **Automatic.** `session/smart_rename.rs::run_smart_rename_now`/`try_smart_rename`/`apply_auto_title`/
  `check_eligible`; oneshot argv/model; `sanitize_title`; structured path via
  `rename_structured_via_daemon` (POST `/api/sessions/{id}/smart-rename`).
<!-- consolidation: discard; ref: none; reason: External automatic naming flow. -->
- **Config.** `session.tie_workdir_to_name`.
<!-- consolidation: discard; ref: none; reason: External naming setting. -->
- **Unsupported/failures.** `branch` without managed worktree errors; duplicates refused.
<!-- consolidation: discard; ref: none; reason: External rename restrictions. -->
- **Source.** `…/src/cli/session.rs::rename_session`; `session/smart_rename.rs`.
- **Gaps.** `instance/identity_sidecar.rs`; TUI AutoName trigger (O).
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### S08 — Archive / unarchive [F]
- **WHAT.** Soft archive; engines stopped, row retained.
<!-- consolidation: discard; ref: none; reason: External archive feature inventory. -->
- **HOW.** `archive_session`: lifecycle lock; unless `--no-kill`, `kill_locked` +
  `kill_ancillary_tmux_sessions_locked`; `storage.update` → `stored.archive()` +
  `lifecycle_generation += 1`; refuses if row vanished. `flags.rs::archive` sets `archived_at`, clears
  favorite/snooze/pinned, `settle_archived_status` downgrades Running/Waiting/Starting→Idle;
  `unarchive` clears `archived_at`+`idle_dormant_since`. Bucket precedence Trashed>Archived>Active.
<!-- consolidation: discard; ref: none; reason: External archive state model. -->
- **Source.** `…/src/cli/session.rs::archive_session`; `session/instance/flags.rs:91`.
- **Gaps.** `SessionCommands::Unarchive` path; server `api/sessions` route (O).
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### S09 — Snooze / unsnooze [F]
- **WHAT.** Time-boxed deferral.
<!-- consolidation: discard; ref: none; reason: External snooze feature inventory. -->
- **HOW.** `snooze_session`: minutes from `--minutes` else `session.snooze_duration_minutes`;
  `validate_snooze_duration`; `patch_instance` → `inst.snooze(minutes)` → `snoozed_until = now+min`,
  clears `pinned_at`. `unsnooze` clears it. `is_urgent` false when snoozed.
<!-- consolidation: discard; ref: none; reason: External snooze flow. -->
- **Effects.** Ranking/notification suppression (O).
<!-- consolidation: discard; ref: none; reason: External snooze effects. -->
- **Source.** `…/src/cli/session.rs::snooze_session`; `session/instance/flags.rs:222`.
- **Gaps.** Validation bounds; TUI ToggleSnooze routing.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### S10 — Favorite/pin, color, unread/attention [F]
- **WHAT.** User attention markers.
<!-- consolidation: discard; ref: none; reason: External triage feature inventory. -->
- **HOW.** `mark_session` generic updater; `set_color_session` normalizes none/clear/empty→None and
  validates palette. `flags.rs`: `favorite` clears archived/snoozed; `unfavorite`; `set_color` only
  `SESSION_COLORS`; `is_urgent` reads `attention.json`; `mark_unread`/`mark_read`. Feature gates
  `unread_enabled`, `favorites_first`. TUI `apply_user_action`/`bulk_apply_user_action`/
  `tick_unread_dwell` (gated `unread_enabled` + no dialog).
<!-- consolidation: discard; ref: none; reason: External attention marker flow. -->
- **Unsupported.** Color outside palette errors.
<!-- consolidation: discard; ref: none; reason: External palette restriction. -->
- **Source.** `…/src/cli/session.rs::mark_session`; `session/instance/flags.rs`; `tui/home/user_action.rs`.
- **Gaps.** Unread dwell/manual-hold thresholds; pin vs favorite distinction.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### S11 — Trash and restore [F]
- **WHAT.** Soft-delete with relocation, and restore with reservation races.
<!-- consolidation: discard; ref: none; reason: External trash feature inventory. -->
- **HOW — trash.** `cli/remove.rs::run`: if `session.delete_to_trash` and not `--purge`: lifecycle
  lock; `try_acquire_lifecycle_reservation(Trash)` + `stored.trash()`; kill tmux + ancillary;
  `prepare_trashed_worktree`; `commit_trash_relocation`; race `Superseded`→`undo_raced_relocation`;
  `Failed`/`Skipped`→release reservation. <!-- consolidation: discard; ref: none; reason: External trash transaction. --> **restore.** `restore_session`: filter trashed, resolve,
  lifecycle lock, `decide_restore_claim`, `restore_worktree_location`, `finalize_restore_commit`.
<!-- consolidation: discard; ref: none; reason: External restore transaction. -->
- **Mechanism.** `session/claim.rs::decide_restore_claim`/`finalize_restore_commit`/
  `release_trash_reservation`/`commit_trash_relocation`; `trash.rs::relocate_worktree_to_trash`
  (never relocates default-branch checkout; sandbox-held → Failed), `restore_worktree_location`,
  `reconcile_trashed_*` (retention sweep).
<!-- consolidation: discard; ref: none; reason: External relocation mechanism. -->
- **Config.** `session.delete_to_trash`.
<!-- consolidation: discard; ref: none; reason: External deletion setting. -->
- **Source.** `…/src/cli/remove.rs`; `session/trash.rs`; `session/claim.rs`.
- **Gaps.** Restore-vs-purge race matrix depth.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### S12 — Permanent removal / empty trash / retention [F]
- **WHAT.** Irreversible teardown with preserved-resource options; bulk empty; retention.
<!-- consolidation: discard; ref: none; reason: External purge feature inventory. -->
- **HOW.** `empty_trash` per trashed row: resolve config, derive delete_worktree/branch/sandbox from
  `worktree.auto_cleanup`/`delete_branch_on_cleanup`/`sandbox.auto_cleanup`; `PurgeTransaction::reserve`;
  `run_hooks().complete_with(purge_acp_transcript)`; dispositions Removed/KeptRestored/Busy/Failed/
  AlreadyGone. `remove.rs` purge reserve → transcript purge → preserved-resource messaging. Stages
  (lane D-S12, `deletion.rs`): teardown/preserve/remove-worktrees-and-branches/scratch/agent-stores/
  on-destroy hooks.
<!-- consolidation: discard; ref: none; reason: External purge flow. -->
- **Config.** `session.delete_to_trash`, `worktree.auto_cleanup`, `worktree.delete_branch_on_cleanup`,
  `sandbox.auto_cleanup`.
<!-- consolidation: discard; ref: none; reason: External cleanup configuration. -->
- **Source.** `…/src/cli/session.rs::empty_trash`; `session/deletion.rs`.
- **Gaps.** Automatic retention scheduler body (idle_reap read under S17/O13); full stage bodies.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### S13 — Native conversation import/discovery [F]
- **WHAT.** Discover and import existing Claude Code conversations.
<!-- consolidation: discard; ref: none; reason: External import feature inventory. -->
- **HOW.** `import_sessions`: `scan_sessions`; exclude AoE-owned via `Owned::excludes`;
  `sessions_under_paths` unless `--all`; partition `cwd_exists`; drop `already_imported`; cap
  `MAX_SESSIONS`; `--dry-run`; confirm if >1; `storage.update` inserts + groups; structured note /
  `launch_imported`. Discovery `claude_import.rs::claude_config_dir` (`$CLAUDE_CONFIG_DIR` else
  `~/.claude`), `scan_sessions` reads `projects/*/*.jsonl`, `summarize_file` ≤400 lines. Mode
  `apply_import_mode`: structured→`acp_session_id`+`import_pending`; terminal→`resume_intent Use` +
  `ConversationBinding{provenance: Imported}`.
<!-- consolidation: discard; ref: none; reason: External import flow. -->
- **Source.** `…/src/cli/session.rs::import_sessions`; `session/{import,claude_import}.rs`.
- **Gaps.** ACP `session/list` import source (A); ownership allowlist beyond Claude.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### S14 — Fork conversation into independent session [F]
- **WHAT.** One-shot terminal fork carrying the parent conversation.
<!-- consolidation: discard; ref: none; reason: External fork feature inventory. -->
- **HOW.** `add.rs::run` builds `terminal_fork_seed(parent_ref, new uuid)`; seed applied (sets
  `agent_session_id`, `resume_intent=Fork`, `resume_binding`; unattributed parents identity-checked).
  `session/fork.rs::ForkDenied` (forkable agents claude/codex/opencode/pi), `terminal_fork_seed`,
  `ensure_child_matches_parent_agent`, `structured_fork_capable`.
<!-- consolidation: discard; ref: none; reason: External fork flow. -->
- **Unsupported.** Structured fork only from web dashboard; unsupported-agent refusal.
<!-- consolidation: discard; ref: none; reason: External fork limits. -->
- **Source.** `…/src/cli/add.rs`; `session/fork.rs`.
- **Gaps.** Structured fork call site (A); builder fork-seed application tests.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### S15 — Manual group list/create/delete/move [F]
- **WHAT.** Nested group tree over sessions.
<!-- consolidation: discard; ref: docs/specs/interfaces.md#workspace-and-board; reason: Approved grouping is over tasks rather than AoE session rows. -->
- **HOW.** `cli/group.rs::run`: `list_groups` (counts/JSON); `create_group` (parent/name nesting,
  refuse existing); `delete_group` (count members, refuse unless `--force`, move to default);
  `move_session` (`patch_instance` group_path + `create_group`). Persistence via `storage.update` on
  `groups` + `GroupTree`. `GroupTree` roots/groups_by_path/insertion_order; mutations `rebuild_tree`;
  `rename_group` merges into existing target; archived/trash synthetic sections; attention tiers.
<!-- consolidation: discard; ref: none; reason: External group operations. -->
- **Source.** `…/src/cli/group.rs`; `session/groups.rs`.
- **Gaps.** Nested path validation depth.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### S16 — Profile list/create/delete/rename/default/show/select [F]
- **WHAT.** Per-profile isolation of session stores.
<!-- consolidation: discard; ref: none; reason: External profile feature inventory. -->
- **HOW.** `cli/profile.rs::run` dispatches list/create/delete/rename/default/show.
  `session/mod.rs::validate_profile_name` (reserved `all`, no separators, single component);
  `validate_new_profile_name` (`[A-Za-z0-9_-]`, ≤64); `create_profile` dup-refuse; `delete_profile`
  refuse if last remaining, `remove_dir_all`; `rename_profile` (`fs::rename` + default rewrite);
  `set_default_profile`. TUI `profiles.rs::switch_profile` (None = all profiles; rewires disk/config
  subscriptions and caches).
<!-- consolidation: discard; ref: none; reason: External profile operations. -->
- **Effects.** Profile dir under app dir; deletion removes all sessions in profile.
<!-- consolidation: discard; ref: none; reason: External profile effects. -->
- **Source.** `…/src/cli/profile.rs`; `session/mod.rs`; `tui/home/profiles.rs`.
- **Gaps.** Unified view (`--all`) and active-vs-default profile semantics.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### S17 — Durable storage, locking, merge, reload/recovery [F]
- **WHAT.** Atomic JSON store, cross-process locks, journal repair, recovery.
<!-- consolidation: discard; ref: none; reason: External storage technology inventory. -->
- **HOW.** `session/storage.rs::Storage`: `load` skips+quarantines corrupt rows
  (`sessions.corrupt.jsonl`); **`update`** takes in-process `save_lock` + a transition shared flock +
  profile storage flock; `update_under_lock` pre-serializes both buffers, writes **groups first,
  sessions last** (atomic). `move_instances_to_inner` canonical-dir-order locks; `with_storages_locked`;
  `validate_recovery_journal`/`repair_journal_entry_with_sync`; `backup_before_repair`/`backup_beside`/
  `prune_backups_beside`. `recovery.rs` boot cascade (`RecentlyRestarted` TTL 8s, `RecoveryPending`
  set, `run_recovery_for_instance` with `RECOVERY_HOOK_TIMEOUT=30s`). `sync.rs::drain_and_persist_session_ids`
  (honors explicit `set-session-id` pin, skips cross-instance owners). `move_journal.rs` atomic journal
  entries. `idle_reap.rs::idle_reap_candidates`/`claim_idle_stop`. `instance/{merge,reconcile,sid_persist}.rs`
  generation-ordered merges, CAS `persist_session_with_storage`, identity sidecar.
<!-- consolidation: discard; ref: none; reason: External storage and recovery algorithms. -->
- **Source.** `…/src/session/{storage,recovery,sync,move_journal,idle_reap}.rs`;
  `session/instance/{merge,reconcile,sid_persist,identity_sidecar}.rs`.
- **Gaps.** `anchored_fs.rs`/`poller.rs` bodies; invalid/newer-format policy details.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### S18 — Conversation summary / carried context [F]
- **WHAT.** Agent-agnostic recap for structured sessions plus conversation carry across account swaps.
<!-- consolidation: discard; ref: none; reason: External summary and carry inventory. -->
- **HOW.** `conversation_summary.rs::resolve_summary_agent` gates `NotStructured`/`Sandboxed`/
  `NoOneshot`/`CommandOverridden` (an override disqualifies only the resolved summary agent's own
  binary; a different agent ignores the session command). `should_trigger_summary` = clean
  `Event::Stopped{reason=="prompt_complete"}` and sid not in-flight; `try_conversation_summary` is the
  entry (`Auto` honours `session.conversation_summary` + delta threshold, `Manual` ignores both),
  guarded per-session by `state.summary_inflight` and one process-wide `summary_semaphore`
  (`SUMMARY_TIMEOUT=150s`). Flow: replay `acp_event_store` → `last_summary` →
  `extract_transcript_delta` (renders `[User]`/coalesced `[Assistant]`/`[Tool: name]`, skips
  synthesized resends, head-truncates) → `build_summary_prompt` → `build_oneshot_argv(CliDefault)` →
  `sanitize_summary` (drops empty/NONE/refusals) → `acp_supervisor.publish_conversation_summary`.
  Caps MAX_INPUT_BYTES=48k, MAX_TOOL_ARG_BYTES=200, MAX_PREV_SUMMARY_BYTES=4k, MAX_SUMMARY_CHARS=4k,
  MIN_DELTA_BYTES=8k, MIN_DELTA_TURNS=8. Call sites: Auto `server/acp_events.rs:251-276`; Manual
  `POST /api/sessions/{id}/summarize` → `server/api/sessions/lifecycle.rs::summarize_session`
  (SkipReason→400/409, else spawn + 202). <!-- consolidation: discard; ref: none; reason: External summary flow. --> `conversation_carry.rs::classify` →
  `ToolSwap::{Park,KeepConversation(Option<ConversationCarry>)}` (structured always Park; needs
  `is_account_swap` + capture backend Claude + !store-move-pending + non-empty `conversation_ids`);
  `run_for` attests the destination, scans `projects/<cwd>/<sid>.jsonl` by sid
  (`claude_transcripts_for`) and `copy_file_confirmed` stages `.aoe-carry` then atomic-publishes
  (newer destination wins), else legacy best-effort `run`. Orchestration: TUI restart
  `tui/home/operations.rs:477-503` `retarget`s the carry from disk ids, threaded via
  `session/restart.rs:24` to `session/instance/resume.rs:235`.
<!-- consolidation: discard; ref: none; reason: External account-carry flow. -->
- **Unsupported.** Non-structured, sandboxed, no-oneshot agents; structured rows park (no launch).
<!-- consolidation: discard; ref: none; reason: External summary and carry limits. -->
- **Source.** `…/src/session/{conversation_summary,conversation_carry}.rs`;
  `src/server/{acp_events.rs,api/sessions/lifecycle.rs}`; `src/session/instance/resume.rs`,
  `src/tui/home/operations.rs`.
- **Gaps.** None material.
<!-- consolidation: discard; ref: none; reason: External audit coverage assessment. -->

### Domain R — Native agents, process substrate and terminal interaction (R01–R12)

#### R01 — Supported native agents and availability/install hints [F]
- **WHAT.** Enumerate agents, decide installed/uninstalled, print hints.
<!-- consolidation: discard; ref: none; reason: External agent discovery inventory. -->
- **HOW.** `aoe agents` calls `tmux::AvailableTools::detect()` → `available_list()`; per `AGENTS`
  record prints ✓/✗ + `install_hint` + lifecycle notice; footer `N/17 installed`. `resolve_tool_name`
  maps command→registry. `DetectionMethod::Which` probes PATH; `RunWithArg` runs `bin --version`. No
  network. Missing from PATH → "not installed" (not error).
<!-- consolidation: discard; ref: none; reason: External availability flow. -->
- **Registry (17, lane-verified).** claude, opencode, vibe, codex, gemini(deprecated→antigravity),
  cursor, copilot, pi, droid, settl(host-only), hermes, kiro, qwen, antigravity, kimi, omp,
  prime-agent. Full per-record matrix (binary/aliases/detection/yolo/hook/resume/capture/fork and
  extras) lives in lane R and is carried there verbatim. Capture-unsupported host:
  opencode/gemini/hermes/kimi/prime-agent; sandbox: opencode; no SessionSupport:
  vibe/copilot/droid/settl/kiro/qwen/antigravity; hook-only status: settl/kiro/kimi/prime-agent.
<!-- consolidation: discard; ref: none; reason: External provider matrix is not a support commitment. -->
- **Config/defaults.** Registry constants + `AgentLifecycle` deprecation notices only.
<!-- consolidation: discard; ref: none; reason: External registry defaults. -->
- **Source.** `…/src/agents.rs:519-884` (`AGENTS`), `:886-959` (oneshot special-casing), `:1088+`
  helpers; `src/cli/agents.rs`.
- **Gaps.** Detect-manifest-vs-registry mismatch audit.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### R02 — Custom agent/wrapper/command execution identity [F]
- **WHAT.** Named tool vs arbitrary command/wrapper; detect-as vs execution-as; args/overrides.
<!-- consolidation: discard; ref: none; reason: External execution identity inventory. -->
- **HOW.** `Instance::has_command_override` is the detect-as vs execution-as discriminator (true iff
  `command` non-empty and ≠ `agent.binary`). `get_tool_command`/`get_launch_command`/
  `selected_agent_args`; `apply_yolo_mode` (`EnvVar` no-op under sandbox; `AlwaysYolo` no-op);
  `apply_first_launch_agent_name` gated on attested execution; `parse_launch_command` shell-word
  split + `splice_subcommand_or_append`; `build_resume_flags`/`build_fork_flags`; sandboxed vs host
  command build; `apply_agent_launch_env` (antigravity/codex only); `wrap_command_ignore_suspend`.
  `flags.rs` = session triage/lifecycle flags (not CLI launch flags); `ensure_startable` blocks
  Archived/Trashed.
<!-- consolidation: discard; ref: none; reason: External command construction flow. -->
- **Config/defaults.** `custom_agents`, `agent_detect_as`, `agent_execution_as`,
  `agent_command_override`, `agent_extra_args`, `name_agent_session`.
<!-- consolidation: discard; ref: none; reason: External launch settings. -->
- **Source.** `…/src/session/instance/{launch_command,execution,flags}.rs`.
- **Gaps.** Exact detect-as/execution-as precedence arms beyond the discriminator.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### R03 — Native resume and pinned/reset conversation identity [F]
- **WHAT.** Pin/acquire agent conversation id, resume, capture post-launch, fork child id.
<!-- consolidation: discard; ref: none; reason: External conversation operations inventory. -->
- **HOW.** `SessionCaptureSpec{backend,host,sandbox}` + `reads_hook_sidecar`; backends
  Claude/OpenCode/Codex/Gemini/HookSidecar/Pi/Hermes/Kimi/Omp/PrimeAgent; `validated_session_id`
  (≤256, ascii alnum `-_.`), `generate_session_uuid`, `compose_exclusion*`/`owner_excludes` (avoid
  stealing another pane's id via tmux hidden env), `run_with_timeout_limit`.
  `orchestrate_resume_launch` single cascade (title lock → lifecycle lock → reconcile →
  `acquire_lifecycle_reservation(Launch, Starting)` → drop locks for pre-launch hooks → reacquire →
  `apply_resume_policy` → body `stop_carry_and_prepare`→`spawn_prepared_launch`→`finish_resume_launch`→
  `commit_lifecycle_launch`; any Err → `fail_reserved_launch`). `set_session_id` empty→Cleared else
  valid→Use, clears `resume_probe_failed_sid`; structured handoff needs `--store` + matching
  `acp_session_id` + explicit claude.
<!-- consolidation: discard; ref: none; reason: External identity capture and resume implementation. -->
- **Source.** `…/src/agents.rs:93-122`; `session/instance/{session_id,resume,retroactive_capture,
  identity_sidecar,omp,prime_capture}.rs`; `src/cli/session.rs`.
- **Gaps.** Individual `session/capture/*` poll-fn interiors.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### R04 — Status detection: hooks versus pane rules [F]
- **WHAT.** Resolve status from hook map and/or pane content, with precedence and stale-hook handling.
<!-- consolidation: discard; ref: none; reason: External observation strategy inventory. -->
- **HOW.** `effective_status_map` (default from hook_config + sidecar events, overlaid by configured
  `agents.<name>.status_map`; error if empty/unknown); `resolved_hook_events`/
  `resolved_sidecar_hook_events`; `hook_install_required`. Pane: `detect_status_from_content_in` =
  configured rules → agent `detect_status` fn → Idle; `detect_with_rules`; `detect_via_manifest`;
  `manifest_detectors!` (13 detectors). `detect/mod.rs` `MANIFEST_SOURCES` (13 embedded TOMLs); the
  hook status file is itself a rule; no match → `idle_by_default`. `status_rules.rs` requires exactly
  one of `contains`/`regex`; `effective_detect_as` (persisted wins). Precedence: configured rules ≻
  built-in manifest ≻ hook-only Idle; stale hooks bounded by `read_hook_status_age` vs manifest
  `max_age`.
<!-- consolidation: discard; ref: docs/specs/sessions.md#identity-and-observed-state; reason: AoE idle fallback cannot establish approved unknown-state behavior. -->
- **Config/defaults.** `AgentRuntimeConfig{status_map,status_rules}`, `StatusRule{status,contains,
  regex}`, `SessionConfig.agent_status_hooks`, `merge_hooks_into_selected_agent`.
<!-- consolidation: discard; ref: none; reason: External detection settings. -->
- **Source.** `…/src/agents.rs`; `src/tmux/{status_detection,status_rules}.rs`, `tmux/detect/**`;
  `session/instance/pane_status.rs`.
- **Gaps.** Full boot/idle/wait/error/stop transition matrix.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### R05 — Install/approve native agent hooks and sidecars [F]
- **WHAT.** User approval gate + write hooks into each agent's own config; disclosure; uninstall.
<!-- consolidation: discard; ref: none; reason: External hook-management inventory. -->
- **HOW.** `aoe hooks status|approve`; approval = installation-wide
  `app_state.has_acknowledged_agent_hooks` (`--trust-hooks` is per-repo, C03). `print_disclosure`
  enumerates `agent_names()` + `custom_agents`, filters `hook_install_required`, prints target
  files/events/post-install/status-hook sidecar path. Installers per format in `src/hooks/**`.
  `command.rs` builds host/sandbox write scripts with mode+owner guards and `# AOE_HOOK_MARKER`;
  `dir_guard.rs` anchors `/tmp/aoe-hooks-<euid>` with `*at` syscalls; `status_file.rs` caps reads;
  `trust.rs` trust_*_project; `extract_session_id` hidden helper with `/proc` ancestor walk.
  Reinstall idempotent.
<!-- consolidation: discard; ref: none; reason: External hook installer security and lifecycle flow. -->
- **Config/defaults.** `AgentHookConfig{settings_rel_path,config_dir_env_var,events,format}`;
  `SidecarHooks{...}`; config-dir override (host env wins, empty=unset).
<!-- consolidation: discard; ref: none; reason: External hook configuration. -->
- **Unsupported.** No hooks declared → "nothing to approve"; Codex may require `/hooks` trust.
<!-- consolidation: discard; ref: none; reason: External hook capability limits. -->
- **Source.** `…/src/cli/hooks.rs`; `src/hooks/**`; `src/cli/extract_session_id.rs`.
- **Gaps.** Per-installer interiors beyond the flows read.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### R06 — Send message / capture output [F]
- **WHAT.** Deliver a message (terminal or structured) and read output.
<!-- consolidation: discard; ref: none; reason: External send and capture surface inventory. -->
- **HOW.** `aoe send`: resolve, `ensure_startable()` refuses archived/trashed. Structured →
  `send_structured` hits the daemon prompt endpoint (`PromptDispositionWire::{Sent,Steered,Queued}`).
  Terminal → unless `--no-revive`, `ensure_pane_ready()`; dead pane refuses "Start it first";
  `wait_until_ready(5s, ready_marker(tool))`; `lock_for_input()`; `send_keys_with_delay(msg,
  send_keys_enter_delay(tool))` (claude/codex=150ms); persists `touch_after_input()` + Running. <!-- consolidation: discard; ref: none; reason: External message delivery flow. -->
  Capture: `capture_pane` (`capture-pane -t name:^.0 -p -e -S -N`), `capture_pane_with_cursor`,
  `capture_plain`, `capture_window_composited_with_cursor`.
<!-- consolidation: discard; ref: none; reason: External pane capture APIs. -->
- **Config/defaults.** per-agent `ready_marker`/`send_keys_enter_delay_ms`; default revive.
<!-- consolidation: discard; ref: none; reason: External readiness and revive settings. -->
- **Unsupported.** Archived/trashed hard refusal; empty message bails.
<!-- consolidation: discard; ref: none; reason: External send limitations. -->
- **Source.** `…/src/cli/send.rs`; `src/tmux/session.rs:568+`.
- **Gaps.** A-owned structured `client.prompt` daemon contract.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### R07 — tmux attach / detach [F]
- **WHAT.** Attach TUI/CLI to a session's tmux pane and restore on detach.
<!-- consolidation: discard; ref: none; reason: External direct-attach feature inventory. -->
- **HOW.** `tmux::Session::attach` requires `exists()` then `utils::attach_client`; non-zero exit bails
  with `diagnose_attach_failure` (exists/pane_dead/display-message/pane tail). **Nested tmux is
  handled by unsetting `TMUX` and forcing `TERM=xterm-256color` before `exec ... attach-session`**,
  not by refusing. `TerminalSession::attach`, `ToolSession::attach`; size-owner TTL/heartbeat.
<!-- consolidation: discard; ref: none; reason: External attach transport and nested tmux mechanics. -->
- **Source.** `…/src/tmux/{session,utils}.rs`; `src/terminal.rs`.
- **Gaps.** None material beyond attach sizing detail.
<!-- consolidation: discard; ref: none; reason: External audit coverage assessment. -->

#### R08 — Live-send, leader menu, terminal input transport [S]
- **WHAT.** "Feels-attached" keystroke transport replacing the compose dialog, incl. leader chord,
  VT/osc8 fallback.
<!-- consolidation: discard; ref: none; reason: External live-send feature inventory. -->
- **HOW.** `tui/home/live_send.rs::translate(KeyEvent)->LiveDispatch` (Shift+Enter → `TmuxKey::
  HexBytes([0x1b,0x0d])`; Ctrl/Alt char → `Named("<prefix><lower>")`; plain → `Literal`; named keys
  → `Named`; `mod_prefix` `C-`/`M-`/`S-`); capture scheduling `authoritative_capture_due`/
  `authoritative_refresh_action`/`capture_target_changed`/`capture_composited`/`capture_via_tmux`.
  `live_send_prep.rs` warm checks; `tmux/{vt,composite,osc8}.rs`; `main.rs` pre-clap `__vt-pipe`.
  Exit chord/leader from `SessionConfig.live_send_exit_chord`/`live_send_leader`.
<!-- consolidation: discard; ref: none; reason: External keyboard and capture transport. -->
- **Source.** `…/src/tui/home/{live_send,live_send_prep,preview}.rs`; `src/tmux/{vt,composite,osc8}.rs`.
- **Gaps.** Full `live_send.rs` reducer and leader key tables; vt drain protocol.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### R09 — Paired host/container terminal and custom tool sessions [F]
- **WHAT.** Companion host terminal, container terminal, custom tool sessions with independent lifetime.
<!-- consolidation: discard; ref: none; reason: External paired-terminal feature inventory. -->
- **HOW.** `instance/terminal.rs` (`terminal_tmux_session_indexed`,
  `container_terminal_tmux_session_indexed`, `start_terminal_with_size*`, `kill_terminal*`, container
  shell autodetect). `tmux/terminal_session.rs` `PairedTerminal<const CONTAINER: bool>` (resolve keeps
  host/container apart); `tool_session.rs` `ToolSession` (create/wait/capture/kill); `session_kind.rs`
  `SessionKind::{Agent,Terminal,ContainerTerminal,Tool}` stamped `@aoe_kind`.
  `Action::{AttachTerminal,AttachToolSession,RunBackgroundToolSession}`.
<!-- consolidation: discard; ref: none; reason: External paired-terminal implementation. -->
- **Config/defaults.** `Config.tools` → `ToolSessionConfig{command,hotkey,background}`.
<!-- consolidation: discard; ref: none; reason: External tool configuration. -->
- **Unsupported.** Container terminal for non-sandboxed session bails.
<!-- consolidation: discard; ref: none; reason: External terminal capability limit. -->
- **Source.** `…/src/tmux/{terminal_session,tool_session}.rs`; `session/instance/terminal.rs`.
- **Gaps.** Hotkey/foreground/background activation arms.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### R10 — Process/runtime inspection and health metrics [F]
- **WHAT.** `aoe ps` lists tmux/ACP/dead/orphan processes with CPU/mem attribution; health.
<!-- consolidation: discard; ref: none; reason: External process inventory feature. -->
- **HOW.** `cli/ps.rs::PsArgs{json,tmux,acp,dead}`; `Substrate::{Tmux,Acp}`; `collect_tmux_states`/
  `collect_acp_states`/`render_table*`. `process/mod.rs`: `get_pane_pid`, `processes_matching`,
  `boot_id`, `parent_and_argv0`, `get_foreground_pid`, kill/stop/continue tree, `run_with_timeout*`,
  `sleep_inhibitor`, `reset_signals_on_exec`. `worker_registry.rs` `WorkerRecord` + restart markers.
  `metrics.rs` `PressureBand`/`MetricsSnapshot`.
<!-- consolidation: discard; ref: none; reason: External process and metrics implementation. -->
- **Config/defaults.** ACP workers hidden unless `--dead`; `--acp` conflicts with `--tmux`.
<!-- consolidation: discard; ref: none; reason: External process-query defaults. -->
- **Source.** `…/src/cli/ps.rs`; `src/process/*.rs`.
- **Gaps.** Platform `{linux,macos,unix}.rs`/health-error output interiors.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### R11 — tmux configuration/status integration [F]
- **WHAT.** Socket isolation, status-bar/clipboard/mouse writes obeying user settings.
<!-- consolidation: discard; ref: none; reason: External tmux customization inventory. -->
- **HOW.** `aoe tmux status [--format text|json]` → `status_bar::get_session_info_for_current()`;
  `apply_status_bar` writes `@aoe_title`/`@aoe_branch`/`@aoe_sandbox` + `status-left` format;
  `apply_mouse_option`/`apply_all_tmux_options`. `tmux/env.rs` hidden env set/get/remove (batch).
<!-- consolidation: discard; ref: none; reason: External tmux option implementation. -->
- **Config/defaults.** `TmuxConfig{status_bar,mouse,clipboard,socket_name,vt_live}`;
  `TmuxSettingMode::{Auto,Enabled,Disabled}`, `TmuxOptionWrite`, `TmuxSettingAction`.
<!-- consolidation: discard; ref: none; reason: External tmux settings. -->
- **Source.** `…/src/cli/tmux.rs`; `src/tmux/{env,status_bar,utils}.rs`.
- **Gaps.** Clipboard/mouse pass-through policy detail.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### R12 — Status transition commands and sound [F]
- **WHAT.** Run local shell commands and play sounds on status transitions, debounced/deduped.
<!-- consolidation: discard; ref: none; reason: External transition notification inventory. -->
- **HOW.** `status_hooks.rs::commands_for_transition`, `run_for_transition` →
  `run_debounced_transition` (per-session generation counter; only settled status fires; 100ms
  debounce); `run_hook_command_blocking` via `session::user_shell() -c` with 30s timeout and env
  payload (`AOE_*`). Sound `sound/mod.rs::play_for_transition`; `playback.rs` picks afplay/paplay/
  aplay; `discovery.rs`; `bundled.rs` fetches 10 CC0 files. TUI consumer
  `tui/attached_status_hooks.rs::run_loop`/`apply_updates`/`snapshot`.
<!-- consolidation: discard; ref: none; reason: External status-hook and sound pipeline. -->
- **Config/defaults.** `StatusHookConfig{enabled,on_*,on_change}`; `SoundConfig{enabled,on_*,volume}`;
  debounce 100ms; hook timeout 30s.
<!-- consolidation: discard; ref: none; reason: External notification settings. -->
- **Unsupported.** `{Unknown,Stopped,Deleting,Creating}` → no status-specific command/sound.
<!-- consolidation: discard; ref: none; reason: External notification exclusions. -->
- **Source.** `…/src/status_hooks.rs`; `src/sound/**`; `src/tui/attached_status_hooks.rs`.
- **Gaps.** Legacy `debounce_ms` deserialization path.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

### Domain W — Projects, git/workspaces and sandbox resources (W01–W12)

#### W01 — Project registry add/list/remove/update/select/pin [F]
- **WHAT.** Global/profile project registry with pins and overrides.
<!-- consolidation: discard; ref: none; reason: External project registry inventory. -->
- **HOW.** `cli/project.rs::ProjectCommands::{List,Add,Remove}`. Registry files global
  `app_dir/projects.json`, profile `<profile_dir>/projects.json`. `load_merged` = union deduped by
  `canonical_key`, **profile shadows global on canonical-path collision**; `load_merged_strict`
  errors. `add` canonicalizes + `locked_update_scope` (sidecar lock); conflicts same name/canonical
  path (`RegistryError::Conflict`); cross-scope same path errors unless `--allow-override`.
  `unique_name` `-N`; `unpopulated_projects` emits pinned sessionless projects. Server
  `list/create/delete/update_project` handlers with scope parse, `not_a_directory` 400, conflict 409.
<!-- consolidation: discard; ref: none; reason: External registry implementation. -->
- **Config/defaults.** Scope default Global (or Profile when `-p`).
<!-- consolidation: discard; ref: none; reason: External registry scope default. -->
- **Source.** `…/src/cli/project.rs`; `session/projects.rs`; `server/api/projects.rs`.
- **Gaps.** None material; server handler read in lane.
<!-- consolidation: discard; ref: none; reason: External audit coverage assessment. -->

#### W02 — Worktree/branch creation and templates [F]
- **WHAT.** Create worktrees/branches from session creation flags.
<!-- consolidation: discard; ref: docs/specs/tasks.md#work-context-and-completion; reason: AoE creation flags are reference inventory rather than task first-launch policy. -->
- **HOW.** `create_worktree(branch,path,create_branch,base_branch)`: guard `path.exists()` →
  `WorktreeAlreadyExists`; unlock+prune; `create_branch=true`: `fetch_base` + `create_branch_from_base`
  (explicit base missing = `BranchNotFound`); `=false`: `fetch_with_warning` + `ensure_branch_exists`;
  `add_worktree`; post-checkout-hook failure with `path/.git` present = warning usable;
  `BranchAlreadyCheckedOut`; credentials sanitized; submodule init; local file-transport blocked =
  `skipped:file-transport-blocked`; best-effort lock. Templates `resolve_template` vars
  `{repo-name}/{branch}/{session-id}`, `sanitize_branch_name`, `lexical_normalize` removes `..`.
<!-- consolidation: discard; ref: none; reason: External worktree creation and template flow. -->
- **Config/defaults.** `WorktreeConfig`, `SessionConfig.tie_workdir_to_name`.
<!-- consolidation: discard; ref: none; reason: External worktree settings. -->
- **Unsupported.** Non-git → in-place; explicit base typo → refusal.
<!-- consolidation: discard; ref: none; reason: External worktree fallback and rejection policy. -->
- **Source.** `…/src/git/worktree/{create,branch}.rs`; `src/git/template.rs`.
- **Gaps.** `branch.rs` less-common paths.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### W03 — Multi-repo workspace / per-repo bases [F]
- **WHAT.** Workspace spanning a primary repo + extras, each with its own base.
<!-- consolidation: discard; ref: none; reason: External multi-repository workspace inventory. -->
- **HOW.** `create_workspace(primary,extra_repos,branch,create_new_branch,workspace_template,
  init_submodules)`: `find_main_repo`; uuid; compute path; `all_repos` with per-repo base; duplicate
  basenames → cleanup+bail; pre-validate all git → cleanup+bail; run `create_worktree` concurrently
  (`thread::scope`); partial failure → cleanup created worktrees + ws dir. `resolve_base_branch`
  precedence: explicit session base > project `default_base_branch` > profile/global
  `worktree.default_base_branch` > repo detected default.
<!-- consolidation: discard; ref: none; reason: External workspace transaction and base selection. -->
- **Source.** `…/src/session/builder.rs::create_workspace`; `session/attach_project.rs`.
- **Gaps.** None material.
<!-- consolidation: discard; ref: none; reason: External audit coverage assessment. -->

#### W04 — Attach project to existing session [F]
- **WHAT.** Attach a project/repo to an existing session (daemon-orchestrated).
<!-- consolidation: discard; ref: none; reason: External project-attachment inventory. -->
- **HOW. server.** `server/attach_project.rs::attach_project`: prompt-submission guard →
  `instance_lock`; `was_running`; in-flight turn → `TurnInFlight` (no mutation); plan; if restart &&
  was_running `shutdown_and_wait(5s)` + `quiesce_for_conversion` + `clear_sandbox_pins`;
  `attach_planned` else `restore_after_failure`; `mirror_conversion` + `resume_after_conversion`;
  `spawn_worker` iff was_running. **plan.** reject scratch/Creating/Deleting/trashed/archived/non-git;
  `find_main_repo`+`reject_duplicate`; branch resolution; `plan_branch`+`reject_branch_checked_out`;
  `plan_conversion` Append/MoveIn/WorktreePrimary; `conversation_cannot_follow` guard.
  **execute/rollback.** `Undo{...}` reverses in order best-effort.
<!-- consolidation: discard; ref: none; reason: External attachment and conversion transaction. -->
- **Source.** `…/src/server/attach_project.rs`; `src/session/attach_project.rs`.
- **Gaps.** None material at flow level.
<!-- consolidation: discard; ref: none; reason: External audit coverage assessment. -->

#### W05 — Edit/reconcile worktree name/location [F]
- **WHAT.** Rename/move a managed worktree; reconcile on-disk moves.
<!-- consolidation: discard; ref: none; reason: External worktree editing inventory. -->
- **HOW. edit.** `edit_worktree_workdir`: guards `NotManaged`/`EmptyName`; sanitize branch + leaf;
  compute target; **branch rename first (fail-closed `branch_exists`), then `move_worktree`**; move
  failure rolls back branch; rollback failure → `RollbackFailed`. <!-- consolidation: discard; ref: none; reason: External worktree edit transaction. --> **reconcile.**
  `WorktreePathResolution::{Current,Moved,Missing,Ambiguous}`; `select_live_worktree` requires exactly
  one checkout; `reconcile_and_persist` refuses to adopt a checkout another session records
  (`claimed_by`); compare-and-set on `project_path`; skips trashed.
<!-- consolidation: discard; ref: none; reason: External worktree reconciliation algorithm. -->
- **Config/defaults.** `SessionConfig.tie_workdir_to_name`.
<!-- consolidation: discard; ref: none; reason: External worktree naming setting. -->
- **Unsupported.** Unmanaged worktree; Missing/ambiguous external move left alone (warn).
<!-- consolidation: discard; ref: none; reason: External worktree edit limits. -->
- **Source.** `…/src/session/{worktree_edit,worktree_reconcile}.rs`.
- **Gaps.** None material.
<!-- consolidation: discard; ref: none; reason: External audit coverage assessment. -->

#### W06 — Worktree info/list/cleanup and branch deletion [F]
- **WHAT.** Inspect and clean up orphaned worktrees; delete branches.
<!-- consolidation: discard; ref: none; reason: External worktree cleanup inventory. -->
- **HOW.** `cli/worktree.rs::{List,Info,Cleanup{force}}`; Cleanup dry-run by default, `--force`
  prompts; `partition_orphaned_worktrees` excludes main + tracked sessions and keeps protected
  default-branch checkouts. `cleanup.rs::remove_managed_worktree`: `.git` missing → unlock +
  `remove_worktree_dir` (effective_force = `force || sandboxed`) + prune; else `git worktree remove` →
  not-a-worktree/vanished → manual+prune; permission → `try_sandbox_dir_cleanup` (gated on
  `allow_container_removal`); submodule blocker → manual cleanup; prune empty parents.
<!-- consolidation: discard; ref: none; reason: External orphan cleanup algorithm. -->
- **Config/defaults.** `WorktreeConfig.auto_cleanup`, `delete_branch_on_cleanup`.
<!-- consolidation: discard; ref: none; reason: External cleanup settings. -->
- **Unsupported.** Dirty worktree blocked unless force.
<!-- consolidation: discard; ref: none; reason: External orphan cleanup refusal policy. -->
- **Source.** `…/src/cli/worktree.rs`; `src/git/cleanup.rs`.
- **Gaps.** None material.
<!-- consolidation: discard; ref: none; reason: External audit coverage assessment. -->

#### W07 — Submodule setup / branch discovery / clone [F]
- **WHAT.** Bare/clone repo creation, branch listing, submodule init.
<!-- consolidation: discard; ref: none; reason: External Git administration inventory. -->
- **HOW. remote.** `clone_bare_repo` (dest must not exist; `clone --bare` into `dest/.bare`, 300s,
  wiped on failure; write `.git` gitdir; set fetch; detect default HEAD→origin/HEAD→main→master;
  `worktree add main`; lock best-effort). `clone_repo` (`--depth 1` if shallow). `server/api/git.rs::
  clone_repo`: read_only+CityHall block; empty/invalid URL → 400; `bare && shallow` → 400; destination
  default `$HOME/<repo-name>`; **must be within home** else 400; existing → 409; `spawn_blocking`;
  success 201.
<!-- consolidation: discard; ref: none; reason: External clone transaction. -->
- **Unsupported.** Destination outside `$HOME`; bare+shallow.
<!-- consolidation: discard; ref: none; reason: External clone restrictions. -->
- **Source.** `…/src/git/{command,remote}.rs`; `src/server/api/git.rs`.
- **Gaps.** None material.
<!-- consolidation: discard; ref: none; reason: External audit coverage assessment. -->

#### W08 — Diff/file review, base selection, editor, comments [F]
- **WHAT.** Working-tree/base diff review, editor write-back, comment review prompts.
<!-- consolidation: discard; ref: none; reason: External diff-review feature inventory. -->
- **HOW.** `git/diff.rs`: `compute_changed_files(repo,base)` merge-base tree →
  `diff_tree_to_workdir_with_index` (incl. untracked) → rename/copy `find_similar` → stats →
  conflicts → sort; `get_commit_from_ref` prefers `origin/<ref>` when local strictly behind;
  `compute_file_diff`/`compute_file_contents`/`compute_unchanged_file_contents`/
  `get_working_file_content`/`save_working_file_content`; `check_merge_base_status`. Base precedence:
  `base_override` > worktree recorded base > `config.diff.default_branch` > `get_default_base_ref` >
  `"main"`. HTTP `session_diff_files` (`changed_files_cached`, merge-base warnings) etc. Web
  `useDiffFiles` polls 10s; comments assembled by `buildPrompt.ts` into `DiffCommentsCardPayload`,
  sent into the ACP transcript. TUI `tui/diff/{input,render,split}.rs`; web `components/diff/**`.
<!-- consolidation: discard; ref: none; reason: External diff computation and review pipeline. -->
- **Config/defaults.** `DiffConfig{default_branch,context_lines,split_view}`;
  `AppStateConfig.diff_file_list_width`.
<!-- consolidation: discard; ref: none; reason: External diff settings. -->
- **Unsupported.** Binary files flagged, no hunks; bad path/unchanged → 4xx `DiffFileError`.
<!-- consolidation: discard; ref: none; reason: External diff limitations. -->
- **Source.** `…/src/git/diff.rs`; `src/tui/diff/**`; `server/api/sessions/diff.rs`.
- **Gaps.** None material (lane deepened web+tui bodies).
<!-- consolidation: discard; ref: none; reason: External audit coverage assessment. -->

#### W09 — Scratch sessions [F]
- **WHAT.** Ephemeral scratch-dir sessions.
<!-- consolidation: discard; ref: none; reason: External scratch-session inventory. -->
- **HOW.** `SCRATCH_SUBDIR="scratch"`; `scratch_root()` lazy `create_dir_all`;
  `provision_scratch_dir(instance_id)` validates id (rejects `../`, spaces, empty) then `create_dir`
  (errors on collision, never reuses); `is_scratch_path` canonical prefix guard; deletion removes cwd
  wholesale; attach rejects scratch.
<!-- consolidation: discard; ref: none; reason: External scratch lifecycle implementation. -->
- **Config/defaults.** `SessionConfig.scratch_smart_rename`.
<!-- consolidation: discard; ref: none; reason: External scratch setting. -->
- **Source.** `…/src/session/scratch.rs`; `cli/add.rs`.
- **Gaps.** None material.
<!-- consolidation: discard; ref: none; reason: External audit coverage assessment. -->

#### W10 — Sandbox runtime selection and creation [F]
- **WHAT.** Docker/Podman/Apple Container selection, container creation, image update.
<!-- consolidation: discard; ref: none; reason: External sandbox feature inventory. -->
- **HOW.** `runtime_binary()`/`get_container_runtime()` read `sandbox.container_runtime` (default
  Docker); `DockerContainer::generate_name/from_session_id/new`. `runtime_base.rs` capability matrix:
  Docker/Podman full; **Apple Container no read-only/named volumes, no selinux, no network modes, no
  batch states/stats, `delete` remove subcommand, cap-add/cap-drop run flags only**. Lifecycle
  `run_create`/`start_container`/`stop_container`/`remove` recover from timeout by re-inspect;
  `ensure_image` pulls (600s, cancellable); `batch_container_states`/`batch_stats` (Apple → empty). <!-- consolidation: discard; ref: none; reason: External container lifecycle and runtime capabilities. -->
  `image_update.rs::check_for_image_update` (pinned `@digest` → None; local vs remote manifest, Bearer
  401 challenge; digest = snooze key). `execution.rs` freezes runtime routing/context.
<!-- consolidation: discard; ref: none; reason: External image update flow. -->
- **Source.** `…/src/containers/{runtime,runtime_base,container_interface,execution,stats,
  image_update}.rs`.
- **Gaps.** Deeper agent-store isolation leaf logic.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### W11 — Sandbox mounts/env/credentials/network/resources [F]
- **WHAT.** Container config build: volumes, env, credentials, network, resources.
<!-- consolidation: discard; ref: none; reason: External sandbox configuration inventory. -->
- **HOW.** `container_config.rs::build_container_config`: validate id → resolve profile/agent →
  volume paths → `SandboxConfig` from repo config (defaults on error) → `collect_environment` + force
  `HOME=/root` + `validate_managed_container_environment` + `CODEX_HOME` → artifact dir mount +
  `AOE_ARTIFACT_DIR`, `~/.gitconfig` ro, `~/.ssh` ro if `mount_ssh`, GCP ADC ro for claude+Vertex →
  per-agent `AGENT_CONFIG_MOUNTS` + shared credentials + home seed + status-hook dir → admission via
  `v033_isolate_sandbox_content::ensure_fresh_content`. `ContainerConfig{...}` + `mount_fingerprint`.
  `build_create_args`: mounts, anonymous + named ignore volumes (named falls back to anonymous when
  unsupported), env via child env, `--network` dropped when unsupported (`none` drops port mappings),
  run flags gated by `supported_run_flags`. Seed guards `policy/guard/inventory/hermes`.
<!-- consolidation: discard; ref: none; reason: External mount and environment assembly. -->
- **Config/defaults.** `SandboxConfig` (21 fields); `VolumeIgnoresStrategy{Anonymous,Named}`.
<!-- consolidation: discard; ref: none; reason: External sandbox settings. -->
- **Unsupported.** Managed env conflict → validation error; port mappings with `network=none`.
<!-- consolidation: discard; ref: none; reason: External sandbox validation limits. -->
- **Source.** `…/src/session/config/container_config.rs` + `seed/**`; `containers/container_interface.rs`.
- **Gaps.** `seed/mixed.rs`/`state.rs` internal branch logic.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### W12 — Sandbox store migration/reclamation [F]
- **WHAT.** Reclaim orphaned sandbox stores; migrate store layout.
<!-- consolidation: discard; ref: none; reason: External sandbox reclamation inventory. -->
- **HOW.** `aoe sandbox reclaim [--delete]`: `report()` + plan (preserved/orphans), `reclaim()` prints
  removed/freed/failures. `sandbox_store_reclaim.rs`: app_dir+home `guard` (flock
  `.sandbox-reclaim.lock` + v027 transition shared flock; bail if transition in flight);
  `every_runtime_probe` docker+podman (+apple on macOS), batched presence, runtime-cannot-answer →
  retained (fail-closed); `owned_ids` all profiles' registries, fail-closed; `classify` →
  `Preserved{Ambiguous,Transitioning,UnprovenContent,Recent,Retained}` or orphan; `CREATION_GRACE=15min`.
  `move_journal.rs` atomic journal records/consume/scan.
<!-- consolidation: discard; ref: none; reason: External reclamation flow and ownership guards. -->
- **Config/migration.** v027 store migration + transition lock; v033 content isolation.
<!-- consolidation: discard; ref: none; reason: External migration history. -->
- **Unsupported.** No registry → refuse; migration in flight → refuse.
<!-- consolidation: discard; ref: none; reason: External reclamation restrictions. -->
- **Source.** `…/src/cli/sandbox.rs`; `session/sandbox_store_reclaim.rs`; `session/move_journal.rs`.
- **Gaps.** None material.
<!-- consolidation: discard; ref: none; reason: External audit coverage assessment. -->

### Domain A — Structured/ACP agents and conversation controls (A01–A20)

#### A01 — ACP registry, adapter availability/doctor/install [F]
- **WHAT.** Registry of ACP agents; PATH/pinned fallback, Node selection/version floor, doctor/install.
<!-- consolidation: discard; ref: none; reason: External ACP installation inventory. -->
- **HOW.** `AgentRegistry::with_defaults()` builds an 11-entry map; `AgentSpec::from_acp_cmd` shell-word
  splits a custom cmd; `pick_acp_agent_name` order (explicit override → registry/custom → inherited via
  `agent_detect_as` → `claude` → `acp.resolved_default_agent()`). `node::resolve_for` verifies
  path/version + floors; `download` pinned per-platform tarball + sha256. `adapters::{is_bundled,
  installation_is_current,install,publish,sweep_stale}` (publish atomic tmp→rename). `doctor(json,
  fix,adapter,all)`: `--fix` installs adapters, **no rollback arm** (a failed install leaves the prior
  binary; atomicity from `publish`). Server install opt-in (`acp.allow_agent_install`), package from a
  static table never client input, 180s timeout, host `npm install -g` / container `docker exec`.
<!-- consolidation: discard; ref: none; reason: External registry and installation flow. -->
- **Config/defaults.** 11 defaults; bundled adapters 4 (3 manifests-only → external boundary);
  npm-installable subset claude-agent-acp/codex-acp/gemini.
<!-- consolidation: discard; ref: none; reason: External adapter matrix. -->
- **Source.** `…/src/acp/{agent_registry,node,adapters,version_probe,capability_probe}.rs`;
  `src/cli/acp.rs`; `src/server/api/acp/install.rs`.
- **Gaps.** `capability_probe` non-registry paths.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### A02 — Structured start/stop/kill/restart and surviving daemon [F]
- **WHAT.** Supervisor/worker lifecycle; workers survive `serve --stop`.
<!-- consolidation: discard; ref: none; reason: External daemon-worker lifetime inventory. -->
- **HOW.** `Supervisor<S>` owns `workers`, `LifecycleTable`, `launcher`, per-agent warmup lock,
  `worker_notify`, respawn/incompatible/force bits, `max_concurrent_workers`. `WorkerKind`
  Runner(respawnable)/Attached(never respawned in memory)/Stdio(test). `runner_lifecycle.rs` epochs
  mint/admit/install/abandon/release_running/begin_stop/adopt_for_stop/settle/begin_respawn;
  `ProcessControl` trait; `ResumeReservation` RAII. `launch.rs::spawn`/`spawn_inner` (warmup guard,
  `admit_durable_launch` twice, install under lease, detach/collect background agents).
  `teardown.rs::shutdown_and_wait`/`shutdown_with_reason`/`detach_all`/`retry_pending_teardowns`.
  `drain.rs::run`/`pump`/`respawn`/`restart_decision` (RESTART_WINDOW/MAX_RESPAWNS_IN_WINDOW)/
  `kill_wedged_runner`. `process/runner/mod.rs::run` binds a 0600 control socket, saves `WorkerRecord`
  before spawn.
<!-- consolidation: discard; ref: none; reason: External worker supervision algorithm. -->
- **Config/defaults.** `max_concurrent_workers` via `with_capacity`.
<!-- consolidation: discard; ref: none; reason: External worker capacity setting. -->
- **Source.** `…/src/acp/supervisor/{mod,launch,teardown,drain,publish}.rs`; `src/process/runner/**`.
- **Gaps.** `supervisor/{requests,sink,agents}.rs` and `runner/{shared,jsonrpc}.rs` full bodies.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### A03 — Choose/switch terminal versus structured view [F]
- **WHAT.** Structured vs terminal view election at create and switch.
<!-- consolidation: discard; ref: none; reason: External structured-view feature inventory. -->
- **HOW.** CLI create: `instance.view = if user_wants_structured && acp_capable {Structured} else
  {Terminal}`; `user_wants_structured = args.structured_view || user_picked_agent`; `--structured-view`
  without ACP capability bails; `--agent` on non-ACP-capable bails; `acp_capable` = registry hit OR
  `agent_acp_cmd` OR `inherited_acp_base`. Server `acp/enable|disable` handlers.
<!-- consolidation: discard; ref: none; reason: External view election flow. -->
- **Config/defaults.** `NewSessionView{Auto=default,Structured,Terminal}`;
  `AcpConfig.default_new_session_view`; `AttachMode{Tmux=default,LiveSend}`.
<!-- consolidation: discard; ref: none; reason: External view defaults. -->
- **Source.** `…/src/cli/add.rs`; `session/config/mod.rs`; `server/api/acp/{view,worker}.rs`.
- **Gaps.** TUI wizard Auto resolution.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### A04 — Prompt compose/send, stdin, streaming and steering [F]
- **WHAT.** Prompt turn loop, stdin, streaming, steering.
<!-- consolidation: discard; ref: none; reason: External prompt control inventory. -->
- **HOW.** `connection/prompt.rs::send_prompt` posts via the in-process `ControlBody::Prompt` channel
  when a control link exists else direct `connection.send_request().block_task()`; closed channel →
  `Aborted`. `on_prompt_result` maps `Cancelled`→`prompt_cancelled`, classifies rate-limit → emits
  `Event::RateLimit`, `SessionContextReset` on a dropped resumed id, `PromptRejected{agent_busy}`.
  `on_follow_up`/`steer_or_backlog`/`on_steer_result`/`finish_turn`. Server dispatch
  `decide(state,WorkerLiveness)`→`Sent|Steered|Queued{reason}`; `hold_solo_command` downgrades
  Steered→Queued.
<!-- consolidation: discard; ref: none; reason: External prompt dispatch flow. -->
- **Config/defaults.** `CONTROL_PROTOCOL_VERSION=3`; frame caps `MAX_AGENT_FRAME_BYTES+64K`, queue 4096
  frames/128MiB; prompt REST body 28MiB.
<!-- consolidation: discard; ref: none; reason: External protocol limits. -->
- **Capability.** Steering only when the agent advertises `_meta.steering.supported`; compaction
  follow-up rejected not steered.
<!-- consolidation: discard; ref: none; reason: External steering capability gate. -->
- **Source.** `…/src/acp/acp_client/connection/prompt.rs`; `src/acp/dispatch.rs`; `server/api/acp/prompt.rs`.
- **Gaps.** `acp_client/control.rs` + `connection/*` full bodies.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### A05 — Prompt queue enqueue/list/edit/remove/clear/recall [F]
- **WHAT.** Server-owned prompt queue.
<!-- consolidation: discard; ref: none; reason: External prompt-queue feature inventory. -->
- **HOW.** Dispatch parks on `QueueReason`; turn-end drain delivers. `Supervisor::PromptDisposition
  {Forward,ResetContext}`. REST `POST/GET/DELETE /queue`, `PATCH/DELETE /queue/{promptId}`. TUI
  `structured_view/queue.rs::QueueMirror` with a `resume` hook `recallNav`.
<!-- consolidation: discard; ref: none; reason: External queue API and dispatch flow. -->
- **Config/defaults.** Batching + solo-command isolation (`is_solo_command`).
<!-- consolidation: discard; ref: none; reason: External queue policy. -->
- **Source.** `…/src/acp/dispatch.rs`; `src/server/api/acp/queue.rs`; `tui/structured_view/queue.rs`.
- **Gaps.** Failed/cancelled-turn policy; queue persistence across worker death.
<!-- consolidation: discard; ref: none; reason: External audit follow-up rather than an adoption decision. -->

#### A06 — Cancel/escalate/force-end-turn [F]
- **WHAT.** Cooperative cancel with escalation; forced turn end.
<!-- consolidation: discard; ref: none; reason: External turn-cancellation inventory. -->
- **HOW.** In-turn `on_command(ClientCmd::Cancel)`: sends `session/cancel`; **first cancel only** arms
  escalation (`turn.start_cancel_grace()`, `Event::CancelRequested{escalates_at = now +
  CANCEL_ESCALATION_GRACE (fallback 10s)}`); terminal handler `kill_on_drop(true)`; `forget_stale_cancel`
  resets on respawn/switch. REST `POST /acp/cancel` + `/acp/force_end_turn`.
<!-- consolidation: discard; ref: none; reason: External cancellation flow. -->
- **Source.** `…/src/acp/acp_client/connection/prompt.rs`; `runner_lifecycle.rs`; web
  `useCancelEscalation`.
- **Gaps.** Force-end-turn watchdog body; background/tool cleanup on force.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### A07 — Approvals and permission modes / auto-approve [F]
- **WHAT.** Approval requests, decisions, permission modes/YOLO.
<!-- consolidation: discard; ref: none; reason: External provider-permission inventory. -->
- **HOW.** `approvals.rs` (`Nonce`, `ApprovalDecision`, `ApprovalOption`, `is_choice_list`,
  `is_destructive`, `tool_target`); `permissions.rs::build_approval`/`resolve`; client
  `permission_handlers.rs::decision_for_option`/`cancel_approval` (choice-list with no pick cancels);
  policy `agent_policy.rs::AgentPolicy{load,deny_all,allows}` gated by `acp.allowed_agents`/restrict.
<!-- consolidation: discard; ref: none; reason: External approval and provider policy flow. -->
- **Config/defaults.** YOLO mode id per profile: claude `bypassPermissions`, codex
  `agent-full-access`, gemini/kimi `yolo`, opencode unverified, aoe-agent none.
<!-- consolidation: discard; ref: none; reason: External permission-mode matrix. -->
- **Source.** `…/src/acp/{approvals,permissions,agent_policy}.rs`; `permission_handlers.rs`.
- **Gaps.** Always/deny scope + nonce lifetime.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### A08 — User questions and elicitation responses [F]
- **WHAT.** Non-approval user questions/elicitation.
<!-- consolidation: discard; ref: none; reason: External elicitation feature inventory. -->
- **HOW.** `elicitations.rs::parse_elicitation` validates order/constraints/defaults;
  `build_response(&Elicitation, ElicitationResolution)`: Decline/Cancel/Accept{answers} with
  `UnknownField` rejection, maps through `field_content`; `summarize_answers`. Skip = omit field.
<!-- consolidation: discard; ref: none; reason: External elicitation validation and response flow. -->
- **Source.** `…/src/acp/elicitations.rs`; `server/api/acp/prompt.rs`; web
  `AskUserQuestionCard`/`ElicitationAnswerCard`.
- **Gaps.** Pending-state restoration via `unresolved_elicitation_nonces` (A11) flow.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### A09 — Agent/model/effort/mode/config-option controls [F]
- **WHAT.** Switch agent/model/effort/mode/config options.
<!-- consolidation: discard; ref: none; reason: External live controls differ from approved task-mode settings. -->
- **HOW.** `switch_acp_agent`: read-only+cityhall gates, non-empty target, submission barrier,
  `ensure_startable`, `check_switch_target`, records `before_seq`, `shutdown_and_wait(5s)`, clears
  `acp_load_session_capable`, ensures container, `forget_stale_cancel`, fresh SpawnRequest
  (`stored_acp_session_id:None, fork_from:None, seed_history_replay:false, sandbox_continuation:Fresh,
  effort:None, claude_store_pin:None`). `AgentProfile` capability flags (`clear_aliases`,
  `compact_aliases`, `clear_requires_driven_reset`, `supports_exit_plan_mode`, `supports_wakeup_tools`,
  `emits_heartbeat_keepalives`, `yolo_mode_id`, ...). `option_catalog.rs` caches advertised
  descriptors (0600 atomic, debounced).
<!-- consolidation: discard; ref: docs/specs/sessions.md#stopping-and-exact-resume; reason: External switching cannot authorize implicit fresh-conversation replacement. -->
- **Config/defaults.** Profiles: DEFAULT + 11 agent profiles; `AcpAgentDefaults`.
<!-- consolidation: discard; ref: none; reason: External profile defaults. -->
- **Source.** `…/src/server/api/acp/worker.rs`; `src/acp/{agent_profiles,option_catalog,agent_policy}.rs`.
- **Gaps.** Resume/carry semantics for option changes; OpenCode bypass id unverified.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### A10 — Claude provider switching [F]
- **WHAT.** Switch Claude provider (API/Bedrock/Vertex).
<!-- consolidation: discard; ref: none; reason: External provider-switch feature inventory. -->
- **HOW.** `switch_acp_provider`: validate provider ∈ `["api","bedrock","vertex"]` else 400; submission
  barrier; holds instance lock across shutdown+respawn; `is_structured`; `ensure_startable`; Claude-only
  (non-claude → 409 `provider_switch_unsupported`); pinned-unchanged → 400; mid-turn/background → 409;
  `shutdown_and_wait(5s)` then verify `Absent` else 409 `worker_not_stopped`; `persist_provider_switch`;
  `ensure_container_for_session_locked` (rebuilds container because the GCP ADC bind mount is decided
  at create time); respawn. `model_cleared` when old model ≠ `PROVIDER_DEFAULT_MODEL`.
<!-- consolidation: discard; ref: none; reason: External provider-switch transaction. -->
- **Note.** "The conversation survives: provider changes where tokens are served from, not which
  transcript is resumed."
<!-- consolidation: discard; ref: docs/PRODUCT.md#open-questions; reason: AoE cross-service provider switching is reference evidence rather than an approved provider-support guarantee. -->
- **Source.** `…/src/server/api/acp/worker.rs`; `src/acp/sandbox.rs`; `src/session/environment.rs`.
- **Gaps.** Exact provider env matrix.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### A11 — History/replay/tail/status/logs and search [F]
- **WHAT.** Event store, replay, transcript, search, logs.
<!-- consolidation: discard; ref: none; reason: External event-history inventory. -->
- **HOW.** `event_store/mod.rs` SQLite (`open(db_path,max_events_per_session)`, idempotent `record` on
  seq, retention keeps snapshot events); `replay.rs` pages forward/back with turn-boundary trim;
  `search.rs` LIKE-escaped grouped by session; `turns.rs` derived queries (latest_plan,
  pending_approval_requests, has_in_flight_turn, ...); `transcript.rs` render-time dedup +
  `apply_event→Vec<TranscriptDelta>`; `session_tee.rs` per-session log tee.
<!-- consolidation: discard; ref: none; reason: External SQLite event-store implementation. -->
- **Config/defaults.** `max_events_per_session` retention.
<!-- consolidation: discard; ref: none; reason: External event retention setting. -->
- **Source.** `…/src/acp/event_store/*.rs`; `src/acp/{transcript,session_tee}.rs`; `src/events/mod.rs`.
- **Gaps.** CLI `{History,Tail,Status,Logs}` arms + broadcast-gap handling.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### A12 — ACP attach and cross-machine clients [F]
- **WHAT.** Remote/local ACP client attach.
<!-- consolidation: discard; ref: none; reason: External ACP client inventory. -->
- **HOW.** `acp/client/mod.rs`: shared `DaemonEndpoint` discovery (1. `AOE_DAEMON_URL` (+ optional
  `AOE_DAEMON_TOKEN`), 2. local `<app_dir>/serve.url` paired with live `serve.pid`); `require_daemon`
  returns `NoDaemonRunning` (callers bail with a hint, no by-side-effect daemon start). Modules
  `discovery.rs`, `http.rs` (REPLAY_PAGE_SIZE), `ws.rs`, `passphrase_session.rs`. TUI `remote_home/**`,
  `structured_view/embedded.rs`. `setup_view` uses `ws_connect_projections_only` + a side task fetch.
<!-- consolidation: discard; ref: none; reason: External endpoint discovery and attach flow. -->
- **Unsupported.** No-subcommand session list bearer-only (no passphrase flow).
<!-- consolidation: discard; ref: none; reason: External client authentication limit. -->
- **Source.** `…/src/acp/client/{mod,discovery,http,ws,passphrase_session}.rs`; `tui/remote_home/**`.
- **Gaps.** Endpoint-discovery/visibility-lifecycle/reconnect bodies.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### A13 — Structured transcript / markdown / tool cards / plans [F]
- **WHAT.** Structured transcript rendering (TUI + web).
<!-- consolidation: discard; ref: none; reason: External transcript UI inventory. -->
- **HOW.** TUI `structured_view/state.rs::StructuredViewState` (ChoicePicker, MouseTargets,
  PluginNotifyState, RecallState, FileIndex, notices), `reducer.rs` event→state
  (`AcpTranscript::merge_server_rows`, `apply_transcript_delta`, `apply_reduced_state` — drops older
  seqs, honors cold-field `unchanged` skip, derives the status banner, filters `locally_resolved`
  approval/elicitation cards), `render.rs`, `input.rs`; web `hooks/acpSession/{reducer,replay,stateCache,
  useAcpConnection}` + `components/acp/**` (ThreadMessages/ToolCards/PlanStrip etc.).
<!-- consolidation: discard; ref: none; reason: External transcript rendering flow. -->
- **Source.** `…/src/tui/structured_view/**`; web `hooks/acpSession/**`; `components/acp/**`.
- **Gaps.** Event→card gates + reasoning/media/error mapping.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### A14 — Background agents, plan exit, scheduled wakeups/monitoring [F]
- **WHAT.** Background sub-agents; plan exit; wakeups/monitoring.
<!-- consolidation: discard; ref: none; reason: External background-agent inventory. -->
- **HOW.** `background_agent.rs`: `TailerStart{Live,Resumed}`; `missing_transcript_outcome` (Live
  missing → Error; Resumed missing → Detached); `spawn_tailer` dedups on the `active` set, RAII
  `ActiveGuard`; `run_tailer` parses JSONL via `fold_line/fold_tool_use/fold_tool_result` (MAX_TOOLS=250),
  `infer_idle_outcome`, `progress`/`completed` events. Profile flags `supports_wakeup_tools`/
  `supports_exit_plan_mode`.
<!-- consolidation: discard; ref: none; reason: External background monitoring algorithm. -->
- **Source.** `…/src/acp/background_agent.rs`; `src/acp/agent_profiles.rs`; web `BackgroundAgentsPanel`.
- **Gaps.** Notification/stop effects.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### A15 — Slash commands, clear/reset, compact [F]
- **WHAT.** Slash commands; clear/reset; compact.
<!-- consolidation: discard; ref: none; reason: External slash-command inventory. -->
- **HOW.** `AgentProfile::{is_clear_command,is_compact_command,is_solo_command}` match aliases tolerating
  whitespace + trailing arg cluster. `PromptDisposition::ResetContext` for a clear command the adapter
  cannot handle natively → `Supervisor::reset_session_context`. Clear aliases: claude/aoe-agent `/clear`
  (driven reset), codex/opencode/omp/kimi `/new`; compact only claude `/compact`.
  `structured_view/slash.rs::slash_query`/`filter_commands`.
<!-- consolidation: discard; ref: none; reason: External command dispatch and reset flow. -->
- **Unsupported/boundary.** aoe-agent forwarding `/clear` is ordinary model text; `set_mode` accepts any
  id but changes nothing; driven-reset vs forwarded distinction is the key boundary.
<!-- consolidation: discard; ref: none; reason: External adapter behavior boundary. -->
- **Source.** `…/src/acp/agent_profiles.rs`; `src/acp/supervisor/mod.rs`; `tui/structured_view/slash.rs`.
- **Gaps.** Web slash completion.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### A16 — Attachments, mentions/files and managed artifacts [F]
- **WHAT.** Attachments, mention/file index, managed artifacts.
<!-- consolidation: discard; ref: none; reason: External attachments differ from generic task artifacts. -->
- **HOW.** `session/artifacts.rs::session_artifact_dir` (validates id, `<app>/artifacts/<id>`),
  `resolve_artifact_path` (canonical + `starts_with(root)` + regular file; rejects traversal/symlink/dir),
  `artifact_dir_path`; `ARTIFACT_DIR_ENV`, `CONTAINER_ARTIFACT_DIR="/aoe/artifacts"` (agent env
  `acp_client/runner.rs:227`, container var `acp_client/session_sandbox.rs:130`). <!-- consolidation: discard; ref: none; reason: External artifact paths and environment. --> Uploads:
  `server/api/acp/attachments.rs::validate_attachments` requires known agent capabilities (else 409),
  caps MAX_ATTACHMENTS=8, MAX_ATTACHMENT_BYTES=10MiB, MAX_TOTAL_ATTACHMENT_BYTES=20MiB, per-kind MIME
  allowlists (SVG excluded), image magic-byte sniff == declared MIME, base64 pre-decode size guard.
<!-- consolidation: discard; ref: none; reason: External attachment validation policy. -->
  Blobs persist via `event_store/attachments.rs::record_attachment` keyed to the `UserPromptSent` seq
  (dropped with retention/session delete); queued prompts buffer under `ref_id` capped
  `MAX_QUEUED_ATTACHMENT_BYTES_PER_SESSION=64MiB`, `MAX_QUEUED_PROMPTS_PER_SESSION=100`,
  `MAX_QUEUED_TEXT_BYTES=256KiB` (`server/api/queue.rs`). <!-- consolidation: discard; ref: none; reason: External attachment persistence and queue limits. --> REST `GET .../acp/attachments/{id}`
  (`prompt.rs::acp_attachment`, mime + `nosniff` + immutable cache; 28MiB prompt-body cap at
  `router.rs:318`), `GET .../acp/files` (`history.rs::acp_files`, cityhall-gated, MAX_LISTED_FILES=5000,
  skips dotfiles/build dirs). <!-- consolidation: discard; ref: none; reason: External attachment retrieval and file-list APIs. --> `acp/fs_handler.rs::FsPolicy::resolve_inside` (absolute → sandbox-map
  translate → canonicalize → reject symlink leaf → under an allowed root) backs `fs/read|write`
  (`O_NOFOLLOW`). TUI `structured_view/mention.rs`.
<!-- consolidation: discard; ref: none; reason: External filesystem bridge confinement. -->
- **Source.** `…/src/session/artifacts.rs`; `src/acp/fs_handler.rs`;
  `src/acp/event_store/attachments.rs`; `src/server/api/{acp/{attachments,prompt,history}.rs,queue.rs}`;
  `src/server/router.rs`.
- **Gaps.** Web/TUI inline rendering beyond the `mention.rs` picker; no attachment redaction exists
  (redaction covers stderr secrets / URL tokens only).
<!-- consolidation: discard; ref: none; reason: External rendering gap and redaction evidence. -->

#### A17 — Context primer/carry and compaction reminder [F]
- **WHAT.** Context primer/carry + compaction reminder.
<!-- consolidation: discard; ref: none; reason: External context-primer inventory. -->
- **HOW.** `context_primer.rs`: `PrimerOptions` defaults; `build_context_primer(events,before_seq,opts)`
  folds turns (`fold_turns`), clips assistant text (`clip_assistant_text`, `truncate_turn_body` drops
  oldest turns), skips ambient events, renders tool lines; REST `GET /acp/context-primer` →
  `ContextPrimerResponse`.
<!-- consolidation: discard; ref: none; reason: External context-primer algorithm. -->
- **Source.** `…/src/acp/context_primer.rs`; `src/acp/protocol.rs`.
- **Gaps.** Threshold trigger + dismissal/resume + carry-on-respawn wiring.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### A18 — Rate limits, retry/auto-resume, idle/orphan repair [F]
- **WHAT.** Rate-limit handling, retry/auto-resume, idle/orphan repair.
<!-- consolidation: discard; ref: docs/specs/sessions.md#creation-failure-and-recovery; reason: External automation does not settle recovery-policy gaps. -->
- **HOW.** `agent_compat.rs`: per-agent `CompatibilityPolicy`, `validate(...)`, `supports_steering`
  (`_meta.steering.supported` AND (non-Claude OR claude-agent-acp ≥ floor)), `version_gate_for`
  (ClaudeAgentAcp + OpenCode only), `auto_install_for` (npm only). `rate_limit.rs` classifiers.
<!-- consolidation: discard; ref: none; reason: External compatibility and rate-limit classification. -->
  `acp_reconciler/mod.rs::reconcile_acp_workers` (teardowns → stale workers → reaps → startup re-arm →
  idle reap 60s → terminal repair 30s → rate-limit resume → orphan sweep/readopt → drains → per-target
  skips → respawn budget). `idle.rs::repair_missing_terminal` (CAS `publish_stopped_if_seq`),
  `reap_idle_workers` (persists dormancy before shutdown). `rate_limit.rs::install_rate_limit_continuation`
  (`RATE_LIMIT_AUTO_RESUME_MAX_REDELIVERIES=5`).
<!-- consolidation: discard; ref: none; reason: External reconciliation and automatic retry flow. -->
- **Config/defaults.** `rate_limit_auto_resume` default off.
<!-- consolidation: discard; ref: none; reason: External automatic retry setting. -->
- **Source.** `…/src/acp/agent_compat.rs`; `src/acp/acp_client/{rate_limit,watchdog}.rs`;
  `src/server/acp_reconciler/**`.
- **Gaps.** Reset-time detection + no-event orphan policy detail.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### A19 — Bundled AoE multi-provider ACP agent [F]
- **WHAT.** Bundled Node ACP agent (`aoe-agent`).
<!-- consolidation: discard; ref: none; reason: External bundled-agent inventory. -->
- **HOW.** `acp-worker/aoe-agent/src/index.ts`: one Node process/session, NDJSON ACP, Vercel AI SDK 7
  `streamText`. `handlePrompt`: aborts prior prompt, joins text parts, `buildTools`,
  `stopWhen: stepCountIs(16)`, streams `fullStream` → `session/update`; persists non-empty turns when
  `AOE_ARTIFACT_DIR`. `buildTools`: Read/Write/Bash (`terminal/create`→wait→output→release, one-shot
  only). `pickModel` prefix routing claude-/gpt-/gemini- + explicit tags, **else Anthropic fallback**.
  ACP server: initialize (`loadSession` = has `AOE_ARTIFACT_DIR`; image/audio false), authenticate
  no-op, session/new (random hex id), session/load (restores from transcript; throws without artifact
  dir), session/set_mode no-op, session/prompt, session/cancel.
<!-- consolidation: discard; ref: none; reason: External bundled-agent flow and provider routing. -->
- **Config/defaults.** `DEFAULT_MODEL="claude-opus-4-7"`, `AOE_AGENT_MODEL`, `AOE_ARTIFACT_DIR`.
<!-- consolidation: discard; ref: none; reason: External bundled-agent defaults. -->
- **Unsupported.** No image/audio; no long-running Bash; local/openai-compatible ids fall back to
  Anthropic; set_mode/forwarded `/clear` no-ops.
<!-- consolidation: discard; ref: none; reason: External bundled-agent limits. -->
- **Source.** `…/acp-worker/aoe-agent/src/{index,transcript,toolKind}.ts`.
- **Gaps.** None material.
<!-- consolidation: discard; ref: none; reason: External audit coverage assessment. -->

#### A20 — ACP filesystem/terminal/MCP and sandbox bridge [F]
- **WHAT.** Client/server RPC capability boundaries; fs/terminal/MCP bridge; sandbox path mapping.
<!-- consolidation: discard; ref: none; reason: External ACP bridge inventory does not approve integrations. -->
- **HOW.** `fs_handler.rs::FsPolicy{allowed_roots,sandbox_map}`, `resolve_inside` (absolute,
  container→host longest-prefix, canonicalize, reject symlink leaf, `starts_with` root else
  `OutsideRoots`), `handle_read`/`handle_write` `O_NOFOLLOW`. <!-- consolidation: discard; ref: none; reason: External filesystem RPC confinement. --> `terminal_handler.rs::TerminalManager`
  (native `Command` or sandboxed `docker exec -w <cwd> <env>`), `wait_with_output` concurrent drain.
<!-- consolidation: discard; ref: none; reason: External terminal RPC execution. -->
  `mcp_config.rs::project_servers_to_acp` + `filter_for_capabilities` (drops http/sse unless the agent
  advertises). <!-- consolidation: discard; ref: none; reason: External MCP capability bridge. --> `sandbox.rs::ensure_container_for_session(_locked)` rebuilds on provider pick change. <!-- consolidation: discard; ref: none; reason: External sandbox rebuild behavior. -->
- **Source.** `…/src/acp/{fs_handler,terminal_handler,mcp_config,sandbox,dispatch,protocol,
  control_protocol,control_cache}.rs`.
- **Gaps.** Env/mount translation beyond longest-prefix + `docker_env_args`.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

### Domain C — Configuration, plugins and managed integrations (C01–C17)

#### C01 — Global/profile/repo configuration and environment precedence [F]
- **WHAT.** Layered config resolution and environment precedence.
<!-- consolidation: discard; ref: none; reason: External global-profile-repo layering inventory. -->
- **HOW.** `Config::load` raw TOML → strip stale `app_state` → typed; `app_state` re-read from
  `state.toml`. No `deny_unknown_fields`; `config_ignored_keys` reports typos. `update_config` =
  process mutex + cross-process flock + fresh load + apply `f` + atomic write (**documented
  no-rollback**). Precedence: defaults → sparse global → profile overrides (profile clears
  `!profile_overridable` fields) → `AOE_CITYHALL_MODE`-gated CityHall overrides → repo fields → launch
  overrides. `REPO_OVERRIDABLE_SECTIONS=["hooks","session","sandbox","worktree","updates"]`;
  `repo_may_override_field = profile_overridable && repo_policy==Allow`.
<!-- consolidation: discard; ref: docs/specs/configuration.md#configuration-access-and-precedence; reason: External precedence differs from approved task-project-root resolution. -->
- **Config/defaults.** 23 top-level fields (all `#[serde(default)]`); `environment` grammar
  `KEY=value`/`KEY=$VAR`/`KEY=$$literal`/bare pass-through; `AOE_`/`AGENT_OF_EMPIRES_` denied in host
  passthrough.
<!-- consolidation: discard; ref: docs/specs/sessions.md#inputs-delivered-to-the-agent; reason: External ambient environment forwarding differs from explicit launch environment. -->
- **Unsupported.** No `deny_unknown_fields`; no `update_config` rollback.
<!-- consolidation: discard; ref: none; reason: External configuration limitations. -->
- **Source.** `…/src/session/config/{mod,profile_config}.rs`; `repo_config/mod.rs`; `session/environment.rs`.
- **Gaps.** Complete env-var consumer map; `ProfileConfig` per-field validation wiring.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### C02 — Settings schema/explain/editor/search/live reload [F]
- **WHAT.** Settings descriptors, explain, editor, search, live reload.
<!-- consolidation: discard; ref: none; reason: External settings tooling inventory. -->
- **HOW.** `SettingsSection` derive → `settings_descriptors()`; `registry::build_schema` = 15 core
  sections; `runtime_schema` appends virtual `plugin:<id>` sections. `FieldDescriptor` contract;
  `WidgetKind`; `WebWritePolicy` (Allow/RequiresElevation/LocalOnly); `RepoPolicy` (**Deny default**);
  `ValidationKind`; `policy.rs::validate_patch`/`strip_local_only`. `Explain{key}`.
  `resolved.rs::SettingSource` (User/PluginDefault/ManifestDefault/SchemaDefault) + `resolve`.
  `merge.rs`/`validate.rs`. `SettingsView::save`; `file_watch.rs`.
<!-- consolidation: discard; ref: none; reason: External schema and settings implementation. -->
- **Config/defaults.** Verified defaults include logging level `info`, acp `default_agent`
  `aoe-agent`, `trash_retention_minutes=43200`, `restart_wake_message`, `live_send_exit_chord=Ctrl+q`,
  worktree templates, sandbox image (lane lists exact serde defaults).
<!-- consolidation: discard; ref: none; reason: External configuration default ledger. -->
- **Source.** `…/src/session/config/settings_schema/{mod,registry,policy,resolved,merge,validate}.rs`;
  `src/file_watch.rs`.
- **Gaps.** Every descriptor's exact hidden flag; watcher degradation policy; web search index.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### C03 — Repo init/trust and lifecycle hooks [F]
- **WHAT.** Repo init, trusted-repo gating, lifecycle hooks.
<!-- consolidation: discard; ref: none; reason: External repository-hook inventory. -->
- **HOW.** `cli/init.rs` canonicalizes path, refuses if repo config exists, writes `INIT_TEMPLATE` (no
  trust at init). `repo_config/trust.rs`: `compute_hooks_hash`, `is_repo_trusted`, `trust_repo`,
  `TrustSurface<T>` (Untrusted/Stale/Trusted via `resolve`), `RepoTrust`, `check_repo_trust` — trust per
  surface, hashed; changed hooks hash or `.mcp.json` fingerprint invalidates. `hooks.rs`:
  `HooksConfig{on_create,on_launch,on_destroy}` + `HookTimeout`; `HostHooksConfig{before_start,
  before_session}` **host-only, never honored from repo config**. Executors with tail-capped errors.
<!-- consolidation: discard; ref: none; reason: External init and hook trust implementation. -->
- **Unsupported.** Repo cannot set `host_hooks`, personal/global sections, or denied sandbox/worktree/
  session fields.
<!-- consolidation: discard; ref: none; reason: External repository configuration restrictions. -->
- **Source.** `…/src/cli/init.rs`; `repo_config/{trust,hooks}.rs`.
- **Gaps.** Create/launch/destroy call-order call sites (W/S).
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### C04 — Themes/truecolor/palette/contrast/idle decay [S]
- **WHAT.** Theme resolution, color mode, contrast, idle decay.
<!-- consolidation: discard; ref: none; reason: External theme feature inventory. -->
- **HOW.** `ThemeCommands` List/Export/Dir. Resolution **global-only**: `resolve_theme_name`/
  `resolve_theme_palette_mode` read global config never profile-merged; empty name → `zinc`.
  `ThemeConfig{name,color_mode,idle_decay_minutes}` (global_only). Builtin files
  `themes/builtin/*.toml` (8 named); `tui/styles/mod.rs` theme discovery/load/export; plugin theme
  contributions; `contrast.rs`, `palette.rs`, `resolved.rs`.
<!-- consolidation: discard; ref: none; reason: External theme resolution implementation. -->
- **Config/defaults.** `color_mode=Truecolor`; `idle_decay_minutes=0`.
<!-- consolidation: discard; ref: none; reason: External theme defaults. -->
- **Source.** `…/src/cli/theme.rs`; `src/tui/styles/**`; `themes/builtin/**`.
- **Gaps.** Exact builtin theme count/contents; TUI selector/web preference leaves; fallback code path;
  idle-decay render behavior.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### C05 — Plugin list/info/hash/enable/disable [F]
- **WHAT.** Plugin registry list/info/hash/toggle.
<!-- consolidation: discard; ref: none; reason: External plugin-management inventory. -->
- **HOW.** `PluginRegistry::load` scans compiled `BUILTINS` then external `plugins_dir()`; external load
  non-fatal. `LoadedPlugin{...}`; `active() = enabled && granted`; builtins auto-granted. `validation_for`
  re-derives Featured from the embedded `FeaturedIndex` + `integrity::tree_hash`, ignoring the user
  lockfile. Reserved `aoe.*`/`agent-of-empires.*` namespace skipped unless Featured. `Hash` →
  `tree_hash` (sha256 sorted paths, prefix, skips `.git`/`.aoe-build`, **rejects symlinks**).
  `grant_covers`; `needs_reapproval`. `set_enabled_live` → `LiveToggle`.
<!-- consolidation: discard; ref: none; reason: External plugin registry and grant flow. -->
- **Source.** `…/src/cli/plugin.rs`; `src/plugin/{registry,integrity}.rs`.
- **Gaps.** `view.rs` non-theme contributions; registry reload triggers.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### C06 — Plugin discover/install/uninstall [F]
- **WHAT.** Discover/install/uninstall external plugins.
<!-- consolidation: discard; ref: none; reason: External plugin installation inventory. -->
- **HOW.** `PluginSource::parse` (`gh:owner/repo[@ref]` or local dir, rejects malformed). `fetch::fetch`
  (git clone/checkout peeled tag, pinned sha skips remote, or release binary download; `copy_tree`
  rejects symlinks). `discover::discover` searches GitHub `aoe-plugin` topic. `install`:
  `prepare_install` → resolve → fetch → `verify_featured` → `reject_reserved_or_builtin` →
  `reject_incompatible_host` (aoe_version semver) → consent unless `--yes` → build under `.aoe-build`
  → `move_into_place` → `persist_install` (source + `CapabilityGrant`) → `write_lock`. `uninstall`
  external only.
<!-- consolidation: discard; ref: none; reason: External plugin installation transaction. -->
- **Source.** `…/src/plugin/{install,fetch,discover,source,lockfile}.rs`.
- **Gaps.** Exact rollback/atomicity (`replace_and_build`); install-job server routes.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### C07 — Plugin updates/outdated/auto-update/dismiss [F]
- **WHAT.** Plugin update check/apply/auto-update/dismiss.
<!-- consolidation: discard; ref: none; reason: External plugin-update inventory. -->
- **HOW.** `Outdated` → `update_check::outdated` → `UpdateStatus`; `resolve_latest_release`. `Update` →
  `update(id,yes)` → `prepare_update` → `update_with_consent` (consent on capability change:
  `UpdateConsent{from/to,caps added/removed,...}`); `apply_update`; `dismiss_update(id,fingerprint)`.
  `restart_worker_live` → `LiveRestart{Daemon,NoDaemon,DaemonStale}`. `auto_update.rs::sweep` iterates
  outdated, applies `update_clean`, restart via notifier or `restart_worker_live`; `spawn_if_enabled`
  only when `updates.auto_update_plugins`. `automation_policy` gates plugin-driven session automation
  (MAX_PLUGIN_CREATES_PER_HOUR=20, MAX_ACTIVE_PLUGIN_SESSIONS=5, MAX_PLUGIN_TURNS_PER_HOUR=120,
  MAX_PLUGIN_MESSAGES_PER_HOUR=600, ROLLING_WINDOW_MS=1h).
<!-- consolidation: discard; ref: none; reason: External plugin update and automation policy. -->
- **Source.** `…/src/plugin/{install,update_check,auto_update,automation_policy}.rs`.
- **Gaps.** `changelog.rs` body; changed-capability re-approval server route; outdated cache TTL.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### C08 — Plugin CLI graft/commands/keybinds [F]
- **WHAT.** Plugin-contributed CLI commands and keybinds.
<!-- consolidation: discard; ref: none; reason: External plugin command inventory. -->
- **HOW.** `cli/graft.rs`: `plugin_commands()` collects `manifest.commands` from `registry().active()`;
  `graft_onto` adds a subcommand per plugin command **skipping core subcommand names and duplicate
  names** (built-in precedence); `augmented_command()` then `hide_disabled_serve` hides `serve` when
  `web_disabled()`. `dispatch_plugin_command` prints a stub ("plugin runtime not available yet") —
  plugin CLI commands are **declared but not executable via a real dispatch** at this pin. <!-- consolidation: discard; ref: none; reason: External command grafting and stub-dispatch evidence. --> Keybinds:
  manifest `keybinds[{command,key}]`; `Info` prints shadowed-by-core/invalid.
<!-- consolidation: discard; ref: none; reason: External plugin keybinding declarations. -->
- **Source.** `…/src/cli/graft.rs`; `aoe-plugin-api/src/manifest.rs`.
- **Gaps.** Actual plugin-command execution path (stub only); completion for grafted commands.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### C09 — Plugin worker RPC/capability grants/sandbox/storage [F]
- **WHAT.** Plugin worker host, RPC, capability grants, sandbox, storage.
<!-- consolidation: discard; ref: none; reason: External plugin-host inventory. -->
- **HOW.** `PluginHost` worker table; `start`/`reconcile`/`restart_worker`/`launch_locked`/`supervise`/
  `spawn_once`/`plan_reconcile`; bounded session-status queue; `shutdown`. `launch.rs::resolve_launch`
  resolves runtime (PATH/plugin-relative/release binary) with `LaunchError` variants. `sandbox.rs`
  `SandboxBackend` trait (default `NoSandbox`). `protocol.rs` JSON-RPC NDJSON with error codes
  (FORBIDDEN/POLICY_DENIED/CONFLICT/RATE_LIMITED/...). `host_api.rs::dispatch`:
  events/session.meta/sessions.list/config.get/ui.*/plugin.storage.*; caps enforced; storage namespace
  + quota. `session_api.rs::dispatch`: acp.capabilities.*/sessions.create/sessions.turn.send/
  sessions.message.send; unattended mode admission.
<!-- consolidation: discard; ref: none; reason: External plugin-host lifecycle and RPC implementation. -->
- **Config/constants.** `EVENT_RETENTION_PER_TOPIC=10000`, `MAX_WORKERS=32`, `MAX_RESPAWNS=3`,
  `RESPAWN_WINDOW=60s`, `STATUS_QUEUE_CAP=64`; `STORAGE_MAX_KEYS=64`; `MAX_ENTRIES_PER_SCOPE=32`.
<!-- consolidation: discard; ref: none; reason: External plugin-host limits. -->
- **Source.** `…/src/plugin/{host,host_api,session_api,protocol,launch,sandbox}.rs`.
- **Gaps.** Exact RPC timeout values; supervisor crash-backoff policy.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### C10 — Plugin settings/dynamic selects/object lists [F]
- **WHAT.** Plugin settings descriptors, dynamic selects, object lists.
<!-- consolidation: discard; ref: none; reason: External plugin-settings inventory. -->
- **HOW.** Manifest `settings: Vec<SettingContribution>` + `setting_defaults`;
  `settings_schema/plugin.rs::plugin_field_descriptors` → `FieldDescriptor`s under `section="plugin:<id>"`;
  `widget_and_validation` maps `SettingType`→Widget/Validation; `OptionSource` =
  acp.agents|acp.models|acp.modes|projects|groups (resolved at render time). Plugin patches validated
  then rewritten into `plugins.<id>.settings`.
<!-- consolidation: discard; ref: none; reason: External plugin schema flow. -->
- **Source.** `…/src/session/config/settings_schema/plugin.rs`; `aoe-plugin-api/src/manifest.rs`.
- **Gaps.** Server resolve-options/action route handlers; dynamic request ownership.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### C11 — Plugin UI slots/badges/panes/composer actions [F]
- **WHAT.** Plugin UI contributions.
<!-- consolidation: discard; ref: none; reason: External plugin UI inventory. -->
- **HOW.** `UiSlot` (`status-bar,row-badge,row-column,sort-key,filter-facet,card,pane,composer-action,
  detail-badge,home-pane,notification`). `ui_state.rs::UiStore` (begin_generation/revision/set/remove/
  notify/clear_plugin/snapshot; `links_for` link safety). `view.rs::PluginView`/`UiContributionView`.
  TUI `plugin_ui.rs`; web `components/plugin/*`.
<!-- consolidation: discard; ref: none; reason: External plugin UI storage and rendering flow. -->
- **Source.** `…/src/plugin/{ui_state,view,contributions}.rs`; `src/tui/plugin_ui.rs`.
- **Gaps.** Streaming payload/link-safety validation; slot visibility; composer draft effect.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### C12 — Built-in plugin contributions [F]
- **WHAT.** In-tree builtin plugins.
<!-- consolidation: discard; ref: none; reason: External bundled-plugin inventory. -->
- **HOW.** `registry.rs:34 BUILTINS` contains exactly **one** entry, `#[cfg(feature="web")] aoe.web`,
  sourced from `plugins/aoe-web/aoe-plugin.toml` via `include_str!` (id `aoe.web`, no capabilities/
  commands/ui; `aoe serve` refuses to start while disabled). `featured.toml` is a curated **featured
  index** (agent-of-empires.github, agent-of-empires.cron), not builtin contributions.
<!-- consolidation: discard; ref: none; reason: External builtin versus featured registry evidence. -->
- **Unsupported/pending.** **No other builtin plugin manifests exist in-tree** (inventory's "names
  beyond web builtin pending" — confirmed none on disk).
<!-- consolidation: discard; ref: none; reason: External plugin inventory correction. -->
- **Source.** `plugins/aoe-web/aoe-plugin.toml`; `plugins/featured.toml`; `src/plugin/registry.rs`.
- **Gaps.** None currently; runtime module list awaited.
<!-- consolidation: discard; ref: none; reason: External audit coverage assessment. -->

#### C13 — MCP layered server discovery/provenance [F]
- **WHAT.** Layered MCP server discovery with provenance.
<!-- consolidation: discard; ref: none; reason: External MCP management inventory is not adoption approval. -->
- **HOW.** `McpCommands::List`. `mcp_model.rs` layers **first-wins shadowing** (`resolve`): 1
  AgentNative, 2 Global `<app_dir>/mcp.json`, 3 Profile, 4 ProjectLocal repo `.mcp.json` (only if
  trusted at current fingerprint). `ResolvedMcpServer{def,provenance,shadowed}`; `RedactedMcpServer`
  redacts env/header values. Transports stdio/http/sse. `mcp_overrides.rs::upsert_global_server` under
  `locked_update` preserving other content.
<!-- consolidation: discard; ref: none; reason: External MCP precedence and redaction flow. -->
- **Source.** `…/src/session/mcp/{mcp_model,project_mcp,mcp_overrides}.rs`; `src/acp/mcp_config.rs`.
- **Gaps.** Full user MCP definition/override fields.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### C14 — MCP conflicts/drift/keep/drop/resolve [F]
- **WHAT.** MCP conflict/drift management and keep/drop/resolve.
<!-- consolidation: discard; ref: none; reason: External MCP drift-management inventory. -->
- **HOW.** `mcp_state.rs`: persisted `McpState`; `McpConflict`; `reconcile_agent` (adopt new, persist
  conflicts/removals); `keep_removed` promotes a removal to global; `forget_native`; `resolve_conflict`
  with stale-token detection; `with_locked_state` (flock). Drift paused when a native entry is
  malformed.
<!-- consolidation: discard; ref: none; reason: External MCP reconciliation algorithm. -->
- **Source.** `…/src/session/mcp/{mcp_state,mcp_overrides}.rs`.
- **Gaps.** Restart/propagation policy on native writes; exact API handlers.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### C15 — Skills list/view/create/edit/adopt/remove/sync [F]
- **WHAT.** Skill discovery/edit/adoption/sync.
<!-- consolidation: discard; ref: none; reason: External skill-management inventory. -->
- **HOW.** `SkillCommands` 7 variants. `skills_model.rs::SKILL_ROOTS` (6 roots verified: claude-user,
  agents-standard, gemini-user, opencode-user, kimi-legacy, prime-agent-user); `SkillProvenance` =
  AoeManaged|External{root}; `parse_skill_md`; `MAX_SKILL_MD_BYTES=1MiB`; limits package ≤64MiB/
  file ≤32MiB/≤1024 files/depth ≤16. Editor `VISUAL`→`EDITOR`→`vi`. Propagation marker
  `.aoe-managed.json` (v1); `Ownership` = Clean{Digest}|Drifted|Foreign|Absent; `sync_skills_into`/
  `sync_root`/`sync_all_roots`; `--replace` takes over a foreign/edited copy.
<!-- consolidation: discard; ref: none; reason: External skill propagation and ownership flow. -->
- **Source.** `…/src/cli/skill.rs`; `session/skills_model.rs`.
- **Gaps.** Skills API/UI routes + `SkillsManager.tsx`; read-only managed-store denial path.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### C16 — CityHall bundle export/apply [F]
- **WHAT.** CityHall settings/projects/git bundle export/apply.
<!-- consolidation: discard; ref: none; reason: External bundle-management inventory. -->
- **HOW.** `CityHallCommands::Export` (TOML to file/stdout), `Apply` (file/stdin). `SCHEMA_VERSION=1`;
  `CityHallBundle{schema_version,meta,settings,projects,git}`; both `from_toml` and `apply` bail on a
  mismatched `schema_version`. `apply()` order: `apply_settings` — `leaf_count`, then
  `validate_patch(Scope::Global, elevated=true)`, then `update_config` builds the new `Config` and
  assigns only on success (a failed deserialize cannot leave a half-applied struct); export emits only
  changed leaves with `retain_schema_fields`+`strip_local_only`+`strip_nulls`. <!-- consolidation: discard; ref: none; reason: External bundle schema and settings application. --> `apply_git_identity`:
  `git config --global --replace-all` user.name/email, HTTPS token → owner-only `~/.git-credentials`
  + `credential.helper=store --file`, SSH key → stage both `.new` files then `rename` into
  `~/.ssh/id_cityhall`+`known_hosts` + `core.sshCommand`. <!-- consolidation: discard; ref: none; reason: External Git identity and credential application. --> `apply_projects`: name must be one path
  segment (`check_project_name`), clone-if-missing, register-if-new, existing checkout/registration
  preserved; per-project failures collected (not fatal). <!-- consolidation: discard; ref: none; reason: External project import behavior. --> Secrets written 0600 (`write_owner_only`)
  from creation. `ApplyReport{settings_applied,cloned,registered,preserved,failures}`.
<!-- consolidation: discard; ref: none; reason: External secret-file permissions and result representation. -->
- **Source.** `…/src/session/cityhall_bundle.rs`; `src/cli/cityhall.rs`.
- **Gaps.** Bundle API handlers; npm inclusion.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### C17 — Host/agent telemetry integration guidance [G]
- **WHAT.** Guidance doc for exporting agent OTEL telemetry.
<!-- consolidation: discard; ref: none; reason: External telemetry guidance inventory. -->
- **HOW.** `docs/guides/otari-telemetry.md` is guidance only (host: merge `env` into
  `~/.claude/settings.json`; sandbox: `[sandbox] environment` + `AOE_OTARI_OTEL_HEADERS` referenced as
  `$AOE_OTARI_OTEL_HEADERS`). AoE's only source support is the generic `sandbox.environment` host-var
  synthesis (C01/W11); **there is no AoE Otari exporter**. Separate from AoE anonymous telemetry (O16).
<!-- consolidation: discard; ref: none; reason: External guidance and exporter absence evidence. -->
- **Source.** `…/docs/guides/otari-telemetry.md`.
- **Gaps.** No source beyond generic sandbox env forwarding supports the "export to Otari" claim;
  `AOE_OTARI_OTEL_HEADERS` is doc-only.
<!-- consolidation: discard; ref: none; reason: External audit evidence boundary. -->

### Domain O — Daemon, general UI and operations (O01–O18)

#### O01 — Serve foreground/background/start/status/stop/restart/URL [F]
- **WHAT.** `aoe serve` foreground server or a detached daemon child, managed by pid file.
<!-- consolidation: discard; ref: none; reason: External server-lifecycle inventory. -->
- **HOW.** `run`: `--stop`→`stop_daemon`; `--status`→`print_status`; `--restart`→`restart_daemon`; else
  profile check, CityHall env, refuse if verified daemon ≠ self, validate auth/proxy/allowlists,
  `--remote` requires `--passphrase`; `--daemon`→`start_daemon`. `daemon_status` uses kill(pid,0) +
  `inspect_daemon_process` → Verified/Absent/Unverified (never treated running). Foreground writes its
  own pid file + `server::start_server`. Background re-execs `serve --daemon-child`, `setsid`, writes
  pid file + `serve.launch`; `restart_daemon` recalls the passphrase before stopping. `stop_daemon`
  SIGTERM + wait. `aoe url` fails if no daemon; `--all` prints `label\turl`; `--token-only` extracts
  `?token=`.
<!-- consolidation: discard; ref: none; reason: External daemon launch and control flow. -->
- **Config/defaults.** port release 8080/debug 8081; host `127.0.0.1`; token lifetime remote 4h/local
  24h; token grace 300s.
<!-- consolidation: discard; ref: none; reason: External server defaults. -->
- **Source.** `…/src/cli/serve.rs`; `src/server/startup.rs`; `src/cli/url.rs`.
- **Gaps.** None material.
<!-- consolidation: discard; ref: none; reason: External audit coverage assessment. -->

#### O02 — API/WebSocket transport, snapshots and daemon IPC [F]
- **WHAT.** Single axum router + shared `AppState`; `DaemonClient` for remote list-sessions.
<!-- consolidation: discard; ref: none; reason: External HTTP architecture inventory. -->
- **HOW.** `build_router` registers 152 explicit route templates (+ SPA fallback with `web`); static
  segments before `{id}` wildcards; two body-cap overrides (paste-image 8MiB, acp/prompt 28MiB; global
  1MiB). **Middleware runtime order (confirmed):** outermost `DefaultBodyLimit(1MiB)` →
  `http_request_span` → `security_headers` → `access_policy` → `auth_middleware` → `cityhall_gate` →
  handler. <!-- consolidation: discard; ref: none; reason: External routing and middleware composition. --> `AppState` holds instances, session_service, token/login managers, rate_limiter, idempotency
  mutex maps, caches (cleanup defaults TTL 30s, changed-files TTL 1500ms), acp_events_tx (cap 256),
  plugin host/jobs, web_presence, telemetry counters, shutdown token, file_watch/disk_changed. <!-- consolidation: discard; ref: none; reason: External server state inventory. --> Startup
  loops (seed, two-phase recovery, snapshot loop, trash retention, `status_poll_loop` auto-spawns the
  reconciler, disk watcher, acp event listener, push/callback consumers, plugin forwarder). Graceful
  shutdown SIGINT/TERM/HUP → cancel, 5s grace, force exit; `acp_supervisor.detach_all()` survives. <!-- consolidation: discard; ref: none; reason: External daemon startup and shutdown pipeline. -->
  `DaemonClient` requires https or loopback HTTP for bearer; 15s timeout; no redirects. <!-- consolidation: discard; ref: none; reason: External daemon-client transport constraints. --> Handler bodies
  path→fn→line for every route family are enumerated in lane O (sessions, ACP, agents/profiles/FS/git/
  projects/system, skills, settings/themes/tips/app-state, plugins, push, login, about/update/log/
  telemetry, WebSockets/assets). Push handlers: `push.rs::{get_status:914, get_vapid_public_key:950,
  subscribe:961, unsubscribe:1031, test:1063}` for `/api/push/{status,vapid-public-key,subscribe,
  unsubscribe,test}` (`router.rs:246-253`).
<!-- consolidation: discard; ref: none; reason: External route-handler inventory. -->
- **Source.** `…/src/server/router.rs`; `src/server/state.rs`; `src/daemon/{mod,wire}.rs`.
- **Gaps.** None material.
<!-- consolidation: discard; ref: none; reason: External audit coverage assessment. -->

#### O03 — Remote tunnels/bind/proxy/discovery [F]
- **WHAT.** Expose loopback daemon via Tailscale Funnel or Cloudflare Tunnel; IP discovery.
<!-- consolidation: discard; ref: none; reason: External remote-access inventory. -->
- **HOW.** Transport precedence: named CF tunnel > Tailscale (when available + not `--no-tailscale`) >
  Cloudflare quick. Tailscale failure **not** silently downgraded (bail with remediation).
  `TunnelHandle::spawn_quick`/`spawn_named`/`spawn_tailscale` (60s per-step timeout), `is_stable_origin`
  (quick CF false), `shutdown` + health monitor. Writes `serve.url`/`serve.mode`; `tunnel_host` feeds
  the DNS-rebinding allowlist. `ip_discovery.rs::classify_ip` (CGNAT `100.64.0.0/10`=Tailscale),
  `discover_tagged_ips` sorts Tailscale>LAN>Loopback.
<!-- consolidation: discard; ref: none; reason: External tunnel selection and discovery flow. -->
- **Defaults.** quick CF rotates its URL on restart (breaks PWAs — warned).
<!-- consolidation: discard; ref: none; reason: External tunnel URL behavior. -->
- **Unsupported.** Tailscale failure without `--no-tailscale`; named tunnel without `--tunnel-url`.
<!-- consolidation: discard; ref: none; reason: External tunnel restrictions. -->
- **Source.** `…/src/server/{tunnel,ip_discovery}.rs`; `src/server/startup.rs`.
- **Gaps.** Funnel inspect/ACL, health-monitor internals, QR body.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### O04 — Token/passphrase auth and browser login/elevation/device revocation [F]
- **WHAT.** Three auth modes; token gate + passphrase wall + step-up elevation.
<!-- consolidation: discard; ref: none; reason: External authentication feature inventory. -->
- **HOW.** `AuthMode` Token|Passphrase|None; `resolve_auth_mode` + `check_auth_gate` (fail closed).
  `TokenManager` current+previous with 300s grace; `rotate` mints a 64-hex token persisted `serve.token`
  0600. `auth_middleware`: `resolve_client_ip` trusts forwarded headers only from loopback; rate-limit
  check before token validation; token candidates from cookie `aoe_token`, `?token=`, `Authorization:
  Bearer`, WS subprotocol. `RateLimiter` 5 failures → 15min lockout. Passphrase wall `run_passphrase_wall`
  (exempt paths, loopback bypass, login session + device binding); step-up `requires_elevation`
  (`PATCH /api/default-profile`, `POST /api/profiles`, per-profile writes except `PATCH .../settings`,
  `logout-all`, session DELETE). Cookies SameSite=Strict; **no CSRF token** (CSRF defense = SameSite +
  Origin allowlist, proved by absence).
<!-- consolidation: discard; ref: none; reason: External authentication flow and security evidence claim. -->
- **Config/defaults.** mode token; token lifetime remote 4h/local 24h; passphrase sessions persist by
  default (`AuthConfig.persist_sessions`).
<!-- consolidation: discard; ref: none; reason: External authentication defaults. -->
- **Unsupported.** no-subcommand daemon client is bearer-only (no passphrase flow).
<!-- consolidation: discard; ref: none; reason: External client authentication limit. -->
- **Source.** `…/src/server/{auth,token,rate_limit,login}.rs`.
- **Gaps.** Login device/elevation lifecycle tail; all `requires_elevation` call sites.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### O05 — Read-only and CityHall access restrictions [F]
- **WHAT.** Orthogonal read-only and CityHall default-deny; DNS-rebinding + security headers.
<!-- consolidation: discard; ref: none; reason: External HTTP access-control inventory. -->
- **HOW.** `access_policy`: canonicalize Host/Origin; deny missing Host, non-allowlisted Host/Origin
  unless trusted IP literal. `security_headers`: x-frame-options DENY, nosniff, no-referrer, strict CSP.
  `cityhall_gate`: when cityhall_mode and POST/PUT/PATCH/DELETE, allow only `CITYHALL_MUTATION_ALLOW`;
  `CITYHALL_MUTATION_ALLOW`/`DENY` disjoint + self-checked by a test enumerating every mutating route.
  Read-only `read_only_block`/`read_only_response` guard mutating handlers; `live_ws` drops binary
  input; plugin host disabled in read-only serve mode. Lane lists read-only call sites.
<!-- consolidation: discard; ref: none; reason: External HTTP access-policy implementation. -->
- **Source.** `…/src/server/{access.rs,api/mod.rs,live_ws.rs}`.
- **Gaps.** Exhaustive read-only call-site list (lane provided a broad list; not proven exhaustive).
<!-- consolidation: discard; ref: none; reason: External audit coverage limitation. -->

#### O06 — Dashboard/sidebar/search/group/sort/selection/triage [S]
- **WHAT.** Home TUI list navigation + grouping/sort/search/triage.
<!-- consolidation: discard; ref: none; reason: External session dashboard inventory differs from task workspace. -->
- **HOW.** `run_action` maps `ActionId` to state mutations (search matches/index, archive, row move,
  jump finished/waiting, favorite/snooze/unread, project pin, sort picker, group by, hide-stopped,
  preview info, diagnostics, system health, container toggle). Modes `SortOrder` (Newest, Attention,
  LastActivity, Oldest, AZ, ZA, Custom); `GroupByMode` (Manual, Project, Org). Persistence via
  `AppStateConfig` + `SessionConfig`.
<!-- consolidation: discard; ref: none; reason: External dashboard actions and state. -->
- **Defaults.** sort Newest; group Manual; unread off.
<!-- consolidation: discard; ref: none; reason: External dashboard defaults. -->
- **Source.** `…/src/tui/home/{input,bindings}.rs`; web sidebar/Dashboard.
- **Gaps.** `rows/selection/reorder/render/projects/profiles/user_action` bodies; web sidebar internals;
  conversation-vs-title search split implementation.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### O07 — General command palette/help/keybindings/menu activation [F]
- **WHAT.** Declarative binding table driving chords/palette/help; context menu; app executor.
<!-- consolidation: discard; ref: none; reason: External action-system inventory. -->
- **HOW.** `ActionId` (47, exactly one `Binding` each) declared in `BINDINGS`; `resolve(key,strict,ctx)`
  first table-order match honoring guards (Always/TerminalView/AttentionSort/FavoritesUsable/
  SearchActive/ProjectGroupSelected/UnreadEnabled/CustomSortable; `CustomSortable` always holds and
  self-explains rather than swallowing); `resolve_action` tries core then plugin keybinds (core shadows
  plugin on the same chord; plugin string chords via `parse_chord`/`keybind_matches`). <!-- consolidation: discard; ref: none; reason: External keybinding resolution algorithm. --> Chords
  (non-strict→strict): `q`=quit, `?`=help, `/`=search, `;`=tool-picker, `n`/`N`=new-session,
  `N`/`Ctrl-n`=new-from-selection, `b`/`B`=new-from-project, `t`/`T`=toggle-view, `T`/`Ctrl-t`=attach,
  `m`/`M`=send, `a`/`A`=permission, `x`/`X`=stop, `d`/`D`=delete, `r`/`R`=rename, `W`/`Ctrl-w`=
  worktree-name, `D`/`Ctrl-d`=diff, `R`/`Ctrl-r`=serve, `s`/`S`=settings, `p`/`P`=projects (pin
  `p`/`P` gated `ProjectGroupSelected`, listed first), `P`/`Ctrl-p`=profiles, `e`|`F5`/`E`|`F5`=
  restart, `u`/`Ctrl-u`=update, `U`/`U`=unread (UnreadEnabled), `z`/`Z`=archive, `i`/`I`=
  preview-info, `y`/`Y`=hide-stopped, `o`|`O`|`Ctrl-o`/`O`|`Ctrl-o`=sort, `g`/`Ctrl-g`=group-by,
  `w`/(none)=next-waiting, `v`/`V`=auto-name, `f`/`F`=favorite (FavoritesUsable), `h`/`H`=snooze
  (AttentionSort), `c`/`C`=container (TerminalView), `Ctrl-↑`/`Ctrl-↓`=move row (CustomSortable),
  `Alt-↑`/`Alt-↓`=jump finished, `n`/`n`=search-next (SearchActive). Palette-only, no chord:
  ToggleDiagnostics, OpenSystemHealth, AddProject, Tips, Plugins, Skills, Fork, EmptyTrash. <!-- consolidation: discard; ref: none; reason: External shortcut and palette action matrix. -->
  `HomeView::run_action`; `dispatch_action_key`/`handle_key` own arrows/Home/End/Enter/Tab/braces;
  `open_command_palette`; mouse `Down(Left)` routes context-menu→dialog→sidebar-collapse→diagnostics→
  tips-badge→`handle_click`→empty-list (activation deferred mid-burst), `Down(Right)` →
  `handle_right_click` (`tui/app.rs:742-757`); context menu 17 actions (`dialogs/context_menu.rs`)
  routed by `dispatch_context_menu_action` (`tui/home/input.rs:4849`). Executor 18 `Action` variants.
<!-- consolidation: discard; ref: none; reason: External keyboard and mouse activation routing. -->
- **Source.** `…/src/tui/home/{bindings,input}.rs`; `src/tui/app.rs`; `src/tui/dialogs/context_menu.rs`.
- **Gaps.** Web command enumeration; interior bodies of `dispatch_action_key`/context-menu routing and
  the full mouse `Down` body beyond the left/right precedence above.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### O08 — General UI layout/panes/mobile/preferences [S]
- **WHAT.** TUI panes/responsive layout; web shell/pane system with persisted prefs.
<!-- consolidation: discard; ref: none; reason: External multi-surface layout inventory. -->
- **HOW.** `tui/{responsive,home/layout,home/panes}.rs` own focus/collapse/resize; persistence fields
  `home_list_width`, `home_sidebar_collapsed`, `diff_file_list_width`, `show_preview_info`,
  `sidebar_position`, `daemon_sidebar`, `show_diagnostics_pane`, `show_shortcut_bar`. Web shell/dock/
  split/pane layout, DnD, focus scopes; assets served by the `web` feature.
<!-- consolidation: discard; ref: none; reason: External layout and preference implementation. -->
- **Defaults.** sidebar Left; shortcut bar shown; preview info hidden.
<!-- consolidation: discard; ref: none; reason: External presentation defaults. -->
- **Source.** config `AppStateConfig`/`SessionConfig`; `tui/{responsive,home/layout,home/panes}.rs`.
- **Gaps.** All layout bodies; web DnD; narrow/coarse-pointer behavior; resize persistence paths.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### O09 — Browser live terminal/paired shells/image paste [F]
- **WHAT.** Server-rendered terminal over WebSocket per viewer; no PTY, no tmux attach.
<!-- consolidation: discard; ref: none; reason: External browser terminal architecture inventory. -->
- **HOW.** Routes `/sessions/{id}/live-ws`, `…/terminal/live-ws`, `…/container-terminal/live-ws`.
  Server→client JSON text frames carry monotonic `seq` + geometry: `frame`/`patch` (ratio > 0.5 → full
  frame)/`size_owner`/`transport.grid`/`clipboard` (OSC 52). Client→server binary = raw pane input
  (dropped for read-only/non-owner); control `resize`/`claim`/`claim_if_vacant`/`window`/`cadence`/
  `resync`/`caps`/`paste`. Size-owner lock in tmux user options. Cadence fast 50ms/idle 250ms;
  `FRAME_MIN_INTERVAL_MS=16`; window ceiling 4000/floor 50; resize settle 300ms; ping 30s; optional
  raw-deflate stream. `paste` strips bracketed-paste markers. Lane D-O09 correction: all pane/geometry
  helpers live in `live_ws.rs` (no `live_ws/pane.rs`).
<!-- consolidation: discard; ref: none; reason: External terminal wire protocol and sizing flow. -->
- **Source.** `…/src/server/live_ws.rs`.
- **Gaps.** Client clipboard/IME/dictation; reconnect banners.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### O10 — Terminal presentation, mouse, clipboard, links/platform cleanup [F]
- **WHAT.** Clipboard, hyperlinks, link detection, URL open, host tab title.
<!-- consolidation: discard; ref: none; reason: External terminal presentation inventory. -->
- **HOW.** `tui/clipboard.rs::copy_to_clipboard` platform subprocess under `run_subprocess` (hard
  timeout) else `write_osc52` (both plain + tmux DCS passthrough wrapper; payload ~1MiB cap).
  `tui/hyperlink.rs` index table + `HyperlinkBackend` OSC 8 (`AlwaysUpdate`). `tui/links.rs`
  `link_spans_for_line`/`resolve_overlaps`/`bare_url_ranges`/`trim_url_end`. `tui/open_url.rs`
  `resolve_href`/`open_url`/`browser_reachable`. `tui/host_title.rs` OSC 0 on change. `src/terminal.rs`
  is 6 lines (`get_size`).
<!-- consolidation: discard; ref: none; reason: External clipboard and terminal presentation implementation. -->
- **Source.** `…/src/tui/{clipboard,hyperlink,links,open_url,host_title}.rs`; `src/terminal.rs`.
- **Gaps.** tmux option writes + `TerminalGuard` restore path.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### O11 — Onboarding/tour/tips/changelog/update banners [F]
- **WHAT.** Shared tip catalog + first-run/version-triggered content.
<!-- consolidation: discard; ref: none; reason: External onboarding content inventory. -->
- **HOW.** `tips.rs`: `TipSignals` from `AppStateConfig`; `Tip{id,title,body,trigger,surfaces}` with
  `TipTrigger::{Rotation,Earned(fn)}` and `TipSurface::{Tui,Web}` (thresholds NEW_FROM_SELECTION=3,
  SYSTEM_HEALTH_AGENT=6, SHORTCUT_BAR `sessions_created>30`). Full 14-tip catalog: earned Tui
  `hide-shortcut-bar` (`sessions_created>30 && !shortcut_bar_hidden`), `new-from-selection`
  (`count>=3 && !used_new_from_selection`), `system-health` (`system_health_tip_earned &&
  !used_system_health`); rotation Tui `tui-core-views`/`tui-triage`/`tui-power`; rotation Web
  `install-dashboard-pwa`, `pin-sessions`, `archive-sessions`, `snooze-sessions`, `group-sessions`,
  `sort-sidebar`, `scratch-sessions`, `multi-repo-sessions`. `eligible`/`eligible_unseen`/
  `unseen_count`/`next_earned_pop`; `tips_seen` persists; creation count via `record_session_creations`. <!-- consolidation: discard; ref: none; reason: External tip catalog and eligibility algorithm. -->
  Update banner `update::print_update_notice:317` (skips unless `update_check_mode.notifies()`, prints
  the `aoe update` hint). Routes `/api/tips`, `/api/tips/show`, `/api/app-state/tip-seen`,
  `.../web-tour-seen`, `.../dismiss-update`.
<!-- consolidation: discard; ref: none; reason: External update banner and onboarding routes. -->
- **Source.** `…/src/tips.rs`; `src/update/mod.rs`; web `hooks/{useTips,useTour,useOnboarding,
  useWelcomePhase}.ts*` + `components/tour/TourRunner.tsx`.
- **Gaps.** Web onboarding/tour component interiors (hooks/runner named, not read).
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### O12 — Push/web notifications and approval sound [F]
- **WHAT.** Web Push on status transitions, suppressed while the user is active.
<!-- consolidation: discard; ref: none; reason: External push-notification inventory. -->
- **HOW.** `PushState` loads/generates VAPID, subscription store, shared send semaphore (8); init only
  when `web.notifications_enabled`. `publish_status_change` broadcasts on commit (cap 256).
  `spawn_consumer` maintains `DwellState` (Waiting 5s, Idle/Error 2s, post-send cooldown 60s; priority
  Waiting>Error>Idle). Suppressed when TUI active within 30s or dashboard foregrounded 30s.
  `should_fire` merges global + per-session override. Delivery aes128gcm + VAPID ES256 JWT, TTL 24h,
  10s timeout; `classify_response` (2xx/404/410/403/429/5xx) → dead drives subscription drop;
  `fire_wake_fired_push`; `SubscriptionStore`/`VapidKeypair`. Routes `/api/push/*`.
<!-- consolidation: discard; ref: none; reason: External push delivery and suppression algorithm. -->
- **Config/defaults.** `WebConfig.notifications_enabled`, `notify_on_waiting|idle|error|wake_fire`.
<!-- consolidation: discard; ref: none; reason: External notification settings. -->
- **Source.** `…/src/server/{push,push_send}.rs`.
- **Gaps.** `web/public/sw.js` + `usePushSubscription`/`useApprovalSound` hooks.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### O13 — Idle auto-stop and sleep inhibition [F]
- **WHAT.** Reap idle plain tmux sessions; hold the OS awake while sessions work.
<!-- consolidation: discard; ref: none; reason: External idle-stop and sleep-inhibition inventory. -->
- **HOW.** `reap_idle_sessions` (≤ once/60s; reads tmux attached set; per-profile
  `session.auto_stop_idle_secs`; `idle_reap_candidates` non-structured/unattached/idle-past-threshold;
  `claim_idle_stop` persists Stopped under claim then `perform_stop` ≤4 concurrent; kill failure →
  `Status::Error`). <!-- consolidation: discard; ref: docs/specs/sessions.md#running-session-soft-limit; reason: External timeout-based reaping differs from approved capacity-triggered idle stopping. --> `update_sleep_inhibit` (≤ once/60s; desired = `prevent_sleep_when_active && any
  instance.has_recent_activity(...)`; `reconcile_sleep_inhibit` respawns a dead child; snapshot bits).
<!-- consolidation: discard; ref: none; reason: External OS sleep inhibition flow. -->
- **Defaults.** auto_stop_idle_secs 0 = disabled; prevent_sleep_when_active off.
<!-- consolidation: discard; ref: none; reason: External idle and sleep settings. -->
- **Unsupported.** ACP idle uses its own config/watchdog (A18); archived/trashed excluded.
<!-- consolidation: discard; ref: none; reason: External reaper scope restrictions. -->
- **Source.** `…/src/server/{idle_reap,sleep_inhibit}.rs`; `session/idle_reap.rs`; `process/mod.rs`.
- **Gaps.** `process::sleep_inhibitor` platform impl bodies.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### O14 — Application update/install/downgrade/uninstall [F]
- **WHAT.** Check GitHub release, detect install method, self-update; uninstall.
<!-- consolidation: discard; ref: none; reason: External self-update inventory. -->
- **HOW.** `check_for_update` respects `update_check_mode`, caches `update_cache.json` 24h, uses
  `GitHubClient::unauthenticated`; strict integer semver. `install.rs::detect_install_method`
  (`/nix/store`→Nix, `~/.cargo/bin`→Cargo, `/usr/local/bin`,`~/.local/bin`,`~/bin`→Tarball, else
  Unknown), Homebrew only when `brew list aoe` resolves to the running exe. `update_via_tarball`:
  same-fs tempdir → download → `tar xzf` → `sanity_check_binary` → `atomic_replace` (`sudo mv`+`chmod`
  fallback). Homebrew path with formula-lag guard; Nix/Cargo/Unknown print refusal. CLI
  `-y`/`--check`/`--dry-run` + daemon restart decision (`UpdateDaemonState`). `uninstall` discovers
  Homebrew pkg, binary paths, data dirs, AoE-marked tmux block; `--keep-data`/`--keep-tmux-config`.
<!-- consolidation: discard; ref: none; reason: External update and uninstall flow. -->
- **Unsupported.** No downgrade; Nix/Cargo/Unknown cannot self-write.
<!-- consolidation: discard; ref: none; reason: External update limitations. -->
- **Source.** `…/src/update/{mod,install}.rs`; `src/cli/{update,uninstall}.rs`.
- **Gaps.** `github/client.rs` internals; `scripts/install.sh`, `flake.nix`.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### O15 — Logs/filter/client logs/health [F]
- **WHAT.** One tracing subscriber per process with hot-swappable filter; viewer; health endpoints.
<!-- consolidation: discard; ref: none; reason: External diagnostics inventory. -->
- **HOW.** `resolve_sink` (stdout only for stdout + non-Tui/ServeDaemonChild/Runner; else file). Filter:
  `DEFAULT_TARGET_ROOTS` (22), `build_filter_from_config`, `LogConfig::from_env` reads `AOE_LOG_LEVEL`/
  `AGENT_OF_EMPIRES_DEBUG`/`AOE_ACP_TRACE`/`AOE_TERMINAL_TRACE`; `FilterController` hot-swap via
  `reload::Handle`. `aoe logs` (viewer lnav>bat>less>plain); `aoe log-level` GET/PATCH `/api/log-level`.
  Server `/api/system/health`, `/api/about`, `/api/system/update-status`, `/api/log-level`, `/api/
  client-log`. `RotatingWriter` (size/never, `max_size_mib`, `keep_count`).
<!-- consolidation: discard; ref: none; reason: External logging and diagnostics flow. -->
- **Defaults.** serve default filter info; file sink; rotation size.
<!-- consolidation: discard; ref: none; reason: External logging defaults. -->
- **Source.** `…/src/logging.rs`; `src/cli/{logs,log_level}.rs`; `src/server/api/{system,log_level,
  client_log}.rs`.
- **Gaps.** `session_tee` location, `show_spans` plumbing, malformed-filter UX tail.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### O16 — Opt-in anonymous telemetry [F]
- **WHAT.** Anonymous, opt-in, off-by-default usage telemetry; `DO_NOT_TRACK` always wins.
<!-- consolidation: discard; ref: none; reason: External telemetry inventory is not adoption approval. -->
- **HOW.** Gate `is_opted_in = config.telemetry.enabled && !do_not_track()`; endpoint
  `AOE_TELEMETRY_ENDPOINT` or default; 2s send timeout; `post` true only on 2xx. Install id
  `telemetry.json` (0600) created on opt-in under flock; deleted on opt-out. Events: `process_start`,
  `cli_usage` (throttled 24h/1h), `usage_snapshot` (4h ± jitter, fingerprint dedup). Fields sanitized
  to closed allowlists (`sanitize::agent_bucket`/`model_bucket`). CLI status/enable/disable/reset-id;
  server `/api/telemetry/*`.
<!-- consolidation: discard; ref: none; reason: External telemetry collection and opt-out flow. -->
- **Defaults.** disabled. <!-- consolidation: discard; ref: none; reason: External telemetry default. --> **Unsupported.** Nothing sent when DNT or opt-out; no install id generated. <!-- consolidation: discard; ref: none; reason: External telemetry opt-out guarantee. -->
- **Source.** `…/src/telemetry/**`; `src/cli/telemetry.rs`; `src/server/api/telemetry.rs`.
- **Gaps.** `sanitize.rs`/`aggregate.rs`/`usage_signals.rs`/schema files residual field sets.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### O17 — Migrations/data-format compatibility and repair [F]
- **WHAT.** Ordered one-time transforms of persisted data, run on every command; `aoe migrate` narrates.
<!-- consolidation: discard; ref: none; reason: External migration feature inventory. -->
- **HOW.** `CURRENT_VERSION=37`; version in `<app_dir>/.schema_version` (`atomic_write`); `MIGRATIONS`
  is 37 `(version,name,fn)` tuples asserted sequential v001–v037: (1) xdg_linux, (2)
  seed_sandbox_from_volumes, (3) yolo_mode_config, (4) unified_environment, (5) acp/cockpit_defaults,
  (6) unlimited_cockpit_history, (7) serve_log_to_legacy, (8) lock_in_default_profile, (9)
  update_check_mode, (10) drop_legacy_live_send_exit_chord, (11) relocate_sandbox_image, (12)
  acp_rename, (13) strip_profile_theme, (14) rename_default_theme, (15) rewrite_hook_strings, (16)
  clear_archived_tmux_gone_error, (17) rewrite_hook_strings_for_per_user_base, (18)
  strip_codex_config_toml_hooks, (19) move_acp_defaults_to_acp, (20) move_tui_branch_suffix_to_row_tag,
  (21) split_app_state_to_state_toml, (22) prune_tuning_settings, (23) clear_structured_container_error,
  (24) backfill_detect_as, (25) reenable_confirm_delete, (26) repoint_acp_default_agent, (27)
  isolate_sandbox_stores, (28) clear_archived_live_status, (29) fold_pending_initial_turn, (30)
  global_only_profile_settings, (31) conversation_provenance, (32) bound_capture_exclusions, (33)
  isolate_sandbox_content, (34) trash_retention_minutes, (35) custom_sort_order, (36)
  session_creation_count, (37) trash_lifecycle_id. `run_migrations_inner`: disk version > 37 → bail
  "refusing to downgrade"; == 37 → `reconcile_pending` for v027/v033; else run each pending `run()`
  then `set_version`, reading the version via `get_current_version` (absent → 0). Auto-run in
  `main::run` for every `cli.command.is_some()`; `aoe migrate` runs `run_migrations_announced`. v027
  isolate stores / v033 isolate content are lazy per-session (`migrate_sandbox_store_for_with` →
  `reconcile_pending`/`migrate_instance`, gated `get_current_version()<27`); unresolved stores leave
  the row pending and admission refuses it.
<!-- consolidation: discard; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: External migration ledger does not authorize compatibility or unresolved data conversion. -->
- **Defaults.** runs automatically; absent version file → 0 (fresh install runs all).
<!-- consolidation: discard; ref: none; reason: External migration defaults. -->
- **Unsupported.** A newer on-disk schema refuses to run (no downgrade).
<!-- consolidation: discard; ref: none; reason: External schema compatibility limit. -->
- **Source.** `…/src/migrations/{mod.rs,v001..v037}`; `src/cli/migrate.rs`; `src/main.rs`.
- **Gaps.** Interior bodies of the 35 small v001–v037 transforms (v027 187 KB / v033 236 KB only
  summarized); `sessions_file.rs`/`config_file.rs`/`store_fs.rs`/`progress.rs`.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

#### O18 — Killall, operational guards, help/version/completion, build variants [F]
- **WHAT.** Aggregate teardown, hidden traps/helpers, shell completion, feature-gated build variants.
<!-- consolidation: discard; ref: none; reason: External operational tooling inventory. -->
- **HOW.** `aoe killall` (unless `--keep-daemon` stop verified daemon via `stop_daemon`; then
  `acp::stop_all_workers(timeout)`; then `tmux::stop_all_sessions`; collects per-part errors, attempts
  all). <!-- consolidation: discard; ref: none; reason: External aggregate teardown flow is not an approved cleanup scope. --> Hidden `aoe stop` trap (`killall::stop_trap` bails with redirects). Pre-clap helpers `__vt-pipe`
  → `tui::run_vt_pipe`; `__smart-rename`. Hidden enum helpers `__acp-runner` (survives `serve --stop`),
  `__extract-session-id`. <!-- consolidation: discard; ref: none; reason: External hidden helper inventory. --> Completion via `clap_complete::generate` before app-dir/migrations. <!-- consolidation: discard; ref: none; reason: External shell completion flow. --> Build
  variants: `default=["default-plugins"]`; `web` gates the embedded dashboard bundle + `qrcode`;
  `serve` deprecated alias of `web`; `e2e-tests`. `build_info.rs::BUILD_VERSION` = `AOE_BUILD_VERSION`
  else `CARGO_PKG_VERSION`; embedded in ACP worker records so the daemon respawns old workers after
  `aoe update`. Profile-independent commands (`list --all`, `serve --stop`).
<!-- consolidation: discard; ref: none; reason: External build variants and version coupling. -->
- **Source.** `…/src/main.rs`; `src/cli/{killall,definition}.rs`; `src/build_info.rs`; `Cargo.toml`.
- **Gaps.** `scripts/install.sh` and `flake.nix` bodies; build.rs web build orchestration.
<!-- consolidation: discard; ref: none; reason: External audit follow-up. -->

## 4. Cross-domain seams & non-feature/build/test boundaries

These seams are where a feature's behavior spans owners; the feature owner records observable
behavior, the named seam owner supplies contract. <!-- consolidation: discard; ref: none; reason: External audit-domain ownership convention. --> Behavior must not be inferred across a seam. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Preserve the need to inspect both sides before claiming cross-boundary behavior. -->

- **Creation transaction and rollback.** S01 owns it; W02/W03/W10/W11 supply git/sandbox prep
  contracts; R02/R03 native launch/identity; A02/A03 structured launch; O02/O06 UI creation/progress;
  C01/C03 settings/trust.
<!-- consolidation: discard; ref: none; reason: External creation dependency map. -->
- **Stop/restart/delete/trash/restore.** S03–S12 own user semantics + persisted lifecycle; R owns
  native teardown/stores; A owns workers/turns/event-store teardown; W owns resource reclamation; O18
  owns killall aggregation. **Archive, trash, stopped and destroyed must not be equated.**
<!-- consolidation: discard; ref: none; reason: External lifecycle distinctions include archive and trash models not adopted here. -->
- **Conversation identity/import/fork/resume.** S13/S14 own the operation; R03 native attribution/
  storage contexts; A03/A09/A11 structured/native carry and replay. Provider-specific refusals are
  R/A evidence.
<!-- consolidation: discard; ref: none; reason: External conversation identity seam inventory. -->
- **Runtime state locks/concurrency.** S17 persisted row locking/merge/journal; A11 event-store
  transactions; O01/O02 daemon PID/launch/IPC/snapshot state; C01/C06 config/plugin write locking.
<!-- consolidation: discard; ref: none; reason: External concurrency ownership inventory. -->
- **Shared config defaults/policy/provenance.** C01/C02 canonical field ledger; feature owners record
  consumers and observable behavior; defaults/scope recorded once.
<!-- consolidation: discard; ref: none; reason: External config ledger ownership map. -->
- **Endpoint path/verb/middleware exposure.** O02/O04/O05 own routing/security ledger; handler
  execution belongs to the feature owner; O07 owns UI activation ledger; deeper behavior: native
  live-send R08, structured UI A, diff UI W, settings/plugin UI C.
<!-- consolidation: discard; ref: none; reason: External routing and behavior ownership map. -->
- **Hooks/sound/push surfaces are distinct.** R05 agent hooks ≠ C03 repo hooks ≠ R12 status commands
  ≠ O12 push/sound.
<!-- consolidation: discard; ref: none; reason: External notification subsystem distinctions. -->
- **MCP/skills policy/provenance/native writes.** C13–C15. ACP advertise/bridge/restart A20; sandbox
  paths W11. **AoE is an ACP client; managing MCP config does not make AoE an MCP server.**
<!-- consolidation: discard; ref: none; reason: External ACP and MCP role distinction does not decide this product integration scope. -->
- **Provider credentials (separate identities).** A10/A19/A20 provider selection + ACP env; R02/R03
  native execution identity; W11 mount/seeding/isolation; C01 environment layering; O04 daemon auth.
<!-- consolidation: discard; ref: none; reason: External credentials and execution-identity seam map. -->
- **Resource metrics.** R10 collection; O15 health exposure; O06/O08 diagnostics presentation. Sleep/
  idle scheduling O13; ACP watchdog/rate-limit A18.
<!-- consolidation: discard; ref: none; reason: External metrics and scheduling seam map. -->
- **Daemon auth boundary.** O04 auth gate applies to O02 transport; plugin RPC surfaces sit under
  O04's auth. A12 remote clients use bearer/no-passphrase; the no-subcommand daemon client is
  bearer-only.
<!-- consolidation: discard; ref: none; reason: External daemon authentication seam inventory. -->

**Non-feature / build / test / publication boundaries** (from the pinned tracked manifest):

- **Test-only.** `tests/**`, `src/**/tests/**`, test_support/test_helpers/test_cases/file_watch_tests
  files, `acp-worker/aoe-agent/test/**`, `acp-worker/test-shim/**`, web `__tests__/**`, `*.test.*`,
  `__fixtures__/**`. Embedded `#[cfg(test)]` blocks are excluded from production semantics and were
  not run.
<!-- consolidation: discard; ref: none; reason: External test-source inventory and execution boundary. -->
- **Build/verification infrastructure.** `.cargo/**`, `.github/**`, `.coderabbit.yaml`,
  `.git-blame-ignore-revs`, Cargo manifests/lock, `build.rs`, `build_git_watch.rs`,
  `rust-toolchain.toml`, clippy/deny/codecov/cliff configs, `xtask/**`, non-install scripts, web
  package/TS/Vite/Astro/lint configs + locks, `flake.lock`. Build flags expose O18 functionality; a
  generated bundle is not a separate feature.
<!-- consolidation: discard; ref: none; reason: External build infrastructure inventory. -->
- **Documentation/publication only.** README, CHANGELOG, DESIGN, AGENTS/CLAUDE, CONTRIBUTING,
  CODE_OF_CONDUCT, `docs/**`, `website/**`, marketing. These are claim indexes for O/C/R/A; no extra
  runtime subsystem follows from a marketing page.
<!-- consolidation: discard; ref: none; reason: External publication inventory and source boundary. -->
- **Runtime assets supporting existing features.** `assets/**` + web public fonts/icons/manifest/
  sw → O08/O10/O11/O12; `bundled_sounds/**` → R12; `themes/**` → C04; `docker/**` → W10; `contrib/**`
  → documentation only (two shipped agent-skill docs, no runtime code) consumed by external hosts.
<!-- consolidation: discard; ref: none; reason: External runtime asset inventory. -->
- **Legal/nonfeature.** LICENSE, THIRD_PARTY_NOTICES, `licenses/**`. Lockfile contents were not
  searched/read; no vendor/generated/node_modules payload searches.
<!-- consolidation: discard; ref: none; reason: External legal inventory and audit scope. -->

## 5. Source/document discrepancies & absence boundaries

Pinned-doc claims that the source contradicts, or that lack source support. **Follow the source, not
the prose.**
<!-- consolidation: discard; ref: docs/SPEC.md#authority; reason: Source-first rule describes external implementation evidence and cannot override this product approved intent. -->

1. **Structured-view default.** Pinned `docs/structured-view.md:3–5` broadly calls structured
   rendering the default in the native TUI. The same doc (lines 112–116) and `cli/add.rs::AddArgs`
   say CLI/TUI creation defaults to terminal (web wizard differs). Confirmed documentation
   inconsistency; exact defaults come from constructor/config dispatch (`NewSessionView::Auto`,
   `add.rs`).
<!-- consolidation: discard; ref: none; reason: External structured-view documentation discrepancy. -->
2. **Provider-credentials pointer.** `docs/structured-view.md` points at `agent_registry.rs`; the
   source registry delegates auth allowlists to `install_hints.rs`. Follow the delegation.
<!-- consolidation: discard; ref: none; reason: External credential source-pointer correction. -->
3. **API reference coverage.** `docs/api.md` covers selected operations; the source router has 152
   explicit route templates. It is not an exhaustive API reference at the pin.
<!-- consolidation: discard; ref: none; reason: External API documentation coverage finding. -->
4. **Installation snippets.** README installation snippets fetch `main`/latest channels — documented
   install surfaces only; must not be conflated with the pin.
<!-- consolidation: discard; ref: none; reason: External installation version evidence boundary. -->
5. **Provider capability hedging.** Docs label several provider capabilities "depends"/"unverified".
   Capture the source profile gates (A07/A09/A18); do not certify external provider runtime behavior
   from docs.
<!-- consolidation: discard; ref: none; reason: External provider capability evidence limitation. -->
6. **Bearer vs passphrase.** Remote no-subcommand TUI session listing is explicitly bearer-only in the
   `Cli` help; ACP clients support the passphrase flow. O04/A12 preserve that scope distinction.
<!-- consolidation: discard; ref: none; reason: External client authentication scope correction. -->
7. **No shelf/store export feature.** No dedicated shelf CLI variant and no top-level
   export/import-of-entire-session-store command was observed. Observed imports are conversations;
   exports are theme/CityHall/completion/history. Do not invent generic shelf/storage export.
<!-- consolidation: discard; ref: none; reason: External feature absence finding. -->
8. **Absence is not proof.** No missing tracked source files were found. Upstream npm adapter
   implementations are not tracked here. The inventory's attempt to extract native `AGENTS` names
   returned empty because of a record-shape mismatch — that empty result is **not** evidence of no
   native agents; lane R subsequently reconciled **17 records**.
<!-- consolidation: discard; ref: none; reason: External inventory extractor correction. -->
9. **C17 telemetry guidance.** The pinned `docs/guides/otari-telemetry.md` describes exporting agent
   OTEL telemetry, but the only source support is generic `sandbox.environment` host-var synthesis;
   there is no AoE Otari exporter. `AOE_OTARI_OTEL_HEADERS` appears doc-only.
<!-- consolidation: discard; ref: none; reason: External telemetry documentation discrepancy. -->
10. **Plugin CLI dispatch.** Plugin-contributed CLI commands are declared (graft) but
    `dispatch_plugin_command` prints "plugin runtime not available yet"; they are not executable
    through a real dispatch at this pin (C08).
<!-- consolidation: discard; ref: none; reason: External plugin dispatch limitation finding. -->

## 6. Known remaining depth gaps per domain (for future bounded continuations)

Carry these PENDING lists forward; do not treat any listed gap as verified.
<!-- consolidation: exists; ref: docs/SPEC.md#evidence-and-decisions; reason: Unverified gaps remain open rather than being closed by documentation mapping. -->

- **S.** `session/poller.rs` bodies; `session/anchored_fs.rs`; `session/instance/{start,ready,lifecycle,
  resume,kill,launch_command,identity_sidecar}` full bodies; `session/{claude_import,import,fork,claim}.rs`
  tails;
  `instance/flags.rs` tail; `tui/home/creation.rs`; `server/api/sessions/create.rs` full body + tests;
  retention scheduler body.
<!-- consolidation: discard; ref: none; reason: External sessions audit continuation inventory. -->
- **R.** R02 exact detect-as/execution-as precedence arms; R03 `session/capture/*` poll-fn interiors;
  R04 full transition matrix; R05 per-installer interiors; R06 tmux send/capture interior; R08 full
  `live_send.rs` reducer + leader key tables + vt drain protocol; R09 activation arms; R10 platform
  process/metrics interiors; R11 tmux option pass-through policy; R12 legacy `debounce_ms` path.
<!-- consolidation: discard; ref: none; reason: External native-agent audit continuation inventory. -->
- **W.** `seed.rs` (2778) + `hermes/{mixed,state}.rs` internal branch logic; `containers/execution.rs`
  test module; `docker/Dockerfile.dev`; `web/components/diff/**` bodies beyond hooks/signatures;
  `tui/diff/{input,render,split}.rs` bodies; `server/api/projects.rs` body already read (WK); deletion
  W-resource half beyond `remove_managed_worktree` caller ordering.
<!-- consolidation: discard; ref: none; reason: External workspace audit continuation inventory. -->
- **A.** `supervisor/{requests,sink,agents}.rs` + `process/runner/{shared,jsonrpc}.rs`; `acp_client/`
  `control.rs`/`connection/*`/`spawn.rs`/`reset.rs`/`watchdog.rs`/`update_events.rs`; `acp/{protocol,
  control_protocol,control_cache,dispatch}` full bodies; server `api/acp/*` remaining handlers,
  `acp_events.rs`/`acp_ws.rs`/`acp_reconciler/**`/`structured_repair.rs`; TUI `structured_view/
  {reducer,render,input,mod}` bodies; `remote_home/**`; web `components/acp/**` (~40) + `hooks/
  acpSession/**` bodies; A07 nonce lifetime; A12 auth/reconnect; A17 wiring.
<!-- consolidation: discard; ref: none; reason: External ACP audit continuation inventory. -->
- **C.** `session/config/mod.rs` descriptor defaults for every field; `settings_schema/{validate,merge,
  resolved}.rs` full bodies; `plugin/{auto_update,changelog,view,contributions,discover,source,
  lockfile}.rs` tails; plugin host runtime bodies; `aoe-plugin-api`/`aoe-settings-derive` validation
  internals; `web/src/**` settings/plugin/profiles/MCP/skills bodies; `session/mcp/**` override
  fields; server route handler bodies + jobs API; C17 source confirmation.
<!-- consolidation: discard; ref: none; reason: External configuration audit continuation inventory. -->
- **O.** O06/O08 TUI home bodies + web shell/DnD/responsive; O10 tmux option writes + `TerminalGuard`;
  O09 client clipboard/IME/reconnect; O07 web command enumeration + mouse `Down` body interiors; O11
  web onboarding/tour component interiors; O12 `sw.js` + hooks; O15 `session_tee`/`show_spans`; O16
  telemetry schema files; O14 `install.sh`/`flake.nix`; O17 interior bodies of the 35 small v001–v037
  transforms.
<!-- consolidation: discard; ref: none; reason: External operations audit continuation inventory. -->

**Independent coverage audit.** The strongest remaining mechanical gaps before full coverage can be
claimed are (a) O02 route-handler bodies × verb × middleware and (b) O07 activation/web-command
matrices, followed by the A supervisor/acp_client interiors. <!-- consolidation: discard; ref: none; reason: External coverage audit findings. --> A future independent audit must compare
the full pinned tracked manifest against per-domain leaf ledgers and reconcile every CLI variant/arg,
ActionId/executor/menu/Intent/key activation, route+verb, config/default/schema field, and native+ACP
provider against this map. <!-- consolidation: discard; ref: none; reason: External audit continuation acceptance procedure retained in reference. --> This document maps observed behavior only; acceptance of the map is owned
by the parent and an independent audit, not by this assembler.
<!-- consolidation: discard; ref: none; reason: Audit-specific acceptance responsibility retained without asserting completion. -->
