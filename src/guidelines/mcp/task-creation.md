## Task Creation Guide

This guide covers when and how to create well-structured tasks.

### 1. Search for existing work

Search with `task_search` or a filtered `task_list`, then use `task_view` for relevant context. Reuse a fitting task instead of creating a duplicate.

### 2. Assess scope

Decide whether the request is one focused task or multiple independently deliverable tasks. Use subtasks for tightly coupled phases of one outcome; use separate tasks with dependencies for loosely coupled work across components. Only create work the user asked to track or that is clearly part of the requested outcome.

### 3. Write a durable task record

- Title: one-line intended outcome, without implementation detail.
- Description: concise, user-facing explanation of why the task exists and its key context.
- References and documentation: use the corresponding fields for external links and supporting material.
- Parent and dependency links: use valid task IDs and state the relationship clearly.

Keep implementation notes and other durable working context in task artifacts when useful, not in the description. Artifacts are generic task-relative files: use names and formats appropriate to the work. PLAN may use `spec.md` for requirements and `plan.md` for approach, but these are optional conventions, not required files or a fixed artifact schema.

The PLAN and BUILD modes are workflow presets. Their permission declarations are native to an agent harness only where that harness supports the capability; elsewhere, intended permissions are instructions, not enforced access controls. They do not sandbox the agent. Both modes use the project's Default model selection.

Artifact approval is explicitly user-owned. The `.artifacts.json` sidecar records the SHA-256 hash and approval time for each approved artifact. Agents must not write or approve this sidecar. Approval applies only to the exact content hash reviewed and ceases to match when content changes; it does not gate task execution.

### 4. Create and report

Create tasks with `task_create`, add relationships through supported task operations, and report each created task's ID, title, and description to the user. Creation records intent and context; execution research and working documents can be added later as task artifacts.

Do not create detailed implementation plans prematurely, split work without a meaningful delivery boundary, or create placeholder drafts unless requested or uncertainty makes commitment inappropriate.
