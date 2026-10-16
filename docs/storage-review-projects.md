---
consolidation:
  total: 94
  counts:
    exists: 0
    discard: 84
    integrate: 0
    unconfirmed: 10
  percentages:
    exists: 0.00%
    discard: 89.36%
    integrate: 0.00%
    unconfirmed: 10.64%
---
# Projects storage map
> **Non-authoritative supporting material.** This file is not a contract. Authoritative owner(s): [docs/PRODUCT.md](PRODUCT.md), [docs/CONVENTIONS.md](CONVENTIONS.md).
> Disposition: Mixed — see markers.

Scope: `/Users/imribarr/Projects` only. Metadata snapshot: **2026-10-13 11:34:53 IDT**. Read-only scan completed in **20.6 seconds**, within a 210-second traversal deadline. No source, logs, configuration, Git pointers, or other file contents were read. Only this report was written. <!-- consolidation: discard; ref: none; reason: Historical host audit scope and method. -->

## Summary

- **16.777 GiB allocated** (18,014,474,240 bytes), matching the previous approximately 16.78 GiB estimate. <!-- consolidation: discard; ref: none; reason: Historical host allocation. -->
- **61 immediate children: 58 directories and 3 files**; recursively counted **582,813 non-symlink files and 80,335 directories**, including immediate directory roots. <!-- consolidation: discard; ref: none; reason: Historical host inventory. -->
- Approximate split: **4.944 GiB source/assets/user data/unclassified (29.47%)**, **10.714 GiB conventional dependencies/builds/caches (63.86%)**, **1.119 GiB Git metadata/history (6.67%)**. <!-- consolidation: discard; ref: none; reason: Historical host classification totals. -->
- Largest five: `ruflo` **2.438 GiB**, `summarizer` **2.152 GiB**, `Lumi` **2.101 GiB**, `Backlog.md` **1.495 GiB**, `media-server` **1.170 GiB**. <!-- consolidation: discard; ref: none; reason: Historical host ranking. -->
- **No traversal errors; no mount boundaries encountered.** Skipped 5,530 symlinks without following their targets. <!-- consolidation: discard; ref: none; reason: Historical scan coverage. -->

## Measurement and interpretation

Allocated size is `lstat().st_blocks × 512`, including directory blocks. Hard-linked inodes are counted once across the scan; shared inodes, if any, are assigned to the first encountered child. Symlinks are excluded; filesystem-device boundaries are not crossed. This is allocated usage, not logical file length or guaranteed reclaimable physical space: APFS clones, compression, and snapshots can affect reclamation. Sizes may change after the snapshot. <!-- consolidation: discard; ref: none; reason: Historical accounting method and limitations. -->

Independent validation used `du -skxP` on the aggregate and largest five children. Results were **17,592,260 KiB total**, and respectively **2,556,296**, **2,256,812**, **2,203,320**, **1,567,492**, **1,226,548 KiB** for `ruflo`, `summarizer`, `Lumi`, `Backlog.md`, and `media-server`. Each exactly matched the metadata scan; aggregate difference: **0 bytes**. <!-- consolidation: discard; ref: none; reason: Historical validation evidence. -->

Classification is based solely on directory names, not contents or rebuildability. Generated candidates include `node_modules`, `.venv`, `venv`, `env`, `.env`, `dist`, `build`, `.next`, `.nuxt`, `.cache`, Python cache directories, `.turbo`, `.parcel-cache`, `coverage`, `target`, `.svelte-kit`, `.output`, `.vite`, and `.gradle`. <!-- consolidation: discard; ref: none; reason: Historical name-based classification method. --> Consequently, the generated share is **approximate, not a deletion recommendation**; a folder with a conventional name can still contain valuable work. <!-- consolidation: unconfirmed; ref: none; reason: Generated-name safety and rebuildability remain unresolved. --> `.git` and everything beneath it are a separate protected category, including nested repositories and small Git-pointer files. **Git history is not disposable.** <!-- consolidation: unconfirmed; ref: none; reason: Host Git-history preservation gate awaits owner disposition. -->

The source/data column is the conservative remainder: it also includes unknown tooling data, logs, checkpoints, binaries, and state. In particular `.gitnexus`, `.pio-core`, and `.backlog` were not assumed disposable or counted as generated. Access times were not used to infer disuse. <!-- consolidation: discard; ref: none; reason: Historical classification and inference limits. -->

## All immediate children, ranked

All size columns are **MiB** (1,048,576 bytes), rounded to three decimals. Files counts exclude symlinks. <!-- consolidation: discard; ref: none; reason: Report-local measurement legend. --> `†` means **preserve**: a Git-pointer file was found somewhere underneath, or the directory name suggests agent/worktree use. A Git-pointer file can also indicate a submodule; this is a conservative preservation marker, not a claim of verified worktree status. Uncommitted work was not inspected. Unmarked directories are not declared safe to remove. <!-- consolidation: unconfirmed; ref: none; reason: Worktree identity, uncommitted work and removal permission remain unresolved. -->

| Immediate child | Allocated MiB | Source/data/unknown | Dependencies/build/cache | Git history/metadata | Files |
|---|---:|---:|---:|---:|---:|
| `ruflo` | 2,496.383 | 447.027 | 1,551.484 | 497.871 | 69,905 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `summarizer` | 2,203.918 | 2,203.895 | 0.023 | 0.000 | 14 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `Lumi` † | 2,151.680 | 152.434 | 1,834.152 | 165.094 | 56,923 <!-- consolidation: discard; ref: none; reason: Historical inventory, preservation gate retained in legend. --> |
| `Backlog.md` | 1,530.754 | 617.809 | 815.117 | 97.828 | 38,800 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `media-server` | 1,197.801 | 17.238 | 1,179.746 | 0.816 | 67,587 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `gemini` | 1,049.617 | 50.414 | 897.117 | 102.086 | 46,392 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `gemini-ui-component-system` † | 606.484 | 38.602 | 567.879 | 0.004 | 37,206 <!-- consolidation: discard; ref: none; reason: Historical inventory, preservation gate retained in legend. --> |
| `Contributions` | 549.988 | 464.730 | 0.008 | 85.250 | 2,719 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `ForgeLabs` | 414.230 | 115.762 | 248.523 | 49.945 | 22,592 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `x8` | 375.750 | 288.020 | 1.539 | 86.191 | 8,026 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `gemini-standalone-scripts` † | 371.844 | 25.148 | 346.691 | 0.004 | 14,492 <!-- consolidation: discard; ref: none; reason: Historical inventory, preservation gate retained in legend. --> |
| `wshobson-agents-omp` † | 367.770 | 54.258 | 310.645 | 2.867 | 8,518 <!-- consolidation: discard; ref: none; reason: Historical inventory, preservation gate retained in legend. --> |
| `remotion` | 359.629 | 0.172 | 359.457 | 0.000 | 15,191 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `typetest` | 346.402 | 1.301 | 344.574 | 0.527 | 39,753 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `gemini-space-data-simplification` † | 314.230 | 21.020 | 293.207 | 0.004 | 16,841 <!-- consolidation: discard; ref: none; reason: Historical inventory, preservation gate retained in legend. --> |
| `gemini-authenticated-e2e` † | 313.383 | 21.594 | 291.785 | 0.004 | 16,781 <!-- consolidation: discard; ref: none; reason: Historical inventory, preservation gate retained in legend. --> |
| `gemini-capture-prod-screenshots` † | 309.547 | 20.594 | 288.949 | 0.004 | 16,701 <!-- consolidation: discard; ref: none; reason: Historical inventory, preservation gate retained in legend. --> |
| `gemini-category-edit-ux` † | 303.785 | 19.000 | 284.781 | 0.004 | 13,795 <!-- consolidation: discard; ref: none; reason: Historical inventory, preservation gate retained in legend. --> |
| `gemini-landing-demo` † | 263.934 | 18.902 | 245.027 | 0.004 | 11,209 <!-- consolidation: discard; ref: none; reason: Historical inventory, preservation gate retained in legend. --> |
| `gemini-keychain-secrets` † | 251.297 | 18.852 | 232.441 | 0.004 | 10,321 <!-- consolidation: discard; ref: none; reason: Historical inventory, preservation gate retained in legend. --> |
| `DhcpProxyServer` | 229.902 | 0.152 | 229.750 | 0.000 | 8,062 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `esp32-rainmaker-backup` | 207.238 | 27.695 | 167.762 | 11.781 | 1,848 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `launch-box` | 185.082 | 0.668 | 184.414 | 0.000 | 18,047 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `Router` | 113.949 | 102.664 | 0.000 | 11.285 | 5,973 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `sample-extension` | 91.949 | 0.262 | 91.688 | 0.000 | 8,953 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `ink-agent-workspace-prototype` † | 81.539 | 0.465 | 81.074 | 0.000 | 6,115 <!-- consolidation: discard; ref: none; reason: Historical inventory, preservation gate retained in legend. --> |
| `gemini-mobile-category-grid` † | 55.328 | 25.129 | 30.195 | 0.004 | 1,304 <!-- consolidation: discard; ref: none; reason: Historical inventory, preservation gate retained in legend. --> |
| `task-account-imri-barr` | 53.703 | 39.234 | 0.086 | 14.383 | 2,591 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `nasm` | 49.238 | 37.215 | 0.000 | 12.023 | 1,484 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `ink-pty-spike` | 49.020 | 0.703 | 48.316 | 0.000 | 5,163 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `gemini-sintro-usb` † | 42.703 | 31.379 | 11.320 | 0.004 | 1,990 <!-- consolidation: discard; ref: none; reason: Historical inventory, preservation gate retained in legend. --> |
| `gemini-actions-root-cleanup` † | 25.477 | 20.430 | 5.043 | 0.004 | 718 <!-- consolidation: discard; ref: none; reason: Historical inventory, preservation gate retained in legend. --> |
| `gemini-clarify-local-preview` † | 23.867 | 20.988 | 2.875 | 0.004 | 679 <!-- consolidation: discard; ref: none; reason: Historical inventory, preservation gate retained in legend. --> |
| `gemini-remove-sqlite-refs` † | 21.785 | 18.340 | 3.441 | 0.004 | 471 <!-- consolidation: discard; ref: none; reason: Historical inventory, preservation gate retained in legend. --> |
| `gemini-queue-observability` † | 21.727 | 20.582 | 1.141 | 0.004 | 701 <!-- consolidation: discard; ref: none; reason: Historical inventory, preservation gate retained in legend. --> |
| `gemini-fix-ga-env-404` † | 21.402 | 19.121 | 2.277 | 0.004 | 615 <!-- consolidation: discard; ref: none; reason: Historical inventory, preservation gate retained in legend. --> |
| `gemini-card-space-colors` † | 21.398 | 19.117 | 2.277 | 0.004 | 614 <!-- consolidation: discard; ref: none; reason: Historical inventory, preservation gate retained in legend. --> |
| `gemini-worktrees` † | 21.148 | 19.000 | 2.145 | 0.004 | 441 <!-- consolidation: discard; ref: none; reason: Historical inventory, preservation gate retained in legend. --> |
| `gemini-fix-e2e-vite-config` † | 21.055 | 21.043 | 0.008 | 0.004 | 615 <!-- consolidation: discard; ref: none; reason: Historical inventory, preservation gate retained in legend. --> |
| `gemini-security-p0-fixes` † | 19.988 | 18.746 | 1.238 | 0.004 | 588 <!-- consolidation: discard; ref: none; reason: Historical inventory, preservation gate retained in legend. --> |
| `gemini-bookmark-filter-toggle` † | 19.109 | 19.098 | 0.008 | 0.004 | 547 <!-- consolidation: discard; ref: none; reason: Historical inventory, preservation gate retained in legend. --> |
| `agent-view` † | 11.000 | 3.789 | 0.000 | 7.211 | 209 <!-- consolidation: discard; ref: none; reason: Historical inventory, preservation gate retained in legend. --> |
| `serial-port-forwarder` | 9.320 | 0.008 | 9.312 | 0.000 | 610 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `tmp` | 3.484 | 0.039 | 3.445 | 0.000 | 521 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `echo-pilot` | 0.617 | 0.102 | 0.391 | 0.125 | 92 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `pi-package-manager` | 0.219 | 0.062 | 0.000 | 0.156 | 45 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `agent-orchestrator` † | 0.062 | 0.062 | 0.000 | 0.000 | 12 <!-- consolidation: discard; ref: none; reason: Historical inventory, preservation gate retained in legend. --> |
| `paca` | 0.043 | 0.035 | 0.008 | 0.000 | 3 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `opencode` | 0.039 | 0.039 | 0.000 | 0.000 | 13 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `maccabi-mcp` | 0.031 | 0.027 | 0.004 | 0.000 | 7 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `docker-images` | 0.023 | 0.020 | 0.004 | 0.000 | 6 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `8bit-computer` | 0.020 | 0.020 | 0.000 | 0.000 | 3 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `Backlog.md-handoff.md` (file) | 0.016 | 0.016 | 0.000 | 0.000 | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `.DS_Store` (file) | 0.012 | 0.012 | 0.000 | 0.000 | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `test_sed` | 0.012 | 0.012 | 0.000 | 0.000 | 3 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `CMakeLists.txt` (file) | 0.004 | 0.004 | 0.000 | 0.000 | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `gemini-dashboard-restyle` | 0.004 | 0.004 | 0.000 | 0.000 | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `better-prompt-viewer` | 0.000 | 0.000 | 0.000 | 0.000 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `gemini-ga-event-detail` | 0.000 | 0.000 | 0.000 | 0.000 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `my-game` | 0.000 | 0.000 | 0.000 | 0.000 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `webserver` | 0.000 | 0.000 | 0.000 | 0.000 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |

## Heavy subfolders in the largest ten children

Sizes below are allocated MiB, rounded approximately. Paths are relative to the named immediate child. Nested folders can contain a mix of the three categories; category estimates above traverse their descendants. <!-- consolidation: discard; ref: none; reason: Report-local measurement interpretation. -->

| Parent | Largest immediate subfolders | Interpretation |
|---|---|---|
| `ruflo` | `v3` **1,586.0**; `.git` **497.9**; `.gitnexus` **247.4**; `v2` **145.7**; `ruflo` **9.7** | `v3` is overwhelmingly conventional generated storage: about **1,551.4 MiB**. <!-- consolidation: discard; ref: none; reason: Historical host breakdown. --> `.gitnexus` and `v2` remain unclassified/source/data; Git history stays protected. <!-- consolidation: unconfirmed; ref: none; reason: Unknown state and Git preservation gate awaits owner review. --> |
| `summarizer` | `checkpoints` **2,203.1**; `data` **0.789**; `__pycache__` **0.023** | Checkpoints account for almost the entire folder and are retained as assets/user data. These are its three immediate subdirectories. <!-- consolidation: unconfirmed; ref: none; reason: Checkpoint preservation disposition remains owner-specific, sizes are historical. --> |
| `Lumi` † | `flutter_app` **650.5**; `esp32-rainmaker` **363.5**; `webserver` **315.8**; `esp32-idf` **225.1**; `esp32-idf2` **184.3** | Generated estimates within these: about **583.3**, **360.4**, **314.9**, **224.9**, **184.2 MiB** respectively. <!-- consolidation: discard; ref: none; reason: Historical host breakdown. --> Nested Git-pointer files mean preserve potential worktrees/submodules. <!-- consolidation: unconfirmed; ref: none; reason: Worktree and submodule preservation gate unresolved. --> |
| `Backlog.md` | `node_modules` **682.2**; `.backlog` **593.0**; `.git` **97.8**; `dist` **71.7**; `.opencode` **61.3** | Dependencies and compiled output dominate the generated category. <!-- consolidation: discard; ref: none; reason: Historical host breakdown. --> `.backlog` is retained as unknown state/user data; preserve any agent/worktree directories beneath it. <!-- consolidation: unconfirmed; ref: none; reason: Unknown state and nested worktree preservation require owner review. --> `.opencode` is mostly conventionally named generated descendants. <!-- consolidation: discard; ref: none; reason: Historical name-based classification. --> |
| `media-server` | `frontend` **989.2**; `backend` **183.4**; `live-sample` **15.5**; `.opencode` **6.4**; `.cache` **2.4** | `frontend` and `backend` contain about **988.1** and **183.0 MiB** of generated-name descendants. `live-sample` remains source/assets/data. <!-- consolidation: discard; ref: none; reason: Historical host breakdown, preservation gate retained above. --> |
| `gemini` | `web` **301.8**; `.venv` **270.8**; `node_modules` **145.0**; `mobile` **128.9**; `.git` **102.1** | `web` and `mobile` contain about **294.6** and **119.8 MiB** of generated descendants. <!-- consolidation: discard; ref: none; reason: Historical host breakdown. --> Git history is separately protected. <!-- consolidation: unconfirmed; ref: none; reason: Host Git preservation gate awaits owner disposition. --> |
| `gemini-ui-component-system` † | `web` **456.3**; `mobile` **134.8**; `data` **12.3**; `server` **1.5**; `tests` **0.570** | Generated descendants dominate `web` (**441.3 MiB**) and `mobile` (**125.7 MiB**). <!-- consolidation: discard; ref: none; reason: Historical host breakdown. --> Preserve this potential worktree, including its data and uncommitted work. <!-- consolidation: unconfirmed; ref: none; reason: Worktree data and uncommitted-work preservation require owner review. --> |
| `Contributions` | `k9s` **474.1**; `helm` **75.9** | Only two immediate subfolders exist. Includes **66.3 MiB** and **18.9 MiB** of nested Git history respectively; most remaining storage is unclassified/source/assets, not presumed cache. <!-- consolidation: discard; ref: none; reason: Historical host breakdown. --> |
| `ForgeLabs` | `node_modules` **229.8**; `.gitnexus` **55.9**; `.git` **47.8**; `logs` **47.4**; `apps` **26.4** | Logs and `.gitnexus` stay in the conservative remainder; neither was read. `apps` contains about **18.8 MiB** of generated descendants. Additional nested Git history explains the larger aggregate Git column. <!-- consolidation: discard; ref: none; reason: Historical host breakdown and classification limits. --> |
| `x8` | `.pio-core` **252.1**; `.git` **74.2**; `nasm` **49.2**; `test` **0.059**; `bin` **0.016** | `.pio-core` is tooling-shaped but unverified: only **1.5 MiB** of conventionally named descendants was classified generated. `nasm` includes **12.0 MiB** of nested Git history. <!-- consolidation: discard; ref: none; reason: Historical host breakdown and classification limits. --> |

## Preservation notes

**Preserve all agent/worktree directories and their working files.** The marked `gemini-*` folders, `gemini-worktrees`, agent-named folders, and potential nested worktrees/submodules may hold uncommitted work. Directory names such as `tmp`, `backup`, or a zero allocated size do not establish abandonment. The metadata-only scan does not prove whether a directory is active, reproducible, or safe to delete. <!-- consolidation: unconfirmed; ref: none; reason: Host worktree preservation and removal-safety gates remain unresolved. -->

No deletion, move, install, configuration change, repository edit, or content inspection was performed. No optional TSV was created; the full ranked table is above. <!-- consolidation: discard; ref: none; reason: Historical non-action and deliverable record. -->
