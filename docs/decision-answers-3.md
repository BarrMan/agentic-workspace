# Decision answer sheet 3 — the two I explained badly

You said twice that I failed to explain these, and you were right: I used internal names for things instead of describing what you actually see. Both are written below as product behaviour first, then the question. Answer inline after each `Answer:`.

---

## 1 — Removing a reference to a task you archive or demote  [was "R1"]

**The product behaviour.** Say TASK-2 depends on TASK-1 — TASK-1 is listed in TASK-2's dependencies. Now TASK-1 leaves your active set: you archive it, or you `backlog task demote TASK-1` (moving an active task back to drafts, the reverse of promoting a draft). A dependency pointing at a task that is no longer active is dead weight, so Backlog removes that reference from TASK-2 at the same time, and tells you that it did.

**The sentence in question.** When an agent triggers this through the MCP tool (the interface agents use), the tool's reply includes:

```
Removed references to TASK-1 from TASK-2.
```

**Nothing about that changed in the app.** The sentence is still produced today. What changed is our *test*: it used to assert that the reply contains that sentence, and it now asserts the outcome instead — that TASK-2's dependency list came back empty. So both things are true today (reference removed, sentence sent), but only the removal is checked by a test.

**The question.** Should the sentence be guaranteed by a test as well?

- **A (recommended)** — Test both: the reference is gone *and* the reply says so. If the sentence ever stops being sent, a test tells you, instead of an agent silently no longer reporting what it changed.
- **B** — No. Checking that the reference was removed is enough; the sentence is decoration.

**Answer:** B

---

## 2 — Input to an agent's terminal when the session ends mid-send  [was "B4"]

**The product behaviour.** When Backlog runs an agent in a workspace, Backlog shows you that agent's terminal inside the app, and it can type into it on your behalf — that is how a message you queue, or a paste, reaches the agent. There is a pipe between Backlog and that terminal session. My earlier phrase "input transport" was jargon for that pipe; sorry.

**The scenario.** A chunk of input is on its way to the agent's terminal — a queued message, a paste — and the session ends or is torn down *while that chunk is still going out*. Backlog knows it stopped sending early, and it cannot know whether the agent received all of that chunk or only part of it. Today it reports:

```
Input transport stopped while input delivery was in flight; delivery is uncertain.
```

Which means: *"I stopped sending your input half-way through, so I don't know whether the agent got all of it."* This path has a test that asserts that this is what gets reported.

**The question.** Is that the right thing to tell you on this path?

- **A (recommended)** — Yes. Input that was half-delivered is genuinely unknown, and saying so is what lets you re-send it. Keep the message and keep the test asserting it.
- **B** — No: Backlog should finish delivering the input, or report it as delivered. Then the test should expect that instead.
- **C** — Drop the test until the behaviour is decided.

**Answer:** What do you mean by "the session ends or torn down"? What is the exact scenario? The user deleted the task? what happened? I can't understand the scenario still.
