# Bun test memory runaway — handoff

Status: memory runaway and start loop fixed (see Update 3). Three unrelated controller
failures remain. Owner: next agent.

## Goal

Make `bun run test` safe on a 16 GB machine again. One OpenTUI test file currently
allocates multi-GB and, under the default 20 parallel workers, exhausts memory and swap.

Definition of done:

- The hot test peaks below ~150 MB.
- `src/test/opentui-workspace-controller.test.ts` peaks below ~400 MB and the process exits.
- `bun test --parallel --max-concurrency=4 --timeout=10000` completes with no orphan
  `bun test --test-worker` processes and total suite memory stays under ~4 GB.
- No test is deleted, skipped, or weakened.
- The hot scenario performs a bounded number of agent-start attempts (no repeat loop),
  with a regression test asserting that bound.
- Any product change is minimal and confined to `workspace-controller.ts`.

## Incident evidence

Measured on 2026-10-18 on a 16 GB macOS machine (`sysctl hw.memsize` = 16 GB):

- Swap: **10.0 GB used of 11.3 GB**; free RAM fell to ~54 MB (3,475 free pages).
- One `bun test` process reached **1.16 GB RSS in 43 s**.
- A full-suite run wrote its JUnit report (2,030 tests) but the parent never exited;
  a `bun test --test-worker` process survived until killed.
- Several agent lanes ran test suites concurrently, each with its own worker pool.

Isolation:

| Run | Peak | Notes |
| --- | --- | --- |
| Light suite (`description-newlines`) | 82 MB | normal worker |
| One controller test | 72 MB | 91 ms |
| Two controller tests (`-t "retained host"`) | 72 MB | exits in 0.5 s |
| **Full controller file** | **2.4 GB** | 10 s, no summary |
| Full controller file, recorder capped at 50 | 439 MB | 30 s, still growing ~7 MB/s |
| Hot test: `-t "projects the running activity event"` | **874 MB** | under an 8 s cap |

The other two tests that set `activityPollIntervalMs: 0` exit too fast to sample;
only the "projects the running activity event…" test blows up.

Instrumented run (temporary copy, since deleted): `MountRecorder.#record` fired
**92,000 times in ~8 s (~11,500/s)**. Each snapshot is **1,087 bytes of JSON** with one
task; retained heap is **~13 KB per snapshot** (92k × 13 KB ≈ 1.2 GB, matching RSS).

This is repetition, not test-data size. One spinning test is enough; the number of
tests in the file is not the driver.

## Confirmed mechanism

File: `src/test/opentui-workspace-controller.test.ts`

- `MountRecorder` (line ~106) keeps **every** snapshot in unbounded arrays:
  `options` (line ~107), `boardOptions` (~108), `indication` (~109).
- `#record` (line ~122) pushes on every mount and every `update`; nothing trims.
- The only producer of `mount.update` is `#refresh` →
  `workspaceMount.update(workspaceOptions)` in
  `src/ui/opentui/workspace-controller.ts` (line ~1162).
- Hot test: "projects the running activity event even when durable lifecycle is parked"
  (line ~3371); it sets `activityPollIntervalMs: 0` (line ~3395).
- `#pollActivity` reschedules in `finally` with `#activityInterval()`
  (`workspace-controller.ts` ~793–821), so 0 ms means immediate re-arm.
- The controller re-schedules a refresh whenever the view state object changes
  (`workspace-controller.ts` ~968 and ~975: `state !== this.#viewState.current`).
- The test store `MemoryViewStateStore.update`
  (`opentui-workspace-controller.test.ts` ~57–66) **always** replaces `#state` and
  notifies. The production store
  (`src/agent-workspace/view-state-store.ts` ~154–166) returns early when
  `JSON.stringify(next) === JSON.stringify(base.state)`.

So the blow-up is a hot repaint loop whose output is retained forever by the recorder.
The store's missing dedupe is the likely loop driver; confirm before changing it.

## Update 1 — the loop is product-side (2026-10-18)

A follow-up agent instrumented `#scheduleRefresh` and confirmed the repeat caller:
`src/ui/opentui/workspace-controller.ts:1523`, the `finally` of the `#startAgent`
promise (line ~1518). It calls `void this.#scheduleRefresh()` after every start attempt.

With the test store temporarily deduping equal state **and** the recorder capped, the
hot test still rescheduled refreshes and reached 418 MB before termination (baseline
920 MB). The view-state feedback hypothesis is therefore not the driver: the controller
is repeatedly attempting agent starts, and each attempt schedules another refresh.

New question: why does `#startAgent` re-enter for the parked session? Trace the caller
chain (`#syncSelectedSession`, adoption/mode-selection paths, `#startingTasks` /
`#startingTaskModes` guards), identify what changes each cycle, and decide whether this
is a production bug (a parked session with activity and no local terminal can spin the
TUI) or a test-mock artifact.

Stop condition lifted: a minimal product fix is in scope, restricted to
`src/ui/opentui/workspace-controller.ts` and its tests. Preserve observable behavior.
Add a regression test that bounds start attempts (for example, assert the hot scenario
does not call `startAgent` more than twice) and re-measure.

## Update 2 — root cause and exact fix (2026-10-18)

The method is `#startTaskSession` (not `#startAgent`). Chain:
`finally` at `workspace-controller.ts:1523` → `#scheduleRefresh` → `#ensureRefreshLoop`
→ `#refresh` → `#syncSelectedSession`. That method reads the selected mode's history;
when the history reports `PARKED`, it **unconditionally** calls `#startTaskSession`
(`workspace-controller.ts:1335–1345`). The existing `#agents` / `#startingTasks` guard
sits *below* that branch (`:1348`), so parked sessions bypass it.

Each cycle then:
- reuses the retained live host (`:1697–1718`),
- calls `activateSession`, which in the test mutates `record.status` but not
  `durableStatus`, so history stays parked,
- clears all transient guards in `finally` (`:1518–1523`) and schedules another refresh.

Nothing changes the predicate, so it repeats. Store deduplication cannot help.

Production verdict: the exact successful-reuse loop is mock-sustained, because real
activation writes `RUNNING` (`src/agent-workspace/sessions.ts:988–1009`). But automatic
retry of a **failed** parked resume is a real defect: for example a missing worktree
(`src/core/session-application.ts:193–201`) fails before history changes, and
`:1515–1523` retries forever.

Minimal fix:

1. Move the guard at `workspace-controller.ts:1348–1349` above the `PARKED` branch at
   `:1334`, so an already-retained or in-flight session never auto-starts again.
2. Settle failed automatic resume attempts like the attach-failure pattern at
   `:1390–1396`: retain an error entry for the attempted session without overwriting an
   existing terminal. The moved `#agents.has(session.id)` guard then suppresses retries.
   Explicit Enter/picker retries still call `#startTaskSession` directly; handle declined
   exact-resume confirmation the same way. Do not keep a permanent in-flight guard.
3. Keep the completion refresh at `:1523`; it clears the starting presentation and
   exposes errors. Leave activity projection untouched.

Regression tests:

- Keep the existing assertions: parked + running evidence → `working`; later waiting
  evidence → `waiting`.
- After the initial launch settles, capture `counters.activate`; park the history,
  refresh repeatedly, and await several further probe calls. Assert the activation count
  is unchanged, `counters.prepare === 1`, and the terminal identity is unchanged.
- Add a rejecting-resume case: exactly one automatic attempt across refreshes, and a
  further attempt only after an explicit retry.

Do not add the recorder dedupe unless the measurements below still exceed target after
this fix. Smallest change first.

## Update 3 — outcome (2026-10-18, fix-33)

The memory runaway and the parked-session start loop are fixed. Do not redo this work.

Changes:

- `workspace-controller.ts`: the retained/in-flight guard now sits above the `PARKED`
  branch; failed automatic resumes keep an error entry without replacing an existing
  agent; declined exact-resume confirmation is settled the same way. Explicit retries,
  the completion refresh, and activity projection are unchanged.
- `opentui-workspace-controller.test.ts`: the activity regression now asserts a stable
  activation count, one preparation, and unchanged terminal identity; a new failed-resume
  test proves refreshes do not retry while an explicit Enter does.
- `package.json`: added `test:local` (`--max-concurrency=4`); `test` is unchanged.

Measurements:

| Check | Before | After |
| --- | --- | --- |
| Hot test | 920 MB+ | **74 MB** |
| Full controller file | 2.4 GB, no exit | **124 MB**, exits |
| Suite (4 workers) | hung / OOM | **2,043 tests, 3 failures** |

`pgrep -fl "bun test"` is empty after the suite. Recorder dedupe was not needed and was
not applied — the loop fix was sufficient.

Remaining, unrelated to this handoff:

- Controller: "external final removal detaches every retained host without stopping" and
  "does not publish an old delayed attachment after same-ID task replacement" — the
  isolated test environment has no tmux server socket.
- "real Enter waits for preparation and mount before focusing embedded preview
  (failure: %s)" — focus test sees arrow-key escape sequences in the input buffer;
  expectation mismatch.
- Typecheck: only the pre-existing tmux and Bun `ShellExpression` diagnostics remain.

A next agent should treat the memory work as done and handle those three failures
individually. Do not rerun the unbounded 20-worker suite.

## Fix plan (ordered, smallest first)

1. **Dedupe consecutive snapshots in `MountRecorder`.**
   - Skip `options.push` when the new snapshot serializes identically to the previous
     one. Options contain functions; serialize with a replacer that drops functions, or
     compare the plain fields tests can observe (task ids/statuses, selection,
     `detailsVisible`, view, filters, board move, live-agent presence).
   - Do the same for `boardOptions` and `indication`.
   - Safety cap: keep at most ~200 distinct snapshots (preserve indexes 0 and 1, drop
     from the middle). Tests use `next(0)` (56×), `next(1)` (1×), `.at(-1)`, `.some`,
     `.find`, `.length`, `options[0]`, `boardOptions[0]`, so never drop the first two or
     the latest.
2. **Fix the loop driver.**
   - If it is the test store: make `MemoryViewStateStore.update` return early on equal
     state, mirroring production. Keep revision unchanged on no-op.
   - If it is the 0 ms poll: change the hot test (and the other two 0 ms tests, lines
     ~1963 and ~3498) to `activityPollIntervalMs: 5`, as other tests already do.
   - Do not change the production default interval.
3. **Local concurrency.**
   - Keep `package.json` `"test": "bun test --parallel --timeout=10000"` for CI.
   - Add `"test:local": "bun test --parallel --max-concurrency=4 --timeout=10000"` and
     use it for agent/local runs. Do not run suites concurrently with other agents.
4. **Process hygiene.**
   - After any timeout: `pkill -f "bun test"`; verify `pgrep -fl "bun test"` is empty.
   - Never leave a timed-out suite running.

## Guardrails

- The worktree has extensive uncommitted work and **no commits** for this effort.
  Do not `git reset`, `git stash`, or `git checkout` anything.
- Protected files, do not touch: `src/agent-workspace/live/tmux/vt-channel.ts`,
  `pane-snapshot.ts`, `vt-channel.integration.test.ts`.
- Unverified partial edits from a canceled lane exist in
  `src/agent-workspace/session-process.ts` (`isUnavailableTmuxServer`,
  `constructor.name === "TmuxTransportError"`) and in the controller test fixtures
  (YAML conversions, `deleteTask`). Keep or revert deliberately; run that file after
  any change.
- Known typecheck errors are pre-existing: tmux files and Bun `ShellExpression` in
  `src/test/cli-*.test.ts`. Do not "fix" them here.
- Unrelated pending product work (do not absorb): TASK-019 deletion settlement awaits
  owner sign-off; config consolidation and doctor/completion removal are already done.

## Verification protocol

Memory measurement (bounded, no OOM):

```sh
FILE=src/test/opentui-workspace-controller.test.ts
bun test "$FILE" -t "projects the running activity event" --timeout=8000 > /tmp/one.log 2>&1 &
pid=$!
peak=0
for i in $(seq 1 30); do
  sleep 1
  rss=$(ps -o rss= -p $pid 2>/dev/null | tr -d ' ')
  [ -z "$rss" ] && break
  [ "$rss" -gt "$peak" ] && peak=$rss
  if [ "$rss" -gt 900000 ]; then kill -9 $pid; break; fi
done
kill -9 $pid 2>/dev/null
echo "peak ${peak}KB"
```

Then the whole file the same way (cap 1.5 GB), confirming it prints its summary and
exits. Then:

```sh
bun test --parallel --max-concurrency=4 --timeout=10000 \
  --reporter=junit --reporter-outfile=/tmp/junit3.xml
pgrep -fl "bun test"   # must be empty
```

Compare failures per file with:

```sh
python3 - <<'EOF'
import xml.etree.ElementTree as ET, collections
t = ET.parse('/tmp/junit3.xml').getroot()
c = collections.Counter()
for tc in t.iter('testcase'):
    if tc.find('failure') is not None:
        c[tc.get('classname') or '?'] += 1
print(sum(c.values()), "failures")
for k, v in c.most_common(): print(v, k)
EOF
```

Known unrelated residue at handoff time: controller tmux-socket failures and the
BunRunner timeout test (if it still flakes under full-suite load). Do not treat them as
regressions from this fix; report them separately.

Also run `bun run check:types` and confirm only the pre-existing diagnostics remain.

## Report back

- Root cause of the re-schedule loop (with the stack evidence) and whether it was test-only.
- Diff summary and peak numbers before/after (hot test, full file, full suite).
- Test results and any unrelated failures left.
- Anything you could not verify.
