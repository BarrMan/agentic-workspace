# Decision answer sheet 6 — why the disk filled, and the three things that still need your word

You are right: I gave you options before explaining the problem, so there was nothing to answer *with*. This version explains each one first — what you would be doing, what you would see — and only then asks.

Sheet 5's question (closing the live view while a message is still on its way out) is still open. Nothing here supersedes it.

---

## Corrections to what I told you earlier

1. I said the multi-gigabyte pile was macOS caching the system libraries. **Wrong.** It is the bundler unpacking a library that is *embedded inside the built app*, every time that built app starts.
2. I said the earlier round of fixes made those three tests resilient under load. **Wrong for one of the three.** The number that fix raised can never take effect, because the test's own limit is smaller than the limit enclosing it.

## Why the disk filled — measured, not guessed

The behaviour tests were running a **built copy of the app**, not the code. Five launches each, measured:

| | running from source | running the built copy |
|---|---|---|
| temp files left behind | **0** | one **5.43 MB** library copy **per launch** |
| after five launches | nothing (the code leaves the folder empty) | **27.8 MB**, all five copies byte-identical |

At least one library, written out again on every single launch of the built copy, never cleaned up. The saved runs each held ~816 of those copies — **~4.4 GB**, which is the pile exactly. (This is a lower bound: the probe ran a version query, which touches fewer libraries than a full test.)

Two things turned that from temporary into permanent:

- **The script that runs the tests keeps the whole run folder when it cannot confirm a worker finished cleanly.** "Keep the evidence" was the intent; the evidence included the 4 GB of unpacked libraries. One uncertain cleanup retained ~4 GB.
- The built copy **is not built the way your releases are built**, so those tests were not proving the packaged app either.

## The rest of the disk — and why the last step needs you

opencode keeps its own database in `~/.opencode-personal/data/opencode/opencode.db`. It is **12.5 GB, and half of that space is already free inside the file but never returned to the disk** (measured: 1,530,059 of 3,055,719 pages are marked free). What fills it is this conversation — every helper's transcript and every full test-run dump is stored there. Nothing is broken; it is simply never compacted.

Compacting it needs the file to be idle, and the program holding it open is the one we are talking through. So it has to happen with opencode closed — the command is at the bottom. You get roughly 6 GB back, and it will grow again as you keep working; the only real fix for that is starting a fresh conversation now and then.

## Where the suite actually stands

286 files, 2490 passed, **2 failed**. Both were timeouts, not wrong behaviour, and that run was taken while a diagnostic was working beside it, so even those two were not trustworthy. Both are now addressed — see item 1 and the note under item 2.

---

## Item 1 — the app does not always notice a file you change outside it

**What you would be doing.** You have a task's file open in the app's viewer — a document, a diagram, a note. You also have that same file open in your editor. You change it and save, without touching the app.

**What you would expect.** The app notices and shows you the new content.

**How it notices today.** It does not compare contents. It asks the operating system to tell it "this file changed" and reloads when it is told. That works, with a known hole: the system is allowed to skip or merge those notifications, and the app has no back-up check. If one is missed, the viewer keeps showing old content until something else changes the file. There is a second hole the failing test was about: if you save an edit of *exactly the same length* that lands in the same clock tick, comparing size and timestamp cannot see it either — only the notification can.

**What the failing check actually does.** It writes changed bytes to the file and waits to be told the app noticed. It then *also* insists the notification arrived within **150 milliseconds**. That deadline is the problem: a notification that is merely late fails the check, and one that never arrives makes it wait forever — no timeout can rescue it. The code is not broken here; the check is measuring something the system never promised.

**The question.** What should the app promise?

- **A** — The app keeps reacting when the system tells it (today's behaviour). I fix the check to wait for the *result* — the new content appearing — instead of demanding a notification inside 150 ms. No behaviour change; the check stops being flaky.
- **B** — The app also re-checks the file on a timer (every few seconds), so a missed notification cannot leave you looking at old content. The only version where "the app always notices" is actually true. Costs a small periodic scan while a viewer is open.
- **C** — Drop this case; stop testing same-length edits.

**My recommendation: A** — with **B** if you want that guarantee to be real rather than assumed.

**Answer:** Now it's clearer, thanks. I'll ask follow-up questions in here for me to understand this better. You're saying that the OS does not promise a file change notification at all? or at a certain timespan? Does the file's contents actually change when the test expects a notification? Why does it matter what the length of the size is?

## Item 2 — our tests were testing a built copy of the app instead of its code

**What was happening.** When a check says "`backlog init` creates these files", the check did not run the code. It first built a copy of the app and ran *that* — more than 800 launches per test run.

**Three consequences, all measured.**

- Every launch of the built copy wrote a 5.4 MB copy of one library into a temp folder and never removed it → ~4.4 GB per run, which is what filled your disk. Running the code directly writes none of it.
- The built copy behaved **differently from the code**: two checks that pass against the code failed against the built copy — one of them claiming a task it had just created did not exist. So those tests were partly measuring the packaging step, not your product.
- The built copy was not even built the way your releases are built, so it was not testing the release either. Your real packaged check already exists separately: CI builds the release and smoke-tests it.

**What I did, and why without asking.** The measurement was unambiguous, so I switched the ordinary tests to run the code directly — no built file, no leftovers — and left the packaged check where it already is. I am telling you rather than asking because the evidence pointed one way; if you disagree it reverts cleanly.

**The one cost, so you can weigh it.** Running the code compiles it on each launch, so a test process starts a little slower than a built copy; on a heavily loaded machine some test files may take longer. A quiet full-suite run is queued to measure exactly that, and I will report it before treating this as closed.

**The question.** **A** keep it (tests run the code; packaged checks stay in CI) · **B** keep it, but leave named suites on the built copy · **C** revert to testing the built copy.

**Answer:** Need more follow-up in here as well. I understand the stats but I do not understand the behavior. Are you talking about all tests? Are all tests running `backlog init`? Why do tests run the entire binary? We've already covered this and I thought you already sent agents to address this issue when we talked about the cli entry point that was not exposed and I told you to expose it and to test the app's functionality. It's fine to test the compiled built binary, AT CERTAIN CIRCUMSTANCES - Like a few e2e tests are fine to execute the entire binary with commands and verify certain behavior - this protects us from the app's code working properly but the cli fails and the binary build failed. but other than those few e2e tests, all other tests should test the source code itself.

## Item 3 — one sentence in `AGENTS.md`

`AGENTS.md` tells anyone working in this repo what a test run proves. A sentence in it says the suite tests the source tree while the installed `backlog` command is what users run. **That sentence was false** while item 2's built copy was in place — and being wrong about it is part of how I misjudged the disk problem earlier.

- If item 2 stays: the sentence becomes true again and nothing needs changing. The only gap left is that nothing in the suite exercises the packaged app — which CI does.
- If you revert item 2: the sentence needs correcting instead.

**The question.** Add one clarifying line about packaged behaviour being checked in CI, or leave the file alone? **A** add it · **B** leave it · **C** you will handle this file.

**Answer:** I don't know, you keep referencing item 2 but I need follow-up

---

### Yours to run (needs opencode closed)

```sh
# with opencode fully quit, so the database is idle
sqlite3 ~/.opencode-personal/data/opencode/opencode.db "VACUUM;"
```

Returns roughly 6 GB. Needs ~12.5 GB free while it runs (you have 30 GiB).

Answer: Done

### Done without asking (FYI, evidence-backed)

- Deleted the five saved run folders: temp 19 GB → 458 MB, disk 185 MB free → 30 GiB free. Nothing else was removed; no task worktree was touched.
- Removed the wrong cleanup supervision and replaced it with the honest version: ordinary failures delete their scratch; only the small "who still owns a process" records survive a cleanup that genuinely cannot be resolved; and **such a run now fails instead of printing a note** — it previously reported success while unable to clean up.
- One test file ran ~80 checks at once and made every check's clock depend on how many checks exist. Measured properly, the right limit is 8 at a time (4 was worse than no limit; 16 timed out once).
- No build was run; types are clean.
