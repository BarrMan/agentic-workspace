## Root cause
- opencode askCommand emitted 'opencode run --session <id> --auto <q>', which resumes the build agent and starts a long autonomous turn (edits, subagents). ASK_TIMEOUT_MS=120000 killed it.
- BunRunner.run discarded captured stdout/stderr on timeout, so the interim answer was lost.
- The question DID reach the native OpenCode session (verified in opencode.db); the reporter checked the tmux .log, which the separate ask subprocess never writes to.

## Fixes
- session-utils.ts: added SessionCommandResult.timedOut.
- session-process.ts: on timeout return exitCode 124 plus captured stdout/stderr with timedOut=true instead of throwing.
- sessions.ts ask(): returns { answer, timedOut }; partial stdout returned on timeout, empty timeout throws, timeout configurable via BACKLOG_ASK_TIMEOUT_MS.
- commands/agent-workspace.ts: prints the answer and warns on stderr when timedOut.
- agents/opencode.ts: ask now uses the read-only '--agent plan'.
- task-skill.ts: skill now says read the active task first, and each command has a one-line explanation.
- AGENTS.md: dog-fooding note that the globally installed backlog command is authoritative (not the source tree or git branches).

## Verification
- 73 affected tests pass (bootstrap, session-process, agent-sessions, skill, session-launch); no test spawns a real agent.
- tsc --noEmit clean; biome check exits 0.
- Worktree dist/backlog rebuilt; 'find src -newer dist/backlog' empty.
- NOTE: /opt/homebrew/bin/backlog points at the main checkout dist, so the globally installed command still runs pre-fix code until this branch merges to main and main is rebuilt.