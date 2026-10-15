# Recent apps and file activity — storage review

## Scope and interpretation

- Activity window: **September 13–October 13, 2026**, 11:01:45 IDT at both endpoints (30 days).
- Three parallel Sol 6.1 agents audited application bundles, selected user Library storage, and the rest of the home directory. A targeted follow-up broke down Autodesk, Claude, and the VS Code extension-package cache.
- **Nothing was deleted or reconfigured.** This report is the only new file created by the audit. Personal file contents were not read; application identification used app metadata.
- The Data volume reports **404 GiB used, 14 GiB available, 97% capacity**. Free space is shared within the APFS container.
- Sizes below are **allocated storage**, not logical file lengths. APFS clones/shared extents and differing hardlink accounting mean these are not guaranteed unique physical usage or deletion savings. GiB/MiB are binary units.
- **Modified / Accessed columns are current allocated sizes of files with matching timestamps**, not amounts written/read during the month. They overlap and must not be added together.
- Access timestamps are only a **rough last-access signal**, not a read-event log or proof that a person used an app. Indexing, background tools, copying, and preserved timestamps can affect them. No matching accesses does not establish that an item is unused.
- Recent app dates can indicate installation, copying, updating, or Spotlight indexing. **First-time installation is not established.**
- Older storage is included to make cleanup review useful, even when it has no recent modifications.

## Where to start

| Owner / category | Directory | Allocated size | Review guidance |
|---|---|---:|---|
| Downloads | `~/Downloads` | 64.27 GiB | Mostly personal/shared material. Review archives and possible duplicate folders; do not blanket-delete. |
| Go Version Manager | `~/.gvm/pkgsets` | 37.11 GiB | Selectively review package sets. May contain local/custom work, not just disposable downloads. |
| Autodesk Fusion | `~/Library/Application Support/Autodesk` | 29.73 GiB | Three application deployments account for 28.47 GiB. Identify active/rollback versions through Autodesk before removal. |
| Docker | `~/Library/Containers/com.docker.docker` | 29.41 GiB | Review images/build cache inside Docker. Preserve persistent volumes and needed containers. |
| Projects | `~/Projects` | 16.78 GiB | Review generated dependencies/build artifacts project by project. Preserve source and `.git`. |
| Work/project material | `~/Zesty` | 14.81 GiB | Treat as user/work data until reviewed. |
| OpenCode personal installation | `~/.opencode-personal` | 14.58 GiB | 12.54 GiB in `data`, 1.91 GiB in `cache`. Preserve history/config; no wholesale deletion. |
| Claude Desktop | `~/Library/Application Support/Claude` | 10.74 GiB | Dominated by a 10 GiB VM filesystem image; persistence is unverified. Not classified as cache. |
| Documents | `~/Documents` | 7.09 GiB | Personal data. |
| Temporary-labelled material | `~/tmp` | 6.17 GiB | Directory name alone does not establish disposability. |
| Local tools/state | `~/.local` | 6.00 GiB | Includes a 3.10 GiB OpenCode database; preserve session/history data. |
| npm | `~/.npm` | 5.66 GiB | Mostly execution/download caches; comparatively lower-risk after checking active/offline workflows. |

### Lower-risk candidates, largest first

These are review candidates, **not deletion instructions**. Quit the owning app/tool and prefer its own cleanup controls. Cache removal can require downloads or break offline/reproducible workflows.

| Candidate | Size | Caution |
|---|---:|---|
| `~/.npm/_npx` | 4.33 GiB | Downloaded execution environments; check active or pinned uses. |
| `~/.opencode-personal/cache` | 1.91 GiB | Recently active tool cache; preserve custom additions. |
| `~/Library/Caches/Arc` | 1.55 GiB | Browser cache, not the Arc profile/history directory. |
| `~/.cache/pi-voice-stt` | 1.51 GiB | Almost entirely a speech model; removal interrupts offline speech until reacquired. |
| `~/.npm/_cacache` | 1.32 GiB | npm download cache; regeneration/network cost. |
| `~/Library/Caches/net.whatsapp.WhatsApp` | 998.79 MiB | Use app-managed cleanup; cache location does not prove every item is expendable. |
| `~/Library/Caches/company.thebrowser.Browser` | 948.35 MiB | Matches Arc's bundle ID; preserve browser profiles outside this cache. |
| `~/Library/Application Support/Code/CachedExtensionVSIXs` | 826.27 MiB | 24 extension-package cache files, separate from installed extensions and editor state. |
| Two downloaded installers listed below | 692.46 MiB | Nimbalyst and agent-orchestrator DMGs; confirm no archival need. |
| `~/.gradle/caches` | 567.10 MiB | Rebuild/re-download cost; repository availability matters. |
| `~/.gradle/wrapper` | 488.09 MiB | Retain distributions needed for offline builds. |
| `~/Library/Caches/Homebrew` | 363.04 MiB | Package downloads; use Homebrew cleanup with a preview. |

**Nimbalyst installer still present:** `~/Downloads/Nimbalyst-macOS-arm64.dmg`, **463.18 MiB**, modified September 28. The installed app and its identified settings were removed earlier; this installer is separate and was not deleted during the read-only audit.

## Home directories — largest 25

Home inventory observed **214.98 GiB**, excluding Library and Applications. Paths below are relative to `~`.

| Directory | Total allocated | Modified-file allocation in window | Accessed-file allocation in window |
|---|---:|---:|---:|
| Downloads | 64.27 GiB | 1.18 GiB | 8.83 GiB |
| .gvm | 38.18 GiB | 128.80 MiB | 11.06 GiB |
| Projects | 16.78 GiB | 5.58 GiB | 7.62 GiB |
| Zesty | 14.81 GiB | 329.27 MiB | 2.54 GiB |
| .opencode-personal | 14.58 GiB | 2.89 GiB | 2.92 GiB |
| Documents | 7.09 GiB | 1.53 MiB | 6.58 GiB |
| tmp | 6.17 GiB | 44.23 MiB | 3.07 GiB |
| .local | 6.00 GiB | 4.37 GiB | 5.30 GiB |
| .npm | 5.66 GiB | 3.81 GiB | 3.82 GiB |
| miniconda3 | 2.87 GiB | 0 | 1.16 GiB |
| .backlog | 2.68 GiB | 2.68 GiB | 2.68 GiB |
| .vscode | 2.43 GiB | 1.78 GiB | 1.78 GiB |
| .espressif | 2.23 GiB | 0 | 0 |
| mobileye-vm | 2.20 GiB | 0 | 680.36 MiB |
| .cache | 1.95 GiB | 1.55 GiB | 1.72 GiB |
| docs | 1.89 GiB | 1.89 GiB | 1.89 GiB |
| .codeium | 1.71 GiB | 0 | 512 KiB |
| esp | 1.70 GiB | 0 | 339.26 MiB |
| .android | 1.68 GiB | 4 KiB | 2.05 MiB |
| .u2net | 1.44 GiB | 0 | 0 |
| go | 1.42 GiB | 0 | 728.19 MiB |
| .rustup | 1.16 GiB | 0 | 262.31 MiB |
| .gradle | 1.06 GiB | 55.38 MiB | 72.39 MiB |
| .pi | 1.05 GiB | 1.05 GiB | 1.05 GiB |
| larynx_data | 986.61 MiB | 0 | 76 KiB |

Across home files, **29.98 GiB / 660,507 files** had matching modification timestamps and **68.94 GiB / 2,400,600 files** had matching access timestamps. These are not measured I/O volumes.

### Large subdirectories and files

| Parent | Largest children / allocation |
|---|---|
| Downloads | `MyAirBridge File Share` 14.33 GiB; `Characters` 8.26 GiB; `Characters-Copy` 8.09 GiB; `Photos part 1.zip` 4.76 GiB; `לימודים` 4.61 GiB |
| Projects | `ruflo` 2.44 GiB; `summarizer` 2.15 GiB; `Lumi` 2.10 GiB; `Backlog.md` 1.49 GiB; `media-server` 1.17 GiB |
| .gvm | `pkgsets` 37.11 GiB; `gos` 764.90 MiB; `archive` 324.34 MiB |
| .opencode-personal | `data` 12.54 GiB; `cache` 1.91 GiB; `config` 126.75 MiB |
| .local | `share` 5.20 GiB; `pipx` 442.49 MiB; `bin` 370.11 MiB |
| .npm | `_npx` 4.33 GiB; `_cacache` 1.32 GiB |
| .backlog | `Backlog.md` 2.68 GiB |
| .vscode | `extensions` 2.43 GiB — installed extensions, not merely download cache |
| .espressif | `tools` 1.84 GiB; `dist` 308.11 MiB; `python_env` 86.04 MiB |
| .cache | `pi-voice-stt` 1.51 GiB; `opencode` 217.42 MiB; `hyperframes` 193.37 MiB |
| .codeium | `windsurf` 956.36 MiB; `ws-browser` 454.62 MiB; `database` 338.18 MiB |
| .android | `avd` 1.68 GiB — emulator storage, potentially persistent user state |
| .u2net | `birefnet-general.onnx` 927.61 MiB; `isnet-anime.onnx` 167.91 MiB; `u2net.onnx` 167.85 MiB |
| .rustup | `toolchains` 1.16 GiB |
| .gradle | `caches` 567.10 MiB; `wrapper` 488.09 MiB |
| .pi | `agent` 1009.96 MiB; `context-mode` 66.38 MiB |

`Characters-Copy` is a **possible duplicate by name only**. Contents were not compared. Project directories contain 11.81 GiB under dependency/build/environment/history-labelled paths, but this includes `.git` and is **not a reclaimable-cache estimate**.

## App storage — largest 25 groups

Readable selected Library roots contained **90.31 GiB**. Paths below are relative to `~/Library`.

| App / directory | Total allocated | Modified-file allocation in window | Accessed-file allocation in window |
|---|---:|---:|---:|
| Application Support/Autodesk | 29.73 GiB | 0 | 924.02 MiB |
| Containers/com.docker.docker | 29.41 GiB | 29.39 GiB | 29.41 GiB |
| Application Support/Claude | 10.74 GiB | 0 | 10.24 GiB |
| Application Support/Code | 2.78 GiB | 1.33 GiB | 2.16 GiB |
| Application Support/Arc | 2.68 GiB | 1.87 GiB | 1.95 GiB |
| Caches/Arc | 1.55 GiB | 1.55 GiB | 1.55 GiB |
| Application Support/Slack | 1.38 GiB | 680.48 MiB | 682.15 MiB |
| Application Support/zoom.us | 1.08 GiB | 346.40 MiB | 527.31 MiB |
| Application Support/Steam | 1002.21 MiB | 0 | 265.21 MiB |
| Caches/net.whatsapp.WhatsApp | 998.79 MiB | 998.79 MiB | 998.79 MiB |
| Caches/company.thebrowser.Browser | 948.35 MiB | 876.05 MiB | 943.94 MiB |
| Application Support/Blender | 826.07 MiB | 0 | 51.74 MiB |
| Application Support/Dia | 725.35 MiB | 0 | 35.78 MiB |
| Application Support/zen | 660.42 MiB | 0 | 453.41 MiB |
| Application Support/BambuStudio | 530.54 MiB | 0 | 98.23 MiB |
| Caches/Homebrew | 363.04 MiB | 344.60 MiB | 344.26 MiB |
| Application Support/com.raycast.macos | 348.13 MiB | 54.46 MiB | 230.37 MiB |
| Application Support/io.kubebuilder.envtest | 340.66 MiB | 0 | 0 |
| Caches/Vivaldi | 284.67 MiB | 0 | 0 |
| Application Support/Antigravity | 257.28 MiB | 0 | 34.56 MiB |
| Caches/golangci-lint | 233.66 MiB | 233.66 MiB | 233.66 MiB |
| Caches/gopls | 231.93 MiB | 231.93 MiB | 217.02 MiB |
| Application Support/Vivaldi | 228.38 MiB | 0 | 23.20 MiB |
| Caches/com.nordvpn.macos | 227.00 MiB | 0 | 1.13 MiB |
| Application Support/BambuStudioBeta | 203.56 MiB | 0 | 0.61 MiB |

### Important app-specific breakdowns

**Autodesk Fusion:** three deployments under `~/Library/Application Support/Autodesk/webdeploy/production/`:

| Deployment directory | Allocated size | Date clue |
|---|---:|---|
| `42b8d7cb7630f307bd514d9fc6eca5f495fa798c` | 9.52 GiB | Latest file modification June 16, 2026 |
| `a706025f86435b2ccd17930d01721ef22d0fd507` | 9.52 GiB | Latest file modification June 9, 2026 |
| `2448aa8b3276a952725a8bb01f628b797da18a2a` | 9.44 GiB | Directory modification May 2, 2026 |

Each contains `Autodesk Fusion.app` and bundled libraries. Active version, rollback requirements, and unique APFS sharing are **not established**. These are application resources, not generic cache. Other Autodesk storage includes `Common` 547.85 MiB and `Identity Services` 339.71 MiB.

**Docker:** `Containers/com.docker.docker/Data/vms/0/data/Docker.raw` occupies **29.38 GiB allocated**, versus **59.60 GiB logical**. Last observed modification October 12. It may contain images, build cache, containers, and persistent volumes. Do not delete the disk image as a cache.

**Claude:** `Application Support/Claude/vm_bundles/claudevm.bundle/rootfs.img` occupies **10.00 GiB**, modified June 16. The whole VM bundle is 10.24 GiB. Other resources include `claude-code/2.1.222` 258.74 MiB and `claude-code-vm` 221.56 MiB. `local-agent-mode-sessions` is 20.64 MiB; preserve it and Local Storage/IndexedDB. Metadata alone does not establish whether the VM image is immutable or contains persistent user changes.

**VS Code:** `Application Support/Code/CachedExtensionVSIXs` is **826.27 MiB**, latest file modification October 13. Its three largest recently modified packages are OpenAI ChatGPT 324.58 MiB, Red Hat Java 122.69 MiB, and Claude Code 104.09 MiB. This cache is separate from `~/.vscode/extensions` and editor settings/state.

**Arc:** profile History and Favicons databases, including versioned profile snapshots, are substantial recent modifications. They are user/browser data, not ordinary cache. Do not blanket-delete `Application Support/Arc`.

## Recent application candidates — largest 25

All **68 app bundles total 23.95 GiB**: 62 under `/Applications`, six under `~/Applications` (only 4.9 MiB there).

**34 bundles / 15.33 GiB** have birth/modification dates in the window. Another 24 qualify only through Spotlight date-added metadata. Thus **58 / 23.42 GiB** are broadly recent candidates, not 58 confirmed new installations. Numerous Spotlight dates cluster on September 23 and October 12 for demonstrably older apps.

Paths below are `/Applications/<name>`. Dates are in 2026 unless stated otherwise. B = filesystem birthtime; M = bundle-directory modification; A = Spotlight date added. Times are omitted for readability. Filesystem evidence supports a recent copy/update; Spotlight-only evidence is weaker.

| App bundle | Allocated MiB | Recent signal | Interpretation |
|---|---:|---|---|
| Docker.app | 2197.1 | B/M Oct 2 | Recent copy/update candidate |
| ChatGPT.app | 1659.4 | A Oct 12; B/M Jun 25 | Spotlight-only; not a proven recent install |
| Visual Studio Code.app | 1478.2 | B/M Oct 6 | Recent copy/update candidate |
| Google Chrome.app | 1435.5 | M Oct 13; B Mar 31 | Update candidate |
| Claude.app | 898.5 | B/M Oct 9 | Recent copy/update candidate |
| Blender.app | 878.8 | A Sep 23; B/M Mar 17 | Spotlight-only |
| Arc.app | 861.9 | B/M Oct 12 | Recent copy/update candidate |
| zoom.us.app | 860.3 | B Sep 24; M Sep 28 | Recent copy/update candidate |
| Loom.app | 850.3 | B/M Sep 29 | Recent copy/update candidate |
| WhatsApp.app | 690.0 | B Oct 7; M Oct 9 | Recent copy/update candidate |
| BambuStudio.app | 673.6 | A Sep 23; B/M Aug 20 | Spotlight-only |
| TNAS PC.app | 603.1 | A Sep 23; B Jul 10 / M Sep 1 | Spotlight-only |
| Anytype.app | 580.8 | A Sep 23; B/M Aug 20 | Spotlight-only |
| Keynote.app | 543.5 | A Sep 23; B 2025 / M Apr 3 | Spotlight-only |
| TeamViewer.app | 537.9 | B Sep 28; M Oct 5 | Recent copy/update candidate |
| Obsidian.app | 528.2 | B/M Oct 2 | Recent copy/update candidate |
| Arduino IDE.app | 519.2 | A Sep 23; B/M Jun 9 | Spotlight-only |
| Firefox.app | 510.0 | B Oct 5; M Oct 12 | Recent copy/update candidate |
| Super Productivity.app | 493.6 | A Sep 23; B/M Apr 1 | Spotlight-only |
| Discord.app | 480.8 | B/M Oct 5 | Recent copy/update candidate |
| Ultimaker Cura.app | 480.0 | A Sep 23; B/M May 28 | Spotlight-only |
| Postman.app | 462.4 | B/M Oct 12 | Recent copy/update candidate |
| Pages.app | 460.5 | A Sep 23; B 2025 / M Apr 3 | Spotlight-only |
| TablePlus.app | 427.5 | B/M Oct 8 | Recent copy/update candidate |
| Tessera.app | 423.6 | B/M Sep 22 | Recent copy/update candidate |

App bundle sizes exclude the separate profiles/caches/runtime storage in the other tables.

## Notable large recently modified files

Selected largest files, descending allocated size. Dates are 2026. Paths are relative to home. This is modification evidence, not a complete write-event log.

| File | Allocated size | Modified |
|---|---:|---|
| `Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw` | 29.38 GiB | Oct 12 |
| `.local/share/opencode/opencode.db` | 3.10 GiB | Oct 12 |
| `.cache/pi-voice-stt/ggml-large-v3-turbo.bin` | 1.51 GiB | Oct 3 |
| `Downloads/Nimbalyst-macOS-arm64.dmg` | 463.18 MiB | Sep 28 |
| `Library/Application Support/Code/CachedExtensionVSIXs/openai.chatgpt-26.1007.21434-darwin-arm64` | 324.58 MiB | Within window |
| `Library/Application Support/Arc/User Data/Profile 1/History` | 276.63 MiB | Within window |
| `Library/Application Support/Arc/User Data/Snapshots/154.0.8037.98/Profile 1/History` | 260.63 MiB | Within window |
| `Library/Application Support/Arc/User Data/Snapshots/153.0.8010.53/Profile 1/History` | 260.25 MiB | Within window |
| `.npm/_npx/4bd2a453afc08379/…/codex-darwin-arm64/…/bin/codex` | 248.41 MiB | Sep 25 |
| `.vscode/extensions/openai.chatgpt-26.1007.21434-darwin-arm64/bin/macos-aarch64/codex` | 234.65 MiB | Oct 9 |
| `.vscode/extensions/anthropic.claude-code-2.1.296-darwin-arm64/resources/native-binary/claude` | 229.52 MiB | Oct 10 |
| `Downloads/agent-orchestrator-darwin-arm64.dmg` | 229.28 MiB | Sep 25 |
| `.npm/_npx/e5042b4359cce62b/…/codex-darwin-arm64/…/bin/codex` | 227.11 MiB | Sep 27 |
| `Zesty/pod-rightsizing/.git/objects/pack/pack-8084321a0ffd1bf2a6a679db77d3f88487e7ad52.pack` | 224.68 MiB | Sep 14 |
| `.opencode-personal/data/claude/versions/2.1.291` | 222.41 MiB | Oct 6 |
| `.opencode-personal/data/claude/versions/2.1.289` | 218.98 MiB | Oct 4 |
| `.local/share/claude/versions/2.1.289` | 218.98 MiB | Oct 4 |
| `Projects/Backlog.md/.backlog/back-23/a5a42cab-3032-47b5-97ed-f5bdfdf9fd4c.log` | 180.68 MiB | Oct 10 |

Repeated tool binaries are possible version-retention opportunities, but active versions and recovery requirements were not checked. Databases, Git packs, sessions, and logs can contain valuable history; they are not automatically safe cleanup targets.

## Coverage and verification limits

- Home scan: 126 groups, 4,486,752 unique regular files; one denied subtree, `~/.Trash`. **Trash size is unknown, not zero.** Existing removed Nimbalyst items may still consume space there.
- Library roots: Application Support, Caches, Containers, Group Containers, Logs, HTTPStorages, WebKit, Saved Application State. Developer was absent. 640,172 nodes were statted, with **475 permission errors**, mostly protected containers. Chrome, Firefox, Edge, Brave, Discord, and Apple-managed protected stores are examples of omitted subtrees. All listed top-25 Library groups themselves had zero scan errors.
- No symlink targets were traversed; external/different-device storage was excluded from the home scan. No cloud content was opened or downloaded.
- No Mail/Messages/Keychains root audit, system-wide file audit, installer-receipt investigation, APFS snapshot inventory, duplicate-content comparison, or complete file-read history was performed.
- Independent `du` checks matched Autodesk, Docker storage, Claude storage, Downloads, and the five largest app bundles exactly. Projects differed by only 28 KiB during the live scan; this was not a snapshot. The `.gvm` cross-check timed out after 20 seconds; its primary metadata inventory completed.
- Live apps continued changing files during scans. Counts use the fixed activity cutoff, even when the latest observed timestamps were later.
- No passwords or personal file contents were retrieved. No cleanup was performed. Review app ownership and backup/recovery needs before deleting anything.
