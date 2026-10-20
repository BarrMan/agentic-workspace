# Retained research and safety rationale

This is supporting evidence, not a contract. The [evidence/review index](normalization-refactor-decisions.md) identifies current implementation paths and unresolved ownership. Earlier Q numbers are retained only where they preserve unique rationale; outdated proposed implementations and status claims have been removed.

## Q7 — Process library

The earlier research compared Bun process-table support with `ps-list` (no `pgid`/`stat` fields), `pidtree` (parentage/PIDs only), and platform-specific `/proc` versus macOS `libproc`/sysctl implementations. Current `src/lib/process-tree.ts` uses `@3leaps/sysprims` `processList` and `terminateTree`; there is no current `ps` parser or per-process `pgid` handling in that module. Tree termination by library carries a known edge case: a reparented descendant that leaves the captured tree may survive. The earlier `ps`/`pgid` tradeoff is historical, not a current implementation description.

## Q9.1 — Session-file delete guard

Session sidecars are derived as `<taskDir>/<sessionId>.log` and `.md`; the intended safety boundary is exact resolved-path containment plus `lstat` regular-file checks before unlink, rather than trusting persisted paths or a string prefix. The log is used for captured session output; the Markdown sidecar supplies the bootstrap prompt and may be recreated on launch. Deleting either can affect output retrieval or prompt composition.

## Q9.2 — Tmux takeover ownership

Takeover depends on session name and root/task/session/role ownership facts. Treat each as a typed value and compare the values; do not concatenate a tag and parse it back. Pane title is display text, not identity, and duplicate titles are valid.

## Q9.3 — Workspace-context shape and ownership

`AGENTIC_WORKSPACE_WORKSPACE_CONTEXT` crosses a process boundary as environment text and can be replaced at launch. Parse JSON and validate its object shape, allowed fields, version, pane ID, absolute root, conversation fields, and native session ID; construct the accepted value from validated fields. Shape validation is not proof of ownership: canonical project-root and exact pane/root/task/session tag checks remain separate. A malformed pane such as `42` instead of `%42` must not reach tmux target selection.

## Q9.4 — Tmux absence classification

When a pane/session disappears between inspection and cleanup, callers may treat only genuine absence as absent; permission, transport, and unrelated command failures must remain errors. Earlier research proposed structured tmux exit-status checks instead of stderr text matching. That proposal is not a settled contract; consult current session-runtime contract and implementation before changing behavior.

## Q9.5 — Recursive purge containment

Recursive purge must not escape the project through redirected or symlinked paths. Use path/filesystem containment, not regex or string-prefix comparisons. This directory-level guard is distinct from Q9.1's per-sidecar file check.

## Q10 — Provider-native session capture

Earlier research investigated replicating AOE-style provider-native `agent_session_id` capture rather than relying on a generic receipt. It proposed provider-specific mechanisms:

- Claude: pin a fresh UUID; capture via `SessionStart`/`UserPromptSubmit` hooks or transcript fallback; resume with `--resume`, launch pinned sessions with `--session-id`.
- OpenCode: preassign `ses_<UUID>` through a short-lived host `opencode serve` request; resume with `--session`.
- Codex: host hook capture, sandbox rollout-file fallback keyed by matching cwd; resume through its `resume` subcommand.
- Gemini: sandbox chat-file capture with project-hash validation; host capture was unsupported in that research; resume with `--resume`.
- Pi: optional pinned UUID plus extension-published sidecar validated against transcript header; resume by path where known or pinned ID.
- Antigravity lacked a researched capture/resume path; Hermes, Kimi, OMP, and Prime Agent needed provider-specific source research before implementation.

These are research notes, not approval or a statement of current support. Verify provider-specific requirements in the owning session contract before acting; unresolved provider coverage remains unresolved rather than implied by this list.

## Q12 — Sanitizer rationale

Historical decision rationale: do not silently strip user-selected command flags from a preset. A user-authored command is their intent; if a bypass mode is selected, represent it as an explicit launch choice and disclose it. This rationale does not authorize reintroducing adapter sanitizers. The current index records that explicit bypass flags plus disclosure were verified; the session contract owns required behavior.

## Other settled research pointers

- Keybinding modifier matching alternatives, semantics, migration sketch, and source links: [research note](../research/keybinding-modifier-matching.md).
- Task/config migration must be explicit; no real user data was migrated in this review. See the [evidence index](normalization-refactor-decisions.md).
