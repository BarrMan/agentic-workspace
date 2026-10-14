# BACK-23 — Modes: current agent summary

## Overview
Project-configured modes provide separate session histories and reusable agent profiles. PLAN and BUILD can be selected without launching a session; explicit activation opens the selected mode's session. Task artifacts and user-controlled, content-bound approvals accompany the mode workflow.

## Prior implementation evidence
The original detailed implementation history is retained in `legacy-agent-summary.md`. The approved architecture and delivery history are in `docs/modes-phase1-contract.md` and `docs/modes-delivery-plan.md`. The initial Modes implementation was committed as `b97bc8c6` and merged into main. The closing commit on main includes the subsequent source, configuration, regression-test, documentation, and tracked task-container migration fixes.

## Final user-requested UI corrections — 2026-10-10
- Removed the unrequested task-selection arrow and restored the original activity-marker column, indentation, and full-width selection treatment.
- Removed the compensating pane-colored gutter. The broader previously reported four-sided background offset was not reproduced by the original-versus-current isolated renderer comparison; no claim is made that its cause was established.
- Enter now focuses the existing embedded live preview after successful asynchronous activation/mount, including retained and read-only attachments. It does not force fullscreen. Preparation failures keep task navigation available; passive mode cycling does not launch or focus a session.
- Read-only attachment focus remains separate from input permission: keyboard and paste cannot reach the externally owned agent. Retained identity and existing terminal geometry behavior are preserved.
- Ctrl+Q/Ctrl+C leave preview focus without interrupting the agent. The existing `f` fullscreen action remains independent; Escape routing is unchanged.
- Mode/approval metadata is displayed only on the selected task as a right-aligned badge, with one terminal-cell padding on either side and the existing selected-row background. Unselected rows recover their full title budget.
- Titles clip at grapheme/cell boundaries without an artificial ellipsis. Activity colors, mode contrast, and title-only completed-task strike-through remain intact.

## Verification
- 56 focused controller, adapter, existing-host, and passive-mode tests passed.
- 15 focused badge/row-label and real-renderer color tests passed.
- Final TypeScript check, scoped Biome checks, and whitespace checks passed.
- Rebuilt MAIN's `dist/agentic-workspace` immediately after every code/test patch. Final freshness check found no TypeScript source newer than the binary. The globally installed `/opt/homebrew/bin/agentic-workspace` resolves to this binary.
- Independent installed-binary acceptance used a real 160x42 PTY and deterministic, test-owned agents: 24 saved-frame assertions plus live read-only/state checks passed. Enter entered active embedded input, typed keys reached the owned harness, Ctrl+Q returned without an interrupt, repeated Enter retained the same process/pane/session with one history entry, and `f` independently opened fullscreen.
- The same acceptance verified selected-only PLAN/BUILD badges, selection transfer, restored unselected title width, no ellipses, one-cell badge padding, and continuous selected background across all 33 interior cells.
- Read-only acceptance preserved pane/owner identity and byte-for-byte session state while blocking viewer input. Fixtures were cleaned up; the real BACK-23 conversation was not entered.
- Evidence directory: `/var/folders/6z/jl00z05s7b7gmlgvjtf7fh9w0000gn/T/opencode/installed-final.FzrOa9O7/`.

## Handoff
The user accepted the final result and explicitly authorized committing the remaining changes, integrating them into main, and closing BACK-23. The changes are already in the main checkout, so no separate branch merge is necessary. BACK-23 is marked Done through the CLI under that authorization. Restart an already-running `agentic-workspace workspace` to load the rebuilt binary. No artifact was approved by the agent, and unrelated untracked project configuration and tasks are excluded from the closing commit.
