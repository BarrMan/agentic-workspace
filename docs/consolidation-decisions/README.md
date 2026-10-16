# Decision sheet — grouped by subject

> **Working sheet — not a contract.** Answers here are applied to the owning contracts and each document's disposition markers.

**1233 unconfirmed statements.** Each group below is a subject area: what it covers, and what a decision on it means.

## Answering a group

Write one of:

- `Discard all` — retire every statement: unapproved, historical, or superseded.
- `Plan work` — the statements are verification or safety follow-up, not contract content: they move to the [alignment plan](../alignment-plan.md).
- `Amend a contract` — the contracts are genuinely missing this behavior; name the owning contract to edit.
- `Select individually` — then mark each statement `d` / `w` / `a` / `?`.
- `Narrow: <instruction>` — split or reframe the group first.

Two tags per statement: `P` = a proposal, candidate or unanswered claim; `G` = an evidence, verification or safety gate. `G` statements are almost never contract content — "plan work" or "discard" is the normal answer.

## Groups

| Group | What it covers | Default | Statements | P | G | File |
|---|---|---|---:|---:|---:|---|
| **Ink TUI framework integration** | How the Ink terminal-UI framework is integrated into the project. | Discard — Ink is no longer used. | 7 | 7 | 0 | [ink-tui.md](ink-tui.md) |
| **OpenTUI workspace UI** | How the OpenTUI-based workspace and its renderables, panes and startup are built. | Discard or plan — mostly implementation detail. | 54 | 8 | 46 | [opentui-workspace.md](opentui-workspace.md) |
| **tmux layer and call sites** | How tmux is accessed: the proposed extraction layer, its API, and the inventory of call sites. | Discard the proposals; keep only verified behavior. | 116 | 40 | 76 | [tmux-layer.md](tmux-layer.md) |
| **Provider and agent status detection** | How agent status is detected and reported: provider signals, hooks, sidecars, watchers, lifecycle states. | Decide — product-visible behavior. | 247 | 26 | 221 | [provider-status.md](provider-status.md) |
| **Test suite policy and runtime** | How tests are written, run and isolated, and what the suite is required to prove. | Decide — engineering policy. | 150 | 36 | 114 | [test-policy.md](test-policy.md) |
| **Host storage and cleanup** | What may be deleted from this host: caches, installers, images, toolchains, personal data, retention. | Decide — irreversible effects. | 186 | 38 | 148 | [storage-cleanup.md](storage-cleanup.md) |
| **Session recovery, receipts and detach** | How sessions survive interruption: receipts, resume, in-flight input, detach and drain semantics. | Decide — product-visible behavior. | 70 | 19 | 51 | [session-recovery.md](session-recovery.md) |
| **Task identity, records and storage model** | How task and project records are identified, stored, archived and projected. | Decide — product-visible behavior. | 98 | 17 | 81 | [task-records.md](task-records.md) |
| **Configuration and task modes** | How configuration resolves and how task modes are selected, approved and removed. | Decide — product-visible behavior. | 94 | 33 | 61 | [config-modes.md](config-modes.md) |
| **CLI and supported API surface** | Which commands, aliases, options and integration operations are supported. | Decide — supported surface. | 101 | 34 | 67 | [cli-api.md](cli-api.md) |
| **Board, workspace and screen behavior** | How the board and workspace screens behave: views, filters, search, focus, keybindings, footers. | Decide — presentation contract. | 78 | 31 | 47 | [board-screens.md](board-screens.md) |
| **Agent of Empires reference material** | Claims imported from the external Agent of Empires comparison. | Discard unless separately verified. | 4 | 0 | 4 | [aoe-reference.md](aoe-reference.md) |
| **Historical handoffs and checkpoints** | State captured at a point in past work: handoffs, refactoring checkpoints, branch/commit state. | Discard — historical. | 8 | 0 | 8 | [handoffs.md](handoffs.md) |
| **Documentation and research method** | How the documentation itself was produced: research, questionnaires, authority and provenance method. | Discard — process history. | 20 | 1 | 19 | [docs-method.md](docs-method.md) |
| **Total** | | | **1233** | 290 | 943 | |

## Shortcut

If you agree with a group's stated default, just reply with the group name and the word `default` and I will apply it and remove that group from the sheet.
