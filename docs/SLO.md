# FieldTrack Service Level Objectives (SLOs)

This document defines the service-level objectives for FieldTrack production services. Alert rules are implemented in the standalone infra repository.

Source audit: 2026-11-24. These are targets, not measured guarantees. Alert
coverage differs from the targets and currently has readiness/snapshot/deployment
expression gaps; see `OBSERVABILITY_ARCHITECTURE.md` for the implemented boundaries.

---

## Definitions

| Term | Meaning |
|---|---|
| **SLO** | Service Level Objective — the target reliability level |
| **SLI** | Service Level Indicator — the metric used to measure the objective |
| **Error Budget** | Allowable downtime / failure rate before the SLO is violated |
| **Burn Rate** | How fast the error budget is being consumed relative to normal |

---

## SLO 1 — API Availability

| | |
|---|---|
| **SLI** | Routed HTTP liveness: `probe_success{job="fieldtrack-route-health"}`; container `up` is a separate scrape-health signal |
| **Target** | 99.9% monthly availability |
| **Error budget** | 43.2 minutes per 30-day window |
| **Window** | 30-day rolling |

### Rationale
Sub-1h monthly downtime budget is appropriate for a B2B scheduling SaaS.  Breaching this SLO triggers an incident review.

---

## SLO 2 — API Latency

| | |
|---|---|
| **SLI** | p95 HTTP request duration (measured via `http_request_duration_seconds_bucket`) |
| **Target p95** | < 500 ms |
| **Target p99** | < 2 000 ms |
| **Error budget** | 5% of requests may exceed the p95 threshold |
| **Window** | 5-minute rolling (monitored), 1-hour burn rate (alerting) |

### Rationale
500 ms p95 ensures interactive response times for connected clients.  The 2 s p99 provides a safety margin for background operations (bulk import, report generation) without breaching the user-visible latency SLO.

---

## SLO 3 — API Error Rate

| | |
|---|---|
| **SLI** | Ratio of 5xx responses to total HTTP requests |
| **Target** | < 1% 5xx error rate |
| **Error budget** | 1% of requests may fail with 5xx |
| **Window** | 5-minute rolling |

### Rationale
1% is tight but achievable given the stateless Fastify API + managed Supabase backend.  4xx errors (client mistakes) are excluded from the SLO.

---

## SLO 4 — Webhook Delivery

| | |
|---|---|
| **SLI** | Fraction of webhook deliveries that eventually succeed within the retry window |
| **Target** | 99% of deliveries succeed within 1 hour (across all retry attempts) |
| **Error budget** | 1% permanent failure rate |
| **Window** | 1-hour rolling |

### Retry schedule (for reference)

| Attempt | Delay from previous |
|---|---|
| 1 | Immediate |
| 2 | 1–1.2 min (+0–20% jitter) |
| 3 | 5–6 min (+0–20% jitter) |
| 4 | 15–18 min (+0–20% jitter) |
| 5 | 60–72 min (+0–20% jitter) |
| After attempt 5 | Moved to Dead-Letter Queue |

The full retry schedule is **81–97.2 minutes**, plus delivery/queue time, and
therefore does not fit the proposed one-hour target. Current webhook alerts
measure failure/attempt metrics rather than an end-to-end one-hour delivery SLI.

### Rationale
Webhook delivery failures directly affect customer integrations.  The DLQ captures permanent failures for manual replay; the SLO tracks the fraction that need manual intervention.

---

## SLO 5 — Dead-Letter Queue Depth

| | |
|---|---|
| **SLI** | `dlq_size{queue="webhook-delivery-dlq"}` |
| **Target** | DLQ depth stays below 100 jobs |
| **Error budget** | DLQ may transiently spike above 100 for < 30 minutes |
| **Window** | 30-minute sustained |

### Rationale
A DLQ backlog above 100 indicates a systemic delivery failure (bad endpoint configuration, network partition) requiring operator attention.  Transient spikes under 30 minutes are tolerated.

---

## Error Budget Alert Strategy

The currently implemented burn alerts use these single long-window conditions.
Short-window conjunctions/multi-window confirmation are not implemented:

| Window | Burn rate threshold | Severity | Action |
|---|---|---|---|
| 1h, sustained 5m | >14% error rate (14× a 1% budget) | critical | Investigate/page |
| 6h, sustained 15m | >6% error rate (6× a 1% budget) | warning | Engineering review |

---

## Alert → SLO Mapping

| Alert name | SLO | Severity |
|---|---|---|
| `FieldTrackHighErrorRate` | SLO 3 | critical |
| `FieldTrackSloErrorBudgetBurnFast` | SLO 3 | critical |
| `FieldTrackSloErrorBudgetBurnSlow` | SLO 3 | warning |
| `FieldTrackHighLatency` | SLO 2 | warning |
| `FieldTrackLatencyP99High` | SLO 2 p99 | warning |
| `WebhookDeliveryFailureRateHigh` | SLO 4 | critical |
| `WebhookDeliveryFailureRateWarning` | SLO 4 | warning |
| `WebhookDlqGrowing` | SLO 5 | warning |
| `WebhookCircuitBreakerOpened` | SLO 4 | warning |
| `DeploymentFailure` | SLO 1 | critical |
| `ReadinessCheckFailing` | SLO 1 | critical |

---

## Review Cadence

Implementation distinctions to review: high-error alert is >5% for 2m; p95
latency alert is >1s for 5m (not the 500ms target); p99 is >2s for 10m. The
`api_error_budget_remaining_30d` recording rule currently returns success ratio,
not remaining normalized error budget. `DeploymentFailure` uses filtered `up`
series and needs correction for an all-down state. The `api-ready` job attempts
to scrape JSON as metrics, and the snapshot alert has no configured probe job.

- **Monthly**: review error budget consumption; adjust SLO thresholds if engineering velocity is affected.
- **Post-incident**: update error budget retroactively; add alert tuning if a regression was missed.
- **Quarterly**: revisit SLO targets vs. customer expectations.
