---
consolidation:
  total: 32
  counts:
    exists: 1
    discard: 25
    integrate: 0
    unconfirmed: 6
  percentages:
    exists: 3.13%
    discard: 78.13%
    integrate: 0.00%
    unconfirmed: 18.75%
---
# Disk growth investigation
> **Non-authoritative supporting material.** This file is not a contract. Authoritative owner(s): [docs/CONVENTIONS.md](CONVENTIONS.md), [docs/BLUEPRINT.md](BLUEPRINT.md).
> Disposition: Mixed — see markers.

Date: 2026-10-07. Symptom: the data volume filled to 100% (under 1 GB free) while working in this repo,
with growth of roughly 1 GB per 10 seconds at its worst. This document records what actually caused it,
what was reclaimed, and what now prevents recurrence. <!-- consolidation: discard; ref: none; reason: Dated incident symptom and narrative, not a durable performance guarantee. -->

## 1. Outcome

| | Available |
|---|---:|
| Before investigation | 772 MiB <!-- consolidation: discard; ref: none; reason: Historical host measurement. --> |
| After cleanup | 31 GiB <!-- consolidation: discard; ref: none; reason: Historical host measurement. --> |

Removed: 30.9 GB of leaked Mach-O dylibs, 5.3 GB of leaked terminal captures, one 199 MB stray build
artifact, 1.7 GB of package caches. <!-- consolidation: discard; ref: none; reason: Historical cleanup result. -->

## 2. Primary cause: Bun's native-addon extraction into `TMPDIR`

`bun build --compile` embeds native addons inside the produced executable. At process start Bun extracts
an embedded addon to `$TMPDIR/.<hex>-00000000.dylib` and removes it **only on a clean exit**. Any process
that is killed — timeout, SIGTERM/SIGKILL, tmux teardown, crash — leaves its ~5.5 MB copy behind forever. <!-- consolidation: discard; ref: none; reason: Incident-era Bun implementation explanation, not a timeless product contract. -->

Evidence gathered:

- The leaked files are Mach-O arm64 dylibs; `otool -D` on a sample reports `@rpath/libopentui.dylib`, and
  their strings are OpenTUI/Yoga node messages. So the embedded addon is OpenTUI's. <!-- consolidation: discard; ref: none; reason: Historical diagnostic attribution. -->
- 6,197 such files had accumulated since 2026-10-03, totalling **30.9 GB**. <!-- consolidation: discard; ref: none; reason: Historical diagnostic count. -->
- Measured growth while processes were spawning: **761 -> 788 files in 6 s** (~25 MB/s). <!-- consolidation: discard; ref: none; reason: Historical measured growth rate. -->
- `lsof` showed the open holders were `opencode` processes (10 PIDs), several launched by this app's own
  session launcher (`/bin/sh -c unset AGENTIC_WORKSPACE_CWD AGENTIC_WORKSPACE_TASK_ID ...`), one from the ink prototype. <!-- consolidation: discard; ref: none; reason: Historical process-holder evidence. -->

Why this app amplified it: the CLI is compiled with the OpenTUI addon embedded, and the test suite spawns
that compiled binary thousands of times per full run. Every spawn that is killed rather than exits cleanly
drops another copy. long-lived `opencode` sessions do the same on each start or restart. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#testing; reason: Historical amplification mechanism, current convention prefers source CLI tests. -->

## 3. Secondary causes

| Item | Size | Detail |
|---|---:|---|
| Ink-prototype terminal captures (`$TMPDIR/ink-agent-ink-proto-*-agent.raw`) | 5.3 GB | pipe-pane captures from `Projects/ink-agent-workspace-prototype`. 13 orphaned `cat` processes still held them open and kept growing them; deleting the files alone frees nothing while a writer holds the descriptor, so the 13 writers were terminated first (exact PIDs from `lsof`, no blanket kill) and then the files were removed. <!-- consolidation: discard; ref: none; reason: Historical capture cleanup and descriptor evidence, not current runtime state or standing process-termination permission. --> |
| Repo-root `.75ea373d6819e120-00000000.bun-build` | 199 MB | leftovers from an aborted `bun build`, untracked and unreferenced. <!-- consolidation: discard; ref: none; reason: Historical stray artifact inventory. --> |
| npm cache (`~/.npm/_cacache`), Bun install cache (`~/.bun/install/cache`) | 1.7 GB | regenerable caches. <!-- consolidation: discard; ref: none; reason: Historical cache inventory. --> |

## 4. Prevention

**In this repo:** `src/test/test-preload.ts` points each Bun test worker at a disposable OS-temp
directory via `TMPDIR`/`TMP`/`TEMP` and removes it after the suite. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#testing; reason: Shared preload owns run-scoped temp isolation and tests own resource cleanup. --> Every extraction a test spawn
performs now dies with the run instead of accumulating in the real temp directory. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#testing; reason: Absolute cleanup-on-every-exit assurance is not established for killed workers or failed teardown. -->

**For other Bun-based tools on this machine** (opencode among them) nothing in this repo can prevent the
extraction, because the leak is in how a killed process leaves its extraction behind. <!-- consolidation: discard; ref: none; reason: Historical external-tool leak explanation, outside repository ownership. --> Two mitigations:

```bash
# inspect
find "$TMPDIR" -maxdepth 1 -name '.*-00000000.dylib' | wc -l
find "$TMPDIR" -maxdepth 1 -name '.*-00000000.dylib' -exec du -sk {} + | awk '{s+=$1} END {print s/1024" MB"}'

# reclaim (safe: throwaway build extractions, not application state)
find "$TMPDIR" -maxdepth 1 -name '.*-00000000.dylib' -delete
```
<!-- consolidation: discard; ref: none; reason: The inspect commands are a historical host diagnostic example. -->
<!-- consolidation: unconfirmed; ref: none; reason: The reclaim command assumes filename matches are disposable and needs ownership and active-use validation before approval. -->

Restarting such a tool resets its leak to zero but does not stop it; the periodic sweep above is the
practical countermeasure until the upstream extraction cleanup is fixed. <!-- consolidation: unconfirmed; ref: none; reason: Restart reset claim and periodic global sweep safety are not established by the approved test-isolation contract. -->

## 5. Other large items found (owner decision, not deleted)

These belong to installed applications and personal files, not to this repo, so they were left in place: <!-- consolidation: discard; ref: none; reason: Historical ownership and non-action record. -->

| Path | Size |
|---|---:|
| `~/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw` | 60 GB apparent / 30.8 GB blocks <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `~/Downloads` (includes two ~8.5 GB duplicate folders) | 67.4 GB <!-- consolidation: discard; ref: none; reason: Historical size inventory. --> <!-- consolidation: unconfirmed; ref: none; reason: Duplicate-folder claim is not proven and later Downloads review explicitly leaves it unverified. --> |
| `~/Library/Application Support/Autodesk` | 31.2 GB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `~/.gvm` (Go toolchains) | 40.0 GB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `~/.opencode-personal/data/opencode/opencode.db` | 8.4 GB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `~/Library/Application Support/Claude` | 11.3 GB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `~/Library/Android/sdk/system-images/android-35/.../system.img` | 3.7 GB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `~/Documents/New_Query_2026_03_01_16_35_55.csv` | 3.5 GB <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |

## 6. Diagnostic recipe

```bash
df -h /System/Volumes/Data                                   # real free space and capacity
du -sh "$TMPDIR"                                             # temp root (du over-reports shared blocks)
find "$TMPDIR" -type f -mmin -30 -exec stat -f '%z %N' {} +  # what grew recently, logical bytes
lsof | grep -F '.dylib'                                      # who holds an extraction open
find "$TMPDIR" -maxdepth 1 -name '.*-00000000.dylib' -delete # reclaim
```
<!-- consolidation: discard; ref: none; reason: The df, du, stat and lsof commands are historical host diagnostic reference material. -->
<!-- consolidation: unconfirmed; ref: none; reason: The destructive final command lacks target ownership and active-use checks, diagnostic heading is not cleanup permission. -->

Note on tooling: `du` reports APFS clonefile copies at their logical size, so a directory tree full of
clones can read far larger than the space it occupies. `df` is the only trustworthy free-space source;
use `stat`-based logical sums or `du` only for relative comparison. <!-- consolidation: unconfirmed; ref: none; reason: Blanket claims about du logical accounting and df exclusivity need qualification before becoming operational guidance. -->
