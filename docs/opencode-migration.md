---
consolidation:
  total: 63
  counts:
    exists: 1
    discard: 21
    integrate: 0
    unconfirmed: 41
  percentages:
    exists: 1.59%
    discard: 33.33%
    integrate: 0.00%
    unconfirmed: 65.08%
---
# OpenCode project migration runbook

> **Non-authoritative supporting material.** This file is not a contract. Authoritative owner(s): [CONVENTIONS](CONVENTIONS.md), [sessions specification](specs/sessions.md), [BLUEPRINT](BLUEPRINT.md).
> Disposition: Historical — discard.

## 1. Preconditions and warnings

1. The database is in WAL mode, and the migration script sets `PRAGMA busy_timeout`, so the edit is safe to run while OpenCode is running. OpenCode does **not** need to be quit. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: WAL and busy timeout do not establish writer quiescence or a consistent standalone database clone. -->
2. This OpenCode session's own state is in that database. It will be unavailable in the new session until the database paths have been migrated and verified. <!-- consolidation: unconfirmed; ref: none; reason: Host-session availability and path migration behavior are unverified external assumptions. -->
3. The database is at `/Users/imribarr/.opencode-personal/data/opencode/opencode.db` (a custom path, approximately 6.1 GB). `opencode db path` reports the configured path. <!-- consolidation: discard; ref: none; reason: Machine-specific external database inventory is not project core. --> The commands below make a copy-on-write APFS clone before modifying it; keep that backup until the migration is confirmed. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Preserve backup-retention gate but clone consistency with live WAL writers needs verification. -->
4. The project moves from `/Users/imribarr/Projects/Backlog.md` to `/Users/imribarr/Projects/agentic-workspace`. <!-- consolidation: discard; ref: none; reason: One-time repository rename context. --> OpenCode identifies it by absolute path in `project.worktree`, `project_directory.directory`, `worktree.directory`, and session `directory` columns. <!-- consolidation: unconfirmed; ref: none; reason: External schema identity assumptions need version-specific verification. --> Its project id is `daf950e61fbe12fb12e15d6f716c25dba9b42c4d`. It currently has ~1,669 rows in `session`, ~1,374 in `session_v2`, and 12 linked-worktree records under `/Users/imribarr/.backlog/Backlog.md/…` (capture the exact session counts in precondition 9). <!-- consolidation: discard; ref: none; reason: Historical machine-specific counts and identity. -->
5. The `origin` remote is already `git@github.com:BarrMan/agentic-workspace.git`; the fork remote has been removed. <!-- consolidation: discard; ref: none; reason: Historical Git remote checkpoint. --> The remote's `main` is intended to be a single fresh commit of the current tree. <!-- consolidation: unconfirmed; ref: none; reason: Historical history-replacement intent is not current authorization. -->
6. The repo is rebranded to `AgenticWorkspace`; the CLI command and npm package are `agenticworkspace`, and the built CLI is `dist/agenticworkspace`. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Historical executable naming conflicts with current agentic-workspace packaging. --> The on-disk task directory `backlog/` and `BACKLOG_*` environment variables intentionally retain their names. <!-- consolidation: discard; ref: docs/specs/sessions.md#starting-a-session; reason: Current workspace identity uses AGENTIC_WORKSPACE names and configured storage. -->
7. The `~/docs/Backlog.md` directory is moved too. This runbook will therefore move to `~/docs/agentic-workspace/opencode-migration.md` when step 2 runs. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#documentation-maintenance; reason: Project docs now live in repository docs rather than the historical external path. -->
8. The throwaway clone at `/Users/imribarr/Projects/agentic-workspace` has already been removed. <!-- consolidation: discard; ref: none; reason: Historical destination-state claim. --> The script must use `rm -rf` to remove the destination if present; the `rmdir` guard cannot remove the non-empty clone. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#general-principles; reason: Destination is now the active repository and destructive removal lacks fresh ownership or authorization. -->

9. **Record the pre-migration session counts.** These numbers change as sessions are created, so capture them now and compare against them after the migration (the verification section refers to "your recorded baseline", not to the numbers printed here): <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Preserve baseline-comparison gate pending external migration applicability and writer-quiescence verification. -->

   ```sh
   sqlite3 'file:/Users/imribarr/.opencode-personal/data/opencode/opencode.db?mode=ro' \
      "SELECT 'session', COUNT(*) FROM session WHERE project_id='daf950e61fbe12fb12e15d6f716c25dba9b42c4d';
       SELECT 'session_v2', COUNT(*) FROM session_v2 WHERE project_id='daf950e61fbe12fb12e15d6f716c25dba9b42c4d';"
   ```
<!-- consolidation: unconfirmed; ref: none; reason: Read-only baseline SQL assumes external schema and project ID that need verification. -->

10. The database statements below use SQLite's read/write mode only for the explicit migration. <!-- consolidation: discard; ref: none; reason: Local runbook command description. --> They update only the listed path columns and run in one transaction. <!-- consolidation: unconfirmed; ref: none; reason: Script also changes worktree project_id and filesystem moves are outside the database transaction. --> Do not change the database path or project id in the script unless you have independently verified the replacement values. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Preserve exact-target verification gate for any separately authorized external migration. -->

## 2. Run the migration

Save this block as a shell script if desired. Run it once, from any directory, after completing the preconditions. <!-- consolidation: unconfirmed; ref: none; reason: One-time external migration applicability and permission must be re-established. --> It intentionally stops on errors. <!-- consolidation: discard; ref: none; reason: Description of the retained set-e script. --> The `rm -rf` guard below removes the destination if it exists. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#general-principles; reason: Destructive destination deletion is unsafe to reuse against the current worktree. -->

```sh
#!/bin/sh
set -eu

OLD='/Users/imribarr/Projects/Backlog.md'
NEW='/Users/imribarr/Projects/agentic-workspace'
OLD_BACKLOG='/Users/imribarr/.backlog/Backlog.md'
NEW_BACKLOG='/Users/imribarr/.backlog/agentic-workspace'
DB='/Users/imribarr/.opencode-personal/data/opencode/opencode.db'
BACKUP='/Users/imribarr/.opencode-personal/data/opencode/opencode.db.pre-agenticworkspace-migration'

if [ ! -f "$DB" ]; then
  printf 'Database not found: %s\n' "$DB" >&2
  exit 1
fi
if [ -e "$BACKUP" ]; then
  printf 'Backup already exists; refusing to overwrite: %s\n' "$BACKUP" >&2
  exit 1
fi
if [ ! -d "$OLD" ]; then
  printf 'Old project directory not found: %s\n' "$OLD" >&2
  exit 1
fi
# APFS clone: instant under normal APFS conditions; source remains unchanged.
cp -c "$DB" "$BACKUP"

if [ -e "$NEW" ]; then
  rm -rf "$NEW"
fi

mv "$OLD" "$NEW"

# Paths are passed as sqlite3 bind parameters, not interpolated into SQL.
sqlite3 "$DB" <<SQL
.bail on
.parameter init
.parameter set :OLD '$OLD'
.parameter set :NEW '$NEW'
.parameter set :OLD_BACKLOG '$OLD_BACKLOG'
.parameter set :NEW_BACKLOG '$NEW_BACKLOG'
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 15000;
BEGIN IMMEDIATE;
UPDATE project
   SET worktree = replace(replace(worktree, :OLD, :NEW), :OLD_BACKLOG, :NEW_BACKLOG)
 WHERE instr(worktree, :OLD) > 0 OR instr(worktree, :OLD_BACKLOG) > 0;
UPDATE project_directory
   SET directory = replace(replace(directory, :OLD, :NEW), :OLD_BACKLOG, :NEW_BACKLOG)
 WHERE instr(directory, :OLD) > 0 OR instr(directory, :OLD_BACKLOG) > 0;
UPDATE worktree
   SET directory = replace(replace(directory, :OLD, :NEW), :OLD_BACKLOG, :NEW_BACKLOG)
 WHERE instr(directory, :OLD) > 0 OR instr(directory, :OLD_BACKLOG) > 0;
UPDATE session
   SET directory = replace(replace(directory, :OLD, :NEW), :OLD_BACKLOG, :NEW_BACKLOG)
 WHERE instr(directory, :OLD) > 0 OR instr(directory, :OLD_BACKLOG) > 0;
UPDATE session_v2
   SET directory = replace(replace(directory, :OLD, :NEW), :OLD_BACKLOG, :NEW_BACKLOG)
 WHERE instr(directory, :OLD) > 0 OR instr(directory, :OLD_BACKLOG) > 0;
UPDATE worktree SET project_id = 'daf950e61fbe12fb12e15d6f716c25dba9b42c4d' WHERE project_id = 'e4c81f02a3443f8c7219009d1dbba426d405ffe5';
COMMIT;
SQL

if [ -d "$OLD_BACKLOG" ]; then
  if [ -e "$NEW_BACKLOG" ]; then
    printf 'Destination already exists; refusing to move task worktrees: %s\n' "$NEW_BACKLOG" >&2
    exit 1
  fi
  mv "$OLD_BACKLOG" "$NEW_BACKLOG"
fi

# Linked-worktree registrations contain absolute paths invalidated by the moves.
git -C "$NEW" worktree prune

if [ -d "$HOME/docs/Backlog.md" ]; then
  if [ -e "$HOME/docs/agentic-workspace" ]; then
    printf 'Docs destination already exists; refusing to overwrite: %s\n' "$HOME/docs/agentic-workspace" >&2
    exit 1
  fi
  mv "$HOME/docs/Backlog.md" "$HOME/docs/agentic-workspace"
fi

cd "$NEW"
if [ ! -d node_modules ]; then
  bun install
fi
if [ -e node_modules/.bin/bun ]; then
  printf 'Unexpected node_modules/.bin/bun exists; stop and investigate PATH shadowing.\n' >&2
  exit 1
fi
bun run build

# Install the renamed CLI command. Remove the old command symlink (if present).
if [ -L /opt/homebrew/bin/backlog ]; then
  rm /opt/homebrew/bin/backlog
fi
ln -sfn "$NEW/dist/agenticworkspace" /opt/homebrew/bin/agenticworkspace
```
<!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Whole migration recipe needs verified backup consistency target ownership writer quiescence schema and recovery before reuse. -->

## 3. Verify the migration

Run these checks before relaunching OpenCode. <!-- consolidation: unconfirmed; ref: none; reason: Preserve verification-before-relaunch gate despite contradictory running-database precondition. --> The database queries use SQLite read-only mode. <!-- consolidation: discard; ref: none; reason: Description of local verification commands. -->

1. Confirm the project and all recorded paths now point to the new locations, with no remaining old-root paths: <!-- consolidation: unconfirmed; ref: none; reason: Preserve post-move path-verification gate pending external schema verification. -->

   ```sh
   sqlite3 'file:/Users/imribarr/.opencode-personal/data/opencode/opencode.db?mode=ro' <<'SQL'
   SELECT id, worktree
     FROM project
     WHERE id = 'daf950e61fbe12fb12e15d6f716c25dba9b42c4d';
   SELECT 'old_project_paths', COUNT(*) FROM project WHERE worktree LIKE '%/Projects/Backlog.md%';
   SELECT 'old_project_directory_paths', COUNT(*) FROM project_directory WHERE directory LIKE '%/Backlog.md/%';
   SELECT 'old_worktree_paths', COUNT(*) FROM worktree WHERE directory LIKE '%/Backlog.md/%';
   SELECT 'old_session_paths', COUNT(*) FROM session WHERE directory LIKE '%/Projects/Backlog.md%';
   SELECT 'old_session_v2_paths', COUNT(*) FROM session_v2 WHERE directory LIKE '%/Projects/Backlog.md%';
   SELECT 'new_project_paths', COUNT(*) FROM project WHERE worktree = '/Users/imribarr/Projects/agentic-workspace';
   SELECT 'new_linked_worktrees', COUNT(*) FROM worktree WHERE directory LIKE '/Users/imribarr/.agentic-workspace/%';
   SQL
   ```
<!-- consolidation: unconfirmed; ref: none; reason: Path-check SQL uses a new linked-worktree prefix different from the script's .backlog destination. -->

   Expected: the project row shows `/Users/imribarr/Projects/agentic-workspace`; all five `old_*` counts are `0`; `new_project_paths` is `2`; `new_linked_worktrees` matches the number of task worktrees under the moved directory. <!-- consolidation: unconfirmed; ref: none; reason: Exact row-count and path expectations require a fresh baseline and consistent prefixes. --> The emptied old project row is intentionally retained for rollback, so two `project` rows point at the new path until it is deleted. <!-- consolidation: unconfirmed; ref: none; reason: Duplicate-project retention and later deletion lack current schema and rollback proof. -->

2. Confirm session row counts did not change from the pre-migration baseline: <!-- consolidation: unconfirmed; ref: none; reason: Preserve count-conservation gate pending consistent backup and baseline verification. -->

   ```sh
   sqlite3 'file:/Users/imribarr/.opencode-personal/data/opencode/opencode.db?mode=ro' <<'SQL'
    SELECT 'session', COUNT(*) FROM session WHERE project_id = 'daf950e61fbe12fb12e15d6f716c25dba9b42c4d';
    SELECT 'session_v2', COUNT(*) FROM session_v2 WHERE project_id = 'daf950e61fbe12fb12e15d6f716c25dba9b42c4d';
   SQL
   ```
<!-- consolidation: unconfirmed; ref: none; reason: Count-check SQL assumes historical project identity and external schema. -->

    Expected: both counts must equal the baseline you recorded in precondition 9. If either differs, do not relaunch OpenCode; investigate or roll back. <!-- consolidation: unconfirmed; ref: none; reason: Preserve mismatch stop gate without certifying the unsafe rollback recipe. -->

## 3a. Reconcile the project id after reopening the folder

Reopen `/Users/imribarr/Projects/agentic-workspace` in OpenCode, then run: <!-- consolidation: unconfirmed; ref: none; reason: Reopen step depends on unresolved migration safety and baseline checks. -->

```sh
sqlite3 "$HOME/.opencode-personal/data/opencode/opencode.db" "select id, worktree, time_created from project where worktree like '%agentic-workspace%' order by time_created desc;"
sqlite3 "$HOME/.opencode-personal/data/opencode/opencode.db" "select project_id, count(*) from session group by 1 order by 2 desc limit 5;"
```
<!-- consolidation: unconfirmed; ref: none; reason: External project-ID inspection commands need current schema verification. -->

If a newly-created id holds 0 sessions while `daf950e6…` holds ~1,669, re-point `session`, `session_v2`, and `permission` from `daf950e6…` to the new id in one transaction using the same `BEGIN IMMEDIATE` / `UPDATE` pattern shown in section 2: <!-- consolidation: unconfirmed; ref: none; reason: Session and permission reassignment needs verified identity ownership and quiescent writers. -->

```sql
BEGIN IMMEDIATE;
UPDATE session SET project_id = '<new-id>' WHERE project_id = 'daf950e61fbe12fb12e15d6f716c25dba9b42c4d';
UPDATE session_v2 SET project_id = '<new-id>' WHERE project_id = 'daf950e61fbe12fb12e15d6f716c25dba9b42c4d';
UPDATE permission SET project_id = '<new-id>' WHERE project_id = 'daf950e61fbe12fb12e15d6f716c25dba9b42c4d';
COMMIT;
```
<!-- consolidation: unconfirmed; ref: none; reason: Placeholder project-ID rewrite is an unverified external mutation recipe. -->

If OpenCode reused `daf950e61fbe12fb12e15d6f716c25dba9b42c4d`, nothing needs to be done. <!-- consolidation: unconfirmed; ref: none; reason: Identity reuse alone has not been shown to establish complete migration. -->

3. Confirm the CLI symlink resolves to the new artifact and the command runs: <!-- consolidation: exists; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Runnable handoff verifies the actual installed binary. -->

   ```sh
   ls -l /opt/homebrew/bin/agenticworkspace
   agenticworkspace --version
   ```
<!-- consolidation: discard; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Obsolete command spelling in historical installation check. -->

   The symlink target must be `/Users/imribarr/Projects/agentic-workspace/dist/agenticworkspace`. If the command is not on `PATH`, run `/Users/imribarr/Projects/agentic-workspace/dist/agenticworkspace --version`. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Historical artifact spelling is superseded by agentic-workspace. -->

4. In the new project directory, confirm the test suite is green <!-- consolidation: discard; ref: none; reason: One-time migration verification sequence rather than ongoing full-suite requirement. --> and there is no Bun executable shadowing the installed Bun: <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#testing; reason: Retain toolchain-shadowing check pending present environment verification. -->

   ```sh
   cd /Users/imribarr/Projects/agentic-workspace
   test ! -e node_modules/.bin/bun
   bun run test
   ```
<!-- consolidation: discard; ref: none; reason: Historical full-suite command recipe is not executed or accepted by mapping. -->

5. Start a **new** OpenCode session from `/Users/imribarr/Projects/agentic-workspace`. Confirm this project opens under the new absolute path and its existing sessions are listed. <!-- consolidation: unconfirmed; ref: none; reason: Preserve user-visible session recovery verification pending safe migration applicability. --> Do not delete the database backup until this check succeeds. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Backup retention remains mandatory pending verified recovery. -->

## 4. Rollback

If a check fails, quit OpenCode again and confirm it is not using the database. Roll back before starting another OpenCode session. <!-- consolidation: unconfirmed; ref: none; reason: Preserve writer-quiescence and failure stop gates while rollback validity remains unverified. --> The backup is a complete pre-migration clone of the database. <!-- consolidation: unconfirmed; ref: none; reason: Copying only a live WAL database file does not establish a complete consistent backup. --> These commands reverse the directory moves and restore the old CLI symlink; run only for a migration that reached the corresponding step. <!-- consolidation: unconfirmed; ref: none; reason: Preserve reached-step precondition rather than authorize unconditional rollback. -->

```sh
#!/bin/sh
set -eu

OLD='/Users/imribarr/Projects/Backlog.md'
NEW='/Users/imribarr/Projects/agentic-workspace'
OLD_BACKLOG='/Users/imribarr/.backlog/Backlog.md'
NEW_BACKLOG='/Users/imribarr/.backlog/agentic-workspace'
DB='/Users/imribarr/.opencode-personal/data/opencode/opencode.db'
BACKUP='/Users/imribarr/.opencode-personal/data/opencode/opencode.db.pre-agenticworkspace-migration'

test -f "$BACKUP"
cp -c "$BACKUP" "$DB"

if [ -d "$HOME/docs/agentic-workspace" ] && [ ! -e "$HOME/docs/Backlog.md" ]; then
  mv "$HOME/docs/agentic-workspace" "$HOME/docs/Backlog.md"
fi
if [ -d "$NEW_BACKLOG" ] && [ ! -e "$OLD_BACKLOG" ]; then
  mv "$NEW_BACKLOG" "$OLD_BACKLOG"
fi
if [ -d "$NEW" ] && [ ! -e "$OLD" ]; then
  mv "$NEW" "$OLD"
fi

if [ -L /opt/homebrew/bin/agenticworkspace ]; then
  rm /opt/homebrew/bin/agenticworkspace
fi
ln -sfn "$OLD/dist/backlog" /opt/homebrew/bin/backlog
```
<!-- consolidation: unconfirmed; ref: none; reason: Rollback needs consistent backup WAL handling reached-step tracking and verified old binary before use. -->

If any reverse `mv` destination already exists, stop rather than overwrite it; resolve the directory conflict manually. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#general-principles; reason: Preserve no-overwrite rollback gate despite script merely skipping conflicted moves. --> The database has already been restored to its pre-migration path values by the backup copy. <!-- consolidation: unconfirmed; ref: none; reason: Restore success cannot be inferred without consistent snapshot and post-restore verification. -->

## 5. What changes and what deliberately does not

| Changes | Deliberately unchanged |
|---|---|
| Project directory: `Projects/Backlog.md` → `Projects/agentic-workspace` | On-disk task directory: `backlog/` <!-- consolidation: discard; ref: none; reason: Historical rename scope rather than current configured storage contract. --> |
| Git `origin` is already `git@github.com:BarrMan/agentic-workspace.git` | `BACKLOG_*` environment variable names <!-- consolidation: discard; ref: docs/specs/sessions.md#starting-a-session; reason: Historical remote and superseded environment naming. --> |
| CLI/package/artifact: `agenticworkspace` / `agenticworkspace` / `dist/agenticworkspace` | `backlog/tasks/**` contents <!-- consolidation: discard; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Historical binary naming and source-data scope. --> |
| Docs directory: `~/docs/Backlog.md` → `~/docs/agentic-workspace` | Existing session records and their counts <!-- consolidation: discard; ref: docs/CONVENTIONS.md#documentation-maintenance; reason: External docs move is historical and core docs now live in docs. --> <!-- consolidation: unconfirmed; ref: none; reason: Session conservation remains a required external migration verification gate. --> |

## 6. Troubleshooting

- **Sessions are missing:** Check that `project.worktree` equals the new project path and that `session.directory` and `session_v2.directory` no longer contain the old project path. Use the read-only SQL checks above and section 3a to reconcile the project id. <!-- consolidation: unconfirmed; ref: none; reason: External identity diagnosis depends on current schema and verified targets. --> If the migration was interrupted or paths are inconsistent, restore the database backup before retrying. <!-- consolidation: unconfirmed; ref: none; reason: Preserve failure-recovery gate but snapshot validity and partial filesystem effects need verification. -->
- **Dangling CLI symlink or command not found:** Check `ls -l /opt/homebrew/bin/agenticworkspace` and ensure it points to the existing `dist/agenticworkspace`; ensure `/opt/homebrew/bin` is on `PATH`. Build from the new project directory again if the artifact is missing. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Machine-specific obsolete executable troubleshooting. -->
- **Git worktree errors:** The linked-worktree registrations contain absolute paths, so moving the project/task-worktree directory invalidates them. <!-- consolidation: discard; ref: none; reason: External Git relocation context. --> Run `git -C /Users/imribarr/Projects/agentic-workspace worktree prune` after the moves. <!-- consolidation: unconfirmed; ref: none; reason: Pruning is not verified worktree repair and needs exact administrative-link evidence. --> Do not assume the old linked worktrees are usable after pruning; their paths and Git administrative links may need to be recreated. <!-- consolidation: unconfirmed; ref: none; reason: Preserve unresolved worktree-usability verification gate. -->
- **`node_modules/.bin/bun` shadows Bun:** This path must not exist. Remove or investigate the unexpected entry, check which `bun` is being executed with `command -v bun`, then rerun the build and tests using the intended Bun installation. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#testing; reason: Preserve intended-toolchain verification without authorizing deletion of an uninspected local dependency entry. -->
