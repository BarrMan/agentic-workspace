---
task_schema_version: 3
id: BACK-21
title: CLI for agent task to communicate with previous session
status: Done
assignee: []
created_date: '2026-10-08 14:54'
updated_date: '2026-10-08 16:03'
labels: []
dependencies: []
ordinal: 21000
agentConfiguration:
  selectedPreset: opencode
  presets:
    opencode:
      command:
        - opencode
      env: {}
      prepare: ''
      bootstrap: opencode
    claude:
      command:
        - claude
      env: {}
      prepare: ''
      bootstrap: claude
    pi:
      command:
        - pi
      env: {}
      prepare: ''
      bootstrap: pi
      resumeFlag: '--session'
  sessions:
    worktreePerTask: true
    yoloMode: true
description: >-
  # Goal


  Give the active agent a `agentic-workspace` CLI command to ask the previous
  (handed-off) agent a

  question and receive its answer, so follow-up questions that were already
  answered in the

  prior session do not require re-derivation.


  # Current state (verified on this branch)


  There is NO Agent interface today. Provider behavior is dispatched off the
  `AgentPreset.bootstrap`

  string with `switch`/`if` branches spread across:


  - `src/agent-workspace/bootstrap.ts` — launch/resume command, yolo flag,
  native session id

  - `src/agent-workspace/session-launch.ts` — `prepareAgentLaunch` branches,
  `createOpenCodeSession`, `LAUNCH_REFUSALS`

  - `src/agent-workspace/status-hooks.ts` — hook-backed providers,
  `installStatusHooks`

  - `src/agent-workspace/agent-status.ts` — `chromeProviderForBootstrap`

  - `src/ui/opentui/agent-settings.ts` — duplicated resume-flag switch and
  unavailable list


  Supported (launchable) providers: `opencode`, `claude`, `pi`. The generic
  `prompt` custom-command

  preset and the unsupported providers are removed (see decisions).


  # Locked decisions


  1. Introduce an `Agent` interface carrying provider-specific methods only;
  generic lifecycle
     (`start`/`stop`/`attach`/`output`) stays in `AgentSessionService` (decision 1a).
  2. One class file per agent. Adding a new agent = new

  `src/agent-workspace/agents/{agentName}.ts`
     plus one line in `agents.ts`.
  3. Remove the generic `prompt` preset and the Settings "New preset" button /

  CLI custom-preset
     creation. Settings may still edit scoped overrides (command/env/resumeFlag) for built-in agents.
  4. Remove unsupported adapters (`codex`, `gemini`, `antigravity`, `omp`)

  entirely from types,
     built-in presets, UI, and code. They are never mentioned.
  5. `ask` defaults to the previous session, refuses a `running`/`starting`

  target, sends the
     question verbatim, appends the provider auto-approval flag, and prints the answer plainly.
  6. Phased delivery: Phase 1 (interface refactor) -> commit -> Phase 2 (`ask`).

  7. Verified headless resume syntax: `opencode run --session <id> <q>`;
     `claude -p --resume <id> <q>`; `pi -p --session <id> <q>`.
  # Phase 1 — Agent interface refactor (behavior-preserving)


  New `src/agent-workspace/agents/`:

  - `agent.ts` — `Agent` interface plus `AgentLaunchRequest` and

  `AgentPreparation`.

  - `agents.ts` — registry (`name -> Agent`), `agentFor(name)`,

  `registerAgent(agent)`.

  - `opencode.ts`, `claude.ts`, `pi.ts` — classes implementing the

  provider-specific methods.


  Interface (provider-specific only):

  - readonly `name`, `supported`, `hookBacked`, `chromeProvider`

  - `nativeSessionIdForLaunch(sessionId)`

  - `yoloFlag()`

  - `launchCommand({ preset, bootstrapPath, nativeSessionId })`

  - `resumeCommand({ preset, nativeSessionId })`

  - `prepare(request)` — provider-specific launch work (skills, hooks, native

  session seeding)

  - `installStatusHooks(options)`

  - `askCommand({ preset, nativeSessionId, question })` — added in Phase 2


  Steps:

  1. Add `agents/`; move the provider branches from `session-launch.ts:180-277`

  and
     `createOpenCodeSession` into the classes.
  2. Delegate existing helpers to the registry: `buildAgentLaunchCommand`,

  `buildAgentResumeCommand`,
     `nativeSessionIdForLaunch`, `yoloFlagFor`, `isHookBacked`, `installStatusHooks`,
     `chromeProviderForBootstrap`. Keep their signatures so call sites and tests move minimally.
  3. Keep `prepareAgentLaunch` as the shared orchestrator (mkdtemp, skill dir,

  cleanup) that
     delegates the provider part to the agent.
  4. Remove `prompt` from `AGENT_BOOTSTRAP_TYPES`, `BUILT_IN_CONFIGURATION`, and

  all
     `case "prompt"` branches; remove custom-preset creation in
     `commands/agent-workspace.ts:318-352` and `customPreset`/new-preset UI in `agent-settings.ts`.
  5. Remove `codex`/`gemini`/`antigravity`/`omp` from types, built-ins,

  `LAUNCH_REFUSALS`,
     `status-hooks.ts`, chrome mapping, and UI lists.
  6. Migrate the tests that use `bootstrap: "prompt"` as a generic fake agent

  (~16 files) to a real
     adapter with a fake command (e.g. `pi`/`claude`) or a test-injected agent via `registerAgent`.
  7. Verify: `bun run build` and `find src -name '*.ts' -newer
  dist/agentic-workspace`

  prints nothing,
     `bunx tsc --noEmit`, `bun run check .`, scoped tests.
  8. Commit Phase 1 on its own.


  # Phase 2 — ask


  - Add `askCommand` to each agent class (syntax above; opencode adds `--auto`,

  claude adds
    `--dangerously-skip-permissions`, pi none).
  - `AgentSessionService.ask(taskId, question, { sessionId? })` in

  `sessions.ts`: resolve the
    previous (most recent non-active) session unless `--session`; require a supported agent with a
    `nativeSessionId`; refuse `running`/`starting`; run via the injected `ProcessRunner` in
    `session.cwd` with `launchEnvironment(presetSnapshot)` minus `FORBIDDEN_ENV`; internal timeout;
    return trimmed stdout; throw with stderr on failure.
  - CLI: `agentic-workspace agent-session ask <taskId> <question> [--session
  <id>]` in
    `commands/agent-workspace.ts`.
  - Docs: add an "Ask the previous session" section to

  `src/agent-workspace/task-skill.ts` (the
    plugin agents load) and `src/guidelines/cli-instructions/agent-workspace.md`.
  - Tests: per-agent `askCommand` units; a service case via

  `FakeTmux`/`ProcessRunner` in
    `src/test/agent-sessions.test.ts`; an end-to-end CLI case in
    `src/test/agent-workspace-cli.test.ts`.
  - Verify and meet the DoD.


  # Definition of Done


  - `bunx tsc --noEmit` passes when TypeScript is touched.

  - `bun run check .` passes when formatting/linting is touched.

  - `bun test` (or the scoped test) passes.

  - The binary is rebuilt after every code change (`bun run build`), with no

  `src/**/*.ts` newer
    than `dist/agentic-workspace`.
---

