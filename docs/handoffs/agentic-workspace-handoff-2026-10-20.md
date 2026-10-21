# Handoff — AgenticWorkspace audit remediation

Date: 2026-10-20. Repo: `/Users/imribarr/Projects/agentic-workspace`.
Continues: implementing all 20 approved findings in `docs/audits/code-rules-architecture-review.md` plus the approval-contract decision. That audit document holds 23 user annotations; never edit or overwrite them.

## Permission problem (why nothing is verified)

Execution is blocked: `bun test <file>` denied, `bun run test` denied, typecheck/build attempts denied, reading `~/.config/opencode/agent-config.json` denied. The orchestrator has no shell tool; subagents inherit the denial. Writing outside the repository was also denied. No test, typecheck, build, CLI rebuild, or Nix build has run. All behavior claims are source-level only.

## Completed in source (unverified)

Findings 1–20 implemented. Owning rules live in `AGENTS.md`, `docs/CONVENTIONS.md`, `docs/BLUEPRINT.md`, the `docs/specs/*` and `docs/blueprints/*` pages, and `docs/adr/0011-*.md`; do not restate them.

- 1 Session lifecycle ownership: `src/model/session/session.ts`, `src/controller/session-application.ts`, `src/model/session/types.ts`, `src/runtime/session-runtime.ts`.
- 2 `src/runtime/harness-environment.ts`: literal substitution for the three reserved workspace paths only; other refs, reserved overrides, NUL and command substitution rejected; pseudo-shell removed. `AGENTIC_WORKSPACE_VALUE_*` absent from `src/**` and `scripts/**`.
- 3 `src/model/session/config.ts`: single field-wise model; renderer JSON merge and inherited-snapshot cloning removed; sparse typed patches.
- 4 SESSION-012 soft limit in `SessionApplication`: `maxSessions` default 10 via startup option; start/resume never blocked; only positively idle stopped longest-idle-first; working/permission/unknown protected.
- 5 File/hash artifact approval retired; task/mode approval via task frontmatter (`Task.setModeApproval`); ADR-0011 written, ADR-0002 partially superseded; existing `.artifacts.json` bytes untouched.
- 6 `src/storage/view-state-store.ts` propagates instead of reseeding.
- 7 `src/storage/file-system.ts` `loadConfig()` returns null only on ENOENT, else throws with cause.
- 9 `Storage` owns persistence, admission claims, journals (`src/storage/workspace-control-store.ts`); `Core` holds no filesystem and no compatibility alias.
- 11 Task mutation ownership: `Task.applyUpdate`, `Task.forUpdate`, `Task.applyBoardPlacement`, `TaskOrdering.boardColumns`, `DependencyValidator`; `Core.markTaskDone`.
- 12 Typed configuration patches; renderer duplicate validators deleted.
- 13 Provider discovery moved into `src/runtime/agents/{pi,opencode}/*`.
- 14 `parseTaskId`-backed id validation in task schema and storage.
- 15–16 Owned-fixture teardown, aggregated cleanup errors, serialized argv capture helper, tmux teardown verification before socket removal.
- 17 `runTaskEdit` title/description only; batch/wizard/watch-json removed.
- 18 `scripts/cli.cjs` passes `rawArgs` unchanged.
- 19 Focused tests moved beside owners.
- 20 `flake.nix` pins Bun 1.4.3 with official per-platform hashes; `@types/bun` still 1.3.14; no `nix build` run.

Post-review additions: primary error preserved with cleanup/release failures aggregated (`src/controller/task-lifecycle-service.ts`, `src/storage/session-store.ts`); `core.deleteMode(modeId, { confirmed: true })` refuses last mode, preflights every target before any stop, stops only the deleted mode's sessions, first-remaining default, truthful partial reporting; `askPrevious`, `discardModeSessions`, `removeAgentPreset`; `SessionRuntime.attach/detach` + `SessionProcess.terminalTarget()` with one `HarnessSessionRuntime` from `createApplication(projectRoot)` in `src/index.ts`; legacy `src/runtime/sessions.ts`, `src/runtime/session-service-mechanics.ts`, `src/model/session/mode-lifecycle.ts` deleted and `mode-model.ts` reduced to pure `resolveCallingMode`; persisted session `status` reads removed (view-model `status` populated from `snapshot.state` is intentional); docs corrected where they presented removed classes or destination-based mode deletion as current.

## Still to do

1. Verify, in order:
   ```
   bunx tsc --noEmit
   bun test <affected suites>
   bun run test
   bun run build
   find src -name '*.ts' -newer dist/agentic-workspace   # must print nothing
   agentic-workspace --help
   ```
   Expect real typecheck errors; nothing has compiled yet. Fix narrowly, no redesign.
2. Approved state-data cleanup, not executed. State root is `/Users/imribarr/Projects/agentic-workspace/.agentic-workspace` (26 task `state.json` files, no `mode-deletion.json`). One-time removal of `status`, `endedAt`, `error`, `resumeProbeFailed` from session records only:
   ```
   cd /Users/imribarr/Projects/agentic-workspace
   find .agentic-workspace -name state.json -print0 |
   while IFS= read -r -d '' f; do
     jq -e 'has("modes")' "$f" >/dev/null 2>&1 || continue
     cp "$f" "$f.bak"
     jq '(.modes // {}) |= with_entries(.value.sessions |= map(del(.status,.endedAt,.error,.resumeProbeFailed)))' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
   done
   ```
   Only those keys removed; conversations and other fields preserved; jq renormalizes whitespace, hence backups; journals stay byte-untouched.
3. Repair any fallout from deleted suites and relocated APIs.

## Known gaps and risks

- Coverage is thinner: `src/test/contracts/artifact-approval-contract.test.ts`, old `src/test/task-delete.test.ts`, `src/test/opentui-agent-host-cleanup.test.ts` deleted; `src/test/agent-sessions.test.ts` reduced to four tests. Cap and mode-deletion coverage now in `src/controller/session-application.test.ts` and `src/test/contracts/mode-lifecycle-contract.test.ts`; real-process teardown coverage in `agent-sessions.test.ts` lost; task deletion only partly covered by `src/test/task-container-lifecycle-contract.test.ts`.
- Cross-window idle eviction is effectively per-window: other windows' retained records never report positive idle, so they count but are never evicted; the spec's "limit may remain exceeded" fallback covers it.
- `maxSessions` has no config field; startup option default 10.
- The legacy `destination` field survives only in the journal validator to reject old journals byte-preservingly.
- `applicationOwned` remains in `src/renderer/opentui/workspace-controller.ts` as a UI notion; confirm it is not leftover dual-engine logic.
- `src/controller/agentic-workspace.ts` exposes `projectConfigPath`/`workspaceDirectory` via Storage; `docs/blueprints/controller.md:279` says Controller never holds a workspace path — decide whether that rule means no stored path access or needs enforcement.

## Key files

`src/index.ts`, `src/cli/{commands/agent-workspace,register}.ts`, `src/controller/{agentic-workspace,session-application,workspace-state,task-lifecycle-service}.ts`, `src/model/session/{session,types,config,mode-model}.ts`, `src/model/task/*`, `src/storage/{storage,session-store,workspace-control-store,file-system,task-artifact-repository,view-state-store}.ts`, `src/runtime/{harness,session-runtime,session-process,session-launch,session-ask,harness-environment}.ts`, `src/runtime/agents/**`, `src/renderer/opentui/{workspace-controller,workspace,agent-settings,session-picker,task-artifact-view}.ts`, `scripts/benchmark-task-loading.ts`, `flake.nix`.

## Suggested skills

- `ponytail-review` — review the unverified integrated diff before trusting it.
- `diagnosing-bugs` — for failures from the first typecheck/test run, one at a time.
- `tdd` — for any missing behavior found while fixing fallout.
