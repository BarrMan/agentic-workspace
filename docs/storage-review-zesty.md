---
consolidation:
  total: 138
  counts:
    exists: 0
    discard: 119
    integrate: 0
    unconfirmed: 19
  percentages:
    exists: 0.00%
    discard: 86.23%
    integrate: 0.00%
    unconfirmed: 13.77%
---
# Zesty allocated-storage map
> **Non-authoritative supporting material.** This file is not a contract. Authoritative owner(s): [docs/PRODUCT.md](PRODUCT.md).
> Disposition: Mixed — see markers.

## Scope and result

- Root: `/Users/imribarr/Zesty` only. Metadata-only, read-only inspection; no source, log, or document contents read. <!-- consolidation: discard; ref: none; reason: Historical audit scope. -->
- Scan began approximately **2026-10-13 11:34:36 +03:00**; initial traversal ended 11:34:54. Validation followed in the same short inspection window. This is a live, approximate snapshot, not an atomic filesystem snapshot. <!-- consolidation: discard; ref: none; reason: Historical audit timing and limitation. -->
- **56 immediate children: 54 directories and 2 regular files.** Recursive pathname counts: **515,150 regular files, 84,519 directories, 356 symlinks** (root directory excluded). <!-- consolidation: discard; ref: none; reason: Historical host inventory. -->
- **Allocated total: 15,903,174,656 bytes = 14.810985565 GiB**, consistent with the previous 14.81 GiB estimate. GiB means 1,073,741,824 bytes. <!-- consolidation: discard; ref: none; reason: Historical host measurement. -->
- No deletions, moves, installations, configuration changes, or repository writes. This report is the only output file written. <!-- consolidation: discard; ref: none; reason: Historical non-action record. -->
- Business/work project files, source, assets, data, and Git history must be preserved. Review categories below are investigative leads, not deletion authority. <!-- consolidation: unconfirmed; ref: none; reason: Host business-data preservation gate awaits owner disposition. -->

## Method and validation

Traversed directory entries with `scandir` and measured `lstat().st_blocks * 512`. Symlinks were counted and their own allocated metadata measured, but targets were neither read nor followed. Entries on a different filesystem device would have been skipped. No different-device entries were encountered. No file contents or external paths were scanned. <!-- consolidation: discard; ref: none; reason: Historical measurement method and scope. -->

Validation owner: the inspecting agent. Independently checked root and the three largest children with `du -skx`; KiB results were respectively **15,530,444**, **3,301,976**, **2,242,700**, and **1,413,464**. A second metadata traversal deduplicated `(device, inode)` and exactly matched all four byte totals. There were **3 duplicate inode entries**. The initial per-path allocation sum was 15,931,023,360 bytes; hard-link deduplication removed 27,848,704 bytes of double counting. Immediate-child sizes below deduplicate within each child, and their exact byte sum equals the root total. Counts remain pathname counts. <!-- consolidation: discard; ref: none; reason: Historical validation and accounting reconciliation. -->

Allocated block accounting is not a promise of uniquely reclaimable physical storage on APFS: clones, snapshots, filesystem compression, and future changes can affect actual free-space outcomes. No reclaimability assessment was performed. <!-- consolidation: discard; ref: none; reason: Host accounting limitation. -->

**Omission report:** no permission errors, unreadable entries, deadline omissions, or different-filesystem entries. Hidden children included. Symlink targets intentionally excluded. No content-based classification or repository status examination. Both scans completed well inside the four-minute bound. <!-- consolidation: discard; ref: none; reason: Historical audit coverage. -->

## All immediate children, descending allocated size

Directories include their own entry in the recursive directory count. Small nonzero sizes may round to 0.0000 GiB; the byte column is authoritative. <!-- consolidation: discard; ref: none; reason: Report-local measurement legend. --> All entries are preserve-pending-review project/business material unless a specific name-based category is noted later. <!-- consolidation: unconfirmed; ref: none; reason: Preserve host business material pending owner review. -->

| Child | Allocated GiB | Allocated bytes | Files | Directories | Symlinks |
|---|---:|---:|---:|---:|---:|
| zesty-k8s | 3.1490 | 3381223424 | 62629 | 9060 | 9 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| dashboard | 2.1388 | 2296524800 | 92637 | 11143 | 137 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| zesty-fed | 1.3480 | 1447387136 | 158043 | 30333 | 161 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| automation | 1.2638 | 1357029376 | 52215 | 9930 | 6 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| pod-rightsizing | 0.9188 | 986529792 | 9739 | 820 | 11 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| ebs-autoscaler | 0.8937 | 959565824 | 31354 | 5211 | 3 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| ML | 0.8258 | 886734848 | 31443 | 2683 | 3 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| zesty-automation | 0.7120 | 764481536 | 32250 | 5034 | 6 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| ezswitch-controller | 0.6504 | 698380288 | 4352 | 324 | 3 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| kompass-agent | 0.5665 | 608264192 | 1370 | 374 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| kompass-debugging | 0.4151 | 445706240 | 9842 | 2885 | 6 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| provisioner | 0.4116 | 441991168 | 3017 | 317 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| kompass-core | 0.2805 | 301174784 | 1801 | 385 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| kubectl-plugin | 0.2530 | 271699968 | 429 | 234 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| kompass-backend | 0.2222 | 238555136 | 926 | 117 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| pilot | 0.1845 | 198123520 | 4124 | 474 | 4 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| clamp-repro | 0.1358 | 145768448 | 487 | 136 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| zbs-agent | 0.0630 | 67629056 | 309 | 57 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| manager | 0.0605 | 65011712 | 611 | 239 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| build | 0.0590 | 63336448 | 1 | 1 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| config-staging | 0.0511 | 54882304 | 3844 | 1136 | 3 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| python-scripts | 0.0480 | 51515392 | 3632 | 1073 | 3 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| pod-rightsizing-alias-kind | 0.0309 | 33132544 | 759 | 171 | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| zestyctl | 0.0297 | 31891456 | 266 | 41 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| pod-rightsizing-kps-7504 | 0.0297 | 31846400 | 714 | 169 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| pod-rightsizing-kps-7509-deliver-observability-scale-readiness-and-production-activation | 0.0088 | 9412608 | 801 | 179 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| clusters | 0.0076 | 8134656 | 99 | 16 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| kompass | 0.0075 | 8044544 | 1409 | 316 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| pod-rightsizing-kps-5464 | 0.0070 | 7483392 | 763 | 170 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| pod-rightsizing-kps-6638 | 0.0070 | 7467008 | 760 | 170 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| pod-rightsizing-origin-main | 0.0069 | 7450624 | 758 | 170 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| pod-rightsizing-action-conflicts | 0.0065 | 6959104 | 711 | 167 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| zesty-helm | 0.0053 | 5660672 | 1247 | 277 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| pod-rightsizing-ci-cleanup | 0.0044 | 4747264 | 446 | 115 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| kompass-insights | 0.0022 | 2404352 | 261 | 101 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| kompass-core-vm-async-errors | 0.0018 | 1949696 | 295 | 97 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| k8s-argocd-live | 0.0012 | 1298432 | 232 | 68 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| k8s-disk-manifest | 0.0007 | 765952 | 104 | 69 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| skills-repository | 0.0006 | 638976 | 64 | 40 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| zesty-helm-public | 0.0005 | 565248 | 89 | 42 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| mutator | 0.0004 | 425984 | 57 | 26 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| prometheus-exporter | 0.0004 | 405504 | 84 | 60 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| recommendation_util | 0.0003 | 327680 | 49 | 26 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| logrus-prefixed-formatter | 0.0002 | 208896 | 36 | 18 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| kubebuilder | 0.0001 | 143360 | 27 | 12 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| zesty-ezswitch-helm | 0.0001 | 139264 | 32 | 17 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| high-voltage | 0.0001 | 69632 | 17 | 2 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| scripts | 0.0000 | 36864 | 6 | 2 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| .pytest_cache | 0.0000 | 24576 | 6 | 3 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| .DS_Store | 0.0000 | 16384 | 1 | 0 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| golang-tutorial | 0.0000 | 4096 | 1 | 1 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| clean_k8s.sh | 0.0000 | 4096 | 1 | 0 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| empty | 0.0000 | 0 | 0 | 1 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| k8s | 0.0000 | 0 | 0 | 5 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| tmp | 0.0000 | 0 | 0 | 1 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| pandas | 0.0000 | 0 | 0 | 1 | 0 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |

## Five heaviest immediate subfolders of each of the ten largest directories

Subfolder figures are rounded **per-path block sums from the initial traversal**, rather than independently hard-link-deduplicated subtree sizes. Dashboard and zesty-fed contain the duplicate inode entries; their breakdown values may slightly overstate unique allocation. Parent totals in the preceding table are validated and deduplicated. These are the five largest directory children, not the five largest individual files; direct files and remaining subfolders are not separately listed. <!-- consolidation: discard; ref: none; reason: Historical sampling and accounting limits. -->

Legend: **P** = project/source/assets/business data or unknown, preserve; <!-- consolidation: unconfirmed; ref: none; reason: Business-data preservation gate awaits owner review. --> **D** = installed dependencies, review reproducibility; <!-- consolidation: unconfirmed; ref: none; reason: Dependency reproducibility gate unresolved. --> **V** = possible Python environment, confirm role; <!-- consolidation: unconfirmed; ref: none; reason: Environment role requires owner confirmation. --> **C** = possible build/cache output, confirm role; <!-- consolidation: unconfirmed; ref: none; reason: Generated-output classification requires confirmation. --> **G** = Git history/metadata, preserve, not disposable. <!-- consolidation: unconfirmed; ref: none; reason: Host history preservation gate awaits owner disposition. --> Labels are based only on directory names. <!-- consolidation: discard; ref: none; reason: Historical classification method. -->

| Parent | Heavy subfolder | Approx. GiB | Category |
|---|---|---:|---|
| zesty-k8s | k8s_data_pipeline | 1.1982 | P <!-- consolidation: discard; ref: none; reason: Historical host inventory, preservation gate retained in legend. --> |
| zesty-k8s | k8s_data_store_ms | 0.5881 | P <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| zesty-k8s | k8s_validation_ms | 0.4294 | P <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| zesty-k8s | insights-agent | 0.3789 | P <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| zesty-k8s | .databricks | 0.2642 | P <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| dashboard | .angular | 1.2418 | C — likely framework output/cache; confirm <!-- consolidation: unconfirmed; ref: none; reason: Cache role and removal safety require confirmation. --> |
| dashboard | node_modules | 0.8498 | D <!-- consolidation: discard; ref: none; reason: Historical host inventory, reproducibility gate retained in legend. --> |
| dashboard | src | 0.0326 | P <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| dashboard | .git | 0.0210 | G <!-- consolidation: discard; ref: none; reason: Historical host inventory, history preservation gate retained in legend. --> |
| dashboard | cypress | 0.0003 | P <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| zesty-fed | node_modules | 0.6082 | D <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| zesty-fed | apps | 0.5825 | P — mixed project tree <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| zesty-fed | .git | 0.0696 | G <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| zesty-fed | libs | 0.0614 | P <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| zesty-fed | services | 0.0381 | P <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| automation | .venv | 0.4291 | V <!-- consolidation: discard; ref: none; reason: Historical host inventory, role-confirmation gate retained in legend. --> |
| automation | .venv-test | 0.4275 | V — name suggests test environment <!-- consolidation: discard; ref: none; reason: Historical name-based inventory. --> |
| automation | src | 0.2601 | P <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| automation | .git | 0.1344 | G <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| automation | tests | 0.0098 | P <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| pod-rightsizing | action-taker | 0.4482 | P <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| pod-rightsizing | .git | 0.2885 | G <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| pod-rightsizing | recommendation-maker | 0.1174 | P <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| pod-rightsizing | .opencode | 0.0598 | P — tooling/project state; not assumed cache <!-- consolidation: unconfirmed; ref: none; reason: Tool-state preservation depends on unresolved ownership review. --> |
| pod-rightsizing | queries-verifications | 0.0013 | P <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| ebs-autoscaler | .venv | 0.7880 | V <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| ebs-autoscaler | .git | 0.0583 | G <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| ebs-autoscaler | localstack | 0.0252 | P — possible local service data, preserve <!-- consolidation: unconfirmed; ref: none; reason: Service-data preservation gate requires owner disposition. --> |
| ebs-autoscaler | tests | 0.0120 | P <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| ebs-autoscaler | data | 0.0077 | P <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| ML | .venv | 0.8257 | V <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| ML | data | 0.0001 | P <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| ML | __pycache__ | 0.0001 | C <!-- consolidation: discard; ref: none; reason: Historical host inventory, role-confirmation gate retained in legend. --> |
| ML | models | 0.0000 | P <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| ML | .vscode | 0.0000 | P <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| zesty-automation | venv | 0.2479 | V <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| zesty-automation | .venv | 0.2048 | V <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| zesty-automation | tests | 0.1435 | P <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| zesty-automation | .git | 0.1113 | G <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| zesty-automation | src | 0.0033 | P <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| ezswitch-controller | .git | 0.2797 | G <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| ezswitch-controller | bin | 0.2392 | P — binaries/tooling; provenance unknown <!-- consolidation: unconfirmed; ref: none; reason: Binary provenance and preservation needs remain unknown. --> |
| ezswitch-controller | build | 0.1308 | C — may contain required artifacts <!-- consolidation: unconfirmed; ref: none; reason: Required-artifact status must be resolved before cleanup. --> |
| ezswitch-controller | internal | 0.0001 | P <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| ezswitch-controller | config | 0.0001 | P <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| kompass-agent | insights-agent | 0.3900 | P <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| kompass-agent | .git | 0.1751 | G <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| kompass-agent | action-taker | 0.0006 | P <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| kompass-agent | recommendation-maker | 0.0005 | P <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| kompass-agent | boot-measurement-script | 0.0000 | P <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |

## Possible review categories and cautious rationale

1. **Installed JavaScript dependencies:** `dashboard/node_modules` and `zesty-fed/node_modules` are substantial named examples. Across the tree, 16 outermost directories named `node_modules` account for approximately **2.1622 GiB of per-path allocation**. <!-- consolidation: discard; ref: none; reason: Historical dependency inventory. --> Installation reproducibility, local modifications, and offline requirements were not checked. This is not an authorized removal amount. <!-- consolidation: unconfirmed; ref: none; reason: Reproducibility and offline-use safety gates unresolved. -->
2. **Python environments:** named `.venv`, `venv`, or `env` directories account for approximately **4.7129 GiB of per-path allocation** across 17 outermost matches; this exact-name group excludes `.venv-test` (another 0.4275 GiB in automation). <!-- consolidation: discard; ref: none; reason: Historical environment inventory. --> Names alone cannot establish that an environment is reproducible or unused; packages may be customized. Review environments separately from adjacent source/data. <!-- consolidation: unconfirmed; ref: none; reason: Environment reproducibility and ownership review unresolved. -->
3. **Possible build/cache output:** `dashboard/.angular` (1.2418 GiB), `ezswitch-controller/build` (0.1308 GiB), root `build` (0.0590 GiB), `.pytest_cache`, and `__pycache__` are name-based leads. <!-- consolidation: discard; ref: none; reason: Historical name-based inventory. --> Build directories can contain required release artifacts, so regeneration and ownership need confirmation before considering any action. <!-- consolidation: unconfirmed; ref: none; reason: Artifact-regeneration and ownership gates unresolved. -->
4. **Source/assets/business data:** retain project trees including `zesty-k8s` services, `automation/src`, `zesty-fed/apps`, tests, models, data, and configuration. A large service folder may mix source, environments, generated files, and data. `.databricks`, `localstack`, `.opencode`, and `bin` remain preserve-pending-owner-review; their purpose was not determined from contents. <!-- consolidation: unconfirmed; ref: none; reason: Host business-data preservation and purpose require owner review. -->
5. **Git history and metadata:** 31 outermost `.git` directories account for approximately **2.1553 GiB of per-path allocation**. <!-- consolidation: discard; ref: none; reason: Historical Git allocation. --> They preserve history and potentially local-only objects; they are **not disposable**. <!-- consolidation: unconfirmed; ref: none; reason: Local-history preservation gate awaits owner disposition. --> `.git` files in linked worktrees may reference other paths, but no such references were read or followed. <!-- consolidation: discard; ref: none; reason: Historical inspection boundary. --> Similar project/worktree names do not establish duplication or authorize removal. <!-- consolidation: unconfirmed; ref: none; reason: Worktree removal permission and duplicate status unresolved. -->

Category totals can overlap (for example generated output inside dependencies) and use per-path rather than unique-block accounting. Do not add them together or treat them as reclaimable space. <!-- consolidation: discard; ref: none; reason: Historical category-accounting limitation. --> No aging, last-use, backup, rebuildability, or business-ownership claims are made; those require a separate owner-led review. <!-- consolidation: unconfirmed; ref: none; reason: Cleanup prerequisites require an owner-led review not supplied by the inventory. -->
