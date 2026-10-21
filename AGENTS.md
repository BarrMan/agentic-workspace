# Agent Instructions — AgenticWorkspace

## Documentation

Project documentation lives under `docs/`; the root `README.md` is the user entry point and this file is the agent workflow entry point.

### Read by the work being changed

- **Product behavior, API, failure or recovery:** read [SPEC](docs/SPEC.md) and the relevant linked feature contract, including its edge cases and unresolved decisions.
- **Ownership, interfaces, persistence or refactoring:** read [BLUEPRINT](docs/BLUEPRINT.md) and relevant [ADRs](docs/adr/README.md).
- **A screen, dialog, focus or key interaction:** read its [screen specification](docs/screens/README.md) and [DESIGN-SYSTEM](docs/DESIGN-SYSTEM.md).
- **Implementation or tests:** read [CONVENTIONS](docs/CONVENTIONS.md).
- **Review or audit:** read [Review and Verification](docs/CONVENTIONS.md#review-and-verification).
- **Scope or product purpose:** read [PRODUCT](docs/PRODUCT.md).

### Authority and decisions

- **The contracts are the source of truth.** PRODUCT owns scope; SPEC and its `specs/` own behavior; BLUEPRINT and its `architecture/` pages own structure and operation contracts; CONVENTIONS owns engineering practice; DESIGN-SYSTEM and the screen specifications own presentation; ADRs own accepted significant decisions. Read the owning contract for the claim you are changing.
- **Task-tracker entries are not contracts.** Implementation plans, alignment pages, task lists, handoffs, and any other work-item document — including entries labeled `TASK-n` — are tasks. They schedule work and may cite contracts; they never own or define behavior, scope, or a decision. A `TASK-n` identifier inside a SPEC feature contract is a requirement ID in that contract, not a tracker task. When a tracker entry and a contract disagree, the contract wins and the tracker entry is corrected.
- Code, installed help, tests and screenshots establish implementation evidence; a discrepancy is an alignment issue, not permission to redefine the contract. Do not weaken runtime or execution-safety gates.
- Each claim has one owning document. Link to that owner rather than copying its rules into other documents. ADRs preserve accepted technology and significant architecture decisions with their rationale; new significant decisions require approval, and accepted records remain preserved with explicit supersession.
- Before asking about behavior, read the relevant contract and its failure/recovery scenarios. Ask only about an identified omission, contradiction or requested change. Investigate discoverable facts instead of asking the owner to research them.
- Record accepted decisions in the owning contract. Unresolved policy is labeled in its owning contract rather than deferred to a non-contract document.
- Apply the current approved contract in assignments and worker briefs. Scope limits do not justify keeping compatibility behavior; unresolved ownership or data-policy decisions must be escalated explicitly. Retain execution-safety gates until their requirements are folded and satisfied.
- Non-contract material (questionnaires, research, handoffs, implementation plans, source audits) is supporting evidence, not authority. Before retiring any of it, account for its unique requirements, update inbound references, and fold any unresolved material into the owning contract or the task tracker.

## No legacy code

- Do not keep legacy code, compatibility shims, fallback aliases, deprecated config keys, migration paths, or dual-read/dual-write behavior. Remove the superseded path entirely.
- Backward compatibility and legacy preservation are opt-in: implement them only when the user explicitly asks for them in the current request. A task tracker, audit, existing test, or "someone might rely on it" does not authorize preserving legacy behavior.
- Code deletion is the default. Data is different: name any existing data that would be deleted or reinterpreted and get explicit approval before touching it.

## Dog-fooding: inspect the installed CLI for current behavior

This repo builds AgenticWorkspace and also uses it to manage tasks. The globally installed command can differ from the working source. To establish what the installed binary currently exposes, run `agentic-workspace <command> --help`; do not infer installed behavior from branches or source alone. Compare that evidence with SPEC's supported API contract.

## Rebuild before a runnable handoff

**The main agent runs `bun run build` after integration, before telling the user a change is
ready to try or demonstrating it through the installed `agentic-workspace` command.**

Batch implementation edits and source-based checks without rebuilding after each patch.
During implementation, rebuild only when an agent needs the compiled binary for its own
verification; build that worktree before the binary-dependent checks.

### Why

`/opt/homebrew/bin/agentic-workspace` is a symlink:

```
/opt/homebrew/bin/agentic-workspace -> /Users/imribarr/Projects/agentic-workspace/dist/agentic-workspace
```

So `agentic-workspace` runs whatever `dist/agentic-workspace` happened to be at the time of the last build. Editing
`src/**` changes nothing about what the `agentic-workspace` command actually does.

### The trap this prevents

A passing test suite proves the *source tree* is correct. It says nothing about the binary.
Handing back a stale binary makes a correct fix look broken, and a broken fix look fixed.

Report source/test results as such. **Before reporting a fix as runnable in the installed CLI,
rebuild main and verify against that rebuilt binary.** State explicitly when a rebuild happened.

### Verify the rebuild landed

```sh
bun run build
find src -name '*.ts' -newer dist/agentic-workspace   # must print nothing
```

If the second command lists files, the build did not pick them up. Do not proceed to manual
testing.

### When tests and manual verification disagree

The test suite runs against source. The user runs against `dist/agentic-workspace`. When those disagree,
suspect a stale binary before suspecting the code.

## Running tests

Run only the files affected by your change; the full suite is not needed for iteration.

```sh
# one suite, in its own process
bun test src/test/checklist.test.ts --timeout=10000

# the whole suite (Bun's native parallel runner; each file runs in its own worker)
bun run test
```

Bun >= 1.4 is required (CI pins 1.4.3); the 1.3 line breaks the OpenTUI suites under `--parallel`
(upstream oven-sh/bun#31410). Pass per-test timeouts with `--timeout=10000`. There are no lane or
deadline env knobs; the whole-run bound is the CI job timeout.

The test preload owns isolation: it sets a run-scoped `TMPDIR`, clears workspace-pinning env
(`AGENTIC_WORKSPACE_CWD`, `AGENTIC_WORKSPACE_WORKSPACE_CONTEXT`, `AGENTIC_WORKSPACE_TASK_ID`, …), and assigns a unique
`AGENTIC_WORKSPACE_TMUX_SOCKET`. Tests that spawn processes own teardown (kill and await); there is no global
process supervisor.
