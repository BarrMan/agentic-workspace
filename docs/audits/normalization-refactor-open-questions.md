# Normalization Refactor — Decisions

Status: supporting evidence, not a contract.

## Q2 — List input uses Commander arrays

Decision: use Commander's array/variadic option support. Delete `parseClearableStringList` and the
custom comma splitting. Blank input no longer clears a list. Clearing dependencies, references, or
documentation uses `--clear-deps`, `--clear-refs`, or `--clear-docs`. No custom list parser remains.

## Q7 — Process library

Decision: **A1 — `@3leaps/sysprims` + `terminateTree`, no per-process `pgid` field.**

`src/lib/process-tree.ts` currently runs `ps -axo pid=,ppid=,pgid=,uid=,stat=,comm=,lstart=` and
parses the output with a regex. It uses `pgid` to kill a process group, including descendants that
outlive `kill-pane` and `kill-server`.

No maintained TypeScript/npm library reviewed exposes per-process `pgid` as a process-list field.
`@3leaps/sysprims@0.2.4` is the closest: it exposes `processList`, `procGet`, `descendants`,
`killDescendants`, `terminateTree`, `signalSendGroup`, and `selfPGID`, and documents Bun >=1.3,
macOS arm64, and Linux. Its records include `pid`, `ppid`, and `name`; verify the exact `state` and
start-time fields against the installed types. It has no per-process `pgid` field.

Implementation: use `processList`/`procGet` for inspection and `terminateTree` for cleanup. Delete the
custom `ps` parser. Accepted risk: a reparented descendant that leaves the tree can survive
`terminateTree`. If that must be killed, use A2 — a small native `getpgid` binding — because no npm
library supplies it.

## Q9.1 — Session-file delete guard

Decision: keep, and extend it to single-session deletion.

`purge()` resolves the task directory, requires exact resolved equality for
`<taskDir>/<sessionId>.log` and `.md`, then uses `lstat()` to require a regular file and reject a
symlink. It does not use string-prefix parsing. Single-session `delete()` currently trusts the
persisted `outputPath` and `bootstrapPath`; it must use the same path-derived guard.

Implementation: derive expected paths from the trusted task directory and validated session ID.
Compare with `path.resolve`/`path.relative`; check with `lstat()`; then unlink.

## Q9.2 — Tmux takeover tag guard

Decision: keep, but read ownership as typed values.

The guard compares the session name, root tag, task ID, session ID, and role. These are ownership
facts, not display text. Read each value as its own tmux value and compare the values. Do not
concatenate them into one tag string and parse it back apart.

## Q9.3 — Workspace-context shape check

Decision: keep the validation.

**Why the env var exists:** a launched agent must tell the CLI which shared tmux pane, task, session,
and mode owns it. `AGENTIC_WORKSPACE_WORKSPACE_CONTEXT` carries that identity.

**What uses it:** `resolveCallingSession` reads it to find the calling session and its mode. The ask
path uses it to forward workspace identity only when the caller matches the target. `readWorkspaceContext`
also verifies the canonical project root and the exact tmux pane and its root/task/session tags.

**What happens without it:** the calling-mode lookup fails with “A valid calling workspace conversation
context is required,” and session asks cannot forward workspace context.

**How it can be malformed:** it crosses a process boundary as an environment string, and
`session-launch.ts` can replace it with a caller-provided environment value. A concrete bad value is
`{"v":2,"paneId":"42","rootDir":"/repo"}`: valid JSON, but `paneId` lacks the required `%`. Without
validation, `"42"` reaches the tmux target lookup and selects the wrong target or fails there.

The check is `JSON.parse` plus object/field validation: allowed keys, non-null object, version `2`,
pane-ID shape, absolute root, conversation field types and ID shapes, and a nonempty native session
ID. It constructs a new object from accepted fields. It is object validation, not string manipulation.
It does not prove ownership; root and pane/tag checks happen separately.

## Q9.4 — Tmux absence matching

Decision: keep the absence behavior; replace stderr-text matching with structured tmux status.

**Scenario:** `SessionProcess.exactPane` runs `list-panes -t =<sessionName>: -F <ownership fields>`.
If the pane or session disappeared between commands, tmux exits nonzero. The code must return
`undefined` only when the target is genuinely absent; any other failure must remain an error.
`killPane` must do the same before continuing process-tree cleanup.

**Why it is text today:** the tmux CLI reports failures as stderr text. The code matches `no server
running`, `can't find session: <name>`, and `can't find pane: <paneId>`. That works, but it is
error-string parsing. Replace it with `has-session`/`list-sessions` exit status plus an exact
session-name check.

**Duplicate pane title:** there is no title uniqueness check. `create()` creates a new named tmux
session and then sets the pane title to `<taskId> <role>`. A duplicate title is allowed and does not
identify a pane. Title is display data, not identity.

**Find pane by title:** no such function exists. `findTmuxPanesByTaskAndRole` filters by ownership
metadata (root, role, task/session IDs); its rows include `title`, but title is not the lookup key.
`SessionProcess.findPane` also uses verified ownership and role, not title.

## Q9.5 — Recursive purge containment

Decision: keep the guard and use path/filesystem APIs, not regex or string prefixes.

**What the files are:**

- `<taskDir>/<sessionId>.log` is the session output log. tmux pipes pane output into it with
  `cat >> <outputPath>`. It is read for session output/transcript display. If deleted, output
  retrieval fails until the pipe recreates it.
- `<taskDir>/<sessionId>.md` is the bootstrap prompt. It is written before launch with
  `renderSessionBootstrap({ taskId })`, read to compose the effective prompt, and rewritten on each
  launch. If deleted before the next launch preparation, prompt composition treats it as empty.

**What the guard prevents:** a symlinked or misconfigured task directory making a recursive delete
escape the project. This is the directory-level check; Q9.1 is the per-session sidecar check.

## Q9.6 — Environment handling

Decision: remove the dead legacy names immediately; keep only the current parent controls in the
filter.

Current code has one `LEGACY_ENVIRONMENT` list with six names. It is a mix:

- **Current parent controls, still read by the CLI:** `AGENTIC_WORKSPACE_CWD` (cwd override) and
  `AGENTIC_WORKSPACE_TASK_ID` (task approval). They must not leak into a nested harness, or the child
  resolves the parent's cwd/task.
- **Dead legacy names, no runtime readers:** `AGENTIC_WORKSPACE_SESSION_ID`,
  `AGENTIC_WORKSPACE_PROJECT_ROOT`, `TASK_ID`, `SESSION_ID`. Remove these names and their filter
  entries. There is nothing to redefine; the current path variables are different names.

**Why stripping exists:** to stop a nested harness from inheriting the parent's invocation context.
If the two current controls were inherited, a nested CLI would resolve the wrong project or act on the
parent's task. The four dead names add no protection because nothing reads them.

**Implementation:** rename the list to `PARENT_ENVIRONMENT`; keep only
`AGENTIC_WORKSPACE_CWD` and `AGENTIC_WORKSPACE_TASK_ID`; delete the four dead names. Inherit the rest,
then set `AGENTIC_WORKSPACE_PROJECT_DIR`, `AGENTIC_WORKSPACE_WORKTREE_DIR`, and
`AGENTIC_WORKSPACE_TASK_DIR`. Do not add a namespace-wide reset: `AGENTIC_WORKSPACE_TMUX_SOCKET`
must survive for tmux transport.

## Q10 — AOE session capture

Decision: replicate AOE exactly. No alternative capture design.

AOE stores the provider-native ID as `agent_session_id` on the instance. Capture is provider-specific:

- **Claude:** fresh launch pins a generated UUID v4. `SessionStart` and `UserPromptSubmit` hooks
  publish `session_id`. Transcript fallback is
  `<Claude config>/projects/<encoded cwd>/<id>.jsonl`. Resume: `--resume <id>`; fresh pinned:
  `--session-id <id>`.
- **OpenCode:** preassigns `ses_<UUID>` by launching a short-lived `opencode serve` and POSTing to
  `/api/session` with `id`. Host only; sandbox unsupported. Resume: `--session <id>`.
- **Codex:** host `.codex/hooks.json` `SessionStart` publishes `session_id`. Sandbox scans the newest
  post-launch `rollout-...-<uuid>.jsonl[.zst]` with matching `cwd`, taking the trailing UUID. Resume:
  `resume <id>` as a subcommand.
- **Gemini:** sandbox scans `tmp/<SHA-256(cwd)>/chats/session-*.json[l]`, reads `sessionId` or the
  filename stem, and verifies `projectHash`. Host unsupported. Resume: `--resume <id>`.
- **Pi:** fresh launch may pin a generated UUID. Extension
  `agent-extensions/pi-aoe-session-id.js` publishes `session_id` and `session_path` in a sidecar; the
  reader validates the transcript header. Resume: `--session <path>` when the path is known; fresh
  pinned: `--session-id <id>`.
- **Antigravity:** no capture backend and no resume flag at this commit.
- **Hermes, Kimi, OMP, Prime Agent:** provider-specific managed-store or publisher capture. The
  fetched sources do not establish exact paths.

Implementation must replace the v1 receipt file with these provider-specific mechanisms. Do not add a
generic hook. Read the exact provider modules for Hermes, Kimi, OMP, and Prime Agent before coding
those paths.

## Q12 — Launch sanitizer

Decision: delete `sanitizeLaunchPreset` and its tests. If a preset or user wrote a command to invoke
the harness, that command is the user's intent. Do not strip flags from it. YOLO remains a separate
launch option: when selected, the adapter appends its own flag.

## Settled — no action

- Assignees: one-time migration; no read compatibility.
- Priority: one-time migration; no read compatibility.
- Status: exact configured label.
- Paging: Commander parser callback.
- Prefix matching: delete the regex path.
- Profile commands: argv arrays; one-time migration.
- Hook trailer: delete.
