---
consolidation:
  total: 70
  counts:
    exists: 10
    discard: 19
    integrate: 0
    unconfirmed: 41
  percentages:
    exists: 14.29%
    discard: 27.14%
    integrate: 0.00%
    unconfirmed: 58.57%
---
## Local Development

> **Runtime requirement:** Use the Bun version pinned by CI and `@types/bun`. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: CI pin is required but agreement with the types package is not established. --> Bun 1.3.5 fixed the macOS websocket CPU regression tracked in [oven-sh/bun#23536](https://github.com/oven-sh/bun/issues/23536), <!-- consolidation: discard; ref: none; reason: Historical upstream regression evidence is reference material rather than a durable core requirement. --> so local development should stay on current Bun 1.3.x builds or newer rather than the old 1.2.23 workaround. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Bun 1.4 minimum explicitly supersedes older 1.3 guidance. -->

Run these commands to bootstrap the project:

```bash
bun install
```
<!-- consolidation: exists; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Dependency installation uses bun install. -->

Run tests:

```bash
bun run test
```
<!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Exact test invocation is delegated to AGENTS and package scripts. -->

Format and lint:

```bash
npx biome check .
```
<!-- consolidation: discard; ref: docs/CONVENTIONS.md#validation; reason: Core names bun run check and delegates command inventory to package scripts. -->

For contribution guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Nix Packaging

The flake uses bun2nix v2 to turn the repository's `bun.lock` into an offline
dependency cache. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Generator version and cache implementation are package-definition inventory rather than core requirements. --> Regenerate `bun.nix` whenever `bun.lock` changes: <!-- consolidation: exists; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Lockfile changes require Nix regeneration. -->

```bash
bun run update-nix
```
<!-- consolidation: exists; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Use the pinned update-nix script. -->

The command pins the bun2nix generator version, so commit the resulting
`bun.nix` change together with the lockfile change. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Pinned regeneration and including its generated change are explicit. --> Validate the package with:

```bash
nix build .#agentic-workspace
./result/bin/agentic-workspace --version
```
<!-- consolidation: exists; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Nix build and resulting CLI version are the required package validation. -->

The package build also runs the installed CLI and MCP smoke checks. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Retain packaging smoke-check inventory with the package definition without approving MCP retention. --> Lock
generation does not require Docker <!-- consolidation: discard; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Lock-generation tooling prerequisites are package-specific operational reference. --> and package installation does not rewrite
Nix files. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Installation file-write behavior is package-specific operational reference. -->

The flake is intentionally limited to `x86_64-linux`, `aarch64-linux`, and
`aarch64-darwin`, which are the systems supported by the current Nixpkgs Bun
package. <!-- consolidation: discard; ref: none; reason: Current Nix platform matrix is package inventory rather than an approved product support commitment. --> On x86_64 Linux, the application runs with the matching official Bun
baseline runtime to support processors that have AVX but not AVX2. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Baseline CPU support rationale is retained but its durable platform requirement is not established by core. --> Dependency
installation, the non-compile bundle build, the development shell, and the
installed application all select that baseline runtime on x86_64 Linux. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Runtime selection locations are package implementation inventory. --> The
Nix install check executes the packaged CLI natively and under QEMU's Ivy
Bridge CPU model. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Retain native and emulated packaging checks with package-specific validation. --> JSC's JIT is disabled only for the emulated check because it
is not reliable under QEMU user mode; normal packaged execution keeps JIT
enabled. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Emulator-only JIT workaround and reliability rationale need verification before durable adoption or retirement. --> A negative control verifies that the same emulated CPU rejects a
pinned AVX2-only Bun archive before accepting the baseline runtime. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Retain negative-control evidence in package-specific smoke checks rather than promote test mechanics to core. -->

## MCP Development Setup

This project supports MCP (Model Context Protocol) integration. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: MCP retention is expressly undecided. --> To develop and test MCP features:

### Prerequisites

Install at least one AI coding assistant: <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: MCP development prerequisite depends on retained integration scope and external tooling. -->
- [Claude Code](https://claude.ai/download)
- [OpenAI Codex CLI](https://openai.com/codex)
- [Google Gemini CLI](https://cloud.google.com/gemini/docs/codeassist/gemini-cli)
- [Kiro CLI](https://kiro.dev)

### Local MCP Testing

#### 1. Start MCP Server in Development Mode

```bash
# Terminal 1: Start the MCP server
bun run mcp

# Optional: include debug logs
bun run mcp -- --debug
```
<!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: MCP start and debug invocation are unapproved integration inventory. -->

The server will start and listen on stdio. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Retention of this stdio MCP server remains unresolved. --> You should see log messages confirming the stdio transport is active. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Logging behavior and destination need verification against protocol-clean stdout. -->

#### 2. Configure Your Agent

Choose one of the methods below based on your agent:

**Claude Code (Recommended for Development):** <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Recommended MCP client has no approved selection evidence. -->
```bash
# Add to project (creates .mcp.json)
claude mcp add agentic-workspace-dev -- bun run mcp
```
<!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: External client registration syntax and claimed project configuration require verification if MCP is retained. -->

**Codex CLI:**
```bash
# Edit ~/.codex/config.toml
[mcp_servers.agentic-workspace-dev]
command = "bun"
args = ["run", "mcp"]
```
<!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Codex MCP configuration is conditional external integration guidance. -->

**Gemini CLI:**
```bash
gemini mcp add agentic-workspace-dev bun run mcp
```
<!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Gemini registration syntax and MCP retention are unsettled. -->

**Kiro CLI:**
```bash
kiro-cli mcp add --scope global --name agentic-workspace-dev --command bun --args run,mcp
```
<!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Kiro registration syntax and MCP retention require verification and disposition. -->

#### 3. Test the Connection

Open your agent and test:
- "Show me all tasks in this project" <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: MCP task listing is not an approved integration promise. -->
- "Create a test task called 'Test MCP Integration'" <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Task creation purpose is approved but MCP delivery is unsettled. -->
- "Display the current board" <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: MCP board display is not approved by the TUI board contract. -->

#### 4. Development Workflow

1. Make changes to MCP tools in `src/mcp/tools/` <!-- consolidation: discard; ref: none; reason: Source-location navigation remains operational reference and does not approve MCP retention. -->
2. Restart the MCP server (Ctrl+C, then re-run) <!-- consolidation: discard; ref: none; reason: Retain local development restart procedure outside core consolidation. -->
3. Restart your AI agent <!-- consolidation: discard; ref: none; reason: Retain client restart procedure as operational guidance. -->
4. Test your changes <!-- consolidation: exists; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Affected behavior requires focused verification. -->

### Testing Individual Agents

Each AI agent has different configuration requirements. <!-- consolidation: discard; ref: none; reason: External-tool configuration context belongs in integration reference. --> Start the server from your project root and follow the assistant's instructions to register it: <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: MCP registration procedure and project-root prerequisite remain conditional. -->

```bash
agentic-workspace mcp start
```
<!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: MCP command surface is explicitly unsettled. -->

### Testing with MCP Inspector

Use the Inspector tooling when you want to exercise the stdio server outside an AI agent. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Inspector recommendation depends on MCP retention and tool compatibility verification. -->

#### GUI workflow (`npx @modelcontextprotocol/inspector`)

1. Launch the Inspector UI in a terminal: `npx @modelcontextprotocol/inspector` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: External Inspector invocation has not been verified or adopted as a retained integration requirement. -->
2. Choose **STDIO** transport. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Transport configuration is conditional on retained MCP support. -->
3. Fill the connection fields exactly as follows:
   - **Command**: `bun` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Inspector executable configuration remains conditional. -->
   - **Arguments** (enter each item separately): `--cwd`, `/Users/<you>/Projects/agentic-workspace`, `src/cli/index.ts`, `mcp`, `start` <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Exact source CLI argument contract is not approved MCP scope. -->
   - Remove any proxy token; it is not needed for local stdio. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Authentication advice requires Inspector transport verification and cannot be approved from this recipe. -->
4. Connect and use the tools/resources panes to issue MCP requests. <!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Inspector panes and supported MCP resources need verification if retained. -->

> Replace `/Users/<you>/Projects/agentic-workspace` with the absolute path to your local AgenticWorkspace checkout. <!-- consolidation: discard; ref: none; reason: Retain local example substitution instruction outside core. -->

`bun run mcp` by itself prints Bun's `$ bun …` preamble, which breaks the Inspector’s JSON parser. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Exact preamble and parser failure need version-specific verification while the stdout safety rule remains approved. --> If you prefer using the package script here, add `--silent` so the startup log disappears: <!-- consolidation: exists; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Retained stdio integration may require Bun silent invocation to keep stdout clean. -->

```
Command: bun
Arguments: run, --silent, mcp
```
<!-- consolidation: exists; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Silent MCP script invocation is the documented conditional stdout safeguard. -->

> Remember to substitute your own project directory for `/Users/<you>/Projects/agentic-workspace`. <!-- consolidation: discard; ref: none; reason: Retain local path substitution instruction outside core consolidation. -->

#### CLI workflow (`npx @modelcontextprotocol/inspector-cli`)

Run the CLI helper when you want to script quick checks:

```bash
npx @modelcontextprotocol/inspector-cli \
  --cli \
  --transport stdio \
  --method tools/list \
  -- bun --cwd /Users/<you>/Projects/agentic-workspace src/cli/index.ts mcp start
```
<!-- consolidation: unconfirmed; ref: docs/specs/interfaces.md#supported-integration-operations; reason: Inspector CLI package flags and tool-list invocation require external verification if MCP is retained. -->

The key detail in both flows is to call `src/cli/index.ts mcp start` directly (or `bun run --silent mcp`) so stdout stays pure JSON for the MCP handshake. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Direct entry or silent script preserves protocol stdout for any retained stdio integration. -->

### Adding New MCP Agents


### Project Structure

```
agentic-workspace/
├── src/
│   ├── mcp/
│   │   ├── errors/          # MCP error helpers
│   │   ├── resources/       # Read-only resource adapters
│   │   ├── tools/           # MCP tool implementations
│   │   ├── utils/           # Shared utilities
│   │   ├── validation/      # Input validators
│   │   └── server.ts        # createMcpServer entry point
└── docs/
    ├── mcp/                 # User-facing MCP docs
    └── development/         # Developer docs
```
<!-- consolidation: discard; ref: none; reason: Directory tree is source-navigation inventory and not an approved architectural commitment. -->

## Release

AgenticWorkspace now relies on npm Trusted Publishing with GitHub Actions OIDC. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#development-and-packaging; reason: OIDC release authentication needs scoped workflow evidence and is not established by core. --> The
release workflow builds binaries, publishes all npm packages, <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Release artifact and package coverage require workflow verification. --> and records
provenance automatically. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Automatic release provenance needs workflow evidence and is not established by core. --> Follow the steps below to keep the setup healthy.

### Prerequisites

- Choose the release version and ensure your git tag follows the
  `v<major.minor.patch>` pattern. <!-- consolidation: discard; ref: none; reason: Retain release tag procedure in operational release documentation. --> The workflow automatically rewrites
  `package.json` files to match the tag, so you do **not** need to edit the
  version field manually. <!-- consolidation: unconfirmed; ref: none; reason: Automatic version rewrite conflicts with the later version-bump instruction and needs workflow verification. -->
- In npm's **Trusted publishers** settings, link the
  `BarrMan/agentic-workspace` repository and the `Release multi-platform executables`
  workflow for each package: `agentic-workspace`,
  `agentic-workspace-linux-{x64,arm64}`, `agentic-workspace-darwin-{x64,arm64}`, and
  `agentic-workspace-windows-x64`. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Trusted publisher repository workflow and package mapping require verification before adoption or retirement. -->
- Remove the legacy `NODE_AUTH_TOKEN` repository secret. Publishing now uses
  the GitHub-issued OIDC token, so no long-lived npm tokens should remain. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Preserve token-retirement security instruction until OIDC readiness and release requirements are verified. -->
- The workflow activates `npm@latest` (currently 11.6.0 as of 2025-09-18) via
  Corepack to satisfy npm's trusted publishing requirement of version 11.5.1 or
  newer. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Historical npm version minimum and Corepack activation need current release-tool verification. --> If npm raises the minimum version again, the latest tag will pick it
  up automatically. <!-- consolidation: unconfirmed; ref: none; reason: Automatic compatibility with future npm requirements is unsupported. -->

### Publishing steps

1. Commit the version bump and create a matching tag. <!-- consolidation: unconfirmed; ref: none; reason: Required manual version bump conflicts with automatic tag-driven version rewrite above. --> You can either push the
   tag from your terminal
   ```bash
   git tag v<major.minor.patch>
   git push origin main v<major.minor.patch>
   ```
   <!-- consolidation: unconfirmed; ref: none; reason: Exact publication prerequisites and triggers remain unverified. -->
   or create a GitHub Release in the UI (which creates the tag automatically).
   Both paths trigger the same `Release multi-platform executables` workflow. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Tag-push and UI-release examples need trigger verification and remain operational guidance. -->
2. Monitor the workflow run:
   - `Dry run trusted publish` and `Dry run platform publish` confirm that
     npm accepts the trusted publisher token before any real publish. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Preserve dry-run publication gate pending verification of what the named checks prove. -->
   - Publishing uses trusted publishing (no tokens) so npm automatically records
     provenance; no additional CLI flags are required. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Automatic provenance and tokenless publishing require verified workflow and npm behavior. -->
3. After the workflow completes, verify provenance on npm by opening each
   package's **Provenance** tab or by running `npm view <package> --json | jq '.dist.provenance'`. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#development-and-packaging; reason: Retain provenance verification gate while exact evidence surface and release policy await verification. -->

[← Back to README](README.md)
