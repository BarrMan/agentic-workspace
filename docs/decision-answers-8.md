---
consolidation:
  total: 91
  counts:
    exists: 5
    discard: 52
    integrate: 21
    unconfirmed: 13
  percentages:
    exists: 5.49%
    discard: 57.14%
    integrate: 23.08%
    unconfirmed: 14.29%
---
# Decision answer sheet 8

One file from here on: all decisions, questions and answers stay in this sheet rather than spreading across numbered files. Sheet 5's open question is carried in full at the bottom, so nothing is split.
<!-- consolidation: discard; ref: none; reason: Historical interview organization instruction rather than durable product or engineering behavior. -->

---

## Item 1 — the artifact-view check (your critique, answered)

You asked three things. Taking them in order.

### "Why would a file edit have the same mtime? Is this a non-existing scenario?"

It exists, though it is not the common case. An edit keeps the same size *and* the same modified time when a tool moves content around while deliberately preserving the file's metadata. Concrete cases on your machine:
<!-- consolidation: discard; ref: none; reason: External file-metadata scenario explanation is supporting research rather than a product requirement. -->

- Restoring a file from a backup or Time Machine snapshot, where the preserved timestamp is written back with the contents.
<!-- consolidation: discard; ref: none; reason: External backup example does not establish a repository feature commitment. -->
- Copying over an existing file with `cp -p`, `rsync -a`, or extracting a `tar -p` archive — all of these preserve size and mtime.
<!-- consolidation: unconfirmed; ref: none; reason: Commands may preserve timestamps but this statement does not establish unchanged size and the archive flag claim needs verification. -->
- A sync tool that writes new bytes, then resets the timestamp so the file "looks" unchanged to anything that only checks time.
<!-- consolidation: discard; ref: none; reason: External sync-tool example rather than an approved repository guarantee. -->
- Overwriting a file with content of the exact same byte length (e.g. changing one character in a fixed-width line).
<!-- consolidation: unconfirmed; ref: none; reason: Equal byte length alone does not imply preserved modification time so this example does not establish the combined scenario. -->

And it is not hypothetical for this product: the app already guarantees that an approval is invalidated when the file's content changes even though size and timestamp look identical — that guarantee is asserted, without any screen involved, in `src/file-system/artifact-approval-contract.test.ts:70` ("invalidates an external same-size edit even when its modification time is restored"). So the scenario the test builds is a real, deliberate product contract, not an invented one.
<!-- consolidation: discard; ref: docs/specs/configuration.md#modes-and-approval; reason: Artifact-content approval and hash-based invalidation are explicitly superseded by task-and-mode approval independent of file contents. -->

### "If it's e2e, expect the end result; if it's unit, why are you looking at screen renders?"

You have put your finger on the actual defect: **the test is at the wrong level, and it mixes two.**
<!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Historical test diagnosis rather than an independent permanent rule. -->

- It is not an e2e test. It never launches the CLI or a process; it mounts the view in an in-process renderer. By your own definition (a few basic flows through the compiled binary), this is an **integration** test.
<!-- consolidation: discard; ref: none; reason: Historical classification of one renderer suite does not establish that all e2e tests must use a compiled binary. -->
- Being an integration test, it should assert the **end result** a user would see — after a file changes on disk, the open viewer shows the new content — and wait for that result with a generous budget.
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Accepted render integration coverage asserts visible refreshed content with a bounded result wait rather than watcher timing. -->
<!-- consolidation: integrate; ref: docs/specs/tasks.md#task-artifacts; reason: Accepted open-view external-edit refresh behavior is not explicit in core. -->
- Instead it *also* asserts a **low-level side effect**: that a watcher notification arrived inside a 150 ms window (`artifact-view-live-refresh-contract.test.ts:106`). That is a unit-level fact dressed up as a render test, and 150 ms is a deadline the OS never promised — which is exactly why it flakes.
<!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Historical offending assertion and flake attribution are evidence motivating the approved testing-level rule. -->

The low-level guarantee ("a same-size, same-mtime content change is still detected") is already covered, at the right level, by the repository contract test above — no rendering. So the render test does not need to re-prove it.
<!-- consolidation: discard; ref: docs/specs/configuration.md#modes-and-approval; reason: Specific artifact-approval guarantee used as evidence is superseded by content-independent mode approval. -->
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Accepted principle is to keep low-level detection assertions separate from render-level end-result coverage. -->

### Corrected shape (my recommendation, now aligned to your rules)

- **Render/integration test** — keep, but assert only the end result: external edit → the open viewer shows the new content, waiting for the content to appear (no 150 ms deadline, no notification-counter assertions).
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Accepted end-result-only render coverage is more specific than core's current test guidance. -->
- **Unit coverage for detection** — keep it where it already is (`artifact-approval-contract.test.ts`), and strengthen it there if any hole remains; never through screen renders.
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Accepted test-level separation puts detailed detection checks below the rendering boundary. -->
<!-- consolidation: discard; ref: docs/specs/configuration.md#modes-and-approval; reason: Retention of the particular artifact-hash approval test is superseded by removal of content-based approval. -->

This removes the flakiness without weakening real coverage, and stops an integration test from asserting an OS side-effect.
<!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Predicted elimination of flakiness without coverage loss requires verification and is not proved by the recommendation. -->

**Choice:**
- **A′ (recommended)** — re-level as above: render test asserts the end result only; the same-size/same-mtime detection stays a unit contract.
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Accepted test-layer separation is absent from core. -->
<!-- consolidation: discard; ref: docs/specs/configuration.md#modes-and-approval; reason: Old content-hash approval semantics do not survive merely because their test was assigned a lower level. -->
- **B** — A′, *and* add the periodic re-check to the app so "the app always notices" is literally true (a real behaviour change, separate decision; costs a small periodic scan while a viewer is open).
<!-- consolidation: discard; ref: docs/specs/tasks.md#task-artifacts; reason: Owner selects A rather than approving periodic polling or an always-notices guarantee. -->
- **C** — delete the case entirely (loses the cheap end-result check; not recommended).
<!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Owner approves retaining visible-result coverage instead. -->

**Your answer:** ____
A
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Explicit approval of render end-result assertions and separate low-level detection coverage without adding periodic refresh. -->
---

## Item 2 — tests and the binary

You chose **A**: convert the app-logic CLI suites to the in-process entry, keep the process-boundary suites spawning, keep a small compiled-binary e2e check.
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: In-process logic tests versus genuine process-boundary spawning is an accepted distinction missing from core. -->
<!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Small binary check approval conflicts with the later assistant-only assertion that no local binary suite is needed. -->

You also asked @oracle to examine the suites we *assumed* must stay spawned, to test that assumption and to say whether any are not needed at all. That analysis is running now over these thirteen suites:
<!-- consolidation: discard; ref: none; reason: Historical review dispatch status. -->

`cli-pipe-output`, `mcp-stdio-exit`, `cli-json-watch`, `cli-init-input`, `cli-init-cursor-pty`, `tui-interactive-editor-handoff`, `opentui-settings-persistence.integration`, `opentui-settings-independent-validation`, `opentui-mode-startup-contract`, `bun-options`, `cli-launcher`, `agent-sessions`, `config-watcher`.
<!-- consolidation: discard; ref: none; reason: Historical bounded source-review inventory rather than independent proposed interfaces. -->

For each it returns one verdict — **must-stay-spawned** (the assertion needs a real pipe/signal/PTY/exit-code/process-group/packaging artifact), **could-be-in-process**, or **not-needed** (already covered elsewhere, or asserts nothing the product guarantees). Results will be appended below, then we execute the conversion.
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Accepted conversion assesses the actual boundary an assertion needs rather than assuming every CLI case must spawn. -->
<!-- consolidation: discard; ref: none; reason: Review-output format and execution sequence are historical workflow details. -->

**Your answer:** _A (given)_
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Reaffirms ordinary CLI logic conversion to the in-process entry. -->
<!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Repeated A does not resolve the later local binary-check versus CI-only conflict. -->

### Oracle findings — the "must stay spawned" list was too broad

The key correction: the real boundary is the individual **test case**, not the whole file. A file counts as "must-stay-spawned" if even one useful case needs a real process — but its other cases can still move in-process. And "already runs in-process" (calling the app service directly) must **not** be replaced by `runCli`: routing those through the CLI adds Commander overhead for no extra coverage.
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Approved conversion evaluates process needs per test case rather than per suite. -->
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Accepted conversion preserves direct service tests instead of adding needless CLI traversal. -->

| Suite | Verdict | Why |
| --- | --- | --- |
| `cli-pipe-output` | must-stay-spawned | A delayed reader compares complete pipe bytes against file output after 6 s — real stdout buffering through process end. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Historical case-level boundary evidence belongs with the conversion ledger rather than a permanent suite inventory. --> |
| `mcp-stdio-exit` | must-stay-spawned | Closing the real stdin pipe must produce natural exit code 0 / no signal, plus continued SDK stdio. <!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Existing stdio case evidence does not approve MCP retention and is historical conversion inventory. --> |
| `cli-json-watch` | must-stay-spawned | SIGTERM while stdout is blocked, and survival/termination versus a killed parent, need real pipes and process ancestry. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Historical real-boundary case inventory supports conversion without fixing suite structure in core. --> |
| `cli-init-input` | **could-be-in-process** | It asserts validation messages, status and files — not EOF-on-real-stdin handling. Loses only proof of real process termination with fd 0 closed. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Approved case-conversion inventory belongs in execution tracking rather than durable core. --> |
| `cli-init-cursor-pty` | **could-be-in-process** | It sends no interactive input at all. Keep its "no editor opened" assertion. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Case-specific conversion finding is not a permanent suite placement rule. --> <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#product-surfaces; reason: Continued applicability of the no-editor assertion depends on the approved setup behavior and is not fully specified here. --> |
| `tui-interactive-editor-handoff` | must-stay-spawned | The live-refresh case drives the real interactive board over a PTY. (Its external-editor case is stale — below.) <!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Historical review distinguishes two cases and does not prescribe a permanent suite. --> |
| `opentui-settings-persistence.integration` | must-stay-spawned | The final case sends escape-encoded keys through a real PTY and checks persistence + reopened rendering. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Historical PTY-boundary evidence for the approved conversion plan. --> |
| `opentui-settings-independent-validation` | must-stay-spawned | Its opt-in case exercises real bracketed paste, mouse and keyboard decoding. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Historical actual-terminal assertion inventory rather than permanent test topology. --> |
| `opentui-mode-startup-contract` | **could-be-in-process** | The spawned cases only assert rejection diagnostics, nonzero status and an unchanged filesystem — no terminal is opened. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Historical approved conversion targets do not imply verified completion. --> |
| `bun-options` | must-stay-spawned | The env must exist *before* the Bun runtime starts; it cannot be set inside an already-running test process. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Runtime-startup boundary evidence belongs with this test rather than a fixed core suite list. --> |
| `cli-launcher` | must-stay-spawned | Executes the published Node launcher: package resolution, argument forwarding, real child exit status. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Historical packaging-case inventory is not proof of current launcher coverage. --> |
| `agent-sessions` | must-stay-spawned | Only its opt-in real-tmux case forces this; the ordinary cases already call the service in-process with a fake `respawn()`. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Historical per-case process distinction supports conversion without fixing old service APIs. --> |
| `config-watcher` | must-stay-spawned | Proves an unreferenced polling watcher lets the process exit (covers `pollWatcher.unref()`). <!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Historical natural-exit test inventory rather than a permanent watcher implementation contract. --> |

Corrections to things we had assumed were covered:

- `cli-pipe-output` — the `SIGKILL` there is cleanup, not asserted behaviour; there is no general stdout/stderr-separation-under-load test.
<!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Historical correction of claimed test coverage is not present-day certification. -->
- `mcp-stdio-exit` — there is **no** signal→exit-code test; the assertion is stdin-closure → exit 0 / no signal.
<!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Historical test-coverage correction does not approve an MCP contract. -->
- `cli-launcher` — Unix signal mapping is tested as a helper function, not by killing a real process.
<!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Historical evidence-level correction rather than current runtime proof. -->
- `agent-sessions` — the width-8 limiter surrounds in-process service cases, not eight concurrent source-CLI launches.
<!-- consolidation: discard; ref: none; reason: Historical concurrency-benchmark correction. -->

A stale case found during the read:

- `tui-interactive-editor-handoff.test.ts` still expects `E` to launch an **external** editor, but today's board opens an **internal** task form (`workspace-controller.ts:2599`). That one case and its editor-only helper are obsolete. Its live-refresh sibling is still valid and still needs a PTY.
<!-- consolidation: discard; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Owner approves deleting this obsolete case below and exact helper inventory belongs in execution tracking. -->
<!-- consolidation: unconfirmed; ref: docs/screens/board.md#states-and-focus; reason: Board contract explicitly treats source-observed keybindings as candidates and does not approve this exact E interaction. -->

### The conversion plan (oracle's recommendation)

1. **Convert to serial `runCli` calls:** `cli-init-input`; `cli-init-cursor-pty` (keep its no-editor assertion); the two spawned rejection cases in `opentui-mode-startup-contract`; and json-watch's one-shot comparison + invalid-option cases (leave its watch processes spawned).
<!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Approved bounded conversion target list belongs in the execution ledger and is not a completion claim. -->
2. **Keep as real process boundaries:** the spawned list above — delayed-pipe draining, MCP stdio lifecycle, watch signal/parent lifecycle, runtime startup env, Node launcher, real terminal interaction, opt-in tmux, watcher natural-exit.
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Accepted rule retains actual pipe signal terminal startup packaging and natural-exit assertions at their real process boundaries. -->
3. **Delete:** only the obsolete external-editor handoff case and its helper. Oracle found no whole suite worth deleting.
<!-- consolidation: discard; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Approved specific test deletion is historical execution work rather than a permanent feature or suite commitment. -->
4. **Serialize** `runCli` calls inside a converted suite — it temporarily mutates cwd, console, stdout/stderr and exit status, so parallel calls within a suite would collide.
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Accepted serialization safety gate for process-global mutations during in-process CLI tests is missing from core. -->

This is in addition to the main item-2 win: the ~55 **app-logic** CLI suites (the `$`-spawning bulk — `cli-refs-docs`, `cli-init-create`, `cli-draft-edit`, `config-commands`, `cli-task-list`, `cli-doc-decision-board`, …) move to in-process `runCli`; only the process-boundary cases stay spawned.
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Accepted in-process app-logic and case-specific spawning split is not explicit in core. -->
<!-- consolidation: discard; ref: none; reason: Historical tranche count and suite names are mutable execution inventory. -->

### Local compiled-binary e2e tests

Oracle's answer: **not mandatory** in the ordinary local suite, given CI builds and smoke-tests the release. Real pipes, signals, PTYs, tmux and event-loop exit are all testable with source processes; "must spawn" does not mean "must compile". One caveat — the gated case in `opentui-settings-independent-validation.test.ts` currently resolves and runs the *installed* `backlog` binary; prefer source there. Risk of having **zero** local binary tests: bundling/embedded-asset/native-library and compiled-runtime differences go uncaught locally, and CI's basic release smoke is not automatically compiled-TUI coverage. The rebuild-and-verify step before a runnable handoff stays essential regardless.
<!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: CI-only packaging recommendation is not explicitly reconciled with the owner's earlier choice of a small local binary check. -->
<!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Source-based behavior and process checks are distinct from compiled packaging or runtime checks. -->
<!-- consolidation: discard; ref: none; reason: Exact gated-suite repointing is historical conversion work. -->
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Preserve the evidence limit that source-process checks and basic release smoke do not establish compiled-TUI or embedded-native-runtime coverage. -->
<!-- consolidation: exists; ref: docs/CONVENTIONS.md#validation; reason: Integrator rebuild and source-freshness verification remain required before installed-CLI handoff. -->

**Answer**: I approve the conversion plan (oracle's recommendation) + regarding "Local compiled-binary e2e tests" is there any action item for this? Or this stays like that?
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Explicit approval covers per-case conversion direct-service preservation and serial in-process CLI calls. -->
<!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Owner asks for the binary-test action disposition rather than explicitly approving removal of the earlier local-check requirement. -->

---

## Item 3 — the one sentence in `AGENTS.md`

Deferred at your request. I will raise it again once everything else is settled.
<!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#validation; reason: Exact packaged-coverage wording in AGENTS remains deferred. -->

---

## Sheet 5 (carried over) — input you type while closing a workspace/task

The scenario: you type into an agent (or a queued message is on its way), then **close the workspace** or **delete the task** while that input has not yet landed. Today the app does not drain anything — it aborts both the queued input and an in-flight write, waits up to 2 s for the kill to settle, and reports "delivery is uncertain" as a stderr/error line you would rarely see.
<!-- consolidation: discard; ref: docs/specs/sessions.md#live-terminal-and-client-lifetime; reason: Historical immediate-abort baseline is superseded by the explicit B decision below. -->
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#runningexecution-interaction-contract; reason: Remaining queued-input disposition and failure-visibility details are not settled by approval to finish already in-flight writes. -->

- **A (cheapest)** — keep the fast teardown, but surface the failure where you would actually see it (a notice in the workspace, not stderr).
<!-- consolidation: discard; ref: docs/specs/sessions.md#live-terminal-and-client-lifetime; reason: Owner selects bounded in-flight completion instead of abort-only teardown. -->
- **B (your idea, narrowly)** — let an already in-flight write finish, bounded by the existing 2 s, then report if it did not make it. Ordinary case: the message lands, closing waits milliseconds.
<!-- consolidation: integrate; ref: docs/specs/sessions.md#live-terminal-and-client-lifetime; reason: Explicitly accepted up-to-two-second in-flight completion and reporting non-delivery are absent from core. -->
<!-- consolidation: discard; ref: none; reason: Millisecond ordinary-case timing is explanatory estimation rather than a latency guarantee. -->
- **C (guarantee)** — hold the close until the input has actually landed, with a visible "sending…" state; report failure only when the terminal is gone. The only version where a message is never silently lost.
<!-- consolidation: discard; ref: docs/specs/sessions.md#live-terminal-and-client-lifetime; reason: Unlimited waiting and guaranteed delivery are rejected by the explicit bounded option B. -->

**Your answer:** ____
B
<!-- consolidation: integrate; ref: docs/specs/sessions.md#live-terminal-and-client-lifetime; reason: Owner explicitly approves two-second in-flight drain before close or deletion and reporting failed delivery. -->
---

## Decisions recorded

- **Item 1 — A′.** Re-level the render test to assert the end result only; keep the same-size/same-mtime detection at the unit level (no periodic re-check in the app).
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Accepted separation of render results and low-level detection needs a core testing rule. -->
<!-- consolidation: discard; ref: docs/specs/configuration.md#modes-and-approval; reason: Any retained artifact-hash approval semantics are superseded by content-independent task-and-mode approval. -->
<!-- consolidation: discard; ref: docs/specs/tasks.md#task-artifacts; reason: No-periodic-recheck records the rejected alternative rather than a permanent prohibition on future approved refresh designs. -->
- **Item 2 — conversion plan approved**, including deleting the stale external-editor handoff case.
<!-- consolidation: discard; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Specific approved conversion and obsolete-case deletion status belongs in execution tracking. -->
- **Sheet 5 — B.** Let an already in-flight write finish, bounded by the existing 2 s, then report if it did not make it.
<!-- consolidation: integrate; ref: docs/specs/sessions.md#live-terminal-and-client-lifetime; reason: Accepted bounded-drain rule remains missing from core. -->
- **Item 3** — deferred; raised again once the rest has landed.
<!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#validation; reason: Proposed AGENTS packaging-coverage sentence remains undecided. -->

## Local compiled-binary e2e — the action item

Oracle's answer was "not mandatory", and your item-2 choice of A said "keep a small compiled-binary e2e check". Reconciling the two: **no new local binary suite is needed.** CI already builds the release and smoke-tests it, and every real process boundary (pipes, signals, PTYs, exit codes, tmux) is exercisable from a source process. A local binary suite is the thing that historically caused the disk pile and the staleness trap (the installed `backlog` can lag `src`).
<!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Assistant reconciliation does not demonstrate owner approval to replace the earlier local binary-check choice with CI-only coverage. -->
<!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Source process tests and compiled packaging tests establish different evidence. -->
<!-- consolidation: discard; ref: none; reason: Historical extraction and staleness incident does not prove all local binary suites are unsuitable. -->

The one concrete action: the opt-in case in `opentui-settings-independent-validation.test.ts` currently resolves and runs the *installed* `backlog` binary — point it at the source entry instead, so a stale local binary cannot masquerade as a pass. That is folded into the conversion work below.
<!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Specific suite repointing is conversion-ledger work rather than a permanent file-level contract. -->

The rebuild-and-verify-before-handoff step (AGENTS.md) is unchanged and remains the guard for the installed CLI.
<!-- consolidation: exists; ref: docs/CONVENTIONS.md#validation; reason: Core delegates the mandatory integrator build and freshness verification to AGENTS. -->

## Dispatched

Four bounded lanes, disjoint files, each verifying only the files it touched (no full suite, no build):
<!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Iteration runs affected tests and reserves compiled checks for runtime or packaging evidence. -->
<!-- consolidation: discard; ref: none; reason: Four-lane dispatch topology is historical execution scheduling. -->

1. **Item 1** — re-level `src/test/artifact-view-live-refresh-contract.test.ts`.
<!-- consolidation: discard; ref: none; reason: Historical bounded test-edit assignment does not prove completion. -->
2. **Sheet 5** — implement B in `src/agent-workspace/live/existing-agent-host.ts` and update its two contract tests.
<!-- consolidation: discard; ref: none; reason: Historical bounded implementation assignment does not prove completion of the accepted drain rule. -->
3. **Item 2, oracle set** — convert `cli-init-input`, `cli-init-cursor-pty`, the two `opentui-mode-startup-contract` rejection cases, and json-watch's one-shot/invalid-option cases; delete the stale editor case; repoint the gated installed-binary case to source.
<!-- consolidation: discard; ref: none; reason: Historical assigned conversion tranche remains execution evidence rather than a durable suite inventory. -->
4. **Item 2, app-logic tranche 1** — convert `cli-draft-edit`, `cli-refs-docs`, `cli-init-create`, `cli-doc-decision-board`, `config-commands`, `cli-task-list` to in-process `runCli`. Further tranches follow once this pattern is proven.
<!-- consolidation: discard; ref: none; reason: Historical tranche and future scheduling do not establish completion or retain obsolete draft behavior. -->
