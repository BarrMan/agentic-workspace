# Disk growth investigation

Date: 2026-10-07. Symptom: the data volume filled to 100% (under 1 GB free) while working in this repo,
with growth of roughly 1 GB per 10 seconds at its worst. This document records what actually caused it,
what was reclaimed, and what now prevents recurrence.

## 1. Outcome

| | Available |
|---|---:|
| Before investigation | 772 MiB |
| After cleanup | 31 GiB |

Removed: 30.9 GB of leaked Mach-O dylibs, 5.3 GB of leaked terminal captures, one 199 MB stray build
artifact, 1.7 GB of package caches.

## 2. Primary cause: Bun's native-addon extraction into `TMPDIR`

`bun build --compile` embeds native addons inside the produced executable. At process start Bun extracts
an embedded addon to `$TMPDIR/.<hex>-00000000.dylib` and removes it **only on a clean exit**. Any process
that is killed — timeout, SIGTERM/SIGKILL, tmux teardown, crash — leaves its ~5.5 MB copy behind forever.

Evidence gathered:

- The leaked files are Mach-O arm64 dylibs; `otool -D` on a sample reports `@rpath/libopentui.dylib`, and
  their strings are OpenTUI/Yoga node messages. So the embedded addon is OpenTUI's.
- 6,197 such files had accumulated since 2026-10-03, totalling **30.9 GB**.
- Measured growth while processes were spawning: **761 -> 788 files in 6 s** (~25 MB/s).
- `lsof` showed the open holders were `opencode` processes (10 PIDs), several launched by this app's own
  session launcher (`/bin/sh -c unset AGENTIC_WORKSPACE_CWD AGENTIC_WORKSPACE_TASK_ID ...`), one from the ink prototype.

Why this app amplified it: the CLI is compiled with the OpenTUI addon embedded, and the test suite spawns
that compiled binary thousands of times per full run. Every spawn that is killed rather than exits cleanly
drops another copy. long-lived `opencode` sessions do the same on each start or restart.

## 3. Secondary causes

| Item | Size | Detail |
|---|---:|---|
| Ink-prototype terminal captures (`$TMPDIR/ink-agent-ink-proto-*-agent.raw`) | 5.3 GB | pipe-pane captures from `Projects/ink-agent-workspace-prototype`. 13 orphaned `cat` processes still held them open and kept growing them; deleting the files alone frees nothing while a writer holds the descriptor, so the 13 writers were terminated first (exact PIDs from `lsof`, no blanket kill) and then the files were removed. |
| Repo-root `.75ea373d6819e120-00000000.bun-build` | 199 MB | leftovers from an aborted `bun build`, untracked and unreferenced. |
| npm cache (`~/.npm/_cacache`), Bun install cache (`~/.bun/install/cache`) | 1.7 GB | regenerable caches. |

## 4. Prevention

**In this repo:** `src/test/test-preload.ts` points each Bun test worker at a disposable OS-temp
directory via `TMPDIR`/`TMP`/`TEMP` and removes it after the suite. Every extraction a test spawn
performs now dies with the run instead of accumulating in the real temp directory.

**For other Bun-based tools on this machine** (opencode among them) nothing in this repo can prevent the
extraction, because the leak is in how a killed process leaves its extraction behind. Two mitigations:

```bash
# inspect
find "$TMPDIR" -maxdepth 1 -name '.*-00000000.dylib' | wc -l
find "$TMPDIR" -maxdepth 1 -name '.*-00000000.dylib' -exec du -sk {} + | awk '{s+=$1} END {print s/1024" MB"}'

# reclaim (safe: throwaway build extractions, not application state)
find "$TMPDIR" -maxdepth 1 -name '.*-00000000.dylib' -delete
```

Restarting such a tool resets its leak to zero but does not stop it; the periodic sweep above is the
practical countermeasure until the upstream extraction cleanup is fixed.

## 5. Other large items found (owner decision, not deleted)

These belong to installed applications and personal files, not to this repo, so they were left in place:

| Path | Size |
|---|---:|
| `~/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw` | 60 GB apparent / 30.8 GB blocks |
| `~/Downloads` (includes two ~8.5 GB duplicate folders) | 67.4 GB |
| `~/Library/Application Support/Autodesk` | 31.2 GB |
| `~/.gvm` (Go toolchains) | 40.0 GB |
| `~/.opencode-personal/data/opencode/opencode.db` | 8.4 GB |
| `~/Library/Application Support/Claude` | 11.3 GB |
| `~/Library/Android/sdk/system-images/android-35/.../system.img` | 3.7 GB |
| `~/Documents/New_Query_2026_03_01_16_35_55.csv` | 3.5 GB |

## 6. Diagnostic recipe

```bash
df -h /System/Volumes/Data                                   # real free space and capacity
du -sh "$TMPDIR"                                             # temp root (du over-reports shared blocks)
find "$TMPDIR" -type f -mmin -30 -exec stat -f '%z %N' {} +  # what grew recently, logical bytes
lsof | grep -F '.dylib'                                      # who holds an extraction open
find "$TMPDIR" -maxdepth 1 -name '.*-00000000.dylib' -delete # reclaim
```

Note on tooling: `du` reports APFS clonefile copies at their logical size, so a directory tree full of
clones can read far larger than the space it occupies. `df` is the only trustworthy free-space source;
use `stat`-based logical sums or `du` only for relative comparison.
