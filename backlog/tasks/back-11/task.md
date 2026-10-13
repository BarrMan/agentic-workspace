---
task_schema_version: 3
id: BACK-11
title: 'Harden the CI test runner: bounded deadline and live-workspace isolation'
status: Done
assignee: []
created_date: '2026-10-07 17:22'
updated_date: '2026-10-07 17:44'
labels: []
dependencies: []
priority: high
type: task
ordinal: 11000
description: >-
  The full suite runs via `bun scripts/run-ci-tests.ts --timeout=10000`
  (package.json `bun run test`) in 5 lanes with NO default deadline. When a
  `backlog workspace` plus its agents are live, the run ballooned to ~10 minutes
  and had to be cancelled: the 5 lanes are CPU-starved by the
  workspace/agents/serena-node processes, tests contend on the project-state
  `proper-lockfile` in `.backlog/*/state.json` (held by the live workspace,
  stale 30s, retries 20), and each test has a 10s per-test timeout so blocked
  tests stretch the run.


  Goal: make the suite bounded, isolated from a live workspace, and fast to
  iterate on for agents.
---

