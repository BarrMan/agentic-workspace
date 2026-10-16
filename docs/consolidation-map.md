# Consolidation mapping report

> **PROVISIONAL — NOT SOURCE-VALIDATED OR DELETION-READY.** These percentages and counts reflect old classifications, not validation against the confirmed primary source set; they do not establish approval, supersession, or safe disposal. Do not use them to prune. Source-to-core audit, safe-disposal checks, and parent reconciliation remain required. The exact known-source inventory is not yet complete.

## Method

Atomic unit means one independently meaningful assertion, feature, requirement, question, recommendation, or evidence finding; indivisible multi-sentence assertions count once. Structural headings, table headings, empty placeholders, TOCs, and bare bibliography links are not units. Marker comments are visible in source Markdown and are the evidence for each count.

This report is **provisional**. Its counts preserve the earlier classifications and are not source-validated, approval evidence, or deletion-ready. Confirmed primary sources are `docs/session-service-redesign.md`, `docs/session-service-redesign-brief.md`, actually answered questionnaire items, and recorded owner decision answers; every other document remains unconfirmed unless validated against that source set. Do not infer approval from reports, code, current core text, or unanswered recommendations. Core documents are consolidation destinations, not independent approval evidence in this repair. Conflicting confirmed sources require escalation unless explicitly superseded. Stop pruning until source-to-core audit and safe-disposal checks are complete. The known-source inventory is not yet complete. Counts require parent reconciliation after that audit; no claim of consolidation completeness is made.

## Deletion holds

These are section-level holds, not indefinite retention of entire files. Do not prune a held section until its requirement is folded into its owner, its evidence is preserved where required, and the disposition is verified. No implementation gate is closed by this inventory.

- Keep active work, verification, and authorization in the `docs/alignment-plan.md` ledger; retain its IDs and recorded evidence.
- Preserve or fold cited provenance excerpts in `docs/session-service-redesign*` sources before deleting them; do not discard source evidence solely because a claim is covered elsewhere.
- Fold scoped execution, test-authorization, and evidence requirements SAFE1–SAFE3 before pruning their source sections.
- Verify and fold unique procedures in `DEVELOPMENT.md`, `CONTRIBUTING.md`, and `CLI-INSTRUCTIONS.md` before removing their sections.
- Preserve unresolved IDs, option definitions, and answers from inventory and questionnaire material; later accepted answers govern, but unresolved context is not disposable.

Percentages are count / document total, rounded to two decimals. Independent rounding can make displayed percentages not sum to 100%. Totals below are weighted by atomic units, not averaged across documents.

## Documents

| Document | Total | Exists | Discard | Integrate | Unconfirmed |
|---|---:|---:|---:|---:|---:|
| [ADVANCED-CONFIG.md](../ADVANCED-CONFIG.md) | 76 | 0 (0.00%) | 22 (28.95%) | 0 (0.00%) | 54 (71.05%) |
| [CLI-INSTRUCTIONS.md](../CLI-INSTRUCTIONS.md) | 255 | 12 (4.71%) | 19 (7.45%) | 3 (1.18%) | 221 (86.67%) |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | 11 | 2 (18.18%) | 8 (72.73%) | 0 (0.00%) | 1 (9.09%) |
| [DEVELOPMENT.md](../DEVELOPMENT.md) | 70 | 10 (14.29%) | 19 (27.14%) | 0 (0.00%) | 41 (58.57%) |
| [docs/agent-handover.md](../docs/agent-handover.md) | 191 | 30 (15.71%) | 92 (48.17%) | 54 (28.27%) | 15 (7.85%) |
| [docs/agent-of-empires-runtime-research.md](../docs/agent-of-empires-runtime-research.md) | 59 | 23 (38.98%) | 32 (54.24%) | 0 (0.00%) | 4 (6.78%) |
| [docs/agent-session-ownership-plan.md](../docs/agent-session-ownership-plan.md) | 97 | 10 (10.31%) | 75 (77.32%) | 0 (0.00%) | 12 (12.37%) |
| [docs/alignment-plan.md](../docs/alignment-plan.md) | 219 | 82 (37.44%) | 62 (28.31%) | 8 (3.65%) | 67 (30.59%) |
| [docs/aoe-agent-workspace-reference.md](../docs/aoe-agent-workspace-reference.md) | 312 | 11 (3.53%) | 249 (79.81%) | 4 (1.28%) | 48 (15.38%) |
| [docs/aoe-functionality-map.md](../docs/aoe-functionality-map.md) | 480 | 4 (0.83%) | 472 (98.33%) | 4 (0.83%) | 0 (0.00%) |
| [docs/aoe-lifecycle-comparison.md](../docs/aoe-lifecycle-comparison.md) | 62 | 3 (4.84%) | 51 (82.26%) | 0 (0.00%) | 8 (12.90%) |
| [docs/aoe-lifecycle-implementation-plan.md](../docs/aoe-lifecycle-implementation-plan.md) | 202 | 25 (12.38%) | 137 (67.82%) | 1 (0.50%) | 39 (19.31%) |
| [docs/aoe-multi-client-deletion-source-audit.md](../docs/aoe-multi-client-deletion-source-audit.md) | 76 | 15 (19.74%) | 56 (73.68%) | 0 (0.00%) | 5 (6.58%) |
| [docs/aoe-natural-completion-resume-source-audit.md](../docs/aoe-natural-completion-resume-source-audit.md) | 30 | 6 (20.00%) | 22 (73.33%) | 0 (0.00%) | 2 (6.67%) |
| [docs/aoe-status-tracking-plan.md](../docs/aoe-status-tracking-plan.md) | 302 | 49 (16.23%) | 128 (42.38%) | 44 (14.57%) | 81 (26.82%) |
| [docs/app-directory-map.md](../docs/app-directory-map.md) | 118 | 1 (0.85%) | 116 (98.31%) | 0 (0.00%) | 1 (0.85%) |
| [docs/BACK-728-handoff.md](../docs/BACK-728-handoff.md) | 172 | 16 (9.30%) | 115 (66.86%) | 13 (7.56%) | 28 (16.28%) |
| [docs/decision-answers-2.md](../docs/decision-answers-2.md) | 65 | 5 (7.69%) | 37 (56.92%) | 17 (26.15%) | 6 (9.23%) |
| [docs/decision-answers-3.md](../docs/decision-answers-3.md) | 19 | 2 (10.53%) | 10 (52.63%) | 0 (0.00%) | 7 (36.84%) |
| [docs/decision-answers-4.md](../docs/decision-answers-4.md) | 15 | 2 (13.33%) | 6 (40.00%) | 0 (0.00%) | 7 (46.67%) |
| [docs/decision-answers-5.md](../docs/decision-answers-5.md) | 25 | 4 (16.00%) | 11 (44.00%) | 3 (12.00%) | 7 (28.00%) |
| [docs/decision-answers-6.md](../docs/decision-answers-6.md) | 53 | 4 (7.55%) | 37 (69.81%) | 4 (7.55%) | 8 (15.09%) |
| [docs/decision-answers-7.md](../docs/decision-answers-7.md) | 53 | 3 (5.66%) | 37 (69.81%) | 6 (11.32%) | 7 (13.21%) |
| [docs/decision-answers-8.md](../docs/decision-answers-8.md) | 91 | 5 (5.49%) | 52 (57.14%) | 21 (23.08%) | 13 (14.29%) |
| [docs/decision-answers-9.md](../docs/decision-answers-9.md) | 9 | 3 (33.33%) | 5 (55.56%) | 0 (0.00%) | 1 (11.11%) |
| [docs/decision-answers.md](../docs/decision-answers.md) | 93 | 13 (13.98%) | 53 (56.99%) | 13 (13.98%) | 14 (15.05%) |
| [docs/disk-growth-investigation.md](../docs/disk-growth-investigation.md) | 32 | 1 (3.12%) | 25 (78.12%) | 0 (0.00%) | 6 (18.75%) |
| [docs/footer-search-recovery-handover.md](../docs/footer-search-recovery-handover.md) | 108 | 17 (15.74%) | 62 (57.41%) | 18 (16.67%) | 11 (10.19%) |
| [docs/handoff.md](../docs/handoff.md) | 73 | 9 (12.33%) | 52 (71.23%) | 4 (5.48%) | 8 (10.96%) |
| [docs/IMPACT_LATEST.md](../docs/IMPACT_LATEST.md) | 15 | 6 (40.00%) | 3 (20.00%) | 1 (6.67%) | 5 (33.33%) |
| [docs/modes-delivery-plan.md](../docs/modes-delivery-plan.md) | 118 | 25 (21.19%) | 57 (48.31%) | 11 (9.32%) | 25 (21.19%) |
| [docs/modes-phase1-contract.md](../docs/modes-phase1-contract.md) | 48 | 10 (20.83%) | 18 (37.50%) | 8 (16.67%) | 12 (25.00%) |
| [docs/opencode-migration.md](../docs/opencode-migration.md) | 63 | 1 (1.59%) | 21 (33.33%) | 0 (0.00%) | 41 (65.08%) |
| [docs/opentui-workspace-behavior-matrix.md](../docs/opentui-workspace-behavior-matrix.md) | 186 | 83 (44.62%) | 60 (32.26%) | 25 (13.44%) | 18 (9.68%) |
| [docs/opentui-workspace-implementation-plan.md](../docs/opentui-workspace-implementation-plan.md) | 222 | 70 (31.53%) | 92 (41.44%) | 22 (9.91%) | 38 (17.12%) |
| [docs/opentui-workspace-session-contract.md](../docs/opentui-workspace-session-contract.md) | 257 | 102 (39.69%) | 79 (30.74%) | 42 (16.34%) | 34 (13.23%) |
| [docs/opentui-workspace-spec.md](../docs/opentui-workspace-spec.md) | 237 | 119 (50.21%) | 59 (24.89%) | 38 (16.03%) | 21 (8.86%) |
| [docs/pending-decisions.md](../docs/pending-decisions.md) | 96 | 8 (8.33%) | 70 (72.92%) | 10 (10.42%) | 8 (8.33%) |
| [docs/questionnaire-02.md](../docs/questionnaire-02.md) | 195 | 64 (32.82%) | 36 (18.46%) | 0 (0.00%) | 95 (48.72%) |
| [docs/questionnaire-03.md](../docs/questionnaire-03.md) | 111 | 75 (67.57%) | 36 (32.43%) | 0 (0.00%) | 0 (0.00%) |
| [docs/questionnaire-04.md](../docs/questionnaire-04.md) | 32 | 26 (81.25%) | 6 (18.75%) | 0 (0.00%) | 0 (0.00%) |
| [docs/questionnaire-05.md](../docs/questionnaire-05.md) | 83 | 59 (71.08%) | 12 (14.46%) | 0 (0.00%) | 12 (14.46%) |
| [docs/questionnaire-06.md](../docs/questionnaire-06.md) | 34 | 10 (29.41%) | 9 (26.47%) | 0 (0.00%) | 15 (44.12%) |
| [docs/questionnaire.md](../docs/questionnaire.md) | 123 | 86 (69.92%) | 34 (27.64%) | 0 (0.00%) | 3 (2.44%) |
| [docs/recent-app-file-activity.md](../docs/recent-app-file-activity.md) | 179 | 0 (0.00%) | 144 (80.45%) | 0 (0.00%) | 35 (19.55%) |
| [docs/refactoring-handoff.md](../docs/refactoring-handoff.md) | 56 | 9 (16.07%) | 21 (37.50%) | 14 (25.00%) | 12 (21.43%) |
| [docs/refactoring-review.md](../docs/refactoring-review.md) | 66 | 12 (18.18%) | 27 (40.91%) | 17 (25.76%) | 10 (15.15%) |
| [docs/research-architecture-documentation.md](../docs/research-architecture-documentation.md) | 25 | 12 (48.00%) | 10 (40.00%) | 0 (0.00%) | 3 (12.00%) |
| [docs/research-requirements-documentation.md](../docs/research-requirements-documentation.md) | 30 | 16 (53.33%) | 12 (40.00%) | 0 (0.00%) | 2 (6.67%) |
| [docs/research-ui-documentation.md](../docs/research-ui-documentation.md) | 23 | 12 (52.17%) | 9 (39.13%) | 0 (0.00%) | 2 (8.70%) |
| [docs/session-persistence-decisions.md](../docs/session-persistence-decisions.md) | 72 | 38 (52.78%) | 17 (23.61%) | 4 (5.56%) | 13 (18.06%) |
| [docs/session-service-redesign-brief.md](../docs/session-service-redesign-brief.md) | 84 | 31 (36.90%) | 49 (58.33%) | 0 (0.00%) | 4 (4.76%) |
| [docs/session-service-redesign-correction-plan.md](../docs/session-service-redesign-correction-plan.md) | 218 | 138 (63.30%) | 43 (19.72%) | 0 (0.00%) | 37 (16.97%) |
| [docs/session-service-redesign-implementation-plan.md](../docs/session-service-redesign-implementation-plan.md) | 356 | 231 (64.89%) | 102 (28.65%) | 4 (1.12%) | 19 (5.34%) |
| [docs/session-service-redesign.md](../docs/session-service-redesign.md) | 150 | 141 (94.00%) | 8 (5.33%) | 0 (0.00%) | 1 (0.67%) |
| [docs/shared-agent-runtime-handoff.md](../docs/shared-agent-runtime-handoff.md) | 110 | 22 (20.00%) | 62 (56.36%) | 10 (9.09%) | 16 (14.55%) |
| [docs/shared-agent-runtime-simplification.md](../docs/shared-agent-runtime-simplification.md) | 98 | 45 (45.92%) | 35 (35.71%) | 7 (7.14%) | 11 (11.22%) |
| [docs/shared-agent-server-plan.md](../docs/shared-agent-server-plan.md) | 207 | 91 (43.96%) | 67 (32.37%) | 20 (9.66%) | 29 (14.01%) |
| [docs/SPEC-unconfirmed.md](../docs/SPEC-unconfirmed.md) | 108 | 32 (29.63%) | 23 (21.30%) | 0 (0.00%) | 53 (49.07%) |
| [docs/storage-cleanup-plan.md](../docs/storage-cleanup-plan.md) | 38 | 0 (0.00%) | 9 (23.68%) | 0 (0.00%) | 29 (76.32%) |
| [docs/storage-review-docker.md](../docs/storage-review-docker.md) | 61 | 0 (0.00%) | 54 (88.52%) | 0 (0.00%) | 7 (11.48%) |
| [docs/storage-review-downloads.md](../docs/storage-review-downloads.md) | 186 | 0 (0.00%) | 148 (79.57%) | 0 (0.00%) | 38 (20.43%) |
| [docs/storage-review-gvm.md](../docs/storage-review-gvm.md) | 81 | 0 (0.00%) | 57 (70.37%) | 0 (0.00%) | 24 (29.63%) |
| [docs/storage-review-projects.md](../docs/storage-review-projects.md) | 94 | 0 (0.00%) | 84 (89.36%) | 0 (0.00%) | 10 (10.64%) |
| [docs/storage-review-sessions.md](../docs/storage-review-sessions.md) | 110 | 0 (0.00%) | 80 (72.73%) | 0 (0.00%) | 30 (27.27%) |
| [docs/storage-review-zesty.md](../docs/storage-review-zesty.md) | 138 | 0 (0.00%) | 119 (86.23%) | 0 (0.00%) | 19 (13.77%) |
| [docs/test-suite-improvement-report.md](../docs/test-suite-improvement-report.md) | 685 | 55 (8.03%) | 462 (67.45%) | 103 (15.04%) | 65 (9.49%) |
| [docs/test-suite-remediation-plan.md](../docs/test-suite-remediation-plan.md) | 106 | 17 (16.04%) | 43 (40.57%) | 18 (16.98%) | 28 (26.42%) |
| [docs/test-suite-runtime-report.md](../docs/test-suite-runtime-report.md) | 105 | 8 (7.62%) | 78 (74.29%) | 8 (7.62%) | 11 (10.48%) |
| [docs/tmux-call-sites.md](../docs/tmux-call-sites.md) | 149 | 1 (0.67%) | 93 (62.42%) | 0 (0.00%) | 55 (36.91%) |
| [docs/tmux-layer-spec.md](../docs/tmux-layer-spec.md) | 183 | 0 (0.00%) | 17 (9.29%) | 0 (0.00%) | 166 (90.71%) |

## Aggregate (weighted by atomic units)

Total units: **8906**

- **exists:** 2022 (22.70%)
- **discard:** 4527 (50.83%)
- **integrate:** 579 (6.50%)
- **unconfirmed:** 1778 (19.96%)

## Exclusions

Core comparison destinations excluded from mapping: `AGENTS.md`, `README.md`, `docs/BLUEPRINT.md`, `docs/CONVENTIONS.md`, `docs/DESIGN-SYSTEM.md`, `docs/PRODUCT.md`, `docs/README.md`, `docs/SPEC.md`; directory trees: `docs/specs/`, `docs/architecture/`, `docs/screens/`, `docs/adr/`.

`CLAUDE.md` is a symlink alias to `AGENTS.md`; it is preserved and not double-counted. The generated report itself is excluded from the mapping.
