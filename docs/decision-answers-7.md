# Decision answer sheet 7 — your follow-ups, answered with the code open

You answered sheet 6 with questions instead of choices, which was fair — sheet 6 explained the problems but not the mechanics you were asking about. This sheet answers each question from the code, then puts the same three choices back now that the mechanics are settled. Sheet 5 (the input-during-close question) is still open and nothing here changes it.

Nothing in this sheet required a command to be run; it is read from the source and from the measurements already recorded.

---

## Item 1 — "the app does not always notice a file you change outside it"

### Your question: does the OS not promise a notification *at all*, or not within a certain time?

Both, and it is worth separating them.

Your machine can tell a program "this file changed". The mechanism the app uses is the operating system's own file watching (`fs.watch`, registered at `src/utils/task-watcher.ts:342`). The important part is what that mechanism promises: **it is best-effort, not a contract**. The system is allowed to merge several rapid changes into a single notification, to delay one, and in the limit to drop one. There is **no promised latency** — nothing says "you will be told within N milliseconds" — and no promise of exactly one event per change. So the honest answer to "does it promise a notification" is: it usually delivers one, but it never promised to, and it never promised when.

That is why the check in this test is unfair at one point: it demands the notification arrive within **150 ms** (`artifact-view-live-refresh-contract.test.ts:106`), a timespan the system never committed to. A notification that is merely late fails the check.

### Your question: does the file's contents actually change when the test expects a notification?

Yes, genuinely. At `:85` the test writes `draft v2\n` over the file that held `draft v1\n`. The bytes are different. Nothing here is faked.

But the test also does one extra thing at `:86`: it resets the file's **modified time** back to whatever it was before the write. So after the edit, the file's *contents* differ, while its *timestamp* says "untouched".

### Your question: why does the length of the size matter?

Size and length are the same thing here — the number of bytes. `draft v1\n` and `draft v2\n` are both **9 bytes**. So the test has arranged a change where:

- the byte length is identical, and
- the modification time is identical (it reset it).

Those two are the cheap, obvious ways any program could notice "this changed" without being told. The test deliberately removes both, so the *only* thing left that can reveal the change is the OS notification itself. That is what the check's own name means — "same-size/same-mtime bytes". It is testing the hardest case on purpose, not a normal edit.

One correction to how sheet 6 phrased this: the task watcher itself does **not** judge changes by size or timestamp — for task files it re-reads the content and hashes it (`task-watcher.ts`, content signature). The size/time comparison lives in a *different* feature, the `watch-json` command (`src/commands/watch-json.ts:37`), which is why that command includes the change-time (`ctime`) in its comparison — a same-size, timestamp-preserved edit is exactly what a size+mtime check misses. The point stands for this test: the app only re-reads when the OS tells it to, so the notification is the single trigger, and the same-size/same-mtime trick guarantees no shortcut can substitute for it.

### What the failing check actually does

Two different things, and only one is broken:

- The wait that decides "did the app notice" is a **content** wait (`:87`): it polls the rendered screen every 20 ms for up to its platform-scaled 15 s, looking for the new text to appear.
- A **separate** fixed window (`:106`) sleeps 150 ms and then insists the notification counter grew.

The 150 ms window is the one measuring something nobody promised. The content wait is reasonable in principle — but the suite's per-test limit is 10 s while that wait is 15 s, so a slow delivery can never finish inside the limit; it becomes a timeout instead of a pass. That is the "inert" repair: the bigger internal budget can never take effect because the smaller limit around it fires first.

### The choice, now that you can see it

- **A** — keep today's behaviour (the app reacts when the OS tells it); fix the check to wait for the *result* (new content on screen) instead of demanding a notification inside 150 ms. No behaviour change; the check stops being flaky.
- **B** — additionally have the app re-check the file on a timer (every few seconds) so a missed notification cannot leave you staring at old content. The only version where "the app always notices" is actually true. Cost: a small periodic check while a viewer is open.
- **C** — drop this case; stop testing same-size/same-mtime edits.

**Still my recommendation: A, plus B if you want the guarantee to be real rather than assumed.**

**Your answer:** First of all, this use-case is pretty absurd. Why would a file edit have the same mtime? What is this testing? A non-existing scenario? Second, I'll say this again since I already said that while anwering the tests and the binary - If this is an e2e test, then it's fine to wait a little longer until screen refreshes but please note that e2e tests are costly and should not test the whole app. They should test really basic flows and leave the detailed testing to the unit / integration / system tests. Third, if this is an e2e test, you can't expect a low level side-affect to occure, it's an e2e test and you need to expect the end result. If this is a unit test, then why are you looking at the screen renders? 

---

## Item 2 — tests and the binary

### Your question: are you talking about all tests?

No. There are **227 test files**. About **68** of them launch the CLI; the other **~159** are ordinary unit/logic tests that never start a process. Only the 68 are in scope for this question.

### Your question: are all tests running `backlog init`?

No. Only the `cli-init-*` suites exercise `init` (creating the workspace files). The other CLI suites run other commands — create, list, doc, draft, config, dependencies, and so on.

### Your question: why do tests run the entire binary?

Correction first, because it changes the answer: **today, no test runs the compiled binary.** That was true a few commits ago and it is exactly what caused the disk pile. Since `959079a0`, the spawning tests run the **source** entry point in a child process — `src/test/test-cli.ts:4-8` launches `[process.execPath, "src/cli/index.ts"]`. The built copy is gone, including as a CI test input (the "bundle CLI for integration tests" step was removed at the same time). On the compiled-binary question, the suite is already where you wanted it.

What remains, and what actually costs time, is different: most CLI suites still **start a child process for every single command** and transpile the source at each launch. That is a real process (so the CLI's argument parsing and wiring run end-to-end), but it is slow, and under 5-lane load it is what starves siblings into timeouts (`cli-draft-edit` is a victim of this, not a bug).

### Your question: we exposed the entry point — what happened?

It was exposed: `runCli(argv, { cwd, stdout, stderr })` is exported at `src/cli/register.ts:50`. But only **one** suite uses it in-process (`cli-guidance`, which went 16.1 s → 4.3 s). The other **67** CLI suites still spawn a child process. So the exposure landed; the conversion of the suite did not.

### Your ruling, and where we stand against it

You said: a few e2e tests executing the compiled binary are fine (they protect against "code works but the CLI or the build is broken"), and everything else should test the source itself.

- The compiled-binary protection **exists, but only in CI**: the release workflow builds the app and smoke-tests it. Nothing in the *local* suite runs the compiled binary today.
- The bulk of CLI suites can move to the in-process entry. The ones that genuinely need a real process boundary and must stay spawning: pipe capacity and SIGKILL (`cli-pipe-output`), stdio/signal→exit-code (`mcp-stdio-exit`), long-lived `--watch` streaming (`cli-json-watch`), closed stdin (`cli-init-input`), the PTY suites (`cli-init-cursor-pty`, `tui-interactive-editor-handoff`, the opentui PTY suites), the TUI startup (`opentui-mode-startup-contract`), `BUN_OPTIONS` (`bun-options`), packaged launcher behaviour (`cli-launcher`), agent host respawn (`agent-sessions`), and the config-watcher child (`config-watcher`).

### The choice, now that you can see it

The real decision is how far to take the split. My proposal, aligned to your ruling:

- **A** — convert the app-logic CLI suites to the in-process entry, keep the process-boundary suites spawning, and keep one or two compiled-binary e2e checks (either surface CI's existing smoke test locally or add a small one). Fastest suites, least starvation, and the "build/CLI wiring broke" protection is explicit.
- **B** — same, but leave a couple of named app-logic suites spawning as well (more confidence that the real command line works, for a little more time).
- **C** — leave it as it is: source-spawning everywhere, compiled-binary protection in CI only. (Sheet 6's item-2 change already stands; nothing reverts.)

**Still my recommendation: A.** **Your answer:** ____
I choose A of course. This is what should happen. Also, please send oracle to examine the "process-boundary suites" and see whether they must stay in the spawned process mechanism or we could have sufficient coverage if they also moved to in-process entries. And we might also conclude that those tests or some of them are not even needed.
---

## Item 3 — the one sentence in `AGENTS.md`

Now answerable. The sentence says the suite tests the source tree while the installed `backlog` command is what users run. With item 2 as it now stands, **that sentence is true again** — the built copy was removed. The only gap left is that the local suite does not exercise the packaged app; CI does.

So the question is narrow:

- **A** — add one line stating that packaged behaviour is checked in CI (keeps the claim precise about where the guarantee lives).
- **B** — leave the file alone.
- **C** — you will handle this file.

I have not touched `AGENTS.md` — it is part of your in-progress work, and I will not edit it without your word.

**Your answer:** ____
After we settle on everything else, remind me about this again and we'll decide on the correct approach.
---

## What I need from you

1. Item 1: **A**, **B**, **C** (or A+B).
2. Item 2: **A**, **B**, **C**.
3. Item 3: **A**, **B**, **C**.
4. Sheet 5: still open — A, B, or C on the input-during-close question. <--- Please use the same file for all decisions / questions / answers and do not spread these across files. So next file #8 should include #5 as well if needed
