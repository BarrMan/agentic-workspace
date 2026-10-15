# Decision answer sheet 8

One file from here on: all decisions, questions and answers stay in this sheet rather than spreading across numbered files. Sheet 5's open question is carried in full at the bottom, so nothing is split.

---

## Item 1 — the artifact-view check (your critique, answered)

You asked three things. Taking them in order.

### "Why would a file edit have the same mtime? Is this a non-existing scenario?"

It exists, though it is not the common case. An edit keeps the same size *and* the same modified time when a tool moves content around while deliberately preserving the file's metadata. Concrete cases on your machine:

- Restoring a file from a backup or Time Machine snapshot, where the preserved timestamp is written back with the contents.
- Copying over an existing file with `cp -p`, `rsync -a`, or extracting a `tar -p` archive — all of these preserve size and mtime.
- A sync tool that writes new bytes, then resets the timestamp so the file "looks" unchanged to anything that only checks time.
- Overwriting a file with content of the exact same byte length (e.g. changing one character in a fixed-width line).

And it is not hypothetical for this product: the app already guarantees that an approval is invalidated when the file's content changes even though size and timestamp look identical — that guarantee is asserted, without any screen involved, in `src/file-system/artifact-approval-contract.test.ts:70` ("invalidates an external same-size edit even when its modification time is restored"). So the scenario the test builds is a real, deliberate product contract, not an invented one.

### "If it's e2e, expect the end result; if it's unit, why are you looking at screen renders?"

You have put your finger on the actual defect: **the test is at the wrong level, and it mixes two.**

- It is not an e2e test. It never launches the CLI or a process; it mounts the view in an in-process renderer. By your own definition (a few basic flows through the compiled binary), this is an **integration** test.
- Being an integration test, it should assert the **end result** a user would see — after a file changes on disk, the open viewer shows the new content — and wait for that result with a generous budget.
- Instead it *also* asserts a **low-level side effect**: that a watcher notification arrived inside a 150 ms window (`artifact-view-live-refresh-contract.test.ts:106`). That is a unit-level fact dressed up as a render test, and 150 ms is a deadline the OS never promised — which is exactly why it flakes.

The low-level guarantee ("a same-size, same-mtime content change is still detected") is already covered, at the right level, by the repository contract test above — no rendering. So the render test does not need to re-prove it.

### Corrected shape (my recommendation, now aligned to your rules)

- **Render/integration test** — keep, but assert only the end result: external edit → the open viewer shows the new content, waiting for the content to appear (no 150 ms deadline, no notification-counter assertions).
- **Unit coverage for detection** — keep it where it already is (`artifact-approval-contract.test.ts`), and strengthen it there if any hole remains; never through screen renders.

This removes the flakiness without weakening real coverage, and stops an integration test from asserting an OS side-effect.

**Choice:**
- **A′ (recommended)** — re-level as above: render test asserts the end result only; the same-size/same-mtime detection stays a unit contract.
- **B** — A′, *and* add the periodic re-check to the app so "the app always notices" is literally true (a real behaviour change, separate decision; costs a small periodic scan while a viewer is open).
- **C** — delete the case entirely (loses the cheap end-result check; not recommended).

**Your answer:** ____
A
---

## Item 2 — tests and the binary

You chose **A**: convert the app-logic CLI suites to the in-process entry, keep the process-boundary suites spawning, keep a small compiled-binary e2e check.

You also asked @oracle to examine the suites we *assumed* must stay spawned, to test that assumption and to say whether any are not needed at all. That analysis is running now over these thirteen suites:

`cli-pipe-output`, `mcp-stdio-exit`, `cli-json-watch`, `cli-init-input`, `cli-init-cursor-pty`, `tui-interactive-editor-handoff`, `opentui-settings-persistence.integration`, `opentui-settings-independent-validation`, `opentui-mode-startup-contract`, `bun-options`, `cli-launcher`, `agent-sessions`, `config-watcher`.

For each it returns one verdict — **must-stay-spawned** (the assertion needs a real pipe/signal/PTY/exit-code/process-group/packaging artifact), **could-be-in-process**, or **not-needed** (already covered elsewhere, or asserts nothing the product guarantees). Results will be appended below, then we execute the conversion.

**Your answer:** _A (given)_

### Oracle findings — the "must stay spawned" list was too broad

The key correction: the real boundary is the individual **test case**, not the whole file. A file counts as "must-stay-spawned" if even one useful case needs a real process — but its other cases can still move in-process. And "already runs in-process" (calling the app service directly) must **not** be replaced by `runCli`: routing those through the CLI adds Commander overhead for no extra coverage.

| Suite | Verdict | Why |
| --- | --- | --- |
| `cli-pipe-output` | must-stay-spawned | A delayed reader compares complete pipe bytes against file output after 6 s — real stdout buffering through process end. |
| `mcp-stdio-exit` | must-stay-spawned | Closing the real stdin pipe must produce natural exit code 0 / no signal, plus continued SDK stdio. |
| `cli-json-watch` | must-stay-spawned | SIGTERM while stdout is blocked, and survival/termination versus a killed parent, need real pipes and process ancestry. |
| `cli-init-input` | **could-be-in-process** | It asserts validation messages, status and files — not EOF-on-real-stdin handling. Loses only proof of real process termination with fd 0 closed. |
| `cli-init-cursor-pty` | **could-be-in-process** | It sends no interactive input at all. Keep its "no editor opened" assertion. |
| `tui-interactive-editor-handoff` | must-stay-spawned | The live-refresh case drives the real interactive board over a PTY. (Its external-editor case is stale — below.) |
| `opentui-settings-persistence.integration` | must-stay-spawned | The final case sends escape-encoded keys through a real PTY and checks persistence + reopened rendering. |
| `opentui-settings-independent-validation` | must-stay-spawned | Its opt-in case exercises real bracketed paste, mouse and keyboard decoding. |
| `opentui-mode-startup-contract` | **could-be-in-process** | The spawned cases only assert rejection diagnostics, nonzero status and an unchanged filesystem — no terminal is opened. |
| `bun-options` | must-stay-spawned | The env must exist *before* the Bun runtime starts; it cannot be set inside an already-running test process. |
| `cli-launcher` | must-stay-spawned | Executes the published Node launcher: package resolution, argument forwarding, real child exit status. |
| `agent-sessions` | must-stay-spawned | Only its opt-in real-tmux case forces this; the ordinary cases already call the service in-process with a fake `respawn()`. |
| `config-watcher` | must-stay-spawned | Proves an unreferenced polling watcher lets the process exit (covers `pollWatcher.unref()`). |

Corrections to things we had assumed were covered:

- `cli-pipe-output` — the `SIGKILL` there is cleanup, not asserted behaviour; there is no general stdout/stderr-separation-under-load test.
- `mcp-stdio-exit` — there is **no** signal→exit-code test; the assertion is stdin-closure → exit 0 / no signal.
- `cli-launcher` — Unix signal mapping is tested as a helper function, not by killing a real process.
- `agent-sessions` — the width-8 limiter surrounds in-process service cases, not eight concurrent source-CLI launches.

A stale case found during the read:

- `tui-interactive-editor-handoff.test.ts` still expects `E` to launch an **external** editor, but today's board opens an **internal** task form (`workspace-controller.ts:2599`). That one case and its editor-only helper are obsolete. Its live-refresh sibling is still valid and still needs a PTY.

### The conversion plan (oracle's recommendation)

1. **Convert to serial `runCli` calls:** `cli-init-input`; `cli-init-cursor-pty` (keep its no-editor assertion); the two spawned rejection cases in `opentui-mode-startup-contract`; and json-watch's one-shot comparison + invalid-option cases (leave its watch processes spawned).
2. **Keep as real process boundaries:** the spawned list above — delayed-pipe draining, MCP stdio lifecycle, watch signal/parent lifecycle, runtime startup env, Node launcher, real terminal interaction, opt-in tmux, watcher natural-exit.
3. **Delete:** only the obsolete external-editor handoff case and its helper. Oracle found no whole suite worth deleting.
4. **Serialize** `runCli` calls inside a converted suite — it temporarily mutates cwd, console, stdout/stderr and exit status, so parallel calls within a suite would collide.

This is in addition to the main item-2 win: the ~55 **app-logic** CLI suites (the `$`-spawning bulk — `cli-refs-docs`, `cli-init-create`, `cli-draft-edit`, `config-commands`, `cli-task-list`, `cli-doc-decision-board`, …) move to in-process `runCli`; only the process-boundary cases stay spawned.

### Local compiled-binary e2e tests

Oracle's answer: **not mandatory** in the ordinary local suite, given CI builds and smoke-tests the release. Real pipes, signals, PTYs, tmux and event-loop exit are all testable with source processes; "must spawn" does not mean "must compile". One caveat — the gated case in `opentui-settings-independent-validation.test.ts` currently resolves and runs the *installed* `backlog` binary; prefer source there. Risk of having **zero** local binary tests: bundling/embedded-asset/native-library and compiled-runtime differences go uncaught locally, and CI's basic release smoke is not automatically compiled-TUI coverage. The rebuild-and-verify step before a runnable handoff stays essential regardless.

**Answer**: I approve the conversion plan (oracle's recommendation) + regarding "Local compiled-binary e2e tests" is there any action item for this? Or this stays like that?

---

## Item 3 — the one sentence in `AGENTS.md`

Deferred at your request. I will raise it again once everything else is settled.

---

## Sheet 5 (carried over) — input you type while closing a workspace/task

The scenario: you type into an agent (or a queued message is on its way), then **close the workspace** or **delete the task** while that input has not yet landed. Today the app does not drain anything — it aborts both the queued input and an in-flight write, waits up to 2 s for the kill to settle, and reports "delivery is uncertain" as a stderr/error line you would rarely see.

- **A (cheapest)** — keep the fast teardown, but surface the failure where you would actually see it (a notice in the workspace, not stderr).
- **B (your idea, narrowly)** — let an already in-flight write finish, bounded by the existing 2 s, then report if it did not make it. Ordinary case: the message lands, closing waits milliseconds.
- **C (guarantee)** — hold the close until the input has actually landed, with a visible "sending…" state; report failure only when the terminal is gone. The only version where a message is never silently lost.

**Your answer:** ____
B
---

## Decisions recorded

- **Item 1 — A′.** Re-level the render test to assert the end result only; keep the same-size/same-mtime detection at the unit level (no periodic re-check in the app).
- **Item 2 — conversion plan approved**, including deleting the stale external-editor handoff case.
- **Sheet 5 — B.** Let an already in-flight write finish, bounded by the existing 2 s, then report if it did not make it.
- **Item 3** — deferred; raised again once the rest has landed.

## Local compiled-binary e2e — the action item

Oracle's answer was "not mandatory", and your item-2 choice of A said "keep a small compiled-binary e2e check". Reconciling the two: **no new local binary suite is needed.** CI already builds the release and smoke-tests it, and every real process boundary (pipes, signals, PTYs, exit codes, tmux) is exercisable from a source process. A local binary suite is the thing that historically caused the disk pile and the staleness trap (the installed `backlog` can lag `src`).

The one concrete action: the opt-in case in `opentui-settings-independent-validation.test.ts` currently resolves and runs the *installed* `backlog` binary — point it at the source entry instead, so a stale local binary cannot masquerade as a pass. That is folded into the conversion work below.

The rebuild-and-verify-before-handoff step (AGENTS.md) is unchanged and remains the guard for the installed CLI.

## Dispatched

Four bounded lanes, disjoint files, each verifying only the files it touched (no full suite, no build):

1. **Item 1** — re-level `src/test/artifact-view-live-refresh-contract.test.ts`.
2. **Sheet 5** — implement B in `src/agent-workspace/live/existing-agent-host.ts` and update its two contract tests.
3. **Item 2, oracle set** — convert `cli-init-input`, `cli-init-cursor-pty`, the two `opentui-mode-startup-contract` rejection cases, and json-watch's one-shot/invalid-option cases; delete the stale editor case; repoint the gated installed-binary case to source.
4. **Item 2, app-logic tranche 1** — convert `cli-draft-edit`, `cli-refs-docs`, `cli-init-create`, `cli-doc-decision-board`, `config-commands`, `cli-task-list` to in-process `runCli`. Further tranches follow once this pattern is proven.
