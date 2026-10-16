# Agent of Empires reference material

> **Working sheet — not a contract.** Answers are applied to the owning contracts and to each document's disposition markers.

**What this group is:** Claims imported from the external Agent of Empires comparison.

**Default:** Discard unless separately verified.

**4 statements** — 0 P (proposal / unanswered) · 4 G (evidence or safety gate).

**Decision for this group:** `[ ] Discard all` · `[ ] Plan work (→ alignment plan, not a contract)` · `[ ] Amend a contract` · `[ ] Select individually` · `[ ] Narrow: ______`

Answers are per statement only if you choose "Select individually": `d` discard · `w` plan work · `a` amend the contract named · `?` keep open.

---

### from `docs/aoe-agent-workspace-reference.md` (1)

1. `G` **External presentation reference does not authorize copying runtime ownership.** — AOE's full-window attach path is a presentation reference, not a terminal-ownership design to copy. At upstream commit 0a17c859173a8794abfb55ae7e8038c4c4b17e7d: — `docs/aoe-agent-workspace-reference.md:704`

### from `docs/aoe-lifecycle-implementation-plan.md` (1)

1. `G` **Takeover bound and missed-beat safety tradeoff require verified current lease semantics.** — **Risk.** The comparison's stated fix (~2 s cadence with the existing 3.5 s stale window) is **wrong**: 2 s cadence tolerating one missed beat means a 4 s gap, so a *live* owner would be declared … — `docs/aoe-lifecycle-implementation-plan.md:342` · related: `docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport`

### from `docs/aoe-status-tracking-plan.md` (1)

1. `G` **Exact fs.watch path and ten-millisecond debounce need current implementation disposition.** — > what AOE does. — `docs/aoe-status-tracking-plan.md:95` · related: `docs/architecture/session-harness.md#route-runtime-events-and-observe`

### from `docs/disk-growth-investigation.md` (1)

1. `G` **Blanket claims about du logical accounting and df exclusivity need qualification before becoming operational guidance.** — use stat-based logical sums or du only for relative comparison. — `docs/disk-growth-investigation.md:112`

