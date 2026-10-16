---
consolidation:
  total: 179
  counts:
    exists: 0
    discard: 144
    integrate: 0
    unconfirmed: 35
  percentages:
    exists: 0.00%
    discard: 80.45%
    integrate: 0.00%
    unconfirmed: 19.55%
---
# Recent apps and file activity — storage review
> **Non-authoritative supporting material.** This file is not a contract. Authoritative owner(s): [docs/PRODUCT.md](PRODUCT.md), [docs/specs/sessions.md](specs/sessions.md), [docs/BLUEPRINT.md](BLUEPRINT.md).
> Disposition: Mixed — see markers.

## Scope and interpretation

- Activity window: **September 13–October 13, 2026**, 11:01:45 IDT at both endpoints (30 days). <!-- consolidation: discard; ref: none; reason: Historical audit window. -->
- Three parallel Sol 6.1 agents audited application bundles, selected user Library storage, and the rest of the home directory. A targeted follow-up broke down Autodesk, Claude, and the VS Code extension-package cache. <!-- consolidation: discard; ref: none; reason: Historical audit execution and scope. -->
- **Nothing was deleted or reconfigured.** This report is the only new file created by the audit. Personal file contents were not read; application identification used app metadata. <!-- consolidation: discard; ref: none; reason: Historical non-action and privacy record. -->
- The Data volume reports **404 GiB used, 14 GiB available, 97% capacity**. Free space is shared within the APFS container. <!-- consolidation: discard; ref: none; reason: Historical host capacity. -->
- Sizes below are **allocated storage**, not logical file lengths. APFS clones/shared extents and differing hardlink accounting mean these are not guaranteed unique physical usage or deletion savings. GiB/MiB are binary units. <!-- consolidation: discard; ref: none; reason: Historical accounting method and limits. -->
- **Modified / Accessed columns are current allocated sizes of files with matching timestamps**, not amounts written/read during the month. They overlap and must not be added together. <!-- consolidation: discard; ref: none; reason: Report-local timestamp accounting definition. -->
- Access timestamps are only a **rough last-access signal**, not a read-event log or proof that a person used an app. Indexing, background tools, copying, and preserved timestamps can affect them. No matching accesses does not establish that an item is unused. <!-- consolidation: discard; ref: none; reason: Historical activity-inference limitation. -->
- Recent app dates can indicate installation, copying, updating, or Spotlight indexing. **First-time installation is not established.** <!-- consolidation: discard; ref: none; reason: Historical installation-inference limitation. -->
- Older storage is included to make cleanup review useful, even when it has no recent modifications. <!-- consolidation: discard; ref: none; reason: Historical inventory selection rationale. -->

## Where to start

| Owner / category | Directory | Allocated size | Review guidance |
|---|---|---:|---|
| Downloads | `~/Downloads` | 64.27 GiB | Mostly personal/shared material. Review archives and possible duplicate folders; do not blanket-delete. <!-- consolidation: unconfirmed; ref: none; reason: Personal-data preservation and duplicate review unresolved. --> |
| Go Version Manager | `~/.gvm/pkgsets` | 37.11 GiB | Selectively review package sets. May contain local/custom work, not just disposable downloads. <!-- consolidation: unconfirmed; ref: none; reason: Local-work preservation and cleanup permission require review. --> |
| Autodesk Fusion | `~/Library/Application Support/Autodesk` | 29.73 GiB | Three application deployments account for 28.47 GiB. Identify active/rollback versions through Autodesk before removal. <!-- consolidation: unconfirmed; ref: none; reason: Active and rollback deployment safety gate unresolved. --> |
| Docker | `~/Library/Containers/com.docker.docker` | 29.41 GiB | Review images/build cache inside Docker. Preserve persistent volumes and needed containers. <!-- consolidation: unconfirmed; ref: none; reason: Workload-data preservation and cleanup permission require review. --> |
| Projects | `~/Projects` | 16.78 GiB | Review generated dependencies/build artifacts project by project. Preserve source and `.git`. <!-- consolidation: unconfirmed; ref: none; reason: Project reproducibility and preservation gates unresolved. --> |
| Work/project material | `~/Zesty` | 14.81 GiB | Treat as user/work data until reviewed. <!-- consolidation: unconfirmed; ref: none; reason: Business-data preservation awaits owner disposition. --> |
| OpenCode personal installation | `~/.opencode-personal` | 14.58 GiB | 12.54 GiB in `data`, 1.91 GiB in `cache`. Preserve history/config; no wholesale deletion. <!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#deleting-a-session; reason: External provider-store preservation and deletion scope remain unresolved. --> |
| Claude Desktop | `~/Library/Application Support/Claude` | 10.74 GiB | Dominated by a 10 GiB VM filesystem image; persistence is unverified. Not classified as cache. <!-- consolidation: unconfirmed; ref: none; reason: VM persistence and disposability remain unknown. --> |
| Documents | `~/Documents` | 7.09 GiB | Personal data. <!-- consolidation: discard; ref: none; reason: Historical personal-data inventory. --> |
| Temporary-labelled material | `~/tmp` | 6.17 GiB | Directory name alone does not establish disposability. <!-- consolidation: unconfirmed; ref: none; reason: Data ownership and deletion safety require review. --> |
| Local tools/state | `~/.local` | 6.00 GiB | Includes a 3.10 GiB OpenCode database; preserve session/history data. <!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#deleting-a-session; reason: Host session-history retention and provider-file scope remain unresolved. --> |
| npm | `~/.npm` | 5.66 GiB | Mostly execution/download caches; comparatively lower-risk after checking active/offline workflows. <!-- consolidation: unconfirmed; ref: none; reason: Cache cleanup depends on unresolved active and offline-use gates. --> |

### Lower-risk candidates, largest first

These are review candidates, **not deletion instructions**. <!-- consolidation: unconfirmed; ref: none; reason: Candidate list grants no deletion permission. --> Quit the owning app/tool and prefer its own cleanup controls. Cache removal can require downloads or break offline/reproducible workflows. <!-- consolidation: unconfirmed; ref: none; reason: App quiescence and recovery requirements need target-specific review. -->

| Candidate | Size | Caution |
|---|---:|---|
| `~/.npm/_npx` | 4.33 GiB | Downloaded execution environments; check active or pinned uses. <!-- consolidation: unconfirmed; ref: none; reason: Active-use and pinning review unresolved. --> |
| `~/.opencode-personal/cache` | 1.91 GiB | Recently active tool cache; preserve custom additions. <!-- consolidation: unconfirmed; ref: none; reason: Custom-data preservation and removal permission unresolved. --> |
| `~/Library/Caches/Arc` | 1.55 GiB | Browser cache, not the Arc profile/history directory. <!-- consolidation: unconfirmed; ref: none; reason: Proposed cleanup candidate still needs target-specific permission. --> |
| `~/.cache/pi-voice-stt` | 1.51 GiB | Almost entirely a speech model; removal interrupts offline speech until reacquired. <!-- consolidation: unconfirmed; ref: none; reason: Offline speech requirement and removal decision unresolved. --> |
| `~/.npm/_cacache` | 1.32 GiB | npm download cache; regeneration/network cost. <!-- consolidation: unconfirmed; ref: none; reason: Recovery cost and cache-removal permission require review. --> |
| `~/Library/Caches/net.whatsapp.WhatsApp` | 998.79 MiB | Use app-managed cleanup; cache location does not prove every item is expendable. <!-- consolidation: unconfirmed; ref: none; reason: App-managed cleanup and data-value gate unresolved. --> |
| `~/Library/Caches/company.thebrowser.Browser` | 948.35 MiB | Matches Arc's bundle ID; preserve browser profiles outside this cache. <!-- consolidation: unconfirmed; ref: none; reason: Browser-profile preservation and cleanup scope require review. --> |
| `~/Library/Application Support/Code/CachedExtensionVSIXs` | 826.27 MiB | 24 extension-package cache files, separate from installed extensions and editor state. <!-- consolidation: unconfirmed; ref: none; reason: Proposed cache-removal permission remains unresolved. --> |
| Two downloaded installers listed below | 692.46 MiB | Nimbalyst and agent-orchestrator DMGs; confirm no archival need. <!-- consolidation: unconfirmed; ref: none; reason: Installer archival needs unresolved. --> |
| `~/.gradle/caches` | 567.10 MiB | Rebuild/re-download cost; repository availability matters. <!-- consolidation: unconfirmed; ref: none; reason: Dependency recovery and removal permission require review. --> |
| `~/.gradle/wrapper` | 488.09 MiB | Retain distributions needed for offline builds. <!-- consolidation: unconfirmed; ref: none; reason: Offline-build preservation gate unresolved. --> |
| `~/Library/Caches/Homebrew` | 363.04 MiB | Package downloads; use Homebrew cleanup with a preview. <!-- consolidation: unconfirmed; ref: none; reason: Cleanup recommendation and preview gate require approval. --> |

**Nimbalyst installer still present:** `~/Downloads/Nimbalyst-macOS-arm64.dmg`, **463.18 MiB**, modified September 28. The installed app and its identified settings were removed earlier; this installer is separate and was not deleted during the read-only audit. <!-- consolidation: discard; ref: none; reason: Historical installer state and non-action record. -->

## Home directories — largest 25

Home inventory observed **214.98 GiB**, excluding Library and Applications. Paths below are relative to `~`. <!-- consolidation: discard; ref: none; reason: Historical home allocation and scope. -->

| Directory | Total allocated | Modified-file allocation in window | Accessed-file allocation in window |
|---|---:|---:|---:|
| Downloads | 64.27 GiB | 1.18 GiB | 8.83 GiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| .gvm | 38.18 GiB | 128.80 MiB | 11.06 GiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Projects | 16.78 GiB | 5.58 GiB | 7.62 GiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Zesty | 14.81 GiB | 329.27 MiB | 2.54 GiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| .opencode-personal | 14.58 GiB | 2.89 GiB | 2.92 GiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Documents | 7.09 GiB | 1.53 MiB | 6.58 GiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| tmp | 6.17 GiB | 44.23 MiB | 3.07 GiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| .local | 6.00 GiB | 4.37 GiB | 5.30 GiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| .npm | 5.66 GiB | 3.81 GiB | 3.82 GiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| miniconda3 | 2.87 GiB | 0 | 1.16 GiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| .backlog | 2.68 GiB | 2.68 GiB | 2.68 GiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| .vscode | 2.43 GiB | 1.78 GiB | 1.78 GiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| .espressif | 2.23 GiB | 0 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| mobileye-vm | 2.20 GiB | 0 | 680.36 MiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| .cache | 1.95 GiB | 1.55 GiB | 1.72 GiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| docs | 1.89 GiB | 1.89 GiB | 1.89 GiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| .codeium | 1.71 GiB | 0 | 512 KiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| esp | 1.70 GiB | 0 | 339.26 MiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| .android | 1.68 GiB | 4 KiB | 2.05 MiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| .u2net | 1.44 GiB | 0 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| go | 1.42 GiB | 0 | 728.19 MiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| .rustup | 1.16 GiB | 0 | 262.31 MiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| .gradle | 1.06 GiB | 55.38 MiB | 72.39 MiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| .pi | 1.05 GiB | 1.05 GiB | 1.05 GiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| larynx_data | 986.61 MiB | 0 | 76 KiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |

Across home files, **29.98 GiB / 660,507 files** had matching modification timestamps and **68.94 GiB / 2,400,600 files** had matching access timestamps. These are not measured I/O volumes. <!-- consolidation: discard; ref: none; reason: Historical timestamp aggregates. -->

### Large subdirectories and files

| Parent | Largest children / allocation |
|---|---|
| Downloads | `MyAirBridge File Share` 14.33 GiB; `Characters` 8.26 GiB; `Characters-Copy` 8.09 GiB; `Photos part 1.zip` 4.76 GiB; `לימודים` 4.61 GiB <!-- consolidation: discard; ref: none; reason: Historical host breakdown. --> |
| Projects | `ruflo` 2.44 GiB; `summarizer` 2.15 GiB; `Lumi` 2.10 GiB; `Backlog.md` 1.49 GiB; `media-server` 1.17 GiB <!-- consolidation: discard; ref: none; reason: Historical host breakdown. --> |
| .gvm | `pkgsets` 37.11 GiB; `gos` 764.90 MiB; `archive` 324.34 MiB <!-- consolidation: discard; ref: none; reason: Historical host breakdown. --> |
| .opencode-personal | `data` 12.54 GiB; `cache` 1.91 GiB; `config` 126.75 MiB <!-- consolidation: discard; ref: none; reason: Historical host breakdown. --> |
| .local | `share` 5.20 GiB; `pipx` 442.49 MiB; `bin` 370.11 MiB <!-- consolidation: discard; ref: none; reason: Historical host breakdown. --> |
| .npm | `_npx` 4.33 GiB; `_cacache` 1.32 GiB <!-- consolidation: discard; ref: none; reason: Historical host breakdown. --> |
| .backlog | `Backlog.md` 2.68 GiB <!-- consolidation: discard; ref: none; reason: Historical host breakdown. --> |
| .vscode | `extensions` 2.43 GiB — installed extensions, not merely download cache <!-- consolidation: discard; ref: none; reason: Historical host breakdown. --> |
| .espressif | `tools` 1.84 GiB; `dist` 308.11 MiB; `python_env` 86.04 MiB <!-- consolidation: discard; ref: none; reason: Historical host breakdown. --> |
| .cache | `pi-voice-stt` 1.51 GiB; `opencode` 217.42 MiB; `hyperframes` 193.37 MiB <!-- consolidation: discard; ref: none; reason: Historical host breakdown. --> |
| .codeium | `windsurf` 956.36 MiB; `ws-browser` 454.62 MiB; `database` 338.18 MiB <!-- consolidation: discard; ref: none; reason: Historical host breakdown. --> |
| .android | `avd` 1.68 GiB — emulator storage, potentially persistent user state <!-- consolidation: unconfirmed; ref: none; reason: Emulator persistence and cleanup safety remain unresolved. --> |
| .u2net | `birefnet-general.onnx` 927.61 MiB; `isnet-anime.onnx` 167.91 MiB; `u2net.onnx` 167.85 MiB <!-- consolidation: discard; ref: none; reason: Historical host breakdown. --> |
| .rustup | `toolchains` 1.16 GiB <!-- consolidation: discard; ref: none; reason: Historical host breakdown. --> |
| .gradle | `caches` 567.10 MiB; `wrapper` 488.09 MiB <!-- consolidation: discard; ref: none; reason: Historical host breakdown. --> |
| .pi | `agent` 1009.96 MiB; `context-mode` 66.38 MiB <!-- consolidation: discard; ref: none; reason: Historical host breakdown. --> |

`Characters-Copy` is a **possible duplicate by name only**. Contents were not compared. <!-- consolidation: unconfirmed; ref: none; reason: Duplicate status remains unverified and grants no removal permission. --> Project directories contain 11.81 GiB under dependency/build/environment/history-labelled paths, but this includes `.git` and is **not a reclaimable-cache estimate**. <!-- consolidation: discard; ref: none; reason: Historical classification total and limitation. -->

## App storage — largest 25 groups

Readable selected Library roots contained **90.31 GiB**. Paths below are relative to `~/Library`. <!-- consolidation: discard; ref: none; reason: Historical Library allocation and scope. -->

| App / directory | Total allocated | Modified-file allocation in window | Accessed-file allocation in window |
|---|---:|---:|---:|
| Application Support/Autodesk | 29.73 GiB | 0 | 924.02 MiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Containers/com.docker.docker | 29.41 GiB | 29.39 GiB | 29.41 GiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Application Support/Claude | 10.74 GiB | 0 | 10.24 GiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Application Support/Code | 2.78 GiB | 1.33 GiB | 2.16 GiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Application Support/Arc | 2.68 GiB | 1.87 GiB | 1.95 GiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Caches/Arc | 1.55 GiB | 1.55 GiB | 1.55 GiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Application Support/Slack | 1.38 GiB | 680.48 MiB | 682.15 MiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Application Support/zoom.us | 1.08 GiB | 346.40 MiB | 527.31 MiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Application Support/Steam | 1002.21 MiB | 0 | 265.21 MiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Caches/net.whatsapp.WhatsApp | 998.79 MiB | 998.79 MiB | 998.79 MiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Caches/company.thebrowser.Browser | 948.35 MiB | 876.05 MiB | 943.94 MiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Application Support/Blender | 826.07 MiB | 0 | 51.74 MiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Application Support/Dia | 725.35 MiB | 0 | 35.78 MiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Application Support/zen | 660.42 MiB | 0 | 453.41 MiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Application Support/BambuStudio | 530.54 MiB | 0 | 98.23 MiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Caches/Homebrew | 363.04 MiB | 344.60 MiB | 344.26 MiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Application Support/com.raycast.macos | 348.13 MiB | 54.46 MiB | 230.37 MiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Application Support/io.kubebuilder.envtest | 340.66 MiB | 0 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Caches/Vivaldi | 284.67 MiB | 0 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Application Support/Antigravity | 257.28 MiB | 0 | 34.56 MiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Caches/golangci-lint | 233.66 MiB | 233.66 MiB | 233.66 MiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Caches/gopls | 231.93 MiB | 231.93 MiB | 217.02 MiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Application Support/Vivaldi | 228.38 MiB | 0 | 23.20 MiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Caches/com.nordvpn.macos | 227.00 MiB | 0 | 1.13 MiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Application Support/BambuStudioBeta | 203.56 MiB | 0 | 0.61 MiB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |

### Important app-specific breakdowns

**Autodesk Fusion:** three deployments under `~/Library/Application Support/Autodesk/webdeploy/production/`: <!-- consolidation: discard; ref: none; reason: Historical deployment inventory. -->

| Deployment directory | Allocated size | Date clue |
|---|---:|---|
| `42b8d7cb7630f307bd514d9fc6eca5f495fa798c` | 9.52 GiB | Latest file modification June 16, 2026 <!-- consolidation: discard; ref: none; reason: Historical deployment inventory. --> |
| `a706025f86435b2ccd17930d01721ef22d0fd507` | 9.52 GiB | Latest file modification June 9, 2026 <!-- consolidation: discard; ref: none; reason: Historical deployment inventory. --> |
| `2448aa8b3276a952725a8bb01f628b797da18a2a` | 9.44 GiB | Directory modification May 2, 2026 <!-- consolidation: discard; ref: none; reason: Historical deployment inventory. --> |

Each contains `Autodesk Fusion.app` and bundled libraries. <!-- consolidation: discard; ref: none; reason: Historical deployment contents. --> Active version, rollback requirements, and unique APFS sharing are **not established**. These are application resources, not generic cache. <!-- consolidation: unconfirmed; ref: none; reason: Deployment ownership, rollback and recovery gates unresolved. --> Other Autodesk storage includes `Common` 547.85 MiB and `Identity Services` 339.71 MiB. <!-- consolidation: discard; ref: none; reason: Historical Autodesk allocation. -->

**Docker:** `Containers/com.docker.docker/Data/vms/0/data/Docker.raw` occupies **29.38 GiB allocated**, versus **59.60 GiB logical**. Last observed modification October 12. <!-- consolidation: discard; ref: none; reason: Historical sparse-image allocation. --> It may contain images, build cache, containers, and persistent volumes. Do not delete the disk image as a cache. <!-- consolidation: unconfirmed; ref: none; reason: Persistent-data preservation and disk-image removal permission unresolved. -->

**Claude:** `Application Support/Claude/vm_bundles/claudevm.bundle/rootfs.img` occupies **10.00 GiB**, modified June 16. The whole VM bundle is 10.24 GiB. Other resources include `claude-code/2.1.222` 258.74 MiB and `claude-code-vm` 221.56 MiB. <!-- consolidation: discard; ref: none; reason: Historical Claude runtime inventory. --> `local-agent-mode-sessions` is 20.64 MiB; preserve it and Local Storage/IndexedDB. <!-- consolidation: unconfirmed; ref: none; reason: Session and browser-store preservation gate awaits owner disposition. --> Metadata alone does not establish whether the VM image is immutable or contains persistent user changes. <!-- consolidation: unconfirmed; ref: none; reason: VM persistence and cleanup safety remain unknown. -->

**VS Code:** `Application Support/Code/CachedExtensionVSIXs` is **826.27 MiB**, latest file modification October 13. Its three largest recently modified packages are OpenAI ChatGPT 324.58 MiB, Red Hat Java 122.69 MiB, and Claude Code 104.09 MiB. This cache is separate from `~/.vscode/extensions` and editor settings/state. <!-- consolidation: discard; ref: none; reason: Historical extension-cache inventory. -->

**Arc:** profile History and Favicons databases, including versioned profile snapshots, are substantial recent modifications. They are user/browser data, not ordinary cache. Do not blanket-delete `Application Support/Arc`. <!-- consolidation: unconfirmed; ref: none; reason: Browser-history preservation and cleanup scope require owner decision. -->

## Recent application candidates — largest 25

All **68 app bundles total 23.95 GiB**: 62 under `/Applications`, six under `~/Applications` (only 4.9 MiB there). <!-- consolidation: discard; ref: none; reason: Historical app inventory. -->

**34 bundles / 15.33 GiB** have birth/modification dates in the window. Another 24 qualify only through Spotlight date-added metadata. Thus **58 / 23.42 GiB** are broadly recent candidates, not 58 confirmed new installations. Numerous Spotlight dates cluster on September 23 and October 12 for demonstrably older apps. <!-- consolidation: discard; ref: none; reason: Historical installation-candidate accounting and limits. -->

Paths below are `/Applications/<name>`. Dates are in 2026 unless stated otherwise. B = filesystem birthtime; M = bundle-directory modification; A = Spotlight date added. Times are omitted for readability. Filesystem evidence supports a recent copy/update; Spotlight-only evidence is weaker. <!-- consolidation: discard; ref: none; reason: Historical evidence interpretation and report legend. -->

| App bundle | Allocated MiB | Recent signal | Interpretation |
|---|---:|---|---|
| Docker.app | 2197.1 | B/M Oct 2 | Recent copy/update candidate <!-- consolidation: discard; ref: none; reason: Historical app activity evidence. --> |
| ChatGPT.app | 1659.4 | A Oct 12; B/M Jun 25 | Spotlight-only; not a proven recent install <!-- consolidation: discard; ref: none; reason: Historical app activity evidence. --> |
| Visual Studio Code.app | 1478.2 | B/M Oct 6 | Recent copy/update candidate <!-- consolidation: discard; ref: none; reason: Historical app activity evidence. --> |
| Google Chrome.app | 1435.5 | M Oct 13; B Mar 31 | Update candidate <!-- consolidation: discard; ref: none; reason: Historical app activity evidence. --> |
| Claude.app | 898.5 | B/M Oct 9 | Recent copy/update candidate <!-- consolidation: discard; ref: none; reason: Historical app activity evidence. --> |
| Blender.app | 878.8 | A Sep 23; B/M Mar 17 | Spotlight-only <!-- consolidation: discard; ref: none; reason: Historical app activity evidence. --> |
| Arc.app | 861.9 | B/M Oct 12 | Recent copy/update candidate <!-- consolidation: discard; ref: none; reason: Historical app activity evidence. --> |
| zoom.us.app | 860.3 | B Sep 24; M Sep 28 | Recent copy/update candidate <!-- consolidation: discard; ref: none; reason: Historical app activity evidence. --> |
| Loom.app | 850.3 | B/M Sep 29 | Recent copy/update candidate <!-- consolidation: discard; ref: none; reason: Historical app activity evidence. --> |
| WhatsApp.app | 690.0 | B Oct 7; M Oct 9 | Recent copy/update candidate <!-- consolidation: discard; ref: none; reason: Historical app activity evidence. --> |
| BambuStudio.app | 673.6 | A Sep 23; B/M Aug 20 | Spotlight-only <!-- consolidation: discard; ref: none; reason: Historical app activity evidence. --> |
| TNAS PC.app | 603.1 | A Sep 23; B Jul 10 / M Sep 1 | Spotlight-only <!-- consolidation: discard; ref: none; reason: Historical app activity evidence. --> |
| Anytype.app | 580.8 | A Sep 23; B/M Aug 20 | Spotlight-only <!-- consolidation: discard; ref: none; reason: Historical app activity evidence. --> |
| Keynote.app | 543.5 | A Sep 23; B 2025 / M Apr 3 | Spotlight-only <!-- consolidation: discard; ref: none; reason: Historical app activity evidence. --> |
| TeamViewer.app | 537.9 | B Sep 28; M Oct 5 | Recent copy/update candidate <!-- consolidation: discard; ref: none; reason: Historical app activity evidence. --> |
| Obsidian.app | 528.2 | B/M Oct 2 | Recent copy/update candidate <!-- consolidation: discard; ref: none; reason: Historical app activity evidence. --> |
| Arduino IDE.app | 519.2 | A Sep 23; B/M Jun 9 | Spotlight-only <!-- consolidation: discard; ref: none; reason: Historical app activity evidence. --> |
| Firefox.app | 510.0 | B Oct 5; M Oct 12 | Recent copy/update candidate <!-- consolidation: discard; ref: none; reason: Historical app activity evidence. --> |
| Super Productivity.app | 493.6 | A Sep 23; B/M Apr 1 | Spotlight-only <!-- consolidation: discard; ref: none; reason: Historical app activity evidence. --> |
| Discord.app | 480.8 | B/M Oct 5 | Recent copy/update candidate <!-- consolidation: discard; ref: none; reason: Historical app activity evidence. --> |
| Ultimaker Cura.app | 480.0 | A Sep 23; B/M May 28 | Spotlight-only <!-- consolidation: discard; ref: none; reason: Historical app activity evidence. --> |
| Postman.app | 462.4 | B/M Oct 12 | Recent copy/update candidate <!-- consolidation: discard; ref: none; reason: Historical app activity evidence. --> |
| Pages.app | 460.5 | A Sep 23; B 2025 / M Apr 3 | Spotlight-only <!-- consolidation: discard; ref: none; reason: Historical app activity evidence. --> |
| TablePlus.app | 427.5 | B/M Oct 8 | Recent copy/update candidate <!-- consolidation: discard; ref: none; reason: Historical app activity evidence. --> |
| Tessera.app | 423.6 | B/M Sep 22 | Recent copy/update candidate <!-- consolidation: discard; ref: none; reason: Historical app activity evidence. --> |

App bundle sizes exclude the separate profiles/caches/runtime storage in the other tables. <!-- consolidation: discard; ref: none; reason: Historical accounting boundary. -->

## Notable large recently modified files

Selected largest files, descending allocated size. Dates are 2026. Paths are relative to home. This is modification evidence, not a complete write-event log. <!-- consolidation: discard; ref: none; reason: Historical sampling and evidence limitation. -->

| File | Allocated size | Modified |
|---|---:|---|
| `Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw` | 29.38 GiB | Oct 12 <!-- consolidation: discard; ref: none; reason: Historical file metadata. --> |
| `.local/share/opencode/opencode.db` | 3.10 GiB | Oct 12 <!-- consolidation: discard; ref: none; reason: Historical file metadata. --> |
| `.cache/pi-voice-stt/ggml-large-v3-turbo.bin` | 1.51 GiB | Oct 3 <!-- consolidation: discard; ref: none; reason: Historical file metadata. --> |
| `Downloads/Nimbalyst-macOS-arm64.dmg` | 463.18 MiB | Sep 28 <!-- consolidation: discard; ref: none; reason: Historical file metadata. --> |
| `Library/Application Support/Code/CachedExtensionVSIXs/openai.chatgpt-26.1007.21434-darwin-arm64` | 324.58 MiB | Within window <!-- consolidation: discard; ref: none; reason: Historical file metadata. --> |
| `Library/Application Support/Arc/User Data/Profile 1/History` | 276.63 MiB | Within window <!-- consolidation: discard; ref: none; reason: Historical file metadata. --> |
| `Library/Application Support/Arc/User Data/Snapshots/154.0.8037.98/Profile 1/History` | 260.63 MiB | Within window <!-- consolidation: discard; ref: none; reason: Historical file metadata. --> |
| `Library/Application Support/Arc/User Data/Snapshots/153.0.8010.53/Profile 1/History` | 260.25 MiB | Within window <!-- consolidation: discard; ref: none; reason: Historical file metadata. --> |
| `.npm/_npx/4bd2a453afc08379/…/codex-darwin-arm64/…/bin/codex` | 248.41 MiB | Sep 25 <!-- consolidation: discard; ref: none; reason: Historical file metadata. --> |
| `.vscode/extensions/openai.chatgpt-26.1007.21434-darwin-arm64/bin/macos-aarch64/codex` | 234.65 MiB | Oct 9 <!-- consolidation: discard; ref: none; reason: Historical file metadata. --> |
| `.vscode/extensions/anthropic.claude-code-2.1.296-darwin-arm64/resources/native-binary/claude` | 229.52 MiB | Oct 10 <!-- consolidation: discard; ref: none; reason: Historical file metadata. --> |
| `Downloads/agent-orchestrator-darwin-arm64.dmg` | 229.28 MiB | Sep 25 <!-- consolidation: discard; ref: none; reason: Historical file metadata. --> |
| `.npm/_npx/e5042b4359cce62b/…/codex-darwin-arm64/…/bin/codex` | 227.11 MiB | Sep 27 <!-- consolidation: discard; ref: none; reason: Historical file metadata. --> |
| `Zesty/pod-rightsizing/.git/objects/pack/pack-8084321a0ffd1bf2a6a679db77d3f88487e7ad52.pack` | 224.68 MiB | Sep 14 <!-- consolidation: discard; ref: none; reason: Historical file metadata. --> |
| `.opencode-personal/data/claude/versions/2.1.291` | 222.41 MiB | Oct 6 <!-- consolidation: discard; ref: none; reason: Historical file metadata. --> |
| `.opencode-personal/data/claude/versions/2.1.289` | 218.98 MiB | Oct 4 <!-- consolidation: discard; ref: none; reason: Historical file metadata. --> |
| `.local/share/claude/versions/2.1.289` | 218.98 MiB | Oct 4 <!-- consolidation: discard; ref: none; reason: Historical file metadata. --> |
| `Projects/Backlog.md/.backlog/back-23/a5a42cab-3032-47b5-97ed-f5bdfdf9fd4c.log` | 180.68 MiB | Oct 10 <!-- consolidation: discard; ref: none; reason: Historical file metadata. --> |

Repeated tool binaries are possible version-retention opportunities, but active versions and recovery requirements were not checked. <!-- consolidation: unconfirmed; ref: none; reason: Active-version and recovery gates unresolved for binary cleanup. --> Databases, Git packs, sessions, and logs can contain valuable history; they are not automatically safe cleanup targets. <!-- consolidation: unconfirmed; ref: none; reason: Historical-data preservation and removal permission require owner review. -->

## Coverage and verification limits

- Home scan: 126 groups, 4,486,752 unique regular files; one denied subtree, `~/.Trash`. **Trash size is unknown, not zero.** Existing removed Nimbalyst items may still consume space there. <!-- consolidation: discard; ref: none; reason: Historical audit coverage and uncertainty. -->
- Library roots: Application Support, Caches, Containers, Group Containers, Logs, HTTPStorages, WebKit, Saved Application State. Developer was absent. 640,172 nodes were statted, with **475 permission errors**, mostly protected containers. Chrome, Firefox, Edge, Brave, Discord, and Apple-managed protected stores are examples of omitted subtrees. All listed top-25 Library groups themselves had zero scan errors. <!-- consolidation: discard; ref: none; reason: Historical permission omissions and scan coverage. -->
- No symlink targets were traversed; external/different-device storage was excluded from the home scan. No cloud content was opened or downloaded. <!-- consolidation: discard; ref: none; reason: Historical audit scope and non-action record. -->
- No Mail/Messages/Keychains root audit, system-wide file audit, installer-receipt investigation, APFS snapshot inventory, duplicate-content comparison, or complete file-read history was performed. <!-- consolidation: discard; ref: none; reason: Historical audit exclusions. -->
- Independent `du` checks matched Autodesk, Docker storage, Claude storage, Downloads, and the five largest app bundles exactly. Projects differed by only 28 KiB during the live scan; this was not a snapshot. The `.gvm` cross-check timed out after 20 seconds; its primary metadata inventory completed. <!-- consolidation: discard; ref: none; reason: Historical validation results and limits. -->
- Live apps continued changing files during scans. Counts use the fixed activity cutoff, even when the latest observed timestamps were later. <!-- consolidation: discard; ref: none; reason: Historical non-atomic measurement limitation. -->
- No passwords or personal file contents were retrieved. No cleanup was performed. <!-- consolidation: discard; ref: none; reason: Historical privacy and non-action record. --> Review app ownership and backup/recovery needs before deleting anything. <!-- consolidation: unconfirmed; ref: none; reason: Ownership and recovery gates remain unresolved for future cleanup. -->
