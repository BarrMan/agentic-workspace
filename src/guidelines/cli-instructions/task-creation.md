## Task Creation Guide

Use this guide when `agenticworkspace instructions` or the user indicates that new AgenticWorkspace tasks are needed.

### Step 1: Search First

Always check whether the work is already tracked.

Recommended CLI commands:

- `agenticworkspace search "desktop app" --plain`
- `agenticworkspace task list --status "<todo status>" --plain`
- `agenticworkspace task list --status "<active status>" --plain`
- `agenticworkspace task list --exclude-status "<terminal status>" --plain`
- `agenticworkspace task list --type {{TASK_TYPE:1}} --plain`
- `agenticworkspace task list --search "desktop app" --labels frontend,bug --limit 20 --plain`

Avoid broad unfiltered listing when the project may have many tasks. Use `--status`, `--exclude-status`, `--type`, `--project`, `--assignee`, `--unassigned`, `--parent`, `--priority`, `--labels`, `--search`, or `--limit` where applicable. Check the size with `--count`, and read a long list in windows with `--max-count` and `--skip`; cut output ends with the command for the next window. Repeat `--exclude-status` or pass comma-separated configured statuses to exclude multiple states. Repeat `--type` or pass comma-separated configured task types to include multiple types. Repeat `--project` or pass comma-separated configured projects to include multiple projects.

Use `agenticworkspace task view {{TASK_ID:123}} --plain` to read full context for likely matches.

### Step 2: Assess Scope Before Creating Tasks

Decide whether the request is:

- A single atomic task that can be completed in one focused PR.
- A multi-task feature or initiative that needs subtasks or dependencies.

Ask:

1. Can this be completed in a single focused pull request?
2. Would a reviewer be comfortable reviewing all changes at once?
3. Are there natural independent delivery points?
4. Does the work span multiple subsystems, layers, or ownership areas?
5. Are multiple tasks likely to touch the same component?

### Step 3: Choose Task Structure

Use subtasks when the work shares one goal and one subsystem:

```bash
agenticworkspace task create "Desktop application"
agenticworkspace task create -p {{TASK_ID:10}} "Set up shell"
agenticworkspace task create -p {{TASK_ID:10}} "Wire IPC"
```

Use `--parent`/`-p` only with an existing task ID returned by `agenticworkspace task create`, `agenticworkspace task list`, or `agenticworkspace task view`. Do not pass milestone IDs such as `m-0` to `--parent`; assign a task to a milestone with `--milestone`/`-m`.

Use separate tasks with dependencies when work spans independent components:

```bash
agenticworkspace task create "Add bulk update API"
agenticworkspace task create "Add bulk update UI" --dep {{TASK_ID:21}}
```

### Step 4: Create Tasks

Write tasks so a future agent can act on them without prior conversation context.

Include:

- A clear title.
- A short description that captures why the task exists: the problem, trigger, or user need behind it, plus any context a future agent cannot recover from the code. Keep it a user-friendly overview of what the task is about, not detailed working state.
- References or documentation when they are needed for implementation.
- Dependencies when work must happen in order.
- An assignee with `-a` when the task has a known owner; omitting it applies the project's configured `defaultAssignee` when one is set, and `-a ""` leaves the task unassigned instead.

For future work, do **not** add detailed implementation state during task creation. Creation captures durable intent, context, scope, references, and dependencies. Keep task metadata concise and limited to durable description and status; put durable artifacts in their canonical project paths rather than a task working summary. The narrow exception is already-started work being created directly in a configured active status (for example, In Progress); include only concise, relevant current context.

Examples:

```bash
agenticworkspace task create "Add project search" \
  -d "Finding anything means running three separate commands, and matches in the ones you skip are missed silently. One search command covers tasks, docs, and decisions."
```

Too thin: `-d "Users can search tasks, docs, and decisions from one CLI command."` states the change but not the need,
so a future agent cannot weigh scope or alternatives.

```bash
agenticworkspace task create "Add settings docs" \
  --doc docs/settings.md \
  --ref https://example.com/spec
```

### Shell Quoting for Literal Backticks

When task text includes Markdown code spans, quote it so the shell passes the backticks literally. Unescaped backticks in double-quoted or unquoted arguments are command substitution in many shells, and AgenticWorkspace cannot recover the original text after the shell has already executed it.

Use single-quoted CLI arguments for values that contain literal backticks:

```bash
agenticworkspace task create 'Document `agenticworkspace init` setup' \
  -d 'Covers `agenticworkspace init --defaults` setup'
```

If single quotes are not practical in your shell, escape each literal backtick before running the command. Do not rely on AgenticWorkspace to sanitize accidental command output after substitution.

### After Creation

Report the created task IDs, titles, and descriptions to the user. If the user asks for changes, update tasks through `agenticworkspace task edit`.

Task creation is complete once the work is tracked. If you will continue into implementation in the same session, ask the user whether they want you to proceed; after their confirmation, read `agenticworkspace instructions task-execution` before continuing.

Only the user marks a task Done. Do not move a task to Done, or another terminal status, on the user's behalf.
