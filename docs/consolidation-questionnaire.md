# Consolidation decision questionnaire

> **Non-authoritative supporting material.** This questionnaire is not a contract. It exists to collect the owner decisions needed to finish documentation consolidation; the answers are applied to the owning contracts and the legacy documents' disposition markers.

## How to use this

Every legacy document carries one `<!-- consolidation: … -->` marker per atomic claim. `unconfirmed` means *no contract owns the claim yet and no owner has decided*. This questionnaire batches those units so one answer clears many at once.

- **Answer shape:** `Confirm` (accept the recommended default), `Change` (say which option), or `Reject` (leave open).
- **Resolves:** how many `unconfirmed` units the answer clears. A *discard* answer retires the claim as unapproved/historical; an *integrate* answer folds it into the named owning contract.
- **Boundary:** questions deliberately exclude pure verification, runtime-acceptance and safety gates. Those are execution work, not decisions, and stay open in the [alignment plan](alignment-plan.md).
- Counts come from two sources: family questions were counted by per-family analysis of each document's markers; the two global questions were counted by a stated rule over the full 1,406-unit inventory. The global and family counts overlap, so the final totals are recomputed after you answer.

## Part A — Global policy questions (highest yield)

### A1. Unanswered recommendations and unapproved statements are retired, not carried forward.

Interview items that were never answered, and statements that were never accepted or approved, currently read as unresolved. Under the new authority the contracts are the source of truth, so an unanswered recommendation has no standing.

- **Options:** **A. Confirm — retire every unanswered/unapproved statement (discard); keep only safety and verification gates, as tracked work (recommended).** B. Retire only unanswered *interview* items, and leave unapproved planning proposals open. C. Keep them all open and decide item by item.
- **Resolves:** **293** units.
- **By family:** tmux 115, interviews 59, OpenTUI 56, AoE/tests 34, storage 16, redesign/shared 13.

### A2. Proposed, candidate and aspirational statements are retired unless separately approved.

Proposed APIs, candidate key bindings, aspirational performance targets, speculative optimizations and "should" wording are planning material, not requirements.

- **Options:** **A. Confirm — retire proposals/targets/candidates unless separately approved (discard) (recommended).** B. Retire only proposals in planning docs, keep proposals inside specs. C. Keep them open and decide item by item.
- **Resolves:** **304** units (approximate; counted by a "proposal/candidate/target" rule over the same inventory).
- **By family:** tmux 122, interviews 52, AoE/tests 42, OpenTUI 37, redesign/shared 26, storage 25.

### Not questionnaire-resolvable

**572** units are verification, runtime-acceptance, provider-evidence or safety gates. One policy answer cannot settle them; they need evidence or an execution decision. They stay open in the alignment plan and are out of scope here.

## Part B — Storage and host cleanup (151 units)

Recommended default is the safe option in each case: **preserve until the specific target is verified**.

| Q# | Decision | Options | Resolves |
|---|---|---|---|
| S1 | May identified regenerable caches be cleared after confirming the app is stopped, the target is genuinely regenerable, and offline needs are acceptable? | **A. No cleanup; preserve pending per-target review** · B. Allow individually verified cleanup · C. Also allow manual removal where no supported method exists | 34 |
| S2 | Retention policy for session/history databases and related state. | **A. Preserve originals and provider state until a tested restore path is approved** · B. Approve lossless archive, removal separate · C. Archive plus deletion after tests | 33 |
| S3 | Do work/project and personal data (git history, archives, unknown folders, tool state) stay preserved unless reviewed item by item? | **A. Preserve; no inferred deletion from names or size** · B. Delete only owner-confirmed items after backup checks · C. Broader category cleanup after inventory | 29 |
| S4 | May obsolete installers/packages be deleted once installation status, archival need and duplicate identity are checked? | **A. Keep until individually confirmed unnecessary** · B. Delete confirmed obsolete installers · C. Also delete byte-identical duplicates | 17 |
| S5 | Authorized Docker storage cleanup. | **A. Preserve images, containers, volumes; investigate with Docker's tools first** · B. Clean only identified unused images/build cache · C. Also prune verified dangling volumes | 10 |
| S6 | May old Go toolchains, binaries and caches be removed? | **A. Preserve sets/binaries; no cache deletion until checks pass** · B. Per-cache cleanup after checks, keep binaries · C. Also remove confirmed unused binaries | 10 |
| S7 | May application VM/deployment storage be removed or rolled back? | **A. Preserve VM images and deployments pending persistence/rollback review** · B. App-supported removal of a confirmed inactive deployment · C. VM removal only after explicit retirement approval | 9 |
| S8 | Is the temporary-test cleanup proposal authorized, and within what boundary? | **A. Keep cleanup test-scoped; no global sweep or restart-based deletion** · B. Narrow ownership-checked cleanup command after validation · C. Periodic global cleanup with a verified age policy | 5 |
| S9 | Should the report's operational measurement/cleanup claims become guidance? | **A. Investigative only; qualify claims and require target checks** · B. Adopt qualified guidance after validation · C. Adopt a specific command once ownership checks are added | 4 |

## Part C — AoE status and test suite (178 units)

| Q# | Decision | Options | Resolves |
|---|---|---|---|
| T1 | Which test-suite practices become maintained policy rather than historical remediation instructions? | **A. Integrate general safety/proof practices; discard finding-specific history** · B. Integrate everything listed · C. Discard all report-derived practice | 29 |
| T2 | Test policy for inherited tmux-socket overrides. | **A. Keep the preload's unique default socket; trust an explicit override only when the caller owns it** · B. Reject every inherited override · C. Authenticate overrides and add safety tests | 10 |
| T3 | Should AoE status support only currently enabled providers, or retain planned provider expansion? | **A. Capability-gated: retain verified providers; discard unverified expansion** · B. Adopt six-provider scope subject to verification · C. Only currently launchable providers | 14 |
| T4 | Approved hook-install interface and lifetime. | **A. Explicit install/uninstall for persistent config; process hooks owned-temp only** · B. Auto install/remove on launch · C. Process-scoped hooks only | 9 |
| T5 | Where may status sidecars live, and when are they removed? | **A. Task-owned location for durable status; owned temp for process-scoped files** · B. Owned temp only, removed at process end · C. Both, per provider | 10 |
| T6 | What evidence may establish agent status, and what happens when evidence is stale or conflicts? | **A. Only verified provider evidence; uncertain or stale evidence must not assert a definitive state** · B. Adopt proposed precedence after provider testing · C. Only observed/unknown state | 22 |
| T7 | Should status detection include user-configurable rules or external chrome heuristics? | **A. No user rule engine; verified provider signals only** · B. Add the rule engine and chrome fallback · C. Internal provider-verified chrome fallback, no user surface | 8 |
| T8 | Which observation/refresh optimizations are required contracts rather than implementation proposals? | **A. Keep correctness/bounded-observation guarantees; make scan counts, TTLs and batching evidence-gated** · B. Adopt all specified targets · C. Discard optimization targets | 27 |
| T9 | Should the proposed tmux pane-batch API and exact result shapes become a contract? | **A. Leave batching and exact shapes as implementation choices until validated** · B. Adopt the proposed API and error semantics · C. Keep single-session probes only | 8 |
| T10 | Which transport and lease performance changes are approved? | **A. Preserve live-byte and single-owner safety; defer timing/backoff changes until measured** · B. Adopt specified timings and snapshot optimization · C. Discard these proposals | 20 |
| T11 | Which local terminal/UI behaviors should be specified rather than inferred from the external reference? | **A. Keep approved retained-terminal and non-interrupting exit behavior; leave OpenTUI details out unless accepted** · B. Adopt the proposed native-terminal ownership and input behavior · C. Specify only the existing screen contract | 25 |
| T12 | Are the external reference's technical claims and exclusions local requirements? | **A. No: comparison evidence only; integrate only after local verification** · B. Adopt them as local defaults · C. Discard unverified external claims | 16 |

## Part D — Redesign and shared runtime (66 units)

| Q# | Decision | Options | Resolves |
|---|---|---|---|
| R1 | Which observed CLI/API commands, aliases, syntax and options should the supported interface contract include? (INV-1) | **A. Only operations expressly specified by core; leave the rest unsupported** · B. Retain a named subset · C. Approve the full inventoried surface | 22 |
| R2 | Which convenience/product surfaces remain: setup conveniences, MCP, guidance/skill/instructions, archive, broad config CLI, shell completion? (DEC-5) | **A. Only explicitly approved core behavior; drop unapproved surfaces** · B. Retain a named subset · C. Retain all | 19 |
| R3 | What legacy task/session record conversion, if any, is supported? | **A. Do not prescribe a recipe until schema and data impact are verified** · B. Approve a verified manual conversion with backups · C. Require an automated migration (separate decision) | 5 |
| R4 | Is observed runtime/provider behaviour accepted as a product guarantee or contingent on scoped live evidence? | **A. Unclaimed until separately authorized isolated evidence exists** · B. Accept only named evidence-backed behaviors · C. Adopt observed behaviors as guarantees | 20 |

## Part E — Needs a second pass (no reliable batch count yet)

These families are mostly one-off proposals and verification gates, so no honest batch count exists. The owner questions below are the topics a focused pass would ask:

- **tmux:** authorize the extraction and its wrapper boundary; raw-argv vs library-mediated operations; module layout and API ownership; execution/error contract; argv/format semantics; absence-vs-error mapping; focus/zoom/search key sequences; destructive-effect ownership; invocation-count definition.
- **OpenTUI/handoffs:** supported API and key bindings; session recovery/cleanup policy; test-runtime targets; external-reference retention; historical handoff disposition.
- **Interviews:** configuration merge/clear semantics; session eligibility and resume consent; archive and task/worktree behavior; search/filter behavior; API command retention.

## Coverage

| Source | Units | Method |
|---|---:|---|
| A1 global policy | 293 | rule over full inventory |
| A2 global policy | 304 | rule over full inventory |
| B storage | 151 | per-family marker analysis |
| C AoE + tests | 178 | per-family marker analysis |
| D redesign/shared | 66 | per-family marker analysis |
| **Subtotal (with A/family overlap)** | **992** | — |
| Not questionnaire-resolvable (gates) | 572 | verification/safety work |
| Needs a second pass | remainder of 1,406 | Part E topics |

## Answering key

Answer each question as `Confirm`, or `Change: <option>`, or `Reject`. Confirm accepts the recommended default. After answers are collected, each affected document's markers and frontmatter are updated from the decisions and the [mapping report](consolidation-map.md) is regenerated.
