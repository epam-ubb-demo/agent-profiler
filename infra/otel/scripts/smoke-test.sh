#!/usr/bin/env bash
# Smoke test for the OTel Gateway — sends a test OTLP trace and verifies acceptance.
# Usage: ./smoke-test.sh [endpoint]
#   endpoint  Base URL of the OTel Collector (default: http://localhost:4318)
#
# The script sends a minimal OTLP/HTTP JSON trace payload containing GenAI
# semantic convention attributes and checks the HTTP response code.
set -euo pipefail
shopt -s inherit_errexit

ENDPOINT="${1:-http://localhost:4318}"
TRACE_ID=$(openssl rand -hex 16)
SPAN_ID=$(openssl rand -hex 8)
NOW_NS="$(date +%s)000000000"
END_NS="$(date +%s)500000000"

echo "🔍 Sending test trace to ${ENDPOINT}/v1/traces..."
echo "   Trace ID: ${TRACE_ID}"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  "${ENDPOINT}/v1/traces" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "resourceSpans": [{
      "resource": {
        "attributes": [
          {"key": "service.name", "value": {"stringValue": "smoke-test"}},
          {"key": "service.namespace", "value": {"stringValue": "agent-profiler"}}
        ]
      },
      "scopeSpans": [{
        "scope": {"name": "smoke-test"},
        "spans": [{
          "traceId": "'"${TRACE_ID}"'",
          "spanId": "'"${SPAN_ID}"'",
          "name": "invoke_agent",
          "kind": 1,
          "startTimeUnixNano": "'"${NOW_NS}"'",
          "endTimeUnixNano": "'"${END_NS}"'",
          "attributes": [
            {"key": "gen_ai.operation.name", "value": {"stringValue": "invoke_agent"}},
            {"key": "gen_ai.request.model", "value": {"stringValue": "gpt-4o"}},
            {"key": "gen_ai.usage.input_tokens", "value": {"intValue": "100"}},
            {"key": "gen_ai.usage.output_tokens", "value": {"intValue": "50"}},
            {"key": "github.copilot.cost", "value": {"doubleValue": 0.005}},
            {"key": "enduser.pseudo.id", "value": {"stringValue": "smoke-test-user"}}
          ],
          "status": {"code": 1}
        }]
      }]
    }]
  }')

if [ -z "${HTTP_CODE}" ]; then
  echo "❌ Failed to connect to ${ENDPOINT}"
  exit 1
fi

if [ "${HTTP_CODE}" -eq 200 ]; then
  echo "✅ Trace accepted (HTTP ${HTTP_CODE})"
  echo "   Look for trace ID ${TRACE_ID} in Application Insights"
  exit 0
else
  echo "❌ Trace rejected (HTTP ${HTTP_CODE})"
  exit 1
fi
