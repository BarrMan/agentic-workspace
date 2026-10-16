---
consolidation:
  total: 73
  counts:
    exists: 7
    discard: 52
    integrate: 4
    unconfirmed: 10
  percentages:
    exists: 9.59%
    discard: 71.23%
    integrate: 5.48%
    unconfirmed: 13.70%
---
# Backlog.md — handoff

> **Non-authoritative supporting material.** This file is not a contract. Authoritative owner(s): [sessions](specs/sessions.md), [supported integration operations](specs/supported-integration-operations.md), [SPEC](SPEC.md), [CONVENTIONS](CONVENTIONS.md), [BLUEPRINT](BLUEPRINT.md).
> Disposition: Mixed — see markers.

Written by the session that ended at `1e630d7e` on `main`, before the owner compacted the opencode database. Read alongside the repository `AGENTS.md`. <!-- consolidation: discard; ref: none; reason: Historical checkpoint provenance and reading pointer. -->

## What we are aiming for

The standing aim is the one in the runtime plan: bring Backlog.md's agent runtime in line with the verified AoE feature map, with no legacy or migration surface, and a test suite whose green means something. This session's part of it was: apply the owner's rulings to a mid-remediation tree, stop the disk exhaustion at its cause, and leave the suite's state honestly described. <!-- consolidation: discard; ref: none; reason: AoE feature-map alignment is historical work scope rather than current approval authority. --> <!-- consolidation: unconfirmed; ref: none; reason: Legacy compatibility is not retained without explicit approval. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#testing; reason: Verification claims must reflect actual exercised behavior. --> <!-- consolidation: discard; ref: none; reason: Session-specific disk remediation objective. -->

**Where the work items live** — nothing is lost in this document; each item is owned by one plan:

| what | where |
| --- | --- |
| The goal, supported features, the five dependency-ordered slices, and the execution/commit/build rules | [shared-agent-server-plan.md](shared-agent-server-plan.md) <!-- consolidation: discard; ref: none; reason: Historical work-location map does not replace current owners. --> |
| The assembled checkpoint, the map-first gate, file ownership, and the "immediate remaining proof" list (slice I steps 5–6, resume-policy phase 4) | [shared-agent-runtime-handoff.md](shared-agent-runtime-handoff.md) <!-- consolidation: discard; ref: none; reason: Checkpoint navigation retained as evidence without declaring gates satisfied. --> |
| Test-work procedure, the F1–F14 findings ledger, and the current load and disk findings | [test-suite-remediation-plan.md](test-suite-remediation-plan.md) <!-- consolidation: discard; ref: none; reason: Historical procedure and findings pointer. --> |
| The owner's open decisions, which gate the remaining work | [decision-answers-5.md](decision-answers-5.md) (input on close) and [decision-answers-6.md](decision-answers-6.md) (items 1–3). [pending-decisions.md](pending-decisions.md) is now background: all five of its decisions are settled and implemented <!-- consolidation: discard; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Historical input-on-close open status is superseded by sheet 8 answer B approving bounded in-flight completion. --> <!-- consolidation: discard; ref: docs/CONVENTIONS.md#testing; reason: Sheet 8 answers artifact-test item 1 and in-process conversion item 2. --> <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Sheet 8 explicitly defers item 3 packaging-coverage wording. --> <!-- consolidation: unconfirmed; ref: none; reason: Historical all-five implementation completion does not establish current conformance or settle the separately mentioned MCP feedback question. --> |
| Tracker tasks, including the owner's in-progress `back-25`/`back-27` records | `backlog/tasks/*` — read, never edit (owner's WIP) <!-- consolidation: exists; ref: docs/CONVENTIONS.md#general-principles; reason: Owner work must be preserved. --> |

This document itself owns only three things: what this session changed, where the suite stands now, and the ordered next actions. <!-- consolidation: discard; ref: none; reason: Historical handoff scope description. -->

## Start here

- Repository `/Users/imribarr/Projects/Backlog.md`, branch `main`, HEAD `1e630d7e`. <!-- consolidation: discard; ref: none; reason: Historical checkout identity. -->
- Working tree is clean **except the owner's WIP — never commit, revert or edit it**: `AGENTS.md`, `backlog/tasks/back-25/*` (6 files), `backlog/tasks/back-27/*` (4 files), `docs/opentui-workspace-session-contract.md`. <!-- consolidation: discard; ref: none; reason: Historical dirty-tree inventory. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#general-principles; reason: Preserve unrelated owner work. -->
- Canonical checkpoint: [shared-agent-runtime-handoff.md](shared-agent-runtime-handoff.md) — its suite-number and temp-debris bullets were corrected in the same pass as this document. Test-work procedure: [test-suite-remediation-plan.md](test-suite-remediation-plan.md). <!-- consolidation: discard; ref: none; reason: Historical checkpoint correction and navigation. -->
- Open questions that gate the remaining work: [decision-answers-5.md](decision-answers-5.md) (input on close — A/B/C, unanswered) and [decision-answers-6.md](decision-answers-6.md) (rewritten explanation-first after the owner rejected option lists without context; items 1–3 unanswered). **Read both before touching the artifact-view test or `AGENTS.md`.** <!-- consolidation: discard; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Sheet 8 settles input-on-close with B while implementation proof remains separate. --> <!-- consolidation: discard; ref: docs/CONVENTIONS.md#testing; reason: Sheet 8 approves result-level artifact tests and case-specific in-process conversion. --> <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Item 3 contributor wording remains deferred so its editing gate is not retired. -->

## Rules the owner enforces (apply literally)

1. Delegate every task to a specialist subagent; the orchestrator plans and reconciles, it does not implement. <!-- consolidation: discard; ref: none; reason: Session-specific orchestration instruction rather than product or engineering contract. -->
2. No legacy, backward-compatibility or migration code anywhere — conversion of old data is a manual user action. <!-- consolidation: unconfirmed; ref: none; reason: Superseded behavior is removed rather than supported implicitly. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Legacy data conversion is manual user-owned work distinct from approved configured store relocation. -->
3. Never use the interactive question tool. Put choices in plain Markdown. <!-- consolidation: discard; ref: none; reason: Agent communication preference belongs to contributor instructions. -->
4. Explain product behaviour with a concrete scenario **before** offering options. No internal jargon. <!-- consolidation: discard; ref: none; reason: Contributor communication instruction rather than durable product contract. -->
5. Run only the commands actually requested — not the full suite, not a build, unless asked. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Historical execution restriction replaced by current required scoped verification and runnable-handoff build. -->
6. Before claiming anything is runnable in the installed CLI: `bun run build`, then `find src -name '*.ts' -newer dist/backlog` must print nothing. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Rebuild and source freshness verification required with current executable path delegated to AGENTS. -->
7. Update a doc in place when one of its claims becomes false. Never append dated incident notes. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#documentation-maintenance; reason: Update owning contracts and keep incident narratives out of core. -->

## What this session changed (all committed on `main`)

| commit | why |
| --- | --- |
| `da4caf9f` | dropped the legacy migration surface; applied the current-store rulings <!-- consolidation: discard; ref: none; reason: Historical commit result. --> |
| `d13dae68` | guarded main-worktree resolution; kept hydration complete <!-- consolidation: discard; ref: none; reason: Historical commit result. --> |
| `ddb32d7b`, `d3a1faef` | shared-runtime slice I steps 1–4: adapters own native identity, one publisher, the receipt-waiting branch deleted (a dispatched launch now records `running`) <!-- consolidation: discard; ref: docs/specs/sessions.md#starting-a-session; reason: Historical implementation result does not replace current readiness guarantees or observed-state model. --> |
| `3a17f2a4` → `de64c3b0` | first attempt at the temp leak (cross-run pruning + wholesale preservation), then its replacement: ordinary failures delete scratch, only per-scope ownership/control records survive an unresolved scope, and such a run now exits nonzero <!-- consolidation: discard; ref: none; reason: Historical runner replacement chronology. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#testing; reason: Unresolved cleanup must fail verification and retain bounded ownership evidence without retaining all scratch data. --> |
| `959079a0` | behaviour tests launch the CLI from source in a real child process instead of a built copy <!-- consolidation: discard; ref: none; reason: Historical commit result. --> |
| `0d3ebf85` | the runner stopped building a bundle nothing consumed <!-- consolidation: discard; ref: none; reason: Historical runner optimization. --> |
| `b528462c`, `6e977066` | three load-sensitive suites re-bounded; `agent-sessions.test.ts` capped at width 8 <!-- consolidation: discard; ref: none; reason: Historical suite tuning. --> |
| `1e630d7e` | the board-export comparison normalises only the generated timestamp <!-- consolidation: discard; ref: none; reason: Historical assertion repair. --> |

## The disk story (measured, not inferred)

- The pile was **not** macOS shared-cache extraction — that claim in the canonical handoff was wrong. Running a **compiled** Bun binary writes each embedded file to `.<hash-or-timestamp>-<hex>.<ext>`: measured at **5,560,064 bytes per launch** of `libopentui.dylib`, byte-identical every time, and able to survive a clean exit (upstream Bun issue #29585). Running from source writes **zero**. ~816 copies ≈ 4.4 GB per dirty run. <!-- consolidation: discard; ref: none; reason: Dated measured extraction diagnosis and corrected attribution. -->
- That became permanent because the runner preserved the whole run directory when it could not confirm a worker finished — 18 GB across five directories. Replaced as above. <!-- consolidation: discard; ref: none; reason: Historical retention diagnosis and remediation. -->
- Tests no longer cause it. **The built/installed CLI still does**: each launch leaves 5.4 MB in the system temp directory. 55 such files (~300 MB) were cleaned; two stale 24 KB run directories remain under `/var/folders/6z/jl00z05s7b7gmlgvjtf7fh9w0000gn/T/` (`backlog-ci-run-AXjaVD`, `backlog-ci-run-eaHWJC`). <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#testing; reason: Current source-versus-installed extraction status needs verification before relying on it. --> <!-- consolidation: discard; ref: none; reason: Historical cleanup counts and stale-directory inventory. -->
- The host database `~/.opencode-personal/data/opencode/opencode.db` was 12.5 GB, half of it free pages inside the file; the owner compacts it with opencode closed (`sqlite3 … "VACUUM;"`). Free disk went 185 MB → 76 GiB. <!-- consolidation: discard; ref: none; reason: Historical host database maintenance and disk measurements outside the product contract. --> <!-- consolidation: unconfirmed; ref: none; reason: Closed-host idle-database safety prerequisite must be revalidated before reusing the maintenance command. -->

## Where the suite stands

Quiet acceptance run (`bun run test`, 5 lanes): **286/286 files, 2,489 passed, 3 failed, 138.66 s**, exit 1. No deadline breach, no cleanup warning, zero new extraction files. <!-- consolidation: discard; ref: none; reason: Dated acceptance-run evidence. -->

1. `src/test/artifact-view-live-refresh-contract.test.ts` — timeout at 10,011 ms. **Gated on decision-answers-6 item 1.** Its repair in `b528462c` is inert (a 15 s internal budget inside a 10 s per-test limit), and the case waits on an OS notification that has no polling fallback while asserting a fixed 150 ms deadline. <!-- consolidation: discard; ref: none; reason: Dated timeout and ineffective test-budget diagnosis. --> <!-- consolidation: discard; ref: docs/CONVENTIONS.md#testing; reason: Approval gate was answered by sheet 8 A prime choosing visible-result assertions without periodic recheck. -->
2. `src/test/cli-draft-edit.test.ts` — 10,000.39 ms timeout. **Verdict: budget exhaustion under machine starvation, not a hang.** Alone 5/5 at ~3 s per case (~3.3× headroom); under 5 lanes 3 of 5 runs failed, with sibling CLI suites timing out in the same runs. It awaits four sequential CLI spawns, a signal the design guarantees. <!-- consolidation: discard; ref: none; reason: Historical starvation measurement and diagnostic verdict. -->
3. `src/test/cli-doc-decision-board.test.ts` — fixed in `1e630d7e`: the two invocations each stamp their own wall-clock line, so only that line is normalised, its format is still asserted, and every other line is compared exactly. <!-- consolidation: discard; ref: none; reason: Historical timestamp assertion correction. -->

## Next actions, in order

1. Get the owner's answers (decision-answers-6 items 1–3, decision-answers-5). Then fix the artifact-view wait and its 150 ms assertion; decide whether `src/utils/task-watcher.ts` gains a periodic re-check; and correct the `AGENTS.md` sentence about the suite running against source (owner's WIP — ask first). Also awaiting the owner's intent, with evidence and two options recorded: MCP task responses silently drop the dependency-cleanup message — see [pending-decisions.md](pending-decisions.md). <!-- consolidation: discard; ref: docs/CONVENTIONS.md#testing; reason: Sheet 8 settles artifact testing and CLI conversion without adding periodic recheck. --> <!-- consolidation: discard; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Sheet 8 settles input-on-close as bounded in-flight completion. --> <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Contributor packaging-evidence wording remains explicitly deferred in sheet 8. --> <!-- consolidation: discard; ref: none; reason: Artifact-test repair and contributor-text correction are historical execution tasks. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#general-principles; reason: Owner WIP cannot be overwritten without agreement. --> <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: MCP dependency-cleanup feedback policy remains unanswered. -->
2. **The starvation problem.** Source launches transpile per launch, so CLI-spawning files have less headroom. The in-process entry already exists — `runCli(argv, { cwd, stdout, stderr })` in `src/cli/index.ts` — and converting `cli-guidance` cut it 16.1 s → 4.3 s. Investigate converting *behavioural* spawn-heavy suites to it while keeping genuinely process-boundary suites (pipes, signals, PTYs, exit codes) spawning. Do not raise the per-test budget or the lane count. <!-- consolidation: discard; ref: none; reason: Historical transpilation diagnosis and conversion benchmark. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#testing; reason: Sheet 8 explicitly approves in-process ordinary CLI behavior tests beyond core source-based wording. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#testing; reason: Pipe signal PTY and exit-code behavior must retain real process-boundary verification. --> <!-- consolidation: discard; ref: docs/CONVENTIONS.md#testing; reason: Old lane and budget tuning restrictions yield to current test procedure. -->
3. Remaining tidy-ups: the runner's JSON report still carries a bundle-build-time field that is always `0`; the two stale run directories above. <!-- consolidation: discard; ref: none; reason: Historical cleanup inventory. -->
4. Then the canonical checkpoint's own work: shared-runtime slice I steps 5–6 and resume-policy phase 4 — see [shared-agent-runtime-handoff.md](shared-agent-runtime-handoff.md). <!-- consolidation: unconfirmed; ref: none; reason: Runtime and resume proof completion is not established by this mapping. -->
5. No build has been run. `dist/backlog` predates everything above, so nothing should be presented as runnable until step 6 of the rules is satisfied. <!-- consolidation: discard; ref: none; reason: Historical binary freshness status. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Installed runnable claims require rebuild and verified freshness. -->

## Evidence worth reusing (do not re-derive)

- Extraction probe: source launch → 0 files; compiled launch → +5,432 KB per launch, five of five byte-identical; `otool -D` → `@rpath/libopentui.dylib`. <!-- consolidation: discard; ref: none; reason: Historical extraction probe results. -->
- `agent-sessions` width table (worst loaded per-case): no limiter 3,816 ms · width 4 **4,107 ms (worse)** · width 8 3,102 ms · width 16 one 10,005 ms timeout. Fixture copy measured 1.9 ms of a ~1,050 ms case. <!-- consolidation: discard; ref: none; reason: Historical concurrency and fixture-copy measurements. -->
- `cli-list-window`: 8 of 12 cases timed out under 5-lane load before its limiter + explicit 30 s per-case budget. <!-- consolidation: discard; ref: none; reason: Historical load failure evidence. -->
- Full-suite logs: `/tmp/acceptance-suite.log` (may be cleaned by the OS). <!-- consolidation: discard; ref: none; reason: Ephemeral log location. -->
- The strategic verdict behind all of this is summarised in [decision-answers-6.md](decision-answers-6.md). <!-- consolidation: discard; ref: none; reason: Supporting decision-input pointer rather than approval. -->

## Suggested skills

- `diagnosing-bugs` — for the load-starvation flakiness (next action 2); it fits a measurement-first loop on a flaky symptom. <!-- consolidation: discard; ref: none; reason: Historical agent skill recommendation. -->
- `implement` or `implement-spec` — for slice I steps 5–6 and resume-policy phase 4 once their specs are settled. <!-- consolidation: discard; ref: none; reason: Historical agent skill recommendation. -->
- `tdd` — if you fix the artifact-view contract test-first; its awaited condition is currently unsatisfiable by design. <!-- consolidation: discard; ref: none; reason: Historical skill recommendation and dated test diagnosis. -->
- `ponytail` — the repository's standing practice for minimal complete changes. <!-- consolidation: discard; ref: none; reason: Agent skill selection belongs to contributor workflow. -->
- `handoff` — when you next transition context; export a pointer, not a duplicate body. <!-- consolidation: discard; ref: none; reason: Agent handoff procedure rather than core contract. -->
