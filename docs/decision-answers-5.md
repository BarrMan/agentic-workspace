# Decision answer sheet 5 — the input-during-close question, with the code facts

Your question: why cancel instead of "keep sending until the buffer is empty"? I went and read the code rather than guess. Two things I had wrong in sheet 4 are corrected here, and one of them matters for your answer.

---

## 1. What actually triggers it (your guess was close, but not this)

**Not** switching between tasks or sessions. Switching away only unmounts the terminal widget in the app; it never touches the pipe to the agent's terminal. The three things that do:

- **closing the workspace / the app**
- **deleting the task**
- **a launch that gets aborted** (task deleted or selection changed while the agent is starting)

So the real scenario is: you type into the agent (or the app is sending a message you queued) and then **close the workspace** or **delete the task** while that input is still on its way.

## 2. What happens to your input today — nothing is drained

I said in sheet 4 that the app "cancels the input it had not yet written". That was incomplete:

- Input **not yet handed to the terminal** (still queued): dropped immediately.
- Input **already handed over** (a `send-keys` in progress): **killed mid-flight too**. The app then waits up to 2 seconds for that kill to settle, and reports `delivery is uncertain` because it cannot know whether the keystroke partly landed.

So the app does not drain at all today — it aborts both stages, and the 2 seconds is only how long it waits before admitting it doesn't know. Your suggestion is therefore not "restore draining"; it would be a new, non-aborting teardown path.

## 3. Your proposal, assessed honestly

"Keep sending until the buffer is empty" — two blockers:

1. **The buffer is usually already empty.** The app hands the whole queue to the terminal immediately, so the common case is input that is *in flight*, not queued. Draining wouldn't help it; the only thing that would is *letting the in-flight write finish instead of killing it*. That part of your idea is sound and cheap: in the ordinary case the write takes milliseconds.
2. **When the terminal link is saturated, waiting doesn't help.** The test's 32 occupied slots are an extreme case, but under real load waiting for the write to finish means waiting for slots that the closing action is itself holding. The wait expires and the message is lost anyway — just after a delay to closing. And if the agent's terminal is already gone when you close, there is nothing to deliver to at all.

So: waiting for the in-flight write to finish makes the message actually land in the ordinary case, and cannot save it in the pathological ones.

## 4. One thing that is today's bug, not a preference

The app barely tells you this happened — it surfaces as an error notice / a stderr line, not something you would reliably see. Losing a message you typed while being told almost nothing about it is worse than the loss itself.

## 5. The question

- **A (cheapest)** — keep the fast teardown and the uncertainty message, but make the failure *visible* where you would see it (a notice in the workspace, not a stderr line).
- **B (your idea, narrowly)** — let an already in-flight write finish before closing, bounded by the existing 2 seconds, then report if it did not make it. Ordinary case: your message lands, closing waits milliseconds. Saturated case: 2 seconds then today's outcome.
- **C (guarantee)** — hold the close until the input has actually landed, with a visible "sending…" state, and only report failure when the terminal is gone. The only version where the message is never silently lost; closing waits on the agent's terminal.

**Answer:** ____

---

### Done without asking (FYI, evidence-backed)

The one remaining red in the suite was this same area, in the test rather than the code: when this cancellation happens `detach()` *rejects* (wrapped as `AggregateError("Could not fully stop existing agent transport")`), which is the original deliberate behaviour the test once asserted — a later commit relaxed the assertion to "detach must not reject" without changing the code, and deleted the comment explaining it. I am restoring the test to the code's contract, not the reverse. If you pick **B** or **C**, that behaviour changes and this test changes with it — nothing is lost by fixing it now.
