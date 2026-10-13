---
task_schema_version: 3
id: BACK-24
title: Task execution loop
status: In Progress
assignee: []
created_date: '2026-10-10 05:05'
updated_date: '2026-10-10 05:06'
labels: []
dependencies: []
ordinal: 24000
description: >-
  I want to plan support for agent-initiated session handoff so long-running
  autonomous work can continue across fresh sessions without requiring user
  intervention.


  Please investigate the existing implementation end-to-end before proposing the
  solution. In particular, understand the existing manual handoff flow, session
  creation and activation, mode/session behavior, task-management CLI/plugin
  exposed to agents, agent prompt/configuration system, and backlog ask.


  The desired behavior is:


  * Agents should be able to initiate the existing handoff behavior themselves
  through the Backlog CLI.

  * The handoff should continue the same task and mode in a fresh session
  without requiring user interaction.

  * Agents should know this capability exists through the task-management
  functionality/instructions already injected into their sessions.

  * The default BUILD mode should instruct agents to work autonomously toward
  full task completion and use handoff when they determine that continuing in
  the current session would carry excessive context.

  * Before handing off, the agent should ensure durable task state/artifacts
  contain what the successor needs.

  * The successor should continue working automatically rather than waiting for
  the user to tell it to proceed.

  * Existing mechanisms such as backlog ask should remain available when the
  successor needs information from the previous session.

  * Handoff is a context/session lifecycle mechanism, not a workflow engine. Do
  not introduce phases, DAG scheduling, automatic task decomposition, context
  thresholds, resource limits, or other orchestration behavior as part of this
  work.

  * Keep the feature generic and consistent with the application’s
  minimal/non-opinionated design.


  Work with me to resolve any remaining product or architectural questions.
  Inspect the existing code and reuse the current handoff/session infrastructure
  rather than designing a parallel mechanism.


  Once there are no meaningful open questions, produce a complete implementation
  plan covering the change end-to-end.


  Do not implement anything yet.
---
