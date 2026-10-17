# Historical handoffs and checkpoints

> **Working sheet — not a contract.** Answers are applied to the owning contracts and to each document's disposition markers.

**What this group is:** State captured at a point in past work: handoffs, refactoring checkpoints, branch/commit state.

**Default:** Discard — historical.

**8 statements** — 0 P (proposal / unanswered) · 8 G (evidence or safety gate).

**Decision for this group:** `[ ] Discard all` · `[ ] Plan work (→ alignment plan, not a contract)` · `[ ] Amend a contract` · `[ ] Select individually` · `[ ] Narrow: ______`

Answers are per statement only if you choose "Select individually": `d` discard · `w` plan work · `a` amend the contract named · `?` keep open.

---

### from `docs/BACK-728-handoff.md` (1)

1. `G` **This handoff provides no approved UI technology selection.** — There are two candidate resolutions, and **the decision between them has not been made**: — `docs/BACK-728-handoff.md:39` · related: `docs/adr/README.md#active-decisions`

### from `docs/agent-handover.md` (2)

1. `G` **Exact historical full-text behavior is unspecified and matching details remain open.** — - Preserve canonical ID ambiguity, completed-task evidence, local/cross-branch visibility, full-text behavior, custom initialization, partial mutations, and locked writes. — `docs/agent-handover.md:96` · related: `docs/specs/filtering-and-search.md#filtering-and-search`
2. `G` **Custom initialization details are not identified sufficiently to fold.** — - Preserve canonical ID ambiguity, completed-task evidence, local/cross-branch visibility, full-text behavior, custom initialization, partial mutations, and locked writes. — `docs/agent-handover.md:96` · related: `docs/specs/configuration.md#configuration-and-modes`

### from `docs/agent-of-empires-runtime-research.md` (1)

1. `G` **Retain migration authorization backup and writer-quiescence gate until its current disposition is confirmed.** — Schema migration remains paused; any later migration requires final decisions and separate authorization, with backup and quiesced writers. — `docs/agent-of-empires-runtime-research.md:133` · related: `docs/CONVENTIONS.md#changes-and-refactoring`

### from `docs/modes-delivery-plan.md` (1)

1. `G` **Historical checkpoints do not authorize redispatch or prove current acceptance.** — solely because its original mission appears here. Preserve exclusive ownership — `docs/modes-delivery-plan.md:258`

### from `docs/opentui-workspace-implementation-plan.md` (1)

1. `G` **Final owner-review checkpoint cannot be closed by annotation.** — User approves final deletion result. — `docs/opentui-workspace-implementation-plan.md:315`

### from `docs/shared-agent-runtime-simplification.md` (1)

1. `G` **Refactoring does not approve policy changes.** — - Keep all existing user features from the plan. Structural simplification and deletion-policy decisions are separate gates. — `docs/shared-agent-runtime-simplification.md:67`

### from `docs/tmux-layer-spec.md` (1)

1. `G` **Preserve error-channel distinctions pending exact wrapper contract review.** — ### 2.4 exitCode / stderr branching is preserved, not converted to exceptions — `docs/tmux-layer-spec.md:193` · related: `docs/CONVENTIONS.md#error-handling`

