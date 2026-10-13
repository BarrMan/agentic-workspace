export const BACKLOG_TASK_SKILL = `# Backlog Task Management

Keep task work grounded in its canonical artifacts:
- List task artifacts, read the relevant ones, and write updates through the
  supported task-artifact interfaces.
- Use canonical task artifact paths; do not invent alternate locations.
- Never approve artifacts or edit \`.artifacts.json\` directly.

Maintain task status as \`In Progress\` while work is underway. Only the user
may move a task to \`Done\`.

For a question answered in the previous session, ask a concise, scoped question
in the current mode rather than re-deriving the answer.
`;

export const BACKLOG_TASK_SKILL_FILE = `---
name: backlog-task-management
description: Keep the active Backlog task synchronized as you work - keep its description a short, user-friendly overview, maintain the detailed agent summary, and move it to In Progress. Only the user moves a task to Done.
---

${BACKLOG_TASK_SKILL}`;
