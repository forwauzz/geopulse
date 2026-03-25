#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <BASE_URL> <MARKETING_INGEST_KEY>"
  echo "Example: $0 http://localhost:3000 supersecret"
  exit 1
fi

BASE_URL="$1"
INGEST_KEY="$2"
EVENT_ID="$(python - <<'PY'
import uuid
print(uuid.uuid4())
PY
)"

curl -sS -X POST "${BASE_URL%/}/api/internal/marketing/events" \
  -H "Authorization: Bearer ${INGEST_KEY}" \
  -H 'Content-Type: application/json' \
  --data "{\"eventId\":\"${EVENT_ID}\",\"eventName\":\"scan_started\",\"utmSource\":\"x\",\"utmCampaign\":\"phase2-smoke\",\"landingPath\":\"/\"}" \
  | cat

echo
