# Navigation change review

## Purpose and status

Review worksheet for the isolated navigation experiment. Add responses under each section's **Owner response** heading. This is supporting review material, not a behavior contract or implementation authorization.

The candidate was rejected for integration because it fails the required ≤15% additions/churn and net-removal gate, including tests. The owner has separately requested the corrections listed below; this does not accept the rejected candidate. Main's application code remains unchanged. No build or installed-CLI verification occurred. See [the audit plan](spec-blueprint-simplification-plan.md).

The explanations below reflect Oracle's source review. Not every change was absolutely necessary, and the experiment did not establish that its final implementation was simpler overall.

## Owner-requested corrections and questions

These record the owner's instructions for reconciliation with the owning contracts before implementation. They are not claims that the current code complies. Preserve these reference numbers in discussion.

| Reference | Owner instruction or question |
|---|---|
| 1.1.1 | Remove `nativeWorkspace`; its removal has already been requested repeatedly. |
| 1.1.2 | Task configuration determines cwd. Do not persist a separately selectable cwd on each session; fix this ownership. |
| 1.1.3 | Derive tmux names rather than storing them. A historical session means an inactive session; it must be stopped, detached, and its process killed. Report immediately if the implementation leaves such an execution alive. |
| 1.1.4.2 | Most-recent-session fallback applies only to active sessions. Retain `lastUsedAt` as a valid field. Historical sessions must have no leftover processes. |
| 1.1.4.3 | Explain the difference between `idleSince` and `lastUsedAt`; owner proposes `now() - lastUsedAt`. Verify timestamp versus duration semantics before changing the model. |
| 1.1.5.1 | Establish exactly what the output file captures; do not conflate terminal capture and provider conversation history or assume duplication is justified. |
| 1.1.5.2 | No temporary or permanent file for prompt injection. Find and reuse the already-existing file-free mechanism. |
| 1.3 | Explain why workspace refresh exists beyond initial relevant-data loading. |
| 1.5 | Fix the controller discarding watcher-provided updates and doing a broad reload. |
| 1.5.2 | Explain the concrete need for runtime observation/watchers rather than assuming they are necessary. |

**Correction to earlier explanation of 1.1.3:** The contract allowing execution survival across app close does not by itself establish that an inactive historical session survives. Verify deactivation and shutdown separately; unselected tasks, inactive modes, and inactive conversations must not be conflated.

**1.1.3 — Confirmed source violation:** `Task.reserveSession` changes the same mode's active pointer from A to B before startup (`src/model/task/task.ts`). `SessionApplication.createSession` reserves and starts B without stopping A (`src/controller/session-application.ts`). Creation permits A to be running at entry, so A can become historical while its execution remains alive. Explicit stop correctly performs teardown before updating selection, but that does not protect the creation path. This finding establishes a reachable code path, not that a particular live process exists on the owner's machine. No process inspection or termination was performed.

Existing persisted data, terminal logs, and live processes are not to be deleted, migrated, or terminated as part of investigation. If changing the schema would invalidate existing records, identify the affected data and obtain explicit handling approval before applying that change.

## Accounting method

- Compare baseline `60276f691efe937d98f992b7c8b750e6d555633b` with the final isolated candidate, not successive experimental versions.
- Every added/deleted line is assigned once. Counts include changed blank lines and moved code as represented by Git.
- Section boundaries are an explicit semantic allocation, not a Git-provided metric. Mixed hunks are divided by responsibility.
- Behavior-specific tests belong to their sections; shared fixture infrastructure belongs to §10. Zero allocated test lines does not mean zero coverage.
- Scratch evidence: `/var/folders/6z/jl00z05s7b7gmlgvjtf7fh9w0000gn/T/opencode/agentic-navigation-draft/.stage2-artifacts/combined-original-final.patch` and `navigation-accounting.md` in the same directory. These temporary artifacts are not permanent project dependencies.
- Counts describe the rejected candidate. They do not include an implementation of the owner's active-only navigation requirement.

## 1. Keep session information that we were already loading

| Code | Added | Deleted | Net |
|---|---:|---:|---:|
| Production | 4 | 1 | +3 |
| Tests | 0 | 0 | 0 |

**Owner feedback already received:** Good change, but load only the active session for each task and each plan—not all histories.

**Correction to the original explanation:** Ordinary navigation does not need all historical sessions. The experiment retained more information than navigation needs and still observed every retained session. Sharing that result did not make the operation sufficiently selective.

The code calls these groupings **modes**; `plan` can be a mode ID. This does not assume a separate plan document is a mode.

### What history contains

`ModeSessionHistory` in `src/model/session/types.ts` contains:

```ts
{
  sessions: AgentSession[];
  activeSessionId?: string;
}
```

Each entry is a metadata record containing session/task identity, provider conversation identity, preset, working directory, tmux identity, timestamps, and output/bootstrap paths. It is not merely an ID. It does not contain the conversation transcript or terminal contents. Persisted metadata must not be confused with a runtime observation; the exact pane/status distinction is a separate question below.

| Operation | Actual work |
|---|---|
| Read history | Read, parse, and validate the task's complete session `state.json`, including its modes' histories |
| Select one mode's history | Select records from that already-parsed state |
| Observe a session | Resolve its record and obtain current runtime state |
| Attach a terminal | Connect to a particular live session's terminal |

Returning only the active record would not, by itself, reduce bytes read from the current whole-file format. Avoiding observation of every historical session is a separate saving.

The experiment reads histories, observes all retained sessions, and rereads histories afterward. Observation also resolves each record through a stored-state read. The later history read preserves ordering around potentially stateful observation; it is a consistency precaution, not a simplification or an atomic snapshot guarantee.

### What navigation needs

Ordinary presentation needs the active session's record and observation, not every historical session. An ID alone is insufficient for presentation or attachment. Active means the selected conversation, which may be stopped.

Other consumers have different needs:
- The session picker needs retained alternatives when opened.
- Shutdown discovery and running-session limits must account for executions beyond the active conversation.

**Verdict:** Retaining necessary information is useful. Retaining and observing all histories for navigation was not proven necessary. The owner's active-only requirement is not implemented in this candidate.

### Follow-up: are saved pane IDs and status repeatedly revalidated?

**Owner question:** Are pane IDs and status saved unnecessarily for every historical session, then revalidated on each task selection?

**Source clarification:** Partly regarding repeated work, but not regarding the stored fields. `paneId`, live status, and runtime snapshots are not allowed fields in persisted session records (`src/storage/session-store.ts:251–284`).

| Information | Location |
|---|---|
| Session/task identity, preset, provider identity, working directory, timestamps, tmux session name, output/bootstrap paths, and other allowed metadata | Persisted session records |
| Active session ID for each mode | Persisted alongside the records |
| Pane ID | Runtime terminal attachment, resolved from tmux |
| Running/parked/stopped/unknown state | In-memory `SessionSnapshot`, derived from execution events or observation |
| Activity evidence | Runtime evidence, including an ephemeral activity-status file |

In current main, a changed selection is persisted and its notification schedules a full workspace refresh. That can repeat:

1. Whole session-state file reading, parsing, and validation of fields, duplicate IDs, and active-session references. This is structural validation, not a liveness check.
2. Stored-state reads to resolve individual retained session records for inventory observation.
3. Obtaining runtime state: already-owned sessions return their in-memory view; other retained sessions invoke runtime observation.
4. Additional inventory/history reads because presentation and monitoring obtain inventory separately.

Unchanged selections are ignored and refresh requests are coalesced, so this is not necessarily one full refresh per keypress.

Runtime observation is not revalidating saved live status: there is no such saved status in the history. It can check whether a tmux pane exists, whether it is dead, and whether it belongs to the expected project/task/session. These ownership checks protect against interacting with the wrong execution (`src/runtime/session-process.ts:440–496`). A persisted tmux name locates an execution; it does not prove liveness.

**Conclusion:** The redundant coupling is ordinary navigation triggering broad rereading, repeated schema validation, and project-wide observation. This does not establish that every metadata field or live ownership check is unnecessary. Validation belongs at storage-read boundaries; safety checks remain important before interacting with executions. Neither requires reloading all retained sessions merely to browse an already-loaded task.

The rejected scratch candidate instead uses loaded data for selection and targeted observation when needed for an unattached selected live session. This behavior is not in main. No per-keypress runtime cost was measured.

### Owner response

<!-- Add your response here. -->

## 2. Delete the `listAllSessions` wrapper

| Code | Added | Deleted | Net |
|---|---:|---:|---:|
| Production | 0 | 9 | −9 |
| Tests | 1 | 8 | −7 |

**Owner feedback already received:** Good change.

**Before:** `WorkspaceState.listAllSessions` called the richer inventory operation, stripped information, and returned another representation.

**After:** Consumers use inventory directly; the wrapper and obsolete test doubles are removed.

**Complexity removed:** A forwarding API and information-losing transformation. The test count includes a replacement fixture expression, hence one added line despite overall removal.

**Verdict:** Genuine simplification. The active-only requirement affects inventory contents, not the value of deleting this wrapper.

### Owner response

<!-- Add your response here. -->

## 3. Stop independently observing the same sessions for presentation

| Code | Added | Deleted | Net |
|---|---:|---:|---:|
| Production | 42 | 72 | −30 |
| Tests | 1 | 2 | −1 |

**Before:** Presentation obtained inventory, the monitor independently obtained inventory, and asynchronous workers reread mode histories for rows.

**After:** The monitor accepts loaded observations; presentation uses retained information; a synchronous loop replaces asynchronous row workers.

**Complexity removed:** Duplicate observation, history rereads, and concurrency machinery serving those reads. Selecting a loaded task no longer needs another project-wide inspection through this path.

**Qualification from §1:** Sharing an overbroad inventory is better than independently loading it twice, but does not satisfy active-only presentation loading. Background liveness checks still exist.

**Verdict:** Genuine reduction, with the remaining inventory still overbroad for the owner's requirement.

### Owner response

<!-- Add your response here. -->

## 4. Retain task-detail inputs instead of reloading them

| Code | Added | Deleted | Net |
|---|---:|---:|---:|
| Production | 10 | 5 | +5 |
| Tests | 2 | 0 | +2 |

**Before:** Calculating selected-task details loaded the dependency corpus and discarded it afterward.

**After:** Retain that corpus and reuse the existing `toTaskDetail` calculation. Visible tasks alone are insufficient: readiness can depend on completed/hidden dependencies and ambiguous identities.

**Complexity removed:** Selection-triggered dependency loading, without introducing precomputed detail objects for every task. The two test lines are dependency-specific assertions; their surrounding navigation test is counted in §6.

**Verdict:** Sufficient loaded inputs are necessary for read-free detail projection; their controller storage is a choice. This removes I/O, not computation. Constant-time navigation and large-project performance were not established.

### Owner response

<!-- Add your response here. -->

## 5. Separate loading data from displaying current selection

| Code | Added | Deleted | Net |
|---|---:|---:|---:|
| Production | 77 | 45 | +32 |
| Tests | 0 | 0 | 0 |

**Before:** `#loadSnapshot` mixed reads, controller mutation, selection resolution, inventory acceptance, and presentation construction.

**After:** `#loadInputs` returns data; refresh checks and accepts it; one synchronous `#publish` derives presentation using current selection.

**Complexity removed:** Selection no longer travels through asynchronous loading. A refresh supplies data rather than restoring a captured old selection.

**Added structure:** Explicit loading, acceptance, and publication boundaries. Moved snapshot assembly contributes additions and deletions in the diff.

**Verdict:** The separation addresses the central coupling; the +32-line implementation was not proven minimal. Other sections' tests exercise it. Removing the rejected intermediate cached-options fast path is not credited as a baseline improvement.

### Owner response

<!-- Add your response here. -->

## 6. Display selection before saving it

| Code | Added | Deleted | Net |
|---|---:|---:|---:|
| Production | 29 | 17 | +12 |
| Tests | 46 | 0 | +46 |

**Before:** Select → save → notification → reload → display.

**After:** Select → publish from loaded data → save.

Notifications publish rather than unconditionally load. Pending local writes prevent an older saved choice from replacing current local selection, without suppressing unrelated presentation updates.

**Complexity removed:** Persistence and its notification cease being an indirect route through loading. Selection changes presentation, not necessarily task data.

**Evidence:** The attributed test independently blocks refresh and persistence and checks coherent selection.

**Verdict:** The distinction is necessary for immediate navigation. The pending-write implementation and test size were not proven minimal.

### Owner response

<!-- Add your response here. -->

## 7. Stop terminal presentation events from reloading the project

| Code | Added | Deleted | Net |
|---|---:|---:|---:|
| Production | 10 | 3 | +7 |
| Tests | 26 | 0 | +26 |

**Before:** Attachment completion, first output, and attachment errors could invoke the refresh operation used for lifecycle changes.

**After:** Presentation-only events publish; actual lifecycle changes retain refresh.

**Complexity removed:** Hidden reloads caused by terminal presentation updates. Otherwise an immediately selected task could trigger another project reload when its terminal attaches.

**Evidence:** The parked-attachment test checks no navigation-triggered reload or lifecycle effects. It also exercises §8 but is counted only here.

**Verdict:** Necessary to eliminate this additional reload path. The callback exposes a real distinction but adds code rather than deleting it.

### Owner response

<!-- Add your response here. -->

## 8. Prevent late observations from overwriting newer state

| Code | Added | Deleted | Net |
|---|---:|---:|---:|
| Production | 21 | 9 | +12 |
| Tests | 97 | 0 | +97 |

**Changes:** Capture selection/inventory identity before observation; discard stale results; permit running/parked attachment; update monitor observations without project reload; publish stopped/error results without automatic resume or retry loops; preserve selection-safe delayed focus.

**Why needed:** Immediate publication does not remove asynchronous observation. Old results must not overwrite newer inventory or affect another selection.

**Complexity removed:** The old observation-result arrangement that could lead back to rereading presentation inputs.

**Added or preserved obligations:** Explicit stale-result checks and a narrow in-memory snapshot update. Tests cover superseded, stopped, and failed observations.

**Verdict:** Primarily correctness and safety preservation, not independent simplification. These obligations remain with active-only navigation inventory.

### Owner response

<!-- Add your response here. -->

## 9. Fix status, board, and save-error behavior

| Code | Added | Deleted | Net |
|---|---:|---:|---:|
| Production | 9 | 7 | +2 |
| Tests | 68 | 0 | +68 |

- **Selected task determines status:** The immediate publisher initially rejected B against A's old saved status. Valid selection now wins; saved status is fallback. This repairs the experiment.
- **Board session semantics:** An intermediate version paired one mode's session with another remembered-mode label. Restoring prior semantics repairs the experiment and preserves behavior.
- **Save-error publication:** A failed save previously loaded project inputs just to show a notice. Publishing preserves local selection without loading. This is a genuine small simplification and failure-path correction.

Tests cover workspace/board cross-status selection and failed selection persistence.

**Verdict:** Needed for candidate correctness, but not all independent simplification opportunities in the original code.

### Owner response

<!-- Add your response here. -->

## 10. Add tests that expose the actual races

| Code | Added | Deleted | Net |
|---|---:|---:|---:|
| Production | 0 | 0 | 0 |
| Tests | 145 | 30 | +115 |

This counts shared fixture infrastructure only. Scenario-specific tests are counted above.

**Before:** Notifications did nothing, histories were shared across tasks, and refresh/persistence could not be delayed independently.

**After:** Distinct records, real fixture notifications, independent gates, read counters, board callbacks, observation outcomes, and save failures become observable.

**Why needed:** A fixture hiding these behaviors can let an incorrect implementation pass.

**Verdict:** Faithful evidence was necessary. This particular set of options, mocks, gates, flags, and +115 net lines was not proven necessary or minimal.

### Owner response

<!-- Add your response here. -->

## Reconciled totals

| Section | Production net | Test net | Combined net |
|---|---:|---:|---:|
| 1. Retain session information | +3 | 0 | +3 |
| 2. Remove wrapper | −9 | −7 | −16 |
| 3. Shared observations / synchronous projection | −30 | −1 | −31 |
| 4. Reuse dependency corpus | +5 | +2 | +7 |
| 5. Separate loading/publication | +32 | 0 | +32 |
| 6. Selection before persistence | +12 | +46 | +58 |
| 7. Terminal publication versus refresh | +7 | +26 | +33 |
| 8. Observation safety | +12 | +97 | +109 |
| 9. Status, board, save failure | +2 | +68 | +70 |
| 10. Shared test infrastructure | 0 | +115 | +115 |
| **Net total** | **+34** | **+346** | **+380** |
| **Added / deleted** | **202 / 168** | **386 / 40** | **588 / 208** |

These are measured final-diff counts with explicit attribution, not estimates of independent implementation cost. Additions are 73.9% of combined churn. Main independently ran 29 lifecycle tests successfully; that does not establish minimality, complete correctness, live-terminal behavior, or compliance with the deletion gate.

## Overall owner response

<!-- Add cross-cutting feedback or review conclusions here. -->
