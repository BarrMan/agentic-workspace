# Docker storage review — macOS

Docker Desktop recovery and the user-authorized cleanup completed on **2026-10-13**. The daemon was recovered after graceful quit/relaunch failed; Paca resources, build cache, and unreferenced images were then removed. The 11:55 inventory below is retained as a clearly marked pre-cleanup historical snapshot.

## Conclusion

**Authorized cleanup completed.** Graceful Docker Desktop quit/relaunch initially failed, with **20 Docker info timeouts during a bounded 240-second polling window**. Logs showed Docker Desktop 4.94.0 had hit “no space left on device” while writing VM logs during the earlier full-disk event; VM ext4 also logged “failed to convert unwritten extents to written extents -- potential data loss (error -5).” Recovery succeeded only after force-killing all `com.docker` processes, including stale backends 78718, 78900 and 78901, and relaunching. The daemon reported server **29.8.2**, API **1.56**.

Docker.raw is Docker Desktop's VM disk, containing more than container writable layers. Its measured host allocation fell from **29 GB to 4.5 GB** after cleanup; the sparse image's logical capacity is not its host allocation. Host data-volume free space increased from **51 GiB to 76 GiB**.

## Local runtime evidence and current blocker

| Check | Result |
| --- | --- |
| CLI executable | `/usr/local/bin/docker` |
| Desktop process probe | Stale backends 78718, 78900 and 78901 were force-killed before relaunch |
| Selected CLI context | `desktop-linux` |
| Context endpoint | `unix:///Users/imribarr/.docker/run/docker.sock` |
| Docker override variables | `DOCKER_HOST`, `DOCKER_CONTEXT`, `DOCKER_TLS_VERIFY`, `DOCKER_CERT_PATH`, and `DOCKER_CONFIG` absent |
| Successful startup inventory | Server version 29.8.2; API 1.56 |
| Initial recovery probes | 20 `docker --context desktop-linux info` calls timed out over 240 seconds |
| Host free space | Increased from 51 GiB to 76 GiB on the data volume after cleanup |

Context metadata verified the local Unix socket before daemon access. The graceful quit/relaunch attempt (`osascript -e 'quit app "Docker Desktop"'`, then `open -a Docker`) did not recover the daemon. Logs identified the VM-log disk-space failure and ext4 error described above. Force-killing the stale `com.docker` backends, then relaunching Docker Desktop, brought the local daemon up. The default context remained `desktop-linux`; no remote daemon was contacted. Immediately after startup, some bulk `docker rm`, `volume rm` and `image rm` calls returned a transient “404 page not found”; per-object commands worked. This was daemon-initialization state, not a persistent fault.

The earlier full-volume event had left about **137 MiB available**. The logs establish that Docker Desktop 4.94.0 ran out of space writing VM logs during that event; they also contain the ext4 potential-data-loss error. Recovery required termination of stale backends, not merely an app quit/relaunch.

Docker Desktop was left running with the daemon recovered. Cleanup was performed only after recovery.

## Authorized cleanup result

| Requested action | Actual result |
| --- | --- |
| Paca containers | Removed 10 named Paca service containers: `paca-gateway-1`, `paca-agent-runner-1`, `paca-web-1`, `paca-realtime-1`, `paca-api-1`, `paca-db-backup-1`, `paca-rustfs-1`, `paca-postgres-1`, `paca-valkey-1`, `paca-rustfs-init-1`; also removed unlabeled `paca-env-adbd99ec-8306-4c94-9501-6a84a55b485e` (matched by name), 11 containers total |
| Paca volumes | Removed 10: `paca_backend_plugins`, `paca_caddy_config`, `paca_caddy_data`, `paca_frontend_plugins`, `paca_mcp_plugins`, `paca_postgres_data`, `paca_rustfs_data`, `paca_skills_plugins`, `paca_valkey_data`, and `paca-env-adbd99ec-8306-4c94-9501-6a84a55b485e` |
| Paca images | Removed 5: `ghcr.io/paca-ai/paca-agent-server-goose:0.17.0`, `pacaai/paca-agent-runner:0.17.0`, `pacaai/paca-api:0.17.0`, `pacaai/paca-web:0.17.0`, `pacaai/paca-realtime:0.17.0` |
| `docker builder prune -af` | Cleared all 130 records; about **10.57 GB** |
| `docker image prune -af` | Reclaimed about **12.1 GB** of unreferenced images |

The global image prune also deleted unreferenced non-Paca images because the user authorized deletion of unreferenced images. These included `sintro-backend:*` tags `b2e3a03`, `10b99f1`, `latest`, `c0e9f7a`, `release-streamlining-check`, `c2055a1`, `f9d4ca2`, `87cfdf3`, `41f731f`, `0ffe137`, `release-streamlining-final`, `3d1c114`, `eb8ee21`, `7d74d26`; `sintro-ci-validation:local`; `gcc:12`; `client-grafana:latest`; `victoriametrics/victoria-metrics:v1.113.0`; `ghcr.io/lanbaoshen/mcp-jenkins`; `ghcr.io/usestrix/strix-sandbox:1.3.0`; `577926974532.dkr.ecr.us-west-2.amazonaws.com/kompass-gpu-stress:latest`; and `moby/buildkit:buildx-stable-1`. Docker was not reset, uninstalled or reinstalled; Docker.raw and VM files were not manually deleted.

Preserved containers: `sintro-postgres`, `sintro-redis` (infrastructure), `deskribe-query-api`, `grafana`, `victoriametrics` (mobileye-vm), and `kwok-clamp-repro-kwok-controller`, `-kube-scheduler`, `-kube-controller-manager`, `-kube-apiserver`, `-etcd`. Preserved volumes: `infra_lifeos-pgdata`, `infra_sintro-pgdata`, `mobileye-vm_grafana-data`, `mobileye-vm_vm-data`, and five unattached anonymous volumes (`57bb911c…`, `65a2d497…`, `91e251ea…`, `991d0025…`, `a85b74a9…`), about **207 MB** reclaimable.

Final `docker system df`: images **14** (10 active), **2.325 GB** (**604.8 MB** reclaimable); containers **10** (0 active), **341.5 MB** (all reclaimable); local volumes **9** (2 active), **559.7 MB** (**207.1 MB** reclaimable); build cache **0**.

## Last successful storage snapshot (11:55 +03:00, pre-cleanup historical; not current inventory)

Docker reports decimal GB/MB below; these are not GiB/MiB.

| Resource | Count / active | Docker size | Exact `system df` reclaimable estimate |
| --- | --- | --- | --- |
| Images | 42 / 19 referenced | 17.9 GB | 9.919 GB (55%) |
| Containers | 21 / 9 running | 341.5 MB | 341.5 MB (99%) |
| Local volumes | 19 / 15 attached | 634.9 MB | 207.1 MB (32%) |
| Build cache | 130 / 0 active | 10.57 GB | 8.451 GB |

`builder du` separately reported **2.119 GB shared, 8.451 GB private, 10.57 GB total/reclaimable**. Shared cache can remain referenced by images; do not add its 10.57 GB to image estimates. The conservative cache/image **review envelope is 18.370 GB (~17.11 GiB)** from 8.451 + 9.919 GB, conditional on a fresh inventory and confirming rebuild/download needs. It is not deletion approval or a promised host recovery amount.

### Containers and ages (11:55 pre-cleanup historical snapshot)

Nine running Paca services were created September 25 and restarted around 11:54:37–11:54:41 during authorized startup: gateway, agent-runner, web, realtime, api, db-backup, rustfs, postgres and valkey (names prefixed `paca-`, suffixed `-1`). Twelve were stopped:

- Paca agent environment and rustfs-init: stopped September 25, about 18 days old.
- `sintro-postgres` and `sintro-redis`: stopped October 2, about 11 days old.
- `deskribe-query-api`, five `kwok-clamp-repro-*` containers, `grafana`, `victoriametrics`: stopped August 16, about 58 days old; created April–June.

The stopped etcd container alone had a **338 MB writable layer**; the query API had **3.23 MB**. Container reclaimability does not establish that these layers are disposable. No event history was queried; ages use creation/start/finish metadata.

### Image references and shared layers (11:55 pre-cleanup historical snapshot)

Twenty-three images had no container references. Large review candidates: strix-sandbox 1.3.0 (`e9da9c4c3a03`, 4.032 GB unique, August 6); kompass-gpu-stress latest (`c9410081f6d7`, 2.323 GB unique, July 19); gcc:12 (`31dd671d7bb9`, 1.332 GB unique, July 14); sintro-ci-validation:local (`5e96c97bdbcc`, 779.2 MB unique, September 19); client-grafana:latest (`cd39100959dd`, 763.7 MB unique, April 23). Registry endpoint details are omitted.

Sintro backend images from September 13–19 each show 729–788 MB total but mostly shared layers; many unique sizes are only kilobytes or 1–2 MB. The `latest` and `10b99f1` tags share ID `cd171e2519a5` and must not be double-counted. Untagged PostgreSQL image `c05eced0bdb4` is still referenced by stopped `sintro-postgres`; untagged does not mean unused. The 3.28 GB Paca goose image is referenced by the stopped agent environment. Other referenced images are needed for existing running/stopped containers. Image creation dates are not last-use dates; cache access ages ranged approximately three weeks to five months.

### Volumes: all running and stopped attachments checked (11:55 pre-cleanup historical snapshot)

All 19 volumes used the local driver/scope. Eleven were attached to running containers (one also to stopped rustfs-init), four only to stopped containers, and four to none:

- Running: `paca_postgres_data` **69.75 MB** → postgres; `paca_valkey_data` **5.279 MB** → valkey; `paca_rustfs_data` **17.61 kB** → rustfs **and stopped rustfs-init**; caddy config/data → gateway; backend plugins → api; frontend/mcp/skills plugins → api and gateway. Anonymous volumes `91e251…` and `a85b74…` → db-backup and rustfs respectively (0 B reported).
- Stopped-only: `infra_sintro-pgdata` **352.6 MB** → sintro-postgres; `paca-env-adbd99ec-8306-4c94-9501-6a84a55b485e` **91.39 kB** → stopped agent environment; anonymous `991d002…` → sintro-redis and `57bb911…` → rustfs-init (0 B reported).
- Truly unattached in that snapshot: `infra_lifeos-pgdata` **134.3 MB**, `mobileye-vm_grafana-data` **51.33 MB**, `mobileye-vm_vm-data` **21.49 MB**, anonymous `65a2d497…` **89 B**. These comprise the 207.1 MB estimate but may still contain valuable data. Named dangling volumes are not disposable by definition.

Volumes were created March 30 or September 9–25. Host bind mounts also exist for Paca backups/configuration, Mobileye workspace/state and KWOK configuration. Their contents were not read, sizes were not measured, and they are outside the Docker-volume totals.

These tables describe the **pre-cleanup state at 11:55**, not current objects or reclaimable amounts. The post-cleanup inventory is recorded above.

## Supported cleanup choices for later review

1. Build cache cleanup was completed with `docker builder prune -af`; all 130 records were cleared, about 10.57 GB.
2. Unreferenced image cleanup was completed with `docker image prune -af`, reclaiming about 12.1 GB, including the non-Paca images listed above.
3. The authorized Paca containers, volumes and images listed above were removed. Preserved workloads and volumes are identified above.
4. **Avoid blanket `docker system prune --volumes`:** it removes stopped containers and can delete persistent data in unused anonymous volumes. Named volumes need separate review as well. Ordinary system prune also destroys stopped containers and their writable layers.
5. If intentionally retiring this Docker Desktop installation, use its supported reset/uninstall workflow after preserving needed data. Treat deletion of Docker.raw or reducing its maximum disk size as destructive, not routine cleanup. Docker documents that reducing the maximum deletes the current disk image and loses containers/images.

Docker.raw is sparse: logical capacity and host allocation differ. Docker documents host-space recovery after object deletion for Docker.raw, but deletion of files inside a container may not automatically release host space. After this cleanup, Docker.raw allocation decreased from **29 GB to 4.5 GB** and host free space increased from **51 GiB to 76 GiB**.

## Official references

- [Docker Desktop for Mac FAQ: disk image storage, sizing and reclamation](https://docs.docker.com/desktop/troubleshoot-and-support/faqs/macfaqs/)
- [Docker object pruning and volume risks](https://docs.docker.com/engine/manage-resources/pruning/)

Validation: local endpoint and default context were checked. After force-killing stale Docker backends and relaunching, the daemon reported server 29.8.2/API 1.56 and the authorized cleanup completed. Final `docker system df`, Docker.raw allocation and host free space are recorded above. Container environment/secrets and mounted contents were not inspected; application-level data value remains unverified. The 11:55 counts and attachment details are historical pre-cleanup evidence only.
