# Test suite runtime report

Date: 2026-10-07. Scope: wall-clock runtime of the Bun test suite (345 files, one process per file).
Machine used for every number below: 10 cores, 16 GB, Apple silicon.

> **Historical snapshot.** Suite names and counts predate the removal of the legacy blessed TUI, so entries such as `tui-task-composer` and `heading` refer to tests that no longer exist.

Related: `src/guidelines/agent-guidelines.md` (how to run one suite), `docs/disk-growth-investigation.md`.

## 1. Result

| Configuration | Wall | Files | Passed tests | Failing files |
|---|---:|---:|---:|---|
| Summed per-file wall, serial (before) | 768.2 s | 345 | 2877 | 3 (pre-existing) |
| Full suite, 9 lanes, unoptimized tree | 200.8 s | 345 | 2875 | 3 (pre-existing) |
| **Full suite, 5 lanes (default), optimized** | **178.6 s** | 345 | 2870 | 3 (pre-existing) |
| Full suite, 5 lanes, quiet machine | 162.0 s | 345 | 2870 | 3 (pre-existing) |
| Full suite, 6 lanes | 162.0 s | 345 | 2869 | 3 (pre-existing) |
| Full suite, 4 lanes | 173.1 s | 345 | 2869 | 3 (pre-existing) |
| Full suite, 8 lanes | 179.8 s | 345 | 2853 | 5 files (3 pre-existing + 2 contention flakes) |

The target is a full run under three minutes; the default configuration now meets it with margin.
`bun test --parallel --timeout=10000` runs everything through Bun's native per-file-isolated runner.

**Post-removal update (2026-10-07):** after the web interface and its HTTP server were removed
(`src/web/**`, `src/server/**`, 72 suites, react/tailwind/jsdom dependencies), the suite is 253 files and
2247 tests, and a full run measures **120.0 s** at the default 5 lanes with only the two pre-existing
failing files below. The TUI suites are unchanged and green.

**With the agent-workspace suites added (2026-10-07):** 257 files and 2332 tests, measured at
**151.4 s** across 5 isolated workers on an otherwise idle machine. Reading the summary line is not
enough to judge a run: it reports files *run* and tests *passed*, so the two red files below are
counted as successes there. Grep the progress lines for `failed in` instead.

## 2. Method and its limits

- Bun's parallel runner isolates test files in workers; `bun test <file> --timeout=20000` runs one file.
  Lane counts are relevant only when intentionally measuring the whole suite.
- Absolute `after` numbers taken by the optimisation workers were collected while other workers were also
  benchmarking, so several are inflated by roughly 2.2-2.6x (a control suite measured 2.25 s idle versus
  5.0-6.3 s under that load). Those rows are marked *indicative*; the same-window A/B rows and the parent's
  full-suite runs are the authoritative ones.
- Before-values are per-file wall times from the audit ledger
  (`local://test-suite-runtime-files.json` in the agent session that produced this report), which used the
  same one-process-per-file method.

## 3. Why the suite was slow

Two costs dominated, both measured rather than assumed:

1. **Real CLI process spawns.** Each CLI assertion boots the compiled `backlog` binary (~0.3-1.5 s under
   load). Suites with 30-60 spawns spent nearly all their wall time waiting on process starts. In-process
   fixture setup measured ~29 ms and was irrelevant.
2. **Per-case fixture construction.** `git init` costs ~32 ms per call; a single auto-commit
   `createTaskFromInput` fires ~37 git calls (~1.6 s). Suites that built a full project per test paid this
   dozens of times (e.g. `core.test.ts` called `git init` 64 times).

Deliberate sleeps were a smaller factor: most remaining waits are real-clock regressions under test.

## 4. Techniques applied

| Technique | Effect |
|---|---|
| `describe.concurrent` / `test.concurrent` with per-case isolated fixtures | overlapping process waits; measured 2-3x on unchanged code (one probe: four 300 ms sleeps finished in 311 ms) |
| One prepared project template per suite, cloned per case (`cp` = APFS clonefile, ~3 ms) instead of rebuilding | removed repeated `git init` + project init + config writes |
| `initGitRepo(dir, branch?)` in `src/test/test-utils.ts`: copies a prepared `.git` template (~1 ms) instead of spawning `git init` (~32 ms) | 40x cheaper repo creation; applied to 25 files |
| In-process `Core` calls for setup that no assertion inspected | removed unasserted CLI spawns |
| `Promise.all` for independent CLI invocations | fewer sequential rounds |
| `createConcurrencyLimiter(width)` slot pool in `test-utils.ts` | caps how many cases of one process touch the machine at once, for suites where unbounded overlap caused real-time waits to expire under lane load |
| Merging duplicated cases whose assertions overlapped | 7 duplicate tests removed this round (2 in `cli-guidance`, 4 in `cli-init-create`, 1 in `cli-task-list`), every assertion kept |

## 5. Per-suite results

### CLI surface A — 148,821 ms -> 57,030 ms (2.6x)

| Suite | Before | After |
|---|---:|---:|
| `cli-refs-docs` | 26,372 | 8,660 |
| `cli-list-window` | 25,731 | 9,110 |
| `cli-custom-prefix-id-resolution` | 25,304 | 8,960 |
| `cli-draft-edit` | 22,392 | 14,110 |
| `cli-dependency` | 16,964 | 3,900 |
| `cli-json-output` | 16,274 | 6,630 |
| `cli-json-watch` | 15,785 | 5,660 |

### CLI surface B — indicative only (measured under peer load)

| Suite | Before | After (raw / normalised) | Change |
|---|---:|---:|---|
| `cli-pipe-output` | 13,330 | 9,474 / ~3,900 | both 6 s drain-deadline sleeps now overlap; spawn count unchanged (4) |
| `cli-milestone-management` | 14,567 | 11,958 / ~5,000 | ~25 -> ~18 spawns; 12 unasserted setup invocations became in-process calls |
| `cli-task-list` | 17,267 | 19,815 / ~8,300 | 20 per-test init commits removed; 2 setup spawns became in-process; 1 duplicate case-fold case removed |
| `config-commands` | 15,681 | 19,737 / ~8,200 | per-test `git init` removed; project built on demand (9 parse-only cases skip it) |
| `cli-guidance` | 21,036 | 26,645 / ~11,100 | 46 -> 41 spawns; 2 merges, all assertions kept |
| `cli-init-create` | 24,149 | 35,139 / ~14,000 | 37 -> 34 spawns; 2 merges + 2 duplicate prefix cases removed, assertions kept |

### TUI, drafts and autocommit — 74,576 ms -> 25,130 ms (66% cut)

| Suite | Before | After |
|---|---:|---:|
| `tui-task-composer` | 24,914 | 7,740 (8,780 with the limiter at width 4) |
| `draft-lifecycle-autocommit-scope` | 9,674 | 3,230 |
| `core-autocommit-scope` | 7,189 | 2,950 |
| `auto-commit` | 7,371 | 3,000 |
| `agent-sessions` | 5,627 | 1,280 |
| `opentui-agent-host-cleanup` | 4,917 | 3,220 |
| `draft-create-consistency` | 4,884 | 3,710 |

### Domain and filters

| Suite | Before | After |
|---|---:|---:|
| `task-edit-preservation` | 10,617 | 2,900 |
| `cli-doc-decision-board` | 10,423 | 4,100 |
| `cli-dependency-graph` | 9,637 | 3,200 |
| `cli-task-project` | 9,009 | 4,800 |
| `cli-task-type` | 8,580 | 5,300 |
| `cli-task-batch-edit` | 7,015 | 2,600 |
| `task-type-filtering` | 6,992 | 2,300 |
| `cli-milestone-filter` | 5,698 | 3,400 |
| `task-project-filtering` | 5,680 | 4,160 |
| `vacated-task-references` | 4,933 | 3,850 |
| `local-task-command-performance` | 4,678 | 2,870 |
| `cli-due-date` | 4,603 | 3,600 |
| `cli-commit-behaviour` | 4,528 | 2,790 |
| `cli-init-no-git` | 4,528 | 3,200 |
| `cli-parent-filter` | 4,499 | 2,780 |

### Server, core and watchers

| Suite | Before | After | Change |
|---|---:|---:|---|
| `server-tasks-spa-fallback` | 19,528 | 16,550 | lazy server start; 19 collision cases no longer pay a throwaway fixture init |
| `core` | 18,440 | 17,340 | 64 per-test `git init` replaced by the template copy |
| `server-search-endpoint` | 17,143 | 17,143 | nothing removable: 28 real server inits (~150 ms each) and 200-290 ms per mutation |
| `config-watcher` | 9,400 | 9,400 | production settle budgets plus deliberate 700/300 ms waits |
| `web-task-detail-deeplink` | 5,115 | 5,115 | per-test JSDOM + React render, already tick-driven |
| `task-watcher` | 4,219 | 4,219 | production read budget |
| `watch-json` | 4,110 | 4,110 | 3.75 s of real-clock waits spanning a 1000 ms poll interval |

`initGitRepo` was also swept into 23 further suites with no other change (each saved one `git init` per
case): `board-loading`, `core-task-corpus-regressions`, `no-remote-preflight`, `offline-integration`,
`server-task-detail-dependency-graph`, `server-task-project-endpoint`, `task-autocommit-index-scope`,
`worktree-refresh`, `find-backlog-root`, `agent-instructions`, `duplicate-task-repair`,
`config-commands`, `local-task-command-performance`, `mcp-documents`, `mcp-milestones`,
`mcp-roots-discovery`, `mcp-server`, `mcp-tasks`, `mcp-workspace-root`, `parent-id-normalization`,
`server-statistics-endpoint`, `symlink-backlog-root`, `worktree-task-id-allocation`.

## 6. Native Bun runner

`bun test --parallel --timeout=10000` uses Bun's per-file isolation and a 10-second case timeout.
The `src/test/test-preload.ts` hook assigns each worker a disposable OS-temp directory for `TMPDIR`,
`TMP`, and `TEMP`, clears workspace-pinning variables, assigns a unique test tmux socket, and removes
the scratch directory after the suite. CI retains the platform-only file list on macOS/Windows and
uses a 10-minute job timeout instead of the former runner deadline.

## 7. Coverage deliberately kept

Not touched, because the cost is the behaviour under test:

- `cli-pipe-output`: two 6 s output-drain deadlines (the regression the suite exists for). Only their
  overlap was increased.
- `cli-json-watch`: 1300 ms debounce and 1100 ms liveness waits on a real interval.
- `config-watcher`, `task-watcher`, `watch-json`: production settle/read budgets and real-clock waits.
- `server-search-endpoint`: real per-test server startup and per-mutation reconcile.

No assertion was weakened or deleted for speed, no test was skipped, no timeout was raised, and no real
integration (CLI, git, tmux, PTY, filesystem, HTTP) was replaced by a mock.

## 8. Remaining failures

| Suite | Result | Cause |
|---|---|---|
| `branch-task-loader-resilience` | 2 fail | pre-existing at HEAD, file unmodified: `src/core/task-loader.ts` hydration drift |
| `frontmatter-diagnostic-propagation` | 1 fail | same drift; file unmodified |

These are production defects in task hydration, not test-runtime defects, and were deliberately left alone.

## 9. How to run

```bash
# everything, under three minutes
bun test --parallel --timeout=10000

# one suite
bun test --parallel src/test/checklist.test.ts --timeout=10000

# CI sets a 10-minute job timeout; local full runs are bounded by the caller's timeout.
```

## 10. Bounded deadline and live-workspace isolation

CI bounds the test job at 10 minutes. A full run is ~150 s on an idle 10-core machine and targets
under three minutes; local runs rely on the caller to bound a busy or stalled process.

Each test process is isolated from any live workspace:

- A per-worker OS-temp `TMPDIR` (deleted after the suite, including test failures).
- Workspace-pinning env cleared in `src/test/test-preload.ts` (`BACKLOG_CWD`,
  `BACKLOG_WORKSPACE_CONTEXT`, `BACKLOG_PROJECT_ROOT`, `BACKLOG_TASK_ID`, `BACKLOG_SESSION_ID`,
  `TASK_ID`, `SESSION_ID`).
- A unique test-owned `BACKLOG_TMUX_SOCKET`, so no test or spawned CLI touches the developer's
  default tmux server. `createSessionServer()` honours it in `src/agent-workspace/session-process.ts`.

A live `agenticworkspace workspace` therefore cannot stall a run, or be affected by one.
