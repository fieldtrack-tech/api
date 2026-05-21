# FieldTrack API Reference

Implementation-aligned contract reference for the current API.

For generated OpenAPI, use:

- `GET /openapi.json`
- `GET /docs`

## Authentication Model

Supported auth methods:

- JWT bearer token:
  - `Authorization: Bearer <token>`
- API key (for allowed scopes only):
  - `X-API-Key: <key>`

Identity claims used by the API:

- `sub`
- `organization_id`
- `role` (`ADMIN` or `EMPLOYEE`)

## Standard Response Envelope

Success:

```json
{
  "success": true,
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "error": "Human readable message",
  "requestId": "uuid"
}
```

Common HTTP status codes:

- `200` success
- `201` created
- `202` accepted / queued
- `204` no content
- `400` validation/business rule error
- `401` unauthenticated
- `403` forbidden
- `404` not found
- `409` conflict
- `410` removed/deprecated endpoint
- `429` rate limited
- `500` internal error

Example typed error codes used in responses include values such as `VALIDATION_ERROR`, `INVALID_CREDENTIALS`, and route-specific domain codes.

## System Endpoints

- `GET /` service identity
- `GET /health` liveness
- `GET /ready` dependency readiness
- `GET /metrics` Prometheus/OpenMetrics
- `GET /openapi.json` OpenAPI spec
- `GET /docs` Swagger UI

## Auth Endpoints

### POST /auth/login

Body:

```json
{
  "email": "user@example.com",
  "password": "password"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "access_token": "...",
    "refresh_token": "...",
    "token_type": "bearer",
    "expires_in": 3600,
    "expires_at": 1741686400
  }
}
```

### GET /auth/me

Auth required.

Response:

```json
{
  "success": true,
  "data": {
    "id": "uuid-or-api-key-sub",
    "email": "user@example.com",
    "role": "ADMIN",
    "orgId": "organization-uuid"
  }
}
```

## Employee Endpoints

### Attendance

- `POST /attendance/check-in` (EMPLOYEE)
- `POST /attendance/check-out` (EMPLOYEE)
- `POST /attendance/:sessionId/recalculate` (authenticated, rate-limited)
- `GET /attendance/my-sessions?page&limit&status`
- `GET /attendance/org-sessions` is removed and returns `410`; use admin sessions endpoint.

Session status filter values:

- `all`
- `active`
- `recent`
- `inactive`

Example response item:

```json
{
  "id": "session-uuid",
  "employee_id": "employee-uuid",
  "organization_id": "org-uuid",
  "checkin_at": "2026-04-01T09:00:00.000Z",
  "checkout_at": null,
  "total_distance_km": null,
  "total_duration_seconds": null,
  "distance_recalculation_status": null,
  "created_at": "...",
  "updated_at": "..."
}
```

### Locations

- `POST /locations` (EMPLOYEE)
- `POST /locations/batch` (EMPLOYEE)
- `GET /locations/my-route?sessionId=<uuid>`

`/locations/my-route` accepts `sessionId` and legacy-compatible `session_id` query params.

Single-point request example:

```json
{
  "session_id": "session-uuid",
  "latitude": 28.6139,
  "longitude": 77.209,
  "accuracy": 12.5,
  "recorded_at": "2026-04-01T09:30:00.000Z"
}
```

### Employee Expenses

- `POST /expenses/receipt-upload-url` (EMPLOYEE)
- `POST /expenses` (EMPLOYEE)
- `GET /expenses/my?page&limit&status`

Employee expense status values:

- `all`
- `PENDING`
- `APPROVED`
- `REJECTED`
- `processed`

### Employee Dashboard/Profile

- `GET /dashboard/my-summary`
- `GET /profile/me`
- `GET /leaderboard`

## Expenses (Admin + Employee)

### Employee write/list

- `POST /expenses`
- `GET /expenses/my`

### Admin review/reporting

- `GET /admin/expenses`
- `PATCH /admin/expenses/:id`
- `GET /admin/expenses/summary`
- `GET /admin/expenses/export`

Review body example:

```json
{
  "status": "APPROVED"
}
```

## Admin Endpoints

All endpoints below require `ADMIN` role unless noted.

### Sessions and Employees

- `GET /admin/sessions`
- `GET /admin/sessions/:id/locations`
- `POST /admin/force-checkout`
- `GET /admin/employees`
- `POST /admin/employees`
- `GET /admin/employees/:id`
- `PATCH /admin/employees/:id`
- `PATCH /admin/employees/:id/status`
- `GET /admin/employees/:employeeId/profile`
- `GET /admin/search`

### Analytics and Dashboard

- `GET /admin/dashboard`
- `GET /admin/org-summary`
- `GET /admin/user-summary`
- `GET /admin/top-performers`
- `GET /admin/session-trend`
- `GET /admin/leaderboard`
- `GET /admin/monitoring/map`

Date range query params use `from` and `to` ISO datetime values.

### Monitoring, Queues, and System Ops

- `POST /admin/start-monitoring`
- `POST /admin/stop-monitoring`
- `GET /admin/monitoring-history`
- `GET /admin/events` (SSE stream)
- `GET /admin/queues`
- `POST /admin/queues/replay-distance-dlq`
- `GET /admin/retry-intents`
- `GET /admin/system-health`
- `GET /admin/audit-log`

### API Keys

- `POST /admin/api-keys`
- `GET /admin/api-keys`
- `PATCH /admin/api-keys/:id`
- `DELETE /admin/api-keys/:id`

API key routes require JWT auth and cannot be managed with API key auth itself.

### Webhooks

- `GET /admin/webhooks`
- `POST /admin/webhooks`
- `PATCH /admin/webhooks/:id`
- `DELETE /admin/webhooks/:id`
- `GET /admin/webhook-deliveries`
- `GET /admin/webhooks/logs`
- `POST /admin/webhook-deliveries/:id/retry`
- `POST /admin/webhooks/logs/:id/retry`
- `POST /admin/webhooks/:id/test`
- `GET /admin/webhook-dlq`
- `POST /admin/webhook-dlq/:id/retry`

Legacy aliases under `/webhooks*` exist for backward compatibility and are hidden from OpenAPI.

### Internal Admin Probes

- `GET /internal/metrics`
- `GET /internal/queues/status`
- `GET /internal/snapshot-health`
- `GET /internal/ready-deep`

## Rate Limit Notes

Route-level limits include:

- `POST /locations` and `POST /locations/batch`: 10 requests / 10 seconds per user key
- `POST /expenses`: 10 requests / 60 seconds per user key
- `POST /attendance/:sessionId/recalculate`: 5 requests / 60 seconds per user key

Additional global and security middleware limits are enforced by Fastify plugins.
