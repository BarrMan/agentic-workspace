---
consolidation:
  total: 685
  counts:
    exists: 55
    discard: 462
    integrate: 103
    unconfirmed: 65
  percentages:
    exists: 8.03%
    discard: 67.45%
    integrate: 15.04%
    unconfirmed: 9.49%
---
# Backlog.md test-suite improvement report

## Executive assessment

The suite has substantial behavioral coverage already. Its best examples exercise real temporary projects through Core, MCP tools, the controller, and filesystem repositories; preserve data on ambiguous failures; and use explicit gates for concurrency. <!-- consolidation: discard; ref: none; reason: Historical static assessment rather than current coverage evidence. --> The highest-value improvement is to make those contracts easier to trust and maintain, rather than add more tests indiscriminately. <!-- consolidation: discard; ref: none; reason: Audit prioritization is execution guidance rather than a durable contract. -->

Priorities:

1. **Protect isolation with adversarial preload tests and make CI actually use the runner's controls.** These affect whether every other test is trustworthy. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Remediation plan withdraws F1/F2 harness self-tests and core uses native runner ownership. -->
2. **Replace private-method and private-cache assertions with public outcomes.** Preserve resource limits and no-external-operation guarantees at their legitimate boundaries. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Public outcome tests must retain explicit resource and prohibited-effect contracts when private assertions are removed. -->
3. **Make controller/session fixtures structurally honest.** Several large test harnesses bypass required metadata and adapt themselves to production changes. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Require complete typed fixtures without harness repair of invalid metadata. --> <!-- consolidation: discard; ref: none; reason: Harness defect characterization is historical evidence. -->
4. **Make negative async assertions and contention tests deterministic.** Keep a small number of real filesystem/process checks alongside controlled boundary tests. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Use explicit completion/interleaving evidence while retaining real boundary coverage. -->
5. **Consolidate repeated behavior into literal scenario tables plus thin route checks.** Delete an existing behavior test only after identifying an equivalent replacement at an appropriate seam. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Independent literal expectations and equivalent replacement coverage are supported by later F11 remediation but absent from core. -->

This is a **static, report-only audit**, using the loaded `tdd` skill. No repository code, tests, configuration, or documentation was changed. No tests, builds, provider commands, tmux commands, or process-control operations were executed. This report is the sole written artifact. <!-- consolidation: discard; ref: none; reason: Historical audit method and evidence scope. -->

## 1. Scope, inventory, and confidence

### Inventory totals

| Physical test location | Files | Counted source lines |
| --- | ---: | ---: |
| `src/test/` | 239 | 58,291 <!-- consolidation: discard; ref: none; reason: Historical source inventory. --> |
| `src/agent-workspace/` directly | 37 | 8,921 <!-- consolidation: discard; ref: none; reason: Historical source inventory. --> |
| `src/agent-workspace/agents/` | 6 | 733 <!-- consolidation: discard; ref: none; reason: Historical source inventory. --> |
| `src/agent-workspace/live/` directly | 1 | 189 <!-- consolidation: discard; ref: none; reason: Historical source inventory. --> |
| `src/agent-workspace/live/input/` | 1 | 113 <!-- consolidation: discard; ref: none; reason: Historical source inventory. --> |
| `src/agent-workspace/live/tmux/` | 4 | 593 <!-- consolidation: discard; ref: none; reason: Historical source inventory. --> |
| `src/commands/` | 2 | 150 <!-- consolidation: discard; ref: none; reason: Historical source inventory. --> |
| `src/completions/` | 1 | 123 <!-- consolidation: discard; ref: none; reason: Historical source inventory. --> |
| `src/file-system/` | 4 | 348 <!-- consolidation: discard; ref: none; reason: Historical source inventory. --> |
| `src/ui/opentui/` | 4 | 686 <!-- consolidation: discard; ref: none; reason: Historical source inventory. --> |
| `src/utils/` | 1 | 23 <!-- consolidation: discard; ref: none; reason: Historical source inventory. --> |
| **Automated test files** | **300** | **70,170** <!-- consolidation: discard; ref: none; reason: Historical source inventory. --> |
| `scripts/smoke-compiled-build.ts` | 1 | Separate executable smoke check <!-- consolidation: discard; ref: none; reason: Historical source inventory. --> |
| `scripts/smoke-parallel-task-locking.sh` | 1 | Separate executable smoke check <!-- consolidation: discard; ref: none; reason: Historical source inventory. --> |
| **First-party test-bearing files inventoried** | **302** | <!-- consolidation: discard; ref: none; reason: Historical source inventory. --> |

Of the 300 automated test files, **293 are tracked and 7 are nonignored untracked files**. The seven are marked `U` in the appendix. Physically absent index entries are not existing tests. The working tree is evolving; these are captured inventory counts, not a permanent manifest or a statement about a commit. <!-- consolidation: discard; ref: none; reason: Historical inventory and tracking qualification. -->

There are 299 `.test.ts` files and one `.test.tsx` file, `src/test/dependency-graph-surfaces.test.tsx`. Two names also contain `.integration`: `opentui-settings-persistence.integration.test.ts` and `live/tmux/transport-detach.integration.test.ts`. <!-- consolidation: discard; ref: none; reason: Historical filename inventory. --> Other integration behavior is in ordinary `.test.ts` files; naming does not determine execution risk. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Determine external-effect risk from actual boundaries rather than test filename suffix. -->

The discovery pass checked test/spec suffixes and JS/TS variants, underscore test/spec suffixes, Python/Go test naming, and smoke/integration/e2e names. Relevant first-party roots checked were `src`, `scripts`, repository configuration/automation directories, `docs`, `backlog`, `completions`, and temporary-area naming results. Dependency, generated, `dist`, Git internals, lockfiles, transient runtime artifacts, and task/spec prose are excluded. No additional first-party test family outside the listed locations was found. Hidden `.github/workflows` was inspected explicitly. <!-- consolidation: discard; ref: none; reason: Historical discovery scope and method. -->

### Method and meaning of confidence

- **S — signal-only:** inventoried, assigned a family, and included in per-file line/signal scans. Its assertions and harness were not manually deeply reviewed. A zero signal count is not a clean bill of health. <!-- consolidation: discard; ref: none; reason: Local audit-confidence notation and limitations. -->
- **D — targeted deep review:** relevant assertion and harness chunks were read and compared with a stated contract or relevant source/configuration. This does **not** mean every assertion or the entire file was reviewed. <!-- consolidation: discard; ref: none; reason: Local audit-confidence notation and limitations. -->
- **U — untracked:** Git tracking metadata only, independent of confidence. <!-- consolidation: discard; ref: none; reason: Local inventory notation. -->

**30 automated test files received D review; 270 received S review.** Both smoke scripts received targeted D review. Appendix A accounts for all 302 files individually. For S files, family recommendations are review instructions, not verified file-level defects. <!-- consolidation: discard; ref: none; reason: Historical review coverage and confidence qualification. -->

Dedicated Globs established locations and naming. Scoped `rg --count-matches` supplied exhaustive physical-file counts and aggregate indicators; Git metadata identified untracked paths. Targeted reads validated findings. No temporary scripts or repository artifacts were created. No external research or agent delegation was used. `AGENTS.md`, `package.json`, `bunfig.toml`, the CI workflow, runner, and relevant helpers were inspected. No `GLOSSARY.md` or ADR collection was found by the scoped naming pass. <!-- consolidation: discard; ref: none; reason: Historical audit method and inspected-source inventory. -->

### Aggregate indicators, not defect counts

| Static indicator | Files containing it | Regex matches |
| --- | ---: | ---: |
| Unsafe double casts / `as any` / TS suppressions | 39 | 183 <!-- consolidation: discard; ref: none; reason: Historical static indicator count. --> |
| `sleep`, `Bun.sleep`, or `setTimeout` | 33 | 80 <!-- consolidation: discard; ref: none; reason: Historical static indicator count. --> |
| `spyOn`, `mock.module`, or call-count assertions | 25 | 133 <!-- consolidation: discard; ref: none; reason: Historical static indicator count. --> |
| Direct dotted environment assignments or `process.chdir` | 33 | 120 <!-- consolidation: discard; ref: none; reason: Historical static indicator count. --> |
| Combined risk-signal expression, including skip/todo markers | 94 | 533 <!-- consolidation: discard; ref: none; reason: Historical static indicator count. --> |
| Skip/gating markers, including interactive aliases | 14 | 34 <!-- consolidation: discard; ref: none; reason: Historical static indicator count. --> |

The categories overlap. The combined expression differs from the gating expression. Counts are regex occurrences, not distinct defects, tests, execution frequency, or runtime measurements. Bracketed environment assignments, indirect helper mutations, aliases, and other mocking styles can escape these expressions. <!-- consolidation: discard; ref: none; reason: Static metric interpretation and sampling limitations. --> Ordinary timers for bounded failures and genuine external-boundary mocks are often correct. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Controlled external boundaries and bounded test invocation are supported. -->

29 test files have at least 500 lines. A simple declaration-name scan found 2,757 `describe`/`test`/`it` declaration indicators in 296 files; this is **not a test count** because parameterization, concurrency modifiers, aliases, and generated cases differ. The large-file and declaration metrics only guide sampling. <!-- consolidation: discard; ref: none; reason: Historical static metrics and confidence limits. -->

## 2. Current architecture and TDD alignment

### Execution architecture

- Bun is the test framework. `bunfig.toml` loads `src/test/test-preload.ts` and enables `smol`. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Bun and shared preload ownership are specified. --> <!-- consolidation: discard; ref: none; reason: smol is historical configuration inventory. -->
- `package.json` routes `bun run test` through `scripts/run-ci-tests.ts --timeout=10000`. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Historical custom runner superseded by delegated native Bun procedure. -->
- The runner discovers Bun-compatible test/spec suffixes below `src`, selects `full` or a hand-written `platform` profile, and launches one process per test file. Defaults are five lanes and a 600,000 ms run deadline. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Historical custom runner configuration is superseded by native Bun procedure. -->
- `LONG_RUNNING_FILES` controls launch order. It is an optimization list, not proof of current runtime. No timings were measured in this audit. <!-- consolidation: discard; ref: none; reason: Historical runner inventory and evidence limit. -->
- CLI-referencing files trigger one temporary compiled CLI build. Workers receive `BACKLOG_TEST_CLI_BINARY`; `test-cli.ts:getTestCliCommand` otherwise uses the source CLI entrypoint. Text-based reference detection is a heuristic and can miss references hidden behind helpers. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Ordinary tests now require source CLI and remediation records bundle removal. -->
- Workers share a run-scoped temporary root but use unique project directories. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Shared preload isolation and owned fixtures remain required. --> Owned-process scopes, authenticated identity ledgers, cancellation, and terminal settlement govern runner cleanup. Unknown/survivor outcomes retain evidence instead of deleting it. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#error-handling-and-cleanup; reason: Preserve historical terminal-proof and evidence-retention gate pending reconciliation with retired runner and disposable scratch policy. -->
- The preload establishes Git test identity, removes workspace/provider pinning variables, and supplies a unique tmux socket when no override exists. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Git/provider setup and inherited override exception require reconciliation with current preload contract. --> Dedicated tmux helpers enforce test-owned labels for explicit real-server management. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Isolated tmux helper and owned resources are mandatory. -->
- Tests mix pure domain functions, temporary filesystem/Core integration, in-process MCP tool dispatch, native OpenTUI rendering, fake process/tmux boundaries, stub executable transport integration, and opt-in real interactive tests. <!-- consolidation: discard; ref: none; reason: Historical test-family inventory. -->
- CI runs the full profile on Linux, a platform subset on macOS/Windows, compiled smoke checks on three OSes, one explicitly enabled compiled interactive suite on Linux, and a Nix package version/help check. `release.yml` had no test/smoke execution matches in the scoped pass. <!-- consolidation: discard; ref: none; reason: Historical workflow inventory rather than a required current platform matrix. -->

### Proposed seams for future test work

These are recommendations for agreement before implementation, as required by the TDD skill. No tests are being written in this audit. <!-- consolidation: discard; ref: none; reason: Audit scope and proposal qualification. -->

| Seam | Catches | Deliberately does not prove |
| --- | --- | --- |
| Core task/query/mutation APIs with temporary disk | Identity, filtering, persistence, locking, data preservation | CLI argument parsing and transport framing <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Separate dense public semantic checks from adapter encoding and transport proof. --> |
| CLI process: exit status and public output | Routing, validation, output bytes, pipe/TTY behavior | Every internal Core branch <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Retain real process checks specifically for exit byte pipe and TTY contracts. --> |
| MCP `testInterface.callTool` and schema discovery | Tool schema, validation, response/error contract | Real stdio connection and compiled packaging <!-- consolidation: unconfirmed; ref: docs/SPEC.md#open-questions; reason: Exact MCP seam and retained scope require integration-scope disposition. --> |
| Session service public lifecycle with typed external-boundary doubles | Ownership, observation, resume/forget semantics, error nonmutation | Installed provider compatibility or real tmux parsing <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Real domain behavior with controlled provider boundaries does not prove live acceptance. --> <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: Historical session-service seam must be reconciled with concrete model and application ownership. --> |
| Session process/transport public adapter boundary | Exact target/provenance, cancellation, dispatch and teardown safety | End-to-end provider behavior <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Controlled external-boundary tests are distinct from live provider acceptance. --> |
| Controller public interaction/callbacks with real state/config where practical | Visible state, persistence, navigation, attach/detach | Native terminal behavior on every platform <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Real domain/store tests with controlled boundaries establish only exercised behavior. --> |
| Artifact repository public read/write/approval APIs | Path containment, byte hashes, approval invalidation | Full UI routing <!-- consolidation: discard; ref: docs/specs/tasks.md#task-artifacts; reason: Hash-bound artifact approval is superseded by generic files and task-mode approval. --> <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#task-artifacts; reason: Preserve file containment coverage while confirming the retained repository seam. --> |
| Runner invocation and structured result | Admission, profiles, deadline, settlement, artifact retention | Arbitrary unregistered external processes <!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: F12 harness-only work was withdrawn and native runner replaces the proposed custom runner seam. --> |
| Few fixture-owned real filesystem/process/terminal smoke checks | Actual adapter wiring, atomic rename, cross-process locks, cleanup | Complete semantics already covered at cheaper seams <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Retain minimal actual boundary wiring proof alongside cheaper semantic tests. --> |

### What already aligns well

- `task-search-parity.test.ts` checks independently expected IDs, not just equality between two implementations. <!-- consolidation: discard; ref: none; reason: Historical reviewed test evidence. --> Preserve that independent oracle. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Two matching implementations are not an independent correctness oracle. -->
- `task-type-filtering.test.ts` reaches Core, filesystem, persistent search, and CLI behavior. `mcp-task-type-filtering.test.ts` separately checks schema and dispatch boundaries. <!-- consolidation: discard; ref: none; reason: Historical reviewed test evidence. -->
- `atomic-task-edit.test.ts` asserts that final labels equal exactly the successful writers, while rejected writers report contention. This is the essential lost-write contract. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Concurrent mutation tests must independently verify successful writes survive and failed writes contribute no effects. -->
- `task-opaque-body-integration.test.ts` exercises persistence and rendering without private introspection. <!-- consolidation: discard; ref: none; reason: Historical reviewed test evidence. -->
- `shared-runtime-service.test.ts` uses public lifecycle calls and explicitly checks read-only observation and nonmutation on error. <!-- consolidation: discard; ref: none; reason: Historical reviewed test evidence rather than current verification. -->
- `session-process-tree-stop.test.ts` and `session-process-resources.test.ts` preserve strict foreign-ownership, inventory-provenance, explicit-stop, and retry behavior through boundary fakes. <!-- consolidation: discard; ref: none; reason: Historical reviewed test evidence rather than current verification. -->
- `owned-test-processes-deadline.test.ts` uses fake clocks/identities/signals, checks allowed targets, and does not actually signal OS processes. <!-- consolidation: discard; ref: none; reason: Historical test evidence for a later withdrawn suite. --> That is appropriate safety testing, not inherently bad mocking. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Controlled external boundaries are appropriate and only owned resources may be targeted. -->

### What cannot be inferred statically

Whether tests were originally written red-before-green, their historical regression sensitivity, real flake rates, branch coverage, test order independence, wall time, memory use, and actual platform success remain unverified. <!-- consolidation: discard; ref: none; reason: Historical audit evidence limits. --> Apply vertical TDD slices to future changes; do not claim a mass rewrite retrospectively makes the suite TDD. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Prospective small regression-sensitive cases cannot establish historical red-before-green. -->

## 3. Prioritized, evidence-backed findings

### F1 — P0: preload isolation tests need hostile inputs, not only ambient assertions

**Evidence:** `test-preload-isolation.test.ts` asserts nine variables are undefined and the current socket matches a generated-name pattern. It does not seed those variables before preload execution. `test-preload.ts` only generates/registers a socket if `BACKLOG_TMUX_SOCKET` is blank. `run-ci-tests.ts:runFile` spreads the parent environment into workers. <!-- consolidation: discard; ref: none; reason: Historical F1 source finding with later withdrawn self-test scope. -->

**Why it matters:** with an ordinary clean environment, deleting an environment-clearing line could leave the existing assertion green. <!-- consolidation: discard; ref: none; reason: Sensitivity diagnosis of a historical self-test. --> A supplied nonblank socket survives the preload; the source does not enforce test ownership at that point. A supplied socket can be legitimate for a nested runner, so the distinction must be explicit rather than blanket removal. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Inherited override and nested-runner policy require reconciliation with later trusted-override decision. -->

**Smallest improvement:** add one parameterized child/preload observation contract using a fixture-owned process and seeded workspace/provider variables. Observe only serialized environment/socket results; perform no tmux operation. Cases: no override creates an isolated label; valid test-owned override is retained and appropriately accounted for; `default`, a live-style label, or a malformed override is rejected or replaced before any backend access. Agree the override policy first. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: F1 self-tests and socket-pattern authentication were explicitly withdrawn in remediation plan. --> Keep `session-server-isolation.test.ts`'s constructor-only default-socket behavior; it does not itself contact tmux. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Retention of this historical constructor check is not established by current core. -->

**Preserve:** nested-runner ownership, inherited fixture scopes, provider-config clearing, and test-owned cleanup registration. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Preserve these isolation mechanisms pending reconciliation with native runner and trusted override policy. --> Do not weaken socket guards to make the harness simpler. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Isolated tmux helper and owned-resource restrictions remain mandatory. -->

### F2 — P1: CI controls and runner inputs have drifted

**Evidence:** `.github/workflows/ci.yml` supplies `BACKLOG_TEST_CLI_BUNDLE` and passes `--parallel=<matrix.test_workers>`. `run-ci-tests.ts` determines lane count from `BACKLOG_TEST_LANES`, forwards the unconsumed flags to each child, and constructs its own temporary compiled CLI. `test-cli.ts` reads `BACKLOG_TEST_CLI_BINARY`, not `BACKLOG_TEST_CLI_BUNDLE`. <!-- consolidation: discard; ref: none; reason: Historical runner handoff mismatch. --> The runner's `PLATFORM_CONTRACT_FILES` also names `src/test/auto-commit.test.ts`, which the current physical inventory does not contain. <!-- consolidation: discard; ref: none; reason: Historical missing profile entry finding. --> The workflow comment about a serial DOM pass is unsupported by the inspected runner body. <!-- consolidation: discard; ref: none; reason: Historical workflow-comment discrepancy. -->

**Why it matters:** matrix worker settings do not set outer runner lanes, the separate CI CLI bundle is not the handoff used by these helpers, and an absent platform-profile entry is admitted to file execution. This is verified configuration/source mismatch; no CI failure or exact Bun runtime response was observed. <!-- consolidation: discard; ref: none; reason: Historical runner diagnosis and evidence limit. -->

**Smallest improvement:** make the workflow use the existing lane environment variable; choose one intentional CLI artifact handoff and remove the redundant build only after preserving compiled smoke coverage; validate selected profile paths against discovery before launch. Add a small runner contract for explicit selection, profile existence, forwarded test flags, and reported lane count. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: F2 self-test work and temporary bundle were withdrawn and native runner supersedes lane controls. --> A mistyped explicit test path should fail promptly rather than accidentally expand the work scope. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Narrow-selection safety expectation needs disposition under native runner without reinstating withdrawn self-tests. -->

**Preserve:** the cross-OS platform contract profile, bounded deadline, JUnit artifacts, and separate distribution/compiled checks. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Exact platform profile JUnit and whole-run deadline gates need current execution-policy confirmation. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Compiled packaging/runtime verification is distinct from behavior tests. --> Do not replace the platform profile with indiscriminate cross-platform full-suite duplication. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Historical platform-matrix restriction is not established by current core. -->

### F3 — P1: controller fakes conceal required session metadata

**Evidence:** `opentui-workspace-controller.test.ts:composerCore`, `workspaceState`, `createWorkspaceState`, and `createController` use double casts, normalize legacy/default-mode state, and synthesize a session facade. `opentui-workspace-controller-shared-attachment.test.ts:fixture` returns an attachment record with `status: "RUNNING"` and no `tmuxName`, `cwd`, or `bootstrapPath`. `src/agent-workspace/types.ts:AgentSession` requires those fields; `AGENT_SESSION_STATUS` values are lowercase, including `"running"`. <!-- consolidation: discard; ref: none; reason: Historical fixture mismatch and type inventory. -->

**Why it matters:** the test can exercise paths with objects the production boundary is not supposed to produce. Harness repair code can hide a broken association or lifecycle projection. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Fixture validity must expose missing boundary metadata rather than silently repair it. --> Eighty-eight combined signal matches in the large controller file identify a review hotspot, not eighty-eight bugs. <!-- consolidation: discard; ref: none; reason: Historical metric and confidence limit. -->

**Smallest improvement:** use one small complete typed session/attachment fixture with `satisfies` and deliberate overrides. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Require complete typed boundary fixtures as adopted by remediation procedure. --> For lifecycle/persistence contracts, use real temporary Core/state rather than an expanding imitation. Keep renderer, activity probe, and transport fakes where they are external boundaries. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Prefer real domain/store behavior and controlled external boundaries. --> Remove default-filling adapters only after callers supply the actual declared contract. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Align callers and fixtures with interface changes. -->

**Preserve:** callback origin, project/task/session identity, canonical roots, native provider association, independent reader detach, and explicit-stop behavior. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#architectural-invariants; reason: Provenance observation and client lifetime are distinct from execution authority. --> An unsupported fixture field should fail during type checking, not be silently manufactured by the harness. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Type-check complete fixtures instead of repairing unsupported fields. -->

### F4 — P1: lifecycle observation contracts should be split into named vertical scenarios

**Evidence:** `shared-runtime-service.test.ts` parameterizes `nativeWorkspace` as undefined/false/true and, within one long observation test, checks a live STARTING record, transient probe failure, dead pane, absent pane, and queued absent pane. It already asserts no kill during observation, byte/state-equivalent durable state on transient error, and queued absence remaining `starting`. <!-- consolidation: discard; ref: none; reason: Historical observation-test evidence. -->

**Why it matters:** these are valuable current contracts, but one sequential scenario can prevent later states from being checked after an early failure. Backend flags are inputs, not the reason for the lifecycle rule. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Separate independent lifecycle outcomes into named cases so earlier failure cannot suppress later coverage. -->

**Smallest improvement:** retain a compact boundary fixture and separate named table cases for live STARTING, dead, conclusively missing without a request, missing with a queued request, and uncertain probe. Drive `reconcileTaskSessions`, `list`, and relevant lookup entrypoints; assert public state plus no prohibited mutations. <!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#identity-and-observed-state; reason: Exact historical states and service entrypoints require reconciliation with ephemeral observation and model ownership. --> Retain meaningful legacy flag variation as parameter coverage, not separate flag-specific semantics. <!-- consolidation: unconfirmed; ref: docs/SPEC.md#current-contract-only-policy; reason: No blanket authorization to preserve legacy flag compatibility. -->

**Preserve exactly:** observation never kills; <!-- consolidation: exists; ref: docs/BLUEPRINT.md#observation-and-running-session-limit; reason: Observation is non-destructive and cannot authorize stop. --> queued missing-pane STARTING remains STARTING; <!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#identity-and-observed-state; reason: Preserve queued-start safety intent while reconciling exact historical lifecycle state. --> transient errors are nonmutating; explicit stop is separately allowed to mutate. Do not resurrect an old destructive observation expectation. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#shared-operation-protocol; reason: Observation and failed probes cannot authorize execution effects. -->

### F5 — P1: tests of Git private methods pin implementation rather than user outcomes

**Evidence:** `git.test.ts` repeatedly casts `GitOperations` to access/replace `detectRepository`, `resolveRepositoryPaths`, and `execGit`. The reset test asserts the shared resolver call and exact Git argv. A timeout test asserts `clearTimeout` was called exactly once. Some timeout cases directly call the private executor. <!-- consolidation: discard; ref: none; reason: Historical private-method coupling finding. -->

**Why it matters:** replacing a resolver, consolidating detection, or changing timer implementation breaks tests without changing the advertised behavior. Constructor-only `toBeDefined` adds little regression value by itself. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Assert observable behavior instead of private helper choices or constructor existence. -->

**Smallest improvement:** for reset, create two staged paths in a temporary repository, invoke public `resetPaths`, and independently inspect staged versus unstaged changes and the untouched file. For repository detection, use real temporary repository/no-repository states. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Verify public Git effects with independent temporary-repository state as supported by F5 remediation. --> Keep subprocess timeout/pipe cleanup behavior at an agreed process-adapter seam with a controlled child or boundary double. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Controlled external boundaries and owned child teardown are required. --> If exact probe coalescing is a required performance contract, retain one explicit boundary test rather than private-patching every detection case. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Exact probe coalescing contract was conditional and not approved here. -->

**Preserve:** path normalization, root scoping, filesystem-only policy, bounded external commands, inherited-pipe settlement, and timer/resource release. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Preserve exact Git path and filesystem-only obligations pending current boundary-contract review. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#error-handling-and-cleanup; reason: Child cleanup must include inherited pipes timers and bounded external command settlement. --> A command-dispatch assertion is legitimate in a dedicated Git adapter test, but not a substitute for observable repository behavior. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Adapter syntax checks complement independently observed repository outcomes. -->

### F6 — P1: cache tests can retain behavioral strength while dropping private state inspection

**Evidence:** `filesystem-task-cache.test.ts:TaskCacheHarness` exposes `parsedTaskFiles`, read-generation maps, epoch counters, `readParsedTaskFile`, and `readTaskFiles`. Later cases assert map membership. Earlier cases already test public `listTasks`/`listCompletedTasks`, defensive copies, malformed-content failure, deletion/recreation, and same-size/same-timestamp edits, but mix them with parser call counts. <!-- consolidation: discard; ref: none; reason: Historical cache-test implementation finding. -->

**Why it matters:** cache representation changes require test rewrites, although stale-read and isolation risks are real. An exact parser-call total is weaker than stale-content detection unless avoiding repeated parsing is an explicitly agreed resource contract. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Test stale public results and agreed resource bounds instead of incidental private call totals. -->

**Smallest improvement:** express races through concurrent public listing/loading and gate file reads at the filesystem boundary. Assert later reads never publish stale/deleted content, returned mutable values cannot contaminate a later result, and selected roots remain isolated. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: F6 remediation supports public race outcomes with controlled file-read gates and independent root/mutation isolation. --> Consolidate parse-count checks into one named efficiency contract if retained. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Exact parsing efficiency requirement remains conditional. --> Preserve the external file-read concurrency cap, with the limit sourced from an agreed operational contract rather than an unexplained number copied into multiple tests. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Preserve explicit resource-cap tests and use the owning operational limit rather than duplicated magic numbers. -->

**Preserve:** malformed content never returns an old task; identical mtime/size does not conceal a byte change; cross-scan maximum resource usage is bounded. Do not delete the cap merely because it is not visible in a CLI string. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Retain malformed-content byte-freshness and cross-scan resource-bound regressions through cache refactors. -->

### F7 — P1: asynchronous absence checks need a completion fence

**Evidence:** `cli-json-watch.test.ts` sleeps 1,300 ms after rewriting unchanged bytes before asserting no extra snapshot; another site sleeps 1,100 ms. `live/existing-agent-host-observer.test.ts` waits 20 ms after stop/detach before asserting no reader output. `task-watcher.test.ts` waits for exactly eight internal reads to infer retry exhaustion. <!-- consolidation: discard; ref: none; reason: Historical async assertion finding. -->

**Why it matters:** elapsed time is not proof that a queued notification/retry has finished. Fixed retry totals couple tests to policy implementation. Positive polling with a bounded diagnostic deadline is different and often appropriate for real OS behavior. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Distinguish async completion evidence from elapsed-time absence while allowing bounded positive OS polling. -->

**Smallest improvement:** on controlled boundary tests, drive events and advance the relevant scheduler until idle; assert no publication after the public stop/detach promise resolves. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Negative async assertions need a completion fence with a documented guarantee. --> For real CLI watchers, retain a bounded observational window only where the contract is inherently temporal, and pair it with an explicit positive change proving the watcher stayed alive and suppressed duplicates. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Temporal absence checks need a positive liveness witness as supported by F7 remediation. --> For retry tests, assert last-good state survives the whole configured retry budget, without hard-coding eight collaborator calls unless that budget is the agreed interface. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Assert retry outcomes rather than incidental collaborator invocation totals. -->

**Preserve:** exact initial JSON bytes, no duplicate output, post-detach silence, real atomic-rename coverage, malformed versus absent distinction, and branch-only task preservation. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Preserve watcher byte duplicate detach rename and malformed/absent obligations pending current supported-surface review. --> <!-- consolidation: discard; ref: docs/specs/tasks.md#project-data-store; reason: Branch-only task discovery is superseded by one deterministic project store. -->

### F8 — P1: contention tests should release/drain gates even when an assertion fails

**Evidence:** `atomic-task-edit.test.ts` gates a held filesystem lock, but the cross-process case releases it after the child operation rather than in `finally`. Its larger CLI race adds 40 filler tasks to increase accidental overlap. `task-delete.test.ts` blocks `deleteTaskContainer`, starts deletion, then performs assertions before releasing the gate; its surrounding `finally` restores an environment variable but does not guarantee gate release. <!-- consolidation: discard; ref: none; reason: Historical contention-test finding. -->

**Why it matters:** an unexpected result can leave pending work alive while fixture cleanup begins. Filler tasks increase cost without guaranteeing overlap. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Gate overlap explicitly and settle started work before fixture cleanup. --> The existing winner-equals-final-labels assertion is strong and must remain. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Preserve exact successful-writer outcome oracle when simplifying contention fixtures. -->

**Smallest improvement:** place gate release and promise drain in `finally` immediately around each started operation. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#error-handling-and-cleanup; reason: Always release test gates and drain started promises including assertion failures. --> Keep one real cross-process contention/retry test; test the nuanced admission interleavings with explicit gates. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Preserve real cross-process lock proof alongside deterministic controlled races. --> Where a fixture executable is used, provide a readiness handshake rather than relying on startup duration or expanding task corpora. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Readiness handshakes establish overlap without timing guesses or filler data. -->

**Preserve:** at least one writer succeeds; failed writers fail loudly and contribute no labels; every successful writer's label survives; <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Concurrent write oracle must account exactly for successful and rejected effects. --> deletion locks prevent all competing session admission paths; retry works after release. <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#repeated-and-concurrent-requests; reason: Preserve admission safety checks while exact concurrent deletion and retry outcomes remain open. -->

### F9 — P1: strict negative resource assertions need exact-match scrutiny

**Evidence:** `session-process-resources.test.ts` records destruction events such as `kill-pane:resource-present` and `kill-pane:resource-absent`. Most cases check those qualified values or `startsWith("kill-pane:")`; the malformed-inventory loop checks only `not.toContain("kill-pane")`. <!-- consolidation: discard; ref: none; reason: Historical weak-negative assertion finding. -->

**Why it matters:** exact array containment of the unqualified string does not catch a qualified destructive event. This is a verified assertion mismatch, not proof production cleanup is incorrect. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Negative effect assertions must match the actual recorded event vocabulary. -->

**Smallest improvement:** assert `events.some(event => event.startsWith("kill-pane:")) === false`, and also assert the ownership marker and inventory remain intact after each failure. Reuse the already stronger assertion in the adjacent changed-marker case. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Assert both absence of every qualified destructive event and preservation of ownership evidence on failure. -->

**Preserve:** no pane destruction before provenance validation; <!-- consolidation: exists; ref: docs/BLUEPRINT.md#stop-deletion-and-completion; reason: Validate exact resource provenance before effects. --> lost ACK retains resources; <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#shared-operation-protocol; reason: Exact lost-ack resource-retention behavior needs current transport contract confirmation. --> failed kill retains retry evidence; conclusively missing instance is distinct from an arbitrary error containing missing-like text. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#stop-deletion-and-completion; reason: Failed cleanup retains evidence and probe errors are not absence. -->

### F10 — P2: a configuration omission test currently tests its own literal

**Evidence:** `artifact-approval-key-contract.test.ts`'s second case constructs a `Pick<ModeProfile, "prompt" | "approvalArtifact">` without `artifacts`, then expects that same object not to have `artifacts`. No production function is called. <!-- consolidation: discard; ref: none; reason: Historical literal-only assertion finding. -->

**Why it matters:** the test cannot detect a production validator, serializer, or artifact repository incorrectly requiring declarations. It is an independent type example, not a runtime behavior regression. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Local literal shape assertions are not production regression coverage. -->

**Smallest improvement:** keep the first prototype-key persistence/approval/revoke contract intact. <!-- consolidation: discard; ref: docs/BLUEPRINT.md#task-and-mode-relationships; reason: Hash-bound artifact approval is superseded by task-and-mode approval. --> Replace the literal-only case with an actual configuration load/validation plus public artifact write/read using an undeclared filename. Include one failure-path case at the path-validation boundary. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Exercise real validation and persisted public outcomes including rejection rather than a self-created literal. --> Keep any compile-time shape example in a type-check fixture if the project needs it. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Separate type-fixture need remains conditional. -->

**Preserve:** optional declarations are not a filename allowlist; <!-- consolidation: exists; ref: docs/specs/tasks.md#task-artifacts; reason: Artifacts have arbitrary names and no mode-specific schema. --> approval records for `__proto__`, `constructor`, and `toString` persist and revoke independently; bytes/hashes remain exact. <!-- consolidation: discard; ref: docs/BLUEPRINT.md#task-and-mode-relationships; reason: Hash-bound artifact approval is superseded. --> Do not bulk-remove sidecar assertions that enforce a storage/security contract. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Preserve security-relevant key and byte checks until retained storage contracts are identified separately from obsolete approval. -->

### F11 — P2: consolidate cross-surface semantics without dropping adapter-specific validation

**Evidence:** `task-type-filtering.test.ts` checks Core, filesystem, persistent search, and CLI; `mcp-task-type-filtering.test.ts` builds a similar typed/legacy corpus and checks MCP schemas and list/search behavior. `task-search-parity.test.ts` is an existing useful home for literal cross-surface expectations. `mcp-tasks.test.ts` and `local-task-command-performance.test.ts` maintain separate branch-loading tripwire helpers. <!-- consolidation: discard; ref: none; reason: Historical duplicate-coverage finding. -->

**Why it matters:** repeated setup is expensive and semantic expectations can drift. Conversely, CLI repeated/comma arguments and MCP array schema normalization are distinct contracts, so similarity alone does not justify deleting tests. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Consolidating shared semantics must retain independently meaningful adapter encoding and validation coverage. -->

**Smallest improvement:** use a small immutable scenario table of literal inputs/expected IDs for shared query semantics. Run a dense behavioral matrix through Core; run representative route cases for CLI/MCP encoding, errors, and output. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Dense semantic matrices and thin adapter checks with literal oracles are supported by F11 remediation. --> Share only narrow fixture setup or an explicit external-operation recorder when repeated, without a generic configurable mega-harness. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#general-principles; reason: Avoid duplication and speculative abstraction. --> Consolidate the no-branch/no-network invariant at the Git/process boundary, retaining a caller-specific route assertion where the route itself could opt into remote work. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Prohibited external-operation checks belong at the actual boundary plus routes able to opt into the effect. -->

**Preserve:** independent expected IDs, legacy untyped exclusions, OR/casing/composed filters, transport schemas, local-only behavior, and malformed-input errors. <!-- consolidation: unconfirmed; ref: docs/SPEC.md#current-contract-only-policy; reason: Exact legacy filter and retained transport obligations need current contract reconciliation. --> Two surfaces agreeing can both be wrong. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Preserve independent literal expected results instead of parity alone. -->

### F12 — P2: runner safety tests deserve a stable executable boundary

**Evidence:** `runner-finalization.test.ts` reads the runner source, strips imports with a regex, transpiles it, and executes an `AsyncFunction` with fake bindings. `runner-process-lifecycle.test.ts` separately exercises real runner processes and validates PID/UID/start-time ownership and terminal state. `owned-test-processes-hierarchy.test.ts` uses authenticated ledger fixtures for admission/provenance edge cases. <!-- consolidation: discard; ref: none; reason: Historical runner-test implementation evidence. -->

**Why it matters:** import formatting or a new binding can break source surgery without changing behavior. <!-- consolidation: discard; ref: none; reason: Historical diagnosis of withdrawn runner harness. --> The fake suite is valuable because it can safely model uncertainty that should not be produced by killing arbitrary OS processes. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Controlled external boundaries and exclusively owned process targets are required. -->

**Smallest improvement:** when changing the runner, establish an importable runner entry boundary accepting only the existing external I/O/ownership dependencies, or keep a small child-invocation contract if extraction costs more than it saves. Migrate the source-surgery harness one scenario at a time; do not design a new testing framework. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: F12 replacement runner self-tests were withdrawn and core forbids another global supervisor. --> Keep fake identity/deadline tests separate from fixture-owned real lifecycle verification. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Source/double evidence is distinct from real runtime acceptance. -->

**Preserve:** unknown/survivor means nonzero outcome plus retained evidence; <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#error-handling-and-cleanup; reason: Preserve unresolved-cleanup failure and evidence gate pending native-runner reconciliation. --> no TMPDIR deletion before terminal proof; <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#error-handling-and-cleanup; reason: Reconcile terminal-proof deletion gate with later disposable-scratch policy without losing ownership evidence. --> no launch after closed admission; <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Admission closure guarantee belongs to retired runner and needs disposition. --> bounded capture; <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Preserve output resource bound pending current cleanup-boundary review. --> concurrent settlement idempotence; <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#error-handling-and-cleanup; reason: Historical concurrent settlement guarantee needs current owner confirmation. --> ancestry/provenance authentication. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Preserve exact owned-process authentication gate pending replacement of retired ledger machinery. --> Source simulation is not compiled CLI proof. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Source and actual compiled runtime evidence are distinct. -->

### F13 — P2: gated and platform-return tests need explicit coverage accounting

**Evidence:** the marker scan finds 14 files with skip/gating indicators. `agent-sessions.test.ts` has `itRealTmux`; `opentui-settings-independent-validation.test.ts` has an interactive `skipIf`; `git.test.ts` has a Windows early return in an OS-group timeout case. CI explicitly enables only `tui-interactive-editor-handoff.test.ts` against the compiled binary in its interactive step. <!-- consolidation: discard; ref: none; reason: Historical test-gate and CI inventory. -->

**Why it matters:** a collected/pass-looking suite is not evidence that gated behavior ran. Early returns can look successful while testing nothing on that platform. No claim is made that these omitted cases currently fail. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Report actual executed gated behavior rather than collection or early-return success as acceptance. -->

**Smallest improvement:** enumerate required gates and OS prerequisites in the execution manifest/report, use explicit skips for unsupported cases, and require at least one scheduled/job-owned route to run each essential real-boundary contract. Ensure required executables are installed before that job runs. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Exact platform scheduling and manifest proposal was not approved and F13 self-test expansion was withdrawn. --> Put core semantics in safe fake tests; leave only actual external wiring and terminal behavior gated. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Controlled domain boundaries and separate runtime acceptance are specified. -->

**Preserve:** unsupported platform distinctions and safe real-resource ownership. Do not turn every fake lifecycle test into a real provider test. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Owned resources and controlled external boundaries with honest evidence scope are required. -->

### F14 — P2: smoke scripts need current storage contracts and a small persisted mutation

**Evidence:** `smoke-parallel-task-locking.sh:assert_sequential_ids` and edit lookup search flat `backlog/tasks/*.md` / `task-N - *.md`, while current task repository tests create `tasks/task-N/task.md` containers. <!-- consolidation: discard; ref: none; reason: Historical smoke storage-layout mismatch. --> `wait_for_jobs` captures `$?` inside `if ! wait ...`, so its diagnostic status is the inverted conditional result rather than the child's original status. It does still set its failure flag. <!-- consolidation: discard; ref: none; reason: Historical child-status diagnostic bug. --> The script has no bounded per-job wait; its exit trap only handles fixture deletion/preservation. <!-- consolidation: discard; ref: none; reason: Historical bounded-cleanup gap. --> Its edit scenario creates 100 filler tasks. <!-- consolidation: discard; ref: none; reason: Historical fixture inventory. --> `smoke-compiled-build.ts` checks help/version, init, MCP tools and resources, but does not call a mutating task tool and read the resulting task. <!-- consolidation: discard; ref: none; reason: Historical compiled smoke coverage finding. -->

**Why it matters:** the parallel smoke checks a historical filesystem layout and can report misleading job status. The compiled smoke proves startup and registration, not persisted task mutation. These are source observations, not results from running the scripts or the installed CLI. <!-- consolidation: discard; ref: none; reason: Historical source diagnosis and evidence scope. -->

**Smallest improvement:** update smoke assertions to public JSON task queries or the agreed current repository container contract; <!-- consolidation: exists; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Tests and fixtures follow current interfaces and representations. --> record actual child statuses and bound settlement of only recorded fixture-owned processes before cleanup. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Preserve original child exit status and bounded owned-process settlement in smoke checks. --> Keep the winner/final-label oracle. Reduce filler setup only after a real readiness/interleaving check replaces it. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Preserve independently expected successful-writer effects and deterministic contention proof when reducing fixture cost. --> Add one compiled task-create then task-view/list roundtrip with literal expected title/ID through the already connected MCP client, plus bounded cleanup. <!-- consolidation: unconfirmed; ref: docs/SPEC.md#open-questions; reason: Preserve persisted compiled roundtrip coverage intent while current MCP retention and smoke route remain unsettled. -->

**Preserve:** unique IDs, draft promotion/demotion, lost-write protection, compile target version, stdio startup, resource registration, and cleanup error reporting. <!-- consolidation: discard; ref: docs/specs/tasks.md#task-model; reason: Draft promotion and demotion are no longer supported. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Preserve independent unique-ID lost-write and actual compile-target smoke proof for retained operations. --> <!-- consolidation: unconfirmed; ref: docs/SPEC.md#open-questions; reason: Retained stdio and resource-registration obligations depend on integration-scope disposition. --> <!-- consolidation: exists; ref: docs/CONVENTIONS.md#error-handling-and-cleanup; reason: Cleanup failures must remain visible. --> Remove this smoke script only if all four scenarios are demonstrably covered through the same real cross-process boundary elsewhere; that equivalence was not established here. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Remove real-boundary smoke coverage only after proving equivalent retained scenarios at the same boundary. -->

## 4. Family-specific improvement map

Every appendix row inherits its family guidance. S rows require targeted confirmation before a file-specific edit or deletion. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Inventory signals require targeted contract and assertion review before edits or deletion. -->

### CLI — 44 prefixed suites, plus domain-owned CLI contracts
<!-- consolidation: discard; ref: none; reason: Historical family inventory count. -->

- Put repeated ID/filter/status/type/project/milestone combinations in literal Core scenario tables; preserve CLI-specific parsing, aliases, repeated/comma arguments, exit status, empty result, and stderr behavior in route checks. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Separate shared semantic matrices from independently meaningful route validation. --> <!-- consolidation: unconfirmed; ref: docs/SPEC.md#current-contract-only-policy; reason: Retained fields and aliases require current API reconciliation rather than historical blanket preservation. -->
- Keep exact byte contracts where output is consumed by agents/pipes. Avoid entire help-text snapshots for unrelated grammar changes; assert documented critical options and guidance at their actual route. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Preserve consumed output bytes while narrowing help checks to relevant documented route behavior. -->
- Use filesystem-only fixtures for pure command semantics. Use Git only for actual branch/commit/worktree contracts. Use the existing shared CLI helper rather than independent entrypoint discovery. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Construct only fixture infrastructure needed by the asserted behavior and reuse CLI entrypoint helpers. -->
- Watch/JSON cases should prove incremental freshness, disappearance, duplicate suppression, signal exit and drained streams. Never substitute one-shot/source equality alone for literal expected records. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Watcher coverage needs independently expected temporal outcomes and process settlement rather than snapshot parity alone. -->
- Packaging, root entry, launcher, pipe, init/no-Git, cursor PTY, and editor handoff remain distinct boundary tests. Verify which executable each test uses. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Preserve distinct real boundaries and identify the executable actually tested. --> <!-- consolidation: unconfirmed; ref: docs/SPEC.md#open-questions; reason: Historical init and guidance surfaces need retained API disposition. -->

### MCP — 15 suites
<!-- consolidation: discard; ref: none; reason: Historical family inventory count. -->

- Prefer `testInterface.callTool` for schema/validation/result/error contracts and a small real stdio lifecycle suite for handshake/framing/cleanup. <!-- consolidation: unconfirmed; ref: docs/SPEC.md#open-questions; reason: Retained MCP scope and exact test seam are unresolved. -->
- The inspected tool tests already exercise public behavior. <!-- consolidation: discard; ref: none; reason: Historical test assessment. --> Factor repeated temporary-project and content extraction code only when actually repeated; <!-- consolidation: exists; ref: docs/CONVENTIONS.md#general-principles; reason: Avoid duplication and speculative abstraction. --> reject malformed content shapes where the protocol boundary promises text instead of silently converting everything to an empty string. <!-- consolidation: unconfirmed; ref: docs/SPEC.md#open-questions; reason: Exact retained protocol content contract needs integration-scope confirmation. -->
- Keep enum canonicalization, unknown values, workspace-root containment, client roots, and no-remote behavior as adapter-specific regressions. Preserve error results and disk nonmutation on validation failure. <!-- consolidation: unconfirmed; ref: docs/SPEC.md#open-questions; reason: Preserve adapter validation and containment safety pending retained MCP contract disposition. -->
- One create/edit/read regression per key mutation contract plus parameterized argument validation is more useful than repeating a full fixture for every display substring. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Use persisted public roundtrips and focused argument matrices instead of repeated expensive display-only fixtures. -->

### OpenTUI — 34 central suites + 4 colocated view/model suites
<!-- consolidation: discard; ref: none; reason: Historical family inventory count. -->

- Keep real renderers for key layout, visible state, modal focus/keyboard access, and navigation contracts; keep terminal/process adapters fake for ordinary cases. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Exercise real rendering for UI interaction contracts while controlling external process boundaries. -->
- Split large controller tests by behavior ownership: selection/navigation, group edits, composer persistence, configuration save/cancel, shared session attachment, and observation. Splitting without reducing fake normalization only moves the burden. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Exact suite split remains a proposal and does not replace honest-fixture remediation. -->
- Use a complete typed record at service-to-controller seams. Use a real temporary config/store in settings/lifecycle cases so missing metadata is visible. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Complete typed fixtures and real persisted settings expose missing metadata rather than normalize it away. -->
- Preserve cancellation with no disk writes, reopening persisted settings, independent validation across categories, prompt/model/provider selection, safe approval projection, multi-reader detach, and focus restoration after errors. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Preserve these UI regression obligations until mapped to current screen and approval contracts individually. -->
- Native frame/assertion duplication is S-only in unreviewed files. <!-- consolidation: discard; ref: none; reason: Historical review-confidence limit. --> Prefer semantic visible labels/focus and a few fixed-size representative frames over broad snapshot churn. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Snapshot reduction is an unapproved recommendation requiring current coverage equivalence review. -->

### Modes — 12 central suites + relevant workspace/model contracts
<!-- consolidation: discard; ref: none; reason: Historical family inventory count. -->

- Name tests for lifecycle, mode switching, artifact approval, prompt/edit/save/cancel, permission boundaries and legacy-read behavior, not retired flags/protocols. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Name tests by supported behavior rather than retired implementation flags. --> <!-- consolidation: discard; ref: docs/SPEC.md#current-contract-only-policy; reason: Legacy-read and artifact-hash approval are not current supported behavior. -->
- Use table cases for the catalog/default mode, custom modes, stale active IDs, stopped/starting/running states, and malformed config. <!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#identity-and-observed-state; reason: Historical state matrix needs current observation-contract reconciliation. --> Keep mode-local histories independent. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#task-and-mode-relationships; reason: Sessions belong to fixed modes with independent histories and selection. -->
- Preserve missing-pane queued STARTING, nonmutating errors, no observation teardown, and explicit stop ownership. <!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#identity-and-observed-state; reason: Exact queued STARTING representation needs reconciliation without losing uncertainty safety. --> <!-- consolidation: exists; ref: docs/BLUEPRINT.md#shared-operation-protocol; reason: Observation is nonmutating and execution effects require separate authority. --> Do not add backward-compatibility tests for unsupported persisted formats; ask the user if you believe that contract should change. <!-- consolidation: exists; ref: docs/SPEC.md#current-contract-only-policy; reason: Legacy compatibility requires explicit owner approval. -->

### Agent workspace/session — 37 direct + 6 provider adapter + 6 live tests
<!-- consolidation: discard; ref: none; reason: Historical family inventory count. -->

- Agree service lifecycle versus transport seams. Replace service-internal field access with public start/list/live/ask/stop/forget behavior, keeping identity/provenance negative assertions. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Prefer public outcomes while retaining provenance-negative assertions. --> <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#dependency-direction; reason: Exact historical service operations must follow current model/application ownership. -->
- Use typed boundary fakes for tmux, process tables, provider launch preparation and transport. Unknown commands should fail rather than silently return generic success where feasible. Do not copy production parser logic into a mega-fake. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Narrow typed external fakes should expose unexpected calls rather than mirror production or accept everything. -->
- Keep adapter-specific syntax/version/model/permission contracts in the provider adapter family; keep generic session lifecycle independent of provider command strings. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#component-ownership; reason: Harness owns provider-specific integration and Session owns lifecycle. --> This audit did not validate actual installed providers. <!-- consolidation: discard; ref: none; reason: Historical evidence limitation. -->
- Preserve upgrade containment, journals, crash recovery, canonical project roots, immutable path contexts, resume receipts, reservation races, stale callbacks, marker validation, and cleanup retryability. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#architectural-invariants; reason: Canonical provenance stale-origin rejection durable ownership and cleanup evidence remain required. --> <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#open-decisions-and-provenance; reason: Upgrade journals exact receipts automatic crash recovery and retry policy need disposition under current contracts. -->
- Use one small real owned tmux/transport smoke for actual rows/socket forwarding and terminal attachment. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Exact smoke count and entrypoint remain a recommendation requiring retained coverage review. --> Stub executables such as transport-detach test commands are external-boundary integration, not proof of a real provider or real tmux server. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Doubles establish only exercised behavior and not live provider acceptance. -->

### Domain/storage/query — 123 central suites + 4 filesystem repository suites
<!-- consolidation: discard; ref: none; reason: Historical family inventory count. -->

This accounting category is broad; route review work by the filename/contract:

| Subfamily | Review direction and behavior to preserve |
| --- | --- |
| Core/mutation/create/edit/delete/container/draft | Locked mutation, transactional failure, opaque data preservation, admission exclusion, no partial moves, idempotent retries <!-- consolidation: exists; ref: docs/BLUEPRINT.md#mutation-and-concurrency-boundary; reason: Locked fresh-state mutations preserve supported unrelated fields. --> <!-- consolidation: discard; ref: docs/specs/tasks.md#task-model; reason: Draft lifecycle is removed. --> <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#task-deletion; reason: Transactional failure no-partial-move and idempotent retry promises are not approved general outcomes. --> |
| Markdown/frontmatter/content/artifacts/docs/references | Independent literal parse/serialize examples, unknown-field/body preservation, recursive docs, path containment, byte-bound approval and prototype keys <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Serialization tests need independent literal inputs and outputs. --> <!-- consolidation: discard; ref: docs/BLUEPRINT.md#task-and-mode-relationships; reason: Byte-bound approval is superseded. --> <!-- consolidation: unconfirmed; ref: docs/SPEC.md#current-contract-only-policy; reason: Unknown-field preservation recursive docs and retained containment/key checks require current representation and surface review. --> |
| Identity/prefix/IDs/worktrees/duplicates | Canonical identity versus display representation, ambiguity refusal, padded/subtask IDs, separate branch content, collision repair and scope of Git changes <!-- consolidation: discard; ref: docs/specs/tasks.md#project-data-store; reason: Branch-based task collection is superseded. --> <!-- consolidation: unconfirmed; ref: docs/SPEC.md#open-questions; reason: Historical identity syntax repair and Git scope matrix needs current supported-operation review. --> |
| Query/search/filter/sorting/readiness/dependency | One literal scenario corpus, missing/malformed dependencies, cycles, stable tie order, composed filters and route parity with independent expected IDs <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Shared literal query matrices retain malformed inputs edge cases and independently expected route outcomes. --> |
| Watch/config/state stores | Last-good state on partial writes, atomic rename, no false removal, stop/drain, fresh process reload, contention and root isolation <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Preserve public freshness failure and shutdown regressions with real rename and process reload boundaries. --> |
| Board/groups/reorder/statistics/readme | Deterministic ordering, boundary moves, empty/unknown statuses, nonmutation, real group persistence and minimal surface presentation <!-- consolidation: unconfirmed; ref: docs/SPEC.md#open-questions; reason: Retained board/statistics/readme surfaces and exact edge outcomes need owning-contract review. --> |
| Dates/priority/due dates | Fixed independent literals, timezone/midnight/format boundaries, invalid input, public updated-date rules without wall-clock equality races <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Date tests need independent fixed expectations and timezone/boundary coverage rather than wall-clock equality races. --> <!-- consolidation: discard; ref: docs/specs/tasks.md#task-model; reason: Due dates are absent from the current editable field contract. --> |
| Git/offline/local-only/runtime/editor/packaging | Real temporary Git where required, process-boundary denial of remote work, canonical runtime cwd, input handoff, package resolution/platform contracts <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Verify actual Git/process/package boundaries where they own behavior and preserve prohibited-effect checks. --> <!-- consolidation: unconfirmed; ref: docs/SPEC.md#open-questions; reason: Exact historical offline/editor API and platform obligations need retained-surface review. --> |

Do not infer a missing scenario just from its absence in a filename. For S-only families, first find the current owning contract and read its relevant assertion chunks. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Filename and inventory signals cannot establish missing coverage without targeted assertion review. --> Small pure-function contracts are worth retaining when they own semantics; public does not mean every test must spawn the CLI. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Focused tests belong beside owners and favor real domain behavior. -->

### Harness/ownership — 11 central guard suites, runner/helpers, and 2 smoke scripts
<!-- consolidation: discard; ref: none; reason: Historical family inventory count. -->

- Keep fake clock/probe/signal tests for arbitrary PID/UID/recycle/provenance failures; keep real process checks restricted to authenticated fixture-owned identities. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Controlled external boundaries and exclusively owned process resources are required. --> <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Exact authentication machinery and withdrawn harness test retention need execution-policy reconciliation. -->
- Keep terminal proof distinct from handle detach or worker exit. Inherited pipes and children require settlement before temporary directory removal. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#error-handling-and-cleanup; reason: Worker exit or handle detach does not prove child and inherited-pipe settlement before fixture cleanup. -->
- Keep unique sockets, safe labels, authenticated registry/ledger state, timeout diagnostics, signal interruption, deadline-aware admission, pending-file reporting, and evidence retention on uncertainty. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Unique test socket and owned resource guards are required. --> <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#error-handling-and-cleanup; reason: Preserve old registry admission interruption reporting and uncertainty gates until retired runner responsibilities are reconciled. -->
- Avoid global module mocks leaking into real suites; preserve one-process-per-file execution while those mocks remain. Within-file concurrency is appropriate only for cases owning all mutable state and resources. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Prevent global-mock cross-suite leakage and require case-owned mutable state for within-file concurrency. -->
- Replace source-body execution only at an agreed runner boundary; <!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: F12 runner replacement self-tests were withdrawn. --> do not delete negative safety/protocol storage assertions merely because they involve implementation-visible files. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Observable ownership and security storage evidence remains valid coverage even when files are implementation-visible. -->

### Commands/completion/output utilities — 4 suites total
<!-- consolidation: discard; ref: none; reason: Historical family inventory count. -->

- `commands/completion`, `commands/skill`, `completions/helper`, and `utils/read-output-mode` should test actual exported behavior: shell choice, quoting/prefix/help failures, completion shape and output-mode precedence. <!-- consolidation: unconfirmed; ref: docs/SPEC.md#open-questions; reason: Exact guidance and completion surfaces require current API disposition before prescribing coverage. -->
- Parameterize shell/input/env combinations and retain error outcomes. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Proposed parameterization requires targeted review of these signal-only files. --> Their S status means there is no verified defect in these files in this audit. <!-- consolidation: discard; ref: none; reason: Historical review confidence. -->

## 5. High-risk contracts: keep, verify, or add a tracer slice

This is a coverage worklist, **not a declaration that every item is absent**. Items marked present were found in reviewed chunks; other routes/platforms remain unverified. <!-- consolidation: discard; ref: none; reason: Historical coverage-worklist qualification. -->

| Contract | Static evidence / current confidence | Next smallest slice |
| --- | --- | --- |
| Observation is read-only even for STARTING/uncertainty | Present in `shared-runtime-service`; observer stop/detach negative commands present | Table the states across public observation entrypoints; preserve store, pane and sidecar evidence <!-- consolidation: exists; ref: docs/BLUEPRINT.md#shared-operation-protocol; reason: Observation and failed probes cannot authorize mutation. --> <!-- consolidation: discard; ref: none; reason: Present-test confidence is historical. --> |
| Queued request + absent pane is STARTING | Present in shared-runtime observation case | Named isolated case, independent of obsolete backend flag semantics <!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#identity-and-observed-state; reason: Exact queued STARTING rule requires current observation and recovery reconciliation. --> |
| Foreign ownership cannot target input/attach/stop | Present in `session-process-tree-stop` | Keep task/project/session/name/role/provider matrix; check no external mutation <!-- consolidation: exists; ref: docs/BLUEPRINT.md#architectural-invariants; reason: Identity and current execution provenance precede authority. --> <!-- consolidation: discard; ref: none; reason: Historical coverage evidence. --> |
| Resource cleanup validates provenance first | Present in `session-process-resources`; one weak event assertion found | Strengthen exact negative event and retain marker/inventory comparisons <!-- consolidation: exists; ref: docs/BLUEPRINT.md#stop-deletion-and-completion; reason: Exact ownership validation precedes destructive effects and failures retain evidence. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Negative safety assertions must match qualified events and check retained ownership data. --> |
| Error text is not conclusive absence | Present in resource tests | Keep typed missing-versus-generic-error route; add caller variation only if not already covered <!-- consolidation: exists; ref: docs/BLUEPRINT.md#stop-deletion-and-completion; reason: Probe errors are not absence evidence. --> |
| No cleanup before authenticated terminal proof | Present fake runner and real lifecycle chunks | Keep unknown/survivor/rejection, inherited pipes, checkpoint failure, closed admission and retry <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#error-handling-and-cleanup; reason: Preserve exact terminal-proof and uncertainty gates pending retired runner and scratch-policy reconciliation. --> |
| Preload resists seeded live configuration/socket | Existing test observes ambient state; adversarial input not present in reviewed file | Fixture-owned preload child, no backend call <!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: F1 self-test expansion was withdrawn in remediation plan. --> |
| Deletes cannot admit concurrent session work | Present in `task-delete` with four admission routes | Guarantee gate release/drain; route parameterization with no process calls <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#error-handling-and-cleanup; reason: Release and drain all started gated operations on failure. --> <!-- consolidation: unconfirmed; ref: docs/specs/tasks.md#repeated-and-concurrent-requests; reason: Exact deletion-race outcomes remain open while admission safety must be preserved. --> |
| Stale callback cannot stop replacement pane | Present named shared-runtime test; assertion body not deeply reviewed | Verify record+pane origin, same logical ID after resume, no destructive action <!-- consolidation: exists; ref: docs/BLUEPRINT.md#mutation-and-concurrency-boundary; reason: Obsolete callbacks cannot act on replacement executions. --> |
| Path redirects never cause foreign deletion/write | Present named shared-runtime symlink test and deletion sentinel chunk; broader paths unverified | Review canonical alias versus redirected task/request/resource parent, preserved foreign sentinel <!-- consolidation: exists; ref: docs/BLUEPRINT.md#stop-deletion-and-completion; reason: Exact project and resource provenance is required before deletion. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Use foreign sentinels to verify redirected-path safety without touching unrelated resources. --> |
| Approval becomes invalid when exact bytes change | Artifact repository family inventoried; key persistence reviewed | Read approval-contract cases before adding; retain independent hash/CAS rejection, unchanged bytes and restart <!-- consolidation: discard; ref: docs/BLUEPRINT.md#task-and-mode-relationships; reason: File-hash approval is superseded by task-and-mode approval. --> |
| Locks preserve successful writes across processes | Present atomic edit winner oracle | One explicit cross-process readiness/lock test plus controlled races, failure retry and no wedged lock <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Preserve real cross-process contention proof and exact winner outcomes alongside controlled interleavings. --> |
| Corruption is not mistaken for deletion | Present task-watcher chunks | Drive complete retry/reconciliation with last-good state and true absent transition <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Watcher tests must distinguish malformed transient content from actual absence through completed retries. --> |
| Source CLI versus compiled/package behavior | Distinct runner bundle, compiled smoke and Nix checks inspected | Compiled create/read roundtrip; record artifact identity. Installed CLI remains separate <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Source behavior and compiled runtime evidence are distinct. --> <!-- consolidation: unconfirmed; ref: docs/SPEC.md#open-questions; reason: Exact retained compiled mutation route depends on supported integration scope. --> <!-- consolidation: discard; ref: none; reason: Temporary runner bundle is historical and removed. --> |
| Interrupted setup and partial cleanup preserve evidence | Runner handles unknown creation; settings cleanup loop stops at first thrown cleanup | Check started resources are always drained; attempt all owned cleanups while preserving aggregated failures <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#error-handling-and-cleanup; reason: Test fixtures should attempt remaining safe owned cleanups and report primary plus aggregated cleanup failures. --> |

Additional targeted questions for S files: permission errors versus malformed data, cancellation during bootstrap/ask/save, duplicate identity at mutation time, custom backlog roots and root symlinks, lock timeout/release after exceptions, date rollover/timezone, provider resume ID and namespace mismatch, cross-mode history independence, and platform-specific path/rename behavior. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Unreviewed coverage questions require targeted current-contract review and do not establish missing scenarios. --> Search the owning contract first; add a failing example only for a demonstrated gap. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#general-principles; reason: Apply approved contracts rather than inferring requirements from implementation. -->

## 6. Grounded before/after examples (documentation only)

The following are short rewrite sketches grounded in actual reviewed tests, not executed patches. <!-- consolidation: discard; ref: none; reason: Historical example qualification. --> Fixture setup and teardown are omitted for readability; any implementation must keep them. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Owned-resource isolation and teardown are mandatory. --> Agree the seams before writing the tests. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Exact proposed seam approval remains conditional. -->

### A. Qualified destructive events

Current `session-process-resources.test.ts`: <!-- consolidation: discard; ref: none; reason: Following snippet is historical weak-negative assertion evidence. -->

```ts
await expect(f.makeProcess().kill(f.session)).rejects.toThrow();
expect(f.events).not.toContain("kill-pane");
```

Proposed, matching the fixture's actual event vocabulary: <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Following example demonstrates matching every qualified destructive event and retaining inventory on failure. -->

```ts
const inventory = f.options.get("@backlog_launch_resources");
await expect(f.makeProcess().kill(f.session)).rejects.toThrow();
expect(f.events.some(event => event.startsWith("kill-pane:"))).toBe(false);
expect(f.options.get("@backlog_launch_resources")).toBe(inventory);
```

Also keep the ownership-marker bytes assertion. The change makes a harmful fake `kill-pane:resource-present` event fail the test. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Safety negatives should verify untouched ownership bytes and be sensitive to the actual prohibited effect. -->

### B. Public cache behavior instead of cache membership

Current private-state pattern: <!-- consolidation: discard; ref: none; reason: Following snippet is historical cache implementation coupling. -->

```ts
const harness = filesystem as unknown as TaskCacheHarness;
expect(harness.parsedTaskFiles.has(resolve(taskPath))).toBe(true);
expect(harness.taskFileReadGenerations.has(resolve(taskPath))).toBe(true);
```

The file already contains a stronger public pattern; use it as the base: <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Following example uses independent byte changes and public results with unchanged timestamps. -->

```ts
expect((await filesystem.listTasks())[0]?.title).toBe("Alpha");
await Bun.write(taskPath, replacement); // independently known "Bravo" bytes
await utimes(taskPath, originalStats.atime, originalStats.mtime);
expect((await filesystem.listTasks())[0]?.title).toBe("Bravo");
```

For the in-flight race, gate the external file read and finish the older read last, then assert the next public listing still returns the newer value. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Force stale-read interleavings at external boundaries and assert public freshness. --> Keep one explicit resource-cap test separately. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Resource-limit proof must survive removal of private-state assertions. -->

### C. Required metadata stays typed

Current shared-attachment fixture has an untyped record with uppercase status and missing required fields. <!-- consolidation: discard; ref: none; reason: Historical fixture finding. --> Proposed fixture shape: <!-- consolidation: discard; ref: docs/BLUEPRINT.md#conversation-records-versus-runtime; reason: Example historical record fields and durable status are not the current schema. -->

```ts
const record = {
  id: "session-1", taskId: task.id, preset: "agent",
  tmuxName: fixtureOwnedTmuxName, cwd: root,
  createdAt: "2026-01-01T00:00:00.000Z", status: "running",
  outputPath: join(root, "output.log"),
  bootstrapPath: join(root, "bootstrap.md"),
} satisfies AgentSession;
```

Then type the attachment against the actual public return shape. Explicit path/provider provenance fields belong in the cases testing those contracts, not in a permissive catch-all fake. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Fixtures must satisfy actual typed boundaries and expose relevant provenance without permissive repair. -->

### D. A gate releases even when the intermediate assertion fails

Current deletion test releases its gate after assertions. <!-- consolidation: discard; ref: none; reason: Historical gate-release finding. --> Proposed local structure: <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#error-handling-and-cleanup; reason: Following example guarantees gate release and draining in finally after failed assertions. -->

```ts
const deletion = core.deleteTask(task.id);
try {
  await enteredDelete.promise;
  const outcomes = await Promise.allSettled(attempts());
  expect(outcomes.every(result => result.status === "rejected")).toBe(true);
  expect(externalProcessCalls).toBe(0);
} finally {
  releaseDelete.resolve();
  await deletion;
}
```

Keep the after-deletion retry assertions and environment restoration outside this smaller guarded section; <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Gate restructuring must retain retry coverage and restore mutated environment. --> preserve both operation and cleanup errors if both fail. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#error-handling-and-cleanup; reason: Preserve primary and secondary cleanup failures. -->

### E. Keep literal oracles in parameterized route coverage

`task-search-parity.test.ts` already uses literal expected IDs. <!-- consolidation: discard; ref: none; reason: Historical test inventory. --> Consolidate repetitions using that pattern: <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Following example retains independent literal expected values in a small scenario table. -->

```ts
it.each([
  { query: "infrastructure", expected: ["TASK-1"] },
  { query: "morgan", expected: ["TASK-1"] },
])("matches $query", async ({ query, expected }) => {
  expect(await persistentTaskIds(query)).toEqual(expected);
});
```

Keep thin CLI/MCP argument/format checks with their own encoding. Do not replace independent expected results with `expect(cliResult).toEqual(coreResult)` alone. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Shared semantic coverage must preserve independent route-specific encoding checks and literal oracles. -->

## 7. Staged test-first improvement plan

Each row is a small vertical slice: agree seam → one discriminating failing test → minimal correction → targeted verification. Do not write a horizontal wall of imagined replacement tests before validating the first slice. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Remediation procedure supports bounded regression-sensitive vertical slices instead of speculative mass test rewrites. -->

| Stage | First tracer slice | Acceptance checks for later implementation |
| --- | --- | --- |
| 1. Isolation | Seed one workspace variable in a fixture-owned preload child | Removing its clear step makes the regression fail; no live root/socket/provider is accessed; legitimate inherited test scope remains usable <!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: F1 self-test expansion was withdrawn. --> |
| 1. Isolation | Supply a live-style socket override to preload observation | Rejected/replaced before backend access; valid test-owned override follows agreed policy; cleanup registry is correct <!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: F1 name-based override checks and self-tests were withdrawn. --> |
| 2. CI/runner | Runner report for a selected pure file with requested lane env | Reported selection/lanes match inputs; no unnecessary CLI build; forwarded flags are intentional; unknown selection and missing profile file fail before launch <!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: F2 harness self-tests were withdrawn and native runner supersedes lane controls. --> |
| 2. CI/runner | One intended CLI artifact handoff | Helpers run that artifact; redundant CI build removed only when separate compiled smoke remains; JUnit paths still valid <!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Temporary behavior-test bundle was removed in favor of source CLI. --> <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Preserve independent compiled smoke and JUnit obligations pending execution-policy reconciliation. --> |
| 3. Safety assertion | Malformed resource inventory emits a fake qualified kill event | Regression fails on any destructive event; real code preserves markers/inventory on error; no real OS signals <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Negative safety tests need a controlled prohibited-effect sensitivity check and retained ownership evidence. --> |
| 3. Lifecycle | Queued missing-pane STARTING named scenario | No kills, STARTING retained, uncertain probes nonmutating; explicit stop tested separately <!-- consolidation: exists; ref: docs/BLUEPRINT.md#shared-operation-protocol; reason: Observation is non-destructive and explicit execution effects are separate. --> <!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#identity-and-observed-state; reason: Exact historical queued STARTING outcome needs reconciliation. --> |
| 4. Fixtures | One controller shared-attachment scenario with typed metadata | No double cast for the record; actual lowercase status and required paths; detach preserves shared runtime; stale origin cannot stop a replacement <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Typed boundary fixtures must expose missing metadata. --> <!-- consolidation: exists; ref: docs/BLUEPRINT.md#architectural-invariants; reason: Client lifetime and obsolete callbacks cannot control replacement execution. --> <!-- consolidation: discard; ref: docs/BLUEPRINT.md#conversation-records-versus-runtime; reason: Historical durable lowercase status schema is superseded by observed runtime state. --> |
| 4. Async | One contention test with unconditional gate release/drain | Forced intermediate failure still settles owned promises/resources; winning writes preserved; no cleanup under an active gate <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#error-handling-and-cleanup; reason: Test gate release and drain must survive intermediate failure before fixture cleanup. --> |
| 5. Public seams | Replace one Git reset private-call test | Correct index state, normalized paths, unrelated staged file untouched; helper names/argv refactoring does not break it <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Public Git outcomes need independently inspected repository state instead of private call expectations. --> |
| 5. Public seams | Replace one cache membership race | Newer data survives a late older read; malformed/delete/root-isolation contracts retained; resource-cap test remains <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Public freshness and resource-bound coverage must survive cache representation refactors. --> |
| 6. Duplication | One literal type/filter table at Core plus thin route cases | Every removed case mapped to same input/expected behavior and route obligations; MCP schema/CLI parsing retained <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Require equivalent-case mapping and retained adapter checks before removing duplicates. --> |
| 6. Watchers | One no-duplicate/stop case with a public fence or controlled scheduler | Queued events cannot publish after stop; positive change confirms liveness; no arbitrary longer sleep <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Async absence requires completion evidence and positive liveness rather than arbitrary sleep. --> |
| 7. Smoke/gates | Current-layout parallel query and compiled create/read | Exact successful-writer results and child statuses; bounded fixture-only settlement; compiled roundtrip persisted; each essential gate has an execution owner <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Smoke checks preserve original child status exact writer effects and bounded owned cleanup. --> <!-- consolidation: unconfirmed; ref: docs/SPEC.md#open-questions; reason: Exact retained compiled mutation route and scheduled gate ownership require current scope disposition. --> |

Use the existing runner for affected files when implementation is authorized. Do not run the full suite after every tiny slice. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Iteration uses affected-file checks rather than full suite by default. --> Once the changed family passes, verify the real-boundary contract it can break, then the relevant platform/CI profile. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Target verification to real boundaries and platform obligations affected by the change. --> At integration handoff, the main agent must follow repository `AGENTS.md` to rebuild and verify the installed CLI. A source test, a temporary runner binary, and `dist/backlog` are distinct artifacts. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#validation; reason: Source checks do not refresh installed binary and main rebuild/freshness is required. -->

Acceptance should include a **sensitivity check**: the replaced test must fail for its target regression (missing clear, forbidden mutation, stale value, lost label, wrong route/schema, early delete). Avoid mutation-testing infrastructure; a controlled fixture behavior or one temporary local perturbation during authorized implementation is sufficient. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Demonstrate focused regression sensitivity with controlled local changes instead of new mutation infrastructure. -->

### Runtime and CI measurement, only during later authorized work

- Use the runner's existing structured report for per-file wall time, completed/pending/failed files, lane count, build time and deadline diagnostics. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Historical custom runner report is superseded by native procedure. --> Add skipped/gated contract accounting if needed. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Additional manifest/report mechanism remains conditional and F13 self-tests were withdrawn. -->
- Measure before/after the specific family on the same machine/conditions; separate CLI startup/native renderer/fixture setup from semantic assertion work. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Comparable performance evidence needs same-condition measurements and separated startup/setup costs. -->
- Resolve deterministic races before increasing timeouts or lane width. Preserve deadlines and diagnostics. Avoid retrying whole failures until they go green. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Fix synchronization instead of hiding failures with timeout inflation or repeated whole-suite retries. -->
- Check that generated JUnit names do not collide, platform manifest entries exist, and required real-boundary cases actually execute. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Exact report and platform checks need current runner applicability confirmation without reinstating withdrawn self-tests. --> No claim about current timings or test success is made here. <!-- consolidation: discard; ref: none; reason: Historical audit evidence limit. -->

## 8. What not to remove or over-check

- Do not delete ownership, provenance, path containment, provider namespace, deletion lock, uncertainty, cancellation, and concurrency assertions because they use fakes or inspect durable evidence. Some storage formats are explicit interoperability/security contracts. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Preserve negative safety and interoperability evidence when simplifying tests or replacing private assertions. -->
- Do not replace a real filesystem rename, cross-process lock, native terminal, stdio or compiled smoke with a pure fake and call coverage unchanged. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: A fake cannot establish equivalent real-boundary coverage. -->
- Do not duplicate every domain scenario at every route. Keep dense semantic coverage at its owning public seam and targeted validation/encoding/wiring at adapters. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Separate dense semantic matrices from thin adapter-specific checks. -->
- Do not test constructor existence, locally created literal shapes, every internal call count, cache field names, exact timer cleanup counts, or retired backend flags unless they own an agreed external/resource contract. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Test observable contracts rather than implementation trivia while retaining explicit resource guarantees. -->
- Do not remove old tests solely for size, a regex signal, or similarly named cases. Require a replacement mapping: input, failure mode, observable expected result, seam, isolation and platform obligations. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Test removal requires explicit equivalent coverage mapping rather than superficial similarity. -->
- Do not add a new framework, assertion abstraction, large fake backend or configurable fixture DSL. Reuse Bun, existing helpers, literal scenario tables, and narrow external doubles. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#general-principles; reason: Avoid speculative abstractions and duplicated behavior. -->
- Do not use real providers, developer sockets, home state or unrelated process identities to validate ordinary fake/source tests. Real smoke uses only fixture-owned resources and explicit preconditions. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Controlled provider boundaries and owned resources exclude developer sockets and unrelated processes. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Explicitly isolate HOME state and document real-smoke prerequisites. -->

## Appendix A — exhaustive per-file coverage ledger

The location in each heading is the path prefix for every filename below it. Thus every row identifies one exact relative file. `D` means targeted assertion/harness review only; `S` means inventory/metrics and family guidance only. `U` marks the seven untracked tests. The family guidance in section 4 is the action route for each row. No S entry is asserted defective or safe. <!-- consolidation: discard; ref: none; reason: Historical inventory legend and confidence qualification. -->

### `src/test/` — CLI (44)
<!-- consolidation: discard; ref: none; reason: Historical inventory count. -->

| File | Confidence |
| --- | --- |
| cli-agents.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-auto-plain-non-tty.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-custom-prefix-id-resolution.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-dependency-graph.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-dependency.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-doc-decision-board.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-doc-search.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-doc-view.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-doctor.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-draft-edit.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-due-date.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-exclude-status-filtering.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-guidance.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-incrementing-ids.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-init-create.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-init-cursor-pty.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-init-input.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-init-no-git.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-json-output.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-json-watch.test.ts | D <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-launcher.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-list-window.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-milestone-filter.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-milestone-management.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-missing-storage-directories.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-parent-filter.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-parent-shorthand.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-pipe-output.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-plain-create-edit.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-plain-output.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-refs-docs.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-root-entry.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-search-command.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-status-filtering.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-task-batch-edit.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-task-list-ordinal-sort.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-task-list.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-task-milestone.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-task-project.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-task-state.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-task-type.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-task-view-edit.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-task-wizard.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cli-zero-padded-ids.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |

### `src/test/` — MCP (15)
<!-- consolidation: discard; ref: none; reason: Historical inventory count. -->

| File | Confidence |
| --- | --- |
| mcp-client-setup.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| mcp-documents.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| mcp-drafts.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| mcp-fallback.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| mcp-milestones.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| mcp-refs-docs.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| mcp-roots-discovery.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| mcp-server.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| mcp-stdio-exit.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| mcp-task-complete.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| mcp-task-project-filtering.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| mcp-task-type-filtering.test.ts | D <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| mcp-tasks-local-filter.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| mcp-tasks.test.ts | D <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| mcp-workspace-root.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |

### `src/test/` — OpenTUI/interactive/UI (34)
<!-- consolidation: discard; ref: none; reason: Historical inventory count. -->

| File | Confidence |
| --- | --- |
| opentui-agent-settings.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opentui-artifact-approval-projection.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opentui-confirm.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opentui-existing-agent-host.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opentui-filters.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opentui-group-delete-modal.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opentui-group-modal.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opentui-groups.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opentui-host-startup-cleanup.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opentui-keybindings.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opentui-mode-navigation-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opentui-mode-passive-preview.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opentui-mode-permission-support.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opentui-mode-settings-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opentui-mode-settings-input.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opentui-mode-startup-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opentui-navigation-history.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opentui-session-picker.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opentui-settings-independent-validation.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opentui-settings-persistence.integration.test.ts | D <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opentui-surfaces.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opentui-task-composer.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opentui-workspace-agent.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opentui-workspace-controller-groups.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opentui-workspace-controller-shared-attachment.test.ts | D, U <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opentui-workspace-controller.test.ts | D <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opentui-workspace-detail.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opentui-workspace-groups.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opentui-workspace-layout.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| tui-interactive-editor-handoff.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| tui-vim-boundary-navigation.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| ui-keymap.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| ui-option-compose.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| ui-state-owners.test.ts | D <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |

### `src/test/` — modes (12)
<!-- consolidation: discard; ref: none; reason: Historical inventory count. -->

| File | Confidence |
| --- | --- |
| mode-approval-indicator-editor.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| mode-keybindings-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| mode-multiline-editor-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| mode-previous-session-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| mode-workspace-colors.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| mode-workspace-input-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| mode-workspace-render-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| modes-container-path-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| modes-final-removal-state.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| modes-legacy-read-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| modes-project-initialization-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| modes-task-creation-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |

### `src/test/` — harness/ownership (11)
<!-- consolidation: discard; ref: none; reason: Historical inventory count. -->

| File | Confidence |
| --- | --- |
| bun-options.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| owned-test-processes-deadline.test.ts | D <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| owned-test-processes-hierarchy.test.ts | D <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| runner-finalization.test.ts | D <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| runner-process-lifecycle.test.ts | D <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| session-server-isolation.test.ts | D <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| test-preload-isolation.test.ts | D <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| test-utils.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| tmux-pane-groups.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| tmux-pane-lookup.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| tmux-test-server.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |

### `src/test/` — domain/storage/query and associated contracts (123)
<!-- consolidation: discard; ref: none; reason: Historical inventory count. -->

| File | Confidence |
| --- | --- |
| agent-instructions.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| agent-selection.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| agent-sessions.test.ts | D <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| agent-workspace-cli-routing.test.ts | S, U <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| agent-workspace-cli.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| agent-workspace-model.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| all-mode-task-cleanup-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| artifact-shortcut-overrides.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| artifact-view-live-refresh-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| atomic-task-create.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| atomic-task-edit.test.ts | D <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| backlog-directory.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| board-domain.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| board-loading.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| board-ui.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| board.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| branch-task-loader-resilience.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| cleanup.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| code-path.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| config-commands.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| config-migration.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| config-watcher.test.ts | D <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| container-duplicate-repair-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| content-identity.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| content-store.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| core-move-tasks-to-status.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| core-task-corpus-regressions.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| core.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| date.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| dependency-graph-surfaces.test.tsx | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| dependency-graph.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| dependency.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| desc-alias.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| description-newlines.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| docs-recursive.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| documentation.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| draft-create-consistency.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| due-date.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| duplicate-detection.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| duplicate-task-repair.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| editor.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| enhanced-init.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| entity-id.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| filesystem-task-cache.test.ts | D <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| filesystem.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| find-backlog-root.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| frontmatter-diagnostic-propagation.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| generic-artifact-search-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| git.test.ts | D <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| group-store.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| id-generation.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| immutable-project-context.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| label-filter.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| list-window.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| local-task-command-performance.test.ts | D <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| main-worktree.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| malformed-task-dependencies.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| manual-git-control.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| markdown.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| milestone-filter.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| no-remote-preflight.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| offline-integration.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| offline-mode.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| packaging-bin.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| parent-id-normalization.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| prefix-config.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| prefix-migration.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| priority.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| project-task-graph.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| readiness-surface-agreement.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| readme-board.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| references.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| remote-id-conflict.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| reorder-utils.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| resolveBinary.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| runtime-cwd.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| search-service.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| shared-branch-task-loader.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| start-id.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| statistics.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| status-callback.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| status-filter.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| status-icon.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| status-resolution.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| subtask-ordering-consistency.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| subtask-progress.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| symlink-backlog-root.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| task-artifact-cli-mcp-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| task-container-creation-recovery-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| task-container-lifecycle-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| task-delete.test.ts | D <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| task-edit-preservation.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| task-frontmatter-storage.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| task-id-resolution.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| task-identity-index.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| task-loader-current-snapshots.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| task-mutation-service.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| task-opaque-body-integration.test.ts | D <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| task-path.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| task-project-filtering.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| task-project.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| task-runtime-identity-remap-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| task-search-label-filter.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| task-search-parity.test.ts | D <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| task-sorting.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| task-type-config.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| task-type-filtering.test.ts | D <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| task-type.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| task-updated-date.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| task-v3-artifact-migration-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| task-watcher.test.ts | D <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| task-wizard.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| task-worktree-lifecycle.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| terminal-status.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| update-task-description.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| utc-date-display.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| vacated-task-references.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| view-state-store.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| watch-json.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| workspace-mode-preflight.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| workspace-state-in-progress.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| worktree-refresh.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| worktree-task-id-allocation.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |

### `src/agent-workspace/` — direct lifecycle/configuration/ownership (37)
<!-- consolidation: discard; ref: none; reason: Historical inventory count. -->

| File | Confidence |
| --- | --- |
| activity-observer.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| agent-status-probe.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| agent-status.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| bootstrap.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| completion-supervisor-resources.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| config.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| failed-mode-handoff-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| harness-environment.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| mode-ask-context-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| mode-colors.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| mode-lifecycle-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| mode-model.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| mode-session-reservation-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| mode-session-service-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| mode-stale-session-preview.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| native-namespace.test.ts | S, U <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opencode-detected-session.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opencode-versioned-presets.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| process-tree.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| project-mode-harness-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| project-state-root.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| project-upgrade-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| session-artifact-context-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| session-launch.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| session-process-resources.test.ts | D, U <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| session-process-tree-stop.test.ts | D, U <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| session-process.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| session-snapshot-adoption-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| session-store-mode-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| session-store.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| shared-runtime-service.test.ts | D, U <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| status-hooks.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| upgrade-engine.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| upgrade-journal-containment.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| upgrade-recovery-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| view-state-lock.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| workspace-context.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |

### `src/agent-workspace/agents/` — provider adapter contracts (6)
<!-- consolidation: discard; ref: none; reason: Historical inventory count. -->

| File | Confidence |
| --- | --- |
| model-profile-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opencode-resolution.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opencode-v1.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| opencode-v2.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| permission-profile-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| profile.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |

### `src/agent-workspace/live/` — observer (1)
<!-- consolidation: discard; ref: none; reason: Historical inventory count. -->

| File | Confidence |
| --- | --- |
| existing-agent-host-observer.test.ts | D, U <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |

### `src/agent-workspace/live/input/` — input worker (1)
<!-- consolidation: discard; ref: none; reason: Historical inventory count. -->

| File | Confidence |
| --- | --- |
| worker.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |

### `src/agent-workspace/live/tmux/` — transport boundary (4)
<!-- consolidation: discard; ref: none; reason: Historical inventory count. -->

| File | Confidence |
| --- | --- |
| exec.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| session-control.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| transport-detach.integration.test.ts | D <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| vt-channel.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |

### `src/file-system/` — repository contracts (4)
<!-- consolidation: discard; ref: none; reason: Historical inventory count. -->

| File | Confidence |
| --- | --- |
| artifact-approval-contract.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| artifact-approval-key-contract.test.ts | D <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| milestones.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| task-artifact-repository.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |

### `src/ui/opentui/` — colocated view/model contracts (4)
<!-- consolidation: discard; ref: none; reason: Historical inventory count. -->

| File | Confidence |
| --- | --- |
| mode-model-picker.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| mode-row-label.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| mode-settings-draft.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| task-artifact-view.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |

### `src/commands/` — command contracts (2)
<!-- consolidation: discard; ref: none; reason: Historical inventory count. -->

| File | Confidence |
| --- | --- |
| completion.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| skill.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |

### `src/completions/` — completion contract (1)
<!-- consolidation: discard; ref: none; reason: Historical inventory count. -->

| File | Confidence |
| --- | --- |
| helper.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |

### `src/utils/` — output-mode contract (1)
<!-- consolidation: discard; ref: none; reason: Historical inventory count. -->

| File | Confidence |
| --- | --- |
| read-output-mode.test.ts | S <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |

### `scripts/` — separate smoke entrypoints (2)
<!-- consolidation: discard; ref: none; reason: Historical inventory count. -->

| File | Confidence |
| --- | --- |
| smoke-compiled-build.ts | D <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |
| smoke-parallel-task-locking.sh | D <!-- consolidation: discard; ref: none; reason: Historical inventory and review confidence. --> |

## Appendix B — supporting infrastructure accounting

These are not included in the 302 test-bearing-file count. <!-- consolidation: discard; ref: none; reason: Historical inventory accounting. -->

| Supporting path | Inspection and relevance |
| --- | --- |
| `AGENTS.md` | Read; source/binary handoff and scoped runner rules <!-- consolidation: discard; ref: none; reason: Historical inspected-source inventory. --> |
| `package.json` | Read; test/build/check commands and installed test/runtime dependencies <!-- consolidation: discard; ref: none; reason: Historical inspected-source inventory. --> |
| `bunfig.toml` | Read; preload and memory configuration <!-- consolidation: discard; ref: none; reason: Historical inspected-source inventory. --> |
| `.github/workflows/ci.yml` | Read; OS profiles, runner flags, compiled smoke, interactive and Nix checks <!-- consolidation: discard; ref: none; reason: Historical inspected-source inventory. --> |
| `.github/workflows/release.yml` | Scoped execution-marker search only; no test/smoke matches <!-- consolidation: discard; ref: none; reason: Historical inspected-source inventory. --> |
| `scripts/run-ci-tests.ts` | Targeted extensive read of discovery, profiles, bundle, worker/cancel/report/finalization <!-- consolidation: discard; ref: none; reason: Historical inspected-source inventory. --> |
| `src/test/test-preload.ts` | Read; environment and socket initialization/exit cleanup <!-- consolidation: discard; ref: none; reason: Historical inspected-source inventory. --> |
| `src/test/test-cli.ts` | Read; source/binary entrypoint and process result helper <!-- consolidation: discard; ref: none; reason: Historical inspected-source inventory. --> |
| `src/test/test-utils.ts` | Targeted read; unique fixture roots, Git template, gates/timeouts/retry/cleanup <!-- consolidation: discard; ref: none; reason: Historical inspected-source inventory. --> |
| `src/test/tmux-test-server.ts` | Read; test-owned socket guard and explicit real-server cleanup <!-- consolidation: discard; ref: none; reason: Historical inspected-source inventory. --> |
| `src/test/owned-test-processes.ts` | Targeted read; authenticated hierarchy/admission/identity contracts; not entire implementation <!-- consolidation: discard; ref: none; reason: Historical inspected-source inventory. --> |
| `src/test/tmux-pane-groups.ts` | Inventoried/import-boundary inspection only; full signal/probe implementation not reviewed <!-- consolidation: discard; ref: none; reason: Historical inspected-source inventory. --> |
| `src/test/agent-test-helpers.ts` | Inventoried/import usage only; test provider registration not deeply reviewed <!-- consolidation: discard; ref: none; reason: Historical inspected-source inventory. --> |
| `src/test/pin-timezone.ts` | Inventoried only; current usage not verified <!-- consolidation: discard; ref: none; reason: Historical inspected-source inventory. --> |
| `src/agent-workspace/test-fake-agent.ts` | Inventoried only; executable harness implementation not deeply reviewed <!-- consolidation: discard; ref: none; reason: Historical inspected-source inventory. --> |
| `src/agent-workspace/types.ts` | Exact `AgentSession`, status type and status constants inspected to validate fixture mismatch <!-- consolidation: discard; ref: none; reason: Historical inspected-source inventory. --> |

## Limits and report acceptance

This report gives exhaustive file inventory and static signal coverage, targeted evidence for concrete findings, and an implementation worklist. It does not claim every assertion was manually reviewed, every listed gap is absent elsewhere, or any test passed. The parent owns report acceptance; inventory and finding validation are complete to the stated static confidence level. <!-- consolidation: discard; ref: none; reason: Historical report scope acceptance and evidence limits. --> Before implementing against evolving files, re-read the cited symbols and their current owning contracts. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#general-principles; reason: Current approved contracts govern changes and discrepancies remain alignment work. -->

Not executed: test suites, smoke scripts, builds, CI, installed CLI, real providers/tmux/process lifecycle. Not deeply reviewed: 270 automated test files and the supporting paths explicitly marked inventory/search-only. Remaining risk is that runtime/platform behavior and unreviewed assertions can change the priority or exact replacement design; <!-- consolidation: discard; ref: none; reason: Historical review limits and counts do not establish current defects or success. --> no deletion is approved without equivalent behavioral coverage. <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Require explicit equivalent behavioral coverage before deleting tests. -->
