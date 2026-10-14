# Agent Instructions — AgenticWorkspace

## Shared-runtime and test-remediation work

**MUST READ before shared-runtime work:** [canonical handoff](../../docs/agentic-workspace/shared-agent-runtime-handoff.md), then its scoped contract/plan pointers. **MUST READ before test-remediation work:** [remediation plan](../../docs/agentic-workspace/test-suite-remediation-plan.md). These carry the current checkpoint, bounded-agent/commit sequencing, evidence limits, and remaining policy questions.

## Dog-fooding: the installed `agentic-workspace` command is authoritative

This repo builds AgenticWorkspace and also uses it to manage its own tasks. The globally installed `agentic-workspace` command (see the symlink below) defines CLI behavior; the working copy's `src/` and any task worktree can lag it. To answer what the CLI supports, run the command or `agentic-workspace <command> --help` — never infer it from the source tree, git branches, or `origin/main`.

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
process supervisor. See `docs/test-suite-runtime-report.md`.
