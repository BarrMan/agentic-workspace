---
consolidation:
  total: 25
  counts:
    exists: 4
    discard: 11
    integrate: 3
    unconfirmed: 7
  percentages:
    exists: 16.00%
    discard: 44.00%
    integrate: 12.00%
    unconfirmed: 28.00%
---
# Decision answer sheet 5 — the input-during-close question, with the code facts

Your question: why cancel instead of "keep sending until the buffer is empty"? I went and read the code rather than guess. Two things I had wrong in sheet 4 are corrected here, and one of them matters for your answer.
<!-- consolidation: discard; ref: none; reason: Historical correction narrative introducing the evidence below. -->

---

## 1. What actually triggers it (your guess was close, but not this)

**Not** switching between tasks or sessions. Switching away only unmounts the terminal widget in the app; it never touches the pipe to the agent's terminal. The three things that do:
<!-- consolidation: exists; ref: docs/BLUEPRINT.md#launch-context-and-terminal-transport; reason: Frontend selection and attachment do not control agent lifetime. -->
<!-- consolidation: discard; ref: docs/architecture/application-boundaries.md#ui-controller-and-modules; reason: Never touching client transport on selection change conflicts with core's explicit navigation detach and preview update responsibilities. -->

- **closing the workspace / the app**
<!-- consolidation: exists; ref: docs/specs/sessions.md#live-terminal-and-client-lifetime; reason: Leaving the workspace detaches the client without stopping the execution. -->
- **deleting the task**
<!-- consolidation: exists; ref: docs/specs/tasks.md#task-deletion; reason: Task deletion explicitly terminates its agent before removing stored resources. -->
- **a launch that gets aborted** (task deleted or selection changed while the agent is starting)
<!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#creation-failure-and-recovery; reason: Critical failure cleanup is settled but selection change alone as an abort trigger is not approved. -->

So the real scenario is: you type into the agent (or the app is sending a message you queued) and then **close the workspace** or **delete the task** while that input is still on its way.
<!-- consolidation: integrate; ref: docs/specs/sessions.md#live-terminal-and-client-lifetime; reason: This is the close or deletion scope for the bounded in-flight drain accepted in sheet 8 and missing from core. -->

## 2. What happens to your input today — nothing is drained

I said in sheet 4 that the app "cancels the input it had not yet written". That was incomplete:
<!-- consolidation: discard; ref: none; reason: Historical explanation correction. -->

- Input **not yet handed to the terminal** (still queued): dropped immediately.
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#runningexecution-interaction-contract; reason: Historical queued-input loss is not approved by the later decision concerning already in-flight writes. -->
- Input **already handed over** (a `send-keys` in progress): **killed mid-flight too**. The app then waits up to 2 seconds for that kill to settle, and reports `delivery is uncertain` because it cannot know whether the keystroke partly landed.
<!-- consolidation: discard; ref: docs/specs/sessions.md#live-terminal-and-client-lifetime; reason: Immediate in-flight cancellation is superseded by sheet 8's explicit two-second drain decision. -->
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#runningexecution-interaction-contract; reason: Exact uncertainty reporting after the drain times out remains unspecified. -->

So the app does not drain at all today — it aborts both stages, and the 2 seconds is only how long it waits before admitting it doesn't know. Your suggestion is therefore not "restore draining"; it would be a new, non-aborting teardown path.
<!-- consolidation: discard; ref: docs/specs/sessions.md#live-terminal-and-client-lifetime; reason: Historical abort-only baseline is superseded by the accepted bounded-drain decision in sheet 8. -->

## 3. Your proposal, assessed honestly

"Keep sending until the buffer is empty" — two blockers:
<!-- consolidation: discard; ref: none; reason: Historical assessment introducing the separate findings below. -->

1. **The buffer is usually already empty.** The app hands the whole queue to the terminal immediately, so the common case is input that is *in flight*, not queued. Draining wouldn't help it; the only thing that would is *letting the in-flight write finish instead of killing it*. That part of your idea is sound and cheap: in the ordinary case the write takes milliseconds.
<!-- consolidation: discard; ref: none; reason: Historical queue and latency assessment is evidence rather than a timing guarantee. -->
<!-- consolidation: integrate; ref: docs/specs/sessions.md#live-terminal-and-client-lifetime; reason: Letting in-flight writes finish is accepted in sheet 8 within a two-second bound and absent from core. -->
2. **When the terminal link is saturated, waiting doesn't help.** The test's 32 occupied slots are an extreme case, but under real load waiting for the write to finish means waiting for slots that the closing action is itself holding. The wait expires and the message is lost anyway — just after a delay to closing. And if the agent's terminal is already gone when you close, there is nothing to deliver to at all.
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#runningexecution-interaction-contract; reason: Claimed closing-action slot dependency and inevitable loss require verification rather than becoming an approved limitation. -->
<!-- consolidation: exists; ref: docs/architecture/session-harness.md#session-operations; reason: Input requires a usable intended execution and unavailability must be reported without silently retargeting. -->

So: waiting for the in-flight write to finish makes the message actually land in the ordinary case, and cannot save it in the pathological ones.
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#runningexecution-interaction-contract; reason: Categorical success and failure predictions exceed the approved best-effort bounded delivery contract. -->

## 4. One thing that is today's bug, not a preference

The app barely tells you this happened — it surfaces as an error notice / a stderr line, not something you would reliably see. Losing a message you typed while being told almost nothing about it is worse than the loss itself.
<!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#session-interaction-and-feedback; reason: Historical visibility defect needs verification and exact post-close failure presentation is not settled. -->

## 5. The question

- **A (cheapest)** — keep the fast teardown and the uncertainty message, but make the failure *visible* where you would see it (a notice in the workspace, not a stderr line).
<!-- consolidation: discard; ref: docs/specs/sessions.md#live-terminal-and-client-lifetime; reason: Abort-only teardown alternative is rejected by sheet 8's choice B. -->
- **B (your idea, narrowly)** — let an already in-flight write finish before closing, bounded by the existing 2 seconds, then report if it did not make it. Ordinary case: your message lands, closing waits milliseconds. Saturated case: 2 seconds then today's outcome.
<!-- consolidation: integrate; ref: docs/specs/sessions.md#live-terminal-and-client-lifetime; reason: Sheet 8 accepts up to two seconds for in-flight completion and reporting non-delivery and core lacks this requirement. -->
<!-- consolidation: discard; ref: none; reason: Predicted millisecond timings and saturated-case behavior are explanatory estimates rather than guarantees. -->
- **C (guarantee)** — hold the close until the input has actually landed, with a visible "sending…" state, and only report failure when the terminal is gone. The only version where the message is never silently lost; closing waits on the agent's terminal.
<!-- consolidation: discard; ref: docs/specs/sessions.md#live-terminal-and-client-lifetime; reason: Unlimited waiting and guaranteed delivery were not selected and sheet 8 approves bounded B instead. -->

**Answer:** ____

---

### Done without asking (FYI, evidence-backed)

The one remaining red in the suite was this same area, in the test rather than the code: when this cancellation happens `detach()` *rejects* (wrapped as `AggregateError("Could not fully stop existing agent transport")`), which is the original deliberate behaviour the test once asserted — a later commit relaxed the assertion to "detach must not reject" without changing the code, and deleted the comment explaining it. I am restoring the test to the code's contract, not the reverse. If you pick **B** or **C**, that behaviour changes and this test changes with it — nothing is lost by fixing it now.
<!-- consolidation: discard; ref: docs/SPEC.md#authority; reason: Historical assertion restoration and suite status do not establish behavior from source over approved intent. -->
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#runningexecution-interaction-contract; reason: Post-drain detach rejection and AggregateError contract remain unapproved despite the historical implementation. -->
