# Session storage and retention review

## Decision

Use native context compaction for inexpensive continuation, and a separate lossless archive plus searchable summaries for durable exact retrieval. Do not replace originals with summaries. A lossy summary cannot guarantee exact original wording, omitted facts, message IDs, tool state, attachments, or execution state. Resumability and byte-exact retrieval are separate acceptance criteria.

No retention changes, compaction, exports, backups, compression, deletion, installation, or database maintenance were performed. This document is the requested deliverable.

## Evidence scope and reliability

Investigation on 2026-10-13 covered only:

- `/Users/imribarr/Library/Application Support/Claude`
- `/Users/imribarr/.opencode-personal/data`
- `/Users/imribarr/.opencode-personal/cache`
- `/Users/imribarr/.local/share/opencode`
- `/Users/imribarr/.local/share/claude`
- `/Users/imribarr/.claude`

Metadata traversal used `lstat`/`scandir`, never followed symlinks, and completed all six roots without permission errors. The initial scan plus version probes took 7.60 seconds; focused follow-ups were bounded. No personal JSONL, conversation text, logs, credentials, configuration values, or attachment contents were printed or uploaded. Database operations were limited to schema, page statistics, counts, stored record-kind labels, timestamps, and aggregate payload lengths.

Allocated size is the sum of `st_blocks * 512`. Logical payload sizes below are UTF-8 byte lengths measured with SQL `length(CAST(data AS BLOB))`; they exclude indexes, page overhead, free pages, and separately stored files. APFS shared extents and pathname accounting prevent interpreting allocations as unique or guaranteed reclaimable bytes. File modification ages do not establish session age, last use, or when the contained conversations occurred.

### Database access limitation

Both databases had WAL and SHM files. To avoid creating or updating sidecars, connections used `mode=ro&immutable=1` plus `PRAGMA query_only=ON`. No checkpoint, VACUUM, journal-mode changes, schema writes, or database copies were made. These connections inspect the main database without incorporating current WAL transactions.

**The personal main database changed during the queries. SQLite explicitly warns that immutable mode against a changing file can yield incorrect results. Its aggregates are therefore provisional observations, not a consistent snapshot or authoritative live inventory. Further live-WAL inspection was not attempted.** The default database's main-file size and modification time were unchanged during both aggregate passes, but WAL was still excluded and stability is not a formal snapshot guarantee. A future authoritative audit needs a quiescent application and a consistent snapshot; that was outside this read-only investigation. [SQLite URI documentation](https://www.sqlite.org/uri.html)

Each aggregate pass had a progress-handler deadline. The personal event aggregate hit the 38-second database budget; its age/payload join hit a separate 18-second budget. Incomplete results were not extrapolated.

## Versions

Safe version probes returned:

| Tool | Installed version | Executable |
|---|---|---|
| OpenCode | `1.19.0` | `/opt/homebrew/bin/opencode` |
| Claude Code | `2.1.291` | `/Users/imribarr/.local/bin/claude` |
| Zstandard | `1.5.7` | `/opt/homebrew/bin/zstd` |

Claude Desktop's installed version was not determined: its application bundle lies outside the requested storage scope. The storage contains bundled Claude Code resources labelled `2.1.222` and `2.1.74`; these are not the PATH CLI version or evidence of the Desktop version.

OpenCode source was verified at the official `v1.19.0` tag. The personal database includes additional session/instruction tables absent from the default store; the version string alone does not prove the installed binary/profile exactly matches upstream behavior. Profile migration history and customized persistence remain unverified.

## Storage by application/profile

| Path | Allocated bytes | Human size | Interpretation |
|---|---:|---:|---|
| `~/Library/Application Support/Claude` | 11,528,470,528 | 10.74 GiB | Primarily VM/runtime resources, not transcripts |
| `~/.opencode-personal/data` | 13,463,797,760 | 12.54 GiB | OpenCode database plus tooling and outputs |
| `~/.opencode-personal/cache` | 2,047,688,704 | 1.91 GiB | Package/tool caches; not a conversation database |
| `~/.local/share/opencode` | 3,556,503,552 | 3.31 GiB | Separate default OpenCode store |
| `~/.local/share/claude` | 928,333,824 | 885.33 MiB | Executable versions/application bundle |
| `~/.claude` | 234,336,256 | 223.48 MiB | Transcripts, plugin data, settings-related state, other records |

These are separate path sums, not deduplicated across profiles. Live totals can move during the investigation.

### Claude Desktop and Claude Code

- Desktop `vm_bundles`: **10,996,469,760 bytes (10.24 GiB)**, including `claudevm.bundle/rootfs.img`: **10,737,418,240 bytes (10 GiB)**. The image is potential persistent VM data, not established as disposable. Summarizing conversations will not materially shrink this image.
- Desktop `claude-code`: **271,306,752 bytes**; `claude-code-vm`: **232,321,024 bytes**. Paths identify versioned runtime resources.
- Desktop `local-agent-mode-sessions`: **21,647,360 bytes (20.64 MiB)** across 1,456 regular files, of which `skills-plugin` alone is **12,357,632 bytes**. Fourteen JSONL files total **619,457 logical bytes**, **655,360 allocated bytes**; their modification ages exceed 90 days. The whole directory is not transcript text.
- `~/.claude/projects`: **116,662,272 bytes (111.26 MiB)** across 597 files. Forty JSONL files occupy **35,106,816 allocated bytes (33.48 MiB)**. The largest project group has two JSONL files totalling **33,610,726 logical bytes**, modified 30–90 days ago. Project directories also contain non-JSONL state; neither all project files nor every JSONL file elsewhere are necessarily sessions.
- `~/.claude/homunculus`: **49,782,784 bytes**, including 82 JSONL files allocating **49,668,096 bytes**. Ownership/record purpose is unknown; not classified as native conversation storage.
- `~/.claude/sessions`: **626,688 bytes**, 137 files. Current official docs identify this as running-session/concurrency/crash metadata, not the main transcript archive.
- `~/.local/share/claude/versions`: **657,809,408 bytes**; `ClaudeCode.app`: **270,524,416 bytes**. Personal-profile `data/claude/versions`: **462,831,616 bytes**. These are generated/downloaded executable resources, not session payloads.

### OpenCode personal profile

`~/.opencode-personal/data/opencode/opencode.db` allocates **12,516,225,024 bytes (11.66 GiB)**. Main-file page statistics provisionally show **1,610,517 free pages × 4,096 = 6,596,677,632 bytes (6.14 GiB)**. This is internally reusable space, not lost conversations or immediately available filesystem space.

Provisional canonical `session_message` observations:

| Stored kind | Records | Logical data bytes |
|---|---:|---:|
| assistant | 59,492 | 1,114,211,643 |
| user | 4,974 | 20,041,124 |
| compaction | 62 | 1,650,940 |
| synthetic | 444 | 832,599 |
| system | 2,235 | 797,205 |
| idle / agent-switched / model-switched | 241 | 13,719 |
| **Total** | **67,448** | **1,137,547,230 (1.06 GiB)** |

Assistant records can include structured tool-related data; this was not decomposed into exact tool-output versus prose bytes. Event history, legacy tables, indexes and other records were not fully measured. Therefore the remaining database size cannot be labelled conversation text or waste.

The legacy `session` table showed 2,650 sessions updated within 30 days and 316 within 30–90 days. `session_v2` showed 2,416 and 316 respectively, none over 90 days. **Do not add these inventories: they may represent overlapping session generations.** No archived timestamp was present in these counted rows. Payload-by-age failed its deadline, and active writes weaken all personal counts.

Other personal OpenCode storage: `tool-output` **159,801,344 bytes**; `snapshot` **22,515,712 bytes**; legacy `storage` **15,790,080 bytes**. These may be dependencies of exact retrieval/revert; they are not automatically disposable. OpenCode cache contains `packages` **889,237,504 bytes**, `npm` **175,046,656 bytes**, and `models.json` **5,595,136 bytes**: package resources and model metadata, not evidence of local model weights.

### OpenCode default profile

`~/.local/share/opencode/opencode.db`: **3,327,115,264 allocated bytes (3.10 GiB)**. Main logical size is **3,326,377,984 bytes**. Main-file page statistics: **526,816 free pages × 4,096 = 2,157,838,336 bytes (2.01 GiB)**.

| Table | Records | Logical data bytes |
|---|---:|---:|
| event | 204,959 | 729,917,917 |
| part | 66,959 | 254,347,646 |
| message | 13,903 | 25,023,175 |
| session_message | 0 | 0 |

Event payloads are dominated by `message.part.updated.1` (**581,949,828 bytes**) and `message.updated.1` (**139,035,681 bytes**), with session-update/create events accounting for the balance. Events and materialized records can represent overlapping information; summing them measures logical stored representations, not unique conversation content.

Session age is based on `session.time_updated` at investigation time:

| Age | Sessions | Part records / bytes | Message records / bytes |
|---|---:|---:|---:|
| 0–30 days | 314 | 29,515 / 114,937,435 | 6,417 / 14,456,089 |
| 30–90 days | 183 | 28,754 / 113,131,547 | 5,281 / 4,588,490 |
| >90 days | 70 | 8,690 / 26,278,664 | 2,205 / 5,978,596 |

No counted session had an archived timestamp. More-than-90-day message/part payload is only **32,257,260 bytes**; this does not include its event history or external state. The 3.10 GiB database file is not 3.10 GiB of old transcripts.

## Verified native behavior

### OpenCode 1.19.0

- `opencode export [sessionID]` outputs JSON containing session `info` plus message `info` and `parts`. It does not export a whole database, event stream, todo tables, separate instruction state, or external snapshot/file contents merely referenced by a path/hash.
- `--sanitize` intentionally redacts information. It is useful for sharing, **not** an exact preservation archive.
- `opencode import <file>` imports session/message/part records, preserves their IDs, and attaches the session to the current project/directory. Existing message/part IDs are skipped on conflict; session conflicts update location fields. This is not a full-state rollback or verified restoration of customized tables, external attachments, worktree snapshots, running tools, or VM state.
- Native compaction adds a compaction request and summary, retaining original message history in the inspected implementation. Pruning sets a tool part's `state.time.compacted` marker and updates the part; it does **not** clear `state.output` in this function. Serialization substitutes an old-result placeholder for context. This is model-context reduction, not demonstrated disk reclamation, and may add stored records/events.
- The compaction model processes selected history, potentially through the configured remote provider. No actual sessions were sent to a provider during this review.

Sources: official tagged [export](https://github.com/anomalyco/opencode/blob/v1.19.0/packages/opencode/src/cli/cmd/export.ts), [import](https://github.com/anomalyco/opencode/blob/v1.19.0/packages/opencode/src/cli/cmd/import.ts), [compaction](https://github.com/anomalyco/opencode/blob/v1.19.0/packages/opencode/src/session/compaction.ts); [CLI documentation](https://opencode.ai/docs/cli/). Tagged source outweighs potentially drifting current CLI examples.

### Claude Code 2.1.291 and Desktop

Current official Claude Code docs describe `--continue`, `--resume`, and resuming from a transcript path. `/compact` produces a summary for continuation; omitted details are no longer in active context. The sessions documentation says the original session is saved and can be resumed, but does not promise byte-for-byte persistence of every external dependency or disk-space reduction.

`/export [filename]` is a rendered plain-text conversation export, not a documented full-state import package. `--output-format json`/`stream-json` applies to CLI output and is not equivalent to a complete original-session archive. Transcript JSONL is an internal format that can change.

Official storage docs identify JSONL transcripts, subagent transcripts, spilled tool outputs, checkpoints, uploads and other dependencies. After v2.1.274, some attached/pasted images live under a session directory in the configured temporary location, outside this scan scope. Exact archival coverage cannot be guaranteed from the inspected roots alone.

The current documented `cleanupPeriodDays` default is 30; `0` fails validation rather than disabling cleanup. Desktop/Cowork-origin transcripts have separate retention behavior in newer versions. No settings were read, so the actual configured/managed retention policy is unknown. Do not infer defaults from surviving files.

Claude account data export includes account/chat data, but personal-account import/migration is not supported. It is not evidence of VM/runtime restoration. Current Cowork documentation describes the October 6, 2026 Pro/Max cloud transition, preservation of existing local tasks, and “Export your Cowork data.” The fetched primary page does not establish an exact full-VM-state round trip; cached search snippets describing task-porting commands were not treated as verified capabilities. The installed Desktop version and account plan remain unknown. Third-party-provider Desktop documentation was not applied to this standard `Claude` store.

Sources: [sessions](https://code.claude.com/docs/en/sessions), [.claude storage/retention](https://code.claude.com/docs/en/claude-directory), [account export](https://support.claude.com/en/articles/9450526-export-your-claude-data), [current Cowork behavior](https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile). These are current 2026 docs, not a frozen source audit of the proprietary installed build.

## Retention options

| Approach | Exact retrieval | Native resume | Disk effect / cost |
|---|---|---|---|
| Native context compaction | Originals must remain separately retained | Supported continuation; omitted facts absent from context | Reduces tokens, not demonstrated storage; summary may add bytes |
| Delete/trim persistent DB history | No, unless complete originals already preserved elsewhere | Can break links, replay, migration state and custom tables | Destructive; freed pages normally remain inside SQLite file |
| Native transcript export + zstd + summary index | Exact for exported bytes only; referenced external files require separate capture | OpenCode import is available but partial-state; Claude text export is not a native restore package | Lossless compression; savings unknown until measured |
| Quiescent full-state archive + zstd + summary index | Strongest for all deliberately included bytes | Must test restoration with compatible app/profile/version and dependencies | More planning, workspace/runtime coverage, temporary space and privacy controls |

Zstandard 1.5.7 is already installed. Its documented compression is lossless; `zstd -t` verifies compressed-stream integrity without creating decompressed files, and originals are kept by default (`-k` makes this explicit). Hash equality after restore verifies original bytes; neither integrity checks nor hashes prove the archive included every dependency. Compression is not encryption and no compression-ratio claim is made. Moderate settings are preferable to high-memory ultra/long modes for an eventual bounded trial. [Official v1.5.7 CLI manual](https://github.com/facebook/zstd/blob/v1.5.7/programs/zstd.1.md)

SQLite deletion ordinarily leaves reusable free pages without shrinking the file. VACUUM is a separate rebuild and may need free space up to twice the original database size. With the user-supplied roughly 14 GiB free-space constraint, blindly rebuilding the 11.66 GiB personal database is not justified. No maintenance was attempted. [SQLite VACUUM documentation](https://www.sqlite.org/lang_vacuum.html)

## Recommended future workflow and acceptance checks

1. Keep active sessions in their native stores. Use native compaction for context cost, not storage retention.
2. Define cold retention by actual last session update, separately per profile. Do not use DB file mtime or assume the two OpenCode stores are duplicates.
3. Preserve unsanitized originals and required attachments, subagents, spilled outputs, snapshots, instruction/session state, plus a version/schema/path manifest. Keep credentials out of general transcript archives; handle any required credential restoration separately. Quiesce writers or use an explicitly authorized consistent-snapshot mechanism, not a bare live DB copy or immutable live query as an archival method.
4. Compress the preservation package losslessly with the installed zstd. Retain originals until archive integrity and restored-file hashes pass. For disk savings, subsequent removal or relocation requires a separate explicit decision; compression alongside originals initially consumes more space.
5. Add small searchable summaries and an index mapping app/profile/session/time to archive member, exact transcript location and attachment references. Treat summaries as navigation hints: retrieve original bytes to answer exact questions. A later local full-text index may improve retrieval but also duplicates sensitive content and consumes disk.
6. Test native resume in an isolated compatible profile before claiming it works: verify IDs/relationships, attachment resolution, tool-output access, checkpoints, custom instruction state, and project binding. OpenCode import preserves some IDs but relocates the project and is not an all-state restore. A restarted agent is not restoration of an in-flight process or deterministic model behavior.
7. Choose summarization privacy deliberately. A local model avoids sending content to an external API but requires local resources and does not eliminate lossy omissions. A remote summarizer/native compactor sends selected session content to its configured provider and requires an explicit privacy decision. This review sent only public documentation queries externally, never session data.

No third-party session-cleaner package is recommended: native exports plus the already installed lossless compressor are the smallest verified foundation. Persistent DB trimming is the poorest fit for exact retention. The largest near-term storage question is existing SQLite free pages and generated runtimes, not summary size. Authoritative personal-profile payload accounting and restore testing remain prerequisites for an actionable cleanup implementation.
