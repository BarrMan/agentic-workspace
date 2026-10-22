# Large-file module review

Supporting review evidence, not a behavior or architecture contract. Ownership rules remain in [BLUEPRINT](../BLUEPRINT.md), [Renderer](../blueprints/renderer.md), and [CONVENTIONS](../CONVENTIONS.md).

## Scope and result

The remaining source files above 1,000 lines were reviewed for responsibility and resource ownership, not split at arbitrary line boundaries.

| Parent | Lines before this pass | Lines after | Retained responsibilities |
|---|---:|---:|---|
| [workspace-controller.ts](../../src/renderer/opentui/workspace-controller.ts) | 2,728 | 991 | Startup, navigation, serialized refresh, workspace/board composition, global modal arbitration |
| [workspace.ts](../../src/renderer/opentui/workspace.ts) | 1,240 | 891 | Group projection, selection/navigation policy, overall layout, cross-pane focus, global input dispatch |
| [agent-settings.ts](../../src/renderer/opentui/agent-settings.ts) | 1,115 | 780 | Categories/global focus, combined Configuration save/discard, shared footer, Sessions, editor composition, public preset picker |

These are physical line counts, not a new size limit. The largest remaining controller method composes the workspace/board and their callbacks; moving those callbacks alone would not transfer a complete responsibility.

## Extracted owners

| Module | Implementation hidden from its caller |
|---|---|
| [workspace-sessions.ts](../../src/renderer/opentui/workspace-sessions.ts) | Session presentation, attachment/start/handoff, launch and deletion admission, local selections, picker lifetime, request polling, close/disposal |
| [workspace-session-monitor.ts](../../src/renderer/opentui/workspace-session-monitor.ts) | Observations, activity probes, liveness polling, sidecar watches, detach histories, timer cleanup |
| [workspace-task-actions.ts](../../src/renderer/opentui/workspace-task-actions.ts) | Task forms and retry state, group interactions, task deletion coordination, board mutation feedback, modal completion |
| [workspace-settings.ts](../../src/renderer/opentui/workspace-settings.ts) | Settings loading/lifetime, confirmed Mode deletion, persisted destination selection, partial-effect reporting |
| [workspace-preview.ts](../../src/renderer/opentui/workspace-preview.ts) | Preview render tree, Session header, placeholders, borrowed-terminal replacement, focus listener cleanup |
| [workspace-details.ts](../../src/renderer/opentui/workspace-details.ts) | Rich/fallback details, artifact-view lifetime, adapter replacement, content restoration |
| [workspace-task-list.ts](../../src/renderer/opentui/workspace-task-list.ts) | Retained rows, styling, cell slicing, viewport geometry, scroll anchoring, mouse hit-testing, size-hook cleanup |
| [agent-presets-editor.ts](../../src/renderer/opentui/agent-presets-editor.ts) | Preset controls, form/edit state, validation, scrolling, field focus, staged named copies, committed values |

The previously extracted [attachment owner](../../src/renderer/opentui/workspace-attachment-owner.ts) remains responsible for pending-work settlement, admission, startup cleanup, retained failed releases, and release aggregation. Session workflows compose it rather than duplicating its collections or lifecycle rules.

The presentation callbacks represent refresh, notices, confirmation, selection, and persistence effects. They do not expose the parent's mutable maps or move domain operations out of Controller. Removing an owner would return a complete workflow and its local lifetime state to the parent, not merely remove forwarding methods.

## Findings corrected during review

- Artifact adapters now follow workspace updates; replacement disposes the old artifact view and invalidates pending reads.
- Empty group-only lists retain a nonnegative scroll anchor.
- The preset editor's render interface matches its callers. The documented named-preset copy action is implemented, with committed-only Save and cancellation on field-focus changes.
- Creation retries retain the committed Task identity after group or selection persistence fails. They do not create a second Task.
- Successful editor field writes advance their own draft baseline, allowing group-save retries without hiding genuine external conflicts.
- Populated-group deletion refreshes after releasing its modal; creation from a group clears local and persisted group selection when selecting the Task.
- Mode-deletion destinations are existing persisted modes, excluding every staged deletion; newly staged modes are not offered as destinations.
- A resuming Session picker retains disposal ownership. Invalidated resumes release it, while same-context failures preserve retry behavior.

## Verification map and limits

Public controller behavior is exercised through `run`, `refresh`, `destroy`, and captured workspace callbacks in [lifecycle tests](../../src/renderer/opentui/workspace-controller-lifecycle.test.ts), [task-action tests](../../src/renderer/opentui/workspace-controller-task-actions.test.ts), and [group integration tests](../../src/test/opentui-workspace-controller-groups.test.ts). Retained views use [workspace mount tests](../../src/renderer/opentui/workspace-agent.test.ts) and [layout tests](../../src/renderer/opentui/workspace-layout.test.ts). Settings behavior uses [public settings mount tests](../../src/renderer/opentui/agent-settings.test.ts) and [persistence integration tests](../../src/test/opentui-settings-persistence.integration.test.ts).

Independent reviews assessed view lifetime/focus, Settings contract alignment, workflow failure behavior, and orchestration depth/resource safety. Supported findings were reconciled against source and focused regression coverage. This is not a whole-repository behavioral acceptance audit.

The existing placement of group relationship helpers and persisted selection authority remains a separate Model/Controller alignment question under [BLUEPRINT](../BLUEPRINT.md) and the [Controller contract](../blueprints/controller.md). Extracting Renderer workflows neither resolves that question nor authorizes Renderer domain policy.

Source checks and controlled-provider tests do not prove live-provider, Nix, or other-platform acceptance. Runnable handoffs additionally require the main-agent [rebuild and freshness procedure](../../AGENTS.md#rebuild-before-a-runnable-handoff).
