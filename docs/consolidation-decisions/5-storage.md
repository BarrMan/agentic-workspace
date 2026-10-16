# Decision sheet — Storage and host cleanup

> **Non-authoritative working sheet.** Not a contract. Answers here are applied to the owning contracts and to each document's disposition markers.

Each group below is one document. Decide the group as a whole, select statements individually, or write a narrowing instruction.

- Group box: `[ ] Discard all` · `[ ] Approve all (integrate)` · `[ ] Select individually` · `[ ] Narrow further: ______`
- Per statement (only if selecting individually): `d` discard · `i` integrate · `?` still open.
- Class tag: `P` = proposal / unanswered claim (a policy answer can retire it) · `G` = evidence or safety gate (needs evidence, not a decision).

Family total: **204** statements — 30 P · 174 G.

## G1 · docs/IMPACT_LATEST.md

**Document:** `docs/IMPACT_LATEST.md` · **5 statements** — 3 P · 2 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/architecture/application-boundaries.md#stores-and-repositories`** — 2 statement(s)

1. `P` **Exact receipt-resolution check design is not established by the current persistence contract.** — configuration; add receipt-resolution and pending-journal rejection checks. — `docs/IMPACT_LATEST.md:28`
2. `P` **Configuration-only receipt injection is an unapproved implementation recommendation.** — resolve concrete adapters at execution; reject moving mode-deletion journals unchanged. — `docs/IMPACT_LATEST.md:35`

**→ `docs/specs/configuration.md#delete-a-mode`** — 2 statement(s)

1. `G` **Pending-journal rejection behavior needs recovery-policy disposition.** — configuration; add receipt-resolution and pending-journal rejection checks. — `docs/IMPACT_LATEST.md:28`
2. `P` **Moving-journal rejection and recovery disposition are not approved.** — resolve concrete adapters at execution; reject moving mode-deletion journals unchanged. — `docs/IMPACT_LATEST.md:35`

**→ `docs/CONVENTIONS.md#changes-and-refactoring`** — 1 statement(s)

1. `G` **Live-state migration ownership and approval must remain explicit.** — Shared persisted interface with multiple consumers and an explicitly separate live-state migration. — `docs/IMPACT_LATEST.md:31`

## G2 · AgenticWorkspace — App Directory Map

**Document:** `docs/app-directory-map.md` · **1 statements** — 0 P · 1 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ `docs/BLUEPRINT.md#durable-conversation-and-operation-records`** — 1 statement(s)

1. `G` **Directory recreation must not imply retained conversations or recovery evidence are disposable or reconstructible. The blanket transient-state characterization needs qualification.** — Nothing below appears in the tree above: each path is recreated by the process that owns it, and none of it is repository content. — `docs/app-directory-map.md:748`

## G3 · Disk growth investigation

**Document:** `docs/disk-growth-investigation.md` · **6 statements** — 3 P · 3 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ _no owning contract — retire, or escalate as a new decision_** — 5 statement(s)

1. `G` **The reclaim command assumes filename matches are disposable and needs ownership and active-use validation before approval.** — ``` — `docs/disk-growth-investigation.md:78`
2. `P` **Restart reset claim and periodic global sweep safety are not established by the approved test-isolation contract.** — practical countermeasure until the upstream extraction cleanup is fixed. — `docs/disk-growth-investigation.md:81`
3. `G` **Duplicate-folder claim is not proven and later Downloads review explicitly leaves it unverified.** — | `~/Downloads` (includes two ~8.5 GB duplicate folders) | 67.4 GB | — `docs/disk-growth-investigation.md:90`
4. `P` **The destructive final command lacks target ownership and active-use checks, diagnostic heading is not cleanup permission.** — ``` — `docs/disk-growth-investigation.md:108`
5. `G` **Blanket claims about du logical accounting and df exclusivity need qualification before becoming operational guidance.** — use `stat`-based logical sums or `du` only for relative comparison. — `docs/disk-growth-investigation.md:112`

**→ `docs/CONVENTIONS.md#testing`** — 1 statement(s)

1. `P` **Absolute cleanup-on-every-exit assurance is not established for killed workers or failed teardown.** — performs now dies with the run instead of accumulating in the real temp directory. — `docs/disk-growth-investigation.md:64`

## G4 · Recent apps and file activity — storage review

**Document:** `docs/recent-app-file-activity.md` · **35 statements** — 5 P · 30 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ _no owning contract — retire, or escalate as a new decision_** — 33 statement(s)

1. `G` **Personal-data preservation and duplicate review unresolved.** — | Downloads | `~/Downloads` | 64.27 GiB | Mostly personal/shared material. Review archives and possible duplicate folders; do not blanket-delete. | — `docs/recent-app-file-activity.md:35`
2. `G` **Local-work preservation and cleanup permission require review.** — | Go Version Manager | `~/.gvm/pkgsets` | 37.11 GiB | Selectively review package sets. May contain local/custom work, not just disposable downloads. | — `docs/recent-app-file-activity.md:36`
3. `G` **Active and rollback deployment safety gate unresolved.** — | Autodesk Fusion | `~/Library/Application Support/Autodesk` | 29.73 GiB | Three application deployments account for 28.47 GiB. Identify active/rollback versions through Autodesk before removal. | — `docs/recent-app-file-activity.md:37`
4. `G` **Workload-data preservation and cleanup permission require review.** — | Docker | `~/Library/Containers/com.docker.docker` | 29.41 GiB | Review images/build cache inside Docker. Preserve persistent volumes and needed containers. | — `docs/recent-app-file-activity.md:38`
5. `G` **Project reproducibility and preservation gates unresolved.** — | Projects | `~/Projects` | 16.78 GiB | Review generated dependencies/build artifacts project by project. Preserve source and `.git`. | — `docs/recent-app-file-activity.md:39`
6. `G` **Business-data preservation awaits owner disposition.** — | Work/project material | `~/Zesty` | 14.81 GiB | Treat as user/work data until reviewed. | — `docs/recent-app-file-activity.md:40`
7. `G` **VM persistence and disposability remain unknown.** — | Claude Desktop | `~/Library/Application Support/Claude` | 10.74 GiB | Dominated by a 10 GiB VM filesystem image; persistence is unverified. Not classified as cache. | — `docs/recent-app-file-activity.md:42`
8. `G` **Data ownership and deletion safety require review.** — | Temporary-labelled material | `~/tmp` | 6.17 GiB | Directory name alone does not establish disposability. | — `docs/recent-app-file-activity.md:44`
9. `G` **Cache cleanup depends on unresolved active and offline-use gates.** — | npm | `~/.npm` | 5.66 GiB | Mostly execution/download caches; comparatively lower-risk after checking active/offline workflows. | — `docs/recent-app-file-activity.md:46`
10. `P` **Candidate list grants no deletion permission.** — These are review candidates, **not deletion instructions**. Quit the owning app/tool and prefer its own cleanup controls. Cache removal can require downloads or break offline/reproducible workflows. — `docs/recent-app-file-activity.md:50`
11. `P` **App quiescence and recovery requirements need target-specific review.** — These are review candidates, **not deletion instructions**. Quit the owning app/tool and prefer its own cleanup controls. Cache removal can require downloads or break offline/reproducible workflows. — `docs/recent-app-file-activity.md:50`
12. `G` **Active-use and pinning review unresolved.** — | `~/.npm/_npx` | 4.33 GiB | Downloaded execution environments; check active or pinned uses. | — `docs/recent-app-file-activity.md:54`
13. `G` **Custom-data preservation and removal permission unresolved.** — | `~/.opencode-personal/cache` | 1.91 GiB | Recently active tool cache; preserve custom additions. | — `docs/recent-app-file-activity.md:55`
14. `P` **Proposed cleanup candidate still needs target-specific permission.** — | `~/Library/Caches/Arc` | 1.55 GiB | Browser cache, not the Arc profile/history directory. | — `docs/recent-app-file-activity.md:56`
15. `G` **Offline speech requirement and removal decision unresolved.** — | `~/.cache/pi-voice-stt` | 1.51 GiB | Almost entirely a speech model; removal interrupts offline speech until reacquired. | — `docs/recent-app-file-activity.md:57`
16. `G` **Recovery cost and cache-removal permission require review.** — | `~/.npm/_cacache` | 1.32 GiB | npm download cache; regeneration/network cost. | — `docs/recent-app-file-activity.md:58`
17. `G` **App-managed cleanup and data-value gate unresolved.** — | `~/Library/Caches/net.whatsapp.WhatsApp` | 998.79 MiB | Use app-managed cleanup; cache location does not prove every item is expendable. | — `docs/recent-app-file-activity.md:59`
18. `G` **Browser-profile preservation and cleanup scope require review.** — | `~/Library/Caches/company.thebrowser.Browser` | 948.35 MiB | Matches Arc's bundle ID; preserve browser profiles outside this cache. | — `docs/recent-app-file-activity.md:60`
19. `P` **Proposed cache-removal permission remains unresolved.** — | `~/Library/Application Support/Code/CachedExtensionVSIXs` | 826.27 MiB | 24 extension-package cache files, separate from installed extensions and editor state. | — `docs/recent-app-file-activity.md:61`
20. `G` **Installer archival needs unresolved.** — | Two downloaded installers listed below | 692.46 MiB | Nimbalyst and agent-orchestrator DMGs; confirm no archival need. | — `docs/recent-app-file-activity.md:62`
21. `G` **Dependency recovery and removal permission require review.** — | `~/.gradle/caches` | 567.10 MiB | Rebuild/re-download cost; repository availability matters. | — `docs/recent-app-file-activity.md:63`
22. `G` **Offline-build preservation gate unresolved.** — | `~/.gradle/wrapper` | 488.09 MiB | Retain distributions needed for offline builds. | — `docs/recent-app-file-activity.md:64`
23. `P` **Cleanup recommendation and preview gate require approval.** — | `~/Library/Caches/Homebrew` | 363.04 MiB | Package downloads; use Homebrew cleanup with a preview. | — `docs/recent-app-file-activity.md:65`
24. `G` **Emulator persistence and cleanup safety remain unresolved.** — | .android | `avd` 1.68 GiB — emulator storage, potentially persistent user state | — `docs/recent-app-file-activity.md:118`
25. `G` **Duplicate status remains unverified and grants no removal permission.** — `Characters-Copy` is a **possible duplicate by name only**. Contents were not compared. Project directories contain 11.81 GiB under dependency/build/environment/history-labelled paths, but this … — `docs/recent-app-file-activity.md:124`
26. `G` **Deployment ownership, rollback and recovery gates unresolved.** — Each contains `Autodesk Fusion.app` and bundled libraries. Active version, rollback requirements, and unique APFS sharing are **not established**. These are application resources, not generic cache. … — `docs/recent-app-file-activity.md:168`
27. `G` **Persistent-data preservation and disk-image removal permission unresolved.** — **Docker:** `Containers/com.docker.docker/Data/vms/0/data/Docker.raw` occupies **29.38 GiB allocated**, versus **59.60 GiB logical**. Last observed modification October 12. It may contain images, … — `docs/recent-app-file-activity.md:170`
28. `G` **Session and browser-store preservation gate awaits owner disposition.** — **Claude:** `Application Support/Claude/vm_bundles/claudevm.bundle/rootfs.img` occupies **10.00 GiB**, modified June 16. The whole VM bundle is 10.24 GiB. Other resources include … — `docs/recent-app-file-activity.md:172`
29. `G` **VM persistence and cleanup safety remain unknown.** — **Claude:** `Application Support/Claude/vm_bundles/claudevm.bundle/rootfs.img` occupies **10.00 GiB**, modified June 16. The whole VM bundle is 10.24 GiB. Other resources include … — `docs/recent-app-file-activity.md:172`
30. `G` **Browser-history preservation and cleanup scope require owner decision.** — **Arc:** profile History and Favicons databases, including versioned profile snapshots, are substantial recent modifications. They are user/browser data, not ordinary cache. Do not blanket-delete … — `docs/recent-app-file-activity.md:176`
31. `G` **Active-version and recovery gates unresolved for binary cleanup.** — Repeated tool binaries are possible version-retention opportunities, but active versions and recovery requirements were not checked. Databases, Git packs, sessions, and logs can contain valuable … — `docs/recent-app-file-activity.md:241`
32. `G` **Historical-data preservation and removal permission require owner review.** — Repeated tool binaries are possible version-retention opportunities, but active versions and recovery requirements were not checked. Databases, Git packs, sessions, and logs can contain valuable … — `docs/recent-app-file-activity.md:241`
33. `G` **Ownership and recovery gates remain unresolved for future cleanup.** — - No passwords or personal file contents were retrieved. No cleanup was performed. Review app ownership and backup/recovery needs before deleting anything. — `docs/recent-app-file-activity.md:251`

**→ `docs/specs/sessions.md#deleting-a-session`** — 2 statement(s)

1. `G` **External provider-store preservation and deletion scope remain unresolved.** — | OpenCode personal installation | `~/.opencode-personal` | 14.58 GiB | 12.54 GiB in `data`, 1.91 GiB in `cache`. Preserve history/config; no wholesale deletion. | — `docs/recent-app-file-activity.md:41`
2. `G` **Host session-history retention and provider-file scope remain unresolved.** — | Local tools/state | `~/.local` | 6.00 GiB | Includes a 3.10 GiB OpenCode database; preserve session/history data. | — `docs/recent-app-file-activity.md:45`

## G5 · Storage cleanup plan — consolidated

**Document:** `docs/storage-cleanup-plan.md` · **29 statements** — 6 P · 23 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ _no owning contract — retire, or escalate as a new decision_** — 26 statement(s)

1. `G` **Host-specific preservation gate requires owner review, historical size is not deletion authority.** — | 1 | `~/Downloads` | 64.27 GiB | Review, not bulk-delete | Mostly personal: shares, photos, study material. See `storage-review-downloads.md`. | — `docs/storage-cleanup-plan.md:34`
2. `G` **Active deployment and rollback needs remain unresolved.** — | 2 | Autodesk Fusion deploys (`~/Library/Application Support/Autodesk/webdeploy/production/*`) | 28.47 GiB | REVIEW | Three deployments. Identify active/rollback version via Autodesk first. | — `docs/storage-cleanup-plan.md:35`
3. `G` **Per-project ownership and reproducibility require a decision before cleanup.** — | 3 | `~/Projects` generated dirs (`node_modules`, venv, build) | ~10.7 GiB | REVIEW per project | Source (4.9 GiB) and `.git` (1.1 GiB) preserve. | — `docs/storage-cleanup-plan.md:36`
4. `G` **Business-data preservation and cleanup permission remain owner-specific.** — | 4 | `~/Zesty` deps/build | several GiB | REVIEW per project | Business/project data — preserve. | — `docs/storage-cleanup-plan.md:37`
5. `P` **VM persistence and retirement authorization are not established.** — | 5 | `~/Library/Application Support/Claude/vm_bundles` | 10 GiB | LEAVE unless retiring | `rootfs.img`; persistence unverified; not a cache. | — `docs/storage-cleanup-plan.md:38`
6. `G` **Retain host personal-data preservation gate pending owner disposition.** — | 6 | `~/Documents` | 7.09 GiB | KEEP | Personal. | — `docs/storage-cleanup-plan.md:39`
7. `G` **Ownership and disposability remain unknown.** — | 7 | `~/tmp` | 6.17 GiB | REVIEW contents | Name alone doesn't make it disposable. | — `docs/storage-cleanup-plan.md:40`
8. `P` **Cache removal recommendation lacks active-use and recovery approval.** — | 9 | `~/.npm/_npx` + `_cacache` | 5.65 GiB | CLEANUP-CANDIDATE | Re-download cost; safe-ish. | — `docs/storage-cleanup-plan.md:42`
9. `G` **Cache classification alone does not authorize removal.** — | 10 | `~/.opencode-personal/cache` | 1.91 GiB | CLEANUP-CANDIDATE | Tool cache. | — `docs/storage-cleanup-plan.md:43`
10. `G` **Offline-use requirements and removal permission remain unresolved.** — | 11 | `~/.cache/pi-voice-stt` | 1.51 GiB | REVIEW | Speech model; blocks offline STT if removed. | — `docs/storage-cleanup-plan.md:44`
11. `G` **Host cache cleanup needs app-specific review and permission.** — | 12 | `~/Library/Caches/Arc` + `company.thebrowser.Browser` | 2.5 GiB | CLEANUP-CANDIDATE | Browser caches; profiles are elsewhere. | — `docs/storage-cleanup-plan.md:45`
12. `G` **Build reproducibility and offline requirements remain unresolved.** — | 13 | `~/.gradle/caches` + `wrapper` | 1.06 GiB | REVIEW | Offline/repro build impact. | — `docs/storage-cleanup-plan.md:46`
13. `G` **Host cache cleanup permission remains unresolved.** — | 14 | `~/Library/Application Support/Code/CachedExtensionVSIXs` | 826 MiB | CLEANUP-CANDIDATE | Extension download cache only. | — `docs/storage-cleanup-plan.md:47`
14. `G` **Uninstalled status does not establish permission to delete the installer.** — | 15 | Downloads installers: `Nimbalyst-macOS-arm64.dmg` | 463 MiB | DELETE | App already uninstalled. | — `docs/storage-cleanup-plan.md:48`
15. `G` **Installation and archival needs remain unresolved.** — | 16 | `Downloads/agent-orchestrator-darwin-arm64.dmg` | 229 MiB | REVIEW | Confirm installed. | — `docs/storage-cleanup-plan.md:49`
16. `G` **Anonymous-volume amount conflicts with detailed named-volume evidence and data value is unverified.** — | 17 | Dangling anonymous Docker volumes | ~207 MB | `docker volume prune` | Unattached, unattributable; low value. | — `docs/storage-cleanup-plan.md:50`
17. `G` **Missing toolchains do not establish binary disuse or removal permission.** — | 18 | `~/.gvm/pkgsets/*/bin` (old sets) | ~600 MiB | REVIEW | Bins now orphaned; toolchains not installed. | — `docs/storage-cleanup-plan.md:51`
18. `G` **Host preservation scope remains a safety gate pending owner disposition.** — - All `.git` history, project source, `~/Documents`, `~/.backlog`, `~/.pi/agent`, `~/.local/share` DBs. — `docs/storage-cleanup-plan.md:55`
19. `G` **Preserve workload-specific exclusions until retirement is explicitly decided.** — - Docker: `sintro-*`, `kwok-*`, `mobileye-vm_*` containers and `infra_*`, `mobileye-vm_*` volumes. — `docs/storage-cleanup-plan.md:56`
20. `G` **Name similarity does not establish duplication or safe deletion.** — - `Characters` vs `Characters-Copy` in Downloads: possible duplicate, **unverified**. — `docs/storage-cleanup-plan.md:57`
21. `G` **Exact host archival preservation gate awaits retention-policy approval.** — 3. Never replace originals with summaries — summaries lose exact wording, IDs, tool output, attachments. — `docs/storage-cleanup-plan.md:69`
22. `G` **Maintenance timing and safe free-space budget require a separate decision.** — 4. SQLite deletion/`VACUUM` is separate: freed pages stay in-file; VACUUM can need space up to ~2× the DB. Deprioritize with limited free space. — `docs/storage-cleanup-plan.md:70`
23. `P` **Retain host cleanup precondition pending target-specific authorization.** — - Confirm each target's ownership and rebuild/re-download path. — `docs/storage-cleanup-plan.md:77`
24. `P` **Host app-quiescence gate needs target-specific validation.** — - Quit the owning app before cleaning its caches. — `docs/storage-cleanup-plan.md:78`
25. `P` **Cleanup mechanism recommendation awaits target-specific review.** — - Prefer app-supported cleanup/prune over manual deletion. — `docs/storage-cleanup-plan.md:79`
26. `G` **Host reclamation acceptance check remains required if cleanup is authorized.** — - Re-measure host free space after cleanup; logical deletion may not release host blocks. — `docs/storage-cleanup-plan.md:80`

**→ `docs/specs/sessions.md#deleting-a-session`** — 2 statement(s)

1. `G` **External provider-store deletion scope and host retention permission are unresolved.** — | 8 | `~/.local` (`share/opencode/opencode.db`) | 6.00 GiB | REVIEW | 3.10 GiB DB is session history — preserve. | — `docs/storage-cleanup-plan.md:41`
2. `G` **External archive restore gate is not a settled provider-data deletion policy.** — 5. Test resume in an isolated profile before removing anything. — `docs/storage-cleanup-plan.md:71`

**→ `docs/PRODUCT.md#non-goals`** — 1 statement(s)

1. `P` **Host archival proposal is not approved product scope or an authorized retention change.** — 2. Keep cold originals; **archive losslessly with `zstd`** (already installed) plus a small searchable summary that points into the archive. — `docs/storage-cleanup-plan.md:68`

## G6 · Docker storage review — macOS

**Document:** `docs/storage-review-docker.md` · **7 statements** — 0 P · 7 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ _no owning contract — retire, or escalate as a new decision_** — 7 statement(s)

1. `G` **Attribution of 207 MB to anonymous volumes conflicts with named-volume sizes below, preservation needs remain unresolved.** — Preserved containers: `sintro-postgres`, `sintro-redis` (infrastructure), `deskribe-query-api`, `grafana`, `victoriametrics` (mobileye-vm), and `kwok-clamp-repro-kwok-controller`, `-kube-scheduler`, … — `docs/storage-review-docker.md:58`
2. `G` **Historical review estimate cannot retire inventory, rebuildability or permission gates for future cleanup.** — `builder du` separately reported **2.119 GB shared, 8.451 GB private, 10.57 GB total/reclaimable**. Shared cache can remain referenced by images; do not add its 10.57 GB to image estimates. The … — `docs/storage-review-docker.md:73`
3. `G` **Writable-layer value and deletion permission remain unresolved.** — The stopped etcd container alone had a **338 MB writable layer**; the query API had **3.23 MB**. Container reclaimability does not establish that these layers are disposable. No event history was … — `docs/storage-review-docker.md:83`
4. `G` **Data value and permission require owner review despite unattached status.** — - Truly unattached in that snapshot: `infra_lifeos-pgdata` **134.3 MB**, `mobileye-vm_grafana-data` **51.33 MB**, `mobileye-vm_vm-data` **21.49 MB**, anonymous `65a2d497…` **89 B**. These comprise … — `docs/storage-review-docker.md:97`
5. `G` **Retain host prune safety gate pending workload-data and removal-permission decisions.** — 4. **Avoid blanket `docker system prune --volumes`:** it removes stopped containers and can delete persistent data in unused anonymous volumes. Named volumes need separate review as well. Ordinary … — `docs/storage-review-docker.md:108`
6. `G` **Retirement, backup and destructive disk-reset permission require separate approval.** — 5. If intentionally retiring this Docker Desktop installation, use its supported reset/uninstall workflow after preserving needed data. Treat deletion of Docker.raw or reducing its maximum disk size … — `docs/storage-review-docker.md:109`
7. `G` **Data-value safety gate remains unresolved for future cleanup.** — Validation: local endpoint and default context were checked. After force-killing stale Docker backends and relaunching, the daemon reported server 29.8.2/API 1.56 and the authorized cleanup … — `docs/storage-review-docker.md:118`

## G7 · Downloads storage review

**Document:** `docs/storage-review-downloads.md` · **38 statements** — 1 P · 37 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ _no owning contract — retire, or escalate as a new decision_** — 38 statement(s)

1. `G` **Owner and backup gates remain unresolved, labels grant no cleanup permission.** — These are **proposed logical destinations only**, not created folders. Folder names start with Downloads/ and are relative to the home directory. Confidence describes category evidence, not deletion … — `docs/storage-review-downloads.md:29`
2. `G` **Owner preservation decision pending.** — | MyAirBridge File Share | 14.33 GiB | archives/shares | medium | KEEP | Purpose inferred from directory name; contents not read. | — `docs/storage-review-downloads.md:49`
3. `G` **Duplicate status and preservation decision pending.** — | Characters | 8.28 GiB | media/photos/assets | medium | KEEP | Purpose inferred from directory name; contents not read. Duplicate/related names are unverified; no contents compared. | — `docs/storage-review-downloads.md:50`
4. `G` **Duplicate status and preservation decision pending.** — | Characters-Copy | 8.09 GiB | media/photos/assets | medium | KEEP | Purpose inferred from directory name; contents not read. Duplicate/related names are unverified; no contents compared. | — `docs/storage-review-downloads.md:51`
5. `G` **Unique-content and backup gate unresolved.** — | Photos part 1.zip | 4.76 GiB | archives/shares | high | KEEP | Archive extension; unique contents and backup status unknown. | — `docs/storage-review-downloads.md:52`
6. `G` **Owner preservation decision pending.** — | לימודים | 4.61 GiB | study/documents | medium | KEEP | Purpose inferred from directory name; contents not read. | — `docs/storage-review-downloads.md:53`
7. `G` **Unique-content and backup gate unresolved.** — | Photos 2.zip | 3.40 GiB | archives/shares | high | KEEP | Archive extension; unique contents and backup status unknown. | — `docs/storage-review-downloads.md:54`
8. `G` **Owner and data-retention decision pending.** — | vm-export-data | 2.65 GiB | source/tools | medium | REVIEW | Purpose inferred from directory name; contents not read. | — `docs/storage-review-downloads.md:55`
9. `G` **Unique-content and backup gate unresolved.** — | Downloads.zip | 1.72 GiB | archives/shares | high | KEEP | Archive extension; unique contents and backup status unknown. | — `docs/storage-review-downloads.md:56`
10. `G` **Unique-content and backup gate unresolved.** — | tmp.zip | 1.38 GiB | archives/shares | high | KEEP | Archive extension; unique contents and backup status unknown. | — `docs/storage-review-downloads.md:57`
11. `G` **Unique-content and backup gate unresolved.** — | Projects.zip | 914.98 MiB | archives/shares | high | KEEP | Archive extension; unique contents and backup status unknown. | — `docs/storage-review-downloads.md:58`
12. `G` **Original-data retention decision pending.** — | web_valley_forums | 796.87 MiB | source/tools | medium | REVIEW | Source/tool/data artifact inferred from name or extension; may be project output or original data. | — `docs/storage-review-downloads.md:59`
13. `G` **Owner preservation decision pending.** — | מסמכים | 782.31 MiB | study/documents | medium | KEEP | Purpose inferred from directory name; contents not read. | — `docs/storage-review-downloads.md:60`
14. `G` **Original-work preservation decision pending.** — | smplx_blender_addon_20230921.zip | 699.41 MiB | CAD/3D-print assets | medium | KEEP | CAD/electronics/3D-print purpose inferred from name or extension; may be original work. | — `docs/storage-review-downloads.md:61`
15. `G` **Owner preservation decision pending.** — | Steinberg | 691.35 MiB | media/photos/assets | medium | KEEP | Purpose inferred from directory name; contents not read. | — `docs/storage-review-downloads.md:62`
16. `G` **Installation and duplicate review pending.** — | ChatGPT (1).dmg | 622.93 MiB | installers | high | REVIEW | Installer/package/app bundle inferred from extension; installation status not established. Duplicate/related names are unverified; no … — `docs/storage-review-downloads.md:63`
17. `G` **Original-data retention decision pending.** — | connect_device_node | 570.50 MiB | source/tools | medium | REVIEW | Source/tool/data artifact inferred from name or extension; may be project output or original data. | — `docs/storage-review-downloads.md:64`
18. `G` **Original-data retention decision pending.** — | lumi_connection_kit | 570.47 MiB | source/tools | medium | REVIEW | Source/tool/data artifact inferred from name or extension; may be project output or original data. | — `docs/storage-review-downloads.md:65`
19. `G` **Installer need and deletion permission pending.** — | Docker.dmg | 555.45 MiB | installers | high | REVIEW | Installer/package/app bundle inferred from extension; installation status not established. | — `docs/storage-review-downloads.md:66`
20. `G` **Purpose and owner disposition unresolved.** — | Desktop | 501.99 MiB | unknown | low | REVIEW | Name provides insufficient purpose evidence; inspect personally before deciding. | — `docs/storage-review-downloads.md:67`
21. `G` **Uninstalled status does not grant installer-deletion permission.** — | Nimbalyst-macOS-arm64.dmg | 463.18 MiB | installers | high | DELETE-CANDIDATE | User states Nimbalyst is already uninstalled; obsolete installer candidate, not application/user data. | — `docs/storage-review-downloads.md:68`
22. `G` **Personal-data preservation decision pending.** — | WhatsApp Chat with Mom | 408.83 MiB | archives/shares | medium | KEEP | Purpose inferred from directory name; contents not read. | — `docs/storage-review-downloads.md:69`
23. `G` **Personal-data preservation decision pending.** — | Documents | 266.92 MiB | study/documents | medium | KEEP | Purpose inferred from directory name; contents not read. | — `docs/storage-review-downloads.md:70`
24. `G` **Installer need and deletion permission pending.** — | Anytype-0.56.5-mac-arm64.dmg | 261.50 MiB | installers | high | REVIEW | Installer/package/app bundle inferred from extension; installation status not established. | — `docs/storage-review-downloads.md:71`
25. `G` **Installation and duplicate review pending.** — | Bambu_Studio_mac-v02.06.01.55-20260428201229.dmg | 260.11 MiB | installers | high | REVIEW | Installer/package/app bundle inferred from extension; installation status not established. … — `docs/storage-review-downloads.md:72`
26. `G` **Installation and duplicate review pending.** — | Bambu_Studio_mac-v02.06.00.51.dmg | 258.83 MiB | installers | high | REVIEW | Installer/package/app bundle inferred from extension; installation status not established. Duplicate/related names are … — `docs/storage-review-downloads.md:73`
27. `G` **Installation and deletion permission pending.** — | agent-orchestrator-darwin-arm64.dmg | 229.28 MiB | installers | high | REVIEW | Installer; installation status explicitly unclear. Review before deleting. | — `docs/storage-review-downloads.md:74`
28. `G` **Installation and duplicate review pending.** — | ChatGPT_Atlas.dmg | 221.52 MiB | installers | high | REVIEW | Installer/package/app bundle inferred from extension; installation status not established. Duplicate/related names are unverified; no … — `docs/storage-review-downloads.md:75`
29. `G` **Installer need and deletion permission pending.** — | UltiMaker-Cura-5.7.0-macos-ARM64.dmg | 213.79 MiB | installers | high | REVIEW | Installer/package/app bundle inferred from extension; installation status not established. | — `docs/storage-review-downloads.md:76`
30. `G` **Installer need and deletion permission pending.** — | pgadmin4-8.6-arm64.dmg | 210.25 MiB | installers | high | REVIEW | Installer/package/app bundle inferred from extension; installation status not established. | — `docs/storage-review-downloads.md:77`
31. `G` **Unique-content and backup gate unresolved.** — | Documents.zip | 205.83 MiB | archives/shares | high | KEEP | Archive extension; unique contents and backup status unknown. | — `docs/storage-review-downloads.md:78`
32. `G` **Ownership, backup and duplicate-verification gate unresolved.** — - **Preserve photos, Characters assets, MyAirBridge shares and all archives** until their ownership, unique contents and independent backup have been verified. Characters / Characters-Copy is an … — `docs/storage-review-downloads.md:294`
33. `G` **Personal-data disposition and classification require owner confirmation.** — - **Preserve study, family/legal documents and correspondence.** Suggested label: documents-study or documents-personal-legal after the owner confirms purpose. Extension-based grouping does not … — `docs/storage-review-downloads.md:295`
34. `P` **Installer deletion recommendation is not explicit permission.** — - **Nimbalyst DMG: DELETE-CANDIDATE**, based on the supplied fact that Nimbalyst is already uninstalled. This applies only to the installer. — `docs/storage-review-downloads.md:296`
35. `G` **Installer and working-app safety review remains unresolved.** — - **agent-orchestrator DMG: REVIEW**; installation unclear. Other DMGs/packages/app bundles are also REVIEW: confirm installed version, need for offline reinstall and ownership before deletion. App … — `docs/storage-review-downloads.md:297`
36. `G` **Duplicate status cannot justify removal without verification.** — - **Related installer names:** Bambu Studio versions, ChatGPT variants and numbered copies may be obsolete, but are not proven duplicates. No hashing or byte comparison was performed. — `docs/storage-review-downloads.md:298`
37. `G` **Owner and unique-content review remains unresolved.** — - **Source/tools, logs/reports and unknown items: REVIEW.** Folder names such as dist or tmp do not prove disposability; project originals, debugging evidence or exports may be unique. — `docs/storage-review-downloads.md:299`
38. `G` **Credential preservation and publication privacy gate remains unresolved.** — - **Credentials/config: KEEP, private review.** Certificate/key/VPN suffixes suggest sensitive configuration. Do not share this manifest publicly without checking its filenames. — `docs/storage-review-downloads.md:300`

## G8 · GVM package-set storage review

**Document:** `docs/storage-review-gvm.md` · **24 statements** — 4 P · 20 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ _no owning contract — retire, or escalate as a new decision_** — 24 statement(s)

1. `P` **Historical cleanup recommendation requires owner permission and satisfied cache gates.** — **Keep the active/default `go1.27.0/global` set. Review older sets, then conditionally clean their module caches rather than deleting entire sets.** The older sets contain 33,233,829,888 allocated … — `docs/storage-review-gvm.md:21`
2. `G` **Binary migration and consumer review remain unresolved.** — **Keep the active/default `go1.27.0/global` set. Review older sets, then conditionally clean their module caches rather than deleting entire sets.** The older sets contain 33,233,829,888 allocated … — `docs/storage-review-gvm.md:21`
3. `G` **Binary preservation and cache cleanup gates unresolved by this review.** — | go1.24.2 | 8,351,424,512 (7.78 GiB) | 8,185,221,120 (7.62 GiB) | REVIEW binaries; CONDITIONAL-CLEANUP cache | — `docs/storage-review-gvm.md:41`
4. `G` **Binary preservation and cache cleanup gates unresolved by this review.** — | go1.24.7 | 6,745,788,416 (6.28 GiB) | 6,656,856,064 (6.20 GiB) | REVIEW binaries; CONDITIONAL-CLEANUP cache | — `docs/storage-review-gvm.md:42`
5. `G` **Host active-toolchain preservation gate, not this product runtime requirement.** — | go1.27.0 | 6,206,631,936 (5.78 GiB) | 5,960,273,920 (5.55 GiB) | KEEP: active/default and current repositories require it | — `docs/storage-review-gvm.md:43`
6. `G` **Compatibility and cache cleanup gates unresolved.** — | go1.25.0 | 5,740,728,320 (5.35 GiB) | 5,664,579,584 (5.28 GiB) | REVIEW: project minimum matches; CONDITIONAL-CLEANUP cache | — `docs/storage-review-gvm.md:44`
7. `G` **Binary preservation and cache cleanup gates unresolved.** — | go1.26.0 | 4,471,681,024 (4.16 GiB) | 4,394,328,064 (4.09 GiB) | REVIEW binaries; CONDITIONAL-CLEANUP cache | — `docs/storage-review-gvm.md:45`
8. `G` **Compatibility and cache cleanup gates unresolved.** — | go1.23.1 | 2,392,825,856 (2.23 GiB) | 2,392,825,856 (2.23 GiB) | REVIEW: project minimum matches; CONDITIONAL-CLEANUP cache | — `docs/storage-review-gvm.md:46`
9. `G` **Cache cleanup conditions require separate authorization.** — | go1.23.6 | 2,021,732,352 (1.88 GiB) | 2,021,732,352 (1.88 GiB) | CONDITIONAL-CLEANUP cache | — `docs/storage-review-gvm.md:47`
10. `G` **Cache cleanup conditions require separate authorization.** — | go1.22.4 | 1,863,270,400 (1.74 GiB) | 1,863,270,400 (1.74 GiB) | CONDITIONAL-CLEANUP cache | — `docs/storage-review-gvm.md:48`
11. `G` **Compatibility and cache cleanup gates unresolved.** — | go1.22 | 918,159,360 (875.62 MiB) | 918,159,360 (875.62 MiB) | REVIEW older compatibility needs; CONDITIONAL-CLEANUP cache | — `docs/storage-review-gvm.md:49`
12. `G` **Compatibility and cache cleanup gates unresolved.** — | go1.21 | 820,297,728 (782.30 MiB) | 820,297,728 (782.30 MiB) | REVIEW: project minimum matches; CONDITIONAL-CLEANUP cache | — `docs/storage-review-gvm.md:50`
13. `G` **Cache cleanup conditions require separate authorization.** — | go1.24 | 316,559,360 (301.89 MiB) | 316,559,360 (301.89 MiB) | CONDITIONAL-CLEANUP cache | — `docs/storage-review-gvm.md:51`
14. `P` **Host preservation recommendation has no product-core disposition.** — | system | 0 (0 B) | 0 (0 B) | KEEP: no storage benefit from removal | — `docs/storage-review-gvm.md:52`
15. `G` **Cache-local edits, dependency recovery, offline needs and active consumers are unsatisfied cleanup gates.** — “Conditional” means no local edits to cached source need preservation, private/public dependencies remain obtainable, offline operation is not required, and no concurrent Go build/install depends on … — `docs/storage-review-gvm.md:54`
16. `G` **Compiler compatibility and private-module recovery gates remain unresolved.** — A `go` directive is a minimum version; a `toolchain` directive suggests a toolchain rather than pinning an exact exclusive version. The active 1.27.0 satisfies these declared minimums. This does … — `docs/storage-review-gvm.md:121`
17. `G` **External local-replacement preservation gate requires owner review.** — A `go` directive is a minimum version; a `toolchain` directive suggests a toolchain rather than pinning an exact exclusive version. The active 1.27.0 satisfies these declared minimums. This does … — `docs/storage-review-gvm.md:121`
18. `G` **Binary provenance, consumers and retirement permission remain unresolved.** — The `go1.24.2` set additionally holds `staticcheck`, `wire`, `gomodifytags`, `goimports`, `mockgen`, and `gotests`, which are absent from the active set's `bin`. `go1.24.7` also has `gotests`. Their … — `docs/storage-review-gvm.md:127`
19. `G` **Existing initialized-shell prerequisite remains a safety boundary for any later authorized inspection.** — Read-only GVM commands, in an existing shell where GVM is already initialized: — `docs/storage-review-gvm.md:131`
20. `P` **Targeted cleanup recommendation remains conditional on unverified safety gates.** — The Go tool's own `go help clean` confirms that `-modcache` removes the entire module cache, **including unpacked dependency source**. After satisfying the cleanup conditions above, the largest old … — `docs/storage-review-gvm.md:139`
21. `P` **Destructive host command example needs explicit target authorization and satisfied cache-preservation conditions.** — ``` — `docs/storage-review-gvm.md:147`
22. `G` **Recovery access and concurrent-use safety conditions remain unresolved.** — This targets **8,185,221,120 bytes (7.62 GiB)** of allocated cache attribution. It also removes that cache's downloaded toolchains; reacquisition may require private-repository credentials/network … — `docs/storage-review-gvm.md:149`
23. `G` **Per-cache removal still requires separate review and permission.** — This targets **8,185,221,120 bytes (7.62 GiB)** of allocated cache attribution. It also removes that cache's downloaded toolchains; reacquisition may require private-repository credentials/network … — `docs/storage-review-gvm.md:149`
24. `G` **Whole-set deletion safety and installed behavior remain unverified.** — Upstream GVM documents `gvm pkgset delete <name>` and implements `gvm uninstall <version>`. Whole-set deletion also removes binaries and custom content; it is not recommended here. Upstream uninstall … — `docs/storage-review-gvm.md:151`

## G9 · Projects storage map

**Document:** `docs/storage-review-projects.md` · **10 statements** — 0 P · 10 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ _no owning contract — retire, or escalate as a new decision_** — 10 statement(s)

1. `G` **Generated-name safety and rebuildability remain unresolved.** — Classification is based solely on directory names, not contents or rebuildability. Generated candidates include `node_modules`, `.venv`, `venv`, `env`, `.env`, `dist`, `build`, `.next`, `.nuxt`, … — `docs/storage-review-projects.md:35`
2. `G` **Host Git-history preservation gate awaits owner disposition.** — Classification is based solely on directory names, not contents or rebuildability. Generated candidates include `node_modules`, `.venv`, `venv`, `env`, `.env`, `dist`, `build`, `.next`, `.nuxt`, … — `docs/storage-review-projects.md:35`
3. `G` **Worktree identity, uncommitted work and removal permission remain unresolved.** — All size columns are **MiB** (1,048,576 bytes), rounded to three decimals. Files counts exclude symlinks. `†` means **preserve**: a Git-pointer file was found somewhere underneath, or the directory … — `docs/storage-review-projects.md:41`
4. `G` **Unknown state and Git preservation gate awaits owner review.** — | `ruflo` | `v3` **1,586.0**; `.git` **497.9**; `.gitnexus` **247.4**; `v2` **145.7**; `ruflo` **9.7** | `v3` is overwhelmingly conventional generated storage: about **1,551.4 MiB**. `.gitnexus` and … — `docs/storage-review-projects.md:113`
5. `G` **Checkpoint preservation disposition remains owner-specific, sizes are historical.** — | `summarizer` | `checkpoints` **2,203.1**; `data` **0.789**; `__pycache__` **0.023** | Checkpoints account for almost the entire folder and are retained as assets/user data. These are its three … — `docs/storage-review-projects.md:114`
6. `G` **Worktree and submodule preservation gate unresolved.** — | `Lumi` † | `flutter_app` **650.5**; `esp32-rainmaker` **363.5**; `webserver` **315.8**; `esp32-idf` **225.1**; `esp32-idf2` **184.3** | Generated estimates within these: about **583.3**, **360.4**, … — `docs/storage-review-projects.md:115`
7. `G` **Unknown state and nested worktree preservation require owner review.** — | `Backlog.md` | `node_modules` **682.2**; `.backlog` **593.0**; `.git` **97.8**; `dist` **71.7**; `.opencode` **61.3** | Dependencies and compiled output dominate the generated category. `.backlog` … — `docs/storage-review-projects.md:116`
8. `G` **Host Git preservation gate awaits owner disposition.** — | `gemini` | `web` **301.8**; `.venv` **270.8**; `node_modules` **145.0**; `mobile` **128.9**; `.git` **102.1** | `web` and `mobile` contain about **294.6** and **119.8 MiB** of generated … — `docs/storage-review-projects.md:118`
9. `G` **Worktree data and uncommitted-work preservation require owner review.** — | `gemini-ui-component-system` † | `web` **456.3**; `mobile` **134.8**; `data` **12.3**; `server` **1.5**; `tests` **0.570** | Generated descendants dominate `web` (**441.3 MiB**) and `mobile` … — `docs/storage-review-projects.md:119`
10. `G` **Host worktree preservation and removal-safety gates remain unresolved.** — **Preserve all agent/worktree directories and their working files.** The marked `gemini-*` folders, `gemini-worktrees`, agent-named folders, and potential nested worktrees/submodules may hold … — `docs/storage-review-projects.md:126`

## G10 · Session storage and retention review

**Document:** `docs/storage-review-sessions.md` · **30 statements** — 8 P · 22 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ _no owning contract — retire, or escalate as a new decision_** — 24 statement(s)

1. `G` **Original-preservation gate awaits an approved archival policy.** — Use native context compaction for inexpensive continuation, and a separate lossless archive plus searchable summaries for durable exact retrieval. Do not replace originals with summaries. A lossy … — `docs/storage-review-sessions.md:21`
2. `G` **Retain consistent-snapshot prerequisite for any separately authorized provider-store audit.** — **The personal main database changed during the queries. SQLite explicitly warns that immutable mode against a changing file can yield incorrect results. Its aggregates are therefore provisional … — `docs/storage-review-sessions.md:44`
3. `P` **Custom persistence must be resolved before applying archival or cleanup recommendations.** — OpenCode source was verified at the official `v1.19.0` tag. The personal database includes additional session/instruction tables absent from the default store; the version string alone does not prove … — `docs/storage-review-sessions.md:60`
4. `G` **VM persistence and deletion safety remain unknown.** — - Desktop `vm_bundles`: **10,996,469,760 bytes (10.24 GiB)**, including `claudevm.bundle/rootfs.img`: **10,737,418,240 bytes (10 GiB)**. The image is potential persistent VM data, not established as … — `docs/storage-review-sessions.md:77`
5. `G` **Unknown record ownership cannot authorize retention changes.** — - `~/.claude/homunculus`: **49,782,784 bytes**, including 82 JSONL files allocating **49,668,096 bytes**. Ownership/record purpose is unknown; not classified as native conversation storage. — `docs/storage-review-sessions.md:81`
6. `G` **Complete dependency coverage remains a prerequisite to approving exact archival.** — Official storage docs identify JSONL transcripts, subagent transcripts, spilled tool outputs, checkpoints, uploads and other dependencies. After v2.1.274, some attached/pasted images live under a … — `docs/storage-review-sessions.md:148`
7. `G` **Actual host retention policy must be established before changing it.** — The current documented `cleanupPeriodDays` default is 30; `0` fails validation rather than disabling cleanup. Desktop/Cowork-origin transcripts have separate retention behavior in newer versions. No … — `docs/storage-review-sessions.md:150`
8. `P` **Installed-version and account applicability remain unresolved for any proposed restore workflow.** — Claude account data export includes account/chat data, but personal-account import/migration is not supported. It is not evidence of VM/runtime restoration. Current Cowork documentation describes the … — `docs/storage-review-sessions.md:152`
9. `G` **Retention option includes an unresolved original-preservation requirement.** — | Native context compaction | Originals must remain separately retained | Supported continuation; omitted facts absent from context | Reduces tokens, not demonstrated storage; summary may add bytes | — `docs/storage-review-sessions.md:160`
10. `P` **Proposed archival option needs completeness and restoration acceptance.** — | Native transcript export + zstd + summary index | Exact for exported bytes only; referenced external files require separate capture | OpenCode import is available but partial-state; Claude text … — `docs/storage-review-sessions.md:162`
11. `P` **Full-state archival option is unapproved and restore coverage remains unresolved.** — | Quiescent full-state archive + zstd + summary index | Strongest for all deliberately included bytes | Must test restoration with compatible app/profile/version and dependencies | More planning, … — `docs/storage-review-sessions.md:163`
12. `G` **Compression trial and resource settings await authorization.** — Zstandard 1.5.7 is already installed. Its documented compression is lossless; `zstd -t` verifies compressed-stream integrity without creating decompressed files, and originals are kept by default … — `docs/storage-review-sessions.md:165`
13. `G` **Maintenance safety budget and authorization must be established, old free-space figures are insufficient.** — SQLite deletion ordinarily leaves reusable free pages without shrinking the file. VACUUM is a separate rebuild and may need free space up to twice the original database size. With the user-supplied … — `docs/storage-review-sessions.md:167`
14. `P` **Proposed host retention workflow awaits approval.** — 1. Keep active sessions in their native stores. Use native compaction for context cost, not storage retention. — `docs/storage-review-sessions.md:171`
15. `G` **Cold-retention and profile identity policy remain undecided.** — 2. Define cold retention by actual last session update, separately per profile. Do not use DB file mtime or assume the two OpenCode stores are duplicates. — `docs/storage-review-sessions.md:172`
16. `G` **Archival scope and completeness gate await approval.** — 3. Preserve unsanitized originals and required attachments, subagents, spilled outputs, snapshots, instruction/session state, plus a version/schema/path manifest. Keep credentials out of general … — `docs/storage-review-sessions.md:173`
17. `G` **Credential archival privacy and recovery policy requires a decision.** — 3. Preserve unsanitized originals and required attachments, subagents, spilled outputs, snapshots, instruction/session state, plus a version/schema/path manifest. Keep credentials out of general … — `docs/storage-review-sessions.md:173`
18. `G` **Consistent-snapshot mechanism must be authorized and validated.** — 3. Preserve unsanitized originals and required attachments, subagents, spilled outputs, snapshots, instruction/session state, plus a version/schema/path manifest. Keep credentials out of general … — `docs/storage-review-sessions.md:173`
19. `G` **Lossless archival and integrity gate await workflow approval.** — 4. Compress the preservation package losslessly with the installed zstd. Retain originals until archive integrity and restored-file hashes pass. For disk savings, subsequent removal or relocation … — `docs/storage-review-sessions.md:174`
20. `G` **Removal and relocation permission remain separate unresolved gates.** — 4. Compress the preservation package losslessly with the installed zstd. Retain originals until archive integrity and restored-file hashes pass. For disk savings, subsequent removal or relocation … — `docs/storage-review-sessions.md:174`
21. `G` **Optional indexing cost and privacy tradeoff has no approved disposition.** — 5. Add small searchable summaries and an index mapping app/profile/session/time to archive member, exact transcript location and attachment references. Treat summaries as navigation hints: retrieve … — `docs/storage-review-sessions.md:175`
22. `G` **Local-versus-remote summarization privacy decision remains open.** — 7. Choose summarization privacy deliberately. A local model avoids sending content to an external API but requires local resources and does not eliminate lossy omissions. A remote summarizer/native … — `docs/storage-review-sessions.md:177`
23. `P` **Tool-selection and retention recommendations await owner approval.** — No third-party session-cleaner package is recommended: native exports plus the already installed lossless compressor are the smallest verified foundation. Persistent DB trimming is the poorest fit … — `docs/storage-review-sessions.md:179`
24. `G` **Accounting and restore safety gates remain unsatisfied.** — No third-party session-cleaner package is recommended: native exports plus the already installed lossless compressor are the smallest verified foundation. Persistent DB trimming is the poorest fit … — `docs/storage-review-sessions.md:179`

**→ `docs/PRODUCT.md#non-goals`** — 2 statement(s)

1. `P` **External-store archival proposal is not an approved product feature or host retention change.** — Use native context compaction for inexpensive continuation, and a separate lossless archive plus searchable summaries for durable exact retrieval. Do not replace originals with summaries. A lossy … — `docs/storage-review-sessions.md:21`
2. `P` **Host retrieval-index proposal is not approved durable product scope.** — 5. Add small searchable summaries and an index mapping app/profile/session/time to archive member, exact transcript location and attachment references. Treat summaries as navigation hints: retrieve … — `docs/storage-review-sessions.md:175`

**→ `docs/specs/sessions.md#stop-and-resume-a-session`** — 2 statement(s)

1. `G` **Product exact conversation resume does not approve byte-exact external archive acceptance criteria.** — Use native context compaction for inexpensive continuation, and a separate lossless archive plus searchable summaries for durable exact retrieval. Do not replace originals with summaries. A lossy … — `docs/storage-review-sessions.md:21`
2. `G` **External archive restoration gate exceeds the approved same-conversation resume contract.** — 6. Test native resume in an isolated compatible profile before claiming it works: verify IDs/relationships, attachment resolution, tool-output access, checkpoints, custom instruction state, and … — `docs/storage-review-sessions.md:176`

**→ `docs/specs/sessions.md#deleting-a-session`** — 2 statement(s)

1. `G` **External dependency preservation and provider-file removal scope remain unresolved.** — Other personal OpenCode storage: `tool-output` **159,801,344 bytes**; `snapshot` **22,515,712 bytes**; legacy `storage` **15,790,080 bytes**. These may be dependencies of exact retrieval/revert; they … — `docs/storage-review-sessions.md:105`
2. `G` **Provider-history deletion and preservation conditions require explicit policy and permission.** — | Delete/trim persistent DB history | No, unless complete originals already preserved elsewhere | Can break links, replay, migration state and custom tables | Destructive; freed pages normally remain … — `docs/storage-review-sessions.md:161`

## G11 · Zesty allocated-storage map

**Document:** `docs/storage-review-zesty.md` · **19 statements** — 0 P · 19 G

**What this group is:** every statement in this document that no contract currently owns and no owner has decided. Statements are listed under the contract section each would be folded into.

**Decision:** `[ ] Discard all` · `[ ] Approve all` · `[ ] Select individually` · `[ ] Narrow: ______`

**→ _no owning contract — retire, or escalate as a new decision_** — 19 statement(s)

1. `G` **Host business-data preservation gate awaits owner disposition.** — - Business/work project files, source, assets, data, and Git history must be preserved. Review categories below are investigative leads, not deletion authority. — `docs/storage-review-zesty.md:26`
2. `G` **Preserve host business material pending owner review.** — Directories include their own entry in the recursive directory count. Small nonzero sizes may round to 0.0000 GiB; the byte column is authoritative. All entries are preserve-pending-review … — `docs/storage-review-zesty.md:40`
3. `G` **Business-data preservation gate awaits owner review.** — Legend: **P** = project/source/assets/business data or unknown, preserve; **D** = installed dependencies, review reproducibility; **V** = possible Python environment, confirm role; **C** = possible … — `docs/storage-review-zesty.md:105`
4. `G` **Dependency reproducibility gate unresolved.** — Legend: **P** = project/source/assets/business data or unknown, preserve; **D** = installed dependencies, review reproducibility; **V** = possible Python environment, confirm role; **C** = possible … — `docs/storage-review-zesty.md:105`
5. `G` **Environment role requires owner confirmation.** — Legend: **P** = project/source/assets/business data or unknown, preserve; **D** = installed dependencies, review reproducibility; **V** = possible Python environment, confirm role; **C** = possible … — `docs/storage-review-zesty.md:105`
6. `G` **Generated-output classification requires confirmation.** — Legend: **P** = project/source/assets/business data or unknown, preserve; **D** = installed dependencies, review reproducibility; **V** = possible Python environment, confirm role; **C** = possible … — `docs/storage-review-zesty.md:105`
7. `G` **Host history preservation gate awaits owner disposition.** — Legend: **P** = project/source/assets/business data or unknown, preserve; **D** = installed dependencies, review reproducibility; **V** = possible Python environment, confirm role; **C** = possible … — `docs/storage-review-zesty.md:105`
8. `G` **Cache role and removal safety require confirmation.** — | dashboard | .angular | 1.2418 | C — likely framework output/cache; confirm | — `docs/storage-review-zesty.md:114`
9. `G` **Tool-state preservation depends on unresolved ownership review.** — | pod-rightsizing | .opencode | 0.0598 | P — tooling/project state; not assumed cache | — `docs/storage-review-zesty.md:132`
10. `G` **Service-data preservation gate requires owner disposition.** — | ebs-autoscaler | localstack | 0.0252 | P — possible local service data, preserve | — `docs/storage-review-zesty.md:136`
11. `G` **Binary provenance and preservation needs remain unknown.** — | ezswitch-controller | bin | 0.2392 | P — binaries/tooling; provenance unknown | — `docs/storage-review-zesty.md:150`
12. `G` **Required-artifact status must be resolved before cleanup.** — | ezswitch-controller | build | 0.1308 | C — may contain required artifacts | — `docs/storage-review-zesty.md:151`
13. `G` **Reproducibility and offline-use safety gates unresolved.** — 1. **Installed JavaScript dependencies:** `dashboard/node_modules` and `zesty-fed/node_modules` are substantial named examples. Across the tree, 16 outermost directories named `node_modules` account … — `docs/storage-review-zesty.md:162`
14. `G` **Environment reproducibility and ownership review unresolved.** — 2. **Python environments:** named `.venv`, `venv`, or `env` directories account for approximately **4.7129 GiB of per-path allocation** across 17 outermost matches; this exact-name group excludes … — `docs/storage-review-zesty.md:163`
15. `G` **Artifact-regeneration and ownership gates unresolved.** — 3. **Possible build/cache output:** `dashboard/.angular` (1.2418 GiB), `ezswitch-controller/build` (0.1308 GiB), root `build` (0.0590 GiB), `.pytest_cache`, and `__pycache__` are name-based leads. … — `docs/storage-review-zesty.md:164`
16. `G` **Host business-data preservation and purpose require owner review.** — 4. **Source/assets/business data:** retain project trees including `zesty-k8s` services, `automation/src`, `zesty-fed/apps`, tests, models, data, and configuration. A large service folder may mix … — `docs/storage-review-zesty.md:165`
17. `G` **Local-history preservation gate awaits owner disposition.** — 5. **Git history and metadata:** 31 outermost `.git` directories account for approximately **2.1553 GiB of per-path allocation**. They preserve history and potentially local-only objects; they are … — `docs/storage-review-zesty.md:166`
18. `G` **Worktree removal permission and duplicate status unresolved.** — 5. **Git history and metadata:** 31 outermost `.git` directories account for approximately **2.1553 GiB of per-path allocation**. They preserve history and potentially local-only objects; they are … — `docs/storage-review-zesty.md:166`
19. `G` **Cleanup prerequisites require an owner-led review not supplied by the inventory.** — Category totals can overlap (for example generated output inside dependencies) and use per-path rather than unique-block accounting. Do not add them together or treat them as reclaimable space. No … — `docs/storage-review-zesty.md:168`
