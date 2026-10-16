# Questionnaire 7 — asking retained sessions

Your [answer retaining `ask`](questionnaire-03.md#17-asking-a-retained-session-a-question) is settled. The earlier core's stopped-only restriction had no confirmed approval. This batch resolves eligibility and carries forward the unanswered resume-consent question from [Questionnaire 2](questionnaire-02.md). Only your answers establish decisions; the options below are not approved requirements. Answers will be folded into [the integration contract](specs/interfaces.md#supported-integration-operations).

## 1. Which sessions may receive an `ask` question?

- **A — Stopped only:** running sessions cannot be consulted through `ask`, even when idle.
- **B — Stopped or positively idle:** allow a running session known to be idle, but not one working or awaiting permission.
- **C — Also working sessions:** support asking during ongoing work; interruption versus queuing would need a separate decision.

Unknown activity is not evidence of idleness. This choice does not authorize interrupting work or bypassing a permission request. You may specify a different rule.

**Answer:**

## 2. Does asking a stopped session itself authorize resuming it?

- **A — Yes:** the explicit `ask` request authorizes starting the retained conversation to answer, using current effective configuration.
- **B — Separate opt-in:** require explicit permission to resume before starting execution. Without it, explain what is needed rather than resuming automatically.

Either choice preserves the exact conversation identity and does not replay its initial prompt. Whether an execution started for `ask` stops after answering is a separate, unresolved lifetime decision.

**Answer:**
