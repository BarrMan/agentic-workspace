# Backlog.md test-suite improvement report

## Executive assessment

The suite has substantial behavioral coverage already. Its best examples exercise real temporary projects through Core, MCP tools, the controller, and filesystem repositories; preserve data on ambiguous failures; and use explicit gates for concurrency. The highest-value improvement is to make those contracts easier to trust and maintain, rather than add more tests indiscriminately.

Priorities:

1. **Protect isolation with adversarial preload tests and make CI actually use the runner's controls.** These affect whether every other test is trustworthy.
2. **Replace private-method and private-cache assertions with public outcomes.** Preserve resource limits and no-external-operation guarantees at their legitimate boundaries.
3. **Make controller/session fixtures structurally honest.** Several large test harnesses bypass required metadata and adapt themselves to production changes.
4. **Make negative async assertions and contention tests deterministic.** Keep a small number of real filesystem/process checks alongside controlled boundary tests.
5. **Consolidate repeated behavior into literal scenario tables plus thin route checks.** Delete an existing behavior test only after identifying an equivalent replacement at an appropriate seam.

This is a **static, report-only audit**, using the loaded `tdd` skill. No repository code, tests, configuration, or documentation was changed. No tests, builds, provider commands, tmux commands, or process-control operations were executed. This report is the sole written artifact.

## 1. Scope, inventory, and confidence

### Inventory totals

| Physical test location | Files | Counted source lines |
| --- | ---: | ---: |
| `src/test/` | 239 | 58,291 |
| `src/agent-workspace/` directly | 37 | 8,921 |
| `src/agent-workspace/agents/` | 6 | 733 |
| `src/agent-workspace/live/` directly | 1 | 189 |
| `src/agent-workspace/live/input/` | 1 | 113 |
| `src/agent-workspace/live/tmux/` | 4 | 593 |
| `src/commands/` | 2 | 150 |
| `src/completions/` | 1 | 123 |
| `src/file-system/` | 4 | 348 |
| `src/ui/opentui/` | 4 | 686 |
| `src/utils/` | 1 | 23 |
| **Automated test files** | **300** | **70,170** |
| `scripts/smoke-compiled-build.ts` | 1 | Separate executable smoke check |
| `scripts/smoke-parallel-task-locking.sh` | 1 | Separate executable smoke check |
| **First-party test-bearing files inventoried** | **302** | |

Of the 300 automated test files, **293 are tracked and 7 are nonignored untracked files**. The seven are marked `U` in the appendix. Physically absent index entries are not existing tests. The working tree is evolving; these are captured inventory counts, not a permanent manifest or a statement about a commit.

There are 299 `.test.ts` files and one `.test.tsx` file, `src/test/dependency-graph-surfaces.test.tsx`. Two names also contain `.integration`: `opentui-settings-persistence.integration.test.ts` and `live/tmux/transport-detach.integration.test.ts`. Other integration behavior is in ordinary `.test.ts` files; naming does not determine execution risk.

The discovery pass checked test/spec suffixes and JS/TS variants, underscore test/spec suffixes, Python/Go test naming, and smoke/integration/e2e names. Relevant first-party roots checked were `src`, `scripts`, repository configuration/automation directories, `docs`, `backlog`, `completions`, and temporary-area naming results. Dependency, generated, `dist`, Git internals, lockfiles, transient runtime artifacts, and task/spec prose are excluded. No additional first-party test family outside the listed locations was found. Hidden `.github/workflows` was inspected explicitly.

### Method and meaning of confidence

- **S — signal-only:** inventoried, assigned a family, and included in per-file line/signal scans. Its assertions and harness were not manually deeply reviewed. A zero signal count is not a clean bill of health.
- **D — targeted deep review:** relevant assertion and harness chunks were read and compared with a stated contract or relevant source/configuration. This does **not** mean every assertion or the entire file was reviewed.
- **U — untracked:** Git tracking metadata only, independent of confidence.

**30 automated test files received D review; 270 received S review.** Both smoke scripts received targeted D review. Appendix A accounts for all 302 files individually. For S files, family recommendations are review instructions, not verified file-level defects.

Dedicated Globs established locations and naming. Scoped `rg --count-matches` supplied exhaustive physical-file counts and aggregate indicators; Git metadata identified untracked paths. Targeted reads validated findings. No temporary scripts or repository artifacts were created. No external research or agent delegation was used. `AGENTS.md`, `package.json`, `bunfig.toml`, the CI workflow, runner, and relevant helpers were inspected. No `GLOSSARY.md` or ADR collection was found by the scoped naming pass.

### Aggregate indicators, not defect counts

| Static indicator | Files containing it | Regex matches |
| --- | ---: | ---: |
| Unsafe double casts / `as any` / TS suppressions | 39 | 183 |
| `sleep`, `Bun.sleep`, or `setTimeout` | 33 | 80 |
| `spyOn`, `mock.module`, or call-count assertions | 25 | 133 |
| Direct dotted environment assignments or `process.chdir` | 33 | 120 |
| Combined risk-signal expression, including skip/todo markers | 94 | 533 |
| Skip/gating markers, including interactive aliases | 14 | 34 |

The categories overlap. The combined expression differs from the gating expression. Counts are regex occurrences, not distinct defects, tests, execution frequency, or runtime measurements. Bracketed environment assignments, indirect helper mutations, aliases, and other mocking styles can escape these expressions. Ordinary timers for bounded failures and genuine external-boundary mocks are often correct.

29 test files have at least 500 lines. A simple declaration-name scan found 2,757 `describe`/`test`/`it` declaration indicators in 296 files; this is **not a test count** because parameterization, concurrency modifiers, aliases, and generated cases differ. The large-file and declaration metrics only guide sampling.

## 2. Current architecture and TDD alignment

### Execution architecture

- Bun is the test framework. `bunfig.toml` loads `src/test/test-preload.ts` and enables `smol`.
- `package.json` routes `bun run test` through `scripts/run-ci-tests.ts --timeout=10000`.
- The runner discovers Bun-compatible test/spec suffixes below `src`, selects `full` or a hand-written `platform` profile, and launches one process per test file. Defaults are five lanes and a 600,000 ms run deadline.
- `LONG_RUNNING_FILES` controls launch order. It is an optimization list, not proof of current runtime. No timings were measured in this audit.
- CLI-referencing files trigger one temporary compiled CLI build. Workers receive `BACKLOG_TEST_CLI_BINARY`; `test-cli.ts:getTestCliCommand` otherwise uses the source CLI entrypoint. Text-based reference detection is a heuristic and can miss references hidden behind helpers.
- Workers share a run-scoped temporary root but use unique project directories. Owned-process scopes, authenticated identity ledgers, cancellation, and terminal settlement govern runner cleanup. Unknown/survivor outcomes retain evidence instead of deleting it.
- The preload establishes Git test identity, removes workspace/provider pinning variables, and supplies a unique tmux socket when no override exists. Dedicated tmux helpers enforce test-owned labels for explicit real-server management.
- Tests mix pure domain functions, temporary filesystem/Core integration, in-process MCP tool dispatch, native OpenTUI rendering, fake process/tmux boundaries, stub executable transport integration, and opt-in real interactive tests.
- CI runs the full profile on Linux, a platform subset on macOS/Windows, compiled smoke checks on three OSes, one explicitly enabled compiled interactive suite on Linux, and a Nix package version/help check. `release.yml` had no test/smoke execution matches in the scoped pass.

### Proposed seams for future test work

These are recommendations for agreement before implementation, as required by the TDD skill. No tests are being written in this audit.

| Seam | Catches | Deliberately does not prove |
| --- | --- | --- |
| Core task/query/mutation APIs with temporary disk | Identity, filtering, persistence, locking, data preservation | CLI argument parsing and transport framing |
| CLI process: exit status and public output | Routing, validation, output bytes, pipe/TTY behavior | Every internal Core branch |
| MCP `testInterface.callTool` and schema discovery | Tool schema, validation, response/error contract | Real stdio connection and compiled packaging |
| Session service public lifecycle with typed external-boundary doubles | Ownership, observation, resume/forget semantics, error nonmutation | Installed provider compatibility or real tmux parsing |
| Session process/transport public adapter boundary | Exact target/provenance, cancellation, dispatch and teardown safety | End-to-end provider behavior |
| Controller public interaction/callbacks with real state/config where practical | Visible state, persistence, navigation, attach/detach | Native terminal behavior on every platform |
| Artifact repository public read/write/approval APIs | Path containment, byte hashes, approval invalidation | Full UI routing |
| Runner invocation and structured result | Admission, profiles, deadline, settlement, artifact retention | Arbitrary unregistered external processes |
| Few fixture-owned real filesystem/process/terminal smoke checks | Actual adapter wiring, atomic rename, cross-process locks, cleanup | Complete semantics already covered at cheaper seams |

### What already aligns well

- `task-search-parity.test.ts` checks independently expected IDs, not just equality between two implementations. Preserve that independent oracle.
- `task-type-filtering.test.ts` reaches Core, filesystem, persistent search, and CLI behavior. `mcp-task-type-filtering.test.ts` separately checks schema and dispatch boundaries.
- `atomic-task-edit.test.ts` asserts that final labels equal exactly the successful writers, while rejected writers report contention. This is the essential lost-write contract.
- `task-opaque-body-integration.test.ts` exercises persistence and rendering without private introspection.
- `shared-runtime-service.test.ts` uses public lifecycle calls and explicitly checks read-only observation and nonmutation on error.
- `session-process-tree-stop.test.ts` and `session-process-resources.test.ts` preserve strict foreign-ownership, inventory-provenance, explicit-stop, and retry behavior through boundary fakes.
- `owned-test-processes-deadline.test.ts` uses fake clocks/identities/signals, checks allowed targets, and does not actually signal OS processes. That is appropriate safety testing, not inherently bad mocking.

### What cannot be inferred statically

Whether tests were originally written red-before-green, their historical regression sensitivity, real flake rates, branch coverage, test order independence, wall time, memory use, and actual platform success remain unverified. Apply vertical TDD slices to future changes; do not claim a mass rewrite retrospectively makes the suite TDD.

## 3. Prioritized, evidence-backed findings

### F1 — P0: preload isolation tests need hostile inputs, not only ambient assertions

**Evidence:** `test-preload-isolation.test.ts` asserts nine variables are undefined and the current socket matches a generated-name pattern. It does not seed those variables before preload execution. `test-preload.ts` only generates/registers a socket if `BACKLOG_TMUX_SOCKET` is blank. `run-ci-tests.ts:runFile` spreads the parent environment into workers.

**Why it matters:** with an ordinary clean environment, deleting an environment-clearing line could leave the existing assertion green. A supplied nonblank socket survives the preload; the source does not enforce test ownership at that point. A supplied socket can be legitimate for a nested runner, so the distinction must be explicit rather than blanket removal.

**Smallest improvement:** add one parameterized child/preload observation contract using a fixture-owned process and seeded workspace/provider variables. Observe only serialized environment/socket results; perform no tmux operation. Cases: no override creates an isolated label; valid test-owned override is retained and appropriately accounted for; `default`, a live-style label, or a malformed override is rejected or replaced before any backend access. Agree the override policy first. Keep `session-server-isolation.test.ts`'s constructor-only default-socket behavior; it does not itself contact tmux.

**Preserve:** nested-runner ownership, inherited fixture scopes, provider-config clearing, and test-owned cleanup registration. Do not weaken socket guards to make the harness simpler.

### F2 — P1: CI controls and runner inputs have drifted

**Evidence:** `.github/workflows/ci.yml` supplies `BACKLOG_TEST_CLI_BUNDLE` and passes `--parallel=<matrix.test_workers>`. `run-ci-tests.ts` determines lane count from `BACKLOG_TEST_LANES`, forwards the unconsumed flags to each child, and constructs its own temporary compiled CLI. `test-cli.ts` reads `BACKLOG_TEST_CLI_BINARY`, not `BACKLOG_TEST_CLI_BUNDLE`. The runner's `PLATFORM_CONTRACT_FILES` also names `src/test/auto-commit.test.ts`, which the current physical inventory does not contain. The workflow comment about a serial DOM pass is unsupported by the inspected runner body.

**Why it matters:** matrix worker settings do not set outer runner lanes, the separate CI CLI bundle is not the handoff used by these helpers, and an absent platform-profile entry is admitted to file execution. This is verified configuration/source mismatch; no CI failure or exact Bun runtime response was observed.

**Smallest improvement:** make the workflow use the existing lane environment variable; choose one intentional CLI artifact handoff and remove the redundant build only after preserving compiled smoke coverage; validate selected profile paths against discovery before launch. Add a small runner contract for explicit selection, profile existence, forwarded test flags, and reported lane count. A mistyped explicit test path should fail promptly rather than accidentally expand the work scope.

**Preserve:** the cross-OS platform contract profile, bounded deadline, JUnit artifacts, and separate distribution/compiled checks. Do not replace the platform profile with indiscriminate cross-platform full-suite duplication.

### F3 — P1: controller fakes conceal required session metadata

**Evidence:** `opentui-workspace-controller.test.ts:composerCore`, `workspaceState`, `createWorkspaceState`, and `createController` use double casts, normalize legacy/default-mode state, and synthesize a session facade. `opentui-workspace-controller-shared-attachment.test.ts:fixture` returns an attachment record with `status: "RUNNING"` and no `tmuxName`, `cwd`, or `bootstrapPath`. `src/agent-workspace/types.ts:AgentSession` requires those fields; `AGENT_SESSION_STATUS` values are lowercase, including `"running"`.

**Why it matters:** the test can exercise paths with objects the production boundary is not supposed to produce. Harness repair code can hide a broken association or lifecycle projection. Eighty-eight combined signal matches in the large controller file identify a review hotspot, not eighty-eight bugs.

**Smallest improvement:** use one small complete typed session/attachment fixture with `satisfies` and deliberate overrides. For lifecycle/persistence contracts, use real temporary Core/state rather than an expanding imitation. Keep renderer, activity probe, and transport fakes where they are external boundaries. Remove default-filling adapters only after callers supply the actual declared contract.

**Preserve:** callback origin, project/task/session identity, canonical roots, native provider association, independent reader detach, and explicit-stop behavior. An unsupported fixture field should fail during type checking, not be silently manufactured by the harness.

### F4 — P1: lifecycle observation contracts should be split into named vertical scenarios

**Evidence:** `shared-runtime-service.test.ts` parameterizes `nativeWorkspace` as undefined/false/true and, within one long observation test, checks a live STARTING record, transient probe failure, dead pane, absent pane, and queued absent pane. It already asserts no kill during observation, byte/state-equivalent durable state on transient error, and queued absence remaining `starting`.

**Why it matters:** these are valuable current contracts, but one sequential scenario can prevent later states from being checked after an early failure. Backend flags are inputs, not the reason for the lifecycle rule.

**Smallest improvement:** retain a compact boundary fixture and separate named table cases for live STARTING, dead, conclusively missing without a request, missing with a queued request, and uncertain probe. Drive `reconcileTaskSessions`, `list`, and relevant lookup entrypoints; assert public state plus no prohibited mutations. Retain meaningful legacy flag variation as parameter coverage, not separate flag-specific semantics.

**Preserve exactly:** observation never kills; queued missing-pane STARTING remains STARTING; transient errors are nonmutating; explicit stop is separately allowed to mutate. Do not resurrect an old destructive observation expectation.

### F5 — P1: tests of Git private methods pin implementation rather than user outcomes

**Evidence:** `git.test.ts` repeatedly casts `GitOperations` to access/replace `detectRepository`, `resolveRepositoryPaths`, and `execGit`. The reset test asserts the shared resolver call and exact Git argv. A timeout test asserts `clearTimeout` was called exactly once. Some timeout cases directly call the private executor.

**Why it matters:** replacing a resolver, consolidating detection, or changing timer implementation breaks tests without changing the advertised behavior. Constructor-only `toBeDefined` adds little regression value by itself.

**Smallest improvement:** for reset, create two staged paths in a temporary repository, invoke public `resetPaths`, and independently inspect staged versus unstaged changes and the untouched file. For repository detection, use real temporary repository/no-repository states. Keep subprocess timeout/pipe cleanup behavior at an agreed process-adapter seam with a controlled child or boundary double. If exact probe coalescing is a required performance contract, retain one explicit boundary test rather than private-patching every detection case.

**Preserve:** path normalization, root scoping, filesystem-only policy, bounded external commands, inherited-pipe settlement, and timer/resource release. A command-dispatch assertion is legitimate in a dedicated Git adapter test, but not a substitute for observable repository behavior.

### F6 — P1: cache tests can retain behavioral strength while dropping private state inspection

**Evidence:** `filesystem-task-cache.test.ts:TaskCacheHarness` exposes `parsedTaskFiles`, read-generation maps, epoch counters, `readParsedTaskFile`, and `readTaskFiles`. Later cases assert map membership. Earlier cases already test public `listTasks`/`listCompletedTasks`, defensive copies, malformed-content failure, deletion/recreation, and same-size/same-timestamp edits, but mix them with parser call counts.

**Why it matters:** cache representation changes require test rewrites, although stale-read and isolation risks are real. An exact parser-call total is weaker than stale-content detection unless avoiding repeated parsing is an explicitly agreed resource contract.

**Smallest improvement:** express races through concurrent public listing/loading and gate file reads at the filesystem boundary. Assert later reads never publish stale/deleted content, returned mutable values cannot contaminate a later result, and selected roots remain isolated. Consolidate parse-count checks into one named efficiency contract if retained. Preserve the external file-read concurrency cap, with the limit sourced from an agreed operational contract rather than an unexplained number copied into multiple tests.

**Preserve:** malformed content never returns an old task; identical mtime/size does not conceal a byte change; cross-scan maximum resource usage is bounded. Do not delete the cap merely because it is not visible in a CLI string.

### F7 — P1: asynchronous absence checks need a completion fence

**Evidence:** `cli-json-watch.test.ts` sleeps 1,300 ms after rewriting unchanged bytes before asserting no extra snapshot; another site sleeps 1,100 ms. `live/existing-agent-host-observer.test.ts` waits 20 ms after stop/detach before asserting no reader output. `task-watcher.test.ts` waits for exactly eight internal reads to infer retry exhaustion.

**Why it matters:** elapsed time is not proof that a queued notification/retry has finished. Fixed retry totals couple tests to policy implementation. Positive polling with a bounded diagnostic deadline is different and often appropriate for real OS behavior.

**Smallest improvement:** on controlled boundary tests, drive events and advance the relevant scheduler until idle; assert no publication after the public stop/detach promise resolves. For real CLI watchers, retain a bounded observational window only where the contract is inherently temporal, and pair it with an explicit positive change proving the watcher stayed alive and suppressed duplicates. For retry tests, assert last-good state survives the whole configured retry budget, without hard-coding eight collaborator calls unless that budget is the agreed interface.

**Preserve:** exact initial JSON bytes, no duplicate output, post-detach silence, real atomic-rename coverage, malformed versus absent distinction, and branch-only task preservation.

### F8 — P1: contention tests should release/drain gates even when an assertion fails

**Evidence:** `atomic-task-edit.test.ts` gates a held filesystem lock, but the cross-process case releases it after the child operation rather than in `finally`. Its larger CLI race adds 40 filler tasks to increase accidental overlap. `task-delete.test.ts` blocks `deleteTaskContainer`, starts deletion, then performs assertions before releasing the gate; its surrounding `finally` restores an environment variable but does not guarantee gate release.

**Why it matters:** an unexpected result can leave pending work alive while fixture cleanup begins. Filler tasks increase cost without guaranteeing overlap. The existing winner-equals-final-labels assertion is strong and must remain.

**Smallest improvement:** place gate release and promise drain in `finally` immediately around each started operation. Keep one real cross-process contention/retry test; test the nuanced admission interleavings with explicit gates. Where a fixture executable is used, provide a readiness handshake rather than relying on startup duration or expanding task corpora.

**Preserve:** at least one writer succeeds; failed writers fail loudly and contribute no labels; every successful writer's label survives; deletion locks prevent all competing session admission paths; retry works after release.

### F9 — P1: strict negative resource assertions need exact-match scrutiny

**Evidence:** `session-process-resources.test.ts` records destruction events such as `kill-pane:resource-present` and `kill-pane:resource-absent`. Most cases check those qualified values or `startsWith("kill-pane:")`; the malformed-inventory loop checks only `not.toContain("kill-pane")`.

**Why it matters:** exact array containment of the unqualified string does not catch a qualified destructive event. This is a verified assertion mismatch, not proof production cleanup is incorrect.

**Smallest improvement:** assert `events.some(event => event.startsWith("kill-pane:")) === false`, and also assert the ownership marker and inventory remain intact after each failure. Reuse the already stronger assertion in the adjacent changed-marker case.

**Preserve:** no pane destruction before provenance validation; lost ACK retains resources; failed kill retains retry evidence; conclusively missing instance is distinct from an arbitrary error containing missing-like text.

### F10 — P2: a configuration omission test currently tests its own literal

**Evidence:** `artifact-approval-key-contract.test.ts`'s second case constructs a `Pick<ModeProfile, "prompt" | "approvalArtifact">` without `artifacts`, then expects that same object not to have `artifacts`. No production function is called.

**Why it matters:** the test cannot detect a production validator, serializer, or artifact repository incorrectly requiring declarations. It is an independent type example, not a runtime behavior regression.

**Smallest improvement:** keep the first prototype-key persistence/approval/revoke contract intact. Replace the literal-only case with an actual configuration load/validation plus public artifact write/read using an undeclared filename. Include one failure-path case at the path-validation boundary. Keep any compile-time shape example in a type-check fixture if the project needs it.

**Preserve:** optional declarations are not a filename allowlist; approval records for `__proto__`, `constructor`, and `toString` persist and revoke independently; bytes/hashes remain exact. Do not bulk-remove sidecar assertions that enforce a storage/security contract.

### F11 — P2: consolidate cross-surface semantics without dropping adapter-specific validation

**Evidence:** `task-type-filtering.test.ts` checks Core, filesystem, persistent search, and CLI; `mcp-task-type-filtering.test.ts` builds a similar typed/legacy corpus and checks MCP schemas and list/search behavior. `task-search-parity.test.ts` is an existing useful home for literal cross-surface expectations. `mcp-tasks.test.ts` and `local-task-command-performance.test.ts` maintain separate branch-loading tripwire helpers.

**Why it matters:** repeated setup is expensive and semantic expectations can drift. Conversely, CLI repeated/comma arguments and MCP array schema normalization are distinct contracts, so similarity alone does not justify deleting tests.

**Smallest improvement:** use a small immutable scenario table of literal inputs/expected IDs for shared query semantics. Run a dense behavioral matrix through Core; run representative route cases for CLI/MCP encoding, errors, and output. Share only narrow fixture setup or an explicit external-operation recorder when repeated, without a generic configurable mega-harness. Consolidate the no-branch/no-network invariant at the Git/process boundary, retaining a caller-specific route assertion where the route itself could opt into remote work.

**Preserve:** independent expected IDs, legacy untyped exclusions, OR/casing/composed filters, transport schemas, local-only behavior, and malformed-input errors. Two surfaces agreeing can both be wrong.

### F12 — P2: runner safety tests deserve a stable executable boundary

**Evidence:** `runner-finalization.test.ts` reads the runner source, strips imports with a regex, transpiles it, and executes an `AsyncFunction` with fake bindings. `runner-process-lifecycle.test.ts` separately exercises real runner processes and validates PID/UID/start-time ownership and terminal state. `owned-test-processes-hierarchy.test.ts` uses authenticated ledger fixtures for admission/provenance edge cases.

**Why it matters:** import formatting or a new binding can break source surgery without changing behavior. The fake suite is valuable because it can safely model uncertainty that should not be produced by killing arbitrary OS processes.

**Smallest improvement:** when changing the runner, establish an importable runner entry boundary accepting only the existing external I/O/ownership dependencies, or keep a small child-invocation contract if extraction costs more than it saves. Migrate the source-surgery harness one scenario at a time; do not design a new testing framework. Keep fake identity/deadline tests separate from fixture-owned real lifecycle verification.

**Preserve:** unknown/survivor means nonzero outcome plus retained evidence; no TMPDIR deletion before terminal proof; no launch after closed admission; bounded capture; concurrent settlement idempotence; ancestry/provenance authentication. Source simulation is not compiled CLI proof.

### F13 — P2: gated and platform-return tests need explicit coverage accounting

**Evidence:** the marker scan finds 14 files with skip/gating indicators. `agent-sessions.test.ts` has `itRealTmux`; `opentui-settings-independent-validation.test.ts` has an interactive `skipIf`; `git.test.ts` has a Windows early return in an OS-group timeout case. CI explicitly enables only `tui-interactive-editor-handoff.test.ts` against the compiled binary in its interactive step.

**Why it matters:** a collected/pass-looking suite is not evidence that gated behavior ran. Early returns can look successful while testing nothing on that platform. No claim is made that these omitted cases currently fail.

**Smallest improvement:** enumerate required gates and OS prerequisites in the execution manifest/report, use explicit skips for unsupported cases, and require at least one scheduled/job-owned route to run each essential real-boundary contract. Ensure required executables are installed before that job runs. Put core semantics in safe fake tests; leave only actual external wiring and terminal behavior gated.

**Preserve:** unsupported platform distinctions and safe real-resource ownership. Do not turn every fake lifecycle test into a real provider test.

### F14 — P2: smoke scripts need current storage contracts and a small persisted mutation

**Evidence:** `smoke-parallel-task-locking.sh:assert_sequential_ids` and edit lookup search flat `backlog/tasks/*.md` / `task-N - *.md`, while current task repository tests create `tasks/task-N/task.md` containers. `wait_for_jobs` captures `$?` inside `if ! wait ...`, so its diagnostic status is the inverted conditional result rather than the child's original status. It does still set its failure flag. The script has no bounded per-job wait; its exit trap only handles fixture deletion/preservation. Its edit scenario creates 100 filler tasks. `smoke-compiled-build.ts` checks help/version, init, MCP tools and resources, but does not call a mutating task tool and read the resulting task.

**Why it matters:** the parallel smoke checks a historical filesystem layout and can report misleading job status. The compiled smoke proves startup and registration, not persisted task mutation. These are source observations, not results from running the scripts or the installed CLI.

**Smallest improvement:** update smoke assertions to public JSON task queries or the agreed current repository container contract; record actual child statuses and bound settlement of only recorded fixture-owned processes before cleanup. Keep the winner/final-label oracle. Reduce filler setup only after a real readiness/interleaving check replaces it. Add one compiled task-create then task-view/list roundtrip with literal expected title/ID through the already connected MCP client, plus bounded cleanup.

**Preserve:** unique IDs, draft promotion/demotion, lost-write protection, compile target version, stdio startup, resource registration, and cleanup error reporting. Remove this smoke script only if all four scenarios are demonstrably covered through the same real cross-process boundary elsewhere; that equivalence was not established here.

## 4. Family-specific improvement map

Every appendix row inherits its family guidance. S rows require targeted confirmation before a file-specific edit or deletion.

### CLI — 44 prefixed suites, plus domain-owned CLI contracts

- Put repeated ID/filter/status/type/project/milestone combinations in literal Core scenario tables; preserve CLI-specific parsing, aliases, repeated/comma arguments, exit status, empty result, and stderr behavior in route checks.
- Keep exact byte contracts where output is consumed by agents/pipes. Avoid entire help-text snapshots for unrelated grammar changes; assert documented critical options and guidance at their actual route.
- Use filesystem-only fixtures for pure command semantics. Use Git only for actual branch/commit/worktree contracts. Use the existing shared CLI helper rather than independent entrypoint discovery.
- Watch/JSON cases should prove incremental freshness, disappearance, duplicate suppression, signal exit and drained streams. Never substitute one-shot/source equality alone for literal expected records.
- Packaging, root entry, launcher, pipe, init/no-Git, cursor PTY, and editor handoff remain distinct boundary tests. Verify which executable each test uses.

### MCP — 15 suites

- Prefer `testInterface.callTool` for schema/validation/result/error contracts and a small real stdio lifecycle suite for handshake/framing/cleanup.
- The inspected tool tests already exercise public behavior. Factor repeated temporary-project and content extraction code only when actually repeated; reject malformed content shapes where the protocol boundary promises text instead of silently converting everything to an empty string.
- Keep enum canonicalization, unknown values, workspace-root containment, client roots, and no-remote behavior as adapter-specific regressions. Preserve error results and disk nonmutation on validation failure.
- One create/edit/read regression per key mutation contract plus parameterized argument validation is more useful than repeating a full fixture for every display substring.

### OpenTUI — 34 central suites + 4 colocated view/model suites

- Keep real renderers for key layout, visible state, modal focus/keyboard access, and navigation contracts; keep terminal/process adapters fake for ordinary cases.
- Split large controller tests by behavior ownership: selection/navigation, group edits, composer persistence, configuration save/cancel, shared session attachment, and observation. Splitting without reducing fake normalization only moves the burden.
- Use a complete typed record at service-to-controller seams. Use a real temporary config/store in settings/lifecycle cases so missing metadata is visible.
- Preserve cancellation with no disk writes, reopening persisted settings, independent validation across categories, prompt/model/provider selection, safe approval projection, multi-reader detach, and focus restoration after errors.
- Native frame/assertion duplication is S-only in unreviewed files. Prefer semantic visible labels/focus and a few fixed-size representative frames over broad snapshot churn.

### Modes — 12 central suites + relevant workspace/model contracts

- Name tests for lifecycle, mode switching, artifact approval, prompt/edit/save/cancel, permission boundaries and legacy-read behavior, not retired flags/protocols.
- Use table cases for the catalog/default mode, custom modes, stale active IDs, stopped/starting/running states, and malformed config. Keep mode-local histories independent.
- Preserve missing-pane queued STARTING, nonmutating errors, no observation teardown, and explicit stop ownership. Legacy migration tests remain necessary until the supported persisted legacy input contract changes.

### Agent workspace/session — 37 direct + 6 provider adapter + 6 live tests

- Agree service lifecycle versus transport seams. Replace service-internal field access with public start/list/live/ask/stop/forget behavior, keeping identity/provenance negative assertions.
- Use typed boundary fakes for tmux, process tables, provider launch preparation and transport. Unknown commands should fail rather than silently return generic success where feasible. Do not copy production parser logic into a mega-fake.
- Keep adapter-specific syntax/version/model/permission contracts in the provider adapter family; keep generic session lifecycle independent of provider command strings. This audit did not validate actual installed providers.
- Preserve upgrade containment, journals, crash recovery, canonical project roots, immutable path contexts, resume receipts, reservation races, stale callbacks, marker validation, and cleanup retryability.
- Use one small real owned tmux/transport smoke for actual rows/socket forwarding and terminal attachment. Stub executables such as transport-detach test commands are external-boundary integration, not proof of a real provider or real tmux server.

### Domain/storage/query — 123 central suites + 4 filesystem repository suites

This accounting category is broad; route review work by the filename/contract:

| Subfamily | Review direction and behavior to preserve |
| --- | --- |
| Core/mutation/create/edit/delete/container/draft | Locked mutation, transactional failure, opaque data preservation, admission exclusion, no partial moves, idempotent retries |
| Markdown/frontmatter/content/artifacts/docs/references | Independent literal parse/serialize examples, unknown-field/body preservation, recursive docs, path containment, byte-bound approval and prototype keys |
| Identity/prefix/IDs/worktrees/duplicates | Canonical identity versus display representation, ambiguity refusal, padded/subtask IDs, separate branch content, collision repair and scope of Git changes |
| Query/search/filter/sorting/readiness/dependency | One literal scenario corpus, missing/malformed dependencies, cycles, stable tie order, composed filters and route parity with independent expected IDs |
| Watch/config/state stores | Last-good state on partial writes, atomic rename, no false removal, stop/drain, fresh process reload, contention and root isolation |
| Board/groups/reorder/statistics/readme | Deterministic ordering, boundary moves, empty/unknown statuses, nonmutation, real group persistence and minimal surface presentation |
| Dates/priority/due dates | Fixed independent literals, timezone/midnight/format boundaries, invalid input, public updated-date rules without wall-clock equality races |
| Git/offline/local-only/runtime/editor/packaging | Real temporary Git where required, process-boundary denial of remote work, canonical runtime cwd, input handoff, package resolution/platform contracts |

Do not infer a missing scenario just from its absence in a filename. For S-only families, first find the current owning contract and read its relevant assertion chunks. Small pure-function contracts are worth retaining when they own semantics; public does not mean every test must spawn the CLI.

### Harness/ownership — 11 central guard suites, runner/helpers, and 2 smoke scripts

- Keep fake clock/probe/signal tests for arbitrary PID/UID/recycle/provenance failures; keep real process checks restricted to authenticated fixture-owned identities.
- Keep terminal proof distinct from handle detach or worker exit. Inherited pipes and children require settlement before temporary directory removal.
- Keep unique sockets, safe labels, authenticated registry/ledger state, timeout diagnostics, signal interruption, deadline-aware admission, pending-file reporting, and evidence retention on uncertainty.
- Avoid global module mocks leaking into real suites; preserve one-process-per-file execution while those mocks remain. Within-file concurrency is appropriate only for cases owning all mutable state and resources.
- Replace source-body execution only at an agreed runner boundary; do not delete negative safety/protocol storage assertions merely because they involve implementation-visible files.

### Commands/completion/output utilities — 4 suites total

- `commands/completion`, `commands/skill`, `completions/helper`, and `utils/read-output-mode` should test actual exported behavior: shell choice, quoting/prefix/help failures, completion shape and output-mode precedence.
- Parameterize shell/input/env combinations and retain error outcomes. Their S status means there is no verified defect in these files in this audit.

## 5. High-risk contracts: keep, verify, or add a tracer slice

This is a coverage worklist, **not a declaration that every item is absent**. Items marked present were found in reviewed chunks; other routes/platforms remain unverified.

| Contract | Static evidence / current confidence | Next smallest slice |
| --- | --- | --- |
| Observation is read-only even for STARTING/uncertainty | Present in `shared-runtime-service`; observer stop/detach negative commands present | Table the states across public observation entrypoints; preserve store, pane and sidecar evidence |
| Queued request + absent pane is STARTING | Present in shared-runtime observation case | Named isolated case, independent of obsolete backend flag semantics |
| Foreign ownership cannot target input/attach/stop | Present in `session-process-tree-stop` | Keep task/project/session/name/role/provider matrix; check no external mutation |
| Resource cleanup validates provenance first | Present in `session-process-resources`; one weak event assertion found | Strengthen exact negative event and retain marker/inventory comparisons |
| Error text is not conclusive absence | Present in resource tests | Keep typed missing-versus-generic-error route; add caller variation only if not already covered |
| No cleanup before authenticated terminal proof | Present fake runner and real lifecycle chunks | Keep unknown/survivor/rejection, inherited pipes, checkpoint failure, closed admission and retry |
| Preload resists seeded live configuration/socket | Existing test observes ambient state; adversarial input not present in reviewed file | Fixture-owned preload child, no backend call |
| Deletes cannot admit concurrent session work | Present in `task-delete` with four admission routes | Guarantee gate release/drain; route parameterization with no process calls |
| Stale callback cannot stop replacement pane | Present named shared-runtime test; assertion body not deeply reviewed | Verify record+pane origin, same logical ID after resume, no destructive action |
| Path redirects never cause foreign deletion/write | Present named shared-runtime symlink test and deletion sentinel chunk; broader paths unverified | Review canonical alias versus redirected task/request/resource parent, preserved foreign sentinel |
| Approval becomes invalid when exact bytes change | Artifact repository family inventoried; key persistence reviewed | Read approval-contract cases before adding; retain independent hash/CAS rejection, unchanged bytes and restart |
| Locks preserve successful writes across processes | Present atomic edit winner oracle | One explicit cross-process readiness/lock test plus controlled races, failure retry and no wedged lock |
| Corruption is not mistaken for deletion | Present task-watcher chunks | Drive complete retry/reconciliation with last-good state and true absent transition |
| Source CLI versus compiled/package behavior | Distinct runner bundle, compiled smoke and Nix checks inspected | Compiled create/read roundtrip; record artifact identity. Installed CLI remains separate |
| Interrupted setup and partial cleanup preserve evidence | Runner handles unknown creation; settings cleanup loop stops at first thrown cleanup | Check started resources are always drained; attempt all owned cleanups while preserving aggregated failures |

Additional targeted questions for S files: permission errors versus malformed data, cancellation during bootstrap/ask/save, duplicate identity at mutation time, custom backlog roots and root symlinks, lock timeout/release after exceptions, date rollover/timezone, provider resume ID and namespace mismatch, cross-mode history independence, and platform-specific path/rename behavior. Search the owning contract first; add a failing example only for a demonstrated gap.

## 6. Grounded before/after examples (documentation only)

The following are short rewrite sketches grounded in actual reviewed tests, not executed patches. Fixture setup and teardown are omitted for readability; any implementation must keep them. Agree the seams before writing the tests.

### A. Qualified destructive events

Current `session-process-resources.test.ts`:

```ts
await expect(f.makeProcess().kill(f.session)).rejects.toThrow();
expect(f.events).not.toContain("kill-pane");
```

Proposed, matching the fixture's actual event vocabulary:

```ts
const inventory = f.options.get("@backlog_launch_resources");
await expect(f.makeProcess().kill(f.session)).rejects.toThrow();
expect(f.events.some(event => event.startsWith("kill-pane:"))).toBe(false);
expect(f.options.get("@backlog_launch_resources")).toBe(inventory);
```

Also keep the ownership-marker bytes assertion. The change makes a harmful fake `kill-pane:resource-present` event fail the test.

### B. Public cache behavior instead of cache membership

Current private-state pattern:

```ts
const harness = filesystem as unknown as TaskCacheHarness;
expect(harness.parsedTaskFiles.has(resolve(taskPath))).toBe(true);
expect(harness.taskFileReadGenerations.has(resolve(taskPath))).toBe(true);
```

The file already contains a stronger public pattern; use it as the base:

```ts
expect((await filesystem.listTasks())[0]?.title).toBe("Alpha");
await Bun.write(taskPath, replacement); // independently known "Bravo" bytes
await utimes(taskPath, originalStats.atime, originalStats.mtime);
expect((await filesystem.listTasks())[0]?.title).toBe("Bravo");
```

For the in-flight race, gate the external file read and finish the older read last, then assert the next public listing still returns the newer value. Keep one explicit resource-cap test separately.

### C. Required metadata stays typed

Current shared-attachment fixture has an untyped record with uppercase status and missing required fields. Proposed fixture shape:

```ts
const record = {
  id: "session-1", taskId: task.id, preset: "agent",
  tmuxName: fixtureOwnedTmuxName, cwd: root,
  createdAt: "2026-01-01T00:00:00.000Z", status: "running",
  outputPath: join(root, "output.log"),
  bootstrapPath: join(root, "bootstrap.md"),
} satisfies AgentSession;
```

Then type the attachment against the actual public return shape. Explicit path/provider provenance fields belong in the cases testing those contracts, not in a permissive catch-all fake.

### D. A gate releases even when the intermediate assertion fails

Current deletion test releases its gate after assertions. Proposed local structure:

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

Keep the after-deletion retry assertions and environment restoration outside this smaller guarded section; preserve both operation and cleanup errors if both fail.

### E. Keep literal oracles in parameterized route coverage

`task-search-parity.test.ts` already uses literal expected IDs. Consolidate repetitions using that pattern:

```ts
it.each([
  { query: "infrastructure", expected: ["TASK-1"] },
  { query: "morgan", expected: ["TASK-1"] },
])("matches $query", async ({ query, expected }) => {
  expect(await persistentTaskIds(query)).toEqual(expected);
});
```

Keep thin CLI/MCP argument/format checks with their own encoding. Do not replace independent expected results with `expect(cliResult).toEqual(coreResult)` alone.

## 7. Staged test-first improvement plan

Each row is a small vertical slice: agree seam → one discriminating failing test → minimal correction → targeted verification. Do not write a horizontal wall of imagined replacement tests before validating the first slice.

| Stage | First tracer slice | Acceptance checks for later implementation |
| --- | --- | --- |
| 1. Isolation | Seed one workspace variable in a fixture-owned preload child | Removing its clear step makes the regression fail; no live root/socket/provider is accessed; legitimate inherited test scope remains usable |
| 1. Isolation | Supply a live-style socket override to preload observation | Rejected/replaced before backend access; valid test-owned override follows agreed policy; cleanup registry is correct |
| 2. CI/runner | Runner report for a selected pure file with requested lane env | Reported selection/lanes match inputs; no unnecessary CLI build; forwarded flags are intentional; unknown selection and missing profile file fail before launch |
| 2. CI/runner | One intended CLI artifact handoff | Helpers run that artifact; redundant CI build removed only when separate compiled smoke remains; JUnit paths still valid |
| 3. Safety assertion | Malformed resource inventory emits a fake qualified kill event | Regression fails on any destructive event; real code preserves markers/inventory on error; no real OS signals |
| 3. Lifecycle | Queued missing-pane STARTING named scenario | No kills, STARTING retained, uncertain probes nonmutating; explicit stop tested separately |
| 4. Fixtures | One controller shared-attachment scenario with typed metadata | No double cast for the record; actual lowercase status and required paths; detach preserves shared runtime; stale origin cannot stop a replacement |
| 4. Async | One contention test with unconditional gate release/drain | Forced intermediate failure still settles owned promises/resources; winning writes preserved; no cleanup under an active gate |
| 5. Public seams | Replace one Git reset private-call test | Correct index state, normalized paths, unrelated staged file untouched; helper names/argv refactoring does not break it |
| 5. Public seams | Replace one cache membership race | Newer data survives a late older read; malformed/delete/root-isolation contracts retained; resource-cap test remains |
| 6. Duplication | One literal type/filter table at Core plus thin route cases | Every removed case mapped to same input/expected behavior and route obligations; MCP schema/CLI parsing retained |
| 6. Watchers | One no-duplicate/stop case with a public fence or controlled scheduler | Queued events cannot publish after stop; positive change confirms liveness; no arbitrary longer sleep |
| 7. Smoke/gates | Current-layout parallel query and compiled create/read | Exact successful-writer results and child statuses; bounded fixture-only settlement; compiled roundtrip persisted; each essential gate has an execution owner |

Use the existing runner for affected files when implementation is authorized. Do not run the full suite after every tiny slice. Once the changed family passes, verify the real-boundary contract it can break, then the relevant platform/CI profile. At integration handoff, the main agent must follow repository `AGENTS.md` to rebuild and verify the installed CLI. A source test, a temporary runner binary, and `dist/backlog` are distinct artifacts.

Acceptance should include a **sensitivity check**: the replaced test must fail for its target regression (missing clear, forbidden mutation, stale value, lost label, wrong route/schema, early delete). Avoid mutation-testing infrastructure; a controlled fixture behavior or one temporary local perturbation during authorized implementation is sufficient.

### Runtime and CI measurement, only during later authorized work

- Use the runner's existing structured report for per-file wall time, completed/pending/failed files, lane count, build time and deadline diagnostics. Add skipped/gated contract accounting if needed.
- Measure before/after the specific family on the same machine/conditions; separate CLI startup/native renderer/fixture setup from semantic assertion work.
- Resolve deterministic races before increasing timeouts or lane width. Preserve deadlines and diagnostics. Avoid retrying whole failures until they go green.
- Check that generated JUnit names do not collide, platform manifest entries exist, and required real-boundary cases actually execute. No claim about current timings or test success is made here.

## 8. What not to remove or over-check

- Do not delete ownership, provenance, path containment, provider namespace, deletion lock, uncertainty, cancellation, and concurrency assertions because they use fakes or inspect durable evidence. Some storage formats are explicit interoperability/security contracts.
- Do not replace a real filesystem rename, cross-process lock, native terminal, stdio or compiled smoke with a pure fake and call coverage unchanged.
- Do not duplicate every domain scenario at every route. Keep dense semantic coverage at its owning public seam and targeted validation/encoding/wiring at adapters.
- Do not test constructor existence, locally created literal shapes, every internal call count, cache field names, exact timer cleanup counts, or retired backend flags unless they own an agreed external/resource contract.
- Do not remove old tests solely for size, a regex signal, or similarly named cases. Require a replacement mapping: input, failure mode, observable expected result, seam, isolation and platform obligations.
- Do not add a new framework, assertion abstraction, large fake backend or configurable fixture DSL. Reuse Bun, existing helpers, literal scenario tables, and narrow external doubles.
- Do not use real providers, developer sockets, home state or unrelated process identities to validate ordinary fake/source tests. Real smoke uses only fixture-owned resources and explicit preconditions.

## Appendix A — exhaustive per-file coverage ledger

The location in each heading is the path prefix for every filename below it. Thus every row identifies one exact relative file. `D` means targeted assertion/harness review only; `S` means inventory/metrics and family guidance only. `U` marks the seven untracked tests. The family guidance in section 4 is the action route for each row. No S entry is asserted defective or safe.

### `src/test/` — CLI (44)

| File | Confidence |
| --- | --- |
| cli-agents.test.ts | S |
| cli-auto-plain-non-tty.test.ts | S |
| cli-custom-prefix-id-resolution.test.ts | S |
| cli-dependency-graph.test.ts | S |
| cli-dependency.test.ts | S |
| cli-doc-decision-board.test.ts | S |
| cli-doc-search.test.ts | S |
| cli-doc-view.test.ts | S |
| cli-doctor.test.ts | S |
| cli-draft-edit.test.ts | S |
| cli-due-date.test.ts | S |
| cli-exclude-status-filtering.test.ts | S |
| cli-guidance.test.ts | S |
| cli-incrementing-ids.test.ts | S |
| cli-init-create.test.ts | S |
| cli-init-cursor-pty.test.ts | S |
| cli-init-input.test.ts | S |
| cli-init-no-git.test.ts | S |
| cli-json-output.test.ts | S |
| cli-json-watch.test.ts | D |
| cli-launcher.test.ts | S |
| cli-list-window.test.ts | S |
| cli-milestone-filter.test.ts | S |
| cli-milestone-management.test.ts | S |
| cli-missing-storage-directories.test.ts | S |
| cli-parent-filter.test.ts | S |
| cli-parent-shorthand.test.ts | S |
| cli-pipe-output.test.ts | S |
| cli-plain-create-edit.test.ts | S |
| cli-plain-output.test.ts | S |
| cli-refs-docs.test.ts | S |
| cli-root-entry.test.ts | S |
| cli-search-command.test.ts | S |
| cli-status-filtering.test.ts | S |
| cli-task-batch-edit.test.ts | S |
| cli-task-list-ordinal-sort.test.ts | S |
| cli-task-list.test.ts | S |
| cli-task-milestone.test.ts | S |
| cli-task-project.test.ts | S |
| cli-task-state.test.ts | S |
| cli-task-type.test.ts | S |
| cli-task-view-edit.test.ts | S |
| cli-task-wizard.test.ts | S |
| cli-zero-padded-ids.test.ts | S |

### `src/test/` — MCP (15)

| File | Confidence |
| --- | --- |
| mcp-client-setup.test.ts | S |
| mcp-documents.test.ts | S |
| mcp-drafts.test.ts | S |
| mcp-fallback.test.ts | S |
| mcp-milestones.test.ts | S |
| mcp-refs-docs.test.ts | S |
| mcp-roots-discovery.test.ts | S |
| mcp-server.test.ts | S |
| mcp-stdio-exit.test.ts | S |
| mcp-task-complete.test.ts | S |
| mcp-task-project-filtering.test.ts | S |
| mcp-task-type-filtering.test.ts | D |
| mcp-tasks-local-filter.test.ts | S |
| mcp-tasks.test.ts | D |
| mcp-workspace-root.test.ts | S |

### `src/test/` — OpenTUI/interactive/UI (34)

| File | Confidence |
| --- | --- |
| opentui-agent-settings.test.ts | S |
| opentui-artifact-approval-projection.test.ts | S |
| opentui-confirm.test.ts | S |
| opentui-existing-agent-host.test.ts | S |
| opentui-filters.test.ts | S |
| opentui-group-delete-modal.test.ts | S |
| opentui-group-modal.test.ts | S |
| opentui-groups.test.ts | S |
| opentui-host-startup-cleanup.test.ts | S |
| opentui-keybindings.test.ts | S |
| opentui-mode-navigation-contract.test.ts | S |
| opentui-mode-passive-preview.test.ts | S |
| opentui-mode-permission-support.test.ts | S |
| opentui-mode-settings-contract.test.ts | S |
| opentui-mode-settings-input.test.ts | S |
| opentui-mode-startup-contract.test.ts | S |
| opentui-navigation-history.test.ts | S |
| opentui-session-picker.test.ts | S |
| opentui-settings-independent-validation.test.ts | S |
| opentui-settings-persistence.integration.test.ts | D |
| opentui-surfaces.test.ts | S |
| opentui-task-composer.test.ts | S |
| opentui-workspace-agent.test.ts | S |
| opentui-workspace-controller-groups.test.ts | S |
| opentui-workspace-controller-shared-attachment.test.ts | D, U |
| opentui-workspace-controller.test.ts | D |
| opentui-workspace-detail.test.ts | S |
| opentui-workspace-groups.test.ts | S |
| opentui-workspace-layout.test.ts | S |
| tui-interactive-editor-handoff.test.ts | S |
| tui-vim-boundary-navigation.test.ts | S |
| ui-keymap.test.ts | S |
| ui-option-compose.test.ts | S |
| ui-state-owners.test.ts | D |

### `src/test/` — modes (12)

| File | Confidence |
| --- | --- |
| mode-approval-indicator-editor.test.ts | S |
| mode-keybindings-contract.test.ts | S |
| mode-multiline-editor-contract.test.ts | S |
| mode-previous-session-contract.test.ts | S |
| mode-workspace-colors.test.ts | S |
| mode-workspace-input-contract.test.ts | S |
| mode-workspace-render-contract.test.ts | S |
| modes-container-path-contract.test.ts | S |
| modes-final-removal-state.test.ts | S |
| modes-legacy-read-contract.test.ts | S |
| modes-project-initialization-contract.test.ts | S |
| modes-task-creation-contract.test.ts | S |

### `src/test/` — harness/ownership (11)

| File | Confidence |
| --- | --- |
| bun-options.test.ts | S |
| owned-test-processes-deadline.test.ts | D |
| owned-test-processes-hierarchy.test.ts | D |
| runner-finalization.test.ts | D |
| runner-process-lifecycle.test.ts | D |
| session-server-isolation.test.ts | D |
| test-preload-isolation.test.ts | D |
| test-utils.test.ts | S |
| tmux-pane-groups.test.ts | S |
| tmux-pane-lookup.test.ts | S |
| tmux-test-server.test.ts | S |

### `src/test/` — domain/storage/query and associated contracts (123)

| File | Confidence |
| --- | --- |
| agent-instructions.test.ts | S |
| agent-selection.test.ts | S |
| agent-sessions.test.ts | D |
| agent-workspace-cli-routing.test.ts | S, U |
| agent-workspace-cli.test.ts | S |
| agent-workspace-model.test.ts | S |
| all-mode-task-cleanup-contract.test.ts | S |
| artifact-shortcut-overrides.test.ts | S |
| artifact-view-live-refresh-contract.test.ts | S |
| atomic-task-create.test.ts | S |
| atomic-task-edit.test.ts | D |
| backlog-directory.test.ts | S |
| board-domain.test.ts | S |
| board-loading.test.ts | S |
| board-ui.test.ts | S |
| board.test.ts | S |
| branch-task-loader-resilience.test.ts | S |
| cleanup.test.ts | S |
| code-path.test.ts | S |
| config-commands.test.ts | S |
| config-migration.test.ts | S |
| config-watcher.test.ts | D |
| container-duplicate-repair-contract.test.ts | S |
| content-identity.test.ts | S |
| content-store.test.ts | S |
| core-move-tasks-to-status.test.ts | S |
| core-task-corpus-regressions.test.ts | S |
| core.test.ts | S |
| date.test.ts | S |
| dependency-graph-surfaces.test.tsx | S |
| dependency-graph.test.ts | S |
| dependency.test.ts | S |
| desc-alias.test.ts | S |
| description-newlines.test.ts | S |
| docs-recursive.test.ts | S |
| documentation.test.ts | S |
| draft-create-consistency.test.ts | S |
| due-date.test.ts | S |
| duplicate-detection.test.ts | S |
| duplicate-task-repair.test.ts | S |
| editor.test.ts | S |
| enhanced-init.test.ts | S |
| entity-id.test.ts | S |
| filesystem-task-cache.test.ts | D |
| filesystem.test.ts | S |
| find-backlog-root.test.ts | S |
| frontmatter-diagnostic-propagation.test.ts | S |
| generic-artifact-search-contract.test.ts | S |
| git.test.ts | D |
| group-store.test.ts | S |
| id-generation.test.ts | S |
| immutable-project-context.test.ts | S |
| label-filter.test.ts | S |
| list-window.test.ts | S |
| local-task-command-performance.test.ts | D |
| main-worktree.test.ts | S |
| malformed-task-dependencies.test.ts | S |
| manual-git-control.test.ts | S |
| markdown.test.ts | S |
| milestone-filter.test.ts | S |
| no-remote-preflight.test.ts | S |
| offline-integration.test.ts | S |
| offline-mode.test.ts | S |
| packaging-bin.test.ts | S |
| parent-id-normalization.test.ts | S |
| prefix-config.test.ts | S |
| prefix-migration.test.ts | S |
| priority.test.ts | S |
| project-task-graph.test.ts | S |
| readiness-surface-agreement.test.ts | S |
| readme-board.test.ts | S |
| references.test.ts | S |
| remote-id-conflict.test.ts | S |
| reorder-utils.test.ts | S |
| resolveBinary.test.ts | S |
| runtime-cwd.test.ts | S |
| search-service.test.ts | S |
| shared-branch-task-loader.test.ts | S |
| start-id.test.ts | S |
| statistics.test.ts | S |
| status-callback.test.ts | S |
| status-filter.test.ts | S |
| status-icon.test.ts | S |
| status-resolution.test.ts | S |
| subtask-ordering-consistency.test.ts | S |
| subtask-progress.test.ts | S |
| symlink-backlog-root.test.ts | S |
| task-artifact-cli-mcp-contract.test.ts | S |
| task-container-creation-recovery-contract.test.ts | S |
| task-container-lifecycle-contract.test.ts | S |
| task-delete.test.ts | D |
| task-edit-preservation.test.ts | S |
| task-frontmatter-storage.test.ts | S |
| task-id-resolution.test.ts | S |
| task-identity-index.test.ts | S |
| task-loader-current-snapshots.test.ts | S |
| task-mutation-service.test.ts | S |
| task-opaque-body-integration.test.ts | D |
| task-path.test.ts | S |
| task-project-filtering.test.ts | S |
| task-project.test.ts | S |
| task-runtime-identity-remap-contract.test.ts | S |
| task-search-label-filter.test.ts | S |
| task-search-parity.test.ts | D |
| task-sorting.test.ts | S |
| task-type-config.test.ts | S |
| task-type-filtering.test.ts | D |
| task-type.test.ts | S |
| task-updated-date.test.ts | S |
| task-v3-artifact-migration-contract.test.ts | S |
| task-watcher.test.ts | D |
| task-wizard.test.ts | S |
| task-worktree-lifecycle.test.ts | S |
| terminal-status.test.ts | S |
| update-task-description.test.ts | S |
| utc-date-display.test.ts | S |
| vacated-task-references.test.ts | S |
| view-state-store.test.ts | S |
| watch-json.test.ts | S |
| workspace-mode-preflight.test.ts | S |
| workspace-state-in-progress.test.ts | S |
| worktree-refresh.test.ts | S |
| worktree-task-id-allocation.test.ts | S |

### `src/agent-workspace/` — direct lifecycle/configuration/ownership (37)

| File | Confidence |
| --- | --- |
| activity-observer.test.ts | S |
| agent-status-probe.test.ts | S |
| agent-status.test.ts | S |
| bootstrap.test.ts | S |
| completion-supervisor-resources.test.ts | S |
| config.test.ts | S |
| failed-mode-handoff-contract.test.ts | S |
| harness-environment.test.ts | S |
| mode-ask-context-contract.test.ts | S |
| mode-colors.test.ts | S |
| mode-lifecycle-contract.test.ts | S |
| mode-model.test.ts | S |
| mode-session-reservation-contract.test.ts | S |
| mode-session-service-contract.test.ts | S |
| mode-stale-session-preview.test.ts | S |
| native-namespace.test.ts | S, U |
| opencode-detected-session.test.ts | S |
| opencode-versioned-presets.test.ts | S |
| process-tree.test.ts | S |
| project-mode-harness-contract.test.ts | S |
| project-state-root.test.ts | S |
| project-upgrade-contract.test.ts | S |
| session-artifact-context-contract.test.ts | S |
| session-launch.test.ts | S |
| session-process-resources.test.ts | D, U |
| session-process-tree-stop.test.ts | D, U |
| session-process.test.ts | S |
| session-snapshot-adoption-contract.test.ts | S |
| session-store-mode-contract.test.ts | S |
| session-store.test.ts | S |
| shared-runtime-service.test.ts | D, U |
| status-hooks.test.ts | S |
| upgrade-engine.test.ts | S |
| upgrade-journal-containment.test.ts | S |
| upgrade-recovery-contract.test.ts | S |
| view-state-lock.test.ts | S |
| workspace-context.test.ts | S |

### `src/agent-workspace/agents/` — provider adapter contracts (6)

| File | Confidence |
| --- | --- |
| model-profile-contract.test.ts | S |
| opencode-resolution.test.ts | S |
| opencode-v1.test.ts | S |
| opencode-v2.test.ts | S |
| permission-profile-contract.test.ts | S |
| profile.test.ts | S |

### `src/agent-workspace/live/` — observer (1)

| File | Confidence |
| --- | --- |
| existing-agent-host-observer.test.ts | D, U |

### `src/agent-workspace/live/input/` — input worker (1)

| File | Confidence |
| --- | --- |
| worker.test.ts | S |

### `src/agent-workspace/live/tmux/` — transport boundary (4)

| File | Confidence |
| --- | --- |
| exec.test.ts | S |
| session-control.test.ts | S |
| transport-detach.integration.test.ts | D |
| vt-channel.test.ts | S |

### `src/file-system/` — repository contracts (4)

| File | Confidence |
| --- | --- |
| artifact-approval-contract.test.ts | S |
| artifact-approval-key-contract.test.ts | D |
| milestones.test.ts | S |
| task-artifact-repository.test.ts | S |

### `src/ui/opentui/` — colocated view/model contracts (4)

| File | Confidence |
| --- | --- |
| mode-model-picker.test.ts | S |
| mode-row-label.test.ts | S |
| mode-settings-draft.test.ts | S |
| task-artifact-view.test.ts | S |

### `src/commands/` — command contracts (2)

| File | Confidence |
| --- | --- |
| completion.test.ts | S |
| skill.test.ts | S |

### `src/completions/` — completion contract (1)

| File | Confidence |
| --- | --- |
| helper.test.ts | S |

### `src/utils/` — output-mode contract (1)

| File | Confidence |
| --- | --- |
| read-output-mode.test.ts | S |

### `scripts/` — separate smoke entrypoints (2)

| File | Confidence |
| --- | --- |
| smoke-compiled-build.ts | D |
| smoke-parallel-task-locking.sh | D |

## Appendix B — supporting infrastructure accounting

These are not included in the 302 test-bearing-file count.

| Supporting path | Inspection and relevance |
| --- | --- |
| `AGENTS.md` | Read; source/binary handoff and scoped runner rules |
| `package.json` | Read; test/build/check commands and installed test/runtime dependencies |
| `bunfig.toml` | Read; preload and memory configuration |
| `.github/workflows/ci.yml` | Read; OS profiles, runner flags, compiled smoke, interactive and Nix checks |
| `.github/workflows/release.yml` | Scoped execution-marker search only; no test/smoke matches |
| `scripts/run-ci-tests.ts` | Targeted extensive read of discovery, profiles, bundle, worker/cancel/report/finalization |
| `src/test/test-preload.ts` | Read; environment and socket initialization/exit cleanup |
| `src/test/test-cli.ts` | Read; source/binary entrypoint and process result helper |
| `src/test/test-utils.ts` | Targeted read; unique fixture roots, Git template, gates/timeouts/retry/cleanup |
| `src/test/tmux-test-server.ts` | Read; test-owned socket guard and explicit real-server cleanup |
| `src/test/owned-test-processes.ts` | Targeted read; authenticated hierarchy/admission/identity contracts; not entire implementation |
| `src/test/tmux-pane-groups.ts` | Inventoried/import-boundary inspection only; full signal/probe implementation not reviewed |
| `src/test/agent-test-helpers.ts` | Inventoried/import usage only; test provider registration not deeply reviewed |
| `src/test/pin-timezone.ts` | Inventoried only; current usage not verified |
| `src/agent-workspace/test-fake-agent.ts` | Inventoried only; executable harness implementation not deeply reviewed |
| `src/agent-workspace/types.ts` | Exact `AgentSession`, status type and status constants inspected to validate fixture mismatch |

## Limits and report acceptance

This report gives exhaustive file inventory and static signal coverage, targeted evidence for concrete findings, and an implementation worklist. It does not claim every assertion was manually reviewed, every listed gap is absent elsewhere, or any test passed. The parent owns report acceptance; inventory and finding validation are complete to the stated static confidence level. Before implementing against evolving files, re-read the cited symbols and their current owning contracts.

Not executed: test suites, smoke scripts, builds, CI, installed CLI, real providers/tmux/process lifecycle. Not deeply reviewed: 270 automated test files and the supporting paths explicitly marked inventory/search-only. Remaining risk is that runtime/platform behavior and unreviewed assertions can change the priority or exact replacement design; no deletion is approved without equivalent behavioral coverage.
