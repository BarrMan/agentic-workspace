# Documentation and research method

> **Working sheet — not a contract.** Answers are applied to the owning contracts and to each document's disposition markers.

**What this group is:** How the documentation itself was produced: research, questionnaires, authority and provenance method.

**Default:** Discard — process history.

**20 statements** — 1 P (proposal / unanswered) · 19 G (evidence or safety gate).

**Decision for this group:** `[ ] Discard all` · `[ ] Plan work (→ alignment plan, not a contract)` · `[ ] Amend a contract` · `[ ] Select individually` · `[ ] Narrow: ______`

Answers are per statement only if you choose "Select individually": `d` discard · `w` plan work · `a` amend the contract named · `?` keep open.

---

### from `docs/BACK-728-handoff.md` (1)

1. `G` **Unknown file provenance requires disposition before removal or commitment.** — | docs/pi-extensions/01-agent-yaml-error.md | Untracked, ownership unknown, nothing in src/ references it. Needs a decision. | — `docs/BACK-728-handoff.md:365` · related: `docs/CONVENTIONS.md#general-principles`

### from `docs/aoe-functionality-map.md` (1)

1. `G` **Unverified gaps remain open rather than being closed by documentation mapping.** — Carry these PENDING lists forward; do not treat any listed gap as verified. — `docs/aoe-functionality-map.md:1943`

### from `docs/modes-delivery-plan.md` (1)

1. `G` **Old autonomous phase sequencing cannot grant current execution authority.** — unavailable required harness blocks progress. Preserve BACK-23 as In Progress — `docs/modes-delivery-plan.md:268`

### from `docs/opentui-workspace-behavior-matrix.md` (1)

1. `G` **Core owners supersede historical authority claims.** — > **Retained source material pending fold.** SPEC owns canonical behavior and BLUEPRINT owns canonical structure; they supersede conflicting authority claims below. Scoped execution safety gates … — `docs/opentui-workspace-behavior-matrix.md:17`

### from `docs/opentui-workspace-spec.md` (1)

1. `G` **Approved owners supersede source material.** — > docs/SPEC.md is authoritative wherever this document disagrees with it. — `docs/opentui-workspace-spec.md:19`

### from `docs/questionnaire-03.md` (1)

1. `P` **Approved decisions remain authoritative and unanswered recommendations are not requirements.** — Answer **Yes** to accept a recommendation, or describe the behavior you want. You do not need to review another document. Earlier answers remain settled; unanswered questions from the previous … — `docs/questionnaire-03.md:21`

### from `docs/questionnaire.md` (2)

1. `G` **Answer addresses AGENTS ownership but does not approve a CLAUDE exception or its necessity.** — **Question:** May a tool-required CLAUDE entry point remain as an exception to the core-only document set? — `docs/questionnaire.md:67` · related: `docs/CONVENTIONS.md#documentation-maintenance`
2. `G` **Unanswered inventory does not approve behavior.** — *Risk: Unresolved rows or unmapped document content must not be treated as approved requirements or deletion authorization.* — `docs/questionnaire.md:153`

### from `docs/research-architecture-documentation.md` (1)

1. `G` **Product authority and evidence hierarchy are explicit.** — - **SPEC.md**: normative product/behavior contract: what must remain true for users. Do not let observed implementation override it. — `docs/research-architecture-documentation.md:28`

### from `docs/storage-cleanup-plan.md` (2)

1. `G` **Retain host personal-data preservation gate pending owner disposition.** — | 6 | ~/Documents | 7.09 GiB | KEEP | Personal. | — `docs/storage-cleanup-plan.md:39`
2. `G` **Host preservation scope remains a safety gate pending owner disposition.** — - All .git history, project source, ~/Documents, ~/.backlog, ~/.pi/agent, ~/.local/share DBs. — `docs/storage-cleanup-plan.md:55`

### from `docs/storage-review-downloads.md` (3)

1. `G` **Owner preservation decision pending.** — | לימודים | 4.61 GiB | study/documents | medium | KEEP | Purpose inferred from directory name; contents not read. | — `docs/storage-review-downloads.md:53`
2. `G` **Owner preservation decision pending.** — | מסמכים | 782.31 MiB | study/documents | medium | KEEP | Purpose inferred from directory name; contents not read. | — `docs/storage-review-downloads.md:60`
3. `G` **Personal-data preservation decision pending.** — | Documents | 266.92 MiB | study/documents | medium | KEEP | Purpose inferred from directory name; contents not read. | — `docs/storage-review-downloads.md:70`

### from `docs/storage-review-zesty.md` (2)

1. `G` **Host business-data preservation gate awaits owner disposition.** — - Business/work project files, source, assets, data, and Git history must be preserved. Review categories below are investigative leads, not deletion authority. — `docs/storage-review-zesty.md:26`
2. `G` **Binary provenance and preservation needs remain unknown.** — | ezswitch-controller | bin | 0.2392 | P — binaries/tooling; provenance unknown | — `docs/storage-review-zesty.md:150`

### from `docs/tmux-call-sites.md` (2)

1. `G` **Preserve count-reconciliation gate rather than approve 52 or 56.** — document's 52 as the working number and reconcile the delta before migrating. — `docs/tmux-call-sites.md:41`
2. `G` **Never-throw claim conflicts with documented host-error rejection.** — | 20 | 590 | select-pane -t <active> | nameShellPane | void, exitCode ignored | 🔴 focus-critical, step 4 — restores focus; run() not require() so restore can never throw | — `docs/tmux-call-sites.md:172`

### from `docs/tmux-layer-spec.md` (2)

1. `G` **listPanePids signature is not signaling authority.** —  — `docs/tmux-layer-spec.md:356` · related: `docs/BLUEPRINT.md#observation-stop-and-deletion`
2. `G` **signalProcessTree signature lacks required exact execution provenance.** —  — `docs/tmux-layer-spec.md:416` · related: `docs/BLUEPRINT.md#observation-stop-and-deletion`

