# Quickstart: BACK-25 Validation Guide

**Superseded deletion procedure:** use [BACK-27 verification](../back-27/spec.md#verification) and its plan before running deletion checks. The stop/foreign-refusal cases below are historical. Companion opt-out was handled separately; this is not permission to rerun config changes.

Use disposable fixtures only. **Never use the live BACK-25 task as a deletion test.** This guide describes validation for later build work.

## Workspace task deletion

1. Create an isolated disposable project/workspace and task. Record task-file and session-data locations for post-test checks.
2. Exercise each case independently through the Backlog workspace TUI:
   - Owned native session RUNNING: confirm deletion with Enter. Verify the session is stopped/settled to `STOPPED` before task-file removal and the disposable task is removed.
   - Parked native session for the task, with no live owning process: confirm deletion with Enter. Verify safe preflight and cleanup succeed before task-file removal; do not infer ownership from `ownerPid`.
   - RUNNING native session owned by another workspace: confirm deletion. Verify the foreign session remains protected and its data is not removed.
   - Inject or simulate cleanup failure using the existing test harness. Verify the core lifecycle's awaited cleanup leaves both task and session data in place, and the TUI gives an actionable next step.
   - Cancel a deletion confirmation. Verify task and session data are unchanged.
3. Run only the relevant targeted tests, for example:

```sh
cd /Users/imribarr/Projects/Backlog.md && bun scripts/run-ci-tests.ts src/test/opentui-workspace-controller.test.ts src/test/agent-sessions.test.ts src/test/task-delete.test.ts src/test/opentui-confirm.test.ts --timeout=10000
```

4. After **each code change**, rebuild immediately and confirm the binary includes it before manual CLI verification:

```sh
cd /Users/imribarr/Projects/Backlog.md && bun run build
cd /Users/imribarr/Projects/Backlog.md && find src -name '*.ts' -newer dist/backlog
```

The `find` command must print nothing. Then exercise the rebuilt installed `backlog` binary in the isolated disposable fixture; source tests alone do not verify the installed binary.

## OMO-slim Desktop Companion opt-out

This is a user-level manual validation, not a Backlog config change. Do not perform it without user permission to edit the file outside the repository.

1. Back up `~/.config/opencode/oh-my-opencode-slim.json` and merge the following nested setting into the existing JSON, preserving all unrelated keys:

```json
{
  "companion": {
    "enabled": false
  }
}
```

2. Restart OpenCode.
3. Verify the Desktop Companion overlay is disabled, core OMO-slim remains active, and unrelated existing config values are unchanged. If the JSON already contains a `companion` object, update only its `enabled` property rather than replacing the object.
4. Restore the backup or set `companion.enabled` back to its previous value to undo the test.

The build-phase implementer must obtain permission before any write to this user config; otherwise provide these safe manual steps to the user and leave the file untouched.

## References

- Specification: `spec.md`
- Implementation plan and sequencing constraints: `plan.md`
- Implementation checklist: `tasks.md`
- [OMO-slim configuration docs](https://github.com/alvinunreal/oh-my-opencode-slim/blob/master/docs/configuration.md)
- [OMO-slim Desktop Companion docs](https://github.com/alvinunreal/oh-my-opencode-slim/blob/master/docs/companion.md)
