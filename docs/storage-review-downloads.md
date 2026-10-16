---
consolidation:
  total: 186
  counts:
    exists: 0
    discard: 148
    integrate: 0
    unconfirmed: 38
  percentages:
    exists: 0.00%
    discard: 79.57%
    integrate: 0.00%
    unconfirmed: 20.43%
---
# Downloads storage review

## Result

Metadata scan on 2026-10-13T11:36:42: **727 top-level entries, 64.27 GiB allocated after hard-link deduplication**. The per-entry manifest sums to **64.29 GiB** (69,031,895,040 bytes), because paths to the same inode are counted individually. Scan duration: 9.7 seconds. Sizes count lstat st_blocks × 512 recursively, including directory allocation, without following symlinks. <!-- consolidation: discard; ref: none; reason: Historical host measurement and method. -->

[Full top-level manifest](storage-review-downloads.tsv) contains every entry, allocated size, inferred category/confidence, recommended action, rationale, proposed folder, unverified duplicate evidence and modification metadata. <!-- consolidation: discard; ref: none; reason: Supporting host inventory description. -->

No Downloads entries were moved, deleted, tagged, extracted or opened. No app was launched. Only these two report files were written. <!-- consolidation: discard; ref: none; reason: Historical non-action record. -->

## Categories and proposed folders

These are **proposed logical destinations only**, not created folders. Folder names start with Downloads/ and are relative to the home directory. Confidence describes category evidence, not deletion safety. <!-- consolidation: discard; ref: none; reason: Report-local classification legend. --> KEEP means preserve pending backup/ownership verification; REVIEW requires a human decision; DELETE-CANDIDATE is a recommendation, never an operation. <!-- consolidation: unconfirmed; ref: none; reason: Owner and backup gates remain unresolved, labels grant no cleanup permission. -->

| Category | Entries | Allocated | Proposed folder |
|---|---:|---:|---|
| archives/shares | 69 | 27.32 GiB | Downloads/Archives and Shares <!-- consolidation: discard; ref: none; reason: Host inventory and optional folder sketch, not product scope. --> |
| media/photos/assets | 242 | 18.16 GiB | Downloads/Media and Assets <!-- consolidation: discard; ref: none; reason: Host inventory and optional folder sketch, not product scope. --> |
| installers | 50 | 6.53 GiB | Downloads/Installers <!-- consolidation: discard; ref: none; reason: Host inventory and optional folder sketch, not product scope. --> |
| study/documents | 197 | 5.90 GiB | Downloads/Documents and Study <!-- consolidation: discard; ref: none; reason: Host inventory and optional folder sketch, not product scope. --> |
| source/tools | 81 | 4.91 GiB | Downloads/Source and Tools <!-- consolidation: discard; ref: none; reason: Host inventory and optional folder sketch, not product scope. --> |
| CAD/3D-print assets | 39 | 860.07 MiB | Downloads/CAD and 3D Printing <!-- consolidation: discard; ref: none; reason: Host inventory and optional folder sketch, not product scope. --> |
| unknown | 25 | 614.97 MiB | Downloads/Review <!-- consolidation: discard; ref: none; reason: Host inventory and optional folder sketch, not product scope. --> |
| logs/reports | 8 | 31.98 MiB | Downloads/Logs and Reports <!-- consolidation: discard; ref: none; reason: Host inventory and optional folder sketch, not product scope. --> |
| credentials/config | 16 | 0.18 MiB | Downloads/Credentials and Config <!-- consolidation: discard; ref: none; reason: Host inventory and optional folder sketch, not product scope. --> |

Categories describe top-level containers; archives and shares can contain mixed material and have not been reclassified from their contents. <!-- consolidation: discard; ref: none; reason: Historical classification limitation. -->

## Largest top-level entries

| Entry | Allocated | Category | Confidence | Action | Rationale |
|---|---:|---|---|---|---|
| MyAirBridge File Share | 14.33 GiB | archives/shares | medium | KEEP | Purpose inferred from directory name; contents not read. <!-- consolidation: unconfirmed; ref: none; reason: Owner preservation decision pending. --> |
| Characters | 8.28 GiB | media/photos/assets | medium | KEEP | Purpose inferred from directory name; contents not read. Duplicate/related names are unverified; no contents compared. <!-- consolidation: unconfirmed; ref: none; reason: Duplicate status and preservation decision pending. --> |
| Characters-Copy | 8.09 GiB | media/photos/assets | medium | KEEP | Purpose inferred from directory name; contents not read. Duplicate/related names are unverified; no contents compared. <!-- consolidation: unconfirmed; ref: none; reason: Duplicate status and preservation decision pending. --> |
| Photos part 1.zip | 4.76 GiB | archives/shares | high | KEEP | Archive extension; unique contents and backup status unknown. <!-- consolidation: unconfirmed; ref: none; reason: Unique-content and backup gate unresolved. --> |
| לימודים | 4.61 GiB | study/documents | medium | KEEP | Purpose inferred from directory name; contents not read. <!-- consolidation: unconfirmed; ref: none; reason: Owner preservation decision pending. --> |
| Photos 2.zip | 3.40 GiB | archives/shares | high | KEEP | Archive extension; unique contents and backup status unknown. <!-- consolidation: unconfirmed; ref: none; reason: Unique-content and backup gate unresolved. --> |
| vm-export-data | 2.65 GiB | source/tools | medium | REVIEW | Purpose inferred from directory name; contents not read. <!-- consolidation: unconfirmed; ref: none; reason: Owner and data-retention decision pending. --> |
| Downloads.zip | 1.72 GiB | archives/shares | high | KEEP | Archive extension; unique contents and backup status unknown. <!-- consolidation: unconfirmed; ref: none; reason: Unique-content and backup gate unresolved. --> |
| tmp.zip | 1.38 GiB | archives/shares | high | KEEP | Archive extension; unique contents and backup status unknown. <!-- consolidation: unconfirmed; ref: none; reason: Unique-content and backup gate unresolved. --> |
| Projects.zip | 914.98 MiB | archives/shares | high | KEEP | Archive extension; unique contents and backup status unknown. <!-- consolidation: unconfirmed; ref: none; reason: Unique-content and backup gate unresolved. --> |
| web_valley_forums | 796.87 MiB | source/tools | medium | REVIEW | Source/tool/data artifact inferred from name or extension; may be project output or original data. <!-- consolidation: unconfirmed; ref: none; reason: Original-data retention decision pending. --> |
| מסמכים | 782.31 MiB | study/documents | medium | KEEP | Purpose inferred from directory name; contents not read. <!-- consolidation: unconfirmed; ref: none; reason: Owner preservation decision pending. --> |
| smplx_blender_addon_20230921.zip | 699.41 MiB | CAD/3D-print assets | medium | KEEP | CAD/electronics/3D-print purpose inferred from name or extension; may be original work. <!-- consolidation: unconfirmed; ref: none; reason: Original-work preservation decision pending. --> |
| Steinberg | 691.35 MiB | media/photos/assets | medium | KEEP | Purpose inferred from directory name; contents not read. <!-- consolidation: unconfirmed; ref: none; reason: Owner preservation decision pending. --> |
| ChatGPT (1).dmg | 622.93 MiB | installers | high | REVIEW | Installer/package/app bundle inferred from extension; installation status not established. Duplicate/related names are unverified; no contents compared. <!-- consolidation: unconfirmed; ref: none; reason: Installation and duplicate review pending. --> |
| connect_device_node | 570.50 MiB | source/tools | medium | REVIEW | Source/tool/data artifact inferred from name or extension; may be project output or original data. <!-- consolidation: unconfirmed; ref: none; reason: Original-data retention decision pending. --> |
| lumi_connection_kit | 570.47 MiB | source/tools | medium | REVIEW | Source/tool/data artifact inferred from name or extension; may be project output or original data. <!-- consolidation: unconfirmed; ref: none; reason: Original-data retention decision pending. --> |
| Docker.dmg | 555.45 MiB | installers | high | REVIEW | Installer/package/app bundle inferred from extension; installation status not established. <!-- consolidation: unconfirmed; ref: none; reason: Installer need and deletion permission pending. --> |
| Desktop | 501.99 MiB | unknown | low | REVIEW | Name provides insufficient purpose evidence; inspect personally before deciding. <!-- consolidation: unconfirmed; ref: none; reason: Purpose and owner disposition unresolved. --> |
| Nimbalyst-macOS-arm64.dmg | 463.18 MiB | installers | high | DELETE-CANDIDATE | User states Nimbalyst is already uninstalled; obsolete installer candidate, not application/user data. <!-- consolidation: unconfirmed; ref: none; reason: Uninstalled status does not grant installer-deletion permission. --> |
| WhatsApp Chat with Mom | 408.83 MiB | archives/shares | medium | KEEP | Purpose inferred from directory name; contents not read. <!-- consolidation: unconfirmed; ref: none; reason: Personal-data preservation decision pending. --> |
| Documents | 266.92 MiB | study/documents | medium | KEEP | Purpose inferred from directory name; contents not read. <!-- consolidation: unconfirmed; ref: none; reason: Personal-data preservation decision pending. --> |
| Anytype-0.56.5-mac-arm64.dmg | 261.50 MiB | installers | high | REVIEW | Installer/package/app bundle inferred from extension; installation status not established. <!-- consolidation: unconfirmed; ref: none; reason: Installer need and deletion permission pending. --> |
| Bambu_Studio_mac-v02.06.01.55-20260428201229.dmg | 260.11 MiB | installers | high | REVIEW | Installer/package/app bundle inferred from extension; installation status not established. Duplicate/related names are unverified; no contents compared. <!-- consolidation: unconfirmed; ref: none; reason: Installation and duplicate review pending. --> |
| Bambu_Studio_mac-v02.06.00.51.dmg | 258.83 MiB | installers | high | REVIEW | Installer/package/app bundle inferred from extension; installation status not established. Duplicate/related names are unverified; no contents compared. <!-- consolidation: unconfirmed; ref: none; reason: Installation and duplicate review pending. --> |
| agent-orchestrator-darwin-arm64.dmg | 229.28 MiB | installers | high | REVIEW | Installer; installation status explicitly unclear. Review before deleting. <!-- consolidation: unconfirmed; ref: none; reason: Installation and deletion permission pending. --> |
| ChatGPT_Atlas.dmg | 221.52 MiB | installers | high | REVIEW | Installer/package/app bundle inferred from extension; installation status not established. Duplicate/related names are unverified; no contents compared. <!-- consolidation: unconfirmed; ref: none; reason: Installation and duplicate review pending. --> |
| UltiMaker-Cura-5.7.0-macos-ARM64.dmg | 213.79 MiB | installers | high | REVIEW | Installer/package/app bundle inferred from extension; installation status not established. <!-- consolidation: unconfirmed; ref: none; reason: Installer need and deletion permission pending. --> |
| pgadmin4-8.6-arm64.dmg | 210.25 MiB | installers | high | REVIEW | Installer/package/app bundle inferred from extension; installation status not established. <!-- consolidation: unconfirmed; ref: none; reason: Installer need and deletion permission pending. --> |
| Documents.zip | 205.83 MiB | archives/shares | high | KEEP | Archive extension; unique contents and backup status unknown. <!-- consolidation: unconfirmed; ref: none; reason: Unique-content and backup gate unresolved. --> |

## Important directory subgroups

Largest immediate children by allocated size; bounded to eight per important directory. These names are metadata evidence only. Smaller directories remain fully represented at top level in the TSV. <!-- consolidation: discard; ref: none; reason: Historical inventory sampling. -->

### MyAirBridge File Share — 14.33 GiB
<!-- consolidation: discard; ref: none; reason: Historical directory allocation. -->

| Immediate subgroup | Allocated | Metadata entries |
|---|---:|---:|
| D&I full movie.mp4 | 13.71 GiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| highlights.mp4 | 634.98 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |

### Characters — 8.28 GiB
<!-- consolidation: discard; ref: none; reason: Historical directory allocation. -->

| Immediate subgroup | Allocated | Metadata entries |
|---|---:|---:|
| UnifiedGesture | 3.48 GiB | 1420 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| video | 1.19 GiB | 6266 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| tmp-peter-assets | 700.72 MiB | 1973 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| node_modules | 516.43 MiB | 31225 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| bvh2vrma | 413.81 MiB | 24368 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| tools | 413.68 MiB | 24366 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| experiments | 365.30 MiB | 1530 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| client | 328.12 MiB | 13987 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |

32 additional immediate children: 960.25 MiB combined. <!-- consolidation: discard; ref: none; reason: Historical subtotal. -->

### Characters-Copy — 8.09 GiB
<!-- consolidation: discard; ref: none; reason: Historical directory allocation. -->

| Immediate subgroup | Allocated | Metadata entries |
|---|---:|---:|
| UnifiedGesture | 3.48 GiB | 1418 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| video | 1.19 GiB | 6266 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| tmp-peter-assets | 700.72 MiB | 1973 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| node_modules | 516.43 MiB | 31225 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| bvh2vrma | 413.81 MiB | 24368 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| tools | 413.67 MiB | 24366 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| client | 328.12 MiB | 13987 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| animation-pipeline | 282.69 MiB | 1213 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |

32 additional immediate children: 849.68 MiB combined. <!-- consolidation: discard; ref: none; reason: Historical subtotal. -->

### לימודים — 4.61 GiB
<!-- consolidation: discard; ref: none; reason: Historical directory allocation. -->

| Immediate subgroup | Allocated | Metadata entries |
|---|---:|---:|
| לינארית 2 | 4.26 GiB | 4 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| לינארית | 199.42 MiB | 96 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Hermit | 37.32 MiB | 21 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Hermit.zip | 24.24 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| ממן 11.pdf | 23.20 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| ‎⁨דף נוסחאות_250906_215811⁩.pdf | 17.20 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Print | 14.20 MiB | 18 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| סיכומים-1.pdf | 11.89 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |

14 additional immediate children: 31.15 MiB combined. <!-- consolidation: discard; ref: none; reason: Historical subtotal. -->

### vm-export-data — 2.65 GiB
<!-- consolidation: discard; ref: none; reason: Historical directory allocation. -->

| Immediate subgroup | Allocated | Metadata entries |
|---|---:|---:|
| vm-export-605457481428--1756313930.json | 1.01 GiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| vm-export-511502319490-prod-microservices-eks-cluster-1756910535.json | 716.93 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| vm-export-987963041218-uat-microservices-eks-cluster-1756910380.json | 505.55 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| vm-export-004940862025-dev-microservices-eks-cluster-1756910244.json | 284.50 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| vm-export-493551397432-perf-prod-1756972518.json | 167.84 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| kompass-pod-info.json | 5.54 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |

### web_valley_forums — 796.87 MiB
<!-- consolidation: discard; ref: none; reason: Historical directory allocation. -->

| Immediate subgroup | Allocated | Metadata entries |
|---|---:|---:|
| challenge | 796.84 MiB | 5390 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| .DS_Store | 0.01 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| config | 0.00 MiB | 2 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Dockerfile | 0.00 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| build-docker.sh | 0.00 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| package-lock.json | 0.00 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |

### מסמכים — 782.31 MiB
<!-- consolidation: discard; ref: none; reason: Historical directory allocation. -->

| Immediate subgroup | Allocated | Metadata entries |
|---|---:|---:|
| FreeCAD_1.0.0-conda-macOS-arm64-py311.dmg | 576.54 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Vivaldi.7.3.3635.11.universal.dmg | 202.57 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Gmail - Fwd_ 🛄 תודה! ההזמנה שלכם ב-Moorea Boutique Resort Samui מאושרת.pdf | 0.72 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Gmail - Fwd_ 🛄 תודה! ההזמנה שלכם ב-Triple Y Hotel מאושרת.pdf | 0.70 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Gmail - Fwd_ VENICE KRABI VILLA RESORT - BOOKING CONFIRMATION [grzwzet182].pdf | 0.57 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Gmail - Fwd_ Reservation Confirmation #6112067 at TWINPALMS BANGTAO PHUKET TENTED RESORT.pdf | 0.50 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Gmail - Fwd_ 🚕 Danielle, your journey from Bangkok Suvanabhumi International Airport (BKK) is confirmed_.pdf | 0.46 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Gmail - RECEIPT FOR YOUR PAYMENT TO Venice Krabi Company Limited.pdf | 0.14 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |

3 additional immediate children: 0.10 MiB combined. <!-- consolidation: discard; ref: none; reason: Historical subtotal. -->

### Steinberg — 691.35 MiB
<!-- consolidation: discard; ref: none; reason: Historical directory allocation. -->

| Immediate subgroup | Allocated | Metadata entries |
|---|---:|---:|
| OSX | 691.34 MiB | 5 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| .DS_Store | 0.01 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |

### connect_device_node — 570.50 MiB
<!-- consolidation: discard; ref: none; reason: Historical directory allocation. -->

| Immediate subgroup | Allocated | Metadata entries |
|---|---:|---:|
| aws-iot-device-sdk-js-v2 | 570.47 MiB | 17926 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| .DS_Store | 0.01 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Lumi-test-Policy | 0.00 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| root-CA.crt | 0.00 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| .vscode | 0.00 MiB | 2 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Lumi-test.public.key | 0.00 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| start.sh | 0.00 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Lumi-test.private.key | 0.00 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |

1 additional immediate children: 0.00 MiB combined. <!-- consolidation: discard; ref: none; reason: Historical subtotal. -->

### lumi_connection_kit — 570.47 MiB
<!-- consolidation: discard; ref: none; reason: Historical directory allocation. -->

| Immediate subgroup | Allocated | Metadata entries |
|---|---:|---:|
| aws-iot-device-sdk-js-v2 | 570.44 MiB | 17926 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| .DS_Store | 0.01 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Lumi.public.key | 0.00 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Lumi-Policy | 0.00 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Lumi.private.key | 0.00 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| root-CA.crt | 0.00 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Lumi.cert.pem | 0.00 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| start.sh | 0.00 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |

### Desktop — 501.99 MiB
<!-- consolidation: discard; ref: none; reason: Historical directory allocation. -->

| Immediate subgroup | Allocated | Metadata entries |
|---|---:|---:|
| Screen Recording 2023-02-15 at 16.22.43.mov | 77.64 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Screen Recording 2023-02-15 at 16.14.04.mov | 72.24 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Screen Recording 2023-02-15 at 16.18.46.mov | 68.00 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Screen Recording 2023-02-15 at 15.22.27.mov | 58.41 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Screen Recording 2023-02-15 at 15.17.43.mov | 30.80 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Screen Recording 2022-02-03 at 20.14.50.mov | 17.88 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Screen Recording 2023-02-15 at 15.10.57.mov | 17.51 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Screen Recording 2022-07-06 at 12.01.51.mov | 16.35 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |

69 additional immediate children: 143.17 MiB combined. <!-- consolidation: discard; ref: none; reason: Historical subtotal. -->

### WhatsApp Chat with Mom — 408.83 MiB
<!-- consolidation: discard; ref: none; reason: Historical directory allocation. -->

| Immediate subgroup | Allocated | Metadata entries |
|---|---:|---:|
| VID-20230724-WA0034.mp4 | 27.14 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| VID-20240318-WA0003.mp4 | 25.89 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| VID-20220123-WA0009.mp4 | 12.12 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| VID-20200808-WA0005.mp4 | 10.80 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| VID-20210610-WA0021.mp4 | 10.46 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| VID-20200812-WA0000.mp4 | 9.75 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| VID-20210906-WA0007.mp4 | 9.20 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| VID-20210117-WA0009.mp4 | 9.11 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |

1100 additional immediate children: 294.36 MiB combined. <!-- consolidation: discard; ref: none; reason: Historical subtotal. -->

### Documents — 266.92 MiB
<!-- consolidation: discard; ref: none; reason: Historical directory allocation. -->

| Immediate subgroup | Allocated | Metadata entries |
|---|---:|---:|
| PlatformIO | 99.96 MiB | 1580 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Desktop | 69.85 MiB | 33 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Prints | 25.14 MiB | 21 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Zoom | 24.64 MiB | 155 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Arduino | 19.00 MiB | 1796 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| Recordings | 10.35 MiB | 6 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| מסמכים | 5.77 MiB | 28 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| concert | 5.48 MiB | 9 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |

10 additional immediate children: 6.72 MiB combined. <!-- consolidation: discard; ref: none; reason: Historical subtotal. -->

### law — 33.55 MiB
<!-- consolidation: discard; ref: none; reason: Historical directory allocation. -->

| Immediate subgroup | Allocated | Metadata entries |
|---|---:|---:|
| ראשי | 30.64 MiB | 8 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| כתב הגנה.pdf | 1.94 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| כתב תביעה.pdf | 0.96 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| .DS_Store | 0.01 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |

### Mom lawsuit part 1 — 21.26 MiB
<!-- consolidation: discard; ref: none; reason: Historical directory allocation. -->

| Immediate subgroup | Allocated | Metadata entries |
|---|---:|---:|
| 6.jpg | 2.76 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| 9.jpg | 2.60 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| 1.jpg | 2.45 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| 4.jpg | 2.24 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| 2.jpg | 2.24 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| 5.jpg | 2.16 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| 10.jpg | 1.73 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |
| 3.jpg | 1.72 MiB | 1 <!-- consolidation: discard; ref: none; reason: Historical host inventory. --> |

3 additional immediate children: 3.36 MiB combined. <!-- consolidation: discard; ref: none; reason: Historical subtotal. -->

## Recommended decisions

- **Preserve photos, Characters assets, MyAirBridge shares and all archives** until their ownership, unique contents and independent backup have been verified. Characters / Characters-Copy is an unverified name-based duplicate candidate; do not infer 8 GiB is recoverable. <!-- consolidation: unconfirmed; ref: none; reason: Ownership, backup and duplicate-verification gate unresolved. -->
- **Preserve study, family/legal documents and correspondence.** Suggested label: documents-study or documents-personal-legal after the owner confirms purpose. Extension-based grouping does not establish topic. <!-- consolidation: unconfirmed; ref: none; reason: Personal-data disposition and classification require owner confirmation. -->
- **Nimbalyst DMG: DELETE-CANDIDATE**, based on the supplied fact that Nimbalyst is already uninstalled. This applies only to the installer. <!-- consolidation: unconfirmed; ref: none; reason: Installer deletion recommendation is not explicit permission. -->
- **agent-orchestrator DMG: REVIEW**; installation unclear. Other DMGs/packages/app bundles are also REVIEW: confirm installed version, need for offline reinstall and ownership before deletion. App bundles inside Downloads can themselves be the working application. <!-- consolidation: unconfirmed; ref: none; reason: Installer and working-app safety review remains unresolved. -->
- **Related installer names:** Bambu Studio versions, ChatGPT variants and numbered copies may be obsolete, but are not proven duplicates. No hashing or byte comparison was performed. <!-- consolidation: unconfirmed; ref: none; reason: Duplicate status cannot justify removal without verification. -->
- **Source/tools, logs/reports and unknown items: REVIEW.** Folder names such as dist or tmp do not prove disposability; project originals, debugging evidence or exports may be unique. <!-- consolidation: unconfirmed; ref: none; reason: Owner and unique-content review remains unresolved. -->
- **Credentials/config: KEEP, private review.** Certificate/key/VPN suffixes suggest sensitive configuration. Do not share this manifest publicly without checking its filenames. <!-- consolidation: unconfirmed; ref: none; reason: Credential preservation and publication privacy gate remains unresolved. -->

## Validation and limitations

- Independent `du -sk` cross-check: Downloads totals **67,393,672 KiB = 64.271614 GiB**, matching the earlier 64.27 GiB measurement. A metadata-only inode check found **two repeated inode entries totaling 19.8125 MiB**, exactly explaining the difference from the manifest sum; no content comparison or hashing was needed. <!-- consolidation: discard; ref: none; reason: Historical validation evidence. -->
- The five largest entries cross-check at **40.043568 GiB** with `du`. MyAirBridge, Characters-Copy, Photos part 1.zip and לימודים agree with the manifest. Characters is **8.258087 GiB** with hard links counted once versus **8.277435 GiB** by summed paths. Category and manifest totals below intentionally retain per-path accounting; they should not be read as unique disk usage or recoverable space. <!-- consolidation: discard; ref: none; reason: Historical validation and accounting limits. -->

- Top-five allocated subtotal: **40.06 GiB**, 62.3% of the measured total. Remaining entries: 24.23 GiB. Independently summed category bytes equal top-level bytes: True. <!-- consolidation: discard; ref: none; reason: Historical subtotal validation. -->
- Previous baseline: 64.27 GiB (rounded). Current difference: +0.02 GiB; small differences can arise from rounding, directory blocks or changes since the earlier measurement. <!-- consolidation: discard; ref: none; reason: Historical baseline comparison. -->
- Action totals: DELETE-CANDIDATE 463.18 MiB, KEEP 52.22 GiB, REVIEW 11.62 GiB. These are classification totals, not promised recoverable space. <!-- consolidation: discard; ref: none; reason: Historical classification totals, no new removal authority. -->
- Allocated sizes represent filesystem-reported blocks, not logical download sizes. Hard links across entries can be counted twice; APFS clones/compression/shared blocks mean summed allocations are not guaranteed space recovered by deletion. Cloud-only placeholders may have little allocation; none were opened or downloaded. <!-- consolidation: discard; ref: none; reason: Historical accounting interpretation and limits. -->
- No personal document/media contents, archive members or symlink targets were read. No archives were extracted. Installed-app metadata was not consulted; Nimbalyst status comes from the supplied context, not a fresh installation audit. <!-- consolidation: discard; ref: none; reason: Historical audit scope and provenance. -->
- Filename-based classification can be wrong. Mixed directories are grouped by their top-level purpose; confidence is intentionally limited for name-only inference. <!-- consolidation: discard; ref: none; reason: Historical classification limitation. -->
- Permission/stat omissions: 0. <!-- consolidation: discard; ref: none; reason: Historical scan completion evidence. -->
