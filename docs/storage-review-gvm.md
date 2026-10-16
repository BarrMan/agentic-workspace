---
consolidation:
  total: 81
  counts:
    exists: 0
    discard: 57
    integrate: 0
    unconfirmed: 24
  percentages:
    exists: 0.00%
    discard: 70.37%
    integrate: 0.00%
    unconfirmed: 29.63%
---
# GVM package-set storage review

## Decision

**Keep the active/default `go1.27.0/global` set. Review older sets, then conditionally clean their module caches rather than deleting entire sets.** <!-- consolidation: unconfirmed; ref: none; reason: Historical cleanup recommendation requires owner permission and satisfied cache gates. --> The older sets contain 33,233,829,888 allocated bytes (30.95 GiB) of module-cache storage. <!-- consolidation: discard; ref: none; reason: Historical pre-cleanup allocation. --> Their installed binaries are separate and should be preserved until their consumers and replacement versions are established. <!-- consolidation: unconfirmed; ref: none; reason: Binary migration and consumer review remain unresolved. -->

This is a read-only review of `~/.gvm/pkgsets` and relevant GVM version/environment metadata. Only this report was written. No cleanup, installation, environment switching, shell-script sourcing, repository modification, or symlink traversal occurred. <!-- consolidation: discard; ref: none; reason: Historical audit scope and non-action record. -->

## Measurement and validation

- Package sets total **39,849,099,264 bytes (37.11 GiB)**, exactly matching the preceding home audit. <!-- consolidation: discard; ref: none; reason: Historical host measurement. -->
- All 12 discovered version/package-set combinations are `global`; no named custom sets were found. <!-- consolidation: discard; ref: none; reason: Historical host inventory. -->
- One complete allocated-storage metadata walk: `st_blocks × 512`, same filesystem only, hardlink deduplication. No symlinks or duplicate hardlink entries were encountered within these sets. No permission errors or unfinished sets. <!-- consolidation: discard; ref: none; reason: Historical scan method and coverage. -->
- Walk plus two independent `du -x -s -k` checks completed in **105.26 seconds**. The checks had 12-second individual limits and both completed. <!-- consolidation: discard; ref: none; reason: Historical validation timing. -->
- `go1.24.2/global`: scan and `du` both **8,351,424,512 bytes (7.78 GiB)**. <!-- consolidation: discard; ref: none; reason: Historical validation measurement. -->
- `go1.24.7/global`: scan and `du` both **6,745,788,416 bytes (6.28 GiB)**. <!-- consolidation: discard; ref: none; reason: Historical validation measurement. -->
- APFS clone/shared extents are not deduplicated by `stat` or these `du` totals. Allocated attribution is not a guarantee of uniquely reclaimable physical space. Contents were not hashed or compared; atime was not used to infer use or disuse. <!-- consolidation: discard; ref: none; reason: Historical accounting and inference limits. -->

## Size-ranked sets and recommendations

All paths below are relative to `~/.gvm/pkgsets`; every row is the named version's `global` set. Module-cache totals include unpacked dependencies, fetched Git repositories, archives, and downloaded toolchains, but exclude `bin`. <!-- consolidation: discard; ref: none; reason: Report-local inventory definition. -->

| Version | Total allocated bytes (size) | Module-cache bytes (size) | Recommendation |
|---|---:|---:|---|
| go1.24.2 | 8,351,424,512 (7.78 GiB) | 8,185,221,120 (7.62 GiB) | REVIEW binaries; CONDITIONAL-CLEANUP cache <!-- consolidation: unconfirmed; ref: none; reason: Binary preservation and cache cleanup gates unresolved by this review. --> |
| go1.24.7 | 6,745,788,416 (6.28 GiB) | 6,656,856,064 (6.20 GiB) | REVIEW binaries; CONDITIONAL-CLEANUP cache <!-- consolidation: unconfirmed; ref: none; reason: Binary preservation and cache cleanup gates unresolved by this review. --> |
| go1.27.0 | 6,206,631,936 (5.78 GiB) | 5,960,273,920 (5.55 GiB) | KEEP: active/default and current repositories require it <!-- consolidation: unconfirmed; ref: none; reason: Host active-toolchain preservation gate, not this product runtime requirement. --> |
| go1.25.0 | 5,740,728,320 (5.35 GiB) | 5,664,579,584 (5.28 GiB) | REVIEW: project minimum matches; CONDITIONAL-CLEANUP cache <!-- consolidation: unconfirmed; ref: none; reason: Compatibility and cache cleanup gates unresolved. --> |
| go1.26.0 | 4,471,681,024 (4.16 GiB) | 4,394,328,064 (4.09 GiB) | REVIEW binaries; CONDITIONAL-CLEANUP cache <!-- consolidation: unconfirmed; ref: none; reason: Binary preservation and cache cleanup gates unresolved. --> |
| go1.23.1 | 2,392,825,856 (2.23 GiB) | 2,392,825,856 (2.23 GiB) | REVIEW: project minimum matches; CONDITIONAL-CLEANUP cache <!-- consolidation: unconfirmed; ref: none; reason: Compatibility and cache cleanup gates unresolved. --> |
| go1.23.6 | 2,021,732,352 (1.88 GiB) | 2,021,732,352 (1.88 GiB) | CONDITIONAL-CLEANUP cache <!-- consolidation: unconfirmed; ref: none; reason: Cache cleanup conditions require separate authorization. --> |
| go1.22.4 | 1,863,270,400 (1.74 GiB) | 1,863,270,400 (1.74 GiB) | CONDITIONAL-CLEANUP cache <!-- consolidation: unconfirmed; ref: none; reason: Cache cleanup conditions require separate authorization. --> |
| go1.22 | 918,159,360 (875.62 MiB) | 918,159,360 (875.62 MiB) | REVIEW older compatibility needs; CONDITIONAL-CLEANUP cache <!-- consolidation: unconfirmed; ref: none; reason: Compatibility and cache cleanup gates unresolved. --> |
| go1.21 | 820,297,728 (782.30 MiB) | 820,297,728 (782.30 MiB) | REVIEW: project minimum matches; CONDITIONAL-CLEANUP cache <!-- consolidation: unconfirmed; ref: none; reason: Compatibility and cache cleanup gates unresolved. --> |
| go1.24 | 316,559,360 (301.89 MiB) | 316,559,360 (301.89 MiB) | CONDITIONAL-CLEANUP cache <!-- consolidation: unconfirmed; ref: none; reason: Cache cleanup conditions require separate authorization. --> |
| system | 0 (0 B) | 0 (0 B) | KEEP: no storage benefit from removal <!-- consolidation: unconfirmed; ref: none; reason: Host preservation recommendation has no product-core disposition. --> |

“Conditional” means no local edits to cached source need preservation, private/public dependencies remain obtainable, offline operation is not required, and no concurrent Go build/install depends on that cache. These conditions were not established by this metadata review. <!-- consolidation: unconfirmed; ref: none; reason: Cache-local edits, dependency recovery, offline needs and active consumers are unsatisfied cleanup gates. -->

## What is actually stored

| Storage type | Allocated bytes (size) | Meaning |
|---|---:|---|
| Unpacked module source | 25,084,637,184 (23.36 GiB) | Version-addressed dependencies under `pkg/mod`; normally recoverable, but local edits cannot be ruled out <!-- consolidation: discard; ref: none; reason: Historical inventory and evidence limit, local-edit gate retained separately. --> |
| Downloaded Go toolchains | 6,500,610,048 (6.05 GiB) | `pkg/mod/golang.org/toolchain@…`, separate from GVM's installed compiler <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Module download cache | 5,543,493,632 (5.16 GiB) | `pkg/mod/cache/download`: module archives/metadata, including toolchain archives <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Module Git/VCS cache | 2,065,362,944 (1.92 GiB) | `pkg/mod/cache/vcs`: fetched repositories and packfiles, not project worktrees <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Installed binaries | 654,962,688 (624.62 MiB) | `bin`: developer tools and applications; not removed by module-cache cleaning <!-- consolidation: discard; ref: none; reason: Historical binary inventory and external tool behavior. --> |
| Other allocation | 32,768 (32 KiB) | Package-directory allocation and miscellaneous metadata <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |

No `src` trees were found. All discovered `overlay` directories have zero allocated storage. This supports a dependency-cache interpretation, but **does not prove cached dependency files are unmodified**. <!-- consolidation: discard; ref: none; reason: Historical classification evidence and limit. -->

### Largest nested types per set

Values are allocated GiB; zero means no measured allocation in that category. Exact category totals are above. <!-- consolidation: discard; ref: none; reason: Report-local accounting legend. -->

| Version | Unpacked modules | Downloaded toolchains | Download archives | VCS cache | Binaries |
|---|---:|---:|---:|---:|---:|
| go1.24.2 | 4.214 | 1.296 | 1.354 | 0.759 | 0.155 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| go1.24.7 | 3.691 | 1.077 | 1.149 | 0.282 | 0.083 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| go1.27.0 | 4.264 | 0 | 0.996 | 0.291 | 0.229 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| go1.25.0 | 3.586 | 0.450 | 0.945 | 0.295 | 0.071 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| go1.26.0 | 2.841 | 0.237 | 0.719 | 0.296 | 0.072 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| go1.23.1 | 1.541 | 0.688 | 0 | 0 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| go1.23.6 | 1.154 | 0.728 | 0 | 0 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| go1.22.4 | 1.062 | 0.673 | 0 | 0 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| go1.22 | 0.411 | 0.444 | 0 | 0 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| go1.21 | 0.549 | 0.215 | 0 | 0 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| go1.24 | 0.051 | 0.244 | 0 | 0 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |

There is essentially no compiled-package storage under `pkg` outside `pkg/mod`. The current Go build-cache path is `~/Library/Caches/go-build`; it was **not inspected** and is outside this review. <!-- consolidation: discard; ref: none; reason: Historical storage observation and scope exclusion. -->

### Repeated dependencies

**1,301 module path/version identities occur in more than one set.** Equal identity and allocated size are evidence of repeated dependency populations, not a content-equality or physical-block-sharing proof. <!-- consolidation: discard; ref: none; reason: Historical repetition evidence, not a duplicate-deletion rule. -->

Three large examples appear in each of `go1.24.2`, `go1.24.7`, `go1.25.0`, `go1.26.0`, and `go1.27.0`: <!-- consolidation: discard; ref: none; reason: Historical repeated-dependency scope. -->

- Azure SDK `v68.0.0+incompatible`: **564,285,440 bytes (538.14 MiB)** per set. <!-- consolidation: discard; ref: none; reason: Historical dependency inventory. -->
- Google API `v0.235.0`: **342,159,360 bytes (326.31 MiB)** per set. <!-- consolidation: discard; ref: none; reason: Historical dependency inventory. -->
- AWS SDK `v1.55.7`: **337,375,232 bytes (321.75 MiB)** per set. <!-- consolidation: discard; ref: none; reason: Historical dependency inventory. -->

Old package-set labels do not imply that every cached toolchain is old. For example, `go1.26.0/global` contains a downloaded `go1.27.0` toolchain, and `go1.24.7/global` contains downloaded `go1.26.4`, `go1.26.3`, `go1.26.0`, `go1.25.10`, and `go1.25.0` toolchains. <!-- consolidation: discard; ref: none; reason: Historical toolchain inventory interpretation. -->

## Active/default and version requirements

- Command lookup resolves `go` to `~/.gvm/gos/go1.27.0/bin/go`, with no symlink components detected. It reports **`go version go1.27.0 darwin/arm64`**. <!-- consolidation: discard; ref: none; reason: Historical host version evidence. -->
- The toolchain `VERSION` metadata also says `go1.27.0`. <!-- consolidation: discard; ref: none; reason: Historical host version evidence. -->
- Current inherited `GOROOT` and `GOPATH`, plus selected assignments in `~/.gvm/environments/default`, point to `go1.27.0` and `go1.27.0/global`. <!-- consolidation: discard; ref: none; reason: Historical host configuration. -->
- `go env` confirms that module-cache location. Probes used `GOENV=off`, `GOTOOLCHAIN=local`, `GOPROXY=off`, and `GOSUMDB=off` to avoid persistent configuration and toolchain downloads. Thus `GOTOOLCHAIN=local` is a **probe override**, not evidence of the user's usual setting. <!-- consolidation: discard; ref: none; reason: Historical probe method and evidence limitation. -->
- Under `~/.gvm/gos`, only `go1.27.0` and `system` are directory entries. Older environment metadata points to absent compiler directories. The `system` environment refers to `~/.g/go`, which was not traversed or assessed. <!-- consolidation: discard; ref: none; reason: Historical toolchain inventory and excluded path. -->
- `go1.27.0` is the latest locally represented version by semantic version order; this review does not claim it is the latest upstream release. <!-- consolidation: discard; ref: none; reason: Historical local version comparison. -->

Only `go`/`toolchain` directives and presence of local `replace` directives were read from immediate repository `go.mod` files in Projects/Zesty. There were 18 matches, all in Zesty; nested modules and other roots were not searched. <!-- consolidation: discard; ref: none; reason: Historical external-project audit scope. -->

| Directive | Immediate repositories |
|---|---|
| `go 1.27.0` | `pod-rightsizing`, plus seven immediate pod-rightsizing worktree directories <!-- consolidation: discard; ref: none; reason: Historical external-project requirements. --> |
| `go 1.25.0` | `kompass-core`, `kompass-core-vm-async-errors` <!-- consolidation: discard; ref: none; reason: Historical external-project requirements. --> |
| `go 1.24.2` | `kompass-agent`, `kompass-backend`, `pod-rightsizing-ci-cleanup` <!-- consolidation: discard; ref: none; reason: Historical external-project requirements. --> |
| `go 1.23.1` | `ezswitch-controller`, `kubectl-plugin` <!-- consolidation: discard; ref: none; reason: Historical external-project requirements. --> |
| `go 1.22.0` | `manager`, `mutator`; manager also suggests `toolchain go1.22.3` <!-- consolidation: discard; ref: none; reason: Historical external-project requirements. --> |
| `go 1.21` | `provisioner` <!-- consolidation: discard; ref: none; reason: Historical external-project requirements. --> |

A `go` directive is a minimum version; a `toolchain` directive suggests a toolchain rather than pinning an exact exclusive version. The active 1.27.0 satisfies these declared minimums. <!-- consolidation: discard; ref: none; reason: External Go semantics and historical version comparison. --> This does **not** establish compatibility with newer compiler behavior, exact CI compiler requirements, or private-module recovery. <!-- consolidation: unconfirmed; ref: none; reason: Compiler compatibility and private-module recovery gates remain unresolved. --> Local replacements were detected in several repositories; their source targets were not traversed and must be preserved. <!-- consolidation: unconfirmed; ref: none; reason: External local-replacement preservation gate requires owner review. -->

### Binaries needing review before deleting whole sets

The active set has `impl`, `goplay`, `gopls`, `golangci-lint`, `dlv`, and `fabric`. <!-- consolidation: discard; ref: none; reason: Historical binary inventory. -->

The `go1.24.2` set additionally holds `staticcheck`, `wire`, `gomodifytags`, `goimports`, `mockgen`, and `gotests`, which are absent from the active set's `bin`. `go1.24.7` also has `gotests`. <!-- consolidation: discard; ref: none; reason: Historical binary inventory. --> Their original package/version provenance and consumers were not read or tested. Keep these binaries until intentionally migrated or retired. <!-- consolidation: unconfirmed; ref: none; reason: Binary provenance, consumers and retirement permission remain unresolved. -->

## Future app-managed commands — not executed

Read-only GVM commands, in an existing shell where GVM is already initialized: <!-- consolidation: unconfirmed; ref: none; reason: Existing initialized-shell prerequisite remains a safety boundary for any later authorized inspection. -->

```sh
gvm list
gvm pkgset list
```
<!-- consolidation: discard; ref: none; reason: External GVM inspection command reference, not product API. -->

The Go tool's own `go help clean` confirms that `-modcache` removes the entire module cache, **including unpacked dependency source**. <!-- consolidation: discard; ref: none; reason: Historical external help evidence. --> After satisfying the cleanup conditions above, the largest old cache can be targeted without activating its absent compiler and without touching `bin`, `overlay`, or project roots: <!-- consolidation: unconfirmed; ref: none; reason: Targeted cleanup recommendation remains conditional on unverified safety gates. -->

```sh
# DESTRUCTIVE: future conditional cleanup only; not run during this review.
GOENV=off GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off \
GOMODCACHE="$HOME/.gvm/pkgsets/go1.24.2/global/pkg/mod" \
"$HOME/.gvm/gos/go1.27.0/bin/go" clean -modcache
```
<!-- consolidation: unconfirmed; ref: none; reason: Destructive host command example needs explicit target authorization and satisfied cache-preservation conditions. -->

This targets **8,185,221,120 bytes (7.62 GiB)** of allocated cache attribution. <!-- consolidation: discard; ref: none; reason: Historical target allocation. --> It also removes that cache's downloaded toolchains; reacquisition may require private-repository credentials/network access. Do not run it while builds or installs use the cache. <!-- consolidation: unconfirmed; ref: none; reason: Recovery access and concurrent-use safety conditions remain unresolved. --> Use the same explicitly scoped pattern individually for other reviewed old caches; no bulk removal command is proposed. <!-- consolidation: unconfirmed; ref: none; reason: Per-cache removal still requires separate review and permission. -->

Upstream GVM documents `gvm pkgset delete <name>` and implements `gvm uninstall <version>`. <!-- consolidation: discard; ref: none; reason: External GVM reference. --> Whole-set deletion also removes binaries and custom content; it is not recommended here. Upstream uninstall requires a matching installed `gos` directory, so it is not a reliable method for these leftover old sets and should not be invoked blindly. Installed local deletion behavior was not executed or source-inspected. <!-- consolidation: unconfirmed; ref: none; reason: Whole-set deletion safety and installed behavior remain unverified. -->

Sources: [GVM README](https://github.com/moovweb/gvm/blob/master/README.md), [package-set deletion](https://github.com/moovweb/gvm/blob/master/scripts/pkgset-delete), [uninstall](https://github.com/moovweb/gvm/blob/master/scripts/uninstall), local `go help clean`, and [Go toolchain selection](https://go.dev/doc/toolchain).

## Limits

No source equality checks, cached-source modification checks, private-dependency recovery tests, build/CI compatibility tests, shell configuration searches, or nested-module scans were performed. No recent-access evidence was used as proof of inactivity. KEEP/REVIEW/CONDITIONAL-CLEANUP distinguishes operational importance from recoverability; no measured amount is promised as APFS free-space recovery. <!-- consolidation: discard; ref: none; reason: Historical audit limits and report legend, pending gates retained above. -->
