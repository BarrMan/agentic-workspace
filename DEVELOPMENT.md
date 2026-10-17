## Local Development

> **Runtime requirement:** Bun >= 1.4 is required; CI pins 1.4.3.

Run these commands to bootstrap the project:

```bash
bun install
```

Run tests:

```bash
bun test <file> --timeout=10000
```

For all tests:

```bash
bun run test
```

Validate:

```bash
bun run check
```

For contribution guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Nix Packaging

Regenerate `bun.nix` whenever `bun.lock` changes:

```bash
bun run update-nix
```

The command pins the bun2nix generator version, so commit the resulting
`bun.nix` change together with the lockfile change. Validate the package with:

```bash
nix build .#agentic-workspace
./result/bin/agentic-workspace --version
```

Lock generation does not require Docker and package installation does not rewrite
Nix files.

The flake is intentionally limited to `x86_64-linux`, `aarch64-linux`, and
`aarch64-darwin`, which are the systems supported by the current Nixpkgs Bun
package. On x86_64 Linux, the application runs with the matching official Bun
baseline runtime to support processors that have AVX but not AVX2. Dependency
installation, the non-compile bundle build, the development shell, and the
installed application all select that baseline runtime on x86_64 Linux. The
Nix install check executes the packaged CLI natively and under QEMU's Ivy
Bridge CPU model. JSC's JIT is disabled only for the emulated check because it
is not reliable under QEMU user mode; normal packaged execution keeps JIT
enabled. A negative control verifies that the same emulated CPU rejects a
pinned AVX2-only Bun archive before accepting the baseline runtime.

## Release

AgenticWorkspace now relies on npm Trusted Publishing with GitHub Actions OIDC. The
release workflow builds binaries, publishes all npm packages, and records
provenance automatically. Follow the steps below to keep the setup healthy.

### Prerequisites

- Choose the release version and ensure your git tag follows the
  `v<major.minor.patch>` pattern. The workflow automatically rewrites
  `package.json` files to match the tag, so you do **not** need to edit the
  version field manually.
- In npm's **Trusted publishers** settings, link the
  `BarrMan/agentic-workspace` repository and the `Release multi-platform executables`
  workflow for each package: `agentic-workspace`,
  `agentic-workspace-linux-{x64,arm64}`, `agentic-workspace-darwin-{x64,arm64}`, and
  `agentic-workspace-windows-x64`.
- Remove the legacy `NODE_AUTH_TOKEN` repository secret. Publishing now uses
  the GitHub-issued OIDC token, so no long-lived npm tokens should remain.
- The workflow activates `npm@latest` (currently 11.6.0 as of 2025-09-18) via
  Corepack to satisfy npm's trusted publishing requirement of version 11.5.1 or
  newer. If npm raises the minimum version again, the latest tag will pick it
  up automatically.

### Publishing steps

1. Commit the version bump and create a matching tag. You can either push the
   tag from your terminal
   ```bash
   git tag v<major.minor.patch>
   git push origin main v<major.minor.patch>
   ```
   or create a GitHub Release in the UI (which creates the tag automatically).
   Both paths trigger the same `Release multi-platform executables` workflow.
2. Monitor the workflow run:
   - `Dry run trusted publish` and `Dry run platform publish` confirm that
     npm accepts the trusted publisher token before any real publish.
   - Publishing uses trusted publishing (no tokens) so npm automatically records
     provenance; no additional CLI flags are required.
3. After the workflow completes, verify provenance on npm by opening each
   package's **Provenance** tab or by running `npm view <package> --json | jq '.dist.provenance'`.

[← Back to README](README.md)
