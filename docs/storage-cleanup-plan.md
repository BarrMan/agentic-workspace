# Storage cleanup plan — consolidated

Synthesized from the per-area reviews in this directory. Sizes are allocated space (**not** guaranteed reclaimable; APFS clones and sparse files mean actual recovery differs). Ordered by size within each section.

## Already done

| Action | Space |
|---|---:|
| Go orphaned module caches (`go clean -modcache`, 10 sets) | ~31 GiB |
| Docker build cache + unreferenced images | ~22.7 GB |
| Paca stack (10 containers, 10 volumes, 5 images) + files | small |
| **Host free space** | **14 GiB → 76 GiB** |

## Remaining, largest first

| # | Target | Size | Action | Risk / notes |
|---:|---|---:|---|---|
| 1 | `~/Downloads` | 64.27 GiB | Review, not bulk-delete | Mostly personal: shares, photos, study material. See `storage-review-downloads.md`. |
| 2 | Autodesk Fusion deploys (`~/Library/Application Support/Autodesk/webdeploy/production/*`) | 28.47 GiB | REVIEW | Three deployments. Identify active/rollback version via Autodesk first. |
| 3 | `~/Projects` generated dirs (`node_modules`, venv, build) | ~10.7 GiB | REVIEW per project | Source (4.9 GiB) and `.git` (1.1 GiB) preserve. |
| 4 | `~/Zesty` deps/build | several GiB | REVIEW per project | Business/project data — preserve. |
| 5 | `~/Library/Application Support/Claude/vm_bundles` | 10 GiB | LEAVE unless retiring | `rootfs.img`; persistence unverified; not a cache. |
| 6 | `~/Documents` | 7.09 GiB | KEEP | Personal. |
| 7 | `~/tmp` | 6.17 GiB | REVIEW contents | Name alone doesn't make it disposable. |
| 8 | `~/.local` (`share/opencode/opencode.db`) | 6.00 GiB | REVIEW | 3.10 GiB DB is session history — preserve. |
| 9 | `~/.npm/_npx` + `_cacache` | 5.65 GiB | CLEANUP-CANDIDATE | Re-download cost; safe-ish. |
| 10 | `~/.opencode-personal/cache` | 1.91 GiB | CLEANUP-CANDIDATE | Tool cache. |
| 11 | `~/.cache/pi-voice-stt` | 1.51 GiB | REVIEW | Speech model; blocks offline STT if removed. |
| 12 | `~/Library/Caches/Arc` + `company.thebrowser.Browser` | 2.5 GiB | CLEANUP-CANDIDATE | Browser caches; profiles are elsewhere. |
| 13 | `~/.gradle/caches` + `wrapper` | 1.06 GiB | REVIEW | Offline/repro build impact. |
| 14 | `~/Library/Application Support/Code/CachedExtensionVSIXs` | 826 MiB | CLEANUP-CANDIDATE | Extension download cache only. |
| 15 | Downloads installers: `Nimbalyst-macOS-arm64.dmg` | 463 MiB | DELETE | App already uninstalled. |
| 16 | `Downloads/agent-orchestrator-darwin-arm64.dmg` | 229 MiB | REVIEW | Confirm installed. |
| 17 | Dangling anonymous Docker volumes | ~207 MB | `docker volume prune` | Unattached, unattributable; low value. |
| 18 | `~/.gvm/pkgsets/*/bin` (old sets) | ~600 MiB | REVIEW | Bins now orphaned; toolchains not installed. |

## Keep — do not treat as cache

- All `.git` history, project source, `~/Documents`, `~/.backlog`, `~/.pi/agent`, `~/.local/share` DBs.
- Docker: `sintro-*`, `kwok-*`, `mobileye-vm_*` containers and `infra_*`, `mobileye-vm_*` volumes.
- `Characters` vs `Characters-Copy` in Downloads: possible duplicate, **unverified**.

## Session storage (Claude / OpenCode)

Sizes: `~/.opencode-personal/data` 12.54 GiB; `~/Library/Application Support/Claude` 10.74 GiB; `~/.local/share/opencode` 3.10 GiB DB.

Key point: **the biggest allocations are not conversation text.** Claude's is a 10 GiB VM image; OpenCode's DBs contain large reusable free pages (6.14 GiB personal, 2.01 GiB default).

Recommended model — preserve exact, compact for context:

1. Native **compaction** reduces model context, not disk (it retains history).
2. Keep cold originals; **archive losslessly with `zstd`** (already installed) plus a small searchable summary that points into the archive.
3. Never replace originals with summaries — summaries lose exact wording, IDs, tool output, attachments.
4. SQLite deletion/`VACUUM` is separate: freed pages stay in-file; VACUUM can need space up to ~2× the DB. Deprioritize with limited free space.
5. Test resume in an isolated profile before removing anything.

Full reasoning and sources: `storage-review-sessions.md`.

## Prerequisites before deleting

- Confirm each target's ownership and rebuild/re-download path.
- Quit the owning app before cleaning its caches.
- Prefer app-supported cleanup/prune over manual deletion.
- Re-measure host free space after cleanup; logical deletion may not release host blocks.
