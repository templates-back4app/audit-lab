#!/usr/bin/env bash
# Audit a backend configured the way a generated app arrives, apply the fixes it
# asks for, and audit it again.
#
#   ./run.sh
#
# Needs Docker and Node 22. The backend is destroyed and rebuilt every run.
set -euo pipefail
cd "$(dirname "$0")"

echo ""
echo "  [1/5] a backend set up the way these tools leave it"
docker compose down -v >/dev/null 2>&1 || true
docker compose up -d >/dev/null
docker compose restart parse >/dev/null      # it races mongo on a cold volume
node seed.mjs

echo ""
echo "  [2/5] the questions nobody told you to ask"
node audit.mjs

echo "  [3/5] applying what it asked for"
node harden.mjs
# client class creation is a server flag, not a database setting
docker compose stop parse >/dev/null
PARSE_SERVER_ALLOW_CLIENT_CLASS_CREATION=false docker compose up -d parse >/dev/null
for _ in $(seq 1 60); do
  curl -sf -o /dev/null -H 'X-Parse-Application-Id: demo-app' \
    http://127.0.0.1:1339/parse/classes/Patient?limit=0 && break
  sleep 0.5
done

echo ""
echo "  [4/5] the same questions, asked again"
node audit.mjs

echo "  [5/5] and the app still has to work"
node smoke.mjs
echo ""
