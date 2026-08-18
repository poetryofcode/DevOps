# Full-Stack DevOps Stack

The app itself is deliberately small. The interesting part is everything around it.

![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=flat&logo=nestjs&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)
![Prometheus](https://img.shields.io/badge/Prometheus-E6522C?style=flat&logo=prometheus&logoColor=white)
![Grafana](https://img.shields.io/badge/Grafana-F46800?style=flat&logo=grafana&logoColor=white)
![Argo CD](https://img.shields.io/badge/Argo%20CD-EF7B4D?style=flat&logo=argo&logoColor=white)

---

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript | Tailwind, shadcn/ui, TanStack Query, react-hook-form + Zod |
| Backend | NestJS 10 + TypeORM | Swagger-generated OpenAPI, `prom-client` metrics |
| Database | PostgreSQL 16 (alpine) | Named volume `pgdata`, `pg_isready` healthcheck |
| Serving | nginx (alpine) | SPA fallback + long-cache for static assets |
| Build | Multi-stage Dockerfiles | `linux/amd64`, prod-only deps in the runtime stage |
| Orchestration | Docker Compose (VPS) → Kubernetes (Helm + Argo CD) | |
| CI/CD | GitHub Actions | Typecheck on PR, build/push + GitOps bump on merge |
| Observability | Prometheus, Grafana, Loki, Promtail, node-exporter | |
| Testing | Playwright e2e + curl smoke checks | |
| Secrets hygiene | gitleaks config, `.env.production*` gitignored | |

## Architecture

```
                    ┌──────────────────────────────┐
  browser ───────►  │  front (nginx :80 → 18080)   │  static SPA build
                    └──────────────┬───────────────┘
                                   │  VITE_API_URL (baked at build time)
                                   ▼
                    ┌──────────────────────────────┐
                    │  back  (NestJS :3000 → 13000)│  /todos /health /ready /metrics
                    └──────────────┬───────────────┘
                                   │  depends_on: service_healthy
                                   ▼
                    ┌──────────────────────────────┐
                    │  db (postgres:16 → 15432)    │  volume: pgdata
                    └──────────────────────────────┘

  observability overlay (127.0.0.1 only, Grafana exposed via host nginx + TLS)
  prometheus ──scrape──► back:3000/metrics, node-exporter:9100
  promtail ──docker socket──► loki ──datasource──► grafana
```

## Repository layout

```
.
├── back/                     NestJS API (todos, health, ready, metrics, test-reset)
├── front/                    React SPA + Playwright e2e suite
├── app-config/app.json       Runtime config, bind-mounted read-only into the API
├── monitoring/               Prometheus, Loki, Promtail, Grafana provisioning
├── scripts/smoke.sh          Read-only post-deploy verification
├── .github/workflows/        typecheck (reusable) → pr-check → deploy (GitOps)
├── docker-compose.yml        Prod services: db, back, front
├── docker-compose.observability.yml   Overlay: prometheus, grafana, loki, promtail, node-exporter
├── .env.development.*        Local/compose configuration (no real secrets)
└── Makefile                  Every workflow lives here
```

## Quick start

Images are pulled from Docker Hub — Compose never builds from source. Building and publishing is the Makefile's job.

```bash
# 1. pull published images and start the stack
make pull
make up

# 2. check it
open http://localhost:18080          # frontend
curl localhost:13000/health          # {"status":"ok","version":"..."}
open http://localhost:13000/swagger  # API docs

# 3. tear down (pgdata survives)
make down
```

To build and publish your own images instead:

```bash
make build            # back + front, --platform linux/amd64
make push             # pushes :$IMAGE_TAG and :latest
```

### End-to-end tests

```bash
make e2e-install      # once: npm deps + Chromium for Playwright
make e2e              # against the local compose stack
make e2e-deployed     # against the VPS (needs .env.production.e2e)
make smoke-deployed   # read-only: /api/health, HTML index, /api/metrics
```

### Observability

```bash
make up-observability     # prod services + monitoring overlay
```

Grafana lands on `127.0.0.1:3000` with Prometheus and Loki already provisioned as datasources. Everything binds to loopback on purpose — Docker writes iptables rules that bypass UFW, so a bare `3000:3000` would publish the port on the public IP. Only Grafana is exposed outward, through the host nginx with TLS; the rest is reachable over an SSH tunnel.

## Makefile targets

| Target | What it does |
|---|---|
| `build` / `build-back` / `build-front` | Build images, tagged `$IMAGE_TAG` and `latest` |
| `push` / `push-back` / `push-front` | Publish to Docker Hub |
| `pull` | Fetch published images (no local build) |
| `up` / `down` / `down-v` | Compose lifecycle; `down-v` also drops `pgdata` |
| `logs` / `ps` | Stream logs / show container status |
| `e2e-install` / `e2e` / `e2e-deployed` | Playwright suites |
| `smoke-deployed` | Non-mutating health check of the deployed stack |
| `up-observability` / `down-observability` / `down-observability-v` | Monitoring overlay |

## Environment files

Committed `.env.development.*` files hold local Docker credentials only. Anything that could carry a real secret is gitignored, and `.gitleaks.toml` guards the rest.

| File | Consumed by | Contains |
|---|---|---|
| `.env.development.compose` | Makefile + Compose (`--env-file`) | `DOCKERHUB_USERNAME`, image tag |
| `.env.development.db` | `db` service | `POSTGRES_USER` / `_PASSWORD` / `_DB` |
| `.env.development.back` | `back` service | `PORT`, `DB_*`, `CORS_ORIGIN` |
| `.env.development.front` | build arg | `VITE_API_URL` (baked into the bundle at build time) |
| `.env.development.e2e` | Playwright | `E2E_BASE_URL`, `E2E_API_URL` (localhost) |
| `.env.production.e2e` | Playwright / smoke | Same, pointed at the deployed domain |

## API

| Method | Path | Description |
|---|---|---|
| `GET` | `/todos` | List, newest first |
| `GET` | `/todos/:id` | Single todo (UUID-validated) |
| `POST` | `/todos` | Create — rejected once `maxTodos` is reached |
| `PATCH` | `/todos/:id` | Partial update |
| `DELETE` | `/todos/:id` | Remove (204) |
| `GET` | `/health` | Liveness — process only, reports `APP_VERSION` |
| `GET` | `/ready` | Readiness — runs `SELECT 1`, returns 503 if the DB is down |
| `GET` | `/metrics` | Prometheus exposition format |
| `POST` | `/test/reset` | Truncates todos; requires a shared e2e token |

**Liveness vs readiness.** `/health` never touches the database: a failure there means the process is wedged and Kubernetes should restart it. `/ready` does check the DB, and a failure only pulls the pod out of the Service endpoints. Restarting the API doesn't fix a down database, so conflating the two would turn a database blip into a cascading restart loop.

## Runtime configuration

`app-config/app.json` is bind-mounted at `/app/config` **read-only**, so the container physically cannot write back to the host:

```json
{ "maxTodos": 5 }
```

The API re-reads it on every create, which means the limit can be changed on a running deployment without rebuilding an image — and an unparseable file surfaces as a clear 500 rather than a silent default.

## Metrics

Default Node.js metrics from `prom-client`, plus two custom instruments applied via middleware:

- `http_requests_total` — counter, labeled `method` / `route` / `status_code`
- `http_response_time_seconds` — histogram, buckets `0.01 … 5s`

`/metrics`, `/health`, and `/ready` are excluded from instrumentation: probes hit them constantly and would swamp the latency histogram with traffic no user ever generated. Routes fall back to `req.path` when Express hasn't matched a handler, so 404s don't lose their label.

## CI/CD

**On pull request** — `pr-check.yaml` calls the reusable `typecheck.yaml`, which runs `tsc --noEmit` for `back` and `front` in parallel with `fail-fast: false`, so one broken service doesn't hide the other's errors.

**On push to `week*`** — `deploy.yml` runs a push-based build feeding a pull-based delivery:

1. Build and push both images to Docker Hub, tagged `sha-<commit>` — immutable, traceable, and rollback-able in a way `latest` never is.
2. Check out the separate `devops-gitops` repo, bump the image tags in `helm/myapp/values-production.yaml` with `yq`, open a PR, and squash-merge it. The desired state of the cluster is a commit, not a side effect of a pipeline.
3. Trigger `argocd app sync` and wait for convergence.

## Notes and gotchas

- **Compose builds nothing.** Images always come from the registry; `make build` is what produces them. That keeps the artifact the pipeline tested identical to the one the server runs.
- **Healthcheck variables are escaped with `$$`.** Otherwise Compose interpolates them at parse time on the host instead of letting the container's shell expand them at runtime.
- **`service_healthy` for the DB, `service_started` for the API.** Started is not ready — the backend waits on an actual `pg_isready`, while the frontend only needs the API container to exist, since nginx serves static files regardless.
- **`VITE_API_URL` is a build arg, not a runtime env var.** Vite inlines it into the bundle, so pointing the frontend at a different API means rebuilding the image.
- **Single-arch `linux/amd64` builds.** An image built on an M-series Mac won't otherwise start on an amd64 host.
- **Cross-check `IMAGE_TAG` and `APP_VERSION`.** `docker-compose.yml` interpolates `${APP_VERSION}` into the image references while `.env.development.compose` defines `IMAGE_TAG`; whichever name you settle on has to appear in both places or Compose resolves the tag to an empty string.

## Roadmap

- [x] Multi-stage Docker builds, nginx SPA serving
- [x] Compose stack with healthchecks, named volume, read-only runtime config
- [x] Playwright e2e + smoke verification
- [x] GitHub Actions: typecheck on PR, build/push on merge
- [x] Prometheus + Grafana + Loki + Promtail on the VPS
- [x] GitOps delivery via Helm values bump + Argo CD sync
- [ ] Grafana dashboards committed as provisioned JSON
- [ ] Alerting rules (error rate, p95 latency, disk)
- [ ] Replace the shared Grafana admin password with proper secret management
