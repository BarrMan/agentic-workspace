# Projects storage map

Scope: `/Users/imribarr/Projects` only. Metadata snapshot: **2026-10-13 11:34:53 IDT**. Read-only scan completed in **20.6 seconds**, within a 210-second traversal deadline. No source, logs, configuration, Git pointers, or other file contents were read. Only this report was written.

## Summary

- **16.777 GiB allocated** (18,014,474,240 bytes), matching the previous approximately 16.78 GiB estimate.
- **61 immediate children: 58 directories and 3 files**; recursively counted **582,813 non-symlink files and 80,335 directories**, including immediate directory roots.
- Approximate split: **4.944 GiB source/assets/user data/unclassified (29.47%)**, **10.714 GiB conventional dependencies/builds/caches (63.86%)**, **1.119 GiB Git metadata/history (6.67%)**.
- Largest five: `ruflo` **2.438 GiB**, `summarizer` **2.152 GiB**, `Lumi` **2.101 GiB**, `Backlog.md` **1.495 GiB**, `media-server` **1.170 GiB**.
- **No traversal errors; no mount boundaries encountered.** Skipped 5,530 symlinks without following their targets.

## Measurement and interpretation

Allocated size is `lstat().st_blocks × 512`, including directory blocks. Hard-linked inodes are counted once across the scan; shared inodes, if any, are assigned to the first encountered child. Symlinks are excluded; filesystem-device boundaries are not crossed. This is allocated usage, not logical file length or guaranteed reclaimable physical space: APFS clones, compression, and snapshots can affect reclamation. Sizes may change after the snapshot.

Independent validation used `du -skxP` on the aggregate and largest five children. Results were **17,592,260 KiB total**, and respectively **2,556,296**, **2,256,812**, **2,203,320**, **1,567,492**, **1,226,548 KiB** for `ruflo`, `summarizer`, `Lumi`, `Backlog.md`, and `media-server`. Each exactly matched the metadata scan; aggregate difference: **0 bytes**.

Classification is based solely on directory names, not contents or rebuildability. Generated candidates include `node_modules`, `.venv`, `venv`, `env`, `.env`, `dist`, `build`, `.next`, `.nuxt`, `.cache`, Python cache directories, `.turbo`, `.parcel-cache`, `coverage`, `target`, `.svelte-kit`, `.output`, `.vite`, and `.gradle`. Consequently, the generated share is **approximate, not a deletion recommendation**; a folder with a conventional name can still contain valuable work. `.git` and everything beneath it are a separate protected category, including nested repositories and small Git-pointer files. **Git history is not disposable.**

The source/data column is the conservative remainder: it also includes unknown tooling data, logs, checkpoints, binaries, and state. In particular `.gitnexus`, `.pio-core`, and `.backlog` were not assumed disposable or counted as generated. Access times were not used to infer disuse.

## All immediate children, ranked

All size columns are **MiB** (1,048,576 bytes), rounded to three decimals. Files counts exclude symlinks. `†` means **preserve**: a Git-pointer file was found somewhere underneath, or the directory name suggests agent/worktree use. A Git-pointer file can also indicate a submodule; this is a conservative preservation marker, not a claim of verified worktree status. Uncommitted work was not inspected. Unmarked directories are not declared safe to remove.

| Immediate child | Allocated MiB | Source/data/unknown | Dependencies/build/cache | Git history/metadata | Files |
|---|---:|---:|---:|---:|---:|
| `ruflo` | 2,496.383 | 447.027 | 1,551.484 | 497.871 | 69,905 |
| `summarizer` | 2,203.918 | 2,203.895 | 0.023 | 0.000 | 14 |
| `Lumi` † | 2,151.680 | 152.434 | 1,834.152 | 165.094 | 56,923 |
| `Backlog.md` | 1,530.754 | 617.809 | 815.117 | 97.828 | 38,800 |
| `media-server` | 1,197.801 | 17.238 | 1,179.746 | 0.816 | 67,587 |
| `gemini` | 1,049.617 | 50.414 | 897.117 | 102.086 | 46,392 |
| `gemini-ui-component-system` † | 606.484 | 38.602 | 567.879 | 0.004 | 37,206 |
| `Contributions` | 549.988 | 464.730 | 0.008 | 85.250 | 2,719 |
| `ForgeLabs` | 414.230 | 115.762 | 248.523 | 49.945 | 22,592 |
| `x8` | 375.750 | 288.020 | 1.539 | 86.191 | 8,026 |
| `gemini-standalone-scripts` † | 371.844 | 25.148 | 346.691 | 0.004 | 14,492 |
| `wshobson-agents-omp` † | 367.770 | 54.258 | 310.645 | 2.867 | 8,518 |
| `remotion` | 359.629 | 0.172 | 359.457 | 0.000 | 15,191 |
| `typetest` | 346.402 | 1.301 | 344.574 | 0.527 | 39,753 |
| `gemini-space-data-simplification` † | 314.230 | 21.020 | 293.207 | 0.004 | 16,841 |
| `gemini-authenticated-e2e` † | 313.383 | 21.594 | 291.785 | 0.004 | 16,781 |
| `gemini-capture-prod-screenshots` † | 309.547 | 20.594 | 288.949 | 0.004 | 16,701 |
| `gemini-category-edit-ux` † | 303.785 | 19.000 | 284.781 | 0.004 | 13,795 |
| `gemini-landing-demo` † | 263.934 | 18.902 | 245.027 | 0.004 | 11,209 |
| `gemini-keychain-secrets` † | 251.297 | 18.852 | 232.441 | 0.004 | 10,321 |
| `DhcpProxyServer` | 229.902 | 0.152 | 229.750 | 0.000 | 8,062 |
| `esp32-rainmaker-backup` | 207.238 | 27.695 | 167.762 | 11.781 | 1,848 |
| `launch-box` | 185.082 | 0.668 | 184.414 | 0.000 | 18,047 |
| `Router` | 113.949 | 102.664 | 0.000 | 11.285 | 5,973 |
| `sample-extension` | 91.949 | 0.262 | 91.688 | 0.000 | 8,953 |
| `ink-agent-workspace-prototype` † | 81.539 | 0.465 | 81.074 | 0.000 | 6,115 |
| `gemini-mobile-category-grid` † | 55.328 | 25.129 | 30.195 | 0.004 | 1,304 |
| `task-account-imri-barr` | 53.703 | 39.234 | 0.086 | 14.383 | 2,591 |
| `nasm` | 49.238 | 37.215 | 0.000 | 12.023 | 1,484 |
| `ink-pty-spike` | 49.020 | 0.703 | 48.316 | 0.000 | 5,163 |
| `gemini-sintro-usb` † | 42.703 | 31.379 | 11.320 | 0.004 | 1,990 |
| `gemini-actions-root-cleanup` † | 25.477 | 20.430 | 5.043 | 0.004 | 718 |
| `gemini-clarify-local-preview` † | 23.867 | 20.988 | 2.875 | 0.004 | 679 |
| `gemini-remove-sqlite-refs` † | 21.785 | 18.340 | 3.441 | 0.004 | 471 |
| `gemini-queue-observability` † | 21.727 | 20.582 | 1.141 | 0.004 | 701 |
| `gemini-fix-ga-env-404` † | 21.402 | 19.121 | 2.277 | 0.004 | 615 |
| `gemini-card-space-colors` † | 21.398 | 19.117 | 2.277 | 0.004 | 614 |
| `gemini-worktrees` † | 21.148 | 19.000 | 2.145 | 0.004 | 441 |
| `gemini-fix-e2e-vite-config` † | 21.055 | 21.043 | 0.008 | 0.004 | 615 |
| `gemini-security-p0-fixes` † | 19.988 | 18.746 | 1.238 | 0.004 | 588 |
| `gemini-bookmark-filter-toggle` † | 19.109 | 19.098 | 0.008 | 0.004 | 547 |
| `agent-view` † | 11.000 | 3.789 | 0.000 | 7.211 | 209 |
| `serial-port-forwarder` | 9.320 | 0.008 | 9.312 | 0.000 | 610 |
| `tmp` | 3.484 | 0.039 | 3.445 | 0.000 | 521 |
| `echo-pilot` | 0.617 | 0.102 | 0.391 | 0.125 | 92 |
| `pi-package-manager` | 0.219 | 0.062 | 0.000 | 0.156 | 45 |
| `agent-orchestrator` † | 0.062 | 0.062 | 0.000 | 0.000 | 12 |
| `paca` | 0.043 | 0.035 | 0.008 | 0.000 | 3 |
| `opencode` | 0.039 | 0.039 | 0.000 | 0.000 | 13 |
| `maccabi-mcp` | 0.031 | 0.027 | 0.004 | 0.000 | 7 |
| `docker-images` | 0.023 | 0.020 | 0.004 | 0.000 | 6 |
| `8bit-computer` | 0.020 | 0.020 | 0.000 | 0.000 | 3 |
| `Backlog.md-handoff.md` (file) | 0.016 | 0.016 | 0.000 | 0.000 | 1 |
| `.DS_Store` (file) | 0.012 | 0.012 | 0.000 | 0.000 | 1 |
| `test_sed` | 0.012 | 0.012 | 0.000 | 0.000 | 3 |
| `CMakeLists.txt` (file) | 0.004 | 0.004 | 0.000 | 0.000 | 1 |
| `gemini-dashboard-restyle` | 0.004 | 0.004 | 0.000 | 0.000 | 1 |
| `better-prompt-viewer` | 0.000 | 0.000 | 0.000 | 0.000 | 0 |
| `gemini-ga-event-detail` | 0.000 | 0.000 | 0.000 | 0.000 | 0 |
| `my-game` | 0.000 | 0.000 | 0.000 | 0.000 | 0 |
| `webserver` | 0.000 | 0.000 | 0.000 | 0.000 | 0 |

## Heavy subfolders in the largest ten children

Sizes below are allocated MiB, rounded approximately. Paths are relative to the named immediate child. Nested folders can contain a mix of the three categories; category estimates above traverse their descendants.

| Parent | Largest immediate subfolders | Interpretation |
|---|---|---|
| `ruflo` | `v3` **1,586.0**; `.git` **497.9**; `.gitnexus` **247.4**; `v2` **145.7**; `ruflo` **9.7** | `v3` is overwhelmingly conventional generated storage: about **1,551.4 MiB**. `.gitnexus` and `v2` remain unclassified/source/data; Git history stays protected. |
| `summarizer` | `checkpoints` **2,203.1**; `data` **0.789**; `__pycache__` **0.023** | Checkpoints account for almost the entire folder and are retained as assets/user data. These are its three immediate subdirectories. |
| `Lumi` † | `flutter_app` **650.5**; `esp32-rainmaker` **363.5**; `webserver` **315.8**; `esp32-idf` **225.1**; `esp32-idf2` **184.3** | Generated estimates within these: about **583.3**, **360.4**, **314.9**, **224.9**, **184.2 MiB** respectively. Nested Git-pointer files mean preserve potential worktrees/submodules. |
| `Backlog.md` | `node_modules` **682.2**; `.backlog` **593.0**; `.git` **97.8**; `dist` **71.7**; `.opencode` **61.3** | Dependencies and compiled output dominate the generated category. `.backlog` is retained as unknown state/user data; preserve any agent/worktree directories beneath it. `.opencode` is mostly conventionally named generated descendants. |
| `media-server` | `frontend` **989.2**; `backend` **183.4**; `live-sample` **15.5**; `.opencode` **6.4**; `.cache` **2.4** | `frontend` and `backend` contain about **988.1** and **183.0 MiB** of generated-name descendants. `live-sample` remains source/assets/data. |
| `gemini` | `web` **301.8**; `.venv` **270.8**; `node_modules` **145.0**; `mobile` **128.9**; `.git` **102.1** | `web` and `mobile` contain about **294.6** and **119.8 MiB** of generated descendants. Git history is separately protected. |
| `gemini-ui-component-system` † | `web` **456.3**; `mobile` **134.8**; `data` **12.3**; `server` **1.5**; `tests` **0.570** | Generated descendants dominate `web` (**441.3 MiB**) and `mobile` (**125.7 MiB**). Preserve this potential worktree, including its data and uncommitted work. |
| `Contributions` | `k9s` **474.1**; `helm` **75.9** | Only two immediate subfolders exist. Includes **66.3 MiB** and **18.9 MiB** of nested Git history respectively; most remaining storage is unclassified/source/assets, not presumed cache. |
| `ForgeLabs` | `node_modules` **229.8**; `.gitnexus` **55.9**; `.git` **47.8**; `logs` **47.4**; `apps` **26.4** | Logs and `.gitnexus` stay in the conservative remainder; neither was read. `apps` contains about **18.8 MiB** of generated descendants. Additional nested Git history explains the larger aggregate Git column. |
| `x8` | `.pio-core` **252.1**; `.git` **74.2**; `nasm` **49.2**; `test` **0.059**; `bin` **0.016** | `.pio-core` is tooling-shaped but unverified: only **1.5 MiB** of conventionally named descendants was classified generated. `nasm` includes **12.0 MiB** of nested Git history. |

## Preservation notes

**Preserve all agent/worktree directories and their working files.** The marked `gemini-*` folders, `gemini-worktrees`, agent-named folders, and potential nested worktrees/submodules may hold uncommitted work. Directory names such as `tmp`, `backup`, or a zero allocated size do not establish abandonment. The metadata-only scan does not prove whether a directory is active, reproducible, or safe to delete.

No deletion, move, install, configuration change, repository edit, or content inspection was performed. No optional TSV was created; the full ranked table is above.
