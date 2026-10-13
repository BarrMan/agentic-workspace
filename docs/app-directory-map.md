# AgenticWorkspace — App Directory Map

Root: `/Users/imribarr/Projects/agentic-workspace`
Measured: **2026-10-08** at HEAD `dd00d061` (working tree).  
Files mapped: **651**  ·  Measured bytes: **18,816,852 B** (~17.9 MiB)  
Excluded from the map entirely: `node_modules/`, `.git/`, `dist/`, `tmp/`, `coverage/`, and this map file itself (`docs/app-directory-map.md`).  
Sizes measured with `stat -f %z`; line counts with `wc -l`; `binary` = non-text extension (no line count).  
Tags come from path, directory role and targeted symbol/export peeks (`head`/grep). Anything not read end-to-end is `[INFERENCE]`.  
Empty directories carry no files and are omitted.

> **Historical snapshot.** This map measures the tree as of the date and HEAD above; it is not regenerated. Entries naming the legacy blessed TUI (`neo-neo-bblessed`, `src/ui/task-viewer/`, `src/ui/unified/`, `src/ui/components/`, `src/ui/overview-tui.ts`, `src/ui/overview-content.ts`, `src/core/tui-task-edit-session.ts`, `scripts/run-tui-interactive-tests.sh`, `tools/tui-screenshot-compare.sh`, and the blessed-only tests) have since been removed. The surviving interactive UI is OpenTUI. The test-helper inventory selectively omits a removed test-the-test entry; aggregate snapshot totals remain historical.

## 1. Full inventory tree

Every non-excluded file, with measured size, line count and tags.

```
.
├── .codex/
│   └── .gitignore — 10 B — 1 L — #agent-editor-config
├── .fallow/
│   ├── .gitignore — 2 B — 1 L — #tool-cache
│   ├── cache.bin — 6,911,777 B — binary — #tool-cache
│   ├── churn.bin — 271,843 B — binary — #tool-cache
│   └── graph-cache.bin — 1,121,227 B — binary — #tool-cache
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md — 497 B — 25 L — #repo-meta
│   │   └── feature_request.md — 429 B — 15 L — #repo-meta
│   ├── workflows/
│   │   ├── ci.yml — 6,736 B — 171 L — #ci-workflow
│   │   └── release.yml — 19,259 B — 527 L — #ci-workflow
│   ├── 5-minute-tour-256.png — 22,031 B — binary — #asset-image #repo-meta
│   ├── PULL_REQUEST_TEMPLATE.md — 1,019 B — 21 L — #repo-meta
│   ├── backlog-logo.png — 167,239 B — binary — #asset-image #repo-meta
│   ├── backlog-v1.40.gif — 2,632,070 B — binary — #asset-image #repo-meta
│   ├── backlog.jpg — 210,181 B — binary — #asset-image #repo-meta
│   ├── backlog.mp4 — 753,506 B — binary — #asset-video #repo-meta
│   ├── cli-reference-256.png — 17,829 B — binary — #asset-image #repo-meta
│   ├── configuration-256.png — 23,875 B — binary — #asset-image #repo-meta
│   ├── copilot-instructions.md — 1,790 B — 50 L — #repo-meta
│   ├── favicon.png — 1,405,793 B — binary — #asset-image #repo-meta
│   ├── sharing-export-256.png — 15,912 B — binary — #asset-image #repo-meta
│   ├── video-presentation.md — 83 B — 4 L — #repo-meta
│   ├── web-interface-256.png — 25,232 B — binary — #asset-image #repo-meta
│   └── web.jpeg — 119,265 B — binary — #asset-image #repo-meta
├── .husky/
│   ├── _/
│   │   ├── .gitignore — 1 B — 0 L — #git-hook
│   │   ├── applypatch-msg — 39 B — 1 L — #git-hook
│   │   ├── commit-msg — 39 B — 1 L — #git-hook
│   │   ├── h — 551 B — 22 L — #git-hook
│   │   ├── husky.sh — 160 B — 8 L — #git-hook
│   │   ├── post-applypatch — 39 B — 1 L — #git-hook
│   │   ├── post-checkout — 39 B — 1 L — #git-hook
│   │   ├── post-commit — 39 B — 1 L — #git-hook
│   │   ├── post-merge — 39 B — 1 L — #git-hook
│   │   ├── post-rewrite — 39 B — 1 L — #git-hook
│   │   ├── pre-applypatch — 39 B — 1 L — #git-hook
│   │   ├── pre-auto-gc — 39 B — 1 L — #git-hook
│   │   ├── pre-commit — 39 B — 1 L — #git-hook
│   │   ├── pre-merge-commit — 39 B — 1 L — #git-hook
│   │   ├── pre-push — 39 B — 1 L — #git-hook
│   │   ├── pre-rebase — 39 B — 1 L — #git-hook
│   │   └── prepare-commit-msg — 39 B — 1 L — #git-hook
│   └── pre-commit — 119 B — 5 L — #git-hook
├── .omp/
│   └── extensions/
│       └── rtk.ts — 4,835 B — 137 L — #agent-editor-config
├── .pi/
│   └── subagentura-state.json — 190 B — 9 L — #agent-editor-config
├── .serena/
│   ├── cache/
│   │   └── typescript/
│   │       ├── document_symbols.pkl — 78,765 B — binary — #agent-editor-config
│   │       └── raw_document_symbols.pkl — 22,846 B — binary — #agent-editor-config
│   ├── .gitignore — 26 B — 2 L — #agent-editor-config
│   ├── project.local.yml — 402 B — 5 L — #agent-editor-config
│   └── project.yml — 9,788 B — 169 L — #agent-editor-config
├── .vscode/
│   └── launch.json — 415 B — 17 L — #agent-editor-config
├── backlog/
│   └── config.yml — 576 B — 18 L — #backlog-config
├── completions/
│   ├── .gitkeep — 599 B — 15 L — #asset-completion #shell-completion
│   ├── EXAMPLES.md — 4,872 B — 218 L — #asset-completion #shell-completion
│   ├── README.md — 6,208 B — 287 L — #asset-completion #shell-completion
│   ├── _backlog — 1,133 B — 35 L — #asset-completion #shell-completion
│   ├── backlog.bash — 2,081 B — 64 L — #asset-completion #shell-completion
│   ├── backlog.fish — 1,443 B — 38 L — #asset-completion #shell-completion
│   └── backlog.ps1 — 1,395 B — 43 L — #asset-completion #shell-completion
├── docs/
│   ├── BACK-728-handoff.md — 21,129 B — 458 L — #doc-spec
│   ├── agent-session-ownership-plan.md — 18,528 B — 149 L — #doc-spec
│   ├── aoe-agent-workspace-reference.md — 40,575 B — 690 L — #doc-spec
│   ├── aoe-lifecycle-comparison.md — 20,553 B — 94 L — #doc-spec
│   ├── aoe-lifecycle-implementation-plan.md — 58,041 B — 432 L — #doc-spec
│   ├── aoe-status-tracking-plan.md — 50,166 B — 495 L — #doc-spec
│   ├── disk-growth-investigation.md — 5,126 B — 93 L — #doc-spec
│   ├── opentui-workspace-behavior-matrix.md — 29,211 B — 135 L — #doc-spec
│   ├── opentui-workspace-implementation-plan.md — 21,627 B — 312 L — #doc-spec
│   ├── opentui-workspace-session-contract.md — 30,002 B — 245 L — #doc-spec
│   ├── opentui-workspace-spec.md — 21,134 B — 324 L — #doc-spec
│   ├── test-suite-runtime-report.md — 12,021 B — 204 L — #doc-spec
│   ├── tmux-call-sites.md — 23,904 B — 371 L — #doc-spec
│   └── tmux-layer-spec.md — 27,741 B — 475 L — #doc-spec
├── scripts/
│   ├── benchmark-task-loading.ts — 24,285 B — 726 L — #build-script
│   ├── build.ts — 1,068 B — 43 L — #build-script
│   ├── cli.cjs — 4,227 B — 116 L — #build-script
│   ├── postuninstall.cjs — 989 B — 37 L — #build-script
│   ├── resolveBinary.cjs — 1,997 B — 57 L — #build-script
│   ├── run-tui-interactive-tests.sh — 446 B — 15 L — #build-script
│   ├── smoke-compiled-build.ts — 7,514 B — 237 L — #build-script
│   └── smoke-parallel-task-locking.sh — 9,445 B — 356 L — #build-script
├── src/
│   ├── agent-workspace/
│   │   ├── live/
│   │   │   ├── input/
│   │   │   │   └── worker.ts — 3,728 B — 111 L — #agent-live #agent-session #agent-worker
│   │   │   ├── tmux/
│   │   │   │   ├── exec.ts — 3,316 B — 93 L — #agent-live #agent-session #agent-tmux
│   │   │   │   ├── socket.test.ts — 3,038 B — 88 L — #test-suite #test-unit
│   │   │   │   ├── socket.ts — 3,891 B — 86 L — #agent-live #agent-session #agent-tmux
│   │   │   │   ├── types.ts — 2,060 B — 47 L — #agent-live #agent-session #agent-tmux #types-only
│   │   │   │   └── vt-channel.ts — 32,893 B — 833 L — #agent-live #agent-session #agent-tmux
│   │   │   ├── agent-host.ts — 16,812 B — 430 L — #agent-live #agent-session
│   │   │   ├── existing-agent-host.ts — 3,788 B — 106 L — #agent-live #agent-session
│   │   │   └── latency-trace.ts — 492 B — 11 L — #agent-live #agent-session
│   │   ├── agent-status-probe.ts — 4,553 B — 112 L — #agent-session #agent-status #agent-tmux
│   │   ├── agent-status.test.ts — 8,732 B — 228 L — #test-suite #test-unit
│   │   ├── agent-status.ts — 11,433 B — 251 L — #agent-session #agent-status
│   │   ├── bootstrap.test.ts — 5,743 B — 144 L — #test-suite #test-unit
│   │   ├── bootstrap.ts — 4,238 B — 133 L — #agent-session
│   │   ├── config.test.ts — 10,221 B — 272 L — #test-suite #test-unit
│   │   ├── config.ts — 10,601 B — 286 L — #agent-session
│   │   ├── process-tree.ts — 9,265 B — 205 L — #agent-session
│   │   ├── session-launch.test.ts — 20,494 B — 497 L — #test-suite #test-unit
│   │   ├── session-launch.ts — 12,213 B — 285 L — #agent-session
│   │   ├── session-process.ts — 18,752 B — 483 L — #agent-session
│   │   ├── session-store.test.ts — 3,169 B — 91 L — #test-suite #test-unit
│   │   ├── session-store.ts — 10,506 B — 286 L — #agent-session #workspace-state
│   │   ├── session-utils.ts — 943 B — 28 L — #agent-session
│   │   ├── session-worker-client.test.ts — 1,015 B — 30 L — #test-integration #test-suite
│   │   ├── session-worker-client.ts — 1,047 B — 36 L — #agent-session #agent-worker
│   │   ├── session-worktree.ts — 908 B — 18 L — #agent-session #git-integration
│   │   ├── sessions.ts — 36,939 B — 872 L — #agent-session
│   │   ├── status-hooks.test.ts — 9,717 B — 235 L — #test-suite #test-unit
│   │   ├── status-hooks.ts — 19,467 B — 477 L — #agent-session #agent-status
│   │   ├── task-skill.ts — 864 B — 32 L — #agent-session
│   │   ├── tmux-pane-lookup.ts — 3,293 B — 106 L — #agent-session #agent-tmux
│   │   ├── types.ts — 3,581 B — 129 L — #agent-session #types-only
│   │   ├── view-state-store.ts — 7,433 B — 234 L — #agent-session #workspace-state
│   │   ├── workspace-context.test.ts — 6,655 B — 188 L — #test-suite #test-unit
│   │   ├── workspace-context.ts — 9,786 B — 230 L — #agent-session
│   │   └── workspace-state.ts — 1,697 B — 48 L — #agent-session #workspace-state
│   ├── cli/
│   │   ├── features/
│   │   │   ├── config/
│   │   │   │   ├── advanced-wizard.ts — 18,878 B — 601 L — #cli-command #cli-feature
│   │   │   │   ├── configure-advanced-settings.ts — 1,162 B — 34 L — #cli-command #cli-feature
│   │   │   │   ├── register.ts — 10,024 B — 265 L — #cli-command #cli-feature
│   │   │   │   └── values.ts — 7,779 B — 186 L — #cli-command #cli-feature
│   │   │   ├── drafts/
│   │   │   │   └── register.ts — 11,945 B — 232 L — #cli-command #cli-feature
│   │   │   ├── init/
│   │   │   │   ├── options.ts — 4,230 B — 107 L — #cli-command #cli-feature
│   │   │   │   ├── provider.ts — 3,891 B — 94 L — #cli-command #cli-feature
│   │   │   │   └── register.ts — 27,636 B — 666 L — #cli-command #cli-feature
│   │   │   ├── milestones/
│   │   │   │   └── register.ts — 11,363 B — 260 L — #cli-command #cli-feature
│   │   │   ├── task/
│   │   │   │   └── edit-fields.ts — 7,507 B — 236 L — #cli-command #cli-feature
│   │   │   ├── tasks/
│   │   │   │   ├── create.ts — 7,911 B — 173 L — #cli-command #cli-feature
│   │   │   │   ├── edit-list-options.ts — 2,785 B — 77 L — #cli-command #cli-feature
│   │   │   │   ├── edit-options.ts — 10,393 B — 240 L — #cli-command #cli-feature
│   │   │   │   ├── edit.ts — 11,346 B — 272 L — #cli-command #cli-feature
│   │   │   │   ├── filter-normalizers.ts — 2,445 B — 62 L — #cli-command #cli-feature
│   │   │   │   ├── input.ts — 3,646 B — 85 L — #cli-command #cli-feature
│   │   │   │   ├── list-parse.ts — 4,531 B — 131 L — #cli-command #cli-feature
│   │   │   │   ├── list-project-filter.ts — 2,222 B — 46 L — #cli-command #cli-feature
│   │   │   │   ├── list-project.ts — 2,015 B — 47 L — #cli-command #cli-feature
│   │   │   │   ├── list-query.ts — 2,130 B — 50 L — #cli-command #cli-feature
│   │   │   │   ├── list-render.ts — 1,731 B — 34 L — #cli-command #cli-feature
│   │   │   │   ├── policies.ts — 1,428 B — 31 L — #cli-command #cli-feature
│   │   │   │   ├── register.ts — 22,054 B — 505 L — #cli-command #cli-feature
│   │   │   │   └── wizard.ts — 26,254 B — 757 L — #cli-command #cli-feature
│   │   │   └── read-output.ts — 1,394 B — 35 L — #cli-command #cli-feature
│   │   ├── index.ts — 395 B — 10 L — #cli-registry #entry
│   │   ├── register.ts — 10,737 B — 274 L — #cli-command #cli-registry
│   │   └── runtime.ts — 938 B — 27 L — #cli-command #cli-runtime
│   ├── commands/
│   │   ├── agent-workspace.ts — 13,079 B — 321 L — #cli-command #cli-runtime
│   │   ├── cleanup.ts — 6,276 B — 180 L — #cli-command #cli-runtime
│   │   ├── completion.test.ts — 4,028 B — 119 L — #test-suite #test-unit
│   │   ├── completion.ts — 15,480 B — 526 L — #cli-command #cli-runtime
│   │   ├── content-commands.ts — 13,540 B — 304 L — #cli-command #cli-runtime
│   │   ├── draft-actions.ts — 632 B — 20 L — #cli-command #cli-runtime
│   │   ├── help-schema.ts — 8,476 B — 252 L — #cli-command #cli-runtime
│   │   ├── instructions.ts — 3,018 B — 90 L — #cli-command #cli-runtime
│   │   ├── mcp.ts — 3,750 B — 106 L — #cli-command #cli-runtime
│   │   ├── overview.ts — 1,496 B — 46 L — #cli-command #cli-runtime
│   │   ├── project-command.ts — 492 B — 13 L — #cli-command #cli-runtime
│   │   ├── project-view-commands.ts — 5,748 B — 139 L — #cli-command #cli-runtime
│   │   ├── search.ts — 15,335 B — 387 L — #cli-command #cli-runtime
│   │   ├── skill.test.ts — 958 B — 28 L — #test-suite #test-unit
│   │   ├── skill.ts — 349 B — 11 L — #cli-command #cli-runtime
│   │   └── watch-json.ts — 7,551 B — 248 L — #cli-command #cli-runtime
│   ├── completions/
│   │   ├── command-structure.ts — 3,951 B — 162 L — #cli-support #shell-completion
│   │   ├── data-providers.ts — 3,288 B — 120 L — #cli-support #shell-completion
│   │   ├── helper.test.ts — 4,420 B — 123 L — #test-suite #test-unit
│   │   └── helper.ts — 5,605 B — 194 L — #cli-support #shell-completion
│   ├── constants/
│   │   └── index.ts — 3,059 B — 104 L — #constants #shared-util
│   ├── core/
│   │   ├── task-update/
│   │   │   ├── collections.ts — 4,420 B — 128 L — #domain-core #task-update
│   │   │   ├── content.ts — 3,557 B — 110 L — #domain-core #task-update
│   │   │   ├── index.ts — 867 B — 19 L — #domain-core #task-update
│   │   │   └── scalars.ts — 4,135 B — 136 L — #domain-core #task-update
│   │   ├── backlog.ts — 51,068 B — 1,350 L — #domain-core
│   │   ├── config-migration-workflow.ts — 1,969 B — 43 L — #domain-core
│   │   ├── config-migration.ts — 2,385 B — 60 L — #domain-core
│   │   ├── domain-errors.ts — 200 B — 7 L — #domain-core
│   │   ├── duplicate-task-repair.ts — 30,656 B — 777 L — #domain-core
│   │   ├── init-helpers.ts — 11,576 B — 322 L — #domain-core
│   │   ├── init.ts — 1,123 B — 39 L — #domain-core
│   │   ├── legacy-milestone-parser.ts — 3,369 B — 91 L — #domain-core
│   │   ├── milestone-resolution.ts — 2,280 B — 51 L — #domain-core
│   │   ├── milestone-workflow.ts — 13,046 B — 346 L — #domain-core
│   │   ├── milestones.ts — 12,024 B — 372 L — #domain-core
│   │   ├── ordered-task-move-planner.ts — 3,554 B — 102 L — #domain-core
│   │   ├── persistent-task-read.ts — 4,249 B — 104 L — #domain-core
│   │   ├── prefix-migration.ts — 2,949 B — 101 L — #domain-core
│   │   ├── project-content-service.ts — 8,306 B — 218 L — #domain-core
│   │   ├── project-task-graph.ts — 3,645 B — 91 L — #domain-core
│   │   ├── reorder.ts — 4,399 B — 135 L — #domain-core
│   │   ├── search-service.ts — 3,587 B — 113 L — #domain-core
│   │   ├── statistics.ts — 5,817 B — 178 L — #domain-core
│   │   ├── task-creation-input.ts — 4,935 B — 132 L — #domain-core
│   │   ├── task-creation-transaction.ts — 2,522 B — 78 L — #domain-core
│   │   ├── task-creation-workflow.ts — 4,576 B — 105 L — #domain-core
│   │   ├── task-detail.ts — 7,813 B — 183 L — #domain-core
│   │   ├── task-identity-index.ts — 12,488 B — 343 L — #domain-core
│   │   ├── task-lifecycle-service.ts — 13,457 B — 325 L — #domain-core
│   │   ├── task-loader.ts — 21,309 B — 615 L — #domain-core
│   │   ├── task-mutation-service.ts — 11,973 B — 285 L — #domain-core
│   │   ├── task-query-workflow.ts — 1,459 B — 37 L — #domain-core
│   │   ├── task-reorder-plan.ts — 2,014 B — 48 L — #domain-core
│   │   ├── tui-task-edit-session.ts — 7,713 B — 212 L — #domain-core
│   │   └── vacated-task-reference-service.ts — 3,368 B — 85 L — #domain-core
│   ├── file-system/
│   │   ├── config.ts — 15,178 B — 363 L — #file-system
│   │   ├── content-repository.ts — 6,125 B — 152 L — #file-system #repository
│   │   ├── lock-owner.ts — 1,251 B — 50 L — #file-system #locking
│   │   ├── milestones.test.ts — 1,815 B — 47 L — #test-suite #test-unit
│   │   ├── milestones.ts — 9,745 B — 265 L — #file-system
│   │   ├── operations.ts — 55,392 B — 1,570 L — #file-system
│   │   ├── project-layout.ts — 509 B — 15 L — #file-system
│   │   └── task-repository.ts — 4,132 B — 111 L — #file-system #repository
│   ├── formatters/
│   │   ├── dependency-graph-text.ts — 5,472 B — 143 L — #cli-support #formatter
│   │   ├── json-output.ts — 9,187 B — 286 L — #cli-support #formatter
│   │   └── task-plain-text.ts — 7,575 B — 206 L — #cli-support #formatter
│   ├── git/
│   │   ├── operations.ts — 29,937 B — 929 L — #git-integration
│   ├── guidelines/
│   │   ├── cli-instructions/
│   │   │   ├── agent-workspace.md — 8,119 B — 26 L — #guidance-doc
│   │   │   ├── index.ts — 788 B — 13 L — #guidance-doc #guidance-ts
│   │   │   ├── init-required.md — 428 B — 29 L — #guidance-doc
│   │   │   ├── overview.md — 3,053 B — 58 L — #guidance-doc
│   │   │   ├── task-creation.md — 6,398 B — 131 L — #guidance-doc
│   │   │   ├── task-execution.md — 4,566 B — 83 L — #guidance-doc
│   │   │   └── task-finalization.md — 1,879 B — 20 L — #guidance-doc
│   │   ├── mcp/
│   │   │   ├── agent-nudge.md — 1,169 B — 25 L — #guidance-doc
│   │   │   ├── index.ts — 805 B — 13 L — #guidance-doc #guidance-ts
│   │   │   ├── init-required.md — 751 B — 24 L — #guidance-doc
│   │   │   ├── overview-tools.md — 3,327 B — 43 L — #guidance-doc
│   │   │   ├── overview.md — 3,797 B — 44 L — #guidance-doc
│   │   │   ├── task-creation.md — 9,678 B — 135 L — #guidance-doc
│   │   │   ├── task-execution.md — 6,601 B — 78 L — #guidance-doc
│   │   │   └── task-finalization.md — 1,752 B — 20 L — #guidance-doc
│   │   ├── cli-agent-nudge.md — 643 B — 7 L — #guidance-doc
│   │   └── index.ts — 491 B — 8 L — #guidance-doc #guidance-ts
│   ├── markdown/
│   │   ├── frontmatter.ts — 1,467 B — 35 L — #markdown-io
│   │   ├── legacy-task-migration.ts — 7,206 B — 150 L — #markdown-io
│   │   ├── parser.ts — 14,126 B — 326 L — #markdown-io
│   │   ├── schema.ts — 1,968 B — 78 L — #markdown-io
│   │   └── serializer.ts — 8,638 B — 182 L — #markdown-io
│   ├── mcp/
│   │   ├── errors/
│   │   │   └── mcp-errors.ts — 2,407 B — 89 L — #mcp-error #mcp-server
│   │   ├── resources/
│   │   │   ├── init-required/
│   │   │   │   └── index.ts — 1,024 B — 33 L — #mcp-resource #mcp-server
│   │   │   └── workflow/
│   │   │       └── index.ts — 624 B — 25 L — #mcp-resource #mcp-server
│   │   ├── tools/
│   │   │   ├── documents/
│   │   │   │   ├── handlers.ts — 5,203 B — 195 L — #mcp-handler #mcp-server #mcp-tool
│   │   │   │   ├── index.ts — 3,476 B — 99 L — #mcp-server #mcp-tool #mcp-tool-index
│   │   │   │   └── schemas.ts — 1,905 B — 112 L — #mcp-schema #mcp-server #mcp-tool
│   │   │   ├── milestones/
│   │   │   │   ├── handlers.ts — 13,913 B — 370 L — #mcp-handler #mcp-server #mcp-tool
│   │   │   │   ├── index.ts — 2,887 B — 76 L — #mcp-server #mcp-tool #mcp-tool-index
│   │   │   │   └── schemas.ts — 2,470 B — 101 L — #mcp-schema #mcp-server #mcp-tool
│   │   │   ├── tasks/
│   │   │   │   ├── handlers.ts — 16,852 B — 451 L — #mcp-handler #mcp-server #mcp-tool
│   │   │   │   ├── index.ts — 4,657 B — 117 L — #mcp-server #mcp-tool #mcp-tool-index
│   │   │   │   └── schemas.ts — 920 B — 45 L — #mcp-schema #mcp-server #mcp-tool
│   │   │   └── workflow/
│   │   │       └── index.ts — 2,036 B — 78 L — #mcp-server #mcp-tool #mcp-tool-index
│   │   ├── utils/
│   │   │   ├── document-response.ts — 1,556 B — 50 L — #mcp-server #mcp-util
│   │   │   ├── milestone-resolution.ts — 271 B — 6 L — #mcp-server #mcp-util
│   │   │   ├── schema-generators.ts — 14,550 B — 567 L — #mcp-server #mcp-util
│   │   │   └── task-response.ts — 756 B — 23 L — #mcp-server #mcp-util
│   │   ├── validation/
│   │   │   ├── tool-wrapper.ts — 2,563 B — 85 L — #mcp-server #mcp-validation
│   │   │   └── validators.ts — 7,628 B — 221 L — #mcp-server #mcp-validation
│   │   ├── README.md — 1,655 B — 35 L — #guidance-doc #mcp-server
│   │   ├── root-activation.ts — 4,435 B — 116 L — #mcp-server
│   │   ├── server.ts — 13,976 B — 432 L — #mcp-server
│   │   ├── types.ts — 755 B — 36 L — #mcp-server
│   │   └── workflow-guides.ts — 3,481 B — 107 L — #mcp-server
│   ├── process/
│   │   └── capture.ts — 633 B — 20 L — #process-util
│   ├── test/
│   │   ├── agent-instructions.test.ts — 16,875 B — 374 L — #test-suite #test-unit
│   │   ├── agent-selection.test.ts — 2,620 B — 70 L — #test-suite #test-unit
│   │   ├── agent-sessions.test.ts — 43,756 B — 962 L — #test-suite #test-unit
│   │   ├── agent-workspace-cli.test.ts — 2,149 B — 58 L — #test-integration #test-suite
│   │   ├── agent-workspace-model.test.ts — 2,053 B — 52 L — #test-suite #test-unit
│   │   ├── atomic-task-create.test.ts — 11,046 B — 312 L — #test-suite #test-unit
│   │   ├── atomic-task-edit.test.ts — 12,471 B — 325 L — #test-suite #test-unit
│   │   ├── backlog-directory.test.ts — 4,112 B — 92 L — #test-suite #test-unit
│   │   ├── board-actions.test.ts — 4,329 B — 124 L — #test-suite #test-unit
│   │   ├── board-domain.test.ts — 4,398 B — 120 L — #test-suite #test-unit
│   │   ├── board-hide-empty-columns.test.ts — 12,048 B — 356 L — #test-pty #test-suite #test-unit
│   │   ├── board-loading.test.ts — 7,153 B — 204 L — #test-suite #test-unit
│   │   ├── board-popup-sync.test.ts — 9,883 B — 261 L — #test-suite #test-unit
│   │   ├── board-tui-move.test.ts — 21,690 B — 621 L — #test-suite #test-unit
│   │   ├── board-tui-multi-move-pty.test.ts — 5,685 B — 166 L — #test-pty #test-suite #test-unit
│   │   ├── board-ui.test.ts — 3,158 B — 82 L — #test-suite #test-unit
│   │   ├── board-view.test.ts — 2,209 B — 76 L — #test-suite #test-unit
│   │   ├── board.test.ts — 13,678 B — 503 L — #test-suite #test-unit
│   │   ├── branch-task-loader-resilience.test.ts — 7,229 B — 228 L — #test-suite #test-unit
│   │   ├── bun-options.test.ts — 549 B — 15 L — #test-suite #test-unit
│   │   ├── cleanup.test.ts — 9,030 B — 302 L — #test-suite #test-unit
│   │   ├── cli-agents.test.ts — 2,918 B — 76 L — #test-integration #test-suite
│   │   ├── cli-auto-plain-non-tty.test.ts — 2,555 B — 75 L — #test-integration #test-suite
│   │   ├── cli-custom-prefix-id-resolution.test.ts — 21,270 B — 532 L — #test-integration #test-suite
│   │   ├── cli-dependency-graph.test.ts — 14,093 B — 371 L — #test-integration #test-suite
│   │   ├── cli-dependency.test.ts — 9,832 B — 217 L — #test-integration #test-suite
│   │   ├── cli-doc-decision-board.test.ts — 18,148 B — 549 L — #test-integration #test-suite
│   │   ├── cli-doc-search.test.ts — 5,700 B — 143 L — #test-integration #test-suite
│   │   ├── cli-doc-view.test.ts — 1,746 B — 51 L — #test-integration #test-suite
│   │   ├── cli-draft-edit.test.ts — 38,974 B — 993 L — #test-integration #test-suite
│   │   ├── cli-due-date.test.ts — 3,147 B — 79 L — #test-integration #test-suite
│   │   ├── cli-exclude-status-filtering.test.ts — 4,008 B — 126 L — #test-integration #test-suite
│   │   ├── cli-guidance.test.ts — 26,926 B — 496 L — #test-integration #test-suite
│   │   ├── cli-incrementing-ids.test.ts — 2,837 B — 95 L — #test-integration #test-suite
│   │   ├── cli-init-create.test.ts — 24,323 B — 564 L — #test-integration #test-suite
│   │   ├── cli-init-cursor-pty.test.ts — 3,167 B — 83 L — #test-integration #test-pty #test-suite
│   │   ├── cli-init-input.test.ts — 3,517 B — 95 L — #test-integration #test-suite
│   │   ├── cli-init-no-git.test.ts — 6,979 B — 177 L — #test-integration #test-suite
│   │   ├── cli-json-output.test.ts — 17,544 B — 490 L — #test-integration #test-suite
│   │   ├── cli-json-watch.test.ts — 12,957 B — 364 L — #test-integration #test-suite
│   │   ├── cli-launcher.test.ts — 3,393 B — 75 L — #test-integration #test-suite
│   │   ├── cli-list-window.test.ts — 12,904 B — 305 L — #test-integration #test-suite
│   │   ├── cli-milestone-filter.test.ts — 8,622 B — 240 L — #test-integration #test-suite
│   │   ├── cli-milestone-management.test.ts — 10,488 B — 256 L — #test-integration #test-suite
│   │   ├── cli-missing-storage-directories.test.ts — 4,328 B — 95 L — #test-integration #test-suite
│   │   ├── cli-parent-filter.test.ts — 8,702 B — 262 L — #test-integration #test-suite
│   │   ├── cli-parent-shorthand.test.ts — 2,304 B — 64 L — #test-integration #test-suite
│   │   ├── cli-pipe-output.test.ts — 3,343 B — 94 L — #test-integration #test-suite
│   │   ├── cli-plain-create-edit.test.ts — 3,936 B — 104 L — #test-integration #test-suite
│   │   ├── cli-plain-output.test.ts — 8,672 B — 225 L — #test-integration #test-suite
│   │   ├── cli-refs-docs.test.ts — 21,017 B — 514 L — #test-integration #test-suite
│   │   ├── cli-root-entry.test.ts — 4,071 B — 104 L — #test-integration #test-suite
│   │   ├── cli-search-command.test.ts — 4,969 B — 139 L — #test-integration #test-suite
│   │   ├── cli-status-filtering.test.ts — 5,225 B — 138 L — #test-integration #test-suite
│   │   ├── cli-task-batch-edit.test.ts — 9,504 B — 282 L — #test-integration #test-suite
│   │   ├── cli-task-list-ordinal-sort.test.ts — 2,450 B — 67 L — #test-integration #test-suite
│   │   ├── cli-task-list.test.ts — 26,028 B — 898 L — #test-integration #test-suite
│   │   ├── cli-task-milestone.test.ts — 3,383 B — 87 L — #test-integration #test-suite
│   │   ├── cli-task-project.test.ts — 6,718 B — 156 L — #test-integration #test-suite
│   │   ├── cli-task-state.test.ts — 11,221 B — 348 L — #test-integration #test-suite
│   │   ├── cli-task-type.test.ts — 6,252 B — 142 L — #test-integration #test-suite
│   │   ├── cli-task-view-edit.test.ts — 5,903 B — 115 L — #test-integration #test-suite
│   │   ├── cli-task-wizard.test.ts — 1,752 B — 42 L — #test-integration #test-suite
│   │   ├── cli-zero-padded-ids.test.ts — 3,223 B — 88 L — #test-integration #test-suite
│   │   ├── code-path.test.ts — 7,146 B — 204 L — #test-suite #test-unit
│   │   ├── config-commands.test.ts — 26,832 B — 602 L — #test-suite #test-unit
│   │   ├── config-migration.test.ts — 5,912 B — 184 L — #test-suite #test-unit
│   │   ├── config-watcher.test.ts — 26,110 B — 681 L — #test-suite #test-unit
│   │   ├── content-identity.test.ts — 11,729 B — 271 L — #test-suite #test-unit
│   │   ├── content-store.test.ts — 2,259 B — 54 L — #test-suite #test-unit
│   │   ├── core-move-tasks-to-status.test.ts — 17,251 B — 531 L — #test-suite #test-unit
│   │   ├── core-task-corpus-regressions.test.ts — 10,764 B — 264 L — #test-regression #test-suite #test-unit
│   │   ├── core.test.ts — 47,965 B — 1,324 L — #test-suite #test-unit
│   │   ├── date.test.ts — 312 B — 8 L — #test-suite #test-unit
│   │   ├── dependency-graph-surfaces.test.tsx — 4,999 B — 109 L — #test-suite #test-unit
│   │   ├── dependency-graph.test.ts — 16,110 B — 374 L — #test-suite #test-unit
│   │   ├── dependency.test.ts — 23,398 B — 671 L — #test-suite #test-unit
│   │   ├── desc-alias.test.ts — 3,139 B — 93 L — #test-suite #test-unit
│   │   ├── description-newlines.test.ts — 1,544 B — 32 L — #test-suite #test-unit
│   │   ├── docs-recursive.test.ts — 4,479 B — 137 L — #test-suite #test-unit
│   │   ├── documentation.test.ts — 2,103 B — 71 L — #test-suite #test-unit
│   │   ├── draft-create-consistency.test.ts — 5,313 B — 123 L — #test-suite #test-unit
│   │   ├── due-date.test.ts — 7,490 B — 226 L — #test-suite #test-unit
│   │   ├── duplicate-detection.test.ts — 4,053 B — 121 L — #test-suite #test-unit
│   │   ├── duplicate-task-repair.test.ts — 25,168 B — 583 L — #test-suite #test-unit
│   │   ├── editor.test.ts — 6,772 B — 226 L — #test-suite #test-unit
│   │   ├── enhanced-init.test.ts — 13,846 B — 394 L — #test-suite #test-unit
│   │   ├── entity-id.test.ts — 517 B — 11 L — #test-suite #test-unit
│   │   ├── filesystem-task-cache.test.ts — 12,515 B — 331 L — #test-suite #test-unit
│   │   ├── filesystem.test.ts — 38,785 B — 1,181 L — #test-suite #test-unit
│   │   ├── filter-header-navigation.test.ts — 865 B — 19 L — #test-suite #test-unit
│   │   ├── find-backlog-root.test.ts — 6,549 B — 178 L — #test-suite #test-unit
│   │   ├── footer-content.test.ts — 3,953 B — 92 L — #test-suite #test-unit
│   │   ├── footer-search.test.ts — 5,589 B — 165 L — #test-suite #test-unit
│   │   ├── frontmatter-diagnostic-propagation.test.ts — 5,729 B — 158 L — #test-suite #test-unit
│   │   ├── generic-list-selection.test.ts — 2,538 B — 85 L — #test-suite #test-unit
│   │   ├── git.test.ts — 19,654 B — 593 L — #test-suite #test-unit
│   │   ├── heading.test.ts — 952 B — 26 L — #test-suite #test-unit
│   │   ├── help-popup.test.ts — 5,713 B — 146 L — #test-suite #test-unit
│   │   ├── id-generation.test.ts — 6,278 B — 157 L — #test-suite #test-unit
│   │   ├── immutable-project-context.test.ts — 3,787 B — 121 L — #test-suite #test-unit
│   │   ├── label-filter.test.ts — 1,983 B — 59 L — #test-suite #test-unit
│   │   ├── list-removal-adapter.test.ts — 2,028 B — 56 L — #test-suite #test-unit
│   │   ├── list-window.test.ts — 7,239 B — 164 L — #test-suite #test-unit
│   │   ├── local-task-command-performance.test.ts — 13,652 B — 372 L — #test-suite #test-unit
│   │   ├── malformed-task-dependencies.test.ts — 5,986 B — 151 L — #test-suite #test-unit
│   │   ├── markdown.test.ts — 23,115 B — 842 L — #test-suite #test-unit
│   │   ├── mcp-client-setup.test.ts — 863 B — 25 L — #test-integration #test-suite
│   │   ├── mcp-documents.test.ts — 15,568 B — 437 L — #test-integration #test-suite
│   │   ├── mcp-drafts.test.ts — 11,566 B — 350 L — #test-integration #test-suite
│   │   ├── mcp-fallback.test.ts — 2,076 B — 57 L — #test-integration #test-suite
│   │   ├── mcp-milestones.test.ts — 41,663 B — 1,087 L — #test-integration #test-suite
│   │   ├── mcp-refs-docs.test.ts — 5,631 B — 164 L — #test-integration #test-suite
│   │   ├── mcp-roots-discovery.test.ts — 9,092 B — 248 L — #test-integration #test-suite
│   │   ├── mcp-server.test.ts — 13,407 B — 320 L — #test-integration #test-suite
│   │   ├── mcp-stdio-exit.test.ts — 7,222 B — 234 L — #test-integration #test-suite
│   │   ├── mcp-task-complete.test.ts — 4,385 B — 129 L — #test-integration #test-suite
│   │   ├── mcp-task-project-filtering.test.ts — 5,392 B — 131 L — #test-integration #test-suite
│   │   ├── mcp-task-type-filtering.test.ts — 5,322 B — 131 L — #test-integration #test-suite
│   │   ├── mcp-tasks-local-filter.test.ts — 3,113 B — 98 L — #test-integration #test-suite
│   │   ├── mcp-tasks.test.ts — 56,274 B — 1,699 L — #test-integration #test-suite
│   │   ├── mcp-workspace-root.test.ts — 10,065 B — 266 L — #test-integration #test-suite
│   │   ├── milestone-filter.test.ts — 9,566 B — 225 L — #test-suite #test-unit
│   │   ├── no-remote-preflight.test.ts — 2,788 B — 85 L — #test-suite #test-unit
│   │   ├── offline-integration.test.ts — 5,346 B — 160 L — #test-integration #test-suite
│   │   ├── offline-mode.test.ts — 4,151 B — 142 L — #test-integration #test-suite
│   │   ├── opentui-agent-host-cleanup.test.ts — 10,992 B — 280 L — #test-suite #test-unit
│   │   ├── opentui-agent-settings.test.ts — 22,939 B — 619 L — #test-suite #test-unit
│   │   ├── opentui-existing-agent-host.test.ts — 2,782 B — 71 L — #test-suite #test-unit
│   │   ├── opentui-filters.test.ts — 19,509 B — 507 L — #test-suite #test-unit
│   │   ├── opentui-keybindings.test.ts — 8,952 B — 187 L — #test-suite #test-unit
│   │   ├── opentui-navigation-history.test.ts — 3,786 B — 90 L — #test-suite #test-unit
│   │   ├── opentui-session-picker.test.ts — 3,563 B — 114 L — #test-suite #test-unit
│   │   ├── opentui-status-tabs.test.ts — 9,028 B — 252 L — #test-suite #test-unit
│   │   ├── opentui-surfaces.test.ts — 6,310 B — 180 L — #test-suite #test-unit
│   │   ├── opentui-workspace-agent.test.ts — 6,950 B — 185 L — #test-suite #test-unit
│   │   ├── opentui-workspace-controller.test.ts — 66,168 B — 1,804 L — #test-suite #test-unit
│   │   ├── opentui-workspace-layout.test.ts — 32,932 B — 844 L — #test-suite #test-unit
│   │   ├── packaging-bin.test.ts — 412 B — 11 L — #test-suite #test-unit
│   │   ├── parent-id-normalization.test.ts — 3,586 B — 97 L — #test-suite #test-unit
│   │   ├── pin-timezone.ts — 629 B — 19 L — #test-helper #test-suite
│   │   ├── popup-chrome.test.ts — 1,888 B — 51 L — #test-suite #test-unit
│   │   ├── prefix-config.test.ts — 14,457 B — 439 L — #test-suite #test-unit
│   │   ├── prefix-migration.test.ts — 9,034 B — 293 L — #test-suite #test-unit
│   │   ├── priority.test.ts — 4,112 B — 155 L — #test-suite #test-unit
│   │   ├── project-task-graph.test.ts — 5,097 B — 143 L — #test-suite #test-unit
│   │   ├── readiness-surface-agreement.test.ts — 10,309 B — 264 L — #test-suite #test-unit
│   │   ├── readme-board.test.ts — 3,801 B — 103 L — #test-suite #test-unit
│   │   ├── references.test.ts — 3,648 B — 119 L — #test-suite #test-unit
│   │   ├── remote-id-conflict.test.ts — 2,071 B — 64 L — #test-suite #test-unit
│   │   ├── reorder-utils.test.ts — 9,088 B — 286 L — #test-suite #test-unit
│   │   ├── resolveBinary.test.ts — 5,362 B — 144 L — #test-suite #test-unit
│   │   ├── runtime-cwd.test.ts — 6,608 B — 175 L — #test-suite #test-unit
│   │   ├── search-service.test.ts — 3,327 B — 98 L — #test-suite #test-unit
│   │   ├── shared-branch-task-loader.test.ts — 3,300 B — 104 L — #test-suite #test-unit
│   │   ├── start-id.test.ts — 1,093 B — 32 L — #test-suite #test-unit
│   │   ├── statistics.test.ts — 8,579 B — 265 L — #test-suite #test-unit
│   │   ├── status-callback.test.ts — 8,661 B — 296 L — #test-suite #test-unit
│   │   ├── status-filter.test.ts — 1,480 B — 42 L — #test-suite #test-unit
│   │   ├── status-icon.test.ts — 2,127 B — 63 L — #test-suite #test-unit
│   │   ├── strip-tags.test.ts — 2,378 B — 62 L — #test-suite #test-unit
│   │   ├── subtask-ordering-consistency.test.ts — 4,636 B — 106 L — #test-suite #test-unit
│   │   ├── subtask-progress.test.ts — 3,956 B — 108 L — #test-suite #test-unit
│   │   ├── symlink-backlog-root.test.ts — 4,658 B — 123 L — #test-suite #test-unit
│   │   ├── task-edit-preservation.test.ts — 8,815 B — 278 L — #test-suite #test-unit
│   │   ├── task-filter-wiring.test.ts — 5,141 B — 162 L — #test-suite #test-unit
│   │   ├── task-frontmatter-storage.test.ts — 6,610 B — 181 L — #test-suite #test-unit
│   │   ├── task-id-resolution.test.ts — 3,227 B — 78 L — #test-suite #test-unit
│   │   ├── task-identity-index.test.ts — 3,867 B — 134 L — #test-suite #test-unit
│   │   ├── task-mutation-service.test.ts — 784 B — 22 L — #test-suite #test-unit
│   │   ├── task-opaque-body-integration.test.ts — 1,824 B — 50 L — #test-integration #test-suite
│   │   ├── task-path.test.ts — 13,212 B — 331 L — #test-suite #test-unit
│   │   ├── task-project-filtering.test.ts — 7,743 B — 197 L — #test-suite #test-unit
│   │   ├── task-project.test.ts — 6,222 B — 165 L — #test-suite #test-unit
│   │   ├── task-search-label-filter.test.ts — 1,983 B — 68 L — #test-suite #test-unit
│   │   ├── task-search-parity.test.ts — 13,945 B — 346 L — #test-suite #test-unit
│   │   ├── task-sorting.test.ts — 10,154 B — 312 L — #test-suite #test-unit
│   │   ├── task-type-config.test.ts — 816 B — 18 L — #test-suite #test-unit
│   │   ├── task-type-filtering.test.ts — 8,618 B — 242 L — #test-suite #test-unit
│   │   ├── task-type.test.ts — 4,868 B — 132 L — #test-suite #test-unit
│   │   ├── task-updated-date.test.ts — 1,723 B — 63 L — #test-suite #test-unit
│   │   ├── task-viewer-boundary-navigation.test.ts — 3,618 B — 83 L — #test-suite #test-unit
│   │   ├── task-viewer-filter-model.test.ts — 2,253 B — 73 L — #test-suite #test-unit
│   │   ├── task-viewer-milestone-filter-model.test.ts — 1,634 B — 34 L — #test-suite #test-unit
│   │   ├── task-watcher.test.ts — 14,420 B — 407 L — #test-suite #test-unit
│   │   ├── task-wizard.test.ts — 14,998 B — 464 L — #test-suite #test-unit
│   │   ├── terminal-status.test.ts — 922 B — 19 L — #test-suite #test-unit
│   │   ├── test-cli.ts — 1,304 B — 37 L — #test-helper #test-integration #test-suite
│   │   ├── test-preload.ts — 348 B — 6 L — #test-helper #test-suite
│   │   ├── test-utils.test.ts — 1,154 B — 31 L — #test-helper #test-suite
│   │   ├── test-utils.ts — 13,382 B — 383 L — #test-helper #test-suite
│   │   ├── tmux-pane-lookup.test.ts — 840 B — 21 L — #test-suite #test-unit
│   │   ├── tmux-test-server.ts — 3,414 B — 73 L — #test-helper #test-integration #test-suite
│   │   ├── tui-documentation.test.ts — 1,579 B — 52 L — #test-suite #test-unit
│   │   ├── tui-draft-edit.test.ts — 14,562 B — 448 L — #test-suite #test-unit
│   │   ├── tui-edit-session.test.ts — 4,166 B — 141 L — #test-suite #test-unit
│   │   ├── tui-emoji-width.test.ts — 1,569 B — 37 L — #test-suite #test-unit
│   │   ├── tui-input-lifecycle.test.ts — 1,379 B — 59 L — #test-suite #test-unit
│   │   ├── tui-interactive-editor-handoff.test.ts — 13,504 B — 431 L — #test-suite #test-unit
│   │   ├── tui-ready-filter-pty.test.ts — 4,477 B — 138 L — #test-pty #test-suite #test-unit
│   │   ├── tui-runtime-cwd.test.ts — 3,981 B — 95 L — #test-suite #test-unit
│   │   ├── tui-screenshot-compare-script.test.ts — 446 B — 14 L — #test-suite #test-unit
│   │   ├── tui-startup-warning.test.ts — 1,018 B — 23 L — #test-suite #test-unit
│   │   ├── tui-task-composer.test.ts — 98,416 B — 2,302 L — #test-suite #test-unit
│   │   ├── tui-task-lifecycle.test.ts — 3,366 B — 96 L — #test-suite #test-unit
│   │   ├── tui-task-project.test.ts — 3,271 B — 83 L — #test-suite #test-unit
│   │   ├── tui-task-type.test.ts — 2,603 B — 72 L — #test-suite #test-unit
│   │   ├── tui-vim-boundary-navigation.test.ts — 12,591 B — 333 L — #test-suite #test-unit
│   │   ├── tui-window-title.test.ts — 7,167 B — 175 L — #test-suite #test-unit
│   │   ├── ui-keymap.test.ts — 2,472 B — 76 L — #test-suite #test-unit
│   │   ├── ui-state-owners.test.ts — 3,622 B — 121 L — #test-suite #test-unit
│   │   ├── unicode-rendering.test.ts — 548 B — 18 L — #test-suite #test-unit
│   │   ├── unified-view-filters.test.ts — 15,826 B — 626 L — #test-suite #test-unit
│   │   ├── unified-view-loading.test.ts — 6,862 B — 213 L — #test-suite #test-unit
│   │   ├── update-task-description.test.ts — 777 B — 23 L — #test-suite #test-unit
│   │   ├── utc-date-display.test.ts — 4,574 B — 93 L — #test-suite #test-unit
│   │   ├── vacated-task-references.test.ts — 26,482 B — 604 L — #test-suite #test-unit
│   │   ├── view-state-store.test.ts — 16,549 B — 438 L — #test-suite #test-unit
│   │   ├── view-switcher.test.ts — 3,962 B — 165 L — #test-suite #test-unit
│   │   ├── watch-json.test.ts — 7,572 B — 229 L — #test-suite #test-unit
│   │   ├── worktree-refresh.test.ts — 3,748 B — 116 L — #test-suite #test-unit
│   │   └── worktree-task-id-allocation.test.ts — 5,507 B — 143 L — #test-suite #test-unit
│   ├── types/
│   │   ├── index.ts — 12,605 B — 442 L — #task-model #types
│   │   ├── markdown.d.ts — 75 B — 4 L — #types-only
│   │   ├── neo-neo-bblessed.d.ts — 3,801 B — 111 L — #types-only
│   │   ├── proper-lockfile.d.ts — 581 B — 27 L — #types-only
│   │   ├── raw.d.ts — 79 B — 4 L — #types-only
│   │   └── task-edit-args.ts — 1,255 B — 47 L — #task-model #types
│   ├── ui/
│   │   ├── board/
│   │   │   ├── components/
│   │   │   │   ├── board-dialogs.ts — 3,028 B — 96 L — #tui-board
│   │   │   │   ├── board-view.ts — 4,410 B — 145 L — #tui-board
│   │   │   │   ├── filter-bar.ts — 6,549 B — 206 L — #tui-board
│   │   │   │   ├── footer.ts — 3,807 B — 102 L — #tui-board
│   │   │   │   ├── lane-view.ts — 5,260 B — 167 L — #tui-board
│   │   │   │   └── task-popup.ts — 7,273 B — 208 L — #tui-board
│   │   │   ├── models/
│   │   │   │   ├── board.ts — 10,523 B — 300 L — #tui-board
│   │   │   │   ├── filter.ts — 3,557 B — 100 L — #tui-board
│   │   │   │   └── lane.ts — 727 B — 23 L — #tui-board
│   │   │   ├── policies/
│   │   │   │   ├── column-policy.ts — 4,707 B — 116 L — #tui-board
│   │   │   │   ├── creation-outcome.ts — 600 B — 20 L — #tui-board
│   │   │   │   ├── filter-policy.ts — 763 B — 28 L — #tui-board
│   │   │   │   ├── move-policy.ts — 2,479 B — 64 L — #tui-board
│   │   │   │   └── navigation.ts — 2,768 B — 82 L — #tui-board
│   │   │   ├── board-actions.ts — 4,053 B — 121 L — #tui-board
│   │   │   ├── board-interaction.ts — 13,523 B — 416 L — #tui-board
│   │   │   ├── configuration.ts — 3,348 B — 102 L — #tui-board
│   │   │   ├── interaction.ts — 526 B — 13 L — #tui-board
│   │   │   ├── screen.ts — 1,552 B — 46 L — #tui-board
│   │   │   └── tui-renderer.ts — 11,708 B — 343 L — #tui-board
│   │   ├── components/
│   │   │   ├── confirm-popup.ts — 1,330 B — 58 L — #tui-component
│   │   │   ├── filter-header.ts — 19,716 B — 697 L — #tui-component
│   │   │   ├── filter-popup.ts — 11,380 B — 361 L — #tui-component
│   │   │   ├── footer-search.ts — 7,105 B — 253 L — #tui-component
│   │   │   ├── generic-list.ts — 20,759 B — 646 L — #tui-component
│   │   │   ├── help-popup.ts — 7,052 B — 170 L — #tui-component
│   │   │   └── task-composer.ts — 40,569 B — 1,111 L — #tui-component
│   │   ├── opentui/
│   │   │   ├── agent-settings.ts — 29,347 B — 828 L — #opentui-host #opentui-view
│   │   │   ├── board.ts — 20,942 B — 537 L — #opentui-view
│   │   │   ├── controls.ts — 9,752 B — 326 L — #opentui-view
│   │   │   ├── filters.ts — 28,038 B — 834 L — #opentui-view
│   │   │   ├── host.ts — 1,100 B — 37 L — #opentui-host #opentui-view
│   │   │   ├── keybindings.ts — 23,179 B — 520 L — #opentui-host #opentui-view
│   │   │   ├── navigation-history.ts — 1,685 B — 50 L — #opentui-view
│   │   │   ├── scrollable-viewer.ts — 2,378 B — 69 L — #opentui-view
│   │   │   ├── session-picker.ts — 3,736 B — 110 L — #opentui-view
│   │   │   ├── status-tabs.ts — 8,036 B — 263 L — #opentui-view
│   │   │   ├── task-actions.ts — 6,467 B — 207 L — #opentui-view
│   │   │   ├── task-composer.ts — 5,772 B — 183 L — #opentui-view
│   │   │   ├── task-viewer.ts — 15,544 B — 434 L — #opentui-view
│   │   │   ├── workspace-agent.ts — 1,667 B — 46 L — #opentui-view #workspace-controller
│   │   │   ├── workspace-controller.ts — 72,009 B — 1,832 L — #opentui-view #workspace-controller
│   │   │   └── workspace.ts — 28,063 B — 758 L — #opentui-view #workspace-controller
│   │   ├── shared/
│   │   │   └── task-popup.ts — 3,180 B — 116 L — #tui-shell
│   │   ├── task-viewer/
│   │   │   ├── configuration.ts — 4,803 B — 130 L — #tui-task-viewer
│   │   │   ├── controller.ts — 31,712 B — 835 L — #tui-task-viewer
│   │   │   ├── detail-content.ts — 10,205 B — 249 L — #tui-task-viewer
│   │   │   ├── editor.ts — 1,044 B — 28 L — #tui-task-viewer
│   │   │   ├── filters.ts — 1,221 B — 34 L — #tui-task-viewer
│   │   │   ├── interactions.ts — 1,503 B — 30 L — #tui-task-viewer
│   │   │   ├── lifecycle-shortcut.ts — 1,125 B — 24 L — #tui-task-viewer
│   │   │   ├── lifecycle.ts — 1,656 B — 45 L — #tui-task-viewer
│   │   │   ├── navigation.ts — 1,855 B — 54 L — #tui-task-viewer
│   │   │   ├── rendering.ts — 9,730 B — 300 L — #tui-task-viewer
│   │   │   └── session.ts — 3,548 B — 108 L — #tui-task-viewer
│   │   ├── unified/
│   │   │   ├── controller.ts — 18,880 B — 551 L — #tui-unified
│   │   │   └── session.ts — 2,999 B — 91 L — #tui-unified
│   │   ├── utils/
│   │   │   └── strip-tags.ts — 1,647 B — 77 L — #tui-util
│   │   ├── workspace/
│   │   │   ├── model/
│   │   │   │   └── drafts.ts — 2,623 B — 76 L — #workspace-controller
│   │   │   └── state.ts — 480 B — 14 L — #workspace-controller
│   │   ├── code-path.ts — 2,361 B — 82 L — #tui-shell
│   │   ├── footer-content.ts — 4,669 B — 98 L — #tui-shell
│   │   ├── heading.ts — 774 B — 24 L — #tui-shell
│   │   ├── keymap.ts — 5,503 B — 199 L — #tui-shell
│   │   ├── list-removal-adapter.ts — 927 B — 24 L — #tui-shell
│   │   ├── loading.ts — 6,249 B — 227 L — #tui-shell
│   │   ├── overview-content.ts — 3,895 B — 96 L — #tui-shell
│   │   ├── overview-tui.ts — 4,096 B — 178 L — #tui-shell
│   │   ├── project.ts — 242 B — 7 L — #tui-shell
│   │   ├── root-entry.ts — 4,030 B — 78 L — #tui-shell
│   │   ├── status-icon.ts — 2,486 B — 86 L — #tui-shell
│   │   ├── task-filter-wiring.ts — 4,228 B — 125 L — #tui-shell
│   │   ├── task-labels.ts — 653 B — 22 L — #tui-shell
│   │   ├── task-lifecycle.ts — 2,386 B — 55 L — #tui-shell
│   │   ├── task-type.ts — 168 B — 4 L — #tui-shell
│   │   ├── tui.ts — 8,068 B — 225 L — #tui-shell
│   │   └── view-switcher.ts — 8,440 B — 330 L — #tui-shell
│   ├── utils/
│   │   ├── agent-selection.ts — 1,719 B — 59 L — #shared-util
│   │   ├── app-info.ts — 245 B — 7 L — #shared-util
│   │   ├── backlog-directory.ts — 6,936 B — 246 L — #shared-util
│   │   ├── browser-launch.ts — 833 B — 28 L — #shared-util
│   │   ├── clipboard.ts — 1,251 B — 50 L — #shared-util
│   │   ├── config-line.ts — 351 B — 10 L — #shared-util
│   │   ├── config-watcher.ts — 7,650 B — 238 L — #shared-util
│   │   ├── date.ts — 206 B — 4 L — #shared-util
│   │   ├── debug-log.ts — 7,247 B — 205 L — #shared-util
│   │   ├── decision-id.ts — 606 B — 20 L — #shared-util
│   │   ├── dependency-graph.ts — 15,998 B — 393 L — #shared-util
│   │   ├── document-id.ts — 875 B — 28 L — #shared-util
│   │   ├── document-path.ts — 1,201 B — 46 L — #shared-util
│   │   ├── due-date.ts — 2,938 B — 54 L — #shared-util
│   │   ├── duplicate-detection.ts — 3,718 B — 104 L — #shared-util
│   │   ├── editor.ts — 2,456 B — 93 L — #shared-util
│   │   ├── entity-id.ts — 2,511 B — 74 L — #shared-util
│   │   ├── find-backlog-root.ts — 1,927 B — 67 L — #shared-util
│   │   ├── id-generators.ts — 3,340 B — 99 L — #shared-util
│   │   ├── label-filter.ts — 2,441 B — 84 L — #shared-util
│   │   ├── list-window.ts — 8,165 B — 213 L — #shared-util
│   │   ├── mcp-client-setup.ts — 2,267 B — 71 L — #shared-util
│   │   ├── milestone-filter.ts — 6,795 B — 172 L — #shared-util
│   │   ├── milestone-storage.ts — 4,046 B — 111 L — #shared-util
│   │   ├── modified-files.ts — 825 B — 25 L — #shared-util
│   │   ├── prefix-config.ts — 14,874 B — 452 L — #shared-util
│   │   ├── priority-config.ts — 3,294 B — 105 L — #shared-util
│   │   ├── project-config.ts — 2,989 B — 92 L — #shared-util
│   │   ├── read-output-mode.test.ts — 816 B — 23 L — #test-suite #test-unit
│   │   ├── read-output-mode.ts — 492 B — 16 L — #shared-util
│   │   ├── readiness.ts — 5,036 B — 124 L — #shared-util
│   │   ├── runtime-cwd.ts — 1,498 B — 62 L — #shared-util
│   │   ├── status-callback.ts — 1,657 B — 69 L — #shared-util
│   │   ├── status-filter.ts — 981 B — 18 L — #shared-util
│   │   ├── status.ts — 2,980 B — 91 L — #shared-util
│   │   ├── task-builders.ts — 13,846 B — 321 L — #shared-util
│   │   ├── task-edit-builder.ts — 7,734 B — 211 L — #shared-util
│   │   ├── task-id-search.ts — 985 B — 33 L — #shared-util
│   │   ├── task-id.ts — 4,193 B — 114 L — #shared-util
│   │   ├── task-links.ts — 2,151 B — 51 L — #shared-util
│   │   ├── task-path.ts — 7,265 B — 208 L — #shared-util
│   │   ├── task-record-index.ts — 3,933 B — 94 L — #shared-util
│   │   ├── task-search.ts — 9,379 B — 256 L — #shared-util
│   │   ├── task-sorting.ts — 6,212 B — 191 L — #shared-util
│   │   ├── task-subtasks.ts — 2,268 B — 73 L — #shared-util
│   │   ├── task-type-config.ts — 2,638 B — 84 L — #shared-util
│   │   ├── task-updated-date.ts — 1,396 B — 41 L — #shared-util
│   │   ├── task-watcher.ts — 10,243 B — 298 L — #shared-util
│   │   ├── terminal-status.ts — 686 B — 16 L — #shared-util
│   │   ├── time.ts — 57 B — 1 L — #shared-util
│   │   ├── utc-date-display.ts — 5,140 B — 134 L — #shared-util
│   │   └── version.ts — 665 B — 21 L — #shared-util
│   ├── agent-instructions.ts — 8,236 B — 233 L — #agent-instruction #cli-support
│   ├── board.ts — 9,212 B — 277 L — #board-model #domain-core
│   ├── index.ts — 636 B — 27 L — #entry #library-export
│   └── readme.ts — 2,546 B — 56 L — #board-export #domain-core
├── tools/
│   └── tui-screenshot-compare.sh — 17,070 B — 467 L — #dev-tool
├── .envrc — 261 B — 5 L — #nix
├── .fallowrc.jsonc — 829 B — 30 L — #config
├── .gitattributes — 66 B — 2 L — #config
├── .gitignore — 1,357 B — 84 L — #config
├── .npmignore — 399 B — 32 L — #config
├── ADVANCED-CONFIG.md — 8,465 B — 74 L — #doc-repo
├── AGENTS.md — 1,613 B — 44 L — #doc-repo
├── CLAUDE.md — 9 B — symlink → `AGENTS.md` — #agent-instruction #symlink
├── CLI-INSTRUCTIONS.md — 30,285 B — 410 L — #doc-repo
├── CONTRIBUTING.md — 898 B — 19 L — #doc-repo
├── DEVELOPMENT.md — 7,967 B — 235 L — #doc-repo
├── LICENSE — 1,067 B — 21 L — #doc-repo
├── README.md — 17,236 B — 377 L — #doc-repo
├── biome.json — 1,148 B — 58 L — #config
├── bun.lock — 65,397 B — 647 L — #lockfile
├── bun.nix — 138,492 B — 2,356 L — #nix
├── bunfig.toml — 268 B — 8 L — #config
├── flake.lock — 3,625 B — 143 L — #nix
├── flake.nix — 5,601 B — 166 L — #nix
├── package.json — 2,344 B — 93 L — #config
└── tsconfig.json — 742 B — 28 L — #config
```

### Ignored transient runtime state

Nothing below appears in the tree above: each path is recreated by the process that owns it, and none of it is repository content.

| Path | Role | `.gitignore` rule |
|---|---|---|
| `.backlog/` | The project's local runtime state root: pane view state (`view-state.json`), one session record directory per task (`<task-slug>/state.json` plus its logs), the `agent-requests/` markers written by `writeWorkspaceRequest` and consumed by the owning workspace's boot sweep (`workspaceRequestDir()` in `src/agent-workspace/workspace-context.ts`), and the `**/*.activity/` sidecars written by the agent status hooks (`src/agent-workspace/status-hooks.ts`, read back by `agent-status-probe.ts`). Resolved as `<executionDir>/.backlog`, with a `~/.backlog/<hash>` fallback when that path is not writable (`src/agent-workspace/session-store.ts`). | `.backlog/` (line 70) |
| `backlog/.locks/` | Lock files for task writes (`create`, `<scope>-<key>`) and for the workspace view state (`src/file-system/operations.ts`, `src/agent-workspace/view-state-store.ts`). Held only for the duration of a mutation. | `backlog/.locks/` (line 73) |

## 2. Tag catalog, grouped by purpose

Tags are grouped by the purpose they describe. A tag's carrying set is listed exactly; when it exceeds 20 files the set is given as per-directory counts (`dir/ ×N`). Files may carry several tags and therefore appear in several tag groups — but each file is assigned to exactly one purpose group in §3.

### Entry & CLI surface

- **`#entry`** — 2 file(s): `src/cli/index.ts`, `src/index.ts`
- **`#library-export`** — 1 file(s): `src/index.ts`
- **`#cli-command`** — 42 file(s): `src/cli/` ×2; `src/cli/features/` ×1; `src/cli/features/config/` ×4; `src/cli/features/drafts/` ×1; `src/cli/features/init/` ×3; `src/cli/features/milestones/` ×1; `src/cli/features/task/` ×1; `src/cli/features/tasks/` ×14; `src/commands/` ×15
- **`#cli-feature`** — 25 file(s): `src/cli/features/` ×1; `src/cli/features/config/` ×4; `src/cli/features/drafts/` ×1; `src/cli/features/init/` ×3; `src/cli/features/milestones/` ×1; `src/cli/features/task/` ×1; `src/cli/features/tasks/` ×14
- **`#cli-registry`** — 2 file(s): `src/cli/index.ts`, `src/cli/register.ts`
- **`#cli-runtime`** — 15 file(s): `src/cli/runtime.ts`, `src/commands/agent-workspace.ts`, `src/commands/cleanup.ts`, `src/commands/completion.ts`, `src/commands/content-commands.ts`, `src/commands/draft-actions.ts`, `src/commands/help-schema.ts`, `src/commands/instructions.ts`, `src/commands/mcp.ts`, `src/commands/overview.ts`, `src/commands/project-command.ts`, `src/commands/project-view-commands.ts`, `src/commands/search.ts`, `src/commands/skill.ts`, `src/commands/watch-json.ts`
- **`#cli-support`** — 7 file(s): `src/agent-instructions.ts`, `src/completions/command-structure.ts`, `src/completions/data-providers.ts`, `src/completions/helper.ts`, `src/formatters/dependency-graph-text.ts`, `src/formatters/json-output.ts`, `src/formatters/task-plain-text.ts`
- **`#shell-completion`** — 10 file(s): `completions/.gitkeep`, `completions/EXAMPLES.md`, `completions/README.md`, `completions/_backlog`, `completions/backlog.bash`, `completions/backlog.fish`, `completions/backlog.ps1`, `src/completions/command-structure.ts`, `src/completions/data-providers.ts`, `src/completions/helper.ts`
- **`#asset-completion`** — 7 file(s): `completions/.gitkeep`, `completions/EXAMPLES.md`, `completions/README.md`, `completions/_backlog`, `completions/backlog.bash`, `completions/backlog.fish`, `completions/backlog.ps1`
- **`#agent-instruction`** — 2 file(s): `CLAUDE.md`, `src/agent-instructions.ts`
### Task domain & shared utilities

- **`#domain-core`** — 37 file(s): `src/` ×2; `src/core/` ×31; `src/core/task-update/` ×4
- **`#task-model`** — 2 file(s): `src/types/index.ts`, `src/types/task-edit-args.ts`
- **`#task-update`** — 4 file(s): `src/core/task-update/collections.ts`, `src/core/task-update/content.ts`, `src/core/task-update/index.ts`, `src/core/task-update/scalars.ts`
- **`#board-model`** — 1 file(s): `src/board.ts`
- **`#board-export`** — 1 file(s): `src/readme.ts`
- **`#types`** — 2 file(s): `src/types/index.ts`, `src/types/task-edit-args.ts`
- **`#types-only`** — 6 file(s): `src/agent-workspace/live/tmux/types.ts`, `src/agent-workspace/types.ts`, `src/types/markdown.d.ts`, `src/types/neo-neo-bblessed.d.ts`, `src/types/proper-lockfile.d.ts`, `src/types/raw.d.ts`
- **`#formatter`** — 3 file(s): `src/formatters/dependency-graph-text.ts`, `src/formatters/json-output.ts`, `src/formatters/task-plain-text.ts`
- **`#constants`** — 1 file(s): `src/constants/index.ts`
- **`#shared-util`** — 52 file(s): `src/constants/` ×1; `src/utils/` ×51
- **`#process-util`** — 1 file(s): `src/process/capture.ts`
### Persistence, markdown & git

- **`#file-system`** — 7 file(s): `src/file-system/config.ts`, `src/file-system/content-repository.ts`, `src/file-system/lock-owner.ts`, `src/file-system/milestones.ts`, `src/file-system/operations.ts`, `src/file-system/project-layout.ts`, `src/file-system/task-repository.ts`
- **`#repository`** — 2 file(s): `src/file-system/content-repository.ts`, `src/file-system/task-repository.ts`
- **`#locking`** — 1 file(s): `src/file-system/lock-owner.ts`
- **`#markdown-io`** — 5 file(s): `src/markdown/frontmatter.ts`, `src/markdown/legacy-task-migration.ts`, `src/markdown/parser.ts`, `src/markdown/schema.ts`, `src/markdown/serializer.ts`
- **`#git-integration`** — 2 file(s): `src/agent-workspace/session-worktree.ts`, `src/git/operations.ts`
### Transports (MCP)

- **`#mcp-server`** — 24 file(s): `src/mcp/` ×5; `src/mcp/errors/` ×1; `src/mcp/resources/init-required/` ×1; `src/mcp/resources/workflow/` ×1; `src/mcp/tools/documents/` ×3; `src/mcp/tools/milestones/` ×3; `src/mcp/tools/tasks/` ×3; `src/mcp/tools/workflow/` ×1; `src/mcp/utils/` ×4; `src/mcp/validation/` ×2
- **`#mcp-tool`** — 10 file(s): `src/mcp/tools/documents/handlers.ts`, `src/mcp/tools/documents/index.ts`, `src/mcp/tools/documents/schemas.ts`, `src/mcp/tools/milestones/handlers.ts`, `src/mcp/tools/milestones/index.ts`, `src/mcp/tools/milestones/schemas.ts`, `src/mcp/tools/tasks/handlers.ts`, `src/mcp/tools/tasks/index.ts`, `src/mcp/tools/tasks/schemas.ts`, `src/mcp/tools/workflow/index.ts`
- **`#mcp-tool-index`** — 4 file(s): `src/mcp/tools/documents/index.ts`, `src/mcp/tools/milestones/index.ts`, `src/mcp/tools/tasks/index.ts`, `src/mcp/tools/workflow/index.ts`
- **`#mcp-handler`** — 3 file(s): `src/mcp/tools/documents/handlers.ts`, `src/mcp/tools/milestones/handlers.ts`, `src/mcp/tools/tasks/handlers.ts`
- **`#mcp-schema`** — 3 file(s): `src/mcp/tools/documents/schemas.ts`, `src/mcp/tools/milestones/schemas.ts`, `src/mcp/tools/tasks/schemas.ts`
- **`#mcp-resource`** — 2 file(s): `src/mcp/resources/init-required/index.ts`, `src/mcp/resources/workflow/index.ts`
- **`#mcp-util`** — 4 file(s): `src/mcp/utils/document-response.ts`, `src/mcp/utils/milestone-resolution.ts`, `src/mcp/utils/schema-generators.ts`, `src/mcp/utils/task-response.ts`
- **`#mcp-validation`** — 2 file(s): `src/mcp/validation/tool-wrapper.ts`, `src/mcp/validation/validators.ts`
- **`#mcp-error`** — 1 file(s): `src/mcp/errors/mcp-errors.ts`
### Agent workspace & sessions

- **`#agent-session`** — 27 file(s): `src/agent-workspace/` ×19; `src/agent-workspace/live/` ×3; `src/agent-workspace/live/input/` ×1; `src/agent-workspace/live/tmux/` ×4
- **`#agent-live`** — 8 file(s): `src/agent-workspace/live/agent-host.ts`, `src/agent-workspace/live/existing-agent-host.ts`, `src/agent-workspace/live/input/worker.ts`, `src/agent-workspace/live/latency-trace.ts`, `src/agent-workspace/live/tmux/exec.ts`, `src/agent-workspace/live/tmux/socket.ts`, `src/agent-workspace/live/tmux/types.ts`, `src/agent-workspace/live/tmux/vt-channel.ts`
- **`#agent-tmux`** — 6 file(s): `src/agent-workspace/agent-status-probe.ts`, `src/agent-workspace/live/tmux/exec.ts`, `src/agent-workspace/live/tmux/socket.ts`, `src/agent-workspace/live/tmux/types.ts`, `src/agent-workspace/live/tmux/vt-channel.ts`, `src/agent-workspace/tmux-pane-lookup.ts`
- **`#agent-worker`** — 2 file(s): `src/agent-workspace/live/input/worker.ts`, `src/agent-workspace/session-worker-client.ts`
- **`#agent-status`** — 3 file(s): `src/agent-workspace/agent-status-probe.ts`, `src/agent-workspace/agent-status.ts`, `src/agent-workspace/status-hooks.ts`
- **`#workspace-state`** — 3 file(s): `src/agent-workspace/session-store.ts`, `src/agent-workspace/view-state-store.ts`, `src/agent-workspace/workspace-state.ts`
- **`#workspace-controller`** — 5 file(s): `src/ui/opentui/workspace-agent.ts`, `src/ui/opentui/workspace-controller.ts`, `src/ui/opentui/workspace.ts`, `src/ui/workspace/model/drafts.ts`, `src/ui/workspace/state.ts`
### Terminal UI (TUI / OpenTUI)

- **`#opentui-view`** — 16 file(s): `src/ui/opentui/agent-settings.ts`, `src/ui/opentui/board.ts`, `src/ui/opentui/controls.ts`, `src/ui/opentui/filters.ts`, `src/ui/opentui/host.ts`, `src/ui/opentui/keybindings.ts`, `src/ui/opentui/navigation-history.ts`, `src/ui/opentui/scrollable-viewer.ts`, `src/ui/opentui/session-picker.ts`, `src/ui/opentui/status-tabs.ts`, `src/ui/opentui/task-actions.ts`, `src/ui/opentui/task-composer.ts`, `src/ui/opentui/task-viewer.ts`, `src/ui/opentui/workspace-agent.ts`, `src/ui/opentui/workspace-controller.ts`, `src/ui/opentui/workspace.ts`
- **`#opentui-host`** — 3 file(s): `src/ui/opentui/agent-settings.ts`, `src/ui/opentui/host.ts`, `src/ui/opentui/keybindings.ts`
- **`#tui-board`** — 20 file(s): `src/ui/board/board-actions.ts`, `src/ui/board/board-interaction.ts`, `src/ui/board/components/board-dialogs.ts`, `src/ui/board/components/board-view.ts`, `src/ui/board/components/filter-bar.ts`, `src/ui/board/components/footer.ts`, `src/ui/board/components/lane-view.ts`, `src/ui/board/components/task-popup.ts`, `src/ui/board/configuration.ts`, `src/ui/board/interaction.ts`, `src/ui/board/models/board.ts`, `src/ui/board/models/filter.ts`, `src/ui/board/models/lane.ts`, `src/ui/board/policies/column-policy.ts`, `src/ui/board/policies/creation-outcome.ts`, `src/ui/board/policies/filter-policy.ts`, `src/ui/board/policies/move-policy.ts`, `src/ui/board/policies/navigation.ts`, `src/ui/board/screen.ts`, `src/ui/board/tui-renderer.ts`
- **`#tui-task-viewer`** — 11 file(s): `src/ui/task-viewer/configuration.ts`, `src/ui/task-viewer/controller.ts`, `src/ui/task-viewer/detail-content.ts`, `src/ui/task-viewer/editor.ts`, `src/ui/task-viewer/filters.ts`, `src/ui/task-viewer/interactions.ts`, `src/ui/task-viewer/lifecycle-shortcut.ts`, `src/ui/task-viewer/lifecycle.ts`, `src/ui/task-viewer/navigation.ts`, `src/ui/task-viewer/rendering.ts`, `src/ui/task-viewer/session.ts`
- **`#tui-unified`** — 2 file(s): `src/ui/unified/controller.ts`, `src/ui/unified/session.ts`
- **`#tui-component`** — 7 file(s): `src/ui/components/confirm-popup.ts`, `src/ui/components/filter-header.ts`, `src/ui/components/filter-popup.ts`, `src/ui/components/footer-search.ts`, `src/ui/components/generic-list.ts`, `src/ui/components/help-popup.ts`, `src/ui/components/task-composer.ts`
- **`#tui-util`** — 1 file(s): `src/ui/utils/strip-tags.ts`
- **`#tui-shell`** — 18 file(s): `src/ui/code-path.ts`, `src/ui/footer-content.ts`, `src/ui/heading.ts`, `src/ui/keymap.ts`, `src/ui/list-removal-adapter.ts`, `src/ui/loading.ts`, `src/ui/overview-content.ts`, `src/ui/overview-tui.ts`, `src/ui/project.ts`, `src/ui/root-entry.ts`, `src/ui/shared/task-popup.ts`, `src/ui/status-icon.ts`, `src/ui/task-filter-wiring.ts`, `src/ui/task-labels.ts`, `src/ui/task-lifecycle.ts`, `src/ui/task-type.ts`, `src/ui/tui.ts`, `src/ui/view-switcher.ts`
### Tests

- **`#test-suite`** — 243 file(s): `src/agent-workspace/` ×8; `src/agent-workspace/live/tmux/` ×1; `src/commands/` ×2; `src/completions/` ×1; `src/file-system/` ×1; `src/test/` ×229; `src/utils/` ×1
- **`#test-unit`** — 171 file(s): `src/agent-workspace/` ×7; `src/agent-workspace/live/tmux/` ×1; `src/commands/` ×2; `src/completions/` ×1; `src/file-system/` ×1; `src/test/` ×158; `src/utils/` ×1
- **`#test-integration`** — 68 file(s): `src/agent-workspace/` ×1; `src/test/` ×67
- **`#test-pty`** — 4 file(s): `src/test/board-hide-empty-columns.test.ts`, `src/test/board-tui-multi-move-pty.test.ts`, `src/test/cli-init-cursor-pty.test.ts`, `src/test/tui-ready-filter-pty.test.ts`
- **`#test-helper`** — 6 file(s): `src/test/pin-timezone.ts`, `src/test/test-cli.ts`, `src/test/test-preload.ts`, `src/test/test-utils.test.ts`, `src/test/test-utils.ts`, `src/test/tmux-test-server.ts`
- **`#test-regression`** — 1 file(s): `src/test/core-task-corpus-regressions.test.ts`
### Docs & guidance

- **`#doc-spec`** — 14 file(s): `docs/BACK-728-handoff.md`, `docs/agent-session-ownership-plan.md`, `docs/aoe-agent-workspace-reference.md`, `docs/aoe-lifecycle-comparison.md`, `docs/aoe-lifecycle-implementation-plan.md`, `docs/aoe-status-tracking-plan.md`, `docs/disk-growth-investigation.md`, `docs/opentui-workspace-behavior-matrix.md`, `docs/opentui-workspace-implementation-plan.md`, `docs/opentui-workspace-session-contract.md`, `docs/opentui-workspace-spec.md`, `docs/test-suite-runtime-report.md`, `docs/tmux-call-sites.md`, `docs/tmux-layer-spec.md`
- **`#doc-repo`** — 7 file(s): `ADVANCED-CONFIG.md`, `AGENTS.md`, `CLI-INSTRUCTIONS.md`, `CONTRIBUTING.md`, `DEVELOPMENT.md`, `LICENSE`, `README.md`
- **`#guidance-doc`** — 18 file(s): `src/guidelines/cli-agent-nudge.md`, `src/guidelines/cli-instructions/agent-workspace.md`, `src/guidelines/cli-instructions/index.ts`, `src/guidelines/cli-instructions/init-required.md`, `src/guidelines/cli-instructions/overview.md`, `src/guidelines/cli-instructions/task-creation.md`, `src/guidelines/cli-instructions/task-execution.md`, `src/guidelines/cli-instructions/task-finalization.md`, `src/guidelines/index.ts`, `src/guidelines/mcp/agent-nudge.md`, `src/guidelines/mcp/index.ts`, `src/guidelines/mcp/init-required.md`, `src/guidelines/mcp/overview-tools.md`, `src/guidelines/mcp/overview.md`, `src/guidelines/mcp/task-creation.md`, `src/guidelines/mcp/task-execution.md`, `src/guidelines/mcp/task-finalization.md`, `src/mcp/README.md`
- **`#guidance-ts`** — 3 file(s): `src/guidelines/cli-instructions/index.ts`, `src/guidelines/index.ts`, `src/guidelines/mcp/index.ts`
### Backlog workspace data

- **`#backlog-config`** — 1 file(s): `backlog/config.yml`
### Tooling, config & environment

- **`#build-script`** — 8 file(s): `scripts/benchmark-task-loading.ts`, `scripts/build.ts`, `scripts/cli.cjs`, `scripts/postuninstall.cjs`, `scripts/resolveBinary.cjs`, `scripts/run-tui-interactive-tests.sh`, `scripts/smoke-compiled-build.ts`, `scripts/smoke-parallel-task-locking.sh`
- **`#dev-tool`** — 1 file(s): `tools/tui-screenshot-compare.sh`
- **`#ci-workflow`** — 2 file(s): `.github/workflows/ci.yml`, `.github/workflows/release.yml`
- **`#repo-meta`** — 16 file(s): `.github/5-minute-tour-256.png`, `.github/ISSUE_TEMPLATE/bug_report.md`, `.github/ISSUE_TEMPLATE/feature_request.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/backlog-logo.png`, `.github/backlog-v1.40.gif`, `.github/backlog.jpg`, `.github/backlog.mp4`, `.github/cli-reference-256.png`, `.github/configuration-256.png`, `.github/copilot-instructions.md`, `.github/favicon.png`, `.github/sharing-export-256.png`, `.github/video-presentation.md`, `.github/web-interface-256.png`, `.github/web.jpeg`
- **`#git-hook`** — 18 file(s): `.husky/_/.gitignore`, `.husky/_/applypatch-msg`, `.husky/_/commit-msg`, `.husky/_/h`, `.husky/_/husky.sh`, `.husky/_/post-applypatch`, `.husky/_/post-checkout`, `.husky/_/post-commit`, `.husky/_/post-merge`, `.husky/_/post-rewrite`, `.husky/_/pre-applypatch`, `.husky/_/pre-auto-gc`, `.husky/_/pre-commit`, `.husky/_/pre-merge-commit`, `.husky/_/pre-push`, `.husky/_/pre-rebase`, `.husky/_/prepare-commit-msg`, `.husky/pre-commit`
- **`#nix`** — 4 file(s): `.envrc`, `bun.nix`, `flake.lock`, `flake.nix`
- **`#lockfile`** — 1 file(s): `bun.lock`
- **`#tool-cache`** — 4 file(s): `.fallow/.gitignore`, `.fallow/cache.bin`, `.fallow/churn.bin`, `.fallow/graph-cache.bin`
- **`#agent-editor-config`** — 9 file(s): `.codex/.gitignore`, `.omp/extensions/rtk.ts`, `.pi/subagentura-state.json`, `.serena/.gitignore`, `.serena/cache/typescript/document_symbols.pkl`, `.serena/cache/typescript/raw_document_symbols.pkl`, `.serena/project.local.yml`, `.serena/project.yml`, `.vscode/launch.json`
- **`#config`** — 8 file(s): `.fallowrc.jsonc`, `.gitattributes`, `.gitignore`, `.npmignore`, `biome.json`, `bunfig.toml`, `package.json`, `tsconfig.json`
### Media & misc

- **`#asset-image`** — 10 file(s): `.github/5-minute-tour-256.png`, `.github/backlog-logo.png`, `.github/backlog-v1.40.gif`, `.github/backlog.jpg`, `.github/cli-reference-256.png`, `.github/configuration-256.png`, `.github/favicon.png`, `.github/sharing-export-256.png`, `.github/web-interface-256.png`, `.github/web.jpeg`
- **`#asset-video`** — 1 file(s): `.github/backlog.mp4`
- **`#symlink`** — 1 file(s): `CLAUDE.md`

## 3. Grouped tree view (one dominant purpose per file)

Each file appears exactly once, under its dominant purpose group; tags are shown inline (`#` list), so cross-cutting roles stay visible. `*` marks the dominant tag used for the grouping when a file has several.

### Entry & CLI surface — `entry-cli` (54 files, 365,891 B)

```
.
├── completions/
│   ├── .gitkeep — 599 B — 15 L — #asset-completion #shell-completion
│   ├── EXAMPLES.md — 4,872 B — 218 L — #asset-completion #shell-completion
│   ├── README.md — 6,208 B — 287 L — #asset-completion #shell-completion
│   ├── _backlog — 1,133 B — 35 L — #asset-completion #shell-completion
│   ├── backlog.bash — 2,081 B — 64 L — #asset-completion #shell-completion
│   ├── backlog.fish — 1,443 B — 38 L — #asset-completion #shell-completion
│   └── backlog.ps1 — 1,395 B — 43 L — #asset-completion #shell-completion
└── src/
    ├── cli/
    │   ├── features/
    │   │   ├── config/
    │   │   │   ├── advanced-wizard.ts — 18,878 B — 601 L — #cli-command #cli-feature
    │   │   │   ├── configure-advanced-settings.ts — 1,162 B — 34 L — #cli-command #cli-feature
    │   │   │   ├── register.ts — 10,024 B — 265 L — #cli-command #cli-feature
    │   │   │   └── values.ts — 7,779 B — 186 L — #cli-command #cli-feature
    │   │   ├── drafts/
    │   │   │   └── register.ts — 11,945 B — 232 L — #cli-command #cli-feature
    │   │   ├── init/
    │   │   │   ├── options.ts — 4,230 B — 107 L — #cli-command #cli-feature
    │   │   │   ├── provider.ts — 3,891 B — 94 L — #cli-command #cli-feature
    │   │   │   └── register.ts — 27,636 B — 666 L — #cli-command #cli-feature
    │   │   ├── milestones/
    │   │   │   └── register.ts — 11,363 B — 260 L — #cli-command #cli-feature
    │   │   ├── task/
    │   │   │   └── edit-fields.ts — 7,507 B — 236 L — #cli-command #cli-feature
    │   │   ├── tasks/
    │   │   │   ├── create.ts — 7,911 B — 173 L — #cli-command #cli-feature
    │   │   │   ├── edit-list-options.ts — 2,785 B — 77 L — #cli-command #cli-feature
    │   │   │   ├── edit-options.ts — 10,393 B — 240 L — #cli-command #cli-feature
    │   │   │   ├── edit.ts — 11,346 B — 272 L — #cli-command #cli-feature
    │   │   │   ├── filter-normalizers.ts — 2,445 B — 62 L — #cli-command #cli-feature
    │   │   │   ├── input.ts — 3,646 B — 85 L — #cli-command #cli-feature
    │   │   │   ├── list-parse.ts — 4,531 B — 131 L — #cli-command #cli-feature
    │   │   │   ├── list-project-filter.ts — 2,222 B — 46 L — #cli-command #cli-feature
    │   │   │   ├── list-project.ts — 2,015 B — 47 L — #cli-command #cli-feature
    │   │   │   ├── list-query.ts — 2,130 B — 50 L — #cli-command #cli-feature
    │   │   │   ├── list-render.ts — 1,731 B — 34 L — #cli-command #cli-feature
    │   │   │   ├── policies.ts — 1,428 B — 31 L — #cli-command #cli-feature
    │   │   │   ├── register.ts — 22,054 B — 505 L — #cli-command #cli-feature
    │   │   │   └── wizard.ts — 26,254 B — 757 L — #cli-command #cli-feature
    │   │   └── read-output.ts — 1,394 B — 35 L — #cli-command #cli-feature
    │   ├── index.ts — 395 B — 10 L — #cli-registry #entry
    │   ├── register.ts — 10,737 B — 274 L — #cli-command #cli-registry
    │   └── runtime.ts — 938 B — 27 L — #cli-command #cli-runtime
    ├── commands/
    │   ├── agent-workspace.ts — 13,079 B — 321 L — #cli-command #cli-runtime
    │   ├── cleanup.ts — 6,276 B — 180 L — #cli-command #cli-runtime
    │   ├── completion.ts — 15,480 B — 526 L — #cli-command #cli-runtime
    │   ├── content-commands.ts — 13,540 B — 304 L — #cli-command #cli-runtime
    │   ├── draft-actions.ts — 632 B — 20 L — #cli-command #cli-runtime
    │   ├── help-schema.ts — 8,476 B — 252 L — #cli-command #cli-runtime
    │   ├── instructions.ts — 3,018 B — 90 L — #cli-command #cli-runtime
    │   ├── mcp.ts — 3,750 B — 106 L — #cli-command #cli-runtime
    │   ├── overview.ts — 1,496 B — 46 L — #cli-command #cli-runtime
    │   ├── project-command.ts — 492 B — 13 L — #cli-command #cli-runtime
    │   ├── project-view-commands.ts — 5,748 B — 139 L — #cli-command #cli-runtime
    │   ├── search.ts — 15,335 B — 387 L — #cli-command #cli-runtime
    │   ├── skill.ts — 349 B — 11 L — #cli-command #cli-runtime
    │   └── watch-json.ts — 7,551 B — 248 L — #cli-command #cli-runtime
    ├── completions/
    │   ├── command-structure.ts — 3,951 B — 162 L — #cli-support #shell-completion
    │   ├── data-providers.ts — 3,288 B — 120 L — #cli-support #shell-completion
    │   └── helper.ts — 5,605 B — 194 L — #cli-support #shell-completion
    └── agent-instructions.ts — 8,236 B — 233 L — #agent-instruction #cli-support
```

### Task domain, core & shared utilities — `task-domain` (100 files, 528,663 B)

```
.
└── src/
    ├── constants/
    │   └── index.ts — 3,059 B — 104 L — #constants #shared-util
    ├── core/
    │   ├── task-update/
    │   │   ├── collections.ts — 4,420 B — 128 L — #domain-core #task-update
    │   │   ├── content.ts — 3,557 B — 110 L — #domain-core #task-update
    │   │   ├── index.ts — 867 B — 19 L — #domain-core #task-update
    │   │   └── scalars.ts — 4,135 B — 136 L — #domain-core #task-update
    │   ├── backlog.ts — 51,068 B — 1,350 L — #domain-core
    │   ├── config-migration-workflow.ts — 1,969 B — 43 L — #domain-core
    │   ├── config-migration.ts — 2,385 B — 60 L — #domain-core
    │   ├── domain-errors.ts — 200 B — 7 L — #domain-core
    │   ├── duplicate-task-repair.ts — 30,656 B — 777 L — #domain-core
    │   ├── init-helpers.ts — 11,576 B — 322 L — #domain-core
    │   ├── init.ts — 1,123 B — 39 L — #domain-core
    │   ├── legacy-milestone-parser.ts — 3,369 B — 91 L — #domain-core
    │   ├── milestone-resolution.ts — 2,280 B — 51 L — #domain-core
    │   ├── milestone-workflow.ts — 13,046 B — 346 L — #domain-core
    │   ├── milestones.ts — 12,024 B — 372 L — #domain-core
    │   ├── ordered-task-move-planner.ts — 3,554 B — 102 L — #domain-core
    │   ├── persistent-task-read.ts — 4,249 B — 104 L — #domain-core
    │   ├── prefix-migration.ts — 2,949 B — 101 L — #domain-core
    │   ├── project-content-service.ts — 8,306 B — 218 L — #domain-core
    │   ├── project-task-graph.ts — 3,645 B — 91 L — #domain-core
    │   ├── reorder.ts — 4,399 B — 135 L — #domain-core
    │   ├── search-service.ts — 3,587 B — 113 L — #domain-core
    │   ├── statistics.ts — 5,817 B — 178 L — #domain-core
    │   ├── task-creation-input.ts — 4,935 B — 132 L — #domain-core
    │   ├── task-creation-transaction.ts — 2,522 B — 78 L — #domain-core
    │   ├── task-creation-workflow.ts — 4,576 B — 105 L — #domain-core
    │   ├── task-detail.ts — 7,813 B — 183 L — #domain-core
    │   ├── task-identity-index.ts — 12,488 B — 343 L — #domain-core
    │   ├── task-lifecycle-service.ts — 13,457 B — 325 L — #domain-core
    │   ├── task-loader.ts — 21,309 B — 615 L — #domain-core
    │   ├── task-mutation-service.ts — 11,973 B — 285 L — #domain-core
    │   ├── task-query-workflow.ts — 1,459 B — 37 L — #domain-core
    │   ├── task-reorder-plan.ts — 2,014 B — 48 L — #domain-core
    │   ├── tui-task-edit-session.ts — 7,713 B — 212 L — #domain-core
    │   └── vacated-task-reference-service.ts — 3,368 B — 85 L — #domain-core
    ├── formatters/
    │   ├── dependency-graph-text.ts — 5,472 B — 143 L — #cli-support #formatter
    │   ├── json-output.ts — 9,187 B — 286 L — #cli-support #formatter
    │   └── task-plain-text.ts — 7,575 B — 206 L — #cli-support #formatter
    ├── process/
    │   └── capture.ts — 633 B — 20 L — #process-util
    ├── types/
    │   ├── index.ts — 12,605 B — 442 L — #task-model #types
    │   ├── markdown.d.ts — 75 B — 4 L — #types-only
    │   ├── neo-neo-bblessed.d.ts — 3,801 B — 111 L — #types-only
    │   ├── proper-lockfile.d.ts — 581 B — 27 L — #types-only
    │   ├── raw.d.ts — 79 B — 4 L — #types-only
    │   └── task-edit-args.ts — 1,255 B — 47 L — #task-model #types
    ├── utils/
    │   ├── agent-selection.ts — 1,719 B — 59 L — #shared-util
    │   ├── app-info.ts — 245 B — 7 L — #shared-util
    │   ├── backlog-directory.ts — 6,936 B — 246 L — #shared-util
    │   ├── browser-launch.ts — 833 B — 28 L — #shared-util
    │   ├── clipboard.ts — 1,251 B — 50 L — #shared-util
    │   ├── config-line.ts — 351 B — 10 L — #shared-util
    │   ├── config-watcher.ts — 7,650 B — 238 L — #shared-util
    │   ├── date.ts — 206 B — 4 L — #shared-util
    │   ├── debug-log.ts — 7,247 B — 205 L — #shared-util
    │   ├── decision-id.ts — 606 B — 20 L — #shared-util
    │   ├── dependency-graph.ts — 15,998 B — 393 L — #shared-util
    │   ├── document-id.ts — 875 B — 28 L — #shared-util
    │   ├── document-path.ts — 1,201 B — 46 L — #shared-util
    │   ├── due-date.ts — 2,938 B — 54 L — #shared-util
    │   ├── duplicate-detection.ts — 3,718 B — 104 L — #shared-util
    │   ├── editor.ts — 2,456 B — 93 L — #shared-util
    │   ├── entity-id.ts — 2,511 B — 74 L — #shared-util
    │   ├── find-backlog-root.ts — 1,927 B — 67 L — #shared-util
    │   ├── id-generators.ts — 3,340 B — 99 L — #shared-util
    │   ├── label-filter.ts — 2,441 B — 84 L — #shared-util
    │   ├── list-window.ts — 8,165 B — 213 L — #shared-util
    │   ├── mcp-client-setup.ts — 2,267 B — 71 L — #shared-util
    │   ├── milestone-filter.ts — 6,795 B — 172 L — #shared-util
    │   ├── milestone-storage.ts — 4,046 B — 111 L — #shared-util
    │   ├── modified-files.ts — 825 B — 25 L — #shared-util
    │   ├── prefix-config.ts — 14,874 B — 452 L — #shared-util
    │   ├── priority-config.ts — 3,294 B — 105 L — #shared-util
    │   ├── project-config.ts — 2,989 B — 92 L — #shared-util
    │   ├── read-output-mode.ts — 492 B — 16 L — #shared-util
    │   ├── readiness.ts — 5,036 B — 124 L — #shared-util
    │   ├── runtime-cwd.ts — 1,498 B — 62 L — #shared-util
    │   ├── status-callback.ts — 1,657 B — 69 L — #shared-util
    │   ├── status-filter.ts — 981 B — 18 L — #shared-util
    │   ├── status.ts — 2,980 B — 91 L — #shared-util
    │   ├── task-builders.ts — 13,846 B — 321 L — #shared-util
    │   ├── task-edit-builder.ts — 7,734 B — 211 L — #shared-util
    │   ├── task-id-search.ts — 985 B — 33 L — #shared-util
    │   ├── task-id.ts — 4,193 B — 114 L — #shared-util
    │   ├── task-links.ts — 2,151 B — 51 L — #shared-util
    │   ├── task-path.ts — 7,265 B — 208 L — #shared-util
    │   ├── task-record-index.ts — 3,933 B — 94 L — #shared-util
    │   ├── task-search.ts — 9,379 B — 256 L — #shared-util
    │   ├── task-sorting.ts — 6,212 B — 191 L — #shared-util
    │   ├── task-subtasks.ts — 2,268 B — 73 L — #shared-util
    │   ├── task-type-config.ts — 2,638 B — 84 L — #shared-util
    │   ├── task-updated-date.ts — 1,396 B — 41 L — #shared-util
    │   ├── task-watcher.ts — 10,243 B — 298 L — #shared-util
    │   ├── terminal-status.ts — 686 B — 16 L — #shared-util
    │   ├── time.ts — 57 B — 1 L — #shared-util
    │   ├── utc-date-display.ts — 5,140 B — 134 L — #shared-util
    │   └── version.ts — 665 B — 21 L — #shared-util
    ├── board.ts — 9,212 B — 277 L — #board-model #domain-core
    ├── index.ts — 636 B — 27 L — #entry #library-export
    └── readme.ts — 2,546 B — 56 L — #board-export #domain-core
```

### Persistence, markdown, filesystem & git — `persistence` (14 files, 168,984 B)

```
.
└── src/
    ├── file-system/
    │   ├── config.ts — 15,178 B — 363 L — #file-system
    │   ├── content-repository.ts — 6,125 B — 152 L — #file-system #repository
    │   ├── lock-owner.ts — 1,251 B — 50 L — #file-system #locking
    │   ├── milestones.ts — 9,745 B — 265 L — #file-system
    │   ├── operations.ts — 55,392 B — 1,570 L — #file-system
    │   ├── project-layout.ts — 509 B — 15 L — #file-system
    │   └── task-repository.ts — 4,132 B — 111 L — #file-system #repository
    ├── git/
    │   ├── operations.ts — 29,937 B — 929 L — #git-integration
    └── markdown/
        ├── frontmatter.ts — 1,467 B — 35 L — #markdown-io
        ├── legacy-task-migration.ts — 7,206 B — 150 L — #markdown-io
        ├── parser.ts — 14,126 B — 326 L — #markdown-io
        ├── schema.ts — 1,968 B — 78 L — #markdown-io
        └── serializer.ts — 8,638 B — 182 L — #markdown-io
```

### Transports (MCP) — `transports` (24 files, 110,000 B)

```
.
└── src/
    └── mcp/
        ├── errors/
        │   └── mcp-errors.ts — 2,407 B — 89 L — #mcp-error #mcp-server
        ├── resources/
        │   ├── init-required/
        │   │   └── index.ts — 1,024 B — 33 L — #mcp-resource #mcp-server
        │   └── workflow/
        │       └── index.ts — 624 B — 25 L — #mcp-resource #mcp-server
        ├── tools/
        │   ├── documents/
        │   │   ├── handlers.ts — 5,203 B — 195 L — #mcp-handler #mcp-server #mcp-tool
        │   │   ├── index.ts — 3,476 B — 99 L — #mcp-server #mcp-tool #mcp-tool-index
        │   │   └── schemas.ts — 1,905 B — 112 L — #mcp-schema #mcp-server #mcp-tool
        │   ├── milestones/
        │   │   ├── handlers.ts — 13,913 B — 370 L — #mcp-handler #mcp-server #mcp-tool
        │   │   ├── index.ts — 2,887 B — 76 L — #mcp-server #mcp-tool #mcp-tool-index
        │   │   └── schemas.ts — 2,470 B — 101 L — #mcp-schema #mcp-server #mcp-tool
        │   ├── tasks/
        │   │   ├── handlers.ts — 16,852 B — 451 L — #mcp-handler #mcp-server #mcp-tool
        │   │   ├── index.ts — 4,657 B — 117 L — #mcp-server #mcp-tool #mcp-tool-index
        │   │   └── schemas.ts — 920 B — 45 L — #mcp-schema #mcp-server #mcp-tool
        │   └── workflow/
        │       └── index.ts — 2,036 B — 78 L — #mcp-server #mcp-tool #mcp-tool-index
        ├── utils/
        │   ├── document-response.ts — 1,556 B — 50 L — #mcp-server #mcp-util
        │   ├── milestone-resolution.ts — 271 B — 6 L — #mcp-server #mcp-util
        │   ├── schema-generators.ts — 14,550 B — 567 L — #mcp-server #mcp-util
        │   └── task-response.ts — 756 B — 23 L — #mcp-server #mcp-util
        ├── validation/
        │   ├── tool-wrapper.ts — 2,563 B — 85 L — #mcp-server #mcp-validation
        │   └── validators.ts — 7,628 B — 221 L — #mcp-server #mcp-validation
        ├── README.md — 1,655 B — 35 L — #guidance-doc #mcp-server
        ├── root-activation.ts — 4,435 B — 116 L — #mcp-server
        ├── server.ts — 13,976 B — 432 L — #mcp-server
        ├── types.ts — 755 B — 36 L — #mcp-server
        └── workflow-guides.ts — 3,481 B — 107 L — #mcp-server
```

### Agent workspace & sessions — `agent-workspace` (27 files, 234,499 B)

```
.
└── src/
    └── agent-workspace/
        ├── live/
        │   ├── input/
        │   │   └── worker.ts — 3,728 B — 111 L — #agent-live #agent-session #agent-worker
        │   ├── tmux/
        │   │   ├── exec.ts — 3,316 B — 93 L — #agent-live #agent-session #agent-tmux
        │   │   ├── socket.ts — 3,891 B — 86 L — #agent-live #agent-session #agent-tmux
        │   │   ├── types.ts — 2,060 B — 47 L — #agent-live #agent-session #agent-tmux #types-only
        │   │   └── vt-channel.ts — 32,893 B — 833 L — #agent-live #agent-session #agent-tmux
        │   ├── agent-host.ts — 16,812 B — 430 L — #agent-live #agent-session
        │   ├── existing-agent-host.ts — 3,788 B — 106 L — #agent-live #agent-session
        │   └── latency-trace.ts — 492 B — 11 L — #agent-live #agent-session
        ├── agent-status-probe.ts — 4,553 B — 112 L — #agent-session #agent-status #agent-tmux
        ├── agent-status.ts — 11,433 B — 251 L — #agent-session #agent-status
        ├── bootstrap.ts — 4,238 B — 133 L — #agent-session
        ├── config.ts — 10,601 B — 286 L — #agent-session
        ├── process-tree.ts — 9,265 B — 205 L — #agent-session
        ├── session-launch.ts — 12,213 B — 285 L — #agent-session
        ├── session-process.ts — 18,752 B — 483 L — #agent-session
        ├── session-store.ts — 10,506 B — 286 L — #agent-session #workspace-state
        ├── session-utils.ts — 943 B — 28 L — #agent-session
        ├── session-worker-client.ts — 1,047 B — 36 L — #agent-session #agent-worker
        ├── session-worktree.ts — 908 B — 18 L — #agent-session #git-integration
        ├── sessions.ts — 36,939 B — 872 L — #agent-session
        ├── status-hooks.ts — 19,467 B — 477 L — #agent-session #agent-status
        ├── task-skill.ts — 864 B — 32 L — #agent-session
        ├── tmux-pane-lookup.ts — 3,293 B — 106 L — #agent-session #agent-tmux
        ├── types.ts — 3,581 B — 129 L — #agent-session #types-only
        ├── view-state-store.ts — 7,433 B — 234 L — #agent-session #workspace-state
        ├── workspace-context.ts — 9,786 B — 230 L — #agent-session
        └── workspace-state.ts — 1,697 B — 48 L — #agent-session #workspace-state
```

### Terminal UI (TUI / OpenTUI) — `ui-tui` (77 files, 614,173 B)

```
.
└── src/
    └── ui/
        ├── board/
        │   ├── components/
        │   │   ├── board-dialogs.ts — 3,028 B — 96 L — #tui-board
        │   │   ├── board-view.ts — 4,410 B — 145 L — #tui-board
        │   │   ├── filter-bar.ts — 6,549 B — 206 L — #tui-board
        │   │   ├── footer.ts — 3,807 B — 102 L — #tui-board
        │   │   ├── lane-view.ts — 5,260 B — 167 L — #tui-board
        │   │   └── task-popup.ts — 7,273 B — 208 L — #tui-board
        │   ├── models/
        │   │   ├── board.ts — 10,523 B — 300 L — #tui-board
        │   │   ├── filter.ts — 3,557 B — 100 L — #tui-board
        │   │   └── lane.ts — 727 B — 23 L — #tui-board
        │   ├── policies/
        │   │   ├── column-policy.ts — 4,707 B — 116 L — #tui-board
        │   │   ├── creation-outcome.ts — 600 B — 20 L — #tui-board
        │   │   ├── filter-policy.ts — 763 B — 28 L — #tui-board
        │   │   ├── move-policy.ts — 2,479 B — 64 L — #tui-board
        │   │   └── navigation.ts — 2,768 B — 82 L — #tui-board
        │   ├── board-actions.ts — 4,053 B — 121 L — #tui-board
        │   ├── board-interaction.ts — 13,523 B — 416 L — #tui-board
        │   ├── configuration.ts — 3,348 B — 102 L — #tui-board
        │   ├── interaction.ts — 526 B — 13 L — #tui-board
        │   ├── screen.ts — 1,552 B — 46 L — #tui-board
        │   └── tui-renderer.ts — 11,708 B — 343 L — #tui-board
        ├── components/
        │   ├── confirm-popup.ts — 1,330 B — 58 L — #tui-component
        │   ├── filter-header.ts — 19,716 B — 697 L — #tui-component
        │   ├── filter-popup.ts — 11,380 B — 361 L — #tui-component
        │   ├── footer-search.ts — 7,105 B — 253 L — #tui-component
        │   ├── generic-list.ts — 20,759 B — 646 L — #tui-component
        │   ├── help-popup.ts — 7,052 B — 170 L — #tui-component
        │   └── task-composer.ts — 40,569 B — 1,111 L — #tui-component
        ├── opentui/
        │   ├── agent-settings.ts — 29,347 B — 828 L — #opentui-host #opentui-view
        │   ├── board.ts — 20,942 B — 537 L — #opentui-view
        │   ├── controls.ts — 9,752 B — 326 L — #opentui-view
        │   ├── filters.ts — 28,038 B — 834 L — #opentui-view
        │   ├── host.ts — 1,100 B — 37 L — #opentui-host #opentui-view
        │   ├── keybindings.ts — 23,179 B — 520 L — #opentui-host #opentui-view
        │   ├── navigation-history.ts — 1,685 B — 50 L — #opentui-view
        │   ├── scrollable-viewer.ts — 2,378 B — 69 L — #opentui-view
        │   ├── session-picker.ts — 3,736 B — 110 L — #opentui-view
        │   ├── status-tabs.ts — 8,036 B — 263 L — #opentui-view
        │   ├── task-actions.ts — 6,467 B — 207 L — #opentui-view
        │   ├── task-composer.ts — 5,772 B — 183 L — #opentui-view
        │   ├── task-viewer.ts — 15,544 B — 434 L — #opentui-view
        │   ├── workspace-agent.ts — 1,667 B — 46 L — #opentui-view #workspace-controller
        │   ├── workspace-controller.ts — 72,009 B — 1,832 L — #opentui-view #workspace-controller
        │   └── workspace.ts — 28,063 B — 758 L — #opentui-view #workspace-controller
        ├── shared/
        │   └── task-popup.ts — 3,180 B — 116 L — #tui-shell
        ├── task-viewer/
        │   ├── configuration.ts — 4,803 B — 130 L — #tui-task-viewer
        │   ├── controller.ts — 31,712 B — 835 L — #tui-task-viewer
        │   ├── detail-content.ts — 10,205 B — 249 L — #tui-task-viewer
        │   ├── editor.ts — 1,044 B — 28 L — #tui-task-viewer
        │   ├── filters.ts — 1,221 B — 34 L — #tui-task-viewer
        │   ├── interactions.ts — 1,503 B — 30 L — #tui-task-viewer
        │   ├── lifecycle-shortcut.ts — 1,125 B — 24 L — #tui-task-viewer
        │   ├── lifecycle.ts — 1,656 B — 45 L — #tui-task-viewer
        │   ├── navigation.ts — 1,855 B — 54 L — #tui-task-viewer
        │   ├── rendering.ts — 9,730 B — 300 L — #tui-task-viewer
        │   └── session.ts — 3,548 B — 108 L — #tui-task-viewer
        ├── unified/
        │   ├── controller.ts — 18,880 B — 551 L — #tui-unified
        │   └── session.ts — 2,999 B — 91 L — #tui-unified
        ├── utils/
        │   └── strip-tags.ts — 1,647 B — 77 L — #tui-util
        ├── workspace/
        │   ├── model/
        │   │   └── drafts.ts — 2,623 B — 76 L — #workspace-controller
        │   └── state.ts — 480 B — 14 L — #workspace-controller
        ├── code-path.ts — 2,361 B — 82 L — #tui-shell
        ├── footer-content.ts — 4,669 B — 98 L — #tui-shell
        ├── heading.ts — 774 B — 24 L — #tui-shell
        ├── keymap.ts — 5,503 B — 199 L — #tui-shell
        ├── list-removal-adapter.ts — 927 B — 24 L — #tui-shell
        ├── loading.ts — 6,249 B — 227 L — #tui-shell
        ├── overview-content.ts — 3,895 B — 96 L — #tui-shell
        ├── overview-tui.ts — 4,096 B — 178 L — #tui-shell
        ├── project.ts — 242 B — 7 L — #tui-shell
        ├── root-entry.ts — 4,030 B — 78 L — #tui-shell
        ├── status-icon.ts — 2,486 B — 86 L — #tui-shell
        ├── task-filter-wiring.ts — 4,228 B — 125 L — #tui-shell
        ├── task-labels.ts — 653 B — 22 L — #tui-shell
        ├── task-lifecycle.ts — 2,386 B — 55 L — #tui-shell
        ├── task-type.ts — 168 B — 4 L — #tui-shell
        ├── tui.ts — 8,068 B — 225 L — #tui-shell
        └── view-switcher.ts — 8,440 B — 330 L — #tui-shell
```

### Test suites & harness — `tests` (243 files, 2,145,713 B)

```
.
└── src/
    ├── agent-workspace/
    │   ├── live/
    │   │   └── tmux/
    │   │       └── socket.test.ts — 3,038 B — 88 L — #test-suite #test-unit
    │   ├── agent-status.test.ts — 8,732 B — 228 L — #test-suite #test-unit
    │   ├── bootstrap.test.ts — 5,743 B — 144 L — #test-suite #test-unit
    │   ├── config.test.ts — 10,221 B — 272 L — #test-suite #test-unit
    │   ├── session-launch.test.ts — 20,494 B — 497 L — #test-suite #test-unit
    │   ├── session-store.test.ts — 3,169 B — 91 L — #test-suite #test-unit
    │   ├── session-worker-client.test.ts — 1,015 B — 30 L — #test-integration #test-suite
    │   ├── status-hooks.test.ts — 9,717 B — 235 L — #test-suite #test-unit
    │   └── workspace-context.test.ts — 6,655 B — 188 L — #test-suite #test-unit
    ├── commands/
    │   ├── completion.test.ts — 4,028 B — 119 L — #test-suite #test-unit
    │   └── skill.test.ts — 958 B — 28 L — #test-suite #test-unit
    ├── completions/
    │   └── helper.test.ts — 4,420 B — 123 L — #test-suite #test-unit
    ├── file-system/
    │   └── milestones.test.ts — 1,815 B — 47 L — #test-suite #test-unit
    ├── test/
    │   ├── agent-instructions.test.ts — 16,875 B — 374 L — #test-suite #test-unit
    │   ├── agent-selection.test.ts — 2,620 B — 70 L — #test-suite #test-unit
    │   ├── agent-sessions.test.ts — 43,756 B — 962 L — #test-suite #test-unit
    │   ├── agent-workspace-cli.test.ts — 2,149 B — 58 L — #test-integration #test-suite
    │   ├── agent-workspace-model.test.ts — 2,053 B — 52 L — #test-suite #test-unit
    │   ├── atomic-task-create.test.ts — 11,046 B — 312 L — #test-suite #test-unit
    │   ├── atomic-task-edit.test.ts — 12,471 B — 325 L — #test-suite #test-unit
    │   ├── backlog-directory.test.ts — 4,112 B — 92 L — #test-suite #test-unit
    │   ├── board-actions.test.ts — 4,329 B — 124 L — #test-suite #test-unit
    │   ├── board-domain.test.ts — 4,398 B — 120 L — #test-suite #test-unit
    │   ├── board-hide-empty-columns.test.ts — 12,048 B — 356 L — #test-pty #test-suite #test-unit
    │   ├── board-loading.test.ts — 7,153 B — 204 L — #test-suite #test-unit
    │   ├── board-popup-sync.test.ts — 9,883 B — 261 L — #test-suite #test-unit
    │   ├── board-tui-move.test.ts — 21,690 B — 621 L — #test-suite #test-unit
    │   ├── board-tui-multi-move-pty.test.ts — 5,685 B — 166 L — #test-pty #test-suite #test-unit
    │   ├── board-ui.test.ts — 3,158 B — 82 L — #test-suite #test-unit
    │   ├── board-view.test.ts — 2,209 B — 76 L — #test-suite #test-unit
    │   ├── board.test.ts — 13,678 B — 503 L — #test-suite #test-unit
    │   ├── branch-task-loader-resilience.test.ts — 7,229 B — 228 L — #test-suite #test-unit
    │   ├── bun-options.test.ts — 549 B — 15 L — #test-suite #test-unit
    │   ├── cleanup.test.ts — 9,030 B — 302 L — #test-suite #test-unit
    │   ├── cli-agents.test.ts — 2,918 B — 76 L — #test-integration #test-suite
    │   ├── cli-auto-plain-non-tty.test.ts — 2,555 B — 75 L — #test-integration #test-suite
    │   ├── cli-custom-prefix-id-resolution.test.ts — 21,270 B — 532 L — #test-integration #test-suite
    │   ├── cli-dependency-graph.test.ts — 14,093 B — 371 L — #test-integration #test-suite
    │   ├── cli-dependency.test.ts — 9,832 B — 217 L — #test-integration #test-suite
    │   ├── cli-doc-decision-board.test.ts — 18,148 B — 549 L — #test-integration #test-suite
    │   ├── cli-doc-search.test.ts — 5,700 B — 143 L — #test-integration #test-suite
    │   ├── cli-doc-view.test.ts — 1,746 B — 51 L — #test-integration #test-suite
    │   ├── cli-draft-edit.test.ts — 38,974 B — 993 L — #test-integration #test-suite
    │   ├── cli-due-date.test.ts — 3,147 B — 79 L — #test-integration #test-suite
    │   ├── cli-exclude-status-filtering.test.ts — 4,008 B — 126 L — #test-integration #test-suite
    │   ├── cli-guidance.test.ts — 26,926 B — 496 L — #test-integration #test-suite
    │   ├── cli-incrementing-ids.test.ts — 2,837 B — 95 L — #test-integration #test-suite
    │   ├── cli-init-create.test.ts — 24,323 B — 564 L — #test-integration #test-suite
    │   ├── cli-init-cursor-pty.test.ts — 3,167 B — 83 L — #test-integration #test-pty #test-suite
    │   ├── cli-init-input.test.ts — 3,517 B — 95 L — #test-integration #test-suite
    │   ├── cli-init-no-git.test.ts — 6,979 B — 177 L — #test-integration #test-suite
    │   ├── cli-json-output.test.ts — 17,544 B — 490 L — #test-integration #test-suite
    │   ├── cli-json-watch.test.ts — 12,957 B — 364 L — #test-integration #test-suite
    │   ├── cli-launcher.test.ts — 3,393 B — 75 L — #test-integration #test-suite
    │   ├── cli-list-window.test.ts — 12,904 B — 305 L — #test-integration #test-suite
    │   ├── cli-milestone-filter.test.ts — 8,622 B — 240 L — #test-integration #test-suite
    │   ├── cli-milestone-management.test.ts — 10,488 B — 256 L — #test-integration #test-suite
    │   ├── cli-missing-storage-directories.test.ts — 4,328 B — 95 L — #test-integration #test-suite
    │   ├── cli-parent-filter.test.ts — 8,702 B — 262 L — #test-integration #test-suite
    │   ├── cli-parent-shorthand.test.ts — 2,304 B — 64 L — #test-integration #test-suite
    │   ├── cli-pipe-output.test.ts — 3,343 B — 94 L — #test-integration #test-suite
    │   ├── cli-plain-create-edit.test.ts — 3,936 B — 104 L — #test-integration #test-suite
    │   ├── cli-plain-output.test.ts — 8,672 B — 225 L — #test-integration #test-suite
    │   ├── cli-refs-docs.test.ts — 21,017 B — 514 L — #test-integration #test-suite
    │   ├── cli-root-entry.test.ts — 4,071 B — 104 L — #test-integration #test-suite
    │   ├── cli-search-command.test.ts — 4,969 B — 139 L — #test-integration #test-suite
    │   ├── cli-status-filtering.test.ts — 5,225 B — 138 L — #test-integration #test-suite
    │   ├── cli-task-batch-edit.test.ts — 9,504 B — 282 L — #test-integration #test-suite
    │   ├── cli-task-list-ordinal-sort.test.ts — 2,450 B — 67 L — #test-integration #test-suite
    │   ├── cli-task-list.test.ts — 26,028 B — 898 L — #test-integration #test-suite
    │   ├── cli-task-milestone.test.ts — 3,383 B — 87 L — #test-integration #test-suite
    │   ├── cli-task-project.test.ts — 6,718 B — 156 L — #test-integration #test-suite
    │   ├── cli-task-state.test.ts — 11,221 B — 348 L — #test-integration #test-suite
    │   ├── cli-task-type.test.ts — 6,252 B — 142 L — #test-integration #test-suite
    │   ├── cli-task-view-edit.test.ts — 5,903 B — 115 L — #test-integration #test-suite
    │   ├── cli-task-wizard.test.ts — 1,752 B — 42 L — #test-integration #test-suite
    │   ├── cli-zero-padded-ids.test.ts — 3,223 B — 88 L — #test-integration #test-suite
    │   ├── code-path.test.ts — 7,146 B — 204 L — #test-suite #test-unit
    │   ├── config-commands.test.ts — 26,832 B — 602 L — #test-suite #test-unit
    │   ├── config-migration.test.ts — 5,912 B — 184 L — #test-suite #test-unit
    │   ├── config-watcher.test.ts — 26,110 B — 681 L — #test-suite #test-unit
    │   ├── content-identity.test.ts — 11,729 B — 271 L — #test-suite #test-unit
    │   ├── content-store.test.ts — 2,259 B — 54 L — #test-suite #test-unit
    │   ├── core-move-tasks-to-status.test.ts — 17,251 B — 531 L — #test-suite #test-unit
    │   ├── core-task-corpus-regressions.test.ts — 10,764 B — 264 L — #test-regression #test-suite #test-unit
    │   ├── core.test.ts — 47,965 B — 1,324 L — #test-suite #test-unit
    │   ├── date.test.ts — 312 B — 8 L — #test-suite #test-unit
    │   ├── dependency-graph-surfaces.test.tsx — 4,999 B — 109 L — #test-suite #test-unit
    │   ├── dependency-graph.test.ts — 16,110 B — 374 L — #test-suite #test-unit
    │   ├── dependency.test.ts — 23,398 B — 671 L — #test-suite #test-unit
    │   ├── desc-alias.test.ts — 3,139 B — 93 L — #test-suite #test-unit
    │   ├── description-newlines.test.ts — 1,544 B — 32 L — #test-suite #test-unit
    │   ├── docs-recursive.test.ts — 4,479 B — 137 L — #test-suite #test-unit
    │   ├── documentation.test.ts — 2,103 B — 71 L — #test-suite #test-unit
    │   ├── draft-create-consistency.test.ts — 5,313 B — 123 L — #test-suite #test-unit
    │   ├── due-date.test.ts — 7,490 B — 226 L — #test-suite #test-unit
    │   ├── duplicate-detection.test.ts — 4,053 B — 121 L — #test-suite #test-unit
    │   ├── duplicate-task-repair.test.ts — 25,168 B — 583 L — #test-suite #test-unit
    │   ├── editor.test.ts — 6,772 B — 226 L — #test-suite #test-unit
    │   ├── enhanced-init.test.ts — 13,846 B — 394 L — #test-suite #test-unit
    │   ├── entity-id.test.ts — 517 B — 11 L — #test-suite #test-unit
    │   ├── filesystem-task-cache.test.ts — 12,515 B — 331 L — #test-suite #test-unit
    │   ├── filesystem.test.ts — 38,785 B — 1,181 L — #test-suite #test-unit
    │   ├── filter-header-navigation.test.ts — 865 B — 19 L — #test-suite #test-unit
    │   ├── find-backlog-root.test.ts — 6,549 B — 178 L — #test-suite #test-unit
    │   ├── footer-content.test.ts — 3,953 B — 92 L — #test-suite #test-unit
    │   ├── footer-search.test.ts — 5,589 B — 165 L — #test-suite #test-unit
    │   ├── frontmatter-diagnostic-propagation.test.ts — 5,729 B — 158 L — #test-suite #test-unit
    │   ├── generic-list-selection.test.ts — 2,538 B — 85 L — #test-suite #test-unit
    │   ├── git.test.ts — 19,654 B — 593 L — #test-suite #test-unit
    │   ├── heading.test.ts — 952 B — 26 L — #test-suite #test-unit
    │   ├── help-popup.test.ts — 5,713 B — 146 L — #test-suite #test-unit
    │   ├── id-generation.test.ts — 6,278 B — 157 L — #test-suite #test-unit
    │   ├── immutable-project-context.test.ts — 3,787 B — 121 L — #test-suite #test-unit
    │   ├── label-filter.test.ts — 1,983 B — 59 L — #test-suite #test-unit
    │   ├── list-removal-adapter.test.ts — 2,028 B — 56 L — #test-suite #test-unit
    │   ├── list-window.test.ts — 7,239 B — 164 L — #test-suite #test-unit
    │   ├── local-task-command-performance.test.ts — 13,652 B — 372 L — #test-suite #test-unit
    │   ├── malformed-task-dependencies.test.ts — 5,986 B — 151 L — #test-suite #test-unit
    │   ├── markdown.test.ts — 23,115 B — 842 L — #test-suite #test-unit
    │   ├── mcp-client-setup.test.ts — 863 B — 25 L — #test-integration #test-suite
    │   ├── mcp-documents.test.ts — 15,568 B — 437 L — #test-integration #test-suite
    │   ├── mcp-drafts.test.ts — 11,566 B — 350 L — #test-integration #test-suite
    │   ├── mcp-fallback.test.ts — 2,076 B — 57 L — #test-integration #test-suite
    │   ├── mcp-milestones.test.ts — 41,663 B — 1,087 L — #test-integration #test-suite
    │   ├── mcp-refs-docs.test.ts — 5,631 B — 164 L — #test-integration #test-suite
    │   ├── mcp-roots-discovery.test.ts — 9,092 B — 248 L — #test-integration #test-suite
    │   ├── mcp-server.test.ts — 13,407 B — 320 L — #test-integration #test-suite
    │   ├── mcp-stdio-exit.test.ts — 7,222 B — 234 L — #test-integration #test-suite
    │   ├── mcp-task-complete.test.ts — 4,385 B — 129 L — #test-integration #test-suite
    │   ├── mcp-task-project-filtering.test.ts — 5,392 B — 131 L — #test-integration #test-suite
    │   ├── mcp-task-type-filtering.test.ts — 5,322 B — 131 L — #test-integration #test-suite
    │   ├── mcp-tasks-local-filter.test.ts — 3,113 B — 98 L — #test-integration #test-suite
    │   ├── mcp-tasks.test.ts — 56,274 B — 1,699 L — #test-integration #test-suite
    │   ├── mcp-workspace-root.test.ts — 10,065 B — 266 L — #test-integration #test-suite
    │   ├── milestone-filter.test.ts — 9,566 B — 225 L — #test-suite #test-unit
    │   ├── no-remote-preflight.test.ts — 2,788 B — 85 L — #test-suite #test-unit
    │   ├── offline-integration.test.ts — 5,346 B — 160 L — #test-integration #test-suite
    │   ├── offline-mode.test.ts — 4,151 B — 142 L — #test-integration #test-suite
    │   ├── opentui-agent-host-cleanup.test.ts — 10,992 B — 280 L — #test-suite #test-unit
    │   ├── opentui-agent-settings.test.ts — 22,939 B — 619 L — #test-suite #test-unit
    │   ├── opentui-existing-agent-host.test.ts — 2,782 B — 71 L — #test-suite #test-unit
    │   ├── opentui-filters.test.ts — 19,509 B — 507 L — #test-suite #test-unit
    │   ├── opentui-keybindings.test.ts — 8,952 B — 187 L — #test-suite #test-unit
    │   ├── opentui-navigation-history.test.ts — 3,786 B — 90 L — #test-suite #test-unit
    │   ├── opentui-session-picker.test.ts — 3,563 B — 114 L — #test-suite #test-unit
    │   ├── opentui-status-tabs.test.ts — 9,028 B — 252 L — #test-suite #test-unit
    │   ├── opentui-surfaces.test.ts — 6,310 B — 180 L — #test-suite #test-unit
    │   ├── opentui-workspace-agent.test.ts — 6,950 B — 185 L — #test-suite #test-unit
    │   ├── opentui-workspace-controller.test.ts — 66,168 B — 1,804 L — #test-suite #test-unit
    │   ├── opentui-workspace-layout.test.ts — 32,932 B — 844 L — #test-suite #test-unit
    │   ├── packaging-bin.test.ts — 412 B — 11 L — #test-suite #test-unit
    │   ├── parent-id-normalization.test.ts — 3,586 B — 97 L — #test-suite #test-unit
    │   ├── pin-timezone.ts — 629 B — 19 L — #test-helper #test-suite
    │   ├── popup-chrome.test.ts — 1,888 B — 51 L — #test-suite #test-unit
    │   ├── prefix-config.test.ts — 14,457 B — 439 L — #test-suite #test-unit
    │   ├── prefix-migration.test.ts — 9,034 B — 293 L — #test-suite #test-unit
    │   ├── priority.test.ts — 4,112 B — 155 L — #test-suite #test-unit
    │   ├── project-task-graph.test.ts — 5,097 B — 143 L — #test-suite #test-unit
    │   ├── readiness-surface-agreement.test.ts — 10,309 B — 264 L — #test-suite #test-unit
    │   ├── readme-board.test.ts — 3,801 B — 103 L — #test-suite #test-unit
    │   ├── references.test.ts — 3,648 B — 119 L — #test-suite #test-unit
    │   ├── remote-id-conflict.test.ts — 2,071 B — 64 L — #test-suite #test-unit
    │   ├── reorder-utils.test.ts — 9,088 B — 286 L — #test-suite #test-unit
    │   ├── resolveBinary.test.ts — 5,362 B — 144 L — #test-suite #test-unit
    │   ├── runtime-cwd.test.ts — 6,608 B — 175 L — #test-suite #test-unit
    │   ├── search-service.test.ts — 3,327 B — 98 L — #test-suite #test-unit
    │   ├── shared-branch-task-loader.test.ts — 3,300 B — 104 L — #test-suite #test-unit
    │   ├── start-id.test.ts — 1,093 B — 32 L — #test-suite #test-unit
    │   ├── statistics.test.ts — 8,579 B — 265 L — #test-suite #test-unit
    │   ├── status-callback.test.ts — 8,661 B — 296 L — #test-suite #test-unit
    │   ├── status-filter.test.ts — 1,480 B — 42 L — #test-suite #test-unit
    │   ├── status-icon.test.ts — 2,127 B — 63 L — #test-suite #test-unit
    │   ├── strip-tags.test.ts — 2,378 B — 62 L — #test-suite #test-unit
    │   ├── subtask-ordering-consistency.test.ts — 4,636 B — 106 L — #test-suite #test-unit
    │   ├── subtask-progress.test.ts — 3,956 B — 108 L — #test-suite #test-unit
    │   ├── symlink-backlog-root.test.ts — 4,658 B — 123 L — #test-suite #test-unit
    │   ├── task-edit-preservation.test.ts — 8,815 B — 278 L — #test-suite #test-unit
    │   ├── task-filter-wiring.test.ts — 5,141 B — 162 L — #test-suite #test-unit
    │   ├── task-frontmatter-storage.test.ts — 6,610 B — 181 L — #test-suite #test-unit
    │   ├── task-id-resolution.test.ts — 3,227 B — 78 L — #test-suite #test-unit
    │   ├── task-identity-index.test.ts — 3,867 B — 134 L — #test-suite #test-unit
    │   ├── task-mutation-service.test.ts — 784 B — 22 L — #test-suite #test-unit
    │   ├── task-opaque-body-integration.test.ts — 1,824 B — 50 L — #test-integration #test-suite
    │   ├── task-path.test.ts — 13,212 B — 331 L — #test-suite #test-unit
    │   ├── task-project-filtering.test.ts — 7,743 B — 197 L — #test-suite #test-unit
    │   ├── task-project.test.ts — 6,222 B — 165 L — #test-suite #test-unit
    │   ├── task-search-label-filter.test.ts — 1,983 B — 68 L — #test-suite #test-unit
    │   ├── task-search-parity.test.ts — 13,945 B — 346 L — #test-suite #test-unit
    │   ├── task-sorting.test.ts — 10,154 B — 312 L — #test-suite #test-unit
    │   ├── task-type-config.test.ts — 816 B — 18 L — #test-suite #test-unit
    │   ├── task-type-filtering.test.ts — 8,618 B — 242 L — #test-suite #test-unit
    │   ├── task-type.test.ts — 4,868 B — 132 L — #test-suite #test-unit
    │   ├── task-updated-date.test.ts — 1,723 B — 63 L — #test-suite #test-unit
    │   ├── task-viewer-boundary-navigation.test.ts — 3,618 B — 83 L — #test-suite #test-unit
    │   ├── task-viewer-filter-model.test.ts — 2,253 B — 73 L — #test-suite #test-unit
    │   ├── task-viewer-milestone-filter-model.test.ts — 1,634 B — 34 L — #test-suite #test-unit
    │   ├── task-watcher.test.ts — 14,420 B — 407 L — #test-suite #test-unit
    │   ├── task-wizard.test.ts — 14,998 B — 464 L — #test-suite #test-unit
    │   ├── terminal-status.test.ts — 922 B — 19 L — #test-suite #test-unit
    │   ├── test-cli.ts — 1,304 B — 37 L — #test-helper #test-integration #test-suite
    │   ├── test-preload.ts — 348 B — 6 L — #test-helper #test-suite
    │   ├── test-utils.test.ts — 1,154 B — 31 L — #test-helper #test-suite
    │   ├── test-utils.ts — 13,382 B — 383 L — #test-helper #test-suite
    │   ├── tmux-pane-lookup.test.ts — 840 B — 21 L — #test-suite #test-unit
    │   ├── tmux-test-server.ts — 3,414 B — 73 L — #test-helper #test-integration #test-suite
    │   ├── tui-documentation.test.ts — 1,579 B — 52 L — #test-suite #test-unit
    │   ├── tui-draft-edit.test.ts — 14,562 B — 448 L — #test-suite #test-unit
    │   ├── tui-edit-session.test.ts — 4,166 B — 141 L — #test-suite #test-unit
    │   ├── tui-emoji-width.test.ts — 1,569 B — 37 L — #test-suite #test-unit
    │   ├── tui-input-lifecycle.test.ts — 1,379 B — 59 L — #test-suite #test-unit
    │   ├── tui-interactive-editor-handoff.test.ts — 13,504 B — 431 L — #test-suite #test-unit
    │   ├── tui-ready-filter-pty.test.ts — 4,477 B — 138 L — #test-pty #test-suite #test-unit
    │   ├── tui-runtime-cwd.test.ts — 3,981 B — 95 L — #test-suite #test-unit
    │   ├── tui-screenshot-compare-script.test.ts — 446 B — 14 L — #test-suite #test-unit
    │   ├── tui-startup-warning.test.ts — 1,018 B — 23 L — #test-suite #test-unit
    │   ├── tui-task-composer.test.ts — 98,416 B — 2,302 L — #test-suite #test-unit
    │   ├── tui-task-lifecycle.test.ts — 3,366 B — 96 L — #test-suite #test-unit
    │   ├── tui-task-project.test.ts — 3,271 B — 83 L — #test-suite #test-unit
    │   ├── tui-task-type.test.ts — 2,603 B — 72 L — #test-suite #test-unit
    │   ├── tui-vim-boundary-navigation.test.ts — 12,591 B — 333 L — #test-suite #test-unit
    │   ├── tui-window-title.test.ts — 7,167 B — 175 L — #test-suite #test-unit
    │   ├── ui-keymap.test.ts — 2,472 B — 76 L — #test-suite #test-unit
    │   ├── ui-state-owners.test.ts — 3,622 B — 121 L — #test-suite #test-unit
    │   ├── unicode-rendering.test.ts — 548 B — 18 L — #test-suite #test-unit
    │   ├── unified-view-filters.test.ts — 15,826 B — 626 L — #test-suite #test-unit
    │   ├── unified-view-loading.test.ts — 6,862 B — 213 L — #test-suite #test-unit
    │   ├── update-task-description.test.ts — 777 B — 23 L — #test-suite #test-unit
    │   ├── utc-date-display.test.ts — 4,574 B — 93 L — #test-suite #test-unit
    │   ├── vacated-task-references.test.ts — 26,482 B — 604 L — #test-suite #test-unit
    │   ├── view-state-store.test.ts — 16,549 B — 438 L — #test-suite #test-unit
    │   ├── view-switcher.test.ts — 3,962 B — 165 L — #test-suite #test-unit
    │   ├── watch-json.test.ts — 7,572 B — 229 L — #test-suite #test-unit
    │   ├── worktree-refresh.test.ts — 3,748 B — 116 L — #test-suite #test-unit
    │   └── worktree-task-id-allocation.test.ts — 5,507 B — 143 L — #test-suite #test-unit
    └── utils/
        └── read-output-mode.test.ts — 816 B — 23 L — #test-suite #test-unit
```

### Docs, guidance & repo meta text — `docs-guidance` (39 files, 501,543 B)

```
.
├── docs/
│   ├── BACK-728-handoff.md — 21,129 B — 458 L — #doc-spec
│   ├── agent-session-ownership-plan.md — 18,528 B — 149 L — #doc-spec
│   ├── aoe-agent-workspace-reference.md — 40,575 B — 690 L — #doc-spec
│   ├── aoe-lifecycle-comparison.md — 20,553 B — 94 L — #doc-spec
│   ├── aoe-lifecycle-implementation-plan.md — 58,041 B — 432 L — #doc-spec
│   ├── aoe-status-tracking-plan.md — 50,166 B — 495 L — #doc-spec
│   ├── disk-growth-investigation.md — 5,126 B — 93 L — #doc-spec
│   ├── opentui-workspace-behavior-matrix.md — 29,211 B — 135 L — #doc-spec
│   ├── opentui-workspace-implementation-plan.md — 21,627 B — 312 L — #doc-spec
│   ├── opentui-workspace-session-contract.md — 30,002 B — 245 L — #doc-spec
│   ├── opentui-workspace-spec.md — 21,134 B — 324 L — #doc-spec
│   ├── test-suite-runtime-report.md — 12,021 B — 204 L — #doc-spec
│   ├── tmux-call-sites.md — 23,904 B — 371 L — #doc-spec
│   └── tmux-layer-spec.md — 27,741 B — 475 L — #doc-spec
├── src/
│   └── guidelines/
│       ├── cli-instructions/
│       │   ├── agent-workspace.md — 8,119 B — 26 L — #guidance-doc
│       │   ├── index.ts — 788 B — 13 L — #guidance-doc #guidance-ts
│       │   ├── init-required.md — 428 B — 29 L — #guidance-doc
│       │   ├── overview.md — 3,053 B — 58 L — #guidance-doc
│       │   ├── task-creation.md — 6,398 B — 131 L — #guidance-doc
│       │   ├── task-execution.md — 4,566 B — 83 L — #guidance-doc
│       │   └── task-finalization.md — 1,879 B — 20 L — #guidance-doc
│       ├── mcp/
│       │   ├── agent-nudge.md — 1,169 B — 25 L — #guidance-doc
│       │   ├── index.ts — 805 B — 13 L — #guidance-doc #guidance-ts
│       │   ├── init-required.md — 751 B — 24 L — #guidance-doc
│       │   ├── overview-tools.md — 3,327 B — 43 L — #guidance-doc
│       │   ├── overview.md — 3,797 B — 44 L — #guidance-doc
│       │   ├── task-creation.md — 9,678 B — 135 L — #guidance-doc
│       │   ├── task-execution.md — 6,601 B — 78 L — #guidance-doc
│       │   └── task-finalization.md — 1,752 B — 20 L — #guidance-doc
│       ├── cli-agent-nudge.md — 643 B — 7 L — #guidance-doc
│       └── index.ts — 491 B — 8 L — #guidance-doc #guidance-ts
├── ADVANCED-CONFIG.md — 8,465 B — 74 L — #doc-repo
├── AGENTS.md — 1,613 B — 44 L — #doc-repo
├── CLAUDE.md — 9 B — symlink → `AGENTS.md` — #agent-instruction #symlink
├── CLI-INSTRUCTIONS.md — 30,285 B — 410 L — #doc-repo
├── CONTRIBUTING.md — 898 B — 19 L — #doc-repo
├── DEVELOPMENT.md — 7,967 B — 235 L — #doc-repo
├── LICENSE — 1,067 B — 21 L — #doc-repo
└── README.md — 17,236 B — 377 L — #doc-repo
```

### Backlog workspace data — `backlog-data` (1 files, 576 B)

```
.
└── backlog/
    └── config.yml — 576 B — 18 L — #backlog-config
```

### Tooling, build, config & environment — `tooling-config` (72 files, 14,146,810 B)

```
.
├── .codex/
│   └── .gitignore — 10 B — 1 L — #agent-editor-config
├── .fallow/
│   ├── .gitignore — 2 B — 1 L — #tool-cache
│   ├── cache.bin — 6,911,777 B — binary — #tool-cache
│   ├── churn.bin — 271,843 B — binary — #tool-cache
│   └── graph-cache.bin — 1,121,227 B — binary — #tool-cache
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md — 497 B — 25 L — #repo-meta
│   │   └── feature_request.md — 429 B — 15 L — #repo-meta
│   ├── workflows/
│   │   ├── ci.yml — 6,736 B — 171 L — #ci-workflow
│   │   └── release.yml — 19,259 B — 527 L — #ci-workflow
│   ├── 5-minute-tour-256.png — 22,031 B — binary — #asset-image #repo-meta
│   ├── PULL_REQUEST_TEMPLATE.md — 1,019 B — 21 L — #repo-meta
│   ├── backlog-logo.png — 167,239 B — binary — #asset-image #repo-meta
│   ├── backlog-v1.40.gif — 2,632,070 B — binary — #asset-image #repo-meta
│   ├── backlog.jpg — 210,181 B — binary — #asset-image #repo-meta
│   ├── backlog.mp4 — 753,506 B — binary — #asset-video #repo-meta
│   ├── cli-reference-256.png — 17,829 B — binary — #asset-image #repo-meta
│   ├── configuration-256.png — 23,875 B — binary — #asset-image #repo-meta
│   ├── copilot-instructions.md — 1,790 B — 50 L — #repo-meta
│   ├── favicon.png — 1,405,793 B — binary — #asset-image #repo-meta
│   ├── sharing-export-256.png — 15,912 B — binary — #asset-image #repo-meta
│   ├── video-presentation.md — 83 B — 4 L — #repo-meta
│   ├── web-interface-256.png — 25,232 B — binary — #asset-image #repo-meta
│   └── web.jpeg — 119,265 B — binary — #asset-image #repo-meta
├── .husky/
│   ├── _/
│   │   ├── .gitignore — 1 B — 0 L — #git-hook
│   │   ├── applypatch-msg — 39 B — 1 L — #git-hook
│   │   ├── commit-msg — 39 B — 1 L — #git-hook
│   │   ├── h — 551 B — 22 L — #git-hook
│   │   ├── husky.sh — 160 B — 8 L — #git-hook
│   │   ├── post-applypatch — 39 B — 1 L — #git-hook
│   │   ├── post-checkout — 39 B — 1 L — #git-hook
│   │   ├── post-commit — 39 B — 1 L — #git-hook
│   │   ├── post-merge — 39 B — 1 L — #git-hook
│   │   ├── post-rewrite — 39 B — 1 L — #git-hook
│   │   ├── pre-applypatch — 39 B — 1 L — #git-hook
│   │   ├── pre-auto-gc — 39 B — 1 L — #git-hook
│   │   ├── pre-commit — 39 B — 1 L — #git-hook
│   │   ├── pre-merge-commit — 39 B — 1 L — #git-hook
│   │   ├── pre-push — 39 B — 1 L — #git-hook
│   │   ├── pre-rebase — 39 B — 1 L — #git-hook
│   │   └── prepare-commit-msg — 39 B — 1 L — #git-hook
│   └── pre-commit — 119 B — 5 L — #git-hook
├── .omp/
│   └── extensions/
│       └── rtk.ts — 4,835 B — 137 L — #agent-editor-config
├── .pi/
│   └── subagentura-state.json — 190 B — 9 L — #agent-editor-config
├── .serena/
│   ├── cache/
│   │   └── typescript/
│   │       ├── document_symbols.pkl — 78,765 B — binary — #agent-editor-config
│   │       └── raw_document_symbols.pkl — 22,846 B — binary — #agent-editor-config
│   ├── .gitignore — 26 B — 2 L — #agent-editor-config
│   ├── project.local.yml — 402 B — 5 L — #agent-editor-config
│   └── project.yml — 9,788 B — 169 L — #agent-editor-config
├── .vscode/
│   └── launch.json — 415 B — 17 L — #agent-editor-config
├── scripts/
│   ├── benchmark-task-loading.ts — 24,285 B — 726 L — #build-script
│   ├── build.ts — 1,068 B — 43 L — #build-script
│   ├── cli.cjs — 4,227 B — 116 L — #build-script
│   ├── postuninstall.cjs — 989 B — 37 L — #build-script
│   ├── resolveBinary.cjs — 1,997 B — 57 L — #build-script
│   ├── run-tui-interactive-tests.sh — 446 B — 15 L — #build-script
│   ├── smoke-compiled-build.ts — 7,514 B — 237 L — #build-script
│   └── smoke-parallel-task-locking.sh — 9,445 B — 356 L — #build-script
├── tools/
│   └── tui-screenshot-compare.sh — 17,070 B — 467 L — #dev-tool
├── .envrc — 261 B — 5 L — #nix
├── .fallowrc.jsonc — 829 B — 30 L — #config
├── .gitattributes — 66 B — 2 L — #config
├── .gitignore — 1,357 B — 84 L — #config
├── .npmignore — 399 B — 32 L — #config
├── biome.json — 1,148 B — 58 L — #config
├── bun.lock — 65,397 B — 647 L — #lockfile
├── bun.nix — 138,492 B — 2,356 L — #nix
├── bunfig.toml — 268 B — 8 L — #config
├── flake.lock — 3,625 B — 143 L — #nix
├── flake.nix — 5,601 B — 166 L — #nix
├── package.json — 2,344 B — 93 L — #config
└── tsconfig.json — 742 B — 28 L — #config
```

## 4. Summary table

| # | Purpose group | Group key | Files | Total bytes | Share of repo |
|---|---|---|---:|---:|---:|
| 1 | Entry & CLI surface | `entry-cli` | 54 | 365,891 | 1.93% |
| 2 | Task domain, core & shared utilities | `task-domain` | 101 | 532,887 | 2.82% |
| 3 | Persistence, markdown, filesystem & git | `persistence` | 14 | 168,984 | 0.89% |
| 4 | Transports (MCP) | `transports` | 27 | 114,163 | 0.60% |
| 5 | Agent workspace & sessions | `agent-workspace` | 27 | 234,499 | 1.24% |
| 6 | Terminal UI (TUI / OpenTUI) | `ui-tui` | 79 | 619,734 | 3.28% |
| 7 | Test suites & harness | `tests` | 262 | 2,196,024 | 11.61% |
| 8 | Docs, guidance & repo meta text | `docs-guidance` | 40 | 538,617 | 2.85% |
| 9 | Backlog workspace data | `backlog-data` | 1 | 576 | 0.00% |
| 10 | Tooling, build, config & environment | `tooling-config` | 72 | 14,146,810 | 74.78% |
| - | **Total** | - | **677** | **18,918,185** | **100.00%** |

Shares are computed against the tree total above. Sizes are measured per file with `stat`; see `docs/disk-growth-investigation.md` for why `du` and `df` disagree about trees full of APFS clones.
