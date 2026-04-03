#!/usr/bin/env bash
# =============================================================================
# infra/scripts/render-alertmanager.sh
#
# Renders infra/alertmanager/alertmanager.yml (template) into
# infra/alertmanager/alertmanager.rendered.yml by substituting
# ${ALERTMANAGER_SLACK_WEBHOOK} from infra/.env.monitoring.
#
# MUST be run before `docker compose up` for the monitoring stack.
# Alertmanager does NOT support environment variables natively — rendering
# the config before container start is the only safe approach.
#
# Usage (from any directory):
#   bash infra/scripts/render-alertmanager.sh
#
# Exit codes:
#   0 — rendered file written successfully
#   1 — validation or rendering failure
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Resolve absolute paths relative to this script's location.
# This makes the script safe to call from any working directory.
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

ENV_FILE="${INFRA_DIR}/.env.monitoring"
TEMPLATE_FILE="${INFRA_DIR}/alertmanager/alertmanager.yml"
OUTPUT_FILE="${INFRA_DIR}/alertmanager/alertmanager.rendered.yml"

log_info()  { printf '[render-alertmanager] INFO  %s\n' "$*" >&2; }
log_error() { printf '[render-alertmanager] ERROR %s\n' "$*" >&2; }

# ---------------------------------------------------------------------------
# Pre-flight: ensure required tools exist
# ---------------------------------------------------------------------------
if ! command -v envsubst &>/dev/null; then
    log_error "envsubst not found. Install gettext (apt install gettext / yum install gettext)."
    exit 1
fi

# ---------------------------------------------------------------------------
# Validate env file
# ---------------------------------------------------------------------------
if [ ! -f "${ENV_FILE}" ]; then
    log_error "Env file not found: ${ENV_FILE}"
    log_error "This file must exist on the VPS and must NOT be committed to the repo."
    exit 1
fi

# Load env file via `source` under `set -a` so every assignment is exported.
# This correctly handles values containing special characters (e.g. https://).
# DO NOT replace this with `export $(grep ... | xargs)` — xargs splits on
# whitespace and breaks URLs, quoted strings, and any value with spaces.
set -a
# shellcheck source=/dev/null
source "${ENV_FILE}"
set +a

# Warn loudly if stale / removed variables are still present in the env file.
# FRONTEND_DOMAIN was removed from the env contract — its presence here is a
# sign the file is out of date and should be cleaned up on the VPS.
if [ -n "${FRONTEND_DOMAIN:-}" ]; then
    log_error "FRONTEND_DOMAIN is set in ${ENV_FILE} but is no longer part of the env contract."
    log_error "Remove that line from .env.monitoring on the VPS, then re-run this script."
    exit 1
fi

# ---------------------------------------------------------------------------
# Validate ALERTMANAGER_SLACK_WEBHOOK
# ---------------------------------------------------------------------------
if [ -z "${ALERTMANAGER_SLACK_WEBHOOK:-}" ]; then
    log_error "ALERTMANAGER_SLACK_WEBHOOK is not set or empty in ${ENV_FILE}."
    exit 1
fi

case "${ALERTMANAGER_SLACK_WEBHOOK}" in
    https://hooks.slack.com/*)
        : # valid prefix
        ;;
    *)
        log_error "ALERTMANAGER_SLACK_WEBHOOK does not start with 'https://hooks.slack.com/'."
        log_error "Value prefix: $(printf '%s' "${ALERTMANAGER_SLACK_WEBHOOK}" | cut -c1-30)..."
        exit 1
        ;;
esac

# ---------------------------------------------------------------------------
# Validate template file
# ---------------------------------------------------------------------------
if [ ! -f "${TEMPLATE_FILE}" ]; then
    log_error "Template file not found: ${TEMPLATE_FILE}"
    exit 1
fi

if ! grep -qF '${ALERTMANAGER_SLACK_WEBHOOK}' "${TEMPLATE_FILE}"; then
    log_error "Template file does not contain '\${ALERTMANAGER_SLACK_WEBHOOK}' placeholder."
    log_error "Check that ${TEMPLATE_FILE} is the correct template."
    exit 1
fi

# ---------------------------------------------------------------------------
# Render: substitute ONLY ALERTMANAGER_SLACK_WEBHOOK (avoid clobbering any
# other ${...} placeholders that Alertmanager Go template syntax might use).
# ---------------------------------------------------------------------------
log_info "Rendering ${TEMPLATE_FILE} -> ${OUTPUT_FILE}"

envsubst '${ALERTMANAGER_SLACK_WEBHOOK}' \
    < "${TEMPLATE_FILE}" \
    > "${OUTPUT_FILE}"

# ---------------------------------------------------------------------------
# Post-render sanity check: no unsubstituted placeholder must remain
# ---------------------------------------------------------------------------
if grep -qF '${ALERTMANAGER_SLACK_WEBHOOK}' "${OUTPUT_FILE}"; then
    log_error "Rendered file still contains the unsubstituted placeholder. Aborting."
    rm -f "${OUTPUT_FILE}"
    exit 1
fi

# Verify the rendered URL looks real (not a placeholder stub)
if grep -qF 'YOUR/WEBHOOK/URL' "${OUTPUT_FILE}"; then
    log_error "Rendered file contains placeholder stub URL. Check your .env.monitoring."
    rm -f "${OUTPUT_FILE}"
    exit 1
fi

# Print a redacted preview so operators can confirm the URL was injected.
WEBHOOK_PREVIEW=$(grep 'api_url' "${OUTPUT_FILE}" | head -1 | sed 's|\(https://hooks.slack.com/services/[^/]*/[^/]*/\).*|\1***|')
log_info "Webhook preview (redacted): ${WEBHOOK_PREVIEW}"
log_info "Success. Rendered file: ${OUTPUT_FILE}"
