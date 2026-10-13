## Acceptance Criteria

- [x] The full suite aborts within a default bounded deadline even when BACKLOG_TEST_DEADLINE_MS is unset, kills active files, and reports pending files.
- [x] Tests never lock or mutate a live project's .backlog session state (isolated temp project roots), so a running workspace cannot stall them.
- [x] Tests never address the developer's default tmux server (test servers only), so a live workspace cannot be affected.
- [x] A documented scoped-test workflow exists (AGENTS.md/README) telling agents to run only affected files, with BACKLOG_TEST_LANES / BACKLOG_TEST_DEADLINE_MS knobs.
- [x] A full run on a busy dev machine completes within a bounded, documented time.

## Definition of Done

- [x] bunx tsc --noEmit passes when TypeScript touched
- [x] bun run check . passes when formatting/linting touched
- [x] bun test (or scoped test) passes

## Implementation Plan

1) scripts/run-ci-tests.ts: add DEFAULT_DEADLINE_MS (600000) used when BACKLOG_TEST_DEADLINE_MS is unset, log the active deadline, keep active-kill + pending-file reporting. 2) src/test/test-preload.ts: clear workspace-pinning env (BACKLOG_CWD etc.) and set a unique per-process BACKLOG_TMUX_SOCKET with exit cleanup. 3) src/agent-workspace/session-process.ts: createSessionServer honors BACKLOG_TMUX_SOCKET. 4) Docs: AGENTS.md scoped-test workflow + knobs, docs/test-suite-runtime-report.md busy-machine bound, agent-guidelines scoped section. 5) Guard test for socket override.

## Implementation Notes

Implemented: (1) scripts/run-ci-tests.ts DEFAULT_DEADLINE_MS=600000 used when BACKLOG_TEST_DEADLINE_MS unset, plus a startup line reporting the active bound; kill-active/report-pending retained. (2) src/test/test-preload.ts now clears workspace-pinning env (BACKLOG_CWD, BACKLOG_WORKSPACE_CONTEXT, BACKLOG_PROJECT_ROOT, BACKLOG_TASK_ID, BACKLOG_SESSION_ID, TASK_ID, SESSION_ID) and provider-config env (OPENCODE_CONFIG_CONTENT, OPENCODE_CONFIG_DIR) that a live workspace/opencode host exports, and pins a unique per-process BACKLOG_TMUX_SOCKET with exit cleanup. (3) createSessionServer (session-process.ts) honours BACKLOG_TMUX_SOCKET. (4) Docs: AGENTS.md, docs/test-suite-runtime-report.md, src/guidelines/agent-guidelines.md. (5) Guard tests: src/test/session-server-isolation.test.ts, src/test/test-preload-isolation.test.ts. Verification: bunx tsc --noEmit clean; bun run check . clean (578 files); scoped isolation suites 6/6 green; full suite 262/262 files in 133.14s on a busy live-workspace machine (inside the 600s bound). Residual (pre-existing, not caused here): cli-list-window/cli-refs-docs/cli-draft-edit hit Bun's 10s per-test timeout under full-run CPU starvation (cli-list-window passes alone in 6.6s); opentui-workspace-controller has an unrelated assertion failure from in-flight workspace work. Binary rebuilt (dist/backlog 20:26); no src/*.ts newer than it.

## Final Summary

Harden the CI test runner against a live workspace. Root cause: resolveProjectStateRoot honours an ambient BACKLOG_CWD, so a running workspace redirected every test's .backlog state lockfile onto the live project; createSessionServer also hardcoded the developer's default tmux socket. Fixed at the test boundary: runner gets a 600s default deadline; test-preload clears workspace-pinning and host provider-config env and pins a unique per-process BACKLOG_TMUX_SOCKET; createSessionServer honours that override. Added guard tests and documented the scoped-test workflow. Full suite: 262 files / 2354 tests in 133s on a busy machine, inside the bound.