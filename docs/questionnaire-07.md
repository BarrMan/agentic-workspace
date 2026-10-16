---
consolidation:
  total: 15
  counts:
    exists: 4
    discard: 4
    integrate: 0
    unconfirmed: 7
  percentages:
    exists: 26.67%
    discard: 26.67%
    integrate: 0.00%
    unconfirmed: 46.67%
---

# Questionnaire 7 — asking retained sessions
> **Non-authoritative supporting material.** This file is not a contract. Authoritative owner(s): [SPEC](SPEC.md), [sessions](specs/sessions.md), [interfaces](specs/interfaces.md).
> Disposition: Mixed — see markers.

Your [answer retaining `ask`](questionnaire-03.md#17-asking-a-retained-session-a-question) is settled. <!-- consolidation: exists; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Ask is a retained integration operation. --> The earlier core's stopped-only restriction had no confirmed approval. <!-- consolidation: discard; ref: none; reason: Historical approval-status statement is not a product requirement. --> This batch resolves eligibility and carries forward the unanswered resume-consent question from [Questionnaire 2](questionnaire-02.md). <!-- consolidation: discard; ref: none; reason: Temporary questionnaire workflow description. --> Only your answers establish decisions; the options below are not approved requirements. <!-- consolidation: exists; ref: docs/SPEC.md#overview; reason: Unanswered options do not approve behavior. --> Answers will be folded into [the integration contract](specs/interfaces.md#supported-integration-operations). <!-- consolidation: discard; ref: none; reason: Temporary consolidation procedure. -->

## 1. Which sessions may receive an `ask` question?

- **A — Stopped only:** running sessions cannot be consulted through `ask`, even when idle. <!-- consolidation: unconfirmed; ref: none; reason: Eligibility option was not answered. -->
- **B — Stopped or positively idle:** allow a running session known to be idle, but not one working or awaiting permission. <!-- consolidation: unconfirmed; ref: none; reason: Eligibility option was not answered. -->
- **C — Also working sessions:** support asking during ongoing work; interruption versus queuing would need a separate decision. <!-- consolidation: unconfirmed; ref: none; reason: Eligibility option was not answered. -->

Unknown activity is not evidence of idleness. <!-- consolidation: exists; ref: docs/specs/sessions.md#requirements; reason: Unknown activity is not treated as idle. --> This choice does not authorize interrupting work or bypassing a permission request. <!-- consolidation: unconfirmed; ref: none; reason: No selected eligibility rule was approved. --> You may specify a different rule. <!-- consolidation: discard; ref: none; reason: Questionnaire response instruction. -->

**Answer:**

## 2. Does asking a stopped session itself authorize resuming it?

- **A — Yes:** the explicit `ask` request authorizes starting the retained conversation to answer, using current effective configuration. <!-- consolidation: unconfirmed; ref: none; reason: Resume-consent option was not answered. -->
- **B — Separate opt-in:** require explicit permission to resume before starting execution. Without it, explain what is needed rather than resuming automatically. <!-- consolidation: unconfirmed; ref: none; reason: Resume-consent option was not answered. -->

Either choice preserves the exact conversation identity and does not replay its initial prompt. <!-- consolidation: exists; ref: docs/specs/sessions.md#stop-and-resume-a-session; reason: Resume uses exact identity without replaying the initial prompt. --> Whether an execution started for `ask` stops after answering is a separate, unresolved lifetime decision. <!-- consolidation: unconfirmed; ref: none; reason: Post-answer execution lifetime remains undecided. -->

**Answer:**
