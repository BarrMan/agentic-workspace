# Core-contracts re-review

## Repair follow-up

The findings and owner annotations below describe the `e5747b1` baseline. They are retained as the repair input, not a current list of open defects. The implementation and owning contracts have been updated for R01–R35:

| Findings | Repair ownership and regression coverage |
|---|---|
| R01 | Renderer close choice preserves execution by default; force close awaits attempt-all Controller shutdown. Close-policy and settings tests cover confirmation, failure, retry, and teardown. |
| R02–R07, R16–R17, R35 | Session/Task models, SessionApplication, Harness and SessionProcess retain uncertain cleanup tracking, reject live resume/nonforced deletion, prepare captured worktrees, protect launch identities, observe retained idle evidence, select survivors, and make rollback repeat-safe. |
| R03 | Mode deletion supports confirmed discard or transfer to a chosen remaining mode, preserving unaffected ownership and live execution. Controller, SessionApplication, picker, journal and settings tests cover the operation. |
| R08–R09, R33 | Exact-pane input targeting, fenced temporary-server cleanup, and contextual model-discovery errors have focused Runtime tests. Shell-launcher identity acquisition is tested through adapter/bootstrap and readiness suites. |
| R10–R11, R18–R21 | Task workflows check archive eligibility, reject stale board placement, include completed/explicit archived search results, retain descendants, and deliver hooks/signals after unlocking with isolated delivery errors. |
| R12–R15, R24–R25 | Storage validates locations and whole persisted records, preserves malformed bytes, bounds authorized edits, reports identity mismatches, and supports arbitrary artifact names with containment and watcher coverage. |
| R22–R23, R29, R34 | Release errors remain visible; configuration/calling-session orchestration belongs to Controller; projection contracts belong to Model; request-marker recovery has one Storage owner; tmux interpretation belongs to Runtime. |
| R26–R28, R30–R32 | Platform paths and supported verification commands are corrected; list limits/numbers, optional task title, directory-owned project scope, and board hints are covered by focused CLI/Renderer checks. |

Accepted behavior is recorded in the owning [session](../specs/sessions.md), [configuration](../specs/configuration.md), and [task](../specs/tasks.md) contracts. Dependency validation now takes a loaded corpus rather than a persistence handle. Shutdown attempts all targets and reports aggregate failures afterward; failed shutdown restores launch admission.

### Existing-data policy

- Counters now use `lastAllocated`. The owner authorized only an **explicitly invoked** conversion: `bun scripts/migrate-task-counter.ts <project-root>`. It holds the create lock, validates the complete old record, and atomically converts `next: 3` to `lastAllocated: 2`, preserving the next task ID. Ordinary allocation rejects old/corrupt counters; it does not convert or reconstruct them.
- Fresh stores default to `.agentic-workspace`. Existing task folders stay in place and require explicit location configuration; no automatic relocation or old-path fallback is introduced.
- Existing request markers retain their established Storage recovery path and format. Removing the unused producer and duplicate Runtime persistence does not remove marker data.
- No existing user data was converted, relocated, or deleted during these repairs. Unrelated OpenCode configuration and profiling files remain outside the change.

### Verification boundary

Focused regressions were run by each repair lane and inspected during integration. Final integrated evidence:

| Check | Repair result |
|---|---|
| `bun run test` with `RUN_INTERACTIVE_TUI_TESTS=1` | 1,642 passed, 0 skipped, 0 failed across 230 files; Python `pyte` available and compiled PTY target explicitly selected |
| `bun run check:types` | Passed |
| `bun run check` | 477 files; no errors; 68 warnings and 3 infos |
| `bun run check:fallow` | Passed dead-code, duplication and health gates; health 87. Removed 13 proven-stale entries from the duplication baseline, retaining 20 original matching entries and adding no suppressions. No stale-baseline warning; three current clone groups remain unsuppressed. |
| Parallel-locking smoke | Both scenarios passed with four jobs |
| `bun run build` | Main executable rebuilt after source integration |
| Source freshness | `find src -name '*.ts' -newer dist/agentic-workspace` produced no paths |
| Installed help | Root, task-list (`--limit`) and search (`--include-archived`) help passed against rebuilt executable |
| Compiled smoke | `bun scripts/smoke-compiled-build.ts dist/agentic-workspace 1.53.0` passed |
| Opt-in compiled PTY | `tui-interactive-editor-handoff.test.ts` passed with `RUN_INTERACTIVE_TUI_TESTS=1` and `TUI_TEST_CLI_PATH` pointing at the rebuilt executable |
| Opt-in settings PTY | `opentui-settings-independent-validation.test.ts` passed through source CLI entry, including combined edits, deferred save, persisted YAML and reopened settings |

Earlier integrated failures exposed stale fixtures and real shell-launcher identity, positive-process-absence, and overlaid-form key-routing issues; those were corrected before the passing final run. The compiled smoke fixture was also aligned with the fresh-store default and rerun successfully. The opt-in settings fixture now supplies JSON argv, replaces known initial input explicitly, parses persisted YAML, and invalidates its parent Core cache after the separate PTY process writes. Instrumentation confirmed the correct payload reached storage and the correct file; no production persistence fix was needed. Python `pyte` was installed only in a temporary verification virtual environment, not as a project dependency.

This repair pass does not establish exhaustive live-provider, interactive terminal, Nix, or cross-platform acceptance; the original static-read coverage limits remain relevant. Nix is not installed locally, and the Docker daemon is unavailable, so neither Nix nor container-based Linux execution could be performed here. Live-provider acceptance requires a controlled provider procedure; no such acceptance script is currently declared by the project.

## Verdict and evidence boundary

**Do not treat the implementation as conforming to the core contracts.** The source tests pass, but the reviewed paths contain execution-safety, data-preservation, behavior, and ownership breaches.

Implementation baseline: `e5747b1` (`Consolidate session lifecycle and enforce domain ownership`). This is a whole-repository, six-area static audit, not a claim that every source line or runtime scenario was inspected. A few reads occurred while the commit hook formatted files; critical paths were reread afterward. Findings below refer to the committed source. The audit made no implementation changes.

Authority: [PRODUCT](../PRODUCT.md), [SPEC and feature contracts](../SPEC.md), [BLUEPRINT and component contracts](../BLUEPRINT.md), [CONVENTIONS](../CONVENTIONS.md), [DESIGN-SYSTEM](../DESIGN-SYSTEM.md), [screens](../screens/README.md), and accepted [ADRs](../adr/README.md). Tests and prior audit/task documents are evidence, not permission to weaken those contracts. This report does not amend them.

The previous annotated `code-rules-architecture-review.md` was not edited. Unrelated OpenCode configuration and root profiling files were excluded from the implementation commit.

## Verification observed

| Check | Result |
|---|---|
| `bun run check` | Exit 0; 464 files; 74 warnings, 3 infos; no errors |
| `bun run check:types` | Exit 0 |
| `bun run test` | Exit 0; 1,522 pass, 2 skip, 0 fail; 1,524 tests in 221 files |
| `bun run check:fallow` | Exit 1 at dead-code analysis; duplication and health subcommands did not run |
| `bun run build` | Succeeded after commit |
| `find src -type f -newer dist/agentic-workspace` | No output |
| Installed `agentic-workspace --help` | Succeeded against the rebuilt executable |

The verification agent invoked package checks through `rtk`; the main integrator rebuilt and checked freshness/installed help. The two skipped tests are opt-in interactive PTY tests. The earlier observer timeout did not recur in this post-commit full run; that does not establish its cause or eliminate intermittent failure.

## Findings

P1 means execution/data-safety or major contract failure. P2 means a concrete behavior/structural gap. P3 means a lower-exposure correctness gap. These are source-supported scenarios, not claims of live reproduction.

### Execution and data safety — P1

#### R01. Normal app close detaches rather than shutting down executions

- **Evidence:** `src/renderer/opentui/workspace-controller.ts:625–630,1983–1998` destroys presentation resources and prefers `host.detach()`. `workspace-agent-host-owner.ts:26–35,61–72` preserves execution on detach. `src/controller/session-application.ts:368–378` defines shutdown, but no production caller invokes it; the CLI workspace entry at `src/cli/commands/agent-workspace.ts:25–27` adds no shutdown hook.
- **Rule:** SESSION-018, `docs/specs/sessions.md:382–395`; BLUEPRINT shared rule 66. Normal close must stop every session; detach must not stop execution.
- **Consequence:** Start an agent and quit normally: its process/pane can survive, contrary to the reopen contract.
- **Correction:** After settling input and pending launches, await Controller-owned shutdown before reporting close completion. Keep attachment detach semantics separate.
> I actually intended for something else in the future so instead of correcting this, if it's simpler or not much effort, on app shutdown, display a confirmation modal, saying that there are currently running sessions (RUNNING means agent is working, green), asking the user to either force close and killing all the running sessions completely or closing the app without forcing close, letting the process not detach and still live and keep on executing, when the user comes back to the app, the app won't need to be resumed because the pane already exists and it was not detached.

#### R02. Failed startup can lose the durable tracking of an incompletely cleaned execution

- **Evidence:** `src/runtime/harness.ts:205–241` can throw a failure carrying `execution` and `identity`. `src/model/session/session.ts:74–78` installs an execution only on success; `src/controller/session-application.ts:455–481` checks only `session.execution` before rolling back the reservation. A second failure path exists: Harness constructs a recovery handle at `:206` before its cleanup try; construction at `:273` requires a fresh live-pane lookup (`src/runtime/session-process.ts:615–639`). A dead pane or failed lookup can escape before cleanup and recovery wrapping.
- **Rule:** SESSION-009/010, `docs/specs/sessions.md:199–230`; `docs/blueprints/harness.md:85–95`.
- **Consequence:** A failed launch with failed or uncertain cleanup can lose its recovery anchor. A dead remain-on-exit pane can also bypass cleanup entirely.
- **Correction:** Carry acquired resource identity into cleanup without requiring a new live lookup; consume recoverable execution failures at the Session boundary. Retain durable tracking until cleanup is positively established.
> Sounds like a lot of work to achieve that, please explore other simpler options like idempotency, an external package, I don't know. Explore options and try to make it as simple as possible (KISS). it should be "good enough"

#### R03. Deleting one mode forgets ownership of other modes' executions

- **Evidence:** `src/controller/agentic-workspace.ts:240–243` calls `forgetTaskSessions(taskId)` after discarding one mode. `src/controller/session-application.ts:265–269` deletes every local Session reference for that task, irrespective of mode. Shutdown relies on that map at `:368–378`.
- **Rule:** CONFIG-012 and SESSION-018.
- **Consequence:** Delete mode A while mode B has a live agent. B remains live but is no longer in the application's owned execution map; even a correctly wired shutdown cannot find it there.
- **Correction:** Forget only the deleted mode's session IDs; retain ownership and observers for surviving sessions.
> I don't quite understand what you mean by that. How is deleting one mode affects other modes? Our spec for this is, delete a mode -> user may choose to either discard existing sessions in the soon to be deleted mode or move them to another mode -> so basically it's just taking the existing soon to be deleted mode sessions and placing them one by one (sorted by date? LFU? I don't care) in the chosen to be moved to mode.

#### R04. Non-forced deletion can orphan a live parked session

- **Evidence:** `src/controller/session-application.ts:286–316` rejects only `state === "running"`; it stops only when forced. `src/model/session/session.ts:94–103` classifies a live retained execution as `parked`, and resume initially installs a parked snapshot at `:80–85`.
- **Rule:** SESSION-020, `docs/specs/sessions.md:425–437`; unknown evidence cannot authorize clean completion.
- **Consequence:** A second window can remove a live session's relationship without killing its agent. Unknown observations can also pass the running-only guard.
- **Correction:** Require positively observed absence for non-forced deletion; reject live/starting/uncertain evidence. Forced cleanup must finish before records/resources are removed.
> KISS

#### R05. Resume can kill an execution that is already live

- **Evidence:** `src/controller/session-application.ts:143–155` checks native identity but not stopped eligibility. `src/runtime/harness.ts:151–155` calls `assertNoPreparedResources`; `src/runtime/session-process.ts:316–319` kills a matching owned pane without requiring it to be dead.
- **Rule:** IF-SI-002; `docs/blueprints/session.md:190–194`; `docs/specs/sessions.md:448–451,475–479`.
- **Consequence:** Explicit resume in another window can interrupt active work by killing and replacing the same conversation's live execution. Correct target ownership is not authorization to replace it.
- **Correction:** Require positive stopped evidence before resume. Runtime must reject live or unknown replacement targets; retain exact-native-ID validation.
> KISS

#### R06. First launch ignores the captured task worktree policy

- **Evidence:** `src/controller/session-application.ts:70–100,548–560` creates every new record with project-root cwd/worktreeDir and has no worktree preparation step. Harness consumes that cwd at `src/runtime/harness.ts:138–148`.
- **Rule:** TASK-012, `docs/specs/tasks.md:251–270`; SESSION-004.
- **Consequence:** An enabled worktree policy still launches the agent in the shared checkout, placing its edits outside the required isolated worktree.
- **Correction:** Resolve/create/adopt the task work context before reservation and persist its actual roots; fail with the expected-path information when preparation fails.
> yes

#### R07. Child task/mode environment identities are not protected at launch

- **Evidence:** `src/runtime/harness.ts:141–150` passes sessionId but omits taskId and modeId to preflight. `src/runtime/session-launch.ts:112–116` sets their protected variables only when supplied; the serialized context later receives the actual new identities at `harness.ts:161–165`.
- **Rule:** SESSION-007, `docs/specs/sessions.md:159–170`; `docs/blueprints/harness.md:25`; CONVENTIONS test/launch isolation rule.
- **Consequence:** A child launched from an agent environment can inherit the parent's task/mode variables, or conflicting preset values, alongside a context identifying a different task/session.
- **Correction:** Pass context.taskId and context.modeId through existing preflight inputs and assert the final environment against conflicting inherited/preset values.
> ok

#### R08. A multi-chunk paste changes target after the first chunk

- **Evidence:** `src/runtime/live/existing-agent-host.ts:35–42,127` wraps an input worker using the synthetic session `external` and rewrites only the first `-t`. `src/runtime/live/input/worker.ts:86–96` chains multiple `send-keys -t ...` commands for chunks over 512 bytes.
- **Rule:** SESSION-019 input delivery/settlement, `docs/specs/sessions.md:405–415`; supported live interaction in PRODUCT.
- **Consequence:** The first chunk reaches the selected pane; later chunks target `external:^.0`, failing after partial delivery or reaching an unrelated session named external.
- **Correction:** Give the worker the exact pane target rather than rewriting a chained command. Cover a multi-chunk paste through this host boundary.
> ok

#### R09. Temporary OpenCode-server cleanup lacks the required process-name fence

- **Evidence:** `src/runtime/agents/opencode/opencode-session-capture.ts:19–26,66–69` terminates by PID without retained expected process identity; `src/lib/process-tree.ts:22–35` checks the name only when identity is supplied. It then waits for `child.exited` before handling a survivor result.
- **Rule:** `docs/blueprints/harness.md:25`; `docs/blueprints/session.md:199` (PID plus process-name termination identity).
- **Consequence:** A differently named process reusing the PID can be killed; an unstopped child can prevent cleanup failure from being reported.
- **Correction:** Capture PID/name identity on acquisition and pass it to termination; fail closed if inspection is unavailable and handle survivor outcomes without an unbounded exit wait.
> ok

#### R10. Archive accepts a task whose session is still live

- **Evidence:** `src/controller/task-lifecycle-service.ts:49–66` checks status/file presence, then moves the container without session observation. `src/renderer/opentui/task-lifecycle.ts:43–72` adds no running-session check. Admission locking does not establish absence.
- **Rule:** TASK-022, `docs/specs/tasks.md:447–465`.
- **Consequence:** Archive succeeds and removes an unfinished task from active storage while its agent continues running.
- **Correction:** Under admission, require sufficient current evidence that sessions have been explicitly stopped; refuse live/uncertain cases. Do not make archive implicitly stop agents.
> ok

#### R11. Board updates can undo concurrent placement changes

- **Evidence:** `src/controller/agentic-workspace.ts:564–575` reloads under locks but overwrites status, ordinal, and milestone from a plan built before locking.
- **Rule:** ADR-0001, `docs/adr/0001-model-owned-domain-behavior.md:25,54` (current-state locked mutation and concurrent-change preservation).
- **Consequence:** During a column rebalance, a neighbor moved concurrently to another status/milestone is restored to its stale placement by an ostensibly ordinal-only update.
- **Correction:** Carry intended fields and expected placement; revalidate/recompute under locks. Ordinal-only neighbor changes must not write stale status/milestone.
> KISS

#### R12. Task-container storage violates the configured-location contract

- **Evidence:** `src/filesystem/paths/agentic-workspace-directory.ts:210–225` rejects absolute/parent-relative choices but accepts `.git/workspace-data`. `src/storage/file-system.ts:137–143,171–179` restricts task roots to the project. `src/model/constants.ts:6–8` uses `agentic-workspace`, not the contracted default `.agentic-workspace`.
- **Rule:** TASK-006, `docs/specs/tasks.md:134–152`; ADR-0002:25.
- **Consequence:** Task data may be placed inside Git metadata, while the required user-level/external task-storage choices are unavailable.
- **Correction:** Resolve the contracted task-container location choices and exclude canonical Git metadata paths. Explicit stateRoot options affect SessionStore, not task containers; do not conflate these roots. Obtain authorization before relocating existing data.
> ok

#### R13. Invalid counter entries are automatically reconstructed

- **Evidence:** `src/storage/file-system.ts:445–464` treats an invalid existing next value like an absent prefix, scans extant IDs, and replaces the entry.
- **Rule:** TASK-003, `docs/specs/tasks.md:81–92`; CONVENTIONS:84–89 (one schema, no automatic repair).
- **Consequence:** An entry such as `{"TASK":{"next":-1}}` can be rebuilt below previously consumed but now absent task IDs, permitting identity reuse.
- **Correction:** Validate the complete counter schema; bootstrap only a genuinely absent prefix. Reject malformed existing counters unchanged. See counter-semantics conflict below before interpreting data.
> great! fix it

#### R14. Bounded migration can rewrite unrelated YAML or Markdown

- **Evidence:** `src/storage/task-config-migration.ts:240–254` matches any indentation of date_format; `:47–51,62–108` uses multiline frontmatter matching rather than a document-start-only extractor.
- **Rule:** TASK-023; CONFIG-016; ADR-0003:23 (preserve unrelated content during authorized migration).
- **Consequence:** A preset env variable named date_format is changed as though it were the root setting. A later Markdown delimiter in a malformed task can be mistaken for leading frontmatter and edited.
- **Correction:** Identify the actual top-level config node and leading frontmatter; use the established extractor. Report ambiguous structures without rewriting them.
> ok

#### R15. Malformed group entries are silently discarded and later saved away

- **Evidence:** `src/storage/group-store.ts:45–77` filters malformed groups/membership; `:124–132` writes the reduced projection during an unrelated update. The test at `group-store.test.ts:93` expects this behavior, but does not authorize it.
- **Rule:** CONVENTIONS:84–89 (schema-once validation and no automatic repair).
- **Consequence:** Renaming/collapsing a valid group can permanently remove a damaged neighboring entry without reporting corruption.
- **Correction:** Validate the persisted group-state record as a whole and refuse mutation of invalid state, preserving its bytes.
> ok

### Behavior, ownership, and verification gaps — P2

#### R16. The project-wide idle limit cannot select another window's idle session

- **Evidence:** `src/controller/session-application.ts:325–331,505–525`; `src/model/session/session.ts:94–103`; `src/runtime/session-runtime.ts:41–47`. Nonlocal live sessions become parked/unknown with null idleSince, while eviction accepts running/idle with a timestamp.
- **Rule:** SESSION-012, `docs/specs/sessions.md:252–271`.
- **Consequence:** A newer local idle session can be stopped instead of the project's oldest idle session, or no eligible session is stopped despite idle work elsewhere.
- **Correction:** Supply ephemeral runtime-owned activity/continuous-idle evidence for retained sessions across windows. Preserve unknown protection; do not persist lifecycle history.
> KISS

#### R17. Stopping the active session does not select and persist a survivor

- **Evidence:** `src/controller/session-application.ts:272–283` stops and forgets the model only; `src/model/task/task.ts:206–212` has the unused survivor-selection behavior.
- **Rule:** SESSION-013, `docs/specs/sessions.md:281–290`.
- **Consequence:** Stop selected A with retained B present: A remains the stored active selection.
- **Correction:** Apply model-owned survivor selection and persist it as part of the successful stop workflow.
> ok

#### R18. Search omits completed tasks and has no explicit archived scope

- **Evidence:** `src/controller/persistent-task-read.ts:18–39` loads completed records but returns an active-only tasks projection; `src/controller/agentic-workspace.ts:371–375` searches that projection. `src/cli/commands/search.ts:108–175` registers/passes no archive-inclusion request.
- **Rule:** IF-FS-003, `docs/specs/filtering-and-search.md:78–95`; IF-API-006.
- **Consequence:** A completed task disappears from normal search, and integrations cannot request archived tasks.
- **Correction:** Separate search corpus from active listing: include completed records by default and thread an explicit archived scope through Controller and CLI.
> ok

#### R19. Board projection drops grandchildren

- **Evidence:** `src/model/task/task-ordering.ts:144–155` removes same-status descendants from topLevel but expands only one child level; the board column policy calls it.
- **Rule:** IF-WB-001; `docs/screens/board.md:7`; nested identities in TASK-003.
- **Consequence:** TASK-1 → TASK-1.1 → TASK-1.1.1 in one status omits the grandchild entirely.
- **Correction:** Traverse all descendants using canonical identity keys and cycle/duplicate protection. Existing direct-child tests do not cover this case.
> ok

#### R20. Status hooks run while task locks are held

- **Evidence:** `src/controller/task-mutation-service.ts:111–140,228–252` awaits save/hook inside locked mutations; `src/controller/status-callback.ts:42–52` executes the configured shell hook. Board batches also await this path while holding locks.
- **Rule:** ADR-0001:25 (arbitrary awaited callbacks outside store locks).
- **Consequence:** An enabled hook editing the same task encounters contention; a slow hook holds a task or board batch locked after the data committed.
- **Correction:** Capture committed status events inside the mutation, release locks, then execute callbacks and report callback failures as post-commit outcomes.
> KISS

#### R21. Required task notifications are not integrated; delivery also stops on one throwing subscriber

- **Evidence:** Task creation/mutation/lifecycle paths contain no TasksChanged publication; the production Controller occurrence is the signal-name declaration. `src/controller/signals.ts:17–19` invokes subscribers without isolation.
- **Rule:** `docs/blueprints/controller.md:220–237`; `docs/blueprints/signals.md:9–11,22`.
- **Consequence:** Consumers of the approved notification interface receive no task-change event. Even if integrated, one throwing handler prevents later subscribers receiving a committed change.
- **Correction:** Publish at the shared post-commit Controller boundary; attempt every subscriber and expose delivery errors after delivery. This is not evidence that every existing screen is stale: watcher-driven refresh is a separate implementation path.
> ok

#### R22. Release failures can be hidden after successful writes or primary failure

- **Evidence:** `src/storage/session-store.ts:419–439,474–486` returns from try, bypassing checks after finally when release errors were only captured there. `src/filesystem/lock-owner.ts:39–47` suppresses release failure when the operation throws.
- **Rule:** CONVENTIONS:38–41; SESSION-010.
- **Consequence:** A committed write can resolve successfully despite a failed unlock, or an operation failure hides the cleanup failure explaining subsequent contention.
- **Correction:** Settle release and operation outcomes before returning; preserve primary errors and committed-write information. mutateMode/mutateSession had no observed production callers, limiting those subcases; LockOwner is production-used.
> KISS

#### R23. Several dependencies reverse the documented component ownership

- **Evidence:** `src/storage/config.ts:5,178–180,198–386` imports Core and performs resolution/mutation/reload orchestration; watcher wrappers in `src/storage/watchers/task-watcher.ts:376–382` and `config-watcher.ts:162–164` route through Core. `src/model/task/project-task-graph.ts:1–2` imports Controller projection types. `src/lib/process-tree.ts:41–42` interprets a tmux-specific failure in a domain-free helper.
- **Rule:** BLUEPRINT component ownership/layout/shared rules; `docs/blueprints/storage.md:3`; ADR-0006:21–27.
- **Consequence:** Policy, persistence, and runtime details change across layers in reverse dependency directions rather than through owned contracts.
- **Correction:** Put application orchestration in Controller, pure policy/contracts in Models, persistence in Storage, and tmux interpretation in Runtime. Remove forwarding wrappers after callers move; do not introduce aliases.
> ok

#### R24. Container/frontmatter identity mismatch is silently hidden

- **Evidence:** `src/storage/task-repository.ts:126–129` skips mismatches without warning; `src/storage/file-system.ts:687–689` returns no match.
- **Rule:** TASK-007, `docs/specs/tasks.md:154–172`; ADR-0002:42.
- **Consequence:** A malformed task disappears from collections without the required filename/error, and a direct operation can see not-found instead of the helpful corruption failure.
- **Correction:** Raise one contextual identity-validation error; warn/skip at collection boundaries and preserve strict direct-target errors.
> ok

#### R25. Generic artifact operations reject otherwise valid user filenames

- **Evidence:** `src/storage/task-artifact-repository.ts:15–33,271–278` reserves task.md and sidecar-style names inside the already isolated artifacts directory and hides reserved entries.
- **Rule:** TASK-011, `docs/specs/tasks.md:232–249` (arbitrary user-managed names).
- **Consequence:** A user cannot write/read/list some legitimate artifact names such as task.md inside artifacts/.
- **Correction:** Retain containment and necessary internal-temp protection, but remove superseded record/approval filename reservations from the user artifact namespace.
> ok

#### R26. Platform CI explicitly selects moved/deleted test paths

- **Evidence:** `.github/workflows/ci.yml:27–34,66` still selects old paths for Git, root resolution, task identity, and terminal-status tests, plus removed command tests.
- **Rule:** CONVENTIONS:54,59–61; ADR-0006:52 (colocated tests and real verification coverage).
- **Consequence:** The macOS/Windows lists no longer select the relocated OS-sensitive suites. Ubuntu discovery is not platform evidence.
- **Correction:** Update moved paths, remove retired entries, and validate explicit matrix paths exist.
> ok

#### R27. Verification scenarios still invoke removed CLI surfaces

- **Evidence:** `src/test/tui-interactive-editor-handoff.test.ts:81,86` invokes board and edit --plain; `.github/workflows/ci.yml:133–140` wires it into binary verification. `scripts/smoke-parallel-task-locking.sh:77,241` uses init and task edit --add-label, whereas `src/cli/features/tasks/register.ts:195–198` accepts title/description only.
- **Rule:** IF-API-013/exhaustive inventory in `docs/specs/supported-integration-operations.md:235–252,282–293`; CONVENTIONS:51–54.
- **Consequence:** The opt-in PTY check cannot reach its real assertion through the supported CLI; the parallel-locking script fails before exercising contention.
- **Correction:** Use workspace and supported edit inputs; create fixtures directly. Require the interactive prerequisite in CI if it is meant to gate behavior; do not restore removed APIs to satisfy stale checks.
> ok

#### R28. Contractually retained --limit behavior is unreachable

- **Evidence:** `src/cli/features/tasks/register.ts:157–172` does not register --limit; `list-parse.ts:93–98` and `list-query.ts:30–35` still implement its path. Installed task-list help confirms its absence.
- **Rule:** TASK-020, `docs/specs/tasks.md:409,415–425`.
- **Consequence:** Commander rejects a request the contract explicitly retains.
- **Correction:** Register the existing option/validation/query path and cover it at the CLI boundary.
> ok

#### R29. CLI session operations directly read persistence

- **Evidence:** `src/cli/commands/agent-workspace.ts:60–65,74–80` reads sessionApplication.store and resolves calling mode in the frontend.
- **Rule:** `docs/blueprints/cli.md:48–51`; BLUEPRINT:61,67.
- **Consequence:** CLI operations depend on persisted session shape and own a resolution policy that should be shared through Controller.
- **Correction:** Pass calling identity and command input to Controller-owned ask/model operations; let CLI render only the result.
> ok

#### R30. List-window numbers silently accept malformed input

- **Evidence:** `src/cli/list-window.ts:46–53,92–117` uses parseInt then clamps without finite-integer validation.
- **Rule:** `docs/blueprints/cli.md:48`; TASK-020 allows signed integer clamping, not malformed numbers.
- **Consequence:** --max-count 2junk becomes 2; nope becomes NaN and can produce an empty successful page/invalid pagination state.
- **Correction:** Validate the complete signed integer and finite/safe range before conversion, then apply the approved negative-to-zero clamp.
> ok

#### R31. Task form requires a title and exposes a separate project field

- **Evidence:** `src/renderer/opentui/task-composer.ts:107,140–149,169–179` makes Title required and maps a Project selector into creation input.
- **Rule:** TASK-001, `docs/specs/tasks.md:31–48` makes each listed business field optional; `docs/screens/tasks.md:7,9` specifies project-directory scope without a separate project field.
- **Consequence:** Users cannot create an untitled task and can assign an unsupported separate project attribute.
- **Correction:** Align form, creation mapping, and underlying validation with optional business fields and directory-owned project scope. Do not patch only the visual constraint if downstream validation also rejects the approved input.
> ok

#### R32. Board footer omits available actions

- **Evidence:** `src/renderer/opentui/board.ts:217–234` omits actions whose handlers exist at `:410–420,461–471,485–506`.
- **Rule:** `docs/specs/workspace-and-board.md:182–200`; `docs/screens/board.md:7`.
- **Consequence:** Copy, complete, archive, settings, hide-empty-columns, and movement/recruit actions are available but not shown; move preview also omits recruit.
- **Correction:** Derive complete focus/state-specific hints from the available actions, or genuinely disable actions in the states where they are omitted.
> ok

#### R33. Failed model discovery is presented as a successful empty catalogue

- **Evidence:** `src/runtime/agents/core/profile.ts:129–165` returns [] for spawn failure, timeout, nonzero exit, and exceptions; the settings caller at `workspace-controller.ts:2487–2494` receives a normal result.
- **Rule:** CONFIG-010, `docs/specs/configuration.md:218–239`.
- **Consequence:** Credentials/provider/executable failures cannot be displayed distinctly from an empty model list.
- **Correction:** Propagate contextual discovery errors; reserve [] for a successful empty result or an adapter without the capability. Keep the stored opaque model ID.
> ok

#### R34. Duplicate request-marker persistence leaks into Runtime and conceals I/O failure

- **Evidence:** `src/runtime/workspace-context.ts:200–218,224–228,261–307` defines request records, constructs workspace persistence paths, writes through Storage helpers, and directly reads/deletes records. Renderer polls this route at `workspace-controller.ts:1616`. A second owner, `src/storage/workspace-control-store.ts:180–207`, likewise returns absence on arbitrary read failures and hides unlink failures. No production request-writer caller was established.
- **Rule:** BLUEPRINT:60–62; `docs/blueprints/harness.md:21–23`; ADR-0006; CONVENTIONS:32–41.
- **Consequence:** Application request persistence has parallel owners and a hard-coded runtime root. EACCES can masquerade as no requests or successful removal.
- **Correction:** Determine whether the producerless route is needed and remove superseded code if not. Otherwise Storage owns paths/schema/I/O and Controller owns handoff. Treat only missing files as absence; report incomplete deletion. Account for existing marker data before any removal or reinterpretation.
> ok

### Lower-exposure behavior gap — P3

#### R35. Reservation rollback is not safe to repeat

- **Evidence:** `src/model/task/task.ts:169–176` throws when the provisional membership was already removed.
- **Rule:** SESSION-009, `docs/specs/sessions.md:202` requires repeated rollback safety.
- **Consequence:** Retrying settlement after successful removal reports an error instead of the already-completed result.
- **Correction:** Treat an already-removed matching reservation as settled while retaining task/incarnation and unrelated-selection protections.
>> KISS

## Contract questions — not permission to invent behavior

1. **Counter meaning conflicts.** `docs/blueprints/storage.md:117` describes next as the last allocated number; TASK-003 describes the next unused number. Source/allocation tests use next-unused. Resolve the owning-document contradiction without reinterpreting existing data.
> last allocated number. like auto-increment in db
2. **Model I/O boundary conflicts.** BLUEPRINT:26 prohibits Model I/O, while `docs/blueprints/task.md:139–140` specifies async DependencyValidator(store). The implementation follows the detailed page. Decide the seam before classifying those particular reads as code drift.
> IO as an IO operation can be done in the place that requests it (most preferably using a dedicated layer or wrapper). IO operations as for writing data that could have been placed in db, remotely or whatever, should be in storage layer.
3. **Shutdown failure continuation needs precise wording.** `docs/blueprints/controller.md:274` says failed stop propagates, while SESSION-018 requires stopping every session. Attempt-all with aggregated errors is compatible with both if propagation happens after attempts; clarify that order rather than introducing fail-fast cleanup.

Rejected preliminary UI claims: local draft mode removal is not a persistent deletion effect; the inspected Save path confirms before Core.deleteMode. Additional Settings categories are not prohibited merely because their surfaces are unspecified. Neither is retained as a breach.
> KISS

## Existing static-analysis gate failure

`check:fallow` reports three unused files, 12 unused exports (plus three hidden within already-unused files), three unused type exports, four unused members, and two duplicate-export pairs. This gate fails independently of the behavior findings.

- Unused files: `src/test/{agent-test-helpers,tmux-pane-groups,tmux-test-server}.ts`.
- Unused exports: `src/model/session/session-utils.ts:6,11,16,25` (findSessionById, findActiveSession, findSessionMode, allModeSessions); `src/model/task/status.ts:32,44` (getValidStatuses, getCanonicalStatus); `src/cli/features/tasks/policies.ts:3` (printMissingRequiredArgument); `src/filesystem/git/task-worktree-cleanup.ts:13` (cleanupTaskWorktreeSessions); `src/runtime/agents/startup.ts:7` (HarnessStartup); `src/runtime/bootstrap.ts:13` (yoloFlagFor); `src/runtime/errors/sessions.ts:1` (ResumeFailedError); `src/test/test-utils.ts:246` (createConcurrencyLimiter).
- Unused type exports: `src/model/task/task-update/index.ts:5` (ValidatedDependencyUpdate), `src/runtime/agents/core/agent.ts:58` (LaunchOrigin), `src/runtime/harness.ts:27` (RecoverableExecutionFailure).
- Unused members: `src/storage/storage.ts:158,163` (loadUserAgentConfiguration/loadProjectAgentConfiguration), `src/controller/session-application.ts:368` (shutdown), `src/runtime/agents/core/agents.ts:29` (all).
- Duplicate-export pairs: PreparedSessionStop in Controller/session types; SessionState in session types/session store.

Do not blindly delete shutdown or recovery semantics to make this gate green: R01/R02 show missing integration. Decide whether to wire a contract-required path or remove genuinely superseded code. No suppression/baseline expansion is proposed.

## Coverage inventory and limits

Braces below enumerate paths read by the reviewers; partial reads are explicitly identified. Reading a file does not prove all callers, race windows, or provider behavior.

### Task/model/controller lane

Full reads of production `src/model/task/`: `config-values.ts`, `dependency-graph.ts`, `dependency-validator.ts`, `duplicate-detection.ts`, `due-date.ts`, `label-filter.ts`, `milestones.ts`, `prefix-config.ts`, `priority-config.ts`, `project-config.ts`, `project-task-graph.ts`, `readiness.ts`, `reorder.ts`, `status.ts`, `task.ts`, `task-collection.ts`, `task-id.ts`, `task-identity-index.ts`, `task-links.ts`, `task-ordering.ts`, `task-path.ts`, `task-record-index.ts`, `task-search.ts`, `task-type-config.ts`, `terminal-status.ts`, `task-update/{index,collections,scalars}.ts`.

Full reads of `src/controller/`: `agentic-workspace.ts`, `duplicate-task-detection.ts`, `errors/tasks.ts`, `init.ts`, `init-helpers.ts`, `ordered-task-move-planner.ts`, `persistent-task-read.ts`, `search-service.ts`, `signals.ts`, `status-callback.ts`, `task-creation-input.ts`, `task-creation-workflow.ts`, `task-detail.ts`, `task-lifecycle-service.ts`, `task-loader.ts`, `task-mutation-service.ts`, `task-query-workflow.ts`, `task-reorder-plan.ts`, `vacated-task-reference-service.ts`, `workspace-state.ts`.

Supporting full reads: renderer `task-lifecycle.ts` and board column policy; controller signals tests; model task ID/ordering/search/terminal-status tests; cross-cutting atomic edit/search/artifact/lifecycle/mutation tests. Selected storage, CLI search, move-task tests, and search-parity tests were partial reads.

### Persistence/substrate lane

All 46 production files in storage/filesystem/lib were read: 28 Storage, eight filesystem, ten generic helpers. Storage: `artifact-text.ts`, `atomic-write.ts`, `config-codec.ts`, `config-schema.ts`, `config.ts`, `file-system.ts`, `group-store.ts`, `milestones.ts`, `session-store.ts`, `state-store-lifecycle.ts`, `storage.ts`, `task-artifact-repository.ts`, `task-config-migration.ts`, `task-repository.ts`, `types.ts`, `view-state-store.ts`, `workspace-control-store.ts`, both errors files, all six markdown files and all three watcher files. Filesystem: `lock-owner.ts`, `project-layout.ts`, `git/{main-worktree,operations,task-worktree,task-worktree-cleanup}.ts`, `paths/{agentic-workspace-directory,find-root}.ts`. Lib: `clipboard.ts`, `comparison-key.ts`, `debug-log.ts`, `process-tree.ts`, `runtime-cwd.ts`, `slug.ts`, `string-list.ts`, `time.ts`, `version.ts`, `process/capture.ts`.

Related allocation/session-store/migration/group tests were selected evidence, not exhaustive test-body review. No live concurrency, permission, symlink-race, watcher-delivery, or Git preservation experiment was performed.

### Session/lifecycle lane

Full reads: `src/controller/{session-application,workspace-state,status-callback}.ts`, `src/model/session/{session,types,session-utils,config,mode-model,mode-colors}.ts`, `src/runtime/{session-runtime,session-ask,session-launch,activity-observer,agent-status}.ts`, `src/index.ts`.

Partial reads: session/configuration Core paths (also fully read by task lane); agent-config-schema through line 250; session-process lifecycle/ownership ranges; task model/session-store/Harness dependencies; renderer inventory/activity/attachment. Close-path follow-up traced workspace CLI, renderer quit/destroy/host-owner, runtime detach and Harness recovery evidence. Status-hook/probe and terminal-input settlement were not fully exercised.

### Harness/runtime lane

All 30 owned production files read, relative to `src/runtime/`: `bootstrap.ts`, `harness.ts`, `harness-environment.ts`, `workspace-context.ts`, `task-skill.ts`, `tmux-pane-lookup.ts`, `completion-supervisor-resources.ts`, `errors/sessions.ts`, `agents/startup.ts`, `agents/core/{agent,agents,chrome-rules,hook-script,profile}.ts`, `agents/claude/claude.ts`, `agents/pi/pi.ts`, `agents/opencode/{opencode-resolution,opencode-session-capture,opencode-v1,opencode-v2,opencode-v2-cli-plugin,opencode-version}.ts`, `live/{agent-host,existing-agent-host,latency-trace}.ts`, `live/input/worker.ts`, `live/tmux/{exec,session-control,types,vt-channel}.ts`.

Supporting full reads: renderer host-owner and generic process-tree helper; tests for Harness/environment/existing host/input worker/VT channel/model-profile/session capture. Session launch/process and lifecycle callers were targeted dependencies. No live-provider readiness/acceptance or exact-resume experiment was performed. VT-channel production reachability was not established; only a test caller was found.

### CLI/packaging lane

Read every public registration and root entry; full/targeted implementation reads: `src/cli/{index,register,runtime,root-entry,read-output-mode,list-window,task-artifact}.ts`, `commands/{agent-workspace,search,help-schema}.ts`, `features/read-output.ts`, `features/tasks/{register,create,edit,input,list-parse,list-query,filter-normalizers}.ts`. Remaining wizard/parsing/completion helpers and most CLI test bodies were not read fully.

Read package/Bun/TypeScript/Biome/Nix definitions, CI/release workflows and pre-commit hook; scripts build/compiled smoke/task-config migration, CLI launcher/binary resolver/postuninstall, parallel-locking shell smoke. Benchmark read through line 180; bun.nix header only, not generated dependency entries. Read shared test preload/CLI/in-process/utilities/tmux helpers and selected packaging/routing/list/search/PTy tests. Installed root/task-list/search help was inspected. No Nix build, platform CI run, installation, historical deleted-test equivalence audit, or opt-in PTY execution was performed.

### Renderer lane

Read DESIGN-SYSTEM and all six screen specifications. Full/targeted code reads: `board.ts`, `board/interaction.ts`, board move/column/filter policies, board/lane models, `filters.ts`, `task-filters.ts`, `session-picker.ts`, `task-artifact-view.ts`, `keybindings.ts`, `task-detail-content.ts`, formatters `task-labels.ts`, `task-plain-text.ts`, `dependency-graph-text.ts`, `status-icon.ts`, `utc-date-display.ts`. Targeted portions, not full reads, of `agent-settings.ts`, `task-composer.ts`, `workspace.ts`, and `workspace-controller.ts` were inspected, with additional cross-lane close/attachment/lifecycle reads.

Remaining renderer host/group/task-action/workspace modules, other formatters, ambient declarations, and some shared model/root files were not individually reviewed in full. No live rendering, screenshots, resize/focus/key-routing, or terminal-attachment acceptance test was conducted. This is the largest remaining static-read coverage gap.

### Rules checked without an additional supported finding

Inspected task identity/status/priority paths use strict IDs and exact configured labels; milestone assignment uses IDs. Ordinary input edits reload under lock. Readiness recognizes missing/ambiguous dependencies without imposing a new launch gate. Primary task writes use temporary siblings and rename; task codecs retain unknown frontmatter/body. Ordinary session-state reads reject corruption rather than resetting it. Static artifact symlink containment checks are present. Inspected worktree removal does not force-discard contents. Provider adapters pin exact resume IDs with no new-conversation fallback; launch readiness requires initialization/acceptance receipts. These are bounded source observations, not a blanket pass for those features.

## Recommended repair order

1. Repair ownership and execution lifetime: R01–R09, with failure-path regression tests and no weakened unknown/cleanup fences.
2. Repair archival/concurrency/persistence safety: R10–R15 and R20/R22; authorize any existing-data movement or correction separately.
3. Restore required operation/query/selection/notification behavior: R16–R21, R24–R25, R28–R35.
4. Correct layer ownership and verification wiring: R23, R26–R27, then rerun all existing gates including Fallow; resolve the stated contract questions without silently redefining behavior.

No speculative features, compatibility aliases, legacy migrations, or provider-state mutation are recommended. Passing the current tests is necessary but does not substitute for these missing contract scenarios.
