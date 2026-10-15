# Decision answer sheet 4

Item 1 from sheet 3 is settled; item 2 is restated below with the actual event, because "the session ends or is torn down" was too vague to picture.

---

## Settled — no work needed

**Sheet 3, item 1** (the "Removed references to TASK-1 from TASK-2" sentence): you chose **B** — checking that the reference was actually removed is enough, the sentence is decoration. Nothing changes. The test keeps asserting the outcome only.

---

## Restated — the input one [was B4]

**What you would actually be doing.** You are watching an agent run in Backlog, and you type into its terminal inside the app (or the app sends a message you queued). Every keystroke goes to that agent's terminal through a link the app shares with other work — in the test, that link is deliberately saturated, 32 pieces of terminal work already occupying it, so your input has to wait its turn.

**What happens then.** You close the live view of that agent (in the test, the host detaches) *while your input is still waiting its turn*. The app cancels the input it had not yet written and reports:

```
Input transport stopped while input delivery was in flight; delivery is uncertain.
```

Meaning: *"I stopped before I finished writing your input to the agent's terminal, so I can't tell you how much of it the agent actually received."*

**What it is not.** Not deleting the task. Not the agent crashing. Not the agent's session ending — detaching **keeps the session running** (the test asserts the session is retained). What stops is the app's live link to that terminal. A second path reaches the same uncertainty: quitting Backlog while a message is still on its way out.

**One detail worth knowing.** On this particular path nothing had actually been written yet — the pending write was cancelled before it ran, so the agent received none of it. The message still says "uncertain" because the same code path also covers input that had already started going out and may be half-arrived. So the wording hedges in both directions.

**The question.** Which is right for you when you close the live view with your input still queued?

- **A (current behavior, smallest change)** — Keep the one hedged message: "I stopped mid-send, delivery uncertain." It is never wrong, and it tells you to re-send. The existing test keeps asserting it.
- **B (more precise)** — Say what actually happened: if nothing had been written yet, tell you "your input was not sent"; reserve "uncertain" only for input that had already started out. Costs a second message and a second test, and I would first confirm the app can always tell those two moments apart at that point.
- **C** — Leave the behavior alone but stop testing it.

**Answer:** Why is this the current behavior? Can't we just continue sending until buffer is empty? Like, in this probably non-existing scenario, the user writes a message in the live preview pane, only part of the message is sent and the rest still remains in the send buffer waiting to be consumed (?), then the user switches between tasks I guess? And the existing behavior is to not send the rest of the buffer to the terminal that should receive this message and show an error that this happened?
