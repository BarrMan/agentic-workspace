# Backlog.md — handoff

Written by the session that ended at `1e630d7e` on `main`, before the owner compacted the opencode database. Read alongside the repository `AGENTS.md`.

## What we are aiming for

The standing aim is the one in the runtime plan: bring Backlog.md's agent runtime in line with the verified AoE feature map, with no legacy or migration surface, and a test suite whose green means something. This session's part of it was: apply the owner's rulings to a mid-remediation tree, stop the disk exhaustion at its cause, and leave the suite's state honestly described.

**Where the work items live** — nothing is lost in this document; each item is owned by one plan:

| what | where |
| --- | --- |
| The goal, supported features, the five dependency-ordered slices, and the execution/commit/build rules | [shared-agent-server-plan.md](shared-agent-server-plan.md) |
| The assembled checkpoint, the map-first gate, file ownership, and the "immediate remaining proof" list (slice I steps 5–6, resume-policy phase 4) | [shared-agent-runtime-handoff.md](shared-agent-runtime-handoff.md) |
| Test-work procedure, the F1–F14 findings ledger, and the current load and disk findings | [test-suite-remediation-plan.md](test-suite-remediation-plan.md) |
| The owner's open decisions, which gate the remaining work | [decision-answers-5.md](decision-answers-5.md) (input on close) and [decision-answers-6.md](decision-answers-6.md) (items 1–3). [pending-decisions.md](pending-decisions.md) is now background: all five of its decisions are settled and implemented |
| Tracker tasks, including the owner's in-progress `back-25`/`back-27` records | `backlog/tasks/*` — read, never edit (owner's WIP) |

This document itself owns only three things: what this session changed, where the suite stands now, and the ordered next actions.

## Start here

- Repository `/Users/imribarr/Projects/Backlog.md`, branch `main`, HEAD `1e630d7e`.
- Working tree is clean **except the owner's WIP — never commit, revert or edit it**: `AGENTS.md`, `backlog/tasks/back-25/*` (6 files), `backlog/tasks/back-27/*` (4 files), `docs/opentui-workspace-session-contract.md`.
- Canonical checkpoint: [shared-agent-runtime-handoff.md](shared-agent-runtime-handoff.md) — its suite-number and temp-debris bullets were corrected in the same pass as this document. Test-work procedure: [test-suite-remediation-plan.md](test-suite-remediation-plan.md).
- Open questions that gate the remaining work: [decision-answers-5.md](decision-answers-5.md) (input on close — A/B/C, unanswered) and [decision-answers-6.md](decision-answers-6.md) (rewritten explanation-first after the owner rejected option lists without context; items 1–3 unanswered). **Read both before touching the artifact-view test or `AGENTS.md`.**

## Rules the owner enforces (apply literally)

1. Delegate every task to a specialist subagent; the orchestrator plans and reconciles, it does not implement.
2. No legacy, backward-compatibility or migration code anywhere — conversion of old data is a manual user action.
3. Never use the interactive question tool. Put choices in plain Markdown.
4. Explain product behaviour with a concrete scenario **before** offering options. No internal jargon.
5. Run only the commands actually requested — not the full suite, not a build, unless asked.
6. Before claiming anything is runnable in the installed CLI: `bun run build`, then `find src -name '*.ts' -newer dist/backlog` must print nothing.
7. Update a doc in place when one of its claims becomes false. Never append dated incident notes.

## What this session changed (all committed on `main`)

| commit | why |
| --- | --- |
| `da4caf9f` | dropped the legacy migration surface; applied the current-store rulings |
| `d13dae68` | guarded main-worktree resolution; kept hydration complete |
| `ddb32d7b`, `d3a1faef` | shared-runtime slice I steps 1–4: adapters own native identity, one publisher, the receipt-waiting branch deleted (a dispatched launch now records `running`) |
| `3a17f2a4` → `de64c3b0` | first attempt at the temp leak (cross-run pruning + wholesale preservation), then its replacement: ordinary failures delete scratch, only per-scope ownership/control records survive an unresolved scope, and such a run now exits nonzero |
| `959079a0` | behaviour tests launch the CLI from source in a real child process instead of a built copy |
| `0d3ebf85` | the runner stopped building a bundle nothing consumed |
| `b528462c`, `6e977066` | three load-sensitive suites re-bounded; `agent-sessions.test.ts` capped at width 8 |
| `1e630d7e` | the board-export comparison normalises only the generated timestamp |

## The disk story (measured, not inferred)

- The pile was **not** macOS shared-cache extraction — that claim in the canonical handoff was wrong. Running a **compiled** Bun binary writes each embedded file to `.<hash-or-timestamp>-<hex>.<ext>`: measured at **5,560,064 bytes per launch** of `libopentui.dylib`, byte-identical every time, and able to survive a clean exit (upstream Bun issue #29585). Running from source writes **zero**. ~816 copies ≈ 4.4 GB per dirty run.
- That became permanent because the runner preserved the whole run directory when it could not confirm a worker finished — 18 GB across five directories. Replaced as above.
- Tests no longer cause it. **The built/installed CLI still does**: each launch leaves 5.4 MB in the system temp directory. 55 such files (~300 MB) were cleaned; two stale 24 KB run directories remain under `/var/folders/6z/jl00z05s7b7gmlgvjtf7fh9w0000gn/T/` (`backlog-ci-run-AXjaVD`, `backlog-ci-run-eaHWJC`).
- The host database `~/.opencode-personal/data/opencode/opencode.db` was 12.5 GB, half of it free pages inside the file; the owner compacts it with opencode closed (`sqlite3 … "VACUUM;"`). Free disk went 185 MB → 76 GiB.

## Where the suite stands

Quiet acceptance run (`bun run test`, 5 lanes): **286/286 files, 2,489 passed, 3 failed, 138.66 s**, exit 1. No deadline breach, no cleanup warning, zero new extraction files.

1. `src/test/artifact-view-live-refresh-contract.test.ts` — timeout at 10,011 ms. **Gated on decision-answers-6 item 1.** Its repair in `b528462c` is inert (a 15 s internal budget inside a 10 s per-test limit), and the case waits on an OS notification that has no polling fallback while asserting a fixed 150 ms deadline.
2. `src/test/cli-draft-edit.test.ts` — 10,000.39 ms timeout. **Verdict: budget exhaustion under machine starvation, not a hang.** Alone 5/5 at ~3 s per case (~3.3× headroom); under 5 lanes 3 of 5 runs failed, with sibling CLI suites timing out in the same runs. It awaits four sequential CLI spawns, a signal the design guarantees.
3. `src/test/cli-doc-decision-board.test.ts` — fixed in `1e630d7e`: the two invocations each stamp their own wall-clock line, so only that line is normalised, its format is still asserted, and every other line is compared exactly.

## Next actions, in order

1. Get the owner's answers (decision-answers-6 items 1–3, decision-answers-5). Then fix the artifact-view wait and its 150 ms assertion; decide whether `src/utils/task-watcher.ts` gains a periodic re-check; and correct the `AGENTS.md` sentence about the suite running against source (owner's WIP — ask first). Also awaiting the owner's intent, with evidence and two options recorded: MCP task responses silently drop the dependency-cleanup message — see [pending-decisions.md](pending-decisions.md).
2. **The starvation problem.** Source launches transpile per launch, so CLI-spawning files have less headroom. The in-process entry already exists — `runCli(argv, { cwd, stdout, stderr })` in `src/cli/index.ts` — and converting `cli-guidance` cut it 16.1 s → 4.3 s. Investigate converting *behavioural* spawn-heavy suites to it while keeping genuinely process-boundary suites (pipes, signals, PTYs, exit codes) spawning. Do not raise the per-test budget or the lane count.
3. Remaining tidy-ups: the runner's JSON report still carries a bundle-build-time field that is always `0`; the two stale run directories above.
4. Then the canonical checkpoint's own work: shared-runtime slice I steps 5–6 and resume-policy phase 4 — see [shared-agent-runtime-handoff.md](shared-agent-runtime-handoff.md).
5. No build has been run. `dist/backlog` predates everything above, so nothing should be presented as runnable until step 6 of the rules is satisfied.

## Evidence worth reusing (do not re-derive)

- Extraction probe: source launch → 0 files; compiled launch → +5,432 KB per launch, five of five byte-identical; `otool -D` → `@rpath/libopentui.dylib`.
- `agent-sessions` width table (worst loaded per-case): no limiter 3,816 ms · width 4 **4,107 ms (worse)** · width 8 3,102 ms · width 16 one 10,005 ms timeout. Fixture copy measured 1.9 ms of a ~1,050 ms case.
- `cli-list-window`: 8 of 12 cases timed out under 5-lane load before its limiter + explicit 30 s per-case budget.
- Full-suite logs: `/tmp/acceptance-suite.log` (may be cleaned by the OS).
- The strategic verdict behind all of this is summarised in [decision-answers-6.md](decision-answers-6.md).

## Suggested skills

- `diagnosing-bugs` — for the load-starvation flakiness (next action 2); it fits a measurement-first loop on a flaky symptom.
- `implement` or `implement-spec` — for slice I steps 5–6 and resume-policy phase 4 once their specs are settled.
- `tdd` — if you fix the artifact-view contract test-first; its awaited condition is currently unsatisfiable by design.
- `ponytail` — the repository's standing practice for minimal complete changes.
- `handoff` — when you next transition context; export a pointer, not a duplicate body.
