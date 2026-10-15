# GVM package-set storage review

## Decision

**Keep the active/default `go1.27.0/global` set. Review older sets, then conditionally clean their module caches rather than deleting entire sets.** The older sets contain 33,233,829,888 allocated bytes (30.95 GiB) of module-cache storage. Their installed binaries are separate and should be preserved until their consumers and replacement versions are established.

This is a read-only review of `~/.gvm/pkgsets` and relevant GVM version/environment metadata. Only this report was written. No cleanup, installation, environment switching, shell-script sourcing, repository modification, or symlink traversal occurred.

## Measurement and validation

- Package sets total **39,849,099,264 bytes (37.11 GiB)**, exactly matching the preceding home audit.
- All 12 discovered version/package-set combinations are `global`; no named custom sets were found.
- One complete allocated-storage metadata walk: `st_blocks × 512`, same filesystem only, hardlink deduplication. No symlinks or duplicate hardlink entries were encountered within these sets. No permission errors or unfinished sets.
- Walk plus two independent `du -x -s -k` checks completed in **105.26 seconds**. The checks had 12-second individual limits and both completed.
- `go1.24.2/global`: scan and `du` both **8,351,424,512 bytes (7.78 GiB)**.
- `go1.24.7/global`: scan and `du` both **6,745,788,416 bytes (6.28 GiB)**.
- APFS clone/shared extents are not deduplicated by `stat` or these `du` totals. Allocated attribution is not a guarantee of uniquely reclaimable physical space. Contents were not hashed or compared; atime was not used to infer use or disuse.

## Size-ranked sets and recommendations

All paths below are relative to `~/.gvm/pkgsets`; every row is the named version's `global` set. Module-cache totals include unpacked dependencies, fetched Git repositories, archives, and downloaded toolchains, but exclude `bin`.

| Version | Total allocated bytes (size) | Module-cache bytes (size) | Recommendation |
|---|---:|---:|---|
| go1.24.2 | 8,351,424,512 (7.78 GiB) | 8,185,221,120 (7.62 GiB) | REVIEW binaries; CONDITIONAL-CLEANUP cache |
| go1.24.7 | 6,745,788,416 (6.28 GiB) | 6,656,856,064 (6.20 GiB) | REVIEW binaries; CONDITIONAL-CLEANUP cache |
| go1.27.0 | 6,206,631,936 (5.78 GiB) | 5,960,273,920 (5.55 GiB) | KEEP: active/default and current repositories require it |
| go1.25.0 | 5,740,728,320 (5.35 GiB) | 5,664,579,584 (5.28 GiB) | REVIEW: project minimum matches; CONDITIONAL-CLEANUP cache |
| go1.26.0 | 4,471,681,024 (4.16 GiB) | 4,394,328,064 (4.09 GiB) | REVIEW binaries; CONDITIONAL-CLEANUP cache |
| go1.23.1 | 2,392,825,856 (2.23 GiB) | 2,392,825,856 (2.23 GiB) | REVIEW: project minimum matches; CONDITIONAL-CLEANUP cache |
| go1.23.6 | 2,021,732,352 (1.88 GiB) | 2,021,732,352 (1.88 GiB) | CONDITIONAL-CLEANUP cache |
| go1.22.4 | 1,863,270,400 (1.74 GiB) | 1,863,270,400 (1.74 GiB) | CONDITIONAL-CLEANUP cache |
| go1.22 | 918,159,360 (875.62 MiB) | 918,159,360 (875.62 MiB) | REVIEW older compatibility needs; CONDITIONAL-CLEANUP cache |
| go1.21 | 820,297,728 (782.30 MiB) | 820,297,728 (782.30 MiB) | REVIEW: project minimum matches; CONDITIONAL-CLEANUP cache |
| go1.24 | 316,559,360 (301.89 MiB) | 316,559,360 (301.89 MiB) | CONDITIONAL-CLEANUP cache |
| system | 0 (0 B) | 0 (0 B) | KEEP: no storage benefit from removal |

“Conditional” means no local edits to cached source need preservation, private/public dependencies remain obtainable, offline operation is not required, and no concurrent Go build/install depends on that cache. These conditions were not established by this metadata review.

## What is actually stored

| Storage type | Allocated bytes (size) | Meaning |
|---|---:|---|
| Unpacked module source | 25,084,637,184 (23.36 GiB) | Version-addressed dependencies under `pkg/mod`; normally recoverable, but local edits cannot be ruled out |
| Downloaded Go toolchains | 6,500,610,048 (6.05 GiB) | `pkg/mod/golang.org/toolchain@…`, separate from GVM's installed compiler |
| Module download cache | 5,543,493,632 (5.16 GiB) | `pkg/mod/cache/download`: module archives/metadata, including toolchain archives |
| Module Git/VCS cache | 2,065,362,944 (1.92 GiB) | `pkg/mod/cache/vcs`: fetched repositories and packfiles, not project worktrees |
| Installed binaries | 654,962,688 (624.62 MiB) | `bin`: developer tools and applications; not removed by module-cache cleaning |
| Other allocation | 32,768 (32 KiB) | Package-directory allocation and miscellaneous metadata |

No `src` trees were found. All discovered `overlay` directories have zero allocated storage. This supports a dependency-cache interpretation, but **does not prove cached dependency files are unmodified**.

### Largest nested types per set

Values are allocated GiB; zero means no measured allocation in that category. Exact category totals are above.

| Version | Unpacked modules | Downloaded toolchains | Download archives | VCS cache | Binaries |
|---|---:|---:|---:|---:|---:|
| go1.24.2 | 4.214 | 1.296 | 1.354 | 0.759 | 0.155 |
| go1.24.7 | 3.691 | 1.077 | 1.149 | 0.282 | 0.083 |
| go1.27.0 | 4.264 | 0 | 0.996 | 0.291 | 0.229 |
| go1.25.0 | 3.586 | 0.450 | 0.945 | 0.295 | 0.071 |
| go1.26.0 | 2.841 | 0.237 | 0.719 | 0.296 | 0.072 |
| go1.23.1 | 1.541 | 0.688 | 0 | 0 | 0 |
| go1.23.6 | 1.154 | 0.728 | 0 | 0 | 0 |
| go1.22.4 | 1.062 | 0.673 | 0 | 0 | 0 |
| go1.22 | 0.411 | 0.444 | 0 | 0 | 0 |
| go1.21 | 0.549 | 0.215 | 0 | 0 | 0 |
| go1.24 | 0.051 | 0.244 | 0 | 0 | 0 |

There is essentially no compiled-package storage under `pkg` outside `pkg/mod`. The current Go build-cache path is `~/Library/Caches/go-build`; it was **not inspected** and is outside this review.

### Repeated dependencies

**1,301 module path/version identities occur in more than one set.** Equal identity and allocated size are evidence of repeated dependency populations, not a content-equality or physical-block-sharing proof.

Three large examples appear in each of `go1.24.2`, `go1.24.7`, `go1.25.0`, `go1.26.0`, and `go1.27.0`:

- Azure SDK `v68.0.0+incompatible`: **564,285,440 bytes (538.14 MiB)** per set.
- Google API `v0.235.0`: **342,159,360 bytes (326.31 MiB)** per set.
- AWS SDK `v1.55.7`: **337,375,232 bytes (321.75 MiB)** per set.

Old package-set labels do not imply that every cached toolchain is old. For example, `go1.26.0/global` contains a downloaded `go1.27.0` toolchain, and `go1.24.7/global` contains downloaded `go1.26.4`, `go1.26.3`, `go1.26.0`, `go1.25.10`, and `go1.25.0` toolchains.

## Active/default and version requirements

- Command lookup resolves `go` to `~/.gvm/gos/go1.27.0/bin/go`, with no symlink components detected. It reports **`go version go1.27.0 darwin/arm64`**.
- The toolchain `VERSION` metadata also says `go1.27.0`.
- Current inherited `GOROOT` and `GOPATH`, plus selected assignments in `~/.gvm/environments/default`, point to `go1.27.0` and `go1.27.0/global`.
- `go env` confirms that module-cache location. Probes used `GOENV=off`, `GOTOOLCHAIN=local`, `GOPROXY=off`, and `GOSUMDB=off` to avoid persistent configuration and toolchain downloads. Thus `GOTOOLCHAIN=local` is a **probe override**, not evidence of the user's usual setting.
- Under `~/.gvm/gos`, only `go1.27.0` and `system` are directory entries. Older environment metadata points to absent compiler directories. The `system` environment refers to `~/.g/go`, which was not traversed or assessed.
- `go1.27.0` is the latest locally represented version by semantic version order; this review does not claim it is the latest upstream release.

Only `go`/`toolchain` directives and presence of local `replace` directives were read from immediate repository `go.mod` files in Projects/Zesty. There were 18 matches, all in Zesty; nested modules and other roots were not searched.

| Directive | Immediate repositories |
|---|---|
| `go 1.27.0` | `pod-rightsizing`, plus seven immediate pod-rightsizing worktree directories |
| `go 1.25.0` | `kompass-core`, `kompass-core-vm-async-errors` |
| `go 1.24.2` | `kompass-agent`, `kompass-backend`, `pod-rightsizing-ci-cleanup` |
| `go 1.23.1` | `ezswitch-controller`, `kubectl-plugin` |
| `go 1.22.0` | `manager`, `mutator`; manager also suggests `toolchain go1.22.3` |
| `go 1.21` | `provisioner` |

A `go` directive is a minimum version; a `toolchain` directive suggests a toolchain rather than pinning an exact exclusive version. The active 1.27.0 satisfies these declared minimums. This does **not** establish compatibility with newer compiler behavior, exact CI compiler requirements, or private-module recovery. Local replacements were detected in several repositories; their source targets were not traversed and must be preserved.

### Binaries needing review before deleting whole sets

The active set has `impl`, `goplay`, `gopls`, `golangci-lint`, `dlv`, and `fabric`.

The `go1.24.2` set additionally holds `staticcheck`, `wire`, `gomodifytags`, `goimports`, `mockgen`, and `gotests`, which are absent from the active set's `bin`. `go1.24.7` also has `gotests`. Their original package/version provenance and consumers were not read or tested. Keep these binaries until intentionally migrated or retired.

## Future app-managed commands — not executed

Read-only GVM commands, in an existing shell where GVM is already initialized:

```sh
gvm list
gvm pkgset list
```

The Go tool's own `go help clean` confirms that `-modcache` removes the entire module cache, **including unpacked dependency source**. After satisfying the cleanup conditions above, the largest old cache can be targeted without activating its absent compiler and without touching `bin`, `overlay`, or project roots:

```sh
# DESTRUCTIVE: future conditional cleanup only; not run during this review.
GOENV=off GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off \
GOMODCACHE="$HOME/.gvm/pkgsets/go1.24.2/global/pkg/mod" \
"$HOME/.gvm/gos/go1.27.0/bin/go" clean -modcache
```

This targets **8,185,221,120 bytes (7.62 GiB)** of allocated cache attribution. It also removes that cache's downloaded toolchains; reacquisition may require private-repository credentials/network access. Do not run it while builds or installs use the cache. Use the same explicitly scoped pattern individually for other reviewed old caches; no bulk removal command is proposed.

Upstream GVM documents `gvm pkgset delete <name>` and implements `gvm uninstall <version>`. Whole-set deletion also removes binaries and custom content; it is not recommended here. Upstream uninstall requires a matching installed `gos` directory, so it is not a reliable method for these leftover old sets and should not be invoked blindly. Installed local deletion behavior was not executed or source-inspected.

Sources: [GVM README](https://github.com/moovweb/gvm/blob/master/README.md), [package-set deletion](https://github.com/moovweb/gvm/blob/master/scripts/pkgset-delete), [uninstall](https://github.com/moovweb/gvm/blob/master/scripts/uninstall), local `go help clean`, and [Go toolchain selection](https://go.dev/doc/toolchain).

## Limits

No source equality checks, cached-source modification checks, private-dependency recovery tests, build/CI compatibility tests, shell configuration searches, or nested-module scans were performed. No recent-access evidence was used as proof of inactivity. KEEP/REVIEW/CONDITIONAL-CLEANUP distinguishes operational importance from recoverability; no measured amount is promised as APFS free-space recovery.
