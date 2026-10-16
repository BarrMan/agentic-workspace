---
consolidation:
  total: 110
  counts:
    exists: 0
    discard: 80
    integrate: 0
    unconfirmed: 30
  percentages:
    exists: 0.00%
    discard: 72.73%
    integrate: 0.00%
    unconfirmed: 27.27%
---
# Session storage and retention review
> **Non-authoritative supporting material.** This file is not a contract. Authoritative owner(s): [docs/specs/sessions.md](specs/sessions.md), [docs/BLUEPRINT.md](BLUEPRINT.md).
> Disposition: Mixed — see markers.

## Decision

Use native context compaction for inexpensive continuation, and a separate lossless archive plus searchable summaries for durable exact retrieval. <!-- consolidation: unconfirmed; ref: docs/PRODUCT.md#non-goals; reason: External-store archival proposal is not an approved product feature or host retention change. --> Do not replace originals with summaries. A lossy summary cannot guarantee exact original wording, omitted facts, message IDs, tool state, attachments, or execution state. <!-- consolidation: unconfirmed; ref: none; reason: Original-preservation gate awaits an approved archival policy. --> Resumability and byte-exact retrieval are separate acceptance criteria. <!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#stop-and-resume-a-session; reason: Product exact conversation resume does not approve byte-exact external archive acceptance criteria. -->

No retention changes, compaction, exports, backups, compression, deletion, installation, or database maintenance were performed. This document is the requested deliverable. <!-- consolidation: discard; ref: none; reason: Historical non-action record. -->

## Evidence scope and reliability

Investigation on 2026-10-13 covered only: <!-- consolidation: discard; ref: none; reason: Historical audit date and scope. -->

- `/Users/imribarr/Library/Application Support/Claude` <!-- consolidation: discard; ref: none; reason: Historical host scan root. -->
- `/Users/imribarr/.opencode-personal/data` <!-- consolidation: discard; ref: none; reason: Historical host scan root. -->
- `/Users/imribarr/.opencode-personal/cache` <!-- consolidation: discard; ref: none; reason: Historical host scan root. -->
- `/Users/imribarr/.local/share/opencode` <!-- consolidation: discard; ref: none; reason: Historical host scan root. -->
- `/Users/imribarr/.local/share/claude` <!-- consolidation: discard; ref: none; reason: Historical host scan root. -->
- `/Users/imribarr/.claude` <!-- consolidation: discard; ref: none; reason: Historical host scan root. -->

Metadata traversal used `lstat`/`scandir`, never followed symlinks, and completed all six roots without permission errors. The initial scan plus version probes took 7.60 seconds; focused follow-ups were bounded. <!-- consolidation: discard; ref: none; reason: Historical scan method and timing. --> No personal JSONL, conversation text, logs, credentials, configuration values, or attachment contents were printed or uploaded. Database operations were limited to schema, page statistics, counts, stored record-kind labels, timestamps, and aggregate payload lengths. <!-- consolidation: discard; ref: none; reason: Historical privacy and query scope evidence. -->

Allocated size is the sum of `st_blocks * 512`. Logical payload sizes below are UTF-8 byte lengths measured with SQL `length(CAST(data AS BLOB))`; they exclude indexes, page overhead, free pages, and separately stored files. APFS shared extents and pathname accounting prevent interpreting allocations as unique or guaranteed reclaimable bytes. <!-- consolidation: discard; ref: none; reason: Historical accounting method and limitations. --> File modification ages do not establish session age, last use, or when the contained conversations occurred. <!-- consolidation: discard; ref: none; reason: Host timestamp interpretation, not a retention contract. -->

### Database access limitation

Both databases had WAL and SHM files. To avoid creating or updating sidecars, connections used `mode=ro&immutable=1` plus `PRAGMA query_only=ON`. No checkpoint, VACUUM, journal-mode changes, schema writes, or database copies were made. These connections inspect the main database without incorporating current WAL transactions. <!-- consolidation: discard; ref: none; reason: Historical database access method and excluded WAL evidence. -->

**The personal main database changed during the queries. SQLite explicitly warns that immutable mode against a changing file can yield incorrect results. Its aggregates are therefore provisional observations, not a consistent snapshot or authoritative live inventory. Further live-WAL inspection was not attempted.** <!-- consolidation: discard; ref: none; reason: Provisional historical personal-profile evidence, not authoritative inventory. --> The default database's main-file size and modification time were unchanged during both aggregate passes, but WAL was still excluded and stability is not a formal snapshot guarantee. <!-- consolidation: discard; ref: none; reason: Historical default-profile consistency limitation. --> A future authoritative audit needs a quiescent application and a consistent snapshot; that was outside this read-only investigation. [SQLite URI documentation](https://www.sqlite.org/uri.html) <!-- consolidation: unconfirmed; ref: none; reason: Retain consistent-snapshot prerequisite for any separately authorized provider-store audit. -->

Each aggregate pass had a progress-handler deadline. The personal event aggregate hit the 38-second database budget; its age/payload join hit a separate 18-second budget. Incomplete results were not extrapolated. <!-- consolidation: discard; ref: none; reason: Historical query completion limits. -->

## Versions

Safe version probes returned:

| Tool | Installed version | Executable |
|---|---|---|
| OpenCode | `1.19.0` | `/opt/homebrew/bin/opencode` <!-- consolidation: discard; ref: none; reason: Historical host version. --> |
| Claude Code | `2.1.291` | `/Users/imribarr/.local/bin/claude` <!-- consolidation: discard; ref: none; reason: Historical host version. --> |
| Zstandard | `1.5.7` | `/opt/homebrew/bin/zstd` <!-- consolidation: discard; ref: none; reason: Historical host version. --> |

Claude Desktop's installed version was not determined: its application bundle lies outside the requested storage scope. The storage contains bundled Claude Code resources labelled `2.1.222` and `2.1.74`; these are not the PATH CLI version or evidence of the Desktop version. <!-- consolidation: discard; ref: none; reason: Historical version evidence and audit limitation. -->

OpenCode source was verified at the official `v1.19.0` tag. The personal database includes additional session/instruction tables absent from the default store; the version string alone does not prove the installed binary/profile exactly matches upstream behavior. <!-- consolidation: discard; ref: none; reason: Historical upstream-versus-installed evidence limitation. --> Profile migration history and customized persistence remain unverified. <!-- consolidation: unconfirmed; ref: none; reason: Custom persistence must be resolved before applying archival or cleanup recommendations. -->

## Storage by application/profile

| Path | Allocated bytes | Human size | Interpretation |
|---|---:|---:|---|
| `~/Library/Application Support/Claude` | 11,528,470,528 | 10.74 GiB | Primarily VM/runtime resources, not transcripts <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `~/.opencode-personal/data` | 13,463,797,760 | 12.54 GiB | OpenCode database plus tooling and outputs <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `~/.opencode-personal/cache` | 2,047,688,704 | 1.91 GiB | Package/tool caches; not a conversation database <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `~/.local/share/opencode` | 3,556,503,552 | 3.31 GiB | Separate default OpenCode store <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `~/.local/share/claude` | 928,333,824 | 885.33 MiB | Executable versions/application bundle <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| `~/.claude` | 234,336,256 | 223.48 MiB | Transcripts, plugin data, settings-related state, other records <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |

These are separate path sums, not deduplicated across profiles. Live totals can move during the investigation. <!-- consolidation: discard; ref: none; reason: Historical accounting limitation. -->

### Claude Desktop and Claude Code

- Desktop `vm_bundles`: **10,996,469,760 bytes (10.24 GiB)**, including `claudevm.bundle/rootfs.img`: **10,737,418,240 bytes (10 GiB)**. <!-- consolidation: discard; ref: none; reason: Historical VM allocation. --> The image is potential persistent VM data, not established as disposable. <!-- consolidation: unconfirmed; ref: none; reason: VM persistence and deletion safety remain unknown. --> Summarizing conversations will not materially shrink this image. <!-- consolidation: discard; ref: none; reason: Host storage interpretation, not product compaction behavior. -->
- Desktop `claude-code`: **271,306,752 bytes**; `claude-code-vm`: **232,321,024 bytes**. Paths identify versioned runtime resources. <!-- consolidation: discard; ref: none; reason: Historical runtime inventory. -->
- Desktop `local-agent-mode-sessions`: **21,647,360 bytes (20.64 MiB)** across 1,456 regular files, of which `skills-plugin` alone is **12,357,632 bytes**. Fourteen JSONL files total **619,457 logical bytes**, **655,360 allocated bytes**; their modification ages exceed 90 days. The whole directory is not transcript text. <!-- consolidation: discard; ref: none; reason: Historical transcript and runtime inventory. -->
- `~/.claude/projects`: **116,662,272 bytes (111.26 MiB)** across 597 files. Forty JSONL files occupy **35,106,816 allocated bytes (33.48 MiB)**. The largest project group has two JSONL files totalling **33,610,726 logical bytes**, modified 30–90 days ago. Project directories also contain non-JSONL state; neither all project files nor every JSONL file elsewhere are necessarily sessions. <!-- consolidation: discard; ref: none; reason: Historical transcript inventory and interpretation. -->
- `~/.claude/homunculus`: **49,782,784 bytes**, including 82 JSONL files allocating **49,668,096 bytes**. <!-- consolidation: discard; ref: none; reason: Historical host allocation. --> Ownership/record purpose is unknown; not classified as native conversation storage. <!-- consolidation: unconfirmed; ref: none; reason: Unknown record ownership cannot authorize retention changes. -->
- `~/.claude/sessions`: **626,688 bytes**, 137 files. Current official docs identify this as running-session/concurrency/crash metadata, not the main transcript archive. <!-- consolidation: discard; ref: none; reason: Historical external storage evidence. -->
- `~/.local/share/claude/versions`: **657,809,408 bytes**; `ClaudeCode.app`: **270,524,416 bytes**. Personal-profile `data/claude/versions`: **462,831,616 bytes**. These are generated/downloaded executable resources, not session payloads. <!-- consolidation: discard; ref: none; reason: Historical runtime inventory. -->

### OpenCode personal profile

`~/.opencode-personal/data/opencode/opencode.db` allocates **12,516,225,024 bytes (11.66 GiB)**. Main-file page statistics provisionally show **1,610,517 free pages × 4,096 = 6,596,677,632 bytes (6.14 GiB)**. This is internally reusable space, not lost conversations or immediately available filesystem space. <!-- consolidation: discard; ref: none; reason: Provisional historical database accounting. -->

Provisional canonical `session_message` observations:

| Stored kind | Records | Logical data bytes |
|---|---:|---:|
| assistant | 59,492 | 1,114,211,643 <!-- consolidation: discard; ref: none; reason: Provisional historical aggregate. --> |
| user | 4,974 | 20,041,124 <!-- consolidation: discard; ref: none; reason: Provisional historical aggregate. --> |
| compaction | 62 | 1,650,940 <!-- consolidation: discard; ref: none; reason: Provisional historical aggregate. --> |
| synthetic | 444 | 832,599 <!-- consolidation: discard; ref: none; reason: Provisional historical aggregate. --> |
| system | 2,235 | 797,205 <!-- consolidation: discard; ref: none; reason: Provisional historical aggregate. --> |
| idle / agent-switched / model-switched | 241 | 13,719 <!-- consolidation: discard; ref: none; reason: Provisional historical aggregate. --> |
| **Total** | **67,448** | **1,137,547,230 (1.06 GiB)** <!-- consolidation: discard; ref: none; reason: Provisional historical aggregate. --> |

Assistant records can include structured tool-related data; this was not decomposed into exact tool-output versus prose bytes. Event history, legacy tables, indexes and other records were not fully measured. Therefore the remaining database size cannot be labelled conversation text or waste. <!-- consolidation: discard; ref: none; reason: Historical measurement coverage and interpretation limit. -->

The legacy `session` table showed 2,650 sessions updated within 30 days and 316 within 30–90 days. `session_v2` showed 2,416 and 316 respectively, none over 90 days. **Do not add these inventories: they may represent overlapping session generations.** No archived timestamp was present in these counted rows. Payload-by-age failed its deadline, and active writes weaken all personal counts. <!-- consolidation: discard; ref: none; reason: Provisional historical session-age accounting. -->

Other personal OpenCode storage: `tool-output` **159,801,344 bytes**; `snapshot` **22,515,712 bytes**; legacy `storage` **15,790,080 bytes**. <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> These may be dependencies of exact retrieval/revert; they are not automatically disposable. <!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#deleting-a-session; reason: External dependency preservation and provider-file removal scope remain unresolved. --> OpenCode cache contains `packages` **889,237,504 bytes**, `npm` **175,046,656 bytes**, and `models.json` **5,595,136 bytes**: package resources and model metadata, not evidence of local model weights. <!-- consolidation: discard; ref: none; reason: Historical cache inventory. -->

### OpenCode default profile

`~/.local/share/opencode/opencode.db`: **3,327,115,264 allocated bytes (3.10 GiB)**. Main logical size is **3,326,377,984 bytes**. Main-file page statistics: **526,816 free pages × 4,096 = 2,157,838,336 bytes (2.01 GiB)**. <!-- consolidation: discard; ref: none; reason: Historical main-file accounting excludes WAL. -->

| Table | Records | Logical data bytes |
|---|---:|---:|
| event | 204,959 | 729,917,917 <!-- consolidation: discard; ref: none; reason: Historical database aggregate. --> |
| part | 66,959 | 254,347,646 <!-- consolidation: discard; ref: none; reason: Historical database aggregate. --> |
| message | 13,903 | 25,023,175 <!-- consolidation: discard; ref: none; reason: Historical database aggregate. --> |
| session_message | 0 | 0 <!-- consolidation: discard; ref: none; reason: Historical database aggregate. --> |

Event payloads are dominated by `message.part.updated.1` (**581,949,828 bytes**) and `message.updated.1` (**139,035,681 bytes**), with session-update/create events accounting for the balance. Events and materialized records can represent overlapping information; summing them measures logical stored representations, not unique conversation content. <!-- consolidation: discard; ref: none; reason: Historical aggregate and double-counting limitation. -->

Session age is based on `session.time_updated` at investigation time: <!-- consolidation: discard; ref: none; reason: Historical age-measurement definition. -->

| Age | Sessions | Part records / bytes | Message records / bytes |
|---|---:|---:|---:|
| 0–30 days | 314 | 29,515 / 114,937,435 | 6,417 / 14,456,089 <!-- consolidation: discard; ref: none; reason: Historical age aggregate. --> |
| 30–90 days | 183 | 28,754 / 113,131,547 | 5,281 / 4,588,490 <!-- consolidation: discard; ref: none; reason: Historical age aggregate. --> |
| >90 days | 70 | 8,690 / 26,278,664 | 2,205 / 5,978,596 <!-- consolidation: discard; ref: none; reason: Historical age aggregate. --> |

No counted session had an archived timestamp. More-than-90-day message/part payload is only **32,257,260 bytes**; this does not include its event history or external state. The 3.10 GiB database file is not 3.10 GiB of old transcripts. <!-- consolidation: discard; ref: none; reason: Historical age-accounting interpretation. -->

## Verified native behavior

### OpenCode 1.19.0

- `opencode export [sessionID]` outputs JSON containing session `info` plus message `info` and `parts`. It does not export a whole database, event stream, todo tables, separate instruction state, or external snapshot/file contents merely referenced by a path/hash. <!-- consolidation: discard; ref: none; reason: Version-specific external export reference, not an approved application interface. -->
- `--sanitize` intentionally redacts information. It is useful for sharing, **not** an exact preservation archive. <!-- consolidation: discard; ref: none; reason: External export semantics and limitation. -->
- `opencode import <file>` imports session/message/part records, preserves their IDs, and attaches the session to the current project/directory. Existing message/part IDs are skipped on conflict; session conflicts update location fields. This is not a full-state rollback or verified restoration of customized tables, external attachments, worktree snapshots, running tools, or VM state. <!-- consolidation: discard; ref: none; reason: Tagged external import behavior and limits, not product restore approval. -->
- Native compaction adds a compaction request and summary, retaining original message history in the inspected implementation. Pruning sets a tool part's `state.time.compacted` marker and updates the part; it does **not** clear `state.output` in this function. Serialization substitutes an old-result placeholder for context. This is model-context reduction, not demonstrated disk reclamation, and may add stored records/events. <!-- consolidation: discard; ref: none; reason: Tagged external compaction implementation evidence. -->
- The compaction model processes selected history, potentially through the configured remote provider. No actual sessions were sent to a provider during this review. <!-- consolidation: discard; ref: none; reason: External processing description and historical non-action evidence. -->

Sources: official tagged [export](https://github.com/anomalyco/opencode/blob/v1.19.0/packages/opencode/src/cli/cmd/export.ts), [import](https://github.com/anomalyco/opencode/blob/v1.19.0/packages/opencode/src/cli/cmd/import.ts), [compaction](https://github.com/anomalyco/opencode/blob/v1.19.0/packages/opencode/src/session/compaction.ts); [CLI documentation](https://opencode.ai/docs/cli/). Tagged source outweighs potentially drifting current CLI examples. <!-- consolidation: discard; ref: none; reason: Historical research source-ranking rationale. -->

### Claude Code 2.1.291 and Desktop

Current official Claude Code docs describe `--continue`, `--resume`, and resuming from a transcript path. <!-- consolidation: discard; ref: none; reason: External CLI reference. --> `/compact` produces a summary for continuation; omitted details are no longer in active context. The sessions documentation says the original session is saved and can be resumed, but does not promise byte-for-byte persistence of every external dependency or disk-space reduction. <!-- consolidation: discard; ref: none; reason: External compaction semantics and limits. -->

`/export [filename]` is a rendered plain-text conversation export, not a documented full-state import package. `--output-format json`/`stream-json` applies to CLI output and is not equivalent to a complete original-session archive. Transcript JSONL is an internal format that can change. <!-- consolidation: discard; ref: none; reason: External export-format reference, not an application archive contract. -->

Official storage docs identify JSONL transcripts, subagent transcripts, spilled tool outputs, checkpoints, uploads and other dependencies. After v2.1.274, some attached/pasted images live under a session directory in the configured temporary location, outside this scan scope. <!-- consolidation: discard; ref: none; reason: Version-specific external storage reference. --> Exact archival coverage cannot be guaranteed from the inspected roots alone. <!-- consolidation: unconfirmed; ref: none; reason: Complete dependency coverage remains a prerequisite to approving exact archival. -->

The current documented `cleanupPeriodDays` default is 30; `0` fails validation rather than disabling cleanup. Desktop/Cowork-origin transcripts have separate retention behavior in newer versions. <!-- consolidation: discard; ref: none; reason: External version-specific retention reference. --> No settings were read, so the actual configured/managed retention policy is unknown. Do not infer defaults from surviving files. <!-- consolidation: unconfirmed; ref: none; reason: Actual host retention policy must be established before changing it. -->

Claude account data export includes account/chat data, but personal-account import/migration is not supported. It is not evidence of VM/runtime restoration. <!-- consolidation: discard; ref: none; reason: External account-export reference. --> Current Cowork documentation describes the October 6, 2026 Pro/Max cloud transition, preservation of existing local tasks, and “Export your Cowork data.” The fetched primary page does not establish an exact full-VM-state round trip; cached search snippets describing task-porting commands were not treated as verified capabilities. <!-- consolidation: discard; ref: none; reason: Dated Cowork research evidence and limitations. --> The installed Desktop version and account plan remain unknown. Third-party-provider Desktop documentation was not applied to this standard `Claude` store. <!-- consolidation: unconfirmed; ref: none; reason: Installed-version and account applicability remain unresolved for any proposed restore workflow. -->

Sources: [sessions](https://code.claude.com/docs/en/sessions), [.claude storage/retention](https://code.claude.com/docs/en/claude-directory), [account export](https://support.claude.com/en/articles/9450526-export-your-claude-data), [current Cowork behavior](https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile). These are current 2026 docs, not a frozen source audit of the proprietary installed build. <!-- consolidation: discard; ref: none; reason: Historical source reliability limitation. -->

## Retention options

| Approach | Exact retrieval | Native resume | Disk effect / cost |
|---|---|---|---|
| Native context compaction | Originals must remain separately retained | Supported continuation; omitted facts absent from context | Reduces tokens, not demonstrated storage; summary may add bytes <!-- consolidation: unconfirmed; ref: none; reason: Retention option includes an unresolved original-preservation requirement. --> |
| Delete/trim persistent DB history | No, unless complete originals already preserved elsewhere | Can break links, replay, migration state and custom tables | Destructive; freed pages normally remain inside SQLite file <!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#deleting-a-session; reason: Provider-history deletion and preservation conditions require explicit policy and permission. --> |
| Native transcript export + zstd + summary index | Exact for exported bytes only; referenced external files require separate capture | OpenCode import is available but partial-state; Claude text export is not a native restore package | Lossless compression; savings unknown until measured <!-- consolidation: unconfirmed; ref: none; reason: Proposed archival option needs completeness and restoration acceptance. --> |
| Quiescent full-state archive + zstd + summary index | Strongest for all deliberately included bytes | Must test restoration with compatible app/profile/version and dependencies | More planning, workspace/runtime coverage, temporary space and privacy controls <!-- consolidation: unconfirmed; ref: none; reason: Full-state archival option is unapproved and restore coverage remains unresolved. --> |

Zstandard 1.5.7 is already installed. <!-- consolidation: discard; ref: none; reason: Historical host installation evidence. --> Its documented compression is lossless; `zstd -t` verifies compressed-stream integrity without creating decompressed files, and originals are kept by default (`-k` makes this explicit). Hash equality after restore verifies original bytes; neither integrity checks nor hashes prove the archive included every dependency. Compression is not encryption and no compression-ratio claim is made. <!-- consolidation: discard; ref: none; reason: External compression capabilities and limitations, not product commitments. --> Moderate settings are preferable to high-memory ultra/long modes for an eventual bounded trial. [Official v1.5.7 CLI manual](https://github.com/facebook/zstd/blob/v1.5.7/programs/zstd.1.md) <!-- consolidation: unconfirmed; ref: none; reason: Compression trial and resource settings await authorization. -->

SQLite deletion ordinarily leaves reusable free pages without shrinking the file. VACUUM is a separate rebuild and may need free space up to twice the original database size. <!-- consolidation: discard; ref: none; reason: External SQLite maintenance reference. --> With the user-supplied roughly 14 GiB free-space constraint, blindly rebuilding the 11.66 GiB personal database is not justified. <!-- consolidation: unconfirmed; ref: none; reason: Maintenance safety budget and authorization must be established, old free-space figures are insufficient. --> No maintenance was attempted. [SQLite VACUUM documentation](https://www.sqlite.org/lang_vacuum.html) <!-- consolidation: discard; ref: none; reason: Historical non-action evidence. -->

## Recommended future workflow and acceptance checks

1. Keep active sessions in their native stores. Use native compaction for context cost, not storage retention. <!-- consolidation: unconfirmed; ref: none; reason: Proposed host retention workflow awaits approval. -->
2. Define cold retention by actual last session update, separately per profile. Do not use DB file mtime or assume the two OpenCode stores are duplicates. <!-- consolidation: unconfirmed; ref: none; reason: Cold-retention and profile identity policy remain undecided. -->
3. Preserve unsanitized originals and required attachments, subagents, spilled outputs, snapshots, instruction/session state, plus a version/schema/path manifest. <!-- consolidation: unconfirmed; ref: none; reason: Archival scope and completeness gate await approval. --> Keep credentials out of general transcript archives; handle any required credential restoration separately. <!-- consolidation: unconfirmed; ref: none; reason: Credential archival privacy and recovery policy requires a decision. --> Quiesce writers or use an explicitly authorized consistent-snapshot mechanism, not a bare live DB copy or immutable live query as an archival method. <!-- consolidation: unconfirmed; ref: none; reason: Consistent-snapshot mechanism must be authorized and validated. -->
4. Compress the preservation package losslessly with the installed zstd. Retain originals until archive integrity and restored-file hashes pass. <!-- consolidation: unconfirmed; ref: none; reason: Lossless archival and integrity gate await workflow approval. --> For disk savings, subsequent removal or relocation requires a separate explicit decision; compression alongside originals initially consumes more space. <!-- consolidation: unconfirmed; ref: none; reason: Removal and relocation permission remain separate unresolved gates. -->
5. Add small searchable summaries and an index mapping app/profile/session/time to archive member, exact transcript location and attachment references. Treat summaries as navigation hints: retrieve original bytes to answer exact questions. <!-- consolidation: unconfirmed; ref: docs/PRODUCT.md#non-goals; reason: Host retrieval-index proposal is not approved durable product scope. --> A later local full-text index may improve retrieval but also duplicates sensitive content and consumes disk. <!-- consolidation: unconfirmed; ref: none; reason: Optional indexing cost and privacy tradeoff has no approved disposition. -->
6. Test native resume in an isolated compatible profile before claiming it works: verify IDs/relationships, attachment resolution, tool-output access, checkpoints, custom instruction state, and project binding. <!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#stop-and-resume-a-session; reason: External archive restoration gate exceeds the approved same-conversation resume contract. --> OpenCode import preserves some IDs but relocates the project and is not an all-state restore. A restarted agent is not restoration of an in-flight process or deterministic model behavior. <!-- consolidation: discard; ref: none; reason: External import and process-restoration limitations. -->
7. Choose summarization privacy deliberately. A local model avoids sending content to an external API but requires local resources and does not eliminate lossy omissions. A remote summarizer/native compactor sends selected session content to its configured provider and requires an explicit privacy decision. <!-- consolidation: unconfirmed; ref: none; reason: Local-versus-remote summarization privacy decision remains open. --> This review sent only public documentation queries externally, never session data. <!-- consolidation: discard; ref: none; reason: Historical privacy evidence. -->

No third-party session-cleaner package is recommended: native exports plus the already installed lossless compressor are the smallest verified foundation. Persistent DB trimming is the poorest fit for exact retention. <!-- consolidation: unconfirmed; ref: none; reason: Tool-selection and retention recommendations await owner approval. --> The largest near-term storage question is existing SQLite free pages and generated runtimes, not summary size. <!-- consolidation: discard; ref: none; reason: Historical host prioritization based on provisional allocations. --> Authoritative personal-profile payload accounting and restore testing remain prerequisites for an actionable cleanup implementation. <!-- consolidation: unconfirmed; ref: none; reason: Accounting and restore safety gates remain unsatisfied. -->
