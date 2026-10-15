# OpenCode project migration runbook

## 1. Preconditions and warnings

1. The database is in WAL mode, and the migration script sets `PRAGMA busy_timeout`, so the edit is safe to run while OpenCode is running. OpenCode does **not** need to be quit.
2. This OpenCode session's own state is in that database. It will be unavailable in the new session until the database paths have been migrated and verified.
3. The database is at `/Users/imribarr/.opencode-personal/data/opencode/opencode.db` (a custom path, approximately 6.1 GB). `opencode db path` reports the configured path. The commands below make a copy-on-write APFS clone before modifying it; keep that backup until the migration is confirmed.
4. The project moves from `/Users/imribarr/Projects/Backlog.md` to `/Users/imribarr/Projects/agentic-workspace`. OpenCode identifies it by absolute path in `project.worktree`, `project_directory.directory`, `worktree.directory`, and session `directory` columns. Its project id is `daf950e61fbe12fb12e15d6f716c25dba9b42c4d`. It currently has ~1,669 rows in `session`, ~1,374 in `session_v2`, and 12 linked-worktree records under `/Users/imribarr/.backlog/Backlog.md/…` (capture the exact session counts in precondition 9).
5. The `origin` remote is already `git@github.com:BarrMan/agentic-workspace.git`; the fork remote has been removed. The remote's `main` is intended to be a single fresh commit of the current tree.
6. The repo is rebranded to `AgenticWorkspace`; the CLI command and npm package are `agenticworkspace`, and the built CLI is `dist/agenticworkspace`. The on-disk task directory `backlog/` and `BACKLOG_*` environment variables intentionally retain their names.
7. The `~/docs/Backlog.md` directory is moved too. This runbook will therefore move to `~/docs/agentic-workspace/opencode-migration.md` when step 2 runs.
8. The throwaway clone at `/Users/imribarr/Projects/agentic-workspace` has already been removed. The script must use `rm -rf` to remove the destination if present; the `rmdir` guard cannot remove the non-empty clone.

9. **Record the pre-migration session counts.** These numbers change as sessions are created, so capture them now and compare against them after the migration (the verification section refers to "your recorded baseline", not to the numbers printed here):

   ```sh
   sqlite3 'file:/Users/imribarr/.opencode-personal/data/opencode/opencode.db?mode=ro' \
      "SELECT 'session', COUNT(*) FROM session WHERE project_id='daf950e61fbe12fb12e15d6f716c25dba9b42c4d';
       SELECT 'session_v2', COUNT(*) FROM session_v2 WHERE project_id='daf950e61fbe12fb12e15d6f716c25dba9b42c4d';"
   ```

10. The database statements below use SQLite's read/write mode only for the explicit migration. They update only the listed path columns and run in one transaction. Do not change the database path or project id in the script unless you have independently verified the replacement values.

## 2. Run the migration

Save this block as a shell script if desired. Run it once, from any directory, after completing the preconditions. It intentionally stops on errors. The `rm -rf` guard below removes the destination if it exists.

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

## 3. Verify the migration

Run these checks before relaunching OpenCode. The database queries use SQLite read-only mode.

1. Confirm the project and all recorded paths now point to the new locations, with no remaining old-root paths:

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

   Expected: the project row shows `/Users/imribarr/Projects/agentic-workspace`; all five `old_*` counts are `0`; `new_project_paths` is `2`; `new_linked_worktrees` matches the number of task worktrees under the moved directory. The emptied old project row is intentionally retained for rollback, so two `project` rows point at the new path until it is deleted.

2. Confirm session row counts did not change from the pre-migration baseline:

   ```sh
   sqlite3 'file:/Users/imribarr/.opencode-personal/data/opencode/opencode.db?mode=ro' <<'SQL'
    SELECT 'session', COUNT(*) FROM session WHERE project_id = 'daf950e61fbe12fb12e15d6f716c25dba9b42c4d';
    SELECT 'session_v2', COUNT(*) FROM session_v2 WHERE project_id = 'daf950e61fbe12fb12e15d6f716c25dba9b42c4d';
   SQL
   ```

    Expected: both counts must equal the baseline you recorded in precondition 9. If either differs, do not relaunch OpenCode; investigate or roll back.

## 3a. Reconcile the project id after reopening the folder

Reopen `/Users/imribarr/Projects/agentic-workspace` in OpenCode, then run:

```sh
sqlite3 "$HOME/.opencode-personal/data/opencode/opencode.db" "select id, worktree, time_created from project where worktree like '%agentic-workspace%' order by time_created desc;"
sqlite3 "$HOME/.opencode-personal/data/opencode/opencode.db" "select project_id, count(*) from session group by 1 order by 2 desc limit 5;"
```

If a newly-created id holds 0 sessions while `daf950e6…` holds ~1,669, re-point `session`, `session_v2`, and `permission` from `daf950e6…` to the new id in one transaction using the same `BEGIN IMMEDIATE` / `UPDATE` pattern shown in section 2:

```sql
BEGIN IMMEDIATE;
UPDATE session SET project_id = '<new-id>' WHERE project_id = 'daf950e61fbe12fb12e15d6f716c25dba9b42c4d';
UPDATE session_v2 SET project_id = '<new-id>' WHERE project_id = 'daf950e61fbe12fb12e15d6f716c25dba9b42c4d';
UPDATE permission SET project_id = '<new-id>' WHERE project_id = 'daf950e61fbe12fb12e15d6f716c25dba9b42c4d';
COMMIT;
```

If OpenCode reused `daf950e61fbe12fb12e15d6f716c25dba9b42c4d`, nothing needs to be done.

3. Confirm the CLI symlink resolves to the new artifact and the command runs:

   ```sh
   ls -l /opt/homebrew/bin/agenticworkspace
   agenticworkspace --version
   ```

   The symlink target must be `/Users/imribarr/Projects/agentic-workspace/dist/agenticworkspace`. If the command is not on `PATH`, run `/Users/imribarr/Projects/agentic-workspace/dist/agenticworkspace --version`.

4. In the new project directory, confirm the test suite is green and there is no Bun executable shadowing the installed Bun:

   ```sh
   cd /Users/imribarr/Projects/agentic-workspace
   test ! -e node_modules/.bin/bun
   bun run test
   ```

5. Start a **new** OpenCode session from `/Users/imribarr/Projects/agentic-workspace`. Confirm this project opens under the new absolute path and its existing sessions are listed. Do not delete the database backup until this check succeeds.

## 4. Rollback

If a check fails, quit OpenCode again and confirm it is not using the database. Roll back before starting another OpenCode session. The backup is a complete pre-migration clone of the database. These commands reverse the directory moves and restore the old CLI symlink; run only for a migration that reached the corresponding step.

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

If any reverse `mv` destination already exists, stop rather than overwrite it; resolve the directory conflict manually. The database has already been restored to its pre-migration path values by the backup copy.

## 5. What changes and what deliberately does not

| Changes | Deliberately unchanged |
|---|---|
| Project directory: `Projects/Backlog.md` → `Projects/agentic-workspace` | On-disk task directory: `backlog/` |
| Git `origin` is already `git@github.com:BarrMan/agentic-workspace.git` | `BACKLOG_*` environment variable names |
| CLI/package/artifact: `agenticworkspace` / `agenticworkspace` / `dist/agenticworkspace` | `backlog/tasks/**` contents |
| Docs directory: `~/docs/Backlog.md` → `~/docs/agentic-workspace` | Existing session records and their counts |

## 6. Troubleshooting

- **Sessions are missing:** Check that `project.worktree` equals the new project path and that `session.directory` and `session_v2.directory` no longer contain the old project path. Use the read-only SQL checks above and section 3a to reconcile the project id. If the migration was interrupted or paths are inconsistent, restore the database backup before retrying.
- **Dangling CLI symlink or command not found:** Check `ls -l /opt/homebrew/bin/agenticworkspace` and ensure it points to the existing `dist/agenticworkspace`; ensure `/opt/homebrew/bin` is on `PATH`. Build from the new project directory again if the artifact is missing.
- **Git worktree errors:** The linked-worktree registrations contain absolute paths, so moving the project/task-worktree directory invalidates them. Run `git -C /Users/imribarr/Projects/agentic-workspace worktree prune` after the moves. Do not assume the old linked worktrees are usable after pruning; their paths and Git administrative links may need to be recreated.
- **`node_modules/.bin/bun` shadows Bun:** This path must not exist. Remove or investigate the unexpected entry, check which `bun` is being executed with `command -v bun`, then rerun the build and tests using the intended Bun installation.
