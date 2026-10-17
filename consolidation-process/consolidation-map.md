# Consolidation mapping report

> **Current classification.** Counts are derived from the inline `<!-- consolidation: … -->` markers in each document and are valid against the current contract set: PRODUCT, SPEC and its `specs/`, BLUEPRINT and its `architecture/` pages, CONVENTIONS, DESIGN-SYSTEM and the screen specifications, and ADRs. These contracts own product behavior, structure, engineering practice, and presentation; the documents below are supporting material.

## Method

Atomic unit means one independently meaningful assertion, feature, requirement, question, recommendation, or evidence finding; indivisible multi-sentence assertions count once. Structural headings, table headings, empty placeholders, TOCs, and bare bibliography links are not units. Each unit carries an inline `<!-- consolidation: <disposition>; ref: <path#anchor|none>; reason: … -->` marker, and each document's frontmatter totals are computed from those markers.

Dispositions: **exists** — an owning contract already states it (`ref` names that contract section); **integrate** — a unique requirement no contract yet states (`ref` names the contract that should own it); **discard** — historical, obsolete, or superseded; **unconfirmed** — still needs an owner decision. Every non-`none` `ref` resolves to an existing heading in the contract set.

Percentages are count / document total, rounded to two decimals. Independent rounding can make displayed percentages not sum to 100%. Totals below are weighted by atomic units, not averaged across documents.

## Deletion holds

These are section-level holds, not indefinite retention of entire files. Do not prune a held section until its requirement is folded into its owner, its evidence is preserved where required, and the disposition is verified.

- Keep active work, verification, and authorization in the `docs/alignment-plan.md` ledger; retain its IDs and recorded evidence.
- Fold scoped execution, test-authorization, and evidence requirements SAFE1–SAFE3 before pruning their source sections.
- Verify and fold unique procedures in `DEVELOPMENT.md`, `CONTRIBUTING.md`, and `CLI-INSTRUCTIONS.md` before removing their sections.
- Preserve unresolved IDs, option definitions, and answers from inventory and questionnaire material; later accepted answers govern, but unresolved context is not disposable.

## Documents

| Document | Total | Exists | Discard | Integrate | Unconfirmed |
|---|---:|---:|---:|---:|---:|
| [docs/test-suite-improvement-report.md](../docs/test-suite-improvement-report.md) | 685 | 54 (7.88%) | 462 (67.45%) | 103 (15.04%) | 66 (9.64%) |
| [docs/aoe-functionality-map.md](../docs/aoe-functionality-map.md) | 480 | 1 (0.21%) | 472 (98.33%) | 4 (0.83%) | 3 (0.63%) |
| [docs/aoe-agent-workspace-reference.md](../docs/aoe-agent-workspace-reference.md) | 312 | 8 (2.56%) | 249 (79.81%) | 4 (1.28%) | 51 (16.35%) |
| [docs/aoe-status-tracking-plan.md](../docs/aoe-status-tracking-plan.md) | 302 | 49 (16.23%) | 128 (42.38%) | 44 (14.57%) | 81 (26.82%) |
| [docs/opentui-workspace-session-contract.md](../docs/opentui-workspace-session-contract.md) | 256 | 100 (39.06%) | 79 (30.86%) | 42 (16.41%) | 35 (13.67%) |
| [docs/opentui-workspace-spec.md](../docs/opentui-workspace-spec.md) | 237 | 115 (48.52%) | 59 (24.89%) | 38 (16.03%) | 25 (10.55%) |
| [docs/opentui-workspace-implementation-plan.md](../docs/opentui-workspace-implementation-plan.md) | 222 | 69 (31.08%) | 92 (41.44%) | 22 (9.91%) | 39 (17.57%) |
| [docs/shared-agent-server-plan.md](../docs/shared-agent-server-plan.md) | 207 | 88 (42.51%) | 67 (32.37%) | 20 (9.66%) | 32 (15.46%) |
| [docs/aoe-lifecycle-implementation-plan.md](../docs/aoe-lifecycle-implementation-plan.md) | 202 | 25 (12.38%) | 137 (67.82%) | 1 (0.50%) | 39 (19.31%) |
| [docs/questionnaire-02.md](../docs/questionnaire-02.md) | 195 | 61 (31.28%) | 36 (18.46%) | 0 (0.00%) | 98 (50.26%) |
| [docs/agent-handover.md](../docs/agent-handover.md) | 191 | 29 (15.18%) | 92 (48.17%) | 54 (28.27%) | 16 (8.38%) |
| [docs/opentui-workspace-behavior-matrix.md](../docs/opentui-workspace-behavior-matrix.md) | 186 | 82 (44.09%) | 60 (32.26%) | 25 (13.44%) | 19 (10.22%) |
| [docs/storage-review-downloads.md](../docs/storage-review-downloads.md) | 186 | 0 (0.00%) | 148 (79.57%) | 0 (0.00%) | 38 (20.43%) |
| [docs/tmux-layer-spec.md](../docs/tmux-layer-spec.md) | 183 | 0 (0.00%) | 17 (9.29%) | 0 (0.00%) | 166 (90.71%) |
| [docs/alignment-plan.md](../docs/alignment-plan.md) | 182 | 68 (37.36%) | 52 (28.57%) | 8 (4.40%) | 54 (29.67%) |
| [docs/recent-app-file-activity.md](../docs/recent-app-file-activity.md) | 179 | 0 (0.00%) | 144 (80.45%) | 0 (0.00%) | 35 (19.55%) |
| [docs/BACK-728-handoff.md](../docs/BACK-728-handoff.md) | 172 | 16 (9.30%) | 115 (66.86%) | 13 (7.56%) | 28 (16.28%) |
| [docs/tmux-call-sites.md](../docs/tmux-call-sites.md) | 149 | 1 (0.67%) | 93 (62.42%) | 0 (0.00%) | 55 (36.91%) |
| [docs/storage-review-zesty.md](../docs/storage-review-zesty.md) | 138 | 0 (0.00%) | 119 (86.23%) | 0 (0.00%) | 19 (13.77%) |
| [docs/questionnaire.md](../docs/questionnaire.md) | 123 | 79 (64.23%) | 34 (27.64%) | 0 (0.00%) | 10 (8.13%) |
| [docs/app-directory-map.md](../docs/app-directory-map.md) | 118 | 1 (0.85%) | 116 (98.31%) | 0 (0.00%) | 1 (0.85%) |
| [docs/modes-delivery-plan.md](../docs/modes-delivery-plan.md) | 117 | 23 (19.66%) | 57 (48.72%) | 11 (9.40%) | 26 (22.22%) |
| [docs/questionnaire-03.md](../docs/questionnaire-03.md) | 111 | 73 (65.77%) | 36 (32.43%) | 0 (0.00%) | 2 (1.80%) |
| [docs/storage-review-sessions.md](../docs/storage-review-sessions.md) | 110 | 0 (0.00%) | 80 (72.73%) | 0 (0.00%) | 30 (27.27%) |
| [docs/footer-search-recovery-handover.md](../docs/footer-search-recovery-handover.md) | 108 | 16 (14.81%) | 62 (57.41%) | 18 (16.67%) | 12 (11.11%) |
| [docs/shared-agent-runtime-handoff.md](../docs/shared-agent-runtime-handoff.md) | 108 | 16 (14.81%) | 62 (57.41%) | 10 (9.26%) | 20 (18.52%) |
| [docs/SPEC-unconfirmed.md](../docs/SPEC-unconfirmed.md) | 107 | 31 (28.97%) | 23 (21.50%) | 0 (0.00%) | 53 (49.53%) |
| [docs/test-suite-remediation-plan.md](../docs/test-suite-remediation-plan.md) | 106 | 11 (10.38%) | 43 (40.57%) | 18 (16.98%) | 34 (32.08%) |
| [docs/test-suite-runtime-report.md](../docs/test-suite-runtime-report.md) | 105 | 8 (7.62%) | 78 (74.29%) | 8 (7.62%) | 11 (10.48%) |
| [docs/shared-agent-runtime-simplification.md](../docs/shared-agent-runtime-simplification.md) | 98 | 40 (40.82%) | 35 (35.71%) | 7 (7.14%) | 16 (16.33%) |
| [docs/agent-session-ownership-plan.md](../docs/agent-session-ownership-plan.md) | 97 | 10 (10.31%) | 75 (77.32%) | 0 (0.00%) | 12 (12.37%) |
| [docs/pending-decisions.md](../docs/pending-decisions.md) | 96 | 7 (7.29%) | 70 (72.92%) | 10 (10.42%) | 9 (9.38%) |
| [docs/storage-review-projects.md](../docs/storage-review-projects.md) | 94 | 0 (0.00%) | 84 (89.36%) | 0 (0.00%) | 10 (10.64%) |
| [docs/questionnaire-05.md](../docs/questionnaire-05.md) | 83 | 57 (68.67%) | 12 (14.46%) | 0 (0.00%) | 14 (16.87%) |
| [docs/storage-review-gvm.md](../docs/storage-review-gvm.md) | 81 | 0 (0.00%) | 57 (70.37%) | 0 (0.00%) | 24 (29.63%) |
| [docs/aoe-multi-client-deletion-source-audit.md](../docs/aoe-multi-client-deletion-source-audit.md) | 76 | 12 (15.79%) | 56 (73.68%) | 0 (0.00%) | 8 (10.53%) |
| [docs/handoff.md](../docs/handoff.md) | 73 | 7 (9.59%) | 52 (71.23%) | 4 (5.48%) | 10 (13.70%) |
| [docs/refactoring-review.md](../docs/refactoring-review.md) | 66 | 11 (16.67%) | 27 (40.91%) | 17 (25.76%) | 11 (16.67%) |
| [docs/opencode-migration.md](../docs/opencode-migration.md) | 63 | 1 (1.59%) | 21 (33.33%) | 0 (0.00%) | 41 (65.08%) |
| [docs/aoe-lifecycle-comparison.md](../docs/aoe-lifecycle-comparison.md) | 62 | 3 (4.84%) | 51 (82.26%) | 0 (0.00%) | 8 (12.90%) |
| [docs/storage-review-docker.md](../docs/storage-review-docker.md) | 61 | 0 (0.00%) | 54 (88.52%) | 0 (0.00%) | 7 (11.48%) |
| [docs/agent-of-empires-runtime-research.md](../docs/agent-of-empires-runtime-research.md) | 59 | 22 (37.29%) | 32 (54.24%) | 0 (0.00%) | 5 (8.47%) |
| [docs/refactoring-handoff.md](../docs/refactoring-handoff.md) | 56 | 9 (16.07%) | 21 (37.50%) | 14 (25.00%) | 12 (21.43%) |
| [docs/modes-phase1-contract.md](../docs/modes-phase1-contract.md) | 47 | 9 (19.15%) | 18 (38.30%) | 8 (17.02%) | 12 (25.53%) |
| [docs/storage-cleanup-plan.md](../docs/storage-cleanup-plan.md) | 38 | 0 (0.00%) | 9 (23.68%) | 0 (0.00%) | 29 (76.32%) |
| [docs/questionnaire-06.md](../docs/questionnaire-06.md) | 34 | 9 (26.47%) | 9 (26.47%) | 0 (0.00%) | 16 (47.06%) |
| [docs/disk-growth-investigation.md](../docs/disk-growth-investigation.md) | 32 | 1 (3.13%) | 25 (78.13%) | 0 (0.00%) | 6 (18.75%) |
| [docs/questionnaire-04.md](../docs/questionnaire-04.md) | 32 | 26 (81.25%) | 6 (18.75%) | 0 (0.00%) | 0 (0.00%) |
| [docs/aoe-natural-completion-resume-source-audit.md](../docs/aoe-natural-completion-resume-source-audit.md) | 30 | 6 (20.00%) | 22 (73.33%) | 0 (0.00%) | 2 (6.67%) |
| [docs/research-requirements-documentation.md](../docs/research-requirements-documentation.md) | 30 | 8 (26.67%) | 12 (40.00%) | 0 (0.00%) | 10 (33.33%) |
| [docs/research-architecture-documentation.md](../docs/research-architecture-documentation.md) | 25 | 8 (32.00%) | 10 (40.00%) | 0 (0.00%) | 7 (28.00%) |
| [docs/research-ui-documentation.md](../docs/research-ui-documentation.md) | 23 | 10 (43.48%) | 9 (39.13%) | 0 (0.00%) | 4 (17.39%) |
| [docs/consolidation-audit.md](../docs/consolidation-audit.md) | 20 | 1 (5.00%) | 18 (90.00%) | 0 (0.00%) | 1 (5.00%) |
| [docs/IMPACT_LATEST.md](../docs/IMPACT_LATEST.md) | 15 | 6 (40.00%) | 3 (20.00%) | 1 (6.67%) | 5 (33.33%) |
| [docs/questionnaire-07.md](../docs/questionnaire-07.md) | 15 | 4 (26.67%) | 4 (26.67%) | 0 (0.00%) | 7 (46.67%) |

## Aggregate (weighted by atomic units)

Total units: **7183**

- **exists:** 1291 (17.97%)
- **discard:** 4004 (55.74%)
- **integrate:** 504 (7.02%)
- **unconfirmed:** 1384 (19.27%)

## Exclusions

Core contracts excluded from mapping: `AGENTS.md`, `README.md`, `docs/PRODUCT.md`, `docs/SPEC.md`, `docs/BLUEPRINT.md`, `docs/CONVENTIONS.md`, `docs/DESIGN-SYSTEM.md`, `docs/README.md`; directory trees: `docs/specs/`, `docs/architecture/`, `docs/screens/`, `docs/adr/`.

`CLAUDE.md` is a symlink alias to `AGENTS.md`; it is preserved and not double-counted. This report, and the `docs/alignment-plan.md` execution ledger, are excluded from the mapping.
