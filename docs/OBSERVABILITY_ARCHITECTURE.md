# FieldTrack — Observability Architecture

Source audit: 2026-11-24. The API owns instrumentation; the separate infra
repository owns monitoring services. Configuration files are not evidence that
the stack is running or that every alert has a valid input series.

## API surfaces

| Surface | Implementation |
|---|---|
| `GET /metrics` | OpenMetrics via `prom-client`; production requires the scrape bearer token |
| `GET /health` | Bootstrap/process liveness with config hash; deploy gate |
| `GET /ready` | JSON Redis/Supabase/queue checks with a 3-second response cache |
| `/internal/*`, `/admin/system-health` | Authenticated operational JSON, not metrics exposition |
| OTLP traces | Export to `TEMPO_ENDPOINT` + `/v1/traces`, default `http://tempo:4318` |
| Structured logs | Pino stdout with request/trace context when available |

HTTP metrics use method, route-pattern and status labels. The infra scrape
configuration adds `service=fieldtrack-api` and slot labels. Worker/queue,
API-key, retry-intent, DLQ and rate-limit metrics are defined in
`src/plugins/prometheus.ts`. Log correlation is available only when there is
an active recorded span; telemetry initialization is not proof of full coverage.

## Current infra boundaries

- Compose starts Prometheus, Grafana, Loki, Promtail, Alertmanager, blackbox,
  node-exporter and redis-exporter. A Tempo config exists but no Tempo service
  is declared in the monitoring compose file. The default trace target therefore
  needs a separately provisioned collector or a corrected compose configuration.
- Prometheus scrapes both API slots' `/metrics`; the inactive slot being down is
  expected. Routed `/health` is a blackbox HTTP probe, not direct metric scraping.
- The `api-ready` job currently tries to scrape JSON `/ready` as metrics. This
  cannot establish successful readiness from its `up` signal; use a proper probe.
- `SnapshotHealthDegraded` refers to a snapshot probe job that is not configured.
- `DeploymentFailure` uses filtered `up == 1` and needs an all-down/absent-series
  expression fix. SLO recording rules/alert thresholds differ from target SLOs.
- Grafana is configured for `/monitor/`, but the current nginx template has no
  Grafana proxy location. Its public UI is not connected by this configuration.
- Prometheus' compose command lacks exemplar-storage and remote-write-receiver
  flags expected by the Tempo/metric-link configuration. Only the Prometheus
  datasource is provisioned; do not assume Loki/Tempo exploration is connected.

## Operations

Inspect API logs, `/admin/system-health` and queue state before interpreting
scrape health as business readiness. `/ready` currently omits worker status from
its overall ready decision and its dependency probes have no explicit deadline.
The API's health endpoint does not check that migrations have been applied.

Use `METRICS_SCRAPE_TOKEN`, `TEMPO_ENDPOINT` and `SERVICE_NAME` from
[env-contract.md](env-contract.md). Keep secrets out of logs and rendered
configuration commits. The 2026-11-24 audit did not run live VPS/proxy/promtool
checks; Docker daemon was unavailable locally.
