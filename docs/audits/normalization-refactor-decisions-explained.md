# Normalization Refactor Decisions — Explained

Status: supporting evidence, not a contract. Companion to
[normalization-refactor-decisions.md](normalization-refactor-decisions.md). This document explains
the 14 items that were deliberately left unchanged, in the order they appear there. It is written
for review, not as a second source of truth.

## Summary

| # | Item | Verdict | One-line reason |
|---:|---|---|---|
| 1 | Task identity key and padded IDs | Keep | `TASK-01` and `TASK-1` are different tasks. |
| 2 | Clearable-list parsing vs sanitization | Keep | Omitted, `[]`, and blank-only mean different things. |
| 3 | Status lookup vs equality keys | Keep | Lookup ignores all whitespace; equality preserves it. |
| 4 | Assignee vs label equality | Keep | Assignees strip a leading `@` and collapse whitespace; labels do not. |
| 5 | Priority label vs value | Keep | Labels preserve configured spelling; values are comparison keys. |
| 6 | Lifecycle vs record path normalization | Keep | One rewrites lifecycle prefixes; the other resolves real paths. |
| 7 | Process identity fencing | Keep | PID reuse must not let termination signal an unrelated process. |
| 8 | Task-ID grammars, numeric options, escaped prefixes | Keep | Each is a strict grammar or a literal-regex boundary. |
| 9 | Date, timezone, shell, Unicode, ownership, tmux regexes | Keep | Each encodes a format or trust boundary, not generic string cleanup. |
| 10 | Process-table and CRLF/whitespace splitting | Keep | `split(/\s+/)` handles tabs and repeated spaces; `split(" ")` does not. |
| 11 | Suffix alternatives and one-newline removal | Keep | One trailing newline is a record terminator, not arbitrary whitespace. |
| 12 | Filesystem ownership and launch-environment sanitization | Keep | Symlink and stale-environment defenses sit at different boundaries. |
| 13 | Keybinding modifier matcher | Keep | It is the keymap's canonical grammar and equality rule. |
| 14 | Agent wrappers and Pi's sanitization hook | Keep | The interface requires the hook; Pi's no-op is correct for Pi. |

---

## 1. Task identity key and padded task IDs

**What it is.** Two different keys for task IDs: `taskIdKey` and `canonicalTaskIdKey`.

**Why it is needed.** Task identity is case-insensitive, but numeric segments are preserved
exactly. `TASK-01` and `TASK-1` are distinct tasks. A filesystem lock key has a different job: it
must be safe on disk and may collapse spelling variants that should not race on the same lock.

**Where it is declared.** `src/model/task/task-id.ts:59-61` (`taskIdKey`) and
`src/model/task/task-id.ts:34-40` (`canonicalTaskIdKey`). The contract is
`docs/specs/tasks.md:70-91` (TASK-003).

**What it does.**
- `taskIdKey` trims surrounding whitespace and uppercases the ID. It keeps every digit.
- `canonicalTaskIdKey` trims, lowercases, and strips leading zeroes from numeric segments. It is
  used for lock names, not identity.

**What removing it would cause.** If task identity used numeric canonicalization, `TASK-01` and
`TASK-1` would collapse into one lookup, and distinct records could be merged or overwritten.

**Verdict: keep both.** Identity needs exact padding; lock keys need a separate, narrower
canonical form.
> So this is overly complex logic for something that is not important. TASK-01 and TASK-1 are not identical tasks. Task id consists of the whole task id string and not just the numerical part. This means that these are completely different tasks. The task auto incremental counter should be recorded persistently somewhere, we'll auto increment it whenever a task is created successfully using that number+1. If it does not, we inc it again until success.
---

## 2. Clearable-list parsing vs sanitization

**What it is.** Two helpers at two stages: `parseClearableStringList` reads CLI input;
`sanitizeClearableStringArray` builds a task update from already-parsed values.

**Why it is needed.** A user must be able to say three different things: "I did not mention this
field," "clear the field," and "I supplied only whitespace, which should change nothing."

**Where it is declared.** `src/lib/string-list.ts:20-24` (`parseClearableStringList`) and
`src/cli/task-edit-builder.ts:9-12` (`sanitizeClearableStringArray`). The builder calls it from
`src/cli/task-edit-builder.ts:48-49`.

**What it does.**

| Input | Parser result | Builder result |
|---|---|---|
| Field omitted / `null` | `undefined` | `undefined` (no change) |
| Explicit `[]` | `undefined` | `[]` (clear) |
| Blank-only input, such as `" "` | `[]` | `undefined` (no change) |
| Non-blank values | normalized list | normalized list |

The parser's job is to interpret user input. The builder's job is to interpret a value that has
already been parsed, where `[]` is now an explicit clear.

**What removing it would cause.** Merging the two would either clear a list when the user typed
only spaces, or make an explicit clear impossible because the builder would treat `[]` as
"nothing supplied."

**Verdict: keep both.** They encode different stages of the clear/no-op contract.
> This is unclear to me. You forgot to mention, when this happens. When this user happens? What does the user type? When in what scenario???
---

## 3. Status lookup vs equality keys

**What it is.** Three related operations: `statusComparisonKey` for equality, `statusLookupKey`
for resolving input to a configured status, and `getCanonicalStatus` for the configured spelling.

**Why it is needed.** Lookup should accept human spacing mistakes: `"InProgress"` should resolve to
the configured `"In Progress"`. Equality should not silently treat two differently spelled stored
statuses as the same status. They answer different questions.

**Where it is declared.** `src/model/task/status.ts:10-12` (`statusComparisonKey`),
`src/model/task/status.ts:18-20` (`statusLookupKey`), and `src/model/task/status.ts:64-72`
(`getCanonicalStatus`). `findCanonicalStatus` is the synchronous lookup at
`src/model/task/status.ts:36-43`.

**What it does.**
- Comparison trims and lowercases, but preserves internal whitespace.
- Lookup does the same, then removes all whitespace.
- Canonicalization uses lookup to return the configured spelling, or `null`.

**What removing it would cause.** Using lookup for equality would make `"In Progress"` and
`"InProgress"` the same terminal/lane status. Using comparison for lookup would stop
`"InProgress"` from resolving to the configured `"In Progress"`.

**Verdict: keep the distinct keys and the resolver.**
> What lookup? When is a human typing a status like that and we should resolve it?
---

## 4. Assignee vs label equality

**What it is.** `assigneeComparisonKey` and `labelComparisonKey`.

**Why it is needed.** Assignees have display formatting that is not identity: an optional leading
`@` and repeated spaces. Labels do not. Sharing one key would either make `@Sam` and `Sam` unequal
or make label matching unexpectedly ignore spacing.

**Where it is declared.** `src/model/task/assignee-filter.ts:1-3` and
`src/model/task/label-filter.ts:4-6`. The shared generic key is
`src/lib/comparison-key.ts:1-5`, which labels use.

**What it does.**
- Assignee: trim, remove one leading `@`, trim again, collapse internal whitespace, lowercase.
- Label: trim and lowercase.

**What removing it would cause.** If assignees used the generic key, `@Sam` and `Sam` would be
different assignees, and normalization could store both. If labels used the assignee key, label
spacing would be rewritten even though it is not formatting.

**Verdict: keep separate assignee logic and the shared label key.**
> Not needed, remove. Also, after removal, let's examine why we we need assignees - we might want to remove them entirely as well.
---

## 5. Priority label vs value

**What it is.** A configured priority has a display label and a comparison value.

**Why it is needed.** Configuration may spell a priority `"Very High"`. Stored and compared values
must be stable and case-insensitive; the UI should still show the configured spelling.

**Where it is declared.** `src/model/task/priority-config.ts:14-20` (`normalizePriorityValue`),
`src/model/task/priority-config.ts:58-68` (`resolvePriorityValue`), and
`src/model/task/priority-config.ts:70-86` (`formatPriorityLabel`).

**What it does.** The label is trimmed and whitespace-collapsed but keeps its casing. The value is
that label lowercased. Resolution returns the value; formatting returns the configured label.

**What removing it would cause.** Rendering the value directly would show `"very high"` where the
configuration says `"Very High"`. Comparing against labels would fail whenever configured casing
differs.

**Verdict: keep the distinction.** Validation and ranking use values; presentation uses labels.
> So why need normalization and formatting? Why 2 different values? Just use "Very High" and that's all. Is there any specific reason for this?
---

## 6. Task lifecycle vs record path normalization

**What it is.** Two path operations: `normalizeTaskLifecyclePath` and `normalizeRecordPath`.

**Why it is needed.** A task in `archive/` or `completed/` is still the same task as its entry in
`tasks/`. Separately, a record path may be absolute, worktree-relative, or nested under a project
prefix, and must be resolved before it can be compared.

**Where it is declared.** `src/model/task/task-identity-index.ts:69-77`
(`normalizeTaskLifecyclePath`) and `src/model/task/task-identity-index.ts:79-106`
(`normalizeRecordPath`, which calls the lifecycle normalizer at line 105).

**What it does.**
- Lifecycle normalization rewrites an `archive/` or `completed/` prefix to the `tasks/` path.
- Record normalization resolves an absolute path against the repository root or worktree source,
  converts separators, applies the project prefix, then applies lifecycle normalization.

**What removing it would cause.** Without lifecycle normalization, the same task in `archive/` and
`tasks/` would look like two identities. Without record normalization, absolute and nested records
would not resolve to the same logical task.

**Verdict: keep both.** Lifecycle equivalence and record-path resolution are separate jobs.
> This sounds, again, like string manipulation instead of understand what the code does. This should be resolved using paths os native functions. bun would have "fs" lib I get and "path" lib yes? Then:
```javascript
const absolutePath = path.absolute(task.tasksDir)
fs.move(task.tasksDir, archiveDir)
task.tasksDir = archiveDir / task.taskId // I don't really think there should even be relative and absolute path logic for this. Don't you think?
```
---

## 7. Process identity fencing

**What it is.** A process is identified by PID **and** start time (plus UID), not by PID alone.

**Why it is needed.** Operating systems reuse PIDs. Before terminating a process tree, the code
must prove that the PID still belongs to the process it captured. A PID-only check can signal an
unrelated process that reused the number.

**Where it is declared.** `src/lib/process-tree.ts:14-19` (`OwnedProcess` carries `pid`, `started`,
`uid`) and `src/lib/process-tree.ts:70-71` (`sameOwnedIdentity`). Termination re-checks identity
before signaling, including the descendant path around `src/lib/process-tree.ts:131-143`.

**What it does.** Captures PID plus normalized start time; before each signal, re-observes the
process table and compares both. A mismatch means the original process is gone.

**What removing it would cause.** If a captured PID exits and is recycled, termination could kill
an unrelated process that reused that PID.

**Verdict: keep the fence.** This is a safety check, not string cleanup.
> I think it's a bit too much. You can use the PID And ProcessName for that. 
---

## 8. Task-ID grammars, numeric option validation, escaped-prefix capture

**What it is.** Strict parsers for task IDs and numeric CLI options, plus regex escaping for
caller-supplied prefixes.

**Why it is needed.** A task ID has a specific grammar. A CLI count has a specific numeric domain.
A configured prefix is literal text and must not become regex syntax.

**Where it is declared.**
- `src/model/task/task-id.ts:3-4` (`TASK_ID_PATTERN`), `:11-15` (`parseTaskId`), `:17-23`
  (`taskIdBody`), `:25-27` (`taskIdRegex`).
- `src/lib/regex.ts:1-3` (`escapeRegex`).
- `src/cli/list-window.ts:61-67` (`parsePositiveIntegerOption`) and `:94-97` (the `--skip` check).

**What it does.**
- Task IDs: ASCII letters, a hyphen, then digit segments separated by single dots. Prefix matching
  is case-insensitive.
- Positive options: `^[1-9]\d*$`, rejecting zero, signs, decimals, exponents, and non-digits.
  `--skip`: `^\d+$`, allowing zero.
- `escapeRegex` escapes metacharacters before a prefix is embedded in a pattern.

**What removing it would cause.** A generic non-empty check would accept `TASK-x` or
`TASK-1..2`, and options such as `--max-count 0` or `--skip -1`. An unescaped prefix containing
regex punctuation would change which IDs match.

**Verdict: keep.** These are grammar and literal-boundary checks.
> This is so useless and not important. We are the ones generating the task ids. WE ARE. We don't need to verify ourselves. If someone decides to corrupt tasks, then it's on them.
---

## 9. Date, timezone, shell, Unicode, ownership, pane/session, and tmux regexes

**What it is.** A group of patterns that each validate a different format or trust boundary:
date/time parsing, shell-syntax rejection, Unicode model IDs, session and pane IDs, filesystem
ownership hashes, and tmux absence diagnostics.

**Why it is needed.** These inputs come from users, provider commands, or the runtime. A looser
string check would accept values that the surrounding code cannot safely interpret.

**Where it is declared (representative).**
- Dates and offsets: `src/lib/utc-date-display.ts:11-15,21-26,69`.
- Model IDs and shell syntax: `src/runtime/agents/profile.ts:9,12-15`, used around `:51,256-263`.
- Session, pane, and workspace IDs: `src/runtime/workspace-context.ts:139-142,155-156`,
  `src/runtime/sessions.ts:374-391`, `src/runtime/session-process.ts:279-280,511-522`.
- tmux diagnostics: `src/runtime/session-process.ts:186-215`.

**What it does.** Each pattern encodes an exact grammar: date-shaped text, a Unicode model
identifier of bounded length, a safe session/pane ID, a fixed ownership marker, or a specific tmux
error phrase.

**What removing it would cause.** Shell operators could be parsed as arguments; malformed model IDs
or pane IDs could reach provider APIs; an unrelated tmux failure could be mistaken for a missing
owned target. Those are behavior and safety changes, not simplifications.

**Verdict: keep.** Similar-looking regexes implement different grammars.
> For dates, use a known date library or native date functions. Not a regex.
> Mode ID? explain
> explain
> explain
> Do not write those separately. I need to know what you're talking about in order to decide whether it's stupid or stupid.
---

## 10. Process-table and CRLF/whitespace splitting

**What it is.** Splitting `ps` rows and provider output on variable-width whitespace and CRLF.

**Why it is needed.** `ps` output aligns columns with repeated spaces; provider output may use
tabs. A literal single-space split is not equivalent.

**Where it is declared.** `src/lib/process-tree.ts:25,32-39` and
`src/runtime/agents/profile.ts:252-263`. tmux status fields also split whitespace at
`src/runtime/live/tmux/vt-channel.ts:774` and `src/runtime/agent-status-probe.ts:87`.

**What it does.** `split(/\s+/)` treats one or more whitespace characters, including tabs, as one
delimiter. `split(/\r?\n/)` removes the `\r` on CRLF input.

**What removing it would cause.** A tab-delimited or padded row would become one field, so PID,
provider, or model values would be misread or rejected. CRLF input would leave a trailing `\r` in
parsed values.

**Verdict: keep.** The regex is the correct split API here.
> Why are we using bash command for listing processes? Use bun native process listing or a library for that. You again treat code as strings instead of code.
---

## 11. Suffix alternatives and one-newline removal

**What it is.** Patterns that strip exactly one trailing newline or compare literal suffixes.

**Why it is needed.** A trailing newline is a record terminator written by a tool, not part of the
value. Trimming all whitespace would also remove intentional spaces; leaving the newline would
corrupt an exact ID.

**Where it is declared.** `src/runtime/live/tmux/vt-channel.ts:363-367` (one trailing `\n` from a
tmux option), `src/runtime/agents/opencode-v1.ts:140-150` (one trailing newline from a provider
receipt), and `src/runtime/agents/hook-script.ts:1-2,21` (ownership trailer).

**What it does.** Removes one final line-feed, not every whitespace character. Suffix checks match
an exact ending rather than a substring.

**What removing it would cause.** A provider receipt saved with its normal newline would produce an
ID that never matches on resume. Trimming all whitespace instead could silently change an exact ID.

**Verdict: keep.** The `pane-snapshot.ts` part of this item is now moot: that file was deleted.
> What is this? What's the use-case? I still don't understand. Why are you talking about pane-snapshot which is a deleted file?
---

## 12. Filesystem ownership and launch-environment sanitization

**What it is.** Path-canonicalization guards for locks and session directories, plus removal of
forbidden environment variables before launching an agent.

**Why it is needed.** A symlinked or redirected directory could move a lock, purge, or ownership
check outside the intended location. A stale inherited variable could route a launched process into
the wrong workspace or session.

**Where it is declared.** `src/runtime/session-launch.ts:95-115` (`sanitizeLaunchEnvironment`),
`src/storage/view-state-store.ts:69-94` (`canonicalViewLock`), and
`src/runtime/sessions.ts:148-173` (`canonicalDirectoryTarget`).

**What it does.** Environment sanitization copies the environment and deletes names in
`FORBIDDEN_ENV`. The path helpers resolve through the nearest existing ancestor and refuse
redirected or dangling paths and crossed lock namespaces.

**What removing it would cause.** A symlinked task or state directory could redirect purge or
locking outside the project. A forbidden variable such as `AGENTIC_WORKSPACE_TASK_ID` could leak a
stale identity into a launched session.

**Verdict: keep.** These are ownership and isolation boundaries.
> No need to sanitize env variables. This is the same as opening opencode or another harness directly from the terminal. It would have access to the terminal's env variables. No need to do something that is not done already by the terminal.
> 'AGENTIC_WORKSPACE_TASK_ID' - who said this is a forbidden variable? Stop with theh env variable stripping. I told you that already.
> What sanitation are you doing to verify that the path is not opened from outside the current project folder? Use path functions and do not use regex. Treat code as code and not as strings.
---

## 13. Keybinding modifier matcher

**What it is.** The parser that turns canonical chord text such as `C-S-x` or `A-Up` into a key
plus modifier flags, and the normalizer used for comparison.

**Why it is needed.** Keymap files use a compact chord syntax. Event dispatch receives terminal
key names that differ from that syntax. The parser and normalizer make the two comparable.

**Where it is declared.** `src/renderer/opentui/keybindings.ts:46-70` (`keyFromCanonical`) and
`src/renderer/opentui/keybindings.ts:311-318` (`normalizedKey`).

**What it does.** Repeatedly consumes leading `C-`, `S-`, `M-`, `A-`, `Alt-`, or `Option-`
prefixes into flags, then canonicalizes the remaining key. It equates `Return` with `enter`, space
with `space`, and `{` with shifted `[`, while preserving modifiers.

**What removing it would cause.** `C-S-x` would be treated as a literal key name rather than
Ctrl+Shift+X, and terminal aliases such as `Return` and `enter` would stop matching.

**Verdict: keep.** It is the keymap's grammar and equality rule.
> This sounds like something pretty much every terminal app using keybindings use. Find what other tui apps are doing for this. Send a librarian for that, do the research, send oracle to validate this and write a research report for this with alternatives and offered solutions.
---

## 14. Agent wrapper methods and Pi's sanitization hook

**What it is.** The `Agent` interface's adapter methods, including `sanitizeLaunchPreset`, and
Pi's identity implementation of that method.

**Why it is needed.** Every provider adapter must present the same contract: command construction,
preparation, identity reconciliation, hook installation, and preset sanitization. The interface
declares `sanitizeLaunchPreset` as required, not optional.

**Where it is declared.** `src/runtime/agents/agent.ts:126-160` (the interface, with
`sanitizeLaunchPreset` at line 134) and `src/runtime/agents/pi.ts:88-92` (Pi's implementation).
The other adapters implement it at `opencode-v1.ts:76`, `opencode-v2.ts:139`, and `claude.ts:98`.

**What it does.** Each adapter maps the shared lifecycle to its provider. Pi returns the preset
unchanged because Pi has no provider-specific forbidden launch flags to strip. OpenCode and Claude
remove their own approval flags.

**What removing it would cause.** Without the method, Pi would no longer satisfy `Agent` and could
not be used through the shared interface. Applying another provider's sanitizer to Pi would strip
arguments Pi does not use.

**Verdict: keep.** The hook is required by the interface, and Pi's no-op is the correct Pi
behavior.
> I don't understand this scenario. You did not explain this well. Give me an example