---
consolidation:
  total: 16
  counts:
    exists: 2
    discard: 7
    integrate: 0
    unconfirmed: 7
  percentages:
    exists: 12.50%
    discard: 43.75%
    integrate: 0.00%
    unconfirmed: 43.75%
---
# Decision answer sheet 4
> **Non-authoritative supporting material.** This file is not a contract. Authoritative owner(s): [SPEC](SPEC.md), [task behavior](specs/tasks.md), [sessions](specs/sessions.md), [interfaces](specs/interfaces.md), [BLUEPRINT](BLUEPRINT.md), [architecture](architecture/session-harness.md), [CONVENTIONS](CONVENTIONS.md).
> Disposition: Mixed — see markers.

Item 1 from sheet 3 is settled; item 2 is restated below with the actual event, because "the session ends or is torn down" was too vague to picture.
<!-- consolidation: discard; ref: none; reason: Historical interview context. -->

---

## Settled — no work needed

**Sheet 3, item 1** (the "Removed references to TASK-1 from TASK-2" sentence): you chose **B** — checking that the reference was actually removed is enough, the sentence is decoration. Nothing changes. The test keeps asserting the outcome only.
<!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Historical demotion-specific assertion choice is superseded by removal of draft demotion. -->

---

## Restated — the input one [was B4]

**What you would actually be doing.** You are watching an agent run in Backlog, and you type into its terminal inside the app (or the app sends a message you queued). Every keystroke goes to that agent's terminal through a link the app shares with other work — in the test, that link is deliberately saturated, 32 pieces of terminal work already occupying it, so your input has to wait its turn.
<!-- consolidation: exists; ref: docs/architecture/session-harness.md#runningexecution; reason: Explicit input targets the intended execution's terminal transport. -->
<!-- consolidation: discard; ref: none; reason: Thirty-two-slot test saturation is historical fixture mechanics rather than a product contract. -->

**What happens then.** You close the live view of that agent (in the test, the host detaches) *while your input is still waiting its turn*. The app cancels the input it had not yet written and reports:
<!-- consolidation: discard; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Trigger description was corrected in sheet 5 and immediate cancellation was replaced by sheet 8's accepted bounded in-flight drain. -->

```
Input transport stopped while input delivery was in flight; delivery is uncertain.
```
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#runningexecution; reason: Exact error text for queued versus dispatched input is not settled in core. -->

Meaning: *"I stopped before I finished writing your input to the agent's terminal, so I can't tell you how much of it the agent actually received."*
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#runningexecution; reason: Later paragraph says none was written on this path so the hedged explanation requires verification. -->

**What it is not.** Not deleting the task. Not the agent crashing. Not the agent's session ending — detaching **keeps the session running** (the test asserts the session is retained). What stops is the app's live link to that terminal. A second path reaches the same uncertainty: quitting Backlog while a message is still on its way out.
<!-- consolidation: exists; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Detach leaves agents running and disposes only the client's connection. -->
<!-- consolidation: discard; ref: docs/specs/tasks.md#task-deletion; reason: Exclusion of task deletion as a trigger was corrected by sheet 5's source analysis. -->
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#runningexecution; reason: Exact uncertainty outcome on application exit after the accepted drain still requires verification. -->

**One detail worth knowing.** On this particular path nothing had actually been written yet — the pending write was cancelled before it ran, so the agent received none of it. The message still says "uncertain" because the same code path also covers input that had already started going out and may be half-arrived. So the wording hedges in both directions.
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#runningexecution; reason: Historical pre-dispatch evidence conflicts with the half-delivery explanation and does not settle approved reporting. -->

**The question.** Which is right for you when you close the live view with your input still queued?
<!-- consolidation: discard; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: This imprecise trigger question was replaced by the corrected workspace-close or deletion scenario and sheet 8 decision. -->

- **A (current behavior, smallest change)** — Keep the one hedged message: "I stopped mid-send, delivery uncertain." It is never wrong, and it tells you to re-send. The existing test keeps asserting it.
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#runningexecution; reason: User did not approve hedging or resend semantics and none-sent versus uncertain remains distinct. -->
- **B (more precise)** — Say what actually happened: if nothing had been written yet, tell you "your input was not sent"; reserve "uncertain" only for input that had already started out. Costs a second message and a second test, and I would first confirm the app can always tell those two moments apart at that point.
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#runningexecution; reason: No answer approves this message split and later option B refers to bounded draining instead. -->
- **C** — Leave the behavior alone but stop testing it.
<!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#testing; reason: Removing this coverage was never approved. -->

**Answer:** Why is this the current behavior? Can't we just continue sending until buffer is empty? Like, in this probably non-existing scenario, the user writes a message in the live preview pane, only part of the message is sent and the rest still remains in the send buffer waiting to be consumed (?), then the user switches between tasks I guess? And the existing behavior is to not send the rest of the buffer to the terminal that should receive this message and show an error that this happened?
<!-- consolidation: discard; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Scenario clarification and exploratory draining question were resolved into sheet 8's bounded in-flight decision rather than an unlimited-drain approval. -->
