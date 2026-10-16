---
consolidation:
  total: 20
  counts:
    exists: 2
    discard: 11
    integrate: 0
    unconfirmed: 7
  percentages:
    exists: 10.00%
    discard: 55.00%
    integrate: 0.00%
    unconfirmed: 35.00%
---
# Decision answer sheet 3 — the two I explained badly
> **Non-authoritative supporting material.** This file is not a contract. Authoritative owner(s): [SPEC](SPEC.md), [task behavior](specs/tasks.md), [sessions](specs/sessions.md), [interfaces](specs/interfaces.md), [BLUEPRINT](BLUEPRINT.md), [architecture](architecture/session-harness.md), [CONVENTIONS](CONVENTIONS.md).
> Disposition: Mixed — see markers.

You said twice that I failed to explain these, and you were right: I used internal names for things instead of describing what you actually see. Both are written below as product behaviour first, then the question. Answer inline after each `Answer:`.
<!-- consolidation: discard; ref: none; reason: Historical interview context and response instructions. -->

---

## 1 — Removing a reference to a task you archive or demote  [was "R1"]

**The product behaviour.** Say TASK-2 depends on TASK-1 — TASK-1 is listed in TASK-2's dependencies. Now TASK-1 leaves your active set: you archive it, or you `backlog task demote TASK-1` (moving an active task back to drafts, the reverse of promoting a draft). A dependency pointing at a task that is no longer active is dead weight, so Backlog removes that reference from TASK-2 at the same time, and tells you that it did.
<!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Draft promotion and demotion are explicitly absent from the current task model. -->
<!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#tasks-and-storage; reason: Archive-specific dependency removal is not settled by the core rule that dependencies survive completion. -->

**The sentence in question.** When an agent triggers this through the MCP tool (the interface agents use), the tool's reply includes:

```
Removed references to TASK-1 from TASK-2.
```
<!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Historical cleanup message example is not a current demotion requirement. -->

**Nothing about that changed in the app.** The sentence is still produced today. What changed is our *test*: it used to assert that the reply contains that sentence, and it now asserts the outcome instead — that TASK-2's dependency list came back empty. So both things are true today (reference removed, sentence sent), but only the removal is checked by a test.
<!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Historical test status for a now-removed demotion operation. -->

**The question.** Should the sentence be guaranteed by a test as well?
<!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Answer B resolves this historical message-assertion question. -->

- **A (recommended)** — Test both: the reference is gone *and* the reply says so. If the sentence ever stops being sent, a test tells you, instead of an agent silently no longer reporting what it changed.
<!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Explicitly rejected in the answer below. -->
- **B** — No. Checking that the reference was removed is enough; the sentence is decoration.
<!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Accepted demotion-specific cosmetic-text choice is obsolete with demotion removal. -->

**Answer:** B
<!-- consolidation: discard; ref: docs/specs/tasks.md#tasks-and-storage; reason: Preserve this accepted historical choice without restoring demotion or inferring an archive dependency policy. -->

---

## 2 — Input to an agent's terminal when the session ends mid-send  [was "B4"]

**The product behaviour.** When Backlog runs an agent in a workspace, Backlog shows you that agent's terminal inside the app, and it can type into it on your behalf — that is how a message you queue, or a paste, reaches the agent. There is a pipe between Backlog and that terminal session. My earlier phrase "input transport" was jargon for that pipe; sorry.
<!-- consolidation: exists; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Workspace presents a live agent terminal. -->
<!-- consolidation: exists; ref: docs/architecture/session-harness.md#runningexecution; reason: Session input is delivered through the execution's transport. -->

**The scenario.** A chunk of input is on its way to the agent's terminal — a queued message, a paste — and the session ends or is torn down *while that chunk is still going out*. Backlog knows it stopped sending early, and it cannot know whether the agent received all of that chunk or only part of it. Today it reports:
<!-- consolidation: discard; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Causal explanation was corrected in sheets 4 and 5 since client detach does not end the agent session. -->

```
Input transport stopped while input delivery was in flight; delivery is uncertain.
```
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#runningexecution; reason: Exact uncertainty text and applicability after bounded draining are not approved by this example. -->

Which means: *"I stopped sending your input half-way through, so I don't know whether the agent got all of it."* This path has a test that asserts that this is what gets reported.
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#runningexecution; reason: Half-delivery cannot be inferred for the pre-dispatch cancellation path later described in sheet 4. -->

**The question.** Is that the right thing to tell you on this path?
<!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Exact post-drain delivery reporting remains unresolved by the clarification response. -->

- **A (recommended)** — Yes. Input that was half-delivered is genuinely unknown, and saying so is what lets you re-send it. Keep the message and keep the test asserting it.
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#runningexecution; reason: Exact uncertainty-message and resend guidance was not accepted here. -->
- **B** — No: Backlog should finish delivering the input, or report it as delivered. Then the test should expect that instead.
<!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Unbounded completion alternative is not approved and sheet 8 instead accepts a two-second bound for already in-flight input. -->
<!-- consolidation: discard; ref: docs/architecture/session-harness.md#runningexecution; reason: Reporting delivered without delivery evidence contradicts transport completion and error reporting. -->
- **C** — Drop the test until the behaviour is decided.
<!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#testing; reason: No approval to remove transport failure coverage. -->

**Answer:** What do you mean by "the session ends or torn down"? What is the exact scenario? The user deleted the task? what happened? I can't understand the scenario still.
<!-- consolidation: discard; ref: none; reason: Clarification request was addressed by sheets 4 and 5 and is not behavioral approval. -->
