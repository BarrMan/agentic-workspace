# Normalization and Regex Audit

Status: supporting evidence, not a contract. This report maps current implementation
behavior; it does not authorize deleting behavior described as required by
`docs/SPEC.md`, `docs/BLUEPRINT.md`, or an ADR.

Date: 2026-10-19

## Scope and method

- Production TypeScript only: `src/**/*.ts`.
- Excluded: `src/test/**`, colocated `*.test.ts` / `*.spec.ts`, `dist/`, `node_modules/`, `.omp/`.
- Normalization functions were found by both name and behavior, then their direct
  callers were checked in source.
- Regexes were extracted from the TypeScript AST (ast-grep), not by text search.
  Literals and `new RegExp(...)` are both included.
- The annotated sections below map purpose, callers, and simplification signals.
  Appendices A and B are mechanically generated completeness lists.
- Caller lists include imports; verify a caller before deleting or merging a function.

## Inventory summary

- Normalization: 81 named functions match canonicalization, sanitization, deduplication,
  comparison-key, or configured-value resolution semantics. The annotated sections also
  cover behavior-identified wrappers outside that name set.
- Regexes: 159 production sites, 108 distinct patterns, in 59 files
  (154 literals + 5 dynamic `new RegExp`). 61 regex literals in test files were excluded.

**Oracle correction:** the oracle reviewed this report and corrected several annotations.
Read the Oracle assessment before acting on any apparent simplification candidate, especially
task-ID/path wrappers and Appendix A caller lists. Implementation decisions and the reasons
remaining candidates were left unchanged are recorded in
[normalization-refactor-decisions.md](normalization-refactor-decisions.md).

- Strongest reported clusters: duplicated path/branch normalizers, repeated configured-value
  wrappers, task-ID normalization chains, whitespace/session-ID/pane-ID regex duplicates,
  and string checks that can use `startsWith` / `includes` / `split`.

## Normalization — model, lib, storage, filesystem, controller

Summary: Inventory includes canonicalizers and resolution wrappers in the requested production scopes. Caller chains are indicated where directly established; transformations are concise behavioral descriptions.

| Function (file:line; signature) | Transformation / input → output | Verified callers / repeated chain | Purpose; classification |
|---|---|---|---|
| `normalizeStringList` (`src/lib/string-list.ts:3`; `(values: string[]\|undefined): string[]\|undefined`) | trims stringified entries, removes blanks and exact duplicates; absent/empty → undefined | `parseDelimitedStringList:21`; task update `collections.ts:19,38,58,65,78`; creation `task-creation-input.ts:40-45` | shared list cleanup; canonical |
| `parseDelimitedStringList` (`src/lib/string-list.ts:15`; `(value: unknown): string[]\|undefined`) | stringifies scalar/list, splits commas, trims, delegates dedupe | `parseClearableStringList:27`; creation input | delimiter adapter; thin wrapper → normalizeStringList |
| `parseClearableStringList` (`src/lib/string-list.ts:24`; `(value: unknown): string[]\|undefined`) | preserves undefined/null/empty-array as undefined; nonempty parsed-empty becomes [] | callers not verified | clear semantics; thin wrapper |
| `comparisonKey` (`src/lib/comparison-key.ts:1`; signature) | trim + lowercase; text → case-insensitive key | config values and assignee/label keys | shared equality key; canonical |
| `slug` (`src/lib/slug.ts:1`; signature) | lowercase and punctuation/space conversion to slug | callers not verified | slug identity; canonical |
| `normalizeStarted` (`src/lib/process-tree.ts:70`; `(started:string):string`) | trim and collapse whitespace | same module: `sameProcess` 72, ancestry/index comparisons 92-143, 265, 408 | stable process identity; canonical |
| `normalizePriorityValue` (`src/model/task/priority-config.ts:14`; `(value:string\|null\|undefined):string\|undefined`) | string coercion, trim/lowercase, blank→undefined | resolve/format/rank in same module lines 35,62,74,92 | comparison key; canonical |
| `resolvePriorityValue` (`priority-config.ts:58`) | normalized input resolves configured spelling/value; invalid→undefined | `task-mutation-service.ts:189` | configured value ownership; canonical |
| `normalizeConfiguredValues` (`config-values.ts:3`) | removes blank and comparison-key duplicates retaining first spelling | project/type config getters; callers by those getters | configuration list canonicalization |
| `resolveConfiguredValue` (`config-values.ts:20`) | case/trim-insensitive match returns configured spelling | `resolveConfiguredValues:37`; project/type/priority resolvers | preserve canonical configured spelling |
| `resolveConfiguredValues` (`config-values.ts:28`) | resolves each input and removes duplicate keys | project/type resolvers | multi-value wrapper; thin wrapper |
| `getProjectValues` (`project-config.ts:16`) | returns normalized configured project list | project resolvers | configuration adapter; thin wrapper |
| `resolveProjectValue(s)` (`project-config.ts:23,30`) | configured spelling resolution (singular/list) | task mutation service indirect | domain wrappers; thin wrappers |
| `getTaskTypeValues` (`task-type-config.ts:12`) | normalized type options | type resolvers | configuration adapter; thin wrapper |
| `resolveTaskTypeValue(s)` (`task-type-config.ts:21,28`) | configured spelling resolution | task mutation service indirect | domain wrappers; thin wrappers |
| `statusComparisonKey` (`status.ts:10`) | trim/lowercase status key | status comparisons | canonical equality key |
| `statusLookupKey` (`status.ts:18`) | status lookup key transformation | status lookup sites | lookup adapter; overlapping duplicate |
| `resolveInProgressStatus` (`status.ts:27`) | chooses canonical configured active status/fallback | `controller/workspace-state.ts:109` | centralized status selection |
| `normalizeAssignees` (`assignee-filter.ts:5`) | trims, filters blanks, deduplicates by comparison key while retaining spelling | collections, creation, config schema | canonical list |
| `assigneeComparisonKey` (`assignee-filter.ts:1`) | trim/lowercase key | normalizeAssignees and filters | canonical key |
| `labelComparisonKey` (`label-filter.ts:4`) | normalized comparison key | collect labels and comparisons | canonical key |
| `normalizeDueDate` (`due-date.ts:36`) | canonicalizes accepted date input or undefined/errors | task scalar update and creation, milestones | date contract canonicalizer |
| `canonicalTaskIdSegments` (`task-id.ts:29`) | canonical numeric segments | task ID key and prefix logic | canonical ID components |
| `canonicalTaskIdKey` (`task-id.ts:34`) | trim/lowercase ID, canonicalize segments | task ID key | canonical ID |
| `taskIdKey` (`task-id.ts:59`) | delegates canonical ID key | storage and identity code | thin wrapper; repeated ID normalization |
| `normalizeTaskLifecyclePath` (`task-identity-index.ts:69`) | path slash/relative-root normalization to lifecycle-relative path | task loader line 147; identity index | canonical logical path |
| `normalizeRecordPath` (`task-identity-index.ts:79`) | dispatch path through lifecycle normalization | index construction and fingerprint | thin wrapper; repeated path normalization |
| `sanitizeLockKey` (`storage/file-system.ts:105`) | lowercase and unsafe-character replacement | lock acquisition lines 476,558 | filesystem-safe lock key; canonical |
| `normalizeProjectAgenticWorkspaceDirectory` (`filesystem/paths/agentic-workspace-directory.ts:210`) | slash-normalizes, trims separators/dot, rejects invalid path | storage constructor/config and controller init | canonical relative path |
| `normalizeGitPath` (`filesystem/git/operations.ts:666`) | git path separator/representation canonicalization | operations lines 622,661 | canonical git path |
| `normalizeFilePaths` (`operations.ts:139`) | canonicalizes and deduplicates paths | caller line 127 | thin wrapper; filesystem path list |
| `normalizeRemoteBranch` (`controller/task-loader.ts:213`) | trims/parses remote prefix and rejects invalid/default origin cases | caller line 249 | branch identity canonicalization |
| `normalizeLocalBranch` (`task-loader.ts:227`) | trims and filters current/invalid local branch | caller line 253 | branch identity canonicalization |
| `normalizeTargetMilestone` (`controller/agentic-workspace.ts:111`) | trims target, blank→undefined | reorder planner lines 742,797 | thin wrapper; milestone input |
| `normalizeAliases` (`storage/config-schema.ts:89`) | copies legacy aliases into canonical keys only when absent | schema preprocess line 107 | migration adapter; thin wrapper |
| `canonicalTask` (`storage/watchers/task-watcher.ts:82`) | builds canonical watcher presentation task | caller line 161 | task projection; canonical |
| `normalizeStatusSet` (`model/task/task-search.ts:188`) | canonical status set from scalar/list | search filter | filter adapter |
| `normalizeModifiedFileFilters` (`task-search.ts:197`) | trims/canonicalizes file filters and deduplicates | search filter | filter adapter |
| `sanitizeLockKey` plus `canonicalTaskIdKey` | ID → canonical ID → safe lock key | storage lines 476,558 | repeated normalization chain |

## Normalization — runtime, renderer, CLI boundary

Covers the CLI filter boundary, renderer filter normalization, and selected runtime helpers. The remainder section and Appendix A complete the inventory.

| Function | Details |
|---|---|
| `normalizeCliStatusList` (`src/cli/features/tasks/filter-normalizers.ts:12`) | `(core, values, optionName) → Promise<string[]\|null>` resolves statuses case/space-insensitively to configured spelling, deduplicates; invalid inputs report error and return null. Canonical CLI boundary; called via CLI list/search dependency injection. |
| `normalizeCliPriority` (`.../filter-normalizers.ts:26`) | `(core,value) → Promise<string\|null>` resolves configured priority alias/value; invalid reports/returns null. Canonical CLI boundary; registered for list/search. |
| `normalizeCliTaskTypes` (`.../filter-normalizers.ts:35`) | `(core,values,optionName)` resolves configured type values and rejects invalids; canonical CLI boundary. |
| `normalizeCliProjects` (`.../filter-normalizers.ts:48`) | `(core,values,optionName)` resolves configured projects; rejects absent config/invalids; canonical CLI boundary. |
| `normalizeValues` (`src/renderer/opentui/filters.ts:123`) | `(readonly string[]\|undefined) → string[]`; trims, removes empty and exact duplicates preserving first spelling/order. Renderer canonicalizer. |
| `normalizeLabelValues` (`.../filters.ts:135`) | Trims, drops empty, deduplicates by label comparison key while retaining first display spelling. Renderer label canonicalizer. |
| `normalizeFilters` (`.../filters.ts:148`) | Partial filter → complete state; trims scalar search/priority/milestone and delegates arrays above. Calls normalization again at editor boundaries (chain). |
| `assigneeComparisonKey` (`src/model/task/assignee-filter.ts:1`) | String → trimmed, strips leading @, collapses whitespace, lowercases; comparison key. |
| `normalizeAssignees` (`.../assignee-filter.ts:5`) | Optional list → trimmed display values, deduped by comparison key, preserving first; canonical list. |
| `formatAssignee` (`.../assignee-filter.ts:19`) | String → trimmed optional @-prefixed value or null; presentation normalization. |
| `statusComparisonKey` (`src/model/task/status.ts:10`) | Nullable status → shared trim/lowercase key; thin wrapper over `comparisonKey`. |
| `statusLookupKey` (`.../status.ts:18`) | Comparison key with all whitespace removed; canonical lookup key, intentionally distinct semantics. |
| `getCanonicalStatus` (`.../status.ts:54`) | Input → configured status spelling or null via lookup key; canonical resolver. |
| `getCanonicalStatuses` (`.../status.ts:69`) | Inputs → canonical valid values plus invalids; dedupes configured statuses by lookup key and inputs by comparison key. |
| `normalizePriorityValue` (`src/model/task/priority-config.ts:14`) | nullable string → trimmed lowercase or undefined; canonical priority key; used by resolver/config paths. |
| `sanitizeProfilePreset` (`src/runtime/agents/profile.ts:93`) | Agent preset → removes provider auto-approval flags; reconstructs quoted command only if changed. Security canonicalizer, called by provider adapters and launch flow (may repeat). |
| `canonicalModelId` (`.../profile.ts:74`) | Model ID → trimmed en-US lowercase key; thin private key function used by deduplication. |
| `deduplicateModels` (`.../profile.ts:78`) | Model array → drops blank IDs, merges case-insensitive IDs, chooses name, sorts by canonical ID; canonical catalog normalizer. |
| `normalizeProjectAgenticWorkspaceDirectory` (`src/filesystem/paths/agentic-workspace-directory.ts:210`) | nullable path → trimmed slash-normalized path without trailing slash; empty/dot becomes null. Canonical path helper. |



## Normalization — remainder

24 normalization functions audited by reading each implementation and its direct callers only. Result: **14 canonical**, **5 thin wrappers**, **4 overlapping duplicates**, **1 possibly unnecessary**. No repository source or docs were modified.

Notable overlaps: `findCanonicalStatus` reimplements the sync lookup loop of `getCanonicalStatus` (`src/model/task/status.ts:58`); `resolveProjectValues` and `resolveTaskTypeValues` are parallel wrappers over `resolveConfiguredValues` (domain-specific, not merged); the three `sanitizeLaunchPreset` method bodies for opencode-v1/claude/opencode-v2 are identical wrappers, while `pi` is an identity method required by the interface.

| # | Name | Location | Transformation (input → output) | Verified direct callers (file:line, containing function) | Purpose | Classification |
|---|------|----------|----------------------------------|--------------------------------------------------------|---------|----------------|
| 1 | `sanitizeClearableStringArray` | `src/cli/task-edit-builder.ts:9` | `string[] \| undefined` → `undefined` unchanged; otherwise trimmed, non-blank, de-duped values. Blank-only non-empty input → `undefined`; explicit `[]` → `[]`; non-empty result → values. | `task-edit-builder.ts:48` in `assignSanitizedList` | Distinguishes "no change" from an explicit clear for task-edit list flags. | canonical |
| 2 | `assignSanitizedList` | `src/cli/task-edit-builder.ts:30` | `(updateInput, field, values, clearable)` → mutates `updateInput[field]` with the sanitized list when truthy; otherwise leaves it absent. Uses `sanitizeClearableStringArray` when clearable, else `normalizeStringList`. | `task-edit-builder.ts:57-70` in `assignTaskLists` (10 call sites) | Applies the shared list policy to each task-edit list field. | thin wrapper |
| 3 | `normalizeTimezoneOffset` | `src/lib/utc-date-display.ts:21` | `"+0530"` → `"+05:30"`; `"z"` → `"Z"`; `"+05:30"`, `"-0400"` already-colonized forms pass through; all other offsets unchanged. | `utc-date-display.ts:37` in `formatExplicitTimezoneDateTime` | Produces an offset form accepted by `Date` parsing. | canonical |
| 4 | `normalizeUtcDateDisplay` | `src/lib/utc-date-display.ts:48` | Explicit-offset datetime → UTC `"yyyy-mm-dd hh:mm"`; timezone-less `"yyyy-mm-dd[T ]hh:mm[:ss]"` → `"yyyy-mm-dd hh:mm"`; date-only and arbitrary strings pass through unchanged. | `utc-date-display.ts:126` in `formatUtcDateForDisplay` | Canonical display form for stored UTC values. | canonical |
| 5 | `applyDateFormat` | `src/lib/utc-date-display.ts:81` | Canonical regex match + format string → arranged text, or `null` for invalid format. Date-only canonical values render date part only; timed values append canonical time when format has no time tokens. | `utc-date-display.ts:130` in `formatUtcDateForDisplay` | Display-only custom date formatting without changing storage. | canonical |
| 6 | `findCanonicalStatus` | `src/cli/features/tasks/wizard.ts:72` | Input string → first configured status whose `statusLookupKey` (case/whitespace-insensitive) matches, preserving configured casing; no match/blank → `null`. | `wizard.ts:92` `getDefaultCreateStatus`; `wizard.ts:131` `buildStatusPromptValues`; `wizard.ts:487` `normalizeWizardValues` | Resolve wizard-entered status to a configured label. | overlapping duplicate (of `getCanonicalStatus` lookup loop, `src/model/task/status.ts:58`) |
| 7 | `normalizeWizardValues` | `src/cli/features/tasks/wizard.ts:479` | Wizard values → copied values with trimmed title; status canonicalized or trimmed or `""`; priority normalized or `""`; type/project resolved against config or trimmed; due date normalized or `""`. | `wizard.ts:374` in `runTaskWizardValues` | Final cleanup of wizard answers into task-input values. | canonical |
| 8 | `addNormalizedListFilter` | `src/cli/features/tasks/list-parse.ts:70` | Option value → parsed comma list; empty list → no assignment, `true`; normalized list assigned to filter field and `true`; normalizer `null` → `false`. | `list-parse.ts:34`, `:52`, `:53` in `parseTaskListFilters` | Shared parse/normalize/assign path for list-valued CLI filters. | thin wrapper |
| 9 | `canonicalDirectoryTarget` | `src/runtime/sessions.ts:149` | Directory path → absolute path rebuilt from the nearest existing canonical ancestor plus missing suffix. Throws for symlink/redirected or non-directory ancestors and when no parent is reachable. | `sessions.ts:362` in `purgeTaskSessions`; `sessions.ts:409-412` in `forgetTaskSessions` | Security-sensitive canonicalization that refuses symlinked future paths. | canonical |
| 10 | `resolveProjectValues` | `src/model/task/project-config.ts:30` | Input labels + config → `{ values: canonical project labels, invalid: unmatched inputs }`; duplicates removed by comparison key. | `src/renderer/opentui/board/models/filter.ts:87` in `normalizeBoardFilters`; `src/cli/features/tasks/filter-normalizers.ts:55` in `normalizeCliProjects` | Canonicalize configured project filters. | thin wrapper over `resolveConfiguredValues` |
| 11 | `resolveTaskTypeValues` | `src/model/task/task-type-config.ts:28` | Input labels + config → `{ values: canonical type labels, invalid: unmatched inputs }`; falls back to `DEFAULT_TASK_TYPES` when no types configured. | `filter.ts:86` in `normalizeBoardFilters`; `filter-normalizers.ts:41` in `normalizeCliTaskTypes` | Canonicalize configured task-type filters. | thin wrapper over `resolveConfiguredValues` |
| 12 | `canonicalViewLock` | `src/storage/view-state-store.ts:69` | Project root → canonical lock path when the nearest existing ancestor is a writable directory; `undefined` when the root itself is unwritable and no canonical lock exists; throws when a canonical namespace exists but is unusable or bypassed. | `view-state-store.ts:250` in `ViewStateStoreImpl.withLock` | Prevents view-state locking through redirected/read-only paths. | canonical |
| 13 | `resolveConfigValue` | `src/controller/init-helpers.ts:79` | `(override, existing, fallback)` → first defined value: `override ?? existing ?? fallback`. | `init-helpers.ts:106`, `:111`, `:116`, `:121`, `:126`, `:127` in `resolveInitializationConfig` | Initialization precedence for config fields. | thin wrapper (three-way nullish coalescing) |
| 14 | `sanitizeLaunchEnvironment` | `src/runtime/session-launch.ts:95` | Env record → shallow copy with `FORBIDDEN_ENV` names deleted (`AGENTIC_WORKSPACE_CWD`, `AGENTIC_WORKSPACE_TASK_ID`, `AGENTIC_WORKSPACE_SESSION_ID`, `AGENTIC_WORKSPACE_PROJECT_ROOT`, `TASK_ID`, `SESSION_ID`). | `session-launch.ts:110` in `launchEnvironment`; `:232` in `prepareAgentLaunchResources`; `:317` in `prepareAgentAsk` | Prevents stale workspace identity from leaking into launched sessions. | canonical |
| 15 | `keyFromCanonical` | `src/renderer/opentui/keybindings.ts:46` | Canonical chord text (e.g. `"C-S-M-x"`, `"A-Up"`, `"Enter"`) → `ShortcutKey` with lowercase key and `ctrl`/`shift`/`meta` flags; uppercase single character implies shift. | `keybindings.ts:81` in `canonicalShortcut` | Convert declarative keymap strings into dispatch keys. | canonical |
| 16 | `canonicalShortcut` | `src/renderer/opentui/keybindings.ts:72` | Descriptor id + bindings → `ShortcutDescriptor` whose `keys` are canonicalized via `keyFromCanonical` and de-duplicated by key+modifier signature; `label` joined from keymaps. | `keybindings.ts:96-114` (`sharedShortcuts`) and `:121+` (`shortcutsConfig`) — definitions across same file | Single descriptor factory so help and dispatch share one source of truth. | canonical |
| 17 | `normalizedKey` | `src/renderer/opentui/keybindings.ts:311` | `ShortcutKey` → same key lowercased; uppercase single character → lowercase + `shift: true`; `return` → `enter`; `" "` → `space`; `"{"` → `"["` + shift. | `keybindings.ts:321-322` in `sameKey`; `:402` in `shortcutKeyFromEvent` | Reconciles terminal alias names before comparison/dispatch. | canonical |
| 18 | `normalizeConfiguredStatuses` | `src/renderer/opentui/board/policies/column-policy.ts:5` | Status array → `{ ordered: trimmed non-blank first-seen statuses de-duped by case/space-insensitive key, canonicalByKey: key→first display casing }`. | `column-policy.ts:28` in `buildKanbanStatusGroups` | Stable, canonical board column order. | canonical |
| 19 | `normalizeBoardFilters` | `src/renderer/opentui/board/models/filter.ts:78` | Partial board filters → complete normalized filter object: empty-string defaults, copied arrays, canonicalized types/projects, default `labelMatch: "any"`, optional limit preserved. | `filter.ts:20` in `Filter` constructor; `:34` in `Filter.update` | One normalization boundary for board filter state. | canonical |
| 20 | `normalizePublicDate` | `src/renderer/formatters/json-output.ts:80` | Date-only string unchanged; naive `"yyyy-mm-dd[ T]hh:mm[:ss][.f]Z?"` → `"yyyy-mm-ddThh:mm:ssZ"` (seconds default `00`, fraction dropped); other parseable values → ISO UTC without milliseconds; invalid → original. | `json-output.ts:110-112` in `toTaskSummaryJson` | Stable public JSON timestamp shape. | canonical |
| 21 | `sanitizeLaunchPreset` (OpencodeV1Agent) | `src/runtime/agents/opencode-v1.ts:76` | `AgentPreset` → `sanitizeProfilePreset(preset)`: strips `--auto`/`--auto=` flags from the command; other preset fields unchanged. | `src/runtime/session-launch.ts:133` in `preflightAgentLaunch` via `Agent` interface; test double `session-launch.test.ts:43` | Removes adapter auto-approval so the workspace profile controls permissions. | overlapping duplicate (same body as claude/opencode-v2) |
| 22 | `sanitizeLaunchPreset` (ClaudeAgent) | `src/runtime/agents/claude.ts:98` | `AgentPreset` → `sanitizeProfilePreset(preset)`: strips `--dangerously-skip-permissions`, `--allow-dangerously-skip-permissions`, and accepting `--permission-mode` variants; other fields unchanged. | `session-launch.ts:133` in `preflightAgentLaunch` via `Agent` interface | Same policy boundary for Claude-specific approval flags. | overlapping duplicate (same body as opencode-v1/opencode-v2) |
| 23 | `sanitizeLaunchPreset` (PiAgent) | `src/runtime/agents/pi.ts:88` | `AgentPreset` → identical `AgentPreset` (identity). | `session-launch.ts:133` in `preflightAgentLaunch` via `Agent` interface | Satisfies the optional-interface hook where Pi has no flags to strip. | possibly unnecessary (identity; interface-required) |
| 24 | `sanitizeLaunchPreset` (OpencodeV2Agent) | `src/runtime/agents/opencode-v2.ts:139` | `AgentPreset` → `sanitizeProfilePreset(preset)`: strips `--auto`/`--auto=` flags; other fields unchanged. | `session-launch.ts:133` in `preflightAgentLaunch` via `Agent` interface | Removes adapter auto-approval so the workspace profile controls permissions. | overlapping duplicate (same body as opencode-v1/claude) |

## Regexes — runtime and controller

**Summary.** 50 production regex sites across 16 files. 31 distinct literal patterns. Every site is listed below with the function that owns it, its direct caller(s), and a simplification signal.

Signal counts: **keep 16**, **duplicate 29**, **equivalent 5**, **over-broad 0** (none flagged; the broad chrome heuristics are deliberate screen matching).

Recurring duplication drove most of the count: `\s+` appears 4×, session/ID charset `^[A-Za-z0-9._-]+$` 4×, shell-metachar guard `[\|;&\n]` 3×, `^\.\/` 3×, idle-prompt matcher 3×, pane-id `^%\d+$`/`^%[0-9]+$` 3×, and several 2× pairs (`^refs/remotes/`, `^ses_…$`, `\r?\n`, lease sanitizer, `^\/+|\/+$`). The strongest cleanup candidates are the triplicated `appendArguments` guard, the duplicated path normalizers in `task-loader.ts`, and the repeated session-id/pane-id validations.

### `src/controller/task-creation-input.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 22 | `generatedTaskTitle` | `-(\d+(?:\.\d+)*)$` | Extract the numeric body of a task ID to build the default `untitled-<n>` title. | Task ID string (e.g. `task-12`, `task-1.2`). | `TaskCreationWorkflow.create` (`task-creation-workflow.ts:32`). | keep |

### `src/controller/task-loader.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 84 | `getTaskRecordId` | `^\.\/` | Strip a leading `./` from the configured workspace dir before building the record root. | Configured `agenticWorkspaceDir`. | `loadCommitIndex` (`task-loader.ts:591`). | duplicate (same normalizer at 142/146) |
| 85 | `getTaskRecordId` | `^\/+\|\/+$` | Trim leading/trailing slashes from the workspace dir. | Same workspace dir. | `loadCommitIndex` (`:591`). | duplicate (same normalizer at 143) |
| 142 | `logicalTaskPath` | `^\.\/` | Normalize the workspace dir for the logical-path marker. | `agenticWorkspaceDir`. | `chooseIdentityHydrationCandidates` (`:181`, `:186`). | duplicate |
| 143 | `logicalTaskPath` | `^\/+\|\/+$` | Trim edge slashes from the workspace dir. | `agenticWorkspaceDir`. | `chooseIdentityHydrationCandidates` (`:181`, `:186`). | duplicate |
| 146 | `logicalTaskPath` | `^\.\/` | Fallback strip of leading `./` from a task file path when the marker is absent. | Task file path. | `chooseIdentityHydrationCandidates` (`:181`, `:186`). | duplicate |
| 216 | `normalizeRemoteBranch` | `^refs\/remotes\/` | Remove a `refs/remotes/` prefix before deriving the display branch. | Branch name from git tips. | `pinnedBranchRef` (`:249`) ← `getPinnedBranchRefs` (`:505`) ← `load`. | equivalent to `startsWith` + `slice` (and duplicated at 242) |
| 242 | `isRemoteBranch` | `^refs\/remotes\/` | Recognize remote refs after trimming whitespace. | Branch name. | `pinnedBranchRef` (`:247`), `getPinnedBranchRefs` (`:499`). | duplicate (same test as 216; `startsWith` works) |
| 281 | `hydrateTasks` | `^origin\/` | Strip `origin/` from a ref when storing the hydrated task branch. | Remote ref (`w.ref`). | `load` (`:482`, `:483`). | equivalent to `startsWith` + `slice` |

### `src/runtime/agent-status-probe.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 87 | `createActivityProbe` (`readLiveMetadata`) | `\s+` | Split `#{pane_dead} #{window_activity}` into two fields. | Trimmed `display-message` stdout. | `readLiveMetadata` ← `metadata` ← the probe returned by `createActivityProbe`, consumed at `workspace-controller.ts:512`. | duplicate (shared whitespace split) |

### `src/runtime/agents/agent.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 171 | `appendArguments` | `[\|;&\n]` | Reject shell pipelines/compound commands in built-in agent presets. | Preset command string. | `claude.ts:121/135/139`, `pi.ts:112/126/130`, `session-launch.ts:137`; local copies in `opencode-v1.ts`/`opencode-v2.ts`. | duplicate (guard copied into v1/v2) |

### `src/runtime/agents/chrome-rules.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 5 | `<module>` (`INTERRUPT_RUNNING`) | `esc to interrupt\|ctrl\+c to interrupt\|esc to cancel` | Recognize an interrupt hint as "running". | Captured pane text matched by the activity probe. | Included in all three rule arrays; arrays consumed via `Agent.chromeRules` (`claude.ts:94`, `opencode-v1.ts:72`, `opencode-v2.ts:135`, `pi.ts:84`). | keep |
| 8 | `<module>` (`ERROR_CHROME`) | `(?:^\|\n)\s*(?:error\|api error\|fatal):` | Recognize error banners. | Captured pane text. | Included in all three rule arrays (same consumers). | keep |
| 13 | `<module>` (`CLAUDE_CHROME_RULES`) | `do you want to proceed\?\|❯\s*1\.\s*yes\|waiting for your (?:input\|approval)` | Recognize a Claude confirmation prompt as "waiting". | Captured pane text. | `CLAUDE_CHROME_RULES` at `claude.ts:94`. | keep |
| 15 | `<module>` (`CLAUDE_CHROME_RULES`) | `(?:^\|\n)\s*[>›]\s*$` | Recognize an idle input prompt. | Captured pane text. | `CLAUDE_CHROME_RULES` at `claude.ts:94`. | duplicate (same idle matcher at 22/29) |
| 20 | `<module>` (`OPENCODE_CHROME_RULES`) | `permission (?:required\|asked)\|allow this tool` | Recognize an OpenCode permission prompt as "waiting". | Captured pane text. | `OPENCODE_CHROME_RULES` at `opencode-v1.ts:72` and `opencode-v2.ts:135`. | keep |
| 22 | `<module>` (`OPENCODE_CHROME_RULES`) | `(?:^\|\n)\s*[>›]\s*$` | Recognize an idle input prompt. | Captured pane text. | `OPENCODE_CHROME_RULES` (same consumers). | duplicate |
| 29 | `<module>` (`PI_CHROME_RULES`) | `(?:^\|\n)\s*[>›]\s*$` | Recognize an idle input prompt. | Captured pane text. | `PI_CHROME_RULES` at `pi.ts:84`. | duplicate |

### `src/runtime/agents/hook-script.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 21 | `hookScript` | `^0 # ` | Strip the numeric-exit prefix from the ownership trailer before appending it after `exit `. | `STATUS_HOOK_OWNERSHIP_TRAILER` constant. | `hookScript` ← `buildHookCommand` (`status-hooks.ts:14/21`), installed by agents such as `claude.ts:33`. | equivalent to `startsWith` + `slice` |

### `src/runtime/agents/opencode-v1.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 25 | `appendArguments` | `[\|;&\n]` | Reject shell pipelines/compound commands. | Preset command string. | `launchCommand` (`:98`), `resumeCommand` (`:112`), `askCommand` (`:116`), preflight (`:329`). | duplicate (copy of `agent.ts:171`) |

### `src/runtime/agents/opencode-v2.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 24 | `appendArguments` | `[\|;&\n]` | Reject shell pipelines/compound commands. | Preset command string. | `launchCommand` (`:163`), `resumeCommand` (`:171`), `askCommand` (`:178`, `:182`). | duplicate (copy of `agent.ts:171`) |
| 101 | `lookupNativeSession` | `^ses_[A-Za-z0-9_-]+$` | Validate a native session ID before using it in an API path. | Restored native session ID. | `prepare` (`:246`, `:275`). | duplicate (same guard at 176) |
| 176 | `askCommand` | `^ses_[A-Za-z0-9_-]+$` | Validate the native session ID before building the ask command. | `nativeSessionId`. | `askCommand` callers via `Agent` interface (`session-launch.ts:310`). | duplicate |

### `src/runtime/agents/opencode-version.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 5 | `openCodeBootstrapForVersion` | `^opencode\s+` | Strip an optional `opencode ` prefix from `--version` output. | Version command output. | `opencode-resolution.ts:40`, `opencode-v1.ts:345`, `opencode-v2.ts:90`. | keep |
| 6 | `openCodeBootstrapForVersion` | `\s` | Reject multi-token output so only a bare version is parsed. | Stripped version string. | Same three callers. | keep |

### `src/runtime/agents/profile.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 9 | `<module>` (`MODEL_ID`) | `^[\p{L}\p{N}][\p{L}\p{N}._:/+@-]{0,255}$` | Validate model/provider IDs used in presets and discovery output. | Model ID, provider/model token. | `withExplicitModel` (`:51`), `discoverModels` (`:256`, `:263`), `validateExplicitModel`. | keep |
| 13 | `commandArguments` | <code>[&#124;;&amp;$&lt;&gt;\n\r]</code> | Reject shell syntax before tokenizing an agent command. | Preset command string. | `commandArguments` at `profile.ts:52/94/200`, `opencode-resolution.ts:15`, `opencode-v2.ts:89/105`. | keep (security boundary; stricter than `appendArguments`) |
| 36 | `commandArguments` | `\s` | Tokenize unquoted whitespace while parsing the command. | Command string characters. | Same callers. | keep |
| 252 | `discoverModels` | `\r?\n` | Split `pi --list-models` output into lines. | CLI stdout. | `discoverModels` via `pi.ts:97`, `session-service-mechanics.ts:333`, `workspace-controller.ts:2677`. | duplicate (same split at 261) |
| 255 | `discoverModels` | `\s+` | Split a pi model line into provider and model. | Trimmed line. | Same callers. | duplicate (shared whitespace split) |
| 261 | `discoverModels` | `\r?\n` | Split non-pi model output into lines. | CLI stdout. | Same callers. | duplicate |

### `src/runtime/completion-supervisor-resources.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 70 | `cleanupPreparedLaunchResources` | `^[a-f0-9]{64}$` | Verify the resource marker is a 32-byte hex value before trusting ownership. | `resource.marker`. | `SessionProcess.validateLaunchResources` (`session-process.ts:563`); tests. | keep (security validation) |

### `src/runtime/live/tmux/pane-snapshot.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 36 | `capturePaneSnapshot` | `\s+` | Split tmux geometry/cursor metadata into fields. | Trimmed `display-message` stdout. | No production caller found; `pane-snapshot.test.ts` only. | duplicate (shared whitespace split) |
| 42 | `capturePaneSnapshot` | `\r?\n$` | Remove exactly one trailing newline from the captured screen. | `screen.stdout`. | No production caller found; tests only. | equivalent to `endsWith` + `slice` |

### `src/runtime/live/tmux/session-control.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 32 | `sessionAbsent` | `can't find session\|no sessions` | Add tmux wordings for an absent session to `isMissingTmuxTarget`. | Probe stderr/stdout. | `killOwnedSession` (`:56`). | keep |

### `src/runtime/live/tmux/vt-channel.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 229 | `parseTmuxVersion` | `(\d+)\.(\d+)(?:\.(\d+))?` | Parse major/minor/patch from `tmux -V`. | Version output. | `detectVtCapabilities` (`:331`). | keep |
| 366 | `readOption` | `\n$` | Remove one trailing newline from a tmux option value. | `show-options` stdout. | `readOption` ← `claimPipeLease` (`:387`, `:389`, `:403`), `releaseLease` (`:419`). | equivalent to `endsWith` + `slice` |
| 381 | `claimPipeLease` | `[^a-zA-Z0-9_-]` | Sanitize the pane target into a safe `wait-for` lock name. | `target`/`paneId`. | `createVtChannel` (`:638`). | duplicate (same sanitizer at 416) |
| 416 | `releaseLease` | `[^a-zA-Z0-9_-]` | Sanitize the pane ID into the same lock name. | `opts.paneId`. | `createVtChannel` (`:664`, `:699`). | duplicate |
| 774 | `createVtChannel` (heartbeat) | `\s+` | Split heartbeat `display-message` output into dead/activity fields. | Trimmed stdout. | Heartbeat coalescer inside `createVtChannel`; no production caller found (integration test only). | duplicate (shared whitespace split) |

### `src/runtime/session-process.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 194 | `isMissingTmuxTarget` | `^no server running(?: on .+)?$` | Recognize tmux's "no server" diagnostic for specific commands. | A single trimmed stderr line. | `exactPane` (`:506`), cleanup path (`:467`). | keep |
| 215 | `isUnavailableTmuxServer` | `^error connecting to\s+\S+` | Recognize an unreachable tmux server as an expected absence. | Error message. | `exactPane` (`:506`). | keep |
| 279 | `create` | `^%\d+$` | Validate the active pane ID returned by libtmux. | `created.activePane.id`. | `SessionProcess.create` ← `Harness` (`harness.ts:223`), `session-service-mechanics.ts:155`, internal resume/launch (`:382`). | duplicate (same validator at 519) |
| 519 | `exactPane` | `^%\d+$` | Validate the pane ID parsed from `list-panes`. | `paneId` field. | `exactPane` callers (`:338`, `:413`, `:485`, `:611`, `:628`, `:666`). | duplicate |

### `src/runtime/sessions.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 375 | `validateOwnedSessionSidecars` | `^[A-Za-z0-9._-]+$` | Validate a session ID before deriving sidecar paths during purge. | `session.id`. | `purgeTask` (`:365`). | duplicate (same charset at 433/`workspace-context.ts:141/222`) |
| 433 | `forgetTaskSessions` | `^[A-Za-z0-9._-]+$` | Validate each session ID before forgetting its association. | `session.id`. | `TaskLifecycleService` via `agentic-workspace.ts:189` (callback wired at `task-lifecycle-service.ts:159`). | duplicate |

### `src/runtime/workspace-context.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 139 | `parseWorkspaceContext` | `^[a-z0-9][a-z0-9_-]*$` | Validate the conversation mode ID grammar. | `conversation.modeId`. | `serializeWorkspaceContext` (`:39`), `readInheritedWorkspaceContext` (`:174`) ← `readWorkspaceContext`. | keep |
| 141 | `parseWorkspaceContext` | `^[A-Za-z0-9._-]+$` | Validate the conversation session ID. | `conversation.sessionId`. | Same callers. | duplicate |
| 155 | `parseWorkspaceContext` | `^%[0-9]+$` | Validate the inherited tmux pane ID. | `candidate.paneId`. | Same callers. | duplicate (`^%\d+$` in `session-process.ts`) |
| 222 | `<module>` (`SAFE_MARKER_ID`) | `^[A-Za-z0-9._-]+$` | Prevent a crafted request marker ID from escaping the request directory. | `sessionId`. | `markerPath` (`:226`), `parseWorkspaceRequest` (`:234`). | duplicate |

## Regexes — renderer, CLI and lib

## Summary

- **Sites:** 54 production regex sites in 19 files, exactly matching `/tmp/inventory-renderer.md`; no sites added or removed.
- **Distinct patterns:** 46 distinct exact pattern sources (flags included). The 8 repeated occurrences are `/\s+/g` (5 uses), `/^\d{4}-\d{2}-\d{2}$/` (2), the modifier-prefix pattern (2), `/^[A-Za-z]:/` (2), and `/[\0\r\n]/` (2).
- **Direct callers verified:** each containing function was read in source and its production callers located. Test-only exports are called out.
- **Main signals:**
  - **Duplicate clusters:** whitespace normalization (`\s+`), date-only detection, modifier-prefix parsing, Windows drive-letter rejection, and control-character rejection are each implemented more than once. A shared helper would remove the drift risk.
  - **String-method equivalents:** the one-slash model-ID check is `split`; the Windows `TERM` list is set/includes membership; modifier-only key names are set membership.
  - **Over-broad heuristic:** code-path extension detection (`\.[a-zA-Z0-9]+$`) treats dotted non-paths such as versions or abbreviations as files; the stale-approval check matches human-readable error text.
  - **Keep:** the strict `ps` row/identity parsers, tmux absence classifier, `escapeRegex`, slug, UTC date parsers, and the prototype-pollution mode-ID guard are narrow and correctness/security relevant.
  - **Test-only in production:** `paneRootState` has no production caller; `processIdentity` is reached only through `processIdentityAlive`, which also has no production caller.

## Annotated inventory

### `src/cli/commands/agent-workspace.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 66 | `registerAgentWorkspaceCommands` | `^[^/]+\/[^/]+$` | Validate that `agent-config model set` receives exactly one non-empty `provider/model`. | CLI model-ID argument. | `runCli` (`src/cli/register.ts:147`). | Equivalent to `split` (one `/`, both halves non-empty). |

### `src/cli/commands/help-schema.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 124 | `renderConfiguredTaskIds` | `\{\{TASK_TYPE:(\d+)\}\}` | Replace a numeric task-type placeholder with the configured type as JSON. | Help/example text. | `renderHelpSchema` (`help-schema.ts:78`), `root-entry.ts:48`. | Keep. |
| 127 | `renderConfiguredTaskIds` | `\{\{TASK_ID:(\d+(?:\.\d+)*)\}\}` | Replace a task-ID placeholder with the configured prefix/example ID. | Help/example text. | `renderHelpSchema` (`help-schema.ts:78`), `root-entry.ts:48`. | Keep. |
| 128 | `renderConfiguredTaskIds` | `\b(?:BACK\|TASK)-(\d+(?:\.\d+)*)\b` | Rewrite bare legacy `BACK-`/`TASK-` IDs in examples to the configured prefix. | Help/example text. | `renderHelpSchema` (`help-schema.ts:78`), `root-entry.ts:48`. | Keep. |

### `src/cli/features/tasks/wizard.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 85 | `parseListInput` | `,\|\r?\n` | Split a free-text list on commas or line breaks. | Wizard list-field value. | `applyChangedList` (`wizard.ts:222`), `setCreateList` (`wizard.ts:585`). | Keep (split is the operation). |

### `src/cli/list-window.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 63 | `parsePositiveIntegerOption` | `^[1-9]\d*$` | Reject zero, negatives, fractions, and non-numeric `--max-count`/`--limit` values. | Option value from commander. | `parseListWindow` (`list-window.ts:90`), `list-parse.ts:97`. | Keep (strict validation). |
| 95 | `parseListWindow` | `^\d+$` | Validate `--skip` as a non-negative integer. | `--skip` option value. | `read-output.ts:31`. | Keep. |
| 126 | `quoteShellArgument` | `^[\w@+:,./-]+$` | Decide whether a command argument is shell-safe without quoting. | Command argument when rendering the next-page command. | `nextPageCommand` (`list-window.ts:155`), called by `formatListWindowFooter:165`. | Keep. |

### `src/cli/register.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 77 | `async function runCli(` | `^(xterm\|dumb\|ansi\|vt100)$` | On Windows, replace known non-256-color `TERM` values with `xterm-256color`. | `process.env.TERM`. | `src/cli/index.ts:10`. | Equivalent to set/`includes` membership. |
| 86 | `async function runCli(` | `node_modules[\\/]+agentic-workspace-(darwin\|linux\|windows)-[^\\/]+[\\/]+agentic-workspace(\.exe)?$` | Detect and drop a Bun/platform-package wrapper path from `argv[0]`. | First raw CLI argument. | `src/cli/index.ts:10`. | Keep (platform packaging detail). |

### `src/lib/debug-log.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 118 | `formatFields` | `[\s"]` | Quote string debug-field values that contain whitespace or a quote. | Debug field value. | `debug` (`debug-log.ts:133`). | Keep. |

### `src/lib/process-tree.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 26 | `<module>` | `^(?:Sun\|Mon\|Tue\|Wed\|Thu\|Fri\|Sat)\s+(?:Jan\|Feb\|Mar\|Apr\|May\|Jun\|Jul\|Aug\|Sep\|Oct\|Nov\|Dec)\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4}$` | Validate the `ps` `lstart` column before treating an observation as trustworthy. | Normalized `lstart` text. | `parseProcessTable` (`process-tree.ts:48`). | Keep. |
| 33 | `parseProcessTable` | `\r?\n` | Split `ps` output into rows on LF/CRLF. | Raw `ps` stdout. | `readProcessTable` (`process-tree.ts:65`). | Keep. |
| 35 | `parseProcessTable` | `^\s*(\d+)\s+(\d+)\s+(\d+)\s+(-?\d+)\s+(\S+)\s+(.+?)\s*$` | Strictly parse one `pid ppid pgid uid stat lstart` row; any bad row invalidates the observation. | One `ps` output line. | `readProcessTable` (`process-tree.ts:65`). | Keep (observation-integrity parser). |
| 48 | `parseProcessTable` | `\s+` | Collapse whitespace in `lstart` before validating it. | Parsed `lstart` field. | `parseProcessTable` itself (`process-tree.ts:48`). | Duplicate: same normalization as lines 53, 70, 258, and 375. |
| 53 | `parseProcessTable` | `\s+` | Store `started` with collapsed whitespace. | Parsed `lstart` field. | `parseProcessTable` itself (`process-tree.ts:53`). | Duplicate: same as the other `\s+` normalizers. |
| 70 | `normalizeStarted` | `\s+` | Canonicalize start-time spacing for identity comparisons. | Raw `started` text. | `sameOwnedIdentity:72`, `captureOwnedDescendants:92,93,98,107,143`, `processIdentityAlive:265`, `process-tree.ts:408`. | Duplicate: helper exists but other sites repeat the regex inline. |
| 256 | `processIdentity` | `^(\d+)\s+(\S+)\s+(.+)$` | Parse `ps -p` identity output into pid/stat/started. | Trimmed `ps -p` stdout. | `processIdentityAlive` (`process-tree.ts:262`); no direct production caller for `processIdentity`. | Keep (test-only in production). |
| 258 | `processIdentity` | `\s+` | Collapse whitespace in parsed start time. | Parsed `started` field. | `processIdentity` itself (`process-tree.ts:258`). | Duplicate: same `\s+` cluster. |
| 343 | `isMissingTmuxTarget` | `no server running\|can't find pane\|\(no such file or directory\)\|\(connection refused\)` | Classify tmux errors that conclusively prove an absent server/pane. | tmux stderr/stdout. | `vt-channel.ts:841`, `session-control.ts:32`. | Keep (safety classifier; do not broaden). |
| 375 | `paneRootState` | `\s+` | Split `#{pane_pid} #{pane_dead}` into two fields. | tmux `display-message -p` output. | No production caller (tests only). | Keep (test-only); equivalent to split. |

### `src/lib/regex.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 2 | `escapeRegex` | `[.*+?^${}()\|[\]\\]` | Escape regex metacharacters before interpolating a configured prefix. | Configured task-ID prefix. | `task-path.ts:51`, `task-id.ts:26`, `prefix-config.ts:105`, `file-system.ts:510`. | Keep. |

### `src/lib/slug.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 4 | `slug` | `[^a-z0-9]+` | Collapse non-alphanumeric runs into one hyphen. | Arbitrary label/title. | `session-utils.ts:72`, `agent-settings.ts:1238`, `task-worktree.ts:34`, `session-store.ts:519`. | Keep. |
| 5 | `slug` | `^-\|-$` | Remove leading/trailing hyphens left by the collapse. | Result of line 4. | Same `slug` callers. | Keep. |

### `src/lib/utc-date-display.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 11 | `<module>` | `^\d{4}-\d{2}-\d{2}$` | Recognize a date-only UTC value. | Trimmed display value. | `normalizeUtcDateDisplay:64`. | Duplicate with `json-output.ts:82`. |
| 12 | `<module>` | `^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$` | Normalize a timezone-less date-time to `yyyy-mm-dd hh:mm`. | Trimmed display value. | `normalizeUtcDateDisplay:52`. | Keep. |
| 14 | `<module>` | `^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z\|[+-]\d{2}:?\d{2})$` | Recognize an explicit-timezone date-time for UTC conversion. | Trimmed display value. | `formatExplicitTimezoneDateTime:29`. | Keep. |
| 15 | `<module>` | `\s+\(UTC\)$` | Strip a trailing `(UTC)` label before formatting. | Raw date string. | `formatUtcDateForDisplay:123`. | Keep. |
| 22 | `normalizeTimezoneOffset` | `^[+-]\d{4}$` | Convert `+HHMM`/`-HHMM` offsets to `+HH:MM`. | Timezone capture from line 14. | `formatExplicitTimezoneDateTime:37`. | Keep. |
| 69 | `<module>` | `^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$` | Match the canonical date[/time] that custom display formatting rearranges. | Normalized display value. | `formatUtcDateForDisplay:128`. | Keep. |
| 88 | `applyDateFormat` | `\s` | Split a display format into date part and optional time part at the first whitespace. | `dateFormat` option. | `formatUtcDateForDisplay:130`. | Equivalent to `split`/`indexOf`. |
| 105 | `applyDateFormat` | `yyyy\|mm\|dd` | Substitute date tokens once, without re-matching inserted digits. | Date-format date part. | `applyDateFormat` itself (`utc-date-display.ts:105`). | Keep. |
| 118 | `applyDateFormat` | `hh\|mm` | Substitute time tokens once. | Date-format time part. | `applyDateFormat` itself (`utc-date-display.ts:118`). | Keep. |

### `src/renderer/formatters/code-path.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 8 | `<module>` | <code>([^&#96;]+)</code> | Capture backticked spans for code-path detection/transformation. | Markdown-ish task text. | `extractCodePaths:27`, `transformCodePathsPlain:41`. | Keep; shape duplicated at `task-detail-content.ts:74`. |
| 10 | `<module>` | `\.[a-zA-Z0-9]+$` | Heuristically treat a dotted suffix as a file extension. | Backticked content. | `isCodePath:20`, used by `extractCodePaths:32` and `transformCodePathsPlain:42`. | Over-broad (matches versions/abbreviations/domains, not just files). |
| 12 | `<module>` | `[/\\]` | Treat any slash/backslash as evidence of a path. | Backticked content. | `isCodePath:20`. | Keep. |

### `src/renderer/formatters/json-output.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 82 | `normalizePublicDate` | `^\d{4}-\d{2}-\d{2}$` | Pass date-only values through unchanged. | Task date fields. | `toTaskSummaryJson:110-112` (used by list/detail/search JSON at 129, 147, 172). | Duplicate with `utc-date-display.ts:11`. |
| 84 | `normalizePublicDate` | `^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?(?:\.\d+)?Z?$` | Parse minute/second-precision dates and emit canonical `...Z`. | Task date fields. | `toTaskSummaryJson:110-112`. | Keep. |
| 91 | `normalizePublicDate` | `\.\d{3}Z$` | Drop milliseconds from `toISOString()` output. | ISO string from fallback `Date` parse. | `normalizePublicDate:91`. | Keep. |

### `src/renderer/opentui/agent-settings.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 31 | `<module>` | `^[A-Za-z_][A-Za-z0-9_]*$` | Validate environment variable names in preset `NAME=value` lines. | Name portion of an environment line. | `parseAgentPresetEnvironment:89`, called at `agent-settings.ts:214`. | Keep. |
| 109 | `parseModeArtifactDefinitions` | `^[A-Za-z]:` | Reject Windows drive-letter absolute artifact paths. | Artifact path line. | `agent-settings.ts:1162`; tests. | Duplicate with `mode-settings-draft.ts:180`. |
| 1235 | `mountOpenTuiAgentSettings` | `[\0\r\n]` | Reject NUL/CR/LF in a mode name so it stays single-line text. | Mode-name editor value. | `workspace-controller.ts:2650`; tests. | Duplicate with `mode-settings-draft.ts:73`. |

### `src/renderer/opentui/filters.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 822 | `mountOpenTuiHelpOverlay` | `\p{Cc}` | Ignore a typed key sequence that is a control character while searching shortcuts. | `key.sequence` from a keypress. | `board.ts:351`, `workspace-controller.ts:2718`. | Keep; shares intent with line 843. |
| 843 | `mountOpenTuiHelpOverlay` | `\p{Cc}` | Strip control characters from pasted text before appending to the search query. | Decoded paste bytes. | `board.ts:351`, `workspace-controller.ts:2718`. | Duplicate intent with line 822 (test vs strip); factor a helper. |

### `src/renderer/opentui/keybindings.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 51 | `keyFromCanonical` | `^(C\|S\|M\|A\|Alt\|Option)-(.*)$` | Parse one modifier prefix from a canonical shortcut string. | Canonical key name. | `canonicalShortcut` getter (`keybindings.ts:81`). | Keep. |
| 58 | `keyFromCanonical` | `^(C\|S\|M\|A\|Alt\|Option)-(.*)$` | Re-match the remaining string inside the modifier loop. | Remaining canonical key name. | `keyFromCanonical` itself (`keybindings.ts:58`). | Duplicate of line 51 within the same loop. |
| 382 | `shortcutKeyFromEvent` | `^(shift\|ctrl\|control\|alt\|meta\|super\|hyper)$` | Reject modifier-only key events so they cannot be captured as a chord. | `event.name`. | `matchesShortcut:418`, dispatcher `keybindings.ts:523`, help overlay `filters.ts:766`. | Equivalent to set/`includes` membership. |

### `src/renderer/opentui/keymap.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 176 | `formatKey` | `^(?:M\|A\|Alt\|Option)-(.*)$` | Render meta/alt/option prefixes with the platform modifier label. | Canonical key name. | `formatKeymap:183`, `keybindings.ts:90`, `keybindings.ts:464`. | Keep. |

### `src/renderer/opentui/mode-settings-draft.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 4 | `<module>` | `^(?!__proto__$\|prototype$\|constructor$)[a-z][a-z0-9-]*$` | Validate mode IDs and block prototype-polluting keys. | Mode ID. | `validate:69`, `addMode:100`. | Keep (security guard). |
| 73 | `validate` | `[\0\r\n]` | Reject NUL/CR/LF in an explicit model ID. | `profile.model.id`. | `save:164`, `agent-settings.ts:1132`. | Duplicate with `agent-settings.ts:1235`. |
| 180 | `validateArtifact` | `^[A-Za-z]:` | Reject Windows drive-letter absolute artifact paths. | Artifact path. | `validate:81,88`. | Duplicate with `agent-settings.ts:109`. |

### `src/renderer/opentui/task-artifact-view.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 191 | `approveCurrentVersion` | `changed since it was reviewed` | Detect the stale-hash approval error and refresh instead of showing a generic error. | `Error.message` from the approval API. | `workspace.ts:848` (`void artifactView?.approveCurrentVersion()`). | Over-broad (human-readable message matching; prefer a typed error). |

### `src/renderer/opentui/task-detail-content.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 74 | `transformCodePathLine` | <code>[^&#96;]+</code> | Remove backticked spans to measure leftover prose before deciding to isolate a single path. | One task-detail line. | `transformCodePathsStyled:98`, used at `task-detail-content.ts:227`. | Duplicate intent with `code-path.ts:8` (same matcher without capture). |
| 89 | `transformCodePathLine` | `\s+` | Collapse leftover whitespace after removing a rendered code path. | Line content. | `transformCodePathLine` itself (`task-detail-content.ts:89`). | Duplicate with the `process-tree.ts` `\s+` normalizers. |

## Regexes — model, storage and filesystem

**Inventory:** 55 production sites in 23 files; **45 distinct patterns** after normalising interpolated prefixes. The only repeated literals are `\s+` (6 sites), `\\` (2), `^[a-zA-Z]+$` (3), `[<>:"/\\|?*]` (2) and `^[A-Za-z]:` (2). Signals: 10 duplicate, 12 equivalent to `startsWith` / `includes` / `split` / `endsWith`, 0 plainly over-broad, 33 keep. Every row below preserves the inventory line number and pattern.

### `src/filesystem/git/operations.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 667 | `private normalizeGitPath(pathValue: string): string` | `/\\/g` | Convert Windows separators in a git-relative path to POSIX. | String from `path.relative`. | `getRelativePathForRepo` (622), `buildContext` (661). | equivalent to split/join (literal character) |

### `src/filesystem/git/task-worktree.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 33 | `taskWorktreePath` | `/[^A-Za-z0-9._-]+/g` | Slugify the project directory name for the worktree path. | `basename(projectRoot)`. | `ensureTaskWorktree` (112), `sessionCwdFor` (`session-service-mechanics.ts:390`). | keep |
| 115 | `async function ensureTaskWorktree(projectRoot: s...` | `/already exists/i` | Detect git's "already exists" add failure so the existing branch/worktree can be adopted. | `result.stderr` from `git worktree add`. | `ensureTaskWorktree` itself (retry branch). | equivalent to `startsWith`/`includes` (lowercased stderr) |

### `src/filesystem/paths/agentic-workspace-directory.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 215 | `normalizeProjectAgenticWorkspaceDirectory` | `/^(?:[a-zA-Z]:)?[\\/]/` | Reject absolute POSIX or Windows-drive configured directories. | Trimmed config value. | `init-helpers.ts:187`; `agentic-workspace-directory.ts:86,151`; `file-system.ts:160,263`. | keep |
| 219 | `normalizeProjectAgenticWorkspaceDirectory` | `/\\/g` | Normalise backslashes before the `..` traversal check. | Trimmed config value. | Same callers as line 215. | equivalent to split/join (literal character) |
| 221 | `normalizeProjectAgenticWorkspaceDirectory` | `/\/+$/g` | Strip trailing slashes; empty/`.` is then rejected. | Slash-normalised config value. | Same callers as line 215. | keep |

### `src/model/session/agent-config-schema.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 5 | `<module>` (`SAFE_PRESET_NAME`) | `/^(?!__proto__$\|prototype$\|constructor$)[A-Za-z_][A-Za-z0-9_-]*$/` | Validate preset names and block prototype-pollution keys. | `selectedPreset` and preset record keys from agent config. | `AgentConfigurationSchema` (196, 197). | keep (security boundary; guard duplicated at line 7) |
| 6 | `<module>` (`POSIX_ENV_NAME`) | `/^[A-Za-z_][A-Za-z0-9_]*$/` | Validate preset env variable names. | Keys of `preset.env`. | `envSchema` (34). | keep |
| 7 | `<module>` (`SAFE_MODE_ID`) | `/^(?!__proto__$\|prototype$\|constructor$)[a-z][a-z0-9-]*$/` | Validate mode profile ids and block prototype-pollution keys. | `catalog.profiles` keys. | `ModeCatalogSchema` (105). | keep (guard duplicated at line 5) |
| 17 | `validateArtifactPath` | `/^[A-Za-z]:/` | Reject Windows drive-absolute artifact paths. | Artifact path string. | `AgentConfigurationSchema` (167, 178); re-exported by `storage/config.ts`; `agent-settings.ts` (1196, 1351). | duplicate (same test in `task-artifact-repository.ts:27`) |
| 133 | `<arrow>` in `ModeCatalogSchema` superRefine | `/[\0\r\n]/` | Reject NUL/CR/LF in an explicit model id. | `profile.model.id`. | Same `ModeCatalogSchema` validation. | equivalent to `includes` (three character checks) |

### `src/model/session/session-utils.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---|---|---|---|---|---|---|
| 60 | `<module>` (`AGENTIC_WORKSPACE_SESSION_NAME_PATTERN`) | `/^agentic-workspace-[a-z0-9-]+-[0-9a-f]{8}$/` | Recognise tmux sessions this project owns so it only kills/reaps its own. | tmux session name. | `isAgenticWorkspaceSessionName` → `session-control.ts:23`. | keep |

### `src/model/task/assignee-filter.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 2 | `assigneeComparisonKey` | `/^@/` | Drop one leading `@` before comparing assignees. | Raw assignee string. | `normalizeAssignees`; `task-update/collections.ts:23`; `task-search.ts:141,143,147`; `completions/data-providers.ts:75`. | equivalent to `startsWith` + `slice` |
| 2 | `assigneeComparisonKey` | `/\s+/g` | Collapse whitespace so `"Alice Smith"` and `"Alice  Smith"` compare equal. | Raw assignee string. | Same callers as the `^@` site. | keep |

### `src/model/task/due-date.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---|---|---|---|---|---|---|
| 11 | `<module>` (`DUE_DATE_PATTERN`) | `/^(\d{4})-(\d{2})-(\d{2})(?:[ T](?:[01]\d\|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z\|[+-](?:(?:0\d\|1[0-3]):?[0-5]\d\|14:?00))?)?$/` | Validate a `YYYY-MM-DD` day while tolerating a legacy time/offset suffix; only the day is kept. | `String(dueDate)` or a `Date` converted to UTC day. | `normalizeDueDate` → task update/creation, milestone writes, markdown schemas, CLI wizard. | keep (validation boundary; deliberately precise) |

### `src/model/task/prefix-config.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---|---|---|---|---|---|---|
| 49 | `getTaskPrefixError` | `/^[a-zA-Z]+$/` | Reject a configured task prefix that is not letters only (no trimming). | `options.advancedConfig.taskPrefix`. | `getTaskPrefixError` → `init-helpers.ts:39`. | duplicate (`config-schema.ts:49` has the same literal) |
| 105 | `hasPrefix` | ``new RegExp(`^${escapeRegex(prefix)}-`, "i")`` | Case-insensitive "does this id use this prefix" test. | Trimmed id + prefix. | `hasPrefix` → `generateNextSubtaskId` (185); exported for tests. | equivalent to `startsWith` on lowercased strings |
| 123 | `extractAnyPrefix` | `/^([a-zA-Z]+)-/` | Pull the alphabetic prefix out of any id. | Trimmed id. | `task-loader.ts:93`; `task-links.ts:19,20`. | equivalent to `indexOf`/`split` + letters check |

### `src/model/task/priority-config.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 18 | `normalizePriorityValue` | `/\s+/g` | Canonical priority key: trim, lowercase, collapse internal whitespace. | Raw priority value. | `getPriorityOptions`, `resolvePriorityValue`, `getPriorityRank`; `task-search.ts`, markdown record schema, wizard, task-detail renderer. | keep |
| 34 | `getPriorityOptions` | `/\s+/g` | Collapse whitespace in the display label while preserving original case. | Configured priority entries. | `getPriorityOptions` → CLI wizard, workspace controller, composer. | duplicate (same normalisation as line 18) |

### `src/model/task/status.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 19 | `statusLookupKey` | `/\s+/g` | Build a whitespace-insensitive key (removes all whitespace) for canonical status lookup. | Status string. | `resolveInProgressStatus`; status canonicalisation (61, 64, 78, 85, 95); CLI wizard (73, 76). | keep (removal differs from the comparison key and `priority-config` collapse) |

### `src/model/task/task-id.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 4 | `<module>` (`TASK_ID_PATTERN`) | ``new RegExp(`^([A-Za-z]+)-(${TASK_ID_BODY_PATTERN})$`)`` | Parse a full `<letters>-<numeric dotted>` task id. | Task id. | `parseTaskId` (12). | keep |
| 21 | `taskIdBody` | `/^[A-Za-z]+$/` | Confirm the part before `-` is an alphabetic prefix before slicing the body. | `idPrefix` slice. | `taskIdBody` → `task-ordering.ts:8`; `prefix-config.ts:73` (`extractIdBody`). | duplicate (letters-only test used in `prefix-config.ts:49` and `config-schema.ts:49`) |
| 26 | `taskIdRegex` | ``new RegExp(`^${escapeRegex(prefix)}-(${TASK_ID_BODY_PATTERN})`, "i")`` | Build a per-prefix matcher that captures the dotted numeric body. | Prefix string. | `prefix-config.ts:89` (`buildIdRegex`). | keep (dynamic body capture) |
| 31 | `canonicalTaskIdSegments` | `/^0+/` | Strip leading zeros from each numeric segment (`000` → `0`). | One numeric segment. | `canonicalTaskIdSegments` (31). | keep |
| 43 | `isNumericTaskIdSegment` | `/^\d+$/` | Predicate for one numeric segment. | Segment string. | `canonicalTaskIdSegments` (30). | keep |

### `src/model/task/task-identity-index.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 59 | `toPosixPath` | `/^\.\//` | Strip a leading `./` after separator normalisation. | Path string. | `joinPosix`, `normalizeRecordPath`, `recordKey`, identity grouping (64, 82, 94, 96, 109, 217). | equivalent to `startsWith("./")` + `slice` |
| 64 | `joinPosix` | `/^\/+\|\/+$/g` | Trim leading and trailing slashes from each part before joining. | One path part. | `joinPosix` (64). | keep |

### `src/model/task/task-ordering.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 18 | `parseId` | `/(\d+)$/` | Fallback: extract a trailing number from a mixed/legacy id that is not fully numeric. | `taskIdBody(id) ?? id`. | `parseId` → `compareIds` (28, 29), ancestor checks (105, 106). | keep |

### `src/storage/config-codec.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 7 | `configValueError` | `/\.$/` | Remove a trailing period before composing the config error message. | `problem` message text. | `configValueError` → `configSyntaxError` (17), `parseConfig` (42). | equivalent to `endsWith(".")` + `slice` |

### `src/storage/config-schema.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 49 | `<module>` (`taskPrefix`) | `/^[a-zA-Z]+$/` | Validate the stored `task_prefix` config field. | Config `task_prefix` value. | `rawConfigSchema` → `AgenticWorkspaceConfigSchema`. | duplicate (same literal as `prefix-config.ts:49`) |

### `src/storage/file-system.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 110 | `sanitizeLockKey` | `/^\.+/` | Remove leading dots so the lock key cannot look hidden or parent-like. | Sanitised key. | `sanitizeLockKey` (110). | keep |

### `src/storage/markdown/schema.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 37 | `<module>` (`FRONTMATTER_DATE_PATTERN`) | `/^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?$/` | Shape-check a frontmatter date field (day, optional ` HH:MM`). | Frontmatter date string. | `task-record-schema.ts:61` (zod field validator). | keep (schema shape check; full calendar validation is `due-date.ts:11`) |

### `src/storage/milestones.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 13 | `parseMilestoneId` | `/^m-(\d+)$/i` | Recognise an `m-<digits>` milestone id and return the digits. | Trimmed filename prefix / configured id. | `parseMilestoneId` → milestone reads (156, 158). | keep |
| 25 | `filename` | `/[<>:"/\\\|?*]/g` | Remove path-unsafe characters from a milestone title. | Milestone title. | `filename` → create/rename writes (178, 195). | duplicate (`file-system.ts:1473` uses the same unsafe set) |
| 26 | `filename` | `/\s+/g` | Collapse whitespace to `-` and lowercase for the milestone filename. | Milestone title. | `filename` (178, 195). | keep |

### `src/storage/session-store.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 36 | `<module>` (`NATIVE_SESSION_ID`) | `/^ses_[A-Za-z0-9][A-Za-z0-9_-]*$/` | Validate a native opencode session id read from a receipt before using it. | Receipt text with one trailing newline removed. | `readNativeSessionReceipt` (912). | keep |
| 149 | `async function hasStoreEvidence(root: string): P...` | `/\.(claim\|mode\|lock\|log\|md\|native-session-id)$/` | Treat a candidate state directory as occupied when it contains any known state file. | Filenames from `readdir` of a state container. | `hasStoreEvidence` → `resolveStateRoot` (210, 223). | equivalent to `endsWith` (suffix list) |

### `src/storage/task-artifact-repository.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 14 | `<module>` (`HASH`) | `/^[a-f0-9]{64}$/` | Validate a SHA-256 hex digest. | `approval.sha256`; reviewed artifact hash. | Approval-sidecar validation (72); reviewed-hash check (558). | keep |
| 27 | `validateTaskArtifactPath` | `/^[A-Za-z]:/` | Reject Windows drive-absolute artifact paths. | Artifact relative path. | `validateTaskArtifactPath` → artifact path/lock/store methods (69, 249, 270, 316, 360, 442, 526, 557, 584). | duplicate (same test in `agent-config-schema.ts:17`) |

### `src/storage/task-repository.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 20 | `warnUnparseableTaskFile` | `/[\r\n]+/g` | Flatten a parser error message to one line for the warning. | Error message. | `warnUnparseableTaskFile` → `task-loader.ts:627`, `task-repository.ts:122`. | equivalent to split/join (literal newlines) |

### `src/storage/watchers/task-watcher.ts`

| Line | Owner | Pattern | Purpose | Input | Direct caller(s) | Signal |
|---:|---|---|---|---|---|---|
| 47 | `classifyTaskWatchEvent` | `/[\\/]/` | Split an event path on either Windows or POSIX separators. | `filename` from `fs.watch`. | `classifyTaskWatchEvent` → watch event handler in `watchTaskRecords` (332). | keep (two separators; `split` is the natural API) |
| 66 | `classifyTaskWatchEvent` | `/\.(?:md\|markdown\|txt\|text)$/i` | Accept only markdown/text files as task artifacts. | Artifact `path` inside the task container. | `classifyTaskWatchEvent` (332). | equivalent to `endsWith` (lowercased suffix list) |
| 345 | `watchTaskRecords` | `/^[/\\]+/` | Strip leading separators from the path slice used to derive the canonical worktree watch dir. | `tasksDir.slice(projectRoot.length)`. | `watchTaskRecords` → `agentic-workspace.ts:1095`. | keep |

## Oracle assessment

The oracle reviewed this inventory against the contracts and source. It found several
inventory errors, so treat this section as the verified reading and Appendix A/B as
discovery aids rather than call graphs.

### Executive summary

- **Optimize behavior ownership, not regex counts.** Most repeated patterns are inexpensive,
  readable operations; extracting universal string/path/regex helpers would increase complexity.
- **The best immediate deletion is in the OpenCode adapters:** reuse the existing
  `appendArguments` **and** `filePrompt` helpers, removing approximately 22–26 production
  lines without changing behavior.
- **Fix the ask preset flow before simplifying sanitization.** `prepareAgentAsk` discards the
  sanitized preflight preset and prepares the original again; this can restore Claude
  auto-approval flags.
- **Do not merge task identity keys.** The audit incorrectly says `taskIdKey` delegates
  to numeric canonicalization. It deliberately preserves zero padding, as TASK-003 requires.
- **Delete superseded features rather than polishing their normalizers.** Cross-branch
  discovery conflicts with current task contracts; its removal offers more savings than local
  regex changes.
- **Keep meaningful distinctions:** omitted versus cleared lists, configured spelling versus
  comparison keys, status lookup versus equality, and lexical paths versus filesystem
  ownership checks.
- **Treat the appendices as discovery aids, not verified call graphs.** Appendix A contains
  unresolved method names and spurious callers; test-only exports and identical regex text
  do not establish safe deletion or equivalent behavior.

### Overall verdict

Proceed with a small cleanup, a separate ask-policy fix, and separately scoped
contract-alignment deletions. Do not launch a repository-wide normalization abstraction
project.

### Verdict by major cluster

| Cluster | Verdict | Reason |
|---|---|---|
| OpenCode command assembly | **Merge** | Two adapters duplicate existing `agent.ts` helpers verbatim, including error behavior. |
| Agent preset preparation/sanitization | **Simplify** | The pipeline repeats preparation and, in ask, discards its validated result. Preserve provider ownership and the sanitization gate. |
| Delimited lists and wizard lists | **Simplify** | Trim/filter/stringification passes repeat immediately before the shared normalizer. |
| Clearable lists | **Needed as-is**, with local reuse | Parsing CLI input and interpreting an already-built update have deliberately different empty-value semantics. |
| Project/type configuration | **Keep resolution policies; delete identity wrappers** | Type defaults differ from unconfigured projects. Pure forwarding filter wrappers add no policy. |
| Priority normalization | **Simplify locally** | Label normalization followed by full key normalization repeats work; priority values are not configured display spelling. |
| Status lookup | **Merge duplicate lookup implementation** | Wizard and model implement the same lookup loop. Keep lookup and comparison keys distinct. |
| Assignee/label/status keys | **Needed as-is** | Domain names document different equality rules and are explicitly required by CONVENTIONS. |
| Renderer filters | **Keep boundaries; simplify exact-list implementation opportunistically** | Editor cleanup and configured-value resolution are different jobs, not interchangeable normalization passes. |
| Task identity and locks | **Needed as-is for active task identity/safety** | Padding-preserving task equality and filesystem-safe lock names are different operations. |
| Branch/path normalization | **Delete branch-discovery machinery; retain necessary store/lifecycle path handling** | TASK-005 forbids cross-branch discovery. Local path wrappers also have materially different responsibilities. |
| Process identity normalization | **Simplify; delete unused probes** | Normalize a parsed start time once; remove production exports used only by their own tests where no supported API requires them. |
| Date, parsing, ownership and security validation | **Needed as-is** | Similar-looking regexes implement distinct grammars, output formats, or trust-boundary checks. |

### Corrections to the audit

1. **The task-ID delegation claim is false.**  
   `src/model/task/task-id.ts:59–60` implements `taskIdKey` as trim plus uppercase.
   `canonicalTaskIdKey:34–39` lowercases and strips numeric padding. They are not a repeated
   chain. `src/test/task-id-resolution.test.ts:11–22` and TASK-003 explicitly require
   `TASK-01 !== TASK-1`.

2. **The path-wrapper classifications are misleading.**  
   `normalizeTaskLifecyclePath` only rewrites completed/archive lifecycle prefixes
   (`task-identity-index.ts:69–76`); it does not normalize separators or roots.
   `normalizeRecordPath:79–105` handles absolute paths, worktree roots and nested-project
   prefixes. It is not merely a thin dispatcher.

3. **Priority resolution does not return configured spelling.**  
   `priority-config.ts:58–67` returns the normalized lowercase value. Labels preserve display
   casing separately. The initial normalization table also omits internal whitespace collapse.

4. **The assignee description is inconsistent.**  
   The initial table understates the behavior. Assignee equality removes one leading `@` and
   collapses internal whitespace; generic `comparisonKey` does neither.

5. **Pi’s sanitization hook is mandatory in the current interface.**  
   `runtime/agents/agent.ts:134` has no `?`. The audit calls it both optional and
   interface-required. Deleting Pi’s implementation alone breaks the interface.

6. **Clearable-list helpers are not duplicates.**  
   `parseClearableStringList([])` returns `undefined`; blank textual input produces `[]`.
   `sanitizeClearableStringArray([])` returns `[]`; blank-only array elements produce
   `undefined`. `cli/features/tasks/edit-options.ts:135–138` bridges these stages intentionally.

7. **The filename-ID extraction regex is not interchangeable with `parseTaskId`.**  
   `storage/file-system.ts:1302` matches an ID at the **start** of an identity string;
   `parseTaskId` requires the entire string. Replacing one with the other changes occupied-ID
   detection.

8. **The two filename sanitizers have different replacement behavior.**  
   Same character class does not mean equivalent transformation.

9. **Several "string-method equivalents" are not useful simplifications.**  
   `search(/\s/)` is not equivalent to `indexOf(" ")`; `split(" ")` does not replace
   `split(/\s+/)`; splitting/joining literal newlines does not automatically preserve
   `[\r\n]+` run collapsing.

10. **Appendix A is not a reliable caller inventory.**  
    Rows named `?` pointing to `src/types/raw.d.ts:1`, the `value` getter with hundreds of
    unrelated references, and method definitions listed as callers are mechanical-search
    artifacts. Also, `paneRootState` currently has **no references**, not verified test callers.

### Prioritized actions

**Safety exception:** do Action 1 before cosmetic preset cleanup. The remaining actions are
ordered broadly from smaller/local changes to larger removals.

#### 1. Reuse the sanitized preflight preset in ask — correctness first

**Files:** `src/runtime/session-launch.ts:132–154,285–312`;
`src/runtime/session-launch.test.ts:37–69`.

- Ask recomputes `effective` from `preflight.preset`, not `preflight.policyPreset`.
- Claude’s `prepareProfile` only handles model selection (`agents/claude.ts:111–113`), so
  stale permission-bypass flags can survive into the actual ask command.
- Consume the already-prepared, sanitized preflight result rather than repeating preparation.
  No new preset abstraction.
- **Reduction:** roughly 0–2 lines; one redundant preparation pass removed. Value is
  correctness, not line count.
- **Required tests:** actual ask command excludes stale bypass flags; registered adapter
  sanitization reaches both `prepare` and `askCommand`; explicit/default models remain correct.
  Correct the existing test’s expectation that the ask command still contains `"claude"` after
  the adapter returned `"capability-sanitized"`.
- **Gate:** preserve current effective configuration and provider-owned policy. Do not replace
  adapter dispatch with provider branching in SessionRuntime.

#### 2. Delete duplicate OpenCode command helpers

**Files:** `src/runtime/agents/opencode-v1.ts:24–35`, `opencode-v2.ts:23–34`; reuse
`agent.ts:162–177`.

- Import existing `appendArguments` and `filePrompt`.
- Both local helper pairs are identical to the shared implementations. The report missed the
  adjacent `filePrompt` duplication.
- **Reduction:** approximately **22–26 lines**.
- **Required tests:** v1/v2 launch, resume and ask command construction; bootstrap paths
  containing spaces/apostrophes; rejection of pipes, semicolons, ampersands and newlines with
  the same error.
- **Gate:** retain the guard. Do not replace it with the stricter `commandArguments` parser as
  part of this refactor.

#### 3. Remove same-function redundant list passes

**Files:** `src/lib/string-list.ts:15–21`;
`src/cli/features/tasks/wizard.ts:83–88,104`; `src/cli/task-edit-builder.ts:54–56`.

- Delimited parsing: `toStringArray` already stringifies; `normalizeStringList` already trims
  and drops blanks.
- Wizard list parsing: split, then normalize once; remove preceding trim/filter passes.
- Wizard status choices: remove the trim map immediately before `normalizeStringList`.
- Replace bespoke label assignment with the existing clearable `assignSanitizedList` call.
- **Reduction:** approximately **9–14 lines**.
- **Required tests:** commas and CRLF input, repeated/blank values, preserved first-seen order,
  and the matrix of omitted input / `[]` / `[" "]` / explicit CLI clear.
- **Gate:** keep the differing clear/no-op semantics and the assignee-specific path.

#### 4. Inline initialization’s nullish-coalescing wrapper

**File:** `src/controller/init-helpers.ts:79–81,106–131`.

- Replace the six `resolveConfigValue(a,b,c)` calls with `a ?? b ?? c`; delete the helper.
- **Reduction:** approximately **10–20 lines**, formatter-dependent.
- **Required tests:** explicit `false` overrides existing `true`; absent values inherit;
  filesystem-only overrides remain enforced.
- **Gate:** use `??`, not `||`. Do not redesign configuration precedence.

#### 5. Delete policy-free project/type filter wrappers

**Files:** `src/model/task/project-config.ts:37–42`, `task-type-config.ts:35–40`; callers in
`task-search.ts:123,128`.

- Call existing `matchesConfiguredFilter` directly from task search.
- Keep `getProjectValues` and `getTaskTypeValues`, and keep domain resolvers that apply their
  different defaults.
- **Reduction:** approximately **10–14 lines**.
- **Required tests:** singular/multiple/empty filters, case-insensitive matching, missing task
  values; retain `task-type-config.test.ts` and `task-project.test.ts`.
- **Not worth doing:** introducing a configurable "field resolver" factory to merge
  project/type/priority modules.

#### 6. Consolidate the duplicate status lookup, without making wizard logic async

**Files:** `src/cli/features/tasks/wizard.ts:72–81`; `src/model/task/status.ts:54–66`.

- Move the existing synchronous lookup implementation to the status owner and call it from
  both places.
- Keep the asynchronous configuration-loading adapter; do not make prompt construction await
  configuration it already has.
- **Reduction:** approximately **5–8 lines**, plus one fewer implementation to maintain.
- **Required tests:** blank input, unknown status, tabs/spaces/case variants, first configured
  match, allowed-status restriction; wizard defaults and existing `status-resolution.test.ts`.
- **Gate:** do not substitute `comparisonKey` for `statusLookupKey`. Equality still preserves
  internal whitespace.

#### 7. Simplify local normalization work, not its public boundaries

**Files:** `priority-config.ts:31–35`; `lib/process-tree.ts:39–53`; optionally
`renderer/opentui/filters.ts:123–133`.

- Priority: after producing the trimmed, whitespace-collapsed label, derive its value by
  lowercasing it rather than normalizing it again.
- Process table: compute normalized `started` once and use it for validation and storage.
- Renderer exact-list cleanup can reuse `normalizeStringList(values) ?? []`; make the shared
  parameter readonly if needed, rather than copying arrays.
- **Reduction:** priority/process changes are approximately line-neutral; renderer reuse saves
  **8–10 lines**.
- **Required tests:** first spelling/order and empty output; priority whitespace/casing;
  malformed process tables, spaced timestamps and PID-reuse fencing.
- **Gate:** renderer reuse is equivalent for the declared string inputs, not arbitrary malformed
  values—the generic helper coerces values. Keep label-specific equality and process comparison
  normalization at independent observation boundaries.

#### 8. Delete genuinely unused process helpers

**File:** `src/lib/process-tree.ts:14,246–266,364–378`; adjust `process-tree.test.ts:71–73`.

- `processIdentity` and `processIdentityAlive` have no production callers; their only external
  calls are in this test.
- `paneRootState` and `PaneRootState` have no callers in the searched TypeScript source.
- **Reduction:** approximately **35–40 lines**, including associated declarations/comments.
- **Required verification:** typecheck and remaining process-tree tests; retain the
  timestamp-spacing assertions through active owned-process APIs.
- **Gate:** delete only these disconnected helpers, not PID/start-time checks used by
  termination.

#### 9. Stop optimizing superseded branch discovery; remove it as an alignment task

**Files:** `src/controller/persistent-task-read.ts:19–54`; `src/controller/task-loader.ts`;
affected loader/identity tests and configuration callers.

- Production still invokes `BranchTaskLoader.load`; its branch normalization is not merely dead
  code.
- TASK-005 requires one deterministic store and explicitly forbids branch discovery. The right
  endpoint is deletion, not a shared branch normalizer.
- **Reduction:** likely **400–600 lines in the loader**, plus caller/config cleanup; exact net
  requires accounting for shared types and remaining consumers.
- **Required tests:** loading never lists branch tips or hydrates Git blobs; linked worktrees
  use the main store; active/completed/archive identity rules and ambiguity failures remain
  correct.
- **Gate:** replace tests asserting superseded branch discovery with contract tests. Preserve
  records and unrelated worktrees; removing discovery does not authorize deleting their data.

### Regex-specific disposition

#### Truly repeated behavior worth consolidating

| Sites | Action |
|---|---|
| Three `appendArguments` implementations | Reuse the existing function; remove whole duplicates, not just their regex constants. |
| Process start-time trim/collapse within `parseProcessTable` | Compute once; reuse existing normalization semantics. |
| Wizard/model canonical status lookup | Share the existing synchronous operation, including matching precedence. |
| Modifier-prefix matcher twice in `keybindings.ts:51,58` | Optional local loop cleanup to one match site. No parser framework; negligible line savings. |
| Idle-prompt rules in `agents/chrome-rules.ts` | A local shared rule is reasonable if editing the file anyway; not a standalone project. |
| Two native-session guards in `opencode-v2.ts` | A local non-global constant can prevent drift. Keep both validation calls and their contextual errors. |

**Do not unify** the v2 native-session regex with `session-store.ts:36`: the latter requires
the first suffix character to be alphanumeric; v2 currently permits `_` or `-`.

#### String methods: use only when clearer

- **Good:** literal backslash replacement → `replaceAll("\\", "/")`, not `split("\\").join("/")`,
  in Git/workspace path normalization.
- **Good when touched:** literal phrase checks → `message.toLowerCase().includes(...)` for
  `"already exists"` or `"changed since it was reviewed"`. This does **not** fix reliance on
  human-readable error messages.
- **Reasonable but not savings:** literal prefix removal with `startsWith`/`slice`; do not
  expand every concise `.replace(/^prefix/, "")` into branches.
- **Optional:** exact TERM/modifier-name alternatives → array `.includes` after case
  normalization. No new `Set` module needed.
- **Keep the provider/model regex:** splitting requires checking exactly two nonempty parts; it
  is more code unless the parts are subsequently needed.
- **Keep whitespace/CRLF splitting regexes:** they already use the appropriate `split` API.
- **Keep suffix alternatives and one-newline removal:** arrays of `endsWith` checks or
  CRLF-aware slicing are not simpler.

#### Must remain regexes or equivalent strict validators

Keep task-ID grammars, numeric option validation, dynamic escaped-prefix capture,
dates/timezones, shell syntax checks, Unicode model IDs, process-table parsing, ownership
hashes, prototype-key exclusions, pane/session ID grammars and tmux diagnostics.

Repeated charset tests do not justify a universal `isSafeId`, `isSafePath` or
`normalizeWhitespace`.

In particular:

- `\p{Cc}` **test** for typed input and global **removal** for paste are different operations.
  Sharing a stateful global regex would be a regression.
- Priority whitespace collapse, status whitespace removal and process-field splitting differ.
- Date-only detection may repeat literally; sharing two short regexes across different
  date-format policies buys essentially nothing.

### Candidates to leave alone or defer

- **Agent wrapper methods:** replacing the three identical bodies with direct function-valued
  members saves about six lines, but is low value. Keep Pi’s identity hook unless redesigning
  the interface. Do not add a base class or optional-hook fallback just to delete five lines.
- **Repeated `prepareProfile`/sanitization:** also reached through
  `session-service-mechanics.ts:338` and direct adapter tests. Fix ask’s result reuse first;
  establish one preparation owner across these callers before removing safety passes.
- **Artifact path validation:** schema and draft-editor checks are substantially duplicated,
  but storage rejects additional lock/temp names and handles runtime types. The editor parser
  also has distinct diagnostics and omits the NUL check. This is a boundary-consistency task,
  not a safe four-way regex merge.
- **Config aliases:** `normalizeAliases` encodes precedence. Delete only with a confirmed
  supported-config/data policy, not because it is labeled a wrapper.
- **Filesystem ownership checks and launch environment sanitization:** repeated boundaries can
  encounter new data or adapter-added environment values. Keep them.
- **Test-only terminal code:** `pane-snapshot.ts` offers a possible 58-line deletion, but
  supporting handoffs identify terminal work requiring ownership confirmation. Also,
  `vt-channel.ts` has a real CLI dynamic import for `runVtPipe`; absence of
  `createVtChannel` callers does not make the entire module unused.
- **Code-path heuristic / typed stale-approval errors:** potentially worthwhile behavior
  improvements, but neither is justified as a code-reduction exercise.

**Skipped:** no files changed, tests executed, build performed, or exhaustive inventory recount;
test evidence above is source inspection.

**Risk:** current tests preserve some contract drift—including ask’s discarded sanitizer
result—so "tests still pass" alone is not an adequate acceptance criterion.

## Appendix A — Complete normalization function inventory

Mechanical list of every production function whose declared name matches normalization semantics. Callers are source references excluding the definition line; imports are included. Purpose and classification are in the annotated sections above.

Totals: 81 functions.

| Function | File:line | Declared signature | Callers |
|---|---|---|---|
| `normalizeCliStatusList` | `src/cli/features/tasks/filter-normalizers.ts:12` | `async function normalizeCliStatusList(` | src/cli/features/tasks/register.ts:29<br>src/cli/features/tasks/register.ts:136<br>src/cli/register.ts:19<br>src/cli/register.ts:141 |
| `normalizeCliPriority` | `src/cli/features/tasks/filter-normalizers.ts:26` | `async function normalizeCliPriority(core: Core, value: string): Promise<string \| null> {` | src/cli/features/tasks/register.ts:27<br>src/cli/features/tasks/register.ts:137<br>src/cli/register.ts:17<br>src/cli/register.ts:142 |
| `normalizeCliTaskTypes` | `src/cli/features/tasks/filter-normalizers.ts:35` | `async function normalizeCliTaskTypes(` | src/cli/features/tasks/register.ts:30<br>src/cli/features/tasks/register.ts:138<br>src/cli/register.ts:20<br>src/cli/register.ts:143 |
| `normalizeCliProjects` | `src/cli/features/tasks/filter-normalizers.ts:48` | `async function normalizeCliProjects(core: Core, values: string[], optionName: string): Promise<string[] \| null> {` | src/cli/features/tasks/register.ts:28<br>src/cli/features/tasks/register.ts:139<br>src/cli/register.ts:18<br>src/cli/register.ts:144 |
| `addNormalizedListFilter` | `src/cli/features/tasks/list-parse.ts:70` | `async function addNormalizedListFilter(` | src/cli/features/tasks/list-parse.ts:34<br>src/cli/features/tasks/list-parse.ts:52<br>src/cli/features/tasks/list-parse.ts:53 |
| `findCanonicalStatus` | `src/cli/features/tasks/wizard.ts:72` | `function findCanonicalStatus(input: string, statuses: string[]): string \| null {` | src/cli/features/tasks/wizard.ts:92<br>src/cli/features/tasks/wizard.ts:131<br>src/cli/features/tasks/wizard.ts:487 |
| `normalizeWizardValues` | `src/cli/features/tasks/wizard.ts:479` | `function normalizeWizardValues(` | src/cli/features/tasks/wizard.ts:374 |
| `sanitizeClearableStringArray` | `src/cli/task-edit-builder.ts:9` | `function sanitizeClearableStringArray(values: string[] \| undefined): string[] \| undefined {` | src/cli/task-edit-builder.ts:48 |
| `assignSanitizedList` | `src/cli/task-edit-builder.ts:30` | `function assignSanitizedList(` | src/cli/task-edit-builder.ts:57<br>src/cli/task-edit-builder.ts:58<br>src/cli/task-edit-builder.ts:63<br>src/cli/task-edit-builder.ts:64<br>src/cli/task-edit-builder.ts:65<br>src/cli/task-edit-builder.ts:66<br>src/cli/task-edit-builder.ts:67<br>src/cli/task-edit-builder.ts:68<br>+2 more |
| `normalizeTargetMilestone` | `src/controller/agentic-workspace.ts:111` | `function normalizeTargetMilestone(targetMilestone: string \| null \| undefined): string \| undefined {` | src/controller/agentic-workspace.ts:742<br>src/controller/agentic-workspace.ts:797<br>src/controller/task-reorder-plan.ts:12<br>src/controller/task-reorder-plan.ts:35 |
| `?` | `src/controller/agentic-workspace.ts:244` | `async requireCanonicalStatus(status: string): Promise<string> {` | src/types/raw.d.ts:1 |
| `?` | `src/controller/agentic-workspace.ts:248` | `async normalizePriority(value: string \| undefined): Promise<string \| undefined> {` | src/types/raw.d.ts:1 |
| `?` | `src/controller/agentic-workspace.ts:252` | `async normalizeTaskType(value: string \| undefined): Promise<string \| undefined> {` | src/types/raw.d.ts:1 |
| `?` | `src/controller/agentic-workspace.ts:256` | `async normalizeProject(value: string \| undefined): Promise<string \| undefined> {` | src/types/raw.d.ts:1 |
| `resolveConfigValue` | `src/controller/init-helpers.ts:79` | `function resolveConfigValue<T>(override: T \| undefined, existing: T \| undefined, fallback: T): T {` | src/controller/init-helpers.ts:106<br>src/controller/init-helpers.ts:111<br>src/controller/init-helpers.ts:116<br>src/controller/init-helpers.ts:121<br>src/controller/init-helpers.ts:126<br>src/controller/init-helpers.ts:127 |
| `normalizeRemoteBranch` | `src/controller/task-loader.ts:213` | `function normalizeRemoteBranch(branch: string): string \| null {` | src/controller/task-loader.ts:249 |
| `normalizeLocalBranch` | `src/controller/task-loader.ts:227` | `function normalizeLocalBranch(branch: string, currentBranch: string): string \| null {` | src/controller/task-loader.ts:253 |
| `?` | `src/controller/task-mutation-service.ts:68` | `async requireCanonicalStatus(status: string): Promise<string> {` | src/types/raw.d.ts:1 |
| `?` | `src/controller/task-mutation-service.ts:186` | `async normalizePriority(value: string \| undefined): Promise<string \| undefined> {` | src/types/raw.d.ts:1 |
| `?` | `src/controller/task-mutation-service.ts:195` | `async normalizeTaskType(value: string \| undefined): Promise<string \| undefined> {` | src/types/raw.d.ts:1 |
| `?` | `src/controller/task-mutation-service.ts:203` | `async normalizeProject(value: string \| undefined): Promise<string \| undefined> {` | src/types/raw.d.ts:1 |
| `?` | `src/filesystem/git/operations.ts:139` | `private normalizeFilePaths(filePaths: readonly string[]): string[] {` | src/types/raw.d.ts:1 |
| `?` | `src/filesystem/git/operations.ts:666` | `private normalizeGitPath(pathValue: string): string {` | src/types/raw.d.ts:1 |
| `normalizeProjectAgenticWorkspaceDirectory` | `src/filesystem/paths/agentic-workspace-directory.ts:210` | `function normalizeProjectAgenticWorkspaceDirectory(value: string \| null \| undefined): string \| null {` | src/filesystem/paths/agentic-workspace-directory.ts:86<br>src/filesystem/paths/agentic-workspace-directory.ts:151<br>src/storage/file-system.ts:8<br>src/storage/file-system.ts:160<br>src/storage/file-system.ts:263<br>src/controller/init-helpers.ts:4<br>src/controller/init-helpers.ts:187 |
| `comparisonKey` | `src/lib/comparison-key.ts:1` | `function comparisonKey(value: string \| null \| undefined): string {` | src/model/task/status.ts:1<br>src/model/task/status.ts:11<br>src/model/task/config-values.ts:1<br>src/model/task/config-values.ts:9<br>src/model/task/config-values.ts:24<br>src/model/task/config-values.ts:25<br>src/model/task/config-values.ts:42<br>src/model/task/config-values.ts:58<br>+3 more |
| `slug` | `src/lib/slug.ts:1` | `function slug(value: string): string {` | src/renderer/opentui/agent-settings.ts:12<br>src/renderer/opentui/agent-settings.ts:1238<br>src/runtime/live/tmux/session-control.ts:25<br>src/filesystem/git/task-worktree.ts:4<br>src/filesystem/git/task-worktree.ts:29<br>src/filesystem/git/task-worktree.ts:34<br>src/filesystem/git/task-worktree.ts:83<br>src/filesystem/git/task-worktree.ts:105<br>+7 more |
| `normalizeStringList` | `src/lib/string-list.ts:3` | `function normalizeStringList(values: string[] \| undefined): string[] \| undefined {` | src/cli/features/tasks/wizard.ts:4<br>src/cli/features/tasks/wizard.ts:88<br>src/cli/features/tasks/wizard.ts:104<br>src/cli/features/tasks/edit.ts:5<br>src/cli/features/tasks/edit.ts:140<br>src/cli/task-edit-builder.ts:1<br>src/cli/task-edit-builder.ts:11<br>src/cli/task-edit-builder.ts:48<br>+14 more |
| `normalizeTimezoneOffset` | `src/lib/utc-date-display.ts:21` | `function normalizeTimezoneOffset(timezone: string): string {` | src/lib/utc-date-display.ts:37 |
| `normalizeUtcDateDisplay` | `src/lib/utc-date-display.ts:48` | `function normalizeUtcDateDisplay(value: string): string {` | src/lib/utc-date-display.ts:126 |
| `applyDateFormat` | `src/lib/utc-date-display.ts:81` | `function applyDateFormat(dateFormat: string, canonicalMatch: RegExpMatchArray): string \| null {` | src/lib/utc-date-display.ts:130 |
| `assigneeComparisonKey` | `src/model/task/assignee-filter.ts:1` | `function assigneeComparisonKey(value: string): string {` | src/cli/completions/data-providers.ts:3<br>src/cli/completions/data-providers.ts:75<br>src/model/task/assignee-filter.ts:10<br>src/model/task/task-search.ts:11<br>src/model/task/task-search.ts:141<br>src/model/task/task-search.ts:143<br>src/model/task/task-search.ts:147<br>src/model/task/task-update/collections.ts:3<br>+1 more |
| `normalizeAssignees` | `src/model/task/assignee-filter.ts:5` | `function normalizeAssignees(values: string[] \| undefined): string[] {` | src/cli/task-edit-builder.ts:2<br>src/cli/task-edit-builder.ts:60<br>src/storage/config-schema.ts:4<br>src/storage/config-schema.ts:102<br>src/storage/config-schema.ts:104<br>src/controller/task-creation-input.ts:3<br>src/controller/task-creation-input.ts:41<br>src/controller/task-creation-input.ts:92<br>+2 more |
| `normalizeConfiguredValues` | `src/model/task/config-values.ts:3` | `function normalizeConfiguredValues(configured: readonly string[]): string[] {` | src/model/task/task-type-config.ts:5<br>src/model/task/task-type-config.ts:16<br>src/model/task/project-config.ts:4<br>src/model/task/project-config.ts:20 |
| `resolveConfiguredValue` | `src/model/task/config-values.ts:20` | `function resolveConfiguredValue(` | src/model/task/task-type-config.ts:6<br>src/model/task/task-type-config.ts:25<br>src/model/task/config-values.ts:37<br>src/model/task/project-config.ts:5<br>src/model/task/project-config.ts:27 |
| `resolveConfiguredValues` | `src/model/task/config-values.ts:28` | `function resolveConfiguredValues(` | src/model/task/task-type-config.ts:7<br>src/model/task/task-type-config.ts:32<br>src/model/task/project-config.ts:6<br>src/model/task/project-config.ts:34 |
| `normalizeDueDate` | `src/model/task/due-date.ts:36` | `function normalizeDueDate(value: unknown, fieldName = "Due date"): string \| undefined {` | src/cli/features/tasks/wizard.ts:6<br>src/cli/features/tasks/wizard.ts:442<br>src/cli/features/tasks/wizard.ts:492<br>src/cli/features/tasks/wizard.ts:572<br>src/storage/markdown/task-record-schema.ts:3<br>src/storage/markdown/task-record-schema.ts:106<br>src/storage/markdown/record-schemas.ts:2<br>src/storage/markdown/record-schemas.ts:27<br>+7 more |
| `labelComparisonKey` | `src/model/task/label-filter.ts:4` | `function labelComparisonKey(label: string): string {` | src/renderer/opentui/filters.ts:11<br>src/renderer/opentui/filters.ts:140<br>src/renderer/opentui/filters.ts:276<br>src/renderer/opentui/filters.ts:337<br>src/cli/completions/data-providers.ts:4<br>src/cli/completions/data-providers.ts:58<br>src/model/task/task-search.ts:12<br>src/model/task/task-search.ts:151<br>+6 more |
| `normalizePriorityValue` | `src/model/task/priority-config.ts:14` | `function normalizePriorityValue(value: string \| null \| undefined): string \| undefined {` | src/renderer/opentui/task-detail-content.ts:4<br>src/renderer/opentui/task-detail-content.ts:45<br>src/cli/features/tasks/wizard.ts:7<br>src/cli/features/tasks/wizard.ts:152<br>src/cli/features/tasks/wizard.ts:489<br>src/storage/markdown/task-record-schema.ts:4<br>src/storage/markdown/task-record-schema.ts:119<br>src/model/task/task-search.ts:13<br>+6 more |
| `resolvePriorityValue` | `src/model/task/priority-config.ts:58` | `function resolvePriorityValue(` | src/cli/features/tasks/filter-normalizers.ts:2<br>src/cli/features/tasks/filter-normalizers.ts:28<br>src/cli/features/tasks/edit-options.ts:3<br>src/cli/features/tasks/edit-options.ts:63<br>src/controller/task-mutation-service.ts:6<br>src/controller/task-mutation-service.ts:189<br>src/controller/agentic-workspace.ts:10<br>src/controller/agentic-workspace.ts:275 |
| `resolveProjectValue` | `src/model/task/project-config.ts:23` | `function resolveProjectValue(` | src/cli/features/tasks/wizard.ts:8<br>src/cli/features/tasks/wizard.ts:207<br>src/cli/features/tasks/wizard.ts:491<br>src/controller/task-mutation-service.ts:11<br>src/controller/task-mutation-service.ts:208 |
| `resolveProjectValues` | `src/model/task/project-config.ts:30` | `function resolveProjectValues(` | src/renderer/opentui/board/models/filter.ts:1<br>src/renderer/opentui/board/models/filter.ts:87<br>src/cli/features/tasks/filter-normalizers.ts:7<br>src/cli/features/tasks/filter-normalizers.ts:55 |
| `statusComparisonKey` | `src/model/task/status.ts:10` | `function statusComparisonKey(status: string \| null \| undefined): string {` | src/renderer/formatters/status-icon.ts:4<br>src/renderer/formatters/status-icon.ts:27<br>src/renderer/opentui/workspace.ts:21<br>src/renderer/opentui/workspace.ts:296<br>src/renderer/opentui/board/policies/column-policy.ts:1<br>src/renderer/opentui/board/policies/column-policy.ts:14<br>src/renderer/opentui/board/policies/column-policy.ts:38<br>src/renderer/opentui/board/policies/column-policy.ts:48<br>+12 more |
| `statusLookupKey` | `src/model/task/status.ts:18` | `function statusLookupKey(status: string \| null \| undefined): string {` | src/cli/features/tasks/wizard.ts:9<br>src/cli/features/tasks/wizard.ts:73<br>src/cli/features/tasks/wizard.ts:76<br>src/model/task/status.ts:29<br>src/model/task/status.ts:30<br>src/model/task/status.ts:61<br>src/model/task/status.ts:64<br>src/model/task/status.ts:78<br>+2 more |
| `getCanonicalStatus` | `src/model/task/status.ts:54` | `async function getCanonicalStatus(` | src/cli/features/tasks/register.ts:7<br>src/cli/features/tasks/register.ts:102<br>src/cli/features/tasks/edit-options.ts:4<br>src/cli/features/tasks/edit-options.ts:50<br>src/controller/task-mutation-service.ts:13<br>src/controller/task-mutation-service.ts:69 |
| `getCanonicalStatuses` | `src/model/task/status.ts:69` | `async function getCanonicalStatuses(` | src/cli/features/tasks/filter-normalizers.ts:9<br>src/cli/features/tasks/filter-normalizers.ts:17<br>src/controller/agentic-workspace.ts:12<br>src/controller/agentic-workspace.ts:280 |
| `canonicalTaskIdSegments` | `src/model/task/task-id.ts:29` | `function canonicalTaskIdSegments(segments: readonly string[]): string[] \| null {` | src/model/task/prefix-config.ts:4<br>src/model/task/prefix-config.ts:188<br>src/model/task/prefix-config.ts:219<br>src/model/task/task-id.ts:38<br>src/model/task/task-path.ts:3<br>src/model/task/task-path.ts:53 |
| `canonicalTaskIdKey` | `src/model/task/task-id.ts:34` | `function canonicalTaskIdKey(value: string): string {` | src/storage/file-system.ts:19<br>src/storage/file-system.ts:476 |
| `taskIdKey` | `src/model/task/task-id.ts:59` | `function taskIdKey(value: string): string {` | src/filesystem/git/task-worktree.ts:5<br>src/filesystem/git/task-worktree.ts:35<br>src/filesystem/git/task-worktree.ts:39<br>src/filesystem/git/task-worktree.ts:89<br>src/storage/file-system.ts:19<br>src/storage/file-system.ts:513<br>src/storage/file-system.ts:558<br>src/storage/file-system.ts:575<br>+36 more |
| `normalizeTaskLifecyclePath` | `src/model/task/task-identity-index.ts:69` | `function normalizeTaskLifecyclePath(path: string, agenticWorkspaceDirectory: string): string {` | src/controller/task-loader.ts:15<br>src/controller/task-loader.ts:147<br>src/model/task/task-identity-index.ts:105 |
| `normalizeRecordPath` | `src/model/task/task-identity-index.ts:79` | `function normalizeRecordPath(record: TaskIdentityRecord, context: TaskIdentityPathContext): string {` | src/model/task/task-identity-index.ts:182<br>src/model/task/task-identity-index.ts:298 |
| `normalizeStatusSet` | `src/model/task/task-search.ts:188` | `function normalizeStatusSet(values: string \| string[] \| undefined): Set<string> {` | src/model/task/task-search.ts:115<br>src/model/task/task-search.ts:118 |
| `normalizeModifiedFileFilters` | `src/model/task/task-search.ts:197` | `function normalizeModifiedFileFilters(value?: string \| string[]): string[] \| undefined {` | src/model/task/task-search.ts:164 |
| `resolveTaskTypeValue` | `src/model/task/task-type-config.ts:21` | `function resolveTaskTypeValue(` | src/cli/features/tasks/wizard.ts:10<br>src/cli/features/tasks/wizard.ts:200<br>src/cli/features/tasks/wizard.ts:490<br>src/controller/task-mutation-service.ts:18<br>src/controller/task-mutation-service.ts:198 |
| `resolveTaskTypeValues` | `src/model/task/task-type-config.ts:28` | `function resolveTaskTypeValues(` | src/renderer/opentui/board/models/filter.ts:3<br>src/renderer/opentui/board/models/filter.ts:86<br>src/cli/features/tasks/filter-normalizers.ts:10<br>src/cli/features/tasks/filter-normalizers.ts:41 |
| `normalizePublicDate` | `src/renderer/formatters/json-output.ts:80` | `function normalizePublicDate(value: string \| undefined): string \| null {` | src/renderer/formatters/json-output.ts:110<br>src/renderer/formatters/json-output.ts:111<br>src/renderer/formatters/json-output.ts:112 |
| `value` | `src/renderer/opentui/board/models/filter.ts:23` | `get value(): Readonly<NormalizedBoardFilters> {` | src/renderer/formatters/json-output.ts:72<br>src/renderer/formatters/json-output.ts:73<br>src/renderer/formatters/json-output.ts:76<br>src/renderer/formatters/json-output.ts:77<br>src/renderer/formatters/json-output.ts:80<br>src/renderer/formatters/json-output.ts:81<br>src/renderer/formatters/json-output.ts:82<br>src/renderer/formatters/json-output.ts:84<br>+706 more |
| `normalizeBoardFilters` | `src/renderer/opentui/board/models/filter.ts:78` | `function normalizeBoardFilters(` | src/renderer/opentui/board/models/filter.ts:20<br>src/renderer/opentui/board/models/filter.ts:34 |
| `normalizeConfiguredStatuses` | `src/renderer/opentui/board/policies/column-policy.ts:5` | `function normalizeConfiguredStatuses(statuses: string[]): { ordered: string[]; canonicalByKey: Map<string, string> } {` | src/renderer/opentui/board/policies/column-policy.ts:28 |
| `normalizeValues` | `src/renderer/opentui/filters.ts:123` | `function normalizeValues(values: readonly string[] \| undefined): string[] {` | src/renderer/opentui/filters.ts:151<br>src/renderer/opentui/filters.ts:152<br>src/renderer/opentui/filters.ts:153<br>src/renderer/opentui/filters.ts:259 |
| `normalizeLabelValues` | `src/renderer/opentui/filters.ts:135` | `function normalizeLabelValues(values: readonly string[] \| undefined): string[] {` | src/renderer/opentui/filters.ts:155<br>src/renderer/opentui/filters.ts:259 |
| `normalizeFilters` | `src/renderer/opentui/filters.ts:148` | `function normalizeFilters(filters: Partial<OpenTuiFilterState>): OpenTuiFilterState {` | src/renderer/opentui/filters.ts:229 |
| `keyFromCanonical` | `src/renderer/opentui/keybindings.ts:46` | `function keyFromCanonical(name: string): ShortcutKey {` | src/renderer/opentui/keybindings.ts:81 |
| `canonicalShortcut` | `src/renderer/opentui/keybindings.ts:72` | `function canonicalShortcut<Name extends string>(` | src/renderer/opentui/keybindings.ts:96<br>src/renderer/opentui/keybindings.ts:97<br>src/renderer/opentui/keybindings.ts:98<br>src/renderer/opentui/keybindings.ts:99<br>src/renderer/opentui/keybindings.ts:100<br>src/renderer/opentui/keybindings.ts:101<br>src/renderer/opentui/keybindings.ts:102<br>src/renderer/opentui/keybindings.ts:103<br>+114 more |
| `normalizedKey` | `src/renderer/opentui/keybindings.ts:311` | `function normalizedKey(key: ShortcutKey): ShortcutKey {` | src/renderer/opentui/keybindings.ts:321<br>src/renderer/opentui/keybindings.ts:322<br>src/renderer/opentui/keybindings.ts:402 |
| `sanitizeLaunchPreset` | `src/runtime/agents/claude.ts:98` | `sanitizeLaunchPreset(preset: AgentPreset): AgentPreset {` | src/runtime/agents/agent.ts:134<br>src/runtime/agents/opencode-v1.ts:76<br>src/runtime/agents/opencode-v2.ts:139<br>src/runtime/agents/pi.ts:88<br>src/runtime/session-launch.ts:133 |
| `sanitizeLaunchPreset` | `src/runtime/agents/opencode-v1.ts:76` | `sanitizeLaunchPreset(preset: AgentPreset): AgentPreset {` | src/runtime/agents/agent.ts:134<br>src/runtime/agents/opencode-v2.ts:139<br>src/runtime/agents/pi.ts:88<br>src/runtime/agents/claude.ts:98<br>src/runtime/session-launch.ts:133 |
| `sanitizeLaunchPreset` | `src/runtime/agents/opencode-v2.ts:139` | `sanitizeLaunchPreset(preset: AgentPreset): AgentPreset {` | src/runtime/agents/agent.ts:134<br>src/runtime/agents/opencode-v1.ts:76<br>src/runtime/agents/pi.ts:88<br>src/runtime/agents/claude.ts:98<br>src/runtime/session-launch.ts:133 |
| `sanitizeLaunchPreset` | `src/runtime/agents/pi.ts:88` | `sanitizeLaunchPreset(` | src/runtime/agents/agent.ts:134<br>src/runtime/agents/opencode-v1.ts:76<br>src/runtime/agents/opencode-v2.ts:139<br>src/runtime/agents/claude.ts:98<br>src/runtime/session-launch.ts:133 |
| `canonicalModelId` | `src/runtime/agents/profile.ts:74` | `function canonicalModelId(id: string): string {` | src/runtime/agents/profile.ts:83 |
| `deduplicateModels` | `src/runtime/agents/profile.ts:78` | `function deduplicateModels(models: AgentModel[]): AgentModel[] {` | src/runtime/agents/profile.ts:265 |
| `sanitizeProfilePreset` | `src/runtime/agents/profile.ts:93` | `function sanitizeProfilePreset(preset: AgentPreset): AgentPreset {` | src/runtime/agents/opencode-v1.ts:22<br>src/runtime/agents/opencode-v1.ts:77<br>src/runtime/agents/opencode-v1.ts:89<br>src/runtime/agents/opencode-v2.ts:21<br>src/runtime/agents/opencode-v2.ts:140<br>src/runtime/agents/opencode-v2.ts:150<br>src/runtime/agents/claude.ts:24<br>src/runtime/agents/claude.ts:99 |
| `sanitizeLaunchEnvironment` | `src/runtime/session-launch.ts:95` | `function sanitizeLaunchEnvironment(environment: Record<string, string>): Record<string, string> {` | src/runtime/session-launch.ts:110<br>src/runtime/session-launch.ts:232<br>src/runtime/session-launch.ts:317 |
| `canonicalDirectoryTarget` | `src/runtime/sessions.ts:149` | `async function canonicalDirectoryTarget(path: string): Promise<string> {` | src/runtime/sessions.ts:362<br>src/runtime/sessions.ts:409<br>src/runtime/sessions.ts:410<br>src/runtime/sessions.ts:412 |
| `normalizeAliases` | `src/storage/config-schema.ts:89` | `function normalizeAliases(value: unknown): unknown {` | src/storage/config-schema.ts:107 |
| `sanitizeLockKey` | `src/storage/file-system.ts:105` | `function sanitizeLockKey(value: string): string {` | src/storage/file-system.ts:476<br>src/storage/file-system.ts:558 |
| `?` | `src/storage/file-system.ts:621` | `private async resolveCanonicalExistingRecord(` | src/types/raw.d.ts:1 |
| `?` | `src/storage/task-artifact-repository.ts:119` | `private canonicalId(taskId: string): string {` | src/types/raw.d.ts:1 |
| `canonicalViewLock` | `src/storage/view-state-store.ts:69` | `async function canonicalViewLock(projectRoot: string): Promise<string \| undefined> {` | src/storage/view-state-store.ts:250 |
| `canonicalTask` | `src/storage/watchers/task-watcher.ts:82` | `function canonicalTask(task: Task): Task {` | src/storage/watchers/task-watcher.ts:161 |

## Appendix B — Complete regex site inventory

Generated from the TypeScript AST (ast-grep) over production `src/**/*.ts`. Test files (`src/test/**`, `*.test.ts`, `*.spec.ts`) excluded. Every regex literal and every `new RegExp(...)` site is listed. `owner` is the innermost enclosing function/method/arrow, or `<module>` for a module-level constant.

Totals: 159 sites, 108 distinct patterns, 59 files.

### `src/cli/commands/agent-workspace.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 66 | `registerAgentWorkspaceCommands` | `^[^/]+\/[^/]+$` | `/^[^/]+\/[^/]+$/` |

### `src/cli/commands/help-schema.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 124 | `renderConfiguredTaskIds` | `\{\{TASK_TYPE:(\d+)\}\}` | `/\{\{TASK_TYPE:(\d+)\}\}/g` |
| 127 | `renderConfiguredTaskIds` | `\{\{TASK_ID:(\d+(?:\.\d+)*)\}\}` | `/\{\{TASK_ID:(\d+(?:\.\d+)*)\}\}/g` |
| 128 | `renderConfiguredTaskIds` | `\b(?:BACK\|TASK)-(\d+(?:\.\d+)*)\b` | `/\b(?:BACK\|TASK)-(\d+(?:\.\d+)*)\b/g` |

### `src/cli/features/tasks/wizard.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 85 | `parseListInput` | `,\|\r?\n` | `/,\|\r?\n/g` |

### `src/cli/list-window.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 63 | `parsePositiveIntegerOption` | `^[1-9]\d*$` | `/^[1-9]\d*$/` |
| 95 | `parseListWindow` | `^\d+$` | `/^\d+$/` |
| 126 | `quoteShellArgument` | `^[\w@+:,./-]+$` | `/^[\w@+:,./-]+$/` |

### `src/cli/register.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 77 | `async function runCli(` | `^(xterm\|dumb\|ansi\|vt100)$` | `/^(xterm\|dumb\|ansi\|vt100)$/i` |
| 86 | `async function runCli(` | `node_modules[\\/]+agentic-workspace-(darwin\|linux\|windows)-[^\\/]+[\\/]+agentic-workspace(\.exe)?$` | `/node_modules[\\/]+agentic-workspace-(darwin\|linux\|windows)-[^\\/]+[\\/]+agentic-workspace(\.exe)?$/` |

### `src/controller/task-creation-input.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 22 | `generatedTaskTitle` | `-(\d+(?:\.\d+)*)$` | `/-(\d+(?:\.\d+)*)$/` |

### `src/controller/task-loader.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 84 | `getTaskRecordId` | `^\.\/` | `/^\.\//` |
| 85 | `getTaskRecordId` | `^\/+\|\/+$` | `/^\/+\|\/+$/g` |
| 142 | `logicalTaskPath` | `^\.\/` | `/^\.\//` |
| 143 | `logicalTaskPath` | `^\/+\|\/+$` | `/^\/+\|\/+$/g` |
| 146 | `logicalTaskPath` | `^\.\/` | `/^\.\//` |
| 216 | `normalizeRemoteBranch` | `^refs\/remotes\/` | `/^refs\/remotes\//` |
| 242 | `isRemoteBranch` | `^refs\/remotes\/` | `/^refs\/remotes\//` |
| 281 | `async function hydrateTasks(winners: HydrationCa` | `^origin\/` | `/^origin\//` |

### `src/filesystem/git/operations.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 667 | `private normalizeGitPath(pathValue: string): str` | `\\` | `/\\/g` |

### `src/filesystem/git/task-worktree.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 33 | `taskWorktreePath` | `[^A-Za-z0-9._-]+` | `/[^A-Za-z0-9._-]+/g` |
| 115 | `async function ensureTaskWorktree(projectRoot: s` | `already exists` | `/already exists/i` |

### `src/filesystem/paths/agentic-workspace-directory.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 215 | `normalizeProjectAgenticWorkspaceDirectory` | `^(?:[a-zA-Z]:)?[\\/]` | `/^(?:[a-zA-Z]:)?[\\/]/` |
| 219 | `normalizeProjectAgenticWorkspaceDirectory` | `\\` | `/\\/g` |
| 221 | `normalizeProjectAgenticWorkspaceDirectory` | `\/+$` | `/\/+$/g` |

### `src/lib/debug-log.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 118 | `formatFields` | `[\s"]` | `/[\s"]/` |

### `src/lib/process-tree.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 26 | `<module>` | `^(?:Sun\|Mon\|Tue\|Wed\|Thu\|Fri\|Sat)\s+(?:Jan\|Feb\|Mar\|Apr\|May\|Jun\|Jul\|Aug\|Sep\|Oct\|Nov\|Dec)\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4}$` | `/^(?:Sun\|Mon\|Tue\|Wed\|Thu\|Fri\|Sat)\s+(?:Jan\|Feb\|Mar\|Apr\|May\|Jun\|Jul\|Aug\|Sep\|Oct\|Nov\|Dec)\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4}$/` |
| 33 | `parseProcessTable` | `\r?\n` | `/\r?\n/` |
| 35 | `parseProcessTable` | `^\s*(\d+)\s+(\d+)\s+(\d+)\s+(-?\d+)\s+(\S+)\s+(.+?)\s*$` | `/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(-?\d+)\s+(\S+)\s+(.+?)\s*$/` |
| 48 | `parseProcessTable` | `\s+` | `/\s+/g` |
| 53 | `parseProcessTable` | `\s+` | `/\s+/g` |
| 70 | `normalizeStarted` | `\s+` | `/\s+/g` |
| 256 | `processIdentity` | `^(\d+)\s+(\S+)\s+(.+)$` | `/^(\d+)\s+(\S+)\s+(.+)$/` |
| 258 | `processIdentity` | `\s+` | `/\s+/g` |
| 343 | `isMissingTmuxTarget` | `no server running\|can't find pane\|\(no such file or directory\)\|\(connection refused\)` | `/no server running\|can't find pane\|\(no such file or directory\)\|\(connection refused\)/i` |
| 375 | `paneRootState` | `\s+` | `/\s+/` |

### `src/lib/regex.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 2 | `escapeRegex` | `[.*+?^${}()\|[\]\\]` | `/[.*+?^${}()\|[\]\\]/g` |

### `src/lib/slug.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 4 | `slug` | `[^a-z0-9]+` | `/[^a-z0-9]+/g` |
| 5 | `slug` | `^-\|-$` | `/^-\|-$/g` |

### `src/lib/utc-date-display.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 11 | `<module>` | `^\d{4}-\d{2}-\d{2}$` | `/^\d{4}-\d{2}-\d{2}$/` |
| 12 | `<module>` | `^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$` | `/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/` |
| 14 | `<module>` | `^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z\|[+-]\d{2}:?\d{2})$` | `/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z\|[+-]\d{2}:?\d{2})$/i` |
| 15 | `<module>` | `\s+\(UTC\)$` | `/\s+\(UTC\)$/i` |
| 22 | `normalizeTimezoneOffset` | `^[+-]\d{4}$` | `/^[+-]\d{4}$/` |
| 69 | `<module>` | `^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$` | `/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/` |
| 88 | `applyDateFormat` | `\s` | `/\s/` |
| 105 | `applyDateFormat` | `yyyy\|mm\|dd` | `/yyyy\|mm\|dd/gi` |
| 118 | `applyDateFormat` | `hh\|mm` | `/hh\|mm/gi` |

### `src/model/session/agent-config-schema.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 5 | `<module>` | `^(?!__proto__$\|prototype$\|constructor$)[A-Za-z_][A-Za-z0-9_-]*$` | `/^(?!__proto__$\|prototype$\|constructor$)[A-Za-z_][A-Za-z0-9_-]*$/` |
| 6 | `<module>` | `^[A-Za-z_][A-Za-z0-9_]*$` | `/^[A-Za-z_][A-Za-z0-9_]*$/` |
| 7 | `<module>` | `^(?!__proto__$\|prototype$\|constructor$)[a-z][a-z0-9-]*$` | `/^(?!__proto__$\|prototype$\|constructor$)[a-z][a-z0-9-]*$/` |
| 17 | `validateArtifactPath` | `^[A-Za-z]:` | `/^[A-Za-z]:/` |
| 133 | `<arrow>` | `[\0\r\n]` | `/[\0\r\n]/` |

### `src/model/session/session-utils.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 60 | `<module>` | `^agentic-workspace-[a-z0-9-]+-[0-9a-f]{8}$` | `/^agentic-workspace-[a-z0-9-]+-[0-9a-f]{8}$/` |

### `src/model/task/assignee-filter.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 2 | `assigneeComparisonKey` | `^@` | `/^@/` |
| 2 | `assigneeComparisonKey` | `\s+` | `/\s+/g` |

### `src/model/task/due-date.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 11 | `<module>` | `^(\d{4})-(\d{2})-(\d{2})(?:[ T](?:[01]\d\|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z\|[+-](?:(?:0\d\|1[0-3]):?[0-5]\d\|14:?00))?)?$` | `/^(\d{4})-(\d{2})-(\d{2})(?:[ T](?:[01]\d\|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z\|[+-](?:(?:0\d\|1[0-3]):?[0-5]\d\|14:?00))?)?$/` |

### `src/model/task/prefix-config.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 49 | `getTaskPrefixError` | `^[a-zA-Z]+$` | `/^[a-zA-Z]+$/` |
| 105 | `hasPrefix` | `new RegExp(`^${escapeRegex(prefix)}-`, "i")` | `new RegExp(`^${escapeRegex(prefix)}-`, "i")` |
| 123 | `extractAnyPrefix` | `^([a-zA-Z]+)-` | `/^([a-zA-Z]+)-/` |

### `src/model/task/priority-config.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 18 | `normalizePriorityValue` | `\s+` | `/\s+/g` |
| 34 | `getPriorityOptions` | `\s+` | `/\s+/g` |

### `src/model/task/status.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 19 | `statusLookupKey` | `\s+` | `/\s+/g` |

### `src/model/task/task-id.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 4 | `<module>` | `new RegExp(`^([A-Za-z]+)-(${TASK_ID_BODY_PATTERN})$`)` | `new RegExp(`^([A-Za-z]+)-(${TASK_ID_BODY_PATTERN})$`)` |
| 21 | `taskIdBody` | `^[A-Za-z]+$` | `/^[A-Za-z]+$/` |
| 26 | `taskIdRegex` | `new RegExp(`^${escapeRegex(prefix)}-(${TASK_ID_BODY_PATTERN})`, "i")` | `new RegExp(`^${escapeRegex(prefix)}-(${TASK_ID_BODY_PATTERN})`, "i")` |
| 31 | `canonicalTaskIdSegments` | `^0+` | `/^0+/` |
| 36 | `canonicalTaskIdKey` | `^([a-z]+-)?(\d+(?:\.\d+)*)$` | `/^([a-z]+-)?(\d+(?:\.\d+)*)$/` |
| 43 | `isNumericTaskIdSegment` | `^\d+$` | `/^\d+$/` |

### `src/model/task/task-identity-index.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 59 | `toPosixPath` | `^\.\/` | `/^\.\//` |
| 64 | `joinPosix` | `^\/+\|\/+$` | `/^\/+\|\/+$/g` |

### `src/model/task/task-ordering.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 18 | `parseId` | `(\d+)$` | `/(\d+)$/` |

### `src/renderer/formatters/code-path.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 8 | `<module>` | <code>([^&#96;]+)</code> | <code>/([^&#96;]+)/g</code> |
| 10 | `<module>` | `\.[a-zA-Z0-9]+$` | `/\.[a-zA-Z0-9]+$/` |
| 12 | `<module>` | `[/\\]` | `/[/\\]/` |

### `src/renderer/formatters/json-output.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 82 | `normalizePublicDate` | `^\d{4}-\d{2}-\d{2}$` | `/^\d{4}-\d{2}-\d{2}$/` |
| 84 | `normalizePublicDate` | `^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?(?:\.\d+)?Z?$` | `/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?(?:\.\d+)?Z?$/` |
| 91 | `normalizePublicDate` | `\.\d{3}Z$` | `/\.\d{3}Z$/` |

### `src/renderer/opentui/agent-settings.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 31 | `<module>` | `^[A-Za-z_][A-Za-z0-9_]*$` | `/^[A-Za-z_][A-Za-z0-9_]*$/` |
| 109 | `parseModeArtifactDefinitions` | `^[A-Za-z]:` | `/^[A-Za-z]:/` |
| 1235 | `mountOpenTuiAgentSettings` | `[\0\r\n]` | `/[\0\r\n]/` |

### `src/renderer/opentui/filters.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 822 | `mountOpenTuiHelpOverlay` | `\p{Cc}` | `/\p{Cc}/u` |
| 843 | `mountOpenTuiHelpOverlay` | `\p{Cc}` | `/\p{Cc}/gu` |

### `src/renderer/opentui/keybindings.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 51 | `keyFromCanonical` | `^(C\|S\|M\|A\|Alt\|Option)-(.*)$` | `/^(C\|S\|M\|A\|Alt\|Option)-(.*)$/i` |
| 58 | `keyFromCanonical` | `^(C\|S\|M\|A\|Alt\|Option)-(.*)$` | `/^(C\|S\|M\|A\|Alt\|Option)-(.*)$/i` |
| 382 | `shortcutKeyFromEvent` | `^(shift\|ctrl\|control\|alt\|meta\|super\|hyper)$` | `/^(shift\|ctrl\|control\|alt\|meta\|super\|hyper)$/i` |

### `src/renderer/opentui/keymap.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 176 | `formatKey` | `^(?:M\|A\|Alt\|Option)-(.*)$` | `/^(?:M\|A\|Alt\|Option)-(.*)$/i` |

### `src/renderer/opentui/mode-settings-draft.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 4 | `<module>` | `^(?!__proto__$\|prototype$\|constructor$)[a-z][a-z0-9-]*$` | `/^(?!__proto__$\|prototype$\|constructor$)[a-z][a-z0-9-]*$/` |
| 73 | `validate` | `[\0\r\n]` | `/[\0\r\n]/` |
| 180 | `validateArtifact` | `^[A-Za-z]:` | `/^[A-Za-z]:/` |

### `src/renderer/opentui/task-artifact-view.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 191 | `approveCurrentVersion` | `changed since it was reviewed` | `/changed since it was reviewed/i` |

### `src/renderer/opentui/task-detail-content.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 74 | `transformCodePathLine` | <code>[^&#96;]+</code> | <code>/[^&#96;]+/g</code> |
| 89 | `transformCodePathLine` | `\s+` | `/\s+/g` |

### `src/runtime/agent-status-probe.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 87 | `createActivityProbe` | `\s+` | `/\s+/` |

### `src/runtime/agents/agent.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 171 | `appendArguments` | `[\|;&\n]` | `/[\|;&\n]/` |

### `src/runtime/agents/chrome-rules.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 5 | `<module>` | `esc to interrupt\|ctrl\+c to interrupt\|esc to cancel` | `/esc to interrupt\|ctrl\+c to interrupt\|esc to cancel/i` |
| 8 | `<module>` | `(?:^\|\n)\s*(?:error\|api error\|fatal):` | `/(?:^\|\n)\s*(?:error\|api error\|fatal):/i` |
| 13 | `<module>` | `do you want to proceed\?\|❯\s*1\.\s*yes\|waiting for your (?:input\|approval)` | `/do you want to proceed\?\|❯\s*1\.\s*yes\|waiting for your (?:input\|approval)/i` |
| 15 | `<module>` | `(?:^\|\n)\s*[>›]\s*$` | `/(?:^\|\n)\s*[>›]\s*$/m` |
| 20 | `<module>` | `permission (?:required\|asked)\|allow this tool` | `/permission (?:required\|asked)\|allow this tool/i` |
| 22 | `<module>` | `(?:^\|\n)\s*[>›]\s*$` | `/(?:^\|\n)\s*[>›]\s*$/m` |
| 29 | `<module>` | `(?:^\|\n)\s*[>›]\s*$` | `/(?:^\|\n)\s*[>›]\s*$/m` |

### `src/runtime/agents/hook-script.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 21 | `hookScript` | `^0 # ` | `/^0 # /` |

### `src/runtime/agents/opencode-v1.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 25 | `appendArguments` | `[\|;&\n]` | `/[\|;&\n]/` |

### `src/runtime/agents/opencode-v2.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 24 | `appendArguments` | `[\|;&\n]` | `/[\|;&\n]/` |
| 101 | `async function lookupNativeSession(` | `^ses_[A-Za-z0-9_-]+$` | `/^ses_[A-Za-z0-9_-]+$/` |
| 176 | `askCommand` | `^ses_[A-Za-z0-9_-]+$` | `/^ses_[A-Za-z0-9_-]+$/` |

### `src/runtime/agents/opencode-version.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 5 | `openCodeBootstrapForVersion` | `^opencode\s+` | `/^opencode\s+/i` |
| 6 | `openCodeBootstrapForVersion` | `\s` | `/\s/` |

### `src/runtime/agents/profile.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 9 | `<module>` | `^[\p{L}\p{N}][\p{L}\p{N}._:/+@-]{0,255}$` | `/^[\p{L}\p{N}][\p{L}\p{N}._:/+@-]{0,255}$/u` |
| 13 | `commandArguments` | <code>[&#124;;&amp;$&lt;&gt;\n\r]</code> | <code>/[&#124;;&amp;$&lt;&gt;\n\r]/</code> |
| 36 | `commandArguments` | `\s` | `/\s/` |
| 252 | `async function discoverModels(` | `\r?\n` | `/\r?\n/` |
| 255 | `async function discoverModels(` | `\s+` | `/\s+/` |
| 261 | `async function discoverModels(` | `\r?\n` | `/\r?\n/` |

### `src/runtime/completion-supervisor-resources.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 70 | `async function cleanupPreparedLaunchResources(` | `^[a-f0-9]{64}$` | `/^[a-f0-9]{64}$/` |

### `src/runtime/live/tmux/pane-snapshot.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 36 | `capturePaneSnapshot` | `\s+` | `/\s+/` |
| 42 | `capturePaneSnapshot` | `\r?\n$` | `/\r?\n$/` |

### `src/runtime/live/tmux/session-control.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 32 | `sessionAbsent` | `can't find session\|no sessions` | `/can't find session\|no sessions/i` |

### `src/runtime/live/tmux/vt-channel.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 229 | `parseTmuxVersion` | `(\d+)\.(\d+)(?:\.(\d+))?` | `/(\d+)\.(\d+)(?:\.(\d+))?/` |
| 366 | `readOption` | `\n$` | `/\n$/` |
| 381 | `claimPipeLease` | `[^a-zA-Z0-9_-]` | `/[^a-zA-Z0-9_-]/g` |
| 416 | `releaseLease` | `[^a-zA-Z0-9_-]` | `/[^a-zA-Z0-9_-]/g` |
| 774 | `createVtChannel` | `\s+` | `/\s+/` |

### `src/runtime/session-process.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 194 | `isMissingTmuxTarget` | `^no server running(?: on .+)?$` | `/^no server running(?: on .+)?$/i` |
| 215 | `isUnavailableTmuxServer` | `^error connecting to\s+\S+` | `/^error connecting to\s+\S+/i` |
| 279 | `create` | `^%\d+$` | `/^%\d+$/` |
| 519 | `exactPane` | `^%\d+$` | `/^%\d+$/` |

### `src/runtime/sessions.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 375 | `private async validateOwnedSessionSidecars(sessi` | `^[A-Za-z0-9._-]+$` | `/^[A-Za-z0-9._-]+$/` |
| 433 | `forgetTaskSessions` | `^[A-Za-z0-9._-]+$` | `/^[A-Za-z0-9._-]+$/` |

### `src/runtime/workspace-context.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 139 | `parseWorkspaceContext` | `^[a-z0-9][a-z0-9_-]*$` | `/^[a-z0-9][a-z0-9_-]*$/` |
| 141 | `parseWorkspaceContext` | `^[A-Za-z0-9._-]+$` | `/^[A-Za-z0-9._-]+$/` |
| 155 | `parseWorkspaceContext` | `^%[0-9]+$` | `/^%[0-9]+$/` |
| 222 | `<module>` | `^[A-Za-z0-9._-]+$` | `/^[A-Za-z0-9._-]+$/` |

### `src/storage/config-codec.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 7 | `configValueError` | `\.$` | `/\.$/` |

### `src/storage/config-schema.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 49 | `<module>` | `^[a-zA-Z]+$` | `/^[a-zA-Z]+$/` |

### `src/storage/file-system.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 109 | `sanitizeLockKey` | `[^a-z0-9._-]+` | `/[^a-z0-9._-]+/g` |
| 110 | `sanitizeLockKey` | `^\.+` | `/^\.+/` |
| 510 | `allocateTaskId` | `new RegExp(`^${escapeRegex(canonicalPrefix)}-(\\d+)$`)` | `new RegExp(`^${escapeRegex(canonicalPrefix)}-(\\d+)$`)` |

### `src/storage/markdown/schema.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 37 | `<module>` | `^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?$` | `/^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?$/` |

### `src/storage/milestones.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 13 | `parseMilestoneId` | `^m-(\d+)$` | `/^m-(\d+)$/i` |
| 25 | `filename` | `[<>:"/\\\|?*]` | `/[<>:"/\\\|?*]/g` |
| 26 | `filename` | `\s+` | `/\s+/g` |

### `src/storage/session-store.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 36 | `<module>` | `^ses_[A-Za-z0-9][A-Za-z0-9_-]*$` | `/^ses_[A-Za-z0-9][A-Za-z0-9_-]*$/` |
| 149 | `async function hasStoreEvidence(root: string): P` | `\.(claim\|mode\|lock\|log\|md\|native-session-id)$` | `/\.(claim\|mode\|lock\|log\|md\|native-session-id)$/` |

### `src/storage/task-artifact-repository.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 14 | `<module>` | `^[a-f0-9]{64}$` | `/^[a-f0-9]{64}$/` |
| 27 | `validateTaskArtifactPath` | `^[A-Za-z]:` | `/^[A-Za-z]:/` |

### `src/storage/task-repository.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 20 | `warnUnparseableTaskFile` | `[\r\n]+` | `/[\r\n]+/g` |

### `src/storage/watchers/task-watcher.ts`

| Line | Owner | Pattern | Source |
|---:|---|---|---|
| 47 | `classifyTaskWatchEvent` | `[\\/]` | `/[\\/]/` |
| 66 | `classifyTaskWatchEvent` | `\.(?:md\|markdown\|txt\|text)$` | `/\.(?:md\|markdown\|txt\|text)$/i` |
| 345 | `watchTaskRecords` | `^[/\\]+` | `/^[/\\]+/` |
