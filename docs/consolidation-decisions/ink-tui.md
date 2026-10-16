# Ink TUI framework integration

> **Working sheet — not a contract.** Answers are applied to the owning contracts and to each document's disposition markers.

**What this group is:** How the Ink terminal-UI framework is integrated into the project.

**Default:** Discard — Ink is no longer used.

**7 statements** — 7 P (proposal / unanswered) · 0 G (evidence or safety gate).

**Decision for this group:** `[ ] Discard all` · `[ ] Plan work (→ alignment plan, not a contract)` · `[ ] Amend a contract` · `[ ] Select individually` · `[ ] Narrow: ______`

Answers are per statement only if you choose "Select individually": `d` discard · `w` plan work · `a` amend the contract named · `?` keep open.

---

### from `docs/BACK-728-handoff.md` (7)

1. `P` **Ink/private-tmux substrate proposal lacks technology approval despite spike evidence.** — as a private, never-attached PTY container for agent processes. Verified viable (see §6). — `docs/BACK-728-handoff.md:44` · related: `docs/adr/README.md#active-decisions`
2. `P` **Ink alternate-screen wrapper applies only if that unapproved substrate is selected.** — pollutes terminal scrollback. You must wrap this yourself. — `docs/BACK-728-handoff.md:303` · related: `docs/adr/README.md#active-decisions`
3. `P` **Cell-diffing requirement is an unapproved scaling recommendation for the Ink proposal.** — re-emits the whole grid every tick — the exact class of bug already being fixed. — `docs/BACK-728-handoff.md:317` · related: `docs/adr/README.md#active-decisions`
4. `P` **Claude color viability question remains unanswered for the unapproved Ink proposal.** — indistinguishable from a broken pipeline, so it must be proven either way. — `docs/BACK-728-handoff.md:330` · related: `docs/adr/README.md#active-decisions`
5. `P` **One Ink terminal owner and Yoga UI tree are unapproved technology proposals.** —  — `docs/BACK-728-handoff.md:414` · related: `docs/adr/README.md#active-decisions`
6. `P` **Pipe-pane through xterm into Ink cells is an unapproved rendering pipeline.** —  — `docs/BACK-728-handoff.md:415` · related: `docs/adr/README.md#active-decisions`
7. `P` **Ink vertical slice and spike reuse remain unapproved implementation proposals.** — the starting skeleton. — `docs/BACK-728-handoff.md:435` · related: `docs/adr/README.md#active-decisions`

