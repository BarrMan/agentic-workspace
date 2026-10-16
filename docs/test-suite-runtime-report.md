---
consolidation:
  total: 105
  counts:
    exists: 8
    discard: 78
    integrate: 8
    unconfirmed: 11
  percentages:
    exists: 7.62%
    discard: 74.29%
    integrate: 7.62%
    unconfirmed: 10.48%
---
# Test suite runtime report

Date: 2026-10-07. Scope: wall-clock runtime of the Bun test suite (345 files, one process per file). <!-- consolidation: discard; ref: none; reason: Historical measurement scope and count. -->
Machine used for every number below: 10 cores, 16 GB, Apple silicon. <!-- consolidation: discard; ref: none; reason: Historical benchmark hardware. -->

> **Historical snapshot.** Suite names and counts predate the removal of the legacy blessed TUI, so entries such as `tui-task-composer` and `heading` refer to tests that no longer exist. <!-- consolidation: discard; ref: none; reason: Snapshot qualification rather than a durable requirement. -->

Related: `src/guidelines/agent-guidelines.md` (how to run one suite), `docs/disk-growth-investigation.md`.

## 1. Result

| Configuration | Wall | Files | Passed tests | Failing files |
|---|---:|---:|---:|---|
| Summed per-file wall, serial (before) | 768.2 s | 345 | 2877 | 3 (pre-existing) <!-- consolidation: discard; ref: none; reason: Historical timing and result counts. --> |
| Full suite, 9 lanes, unoptimized tree | 200.8 s | 345 | 2875 | 3 (pre-existing) <!-- consolidation: discard; ref: none; reason: Historical timing and result counts. --> |
| **Full suite, 5 lanes (default), optimized** | **178.6 s** | 345 | 2870 | 3 (pre-existing) <!-- consolidation: discard; ref: none; reason: Historical timing and result counts. --> |
| Full suite, 5 lanes, quiet machine | 162.0 s | 345 | 2870 | 3 (pre-existing) <!-- consolidation: discard; ref: none; reason: Historical timing and result counts. --> |
| Full suite, 6 lanes | 162.0 s | 345 | 2869 | 3 (pre-existing) <!-- consolidation: discard; ref: none; reason: Historical timing and result counts. --> |
| Full suite, 4 lanes | 173.1 s | 345 | 2869 | 3 (pre-existing) <!-- consolidation: discard; ref: none; reason: Historical timing and result counts. --> |
| Full suite, 8 lanes | 179.8 s | 345 | 2853 | 5 files (3 pre-existing + 2 contention flakes) <!-- consolidation: discard; ref: none; reason: Historical timing and result counts. --> |

The target is a full run under three minutes; the default configuration now meets it with margin. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Approval and continuing applicability of the three-minute target are not established. --> <!-- consolidation: discard; ref: none; reason: Claimed target attainment is historical measurement evidence. -->
`bun test --parallel --timeout=10000` runs everything through Bun's native per-file-isolated runner. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Bun invocation and timeout procedure is delegated to AGENTS. -->

**Post-removal update (2026-10-07):** after the web interface and its HTTP server were removed
(`src/web/**`, `src/server/**`, 72 suites, react/tailwind/jsdom dependencies), the suite is 253 files and
2247 tests, and a full run measures **120.0 s** at the default 5 lanes with only the two pre-existing
failing files below. The TUI suites are unchanged and green. <!-- consolidation: discard; ref: none; reason: Dated removal inventory and benchmark results. -->

**With the agent-workspace suites added (2026-10-07):** 257 files and 2332 tests, measured at
**151.4 s** across 5 isolated workers on an otherwise idle machine. <!-- consolidation: discard; ref: none; reason: Dated suite inventory and timing. --> Reading the summary line is not
enough to judge a run: it reports files *run* and tests *passed*, so the two red files below are
counted as successes there. Grep the progress lines for `failed in` instead. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Summary interpretation and progress-line workaround concern the retired runner and need applicability confirmation. -->

## 2. Method and its limits

- Bun's parallel runner isolates test files in workers; `bun test <file> --timeout=20000` runs one file.
  Lane counts are relevant only when intentionally measuring the whole suite. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Affected-file invocation is the approved iteration procedure. --> <!-- consolidation: discard; ref: none; reason: Lane-count measurement detail belongs to the historical benchmark. -->
- Absolute `after` numbers taken by the optimisation workers were collected while other workers were also
  benchmarking, so several are inflated by roughly 2.2-2.6x (a control suite measured 2.25 s idle versus
  5.0-6.3 s under that load). Those rows are marked *indicative*; the same-window A/B rows and the parent's
  full-suite runs are the authoritative ones. <!-- consolidation: discard; ref: none; reason: Qualification of historical benchmark evidence. -->
- Before-values are per-file wall times from the audit ledger
  (`local://test-suite-runtime-files.json` in the agent session that produced this report), which used the
  same one-process-per-file method. <!-- consolidation: discard; ref: none; reason: Historical measurement provenance. -->

## 3. Why the suite was slow

Two costs dominated, both measured rather than assumed: <!-- consolidation: discard; ref: none; reason: Historical performance conclusion. -->

1. **Real CLI process spawns.** Each CLI assertion boots the compiled `agentic-workspace` binary (~0.3-1.5 s under
   load). Suites with 30-60 spawns spent nearly all their wall time waiting on process starts. In-process
   fixture setup measured ~29 ms and was irrelevant. <!-- consolidation: discard; ref: none; reason: Historical process-start timing finding. -->
2. **Per-case fixture construction.** `git init` costs ~32 ms per call; a single auto-commit
   `createTaskFromInput` fires ~37 git calls (~1.6 s). Suites that built a full project per test paid this
   dozens of times (e.g. `core.test.ts` called `git init` 64 times). <!-- consolidation: discard; ref: none; reason: Historical fixture-cost finding. -->

Deliberate sleeps were a smaller factor: most remaining waits are real-clock regressions under test. <!-- consolidation: discard; ref: none; reason: Historical characterization of waits. -->

## 4. Techniques applied

| Technique | Effect |
|---|---|
| `describe.concurrent` / `test.concurrent` with per-case isolated fixtures | overlapping process waits; measured 2-3x on unchanged code (one probe: four 300 ms sleeps finished in 311 ms) <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Permit within-file concurrency only with per-case owned mutable state and resources. --> <!-- consolidation: discard; ref: none; reason: Speedup is historical evidence. --> |
| One prepared project template per suite, cloned per case (`cp` = APFS clonefile, ~3 ms) instead of rebuilding | removed repeated `git init` + project init + config writes <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Continued applicability of template cloning needs confirmation without shared mutable fixture state. --> <!-- consolidation: discard; ref: none; reason: Historical cost and implementation result. --> |
| `initGitRepo(dir, branch?)` in `src/test/test-utils.ts`: copies a prepared `.git` template (~1 ms) instead of spawning `git init` (~32 ms) | 40x cheaper repo creation; applied to 25 files <!-- consolidation: discard; ref: none; reason: Historical helper inventory and measured speedup. --> |
| In-process `Core` calls for setup that no assertion inspected | removed unasserted CLI spawns <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Use in-process setup when process startup is not the behavior under assertion. --> |
| `Promise.all` for independent CLI invocations | fewer sequential rounds <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Independent invocations may overlap when each owns state and cleanup. --> |
| `createConcurrencyLimiter(width)` slot pool in `test-utils.ts` | caps how many cases of one process touch the machine at once, for suites where unbounded overlap caused real-time waits to expire under lane load <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Need for this historical limiter under native runner is not established. --> |
| Merging duplicated cases whose assertions overlapped | 7 duplicate tests removed this round (2 in `cli-guidance`, 4 in `cli-init-create`, 1 in `cli-task-list`), every assertion kept <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Preserve equivalent observable coverage when merging duplicate cases. --> <!-- consolidation: discard; ref: none; reason: Historical removal count and completion claim. --> |

## 5. Per-suite results

### CLI surface A — 148,821 ms -> 57,030 ms (2.6x)
<!-- consolidation: discard; ref: none; reason: Historical aggregate timing. -->

| Suite | Before | After |
|---|---:|---:|
| `cli-refs-docs` | 26,372 | 8,660 <!-- consolidation: discard; ref: none; reason: Historical timing. --> |
| `cli-list-window` | 25,731 | 9,110 <!-- consolidation: discard; ref: none; reason: Historical timing. --> |
| `cli-custom-prefix-id-resolution` | 25,304 | 8,960 <!-- consolidation: discard; ref: none; reason: Historical timing. --> |
| `cli-draft-edit` | 22,392 | 14,110 <!-- consolidation: discard; ref: none; reason: Historical timing. --> |
| `cli-dependency` | 16,964 | 3,900 <!-- consolidation: discard; ref: none; reason: Historical timing. --> |
| `cli-json-output` | 16,274 | 6,630 <!-- consolidation: discard; ref: none; reason: Historical timing. --> |
| `cli-json-watch` | 15,785 | 5,660 <!-- consolidation: discard; ref: none; reason: Historical timing. --> |

### CLI surface B — indicative only (measured under peer load)
<!-- consolidation: discard; ref: none; reason: Historical measurement qualification. -->

| Suite | Before | After (raw / normalised) | Change |
|---|---:|---:|---|
| `cli-pipe-output` | 13,330 | 9,474 / ~3,900 | both 6 s drain-deadline sleeps now overlap; spawn count unchanged (4) <!-- consolidation: discard; ref: none; reason: Historical timing and optimization result. --> |
| `cli-milestone-management` | 14,567 | 11,958 / ~5,000 | ~25 -> ~18 spawns; 12 unasserted setup invocations became in-process calls <!-- consolidation: discard; ref: none; reason: Historical timing and optimization result. --> |
| `cli-task-list` | 17,267 | 19,815 / ~8,300 | 20 per-test init commits removed; 2 setup spawns became in-process; 1 duplicate case-fold case removed <!-- consolidation: discard; ref: none; reason: Historical timing and optimization result. --> |
| `config-commands` | 15,681 | 19,737 / ~8,200 | per-test `git init` removed; project built on demand (9 parse-only cases skip it) <!-- consolidation: discard; ref: none; reason: Historical timing and optimization result. --> |
| `cli-guidance` | 21,036 | 26,645 / ~11,100 | 46 -> 41 spawns; 2 merges, all assertions kept <!-- consolidation: discard; ref: none; reason: Historical timing and optimization result. --> |
| `cli-init-create` | 24,149 | 35,139 / ~14,000 | 37 -> 34 spawns; 2 merges + 2 duplicate prefix cases removed, assertions kept <!-- consolidation: discard; ref: none; reason: Historical timing and optimization result. --> |

### TUI, drafts and autocommit — 74,576 ms -> 25,130 ms (66% cut)
<!-- consolidation: discard; ref: none; reason: Historical aggregate timing. -->

| Suite | Before | After |
|---|---:|---:|
| `tui-task-composer` | 24,914 | 7,740 (8,780 with the limiter at width 4) <!-- consolidation: discard; ref: none; reason: Historical timing. --> |
| `draft-lifecycle-autocommit-scope` | 9,674 | 3,230 <!-- consolidation: discard; ref: none; reason: Historical timing. --> |
| `core-autocommit-scope` | 7,189 | 2,950 <!-- consolidation: discard; ref: none; reason: Historical timing. --> |
| `auto-commit` | 7,371 | 3,000 <!-- consolidation: discard; ref: none; reason: Historical timing. --> |
| `agent-sessions` | 5,627 | 1,280 <!-- consolidation: discard; ref: none; reason: Historical timing. --> |
| `opentui-agent-host-cleanup` | 4,917 | 3,220 <!-- consolidation: discard; ref: none; reason: Historical timing. --> |
| `draft-create-consistency` | 4,884 | 3,710 <!-- consolidation: discard; ref: none; reason: Historical timing. --> |

### Domain and filters

| Suite | Before | After |
|---|---:|---:|
| `task-edit-preservation` | 10,617 | 2,900 <!-- consolidation: discard; ref: none; reason: Historical timing. --> |
| `cli-doc-decision-board` | 10,423 | 4,100 <!-- consolidation: discard; ref: none; reason: Historical timing. --> |
| `cli-dependency-graph` | 9,637 | 3,200 <!-- consolidation: discard; ref: none; reason: Historical timing. --> |
| `cli-task-project` | 9,009 | 4,800 <!-- consolidation: discard; ref: none; reason: Historical timing. --> |
| `cli-task-type` | 8,580 | 5,300 <!-- consolidation: discard; ref: none; reason: Historical timing. --> |
| `cli-task-batch-edit` | 7,015 | 2,600 <!-- consolidation: discard; ref: none; reason: Historical timing. --> |
| `task-type-filtering` | 6,992 | 2,300 <!-- consolidation: discard; ref: none; reason: Historical timing. --> |
| `cli-milestone-filter` | 5,698 | 3,400 <!-- consolidation: discard; ref: none; reason: Historical timing. --> |
| `task-project-filtering` | 5,680 | 4,160 <!-- consolidation: discard; ref: none; reason: Historical timing. --> |
| `vacated-task-references` | 4,933 | 3,850 <!-- consolidation: discard; ref: none; reason: Historical timing. --> |
| `local-task-command-performance` | 4,678 | 2,870 <!-- consolidation: discard; ref: none; reason: Historical timing. --> |
| `cli-due-date` | 4,603 | 3,600 <!-- consolidation: discard; ref: none; reason: Historical timing. --> |
| `cli-commit-behaviour` | 4,528 | 2,790 <!-- consolidation: discard; ref: none; reason: Historical timing. --> |
| `cli-init-no-git` | 4,528 | 3,200 <!-- consolidation: discard; ref: none; reason: Historical timing. --> |
| `cli-parent-filter` | 4,499 | 2,780 <!-- consolidation: discard; ref: none; reason: Historical timing. --> |

### Server, core and watchers

| Suite | Before | After | Change |
|---|---:|---:|---|
| `server-tasks-spa-fallback` | 19,528 | 16,550 | lazy server start; 19 collision cases no longer pay a throwaway fixture init <!-- consolidation: discard; ref: none; reason: Historical timing and implementation detail. --> |
| `core` | 18,440 | 17,340 | 64 per-test `git init` replaced by the template copy <!-- consolidation: discard; ref: none; reason: Historical timing and implementation detail. --> |
| `server-search-endpoint` | 17,143 | 17,143 | nothing removable: 28 real server inits (~150 ms each) and 200-290 ms per mutation <!-- consolidation: discard; ref: none; reason: Historical timing and implementation detail. --> |
| `config-watcher` | 9,400 | 9,400 | production settle budgets plus deliberate 700/300 ms waits <!-- consolidation: discard; ref: none; reason: Historical timing and implementation detail. --> |
| `web-task-detail-deeplink` | 5,115 | 5,115 | per-test JSDOM + React render, already tick-driven <!-- consolidation: discard; ref: none; reason: Historical timing and implementation detail. --> |
| `task-watcher` | 4,219 | 4,219 | production read budget <!-- consolidation: discard; ref: none; reason: Historical timing and implementation detail. --> |
| `watch-json` | 4,110 | 4,110 | 3.75 s of real-clock waits spanning a 1000 ms poll interval <!-- consolidation: discard; ref: none; reason: Historical timing and implementation detail. --> |

`initGitRepo` was also swept into 23 further suites with no other change (each saved one `git init` per
case): `board-loading`, `core-task-corpus-regressions`, `no-remote-preflight`, `offline-integration`,
`server-task-detail-dependency-graph`, `server-task-project-endpoint`, `task-autocommit-index-scope`,
`worktree-refresh`, `find-agentic-workspace-root`, `agent-instructions`, `duplicate-task-repair`,
`config-commands`, `local-task-command-performance`, `mcp-documents`, `mcp-milestones`,
`mcp-roots-discovery`, `mcp-server`, `mcp-tasks`, `mcp-workspace-root`, `parent-id-normalization`,
`server-statistics-endpoint`, `symlink-agentic-workspace-root`, `worktree-task-id-allocation`. <!-- consolidation: discard; ref: none; reason: Historical source-change inventory. -->

## 6. Native Bun runner

`bun test --parallel --timeout=10000` uses Bun's per-file isolation and a 10-second case timeout. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Delegated AGENTS invocation includes native runner and case timeout. -->
The `src/test/test-preload.ts` hook assigns each worker a disposable OS-temp directory for `TMPDIR`,
`TMP`, and `TEMP`, clears workspace-pinning variables, assigns a unique test tmux socket, and removes
the scratch directory after the suite. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Shared preload owns temporary-root environment and socket isolation. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#error-handling-and-cleanup; reason: Explicitly require removal of owned disposable scratch after process settlement even on test failure. --> CI retains the platform-only file list on macOS/Windows and
uses a 10-minute job timeout instead of the former runner deadline. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Platform subset policy and exact CI job bound are historical configuration claims requiring confirmation before promotion. -->

## 7. Coverage deliberately kept

Not touched, because the cost is the behaviour under test:

- `cli-pipe-output`: two 6 s output-drain deadlines (the regression the suite exists for). Only their
  overlap was increased. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Preserve real deadline behavior when it is the regression under test rather than shortening it for speed. --> <!-- consolidation: discard; ref: none; reason: Exact wait and optimization result are historical. -->
- `cli-json-watch`: 1300 ms debounce and 1100 ms liveness waits on a real interval. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Later F7 remediation challenges fixed absence waits so these exact waits are not established requirements. -->
- `config-watcher`, `task-watcher`, `watch-json`: production settle/read budgets and real-clock waits. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Necessity of particular real-clock waits must be reconciled with later completion-fence practice. -->
- `server-search-endpoint`: real per-test server startup and per-mutation reconcile. <!-- consolidation: discard; ref: none; reason: Historical coverage of the removed web-server surface. -->

No assertion was weakened or deleted for speed, no test was skipped, no timeout was raised, and no real
integration (CLI, git, tmux, PTY, filesystem, HTTP) was replaced by a mock. <!-- consolidation: discard; ref: none; reason: Historical change-preservation claim rather than proof of current coverage. -->

## 8. Remaining failures

| Suite | Result | Cause |
|---|---|---|
| `branch-task-loader-resilience` | 2 fail | pre-existing at HEAD, file unmodified: `src/core/task-loader.ts` hydration drift <!-- consolidation: discard; ref: none; reason: Historical failure diagnosis. --> |
| `frontmatter-diagnostic-propagation` | 1 fail | same drift; file unmodified <!-- consolidation: discard; ref: none; reason: Historical failure diagnosis. --> |

These are production defects in task hydration, not test-runtime defects, and were deliberately left alone. <!-- consolidation: discard; ref: none; reason: Historical diagnosis and scope decision. -->

## 9. How to run
<!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Invocation and timeout procedure is delegated to AGENTS. -->
<!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Three-minute expectation and exact job timeout in the example are not established durable budgets. -->

```bash
# everything, under three minutes
bun test --parallel --timeout=10000

# one suite
bun test --parallel src/test/checklist.test.ts --timeout=10000

# CI sets a 10-minute job timeout; local full runs are bounded by the caller's timeout.
```

## 10. Bounded deadline and live-workspace isolation

CI bounds the test job at 10 minutes. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Exact historical CI bound is not established as durable policy. --> A full run is ~150 s on an idle 10-core machine and targets
under three minutes; local runs rely on the caller to bound a busy or stalled process. <!-- consolidation: discard; ref: none; reason: Historical runtime measurement. --> <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Approval of three-minute performance target is unresolved. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Require a caller-owned whole-run bound for local runs in addition to per-test timeouts. -->

Each test process is isolated from any live workspace:

- A per-worker OS-temp `TMPDIR` (deleted after the suite, including test failures). <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Shared preload owns disposable temporary-root isolation. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#error-handling-and-cleanup; reason: Make scratch cleanup on failed suites explicit after owned process settlement. -->
- Workspace-pinning env cleared in `src/test/test-preload.ts` (`AGENTIC_WORKSPACE_CWD`,
  `AGENTIC_WORKSPACE_WORKSPACE_CONTEXT`, `AGENTIC_WORKSPACE_PROJECT_ROOT`, `AGENTIC_WORKSPACE_TASK_ID`, `AGENTIC_WORKSPACE_SESSION_ID`,
  `TASK_ID`, `SESSION_ID`). <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Shared preload clears workspace-pinning environment. -->
- A unique test-owned `AGENTIC_WORKSPACE_TMUX_SOCKET`, so no test or spawned CLI touches the developer's
  default tmux server. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Unique test socket and prohibition on developer/default sockets are explicit. --> `createSessionServer()` honours it in `src/agent-workspace/session-process.ts`. <!-- consolidation: discard; ref: none; reason: Historical implementation pointer rather than a separate requirement. -->

A live `agentic-workspace workspace` therefore cannot stall a run, or be affected by one. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Isolation requirements do not prove the absolute no-stall or no-impact claim under all shared-machine conditions. -->
