# BACK-20 — Minimal task model + agent summary + warming-up status

## Settled decisions (2026-10-08, review with user)

### Task content model
A task's content fields are exactly:

- **title** — user-facing one-liner.
- **description** — user-defined. The agent adjusts it so a user reading only the description sees a short, up-to-date, user-friendly overview of what the task is about.
- **agentSummary** (NEW) — the agent's detailed working state: requirements, findings, decisions, root causes, progress, blockers. This is the role the old `description` field played. Never shown in the TUI; agents read/write it via CLI/MCP.

Keep unchanged: status, type, priority, project, assignee, labels, milestone, dependencies, references, documentation, modifiedFiles, due date, ordinal, onStatusChange, agentConfiguration (preset/worktree/yolo).

Remove ENTIRELY (model + markdown + CLI + MCP + wizard + formatters + TUI + docs + tests), with no legacy shims or back-compat:

- acceptance criteria (`acceptance_criteria`, `AcceptanceCriterion`, AC checklist, whole `--ac` family)
- Definition of Done (`definition_of_done`, whole `--dod` family, config DoD defaults, `--no-dod-defaults`)
- implementation plan (`implementation_plan`, `--plan` / `--append-plan`)
- implementation notes (`implementation_notes`, `--notes` / `--append-notes`)
- final summary (`final_summary`, `--final-summary` / `--append-final-summary` / `--clear-final-summary`)
- comments (`comments` / `TaskComment`, `--comment` / `--comment-author`)

### New field
- Name `agentSummary`; frontmatter key `agent_summary`.
- CLI `--agent-summary` (set/replace) plus append/clear if simple.
- MCP `agentSummary` on task create/edit.
- Visible in `agentic-workspace task view --plain` / `--json` and MCP so agents can read it; hidden from the OpenTUI workspace/TUI.

### TUI cards
- **Create Task card** keeps: title, description, status, type, priority, project, agent preset, worktree-per-task, YOLO. (Due date already removed in dd00d061.)
- **Edit Task card** shows: title, description, type, priority. (Drops implementation plan/notes/final summary; acceptance criteria already removed.)

### Agent instructions
Rewrite so agents maintain both fields correctly:
- description = short, user-friendly, up-to-date overview of the task.
- agentSummary = detailed working state (requirements/findings/decisions/progress/blockers).

Update `src/agent-workspace/task-skill.ts`, `src/guidelines/cli-instructions/{task-creation,task-execution,task-finalization}.md`, and the MCP mirrors.

### Delete
`src/guidelines/agent-guidelines.md` (807-line legacy duplicate; only consumer is `src/test/agent-instructions.test.ts`). Drop the `AGENT_GUIDELINES` export and its dedicated tests, folding still-relevant shell-quoting guidance (BACK-431/#595 multi-line, BACK-270 backticks) into the CLI/MCP guides.

### One-time migration (manual, throwaway)
Run once over `agentic-workspace/tasks/**/*.md` before the fields disappear from the parser:
- For each task, concatenate the removed fields' content into a new `agent_summary` frontmatter value, separated by newlines (use section headers, e.g. `## Acceptance Criteria`, `## Definition of Done`, `## Implementation Plan`, `## Implementation Notes`, `## Final Summary`, `## Comments`, each only when non-empty; render AC/DoD items as `- [x] text`, comments as `author: body`).
- Remove the old frontmatter keys.
- Leave `description` as-is.
- Do NOT ship a permanent migration command; delete the script after running.

### Part 2 — agent "warming up" status
- In `src/ui/opentui/workspace.ts` redraw (~:461-476): the agent header's status segment must render `warming up` while `liveAgent?.status === "starting"` (instead of the derived activity such as `idle`), i.e. `Agent session · <label> · warming up`.
- Remove the centered body text `Agent is warming up...`.
- Update `docs/opentui-workspace-spec.md:12,26` and `src/guidelines/cli-instructions/agent-workspace.md:6`.
- Add a layout test with `liveAgent.status = "starting"` asserting the header text.

### Part 1 — Option+Left/Right word motion (DONE)
Implemented in dd00d061: `WorkspaceAgentTerminal.encodeKey` forwards raw legacy Meta and SS3 arrow bytes. No further work.

## Work packages (primary files)

1. **Types/model** — `src/types/index.ts` (drop removed fields + `TaskComment`; add `agentSummary`), `src/types/task-edit-args.ts`, `src/core/task-creation-input.ts`, `src/core/task-mutation-service.ts`, `src/core/agentic-workspace.ts`, `src/core/task-update/content.ts`, `src/core/task-update/checklists.ts`.
2. **Markdown** — `src/markdown/schema.ts` (drop the six keys, add `AGENT_SUMMARY`), `src/markdown/parser.ts`, `src/markdown/serializer.ts`, `src/markdown/legacy-task-migration.ts`.
3. **CLI** — `src/cli/features/tasks/{edit,edit-options,input,wizard,create,register}.ts`, `src/cli/features/task/edit-fields.ts`, `src/cli/features/drafts/register.ts`, config DoD defaults.
4. **MCP** — `src/mcp/tools/tasks/index.ts` + schemas; guide text in `src/mcp/workflow-guides.ts`.
5. **TUI** — `src/ui/opentui/workspace-controller.ts` (`WorkspaceEditorField` + `editorFields()` -> title/description/type/priority; keep the draft-merge and drop removed imports), `src/ui/opentui/task-composer.ts` (unchanged options), `src/ui/opentui/task-actions.ts` (metadata review); remove `src/ui/checklist.ts`, `src/ui/task-labels.ts`, `src/ui/task-viewer/detail-content.ts` if they only serve removed fields.
6. **Formatters** — `src/formatters/task-plain-text.ts`, `src/formatters/json-output.ts` (drop removed sections, add agentSummary).
7. **Guidelines** — rewrite `src/agent-workspace/task-skill.ts`; update `src/guidelines/cli-instructions/*` and `src/guidelines/mcp/*`; delete `src/guidelines/agent-guidelines.md` + `AGENT_GUIDELINES`.
8. **Migration** — throwaway script for the one-time `agent_summary` backfill.
9. **Warming up** — `src/ui/opentui/workspace.ts` + tests + docs.
10. **Tests/docs/build** — remove/rewrite tests referencing removed fields, regenerate `docs/app-directory-map.md`.

## Verification
- Worktree has no `node_modules`: run `bun install` first.
- `bunx tsc --noEmit`; `bun run check .`.
- Scoped tests only (full suite is slow): `bun scripts/run-ci-tests.ts <affected files> --timeout=10000`.
- `bun run build`, then `find src -name '*.ts' -newer dist/agentic-workspace` must print nothing.

## Notes / gotchas
- Existing task files in `agentic-workspace/tasks/` still carry the removed frontmatter; the new parser ignores unknown keys, and the one-time migration is what preserves their content into `agent_summary`.
- BACK-20's own task file is itself a migration target.
- `/opt/homebrew/bin/agentic-workspace` symlinks to the MAIN checkout `dist/agentic-workspace`; rebuild there before manual testing.

## Definition of Done

- [ ] bunx tsc --noEmit passes when TypeScript touched
- [ ] bun run check . passes when formatting/linting touched
- [ ] bun test (or scoped test) passes

## Implementation Notes

## Implementation (both parts done)

### Part 1 - Option word motion (adapter fallback)
Upstream research resolved open question 1: @opentui/core 0.5.17 is byte-identical to 0.5.14 for the JS encode path and the native encoder behaves identically in a scratch harness, so no dependency bump. Upstream PRs #1423/#1477 do not cover meta/option + printable. Implemented the adapter fallback in WorkspaceAgentTerminal.encodeKey (src/ui/opentui/workspace-agent.ts): forward raw key.sequence when (a) legacy Meta + exactly one printable ASCII byte (ESC b / ESC f, iTerm2 Option+Left/Right), or (b) legacy SS3 arrow ESC O A-D (native encoder returns empty). Existing meta->option normalization kept for all other keys. Event is never mutated.
Tests: src/test/opentui-workspace-agent.test.ts adds "forwards raw Option/Alt word-motion bytes and legacy SS3 arrows" (ESC b, ESC f, CSI 1;3D/1;3C, ESC O D/OC, ESC DEL, kitty 127;3u).

### Part 2 - Task details card
Create (task-composer.ts): removed dueDate field/type/input and normalizeDueDate import; domain/CLI/TaskCreateInput.dueDate untouched. Edit (workspace-controller.ts): removed acceptanceCriteria from WorkspaceEditorField/editorFields; #saveTaskFields now merges values over draft values and drops the acceptance-criteria branch + parseAcceptanceCriteria import. Controls (controls.ts): new TaskFormCycleControl (1-row focusable, "◀ value ▶", Left/Up prev, Right/Down next with wrap) replaces SelectRenderable for kind "select"; FormControl/values() updated; SelectRenderable import removed. Due date and acceptance criteria remain in read-only details and CLI.
Tests: src/test/opentui-task-composer.test.ts updated tab counts (worktree 7->6, preset 6->5) and field-order comment; added cycler wrap test.

### Docs
docs/opentui-workspace-spec.md line 14 updated (raw legacy Meta/SS3 forwarding, no word editing); new bullet for the compact create/edit forms.

## Verification (worktree)
- bunx tsc --noEmit: clean.
- bun run check .: clean (581 files).
- bun scripts/run-ci-tests.ts src/test/opentui-workspace-agent.test.ts src/test/opentui-task-composer.test.ts: 11 passed / 2 files.
- Also opentui-workspace-controller/surfaces/filters/layout: 71 passed / 4 files.
- bun run build: succeeded; find src -name "*.ts" -newer dist/agentic-workspace printed nothing.

Note: /opt/homebrew/bin/agentic-workspace symlinks to the MAIN checkout dist, not this worktree dist; the worktree dist is rebuilt and current for merge.

## Implementation status (2026-10-08)

Implemented on branch `agentic-workspace/task/BACK-20` in the worktree, in phases:
1. Model/markdown/core: removed the six fields and domain types; added `agentSummary` (`agent_summary`) to Task/TaskCreateInput/TaskUpdateInput/TaskEditArgs and the update pipeline (set/append/clear).
2. CLI/config: removed every `--ac`/`--dod`/`--plan`/`--notes`/`--comment`/`--final-summary` flag family and `--no-dod-defaults`; removed config-level DoD (config wizard/get/list, init, config-watcher) and the MCP `definition_of_done` tool; added `--agent-summary`/`--append-agent-summary`/`--clear-agent-summary`.
3. MCP: task create/edit schemas+handlers expose `agentSummary`/`agentSummaryAppend`/`agentSummaryClear`.
4. TUI/formatters: edit card is now title/description/type/priority; deleted `ui/checklist.ts` and `ui/acceptance-criteria-progress.ts`; plain/JSON output show `agentSummary`; agent header shows `warming up` and the centered text is gone.
5. Guides/docs: rewrote `task-skill.ts` and the CLI/MCP guides around description vs agentSummary; deleted `agent-guidelines.md`/`AGENT_GUIDELINES`; updated root docs and the workspace spec/map.
6. Migration: one-time backfill ran over `/Users/imribarr/Projects/agentic-workspace/agentic-workspace/tasks` (21 tasks -> `agent_summary`, old keys removed); BACK-20 itself restructured. Throwaway scripts deleted.

Verification (worktree): `bunx tsc --noEmit` clean; `bun run check .` clean (556 files); full suite 244/244 files / 2255 tests pass at `AGENTIC_WORKSPACE_TEST_LANES=2` (the 5-lane run hits a pre-existing load flake in `cli-list-window.test.ts`); `bun run build` OK with `find src -name '*.ts' -newer dist/agentic-workspace` empty.

Open item: `/opt/homebrew/bin/agentic-workspace` still symlinks to the MAIN checkout `dist` (old code). Merge this branch to main and rebuild there before manual TUI testing.