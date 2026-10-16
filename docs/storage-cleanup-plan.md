---
consolidation:
  total: 38
  counts:
    exists: 0
    discard: 9
    integrate: 0
    unconfirmed: 29
  percentages:
    exists: 0.00%
    discard: 23.68%
    integrate: 0.00%
    unconfirmed: 76.32%
---
# Storage cleanup plan — consolidated
> **Non-authoritative supporting material.** This file is not a contract. Authoritative owner(s): [docs/PRODUCT.md](PRODUCT.md), [docs/specs/sessions.md](specs/sessions.md), [docs/BLUEPRINT.md](BLUEPRINT.md).
> Disposition: Mixed — see markers.

Synthesized from the per-area reviews in this directory. Sizes are allocated space (**not** guaranteed reclaimable; APFS clones and sparse files mean actual recovery differs). Ordered by size within each section. <!-- consolidation: discard; ref: none; reason: Historical host accounting convention, not product storage behavior. -->

## Already done

| Action | Space |
|---|---:|
| Go orphaned module caches (`go clean -modcache`, 10 sets) | ~31 GiB <!-- consolidation: discard; ref: none; reason: Historical completed host cleanup. --> |
| Docker build cache + unreferenced images | ~22.7 GB <!-- consolidation: discard; ref: none; reason: Historical completed host cleanup. --> |
| Paca stack (10 containers, 10 volumes, 5 images) + files | small <!-- consolidation: discard; ref: none; reason: Historical cleanup summary, with container count differing from the Docker review. --> |
| **Host free space** | **14 GiB → 76 GiB** <!-- consolidation: discard; ref: none; reason: Historical host measurement. --> |

## Remaining, largest first

| # | Target | Size | Action | Risk / notes |
|---:|---|---:|---|---|
| 1 | `~/Downloads` | 64.27 GiB | Review, not bulk-delete | Mostly personal: shares, photos, study material. See `storage-review-downloads.md`. <!-- consolidation: unconfirmed; ref: none; reason: Host-specific preservation gate requires owner review, historical size is not deletion authority. --> |
| 2 | Autodesk Fusion deploys (`~/Library/Application Support/Autodesk/webdeploy/production/*`) | 28.47 GiB | REVIEW | Three deployments. Identify active/rollback version via Autodesk first. <!-- consolidation: unconfirmed; ref: none; reason: Active deployment and rollback needs remain unresolved. --> |
| 3 | `~/Projects` generated dirs (`node_modules`, venv, build) | ~10.7 GiB | REVIEW per project | Source (4.9 GiB) and `.git` (1.1 GiB) preserve. <!-- consolidation: unconfirmed; ref: none; reason: Per-project ownership and reproducibility require a decision before cleanup. --> |
| 4 | `~/Zesty` deps/build | several GiB | REVIEW per project | Business/project data — preserve. <!-- consolidation: unconfirmed; ref: none; reason: Business-data preservation and cleanup permission remain owner-specific. --> |
| 5 | `~/Library/Application Support/Claude/vm_bundles` | 10 GiB | LEAVE unless retiring | `rootfs.img`; persistence unverified; not a cache. <!-- consolidation: unconfirmed; ref: none; reason: VM persistence and retirement authorization are not established. --> |
| 6 | `~/Documents` | 7.09 GiB | KEEP | Personal. <!-- consolidation: unconfirmed; ref: none; reason: Retain host personal-data preservation gate pending owner disposition. --> |
| 7 | `~/tmp` | 6.17 GiB | REVIEW contents | Name alone doesn't make it disposable. <!-- consolidation: unconfirmed; ref: none; reason: Ownership and disposability remain unknown. --> |
| 8 | `~/.local` (`share/opencode/opencode.db`) | 6.00 GiB | REVIEW | 3.10 GiB DB is session history — preserve. <!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#deleting-a-session; reason: External provider-store deletion scope and host retention permission are unresolved. --> |
| 9 | `~/.npm/_npx` + `_cacache` | 5.65 GiB | CLEANUP-CANDIDATE | Re-download cost; safe-ish. <!-- consolidation: unconfirmed; ref: none; reason: Cache removal recommendation lacks active-use and recovery approval. --> |
| 10 | `~/.opencode-personal/cache` | 1.91 GiB | CLEANUP-CANDIDATE | Tool cache. <!-- consolidation: unconfirmed; ref: none; reason: Cache classification alone does not authorize removal. --> |
| 11 | `~/.cache/pi-voice-stt` | 1.51 GiB | REVIEW | Speech model; blocks offline STT if removed. <!-- consolidation: unconfirmed; ref: none; reason: Offline-use requirements and removal permission remain unresolved. --> |
| 12 | `~/Library/Caches/Arc` + `company.thebrowser.Browser` | 2.5 GiB | CLEANUP-CANDIDATE | Browser caches; profiles are elsewhere. <!-- consolidation: unconfirmed; ref: none; reason: Host cache cleanup needs app-specific review and permission. --> |
| 13 | `~/.gradle/caches` + `wrapper` | 1.06 GiB | REVIEW | Offline/repro build impact. <!-- consolidation: unconfirmed; ref: none; reason: Build reproducibility and offline requirements remain unresolved. --> |
| 14 | `~/Library/Application Support/Code/CachedExtensionVSIXs` | 826 MiB | CLEANUP-CANDIDATE | Extension download cache only. <!-- consolidation: unconfirmed; ref: none; reason: Host cache cleanup permission remains unresolved. --> |
| 15 | Downloads installers: `Nimbalyst-macOS-arm64.dmg` | 463 MiB | DELETE | App already uninstalled. <!-- consolidation: unconfirmed; ref: none; reason: Uninstalled status does not establish permission to delete the installer. --> |
| 16 | `Downloads/agent-orchestrator-darwin-arm64.dmg` | 229 MiB | REVIEW | Confirm installed. <!-- consolidation: unconfirmed; ref: none; reason: Installation and archival needs remain unresolved. --> |
| 17 | Dangling anonymous Docker volumes | ~207 MB | `docker volume prune` | Unattached, unattributable; low value. <!-- consolidation: unconfirmed; ref: none; reason: Anonymous-volume amount conflicts with detailed named-volume evidence and data value is unverified. --> |
| 18 | `~/.gvm/pkgsets/*/bin` (old sets) | ~600 MiB | REVIEW | Bins now orphaned; toolchains not installed. <!-- consolidation: unconfirmed; ref: none; reason: Missing toolchains do not establish binary disuse or removal permission. --> |

## Keep — do not treat as cache

- All `.git` history, project source, `~/Documents`, `~/.backlog`, `~/.pi/agent`, `~/.local/share` DBs. <!-- consolidation: unconfirmed; ref: none; reason: Host preservation scope remains a safety gate pending owner disposition. -->
- Docker: `sintro-*`, `kwok-*`, `mobileye-vm_*` containers and `infra_*`, `mobileye-vm_*` volumes. <!-- consolidation: unconfirmed; ref: none; reason: Preserve workload-specific exclusions until retirement is explicitly decided. -->
- `Characters` vs `Characters-Copy` in Downloads: possible duplicate, **unverified**. <!-- consolidation: unconfirmed; ref: none; reason: Name similarity does not establish duplication or safe deletion. -->

## Session storage (Claude / OpenCode)

Sizes: `~/.opencode-personal/data` 12.54 GiB; `~/Library/Application Support/Claude` 10.74 GiB; `~/.local/share/opencode` 3.10 GiB DB. <!-- consolidation: discard; ref: none; reason: Historical host allocation comparison. -->

Key point: **the biggest allocations are not conversation text.** Claude's is a 10 GiB VM image; OpenCode's DBs contain large reusable free pages (6.14 GiB personal, 2.01 GiB default). <!-- consolidation: discard; ref: none; reason: Historical host interpretation, with provisional database accounting documented in the source review. -->

Recommended model — preserve exact, compact for context:

1. Native **compaction** reduces model context, not disk (it retains history). <!-- consolidation: discard; ref: none; reason: Version-specific external tool behavior, not an application retention contract. -->
2. Keep cold originals; **archive losslessly with `zstd`** (already installed) plus a small searchable summary that points into the archive. <!-- consolidation: unconfirmed; ref: docs/PRODUCT.md#non-goals; reason: Host archival proposal is not approved product scope or an authorized retention change. -->
3. Never replace originals with summaries — summaries lose exact wording, IDs, tool output, attachments. <!-- consolidation: unconfirmed; ref: none; reason: Exact host archival preservation gate awaits retention-policy approval. -->
4. SQLite deletion/`VACUUM` is separate: freed pages stay in-file; VACUUM can need space up to ~2× the DB. <!-- consolidation: discard; ref: none; reason: External SQLite maintenance facts, not product behavior. --> Deprioritize with limited free space. <!-- consolidation: unconfirmed; ref: none; reason: Maintenance timing and safe free-space budget require a separate decision. -->
5. Test resume in an isolated profile before removing anything. <!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#deleting-a-session; reason: External archive restore gate is not a settled provider-data deletion policy. -->

Full reasoning and sources: `storage-review-sessions.md`.

## Prerequisites before deleting

- Confirm each target's ownership and rebuild/re-download path. <!-- consolidation: unconfirmed; ref: none; reason: Retain host cleanup precondition pending target-specific authorization. -->
- Quit the owning app before cleaning its caches. <!-- consolidation: unconfirmed; ref: none; reason: Host app-quiescence gate needs target-specific validation. -->
- Prefer app-supported cleanup/prune over manual deletion. <!-- consolidation: unconfirmed; ref: none; reason: Cleanup mechanism recommendation awaits target-specific review. -->
- Re-measure host free space after cleanup; logical deletion may not release host blocks. <!-- consolidation: unconfirmed; ref: none; reason: Host reclamation acceptance check remains required if cleanup is authorized. -->
