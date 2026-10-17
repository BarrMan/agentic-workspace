---
consolidation:
  total: 302
  counts:
    exists: 49
    discard: 128
    integrate: 44
    unconfirmed: 81
  percentages:
    exists: 16.23%
    discard: 42.38%
    integrate: 14.57%
    unconfirmed: 26.82%
---
# AOE-Style Agent Status Tracking — Implementation Plan
> **Non-authoritative supporting material.** This file is not a contract. Authoritative owner(s): [SPEC](SPEC.md), [sessions](specs/sessions.md), [session harness](architecture/session-harness.md), [DESIGN-SYSTEM](DESIGN-SYSTEM.md), [workspace screen](screens/workspace.md), [CONVENTIONS](CONVENTIONS.md).
> Disposition: Historical — discard.

**Status:** plan only. No repo file is modified. Every integration point cites an existing `file:line`.
<!-- consolidation: discard; ref: none; reason: Historical plan status and source-anchor claim. -->

**Upstream pin:** `agent-of-empires/agent-of-empires@0a17c859173a8794abfb55ae7e8038c4c4b17e7d`.
<!-- consolidation: discard; ref: none; reason: External revision provenance. -->

**Provider scope (user decision):** **Claude Code, OMP, Pi, OpenCode, Codex, Antigravity.**
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#harness; reason: Owner-selected six-provider plan scope needs current supported-provider disposition and does not certify readiness. -->

**Assumption — "agy":** the user wrote "agy"; this plan reads it as **Antigravity**. AOE defines `AgentDef` id `antigravity` with `aliases: &["agy"]` and binary `agy` (`src/agents.rs:796-802`), so `agy` is Antigravity's CLI binary, not a separate provider. **If the user meant a different `agy`, this plan's Antigravity row is wrong and must be re-derived.**
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#harness; reason: Owner intent behind agy is explicitly assumed rather than confirmed. -->

**Two user decisions applied throughout (marked `[D1]` / `[D2]`):**

- `[D1]` **No per-preset opt-out.** Hooks are always on for every *supported* provider. No `statusHooks` flag, no settings toggle, no per-card override.
<!-- consolidation: integrate; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Explicit owner decision requires unconditional supported status hooks without opt-outs. -->
- `[D2]` **No activity/status persisted in `state.json`.** Activity is derived in memory on attach/open from live evidence. Nothing durable is written; a restart never replays a stale green. §1.2 and §5 implement this.
<!-- consolidation: exists; ref: docs/specs/sessions.md#sessions; reason: Live observations are ephemeral and old records cannot establish current liveness. -->

**Inputs:** `agent://AOEStatusResearch/report`, `docs/opentui-workspace-spec.md`, `docs/opentui-workspace-session-contract.md`, `docs/aoe-agent-workspace-reference.md`, `docs/opentui-workspace-implementation-plan.md`, `src/agent-workspace/**`, `src/ui/opentui/**`.

## 0. Pinned AOE ground truth (what we copy)

### 0.1 Status vocabulary

Upstream `Status` enum (`src/session/instance/status.rs:5-15`): `Running, Waiting, Idle, Unknown, Stopped, Error, Starting, Deleting, Creating`. **There is no `Done`.**
<!-- consolidation: discard; ref: none; reason: External enum inventory is not an adopted application type. -->
Hook writers can only produce four values — `HookStatus` (`src/agents.rs:10-15`): `running`, `waiting`, `idle`, `error` (lowercase wire form, `src/agents.rs:17-26`).
<!-- consolidation: discard; ref: none; reason: External hook wire vocabulary. -->
The manifest parser accepts only `idle|running|waiting|error` (`src/tmux/detect/manifest.rs:175-183`).
<!-- consolidation: discard; ref: none; reason: External parser inventory. -->

AgenticWorkspace task statuses (`To Do`, `In Progress`, `Done`, custom) are a **different axis** and stay untouched (spec: status tabs are task-domain).
<!-- consolidation: exists; ref: docs/screens/workspace.md#ordered-regions; reason: Task status tabs and session runtime presentation are separate. -->

### 0.2 Precedence (manifest-backed agent)

`poll_status` → `update_status_with_metadata_inner` (`src/session/instance/status_update.rs:230-430`):

| # | Rule | Source |
|---|---|---|
| 0 | Durable `Stopped`/`Deleting`/`Creating` short-circuit — no probe | `status_update.rs:135-141` <!-- consolidation: discard; ref: none; reason: External status short-circuit evidence. --> |
| 1 | `Starting` floor: within **3 s** of launch, report `Starting` without probing | `status_update.rs:157-163` <!-- consolidation: discard; ref: none; reason: External startup timer evidence. --> |
| 2 | `Error` latch stickiness: a recorded error holds for **30 s** before re-check | `status_update.rs:151-156` <!-- consolidation: discard; ref: none; reason: External error latch evidence. --> |
| 3 | tmux absent → `Error`; tmux unreachable → held for **4 s** (never present) / **30 s** (once confirmed) | `status_update.rs:185-228`, `status.rs:80-86` <!-- consolidation: discard; ref: none; reason: External absent-versus-unreachable timing. --> |
| 4 | Dead pane **and** a hook was seen → `Error` (dead pane outranks everything, but only for hook-reporting sessions) | `status_update.rs:279-284` <!-- consolidation: discard; ref: none; reason: External dead-pane precedence. --> |
| 5 | Manifest path → `update_status_from_manifest` | `status_update.rs:286-300` <!-- consolidation: discard; ref: none; reason: External dispatch detail. --> |
| 5a | `skip_capture` gate: unchanged `window_activity` **and** last capture taken past that activity second **and** no hook **and** no pending proposal → keep last verdict, zero capture | `status_update.rs:7-20`, `:317-326` <!-- consolidation: discard; ref: none; reason: External capture optimization. --> |
| 5b | `detect_with_rules`: **configured `[[agents.<x>.status_rules]]` first** (`configured_status_rule`, `visible: true`), else the manifest | `src/tmux/status_detection.rs:24-41` <!-- consolidation: discard; ref: none; reason: External user-rule precedence. --> |
| 5c | Manifest rules sorted **descending priority**, first match wins; positional peers of equal priority evaluated together, lowest screen position wins | `manifest.rs:507`, `:566-597` <!-- consolidation: discard; ref: none; reason: External manifest algorithm. --> |
| 5d | Hook rules are ordinary rules with `region = "hook"`, matched by `hook_status` + `max_age_secs`; a stale write is not evidence | `manifest.rs:394-448` <!-- consolidation: discard; ref: none; reason: External freshness implementation. --> |
| 5e | Shared hook-rule priorities: `hook_running_fresh` **600** (`max_age` 30 s), `hook_running_standing` **400** (`max_age` 900 s), `hook_idle` **300**, `hook_error` **300**, `hook_waiting` **240** | `manifest.rs:394-448` <!-- consolidation: discard; ref: none; reason: External numeric priority inventory. --> |
| 5f | No rule matched → the last known status stands (agent-owned viewer), not `Idle` | `src/tmux/detect/mod.rs:88-93` <!-- consolidation: discard; ref: none; reason: External unmatched-rule fallback. --> |
| 5g | `Running → Idle` with no live-chrome evidence is held one poll (`pending`); a second agreeing poll publishes | `status_update.rs:466-483` <!-- consolidation: discard; ref: none; reason: External one-poll hysteresis. --> |
| 6 | Legacy (no manifest): hook wins, **except** a `running` write older than **900 s** falls back to the pane | `status_update.rs:22-24`, `:302-330` <!-- consolidation: discard; ref: none; reason: External legacy detection path. --> |

### 0.3 Cadence / cost bounds

- Status poll **500 ms**, session feed **1 s**, disk reconcile **5 s**, all as `Instant::elapsed()` checks inside one loop; render tick 33 ms, idle = no draw (`docs/aoe-agent-workspace-reference.md` §3, §2.3).
<!-- consolidation: discard; ref: none; reason: External scheduling inventory. -->
- Two server-wide snapshots, one fork each: `list-sessions` + `list-panes -a`; TTL **2 s**, refresh-due at **half-life** (`reference` §2.1).
<!-- consolidation: discard; ref: none; reason: External cache implementation. -->
- Render path never forks; stale cache read returns `None`, never a wrong answer (`reference` §2.1).
<!-- consolidation: discard; ref: none; reason: External render and cache behavior. -->
- Hook state is read from the filesystem, no fork (`status_update.rs:274-277`, `src/hooks/status_file.rs:46-67`).
<!-- consolidation: discard; ref: none; reason: External hook reader implementation. -->

> **AgenticWorkspace divergence (BACK-15).** The pinned timings above are AOE ground truth; AgenticWorkspace does not
> copy them. The 3 s starting floor, the 30 s error latch, the 900 s standing `running` window, and
> the one-poll `Running → Idle` hold were intentionally removed and replaced by event-driven sidecar
> reads plus liveness gating: hook transitions are read with `fs.watch` on the per-session
> `<task dir>/<sessionId>.activity` directory (coalesced ~10 ms), with an initial reconcile and a slow
> 30 s backstop, and a sidecar counts only while its pane is alive. The AOE text above is retained as
> what AOE does.
<!-- consolidation: discard; ref: docs/specs/sessions.md#sessions; reason: Removed AOE timer rules are historical evidence rather than target behavior. -->
<!-- consolidation: integrate; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Supported hook observations are liveness-gated and refreshed from events rather than replayed stale files. -->
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Exact fs.watch path and ten-millisecond debounce need current implementation disposition. -->
<!-- consolidation: exists; ref: docs/specs/sessions.md#sessions; reason: Thirty-second runtime observation is already specified. -->

### 0.4 Hook command + env contract

- Launch prefix env (`src/session/instance/hooks.rs:10-37`): `AOE_PROFILE`, `AOE_INSTANCE_ID`, `AOE_HOOK_BIN`, `AOE_AGENT_PID=$$`, `AOE_AGENT_BIN`, optional `AOE_AGENT_PROGRAM`.
<!-- consolidation: discard; ref: none; reason: External environment variable inventory. -->
- Hook command (`src/hooks/command.rs:108-140`): `sh -c` guard (unset `IFS`, `set -f`, `umask 077`, instance-id charset check, 0700 dir mode + uid recheck), writes `printf %s <status> > "$D/status"`, **always `exit 0`** (a failing hook blocks the agent's tool calls).
<!-- consolidation: discard; ref: none; reason: External emitter implementation and rationale remain source evidence. -->
- Trailer sentinel marks ownership: every emitter ends with `0 # aoe-hooks`; `is_aoe_hook_command` matches that trailer or the legacy baked path (`src/hooks/command.rs:18-31`).
<!-- consolidation: discard; ref: none; reason: External ownership marker format. -->
- Claude event→status map (`src/agents.rs:341-369`): `SessionStart`→idle, `PreToolUse`→running (`waiting_tools=[AskUserQuestion]`), `PostToolUse(AskUserQuestion)`→running, `UserPromptSubmit`→running, `Stop`/`StopFailure`→idle, `Notification(permission_prompt|elicitation_dialog|agent_needs_input)`→waiting, `Notification(idle_prompt|agent_completed)`→idle, `ElicitationResult`→running.
<!-- consolidation: discard; ref: none; reason: External provider event-map inventory. -->
- Codex event→status map (`src/agents.rs:392-410`): `SessionStart`→idle, `UserPromptSubmit`→running, `PreToolUse`→running, `PermissionRequest`→waiting, `PostToolUse`→running, `Stop`→idle.
<!-- consolidation: discard; ref: none; reason: External provider event-map inventory. -->
- Settings JSON shape: `{"hooks": {"<Event>": [{"matcher": optional, "hooks": [{"type":"command","command":"..."}]}]}}` (`src/hooks/json_settings.rs:31-57`, `:83-138`).
<!-- consolidation: discard; ref: none; reason: External settings schema is not a product record. -->

---

## 1. Status model (in-memory only)

### 1.1 New presentation enum (additive)

Add next to `AGENT_SESSION_STATUS` (`src/agent-workspace/types.ts:16-23`):

```ts
export const AGENT_ACTIVITY_STATUS = {
  STARTING: "starting", RUNNING: "running", WAITING: "waiting",
  IDLE: "idle", UNKNOWN: "unknown", ERROR: "error", STOPPED: "stopped",
} as const;
export type AgentActivity = (typeof AGENT_ACTIVITY_STATUS)[keyof typeof AGENT_ACTIVITY_STATUS];
```
<!-- consolidation: discard; ref: docs/architecture/session-harness.md#session; reason: Exact enum declaration is implementation-owned while core defines observed meanings. -->

Rules:

- Lowercase strings in memory — matches AOE's `as_str()` spelling (`status.rs:34-37`) and our existing status strings (`types.ts:16-23`).
<!-- consolidation: discard; ref: none; reason: String casing is an implementation representation choice. -->
- **No `Done`.** AOE has none (`status.rs:5-15`); terminality is already carried by `AGENT_SESSION_STATUS.STOPPED` / `FAILED` (`types.ts:16-23`).
<!-- consolidation: exists; ref: docs/specs/sessions.md#sessions; reason: Runtime state is distinct from task Done. -->
<!-- consolidation: discard; ref: docs/BLUEPRINT.md#durable-conversation-and-operation-records; reason: Durable STOPPED and FAILED enum rationale is superseded. -->
- `Deleted`/`Creating` from AOE are omitted: AgenticWorkspace session creation is synchronous and has no delete-in-progress window.
<!-- consolidation: discard; ref: docs/BLUEPRINT.md#new-session; reason: Synchronous creation premise is superseded by asynchronous durable startup. -->
- `AgentActivity` is a **derived, non-authoritative** overlay. It never replaces `AgentSession.status` (`types.ts:102-114`), whose lifecycle values are `starting|running|parked|stopped|failed`.
<!-- consolidation: exists; ref: docs/specs/sessions.md#sessions; reason: Activity is derived from current evidence. -->
<!-- consolidation: discard; ref: docs/BLUEPRINT.md#durable-conversation-and-operation-records; reason: Durable lifecycle enum as authority is superseded. -->

### 1.2 `[D2]` No durable serialization — delete the schema work

**The activity axis is never written to `state.json`.** Concretely:
<!-- consolidation: exists; ref: docs/specs/sessions.md#sessions; reason: Runtime observations are ephemeral. -->

- Do **not** extend `AgentSession` (`src/agent-workspace/types.ts:59-83`) with `activity`/`activityAt`.
<!-- consolidation: exists; ref: docs/BLUEPRINT.md#durable-conversation-and-operation-records; reason: Durable records do not store historical activity. -->
- Do **not** touch `SESSION_KEYS` (`src/agent-workspace/session-store.ts:104-125`) or `isSession` (`session-store.ts:130-146`). The existing `hasOnlyKeys` whitelist (`session-store.ts:126-128`) is exactly why an unlisted field would fail validation — so adding a field would be a breaking, lock-contending change for data we deliberately do not keep.
<!-- consolidation: discard; ref: none; reason: Historical validator implementation and assignment freeze. -->
- `SessionState.version` stays `1` and gains nothing (`session-store.ts:20`, `:273`).
<!-- consolidation: discard; ref: docs/BLUEPRINT.md#durable-conversation-and-operation-records; reason: Historical schema version is not a target constraint. -->
- `SessionStore.mutate` (`session-store.ts:196-221`, real `proper-lockfile` lock + atomic replace) is **never called for activity**. Zero per-tick writes, zero lock contention, zero crash-consistency work.
<!-- consolidation: exists; ref: docs/architecture/session-harness.md#session; reason: Observation has no durable lifecycle write. -->
- The whole of §5 of the previous revision (persist ≤5 s, reload staleness, malformed-activity handling) is **removed**. Its only purpose was reload stability, which `[D2]` rejects: a restart must not show a stale green.
<!-- consolidation: discard; ref: docs/specs/sessions.md#sessions; reason: Superseded revision history is not needed in core. -->

**Consequence:** the only durable artifact the activity axis touches is the ephemeral per-launch sidecar (§2.6), which lives inside the owned `mkdtemp` directory and is removed with it (`session-launch.ts:186`, `:222-223`). Nothing else on disk records activity.
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Temp-sidecar claim contradicts the deterministic task-directory sidecar later in this document. -->

### 1.3 Mapping table

| AOE evidence | AgenticWorkspace `AgentActivity` |
|---|---|
| launch < 3 s / `starting` | `starting` <!-- consolidation: discard; ref: docs/specs/sessions.md#sessions; reason: Historical timer floor was explicitly removed by BACK-15. --> |
| fresh hook `running` (<30 s) or chrome spinner | `running` <!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Specific hook-age and chrome interpretation require provider evidence. --> |
| hook `waiting`, or blocked-prompt chrome | `waiting` <!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Provider-specific permission evidence must be verified. --> |
| hook `idle`, parked prompt chrome, stale shell | `idle` <!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#session; reason: Stale-shell and chrome evidence cannot automatically prove idle. --> |
| hook `error`, dead pane + hook, tmux error | `error` <!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#sessions; reason: Error mapping must preserve stopped versus unavailable evidence distinctions. --> |
| tmux inconclusive inside the 4 s/30 s windows, or no evidence yet after attach | `unknown` <!-- consolidation: exists; ref: docs/specs/sessions.md#sessions; reason: Missing evidence is unknown. --> <!-- consolidation: discard; ref: none; reason: Historical AOE grace windows are not adopted core timing. --> |
| durable `stopped`/`failed` | `stopped` (no probe) <!-- consolidation: discard; ref: docs/specs/sessions.md#sessions; reason: Saved labels cannot establish current stopped state. --> |

---

## 2. Per-provider hook/event support + isolated install

### 2.1 Provider matrix (six providers)

`[D1]`: hooks are unconditional for **supported** providers. "Supported" = AOE installs a status hook **or** the provider ships a documented event surface with a **process-scoped** loader. A provider without a process-scoped loader gets **detection only** — we never write a repo or global agent config to force it in (session contract: "Providers without a verified process-scoped loader fail explicitly rather than installing globally or relocating the user's authentication/configuration profile", `docs/opentui-workspace-session-contract.md`).
<!-- consolidation: integrate; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Supported hooks require isolated process-scoped loading and must not force global or project config changes. -->
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#readiness-and-identity-correlation; reason: Upstream hook support alone does not establish current provider acceptance or detection-only capability. -->

| Provider | AOE hook_config? | Provider event/hook surface | Install surface we use | Fallback detection |
|---|---|---|---|---|
| **claude** | **Yes** — `AgentHookConfig { settings_rel_path: ".claude/settings.json", config_dir_env_var: Some("CLAUDE_CONFIG_DIR"), events: CLAUDE_HOOK_EVENTS, format: JsonSettings }` (`src/agents.rs:518-523`) | settings.json hooks; plugin `hooks/hooks.json`; `claude --settings <file-or-json>`; `CLAUDE_CONFIG_DIR` | **Process-scoped.** Write `hooks/hooks.json` **inside the temp plugin dir already passed with `--plugin-dir`** (`session-launch.ts:202-210`). No global/project write. | `detect_claude_status` → `manifests/claude.toml` (`status_detection.rs:64`) <!-- consolidation: discard; ref: none; reason: Claude loader and external detector paths are provider implementation inventory. --> <!-- consolidation: integrate; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Supported hook installation stays in owned temporary launch artifacts with no global or project writes. --> |
| **codex** | **Yes** — `json_hooks(".codex/hooks.json", CODEX_HOOK_EVENTS, HookFormat::CodexJson)` (`src/agents.rs:620-625`) | `hooks.json` next to the active config layer; inline `[hooks]` in `config.toml`; `[features] hooks` (default `true`); hash-based hook trust; `--dangerously-bypass-hook-trust` | **Non-destructive marked merge** into `$CODEX_HOME/hooks.json`, else `~/.codex/hooks.json` — the exact file AOE resolves (`src/hooks/mod.rs:80-90`). Never relocate `CODEX_HOME` (hides the user's auth); never write into the repo `.codex/`. | `detect_codex_status` → `manifests/codex.toml` (`status_detection.rs:67`) <!-- consolidation: discard; ref: none; reason: Codex external hook and detector inventory. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#error-handling; reason: Authorized hook edits must preserve user config and authentication location through marked non-destructive merge. --> <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Automatic Codex install versus later explicit-only installation needs reconciliation. --> |
| **opencode** | **No** hook_config; AOE = pane detection + ACP session capture (`src/agents.rs:547-577`, `SessionCaptureBackend::OpenCode`) | plugin events: `session.idle`, `session.error`, `permission.asked`, `tool.execute.before/after`, generic `event`; `OPENCODE_CONFIG_DIR` custom dir searched for plugins; `OPENCODE_CONFIG_CONTENT` inline config | **Process-scoped.** Point `OPENCODE_CONFIG_DIR` at the owned temp dir and write `<temp>/plugins/agentic-workspace-status.ts`. Removed with the temp dir. Skills keep using `OPENCODE_CONFIG_CONTENT.skills.paths` (`session-launch.ts:197-201`). | `detect_opencode_status` → `manifests/opencode.toml` (`status_detection.rs:65`) <!-- consolidation: discard; ref: none; reason: Version-specific OpenCode loader and detector inventory is not a universal provider contract. --> <!-- consolidation: integrate; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Hook artifacts are owned and removed with their launch resources. --> |
| **pi** | **No** hook_config; AOE relies on its Pi *session-capture extension* for identity, not status (`src/agents.rs:680-694`) | extensions with lifecycle events (`session_start`, `tool_call`, `turn_end`, `agent_end`, `session_shutdown`); **`pi --extension <file>`** session-scoped loader | **Process-scoped.** Write our extension into the owned temp dir and add `--extension <file>` beside the existing `--skill` (`session-launch.ts:212-214`). | `detect_pi_status` → `manifests/pi.toml` (`status_detection.rs:70`); AOE comment "Pi has no hooks and always auto-approves" (`manifests/pi.toml:10`) <!-- consolidation: discard; ref: none; reason: Pi extension and external detector inventory. --> <!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#readiness-and-identity-correlation; reason: Process-scoped Pi emitter acceptance needs live provider verification. --> |
| **omp** | **No** hook_config (`src/agents.ts:846-875`) | hooks under `.omp/hooks/{pre,post}/` (project) or profile dirs; **`omp --hook <dir>`** explicit loader; `pi.on(...)` ExtensionAPI (OMP is a Pi fork) | **Mechanism exists but is unreachable today:** `prepareAgentLaunch` **throws** for `bootstrap === "omp"` (`session-launch.ts:166-171`), so no OMP session can launch. Design: `<temp>/hooks/pre/agentic-workspace-status.ts` + `--hook`, activating only when that launch gate is lifted. | `detect_omp_status` → `manifests/omp.toml` (`status_detection.rs:71`) <!-- consolidation: discard; ref: none; reason: OMP external API and historical launch-gate inventory. --> <!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#harness; reason: OMP isolated loader and launch-gate removal need explicit verification. --> |
| **antigravity** | **No** hook_config (`src/agents.rs:796-808`) | `hooks.json` at workspace `.agents/hooks.json`, global `~/.gemini/config/hooks.json`, or a plugin's `hooks.json`; events `PreToolUse`, `PostToolUse`, `PreInvocation`, `PostInvocation`, `Stop` | **None.** No process-scoped loader and no documented config-dir env. The three documented surfaces are the repo, the user's home, or a plugin install — all forbidden by the session contract. Launch is already refused (`session-launch.ts:161-165`). | `detect_antigravity_status` → `manifests/antigravity.toml` (`status_detection.rs:76`) <!-- consolidation: discard; ref: none; reason: External Antigravity API and historical refusal inventory. --> <!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#harness; reason: Lack of verified isolated loader remains an explicit capability gate. --> |

**Summary of the six:** hook-backed = **claude, codex, opencode, pi** (all four install); designed-but-gated = **omp**; detection-only = **antigravity**.
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#readiness-and-identity-correlation; reason: Summary is not verified support and conflicts with the later dormant Codex launch arm. -->

### 2.2 Provider evidence

Upstream (pinned) evidence per row is in the matrix above (all `src/...:line`). Provider-document evidence:

- **Claude Code** — hooks are configured in JSON settings files, and the documented locations include a plugin's `hooks/hooks.json` (hooks doc, "Hook locations"); `--settings` is a per-session settings tier (settings doc, precedence level 2 "Command line"); `CLAUDE_CONFIG_DIR` relocates the home files (settings doc). `--plugin-dir` is session-only (already cited in `session-launch.ts:203`). <https://code.claude.com/docs/en/hooks>, <https://code.claude.com/docs/en/settings>, <https://code.claude.com/docs/en/plugins/create>
<!-- consolidation: discard; ref: none; reason: External Claude documentation facts remain reference evidence. -->
- **Codex** — hooks load from `hooks.json` next to any active config layer (`~/.codex/hooks.json`, `<repo>/.codex/hooks.json`) or inline `[hooks]` in `config.toml`; non-managed hooks must be reviewed/trusted; `--dangerously-bypass-hook-trust` runs enabled hooks without persisted trust; `[features] hooks` defaults to `true`. <https://developers.openai.com/codex/hooks>, <https://developers.openai.com/codex/local-config>
<!-- consolidation: discard; ref: none; reason: External Codex configuration and trust facts are not automatic product adoption. -->
- **OpenCode** — plugins hook events; local plugins load from `.opencode/plugins/` and from the `OPENCODE_CONFIG_DIR` custom directory; `OPENCODE_CONFIG_CONTENT` is the highest-precedence non-managed inline config. <https://opencode.ai/docs/plugins>, <https://opencode.ai/docs/config>
<!-- consolidation: discard; ref: none; reason: External version-specific plugin documentation. -->
- **Pi** — extensions are TypeScript modules subscribing to lifecycle events via `pi.on()`; `pi --extension ./hello.ts` loads one file for the session. <https://pi.dev/docs/latest/extensions>
<!-- consolidation: discard; ref: none; reason: External Pi extension facts. -->
- **OMP** — hooks are TypeScript modules discovered in `.omp/hooks/pre|post/` or a profile dir, or passed explicitly with `omp --hook <dir>`; events are `pi.on(...)`. <https://omp.sh/docs/hooks>
<!-- consolidation: discard; ref: none; reason: External OMP extension facts. -->
- **Antigravity** — hooks are configured in `hooks.json` at workspace `.agents/`, global `~/.gemini/config/hooks.json`, or inside a plugin; CLI settings live at `~/.gemini/antigravity-cli/settings.json`; plugins are staged under `~/.gemini/antigravity-cli/plugins/`. No process-scoped hooks-file loader or config-dir env is documented. <https://antigravity.google/docs/hooks>, <https://antigravity.google/docs/cli/using>, <https://antigravity.google/docs/cli/features>
<!-- consolidation: discard; ref: none; reason: External Antigravity locations and documentation coverage limit. -->

### 2.3 Generated command / extension contract

For the command-hook providers use AOE's shape, adapted to our owned status path. **Claude** (file
lives inside the per-launch temp dir) uses the literal path:
<!-- consolidation: discard; ref: none; reason: Shell example below is implementation guidance rather than a mandatory command representation. -->

```sh
sh -c 'unset IFS; set -f; umask 077; \
  D="<statusDir>"; [ -n "$D" ] && [ -d "$D" ] || exit 0; \
  printf %s <status> > "$D/status" 2>/dev/null; exit 0 # agentic-workspace-hooks'
```

**Codex** writes a file that outlives the launch, so its command must be constant across launches —
it reads the sidecar path from the injected env var instead of baking one:
<!-- consolidation: integrate; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Persistent hook command text must be launch-independent and resolve the current owned sidecar from explicit environment. -->

```sh
sh -c 'unset IFS; set -f; umask 077; \
  D="${AGENTIC_WORKSPACE_AGENT_STATUS_DIR:-}"; [ -n "$D" ] && [ -d "$D" ] || exit 0; \
  printf %s <status> > "$D/status" 2>/dev/null; exit 0 # agentic-workspace-hooks'
```

Properties copied verbatim from `src/hooks/command.rs:108-140`: `sh -c`, `set -f`, `umask 077`, dir-mode/ownership guard, **unconditional `exit 0`**. Ownership trailer is `0 # agentic-workspace-hooks` mirrors `src/hooks/command.rs:18-31`. (A baked per-launch path in the Codex file would append a differently-pathed duplicate group on every launch; the env-var form is what makes re-install idempotent.)
<!-- consolidation: integrate; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Hook emitters must validate owned private paths and fail harmlessly so tool calls are not blocked. -->
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#error-handling; reason: Exact ownership trailer permits idempotent install and removal without touching user hooks. -->
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: The displayed shell examples do not implement the claimed mode and uid guard and require verification. -->

For the plugin/extension providers (opencode, pi, omp) the emitter is a JS/TS module that writes the same sidecar via `node:fs`, and must be **crash-safe and non-throwing** because a throwing plugin/hook can block the agent's tool calls. It writes `running` on turn/tool start, `waiting` on a permission/approval event, `idle` on turn/settle end, `error` on session error. Event names per provider: Claude/Codex shell events §0.4; OpenCode `session.status` (busy/idle), `session.idle`, `session.error`, `permission.updated`, plus the `chat.message`/`permission.ask`/`tool.execute.before` hook keys (verified against the installed `@opencode-ai/plugin` 1.18 `Hooks`/`Event` types); Pi/OMP `pi.on("session_start"|"tool_call"|"turn_end"|"agent_end"|"session_shutdown")` (verified against the installed pi extension packages).
<!-- consolidation: integrate; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Extension status emission must be non-throwing and not block provider tool calls. -->
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Exact provider event-to-activity mapping needs current signal verification. -->
<!-- consolidation: discard; ref: none; reason: Installed event-name and package-version inventory is historical evidence. -->

### 2.4 Exact injection point in our launch

Single chokepoint: `prepareAgentLaunch` — `src/agent-workspace/session-launch.ts`.
<!-- consolidation: discard; ref: none; reason: Historical launch function location is not a permanent architecture name. -->

> **Resolved (owner decision, supersedes the earlier workspace-only reading).** Status hooks are
> **unconditional at the chokepoint**, for every caller of `prepareAgentLaunch`: native
> `agentic-workspace workspace`, CLI `agent-session start`, and CLI `agent-session ... resume`. There is no
> opt-in parameter and no per-caller branch. A session created by `agent-session start` must behave
> exactly as if the workspace UI created it (scripts and a live preview pane may spin up sessions for
> other tasks), so all three call sites produce the same launch artefacts: the owned status dir, the
> provider hook file, and the provider argv additions. §8 open question 1 is closed this way.
<!-- consolidation: exists; ref: docs/specs/sessions.md#purpose; reason: CLI and workspace start share semantics. -->
<!-- consolidation: integrate; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Explicit owner decision applies unconditional supported hooks equally to launch and resume callers. -->

1. `PrepareAgentLaunchOptions` carries `sessionId?: string` (identity for the sidecar and events).
   All three call sites pass it: `sessions.ts:174` (native prepare), `sessions.ts:293` (CLI start),
   `session-process.ts:210` (resume).
<!-- consolidation: discard; ref: none; reason: Historical optional argument and caller wiring inventory. -->
2. After `const env = launchEnvironment(preset);` create the owned status dir under the existing
   `mkdtemp` root and inject `AGENTIC_WORKSPACE_AGENT_STATUS_DIR=<path>` into `env`. Place it here, **not** in
   `launchEnvironment`, so it never leaks from the parent process.
<!-- consolidation: exists; ref: docs/specs/sessions.md#starting-a-session; reason: Child environment is explicitly constructed rather than inherited. -->
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Temporary status-directory location conflicts with the deterministic sidecar section. -->
3. In the provider branch block:
   - `claude` — add `hooks/hooks.json` next to the existing `.claude-plugin/plugin.json`; command is
     unchanged.
<!-- consolidation: discard; ref: none; reason: Claude-specific launch wiring is implementation inventory. -->
    - `opencode` — write `plugins/agentic-workspace-status.ts` and set `env.OPENCODE_CONFIG_DIR` to the owned dir.
<!-- consolidation: discard; ref: none; reason: OpenCode version-specific launch wiring is implementation inventory. -->
   - `pi` — append `--extension <owned file>` beside `--skill`.
<!-- consolidation: discard; ref: none; reason: Pi launch argument wiring is implementation inventory. -->
   - `codex` — install the marked merge (§2.5) and pass `--dangerously-bypass-hook-trust`. This arm is
     **dormant**: `LAUNCH_REFUSALS` still refuses Codex launches for the unrelated reason that Codex
     has no process-scoped skill loader, so nothing runs it today. Its hook install is reachable today
      through `agentic-workspace agent-session hooks install`.
<!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Hooks-install command approval and dormant launch bypass need reconciliation with the selective API. -->
   - `omp` — unreachable until its launch gate lifts; no code path today.
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#harness; reason: OMP launch gate remains unresolved rather than certified by a plan. -->
4. The status dir is inside `directory`, so the existing `trap 'rm -rf -- <directory>' EXIT` and
   `cleanup()` already remove it. No new cleanup path, and nothing outside it is ever touched —
   except the one deliberate Codex install in §2.5.
<!-- consolidation: integrate; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Owned hook artifacts use existing launch cleanup without deleting foreign configuration. -->
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Exact sidecar cleanup location must reconcile temp and deterministic task paths. -->

Env/command travel: the native workspace path renders `env … sh -c <prepared.command>` and the host
spawns it; the CLI/tmux path re-exports `prepared.env` through `SessionProcess.launchPrepared`.
<!-- consolidation: discard; ref: none; reason: Historical environment transport callgraph. -->

### 2.5 `[D1]` Install + removal — exactly which file, how removed

| Provider | File the hook lands in | Removal |
|---|---|---|
| **claude** | `<owned temp dir>/hooks/hooks.json` (the `--plugin-dir` dir, `session-launch.ts:202-210`) | Removed by the existing `trap`/`cleanup()` with the temp dir (`session-launch.ts:222-223`). Nothing else is written. <!-- consolidation: integrate; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Owned Claude hook artifacts are removed with launch resources only. --> |
| **opencode** | `<owned temp dir>/plugins/agentic-workspace-status.ts`, discovered via `OPENCODE_CONFIG_DIR` | Removed with the temp dir. <!-- consolidation: integrate; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Owned OpenCode hook artifacts are removed with launch resources only. --> |
| **pi** | `<owned temp dir>/agentic-workspace-status-extension.ts` | Removed with the temp dir. <!-- consolidation: integrate; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Owned Pi hook artifacts are removed with launch resources only. --> |
| **codex** | `$CODEX_HOME/hooks.json` else `~/.codex/hooks.json` (`src/hooks/mod.rs:80-90`) | **Marked, merge-preserving, reversible, implemented.** Install replaces our own groups with a canonical set and keeps every user entry byte-identical; removal deletes only entries whose command ends with `0 # agentic-workspace-hooks`, then drops emptied event arrays and an emptied `hooks` key — the exact semantics of AOE's `remove_aoe_entries`/`remove_empty_events` (`src/hooks/json_settings.rs:59-78`) used by `install_hooks`/`uninstall_hooks` (`:83-175`). The stored command takes the sidecar from `AGENTIC_WORKSPACE_AGENT_STATUS_DIR` (never a baked temp path), so the text is **constant across launches** and a re-install onto an already-installed file is a no-op. Reachable today as `agentic-workspace agent-session hooks install` and `agentic-workspace agent-session hooks uninstall`; nothing removes user config at session end. We **read** `config.toml` only to check `[features] hooks`; if disabled we skip the install and never write it (`src/hooks/codex.rs:33-46`, `:48-85`). <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#error-handling; reason: Marked install preserves user bytes and removal affects only owned entries including empty containers. --> <!-- consolidation: integrate; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Persistent command text is launch-independent and reinstall is idempotent. --> <!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Explicit hook-install and uninstall public commands need current API disposition. --> <!-- consolidation: integrate; ref: docs/CONVENTIONS.md#error-handling; reason: Honor disabled hooks without writing user config and never remove it at session end. --> <!-- consolidation: discard; ref: none; reason: Implemented status and external helper names are historical evidence. --> |
| **omp** | `<owned temp dir>/hooks/pre/agentic-workspace-status.ts`, loaded via `--hook` | Removed with the temp dir. (Inactive until the launch gate lifts.) <!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#harness; reason: OMP hook path remains gated and unverified. --> |
| **antigravity** | none | n/a <!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#harness; reason: Antigravity isolated hook capability remains unresolved. --> |

**Never:** write the repo's `.codex/hooks.json` or `.agents/hooks.json`; relocate `CODEX_HOME`/`CLAUDE_CONFIG_DIR`/`~/.gemini` (that hides the user's authentication); rewrite a `hooks.json`/`settings.json` wholesale; install a plugin into a user home; delete a non-marker entry.
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#error-handling; reason: Hook installation must preserve authentication locations and foreign config without wholesale rewrites or unowned deletion. -->

### 2.6 Hook file-write contract

- Path: `<task dir>/<sessionId>.activity/status` — a **deterministic** per-session path derived from the session identity and the same task directory that already holds `<sessionId>.log` and `<sessionId>.md`. Determinism (not persistence) is what lets a session started by the CLI be read by the workspace and vice versa: both sides compute the same path from the durable record, so nothing about activity is stored (`[D2]`). The hook *file* still lives in the per-launch temp dir; only the sidecar is deterministic. The launch removes the sidecar on stop (shell `trap` + `cleanup()`).
<!-- consolidation: integrate; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Cross-entry-point observation locates a session-owned sidecar by identity and removes it on execution stop. -->
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Exact task-path layout conflicts with temp-sidecar statements and obsolete log and bootstrap neighbors. -->
- Freshness is enforced for every status, not just `running`: a write older than the 900 s standing ceiling is ignored entirely, so a file orphaned by a hard-killed session reads as absent, never as a live status.
<!-- consolidation: integrate; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Orphaned sidecars must not establish live activity. -->
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Exact 900-second ceiling conflicts with the later removal of AOE timing and needs reconciliation. -->
- Dir mode `0700`, file read cap, mtime = freshness. Mirrors `src/hooks/status_file.rs:46-67` (`read_hook_status` + `read_hook_status_age`).
<!-- consolidation: integrate; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Private sidecar permissions bounded reads and freshness checks are supported safety constraints missing from core. -->
- Status value whitelist: `running|waiting|idle|error` only (`src/agents.rs:10-15`); anything else is treated as absent, matching `src/hooks/status_file.rs:69-81`.
<!-- consolidation: integrate; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Hook evidence is validated against recognized values and malformed input supplies no activity evidence. -->
- **Attached external sessions** (CLI-owned, already running) read the same deterministic sidecar, so a CLI-started session shows the same activity as a workspace-started one. Only a pane AgenticWorkspace did not launch at all (no sidecar) falls back to pane/title + output evidence; state that as lower fidelity, never as an error.
<!-- consolidation: exists; ref: docs/specs/sessions.md#purpose; reason: CLI and workspace starts have identical semantics. -->
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Pane-title-output fallback and fidelity presentation require verified provider applicability. -->

---

## 3. Detection + reconciliation layer

New module `src/agent-workspace/agent-status.ts` (pure resolver) + thin probe in `src/agent-workspace/agent-status-probe.ts`.
<!-- consolidation: discard; ref: none; reason: Historical module placement is implementation inventory. -->

### 3.1 Observation sources

| Id | Source | Repo anchor |
|---|---|---|
| `hook` | activity sidecar file + mtime (hook-backed providers only; §2.6) | new; path per §2.6 <!-- consolidation: integrate; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Supported status hooks supply validated session-owned sidecar evidence. --> |
| `pane` | `#{pane_dead}`, `#{pane_current_command}`, `#{pane_title}`, `#{window_activity}` | `src/agent-workspace/live/tmux/exec.ts:81` (`createTmuxExec`), `session-process.ts:228` (`#{pane_dead}`) <!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#runningexecution; reason: Exact pane metadata evidence and provider interpretation need verification. --> |
| `output` | live byte liveness | the controller's output subscription <!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#session; reason: Output bytes alone do not establish provider activity and require an evidence contract. --> |
| `lifecycle` | durable session status | `src/agent-workspace/types.ts:16-23` <!-- consolidation: discard; ref: docs/specs/sessions.md#sessions; reason: Durable lifecycle labels are superseded. --> |
| `alive` | tmux pane/process liveness | `workspace-controller.ts:66` (`isAgentAlive`), `session-process.ts:403` (`alive`) <!-- consolidation: exists; ref: docs/architecture/session-harness.md#runningexecution; reason: Observation uses current execution evidence with explicit uncertainty. --> |

### 3.2 Precedence (our resolver, mirroring AOE)

1. `lifecycle ∈ {stopped, failed}` → `stopped`; no probe (AOE rule 0).
<!-- consolidation: discard; ref: docs/specs/sessions.md#sessions; reason: Saved labels cannot establish stopped state. -->
2. within 3 s of `createdAt` → `starting` (AOE rule 1).
<!-- consolidation: discard; ref: none; reason: BACK-15 explicitly removes this timer floor. -->
3. held `error` younger than 30 s → `error` (AOE rule 2).
<!-- consolidation: discard; ref: none; reason: BACK-15 explicitly removes this error latch. -->
4. tmux absent → `error`; tmux unreachable → hold current for 4 s / 30 s (AOE rule 3).
<!-- consolidation: discard; ref: docs/specs/sessions.md#sessions; reason: Historical grace-timer resolver is superseded by current unknown and stopped evidence semantics. -->
5. dead pane **and** a hook was seen → `error` (AOE rule 4; hook-gated).
<!-- consolidation: discard; ref: docs/specs/sessions.md#sessions; reason: Retained AOE sample rule is not current runtime-state authority. -->
6. configured per-agent rules (none initially; reserved) (AOE 5b).
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Reserved user rule feature is unapproved and conflicts with the non-goal below. -->
7. **hook rule, hook-backed providers only**, freshness-gated: fresh `running` <30 s **600**; standing `running` <900 s **400**; `idle` **300**; `error` **300**; `waiting` **240** and only when the pane capture is empty (AOE 5d/5e, `src/tmux/detect/manifest.rs:394-448`).
<!-- consolidation: discard; ref: none; reason: BACK-15 retains this numeric precedence only as external AOE history. -->
8. pane/title chrome rules for the six providers — the manifest equivalent (`src/tmux/detect/manifests/{claude,codex,opencode,pi,omp,antigravity}.toml`).
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: External chrome rules require current provider evidence before adoption. -->
9. no match → keep last known activity (`src/tmux/detect/mod.rs:88-93`); on a cold attach with no evidence at all → `unknown`, never `idle` (`[D2]`).
<!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#sessions; reason: Keeping old activity without current evidence needs a bounded validity rule. -->
<!-- consolidation: exists; ref: docs/specs/sessions.md#sessions; reason: No evidence means unknown rather than idle. -->
10. `running → idle` commits only after a confirming poll (`pending` hold, AOE 5g).
<!-- consolidation: discard; ref: none; reason: BACK-15 explicitly removes one-poll hysteresis. -->

Staleness/timeouts are **copied verbatim**: 3 s starting, 30 s error relatch, 900 s stale running, 30 s fresh-running hook, 4 s/30 s unknown windows, 2 s snapshot TTL with half-life refresh. Cited in §0.
<!-- consolidation: discard; ref: none; reason: The following BACK-15 divergence explicitly supersedes this timer layer. -->

> **AgenticWorkspace divergence (BACK-15).** AgenticWorkspace removed this sample-and-timer layer. The 3 s starting
> floor, the 30 s error latch, the 900 s standing `running` window, and rule 10's one-poll
> `Running → Idle` hold are gone; activity is event-driven (sidecar reads via `fs.watch`, coalesced
> ~10 ms, initial reconcile, slow 30 s backstop) and liveness-gated (a sidecar counts only while its
> pane is alive). Source of truth is the durable session status; the sidecar is the event stream. The
> rules above are retained only to document what AOE does.
<!-- consolidation: discard; ref: none; reason: Removed sampling timers are historical AOE comparison material. -->
<!-- consolidation: integrate; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Hook event evidence requires current liveness gating. -->
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Exact watcher debounce and sidecar layout need current disposition. -->
<!-- consolidation: discard; ref: docs/specs/sessions.md#sessions; reason: Durable session status as source of truth is superseded by observation. -->

### 3.3 `skip_capture` gate (cost)

Implement the AOE gate exactly: skip the capture when `window_activity == lastActivity` **and** `lastCaptureSecond > activity` **and** no fresh hook **and** no pending proposal (`status_update.rs:7-20`). Reusing it is what makes an idle agent cost zero tmux calls.
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport; reason: Exact capture gate and zero-tmux cost claim require adoption and measurement in the shared streaming design. -->

### 3.4 Reconcile, never rewrite lifecycle

Status resolution must not call `AgentSessionService.liveSession`, `reconcileTaskSessions`, `resumeLivePreviewPane`, or any `SessionProcess.kill*` implicitly. Those stay explicit (`docs/opentui-workspace-session-contract.md`, ownership boundary; `sessions.ts:89-117`, `:359`). The resolver returns a value; only the existing explicit paths (`sessions.ts:119`, `:200`, `:211`, `:332`) mutate durable state.
<!-- consolidation: exists; ref: docs/BLUEPRINT.md#observation-stop-and-deletion; reason: Observation is separate from lifecycle commands and durable publication. -->
<!-- consolidation: discard; ref: none; reason: Historical service method names and mutation-path inventory are not fixed core APIs. -->

---

## 4. Scheduling: reuse the existing refresh coalescing

### 4.1 Do not drive remounts from the poller

Critical repo fact: a workspace refresh disposes and re-mounts the surface (`workspace-controller.ts:363-365` disposes `#mount`; `:247-249` tracks it). Driving that at 500 ms would strobe the TUI and re-create `mountWorkspaceStatusTabs` (`workspace.ts:368`) each tick.
<!-- consolidation: discard; ref: none; reason: Lifecycle implementation plan explicitly refutes this old remount snapshot. -->

Therefore:

- The poller writes into a controller-owned map `#activity: Map<sessionId, {activity, at}>` (new, beside `#agents` at `workspace-controller.ts:285`).
<!-- consolidation: discard; ref: docs/architecture/session-harness.md#session; reason: Exact controller map is historical implementation and Session now owns observation. -->
- Add a **non-remounting** update path: extend the mount with `setActivity(readonly Map<string, AgentActivity>)`, which mutates the existing `activeSessionTaskIds` state (`workspace.ts:94`) and calls the existing `redraw` (`workspace.ts:406`). No `dispose`, no re-mount, no tab churn.
<!-- consolidation: unconfirmed; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Non-remounting presentation contract is useful but exact API and adoption are not settled by core. -->
- Full refresh runs only when the *snapshot* changes (task set, selection, session identity), exactly as today. Activity changes ride `setActivity`.
<!-- consolidation: unconfirmed; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Exact refresh invalidation policy is not a current core requirement. -->

### 4.2 Intervals and cost bound

- Status poll: **500 ms** while at least one workspace-owned live agent exists; **1 s** when only attached/external panes are live; **5 s** for disk/durable reconciliation. (AOE `app.rs:592-603` cadences, `reference` §3.1.)
<!-- consolidation: discard; ref: docs/specs/sessions.md#sessions; reason: Obsolete tiered polling is replaced by event evidence and thirty-second all-task observation. -->
- One **batched** tmux probe per tick for all live sessions (`list-panes -a`-style metadata), never one fork per session; TTL 2 s, refresh at half-life. Reuse `createTmuxExec` (`src/agent-workspace/live/tmux/exec.ts:81`).
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#runningexecution; reason: Batch-probe API and cache timings require current adoption evidence. -->
- Pause polling while `#hasModal()` is true (`workspace-controller.ts:405`, `:419-429`) and while a session start/attach is in flight — those already schedule their own refresh.
<!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#sessions; reason: Pausing observation under modals must reconcile the all-task thirty-second guarantee. -->
- The tick runs on a timer, never on the paint path, so it cannot add input latency.
<!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Renderer performs no provider discovery or I/O. -->
<!-- consolidation: unconfirmed; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Timer scheduling alone does not prove absence of input latency. -->
- Gated tick with no change → no tmux call, no repaint (AOE skip-capture + `refresh_needed` gate, `reference` §3.2).
<!-- consolidation: unconfirmed; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Exact idle fork and repaint budgets need current measurement. -->

### 4.3 Lifetime

Start the poller in `run()` after the first `#refresh()` (`workspace-controller.ts:328`) and after `#viewState.subscribe` (`:330-331`). Stop it in `destroy()` (`:346-350`) next to `#unsubscribe` so no timer survives teardown. This preserves the session contract's "closing OpenTUI MUST NOT call session lifecycle" rule.
<!-- consolidation: discard; ref: none; reason: Historical poller start callsites are implementation inventory. -->
<!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Frontend-owned observation watchers and timers must be disposed on frontend teardown. -->
<!-- consolidation: exists; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Closing the frontend cannot stop sessions. -->

---

## 5. `[D2]` Derive-on-attach, nothing persisted

- **No durable write, ever.** No `state.json` field (§1.2), no separate persisted cache, no `SessionStore.mutate` for activity (`session-store.ts:196-221`).
<!-- consolidation: exists; ref: docs/specs/sessions.md#sessions; reason: Observations remain ephemeral. -->
- **Derive on attach/open.** When the workspace mounts a session, the resolver runs immediately over the available live evidence: the ephemeral sidecar (if we own the launch), the batched tmux probe, and output liveness. The first committed value after attach is whatever the evidence supports; with no evidence it is `unknown` (§3.2 rule 9).
<!-- consolidation: exists; ref: docs/specs/sessions.md#sessions; reason: Current evidence determines state and absence of evidence is unknown. -->
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#session; reason: Exact immediate-attach batching and output-evidence mechanism needs current verification. -->
- **Restart semantics fall out for free.** Because nothing was written, a restart cannot replay a stale green: the sidecar dir was removed with the launch (`session-launch.ts:222-223`), and any re-attach re-derives from the live pane. A previously `waiting` agent shows `unknown` until a probe or a fresh hook write, never a stale value.
<!-- consolidation: exists; ref: docs/specs/sessions.md#sessions; reason: Restart cannot establish current liveness from historical state. -->
<!-- consolidation: discard; ref: docs/specs/sessions.md#observe-and-detach-from-a-live-session; reason: Frontend restart does not imply launch ended or its sidecar was removed. -->
- **In-memory only, keyed by session identity**, so the stale-identity rules of §6.3 already cover late results.
<!-- consolidation: exists; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Ephemeral observations and events are routed by current execution identity. -->
- **Stop/teardown clears it.** `destroy()` (`workspace-controller.ts:346-350`) drops `#activity` with the rest of the controller state; nothing outlives the process.
<!-- consolidation: exists; ref: docs/specs/sessions.md#sessions; reason: In-process observation is not durable history. -->
- **`reset`** (`sessions.ts:71-73`; `session-store.ts:227-230`) still only removes persisted state and does not stop a tmux process; it is unaffected by this plan because activity was never persisted.
<!-- consolidation: discard; ref: docs/BLUEPRINT.md#observation-stop-and-deletion; reason: Metadata-only removal cannot bypass required execution cleanup. -->
- **Uninstall for the one global file (codex)** runs through the marked removal in §2.5; nothing else on disk is ours to remove.
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#error-handling; reason: Hook uninstall removes only marker-owned configuration entries. -->

> **AgenticWorkspace divergence (BACK-15).** Derive-on-attach remains, but the resolver no longer carries the
> AOE timing layer: the 3 s starting floor, the 30 s error latch, the 900 s standing `running` window,
> and rule 10's one-poll `Running → Idle` hold were intentionally removed and replaced by event-driven
> sidecar reads plus liveness gating. A restart, or a not-yet-probed active session, reads as parked
> blue until a hook transition or the bounded ~30 s reconcile sweep supplies evidence; it never reads
> as a stale green.
<!-- consolidation: discard; ref: none; reason: Removed AOE timing rules are historical evidence. -->
<!-- consolidation: integrate; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Hook event observations require live-execution evidence. -->
<!-- consolidation: exists; ref: docs/DESIGN-SYSTEM.md#status-and-activity; reason: Unknown and starting activity use blue rather than stale working green. -->
<!-- consolidation: exists; ref: docs/specs/sessions.md#sessions; reason: Thirty-second observation and no historical-state replay are specified. -->

---

## 6. UI mapping (no flicker, no remount churn)

### 6.1 What changes

| Surface | Repo anchor | Change |
|---|---|---|
| Task row marker `●` | `workspace.ts:438-439` | The dot is the agent-session indication, a single map keyed by task id, rendered iff the task has an active session. Colour by activity: `running` (working)→green, parked (`idle`/`unknown`/`starting`/released)→blue, `waiting`→orange, `error`→red; no active session→no dot. Uses `getStatusColor` (`src/ui/status-icon.ts:32`). Row still renders inside the active **task-status** tab group. <!-- consolidation: exists; ref: docs/screens/workspace.md#states; reason: Active-session dots appear on task rows and disappear when no active session exists. --> <!-- consolidation: exists; ref: docs/DESIGN-SYSTEM.md#status-and-activity; reason: Working green permission orange idle-unknown-starting blue and error red are approved. --> <!-- consolidation: discard; ref: docs/specs/sessions.md#sessions; reason: Historical parked or released labels are not authoritative runtime states. --> <!-- consolidation: discard; ref: none; reason: Map and color helper are implementation details. --> |
| Agent header | `workspace.ts` agent header render | `Agent session · <preset> · <activity>`. <!-- consolidation: discard; ref: docs/screens/workspace.md#ordered-regions; reason: Current header requires agent runtime status selected mode and actual path. --> |
| Agent placeholder | `workspace.ts` agent pane | `waiting` → "Agent is waiting for input."; keep existing `starting`/`error` strings. <!-- consolidation: unconfirmed; ref: docs/screens/workspace.md#states; reason: Exact placeholder copy is explicitly not approved. --> |
| Details session line | `workspace.ts:138` (`agentSessionDetails`) | Append activity next to durable status. <!-- consolidation: discard; ref: docs/specs/sessions.md#sessions; reason: Durable lifecycle status is superseded. --> |

### 6.2 Status tabs stay untouched

The tabs (`src/ui/opentui/status-tabs.ts:26`) render **task statuses**, not agent activity. They must not gain counts, cells, or a second data source. The spec's TTT geometry and colours are fixed (`docs/opentui-workspace-spec.md`, TTT tab reference). **This plan changes zero lines in `status-tabs.ts`.**
<!-- consolidation: exists; ref: docs/screens/workspace.md#ordered-regions; reason: Task-status tab geometry colors and no-count rule are specified. -->
<!-- consolidation: discard; ref: none; reason: File edit exclusion is a historical assignment boundary. -->

### 6.3 Anti-flicker rules

1. Activity updates go through `setActivity` + `redraw` (`workspace.ts:406`), never a full `#scheduleRefresh` (`workspace-controller.ts:379`).
<!-- consolidation: unconfirmed; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Exact non-remounting update path needs adoption beyond source references. -->
2. `setActivity` must be a no-op when the value is unchanged (avoids `requestRender` storms).
<!-- consolidation: unconfirmed; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: No-op render optimization is not an explicit current contract. -->
3. The mount identity (`#mount`, `workspace-controller.ts:247`) must be stable across activity updates — assert in tests that `dispose` (`:363`) is not called.
<!-- consolidation: unconfirmed; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Stable-mount acceptance needs current adoption and verification. -->
4. Selection identity guard is preserved: activity is keyed by `sessionId` and committed only when that session is still the mounted one.
<!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Asynchronous presentation stays bound to the current selected identity. -->
5. A late poll for an unselected/old session is dropped silently, reusing the contract's `AgentPresentationIdentity` rule (`docs/opentui-workspace-session-contract.md`, stale-output rejection).
<!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Obsolete results cannot update a replacement view. -->

---

## 7. Phased rollout

Format mirrors `docs/opentui-workspace-implementation-plan.md` (deliverable → slices → review evidence → stop condition). Every phase is reviewable via `agentic-workspace workspace` or `bun run cli workspace`; no phase ends with docs/tests only.
<!-- consolidation: discard; ref: none; reason: Historical phase format is execution planning. -->
<!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Retain interactive phase acceptance gates pending current disposition. -->

### Phase 0 — `[D2]` In-memory activity model (no schema)

**Deliverable:** `AGENT_ACTIVITY_STATUS` + `AgentActivity` (`types.ts`), and a controller-owned `#activity` map. **No `state.json` change.**
<!-- consolidation: discard; ref: none; reason: Historical enum and map implementation task. -->
<!-- consolidation: exists; ref: docs/specs/sessions.md#sessions; reason: Activity remains ephemeral. -->
**Slices:** enum (`types.ts`) + controller map (`workspace-controller.ts:285`).
<!-- consolidation: discard; ref: none; reason: Historical file and line allocation. -->
**Review evidence:** a workspace run never writes `activity`/`activityAt`; `state.json` is byte-identical before and after a session with activity updates.
<!-- consolidation: exists; ref: docs/specs/sessions.md#sessions; reason: Observation alone cannot persist activity. -->
**Verification (no full-app run):** `bun test src/agent-workspace/session-store.test.ts src/agent-workspace/config.test.ts`; `bun run check:types`.
<!-- consolidation: discard; ref: none; reason: Historical suite command inventory is not a permanent test invocation. -->
**Stop:** the store schema is provably unchanged and old files still read.
<!-- consolidation: discard; ref: docs/CONVENTIONS.md#changes-and-refactoring; reason: Historical schema compatibility freeze cannot constrain current-contract-only changes. -->

### Phase 1 — Hook emitters + process-scoped install (claude, opencode, pi)

**Deliverable:** generated hook command / plugin / extension; owned `activity/status` path; `AGENTIC_WORKSPACE_AGENT_STATUS_DIR` injected unconditionally at the chokepoint (§2.4); provider install in `session-launch.ts` for claude/opencode/pi.
<!-- consolidation: integrate; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Supported hooks are installed consistently with an explicit owned status target. -->
**Slices:** command generator + temp install (`session-launch.ts`, new `status-hooks.ts`); provider emitters (claude `hooks/hooks.json`, opencode plugin, pi extension); `sessionId` plumbing at all three call sites (`sessions.ts:174`, `:293`, `session-process.ts:210`).
<!-- consolidation: discard; ref: none; reason: Historical hook implementation allocation. -->
**Review evidence:** launch each of claude/opencode/pi from the workspace; send a prompt (`running`), trigger a permission/approval prompt (`waiting`), end a turn (`idle`); confirm the file appears only under the owned temp dir and nothing is written to `~/.claude`, `~/.config/opencode`, `~/.pi`, or the project. CLI `agent-session start`/`resume` produce the same artefacts either way: with a live workspace context the CLI hands the launch to that workspace, and the workspace's own chokepoint installs the hooks; without one the CLI launches and stops the session itself, installing them on the way. A session created from the CLI is therefore indistinguishable from one created by the workspace UI.
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#readiness-and-identity-correlation; reason: Retain real-provider hook transition and config-isolation proof until exercised. -->
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Temp-only sidecar assertion conflicts with deterministic task-owned status path. -->
<!-- consolidation: discard; ref: docs/BLUEPRINT.md#component-ownership; reason: Historical workspace-context dispatch and CLI-owned stopping are not current shared-operation ownership. -->
<!-- consolidation: exists; ref: docs/specs/sessions.md#purpose; reason: CLI and TUI start semantics are identical. -->
**Verification:** `bun test src/agent-workspace/session-launch.test.ts`; PTY smoke of `agentic-workspace workspace`.
<!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#testing; reason: Hook launch source and PTY acceptance remain distinct pending evidence. -->
**Stop:** hook status changes on real events; zero global writes proven for the three providers.
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#readiness-and-identity-correlation; reason: Preserve real-event and global-write isolation acceptance gate. -->

### Phase 2 — Codex marked install + removal (**implemented**, owner decision)
<!-- consolidation: discard; ref: none; reason: Implemented heading is historical status not current verification. -->

**Deliverable:** merge-preserving write of `$CODEX_HOME/hooks.json` (else `~/.codex/hooks.json`) with the `0 # agentic-workspace-hooks` trailer; **constant command text** that reads the sidecar from `AGENTIC_WORKSPACE_AGENT_STATUS_DIR` so re-install is idempotent; removal that deletes only marker entries; `config.toml` read-only (never written); `hooks install` / `hooks uninstall` CLI verbs; `--dangerously-bypass-hook-trust` on Codex launches.
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#error-handling; reason: Owned marked config merge must preserve user entries and be reversible and idempotent without writing config.toml. -->
<!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Codex hook verbs need current selective API disposition. -->
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#harness; reason: Earlier accepted trust bypass must be explicitly reconciled with the current provider launch gate rather than silently enabled or retired. -->
**Slices:** merge/remove + install/uninstall (`status-hooks.ts`); codex arm in the `session-launch.ts` provider block (dormant until the separate Codex skill-loader gate lifts); the two CLI verbs.
<!-- consolidation: discard; ref: none; reason: Historical implementation task allocation. -->
**Review evidence:** install on a fixture with pre-existing user hooks adds one group and leaves user entries byte-identical; a second install is a byte-level no-op; uninstall restores the original file exactly; a `[features] hooks = false` config is never written and the install is skipped; a foreign non-marker entry survives uninstall.
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#testing; reason: Provider config editing requires byte-preserving install-uninstall roundtrip idempotence disabled-hook and foreign-entry regression coverage. -->
**Verification:** `bun test src/agent-workspace/status-hooks.test.ts` (byte-level round-trip on a fixture). No real Codex session can be exercised: `LAUNCH_REFUSALS` still refuses Codex launches for the unrelated skill-loader reason, so the launch arm is dormant and the install is exercised through the CLI verb + fixture tests.
<!-- consolidation: discard; ref: none; reason: Historical suite and dormant-code evidence. -->
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#readiness-and-identity-correlation; reason: Codex live launch acceptance remains gated and unverified. -->
**Stop:** install→uninstall is a no-op on a user `hooks.json`.
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#testing; reason: Exact user configuration roundtrip is a required safety acceptance check. -->

### Phase 3 — Detection + reconciliation (pure, no UI)

**Deliverable:** `src/agent-workspace/agent-status.ts` resolver + `skip_capture` gate, implementing §3 precedence and §0 constants.
<!-- consolidation: discard; ref: none; reason: BACK-15 explicitly supersedes the copied timer resolver. -->
**Slices:** resolver; probe adapter (`createTmuxExec`); boundary tests.
<!-- consolidation: discard; ref: none; reason: Historical implementation allocation. -->
**Review evidence:** table-driven fixtures reproduce each precedence row, including the exact boundaries (3 s, 30 s, 900 s, 4 s/30 s windows) and the `Running→Idle` hold; hook rules fire only for hook-backed providers.
<!-- consolidation: discard; ref: none; reason: Copied timing and hysteresis fixtures are superseded by BACK-15. -->
**Verification:** new `bun test src/agent-workspace/agent-status.test.ts`; `bun run check:types`.
<!-- consolidation: discard; ref: none; reason: Historical affected-suite command inventory. -->
**Stop:** resolver output matches the pinned AOE table for every fixture.
<!-- consolidation: discard; ref: none; reason: External table parity is not the current product acceptance authority. -->

### Phase 4 — Poller + coalescing

**Deliverable:** single background status poller; batched tmux probe; `#activity` map; `setActivity` mount update; start/stop in `run()`/`destroy()`.
<!-- consolidation: discard; ref: none; reason: Historical poller architecture predates the stated event-driven divergence. -->
**Slices:** scheduler/coalescing; batched probe; mount update path.
<!-- consolidation: discard; ref: none; reason: Historical implementation allocation. -->
**Review evidence:** while idle, the workspace makes ~zero tmux status calls; changing activity repaints without a mount dispose.
<!-- consolidation: unconfirmed; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Idle fork and no-remount acceptance require current adoption and runtime evidence. -->
**Verification:** focused `bun test src/test/opentui-workspace-controller.test.ts` (extended) with a fake runtime; instrumented fork counter.
<!-- consolidation: discard; ref: none; reason: Historical test implementation recipe. -->
**Stop:** no remount storm; idle fork budget holds.
<!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#testing; reason: Retain performance acceptance until verified against current observation policy. -->

### Phase 5 — UI mapping

**Deliverable:** dot colour, agent header, placeholder text.
<!-- consolidation: discard; ref: none; reason: Phase deliverable inventory has detailed dispositions in the UI mapping section. -->
**Slices:** workspace render (`workspace.ts:138`, `:438-439`); controller props (`workspace-controller.ts`).
<!-- consolidation: discard; ref: none; reason: Historical implementation locations. -->
**Review evidence:** real `agentic-workspace workspace` shows green→yellow→dim transitions without flicker; tabs unchanged.
<!-- consolidation: discard; ref: docs/DESIGN-SYSTEM.md#status-and-activity; reason: Yellow and dim activity acceptance is superseded by orange and blue semantics. -->
<!-- consolidation: unconfirmed; ref: docs/screens/workspace.md#states; reason: Flicker-free runtime acceptance still needs evidence rather than a source-only claim. -->
**Verification:** `bun test src/test/opentui-workspace-layout.test.ts src/test/opentui-status-tabs.test.ts` (tabs must stay green and unmodified); PTY smoke.
<!-- consolidation: discard; ref: none; reason: Historical suite selection. -->
<!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#testing; reason: Preserve visual PTY acceptance as distinct from source tests. -->
**Stop:** visual stability confirmed by the user.
<!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: User visual acceptance is not evidenced by this plan. -->

### Phase 6 — `[D2]` Attach derivation + non-hook providers

**Deliverable:** derive-on-attach path; `unknown`-until-evidence; pane/title chrome rules for omp and antigravity; documented lower fidelity for attached external sessions.
<!-- consolidation: exists; ref: docs/specs/sessions.md#sessions; reason: Unknown until current evidence is approved. -->
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: OMP and Antigravity chrome and external fidelity require verified support. -->
**Slices:** attach-time resolver run; chrome rules for omp/antigravity; attached-session fidelity surfacing.
<!-- consolidation: discard; ref: none; reason: Historical implementation task inventory. -->
**Review evidence:** close and reopen the workspace; a previously `waiting` agent shows `unknown`, never stale `waiting` and never a false green; an OMP/Antigravity pane yields a pane-derived activity.
<!-- consolidation: exists; ref: docs/specs/sessions.md#sessions; reason: Old observations cannot establish current state after reopen. -->
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#readiness-and-identity-correlation; reason: OMP and Antigravity detection proof remains outstanding. -->
**Verification:** `bun test src/test/opentui-workspace-controller.test.ts`; PTY reopen smoke.
<!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#testing; reason: Reopen runtime acceptance is separate from controlled controller tests. -->
**Stop:** reload semantics match §5.
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Reload gate needs resolution of conflicting sidecar lifetime statements. -->

### Phase 7 — Hardening + parity audit

**Deliverable:** race/teardown hardening, docs update (`docs/opentui-workspace-spec.md`, session contract), parity matrix.
<!-- consolidation: discard; ref: none; reason: Historical hardening work inventory does not imply completion. -->
**Review evidence:** all listed failure modes hold (inconclusive probe leaves status unchanged with a notice; modal pauses polling; teardown leaves no timer).
<!-- consolidation: exists; ref: docs/specs/sessions.md#sessions; reason: Inconclusive observation leaves the agent untouched. -->
<!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#sessions; reason: Modal pause must be reconciled with required periodic observation. -->
<!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Frontend teardown clears its observation timers. -->
**Verification:** each affected suite run **one file per process**; `bun run check:types`; scoped Biome on changed files; PTY smoke.
<!-- consolidation: exists; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: Relevant source type lint and runtime evidence are separate checks. -->
**Stop:** user approves; no full-app test run required at any point.
<!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#tooling-and-validation; reason: User phase approval is not established by this plan. -->
<!-- consolidation: exists; ref: docs/CONVENTIONS.md#testing; reason: Iteration uses affected suites rather than full suite by default. -->

---

## 8. Non-goals, risks, open questions

### Non-goals

- No AOE manifest/TOML engine and no user-editable `status_rules` UI.
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Detection engine exclusion is an unconfirmed implementation choice and conflicts with reserved rules above. -->
- No new **task** statuses and **no `Done`** on the activity axis (AOE has none, `status.rs:5-15`).
<!-- consolidation: exists; ref: docs/specs/sessions.md#sessions; reason: Runtime observations are separate from task completion status. -->
- No change to durable lifecycle semantics (`starting|running|parked|stopped|failed`).
<!-- consolidation: discard; ref: docs/BLUEPRINT.md#durable-conversation-and-operation-records; reason: Durable lifecycle enum is explicitly superseded. -->
- **`[D1]` No per-preset opt-out** — no `statusHooks`, no settings toggle, no card override. Hooks are on for every provider with a supported surface.
<!-- consolidation: integrate; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Explicit owner decision rejects hook opt-outs. -->
- **`[D2]` No activity persistence** — no `state.json` field, no settings key, no sidecar outside the ephemeral launch dir.
<!-- consolidation: exists; ref: docs/specs/sessions.md#sessions; reason: No durable activity or settings cache. -->
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Temp-only sidecar restriction contradicts the deterministic task path. -->
- No hook install for **antigravity** (no isolated surface) and no active hook install for **omp** until its launch gate lifts (`session-launch.ts:166-171`).
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#harness; reason: Provider isolated-loader gates require current verification before lifting. -->
- No global/project/user config writes beyond the single marked, reversible Codex `hooks.json` merge.
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#error-handling; reason: Hook config writes are restricted to the explicitly authorized marked reversible exception. -->
- No activity-driven lifecycle mutation (no implicit start/stop/resume/reconcile).
<!-- consolidation: exists; ref: docs/BLUEPRINT.md#observation-stop-and-deletion; reason: Observation has no lifecycle authority. -->
- No changes to `status-tabs.ts` geometry, colours, or data source.
<!-- consolidation: exists; ref: docs/screens/workspace.md#ordered-regions; reason: Status tabs retain task-domain geometry colors and source. -->

### Risks / failure modes

1. **Provider hook schema unverified for the emitters** (Claude plugin `hooks.json` accepted from a `--plugin-dir`; OpenCode plugin discovery via `OPENCODE_CONFIG_DIR`; Pi `--extension`; OMP `--hook`). Mitigation: per-provider emitter behind §7 phase gates; on failure fall back to pane/title; never install globally. `[INFERENCE]` until each phase exercises a real session.
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#readiness-and-identity-correlation; reason: Retain per-provider real-session verification gate and do not infer support from upstream inventory. -->
<!-- consolidation: integrate; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Emitter failure must not trigger global hook installation. -->
2. **Codex hook trust.** New non-managed Codex hooks require review/trust (`/hooks`), and AOE's own approach preserves `[hooks.state]` rather than faking trust (`src/hooks/codex.rs:88-111`). **Resolved:** our Codex launches pass the documented `--dangerously-bypass-hook-trust` (see open question 2). Risk: a silent non-firing hook looks like a false `unknown`.
<!-- consolidation: discard; ref: none; reason: External trust mechanics are research evidence. -->
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#harness; reason: Preserve prior trust-bypass decision pending explicit current launch-policy reconciliation and live hook proof. -->
3. **Codex `hooks.json` is in the user's home.** The install is marked and reversible (§2.5), but a bug could still mis-delete user entries. Mitigation: byte-level round-trip test (install→uninstall is a no-op) is a merge gate.
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#testing; reason: Byte-level user-hook roundtrip is a mandatory preservation safety gate. -->
4. **Stale `waiting` after Esc-cancel** — AOE issue #2937: `waiting` is written on prompt open, and Esc fires no clearing hook. Mitigation: `hook_waiting` is the lowest-priority hook rule and only fires on an empty capture (`manifests/claude.toml:145-149`, `manifest.rs:404-417`); we must copy that, not let a bare hook write win.
<!-- consolidation: discard; ref: none; reason: External issue is source evidence. -->
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Copying empty-capture waiting precedence needs verification after removal of the AOE timer resolver. -->
5. **Poll causing remount storm.** Mitigation: §6.3 — activity never via a full refresh; test asserts stable mount identity.
<!-- consolidation: unconfirmed; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Retain no-remount acceptance concern pending current presentation-policy adoption. -->
6. **tmux capture cost / alternate-screen.** Mitigation: `skip_capture` + batched metadata + 2 s TTL; never capture when activity is unchanged.
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport; reason: Exact capture optimization and TTL require current streaming-path validation. -->
7. **`%` mangling in tmux format strings** (AOE correction in `docs/aoe-agent-workspace-reference.md` §6). Mitigation: use `display-message -p` with literal formats, never a bare `%` in a command string.
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport; reason: Preserve formatting-safety concern but verify exact command-layer applicability before promoting a blanket rule. -->
8. **Injection changes CLI behaviour too**, since `prepareAgentLaunch` is shared. **Accepted (owner decision):** hooks are unconditional at the chokepoint — CLI-created sessions must be indistinguishable from workspace-created ones (§2.4). `[D1]` rejects both a per-preset and a per-caller opt-out.
<!-- consolidation: integrate; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Explicit owner decision requires unconditional hooks across supported CLI and TUI launch callers. -->
9. **Attached external sessions have no sidecar.** Mitigation: pane/title fidelity, surfaced as such (§2.6); never `error`.
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Clarify external versus CLI-started sessions and verify fallback evidence before claiming all attached sessions lack sidecars. -->

### Open questions (human decision)

1. ~~Do non-workspace CLI sessions (`agentic-workspace agent-session start`) also get hooks, or only native-workspace launches?~~ **Resolved: every caller, unconditionally.** Hooks are enabled at the shared chokepoint for the workspace, CLI start, and CLI resume alike; no opt-in and no per-caller branch (§2.4).
<!-- consolidation: integrate; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Accepted answer requires hook parity across all supported launch and resume callers. -->
2. ~~**Codex trust:** do we pass `--dangerously-bypass-hook-trust` for our launches, or require the user to trust the hook via `/hooks` once?~~ **Resolved: marked merge + `--dangerously-bypass-hook-trust`.** Phase 2 is implemented (§2.5, §7 Phase 2), with a constant env-var command so re-install is idempotent and an explicit `agentic-workspace agent-session hooks uninstall` for removal.
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#error-handling; reason: Accepted marked merge uses launch-independent text and reversible idempotent ownership. -->
<!-- consolidation: unconfirmed; ref: docs/specs/supported-integration-operations.md#supported-integration-operations; reason: Earlier trust-bypass and uninstall decision needs current API and provider-gate reconciliation without silently discarding its approval history. -->
<!-- consolidation: discard; ref: none; reason: Implemented phase status is not current acceptance evidence. -->
3. **Antigravity:** if a process-scoped hooks-file loader or config-dir env exists but is undocumented, it should be verified and this row revisited; otherwise Antigravity stays detection-only.
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#harness; reason: Antigravity isolated-loader capability remains unanswered. -->

*(Resolved and removed: per-preset opt-out `[D1]`; persist-vs-sidecar `[D2]`; first-cut provider list — the user fixed all six; workspace-only scope (superseded by unconditional coverage); Codex trust.)*
<!-- consolidation: discard; ref: none; reason: Resolution recap duplicates individually classified decisions above. -->

---

## 9. Test strategy

### 9.1 Existing suites affected

| Suite | Why |
|---|---|
| `src/agent-workspace/session-launch.test.ts` | new `sessionId` option + process-scoped install for claude/opencode/pi <!-- consolidation: discard; ref: none; reason: Historical affected-suite inventory. --> |
| `src/agent-workspace/session-store.test.ts` | **must stay green unmodified** — proves `[D2]` kept the schema untouched <!-- consolidation: discard; ref: none; reason: Historical affected-suite and schema-freeze scope. --> |
| `src/agent-workspace/config.test.ts` | untouched; run to prove preset shape unchanged <!-- consolidation: discard; ref: none; reason: Historical affected-suite inventory. --> |
| `src/test/opentui-workspace-controller.test.ts` | poller, coalescing, stale-identity, no-remount assertions <!-- consolidation: discard; ref: none; reason: Historical affected-suite inventory. --> |
| `src/test/opentui-workspace-layout.test.ts` | marker/header rendering <!-- consolidation: discard; ref: none; reason: Historical affected-suite inventory. --> |
| `src/test/opentui-status-tabs.test.ts` | must stay green **unmodified** (proves tabs untouched) <!-- consolidation: discard; ref: none; reason: Historical affected-suite inventory. --> |
| `src/test/agent-sessions.test.ts` | durable lifecycle unchanged <!-- consolidation: discard; ref: docs/specs/sessions.md#sessions; reason: Durable lifecycle preservation is obsolete. --> |
| `src/test/view-state-store.test.ts` | coalescing semantics reused, must not regress <!-- consolidation: discard; ref: none; reason: Historical affected-suite inventory. --> |
| `src/test/opentui-agent-host-cleanup.test.ts` | teardown still leaves no timers/children <!-- consolidation: discard; ref: none; reason: Historical affected-suite inventory does not authorize stopping surviving agents. --> |

Rule: one suite per process; never bare `bun test`.
<!-- consolidation: exists; ref: docs/CONVENTIONS.md#testing; reason: Affected-suite iteration follows the delegated AGENTS test procedure. -->

### 9.2 New focused tests (genuinely needed)

**Behaviour + boundaries** — `src/agent-workspace/agent-status.test.ts`:
- precedence table across every §3.2 row;
<!-- consolidation: discard; ref: none; reason: BACK-15 supersedes the copied AOE resolver table. -->
- exact boundary ages: 899/900 s stale-running, 29/30 s fresh-running, 2.9/3.0 s starting, 29/30 s error relatch, 3.9/4.0 s and 29.9/30.0 s unknown windows;
<!-- consolidation: discard; ref: none; reason: Removed AOE timing-layer fixtures. -->
- dead pane **with** hook → `error`; dead pane **without** hook → pane verdict (AOE rule 4 is hook-gated);
<!-- consolidation: discard; ref: docs/specs/sessions.md#sessions; reason: Copied AOE error precedence is not current runtime-state authority. -->
- `waiting` hook with non-empty capture → falls to chrome; empty capture → `waiting`;
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Waiting chrome fallback requires provider-specific current verification. -->
- hook rules never fire for a non-hook-backed provider (omp, antigravity);
<!-- consolidation: exists; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Unsupported provider events cannot be invented. -->
- `skip_capture` truth table including the "capture inside or before the activity second proves nothing" case (`status_update.rs:492-510`).
<!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#launch-context-and-shared-terminal-transport; reason: Retain optimization boundary test if capture-gate adoption is confirmed. -->

**Hook generation + installs** — `src/agent-workspace/status-hooks.test.ts`:
- generated commands/extensions contain only owned temp paths; no `~`, no project, no global path;
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Temp-only assertion conflicts with deterministic task sidecar and explicit Codex exception. -->
- command ends with the `0 # agentic-workspace-hooks` sentinel; rejects providers without a session-local loader;
<!-- consolidation: integrate; ref: docs/architecture/session-harness.md#route-runtime-events-and-observe; reason: Ownership sentinel and isolated-loader rejection need hook safety coverage. -->
- claude/opencode/pi installs create a file **only** under the mkdtemp dir;
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#testing; reason: Hook artifact installation must be verified to stay within its owned temporary directory. -->
- codex install on a fixture with pre-existing user hooks adds one group and leaves user entries byte-identical; `uninstall` restores the original bytes exactly; a `[features] hooks = false` config is never written and the install is skipped.
<!-- consolidation: integrate; ref: docs/CONVENTIONS.md#testing; reason: Provider config edits require byte-preserving roundtrip and disabled-hook tests. -->

**`[D2]` no-write assertions** — added to `src/agent-workspace/session-launch.test.ts` / controller tests:
- a session with activity transitions leaves `state.json` byte-identical;
<!-- consolidation: exists; ref: docs/specs/sessions.md#sessions; reason: Runtime observation cannot write historical activity. -->
- `SessionStore.mutate` is not called for activity (spy on the store, asserted by observable file content, not private internals).
<!-- consolidation: exists; ref: docs/architecture/session-harness.md#session; reason: Observation does not publish durable lifecycle changes. -->

**Race / integration** — additions to `src/test/opentui-workspace-controller.test.ts`:
- a poll result for a superseded `sessionId`/epoch is dropped with zero text/status/focus change;
<!-- consolidation: exists; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Obsolete presentation results cannot affect the current selection. -->
- polling pauses while a modal owns focus (`#hasModal`, `workspace-controller.ts:405`);
<!-- consolidation: unconfirmed; ref: docs/specs/sessions.md#sessions; reason: Modal pause needs reconciliation with periodic runtime observation. -->
- N consecutive activity updates leave `#mount` identity unchanged (no `dispose`, `:363`) and do not call `mountWorkspace` again;
<!-- consolidation: unconfirmed; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Exact stable-mount acceptance remains a proposed optimization contract. -->
- teardown clears the poller timer (`destroy()`, `:346-350`).
<!-- consolidation: integrate; ref: docs/architecture/application-boundaries.md#ui-controller-feature-modules-renderer-and-terminal-host; reason: Frontend-owned observation scheduling must be disposed on teardown. -->

### 9.3 Explicitly excluded

- No mock-echo tests: nothing that only asserts a stub returns what it was configured to return, or that a fake returns a canned status.
<!-- consolidation: exists; ref: docs/CONVENTIONS.md#testing; reason: Focused tests verify real behavior rather than configured double output. -->
- No test asserts private internals without an observable surface (status shown, file written, fork count).
<!-- consolidation: exists; ref: docs/CONVENTIONS.md#testing; reason: Observable behavior at controlled boundaries is the verification standard. -->
- No live-provider suite is a gate: provider hook schemas are verified interactively in §7; automated tests use recorded hook JSON fixtures and synthetic pane text only.
<!-- consolidation: exists; ref: docs/CONVENTIONS.md#testing; reason: Controlled automated fixtures and live-provider evidence prove different things. -->
<!-- consolidation: unconfirmed; ref: docs/architecture/session-harness.md#readiness-and-identity-correlation; reason: Preserve interactive provider acceptance and do not read no-live-suite as waiver of live verification. -->

---

## 10. Citation index

**Repo — launch/injection:** `session-launch.ts:26-32,37-43,45-61,146-225,151-174,186,194,197-201,202-211,212-214,222-223`; `sessions.ts:71,89-117,119,170-174,200,211,284-298,332,359`; `session-process.ts:189,228,403`; `bootstrap.ts:49,86`.

**Repo — model/store:** `types.ts:16-23,35-47,59-83`; `session-store.ts:20,104-125,126-128,130-146,179-193,196-221,220-226`.

**Repo — detection/scheduling/UI:** `workspace-controller.ts:66,67-95,247-249,285,328,330-331,346-350,363-365,379,405,419-429`; `workspace.ts:94,138,368,406,438-439`; `status-tabs.ts:26`; `status-icon.ts:32`; `live/tmux/exec.ts:81`.

**Docs:** `docs/opentui-workspace-spec.md` (status tabs, refresh coalescing); `docs/opentui-workspace-session-contract.md` (ownership, no global installs, stale-output identity, process-scoped loader rule); `docs/opentui-workspace-implementation-plan.md` §8 (verification standard); `docs/aoe-agent-workspace-reference.md` §2.3 (stale claim corrected), §6.

**Upstream (pinned `0a17c859173a8794abfb55ae7e8038c4c4b17e7d`):** `src/agents.rs:10-15,17-26,57-66,214-225,227-249,341-369,392-410,512-546,547-577,620-625,680-694,796-808,846-875`; `src/session/instance/status.rs:5-15,34-37`; `src/tmux/detect/manifest.rs:175-183,394-448`; `src/tmux/status_detection.rs:24-41,64-77`; `src/tmux/detect/manifests/{claude,codex,opencode,pi,omp,antigravity}.toml`; `src/hooks/mod.rs:69,75-90,93-108,110-116,118-140`; `src/hooks/command.rs:18-31,51-70,108-140`; `src/hooks/json_settings.rs:31-57,59-78,83-138,140-175`; `src/hooks/codex.rs:33-46,48-85,88-111,154-172`; `src/hooks/status_file.rs:46-67,69-81`; `src/hooks/dir_guard.rs:48-56`; `src/session/instance/hooks.rs:10-37`; `src/session/instance/status_update.rs:7-20,22-24,135-163,185-228,230-430,466-483,492-510`.

**Provider docs:** Claude hooks/settings/plugins — <https://code.claude.com/docs/en/hooks>, <https://code.claude.com/docs/en/settings>, <https://code.claude.com/docs/en/plugins/create>; Codex hooks/config — <https://developers.openai.com/codex/hooks>, <https://developers.openai.com/codex/local-config>; OpenCode plugins/config — <https://opencode.ai/docs/plugins>, <https://opencode.ai/docs/config>; Pi extensions — <https://pi.dev/docs/latest/extensions>; OMP hooks — <https://omp.sh/docs/hooks>; Antigravity hooks/CLI — <https://antigravity.google/docs/hooks>, <https://antigravity.google/docs/cli/using>, <https://antigravity.google/docs/cli/features>, <https://antigravity.google/docs/cli/reference>.
