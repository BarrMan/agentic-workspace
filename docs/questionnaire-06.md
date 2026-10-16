---
consolidation:
  total: 34
  counts:
    exists: 10
    discard: 9
    integrate: 0
    unconfirmed: 15
  percentages:
    exists: 29.41%
    discard: 26.47%
    integrate: 0.00%
    unconfirmed: 44.12%
---
# Integration surface — questionnaire 6

The application is TUI-first. Its command line is a selective API for session agents and external applications—not a duplicate settings interface. That decision is settled. <!-- consolidation: exists; ref: docs/specs/interfaces.md#product-surfaces; reason: TUI-first setup and selective integration API are approved. -->

The questions below use the implementation checks you requested. Answer **Yes** to accept a recommendation, or state the change you want.

## Findings that do not need another decision

- **Completion already exists.** The TUI source binds completion to `c`/`C` and status-only Done to `Shift+Z`. Completion moves finished tasks into completed storage and performs cleanup; Done only changes status. These bindings were checked in source, not tested in a running terminal. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Historical source-only keybinding verification is evidence rather than a permanent binding contract. --> <!-- consolidation: exists; ref: docs/specs/tasks.md#work-context-and-completion; reason: Separate status-only Done and completion with storage move and cleanup are specified. -->
- **MCP is not a proven token optimization.** This implementation exposes 22 tools with schemas and descriptions. It avoids shell quoting and helps clients discover available operations, but its responses are not consistently shorter than CLI responses. Actual token cost depends on the client; no benchmark has established savings. <!-- consolidation: discard; ref: docs/PRODUCT.md#open-questions; reason: Implementation inventory and unbenchmarked cost observation are decision evidence only and do not approve MCP retention or savings. -->
- **The guidance commands print text for an agent to read.** They do not execute the workflow. `skill` prints a task-management procedure; `instructions` prints an index or a selected guide. Current text includes artifact-approval rules that conflict with your decisions and must not survive consolidation. <!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Printed-guide contents describe an implementation snapshot whose API retention remains undecided. --> <!-- consolidation: exists; ref: docs/specs/configuration.md#modes-and-approval; reason: Mode approval replaces artifact approval and prescribed workflows. -->

## Questions

### 1. Keeping MCP for an actual integration
**Context:** An MCP-capable client can discover and call structured task tools without constructing shell commands. The CLI already covers ordinary task operations; MCP also has its own server, schemas, and handlers to maintain. <!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Integration trade-off evidence does not establish a retained API requirement. -->
**Question:** Do you have an integration that needs MCP, or should we remove it and use the CLI API? <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: No answer supplies a concrete integration or approves MCP removal. -->
**Recommendation:** Remove MCP unless you name a concrete client or workflow that benefits from it. Do not keep it on an unproven promise of token savings. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: MCP removal recommendation has no answer and retention is explicitly undecided. -->
**Answer:**

### 2. On-demand command guidance for agents
**Context:** An agent outside a managed session could run a guidance command to learn how to create or update tasks. Today `skill` and `instructions` provide separate entry points into task/workflow guidance; session startup does not automatically supply that full guidance. <!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Existing guidance entry points and startup behavior are scoped implementation evidence. -->
**Question:** Should the API retain an on-demand guidance command for agents? <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Guidance retention remains unanswered. -->
**Recommendation:** Retain `instructions` as concise API-use guidance, without prescribed plan/build/document workflows. Remove the separate `skill` entry point rather than maintain overlapping guidance surfaces. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Retaining instructions is an unanswered API proposal. --> <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Removing skill is an unanswered API proposal. -->
**Answer:**

### 3. Editing agent instruction files
**Context:** `agents --update-instructions` is not print-only: it lets a person select instruction files and writes a managed reminder to use the workspace CLI. It preserves text outside its managed block. <!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Existing managed-block implementation is evidence for a still-open retention choice. -->
**Question:** Should this instruction-file editing command remain? <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Instruction-file editing retention has no answer. -->
**Recommendation:** Remove it from the public CLI. It is an interactive setup convenience rather than a needed task API; any future setup assistance belongs in the TUI wizard. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Specific removal and future-wizard disposition are unapproved. -->
**Answer:**

### 4. Removing setup and shell conveniences from the API
**Context:** Current commands include `init`, an interactive bare `config` screen, shell-completion installation and its callback, and plural `tasks`/`milestones` aliases. None is needed to create a task, update its status, or operate a session. <!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Advertised convenience inventory and removal rationale are not approval. -->
**Question:** Should these setup/convenience entry points be removed? <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Exact setup and convenience removals await this unanswered question. -->
**Recommendation:** Yes. Keep setup/settings in the TUI and one canonical command name per API operation. This does not remove task, milestone, or session operations themselves. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Removal of init and interactive config is not approved by this blank answer. --> <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Removal of shell completion is not approved. --> <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Removing plural aliases and requiring one canonical name remain unapproved. --> <!-- consolidation: exists; ref: docs/specs/interfaces.md#product-surfaces; reason: TUI settings ownership is independently settled. -->
**Answer:**

### 5. Generic configuration commands
**Context:** The CLI exposes broad `config get/set/list` and `agent-config show/init/set` commands, in addition to the specific model-capture command you already retained. <!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Broad command inventory does not establish approval. --> <!-- consolidation: exists; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Provider-independent current-model capture is retained explicitly. -->
**Question:** Should external callers have these broad configuration APIs, or only the specific configuration operations with an identified integration need? <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Broad configuration API retention remains unanswered. -->
**Recommendation:** Keep the specific operations, including capturing the calling session's model. Remove the broad configuration command families unless you have a concrete external use for one; all settings remain available in the TUI and files remain editable. <!-- consolidation: exists; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Specific current-model capture is independently approved. --> <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Removing broad config and agent-config families has no approval. --> <!-- consolidation: exists; ref: docs/specs/configuration.md#configuration-access-and-precedence; reason: TUI settings and openly editable files are settled. -->
**Answer:**

### 6. Archive alongside completion
**Context:** Completion already handles finished work. A separate archive operation handles canceled, duplicate, or invalid unfinished tasks; its current implementation rejects already-completed tasks. Your previous answer settled completion access but did not confirm or reject archive. <!-- consolidation: exists; ref: docs/specs/tasks.md#work-context-and-completion; reason: Completion access is already approved. --> <!-- consolidation: discard; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Existing archive behavior is implementation evidence and not an approved archive policy. -->
**Question:** Should this separate archive operation remain for abandoned work? <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Archive retention was not answered in questionnaire 5 and remains blank here. -->
**Recommendation:** Yes. Retain archive for unfinished work that will not be completed, and completion for finished work. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Separate archive retention and eligibility remain unapproved. --> <!-- consolidation: exists; ref: docs/specs/tasks.md#work-context-and-completion; reason: Finished-work completion is independently settled. -->
**Answer:**

---

These are decisions about existing entry points. No new API names, workflow restrictions, or features are implied. Accepted removals will be recorded as requirements; code changes remain a separate task. <!-- consolidation: exists; ref: docs/SPEC.md#authority; reason: Unanswered recommendations do not approve API features and implementation remains distinct from accepted requirements. -->
