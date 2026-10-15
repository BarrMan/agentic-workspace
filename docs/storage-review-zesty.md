# Zesty allocated-storage map

## Scope and result

- Root: `/Users/imribarr/Zesty` only. Metadata-only, read-only inspection; no source, log, or document contents read.
- Scan began approximately **2026-10-13 11:34:36 +03:00**; initial traversal ended 11:34:54. Validation followed in the same short inspection window. This is a live, approximate snapshot, not an atomic filesystem snapshot.
- **56 immediate children: 54 directories and 2 regular files.** Recursive pathname counts: **515,150 regular files, 84,519 directories, 356 symlinks** (root directory excluded).
- **Allocated total: 15,903,174,656 bytes = 14.810985565 GiB**, consistent with the previous 14.81 GiB estimate. GiB means 1,073,741,824 bytes.
- No deletions, moves, installations, configuration changes, or repository writes. This report is the only output file written.
- Business/work project files, source, assets, data, and Git history must be preserved. Review categories below are investigative leads, not deletion authority.

## Method and validation

Traversed directory entries with `scandir` and measured `lstat().st_blocks * 512`. Symlinks were counted and their own allocated metadata measured, but targets were neither read nor followed. Entries on a different filesystem device would have been skipped. No different-device entries were encountered. No file contents or external paths were scanned.

Validation owner: the inspecting agent. Independently checked root and the three largest children with `du -skx`; KiB results were respectively **15,530,444**, **3,301,976**, **2,242,700**, and **1,413,464**. A second metadata traversal deduplicated `(device, inode)` and exactly matched all four byte totals. There were **3 duplicate inode entries**. The initial per-path allocation sum was 15,931,023,360 bytes; hard-link deduplication removed 27,848,704 bytes of double counting. Immediate-child sizes below deduplicate within each child, and their exact byte sum equals the root total. Counts remain pathname counts.

Allocated block accounting is not a promise of uniquely reclaimable physical storage on APFS: clones, snapshots, filesystem compression, and future changes can affect actual free-space outcomes. No reclaimability assessment was performed.

**Omission report:** no permission errors, unreadable entries, deadline omissions, or different-filesystem entries. Hidden children included. Symlink targets intentionally excluded. No content-based classification or repository status examination. Both scans completed well inside the four-minute bound.

## All immediate children, descending allocated size

Directories include their own entry in the recursive directory count. Small nonzero sizes may round to 0.0000 GiB; the byte column is authoritative. All entries are preserve-pending-review project/business material unless a specific name-based category is noted later.

| Child | Allocated GiB | Allocated bytes | Files | Directories | Symlinks |
|---|---:|---:|---:|---:|---:|
| zesty-k8s | 3.1490 | 3381223424 | 62629 | 9060 | 9 |
| dashboard | 2.1388 | 2296524800 | 92637 | 11143 | 137 |
| zesty-fed | 1.3480 | 1447387136 | 158043 | 30333 | 161 |
| automation | 1.2638 | 1357029376 | 52215 | 9930 | 6 |
| pod-rightsizing | 0.9188 | 986529792 | 9739 | 820 | 11 |
| ebs-autoscaler | 0.8937 | 959565824 | 31354 | 5211 | 3 |
| ML | 0.8258 | 886734848 | 31443 | 2683 | 3 |
| zesty-automation | 0.7120 | 764481536 | 32250 | 5034 | 6 |
| ezswitch-controller | 0.6504 | 698380288 | 4352 | 324 | 3 |
| kompass-agent | 0.5665 | 608264192 | 1370 | 374 | 0 |
| kompass-debugging | 0.4151 | 445706240 | 9842 | 2885 | 6 |
| provisioner | 0.4116 | 441991168 | 3017 | 317 | 0 |
| kompass-core | 0.2805 | 301174784 | 1801 | 385 | 0 |
| kubectl-plugin | 0.2530 | 271699968 | 429 | 234 | 0 |
| kompass-backend | 0.2222 | 238555136 | 926 | 117 | 0 |
| pilot | 0.1845 | 198123520 | 4124 | 474 | 4 |
| clamp-repro | 0.1358 | 145768448 | 487 | 136 | 0 |
| zbs-agent | 0.0630 | 67629056 | 309 | 57 | 0 |
| manager | 0.0605 | 65011712 | 611 | 239 | 0 |
| build | 0.0590 | 63336448 | 1 | 1 | 0 |
| config-staging | 0.0511 | 54882304 | 3844 | 1136 | 3 |
| python-scripts | 0.0480 | 51515392 | 3632 | 1073 | 3 |
| pod-rightsizing-alias-kind | 0.0309 | 33132544 | 759 | 171 | 1 |
| zestyctl | 0.0297 | 31891456 | 266 | 41 | 0 |
| pod-rightsizing-kps-7504 | 0.0297 | 31846400 | 714 | 169 | 0 |
| pod-rightsizing-kps-7509-deliver-observability-scale-readiness-and-production-activation | 0.0088 | 9412608 | 801 | 179 | 0 |
| clusters | 0.0076 | 8134656 | 99 | 16 | 0 |
| kompass | 0.0075 | 8044544 | 1409 | 316 | 0 |
| pod-rightsizing-kps-5464 | 0.0070 | 7483392 | 763 | 170 | 0 |
| pod-rightsizing-kps-6638 | 0.0070 | 7467008 | 760 | 170 | 0 |
| pod-rightsizing-origin-main | 0.0069 | 7450624 | 758 | 170 | 0 |
| pod-rightsizing-action-conflicts | 0.0065 | 6959104 | 711 | 167 | 0 |
| zesty-helm | 0.0053 | 5660672 | 1247 | 277 | 0 |
| pod-rightsizing-ci-cleanup | 0.0044 | 4747264 | 446 | 115 | 0 |
| kompass-insights | 0.0022 | 2404352 | 261 | 101 | 0 |
| kompass-core-vm-async-errors | 0.0018 | 1949696 | 295 | 97 | 0 |
| k8s-argocd-live | 0.0012 | 1298432 | 232 | 68 | 0 |
| k8s-disk-manifest | 0.0007 | 765952 | 104 | 69 | 0 |
| skills-repository | 0.0006 | 638976 | 64 | 40 | 0 |
| zesty-helm-public | 0.0005 | 565248 | 89 | 42 | 0 |
| mutator | 0.0004 | 425984 | 57 | 26 | 0 |
| prometheus-exporter | 0.0004 | 405504 | 84 | 60 | 0 |
| recommendation_util | 0.0003 | 327680 | 49 | 26 | 0 |
| logrus-prefixed-formatter | 0.0002 | 208896 | 36 | 18 | 0 |
| kubebuilder | 0.0001 | 143360 | 27 | 12 | 0 |
| zesty-ezswitch-helm | 0.0001 | 139264 | 32 | 17 | 0 |
| high-voltage | 0.0001 | 69632 | 17 | 2 | 0 |
| scripts | 0.0000 | 36864 | 6 | 2 | 0 |
| .pytest_cache | 0.0000 | 24576 | 6 | 3 | 0 |
| .DS_Store | 0.0000 | 16384 | 1 | 0 | 0 |
| golang-tutorial | 0.0000 | 4096 | 1 | 1 | 0 |
| clean_k8s.sh | 0.0000 | 4096 | 1 | 0 | 0 |
| empty | 0.0000 | 0 | 0 | 1 | 0 |
| k8s | 0.0000 | 0 | 0 | 5 | 0 |
| tmp | 0.0000 | 0 | 0 | 1 | 0 |
| pandas | 0.0000 | 0 | 0 | 1 | 0 |

## Five heaviest immediate subfolders of each of the ten largest directories

Subfolder figures are rounded **per-path block sums from the initial traversal**, rather than independently hard-link-deduplicated subtree sizes. Dashboard and zesty-fed contain the duplicate inode entries; their breakdown values may slightly overstate unique allocation. Parent totals in the preceding table are validated and deduplicated. These are the five largest directory children, not the five largest individual files; direct files and remaining subfolders are not separately listed.

Legend: **P** = project/source/assets/business data or unknown, preserve; **D** = installed dependencies, review reproducibility; **V** = possible Python environment, confirm role; **C** = possible build/cache output, confirm role; **G** = Git history/metadata, preserve, not disposable. Labels are based only on directory names.

| Parent | Heavy subfolder | Approx. GiB | Category |
|---|---|---:|---|
| zesty-k8s | k8s_data_pipeline | 1.1982 | P |
| zesty-k8s | k8s_data_store_ms | 0.5881 | P |
| zesty-k8s | k8s_validation_ms | 0.4294 | P |
| zesty-k8s | insights-agent | 0.3789 | P |
| zesty-k8s | .databricks | 0.2642 | P |
| dashboard | .angular | 1.2418 | C — likely framework output/cache; confirm |
| dashboard | node_modules | 0.8498 | D |
| dashboard | src | 0.0326 | P |
| dashboard | .git | 0.0210 | G |
| dashboard | cypress | 0.0003 | P |
| zesty-fed | node_modules | 0.6082 | D |
| zesty-fed | apps | 0.5825 | P — mixed project tree |
| zesty-fed | .git | 0.0696 | G |
| zesty-fed | libs | 0.0614 | P |
| zesty-fed | services | 0.0381 | P |
| automation | .venv | 0.4291 | V |
| automation | .venv-test | 0.4275 | V — name suggests test environment |
| automation | src | 0.2601 | P |
| automation | .git | 0.1344 | G |
| automation | tests | 0.0098 | P |
| pod-rightsizing | action-taker | 0.4482 | P |
| pod-rightsizing | .git | 0.2885 | G |
| pod-rightsizing | recommendation-maker | 0.1174 | P |
| pod-rightsizing | .opencode | 0.0598 | P — tooling/project state; not assumed cache |
| pod-rightsizing | queries-verifications | 0.0013 | P |
| ebs-autoscaler | .venv | 0.7880 | V |
| ebs-autoscaler | .git | 0.0583 | G |
| ebs-autoscaler | localstack | 0.0252 | P — possible local service data, preserve |
| ebs-autoscaler | tests | 0.0120 | P |
| ebs-autoscaler | data | 0.0077 | P |
| ML | .venv | 0.8257 | V |
| ML | data | 0.0001 | P |
| ML | __pycache__ | 0.0001 | C |
| ML | models | 0.0000 | P |
| ML | .vscode | 0.0000 | P |
| zesty-automation | venv | 0.2479 | V |
| zesty-automation | .venv | 0.2048 | V |
| zesty-automation | tests | 0.1435 | P |
| zesty-automation | .git | 0.1113 | G |
| zesty-automation | src | 0.0033 | P |
| ezswitch-controller | .git | 0.2797 | G |
| ezswitch-controller | bin | 0.2392 | P — binaries/tooling; provenance unknown |
| ezswitch-controller | build | 0.1308 | C — may contain required artifacts |
| ezswitch-controller | internal | 0.0001 | P |
| ezswitch-controller | config | 0.0001 | P |
| kompass-agent | insights-agent | 0.3900 | P |
| kompass-agent | .git | 0.1751 | G |
| kompass-agent | action-taker | 0.0006 | P |
| kompass-agent | recommendation-maker | 0.0005 | P |
| kompass-agent | boot-measurement-script | 0.0000 | P |

## Possible review categories and cautious rationale

1. **Installed JavaScript dependencies:** `dashboard/node_modules` and `zesty-fed/node_modules` are substantial named examples. Across the tree, 16 outermost directories named `node_modules` account for approximately **2.1622 GiB of per-path allocation**. Installation reproducibility, local modifications, and offline requirements were not checked. This is not an authorized removal amount.
2. **Python environments:** named `.venv`, `venv`, or `env` directories account for approximately **4.7129 GiB of per-path allocation** across 17 outermost matches; this exact-name group excludes `.venv-test` (another 0.4275 GiB in automation). Names alone cannot establish that an environment is reproducible or unused; packages may be customized. Review environments separately from adjacent source/data.
3. **Possible build/cache output:** `dashboard/.angular` (1.2418 GiB), `ezswitch-controller/build` (0.1308 GiB), root `build` (0.0590 GiB), `.pytest_cache`, and `__pycache__` are name-based leads. Build directories can contain required release artifacts, so regeneration and ownership need confirmation before considering any action.
4. **Source/assets/business data:** retain project trees including `zesty-k8s` services, `automation/src`, `zesty-fed/apps`, tests, models, data, and configuration. A large service folder may mix source, environments, generated files, and data. `.databricks`, `localstack`, `.opencode`, and `bin` remain preserve-pending-owner-review; their purpose was not determined from contents.
5. **Git history and metadata:** 31 outermost `.git` directories account for approximately **2.1553 GiB of per-path allocation**. They preserve history and potentially local-only objects; they are **not disposable**. `.git` files in linked worktrees may reference other paths, but no such references were read or followed. Similar project/worktree names do not establish duplication or authorize removal.

Category totals can overlap (for example generated output inside dependencies) and use per-path rather than unique-block accounting. Do not add them together or treat them as reclaimable space. No aging, last-use, backup, rebuildability, or business-ownership claims are made; those require a separate owner-led review.
